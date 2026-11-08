/**
 * Schema validation + normalization at the provider boundary. Inputs are
 * `unknown`; every field is checked, text is sanitised, URLs must be http(s),
 * missing values stay null, and each normalized fact gets a field-level
 * evidence row marked `provider_reported`.
 */
import type { ProviderId, SourceEvidence, SupplierCategory } from '../domain/types';
import type { DiscoveredEvent, DiscoveredPerformer, DiscoveredService, DiscoveredVenue, FxObservation, GeocodeResult, Page, PerformerLinks } from './contracts';
import { PROVIDERS } from './providers';

type J = Record<string, unknown>;
const obj = (v: unknown): J | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Trimmed text with control characters removed and a length cap. External text is never treated as HTML. */
export function str(v: unknown, max = 300): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  // eslint-disable-next-line no-control-regex
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
}

/** Positive integer only (capacity-like); "approx 500", "500+" and ranges are rejected, not guessed. */
export function posInt(v: unknown): number | null {
  const n = num(v);
  return n != null && Number.isInteger(n) && n > 0 ? n : null;
}

export function safeUrl(v: unknown): string | null {
  const s = str(v, 2000);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function ev(provider: ProviderId, recordId: string, entityType: SourceEvidence['entityType'], fieldPath: string, value: string | number | null, sourceUrl: string | null, retrievedAt: string, unit?: string, notes?: string): SourceEvidence {
  const p = PROVIDERS[provider];
  return {
    id: `ev-${provider}-${recordId}-${fieldPath}`.replace(/[^a-z0-9_-]+/gi, '-'),
    entityType,
    entityId: `${provider}:${recordId}`,
    fieldPath,
    assertedValue: value,
    unit,
    sourceType: provider === 'ticketmaster' || provider === 'bank_of_canada' ? 'provider_api' : 'open_dataset',
    sourceUrl,
    publisher: p.name,
    retrievedAt,
    observedAt: retrievedAt,
    extractionMethod: `${p.name} API, normalized by SHOWTIME`,
    reviewerId: null,
    verificationStatus: 'provider_reported',
    confidenceClass: provider === 'bank_of_canada' ? 'high' : 'medium',
    usagePolicy: p.permittedUses,
    providerId: provider,
    providerRecordId: recordId,
    notes,
  };
}

/** Build evidence rows only for facts that are actually present. */
function facts(provider: ProviderId, id: string, type: SourceEvidence['entityType'], url: string | null, at: string, pairs: [string, string | number | null, string?][]): SourceEvidence[] {
  return pairs.filter(([, v]) => v != null).map(([f, v, unit]) => ev(provider, id, type, f, v, url, at, unit));
}

export function tmPage(p: unknown): Page | undefined {
  const o = obj(p);
  if (!o) return undefined;
  return { number: num(o.number) ?? 0, size: num(o.size) ?? 0, totalElements: num(o.totalElements), totalPages: num(o.totalPages) };
}

// ------------------------------------------------------------- Ticketmaster

export function normalizeTmVenue(raw: unknown, at: string): DiscoveredVenue | null {
  const v = obj(raw);
  const id = str(v?.id, 80);
  const name = str(v?.name);
  if (!v || !id || !name) return null;
  const city = str(obj(v.city)?.name);
  const region = str(obj(v.state)?.stateCode) ?? str(obj(v.state)?.name);
  const countryCode = str(obj(v.country)?.countryCode, 3);
  const loc = obj(v.location);
  const url = safeUrl(v.url);
  const address = [str(obj(v.address)?.line1), str(obj(v.address)?.line2)].filter(Boolean).join(', ') || null;
  const upcoming = num(obj(v.upcomingEvents)?._total);
  return {
    kind: 'venue',
    key: `ticketmaster:${id}`,
    provider: 'ticketmaster',
    providerRecordId: id,
    name,
    listingUrl: url,
    address,
    city,
    region,
    countryCode,
    postalCode: str(v.postalCode, 20),
    lat: num(loc?.latitude),
    lon: num(loc?.longitude),
    timezone: str(v.timezone, 60),
    website: null, // Ticketmaster does not publish the venue's own site
    phone: null,
    venueType: null,
    capacity: null, // not published by the Discovery API
    wheelchair: null,
    upcomingEvents: upcoming,
    evidence: facts('ticketmaster', id, 'venue', url, at, [
      ['name', name],
      ['address', address],
      ['city', city],
      ['timezone', str(v.timezone, 60)],
      ['upcomingEvents', upcoming, 'events'],
    ]),
  };
}

export function normalizeTmAttraction(raw: unknown, at: string): DiscoveredPerformer | null {
  const a = obj(raw);
  const id = str(a?.id, 80);
  const name = str(a?.name);
  if (!a || !id || !name) return null;
  const cls = obj(arr(a.classifications)[0]);
  const segment = str(obj(cls?.segment)?.name);
  const genres = [str(obj(cls?.genre)?.name), str(obj(cls?.subGenre)?.name)].filter((g): g is string => !!g && g !== 'Undefined');
  const links = obj(a.externalLinks);
  const homepages = arr(links?.homepage).map((h) => safeUrl(obj(h)?.url)).filter((u): u is string => !!u);
  const mbid = str(obj(arr(links?.musicbrainz)[0])?.id, 40);
  const url = safeUrl(a.url);
  const upcoming = num(obj(a.upcomingEvents)?._total);
  return {
    kind: 'performer',
    key: `ticketmaster:${id}`,
    provider: 'ticketmaster',
    providerRecordId: id,
    name,
    listingUrl: url,
    segment: segment === 'Undefined' ? null : segment,
    genres,
    country: null,
    area: null,
    disambiguation: null,
    upcomingEvents: upcoming,
    homepages,
    musicbrainzId: mbid && /^[0-9a-f-]{36}$/.test(mbid) ? mbid : null,
    evidence: facts('ticketmaster', id, 'act', url, at, [
      ['name', name],
      ['segment', segment],
      ['homepage', homepages[0] ?? null],
    ]),
  };
}

export function normalizeTmEvent(raw: unknown, at: string): DiscoveredEvent | null {
  const e = obj(raw);
  const id = str(e?.id, 80);
  const name = str(e?.name);
  if (!e || !id || !name) return null;
  const dates = obj(e.dates);
  const start = obj(dates?.start);
  const cls = obj(arr(e.classifications)[0]);
  const emb = obj(e._embedded);
  const venue = obj(arr(emb?.venues)[0]);
  const url = safeUrl(e.url);
  const priceRanges = arr(e.priceRanges)
    .map((p) => obj(p))
    .filter((p): p is J => !!p && !!str(p.currency, 3))
    .map((p) => ({ type: str(p.type, 40), currency: str(p.currency, 3)!.toUpperCase(), min: num(p.min), max: num(p.max) }));
  return {
    kind: 'event',
    key: `ticketmaster:${id}`,
    provider: 'ticketmaster',
    providerRecordId: id,
    name,
    listingUrl: url,
    localDate: str(start?.localDate, 10),
    localTime: str(start?.localTime, 8),
    timezone: str(dates?.timezone, 60),
    status: str(obj(dates?.status)?.code, 30),
    segment: str(obj(cls?.segment)?.name),
    genre: str(obj(cls?.genre)?.name),
    venueName: str(venue?.name),
    venueProviderId: str(venue?.id, 80),
    city: str(obj(venue?.city)?.name),
    attractions: arr(emb?.attractions).map((x) => str(obj(x)?.name)).filter((x): x is string => !!x),
    priceRanges,
    evidence: facts('ticketmaster', id, 'venue', url, at, [
      ['name', name],
      ['localDate', str(start?.localDate, 10)],
      ...priceRanges.map((p, i): [string, string] => [`priceRanges.${i}`, `${p.min ?? '?'}–${p.max ?? '?'} ${p.currency}`]),
    ]),
  };
}

export function normalizeTmList<T>(payload: unknown, key: 'venues' | 'events' | 'attractions', fn: (x: unknown, at: string) => T | null, at: string): { results: T[]; rejected: number; page?: Page } {
  const o = obj(payload);
  if (!o) throw new Error('Response is not a JSON object');
  const items = arr(obj(o._embedded)?.[key]);
  const results = items.map((x) => fn(x, at)).filter((x): x is T => x != null);
  return { results, rejected: items.length - results.length, page: tmPage(o.page) };
}

// ------------------------------------------------------------- OpenStreetMap

function osmAddress(t: J): string | null {
  const line = [str(t['addr:housenumber'], 20), str(t['addr:street'])].filter(Boolean).join(' ');
  return [line || null, str(t['addr:city']), str(t['addr:postcode'], 20)].filter(Boolean).join(', ') || null;
}

const OSM_TYPE = new Set(['node', 'way', 'relation']);

function osmBase(raw: unknown): { id: string; t: J; lat: number | null; lon: number | null; url: string } | null {
  const e = obj(raw);
  const type = str(e?.type, 10);
  const idn = num(e?.id);
  const t = obj(e?.tags);
  if (!e || !type || !OSM_TYPE.has(type) || idn == null || !t || !str(t.name)) return null;
  const c = obj(e.center);
  return { id: `${type}/${idn}`, t, lat: num(e.lat) ?? num(c?.lat), lon: num(e.lon) ?? num(c?.lon), url: `https://www.openstreetmap.org/${type}/${idn}` };
}

export function normalizeOsmVenue(raw: unknown, at: string): DiscoveredVenue | null {
  const b = osmBase(raw);
  if (!b) return null;
  const { id, t, url } = b;
  const name = str(t.name)!;
  const website = safeUrl(t.website) ?? safeUrl(t['contact:website']);
  const phone = str(t.phone, 40) ?? str(t['contact:phone'], 40);
  const capacity = posInt(t.capacity);
  const venueType = str(t.amenity, 40);
  const address = osmAddress(t);
  return {
    kind: 'venue',
    key: `osm:${id}`,
    provider: 'osm_overpass',
    providerRecordId: id,
    name,
    listingUrl: url,
    address,
    city: str(t['addr:city']),
    region: str(t['addr:province']) ?? str(t['addr:state']),
    countryCode: str(t['addr:country'], 3),
    postalCode: str(t['addr:postcode'], 20),
    lat: b.lat,
    lon: b.lon,
    timezone: null,
    website,
    phone,
    venueType,
    capacity,
    wheelchair: str(t.wheelchair, 20),
    upcomingEvents: null,
    evidence: facts('osm_overpass', id, 'venue', url, at, [
      ['name', name],
      ['address', address],
      ['website', website],
      ['phone', phone],
      ['capacity', capacity, 'people'],
      ['wheelchair', str(t.wheelchair, 20)],
      ['venueType', venueType],
    ]),
  };
}

export function normalizeOsmService(raw: unknown, category: SupplierCategory, at: string): DiscoveredService | null {
  const b = osmBase(raw);
  if (!b) return null;
  const { id, t, url } = b;
  const name = str(t.name)!;
  const website = safeUrl(t.website) ?? safeUrl(t['contact:website']);
  const phone = str(t.phone, 40) ?? str(t['contact:phone'], 40);
  const address = osmAddress(t);
  return {
    kind: 'service',
    key: `osm:${id}`,
    provider: 'osm_overpass',
    providerRecordId: id,
    name,
    listingUrl: url,
    category,
    address,
    website,
    phone,
    lat: b.lat,
    lon: b.lon,
    openingHours: str(t.opening_hours, 120),
    evidence: facts('osm_overpass', id, 'venue', url, at, [
      ['name', name],
      ['address', address],
      ['website', website],
      ['phone', phone],
    ]),
  };
}

export function osmElements(payload: unknown): unknown[] {
  const o = obj(payload);
  if (!o || !Array.isArray(o.elements)) throw new Error('Overpass response has no elements array');
  return o.elements;
}

/** Overpass QL for named features with any of the given `key=value` tags around a point. */
export function overpassQuery(tags: string[], lat: number, lon: number, radiusM: number, limit: number): string {
  const r = Math.round(Math.min(Math.max(radiusM, 200), 25000));
  const f = (x: number) => x.toFixed(5);
  const parts = tags
    .filter((t) => /^[a-z_:]+=[a-z_]+$/.test(t)) // only our own vetted tag list reaches the query
    .map((t) => {
      const [k, v] = t.split('=');
      return `nwr["${k}"="${v}"]["name"](around:${r},${f(lat)},${f(lon)});`;
    });
  return `[out:json][timeout:25];(${parts.join('')});out center tags ${Math.min(Math.max(limit, 1), 100)};`;
}

/**
 * A Nominatim place-search hit as a venue (fallback when Overpass is down).
 * Same OSM element ids as Overpass, so both paths de-duplicate on `osm:<type>/<id>`.
 */
export function normalizeNominatimPlace(raw: unknown, at: string): DiscoveredVenue | null {
  const r = obj(raw);
  const type = str(r?.osm_type, 10);
  const idn = num(r?.osm_id);
  const name = str(r?.name);
  if (!r || !type || !OSM_TYPE.has(type) || idn == null || !name) return null;
  const id = `${type}/${idn}`;
  const url = `https://www.openstreetmap.org/${id}`;
  const x = obj(r.extratags) ?? {};
  const a = obj(r.address) ?? {};
  const website = safeUrl(x.website) ?? safeUrl(x['contact:website']);
  const phone = str(x.phone, 40) ?? str(x['contact:phone'], 40);
  const capacity = posInt(x.capacity);
  const city = str(a.city) ?? str(a.town) ?? str(a.village);
  const address = [[str(a.house_number, 20), str(a.road)].filter(Boolean).join(' ') || null, city, str(a.postcode, 20)].filter(Boolean).join(', ') || null;
  const venueType = str(r.type, 40);
  return {
    kind: 'venue',
    key: `osm:${id}`,
    provider: 'osm_nominatim',
    providerRecordId: id,
    name,
    listingUrl: url,
    address,
    city,
    region: str(a.state),
    countryCode: str(a.country_code, 3)?.toUpperCase() ?? null,
    postalCode: str(a.postcode, 20),
    lat: num(r.lat),
    lon: num(r.lon),
    timezone: null,
    website,
    phone,
    venueType,
    capacity,
    wheelchair: str(x.wheelchair, 20),
    upcomingEvents: null,
    evidence: facts('osm_nominatim', id, 'venue', url, at, [
      ['name', name],
      ['address', address],
      ['website', website],
      ['phone', phone],
      ['capacity', capacity, 'people'],
      ['venueType', venueType],
    ]),
  };
}

export function normalizeNominatim(payload: unknown): GeocodeResult | null {
  const first = obj(arr(payload)[0]);
  const lat = num(first?.lat);
  const lon = num(first?.lon);
  if (!first || lat == null || lon == null) return null;
  const bb = arr(first.boundingbox).map(num);
  return {
    name: str(first.name) ?? str(first.display_name) ?? '',
    displayName: str(first.display_name, 300) ?? '',
    lat,
    lon,
    countryCode: str(obj(first.address)?.country_code, 3),
    bbox: bb.length === 4 && bb.every((x) => x != null) ? (bb as [number, number, number, number]) : null,
  };
}

// ------------------------------------------------------------- MusicBrainz

export function normalizeMbArtist(raw: unknown, at: string): DiscoveredPerformer | null {
  const a = obj(raw);
  const id = str(a?.id, 40);
  const name = str(a?.name);
  if (!a || !id || !name || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const url = `https://musicbrainz.org/artist/${id}`;
  const tags = arr(a.tags).map((t) => str(obj(t)?.name, 40)).filter((x): x is string => !!x).slice(0, 6);
  return {
    kind: 'performer',
    key: `musicbrainz:${id}`,
    provider: 'musicbrainz',
    providerRecordId: id,
    name,
    listingUrl: url,
    segment: str(a.type, 20),
    genres: tags,
    country: str(a.country, 3),
    area: str(obj(a.area)?.name),
    disambiguation: str(a.disambiguation, 200),
    upcomingEvents: null,
    homepages: [],
    musicbrainzId: id,
    evidence: facts('musicbrainz', id, 'act', url, at, [
      ['name', name],
      ['type', str(a.type, 20)],
      ['area', str(obj(a.area)?.name)],
    ]),
  };
}

export function normalizeMbSearch(payload: unknown, at: string): { results: DiscoveredPerformer[]; rejected: number; page: Page } {
  const o = obj(payload);
  if (!o || !Array.isArray(o.artists)) throw new Error('MusicBrainz response has no artists array');
  const results = o.artists.map((x) => normalizeMbArtist(x, at)).filter((x): x is DiscoveredPerformer => !!x);
  return { results, rejected: o.artists.length - results.length, page: { number: 0, size: o.artists.length, totalElements: num(o.count), totalPages: null } };
}

export function normalizeMbLinks(payload: unknown, mbid: string, at: string): PerformerLinks {
  const o = obj(payload);
  if (!o) throw new Error('MusicBrainz response is not an object');
  const sourceUrl = `https://musicbrainz.org/artist/${mbid}`;
  const rels = arr(o.relations).map((r) => obj(r)).filter((r): r is J => !!r && !r.ended);
  const pick = (type: string) => [...new Set(rels.filter((r) => r.type === type).map((r) => safeUrl(obj(r.url)?.resource)).filter((u): u is string => !!u))];
  const homepages = pick('official homepage');
  const bookingPages = pick('booking');
  return {
    provider: 'musicbrainz',
    providerRecordId: mbid,
    sourceUrl,
    retrievedAt: at,
    homepages,
    bookingPages,
    evidence: [
      ...homepages.map((u, i) => ev('musicbrainz', mbid, 'act', `homepage.${i}`, u, sourceUrl, at)),
      ...bookingPages.map((u, i) => ev('musicbrainz', mbid, 'act', `bookingPage.${i}`, u, sourceUrl, at, undefined, 'Community-tagged booking URL — check the destination page before relying on it')),
    ],
  };
}

// ------------------------------------------------------------- Bank of Canada

/** Divide 1 by a decimal string to `dp` places using integer maths (no float drift in the stored string). */
export function invertDecimal(rate: string, dp = 6): string {
  const [i, f = ''] = rate.split('.');
  const scale = 10n ** BigInt(f.length);
  const n = BigInt(i + f);
  if (n === 0n) throw new Error('rate is zero');
  const out = (scale * 10n ** BigInt(dp) * 2n + n) / (2n * n); // rounded half-up
  const s = out.toString().padStart(dp + 1, '0');
  return `${s.slice(0, -dp)}.${s.slice(-dp)}`;
}

export function normalizeBocObservation(payload: unknown, series: string, from: string, to: string, at: string): FxObservation {
  const o = obj(payload);
  const last = obj(arr(o?.observations).slice(-1)[0]);
  const v = str(obj(last?.[series])?.v, 20);
  const d = str(last?.d, 10);
  if (!v || !/^\d+(\.\d+)?$/.test(v) || Number(v) <= 0 || !d) throw new Error(`No usable ${series} observation in response`);
  const direct = to === 'CAD';
  return {
    from,
    to,
    rate: direct ? v : invertDecimal(v),
    date: d,
    source: `Bank of Canada ${series} daily average (${d})${direct ? '' : ', inverted'}`,
    sourceUrl: `https://www.bankofcanada.ca/valet/observations/${series}/json?recent=1`,
    retrievedAt: at,
    note: 'Indicative daily average, not a transaction rate.',
  };
}
