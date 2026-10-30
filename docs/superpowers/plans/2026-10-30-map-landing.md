# Map landing page implementation plan

**Goal:** Public visitors see the approved map-led hero before choosing account entry; signed-in visitors see the existing Home page.

**Approved design:** A restrained split hero, OpenJio Hawker Glow styling, the headline “From ‘free this weekend?’ to ‘see you there.’”, Get started and Explore the map. Three example locations appear in sequence, a connecting route draws once, then an example itinerary appears. The map stays interactive. Mobile stacks copy above the map. Reduced motion shows the finished composition immediately.

**Architecture:** Keep `/` and its existing `home` route name, selecting LandingView or HomeView through a small EntryView. Reuse MapView with isolated hero animation styles. Preserve authenticated deep links and restore the hosted session before installing the router. Account entry shows real email authentication in Supabase mode and explicitly labelled sample profiles in demo mode.

**Files:** New EntryView, LandingView, LandingMap, landing browser tests. Update router, main initialization, SignInView, AppHeader account labels, and global overflow clipping. No backend schema changes, hosting documentation, new dependencies, commits or deployment.

- [x] Add browser regressions for public landing, interactive example map, account entry and returning sessions, mobile layout and reduced motion; observe failure.
- [x] Build the hero and once-only animation using existing geographic sample places; label the example and illustrative route.
- [x] Wire account entry and session restoration without changing existing Home URLs or invite redirects.
- [x] Run browser checks, client tests, production build and design checks; inspect desktop/mobile screenshots and review the task's changes.

**Review focus:** No automatic redirect away from public landing; no example itinerary written to user data; account confirmation is not treated as a signed-in session; no motion under reduced-motion preferences; CTA and headline visible at desktop height; no clipping of mobile controls; no misleading live activity or availability claims.

**Ruling:** Preserve the approved design system in docs/DESIGN.md rather than deal a new theme. Keep `/` for Home compatibility and select public content by session state. The animated connection illustrates stop order, not a calculated walking route.

## Verification

- Client tests: 79 passed.
- Full browser suite: 54 passed across desktop and mobile. Includes anonymous landing, account entry, returning sessions, reduced motion, keyboard focus restoration, invites, planning and map/tour regressions.
- Production build passed; diff whitespace checks passed.
- Independent scoped review found one keyboard-focus issue; fixed, regression-tested and rechecked with no remaining scoped findings.
- Design source check: zero failures. The approved eight-word headline is retained despite the checker’s seven-word suggestion. Render inspection used Playwright desktop and phone screenshots because the design checker’s Puppeteer renderer is unavailable.
- Supabase email sign-up/sign-in UI calls the existing hosted adapter and handles email confirmation. Live account-provider verification remains pending the new project configuration; the current preview is explicitly demo mode.

## Follow-up: checkpoint route animation

- [x] Replace the partial landing navigation with logo, theme and Sign in; keep Explore the map in the hero and How OpenJio works in the footer.
- [x] Replace the backtracking example with ArtScience Museum, Gardens by the Bay, then Satay by the Bay. The connection is still illustrative rather than a calculated travel route.
- [x] Introduce a finite 10.8-second storyboard: stop card, dismissal, traced leg, then the next checkpoint. The moving point and trace use the map's actual projected coordinates.
- [x] Add pause/resume/replay; pause offscreen or in background tabs; show a completed static map for reduced motion. Manual pin hover, selection, zoom or drag ends the automatic story so users can explore.
- [x] Verify timing boundaries, ordered checkpoints, pause/replay, reduced motion, keyboard focus and existing Discover/tour/responsive flows.

Follow-up verification: 82 client tests passed, 32 scoped desktop/mobile browser tests passed, production build passed, diff checks passed, and independent scoped review found no actionable issues.
