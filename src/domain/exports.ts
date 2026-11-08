/** Operational exports, all generated from the live event and scene (AC-14). */
import { channelById } from '../data/channels';
import { allProducts, type Derived, type WorkspaceData } from './derive';
import type { ShowEvent } from './types';
import { footprintOf } from '../engine/geometry';
import { formatMoney } from '../engine/money';
import { inputList } from '../engine/sceneAnalysis';
import { parseCsv, toCsv } from '../engine/operations';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const LAYER_FILL: Record<string, string> = { structure: '#8a8f98', stage: '#3a3346', audio: '#2f6fd6', lighting: '#e0a526', video: '#7b4fd6', seating: '#5d7a63', service: '#c2593a', zone: '#2aa198', decor: '#a0786a' };

/** Orthographic top projection of the scene as SVG (plan / stage plot). */
export function planSvg(ev: ShowEvent, d: Derived, opts: { stageOnly?: boolean; title?: string } = {}): string {
  const s = ev.scene;
  const stage = s.objects.find((o) => o.kind === 'stage_deck');
  const focus = opts.stageOnly && stage ? { w: stage.size[0] + 6, d: stage.size[2] + 6, cx: stage.position[0], cz: stage.position[2] } : { w: s.room.widthM, d: s.room.depthM, cx: 0, cz: 0 };
  const scale = 900 / Math.max(focus.w, focus.d);
  const W = focus.w * scale;
  const H = focus.d * scale;
  const tx = (x: number) => (x - focus.cx + focus.w / 2) * scale;
  const tz = (z: number) => (z - focus.cz + focus.d / 2) * scale;
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#f7f4ee" stroke="#333" stroke-width="2"/>`);
  for (let g = Math.ceil(focus.cx - focus.w / 2); g < focus.cx + focus.w / 2; g++) parts.push(`<line x1="${tx(g)}" y1="0" x2="${tx(g)}" y2="${H}" stroke="#e4ddd0" stroke-width="${g % 5 === 0 ? 1.2 : 0.5}"/>`);
  for (let g = Math.ceil(focus.cz - focus.d / 2); g < focus.cz + focus.d / 2; g++) parts.push(`<line x1="0" y1="${tz(g)}" x2="${W}" y2="${tz(g)}" stroke="#e4ddd0" stroke-width="${g % 5 === 0 ? 1.2 : 0.5}"/>`);
  const order = [...s.objects].filter((o) => !o.hidden).sort((a, b) => (a.kind === 'stage_deck' ? -1 : b.kind === 'stage_deck' ? 1 : a.position[1] - b.position[1]));
  for (const o of order) {
    if (o.kind === 'seat_block') continue;
    const f = footprintOf(o);
    const pts = f.corners.map(([x, z]) => `${tx(x).toFixed(1)},${tz(z).toFixed(1)}`).join(' ');
    const zone = o.kind === 'zone';
    parts.push(`<polygon points="${pts}" fill="${LAYER_FILL[o.layer]}" fill-opacity="${zone ? 0.18 : o.kind === 'stage_deck' ? 0.25 : 0.85}" stroke="#1b1822" stroke-width="1" ${o.dimsSource === 'visual_only' ? 'stroke-dasharray="4 3"' : ''}/>`);
    const label = o.channel ? `${o.label} [ch ${o.channel}]` : o.label;
    parts.push(`<text x="${tx(o.position[0]).toFixed(1)}" y="${(o.kind === 'stage_deck' ? tz(o.position[2] - o.size[2] / 2) + 16 : tz(o.position[2]) - o.size[2] * scale * 0.5 - 4).toFixed(1)}" font-size="${o.kind === 'stage_deck' ? 14 : 10}" text-anchor="middle" font-family="sans-serif" fill="#16131c">${esc(label)}</text>`);
  }
  const blocked = new Set(d.analysis.sightlines.blocked.map((b) => `${b.seat.blockId}:${b.seat.row}:${b.seat.col}`));
  for (const seat of d.analysis.seating.usable) {
    if (seat.x < focus.cx - focus.w / 2 || seat.x > focus.cx + focus.w / 2 || seat.z < focus.cz - focus.d / 2 || seat.z > focus.cz + focus.d / 2) continue;
    parts.push(`<rect x="${(tx(seat.x) - 0.2 * scale).toFixed(1)}" y="${(tz(seat.z) - 0.2 * scale).toFixed(1)}" width="${(0.4 * scale).toFixed(1)}" height="${(0.4 * scale).toFixed(1)}" fill="${blocked.has(`${seat.blockId}:${seat.row}:${seat.col}`) ? '#e0a526' : '#6f9a78'}"/>`);
  }
  const fidelity = { verified_dimensions: 'Verified dimensions', partial_dimensions: 'Partial dimensions', illustrative: 'Illustrative model' }[d.analysis.fidelity];
  const legend = `${esc(opts.title ?? ev.title)} · ${fidelity} · 1 grid = 1 m · ${d.analysis.seating.usable.length} proposed seats · NOT a code-compliance or certified plan`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${(H + 40).toFixed(0)}" width="${W.toFixed(0)}" height="${(H + 40).toFixed(0)}"><g>${parts.join('')}</g><text x="8" y="${(H + 26).toFixed(0)}" font-size="13" font-family="sans-serif">${legend}</text><text x="${W - 8}" y="${(H + 26).toFixed(0)}" font-size="13" text-anchor="end" font-family="sans-serif">▲ upstage · audience ▼</text></svg>`;
}

export function inputListCsv(ev: ShowEvent): string {
  return toCsv([['Channel', 'Source', 'Type', 'Connector'], ...inputList(ev.scene.objects).map((r) => [r.channel, r.source, r.kind, r.connector])]);
}

export function equipmentCsv(ev: ShowEvent, ws: WorkspaceData): string {
  const products = allProducts(ws);
  const rows: (string | number | null)[][] = [['Item', 'Kind', 'Layer', 'X (m)', 'Z (m)', 'Elevation (m)', 'Rotation (deg)', 'W×H×D (m)', 'Dimension source', 'Sourcing', 'Product', 'Spec URL']];
  for (const o of ev.scene.objects) {
    if (o.kind === 'seat_block' || o.kind === 'zone') continue;
    const p = products.find((x) => x.id === o.productId);
    rows.push([o.label, o.kind, o.layer, o.position[0].toFixed(3), o.position[2].toFixed(3), o.position[1].toFixed(3), ((o.rotationY * 180) / Math.PI).toFixed(1), o.size.map((v) => v.toFixed(3)).join('×'), o.dimsSource, o.ownership ?? '', p?.name ?? '', p?.specUrl ?? '']);
  }
  return toCsv(rows);
}

export function procurementCsv(ev: ShowEvent, ws: WorkspaceData, d: Derived): string {
  const products = allProducts(ws);
  const rows: (string | number | null)[][] = [['Item', 'Qty', 'Sourcing', 'Vendor', 'Offer', 'Price', 'Currency', 'Basis', 'Listing URL', 'Last checked', 'Status / note']];
  for (const l of ev.procurement) {
    const p = products.find((x) => x.id === l.productId);
    const o = ws.offers.find((x) => x.id === l.offerId);
    const cl = d.costLines.find((c) => c.id === `d-proc-${l.id}`);
    rows.push([p?.name ?? '', l.quantity, l.ownership, o?.vendor ?? '', o?.kind ?? '', o?.amountMinor == null ? 'Request quote' : (o.amountMinor / 100).toFixed(2), o?.currency ?? '', o?.basis ?? '', o?.url ?? '', o?.lastChecked.slice(0, 10) ?? '', cl?.sourceNote ?? 'no cost (venue supplied / owned)']);
  }
  return toCsv(rows);
}

export function runOfShowCsv(ev: ShowEvent): string {
  return toCsv([['Cue', 'Planned', 'Actual', 'Department', 'Operator', 'Description', 'Fallback'], ...[...ev.cues].sort((a, b) => a.plannedTime.localeCompare(b.plannedTime)).map((c) => [c.number, c.plannedTime, c.actualTime ?? '', c.department, c.operator, c.label, c.fallback ?? ''])]);
}

export function scheduleCsv(ev: ShowEvent): string {
  return toCsv([['Session', 'Block', 'Kind', 'Start', 'End', 'Owner'], ...ev.schedule.map((b) => [ev.sessions.find((s) => s.id === b.sessionId)?.name ?? '', b.label, b.kind, b.start, b.end, b.owner ?? ''])]);
}

export function staffCsv(ev: ShowEvent): string {
  return toCsv([['Role', 'Person', 'Zone', 'Start', 'End', 'Rate/h'], ...ev.staff.map((s) => [s.role, s.person, s.zone ?? '', s.start, s.end, s.rateMinorPerHour == null ? 'not set' : (s.rateMinorPerHour / 100).toFixed(2)])]);
}

export function budgetCsv(ev: ShowEvent, d: Derived): string {
  const rows: (string | number | null)[][] = [['Category', 'Line', 'Unit amount', 'Currency', 'Basis', 'Qty', 'State', 'Source', 'Origin', 'Note']];
  for (const l of d.costLines) rows.push([l.category, l.label, l.amountMinor == null ? 'MISSING' : (l.amountMinor / 100).toFixed(2), l.currency, l.basis, l.quantity, l.state, l.source, l.derivedFrom?.module ?? 'manual', l.sourceNote ?? '']);
  const b = d.finance.cases?.base;
  if (b) {
    rows.push([]);
    rows.push(['Base case', 'Gross ticket receipts', (b.grossTicketMinor / 100).toFixed(2), ev.currency]);
    rows.push(['Base case', 'Net ticket sales', (b.netTicketMinor / 100).toFixed(2), ev.currency]);
    rows.push(['Base case', 'Total cost', (b.totalCostMinor / 100).toFixed(2), ev.currency, '', '', b.costComplete ? 'complete' : 'INCOMPLETE — missing prices']);
    rows.push(['Base case', 'Contribution', b.contributionMinor == null ? 'not computable' : (b.contributionMinor / 100).toFixed(2), ev.currency]);
  }
  return toCsv(rows);
}

export function venueQuestions(ev: ShowEvent, d: Derived): string[] {
  const q: string[] = [];
  if (d.venue) {
    for (const u of d.venue.unverifiedChecklist) q.push(`Please confirm: ${u}`);
    if (!d.capacity.certified) q.push(`Confirm the capacity for "${d.config?.name}" (we have ${d.venueCapacity.value ?? 'no figure'} from a public page).`);
    q.push(`Is ${ev.sessions.map((s) => s.date).join(', ')} available, and what are the hold/deposit terms?`);
  }
  for (const i of d.issues) if (i.module === 'venue' || i.level === 'potential_conflict') q.push(i.message);
  return [...new Set(q)];
}

/** One printable HTML packet with the plan, stage plot and every list (AC-14). */
export function showPacketHtml(ev: ShowEvent, d: Derived, ws: WorkspaceData, locale: string): string {
  const fmt = (m: number | null) => formatMoney(m, ev.currency, locale);
  const table = (csv: string) => {
    const rows = parseCsv(csv);
    return `<table>${rows.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</table>`;
  };
  const b = d.finance.cases?.base;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(ev.title)} — show packet</title>
<style>body{font:13px/1.45 system-ui,sans-serif;margin:24px;color:#16131c}h1{margin:0}h2{margin-top:28px;border-bottom:2px solid #16131c}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1ede6}.warn{background:#fff4d6;padding:8px;border-left:4px solid #e0a526}svg{max-width:100%;height:auto;border:1px solid #ccc}@media print{h2{page-break-before:always}}</style></head><body>
<h1>${esc(ev.title)}</h1>
<p>${esc(d.venue ? `${d.venue.space}, ${d.venue.campus} — ${d.venue.locality}` : 'No venue selected')} · ${ev.sessions.map((s) => `${esc(s.name)} ${s.date} doors ${s.doors} show ${s.show} curfew ${s.curfew}`).join(' · ')} (${esc(ev.timezone)})</p>
<p class="warn">Generated ${new Date().toISOString()} by SHOWTIME. Planning document only: geometry fidelity is “${d.analysis.fidelity.replace('_', ' ')}”. Nothing here certifies fire/egress, structural, acoustic or code compliance. Items marked missing or unconfirmed must be confirmed with the venue and suppliers.</p>
<h2>Venue plan</h2>${planSvg(ev, d)}
<h2>Stage plot</h2>${planSvg(ev, d, { stageOnly: true, title: `${ev.title} — stage plot` })}
<h2>Input list</h2>${table(inputListCsv(ev))}
<h2>Equipment positions</h2>${table(equipmentCsv(ev, ws))}
<h2>Procurement & sources</h2>${table(procurementCsv(ev, ws, d))}
<h2>Schedule</h2>${table(scheduleCsv(ev))}
<h2>Run of show</h2>${table(runOfShowCsv(ev))}
<h2>Staffing</h2>${table(staffCsv(ev))}
<h2>Budget</h2>${table(budgetCsv(ev, d))}
<p>Base case: gross ${fmt(b?.grossTicketMinor ?? null)}, net ${fmt(b?.netTicketMinor ?? null)}, cost ${fmt(b?.totalCostMinor ?? null)}${b && !b.costComplete ? ' (INCOMPLETE)' : ''}, contribution ${b?.contributionMinor == null ? 'not computable' : fmt(b.contributionMinor)}. Break-even: ${d.finance.breakEven.attendance ?? 'not computable'} — ${esc(d.finance.breakEven.explanation)}</p>
<h2>Promotion plan</h2><ul>${ev.campaign.map((c) => `<li>${esc(channelById(c.channelId)?.name ?? c.channelId)} — planned ${fmt(c.plannedMinor)}${c.observed ? `, observed spend ${fmt(c.observed.spendMinor)} (imported ${c.observed.importedAt.slice(0, 10)})` : ''}</li>`).join('') || '<li>None</li>'}</ul>
<h2>Questions to confirm with the venue</h2><ol>${venueQuestions(ev, d).map((q) => `<li>${esc(q)}</li>`).join('')}</ol>
<h2>Open issues</h2><ul>${d.issues.map((i) => `<li>[${i.module} · ${i.level.replace('_', ' ')}] ${esc(i.message)}</li>`).join('')}</ul>
</body></html>`;
}
