# Flexible manual planning

Approved scope: editable recommendations, a large overlap comparison view, Geoapify Free business/place search with manual fallback, and drag-to-reorder itinerary stops. Keep the existing availability editor, visual language, regeneration and permission rules.

## Decisions

- Recommended times seed a custom date/start/end editor. Preview attendance on the trusted engine; require the full chosen interval to fit required members' submitted availability and the planning dates. Unknown is distinct from unavailable. Lock validates again.
- Show on grid and View group overlap open a large dialog with the grid and time controls side by side on desktop and stacked on phones. A selected recommendation is highlighted without scrolling the underlying page.
- Add a stop offers From Discover, Find a place and manual entry. Geoapify searches Singapore amenities and returns available details. Duration and meal/activity classification remain the host's choice. Opening hours are never invented; provider text is informational, and host-entered hours participate in fit checks.
- Custom places are scoped to the itinerary, survive reloads and hosted requests, and never become public Discover listings. Host-only mutations, six-stop limit, validation, voting resets and final-plan reopening apply equally to these stops.
- Geoapify uses a server-only key, no paid fallback, attribution, conservative rate limits and a persisted daily counter capped below the free 3,000 credits/day. Manual entry remains usable without a key or when the provider fails. A dedicated project/key is required for budget accounting; other deployments must share the counter or divide the budget.
- Reorder using a visible drag grip, pointer/touch support, keyboard pickup/move/drop/cancel and a tap-accessible position control. Remove Earlier/Later buttons. Save only completed changes and recompute route timings with the existing engine.

## Alternatives considered

Google Places was rejected because the user requires $0 costs. OneMap-only lookup does not adequately meet café-name discovery; retain it for manual address resolution. A small inline overlap grid was rejected because it requires scrolling and leaves too little comparison space.

## Validation

Test edited-slot conflicts and unknown members, custom-place permissions/privacy/persistence/fit, concurrent quota exhaustion and restart, stale search responses and provider failures, actual pointer/keyboard reorder, and desktop/mobile layouts. Run client/server suites and a production build. Live Geoapify checks require the user's new key; injected HTTP fixtures verify integration without paid calls.
