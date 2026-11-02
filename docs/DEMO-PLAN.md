# Database-backed demo plan

Use the existing Supabase/Postgres architecture in a separate `openjio-demo` Compose project with separate volumes, keys and port. Preserve the ordinary `openjio` database and all current working-tree changes. Seed six genuine Auth identities: Andrew and five friends. Keep their identities stable across resets so sessions remain valid.

Reset rebuilds profiles, interests, sample catalogue, group memberships, availability, suggestions, itineraries and votes as one database transaction. Outings and events start 14 Singapore calendar days after the server's current date. Offers cover that future period. Sample records stay explicitly labelled. The button requires a verified demo account, a server feature flag and a database marker installed only in the demo project. No reset RPC is installed on the normal database.

Implementation checklist:

- [x] Build and test a relative-date fixture generator using the existing planning engine.
- [x] Add demo-only SQL initialization/reset with explicit service-role grants and atomic replacement.
- [x] Add demo bootstrap/configuration and a separate Compose project with ingestion disabled.
- [x] Expose authenticated reset and demo capabilities; add confirmation/loading/error handling in the header.
- [x] Start the isolated stack, seed Auth/database, test reset twice and verify normal-stack counts are unchanged.
- [x] Verify the complete browser flow and document demo credentials, URL and commands.

Verified: six real logins; five outings and 70 sample listings; browser confirmation/cancel/reset and member voting; atomic failed-reset rollback; browser RPC grants; relative dates across year/leap boundaries. Normal database counts stayed at one account, zero outings and 223 listings. Validation also fixed a hosted getPlan refresh loop exposed by the populated demo.
