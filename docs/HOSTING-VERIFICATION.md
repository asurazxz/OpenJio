# Hosting verification — 3 November 2026

These are dated checks of the branch documentation/source snapshots, not permanent account counts or a public hosting claim. Repeat the commands in [Development](DEVELOPMENT.md#verification) and the demo branch guide after changing code.

## Fresh live installation

A local source copy without `.env`, generated keys, caches or pipeline output built and started under temporary project `openjio-docs-live`, loopback port 18083. Its eight migrations completed. It had no sample seed/reset schema.

- Client: 146 tests passed.
- Server: 80 passed, one optional SQL test skipped.
- Setup/import/write-guard scripts: six passed.
- Production frontend and Docker API/web builds passed.
- HTTP smoke created three accounts and two outings and passed membership, planning, voting, finalization, permission and last-seat checks. Live-place persistence was skipped because the fresh catalogue was empty.
- Logical database dump and provider/output archive commands passed. Restore as `postgres` exposed an event-trigger ownership failure; the documented restore now uses the container-local `supabase_admin` role and passed. After restart the three accounts, two outings and eight migration records remained, with zero listings and no demo reset RPC.
- Three read-only desktop hosted checks passed after restore: old-browser-demo isolation, shared live-only catalogue and unavailable-config recovery.

No provider credential is bundled. Fresh empty Discover was expected; this did not benchmark external providers or recreate the existing machine's 223-record historical snapshot.

## Fresh database demo

A second source copy with fresh keys and volumes built/started with the same Compose files/overlay as the helper, under temporary project `openjio-docs-demo`, loopback port 18084. A unique test project name kept the running presentation demo unchanged.

- Client: 146 tests passed.
- Server: 88 passed, two optional SQL tests skipped.
- Setup/import/write-guard scripts: six passed.
- Docker API/web builds passed.
- Real Auth bootstrap returned six accounts, five outings and 70 labelled sample listings, anchored to 17 November 2026 (Singapore 3 November + 14 days).
- Desktop browser check passed Andrew/Mei sign-in, shared seeded votes, cancel/confirm reset, relative-date response and reload persistence. It reset only the disposable demo.

The standalone optional demo SQL rollback/grant check was run during the earlier implementation verification; it was not rerun on the presentation database for this documentation task. Public HTTPS, SMTP/recovery, mobile behavior and complete offline operation were not part of these checks.

## Repository and existing installation boundaries

README/setup/operations links and local anchors were checked on both branch snapshots. Shared hosting work was recorded on `main`; demo-only scripts, SQL, services and controls were recorded on `demo` above that shared baseline. Generated environments and database/cache exports are excluded from both commits.

The disposable verification projects and their volumes were removed afterwards. The existing `openjio-demo` presentation stack remains running; the existing `openjio` live stack remains stopped with its volumes retained. Branch commits are local until explicitly pushed to the Git remote.
