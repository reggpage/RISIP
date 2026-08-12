#!/usr/bin/env bash
# Two-session concurrency harness for the petty-cash float.
#
# WHY THIS EXISTS: every concurrency claim in 0051 and 0065 rests on one row
# lock. A single-connection test cannot observe a lock at all -- it can only
# observe the result of code that happens to run alone. This runs two REAL
# sessions against one float and asserts the loser fails closed.
#
# WHERE IT RUNS: a throwaway database. `supabase start` (needs Docker), or CI.
# It is never pointed at production: it creates and drops its own company.
#
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
#     bash supabase/tests/two_session_concurrency.sh
#
# STATUS: written against the 0062-0065 schema. NOT YET EXECUTED -- the dev
# machine has neither Docker nor psql, so this is committed unrun on purpose
# rather than silently skipped.

set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL to a throwaway database, never production}"

if [[ "$DATABASE_URL" == *"supabase.co"* ]]; then
  echo "refusing to run against a hosted Supabase database" >&2
  exit 1
fi

psql_q() { psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "$1"; }

fixture() {
  psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 <<'SQL'
begin;
delete from companies where name = 'RISIP_CONCURRENCY_TEST';
insert into companies (id, name) values ('11111111-1111-1111-1111-111111111111', 'RISIP_CONCURRENCY_TEST');
insert into profiles (id, company_id, full_name, role)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Float holder', 'worker');
insert into petty_cash_accounts (id, company_id, user_id, current_balance)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', 500000);
commit;
SQL
}

balance() { psql_q "select current_balance from petty_cash_accounts where id='33333333-3333-3333-3333-333333333333';"; }

# ── A. two spends of 400,000 against a 500,000 float ───────────────────────
# 0051's FOR UPDATE must let exactly one through. Before that fix both landed
# and the float went to -300,000.
spend() {
  psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 <<SQL || true
begin;
select pg_sleep($2);
insert into petty_cash_transactions (account_id, amount, type, description, created_by, status)
values ('33333333-3333-3333-3333-333333333333', -400000, 'expense', 'concurrent $1',
        '22222222-2222-2222-2222-222222222222', 'accepted');
commit;
SQL
}

fixture
spend one 0 & spend two 0 & wait
a_balance=$(balance)
[[ "$a_balance" == "100000" ]] \
  && echo "PASS A  one spend won, balance 100000" \
  || { echo "FAIL A  balance is $a_balance, expected 100000"; exit 1; }

# ── B. reversal racing a fresh spend on the same float ─────────────────────
# The reversal RPC takes the account lock FIRST (a positive adjustment does not
# reach petty_cash_guard_balance, so nothing else would lock it). Whichever
# order they run in, the float must never go negative and must end at
# 500,000 - 400,000 + 400,000 - 300,000 = 200,000.
fixture
psql_q "insert into petty_cash_transactions (id, account_id, amount, type, description, created_by, status)
        values ('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333',
                -400000,'expense','to be reversed','22222222-2222-2222-2222-222222222222','accepted');" >/dev/null

reverse() {
  psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 <<'SQL' || true
begin;
select current_balance from petty_cash_accounts
 where id = '33333333-3333-3333-3333-333333333333' for update;
insert into petty_cash_transactions
  (account_id, amount, type, description, created_by, status,
   reverses_transaction_id, reversal_reason)
values ('33333333-3333-3333-3333-333333333333', 400000, 'adjustment',
        'reversal', '22222222-2222-2222-2222-222222222222', 'accepted',
        '44444444-4444-4444-4444-444444444444', 'wrong amount was captured');
update petty_cash_transactions
   set reversed_at = now(), reversed_by_transaction_id = currval_hack.id
  from (select id from petty_cash_transactions
         where reverses_transaction_id = '44444444-4444-4444-4444-444444444444') currval_hack
 where petty_cash_transactions.id = '44444444-4444-4444-4444-444444444444';
commit;
SQL
}

spend300() {
  psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 <<'SQL' || true
begin;
insert into petty_cash_transactions (account_id, amount, type, description, created_by, status)
values ('33333333-3333-3333-3333-333333333333', -300000, 'expense', 'racing spend',
        '22222222-2222-2222-2222-222222222222', 'accepted');
commit;
SQL
}

reverse & spend300 & wait
b_balance=$(balance)
[[ "$b_balance" == "200000" ]] \
  && echo "PASS B  reversal and spend serialised, balance 200000" \
  || { echo "FAIL B  balance is $b_balance, expected 200000"; exit 1; }

negative=$(psql_q "select count(*) from petty_cash_accounts where current_balance < 0;")
[[ "$negative" == "0" ]] \
  && echo "PASS C  no float went negative" \
  || { echo "FAIL C  $negative floats negative"; exit 1; }

psql_q "delete from companies where name = 'RISIP_CONCURRENCY_TEST';" >/dev/null
echo "all concurrency assertions passed"
