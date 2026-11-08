import { useMemo, useState } from 'react';
import { findVenue } from '../domain/derive';
import { nowIso, uid } from '../domain/factory';
import type { ProviderId, SavedReference, SupplierCategory, TalentAct } from '../domain/types';
import { adoptService, adoptVenue, performerDraft, referenceFor } from '../integrations/adopt';
import { useApi, type ApiResult } from '../integrations/client';
import { SUPPLIER_CATEGORIES, type DiscoveredEvent, type DiscoveredPerformer, type DiscoveredService, type DiscoveredVenue, type Envelope, type GatewayError, type PerformerLinks } from '../integrations/contracts';
import { PROVIDERS } from '../integrations/providers';
import { useActiveEvent, useStore } from '../state/store';
import { Badge, Empty, ExternalLink, Field, Panel, Tag, useWorkspaceData } from '../ui/kit';
import { api } from '../integrations/client';
import { ActForm } from './Spotlight';

type Tab = 'venues' | 'events' | 'performers' | 'services';
type Any = DiscoveredVenue | DiscoveredEvent | DiscoveredPerformer | DiscoveredService;

const ERROR_HELP: Partial<Record<GatewayError['code'], string>> = {
  disabled: 'Turn the provider on in Team & Settings → Live data providers.',
  gateway_offline: 'Run “npm run gateway” in the project folder (or “npm run dev:all”).',
  not_configured: 'Add your free Ticketmaster key to .env as TICKETMASTER_API_KEY and restart the gateway.',
  rate_limited: 'The provider’s rate limit was reached. Wait and try again.',
  budget_exhausted: 'Today’s request budget for this provider is used up; it resets at midnight UTC.',
  circuit_open: 'The provider failed repeatedly, so requests are paused briefly to avoid hammering it.',
  timeout: 'The provider did not answer in time — public OpenStreetMap servers are often busy. Try again shortly.',
  upstream_error: 'The provider is having trouble. Nothing was invented in its place.',
  unauthorized: 'The provider rejected the API key. Check TICKETMASTER_API_KEY.',
};

export function ErrorState({ error }: { error: GatewayError }) {
  return (
    <div className={`net-state net-${error.code}`} role="alert">
      <strong>{error.code === 'disabled' ? 'Provider switched off' : error.code === 'gateway_offline' ? 'Gateway offline' : error.code === 'not_configured' ? 'Not configured' : 'Provider unavailable'}</strong>
      <p>{error.message}{error.retryAfterSec ? ` (retry in ${error.retryAfterSec} s)` : ''}</p>
      {ERROR_HELP[error.code] && <p className="muted small">{ERROR_HELP[error.code]}</p>}
      <p className="muted small">The rest of SHOWTIME keeps working offline.</p>
    </div>
  );
}

function Meta<T>({ env }: { env: Envelope<T> }) {
  return (
    <p className="small muted">
      {env.results.length} result(s){env.page?.totalElements != null ? ` of ${env.page.totalElements}` : ''} · {env.attribution} · retrieved {new Date(env.retrievedAt).toLocaleString()}
      {env.cached && ' (gateway cache)'}
      {env.rejected > 0 && ` · ${env.rejected} malformed record(s) skipped`}
      {env.notice && <><br />{env.notice}</>}
    </p>
  );
}

function ResultCard({ r, onCompare, comparing }: { r: Any; onCompare: () => void; comparing: boolean }) {
  const ev = useActiveEvent();
  const ws = useWorkspaceData();
  const upsertRef = useStore((s) => s.upsertReference);
  const upsertVenue = useStore((s) => s.upsertVenue);
  const upsertSupplier = useStore((s) => s.upsertSupplier);
  const mergeEvidence = useStore((s) => s.mergeEvidence);
  const update = useStore((s) => s.updateEvent);
  const setToast = useStore((s) => s.setToast);
  const go = useStore((s) => s.go);
  const [links, setLinks] = useState<ApiResult<PerformerLinks> | null>(null);
  const [draft, setDraft] = useState<TalentAct | null>(null);
  const saved = ws.references.find((x) => x.providerId === r.provider && x.providerRecordId === r.providerRecordId);

  const save = (eventIds: string[] = saved?.eventIds ?? []) => {
    upsertRef({ ...referenceFor(r, nowIso(), eventIds), note: saved?.note });
  };

  return (
    <div className="card result-card">
      <div className="row between gap">
        <strong>{r.name}</strong>
        <Badge kind="Provider-reported" title={`${PROVIDERS[r.provider].name} — not reviewed at the authoritative source`} />
      </div>
      {r.kind === 'venue' && (
        <div className="small">
          {r.address ?? <span className="missing">Address not published</span>} {r.city && `· ${r.city}`}
          <div className="row gap wrap">
            {r.venueType && <Tag>{r.venueType.replace(/_/g, ' ')}</Tag>}
            <Tag tone={r.capacity == null ? 'warn' : 'info'}>{r.capacity == null ? 'capacity not published' : `capacity tag ${r.capacity} (unconfirmed)`}</Tag>
            {r.upcomingEvents != null && <Tag>{r.upcomingEvents} upcoming events</Tag>}
            {r.wheelchair && <Tag>wheelchair: {r.wheelchair}</Tag>}
          </div>
          {r.website && <ExternalLink href={r.website}>Website (as mapped)</ExternalLink>}
        </div>
      )}
      {r.kind === 'event' && (
        <div className="small">
          {r.localDate ?? 'date TBA'} {r.localTime?.slice(0, 5)} · {r.venueName ?? 'venue not listed'}{r.city ? `, ${r.city}` : ''}
          <div className="row gap wrap">
            {r.segment && <Tag>{r.segment}</Tag>}
            {r.genre && r.genre !== 'Undefined' && <Tag>{r.genre}</Tag>}
            {r.status && <Tag tone={r.status === 'onsale' ? 'good' : 'neutral'}>{r.status}</Tag>}
          </div>
          {r.priceRanges.length ? r.priceRanges.map((p, i) => <div key={i}>Published price range: {p.min ?? '?'}–{p.max ?? '?'} {p.currency}{p.type ? ` (${p.type})` : ''} <span className="muted">— face value as reported; fees may apply</span></div>) : <div className="missing">No price range published</div>}
        </div>
      )}
      {r.kind === 'performer' && (
        <div className="small">
          {[r.segment, r.area ?? r.country, r.disambiguation].filter(Boolean).join(' · ') || <span className="muted">No profile details from provider</span>}
          <div className="row gap wrap">{r.genres.map((g) => <Tag key={g}>{g}</Tag>)}{r.upcomingEvents != null && <Tag>{r.upcomingEvents} upcoming events</Tag>}</div>
          <p className="warn-text">A search result is not a booking route. Add to the directory only with a route published by the act or its representative.</p>
        </div>
      )}
      {r.kind === 'service' && (
        <div className="small">
          {r.address ?? <span className="missing">Address not published</span>}
          <div className="row gap wrap">
            <Tag>{SUPPLIER_CATEGORIES[r.category].label}</Tag>
            {r.phone && <Tag>☎ {r.phone}</Tag>}
            {r.openingHours && <Tag>{r.openingHours}</Tag>}
          </div>
          {r.website && <ExternalLink href={r.website}>Website (as mapped)</ExternalLink>}
          <p className="muted">Listed on a map ≠ available, priced or vetted for your event.</p>
        </div>
      )}
      <div className="row gap wrap small">
        <ExternalLink href={r.listingUrl}>{r.provider === 'ticketmaster' ? 'Ticketmaster page' : r.provider === 'musicbrainz' ? 'MusicBrainz entry' : 'OpenStreetMap element'}</ExternalLink>
        <span className="muted">retrieved {new Date(r.evidence[0]?.retrievedAt ?? Date.now()).toLocaleString()}</span>
      </div>
      <div className="row gap wrap">
        <button className="btn ghost sm" onClick={() => save()}>{saved ? 'Shortlisted ✓' : 'Shortlist'}</button>
        <label className="check small"><input type="checkbox" checked={comparing} onChange={onCompare} /> Compare</label>
        {r.kind === 'venue' && (
          <button
            className="btn sm"
            onClick={() => {
              const { venue, evidence } = adoptVenue(r, nowIso(), findVenue(ev?.venueId ?? null, ws)?.market);
              upsertVenue(venue);
              mergeEvidence(evidence);
              save();
              setToast(`${venue.space} saved to Venue Explorer as an illustrative venue. Review its evidence before using it.`);
              go('venues');
            }}
          >
            Save venue & review
          </button>
        )}
        {r.kind === 'event' && ev && (
          <button className="btn sm" onClick={() => { save([...new Set([...(saved?.eventIds ?? []), ev.id])]); setToast(`Saved as a comparable event for “${ev.title}”.`); }}>
            {saved?.eventIds.includes(ev.id) ? 'Comparable for this event ✓' : 'Add as comparable event'}
          </button>
        )}
        {r.kind === 'performer' && (
          <>
            {(r.musicbrainzId || r.provider === 'musicbrainz') && (
              <button className="btn ghost sm" onClick={async () => setLinks(await api<PerformerLinks>(`/api/discovery/performers/musicbrainz/${r.musicbrainzId}/links`, {}, 'musicbrainz'))}>Look up official links</button>
            )}
            <button className="btn sm" onClick={() => setDraft(performerDraft(r, links?.ok ? links.data : null, nowIso()).draft)}>Draft directory entry…</button>
          </>
        )}
        {r.kind === 'service' && (
          <button
            className="btn sm"
            onClick={() => {
              const { supplier, evidence } = adoptService(r, nowIso());
              upsertSupplier(supplier);
              mergeEvidence(evidence);
              save();
              if (ev && !ev.supplierAssignments.some((a) => a.supplierId === supplier.id)) {
                update(ev.id, (e) => ({ ...e, supplierAssignments: [...e.supplierAssignments, { id: uid('sa'), supplierId: supplier.id, role: SUPPLIER_CATEGORIES[r.category].label, status: 'proposed', quote: null, category: r.category === 'caterer' ? 'catering_bar' : r.category === 'security' || r.category === 'staffing' ? 'staffing' : r.category === 'av_production' || r.category === 'event_rental' ? 'equipment' : 'other' }] }), `propose supplier ${supplier.name}`);
                setToast(`${supplier.name} proposed for “${ev.title}” — no cost until you confirm a quote in Service.`);
              } else setToast(`${supplier.name} saved to your suppliers.`);
            }}
          >
            {ev ? 'Propose for this event' : 'Save supplier'}
          </button>
        )}
      </div>
      {links && !links.ok && <ErrorState error={links.error} />}
      {links?.ok && (
        <div className="small links-box">
          <b>MusicBrainz links</b> <span className="muted">(community-maintained, provider-reported)</span>
          <div>Official homepage: {links.data.homepages.length ? links.data.homepages.map((u) => <ExternalLink key={u} href={u}>{new URL(u).hostname}</ExternalLink>) : <span className="missing">none listed</span>}</div>
          <div>Booking page: {links.data.bookingPages.length ? links.data.bookingPages.map((u) => <ExternalLink key={u} href={u}>{new URL(u).hostname}</ExternalLink>) : <span className="missing">none listed — find one on the act’s official site</span>}</div>
        </div>
      )}
      {draft && (
        <div className="inline-form">
          <strong>New directory entry from {PROVIDERS[r.provider].name}</strong>
          <p className="small muted">Saving requires a booking route and the page that publishes it. Nothing is sent to the act.</p>
          <ActForm initial={draft} draft onDone={() => { setDraft(null); setToast(`${r.name} added to the Spotlight directory.`); }} />
        </div>
      )}
    </div>
  );
}

function CompareTray({ items, clear }: { items: Any[]; clear: () => void }) {
  const rows = useMemo(() => {
    const snaps = items.map((i) => referenceFor(i, nowIso()).snapshot);
    const keys = [...new Set(snaps.flatMap((s) => Object.keys(s)))];
    return keys.map((k) => ({ k, vals: snaps.map((s) => s[k] ?? null) }));
  }, [items]);
  if (items.length < 2) return null;
  return (
    <Panel title={`Compare (${items.length})`} actions={<button className="btn ghost sm" onClick={clear}>Clear</button>}>
      <p className="small muted">Only attributes the providers published. Blank means unknown, not zero; different units are not converted.</p>
      <table className="table compact">
        <thead><tr><th /> {items.map((i) => <th key={i.key}>{i.name}<div className="muted small">{PROVIDERS[i.provider].name}</div></th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.k}><td>{r.k}</td>{r.vals.map((v, i) => <td key={i}>{v == null || v === '' ? <span className="missing">unknown</span> : String(v)}</td>)}</tr>)}</tbody>
      </table>
    </Panel>
  );
}

function Shortlist() {
  const refs = useStore((s) => s.references);
  const events = useStore((s) => s.events);
  const remove = useStore((s) => s.removeReference);
  const upsert = useStore((s) => s.upsertReference);
  if (!refs.length) return null;
  return (
    <Panel title={`Shortlist & references (${refs.length})`}>
      <table className="table compact">
        <thead><tr><th>Name</th><th>Type</th><th>Source</th><th>Saved snapshot</th><th>Events</th><th>Note</th><th /></tr></thead>
        <tbody>
          {refs.map((r: SavedReference) => (
            <tr key={r.id}>
              <td>{r.url ? <ExternalLink href={r.url}>{r.name}</ExternalLink> : r.name}</td>
              <td>{r.type}</td>
              <td className="small">{PROVIDERS[r.providerId].name}<div className="muted">retrieved {r.retrievedAt.slice(0, 10)}</div></td>
              <td className="small">{Object.entries(r.snapshot).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}</td>
              <td className="small">{r.eventIds.map((id) => events.find((e) => e.id === id)?.title ?? 'deleted event').join(', ') || '—'}</td>
              <td><input aria-label="Note" value={r.note ?? ''} onChange={(e) => upsert({ ...r, note: e.target.value })} /></td>
              <td><button className="btn ghost sm" onClick={() => remove(r.id)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

export function Discover() {
  const ev = useActiveEvent();
  const ws = useWorkspaceData();
  const toggles = useStore((s) => s.settings.providers);
  const go = useStore((s) => s.go);
  const activeVenue = findVenue(ev?.venueId ?? null, ws);
  const [tab, setTab] = useState<Tab>('venues');
  const [city, setCity] = useState(activeVenue?.market === 'Greater Los Angeles' ? 'Los Angeles' : activeVenue?.market ?? 'Toronto');
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState<Record<Tab, ProviderId>>({ venues: 'osm_overpass', events: 'ticketmaster', performers: 'musicbrainz', services: 'osm_overpass' });
  const [category, setCategory] = useState<SupplierCategory>('caterer');
  const [radiusKm, setRadiusKm] = useState(8);
  const [page, setPage] = useState(0);
  const [compare, setCompare] = useState<Any[]>([]);
  const q = useApi<Envelope<Any>>();

  const src = source[tab];
  const search = (p = 0) => {
    setPage(p);
    const path = `/api/discovery/${tab}`;
    const params = { source: src, city: tab === 'performers' ? null : city, keyword: keyword || null, page: p, radiusKm: src === 'osm_overpass' ? radiusKm : null, category: tab === 'services' ? category : null };
    void q.run(path, params, src);
  };

  const allOff = Object.values(toggles).every((v) => !v);
  return (
    <div className="stack">
      <h1>Discover</h1>
      <p className="lede">Search live public sources for venues, comparable events, performers and service suppliers. Results are <Badge kind="Provider-reported" />: real records from the provider, not reviewed at the authoritative source. Saving something never books, buys or contacts anyone.</p>
      {allOff && (
        <div className="net-state net-disabled">
          <strong>All live-data providers are off</strong>
          <p>They start disabled. Turn on the ones you want in Team & Settings → Live data providers.</p>
          <button className="btn sm" onClick={() => go('settings')}>Open provider settings</button>
        </div>
      )}
      <div className="seg" role="tablist" aria-label="Discovery type">
        {(['venues', 'events', 'performers', 'services'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); q.clear(); }}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
      <Panel>
        <form className="row gap wrap filters" onSubmit={(e) => { e.preventDefault(); search(0); }}>
          {tab !== 'events' && tab !== 'services' && (
            <Field label="Source">
              <select value={src} onChange={(e) => setSource({ ...source, [tab]: e.target.value as ProviderId })}>
                {(tab === 'venues' ? ['osm_overpass', 'ticketmaster'] : ['musicbrainz', 'ticketmaster']).map((p) => <option key={p} value={p}>{PROVIDERS[p as ProviderId].name}{toggles[p as ProviderId] ? '' : ' (off)'}</option>)}
              </select>
            </Field>
          )}
          {tab !== 'performers' && <Field label="City"><input required value={city} onChange={(e) => setCity(e.target.value)} /></Field>}
          {tab === 'services' && <Field label="Category"><select value={category} onChange={(e) => setCategory(e.target.value as SupplierCategory)}>{Object.entries(SUPPLIER_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>}
          <Field label={tab === 'performers' ? 'Act name' : 'Keyword (optional)'}><input required={tab === 'performers'} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={tab === 'performers' ? 'e.g. an artist or comedian' : ''} /></Field>
          {src === 'osm_overpass' && <Field label="Radius (km)"><input type="number" min={1} max={25} value={radiusKm} onChange={(e) => setRadiusKm(Math.min(25, Math.max(1, Number(e.target.value) || 1)))} /></Field>}
          <button className="btn primary" type="submit" disabled={q.loading}>{q.loading ? 'Searching…' : 'Search'}</button>
        </form>
        <p className="small muted">{PROVIDERS[src].limitations}</p>
        {q.loading && <p className="muted" role="status">Searching {PROVIDERS[src].name}… public servers can take up to 30 seconds.</p>}
        {!q.loading && q.result && !q.result.ok && <ErrorState error={q.result.error} />}
        {!q.loading && q.result?.ok && (
          <>
            <Meta env={q.result.data} />
            {q.result.data.results.length === 0 ? (
              <Empty title="No results">Try a wider radius, another keyword or a different source. Absence here doesn’t mean nothing exists — coverage varies by provider.</Empty>
            ) : (
              <div className="cards">
                {q.result.data.results.map((r) => (
                  <ResultCard key={r.key} r={r} comparing={compare.some((c) => c.key === r.key)} onCompare={() => setCompare((c) => (c.some((x) => x.key === r.key) ? c.filter((x) => x.key !== r.key) : [...c, r].slice(-3)))} />
                ))}
              </div>
            )}
            {q.result.data.page && (q.result.data.page.totalPages ?? 0) > 1 && (
              <div className="row gap">
                <button className="btn ghost sm" disabled={page === 0} onClick={() => search(page - 1)}>Previous</button>
                <span className="small">Page {page + 1} of {Math.min(q.result.data.page.totalPages ?? 1, 21)}</span>
                <button className="btn ghost sm" disabled={page >= Math.min((q.result.data.page.totalPages ?? 1) - 1, 20)} onClick={() => search(page + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </Panel>
      <CompareTray items={compare} clear={() => setCompare([])} />
      <Shortlist />
    </div>
  );
}
