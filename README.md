# OpenJio

**Plan a Singapore outing together.** Find a time that works, agree on stops, and share one clear plan with everyone.

OpenJio helps a group go from *“free this weekend?”* to *“see you there.”* Everyone gets one link for availability, votes, and the final itinerary.
The current UI is designed for desktop use.

![OpenJio landing page showing a sample Marina Bay outing](docs/images/landing-page.png)

## How it works

1. **Find a time:** everyone marks when they are free; the best overlap rises to the top.
2. **Shape the plan:** review the stops, vote to keep or swap them, and confirm the group plan.
3. **Meet up:** share the itinerary, with an estimate to help late joiners catch up.

The examples below are clearly labelled illustrations using made-up people and places. They are separate from live listings.

![OpenJio's three illustrated planning steps](docs/images/how-it-works.png)

<details>
<summary>Watch the examples animate</summary>

![Animated walkthrough of OpenJio's time, plan, and late-join examples](docs/images/how-it-works.gif)

</details>

## Tech stack

<p>
  <a href="https://vuejs.org/"><img alt="Vue 3" src="https://img.shields.io/badge/Vue.js-3-4FC08D?style=for-the-badge&logo=vuedotjs&logoColor=white"></a>
  <a href="https://vite.dev/"><img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white"></a>
  <a href="https://getbootstrap.com/"><img alt="Bootstrap" src="https://img.shields.io/badge/Bootstrap-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white"></a>
  <a href="https://leafletjs.com/"><img alt="Leaflet" src="https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white"></a>
  <a href="https://nodejs.org/"><img alt="Node.js" src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"></a>
  <a href="https://expressjs.com/"><img alt="Express" src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white"></a>
  <a href="https://supabase.com/"><img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white"></a>
  <a href="https://www.postgresql.org/"><img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white"></a>
  <a href="https://www.python.org/"><img alt="Python" src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white"></a>
  <a href="https://www.docker.com/"><img alt="Docker Compose" src="https://img.shields.io/badge/Docker_Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white"></a>
</p>

OneMap/Singapore Land Authority supplies maps, address lookup and routes. Geoapify supplies OpenStreetMap places, and NEA/data.gov.sg supplies weather.

## Choose the right installation

This is the **`demo` branch**. It hosts a repeatable demonstration with real Supabase accounts and a separate database. OpenJio is an independent personal project; keep service and hosting costs at **$0** using existing hardware.

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

Fonts: Nunito and DM Sans. Deals and events retain links to their public Telegram/confirmgood sources; preserve provider attribution. Landing illustrations and synthetic algorithm fixtures are labelled examples, separate from the live catalogue. Demo offers are labelled examples, not merchant-verified promotions.
