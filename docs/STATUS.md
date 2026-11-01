# Project status

Last updated: 2 Nov 2026. Branch: `revamp/ideate` (pushed to origin). Latest feature commit: `624d46f`.

This is the single place to check where OpenJio stands: what works, how it was checked, what is missing, and what to do next. Agreed decisions live in [decisions.md](./decisions.md) (they take precedence over older documents); original scope in [IDEATION-PLAN.md](./IDEATION-PLAN.md); visual design in [DESIGN.md](./DESIGN.md); algorithm results in [EVALUATION.md](./EVALUATION.md); credentials in [SETUP-CREDENTIALS.md](./SETUP-CREDENTIALS.md).

## 1. Summary

| | |
|---|---|
| Stage | All six areas (R1 to R6) built and refined; running in **demo mode** with live external data |
| Runs locally | Yes: `pnpm --dir client dev` and `pnpm --dir server dev` (the server supplies live data) |
| Hosted backend | Adapter, trusted server engine and four migrations written; exercised against a temporary local Postgres only. No hosted Supabase project is connected |
| Deployed app | No |
| Deadline | Final submission Week 12 Friday 9 am (course briefing); exact date to be confirmed by the team |

**Demo mode** keeps user data (people, hangouts, votes, availability) in the browser (localStorage), seeded with sample people and hangouts; each tab can sign in as a different demo person and tabs stay in sync. Discover content is live when the API server runs: OpenStreetMap places and auto-extracted Telegram/confirmgood listings, alongside the sample listings. Hosted mode (`VITE_DATA_MODE=supabase`) runs the same domain engine inside Express against Supabase.

## 2. Feature status

| Area | Status | What works | Gaps |
|---|---|---|---|
| R1 Discover | Built, live data | Map-first view with marker clustering (max 30 pins, spread across categories) and Cards (24 at a time, Show more); search, area, time and type filters with interest filters behind **Filters**; ranking by interest, distance, time fit and freshness with a small boost for deals, events and open jios; pin hover preview and detail dialog; live OpenStreetMap places (about 170, via Geoapify, weekly refresh) that the planner can use; auto-extracted deals and events labelled "Auto-extracted · not reviewed" with source links and explicit gaps ("Dates not stated", "Location not stated") | Sample listings still shown alongside live data; auto-extracted listings are view-only (cannot be added to plans) |
| R2 Hangouts, voting, open jios | Built | Create group, solo or open jio; invite links with safe preview; join, leave; required members; stage machine; versioned Keep/Swap votes; host edit, cancel (in-app confirmation), reorder, swap, remove, add; confirm with validation; edits after confirming reopen voting; open jios with capacity; sticky "N going" pill opens members and invite link | Guests (signed-out joining) excluded by design |
| R3 Availability | Built | Paintable 30-minute grid with presets, Undo and keyboard; reply strip ("3 of 4 replied"); ranked slots with required members and unknown non-responders; **Adjust time** with 12-hour selects and automatic attendance check; large overlap comparison dialog | Manual grid only (Google Calendar excluded, D14) |
| R4 Itinerary builder | Built | Beam search with hard checks (hours, event times, deal validity, travel, slot end, meals) and greedy baseline; works from live places alone; per-stop alternatives; manual build with drag-to-reorder (card follows the cursor; numbers stay fixed); custom stops via place search or a typed address (located automatically with OneMap); warning chips; floating Add a stop / Regenerate toolbar | Generation fails ("No plan fits yet") when live OneMap travel times push the last stop past the slot; the fix (re-run search with live times) is proposed, not built |
| R5 Outing companion | Built | Final timeline and map; late-join suggestion; NEA forecast chosen by outing time (2-hour, 24-hour or 4-day outlook); before confirmation the tab previews what unlocks | NEA only publishes about 4 days ahead, so the demo outings (6 to 15 Nov) show "no published forecast yet" |
| R6 Content pipeline | Built, scheduled | Telegram previews and confirmgood.com, Gemini extraction, composite source ids; server runs it every 2 hours (`INGEST_ENABLED`), geocodes outlets, and auto-publishes every deal or event that has not ended; Review page shows live/held status and lets a reviewer correct, publish, reject or unpublish | Hand-labelled accuracy set empty, so extraction accuracy is unmeasured; Telethon untested |
| Landing and navigation | Built | Public landing with map story, "How a jio comes together" animated demos, scroll reveals, "See how it works"; one signed-out header (Discover, Open jios, How it works, Sign in) on every public page; merged stepped tabs (Time, Plan, On the day) on the hangout page | — |
| Visual design (Hawker Glow) | Built | Tokens, light and dark, brand motifs, in-app confirmation dialog replacing every browser pop-up | Real photos not used (no licensed images) |

## 3. Integrations

| Integration | Code | Status | Notes |
|---|---|---|---|
| OneMap tiles | `client/src/components/MapView.vue` | Working | No key needed |
| OneMap search and routing | `server/src/onemap.js` | Working | `ONEMAP_EMAIL`/`ONEMAP_PASSWORD`; token refreshed server-side, one retry on 401; route cache keyed by departure minute, 5,000 entries, 30-day expiry |
| Geoapify (OpenStreetMap data) | `server/src/places.js`, `server/src/places-catalogue.js` | Working | Places catalogue (167 places on 2 Nov) and host place search; shared 1,000 calls/day ledger; catalogue refresh uses about 100 calls |
| NEA forecasts (data.gov.sg) | `client/src/lib/weather.js` | Working | Public, no key; horizon about 4 days |
| Gemini extraction | `pipeline/extract.py` | Working | `gemini-3.5-flash-lite`; paced about 4.5 s per call; only new or edited posts are extracted |
| Telegram previews (`t.me/s`) | `pipeline/sources.py` | Working | Five channels, 15 posts each per run |
| Telethon | `pipeline/sources.py` | Untested | Needs a dedicated account |
| Supabase | `supabase/migrations/`, `client/src/api/hosted*.js`, `server/src/hosted.js`, `server/src/supabase.js` | Written, local Postgres only | Four migrations (schema and RLS, trusted snapshot/commit RPCs, custom places, profile privacy). The profile-privacy migration has not been executed anywhere yet |
| Google Calendar | — | Removed (D14) | |

## 4. Verification

Latest full run (2 Nov 2026, before commit `624d46f`): server **79 passed, 1 optional Docker SQL test skipped**; client unit **115 passed**; Playwright **94 browser tests** across desktop (1280 px) and mobile (375 px), all passing after the meal-pool fix (the two group-journey failures in the first run were that bug). Production build passes.

Live checks the same day: an ingest run fetched 90 posts, produced 72 drafts and published 60 (26 with a map pin, 34 in Cards only; 12 ended posts withheld); the places catalogue built 167 places across 14 areas; plans generated from live places alone (no sample data) around Bugis, Tiong Bahru and Chinatown.

Earlier evidence (hosted migrations against local Postgres, Geoapify search caching, accessibility contrast checks) is recorded in the git history of this file and in [decisions.md](./decisions.md).

How to run: `pnpm --dir client test`, `pnpm --dir client e2e`, `pnpm --dir server test`, `pnpm --dir client build`. The e2e suite reuses a dev server on port 5173 if one is running.

## 5. Known issues and limits

1. **Live routing can break generated plans.** When OneMap travel times are longer than estimates, "Make me a plan" reports "No plan fits yet" instead of choosing other stops. Proposed fix: re-run the search with the fetched live times, up to about three passes.
2. **Demo mode only.** Sign-in is choosing a demo person; user data is per browser. Hosted Supabase is not connected.
3. **Sample data still mixed in.** Sample places, events and deals remain alongside live data, labelled "Sample data". Their dates are November to mid-December 2026.
4. **Auto-extracted listings are unreviewed.** Gemini mistakes (wrong dates, wrong outlet) can reach Discover; they are labelled and view-only, and a reviewer can reject them. 34 of 60 have no map location.
5. **Pipeline output is per machine.** `pipeline/out/` and `server/.cache/` are git-ignored; each teammate builds their own drafts and catalogue (needs their own keys and `pipeline/.venv`).
6. **Places need opening hours to be listed.** Only about a quarter of OpenStreetMap places have hours, so coverage favours well-maintained venues; visit lengths are defaults by category.
7. **Weights are tuned on the evaluation cases**, so the beam-versus-greedy comparison is optimistic.
8. **Weather** cannot show a forecast for outings more than about 4 days away.

## 6. Next steps

In rough priority order:

1. Fix plan generation under live travel times (known issue 1).
2. Decide whether to remove or reduce the sample data now that places, events and deals are live.
3. Label 30 to 50 posts in `pipeline/labels/labels.json` and run `pipeline/evaluate.py` to measure extraction accuracy.
4. Connect a hosted Supabase project, apply the four migrations, and run a multi-account journey; then deploy client and server.
5. Write the README disclosures the course requires (parts relying on AI, credentials for graders) and assign owners in the plan tracker.

## 7. Where things are

| Path | Contents |
|---|---|
| `client/src/views/` | Screens: entry/landing, sign in, home, new plan, hangout, join, Discover, profile, review, how it works, not found |
| `client/src/components/` | Header, bottom nav, availability grid, Time/Plan/On the day panels, timeline, map, dialogs (including `ConfirmHost`), cards; `brand/` motifs; `landing/` animated demos |
| `client/src/api/` | `engine.js` (all domain rules), demo store, hosted adapter |
| `client/src/lib/` | `algo/` (slots, itinerary, validity, reachability, discover, evaluate), travel, weather, review, confirm, time |
| `client/tests/`, `client/e2e/` | Unit tests, Playwright journeys |
| `server/src/` | Express app, OneMap, Geoapify search, places catalogue, ingest scheduler, hosted service, Supabase repository |
| `pipeline/` | Ingestion, extraction, evaluation, labels |
| `supabase/migrations/` | Database schema, RLS and trusted RPCs |
| `.claude/skills/` | Design skills used during the redesign |
