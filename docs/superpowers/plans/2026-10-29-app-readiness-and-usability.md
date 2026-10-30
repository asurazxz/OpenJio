# OpenJio Readiness and Usability Implementation Plan

> **For agentic workers:** Use the subagent-driven-development or executing-plans skill. Work through the independently testable tasks below. No commits, branch changes or cloud deployment are part of this plan.

**Goal:** Correct planning/data bugs, prepare hosted Supabase integration, and improve desktop-first Discover, onboarding and explanations while preserving mobile usability.

**Architecture:** Retain Vue 3, JavaScript, Bootstrap, Express and the existing theme. Keep deterministic planning functions separate from transport. Preserve the demo adapter while preparing authenticated Supabase integration; do not treat browser persona selection as authentication. Refine the existing visual direction rather than replace it.

**Tech Stack:** Vue, Vue Router, Bootstrap, Leaflet, Node/Express, Python ingestion, Supabase Postgres/Auth, Node tests and Playwright.

**Spec:** User instructions in the 29 October chat: hosted Supabase selected; fix assessment findings; prioritise desktop, preserve mobile; simplify filters; emphasise map/card switching; richer details; visual explanations and first-use guidance; reproduce/fix Home theme dimming. Exclude local hosting troubleshooting from product documentation.

## Global constraints

- Keep current branch and reviewable working changes; do not commit or deploy.
- No secrets in client code, documentation or output. Hosted credentials must come from approved configuration.
- Respect concurrent file ownership. One implementation subagent at a time; independent source review/research can run concurrently.
- Use regression tests for functional changes. Verify browser journeys and relevant unit suites; do not add tests for cosmetic substitutions alone.
- Keep local networking out of application/status documentation.

## Task 1: Correct planning and membership behavior

Files: `client/src/api/index.js`, `client/src/api/store.js`, `client/src/lib/algo/*`, `client/src/lib/travel.js`, and focused tests.

- [ ] Add failing regressions for availability subsets, fit-window duration/waiting, departed votes/preferences, terminal stages, vote invalidation and live-route leg selection.
- [ ] Enumerate feasible required-member subsets across overlapping availability segments with bounded work for eight members.
- [ ] Remove departed-member contributions and disregard stale/nonmember votes. Preserve honest host-controlled finalisation; do not invent a quorum decision.
- [ ] Correct duration/waiting, active-attendee preference scoring, route-to-each-stop and per-leg departure-time behavior.
- [ ] Align baseline hard checks and update evaluation evidence after behavior changes.
- [ ] Run focused suites and review the diff.

Interface: public async API exports remain stable; route fetch/cache may gain explicit per-leg helpers. Expose any intentional contract change before frontend integration.

## Task 2: Calendar, weather and content correctness

Files: `client/src/components/CalendarImport.vue`, `client/src/lib/weather.js`, `client/src/components/GoPanel.vue`, review/pipeline code and focused tests.

- [ ] Add fixtures for Calendar success, cancellation, calendar-level errors, malformed/partial responses and busy subtraction. Keep willingness-to-meet separate from calendar gaps.
- [ ] Extract import logic so it can be developed without an OAuth client; retain real OAuth as a separately verified boundary.
- [ ] Select NEA forecast by actual outing timestamp: two-hour coverage, 24-hour period or four-day date, then explicit unavailable state.
- [ ] Permit correction of opening hours, outlet coordinates, duration and deal validity in review; preserve unknown data honestly.
- [ ] Correct ingestion year handling, edited-post retirement and review/publishing handoff as applicable.
- [ ] Run fixtures and targeted tests; no paid extraction calls needed.

## Task 3: Discover interaction and detail layout

Files: `client/src/views/DiscoverView.vue`, `client/src/components/MapView.vue`, supporting focused components/styles, browser tests.

- [ ] Add failing browser regressions for map-pin-to-details and view switching at desktop/mobile widths.
- [ ] Keep search, area/time and listing type readily accessible; move interest tags behind an accessible Filters control with active-count and reset behavior.
- [ ] Default to a prominent map with nearby results; support explicit map-first/cards-first views on desktop and mobile, with URL state.
- [ ] Open an actionable detail sheet from pins and preserve map position during active-marker changes.
- [ ] Build a structured detail layout with key facts, time/outlet/conditions/source sections and clear plan actions.
- [ ] Verify labels, keyboard/focus, light/dark and responsive layout.

## Task 4: Home, explanations, onboarding and theme regression

Files: `HomeView.vue`, `HowView.vue`, `App.vue`, `AppHeader.vue`, theme/styles and a focused onboarding component/tests.

- [ ] Reproduce dimming by cycling all themes, reload and route navigation; inspect computed styles/backdrops before fixing.
- [ ] Keep Home's main composition, make solo/public entry points clear secondary actions, remove the purple heading tape.
- [ ] Replace default text-heavy explanations with visual availability/route/voting examples; retain benchmark detail in disclosure sections.
- [ ] Add a dismissible first-use walkthrough, persistent completion and replay. Guidance must highlight real controls without leaving dimming/backdrop state behind.
- [ ] Fix error/retry, terminal-stage controls and privacy text in touched components.
- [ ] Verify onboarding, theme persistence and keyboard behavior at 375/575/768/1280px.

## Task 5: Hosted Supabase preparation

Files: data adapter/configuration, additive migrations, integration tests and setup documentation.

- [ ] Inspect available connected projects without reusing an unrelated application's database.
- [ ] Prepare explicit demo/live selection, real authentication and shared persistence contracts.
- [ ] Provide atomic invite/capacity/membership and trusted aggregation operations that preserve private availability.
- [ ] Verify SQL locally where tooling permits; report unexecuted hosted checks honestly.
- [ ] Request any required final hosted provisioning approval against a concrete reviewed result, after independent work is complete.

## Task 6: Review and verification

- [ ] Run client/server/Python targeted suites and the necessary browser regressions.
- [ ] Perform independent review of functional and UI changes, fix material findings.
- [ ] Update status/setup/evaluation docs for actual app behavior and test evidence; exclude local hosting issues.
- [ ] Report database recommendation, ranking fix, departed-member cleanup, OAuth-free test coverage, forecast horizon, UI changes and remaining live-service requirements.

## Execution ledger

- Baseline: `e009419`, clean working tree; existing 24 client cases, 13 server cases and 16 browser journeys passed in the preceding assessment.
- Pre-flight: Task 1 supplies API contracts consumed by Tasks 2/3/4/5. Keep exports stable and sequence edits to `api/index.js`; frontend components can be developed independently. Task 2 owns Calendar/weather helpers and review fields; Task 4 owns Home/How/tour/theme; Task 3 owns Discover/Map. Task 5 must integrate after data contracts settle.
- Working in the existing feature checkout so the current preview reflects changes; no new branch/worktree is created.
