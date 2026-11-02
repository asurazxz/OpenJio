# Development and live installation

Updated 3 November 2026. [Project](PROJECT.md) records scope and the $0 operating policy; [Architecture](ARCHITECTURE.md) explains the implementation; [Operations](OPERATIONS.md) covers persistence, backups and upgrades.

The live setup below uses branch **`main`** and Compose project **`openjio`**. For repeatable sample data, use branch **`demo`** and its [demo guide](https://github.com/asurazxz/OpenJio/blob/demo/docs/DEMO.md). Both use real Supabase Auth/PostgreSQL; only the separate demo installation has seeded accounts and a reset button.

## Fresh live installation

Requirements: Git and Docker Engine/Desktop with **Compose 2.24+**. Docker must be running, your user must have access to it, and the first build needs internet. Docker installs pinned Node, pnpm and Python dependencies; host Node/Python is unnecessary for the live installation.

```bash
git clone --branch main https://github.com/asurazxz/OpenJio.git OpenJio-live
cd OpenJio-live
cp .env.example .env
docker compose run --rm setup
docker compose --env-file .env.docker up --build -d --wait
```

PowerShell: use `Copy-Item .env.example .env`. Copy the example only on first setup; never overwrite an existing `.env` to update code. `setup` generates `.env.docker` once and validates/preserves it on later runs. Defaults are `APP_BIND=127.0.0.1`, `APP_PORT=8080`, `APP_URL=http://localhost:8080`.

Open **http://localhost:8080**, create your own account and complete your profile. There are no default live credentials, pre-created users, outings or sample listings. Create another account in a separate browser profile to test invitation and shared planning. Tabs in one profile share the same Auth session. Local signup auto-confirms email; SMTP/recovery and public HTTPS are not configured by this recipe.

Check startup:

```bash
docker compose --env-file .env.docker ps
curl --fail http://localhost:8080/api/ready
```

Expected readiness: `{"ok":true,"mode":"supabase"}`. A successful readiness response means the API is listening; verify sign-in and Discover too. The migrate service is a successful one-shot job, not a seventh continuously running service.

## Live data: empty first, then provider input

A fresh Git clone contains **no exported live records or private credentials**. Empty Discover is expected until real sources are configured. Reproducing the hosting does not reproduce this machine's changing provider snapshot or user accounts. For an exact authorized copy of an existing installation, use [backup and restore](OPERATIONS.md#backup-and-restore).

1. Add your own provider values to root `.env` using the table below. `GEOAPIFY_API_KEY` enables the venue catalogue; without it the Geoapify catalogue does not load even if a cache file exists. OneMap enables geocoding/transit routing. Public post previews can be fetched without Telegram login; Gemini is optional.
2. Recreate the API so changed environment values take effect:

   ```bash
   docker compose --env-file .env.docker up -d api
   ```

3. Open Discover to read the shared catalogue. Venue refresh is asynchronous and may take time. Inspect `/api/places/catalogue/status` and API logs for refresh/count/errors.
4. Fetch/extract and publish current deals/events through the complete server workflow:

   ```bash
   docker compose --env-file .env.docker exec api node /app/scripts/run-ingest.mjs
   docker compose --env-file .env.docker logs -f api
   ```

5. Inspect `/api/ingest/status`, wait for completion, then refresh Discover. The trigger returns before extraction finishes. Source failures, missing fields, malformed windows and expired posts can reduce visible results; missing data never falls back to fabricated offers.

To schedule future runs, set `INGEST_ENABLED=true` in `.env`, choose `INGEST_INTERVAL_HOURS` and `INGEST_LIMIT`, and recreate `api`. The example leaves scheduling **off**. Provider free-tier eligibility and account limits must satisfy the $0 policy before enabling calls. Search/details and catalogue refresh share a durable 1,000-call/day application allowance; this is not a universal billing guard.

### Import existing local source files

Optional: place an authorized existing cache under `server/.cache/` and pipeline JSON under `pipeline/out/`, then run:

```bash
docker compose --env-file .env.docker run --rm import-data
docker compose --env-file .env.docker restart api
```

The importer validates JSON and copies only absent destination files. Known caches are `geoapify-results.json`, `routes.json`, `geoapify-quota.json` and `places-catalogue.json`; pipeline `*.json` files are copied. It does not overwrite existing volume contents or import users/plans. Provider keys are still required for key-dependent features. Shared live synchronization happens through the API when listings are read. Do not delete quota files to bypass limits.

## Configuration and credentials

| File | Purpose | Handling |
|---|---|---|
| `.env` | Provider values and optional Vite target | Private, ignored; start from `.env.example` |
| `.env.docker` | Live DB password, JWT/anon/service keys, bind/port/URL | Generated once; retain with live volumes |
| `.env.demo` | Independent demo keys, bind/port/URL and demo password | Generated only by demo setup; retain with demo volumes |
| `/config.json` | Runtime browser connection URL and public anon key; demo branch also exposes a boolean demo flag | Public, generated by web container; no service-role/password secrets |

Never put provider secrets, DB passwords, sessions or service-role keys in `VITE_` variables. Do not commit generated environments, provider output, database dumps or credentials. Keep machine-specific generated files out of Syncthing synchronization; Docker volumes are not portable live database files. Regenerating keys does not rotate an initialized database's passwords automatically.

| Variable in `.env` | Purpose |
|---|---|
| `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` | Server geocoding/transit routes; [register with OneMap](https://www.onemap.gov.sg/apidocs/register). Tiles need no login. |
| `GEOAPIFY_API_KEY` | [Geoapify project](https://myprojects.geoapify.com/) for venue catalogue/search/details. Keep the account on the intended free allowance and retain attribution. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Optional extraction via [AI Studio](https://aistudio.google.com/apikey). Code default `gemini-3.5-flash-lite`; leave key empty for regex extraction. Confirm actual model availability/free eligibility before enabling. |
| `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION` | Optional Telethon login from [Telegram](https://my.telegram.org/), created with `pipeline/telegram_login.py`. Public previews do not require it. Treat sessions as passwords. |
| `INGEST_ENABLED`, `INGEST_INTERVAL_HOURS`, `INGEST_LIMIT` | Schedule flag, interval 1–6 hours (default 2), posts per source (default 15). |
| `INGEST_RUN_TOKEN` | Server-only HTTP operator token. Compose overrides it with its generated service-role value. The in-container trigger keeps it out of shell history/browser code. |
| `PIPELINE_PYTHON` | Docker sets `/opt/venv/bin/python`; optional host interpreter override. |
| `OPENJIO_DOCKER_URL` | Vite proxy target only, default `http://127.0.0.1:8080`; use actual live or demo URL. |

Geoapify search/details caches last 24/6 hours; catalogue refresh is weekly. The shared local daily allowance resets at UTC midnight (08:00 Singapore). Separate installations do not coordinate an account-wide quota. Gemini pacing cannot enforce a dollar limit on a paid account.

## LAN hosting and current server

Edit only the access entries in `.env.docker`, preserving generated secrets. Example for this machine:

```dotenv
APP_BIND=192.168.1.100
APP_PORT=8081
APP_URL=http://192.168.1.100:8081
```

Use your own host's reachable LAN address. Match port and URL, then run `docker compose --env-file .env.docker up -d --wait`. The bind address must exist on the host; `0.0.0.0` listens on all interfaces but `APP_URL` must still be a reachable hostname/address. Allow the selected web port through your LAN/private-access firewall. The database, Auth, REST and API are private Docker services.

On this server port 8080 belongs to Nextcloud. Live OpenJio uses **8081**, demo uses **8082**. As of 3 November the live stack is deliberately **stopped**, with data retained; only the demo is running. Starting the live command is optional. Existing live accounts belong to their users and are not documented as shared login credentials. No public hosting/domain/TLS deployment is implied. For internet hosting, a separate HTTPS reverse proxy, matching Auth URL and suitable email/recovery setup are required before treating this local recipe as a public service.

## Frontend development

With the chosen Docker stack running, install Node **22.12+** and pnpm **12.16.1** (`npm install --global pnpm@12.16.1`). Check `pnpm --version` before running source commands:

```bash
pnpm --dir client install --frozen-lockfile
pnpm --dir client dev
```

Open Vite's printed URL (normally http://localhost:5173). Vite proxies `/config.json`, `/supabase`, `/backend` and `/api` to Docker; no second host Express process is needed. If Docker uses another URL, set `OPENJIO_DOCKER_URL` in root `.env` or in your shell and restart Vite. For this server use `http://192.168.1.100:8081` for live or `http://192.168.1.100:8082` for demo. Use `--host 0.0.0.0` only when intentionally exposing Vite on your LAN, and allow its port separately.

`VITE_DATA_MODE` defaults to `supabase` in both branch deployments. The explicit `VITE_DATA_MODE=demo` path is an older browser-local test fixture, not the database-backed demo. Old `openjio:*` browser plans/sessions are not migrated to PostgreSQL. Choosing a Git branch alone does not choose a running backend.

## Pipeline development

Docker includes pinned Python dependencies from `pipeline/requirements.lock`. For optional host execution:

```bash
python3 -m venv pipeline/.venv
pipeline/.venv/bin/python -m pip install -r pipeline/requirements.lock
pipeline/.venv/bin/python pipeline/run.py --limit 15
```

On Windows use `python` and `pipeline/.venv/Scripts/python.exe`. See [pipeline commands](../pipeline/README.md). The Python CLI fetches/extracts drafts; the API adds location/publication handling. Unknown fields stay null and malformed drafts may be excluded. The hand-labelled evaluation set is currently empty, so extraction confidence is not measured accuracy.

## Verification

Install dependencies before running source checks:

```bash
pnpm --dir client install --frozen-lockfile
pnpm --dir server install --frozen-lockfile
pnpm --dir client test
pnpm --dir server test
node --test scripts/tests/*.test.mjs
pnpm --dir client build
pnpm --dir client exec playwright install chromium
pnpm --dir client e2e --project=chromium
```

The default desktop journey config explicitly starts historical browser fixtures on isolated port **5176**, without reusing another server. It is not a database test. `pnpm --dir client evaluate` regenerates [Evaluation](EVALUATION.md) from synthetic fixtures; `python3 -m unittest discover -s pipeline/tests` checks Python logic after installing its dependencies.

Read-only hosted checks target a **live-mode** stack with no samples:

```bash
OPENJIO_BASE_URL=http://localhost:8080 pnpm --dir client exec playwright test --config playwright.hosted.config.js local-only.spec.js
```

Account-creating HTTP/browser checks require a disposable live stack and explicit write opt-in. Disable provider credentials/scheduling for that stack; choose a unique Compose project, generated key file and unused port so it has independent volumes. With it already running, for example on loopback port 18081:

```bash
OPENJIO_BASE_URL=http://127.0.0.1:18081 OPENJIO_TEST_ALLOW_WRITES=1 node scripts/test-hosted.mjs
OPENJIO_BASE_URL=http://127.0.0.1:18081 OPENJIO_TEST_ALLOW_WRITES=1 pnpm --dir client exec playwright test --config playwright.hosted.config.js
```

The HTTP smoke creates real accounts/outings and verifies membership, availability, planning, votes, finalization, privacy and the last public seat. Do not run it against data you want to retain. The optional hosted SQL test requires an isolated initialized container with the `openjio-hosted-sql-` prefix via `OPENJIO_TEST_CONTAINER`. Database demo checks have different expectations; use the demo branch's guide.

## Troubleshooting

| Symptom | Check/action |
|---|---|
| No demo accounts or reset button | Use demo URL (8082 by default), not live/Vite's old target. Check branch, image rebuild, `.env.demo` and `node scripts/demo.mjs status` on demo branch. |
| Empty live Discover | Expected without real inputs. Check provider keys, catalogue/ingest status, logs and cache import; wait for async refresh. |
| Missing `.env.docker` | Run `docker compose run --rm setup`; do not replace existing keys when retaining volumes. |
| pnpm version mismatch | Install/activate pnpm 12.16.1; an older Corepack shim may still select another version. Verify `pnpm --version` from `client/`. |
| Docker socket permission denied | Start Docker and configure Docker access for your OS/user; changing application credentials cannot fix it. |
| Bind/port error | Choose an unused port and a host-owned address; update `APP_URL`, recreate and update Vite target. |
| Startup/migration failure | `docker compose --env-file .env.docker logs migrate auth db`; fix cause without erasing volumes/history. |
| Changed migration checksum | Restore the applied SQL file from the matching release; add an additive migration instead. |
| Missing forecast | Dates two weeks ahead exceed NEA's forecast horizon. |
| No plan fits | Check opening hours, travel, meal requirements and the live-routing limitation in Project. |

For stopping the right stack, backups, restore and upgrading, use [Operations](OPERATIONS.md).
