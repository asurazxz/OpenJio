# OpenJio desktop UI/UX audit

**Reviewed:** 2 November 2026. **Scope:** desktop only, following the user's clarification. **Deliverable:** evaluation and recommendations; application code was not changed.

## Assessment

OpenJio has a convincing visual identity. The cream and charcoal surfaces, orange primary actions, rounded typography, invitation tickets, and restrained local character fit the product. The underlying journey—find a time, shape an outing, agree and meet—is sound. A wholesale visual redesign would be a poor first investment.

The larger weakness is that the interface sometimes communicates more certainty or control than the implementation provides. It can present outdated travel advice as current, call fictional offers verified, describe all members as going, and ask whether to leave after it has already changed the planning stage. These inconsistencies undermine the confidence a coordination product needs.

The next iteration should make the current state, consequences of actions, and recovery paths reliable. Then improve the efficiency of the desktop work surfaces.

## Evidence and limits

- Inspected the current working tree, including its existing uncommitted changes, route definitions, every view, and the main shared interaction components. Historical design documents were context, not proof of current behavior.
- Used the attached `ui-ux-agent-guide.md` as evaluation reference material. Its embedded instructions were not treated as authorization to redesign or modify the app. Applied its distinction between observations, interpretations, and proposed improvements.
- Ran Chromium against a local client explicitly configured for **demo mode**, using isolated browser data. Inspected the main experience at **1440 × 900**, plus a **1280 × 720** desktop view. Captured signed-out and signed-in screens, both themes, host and member views, creation variants, planning dialogs, and selected error states.
- Completed group creation, invitation-link creation, time locking, itinerary generation, confirmation, and a late-arrival calculation. Inspected solo/public creation, member voting controls, cancellation, invalid invitation, and 404 states. Verified Escape dismissal for the inspected native dialogs and the People popover.
- Reproduced the state failures called out below with focused browser probes. The main walkthrough recorded no uncaught page JavaScript exceptions. This does not establish that every interaction is correct.
- The live API server was not running. Production account recovery, email verification, live venue search, real-time collaboration across hosted accounts, slow network behavior, and provider outages were **not** verified end to end. Hosted authentication findings are explicitly based on source inspection.
- This is an expert heuristic review and cognitive walkthrough, not a user study or full WCAG conformance assessment. Predicted comprehension and abandonment effects remain hypotheses until tested with representative users. No mobile findings are included.

**Severity:** High = substantial task, trust, or recovery problem; Medium = meaningful confusion, avoidable effort, or an accessibility barrier with a practical workaround; Low = clarity or polish improvement. No catastrophic issue was established in the inspected scope. Severity reflects impact and recoverability, not measured user frequency.

## Page coverage

| Page / surface | Assessment | Main findings |
|---|---|---|
| Landing `/` while signed out | Clear primary actions and memorable voice; the large map favors spatial discovery over explaining coordination. | F23, F25 |
| Sign in `/signin` | Demo personas work; production recovery is incomplete in the rendered source branch. | F05, F11 |
| Home `/` while signed in | “Next up” and “Waiting on you” give a useful task hierarchy. Attendance and repeat-group promises need precision. | F08, F24 |
| Discover `/discover`, map/cards and listing dialog | Strong complementary exploration/comparison modes. Saving, returning, and resuming an action need better continuity. | F03, F11, F12, F20, F25 |
| Open Jios `/discover?type=hangout` | Time, host, remaining places, and description are easy to scan. Cost and commitment information are thin. | F13 |
| Private invite `/j/:token` | Good preview before authentication and useful availability privacy explanation. | F09, F10, F13 |
| Public invite `/o/:id` | Itinerary preview supports the join decision. Expected spend and first-meeting detail would improve confidence. | F10, F13 |
| Create `/new`: group, solo, public | Manageable steps, review screen, and editable summaries; preserve this structure unless user testing shows excessive effort. | F15, F16 |
| Hangout Time `/h/:id?tab=time` | Free / Can't / No reply breakdown is valuable. Editing, saving, and locking interact incorrectly. | F01, F07, F08, F14 |
| Hangout Plan: host/member, empty/generated/confirmed | Useful timeline, voting counts, swap preview, manual addition, and map. Recovery and certainty are the weak points. | F03, F04, F09, F12, F21 |
| On the day `/h/:id?tab=go` | A valuable differentiated feature; current result handling can mislead people about where and when to meet. | F02, F06 |
| Profile `/profile` | Clear labels and unsaved-change protection; preference strength and account wording need work. | F22 |
| How it works `/how` | Plain-language explanation comes before the optional algorithm comparison, which is the right hierarchy. | F23 |
| Invalid invite, private/not-found hangout, 404, cancelled plan | Recovery copy and destinations exist. No additional high-severity issue established in these inspected states. | Shared F17, F18 where applicable |
| Shared header, dialogs, toasts, route transitions | Consistent navigation and sensible native dialogs; keyboard context and dark error feedback need correction. | F16–F19 |

## High-priority findings

### F01 — High · The unsaved-availability guard runs after locking has already changed the screen

**Observed:** As Mei, open Saturday catch-up, change one free-time cell without saving, then select **Lock this time**. The app commits the lock and switches to Plan while displaying **Leave without saving? Stay / Leave**. The availability editor is already unmounted. A “Time locked” toast appears behind the prompt.

**Why it matters:** “Stay” promises the ability to keep editing, but the stage transition has already happened. The host can lock using previously saved availability while thinking the current grid was considered. This is a broken control/recovery contract.

**Mitigation:** Resolve dirty availability *before* calling `lockSlot`: offer **Save and lock**, **Discard edits and lock**, and **Keep editing**. Recalculate the candidate after saving; do not commit a now-invalid candidate. Keep the editor mounted until the user resolves this decision. A cancelled decision must leave stage, URL, and edits intact.

**Evidence:** [Screenshot](/home/denz-server/.codex/visualizations/2026/11/02/01a19b35-7a6e-7d73-bf7c-e67d6eba4036/openjio-desktop-audit/unsaved-lock.png). [TimePanel.vue:187](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/TimePanel.vue:187), [HangoutView.vue:96](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/HangoutView.vue:96).

### F02 — High · Old late-arrival advice remains actionable after inputs change

**Observed:** Calculate a result for Friday night makan, then change the origin to Tampines and departure to **11:55 pm**. The previous result still says to meet at Gardens by the Bay around **7:25 pm**. **View directions** and **Share my ETA** remain available.

**Why it matters:** The visible answer no longer corresponds to the visible question. Users can send an incorrect ETA or navigate on obsolete advice.

**Mitigation:** Invalidate results and sharing whenever origin, coordinates, departure, itinerary, or outing date changes. Either recalculate automatically with request cancellation or require an explicit **Update meeting point** action. Include “Based on leaving Tiong Bahru at 7 pm on Friday…” in the result so its input snapshot is inspectable. Ignore responses from superseded requests.

**Evidence:** [Screenshot](/home/denz-server/.codex/visualizations/2026/11/02/01a19b35-7a6e-7d73-bf7c-e67d6eba4036/openjio-desktop-audit/stale-eta.png). [GoPanel.vue:40](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/GoPanel.vue:40), [GoPanel.vue:100](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/GoPanel.vue:100).

### F03 — High · Fictional sample offers become “verified deals” in the itinerary

**Observed:** The generated Saturday plan includes **Satay Stop Skewer Bundle** and **Puzzle Room Co Escape Discount**, with “Has a verified deal” and “Includes 2 verified deals.” Their sample status is absent from the timeline. Discover's detail view explicitly says sample deal names are made up. Home also surfaces sample activity names without equivalent item-level disclosure.

**Why it matters:** The strongest trust language appears at the moment people decide where to spend time and money. A timestamp in the data is not sufficient to establish that a sample promotion exists.

**Mitigation:** Carry a persistent **Sample offer — not redeemable** badge through cards, itinerary, alternatives, Home, and shared previews. Exclude samples from verified claims. For real listings, distinguish **Source checked on [date]** from merchant-confirmed availability; link to the supporting source at the decision point.

**Evidence:** [Plan screenshot](/home/denz-server/.codex/visualizations/2026/11/02/01a19b35-7a6e-7d73-bf7c-e67d6eba4036/openjio-desktop-audit/go-result.png), [detail screenshot](/home/denz-server/.codex/visualizations/2026/11/02/01a19b35-7a6e-7d73-bf7c-e67d6eba4036/openjio-desktop-audit/listing-detail.png). [validity.js:38](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/lib/algo/validity.js:38), [itinerary.js:325](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/lib/algo/itinerary.js:325), [PlanTimeline.vue:286](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/PlanTimeline.vue:286).

### F04 — High · Removing a stop immediately changes a confirmed outing, with no undo

**Observed:** On the Plan tab of a confirmed Saturday outing, select **Remove**. The stop disappears, later timings move, the stage returns to voting, and changed-stop votes reset. There is no confirmation or undo. A general banner warns that edits reopen voting, but it does not provide recovery.

**Why it matters:** A small adjacent control can alter a plan the group already relies on. Re-adding the venue does not necessarily recover its votes and timing.

**Mitigation:** For draft removal, provide an undo that restores the previous plan and relevant votes. For confirmed outings, use an explicit **Edit confirmed plan** state and a change summary before publishing the revision. Apply the same consequence model to reordering, swapping, adding, and regenerating. Preserve an earlier confirmed version until the revision is committed.

**Evidence:** Browser probe confirmed the stage change and absence of a dialog. [PlanPanel.vue:67](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/PlanPanel.vue:67), [PlanPanel.vue:71](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/PlanPanel.vue:71).

### F05 — High for hosted release · Authentication has no visible account-recovery path

**Source finding:** The hosted sign-in branch offers email/password and account creation, but no **Forgot password?** flow. Email-confirmation feedback offers returning to sign-in, without a visible resend action. Hosted behavior was not exercised against a real account.

**Why it matters:** A returning user who cannot authenticate has no recovery route in the product, especially costly when following an invite or accessing a plan they host.

**Mitigation:** Add password reset request and completion screens, a show-password control, and confirmation-email resend with clear feedback. Preserve the original invite or planning destination through recovery. Use error text that identifies a feasible next action.

**Evidence:** [SignInView.vue:86](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/SignInView.vue:86).

## Medium-priority findings

### F06 — Medium · “Arrive at the venue” and “meet the group” are conflated

**Observed:** A backup recommendation says to reach stop 3 around **2:21 pm**, while the itinerary places the group there at **4:35 pm**. Another result gives arrival at Gardens by the Bay at **7:25 pm**, although the group starts that stop at **7:40 pm**.

**Mitigation:** Show three separate facts: **You arrive 7:25**, **Group arrives 7:40**, **Wait about 15 min; together until 10:10**. Rank and describe backups using actual meeting time and usable overlap. Include the outing date beside the departure input; use **Leave now** only when “now” is actually on that date.

**Evidence:** [GoPanel.vue:249](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/GoPanel.vue:249), [reachability.js:26](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/lib/algo/reachability.js:26).

### F07 — Medium · Blank availability has contradictory explanations

**Observed/code:** The editor says **“Blank means no answer, not busy.”** After someone submits a partial selection, unmarked periods can nevertheless cause them to appear under **Can't** for a recommendation. The unknown/nonresponse distinction is useful at the person level, but the explanation incorrectly applies it to individual cells.

**Mitigation:** State the submission contract explicitly: **“Mark every time you can attend. After saving, unmarked times count as unavailable. You can update your answer later.”** Separately identify people who have not submitted any answer. If per-slot uncertainty is a product requirement, implement three actual states rather than describing a two-state editor as three-state.

**Evidence:** [TimePanel.vue:249](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/TimePanel.vue:249), [TimePanel.vue:150](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/TimePanel.vue:150).

### F08 — Medium · “Going” is used for membership, responses, and attendance

**Observed/code:** Saturday catch-up says **4 going** while only three people have replied. The next-up ticket derives “going” from people with any availability response, rather than their availability for the locked time.

**Mitigation:** Use **4 members** before attendance is established; show **3 available · 1 no reply** for a proposed time. Reserve **Going** for a defined attendance decision. Use the same definition on Home, invites, the People control, and the final plan. Explain the membership/attendance distinction wherever needed.

**Evidence:** [Time screenshot](/home/denz-server/.codex/visualizations/2026/11/02/01a19b35-7a6e-7d73-bf7c-e67d6eba4036/openjio-desktop-audit/time.png). [HangoutView.vue:143](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/HangoutView.vue:143), [NextUpTicket.vue:50](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/home/NextUpTicket.vue:50).

### F09 — Medium · The main collaboration action is hidden behind an attendance pill

**Observed:** After the initial creation slip, the invite link is inside **4 going**. That label primarily suggests an attendance list. Generated-plan feedback tells the host to share, without a corresponding explicit share action near the work.

**Interpretation:** Hosts returning later may not discover how to invite another friend. The control is functional, but its information scent is weak.

**Mitigation:** Expose **Invite friends** or **Copy invite link** in the hangout header. Keep the People control for membership. Use a meaningful desktop clipboard action and show confirmation beside it; offer native sharing where available.

**Evidence:** [MembersPanel.vue:96](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/MembersPanel.vue:96), [HangoutView.vue:139](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/HangoutView.vue:139).

### F10 — Medium · Invite disclosure understates what the link reveals

**Observed:** The sharing panel says the link shows **only the name, time and who is going**. The invite page also shows description, starting area, interests, and an itinerary/map when stops exist.

**Mitigation:** Describe the real preview accurately and make it inspectable before sharing: **“Anyone with this link can see the outing details, member first names and plan preview.”** Keep the separate, useful explanation that individual availability grids are not displayed.

**Evidence:** [MembersPanel.vue:103](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/MembersPanel.vue:103), [JoinView.vue:93](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/JoinView.vue:93).

### F11 — Medium · Signing in from a Discover save action loses the selected item/action

**Source finding:** A signed-out **Add to plan** redirects to sign-in with `next` containing the current Discover URL. The selected listing and intended save are local component state and are not included. Signing back in returns to browsing rather than resuming that item. Private invite routes do preserve the invitation identity, which is a good pattern to reuse.

**Mitigation:** Include a listing ID and intended action in resumable state, restore the detail and target-plan chooser, then let the user complete the save. Do not save automatically without resolving the target outing.

**Evidence:** [DiscoverView.vue:294](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/DiscoverView.vue:294), [SignInView.vue:18](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/SignInView.vue:18).

### F12 — Medium · “Add to plan” actually means “save to a shortlist”

**Observed:** Discover's button says **Add to plan**, while the detail explanation and success feedback describe a shortlist. In the itinerary editor, **Add a stop** changes the route directly. These are different outcomes with similar labels.

**Mitigation:** Use **Suggest for this jio** or **Save to shortlist** in Discover and **Add to itinerary** for host route editing. Show the target outing clearly and link to the saved suggestion. Keep the shortlist distinct from confirmed stops, with an explicit host action to promote a suggestion.

**Evidence:** [DiscoverView.vue:306](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/DiscoverView.vue:306), [ListingDetails.vue:79](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/ListingDetails.vue:79), [PlanPanel.vue:204](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/PlanPanel.vue:204).

### F13 — Medium · Public join decisions omit practical commitment information

**Observed:** The public card and invitation show time, starting area, host, remaining places, and stop titles, but no outing spend estimate or clear booking/commitment summary. “Around Chinatown” is also insufficient as a final rendezvous point.

**Interpretation:** Joining strangers or accepting a multi-stop outing requires confidence about affordability and meeting logistics, not just remaining capacity.

**Mitigation:** Where supported, show **Estimated spend per person**, booking requirements, whether the itinerary is still changing, and an exact first-meeting point after confirmation. Label missing costs **Not estimated**. Let hosts specify expectations such as a relaxed pace; do not fabricate totals from incomplete prices or make claims about host verification without an actual process.

**Evidence:** [Public invitation](/home/denz-server/.codex/visualizations/2026/11/02/01a19b35-7a6e-7d73-bf7c-e67d6eba4036/openjio-desktop-audit/public-invite.png). [ListingCard.vue:136](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/ListingCard.vue:136), [JoinView.vue:108](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/JoinView.vue:108).

### F14 — Medium · Availability is dense to edit, while its save action is distant

**Observed:** Desktop half-hour cells are **18 px high**. On the 900 px-high view, the save controls are below the initial viewport after the large heading and reply strip. This creates precision and scrolling costs even with a mouse. Presets, keyboard arrows, Undo, and the range-entry alternative are strengths.

**Mitigation:** Keep a local save/status bar visible while editing; show the selected range/time beside the pointer or in a persistent readout. Increase row height or provide a clear compact/comfortable density choice. Expose the range-entry alternative more prominently. Consider a bounded scheduler pane so the heading does not consume the editing workspace. Verify a seven-day view and keyboard focus under sticky elements.

**Evidence:** [Screenshot](/home/denz-server/.codex/visualizations/2026/11/02/01a19b35-7a6e-7d73-bf7c-e67d6eba4036/openjio-desktop-audit/time.png). [AvailabilityGrid.vue:518](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/AvailabilityGrid.vue:518), [TimePanel.vue:251](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/TimePanel.vue:251). This is a usability finding; no blanket WCAG target-size failure is claimed without evaluating equivalent-control exceptions.

### F15 — Medium · Unresolved location search can silently fall back to City Hall

**Source finding:** Editing an already-selected search result clears it and resets `form.area` to City Hall. The user can proceed without choosing a new result. The review screen exposes the resulting area, but the previous search text can still suggest a different intention.

**Mitigation:** Separate **typed query** from **confirmed start point**. Display the confirmed selection clearly; when a selected result is edited, require a new selection or an explicit choice to keep a popular area. Do not silently change the start point. Explain the fallback near the field if the user chooses it.

**Evidence:** [NewHangoutView.vue:179](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/NewHangoutView.vue:179), [NewHangoutView.vue:422](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/NewHangoutView.vue:422).

### F16 — Medium · Wizard steps do not move keyboard focus to the new content

**Observed:** After Next, focus remains on Next; on reaching review, the same focused button becomes **Create plan**. The intended heading-focus call happens before the outgoing/incoming transition has finished.

**Mitigation:** Focus the new step heading after the transition's `after-enter` event. Announce **Step 2 of 4: When**. Keep the submission control outside accidental repeated activation and test the complete wizard using only the keyboard. Link date/time errors programmatically to their fields as well as showing them visually.

**Evidence:** Browser probes recorded `BUTTON / Next`, `BUTTON / Next`, `BUTTON / Create plan`. [NewHangoutView.vue:137](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/NewHangoutView.vue:137), [NewHangoutView.vue:347](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/NewHangoutView.vue:347).

### F17 — Medium · Route changes update the view but leave focus in the old navigation context

**Observed/code:** Following Home → Discover leaves focus on the header Discover link. The page title updates, but there is no general route focus/announcement strategy. A skip link exists and is useful, but users must invoke it again.

**Mitigation:** On full page navigation, move focus to the new main heading or main region after the transition. Preserve focus for local filtering and ordinary in-page interactions. Add a concise page-change announcement if needed after testing with assistive technology.

**Evidence:** [App.vue:24](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/App.vue:24), [router.js:31](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/router.js:31).

### F18 — Medium · Invalid tab URLs produce an empty working area

**Observed:** `/h/h-catchup?tab=nonsense` renders no selected tab and an empty tab panel. The query is accepted without checking it against the available sections.

**Mitigation:** Validate tab values against the current outing's actual tab list, normalize invalid or obsolete values to the stage-appropriate tab, and synchronize selected state from the route. Test shared links, reloads, and switching between group and solo/public routes.

**Evidence:** Browser probe: selected tabs `0`, panel text empty. [HangoutView.vue:95](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/HangoutView.vue:95).

### F19 — Medium · Dark-theme error toasts have poor text contrast

**Measured:** `.toast-x.danger` uses white text on the dark theme's `#FCA5A5` error color, approximately **1.90:1** contrast. A rendered diagnostic toast confirmed both computed colors. This is much lower than the normal-text minimum of 4.5:1.

**Mitigation:** Use a dark error surface with light text or dark text on the light error fill. Define separate semantic error-surface and error-text tokens rather than reusing an inline text token as a background. Keep actionable errors near the failed control and persistent when correction is required.

**Evidence:** [Screenshot](/home/denz-server/.codex/visualizations/2026/11/02/01a19b35-7a6e-7d73-bf7c-e67d6eba4036/openjio-desktop-audit/dark-error-toast.png). [ToastHost.vue:36](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/ToastHost.vue:36), [tokens.css:133](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/styles/tokens.css:133). [WCAG contrast reference](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

### F20 — Medium · Discover silently re-enables personalization after navigation

**Observed:** Disable **Use my interests to rank results**, navigate to Home, then return. The checkbox is checked again. Other Discover filters are represented in the URL, so this preference behaves inconsistently.

**Mitigation:** Persist the user's chosen ranking mode in the URL or an appropriate preference store. Label the active sort/ranking near results, such as **Best match for your interests** or **Unpersonalized**, so the ordering is interpretable without reopening Filters.

**Evidence:** Browser probe confirmed checkbox `true` after return. [DiscoverView.vue:29](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/DiscoverView.vue:29), [DiscoverView.vue:51](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/DiscoverView.vue:51).

### F21 — Medium · Manual stop entry can be dismissed without draft protection

**Source finding:** Custom-place fields live inside the add-stop dialog. Escape, backdrop dismissal, or changing add-source tabs can discard that local form. The profile and availability editors already protect unsaved changes, so this is an inconsistent recovery model for a relatively effortful task.

**Mitigation:** Preserve the draft when closing/reopening or switching tabs. If it must be discarded, ask **Discard this place?** only after meaningful edits. Keep lookup failures, entered address, duration, and checked preview intact on recoverable errors. Explain an ambiguous address match before accepting it automatically.

**Evidence:** [CustomPlaceForm.vue:25](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/CustomPlaceForm.vue:25), [PlanPanel.vue:406](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/PlanPanel.vue:406), [AppDialog.vue:26](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/AppDialog.vue:26).

## Lower-priority clarity and design improvements

### F22 — Low · Profile preferences use an unnecessarily learned interaction

**Observed/code:** A click cycles Not set → Like → Love → Not set, represented by `+` and `++`. This is compact and accessible names do identify the levels, but users must learn and remember the cycle. The page also unconditionally says **This is a demo account**, including in its hosted source branch, and describes Home area only as a solo-plan default although Discover uses it too.

**Mitigation:** Label current levels **Like / Love** in the chips or reveal an explicit three-state choice on selection. Make account copy conditional and describe both uses of Home area. Prefer **Click** or input-neutral wording for this desktop product.

**Evidence:** [ProfileView.vue:90](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/ProfileView.vue:90), [ProfileView.vue:101](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/ProfileView.vue:101), [InterestPicker.vue:22](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/InterestPicker.vue:22).

### F23 — Low · Landing, onboarding, and help repeat the story without enough task handoff

**Observed:** Landing has three animated examples; first sign-in offers a multi-page tour; How it works explains the same journey again. The help page does not finish with a strong contextual action to start or resume a plan.

**Mitigation:** Keep the landing explanation; use optional, task-specific help after entry. Finish How it works with **Create a jio** or **Back to your plan**, depending on context. Test whether the global tour helps first-task success before expanding it. Preserve the existing Pause/Replay controls on landing examples and the reduced-motion behavior; those are already sensible safeguards.

**Evidence:** [LandingView.vue:45](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/LandingView.vue:45), [AppTour.vue:35](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/AppTour.vue:35), [HowView.vue](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/HowView.vue).

### F24 — Low · “Your usual crew” implies people will carry into the next outing

**Observed/code:** Home offers **Jio again** under **Your usual crew**, including people in the accessible label. Creation copies the old title, interests, and start point, while asking the host to share a new link to the same group. It does not carry those people into the new outing.

**Mitigation:** Name the existing feature **Reuse this outing** or explicitly say **Reuse details; invite your friends again** before creation. If repeat-group functionality is later added, distinguish inviting previous members from enrolling them automatically.

**Evidence:** [HomeView.vue:168](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/HomeView.vue:168), [NewHangoutView.vue:69](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/NewHangoutView.vue:69).

### F25 — Low · Desktop composition loses a common alignment and overweights the map

**Observed:** The header/Home content begins around x=136 at 1440 px, while Discover's heading and controls begin around x=16. A wider map workspace is appropriate, but the abrupt heading/gutter change makes the pages feel less related. The landing hero's dominant map can initially position the product as another place finder; its coordination advantage appears mainly in the supporting explanation.

**Mitigation:** Keep a shared alignment for page titles and top controls while allowing the map to expand below. Add a concise landing promise such as **One link for everyone's availability, votes, and final itinerary**. Preserve the warm identity; remove repeated explanation before removing useful whitespace. Treat photography as optional content enhancement, not a prerequisite for a good interface.

**Evidence:** [LandingView.vue:28](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/LandingView.vue:28), [DiscoverView.vue:324](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/views/DiscoverView.vue:324), [AppHeader.vue:159](/home/denz-server/syncthing/syncdata/main-syncthing/VSC/SMU/IS216-WAD2_G2/Group_Project/OpenJio/client/src/components/AppHeader.vue:159).

## What to preserve

- **The visual identity:** consistent color roles, typography, warm surfaces, ticket motifs, and clear primary-button treatment.
- **Task-focused Home hierarchy:** next outing and pending action are useful anchors.
- **Person-level nonresponse transparency:** Free / Can't / No reply is much better than hiding nonrespondents in an attendance percentage. Fix the conflicting cell explanation rather than removing the distinction.
- **Alternative interaction paths:** presets, Undo, keyboard grid navigation, typed ranges, and keyboard stop reordering.
- **Native dialogs and source transparency:** dialog Escape behavior and focus return worked in the inspected cases; listing details explain sample data, missing facts, and source links.
- **Swap impact preview and optional technical detail:** preserve previews of revised timings and keep algorithm comparisons secondary to practical explanations.

## Product ideas worth testing

These are proposals, not findings or prerequisites for fixing the existing experience.

1. **A compact planning summary rail.** Show locked time, available/pending members, expected spend, travel total, unresolved concerns, and one stage-appropriate next action. On desktop this can reduce repeated scanning between the timeline, People, and confirmation box. Keep it shorter than the work it summarizes.
2. **A versioned “What changed?” view.** Present the previous confirmed outing beside the proposed revision: changed stops, new timings, affected votes, and who needs to review. This turns recovery and coordination into a deliberate product capability.
3. **Explain recommendations in decision terms.** “Saturday: 3 available, Jun hasn't replied, about $65–80 each, 44 min travel” is more useful than emphasizing the generation method. Only calculate cost ranges when the data supports them.
4. **A useful final handoff.** Provide a copyable itinerary, calendar export, exact meeting point, source/booking links, and a stable link back to the confirmed plan. Make unresolved booking requirements explicit; plan confirmation must not imply reservations exist.
5. **Rescue failed scheduling gracefully.** If nobody overlaps, show the nearest feasible alternatives and the specific constraint preventing a plan, with an explicit host choice to change dates, duration, or optional attendance. Avoid silently weakening constraints.
6. **A true repeat-group shortcut.** Let hosts reuse outing details and prepare invites to the same crew while keeping each person's acceptance voluntary.

## Recommended implementation order

| Order | Work | Acceptance evidence |
|---|---|---|
| 1 | F01–F04: save-before-lock, current ETA results, honest sample labels, recoverable plan edits | Cancel preserves edits and stage; changed inputs cannot share old ETA; sample offers never say verified; undo/revision restores the intended plan. |
| 2 | F05 if hosted release is in scope; F07–F12 and F15 | Recovery returns to the invite; attendance vocabulary is consistent; a saved suggestion lands in the stated place; unresolved location text cannot silently alter the starting area. |
| 3 | F06, F14, F16–F21 | Arrival/wait/meeting times agree; save stays accessible; keyboard context follows step changes; malformed links recover; both error themes are readable; preferences/drafts survive expected navigation. |
| 4 | F13 and F22–F25; selected product ideas | Representative users can assess commitment, find the next action, and repeat an outing without coaching. |

## Focused user validation

After correcting the reproducible failures, run moderated desktop tasks with intended users who were not involved in building the product. Start with a small pilot, then recruit based on the questions and observed variation; a fixed participant count is not proof of usability.

Ask them to: organize an outing around a friend who must attend; respond to an invite; find and suggest an affordable stop; revise a confirmed plan; and work out where to meet when late. Do not name the controls they should discover. Observe completion, wrong assumptions, hesitation, backtracking, and recovery. Ask them to explain **member**, **going**, **no reply**, **shortlist**, and **confirmed** in their own words. Use these observations to revise the priorities above rather than assigning an arbitrary overall usability score.

## Review references

- Attached UI/UX guide: conceptual model, recognition over recall, heuristic review, cognitive walkthrough, and evidence/severity distinctions.
- [W3C WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/): selected accessibility checks; no conformance claim.
- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md): secondary checks for focus, interaction, navigation state, and forms. Applied selectively to this Vue product; stylistic conventions were not treated as universal usability requirements.
