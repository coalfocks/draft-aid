# Draft Projection Data

Generated from a logged-in Fantasy Football Analytics browser session on 2026-08-13.

## Files

- `ffa-2026-projections-full.csv`: full paginated projection table export from the FFA app.
- `ffa-2026-projections-full.json`: same export plus scrape metadata and per-position row counts.

## Counts

- QB: 37
- RB: 72
- WR: 73
- TE: 36
- K: 32
- DST: 32
- DL: 91
- LB: 62
- DB: 63

Total: 498 rows.

Some duplicate player/team rows are present in the FFA table response itself, especially for IDP. The export keeps raw rows intact rather than deduping or guessing which ECR value should win.
