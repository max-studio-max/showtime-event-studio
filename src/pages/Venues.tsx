import { useMemo, useState } from 'react';
import { venues } from '../data/venues';
import { allEvidence, deriveEvent, venueCapacityFor } from '../domain/derive';
import { applyVenue, nowIso, uid } from '../domain/factory';
import type { ShowEvent, SourceEvidence, Venue } from '../domain/types';
import { isHttpUrl } from '../engine/provenance';
import { useActiveEvent, useStore } from '../state/store';
import { Badge, Empty, ExternalLink, Field, Len, Panel, StatusBadge, Tag, useFmtMoney, useWorkspaceData } from '../ui/kit';

const FIDELITY_LABEL = { verified_dimensions: 'Verified dimensions', partial_dimensions: 'Partial dimensions', illustrative: 'Illustrative model' } as const;

export function FidelityBadge({ f }: { f: keyof typeof FIDELITY_LABEL }) {
  return <span className={`fidelity fid-${f}`} title="3D geometry fidelity">{f === 'verified_dimensions' ? '◆' : f === 'partial_dimensions' ? '◈' : '◇'} {FIDELITY_LABEL[f]}</span>;
}

function EvidenceTable({ venue }: { venue: Venue }) {
  const ws = useWorkspaceData();
  const user = useStore((s) => s.user.name);
  const addEvidence = useStore((s) => s.addEvidence);
  const removeEvidence = useStore((s) => s.removeEvidence);
  const [confirmOpen, setConfirmOpen] = useState<string | null>(null);
  const [officialUrl, setOfficialUrl] = useState('');
  const rows = allEvidence(ws).filter((e) => e.entityId === venue.id || venue.configurations.some((c) => c.id === e.entityId));
  const reviewOf = (id: string) => ws.evidence.find((e) => e.fieldPath === `review:${id}`);
  return (
    <table className="table evidence">
      <thead><tr><th>Field</th><th>Value</th><th>Status</th><th>Source</th><th>Retrieved</th><th>Review</th></tr></thead>
      <tbody>
        {rows.filter((r) => !r.fieldPath.startsWith('review:')).map((e) => {
          const review = reviewOf(e.id);
          return (
            <tr key={e.id}>
              <td><code>{e.fieldPath}</code>{e.notes && <div className="muted small">{e.notes}</div>}</td>
              <td>{String(e.assertedValue ?? '—')} {e.unit}</td>
              <td>{review ? <StatusBadge status="verified_authoritative" title={`Reviewed by ${review.reviewerId} on ${review.retrievedAt.slice(0, 10)}`} /> : <StatusBadge status={e.verificationStatus} />}</td>
              <td><ExternalLink href={e.sourceUrl}>{e.publisher}</ExternalLink><div className="muted small">{e.extractionMethod}</div></td>
              <td>{e.retrievedAt.slice(0, 10)}</td>
              <td>
                {review ? (
                  <button className="btn ghost sm" onClick={() => removeEvidence(review.id)}>Withdraw review</button>
                ) : confirmOpen === e.id && e.providerId ? (
                  <span className="confirm">
                    Official venue page that states {String(e.assertedValue)} {e.unit}:
                    <input aria-label="Official source URL" placeholder="https://venue site…" value={officialUrl} onChange={(x) => setOfficialUrl(x.target.value)} />
                    <button className="btn sm" disabled={!isHttpUrl(officialUrl)} onClick={() => {
                      // A provider's own page is not authoritative; the review records the official page instead.
                      addEvidence({ ...e, id: uid('rev'), fieldPath: `review:${e.id}`, reviewerId: user, retrievedAt: nowIso(), verificationStatus: 'verified_authoritative', sourceType: 'official_venue_website', sourceUrl: officialUrl, publisher: new URL(officialUrl).hostname, extractionMethod: 'Manual review at the official source', verificationMethod: 'user_reviewed', lastVerifiedBy: user, notes: `Reviewer confirmed ${e.fieldPath} on the official page` });
                      setConfirmOpen(null);
                      setOfficialUrl('');
                    }}>Confirm</button>
                    <button className="btn ghost sm" onClick={() => setConfirmOpen(null)}>Cancel</button>
                  </span>
                ) : confirmOpen === e.id ? (
                  <span className="confirm">
                    I opened the source and it states {String(e.assertedValue)} {e.unit}.
                    <button className="btn sm" onClick={() => {
                      addEvidence({ ...e, id: uid('rev'), fieldPath: `review:${e.id}`, reviewerId: user, retrievedAt: nowIso(), verificationStatus: 'verified_authoritative', extractionMethod: 'Manual review at source', notes: `Reviewer confirmed ${e.fieldPath}` });
                      setConfirmOpen(null);
                    }}>Confirm</button>
                    <button className="btn ghost sm" onClick={() => setConfirmOpen(null)}>Cancel</button>
                  </span>
                ) : e.providerId ? (
                  <button className="btn ghost sm" onClick={() => setConfirmOpen(e.id)}>Confirm at official source…</button>
                ) : e.sourceUrl && !ws.evidence.some((x) => x.id === e.id) ? (
                  <button className="btn ghost sm" onClick={() => setConfirmOpen(e.id)}>Review at source…</button>
                ) : ws.evidence.some((x) => x.id === e.id) ? (
                  <button className="btn ghost sm" onClick={() => removeEvidence(e.id)}>Remove</button>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AddSource({ venue }: { venue: Venue }) {
  const addEvidence = useStore((s) => s.addEvidence);
  const user = useStore((s) => s.user.name);
  const [cfg, setCfg] = useState(venue.configurations[0].id);
  const [value, setValue] = useState('');
  const [url, setUrl] = useState('');
  const [publisher, setPublisher] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(value);
        if (!Number.isInteger(n) || n <= 0) return setErr('Capacity must be a positive whole number');
        if (!isHttpUrl(url)) return setErr('A source URL is required');
        const ev: SourceEvidence = { id: uid('ev'), entityType: 'venue_config', entityId: cfg, fieldPath: 'capacity', assertedValue: n, unit: 'seats', sourceType: 'official_venue_website', sourceUrl: url, publisher: publisher || new URL(url).hostname, retrievedAt: nowIso(), extractionMethod: `Manual entry by ${user}`, reviewerId: null, verificationStatus: 'third_party_unverified', confidenceClass: 'low', usagePolicy: 'Link only' };
        addEvidence(ev);
        setErr(null);
        setValue('');
        setUrl('');
      }}
    >
      <strong>Record another capacity source</strong>
      <p className="muted small">If it disagrees with the existing figure, both are kept and the venue is marked conflicted until confirmed. Figures are never averaged.</p>
      <div className="row gap wrap">
        <Field label="Configuration"><select value={cfg} onChange={(e) => setCfg(e.target.value)}>{venue.configurations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Capacity"><input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" /></Field>
        <Field label="Source URL"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></Field>
        <Field label="Publisher"><input value={publisher} onChange={(e) => setPublisher(e.target.value)} /></Field>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn sm" type="submit">Add source</button>
    </form>
  );
}

function UseForEvent({ venue, ev }: { venue: Venue; ev: ShowEvent }) {
  const update = useStore((s) => s.updateEvent);
  const setToast = useStore((s) => s.setToast);
  const go = useStore((s) => s.go);
  const ws = useWorkspaceData();
  const fmt = useFmtMoney();
  const [cfg, setCfg] = useState(venue.configurations[0].id);
  const preview = useMemo(() => {
    const { event, changes } = applyVenue(ev, venue, cfg);
    return { event, changes, before: deriveEvent(ev, ws), after: deriveEvent(event, ws) };
  }, [ev, venue, cfg, ws]);
  const row = (label: string, a: string | number | null, b: string | number | null) => (
    <tr key={label}><td>{label}</td><td>{a ?? '—'}</td><td>{b ?? '—'}</td></tr>
  );
  return (
    <div className="impact">
      <div className="row gap wrap">
        <Field label="Configuration"><select value={cfg} onChange={(e) => setCfg(e.target.value)}>{venue.configurations.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.capacity ?? 'capacity unknown'})</option>)}</select></Field>
      </div>
      <h4>Change impact preview</h4>
      <ul className="plain small">{preview.changes.map((c) => <li key={c}>• {c}</li>)}</ul>
      <table className="table compact">
        <thead><tr><th /><th>Now</th><th>After</th></tr></thead>
        <tbody>
          {row('Venue', preview.before.venue?.space ?? null, venue.space)}
          {row('Proposed seats in layout', preview.before.analysis.seating.usable.length, preview.after.analysis.seating.usable.length)}
          {row('Available tickets', preview.before.capacity.available, preview.after.capacity.available)}
          {row('Base gross ticket revenue', preview.before.finance.cases ? fmt(preview.before.finance.cases.base.grossTicketMinor, ev.currency) : null, preview.after.finance.cases ? fmt(preview.after.finance.cases.base.grossTicketMinor, preview.event.currency) : null)}
          {row('Open issues', preview.before.issues.length, preview.after.issues.length)}
        </tbody>
      </table>
      <button
        className="btn primary"
        onClick={() => {
          update(ev.id, () => preview.event, `Venue set to ${venue.space} (${venue.configurations.find((c) => c.id === cfg)?.name})`);
          setToast(`${ev.title} now uses ${venue.space}. Unverified items stay flagged.`);
          go('studio');
        }}
      >
        Apply to “{ev.title}”
      </button>
    </div>
  );
}

function VenueDetail({ venue }: { venue: Venue }) {
  const ev = useActiveEvent();
  const ws = useWorkspaceData();
  const fmt = useFmtMoney();
  return (
    <Panel title={`${venue.space} — ${venue.campus}`} className="venue-detail">
      <div className="row gap wrap">
        <FidelityBadge f={venue.geometryFidelity} />
        <Tag>{venue.locality}</Tag>
        <Tag>{venue.roomType}</Tag>
        <Tag tone={venue.indoor ? 'neutral' : 'warn'}>{venue.indoor ? 'Indoor' : 'Outdoor'}</Tag>
        <Tag tone="info">Availability: unknown — inquiry only</Tag>
      </div>
      <div className="grid-2">
        <div>
          <h3>Configurations</h3>
          <table className="table compact">
            <thead><tr><th>Configuration</th><th>Capacity</th><th>Status</th></tr></thead>
            <tbody>
              {venue.configurations.map((c) => {
                const vc = venueCapacityFor(c, ws, new Date());
                return (
                  <tr key={c.id}>
                    <td>{c.name}{c.breakdown && <div className="muted small">{c.breakdown.map((b) => `${b.count} ${b.label.toLowerCase()}`).join(' / ')}</div>}</td>
                    <td className="num">{vc.value ?? <span className="missing">Unknown</span>}</td>
                    <td><StatusBadge status={vc.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h3>Stage (published)</h3>
          {venue.stage.widthM || venue.stage.depthM ? (
            <p>
              {venue.stage.prosceniumWidthM && <>Proscenium <Len m={venue.stage.prosceniumWidthM} /> · </>}
              Width <Len m={venue.stage.widthM!} /> × depth <Len m={venue.stage.depthM!} /> <Badge kind="Source available" />
            </p>
          ) : (
            <p className="missing">No stage dimensions transcribed — measure or obtain the venue plan.</p>
          )}
          <h3>Published rates</h3>
          {venue.publishedRates.length ? (
            venue.publishedRates.map((r) => (
              <p key={r.evidenceId}>{fmt(r.amountMinor, r.currency)} {r.basis} {r.indicative && <Tag tone="warn">Indicative — not a quote</Tag>}</p>
            ))
          ) : (
            <p className="missing">No published rate — Request quote</p>
          )}
        </div>
        <div>
          <h3>Booking route</h3>
          <p>{venue.bookingRoute}</p>
          <ul className="plain">
            {venue.officialUrls.map((u) => (
              <li key={u}>
                <ExternalLink href={u}>{!venue.provider ? 'Official source' : u === venue.provider.listingUrl ? `${venue.provider.id === 'ticketmaster' ? 'Ticketmaster' : 'OpenStreetMap'} listing` : 'Website (as mapped — confirm it is official)'}</ExternalLink>
              </li>
            ))}
          </ul>
          {venue.provider && <p className="small muted">Saved {venue.provider.savedAt.slice(0, 10)} · {venue.provider.attribution}</p>}
          {venue.features.length > 0 && <><h3>Published features</h3><ul>{venue.features.map((f) => <li key={f}>{f}</li>)}</ul></>}
          {venue.restrictions.length > 0 && <><h3>Restrictions</h3><ul>{venue.restrictions.map((f) => <li key={f}>{f}</li>)}</ul></>}
          <h3>Still to verify</h3>
          <ul className="checklist">{venue.unverifiedChecklist.map((f) => <li key={f} className="todo"><span aria-hidden>○</span> {f}</li>)}</ul>
        </div>
      </div>
      <details open>
        <summary>Evidence ({venue.configurations.reduce((s, c) => s + c.evidenceIds.length, 0) + venue.stage.evidenceIds.length} transcribed records)</summary>
        <EvidenceTable venue={venue} />
        <AddSource venue={venue} />
      </details>
      <h3>Use this space</h3>
      {ev ? <UseForEvent venue={venue} ev={ev} /> : <p className="muted">Select or create an event to apply this venue.</p>}
    </Panel>
  );
}

function BookingState() {
  const ev = useActiveEvent();
  const update = useStore((s) => s.updateEvent);
  if (!ev?.venueId) return null;
  return (
    <Panel title="Venue booking state for active event">
      <p className="muted small">A booking state is what you have recorded — SHOWTIME has no live venue calendar. Attach evidence (e.g. the email or contract reference) for holds and confirmations.</p>
      <div className="row gap wrap">
        <select aria-label="Booking state" value={ev.venueBooking.state} onChange={(e) => update(ev.id, (x) => ({ ...x, venueBooking: { ...x.venueBooking, state: e.target.value as ShowEvent['venueBooking']['state'], updatedAt: nowIso() } }), `Venue booking → ${e.target.value}`)}>
          {['none', 'inquiry', 'hold', 'tentative', 'confirmed'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <input aria-label="Booking evidence" placeholder="Evidence reference (email, contract #)" value={ev.venueBooking.evidence ?? ''} onChange={(e) => update(ev.id, (x) => ({ ...x, venueBooking: { ...x.venueBooking, evidence: e.target.value } }), 'booking evidence', { coalesceKey: 'booking-evidence' })} />
        {ev.venueBooking.state === 'confirmed' && !ev.venueBooking.evidence && <span className="error">Confirmed without evidence</span>}
      </div>
    </Panel>
  );
}

export function Venues() {
  const [market, setMarket] = useState('');
  const [minCap, setMinCap] = useState('');
  const [suit, setSuit] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const ws = useWorkspaceData();
  const go = useStore((s) => s.go);
  const removeVenue = useStore((s) => s.removeVenue);
  const events = useStore((s) => s.events);
  const all = [...venues, ...ws.venues];
  const markets = [...new Set(all.map((v) => v.market))].sort();
  const list = all.filter((v) => (!market || v.market === market) && (!suit || v.suitability.includes(suit)) && (!minCap || v.configurations.some((c) => (c.capacity ?? 0) >= Number(minCap))));
  const selected = all.find((v) => v.id === sel);
  const cmp = all.filter((v) => compare.includes(v.id));
  return (
    <div className="stack">
      <h1>Venue Explorer</h1>
      <p className="lede">Nine seed spaces across Toronto, New York City and Greater Los Angeles, transcribed from official pages and shown as <Badge kind="Source available" /> until someone reviews them at source — plus any venues you save from <button className="link" onClick={() => go('discover')}>Discover</button>, shown as <Badge kind="Provider-reported" />. No venue here is a measured digital twin, and none has live availability.</p>
      <BookingState />
      <div className="row gap wrap filters">
        <Field label="Market"><select value={market} onChange={(e) => setMarket(e.target.value)}><option value="">All</option>{markets.map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Min. capacity"><input inputMode="numeric" value={minCap} onChange={(e) => setMinCap(e.target.value)} /></Field>
        <Field label="Suits"><select value={suit} onChange={(e) => setSuit(e.target.value)}><option value="">Any</option>{['comedy', 'concert', 'panel', 'conference', 'gala', 'wedding', 'festival', 'community'].map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
      <div className="cards">
        {list.map((v) => (
          <div key={v.id} className={`card venue-card ${sel === v.id ? 'is-active' : ''}`}>
            <button className="card-main" onClick={() => setSel(v.id)}>
              <small className="muted">{v.market}{v.provider && ` · saved from ${v.provider.id === 'ticketmaster' ? 'Ticketmaster' : 'OpenStreetMap'}`}</small>
              <strong>{v.space}</strong>
              <span className="muted">{v.campus}</span>
              <span>{v.configurations.map((c) => `${c.name}: ${c.capacity ?? 'unknown'}`).join(' · ')}</span>
              <FidelityBadge f={v.geometryFidelity} />
            </button>
            <label className="check small">
              <input type="checkbox" checked={compare.includes(v.id)} disabled={!compare.includes(v.id) && compare.length >= 3} onChange={(e) => setCompare(e.target.checked ? [...compare, v.id] : compare.filter((x) => x !== v.id))} /> Compare
            </label>
            {v.provider && (events.some((e) => e.venueId === v.id) ? <span className="small muted">In use by an event</span> : <button className="btn ghost sm" onClick={() => removeVenue(v.id)}>Remove saved venue</button>)}
          </div>
        ))}
        {!list.length && <Empty title="No venues match these filters" />}
      </div>
      {cmp.length >= 2 && (
        <Panel title="Comparison" actions={<button className="btn ghost sm" onClick={() => setCompare([])}>Clear</button>}>
          <table className="table">
            <thead><tr><th>Attribute</th>{cmp.map((v) => <th key={v.id}>{v.space}</th>)}</tr></thead>
            <tbody>
              <tr><td>Market</td>{cmp.map((v) => <td key={v.id}>{v.locality}</td>)}</tr>
              <tr><td>Configurations</td>{cmp.map((v) => <td key={v.id}>{v.configurations.map((c) => { const vc = venueCapacityFor(c, ws, new Date()); return <div key={c.id}>{c.name}: {vc.value ?? 'unknown'} <StatusBadge status={vc.status} /></div>; })}</td>)}</tr>
              <tr><td>Stage W × D</td>{cmp.map((v) => <td key={v.id}>{v.stage.widthM ? <><Len m={v.stage.widthM} /> × <Len m={v.stage.depthM!} /></> : <span className="missing">Unknown</span>}</td>)}</tr>
              <tr><td>Published rate</td>{cmp.map((v) => <td key={v.id}>{v.publishedRates[0] ? `${(v.publishedRates[0].amountMinor / 100).toLocaleString()} ${v.publishedRates[0].currency} ${v.publishedRates[0].basis} (indicative)` : <span className="missing">Request quote</span>}</td>)}</tr>
              <tr><td>Indoor</td>{cmp.map((v) => <td key={v.id}>{v.indoor ? 'Yes' : 'No (outdoor)'}</td>)}</tr>
              <tr><td>3D fidelity</td>{cmp.map((v) => <td key={v.id}><FidelityBadge f={v.geometryFidelity} /></td>)}</tr>
              <tr><td>Date availability</td>{cmp.map((v) => <td key={v.id}><span className="missing">Unknown — inquire</span></td>)}</tr>
              <tr><td>Unknown attributes</td>{cmp.map((v) => <td key={v.id}>{v.unverifiedChecklist.length}</td>)}</tr>
            </tbody>
          </table>
        </Panel>
      )}
      {selected && <VenueDetail key={selected.id} venue={selected} />}
    </div>
  );
}
