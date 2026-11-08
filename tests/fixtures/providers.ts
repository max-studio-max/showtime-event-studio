/**
 * SYNTHETIC FIXTURES — hand-written to mirror the documented response shapes
 * of each provider. None of these names, ids, addresses or prices are real
 * records; they exist only for contract tests and are never shown in the app.
 */
export const tmVenues = {
  _embedded: {
    venues: [
      {
        id: 'SYNTH-VEN-1',
        name: 'Synthetic Hall',
        url: 'https://www.ticketmaster.com/synthetic-hall-tickets/venue/1',
        locale: 'en-us',
        postalCode: 'M0M 0M0',
        timezone: 'America/Toronto',
        city: { name: 'Toronto' },
        state: { name: 'Ontario', stateCode: 'ON' },
        country: { name: 'Canada', countryCode: 'CA' },
        address: { line1: '1 Example Street' },
        location: { longitude: '-79.38', latitude: '43.65' },
        upcomingEvents: { _total: 12, ticketmaster: 12 },
        unknownFutureField: { anything: true },
      },
      { id: 'SYNTH-VEN-2', name: 'Bare Venue' }, // missing every nested object
      { name: 'No id — must be rejected' },
      { id: 'SYNTH-VEN-3', name: '   ' }, // blank name — rejected
      { id: 'SYNTH-VEN-4', name: 'Bad URL Venue', url: 'javascript:alert(1)', location: { latitude: 'north', longitude: null } },
    ],
  },
  page: { size: 20, totalElements: 5, totalPages: 1, number: 0 },
};

export const tmEvents = {
  _embedded: {
    events: [
      {
        id: 'SYNTH-EVT-1',
        name: 'Synthetic Comedy Night',
        url: 'https://www.ticketmaster.com/event/SYNTH',
        dates: { start: { localDate: '2026-12-05', localTime: '20:00:00' }, timezone: 'America/Toronto', status: { code: 'onsale' } },
        classifications: [{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Comedy' } }],
        priceRanges: [{ type: 'standard', currency: 'cad', min: 35, max: 75 }, { type: 'broken' }],
        _embedded: { venues: [{ id: 'SYNTH-VEN-1', name: 'Synthetic Hall', city: { name: 'Toronto' } }], attractions: [{ name: 'Synthetic Comic' }] },
      },
      { id: 'SYNTH-EVT-2', name: 'No dates or prices' },
    ],
  },
  page: { size: 20, totalElements: 2, totalPages: 1, number: 0 },
};

export const tmAttractions = {
  _embedded: {
    attractions: [
      {
        id: 'SYNTH-ATT-1',
        name: 'Synthetic Comic',
        url: 'https://www.ticketmaster.com/synthetic-comic-tickets/artist/1',
        classifications: [{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Comedy' }, subGenre: { name: 'Undefined' } }],
        externalLinks: { homepage: [{ url: 'https://synthetic-comic.example' }], musicbrainz: [{ id: '00000000-0000-4000-8000-000000000001' }] },
        upcomingEvents: { _total: 3 },
      },
    ],
  },
  page: { size: 20, totalElements: 1, totalPages: 1, number: 0 },
};

export const osmVenues = {
  elements: [
    { type: 'node', id: 1001, lat: 43.65, lon: -79.38, tags: { name: 'Synthetic Theatre', amenity: 'theatre', capacity: '450', website: 'https://synthetic-theatre.example', 'addr:housenumber': '10', 'addr:street': 'Example Ave', 'addr:city': 'Toronto', wheelchair: 'yes' } },
    { type: 'way', id: 2002, center: { lat: 43.66, lon: -79.39 }, tags: { name: 'Approx Club', amenity: 'nightclub', capacity: 'approx 500', website: 'ftp://not-http.example' } },
    { type: 'node', id: 3003, lat: 43.6, lon: -79.3, tags: { amenity: 'theatre' } }, // unnamed — rejected
    { type: 'area', id: 4004, tags: { name: 'Unsupported element type' } },
  ],
};

export const osmCaterers = {
  elements: [{ type: 'node', id: 5005, lat: 43.64, lon: -79.4, tags: { name: 'Synthetic Catering Co', craft: 'caterer', phone: '+1 416 555 0100', opening_hours: 'Mo-Fr 09:00-17:00' } }],
};

export const mbSearch = {
  count: 2,
  artists: [
    { id: '00000000-0000-4000-8000-000000000001', name: 'Synthetic Band', type: 'Group', country: 'CA', area: { name: 'Canada' }, disambiguation: 'synthetic test act', tags: [{ name: 'indie' }] },
    { id: 'not-a-uuid', name: 'Rejected' },
  ],
};

export const mbLinks = {
  relations: [
    { type: 'official homepage', url: { resource: 'https://synthetic-band.example/' } },
    { type: 'booking', url: { resource: 'https://agency.example/synthetic-band' } },
    { type: 'booking', ended: true, url: { resource: 'https://old-agency.example/x' } },
    { type: 'social network', url: { resource: 'https://social.example/sb' } },
  ],
};

export const bocUsd = { observations: [{ d: '2026-11-06', FXUSDCAD: { v: '1.3912' } }] };
export const nominatimToronto = [{ lat: '43.6534817', lon: '-79.3839347', name: 'Toronto', display_name: 'Toronto, Ontario, Canada', boundingbox: ['43.57', '43.85', '-79.63', '-79.11'] }];

export const nominatimTheatre = [
  { osm_type: 'way', osm_id: 7007, category: 'amenity', type: 'theatre', name: 'Synthetic Opera House', lat: '43.65', lon: '-79.38', extratags: { website: 'https://synthetic-opera.example', capacity: '2000' }, address: { road: 'Example St', house_number: '5', city: 'Toronto', state: 'Ontario', country_code: 'ca' } },
  { osm_type: 'node', osm_id: 8008, type: 'theatre' }, // unnamed — rejected
];
