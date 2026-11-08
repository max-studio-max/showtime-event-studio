import { uid } from '../domain/factory';
import type { CostCategory, GuestCohort, ShowEvent, StaffShift, StationAssumption, SupplierAssignment } from '../domain/types';
import { SUPPLIER_CATEGORIES } from '../integrations/contracts';
import { spanMin } from '../engine/operations';
import { useStore } from '../state/store';
import { Badge, Empty, ExternalLink, MoneyInput, NeedEvent, NumInput, Panel, Tag, useDerived, useFmtMoney } from '../ui/kit';

function Suppliers({ ev }: { ev: ShowEvent }) {
  const update = useStore((s) => s.updateEvent);
  const suppliers = useStore((s) => s.suppliers);
  const go = useStore((s) => s.go);
  const fmt = useFmtMoney();
  const patch = (id: string, p: Partial<SupplierAssignment>, w: string) => update(ev.id, (e) => ({ ...e, supplierAssignments: e.supplierAssignments.map((a) => (a.id === id ? { ...a, ...p } : a)) }), `supplier ${w}`, { coalesceKey: `${id}-${w}` });
  const unassigned = suppliers.filter((s) => !ev.supplierAssignments.some((a) => a.supplierId === s.id));
  return (
    <Panel title={`Suppliers (${ev.supplierAssignments.length})`} actions={<button className="btn ghost sm" onClick={() => go('discover')}>Find suppliers in Discover</button>}>
      <p className="small">A supplier found on a map is not available, priced or vetted for your event. Proposed suppliers add no cost; once you request a quote the budget shows it as missing until you confirm amount, currency and quantity. SHOWTIME never contacts a supplier for you.</p>
      {unassigned.length > 0 && (
        <div className="row gap wrap small">
          Saved suppliers not on this event:
          {unassigned.map((s) => (
            <button key={s.id} className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, supplierAssignments: [...e.supplierAssignments, { id: uid('sa'), supplierId: s.id, role: SUPPLIER_CATEGORIES[s.category].label, status: 'proposed', quote: null, category: 'other' }] }), `propose supplier ${s.name}`)}>+ {s.name}</button>
          ))}
        </div>
      )}
      {ev.supplierAssignments.length === 0 ? <Empty title="No suppliers proposed">Search caterers, rentals, security and more in Discover.</Empty> : (
        <table className="table">
          <thead><tr><th>Supplier</th><th>Role</th><th>Status</th><th>Quote (private)</th><th>Budget</th><th /></tr></thead>
          <tbody>
            {ev.supplierAssignments.map((a) => {
              const s = suppliers.find((x) => x.id === a.supplierId);
              const q = a.quote ?? { amountMinor: null, currency: ev.currency, quantity: 1, basis: 'fixed' as const, confirmed: false };
              const setQ = (p: Partial<typeof q>, w: string) => patch(a.id, { quote: { ...q, ...p } }, w);
              return (
                <tr key={a.id}>
                  <td>
                    <b>{s?.name ?? 'Removed supplier'}</b> {s?.provider && <Badge kind="Provider-reported" title={s.provider.attribution} />}
                    <div className="small">{s?.address ?? <span className="missing">no address</span>}</div>
                    <div className="row gap small">{s?.website && <ExternalLink href={s.website}>Website</ExternalLink>}{s?.phone && <span>☎ {s.phone}</span>}</div>
                  </td>
                  <td>
                    <input aria-label="Role" value={a.role} onChange={(e) => patch(a.id, { role: e.target.value }, 'role')} />
                    <select aria-label="Budget category" value={a.category} onChange={(e) => patch(a.id, { category: e.target.value as CostCategory }, 'category')}>{['catering_bar', 'staffing', 'equipment', 'delivery', 'accessibility', 'other'].map((c) => <option key={c}>{c}</option>)}</select>
                  </td>
                  <td>
                    <select aria-label="Status" value={a.status} onChange={(e) => patch(a.id, { status: e.target.value as SupplierAssignment['status'] }, 'status')}>
                      <option value="proposed">proposed</option><option value="quote_requested">quote requested</option><option value="quoted">quoted</option><option value="confirmed">confirmed</option><option value="declined">declined</option>
                    </select>
                  </td>
                  <td>
                    {a.status === 'proposed' || a.status === 'declined' ? <span className="muted small">—</span> : (
                      <div className="stack small">
                        <MoneyInput ariaLabel="Quoted amount" value={q.amountMinor} currency={q.currency} onChange={(v) => setQ({ amountMinor: v, confirmed: false }, 'amount')} placeholder="not quoted" />
                        <div className="row gap">
                          <select aria-label="Currency" value={q.currency} onChange={(e) => setQ({ currency: e.target.value, confirmed: false }, 'currency')}>{['CAD', 'USD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}</select>
                          × <NumInput ariaLabel="Quantity" value={q.quantity} min={1} width={56} onChange={(v) => setQ({ quantity: v ?? 1, confirmed: false }, 'qty')} />
                          <select aria-label="Basis" value={q.basis} onChange={(e) => setQ({ basis: e.target.value as 'fixed' | 'per_attendee', confirmed: false }, 'basis')}><option value="fixed">fixed</option><option value="per_attendee">per attendee</option></select>
                        </div>
                        <input aria-label="Valid until" type="date" value={q.validUntil ?? ''} onChange={(e) => setQ({ validUntil: e.target.value }, 'valid')} />
                        <input aria-label="Terms and exclusions" placeholder="Terms / exclusions" value={q.terms ?? ''} onChange={(e) => setQ({ terms: e.target.value }, 'terms')} />
                        <label className="check"><input type="checkbox" disabled={q.amountMinor == null} checked={q.confirmed} onChange={(e) => setQ({ confirmed: e.target.checked }, 'confirm')} /> I have this quote in writing</label>
                      </div>
                    )}
                  </td>
                  <td>{a.status === 'proposed' ? <Tag>no cost yet</Tag> : a.status === 'declined' ? <Tag>excluded</Tag> : q.confirmed && q.amountMinor != null ? <Tag tone="good">{fmt(q.amountMinor * q.quantity, q.currency)}{q.basis === 'per_attendee' ? ' /att.' : ''}</Tag> : <Tag tone="warn">missing — total incomplete</Tag>}</td>
                  <td><button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, supplierAssignments: e.supplierAssignments.filter((x) => x.id !== a.id) }), 'remove supplier')}>Remove</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function ServiceInner({ ev }: { ev: ShowEvent }) {
  const update = useStore((s) => s.updateEvent);
  const go = useStore((s) => s.go);
  const d = useDerived(ev)!;
  const fmt = useFmtMoney();
  const setCohort = (id: string, p: Partial<GuestCohort>, w: string) => update(ev.id, (e) => ({ ...e, cohorts: e.cohorts.map((c) => (c.id === id ? { ...c, ...p } : c)) }), `cohort ${w}`, { coalesceKey: `${id}-${w}` });
  const setStation = (k: StationAssumption['kind'], p: Partial<StationAssumption>, w: string) => update(ev.id, (e) => ({ ...e, stationAssumptions: e.stationAssumptions.map((s) => (s.kind === k ? { ...s, ...p } : s)) }), `${k} assumption ${w}`, { coalesceKey: `${k}-${w}` });
  const setShift = (id: string, p: Partial<StaffShift>, w: string) => update(ev.id, (e) => ({ ...e, staff: e.staff.map((s) => (s.id === id ? { ...s, ...p } : s)) }), `shift ${w}`, { coalesceKey: `${id}-${w}` });
  const cohortTotal = ev.cohorts.reduce((s, c) => s + (c.verified ?? c.projected), 0);
  return (
    <div className="stack">
      <h1>Service</h1>
      <p className="lede">Guest journey, stations and staffing. Stations are the bar, merch and check-in objects placed in the Studio; queue times are a simple declared-throughput model, not a crowd-safety assessment.</p>
      <Panel title="Guest cohorts" actions={<button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, cohorts: [...e.cohorts, { id: uid('coh'), name: 'New cohort', kind: 'vip', projected: 0, verified: null, arrivalWindowMin: 30 }] }), 'add cohort')}>+ Cohort</button>}>
        <p className="small">Total {cohortTotal} {cohortTotal === 0 && <>— with no cohorts entered, services use the base-case attendance ({d.finance.cases?.base.attendance ?? 0}).</>} Guest count used: <b>{d.guests}</b>{d.capacity.available != null && d.guests > d.capacity.available && <span className="error"> — exceeds available tickets ({d.capacity.available})</span>}</p>
        <table className="table">
          <thead><tr><th>Cohort</th><th>Type</th><th>Projected</th><th>Verified count</th><th>Arrival window (min)</th><th /></tr></thead>
          <tbody>
            {ev.cohorts.map((c) => (
              <tr key={c.id}>
                <td><input aria-label="Cohort name" value={c.name} onChange={(e) => setCohort(c.id, { name: e.target.value }, 'name')} /></td>
                <td><select aria-label="Cohort type" value={c.kind} onChange={(e) => setCohort(c.id, { kind: e.target.value as GuestCohort['kind'] }, 'kind')}>{['general', 'vip', 'accessible', 'comp', 'staff', 'talent', 'media'].map((k) => <option key={k}>{k}</option>)}</select></td>
                <td><NumInput ariaLabel="Projected" value={c.projected} min={0} onChange={(v) => setCohort(c.id, { projected: v ?? 0 }, 'projected')} /></td>
                <td><NumInput ariaLabel="Verified" value={c.verified} allowNull min={0} onChange={(v) => setCohort(c.id, { verified: v }, 'verified')} /></td>
                <td><NumInput ariaLabel="Arrival window" value={c.arrivalWindowMin} min={5} onChange={(v) => setCohort(c.id, { arrivalWindowMin: v ?? 30 }, 'arrival')} /></td>
                <td><button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, cohorts: e.cohorts.filter((x) => x.id !== c.id) }), 'remove cohort')}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Dietary, accessibility and guest identities are sensitive. SHOWTIME stores only counts here; keep named guest data in your ticketing system.</p>
      </Panel>
      <Panel title="Stations & queues (modeled)" actions={<button className="btn ghost sm" onClick={() => go('studio')}>Place stations in Studio</button>}>
        <table className="table">
          <thead><tr><th>Station</th><th>Placed</th><th>Served / h / station</th><th>Share of guests</th><th>Staff / station</th><th>Peak demand</th><th>Capacity</th><th>Max wait (modeled)</th></tr></thead>
          <tbody>
            {ev.stationAssumptions.map((a) => {
              const q = d.queues.find((x) => x.kind === a.kind)!;
              return (
                <tr key={a.kind} className={q.utilisation != null && q.utilisation > 1 ? 'row-warn' : ''}>
                  <td>{a.kind}</td>
                  <td>{q.stations}</td>
                  <td><NumInput ariaLabel="Throughput" value={a.servedPerHourPerStation} min={1} onChange={(v) => setStation(a.kind, { servedPerHourPerStation: v ?? 1 }, 'throughput')} /></td>
                  <td><NumInput ariaLabel="Usage share" value={a.usageShare} step={0.05} min={0} max={1} onChange={(v) => setStation(a.kind, { usageShare: v ?? 0 }, 'share')} /></td>
                  <td><NumInput ariaLabel="Staff per station" value={a.staffPerStation} min={0} onChange={(v) => setStation(a.kind, { staffPerStation: v ?? 0 }, 'staff')} /></td>
                  <td>{Math.round(q.peakDemandPerHour)}/h</td>
                  <td>{q.capacityPerHour}/h</td>
                  <td>{q.maxWaitMin == null ? <span className="missing">{q.note}</span> : `${Math.round(q.maxWaitMin)} min`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted small">Assumption: guests using a station arrive evenly across the longest cohort arrival window. Sensitivity: halve or double throughput above and compare.</p>
      </Panel>
      <Suppliers ev={ev} />
      <Panel title={`Staff roster (${ev.staff.length})`} actions={<button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, staff: [...e.staff, { id: uid('shift'), role: 'Bartender', person: '', start: e.sessions[0]?.doors ?? '18:00', end: e.sessions[0]?.curfew ?? '23:00', rateMinorPerHour: null }] }), 'add shift')}>+ Shift</button>}>
        <p className="small">Declared ratios need <b>{d.staff.requiredByStations}</b> station staff; {d.staff.rostered} shifts rostered · {d.staff.hours.toFixed(1)} h · known cost {fmt(d.staff.knownMinor, ev.currency)}{d.staff.missing ? ` + ${d.staff.missing} shift(s) without a rate (incomplete)` : ''}</p>
        {ev.staff.length === 0 ? <Empty title="No shifts yet" /> : (
          <table className="table">
            <thead><tr><th>Role</th><th>Person</th><th>Zone</th><th>Start</th><th>End</th><th>Hours</th><th>Rate / h</th><th /></tr></thead>
            <tbody>
              {ev.staff.map((s) => (
                <tr key={s.id}>
                  <td><input aria-label="Role" value={s.role} onChange={(e) => setShift(s.id, { role: e.target.value }, 'role')} /></td>
                  <td><input aria-label="Person" value={s.person} onChange={(e) => setShift(s.id, { person: e.target.value }, 'person')} /></td>
                  <td><input aria-label="Zone" value={s.zone ?? ''} onChange={(e) => setShift(s.id, { zone: e.target.value }, 'zone')} /></td>
                  <td><input aria-label="Start" type="time" value={s.start} onChange={(e) => setShift(s.id, { start: e.target.value }, 'start')} /></td>
                  <td><input aria-label="End" type="time" value={s.end} onChange={(e) => setShift(s.id, { end: e.target.value }, 'end')} /></td>
                  <td>{(spanMin(s.start, s.end) / 60).toFixed(1)}</td>
                  <td><MoneyInput ariaLabel="Hourly rate" value={s.rateMinorPerHour} currency={ev.currency} onChange={(v) => setShift(s.id, { rateMinorPerHour: v }, 'rate')} /></td>
                  <td><button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, staff: e.staff.filter((x) => x.id !== s.id) }), 'remove shift')}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

export function Service() {
  return <NeedEvent>{(ev) => <ServiceInner ev={ev} />}</NeedEvent>;
}
