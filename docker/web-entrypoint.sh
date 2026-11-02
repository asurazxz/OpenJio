#!/bin/sh
set -eu
test -n "${SUPABASE_ANON_KEY:-}" || { echo 'Missing local keys. Run the setup service and use --env-file .env.docker.' >&2; exit 1; }
# The generated legacy anon key is a base64url JWT, never a server credential.
case "$SUPABASE_ANON_KEY" in *[!A-Za-z0-9_.-]*) echo 'Invalid anon JWT' >&2; exit 1;; esac
demo=false
if [ "${OPENJIO_DEMO_ENABLED:-}" = "1" ]; then demo=true; fi
printf '{"supabaseUrl":"/supabase","supabaseAnonKey":"%s","demoEnabled":%s}\n' "$SUPABASE_ANON_KEY" "$demo" > /usr/share/nginx/html/config.json
