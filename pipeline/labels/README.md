# Hand labels

`labels.json` is the answer key that `evaluate.py` scores drafts against.

## How to label

1. Run the pipeline so `out/raw_posts.json` exists (see `../README.md`).
2. Pick 30 to 50 posts from `out/raw_posts.json`. Mix deal and event posts.
3. For each post, read the `text` and write one entry in `labels.json`:

```json
{
  "rawPostId": "telegram:sgfooddeals:1234",
  "type": "deal",
  "merchant": "Example Cafe",
  "dateFrom": "2026-11-12",
  "dateTo": "2026-11-15",
  "timeWindows": [{ "start": "11:00", "end": "15:00" }],
  "outletName": "Example Cafe Orchard"
}
```

Rules:

- Write only what the post states. If the post does not say it, use `null`.
- Dates are `YYYY-MM-DD`. Times are 24-hour `HH:MM`.
- `type` is `deal`, `event` or `other`.
- `rawPostId` is the key of the post in `raw_posts.json`.

Then run `python evaluate.py` from the `pipeline/` folder.
