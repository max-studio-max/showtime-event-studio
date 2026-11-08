/**
 * Converting a user-selected discovery result into SHOWTIME records. This is
 * the only place provider data enters the domain model, and it never upgrades
 * trust: everything stays `provider_reported` until reviewed at source.
 */
import type { SavedReference, ServiceSupplier, SourceEvidence, TalentAct, Venue } from '../domain/types';
import type { DiscoveredEvent, DiscoveredPerformer, DiscoveredService, DiscoveredVenue, PerformerLinks } from './contracts';
import { PROVIDERS } from './providers';

/** Stable internal id derived from the provider key (re-saving updates, never duplicates). */
export const internalId = (prefix: string, key: string) => `${prefix}-${key.replace(/[^a-z0-9]+/gi, '-')}`;

const MARKETS: [RegExp, string][] = [
  [/toronto|north york|scarborough|etobicoke|mississauga/i, 'Toronto'],
  [/new york|brooklyn|manhattan|queens|bronx|staten island/i, 'New York City'],
  [/los angeles|hollywood|beverly hills|santa monica|pasadena|burbank|long beach|glendale|culver city/i, 'Greater Los Angeles'],
];

const MARKET_TZ: Record<string, string> = { Toronto: 'America/Toronto', 'New York City': 'America/New_York', 'Greater Los Angeles': 'America/Los_Angeles' };

export function marketFor(city: string | null, fallback: string | null): string {
  for (const [re, m] of MARKETS) if (city && re.test(city)) return m;
  return city ?? fallback ?? 'Unspecified';
}

export interface AdoptedVenue {
  venue: Venue;
  evidence: SourceEvidence[];
}

/**
 * A discovered venue becomes a Venue with an illustrative 3D fidelity, no
 * stage dimensions, and capacity only if the provider published one — as a
 * provider-reported upper bound (LD-03).
 */
export function adoptVenue(d: DiscoveredVenue, now: string, marketHint?: string | null): AdoptedVenue {
  const id = internalId('lv', d.key);
  const cfgId = `${id}-cfg`;
  const capEv = d.evidence.find((e) => e.fieldPath === 'capacity');
  // Re-key evidence to the internal venue/config ids; provider ids are kept in providerId/providerRecordId.
  const evidence = d.evidence.map((e) =>
    e.fieldPath === 'capacity'
      ? { ...e, entityType: 'venue_config' as const, entityId: cfgId, notes: 'Provider-reported capacity tag; an upper bound to confirm with the venue, not a certified occupancy.' }
      : { ...e, entityId: id },
  );
  const officialUrls = [d.website, d.listingUrl].filter((u): u is string => !!u);
  const venue: Venue = {
    id,
    provider: { id: d.provider, recordId: d.providerRecordId, listingUrl: d.listingUrl, savedAt: now, attribution: PROVIDERS[d.provider].attribution },
    organization: d.name,
    campus: d.name,
    space: d.name,
    market: marketHint || marketFor(d.city, d.region),
    locality: [d.city, d.region, d.countryCode].filter(Boolean).join(', ') || d.address || 'Location not published',
    country: d.countryCode ?? '',
    // Provider time zone, else the IANA zone of a known market, else unknown ('' = keep the event's).
    timezone: d.timezone ?? MARKET_TZ[marketHint || marketFor(d.city, d.region)] ?? '',
    roomType: d.venueType ? d.venueType.replace(/_/g, ' ') : 'Not published',
    indoor: true,
    officialUrls,
    bookingRoute: d.website ? 'Contact the venue through its official website (rental route not verified)' : 'No booking route published by this provider — find the venue’s official rental page',
    suitability: [],
    configurations: [{ id: cfgId, name: d.capacity != null ? 'Capacity as mapped (provider-reported)' : 'Configuration unknown', kind: 'mixed', capacity: d.capacity, evidenceIds: capEv ? [`${capEv.id}`] : [] }],
    stage: { evidenceIds: [] },
    publishedRates: [],
    features: [d.wheelchair ? `Wheelchair access (mapped): ${d.wheelchair}` : null, d.upcomingEvents != null ? `${d.upcomingEvents} upcoming events listed on ${PROVIDERS[d.provider].name}` : null].filter((x): x is string => !!x),
    restrictions: [],
    geometryFidelity: 'illustrative',
    unverifiedChecklist: [
      'Room list and configurations',
      d.capacity == null ? 'Capacity by configuration' : 'Confirm the mapped capacity with the venue',
      'Stage and room dimensions',
      'Rental availability, rates and inclusions',
      'Official booking/rental contact',
      ...(d.timezone ? [] : ['Time zone']),
    ],
  };
  return { venue, evidence };
}

export function adoptService(d: DiscoveredService, now: string): { supplier: ServiceSupplier; evidence: SourceEvidence[] } {
  return {
    supplier: {
      id: internalId('sup', d.key),
      name: d.name,
      category: d.category,
      provider: { id: d.provider, recordId: d.providerRecordId, attribution: PROVIDERS[d.provider].attribution, savedAt: now },
      address: d.address,
      website: d.website,
      phone: d.phone,
      lat: d.lat,
      lon: d.lon,
      evidenceIds: d.evidence.map((e) => e.id),
    },
    evidence: d.evidence,
  };
}

/**
 * A performer search result can only become a directory draft. Without a
 * booking route the draft cannot be saved (LD-04); a provider-reported booking
 * page pre-fills the route but stays unverified.
 */
export function performerDraft(d: DiscoveredPerformer, links: PerformerLinks | null, now: string): { draft: TalentAct; routeSource: 'musicbrainz_booking' | 'none' } {
  const booking = links?.bookingPages[0] ?? null;
  const home = links?.homepages[0] ?? d.homepages[0] ?? '';
  const seg = (d.segment ?? '').toLowerCase();
  const actType: TalentAct['actType'] = /comed/.test(d.genres.join(' ').toLowerCase()) ? 'stand-up comedy' : seg === 'person' ? 'solo musician' : seg === 'group' ? 'band' : 'solo musician';
  return {
    routeSource: booking ? 'musicbrainz_booking' : 'none',
    draft: {
      id: internalId('act', d.key),
      stageName: d.name,
      actType,
      genres: d.genres.slice(0, 5),
      homeRegion: d.area ?? d.country ?? '',
      officialSiteUrl: home,
      bookingRoute: { type: 'agency_page', value: booking ?? '' },
      sourceUrl: booking ? links!.sourceUrl : '',
      verifiedOn: null,
      lastChecked: now,
      status: 'provider_reported',
      notes: `Discovered via ${PROVIDERS[d.provider].name} (${d.listingUrl ?? d.key}) on ${now.slice(0, 10)}.${booking ? ' Booking page is community-tagged on MusicBrainz — open it to confirm before relying on it.' : ' No booking route found by the provider; add one only from a page that publishes it.'}`,
    },
  };
}

export function referenceFor(d: DiscoveredEvent | DiscoveredVenue | DiscoveredPerformer | DiscoveredService, now: string, eventIds: string[] = []): SavedReference {
  const snapshot: SavedReference['snapshot'] = {};
  if (d.kind === 'event') {
    Object.assign(snapshot, { date: d.localDate, time: d.localTime, venue: d.venueName, city: d.city, status: d.status, segment: d.segment, genre: d.genre });
    d.priceRanges.forEach((p, i) => (snapshot[`price${i}`] = `${p.min ?? '?'}–${p.max ?? '?'} ${p.currency}${p.type ? ` (${p.type})` : ''}`));
  } else if (d.kind === 'venue') Object.assign(snapshot, { address: d.address, city: d.city, capacity: d.capacity, website: d.website });
  else if (d.kind === 'performer') Object.assign(snapshot, { segment: d.segment, genres: d.genres.join(', ') || null, area: d.area, homepage: d.homepages[0] ?? null });
  else Object.assign(snapshot, { category: d.category, address: d.address, website: d.website, phone: d.phone });
  const retrievedAt = d.evidence[0]?.retrievedAt ?? now;
  return { id: internalId('ref', d.key), type: d.kind, providerId: d.provider, providerRecordId: d.providerRecordId, name: d.name, url: d.listingUrl, snapshot, retrievedAt, savedAt: now, eventIds };
}
