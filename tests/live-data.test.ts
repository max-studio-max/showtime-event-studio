import { describe, expect, it, vi } from 'vitest';
import * as F from './fixtures/providers';
import { invertDecimal, normalizeBocObservation, normalizeMbLinks, normalizeMbSearch, normalizeNominatim, normalizeOsmService, normalizeOsmVenue, normalizeTmAttraction, normalizeTmEvent, normalizeTmList, normalizeTmVenue, osmElements, overpassQuery, posInt, safeUrl, str } from '../src/integrations/normalize';
import { assertAllowed, ProviderError, ProviderHttp, redact, type HttpDeps } from '../src/integrations/gateway/http';
import { Gateway } from '../src/integrations/gateway/routes';
import { adoptService, adoptVenue, performerDraft, referenceFor } from '../src/integrations/adopt';
import { migrateWorkspace } from '../src/state/migrate';
import { validateAct } from '../src/domain/talent';
import { applyVenue, createEvent } from '../src/domain/factory';
import { deriveEvent, type WorkspaceData } from '../src/domain/derive';
import { mergeObserved, parseMetricRows } from '../src/engine/operations';
import type { DiscoveredVenue } from '../src/integrations/contracts';

const AT = '2026-11-08T12:00:00.000Z';
const NOW = new Date(AT);
const emptyWs = (): WorkspaceData => ({ products: [], offers: [], acts: [], evidence: [], venues: [], suppliers: [], references: [] });

// ------------------------------------------------------------ contract tests

describe('normalizers: Ticketmaster (synthetic fixtures)', () => {
  it('maps venues, keeps unknowns null and rejects records without id or name', () => {
    const r = normalizeTmList(F.tmVenues, 'venues', normalizeTmVenue, AT);
    expect(r.results.map((v) => v.providerRecordId)).toEqual(['SYNTH-VEN-1', 'SYNTH-VEN-2', 'SYNTH-VEN-4']);
    expect(r.rejected).toBe(2);
    const v = r.results[0];
    expect(v).toMatchObject({ key: 'ticketmaster:SYNTH-VEN-1', city: 'Toronto', region: 'ON', countryCode: 'CA', lat: 43.65, lon: -79.38, timezone: 'America/Toronto', upcomingEvents: 12 });
    expect(v.capacity).toBeNull(); // the Discovery API does not publish capacity
    expect(v.website).toBeNull(); // a ticket page is not the venue's site
    expect(r.results[1]).toMatchObject({ address: null, city: null, lat: null, listingUrl: null });
    expect(r.results[2].listingUrl).toBeNull(); // javascript: URL dropped
    expect(r.results[2].lat).toBeNull();
    expect(r.page).toEqual({ number: 0, size: 20, totalElements: 5, totalPages: 1 });
  });
  it('every fact carries field-level, provider-reported evidence', () => {
    const v = normalizeTmVenue(F.tmVenues._embedded.venues[0], AT)!;
    expect(v.evidence.map((e) => e.fieldPath)).toEqual(['name', 'address', 'city', 'timezone', 'upcomingEvents']);
    for (const e of v.evidence) {
      expect(e).toMatchObject({ verificationStatus: 'provider_reported', providerId: 'ticketmaster', providerRecordId: 'SYNTH-VEN-1', retrievedAt: AT, sourceUrl: v.listingUrl });
    }
    // Missing values produce no evidence rows (never a fact with value null)
    expect(normalizeTmVenue({ id: 'X', name: 'Y' }, AT)!.evidence.map((e) => e.fieldPath)).toEqual(['name']);
  });
  it('maps events with published price ranges and skips malformed ranges', () => {
    const r = normalizeTmList(F.tmEvents, 'events', normalizeTmEvent, AT);
    const e = r.results[0];
    expect(e).toMatchObject({ localDate: '2026-12-05', localTime: '20:00:00', status: 'onsale', genre: 'Comedy', venueName: 'Synthetic Hall', attractions: ['Synthetic Comic'] });
    expect(e.priceRanges).toEqual([{ type: 'standard', currency: 'CAD', min: 35, max: 75 }]);
    expect(r.results[1].priceRanges).toEqual([]);
  });
  it('maps attractions without inventing a booking route', () => {
    const a = normalizeTmAttraction(F.tmAttractions._embedded.attractions[0], AT)!;
    expect(a.genres).toEqual(['Comedy']); // "Undefined" sub-genre dropped
    expect(a.homepages).toEqual(['https://synthetic-comic.example/']);
    expect(a.musicbrainzId).toBe('00000000-0000-4000-8000-000000000001');
    expect(JSON.stringify(a)).not.toMatch(/booking/i);
  });
  it('rejects a payload that is not an object', () => {
    expect(() => normalizeTmList('<html>', 'venues', normalizeTmVenue, AT)).toThrow();
    expect(normalizeTmList({}, 'venues', normalizeTmVenue, AT).results).toEqual([]);
  });
});

describe('normalizers: OpenStreetMap, MusicBrainz, Bank of Canada, Nominatim', () => {
  it('OSM venues: capacity only when a clean integer, http(s) URLs only, unnamed/unsupported rejected', () => {
    const els = osmElements(F.osmVenues);
    const vs = els.map((e) => normalizeOsmVenue(e, AT)).filter(Boolean) as DiscoveredVenue[];
    expect(vs.map((v) => v.providerRecordId)).toEqual(['node/1001', 'way/2002']);
    expect(vs[0]).toMatchObject({ capacity: 450, website: 'https://synthetic-theatre.example/', address: '10 Example Ave, Toronto', wheelchair: 'yes', listingUrl: 'https://www.openstreetmap.org/node/1001' });
    expect(vs[1].capacity).toBeNull(); // "approx 500" is not guessed
    expect(vs[1].website).toBeNull(); // ftp:// dropped
    expect(vs[1].lat).toBe(43.66); // way centre
    expect(vs[0].evidence.find((e) => e.fieldPath === 'capacity')).toMatchObject({ assertedValue: 450, unit: 'people', verificationStatus: 'provider_reported', sourceType: 'open_dataset' });
    expect(() => osmElements({ remark: 'runtime error' })).toThrow();
  });
  it('OSM services', () => {
    const s = normalizeOsmService(F.osmCaterers.elements[0], 'caterer', AT)!;
    expect(s).toMatchObject({ category: 'caterer', phone: '+1 416 555 0100', website: null, openingHours: 'Mo-Fr 09:00-17:00' });
  });
  it('Overpass query only admits vetted tag syntax and clamps radius/limit', () => {
    const q = overpassQuery(['amenity=theatre', 'name"]);out;//=x'], 43.65, -79.38, 999_999, 5000);
    expect(q).toContain('nwr["amenity"="theatre"]["name"](around:25000,43.65000,-79.38000);');
    expect(q).not.toContain('out;//');
    expect(q).toContain('out center tags 100;');
  });
  it('MusicBrainz search and links: ended relations ignored, booking pages separated', () => {
    const r = normalizeMbSearch(F.mbSearch, AT);
    expect(r.results).toHaveLength(1);
    expect(r.rejected).toBe(1);
    const l = normalizeMbLinks(F.mbLinks, '00000000-0000-4000-8000-000000000001', AT);
    expect(l.homepages).toEqual(['https://synthetic-band.example/']);
    expect(l.bookingPages).toEqual(['https://agency.example/synthetic-band']);
    expect(l.evidence.every((e) => e.verificationStatus === 'provider_reported')).toBe(true);
  });
  it('Bank of Canada: exact published string, integer inversion, bad payload refused', () => {
    const d = normalizeBocObservation(F.bocUsd, 'FXUSDCAD', 'USD', 'CAD', AT);
    expect(d).toMatchObject({ rate: '1.3912', date: '2026-11-06' });
    expect(normalizeBocObservation(F.bocUsd, 'FXUSDCAD', 'CAD', 'USD', AT).rate).toBe('0.718804');
    expect(invertDecimal('2')).toBe('0.500000');
    expect(invertDecimal('3', 4)).toBe('0.3333');
    expect(() => normalizeBocObservation({ observations: [{ d: '2026-11-06', FXUSDCAD: { v: '0' } }] }, 'FXUSDCAD', 'USD', 'CAD', AT)).toThrow();
    expect(() => normalizeBocObservation({}, 'FXUSDCAD', 'USD', 'CAD', AT)).toThrow();
  });
  it('Nominatim', () => {
    expect(normalizeNominatim(F.nominatimToronto)).toMatchObject({ lat: 43.6534817, lon: -79.3839347, displayName: 'Toronto, Ontario, Canada' });
    expect(normalizeNominatim([])).toBeNull();
  });
  it('text and URL sanitisation', () => {
    expect(str('  a\u0000b\n c  ')).toBe('a b c');
    expect(str('<img onerror=x>')).toBe('<img onerror=x>'); // kept as text; React renders it inert
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,x')).toBeNull();
    expect(posInt('12.5')).toBeNull();
    expect(posInt('-3')).toBeNull();
    expect(posInt('300')).toBe(300);
  });
});

// ------------------------------------------------------------ gateway behaviour

function resp(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

function deps(responses: (Response | Error | (() => Promise<Response>))[]) {
  let t = 1_700_000_000_000;
  const calls: { url: string; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  const d: HttpDeps = {
    fetch: vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const r = responses.shift();
      if (!r) throw new Error('no more responses');
      if (r instanceof Error) throw r;
      return typeof r === 'function' ? r() : r;
    }) as unknown as typeof fetch,
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    random: () => 0,
    log: () => {},
  };
  return { d, calls, sleeps, advance: (ms: number) => (t += ms) };
}

describe('gateway HTTP policy (failure modes)', () => {
  it('401/403/404 are not retried', async () => {
    for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found']] as const) {
      const { d, calls } = deps([resp(status, {})]);
      await expect(new ProviderHttp(d).json('musicbrainz', 'https://musicbrainz.org/ws/2/artist?x')).rejects.toMatchObject({ code });
      expect(calls).toHaveLength(1);
    }
  });
  it('429 honours Retry-After then succeeds', async () => {
    const { d, calls, sleeps } = deps([resp(429, {}, { 'retry-after': '3' }), resp(200, { ok: 1 })]);
    const r = await new ProviderHttp(d).json('musicbrainz', 'https://musicbrainz.org/ws/2/a');
    expect(r.data).toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
    expect(sleeps).toContain(3000);
  });
  it('5xx retries with exponential backoff, uses mirrors, then fails without multiplying beyond the cap', async () => {
    const { d, calls, sleeps } = deps([resp(502, 'busy'), resp(503, 'busy'), resp(504, 'busy')]);
    await expect(new ProviderHttp(d).json('osm_overpass', 'https://overpass-api.de/api/interpreter', { method: 'POST', body: 'q', mirrors: ['https://overpass.kumi.systems/api/interpreter'] })).rejects.toMatchObject({ code: 'upstream_error' });
    expect(calls).toHaveLength(3);
    expect(calls[1].url).toContain('overpass.kumi.systems');
    // Backoff waits (500 ms, then 1000 ms); other sleeps are the provider's request spacing.
    const backoffs = sleeps.filter((s) => s === 500 || s === 1000);
    expect(backoffs[0]).toBe(500);
    expect(backoffs).toContain(1000);
  });
  it('circuit opens after repeated upstream failures and blocks further calls', async () => {
    const { d, calls } = deps(Array.from({ length: 12 }, () => resp(500, 'x')));
    const h = new ProviderHttp(d, 2, 60_000);
    await expect(h.json('bank_of_canada', 'https://www.bankofcanada.ca/a', { maxRetries: 0 })).rejects.toBeInstanceOf(ProviderError);
    await expect(h.json('bank_of_canada', 'https://www.bankofcanada.ca/b', { maxRetries: 0 })).rejects.toBeInstanceOf(ProviderError);
    const before = calls.length;
    await expect(h.json('bank_of_canada', 'https://www.bankofcanada.ca/c', { maxRetries: 0 })).rejects.toMatchObject({ code: 'circuit_open' });
    expect(calls.length).toBe(before);
    expect(h.status('bank_of_canada', true).circuit).toBe('open');
  });
  it('timeout and network errors map to typed codes; malformed JSON is bad_response', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const t = deps([abort]);
    await expect(new ProviderHttp(t.d).json('musicbrainz', 'https://musicbrainz.org/x', { maxRetries: 0 })).rejects.toMatchObject({ code: 'timeout' });
    const n = deps([new TypeError('fetch failed')]);
    await expect(new ProviderHttp(n.d).json('musicbrainz', 'https://musicbrainz.org/x', { maxRetries: 0 })).rejects.toMatchObject({ code: 'network' });
    const m = deps([resp(200, '{"broken":')]);
    await expect(new ProviderHttp(m.d).json('musicbrainz', 'https://musicbrainz.org/x')).rejects.toMatchObject({ code: 'bad_response' });
  });
  it('blocks SSRF: other hosts, http, credentials in URL; redirects are not followed', async () => {
    expect(() => assertAllowed('musicbrainz', 'https://169.254.169.254/latest')).toThrow(/allowlist/);
    expect(() => assertAllowed('musicbrainz', 'http://musicbrainz.org/x')).toThrow(/https/);
    expect(() => assertAllowed('musicbrainz', 'https://user:pw@musicbrainz.org/x')).toThrow(/Credentials/);
    expect(() => assertAllowed('ticketmaster', 'https://musicbrainz.org/x')).toThrow();
    const { d, calls } = deps([resp(200, {})]);
    await new ProviderHttp(d).json('musicbrainz', 'https://musicbrainz.org/x');
    expect(calls[0].init.redirect).toBe('error');
    expect((calls[0].init.headers as Record<string, string>)['User-Agent']).toMatch(/^SHOWTIME-event-studio\//);
  });
  it('coalesces concurrent identical requests and serves the cache within TTL', async () => {
    const { d, calls } = deps([resp(200, { n: 1 })]);
    const h = new ProviderHttp(d);
    const [a, b] = await Promise.all([h.json('musicbrainz', 'https://musicbrainz.org/same'), h.json('musicbrainz', 'https://musicbrainz.org/same')]);
    expect(a.data).toEqual({ n: 1 });
    expect(b.data).toEqual({ n: 1 });
    const c = await h.json('musicbrainz', 'https://musicbrainz.org/same');
    expect(c.cached).toBe(true);
    expect(calls).toHaveLength(1);
  });
  it('spaces requests per provider policy (Nominatim ≥ 1.1 s)', async () => {
    const { d, sleeps } = deps([resp(200, [1]), resp(200, [2])]);
    const h = new ProviderHttp(d);
    await h.json('osm_nominatim', 'https://nominatim.openstreetmap.org/a');
    await h.json('osm_nominatim', 'https://nominatim.openstreetmap.org/b');
    expect(sleeps[0]).toBeGreaterThanOrEqual(1100);
  });
  it('stops at the daily budget', async () => {
    const { d } = deps(Array.from({ length: 600 }, (_, i) => resp(200, { i })));
    const h = new ProviderHttp(d);
    for (let i = 0; i < 500; i++) await h.json('bank_of_canada', `https://www.bankofcanada.ca/${i}`);
    await expect(h.json('bank_of_canada', 'https://www.bankofcanada.ca/over')).rejects.toMatchObject({ code: 'budget_exhausted' });
  });
  it('redacts keys and tokens from logged URLs', () => {
    expect(redact('https://app.ticketmaster.com/x?keyword=a&apikey=SECRET123&size=1')).toBe('https://app.ticketmaster.com/x?keyword=a&apikey=[REDACTED]&size=1');
    expect(redact('/x?token=abc&access_token=def')).toBe('/x?token=[REDACTED]&access_token=[REDACTED]');
  });
});

describe('gateway routes', () => {
  const gw = (responses: Response[], key: string | null = null) => {
    const { d, calls } = deps(responses);
    return { g: new Gateway(new ProviderHttp(d), { ticketmasterKey: key }, () => NOW), calls };
  };
  it('Ticketmaster without a key is not_configured (no fake results)', async () => {
    const { g, calls } = gw([]);
    const r = await g.handle('/api/discovery/events', new URLSearchParams({ city: 'Toronto' }));
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ error: { code: 'not_configured' } });
    expect(calls).toHaveLength(0);
  });
  it('keeps the API key out of responses and builds the upstream URL itself', async () => {
    const { g, calls } = gw([resp(200, F.tmVenues)], 'SECRETKEY123456789');
    const r = await g.handle('/api/discovery/venues', new URLSearchParams({ source: 'ticketmaster', city: 'Toronto', countryCode: 'ca' }));
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain('SECRETKEY');
    const u = new URL(calls[0].url);
    expect(u.hostname).toBe('app.ticketmaster.com');
    expect(u.searchParams.get('countryCode')).toBe('CA');
    expect(u.searchParams.get('apikey')).toBe('SECRETKEY123456789');
    expect((r.body as { results: unknown[] }).results).toHaveLength(3);
  });
  it('validates parameters before any upstream call', async () => {
    const { g, calls } = gw([], 'K'.repeat(20));
    const bad: Record<string, string>[] = [{ city: 'x'.repeat(81) }, { city: '<script>' }, { countryCode: 'CAN' }, { page: '99' }, { source: 'evil' }];
    for (const q of bad) {
      const r = await g.handle('/api/discovery/venues', new URLSearchParams({ source: 'ticketmaster', ...q }));
      expect(r.status).toBe(400);
    }
    expect((await g.handle('/api/discovery/services', new URLSearchParams({ city: 'Toronto', category: 'weapons' }))).status).toBe(400);
    expect((await g.handle('/api/fx', new URLSearchParams({ from: 'USD', to: 'EUR' }))).status).toBe(400);
    expect((await g.handle('/api/discovery/performers/musicbrainz/../../etc/links', new URLSearchParams())).status).toBe(404);
    expect((await g.handle('/api/anything', new URLSearchParams())).status).toBe(404);
    expect(calls).toHaveLength(0);
  });
  it('OSM search geocodes then queries, and filters by keyword', async () => {
    const { g, calls } = gw([resp(200, F.nominatimToronto), resp(200, F.osmVenues)]);
    const r = await g.handle('/api/discovery/venues', new URLSearchParams({ source: 'osm_overpass', city: 'Toronto', keyword: 'theatre' }));
    expect(r.status).toBe(200);
    const body = r.body as { results: DiscoveredVenue[]; rejected: number; attribution: string };
    expect(body.results.map((v) => v.name)).toEqual(['Synthetic Theatre']);
    expect(body.rejected).toBe(2);
    expect(body.attribution).toContain('OpenStreetMap');
    expect(calls[1].init.method).toBe('POST');
  });
  it('falls back to Nominatim (labelled) when Overpass is down, de-duplicating by OSM element', async () => {
    const theatre = resp(200, F.nominatimTheatre);
    const { g, calls } = gw([resp(200, F.nominatimToronto), resp(504, 'busy'), resp(504, 'busy'), theatre, resp(200, F.nominatimTheatre), resp(200, []), resp(200, []), resp(200, [])]);
    const r = await g.handle('/api/discovery/venues', new URLSearchParams({ source: 'osm_overpass', city: 'Toronto' }));
    expect(r.status).toBe(200);
    const body = r.body as { provider: string; results: DiscoveredVenue[]; notice: string; rejected: number };
    expect(body.provider).toBe('osm_nominatim');
    expect(body.notice).toMatch(/Overpass is unavailable/);
    expect(body.results).toHaveLength(1); // same element found twice → one result
    expect(body.results[0]).toMatchObject({ key: 'osm:way/7007', capacity: 2000, countryCode: 'CA', address: '5 Example St, Toronto', website: 'https://synthetic-opera.example/' });
    expect(body.results[0].evidence.every((e) => e.verificationStatus === 'provider_reported')).toBe(true);
    expect(calls.filter((c) => c.url.includes('nominatim')).length).toBe(6); // geocode + 5 place types
  });
  it('upstream schema failures surface as bad_response, not as empty success', async () => {
    const { g } = gw([resp(200, F.nominatimToronto), resp(200, { remark: 'runtime error: timeout' })]);
    const r = await g.handle('/api/discovery/services', new URLSearchParams({ city: 'Toronto', category: 'caterer' }));
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ error: { code: 'bad_response' } });
  });
  it('FX through the gateway', async () => {
    const { g } = gw([resp(200, F.bocUsd)]);
    const r = await g.handle('/api/fx', new URLSearchParams({ from: 'USD', to: 'CAD' }));
    expect(r.body).toMatchObject({ rate: '1.3912', from: 'USD', to: 'CAD' });
  });
});

// ------------------------------------------------------------ migration

describe('workspace migration (LD-10)', () => {
  const v1 = { schema: 1, org: { id: 'o', name: 'Org' }, user: { name: 'U', role: 'owner' }, events: [{ id: 'e1', title: 'Kept', audit: [{ id: 'a' }], budgetLines: [{ id: 'b', amountMinor: 123 }] }], activeEventId: 'e1', products: [{ id: 'p' }], offers: [{ id: 'q' }], acts: [{ id: 'act' }], evidence: [{ id: 'ev' }], settings: { units: 'imperial' } };
  it('upgrades 1 → 2 without losing anything, providers off', () => {
    const m = migrateWorkspace(v1);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.from).toBe(1);
    expect(m.changed).toBe(true);
    const d = m.data as Record<string, unknown> & { events: Record<string, unknown>[]; settings: Record<string, unknown> };
    expect(d.schema).toBe(2);
    expect(d.events[0]).toMatchObject({ id: 'e1', title: 'Kept', audit: [{ id: 'a' }], budgetLines: [{ id: 'b', amountMinor: 123 }], supplierAssignments: [] });
    expect(d).toMatchObject({ products: [{ id: 'p' }], offers: [{ id: 'q' }], acts: [{ id: 'act' }], evidence: [{ id: 'ev' }], venues: [], suppliers: [], references: [] });
    expect(d.settings).toMatchObject({ units: 'imperial', providers: { ticketmaster: false, osm_overpass: false, osm_nominatim: false, musicbrainz: false, bank_of_canada: false } });
  });
  it('is idempotent and refuses newer or malformed workspaces', () => {
    const once = migrateWorkspace(v1);
    if (!once.ok) throw new Error();
    const twice = migrateWorkspace(once.data);
    expect(twice.ok && twice.changed).toBe(false);
    expect(twice.ok && JSON.stringify(twice.data)).toBe(JSON.stringify(once.data));
    expect(migrateWorkspace({ ...v1, schema: 99 })).toMatchObject({ ok: false });
    expect(migrateWorkspace(null)).toMatchObject({ ok: false });
    expect(migrateWorkspace({ schema: 1 })).toMatchObject({ ok: false });
  });
});

// ------------------------------------------------------------ domain integration

describe('venues from discovery (LD-03, LD-08)', () => {
  const osm = normalizeOsmVenue(F.osmVenues.elements[0], AT)!;
  it('adopted venue is illustrative, capacity is a provider-reported upper bound, never certified', () => {
    const { venue, evidence } = adoptVenue(osm, AT);
    expect(venue.geometryFidelity).toBe('illustrative');
    expect(venue.stage).toEqual({ evidenceIds: [] });
    expect(venue.publishedRates).toEqual([]);
    expect(venue.market).toBe('Toronto');
    expect(venue.configurations[0].capacity).toBe(450);
    const ws = { ...emptyWs(), venues: [venue], evidence };
    const ev = applyVenue(createEvent('comedy', 'T', 'o', 'u', '2026-12-01'), venue, venue.configurations[0].id).event;
    const d = deriveEvent(ev, ws, NOW);
    expect(d.venue?.id).toBe(venue.id);
    expect(d.venueCapacity).toMatchObject({ value: 450, status: 'provider_reported' });
    expect(d.capacity.certified).toBe(false);
    expect(d.capacity.available).toBeLessThanOrEqual(450);
    expect(d.analysis.fidelity).toBe('illustrative');
    expect(d.costLines.find((l) => l.category === 'venue')!.amountMinor).toBeNull();
  });
  it('a review at the official source (not the provider page) certifies the capacity', () => {
    const { venue, evidence } = adoptVenue(osm, AT);
    const cap = evidence.find((e) => e.fieldPath === 'capacity')!;
    const review = { ...cap, id: 'rev1', fieldPath: `review:${cap.id}`, verificationStatus: 'verified_authoritative' as const, sourceUrl: 'https://synthetic-theatre.example/rentals', sourceType: 'official_venue_website' as const };
    const ev = applyVenue(createEvent('comedy', 'T', 'o', 'u', '2026-12-01'), venue, venue.configurations[0].id).event;
    const d = deriveEvent(ev, { ...emptyWs(), venues: [venue], evidence: [...evidence, review] }, NOW);
    expect(d.capacity.certified).toBe(true);
  });
  it('a venue with no published capacity stays uncertified and fully unknown', () => {
    const tm = normalizeTmVenue(F.tmVenues._embedded.venues[0], AT)!;
    const { venue } = adoptVenue(tm, AT);
    expect(venue.configurations[0].capacity).toBeNull();
    expect(venue.timezone).toBe('America/Toronto');
    expect(venue.unverifiedChecklist).toContain('Capacity by configuration');
  });
  it('unknown time zone or country never overrides the event (no UTC/USD guess)', () => {
    const odd = { ...osm, city: 'Smalltown', region: null, countryCode: null, timezone: null };
    const { venue } = adoptVenue(odd, AT);
    expect(venue.timezone).toBe('');
    const ev = createEvent('comedy', 'T', 'o', 'u', '2026-12-01', 'America/Toronto', 'CAD');
    const r = applyVenue(ev, venue, venue.configurations[0].id);
    expect(r.event.timezone).toBe('America/Toronto');
    expect(r.event.currency).toBe('CAD');
    expect(r.changes.join(' ')).toMatch(/time zone not published/);
    expect(adoptVenue(osm, AT).venue.timezone).toBe('America/Toronto'); // known market
  });
  it('re-saving the same provider record keeps one stable internal id', () => {
    expect(adoptVenue(osm, AT).venue.id).toBe(adoptVenue(osm, '2026-12-01T00:00:00Z').venue.id);
  });
});

describe('performers (LD-04)', () => {
  it('a discovery result without a booking route cannot enter the directory', () => {
    const p = normalizeTmAttraction(F.tmAttractions._embedded.attractions[0], AT)!;
    const { draft, routeSource } = performerDraft(p, null, AT);
    expect(routeSource).toBe('none');
    expect(draft.status).toBe('provider_reported');
    expect(validateAct(draft)).toContain('Booking route is required');
  });
  it('a MusicBrainz booking page pre-fills the route but stays provider-reported', () => {
    const p = normalizeMbSearch(F.mbSearch, AT).results[0];
    const links = normalizeMbLinks(F.mbLinks, p.providerRecordId, AT);
    const { draft, routeSource } = performerDraft(p, links, AT);
    expect(routeSource).toBe('musicbrainz_booking');
    expect(draft.bookingRoute.value).toBe('https://agency.example/synthetic-band');
    expect(draft.sourceUrl).toBe(links.sourceUrl);
    expect(draft.verifiedOn).toBeNull();
    expect(draft.status).toBe('provider_reported');
    expect(validateAct(draft)).toEqual([]);
  });
});

describe('suppliers (LD-07)', () => {
  const svc = normalizeOsmService(F.osmCaterers.elements[0], 'caterer', AT)!;
  const { supplier } = adoptService(svc, AT);
  const base = () => {
    const ev = createEvent('comedy', 'T', 'o', 'u', '2026-12-01');
    return { ev, ws: { ...emptyWs(), suppliers: [supplier] } };
  };
  it('proposed = no cost; quote requested = missing (total incomplete); confirmed quote = priced', () => {
    const { ev, ws } = base();
    const a = { id: 'a1', supplierId: supplier.id, role: 'Catering', category: 'catering_bar' as const, quote: null };
    const lines = (status: 'proposed' | 'quote_requested' | 'confirmed', quote: typeof a.quote | { amountMinor: number | null; currency: string; quantity: number; basis: 'fixed'; confirmed: boolean } = null) =>
      deriveEvent({ ...ev, supplierAssignments: [{ ...a, status, quote }] }, ws, NOW).costLines.filter((l) => l.derivedFrom?.module === 'supplier');
    expect(lines('proposed')).toHaveLength(0);
    expect(lines('quote_requested')[0].amountMinor).toBeNull();
    expect(lines('confirmed', { amountMinor: 250000, currency: 'CAD', quantity: 1, basis: 'fixed', confirmed: false })[0].amountMinor).toBeNull();
    const priced = lines('confirmed', { amountMinor: 250000, currency: 'CAD', quantity: 1, basis: 'fixed', confirmed: true })[0];
    expect(priced).toMatchObject({ amountMinor: 250000, source: 'private_quote', state: 'committed' });
  });
});

describe('campaign imports (dedupe) and references', () => {
  const csv = 'Date,Campaign,Impressions,Clicks,Conversions,Spend,Revenue\n2026-11-01,Launch,1000,20,2,$15.00,90\n2026-11-02,Launch,500,10,1,7.50,45\n';
  it('re-importing the same export adds nothing; new days add', () => {
    const rows = parseMetricRows(csv);
    if (typeof rows === 'string') throw new Error(rows);
    const first = mergeObserved(null, rows, 'meta.csv', AT);
    expect(first).toMatchObject({ added: 2, duplicates: 0 });
    expect(first.observed).toMatchObject({ impressions: 1500, clicks: 30, conversions: 3, spendMinor: 2250, revenueMinor: 13500 });
    const again = mergeObserved(first.observed, rows, 'meta.csv', AT);
    expect(again).toMatchObject({ added: 0, duplicates: 2 });
    expect(again.observed.spendMinor).toBe(2250);
    const more = parseMetricRows('Date,Campaign,Impressions,Clicks,Conversions,Spend\n2026-11-03,Launch,100,1,0,1.00\n');
    if (typeof more === 'string') throw new Error(more);
    expect(mergeObserved(again.observed, more, 'meta-2.csv', AT).observed.spendMinor).toBe(2350);
    expect(parseMetricRows('a,b\n1,2')).toMatch(/Missing column/);
  });
  it('a saved reference snapshots the values seen, so later provider changes do not alter it', () => {
    const e = normalizeTmEvent(F.tmEvents._embedded.events[0], AT)!;
    const ref = referenceFor(e, AT, ['evt1']);
    expect(ref).toMatchObject({ type: 'event', providerId: 'ticketmaster', providerRecordId: 'SYNTH-EVT-1', retrievedAt: AT, eventIds: ['evt1'] });
    expect(ref.snapshot).toMatchObject({ date: '2026-12-05', venue: 'Synthetic Hall', price0: '35–75 CAD (standard)' });
    e.priceRanges[0].max = 999;
    expect(ref.snapshot.price0).toBe('35–75 CAD (standard)');
  });
});

describe('store: removing saved records removes their provider evidence', () => {
  it('venue and supplier evidence is cascaded, unrelated evidence kept', async () => {
    const { useStore } = await import('../src/state/store');
    const s = useStore.getState();
    const { venue, evidence } = adoptVenue(normalizeOsmVenue(F.osmVenues.elements[0], AT)!, AT);
    const { supplier, evidence: sEv } = adoptService(normalizeOsmService(F.osmCaterers.elements[0], 'caterer', AT)!, AT);
    const keep = { ...evidence[0], id: 'unrelated', entityId: 'other', providerId: undefined };
    s.upsertVenue(venue);
    s.upsertSupplier(supplier);
    s.mergeEvidence([...evidence, ...sEv, keep, { ...evidence[0], id: 'rev-x', fieldPath: `review:${evidence[0].id}` }]);
    useStore.getState().removeVenue(venue.id);
    useStore.getState().removeSupplier(supplier.id);
    expect(useStore.getState().evidence.map((e) => e.id)).toEqual(['unrelated']);
  });
});
