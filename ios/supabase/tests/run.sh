#!/usr/bin/env bash
# Tests setup.sql's access rules on a throwaway local Postgres (16 or later).
#
#   ios/supabase/tests/run.sh
#
# Loads a minimal stand-in for Supabase's auth and storage schemas, a database
# as the earlier open setup.sql left it, then setup.sql twice (it must be safe
# to re-run), then the checks in rls_test.sql.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'pg_ctl -D "$tmp/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT

initdb -D "$tmp/db" -U postgres --auth=trust >/dev/null
pg_ctl -D "$tmp/db" -o "-k $tmp -c listen_addresses='' -c wal_level=logical" -l "$tmp/postgres.log" -w start >/dev/null

export PGOPTIONS='-c client_min_messages=warning'
run() { psql -h "$tmp" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null; }
run "$here/supabase_stub.sql"
run "$here/legacy_data.sql"
run "$here/../setup.sql"
run "$here/../setup.sql"
psql -h "$tmp" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -o /dev/null -f "$here/rls_test.sql"
