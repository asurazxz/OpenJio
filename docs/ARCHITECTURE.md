# Architecture

Updated 3 November 2026. Current product state and budget: [Project](PROJECT.md). Commands and configuration: [Development](DEVELOPMENT.md).

## Components and data flow

| Location | Responsibility |
|---|---|
| `client/src/views/`, `components/` | Vue pages, shared controls, maps and timeline |
| `client/src/api/index.js` | Defaults to local Supabase; explicit demo selection exists for historical tests |
| `client/src/api/engine.js` | Shared domain rules, validation, permissions, stage changes and planning |
| `client/src/api/demo.js`, `store.js` | Explicit demo/test engine wiring and browser persistence; inactive in shared mode |
| `client/src/api/hosted.js`, `hosted-adapter.js` | Supabase Auth, account state and Express operation transport |
| `client/src/lib/algo/` | Pure slot, itinerary, reachability, validity and Discover algorithms |
| `server/src/index.js` | Express HTTP boundary, providers, ingestion and trusted shared-mode API |
| `server/src/hosted.js`, `supabase.js`, `live-sync.js` | Auth verification, domain execution, normalized persistence and live-listing synchronization |
| `pipeline/` | Public-source fetching, regex/Gemini extraction and local output files |
| `supabase/migrations/` | Schema, RLS, server RPCs and additive integration changes |
| `docker/`, `compose.yaml`, `scripts/` | Images, proxies, bootstrap, migrations, import and smoke tools |

The historical browser-only fixture mode runs the domain engine in the browser. Tabs share localStorage app state and use sessionStorage for separate identities. It is explicitly selected only for legacy fixtures; shared app views use the independent revision signal and never load this store.

Shared mode uses Supabase Auth in the browser. Express verifies the access token against Auth, loads a scoped snapshot, executes the same engine, and commits normalized rows through service-role-only RPCs. The server retries revision conflicts; transaction checks protect permissions, membership and final-seat claims. Other sessions refresh through the existing 15-second polling/focus invalidation, not Supabase Realtime.

Docker exposes only the web service by default; this server binds it to 192.168.1.100:8081. Nginx serves the client, `/backend/` and `/api/` reach Express, and `/supabase/` reaches the private Auth/REST gateway. `/config.json` contains public connection information and the anon key only. Database passwords, signing keys and service-role keys stay out of frontend bundles.

The `demo` branch adds a separate database-backed demonstration using the same Auth/API transport, not browser persistence. `scripts/demo.mjs` fixes a different project/key file, `compose.demo.yaml` disables ingestion/provider credentials and mounts two demo-only migrations, and the bootstrap creates six stable identities. The fixture generator rebases all scenario dates to Singapore today + 14 days. The authenticated reset service invokes a service-role-only transactional RPC guarded by a private demo marker. The normal `main` installation has no demo schema/reset service. The demo web runtime adds a public `demoEnabled` flag to show its reset control. Eight normal migrations remain shared; demo-only SQL never runs on the live project.

## Domain model and permissions

Profiles/interests, hangouts/members/preferences, availability blocks, itineraries/stops, votes and shortlists are normalized PostgreSQL tables. Custom places belong to one itinerary, never the public catalogue. Listings carry stable provider/publication IDs, source provenance, route-readiness and explicit unknown fields. Some legacy review tables remain in the schema even though review operations and the reviewer UI were removed.

- Only members read private hangout details; invite previews expose a deliberately limited projection. Exact meeting points are member-only.
- Raw availability and preference inputs are not exposed to other members. The client receives its own inputs plus the permitted aggregates/DTOs.
- Hosts control timing, required people and finalization. Members vote on stop versions; changed stops invalidate stale votes. Leaving removes that person's contributions.
- Editing a final plan reopens voting. Unsaved edits and consequential changes use in-app confirmation; draft stop removal has an undo path.
- RLS is enabled on exposed tables. Browser roles cannot invoke raw snapshot/commit/live-sync RPCs or write planner tables directly. Service-role access stays on Express.

The eight migrations cover initial schema, trusted domain transport, custom places, profile privacy, meeting points, live-only synchronization, provider provenance and unknown locations. The old unused sample-catalogue insert was removed before the first real integration. Existing referenced samples are archived rather than deleting user plans. Migration hashes are now checked: do not edit an applied migration; add a new one.

## Algorithms

**Itinerary generation: constrained beam search.** Filter a nearby candidate pool (default 40), keep meal/activity balance, expand feasible next stops and retain the best 12 partial plans at each depth. Default plans have two to four stops. Opening/event/deal windows, travel, slot end, requested meals and no consecutive meal stops are hard checks. Unknown hours do not count as open. Beam search is bounded and heuristic; it does not guarantee a global optimum.

Plan score rewards group satisfaction, variety, source-checked deals, slot use and meals, and penalizes travel and waiting. Weights in `itinerary.js` are 0.60 satisfaction, 0.06 variety, 0.08 deals, 0.12 coverage, 0.12 meals, minus 0.35 travel and 0.25 waiting. Satisfaction blends 60% group average and 40% least-satisfied member. These weights are tunable product choices. Greedy generation is the comparison baseline.

**Availability:** merge free intervals, derive overlap windows that include required respondents, select useful sub-windows and rank them. Score: 60% attendance, 20% useful duration, 15% comfortable hours and 5% weekend preference. Non-responders remain unknown. Rescue suggestions are choices for the host; nothing is applied automatically.

**Discover:** rank by interests, distance, time fit and freshness, add a small timely-content boost, then diversify. The map caps its displayed pins across categories and clusters nearby markers; Cards pages results. Map position is not live group tracking.

**Late joining:** calculate travel to each remaining scheduled stop; meeting time is the later of the visitor's arrival and the group's scheduled arrival. Require at least 20 minutes together, then rank by earliest meeting and longer overlap. Use live routing when available and label estimates otherwise.

**Price and handoff:** only estimate spend when every stop has a readable price. Calendar/text exports use the confirmed schedule and do not imply a booking. Calendar timestamps are emitted in UTC; app scheduling uses Singapore time.

[Evaluation](EVALUATION.md) compares the planner with greedy and slot ranking with the earliest-common-slot baseline on synthetic fixtures. Gemini performs optional post extraction, not itinerary generation.

## Live providers and pipeline

- OneMap supplies tiles, geocoding and transit routing. Route-cache keys include the actual leg departure minute. Accepted route timings are retained with saved plans.
- Geoapify supplies search/details and an OSM venue catalogue. Catalogue selection requires usable names/hours near configured areas, ranks quality signals and limits results per category/area. Search, details and weekly catalogue refresh share the persisted daily allowance.
- NEA forecasts are chosen for the outing time using the published forecast horizon; no forecast is invented for distant dates.
- The Python pipeline merges posts by source/channel/message identity, re-extracts new/edited content and retains source URLs. Gemini is optional; regex remains available. The server locates outlets and automatically marks eligible unended posts for display. Final publication validation can still reject malformed fields.
- Extracted deals/events are view-only. They are not route-ready generated stops. Unlocated posts can appear in Cards with null coordinates and an explicit location gap.
- In shared mode, live records are synchronized into Supabase so itinerary references survive independent requests and restarts. No sample people or outings are inserted.

## Visual and interaction design

Current visual identity is **Hawker Glow**, defined by `client/src/styles/tokens.css` and `app.css`: warm cream/charcoal surfaces, orange primary actions, teal for free/Keep, pink for Swap and mango for recommendations. Light defaults include background `#FFF8F1`, primary `#FF6B35`, teal `#14B8A6`, mango `#F59E0B` and pink `#EC4899`. Nunito headings and DM Sans body text remain current choices; CSS is authoritative for exact tokens.

Preserve the supported desktop task hierarchy, visible keyboard focus, readable theme contrast, accessible dialogs, reduced-motion behavior and map attribution. Hangout navigation uses Time, Plan and On the day stages. Home supports previous/next seven-day windows, a Today reset and selectable dimmed past dates; ended non-cancelled outings remain available in past windows. Discover favors map exploration with a complementary Cards view. Landing animations and technical comparisons remain clearly labelled illustrations, separate from the live catalogue and database.

Keep honest distinctions between membership and attendance, arrival and meeting time, a shortlist suggestion and a scheduled stop, a retrieved source and verified availability. Do not present sample offers as real discounts or route illustrations as calculated routes.
