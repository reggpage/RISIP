#!/usr/bin/env bash
#
# Build Risip's schema on a plain PostgreSQL instance.
#
# Why this exists:
#   1. The migrations assume Supabase's auth/storage/roles shell, which a plain
#      Postgres does not have. 00_bootstrap.sql provides it.
#   2. The numeric prefixes (0145, 20260824120000, ...) do NOT match the order
#      the migrations were actually written/applied. Git add-order does, so we
#      sort by the commit that first added each file.
#   3. Two migrations are broken as committed (see patches below).
#
# Usage:  DB_NAME=risip PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=postgres \
#           bash supabase/postgres/build.sh
set -euo pipefail

DB_NAME="${DB_NAME:-risip}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
MIG="$ROOT/supabase/migrations"

psql_do() { psql -v ON_ERROR_STOP=1 -q "$@"; }
fail() { echo "FAILED: $1"; cat /tmp/risip_mig.err; exit 1; }

echo "==> recreating database $DB_NAME"
psql_do -d postgres -c "drop database if exists $DB_NAME;"
psql_do -d postgres -c "create database $DB_NAME;"

echo "==> applying bootstrap (Supabase shell: roles, auth, storage, schemas)"
psql_do -d "$DB_NAME" -f "$HERE/00_bootstrap.sql"
psql_do -d "$DB_NAME" -c "alter database $DB_NAME set search_path = public, extensions;"

echo "==> computing git add-order of migrations"
ORDER_FILE="$(mktemp)"
trap 'rm -f "$ORDER_FILE"' EXIT
for f in "$MIG"/*.sql; do
  ts="$(git -C "$ROOT" log --diff-filter=A --format=%ct -- "$f" | tail -1)"
  [ -z "$ts" ] && ts=0
  printf '%s\t%s\n' "$ts" "$f" >> "$ORDER_FILE"
done
LC_ALL=C sort -k1,1n -k2,2 "$ORDER_FILE" | cut -f2 > "$HERE/migrations.order"

N=$(wc -l < "$HERE/migrations.order")
echo "==> applying $N migrations in git order"
pass=0
skipped=0
while read -r f; do
  tmp="$(mktemp "$HERE/.mig.XXXXXX.sql")"
  trap 'rm -f "$ORDER_FILE" "$HERE"/.mig.*.sql' EXIT
  cp "$f" "$tmp"
  psql -v ON_ERROR_STOP=1 -q -d "$DB_NAME" -f "$tmp" >/tmp/risip_mig.err 2>&1 \
    || fail "$f"
  rm -f "$tmp"
  pass=$((pass+1))
done < "$HERE/migrations.order"

echo "==> applied $pass migrations, skipped $skipped"
echo "==> schema object count:"
psql_do -d "$DB_NAME" -tAc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','v','m','p')"