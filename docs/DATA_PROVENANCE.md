# Data provenance

Every fact SHOWTIME shows is either sourced, entered privately, assumed, or
unknown — and labelled as such.

## Seed venues (`src/data/venues.ts`)

Nine spaces, three per market, transcribed from the research notes in
`SHOWTIME_COMPLETE_PRODUCT_SPECIFICATION.md` §12 (notes dated 2026-11-08). Each
figure is a `SourceEvidence` row bound to one field with the official URL.

- **Status:** `third_party_unverified` ("Source available"). They have **not**
  been re-fetched or reviewed inside SHOWTIME. A user can open the source and
  record a review, which upgrades that field to `verified_authoritative` with
  their name and date.
- **Not invented:** where the notes give no figure (e.g. Meridian Hall capacity,
  most stage dimensions, all but one rental rate) the value is `null`.
- **Geometry:** published stage width/depth is imported for Symphony Space
  (both rooms) and The Wallis; stage height and every room shell are
  assumptions. No venue is a measured digital twin.
- **Harbourfront Studio Theatre:** the notes say older pages list a different
  capacity but do not give it, so no conflicting record was fabricated. Users
  can record a second source; disagreements are kept side by side and the venue
  is marked conflicted (lowest figure used, never averaged).
- **Usage:** link to original documents only; do not copy venue plans, riders
  or brand assets without permission.

## Marketing channels (`src/data/channels.ts`)

Five platforms with official URLs and dated rule statements from spec §13.
No platform cost is estimated. TikTok's minimum budgets are referenced but not
stored, because the figures change and were not in the notes.

## Catalog

The 21 built-in items are **generic proxies**: unbranded working dimensions
chosen by SHOWTIME (`dimsSource: generic_proxy`), with no price and no power
rating. Real products need a manufacturer spec URL for spec-sourced dimensions.
Offers need the supplier listing URL (unless marked a private quote) and the
date it was read. Offers older than 30 days, or past `validUntil`, stop being
shown as current prices. A blank price is "Request quote", never `$0`.

## Talent

SPOTLIGHT has no seed acts. Adding an act requires the official site, the page
that publishes the booking route, and the route itself (agency page, contact
form, business email or booking phone). Routes go stale after 90 days without
a re-check. Changing a route archives the old one in the act's history.

## Freshness windows

| Category | Days before "stale" |
|---|---|
| Supplier price | 30 |
| Talent booking route | 90 |
| Channel rule | 90 |
| Venue fact | 180 |
