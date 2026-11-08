# SHOWTIME — Architecture

## Current shape (v0.2)

A local-first single-page web app plus a small **read-only integration
gateway** for live data. The workspace is persisted to `localStorage`; the
app keeps working with the gateway stopped (live search then shows
"gateway offline").

| Layer | Location | Notes |
|---|---|---|
| Shared event model | `src/domain/types.ts` | One `ShowEvent` shape read and written by every module. `actual`, `published`, `private quote` and `assumption` are distinct fields/states, never one generic `price`. |
| Dependency graph | `src/domain/derive.ts` | `deriveEvent(event, workspace)` recomputes everything downstream from the one event: scene → seating → ticket inventory → revenue; lineup/BOM/roster/campaign/suppliers → cost lines; guests → queues → staffing; and cross-module issues. Derived cost lines are never stored, so they cannot drift. |
| Calculation engine | `src/engine/*` | Pure, deterministic, unit-tested. Geometry, scene validation, money, capacity/finance, provenance, lifecycle, scenario hashing, queue/staff/campaign maths (incl. de-duplicated metric imports). |
| Seed data | `src/data/*` | 9 venue spaces + per-field evidence (spec §12), 5 marketing channels (spec §13), 21 generic layout proxies. |
| State | `src/state/store.ts`, `src/state/migrate.ts` | zustand store; every event edit goes through `updateEvent` (undo/redo, audit, approval rule). Versioned, idempotent schema migrations with a backup copy kept before any upgrade. |
| 3D | `src/studio/Viewport.tsx`, `src/pages/Studio.tsx` | three.js via React Three Fiber; orbit, orthographic plan and walk cameras in one scene. Lazy-loaded. |
| Exports | `src/domain/exports.ts` | Plan/stage-plot SVG, CSVs, event JSON, printable show packet. |
| **Live-data contracts** | `src/integrations/contracts.ts`, `providers.ts` | Provider-independent record shapes (`DiscoveredVenue/Event/Performer/Service`, `PerformerLinks`, `FxObservation`) with field-level evidence; provider registry with policies, allowlisted hosts and budgets. |
| **Normalizers** | `src/integrations/normalize.ts` | The provider boundary: schema checks on `unknown` input, text sanitising, http(s)-only URLs, nulls for missing values, `provider_reported` evidence per fact. |
| **Gateway** | `server/index.ts`, `src/integrations/gateway/*` | Node HTTP server on 127.0.0.1:5241 (GET only). Holds the Ticketmaster key, validates every parameter, builds upstream URLs itself, and enforces allowlist, timeouts, retry with backoff/jitter, Retry-After, spacing, daily budgets, circuit breaker, request coalescing and TTL cache. Logs are redacted. |
| **Adoption boundary** | `src/integrations/adopt.ts` | The only place discovery results become domain records (saved venue, supplier, act draft, reference). Never upgrades trust. |
| **Client** | `src/integrations/client.ts`, `src/pages/Discover.tsx` | Calls `/api/*` (Vite proxies to the gateway); checks the user's provider toggles first; typed error states. |

### Live-data lifecycle (LD spec §3.2)

`provider fetch → schema validation → normalization (+evidence) → gateway envelope (attribution, retrievedAt, cached, rejected count) → user review in Discover → saved reference / saved venue / supplier / act draft → event association (with impact preview) → deriveEvent → audit`.

Trust only goes up through a human action: a provider fact becomes `verified_authoritative` only when a reviewer records the **official** source URL where it is confirmed (a provider's own page doesn't count).

### Conventions

- **World space:** metres; x = width, z = depth (+z toward audience), y = up; room centred on origin.
- **Money:** integer minor units in the line's own currency; conversions only through a recorded `FxRate`.
- **Unknowns:** `null`, never `0`. Missing price → totals *incomplete*.
- **Fidelity:** saved venues are always `illustrative`; `verified_dimensions` needs measured geometry.
- **Identity:** internal ids are derived from provider keys (`osm:<type>/<id>`, `ticketmaster:<id>`), so re-saving updates instead of duplicating; provider ids are kept in `provider.recordId` / evidence `providerRecordId`.

## Running

Requires Node 20 or newer.

```bash
npm install
npm run dev:all    # gateway (5241) + app (http://127.0.0.1:5240)
# or separately:
npm run gateway
npm run dev
npm test           # engine, integration and live-data contract/failure/security tests
npm run typecheck
npm run build      # also runs scripts/check-bundle.mjs (fails if a secret is in dist/)
```

Optional `.env` (git-ignored): `TICKETMASTER_API_KEY=...`, `GATEWAY_PORT=5241`.

OneDrive can lock `node_modules/.vite`; if the dev server fails with `EPERM … .vite\deps`, delete that folder.

## Not built yet (required by the specs)

- **Server-side persistence, accounts and tenancy** — the gateway is stateless (memory cache only); there is no shared database, authentication, MFA, role enforcement, tenant isolation or collaboration (spec §14.1, §16, AC-13; LD §3.3 durable store).
- **Scheduled refresh and link-health checks** — saved records refresh only when the user searches again; no background re-validation, change alerts or review queue (LD §3.5, §9 "Monitor").
- **Entity resolution beyond exact ids** — de-duplication uses provider ids (shared across both OSM paths); no fuzzy merge/unmerge UI across Ticketmaster and OSM (LD §3.5).
- **OAuth connectors** — no Google Ads/Meta/TikTok account linking (requires approved developer access); Campaign uses CSV import with row-level de-duplication.
- **Real product and price data** — no free sanctioned supplier feed exists; Catalog offers remain user-entered with source links (LD §6).
- **Supplier search when Overpass is down** — venue search falls back to Nominatim; supplier search has no equivalent fallback.
- **Geometry import, advanced technical design, bundle splitting** — unchanged from v0.1.
