# Provider: OpenStreetMap (Overpass API + Nominatim)

| | Overpass | Nominatim |
|---|---|---|
| Used for | Venue search by place type within a radius; service-supplier search | Geocoding the city; fallback venue search when Overpass is down |
| Hosts | `overpass-api.de`, mirror `overpass.kumi.systems` | `nominatim.openstreetmap.org` |
| Docs | https://wiki.openstreetmap.org/wiki/Overpass_API | https://nominatim.org/release-docs/latest/api/Search/ |
| Usage policy | Fair use; public endpoints are for human-initiated queries | https://operations.osmfoundation.org/policies/nominatim/ — max 1 request/second, identifying User-Agent, no bulk geocoding |
| Auth | None | None |
| Spacing / budget in SHOWTIME | ≥ 2 s between calls, 500/day | ≥ 1.1 s between calls, 1,000/day |
| Cache | 6 h in gateway memory | 7 days in gateway memory |

**Licence:** © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). Attribution is shown on every result. Records saved into a workspace are a derived database: if a workspace is ever redistributed, ODbL share-alike applies.

**User-Agent:** `SHOWTIME-event-studio/0.2 (+https://github.com/max-studio-max/showtime-event-studio)` — identifies the app without personal contact details.

**Tags queried** (only this vetted list reaches the query; user text never does):
- Venues: `amenity=theatre|arts_centre|events_venue|nightclub|conference_centre|music_venue|community_centre`
- Suppliers: see `SUPPLIER_CATEGORIES` in `src/integrations/contracts.ts` (caterers, party/event rentals, security, staffing agencies, vehicle rental, sanitation, AV). Coverage of most supplier types is thin; the UI says so per category.

**Fields imported:** name, address, website, phone, opening hours, wheelchair, place type, `capacity` **only when it is a plain positive integer** (e.g. "approx 500" is discarded, not guessed). All provider-reported.

**Unsupported:** availability, pricing, vetting, licensing, rooms, dimensions. A mapped business is not an available supplier.

**Fallback:** if Overpass times out or errors, venue search runs five Nominatim place-type searches for the city ("theatre in …", "arts centre in …", etc.) and labels the result set accordingly (fewer results, no radius). Results from both paths share the key `osm:<type>/<id>`, so they de-duplicate. Supplier search has no reliable Nominatim equivalent and shows the outage instead.

**Observed 2026-11-08:** all public Overpass endpoints were unreachable from the development machine for over an hour (status page included) while openstreetmap.org and Nominatim responded normally. The fallback path was exercised live during that outage.
