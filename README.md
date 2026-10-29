# OpenJio

Plans that work for the whole group. OpenJio finds when a Singapore friend group is free, then builds an outing that fits the time: places, events and deals that are actually open, with travel between them accounted for. Members vote on each stop, the host confirms, and anyone running late can find which stop to join.

Where the project stands right now: [docs/STATUS.md](docs/STATUS.md). Scope and decisions: [docs/IDEATION-PLAN.md](docs/IDEATION-PLAN.md).

## Run it

Needs Node 22 or later and pnpm.

```bash
pnpm --dir client install
pnpm --dir client dev
```

Open http://localhost:5173 and pick a demo person. Open a second browser tab and pick someone else to act as another member at the same time; both tabs share the same demo data.

The optional local API server adds live OneMap address search and transit routing, and serves pipeline drafts to the review page:

```bash
pnpm --dir server install
pnpm --dir server dev
```

Credentials are optional. Without them the app uses estimated travel times, sample listings and the manual availability grid. See [docs/SETUP-CREDENTIALS.md](docs/SETUP-CREDENTIALS.md) to add OneMap, Gemini, Telegram and Google Calendar keys to a root `.env` (copy `.env.example`).

## What to try

1. As **Mei**, open "Saturday catch-up". Jun has not replied, so he counts as unknown, not free. Lock the best slot, generate a plan, swap a stop, then confirm.
2. In another tab as **Farah**, vote on the stops. Votes appear in Mei's tab without a refresh.
3. On the "On the day" tab, enter where you are leaving from and when, and get the first stop you can still reach.
4. In Discover, filter by "Open jios" and join "Sunday Chinatown wander".
5. Plan something solo from Home with "Plan for me".
6. As Mei (a reviewer), open **Review listings** from the account menu to check and publish drafts from the content pipeline.
7. **How it works** shows the planning rules and a live comparison against simpler methods.

"Reset demo data" in the account menu restores the starting sample.

## Project layout

| Path | What it is |
|---|---|
| `client/` | Vue 3 + Vite + Bootstrap 5 app. Leaflet maps on OneMap tiles. |
| `client/src/lib/algo/` | Slot ranking, itinerary generation, deal validity, late-join reachability, Discover ranking, evaluation. Pure functions, unit tested. |
| `client/src/api/` | Data API. Demo mode stores data in the browser; the functions are async and enforce membership and host permissions so a Supabase adapter can replace them. |
| `server/` | Express 5 server: OneMap token refresh, search and routing with a route cache, and the drafts feed. |
| `pipeline/` | Python ingestion: public Telegram channel previews (Telethon for others), confirmgood.com; regex pre-parse and Gemini extraction into drafts for review. |
| `supabase/migrations/` | Postgres schema with row level security for the hosted version. |
| `docs/` | [STATUS.md](docs/STATUS.md) (current status), [IDEATION-PLAN.md](docs/IDEATION-PLAN.md) (scope and decisions), [SETUP-CREDENTIALS.md](docs/SETUP-CREDENTIALS.md), [EVALUATION.md](docs/EVALUATION.md). |

## Tests

```bash
pnpm --dir client test        # algorithm unit tests
pnpm --dir client e2e         # Playwright journeys (desktop and 375px mobile)
pnpm --dir client evaluate    # regenerate docs/EVALUATION.md
pnpm --dir server test        # server input and cache tests
```

## Content pipeline

```bash
python3 -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements.txt
pipeline/.venv/bin/python pipeline/run.py --limit 15
```

Drafts go to `pipeline/out/drafts.json`. Nothing reaches Discover until a reviewer publishes it. Unknown values stay blank rather than guessed. `pipeline/evaluate.py` measures extraction accuracy against a hand-labelled set in `pipeline/labels/`.

## Data sources and credits

- **OneMap**, Singapore Land Authority: map tiles, address search and public transport routing.
- **NEA two-hour weather forecast** via data.gov.sg.
- **Google Calendar API** free/busy (optional, on-demand import of busy times only).
- Public posts from the Telegram channels @sgfooddeals, @sgweekend, @sgconcerts, @dateideas and @sgstudentpromos, and articles from confirmgood.com. Listings link back to their source.
- **Sample data**: the places are real public venues with approximate hours; events and deals in the sample are made up and labelled as sample data in the app.

Libraries: Vue, Vue Router, Vite, Bootstrap, Leaflet, Express, Playwright, Requests, Beautiful Soup, Telethon. Fonts: Fraunces and DM Sans from Google Fonts.
