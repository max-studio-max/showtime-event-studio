import { uid } from '../domain/factory';
import type { GuestCohort, ShowEvent, StaffShift, StationAssumption } from '../domain/types';
import { spanMin } from '../engine/operations';
import { useStore } from '../state/store';
import { Empty, MoneyInput, NeedEvent, NumInput, Panel, useDerived, useFmtMoney } from '../ui/kit';

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
