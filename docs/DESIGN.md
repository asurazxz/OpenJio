# OpenJio: UI/UX and Motion Design Specification

**Version:** 1.0  
**Status:** Hawker Glow visual direction APPROVED. Screen interaction patterns and implementation defaults below are design proposals for the first build unless marked as a product requirement.  
**Audience:** Implementation agent, design reviewer, and project team  
**Platform:** Responsive web app, Vue 3 + Bootstrap 5, Singapore-first  
**Reference:** The original **Direction 2: Hawker Glow** moodboard, **not** the later “City Playbook” reinterpretation.

What was built, and where it departs from this spec, is in section 13 at the end.

> **Agent instruction:** Treat this document as the single design handoff. You do not need the earlier motion kit or moodboard to implement the design. Use the tokens, component rules, motion instructions, user flows, and acceptance criteria here. Keep the original Hawker Glow identity. Do not redesign it as City Playbook, a corporate dashboard, a neon nightlife app, or a generic productivity calendar.

---

## 1. Product context and design objective

OpenJio helps students and young adults in Singapore turn casual group-chat invitations into workable plans.

**Required experiences:**

1. **Create a jio:** A host specifies a date range (up to seven days), approximate start area, and vibe, then shares an invite link.
2. **Collect availability:** Friends mark free 30-minute slots. The app ranks feasible common windows and explains attendance.
3. **Generate a plan:** Once the host locks a time, show an itinerary of three to five stops that considers time windows, opening hours, transport, activities, meals, and deals.
4. **Decide as a group:** Members vote **Keep** or **Swap** per stop; the host replaces, reorders, or removes stops and confirms the itinerary.
5. **Join later:** Given an origin and departure time, show the earliest stop the person should still reach with spare time.
6. **Solo mode:** Plan a free afternoon for one person.
7. **Open Jios:** Discover and join public hangouts with limited spots.
8. **Discover:** Browse places, events, and deals in a feed or map, ranked by interests, distance, and scheduling fit.
9. **Reviewer:** A moderator reviews auto-extracted events and deals before publishing.

**Audience and constraints:** Phone-first, often arriving from WhatsApp or Telegram. Must work from **375px** phones to desktop, in light/dark themes, with complete keyboard access, screen-reader labels, visible focus, and robust contrast.

**Central design goal:** It should feel like a friend inviting you out, while remaining efficient for scheduling, travel, and group decisions. Personality lives around the task, not on top of it.

**Voice:** Friendly and brief; occasional Singaporean phrasing in greetings or celebrations, e.g. “Jio makan?”, “You in?”, “Steady lah!”. Keep instructional labels precise, e.g. “Mark free times”, “Confirm time”, “Swap stop”. Never make Singlish a requirement for comprehension.

---

## 2. Approved visual direction: Hawker Glow

Inspired by Singapore hawker centres, warm lighting, coffee shops, food outings, spontaneous invitations, friendly hand-drawn graphics, and sticker-like reactions.

### 2.1 Original light palette

| Token | Hex | Role |
|---|---|---|
| Background | `#FFF8F1` | Warm cream page background |
| Surface | `#FFFFFF` | Main cards, sheets, menus |
| Primary | `#FF6B35` | OpenJio orange, major branded actions, highlights |
| Secondary | `#14B8A6` | Free time, positive selection, Keep vote |
| Accent | `#F59E0B` | Mango recommendations and friendly accents |
| Support | `#EC4899` | Pink Swap vote and social reactions |
| Text | `#1F2937` | Main readable text |
| Muted | `#6B7280` | Secondary labels |

### 2.2 Original dark palette

| Token | Hex | Role |
|---|---|---|
| Background | `#1C1917` | Warm, near-black page background |
| Surface | `#292524` | Charcoal cards/sheets |
| Primary | `#FF8A5B` | Orange brand/accent |
| Secondary | `#2DD4BF` | Teal free/Keep states |
| Accent | `#FBBF24` | Mango highlights |
| Support | `#F472B6` | Pink Swap and reaction accents |
| Text | `#FAFAF9` | Off-white readable text |
| Muted | `#A8A29E` | Supporting labels |

### 2.3 Supporting semantic tokens

These **supplement** the approved palette for accessible components:

| Token | Light | Dark | Role |
|---|---|---|---|
| `--oj-border` | `#E9DED3` | `#57534E` | Thin, warm borders |
| `--oj-orange-ink` | `#9A3412` | `#FFB79A` | Orange textual labels |
| `--oj-teal-ink` | `#115E59` | `#99F6E4` | Teal textual labels |
| `--oj-focus` | `#0F766E` | `#5EEAD4` | Visible focus outline |
| `--oj-error` | `#B91C1C` | `#FCA5A5` | Error, distinct from Swap pink |
| `--oj-success` | `#166534` | `#86EFAC` | Verified success, distinct from availability |

**Contrast rule:** Avoid white small text directly on bright orange (`#FF6B35`), teal (`#14B8A6`), or mango fills. Use dark foregrounds on those fills, or darken fills for white text. Test the final combinations against WCAG AA: normal text ≥4.5:1, large text and meaningful non-text UI ≥3:1. Never rely on hue alone for status.

### 2.4 Typography

- **Headings and friendly emphasis:** Google Font **Nunito**, weights 700–900.
- **Body, labels, grid times, maps, controls:** Google Font **DM Sans**, weights 400–700.
- Base body: 16px; supporting text: 14px; sparing metadata: 12px only where accessibility and layout permit.
- H1 mobile 28–32px; page titles 24–28px; card headings 18–20px; line height body about 1.5.
- Use tabular numerals for times, prices, attendance counts, durations, and rankings.
- Do not use decorative handwriting fonts for functional content. Hand-drawn look belongs to SVG art, washi-tape shapes, and a small number of celebratory labels.

### 2.5 Shape and visual hierarchy

- Cards: **16–20px** rounded corners; 1px warm border and soft low-elevation shadow.
- Buttons: **12–16px** corners; obvious selected/hover/focus/disabled states; minimum **44 × 44px** targets.
- Chips: pill-shaped, lightly tinted backgrounds and text labels.
- Photos: vivid real-life Singapore outing photos, with consistent aspect ratios, cropped carefully and loaded responsively.
- UI surfaces: mostly cream and white (light) or charcoal (dark); avoid filling entire pages with loud colours.
- Spacing: Bootstrap-style 4px unit; common gaps 8, 12, 16, 24, 32px.
- Signature motifs: **washi-tape section headers**, little marker/doodle sparks, chunky illustrated shortcut icons, **stamp-like Keep/Swap controls**, gently irregular invitation slips, a colourful numbered itinerary timeline.
- Brand: retain **OpenJio** lettering with “Jio” in original orange. No rebrand to City Playbook.

### 2.6 Decorative boundaries

Use embellishment on greetings, marketing/invite surfaces, empty states, and success screens. Keep availability, ranked results, map overlays, timetable labels, form errors, and moderation evidence clean. No confetti overlays blocking clicks, no giant decorative stickers behind dense data, no flashy or constantly moving UI.

---

## 3. Navigation and layout

### Mobile (375–575px)

- Single-column content with 16px side gutters.
- Fixed or sticky bottom navigation for main authenticated screens, using roughly five destinations: **Home, Discover, Create, Plans, Profile**. The central **Create** action uses the orange accent. If actual app routing differs, preserve the hierarchy rather than blindly adding redundant pages.
- Ensure main content has bottom padding so the navigation never obscures the final control.
- Full-width cards; bottom sheets for quick decisions; safe-area insets for devices with gesture bars.
- For shared invitation links, suppress unnecessary app chrome until the user has viewed the invitation and its main action.

### Tablet (576–991px)

- Wider cards, two-column discovery when space permits, larger availability day windows.
- Maintain touch-friendly controls even if layout becomes multi-column.

### Desktop (≥992px)

- Constrain reading content widths but allow broad work surfaces for scheduler, itinerary+map, and reviewer.
- Use sidebar or top-level navigation; two-column itinerary/map; seven-day availability grid; three-pane reviewer workspace where feasible.
- Prefer a **content max-width around 1200–1320px**, with appropriate exceptions for maps/reviewer.

### Light/dark mode

Use Bootstrap 5 `data-bs-theme="light"` / `"dark"`, with OpenJio tokens overriding visual surfaces and controls. Respect OS default on first visit; offer manual user override if feasible. Avoid full-page colour flashes during hydration. Never hardcode white card backgrounds inside dark-mode components.

---

## 4. Screen-by-screen blueprint

### 4.1 Home dashboard

**Visual:** OpenJio wordmark; a friendly, occasional contextual greeting such as “Jio makan?”; small decorative sparks or illustrated steam; prominent **Create a Jio** action plus **Find Open Jios** and **Discover**; Solo Mode as a discoverable secondary option.

**Layout order:**
1. Header and greeting.
2. Main Create/Find actions, chunky orange/teal illustrated tiles.
3. **Your Jios**: next planned jio and pending invites; show next action such as “Mark availability” or “Vote on 2 stops”.
4. **What's happening?** nearby open jios, events, food, and activity cards with strong photography.
5. Nearby places/deals; honest source/freshness labels.

**Empty state:** Friendly illustration and actionable text, “No jios yet. Start one with your friends.”

**Motion:** Only greeting illustration moves gently while visible, and only without reduced-motion preference. Press feedback on primary tiles. Do not animate every feed card on scroll.

### 4.2 Create Jio flow

**Required inputs:** A descriptive title or prompt, date range up to seven days, rough starting area, vibe. Host then receives an invite link.

**Suggested progression:**
1. “What's the plan?”: title/vibe, with choices such as Makan, Chill, Active, Arts, Study, Surprise Me.
2. “When?”: date range, with calendar selection and clear max-seven-day validation.
3. “Where to start?”: rough area such as Bugis, Tiong Bahru, Paya Lebar, or flexible/undecided where permitted by product logic.
4. Review summary and **Create Jio**.
5. Confirmation: shareable **Jio Slip** with Copy Link, Share, and Go to Jio.

**Illustrative copy:** “Friday makan?”, “Somewhere around Bugis”, “Let's see who's free.”

**Motion:** Step changes use restrained 160–240ms transition; on confirmed creation, the invite slip rises 14px and straightens slightly once. Avoid claiming an invite exists before success from the server.

### 4.3 Shared invite / public Open Jio landing

**Primary aim:** Visitors opening from a messaging app should immediately understand the invitation.

**Above the fold:** Cover photo/illustration, washi-tape **OPEN JIO** label for public events or **INVITED** label for private shares, title, vibe, date range or confirmed time, rough meeting area, host, number joined, capacity where applicable, and a clear **Join this Jio** CTA.

**Trust:** Show what is still undecided (time pending, itinerary pending), host information, and status when full. Avoid exposing precise member coordinates.

**Joining:** If authentication is required by actual product rules, preserve the invitation context through login. Never silently join or confirm on behalf of the visitor. Clearly distinguish a successful join, pending approval if supported, and a full event.

**Motion:** Slip/ticket enters once, at most 250ms. Joining success uses a small one-off stamp, not an endless celebration.

### 4.4 Availability grid, critical mobile interaction

**Task:** Select 30-minute free slots across up to seven days.

**Mobile layout:** A horizontally navigable week/day selector above a single-day vertical list of half-hour slots. Optionally show two days on wider devices. Avoid squeezing seven tiny columns into 375px.

**Desktop:** Full seven-day overview with sticky times and headers. Week/day selection should retain context and state.

**Selection model, proposed default:**
- Users choose between **Paint free** and **Erase** modes; tap a cell or drag across contiguous cells to apply the current mode.
- Default blank slots represent **No response** until the user submits a clear availability selection. If backend distinguishes Busy and Unknown, retain both; never silently infer Busy from Unknown.
- Preset actions: **After class**, **Evenings**, **Whole day**. Presets visibly show affected periods and are reversible.
- Show an always-available **Undo**, plus Save/Submit status (avoid ambiguous auto-save without feedback).
- During deliberate paint gestures, capture pointer events inside the grid; preserve normal vertical page scrolling when not painting. Use Pointer Events and a distinct drag handle/mode to prevent accidental marking while swiping the page.
- Do not trigger dozens of server writes on pointer moves. Update locally and batch/save; handle network error explicitly.
- For keyboard: arrow navigation, Enter/Space toggle, focus visibility, and a simple **Add free range** form fallback; announce aggregated updates rather than every painted cell.
- Each interactive cell has an accessible date/time label and state, such as “Friday 7:00–7:30 PM, free, press to clear”. `aria-pressed` applies where using toggle-button semantics; choose one consistent ARIA grid or button structure, not a mixture.

**Visual:** Untouched/unknown light surface, free teal fill with check/text semantics, busy or unavailable distinct grey/hatching when supported; selected day orange underline; no icons squeezed into every cell.

**Motion:** **100ms colour transition** per changed cell, no bouncing. Batch preset updates in one render; reduced motion uses immediate fill.

### 4.5 Ranked common time windows

**Goal:** Make the best choice understandable in seconds.

**Cards:** Show rank #1/#2/#3, exact date/start/end, **5 of 6 available**, breakdown (who is free, who cannot attend, who has not answered), and short explanation such as “Best overlap for a 3-hour outing”. Avoid made-up percentage scores.

**Ranking rules:** Business logic owns actual ranking; UI presents reasons returned by real data. Times must form contiguous usable windows, respecting duration and any constraints known to the service. Mark all-unavailable or insufficient-response situations clearly.

**Host action:** **Lock this time**, after reviewing member impact; non-hosts see results but no host-only destructive controls.

**Motion:** First results appear via 8px translate and fade, 240ms. Keep stagger minimal or none. No moving leaderboard while the host is pressing Lock.

### 4.6 Generated itinerary and group voting

**Signature screen:** The vertical **Hawker Glow colour-coded timeline** from the original moodboard, with 3–5 stop cards connected by thin lines.

**Each stop:** Number in a bright circle, local image, title, category, scheduled arrival/departure, duration, approximate location, price/deal if available, **why selected**, and **Keep** (teal) / **Swap** (pink) with counts.

**Between stops:** Travel mode icon (walk/MRT/etc), estimated minutes, optional distance, and provenance if known. If a stop has unverified hours, show **Hours not verified** and avoid promising the venue will be open.

**Member interaction:** Vote controls act like stamps: selected vote border rotates slightly and pops into place; label and counts update. Voting should be reversible if the product permits. Separate the **vote for swap** from the **host actually replacing the stop**.

**Host actions:** Swap stop, move up/down, remove, then **Confirm plan**. Host reorder/remove actions should trigger recalculation of downstream arrivals, hours and travel; never show silently stale ETAs.

**Footer:** Clear current phase: Draft, Voting, Ready to confirm, Confirmed. Host-only confirm action. Show blockers that make the itinerary infeasible before allowing final confirmation.

**Motion:** Connector lines draw **once** when a generated plan appears (420ms), and vote stamps pop on vote confirmation (220ms). Reordering cards moves up to 240ms. Confirmed plan receives a one-off washi/stamp plus tiny orange/pink spark doodles, only after server success.

### 4.7 Swap-a-stop panel

**Mobile:** Rounded bottom sheet with current stop pinned at top, alternatives list below. **Desktop:** Side drawer. Use Bootstrap 5 Offcanvas behaviour for Escape, focus and backdrop rather than custom focus trapping.

**Alternatives:** Thumbnail, name, category, schedule fit, time spent, approximate cost, opening-hours status, travel delta, and one-sentence reason. Filter chips such as Nearby, Same vibe, Food, Indoor are optional.

**Action sequence:** Inspect suggestion -> preview updated timings/travel across affected stops -> **Confirm swap** or **Keep current stop**. Show feasible/infeasible alternatives explicitly.

**Motion:** Sheet moves up 16px with fade in 240ms. The accepted stop crossfades into the itinerary in 240ms; no flashy page reload. Restore focus to triggering control when closed.

### 4.8 Discover feed and map

**Visual:** Image-forward cards for places, events, deals and public jios. Categories use friendly colour chips and simple outlined icons. Search and interest filters near the top; clear **List / Map** toggle.

**Each listing:** Name, category, location/distance if known, compatible times when supported, opening/validity status, price/deal information, **source link** and **checked/updated timestamp**. Show **Sample data** for fixtures and demos, persistently.

**Map:** Preserve matching results between list/map, cluster dense markers, visually indicate selection, keep accessible list alternative, never rely solely on map interaction.

**Motion:** Only selected markers scale subtly for about 160ms; minimal list transitions. Do not animate marker travel as though tracking real-time position.

### 4.9 Solo mode

**Visual:** Same Hawker Glow palette and stop timeline, but remove group avatars, invitations, attendance counts and voting clutter. Let one user specify free hours, area, vibe and relevant interests, then review/replace suggested stops.

**Motion:** Same itinerary generation/stop replacement rules. No fake group-vote animation.

### 4.10 Joining-later helper

**Inputs:** Starting point, planned departure date/time, group itinerary. Treat location as manually entered by default; precise GPS optional and only with explicit consent.

**Result:** Highlight the **earliest reachable stop with a useful arrival buffer**, destination, proposed mode (walk/MRT/etc), approximate travel time, arrival time, buffer minutes, and backup stop if the route becomes too tight.

**Copy example:** “You should reach Stop 3 around 5:50 PM, about 10 minutes before the group leaves.” Distinguish a realistic estimate from a guarantee.

**Actions:** View directions, Share my ETA. Do not transmit location or send group updates until user explicitly chooses.

**Motion:** Recommendation card slides in 8px/fades over 240ms after actual result. No animated live dot unless real position updates exist.

### 4.11 Moderator review workspace

**Aesthetic:** Functional Hawker Glow variant. Cream/charcoal surfaces remain, but illustrations and sticker flourishes become rare.

**Desktop layout:** Left queue with status/filters; middle editable extracted fields and confidence flags; right original source preview and evidence. On mobile, accessible stacked panels, though desktop is primary for moderation.

**Show:** Original source URL, fetch/check time, extracted title, event/deal dates, location, validity, price, opening-hours data, confidence/uncertainty, review history, source image/snippet if licensing allows, and publication state.

**Actions:** Approve & Publish, Edit, Reject. Moderators must inspect evidence and address warnings before publishing. Do not imply model extraction equals verification.

**Motion:** A reviewed row fades out over 160ms and selection advances only after successful server response; status remains visible to assistive technology.

---

## 5. Distinctive visual assets to implement

Assets should be **local SVG or CSS**, not raster screenshots of UI. The agent should create them using these rules; external artwork is **not required** for this handoff.

| Asset / component | Appearance | Placement | Motion |
|---|---|---|---|
| `OpenJioWordmark` | Dark “Open” + orange “Jio”, rounded bold type | Header, invite | Static |
| `WashiHeading` | Soft coral/pink torn-tape shape under heading; never behind long text | “What's happening?”, itinerary header | Optional one-time 240ms reveal |
| `SparkDoodle` | 3–5 short irregular orange strokes around a focal point | Create/confirmed moments | Single 480ms scale/fade |
| `SteamDoodle` | Three restrained curved lines above an illustrated bowl/cup | Home greeting/empty state | Gentle 3.8s oscillation, completely disabled with reduced motion |
| `VoteStamp` | Slightly tilted chunky Keep teal / Swap pink stamp, dashed selected border | Stop cards | One-time 220ms stamp pop |
| `JioSlip` | Off-white rounded ticket/invite slip with simple dashed perforation, bright label | Share and public invite | One-time 250ms rise |
| `RouteConnector` | Thin line between numbered circles, with walk/MRT icon and minutes | Itinerary | One-time 420ms path draw |
| `CategoryIcon` | Simple outlined food, sports, music, arts, study, outdoor icons | Actions/filter chips | Static or 100ms press feedback |
| `EmptyStateIllustration` | Small friendly illustrated friend group, food, or Singapore environment | Empty dashboard, no results | Static by default |

**Do not use** giant looping animated SVGs, watermarked artwork, copyrighted brand mascots, or repeated decorative components in dense lists. Keep illustrations vector-first with accessible alt text only when informative; decorative shapes should be hidden from assistive technology.

---

## 6. Motion language and specification

### 6.1 Guiding principles

1. **Feedback immediately:** A tap changes the control state without waiting for the animation.
2. **Celebrate decisions, not every hover:** The few strong moments are stamping a vote, creating an invite, and finalising a plan.
3. **Quiet during analysis:** No ongoing decoration in grid, ranked slots, map comparisons, or reviewer queue.
4. **No false certainty:** Animation must not make estimated routes look live or unverified data look approved.
5. **Accessibility is functional:** Reduced motion, focus, touch, and screen readers are part of the animation design, not afterthoughts.

### 6.2 Timing tokens

| Token | Duration | Use |
|---|---:|---|
| Feedback | `100ms` | Slot cell change, press state |
| Quick | `160ms` | Chip, focus-adjacent UI, marker selection |
| Standard | `240ms` | Card reveal, sheet, reordered item |
| Narrative | `420ms` | One-off connector reveal |
| Stamp | `220ms` | Keep/Swap selected reaction |
| Invite slip | `250ms` | Created link confirmation |
| Celebration | `480ms` | Confirmed-plan sparks |
| Easing out | `cubic-bezier(.2,.8,.2,1)` | Most UI movement |
| Stamp ease | `cubic-bezier(.18,1.35,.32,1)` | One-time selected vote pop |

**General bounds:** Movement under ~16px; routine scaling under ~1.05. Single stamps may enter from scale ~0.84. Never use endless bouncing, blinking capacity indicators, or auto-scroll on result arrival.

### 6.3 Motion priorities

| Priority | Interaction | Behaviour | Reduced-motion equivalent |
|---|---|---|---|
| P0 | Availability painting | 100ms fill, no per-cell transform | Immediate fill and semantic label |
| P0 | Keep / Swap vote | 220ms one-shot stamp | Immediate selected border/icon/text |
| P0 | Swap bottom sheet | 240ms, 16px entrance | Instant opening with focus management |
| P1 | Ranked slots result | 240ms fade + 8px rise | Static results with attendance explanation |
| P1 | Itinerary generated | Connector draws once, 420ms | Complete static connector |
| P1 | Reorder stop | Up to 240ms transition | Instant reorder plus status announcement |
| P1 | Invite created | Slip rises 14px, 250ms | Static share card |
| P1 | Confirmed plan | One-off 480ms sparks/stamp | Static success message |
| P1 | Late join recommendation | 240ms fade + 8px rise | Static ETA result |
| P2 | Home cup steam | Soft repeating 3.8s | No animation |
| P2 | Selected map marker | 160ms scale response | Outline and selected label |
| P2 | Reviewer row completion | 160ms exit | Immediate queue refresh and status text |

### 6.4 UI state truthfulness

- **Pending network request:** Disable conflicting action or show a precise loading state; avoid fake “Success!” animation.
- **Server-confirmed vote:** Animate selected vote once; update displayed counts from the authoritative response or reconcile optimistic state.
- **Server error:** Revert optimistic state where needed; show useful error message, and never celebrate.
- **Time slot ranking updated:** Keep interaction stable; do not shuffle cards under a user's finger or focus unexpectedly.
- **Review approval:** Animate row removal only after success.

### 6.5 Reduced motion

Honor `@media (prefers-reduced-motion: reduce)`:
- Stop steam loops, stamp pops, moving connectors, sliding cards, and celebratory sparks.
- Retain all information via text, icons, borders and visible state changes.
- Keep final views fully rendered; never rely on motion completion to reveal content.
- Never delay navigation or confirmations to wait for animation.

---

## 7. Agent-ready design tokens and animation CSS

Place in a scoped OpenJio stylesheet imported **after Bootstrap 5**. Integrate with existing CSS without overriding Bootstrap globally more than necessary.

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Nunito:wght@700;800;900&display=swap');

:root, [data-bs-theme='light'] {
  --oj-bg: #FFF8F1;
  --oj-surface: #FFFFFF;
  --oj-primary: #FF6B35;
  --oj-teal: #14B8A6;
  --oj-mango: #F59E0B;
  --oj-pink: #EC4899;
  --oj-text: #1F2937;
  --oj-muted: #6B7280;
  --oj-border: #E9DED3;
  --oj-focus: #0F766E;
  --oj-orange-ink: #9A3412;
  --oj-teal-ink: #115E59;
}
[data-bs-theme='dark'] {
  --oj-bg: #1C1917;
  --oj-surface: #292524;
  --oj-primary: #FF8A5B;
  --oj-teal: #2DD4BF;
  --oj-mango: #FBBF24;
  --oj-pink: #F472B6;
  --oj-text: #FAFAF9;
  --oj-muted: #A8A29E;
  --oj-border: #57534E;
  --oj-focus: #5EEAD4;
  --oj-orange-ink: #FFB79A;
  --oj-teal-ink: #99F6E4;
}
:root {
  --oj-font-body: 'DM Sans', sans-serif;
  --oj-font-heading: 'Nunito', sans-serif;
  --oj-radius-card: 20px;
  --oj-radius-control: 14px;
  --oj-t-feedback: 100ms;
  --oj-t-quick: 160ms;
  --oj-t-standard: 240ms;
  --oj-t-story: 420ms;
  --oj-ease-out: cubic-bezier(.2,.8,.2,1);
  --oj-ease-stamp: cubic-bezier(.18,1.35,.32,1);
}
.oj-app { background: var(--oj-bg); color: var(--oj-text); font-family: var(--oj-font-body); }
.oj-heading { font-family: var(--oj-font-heading); font-weight: 800; }
.oj-card {
  background: var(--oj-surface); color: var(--oj-text);
  border: 1px solid var(--oj-border); border-radius: var(--oj-radius-card);
  box-shadow: 0 5px 20px rgba(36, 25, 17, .055);
}
.oj-interactive { min-height: 44px; min-width: 44px; }
.oj-interactive:focus-visible { outline: 3px solid var(--oj-focus); outline-offset: 3px; }
.oj-slot {
  transition: background-color var(--oj-t-feedback) linear,
              border-color var(--oj-t-feedback) linear;
}
.oj-slot[aria-pressed='true'] {
  background: var(--oj-teal); color: #102522;
  border-color: var(--oj-teal-ink);
}
.oj-stamp.is-selected { animation: oj-stamp-in 220ms var(--oj-ease-stamp) both; }
@keyframes oj-stamp-in {
  0%   { opacity: .55; transform: rotate(-6deg) scale(.84); }
  75%  { opacity: 1; transform: rotate(2deg) scale(1.045); }
  100% { opacity: 1; transform: rotate(-1deg) scale(1); }
}
.oj-card-enter-active {
  transition: opacity var(--oj-t-standard) var(--oj-ease-out),
              transform var(--oj-t-standard) var(--oj-ease-out);
}
.oj-card-enter-from { opacity: 0; transform: translateY(8px); }
.oj-route-line { stroke-dasharray: var(--oj-path-length, 200); stroke-dashoffset: var(--oj-path-length, 200); }
.oj-route-line.is-revealed {
  stroke-dashoffset: 0;
  transition: stroke-dashoffset var(--oj-t-story) var(--oj-ease-out);
}
.oj-steam { animation: oj-steam 3.8s ease-in-out infinite; }
@keyframes oj-steam {
  0%, 100% { opacity: .4; transform: translateY(2px); }
  50% { opacity: .8; transform: translateY(-5px); }
}
@media (prefers-reduced-motion: reduce) {
  .oj-app *, .oj-app *::before, .oj-app *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
  .oj-route-line, .oj-route-line.is-revealed { stroke-dashoffset: 0; }
}
```

**Implementation caveats:**
- Run contrast checks after combining Bootstrap variables and OpenJio tokens. Some branding colours are not suitable as white-text button backgrounds.
- For a generated SVG route line, set `--oj-path-length` from its actual path length if animating. Avoid a fixed incorrect dashed length for arbitrary geometry.
- Do not trigger one-shot CSS animations on each reactive rerender; tie them to meaningful transition keys or a deliberate state change.
- CSS is a starter reference; retain proper labels, keyboard handlers, loading/error states, and focus control in Vue.

---

## 8. Vue component architecture, suggested

Keep visuals reusable while leaving network and business logic in composables/stores. Suggested names:

```text
src/
  styles/
    openjio-tokens.css
    openjio-components.css
    openjio-motion.css
  components/
    brand/OpenJioWordmark.vue
    brand/WashiHeading.vue
    brand/SparkDoodle.vue
    brand/SteamDoodle.vue
    jio/JioCard.vue
    jio/JioSlip.vue
    jio/ParticipantAvatars.vue
    availability/AvailabilityGrid.vue
    availability/AvailabilityDayPicker.vue
    availability/AvailabilityPresets.vue
    availability/FreeRangeEditor.vue
    planning/RankedTimeCard.vue
    planning/ItineraryTimeline.vue
    planning/ItineraryStop.vue
    planning/RouteConnector.vue
    planning/VoteStamp.vue
    planning/SwapStopSheet.vue
    planning/PlanConfirmation.vue
    discovery/DiscoveryCard.vue
    discovery/SourceFreshness.vue
    discovery/DiscoveryMap.vue
    discovery/OpenJioCard.vue
    late/ReachableStopCard.vue
    moderation/ReviewQueue.vue
    moderation/ExtractedFields.vue
    moderation/SourceEvidence.vue
```

**State responsibilities:**
- Component props represent authoritative state; events express user intent.
- Parent/store/composable performs API calls, handles loading/error and reconciles optimistic state.
- Stable item IDs for Vue `TransitionGroup`; never index keys for reordered stops.
- Vote components do not infer whether the host approved a swap.
- Keep interface labels driven by backend states when possible; mock data must be marked **Sample data**.
- Bootstrap Offcanvas is the production baseline for mobile swap sheet and supported dialogs, with careful focus restoration.
- No animation dependency is necessary for the first build. Prefer CSS transitions, SVG and Vue `<Transition>` / `<TransitionGroup>`.

---

## 9. Accessibility and performance requirements

### Accessibility

- WCAG AA contrast checks for both themes; minimum visible focus outline 3px and 44px interactive targets.
- Every icon-only button gets a meaningful accessible name.
- Keyboard navigation to all app actions, grid cells/ranges, voting, host reorder, and map equivalent list. Esc closes sheets; closing returns focus to opener.
- For bottom sheets, contain keyboard focus while open and restore it on close.
- Live-region updates: announce confirmed vote, locked time, saved availability, completed swap, review result, and late-join recommendation. Avoid speech flooding during drag painting.
- Do not use colour as the sole cue for Free/Unknown/Busy, Keep/Swap, source confidence, warnings or sample data.
- Respect `prefers-reduced-motion` and system high-contrast preferences where supported.

### Performance

- Availability grid: avoid per-pointer-move animation loops and network requests. Update only changed slot state; batch persistence.
- Seven days × 48 half-hour slots = up to **336 slots per user** if the complete 24-hour day is rendered; consider smaller visible windows and efficient updates.
- Lazy-load below-fold photography; reserve dimensions to prevent layout shift.
- Keep SVG decorations lightweight, inline only if individual shapes animate.
- Avoid map rerender on every feed hover or input keystroke; debounce searches appropriately.
- Prioritise a responsive feel on modest Android devices.

### Trust and data status

- Estimated travel: “About 18 min by MRT”, not guaranteed. Show provider/last checked when known.
- Unknown opening hours: “Hours not verified”, not “Open now”.
- Deals: source name/link, validity dates, and most recent check timestamp; never invent merchant endorsement.
- Sample/demo content: persistent label “Sample data”.
- Moderator review: “Auto-extracted” distinct from “Approved/Published”.
- Group availability: distinguish “Unavailable” from “No response”.
- Public jio capacity: show exact spots and current state, without flashing urgency or unverified live counts.

---

## 10. Build plan and priorities

### Phase 0: Foundations (P0)

- Install/load DM Sans + Nunito and establish palette tokens for both themes.
- Set card/button/chip/timeline styles, focus rules, minimum targets, loading/error states.
- Add reusable brand motifs (washi, stamp, simple SVG doodles) sparingly.
- Implement accessible responsive navigation and shared invitation entry route.
- Add reduced-motion support from the outset.

### Phase 1: Core collaboration (P0)

- Jio creation and link preview/share slip.
- Mobile-first availability selection with tap, deliberate drag painting, presets, Undo, keyboard range alternative, save confirmation.
- Ranked slots with explicit free/unavailable/no-response breakdown and host lock action.
- Itinerary stop cards, Keep/Swap vote stamps, confirmed counts and error handling.
- Swap-a-stop sheet with preview of timing/travel impact.

### Phase 2: Plan quality and feedback (P1)

- Itinerary connectors, reorder/remove actions, feasibility warnings and host confirmation.
- One-off plan confirmation stamp/sparks and invite slip entrance.
- Late-joiner result with ETA and backup stop.
- Solo mode without irrelevant social controls.

### Phase 3: Discovery and moderation (P1/P2)

- Public Open Jio listing/detail and capacity states.
- Discover feed/map, source and freshness badges.
- Reviewer queue, evidence, moderation decisions and audit status.
- Optional decorative home steam and selected marker motion once core UX is stable.

---

## 11. Acceptance checklist

### Visual identity
- [ ] Looks like original **Hawker Glow**, not City Playbook.
- [ ] Original light/dark colours and DM Sans + Nunito are used.
- [ ] Orange OpenJio brand, rounded cards, washi headings and Keep/Swap stamps present.
- [ ] Decorations are sparse on data-heavy screens.

### Responsive and functional
- [ ] At 375px, no horizontal page overflow; main actions remain accessible above bottom nav.
- [ ] Availability selection works by tap, deliberate touch paint, mouse, and keyboard without blocking normal scroll.
- [ ] Seven-day window and 30-minute slot semantics are correct.
- [ ] Ranked slots explain attendance, including nonrespondents.
- [ ] Only the host sees host-only actions, with appropriate backend enforcement.
- [ ] Vote, swap, reordering, and confirmation states reconcile with real responses.
- [ ] Itinerary and late-join results never imply unverified route certainty.
- [ ] Invite links opened from chat preserve the right jio context.
- [ ] Open Jio capacity, Discover freshness, and reviewer states are visibly truthful.

### Motion and accessibility
- [ ] Vote feedback is a one-time stamp, no endless motion.
- [ ] Motion duration follows the defined tokens; no animation blocks a user action.
- [ ] Reduced-motion setting disables decorative motion while leaving clear state feedback.
- [ ] Full keyboard operation, visible focus, screen-reader labels and AA contrast in both modes.
- [ ] Esc/focus restoration works with swap sheets and dialogs.
- [ ] Failed API operations never show a success celebration.

---

## 12. Final handoff directive

Build OpenJio as a **warm, youthful, mobile-first Singapore group-planning app** using approved **Direction 2: Hawker Glow**. Keep its exact original palette, Nunito + DM Sans, cream/charcoal surfaces, soft corners, washi-tape accents, illustrated shortcut icons, bright numbered itinerary timeline, and tactile Keep/Swap stamps.

Make motion purposeful: **100ms** availability fills, **220ms** vote stamps, **240ms** sheets/cards, **420ms** one-time itinerary connectors, and **480ms** one-off confirmation sparks. All meaningful interactions must work without animation, with keyboard-only navigation, and with actual backend state.

Prioritise correct group scheduling and transparent itinerary logic over decoration. Use the suggested screen layouts as working defaults but do not fabricate product rules, capabilities, real-time data, verified opening hours, or deal validity. If a rule remains unresolved, implement the clearest reversible UX and flag it for product review rather than silently inventing behaviour.

---

## 13. As built (29 Oct 2026)

This section records how the spec landed in `client/` and every place the build departs from it.

### Where things live

| Spec item | Implementation |
|---|---|
| Tokens (section 7) | `client/src/styles/tokens.css`. `--oj-*` tokens as specified, plus older names (`--paper`, `--ink`, `--tomato`, `--plum`) kept as aliases so existing components read the new palette |
| Base, buttons, chips, motion classes | `client/src/styles/app.css` (`oj-rise`, `oj-fade`, `oj-step` transitions; reduced-motion block) |
| Light/dark | `client/src/lib/theme.js` sets `data-theme` (tokens) and `data-bs-theme` (Bootstrap). An inline script in `index.html` sets both before first paint, so there is no colour flash |
| `OpenJioWordmark`, `WashiHeading`, `SparkDoodle`, `SteamDoodle`, `VoteStamp`, `JioSlip`, `CategoryIcon` | `client/src/components/brand/` |
| `RouteConnector` | Legs inside `PlanTimeline.vue`; they draw once on mount (420 ms, staggered) |
| Availability grid (4.4) | `AvailabilityGrid.vue`: one day as a slot list below 768 px, full range as a grid above; Paint free / Erase modes; Undo; presets; "Add a time range" form; arrow-key navigation with one tab stop; polite live-region summaries |
| Ranked windows (4.5) | `TimePanel.vue`: rank badge, exact time, "n of m available", Free / Can't / No reply breakdown, reasons from the ranking, "Lock this time" for the host only |
| Itinerary and voting (4.6) | `PlanTimeline.vue`, `PlanPanel.vue`: colour-cycled numbered stops, travel mode and minutes with an "estimate" chip, a "Why" line per stop, "Hours not verified", Keep/Swap stamps, phase pill (Voting, Ready to confirm, Needs fixing, Confirmed), one-off confirmed stamp and sparks after the store confirms |
| Swap sheet (4.7) | `AppDialog.vue` with `sheet`: bottom sheet on phones, right drawer on wider screens. Choosing an option previews the new timings for that stop and the later ones before "Confirm swap" |
| Create flow (4.2) | `NewHangoutView.vue`: four steps (Plan, When, Where, Check) with vibe shortcuts, then the Jio Slip with Copy link, Share (when the browser supports it) and Go to jio |
| Invite landing (4.3) | `JoinView.vue`: Jio Slip with OPEN JIO or INVITED tape, status (time pending, voting, confirmed), spots left; bottom nav hidden on these routes |
| Late join (4.10) | `GoPanel.vue`: earliest reachable stop, arrival, buffer, backup stop, "View directions", "Share my ETA" (only on tap) |
| Navigation (3) | `BottomNav.vue`: Home, Discover, Create (raised orange), Open jios, Me. Header links on wider screens |

### Departures from the spec

1. **Muted text colour.** Light `--oj-muted` is `#636975`, not `#6B7280`. The spec value measured 4.05 to 4.24:1 on the tinted fills (tags, soft tiles), below AA. Dark mode uses the spec value.
2. **Control borders.** Added `--oj-control-border` (`#A08A76` light, `#8A837D` dark) for inputs and secondary buttons so their edges reach 3:1. The spec border `#E9DED3` is kept for cards.
3. **Bright fills use dark text** (`--oj-on-fill`), following the contrast rule in 2.3. Measured: 6.2:1 on orange, 7.1:1 on teal, 5.0:1 on pink.
4. **"Plans" destination** in the bottom nav became **Open jios**: Home already lists your plans, and the spec says not to add a redundant page.
5. **No photography.** The sample data has no licensed photos, so cards use a tinted tile with an outlined category icon instead. Real photos can replace the tile later without layout changes.
6. **Bootstrap Offcanvas** was not used for the swap sheet. The native `<dialog>` already traps focus, closes on Escape, shows a backdrop and returns focus to the opener, without adding Bootstrap's JavaScript.
7. **Presets** apply to the shown day on phones and to every day on wider screens. The label says which ("Fill Sat 14 Nov" or "Fill every day").
8. **Touch painting** is off by default. A "Drag to paint" toggle turns it on, so ordinary swipes keep scrolling the page.
9. **Sentence case** for headings and buttons, as in the spec's copy examples, rather than Title Case.
10. **Marker clustering** on the Discover map is not built yet.
11. **The reviewer workspace** keeps its earlier layout with the new tokens. The three-pane layout in 4.11 is still to do.

### Checks run

- Contrast of every token pair used for text, in both themes (script, not a browser extension).
- Playwright: 16 of 16 journeys pass at 1280 px and 375 px, with no horizontal overflow or console errors.
- Manual pass in the browser: create flow, invite slip, availability drag, Undo and keyboard, ranked cards, generate, vote, swap preview, light and dark, 375 px.
- Reviewed against the Vercel Web Interface Guidelines and the Impeccable craft floor; fixes applied (ellipses on loading text and placeholders, scroll padding under the sticky header and bottom nav, an unsaved-changes guard on availability, `touch-action: manipulation`).
