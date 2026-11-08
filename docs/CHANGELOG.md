# Changelog

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
