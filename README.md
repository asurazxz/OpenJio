# OpenJio

Plans that work for the whole group. OpenJio finds when a Singapore friend group is free, then builds an outing that fits the time: places, events and deals that are actually open, with travel between them accounted for. Members vote on each stop, the host confirms, and anyone running late can find which stop to join.

Where the project stands right now: [docs/STATUS.md](docs/STATUS.md). Scope and decisions: [docs/IDEATION-PLAN.md](docs/IDEATION-PLAN.md).

## Run it

Needs Node 22 or later and pnpm. Run the client and the API server in two terminals:

```bash
pnpm --dir client install
pnpm --dir client dev
```

```bash
pnpm --dir server install
pnpm --dir server dev
```

Open http://localhost:5173. Signed out, you see the public landing page, Discover and How it works. Choose **Sign in** and pick a demo person; a second browser tab can sign in as someone else, and both tabs share the same demo data.

The API server is what makes the data live: OneMap address lookup and transit routing, "Find a place" search, the OpenStreetMap places catalogue, and the scheduled Telegram ingestion. Without it, or without credentials, the app still runs on sample listings and estimated travel times. Add keys to a root `.env` (copy `.env.example`); see [docs/SETUP-CREDENTIALS.md](docs/SETUP-CREDENTIALS.md).

## What to try

1. As **Mei**, open "Saturday catch-up". The Time tab shows who has replied (Jun has not, so he counts as unknown, not free). Lock the best time, or use **Adjust time** to pick another and see attendance update.
2. On the Plan tab, **Generate plan**, drag a stop card to reorder it, swap a stop (the sheet previews new timings), or **Add a stop** from Discover, a place search, or a typed address. Then **Close voting and confirm**.
3. In another tab as **Farah**, vote Keep or Swap on the stops; votes appear in Mei's tab without a refresh.
4. On **On the day**, enter where you are leaving from and when to get the first stop you can still reach.
5. In **Discover**, browse the map or cards: live OpenStreetMap places, auto-extracted Telegram deals and events (with a link to the original post), sample listings and open jios. Join "Sunday Chinatown wander" from **Open jios**.
6. As Mei (a reviewer), open **Review listings** from the account menu to correct, publish or reject extracted posts.
7. **How it works** shows the planning rules and a live comparison against simpler methods.

"Reset demo data" in the account menu restores the starting sample.

## Project layout

| Path | What it is |
|---|---|
| `client/` | Vue 3 + Vite + Bootstrap 5 app. Leaflet maps on OneMap tiles. |
| `client/src/lib/algo/` | Slot ranking, itinerary generation, deal validity, late-join reachability, Discover ranking, evaluation. Pure functions, unit tested. |
| `client/src/api/` | Data API. `engine.js` holds all domain rules and permissions; demo mode runs it in the browser with localStorage, hosted mode runs the same engine in the server against Supabase. |
| `server/` | Express 5 server: OneMap search and routing with a route cache, Geoapify place search, the OpenStreetMap places catalogue, scheduled pipeline runs with auto-publishing, and the trusted engine for hosted (Supabase) mode. |
| `pipeline/` | Python ingestion: public Telegram channel previews (Telethon for others), confirmgood.com; regex pre-parse and Gemini extraction into drafts for review. |
| `supabase/migrations/` | Postgres schema with row level security for the hosted version. |
| `docs/` | [STATUS.md](docs/STATUS.md) (current status), [decisions.md](docs/decisions.md) (agreed decisions, newest first in authority), [IDEATION-PLAN.md](docs/IDEATION-PLAN.md) (original scope), [DESIGN.md](docs/DESIGN.md) (Hawker Glow design spec and what was built), [SETUP-CREDENTIALS.md](docs/SETUP-CREDENTIALS.md), [EVALUATION.md](docs/EVALUATION.md). |

## Tests

```bash
pnpm --dir client test        # unit tests: algorithms, domain engine, review and publishing
pnpm --dir client e2e         # Playwright journeys (desktop and 375px mobile)
pnpm --dir client evaluate    # regenerate docs/EVALUATION.md
pnpm --dir server test        # server: inputs, caches, places catalogue, ingestion, hosted service
```

## Content pipeline

The pipeline reads recent public posts from Singapore Telegram channels and confirmgood.com, extracts deals and events with Gemini, and writes drafts to `pipeline/out/drafts.json` (local to each machine, not in git). Set it up once:

```bash
python -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements.txt
```

(`pipeline/.venv/Scripts/pip` on Windows.) With `INGEST_ENABLED=true` in `.env`, the API server runs it every 2 hours; `POST /api/ingest/run` starts a run and `/api/ingest/status` shows progress. Every extracted deal or event that has not ended is published to Discover automatically, labelled "Auto-extracted · not reviewed", with missing dates, times or location shown as such and a link to the original post. These listings are view-only; a reviewer's publish or reject replaces them. `pipeline/evaluate.py` measures extraction accuracy against a hand-labelled set in `pipeline/labels/` (still to be labelled).

## Data sources and credits

- **OneMap**, Singapore Land Authority: map tiles, address search and public transport routing.
- **Geoapify Free**, using **OpenStreetMap** data (© OpenStreetMap contributors): the Discover places catalogue (refreshed weekly) and place search for host-added stops. Results are cached; provider calls are capped at 1,000 per UTC day for one server process/data directory.
- **NEA weather forecasts** via data.gov.sg (2-hour, 24-hour and 4-day outlook, chosen by the outing's start time).
- Public posts from the Telegram channels @sgfooddeals, @sgweekend, @sgconcerts, @dateideas and @sgstudentpromos, and articles from confirmgood.com. Listings link back to their source.
- **Sample data**: the places are real public venues with approximate hours; events and deals in the sample are made up and labelled as sample data in the app.

Libraries: Vue, Vue Router, Vite, Bootstrap, Leaflet, Leaflet.markercluster, Express, Playwright, Requests, Beautiful Soup, Telethon. Fonts: Nunito and DM Sans from Google Fonts.
