# SHOWTIME — The Event Production Studio

*Plan it. Design it. Produce it. Promote it.*

SHOWTIME is an event-production workspace: pick a real venue, lay out the room
and stage in 3D, source equipment and talent through traceable public routes,
plan promotion and hospitality, and see the financial consequences of every
decision — with every fact labelled as verified, published, quoted, assumed or
unknown.

Full product definition: [`docs/SHOWTIME_COMPLETE_PRODUCT_SPECIFICATION.md`](docs/SHOWTIME_COMPLETE_PRODUCT_SPECIFICATION.md).

## Status (v0.2.0)

A working **single-user, local-first** web app covering every module of the
spec on one shared event model — Home, Events, Venue Explorer, 3D Studio
(FIT + STAGECRAFT), Spotlight, Catalog, Campaign, Service, Finance &
Simulation, Production and Settings. Data is stored in your browser.

**v0.2 adds live data:** a Discover page backed by free public sources
(Ticketmaster Discovery, OpenStreetMap, MusicBrainz, Bank of Canada) through a
local read-only gateway. See [`docs/providers/`](docs/providers/README.md).

What it does **not** have yet: accounts, shared storage or collaboration,
ad-account connectors, real supplier price feeds, and several advanced
technical-design tools. The full list is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#not-built-yet-required-by-the-spec).
How the seed data was sourced, and what is unverified, is in
[`docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md).

## Run it

Node 20 or newer.

```bash
npm install
npm run dev:all    # gateway + app → http://127.0.0.1:5240
```

Live providers start switched off: enable them in *Team & Settings → Live data
providers*. For Ticketmaster, put a free key in `.env` as
`TICKETMASTER_API_KEY` (see `.env.example`).

## Checks

```bash
npm test           # 88 engine, integration and live-data tests
npm run typecheck
npm run build
```

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Data provenance](docs/DATA_PROVENANCE.md)
- [Security & privacy](docs/SECURITY_AND_PRIVACY.md)
- [Changelog](docs/CHANGELOG.md)

## Copyright and licence

Copyright © 2026 max-studio-max. **All rights reserved.**

This repository is public for viewing only. No licence is granted: you may not
copy, modify, distribute, sublicense or use this code or its documentation, in
whole or in part, without prior written permission from the owner. Viewing
or forking it on GitHub (as GitHub's Terms of Service allow) grants no
other rights. See [`LICENSE`](LICENSE).

Venue, platform and brand names belong to their owners; SHOWTIME links to
their official pages and implies no endorsement.
