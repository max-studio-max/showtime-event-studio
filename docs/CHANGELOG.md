# Changelog

## 0.2.0 — 2026-11-08

Live data, discovery and source verification (docs/SHOWTIME_LIVE_DATA_INTEGRATION_SPEC.md).

- Read-only integration gateway (`npm run gateway`) holding provider credentials server-side, with host allowlist, parameter validation, timeouts, retry/backoff/jitter, Retry-After, per-provider spacing and daily budgets, circuit breaker, request coalescing, TTL cache and redacted logs.
- Free providers: Ticketmaster Discovery v2 (key required), OpenStreetMap Overpass + Nominatim, MusicBrainz, Bank of Canada Valet. All off by default; toggles and live status in Settings.
- New Discover page: venues, comparable events (with published price ranges), performers and service suppliers; every state handled (disabled, gateway offline, not configured, rate-limited, paused, timeout, empty, partial); shortlist and compare tray.
- Venues saved from discovery appear in Venue Explorer as illustrative, provider-reported venues; review requires the official source URL. Unknown time zone/country never changes the event.
- MusicBrainz official homepage and booking links pre-fill Spotlight drafts; no booking route = cannot be saved.
- Service suppliers: proposed (no cost) → quote requested (total incomplete) → confirmed private quote (priced).
- Bank of Canada exchange rates on Finance FX rows; exact published string, integer inversion.
- Campaign CSV imports de-duplicate by date/campaign/ad keys.
- Workspace schema 2 with idempotent migration and automatic backup; removing a saved venue/supplier removes its provider evidence.
- Overpass outage fallback to Nominatim for venue search (exercised live during a real outage).
- `npm run build` now fails if a configured secret appears in the browser bundle.
- Tests: 88 (42 new contract, failure-mode, security, migration and integration tests on synthetic fixtures).

## 0.1.0 — 2026-11-08

First working build. Local-first web app; see `ARCHITECTURE.md` for what is and is not built.

- Shared event model and `deriveEvent` dependency graph connecting every module.
- Tested calculation engine (46 tests): geometry, seating solver, sightline screening, scene checks, decimal-safe money and FX, capacity and finance with incomplete-total semantics, break-even, provenance freshness and conflicts, lifecycle, reproducible scenarios, queues, staffing, campaign metrics.
- Venue Explorer with nine source-linked seed spaces, per-field evidence, review-at-source, contradicting-source recording, comparison, change-impact preview and booking state.
- 3D Studio (FIT + STAGECRAFT): orbit / orthographic plan / walk cameras, transform gizmo with snap, numeric inspector, seat blocks with clearance solver, stage presets, layers, multi-select align/distribute, measurement, snapshots, impact-vs-baseline panel, screenshot.
- Spotlight directory with source-required acts, lineup builder, overlap detection, inquiry tracking and private fees.
- Catalog of generic proxies plus user products and supplier offers with freshness, BOM with ownership tagging (no double counting), product replacement that updates the scene.
- Campaign planner on five real channels: planned/committed/invoiced spend, UTM builder, CSV metric import, observed metrics, explicit conversion models.
- Service cohorts, station queue model from placed stations, staff roster and cost.
- Finance ledger, tiers, assumptions, low/base/high results, explain trace, FX rates, immutable scenarios with reproduction check and comparison.
- Production schedule with dependencies, run of show, tasks, document links, and exports (plan/stage plot SVG, CSVs, JSON, printable show packet).
- Settings: units, locale, high contrast, reduced motion, re-approval rule, workspace export/import/reset.
