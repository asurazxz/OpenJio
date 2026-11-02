# OpenJio — database demo

Plan a Singapore outing together: find a common time, choose a feasible route, vote on stops, and help late joiners meet the group. The current UI targets **desktop**.

This is the **`demo` branch**. It hosts a repeatable demonstration with real Supabase accounts and a separate database. OpenJio is an independent personal project; keep service and hosting costs at **$0** using existing hardware.

## Choose the right installation

| Branch | Data and accounts | Fresh-install URL | Setup |
|---|---|---|---|
| `main` | Real accounts you create; live provider listings; no sample seed | `http://localhost:8080` | [Live setup on main](https://github.com/asurazxz/OpenJio/blob/main/README.md) |
| `demo` | Six real demo accounts, five outings, 70 labelled sample listings | `http://127.0.0.1:8082` | Commands below; [full demo guide](docs/DEMO.md) |

Changing branches does **not** switch, copy or reset a database. Containers keep serving their existing images until rebuilt. Separate clones are easiest if you want both installations at once. Only one stack is needed for normal use.

## Start the demo from a fresh clone

Prerequisites: Git, Docker Engine/Desktop with **Compose 2.24+**, and **Node 22.12+**. Docker must be running and your user must be able to run `docker compose`. Internet is required for the first image/dependency build. No provider account, host Python, pnpm or managed Supabase project is needed for this demo.

```bash
git clone --branch demo https://github.com/asurazxz/OpenJio.git OpenJio-demo
cd OpenJio-demo
node scripts/demo.mjs up
```

Open **http://127.0.0.1:8082**, or the `Demo ready:` URL printed by the script. Sign in with **`andrew@demo.openjio.test` / `OpenJioDemo123!`**. Use **`mei@demo.openjio.test`** with the same password in another browser profile to demonstrate shared planning. [All accounts and scenarios](docs/DEMO.md#accounts).

`up` generates private `.env.demo` keys once, builds the six-service `openjio-demo` stack, applies migrations, creates Auth accounts, and seeds the scenarios. **Every `up` reseeds the demo.** Existing normal-installation keys and volumes are not reused.

Outings/events start **14 calendar days after today's Singapore date**, with other scenarios over the following days. On Home, advance the week strip twice to see them. Previous/next arrows browse dates; past dates are dimmed but selectable. Missing weather that far ahead is expected.

## Reset, stop and restart

After signing in, click **Reset demo data** in the header and confirm. This restores the shared profiles, outings, replies, plans, votes and sample listings for everyone, rebased to two weeks ahead. It preserves the six login identities and passwords. Reset is transactional and exists only in the demo database.

```bash
node scripts/demo.mjs status
node scripts/demo.mjs seed   # reset without rebuilding images
node scripts/demo.mjs down   # stop/remove demo containers; keep volumes
node scripts/demo.mjs up     # rebuild/start AND reset again
```

To restart while **preserving demo edits**, use the explicit command instead:

```bash
docker compose -p openjio-demo --env-file .env.demo -f compose.yaml -f compose.demo.yaml up -d --wait
```

For LAN access, customize `APP_BIND`, `APP_PORT` and `APP_URL` in `.env.demo` together, then recreate the containers. [Detailed LAN setup, password changes and troubleshooting](docs/DEMO.md).

## Hosting and development documentation

| Guide | Contents |
|---|---|
| [Demo](docs/DEMO.md) | Fresh setup, six logins, five scenarios, relative dates, reset boundaries, LAN access |
| [Development](docs/DEVELOPMENT.md) | Live installation, provider configuration, ingestion, hot reload and tests |
| [Operations](docs/OPERATIONS.md) | Six-container explanation, ports, start/stop, backups, restore and upgrades |
| [Architecture](docs/ARCHITECTURE.md) | Auth/API/database boundaries, domain rules and algorithms |
| [Project](docs/PROJECT.md) | Product scope, $0 policy, limitations and roadmap |
| [Hosting verification](docs/HOSTING-VERIFICATION.md) | Dated fresh-install, browser and backup/restore checks |
| [Evaluation](docs/EVALUATION.md) | Synthetic algorithm comparisons; not a live-provider benchmark |

This server's demo is **http://192.168.1.100:8082**. Its normal installation is configured for port **8081** and was stopped at the user's request on 3 November 2026; its volumes remain intact. These LAN addresses are specific to this machine, not fresh-install defaults. There is no public deployment in this repository's setup.

For frontend hot reload against this demo:

```bash
pnpm --dir client install --frozen-lockfile
OPENJIO_DOCKER_URL=http://127.0.0.1:8082 pnpm --dir client dev
```

Requires pnpm **12.16.1**; use your actual demo URL if bound to a LAN address. Open Vite's printed URL. On PowerShell set `$env:OPENJIO_DOCKER_URL` first. Do not use `VITE_DATA_MODE=demo`: that is an older browser-only fixture mode, separate from this database demo.

## Verification

```bash
pnpm --dir client install --frozen-lockfile
pnpm --dir server install --frozen-lockfile
pnpm --dir client test
pnpm --dir server test
node --test scripts/tests/*.test.mjs
pnpm --dir client build
```

[Browser and SQL checks](docs/DEMO.md#verification) include an opt-in demo reset and must run only when resetting the demo is intended. General hosted live-catalogue checks expect **no samples**, so they target a separate live test stack.

## Sources and credits

Built with Vue, Vite, Bootstrap, Leaflet, Express, Supabase/PostgreSQL and Python. Fonts: Nunito and DM Sans. OneMap/Singapore Land Authority supplies map tiles/address lookup/routes, Geoapify supplies OpenStreetMap places, and NEA/data.gov.sg supplies weather. Extracted posts retain Telegram/confirmgood source links. Demo offers and landing illustrations are labelled examples, not merchant-verified promotions. Preserve provider attribution.
