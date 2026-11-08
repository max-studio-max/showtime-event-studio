/**
 * The dependency graph. Every module's numbers come from here, computed from
 * the one shared event, so a change anywhere propagates everywhere:
 * scene → seating → ticket inventory → revenue; lineup/procurement/staff/
 * campaign → cost lines → totals; guest forecast → queues → staffing.
 */
import { channelById } from '../data/channels';
import { genericProducts } from '../data/catalog';
import { venueById, venueEvidence } from '../data/venues';
import { availableTickets, computeFinance, type CapacityResult, type FinanceInputs, type FinanceResult } from '../engine/finance';
import { estimateQueue, lineupOverlaps, scheduleConflicts, staffCost, totalGuests, type QueueEstimate } from '../engine/operations';
import { effectiveStatus, findConflicts, offerView } from '../engine/provenance';
import { analyzeScene, patchIssues, type SceneAnalysis } from '../engine/sceneAnalysis';
import type { BudgetLine, PriceOffer, Product, ShowEvent, SourceEvidence, TalentAct, Venue, VenueConfiguration, VerificationStatus } from './types';

export interface WorkspaceData {
  products: Product[];
  offers: PriceOffer[];
  acts: TalentAct[];
  evidence: SourceEvidence[]; // user-recorded evidence, incl. reviews and contradicting sources
}

export interface CrossIssue {
  module: 'venue' | 'studio' | 'stagecraft' | 'spotlight' | 'catalog' | 'finance' | 'service' | 'production' | 'campaign';
  level: 'potential_conflict' | 'needs_review' | 'info';
  message: string;
}

export interface Derived {
  venue: Venue | null;
  config: VenueConfiguration | null;
  venueCapacity: { value: number | null; status: VerificationStatus; conflicting: boolean };
  analysis: SceneAnalysis;
  layoutSellable: number | null;
  capacity: CapacityResult;
  costLines: BudgetLine[];
  financeInputs: FinanceInputs;
  finance: FinanceResult;
  guests: number;
  queues: QueueEstimate[];
  staff: { knownMinor: number; missing: number; hours: number; requiredByStations: number; rostered: number };
  issues: CrossIssue[];
  readiness: { done: number; total: number; items: { label: string; ok: boolean }[] };
}

export const allEvidence = (ws: WorkspaceData) => [...venueEvidence, ...ws.evidence];
export const allProducts = (ws: WorkspaceData) => [...genericProducts, ...ws.products];

/** Venue capacity for the chosen configuration with its effective provenance status. */
export function venueCapacityFor(config: VenueConfiguration | null, ws: WorkspaceData, now: Date): Derived['venueCapacity'] {
  if (!config) return { value: null, status: 'unavailable', conflicting: false };
  const ev = allEvidence(ws).filter((e) => config.evidenceIds.includes(e.id) || (e.entityId === config.id && e.fieldPath === 'capacity'));
  const capacityEv = ev.filter((e) => /capacity/.test(e.fieldPath) && !e.supersededBy);
  // A user-recorded evidence row against the same field participates in conflict detection.
  const normalized = capacityEv.map((e) => ({ ...e, entityId: config.id, fieldPath: 'capacity' }));
  const conflicts = findConflicts(normalized);
  if (conflicts.length) {
    // Never average: use the most conservative figure and mark it contradicted until resolved.
    const vals = conflicts[0].values.map((v) => Number(v.value)).filter(Number.isFinite);
    return { value: vals.length ? Math.min(...vals) : null, status: 'contradicted', conflicting: true };
  }
  const primary = capacityEv[0];
  if (!primary || config.capacity == null) return { value: null, status: 'unavailable', conflicting: false };
  const reviewed = ws.evidence.find((e) => e.fieldPath === `review:${primary.id}`);
  const status = reviewed ? 'verified_authoritative' : effectiveStatus(primary.verificationStatus, primary.retrievedAt, 'venue', now);
  return { value: config.capacity, status, conflicting: false };
}

function rentalMultiplier(o: PriceOffer, days: number): number {
  if (o.kind === 'buy') return 1;
  switch (o.basis) {
    case 'per day':
      return Math.max(days, o.minRentalDays ?? 1);
    case 'per week':
      return Math.ceil(days / 7);
    case 'per weekend':
      return Math.ceil(days / 3);
    default:
      return 1;
  }
}

/** Cost lines contributed by other modules; never stored, always recomputed. */
export function derivedCostLines(ev: ShowEvent, ws: WorkspaceData, venue: Venue | null, now: Date): BudgetLine[] {
  const out: BudgetLine[] = [];
  const cur = ev.currency;
  const manualVenue = ev.budgetLines.some((b) => b.category === 'venue');
  if (venue && !manualVenue) {
    const rate = venue.publishedRates[0];
    out.push({
      id: `d-venue-${venue.id}`,
      category: 'venue',
      label: `${venue.space} rental`,
      amountMinor: rate ? rate.amountMinor : null,
      currency: rate ? rate.currency : cur,
      basis: 'fixed',
      quantity: ev.sessions.length,
      state: 'estimated',
      source: rate ? 'published' : 'assumption',
      sourceNote: rate ? `Published ${rate.indicative ? 'indicative' : ''} rate ${rate.basis} — not a quote` : 'No published rate — request a quote (add a private venue line to override)',
      derivedFrom: { module: 'venue', refId: venue.id },
    });
  }
  for (const s of ev.lineup) {
    const act = ws.acts.find((a) => a.id === s.actId);
    out.push({ id: `d-talent-${s.id}`, category: 'talent', label: `Talent: ${act?.stageName ?? 'unknown act'}`, amountMinor: s.feeMinor, currency: cur, basis: 'fixed', quantity: 1, state: s.inquiry.state === 'contracted' ? 'committed' : 'quoted', source: s.feeMinor == null ? 'assumption' : 'private_quote', sourceNote: s.feeMinor == null ? 'Fee not yet quoted' : 'Organizer-entered quote', derivedFrom: { module: 'spotlight', refId: s.id } });
  }
  for (const p of ev.procurement) {
    if (p.ownership === 'venue_supplied' || p.ownership === 'organizer_owned') continue; // no cost, prevents double counting
    const product = allProducts(ws).find((x) => x.id === p.productId);
    const offer = ws.offers.find((o) => o.id === p.offerId);
    const view = offer ? offerView(offer, now) : null;
    const usable = offer && view?.displayable && offer.amountMinor != null;
    out.push({
      id: `d-proc-${p.id}`,
      category: 'equipment',
      label: `${p.ownership === 'buy' ? 'Buy' : 'Rent'}: ${product?.name ?? 'item'} × ${p.quantity}`,
      amountMinor: usable ? offer!.amountMinor! * rentalMultiplier(offer!, p.rentalDays) : null,
      currency: offer?.currency ?? cur,
      basis: 'fixed',
      quantity: p.quantity,
      state: offer?.privateQuote ? 'quoted' : 'estimated',
      source: offer?.privateQuote ? 'private_quote' : 'published',
      sourceNote: !offer ? 'No offer selected — request quote' : view!.label + ` · ${offer.vendor}`,
      derivedFrom: { module: 'catalog', refId: p.id },
    });
  }
  for (const c of ev.campaign) {
    const ch = channelById(c.channelId);
    const amt = c.invoicedMinor ?? c.committedMinor ?? c.plannedMinor;
    out.push({ id: `d-camp-${c.id}`, category: 'marketing', label: `Promotion: ${ch?.name ?? c.channelId}`, amountMinor: amt, currency: cur, basis: 'fixed', quantity: 1, state: c.invoicedMinor != null ? 'paid' : c.committedMinor != null ? 'committed' : 'estimated', source: c.invoicedMinor != null ? 'invoice' : 'assumption', sourceNote: c.invoicedMinor != null ? 'Actual invoice' : c.committedMinor != null ? 'Committed spend' : 'Planned spend', derivedFrom: { module: 'campaign', refId: c.id } });
  }
  for (const s of ev.staff) {
    const sc = staffCost([s]);
    out.push({ id: `d-staff-${s.id}`, category: 'staffing', label: `Staff: ${s.role}${s.person ? ` (${s.person})` : ''} ${sc.hours.toFixed(1)} h`, amountMinor: s.rateMinorPerHour == null ? null : sc.knownMinor, currency: cur, basis: 'fixed', quantity: 1, state: 'estimated', source: 'assumption', sourceNote: s.rateMinorPerHour == null ? 'Rate not set' : 'Hours × rate', derivedFrom: { module: 'service', refId: s.id } });
  }
  return out;
}

export function deriveEvent(ev: ShowEvent, ws: WorkspaceData, now = new Date()): Derived {
  const venue = venueById(ev.venueId);
  const config = venue?.configurations.find((c) => c.id === ev.venueConfigId) ?? null;
  const venueCapacity = venueCapacityFor(config, ws, now);
  const analysis = analyzeScene(ev.scene);
  const hasSeats = ev.scene.objects.some((o) => o.kind === 'seat_block' && !o.hidden);
  const standingConfig = config?.kind === 'standing' || config?.kind === 'reception';
  const layoutSellable = hasSeats ? analysis.seating.usable.length : standingConfig ? analysis.standingCapacityModel : null;
  const holds = ev.holds.comps + ev.holds.accessible + ev.holds.production;
  const capacity = availableTickets({ venueCapacity: venueCapacity.value, venueCapacityStatus: venueCapacity.status, layoutSellable, holds });

  const costLines = [...ev.budgetLines, ...derivedCostLines(ev, ws, venue, now)];
  const financeInputs: FinanceInputs = { currency: ev.currency, capacity, tiers: ev.ticketTiers, assumptions: ev.assumptions, costs: costLines, revenue: ev.revenueLines, fxRates: ev.fxRates };
  const finance = computeFinance(financeInputs);

  // Guests: explicit cohorts when entered, otherwise the base-case attendance.
  const cohortGuests = totalGuests(ev.cohorts);
  const guests = cohortGuests > 0 ? cohortGuests : finance.cases?.base.attendance ?? 0;
  const arrival = Math.max(...ev.cohorts.map((c) => c.arrivalWindowMin), 30);
  const queues = ev.stationAssumptions.map((a) => estimateQueue(a, ev.scene.objects.filter((o) => o.kind === a.kind && !o.hidden).length, guests, arrival));
  const sc = staffCost(ev.staff);
  const staff = { ...sc, requiredByStations: queues.reduce((s, q) => s + q.staffNeeded, 0), rostered: ev.staff.length };

  const issues: CrossIssue[] = [];
  for (const i of analysis.issues) issues.push({ module: 'studio', level: i.level, message: i.message });
  for (const p of patchIssues(ev.scene.objects)) issues.push({ module: 'stagecraft', level: 'needs_review', message: p });
  if (!venue) issues.push({ module: 'venue', level: 'info', message: 'No venue selected' });
  if (venueCapacity.conflicting) issues.push({ module: 'venue', level: 'potential_conflict', message: 'Venue capacity sources disagree — using the lower figure until the venue confirms' });
  if (capacity.exceedsVenue) issues.push({ module: 'finance', level: 'potential_conflict', message: `Planned layout (${layoutSellable}) exceeds the venue capacity (${venueCapacity.value}); sales are capped at the venue figure` });
  if (venue) {
    const stage = ev.scene.objects.find((o) => o.kind === 'stage_deck');
    if (stage && stage.dimsSource !== 'verified') issues.push({ module: 'venue', level: 'needs_review', message: 'Stage dimensions are user-proposed — requires venue confirmation' });
    if (stage && venue.stage.widthM && (stage.size[0] > venue.stage.widthM + 1e-6 || stage.size[2] > (venue.stage.depthM ?? Infinity) + 1e-6)) issues.push({ module: 'venue', level: 'potential_conflict', message: 'Stage exceeds the venue’s published stage dimensions — requires venue confirmation' });
    if (ev.venueBooking.state !== 'confirmed') issues.push({ module: 'venue', level: 'info', message: `Venue booking state: ${ev.venueBooking.state} — not confirmed` });
  }
  for (const o of lineupOverlaps(ev.lineup)) {
    const n = (id: string) => ws.acts.find((a) => a.id === ev.lineup.find((s) => s.id === id)?.actId)?.stageName ?? 'act';
    issues.push({ module: 'spotlight', level: 'potential_conflict', message: `Set windows overlap: ${n(o.a)} and ${n(o.b)}` });
  }
  for (const s of ev.lineup) {
    const act = ws.acts.find((a) => a.id === s.actId);
    if (act && effectiveStatus(act.status, act.lastChecked, 'talent', now) === 'stale') issues.push({ module: 'spotlight', level: 'needs_review', message: `${act.stageName}: booking route not checked in 90 days — re-verify before contacting` });
    if (!s.riderReceived) issues.push({ module: 'stagecraft', level: 'needs_review', message: `${act?.stageName ?? 'Act'}: technical rider not received — requirements unconfirmed` });
  }
  for (const c of scheduleConflicts(ev.schedule)) issues.push({ module: 'production', level: 'potential_conflict', message: c });
  for (const q of queues) if (q.utilisation != null && q.utilisation > 1) issues.push({ module: 'service', level: 'needs_review', message: `${q.kind}: modeled peak demand ${Math.round(q.peakDemandPerHour)}/h exceeds declared throughput ${q.capacityPerHour}/h (max wait ≈ ${Math.round(q.maxWaitMin ?? 0)} min)` });
  if (staff.rostered < staff.requiredByStations) issues.push({ module: 'service', level: 'needs_review', message: `Stations need ${staff.requiredByStations} staff by declared ratios; ${staff.rostered} rostered` });
  for (const w of finance.warnings) issues.push({ module: 'finance', level: 'needs_review', message: w });

  const items = [
    { label: 'Venue space selected', ok: !!venue },
    { label: 'Venue booking confirmed', ok: ev.venueBooking.state === 'confirmed' },
    { label: 'Ticket inventory computable', ok: capacity.available != null },
    { label: 'Ticket inventory certified by verified venue capacity', ok: capacity.certified },
    { label: 'All cost lines priced', ok: finance.cases?.base.costComplete ?? false },
    { label: 'No scene conflicts', ok: !analysis.issues.some((i) => i.level === 'potential_conflict') },
    { label: 'Lineup contracted', ok: ev.lineup.length > 0 && ev.lineup.every((s) => s.inquiry.state === 'contracted') },
    { label: 'Run of show drafted', ok: ev.cues.length > 0 },
    { label: 'Staff rostered to declared ratios', ok: staff.rostered >= staff.requiredByStations && staff.rostered > 0 },
  ];
  return { venue, config, venueCapacity, analysis, layoutSellable, capacity, costLines, financeInputs, finance, guests, queues, staff, issues, readiness: { done: items.filter((i) => i.ok).length, total: items.length, items } };
}
