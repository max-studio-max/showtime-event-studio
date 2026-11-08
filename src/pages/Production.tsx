import { useMemo, useState } from 'react';
import { budgetCsv, equipmentCsv, inputListCsv, planSvg, procurementCsv, runOfShowCsv, scheduleCsv, showPacketHtml, staffCsv, venueQuestions } from '../domain/exports';
import { nowIso, uid } from '../domain/factory';
import type { Cue, DocumentRef, ScheduleBlock, ShowEvent } from '../domain/types';
import { scheduleConflicts } from '../engine/operations';
import { isHttpUrl } from '../engine/provenance';
import { useStore } from '../state/store';
import { download, Empty, ExternalLink, Field, NeedEvent, Panel, useDerived, useWorkspaceData } from '../ui/kit';

const BLOCK_KINDS: ScheduleBlock['kind'][] = ['access', 'load_in', 'setup', 'soundcheck', 'rehearsal', 'doors', 'show', 'interval', 'service', 'strike', 'load_out', 'curfew'];

function ProductionInner({ ev }: { ev: ShowEvent }) {
  const update = useStore((s) => s.updateEvent);
  const locale = useStore((s) => s.settings.locale);
  const d = useDerived(ev)!;
  const ws = useWorkspaceData();
  const [doc, setDoc] = useState({ title: '', url: '', kind: 'contract' as DocumentRef['kind'] });
  const [docErr, setDocErr] = useState<string | null>(null);
  const conflicts = scheduleConflicts(ev.schedule);
  const slug = ev.title.replace(/[^a-z0-9]+/gi, '_');
  const plan = useMemo(() => planSvg(ev, d), [ev, d]);
  const setBlock = (id: string, p: Partial<ScheduleBlock>, w: string) => update(ev.id, (e) => ({ ...e, schedule: e.schedule.map((b) => (b.id === id ? { ...b, ...p } : b)) }), `schedule ${w}`, { coalesceKey: `${id}-${w}` });
  const setCue = (id: string, p: Partial<Cue>, w: string) => update(ev.id, (e) => ({ ...e, cues: e.cues.map((c) => (c.id === id ? { ...c, ...p } : c)) }), `cue ${w}`, { coalesceKey: `${id}-${w}` });
  const sorted = [...ev.schedule].sort((a, b) => (a.sessionId === b.sessionId ? a.start.localeCompare(b.start) : 0));
  return (
    <div className="stack">
      <h1>Production</h1>
      <Panel title="Exports for your team and venue">
        <p className="small muted">All generated from the live scene and event data.</p>
        <div className="row gap wrap">
          <button className="btn primary" onClick={() => download(`${slug}_show_packet.html`, showPacketHtml(ev, d, ws, locale), 'text/html')}>Show packet (printable HTML)</button>
          <button className="btn" onClick={() => download(`${slug}_plan.svg`, plan, 'image/svg+xml')}>Venue plan (SVG)</button>
          <button className="btn" onClick={() => download(`${slug}_stage_plot.svg`, planSvg(ev, d, { stageOnly: true, title: `${ev.title} — stage plot` }), 'image/svg+xml')}>Stage plot (SVG)</button>
          <button className="btn ghost" onClick={() => download(`${slug}_input_list.csv`, inputListCsv(ev), 'text/csv')}>Input list</button>
          <button className="btn ghost" onClick={() => download(`${slug}_equipment_positions.csv`, equipmentCsv(ev, ws), 'text/csv')}>Equipment positions</button>
          <button className="btn ghost" onClick={() => download(`${slug}_procurement.csv`, procurementCsv(ev, ws, d), 'text/csv')}>Procurement & sources</button>
          <button className="btn ghost" onClick={() => download(`${slug}_run_of_show.csv`, runOfShowCsv(ev), 'text/csv')}>Run of show</button>
          <button className="btn ghost" onClick={() => download(`${slug}_schedule.csv`, scheduleCsv(ev), 'text/csv')}>Schedule</button>
          <button className="btn ghost" onClick={() => download(`${slug}_staffing.csv`, staffCsv(ev), 'text/csv')}>Staffing</button>
          <button className="btn ghost" onClick={() => download(`${slug}_budget.csv`, budgetCsv(ev, d), 'text/csv')}>Budget</button>
          <button className="btn ghost" onClick={() => download(`${slug}_event.json`, JSON.stringify(ev, null, 2), 'application/json')}>Event data (JSON)</button>
        </div>
        <details>
          <summary>Preview plan</summary>
          <div className="plan-preview" dangerouslySetInnerHTML={{ __html: plan }} />
        </details>
      </Panel>
      <Panel title="Questions to confirm with the venue">
        {venueQuestions(ev, d).length ? <ol className="small">{venueQuestions(ev, d).map((q) => <li key={q}>{q}</li>)}</ol> : <p className="muted">Select a venue first.</p>}
      </Panel>
      <Panel title="Schedule" actions={<button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, schedule: [...e.schedule, { id: uid('blk'), sessionId: e.sessions[0].id, kind: 'setup', label: 'New block', start: '12:00', end: '13:00' }] }), 'add schedule block')}>+ Block</button>}>
        {conflicts.length > 0 && <ul className="issues small">{conflicts.map((c) => <li key={c} className="lvl-potential_conflict">{c}</li>)}</ul>}
        <table className="table">
          <thead><tr><th>Session</th><th>Kind</th><th>Label</th><th>Start</th><th>End</th><th>After</th><th>Owner</th><th /></tr></thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.id}>
                <td><select aria-label="Session" value={b.sessionId} onChange={(e) => setBlock(b.id, { sessionId: e.target.value }, 'session')}>{ev.sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                <td><select aria-label="Kind" value={b.kind} onChange={(e) => setBlock(b.id, { kind: e.target.value as ScheduleBlock['kind'] }, 'kind')}>{BLOCK_KINDS.map((k) => <option key={k}>{k}</option>)}</select></td>
                <td><input aria-label="Label" value={b.label} onChange={(e) => setBlock(b.id, { label: e.target.value }, 'label')} /></td>
                <td><input aria-label="Start" type="time" value={b.start} onChange={(e) => setBlock(b.id, { start: e.target.value }, 'start')} /></td>
                <td><input aria-label="End" type="time" value={b.end} onChange={(e) => setBlock(b.id, { end: e.target.value }, 'end')} /></td>
                <td><select aria-label="Depends on" value={b.dependsOn?.[0] ?? ''} onChange={(e) => setBlock(b.id, { dependsOn: e.target.value ? [e.target.value] : [] }, 'depends')}><option value="">—</option>{ev.schedule.filter((x) => x.id !== b.id).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></td>
                <td><input aria-label="Owner" value={b.owner ?? ''} onChange={(e) => setBlock(b.id, { owner: e.target.value }, 'owner')} /></td>
                <td><button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, schedule: e.schedule.filter((x) => x.id !== b.id) }), 'remove block')}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Run of show" actions={<button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, cues: [...e.cues, { id: uid('cue'), number: String(e.cues.length + 1), label: 'New cue', plannedTime: e.sessions[0]?.show ?? '20:00', operator: '', department: 'stage' }] }), 'add cue')}>+ Cue</button>}>
        {ev.cues.length === 0 ? <Empty title="No cues yet">Add cues with operators, planned times and fallbacks.</Empty> : (
          <table className="table">
            <thead><tr><th>#</th><th>Planned</th><th>Actual</th><th>Dept</th><th>Operator</th><th>Cue</th><th>Fallback</th><th /></tr></thead>
            <tbody>
              {[...ev.cues].sort((a, b) => a.plannedTime.localeCompare(b.plannedTime)).map((c) => (
                <tr key={c.id}>
                  <td><input aria-label="Cue number" size={4} value={c.number} onChange={(e) => setCue(c.id, { number: e.target.value }, 'number')} /></td>
                  <td><input aria-label="Planned time" type="time" value={c.plannedTime} onChange={(e) => setCue(c.id, { plannedTime: e.target.value }, 'planned')} /></td>
                  <td><input aria-label="Actual time" type="time" value={c.actualTime ?? ''} onChange={(e) => setCue(c.id, { actualTime: e.target.value }, 'actual')} /></td>
                  <td><select aria-label="Department" value={c.department} onChange={(e) => setCue(c.id, { department: e.target.value as Cue['department'] }, 'dept')}>{['audio', 'lighting', 'video', 'stage', 'house'].map((x) => <option key={x}>{x}</option>)}</select></td>
                  <td><input aria-label="Operator" value={c.operator} onChange={(e) => setCue(c.id, { operator: e.target.value }, 'operator')} /></td>
                  <td><input aria-label="Cue description" value={c.label} onChange={(e) => setCue(c.id, { label: e.target.value }, 'label')} /></td>
                  <td><input aria-label="Fallback" value={c.fallback ?? ''} onChange={(e) => setCue(c.id, { fallback: e.target.value }, 'fallback')} /></td>
                  <td><button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, cues: e.cues.filter((x) => x.id !== c.id) }), 'remove cue')}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title="Tasks" actions={<button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, tasks: [...e.tasks, { id: uid('task'), title: 'New task', owner: '', done: false, module: 'production' }] }), 'add task')}>+ Task</button>}>
        {ev.tasks.length === 0 ? <p className="muted small">No tasks.</p> : (
          <ul className="plain tasks">
            {ev.tasks.map((t) => (
              <li key={t.id} className="row gap">
                <input type="checkbox" aria-label="Done" checked={t.done} onChange={(e) => update(ev.id, (x) => ({ ...x, tasks: x.tasks.map((y) => (y.id === t.id ? { ...y, done: e.target.checked } : y)) }), `task ${t.done ? 'reopened' : 'done'}: ${t.title}`)} />
                <input aria-label="Task" value={t.title} onChange={(e) => update(ev.id, (x) => ({ ...x, tasks: x.tasks.map((y) => (y.id === t.id ? { ...y, title: e.target.value } : y)) }), 'task title', { coalesceKey: `${t.id}-title` })} />
                <input aria-label="Owner" placeholder="Owner" value={t.owner} onChange={(e) => update(ev.id, (x) => ({ ...x, tasks: x.tasks.map((y) => (y.id === t.id ? { ...y, owner: e.target.value } : y)) }), 'task owner', { coalesceKey: `${t.id}-owner` })} />
                <input aria-label="Due" type="date" value={t.due ?? ''} onChange={(e) => update(ev.id, (x) => ({ ...x, tasks: x.tasks.map((y) => (y.id === t.id ? { ...y, due: e.target.value } : y)) }), 'task due')} />
                <small className="muted">{t.module}</small>
                <button className="btn ghost sm" onClick={() => update(ev.id, (x) => ({ ...x, tasks: x.tasks.filter((y) => y.id !== t.id) }), 'remove task')}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Documents">
        <p className="small muted">SHOWTIME stores links and versions, not the files themselves — keep contracts, insurance certificates and permits in your document storage.</p>
        <form className="row gap wrap" onSubmit={(e) => {
          e.preventDefault();
          if (!doc.title.trim() || !isHttpUrl(doc.url)) return setDocErr('Title and a link are required');
          const prev = ev.documents.filter((x) => x.title === doc.title.trim());
          update(ev.id, (x) => ({ ...x, documents: [...x.documents, { id: uid('doc'), title: doc.title.trim(), kind: doc.kind, url: doc.url, version: prev.length + 1, addedAt: nowIso() }] }), `document ${doc.title} v${prev.length + 1}`);
          setDoc({ title: '', url: '', kind: doc.kind });
          setDocErr(null);
        }}>
          <Field label="Title"><input value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} /></Field>
          <Field label="Kind"><select value={doc.kind} onChange={(e) => setDoc({ ...doc, kind: e.target.value as DocumentRef['kind'] })}>{['contract', 'insurance', 'permit', 'rider', 'safety', 'site_map', 'order', 'invoice', 'other'].map((k) => <option key={k}>{k}</option>)}</select></Field>
          <Field label="Link"><input value={doc.url} onChange={(e) => setDoc({ ...doc, url: e.target.value })} placeholder="https://…" /></Field>
          <button className="btn sm" type="submit">Add (new version if title exists)</button>
        </form>
        {docErr && <p className="error small" role="alert">{docErr}</p>}
        {ev.documents.length > 0 && (
          <table className="table compact"><thead><tr><th>Document</th><th>Kind</th><th>Version</th><th>Added</th></tr></thead>
            <tbody>{ev.documents.map((x) => <tr key={x.id}><td><ExternalLink href={x.url}>{x.title}</ExternalLink></td><td>{x.kind}</td><td>v{x.version}</td><td>{x.addedAt.slice(0, 10)}</td></tr>)}</tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

export function Production() {
  return <NeedEvent>{(ev) => <ProductionInner ev={ev} />}</NeedEvent>;
}
