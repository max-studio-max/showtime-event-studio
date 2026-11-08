# SHOWTIME — Live Data, Discovery & Source Verification
## Complete Engineering Implementation Specification
**Version:** 1.0  
**Date:** 2026-11-08  
**Status:** Proposed implementation requirements, not completed functionality  
**Repository:** `max-studio-max/showtime-event-studio`  
**Scope:** Live venue, event, talent, equipment, promotion and service-provider discovery, with safe ingestion into the existing event-production studio.

## 1. Objective and non-negotiable principles

Extend SHOWTIME from a local-first event-design and scenario-planning application into a source-backed, usable real-world discovery and procurement workspace. A user should find actual venues, discover performers and their publicly published booking channels, locate purchasable or rentable production equipment, discover hospitality suppliers and evaluate promotional channels. Selected entities must connect to the shared event model and influence planning **only when the data supports that use**.

**This is a full-feature specification, not a reduced V1 or a step-by-step development schedule.** The implementation team may plan releases separately; all requirements below remain part of the complete product definition.

Mandatory principles:

1. **Never invent a real-world fact.** No synthetic performers represented as real, guessed booking contacts, fabricated equipment prices, invented venue dimensions, or implied availability. Examples and fixture data must be explicitly labelled synthetic and excluded from production search.
2. **Provenance is field-level.** Every claim records the origin, supplier or publisher, exact source URL (when available), retrieved/observed timestamps, evidence status and applicable limitations. An entity being real does not verify every field.
3. **Unknown is not zero.** Missing pricing, room size, service availability, rental period, power draw, stage measurement, contract terms or talent fee is `null`/unknown; never infer a zero or silently fill it with an estimate. Explicit simulation assumptions may exist but must remain distinct from factual data.
4. **Discovery is not booking, purchasing or advertising.** External service listings do not constitute confirmed availability; external booking and buying links are referrals, not transactions. No publication, spending, inquiries or reservations without an explicit user action and authorization.
5. **Source and rights compliance.** Prefer sanctioned APIs, documented feeds, authorized vendor partners and official public pages. Respect API policies, licence terms, robots restrictions, caching limits, copyright, privacy and attribution. Publicly visible information is not automatically permitted for bulk ingestion or republication.
6. **Security first.** Never commit tokens, OAuth credentials or raw private business correspondence. Use a server-side integration gateway for credentials and cross-origin/provider traffic where needed, with least privileges and secure secret management.
7. **Preserve SHOWTIME's architecture.** Extend current domain types, derivation engine, provenance, export logic and user workflows without rewriting working subsystems. Maintain the distinction among `actual`, `published`, `private_quote`, `assumption` and `unknown`.
8. **No false certification.** Imported information and 3D planning do not certify fire-code compliance, accessibility, rigging safety, acoustical performance or legally approved occupancy. The interface must say so.
9. **Graceful degradation.** The application remains usable if an API is disconnected, exhausted, down or prohibited from supplying a field. Show cached/stale status and alternative official source links when permitted.
10. **Provider independence.** Each source is an adapter with a contract, not hardwired UI logic. Provider replacement must not break saved events.

## 2. Baseline repository and integration points

Current repository is a React 18 + TypeScript + Vite frontend with Three.js/React Three Fiber and Zustand local-state persistence. Relevant existing code:

- `src/domain/types.ts` — `Venue`, `Product`, `PriceOffer`, `TalentAct`, `MarketingChannel`, `SourceEvidence`, `ShowEvent`, `Scene` and related models.
- `src/domain/derive.ts` — `deriveEvent(event, workspace)` cross-module impacts, financial and capacity dependencies.
- `src/domain/factory.ts` — event creation and venue application.
- `src/engine/provenance.ts` — evidence and freshness rules.
- `src/engine/finance.ts`, `money.ts` — financial and currency calculation; incomplete costs.
- `src/pages/Venues.tsx`, `Spotlight.tsx`, `Catalog.tsx`, `Campaign.tsx`, `Service.tsx`, `Studio.tsx` — relevant interfaces.
- `src/data/venues.ts`, `channels.ts`, `catalog.ts` — existing source-noted seeds and generic placeholders.
- `src/state/store.ts` — existing browser workspace persistence and event editing.
- `tests/engine.test.ts`, `tests/integration.test.ts` — existing engine and integration testing.

Existing features and actual behaviour must be rechecked against the current `main` branch before editing. Do not overwrite manual user records with refreshed source data. Retain original source-identifying fields and event IDs through migrations. Existing seed venues should remain visible, with their documented `third_party_unverified` or illustrative status intact until revalidated.

## 3. Integration architecture

### 3.1 Provider adapter abstraction

Introduce typed adapters with distinct capability declarations. Suggested conceptual interfaces (illustrative, adapt to current conventions):

```ts
type ProviderKind =
  | 'ticketmaster' | 'official_venue' | 'places'
  | 'official_talent' | 'manufacturer' | 'supplier'
  | 'marketing_platform' | 'service_provider';

type ProviderCapability =
  | 'search_events' | 'search_venues' | 'get_venue'
  | 'search_performers' | 'get_performer'
  | 'find_public_booking_route' | 'search_products'
  | 'get_product_spec' | 'get_price_offer'
  | 'search_services' | 'get_channel_policy'
  | 'read_campaign_metrics';

interface ProviderAdapter {
  providerId: string;
  capabilities: ProviderCapability[];
  policy: {
    authMode: 'none' | 'server_key' | 'oauth';
    retentionPolicy: string;
    attributionRequired: boolean;
    permittedUses: string[];
  };
}
```

Every adapter must return structured records and an evidence envelope; never write provider JSON directly into the core event model. Normalize entity identities and timestamps at a dedicated boundary. Preserve the original provider ID and original source reference to support deduplication and auditing.

### 3.2 Data lifecycle

`Provider fetch -> schema validation -> provider provenance -> normalization -> duplicate/entity resolution -> source checks -> staged results -> user selection/review -> saved reference -> event association -> derivation update -> audit/event history`.

- **Live search result:** A temporary, attributed provider result; not automatically trusted or persisted indefinitely.
- **Saved reference:** A user-selected entity with source references, latest permitted snapshot and refresh state.
- **Event snapshot:** The exact values that informed a given event configuration, including price, currency, validity period and evidence. Historical budgets must not change silently.
- **Confirmed private fact:** A venue written quote, confirmed booking, performer contract, or invoice submitted by the organizer. Remains private and has its own validity and authorization scope.

### 3.3 Read gateway and persistence

The existing browser-only app cannot securely hold server secrets. Introduce a minimal optional backend or serverless gateway that handles authenticated provider requests, rate limiting, validation, retries, observability and secure caching. The app must still run in offline/local mode; provider-dependent functionality shows a clear disconnected state.

A durable store is required for shared live-data cache, provider policies, review history, entity mappings and future collaboration. A relational database is suitable but not mandatory; document exact schema, migrations, isolation and retention. Keep local drafts functional. Provide explicit synchronization and conflict policies rather than silently overwriting.

Suggested namespaces:

- `GET /api/discovery/events`, `/venues`, `/performers`, `/products`, `/services` — filtered discovery.
- `GET /api/entities/:type/:id` — normalized detail and source references.
- `POST /api/references` — save selected source-backed entity to a user workspace.
- `POST /api/refresh/:entityId` — request validation/refresh subject to budget and permission.
- `GET /api/providers/status` — availability, auth configuration, request budgets and provider policy notices.
- `GET /api/marketing/channels` — real channel documentation, opportunities and policy data.
- `GET /api/marketing/metrics` — scoped account analytics only after consent.

These are suggested conceptual endpoints, not a requirement to expose private data publicly. Validate all parameters, enforce authorization, do not permit arbitrary URL fetches, and never expose secret tokens in client URLs or logs.

### 3.4 Evidence contract

Extend `SourceEvidence` as needed with: `providerId`, `providerRecordId`, `sourceFieldPath`, `sourceType`, `sourceUrl`, `observedAt`, `retrievedAt`, `checkedAt`, `sourcePublishedAt`, `expiresAt`, `providerTermsVersion`, `usagePolicy`, `verificationMethod`, `confidenceClass`, `verificationStatus`, `lastVerifiedBy`, `rawPayloadHash`, `currency`, `unit`, `jurisdiction`, `sourceSnapshotId`, and `conflictGroupId`.

Not every field needs to be populated by every source. Keep distinct confidence/verification categories such as `provider_reported`, `official_published`, `user_reviewed`, `private_quote`, `stale`, `conflicted`, `modelled`, `unknown`. A provider API response may count as **provider-reported**, not necessarily authoritative for downstream operations outside the API's remit.

Use source-specific expiry rules; existing seed freshness (e.g. 30-day supplier offer, 90-day booking route, 90-day marketing rule, 180-day venue facts) provides defaults, not a universal licence to cache. Provider terms take precedence; when caching isn't permitted, persist provider IDs and retrieve on demand.

### 3.5 Cross-cutting mechanics

Implement deduplication by exact provider IDs first, then conservative candidate matching using normalized entity name, address, geography and web domain. Do not merge similarly named venues or performers automatically where ambiguity remains. Provide review/merge/unmerge controls with audit history.

Provider traffic needs abortable requests, timeouts, retry only on retryable faults, exponential backoff with jitter, request coalescing, bounded pagination, concurrency controls, rate-limit handling, circuit breakers, and provider-specific call budgets. Avoid retry storms. Track hit/miss, failure cause, latency, source age and cached-record counts without logging secrets or personal data.

## 4. Module: Venue Explorer + FIT + STAGECRAFT

### 4.1 Discovery capabilities

Search for real venues by location, radius, capacity range where published, event type, indoor/outdoor, accessibility information where published, permitted event categories, stage specifications, equipment availability, pricing evidence and booking route. Support the current target markets Toronto, New York City, Greater Los Angeles; permit broader geography without changing the domain model.

Primary event/venue discovery source: **Ticketmaster Discovery API v2**, for available venue/event/attraction records. It is a discovery source, not an event-space engineering database. Use `/discovery/v2/venues.json`, `/events.json`, `/attractions.json` and documented lookups with filters. The provider uses an API key and publishes quota limits; enforce conservative throttling and check current limits at implementation time. Official docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/

Optional discovery/enrichment source: **Google Places API (New)**, *only if enabled and economically justified*. It requires a field mask and billing setup; specify minimal needed fields and comply with Google Maps Platform display/retention policies. Do not assume Places provides stage dimensions, capacity, rental prices, a valid events-booking contact, or a licence to store its records indefinitely. Official docs: https://developers.google.com/maps/documentation/places/web-service/place-details

Higher-priority operational evidence: official venue website, published rental packages, venue technical riders, approved floor plans, stage specifications, published venue contact channel and written venue quotes.

### 4.2 Venue detail and 3D fidelity

Keep factual information in structured fields:

- Entity name, address, map location, official website, public booking route, market, timezone.
- Published seated/standing capacity **by room configuration**, date/source and caveats.
- Stage width, depth, height, proscenium, ceiling height, access doors, power specifications, loading access, in-house equipment, rigging restrictions, accessibility specifications and applicable diagrams **only where published**.
- Pricing type: public rental rate, quote-only, promotional/indicative rate or user-provided signed quote; list exclusions, units and valid dates.
- Commercial permissions and availability status: unknown unless a source actually provides applicable date-specific information.

The 3D scene must distinguish `verified_dimensions`, `partial_dimensions` and `illustrative`; a venue listing must never silently upgrade a fabricated room shell to verified geometry. Real floor plans/drawings may be linked as sources, but import/reproduction requires rights. Users can manually enter measurements (clearly user-measured/user-proposed). Support source-to-measurement mapping, geometry conflict warnings and user-reviewed overrides.

### 4.3 Venue actions and impacts

Search -> select venue -> choose actual room/configuration -> inspect evidence -> preview impacts -> apply to event. Applying a venue may update event timezone, venue name, published maximum capacity, certain verified stage dimensions and available equipment; it must not overwrite custom work without a before/after preview and confirmation. Preserve all event prior state and enable undo.

When an imported venue lacks spatial dimensions, show **illustrative 3D shell** prominently and disable claims of accurate clearance/seat capacity certification. If published occupancy is known, it is an upper bound, not proof that a proposed layout is valid.

## 5. Module: SPOTLIGHT performer discovery and booking routes

### 5.1 Sources and scope

Ticketmaster Attractions API provides discovery of real event performers and links; it does **not** prove that a person or act is available for private bookings. The booking contact must be sourced separately from an official performer site, established agency/management page, publicly published booking form or public professional booking contact. Record the **source page that explicitly publishes the route**. Never guess an email address, scrape personal phone numbers or invent fees.

Support comedy, solo artists, bands, DJs, speakers, hosts/MCs, magicians, dancers, family acts, cultural acts and other specialty entertainment; filter by category, genre, region, official sources and contact method. Search results must distinguish an event listing from an actual bookable-act directory entry.

### 5.2 Data and workflow

Act profile fields: normalized identity, act type, genres, primary region, official site, authoritative media where licensed, agency/management affiliation where published, public booking route, source URL, last reviewed, route status, internal shortlist tags, event assignment and user-private notes.

Stages: `discovered -> booking_route_found -> verified_route -> shortlisted -> inquiry_prepared -> inquiry_sent (user-confirmed) -> responded -> offer_made -> contracted (documented) / declined`. SHOWTIME cannot infer a booking from an outgoing click; fee, availability and rider stay unknown until obtained through legitimate communications.

For each act display **Contact / Official booking page** with direct source context; label unconfirmed route clearly. Do not send a booking request automatically or claim a confirmation. Preserve previous routes and their provenance when a public contact changes.

Provide real-world discovery while avoiding overclaiming availability. Include an admin/manual review and corrections process for disputed or stale business contacts. Exclude private or sensitive personal data.

### 5.3 Event propagation

Selecting an act adds a proposed lineup slot and optional rider-request task; it must not insert a fabricated booking fee into the budget. A verified private quote may create a cost line with the correct effective date, units, currency and tax/exclusion metadata. Changing a proposed lineup must update the production schedule only with clear preview and preserve actual confirmed arrangements.

## 6. Module: Equipment Catalog + STAGECRAFT procurement

### 6.1 Authentic products

Search and filter actual manufacturer models for microphones, wireless systems, mixers, speakers, monitors, subwoofers, lighting, controllers, stands, staging, truss, projection, power distribution, cabling and accessories.

Manufacturer documentation is the preferred source for dimensions, weight, power, connectors and physical specifications. Supplier listings are the source for an offer price, not for verifying all technical dimensions. A product may have multiple independent purchase/rental offers with different currencies, regions, bases and delivery exclusions.

**Never assume that a general-purpose shopping search endpoint grants catalogue scraping, product duplication or resale rights.** Use documented supplier feeds/APIs, approved partnerships, public link-only sourcing where permitted, and controlled manual verification. Do not depend on an unverified commercial API to make the whole app work.

### 6.2 Offer model and price behaviour

Offer fields: seller, seller domain, manufacturer/model/SKU, region, new/used where explicitly stated, rent/buy, amount, currency, pricing basis, quantity/minimum period, availability claim and timestamp, valid-until, link, delivery/tax/deposit exclusions, source, terms limitations, verified/reported state.

- **Live offer:** Retrieved from authorized supplier feed or verified official listing, with timestamp and link.
- **Recent offer:** Within the relevant provider-policy and freshness window; do not call it a guaranteed checkout price.
- **Stale offer:** Clearly labelled; must not appear as current in primary comparisons.
- **Request quote:** Null price, supplier contact route, and excluded from computable totals unless user adds private quote.
- **Unpriced generic scene proxy:** Remains available for visual layouts but is not a purchasable item.

When a user places equipment in 3D, use manufacturer dimensions only if they are sourced. Show `generic proxy` where not. Let the user compare buy/rent offers and follow outbound links; prices are not automatically accepted as committed costs. If a supplier updates a price, notify user and provide an explicit choice to refresh the event's draft procurement estimate. Never silently mutate an approved cost or committed order.

### 6.3 Procurement and finance

Procurement line must retain quantity, selected offer, rent duration, ownership, date/region, recorded price and source; link to scene objects; show a bill of materials and missing-quote list. Detect duplicate line items and venue-supplied equipment to prevent double counting. Show shipping/tax/deposit exclusions as unknown if not published. Multi-currency conversions require timestamped rates from a permitted FX source; missing rates make converted totals incomplete.

## 7. Module: CAMPAIGN — real promotional sources

### 7.1 Channel catalogue

Provide real official information for Google Ads, Meta advertising platforms, TikTok Ads, relevant event-listing services and applicable local media outlets. Each channel shows an official entry URL, documented supported formats, geographic availability, objective types, link to current official help/rules, last reviewed timestamp, and integration capability (`link-only`, `import`, `read`, `write`). Do not fabricate CPM, CPC, conversion rates, guaranteed results or minimum ad spend.

### 7.2 Authorized analytics and campaigns

The platform's public/link-only mode must work without OAuth. When users explicitly connect their own advertising accounts, support provider-approved authorization and read-only metrics as permitted by each platform. **Google Ads API requires OAuth 2.0 and a developer token**, and account-specific access is controlled by Google. Official docs: https://developers.google.com/google-ads/api/rest/auth

For Meta and TikTok, confirm current platform access requirements, review permissions, limits and approved use cases before implementing; don't assume unrestricted analytics or publishing APIs. Account linking must show requested scopes, consent, revocation and last sync time. Publishing or budget changes require separate explicit authorization and review; default is read-only.

Support truthful metrics such as observed impressions, clicks, reported ad spend, conversions and revenue **only with defined attribution/source**. Distinguish spend entered manually from imported observed spend; prevent duplicate imported rows through stable provider IDs and time-window keys. If no authorized live API exists, allow standardized CSV import with source label and time range.

### 7.3 Simulations and event link

Allow manually supplied spend, CPC, click-to-ticket conversion assumptions and scenario ranges, explicitly marked **modeled**. Never label such outcomes as observed results or use provider-wide benchmarks as specific event forecasts. Show source and assumption provenance in finance, and keep simulated sales separate from confirmed ticket sales.

## 8. Module: SERVICE — real operational suppliers

Discover real public hospitality/operations providers: caterers, bartending, rentals, event staffing, sanitation, security, accessibility services, check-in services and transport/logistics where appropriate. Use provider-authorized search APIs, official directory data or official business pages, with geographic filters and real contact methods.

Record offerings, service regions, published service minimums, price basis (if actually published), availability caveats, quote instructions and verification date. **A service business existing on a map does not imply it is eligible, available, priced or vetted for a specific event.**

Connect selected suppliers to staffing and hospitality planning as proposed suppliers. Quotes are private; budget lines can be derived only after the organizer confirms terms, amount, currency, dates and quantity. Do not auto-book, contact, or infer regulatory compliance.

## 9. UI and product experience

The core interaction should feel like real-world event production:

1. **Discover**: global search across venues, talent, equipment, services and campaigns with provider, city, freshness and verification filters.
2. **Inspect**: a consistent source-backed details view, official outbound link, what is known/unknown, updated timestamps, evidence conflicts and price/availability caveats.
3. **Compare**: comparable attributes only; do not sort unavailable prices as zero or imply that incomparable units (per day versus per item) are equivalent.
4. **Select**: save to a shortlist or import to a draft event through a preview showing downstream effects.
5. **Plan**: associate sources and snapshots to the stage, 3D layout, lineup, campaign, staffing and budget.
6. **Confirm**: source review and user confirmation when converting researched information to operational decisions.
7. **Monitor**: clear stale-data alerts, changed source facts, missing pricing, source failures and broken links.

Common interface components: source badges with distinct terminology, `retrieved`/`verified` dates, provider attribution, link to official source, missing-data warnings, manual refresh, compare tray, review drawer, shortlists and provider status/settings. Every network-dependent screen must provide loading, disconnected, expired, rate-limited, error and empty states.

Avoid misleading CTA labels. Examples: `Open booking page`, `Request quote`, `Review source`, `Add to proposed lineup`, `Compare offers`, `Refresh listing`, `Connect account`, not `Book now` unless the application is actually integrated into an authorized transactional booking flow.

## 10. Security, privacy, licensing and policy

- Source credentials only on a trusted backend; do not put privileged keys in `VITE_*` variables or ship them in browser bundles. Restrict any provider-documented public keys as required, while treating them as discoverable.
- Use OAuth with provider-approved scopes; no credential harvesting, scraping authenticated user pages, shared passwords or unauthorized session cookies.
- Validate outbound URLs, block SSRF by allowlisting provider hostnames, constrain redirect chains, enforce HTTP(S), set response size/time caps and sanitize imported text.
- Validate schema at the network boundary, display external text safely, do not execute externally supplied code/HTML.
- Make provider request logs privacy-safe; redact keys, cookies, contact data and query parameters containing tokens.
- Apply vendor terms to cache TTL, copying, attribution, images, map data and redistribution. Prefer reference IDs and official links where caching rights are limited.
- Source audit logs must protect user/organization IDs and allow deletion/export in future shared accounts.
- Publicly listed booking business contacts are not automatically blanket permission for mass marketing, bulk email or republishing personal information.
- Do not expose private quotes, contracts, guest lists, payments or customer details in a public repo or provider calls.
- Third-party images and brands require rights-respecting usage; favour source links over copied assets without permission.
- Provide disclaimers that venue codes, fire/egress rules, occupancy limits, structural rigging and accessibility need professional/venue confirmation.

## 11. Data migrations and backward compatibility

Existing browser workspaces must migrate without losing events, manual venue records, scene objects, proposals, imported evidence, quotes or audits. Version records and idempotently migrate older schemas. Include backup/export before migration, validation and rollback/recovery guidance. Maintain canonical internal IDs separate from Ticketmaster IDs, Google Place IDs or external seller identifiers; a provider record can be merged/unmerged without changing events' stable references.

Existing nine researched venues and five official marketing channels remain accessible but retain their unverified state. Keep existing generic equipment proxies usable in Studio with clear labels. Default all new provider connections to **disabled** until configured. The user can continue offline without breaking 3D, budgets, file exports or simulation.

## 12. Testing and quality gates

**Contract tests:** Map actual documented provider payloads into typed normalized entities; validate missing nested objects, unknown fields, pagination, duplicates, IDs, currency/units and unsupported records. Store sanitized fixtures only when allowed by provider terms; otherwise hand-authored synthetic fixtures labelled as such.

**Provider failure tests:** 401, 403, 404, 429, 500, timeout, malformed JSON, connectivity loss, partial results, expired credentials, revoked scopes, forbidden storage, stale source and redirect problems. Confirm retries/backoff do not multiply transactions or exhaust quotas.

**Provenance tests:** Source URL, provider identity, per-field retrieved dates, unverified status, conflicting sources, manual verification and expiry are preserved; missing values remain null; no user-edit becomes falsely supplier-verified.

**Venue tests:** Searching a real venue does not certify floorplan; applying a room warns about unknown dimensions; measured stage dimensions only influence 3D when tied to legitimate evidence; never exceed published capacity; event updates are previewed and reversible.

**Talent tests:** Attraction discovery alone never creates a verified booking route. Only explicit source-backed professional contact routes enter the directory; no fabricated fees or booking statuses.

**Catalog tests:** Products are not mistaken for offers; rental day × quantity maths works; different currency/period bases remain separated until properly normalized; old prices show stale; unavailable offers do not change historic committed costs; unknown price keeps event total incomplete.

**Campaign tests:** Imported observations are distinguishable from forecasts, stable records deduplicate, disconnected accounts display appropriately, OAuth revocation stops access, manual assumption changes do not impersonate real performance data.

**Service tests:** Actual supplier profiles have source links; vendor existence isn't availability; quote-only costs remain incomplete; no outgoing contact is sent without an explicit user action.

**Cross-module tests:** A genuinely selected venue, source-backed equipment and verified private performer quotes flow into a correct budget; source updates affect **draft preview**, not locked historical values. A stage-size change recomputes seat capacity and related ticket simulations without asserting false occupancy certification. Existing test suite remains green.

**Security tests:** No secrets in built JS or Git history, URL injection/SSRF attempts blocked, malicious text safely rendered, authorization checked on provider gateway, audit logs redact credentials.

**Performance tests:** Search with pagination, repeated queries, long-running provider outage, rate-limited responses and large entity lists must remain responsive. Render essential details promptly and lazy-load heavier 3D views.

## 13. Explicit acceptance criteria

- **LD-01:** Real Ticketmaster event, attraction and venue search returns correctly attributed and safely normalized results using a legitimately configured key; no fake record is presented as live.
- **LD-02:** Discovery results can be shortlisted, compared and referenced in a draft SHOWTIME event, without overwriting existing user work or claiming a booking.
- **LD-03:** Venue 3D fidelity remains illustrative when authoritative room dimensions are absent, regardless of whether venue name/capacity is known.
- **LD-04:** A performer search result cannot be treated as bookable without a public source-specific booking route, and an inquiry is not treated as a confirmed booking.
- **LD-05:** User can compare real equipment manufacturer specifications and source-backed supplier offers, with proper rental/purchase units and visible dates; missing or stale pricing is never displayed as a current zero-cost offer.
- **LD-06:** CAMPAIGN presents legitimate ad platform entry points and policies, and only imports actual account metrics when permission and valid authentication exist; assumptions are visibly distinguished.
- **LD-07:** SERVICE supports real source-backed vendor discovery and quote-based financial inclusion, without implying dates or rates are confirmed.
- **LD-08:** Every material real-world field is source-backed or explicitly classified as user-entered, quoted, assumed or unknown; conflicting sources are not silently averaged.
- **LD-09:** Failed, unauthorized or rate-limited provider access leaves the local application usable and shows actionable status.
- **LD-10:** Existing projects and browser data survive migrations; source refreshes never mutate approved commitments without explicit review.
- **LD-11:** No credentials or private client data are shipped in the public repository or browser bundle; public sources and contacts respect usage and privacy restrictions.
- **LD-12:** Automated unit, contract, integration and security tests cover the integration boundary, and `npm test`, `npm run typecheck`, `npm run build` pass in the developer's environment.
- **LD-13:** Source links are valid when verified and clearly marked when not checked; neither a link nor a provider API response creates an unsupported “verified” badge.
- **LD-14:** Saved events can reproduce the exact source-backed assumptions, values, selected quotes and software calculation version used in previous financial scenarios.

## 14. Source registry and developer documentation

Each provider requires an integration document capturing endpoint references, permitted use, licensing/caching rules, auth method, required scopes, rate limits as checked on a particular date, provider sandbox/test approach, fields imported, fields explicitly unsupported, failure modes and revocation instructions. Current source pointers:

- **Ticketmaster Discovery v2:** https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
- **Ticketmaster Discovery tutorial:** https://developer.ticketmaster.com/products-and-docs/tutorials/events-search/search_events_with_discovery_api.html
- **Google Places API (New):** https://developers.google.com/maps/documentation/places/web-service/place-details
- **Google Places billing and field masks:** https://developers.google.com/maps/documentation/places/web-service/usage-and-billing/ and https://developers.google.com/maps/documentation/places/web-service/choose-fields
- **Google Ads API authentication:** https://developers.google.com/google-ads/api/rest/auth
- **Provider homepages for source verification:** https://ads.google.com/ , https://www.facebook.com/business/ads , https://ads.tiktok.com/

**Note:** The Ticketmaster overview and FAQ currently show different default per-second rate-limit figures; implement conservatively and respect real response headers and the key's documented quota rather than hard-coding the higher number. Do not assume any third-party feed or API is free, accessible, stable, or legally reusable without checking current terms and account eligibility.

## 15. Deliverable definition

Completed implementation consists of: functioning source-backed discovery in the corresponding SHOWTIME screens; provider adapters and secured gateway as needed; source-aware persistence and entity mapping; truthful UI states; integration with the shared event/finance/3D models; documented configuration and provider rights; repeatable tests; migration strategy; and an updated README, architecture notes, data-provenance documentation and changelog.

**Not acceptable:** fabricated live data, unverified real-world dimensions represented as accurate, sample prices presented as current offers, a frontend that claims API connections without network-backed results, exposed secrets, blind scraping, silent budget mutation, or an interface that masks missing provider access with invented results.

---
**End of specification.**
