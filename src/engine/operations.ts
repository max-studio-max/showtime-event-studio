/** Guest service, staffing, schedule and campaign maths. All outputs are modeled ranges from declared assumptions. */
import type { CampaignLine, GuestCohort, LineupSlot, ScheduleBlock, StaffShift, StationAssumption } from '../domain/types';

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (m: number) => {
  const d = (((m % 1440) + 1440) % 1440);
  return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
};

/** Duration in minutes, treating an end before the start as crossing midnight. */
export const spanMin = (start: string, end: string) => {
  const d = toMin(end) - toMin(start);
  return d < 0 ? d + 1440 : d;
};

export interface QueueEstimate {
  kind: StationAssumption['kind'];
  stations: number;
  peakDemandPerHour: number;
  capacityPerHour: number;
  utilisation: number | null;
  maxWaitMin: number | null; // fluid approximation; null = no stations
  staffNeeded: number;
  note: string;
}

/**
 * Deterministic fluid queue: guests using a station arrive uniformly over the
 * arrival window. If demand exceeds service rate, the backlog grows linearly
 * and the last arrival waits backlog / rate. Not a crowd-safety model.
 */
export function estimateQueue(a: StationAssumption, stations: number, guests: number, arrivalWindowMin: number): QueueEstimate {
  const users = guests * a.usageShare;
  const windowH = Math.max(arrivalWindowMin, 1) / 60;
  const demand = users / windowH;
  const cap = stations * a.servedPerHourPerStation;
  const staffNeeded = stations * a.staffPerStation;
  if (stations === 0) return { kind: a.kind, stations, peakDemandPerHour: demand, capacityPerHour: 0, utilisation: null, maxWaitMin: null, staffNeeded, note: users > 0 ? 'No stations placed in the scene' : 'No demand' };
  const util = demand / cap;
  const backlog = Math.max(0, users - cap * windowH);
  const maxWaitMin = (backlog / cap) * 60;
  return { kind: a.kind, stations, peakDemandPerHour: demand, capacityPerHour: cap, utilisation: util, maxWaitMin, staffNeeded, note: util > 1 ? 'Demand exceeds declared throughput' : 'Within declared throughput' };
}

export const totalGuests = (cohorts: GuestCohort[]) => cohorts.reduce((s, c) => s + (c.verified ?? c.projected), 0);

/** Cost of staff shifts; null when any rate is unknown. */
export function staffCost(shifts: StaffShift[]): { knownMinor: number; missing: number; hours: number } {
  let knownMinor = 0;
  let missing = 0;
  let hours = 0;
  for (const s of shifts) {
    const h = spanMin(s.start, s.end) / 60;
    hours += h;
    if (s.rateMinorPerHour == null) missing++;
    else knownMinor += Math.round(h * s.rateMinorPerHour);
  }
  return { knownMinor, missing, hours };
}

export interface Overlap {
  a: string;
  b: string;
}

/** Lineup set windows that overlap within the same session. */
export function lineupOverlaps(slots: LineupSlot[]): Overlap[] {
  const out: Overlap[] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const x = slots[i];
      const y = slots[j];
      if (x.sessionId !== y.sessionId) continue;
      const xs = toMin(x.startLocal);
      const ys = toMin(y.startLocal);
      if (xs < ys + y.durationMin && ys < xs + x.durationMin) out.push({ a: x.id, b: y.id });
    }
  }
  return out;
}

/** Blocks that start before a block they depend on has finished. */
export function scheduleConflicts(blocks: ScheduleBlock[]): string[] {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const out: string[] = [];
  for (const b of blocks) {
    for (const d of b.dependsOn ?? []) {
      const dep = byId.get(d);
      if (!dep) out.push(`${b.label} depends on a removed block`);
      else if (dep.sessionId === b.sessionId && toMin(b.start) < toMin(dep.end)) out.push(`${b.label} starts at ${b.start} before ${dep.label} ends at ${dep.end}`);
    }
  }
  return out;
}

export interface ChannelMetrics {
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  cpa: number | null;
  roas: number | null;
  conversionRate: number | null;
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

/** Metrics from *observed* imported data only. Revenue basis for ROAS = attributed gross ticket revenue. */
export function channelMetrics(o: NonNullable<CampaignLine['observed']>): ChannelMetrics {
  return {
    cpm: div(o.spendMinor * 1000, o.impressions),
    cpc: div(o.spendMinor, o.clicks),
    ctr: div(o.clicks, o.impressions),
    cpa: div(o.spendMinor, o.conversions),
    roas: div(o.revenueMinor, o.spendMinor),
    conversionRate: div(o.conversions, o.clicks),
  };
}

/** Modeled tickets from planned spend — only when the user declared an explicit conversion model. */
export function modeledTickets(line: CampaignLine): number | null {
  if (!line.model || line.plannedMinor == null || line.model.cpcMinor <= 0) return null;
  const clicks = line.plannedMinor / line.model.cpcMinor;
  return Math.floor(clicks * (line.model.clickToTicketPct / 100));
}

export function buildUtmUrl(base: string, utm: CampaignLine['utm']): string | null {
  try {
    const u = new URL(base);
    u.searchParams.set('utm_source', utm.source);
    u.searchParams.set('utm_medium', utm.medium);
    u.searchParams.set('utm_campaign', utm.campaign);
    if (utm.content) u.searchParams.set('utm_content', utm.content);
    return u.toString();
  } catch {
    return null;
  }
}

/** Minimal CSV parser for metric imports (handles quoted fields). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

export function toCsv(rows: (string | number | null)[][]): string {
  return rows.map((r) => r.map((c) => (c == null ? '' : /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\n');
}

export interface MetricRow {
  key: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spendMinor: number;
  revenueMinor: number;
}

/**
 * Parse an ad-platform CSV export into rows with a stable de-duplication key:
 * date + campaign/ad set/ad identifiers when present, otherwise the row's full
 * content. Re-importing the same export adds nothing.
 */
export function parseMetricRows(text: string): MetricRow[] | string {
  const rows = parseCsv(text.trim());
  if (rows.length < 2) return 'CSV needs a header row and at least one data row';
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const col = (...names: string[]) => h.findIndex((x) => names.includes(x));
  const need = ['impressions', 'clicks', 'conversions', 'spend'];
  const missing = need.filter((n) => col(n) < 0);
  if (missing.length) return `Missing column(s): ${missing.join(', ')} (revenue optional)`;
  const idCols = [col('date', 'day', 'reporting starts'), col('campaign', 'campaign name', 'campaign id'), col('ad set', 'ad set name', 'ad group', 'ad set id'), col('ad', 'ad name', 'ad id')].filter((i) => i >= 0);
  const val = (r: string[], n: string, money = false) => {
    const v = Number((r[col(n)] ?? '').replace(/[$,\s]/g, ''));
    return Number.isFinite(v) ? (money ? Math.round(v * 100) : v) : 0;
  };
  return rows.slice(1).map((r) => ({
    key: idCols.length ? idCols.map((i) => (r[i] ?? '').trim().toLowerCase()).join('|') : `row:${r.map((c) => c.trim()).join('|')}`,
    impressions: val(r, 'impressions'),
    clicks: val(r, 'clicks'),
    conversions: val(r, 'conversions'),
    spendMinor: val(r, 'spend', true),
    revenueMinor: col('revenue') >= 0 ? val(r, 'revenue', true) : 0,
  }));
}

/** Add only rows whose key has not been imported before. */
export function mergeObserved(existing: CampaignLine['observed'], rows: MetricRow[], source: string, now: string): { observed: NonNullable<CampaignLine['observed']>; added: number; duplicates: number } {
  const seen = new Set(existing?.rowKeys ?? []);
  const base = existing ?? { impressions: 0, clicks: 0, conversions: 0, spendMinor: 0, revenueMinor: 0, importedAt: now, source, rowKeys: [] };
  const out = { ...base, rowKeys: [...(base.rowKeys ?? [])] };
  let added = 0;
  let duplicates = 0;
  for (const r of rows) {
    if (seen.has(r.key)) {
      duplicates++;
      continue;
    }
    seen.add(r.key);
    out.rowKeys.push(r.key);
    out.impressions += r.impressions;
    out.clicks += r.clicks;
    out.conversions += r.conversions;
    out.spendMinor += r.spendMinor;
    out.revenueMinor += r.revenueMinor;
    added++;
  }
  if (added) {
    out.importedAt = now;
    out.source = existing && existing.source !== source ? `${existing.source}; ${source}` : source;
  }
  return { observed: out, added, duplicates };
}
