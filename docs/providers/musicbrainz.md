# Provider: MusicBrainz

| | |
|---|---|
| Used for | Performer search; official homepage and **booking** URL relationships |
| Endpoints | `GET /ws/2/artist?query=…&fmt=json`, `GET /ws/2/artist/{mbid}?inc=url-rels&fmt=json` on `musicbrainz.org` |
| Docs | https://musicbrainz.org/doc/MusicBrainz_API , rate limiting: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting |
| Licence | Core data CC0 (https://musicbrainz.org/doc/About/Data_License) |
| Auth | None; identifying User-Agent required (sent) |
| Spacing / budget | ≥ 1.1 s between calls (policy: 1/s), 2,000/day; 24 h gateway cache |

**What it can and cannot do:** coverage is strong for musicians and bands, weak for comedians, speakers and variety acts. URL relationships are community-edited. A `booking` relation is a **lead**: SHOWTIME pre-fills it into a directory draft as `provider_reported`, with the MusicBrainz page as the source, and the user must open the destination to confirm it. Ended relationships are ignored. Many artists have no booking relation at all; the UI then says to find one on the act's official site.

**Never derived:** fees, availability, private contacts, management emails.

**Failure modes:** 503/429 from MusicBrainz are retried with backoff; the circuit opens after repeated failures.
