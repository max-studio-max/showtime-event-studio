# SHOWTIME — Architecture

## Current shape (v0.1)

A local-first single-page web app. Everything runs in the browser; the
workspace is persisted to `localStorage`. There is no server yet.

| Layer | Location | Notes |
|---|---|---|
| Shared event model | `src/domain/types.ts` | One `ShowEvent` shape read and written by every module. `actual`, `published`, `private quote` and `assumption` are distinct fields/states, never one generic `price`. |
| Dependency graph | `src/domain/derive.ts` | `deriveEvent(event, workspace)` recomputes everything downstream from the one event: scene → seating → ticket inventory → revenue; lineup/BOM/roster/campaign → cost lines; guests → queues → staffing; and cross-module issues. Derived cost lines are never stored, so they cannot drift. |
| Calculation engine | `src/engine/*` | Pure, deterministic, unit-tested. Geometry (SAT footprints, seating solver, sightline screening), scene validation, money (integer minor units, banker's rounding, decimal-string FX), capacity/finance, provenance/freshness/conflicts, lifecycle, scenario hashing, queue/staff/campaign maths. |
| Seed data | `src/data/*` | 9 venue spaces + per-field evidence (spec §12), 5 marketing channels (spec §13), 21 generic layout proxies. |
| State | `src/state/store.ts` | zustand store; every event edit goes through `updateEvent` (undo/redo history, coalesced typing, audit row, approval-withdrawal rule). Autosave with a visible saved/saving/failed state. |
| 3D | `src/studio/Viewport.tsx`, `src/pages/Studio.tsx` | three.js via React Three Fiber. Orbit, orthographic plan and eye-level walk are cameras in the same scene. Instanced seats, transform gizmo with 0.25 m snap, numeric inspector for every transform. Lazy-loaded. |
| Exports | `src/domain/exports.ts` | Plan and stage plot SVG (top projection of the live scene), input list, equipment positions, procurement & sources, schedule, run of show, staffing, budget CSVs, event JSON, and a printable HTML show packet. |

### Conventions

- **World space:** metres; x = room width, z = depth (+z towards the audience/back of house), y = up; room centred on the origin. Stage at −z.
- **Money:** integer minor units in the line's own currency. Conversions only through a recorded `FxRate` (decimal string, source, as-of). A blank/invalid rate is "no rate", never zero.
- **Unknowns:** `null`, never `0`. A null price makes totals *incomplete*; break-even then reports *not computable*.
- **Fidelity:** `verified_dimensions` is unreachable for seed venues — the room shell is always user-proposed until someone measures it.

## Running

Requires Node 20 or newer.

```bash
npm install
npm run dev        # http://127.0.0.1:5240
npm test           # vitest: engine + integration
npm run typecheck
npm run build
```

OneDrive can lock `node_modules/.vite`; if the dev server fails with `EPERM … .vite\deps`, delete that folder.

## Not built yet (required by the spec)

These are real gaps, not hidden behind placeholder buttons:

- **Server, accounts and tenancy** — no domain API, authentication, MFA, roles enforcement, tenant isolation, expiring review links or real-time collaboration (spec §14.1, §16, AC-13). Roles are recorded for audit only.
- **Data acquisition layer** — no provider adapters, scheduled refresh, link-health checks or review queues; freshness is computed from the dates people enter.
- **Integrations** — no OAuth connectors (Google Ads, Meta, TikTok, Ticketmaster, Eventbrite, calendars). Everything is link-only; metrics arrive by CSV import.
- **Talent and product records** — SPOTLIGHT ships empty and CATALOG ships only generic proxies. Real acts, products and supplier prices must be researched and entered with sources (see `DATA_PROVENANCE.md`).
- **Geometry import** — no IFC/glTF/DXF/PDF import; rooms are built from measurements. No multi-floor/terrain modelling, no walls/doors as editable wall segments (doors/columns are markers).
- **Advanced technical design** — no signal-flow graph editor, lighting beam/patch universes, projector throw checks, cable routing, rigging loads or coverage plots.
- **Multi-currency display preference and 12/24-hour toggle** beyond native inputs.
- **Bundle size** — the Studio chunk (three.js) is ~925 kB minified; lazy-loaded, not yet split further.
