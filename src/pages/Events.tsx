import { useState } from 'react';
import { nowIso, TEMPLATES, uid } from '../domain/factory';
import type { EventStatus, ShowEvent } from '../domain/types';
import { allowedTransitions, STATUS_LABEL, transition } from '../engine/lifecycle';
import { newEventFromTemplate, useActiveEvent, useStore } from '../state/store';
import { Confirm, Empty, Field, NumInput, Panel } from '../ui/kit';

const TZ = ['America/Toronto', 'America/New_York', 'America/Los_Angeles', 'America/Vancouver', 'America/Chicago', 'Europe/London', 'UTC'];

function CreateEvent() {
  const addEvent = useStore((s) => s.addEvent);
  const setToast = useStore((s) => s.setToast);
  const [template, setTemplate] = useState('comedy');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [tz, setTz] = useState('America/Toronto');
  const [currency, setCurrency] = useState('CAD');
  return (
    <Panel title="New event">
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          addEvent(newEventFromTemplate(template, title.trim(), date, tz, currency));
          setToast(`Created “${title.trim()}”. Pick a venue next.`);
          setTitle('');
        }}
      >
        <Field label="Title">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Friday Night Stand-Up" />
        </Field>
        <Field label="Template" hint="Templates set a stage preset, schedule and ticket tiers you can change.">
          <select value={template} onChange={(e) => setTemplate(e.target.value)}>
            {TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label="First session date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Time zone (IANA)">
          <select value={tz} onChange={(e) => setTz(e.target.value)}>
            {TZ.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['CAD', 'USD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <div className="form-actions">
          <button className="btn primary" type="submit">Create event</button>
        </div>
      </form>
    </Panel>
  );
}

const COPY_PARTS = [
  ['scene', 'Scene layout'],
  ['ticketTiers', 'Ticket tiers'],
  ['budgetLines', 'Manual budget lines'],
  ['schedule', 'Schedule'],
  ['cues', 'Run of show'],
  ['staff', 'Staff roster'],
  ['campaign', 'Campaign plan (spend & UTMs, not observed metrics)'],
  ['lineup', 'Lineup (inquiry state is reset)'],
] as const;

function Duplicate({ ev, onDone }: { ev: ShowEvent; onDone: () => void }) {
  const addEvent = useStore((s) => s.addEvent);
  const user = useStore((s) => s.user.name);
  const [parts, setParts] = useState<Record<string, boolean>>({ scene: true, ticketTiers: true, schedule: true });
  const [title, setTitle] = useState(`${ev.title} (copy)`);
  return (
    <div className="inline-form">
      <Field label="New title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <fieldset>
        <legend>Copy which data?</legend>
        {COPY_PARTS.map(([k, label]) => (
          <label key={k} className="check">
            <input type="checkbox" checked={!!parts[k]} onChange={(e) => setParts({ ...parts, [k]: e.target.checked })} /> {label}
          </label>
        ))}
      </fieldset>
      <button
        className="btn"
        onClick={() => {
          const fresh = newEventFromTemplate('blank', title, ev.sessions[0].date, ev.timezone, ev.currency);
          const copy: ShowEvent = JSON.parse(JSON.stringify({ ...fresh, venueId: ev.venueId, venueConfigId: ev.venueConfigId, category: ev.category, sessions: ev.sessions, assumptions: ev.assumptions, stationAssumptions: ev.stationAssumptions }));
          for (const [k] of COPY_PARTS) if (parts[k]) (copy as unknown as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(ev[k]));
          copy.campaign = copy.campaign.map((c) => ({ ...c, observed: null, invoicedMinor: null, committedMinor: null }));
          copy.lineup = copy.lineup.map((l) => ({ ...l, inquiry: { state: 'not_contacted' } }));
          copy.audit = [{ id: uid('aud'), at: nowIso(), actor: user, action: 'created', detail: `Duplicated from "${ev.title}" copying: ${Object.keys(parts).filter((k) => parts[k]).join(', ') || 'nothing'}` }];
          addEvent(copy);
          onDone();
        }}
      >
        Duplicate
      </button>
    </div>
  );
}

function StatusControl({ ev }: { ev: ShowEvent }) {
  const update = useStore((s) => s.updateEvent);
  const user = useStore((s) => s.user.name);
  const [to, setTo] = useState<EventStatus | ''>('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const opts = allowedTransitions(ev.status);
  if (!opts.length) return <span className="muted">No further transitions</span>;
  return (
    <div className="row gap wrap">
      <select aria-label="Next status" value={to} onChange={(e) => setTo(e.target.value as EventStatus)}>
        <option value="">Change status…</option>
        {opts.map((o) => <option key={o} value={o}>{STATUS_LABEL[o]}</option>)}
      </select>
      <input aria-label="Reason for status change" placeholder="Reason (required, audited)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button
        className="btn sm"
        disabled={!to}
        onClick={() => {
          try {
            const a = transition(ev.status, to as EventStatus, user, reason, nowIso(), uid('aud'));
            update(ev.id, (e) => ({ ...e, status: to as EventStatus, audit: [...e.audit, a] }), 'status_change', { skipAudit: true });
            setTo('');
            setReason('');
            setErr(null);
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        Apply
      </button>
      {err && <span className="error" role="alert">{err}</span>}
    </div>
  );
}

function EventDetail({ ev }: { ev: ShowEvent }) {
  const update = useStore((s) => s.updateEvent);
  const removeEvent = useStore((s) => s.removeEvent);
  const [dup, setDup] = useState(false);
  const set = (fn: (e: ShowEvent) => ShowEvent, what: string) => update(ev.id, fn, what, { coalesceKey: what });
  return (
    <Panel title="Event details" actions={<><button className="btn ghost sm" onClick={() => setDup((d) => !d)}>Duplicate…</button><Confirm label="Delete this event permanently?" danger onConfirm={() => removeEvent(ev.id)}>Delete</Confirm></>}>
      {dup && <Duplicate ev={ev} onDone={() => setDup(false)} />}
      <div className="form-grid">
        <Field label="Title"><input value={ev.title} onChange={(e) => set((x) => ({ ...x, title: e.target.value }), 'title')} /></Field>
        <Field label="Category"><input value={ev.category} onChange={(e) => set((x) => ({ ...x, category: e.target.value }), 'category')} /></Field>
        <Field label="Visibility">
          <select value={ev.visibility} onChange={(e) => set((x) => ({ ...x, visibility: e.target.value as ShowEvent['visibility'] }), 'visibility')}>
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </Field>
        <Field label="Attendance target" hint="A goal, not a forecast.">
          <NumInput value={ev.attendanceTarget} allowNull min={0} onChange={(v) => set((x) => ({ ...x, attendanceTarget: v }), 'attendance target')} />
        </Field>
        <Field label="Description" ><textarea rows={2} value={ev.description} onChange={(e) => set((x) => ({ ...x, description: e.target.value }), 'description')} /></Field>
        <Field label="Tags (comma separated)"><input value={ev.tags.join(', ')} onChange={(e) => set((x) => ({ ...x, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) }), 'tags')} /></Field>
      </div>
      <h3>Status</h3>
      <StatusControl ev={ev} />
      <h3>Sessions <small className="muted">times in {ev.timezone}</small></h3>
      <table className="table">
        <thead><tr><th>Name</th><th>Date</th><th>Doors</th><th>Show</th><th>Curfew</th><th /></tr></thead>
        <tbody>
          {ev.sessions.map((s, i) => {
            const patch = (p: Partial<typeof s>) => set((x) => ({ ...x, sessions: x.sessions.map((y) => (y.id === s.id ? { ...y, ...p } : y)) }), 'session');
            return (
              <tr key={s.id}>
                <td><input aria-label="Session name" value={s.name} onChange={(e) => patch({ name: e.target.value })} /></td>
                <td><input aria-label="Date" type="date" value={s.date} onChange={(e) => patch({ date: e.target.value })} /></td>
                <td><input aria-label="Doors" type="time" value={s.doors} onChange={(e) => patch({ doors: e.target.value })} /></td>
                <td><input aria-label="Show" type="time" value={s.show} onChange={(e) => patch({ show: e.target.value })} /></td>
                <td><input aria-label="Curfew" type="time" value={s.curfew} onChange={(e) => patch({ curfew: e.target.value })} /></td>
                <td>{i > 0 && <button className="btn ghost sm" onClick={() => set((x) => ({ ...x, sessions: x.sessions.filter((y) => y.id !== s.id) }), 'remove session')}>Remove</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="btn ghost sm" onClick={() => set((x) => ({ ...x, sessions: [...x.sessions, { ...x.sessions[x.sessions.length - 1], id: uid('ses'), name: `Session ${x.sessions.length + 1}` }] }), 'add session')}>
        + Add session / day
      </button>
      <h3>Holds</h3>
      <div className="row gap wrap">
        {(['comps', 'accessible', 'production'] as const).map((k) => (
          <Field key={k} label={`${k} holds`}>
            <NumInput value={ev.holds[k]} min={0} onChange={(v) => set((x) => ({ ...x, holds: { ...x.holds, [k]: v ?? 0 } }), `${k} holds`)} />
          </Field>
        ))}
      </div>
      <details>
        <summary>Audit log ({ev.audit.length})</summary>
        <ul className="audit">
          {[...ev.audit].reverse().slice(0, 100).map((a) => (
            <li key={a.id}><time>{new Date(a.at).toLocaleString()}</time> <b>{a.actor}</b> {a.detail}{a.reason && <em> — {a.reason}</em>}</li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}

export function Events() {
  const events = useStore((s) => s.events);
  const setActive = useStore((s) => s.setActive);
  const active = useActiveEvent();
  const [q, setQ] = useState('');
  const list = events.filter((e) => `${e.title} ${e.category} ${e.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <h1>Events</h1>
      <CreateEvent />
      <Panel title="All events" actions={<input aria-label="Search events" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />}>
        {list.length ? (
          <table className="table">
            <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>First date</th><th>Updated</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className={e.id === active?.id ? 'sel' : ''}>
                  <td><button className="link" onClick={() => setActive(e.id)}>{e.title}</button></td>
                  <td>{e.category}</td>
                  <td><span className={`status-pill st-${e.status}`}>{STATUS_LABEL[e.status]}</span></td>
                  <td>{e.sessions[0]?.date}</td>
                  <td>{new Date(e.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title={events.length ? 'No events match' : 'No events yet'} />
        )}
      </Panel>
      {active && <EventDetail key={active.id} ev={active} />}
    </div>
  );
}
