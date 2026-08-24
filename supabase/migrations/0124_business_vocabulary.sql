-- RISIP BUCHA, PHASE 3 — how THIS shop talks.
--
-- A butcher says "za mbwa" and means Chakula cha mbwa. The shop next door may
-- say something else entirely, and a third may use "za mbwa" for something we
-- have never heard of. None of that belongs in a shipped dictionary: it is one
-- company's vocabulary, and the database is the only honest place for it.
--
-- ONE TABLE, WITH AN EXPLICIT KIND. The brief asks these be kept apart, and
-- they are — by a column, not by a second table. Both are "this company says X
-- and means Y": company-scoped, one meaning per word, taught the same way,
-- confirmed the same way, audited the same way. Two tables would duplicate the
-- RPCs, the collision rules, the teaching flow and the context assembly to
-- express a difference that is one enum wide.
--
--   product_alias   "za mbwa"  -> a product_key of this company
--   semantic_term   "mzoga"    -> a MEANING, such as stock_loss, plus an
--                                 optional default product when the shop has
--                                 said which one it means
--
-- A third kind, unit_alias ("kifuko"), is deliberately NOT implemented here.
-- A bag holding one kilo is a unit conversion and belongs to product_units,
-- where conversions already live — writing it as vocabulary would be the exact
-- mistake this table is shaped to prevent. The enum has room for it so phase 4
-- can decide; nothing here assumes the answer.
--
-- ROLLBACK:
--   drop function if exists public.wa_forget_business_term(text, text);
--   drop function if exists public.wa_save_business_term(text, text, text, text, text);
--   drop function if exists public.wa_company_vocabulary(uuid);
--   drop table if exists public.business_vocabulary_audit_log;
--   drop table if exists public.business_vocabulary;
--   -- and restore wa_resolve_company_product_read from its previous definition.

create table if not exists public.business_vocabulary (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  kind         text not null check (kind in ('product_alias', 'semantic_term', 'unit_alias')),
  -- Normalised by private.product_key, the SAME helper product identity uses.
  -- A second normalisation algorithm would drift from the first, and every
  -- vocabulary list in this codebase that drifted has cost a real shop a real
  -- bug.
  term_key     text not null,
  -- What the trader typed, kept so replies can quote them back.
  term_display text not null,
  -- For a product_alias: which product. For a semantic_term: optional, the
  -- product the shop means by default, or null when they have not said.
  product_key  text,
  -- For a semantic_term: what the word means to this shop.
  meaning      text check (meaning is null or meaning in ('stock_loss')),
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint business_vocabulary_term_len check (length(term_key) between 2 and 80),
  constraint business_vocabulary_alias_has_product check (
    kind <> 'product_alias' or product_key is not null),
  constraint business_vocabulary_semantic_has_meaning check (
    kind <> 'semantic_term' or meaning is not null)
);

-- One word, one meaning, inside one company. This is the collision rule, and it
-- lives in the database rather than in a code path that could be bypassed.
-- Another company may use the same word for something else entirely.
create unique index if not exists business_vocabulary_company_term_idx
  on public.business_vocabulary (company_id, term_key);

create index if not exists business_vocabulary_company_kind_idx
  on public.business_vocabulary (company_id, kind);

create table if not exists public.business_vocabulary_audit_log (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  actor_id     uuid references public.profiles(id),
  action       text not null,
  term_key     text not null,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists business_vocabulary_audit_company_idx
  on public.business_vocabulary_audit_log (company_id, created_at desc);

alter table public.business_vocabulary enable row level security;
alter table public.business_vocabulary_audit_log enable row level security;

drop policy if exists business_vocabulary_read on public.business_vocabulary;
create policy business_vocabulary_read on public.business_vocabulary
  for select to authenticated
  using (company_id = private.auth_company_id());

drop policy if exists business_vocabulary_audit_read on public.business_vocabulary_audit_log;
create policy business_vocabulary_audit_read on public.business_vocabulary_audit_log
  for select to authenticated
  using (company_id = private.auth_company_id() and private.auth_role() in ('owner', 'accountant'));

-- No insert/update/delete policy anywhere: writes go through the RPC below,
-- which checks the role. No policy means deny, which is this repo's posture.

-- ── teaching ───────────────────────────────────────────────────────────────

create or replace function public.wa_save_business_term(
  p_phone text,
  p_kind text,
  p_term text,
  p_product text default null,
  p_meaning text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_profile uuid; v_company uuid; v_role text;
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_term text := btrim(coalesce(p_term, ''));
  v_term_key text := private.product_key(p_term);
  v_meaning text := nullif(lower(btrim(coalesce(p_meaning, ''))), '');
  v_product_key text;
  v_product_name text;
  v_existing public.business_vocabulary;
begin
  select i.profile_id, p.active_company_id, m.role
    into v_profile, v_company, v_role
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  -- The same posture as every other setting that changes how money is read.
  -- A worker may USE the shop's words; only an owner or accountant may change
  -- what they mean, because a remapped word silently reprices every future
  -- message that contains it.
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may teach business vocabulary'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  if v_kind not in ('product_alias', 'semantic_term') then
    raise exception 'unsupported vocabulary kind' using errcode = 'P0001', hint = 'invalid_kind';
  end if;
  if v_term_key is null or length(v_term_key) < 2 or length(v_term_key) > 80 then
    raise exception 'that word cannot be used' using errcode = 'P0001', hint = 'bad_term';
  end if;

  -- A canonical product name is authoritative and may never be shadowed. If a
  -- shop already sells something called "maini", the word "maini" cannot be
  -- taught to mean beef — every past reading of it would silently disagree
  -- with every future one.
  if exists (
    select 1 from public.company_product_names(v_company) n
     where private.product_key(n.product_name) = v_term_key
  ) then
    raise exception 'that word is already the name of a product'
      using errcode = 'P0001', hint = 'shadows_product';
  end if;

  if v_kind = 'product_alias' then
    select private.product_key(n.product_name), n.product_name
      into v_product_key, v_product_name
      from public.company_product_names(v_company) n
     where private.product_key(n.product_name) = private.product_key(p_product)
     limit 1;
    if v_product_key is null then
      raise exception 'not a product of this business: %', coalesce(btrim(p_product), '')
        using errcode = 'P0001', hint = 'unknown_product';
    end if;
    v_meaning := null;
  else
    if v_meaning is null or v_meaning not in ('stock_loss') then
      raise exception 'unsupported meaning' using errcode = 'P0001', hint = 'invalid_meaning';
    end if;
    -- A default product is optional here: a shop may say "mzoga means spoiled"
    -- without saying spoiled WHAT, and the flow asks later rather than guessing.
    if nullif(btrim(coalesce(p_product, '')), '') is not null then
      select private.product_key(n.product_name), n.product_name
        into v_product_key, v_product_name
        from public.company_product_names(v_company) n
       where private.product_key(n.product_name) = private.product_key(p_product)
       limit 1;
      if v_product_key is null then
        raise exception 'not a product of this business: %', btrim(p_product)
          using errcode = 'P0001', hint = 'unknown_product';
      end if;
    end if;
  end if;

  select * into v_existing from public.business_vocabulary
   where company_id = v_company and term_key = v_term_key;

  -- Never silently remapped. The caller is told what the word already means so
  -- it can ask, and only a second, explicit instruction changes it.
  if v_existing.id is not null
     and (v_existing.kind is distinct from v_kind
          or v_existing.product_key is distinct from v_product_key
          or v_existing.meaning is distinct from v_meaning) then
    return jsonb_build_object(
      'saved', false,
      'conflict', true,
      'term', v_existing.term_display,
      'existing_kind', v_existing.kind,
      'existing_product', v_existing.product_key,
      'existing_meaning', v_existing.meaning);
  end if;

  insert into public.business_vocabulary
    (company_id, kind, term_key, term_display, product_key, meaning, created_by)
  values (v_company, v_kind, v_term_key, v_term, v_product_key, v_meaning, v_profile)
  on conflict (company_id, term_key) do update
    set kind = excluded.kind,
        term_display = excluded.term_display,
        product_key = excluded.product_key,
        meaning = excluded.meaning,
        updated_at = now();

  insert into public.business_vocabulary_audit_log (company_id, actor_id, action, term_key, metadata)
  values (v_company, v_profile, 'saved', v_term_key,
          jsonb_build_object('kind', v_kind, 'product_key', v_product_key, 'meaning', v_meaning));

  return jsonb_build_object(
    'saved', true, 'conflict', false, 'term', v_term,
    'kind', v_kind, 'product_key', v_product_key,
    'product_name', v_product_name, 'meaning', v_meaning);
end;
$fn$;

revoke all on function public.wa_save_business_term(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.wa_save_business_term(text, text, text, text, text) to service_role;

create or replace function public.wa_forget_business_term(p_phone text, p_term text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_profile uuid; v_company uuid; v_role text;
  v_term_key text := private.product_key(p_term);
  v_removed int := 0;
begin
  select i.profile_id, p.active_company_id, m.role
    into v_profile, v_company, v_role
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may change business vocabulary'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_term_key is null then
    raise exception 'that word cannot be used' using errcode = 'P0001', hint = 'bad_term';
  end if;

  delete from public.business_vocabulary
   where company_id = v_company and term_key = v_term_key;
  get diagnostics v_removed = row_count;

  -- The word goes; the record that it once existed does not.
  if v_removed > 0 then
    insert into public.business_vocabulary_audit_log (company_id, actor_id, action, term_key)
    values (v_company, v_profile, 'forgotten', v_term_key);
  end if;

  return jsonb_build_object('removed', v_removed > 0, 'term', btrim(p_term));
end;
$fn$;

revoke all on function public.wa_forget_business_term(text, text) from public, anon, authenticated;
grant execute on function public.wa_forget_business_term(text, text) to service_role;

-- ── reading ────────────────────────────────────────────────────────────────

create or replace function public.wa_company_vocabulary(p_company_id uuid)
returns table(kind text, term text, product_name text, meaning text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $fn$
  select v.kind, v.term_display,
         (select n.product_name from public.company_product_names(p_company_id) n
           where private.product_key(n.product_name) = v.product_key limit 1),
         v.meaning
    from public.business_vocabulary v
   where v.company_id = p_company_id
   order by v.kind, v.term_key
   limit 200;
$fn$;

revoke all on function public.wa_company_vocabulary(uuid) from public, anon, authenticated;
grant execute on function public.wa_company_vocabulary(uuid) to service_role;

-- ── resolution ─────────────────────────────────────────────────────────────
--
-- Aliases are consulted BETWEEN exact canonical matching and the fuzzy
-- resolver, not inside it. private.resolve_company_product_read is untouched,
-- so every existing vertical keeps resolving exactly as it did — and the order
-- comes out as required:
--
--   1. exact canonical product   (the fuzzy resolver's own rank 0)
--   2. exact company alias       (here)
--   3. everything the fuzzy resolver already did
--
-- Placing the alias second also means a real product can never be shadowed by
-- an alias at READ time, which is the same rule the save path enforces at
-- WRITE time. Belt and braces, because the cost of getting it wrong is
-- subtracting the wrong meat from the wrong shelf.

create or replace function public.wa_resolve_company_product_read(
  p_profile_id uuid, p_company_id uuid, p_name text
)
returns table(product_key text, product_name text, match_kind text, match_score numeric, ambiguous boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_active_company uuid;
  v_key text := private.product_key(p_name);
  v_alias_product text;
  v_alias_name text;
  v_exact boolean;
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;

  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;
  if v_key is null or length(v_key) < 2 or length(v_key) > 100 then
    return;
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);

  select exists (
    select 1 from public.company_product_names(p_company_id) n
     where private.product_key(n.product_name) = v_key
  ) into v_exact;

  if not v_exact then
    -- Scoped by the company resolved from the caller's own profile, never by a
    -- company id the caller merely supplied.
    select v.product_key into v_alias_product
      from public.business_vocabulary v
     where v.company_id = p_company_id
       and v.term_key = v_key
       and v.kind = 'product_alias'
       and v.product_key is not null
     limit 1;

    if v_alias_product is not null then
      select n.product_name into v_alias_name
        from public.company_product_names(p_company_id) n
       where private.product_key(n.product_name) = v_alias_product
       limit 1;
      if v_alias_name is not null then
        return query select v_alias_product, v_alias_name, 'alias'::text, 1.0::numeric, false;
        return;
      end if;
    end if;
  end if;

  return query select * from private.resolve_company_product_read(v_key);
end;
$fn$;

revoke all on function public.wa_resolve_company_product_read(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wa_resolve_company_product_read(uuid, uuid, text) to service_role;
