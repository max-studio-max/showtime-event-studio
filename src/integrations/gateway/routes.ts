/**
 * Gateway route handlers, independent of the HTTP server so they can be tested
 * directly. Every parameter is validated; upstream URLs are built here from
 * fixed bases (the client can never supply a URL).
 */
import type { ProviderId, SupplierCategory } from '../../domain/types';
import { SUPPLIER_CATEGORIES, VENUE_OSM_TAGS, type DiscoveredService, type DiscoveredVenue, type Envelope, type FxObservation, type GeocodeResult, type PerformerLinks, type ProviderStatus } from '../contracts';
import { normalizeBocObservation, normalizeMbLinks, normalizeMbSearch, normalizeNominatim, normalizeNominatimPlace, normalizeOsmService, normalizeOsmVenue, normalizeTmAttraction, normalizeTmEvent, normalizeTmList, normalizeTmVenue, osmElements, overpassQuery } from '../normalize';
import { BOC_SERIES, PROVIDERS } from '../providers';
import { ProviderError, type ProviderHttp } from './http';

export interface GatewayEnv {
  ticketmasterKey: string | null;
}

export interface RouteResult {
  status: number;
  body: unknown;
}

type Q = URLSearchParams;

function text(q: Q, name: string, max: number, required = false): string | null {
  const v = q.get(name)?.trim() ?? '';
  if (!v) {
    if (required) throw new ProviderError('invalid_params', `“${name}” is required`, 400);
    return null;
  }
  if (v.length > max) throw new ProviderError('invalid_params', `“${name}” is too long`, 400);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f<>{}]/.test(v)) throw new ProviderError('invalid_params', `“${name}” contains invalid characters`, 400);
  return v;
}

function int(q: Q, name: string, min: number, max: number, dflt: number): number {
  const raw = q.get(name);
  if (raw == null || raw === '') return dflt;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new ProviderError('invalid_params', `“${name}” must be a whole number from ${min} to ${max}`, 400);
  return n;
}

function country(q: Q): string | null {
  const v = q.get('countryCode')?.trim().toUpperCase() ?? '';
  if (!v) return null;
  if (!/^[A-Z]{2}$/.test(v)) throw new ProviderError('invalid_params', '“countryCode” must be a 2-letter code', 400);
  return v;
}

function source(q: Q, allowed: ProviderId[]): ProviderId {
  const v = (q.get('source') ?? allowed[0]) as ProviderId;
  if (!allowed.includes(v)) throw new ProviderError('invalid_params', `“source” must be one of ${allowed.join(', ')}`, 400);
  return v;
}

const TM = 'https://app.ticketmaster.com/discovery/v2';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const OVERPASS_MIRROR = 'https://overpass.kumi.systems/api/interpreter';
const NOMINATIM_VENUE_PHRASES = ['theatre', 'arts centre', 'nightclub', 'events venue', 'conference centre'];

export class Gateway {
  constructor(private http: ProviderHttp, private env: GatewayEnv, private now: () => Date = () => new Date()) {}

  private tmKey(): string {
    if (!this.env.ticketmasterKey) throw new ProviderError('not_configured', 'Ticketmaster is not configured: add TICKETMASTER_API_KEY to the gateway .env file', 503, undefined, 'ticketmaster');
    return this.env.ticketmasterKey;
  }

  private tmUrl(path: string, params: Record<string, string | number | null>): string {
    const u = new URL(`${TM}/${path}`);
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, String(v));
    u.searchParams.set('apikey', this.tmKey());
    return u.toString();
  }

  status(): ProviderStatus[] {
    return (Object.keys(PROVIDERS) as ProviderId[]).map((p) => this.http.status(p, p === 'ticketmaster' ? !!this.env.ticketmasterKey : true));
  }

  async geocode(place: string): Promise<GeocodeResult> {
    const u = new URL('https://nominatim.openstreetmap.org/search');
    u.searchParams.set('q', place);
    u.searchParams.set('format', 'jsonv2');
    u.searchParams.set('limit', '1');
    u.searchParams.set('addressdetails', '1');
    const { data } = await this.http.json('osm_nominatim', u.toString());
    const g = normalizeNominatim(data);
    if (!g) throw new ProviderError('not_found', `Could not find “${place}” on OpenStreetMap`, 404, undefined, 'osm_nominatim');
    return g;
  }

  private env_<T>(provider: ProviderId, results: T[], rejected: number, cached: boolean, extra: Partial<Envelope<T>> = {}): Envelope<T> {
    return { provider, attribution: PROVIDERS[provider].attribution, retrievedAt: this.now().toISOString(), cached, results, rejected, ...extra };
  }

  async venues(q: Q): Promise<Envelope<DiscoveredVenue>> {
    const src = source(q, ['ticketmaster', 'osm_overpass']);
    const at = this.now().toISOString();
    if (src === 'ticketmaster') {
      const url = this.tmUrl('venues.json', { keyword: text(q, 'keyword', 100), city: text(q, 'city', 80), countryCode: country(q), size: int(q, 'size', 1, 50, 20), page: int(q, 'page', 0, 20, 0), locale: '*' });
      const { data, cached } = await this.http.json('ticketmaster', url);
      const r = normalizeTmList(data, 'venues', normalizeTmVenue, at);
      return this.env_('ticketmaster', r.results, r.rejected, cached, { page: r.page });
    }
    const city = text(q, 'city', 80, true)!;
    const g = await this.geocode(city);
    const radiusKm = int(q, 'radiusKm', 1, 25, 8);
    const kw = text(q, 'keyword', 100)?.toLowerCase() ?? null;
    const body = `data=${encodeURIComponent(overpassQuery(VENUE_OSM_TAGS, g.lat, g.lon, radiusKm * 1000, 100))}`;
    try {
      const { data, cached } = await this.http.json('osm_overpass', OVERPASS, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, mirrors: [OVERPASS_MIRROR], maxRetries: 1, timeoutMs: 25_000 });
      const els = osmElements(data);
      let results = els.map((e) => normalizeOsmVenue(e, at)).filter((x): x is DiscoveredVenue => !!x);
      const rejected = els.length - results.length;
      if (kw) results = results.filter((v) => v.name.toLowerCase().includes(kw));
      return this.env_('osm_overpass', results, rejected, cached, { notice: `Within ${radiusKm} km of ${g.displayName}` });
    } catch (e) {
      if (!(e instanceof ProviderError) || !['timeout', 'upstream_error', 'network', 'circuit_open'].includes(e.code)) throw e;
      return this.venuesViaNominatim(city, kw, at, e.message);
    }
  }

  /**
   * Fallback when Overpass is unavailable: Nominatim place-type searches over the
   * same OpenStreetMap data. Fewer results and no radius; clearly labelled.
   */
  private async venuesViaNominatim(city: string, kw: string | null, at: string, reason: string): Promise<Envelope<DiscoveredVenue>> {
    const seen = new Map<string, DiscoveredVenue>();
    let rejected = 0;
    let cachedAll = true;
    for (const phrase of NOMINATIM_VENUE_PHRASES) {
      const u = new URL('https://nominatim.openstreetmap.org/search');
      u.searchParams.set('q', `${phrase} in ${city}`);
      u.searchParams.set('format', 'jsonv2');
      u.searchParams.set('limit', '10');
      u.searchParams.set('extratags', '1');
      u.searchParams.set('addressdetails', '1');
      const { data, cached } = await this.http.json('osm_nominatim', u.toString());
      cachedAll &&= cached;
      const list = Array.isArray(data) ? data : [];
      for (const raw of list) {
        const v = normalizeNominatimPlace(raw, at);
        if (!v) rejected++;
        else if (!seen.has(v.key)) seen.set(v.key, v);
      }
    }
    let results = [...seen.values()];
    if (kw) results = results.filter((v) => v.name.toLowerCase().includes(kw));
    return this.env_('osm_nominatim', results, rejected, cachedAll, { notice: `Overpass is unavailable (${reason}). Showing OpenStreetMap results from Nominatim instead — searched by place type in ${city}; fewer results and no radius filter.` });
  }

  async events(q: Q) {
    const at = this.now().toISOString();
    const start = text(q, 'startDate', 10);
    if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new ProviderError('invalid_params', '“startDate” must be YYYY-MM-DD', 400);
    const url = this.tmUrl('events.json', {
      keyword: text(q, 'keyword', 100),
      city: text(q, 'city', 80),
      countryCode: country(q),
      classificationName: text(q, 'classification', 40),
      startDateTime: start ? `${start}T00:00:00Z` : null,
      size: int(q, 'size', 1, 50, 20),
      page: int(q, 'page', 0, 20, 0),
      sort: 'date,asc',
      locale: '*',
    });
    const { data, cached } = await this.http.json('ticketmaster', url);
    const r = normalizeTmList(data, 'events', normalizeTmEvent, at);
    return this.env_('ticketmaster', r.results, r.rejected, cached, { page: r.page });
  }

  async performers(q: Q) {
    const src = source(q, ['ticketmaster', 'musicbrainz']);
    const at = this.now().toISOString();
    const keyword = text(q, 'keyword', 100, true)!;
    if (src === 'ticketmaster') {
      const url = this.tmUrl('attractions.json', { keyword, classificationName: text(q, 'classification', 40), size: int(q, 'size', 1, 50, 20), page: int(q, 'page', 0, 20, 0), locale: '*' });
      const { data, cached } = await this.http.json('ticketmaster', url);
      const r = normalizeTmList(data, 'attractions', normalizeTmAttraction, at);
      return this.env_('ticketmaster', r.results, r.rejected, cached, { page: r.page });
    }
    const u = new URL('https://musicbrainz.org/ws/2/artist');
    u.searchParams.set('query', `artist:"${keyword.replace(/"/g, '')}"`);
    u.searchParams.set('fmt', 'json');
    u.searchParams.set('limit', String(int(q, 'size', 1, 25, 15)));
    const { data, cached } = await this.http.json('musicbrainz', u.toString());
    const r = normalizeMbSearch(data, at);
    return this.env_('musicbrainz', r.results, r.rejected, cached, { page: r.page });
  }

  async performerLinks(mbid: string): Promise<PerformerLinks> {
    if (!/^[0-9a-f-]{36}$/.test(mbid)) throw new ProviderError('invalid_params', 'Invalid MusicBrainz id', 400);
    const { data } = await this.http.json('musicbrainz', `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`);
    return normalizeMbLinks(data, mbid, this.now().toISOString());
  }

  async services(q: Q): Promise<Envelope<DiscoveredService>> {
    const cat = q.get('category') as SupplierCategory;
    if (!cat || !(cat in SUPPLIER_CATEGORIES)) throw new ProviderError('invalid_params', `“category” must be one of ${Object.keys(SUPPLIER_CATEGORIES).join(', ')}`, 400);
    const city = text(q, 'city', 80, true)!;
    const g = await this.geocode(city);
    const radiusKm = int(q, 'radiusKm', 1, 25, 12);
    const at = this.now().toISOString();
    const body = `data=${encodeURIComponent(overpassQuery(SUPPLIER_CATEGORIES[cat].osm, g.lat, g.lon, radiusKm * 1000, 80))}`;
    const { data, cached } = await this.http.json('osm_overpass', OVERPASS, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, mirrors: [OVERPASS_MIRROR], maxRetries: 1, timeoutMs: 25_000 });
    const els = osmElements(data);
    const results = els.map((e) => normalizeOsmService(e, cat, at)).filter((x): x is DiscoveredService => !!x);
    return this.env_('osm_overpass', results, els.length - results.length, cached, { notice: `${SUPPLIER_CATEGORIES[cat].label} within ${radiusKm} km of ${g.displayName}. ${SUPPLIER_CATEGORIES[cat].note}` });
  }

  async fx(q: Q): Promise<FxObservation> {
    const from = (q.get('from') ?? '').toUpperCase();
    const to = (q.get('to') ?? '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to) throw new ProviderError('invalid_params', '“from” and “to” must be two different 3-letter currency codes', 400);
    if (from !== 'CAD' && to !== 'CAD') throw new ProviderError('invalid_params', 'The Bank of Canada publishes rates against CAD only; one side must be CAD', 400);
    const foreign = from === 'CAD' ? to : from;
    const series = BOC_SERIES[foreign];
    if (!series) throw new ProviderError('not_found', `No Bank of Canada series for ${foreign}`, 404, undefined, 'bank_of_canada');
    const { data } = await this.http.json('bank_of_canada', `https://www.bankofcanada.ca/valet/observations/${series}/json?recent=1`);
    return normalizeBocObservation(data, series, from, to, this.now().toISOString());
  }

  /** Dispatch a GET /api/... request. */
  async handle(pathname: string, q: Q): Promise<RouteResult> {
    try {
      const mb = pathname.match(/^\/api\/discovery\/performers\/musicbrainz\/([0-9a-f-]{36})\/links$/);
      if (mb) return { status: 200, body: await this.performerLinks(mb[1]) };
      switch (pathname) {
        case '/api/providers/status':
          return { status: 200, body: this.status() };
        case '/api/discovery/venues':
          return { status: 200, body: await this.venues(q) };
        case '/api/discovery/events':
          return { status: 200, body: await this.events(q) };
        case '/api/discovery/performers':
          return { status: 200, body: await this.performers(q) };
        case '/api/discovery/services':
          return { status: 200, body: await this.services(q) };
        case '/api/fx':
          return { status: 200, body: await this.fx(q) };
        default:
          return { status: 404, body: { error: { code: 'not_found', message: 'Unknown endpoint' } } };
      }
    } catch (e) {
      if (e instanceof ProviderError) return { status: e.status, body: { error: e.toJSON() } };
      // Normalizer schema failures and anything unexpected: never leak internals.
      return { status: 502, body: { error: { code: 'bad_response', message: (e as Error).message?.slice(0, 200) ?? 'Unexpected provider response' } } };
    }
  }
}
