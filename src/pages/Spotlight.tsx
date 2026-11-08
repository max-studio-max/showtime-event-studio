import { useState } from 'react';
import { nowIso, uid } from '../domain/factory';
import type { LineupSlot, ShowEvent, TalentAct } from '../domain/types';
import { fromMin, lineupOverlaps, toMin } from '../engine/operations';
import { effectiveStatus } from '../engine/provenance';
import { validateAct } from '../domain/talent';
import { useActiveEvent, useStore } from '../state/store';
import { Confirm, Empty, ExternalLink, Field, MoneyInput, NumInput, Panel, StatusBadge, Tag } from '../ui/kit';

const ACT_TYPES: TalentAct['actType'][] = ['stand-up comedy', 'solo musician', 'band', 'DJ', 'speaker', 'host/emcee', 'magician', 'dancer', 'cultural', 'specialty', 'family'];
const ROUTE_LABEL = { agency_page: 'Agency / management booking page', contact_form: 'Official contact form', business_email: 'Published business email', booking_phone: 'Published booking phone' } as const;

export { validateAct };

function routeHref(r: TalentAct['bookingRoute']) {
  if (r.type === 'business_email') return `mailto:${r.value}`;
  if (r.type === 'booking_phone') return `tel:${r.value.replace(/[^\d+]/g, '')}`;
  return r.value;
}

/** `draft` = pre-filled from a discovery result and not yet in the directory. */
export function ActForm({ initial, onDone, draft = false }: { initial?: TalentAct; onDone: () => void; draft?: boolean }) {
  const upsert = useStore((s) => s.upsertAct);
  const user = useStore((s) => s.user.name);
  const [a, setA] = useState<TalentAct>(
    initial ?? { id: uid('act'), stageName: '', actType: 'stand-up comedy', genres: [], homeRegion: '', officialSiteUrl: '', bookingRoute: { type: 'agency_page', value: '' }, sourceUrl: '', verifiedOn: null, lastChecked: nowIso(), status: 'third_party_unverified' },
  );
  const [confirmed, setConfirmed] = useState(initial?.status === 'verified_authoritative');
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        const errs = validateAct(a);
        setErrors(errs);
        if (errs.length) return;
        const routeChanged = initial && (initial.bookingRoute.value !== a.bookingRoute.value || initial.bookingRoute.type !== a.bookingRoute.type);
        const notes = routeChanged && !draft && initial!.bookingRoute.value ? `${a.notes ?? ''}\nSuperseded route archived ${nowIso().slice(0, 10)}: ${initial!.bookingRoute.type} ${initial!.bookingRoute.value}`.trim() : a.notes;
        // A provider-supplied route the user did not change or confirm stays provider-reported.
        const unconfirmed = draft && !routeChanged && initial?.status === 'provider_reported' ? 'provider_reported' : 'third_party_unverified';
        upsert({ ...a, notes, lastChecked: nowIso(), status: confirmed ? 'verified_authoritative' : unconfirmed, verifiedOn: confirmed ? nowIso() : null, ...(confirmed ? { notes: `${notes ?? ''}\nRoute confirmed at source by ${user} ${nowIso().slice(0, 10)}`.trim() } : {}) });
        onDone();
      }}
    >
      <Field label="Public stage name"><input value={a.stageName} onChange={(e) => setA({ ...a, stageName: e.target.value })} /></Field>
      <Field label="Act type"><select value={a.actType} onChange={(e) => setA({ ...a, actType: e.target.value as TalentAct['actType'] })}>{ACT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
      <Field label="Genres / skills (comma separated)"><input value={a.genres.join(', ')} onChange={(e) => setA({ ...a, genres: e.target.value.split(',').map((g) => g.trim()).filter(Boolean) })} /></Field>
      <Field label="Home region"><input value={a.homeRegion} onChange={(e) => setA({ ...a, homeRegion: e.target.value })} placeholder="e.g. Toronto, ON" /></Field>
      <Field label="Official website / profile"><input value={a.officialSiteUrl} onChange={(e) => setA({ ...a, officialSiteUrl: e.target.value })} placeholder="https://…" /></Field>
      <Field label="Booking route type"><select value={a.bookingRoute.type} onChange={(e) => setA({ ...a, bookingRoute: { ...a.bookingRoute, type: e.target.value as TalentAct['bookingRoute']['type'] } })}>{Object.entries(ROUTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Booking route" hint="Only a route the act or its representative publishes. Never a guessed or private contact."><input value={a.bookingRoute.value} onChange={(e) => setA({ ...a, bookingRoute: { ...a.bookingRoute, value: e.target.value } })} /></Field>
      <Field label="Representative (as published)"><input value={a.bookingRoute.representative ?? ''} onChange={(e) => setA({ ...a, bookingRoute: { ...a.bookingRoute, representative: e.target.value } })} /></Field>
      <Field label="Source URL" hint="The page where you found this booking route."><input value={a.sourceUrl} onChange={(e) => setA({ ...a, sourceUrl: e.target.value })} placeholder="https://…" /></Field>
      <label className="check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I opened the source today and it publishes this booking route</label>
      {errors.length > 0 && <ul className="error" role="alert">{errors.map((x) => <li key={x}>{x}</li>)}</ul>}
      <div className="form-actions"><button className="btn primary" type="submit">{initial ? 'Save act' : 'Add act'}</button><button type="button" className="btn ghost" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

function Lineup({ ev }: { ev: ShowEvent }) {
  const acts = useStore((s) => s.acts);
  const update = useStore((s) => s.updateEvent);
  const overlaps = lineupOverlaps(ev.lineup);
  const overlapIds = new Set(overlaps.flatMap((o) => [o.a, o.b]));
  const patch = (id: string, p: Partial<LineupSlot>, what: string) => update(ev.id, (e) => ({ ...e, lineup: e.lineup.map((l) => (l.id === id ? { ...l, ...p } : l)) }), what, { coalesceKey: `${id}-${what}` });
  if (!ev.lineup.length) return <Empty title="No acts on this event yet">Add acts from the directory. A directory entry is not a booking.</Empty>;
  return (
    <table className="table">
      <thead><tr><th>Act</th><th>Role</th><th>Session</th><th>Start</th><th>Mins</th><th>Inquiry</th><th>Fee (private quote)</th><th>Rider</th><th /></tr></thead>
      <tbody>
        {[...ev.lineup].sort((a, b) => toMin(a.startLocal) - toMin(b.startLocal)).map((l) => {
          const act = acts.find((a) => a.id === l.actId);
          return (
            <tr key={l.id} className={overlapIds.has(l.id) ? 'row-warn' : ''}>
              <td>{act?.stageName ?? 'Removed act'}{overlapIds.has(l.id) && <div className="error small">Overlapping set window</div>}</td>
              <td><select aria-label="Role" value={l.role} onChange={(e) => patch(l.id, { role: e.target.value as LineupSlot['role'] }, 'role')}>{['headliner', 'feature', 'opener', 'host', 'support'].map((r) => <option key={r}>{r}</option>)}</select></td>
              <td><select aria-label="Session" value={l.sessionId} onChange={(e) => patch(l.id, { sessionId: e.target.value }, 'session')}>{ev.sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
              <td><input aria-label="Start" type="time" value={l.startLocal} onChange={(e) => patch(l.id, { startLocal: e.target.value }, 'start')} /></td>
              <td><NumInput ariaLabel="Duration" value={l.durationMin} min={1} width={64} onChange={(v) => patch(l.id, { durationMin: v ?? 1 }, 'duration')} /></td>
              <td>
                <select aria-label="Inquiry state" value={l.inquiry.state} onChange={(e) => patch(l.id, { inquiry: { ...l.inquiry, state: e.target.value as LineupSlot['inquiry']['state'], date: nowIso() } }, 'inquiry')}>
                  {['not_contacted', 'inquiry_sent', 'responded', 'offer_made', 'contracted', 'declined'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                {l.inquiry.date && <div className="muted small">{l.inquiry.date.slice(0, 10)}</div>}
              </td>
              <td><MoneyInput ariaLabel="Fee" value={l.feeMinor} currency={ev.currency} onChange={(v) => patch(l.id, { feeMinor: v }, 'fee')} placeholder="not quoted" /></td>
              <td><input type="checkbox" aria-label="Rider received" checked={l.riderReceived} onChange={(e) => patch(l.id, { riderReceived: e.target.checked }, 'rider')} /></td>
              <td><button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, lineup: e.lineup.filter((x) => x.id !== l.id), schedule: e.schedule.filter((b) => b.id !== `set-${l.id}`) }), `remove ${act?.stageName} from lineup`)}>Remove</button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Spotlight() {
  const acts = useStore((s) => s.acts);
  const removeAct = useStore((s) => s.removeAct);
  const upsert = useStore((s) => s.upsertAct);
  const update = useStore((s) => s.updateEvent);
  const setToast = useStore((s) => s.setToast);
  const ev = useActiveEvent();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const now = new Date();
  const list = acts.filter((a) => (!type || a.actType === type) && `${a.stageName} ${a.genres.join(' ')} ${a.homeRegion}`.toLowerCase().includes(q.toLowerCase()));

  const addToLineup = (a: TalentAct) => {
    if (!ev) return;
    const s = ev.sessions[0];
    const last = ev.lineup.filter((l) => l.sessionId === s.id).reduce((m, l) => Math.max(m, toMin(l.startLocal) + l.durationMin), toMin(s.show));
    const slot: LineupSlot = { id: uid('slot'), actId: a.id, sessionId: s.id, startLocal: fromMin(last), durationMin: 20, role: ev.lineup.length ? 'feature' : 'host', inquiry: { state: 'not_contacted' }, feeMinor: null, riderReceived: false };
    update(ev.id, (e) => ({
      ...e,
      lineup: [...e.lineup, slot],
      // Proposed performance block and rider task — requirements stay unconfirmed until the rider arrives.
      schedule: [...e.schedule, { id: `set-${slot.id}`, sessionId: s.id, kind: 'show', label: `Set: ${a.stageName} (proposed)`, start: slot.startLocal, end: fromMin(toMin(slot.startLocal) + slot.durationMin) }],
      tasks: [...e.tasks, { id: uid('task'), title: `Request technical rider & hospitality needs from ${a.stageName}`, owner: '', done: false, module: 'spotlight' }],
    }), `add ${a.stageName} to lineup`);
    setToast(`${a.stageName} added as a proposed slot — not a booking. Fee and rider are unconfirmed.`);
  };

  return (
    <div className="stack">
      <h1>Spotlight</h1>
      <p className="lede">A directory of real acts with their <b>publicly published</b> booking routes — each one traceable to a source page. SHOWTIME ships with no pre-loaded acts: every entry is added and checked by your team, and nothing here is a confirmed booking, a fee, or availability.</p>
      {ev && <Panel title={`Lineup — ${ev.title}`}><Lineup ev={ev} /></Panel>}
      <Panel title={`Directory (${acts.length})`} actions={<button className="btn sm" onClick={() => setAdding(true)}>+ Add act</button>}>
        {adding && <ActForm onDone={() => setAdding(false)} />}
        <div className="row gap wrap filters">
          <input aria-label="Search acts" placeholder="Search name, genre, region…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Act type" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{ACT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        {!list.length ? (
          <Empty title={acts.length ? 'No acts match' : 'No acts in your directory yet'}>Add an act with its official site, the page that publishes its booking route, and the route itself.</Empty>
        ) : (
          <div className="cards">
            {list.map((a) => {
              const st = effectiveStatus(a.status, a.lastChecked, 'talent', now);
              return editing === a.id ? (
                <div key={a.id} className="card wide"><ActForm initial={a} onDone={() => setEditing(null)} /></div>
              ) : (
                <div key={a.id} className="card act-card">
                  <div className="row between"><strong>{a.stageName}</strong><StatusBadge status={st} /></div>
                  <div className="muted small">{a.actType} · {a.homeRegion || 'region not stated'}</div>
                  <div className="row gap wrap">{a.genres.map((g) => <Tag key={g}>{g}</Tag>)}</div>
                  <div className="small">{ROUTE_LABEL[a.bookingRoute.type]}{a.bookingRoute.representative && ` · ${a.bookingRoute.representative}`}</div>
                  <div className="row gap wrap small">
                    <ExternalLink href={a.officialSiteUrl}>Official site</ExternalLink>
                    <ExternalLink href={a.sourceUrl}>Source</ExternalLink>
                    <a className="ext" href={routeHref(a.bookingRoute)} target="_blank" rel="noopener noreferrer">{a.bookingRoute.type === 'business_email' ? 'Contact public booking representative' : 'Visit official booking page'} ↗</a>
                  </div>
                  <div className="muted small">Last checked {a.lastChecked.slice(0, 10)}{a.verifiedOn && ` · verified ${a.verifiedOn.slice(0, 10)}`}</div>
                  {a.notes && <details className="small"><summary>History</summary><pre>{a.notes}</pre></details>}
                  <div className="row gap wrap">
                    {ev && <button className="btn sm" onClick={() => addToLineup(a)} disabled={ev.lineup.some((l) => l.actId === a.id)}>{ev.lineup.some((l) => l.actId === a.id) ? 'In lineup' : 'Add to lineup'}</button>}
                    {a.bookingRoute.type === 'business_email' && ev && (
                      <a className="btn ghost sm" href={`mailto:${a.bookingRoute.value}?subject=${encodeURIComponent(`Availability inquiry: ${ev.title}`)}&body=${encodeURIComponent(`Hello,\n\nWe are planning "${ev.title}" on ${ev.sessions[0]?.date}. Is ${a.stageName} available, and what are the terms?\n\nThanks`)}`}>Request availability (opens your email)</a>
                    )}
                    <button className="btn ghost sm" onClick={() => upsert({ ...a, status: 'stale', notes: `${a.notes ?? ''}\nMarked for re-verification ${nowIso().slice(0, 10)}`.trim() })}>Flag route as uncertain</button>
                    <button className="btn ghost sm" onClick={() => setEditing(a.id)}>Edit / correct</button>
                    <Confirm label="Remove this act?" danger onConfirm={() => removeAct(a.id)}>Remove</Confirm>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
