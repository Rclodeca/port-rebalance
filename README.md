# Portfolio Rebalancer

Static page at **https://ryanclode.com/port-rebalance/** that turns each portfolio's
current rule state into whole-share buy/sell lists.

- **Targets and prices** come from `notify/state/portfolios.json` in
  [`letf-lab-standalone`](https://github.com/Rclodeca/letf-lab-standalone), written by the
  daily signals GitHub Action (portfolio definitions live in `notify/portfolios.py` there).
  Prices are the last run's close; any price can be overridden on the page for the visit.
- **Holdings and leftover cash** are stored only in this browser's `localStorage`
  (`port-rebalance:v1`), one set per portfolio. Plans are saved only when you press
  **Mark as done**; share counts and cash are editable at any time.

## Files

- `rebalance.js` — whole-share plan math (initial invest, add funds buy-only, full rebalance).
- `storage.js` — localStorage store; tolerant of missing/corrupt/blocked storage.
- `money.js` — amount parsing (`10k`, `$10,000`) and formatting.
- `app.js` — UI.

## Develop

```bash
npm test                      # node:test, no dependencies
python3 -m http.server 8765   # then open http://localhost:8765/
```
