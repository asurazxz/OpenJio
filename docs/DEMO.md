# Isolated database-backed demo

Use branch **`demo`**. This is a real shared Supabase database, separate from the live `openjio` installation. It does not use the old browser persona picker. [README](../README.md) provides the quick start; [Operations](OPERATIONS.md) covers backups and container responsibilities.

## Fresh installation

Install Git, Docker Engine/Desktop with **Compose 2.24+**, and **Node 22.12+**. Start Docker and ensure your user can run it. No live provider keys, host pnpm/Python or managed cloud project is needed. First build downloads images and dependencies.

```bash
git clone --branch demo https://github.com/asurazxz/OpenJio.git OpenJio-demo
cd OpenJio-demo
node scripts/demo.mjs up
```

The helper fixes the Compose project to **`openjio-demo`** and uses **`.env.demo`**, `compose.yaml` and `compose.demo.yaml`. It generates independent credentials once, builds/starts six services, applies eight shared migrations and two demo-only migrations, creates six real Auth identities and seeds five scenarios. `up` reseeds on **every** invocation; it is not a data-preserving restart.

A clean install binds **127.0.0.1:8082**. Open the printed `Demo ready:` URL. If `.env.docker` already exists, the helper copies only its `APP_BIND` access setting; database/signing secrets remain independent. A `0.0.0.0` bind defaults the printed URL to localhost until configured for remote access. `.env` is optional for demo startup; provider keys and ingestion are disabled by the overlay.

## Accounts

All six default accounts use **`OpenJioDemo123!`**:

| Email | Person |
|---|---|
| `andrew@demo.openjio.test` | Andrew — presenter/host |
| `mei@demo.openjio.test` | Mei Lin |
| `arjun@demo.openjio.test` | Arjun Nair |
| `farah@demo.openjio.test` | Farah Ismail |
| `jun@demo.openjio.test` | Jun Hao Tan |
| `priya@demo.openjio.test` | Priya Raman |

These logins exist only in the demo DB, not live. Use Andrew in one browser profile and Mei in another to show shared plans/votes. Tabs in the same profile share Auth state. They are ordinary real Auth identities with stable UUIDs, not a client-side impersonation menu.

To choose another initial password, create `.env.demo` before first bootstrap: run `node scripts/setup-docker.mjs` in a new empty temporary directory, copy its generated `.env.docker` into the demo checkout as `.env.demo`, set `APP_BIND`, `APP_PORT=8082` and matching `APP_URL`, and append `OPENJIO_DEMO_PASSWORD=your-password`. Then run the normal helper. Merely changing this value after accounts exist does **not** rotate their passwords; resets deliberately preserve logins. Keep generated keys private and do not reuse the live key file.

## Dates and reset behavior

After sign-in, use **Reset demo data** in the header and confirm. It resets this shared demo for all participants, including user changes to profiles, interests, outings, memberships, availability, shortlists, plans, votes and the sample catalogue. The six identities/passwords remain. New ad hoc Auth accounts are not one of the registered six and cannot trigger reset; their demo outing data is still part of the shared reset scope.

The server anchors the first outing/event on **today's Singapore date + 14 calendar days**. Other scenarios follow during that week, availability/itinerary dates move with them, and deal validity covers that period. For example, resetting on 3 November 2026 anchors 17 November. The server date is authoritative; a browser refresh does not advance the seed.

On Home, click next week **twice** to reach the seeded events. Older dates are dimmed, marked Past and remain selectable. Distant dates have no weather forecast until within NEA's horizon. Calendar/time display uses Singapore time.

The reset is one PostgreSQL transaction; failure leaves the previous scenario intact. Server demo enablement, a real registered Auth identity, and the private database marker are all required. Only the demo overlay mounts the reset SQL. The ordinary live database has no demo RPC or marker and the live server does not enable the operation. Sample offers remain labelled and are not redeemable/merchant-verified promotions.

## Seeded scenarios

| Scenario | Starting state and useful demonstration |
|---|---|
| Find a time with the crew | Andrew hosts five members; four replies, Jun pending, Farah required; shortlist ready. Compare availability and choose time. |
| Vote on our city afternoon | Generated plan with Mei Keep and Jun Swap votes. Show decisions from independent accounts. |
| Confirmed makan and museum | Final itinerary with City Hall MRT Exit B meeting point. Show sharing, calendar and late-arrival tools. |
| Open Jio: Chinatown food and culture | Priya hosts, three of six seats occupied. Andrew can browse/join. |
| My solo afternoon | Andrew's confirmed solo plan. |

Baseline: **6 Auth accounts, 5 outings, 18 memberships, 13 availability blocks, 12 itinerary stops, 24 votes and 70 sample listings**. Counts can change during a presentation and are restored by reset. Listings include places, events and deals; fixture routes are for demonstrating the planner, not a live transit guarantee. Maps/forecasts can still contact public providers, so complete offline operation is not promised.

## Stop, restart and LAN hosting

```bash
node scripts/demo.mjs status
node scripts/demo.mjs seed   # reset with today's relative dates; no image rebuild
node scripts/demo.mjs down   # stop/remove only demo containers; retain volumes
node scripts/demo.mjs up     # build/start AND reseed
```

To preserve demo edits through a stop/start, use the explicit Compose selection:

```bash
docker compose -p openjio-demo --env-file .env.demo -f compose.yaml -f compose.demo.yaml stop
docker compose -p openjio-demo --env-file .env.demo -f compose.yaml -f compose.demo.yaml up -d --wait
```

For LAN access, edit the three access settings in `.env.demo`, keeping the generated secrets. Example for this server:

```dotenv
APP_BIND=192.168.1.100
APP_PORT=8082
APP_URL=http://192.168.1.100:8082
```

Use your own host's address, allow that web port through your private-access firewall, then run the data-preserving `up -d --wait` command above. It recreates changed containers without reseeding. If you need a different port before first start, generate `.env.demo` manually as described under Accounts, then set the access values before running the helper.

For both installations at once, use separate clones, distinct ports, distinct key files and the documented project names (`openjio`, `openjio-demo`). They have independent named volumes. A branch switch changes code, not a browser session, running image, database or Vite proxy target. See [hot reload](DEVELOPMENT.md#frontend-development) to point Vite at this demo URL. Do not use the old `VITE_DATA_MODE=demo` fixture mode for this deployment.

Never use the live `.env.docker` or project name for demo bootstrap. `down -v` erases the selected project's volumes and is unnecessary for reset; use the header button or `seed` instead. Do not delete `.env.demo` while retaining its DB volume.

## Verification

The normal unit/script/build commands are in [Development](DEVELOPMENT.md#verification). To exercise this database demo after installing client dependencies and Playwright Chromium:

```bash
OPENJIO_DEMO_TEST=1 OPENJIO_BASE_URL=http://127.0.0.1:8082 pnpm --dir client exec playwright test --config playwright.hosted.config.js demo.spec.js
OPENJIO_DEMO_SQL_TEST=1 node --test server/tests/demo-database.test.js
```

Use the actual URL when bound to a LAN address. The browser test signs in as Andrew and Mei, inspects shared votes, cancels a reset, then **confirms a shared reset** and checks the relative date. Run it only when resetting this demo is intended; it assumes the default password. The SQL check targets only `openjio-demo-db-1` and verifies rollback plus browser-role restrictions. The hosted `local-only.spec.js` suite assumes live listings without samples and therefore is not a demo test.

## Troubleshooting

| Symptom | Action |
|---|---|
| No seeded data | Open the printed demo URL, sign in with a `@demo.openjio.test` address, and check `node scripts/demo.mjs status`. If bootstrap failed after startup, fix the log error and run `seed`. |
| Nothing in this week's dates | Advance Home twice; seed starts two weeks ahead. Check all scenario cards, not only today's filter. |
| No Reset demo data button | Verify demo URL/config and sign-in; rebuild via helper if serving an old image. Live intentionally has no button. |
| Sign-in fails | Confirm you are on demo, use the default password unless changed before first seed, and inspect `auth`/`api` logs using the full Compose selection. |
| Port already allocated | Change `.env.demo` access settings together and recreate, or stop the previous demo instance. |
| Reset fails | Inspect API/migrate logs with the explicit project/files/env. Applied migrations cannot be edited in place. |
| Data vanished after restart | `node scripts/demo.mjs up` deliberately reseeds. Use explicit Compose for data-preserving restarts. |

Demo-only SQL files are mounted as final optional migrations by `compose.demo.yaml`. Their checksums are immutable once applied, just like normal migrations. See [Operations](OPERATIONS.md) for backup/restore rather than transferring live database files between machines.
