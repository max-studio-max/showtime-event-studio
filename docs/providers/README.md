# Live data providers

| Provider | Key | Used for | Doc |
|---|---|---|---|
| Ticketmaster Discovery v2 | Free, you register | Events (with published price ranges), venues, attractions | [ticketmaster.md](ticketmaster.md) |
| OpenStreetMap Overpass + Nominatim | None | Venues, service suppliers, geocoding | [openstreetmap.md](openstreetmap.md) |
| MusicBrainz | None | Performers, official homepage and booking links | [musicbrainz.md](musicbrainz.md) |
| Bank of Canada Valet | None | Exchange rates against CAD | [bank-of-canada.md](bank-of-canada.md) |

All providers are **off** by default; turn them on in *Team & Settings → Live data providers*. All traffic goes through the local gateway (`npm run gateway`).

## Considered and not used

| Source | Why not |
|---|---|
| Google Places API (New) | Requires a billing account; display and retention terms limit storage. Optional per spec. |
| Google Ads / Meta Marketing / TikTok APIs | Require OAuth plus an approved developer token or app review; not freely available. Campaign stays link-only with CSV import. |
| Supplier price feeds | No free, sanctioned feed exists for AV and staging rental prices. Scraping retailer sites is not permitted. Offers remain user-entered with source links. |
| Wikidata | Useful for official websites, but MusicBrainz already covers the same artists with booking relations; could be added later as a second homepage source. |
