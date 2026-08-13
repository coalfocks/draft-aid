# Draft Ranking Data

Generated 2026-08-13.

## Files

- `fantasypros-2026-draft-rankings-standard.csv`: FantasyPros 2026 standard-scoring ECR rankings, 479 players.
- `fantasypros-2026-draft-rankings-half-ppr.csv`: FantasyPros 2026 half-PPR ECR rankings, 819 players.
- `fantasypros-2026-draft-rankings-ppr.csv`: FantasyPros 2026 PPR ECR rankings, 490 players.
- `ffa-2026-projections-visible-top10-by-position.csv`: unauthenticated Fantasy Football Analytics visible projection demo rows only.
- `ffa-ranking-plots/`: screenshots/readme from the visible FFA ranking plots.

## Source Notes

Fantasy Football Analytics exposes full max-player settings in the app UI, but the unauthenticated Shiny session only returned 10 table records and disabled the projection CSV download with "Subscribe to download". In that state, DataTables reported `recordsTotal = 10`, so there was no hidden page of projection rows to paginate through.

FantasyPros projection pages also expose only 10 visible rows per position without login/export access. Their rankings pages do expose larger public embedded ECR datasets, so those are exported here as the best available public draft-room ranking feed.
