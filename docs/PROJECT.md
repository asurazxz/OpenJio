# Project

Updated 3 November 2026. This is the current product record; implementation details live in [Architecture](ARCHITECTURE.md), operating instructions in [Development](DEVELOPMENT.md).

## Direction

OpenJio is a standalone Singapore outing planner, independent of its original academic context. The continuing budget requirement is **$0 in service/hosting charges**. There is no inherited deadline, rubric, required feature count, fixed team ownership or prescribed technology stack. Earlier exclusions such as calendar import are not permanent prohibitions; they describe what is currently absent.

Prefer a useful, trustworthy planning flow: coordinate time, choose places, agree on a plan and meet. The supported interface is desktop, including keyboard access; mobile evaluation is outside the current scope. These are current product choices, not academic constraints.

## Current state

| Area | Current implementation |
|---|---|
| Frontend data | Local Supabase is the default. Real email/password accounts; plans, votes and availability persist in PostgreSQL and are shared across devices. Old browser demo sessions are ignored. |
| Local shared backend | Docker Supabase PostgreSQL, Auth and PostgREST plus Express; eight migrations. Active in both the Docker web build and Vite development frontend. |
| Online database | Proposed managed Supabase switch was stopped. No OpenJio cloud database was configured. Previous connector visibility covered only the unrelated Bookerz organization; never reuse its database. |
| Public hosting | No public deployment was performed in this work. Local services are not automatically available to a public website. |
| Live source data | Venue catalogue and extracted posts are cached locally. Last checked on 2 November: 167 venues and 56 valid extracted listings (33 events, 23 deals). These are dated observations, not a guaranteed current count. |

On `main`, Discover reads live provider data and a fresh Supabase installation contains no accounts, outings or sample listings. Existing installations contain their users' own data; dated clean-install counts are not current account counts. Git does not include live exports or credentials, so a fresh clone reproduces the hosting, not a frozen copy of this machine's live records.

On `demo`, a separate `openjio-demo` Compose project has six real Auth accounts, five outings and 70 labelled sample listings. Its reset rebuilds shared demo state at today's Singapore date + 14 days, preserving login identities. This is independent of the older browser-only fixture mode. See the [demo branch guide](https://github.com/asurazxz/OpenJio/blob/demo/docs/DEMO.md). Never reset live data to switch branches or demonstrate the app.

Server state recorded 3 November: the demo on LAN port 8082 is running; the live project on 8081 is stopped at the user's request, with volumes intact. These are machine-specific operational observations, not instructions to start both stacks.

## Features that exist

- Discover map/cards with clustering, area/time/type/interest filters, personalized ranking, previews, source links and Open Jios.
- Private group jios, fixed-time solo plans and public Open Jios; invite links, membership, required people, capacity, editing and cancellation.
- Paintable availability grid, presets, undo, overlap comparison, ranked slots, manual time adjustment and host-selected rescue options when no common time works.
- Constrained itinerary generation, manual/custom stops, drag and keyboard reordering, swap previews, shortlist suggestions, versioned Keep/Swap votes and host confirmation.
- Confirmed itinerary/map, exact meeting point, copy/share text and plan link, calendar export, per-stop directions, late-join suggestions and outing-time weather.
- Live OSM venue catalogue, public Telegram/confirmgood ingestion, optional Gemini extraction, automatic publication of valid unended posts, explicit missing-data labels and source attribution. There is no manual content-review UI.
- Light/dark/system themes, navigation tour, unsaved-change guards, action toasts, focus handling and reduced-motion support.

Current code limits include a seven-day availability range, one-to-twelve-hour fixed slots, public capacity of two to eight, and a default generated target of two to four stops. They are adjustable implementation choices, not newly imposed product requirements. Required-member availability and itinerary feasibility remain enforced behavior until deliberately redesigned.

## $0 operating policy

- Use existing hardware or a genuinely free service plan. No paid server, domain, model tier, compute branch, automatic upgrade or usage-based fallback is authorized by this direction.
- Local Docker introduces no managed database subscription; hardware, electricity and internet are existing infrastructure, not a promise of cost-free physical resources.
- Geoapify Free currently offers 3,000 credits/day without a card. The app additionally caps uncached provider calls at 1,000/day per shared data directory. Calls and credits are not interchangeable; account-wide usage and endpoint credit costs still matter. Preserve caches and attribution. [Provider pricing](https://www.geoapify.com/pricing/).
- Gemini is optional. The configured model is `gemini-3.5-flash-lite`; its standard pricing currently includes a free tier. Enable it only on an account/project using that free tier, within its actual limits. Pacing is not a billing safeguard. Without a key, extraction uses regex. [Provider pricing](https://ai.google.dev/gemini-api/docs/pricing).
- Online Supabase is a possible future choice only within Free-plan allowances. The listed Free plan is $0 and may pause for inactivity; a Pro organization or additional paid compute does not satisfy this requirement. No online cutover is active. [Provider pricing](https://supabase.com/pricing).
- If a free quota is exhausted, pause, defer or use the existing manual/estimated alternative. Do not silently select a paid service. Free-tier terms were checked on 2 November 2026 and must be rechecked before enabling a new integration.

This documentation records the policy; it does not retrofit a global billing guard into the existing application. Existing private provider accounts must be checked separately.

## Known gaps and next work

Add an enforceable cost guard before enabling unattended paid-capable integrations; the current free-tier settings and quotas are not a global billing limit. The remaining roadmap is product work, not an academic checklist.

1. Improve generation when live OneMap times invalidate an estimated route: retry search using the fetched timings instead of returning no feasible plan. This remains a known limitation.
2. Local Docker Supabase was selected on 3 November. Keep the shared-account integration verified and unrelated/cloud databases separate.
3. Fix malformed extracted time windows. The latest run produced 70 drafts, marked 59 eligible, and displayed 56 after publication validation; three were excluded. Label representative posts and measure extraction accuracy rather than treating model confidence as accuracy.
4. Add account recovery and a suitable email flow before a public shared-account release. Local Docker currently auto-confirms signup; it is not a public authentication deployment recipe.
5. Keep historical demo regression tests separate from active shared-mode browser journeys. Run mutating checks on disposable databases only.
6. Consider versioned-plan change reviews and repeat-group invitations. They are ideas, not implemented commitments. Calendar integration and other features can be reconsidered if they fit the product and $0 budget.

Other limits: OSM coverage depends on known opening hours; visit lengths can be category defaults; weather typically covers only the coming few days; public posts can contain errors; no booking is made through OpenJio. Demo offers are not redeemable promotions.

## Verification record

The local Supabase integration work recorded 143 client checks, 80 backend checks (one optional SQL test skipped in the normal suite), five bootstrap/import checks and four separately run SQL checks. A clean source copy started without keys/caches, persistence survived stop/restart, changed migrations were rejected, and a failed migration rolled back. Real-account HTTP and desktop smoke checks also passed on isolated stacks, which were removed afterwards.

These are historical integration checkpoints, not a guarantee that every suite ran on every checkout. Re-run the commands in [Development](DEVELOPMENT.md#verification) for the current revision; the demo guide records its separate opt-in checks. [Evaluation](EVALUATION.md) is a separate generated synthetic comparison, not a user study or live-provider benchmark.
