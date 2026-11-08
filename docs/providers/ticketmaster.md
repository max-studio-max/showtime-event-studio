# Provider: Ticketmaster Discovery API v2

| | |
|---|---|
| Adapter | `src/integrations/normalize.ts` (`normalizeTm*`), routes in `src/integrations/gateway/routes.ts` |
| Endpoints used | `GET /discovery/v2/venues.json`, `/events.json`, `/attractions.json` on `app.ticketmaster.com` |
| Docs | https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/ |
| Terms | https://developer.ticketmaster.com/support/terms-of-use/ (read before enabling) |
| Auth | Free API key, held **only** by the gateway (`TICKETMASTER_API_KEY` in `.env`). Never a `VITE_` variable. |
| Rate limits (checked 2026-11-08) | Published default quota is 5,000 calls/day; the overview and FAQ give different per-second figures. SHOWTIME spaces calls ≥ 250 ms, caps itself at 4,000/day, and reads `Rate-Limit*` response headers. |
| Caching | Gateway memory only, 1 hour. Saved references keep the provider id plus a minimal snapshot of what the user saw. |
| Attribution | "Event, venue and attraction data from Ticketmaster", shown on every result set. |

**Fields imported:** venue id, name, address, city, region, country, postcode, lat/lon, time zone, upcoming-event count, listing URL; event id, name, local date/time, status, segment/genre, venue, attractions, **published price ranges** (face value as reported); attraction id, name, segment/genre, homepage links, MusicBrainz id.

**Explicitly unsupported (stay null/unknown):** venue capacity, room or stage dimensions, rental prices, availability for private hire, venue official website (the listing is a ticket page), performer booking contacts or fees.

**Failure modes:** missing key → `not_configured` (no request is made); 401 → `unauthorized`; 429 → `rate_limited` honouring `Retry-After`; 5xx/timeouts retried twice with backoff and jitter, then the circuit opens for 60 s.

**Get a key:** create a free account at developer.ticketmaster.com → *My Apps* → copy the Consumer Key → put `TICKETMASTER_API_KEY=...` in `.env` → restart the gateway. **Revoke:** delete the app in the Ticketmaster developer portal and remove the line from `.env`.

**Testing:** synthetic fixtures in `tests/fixtures/providers.ts` mirror the documented response shapes; no Ticketmaster data is stored in the repo.
