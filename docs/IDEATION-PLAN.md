# Ideation and Implementation Plan: OpenJio

> Living document. Update the changelog whenever a decision changes.
> **Decided** = agreed with the team. **Proposed** = recommendation awaiting team agreement. **Open** = unresolved (see §13). Nothing here is assumed beyond what is marked.
>
> This branch is a standalone project. It does not depend on code, data or hosted services from any other branch.

## 0. Changelog

| Date | Change | Who |
|---|---|---|
| 26 Oct 2026 | Initial ideation doc on branch `revamp/ideate` | Huxley |
| 28 Oct 2026 | Product name set to **OpenJio** (decided); build order added | Huxley |
| 29 Oct 2026 | Made standalone (no reuse of other branches). Scope cut to the outing-planning journey: structured events, check-in and organiser ops removed (decided). Features regrouped as R1 to R6, with open jios added to R2. Added planning rules, data model, tier mapping, evaluation method, ingestion quality process, milestones and acceptance cases | Huxley |

---

## 1. Problem statement

**One-liner (course format):**
> Our app helps **Singapore friend groups** turn a common free slot into **an outing they can agree on**, by combining group preferences, local activities, outlet-specific deals and travel times into a feasible shared itinerary.

Solo planning uses the same builder with one person's preferences and chosen time. There is no separate solo product or onboarding journey.

The signature is a plan that works for the group: its stops fit the available time, its travel is accounted for, and its recommendations come with understandable reasons.

### Pain points

**People looking for something to do**
- Information is scattered across many sources (sites, Telegram channels, Instagram).
- Constant switching between calendar (free slots), maps (convenient location) and deal channels.
- Deals rarely make clear *which outlet* has the deal and *what days/times* it is valid.
- Searching manually by own interests.
- Indecision: "we're free to hang out but don't know where to go."
- Aligning everyone's availability is painful.

**People organising a hangout**
- No tool combines availability, interest-based planning, location and "I'll join later".
- Open invites ("anyone free Saturday?") get lost in group chats with no plan attached.

### Competitive gap

| Product | Does | Missing |
|---|---|---|
| When2meet / Rallly / Doodle | Common time slots | What to do, where, deals |
| Howbout | Calendar sync + voting into a plan | SG deals/events, routing |
| Wanderlog | Collaborative itineraries + map | Availability, deals, local events |
| Where2Meet | Fair meeting spot | Everything else |
| Burpple Beyond / Chope / Eatigo | Dining deals | Separate apps, no public API, not tied to plans |
| SG Telegram channels (@sgfooddeals, @sgweekend, @goodlobangsg...) | Great curation | Unstructured; no map/time filtering |

---

## 2. Personas

- **Group host**: creates a hangout, invites friends, picks the slot, builds and finalises the itinerary.
- **Group member / late joiner**: joins by invite, submits availability, votes on stops, finds where to join later.
- **Solo planner** (decided): plans for themself through the same builder.
- **Open-jio joiner**: finds a public hangout in Discover and joins it.
- **Content reviewer**: a team member who reviews and publishes ingested listings.

---

## 3. Scope

Course rule: a *feature* is one end-to-end task ("this app lets me ___"), not a screen. Tiers per *Project Q&A* (T1 show data, T2 merge/massage, T3 algorithm).

### 3.1 First release (R1 to R6)

| Area | End-to-end user task | First-release boundary | Tier | Non-trivial core |
|---|---|---|---|---|
| R1 Discover | Find an activity, place, deal or open jio and add it to a plan | List + map, interest/area/time filters, source and freshness shown | 2 | Merge three sources (open jios, events, deals) and rank by interest, distance and validity at the chosen time |
| R2 Hangouts, voting, open jios | Invite friends, agree on a draft; or join a public hangout | Signed-in members, private invite-based membership, per-stop votes, host finalisation, public open jios | 2 | Stage machine, version-bound votes, members-only access enforced by RLS |
| R3 Availability | Submit availability and choose a group slot | Manual grid first, ranked windows, required members, missing responses shown | 3 | Slot ranking with required members, conservative rounding, deterministic ties |
| R4 Itinerary builder | Generate, adjust and save a feasible outing | 3 to 5 stops, map + timeline, alternatives per stop, timing validation, solo reuse | 3 | Constrained generation compared against baselines (§6) |
| R5 Outing companion | Follow the final plan and work out where to join later | Scheduled (not live) stops, reachability-based join suggestion, weather if time permits | 2-3 | Route to each upcoming stop, keep stops where the joiner's arrival overlaps the group's stay, rank by overlap |
| R6 Content pipeline | Turn sourced material into trustworthy listings | Small ingestion pilot, review/correction UI, expiry handling, source links | 3 | Extraction measured against a labelled set; dedupe; validity resolution |

### 3.2 Open jios (part of R2)

An open jio is a hangout with `visibility = public`. The host sets a fixed slot and a capacity; anyone signed in can join from Discover. It skips the availability step (the slot is already locked) and goes straight to the itinerary and joining.

- Reuses the hangout, membership and itinerary tables. New work is roughly a `visibility` and `capacity` column and a Join action on Discover cards.
- No waitlist, no approval queue, no RSVP questions. Full means full.
- Gives Discover content that does not depend on R6 succeeding.

### 3.3 Proposed limits

Up to 8 members, a 7-day availability range, 3 to 5 activity/meal stops. These bound the search and the UI; they are product choices, not course requirements. (Proposed)

### 3.4 Removed or deferred

**Removed (decided 29 Oct):** structured-event creation, RSVP questions, scored waitlists, ticketing and QR check-in, fraud flags, organiser tasks/budget/announcements dashboards, floor-plan editing.

**Deferred from first release:**
- Anonymous guest editing, live location tracking, automatic background replanning.
- Broad coverage of many Telegram channels, arbitrary linked sites and multiple LLM-provider fallbacks.
- Budget optimisation, bookings, payments, in-app RSVP to external events.
- A fair-meeting-point optimiser. The host selects a start area instead.
- Published revision history with diffs, and host timing updates for late joiners.

Show indicative prices and conditions where known, but do not promise a budget cap. Adding an external event to a plan does not reserve a place; show its booking link and status explicitly.

**Expansion candidates after M2:** Google Calendar import, additional content sources, weather, fair meeting point.

---

## 4. User journeys

1. **Group hangout**
   1. Host creates a hangout with a date range, approximate start area and preferences.
   2. Friends sign in through the invite link and submit preferences and acceptable hours.
   3. The app ranks common windows and explains who can attend. The host locks one.
   4. The host generates a draft, or builds one manually from Discover.
   5. Members vote on each stop. The host can preview feasible alternatives.
   6. The host closes voting and finalises a validated itinerary.
   7. Members view the final timeline and routes. A late joiner enters a departure time and origin and gets a reachable upcoming stop.
2. **Solo**: "I'm free Sat afternoon near Bugis" → the same builder with one person's interests → edit and save.
3. **Open jio**: host creates a public hangout with a fixed slot and capacity → builds the itinerary → others find it in Discover and join → same companion view as journey 1.
4. **Discover → plan**: every listing card has *Add to itinerary*.

**Demo scenario (illustrative):** four friends choose a Saturday afternoon, compare activity and meal options, resolve one disliked stop, and help a friend join after work.

---

## 5. Planning rules

### 5.1 Availability and privacy
- Calendar free time is not willingness to meet. Ask for acceptable outing hours first; subtract calendar conflicts only if import is enabled.
- No response means unknown, not free. Required members must respond before a slot is shown as suitable for everyone required.
- Validate with exact intervals. When displaying 30-minute buckets, round busy time outwards and free time inwards so rounding cannot invent availability.
- Show the group aggregate availability and who can attend a proposed slot. Raw imported busy intervals stay private to their owner and the calculation.
- An invite link allows a controlled join flow; it does not expose plans or availability to anyone holding the URL.

### 5.2 Stages, editing and voting
- Hangout stages: `collecting` → `voting` → `final` → `ended` or `cancelled`. A locked slot is required before generation. (Open jios start at `voting` with the slot already locked.)
- The host edits the draft; members vote and suggest alternatives. No concurrent editing of one itinerary.
- Votes are stored against `(stop_id, stop_version)`. Editing a stop bumps its version, so earlier votes stop counting without extra logic.
- Show approve/disapprove totals and how many members have voted. A net-negative stop prompts host review; it is never silently replaced.
- A replacement stop is routed and validated before it is applied, since a popular alternative can still break the rest of the outing.
- After `final`, any host edit returns the hangout to `voting` and members see a "plan changed" banner.
- Changing the locked slot requires a new feasibility check and returns the hangout to `voting`.

### 5.3 Joining later
- Locations are labelled **scheduled**, not live.
- Evaluate upcoming stops with the joiner's travel time, not just the stop at their departure time. Suggest a stop only if predicted arrival leaves a useful overlap before the group leaves it.
- If no reachable stop remains, say so. Never send someone to the last venue after the outing has ended. Route failures never appear as zero-minute journeys.

---

## 6. Algorithms and evaluation

### 6.1 Primary: constrained itinerary generation (R4)

- **Candidate pool:** bounded. Open jios and external events open in the window, deals valid at that weekday/time and outlet, OSM places with known `opening_hours`. Pre-filter by distance from the start area.
- **Hard checks:** outing boundaries, stop duration, known opening/event windows, travel time between stops, explicitly supported user constraints. Unknown opening hours are never treated as always open. A meal stop is required only when the window spans a meal time and the user wants one.
- **Scoring:** normalise components (preference match, variety, verified deal benefit, travel cost) before combining. Balance the group's average satisfaction against the least-satisfied member's score. Document the chosen weights. Conditional promotions are not counted as guaranteed savings.
- **Search:** start with a greedy baseline. Use beam search only if it shows measurable improvement. Bound candidates, beam width and route requests.
- **Output:** 2 to 3 alternatives per stop for voting, plus an explanation such as "Fits your selected hours, matches three members' interests, and reduces travel compared with the alternative." If no feasible plan exists, name the conflicting constraint and offer a specific relaxation.

### 6.2 Supporting: group-slot ranking (R3)

Normalise each member's free intervals in `Asia/Singapore`. Enforce required members as hard constraints, then rank remaining windows by optional attendance, time-of-day preference and usable duration (not simply the longest). Return the top N with who is missing. Ties break deterministically. Implement as a pure, unit-tested function.

### 6.3 Other logic
- **Deal validity (R1, R4, R6):** recurrence (date range, days of week, time windows) → `isValidAt(outlet, start, duration)`, accounting for exclusions and visit length.
- **Discover ranking (R1):** weighted interest match, distance, recency, popularity and validity at the chosen time, with a diversity pass. Built fresh for this project.
- **Late-join reachability (R5):** see §5.3.

### 6.4 Evaluation

Compare against an **earliest-common-slot** baseline (R3) and a **greedy itinerary** baseline that picks the next feasible high-interest stop (R4), using the same inputs, constraints and candidate pool.

Record hard-constraint violations, travel minutes, average and minimum member interest satisfaction, runtime and external request count. Include cases where the proposed method does worse.

Curated test cases: conflicting preferences, partial attendance, missing data, impossible travel, a deal expiring mid-visit, no feasible itinerary.

More algorithm names do not make a stronger result. JSON extraction and lookups are not presented as the main contribution.

---

## 7. Content pipeline (R6)

### 7.1 Make content dependable before scaling

Start with a small set of manually verified, attributed listings plus one permitted automated source. Curated data supports early development but is labelled as curated, never passed off as a live scrape.

Before choosing a production worker or LLM provider:
1. Collect 30 to 50 representative source items, including messy posts, exclusions, multiple outlets and non-deal material.
2. Label the expected fields by hand and compare extraction output against them.
3. Measure outlet accuracy, date/time accuracy, duplicate rate and review workload.
4. Decide whether automation can publish directly or should only prepare drafts for review. Do not assume a review rate.

### 7.2 Data handling rules
- Extracted drafts are separate from published listings.
- Store provenance: source URL, retrieval time, verification time, explicit unknown values, and enough evidence to check a condition against its source.
- Model field-level uncertainty; the LLM's own confidence score is not a correctness guarantee.
- Source identity is composite, e.g. `(channel_id, message_id)` for Telegram. Edited posts and repeat deals update rather than duplicate.
- Unresolved outlet or validity blocks automatic selection as a verified deal.
- Expire or flag old listings and show when a refresh fails. Existing data may stay with its age visible but never silently becomes synthetic data.
- Credit all sources in the UI and README, and check source restrictions before collecting. Scraped data does not count toward the public-API requirement (FAQ 16).

### 7.3 Candidate sources (checked 26 Oct 2026)

| Source | Public web preview (`t.me/s/...`) | Notes |
|---|---|---|
| confirmgood.com | n/a | WordPress; `robots.txt` allows all; JSON at `/wp-json/wp/v2/posts`; categories include Deals, Food & Drinks, Exhibitions, Music, Date Ideas. **Most structured; no account needed. Try first.** |
| @confirmgood | Yes | Teasers + bit.ly links to the article above |
| @sgfooddeals | Yes | Semi-structured date/time fields; outlet often only in linked page (tco.sg) |
| @sgweekend | Yes | Date/place/time fields; events and workshops |
| @sgconcerts | Yes | Date/price/place fields; concerts |
| @dateideas, @sgstudentpromos, @sethlui | Yes | Deals and ideas |
| @sgwhereto | Yes (few posts) | Events |
| @goodlobangsg, @thesmartlocal | Disabled | Need Telethon (logged-in account) |
| @TimeOutSG | Yes | Last post Jun 2026; stale |
| Ticketmaster Discovery API | n/a | SG coverage unverified (Open) |
| Eventbrite | n/a | Public search API shut down in 2020; not usable |

### 7.4 Pipeline shape (pending the quality spike)

```
fetch (WordPress JSON / t.me/s preview / Telethon)
  -> raw_posts (source, channel_id, message_id, text, links, posted_at)
  -> resolve short links, fetch article if robots allow
  -> regex pre-parse labelled fields (date, time, place, price)
  -> LLM extraction (strict JSON schema)
  -> validate
  -> geocode outlets via OneMap
  -> draft deals / external_events
  -> review UI -> published
```

**Extraction schema**

```json
{
  "kind": "deal | event | other",
  "title": "", "merchant": "",
  "outlets": [{ "name": "", "address": "" }],
  "date_from": "YYYY-MM-DD", "date_to": "YYYY-MM-DD",
  "days_of_week": ["SUN"],
  "time_windows": [{ "start": "12:00", "end": "15:00" }],
  "exclusions": [],
  "conditions": ["min 2 pax", "dine-in only"],
  "price_text": "", "price_min": null,
  "category": "", "source_url": ""
}
```

Unknown values are `null`, not guessed.

### 7.5 LLM and hosting candidates

Do not commit to a model, quota, source count or hosting schedule until the spike verifies it.
- **LLM:** Gemini Flash / Flash-Lite (free tier, native JSON-schema output) as first candidate; Groq free plan as alternative. Use an OpenAI-compatible client with base URL from env.
- **Telethon (decided as the tool for login-only channels):** needs a dedicated, team-owned account (Open, §13). Automated user accounts can be rate-limited or banned, and logins from changing data-centre IPs are a common trigger. Run the spike from one machine with a stable IP, read-only and low frequency.
- **Scheduling:** decide after the spike. Options: a scheduled job on a stable host, a Supabase Edge Function + `pg_cron` for sources that need no login, or a manual run for demos.

---

## 8. External APIs

| API | Used for | Notes |
|---|---|---|
| OneMap (SLA) | Search/geocode, routing, map tiles | Search reportedly now requires token auth as well as routing; verify in M1. Token expires periodically, so refresh server-side. Prove expired-token and service-failure behaviour early. [Search docs](https://www.onemap.gov.sg/apidocs/search) |
| Google Calendar API `freeBusy` | Optional availability import (expansion, after M2) | Scope `calendar.freebusy`. Query only the planning window, store intervals only (no event details, no refresh tokens), let users refresh, disconnect and delete imported data. It is an on-demand import, not continuous sync. OAuth app in Testing mode needs each tester added by hand. [Scope docs](https://developers.google.com/workspace/calendar/api/auth) |
| NEA 2-hr forecast (data.gov.sg) | Weather on the companion view (if time permits) | |
| OSM Overpass (decided) | Non-deal food/activity places + `opening_hours` | Cache results; patchier SG data accepted |
| Gemini / Groq | Extraction | See §7.5 |
| Telegram (`t.me/s` preview, Telethon) | Deals and events | See §7 |

### Routing module (shared by R4 and R5)
One module owns OneMap authentication and token refresh, route caching keyed by `(from, to, mode, departure hour)`, and explicit failure results. Durations are labelled as estimates.

---

## 9. Tech stack

- **Frontend:** Vue 3 (Composition API) + Vue Router + Vite, JavaScript, Bootstrap 5 with a shared token stylesheet, Leaflet with OneMap tiles. (Decided)
- **Backend:** Supabase: Postgres, RLS, Auth, Realtime, Edge Functions, `pg_cron`. (Decided)
- **Server logic:** slot ranking, generation and routing run server-side so membership and permissions are enforced there. Whether that is a small Express server or Supabase Edge Functions is Open (§13).
- **Ingestion:** Python worker (Telethon where needed).
- **Tests:** Playwright e2e + Node unit tests for pure algorithm functions.

Everything is built fresh on this branch.

---

## 10. Data model (Supabase)

| Table | Key columns |
|---|---|
| `profiles` | id (auth user), display_name, home_area (optional) |
| `interests` | id, slug, label |
| `profile_interests` | profile_id, interest_id, weight |
| `hangouts` | id, host_id, title, mode (`group`/`solo`), visibility (`private`/`public`), capacity, invite_token, stage (`collecting`/`voting`/`final`/`ended`/`cancelled`), date_from, date_to, start_area_lat, start_area_lng, locked_slot_start, locked_slot_end |
| `hangout_members` | hangout_id, user_id, role (`host`/`member`), required, responded_at |
| `hangout_preferences` | hangout_id, user_id, interest_id, weight |
| `availability_blocks` | hangout_id, user_id, start_at, end_at, source (`grid`/`gcal`). Free intervals only; calendar busy time is converted at import |
| `itineraries` | id, hangout_id, generated_by (`auto`/`manual`), explanation |
| `itinerary_stops` | id, itinerary_id, seq, version, kind (`activity`/`meal`), ref_type (`hangout`/`external_event`/`deal`/`place`), ref_id, start_at, end_at, lat, lng, travel_mins_from_prev |
| `stop_alternatives` | stop_id, ref_type, ref_id, score, reason |
| `stop_votes` | stop_id, stop_version, user_id, value. Unique on (stop_id, user_id) |
| `deals` | id, raw_post_id, merchant, title, conditions, exclusions, date_from, date_to, days_of_week, time_windows (json), price_text, source_url, retrieved_at, verified_at, status (`draft`/`published`/`expired`) |
| `deal_outlets` | deal_id, name, address, lat, lng |
| `external_events` | id, raw_post_id, title, starts_at, ends_at, venue, lat, lng, price_text, category, source_url, booking_url, retrieved_at, verified_at, status |
| `places` | osm_id, name, kind, lat, lng, opening_hours (cache) |
| `raw_posts` | id, source, channel_id, message_id, text, links, posted_at, edited_at. Unique on (source, channel_id, message_id) |
| `ingest_runs`, `extraction_labels` | ingestion bookkeeping and the hand-labelled evaluation set |
| `route_cache` | from_lat, from_lng, to_lat, to_lng, mode, departure_hour, duration_mins, fetched_at |

RLS: hangout data visible to members only; public hangouts readable by all signed-in users; only the host changes stage and itinerary; only reviewers publish listings. Write as one initial migration.

---

## 11. Course-requirement mapping

| Requirement | How we meet it |
|---|---|
| HTML/CSS/JS, Vue, Bootstrap | Stack (§9) |
| Responsive | Core screens at 375, 575, 768 and 1280px |
| Backend data store | Supabase |
| At least 1 public API via async HTTP | OneMap, NEA, Google Calendar |
| E2E testing | Playwright journeys: hangout → slot → itinerary → vote → late join; solo plan; open jio join; deal validity |
| X-factor algorithm | Constrained itinerary generation and slot ranking, with baseline comparison (§6) |
| Login is not a feature | Treated as plumbing; not demoed |
| README disclosures | Scraped sources credited (FAQ 16); other required disclosures handled by the team |

---

## 12. Team and delivery

### 12.1 Ownership (Proposed, not assigned)

Each owner delivers the interface, data behaviour, failure states and tests for a complete task.

| Owner | Primary area | Main integration partner |
|---|---|---|
| Aishani | R1 Discover and preference-aware candidate selection | Vivienne (candidates into itineraries) |
| Gregory | R2 Hangouts, invitations, voting, finalisation, open jios | Huxley (required members, slot changes) |
| Huxley | R3 Availability, slot ranking, optional calendar import | Gregory (membership); Vivienne (locked slot) |
| Vivienne | R4 Candidate filtering, generation, baselines, map/timeline | Aishani (candidates); Denzel (routing) |
| Denzel | R5 Companion and late join; shared routing module (§8) | Vivienne (stops and travel data) |
| Timothy | R6 Ingestion, review/correction, publication | Aishani (published listings) |

Infrastructure (Supabase project, auth, migrations, deploy) is shared explicitly so R6 does not become ingestion plus every backend task.

To keep R4 off a single critical path, agree a shared fixture in M1: 20 to 30 candidates plus precomputed travel times as JSON. R4 can then be built and evaluated without waiting on live routing, and routing can be tested on its own.

Agree shared contracts early for candidate validity, membership, availability, itinerary versions and route results.

### 12.2 Milestones and acceptance gates

The remaining deadline is unconfirmed, so use gates rather than dates. Once known, protect roughly the final quarter for integration, verification, documentation and the demo.

| Milestone | Work | Evidence required before moving on |
|---|---|---|
| M0 Agree scope | Confirm R1 to R6, limits, owners and acceptance cases | Team confirms what ships and what is deferred |
| M1 Prove feasibility | Scaffold, Supabase project, auth, initial migration, seed data, shared fixture; authenticated OneMap routing; manual availability + slot ranking; greedy generator; source-quality spike | One real-data outing fits its slot and travel constraints; extraction quality measured |
| M2 Complete the shared journey | Membership and invites, persistence, Discover, draft editing, votes, finalisation, open jios | Two users in separate sessions complete the journey without developer help |
| M3 Usable on the day | Late joining, content review/expiry, failure recovery, "plan changed" flow | An unreachable join suggestion is rejected; failed edits/imports preserve existing work |
| M4 Verify and present | Algorithm comparison, browser checks, README, credits, video | Reproducible results, deployed app, rehearsed demo |

Add Google Calendar or more sources only after M2. Test continuously; M4 consolidates evidence rather than starting verification. If M1 fails, simplify data coverage or generation before building more screens. If M2 is late, freeze integrations and finish the manual-input path.

### 12.3 First-release acceptance cases
- A group can create, join, submit availability, choose a slot, generate/edit, vote and see the same final plan after reload.
- Unknown availability, no common slot and no feasible plan each have a useful recovery path.
- Only members access private hangout data; only the host changes stage or publishes changes.
- Overlapping stops, impossible journeys and invalid verified-deal windows cannot pass final validation. Unknown costs and opening hours are shown honestly.
- An edit after finalisation returns the plan to voting and members are told.
- A late joiner gets a reachable scheduled stop or a clear no-match result.
- Source and API failures preserve work and offer retry.
- Core screens work at 375, 575, 768 and 1280px with labels, keyboard access, visible focus, readable errors and no unexplained console errors.
- The team can explain its algorithm, comparison results and known limitations.

### 12.4 Tracker

| Item | Owner | Branch | Status | Notes |
|---|---|---|---|---|
| Foundation (scaffold, Supabase, auth, migration, seed) | Open | | Not started | M1 |
| R1 Discover | Open | | Not started | |
| R2 Hangouts, voting, open jios | Open | | Not started | |
| R3 Availability | Open | | Not started | |
| R4 Itinerary builder | Open | | Not started | Critical path |
| R5 Companion + routing module | Open | | Not started | |
| R6 Content pipeline | Open | | Not started | Quality spike in M1 |
| UI system / consistency | Open | | Not started | |

---

## 13. Open questions

1. Can the team agree to the R1 to R6 boundaries, limits and proposed ownership?
2. What is the actual submission date and integration freeze date?
3. Who owns the Telegram account (Telethon) and the Google Cloud OAuth project?
4. Server logic: small Express server or Supabase Edge Functions?
5. Is signed-in membership with host-controlled publication acceptable for the first release (no guests)?
6. Open jios: is a hard capacity with no waitlist enough?
7. Who owns the source-quality spike and the routing spike in M1?
8. Which expansion, if any, comes after M2 (Google Calendar, more sources, weather, fair meeting point)?
9. Ticketmaster SG: worth a 30-minute spike?

Resolved: product name (OpenJio, 28 Oct); scope cut to outing planning (29 Oct).

---

## 14. Name

**Chosen: OpenJio** (decided). "Jio" is Singlish for inviting someone out; an "open jio" is an invite anyone can join, which is what R2's public hangouts are.

Other ideas considered, kept for reference:

**From the product's traits:** OneTab, Tabless, Freeslot, Outplan, Linkup, Synced, Roundup, Plotline, Meetwhere, Gather

| Name | Language | Meaning |
|---|---|---|
| Lepak | Malay / Singlish | hang out, chill |
| Jio | Hokkien / Singlish | invite someone out |
| Kaki | Malay / Singlish | buddy ("makan kaki" = food buddy) |
| Kumpul | Malay | gather |
| Sama-sama / Bersama | Malay | together |
| Jalan-jalan | Malay | go out, stroll |
| Yuē 约 | Mandarin | make plans to meet |
| Jù 聚 | Mandarin | get together |
| Kootam கூட்டம் | Tamil | gathering |
| Barkada | Tagalog | friend group |
| Tomo 友 | Japanese | friend |
| Chingu 친구 | Korean | friend |
| Gezellig | Dutch | cosy togetherness |

Trademark and domain availability not checked.

---

## 15. References

- [IS216 Group Project Briefing](./IS216%20-%20Group%20Project%20Briefing.pdf) · [Project Q&A](./Project%20Q%20and%20A.pdf)
- OneMap: [developer.tech.gov.sg overview](https://www.developer.tech.gov.sg/products/categories/data-and-apis/onemap-apis/overview) · [Search API docs](https://www.onemap.gov.sg/apidocs/search) · [SLA OneMap](https://sla.gov.sg/geoworks/sla-products/onemap) · [Exploring OneMap API](https://sheshbabu.com/posts/exploring-singapore-onemap-api)
- Google Calendar: [API auth scopes](https://developers.google.com/workspace/calendar/api/auth)
- Scheduling tools: [When2meet alternatives (Cal.com)](https://cal.com/blog/when2meet-alternatives)
- Group planning apps: [PopSci roundup](https://www.popsci.com/diy/group-trip-planning-apps/) · [Wanderlog group planning](https://www.whistleout.com/CellPhones/Guides/wanderlog-group-trip-planning-app)
- Deals apps: [SingSaver: Burpple vs Entertainer vs Chope](https://www.singsaver.com.sg/page/blog/burpple-chope-entertainer-compare) · [MoneySmart comparison](https://blog.moneysmart.sg/dining/burpple-entertainer-chope-fave-eatigo)
- Events APIs: [Eventbrite search API shutdown](https://github.com/Automattic/eventbrite-api/issues/83) · [Ticketmaster getting started](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/)
- Telegram scraping: [Reading public channels without the API (dev.to)](https://dev.to/sami_8858131362756585e4f4/you-dont-need-telegrams-api-to-read-a-public-channel-100-messages-no-credentials-16ld)
- SG Telegram channels: [MustShareNews list](https://mustsharenews.com/singapore-telegram-channels/) · [TheSmartLocal list](https://thesmartlocal.com/read/telegram-channels-bots/)
- Free LLM APIs: [OpenRouter comparison](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/) · [Continuum guide](https://continuumcode.ai/guides/free-llm-api/)
- Google Places pricing (rejected option): [openplacesapi.com](https://openplacesapi.com/blog/google-places-api-pricing)
