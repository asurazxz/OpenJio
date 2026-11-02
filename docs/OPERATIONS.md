# Hosting operations

Both branch installations run on existing hardware. Use [Development](DEVELOPMENT.md) for fresh live setup and the [demo branch guide](https://github.com/asurazxz/OpenJio/blob/demo/docs/DEMO.md) for seeded setup. Docker Engine/Desktop with Compose 2.24+ is required.

## Select one installation explicitly

All commands must run from the correct checkout. The following Bash function is a shorthand used throughout this page. Define **one** version for the installation you intend to operate:

```bash
# main / live
oj() { docker compose -p openjio --env-file .env.docker -f compose.yaml "$@"; }
```

Or, from a `demo` checkout:

```bash
# demo only
oj() { docker compose -p openjio-demo --env-file .env.demo -f compose.yaml -f compose.demo.yaml "$@"; }
```

On other shells, replace `oj` with the corresponding full `docker compose ...` prefix. A branch checkout does not stop/rebuild containers or select a database automatically. Do not use `-p openjio` with the demo overlay. Project names select independent named volumes; keep the matching generated key file with each installation.

## Why six containers?

| Service | Responsibility | Host exposure |
|---|---|---|
| `web` | Built Vue app, public runtime config, reverse proxy | Only published web port |
| `api` | Express application rules, provider access, ingestion | Docker network only |
| `supabase` | Internal gateway for Auth and REST | Docker network only |
| `rest` | PostgREST database RPC transport | Docker network only |
| `auth` | Real email/password identities and tokens | Docker network only |
| `db` | PostgreSQL: users, catalogue, planning data | Docker network only |

All six support one working installation. `migrate` exits successfully after applying pending SQL; `setup`, `import-data` and `smoke` are optional one-shot tools. Running live and demo simultaneously needs twelve long-running containers; routine use can keep only one stack running.

Fresh live defaults to loopback port **8080**, fresh demo to **8082**. On the current LAN host, Nextcloud uses 8080, live OpenJio is configured on **8081**, and demo on **8082**. As of 3 November 2026, live is stopped with data preserved and the six demo services are running. Keep unrelated containers unchanged.

## Routine commands

After defining the correct `oj` above:

```bash
oj ps
oj logs --tail=100 api auth migrate
oj stop                 # stop this installation; retain containers and volumes
oj up -d --wait          # restart, without seeding
oj down                 # remove this installation's containers/network; retain volumes
```

For a demo reset, sign in to a registered demo account and use the header button, or run `node scripts/demo.mjs seed` in the demo checkout. `node scripts/demo.mjs up` rebuilds **and reseeds**; explicit Compose `up` preserves edits.

Do not use `down -v` for routine operation: it permanently deletes this project's database/configuration and provider/output volumes. Do not regenerate `.env.docker`/`.env.demo` while retaining initialized volumes; generated passwords/signing keys must still match them.

## Persistence and changing hosts

| Volume | Contents |
|---|---|
| `database` | PostgreSQL users, Auth identities, profiles, plans, catalogue and migration history |
| `database-config` | PostgreSQL image configuration |
| `provider-cache` | Venue/search/route caches and daily provider allowance ledger |
| `pipeline-output` | Fetched/extracted publication JSON |

Docker prefixes these names with the project name. `git clone`, `git switch` and rebuilding images do not transfer their contents. Do not synchronize a running PostgreSQL data directory with Syncthing or copy a volume between PostgreSQL versions. Use a logical database dump plus the matching private environment files and source-output archives.

## Backup and restore

Use a private backup directory **outside the repository**. The commands below are Bash examples, with `oj` already selecting the intended installation. They stop application writers for a consistent snapshot; `db` remains running.

```bash
umask 077
mkdir -p ../openjio-backup
oj stop web api supabase rest auth
oj exec -T db pg_dump -U postgres -Fc -d postgres > ../openjio-backup/database.dump
oj run --rm -T --no-deps --entrypoint tar api -czf - -C /app/server/.cache . > ../openjio-backup/provider-cache.tar.gz
oj run --rm -T --no-deps --entrypoint tar api -czf - -C /app/pipeline/out . > ../openjio-backup/pipeline-output.tar.gz
```

Check each command succeeded before continuing. Copy the selected private key file (`.env.docker` for live or `.env.demo` for demo) and optional `.env` to that private directory. Record the Git commit with `git rev-parse HEAD` and the project type. Protect these files as credentials: the dump includes identities and personal data. Finish by restarting with `oj up -d --wait`. Keep dated backups separately rather than overwriting your only copy.

Restore only into an **isolated replacement installation of the same type and revision**, with the same PostgreSQL image version. First copy its matching environment files from the backup, configure its new bind/port/URL as necessary, and choose a distinct Compose project name if the source still exists. Start `db`/`auth` and migrations with the matching Compose files so roles/extensions/schemas exist, then stop every service except `db`. Do not run the demo helper `up` after restoring, because it reseeds.

With `oj` now selecting only that replacement:

```bash
oj stop web api supabase rest auth
oj exec -T db pg_restore -U supabase_admin -d postgres --clean --if-exists --exit-on-error < ../openjio-backup/database.dump
oj run --rm -T --no-deps --entrypoint tar api -xzf - -C /app/server/.cache < ../openjio-backup/provider-cache.tar.gz
oj run --rm -T --no-deps --entrypoint tar api -xzf - -C /app/pipeline/out < ../openjio-backup/pipeline-output.tar.gz
oj up -d --wait
```

Use fresh empty cache/output volumes for the replacement so obsolete files cannot survive extraction. Restore uses the container-local `supabase_admin` database role because Supabase event triggers are not owned by the application `postgres` role. It preserves table owners, grants, Auth identities, migration checksums and demo markers. Verify readiness, sign-in, representative outing data and catalogue before changing traffic. A failed restore must be investigated on the replacement; never test a restore over the only live copy. Treat a demo backup as demo data; never restore it into the live installation.

## Updating code and schema

Back up first and keep the private environment files. Review changes and use a clean checkout on the intended branch; fetch/fast-forward rather than overwriting local work. Then:

```bash
oj up --build -d --wait
oj ps
oj logs --tail=100 migrate api
```

For the demo, this explicit Compose command updates images without resetting. If a refreshed baseline is wanted, run `node scripts/demo.mjs seed` afterwards. Running the helper `up` combines the two actions.

Migrations run after Auth initializes and before REST/API. Each pending file is transactional, and applied SQL names/hashes are recorded. Do not edit applied SQL or erase migration history to bypass checksum checks. Add a new migration for a schema change. If an update fails, inspect `oj logs migrate auth db` and fix the cause while retaining volumes. Reverting code does not undo a schema migration; restore compatibility or an isolated backup before switching traffic.

## Access checks

Only publish the web port. Match `APP_BIND`, `APP_PORT` and `APP_URL` for the selected environment, recreate containers, and update `OPENJIO_DOCKER_URL` if Vite is used. Check the configured origin's `/api/ready`, sign-in page, Discover and a shared outing. The local recipe has automatic email confirmation; public HTTPS and email recovery require a separate deployment configuration. No paid hosting or provider upgrade is part of this setup.
