# Flexible planning implementation plan

**Goal:** Give hosts control over meeting times and itinerary stops while keeping the project within free API usage.

**Architecture:** Preserve the shared domain engine and Vue components. Add an isolated server Geoapify adapter and itinerary-scoped custom place data. Reuse existing route checks, persistence and modal styles.

**Spec:** ../specs/2026-10-30-flexible-planning-design.md

## Tasks

- [x] Availability: pure slot assessment with tests, previewSlot API, lock-time validation, large responsive comparison dialog and adjusted timing controls.
- [x] Reordering: reusable timeline handles, pointer/touch and keyboard/drop support, tap alternative; wire existing save flow and remove Earlier/Later.
- [x] Geoapify: normalized search/details, cached responses, durable daily budget and rate limits, safe failure handling, tests and credential documentation.
- [x] Custom stops: normalize/validate place inputs, preview/add host operations, itinerary-only persistence in demo and hosted mode, Discover separation, frontend search/manual form and attribution.
- [x] Integration: additive hosted migration, focused browser journeys, complete client/server suites, production build and final review.

## Review focus

Required members must remain available for a whole adjusted slot; stale previews must not enable locking. Custom places must not leak across groups or into Discover. Concurrent searches and server restarts must not reset budget usage. Drag failure/cancellation must not save a changed order. Missing café hours must remain unknown, not appear verified.

## Execution

User authorized implementation and 6-Luna medium subagents. Availability, timeline interaction and Geoapify adapter/docs are delegated to those agents; parent integrates domain persistence, custom place UI, and verifies the complete flow. Keep unrelated working-tree changes and leave the final changes uncommitted for review.

## Verification result

87 client tests passed; 33 server tests passed with one optional Docker test skipped. All 32 scoped desktop/phone browser checks and the production build passed. Local Postgres applied all migrations and exercised custom-stop persistence, reorder/reopen, Discover privacy and RPC grants. Live Geoapify search/details succeeded for Peranakan Museum, and repeated lookups did not increase the provider counter. Nirvana Dessert Cafe was not found; manual entry covers missing venues. No hosted migration deployment or commits were performed.
