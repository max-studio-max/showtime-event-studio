/**
 * Provider registry. Policies were read from each provider's documentation on
 * 2026-11-08 (see docs/providers/*.md). Limits here are deliberately *below*
 * the published figures; response headers override them at runtime.
 */
import type { ProviderId } from '../domain/types';
import type { ProviderPolicy } from './contracts';

const H = 3600_000;

export const PROVIDERS: Record<ProviderId, ProviderPolicy> = {
  ticketmaster: {
    id: 'ticketmaster',
    name: 'Ticketmaster Discovery API v2',
    capabilities: ['search_events', 'search_venues', 'search_performers'],
    authMode: 'server_key',
    homepage: 'https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/',
    termsUrl: 'https://developer.ticketmaster.com/support/terms-of-use/',
    attribution: 'Event, venue and attraction data from Ticketmaster',
    cacheTtlMs: H,
    minIntervalMs: 250, // published default is higher; stay conservative
    dailyBudget: 4000, // default key quota is published as 5,000/day
    permittedUses: 'Discover events, venues and attractions; link to Ticketmaster pages.',
    limitations: 'Not a source of venue floor plans, room dimensions, rental prices, private availability or talent booking contacts. Listing pages are ticket pages, not official sites.',
  },
  osm_overpass: {
    id: 'osm_overpass',
    name: 'OpenStreetMap (Overpass API)',
    capabilities: ['search_venues', 'search_services'],
    authMode: 'none',
    homepage: 'https://wiki.openstreetmap.org/wiki/Overpass_API',
    termsUrl: 'https://www.openstreetmap.org/copyright',
    attribution: '© OpenStreetMap contributors (ODbL)',
    cacheTtlMs: 6 * H,
    minIntervalMs: 2000,
    dailyBudget: 500,
    permittedUses: 'User-initiated searches of mapped places; attribution required; ODbL share-alike applies to derived databases.',
    limitations: 'Community-mapped: coverage and accuracy vary. Capacity tags, phones and websites are provider-reported. A mapped business is not availability, pricing or vetting.',
  },
  osm_nominatim: {
    id: 'osm_nominatim',
    name: 'OpenStreetMap Nominatim (geocoding)',
    capabilities: ['geocode'],
    authMode: 'none',
    homepage: 'https://nominatim.org/',
    termsUrl: 'https://operations.osmfoundation.org/policies/nominatim/',
    attribution: '© OpenStreetMap contributors (ODbL)',
    cacheTtlMs: 7 * 24 * H,
    minIntervalMs: 1100, // policy: max 1 request/second
    dailyBudget: 1000,
    permittedUses: 'Occasional user-initiated geocoding with an identifying User-Agent; results cached.',
    limitations: 'No autocomplete, no bulk geocoding.',
  },
  musicbrainz: {
    id: 'musicbrainz',
    name: 'MusicBrainz',
    capabilities: ['search_performers', 'get_performer_links'],
    authMode: 'none',
    homepage: 'https://musicbrainz.org/doc/MusicBrainz_API',
    termsUrl: 'https://musicbrainz.org/doc/About/Data_License',
    attribution: 'Artist data from MusicBrainz (CC0 core data)',
    cacheTtlMs: 24 * H,
    minIntervalMs: 1100, // policy: 1 request/second with an identifying User-Agent
    dailyBudget: 2000,
    permittedUses: 'Look up artists and their official homepage / booking URL relationships.',
    limitations: 'Community-edited. Mostly musicians; few comedians, speakers or variety acts. A booking URL here is a lead to check at the destination, not a verified route.',
  },
  bank_of_canada: {
    id: 'bank_of_canada',
    name: 'Bank of Canada Valet API',
    capabilities: ['fx_rate'],
    authMode: 'none',
    homepage: 'https://www.bankofcanada.ca/valet/docs',
    termsUrl: 'https://www.bankofcanada.ca/terms/',
    attribution: 'Exchange rates from the Bank of Canada',
    cacheTtlMs: 6 * H,
    minIntervalMs: 500,
    dailyBudget: 500,
    permittedUses: 'Daily average indicative exchange rates against CAD, with attribution.',
    limitations: 'Indicative daily averages published on business days; not a transaction rate.',
  },
};

export const ALLOWED_HOSTS: Record<ProviderId, string[]> = {
  ticketmaster: ['app.ticketmaster.com'],
  osm_overpass: ['overpass-api.de', 'overpass.kumi.systems'],
  osm_nominatim: ['nominatim.openstreetmap.org'],
  musicbrainz: ['musicbrainz.org'],
  bank_of_canada: ['www.bankofcanada.ca'],
};

export const USER_AGENT = 'SHOWTIME-event-studio/0.2 (+https://github.com/max-studio-max/showtime-event-studio)';

/** Series the Bank of Canada publishes against CAD. */
export const BOC_SERIES: Record<string, string> = { USD: 'FXUSDCAD', EUR: 'FXEURCAD', GBP: 'FXGBPCAD', JPY: 'FXJPYCAD', AUD: 'FXAUDCAD', MXN: 'FXMXNCAD' };
