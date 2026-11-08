# SHOWTIME — Complete Product Specification

**Document type:** Full-product requirements and system specification, with initial repository setup and development foundations (not an MVP brief or vendor-specific coding prompt)  
**Product:** SHOWTIME — The Event Production Studio  
**Tagline:** Plan it. Design it. Produce it. Promote it.  
**Specification version:** 1.2 · 8 November 2026  
**Status:** Full product definition. Implementation and availability of third-party data or integrations must be verified independently.

---

## START HERE — Project initialization, Git and engineering foundations

SHOWTIME must be established as an independently owned, version-controlled software project **before any feature implementation begins**. This section defines the initial project setup, technical hygiene, source history and development conventions. It is not a restricted feature set, release plan or substitute for the complete application specification in the sections that follow.

### A. Prepare the development environment

1. Choose a dedicated SHOWTIME workspace, separate from existing application repositories and confidential source code.
2. Install and verify Git, a terminal, the language runtime/package manager appropriate to the selected architecture, and a code editor or coding assistant of choice. Do not couple the specification to any particular assistant.
3. Confirm compatibility of the chosen runtime, graphics stack, browser tooling and native dependencies on the actual development machine. On Windows ARM, explicitly check architecture support; use WSL2 where required and supported rather than assuming all x64 tools will work.
4. Configure a Git identity and working GitHub authentication using the platform's supported login mechanism. Never embed authentication tokens in source files or remote URLs.
5. Record key architectural decisions and installation prerequisites in `docs/ARCHITECTURE.md` and `README.md` as they become known.

### B. Initialize Git before writing application code

1. Create a dedicated project directory, suggested name `showtime-event-studio`.
2. Initialize a Git repository on the `main` branch.
3. Add a truthful `README.md` describing the product vision, the current implementation status, setup instructions and how to run checks.
4. Add this full specification to `docs/SHOWTIME_COMPLETE_PRODUCT_SPECIFICATION.md`.
5. Add `.gitignore` covering secrets, `.env` files, build outputs, temporary artifacts, dependencies, local databases, logs and generated media. An `.env.example` may contain nonsecret field names and placeholder values.
6. Determine licensing and ownership deliberately; do not assume that a public GitHub repository makes third-party material reusable.
7. Make an initial commit **before** implementing the first feature.

Example commands (execute in the chosen development environment; documentation files must actually exist before staging):

```bash
mkdir showtime-event-studio
cd showtime-event-studio
git init -b main
mkdir -p docs
# Create README.md and .gitignore; copy this document into docs/.
git add README.md .gitignore docs/SHOWTIME_COMPLETE_PRODUCT_SPECIFICATION.md
git commit -m "docs: initialize SHOWTIME and full product specification"
git status
```

If a Git identity is missing, configure `user.name` and `user.email` locally before committing.

### C. Create and connect a GitHub repository

1. Create a new GitHub repository for SHOWTIME under the appropriate owner/account. Private or public visibility is an intentional product and collaboration decision.
2. Connect the local repository to the **actual** remote URL, then push `main`.
3. Confirm the repository contains the initial commit, README, ignore rules and full specification.
4. Keep the remote URL documented in project records and ensure collaborators have explicitly authorized access.

```bash
git remote add origin <YOUR_ACTUAL_GITHUB_REPO_URL>
git push -u origin main
git remote -v
git log --oneline -5
git status
```

These commands are instructions, not a claim that the repository already exists. Never fabricate a remote URL, commit history, test result, or implementation status.

### D. Repository organization

The following structure is illustrative and technology-neutral. Adapt folders to the actual implementation without losing the documented responsibilities.

```text
showtime-event-studio/
  README.md
  .gitignore
  .env.example                      # Nonsecret placeholders only
  LICENSE                           # If and when explicitly chosen
  docs/
    SHOWTIME_COMPLETE_PRODUCT_SPECIFICATION.md
    ARCHITECTURE.md
    DATA_PROVENANCE.md
    SECURITY_AND_PRIVACY.md
    CHANGELOG.md
  src/                              # Production application source
  tests/                            # Unit, integration and UI checks
  scripts/                          # Repeatable development utilities
  examples/                         # Clearly identified test fixtures
```

### E. Development and data integrity rules

- Maintain a real, readable Git history with meaningful commits for implemented features, bug fixes, refactors and tests. Use feature branches and pull requests where collaboration or risk justifies them.
- Review diffs and run applicable checks before merging. Document failures, edge cases and unresolved risks rather than inventing successful outcomes.
- Implement actual business logic and usable application functionality. Placeholder buttons, mock figures and static visuals must never be represented as complete features.
- Protect intellectual property, third-party licensing rights and personal information. Keep passwords, credentials, private booking records, and confidential files out of source control and any shared development logs.
- Use clearly labelled synthetic data only for isolated tests. Real product listings, venue specifications, talent contacts and marketing sources must follow the verified provenance and freshness requirements elsewhere in this specification.
- Track the origin, permission to reuse, timestamp, currency, terms and confidence of external data. Publicly viewable information is not automatically freely redistributable.
- Document actual component and integration boundaries; preserve consistent filenames and stable contracts unless changes are intentionally recorded.
- Cover critical application logic with reproducible tests: spatial units and transforms, geometric clearances, event-state dependencies, cost calculations, source-status logic and data import/export integrity.
- Keep development extensible: each module participates in the shared event model rather than becoming an isolated demo.

### F. Initial project foundation checklist

- [ ] Dedicated project directory established.
- [ ] Development environment and required tooling verified on the target computer.
- [ ] Git initialized before application code is written.
- [ ] README, `.gitignore`, and complete product specification created.
- [ ] Initial commit completed with accurate metadata.
- [ ] Actual GitHub repository created and remote push verified.
- [ ] Ownership, licence choices and third-party data usage reviewed.
- [ ] Architecture, security, data-provenance and change-documentation locations established.
- [ ] Development and test commands documented once available.
- [ ] Subsequent work tracked through meaningful commits and actual test results.
- [ ] No secrets, confidential content or unlicensed assets committed.

**Scope rule:** This initialization section is a prerequisite for developing SHOWTIME. It does not reduce or phase the complete product requirements covering SHOWTIME, STAGECRAFT, FIT, CAMPAIGN, SERVICE, SPOTLIGHT, CATALOG and shared simulation systems.

---

## 1. Product vision and non-negotiable principles

SHOWTIME is a unified, professional yet approachable application for **designing, budgeting, preparing, promoting, booking, and operating real-world events**. It joins event planning, an interactive dimensionally accurate 3D venue/stage editor, real equipment and supplier references, entertainment booking discovery, promotional planning, hospitality operations, and a connected scenario-analysis engine in one persistent event workspace.

**This specification describes the complete intended product.** It does not reduce the target experience to a basic calendar, 2D mock-up, fictional marketplace, sample-act directory, or set of disconnected dashboards. Delivery sequencing is deliberately not specified; a development assistant/team can decide releases separately without redefining product requirements.

### 1.1 Product commitments

1. **Real-world utility:** Every primary interaction helps an organizer make or document a concrete event-production decision.
2. **3D-first spatial design:** Stagecraft and FIT have an interactive 3D model as their canonical design surface. Orthographic/top-down views may be available **within the 3D engine** as practical editing views, not as substitutes for 3D.
3. **Source-backed real-world information:** Venue capacity/dimensions, technical specifications, product information/pricing, talent contacts, platform rules, and supplier availability must carry provenance, capture time, and freshness indicators. No fabricated records passed off as factual.
4. **Real pricing where published:** Display a retailer or rental company's actual published quote/price, linked to its source, with currency, timestamp, terms, and availability context. **No mandatory manual price entry for discoverable catalog items.** If no current public price exists, display *Request quote* or *Price unavailable*, never a made-up figure. Custom privately negotiated costs may still be added by users voluntarily.
5. **Real venues:** Seed the venue directory with three identifiable venues in each of Toronto, New York City, and Greater Los Angeles (nine total). Different locations and rooms are modeled distinctly. Public dimensions and specifications are used only where supported; missing dimensions remain unknown. **A real venue record is not automatically a verified-to-scale 3D model.**
6. **Real promotional outlets:** Include legitimate advertising and event-discovery services, official links, publishing requirements, actual platform fees where fixed and published, and correctly attributed forecast assumptions.
7. **Public professional talent channels:** SPOTLIGHT contains real, identifiable entertainers/acts and verified official or authorized public booking routes. Do not invent managers, phone numbers, email addresses, fees, or availability.
8. **Shared state:** Venue selection, room geometry, stage footprint, seating, performers, staffing, equipment, campaign estimates and event budgets affect one another through documented dependencies. A disconnected module is a design defect.
9. **Honest simulation:** SHOWTIME calculates exact values when sufficient verified inputs exist, and labels modeled scenarios and inferred outcomes separately. It never certifies fire/code compliance, acoustic performance, structural safety, ticket sales, or marketing outcomes without appropriate authoritative evidence.
10. **Usable, trustworthy and recoverable:** Keyboard-accessible controls, understandable empty/error states, autosave with undo/history, secure collaboration, consistent units/currencies and exports are baseline characteristics.

### 1.2 Audience and use cases

Independent producers; comedy promoters; live music venues; wedding and party organizers; corporate/event agencies; schools and community organizations; conference organizers; houses of worship where permitted by venue policies; audio/lighting technicians; talent bookers; hospitality teams; vendors; artists preparing technical riders. Support from small, low-budget gatherings through multi-room professional productions. Venue-specific usage restrictions must be shown when known.

### 1.3 Product positioning

Not a ticket marketplace alone; not a calendar; not a generic 3D home-design tool; not an event-management game. Core promise: **select or create a real space, arrange a real production, discover ways to obtain what is needed, and understand the operational and financial consequences before committing.**

---

## 2. Information architecture and navigation

### 2.1 Main application

- **Home / Portfolio:** upcoming and archived events; event readiness, deadlines, approvals, unresolved conflicts, cost deltas; quick search and recently edited items.
- **Events:** searchable table and calendar; owned, shared, templates, duplicated events; public/private event types.
- **Venue Explorer:** real venue directory; verified specs, room details, 3D eligibility, booking links, licensing and restrictions.
- **Studio:** central 3D environment; switches between **FIT** space planning and **STAGECRAFT** technical design without losing scene state.
- **SPOTLIGHT:** talent categories, verified profiles, representation/booking links, discovery and shortlisting.
- **CATALOG:** source-backed equipment, furniture, décor and supplier listings; buy/rent options; compatibility and provenance.
- **CAMPAIGN:** event promotion, channel planning, tracking and attribution.
- **SERVICE:** attendance, guest journey, catering/bar, staff, vendors, accessibility and operating plans.
- **FINANCE & SIMULATION:** integrated costs, ticketing assumptions, forecasts, breakeven, sensitivity and scenario comparisons.
- **PRODUCTION:** run of show, call sheets, responsibilities, documents, permits and checklists.
- **TEAM / SETTINGS:** workspaces, permissions, notifications, currencies/units, business identity, connections and security.

The core event stays active as a shared context: event name, city, venue/room, date/time zone, attendance target, selected scenario, save/sync state, outstanding issues and budget are visible across modules.

### 2.2 Event lifecycle states

`draft → researching → planning → pending_external_confirmation → approved → in_production → live → completed → archived`; `cancelled` is possible from appropriate earlier states. Status does not imply venue/performer availability unless explicitly verified. A state transition must be audited with actor/time/reason. Editing after approval can require a new approval depending on workspace rules.

### 2.3 Core event records

Each event has unique ID; organization; title; category/subtype; descriptions and tags; public/private visibility; dates with IANA time zone; venue and rooms; organizer contacts; staff roster; talent lineup; guest segments; ticket products; spatial scene versions; vendor/procurement selections; campaign plan; hospitality plan; budget and currency; attachments; sources; approvals; scenario lineage; change history. Support a multiday event, multiple sessions, overlapping venues/rooms, and a multi-event portfolio.

---

## 3. SHOWTIME: Event Command Center

### 3.1 Event creation and management

- Create from blank configuration, event-type template (comedy, concert, panel, wedding, conference, gala, festival, market, community event), or duplicate an existing event while explicitly choosing which historical data to copy.
- Configure multiple dates, timezone-aware doors/show/curfew windows, setup/strike blocks, rehearsal, soundcheck, service and venue access windows.
- Distinguish venue holds, inquiries, tentative reservations and confirmed bookings with evidence attachments.
- Define capacity by room and configuration, ticket classes, complimentary holds, accessible seating, staff/performer allotments, standing vs seated and age restrictions.
- Set quantitative event targets (attendance, revenue, cost ceiling, staffing coverage, fundraising, audience reach) with clear units and current/projection status.
- Dashboard shows planned versus confirmed elements, open quotes, unfunded purchases, documentation gaps, conflicts and approved versions.
- Structured notes, custom fields, reusable checklists, attachments and versioned document repository; no silent overwrites.

### 3.2 Venue discovery and selection

- City/neighborhood/coordinates; event suitability; capacities by setup; room type; tech features; accessibility indicators; rental restrictions; estimated/quoted rent only when actually published or entered as a user private quote; verified contact and source links.
- Venue comparison: **apples-to-apples** breakdown by compatible room configuration, published inclusions, venue policy, date status (if authorized calendar exists), and known/unknown attributes.
- Publicly available floor plans, seating charts, tech riders, power plans and loading instructions are linked as original documents; show file licensing and allowed use.
- Selection imports only verified venue facts; user can create a *separate proposed configuration overlay* without altering canonical venue documentation.
- Detect a conflict if an event layout requests dimensions or technical services not confirmed for that venue; display an explicit "requires venue confirmation" state.

### 3.3 Production coordination

- Multi-track production schedule with milestones and dependencies; setup, load-in, rehearsal, artist arrival, doors, performances, interval, service, load-out.
- Run-of-show editor with cue numbers, assigned operators, fallback notes, planned/actual timestamps and attached assets.
- Staff/contractor roster, roles, availability, shifts, call times, breaks, contact permissions, task ownership and responsibility matrix.
- Shared document center: contracts, insurance certificate references, permits, riders, safety plans, site maps, orders and invoices.
- Change-impact review showing affected tasks, financial changes, staff needs, tickets and venue constraints.
- Notifications for pending confirmations, expiring prices and incomplete documents; digest and per-event controls.

---

## 4. FIT: 3D Venue and Space Planning

### 4.1 Geometry as the source of truth

The scene uses a consistent world coordinate convention and physically meaningful base units (meters internally; feet/inches display toggle). Store precise numeric transforms; display unit conversions without rounding internal geometry. Distinguish **verified measured geometry**, **proposed layout geometry**, and **approximate visualization**. Support hall/room shells, multiple floors, outdoors, elevations and distinct zones.

### 4.2 Scene authoring

- Import supported 3D and floor-plan sources where licensed; IFC/glTF/GLB are candidates, with carefully validated converters for CAD/DXF/SVG/PDF plans. Import does not imply source accuracy.
- Build a room from explicit measurements; draw, extrude, and edit walls, floor, ceilings, columns, doors, windows, platforms, stairs and fixed seating; choose surface/material visualization.
- Place, duplicate, mirror, rotate, align and distribute furniture, booths, tables, chairs, risers, barriers, staging, signage, decor, accessible seating and service infrastructure; snapping, grid, object locking, grouped objects, layer visibility.
- Dimension annotations, measurement tools, rulers, object inspector, named zones, labels, elevations, scale legend, and geometry validation.
- Multiple cameras: orbit, perspective, orthographic, elevated overview and eye-level walkthrough. Walkthrough has adjustable eye height and speed; navigation respects basic collisions without being represented as an evacuation certification.
- Seating editor: table plans, aisle layout, sections, rows, accessible positions, standing zones, seating tiers, numbering, seat holds and selectable configurations.
- Zoning: guest paths, queueing, registration, restrooms, catering, merchandise, bars, VIP, production, storage, emergency pathways and backstage zones.
- Layout variants with branching, snapshot comparison, change logs and independent annotations.

### 4.3 Spatial analytics and safeguards

- Compute free area and occupancy using explicitly configurable assumptions; report which dimensions are source-verified and which are user-proposed.
- Collision/overlap detection based on meshes/bounding geometry, obstruction, walkable clearance, door accessibility, blocked stage access, seating sightline ray checks (geometric **screening** only), and visible route bottlenecks.
- Seats lost/gained when moving stage or adding booth; report delta and whether verified venue maximum remains binding.
- Configurable accessibility and code **checklists** reference jurisdiction and standards; do not auto-declare legal approval. Distinguish `potential_conflict`, `needs_review`, `verified_by_professional`.
- Guest flow estimation may use a documented simplified queue or agent model, but assumptions must be configurable, with sensitivity ranges.
- Physical dimensions of catalog products derived from official specifications; models without trustworthy dimensions are marked *visual only* and cannot silently satisfy precise clearance tests.

### 4.4 3D accuracy and performance

- Indexed geometry, instanced seating, level-of-detail, mesh compression, GPU-aware memory budgets, asset lifecycle and viewport virtualization; graceful reduced-quality mode.
- Scene state survives reload and collaborative edits; camera states independent of geometry; no camera reset after minor edits.
- Raycast selection, transform gizmos, snapping, precise numeric input, history commands and object identifiers remain deterministic.
- Screenshots/renders, scene export, printable floor-plan/elevation projections and equipment-position schedules are generated from the same 3D scene.
- No claim that an unmeasured venue has a faithful digital twin. On-screen badges: `Verified dimensions`, `Partial dimensions`, `Illustrative model`.

---

## 5. STAGECRAFT: 3D Stage & Technical Production

### 5.1 Stage construction

- Configure stage width/depth/height, deck modules, risers, wings, backstage, sightline obstacles, ramps, FOH position, control positions, fly/rigging points when verified, instrument plots and performance zones.
- Drag real-spec or dimensioned generic microphone stands, mics, loudspeakers, wedges, line-array elements, subs, mixers, racks, lighting fixtures, stands, truss, cameras, displays, projectors, instruments and cases into 3D.
- Search, filter and compare by use case, dimensions, weight, power, inputs, output, manufacturer, rental/buy, region and source freshness.
- Stage plot presets for stand-up comedy, solo act, acoustic trio, full band, DJ, conference panel and keynote. Preset is a starting arrangement, not a claim about a specific venue.

### 5.2 Audio system planning

- Input list, channel labels, mic/DI assignments, stage boxes, monitor sends, console routing, patch sheet and digital/analog connector details.
- Signal-flow graph linking microphones, preamps, processors, mixing consoles, amplifiers, passive/active speakers, record feeds and intercoms, with type and compatibility checks.
- Equipment electrical/physical constraints: stated wattage/voltage, channel counts, cable lengths, connector compatibility and distribution requirements; load calculations use device ratings and distinguish nominal/peak.
- Lightweight coverage visualization based on published directional properties **only if provided**, otherwise generalized and visibly approximate. Never claim calibrated SPL, intelligibility or acoustic compliance without a qualified model and survey.
- Feedback risk and monitor placement as advisory checklists; no false predictive guarantee.

### 5.3 Lighting, video, power and rigging

- Fixture placement, mounting height, aim/orientation, beam cones where optical data exists, focus areas, patch and universe/channel maps, cue notes, color/temperature presets and power totals.
- Projection/screen relationship, throw-distance checks using verified projector lens specs, visibility/camera angles, media servers and signal interfaces.
- Cable route planning, power drop locations, load grouping, cable run lengths, documented circuits and access constraints.
- Structural rigging load calculations are informational and require explicitly verified point capacities plus qualified review; no green 'safe to rig' result from assumed capacities.
- Equipment already supplied by venue, organizer-owned, requested rental and purchase candidates must be separately tagged so costs are not double counted.

### 5.4 Production outputs

Stage plot, technical rider, patch sheet, input list, monitor plan, equipment list, sourcing links, show cues, power summary, setup/strike schedule, outstanding venue questions and annotated 3D/2D projection exports. Changes propagate to procurement and budget with an explicit diff.

---

## 6. CATALOG: Source-Backed Equipment and Supplier Discovery

This is **not required to be an in-app checkout store**. It is a procurement research and planning layer that makes real products/rentals obtainable from authoritative external sources.

### 6.1 Catalog entities

Product name/model/manufacturer/SKU; category; photos and authorized 3D asset; official spec link; precise dimensions/weight/power where documented; supported accessories; vendor; vendor location/service area; buying/rental offer; offered currency; amount; unit basis (`per item`, `per day`, `per weekend`, `package`, etc.); minimum rental period; taxes/shipping/delivery/setup exclusions; return/deposit terms; availability status; valid-as-of; last checked; direct purchase/inquiry URL; verification/evidence state.

### 6.2 Catalog behavior

- Search by product, function and compatibility with multi-faceted filters; display source link beside actual offer.
- Compare multiple reputable sellers and rental suppliers, normalize currency for **comparison only** while retaining original quoted price/currency; record FX rate source and timestamp.
- Source precedence: official manufacturer specifications for product capabilities; supplier's own current public listing for offered price; approved feeds/partner data when available; historical prices only as explicitly dated context.
- Region-aware pricing: shipping region, taxes, import/duties, delivery radius, rental dates and pickup/return availability.
- User can open retailer site, email/call supplier via verified business details, request quote, save shortlist, add listing to BOM, or add private quote received independently.
- An unavailable price never becomes `$0`; store it as `null` with an explanation.
- Historical and expired listings remain audit records but are not shown as current offers.
- Supplier rating/reviews only if sourced from a licensed or permitted provider; never generated ratings.
- Sourcing comparison: purchased total-cost-of-ownership vs rental cost, delivery/setup assumptions and breakeven, with unknown charges clearly indicated.

### 6.3 Catalog-to-scene connection

Selecting a product with verified dimensions places its accurate bounding geometry into STAGECRAFT/FIT. If an authorized 3D model is unavailable, generate a **dimensionally accurate primitive proxy** with unmistakably generic appearance. If dimensions are unknown, require measurement before physical-fit validation. Replacement mapping preserves location where possible and shows changed clearances, equipment requirements and cost.

### 6.4 Update and provenance

Price freshness rules by provider; automated checks only within permitted API/feed/site terms; exponential retry and backoff; manual review queues; removal/opt-out requests; source document snapshots or hashes where licensing permits; price change alerts; link health checks; no disallowed scraping/circumvention.

---

## 7. SPOTLIGHT: Real Entertainment and Talent Booking Directory

### 7.1 Coverage and profiles

Real-world performers and booking organizations, including **stand-up comedy; solo musicians; bands; DJs; keynote/motivational speakers; hosts/emcees; magicians; dancers; cultural performers; specialty entertainment; family entertainment**. Regional genre taxonomy supports multiple tags, language, performance formats and audience suitability.

Profile schema: public stage name; act entity type; verified official profile/website; genre and skills; home region; published touring/service geography (if available); publicly stated show format and duration; technical rider link if authorized; promotional media with rights; verified official booking route (agency page, contact form, business email or published booking phone); representation attribution; source link; verified-on timestamp; last checked; contact-type classification; verification confidence; event suitability notes. Never infer a private phone/email from a name or scrape protected personal information.

### 7.2 Discovery and booking flow

- Search/filter by city, genre, act type, typical audience, event type, published service region, performance length, technical needs and contact method.
- Bookmarks, shortlist comparison, lineup builder and conflict flags for overlapping set windows.
- `Visit official booking page`, `Contact public booking representative`, and `Request availability` links/routes; **a directory result is not a confirmed booking**.
- Organizer records inquiry date, response, proposed fee, travel/accommodation, rider requirements and contract state privately; private prices are tagged as organizer-entered quotes.
- External availability and published fees are not inferred unless provided by an authorized source.
- Talent/representation can claim and verify profile through domain/email/business verification, request correction, set a public contact preference and opt out where appropriate.
- Detect redirects, dead links, stale agency relationships and duplicate acts; set `verification_required` when affiliation is uncertain.
- Imports through licensing-compliant public sources, authorized partners and direct submissions; preserve legal attribution and removal policy.

### 7.3 Booking to production linkage

Adding a performer creates a proposed performance block, dependent staffing needs, rider checklist, potential equipment requirements, backstage/service requests and financial line item **only when supported by verified/public or private negotiated inputs**. Change impact is previewed. All uncertain requirements remain flagged and cannot silently populate authoritative technical requirements.

---

## 8. CAMPAIGN: Event Promotion and Marketing Studio

### 8.1 Real promotional channel directory

Channel records for Google Ads/YouTube ads, Meta's Facebook/Instagram advertising, TikTok Ads, relevant event listing/ticket platforms (e.g. Eventbrite/Ticketmaster discovery subject to permissible use), venue newsletters, business directories, local media/radio, print outlets and authorized creator/affiliate partners. Each provides official URL, service regions, available ad format, platform requirements, publicly published fee/budget rules, account prerequisites, attribution source, verification date and integration capability (`link-only`, `import`, `read`, `write`, `publish`). Never claim write-access before authorized integration exists.

### 8.2 Campaign planner

- Define target audience(s), geographic radius, dates, channel mix, creative assets, media specs, offers, messaging variants, landing/ticket URL, source/UTM parameters, disclosure requirements and owner.
- Budget allocation by channel, creative production and management; separate **planned spend**, **committed spend**, **observed spend**, **published fixed fee**, **model-based estimate**, **actual paid invoice**.
- Campaign schedule (announce, early bird, lineup drop, reminder, last-call, day-of), creative approval, embargoes and deliverable dependencies.
- Preview assets (posters, thumbnails, social cards, copy) with format validation; export content packs; no misleading claims about venue/talent confirmations.
- Official destination links for manually launching campaigns; connected account controls only with valid OAuth/scopes and explicit user approvals.
- UTM/link builder and click tracking subject to privacy/consent; referral and ticket-channel attribution with known limitations.

### 8.3 Analytics and forecasting

- Import actual impressions, clicks, spend, reach, attributable conversions and ticket sales via authorized connectors/file upload; distinguish gross from deduplicated conversions.
- Metrics: CPM, CPC, CTR, CPA, ROAS (define revenue basis), conversion rate, frequency where supported, campaign velocity and channel spend.
- Model revenue/attendance ranges based on user-specified or historically observed conversion inputs, assumptions and confidence bands. Never present hypothetical reach, clicks or CAC as observed platform facts.
- Run controlled scenarios (channel allocation, ticket price, attendance, creative conversion), display elasticity assumptions and sensitivity, and compare to actual data as it accumulates.
- Track both paid and organic promotion, plus manual offline placements, but label manual entries.

### 8.4 Examples of verified current source policy

Google Ads does not offer a universal fixed cost: its official guidance describes advertiser-set budgets and auction/goal-dependent costs. TikTok publishes minimum campaign/ad-group budgets, which can change over time. SHOWTIME stores those **rule statements with dates**, not a fabricated estimated cost-per-ticket. API access and permissible scopes are checked against live documentation before use.

---

## 9. SERVICE: Hospitality and Guest Operations

### 9.1 Guest planning

- Attendee cohorts (general admission, VIP, accessible, guests, staff, talent, media), projected and verified counts, arrival windows, RSVP/ticket redemption imports with consent.
- Zones and entry paths derived from FIT: queueing, doors, registration/check-in, cloakroom, washrooms, bars, dining, merchandise, accessible routes and designated quiet spaces.
- Seating/table assignments, group constraints, dietary/allergen notes handled as sensitive personal data with minimization and appropriate role permissions; export only necessary details.
- Incident and service notes with access controls and retention rules.

### 9.2 Catering, bar and vendors

- Caterer/vendor profiles, public business contacts, menus/packages with source/quote status, capacity, service windows, minimum order, delivery windows, power/water needs and permitted service areas.
- Demand planning for portions and staffing using organizer-entered assumptions or historical actuals; model range rather than a precise guarantee.
- Bars/concessions: station placement, throughput assumptions, projected queue times with labeled assumptions, stock/consumables planning, age-restriction and local licensing checklists.
- Vendor booth footprints affect FIT clearances and electrical loads; changes update procurement and cost lines.

### 9.3 Staff and operations

- Roles, shifts, location, headcount, breaks, handovers, union/contract constraints where configured, staff check-in and incident escalation.
- Task assignments for setup, reception, food service, sanitation, security coordination and strike.
- Accessibility planning and venue-specific accommodation requirements; clearly differentiate user configuration and verified venue offerings.
- Guest arrival/service risk indicators based on declared throughput and not portrayed as scientifically validated crowd safety certification.

---

## 10. FINANCE & SIMULATION: The Connected Engine

### 10.1 Cost and revenue ledger

Categories: venue rent, deposits, staffing, talent fees, travel, tax, permits/insurance, equipment rent/buy, delivery, technical crew, catering/bar, marketing, ticketing/platform fees, merchandise, contingency, accessibility services, other. Each line holds amount **or null**; basis/quantity; currency; source; confidence; tax inclusion; committed/estimated/paid state; dependencies; event/scenario reference and edit history.

Revenue lines: paid tickets by tier, sponsor agreements, grants, bar/merch revenue, donations and vendor fees. Distinguish **gross receipts**, **platform/processing deductions**, **tax collected/remitted**, **net sales**, and **contribution/profit**.

### 10.2 Required formulas and safeguards

- `gross_ticket_revenue = Σ(sold_or_assumed_quantity_by_tier × face_price_by_tier)`.
- `available_tickets = min(verified_venue_capacity_for_configuration, physically_planned_sellable_seats_or_permitted_standing_capacity) − approved_holds`; if venue capacity is unknown, available tickets cannot be asserted as certified.
- `net_ticket_revenue = gross_ticket_revenue − ticketing_and_processing_fees − refunds − included_taxes_as_applicable`; show each assumption.
- `total_cost = Σ(fixed_costs) + Σ(variable_quantity × unit_cost) + tax_or_delivery_or_contingency_as_applicable`; any missing required price makes exact total **incomplete**, not artificially low.
- `event_contribution = modeled_revenue − modeled_cost`; actual and modeled use separate ledgers.
- Break-even may be derived from weighted average net contribution per attendee and fixed/variable costs **only** if denominator positive and required prices known; otherwise report non-computable with explanation.
- Use decimal-safe currency arithmetic, configurable rounding, immutable original currency and timestamped FX conversion.
- Multi-scenario sensitivity: low/base/high assumptions, price changes, attendance changes, show sell-through, attrition, marketing conversion, weather contingency, equipment substitutions and vendor quotes.

### 10.3 Dependency examples (must actually recalculate)

| Change | Mandatory downstream propagation |
|---|---|
| Stage footprint expands | FIT seating/clearance recompute, revised capacity, ticket inventory and revenue range; issue warnings if verified maximum exceeded |
| Product substituted | 3D dimensions and collisions, connector/power specifications, sourcing link, quote status, budget |
| Venue switched | Room shell, 3D fidelity label, technical inventory, limitations, quote, capacity, staff logistics, schedule; unresolved elements remain as flagged conflicts |
| Added act | Lineup schedule, rider questions, possible equipment needs, talent quote states, hospitality and budget |
| Guest forecast rises | Seating/standing limits, entry queues, service demand, staffing, stock, cost and revenue projections |
| Campaign spend increases | Planned cost, scenario return, breakeven; ticket forecast only if an explicit conversion model links the change |
| Rental dates change | Supplier rental duration/availability and fees where rules documented, venue booking inquiry status, staffing conflicts |

### 10.4 Explainability and scenario history

All computed values must provide an inspectable chain of input fields, sources, equations, version, assumptions, unit conversions and unknown dependencies. Saved what-if scenarios are immutable snapshots or branching diffs; comparing two scenarios shows quantified changes plus reasons. Recompute deterministically for a given input version; historical forecasts stay reproducible even when today's external price changes.

---

## 11. Integration, authenticity and data-governance architecture

### 11.1 Source hierarchy

**Venue facts:** official venue website, official technical rider/floor plan, direct written venue confirmation (authorized/user-uploaded); then municipal or venue partner registries for limited attributes.  
**Catalog specs:** official manufacturer datasheet; authorized reseller technical specifications.  
**Prices:** current actual supplier offer/feed, attributed and date-stamped; negotiated organizer quote stored separately.  
**Talent:** act's official site, verified agency/management booking page, authorized representation, or direct confirmed submission.  
**Marketing:** official advertising platform help/developer pages, authorized connected account metrics, actual invoices.  
**Ticket/event discovery:** authorized API or permitted direct public-link references.

Third-party directory text, LLM extraction, search-engine snippets and social posts are **discovery aids, not automatic proof** of a technical measurement, current representation or price. If sources conflict, preserve both, select authoritative newest evidence for an attribute only when justified, and surface an unresolved discrepancy when necessary.

### 11.2 Per-field evidence record

`SourceEvidence {id, entityType, entityId, fieldPath, assertedValue, unit, sourceType, sourceUrl, publisher, retrievedAt, sourcePublishedAt?, validFrom?, validUntil?, rawDocumentHash?, extractionMethod, reviewerId?, verificationStatus, confidenceClass, license/usagePolicy, notes}`.

**Required statuses:** `verified_authoritative`, `verified_supplier`, `user_confirmed_private`, `third_party_unverified`, `stale`, `contradicted`, `unavailable`, `modeled`, `illustrative`. `Verified` is never a mere AI confidence score. Separately record 3D geometry fidelity, and distinguish factual availability from user-estimated assumptions.

### 11.3 Source lifecycle

- Maintain a permitted-source registry and review cadence by data category; periodic checks for link, price, contact and policy changes.
- Show source next to claim and in a provenance panel. If a source disappears, retain evidence metadata and mark data stale, subject to document licensing.
- Partner/API integrations must respect authentication, rights, quotas, retention, deletion and redistribution restrictions. No CAPTCHA bypass or scraping behind access controls.
- Provide correction workflow, business/talent claim, ownership review, takedown, audit trail and manual dispute resolution.
- Source-backed fields are read-only in the canonical public record; private user-specific overrides live separately with labels.
- **Do not promise a continuously accurate supplier price, available date or booking contact if the system cannot refresh it.**

### 11.4 Candidate public integrations (capability, not guaranteed access)

- Ticketmaster Discovery API: event, attraction, venue lookup. Public developer documentation confirms its existence, but it is **not** a substitute for venue floor plans, direct talent booking contacts, private availability or ticketing transactions. Access scope and rate policy must be confirmed for the configured account.
- Google Ads API: authorized advertising-account analytics/management subject to access level and OAuth; official Google Ads help for budget/pricing rules.
- Meta Marketing API and TikTok business/ad documentation: only authorized functionality and approved scopes; budgets are not the same thing as observed ad costs.
- Google Places or other licensed location/geocoding APIs: address/place context only, not technical floor plans.
- Supplier/manufacturer feeds and partner services: permitted pricing/specs and direct product URLs; otherwise source-linked browsing without automated promises.
- Calendar, cloud document storage and ticketing services: opt-in connectors with scoped read/write permissions, failure states and user-controlled disconnect.

---

## 12. Nine Real Initial Venue Records — Research-Backed Candidates

**Geography:** Toronto (Canada), New York City (USA), Greater Los Angeles (USA), three venues each. This table is a **verified-source seed candidate list**, not a claim that nine licensed, scale-accurate 3D venue models or live date availability have been obtained. Capacity figures are venue-published configurations and remain subject to venue confirmation. Many complete floor plans/technical details may require further permissions or direct inquiry.

| City | Real venue / modeled room | Publicly documented starting attributes | Official source | 3D source fidelity gate |
|---|---|---|---|---|
| Toronto | **Meridian Hall** | Official April 2026 technical-specification PDF available; detailed production document, with venue equipment subject to confirmation | https://assets.ctfassets.net/nmxu5kj1b6ch/1OQF1d4Nka2SQo0R8xGac3/18d1a37334bcee6192f5b32db5561970/TechSpecs_MH_MeridianHall_2026-04.pdf | Import only dimensions substantiated by plan/rider; do not reconstruct undocumented wall geometry |
| Toronto | **Meridian Arts Centre — Lyric Theatre** | Venue lists **561 theatre seats**, technical specifications and floor-plan links; published *approximate* daily rental cost **CAD 10,000**, not a guaranteed quote | https://www.tolive.com/Venue-Detail-Page/reference/Meridian-Arts-Centre | Room-specific source plans; rental pricing tagged indicative and reconfirmable |
| Toronto | **Harbourfront Centre — Studio Theatre** | Current rental page lists **181 fixed raked seats** and availability window/inquiry rules. Note some older pages list different numbers; prioritize current rental record | https://harbourfrontcentre.com/venue-rentals/ | Capacity verified for listed configuration; detailed scene pending validated measurements |
| New York City | **Symphony Space — Peter Jay Sharp Theatre** | Official **715 seats** (562 orchestra / 153 balcony); stage **40 ft wide × 38 ft deep**; rental/spec page and floor plan | https://www.symphonyspace.org/rentals/rent-the-peter-jay-sharp-theatre | Stage dimensions source-backed; other geometry only from verified floor plan |
| New York City | **Symphony Space — Leonard Nimoy Thalia** | Official **169 seats**; apron **19 ft wide × 11 ft deep**; published stage height/grid details and floor plan | https://www.symphonyspace.org/rentals/rent-the-leonard-nimoy-thalia | Different room from Sharp and distinct 3D layout |
| New York City | **City Winery NYC — Main Venue** | Official private-events page: **350 seated / 450 reception**, built-in stage, two green rooms, two bars; configurations must remain distinct | https://citywinery.com/pages/new-york-city-private-events | Capacity facts verified; room shell must not be claimed to scale without sanctioned dimensions |
| Greater Los Angeles | **The Ebell of Los Angeles — Wilshire Ebell Theatre** | Official rental documents for technical details, floor plan, lighting plots and seating chart; **1,238 total seats** listed (855 orchestra / 168 loge / 215 balcony) | https://www.ebellofla.org/rental-information | Strong source for document-backed geometry; confirm changes with venue |
| Greater Los Angeles | **The Ford** | Official site lists **1,190 seats**, rental and technical information; outdoor amphitheatre | https://www.theford.com/about-the-ford and https://www.theford.com/about-the-ford/rent-the-ford | Outdoor venue-specific terrain/grade must not be imagined as surveyed |
| Greater Los Angeles | **The Wallis — Bram Goldsmith Theater** | Official **500 seats** (400 orchestra / 100 mezzanine), **46 ft × 24 ft proscenium**, stage **41 ft deep**; rental use has restrictions | https://thewallis.org/wallis_venues | Published structural/stage data only; verify rental eligibility and exact scale |

**Caution on geography:** The Wallis is in Beverly Hills and is included as part of the Greater Los Angeles market, not mislabeled as physically within Los Angeles city limits. Two separate Symphony Space rooms are separate **bookable venues/spaces at one organization**; if an interpretation requires three unrelated *venue operators* per city, replace one of those two records with an independently operated venue after source verification. The current list intentionally offers three distinct usable spaces per market.

### 12.1 Venue ingestion fields and handling

Each row expands to a venue organization, campus, space/room, configuration records, contacts, official booking URL, permitted event types, published pricing rules, applicable venue policies, dated technical documents, searchable source evidence, 3D model status, geometry measurement evidence and unverified item checklist. Per-room capacities and published rates are **not interchangeable**.

### 12.2 Venue data acceptance

A venue can enter searchable directory with verified identity/URL even without an authoritative floor plan; such a venue must be marked `3D illustrative / specifications partial`, with stage measurement editing restricted to known measurements or clearly user-proposed overlays. A venue must **not** be represented as a fully verified 3D digital twin until all material spatial elements used in clearance/capacity calculations are measured and approved. Venue availability/rental pricing must remain inquiry-only unless a genuinely authorized availability/quote source exists.

---

## 13. Real Marketing Platform and Distribution Source Catalog

| Source / destination | Use in SHOWTIME | Evidence requirements and caveats |
|---|---|---|
| Google Ads | Search/video/display campaign plans, destination link, connected performance reporting | Official budget/CPC guidance: https://business.google.com/us/resources/articles/how-much-google-ads-cost/ ; authorized API: https://developers.google.com/google-ads/api/docs/get-started/introduction |
| Meta Ads (Facebook/Instagram) | Social campaign planning, creative specs, authorized account reporting | Official business/developer docs and connected account metrics; variable auction cost, not fixed guaranteed CPC: https://www.facebook.com/business/ads and https://developers.facebook.com/docs/marketing-apis/ |
| TikTok Ads | Short-form video campaign planning, actual published budget eligibility rules | Official August 2026 minimum-budget FAQ: https://ads.tiktok.com/resources/help/article/budget-and-bidding-faq ; rules region/account dependent |
| Ticketmaster Discovery | Discover comparable events, venues and public event links where license permits | https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/ ; *not* a general-public ticketing/publishing write API |
| Eventbrite | Event publishing/listing destination, ticketing exports only with permissions | https://www.eventbrite.com/ and official developer access policies; availability of write APIs must be verified rather than assumed |
| Venue/performer websites and newsletters | Official event promo and co-marketing opportunities | Store organization-approved public links/requirements; no invented free placement or guaranteed reach |
| Local public media/event calendars | Local event listings and owned/earned promotion | Every outlet must be verified individually for city, submission policy, costs, eligible event category and update date |

External posting or paid spending never occurs without explicit user initiation and permission. For any campaign plan, SHOWTIME must make `official published rule`, `observed connected metrics`, `user assumption`, `scenario estimate` and `unavailable` visually distinct.

---

## 14. Technical Architecture and Domain Model (Technology-Agnostic Requirements)

The specification is independent of a coding assistant or language. A reference web technology family is suggested only to clarify capabilities, not to mandate vendor choices.

### 14.1 System boundaries

- **Interactive client:** responsive professional web UI, accessible forms, 3D scene editor, document export, offline-tolerant unsynced edit queue, localized display.
- **Domain API:** authenticated events, venues, rooms, talent, products/offers, scenarios, financial ledgers, tasks, integrations and collaboration; explicit tenant and role checks.
- **3D scene service:** editable scene graph, asset metadata, mesh/geometry loading, deterministic transforms, scene snapshot serialization and mesh validation.
- **Data acquisition layer:** independent provider adapters, scheduled refresh, source evidence, normalization, deduplication, terms/quota policies and review queues.
- **Calculation engine:** pure, versioned, deterministic services for capacity/geometry, budgets, taxes/FX, tickets, staffing assumptions and scenarios.
- **Async jobs:** source refresh, asset processing, PDF/3D export, large calculations, synchronization and notifications with idempotent execution.
- **Persistence:** transactional database, object/asset storage, audit log and search indexing; history/version records preserve reproducibility.
- **Integration gateway:** OAuth or provider keys held server side, scoped credential vault, webhook validation, retries/rate limits, permission revocation.
- **Administrative console:** data quality, correction queue, provider health, cache freshness, source rights and abuse monitoring.

### 14.2 Reference entities

`Organization`, `User`, `WorkspaceMembership`, `Role`, `Permission`, `Event`, `EventSession`, `EventScenario`, `Venue`, `VenueCampus`, `VenueSpace`, `VenueConfiguration`, `VenueSpecification`, `RoomGeometry`, `Scene`, `SceneVersion`, `SceneObject`, `AssetModel`, `Placement`, `RouteClearance`, `SeatSection`, `Seat`, `TicketTier`, `CapacityRule`, `TalentAct`, `Representation`, `BookingChannel`, `BookingInquiry`, `TalentEngagement`, `TechnicalRider`, `Product`, `ProductSpec`, `Supplier`, `PriceOffer`, `RentalTerms`, `ProcurementLine`, `Quote`, `Campaign`, `MarketingChannel`, `ChannelPolicy`, `CreativeAsset`, `CampaignMetric`, `TrackingLink`, `ServiceStation`, `GuestCohort`, `StaffShift`, `VendorAssignment`, `ScheduleBlock`, `Cue`, `BudgetLine`, `RevenueLine`, `FinancialScenario`, `Assumption`, `CalculatedResult`, `Approval`, `Attachment`, `SourceEvidence`, `ChangeImpact`, `AuditEvent`, `ConnectorAccount`, `Notification`.

### 14.3 Crucial domain relationships

- One venue has multiple independently addressable rooms and room configurations.
- One event has multiple sessions, room bookings, scene versions, campaigns and scenario versions.
- One product has stable specs, possibly multiple supplier offers and multiple placed 3D instances.
- One act can have changing public representation over time and multiple confirmed booking channels.
- A source evidence record binds to **one specific field assertion**, not merely to an entity as a whole.
- A modeled result records calculator version, scenario, inputs, evidence and exact calculation timestamp.
- `actual`, `verified published`, `private quote`, and `scenario assumption` are distinct types throughout the model; never collapse into a generic `price` field.

### 14.4 Key service interfaces (illustrative contracts)

- `venue.search(filters)`; `venue.get(spaceId, includeEvidence)`; `venue.getConfiguration(spaceId, configId)`.
- `scene.load(eventId, versionId)`; `scene.commit(changeSet, expectedVersion)`; `scene.measure(sceneVersion, objects)`; `scene.validateConstraints(sceneVersion)`.
- `catalog.search(criteria, region, atTime)`; `catalog.compareOffers(productId, rentalWindow)`; `catalog.getEvidence(offerId)`.
- `spotlight.search(criteria)`; `spotlight.getVerifiedBookingChannels(actId)`; `spotlight.reportCorrection(actId, claim)`.
- `campaign.getChannels(region, eventType)`; `campaign.evaluatePlan(planId, assumptions)`; `campaign.importObservedMetrics(authorizedAccount)`.
- `finance.compute(eventScenarioId)`; `finance.explain(calculatedResultId)`; `scenario.compare(leftId, rightId)`.
- `impact.preview(eventId, proposedChange)`; `impact.apply(changeId, approvalToken)`; `audit.history(entityId)`.

A client cannot alter a verified public source record through ordinary event editing. Public source updates and user/private scenario changes use separate commands and authorization.

### 14.5 Optional practical reference stack

A browser client using TypeScript + React, React Three Fiber/Three.js, a backend API, PostgreSQL/PostGIS, object storage, queues and a search index is plausible. The required behavior is **not tied** to this stack; equivalently capable implementations are valid. Adopt a 3D asset specification (glTF/GLB for delivery with authored source retained); ensure portable scene data and avoid hardcoding provider-specific business logic.

---

## 15. Functional Interaction Requirements

### 15.1 Global UX

- Clean, premium, utility-first, visually distinct brand; professional desktop workspace with useful tablet/browser read mode and mobile event review; do not force full precision scene editing on a tiny phone viewport.
- Persistent navigation, contextual inspectors, clear object selection, command palette, search and universal units controls.
- Unsaved, saving, saved, offline, conflicting and failed states displayed accurately.
- Autosave plus named snapshots, full undo/redo for appropriate scene operations, restore and version comparison.
- Inline validation with actual reason and linked source; never show generic green checks for incomplete verified requirements.
- User-preferred metric/imperial, CAD/USD/other currencies, locale/timezone and 12/24-hour display; stored amounts/times remain unambiguous.
- Accessible keyboard navigation and semantic components; high-contrast and reduced-motion modes; 3D controls have non-3D parameter-editing alternatives.

### 15.2 Venue studio UX

Primary canvas with 3D viewport, scene hierarchy, object/properties panel, asset/equipment picker, measurement/ruler overlay, warnings sidebar, source/evidence drawer, and finance delta preview. Selected catalog offers show original supplier pricing and link within context. Camera selector supports walk-through, perspective and precise orthographic views.

### 15.3 Data badges and claims

All user-facing facts should show `Verified`, `Published/dated`, `Source available`, `Assumption`, `Estimated`, `Missing`, `Stale`, `Conflicted` or `User-entered quote` as appropriate. Visual states should not rely on color alone; include textual explanations and timestamp where critical.

### 15.4 Common failure cases

- A source URL 404s: preserve prior evidence history, mark stale, do not display price as current.
- A vendor returns no price: show Request Quote; budget totals indicate missing figure.
- Two sources disagree about venue capacity: hold both and request authoritative confirmation; do not average.
- A talent booking agency changes: archive superseded contact, verify new route before exposing as current.
- Geometry import cannot establish scale: refuse `measured` state; require calibration/confirmed dimensions.
- A 3D model fails to load: allow numeric editing and visible proxy with fidelity warning.
- Connected ad service lacks API permission: show manual official link and no false connection state.
- Two editors change a scene: per-object or scene-version conflict handling, not silent last-write-wins.
- Provider rate limit: queue/retry within terms and show last successful refresh.
- Source media lacks usage rights: link to original rather than copy or redistribute.

---

## 16. Security, Privacy, Licensing and Compliance

- Tenant isolation, least-privilege roles (`owner`, `admin`, `producer`, `technical`, `marketing`, `hospitality`, `finance`, `viewer`, with custom restrictions), per-event sharing, expiring external review links and audit logs.
- Authenticated sessions with MFA options, encrypted transport and sensitive storage, secrets only server-side, secure backups, recovery drills, data export and account deletion processes.
- OAuth and API permissions explained before connecting; no automatic booking, purchase, ad spend, public posting or sending performer inquiries without explicit user action.
- Scraping/legal review: verify permissions and terms; do not evade technical restrictions or imply that publicly viewable text automatically grants unrestricted reuse.
- Privacy minimization: guest identities, accessibility accommodations, dietary requirements, private contracts and staff contacts only to necessary roles; defined retention periods and consent where required.
- Security hygiene: input validation, injection protection, file scanning, content security policy, signed uploads, webhook signature checks and abuse/rate limiting.
- Rights-aware 3D and image assets, attribution for permitted sources, correction/takedown process, trademark-safe representations and no misleading venue endorsement claims.
- Accessibility/legal safety guidance is advisory; organizers must obtain necessary professional inspections, venue permissions, permits and code reviews. Include warnings for jurisdictional variation.

---

## 17. Nonfunctional Requirements and Quality Targets

These are **desired engineering acceptance targets**, not measurements of an existing product.

| Area | Complete-product requirement |
|---|---|
| Reliability | No lost committed event/scene changes; idempotent background processing; visible sync/retry failures; recoverable versions |
| Performance | Smooth editor interaction for representative medium venue scenes on supported desktop hardware; defined performance budgets and LOD fallback for large layouts; load/performance tests across device classes |
| Scalability | Thousands of catalog/venue/talent records without client-side full scans; paged search and cached source queries; multi-tenant indexing |
| 3D precision | Configurable geometry tolerance and stored measured unit precision; regression checks on coordinate transforms, conversions and serialized scene replay |
| Financial exactness | Decimal-safe arithmetic; currency/tax/fee breakdowns; missing amounts never silently treated as zero; reproducible scenario calculations |
| Availability honesty | Provider unavailable/stale statuses and source times; no fabricated real-time booking, supplier inventory or campaign spend |
| Collaboration | Versioned updates and conflict handling; event-scoped permissions; audit trail for externally significant changes |
| Accessibility | WCAG 2.2 AA target for standard UI and equivalent numeric workflows for essential 3D actions, evaluated against applicable exceptions |
| Portability | Export structured event data and common document/scene formats where licensing permits; no proprietary-only data lock-in |
| Internationalization | IANA time zones, clear currency unit, locale formatting, date/time DST correctness, metric/imperial without altered base values |
| Observability | Structured audit and error logs, per-connector health, provenance freshness monitoring, privacy-safe operational metrics |
| Testability | Pure calculation units, deterministic scenarios, fixture-backed provider contract tests, 3D geometry edge cases, role/tenant access tests |

---

## 18. Complete-Product Acceptance Criteria

SHOWTIME as a full product should be judged by **functional outcomes** rather than screenshots, seeded mock records or number of pages.

**AC-01 Event integration:** A saved event can be opened in every module and all modules reference the same authoritative event identity, venue, session, date/time zone and current scenario.

**AC-02 Real venue evidence:** Each initial venue record has a real official source; each displayed capacity/dimension/rental statement exposes provenance and uncertainty. None is presented as live available or exact 3D without evidence.

**AC-03 3D physical space:** Users can create/load a 3D scene, place and manipulate dimensioned objects, measure clearances, navigate at eye level, save and reload transforms with preserved precision.

**AC-04 Technical design:** Stagecraft can generate stage plot, equipment BOM, input/patch information and documented constraint warnings from the live scene.

**AC-05 Actual product lookup:** Catalog presents an actual supplier listing with amount, currency, pricing basis, date and link—or explicitly says quote/unavailable. Replacing an item changes budget and physical dimensions when evidence allows.

**AC-06 Talent authenticity:** Spotlight profiles represent real acts and publicly sourced professional booking routes with traceable sources; no invented contacts, fees or availability statuses.

**AC-07 Real campaign channels:** Marketing channel pages link to actual platforms with current source-backed platform requirements; calculated forecasts are labeled estimates and never confused with connected observed performance.

**AC-08 Hospitality linkage:** Layout and guest changes influence service station placement, capacity constraints, staffing assumptions and planned cost.

**AC-09 Cross-module impact:** Expanding the stage visibly changes seating and ticket capacity, and appropriately revises the revenue model while respecting the authoritative venue capacity.

**AC-10 Finance completeness:** Unknown supplier, talent or venue costs render exact totals incomplete; errors are explanatory rather than hidden.

**AC-11 Scenario reproducibility:** An old scenario reproduces the same calculated result using its captured source/assumption versions even after a price refresh.

**AC-12 Source lifecycle:** A stale or disputed source is downgraded; contradictions are logged; correction and talent/venue verification workflows exist.

**AC-13 Privacy and authorization:** One organization's private event, guest details, quotes and ad account are not visible to another; sending, booking, buying or publishing is permission-gated.

**AC-14 Operational exports:** A producer can deliver venue plan, stage plot, run of show, procurement/source list, staffing checklist and transparent budget to third parties in useful formats.

**AC-15 Venue quality labeling:** A partial illustrative venue model cannot be mistaken for a measured venue digital twin or code-compliant certified plan.

**AC-16 App maturity:** No orphaned pages or mock-only interactive buttons; meaningful error/empty/loading states and functioning persisted actions across all primary systems.

---

## 19. Full-Product User Scenarios (Behavioral Expectations; Not a Development Schedule)

### Scenario A — 250-seat comedy night

Organizer browses Toronto venues by seating configuration and theater suitability. They view official venue sources, choose a specific space with the stated availability status (unknown unless officially connected), create a proposed event and 3D scene with source-backed room elements and an uncertainty indicator. They drag a podium, mic and speakers from catalogs into STAGECRAFT; any listed items carry current supplier offer links or `Request quote`. SPOTLIGHT finds a real comedian and official booking contact. Campaign suggests actual promotional channels without promising ticket sales. SERVICE places entrances, bar/merch station and staff. A larger stage layout removes 12 **proposed** seat placements, reducing modeled sellable inventory; the financial panel clearly explains why the forecast changed. Producer exports a show packet and list of matters to confirm with the venue.

### Scenario B — Corporate keynote and reception

Organizer chooses a venue with published ballroom/room capacities, constructs a dual-zone setup in 3D, places a screen and podium, adds two-stage presentation timeline, sets reception stations, guest flows and catering assumptions. The speaker's confirmed requirements influence Stagecraft only when available. The budget and call sheets remain linked, and unresolved rental quotes are clearly listed.

### Scenario C — Multi-act music show

Promoter builds lineup and soundcheck schedule, obtains real act booking contacts, compares a venue's provided backline to rental catalog products, validates connector/channel coverage, maps a stage and FOH placement and produces stage/input plots. A singer's new requirement causes a distinct change proposal requiring approval; it does not overwrite confirmed quote history.

### Scenario D — Source reliability under uncertainty

A supplier price disappears and an older venue webpage contradicts a newer room capacity. The system marks the offer stale, refuses to show a current price, prefers the current authoritative venue record where appropriate, exposes both capacity sources for review and prevents the user from treating an illustrative 3D model as a certified building plan.

---

## 20. Explicit Product Boundaries and Truthfulness Rules

- SHOWTIME is **not a game**. Simulation represents budget, capacity, configuration and operations, not a fictional economy.
- It is **not initially contingent on an external checkout**. A supplier source link and obtainable contact is sufficient; optional future transactional connections require terms and permissions.
- It is **not a real-time ticket availability or artist availability service** without contractual/authorized feeds.
- It does **not** require an artificial promise of automatically publishing ads or buying gear.
- It does **not** turn every venue webpage into a perfect 3D model automatically. Missing floor-plan data must be labeled and either obtained through proper channels or explicitly user-defined.
- It does **not** guarantee fire egress, venue code, structural rigging, acoustics, staffing sufficiency or sales outcomes. It supports professional preparation and informed verification.
- It is **not a prescribed development workflow** and does not specify milestones or a reduced V1 feature list. All described capabilities form the full target product.

---

## 21. Reference Sources and Research Notes (Checked 8 November 2026)

**Primary venue references:**

1. TO Live, *Meridian Hall 2026 Technical Specifications*: https://assets.ctfassets.net/nmxu5kj1b6ch/1OQF1d4Nka2SQo0R8xGac3/18d1a37334bcee6192f5b32db5561970/TechSpecs_MH_MeridianHall_2026-04.pdf
2. TO Live, *Meridian Arts Centre venue rooms/rentals*: https://www.tolive.com/Venue-Detail-Page/reference/Meridian-Arts-Centre
3. Harbourfront Centre, *Venue Rentals*: https://harbourfrontcentre.com/venue-rentals/
4. Symphony Space, *Peter Jay Sharp Theatre Rentals*: https://www.symphonyspace.org/rentals/rent-the-peter-jay-sharp-theatre
5. Symphony Space, *Leonard Nimoy Thalia Rentals*: https://www.symphonyspace.org/rentals/rent-the-leonard-nimoy-thalia
6. City Winery, *NYC Private Events*: https://citywinery.com/pages/new-york-city-private-events
7. The Ebell of Los Angeles, *Rental Information*: https://www.ebellofla.org/rental-information
8. The Ford, *About* / *Rentals*: https://www.theford.com/about-the-ford ; https://www.theford.com/about-the-ford/rent-the-ford
9. The Wallis, *Venues*: https://thewallis.org/wallis_venues

**Primary marketing / API references:**

10. Google Ads, *How much does Google Ads cost?* (September 2026): https://business.google.com/us/resources/articles/how-much-google-ads-cost/
11. Google Ads API, *Introduction*: https://developers.google.com/google-ads/api/docs/get-started/introduction
12. Google Ads API, *Access Levels and Permissible Use* (2026): https://developers.google.com/google-ads/api/docs/api-policy/access-levels
13. TikTok Ads Manager, *Budget and Bidding FAQ* (updated August 2026): https://ads.tiktok.com/resources/help/article/budget-and-bidding-faq
14. Ticketmaster Developer, *Discovery API*: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/

**Interpretive note:** These links substantiate the sample venue and platform facts, **not** a claim that SHOWTIME has integration credentials, venue permission to reproduce technical drawings/brand assets, real-time supplier inventory, or complete room measurements. Provider terms, downloadable plan rights and price policies must be confirmed before live ingestion. The cited capacity/rate statements are examples from public pages as retrieved, not certified quotes or guarantees.

---

## 22. Product Completion Definition

SHOWTIME fulfills the complete product vision when a professional organizer can select or document a real venue, construct and inspect a dimensionally grounded 3D event configuration, assemble a source-linked stage and equipment plan, discover legitimate talent booking channels, establish realistic hospitality and promotional plans, review a versioned and explainable financial model, coordinate the production team, and export the necessary event documents—all within **one coherent, reliable, data-authentic application**.

The key differentiator is not the count of modules. It is that **one real decision changes every relevant connected part of the event**, and the software shows whether each piece of information is confirmed, quoted, assumed or unknown.
