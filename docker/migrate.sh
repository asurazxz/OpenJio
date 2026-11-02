#!/bin/sh
set -eu
test -n "${PGPASSWORD:-}" || { echo 'Run docker compose run --rm setup, then pass --env-file .env.docker.' >&2; exit 1; }
batch=$(mktemp)
trap 'rm -f "$batch"' EXIT
cat > "$batch" <<'SQL'
\set ON_ERROR_STOP on
select pg_advisory_lock(7261102026);
create schema if not exists openjio_migrations;
revoke all on schema openjio_migrations from public, anon, authenticated;
create table if not exists openjio_migrations.applied(name text primary key, checksum text not null, applied_at timestamptz not null default now());
SQL
for migration in /migrations/*.sql /extra-migrations/*.sql; do
  [ -f "$migration" ] || continue
  name=$(basename "$migration")
  case "$name" in *[!a-zA-Z0-9_.-]*) echo 'Invalid migration filename' >&2; exit 1;; esac
  checksum=$(sed 's/\r$//' "$migration" | sha256sum | cut -d ' ' -f 1)
  cat >> "$batch" <<SQL
select exists(select 1 from openjio_migrations.applied where name='$name') as applied,
  coalesce((select checksum='$checksum' from openjio_migrations.applied where name='$name'),false) as matches \gset
\if :applied
  \if :matches
    \echo Already applied: $name
  \else
    \echo ERROR: Applied migration changed: $name. Restore it; add a new migration instead.
    -- With ON_ERROR_STOP this produces a nonzero exit; psql 17 ignores
    -- arguments to \quit and otherwise reports a successful migration run.
    select 1/0;
  \endif
\else
  \echo Applying: $name
  begin;
  \i $migration
  insert into openjio_migrations.applied(name,checksum) values('$name','$checksum');
  commit;
\endif
SQL
done
psql -X -f "$batch"
