# OpenJio decisions

Recorded: **30 October 2026**, Singapore time. Working branch: **`revamp/ideate`**.

This file consolidates the decisions from our project discussion and the existing team plan. The latest decisions below take precedence over earlier proposals. A decision to build something does not mean its live integration has been verified.

**How to read this record:** “Agreed” means an explicit choice in the discussion or a decision already marked as agreed in the team plan. “Implementation choice” identifies a technical or interaction detail chosen while carrying out that work. “Pending” identifies work or agreement that remains outstanding.

The original [ideation plan](IDEATION-PLAN.md), [design specification](DESIGN.md), and [implementation notes](superpowers/plans/2026-10-29-app-readiness-and-usability.md) remain supporting references. Some older status and design descriptions predate the changes recorded here; they should not be read as reversing these decisions.

## 1. Product and scope

### D01. Keep OpenJio a standalone revamp

**Agreed.** The product is called **OpenJio**, and the revamp is developed on `revamp/ideate`. It must not depend on another branch's application code, data, or hosted services. The checkout was brought to the requested `e009419` baseline before the subsequent improvements.

OpenJio helps Singapore friend groups turn acceptable free time into an outing they can agree on. Solo planning uses the same planner with one person's preferences. An open jio is a public hangout people can discover and join.

### D02. Concentrate on the outing-planning journey

**Existing team scope.** Retain the six areas in the [ideation plan](IDEATION-PLAN.md#3-scope):

| Area | User task |
| --- | --- |
| R1 Discover | Find places, events, deals, and open jios. |
| R2 Hangouts and voting | Invite people, join a group, vote on stops, and finalise a plan. |
| R3 Availability | Submit acceptable hours and choose a feasible group window. |
| R4 Itinerary builder | Generate or manually adjust an outing that fits. |
| R5 Outing companion | Follow scheduled stops and find where to join later. |
| R6 Content pipeline | Extract, review, correct, and publish sourced listings. |

Structured-event management, ticketing, QR check-in, scored waitlists, RSVP questionnaires, organiser dashboards, and floor-plan editing were removed from the revamp scope. Bookings, payments, budget guarantees, live location tracking, anonymous editing, and automatic background replanning remain outside the current first-release direction.

Future-weather support remains authorised. Google Calendar import was subsequently excluded from the project submission on 30 October 2026; availability uses the familiar When2meet-style manual grid to keep setup and the user flow simple.

### D03. Prioritise desktop while preserving mobile usability

**Agreed.** Desktop is the primary target. Phone and tablet layouts still need to work, including maps, dialogs, forms, navigation, and tours. This updates the earlier phone-first emphasis in the design specification.

Preserve the approved **Hawker Glow** identity: cream/charcoal surfaces, orange primary actions, teal, mango, and pink accents, with Nunito headings and DM Sans body text. Keep light, dark, and system themes. Refine the existing design rather than replace the application's visual identity.

Keyboard access, visible focus, readable contrast, touch-sized controls, and reduced-motion support apply throughout.

## 2. Database, accounts, and architecture

### D04. Use hosted Supabase in a new project

**Agreed explicitly.** Use **hosted Supabase** for shared accounts and persistent plans. Use a **new OpenJio project**, rather than reuse the existing Bookerz project or its schema/data.

The user will create the new project. `OpenJio` was the suggested project name and Singapore the recommended region. Local Supabase in Docker was recommended as a development option; it was not selected as the required production database or a mandatory team setup.

**Pending:** the new project's reference/configuration, hosted migration application, and live multi-account verification. Project-creation instructions do not constitute evidence that the hosted project is already connected.

### D05. Keep demo and shared-account modes explicit

**Implementation choice.** Retain the existing browser-based demo while preparing the shared backend. Select the runtime explicitly through `VITE_DATA_MODE` (`demo` or `supabase`); shared mode must not silently fall back to demo data when configuration or requests fail.

Demo persona selection is a preview mechanism, not real authentication. Real sign-up/sign-in uses Supabase Auth. Email-confirmation requirements must be shown honestly; an account awaiting confirmation must not be presented as a signed-in session.

Restore the hosted session before deciding whether the entry route should show the landing page or Home. Preserve the intended destination when sign-in starts from an invite or another protected page.

The preview currently remains in demo mode. The email-account UI is wired to the hosted adapter, but live provider verification remains pending.

### D06. Keep permissions and shared writes on the trusted backend

**Implementation choice.** Preserve Vue 3, Vue Router, Vite, JavaScript, Bootstrap, Leaflet, the Express API, and the Python ingestion worker. Share planning rules between the demo runtime and the trusted server engine.

Prepare relational Supabase persistence for profiles, membership, availability, preferences, itineraries, stops, votes, listings, and review records. Do not persist the entire application's mutable state as one shared JSON document. Scoped JSON snapshots may be used as a transport format around relational storage.

Verify real access tokens and enforce membership, host actions, and reviewer privileges on the server. Use revision checks and atomic writes to protect concurrent updates and capacity limits. Keep private planner inputs out of other members' browser responses.

Publishable client keys and server secrets have different roles. Service-role/secret keys, database passwords, and provider credentials must not enter browser bundles, source control, this document, or chat output.

The adapter and additive migration are prepared in the working tree. That is not a claim that the hosted schema is deployed or that all live security checks are complete. Express is the current server implementation; a future move to Edge Functions, Realtime, or scheduled jobs is not a new confirmed deployment decision.

## 3. Planning, availability, and collaboration

### D07. Availability means willingness to meet

**Agreed planning rule.** Users mark acceptable outing hours directly in the manual grid. This is the sole availability input for the project submission.

No response means **unknown**, not free. Required members are hard constraints. Use Singapore time and exact interval checks; the 30-minute display must round busy time outwards and free time inwards.

Show group overlap and who can attend proposed slots. Other members should not receive someone's individual availability intervals.

### D08. Rank useful complete windows, not only identical attendance segments

**Authorised corrective implementation.** Changes in optional attendance must not split and hide a longer feasible window for the required members. Consider the relevant intersections of contiguous availability and rank useful windows with deterministic ties.

A proposed visit must fit in the entire selected window. For private group itineraries, preference explanations and scores should reflect members available for the locked slot, rather than unavailable members' preferences.

Weights and duration preferences are implementation defaults to evaluate, not user-approved scientific constants. Do not claim the ranking finds a universally optimal slot.

### D09. Enforce itinerary feasibility before saving or finalising

**Agreed rule and corrective implementation.** Check opening hours, event windows, deal validity, full visit duration, travel, the outing end, and requested meal constraints. Permit a short wait for an opening or deal window when the complete visit still fits.

Unknown hours must not be assumed open. Missing weekday hours and an explicit closed-day value are different states. Listings explicitly marked as incomplete for routing may be browsed or shortlisted, but cannot become itinerary stops until the required visit details are known.

Beam search and the greedy baseline must use the same hard constraints, including a required meal. Keep manual planning and feasible alternatives alongside generation. Explain conflicts when no plan fits.

### D10. Use the actual departure time for every travel leg

**Implementation choice.** OneMap remains the routing/geocoding integration and map-tile source. Keep authentication and token refresh on the server. Label estimated travel honestly when live routing is unavailable; a failed route must not become a zero-minute trip.

Refine each leg using its actual departure time, including timing changes caused by previous legs. Preserve accepted live route timings with the plan so a reload does not replace a finalised schedule with fresh estimates or unexpectedly reopen voting.

**Implementation follow-up:** the current client cache distinguishes departure minutes, while the server cache still groups departures by hour. Their precision needs aligning/verification before treating the live-routing timing work as fully complete.

For late joining, route from the joiner's origin to each remaining candidate stop. Suggest a stop only when useful overlap remains. Locations describe the group's **scheduled** plan, not live tracking.

### D11. Remove departed-member contributions

**Agreed explicitly.** Leaving a hangout removes that member's availability, hangout preferences, and votes. Stale votes from nonmembers must not contribute to the displayed tally, including after someone leaves and later rejoins.

### D12. Preserve host-controlled finalisation and meaningful vote versions

**Existing rule, retained.** Members vote on stops; the host edits and finalises the itinerary. Votes are tied to the relevant stop version. Changes to a stop, its timing, the locked slot, or preceding stops must invalidate affected votes when their meaning changes.

Editing a finalised plan returns it to voting and makes the change visible. Ended/cancelled hangouts must not expose active planning mutations or late-join actions. No new automatic quorum, unanimous-approval rule, or automatic replacement of disliked stops was agreed.

### D13. Allow corrections without silently losing work

**Authorised implementation choice.** Hosts can correct supported details and cancel unfinished hangouts. Date changes must invalidate incompatible availability; location/time changes require the corresponding plan and voting revalidation. Closed plans remain protected from inappropriate edits.

Failed edits should preserve the user's input. Provide useful errors/retry actions, prevent duplicate pending submissions, and guard unsaved creation/profile edits when leaving the page. Only dismiss edit dialogs after a successful save.

## 4. Calendar, weather, and content

### D14. Use manual availability only for the project submission

**Agreed explicitly, 30 October 2026.** Exclude Google Calendar import to avoid extra setup and complexity. Keep the existing When2meet-style manual grid, including its editing, saving, and group-overlap behaviour. No Google OAuth client or calendar access is required.

This supersedes the earlier decision to develop and test Calendar import before obtaining OAuth credentials.

### D15. Select weather for the outing's date and time

**Agreed explicitly.** Future forecasts are supported within the published NEA coverage. Choose the applicable two-hour forecast, matching 24-hour period, or matching four-day outlook date based on the outing timestamp.

Show coverage, issuance/context, and unavailable/retry states. Do not show today's weather as the forecast for a future outing or fabricate a forecast beyond the published horizon.

### D16. Preserve uncertainty and require review before publication

**Agreed quality direction and authorised fixes.** Keep ingestion drafts separate from published Discover listings. Reviewers can correct coordinates, addresses, duration, opening hours, event times, recurrence, conditions, and exclusions.

Unknown values remain explicit; an area centroid or invented duration must not masquerade as a verified venue detail. Distinguish route-ready publication from manual-view-only publication. Conditions and exclusions need explicit review, rather than assuming an absent field means none.

Preserve source links and retrieval/verification information. Handle source identity and edited posts consistently; retirement/rejection/unpublishing must withdraw the corresponding publication. Resolve extraction years from the post's context rather than hardcoding a calendar year.

The current pilot uses the existing public Telegram/confirmgood ingestion and Gemini extraction. Broader source coverage, a login-only Telegram account, a scheduler, and provider fallbacks are not newly approved commitments. OSM remains a source direction in the older plan, not evidence of a completed live Overpass integration.

### D17. Make evidence and sample data honest

**Retained principle.** Label sample listings and approximate venue information. Adding a listing to a plan is not a booking. Conditional deals are not guaranteed savings, and indicative prices do not imply a budget cap.

Compare the algorithms against their stated baselines with the same feasibility checks. Document the limitations of hand-made cases and weights tuned on those cases. The hand-labelled extraction set is still outstanding; do not report measured extraction accuracy without it.

## 5. Home, Discover, and explanations

### D18. Keep Home's overall composition

**Agreed explicitly.** Home generally feels suitable and does not need a wholesale redesign now. Keep the solo and public-planning shortcuts, but make them clear secondary buttons: **Plan solo** and **Host an open jio**.

Remove the purple box/tape behind “What's happening?” and use a plain heading.

### D19. Make the map the main Discover experience

**Agreed explicitly, with the later refinement taking precedence.** Default to Map view. Provide an explicit Map/Cards toggle on desktop and mobile. The final toggle labels are simply **Map** and **Cards**; remove “Explore nearby” and “Compare ideas”.

In Map view, centre the map and give it the available content width. Remove the right-hand event-card list. Cards remain available through Cards view.

Support mouse-wheel zoom. Hovering a pin provides a quick preview of its name/location and useful listing facts; clicking or tapping opens the corresponding structured details popup. Preserve keyboard activation and focus handling.

Use richer listing details with visit facts, address, opening/event times, deal restrictions, sources, and the relevant plan/join action. Preserve the event-card design in Cards view.

### D20. Apply the same map behaviour to Open jios

**Agreed explicitly.** Discover and Open jios share the map-centred layout, simplified toggle, wheel zoom, pin preview, and click-to-details behaviour. Open-jio previews also show the outing time and available spots where known.

Retain the current public-hangout model: a host-selected fixed slot and capacity, signed-in joining, and no availability-collection step for that fixed slot. A waitlist or approval queue was not added.

### D21. Reduce filter clutter

**Agreed explicitly.** Put interest tags behind a togglable **Filters** control. Keep frequent controls such as search, area, time, and listing type readily accessible. Show selected filters/counts and provide reset/clear actions. Preserve relevant filter/view state in the URL.

### D22. Keep How it works, but make the first explanation visual

**Agreed direction.** Use visual availability, itinerary, and voting examples instead of leading with long technical prose. Keep the algorithm comparison and supporting detail available through an optional disclosure. Guided onboarding complements this page; it does not replace it.

### D23. Investigate theme dimming without claiming an unproven cause

**Authorised investigation and hardening.** Keep the selected theme and resolved light/dark appearance consistent across reloads, navigation, and system-theme changes.

The originally reported intermittent Home dimming was not conclusively reproduced in the controlled checks. Theme state handling was hardened and regression coverage added, but a specific root cause was not established. Intentional tour dimming must clear when the tour closes.

## 6. Guided tour

### D24. Anchor explanations to the highlighted section

**Agreed explicitly.** The explanation follows its highlighted target rather than sitting in the bottom-right corner. Dim the surrounding page while keeping the spotlight and explanation clear. Reposition appropriately for desktop/mobile layouts.

Support Back, Next, Close, Escape, keyboard focus containment, and restoration of normal page interaction. Do not leave a backdrop, inert page, or dimmed state behind after dismissal.

### D25. Keep the shortened cross-page tour

**Agreed explicitly.** The final tour has eight stops:

1. Home: where to create a jio.
2. Home: solo and public-planning shortcuts.
3. Discover: search and filters.
4. Discover: Map/Cards switching.
5. Discover: map pins and listing details.
6. Open jios: discovering and joining public hangouts.
7. How it works: the visual planning explanation.
8. Where to create a jio from the desktop header or mobile navigation.

Remove the former steps 9 and 10 inside the creation form. Completing or closing the active tour takes the signed-in user to **Discover**. First-use guidance is dismissible and can be replayed through **Quick tour**; existing users should not be forced through it on every reload.

## 7. Public landing page

### D26. Show a public introduction before account entry

**Agreed explicitly.** Signed-out visitors to `/` see the landing hero. Its headline is **“From ‘free this weekend?’ to ‘see you there.’”** The desktop map is the dominant visual; mobile stacks the copy above it.

**Get started** leads to sign-up/sign-in and then Home. **Explore the map** leads to public Discover without requiring an account. Already signed-in visitors to `/` see the existing Home page directly.

**Implementation choice:** keep `/` and the `home` route name for compatibility, with `EntryView` selecting the appropriate view. Do not automatically send a visitor away from the landing page before they choose an action.

### D27. Show one public header to signed-out visitors

**Agreed explicitly, 31 October 2026 (supersedes the earlier minimal landing header).** Every page a signed-out visitor sees, including the landing page, uses the same header: the OpenJio logo, the public pages **Discover**, **Open jios** and **How it works**, the theme control, and **Sign in**. Pages that need an account (Home, Create a jio, Profile) are not linked, so no link leads straight to a sign-in wall. On phones the links stay hidden as in the signed-in header; the landing hero's **Explore the map** and the footer's **How OpenJio works** remain.

Signed-in visitors keep the full application navigation.

### D28. Use a coherent Marina Bay example route

**Latest implementation choice under the requested route improvement.** Use:

**ArtScience Museum → Gardens by the Bay → Satay by the Bay**.

This gives the example a compact geographic theme and an activity/outdoors/food sequence. It replaces the previous National Gallery/Tiong Bahru Bakery/Clarke Quay example, which doubled back.

Use the existing geographic sample data and clearly label the example. The drawn line illustrates stop order; it is not a calculated walking/transit route, a generated validated itinerary, a booking, or live availability. Interacting with it must not create a real user plan.

### D29. Trace the route one checkpoint at a time

**Agreed explicitly.** At a checkpoint, animate its brief place card into view, allow time to read it, animate it away, then trace the path to the next stop. Keep the camera steady and leave the map usable afterwards.

**Current implementation choices:**

- Play a finite sequence once, with a moving point and a trace aligned to the map's projected coordinates.
- Allow **Pause**, **Resume**, and **Replay**; a paused checkpoint remains readable.
- Use approximately 2.8 seconds per checkpoint, including its 280 ms dismissal, and 1.2 seconds per leg: 10.8 seconds total. These timings are adjustable implementation defaults, not a fixed product requirement.
- Pause automatic progress when the map is offscreen or the tab is hidden. Manual hover/focus preview, selection, zoom, or dragging ends the automatic sequence so the visitor can explore.
- Show the completed static map for reduced-motion preferences. Automatic cards do not move keyboard focus; manually opened details do transfer and restore focus appropriately.
- Keep map attribution visible and retain manually accessible itinerary stops below the map.

## 8. Superseded choices

| Earlier approach | Current decision |
| --- | --- |
| Phone-first priority in the original design notes | Desktop-first, with full mobile support. |
| Map with a persistent right-hand card sidebar | Full-width map; cards are a separate view. |
| Map/Cards buttons with explanatory subtitles | Plain Map and Cards labels. |
| Tour explanation fixed at bottom-right | Explanation anchored beside its spotlight. |
| Tour highlighting without dimming | Dim surrounding content during the active tour. |
| Ten tour steps, including the creation form | Eight steps; explain where creation starts, then end on Discover. |
| Landing header with only logo, theme and Sign in | One signed-out header on every page: Discover, Open jios, How it works, theme and Sign in. |
| Backtracking landing example and a single overall reveal | Marina Bay route with sequential checkpoint cards and traced legs. |
| Only today's short-range weather | Forecast matched to the outing within the published horizon. |
| Reuse an existing shared database | New standalone hosted Supabase project. |

## 9. Working and verification decisions

Keep current changes reviewable on the feature branch. The earlier instruction to discard local changes applied to that synchronisation step; it is not continuing permission to discard subsequent implementation work. No new commit, push, merge, production deployment, or paid resource purchase was requested for these improvements.

Use meaningful regression tests for functional changes, Node tests for pure logic, Playwright for user journeys, a production build, and focused review/visual checks. Test claims describe the state actually checked; fixture tests are not live-provider verification.

The latest checkpoint follow-up recorded 82 passing client tests, 32 passing scoped desktop/mobile browser checks, and a passing production build. An earlier full browser run recorded 54 passing cases before that follow-up. These are dated implementation evidence, not a claim that every external integration is production-ready; see the [landing implementation record](superpowers/plans/2026-10-30-map-landing.md).

Local hosting/network troubleshooting is excluded from application requirements and documentation, as requested.

## 10. Still open or pending

| Item | What has not been decided or completed |
| --- | --- |
| Hosted Supabase rollout | New project details, final hosted migration/review, and live shared-account journeys. Bookerz must remain separate. |
| Live external services | Recheck the relevant OneMap, extraction, or login-only ingestion paths with their actual configured providers before claiming live readiness. |
| Content accuracy | Build the labelled extraction dataset and measure accuracy; do not substitute an LLM confidence score. |
| Product limits | The proposed eight-member cap and three-to-five-stop target are not newly confirmed team-wide limits. The seven-day availability range is implemented, but the original combined limits proposal was not explicitly ratified in this discussion. |
| Team ownership and delivery | Proposed owners, submission/freeze dates, and ownership of shared provider accounts still require team agreement. |
| Finalisation policy changes | Any new quorum, mandatory approval percentage, or waitlist requires a separate decision. |
| Deployment and scheduling | No production deployment target, ingestion schedule, broad source expansion, or move from Express to Edge Functions was selected here. |
| Documentation reconciliation | Older STATUS/DESIGN/IDEATION descriptions need updating where they describe superseded behaviour; this file records the later choices without marking every older proposal approved. |

When a decision changes, update its entry and the superseded table. Keep unresolved proposals labelled as proposals rather than silently converting them into team agreement.


## 11. Flexible manual planning (30 October 2026)

**Agreed explicitly.** Hosts can adjust recommended dates/times and preview attendance before locking. The required members must be available for the full interval; unknown replies remain distinct. Keep the manual availability editor. Show overlap in a large comparison dialog, with the proposed interval highlighted next to time controls.

**Agreed explicitly.** Add ordinary venues beyond Discover using **Geoapify Free**, not Google Places. Keep $0 as the project requirement: use a free account without payment details or automatic paid upgrades, a server-only key, a persisted cap of 1,000 uncached calls per UTC day, and 24-hour search / 6-hour details caching. Concurrent identical requests share one call. Account-wide usage from other keys/apps/deployments must also stay inside the free allowance. The file ledger assumes one active server process/data directory; it is not a distributed account-wide counter.

Custom places belong to their itinerary and never become public Discover listings. The host supplies visit duration and can enter checked opening hours for the outing day. Source opening-hours text alone does not count as verified planner hours. Missing provider data or an exhausted quota leaves manual entry and OneMap address lookup available. Show Geoapify and OpenStreetMap attribution.

**Agreed explicitly.** Reorder stop cards with visible drag handles and clear instructions. Support pointer/touch, edge scrolling, keyboard operation and a position selector. Remove Earlier/Later buttons. Retiming, voting reset, permission and final-plan reopening rules still apply. Regenerate retains its replacement behaviour.
