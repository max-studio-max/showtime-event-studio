/**
 * Provider-independent contracts shared by the gateway (server) and the app.
 * Adapters turn provider payloads into these shapes at one boundary; provider
 * JSON never reaches the event model directly.
 */
import type { ProviderId, SourceEvidence, SupplierCategory } from '../domain/types';

export type ProviderCapability =
  | 'search_events'
  | 'search_venues'
  | 'search_performers'
  | 'get_performer_links'
  | 'search_services'
  | 'geocode'
  | 'fx_rate';

export interface ProviderPolicy {
  id: ProviderId;
  name: string;
  capabilities: ProviderCapability[];
  authMode: 'none' | 'server_key';
  homepage: string;
  termsUrl: string;
  attribution: string;
  /** How long the gateway may keep a response in memory. */
  cacheTtlMs: number;
  /** Minimum spacing between upstream requests (provider usage policy). */
  minIntervalMs: number;
  dailyBudget: number | null;
  permittedUses: string;
  limitations: string;
}

export type GatewayErrorCode =
  | 'not_configured'
  | 'invalid_params'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'budget_exhausted'
  | 'circuit_open'
  | 'timeout'
  | 'upstream_error'
  | 'bad_response'
  | 'network'
  | 'gateway_offline'
  | 'disabled';

export interface GatewayError {
  code: GatewayErrorCode;
  message: string;
  retryAfterSec?: number;
  provider?: ProviderId;
}

export interface Page {
  number: number;
  size: number;
  totalElements: number | null;
  totalPages: number | null;
}

export interface Envelope<T> {
  provider: ProviderId;
  attribution: string;
  retrievedAt: string;
  cached: boolean;
  page?: Page;
  results: T[];
  /** Records dropped at the boundary (missing id/name, unsupported type). */
  rejected: number;
  notice?: string;
}

interface Base {
  /** `${provider}:${recordId}` — stable for de-duplication; never used as SHOWTIME's internal id. */
  key: string;
  provider: ProviderId;
  providerRecordId: string;
  name: string;
  /** Page on the provider (ticket page, OSM element, MusicBrainz entry). Not an official site. */
  listingUrl: string | null;
  evidence: SourceEvidence[];
}

export interface DiscoveredVenue extends Base {
  kind: 'venue';
  address: string | null;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  postalCode: string | null;
  lat: number | null;
  lon: number | null;
  timezone: string | null;
  website: string | null;
  phone: string | null;
  venueType: string | null;
  /** Only when the provider publishes one (OSM `capacity` tag); provider-reported, never certified. */
  capacity: number | null;
  wheelchair: string | null;
  upcomingEvents: number | null;
}

export interface DiscoveredEvent extends Base {
  kind: 'event';
  localDate: string | null;
  localTime: string | null;
  timezone: string | null;
  status: string | null;
  segment: string | null;
  genre: string | null;
  venueName: string | null;
  venueProviderId: string | null;
  city: string | null;
  attractions: string[];
  /** Published price ranges as reported by the provider (face value, may exclude fees). */
  priceRanges: { type: string | null; currency: string; min: number | null; max: number | null }[];
}

export interface DiscoveredPerformer extends Base {
  kind: 'performer';
  segment: string | null;
  genres: string[];
  country: string | null;
  area: string | null;
  disambiguation: string | null;
  upcomingEvents: number | null;
  /** Provider-reported official homepage(s). An event listing is not a booking route. */
  homepages: string[];
  musicbrainzId: string | null;
}

export interface PerformerLinks {
  provider: ProviderId;
  providerRecordId: string;
  sourceUrl: string;
  retrievedAt: string;
  homepages: string[];
  /** URLs MusicBrainz editors tagged as the artist's booking page. Community-maintained: provider-reported. */
  bookingPages: string[];
  evidence: SourceEvidence[];
}

export interface DiscoveredService extends Base {
  kind: 'service';
  category: SupplierCategory;
  address: string | null;
  website: string | null;
  phone: string | null;
  lat: number | null;
  lon: number | null;
  openingHours: string | null;
}

export interface GeocodeResult {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  countryCode: string | null;
  bbox: [number, number, number, number] | null;
}

export interface FxObservation {
  from: string;
  to: string;
  /** Decimal string exactly as published. */
  rate: string;
  date: string;
  source: string;
  sourceUrl: string;
  retrievedAt: string;
  note: string;
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  configured: boolean;
  circuit: 'closed' | 'open' | 'half_open';
  lastSuccessAt: string | null;
  lastError: GatewayError | null;
  budgetUsedToday: number;
  dailyBudget: number | null;
  rateLimit: { limit: number | null; available: number | null; resetAt: string | null } | null;
  policy: ProviderPolicy;
}

export const SUPPLIER_CATEGORIES: Record<SupplierCategory, { label: string; osm: string[]; note: string }> = {
  caterer: { label: 'Caterers', osm: ['craft=caterer', 'shop=caterer'], note: 'OSM tags caterers inconsistently; many are mapped only as restaurants.' },
  event_rental: { label: 'Party & event rentals', osm: ['shop=party', 'shop=rental'], note: 'Covers party-supply and general rental shops; check each for event inventory.' },
  security: { label: 'Security companies', osm: ['office=security'], note: 'Licensing must be confirmed for your jurisdiction.' },
  staffing: { label: 'Staffing agencies', osm: ['office=employment_agency'], note: 'General employment agencies; event specialisation unknown.' },
  transport: { label: 'Vehicle & van rental', osm: ['amenity=car_rental', 'amenity=truck_rental'], note: 'Rental desks; commercial terms unknown.' },
  sanitation: { label: 'Portable toilet & waste', osm: ['craft=sanitation', 'office=sanitation'], note: 'Sparse in OSM; expect few results.' },
  av_production: { label: 'AV / stage production', osm: ['craft=sound_technician', 'shop=hifi', 'office=event_management'], note: 'Very sparse in OSM; use as a starting point only.' },
};

export const VENUE_OSM_TAGS = ['amenity=theatre', 'amenity=arts_centre', 'amenity=events_venue', 'amenity=nightclub', 'amenity=conference_centre', 'amenity=music_venue', 'amenity=community_centre'];
