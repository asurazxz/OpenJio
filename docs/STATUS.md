# Project status

Last updated: 29 Oct 2026. Branch: `revamp/ideate`.

This is the single place to check where OpenJio stands: what works, how it was checked, what is missing, and what to do next. Scope and decisions live in [IDEATION-PLAN.md](./IDEATION-PLAN.md); algorithm results in [EVALUATION.md](./EVALUATION.md); credentials in [SETUP-CREDENTIALS.md](./SETUP-CREDENTIALS.md).

## 1. Summary

| | |
|---|---|
| Stage | First build of all six areas (R1 to R6), running in **demo mode** |
| Runs locally | Yes: `pnpm --dir client dev`, optional `pnpm --dir server dev` |
| Hosted backend | Not yet. Supabase migration written but never applied; no project created |
| Deployed app | No |
| Committed | Yes, on `revamp/ideate` (local, not pushed) |
| Deadline | Unknown (open question 2 in the plan) |

**Demo mode** means all app data lives in the browser (localStorage), seeded with sample people, hangouts and listings. Each tab can sign in as a different demo person, and tabs stay in sync, so multi-person flows can be shown on one machine. The data API (`client/src/api/index.js`) is async and enforces membership and host permissions, so a Supabase adapter can replace it without changing the screens.

## 2. Feature status

| Area | Status | What works | Gaps |
|---|---|---|---|
| R1 Discover | Built | Ranked feed (interest, distance, fits-your-time, freshness, diversity pass); filters by type, interest, area, time or a hangout's slot; list and map; detail dialog with hours, deal validity, conditions and source; add to a hangout's shortlist | Scraped listings published from review have no opening hours, so they are never auto-scheduled |
| R2 Hangouts, voting, open jios | Built | Create group, solo or open jio; invite links with safe preview; join, leave, required members; stages collecting, voting, final, ended, cancelled; votes tied to stop versions; host swap, reorder, remove, add; confirm with validation; edits after confirming reopen voting with a banner; open jios with capacity | No editing of title, dates or area after creation; no guest (signed-out) joining by design |
| R3 Availability | Built | Paintable 30-minute grid (mouse drag, tap, keyboard, per-day quick fill); slot ranking with required members, unknown non-responders, conservative rounding, deterministic ties; aggregate heatmap only; Google Calendar free/busy import that subtracts clashes from marked hours | Calendar import untested (no OAuth client yet) |
| R4 Itinerary builder | Built | Beam search with hard checks (hours, event times, deal validity, travel, slot end, meal windows, no back-to-back meals); greedy baseline; plain-language reasons; per-stop alternatives that keep the plan feasible; manual build with fit check; diagnosis and one-click relaxations when nothing fits | Travel is estimated unless OneMap credentials are set; stops can sit up to about 6 km from the start area |
| R5 Outing companion | Built | Final timeline and map; late-join suggestion using travel time and minimum overlap, with clear no-match reasons; NEA two-hour forecast near the start area | Weather is the current forecast, not the outing date's; host timing updates deferred |
| R6 Content pipeline | Built | Fetches confirmgood.com JSON and five Telegram channel previews; regex pre-parse plus Gemini extraction; dedupe by composite source id; drafts kept separate from published; reviewer queue with edit, publish, reject and unpublish | Hand-labelled accuracy set is empty, so extraction accuracy is not measured; Telethon untested |
| How it works page | Built | Explains the rules and weights; runs the beam vs greedy and ranked vs earliest-slot comparison live in the browser | Weights were tuned on the same eight cases |

## 3. Integrations

| Integration | Code | Status | Notes |
|---|---|---|---|
| OneMap tiles | `client/src/components/MapView.vue` | Working | No key needed; warm tint, dark-mode variant |
| OneMap search and routing | `server/src/onemap.js` | Untested live | Needs `ONEMAP_EMAIL` and `ONEMAP_PASSWORD`. Without them the server returns 503 and the app uses labelled estimates |
| NEA forecast (data.gov.sg) | `client/src/lib/weather.js` | Working | Public, no key |
| Gemini extraction | `pipeline/extract.py` | Working | Key is set in `.env`. Model `gemini-3.5-flash-lite` (the older default was retired). Calls are paced and retried on 429 |
| Telegram previews (`t.me/s`) | `pipeline/sources.py` | Working | Occasional read timeouts on @dateideas, reported and skipped |
| Telethon | `pipeline/sources.py`, `pipeline/telegram_login.py` | Untested | Needs a dedicated account and session string |
| Google Calendar free/busy | `client/src/components/CalendarImport.vue` | Untested | Button only appears when `VITE_GOOGLE_CLIENT_ID` is set |
| Supabase | `supabase/migrations/20261029000000_init.sql` | Written, not applied | 17 tables, RLS on all, 35 policies, member-only heatmap function, version-bump trigger. Only checked structurally (no local Postgres or Docker daemon available) |

Credentials present in the local `.env` today: Gemini only.

## 4. Verification

| Check | Result | How to run |
|---|---|---|
| Algorithm unit tests | 24 of 24 pass | `pnpm --dir client test` |
| Server unit tests | 13 of 13 pass | `pnpm --dir server test` |
| Production build | Passes | `pnpm --dir client build` |
| End-to-end (Playwright) | 16 of 16 pass (8 desktop 1280 px, 8 mobile 375 px): group journey, invite and join across two tabs, open jio join and vote, privacy and evaluation page, overflow and console errors on every main route | `pnpm --dir client e2e` |
| Algorithm evaluation | Beam matches or beats greedy on score in all 6 feasible cases; never breaks a hard rule; greedy keeps the least happy member happier in 1 | `pnpm --dir client evaluate` |
| Pipeline live run | 88 posts fetched, 88 extracted by Gemini, 73 drafts written | `pipeline/.venv/bin/python pipeline/run.py --limit 15` |
| Manual browser check | Group journey (lock slot, generate, swap, confirm, late join), open jio join and vote, solo plan, review and publish, Discover, How it works | Desktop and 375 px, light and dark |
| Horizontal overflow at 375 px | None on any route after fixes | Checked by script in the browser |

## 5. Known issues and limits

1. **Not pushed.** The build is committed locally on `revamp/ideate` only.
2. **Demo mode only.** Sign-in is choosing a demo person. Data is per browser and resets with "Reset demo data".
3. **Sample data is approximate.** Real venues with hours, addresses and coordinates written from memory; events and deals are made up and labelled "Sample data". Spot-check before a demo relies on a specific venue.
4. **Sample dates age.** Seeded hangouts are in November 2026 and sample events run to mid December 2026. After that, events drop out of Discover and plans.
5. **Travel times are estimates** (distance with a detour factor) until OneMap credentials are added. They are labelled as estimates in the UI.
6. **Weights are tuned on the evaluation cases**, so the comparison favours the beam search more than an independent test set would.
7. **The alternatives dialog** takes about a second, because each option re-times the whole plan.
8. **Published scraped listings** have no opening hours, so they only enter plans by hand and show an "hours unknown" warning, which does not block confirming.
9. **Migration never executed.** It may contain SQL errors. Invite-link joins need a security definer join function that is not written yet (the migration only lets users join public hangouts directly).
10. **OneMap search token requirement** comes from the recommendation document and has not been checked against the live API.

## 6. Next steps

In rough priority order:

1. Push `revamp/ideate` when the team is ready to see it.
2. Add OneMap credentials and confirm live search and routing (`/api/health` shows `"onemap": "ok"`).
3. Label 30 to 50 posts in `pipeline/labels/labels.json` and run `pipeline/evaluate.py` to measure extraction accuracy.
4. Apply the migration to a local Postgres or a Supabase branch and fix any errors, add the invite-join function, run Supabase advisors, then write a live adapter for `client/src/api/` with real auth.
5. Create the Google OAuth client and test calendar import with test users.
6. Settle the open questions in the plan (deadline, ownership, limits) and assign owners in its tracker.
7. Deploy the client and server.

## 7. Where things are

| Path | Contents |
|---|---|
| `client/src/views/` | Screens: sign in, home, new plan, hangout, join, Discover, profile, review, how it works, not found |
| `client/src/components/` | Header, bottom nav, availability grid, time/plan/day-of panels, timeline, map, dialogs, cards |
| `client/src/lib/algo/` | `slots.js`, `itinerary.js`, `validity.js`, `reachability.js`, `discover.js`, `evaluate.js` |
| `client/src/api/` | Demo store and data API |
| `client/src/data/` | Sample listings, interests, areas and demo people |
| `client/tests/`, `client/e2e/` | Unit tests, Playwright journeys |
| `server/` | Express API for OneMap and drafts |
| `pipeline/` | Ingestion, extraction, evaluation, labels |
| `supabase/migrations/` | Database schema and RLS |
