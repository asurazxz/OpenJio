# OpenJio ingest pipeline

Collects public Singapore deal and event posts, extracts structured drafts, and
writes them to `out/drafts.json`. The API server can run it on a schedule
(`INGEST_ENABLED=true`) and then auto-publishes every deal or event that has not
ended, with missing details shown. There is no review step.

## Setup

Run from the project root. Optional keys go in the root `.env` (see `../.env.example`).

```
python3.13 -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements.txt
```

- `GEMINI_API_KEY` (optional): structured extraction. Without it, drafts come from regex hints only.
- `GEMINI_MODEL` (optional, default `gemini-3.5-flash-lite`). Calls are spaced about 4.5 seconds apart and retried with backoff on HTTP 429 to stay inside the free tier.
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION` (optional): read channels
  with no public preview. Create the session with `pipeline/.venv/bin/python pipeline/telegram_login.py`.

## Run

```
pipeline/.venv/bin/python pipeline/run.py --limit 15
pipeline/.venv/bin/python pipeline/run.py --channels sgfooddeals,dateideas --no-confirmgood
```

Steps: fetch, merge into `out/raw_posts.json`, extract only new or edited posts,
merge into `out/drafts.json` (a re-extracted edited post replaces its draft and is marked
`sourceEditedAt`), drop `other`
drafts, print a summary, and append a record to `out/ingest_runs.json`.

A failing source is reported and skipped. The run still finishes.

## Evaluate

Label 30 to 50 posts by hand (see `labels/README.md`), then:

```
pipeline/.venv/bin/python pipeline/evaluate.py
```

## Notes

- Unknown values are `null`. Nothing is guessed. A date with no year uses the current SGT year.
- Sources are polite: one request per second, a 15 second timeout, and a project User-Agent.
- `out/` is git-ignored.
- `out/drafts.json` is an object keyed by draft id; the server's `/api/ingest/drafts` serves it to the client, which builds the Discover listings from it.
- Last live run (2 Nov 2026): 90 posts, all extracted by Gemini, 72 drafts, 60 auto-published. See `../docs/STATUS.md`.
