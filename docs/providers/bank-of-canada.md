# Provider: Bank of Canada Valet API

| | |
|---|---|
| Used for | Exchange rates in Finance ("Fetch Bank of Canada rate" on an FX row) |
| Endpoint | `GET /valet/observations/{FXxxxCAD}/json?recent=1` on `www.bankofcanada.ca` |
| Docs | https://www.bankofcanada.ca/valet/docs |
| Terms | https://www.bankofcanada.ca/terms/ — free use with attribution |
| Auth | None |
| Spacing / budget | ≥ 0.5 s, 500/day; 6 h gateway cache |

**Series:** USD, EUR, GBP, JPY, AUD, MXN against CAD. Rates are only offered when one side of the pair is CAD; other pairs are refused rather than cross-calculated.

**Precision:** the published decimal string is stored exactly. CAD→X is computed as 1 ÷ rate with integer arithmetic to 6 places and labelled "inverted". Each FX row records the series, observation date and source text, so scenarios stay reproducible.

**Limitation:** indicative business-day averages, not transaction rates. Weekends and holidays return the last published date.
