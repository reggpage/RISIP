-- Risip schema seed for a plain PostgreSQL server.
-- Generated from the migrations in supabase/migrations (git add-order).
--
-- The roles below are normally created by Supabase; a plain Postgres has none,
-- so they are created first. Everything after is a schema-only dump, which
-- also carries the auth/storage/extensions shell the migrations assume.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon noinherit nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated noinherit nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role noinherit nologin bypassrls; end if;
end $$;
--
-- PostgreSQL database dump
--

\restrict xT08qFKghUhGd33WMCgUERTPadHlmoYQqLqI8aYEbLCDFFmIHmHeUFr1NggTcw0

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA auth;


ALTER SCHEMA auth OWNER TO postgres;

--
-- Name: cron; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA cron;


ALTER SCHEMA cron OWNER TO postgres;

--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA extensions;


ALTER SCHEMA extensions OWNER TO postgres;

--
-- Name: net; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA net;


ALTER SCHEMA net OWNER TO postgres;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA private;


ALTER SCHEMA private OWNER TO postgres;

--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA storage;


ALTER SCHEMA storage OWNER TO postgres;

--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA supabase_migrations;


ALTER SCHEMA supabase_migrations OWNER TO postgres;

--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA vault;


ALTER SCHEMA vault OWNER TO postgres;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: invoice_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.invoice_status AS ENUM (
    'draft',
    'sent',
    'pending_approval',
    'approved',
    'accepted',
    'disputed'
);


ALTER TYPE public.invoice_status OWNER TO postgres;

--
-- Name: platform_admin_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.platform_admin_role AS ENUM (
    'super_admin',
    'operations',
    'support',
    'finance',
    'read_only'
);


ALTER TYPE public.platform_admin_role OWNER TO postgres;

--
-- Name: project_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.project_status AS ENUM (
    'active',
    'archived'
);


ALTER TYPE public.project_status OWNER TO postgres;

--
-- Name: receipt_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.receipt_status AS ENUM (
    'processing',
    'confirmed',
    'duplicate',
    'error',
    'pending_review',
    'submitted',
    'changes_requested',
    'rejected'
);


ALTER TYPE public.receipt_status OWNER TO postgres;

--
-- Name: staff_retirement_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.staff_retirement_status AS ENUM (
    'submitted',
    'viewed',
    'approved',
    'changes_requested',
    'paid',
    'received_confirmed',
    'cancelled',
    'rejected'
);


ALTER TYPE public.staff_retirement_status OWNER TO postgres;

--
-- Name: supplier_claim_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.supplier_claim_status AS ENUM (
    'submitted',
    'viewed',
    'approved_for_payment',
    'paid',
    'received_confirmed',
    'disputed'
);


ALTER TYPE public.supplier_claim_status OWNER TO postgres;

--
-- Name: supplier_connection_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.supplier_connection_status AS ENUM (
    'pending',
    'connected',
    'declined'
);


ALTER TYPE public.supplier_connection_status OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'owner',
    'accountant',
    'worker'
);


ALTER TYPE public.user_role OWNER TO postgres;

--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: postgres
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;


ALTER FUNCTION auth.jwt() OWNER TO postgres;

--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: postgres
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;


ALTER FUNCTION auth.role() OWNER TO postgres;

--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: postgres
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;


ALTER FUNCTION auth.uid() OWNER TO postgres;

--
-- Name: schedule(text, text, text); Type: FUNCTION; Schema: cron; Owner: postgres
--

CREATE FUNCTION cron.schedule(p_name text, p_schedule text, p_command text) RETURNS bigint
    LANGUAGE sql
    AS $$
  insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command)
  returning jobid
$$;


ALTER FUNCTION cron.schedule(p_name text, p_schedule text, p_command text) OWNER TO postgres;

--
-- Name: unschedule(bigint); Type: FUNCTION; Schema: cron; Owner: postgres
--

CREATE FUNCTION cron.unschedule(p_jobid bigint) RETURNS boolean
    LANGUAGE sql
    AS $$
  delete from cron.job where jobid = p_jobid; select true
$$;


ALTER FUNCTION cron.unschedule(p_jobid bigint) OWNER TO postgres;

--
-- Name: http_post(text, jsonb, jsonb, jsonb, integer); Type: FUNCTION; Schema: net; Owner: postgres
--

CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000) RETURNS bigint
    LANGUAGE sql
    AS $$ select 1::bigint $$;


ALTER FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) OWNER TO postgres;

--
-- Name: auth_can_see_project(uuid); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.auth_can_see_project(pid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    SET row_security TO 'off'
    AS $$
declare cid uuid;
begin
  select company_id into cid from profiles where id = auth.uid();
  if cid is null then return false; end if;
  return exists (select 1 from projects where id = pid and company_id = cid);
end;
$$;


ALTER FUNCTION private.auth_can_see_project(pid uuid) OWNER TO postgres;

--
-- Name: auth_company_id(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.auth_company_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v uuid;
begin
  select p.active_company_id into v
    from profiles p
    join company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = auth.uid();
  return v;
end $$;


ALTER FUNCTION private.auth_company_id() OWNER TO postgres;

--
-- Name: auth_role(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.auth_role() RETURNS public.user_role
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
declare v user_role;
begin
  select m.role into v
    from profiles p
    join company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = auth.uid();
  return v;
end $$;


ALTER FUNCTION private.auth_role() OWNER TO postgres;

--
-- Name: configure_product_units(uuid, uuid, text, text, text, numeric, numeric, jsonb); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.configure_product_units(p_company uuid, p_actor uuid, p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_key text := private.product_key(p_name);
  v_base_key text := private.product_key(p_base_unit);
  v_purchase_key text := private.product_key(p_purchase_unit);
  v_currency text;
  v_item jsonb;
  v_unit text;
  v_unit_key text;
  v_size numeric;
  v_retail numeric;
  v_wholesale numeric;
  v_min numeric;
  v_count integer := 0;
begin
  if p_company is null or p_actor is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if v_base_key is null or v_purchase_key is null then
    raise exception 'base and purchase units are required' using errcode = 'P0001', hint = 'unit_required';
  end if;
  if p_purchase_size is null or p_purchase_size <= 0 or p_purchase_size > 1000000 then
    raise exception 'purchase unit size is out of range' using errcode = 'P0001', hint = 'invalid_conversion';
  end if;
  if v_purchase_key = v_base_key and abs(p_purchase_size - 1) > 0.000001 then
    raise exception 'the base unit must have a conversion size of one'
      using errcode = 'P0001', hint = 'conversion_conflict';
  end if;
  if p_purchase_cost is null or p_purchase_cost <= 0 or p_purchase_cost > 1000000000 then
    raise exception 'purchase cost is out of range' using errcode = 'P0001', hint = 'invalid_cost';
  end if;
  if jsonb_typeof(p_sale_units) <> 'array' or jsonb_array_length(p_sale_units) = 0 then
    raise exception 'at least one selling unit is required' using errcode = 'P0001', hint = 'no_sale_units';
  end if;
  if jsonb_array_length(p_sale_units) > 30 then
    raise exception 'too many selling units' using errcode = 'P0001', hint = 'too_many_units';
  end if;
  if exists (select 1 from public.product_units where company_id = p_company and product_key = v_key) then
    raise exception 'this product already has a unit setup'
      using errcode = 'P0001', hint = 'already_configured';
  end if;

  select currency into v_currency from public.companies where id = p_company;
  if v_currency is null then
    raise exception 'company not found' using errcode = 'P0001', hint = 'company_not_found';
  end if;

  -- Validate every selling unit before writing any row.
  for v_item in select value from jsonb_array_elements(p_sale_units) loop
    v_unit := btrim(coalesce(v_item ->> 'unit', ''));
    v_unit_key := private.product_key(v_unit);
    v_size := nullif(v_item ->> 'base_quantity', '')::numeric;
    v_retail := nullif(v_item ->> 'retail', '')::numeric;
    v_wholesale := nullif(v_item ->> 'wholesale', '')::numeric;
    v_min := nullif(v_item ->> 'min_qty', '')::numeric;
    if v_unit_key is null or length(v_unit_key) > 40 then
      raise exception 'a selling unit name is not usable' using errcode = 'P0001', hint = 'invalid_unit';
    end if;
    if v_size is null or v_size <= 0 or v_size > 1000000 then
      raise exception 'selling unit % has an invalid conversion', v_unit
        using errcode = 'P0001', hint = 'invalid_conversion';
    end if;
    if v_retail is null or v_retail <= 0 or v_retail > 1000000000 then
      raise exception 'selling unit % has an invalid price', v_unit
        using errcode = 'P0001', hint = 'invalid_price';
    end if;
    if v_wholesale is not null and (v_wholesale <= 0 or v_wholesale > v_retail) then
      raise exception 'selling unit % has an invalid wholesale price', v_unit
        using errcode = 'P0001', hint = 'invalid_wholesale';
    end if;
    if v_min is not null and (v_min <= 0 or v_wholesale is null) then
      raise exception 'selling unit % has an invalid wholesale minimum', v_unit
        using errcode = 'P0001', hint = 'invalid_min_qty';
    end if;
  end loop;

  insert into public.product_units
    (company_id, product_key, product_name, unit_key, unit_name, base_quantity,
     is_base, can_purchase, can_sell, can_count, created_by)
  values
    (p_company, v_key, btrim(p_name), v_base_key, btrim(p_base_unit), 1,
     true, v_base_key = v_purchase_key, false, true, p_actor);

  if v_purchase_key <> v_base_key then
    insert into public.product_units
      (company_id, product_key, product_name, unit_key, unit_name, base_quantity,
       is_base, can_purchase, can_sell, can_count, created_by)
    values
      (p_company, v_key, btrim(p_name), v_purchase_key, btrim(p_purchase_unit),
       round(p_purchase_size, 6), false, true, false, true, p_actor);
  else
    update public.product_units
       set can_purchase = true
     where company_id = p_company and product_key = v_key and unit_key = v_base_key;
  end if;

  for v_item in select value from jsonb_array_elements(p_sale_units) loop
    v_unit := btrim(v_item ->> 'unit');
    v_unit_key := private.product_key(v_unit);
    v_size := (v_item ->> 'base_quantity')::numeric;
    v_retail := (v_item ->> 'retail')::numeric;
    v_wholesale := nullif(v_item ->> 'wholesale', '')::numeric;
    v_min := nullif(v_item ->> 'min_qty', '')::numeric;

    insert into public.product_units
      (company_id, product_key, product_name, unit_key, unit_name, base_quantity,
       is_base, can_purchase, can_sell, can_count, created_by)
    values
      (p_company, v_key, btrim(p_name), v_unit_key, v_unit, round(v_size, 6),
       v_unit_key = v_base_key, v_unit_key = v_purchase_key, true, true, p_actor)
    on conflict (company_id, product_key, unit_key) do update
      set can_sell = true,
          can_purchase = public.product_units.can_purchase or excluded.can_purchase;

    if exists (
      select 1 from public.product_units
       where company_id = p_company and product_key = v_key and unit_key = v_unit_key
         and abs(base_quantity - v_size) > 0.000001
    ) then
      raise exception 'unit % has two different conversions', v_unit
        using errcode = 'P0001', hint = 'conversion_conflict';
    end if;

    insert into public.product_selling_prices
      (company_id, product_key, product_name, retail_price, wholesale_price,
       wholesale_min_qty, currency, recorded_by, sale_unit)
    values
      (p_company, v_key, btrim(p_name), round(v_retail, 2),
       case when v_wholesale is null then null else round(v_wholesale, 2) end,
       v_min, v_currency, p_actor, v_unit);
    v_count := v_count + 1;
  end loop;

  insert into public.product_costs
    (company_id, product_key, product_name, unit, unit_cost, currency, recorded_by,
     note)
  values
    (p_company, v_key, btrim(p_name), btrim(p_purchase_unit), round(p_purchase_cost, 2),
     v_currency, p_actor, 'Portion-selling setup');

  insert into public.product_unit_audit_log
    (company_id, product_key, actor_id, action, metadata)
  values
    (p_company, v_key, p_actor, 'configured', jsonb_build_object(
      'base_unit', btrim(p_base_unit),
      'purchase_unit', btrim(p_purchase_unit),
      'purchase_size', round(p_purchase_size, 6),
      'selling_units', v_count
    ));

  return jsonb_build_object(
    'product', btrim(p_name), 'base_unit', btrim(p_base_unit),
    'purchase_unit', btrim(p_purchase_unit), 'purchase_size', round(p_purchase_size, 6),
    'selling_units', v_count
  );
end;
$$;


ALTER FUNCTION private.configure_product_units(p_company uuid, p_actor uuid, p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb) OWNER TO postgres;

--
-- Name: gen_scanner_token(text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.gen_scanner_token(p_name text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  slug  text;
  token text;
begin
  slug := regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '', 'g');
  slug := left(slug, 12);
  if slug = '' then slug := 'co'; end if;
  loop
    token := slug || '.' || substr(md5(random()::text), 1, 4);
    exit when not exists (select 1 from companies where scanner_inbox_token = token);
  end loop;
  return token;
end;
$$;


ALTER FUNCTION private.gen_scanner_token(p_name text) OWNER TO postgres;

--
-- Name: guard_product_cost_unit(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.guard_product_cost_unit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_unit public.product_units;
  v_base text;
begin
  if not exists (
    select 1 from public.product_units u
     where u.company_id = new.company_id and u.product_key = private.product_key(new.product_key)
  ) then
    new.unit_base_quantity := coalesce(new.unit_base_quantity, 1);
    new.base_unit := coalesce(new.base_unit, new.unit);
    new.base_unit_cost := coalesce(new.base_unit_cost, round(new.unit_cost / new.unit_base_quantity, 6));
    return new;
  end if;

  if nullif(btrim(coalesce(new.unit, '')), '') is null then
    raise exception 'a configured product cost needs its purchase unit'
      using errcode = 'P0001', hint = 'unit_required';
  end if;
  select * into v_unit
    from private.product_declared_unit(new.company_id, new.product_key, new.unit);
  if v_unit.id is null or not v_unit.can_purchase then
    raise exception 'this is not a declared purchase unit for the product'
      using errcode = 'P0001', hint = 'unknown_purchase_unit';
  end if;
  select unit_name into v_base from public.product_units
   where company_id = new.company_id and product_key = private.product_key(new.product_key) and is_base;
  new.product_key := private.product_key(new.product_key);
  new.unit := v_unit.unit_name;
  new.base_unit := v_base;
  new.unit_base_quantity := v_unit.base_quantity;
  new.base_unit_cost := round(new.unit_cost / v_unit.base_quantity, 6);
  return new;
end;
$$;


ALTER FUNCTION private.guard_product_cost_unit() OWNER TO postgres;

--
-- Name: guard_product_selling_unit(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.guard_product_selling_unit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_unit public.product_units;
  v_key text := private.product_key(new.product_key);
  v_matches integer;
begin
  if not exists (
    select 1 from public.product_units u
     where u.company_id = new.company_id and u.product_key = v_key
  ) then
    -- Existing price RPCs accept a product name but no separate sale-unit
    -- argument. "bei ya mafuta robo ..." is therefore resolved only when the
    -- full key is an exact declared product+unit pair. It must never create a
    -- phantom product called "mafuta robo".
    if nullif(btrim(coalesce(new.sale_unit, '')), '') is null then
      select count(*) into v_matches
        from public.product_units u
       where u.company_id = new.company_id
         and v_key = u.product_key || ' ' || u.unit_key
         and u.can_sell;
      if v_matches > 1 then
        raise exception 'the selling price matches more than one declared unit'
          using errcode = 'P0001', hint = 'ambiguous_unit';
      end if;
      if v_matches = 1 then
        select * into v_unit
          from public.product_units u
         where u.company_id = new.company_id
           and v_key = u.product_key || ' ' || u.unit_key
           and u.can_sell;
        new.product_key := v_unit.product_key;
        new.product_name := v_unit.product_name;
        new.sale_unit := v_unit.unit_name;
        v_key := v_unit.product_key;
      end if;
    end if;
  end if;

  if v_unit.id is null and not exists (
    select 1 from public.product_units u
     where u.company_id = new.company_id and u.product_key = v_key
  ) then
    new.sale_unit := nullif(btrim(coalesce(new.sale_unit, '')), '');
    new.sale_unit_key := case when new.sale_unit is null then null else private.product_key(new.sale_unit) end;
    new.unit_base_quantity := coalesce(new.unit_base_quantity, 1);
    return new;
  end if;

  -- Existing app RPCs have no unit argument. For backward compatibility they
  -- update the declared base price; portion prices always use the new RPC.
  if v_unit.id is not null then
    null;
  elsif nullif(btrim(coalesce(new.sale_unit, '')), '') is null then
    select * into v_unit from public.product_units
     where company_id = new.company_id and product_key = v_key and is_base;
  else
    select * into v_unit
      from private.product_declared_unit(new.company_id, v_key, new.sale_unit);
  end if;
  if v_unit.id is null or not v_unit.can_sell then
    raise exception 'this is not a declared selling unit for the product'
      using errcode = 'P0001', hint = 'unknown_sale_unit';
  end if;
  new.product_key := private.product_key(new.product_key);
  new.sale_unit := v_unit.unit_name;
  new.sale_unit_key := v_unit.unit_key;
  new.unit_base_quantity := v_unit.base_quantity;
  return new;
end;
$$;


ALTER FUNCTION private.guard_product_selling_unit() OWNER TO postgres;

--
-- Name: is_meaningful_reason(text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.is_meaningful_reason(p_reason text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
declare
  t text; words text[]; w text; good text[] := '{}'; distinct_chars int;
begin
  t := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  if length(t) < 20 then return false; end if;
  -- "aaaa", "!!!!", any character four times over
  if t ~ '(.)\1{3,}' then return false; end if;

  select count(distinct ch) into distinct_chars
    from regexp_split_to_table(lower(t), '') ch where ch ~ '[[:alnum:]]';
  if distinct_chars < 8 then return false; end if;

  words := regexp_split_to_array(lower(t), '[^[:alnum:]]+');
  foreach w in array words loop
    if length(w) >= 2 and w ~ '[aeiou]' and w !~ '^(.)\1+$' and not (w = any (good)) then
      good := good || w;
    end if;
  end loop;
  return coalesce(array_length(good, 1), 0) >= 3;
end $_$;


ALTER FUNCTION private.is_meaningful_reason(p_reason text) OWNER TO postgres;

--
-- Name: is_project_leader(uuid); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.is_project_leader(pid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
  select exists (select 1 from project_members pm
    where pm.project_id = pid and pm.profile_id = auth.uid() and pm.role = 'leader');
$$;


ALTER FUNCTION private.is_project_leader(pid uuid) OWNER TO postgres;

--
-- Name: leads_petty_user(uuid); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.leads_petty_user(target_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
  select exists (select 1 from project_members l
    join project_members m on m.project_id = l.project_id
    where l.profile_id = auth.uid() and l.role = 'leader' and m.profile_id = target_uid);
$$;


ALTER FUNCTION private.leads_petty_user(target_uid uuid) OWNER TO postgres;

--
-- Name: marketplace_enqueue(uuid, uuid, text, jsonb); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.marketplace_enqueue(p_order_id uuid, p_to_company_id uuid, p_kind text, p_payload jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_identity uuid; v_phone text; v_lang text; v_id uuid; v_kind text;
begin
  -- Map the marketplace event onto a notification_kind.
  v_kind := case p_kind
    when 'order_new_supplier'  then 'marketplace_order_new'
    when 'order_accepted'      then 'marketplace_order_accepted'
    when 'order_rejected'      then 'marketplace_order_rejected'
    when 'order_delivered'     then 'marketplace_order_delivered'
    when 'order_cancelled'     then 'marketplace_order_cancelled'
    -- The buyer's own confirmation is a reply inside the 24h service window
    -- and is sent synchronously by the webhook, not queued here.
    when 'order_placed_buyer'  then null
    else null
  end;
  if v_kind is null then return null; end if;

  -- A shop with no reachable, opted-in identity is simply not messaged. The
  -- order still exists and is visible in-app; proactive consent is not
  -- something this feature may assume.
  select i.id, i.phone_e164,
         case when coalesce(i.lang, p.lang, 'en') = 'sw' then 'sw' else 'en' end
    into v_identity, v_phone, v_lang
  from public.whatsapp_identities i
  join public.profiles p on p.id = i.profile_id and p.deactivated_at is null
  where i.company_id = p_to_company_id
    and i.verified_at is not null
    and i.revoked_at is null
    and i.opted_out_at is null
    and i.proactive_notifications_opted_out_at is null
  order by i.verified_at desc
  limit 1;

  if v_identity is null then return null; end if;

  insert into public.whatsapp_notification_deliveries
    (identity_id, company_id, notification_kind, business_date, subject_key,
     phone_e164_snapshot, language_snapshot, template_name, parameters,
     status, attempt_count, next_attempt_at)
  values (
    v_identity, p_to_company_id, v_kind, current_date, p_order_id::text,
    v_phone, v_lang,
    -- Two templates, not five: the supplier's "a shop wants to buy from you"
    -- and a status update. One template cannot carry five different bodies,
    -- and each extra template is another Meta approval to wait on.
    case when v_kind = 'marketplace_order_new'
         then 'risip_marketplace_order_new'
         else 'risip_marketplace_order_update' end,
    p_payload || jsonb_build_object('order_id', p_order_id, 'event', p_kind),
    'queued', 1, now())
  -- One notification per order per kind; a retried status change is not a
  -- second message.
  on conflict (identity_id, notification_kind, business_date, subject_key)
    do nothing
  returning id into v_id;

  return v_id;
end $$;


ALTER FUNCTION private.marketplace_enqueue(p_order_id uuid, p_to_company_id uuid, p_kind text, p_payload jsonb) OWNER TO postgres;

--
-- Name: marketplace_link_shop_order(uuid); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.marketplace_link_shop_order(p_request_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  o public.marketplace_order_requests;
  v_order_no text;
  v_total numeric;
  v_id uuid;
begin
  select * into o from public.marketplace_order_requests where id = p_request_id;
  if o.id is null then
    raise exception 'marketplace order not found' using errcode = 'P0002';
  end if;

  -- unit_price is null whenever the supplier shares stock but not prices, so
  -- the mirrored order carries a zero total rather than a wrong one. The real
  -- figure is agreed between the two shops on the contact exchange.
  v_total := round(coalesce(o.unit_price, 0) * o.quantity, 2);
  v_order_no := private.marketplace_next_order_no();

  if v_order_no is null then
    insert into public.shop_orders
      (buyer_company_id, supplier_company_id, status, total_wholesale, currency, placed_at)
    values (o.buyer_company_id, o.supplier_company_id, 'placed', v_total,
            coalesce(o.currency, 'TZS'), o.placed_at)
    returning id into v_id;
  else
    insert into public.shop_orders
      (order_no, buyer_company_id, supplier_company_id, status, total_wholesale, currency, placed_at)
    values (v_order_no, o.buyer_company_id, o.supplier_company_id, 'placed', v_total,
            coalesce(o.currency, 'TZS'), o.placed_at)
    returning id into v_id;
  end if;

  return v_id;
end $$;


ALTER FUNCTION private.marketplace_link_shop_order(p_request_id uuid) OWNER TO postgres;

--
-- Name: marketplace_next_order_no(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.marketplace_next_order_no() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_has_default boolean;
  v_type text;
  v_next bigint;
begin
  select (d.adbin is not null), format_type(a.atttypid, null)
    into v_has_default, v_type
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = to_regclass('public.shop_orders') and a.attname = 'order_no';

  if v_has_default then
    return null;  -- let the table's own default or sequence do it
  end if;

  -- Serialize against concurrent placement so two orders cannot take the same
  -- number. Advisory lock, not a table lock: it costs nothing between orders.
  perform pg_advisory_xact_lock(hashtext('risip_marketplace_order_no'));

  if v_type in ('integer', 'bigint', 'smallint', 'numeric') then
    select coalesce(max(order_no::bigint), 0) + 1 into v_next from public.shop_orders;
    return v_next::text;
  end if;

  select coalesce(max(nullif(regexp_replace(order_no, '\D', '', 'g'), '')::bigint), 0) + 1
    into v_next from public.shop_orders;
  return 'MK-' || lpad(v_next::text, 6, '0');
end $$;


ALTER FUNCTION private.marketplace_next_order_no() OWNER TO postgres;

--
-- Name: marketplace_normalize(text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.marketplace_normalize(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  -- Lowercase, punctuation to space, collapse runs of space. Size and pack
  -- tokens ("500g", "1kg", "dazani") are deliberately KEPT: dropping them
  -- would merge Sabuni 500g with Sabuni 1kg, which is a wrong order.
  select nullif(btrim(regexp_replace(
           regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g'),
           '\s+', ' ', 'g')), '');
$$;


ALTER FUNCTION private.marketplace_normalize(p_text text) OWNER TO postgres;

--
-- Name: marketplace_require_actor(uuid, uuid); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.marketplace_require_actor(p_company_id uuid, p_profile_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_profile uuid;
begin
  if p_company_id is null then
    raise exception 'company_id is required' using errcode = '22023';
  end if;

  if v_uid is null then
    return p_profile_id;  -- service_role: the worker names the acting member
  end if;

  select cm.profile_id into v_profile
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.profile_id = v_uid
    and cm.deactivated_at is null;

  if v_profile is null then
    raise exception 'not an active member of this company'
      using errcode = 'P0001', hint = 'not_company_member';
  end if;
  return v_profile;
end $$;


ALTER FUNCTION private.marketplace_require_actor(p_company_id uuid, p_profile_id uuid) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: company_marketplace_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_marketplace_settings (
    company_id uuid NOT NULL,
    opt_in boolean DEFAULT false NOT NULL,
    share_prices boolean DEFAULT false NOT NULL,
    max_stock_age_days integer DEFAULT 14 NOT NULL,
    contact_profile_id uuid,
    opted_in_at timestamp with time zone,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT company_marketplace_settings_max_stock_age_days_check CHECK (((max_stock_age_days >= 1) AND (max_stock_age_days <= 90)))
);


ALTER TABLE public.company_marketplace_settings OWNER TO postgres;

--
-- Name: marketplace_require_optin(uuid); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.marketplace_require_optin(p_company_id uuid) RETURNS public.company_marketplace_settings
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare s public.company_marketplace_settings;
begin
  select * into s from public.company_marketplace_settings where company_id = p_company_id;
  if s.company_id is null or not s.opt_in then
    raise exception 'company has not joined the restock marketplace'
      using errcode = 'P0001', hint = 'marketplace_not_opted_in';
  end if;
  return s;
end $$;


ALTER FUNCTION private.marketplace_require_optin(p_company_id uuid) OWNER TO postgres;

--
-- Name: marketplace_sync_shop_order(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.marketplace_sync_shop_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if new.shop_order_id is null or new.status is not distinct from old.status then
    return new;
  end if;
  update public.shop_orders
     set status       = new.status,
         accepted_at  = case when new.status = 'accepted'  then now() else accepted_at  end,
         rejected_at  = case when new.status = 'rejected'  then now() else rejected_at  end,
         delivered_at = case when new.status = 'delivered' then now() else delivered_at end,
         cancelled_at = case when new.status = 'cancelled' then now() else cancelled_at end
   where id = new.shop_order_id;
  return new;
end $$;


ALTER FUNCTION private.marketplace_sync_shop_order() OWNER TO postgres;

--
-- Name: mask_message_text(text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.mask_message_text(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
  select case
    when p_text is null then null
    else left(regexp_replace(regexp_replace(p_text, '\+?\d[\d\s-]{8,}\d', '[namba]', 'g'),
                             '\s+', ' ', 'g'), 2000)
  end;
$$;


ALTER FUNCTION private.mask_message_text(p_text text) OWNER TO postgres;

--
-- Name: normalise_stock_count_unit(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.normalise_stock_count_unit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_key text := private.product_key(new.product_key);
  v_declared public.product_units;
  v_base text;
begin
  new.reported_quantity := coalesce(new.reported_quantity, new.quantity);
  new.reported_unit := coalesce(new.reported_unit, new.unit);

  if not exists (
    select 1 from public.product_units u
     where u.company_id = new.company_id and u.product_key = v_key
  ) then
    new.unit_base_quantity := coalesce(new.unit_base_quantity, 1);
    return new;
  end if;
  if nullif(btrim(coalesce(new.unit, '')), '') is null then
    raise exception 'this product has declared units; say which unit was counted'
      using errcode = 'P0001', hint = 'unit_required';
  end if;
  select * into v_declared
    from private.product_declared_unit(new.company_id, v_key, new.unit);
  if v_declared.id is null or not v_declared.can_count then
    raise exception 'the stated unit cannot be used to count this product'
      using errcode = 'P0001', hint = 'unknown_count_unit';
  end if;
  select unit_name into v_base from public.product_units
   where company_id = new.company_id and product_key = v_key and is_base;

  new.product_key := v_key;
  new.product_name := v_declared.product_name;
  new.reported_quantity := new.quantity;
  new.reported_unit := v_declared.unit_name;
  new.unit_base_quantity := v_declared.base_quantity;
  new.quantity := round(new.quantity * v_declared.base_quantity, 6);
  new.unit := v_base;
  return new;
end;
$$;


ALTER FUNCTION private.normalise_stock_count_unit() OWNER TO postgres;

--
-- Name: platform_admin_audit(public.platform_admin_role, text, text, uuid, text, jsonb, jsonb); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.platform_admin_audit(p_role public.platform_admin_role, p_action text, p_target_type text, p_target_id uuid, p_reason text, p_before jsonb, p_after jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    begin
      insert into public.platform_admin_audit_logs
        (admin_user_id, admin_role, action, target_type, target_id, reason, before_metadata, after_metadata)
      values (
        auth.uid(), p_role, p_action, p_target_type, p_target_id,
        left(btrim(coalesce(p_reason, '')), 1000),
        coalesce(p_before, '{}'::jsonb), coalesce(p_after, '{}'::jsonb)
      );
    end $$;


ALTER FUNCTION private.platform_admin_audit(p_role public.platform_admin_role, p_action text, p_target_type text, p_target_id uuid, p_reason text, p_before jsonb, p_after jsonb) OWNER TO postgres;

--
-- Name: platform_admin_role(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.platform_admin_role() RETURNS public.platform_admin_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
      select role from public.platform_admins where user_id = auth.uid() and active
    $$;


ALTER FUNCTION private.platform_admin_role() OWNER TO postgres;

--
-- Name: product_units; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    product_key text NOT NULL,
    product_name text NOT NULL,
    unit_key text NOT NULL,
    unit_name text NOT NULL,
    base_quantity numeric(18,6) NOT NULL,
    is_base boolean DEFAULT false NOT NULL,
    can_purchase boolean DEFAULT false NOT NULL,
    can_sell boolean DEFAULT false NOT NULL,
    can_count boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT product_units_base_is_one CHECK (((NOT is_base) OR (base_quantity = (1)::numeric))),
    CONSTRAINT product_units_base_quantity_check CHECK ((base_quantity > (0)::numeric)),
    CONSTRAINT product_units_names_not_blank CHECK (((length(btrim(product_key)) >= 2) AND (length(btrim(product_name)) >= 2) AND ((length(btrim(unit_key)) >= 1) AND (length(btrim(unit_key)) <= 40)) AND ((length(btrim(unit_name)) >= 1) AND (length(btrim(unit_name)) <= 40))))
);


ALTER TABLE public.product_units OWNER TO postgres;

--
-- Name: product_declared_unit(uuid, text, text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.product_declared_unit(p_company uuid, p_product_key text, p_unit text) RETURNS public.product_units
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select u
    from public.product_units u
   where u.company_id = p_company
     and u.product_key = private.product_key(p_product_key)
     and u.unit_key = private.product_key(p_unit)
   limit 1;
$$;


ALTER FUNCTION private.product_declared_unit(p_company uuid, p_product_key text, p_unit text) OWNER TO postgres;

--
-- Name: product_exists_for_company(uuid, text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.product_exists_for_company(p_company uuid, p_key text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1 from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
     where r.company_id = p_company and private.product_key(l.description) = p_key
    union all select 1 from public.product_costs where company_id = p_company and product_key = p_key
    union all select 1 from public.product_selling_prices where company_id = p_company and product_key = p_key
    union all select 1 from public.stock_counts where company_id = p_company and product_key = p_key
    union all select 1 from public.product_units where company_id = p_company and product_key = p_key
    union all select 1 from public.product_cost_prompts where company_id = p_company and product_key = p_key
    union all select 1 from public.product_archives where company_id = p_company and product_key = p_key
    limit 1
  );
$$;


ALTER FUNCTION private.product_exists_for_company(p_company uuid, p_key text) OWNER TO postgres;

--
-- Name: product_key(text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.product_key(p_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
  select nullif(
    regexp_replace(
      regexp_replace(
        -- Strip anything that is not a letter or digit from either end. The
        -- character class is unicode-aware so Swahili stays intact.
        regexp_replace(lower(coalesce(p_name, '')), '^[^[:alnum:]]+|[^[:alnum:]]+$', '', 'g'),
        '\s+', ' ', 'g'),
      '^\s+|\s+$', '', 'g'),
    '');
$_$;


ALTER FUNCTION private.product_key(p_name text) OWNER TO postgres;

--
-- Name: product_rename_preview(uuid, text, text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.product_rename_preview(p_company uuid, p_from text, p_to text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_from text := private.product_key(p_from);
  v_to text := private.product_key(p_to);
  v_lines integer;
  v_costs integer;
  v_prices integer;
  v_counts integer;
  v_units integer;
begin
  if p_company is null or v_from is null or v_to is null or length(v_to) < 2 then
    raise exception 'both usable product names are required'
      using errcode = 'P0001', hint = 'invalid_name';
  end if;
  if v_from = v_to then
    raise exception 'the new product name is unchanged'
      using errcode = 'P0001', hint = 'same_product';
  end if;
  if not private.product_exists_for_company(p_company, v_from) then
    raise exception 'the product to rename was not found'
      using errcode = 'P0001', hint = 'source_not_found';
  end if;
  if private.product_exists_for_company(p_company, v_to) then
    raise exception 'the new name already belongs to another product; use merge instead'
      using errcode = 'P0001', hint = 'target_exists';
  end if;

  select count(*) into v_lines
    from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
   where r.company_id = p_company and private.product_key(l.description) = v_from;
  select count(*) into v_costs from public.product_costs where company_id = p_company and product_key = v_from;
  select count(*) into v_prices from public.product_selling_prices where company_id = p_company and product_key = v_from;
  select count(*) into v_counts from public.stock_counts where company_id = p_company and product_key = v_from;
  select count(*) into v_units from public.product_units where company_id = p_company and product_key = v_from;

  return jsonb_build_object(
    'from_key', v_from, 'from_name', btrim(p_from), 'to_key', v_to, 'to_name', btrim(p_to),
    'sale_lines', v_lines, 'cost_rows', v_costs, 'price_rows', v_prices,
    'stock_counts', v_counts, 'unit_rows', v_units,
    'records', v_lines + v_costs + v_prices + v_counts + v_units
  );
end;
$$;


ALTER FUNCTION private.product_rename_preview(p_company uuid, p_from text, p_to text) OWNER TO postgres;

--
-- Name: product_unit(uuid, text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.product_unit(p_company uuid, p_key text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select case
    when exists (
      select 1 from public.product_units u
       where u.company_id = p_company and u.product_key = private.product_key(p_key)
    ) then null
    else (
      select unit from (
        select c.unit, c.effective_from as at
          from public.product_costs c
         where c.company_id = p_company and private.product_key(c.product_key) = private.product_key(p_key)
           and nullif(btrim(coalesce(c.unit, '')), '') is not null
        union all
        select s.unit, s.counted_at
          from public.stock_counts s
         where s.company_id = p_company and private.product_key(s.product_key) = private.product_key(p_key)
           and nullif(btrim(coalesce(s.unit, '')), '') is not null
        union all
        select l.unit, r.occurred_at
          from public.daily_record_lines l
          join public.daily_records r on r.id = l.daily_record_id
         where r.company_id = p_company and private.product_key(l.description) = private.product_key(p_key)
           and r.status = 'confirmed'
           and nullif(btrim(coalesce(l.unit, '')), '') is not null
      ) stated
      order by at desc
      limit 1
    )
  end;
$$;


ALTER FUNCTION private.product_unit(p_company uuid, p_key text) OWNER TO postgres;

--
-- Name: receipt_has_live_expense(uuid); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.receipt_has_live_expense(p_receipt uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1 from public.petty_cash_transactions
     where receipt_id = p_receipt
       and type = 'expense'
       and reversed_at is null
  );
$$;


ALTER FUNCTION private.receipt_has_live_expense(p_receipt uuid) OWNER TO postgres;

--
-- Name: refuse_worker_ledger_insert(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.refuse_worker_ledger_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private'
    AS $$
begin
  if private.auth_role() = 'worker' then
    raise exception 'Mfanyakazi hawezi kuandika rekodi bila idhini ya boss au accountant.'
      using errcode = 'P0001', hint = 'worker_write_requires_owner_approval';
  end if;
  return new;
end
$$;


ALTER FUNCTION private.refuse_worker_ledger_insert() OWNER TO postgres;

--
-- Name: FUNCTION refuse_worker_ledger_insert(); Type: COMMENT; Schema: private; Owner: postgres
--

COMMENT ON FUNCTION private.refuse_worker_ledger_insert() IS 'Retained for migration compatibility; worker ledger and stock-count inserts are allowed. Sender confirmation and existing role controls remain in force.';


--
-- Name: refuse_write_when_suspended(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.refuse_write_when_suspended() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private'
    AS $$
declare
  v_status text;
begin
  if new.company_id is null then
    return new;
  end if;

  select s.status into v_status
    from public.subscriptions s
   where s.company_id = new.company_id;

  -- Rule 1. No row, or any status that is not a stop, and the write proceeds.
  -- Listing what BLOCKS rather than what allows means a status added later
  -- fails open, which is the right way round for a shop's own books.
  if v_status is null or v_status not in ('suspended', 'cancelled') then
    return new;
  end if;

  raise exception 'Risip imesimama kwa sababu bili haijalipwa. Rekodi zako zote zipo salama na unaweza kuziona. Lipa ili uendelee kuandika.'
    using errcode = 'P0001', hint = 'subscription_' || v_status;
end
$$;


ALTER FUNCTION private.refuse_write_when_suspended() OWNER TO postgres;

--
-- Name: FUNCTION refuse_write_when_suspended(); Type: COMMENT; Schema: private; Owner: postgres
--

COMMENT ON FUNCTION private.refuse_write_when_suspended() IS 'Stops an unpaid shop adding to its ledgers. Reading, reports and history are untouched, and a company with no subscription row is never affected.';


--
-- Name: rename_product_for_actor(uuid, uuid, text, text, text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.rename_product_for_actor(p_company uuid, p_actor uuid, p_from text, p_to text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_preview jsonb;
  v_from text;
  v_to text;
  v_name text := btrim(coalesce(p_to, ''));
  v_revenue_before numeric;
  v_revenue_after numeric;
begin
  if p_company is null or p_actor is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  v_preview := private.product_rename_preview(p_company, p_from, p_to);
  v_from := v_preview ->> 'from_key';
  v_to := v_preview ->> 'to_key';

  select coalesce(sum(l.line_total), 0) into v_revenue_before
    from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
   where r.company_id = p_company and private.product_key(l.description) = v_from;

  update public.daily_record_lines l set description = v_name
    from public.daily_records r
   where r.id = l.daily_record_id and r.company_id = p_company
     and private.product_key(l.description) = v_from;
  update public.product_costs set product_key = v_to, product_name = v_name
   where company_id = p_company and product_key = v_from;
  update public.product_selling_prices set product_key = v_to, product_name = v_name
   where company_id = p_company and product_key = v_from;
  update public.stock_counts set product_key = v_to, product_name = v_name
   where company_id = p_company and product_key = v_from;
  update public.product_cost_prompts set product_key = v_to
   where company_id = p_company and product_key = v_from;
  update public.product_units set product_key = v_to, product_name = v_name
   where company_id = p_company and product_key = v_from;
  update public.product_archives set product_key = v_to
   where company_id = p_company and product_key = v_from;

  select coalesce(sum(l.line_total), 0) into v_revenue_after
    from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
   where r.company_id = p_company and private.product_key(l.description) = v_to;
  if v_revenue_before <> v_revenue_after then
    raise exception 'a rename must not change revenue'
      using errcode = 'P0001', hint = 'revenue_moved';
  end if;

  insert into public.product_events
    (company_id, actor_id, action, product_key, target_key, reason, metadata)
  values
    (p_company, p_actor, 'rename', v_from, v_to, nullif(btrim(p_reason), ''),
     v_preview || jsonb_build_object('revenue', v_revenue_after));
  return v_preview || jsonb_build_object('revenue', v_revenue_after);
end;
$$;


ALTER FUNCTION private.rename_product_for_actor(p_company uuid, p_actor uuid, p_from text, p_to text, p_reason text) OWNER TO postgres;

--
-- Name: require_platform_admin(text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.require_platform_admin(p_level text) RETURNS public.platform_admin_role
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    declare r public.platform_admin_role;
    begin
      select role into r from public.platform_admins where user_id = auth.uid() and active;
      if r is null then
        raise exception 'Not a platform admin' using errcode = 'P0001', hint = 'not_platform_admin';
      end if;
      case p_level
        when 'read' then null;
        when 'write_company' then
          if r not in ('super_admin', 'operations') then
            raise exception 'Not permitted for this admin role' using errcode = 'P0001', hint = 'no_permission';
          end if;
        else
          raise exception 'Unknown permission level' using errcode = 'P0001', hint = 'unknown_level';
      end case;
      return r;
    end $$;


ALTER FUNCTION private.require_platform_admin(p_level text) OWNER TO postgres;

--
-- Name: resolve_company_product_read(text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.resolve_company_product_read(p_name text) RETURNS TABLE(product_key text, product_name text, match_kind text, match_score numeric, ambiguous boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'extensions'
    AS $_$
  with input as (
    select private.product_key(p_name) as wanted
  ),
  variants as (
    select wanted as variant, 0 as rule_rank, 'exact'::text as match_kind
      from input where wanted is not null
    union
    select left(wanted, length(wanted) - 1), 1, 'trailing_vowel'
      from input where right(wanted, 1) ~ '^[aeiou]$' and length(wanted) > 2
    union
    select wanted || vowel, 1, 'trailing_vowel'
      from input cross join (values ('a'), ('e'), ('i'), ('o'), ('u')) as vowels(vowel)
     where wanted is not null
    union
    select 'vi' || substring(wanted from 3), 2, 'noun_class'
      from input where wanted like 'ki%' and length(wanted) > 3
    union
    select 'ki' || substring(wanted from 3), 2, 'noun_class'
      from input where wanted like 'vi%' and length(wanted) > 3
    union
    select 'mi' || substring(wanted from 2), 2, 'noun_class'
      from input where wanted like 'm%' and wanted not like 'mi%' and length(wanted) > 2
    union
    select 'm' || substring(wanted from 3), 2, 'noun_class'
      from input where wanted like 'mi%' and length(wanted) > 3
    union
    select 'ma' || substring(wanted from 3), 2, 'noun_class'
      from input where wanted like 'ji%' and length(wanted) > 3
    union
    select 'ji' || substring(wanted from 3), 2, 'noun_class'
      from input where wanted like 'ma%' and length(wanted) > 3
    union
    select 'ma' || wanted, 2, 'noun_class'
      from input where wanted is not null and wanted not like 'ma%' and length(wanted) > 2
    union
    select substring(wanted from 3), 2, 'noun_class'
      from input where wanted like 'ma%' and length(wanted) > 4
  ),
  catalog as materialized (
    select c.product_key, c.product_name
      from public.company_product_catalog(null, null, false) c
     where c.product_key is not null
  ),
  candidates as (
    select c.product_key, c.product_name, v.match_kind, v.rule_rank,
           case v.rule_rank when 0 then 1.0 when 1 then 0.95 else 0.90 end::numeric as score
      from catalog c
      join variants v on v.variant = c.product_key
    union all
    select c.product_key, c.product_name, 'trigram', 3,
           extensions.similarity(c.product_key, i.wanted)::numeric
      from catalog c cross join input i
     where i.wanted is not null
       and extensions.similarity(c.product_key, i.wanted) >= 0.45
  ),
  one_rule_per_product as (
    select product_key, product_name, match_kind, rule_rank, score
      from (
        select c.*,
               row_number() over (
                 partition by c.product_key
                 order by c.rule_rank, c.score desc, c.product_key
               ) as product_rule
          from candidates c
      ) ranked_rules
     where product_rule = 1
  ),
  ranked as (
    select c.*,
           row_number() over (order by c.rule_rank, c.score desc, c.product_key) as result_rank
      from one_rule_per_product c
  ),
  decision as (
    select coalesce(
      exists (
        select 1
          from ranked first_match
          join ranked second_match on second_match.result_rank = 2
         where first_match.result_rank = 1
           and second_match.rule_rank = first_match.rule_rank
           and (
             first_match.rule_rank < 3
             or first_match.score - second_match.score <= 0.05
           )
      ), false
    ) as is_ambiguous
  )
  select r.product_key, r.product_name, r.match_kind, round(r.score, 4), d.is_ambiguous
    from ranked r cross join decision d
   where r.result_rank <= case when d.is_ambiguous then 3 else 1 end
   order by r.result_rank;
$_$;


ALTER FUNCTION private.resolve_company_product_read(p_name text) OWNER TO postgres;

--
-- Name: shop_owner_of(uuid); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.shop_owner_of(p_company_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select p.id
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p_company_id
     and m.role::text = 'owner'
     and m.deactivated_at is null
   order by m.joined_at, p.created_at
   limit 1;
$$;


ALTER FUNCTION private.shop_owner_of(p_company_id uuid) OWNER TO postgres;

--
-- Name: snapshot_daily_record_stock_unit(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.snapshot_daily_record_stock_unit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_company uuid;
  v_kind text;
  v_key text := private.product_key(new.description);
  v_declared public.product_units;
  v_base text;
  v_matches integer;
  v_moves_stock boolean;
  v_needs_sale_unit boolean;
  v_needs_purchase_unit boolean;
begin
  select r.company_id, r.kind into v_company, v_kind
    from public.daily_records r where r.id = new.daily_record_id;

  v_moves_stock := v_kind in ('sale', 'debt_issued', 'stock_purchase', 'supplier_payable', 'stock_loss', 'owner_use');
  v_needs_sale_unit := v_kind in ('sale', 'debt_issued');
  v_needs_purchase_unit := v_kind in ('stock_purchase', 'supplier_payable');

  if not v_moves_stock or v_key is null then
    new.stock_base_quantity := null;
    new.stock_base_unit := null;
    new.unit_base_quantity := null;
    return new;
  end if;

  if not exists (
    select 1 from public.product_units u
     where u.company_id = v_company and u.product_key = v_key
  ) then
    if nullif(btrim(coalesce(new.unit, '')), '') is null then
      select count(*) into v_matches
        from public.product_units u
       where u.company_id = v_company
         and private.product_key(new.description) = u.product_key || ' ' || u.unit_key
         and ((v_needs_sale_unit and u.can_sell)
              or (v_needs_purchase_unit and u.can_purchase)
              or (not v_needs_sale_unit and not v_needs_purchase_unit));
      if v_matches > 1 then
        raise exception 'the product and unit match more than one declared item'
          using errcode = 'P0001', hint = 'ambiguous_unit';
      end if;
      if v_matches = 1 then
        select * into v_declared
          from public.product_units u
         where u.company_id = v_company
           and private.product_key(new.description) = u.product_key || ' ' || u.unit_key
           and ((v_needs_sale_unit and u.can_sell)
                or (v_needs_purchase_unit and u.can_purchase)
                or (not v_needs_sale_unit and not v_needs_purchase_unit));
        v_key := v_declared.product_key;
        new.unit := v_declared.unit_name;
      end if;
    end if;
    if v_declared.id is null then
      new.stock_base_quantity := round(new.quantity, 6);
      new.stock_base_unit := nullif(btrim(coalesce(new.unit, '')), '');
      new.unit_base_quantity := 1;
      return new;
    end if;
  end if;

  if nullif(btrim(coalesce(new.unit, '')), '') is null then
    raise exception 'this product has several declared units; say which one moved'
      using errcode = 'P0001', hint = 'unit_required';
  end if;
  if v_declared.id is null then
    select * into v_declared
      from private.product_declared_unit(v_company, v_key, new.unit);
  end if;
  if v_declared.id is null then
    raise exception 'the stated unit is not declared for this product'
      using errcode = 'P0001', hint = 'unknown_unit';
  end if;
  if v_needs_sale_unit and not v_declared.can_sell then
    raise exception 'the stated unit is not a selling unit for this product'
      using errcode = 'P0001', hint = 'unknown_sale_unit';
  end if;
  if v_needs_purchase_unit and not v_declared.can_purchase then
    raise exception 'the stated unit is not a purchase unit for this product'
      using errcode = 'P0001', hint = 'unknown_purchase_unit';
  end if;

  select unit_name into v_base from public.product_units
   where company_id = v_company and product_key = v_key and is_base;
  new.description := v_declared.product_name;
  new.unit := v_declared.unit_name;
  new.unit_base_quantity := v_declared.base_quantity;
  new.stock_base_quantity := round(new.quantity * v_declared.base_quantity, 6);
  new.stock_base_unit := v_base;
  return new;
end;
$$;


ALTER FUNCTION private.snapshot_daily_record_stock_unit() OWNER TO postgres;

--
-- Name: staff_retirement_actor_name(uuid); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.staff_retirement_actor_name(p_actor uuid) RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select coalesce((select full_name from public.profiles where id = p_actor), 'A colleague');
$$;


ALTER FUNCTION private.staff_retirement_actor_name(p_actor uuid) OWNER TO postgres;

--
-- Name: staff_retirement_check_receipt_eligible(uuid, uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.staff_retirement_check_receipt_eligible(p_receipt uuid, p_company uuid, p_staff uuid, p_project uuid, p_retirement uuid DEFAULT NULL::uuid) RETURNS numeric
    LANGUAGE plpgsql STABLE
    AS $$
declare r record;
begin
  select * into r
    from public.receipts
   where id = p_receipt;
  if not found then
    raise exception 'one or more receipts could not be found' using errcode = 'P0001', hint = 'receipt_not_found';
  end if;
  if r.company_id <> p_company or r.uploaded_by <> p_staff or r.project_id is distinct from p_project then
    raise exception 'retirements can include only your own receipts on the selected project'
      using errcode = 'P0001', hint = 'wrong_receipt_scope';
  end if;
  if r.status <> 'confirmed' then
    raise exception 'only confirmed receipts can be retired' using errcode = 'P0001', hint = 'not_confirmed';
  end if;
  if r.reimbursed_at is not null then
    raise exception 'a receipt that was already reimbursed cannot also be retired'
      using errcode = 'P0001', hint = 'already_reimbursed';
  end if;
  if r.payment_method = 'petty_cash' then
    raise exception 'petty-cash receipts cannot be retired as staff claims'
      using errcode = 'P0001', hint = 'petty_cash_not_allowed';
  end if;
  if r.payment_method is null then
    raise exception 'choose a payment source before retiring a receipt'
      using errcode = 'P0001', hint = 'payment_source_missing';
  end if;
  if exists (
    select 1
      from public.staff_retirement_receipts srr
      join public.staff_retirements sr on sr.id = srr.retirement_id
     where srr.receipt_id = p_receipt
       and sr.id is distinct from p_retirement
       and private.staff_retirement_is_live(sr.status)
  ) then
    raise exception 'a receipt cannot be in more than one live retirement'
      using errcode = 'P0001', hint = 'duplicate_live_retirement';
  end if;

  return coalesce(r.total_amount, 0);
end $$;


ALTER FUNCTION private.staff_retirement_check_receipt_eligible(p_receipt uuid, p_company uuid, p_staff uuid, p_project uuid, p_retirement uuid) OWNER TO postgres;

--
-- Name: staff_retirement_is_live(public.staff_retirement_status); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.staff_retirement_is_live(p_status public.staff_retirement_status) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select p_status::text = any (array[
    'submitted',
    'viewed',
    'changes_requested',
    'approved',
    'paid',
    'received_confirmed'
  ]);
$$;


ALTER FUNCTION private.staff_retirement_is_live(p_status public.staff_retirement_status) OWNER TO postgres;

--
-- Name: staff_retirement_notify_finance(uuid, uuid, text, text, text, jsonb); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.staff_retirement_notify_finance(p_company uuid, p_actor uuid, p_type text, p_title text, p_body text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  insert into public.app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  select p_company, p.id, p_actor, p_type, p_title, p_body, coalesce(p_metadata, '{}'::jsonb)
    from public.profiles p
   where p.company_id = p_company
     and p.role in ('owner', 'accountant')
     and p.deactivated_at is null
     and p.id is distinct from p_actor;
$$;


ALTER FUNCTION private.staff_retirement_notify_finance(p_company uuid, p_actor uuid, p_type text, p_title text, p_body text, p_metadata jsonb) OWNER TO postgres;

--
-- Name: staff_retirement_notify_staff(uuid, uuid, uuid, text, text, text, jsonb); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.staff_retirement_notify_staff(p_company uuid, p_staff uuid, p_actor uuid, p_type text, p_title text, p_body text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  insert into public.app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  select p_company, p_staff, p_actor, p_type, p_title, p_body, coalesce(p_metadata, '{}'::jsonb)
   where p_staff is distinct from p_actor;
$$;


ALTER FUNCTION private.staff_retirement_notify_staff(p_company uuid, p_staff uuid, p_actor uuid, p_type text, p_title text, p_body text, p_metadata jsonb) OWNER TO postgres;

--
-- Name: staff_retirement_require_reason(text, text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.staff_retirement_require_reason(p_reason text, p_message text) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
declare v_reason text;
begin
  if not private.is_meaningful_reason(p_reason) then
    raise exception '%', p_message using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;
  v_reason := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  return v_reason;
end $$;


ALTER FUNCTION private.staff_retirement_require_reason(p_reason text, p_message text) OWNER TO postgres;

--
-- Name: supplier_claim_actor_name(uuid); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.supplier_claim_actor_name(p_actor uuid) RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select coalesce((select full_name from public.profiles where id = p_actor), 'Finance');
$$;


ALTER FUNCTION private.supplier_claim_actor_name(p_actor uuid) OWNER TO postgres;

--
-- Name: supplier_claim_add_supplier_message(uuid, text, text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.supplier_claim_add_supplier_message(p_claim uuid, p_author_name text, p_message text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  insert into public.supplier_claim_messages (claim_id, author_side, author_name, message)
  values (p_claim, 'company', nullif(btrim(p_author_name), ''), btrim(p_message));
$$;


ALTER FUNCTION private.supplier_claim_add_supplier_message(p_claim uuid, p_author_name text, p_message text) OWNER TO postgres;

--
-- Name: supplier_claim_notify_finance(uuid, uuid, text, text, text, jsonb); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.supplier_claim_notify_finance(p_company uuid, p_actor uuid, p_type text, p_title text, p_body text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  insert into public.app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  select p_company, p.id, p_actor, p_type, p_title, p_body, coalesce(p_metadata, '{}'::jsonb)
    from public.profiles p
   where p.company_id = p_company
     and p.role in ('owner', 'accountant')
     and p.deactivated_at is null
     and p.id is distinct from p_actor;
$$;


ALTER FUNCTION private.supplier_claim_notify_finance(p_company uuid, p_actor uuid, p_type text, p_title text, p_body text, p_metadata jsonb) OWNER TO postgres;

--
-- Name: supplier_claim_require_finance(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.supplier_claim_require_finance() RETURNS void
    LANGUAGE plpgsql STABLE
    AS $$
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may manage supplier claims'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
end $$;


ALTER FUNCTION private.supplier_claim_require_finance() OWNER TO postgres;

--
-- Name: supplier_claim_require_reason(text, text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.supplier_claim_require_reason(p_reason text, p_message text) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_reason text;
begin
  if not private.is_meaningful_reason(p_reason) then
    raise exception '%', p_message using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;
  v_reason := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  return v_reason;
end $$;


ALTER FUNCTION private.supplier_claim_require_reason(p_reason text, p_message text) OWNER TO postgres;

--
-- Name: wa_create_business_classified(uuid, text, text, text, text, text, text, numeric, jsonb); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.wa_create_business_classified(p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text, p_category text, p_subcategory text, p_confidence numeric, p_keywords jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_company uuid;
begin
  if exists (select 1 from whatsapp_identities where phone_e164 = p_phone and revoked_at is null) then
    raise exception 'this number is already linked' using errcode = 'P0001', hint = 'already_linked';
  end if;
  if coalesce(btrim(p_company_name), '') = '' then
    raise exception 'a business needs a name' using errcode = 'P0001';
  end if;
  if (p_category is null) <> (p_subcategory is null) then
    raise exception 'business classification is incomplete' using errcode = 'P0001', hint = 'bad_classification';
  end if;
  if p_category is not null then
    if p_confidence is null or p_confidence < 0 or p_confidence > 1 then
      raise exception 'business classification confidence is invalid' using errcode = 'P0001', hint = 'bad_classification';
    end if;
    if p_keywords is not null and jsonb_typeof(p_keywords) <> 'array' then
      raise exception 'business classification keywords must be an array' using errcode = 'P0001', hint = 'bad_classification';
    end if;
  end if;

  insert into companies (
    name, hq_location, sector,
    business_category, business_subcategory,
    business_classification_confidence, business_classification_keywords,
    business_classified_at
  ) values (
    btrim(p_company_name),
    coalesce(nullif(btrim(p_location), ''), 'Tanzania'),
    nullif(btrim(p_subcategory), ''),
    nullif(btrim(p_category), ''),
    nullif(btrim(p_subcategory), ''),
    p_confidence,
    case when p_keywords is null then null else (
      select coalesce(jsonb_agg(cleaned.value), '[]'::jsonb)
      from (
        select left(btrim(keyword), 60) as value
        from jsonb_array_elements_text(p_keywords) as keywords(keyword)
        where btrim(keyword) <> ''
        limit 8
      ) cleaned
    ) end,
    case when p_category is null then null else now() end
  ) returning id into v_company;

  insert into profiles (id, company_id, active_company_id, full_name, phone, role)
  values (p_user, v_company, v_company, coalesce(nullif(btrim(p_full_name), ''), 'Mmiliki'), p_phone, 'owner');

  insert into company_members (profile_id, company_id, role)
  values (p_user, v_company, 'owner');

  insert into whatsapp_identities (profile_id, company_id, phone_e164, lang)
  values (p_user, v_company, p_phone,
          (select lang from whatsapp_onboarding where phone_e164 = p_phone));

  -- Create 5-day trial subscription for new business
  insert into public.subscriptions (company_id, plan, cycle, status, trial_ends_at, current_period_start, current_period_end, grace_until)
  values (v_company, 'ndogo', 'monthly', 'trialing', now() + interval '5 days', current_date, current_date + interval '1 month', null);

  delete from whatsapp_onboarding where phone_e164 = p_phone;
  return jsonb_build_object(
    'company_id', v_company,
    'company_name', btrim(p_company_name),
    'business_category', p_category,
    'business_subcategory', p_subcategory
  );
end $$;


ALTER FUNCTION private.wa_create_business_classified(p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text, p_category text, p_subcategory text, p_confidence numeric, p_keywords jsonb) OWNER TO postgres;

--
-- Name: accept_legal_terms(text, boolean, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.accept_legal_terms(p_version text, p_accept boolean, p_language text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and deactivated_at is null) then raise exception 'authentication_required'; end if;
  if p_accept is distinct from true or p_language not in ('sw','en') or p_language is null then raise exception 'explicit_acceptance_required'; end if;
  if not exists(select 1 from public.legal_policy_versions where version=p_version and active) then raise exception 'policy_version_changed'; end if;
  insert into public.legal_acceptances(profile_id,version,language,source) values(auth.uid(),p_version,p_language,'app') on conflict do nothing;
  return true;
end $$;


ALTER FUNCTION public.accept_legal_terms(p_version text, p_accept boolean, p_language text) OWNER TO postgres;

--
-- Name: allocate_project_petty_cash(uuid, uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.allocate_project_petty_cash(p_project uuid, p_user uuid, p_amount numeric, p_description text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company uuid; v_budget numeric; v_reserved numeric;
  v_is_owner boolean; v_is_leader boolean; v_account uuid; v_txn uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  v_is_owner := (private.auth_role() = 'owner');
  select exists (
    select 1 from project_members
     where project_id = p_project and profile_id = auth.uid() and role = 'leader'
  ) into v_is_leader;
  if not (v_is_owner or v_is_leader) then raise exception 'not authorized for this project'; end if;

  select company_id, petty_cash_budget into v_company, v_budget from projects where id = p_project;
  if v_company is null or v_company <> private.auth_company_id() then
    raise exception 'project not in your company';
  end if;
  if not exists (select 1 from project_members where project_id = p_project and profile_id = p_user) then
    raise exception 'user is not a member of this project';
  end if;

  select coalesce(sum(amount), 0) into v_reserved
    from petty_cash_transactions
   where project_id = p_project and type = 'allocation' and status in ('pending', 'accepted');
  if not v_is_owner and (v_reserved + p_amount) > v_budget then
    raise exception 'exceeds project budget (reserved % of %)', v_reserved, v_budget;
  end if;

  select id into v_account from petty_cash_accounts where user_id = p_user and company_id = v_company;
  if v_account is null then
    insert into petty_cash_accounts (user_id, company_id) values (p_user, v_company) returning id into v_account;
  end if;

  insert into petty_cash_transactions (account_id, amount, type, project_id, description, created_by, status)
  values (v_account, p_amount, 'allocation', p_project, coalesce(p_description, 'Project allocation'), auth.uid(), 'pending')
  returning id into v_txn;

  insert into app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  values (
    v_company, p_user, auth.uid(), 'petty_cash_request', 'Petty cash top-up request',
    'You have received a project cash top-up request of TSh ' || trim(to_char(p_amount, 'FM999,999,999,999,990.00')) || '. Accept it before using the funds.',
    jsonb_build_object('transaction_id', v_txn, 'amount', p_amount, 'project_id', p_project)
  );
  return v_txn;
end;
$$;


ALTER FUNCTION public.allocate_project_petty_cash(p_project uuid, p_user uuid, p_amount numeric, p_description text) OWNER TO postgres;

--
-- Name: archive_product(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.archive_product(p_key text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_company uuid := private.auth_company_id();
  v_actor uuid := auth.uid();
  v_key text := lower(btrim(coalesce(p_key, '')));
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may archive a product'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_key = '' then
    raise exception 'which product?' using errcode = 'P0001', hint = 'no_product';
  end if;

  insert into product_archives (company_id, product_key, archived_by, reason)
  values (v_company, v_key, v_actor, nullif(btrim(p_reason), ''))
  on conflict (company_id, product_key)
    do update set archived_at = clock_timestamp(), archived_by = v_actor,
                  reason = nullif(btrim(p_reason), '');

  insert into product_events (company_id, actor_id, action, product_key, reason)
  values (v_company, v_actor, 'archive', v_key, nullif(btrim(p_reason), ''));

  return jsonb_build_object('archived', true, 'product_key', v_key);
end $$;


ALTER FUNCTION public.archive_product(p_key text, p_reason text) OWNER TO postgres;

--
-- Name: billing_grace_days(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.billing_grace_days() RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$ select 3 $$;


ALTER FUNCTION public.billing_grace_days() OWNER TO postgres;

--
-- Name: billing_queue_reminders(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.billing_queue_reminders() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_due       integer := 0;
  v_overdue   integer := 0;
  v_suspended integer := 0;
begin
  create temporary table if not exists _billing_targets (
    identity_id uuid, company_id uuid, phone text, lang text,
    business_name text, plan_name text, amount_tzs integer,
    period_start date, status text, grace_days_left integer,
    muted boolean
  ) on commit drop;
  delete from _billing_targets;

  insert into _billing_targets
  select wi.id, s.company_id, wi.phone_e164, coalesce(wi.lang, pr.lang, 'sw'),
         coalesce(c.name, 'Risip'), bp.name_sw, i.amount_tzs, i.period_start,
         s.status,
         case when s.grace_until is null then null
              else greatest(0, s.grace_until - current_date) end,
         wi.proactive_notifications_opted_out_at is not null
    from public.subscriptions s
    join public.subscription_invoices i
      on i.subscription_id = s.id
     and i.status = 'open'
     and i.period_start = s.current_period_end
    join public.billing_plans bp on bp.code = s.plan
    join public.companies c on c.id = s.company_id
    join public.profiles pr on pr.company_id = s.company_id
     and pr.role = 'owner' and pr.deactivated_at is null
    join public.whatsapp_identities wi
      on wi.profile_id = pr.id and wi.revoked_at is null
   where s.status in ('trialing', 'active', 'past_due', 'suspended');

  with queued as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select t.identity_id, t.company_id, 'billing_due', current_date, 'bill',
           t.phone, t.lang, 'risip_bili',
           jsonb_build_object(
             'business_name', t.business_name,
             'plan_name', t.plan_name,
             'amount_tzs', t.amount_tzs,
             'period_start', t.period_start
           )
      from _billing_targets t
     where t.status in ('trialing', 'active')
       and t.period_start >= current_date
       and not t.muted
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning 1
  ) select count(*) into v_due from queued;

  with queued as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select t.identity_id, t.company_id, 'billing_overdue', current_date, 'bill',
           t.phone, t.lang, 'risip_bili',
           jsonb_build_object(
             'business_name', t.business_name,
             'plan_name', t.plan_name,
             'amount_tzs', t.amount_tzs,
             'period_start', t.period_start,
             'grace_days_left', coalesce(t.grace_days_left, 0)
           )
      from _billing_targets t
     where t.status = 'past_due'
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning 1
  ) select count(*) into v_overdue from queued;

  with queued as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select t.identity_id, t.company_id, 'billing_suspended', current_date, 'bill',
           t.phone, t.lang, 'risip_bili',
           jsonb_build_object(
             'business_name', t.business_name,
             'plan_name', t.plan_name,
             'amount_tzs', t.amount_tzs,
             'period_start', t.period_start
           )
      from _billing_targets t
     where t.status = 'suspended'
       and not exists (
         select 1 from public.whatsapp_notification_deliveries d
          where d.identity_id = t.identity_id
            and d.notification_kind = 'billing_suspended'
       )
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning 1
  ) select count(*) into v_suspended from queued;

  return jsonb_build_object(
    'ran_at', clock_timestamp(),
    'due', v_due,
    'overdue', v_overdue,
    'suspended', v_suspended
  );
end
$$;


ALTER FUNCTION public.billing_queue_reminders() OWNER TO postgres;

--
-- Name: FUNCTION billing_queue_reminders(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.billing_queue_reminders() IS 'Queues owner billing reminders through the risip_bili utility template, including when the WhatsApp 24-hour customer-service window is closed.';


--
-- Name: billing_raise_due_invoices(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.billing_raise_due_invoices() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_grace    integer := public.billing_grace_days();
  v_expired  integer := 0;
  v_overdue  integer := 0;
  v_stopped  integer := 0;
  v_raised   integer := 0;
begin
  -- 1. A trial that has run out is no longer a trial. It does not go straight
  --    to suspended: the shop has never been asked for money yet, so it gets
  --    the same grace as anybody whose payment is late.
  with moved as (
    update public.subscriptions
       set status = 'past_due',
           grace_until = coalesce(grace_until, current_date + v_grace),
           updated_at = clock_timestamp()
     where status = 'trialing'
       and trial_ends_at is not null
       and trial_ends_at < clock_timestamp()
    returning 1
  ) select count(*) into v_expired from moved;

  -- 2. A period that ended and was not paid for.
  with moved as (
    update public.subscriptions
       set status = 'past_due',
           grace_until = coalesce(grace_until, current_period_end + v_grace),
           updated_at = clock_timestamp()
     where status = 'active'
       and current_period_end < current_date
    returning 1
  ) select count(*) into v_overdue from moved;

  -- 3. Grace spent. READ-ONLY, never deleted, never hidden.
  with moved as (
    update public.subscriptions
       set status = 'suspended',
           updated_at = clock_timestamp()
     where status = 'past_due'
       and grace_until is not null
       and grace_until < current_date
    returning 1
  ) select count(*) into v_stopped from moved;

  -- 4. The invoices themselves.
  --
  --    period_start is the OLD period's end, so a payment that arrives three
  --    days late still buys the month it was for rather than a month from
  --    today. The amount is snapshotted here and never read from the plan
  --    table again, because what a shop was charged in October is what it was
  --    charged in October.
  with raised as (
    insert into public.subscription_invoices
      (subscription_id, company_id, plan, cycle, amount_tzs, period_start, period_end)
    select s.id,
           s.company_id,
           s.plan,
           s.cycle,
           case when s.cycle = 'yearly' then p.yearly_tzs else p.monthly_tzs end,
           s.current_period_end,
           (s.current_period_end
              + case when s.cycle = 'yearly' then interval '12 months' else interval '1 month' end)::date
      from public.subscriptions s
      join public.billing_plans p on p.code = s.plan
     where s.status in ('trialing', 'active', 'past_due')
       and s.current_period_end <= current_date + v_grace
    -- The one-invoice-per-period index. A schedule that fires twice, a founder
    -- pressing the button and a retried job all land here and do nothing.
    on conflict (subscription_id, period_start) do nothing
    returning 1
  ) select count(*) into v_raised from raised;

  return jsonb_build_object(
    'ran_at', clock_timestamp(),
    'trials_expired', v_expired,
    'moved_to_past_due', v_overdue,
    'suspended', v_stopped,
    'invoices_raised', v_raised
  );
end
$$;


ALTER FUNCTION public.billing_raise_due_invoices() OWNER TO postgres;

--
-- Name: FUNCTION billing_raise_due_invoices(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.billing_raise_due_invoices() IS 'Daily billing sweep. Moves subscription states and raises the invoices that are due. Charges nobody: money is asked for by a person saying yes on their own handset, and confirmed only by a signed webhook.';


--
-- Name: billing_refresh_usage(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.billing_refresh_usage() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_rows integer := 0;
  v_over integer := 0;
begin
  with counted as (
    insert into public.subscription_usage
      (subscription_id, company_id, period_start, period_end, messages_used, allowance)
    select s.id,
           s.company_id,
           w.window_start,
           w.window_end,
           (select count(*)
              from public.whatsapp_messages m
             where m.company_id = s.company_id
               and m.created_at >= w.window_start::timestamptz
               and m.created_at <  (w.window_end + 1)::timestamptz),
           p.message_allowance
      from public.subscriptions s
      join public.billing_plans p on p.code = s.plan
     cross join lateral public.billing_usage_window(
                  s.current_period_start, s.current_period_end) w
     where s.status in ('trialing', 'active', 'past_due', 'suspended')
    on conflict (subscription_id, period_start) do update
      set messages_used = excluded.messages_used,
          period_end    = excluded.period_end,
          allowance     = excluded.allowance,
          refreshed_at  = clock_timestamp()
    returning messages_used, allowance
  )
  select count(*), count(*) filter (where messages_used > allowance)
    into v_rows, v_over
    from counted;

  return jsonb_build_object(
    'ran_at', clock_timestamp(),
    'subscriptions_counted', v_rows,
    'over_allowance', v_over
  );
end
$$;


ALTER FUNCTION public.billing_refresh_usage() OWNER TO postgres;

--
-- Name: FUNCTION billing_refresh_usage(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.billing_refresh_usage() IS 'Recomputes this period''s message count for every running subscription. Recomputed from source rather than incremented, because a counter that drifts is worse than none.';


--
-- Name: billing_usage_now(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.billing_usage_now() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_company uuid := private.auth_company_id();
  v_now public.subscription_usage%rowtype;
  v_streak integer := 0;
  r record;
begin
  if v_company is null then return null; end if;

  -- The window that contains today, rather than the one whose start happens to
  -- equal the subscription's. On a yearly cycle those are the same thing only
  -- in the first month, which is how the old join hid the bug.
  select u.* into v_now
    from public.subscription_usage u
    join public.subscriptions s on s.id = u.subscription_id
   cross join lateral public.billing_usage_window(
                s.current_period_start, s.current_period_end) w
   where u.company_id = v_company
     and u.period_start = w.window_start;
  if not found then return null; end if;

  -- Counted backwards from the newest CLOSED window. The first window that was
  -- inside its allowance ends the streak.
  for r in
    select messages_used, allowance
      from public.subscription_usage
     where company_id = v_company
       and period_start < v_now.period_start
     order by period_start desc
     limit 12
  loop
    exit when r.messages_used <= r.allowance;
    v_streak := v_streak + 1;
  end loop;

  return jsonb_build_object(
    'period_start', v_now.period_start,
    'period_end', v_now.period_end,
    'messages_used', v_now.messages_used,
    'allowance', v_now.allowance,
    'over_by', greatest(0, v_now.messages_used - v_now.allowance),
    'consecutive_over', v_streak,
    'refreshed_at', v_now.refreshed_at
  );
end
$$;


ALTER FUNCTION public.billing_usage_now() OWNER TO postgres;

--
-- Name: billing_usage_window(date, date, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.billing_usage_window(p_period_start date, p_period_end date, p_on date DEFAULT CURRENT_DATE) RETURNS TABLE(window_start date, window_end date)
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  with span as (
    select greatest(0, (extract(year  from age(greatest(p_on, p_period_start), p_period_start)) * 12
                      + extract(month from age(greatest(p_on, p_period_start), p_period_start)))::int) as elapsed,
           greatest(1, (extract(year  from age(p_period_end, p_period_start)) * 12
                      + extract(month from age(p_period_end, p_period_start)))::int) as total
  ),
  -- The last day of a period belongs to the LAST window, not to a new one.
  -- Without this clamp, day 30 of a monthly period was a fresh window one day
  -- long and the month's count restarted at nearly zero on the day the shop
  -- most needed it to be right.
  elapsed as (select least(elapsed, total - 1) as months from span)
  select (p_period_start + (months || ' months')::interval)::date,
         least((p_period_start + ((months + 1) || ' months')::interval)::date, p_period_end)
    from elapsed;
$$;


ALTER FUNCTION public.billing_usage_window(p_period_start date, p_period_end date, p_on date) OWNER TO postgres;

--
-- Name: FUNCTION billing_usage_window(p_period_start date, p_period_end date, p_on date); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.billing_usage_window(p_period_start date, p_period_end date, p_on date) IS 'The monthly slice of a billing period that contains a given day. A monthly period returns itself; a yearly period returns one of twelve slices.';


--
-- Name: billing_write_block(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.billing_write_block() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_company uuid := private.auth_company_id();
  v_row public.subscriptions%rowtype;
begin
  if v_company is null then return null; end if;
  select * into v_row from public.subscriptions where company_id = v_company;
  if not found or v_row.status not in ('suspended', 'cancelled') then
    return null;
  end if;
  return jsonb_build_object(
    'blocked', true,
    'status', v_row.status,
    'plan', v_row.plan,
    'period_end', v_row.current_period_end
  );
end
$$;


ALTER FUNCTION public.billing_write_block() OWNER TO postgres;

--
-- Name: bucha_reporting_snapshot(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.bucha_reporting_snapshot(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_from timestamptz := coalesce(
    p_from,
    date_trunc('day', now() at time zone 'Africa/Dar_es_Salaam')
      at time zone 'Africa/Dar_es_Salaam'
  );
  v_to timestamptz := coalesce(p_to, now());
  v_activity jsonb := '{}'::jsonb;
  v_methods jsonb := '{}'::jsonb;
  v_sales_items jsonb := '[]'::jsonb;
  v_receivables jsonb := '[]'::jsonb;
  v_payables jsonb := '[]'::jsonb;
  v_stock jsonb := '[]'::jsonb;
  v_losses jsonb := '{}'::jsonb;
  v_owner_use jsonb := '{}'::jsonb;
  v_animals jsonb := '{}'::jsonb;
  v_profit jsonb := '{}'::jsonb;
  v_cash_movement numeric := 0;
begin
  if v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant can read company reporting'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_to <= v_from then
    raise exception 'report range is invalid' using errcode = 'P0001', hint = 'invalid_range';
  end if;

  select jsonb_build_object(
    'sales', coalesce(sum(amount) filter (where kind in ('sale', 'debt_issued')), 0),
    'settled_sales', coalesce(sum(amount) filter (where kind = 'sale'), 0),
    'credit_sales', coalesce(sum(amount) filter (where kind = 'debt_issued'), 0),
    'expenses', coalesce(sum(amount) filter (where kind = 'expense'), 0),
    'customer_payments', coalesce(sum(amount) filter (where kind = 'customer_payment'), 0),
    'stock_purchases', coalesce(sum(amount) filter (where kind in ('stock_purchase', 'supplier_payable')), 0),
    'supplier_payments', coalesce(sum(amount) filter (where kind = 'supplier_payment'), 0),
    'whole_animal_cash', coalesce(sum(amount) filter (
      where kind = 'whole_animal_procurement' and payment_method is not null), 0)
  ) into v_activity
  from public.daily_records
  where company_id = v_company and status = 'confirmed'
    and occurred_at >= v_from and occurred_at < v_to;

  select coalesce(jsonb_object_agg(method, total), '{}'::jsonb)
  into v_methods
  from (
    select case
      when kind = 'debt_issued' then 'credit'
      when payment_method in ('cash', 'mobile_money', 'bank', 'other') then payment_method
      else 'unstated'
    end as method,
    sum(amount) as total
    from public.daily_records
    where company_id = v_company and status = 'confirmed'
      and kind in ('sale', 'debt_issued')
      and occurred_at >= v_from and occurred_at < v_to
    group by 1
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc, x.product_name), '[]'::jsonb)
  into v_sales_items
  from (
    select max(l.description) as product_name,
      nullif(max(coalesce(l.unit, l.stock_base_unit)), '') as unit,
      sum(l.quantity) as quantity,
      sum(l.line_total) as total,
      case when sum(l.quantity) > 0 then round(sum(l.line_total) / sum(l.quantity), 2) end as average_unit_price
    from public.daily_records r
    join public.daily_record_lines l on l.daily_record_id = r.id
    where r.company_id = v_company and r.status = 'confirmed'
      and r.kind in ('sale', 'debt_issued')
      and r.occurred_at >= v_from and r.occurred_at < v_to
    group by private.product_key(l.description), private.product_key(coalesce(l.unit, l.stock_base_unit))
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.outstanding desc, x.party_name), '[]'::jsonb)
  into v_receivables
  from (
    select max(btrim(party_name)) as party_name,
      sum(amount) filter (where kind = 'debt_issued') as issued,
      coalesce(sum(amount) filter (where kind = 'customer_payment'), 0) as paid,
      sum(case when kind = 'debt_issued' then amount else -amount end) as outstanding
    from public.daily_records
    where company_id = v_company and status = 'confirmed'
      and party_name is not null and kind in ('debt_issued', 'customer_payment')
    group by private.product_key(party_name)
    having sum(case when kind = 'debt_issued' then amount else -amount end) > 0
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.outstanding desc, x.supplier_name), '[]'::jsonb)
  into v_payables
  from (
    select max(btrim(party_name)) as supplier_name,
      sum(amount) filter (where kind in ('supplier_payable', 'whole_animal_procurement')) as payable,
      coalesce(sum(amount) filter (where kind = 'supplier_payment'), 0) as payments,
      sum(case when kind in ('supplier_payable', 'whole_animal_procurement') then amount else -amount end) as outstanding
    from public.daily_records
    where company_id = v_company and status = 'confirmed' and party_name is not null
      and kind in ('supplier_payable', 'supplier_payment', 'whole_animal_procurement')
      and (kind <> 'whole_animal_procurement' or payment_method is null)
    group by private.product_key(party_name)
    having sum(case when kind in ('supplier_payable', 'whole_animal_procurement') then amount else -amount end) > 0
  ) x;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.product_name), '[]'::jsonb)
  into v_stock from public.wa_stock_on_hand(v_company, null) s;

  with records as (
    select coalesce(sum(amount), 0) as amount,
      count(*) as events,
      count(*) filter (where amount = 0) as unvalued_events
    from public.daily_records
    where company_id = v_company and status = 'confirmed' and kind = 'stock_loss'
      and occurred_at >= v_from and occurred_at < v_to
  ), lines as (
    select coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)), 0) as quantity,
      coalesce(jsonb_agg(jsonb_build_object(
        'product_name', l.description,
        'quantity', coalesce(l.stock_base_quantity, l.quantity),
        'unit', coalesce(l.stock_base_unit, l.unit),
        'value', l.line_total,
        'reason', r.loss_reason,
        'occurred_at', r.occurred_at
      ) order by r.occurred_at desc, l.line_number), '[]'::jsonb) as details
    from public.daily_records r
    join public.daily_record_lines l on l.daily_record_id = r.id
    where r.company_id = v_company and r.status = 'confirmed' and r.kind = 'stock_loss'
      and r.occurred_at >= v_from and r.occurred_at < v_to
  )
  select jsonb_build_object(
    'amount', records.amount, 'events', records.events,
    'unvalued_events', records.unvalued_events,
    'quantity', lines.quantity,
    'valuation_complete', records.unvalued_events = 0,
    'details', lines.details
  ) into v_losses from records cross join lines;

  with records as (
    select coalesce(sum(amount), 0) as amount, count(*) as events
    from public.daily_records
    where company_id = v_company and status = 'confirmed' and kind = 'owner_use'
      and occurred_at >= v_from and occurred_at < v_to
  ), lines as (
    select coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)), 0) as quantity,
      coalesce(jsonb_agg(jsonb_build_object(
        'product_name', l.description,
        'quantity', coalesce(l.stock_base_quantity, l.quantity),
        'unit', coalesce(l.stock_base_unit, l.unit),
        'value', l.line_total,
        'occurred_at', r.occurred_at
      ) order by r.occurred_at desc, l.line_number), '[]'::jsonb) as details
    from public.daily_records r
    join public.daily_record_lines l on l.daily_record_id = r.id
    where r.company_id = v_company and r.status = 'confirmed' and r.kind = 'owner_use'
      and r.occurred_at >= v_from and r.occurred_at < v_to
  )
  select jsonb_build_object(
    'amount', records.amount, 'events', records.events,
    'quantity', lines.quantity, 'details', lines.details
  ) into v_owner_use from records cross join lines;

  with sources as (
    select r.id, r.amount, r.occurred_at, p.animal_type, p.animal_count,
      exists (
        select 1 from public.whole_animal_breakdowns b
        join public.daily_records br on br.id = b.daily_record_id
        where b.source_procurement_daily_record_id = r.id and br.status = 'confirmed'
      ) as has_confirmed_breakdown
    from public.daily_records r
    join public.whole_animal_procurements p on p.daily_record_id = r.id
    where r.company_id = v_company and r.status = 'confirmed'
      and r.occurred_at >= v_from and r.occurred_at < v_to
  ), source_details as (
    select s.*,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'breakdown_daily_record_id', b.daily_record_id,
          'occurred_at', br.occurred_at,
          'cost_allocation_status', b.cost_allocation_status,
          'allocated_cost_total', b.allocated_cost_total,
          'outputs', coalesce((
            select jsonb_agg(jsonb_build_object(
              'product_name', o.product_name, 'quantity', o.quantity,
              'unit', o.unit_name, 'base_quantity', o.base_quantity,
              'base_unit', o.base_unit, 'allocated_cost', o.allocated_cost
            ) order by o.line_number)
            from public.whole_animal_breakdown_outputs o
            where o.breakdown_daily_record_id = b.daily_record_id
          ), '[]'::jsonb)
        ) order by br.occurred_at)
        from public.whole_animal_breakdowns b
        join public.daily_records br on br.id = b.daily_record_id
        where b.source_procurement_daily_record_id = s.id and br.status = 'confirmed'
      ), '[]'::jsonb) as breakdowns
    from sources s
  )
  select jsonb_build_object(
    'count', coalesce(sum(animal_count), 0),
    'procurement_events', count(*),
    'total', coalesce(sum(amount), 0),
    'pending_breakdown', coalesce(sum(animal_count) filter (where not has_confirmed_breakdown), 0),
    'breakdown_outputs', coalesce((
      select sum(o.base_quantity)
      from public.whole_animal_breakdown_outputs o
      join public.whole_animal_breakdowns b on b.daily_record_id = o.breakdown_daily_record_id
      join public.daily_records br on br.id = b.daily_record_id
      where br.status = 'confirmed'
        and b.source_procurement_daily_record_id in (select id from sources)
    ), 0),
    'allocation_incomplete', coalesce((
      select count(*)
      from public.whole_animal_breakdowns b
      join public.daily_records br on br.id = b.daily_record_id
      where br.status = 'confirmed' and b.cost_allocation_status = 'incomplete'
        and b.source_procurement_daily_record_id in (select id from sources)
    ), 0),
    'procurements', coalesce(jsonb_agg(jsonb_build_object(
      'daily_record_id', id, 'animal_type', animal_type,
      'animal_count', animal_count, 'purchase_total', amount,
      'occurred_at', occurred_at,
      'breakdown_status', case when has_confirmed_breakdown then 'confirmed' else 'pending' end,
      'breakdowns', breakdowns
    ) order by occurred_at desc), '[]'::jsonb)
  ) into v_animals from source_details;

  v_profit := public.daily_profit_estimate(v_from, v_to);
  v_cash_movement :=
    coalesce((v_methods->>'cash')::numeric, 0)
    + coalesce((select sum(amount) from public.daily_records where company_id = v_company
      and status = 'confirmed' and kind = 'customer_payment' and payment_method = 'cash'
      and occurred_at >= v_from and occurred_at < v_to), 0)
    - coalesce((select sum(amount) from public.daily_records where company_id = v_company
      and status = 'confirmed' and kind in ('expense', 'stock_purchase', 'supplier_payment', 'whole_animal_procurement')
      and payment_method = 'cash' and occurred_at >= v_from and occurred_at < v_to), 0);

  return jsonb_build_object(
    'timezone', 'Africa/Dar_es_Salaam', 'from', v_from, 'to', v_to,
    'sales', jsonb_build_object(
      'total', (v_activity->>'sales')::numeric,
      'settled_sales', (v_activity->>'settled_sales')::numeric,
      'cash_sales', coalesce((v_methods->>'cash')::numeric, 0),
      'credit_sales', (v_activity->>'credit_sales')::numeric,
      'by_payment_method', v_methods,
      'items', v_sales_items
    ),
    'expenses', (v_activity->>'expenses')::numeric,
    'customer_payments', (v_activity->>'customer_payments')::numeric,
    'stock_purchases', (v_activity->>'stock_purchases')::numeric,
    'supplier_payments', (v_activity->>'supplier_payments')::numeric,
    'whole_animal_cash_purchases', (v_activity->>'whole_animal_cash')::numeric,
    'cash_movement', v_cash_movement,
    'profit', v_profit,
    'customer_receivables', v_receivables,
    'supplier_payables', v_payables,
    'stock', v_stock,
    'stock_loss', v_losses,
    'owner_use', v_owner_use,
    'whole_animals', v_animals
  );
end;
$$;


ALTER FUNCTION public.bucha_reporting_snapshot(p_from timestamp with time zone, p_to timestamp with time zone) OWNER TO postgres;

--
-- Name: cancel_petty_cash_request(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cancel_petty_cash_request(p_transaction uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company uuid; v_status text; v_type text; v_amount numeric;
  v_account_user uuid; v_txn_company uuid; v_changed integer;
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'not authorized';
  end if;
  v_company := private.auth_company_id();

  select t.status, t.type, t.amount, a.user_id, a.company_id
    into v_status, v_type, v_amount, v_account_user, v_txn_company
    from petty_cash_transactions t
    join petty_cash_accounts a on a.id = t.account_id
   where t.id = p_transaction
   for update;
  if not found then raise exception 'top-up request not found'; end if;
  if v_txn_company <> v_company then raise exception 'not in your company'; end if;
  if v_type <> 'allocation' or v_status <> 'pending' then
    raise exception 'only a pending top-up can be cancelled';
  end if;

  update petty_cash_transactions
     set status = 'declined', responded_at = now()
   where id = p_transaction;
  get diagnostics v_changed = row_count;

  insert into app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  values (
    v_company, v_account_user, auth.uid(), 'petty_cash_cancelled',
    'Top-up cancelled',
    'A pending top-up of TSh ' || trim(to_char(v_amount, 'FM999,999,999,999,990'))
      || ' was cancelled by your finance team.',
    jsonb_build_object('transaction_id', p_transaction, 'amount', v_amount)
  );

  return v_changed;
end;
$$;


ALTER FUNCTION public.cancel_petty_cash_request(p_transaction uuid) OWNER TO postgres;

--
-- Name: cancel_retirement(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cancel_retirement(p_retirement uuid, p_reason text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  sr record;
  v_actor uuid := auth.uid();
  v_reason text;
  v_is_finance boolean := private.auth_role() in ('owner', 'accountant');
  v_name text := private.staff_retirement_actor_name(auth.uid());
begin
  v_reason := private.staff_retirement_require_reason(
    p_reason,
    'Please write a clear reason with at least 3 meaningful words, so the cancellation can be audited.'
  );

  select * into sr from public.staff_retirements where id = p_retirement for update;
  if not found then raise exception 'retirement not found' using errcode = 'P0001'; end if;
  if sr.company_id <> private.auth_company_id() then raise exception 'not your company' using errcode = 'P0001'; end if;
  if sr.status in ('received_confirmed'::public.staff_retirement_status, 'rejected'::public.staff_retirement_status, 'cancelled'::public.staff_retirement_status) then
    raise exception 'this retirement is already terminal' using errcode = 'P0001', hint = 'bad_transition';
  end if;
  if not v_is_finance then
    if sr.staff_id <> v_actor then
      raise exception 'only the staff member or finance may cancel a retirement'
        using errcode = 'P0001', hint = 'not_authorized';
    end if;
    if sr.status not in ('submitted'::public.staff_retirement_status, 'viewed'::public.staff_retirement_status, 'changes_requested'::public.staff_retirement_status) then
      raise exception 'after approval, only finance may void or cancel the retirement'
        using errcode = 'P0001', hint = 'not_authorized';
    end if;
  elsif sr.staff_id = v_actor and sr.status in ('approved'::public.staff_retirement_status, 'paid'::public.staff_retirement_status) then
    raise exception 'you submitted this retirement, so another finance user must void it'
      using errcode = 'P0001', hint = 'maker_checker';
  end if;

  update public.staff_retirements
     set status = 'cancelled'::public.staff_retirement_status,
         cancelled_at = now(),
         cancelled_by = v_actor,
         decision_reason = v_reason,
         updated_at = now()
   where id = p_retirement;

  insert into public.staff_retirement_audit_log
    (retirement_id, company_id, actor_id, action, from_status, to_status, reason)
  values
    (p_retirement, sr.company_id, v_actor, 'cancelled', sr.status,
     'cancelled'::public.staff_retirement_status, v_reason);

  if sr.staff_id = v_actor then
    perform private.staff_retirement_notify_finance(
      sr.company_id, v_actor, 'retirement_cancelled', 'Staff cancelled retirement',
      v_name || ' cancelled "' || sr.title || '". Reason: ' || v_reason,
      jsonb_build_object('retirement_id', p_retirement)
    );
  else
    perform private.staff_retirement_notify_staff(
      sr.company_id, sr.staff_id, v_actor, 'retirement_cancelled', 'Retirement cancelled',
      'Your retirement "' || sr.title || '" was cancelled. Reason: ' || v_reason,
      jsonb_build_object('retirement_id', p_retirement)
    );
  end if;

  return 'cancelled';
end $$;


ALTER FUNCTION public.cancel_retirement(p_retirement uuid, p_reason text) OWNER TO postgres;

--
-- Name: chat_days(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.chat_days(p_company uuid) RETURNS TABLE(chat_day date)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select distinct m.chat_day from public.chat_messages m where company_id = p_company order by m.chat_day desc;
$$;


ALTER FUNCTION public.chat_days(p_company uuid) OWNER TO postgres;

--
-- Name: chat_link_phone(text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.chat_link_phone(p_token_hash text, p_phone text, p_wa_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare t public.whatsapp_link_tokens%rowtype; i public.whatsapp_identities%rowtype; v_company uuid;
begin
  select * into t from public.whatsapp_link_tokens where token_hash = p_token_hash for update;
  if t.id is null or t.used_at is not null or t.revoked_at is not null or t.expires_at <= now() or t.attempts >= 5 then raise exception 'invalid_token'; end if;
  select active_company_id into v_company from public.profiles where id = t.profile_id and deactivated_at is null for update;
  if v_company is null then raise exception 'inactive_profile'; end if;
  select * into i from public.whatsapp_identities where profile_id = t.profile_id and revoked_at is null for update;
  if i.id is not null and i.phone_e164 is distinct from p_phone and exists (
    select 1 from public.whatsapp_turn_locks where phone_e164 = 'identity:' || i.id::text and lease_until > clock_timestamp()
  ) then raise exception 'chat_busy'; end if;
  if i.id is null then
    insert into public.whatsapp_identities(profile_id,company_id,phone_e164,wa_id) values(t.profile_id,v_company,p_phone,p_wa_id) returning * into i;
  else
    update public.whatsapp_identities set phone_e164=p_phone,wa_id=p_wa_id,verified_at=now(),updated_at=now() where id=i.id;
  end if;
  update public.whatsapp_link_tokens set used_at=now() where id=t.id;
  return jsonb_build_object('id',i.id,'has_conversation',exists(select 1 from public.whatsapp_conversations where identity_id=i.id and expires_at > now()));
end $$;


ALTER FUNCTION public.chat_link_phone(p_token_hash text, p_phone text, p_wa_id text) OWNER TO postgres;

--
-- Name: chat_pending(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.chat_pending(p_company uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select jsonb_build_object('day', c.chat_day, 'awaiting', coalesce(c.options->>'kind', c.awaiting),
    'message_id', (select id from public.chat_messages m where m.identity_id = i.id and m.company_id = p_company and m.role = 'assistant' order by created_at desc limit 1))
  from public.whatsapp_conversations c join public.whatsapp_identities i on i.id = c.identity_id
  where i.profile_id = auth.uid() and i.revoked_at is null and c.company_id = p_company and c.expires_at > now()
    and exists (select 1 from public.company_members where profile_id = auth.uid() and company_id = p_company and deactivated_at is null);
$$;


ALTER FUNCTION public.chat_pending(p_company uuid) OWNER TO postgres;

--
-- Name: chat_usage_now(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.chat_usage_now() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select jsonb_build_object('messages_used', (select count(*) from public.whatsapp_messages m
    where m.company_id = s.company_id and m.created_at >= w.window_start::timestamptz and m.created_at < (w.window_end + 1)::timestamptz),
    'allowance', p.message_allowance, 'period_end', w.window_end)
  from public.subscriptions s join public.billing_plans p on p.code = s.plan
  cross join lateral public.billing_usage_window(s.current_period_start, s.current_period_end) w
  where s.company_id = private.auth_company_id() and s.status in ('trialing','active','past_due','suspended') limit 1;
$$;


ALTER FUNCTION public.chat_usage_now() OWNER TO postgres;

--
-- Name: claim_marketplace_notifications(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.claim_marketplace_notifications(p_limit integer DEFAULT 20) RETURNS TABLE(delivery_id uuid, phone_e164 text, lang text, notification_kind text, template_name text, parameters jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if p_limit < 1 or p_limit > 200 then
    raise exception 'Delivery limit must be between 1 and 200';
  end if;

  perform pg_advisory_xact_lock(hashtext('claim_marketplace_notifications'));

  return query
  with claimed as (
    update public.whatsapp_notification_deliveries d
       set status = 'sending',
           attempt_count = case when d.status = 'failed'
                                then d.attempt_count + 1 else d.attempt_count end,
           next_attempt_at = null,
           updated_at = now()
     where d.id in (
       select f.id from public.whatsapp_notification_deliveries f
        where f.notification_kind like 'marketplace\_%'
          and (f.status = 'queued'
               or (f.status = 'failed' and f.attempt_count < 3
                   and f.next_attempt_at <= now()))
        order by f.created_at
        limit p_limit
        for update skip locked)
    returning d.*)
  select c.id, c.phone_e164_snapshot, c.language_snapshot,
         c.notification_kind, c.template_name, c.parameters
  from claimed c;
end $$;


ALTER FUNCTION public.claim_marketplace_notifications(p_limit integer) OWNER TO postgres;

--
-- Name: claim_whatsapp_notification_deliveries(timestamp with time zone, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.claim_whatsapp_notification_deliveries(p_now timestamp with time zone DEFAULT clock_timestamp(), p_debt_stale_days integer DEFAULT 7, p_limit integer DEFAULT 50) RETURNS TABLE(delivery_id uuid, phone_e164 text, lang text, notification_kind text, template_name text, parameters jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
#variable_conflict use_column
begin
  if p_debt_stale_days < 1 or p_debt_stale_days > 365 then
    raise exception 'Debt staleness must be between 1 and 365 days';
  end if;
  if p_limit < 1 or p_limit > 200 then
    raise exception 'Delivery limit must be between 1 and 200';
  end if;

  perform pg_advisory_xact_lock(hashtext('claim_whatsapp_notification_deliveries'));

  return query
  with retried as (
    update public.whatsapp_notification_deliveries d
       set status = 'sending', attempt_count = d.attempt_count + 1,
           next_attempt_at = null, updated_at = p_now
     where d.id in (
       select f.id from public.whatsapp_notification_deliveries f
        where f.status = 'failed' and f.attempt_count < 3
          and f.next_attempt_at <= p_now
        order by f.next_attempt_at, f.created_at limit p_limit
        for update skip locked
     ) returning d.*
  )
  select r.id, r.phone_e164_snapshot, r.language_snapshot,
         r.notification_kind, r.template_name, r.parameters from retried r;

  return query
  with eligible as (
    select i.id as identity_id, i.phone_e164,
           case when coalesce(i.lang, p.lang, 'en') = 'sw' then 'sw' else 'en' end as lang,
           c.id as company_id, c.name as company_name,
           coalesce(c.timezone, 'Africa/Dar_es_Salaam') as timezone,
           (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::date as local_date,
           (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam')) as local_now,
           (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::date as current_date
      from public.whatsapp_identities i
      join public.profiles p on p.id = i.profile_id and p.deactivated_at is null
      join public.company_members m on m.profile_id = p.id
       and m.company_id = p.active_company_id and m.deactivated_at is null
       and m.role::text in ('owner', 'accountant')
      join public.companies c on c.id = m.company_id
     where i.revoked_at is null and i.opted_out_at is null
       and i.proactive_notifications_opted_out_at is null
       and i.daily_summary_opted_in_at is not null and c.closing_time is not null
  ), scheduled as (
    select e.*,
           case when e.local_now >= e.current_date + e.closing_time + interval '2 hours'
             then e.current_date else e.current_date - 1 end as business_date
      from eligible e
  ), daily as (
    select e.*, coalesce(sum(r.amount) filter (where r.kind in ('sale', 'debt_issued')), 0) as sales,
           coalesce(sum(r.amount) filter (where r.kind = 'expense'), 0) as expenses,
           count(r.id) as record_count
      from scheduled e join public.daily_records r on r.company_id = e.company_id
       and r.status = 'confirmed'
       and (r.occurred_at at time zone e.timezone)::date = e.business_date
     where e.local_now >= e.business_date + e.closing_time + interval '2 hours'
     group by e.identity_id, e.phone_e164, e.lang, e.company_id, e.company_name,
              e.timezone, e.local_date, e.local_now, e.current_date, e.closing_time, e.business_date
  ), inserted as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select d.identity_id, d.company_id, 'daily_summary', d.business_date, 'daily',
           d.phone_e164, d.lang, 'risip_daily_summary',
           jsonb_build_object('business_name', d.company_name,
             'business_date', d.business_date, 'sales', d.sales, 'expenses', d.expenses,
             'note_key', case when d.expenses > d.sales then 'expenses_exceed_sales' else 'no_issues' end)
      from daily d where d.record_count > 0
     order by d.company_id, d.identity_id limit p_limit
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning *
  )
  select n.id, n.phone_e164_snapshot, n.language_snapshot,
         n.notification_kind, n.template_name, n.parameters from inserted n;

  return query
  with eligible as (
    select i.id as identity_id, i.phone_e164,
           case when coalesce(i.lang, p.lang, 'en') = 'sw' then 'sw' else 'en' end as lang,
           c.id as company_id, coalesce(c.timezone, 'Africa/Dar_es_Salaam') as timezone,
           (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::date as local_date
      from public.whatsapp_identities i
      join public.profiles p on p.id = i.profile_id and p.deactivated_at is null
      join public.company_members m on m.profile_id = p.id
       and m.company_id = p.active_company_id and m.deactivated_at is null
       and m.role::text in ('owner', 'accountant')
      join public.companies c on c.id = m.company_id
     where i.revoked_at is null and i.opted_out_at is null
       and i.proactive_notifications_opted_out_at is null
       and i.debt_reminders_opted_in_at is not null
  ), debts as (
    select r.company_id, lower(regexp_replace(btrim(r.party_name), '\s+', ' ', 'g')) as party_key,
           (array_agg(btrim(r.party_name) order by r.occurred_at desc))[1] as party_name,
           sum(case when r.kind = 'debt_issued' then r.amount else -r.amount end) as balance,
           min(r.occurred_at) filter (where r.kind = 'debt_issued') as recorded_at
      from public.daily_records r where r.status = 'confirmed'
       and r.kind in ('debt_issued', 'customer_payment')
       and nullif(btrim(r.party_name), '') is not null
     group by r.company_id, lower(regexp_replace(btrim(r.party_name), '\s+', ' ', 'g'))
    having sum(case when r.kind = 'debt_issued' then r.amount else -r.amount end) > 0
  ), candidates as (
    select e.*, d.party_key, d.party_name, d.balance, d.recorded_at from eligible e
    cross join lateral (select x.* from debts x where x.company_id = e.company_id
      and x.recorded_at <= p_now - make_interval(days => p_debt_stale_days)
      and not exists (select 1 from public.whatsapp_notification_deliveries old
        where old.identity_id = e.identity_id and old.notification_kind = 'debt_reminder'
          and old.subject_key = x.party_key and old.status in ('sending', 'sent', 'unknown')
          and old.created_at > p_now - interval '7 days')
      order by x.recorded_at, x.party_key limit 1) d
  ), inserted as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select c.identity_id, c.company_id, 'debt_reminder', c.local_date, c.party_key,
           c.phone_e164, c.lang, 'risip_debt_reminder',
           jsonb_build_object('debtor_name', c.party_name, 'amount', c.balance,
             'recorded_date', (c.recorded_at at time zone c.timezone)::date)
      from candidates c order by c.company_id, c.identity_id limit p_limit
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning *
  )
  select n.id, n.phone_e164_snapshot, n.language_snapshot,
         n.notification_kind, n.template_name, n.parameters from inserted n;
end;
$$;


ALTER FUNCTION public.claim_whatsapp_notification_deliveries(p_now timestamp with time zone, p_debt_stale_days integer, p_limit integer) OWNER TO postgres;

--
-- Name: companies_awaiting_close(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.companies_awaiting_close(p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(company_id uuid, company_name text, closing_time time without time zone, records_today integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select
    c.id,
    c.name,
    c.closing_time,
    (select count(*)::int
       from daily_records r
      where r.company_id = c.id
        and r.status = 'confirmed'
        and (r.occurred_at at time zone c.timezone)::date
            = (p_now at time zone c.timezone)::date) as records_today
  from companies c
  where c.closing_time is not null
    and (p_now at time zone c.timezone)::time >= c.closing_time;
$$;


ALTER FUNCTION public.companies_awaiting_close(p_now timestamp with time zone) OWNER TO postgres;

--
-- Name: company_current_selling_prices(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.company_current_selling_prices(p_product_key text DEFAULT NULL::text) RETURNS TABLE(product_key text, sale_unit text, sale_unit_key text, unit_base_quantity numeric, retail_price numeric, wholesale_price numeric, wholesale_min_qty numeric, effective_from timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select distinct on (s.product_key, coalesce(s.sale_unit_key, ''))
    s.product_key, s.sale_unit, s.sale_unit_key, coalesce(s.unit_base_quantity, 1),
    s.retail_price, s.wholesale_price, s.wholesale_min_qty, s.effective_from
  from public.product_selling_prices s
  where s.company_id = private.auth_company_id()
    and (p_product_key is null or s.product_key = private.product_key(p_product_key))
  order by s.product_key, coalesce(s.sale_unit_key, ''), s.effective_from desc, s.created_at desc;
$$;


ALTER FUNCTION public.company_current_selling_prices(p_product_key text) OWNER TO postgres;

--
-- Name: company_plan_caps(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.company_plan_caps() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select coalesce(
    (
      select jsonb_build_object(
        'plan', s.plan,
        'status', s.status,
        -- Kianzio / Ndogo / Kati / Kubwa feature matrix
        'barcode_sell',      s.plan in ('kati', 'kubwa'),
        'barcode_register',  s.plan in ('kati', 'kubwa'),
        'reports',           s.plan in ('kati', 'kubwa'),
        'debts',             s.plan in ('kati', 'kubwa'),
        'profit_per_product', s.plan in ('kati', 'kubwa'),
        'pdf_invoices',      s.plan in ('kubwa'),
        'export',            s.plan in ('kubwa'),
        'compare_shops',     s.plan in ('kubwa'),
        -- B2B inter-shop ordering ("Agizo la bidhaa"): one shop buys stock
        -- from another. Kati and above, alongside the other staff/debt tools.
        'b2b_orders',        s.plan in ('kati', 'kubwa'),
        'max_users',         p.max_users,
        'max_projects',      p.max_projects,
        'message_allowance', p.message_allowance
      )
      from public.subscriptions s
      join public.billing_plans p on p.code = s.plan
      where s.company_id = private.auth_company_id()
        and s.status in ('trialing', 'active', 'past_due', 'suspended')
      limit 1
    ),
    -- No subscription or cancelled: everything open.
    jsonb_build_object(
      'plan', null,
      'status', null,
      'barcode_sell', true,
      'barcode_register', true,
      'reports', true,
      'debts', true,
      'profit_per_product', true,
      'pdf_invoices', true,
      'export', true,
      'compare_shops', true,
      'b2b_orders', true,
      'max_users', 999,
      'max_projects', 999,
      'message_allowance', null
    )
  );
$$;


ALTER FUNCTION public.company_plan_caps() OWNER TO postgres;

--
-- Name: company_product_catalog(timestamp with time zone, timestamp with time zone, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.company_product_catalog(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_include_archived boolean DEFAULT false) RETURNS TABLE(product_key text, product_name text, unit text, quantity_sold numeric, revenue numeric, sale_lines integer, last_sold_at timestamp with time zone, measured boolean, unit_cost numeric, cost_effective_from timestamp with time zone, avg_unit_price numeric, estimated_margin numeric, archived boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  with company as (select private.auth_company_id() as id),
  sold as (
    select
      private.product_key(l.description) as product_key,
      l.description,
      coalesce(l.stock_base_quantity, l.quantity) as base_quantity,
      l.line_total,
      nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') as unit,
      r.occurred_at,
      hc.unit_cost as historical_unit_cost
    from public.daily_record_lines l
    join public.daily_records r on r.id = l.daily_record_id
    left join lateral (
      select coalesce(c.base_unit_cost, c.unit_cost) as unit_cost
        from public.product_costs c
       where c.company_id = r.company_id
         and private.product_key(c.product_key) = private.product_key(l.description)
         and c.effective_from <= r.occurred_at
       order by c.effective_from desc, c.created_at desc
       limit 1
    ) hc on true
    where r.company_id = (select id from company)
      and r.kind = 'sale'
      and r.status = 'confirmed'
      and (p_from is null or r.occurred_at >= p_from)
      and (p_to is null or r.occurred_at < p_to)
      and private.product_key(l.description) is not null
  ),
  totals as (
    select
      s.product_key,
      sum(s.base_quantity) as quantity_sold,
      sum(s.line_total) as revenue,
      count(*)::int as sale_lines,
      max(s.occurred_at) as last_sold_at,
      bool_or(s.base_quantity <> round(s.base_quantity) or s.unit is not null) as measured,
      (array_agg(s.description order by s.occurred_at desc))[1] as product_name,
      (array_agg(s.unit order by s.occurred_at desc) filter (where s.unit is not null))[1] as sold_unit,
      case when bool_and(s.historical_unit_cost is not null)
        then sum(s.line_total - (s.historical_unit_cost * s.base_quantity)) end as estimated_margin
    from sold s
    group by s.product_key
  ),
  bought as (
    select private.product_key(l.description) as product_key,
      (array_agg(l.description order by r.occurred_at desc))[1] as product_name,
      (array_agg(nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') order by r.occurred_at desc)
        filter (where nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null))[1] as unit
    from public.daily_record_lines l
    join public.daily_records r on r.id = l.daily_record_id
    where r.company_id = (select id from company) and r.kind = 'stock_purchase'
      and r.status = 'confirmed' and private.product_key(l.description) is not null
    group by private.product_key(l.description)
  ),
  latest_cost as (
    select distinct on (private.product_key(c.product_key))
      private.product_key(c.product_key) as product_key, c.base_unit,
      coalesce(c.base_unit_cost, c.unit_cost) as unit_cost, c.effective_from, c.product_name
    from public.product_costs c
    where c.company_id = (select id from company)
    order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc
  ),
  latest_stock as (
    select distinct on (private.product_key(s.product_key))
      private.product_key(s.product_key) as product_key, s.product_name, s.unit
    from public.stock_counts s
    where s.company_id = (select id from company) and private.product_key(s.product_key) is not null
    order by private.product_key(s.product_key), s.counted_at desc, s.created_at desc
  ),
  declared_base as (
    select u.product_key, u.product_name, u.unit_name from public.product_units u
    where u.company_id = (select id from company) and u.is_base
  ),
  keys as (
    select product_key from totals union select product_key from latest_cost
    union select product_key from latest_stock union select product_key from declared_base
    union select product_key from bought
  ),
  merged as (
    select k.product_key,
      coalesce(t.product_name, db.product_name, ls.product_name, lc.product_name, b.product_name) as product_name,
      coalesce(db.unit_name, ls.unit, lc.base_unit, t.sold_unit, b.unit) as unit,
      coalesce(t.quantity_sold, 0) as quantity_sold, coalesce(t.revenue, 0) as revenue,
      coalesce(t.sale_lines, 0) as sale_lines, t.last_sold_at,
      coalesce(t.measured, db.unit_name is not null, ls.unit is not null, lc.base_unit is not null, b.unit is not null, false) as measured,
      lc.unit_cost, lc.effective_from as cost_effective_from,
      case when coalesce(t.quantity_sold, 0) > 0 then round(t.revenue / t.quantity_sold, 2) end as avg_unit_price,
      t.estimated_margin
    from keys k
    left join totals t on t.product_key = k.product_key
    left join latest_cost lc on lc.product_key = k.product_key
    left join latest_stock ls on ls.product_key = k.product_key
    left join declared_base db on db.product_key = k.product_key
    left join bought b on b.product_key = k.product_key
    where (select id from company) is not null
  )
  select m.*, (a.product_key is not null) as archived
  from merged m
  left join public.product_archives a on a.company_id = (select id from company)
    and private.product_key(a.product_key) = m.product_key
  where p_include_archived or a.product_key is null
  order by coalesce(m.revenue, 0) desc, m.product_name;
$$;


ALTER FUNCTION public.company_product_catalog(p_from timestamp with time zone, p_to timestamp with time zone, p_include_archived boolean) OWNER TO postgres;

--
-- Name: company_product_names(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.company_product_names(p_company_id uuid) RETURNS TABLE(product_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  with sold as (
    select (array_agg(l.description order by r.occurred_at desc))[1] as name
      from daily_record_lines l join daily_records r on r.id = l.daily_record_id
     where r.company_id = p_company_id and r.kind = 'sale' and r.status = 'confirmed'
       and private.product_key(l.description) is not null
     group by private.product_key(l.description)
  ),
  bought as (
    select (array_agg(l.description order by r.occurred_at desc))[1] as name
      from daily_record_lines l join daily_records r on r.id = l.daily_record_id
     where r.company_id = p_company_id and r.kind in ('stock_purchase', 'supplier_payable')
       and r.status = 'confirmed' and private.product_key(l.description) is not null
     group by private.product_key(l.description)
  ),
  configured as (
    select distinct on (u.product_key) u.product_name as name
      from product_units u where u.company_id = p_company_id
     order by u.product_key, u.is_base desc, u.created_at desc
  ),
  priced as (
    select distinct on (private.product_key(c.product_key)) c.product_name as name
      from product_costs c where c.company_id = p_company_id
     order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc
  ),
  everything as (
    select name from sold union select name from bought union
    select name from configured union select name from priced
  )
  select distinct on (private.product_key(name)) name
    from everything where private.product_key(name) is not null
   order by private.product_key(name), name limit 500;
$$;


ALTER FUNCTION public.company_product_names(p_company_id uuid) OWNER TO postgres;

--
-- Name: company_stock_on_hand(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.company_stock_on_hand() RETURNS TABLE(product_key text, product_name text, unit text, measured boolean, counted_qty numeric, counted_at timestamp with time zone, has_count boolean, bought_since numeric, sold_since numeric, lost_since numeric, taken_since numeric, produced_since numeric, on_hand numeric, incomplete_purchases boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  with company as (select private.auth_company_id() as id),
  last_count as (
    select distinct on (product_key) product_key, product_name, quantity, unit, counted_at
      from public.stock_counts where company_id = (select id from company)
     order by product_key, counted_at desc, created_at desc
  ),
  movement as (
    select private.product_key(l.description) as product_key,
      (array_agg(l.description order by r.occurred_at desc))[1] as product_name,
      (array_agg(nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') order by r.occurred_at desc)
        filter (where nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null))[1] as unit,
      bool_or(coalesce(l.stock_base_quantity, l.quantity) <> round(coalesce(l.stock_base_quantity, l.quantity))
        or nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null) as measured,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind in ('stock_purchase', 'supplier_payable')
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as bought_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind in ('sale', 'debt_issued')
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as sold_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'stock_loss'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as lost_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'owner_use'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as taken_since,
      0::numeric as produced_since
      from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
      left join last_count lc on lc.product_key = private.product_key(l.description)
     where r.company_id = (select id from company) and r.status = 'confirmed'
       and r.kind in ('sale', 'debt_issued', 'stock_purchase', 'supplier_payable', 'stock_loss', 'owner_use')
       and private.product_key(l.description) is not null
     group by private.product_key(l.description)
    union all
    select o.product_key, max(o.product_name), max(o.base_unit), true,
      0::numeric, 0::numeric, 0::numeric, 0::numeric,
      coalesce(sum(o.base_quantity) filter (where lc.counted_at is null or r.occurred_at > lc.counted_at), 0)
      from public.whole_animal_breakdown_outputs o
      join public.daily_records r on r.id = o.breakdown_daily_record_id
      left join last_count lc on lc.product_key = o.product_key
     where r.company_id = (select id from company) and r.status = 'confirmed'
     group by o.product_key
  ),
  grouped as (
    select product_key, max(product_name) as product_name, max(unit) as unit,
      bool_or(measured) as measured, sum(bought_since) as bought_since,
      sum(sold_since) as sold_since, sum(lost_since) as lost_since,
      sum(taken_since) as taken_since, sum(produced_since) as produced_since
      from movement group by product_key
  ),
  bare as (
    select count(*) > 0 as any_bare from public.daily_records r
     where r.company_id = (select id from company) and r.status = 'confirmed'
       and r.kind in ('stock_purchase', 'supplier_payable')
       and not exists (select 1 from public.daily_record_lines l where l.daily_record_id = r.id)
  )
  select coalesce(g.product_key, lc.product_key), coalesce(g.product_name, lc.product_name),
    coalesce(lc.unit, g.unit), coalesce(g.measured, lc.unit is not null, false),
    lc.quantity, lc.counted_at, lc.product_key is not null, coalesce(g.bought_since, 0),
    coalesce(g.sold_since, 0), coalesce(g.lost_since, 0), coalesce(g.taken_since, 0),
    coalesce(g.produced_since, 0), coalesce(lc.quantity, 0) + coalesce(g.bought_since, 0)
      + coalesce(g.produced_since, 0) - coalesce(g.sold_since, 0)
      - coalesce(g.lost_since, 0) - coalesce(g.taken_since, 0),
    (select any_bare from bare)
    from grouped g full join last_count lc on lc.product_key = g.product_key
   where (select id from company) is not null
   order by coalesce(g.product_name, lc.product_name);
$$;


ALTER FUNCTION public.company_stock_on_hand() OWNER TO postgres;

--
-- Name: complete_whatsapp_notification_delivery(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.complete_whatsapp_notification_delivery(p_delivery_id uuid, p_status text, p_provider_message_id text DEFAULT NULL::text, p_error text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if p_status not in ('sent', 'failed', 'unknown', 'skipped') then
    raise exception 'Invalid delivery completion status';
  end if;

  update public.whatsapp_notification_deliveries
     set status = p_status,
         provider_message_id = nullif(left(btrim(p_provider_message_id), 255), ''),
         last_error = nullif(left(btrim(p_error), 500), ''),
         sent_at = case when p_status = 'sent' then clock_timestamp() else sent_at end,
         next_attempt_at = case when p_status = 'failed' and attempt_count < 3
           then clock_timestamp() + interval '1 hour' else null end,
         updated_at = clock_timestamp()
   where id = p_delivery_id and status = 'sending';
  return found;
end;
$$;


ALTER FUNCTION public.complete_whatsapp_notification_delivery(p_delivery_id uuid, p_status text, p_provider_message_id text, p_error text) OWNER TO postgres;

--
-- Name: configure_product_units(text, text, text, numeric, numeric, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.configure_product_units(p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if auth.uid() is null or private.auth_company_id() is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may configure product units'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return private.configure_product_units(
    private.auth_company_id(), auth.uid(), p_name, p_base_unit, p_purchase_unit,
    p_purchase_size, p_purchase_cost, p_sale_units
  );
end;
$$;


ALTER FUNCTION public.configure_product_units(p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb) OWNER TO postgres;

--
-- Name: confirm_daily_record(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.confirm_daily_record(p_daily_record_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_record public.daily_records;
  v_balance numeric;
begin
  if v_actor is null or v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  select * into v_record from public.daily_records dr
   where dr.id = p_daily_record_id for update;
  if not found or v_record.company_id <> v_company then
    raise exception 'daily record not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_record.status = 'confirmed' then return v_record.id; end if;
  if v_record.status = 'voided' then
    raise exception 'a voided daily record cannot be confirmed'
      using errcode = 'P0001', hint = 'bad_transition';
  end if;
  if v_role not in ('owner', 'accountant')
     and not (v_role = 'worker' and v_record.recorded_by = v_actor) then
    raise exception 'you can confirm only your own daily record drafts'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  if v_record.kind = 'supplier_payment' then
    perform pg_advisory_xact_lock(hashtextextended(
      v_company::text || ':' || private.product_key(v_record.party_name), 0));
    select coalesce(sum(case
      when r.kind in ('supplier_payable', 'whole_animal_procurement') then r.amount
      else -r.amount end), 0)
      into v_balance
      from public.daily_records r
     where r.company_id = v_company
       and r.status = 'confirmed'
       and r.party_name is not null
       and private.product_key(r.party_name) = private.product_key(v_record.party_name)
       and r.kind in ('supplier_payable', 'supplier_payment', 'whole_animal_procurement')
       and (r.kind <> 'whole_animal_procurement' or r.payment_method is null);
    if v_record.amount > v_balance then
      raise exception 'supplier payment exceeds outstanding balance'
        using errcode = 'P0001', hint = 'supplier_overpayment';
    end if;
  end if;

  update public.daily_records
     set status = 'confirmed', confirmed_by = v_actor, confirmed_at = now(), updated_at = now()
   where id = v_record.id;
  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (v_record.id, v_company, v_actor, 'confirmed', v_record.status, 'confirmed',
     jsonb_build_object(
       'amount', v_record.amount,
       'currency', v_record.currency,
       'kind', v_record.kind,
       'liability_effect', case
         when v_record.kind in ('supplier_payable', 'whole_animal_procurement')
              and v_record.payment_method is null then v_record.amount
         when v_record.kind = 'supplier_payment' then -v_record.amount
         else 0 end));
  return v_record.id;
end;
$$;


ALTER FUNCTION public.confirm_daily_record(p_daily_record_id uuid) OWNER TO postgres;

--
-- Name: confirm_retirement_received(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.confirm_retirement_received(p_retirement uuid, p_reason text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  sr record;
  v_actor uuid := auth.uid();
  v_name text := private.staff_retirement_actor_name(auth.uid());
begin
  select * into sr from public.staff_retirements where id = p_retirement for update;
  if not found then raise exception 'retirement not found' using errcode = 'P0001'; end if;
  if sr.company_id <> private.auth_company_id() then raise exception 'not your company' using errcode = 'P0001'; end if;
  if sr.staff_id <> v_actor then
    raise exception 'only the staff member paid can confirm receiving the money'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if sr.status <> 'paid'::public.staff_retirement_status then
    raise exception 'only a paid retirement can be confirmed received' using errcode = 'P0001', hint = 'bad_transition';
  end if;

  update public.staff_retirements
     set status = 'received_confirmed'::public.staff_retirement_status,
         received_confirmed_at = now(),
         received_confirmed_by = v_actor,
         decision_reason = nullif(btrim(p_reason), ''),
         updated_at = now()
   where id = p_retirement;

  insert into public.staff_retirement_audit_log
    (retirement_id, company_id, actor_id, action, from_status, to_status, reason)
  values
    (p_retirement, sr.company_id, v_actor, 'received_confirmed', sr.status,
     'received_confirmed'::public.staff_retirement_status, nullif(btrim(p_reason), ''));

  perform private.staff_retirement_notify_finance(
    sr.company_id, v_actor, 'retirement_received_confirmed', 'Staff confirmed payment received',
    v_name || ' confirmed receiving payment for "' || sr.title || '".',
    jsonb_build_object('retirement_id', p_retirement, 'amount', sr.total_amount)
  );

  return 'received_confirmed';
end $$;


ALTER FUNCTION public.confirm_retirement_received(p_retirement uuid, p_reason text) OWNER TO postgres;

--
-- Name: confirm_supplier_claim_received(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.confirm_supplier_claim_received(p_claim_id uuid, p_reason text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  c record;
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_actor_name text := private.supplier_claim_actor_name(auth.uid());
begin
  perform private.supplier_claim_require_finance();

  select * into c
    from public.supplier_claims
   where id = p_claim_id
   for update;

  if not found then
    raise exception 'supplier claim not found' using errcode = 'P0001';
  end if;
  if c.target_company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;
  if c.status <> 'paid'::public.supplier_claim_status then
    raise exception 'only a paid supplier claim can be confirmed received'
      using errcode = 'P0001', hint = 'bad_transition';
  end if;

  update public.supplier_claims
     set status = 'received_confirmed'::public.supplier_claim_status,
         received_confirmed_at = now(),
         decision_reason = v_reason,
         updated_at = now()
   where id = p_claim_id;

  insert into public.supplier_claim_audit_log
    (claim_id, company_id, actor_id, action, from_status, to_status, reason)
  values
    (p_claim_id, c.target_company_id, v_actor, 'received_confirmed', c.status,
     'received_confirmed'::public.supplier_claim_status, v_reason);

  perform private.supplier_claim_add_supplier_message(
    p_claim_id,
    v_actor_name,
    'Supplier payment receipt was confirmed for claim "' || c.title || '".'
      || coalesce(' Note: ' || v_reason, '')
  );

  perform private.supplier_claim_notify_finance(
    c.target_company_id, v_actor, 'supplier_claim_received_confirmed',
    'Supplier claim payment received',
    'Payment receipt was confirmed for supplier claim "' || c.title || '".',
    jsonb_build_object('claim_id', p_claim_id, 'amount', c.paid_amount_snapshot)
  );

  return 'received_confirmed';
end $$;


ALTER FUNCTION public.confirm_supplier_claim_received(p_claim_id uuid, p_reason text) OWNER TO postgres;

--
-- Name: consume_whatsapp_ai_budget(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.consume_whatsapp_ai_budget(p_company_id uuid, p_identity_id uuid, p_input_chars integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_identity_company uuid;
  v_day date := (timezone('utc', clock_timestamp()))::date;
  v_reset_at timestamptz := (
    date_trunc('day', clock_timestamp() at time zone 'utc') + interval '1 day'
  ) at time zone 'utc';
  v_month_start date := date_trunc('month', (timezone('utc', clock_timestamp()))::date)::date;
  v_month_reset timestamptz := (
    date_trunc('month', clock_timestamp() at time zone 'utc') + interval '1 month'
  ) at time zone 'utc';
  v_chars integer;
  v_cost numeric(12,6);
  v_row public.whatsapp_ai_usage_daily%rowtype;
  v_allowed boolean;
  v_reason text := null;
  v_max_requests integer;
  v_max_chars integer;
  v_max_cost numeric(12,6);
  v_max_month integer;
  v_month_used integer;
begin
  if p_company_id is null or p_identity_id is null then
    raise exception 'AI budget scope is required' using errcode = 'P0001', hint = 'invalid_scope';
  end if;

  select company_id into v_identity_company
    from public.whatsapp_identities
   where id = p_identity_id
     and revoked_at is null;
  if v_identity_company is null or v_identity_company <> p_company_id then
    raise exception 'WhatsApp identity is not linked to this company'
      using errcode = 'P0001', hint = 'invalid_identity';
  end if;

  -- The company's own ceiling where it has one, the platform default where it
  -- does not. Read once, under the same statement as the usage row.
  select coalesce(c.ai_daily_request_limit, 30),
         coalesce(c.ai_daily_char_limit, 36000),
         coalesce(c.ai_daily_cost_limit, 0.150000),
         c.ai_monthly_request_limit
    into v_max_requests, v_max_chars, v_max_cost, v_max_month
    from public.companies c
   where c.id = p_company_id;
  v_max_requests := coalesce(v_max_requests, 30);
  v_max_chars := coalesce(v_max_chars, 36000);
  v_max_cost := coalesce(v_max_cost, 0.150000);

  v_chars := greatest(1, least(coalesce(p_input_chars, 0), 1200));
  v_cost := round((0.001 + (v_chars * 0.0000015))::numeric, 6);

  insert into public.whatsapp_ai_usage_daily (company_id, usage_day)
  values (p_company_id, v_day)
  on conflict (company_id, usage_day) do nothing;

  select * into v_row
    from public.whatsapp_ai_usage_daily
   where company_id = p_company_id and usage_day = v_day
   for update;

  -- The month so far, this row included. Only read when a ceiling exists, so
  -- the common path is exactly the query it was before.
  if v_max_month is not null then
    select coalesce(sum(u.fallback_count), 0)
      into v_month_used
      from public.whatsapp_ai_usage_daily u
     where u.company_id = p_company_id
       and u.usage_day >= v_month_start;
  end if;

  v_allowed := v_row.fallback_count < v_max_requests
    and v_row.input_chars + v_chars <= v_max_chars
    and v_row.estimated_cost + v_cost <= v_max_cost
    and (v_max_month is null or v_month_used < v_max_month);

  if not v_allowed then
    -- The MONTHLY reason is decided first. A shop that has spent its month is
    -- told that, not "come back tomorrow" — tomorrow will refuse it too, and
    -- being sent back into the same wall is worse than being told the truth.
    v_reason := case
      when v_max_month is not null and v_month_used >= v_max_month then 'monthly_request_limit'
      when v_row.fallback_count >= v_max_requests then 'daily_request_limit'
      when v_row.input_chars + v_chars > v_max_chars then 'daily_character_limit'
      else 'daily_cost_limit'
    end;
    update public.whatsapp_ai_usage_daily
       set blocked_count = blocked_count + 1, updated_at = clock_timestamp()
     where company_id = p_company_id and usage_day = v_day;
    return jsonb_build_object(
      'allowed', false,
      'reason', v_reason,
      'reset_at', case when v_reason = 'monthly_request_limit' then v_month_reset else v_reset_at end,
      'fallback_count', v_row.fallback_count,
      'input_chars', v_row.input_chars,
      'estimated_cost', v_row.estimated_cost,
      'month_used', v_month_used,
      'month_limit', v_max_month
    );
  end if;

  update public.whatsapp_ai_usage_daily
     set fallback_count = fallback_count + 1,
         input_chars = input_chars + v_chars,
         estimated_cost = estimated_cost + v_cost,
         updated_at = clock_timestamp()
   where company_id = p_company_id and usage_day = v_day;

  return jsonb_build_object(
    'allowed', true,
    'reset_at', v_reset_at,
    'fallback_count', v_row.fallback_count + 1,
    'input_chars', v_row.input_chars + v_chars,
    'estimated_cost', v_row.estimated_cost + v_cost,
    'month_used', case when v_max_month is null then null else v_month_used + 1 end,
    'month_limit', v_max_month
  );
end $$;


ALTER FUNCTION public.consume_whatsapp_ai_budget(p_company_id uuid, p_identity_id uuid, p_input_chars integer) OWNER TO postgres;

--
-- Name: create_company_invite_code(public.user_role, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_company_invite_code(p_role public.user_role DEFAULT 'worker'::public.user_role, p_days integer DEFAULT 14, p_max_uses integer DEFAULT NULL::integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_code text; v_company uuid;
begin
  if private.auth_role() <> 'owner' then
    raise exception 'only the owner may create an invite code'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_role = 'owner' then
    raise exception 'an invite code cannot grant ownership' using errcode = 'P0001';
  end if;
  v_company := private.auth_company_id();

  -- No 0/O/1/I/L: this gets read aloud and typed on a phone keypad.
  loop
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                             (floor(random() * 31) + 1)::int, 1), '')
      into v_code from generate_series(1, 8);
    exit when not exists (select 1 from company_invite_codes where code = v_code);
  end loop;

  insert into company_invite_codes (company_id, code, role, expires_at, max_uses, created_by)
  values (v_company, v_code, p_role,
          case when p_days is null then null else now() + make_interval(days => p_days) end,
          p_max_uses, auth.uid());
  return v_code;
end $$;


ALTER FUNCTION public.create_company_invite_code(p_role public.user_role, p_days integer, p_max_uses integer) OWNER TO postgres;

--
-- Name: create_daily_record_draft(text, numeric, text, text, timestamp with time zone, uuid, text, text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_daily_record_draft(p_kind text, p_amount numeric, p_party_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_occurred_at timestamp with time zone DEFAULT now(), p_project_id uuid DEFAULT NULL::uuid, p_source text DEFAULT 'app'::text, p_source_message_id text DEFAULT NULL::text, p_lines jsonb DEFAULT '[]'::jsonb, p_payment_method text DEFAULT NULL::text, p_loss_reason text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
declare
  v_actor uuid := auth.uid();
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_id uuid;
  v_existing uuid;
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_source text := lower(btrim(coalesce(p_source, 'app')));
  v_source_message_id text := nullif(btrim(p_source_message_id), '');
  v_party_name text := nullif(btrim(p_party_name), '');
  v_description text := nullif(btrim(p_description), '');
  v_payment_method text := nullif(lower(btrim(coalesce(p_payment_method, ''))), '');
  v_loss_reason text := nullif(btrim(coalesce(p_loss_reason, '')), '');
  v_amount numeric(14,2);
  v_currency text;
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
  v_line record;
  v_line_description text;
  v_quantity numeric;
  v_unit_amount numeric;
  v_line_total numeric(14,2);
  v_line_sum numeric(14,2) := 0;
  -- Goods can leave the shelf with no price attached. A spoiled kilo of a
  -- product whose buying cost was never recorded is still a real inventory
  -- event, and refusing it would leave stock permanently overstated. Zero
  -- money is allowed there, and only there.
  v_valueless_ok boolean;
begin
  if v_actor is null or v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_kind not in (
    'sale', 'expense', 'debt_issued', 'customer_payment', 'stock_purchase',
    'stock_loss', 'owner_use', 'supplier_payable', 'supplier_payment'
  ) then
    raise exception 'unsupported daily record kind' using errcode = 'P0001', hint = 'invalid_kind';
  end if;
  if v_source not in ('app', 'whatsapp', 'other') then
    raise exception 'unsupported daily record source' using errcode = 'P0001', hint = 'invalid_source';
  end if;

  v_valueless_ok := v_kind in ('stock_loss', 'owner_use');

  -- "Deni" is not a way of paying. Credit already has its own kind, and
  -- admitting it here would let one fact be recorded two incompatible ways.
  if v_payment_method = 'deni' then
    raise exception 'credit is recorded as debt_issued, not as a payment method'
      using errcode = 'P0001', hint = 'deni_is_not_a_payment_method';
  end if;
  if v_payment_method is not null and v_payment_method not in ('cash', 'mobile_money', 'bank', 'other') then
    raise exception 'unsupported payment method' using errcode = 'P0001', hint = 'invalid_payment_method';
  end if;
  if v_loss_reason is not null and v_kind <> 'stock_loss' then
    raise exception 'a loss reason belongs to a stock loss' using errcode = 'P0001', hint = 'loss_reason_not_applicable';
  end if;

  if p_amount is null then
    raise exception 'amount is required' using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  if p_amount < 0 or (p_amount = 0 and not v_valueless_ok) then
    raise exception 'amount must be greater than zero' using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  v_amount := round(p_amount, 2);
  if v_amount < 0 or (v_amount = 0 and not v_valueless_ok) then
    raise exception 'amount must be greater than zero' using errcode = 'P0001', hint = 'invalid_amount';
  end if;

  if v_party_name is not null and length(v_party_name) > 200 then
    raise exception 'party name is too long' using errcode = 'P0001', hint = 'invalid_party_name';
  end if;
  if v_description is not null and length(v_description) > 2000 then
    raise exception 'description is too long' using errcode = 'P0001', hint = 'invalid_description';
  end if;
  if v_source_message_id is not null and length(v_source_message_id) > 256 then
    raise exception 'source message id is too long' using errcode = 'P0001', hint = 'invalid_source_message_id';
  end if;
  if p_project_id is not null then
    if not exists (
      select 1 from public.projects p
       where p.id = p_project_id and p.company_id = v_company
    ) then
      raise exception 'project is not in the active company' using errcode = 'P0001', hint = 'wrong_company';
    end if;
    if v_role = 'worker' and not private.auth_can_see_project(p_project_id) then
      raise exception 'you cannot create a record for this project' using errcode = 'P0001', hint = 'project_not_visible';
    end if;
  end if;
  if jsonb_typeof(v_lines) <> 'array' then
    raise exception 'lines must be a JSON array' using errcode = 'P0001', hint = 'invalid_lines';
  end if;

  for v_line in
    select value, ordinality
      from jsonb_array_elements(v_lines) with ordinality as items(value, ordinality)
  loop
    if jsonb_typeof(v_line.value) <> 'object' then
      raise exception 'each line must be a JSON object' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    v_line_description := nullif(btrim(v_line.value->>'description'), '');
    if v_line_description is null or length(v_line_description) > 300 then
      raise exception 'each line needs a description' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    if coalesce(v_line.value->>'quantity', '') !~ '^([0-9]+)([.][0-9]+)?$'
       or coalesce(v_line.value->>'unit_amount', '') !~ '^([0-9]+)([.][0-9]+)?$' then
      raise exception 'each line needs numeric quantity and unit_amount' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    if length(btrim(coalesce(v_line.value->>'unit', ''))) > 20 then
      raise exception 'a unit label is too long' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    v_quantity := (v_line.value->>'quantity')::numeric;
    v_unit_amount := (v_line.value->>'unit_amount')::numeric;
    if v_quantity <= 0 or v_unit_amount < 0 then
      raise exception 'line quantity must be positive and unit amount cannot be negative'
        using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    v_line_total := round(v_quantity * v_unit_amount, 2);
    v_line_sum := v_line_sum + v_line_total;
  end loop;
  -- Unchanged, and the reason is unchanged: the arithmetic in a record must add
  -- up before the record exists, wherever the numbers came from. This is the
  -- guard that stops a model's total being taken on trust.
  if jsonb_array_length(v_lines) > 0 and abs(v_line_sum - v_amount) > 0.01 then
    raise exception 'line totals must equal the record amount' using errcode = 'P0001', hint = 'line_total_mismatch';
  end if;

  select c.currency into v_currency from public.companies c where c.id = v_company;
  if v_currency is null then
    raise exception 'active company not found' using errcode = 'P0001', hint = 'company_not_found';
  end if;

  insert into public.daily_records
    (company_id, project_id, recorded_by, source, source_message_id, kind, status,
     amount, currency, party_name, description, occurred_at, payment_method, loss_reason)
  values
    (v_company, p_project_id, v_actor, v_source, v_source_message_id, v_kind,
     'pending_confirmation', v_amount, v_currency, v_party_name, v_description,
     coalesce(p_occurred_at, now()), v_payment_method, v_loss_reason)
  on conflict (company_id, source_message_id)
    where source_message_id is not null
  do nothing
  returning id into v_id;

  -- Webhook idempotency, untouched: a redelivered WhatsApp message returns the
  -- record it already created rather than creating a second one.
  if v_id is null then
    select dr.id into v_existing
      from public.daily_records dr
     where dr.company_id = v_company and dr.source_message_id = v_source_message_id;
    if v_existing is null then
      raise exception 'daily record could not be created' using errcode = 'P0001', hint = 'create_failed';
    end if;
    return v_existing;
  end if;

  for v_line in
    select value, ordinality
      from jsonb_array_elements(v_lines) with ordinality as items(value, ordinality)
  loop
    v_quantity := (v_line.value->>'quantity')::numeric;
    v_unit_amount := (v_line.value->>'unit_amount')::numeric;
    insert into public.daily_record_lines
      (daily_record_id, line_number, description, quantity, unit_amount, line_total, unit)
    values
      (v_id, v_line.ordinality::integer, btrim(v_line.value->>'description'),
       v_quantity, v_unit_amount, round(v_quantity * v_unit_amount, 2),
       nullif(btrim(coalesce(v_line.value->>'unit', '')), ''));
  end loop;

  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (v_id, v_company, v_actor, 'created', null, 'pending_confirmation',
     jsonb_build_object(
       'kind', v_kind, 'amount', v_amount, 'currency', v_currency, 'source', v_source,
       'source_message_id', v_source_message_id, 'line_count', jsonb_array_length(v_lines),
       'payment_method', v_payment_method, 'loss_reason', v_loss_reason
     ));

  return v_id;
end;
$_$;


ALTER FUNCTION public.create_daily_record_draft(p_kind text, p_amount numeric, p_party_name text, p_description text, p_occurred_at timestamp with time zone, p_project_id uuid, p_source text, p_source_message_id text, p_lines jsonb, p_payment_method text, p_loss_reason text) OWNER TO postgres;

--
-- Name: create_reimbursement_payout(uuid[], text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_reimbursement_payout(p_receipt_ids uuid[], p_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_actor uuid := auth.uid(); v_company uuid; v_employee uuid;
  v_total numeric(14,2); v_n int; v_people int; v_payout uuid; v_name text;
  v_wanted int := coalesce(array_length(p_receipt_ids, 1), 0);
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may record a reimbursement payout'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_method is not null and p_method not in ('cash', 'mobile_money', 'bank', 'other') then
    raise exception 'unknown payment method %', p_method using errcode = 'P0001';
  end if;
  if v_wanted = 0 then
    raise exception 'choose at least one receipt to pay'
      using errcode = 'P0001', hint = 'nothing_selected';
  end if;
  v_company := private.auth_company_id();

  -- Ordered lock: two accountants paying the same person cannot interleave.
  perform 1 from public.receipts where id = any(p_receipt_ids) order by id for update;

  select count(*), count(distinct uploaded_by), (array_agg(uploaded_by))[1], coalesce(sum(total_amount), 0)
    into v_n, v_people, v_employee, v_total
    from public.receipts where id = any(p_receipt_ids);
  if v_n <> v_wanted then
    raise exception 'one or more receipts could not be found' using errcode = 'P0001';
  end if;
  if v_people > 1 then
    raise exception 'a payout pays one person. Pay each employee separately.'
      using errcode = 'P0001', hint = 'mixed_employees';
  end if;

  -- Eligibility, all of it, in one pass: same company, confirmed, paid for out of
  -- the employee's own pocket, and not already settled.
  select count(*) into v_n from public.receipts
   where id = any(p_receipt_ids) and company_id = v_company
     and status = 'confirmed' and payment_method = 'cash_personal'
     and reimbursed_at is null;
  if v_n <> v_wanted then
    raise exception 'only confirmed receipts the employee paid for themselves, and not already paid back, can be settled'
      using errcode = 'P0001', hint = 'not_eligible';
  end if;
  if v_total <= 0 then
    raise exception 'nothing to pay: the selected receipts total zero' using errcode = 'P0001';
  end if;

  insert into public.reimbursement_payouts
    (company_id, paid_to, paid_by, total_amount, method, reference, note)
  values (v_company, v_employee, v_actor, v_total, p_method,
          nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''))
  returning id into v_payout;

  -- The snapshot. one_active_payout_per_receipt refuses a second live item, so a
  -- double-clicked payout loses on the index rather than in a race.
  insert into public.reimbursement_payout_items (payout_id, receipt_id, amount_paid)
  select v_payout, r.id, r.total_amount from public.receipts r where r.id = any(p_receipt_ids);

  perform set_config('risip.payout', 'on', true);
  perform set_config('risip.audit_event', 'reimbursed', true);
  perform set_config('risip.audit_actor', v_actor::text, true);
  perform set_config('risip.audit_reason',
    coalesce(nullif(btrim(p_note), ''), 'Paid back to the employee'), true);

  update public.receipts set reimbursed_at = now(), reimbursed_by = v_actor
   where id = any(p_receipt_ids);

  perform set_config('risip.payout', '', true);
  perform set_config('risip.audit_event', '', true);
  perform set_config('risip.audit_actor', '', true);
  perform set_config('risip.audit_reason', '', true);

  select full_name into v_name from public.profiles where id = v_actor;
  insert into public.app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  select v_company, v_employee, v_actor, 'reimbursement_paid', 'You have been paid back',
         'TSh ' || trim(to_char(v_total, 'FM999,999,999,999,990')) || ' for ' || v_wanted
           || ' receipt' || case when v_wanted = 1 then '' else 's' end
           || ' was paid by ' || coalesce(v_name, 'finance') || '.'
           || coalesce(' Reference: ' || nullif(btrim(p_reference), ''), ''),
         jsonb_build_object('payout_id', v_payout, 'amount', v_total)
   where v_employee is distinct from v_actor;

  return jsonb_build_object('payout_id', v_payout, 'total_amount', v_total, 'receipts', v_wanted);
end $$;


ALTER FUNCTION public.create_reimbursement_payout(p_receipt_ids uuid[], p_method text, p_reference text, p_note text) OWNER TO postgres;

--
-- Name: create_retirement(uuid, text, text, uuid[], jsonb, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_retirement(p_project_id uuid, p_title text, p_notes text, p_receipt_ids uuid[], p_documents jsonb DEFAULT '[]'::jsonb, p_retirement_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_company uuid := private.auth_company_id();
  v_retirement uuid := coalesce(p_retirement_id, gen_random_uuid());
  v_wanted int := coalesce(array_length(p_receipt_ids, 1), 0);
  v_distinct int;
  v_total numeric(14,2) := 0;
  v_receipt uuid;
  v_docs jsonb := coalesce(p_documents, '[]'::jsonb);
  v_name text := private.staff_retirement_actor_name(auth.uid());
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_wanted = 0 then
    raise exception 'choose at least one receipt to retire' using errcode = 'P0001', hint = 'nothing_selected';
  end if;
  select count(distinct x) into v_distinct from unnest(p_receipt_ids) x;
  if v_distinct <> v_wanted then
    raise exception 'the same receipt was selected more than once' using errcode = 'P0001', hint = 'duplicate_selection';
  end if;
  if not private.auth_can_see_project(p_project_id) then
    raise exception 'not your project' using errcode = 'P0001', hint = 'project_not_visible';
  end if;
  if jsonb_typeof(v_docs) <> 'array' then
    raise exception 'documents must be a JSON array' using errcode = 'P0001', hint = 'bad_documents';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(v_docs) d
     where nullif(btrim(d->>'storage_path'), '') is null
        or nullif(btrim(d->>'file_name'), '') is null
  ) then
    raise exception 'each document needs storage_path and file_name'
      using errcode = 'P0001', hint = 'bad_documents';
  end if;

  perform 1 from public.receipts where id = any(p_receipt_ids) order by id for update;

  foreach v_receipt in array p_receipt_ids loop
    v_total := v_total + private.staff_retirement_check_receipt_eligible(
      v_receipt, v_company, v_actor, p_project_id, v_retirement
    );
  end loop;
  if v_total <= 0 then
    raise exception 'selected receipts total zero' using errcode = 'P0001', hint = 'zero_total';
  end if;

  insert into public.staff_retirements
    (id, company_id, project_id, staff_id, title, notes, total_amount, status,
     submitted_at, submitted_by, created_at, updated_at)
  values
    (v_retirement, v_company, p_project_id, v_actor,
     coalesce(nullif(btrim(p_title), ''), 'Receipt retirement'),
     nullif(btrim(p_notes), ''), v_total, 'submitted'::public.staff_retirement_status,
     now(), v_actor, now(), now());

  insert into public.staff_retirement_receipts (retirement_id, receipt_id)
  select v_retirement, x from unnest(p_receipt_ids) x;

  insert into public.staff_retirement_documents
    (retirement_id, company_id, project_id, storage_path, file_name, file_type, created_by, ai_status)
  select v_retirement, v_company, p_project_id,
         btrim(d.storage_path), btrim(d.file_name), nullif(btrim(d.file_type), ''),
         v_actor, 'not_scanned'
    from jsonb_to_recordset(v_docs) as d(storage_path text, file_name text, file_type text);

  insert into public.staff_retirement_audit_log
    (retirement_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (v_retirement, v_company, v_actor, 'created', null, 'submitted'::public.staff_retirement_status,
     jsonb_build_object('receipt_ids', p_receipt_ids, 'document_count', jsonb_array_length(v_docs), 'total_amount', v_total));

  perform private.staff_retirement_notify_finance(
    v_company, v_actor, 'retirement_submitted', 'New staff retirement submitted',
    v_name || ' submitted ' || v_wanted || ' receipt' || case when v_wanted = 1 then '' else 's' end
      || ' for TSh ' || trim(to_char(v_total, 'FM999,999,999,999,990')) || '.',
    jsonb_build_object('retirement_id', v_retirement, 'receipt_ids', p_receipt_ids, 'amount', v_total)
  );

  return v_retirement;
end $$;


ALTER FUNCTION public.create_retirement(p_project_id uuid, p_title text, p_notes text, p_receipt_ids uuid[], p_documents jsonb, p_retirement_id uuid) OWNER TO postgres;

--
-- Name: create_whatsapp_link_token(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_whatsapp_link_token() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_profile uuid := auth.uid(); v_company uuid; v_token text;
begin
  if v_profile is null then raise exception 'not authenticated'; end if;
  v_company := private.auth_company_id();
  if v_company is null then raise exception 'no active business'; end if;

  update whatsapp_link_tokens set revoked_at = now()
   where profile_id = v_profile and used_at is null and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into whatsapp_link_tokens (token_hash, profile_id, company_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_profile, v_company,
          now() + interval '15 minutes');
  return v_token;
end $$;


ALTER FUNCTION public.create_whatsapp_link_token() OWNER TO postgres;

--
-- Name: create_whole_animal_procurement_draft(text, integer, numeric, text, text, timestamp with time zone, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_whole_animal_procurement_draft(p_animal_type text, p_animal_count integer, p_purchase_total numeric, p_supplier_name text DEFAULT NULL::text, p_payment_method text DEFAULT NULL::text, p_occurred_at timestamp with time zone DEFAULT now(), p_source text DEFAULT 'app'::text, p_source_message_id text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_id uuid;
  v_existing public.daily_records%rowtype;
  v_animal text := nullif(btrim(regexp_replace(coalesce(p_animal_type, ''), '\s+', ' ', 'g')), '');
  v_supplier text := nullif(btrim(regexp_replace(coalesce(p_supplier_name, ''), '\s+', ' ', 'g')), '');
  v_method text := nullif(lower(btrim(coalesce(p_payment_method, ''))), '');
  v_source text := lower(btrim(coalesce(p_source, 'app')));
  v_message text := nullif(btrim(coalesce(p_source_message_id, '')), '');
  v_reference text := nullif(btrim(regexp_replace(coalesce(p_reference, ''), '\s+', ' ', 'g')), '');
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
  v_total numeric(14,2);
  v_per_animal numeric(14,2);
  v_currency text;
begin
  if v_actor is null or v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_animal is null or length(v_animal) not between 2 and 100 then
    raise exception 'animal type is required' using errcode = 'P0001', hint = 'invalid_animal_type';
  end if;
  if p_animal_count is null or p_animal_count < 1 or p_animal_count > 1000 then
    raise exception 'animal count must be between 1 and 1000'
      using errcode = 'P0001', hint = 'invalid_animal_count';
  end if;
  if p_purchase_total is null or p_purchase_total <= 0 or p_purchase_total > 100000000 then
    raise exception 'purchase total must be positive and within the record limit'
      using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  v_total := round(p_purchase_total, 2);
  v_per_animal := round(v_total / p_animal_count, 2);
  if v_per_animal <= 0 then
    raise exception 'per-animal cost is invalid' using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  if v_method = 'deni' then
    raise exception 'supplier credit is not a payment method in this phase'
      using errcode = 'P0001', hint = 'supplier_credit_not_supported';
  end if;
  if v_method is not null and v_method not in ('cash', 'mobile_money', 'bank', 'other') then
    raise exception 'unsupported payment method' using errcode = 'P0001', hint = 'invalid_payment_method';
  end if;
  if v_source not in ('app', 'whatsapp', 'other') then
    raise exception 'unsupported source' using errcode = 'P0001', hint = 'invalid_source';
  end if;
  if v_message is not null and length(v_message) > 256 then
    raise exception 'source message id is too long' using errcode = 'P0001', hint = 'invalid_source_message_id';
  end if;
  if v_supplier is not null and length(v_supplier) > 200 then
    raise exception 'supplier name is too long' using errcode = 'P0001', hint = 'invalid_supplier';
  end if;
  if v_reference is not null and length(v_reference) > 200 then
    raise exception 'reference is too long' using errcode = 'P0001', hint = 'invalid_reference';
  end if;
  if v_note is not null and length(v_note) > 1000 then
    raise exception 'note is too long' using errcode = 'P0001', hint = 'invalid_note';
  end if;

  select c.currency into v_currency from public.companies c where c.id = v_company;
  if v_currency is null then
    raise exception 'active company not found' using errcode = 'P0001', hint = 'company_not_found';
  end if;

  insert into public.daily_records
    (company_id, recorded_by, source, source_message_id, kind, status, amount,
     currency, party_name, description, occurred_at, payment_method)
  values
    (v_company, v_actor, v_source, v_message, 'whole_animal_procurement',
     'pending_confirmation', v_total, v_currency, v_supplier,
     initcap(v_animal) || ' mzima', coalesce(p_occurred_at, now()), v_method)
  on conflict (company_id, source_message_id)
    where source_message_id is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing
      from public.daily_records r
     where r.company_id = v_company and r.source_message_id = v_message;
    if v_existing.id is null or v_existing.kind <> 'whole_animal_procurement' then
      raise exception 'source message belongs to another record'
        using errcode = 'P0001', hint = 'idempotency_conflict';
    end if;
    return v_existing.id;
  end if;

  insert into public.whole_animal_procurements
    (daily_record_id, company_id, animal_type, animal_count,
     purchase_total_snapshot, per_animal_cost_snapshot, supplier_name,
     reference, note, occurred_at, created_by)
  values
    (v_id, v_company, lower(v_animal), p_animal_count,
     v_total, v_per_animal, v_supplier, v_reference, v_note,
     coalesce(p_occurred_at, now()), v_actor);

  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (v_id, v_company, v_actor, 'created', null, 'pending_confirmation',
     jsonb_build_object(
       'kind', 'whole_animal_procurement',
       'animal_type', lower(v_animal),
       'animal_count', p_animal_count,
       'purchase_total', v_total,
       'per_animal_cost', v_per_animal,
       'payment_method', v_method,
       'supplier_name', v_supplier,
       'source', v_source,
       'source_message_id', v_message
     ));

  return v_id;
end;
$$;


ALTER FUNCTION public.create_whole_animal_procurement_draft(p_animal_type text, p_animal_count integer, p_purchase_total numeric, p_supplier_name text, p_payment_method text, p_occurred_at timestamp with time zone, p_source text, p_source_message_id text, p_reference text, p_note text) OWNER TO postgres;

--
-- Name: daily_profit_estimate(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.daily_profit_estimate(p_from timestamp with time zone, p_to timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_sales numeric := 0;
  v_expenses numeric := 0;
  v_stock_purchases numeric := 0;
  v_losses numeric := 0;
  v_owner_use numeric := 0;
  v_unvalued_losses integer := 0;
  v_cogs numeric := 0;
  v_costed_sales numeric := 0;
  v_uncosted_lines integer := 0;
  v_missing text[] := '{}';
begin
  if v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant can read company profit'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'profit range is invalid' using errcode = 'P0001', hint = 'invalid_range';
  end if;

  select
    coalesce(sum(amount) filter (where kind in ('sale', 'debt_issued')), 0),
    coalesce(sum(amount) filter (where kind = 'expense'), 0),
    coalesce(sum(amount) filter (where kind in ('stock_purchase', 'supplier_payable')), 0),
    coalesce(sum(amount) filter (where kind = 'stock_loss'), 0),
    coalesce(sum(amount) filter (where kind = 'owner_use'), 0),
    count(*) filter (where kind = 'stock_loss' and amount = 0)
  into v_sales, v_expenses, v_stock_purchases, v_losses, v_owner_use, v_unvalued_losses
  from public.daily_records
  where company_id = v_company
    and status = 'confirmed'
    and occurred_at >= p_from and occurred_at < p_to;

  with sale_lines as (
    select l.description,
           coalesce(l.stock_base_quantity, l.quantity) as base_quantity,
           l.line_total,
           d.occurred_at
    from public.daily_records d
    join public.daily_record_lines l on l.daily_record_id = d.id
    where d.company_id = v_company
      and d.status = 'confirmed'
      and d.kind in ('sale', 'debt_issued')
      and d.occurred_at >= p_from and d.occurred_at < p_to
  ), costed as (
    select sl.*,
      (
        select coalesce(pc.base_unit_cost, pc.unit_cost)
        from public.product_costs pc
        where pc.company_id = v_company
          and private.product_key(pc.product_key) = private.product_key(sl.description)
          and pc.effective_from <= sl.occurred_at
        order by pc.effective_from desc, pc.created_at desc
        limit 1
      ) as base_unit_cost
    from sale_lines sl
  )
  select
    coalesce(sum(base_quantity * base_unit_cost) filter (where base_unit_cost is not null), 0),
    coalesce(sum(line_total) filter (where base_unit_cost is not null), 0),
    count(*) filter (where base_unit_cost is null),
    coalesce(array_agg(distinct description order by description)
      filter (where base_unit_cost is null), '{}')
  into v_cogs, v_costed_sales, v_uncosted_lines, v_missing
  from costed;

  return jsonb_build_object(
    'sales', v_sales,
    'expenses', v_expenses,
    'stock_purchases', v_stock_purchases,
    'stock_losses', v_losses,
    'unvalued_stock_losses', v_unvalued_losses,
    'stock_loss_valuation_complete', v_unvalued_losses = 0,
    'owner_use', v_owner_use,
    'cogs', round(v_cogs, 2),
    'costed_sales', v_costed_sales,
    'uncosted_sales', greatest(v_sales - v_costed_sales, 0),
    'coverage', case when v_sales > 0 then round(v_costed_sales / v_sales, 4) else 1 end,
    'uncosted_lines', v_uncosted_lines,
    'products_missing_cost', to_jsonb(v_missing),
    'gross_profit', round(v_sales - v_cogs, 2),
    'estimated_profit', round(v_sales - v_cogs - v_expenses - v_losses, 2),
    'known_margin_after_expenses', round(v_costed_sales - v_cogs - v_expenses - v_losses, 2),
    'valuation_complete', v_uncosted_lines = 0 and v_unvalued_losses = 0
  );
end;
$$;


ALTER FUNCTION public.daily_profit_estimate(p_from timestamp with time zone, p_to timestamp with time zone) OWNER TO postgres;

--
-- Name: decide_receipt(uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.decide_receipt(p_receipt uuid, p_decision text, p_reason text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare r record; v_self boolean;
begin
  if p_decision not in ('approve','request_changes','reject') then
    raise exception 'unknown decision %', p_decision;
  end if;
  if p_decision in ('request_changes','reject')
     and not private.is_meaningful_reason(p_reason) then
    raise exception 'Please write a clear reason with at least 3 meaningful words, so the person reading it knows what to fix.'
      using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;
  if private.auth_role() not in ('owner','accountant') then
    raise exception 'only finance may decide on a receipt';
  end if;

  select rc.*, c.approval_flow_enabled, c.allow_self_approval into r
    from public.receipts rc join public.companies c on c.id = rc.company_id
   where rc.id = p_receipt for update;
  if not found then raise exception 'receipt not found'; end if;
  if r.company_id <> private.auth_company_id() then raise exception 'not your company'; end if;
  if not r.approval_flow_enabled then raise exception 'approval flow is not enabled for this company'; end if;
  if r.status <> 'submitted' then raise exception 'only a submitted receipt can be decided'; end if;

  v_self := (r.submitted_by = auth.uid());
  if p_decision = 'approve' and v_self and not r.allow_self_approval then
    raise exception 'you submitted this receipt, so another finance user must approve it';
  end if;

  perform set_config('risip.self_approved',
                     case when p_decision = 'approve' and v_self then 'true' else 'false' end,
                     true);

  update public.receipts
     set status = case p_decision
                    when 'approve' then 'confirmed'::receipt_status
                    when 'request_changes' then 'changes_requested'::receipt_status
                    else 'rejected'::receipt_status end,
         decided_at = now(), decided_by = auth.uid(),
         decision_reason = case when p_decision = 'approve' then null else btrim(p_reason) end
   where id = p_receipt;

  perform set_config('risip.self_approved', 'false', true);

  insert into public.app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  select r.company_id, r.uploaded_by, auth.uid(),
         'receipt_' || p_decision,
         case p_decision when 'approve' then 'Receipt approved'
                         when 'request_changes' then 'Changes requested on your receipt'
                         else 'Receipt rejected' end,
         case when p_decision = 'approve' then 'Your receipt was approved and now counts as project spend.'
              else btrim(p_reason) end,
         jsonb_build_object('receipt_id', p_receipt, 'decision', p_decision)
   where r.uploaded_by is not null;

  return p_decision;
end $$;


ALTER FUNCTION public.decide_receipt(p_receipt uuid, p_decision text, p_reason text) OWNER TO postgres;

--
-- Name: decide_retirement(uuid, text, text, uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.decide_retirement(p_retirement uuid, p_decision text, p_reason text DEFAULT NULL::text, p_change_receipt_ids uuid[] DEFAULT NULL::uuid[]) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  sr record;
  v_actor uuid := auth.uid();
  v_reason text;
  v_to text;
  v_body text;
begin
  if p_decision not in ('viewed', 'approve', 'request_changes', 'reject') then
    raise exception 'unknown retirement decision %', p_decision using errcode = 'P0001';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may decide a retirement' using errcode = 'P0001', hint = 'not_authorized';
  end if;

  select * into sr from public.staff_retirements where id = p_retirement for update;
  if not found then raise exception 'retirement not found' using errcode = 'P0001'; end if;
  if sr.company_id <> private.auth_company_id() then raise exception 'not your company' using errcode = 'P0001'; end if;
  if sr.staff_id = v_actor and p_decision <> 'viewed' then
    raise exception 'you submitted this retirement, so another finance user must decide it'
      using errcode = 'P0001', hint = 'maker_checker';
  end if;

  if p_decision = 'viewed' then
    if sr.status <> 'submitted'::public.staff_retirement_status then
      raise exception 'only a submitted retirement can be marked viewed' using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_to := 'viewed';
    v_body := 'Finance has opened your retirement "' || sr.title || '".';
  elsif p_decision = 'approve' then
    if sr.status not in ('submitted'::public.staff_retirement_status, 'viewed'::public.staff_retirement_status) then
      raise exception 'only submitted or viewed retirements can be approved' using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_to := 'approved';
    v_body := 'Your retirement "' || sr.title || '" was approved.';
  elsif p_decision = 'request_changes' then
    if sr.status not in ('submitted'::public.staff_retirement_status, 'viewed'::public.staff_retirement_status) then
      raise exception 'changes can be requested only before approval' using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_reason := private.staff_retirement_require_reason(
      p_reason,
      'Please write a clear reason with at least 3 meaningful words, so the staff member knows what to fix.'
    );
    v_to := 'changes_requested';
    v_body := v_reason;
  elsif p_decision = 'reject' then
    if sr.status not in ('submitted'::public.staff_retirement_status, 'viewed'::public.staff_retirement_status) then
      raise exception 'only submitted or viewed retirements can be rejected' using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_reason := private.staff_retirement_require_reason(
      p_reason,
      'Please write a clear reason with at least 3 meaningful words, so the rejection can be audited.'
    );
    v_to := 'rejected';
    v_body := v_reason;
  end if;

  update public.staff_retirements
     set status = v_to::public.staff_retirement_status,
         viewed_at = case when v_to = 'viewed' then coalesce(viewed_at, now()) else viewed_at end,
         viewed_by = case when v_to = 'viewed' then coalesce(viewed_by, v_actor) else viewed_by end,
         approved_at = case when v_to = 'approved' then now() else approved_at end,
         approved_by = case when v_to = 'approved' then v_actor else approved_by end,
         rejected_at = case when v_to = 'rejected' then now() else rejected_at end,
         rejected_by = case when v_to = 'rejected' then v_actor else rejected_by end,
         change_request_note = case when v_to = 'changes_requested' then v_reason else change_request_note end,
         change_request_receipt_ids = case when v_to = 'changes_requested' then coalesce(p_change_receipt_ids, '{}'::uuid[]) else change_request_receipt_ids end,
         decision_reason = case when v_to in ('changes_requested', 'rejected') then v_reason else null end,
         updated_at = now()
   where id = p_retirement;

  insert into public.staff_retirement_audit_log
    (retirement_id, company_id, actor_id, action, from_status, to_status, reason, metadata)
  values
    (p_retirement, sr.company_id, v_actor,
     case v_to when 'approved' then 'approved'
               when 'changes_requested' then 'changes_requested'
               when 'rejected' then 'rejected'
               else 'viewed' end,
     sr.status, v_to::public.staff_retirement_status, v_reason,
     jsonb_build_object('receipt_ids', coalesce(p_change_receipt_ids, '{}'::uuid[])));

  perform private.staff_retirement_notify_staff(
    sr.company_id, sr.staff_id, v_actor,
    'retirement_' || v_to,
    case v_to when 'viewed' then 'Accountant viewed your retirement'
              when 'approved' then 'Retirement approved'
              when 'changes_requested' then 'Changes requested'
              else 'Retirement rejected' end,
    v_body,
    jsonb_build_object('retirement_id', p_retirement, 'receipt_ids', coalesce(p_change_receipt_ids, '{}'::uuid[]))
  );

  return v_to;
end $$;


ALTER FUNCTION public.decide_retirement(p_retirement uuid, p_decision text, p_reason text, p_change_receipt_ids uuid[]) OWNER TO postgres;

--
-- Name: decide_supplier_claim(uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.decide_supplier_claim(p_claim_id uuid, p_action text, p_reason text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  c record;
  v_actor uuid := auth.uid();
  v_to public.supplier_claim_status;
  v_action text;
  v_reason text;
  v_actor_name text := private.supplier_claim_actor_name(auth.uid());
  v_message text;
begin
  perform private.supplier_claim_require_finance();

  if p_action not in ('viewed', 'approve', 'approved_for_payment', 'dispute', 'disputed') then
    raise exception 'unknown supplier claim action %', p_action using errcode = 'P0001';
  end if;

  select * into c
    from public.supplier_claims
   where id = p_claim_id
   for update;

  if not found then
    raise exception 'supplier claim not found' using errcode = 'P0001';
  end if;
  if c.target_company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;

  if p_action = 'viewed' then
    if c.status <> 'submitted'::public.supplier_claim_status then
      raise exception 'only a submitted supplier claim can be marked viewed'
        using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_to := 'viewed'::public.supplier_claim_status;
    v_action := 'viewed';
    v_message := 'Finance has viewed supplier claim "' || c.title || '".';
  elsif p_action in ('approve', 'approved_for_payment') then
    if c.status not in ('submitted'::public.supplier_claim_status, 'viewed'::public.supplier_claim_status) then
      raise exception 'only submitted or viewed supplier claims can be approved for payment'
        using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_to := 'approved_for_payment'::public.supplier_claim_status;
    v_action := 'approved_for_payment';
    v_message := 'Supplier claim "' || c.title || '" was approved for payment.';
  else
    if c.status not in (
      'submitted'::public.supplier_claim_status,
      'viewed'::public.supplier_claim_status,
      'approved_for_payment'::public.supplier_claim_status
    ) then
      raise exception 'only submitted, viewed, or approved supplier claims can be disputed'
        using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_reason := private.supplier_claim_require_reason(
      p_reason,
      'Please write a clear reason with at least 3 meaningful words, so the supplier dispute can be audited.'
    );
    v_to := 'disputed'::public.supplier_claim_status;
    v_action := 'disputed';
    v_message := 'Supplier claim "' || c.title || '" was disputed. Reason: ' || v_reason;
  end if;

  update public.supplier_claims
     set status = v_to,
         viewed_at = case when v_to = 'viewed' then coalesce(viewed_at, now()) else viewed_at end,
         viewed_by = case when v_to = 'viewed' then coalesce(viewed_by, v_actor) else viewed_by end,
         approved_at = case when v_to = 'approved_for_payment' then now() else approved_at end,
         approved_by = case when v_to = 'approved_for_payment' then v_actor else approved_by end,
         disputed_at = case when v_to = 'disputed' then now() else disputed_at end,
         disputed_by = case when v_to = 'disputed' then v_actor else disputed_by end,
         decision_reason = case when v_to = 'disputed' then v_reason else null end,
         updated_at = now()
   where id = p_claim_id;

  insert into public.supplier_claim_audit_log
    (claim_id, company_id, actor_id, action, from_status, to_status, reason)
  values
    (p_claim_id, c.target_company_id, v_actor, v_action, c.status, v_to, v_reason);

  perform private.supplier_claim_add_supplier_message(p_claim_id, v_actor_name, v_message);

  return v_to::text;
end $$;


ALTER FUNCTION public.decide_supplier_claim(p_claim_id uuid, p_action text, p_reason text) OWNER TO postgres;

--
-- Name: delete_account_data(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_account_data(p_profile_id uuid, p_owned_company_ids uuid[] DEFAULT '{}'::uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_expected uuid[] := '{}'::uuid[];
  v_requested uuid[] := coalesce(p_owned_company_ids, '{}');
  v_company uuid;
  v_duplicate_count integer;
  v_phone text;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service role required' using errcode = '42501', hint = 'service_role_required';
  end if;
  select phone into v_phone from public.profiles where id = p_profile_id;
  if p_profile_id is null or not found then
    raise exception 'profile not found' using errcode = 'P0001', hint = 'profile_not_found';
  end if;

  select coalesce(array_agg(m.company_id order by m.company_id), '{}')
    into v_expected
    from public.company_members m
   where m.profile_id = p_profile_id and m.role = 'owner';

  select count(*) - count(distinct id) into v_duplicate_count from unnest(v_requested) ids(id);
  if v_duplicate_count <> 0 or v_requested <> v_expected then
    raise exception 'all owned businesses must be explicitly selected'
      using errcode = 'P0001', hint = 'owned_companies_must_be_explicit';
  end if;

  foreach v_company in array v_expected loop
    perform public.delete_company_data(v_company, true);
  end loop;

  -- Personal channel history and credentials are removed even for businesses
  -- the person only joined. Other businesses and their finance rows remain.
  delete from public.whatsapp_messages where profile_id = p_profile_id;
  delete from public.whatsapp_audit_log where profile_id = p_profile_id;
  delete from public.whatsapp_conversations where profile_id = p_profile_id;
  delete from public.whatsapp_ai_messages where profile_id = p_profile_id;
  delete from public.whatsapp_ai_threads where profile_id = p_profile_id;
  delete from public.whatsapp_notification_consent_log where profile_id = p_profile_id;
  delete from public.whatsapp_identities where profile_id = p_profile_id;
  delete from public.whatsapp_link_tokens where profile_id = p_profile_id;
  delete from public.wa_login_tokens where profile_id = p_profile_id;
  delete from public.product_cost_prompts where profile_id = p_profile_id;
  delete from public.receipt_aliases where user_id = p_profile_id;
  if v_phone is not null then
    delete from public.whatsapp_onboarding where phone_e164 = v_phone;
  end if;
  delete from public.company_members where profile_id = p_profile_id;
  delete from public.profiles where id = p_profile_id;

  return jsonb_build_object('deleted', true, 'profile_id', p_profile_id,
    'owned_companies', v_expected,
    'provider_backups', 'live application data deleted; provider backup retention is outside Risip control');
end;
$$;


ALTER FUNCTION public.delete_account_data(p_profile_id uuid, p_owned_company_ids uuid[]) OWNER TO postgres;

--
-- Name: delete_company_data(uuid, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_company_data(p_company_id uuid, p_allow_orphan_profiles boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
declare
  v_profile uuid;
  v_fallback uuid;
  v_profiles uuid[] := '{}'::uuid[];
  v_table name;
  v_count bigint;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service role required' using errcode = '42501', hint = 'service_role_required';
  end if;
  if p_company_id is null then
    raise exception 'company id is required' using errcode = '22004', hint = 'company_required';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    return jsonb_build_object('deleted', false, 'company_id', p_company_id, 'already_absent', true);
  end if;

  -- Detach every profile before deleting the company. A business delete is
  -- fail-closed when somebody would otherwise lose their only active home.
  select coalesce(array_agg(x.id order by x.id), '{}') into v_profiles
    from (
      select distinct p.id
        from public.profiles p
        left join public.company_members m on m.profile_id = p.id
       where m.company_id = p_company_id
          or p.company_id = p_company_id
          or p.active_company_id = p_company_id
    ) x;

  foreach v_profile in array v_profiles loop
    select m.company_id into v_fallback
      from public.company_members m
     where m.profile_id = v_profile
       and m.company_id <> p_company_id
       and m.deactivated_at is null
     order by (m.company_id = (select active_company_id from public.profiles where id = v_profile)) desc,
              m.joined_at asc, m.company_id
     limit 1;

    if v_fallback is null and not p_allow_orphan_profiles then
      raise exception 'account deletion is required before deleting this sole business'
        using errcode = 'P0001', hint = 'account_deletion_required';
    end if;

    if v_fallback is not null then
      update public.whatsapp_identities
         set company_id = v_fallback
       where profile_id = v_profile and company_id = p_company_id;
    end if;

    update public.profiles
       set company_id = v_fallback,
           active_company_id = case
             when active_company_id = p_company_id then v_fallback
             else active_company_id
           end
     where id = v_profile;
  end loop;

  -- These logs intentionally use SET NULL in the historical schema. Delete
  -- them explicitly so a company cannot leave a tenant-identifying orphan.
  delete from public.whatsapp_messages where company_id = p_company_id;
  delete from public.whatsapp_audit_log where company_id = p_company_id;
  delete from public.whatsapp_conversations where company_id = p_company_id;
  delete from public.whatsapp_ai_messages where company_id = p_company_id;
  delete from public.whatsapp_ai_threads where company_id = p_company_id;
  delete from public.whatsapp_notification_deliveries where company_id = p_company_id;
  delete from public.whatsapp_notification_consent_log where company_id = p_company_id;

  -- Remove restrictive child links before their parent records.
  delete from public.whole_animal_breakdown_outputs
   where breakdown_daily_record_id in (
     select daily_record_id from public.whole_animal_breakdowns where company_id = p_company_id
   );
  delete from public.whole_animal_breakdowns where company_id = p_company_id;
  delete from public.whole_animal_procurements where company_id = p_company_id;
  delete from public.staff_retirement_receipts
   where retirement_id in (select id from public.staff_retirements where company_id = p_company_id)
      or receipt_id in (select id from public.receipts where company_id = p_company_id);
  delete from public.reimbursement_payout_items
   where payout_id in (select id from public.reimbursement_payouts where company_id = p_company_id)
      or receipt_id in (select id from public.receipts where company_id = p_company_id);
  delete from public.invoice_receipts
   where invoice_id in (select i.id from public.invoices i join public.projects p on p.id = i.project_id where p.company_id = p_company_id)
      or receipt_id in (select id from public.receipts where company_id = p_company_id);
  delete from public.petty_cash_transactions
   where account_id in (select id from public.petty_cash_accounts where company_id = p_company_id)
      or receipt_id in (select id from public.receipts where company_id = p_company_id);
  delete from public.staff_retirement_documents where company_id = p_company_id;
  delete from public.staff_retirements where company_id = p_company_id;
  delete from public.receipts where company_id = p_company_id;
  delete from public.daily_records where company_id = p_company_id;
  delete from public.projects where company_id = p_company_id;

  -- All remaining company-owned tables either cascade from companies or are
  -- direct company logs/configuration. Deleting the company removes those rows
  -- in the same transaction, including memberships, invites, products, stock,
  -- debts/payables, supplier claims, reports, and WhatsApp link state.
  delete from public.companies where id = p_company_id;

  -- Guard against future direct company_id tables being added with SET NULL.
  for v_table in
    select distinct c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'companies'
  loop
    execute format('select count(*) from public.%I where company_id = $1', v_table)
      into v_count using p_company_id;
    if v_count > 0 then
      raise exception 'company deletion left rows in %.company_id', v_table
        using errcode = 'P0001', hint = 'company_delete_incomplete';
    end if;
  end loop;

  return jsonb_build_object('deleted', true, 'company_id', p_company_id,
    'provider_backups', 'live application data deleted; provider backup retention is outside Risip control');
end;
$_$;


ALTER FUNCTION public.delete_company_data(p_company_id uuid, p_allow_orphan_profiles boolean) OWNER TO postgres;

--
-- Name: ensure_chat_identity(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_chat_identity() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_id uuid; v_company uuid;
begin
  select active_company_id into v_company from public.profiles where id = auth.uid() and deactivated_at is null for update;
  if v_company is null or not exists (select 1 from public.company_members where profile_id = auth.uid() and company_id = v_company and deactivated_at is null) then
    raise exception 'inactive_membership';
  end if;
  select id into v_id from public.whatsapp_identities where profile_id = auth.uid() and revoked_at is null;
  if v_id is null then
    insert into public.whatsapp_identities(profile_id, company_id, phone_e164, verified_at)
      values (auth.uid(), v_company, 'web:' || auth.uid()::text, null) returning id into v_id;
  end if;
  return v_id;
end $$;


ALTER FUNCTION public.ensure_chat_identity() OWNER TO postgres;

--
-- Name: find_product_barcode(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.find_product_barcode(p_barcode text) RETURNS TABLE(barcode text, product_key text, product_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select b.barcode, b.product_key, b.product_name
  from public.product_barcodes b
  where b.company_id = private.auth_company_id()
    and b.barcode = regexp_replace(coalesce(p_barcode, ''), '[^0-9]', '', 'g')
  limit 1;
$$;


ALTER FUNCTION public.find_product_barcode(p_barcode text) OWNER TO postgres;

--
-- Name: find_profile_by_name_in_company_v1(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.find_profile_by_name_in_company_v1(p_company_id uuid, p_full_name text) RETURNS TABLE(profile_id uuid, email text, role public.user_role)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.id, u.email, p.role
  from profiles p
  join auth.users u on u.id = p.id
  where p.company_id = p_company_id
    and lower(p.full_name) = lower(trim(p_full_name))
    and p.deactivated_at is null
  limit 1
$$;


ALTER FUNCTION public.find_profile_by_name_in_company_v1(p_company_id uuid, p_full_name text) OWNER TO postgres;

--
-- Name: get_invite_info(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_invite_info(p_token text) RETURNS TABLE(project_id uuid, project_name text, company_id uuid, company_name text, role public.user_role, is_valid boolean, reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r record;
begin
  select il.project_id, il.role, il.revoked_at, il.expires_at,
         p.name as project_name, p.company_id, p.status as project_status,
         c.name as company_name
    into r
    from invite_links il
    join projects p on p.id = il.project_id
    join companies c on c.id = p.company_id
   where il.token = p_token
   limit 1;

  if not found then
    return query select null::uuid, null::text, null::uuid, null::text, null::user_role, false, 'not_found'::text;
    return;
  end if;

  if r.revoked_at is not null then
    return query select r.project_id, r.project_name, r.company_id, r.company_name, r.role, false, 'revoked'::text;
    return;
  end if;

  if r.expires_at is not null and r.expires_at < now() then
    return query select r.project_id, r.project_name, r.company_id, r.company_name, r.role, false, 'expired'::text;
    return;
  end if;

  if r.project_status <> 'active' then
    return query select r.project_id, r.project_name, r.company_id, r.company_name, r.role, false, 'project_inactive'::text;
    return;
  end if;

  return query select r.project_id, r.project_name, r.company_id, r.company_name, r.role, true, null::text;
end;
$$;


ALTER FUNCTION public.get_invite_info(p_token text) OWNER TO postgres;

--
-- Name: guard_chat_business_switch(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.guard_chat_business_switch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_id uuid;
begin
  if old.active_company_id is not distinct from new.active_company_id then return new; end if;
  select id into v_id from public.whatsapp_identities where profile_id = old.id and revoked_at is null;
  if exists (select 1 from public.whatsapp_turn_locks where phone_e164 = 'identity:' || v_id::text and lease_until > clock_timestamp())
    and current_setting('risip.allow_turn_switch', true) is distinct from 'yes' then raise exception 'chat_busy'; end if;
  if exists (select 1 from public.whatsapp_conversations where identity_id = v_id and awaiting <> 'business' and expires_at > now()) then raise exception 'chat_pending'; end if;
  return new;
end $$;


ALTER FUNCTION public.guard_chat_business_switch() OWNER TO postgres;

--
-- Name: guard_web_identity_notifications(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.guard_web_identity_notifications() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if new.verified_at is null then
    new.daily_summary_opted_in_at := null;
    new.debt_reminders_opted_in_at := null;
    new.proactive_notifications_opted_out_at := now();
  end if;
  return new;
end $$;


ALTER FUNCTION public.guard_web_identity_notifications() OWNER TO postgres;

--
-- Name: invoices_this_month_count(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.invoices_this_month_count(p_project uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare cid uuid; n integer;
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'not authorized' using errcode = 'P0001';
  end if;
  cid := private.auth_company_id();
  select count(*) into n
    from public.invoices i join public.projects p on p.id = i.project_id
   where p.company_id = cid
     and (p_project is null or i.project_id = p_project)
     and i.created_at >= date_trunc('month', now());
  return coalesce(n, 0);
end $$;


ALTER FUNCTION public.invoices_this_month_count(p_project uuid) OWNER TO postgres;

--
-- Name: join_by_invite_v1(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.join_by_invite_v1(p_user_id uuid, p_token text, p_full_name text, p_phone text) RETURNS TABLE(project_id uuid, role public.user_role)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_invite invite_links%rowtype;
  v_project projects%rowtype;
begin
  if p_user_id is null then raise exception 'user_id required'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'full_name required'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user does not exist';
  end if;
  if exists (select 1 from profiles where id = p_user_id) then
    raise exception 'profile already exists';
  end if;

  select * into v_invite from invite_links where token = p_token limit 1;
  if not found then raise exception 'invite not found'; end if;
  if v_invite.revoked_at is not null then raise exception 'invite revoked'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'invite expired';
  end if;

  select * into v_project from projects where id = v_invite.project_id limit 1;
  if v_project.status <> 'active' then raise exception 'project not active'; end if;

  insert into profiles (id, company_id, full_name, phone, role)
  values (p_user_id, v_project.company_id, trim(p_full_name), nullif(trim(p_phone), ''), v_invite.role);

  if v_invite.role = 'worker' then
    insert into project_members (project_id, profile_id)
    values (v_project.id, p_user_id)
    on conflict do nothing;
  end if;

  return query select v_project.id, v_invite.role;
end;
$$;


ALTER FUNCTION public.join_by_invite_v1(p_user_id uuid, p_token text, p_full_name text, p_phone text) OWNER TO postgres;

--
-- Name: join_company_by_password_v1(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.join_company_by_password_v1(p_user_id uuid, p_company_id uuid, p_password text, p_full_name text, p_phone text) RETURNS public.user_role
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare hash text;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'user not found'; end if;
  if exists (select 1 from profiles where id = p_user_id) then raise exception 'profile already exists'; end if;
  if coalesce(trim(p_full_name),'') = '' then raise exception 'full_name required'; end if;

  select password_hash into hash from companies where id = p_company_id;
  if hash is null then raise exception 'company_password_not_set'; end if;
  if hash <> crypt(p_password, hash) then raise exception 'invalid_company_password'; end if;

  insert into profiles (id, company_id, full_name, phone, role)
  values (p_user_id, p_company_id, trim(p_full_name), nullif(trim(p_phone),''), 'worker');

  return 'worker'::user_role;
end;
$$;


ALTER FUNCTION public.join_company_by_password_v1(p_user_id uuid, p_company_id uuid, p_password text, p_full_name text, p_phone text) OWNER TO postgres;

--
-- Name: keep_chat_question_day(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.keep_chat_question_day() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if old.company_id = new.company_id and old.expires_at > now() then new.chat_day := old.chat_day;
  else new.chat_day := (now() at time zone 'Africa/Dar_es_Salaam')::date; end if;
  return new;
end $$;


ALTER FUNCTION public.keep_chat_question_day() OWNER TO postgres;

--
-- Name: mark_receipts_reimbursed(uuid[], boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mark_receipts_reimbursed(p_receipt_ids uuid[], p_paid boolean DEFAULT true) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_company uuid; v_settled int := 0; r record; v_ids uuid[];
begin
  if not p_paid then
    raise exception 'Un-paying is now an audited void. Use void_reimbursement_payout with a reason instead.'
      using errcode = 'P0001', hint = 'use_void_payout';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then raise exception 'not authorized'; end if;
  if p_receipt_ids is null or array_length(p_receipt_ids, 1) is null then return 0; end if;
  v_company := private.auth_company_id();

  for r in
    select uploaded_by, array_agg(id) as ids
      from public.receipts
     where id = any(p_receipt_ids) and company_id = v_company
       and status = 'confirmed' and payment_method = 'cash_personal'
       and reimbursed_at is null
     group by uploaded_by
  loop
    v_ids := r.ids;
    perform public.create_reimbursement_payout(v_ids, null, null, null);
    v_settled := v_settled + coalesce(array_length(v_ids, 1), 0);
  end loop;

  return v_settled;
end $$;


ALTER FUNCTION public.mark_receipts_reimbursed(p_receipt_ids uuid[], p_paid boolean) OWNER TO postgres;

--
-- Name: mark_retirement_paid(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mark_retirement_paid(p_retirement uuid, p_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  sr record;
  v_actor uuid := auth.uid();
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may mark a retirement paid' using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_method is not null and p_method not in ('cash', 'mobile_money', 'bank', 'other') then
    raise exception 'unknown payment method %', p_method using errcode = 'P0001', hint = 'bad_payment_method';
  end if;

  select * into sr from public.staff_retirements where id = p_retirement for update;
  if not found then raise exception 'retirement not found' using errcode = 'P0001'; end if;
  if sr.company_id <> private.auth_company_id() then raise exception 'not your company' using errcode = 'P0001'; end if;
  if sr.staff_id = v_actor then
    raise exception 'you submitted this retirement, so another finance user must pay it'
      using errcode = 'P0001', hint = 'maker_checker';
  end if;
  if sr.status <> 'approved'::public.staff_retirement_status then
    raise exception 'only an approved retirement can be marked paid' using errcode = 'P0001', hint = 'bad_transition';
  end if;

  update public.staff_retirements
     set status = 'paid'::public.staff_retirement_status,
         paid_at = now(),
         paid_by = v_actor,
         paid_amount_snapshot = total_amount,
         payment_method = p_method,
         payment_reference = nullif(btrim(p_reference), ''),
         decision_reason = nullif(btrim(p_reason), ''),
         updated_at = now()
   where id = p_retirement;

  insert into public.staff_retirement_audit_log
    (retirement_id, company_id, actor_id, action, from_status, to_status, reason, metadata)
  values
    (p_retirement, sr.company_id, v_actor, 'paid', sr.status, 'paid'::public.staff_retirement_status,
     nullif(btrim(p_reason), ''),
     jsonb_build_object('amount', sr.total_amount, 'method', p_method, 'reference', nullif(btrim(p_reference), '')));

  perform private.staff_retirement_notify_staff(
    sr.company_id, sr.staff_id, v_actor, 'retirement_paid', 'Retirement marked as paid',
    'TSh ' || trim(to_char(sr.total_amount, 'FM999,999,999,999,990')) || ' was marked paid for "' || sr.title || '".'
      || coalesce(' Reference: ' || nullif(btrim(p_reference), ''), ''),
    jsonb_build_object('retirement_id', p_retirement, 'amount', sr.total_amount)
  );

  return jsonb_build_object('status', 'paid', 'retirement_id', p_retirement, 'amount', sr.total_amount);
end $$;


ALTER FUNCTION public.mark_retirement_paid(p_retirement uuid, p_method text, p_reference text, p_reason text) OWNER TO postgres;

--
-- Name: mark_supplier_claim_paid(uuid, numeric, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mark_supplier_claim_paid(p_claim_id uuid, p_amount numeric, p_method text, p_reference text, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  c record;
  v_actor uuid := auth.uid();
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_actor_name text := private.supplier_claim_actor_name(auth.uid());
begin
  perform private.supplier_claim_require_finance();

  if p_amount is null or p_amount <= 0 then
    raise exception 'enter a positive payment amount' using errcode = 'P0001', hint = 'bad_amount';
  end if;
  if p_method is null or p_method not in ('cash', 'mobile_money', 'bank', 'other') then
    raise exception 'choose a payment method' using errcode = 'P0001', hint = 'bad_payment_method';
  end if;

  select * into c
    from public.supplier_claims
   where id = p_claim_id
   for update;

  if not found then
    raise exception 'supplier claim not found' using errcode = 'P0001';
  end if;
  if c.target_company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;
  if c.status <> 'approved_for_payment'::public.supplier_claim_status then
    raise exception 'only a supplier claim approved for payment can be marked paid'
      using errcode = 'P0001', hint = 'bad_transition';
  end if;

  update public.supplier_claims
     set status = 'paid'::public.supplier_claim_status,
         paid_at = now(),
         paid_by = v_actor,
         paid_amount_snapshot = p_amount,
         payment_method = p_method,
         payment_reference = v_reference,
         payment_note = v_note,
         decision_reason = v_note,
         updated_at = now()
   where id = p_claim_id;

  insert into public.supplier_claim_audit_log
    (claim_id, company_id, actor_id, action, from_status, to_status, reason, metadata)
  values
    (p_claim_id, c.target_company_id, v_actor, 'paid', c.status, 'paid'::public.supplier_claim_status,
     v_note,
     jsonb_build_object('amount', p_amount, 'method', p_method, 'reference', v_reference));

  perform private.supplier_claim_add_supplier_message(
    p_claim_id,
    v_actor_name,
    'Supplier claim "' || c.title || '" was marked paid for TSh '
      || trim(to_char(p_amount, 'FM999,999,999,999,990'))
      || coalesce('. Reference: ' || v_reference, '')
      || coalesce('. Note: ' || v_note, '')
  );

  return jsonb_build_object('status', 'paid', 'claim_id', p_claim_id, 'amount', p_amount);
end $$;


ALTER FUNCTION public.mark_supplier_claim_paid(p_claim_id uuid, p_amount numeric, p_method text, p_reference text, p_note text) OWNER TO postgres;

--
-- Name: marketplace_confirm_by_reply(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.marketplace_confirm_by_reply(p_supplier_company_id uuid, p_accept boolean, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare o public.marketplace_order_requests;
begin
  perform private.marketplace_require_actor(p_supplier_company_id);

  -- Lock the row: two replies arriving together must not both decide it.
  select * into o from public.marketplace_order_requests
   where supplier_company_id = p_supplier_company_id and status = 'placed'
   order by placed_at
   limit 1
   for update;

  if o.id is null then
    raise exception 'no order is waiting for your confirmation'
      using errcode = 'P0002', hint = 'no_pending_order';
  end if;

  return public.marketplace_update_order_status(
    o.id, case when p_accept then 'accepted' else 'rejected' end,
    p_reason, p_supplier_company_id);
end $$;


ALTER FUNCTION public.marketplace_confirm_by_reply(p_supplier_company_id uuid, p_accept boolean, p_reason text) OWNER TO postgres;

--
-- Name: marketplace_create_selection(uuid, text, uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.marketplace_create_selection(p_buyer_company_id uuid, p_query text, p_buyer_profile_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 5) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid;
  v_search  jsonb;
  v_id      uuid;
  v_empty   boolean;
begin
  v_profile := private.marketplace_require_actor(p_buyer_company_id, p_buyer_profile_id);
  v_search  := public.marketplace_search_stock(p_buyer_company_id, p_query, p_limit);

  v_empty := jsonb_array_length(v_search->'options') = 0;

  -- One open pick-list per shop. A new request supersedes the last.
  update public.marketplace_pending_selections
     set consumed_at = now()
   where buyer_company_id = p_buyer_company_id and consumed_at is null;

  -- A search that found nothing is still recorded, and immediately consumed so
  -- it can never be ordered against. Without the row, searchesNoResult in the
  -- admin console would always read zero and the "which products do shops ask
  -- for that nobody stocks" signal would be invisible.
  insert into public.marketplace_pending_selections
    (buyer_company_id, buyer_profile_id, query_text, options, consumed_at)
  values (p_buyer_company_id, v_profile, p_query,
          jsonb_build_object('buyerProductKey', v_search->'buyerProductKey',
                             'options', v_search->'options'),
          case when v_empty then now() end)
  returning id into v_id;

  return jsonb_build_object(
    'selectionId', case when v_empty then null else v_id end,
    'query', p_query,
    'buyerProductKey', v_search->'buyerProductKey',
    'options', v_search->'options',
    'expiresInMinutes', 30
  );
end $$;


ALTER FUNCTION public.marketplace_create_selection(p_buyer_company_id uuid, p_query text, p_buyer_profile_id uuid, p_limit integer) OWNER TO postgres;

--
-- Name: marketplace_incoming_orders(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.marketplace_incoming_orders(p_supplier_company_id uuid, p_status text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  perform private.marketplace_require_actor(p_supplier_company_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'orderId', o.id, 'status', o.status,
             'productName', o.product_name, 'quantity', o.quantity, 'unit', o.unit,
             'unitPrice', o.unit_price, 'currency', o.currency,
             'matchConfidence', o.match_confidence, 'matchBasis', o.match_basis,
             'buyerCompanyId', o.buyer_company_id, 'buyerName', b.name,
             'placedAt', o.placed_at) order by o.placed_at desc)
    from public.marketplace_order_requests o
    join public.companies b on b.id = o.buyer_company_id
    where o.supplier_company_id = p_supplier_company_id
      and (p_status is null or o.status = p_status)
  ), '[]'::jsonb);
end $$;


ALTER FUNCTION public.marketplace_incoming_orders(p_supplier_company_id uuid, p_status text) OWNER TO postgres;

--
-- Name: marketplace_last_selection(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.marketplace_last_selection(p_buyer_company_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_id uuid;
begin
  perform private.marketplace_require_actor(p_buyer_company_id);
  select id into v_id
  from public.marketplace_pending_selections
  where buyer_company_id = p_buyer_company_id
    and consumed_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;
  return v_id;
end $$;


ALTER FUNCTION public.marketplace_last_selection(p_buyer_company_id uuid) OWNER TO postgres;

--
-- Name: marketplace_my_orders(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.marketplace_my_orders(p_buyer_company_id uuid, p_status text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  perform private.marketplace_require_actor(p_buyer_company_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'orderId', o.id, 'status', o.status,
             'productName', o.product_name, 'quantity', o.quantity, 'unit', o.unit,
             'unitPrice', o.unit_price, 'currency', o.currency,
             'supplierCompanyId', o.supplier_company_id, 'supplierName', s.name,
             'placedAt', o.placed_at) order by o.placed_at desc)
    from public.marketplace_order_requests o
    join public.companies s on s.id = o.supplier_company_id
    where o.buyer_company_id = p_buyer_company_id
      and (p_status is null or o.status = p_status)
  ), '[]'::jsonb);
end $$;


ALTER FUNCTION public.marketplace_my_orders(p_buyer_company_id uuid, p_status text) OWNER TO postgres;

--
-- Name: marketplace_order_contacts(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.marketplace_order_contacts(p_order_id uuid, p_for_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  o public.marketplace_order_requests;
  v_other uuid;
  v_card  jsonb;
begin
  select * into o from public.marketplace_order_requests where id = p_order_id;
  if o.id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if p_for_company_id = o.buyer_company_id then
    v_other := o.supplier_company_id;
  elsif p_for_company_id = o.supplier_company_id then
    v_other := o.buyer_company_id;
  else
    raise exception 'not a party to this order' using errcode = 'P0001', hint = 'not_order_party';
  end if;

  select jsonb_build_object(
    'companyId',   c.id,
    'companyName', c.name,
    'contactName', p.full_name,
    'phone',       p.phone,
    -- Verified, un-revoked, not opted out: the number that can actually
    -- receive a WhatsApp message today.
    'whatsapp',    (select w.phone_e164 from public.whatsapp_identities w
                     where w.company_id = c.id
                       and w.verified_at is not null
                       and w.revoked_at is null
                       and w.opted_out_at is null
                     order by (w.profile_id = p.id) desc, w.verified_at desc
                     limit 1)
  ) into v_card
  from public.companies c
  left join public.company_marketplace_settings s on s.company_id = c.id
  left join lateral (
    select pr.id, pr.full_name, pr.phone
    from public.profiles pr
    where pr.id = coalesce(
      s.contact_profile_id,
      -- public.user_role is (owner, accountant, worker). There is no 'admin'
      -- label; comparing the enum against one raises invalid_text_representation.
      (select cm.profile_id from public.company_members cm
        where cm.company_id = c.id and cm.deactivated_at is null
        order by (cm.role = 'owner') desc, cm.joined_at
        limit 1))
  ) p on true
  where c.id = v_other;

  return coalesce(v_card, jsonb_build_object('companyId', v_other, 'contactName', null));
end $$;


ALTER FUNCTION public.marketplace_order_contacts(p_order_id uuid, p_for_company_id uuid) OWNER TO postgres;

--
-- Name: marketplace_pending_confirmation(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.marketplace_pending_confirmation(p_supplier_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare o public.marketplace_order_requests; v_buyer text;
begin
  perform private.marketplace_require_actor(p_supplier_company_id);
  select * into o from public.marketplace_order_requests
   where supplier_company_id = p_supplier_company_id and status = 'placed'
   order by placed_at
   limit 1;
  if o.id is null then return null; end if;
  select name into v_buyer from public.companies where id = o.buyer_company_id;
  return jsonb_build_object(
    'orderId', o.id, 'productName', o.product_name,
    'quantity', o.quantity, 'unit', o.unit,
    'buyerName', v_buyer, 'placedAt', o.placed_at,
    'pendingCount', (select count(*)::int from public.marketplace_order_requests
                      where supplier_company_id = p_supplier_company_id and status = 'placed'));
end $$;


ALTER FUNCTION public.marketplace_pending_confirmation(p_supplier_company_id uuid) OWNER TO postgres;

--
-- Name: marketplace_place_order(uuid, integer, numeric, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.marketplace_place_order(p_selection_id uuid, p_option_index integer, p_quantity numeric, p_buyer_profile_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_sel      public.marketplace_pending_selections;
  v_opt      jsonb;
  v_profile  uuid;
  v_request  public.marketplace_order_requests;
  v_shop_order uuid;
  v_buyer_card jsonb;
  v_supplier_card jsonb;
begin
  select * into v_sel from public.marketplace_pending_selections where id = p_selection_id;
  if v_sel.id is null then
    raise exception 'that list has expired, please ask again'
      using errcode = 'P0002', hint = 'selection_not_found';
  end if;
  if v_sel.consumed_at is not null or v_sel.expires_at < now() then
    raise exception 'that list has expired, please ask again'
      using errcode = 'P0001', hint = 'selection_expired';
  end if;

  v_profile := private.marketplace_require_actor(v_sel.buyer_company_id, p_buyer_profile_id);

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than zero' using errcode = '22023';
  end if;

  -- Options are presented to the shop owner as 1..n.
  v_opt := (v_sel.options->'options') -> (p_option_index - 1);
  if v_opt is null then
    raise exception 'pick a number from the list' using errcode = '22023', hint = 'bad_option_index';
  end if;

  -- The supplier's consent is re-checked at placement, not just at search:
  -- a shop may have opted out between the list and the reply.
  perform private.marketplace_require_optin((v_opt->>'supplier_company_id')::uuid);

  insert into public.marketplace_order_requests (
    buyer_company_id, supplier_company_id, buyer_profile_id, query_text,
    buyer_product_key, supplier_product_key, product_name,
    match_confidence, match_basis, quantity, unit, unit_price, currency,
    stock_snapshot_qty, stock_counted_at
  ) values (
    v_sel.buyer_company_id,
    (v_opt->>'supplier_company_id')::uuid,
    v_profile,
    v_sel.query_text,
    nullif(v_sel.options->>'buyerProductKey', ''),
    v_opt->>'supplier_product_key',
    v_opt->>'product_name',
    (v_opt->>'match_confidence')::numeric,
    v_opt->>'match_basis',
    p_quantity,
    v_opt->>'unit',
    nullif(v_opt->>'unit_price', '')::numeric,
    nullif(v_opt->>'currency', ''),
    nullif(v_opt->>'quantity', '')::numeric,
    nullif(v_opt->>'stock_counted_at', '')::timestamptz
  ) returning * into v_request;

  update public.marketplace_pending_selections set consumed_at = now() where id = p_selection_id;

  v_shop_order := private.marketplace_link_shop_order(v_request.id);
  if v_shop_order is not null then
    update public.marketplace_order_requests set shop_order_id = v_shop_order where id = v_request.id;
  end if;

  -- Tell both shops on WhatsApp, through the RISIP account. Each side gets the
  -- other's contact card; the supplier's message is the one that asks for a
  -- 1 / 0 confirmation.
  v_buyer_card    := public.marketplace_order_contacts(v_request.id, v_request.buyer_company_id);
  v_supplier_card := public.marketplace_order_contacts(v_request.id, v_request.supplier_company_id);

  perform private.marketplace_enqueue(
    v_request.id, v_request.buyer_company_id, 'order_placed_buyer',
    jsonb_build_object('productName', v_request.product_name,
                       'quantity', v_request.quantity, 'unit', v_request.unit,
                       'matchBasis', v_request.match_basis,
                       'shopOrderId', v_shop_order,
                       'contact', v_buyer_card));

  perform private.marketplace_enqueue(
    v_request.id, v_request.supplier_company_id, 'order_new_supplier',
    jsonb_build_object('productName', v_request.product_name,
                       'quantity', v_request.quantity, 'unit', v_request.unit,
                       'supplierProductKey', v_request.supplier_product_key,
                       'shopOrderId', v_shop_order,
                       'awaitingConfirmation', true,
                       'contact', v_supplier_card));

  return jsonb_build_object(
    'orderId', v_request.id,
    'shopOrderId', v_shop_order,
    'status', v_request.status,
    'productName', v_request.product_name,
    'quantity', v_request.quantity,
    'unit', v_request.unit,
    -- marketplace_order_contacts returns the card the ASKER receives, so the
    -- buyer's call yields the supplier's details and vice versa.
    'supplierContact', v_buyer_card,
    'buyerContact',    v_supplier_card
  );
end $$;


ALTER FUNCTION public.marketplace_place_order(p_selection_id uuid, p_option_index integer, p_quantity numeric, p_buyer_profile_id uuid) OWNER TO postgres;

--
-- Name: marketplace_reindex_all(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.marketplace_reindex_all() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_company uuid; v_total integer := 0;
begin
  -- Only opted-in companies are indexed. Opting out and reindexing removes a
  -- company from discovery entirely.
  for v_company in
    select s.company_id from public.company_marketplace_settings s where s.opt_in
  loop
    v_total := v_total + public.marketplace_reindex_company(v_company);
  end loop;
  return v_total;
end $$;


ALTER FUNCTION public.marketplace_reindex_all() OWNER TO postgres;

--
-- Name: marketplace_reindex_company(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.marketplace_reindex_company(p_company_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_count integer;
begin
  delete from public.marketplace_product_index where company_id = p_company_id;

  insert into public.marketplace_product_index
    (company_id, product_key, product_name, normalized_name, barcodes)
  select p_company_id,
         pu.product_key,
         pu.resolved_name,
         private.marketplace_normalize(pu.resolved_name),
         coalesce((select array_agg(distinct b.barcode)
                   from public.product_barcodes b
                   where b.company_id = p_company_id
                     and b.product_key = pu.product_key), '{}')
  from (
    select distinct u.product_key,
           coalesce(
             max(u.product_name),
             (select c.product_name from public.product_costs c
               where c.company_id = p_company_id and c.product_key = u.product_key
               order by c.effective_from desc nulls last limit 1),
             (select sp.product_name from public.product_selling_prices sp
               where sp.company_id = p_company_id and sp.product_key = u.product_key
               order by sp.effective_from desc nulls last limit 1)
           ) as resolved_name
    from public.product_units u
    where u.company_id = p_company_id
    group by u.product_key
  ) pu
  -- An archived product is not for sale and must not appear in search.
  where pu.resolved_name is not null
    and private.marketplace_normalize(pu.resolved_name) is not null
    and not exists (select 1 from public.product_archives pa
                    where pa.company_id = p_company_id
                      and pa.product_key = pu.product_key);

  get diagnostics v_count = row_count;
  return v_count;
end $$;


ALTER FUNCTION public.marketplace_reindex_company(p_company_id uuid) OWNER TO postgres;

--
-- Name: marketplace_search_stock(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.marketplace_search_stock(p_buyer_company_id uuid, p_query text, p_limit integer DEFAULT 5) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_norm  text := private.marketplace_normalize(p_query);
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 10));
  v_buyer_barcodes text[];
  v_buyer_key text;
  v_rows jsonb;
begin
  perform private.marketplace_require_actor(p_buyer_company_id);
  perform private.marketplace_require_optin(p_buyer_company_id);

  if v_norm is null then
    raise exception 'a product name is required' using errcode = '22023';
  end if;

  -- The buyer's own matching product, if they stock it. Gives us barcodes for
  -- an exact cross-shop match and records what they were trying to replace.
  select i.product_key, i.barcodes into v_buyer_key, v_buyer_barcodes
  from public.marketplace_product_index i
  where i.company_id = p_buyer_company_id
    and (i.normalized_name = v_norm or i.normalized_name like v_norm || '%')
  order by (i.normalized_name = v_norm) desc
  limit 1;
  v_buyer_barcodes := coalesce(v_buyer_barcodes, '{}');

  select coalesce(jsonb_agg(to_jsonb(m) order by m.match_confidence desc, m.quantity desc), '[]'::jsonb)
    into v_rows
  from (
    select
      i.company_id                        as supplier_company_id,
      c.name                              as supplier_name,
      i.product_key                       as supplier_product_key,
      i.product_name,
      sc.quantity,
      sc.unit,
      sc.counted_at                       as stock_counted_at,
      -- Age is always returned. A nine-day-old count is a real answer, but the
      -- buyer has to be told it is nine days old.
      extract(day from (now() - sc.counted_at))::int as stock_age_days,
      case when s.share_prices then sp.wholesale_price end  as unit_price,
      case when s.share_prices then sp.wholesale_min_qty end as min_quantity,
      case when s.share_prices then sp.currency end          as currency,
      case
        when i.barcodes && v_buyer_barcodes then 'barcode'
        when i.normalized_name = v_norm     then 'exact_name'
        when i.normalized_name like v_norm || '%' then 'prefix_name'
        else 'fuzzy_name'
      end as match_basis,
      case
        when i.barcodes && v_buyer_barcodes then 1.000
        when i.normalized_name = v_norm     then 0.950
        when i.normalized_name like v_norm || '%' then 0.850
        else round(similarity(i.normalized_name, v_norm)::numeric, 3)
      end as match_confidence
    from public.marketplace_product_index i
    join public.company_marketplace_settings s
      on s.company_id = i.company_id and s.opt_in
    join public.companies c on c.id = i.company_id
    -- Latest count per product. stock_counts is a periodic count, not a live
    -- balance, which is exactly why counted_at travels with every row.
    join lateral (
      select sc2.quantity, sc2.unit, sc2.counted_at
      from public.stock_counts sc2
      where sc2.company_id = i.company_id
        and sc2.product_key = i.product_key
      order by sc2.counted_at desc nulls last
      limit 1
    ) sc on true
    left join lateral (
      select sp2.wholesale_price, sp2.wholesale_min_qty, sp2.currency
      from public.product_selling_prices sp2
      where sp2.company_id = i.company_id
        and sp2.product_key = i.product_key
      order by sp2.effective_from desc nulls last
      limit 1
    ) sp on true
    where i.company_id <> p_buyer_company_id
      and sc.quantity > 0
      and sc.counted_at >= now() - make_interval(days => s.max_stock_age_days)
      and (
        i.barcodes && v_buyer_barcodes
        or i.normalized_name = v_norm
        or i.normalized_name like v_norm || '%'
        or similarity(i.normalized_name, v_norm) >= 0.35
      )
    -- Rank BEFORE the limit. Ordering only in the outer jsonb_agg would take
    -- an arbitrary v_limit rows and then sort those, dropping better matches.
    order by match_confidence desc, sc.quantity desc
    limit v_limit
  ) m;

  return jsonb_build_object(
    'query', p_query,
    'normalized', v_norm,
    'buyerProductKey', v_buyer_key,
    'options', v_rows
  );
end $$;


ALTER FUNCTION public.marketplace_search_stock(p_buyer_company_id uuid, p_query text, p_limit integer) OWNER TO postgres;

--
-- Name: marketplace_update_order_status(uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.marketplace_update_order_status(p_order_id uuid, p_status text, p_reason text DEFAULT NULL::text, p_actor_company_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare o public.marketplace_order_requests; v_actor uuid;
begin
  select * into o from public.marketplace_order_requests where id = p_order_id;
  if o.id is null then raise exception 'order not found' using errcode = 'P0002'; end if;

  -- The supplier accepts, rejects or delivers. Only the buyer may cancel.
  v_actor := coalesce(p_actor_company_id,
                      case when p_status = 'cancelled' then o.buyer_company_id
                           else o.supplier_company_id end);
  if p_status = 'cancelled' and v_actor <> o.buyer_company_id then
    raise exception 'only the buyer may cancel' using errcode = 'P0001', hint = 'not_buyer';
  end if;
  if p_status in ('accepted','rejected','delivered') and v_actor <> o.supplier_company_id then
    raise exception 'only the supplier may set that status' using errcode = 'P0001', hint = 'not_supplier';
  end if;
  perform private.marketplace_require_actor(v_actor);

  update public.marketplace_order_requests
     set status = p_status,
         status_reason = left(btrim(coalesce(p_reason, '')), 500),
         accepted_at  = case when p_status = 'accepted'  then now() else accepted_at  end,
         rejected_at  = case when p_status = 'rejected'  then now() else rejected_at  end,
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
   where id = p_order_id
   returning * into o;

  -- The counterparty hears about it on WhatsApp: the buyer when the supplier
  -- accepts, rejects or delivers; the supplier when the buyer cancels.
  perform private.marketplace_enqueue(
    o.id,
    case when p_status = 'cancelled' then o.supplier_company_id else o.buyer_company_id end,
    'order_' || p_status,
    jsonb_build_object('productName', o.product_name, 'quantity', o.quantity,
                       'unit', o.unit, 'reason', o.status_reason,
                       'shopOrderId', o.shop_order_id));

  return jsonb_build_object('orderId', o.id, 'status', o.status);
end $$;


ALTER FUNCTION public.marketplace_update_order_status(p_order_id uuid, p_status text, p_reason text, p_actor_company_id uuid) OWNER TO postgres;

--
-- Name: merchant_memory_set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.merchant_memory_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION public.merchant_memory_set_updated_at() OWNER TO postgres;

--
-- Name: merge_products(text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.merge_products(p_from_key text, p_into_key text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_company uuid := private.auth_company_id();
  v_actor uuid := auth.uid();
  v_from text := lower(btrim(coalesce(p_from_key, '')));
  v_into text := lower(btrim(coalesce(p_into_key, '')));
  v_into_name text;
  v_lines int := 0;
  v_costs_moved int := 0;
  v_from_has_cost boolean;
  v_into_has_cost boolean;
  v_revenue_before numeric;
  v_revenue_after numeric;
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may merge products'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_from = '' or v_into = '' then
    raise exception 'both products are needed' using errcode = 'P0001', hint = 'no_product';
  end if;
  if v_from = v_into then
    raise exception 'that is the same product' using errcode = 'P0001', hint = 'same_product';
  end if;

  -- The spelling to keep: the one most recently used on a sale of the target,
  -- falling back to its buying-price name for a product never sold.
  select l.description into v_into_name
    from daily_record_lines l
    join daily_records r on r.id = l.daily_record_id
   where r.company_id = v_company
     and lower(btrim(l.description)) = v_into
   order by r.occurred_at desc
   limit 1;
  if v_into_name is null then
    select c.product_name into v_into_name
      from product_costs c
     where c.company_id = v_company and c.product_key = v_into
     order by c.effective_from desc, c.created_at desc
     limit 1;
  end if;
  if v_into_name is null then
    raise exception 'the product to keep was not found'
      using errcode = 'P0001', hint = 'target_not_found';
  end if;

  select exists (select 1 from product_costs where company_id = v_company and product_key = v_from),
         exists (select 1 from product_costs where company_id = v_company and product_key = v_into)
    into v_from_has_cost, v_into_has_cost;

  -- Merging two price histories would move past COGS. Nobody's profit changes
  -- because they tidied a name.
  if v_from_has_cost and v_into_has_cost then
    raise exception 'both products already have buying prices; keep one price before merging'
      using errcode = 'P0001', hint = 'both_have_costs';
  end if;

  -- Revenue is compared before and after so a merge that moved money would fail
  -- loudly here rather than quietly in a report next month.
  select coalesce(sum(l.line_total), 0) into v_revenue_before
    from daily_record_lines l
    join daily_records r on r.id = l.daily_record_id
   where r.company_id = v_company
     and lower(btrim(l.description)) in (v_from, v_into);

  update daily_record_lines l
     set description = v_into_name
    from daily_records r
   where r.id = l.daily_record_id
     and r.company_id = v_company
     and lower(btrim(l.description)) = v_from;
  get diagnostics v_lines = row_count;

  if v_from_has_cost then
    update product_costs
       set product_key = v_into, product_name = v_into_name
     where company_id = v_company and product_key = v_from;
    get diagnostics v_costs_moved = row_count;
  end if;

  delete from product_cost_prompts where company_id = v_company and product_key = v_from;
  delete from product_archives     where company_id = v_company and product_key = v_from;

  select coalesce(sum(l.line_total), 0) into v_revenue_after
    from daily_record_lines l
    join daily_records r on r.id = l.daily_record_id
   where r.company_id = v_company
     and lower(btrim(l.description)) = v_into;

  if v_revenue_before <> v_revenue_after then
    raise exception 'a merge must not change revenue (% became %)', v_revenue_before, v_revenue_after
      using errcode = 'P0001', hint = 'revenue_moved';
  end if;

  insert into product_events (company_id, actor_id, action, product_key, target_key, reason, metadata)
  values (v_company, v_actor, 'merge', v_from, v_into, nullif(btrim(p_reason), ''),
          jsonb_build_object('lines_moved', v_lines, 'costs_moved', v_costs_moved,
                             'kept_name', v_into_name, 'revenue', v_revenue_after));

  return jsonb_build_object('merged_into', v_into_name, 'lines_moved', v_lines,
                            'costs_moved', v_costs_moved, 'revenue', v_revenue_after);
end $$;


ALTER FUNCTION public.merge_products(p_from_key text, p_into_key text, p_reason text) OWNER TO postgres;

--
-- Name: my_legal_acceptance(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.my_legal_acceptance() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select jsonb_build_object('version',v.version,'accepted',exists(select 1 from public.legal_acceptances a where a.profile_id=auth.uid() and a.version=v.version))
  from public.legal_policy_versions v where v.active;
$$;


ALTER FUNCTION public.my_legal_acceptance() OWNER TO postgres;

--
-- Name: my_memberships(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.my_memberships() RETURNS TABLE(company_id uuid, company_name text, role public.user_role, is_active boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select c.id, c.name, m.role, (p.active_company_id = c.id)
    from company_members m
    join companies c on c.id = m.company_id
    join profiles p on p.id = m.profile_id
   where m.profile_id = auth.uid()
     and m.deactivated_at is null
   order by c.name;
$$;


ALTER FUNCTION public.my_memberships() OWNER TO postgres;

--
-- Name: my_shop_order_action(uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.my_shop_order_action(p_order_id uuid, p_action text, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'Only an owner or accountant may manage orders'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return public.wa_shop_order_action(p_order_id, private.auth_company_id(), p_action, p_note);
end;
$$;


ALTER FUNCTION public.my_shop_order_action(p_order_id uuid, p_action text, p_note text) OWNER TO postgres;

--
-- Name: my_shop_orders(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.my_shop_orders() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select public.wa_shop_order_book(private.auth_company_id());
$$;


ALTER FUNCTION public.my_shop_orders() OWNER TO postgres;

--
-- Name: my_supplier_status(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.my_supplier_status() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select jsonb_build_object(
    'is_supplier', coalesce((select cs.active from public.company_suppliers cs where cs.company_id = private.auth_company_id()), false),
    'opted_in_at', (select cs.opted_in_at from public.company_suppliers cs where cs.company_id = private.auth_company_id())
  );
$$;


ALTER FUNCTION public.my_supplier_status() OWNER TO postgres;

--
-- Name: my_whatsapp_notification_preferences(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.my_whatsapp_notification_preferences() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select jsonb_build_object(
    'connected', i.id is not null,
    'daily_summary_enabled', i.daily_summary_opted_in_at is not null
      and i.proactive_notifications_opted_out_at is null,
    'debt_reminders_enabled', i.debt_reminders_opted_in_at is not null
      and i.proactive_notifications_opted_out_at is null,
    'closing_time', case when c.closing_time is null then null
      else to_char(c.closing_time, 'HH24:MI') end,
    'timezone', coalesce(c.timezone, 'Africa/Dar_es_Salaam')
  )
  from public.profiles p
  join public.companies c on c.id = p.active_company_id
  left join public.whatsapp_identities i
    on i.profile_id = p.id and i.revoked_at is null
  where p.id = auth.uid()
    and p.deactivated_at is null
  limit 1;
$$;


ALTER FUNCTION public.my_whatsapp_notification_preferences() OWNER TO postgres;

--
-- Name: ops_alert_deliveries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ops_alert_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    incident_id uuid NOT NULL,
    event text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ops_alert_deliveries_event_check CHECK ((event = ANY (ARRAY['opened'::text, 'recovered'::text]))),
    CONSTRAINT ops_alert_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'failed'::text])))
);


ALTER TABLE public.ops_alert_deliveries OWNER TO postgres;

--
-- Name: ops_claim_alerts(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ops_claim_alerts() RETURNS SETOF public.ops_alert_deliveries
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  update public.ops_alert_deliveries set status='sending',attempts=attempts+1,available_at=now()+interval '2 minutes'
  where id in (select id from public.ops_alert_deliveries where status in ('pending','failed','sending') and available_at<=now() and attempts<8 order by created_at for update skip locked limit 20) returning *;
$$;


ALTER FUNCTION public.ops_claim_alerts() OWNER TO postgres;

--
-- Name: ops_record_check(jsonb, boolean, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ops_record_check(p_findings jsonb, p_complete boolean, p_email_configured boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
declare f jsonb; incident uuid; run_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('risip_ops_record_check'));
  if jsonb_typeof(p_findings) <> 'array' or jsonb_array_length(p_findings)>40 then raise exception 'invalid_findings'; end if;
  insert into public.ops_monitor_runs(complete,findings,email_configured) values(p_complete,p_findings,p_email_configured) returning id into run_id;
  for f in select value from jsonb_array_elements(p_findings) loop
    if f->>'code' !~ '^[a-z0-9_]{3,80}$' then raise exception 'invalid_finding_code'; end if;
    select id into incident from public.ops_incidents where code=f->>'code' and resolved_at is null for update;
    if incident is null then
      insert into public.ops_incidents(code,severity,title,detail,owner)
      values(f->>'code',f->>'severity',left(f->>'title',200),left(f->>'detail',1000),left(f->>'owner',120)) returning id into incident;
      insert into public.ops_alert_deliveries(incident_id,event) values(incident,'opened');
    else
      update public.ops_incidents set last_seen_at=now(),clean_checks=0,severity=f->>'severity',title=left(f->>'title',200),detail=left(f->>'detail',1000) where id=incident;
    end if;
  end loop;
  -- An incomplete observation must never turn unknown health into recovery.
  if p_complete then
    update public.ops_incidents i set clean_checks=clean_checks+1
      where resolved_at is null and not exists(select 1 from jsonb_array_elements(p_findings) j where j.value->>'code'=i.code);
    for incident in select i.id from public.ops_incidents i where i.resolved_at is null and i.clean_checks>=2 loop
      update public.ops_incidents set resolved_at=now() where id=incident;
      insert into public.ops_alert_deliveries(incident_id,event) values(incident,'recovered') on conflict do nothing;
    end loop;
  else
    update public.ops_incidents set clean_checks=0 where resolved_at is null;
  end if;
  delete from public.ops_monitor_runs where checked_at<now()-interval '30 days';
  return run_id;
end $_$;


ALTER FUNCTION public.ops_record_check(p_findings jsonb, p_complete boolean, p_email_configured boolean) OWNER TO postgres;

--
-- Name: petty_cash_apply_transaction(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.petty_cash_apply_transaction() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if (tg_op = 'INSERT' and new.status = 'accepted')
     or (tg_op = 'UPDATE' and old.status <> 'accepted' and new.status = 'accepted') then
    update public.petty_cash_accounts
       set current_balance = current_balance + new.amount,
           updated_at = now()
     where id = new.account_id;
  end if;
  return new;
end $$;


ALTER FUNCTION public.petty_cash_apply_transaction() OWNER TO postgres;

--
-- Name: petty_cash_auto_book_receipt(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.petty_cash_auto_book_receipt() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_acct uuid;
begin
  if new.status is distinct from 'confirmed' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then return new; end if;
  if new.payment_method is distinct from 'petty_cash' then return new; end if;

  if new.total_amount is null or new.total_amount <= 0 then
    raise exception 'Cannot book petty cash for a receipt with no positive amount.'
      using errcode = 'P0001', hint = 'invalid_amount';
  end if;

  -- petty_cash_accounts is UNIQUE (company_id, user_id), so this resolves to at
  -- most one row. It is a deterministic key, never a "first account" pick.
  select a.id into v_acct
    from public.petty_cash_accounts a
   where a.user_id = new.uploaded_by
     and a.company_id = new.company_id;
  if v_acct is null then
    raise exception 'No petty cash account for this employee in this company. Open one, or change the payment source.'
      using errcode = 'P0001', hint = 'no_petty_cash_account';
  end if;

  -- A reversed expense no longer counts, so a re-approved receipt books again.
  if private.receipt_has_live_expense(new.id) then
    return new;
  end if;

  insert into public.petty_cash_transactions
    (account_id, amount, type, receipt_id, description, created_by, project_id, status)
  values (
    v_acct, -new.total_amount, 'expense', new.id,
    coalesce('Receipt: ' || nullif(new.vendor_name, ''), 'Petty cash expense'),
    new.uploaded_by, new.project_id, 'accepted'
  );
  return new;
end $$;


ALTER FUNCTION public.petty_cash_auto_book_receipt() OWNER TO postgres;

--
-- Name: petty_cash_guard_balance(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.petty_cash_guard_balance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare bal numeric;
begin
  if new.amount >= 0 or new.status is distinct from 'accepted' then
    return new;
  end if;

  -- FOR UPDATE serialises every spend against this float.
  select a.current_balance into bal
    from public.petty_cash_accounts a
   where a.id = new.account_id
   for update;

  if bal is null then
    raise exception 'petty cash account not found' using errcode = 'P0001';
  end if;
  if bal + new.amount < 0 then
    raise exception
      'Insufficient petty cash: balance is %, this receipt needs %. Top up the account or change the payment source.',
      bal, abs(new.amount)
      using errcode = 'P0001', hint = 'insufficient_petty_cash';
  end if;
  return new;
end $$;


ALTER FUNCTION public.petty_cash_guard_balance() OWNER TO postgres;

--
-- Name: petty_cash_protect_money(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.petty_cash_protect_money() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if new.amount is distinct from old.amount
     or new.type is distinct from old.type
     or new.account_id is distinct from old.account_id
     or new.receipt_id is distinct from old.receipt_id
     or new.project_id is distinct from old.project_id
     or new.description is distinct from old.description
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.reverses_transaction_id is distinct from old.reverses_transaction_id
     or new.reversal_reason is distinct from old.reversal_reason then
    raise exception 'A petty cash posting cannot be edited. Reverse it and post a correcting entry.'
      using errcode = 'P0001', hint = 'posting_immutable';
  end if;

  -- The void marker is written once and never taken back.
  if old.reversed_at is not null
     and (new.reversed_at is distinct from old.reversed_at
          or new.reversed_by_transaction_id is distinct from old.reversed_by_transaction_id) then
    raise exception 'This posting has already been reversed. A reversal cannot be undone or repeated.'
      using errcode = 'P0001', hint = 'already_reversed';
  end if;

  -- The balance has already moved for an accepted posting, so its status is final.
  if old.status = 'accepted' and new.status is distinct from old.status then
    raise exception 'An accepted petty cash posting cannot change status. Reverse it instead.'
      using errcode = 'P0001', hint = 'posting_accepted';
  end if;

  return new;
end $$;


ALTER FUNCTION public.petty_cash_protect_money() OWNER TO postgres;

--
-- Name: platform_admin_ack_incident(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_ack_incident(p_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare r public.platform_admin_role; previous jsonb;
begin
 r:=private.require_platform_admin('write_company');
 if length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'Provide a meaningful response note'; end if;
 select to_jsonb(i) into strict previous from public.ops_incidents i where id=p_id for update;
 if previous->>'resolved_at' is not null then raise exception 'Incident already recovered'; end if;
 update public.ops_incidents set acknowledged_by=auth.uid(),acknowledged_at=now(),acknowledgment=btrim(p_reason) where id=p_id;
 perform private.platform_admin_audit(r,'acknowledge_incident','ops_incident',p_id,p_reason,previous,jsonb_build_object('acknowledged_by',auth.uid()));
end $$;


ALTER FUNCTION public.platform_admin_ack_incident(p_id uuid, p_reason text) OWNER TO postgres;

--
-- Name: platform_admin_add_evidence(text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_add_evidence(p_kind text, p_result text, p_summary text, p_url text, p_tested_at timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare r public.platform_admin_role; item uuid;
begin
 r:=private.require_platform_admin('write_company');
 if p_tested_at>now() or p_tested_at is null then raise exception 'Test time must be in the past'; end if;
 insert into public.ops_recovery_evidence(kind,result,summary,evidence_url,tested_at,recorded_by) values(p_kind,p_result,btrim(p_summary),p_url,p_tested_at,auth.uid()) returning id into item;
 perform private.platform_admin_audit(r,'record_recovery_evidence','ops_evidence',item,p_summary,'{}',jsonb_build_object('kind',p_kind,'result',p_result,'url',p_url));
 return item;
end $$;


ALTER FUNCTION public.platform_admin_add_evidence(p_kind text, p_result text, p_summary text, p_url text, p_tested_at timestamp with time zone) OWNER TO postgres;

--
-- Name: platform_admin_ai_ops(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_ai_ops(p_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_start timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 180)));
begin
  perform private.require_platform_admin('read');

  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'requests', (select count(*) from public.whatsapp_ai_interpretations i where i.created_at >= v_start),
      'estimatedCost', (select coalesce(sum(u.estimated_cost), 0) from public.whatsapp_ai_usage_daily u where u.usage_day >= v_start::date),
      'failures', (select count(*) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and (coalesce(i.failure_layer, 'none') <> 'none' or i.backend_outcome in ('provider_failed', 'rejected'))),
      'clarifications', (select count(*) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and i.backend_outcome = 'clarified'),
      'retrievalFailures', (select count(*) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and (i.failure_layer = 'retrieval' or i.retrieval_status = 'unavailable')),
      'toolFailures', (select count(*) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and (i.failure_layer in ('tool_schema', 'tool_execution', 'backend_validation', 'database') or i.tool_result_status = 'error')),
      'groundingFailures', (select count(*) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and i.failure_layer = 'grounding'),
      'successRate', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where i.backend_outcome in ('answered', 'drafted') and coalesce(i.failure_layer, 'none') = 'none') / count(*), 1) end from public.whatsapp_ai_interpretations i where i.created_at >= v_start),
      'p50LatencyMs', (select round(percentile_cont(0.50) within group (order by i.latency_ms)) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and i.latency_ms is not null),
      'p95LatencyMs', (select round(percentile_cont(0.95) within group (order by i.latency_ms)) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and i.latency_ms is not null)
    ),
    'intents', coalesce((select jsonb_agg(jsonb_build_object('intent', x.semantic_intent, 'count', x.count) order by x.count desc) from (select semantic_intent, count(*) from public.whatsapp_ai_interpretations where created_at >= v_start group by semantic_intent) x), '[]'::jsonb),
    'tools', coalesce((select jsonb_agg(jsonb_build_object('tool', coalesce(x.chosen_tool, 'none'), 'count', x.count) order by x.count desc) from (select chosen_tool, count(*) from public.whatsapp_ai_interpretations where created_at >= v_start group by chosen_tool) x), '[]'::jsonb),
    'models', coalesce((select jsonb_agg(jsonb_build_object('model', coalesce(x.model, 'unknown'), 'promptVersion', x.prompt_version, 'toolSchemaVersion', x.tool_schema_version, 'count', x.count) order by x.count desc) from (select model, prompt_version, tool_schema_version, count(*) from public.whatsapp_ai_interpretations where created_at >= v_start group by model, prompt_version, tool_schema_version) x), '[]'::jsonb),
    'failureLayers', coalesce((select jsonb_agg(jsonb_build_object('layer', coalesce(x.failure_layer, 'legacy_unknown'), 'count', x.count) order by x.count desc) from (select failure_layer, count(*) from public.whatsapp_ai_interpretations where created_at >= v_start and (coalesce(failure_layer, 'none') <> 'none' or backend_outcome in ('provider_failed', 'rejected')) group by failure_layer) x), '[]'::jsonb),
    'retrievalHealth', coalesce((select jsonb_agg(jsonb_build_object('status', coalesce(x.retrieval_status, 'legacy_unknown'), 'count', x.count) order by x.count desc) from (select retrieval_status, count(*) from public.whatsapp_ai_interpretations where created_at >= v_start group by retrieval_status) x), '[]'::jsonb),
    'runtimeVersions', coalesce((select jsonb_agg(jsonb_build_object('version', coalesce(x.runtime_version, 'legacy_unknown'), 'count', x.count) order by x.count desc) from (select runtime_version, count(*) from public.whatsapp_ai_interpretations where created_at >= v_start group by runtime_version) x), '[]'::jsonb),
    'recentDiagnostics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'companyId', x.company_id, 'companyName', x.company_name,
        'outcome', x.backend_outcome, 'intent', x.semantic_intent,
        'tool', x.chosen_tool, 'failureLayer', coalesce(x.failure_layer, 'legacy_unknown'),
        'rejectionCode', x.rejection_code, 'providerFailureCode', x.provider_failure_code,
        'retrievalStatus', coalesce(x.retrieval_status, 'legacy_unknown'),
        'conversationState', coalesce(x.conversation_state, 'legacy_unknown'),
        'toolResultStatus', coalesce(x.tool_result_status, 'legacy_unknown'),
        'toolFailureCode', x.tool_failure_code, 'runtimeVersion', coalesce(x.runtime_version, 'legacy_unknown'),
        'model', x.model, 'promptVersion', x.prompt_version,
        'toolSchemaVersion', x.tool_schema_version, 'latencyMs', x.latency_ms,
        'createdAt', x.created_at
      ) order by x.created_at desc)
      from (
        select i.*, c.name as company_name
        from public.whatsapp_ai_interpretations i
        join public.companies c on c.id = i.company_id
        where i.created_at >= v_start
          and (
            coalesce(i.failure_layer, 'none') <> 'none'
            or i.backend_outcome in ('clarified', 'rejected', 'provider_failed', 'budget_blocked')
            or i.retrieval_status in ('partial', 'unavailable')
            or i.tool_result_status = 'error'
          )
        order by i.created_at desc
        limit 100
      ) x
    ), '[]'::jsonb),
    'companies', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name,
      'usedToday', coalesce((select sum(u.fallback_count) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day = timezone('utc', now())::date), 0),
      'dailyLimit', coalesce(c.ai_daily_request_limit, 30),
      'usedMonth', coalesce((select sum(u.fallback_count) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day >= date_trunc('month', timezone('utc', now())::date)::date), 0),
      'monthlyLimit', c.ai_monthly_request_limit,
      'estimatedCost', coalesce((select sum(u.estimated_cost) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day >= v_start::date), 0)
    ) order by c.name) from public.companies c), '[]'::jsonb)
  );
end $$;


ALTER FUNCTION public.platform_admin_ai_ops(p_days integer) OWNER TO postgres;

--
-- Name: platform_admin_audit_history(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_audit_history(p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
 perform private.require_platform_admin('read');
 return coalesce((select jsonb_agg(to_jsonb(a)) from(select * from public.platform_admin_audit_logs order by created_at desc,id desc offset greatest(0,least(p_offset,100000)) limit 50)a),'[]'::jsonb);
end $$;


ALTER FUNCTION public.platform_admin_audit_history(p_offset integer) OWNER TO postgres;

--
-- Name: platform_admin_billing(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_billing(p_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v_days integer := greatest(1, least(p_days, 730));
  v_start timestamptz := now() - make_interval(days => v_days);
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'asOf', now(),
    'days', v_days,
    'companies', jsonb_build_object(
      'total', (select count(*)::int from public.companies),
      'active', (select count(*)::int from public.companies c
                 left join public.company_platform_controls pc on pc.company_id = c.id
                 where coalesce(pc.platform_status, 'active') = 'active'),
      'trialing', (select count(*)::int from public.subscriptions where status = 'trialing'),
      'pastDue', (select count(*)::int from public.subscriptions where status = 'past_due'),
      'suspended', (select count(*)::int from public.subscriptions where status = 'suspended'),
      'cancelled', (select count(*)::int from public.subscriptions where status = 'cancelled')
    ),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('plan', plan, 'count', count))
                       from (select plan, count(*) as count from public.subscriptions
                             where status <> 'cancelled' group by plan order by plan) s), '[]'::jsonb),
    'invoices', jsonb_build_object(
      'open', (select count(*)::int from public.subscription_invoices where status = 'open'),
      'paid', (select count(*)::int from public.subscription_invoices where status = 'paid'),
      'failed', (select count(*)::int from public.subscription_invoices where status = 'failed'),
      'void', (select count(*)::int from public.subscription_invoices where status = 'void'),
      'collectedTzs', coalesce((select sum(amount_tzs) from public.subscription_invoices
                                where status = 'paid' and created_at >= v_start), 0),
      'openTzs', coalesce((select sum(amount_tzs) from public.subscription_invoices
                           where status in ('open', 'failed') and created_at >= v_start), 0)
    ),
    'recentInvoices', coalesce((select jsonb_agg(jsonb_build_object(
                                  'id', i.id, 'companyId', i.company_id,
                                  'companyName', c.name, 'plan', i.plan,
                                  'amountTzs', i.amount_tzs, 'status', i.status,
                                  'createdAt', i.created_at))
                                from public.subscription_invoices i
                                join public.companies c on c.id = i.company_id
                                order by i.created_at desc limit 20), '[]'::jsonb)
  );
end;
$$;


ALTER FUNCTION public.platform_admin_billing(p_days integer) OWNER TO postgres;

--
-- Name: platform_admin_company_detail(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_company_detail(p_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  perform private.require_platform_admin('read');
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'company not found' using errcode = 'P0002';
  end if;
  return (
    select jsonb_build_object(
      'id', c.id, 'name', c.name, 'sector', c.sector, 'hqLocation', c.hq_location,
      'currency', c.currency, 'createdAt', c.created_at,
      'memberCount', (select count(*) from public.company_members m where m.company_id = c.id and m.deactivated_at is null),
      'ownerCount', (select count(*) from public.company_members m where m.company_id = c.id and m.role = 'owner' and m.deactivated_at is null),
      'whatsappIdentities', (select count(*) from public.whatsapp_identities i where i.company_id = c.id and i.revoked_at is null),
      'lastActivity', greatest(c.created_at, coalesce((select max(m.created_at) from public.whatsapp_messages m where m.company_id = c.id), c.created_at)),
      'platformStatus', coalesce(pc.platform_status, 'active'),
      'whatsappAiEnabled', coalesce(pc.whatsapp_ai_enabled, true),
      'ai', jsonb_build_object(
        'today', coalesce((select sum(u.fallback_count) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day = timezone('utc', now())::date), 0),
        'month', coalesce((select sum(u.fallback_count) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day >= date_trunc('month', timezone('utc', now())::date)::date), 0),
        'dailyLimit', coalesce(c.ai_daily_request_limit, 30),
        'monthlyLimit', c.ai_monthly_request_limit,
        'charLimit', coalesce(c.ai_daily_char_limit, 36000),
        'costLimit', coalesce(c.ai_daily_cost_limit, 0.150000)
      ),
      'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.profile_id, 'role', m.role, 'joinedAt', m.joined_at, 'deactivatedAt', m.deactivated_at) order by m.joined_at) from public.company_members m where m.company_id = c.id), '[]'::jsonb),
      'failures', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', 'whatsapp_message', 'status', m.status, 'code', left(coalesce(i.provider_failure_code, 'worker_failed'), 120), 'createdAt', m.created_at) order by m.created_at desc) from public.whatsapp_messages m left join public.whatsapp_ai_interpretations i on i.wa_message_id = m.wa_message_id where m.company_id = c.id and m.status = 'failed' limit 20), '[]'::jsonb)
    )
    from public.companies c left join public.company_platform_controls pc on pc.company_id = c.id
    where c.id = p_company_id
  );
end $$;


ALTER FUNCTION public.platform_admin_company_detail(p_company_id uuid) OWNER TO postgres;

--
-- Name: platform_admin_company_finance(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_company_finance(p_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  c public.companies;
begin
  r := private.require_platform_admin('read');
  select co.id, co.name, co.hq_location, co.sector, co.currency, co.created_at
    into c.id, c.name, c.hq_location, c.sector, c.currency, c.created_at
    from public.companies co
   where co.id = p_company_id;
  if c.id is null then
    raise exception 'Company not found' using errcode = 'P0001', hint = 'company_not_found';
  end if;
  return jsonb_build_object(
    'company', jsonb_build_object(
      'id', c.id, 'name', c.name, 'hqLocation', c.hq_location,
      'sector', c.sector, 'currency', c.currency, 'createdAt', c.created_at,
      'platformStatus', (select coalesce(pc.platform_status, 'active') from public.company_platform_controls pc where pc.company_id = c.id),
      'whatsappAiEnabled', (select coalesce(pc.whatsapp_ai_enabled, true) from public.company_platform_controls pc where pc.company_id = c.id)
    ),
    'subscription', (select jsonb_build_object(
                        'plan', s.plan, 'status', s.status,
                        'graceUntil', s.grace_until, 'currentPeriodEnd', s.current_period_end,
                        'startedAt', s.created_at, 'updatedAt', s.updated_at)
                      from public.subscriptions s where s.company_id = c.id),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', i.id, 'plan', i.plan, 'amountTzs', i.amount_tzs,
                             'status', i.status, 'periodStart', i.period_start,
                             'periodEnd', i.period_end, 'createdAt', i.created_at,
                             'paidAt', i.paid_at))
                           from (select * from public.subscription_invoices
                                 where company_id = c.id order by created_at desc) i), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', e.id, 'category', e.category, 'description', e.description,
                             'amountTzs', e.amount_tzs, 'occurredOn', e.occurred_on,
                             'createdAt', e.created_at))
                           from (select * from public.platform_expenses
                                 where company_id = c.id order by occurred_on desc, created_at desc limit 50) e), '[]'::jsonb),
    'aiUsage', jsonb_build_object(
      'days', (select count(*)::int from public.whatsapp_ai_usage_daily where company_id = c.id and usage_day >= current_date - 30),
      'requests30d', (select coalesce(sum(fallback_count), 0)::int from public.whatsapp_ai_usage_daily where company_id = c.id and usage_day >= current_date - 30),
      'costUsd30d', (select coalesce(sum(estimated_cost), 0) from public.whatsapp_ai_usage_daily where company_id = c.id and usage_day >= current_date - 30)
    )
  );
end;
$$;


ALTER FUNCTION public.platform_admin_company_finance(p_company_id uuid) OWNER TO postgres;

--
-- Name: platform_admin_company_health(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_company_health(p_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'receipts', jsonb_build_object(
      'total', (select count(*)::int from public.receipts where company_id = p_company_id),
      'confirmed', (select count(*)::int from public.receipts where company_id = p_company_id and status = 'confirmed'),
      'pendingReview', (select count(*)::int from public.receipts where company_id = p_company_id and status = 'pending_review'),
      'duplicate', (select count(*)::int from public.receipts where company_id = p_company_id and status = 'duplicate'),
      'rejected', (select count(*)::int from public.receipts where company_id = p_company_id and status in ('rejected', 'error'))
    ),
    'invoices', jsonb_build_object(
      'count', (select count(*)::int from public.invoices i join public.projects p on p.id = i.project_id where p.company_id = p_company_id),
      'totalTzs', round(coalesce((select sum(i.total_amount) from public.invoices i join public.projects p on p.id = i.project_id where p.company_id = p_company_id), 0), 2)
    ),
    'projects', (select count(*)::int from public.projects where company_id = p_company_id and status = 'active'),
    'members', (select count(*)::int from public.company_members where company_id = p_company_id and deactivated_at is null),
    'whatsappIdentities', (select count(*)::int from public.whatsapp_identities where company_id = p_company_id and revoked_at is null and opted_out_at is null),
    'dailyRecords30d', (select count(*)::int from public.daily_records where company_id = p_company_id and occurred_at >= now() - interval '30 days')
  );
end;
$$;


ALTER FUNCTION public.platform_admin_company_health(p_company_id uuid) OWNER TO postgres;

--
-- Name: platform_admin_company_subscription(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_company_subscription(p_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v jsonb;
begin
  r := private.require_platform_admin('read');
  select jsonb_build_object(
    'companyId', c.id,
    'companyName', c.name,
    'hasSubscription', (s.id is not null),
    'plan', s.plan,
    'cycle', s.cycle,
    'status', s.status,
    'trialEndsAt', s.trial_ends_at,
    'trialDaysLeft', case when s.trial_ends_at is null then null
                          else round(extract(epoch from (s.trial_ends_at - now())) / 86400.0, 2) end,
    'graceUntil', s.grace_until,
    'currentPeriodEnd', s.current_period_end,
    'cancelledAt', s.cancelled_at
  )
  into v
  from public.companies c
  left join public.subscriptions s on s.company_id = c.id
  where c.id = p_company_id;
  if v is null then
    raise exception 'Company not found' using errcode = 'P0002', hint = 'company_not_found';
  end if;
  return v;
end;
$$;


ALTER FUNCTION public.platform_admin_company_subscription(p_company_id uuid) OWNER TO postgres;

--
-- Name: platform_admin_deactivate_whatsapp_identity(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_deactivate_whatsapp_identity(p_identity_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v_before jsonb;
begin
  r := private.require_platform_admin('write_company');
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  select jsonb_build_object('revoked_at', revoked_at, 'company_id', company_id) into v_before
    from public.whatsapp_identities where id = p_identity_id;
  if v_before is null then
    raise exception 'Identity not found' using errcode = 'P0001', hint = 'identity_not_found';
  end if;
  update public.whatsapp_identities
     set revoked_at = clock_timestamp(), updated_at = clock_timestamp()
   where id = p_identity_id and revoked_at is null;
  perform private.platform_admin_audit(r, 'deactivate_whatsapp_identity', 'whatsapp_identity', p_identity_id,
    p_reason, v_before, jsonb_build_object('revoked_at', clock_timestamp()));
end;
$$;


ALTER FUNCTION public.platform_admin_deactivate_whatsapp_identity(p_identity_id uuid, p_reason text) OWNER TO postgres;

--
-- Name: platform_admin_ensure_subscription(uuid, text, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_ensure_subscription(p_company_id uuid, p_plan text, p_trial_days integer, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v_plan text := coalesce(nullif(btrim(coalesce(p_plan, '')), ''), 'ndogo');
  v_days integer := greatest(0, least(coalesce(p_trial_days, 0), 365));
  v_existed boolean;
  v_after jsonb;
begin
  r := private.require_platform_admin('write_company');
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  if not exists (select 1 from public.billing_plans where code = v_plan) then
    raise exception 'Unknown plan' using errcode = 'P0001', hint = 'unknown_plan';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Company not found' using errcode = 'P0002', hint = 'company_not_found';
  end if;
  select exists(select 1 from public.subscriptions where company_id = p_company_id) into v_existed;
  insert into public.subscriptions (
    company_id, plan, cycle, status, trial_ends_at,
    current_period_start, current_period_end, grace_until
  )
  values (
    p_company_id, v_plan, 'monthly',
    case when v_days > 0 then 'trialing' else 'active' end,
    case when v_days > 0 then clock_timestamp() + make_interval(days => v_days) else null end,
    current_date, (current_date + interval '1 month')::date, null
  )
  on conflict (company_id) do nothing;
  select jsonb_build_object('plan', plan, 'status', status, 'trialEndsAt', trial_ends_at) into v_after
    from public.subscriptions where company_id = p_company_id;
  perform private.platform_admin_audit(r, 'ensure_subscription', 'company', p_company_id,
    p_reason, jsonb_build_object('existed', v_existed), v_after);
  return v_after || jsonb_build_object('created', not v_existed);
end;
$$;


ALTER FUNCTION public.platform_admin_ensure_subscription(p_company_id uuid, p_plan text, p_trial_days integer, p_reason text) OWNER TO postgres;

--
-- Name: platform_admin_expense_overview(date, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_expense_overview(p_from date, p_to date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v_from date := coalesce(p_from, current_date - 90);
  v_to date := coalesce(p_to, current_date);
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'platformLedgerTzs', coalesce((select sum(amount_tzs) from public.platform_expenses
                                   where occurred_on between v_from and v_to), 0),
    'byCategory', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'count', count, 'totalTzs', totalTzs))
                            from (select category, count(*)::int as count, sum(amount_tzs) as totalTzs
                                  from public.platform_expenses
                                  where occurred_on between v_from and v_to
                                  group by category order by totalTzs desc) s), '[]'::jsonb),
    'byCompany', coalesce((select jsonb_agg(jsonb_build_object('companyId', company_id, 'companyName', c.name, 'totalTzs', totalTzs))
                           from (select e.company_id, sum(e.amount_tzs) as totalTzs
                                 from public.platform_expenses e
                                 where e.company_id is not null
                                   and e.occurred_on between v_from and v_to
                                 group by e.company_id order by totalTzs desc limit 10) s
                           left join public.companies c on c.id = s.company_id), '[]'::jsonb),
    'aiCostUsd', coalesce((select sum(estimated_cost) from public.whatsapp_ai_usage_daily
                           where usage_day between v_from and v_to), 0)
  );
end;
$$;


ALTER FUNCTION public.platform_admin_expense_overview(p_from date, p_to date) OWNER TO postgres;

--
-- Name: platform_admin_governance(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_governance() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare r public.platform_admin_role;
begin
 r:=private.require_platform_admin('read');
 return jsonb_build_object(
  'policy',(select jsonb_build_object('version',version,'publishedAt',published_at,'accepted',(select count(*) from public.legal_acceptances a where a.version=v.version),'profiles',(select count(*) from public.profiles where deactivated_at is null)) from public.legal_policy_versions v where active),
  'roles',(select jsonb_agg(to_jsonb(a)) from(select role,count(*) as count from public.platform_admins where active group by role)a),
  'requests',case when r in ('super_admin','operations','support') then coalesce((select jsonb_agg(to_jsonb(p)) from(select * from public.ops_privacy_requests order by created_at desc limit 100)p),'[]'::jsonb) else '[]'::jsonb end
 );
end $$;


ALTER FUNCTION public.platform_admin_governance() OWNER TO postgres;

--
-- Name: platform_admin_list_companies(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_list_companies(p_search text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  perform private.require_platform_admin('read');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'sector', c.sector, 'createdAt', c.created_at,
      'memberCount', (select count(*) from public.company_members m where m.company_id = c.id and m.deactivated_at is null),
      'whatsappIdentities', (select count(*) from public.whatsapp_identities i where i.company_id = c.id and i.revoked_at is null),
      'lastActivity', greatest(c.created_at, coalesce((select max(m.created_at) from public.whatsapp_messages m where m.company_id = c.id), c.created_at), coalesce((select max(i.created_at) from public.whatsapp_ai_interpretations i where i.company_id = c.id), c.created_at)),
      'platformStatus', coalesce(pc.platform_status, 'active'),
      'ai', jsonb_build_object(
        'today', coalesce((select sum(u.fallback_count) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day = timezone('utc', now())::date), 0),
        'month', coalesce((select sum(u.fallback_count) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day >= date_trunc('month', timezone('utc', now())::date)::date), 0),
        'dailyLimit', coalesce(c.ai_daily_request_limit, 30),
        'monthlyLimit', c.ai_monthly_request_limit,
        'charLimit', coalesce(c.ai_daily_char_limit, 36000),
        'costLimit', coalesce(c.ai_daily_cost_limit, 0.150000)
      )
    ) order by c.created_at desc)
    from public.companies c
    left join public.company_platform_controls pc on pc.company_id = c.id
    where p_search is null or btrim(p_search) = '' or c.name ilike '%' || left(btrim(p_search), 80) || '%'
  ), '[]'::jsonb);
end $$;


ALTER FUNCTION public.platform_admin_list_companies(p_search text) OWNER TO postgres;

--
-- Name: platform_admin_list_expenses(integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_list_expenses(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', e.id, 'companyId', e.company_id, 'companyName', c.name,
                        'category', e.category, 'description', e.description,
                        'amountTzs', e.amount_tzs, 'occurredOn', e.occurred_on,
                        'createdAt', e.created_at, 'recordedBy', e.recorded_by))
                      from public.platform_expenses e
                      left join public.companies c on c.id = e.company_id
                      order by e.occurred_on desc, e.created_at desc
                      limit greatest(1, least(coalesce(p_limit, 100), 500))
                      offset greatest(0, coalesce(p_offset, 0))), '[]'::jsonb),
    'total', (select count(*)::int from public.platform_expenses)
  );
end;
$$;


ALTER FUNCTION public.platform_admin_list_expenses(p_limit integer, p_offset integer) OWNER TO postgres;

--
-- Name: platform_admin_mark_invoice_paid(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_mark_invoice_paid(p_invoice_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v_before jsonb;
  v_rows bigint;
begin
  r := private.require_platform_admin('read');
  if r not in ('super_admin', 'finance', 'operations') then
    raise exception 'Not permitted for money operations' using errcode = 'P0001', hint = 'no_permission';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  select jsonb_build_object('status', status, 'company_id', company_id) into v_before
    from public.subscription_invoices where id = p_invoice_id;
  if v_before is null then
    raise exception 'Invoice not found' using errcode = 'P0001', hint = 'invoice_not_found';
  end if;
  update public.subscription_invoices
     set status = 'paid',
         paid_at = clock_timestamp(),
         paid_manually_by = (select id from public.profiles where id = auth.uid())
   where id = p_invoice_id and status in ('open', 'failed');
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Only open or failed invoices may be marked paid' using errcode = 'P0001', hint = 'bad_transition';
  end if;
  perform private.platform_admin_audit(r, 'mark_invoice_paid', 'subscription_invoice', p_invoice_id,
    p_reason, v_before, jsonb_build_object('status', 'paid', 'admin_user_id', auth.uid()));
end;
$$;


ALTER FUNCTION public.platform_admin_mark_invoice_paid(p_invoice_id uuid, p_reason text) OWNER TO postgres;

--
-- Name: platform_admin_marketplace(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_marketplace(p_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_days  integer := greatest(1, least(coalesce(p_days, 30), 730));
  v_start timestamptz := now() - make_interval(days => v_days);
begin
  perform private.require_platform_admin('read');
  return jsonb_build_object(
    'days', v_days,
    'metrics', jsonb_build_object(
      'optedInCompanies', (select count(*)::int from public.company_marketplace_settings where opt_in),
      'totalCompanies',   (select count(*)::int from public.companies),
      'indexedProducts',  (select count(*)::int from public.marketplace_product_index),
      'searches',         (select count(*)::int from public.marketplace_pending_selections where created_at >= v_start),
      'searchesNoResult', (select count(*)::int from public.marketplace_pending_selections
                            where created_at >= v_start and jsonb_array_length(options->'options') = 0),
      'ordersPlaced',     (select count(*)::int from public.marketplace_order_requests where placed_at >= v_start),
      'ordersAccepted',   (select count(*)::int from public.marketplace_order_requests where accepted_at >= v_start),
      'ordersRejected',   (select count(*)::int from public.marketplace_order_requests where rejected_at >= v_start),
      'ordersDelivered',  (select count(*)::int from public.marketplace_order_requests where delivered_at >= v_start),
      'fuzzyOrders',      (select count(*)::int from public.marketplace_order_requests
                            where placed_at >= v_start and match_basis = 'fuzzy_name'),
      'unlinkedOrders',   (select count(*)::int from public.marketplace_order_requests
                            where placed_at >= v_start and shop_order_id is null),
      -- Queued but unsent is the number that matters until the Meta template
      -- is approved: every marketplace notification is proactive and blocked
      -- on it. A climbing figure is the template, not a bug.
      'notifyQueued',     (select count(*)::int from public.whatsapp_notification_deliveries
                            where notification_kind like 'marketplace\_%' and status = 'queued'),
      'notifySent',       (select count(*)::int from public.whatsapp_notification_deliveries
                            where notification_kind like 'marketplace\_%' and status = 'sent'
                              and created_at >= v_start),
      'notifyFailed',     (select count(*)::int from public.whatsapp_notification_deliveries
                            where notification_kind like 'marketplace\_%' and status in ('failed','unknown')
                              and created_at >= v_start)
    ),
    'matchBasis', coalesce((select jsonb_agg(jsonb_build_object('basis', x.match_basis, 'count', x.count)
                                             order by x.count desc)
                            from (select match_basis, count(*) as count
                                  from public.marketplace_order_requests
                                  where placed_at >= v_start group by match_basis) x), '[]'::jsonb),
    'companies', coalesce((select jsonb_agg(jsonb_build_object(
                             'companyId', c.id, 'companyName', c.name,
                             'optIn', coalesce(s.opt_in, false),
                             'sharePrices', coalesce(s.share_prices, false),
                             'maxStockAgeDays', s.max_stock_age_days,
                             'indexedProducts', (select count(*)::int from public.marketplace_product_index i
                                                  where i.company_id = c.id),
                             'ordersSold', (select count(*)::int from public.marketplace_order_requests o
                                             where o.supplier_company_id = c.id and o.placed_at >= v_start),
                             'ordersBought', (select count(*)::int from public.marketplace_order_requests o
                                               where o.buyer_company_id = c.id and o.placed_at >= v_start),
                             'optedInAt', s.opted_in_at) order by c.name)
                          from public.companies c
                          left join public.company_marketplace_settings s on s.company_id = c.id), '[]'::jsonb),
    'recentOrders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'productName', r.product_name, 'quantity', r.quantity, 'unit', r.unit,
               'status', r.status, 'matchBasis', r.match_basis, 'matchConfidence', r.match_confidence,
               'buyerName', r.buyer_name, 'supplierName', r.supplier_name,
               'stockAgeDays', r.stock_age_days, 'placedAt', r.placed_at))
      from (
        select o.id, o.product_name, o.quantity, o.unit, o.status, o.match_basis,
               o.match_confidence, b.name as buyer_name, s.name as supplier_name,
               extract(day from (o.placed_at - o.stock_counted_at))::int as stock_age_days,
               o.placed_at
        from public.marketplace_order_requests o
        join public.companies b on b.id = o.buyer_company_id
        join public.companies s on s.id = o.supplier_company_id
        where o.placed_at >= v_start
        order by o.placed_at desc
        limit 50
      ) r), '[]'::jsonb)
  );
end $$;


ALTER FUNCTION public.platform_admin_marketplace(p_days integer) OWNER TO postgres;

--
-- Name: platform_admin_me(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_me() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_role public.platform_admin_role;
begin
  select private.platform_admin_role() into v_role;
  return jsonb_build_object('role', v_role);
end $$;


ALTER FUNCTION public.platform_admin_me() OWNER TO postgres;

--
-- Name: platform_admin_overview(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_overview(p_days integer DEFAULT 14) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_role public.platform_admin_role;
  v_start date := (timezone('utc', now()))::date - greatest(1, least(coalesce(p_days, 14), 90)) + 1;
  v_today date := (timezone('utc', now()))::date;
begin
  v_role := private.require_platform_admin('read');
  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'totalCompanies', (select count(*) from public.companies),
      'activeCompanies', (select count(*) from public.companies c left join public.company_platform_controls pc on pc.company_id = c.id where coalesce(pc.platform_status, 'active') = 'active'),
      'totalMembers', (select count(*) from public.company_members m where m.deactivated_at is null),
      'activeWhatsappIdentities', (select count(*) from public.whatsapp_identities i where i.revoked_at is null),
      'messagesToday', (select count(*) from public.whatsapp_messages m where m.created_at >= v_today),
      'aiRequestsToday', (select coalesce(sum(u.fallback_count), 0) from public.whatsapp_ai_usage_daily u where u.usage_day = v_today),
      'aiFailuresToday', (select count(*) from public.whatsapp_ai_interpretations i where i.created_at >= v_today and (i.backend_outcome = 'provider_failed' or i.provider_failure_code is not null)),
      'aiP50LatencyMs', (select round(percentile_cont(0.50) within group (order by i.latency_ms)) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and i.latency_ms is not null),
      'aiP95LatencyMs', (select round(percentile_cont(0.95) within group (order by i.latency_ms)) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and i.latency_ms is not null),
      'companiesAtAiLimit', (select count(*) from public.whatsapp_ai_usage_daily u join public.companies c on c.id = u.company_id where u.usage_day = v_today and (u.blocked_count > 0 or u.fallback_count >= coalesce(c.ai_daily_request_limit, 30) or u.input_chars >= coalesce(c.ai_daily_char_limit, 36000) or u.estimated_cost >= coalesce(c.ai_daily_cost_limit, 0.150000))),
      'estimatedCostToday', (select coalesce(sum(u.estimated_cost), 0) from public.whatsapp_ai_usage_daily u where u.usage_day = v_today),
      'estimatedCostMonth', (select coalesce(sum(u.estimated_cost), 0) from public.whatsapp_ai_usage_daily u where u.usage_day >= date_trunc('month', v_today)::date),
      'stalePendingMessages', (select count(*) from public.whatsapp_messages m where m.status in ('pending', 'processing') and m.created_at < now() - interval '15 minutes'),
      'failedMessagesToday', (select count(*) from public.whatsapp_messages m where m.status = 'failed' and m.created_at >= v_today)
    ),
    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'severity', x.severity, 'title', x.title, 'detail', x.detail, 'createdAt', x.created_at) order by x.created_at desc)
      from (
        select m.id::text, 'critical' as severity, 'WhatsApp message failed' as title,
               'A message failed in the worker pipeline.' as detail, m.created_at
        from public.whatsapp_messages m
        where m.status = 'failed'
        order by m.created_at desc limit 6
      ) x
    ), '[]'::jsonb),
    'trends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', to_char(g.day, 'YYYY-MM-DD'),
        'messages', (select count(*) from public.whatsapp_messages m where m.created_at >= g.day and m.created_at < g.day + interval '1 day'),
        'aiRequests', (select coalesce(sum(u.fallback_count), 0) from public.whatsapp_ai_usage_daily u where u.usage_day = g.day),
        'aiFailures', (select count(*) from public.whatsapp_ai_interpretations i where i.created_at >= g.day and i.created_at < g.day + interval '1 day' and (i.backend_outcome = 'provider_failed' or i.provider_failure_code is not null)),
        'cost', (select coalesce(sum(u.estimated_cost), 0) from public.whatsapp_ai_usage_daily u where u.usage_day = g.day)
      ) order by g.day)
      from generate_series(v_start, v_today, interval '1 day') as g(day)
    ), '[]'::jsonb)
  );
end $$;


ALTER FUNCTION public.platform_admin_overview(p_days integer) OWNER TO postgres;

--
-- Name: platform_admin_performance(integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_performance(p_days integer DEFAULT 180, p_limit integer DEFAULT 100) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v_days integer := greatest(30, least(coalesce(p_days, 180), 730));
  v_start timestamptz := now() - make_interval(days => v_days);
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'days', v_days,
    'asOf', now(),
    'shops', coalesce((select jsonb_agg(to_jsonb(x))
                       from (
                         with base as (
                           select
                             c.id as company_id, c.name, c.hq_location, c.sector, c.created_at,
                             coalesce(s.plan, 'none') as plan,
                             coalesce(s.status, 'none') as subscription_status,
                             (select count(*)::int from public.whatsapp_messages w
                              where w.company_id = c.id and w.created_at >= v_start) as messages,
                             (select count(distinct w.created_at::date) from public.whatsapp_messages w
                              where w.company_id = c.id and w.created_at >= v_start) as wa_days,
                             (select count(distinct d.occurred_at::date) from public.daily_records d
                              where d.company_id = c.id and d.status = 'confirmed' and d.occurred_at >= v_start) as record_days,
                             (select count(distinct rc.created_at::date) from public.receipts rc
                              where rc.company_id = c.id and rc.created_at >= v_start) as receipt_days,
                             (select coalesce(sum(d.amount), 0) from public.daily_records d
                              where d.company_id = c.id and d.status = 'confirmed' and d.kind = 'sale' and d.occurred_at >= v_start) as sales_tzs,
                             (select count(*)::int from public.daily_records d
                              where d.company_id = c.id and d.status = 'confirmed' and d.kind = 'sale' and d.occurred_at >= v_start) as sales_count,
                             (select coalesce(sum(d.amount), 0) from public.daily_records d
                              where d.company_id = c.id and d.status = 'confirmed' and d.kind = 'expense' and d.occurred_at >= v_start) as expenses_tzs,
                             (select coalesce(sum(d.amount), 0) from public.daily_records d
                              where d.company_id = c.id and d.status = 'confirmed' and d.kind = 'debt_issued' and d.occurred_at >= v_start) as debt_tzs,
                             (select coalesce(sum(d.amount), 0) from public.daily_records d
                              where d.company_id = c.id and d.status = 'confirmed' and d.kind = 'customer_payment' and d.occurred_at >= v_start) as repaid_tzs,
                             (select count(*)::int from public.receipts rc
                              where rc.company_id = c.id and rc.status = 'confirmed' and rc.created_at >= v_start) as receipts_confirmed,
                             (select count(*)::int from public.invoices i
                              join public.projects p on p.id = i.project_id
                              where p.company_id = c.id and i.created_at >= v_start) as invoices_count,
                             (select coalesce(sum(u.estimated_cost), 0) from public.whatsapp_ai_usage_daily u
                              where u.company_id = c.id and u.usage_day >= current_date - v_days) as ai_cost_usd
                           from public.companies c
                           left join public.subscriptions s on s.company_id = c.id
                           left join public.company_platform_controls pc on pc.company_id = c.id
                           where coalesce(pc.platform_status, 'active') = 'active'
                         )
                         select
                           company_id as "companyId", name as "companyName", hq_location as "hqLocation",
                           sector, created_at as "createdAt", plan, subscription_status as "subscriptionStatus",
                           messages, wa_days as "waDays", record_days as "recordDays", receipt_days as "receiptDays",
                           greatest(wa_days, record_days, receipt_days) as "activeDays",
                           sales_tzs as "salesTzs", sales_count as "salesCount", expenses_tzs as "expensesTzs",
                           debt_tzs as "debtTzs", repaid_tzs as "repaidTzs",
                           receipts_confirmed as "receiptsConfirmed", invoices_count as "invoicesCount",
                           ai_cost_usd as "aiCostUsd",
                           round(case when debt_tzs > 0 then (repaid_tzs * 100.0 / debt_tzs) else 100 end, 1) as "repaymentPct",
                           round((greatest(wa_days, record_days, receipt_days) * 100.0) / v_days, 1) as "consistencyPct",
                           (select count(*)::int from public.projects p where p.company_id = x.company_id and p.status = 'active') as "activeProjects",
                           round((
                             0.25 * least((greatest(wa_days, record_days, receipt_days) * 1.0) / v_days, 1) +
                             0.25 * least((sales_tzs * 1.0) / (v_days * 100000), 1) +
                             0.25 * (case when debt_tzs > 0 then (repaid_tzs / debt_tzs) else 1 end) +
                             0.15 * least((messages * 1.0) / (v_days * 5), 1) +
                             0.10 * least(((now()::date - created_at::date) * 1.0) / 365, 1)
                           ) * 100, 1) as "score"
                         from base x
                         order by score desc
                         limit greatest(1, least(coalesce(p_limit, 100), 500))
                       ) x), '[]'::jsonb)
  );
end;
$$;


ALTER FUNCTION public.platform_admin_performance(p_days integer, p_limit integer) OWNER TO postgres;

--
-- Name: platform_admin_privacy_request(uuid, uuid, text, text, text, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_privacy_request(p_id uuid, p_profile uuid, p_kind text, p_status text, p_note text, p_due date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare r public.platform_admin_role; item uuid; old public.ops_privacy_requests;
begin
 r:=private.require_platform_admin('read');
 if r not in ('super_admin','operations','support') then raise exception 'Privacy operations access required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_note,''))) not between 10 and 1000 then raise exception 'Provide a meaningful case note'; end if;
 if p_id is null then
   if p_status <> 'received' then raise exception 'New requests start as received'; end if;
   insert into public.ops_privacy_requests(profile_id,kind,note,due_at,created_by) values(p_profile,p_kind,p_note,p_due,auth.uid()) returning id into item;
 else
   select * into strict old from public.ops_privacy_requests where id=p_id for update;
   if not ((old.status='received' and p_status='verified') or (old.status='verified' and p_status='in_progress') or (old.status='in_progress' and p_status='closed')) then raise exception 'Invalid privacy request transition'; end if;
   update public.ops_privacy_requests set status=p_status,note=p_note,updated_at=now() where id=p_id;
   item:=p_id;
 end if;
 perform private.platform_admin_audit(r,'privacy_request_'||p_status,'privacy_request',item,p_note,jsonb_build_object('status',old.status),jsonb_build_object('status',p_status));
 return item;
end $$;


ALTER FUNCTION public.platform_admin_privacy_request(p_id uuid, p_profile uuid, p_kind text, p_status text, p_note text, p_due date) OWNER TO postgres;

--
-- Name: platform_admin_record_expense(uuid, text, text, integer, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_record_expense(p_company_id uuid, p_category text, p_description text, p_amount_tzs integer, p_occurred_on date DEFAULT CURRENT_DATE) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v_id uuid;
begin
  r := private.require_platform_admin('read');
  if r not in ('super_admin', 'finance', 'operations') then
    raise exception 'Not permitted for money operations' using errcode = 'P0001', hint = 'no_permission';
  end if;
  if p_category not in ('storage', 'whatsapp_api', 'email_resend', 'edge_runtime',
                        'ai_override', 'snippe_fees', 'infrastructure', 'support',
                        'marketing', 'tax', 'other') then
    raise exception 'Unknown expense category' using errcode = 'P0001', hint = 'bad_category';
  end if;
  if p_amount_tzs is null or p_amount_tzs <= 0 then
    raise exception 'Amount must be positive' using errcode = 'P0001', hint = 'bad_amount';
  end if;
  insert into public.platform_expenses
    (company_id, category, description, amount_tzs, occurred_on, recorded_by)
  values
    (p_company_id, p_category, btrim(p_description), p_amount_tzs, coalesce(p_occurred_on, current_date),
     (select id from public.profiles where id = auth.uid()))
  returning id into v_id;
  perform private.platform_admin_audit(r, 'record_expense', 'platform_expense', v_id,
    p_description, '{}'::jsonb, jsonb_build_object(
      'company_id', p_company_id, 'category', p_category, 'amount_tzs', p_amount_tzs,
      'occurred_on', coalesce(p_occurred_on, current_date)
    ));
  return v_id;
end;
$$;


ALTER FUNCTION public.platform_admin_record_expense(p_company_id uuid, p_category text, p_description text, p_amount_tzs integer, p_occurred_on date) OWNER TO postgres;

--
-- Name: platform_admin_reliability(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_reliability() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
 perform private.require_platform_admin('read');
 return jsonb_build_object(
  'lastRun',(select to_jsonb(r) from public.ops_monitor_runs r order by checked_at desc limit 1),
  'incidents',coalesce((select jsonb_agg(to_jsonb(i)) from (select * from public.ops_incidents order by (resolved_at is null) desc,opened_at desc limit 100)i),'[]'::jsonb),
  'deliveries',coalesce((select jsonb_agg(to_jsonb(d)) from(select id,incident_id,event,status,attempts,last_error,sent_at,created_at from public.ops_alert_deliveries order by created_at desc limit 100)d),'[]'::jsonb),
  'evidence',coalesce((select jsonb_agg(to_jsonb(e)) from(select * from public.ops_recovery_evidence order by recorded_at desc limit 100)e),'[]'::jsonb),
  'schedule',(select jsonb_build_object('active',active,'schedule',schedule) from cron.job where jobname='risip-ops-watch' limit 1)
 );
end $$;


ALTER FUNCTION public.platform_admin_reliability() OWNER TO postgres;

--
-- Name: platform_admin_reset_company_ai_limits(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_reset_company_ai_limits(p_company_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_role public.platform_admin_role; v_before jsonb;
begin
  perform private.require_platform_admin('write_company');
  if nullif(btrim(p_reason), '') is null then raise exception 'reason is required' using errcode = '22023'; end if;
  select jsonb_build_object('dailyRequests', ai_daily_request_limit, 'dailyCharacters', ai_daily_char_limit, 'dailyCostUsd', ai_daily_cost_limit, 'monthlyRequests', ai_monthly_request_limit) into v_before from public.companies where id = p_company_id;
  if v_before is null then raise exception 'company not found' using errcode = 'P0002'; end if;
  update public.companies set ai_daily_request_limit = null, ai_daily_char_limit = null, ai_daily_cost_limit = null, ai_monthly_request_limit = null where id = p_company_id;
  perform private.platform_admin_audit(private.platform_admin_role(), 'reset_company_ai_limits', 'company', p_company_id, p_reason, v_before, jsonb_build_object('dailyRequests', 30, 'dailyCharacters', 36000, 'dailyCostUsd', 0.150000, 'monthlyRequests', null));
  return jsonb_build_object('reset', true);
end $$;


ALTER FUNCTION public.platform_admin_reset_company_ai_limits(p_company_id uuid, p_reason text) OWNER TO postgres;

--
-- Name: platform_admin_scanner_ops(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_scanner_ops() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                        'companyId', c.id, 'companyName', c.name,
                        'scannerInboxToken', c.scanner_inbox_token, 'scannerSenderEmail', c.scanner_sender_email,
                        'inboundCount', (select count(*)::int from public.receipts rc
                                         where rc.company_id = c.id and rc.source = 'inbound'),
                        'lastInboundAt', (select max(rc.created_at) from public.receipts rc
                                          where rc.company_id = c.id and rc.source = 'inbound')))
                      from public.companies c
                      where c.scanner_inbox_token is not null
                       or c.scanner_sender_email is not null
                      order by c.created_at desc limit 200), '[]'::jsonb)
  );
end;
$$;


ALTER FUNCTION public.platform_admin_scanner_ops() OWNER TO postgres;

--
-- Name: platform_admin_set_company_ai_limits(uuid, integer, integer, numeric, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_set_company_ai_limits(p_company_id uuid, p_daily_request_limit integer, p_daily_char_limit integer, p_daily_cost_limit numeric, p_monthly_request_limit integer, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_role public.platform_admin_role; v_before jsonb; v_after jsonb;
begin
  v_role := private.require_platform_admin('write_company');
  if nullif(btrim(p_reason), '') is null
     or p_daily_request_limit < 0 or p_daily_char_limit < 0
     or p_daily_cost_limit < 0 or p_monthly_request_limit < 0 then
    raise exception 'valid non-negative limits and reason are required' using errcode = '22023';
  end if;
  select jsonb_build_object('dailyRequests', ai_daily_request_limit, 'dailyCharacters', ai_daily_char_limit, 'dailyCostUsd', ai_daily_cost_limit, 'monthlyRequests', ai_monthly_request_limit) into v_before from public.companies where id = p_company_id;
  if v_before is null then raise exception 'company not found' using errcode = 'P0002'; end if;
  update public.companies set ai_daily_request_limit = p_daily_request_limit, ai_daily_char_limit = p_daily_char_limit, ai_daily_cost_limit = p_daily_cost_limit, ai_monthly_request_limit = p_monthly_request_limit where id = p_company_id;
  v_after := jsonb_build_object('dailyRequests', p_daily_request_limit, 'dailyCharacters', p_daily_char_limit, 'dailyCostUsd', p_daily_cost_limit, 'monthlyRequests', p_monthly_request_limit);
  perform private.platform_admin_audit(v_role, 'set_company_ai_limits', 'company', p_company_id, p_reason, v_before, v_after);
  return v_after;
end $$;


ALTER FUNCTION public.platform_admin_set_company_ai_limits(p_company_id uuid, p_daily_request_limit integer, p_daily_char_limit integer, p_daily_cost_limit numeric, p_monthly_request_limit integer, p_reason text) OWNER TO postgres;

--
-- Name: platform_admin_set_company_status(uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_set_company_status(p_company_id uuid, p_status text, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_role public.platform_admin_role; v_before jsonb; v_after jsonb;
begin
  v_role := private.require_platform_admin('write_company');
  if p_status not in ('active', 'suspended') or nullif(btrim(p_reason), '') is null then
    raise exception 'valid status and reason are required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then raise exception 'company not found' using errcode = 'P0002'; end if;
  select jsonb_build_object('platformStatus', coalesce(platform_status, 'active')) into v_before from public.company_platform_controls where company_id = p_company_id;
  v_before := coalesce(v_before, jsonb_build_object('platformStatus', 'active'));
  insert into public.company_platform_controls (company_id, platform_status, updated_by, updated_at)
  values (p_company_id, p_status, auth.uid(), now())
  on conflict (company_id) do update set platform_status = excluded.platform_status, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  v_after := jsonb_build_object('platformStatus', p_status);
  perform private.platform_admin_audit(v_role, 'set_company_status', 'company', p_company_id, p_reason, v_before, v_after);
  return v_after;
end $$;


ALTER FUNCTION public.platform_admin_set_company_status(p_company_id uuid, p_status text, p_reason text) OWNER TO postgres;

--
-- Name: platform_admin_set_marketplace_optin(uuid, boolean, boolean, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_set_marketplace_optin(p_company_id uuid, p_opt_in boolean, p_share_prices boolean, p_max_stock_age_days integer, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_role public.platform_admin_role; v_before jsonb; v_after jsonb;
begin
  v_role := private.require_platform_admin('write_company');
  if p_opt_in is null or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'opt_in and reason are required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'company not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object('optIn', opt_in, 'sharePrices', share_prices,
                            'maxStockAgeDays', max_stock_age_days)
    into v_before
  from public.company_marketplace_settings where company_id = p_company_id;
  v_before := coalesce(v_before, jsonb_build_object('optIn', false, 'sharePrices', false,
                                                    'maxStockAgeDays', 14));

  insert into public.company_marketplace_settings
    (company_id, opt_in, share_prices, max_stock_age_days, opted_in_at, updated_by, updated_at)
  values (p_company_id, p_opt_in, coalesce(p_share_prices, false),
          coalesce(p_max_stock_age_days, 14),
          case when p_opt_in then now() end, auth.uid(), now())
  on conflict (company_id) do update set
    opt_in             = excluded.opt_in,
    share_prices       = excluded.share_prices,
    max_stock_age_days = excluded.max_stock_age_days,
    opted_in_at        = case when excluded.opt_in and not public.company_marketplace_settings.opt_in
                              then now() else public.company_marketplace_settings.opted_in_at end,
    updated_by         = excluded.updated_by,
    updated_at         = excluded.updated_at;

  -- Opting in indexes the shop; opting out removes it from discovery at once.
  if p_opt_in then
    perform public.marketplace_reindex_company(p_company_id);
  else
    delete from public.marketplace_product_index where company_id = p_company_id;
  end if;

  v_after := jsonb_build_object('optIn', p_opt_in, 'sharePrices', coalesce(p_share_prices, false),
                                'maxStockAgeDays', coalesce(p_max_stock_age_days, 14));
  perform private.platform_admin_audit(v_role, 'set_marketplace_optin', 'company',
                                       p_company_id, p_reason, v_before, v_after);
  return v_after;
end $$;


ALTER FUNCTION public.platform_admin_set_marketplace_optin(p_company_id uuid, p_opt_in boolean, p_share_prices boolean, p_max_stock_age_days integer, p_reason text) OWNER TO postgres;

--
-- Name: platform_admin_set_subscription_grace(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_set_subscription_grace(p_company_id uuid, p_grace_days integer, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v_days integer := greatest(0, least(coalesce(p_grace_days, 0), 365));
  v_before jsonb;
  v_after jsonb;
begin
  r := private.require_platform_admin('write_company');
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  select jsonb_build_object('graceUntil', grace_until) into v_before
    from public.subscriptions where company_id = p_company_id;
  if v_before is null then
    raise exception 'Company has no subscription; create one first' using errcode = 'P0001', hint = 'no_subscription';
  end if;
  update public.subscriptions
     set grace_until = case when v_days = 0 then null else current_date + v_days end,
         updated_at = clock_timestamp()
   where company_id = p_company_id;
  select jsonb_build_object('graceUntil', grace_until) into v_after
    from public.subscriptions where company_id = p_company_id;
  perform private.platform_admin_audit(r, 'set_subscription_grace', 'company', p_company_id, p_reason, v_before, v_after);
  return v_after || jsonb_build_object('graceDays', v_days);
end;
$$;


ALTER FUNCTION public.platform_admin_set_subscription_grace(p_company_id uuid, p_grace_days integer, p_reason text) OWNER TO postgres;

--
-- Name: platform_admin_set_subscription_plan(uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_set_subscription_plan(p_company_id uuid, p_plan text, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v_before jsonb;
  v_after jsonb;
begin
  r := private.require_platform_admin('write_company');
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  if not exists (select 1 from public.billing_plans where code = p_plan) then
    raise exception 'Unknown plan' using errcode = 'P0001', hint = 'unknown_plan';
  end if;
  select jsonb_build_object('plan', plan) into v_before
    from public.subscriptions where company_id = p_company_id;
  if v_before is null then
    raise exception 'Company has no subscription' using errcode = 'P0001', hint = 'no_subscription';
  end if;
  update public.subscriptions
     set plan = p_plan, updated_at = clock_timestamp()
   where company_id = p_company_id;
  select jsonb_build_object('plan', plan) into v_after
    from public.subscriptions where company_id = p_company_id;
  perform private.platform_admin_audit(r, 'set_subscription_plan', 'company', p_company_id,
    p_reason, v_before, v_after);
end;
$$;


ALTER FUNCTION public.platform_admin_set_subscription_plan(p_company_id uuid, p_plan text, p_reason text) OWNER TO postgres;

--
-- Name: platform_admin_set_subscription_status(uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_set_subscription_status(p_company_id uuid, p_status text, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v_before jsonb;
  v_after jsonb;
begin
  r := private.require_platform_admin('write_company');
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  if p_status not in ('trialing', 'active', 'past_due', 'suspended', 'cancelled') then
    raise exception 'Invalid subscription status' using errcode = 'P0001', hint = 'bad_status';
  end if;
  select jsonb_build_object('status', status, 'grace_until', grace_until) into v_before
    from public.subscriptions where company_id = p_company_id;
  if v_before is null then
    raise exception 'Company has no subscription' using errcode = 'P0001', hint = 'no_subscription';
  end if;
  update public.subscriptions
     set status = p_status,
         grace_until = case when p_status = 'active' then null else grace_until end,
         updated_at = clock_timestamp()
   where company_id = p_company_id;
  select jsonb_build_object('status', status, 'grace_until', grace_until) into v_after
    from public.subscriptions where company_id = p_company_id;
  perform private.platform_admin_audit(r, 'set_subscription_status', 'company', p_company_id,
    p_reason, v_before, v_after);
end;
$$;


ALTER FUNCTION public.platform_admin_set_subscription_status(p_company_id uuid, p_status text, p_reason text) OWNER TO postgres;

--
-- Name: platform_admin_set_trial(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_set_trial(p_company_id uuid, p_days integer, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v_days integer := greatest(1, least(coalesce(p_days, 5), 365));
  v_before jsonb;
  v_after jsonb;
begin
  r := private.require_platform_admin('write_company');
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  select jsonb_build_object('status', status, 'trialEndsAt', trial_ends_at) into v_before
    from public.subscriptions where company_id = p_company_id;
  if v_before is null then
    raise exception 'Company has no subscription; create one first' using errcode = 'P0001', hint = 'no_subscription';
  end if;
  update public.subscriptions
     set status = 'trialing',
         trial_ends_at = greatest(coalesce(trial_ends_at, clock_timestamp()), clock_timestamp())
                         + make_interval(days => v_days),
         grace_until = null,
         cancelled_at = null,
         updated_at = clock_timestamp()
   where company_id = p_company_id;
  select jsonb_build_object('status', status, 'trialEndsAt', trial_ends_at) into v_after
    from public.subscriptions where company_id = p_company_id;
  perform private.platform_admin_audit(r, 'set_trial', 'company', p_company_id, p_reason, v_before, v_after);
  return v_after || jsonb_build_object('grantedDays', v_days);
end;
$$;


ALTER FUNCTION public.platform_admin_set_trial(p_company_id uuid, p_days integer, p_reason text) OWNER TO postgres;

--
-- Name: platform_admin_set_whatsapp_ai(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_set_whatsapp_ai(p_company_id uuid, p_enabled boolean, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_role public.platform_admin_role; v_before jsonb; v_after jsonb;
begin
  v_role := private.require_platform_admin('write_company');
  if p_enabled is null or nullif(btrim(p_reason), '') is null then raise exception 'enabled and reason are required' using errcode = '22023'; end if;
  if not exists (select 1 from public.companies where id = p_company_id) then raise exception 'company not found' using errcode = 'P0002'; end if;
  select jsonb_build_object('whatsappAiEnabled', whatsapp_ai_enabled) into v_before from public.company_platform_controls where company_id = p_company_id;
  v_before := coalesce(v_before, jsonb_build_object('whatsappAiEnabled', true));
  insert into public.company_platform_controls (company_id, whatsapp_ai_enabled, updated_by, updated_at)
  values (p_company_id, p_enabled, auth.uid(), now())
  on conflict (company_id) do update set whatsapp_ai_enabled = excluded.whatsapp_ai_enabled, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  v_after := jsonb_build_object('whatsappAiEnabled', p_enabled);
  perform private.platform_admin_audit(v_role, 'set_whatsapp_ai', 'company', p_company_id, p_reason, v_before, v_after);
  return v_after;
end $$;


ALTER FUNCTION public.platform_admin_set_whatsapp_ai(p_company_id uuid, p_enabled boolean, p_reason text) OWNER TO postgres;

--
-- Name: platform_admin_settings(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_settings() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  perform private.require_platform_admin('read');
  return jsonb_build_object(
    'defaults', jsonb_build_object('dailyRequests', 30, 'dailyCharacters', 36000, 'dailyCostUsd', 0.150000, 'monthlyRequests', null),
    'featureFlags', '[]'::jsonb
  );
end $$;


ALTER FUNCTION public.platform_admin_settings() OWNER TO postgres;

--
-- Name: platform_admin_shop_orders(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_shop_orders(p_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v_days integer := greatest(1, least(coalesce(p_days, 30), 730));
  v_start timestamptz := now() - make_interval(days => v_days);
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'days', v_days,
    'counts', jsonb_build_object(
      'placed', (select count(*)::int from public.shop_orders where placed_at >= v_start),
      'accepted', (select count(*)::int from public.shop_orders where accepted_at >= v_start),
      'delivered', (select count(*)::int from public.shop_orders where delivered_at >= v_start),
      'verified', (select count(*)::int from public.shop_orders where verified_at >= v_start),
      'rejected', (select count(*)::int from public.shop_orders where rejected_at >= v_start),
      'cancelled', (select count(*)::int from public.shop_orders where cancelled_at >= v_start)
    ),
    'totalWholesaleTzs', round(coalesce((select sum(total_wholesale) from public.shop_orders
                                         where placed_at >= v_start), 0), 2),
    'activeSuppliers', (select count(*)::int from public.company_suppliers where active),
    'recent', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', o.id, 'orderNo', o.order_no, 'status', o.status,
                         'totalWholesale', o.total_wholesale, 'currency', o.currency,
                         'placedAt', o.placed_at, 'verifiedAt', o.verified_at,
                         'buyer', b.name, 'supplier', s.name))
                        from public.shop_orders o
                        join public.companies b on b.id = o.buyer_company_id
                        join public.companies s on s.id = o.supplier_company_id
                        where o.placed_at >= v_start
                        order by o.placed_at desc limit 20), '[]'::jsonb)
  );
end;
$$;


ALTER FUNCTION public.platform_admin_shop_orders(p_days integer) OWNER TO postgres;

--
-- Name: platform_admin_subscriptions(text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_subscriptions(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 200) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
  v_rows jsonb;
begin
  r := private.require_platform_admin('read');
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x."companyName"), '[]'::jsonb)
    into v_rows
  from (
    select
      c.id                                   as "companyId",
      c.name                                 as "companyName",
      (s.id is not null)                     as "hasSubscription",
      s.plan,
      s.status,
      s.trial_ends_at                        as "trialEndsAt",
      case when s.trial_ends_at is null then null
           else round(extract(epoch from (s.trial_ends_at - now())) / 86400.0, 2) end as "trialDaysLeft",
      s.grace_until                          as "graceUntil",
      s.current_period_end                   as "currentPeriodEnd"
    from public.companies c
    left join public.subscriptions s on s.company_id = c.id
    where v_search is null or c.name ilike '%' || v_search || '%'
    order by c.name
    limit v_limit
  ) x;
  return jsonb_build_object('asOf', now(), 'rows', v_rows);
end;
$$;


ALTER FUNCTION public.platform_admin_subscriptions(p_search text, p_limit integer) OWNER TO postgres;

--
-- Name: platform_admin_whatsapp_identities(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_whatsapp_identities() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.platform_admin_role;
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', i.id, 'companyId', i.company_id, 'companyName', c.name,
                        'phoneE164', i.phone_e164, 'verifiedAt', i.verified_at,
                        'revokedAt', i.revoked_at, 'optedOutAt', i.opted_out_at,
                        'memberName', coalesce(p.full_name, '?')))
                      from public.whatsapp_identities i
                      join public.companies c on c.id = i.company_id
                      left join public.profiles p on p.id = i.profile_id
                      order by i.verified_at desc limit 200), '[]'::jsonb)
  );
end;
$$;


ALTER FUNCTION public.platform_admin_whatsapp_identities() OWNER TO postgres;

--
-- Name: platform_admin_whatsapp_ops(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_admin_whatsapp_ops(p_days integer DEFAULT 7) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_start timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)));
begin
  perform private.require_platform_admin('read');
  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'incoming', (select count(*) from public.whatsapp_messages m where m.created_at >= v_start),
      'completed', (select count(*) from public.whatsapp_messages m where m.created_at >= v_start and m.status = 'done'),
      'failed', (select count(*) from public.whatsapp_messages m where m.created_at >= v_start and m.status = 'failed'),
      'stalePending', (select count(*) from public.whatsapp_messages m where m.status in ('pending', 'processing') and m.created_at < now() - interval '15 minutes'),
      'retries', (select coalesce(sum(m.retry_count), 0) from public.whatsapp_messages m where m.created_at >= v_start),
      'p50LatencyMs', (select round(percentile_cont(0.50) within group (order by extract(epoch from (m.processed_at - m.created_at)) * 1000) ) from public.whatsapp_messages m where m.created_at >= v_start and m.status = 'done' and m.processed_at is not null),
      'p95LatencyMs', (select round(percentile_cont(0.95) within group (order by extract(epoch from (m.processed_at - m.created_at)) * 1000) ) from public.whatsapp_messages m where m.created_at >= v_start and m.status = 'done' and m.processed_at is not null)
    ),
    'routes', coalesce((select jsonb_agg(jsonb_build_object('route', coalesce(i.route, 'unclassified'), 'count', i.count) order by i.count desc) from (select route, count(*) from public.whatsapp_ai_interpretations where created_at >= v_start group by route) i), '[]'::jsonb),
    'failures', coalesce((select jsonb_agg(jsonb_build_object('code', coalesce(i.provider_failure_code, 'worker_failed'), 'count', i.count) order by i.count desc) from (select provider_failure_code, count(*) from public.whatsapp_ai_interpretations where created_at >= v_start and (provider_failure_code is not null or backend_outcome = 'provider_failed') group by provider_failure_code) i), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'companyName', c.name, 'status', m.status, 'retryCount', m.retry_count, 'route', i.route, 'createdAt', m.created_at, 'processedAt', m.processed_at) order by m.created_at desc) from public.whatsapp_messages m left join public.companies c on c.id = m.company_id left join public.whatsapp_ai_interpretations i on i.wa_message_id = m.wa_message_id where m.created_at >= v_start limit 50), '[]'::jsonb)
  );
end $$;


ALTER FUNCTION public.platform_admin_whatsapp_ops(p_days integer) OWNER TO postgres;

--
-- Name: preview_product_rename(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.preview_product_rename(p_from text, p_to text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_company uuid := private.auth_company_id();
begin
  if auth.uid() is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may rename products'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return private.product_rename_preview(v_company, p_from, p_to);
end;
$$;


ALTER FUNCTION public.preview_product_rename(p_from text, p_to text) OWNER TO postgres;

--
-- Name: price_band(uuid, text, numeric, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.price_band(p_company uuid, p_key text, p_unit_price numeric, p_quantity numeric) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  with current_price as (
    select retail_price, wholesale_price, wholesale_min_qty
      from product_selling_prices
     where company_id = p_company and product_key = private.product_key(p_key)
     order by effective_from desc, created_at desc
     limit 1
  )
  select case
    when not exists (select 1 from current_price) then 'unpriced'
    -- A cent of tolerance: a price typed as 9,000 and a line computed from a
    -- total should not disagree over rounding.
    when p_unit_price > (select retail_price from current_price) + 0.01 then 'above'
    when p_unit_price >= (select retail_price from current_price) - 0.01 then 'retail'
    when (select wholesale_price from current_price) is not null
     and p_unit_price >= (select wholesale_price from current_price) - 0.01 then 'wholesale'
    else 'below'
  end;
$$;


ALTER FUNCTION public.price_band(p_company uuid, p_key text, p_unit_price numeric, p_quantity numeric) OWNER TO postgres;

--
-- Name: product_costs_notify_members(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.product_costs_notify_members() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_previous numeric;
  v_actor_name text;
  v_currency text;
  v_direction text;
  v_money text := 'FM999G999G999D99';
begin
  select unit_cost into v_previous
    from product_costs
   where company_id = new.company_id
     and product_key = new.product_key
     and id <> new.id
   order by effective_from desc, created_at desc
   limit 1;

  if v_previous is null or v_previous = new.unit_cost then
    return new;
  end if;

  select full_name into v_actor_name from profiles where id = new.recorded_by;
  v_currency := coalesce(new.currency, 'TZS');
  v_direction := case when new.unit_cost > v_previous then 'imepanda' else 'imeshuka' end;

  insert into app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  select
    new.company_id,
    m.profile_id,
    new.recorded_by,
    'product_price_changed',
    'Bei ya kununua imebadilika',
    coalesce(v_actor_name, 'Mtu') || ' amebadilisha ' || new.product_name || ': '
      || v_currency || ' ' || rtrim(trim(to_char(v_previous, v_money)), '.') || ' → '
      || v_currency || ' ' || rtrim(trim(to_char(new.unit_cost, v_money)), '.')
      || ' (' || v_direction || '). Rekodi za nyuma hazijaguswa.',
    jsonb_build_object(
      'product_key', new.product_key,
      'product_name', new.product_name,
      'previous_cost', v_previous,
      'new_cost', new.unit_cost,
      'unit', new.unit)
  from company_members m
  where m.company_id = new.company_id
    and m.deactivated_at is null
    and m.profile_id <> new.recorded_by;

  return new;
end $$;


ALTER FUNCTION public.product_costs_notify_members() OWNER TO postgres;

--
-- Name: public_supplier_claim_status(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.public_supplier_claim_status(p_claim_token text) RETURNS TABLE(claim_title text, claim_status public.supplier_claim_status, target_company_name text, supplier_name text, amount numeric, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select cl.title, cl.status, co.name, cn.supplier_name, cl.amount, cl.created_at, cl.updated_at
  from supplier_claims cl
  join supplier_connections cn on cn.id = cl.connection_id
  join companies co on co.id = cl.target_company_id
  where cl.public_token = p_claim_token
$$;


ALTER FUNCTION public.public_supplier_claim_status(p_claim_token text) OWNER TO postgres;

--
-- Name: public_supplier_knock(uuid, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.public_supplier_knock(p_target_company_id uuid, p_supplier_name text, p_contact_name text, p_contact_email text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_supplier_tin text DEFAULT NULL::text, p_note text DEFAULT NULL::text) RETURNS TABLE(connection_token text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_token text;
begin
  insert into supplier_connections (
    target_company_id, supplier_name, contact_name, contact_email,
    contact_phone, supplier_tin, note
  )
  values (
    p_target_company_id, trim(p_supplier_name), trim(p_contact_name),
    nullif(trim(coalesce(p_contact_email, '')), ''),
    nullif(trim(coalesce(p_contact_phone, '')), ''),
    nullif(regexp_replace(coalesce(p_supplier_tin, ''), '\D', '', 'g'), ''),
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning public_token into v_token;

  return query select v_token;
end;
$$;


ALTER FUNCTION public.public_supplier_knock(p_target_company_id uuid, p_supplier_name text, p_contact_name text, p_contact_email text, p_contact_phone text, p_supplier_tin text, p_note text) OWNER TO postgres;

--
-- Name: public_supplier_submit_claim(text, text, text, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.public_supplier_submit_claim(p_connection_token text, p_title text, p_claim_note text DEFAULT NULL::text, p_amount numeric DEFAULT NULL::numeric) RETURNS TABLE(claim_token text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_connection supplier_connections%rowtype;
  v_claim_token text;
begin
  select * into v_connection
  from supplier_connections
  where public_token = p_connection_token
    and status = 'connected';

  if not found then
    raise exception 'connection_not_approved';
  end if;

  insert into supplier_claims (connection_id, target_company_id, title, claim_note, amount)
  values (v_connection.id, v_connection.target_company_id, trim(p_title), nullif(trim(coalesce(p_claim_note, '')), ''), p_amount)
  returning public_token into v_claim_token;

  if p_claim_note is not null and trim(p_claim_note) <> '' then
    insert into supplier_claim_messages (claim_id, author_side, author_name, message)
    select id, 'supplier', v_connection.contact_name, trim(p_claim_note)
    from supplier_claims
    where public_token = v_claim_token;
  end if;

  return query select v_claim_token;
end;
$$;


ALTER FUNCTION public.public_supplier_submit_claim(p_connection_token text, p_title text, p_claim_note text, p_amount numeric) OWNER TO postgres;

--
-- Name: receipt_aliases_set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.receipt_aliases_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION public.receipt_aliases_set_updated_at() OWNER TO postgres;

--
-- Name: receipts_block_delete_when_booked(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.receipts_block_delete_when_booked() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if private.receipt_has_live_expense(old.id) then
    raise exception 'This receipt is booked against petty cash and cannot be deleted. Reverse the petty cash entry first.'
      using errcode = 'P0001', hint = 'receipt_booked';
  end if;
  return old;
end $$;


ALTER FUNCTION public.receipts_block_delete_when_booked() OWNER TO postgres;

--
-- Name: receipts_block_delete_when_paid(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.receipts_block_delete_when_paid() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if exists (select 1 from public.reimbursement_payout_items i
              where i.receipt_id = old.id and i.voided_at is null) then
    raise exception 'This receipt has been paid back to the employee and cannot be deleted. Void the payout first.'
      using errcode = 'P0001', hint = 'receipt_settled';
  end if;
  return old;
end $$;


ALTER FUNCTION public.receipts_block_delete_when_paid() OWNER TO postgres;

--
-- Name: receipts_guard_live_staff_retirement(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.receipts_guard_live_staff_retirement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if exists (
    select 1
      from public.staff_retirement_receipts srr
      join public.staff_retirements sr on sr.id = srr.retirement_id
     where srr.receipt_id = old.id
       and private.staff_retirement_is_live(sr.status)
  ) then
    if new.total_amount is distinct from old.total_amount
       or new.tax_amount is distinct from old.tax_amount
       or new.payment_method is distinct from old.payment_method
       or new.status is distinct from old.status
       or new.company_id is distinct from old.company_id
       or new.project_id is distinct from old.project_id
       or new.uploaded_by is distinct from old.uploaded_by
       or new.receipt_date is distinct from old.receipt_date
       or new.category is distinct from old.category
       or new.reimbursed_at is distinct from old.reimbursed_at
       or new.reimbursed_by is distinct from old.reimbursed_by then
      raise exception 'This receipt is part of a live staff retirement. Cancel or reject the retirement before changing money-sensitive fields.'
        using errcode = 'P0001', hint = 'retirement_receipt_frozen';
    end if;
  end if;
  return new;
end $$;


ALTER FUNCTION public.receipts_guard_live_staff_retirement() OWNER TO postgres;

--
-- Name: receipts_guard_settlement(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.receipts_guard_settlement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_payout boolean := coalesce(current_setting('risip.payout', true), '') = 'on';
begin
  -- Fix 1: these two columns belong to the payout RPCs. Not to workers, and not
  -- to finance either -- one door, so there is one place that records the money.
  if (new.reimbursed_at is distinct from old.reimbursed_at
      or new.reimbursed_by is distinct from old.reimbursed_by)
     and not v_payout then
    raise exception 'Reimbursement is recorded by finance through a payout, not by editing the receipt.'
      using errcode = 'P0001', hint = 'payout_only';
  end if;

  -- Fix 2: what was owed, and to whom, is settled history once it is paid.
  if old.reimbursed_at is not null and not v_payout then
    if new.total_amount is distinct from old.total_amount
       or new.payment_method is distinct from old.payment_method
       or new.uploaded_by is distinct from old.uploaded_by
       or new.company_id is distinct from old.company_id
       or new.status is distinct from old.status then
      raise exception 'This receipt has already been paid back to the employee. Void the payout before changing its amount, payer, company, payment source or status.'
        using errcode = 'P0001', hint = 'receipt_settled';
    end if;
  end if;

  return new;
end $$;


ALTER FUNCTION public.receipts_guard_settlement() OWNER TO postgres;

--
-- Name: receipts_guard_transitions(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.receipts_guard_transitions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_booked boolean; v_flag boolean;
begin
  select approval_flow_enabled into v_flag from public.companies where id = new.company_id;
  v_flag := coalesce(v_flag, false);

  -- ── INSERT ────────────────────────────────────────────────────────────
  if tg_op = 'INSERT' then
    if v_flag and new.status not in ('processing', 'pending_review') then
      raise exception
        'With the approval flow enabled a receipt must be created as processing or pending_review, not %. It has to be submitted and approved.',
        new.status
        using errcode = 'P0001', hint = 'approval_required_on_insert';
    end if;
    return new;
  end if;

  -- ── UPDATE ────────────────────────────────────────────────────────────
  v_booked := private.receipt_has_live_expense(new.id);

  if v_booked and new.status is distinct from old.status then
    raise exception
      'This receipt is booked against petty cash, so its status cannot change from % to %. Reverse the petty cash entry first.',
      old.status, new.status
      using errcode = 'P0001', hint = 'receipt_booked';
  end if;

  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    if old.status = 'duplicate' then
      raise exception 'A duplicate receipt cannot be confirmed. Resolve the duplicate instead.'
        using errcode = 'P0001', hint = 'invalid_transition_duplicate';
    end if;
    if old.status = 'error' then
      raise exception 'A failed receipt cannot be confirmed directly. Send it back for review so extraction and duplicate checks run again.'
        using errcode = 'P0001', hint = 'invalid_transition_error';
    end if;
    if old.status = 'rejected' then
      raise exception 'A rejected receipt is final and cannot be confirmed.'
        using errcode = 'P0001', hint = 'invalid_transition_rejected';
    end if;

    if v_flag then
      -- decide_receipt is the only thing that sets decided_by.
      if old.status <> 'submitted' or new.decided_by is null then
        raise exception 'With the approval flow enabled a receipt must be submitted and then approved by finance.'
          using errcode = 'P0001', hint = 'approval_required';
      end if;
    end if;
  end if;

  if old.status = 'rejected' and new.status is distinct from 'rejected' then
    raise exception 'A rejected receipt is final.'
      using errcode = 'P0001', hint = 'rejected_is_terminal';
  end if;

  return new;
end $$;


ALTER FUNCTION public.receipts_guard_transitions() OWNER TO postgres;

--
-- Name: receipts_protect_booked(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.receipts_protect_booked() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if not private.receipt_has_live_expense(new.id) then
    return new;
  end if;
  if new.total_amount is distinct from old.total_amount
     or new.payment_method is distinct from old.payment_method
     or new.uploaded_by is distinct from old.uploaded_by
     or new.company_id is distinct from old.company_id then
    raise exception 'This receipt has already been booked against petty cash. Reverse the petty cash entry before changing its amount, payer, company or payment source.'
      using errcode = 'P0001', hint = 'receipt_booked';
  end if;
  return new;
end $$;


ALTER FUNCTION public.receipts_protect_booked() OWNER TO postgres;

--
-- Name: receipts_set_company_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.receipts_set_company_id() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare v_company uuid;
begin
  if new.project_id is not null then
    select company_id into v_company from projects where id = new.project_id;
    if v_company is null then
      raise exception 'receipts.project_id % does not resolve to a company', new.project_id;
    end if;
    new.company_id := v_company;
  elsif new.company_id is null then
    raise exception 'a receipt with no project must carry a company_id';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.receipts_set_company_id() OWNER TO postgres;

--
-- Name: receipts_write_audit(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.receipts_write_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_self  boolean;
  v_event text;
  v_reason text;
  v_actor uuid;
  v_txn   uuid;
  v_acct  uuid;
begin
  -- Forced by an RPC that is doing something the status alone cannot describe.
  v_event := nullif(btrim(coalesce(current_setting('risip.audit_event', true), '')), '');

  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and v_event is null then
    return new;
  end if;

  v_self   := coalesce(current_setting('risip.self_approved', true), 'false') = 'true';
  v_reason := nullif(btrim(coalesce(current_setting('risip.audit_reason', true), '')), '');
  v_actor  := nullif(btrim(coalesce(current_setting('risip.audit_actor',  true), '')), '')::uuid;
  v_txn    := nullif(btrim(coalesce(current_setting('risip.audit_txn',    true), '')), '')::uuid;
  v_acct   := nullif(btrim(coalesce(current_setting('risip.audit_account',true), '')), '')::uuid;

  insert into public.receipt_audit_log (
    company_id, receipt_id, actor_id, event, old_status, new_status,
    old_amount, new_amount, payment_method, reason, self_approved,
    petty_cash_transaction_id, petty_cash_account_id
  ) values (
    new.company_id, new.id,
    -- A forced actor wins: on a reversal decided_by is the APPROVER, not the
    -- person reversing.
    coalesce(v_actor, new.decided_by, new.submitted_by, auth.uid()),
    coalesce(v_event,
      case new.status
        when 'confirmed' then 'confirmed'
        when 'submitted' then 'submitted'
        when 'changes_requested' then 'changes_requested'
        when 'rejected' then 'rejected'
        else 'status_changed' end),
    case when tg_op = 'UPDATE' then old.status::text else null end,
    new.status::text,
    case when tg_op = 'UPDATE' then old.total_amount else null end,
    new.total_amount, new.payment_method,
    coalesce(v_reason, new.decision_reason),
    v_self,
    v_txn, v_acct
  );
  return new;
end $$;


ALTER FUNCTION public.receipts_write_audit() OWNER TO postgres;

--
-- Name: record_stock_count(text, numeric, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.record_stock_count(p_name text, p_quantity numeric, p_unit text DEFAULT NULL::text, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_company uuid := private.auth_company_id();
  v_actor uuid := auth.uid();
  v_key text := private.product_key(p_name);
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  v_existing text; v_id uuid;
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may record a stock count'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this count for?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'a count cannot be negative' using errcode = 'P0001', hint = 'invalid_quantity';
  end if;

  v_existing := private.product_unit(v_company, v_key);
  if v_unit is not null and v_existing is not null and lower(v_unit) <> lower(v_existing) then
    raise exception 'this product is measured in % — count it in %, not in %',
      v_existing, v_existing, v_unit
      using errcode = 'P0001', hint = 'unit_mismatch';
  end if;

  insert into stock_counts (company_id, product_key, product_name, quantity, unit, counted_by, note)
  values (v_company, v_key, btrim(p_name), round(p_quantity, 3),
          coalesce(v_unit, v_existing), v_actor, nullif(btrim(p_note), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'product', btrim(p_name), 'quantity', round(p_quantity, 3));
end $$;


ALTER FUNCTION public.record_stock_count(p_name text, p_quantity numeric, p_unit text, p_note text) OWNER TO postgres;

--
-- Name: rename_product(text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rename_product(p_from text, p_to text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_company uuid := private.auth_company_id(); v_actor uuid := auth.uid();
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may rename products'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return private.rename_product_for_actor(v_company, v_actor, p_from, p_to, p_reason);
end;
$$;


ALTER FUNCTION public.rename_product(p_from text, p_to text, p_reason text) OWNER TO postgres;

--
-- Name: request_petty_cash_top_up(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.request_petty_cash_top_up(p_user uuid, p_amount numeric, p_description text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company uuid; v_account uuid; v_txn uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if private.auth_role() not in ('owner', 'accountant') then raise exception 'not authorized'; end if;
  v_company := private.auth_company_id();
  if not exists (select 1 from profiles where id = p_user and company_id = v_company and deactivated_at is null) then
    raise exception 'staff member not in your company';
  end if;
  select id into v_account from petty_cash_accounts where user_id = p_user and company_id = v_company;
  if v_account is null then
    insert into petty_cash_accounts (user_id, company_id) values (p_user, v_company) returning id into v_account;
  end if;
  insert into petty_cash_transactions (account_id, amount, type, description, created_by, status)
  values (v_account, p_amount, 'allocation', coalesce(p_description, 'Top-up'), auth.uid(), 'pending')
  returning id into v_txn;
  insert into app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  values (
    v_company, p_user, auth.uid(), 'petty_cash_request', 'Petty cash top-up request',
    'You have received a cash top-up request of TSh ' || trim(to_char(p_amount, 'FM999,999,999,999,990.00')) || '. Accept it before using the funds.',
    jsonb_build_object('transaction_id', v_txn, 'amount', p_amount)
  );
  return v_txn;
end;
$$;


ALTER FUNCTION public.request_petty_cash_top_up(p_user uuid, p_amount numeric, p_description text) OWNER TO postgres;

--
-- Name: request_receipt_reversal(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.request_receipt_reversal(p_receipt uuid, p_reason text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare r record; v_actor uuid := auth.uid(); v_name text;
begin
  if not private.is_meaningful_reason(p_reason) then
    raise exception 'Please write a clear reason with at least 3 meaningful words, so finance understands what is wrong.'
      using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;

  select * into r from public.receipts where id = p_receipt;
  if not found then raise exception 'receipt not found' using errcode = 'P0001'; end if;
  if r.company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;
  if r.uploaded_by <> v_actor and private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only the person who filed this receipt can ask for it to be reversed'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if r.status <> 'confirmed' then
    raise exception 'only a confirmed receipt can be sent back for reversal'
      using errcode = 'P0001', hint = 'not_confirmed';
  end if;

  select full_name into v_name from public.profiles where id = v_actor;

  insert into public.receipt_audit_log
    (company_id, receipt_id, actor_id, event, old_status, new_status,
     old_amount, new_amount, payment_method, reason)
  values (r.company_id, p_receipt, v_actor, 'reversal_requested',
          r.status::text, r.status::text, r.total_amount, r.total_amount,
          r.payment_method, btrim(p_reason));

  insert into public.app_notifications
    (company_id, recipient_id, actor_id, type, title, body, metadata)
  select r.company_id, p.id, v_actor, 'receipt_reversal_requested',
         'Reversal requested',
         coalesce(v_name, 'A colleague') || ' asked for '
           || coalesce(nullif(r.vendor_name, ''), 'a receipt')
           || ' to be reviewed. Reason: ' || btrim(p_reason),
         jsonb_build_object('receipt_id', p_receipt)
    from public.profiles p
   where p.company_id = r.company_id and p.role in ('owner', 'accountant')
     and p.deactivated_at is null and p.id <> v_actor;

  return 'requested';
end $$;


ALTER FUNCTION public.request_receipt_reversal(p_receipt uuid, p_reason text) OWNER TO postgres;

--
-- Name: respond_to_petty_cash_request(uuid, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.respond_to_petty_cash_request(p_transaction uuid, p_accept boolean) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_txn_id uuid; v_status text; v_type text; v_amount numeric;
  v_created_by uuid; v_account_user uuid; v_company uuid;
  v_recipient_name text;
begin
  select t.id, t.status, t.type, t.amount, t.created_by, a.user_id, a.company_id
    into v_txn_id, v_status, v_type, v_amount, v_created_by, v_account_user, v_company
    from petty_cash_transactions t
    join petty_cash_accounts a on a.id = t.account_id
   where t.id = p_transaction
   for update;
  if not found then raise exception 'top-up request not found'; end if;
  if v_account_user <> auth.uid() then raise exception 'this top-up belongs to another user'; end if;
  if v_type <> 'allocation' or v_status <> 'pending' then raise exception 'this top-up has already been handled'; end if;

  update petty_cash_transactions
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = p_transaction;

  select full_name into v_recipient_name from profiles where id = auth.uid();

  if v_created_by is not null then
    insert into app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
    values (
      v_company, v_created_by, auth.uid(), 'petty_cash_response',
      case when p_accept then 'Top-up accepted' else 'Top-up declined' end,
      coalesce(v_recipient_name, 'Staff')
        || case when p_accept then ' accepted your top-up of TSh ' else ' declined your top-up of TSh ' end
        || trim(to_char(v_amount, 'FM999,999,999,999,990')) || '.',
      jsonb_build_object('transaction_id', p_transaction, 'amount', v_amount, 'accepted', p_accept)
    );
  end if;

  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;


ALTER FUNCTION public.respond_to_petty_cash_request(p_transaction uuid, p_accept boolean) OWNER TO postgres;

--
-- Name: reverse_petty_cash_receipt(uuid, uuid, text, text, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reverse_petty_cash_receipt(p_receipt uuid, p_transaction uuid, p_mode text, p_reason text, p_new_amount numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r record; v_txn record; v_actor uuid := auth.uid(); v_confirmer uuid;
  v_adjustment uuid; v_expense uuid; v_balance numeric; v_blocker text;
begin
  if p_mode not in ('void', 'correct') then
    raise exception 'unknown reversal mode %', p_mode using errcode = 'P0001';
  end if;
  if not private.is_meaningful_reason(p_reason) then
    raise exception 'Please write a clear reason with at least 3 meaningful words. Somebody will read this months from now to understand where the money went.'
      using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may reverse a petty cash entry'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  select rc.*, c.reversal_enabled, c.allow_self_approval into r
    from public.receipts rc join public.companies c on c.id = rc.company_id
   where rc.id = p_receipt for update of rc;
  if not found then raise exception 'receipt not found' using errcode = 'P0001'; end if;
  if r.company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;
  if not r.reversal_enabled then
    raise exception 'reversal is not enabled for this company'
      using errcode = 'P0001', hint = 'reversal_disabled';
  end if;

  select * into v_txn from public.petty_cash_transactions
   where id = p_transaction and receipt_id = p_receipt and type = 'expense';
  if not found then
    raise exception 'that petty cash posting does not belong to this receipt'
      using errcode = 'P0001', hint = 'wrong_transaction';
  end if;

  if v_txn.reversed_at is not null then
    select current_balance into v_balance
      from public.petty_cash_accounts where id = v_txn.account_id;
    return jsonb_build_object('status', 'already_reversed',
      'adjustment_id', v_txn.reversed_by_transaction_id, 'balance', v_balance);
  end if;

  if r.status <> 'confirmed' then
    raise exception 'only a confirmed receipt has a posting to reverse'
      using errcode = 'P0001', hint = 'not_confirmed';
  end if;

  if r.reimbursed_at is not null then
    v_blocker := 'This receipt has already been reimbursed to the employee. Recover the money first; a reversal does not get it back.';
  elsif exists (select 1 from public.invoice_receipts ir join public.invoices i on i.id = ir.invoice_id
                 where ir.receipt_id = p_receipt and i.status <> 'draft') then
    v_blocker := 'This receipt is on an invoice that has already left draft. Reversing it would change a document the client holds.';
  elsif exists (select 1 from public.staff_retirement_receipts srr
                  join public.staff_retirements sr on sr.id = srr.retirement_id
                 where srr.receipt_id = p_receipt and sr.status::text not in ('cancelled', 'rejected')) then
    v_blocker := 'This receipt is part of a retirement claim. Cancel or reject the retirement first.';
  end if;
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = 'P0001', hint = 'reversal_blocked';
  end if;

  v_confirmer := coalesce(r.decided_by, (
    select actor_id from public.receipt_audit_log
     where receipt_id = p_receipt and event = 'confirmed'
     order by created_at desc limit 1));
  if v_confirmer = v_actor and not r.allow_self_approval then
    raise exception 'you confirmed this receipt, so another finance user must reverse it'
      using errcode = 'P0001', hint = 'self_reversal_blocked';
  end if;

  if p_mode = 'correct' then
    if p_new_amount is null or p_new_amount <= 0 then
      raise exception 'a correction needs a positive corrected amount'
        using errcode = 'P0001', hint = 'invalid_amount';
    end if;
    if p_new_amount = r.total_amount then
      raise exception 'the corrected amount is the same as the current one'
        using errcode = 'P0001', hint = 'no_change';
    end if;
  end if;

  select current_balance into v_balance from public.petty_cash_accounts
   where id = v_txn.account_id for update;
  if v_balance is null then
    raise exception 'petty cash account not found' using errcode = 'P0001';
  end if;

  insert into public.petty_cash_transactions
    (account_id, amount, type, receipt_id, description, created_by, project_id,
     status, reverses_transaction_id, reversal_reason)
  values (v_txn.account_id, -v_txn.amount, 'adjustment', p_receipt,
    case p_mode when 'void' then 'Reversal of petty cash expense'
                else 'Correction of petty cash expense' end,
    v_actor, v_txn.project_id, 'accepted', v_txn.id, btrim(p_reason))
  returning id into v_adjustment;

  update public.petty_cash_transactions
     set reversed_at = now(), reversed_by_transaction_id = v_adjustment
   where id = v_txn.id;

  perform set_config('risip.audit_event',
                     case p_mode when 'void' then 'reversed' else 'corrected' end, true);
  perform set_config('risip.audit_reason', btrim(p_reason), true);
  perform set_config('risip.audit_actor', v_actor::text, true);
  perform set_config('risip.audit_txn', v_adjustment::text, true);
  perform set_config('risip.audit_account', v_txn.account_id::text, true);

  if p_mode = 'void' then
    update public.receipts
       set status = 'pending_review', decision_reason = btrim(p_reason),
           details_confirmed = false, submitted_at = null, submitted_by = null,
           decided_at = null, decided_by = null
     where id = p_receipt;
  else
    update public.receipts
       set total_amount = p_new_amount, decision_reason = btrim(p_reason)
     where id = p_receipt;

    insert into public.petty_cash_transactions
      (account_id, amount, type, receipt_id, description, created_by, project_id, status)
    values (v_txn.account_id, -p_new_amount, 'expense', p_receipt,
      coalesce('Receipt: ' || nullif(r.vendor_name, ''), 'Petty cash expense'),
      r.uploaded_by, r.project_id, 'accepted')
    returning id into v_expense;
  end if;

  perform set_config('risip.audit_event', '', true);
  perform set_config('risip.audit_reason', '', true);
  perform set_config('risip.audit_actor', '', true);
  perform set_config('risip.audit_txn', '', true);
  perform set_config('risip.audit_account', '', true);

  insert into public.app_notifications
    (company_id, recipient_id, actor_id, type, title, body, metadata)
  select r.company_id, r.uploaded_by, v_actor, 'receipt_' || p_mode,
         case p_mode when 'void' then 'A receipt was reversed'
                     else 'A receipt amount was corrected' end,
         case p_mode
           when 'void' then 'Your receipt was reversed and the petty cash was returned to your float. Reason: ' || btrim(p_reason)
           else 'Your receipt was corrected from TSh '
                || trim(to_char(r.total_amount, 'FM999,999,999,999,990')) || ' to TSh '
                || trim(to_char(p_new_amount, 'FM999,999,999,999,990')) || '. Reason: ' || btrim(p_reason)
         end,
         jsonb_build_object('receipt_id', p_receipt, 'mode', p_mode, 'adjustment_id', v_adjustment)
   where r.uploaded_by is not null and r.uploaded_by <> v_actor;

  insert into public.app_notifications
    (company_id, recipient_id, actor_id, type, title, body, metadata)
  select r.company_id, p.id, v_actor, 'receipt_' || p_mode,
         case p_mode when 'void' then 'Petty cash entry reversed'
                     else 'Petty cash entry corrected' end,
         coalesce((select full_name from public.profiles where id = v_actor), 'A colleague')
           || ' ' || case p_mode when 'void' then 'reversed' else 'corrected' end
           || ' ' || coalesce(nullif(r.vendor_name, ''), 'a receipt')
           || '. Reason: ' || btrim(p_reason),
         jsonb_build_object('receipt_id', p_receipt, 'mode', p_mode, 'adjustment_id', v_adjustment)
    from public.profiles p
   where p.company_id = r.company_id and p.role in ('owner', 'accountant')
     and p.deactivated_at is null and p.id <> v_actor
     and p.id is distinct from r.uploaded_by;

  select current_balance into v_balance
    from public.petty_cash_accounts where id = v_txn.account_id;

  return jsonb_build_object('status', p_mode, 'adjustment_id', v_adjustment,
    'expense_id', v_expense, 'balance', v_balance);
end $$;


ALTER FUNCTION public.reverse_petty_cash_receipt(p_receipt uuid, p_transaction uuid, p_mode text, p_reason text, p_new_amount numeric) OWNER TO postgres;

--
-- Name: revoke_whatsapp_identity(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.revoke_whatsapp_identity() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_changed integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update whatsapp_identities
     set revoked_at = now(), updated_at = now()
   where profile_id = auth.uid() and revoked_at is null;
  get diagnostics v_changed = row_count;
  update whatsapp_link_tokens set revoked_at = now()
   where profile_id = auth.uid() and used_at is null and revoked_at is null;
  return v_changed;
end;
$$;


ALTER FUNCTION public.revoke_whatsapp_identity() OWNER TO postgres;

--
-- Name: scanned_documents_set_company_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.scanned_documents_set_company_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  select company_id into new.company_id from projects where id = new.project_id;
  if new.company_id is null then
    raise exception 'scanned_documents.project_id % does not resolve to a company', new.project_id;
  end if;
  return new;
end $$;


ALTER FUNCTION public.scanned_documents_set_company_id() OWNER TO postgres;

--
-- Name: search_companies(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.search_companies(q text) RETURNS TABLE(id uuid, name text, logo_url text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select c.id, c.name, c.logo_url
  from companies c
  where c.name ilike '%' || q || '%'
  order by c.name
  limit 20;
$$;


ALTER FUNCTION public.search_companies(q text) OWNER TO postgres;

--
-- Name: set_company_password(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_company_password(p_password text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  if auth_role() != 'owner' then
    raise exception 'forbidden';
  end if;
  if length(p_password) < 6 then
    raise exception 'password too short';
  end if;
  update companies
  set password_hash = crypt(p_password, gen_salt('bf'))
  where id = auth_company_id();
end;
$$;


ALTER FUNCTION public.set_company_password(p_password text) OWNER TO postgres;

--
-- Name: set_company_password_v1(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_company_password_v1(p_password text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare cid uuid; r user_role;
begin
  select company_id, role into cid, r from profiles where id = auth.uid();
  if cid is null then raise exception 'no profile'; end if;
  if r <> 'owner' then raise exception 'only owner can set company password'; end if;
  if coalesce(trim(p_password),'') = '' then raise exception 'password required'; end if;
  update companies set password_hash = crypt(p_password, gen_salt('bf')) where id = cid;
end;
$$;


ALTER FUNCTION public.set_company_password_v1(p_password text) OWNER TO postgres;

--
-- Name: set_company_supplier(boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_company_supplier(p_active boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_company uuid := private.auth_company_id();
  v_profile uuid := auth.uid();
  v_row public.company_suppliers;
begin
  if v_profile is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() <> 'owner' then
    raise exception 'Only the owner may register this shop as a supplier'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  insert into public.company_suppliers (company_id, active, opted_in_by)
  values (v_company, p_active, v_profile)
  on conflict (company_id)
  do update set active = excluded.active,
                opted_in_by = coalesce(public.company_suppliers.opted_in_by, excluded.opted_in_by),
                updated_at = clock_timestamp()
  returning * into v_row;
  return jsonb_build_object('is_supplier', v_row.active);
end;
$$;


ALTER FUNCTION public.set_company_supplier(p_active boolean) OWNER TO postgres;

--
-- Name: set_product_barcode(text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_product_barcode(p_barcode text, p_product_key text, p_product_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
declare
  v_company uuid := private.auth_company_id();
  v_role text := private.auth_role();
  v_code text := regexp_replace(coalesce(p_barcode, ''), '[^0-9]', '', 'g');
  v_key text := btrim(coalesce(p_product_key, ''));
  v_name text := btrim(coalesce(p_product_name, ''));
begin
  if v_company is null then
    raise exception 'no company';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant can save a barcode';
  end if;
  if v_code !~ '^[0-9]{6,18}$' then
    raise exception 'barcode must be 6 to 18 digits';
  end if;
  if v_key = '' or v_name = '' then
    raise exception 'product is required';
  end if;

  insert into public.product_barcodes (company_id, barcode, product_key, product_name, created_by)
  values (v_company, v_code, v_key, v_name, auth.uid())
  on conflict (company_id, barcode)
  do update set product_key = excluded.product_key,
                product_name = excluded.product_name;

  return jsonb_build_object('barcode', v_code, 'product_key', v_key, 'product_name', v_name);
end $_$;


ALTER FUNCTION public.set_product_barcode(p_barcode text, p_product_key text, p_product_name text) OWNER TO postgres;

--
-- Name: set_product_cost(text, numeric, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_product_cost(p_name text, p_unit_cost numeric, p_unit text DEFAULT NULL::text, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_company uuid := private.auth_company_id();
  v_actor uuid := auth.uid();
  v_key text; v_currency text; v_prev numeric; v_id uuid;
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  v_existing text;
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may set a buying price'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  v_key := private.product_key(p_name);
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this price for?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if p_unit_cost is null or p_unit_cost <= 0 then
    raise exception 'a buying price must be greater than zero'
      using errcode = 'P0001', hint = 'invalid_cost';
  end if;

  v_existing := private.product_unit(v_company, v_key);
  if v_unit is not null and v_existing is not null and lower(v_unit) <> lower(v_existing) then
    raise exception 'this product is measured in % — a buying price must be per %, not per %',
      v_existing, v_existing, v_unit
      using errcode = 'P0001', hint = 'unit_mismatch';
  end if;

  select currency into v_currency from companies where id = v_company;

  select unit_cost into v_prev from product_costs
   where company_id = v_company and product_key = v_key
   order by effective_from desc, created_at desc limit 1;

  insert into product_costs
    (company_id, product_key, product_name, unit, unit_cost, currency, recorded_by, note)
  values
    (v_company, v_key, btrim(p_name), coalesce(v_unit, v_existing), round(p_unit_cost, 2),
     v_currency, v_actor, nullif(btrim(p_note), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'product', btrim(p_name),
    'unit_cost', round(p_unit_cost, 2), 'previous_cost', v_prev);
end $$;


ALTER FUNCTION public.set_product_cost(p_name text, p_unit_cost numeric, p_unit text, p_note text) OWNER TO postgres;

--
-- Name: set_selling_price(text, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_selling_price(p_name text, p_retail numeric, p_wholesale numeric DEFAULT NULL::numeric, p_min_qty numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_company uuid := private.auth_company_id();
  v_actor uuid := auth.uid();
  v_key text := private.product_key(p_name);
  v_currency text; v_id uuid;
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may set a selling price'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this price for?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if p_retail is null or p_retail <= 0 then
    raise exception 'a retail price must be greater than zero'
      using errcode = 'P0001', hint = 'invalid_price';
  end if;
  if p_wholesale is not null and p_wholesale > p_retail then
    raise exception 'a wholesale price cannot be higher than the retail price'
      using errcode = 'P0001', hint = 'wholesale_above_retail';
  end if;
  -- A minimum with no wholesale price says nothing, and would read as if bulk
  -- buyers get something they do not.
  if p_min_qty is not null and p_wholesale is null then
    raise exception 'a bulk quantity needs a wholesale price to go with it'
      using errcode = 'P0001', hint = 'min_without_wholesale';
  end if;

  select currency into v_currency from companies where id = v_company;

  insert into product_selling_prices
    (company_id, product_key, product_name, retail_price, wholesale_price,
     wholesale_min_qty, currency, recorded_by)
  values
    (v_company, v_key, btrim(p_name), round(p_retail, 2),
     case when p_wholesale is null then null else round(p_wholesale, 2) end,
     p_min_qty, v_currency, v_actor)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'product', btrim(p_name),
    'retail', round(p_retail, 2),
    'wholesale', case when p_wholesale is null then null else round(p_wholesale, 2) end,
    'min_qty', p_min_qty);
end $$;


ALTER FUNCTION public.set_selling_price(p_name text, p_retail numeric, p_wholesale numeric, p_min_qty numeric) OWNER TO postgres;

--
-- Name: set_whatsapp_notification_preferences(boolean, boolean, time without time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_whatsapp_notification_preferences(p_daily_summary boolean, p_debt_reminders boolean, p_closing_time time without time zone DEFAULT NULL::time without time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_identity public.whatsapp_identities;
  v_closing_time time;
  v_now timestamptz := clock_timestamp();
begin
  select p.active_company_id, m.role::text, c.closing_time
    into v_company, v_role, v_closing_time
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
    join public.companies c on c.id = m.company_id
   where p.id = v_profile and p.deactivated_at is null;

  if v_profile is null or v_company is null then
    raise exception 'Active company membership is required'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'Only an owner or accountant may enable account notifications'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  select * into v_identity
    from public.whatsapp_identities i
   where i.profile_id = v_profile and i.revoked_at is null
   for update;
  if v_identity.id is null then
    raise exception 'Connect WhatsApp before enabling notifications'
      using errcode = 'P0001', hint = 'whatsapp_not_connected';
  end if;

  if p_daily_summary and coalesce(p_closing_time, v_closing_time) is null then
    raise exception 'Set the business closing time before enabling daily summaries'
      using errcode = 'P0001', hint = 'closing_time_required';
  end if;

  if p_closing_time is not null then
    update public.companies
       set closing_time = p_closing_time,
           closing_time_asked_at = coalesce(closing_time_asked_at, v_now)
     where id = v_company;
    v_closing_time := p_closing_time;
  end if;

  update public.whatsapp_identities
     set daily_summary_opted_in_at = case
           when p_daily_summary then coalesce(daily_summary_opted_in_at, v_now)
           else null end,
         debt_reminders_opted_in_at = case
           when p_debt_reminders then coalesce(debt_reminders_opted_in_at, v_now)
           else null end,
         proactive_notifications_opted_out_at = case
           when p_daily_summary or p_debt_reminders then null
           else coalesce(proactive_notifications_opted_out_at, v_now) end,
         updated_at = v_now
   where id = v_identity.id;

  if (v_identity.daily_summary_opted_in_at is null) is distinct from (not p_daily_summary) then
    insert into public.whatsapp_notification_consent_log
      (identity_id, company_id, profile_id, channel, action, source)
    values
      (v_identity.id, v_company, v_profile, 'daily_summary',
       case when p_daily_summary then 'enabled' else 'disabled' end, 'app');
  end if;
  if (v_identity.debt_reminders_opted_in_at is null) is distinct from (not p_debt_reminders) then
    insert into public.whatsapp_notification_consent_log
      (identity_id, company_id, profile_id, channel, action, source)
    values
      (v_identity.id, v_company, v_profile, 'debt_reminder',
       case when p_debt_reminders then 'enabled' else 'disabled' end, 'app');
  end if;

  return jsonb_build_object(
    'connected', true,
    'daily_summary_enabled', p_daily_summary,
    'debt_reminders_enabled', p_debt_reminders,
    'closing_time', case when v_closing_time is null then null
      else to_char(v_closing_time, 'HH24:MI') end
  );
end;
$$;


ALTER FUNCTION public.set_whatsapp_notification_preferences(p_daily_summary boolean, p_debt_reminders boolean, p_closing_time time without time zone) OWNER TO postgres;

--
-- Name: signup_company_v1(uuid, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.signup_company_v1(p_user_id uuid, p_full_name text, p_phone text, p_company_name text, p_hq_location text, p_sector text, p_company_password text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  new_company_id uuid;
begin
  if p_user_id is null then
    raise exception 'user_id required';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user_id does not exist in auth.users';
  end if;
  if exists (select 1 from profiles where id = p_user_id) then
    raise exception 'profile already exists for this user';
  end if;
  if coalesce(trim(p_company_name), '') = '' or coalesce(trim(p_hq_location), '') = '' then
    raise exception 'company_name and hq_location are required';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'full_name is required';
  end if;
  if coalesce(trim(p_company_password), '') = '' then
    raise exception 'company_password is required';
  end if;

  insert into companies (name, hq_location, sector, password_hash, scanner_inbox_token)
  values (
    trim(p_company_name),
    trim(p_hq_location),
    nullif(trim(p_sector), ''),
    crypt(trim(p_company_password), gen_salt('bf')),
    private.gen_scanner_token(trim(p_company_name))
  )
  returning id into new_company_id;

  insert into profiles (id, company_id, full_name, phone, role)
  values (p_user_id, new_company_id, trim(p_full_name), nullif(trim(p_phone), ''), 'owner');

  return new_company_id;
end;
$$;


ALTER FUNCTION public.signup_company_v1(p_user_id uuid, p_full_name text, p_phone text, p_company_name text, p_hq_location text, p_sector text, p_company_password text) OWNER TO postgres;

--
-- Name: staff_retirement_receipt_live_guard(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.staff_retirement_receipt_live_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare sr record;
begin
  select * into sr from public.staff_retirements where id = new.retirement_id;
  if not found then
    raise exception 'retirement not found' using errcode = 'P0001';
  end if;
  if not private.staff_retirement_is_live(sr.status) then
    return new;
  end if;

  perform 1 from public.receipts where id = new.receipt_id for update;
  perform private.staff_retirement_check_receipt_eligible(
    new.receipt_id, sr.company_id, sr.staff_id, sr.project_id, sr.id
  );

  return new;
end $$;


ALTER FUNCTION public.staff_retirement_receipt_live_guard() OWNER TO postgres;

--
-- Name: staff_retirement_status_live_guard(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.staff_retirement_status_live_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_receipt uuid;
begin
  if tg_op = 'UPDATE'
     and private.staff_retirement_is_live(new.status)
     and not private.staff_retirement_is_live(old.status) then
    for v_receipt in
      select receipt_id from public.staff_retirement_receipts where retirement_id = new.id
    loop
      perform private.staff_retirement_check_receipt_eligible(
        v_receipt, new.company_id, new.staff_id, new.project_id, new.id
      );
    end loop;
  end if;
  return new;
end $$;


ALTER FUNCTION public.staff_retirement_status_live_guard() OWNER TO postgres;

--
-- Name: storage_first_uuid_segment(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.storage_first_uuid_segment(name text) RETURNS uuid
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select nullif(split_part(name, '/', 1), '')::uuid
$$;


ALTER FUNCTION public.storage_first_uuid_segment(name text) OWNER TO postgres;

--
-- Name: submit_receipt(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.submit_receipt(p_receipt uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare r record; v_enabled boolean;
begin
  select rc.*, c.approval_flow_enabled into r
    from public.receipts rc join public.companies c on c.id = rc.company_id
   where rc.id = p_receipt for update;
  if not found then raise exception 'receipt not found'; end if;
  if r.company_id <> private.auth_company_id() then raise exception 'not your company'; end if;
  v_enabled := r.approval_flow_enabled;
  if not v_enabled then raise exception 'approval flow is not enabled for this company'; end if;
  if r.uploaded_by <> auth.uid()
     and private.auth_role() not in ('owner','accountant') then
    raise exception 'only the uploader or finance may submit this receipt';
  end if;
  if r.status not in ('pending_review','changes_requested') then
    raise exception 'only a receipt awaiting review or changes can be submitted';
  end if;
  if r.project_id is null or r.category is null or r.payment_method is null then
    raise exception 'choose the project, category and payment source before submitting';
  end if;
  update public.receipts
     set status = 'submitted', submitted_at = now(), submitted_by = auth.uid(),
         decision_reason = null, details_confirmed = true
   where id = p_receipt;
  return 'submitted';
end $$;


ALTER FUNCTION public.submit_receipt(p_receipt uuid) OWNER TO postgres;

--
-- Name: submit_retirement(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.submit_retirement(p_retirement uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  sr record;
  v_actor uuid := auth.uid();
  v_total numeric(14,2);
  v_name text := private.staff_retirement_actor_name(auth.uid());
begin
  select * into sr from public.staff_retirements where id = p_retirement for update;
  if not found then raise exception 'retirement not found' using errcode = 'P0001'; end if;
  if sr.company_id <> private.auth_company_id() then raise exception 'not your company' using errcode = 'P0001'; end if;
  if sr.staff_id <> v_actor then
    raise exception 'only the staff member who owns this retirement can resubmit it'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if sr.status <> 'changes_requested'::public.staff_retirement_status then
    raise exception 'only a changes-requested retirement can be resubmitted'
      using errcode = 'P0001', hint = 'bad_transition';
  end if;

  perform 1
    from public.receipts r
    join public.staff_retirement_receipts srr on srr.receipt_id = r.id
   where srr.retirement_id = p_retirement
   order by r.id for update;

  select coalesce(sum(private.staff_retirement_check_receipt_eligible(
           srr.receipt_id, sr.company_id, sr.staff_id, sr.project_id, p_retirement
         )), 0)
    into v_total
    from public.staff_retirement_receipts srr
   where srr.retirement_id = p_retirement;
  if v_total <= 0 then
    raise exception 'this retirement has no eligible receipts' using errcode = 'P0001', hint = 'nothing_selected';
  end if;

  update public.staff_retirements
     set status = 'submitted'::public.staff_retirement_status,
         total_amount = v_total,
         submitted_at = now(),
         submitted_by = v_actor,
         change_request_note = null,
         change_request_receipt_ids = '{}'::uuid[],
         decision_reason = null,
         updated_at = now()
   where id = p_retirement;

  insert into public.staff_retirement_audit_log
    (retirement_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (p_retirement, sr.company_id, v_actor, 'resubmitted', sr.status, 'submitted'::public.staff_retirement_status,
     jsonb_build_object('total_amount', v_total));

  perform private.staff_retirement_notify_finance(
    sr.company_id, v_actor, 'retirement_resubmitted', 'Staff resubmitted retirement',
    v_name || ' resubmitted "' || sr.title || '" after changes.',
    jsonb_build_object('retirement_id', p_retirement, 'amount', v_total)
  );

  return 'submitted';
end $$;


ALTER FUNCTION public.submit_retirement(p_retirement uuid) OWNER TO postgres;

--
-- Name: switch_active_company(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.switch_active_company(p_company uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_name text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = 'P0001'; end if;
  select c.name into v_name
    from company_members m join companies c on c.id = m.company_id
   where m.profile_id = auth.uid() and m.company_id = p_company
     and m.deactivated_at is null;
  if v_name is null then
    raise exception 'you are not a member of that business'
      using errcode = 'P0001', hint = 'not_a_member';
  end if;
  update profiles set active_company_id = p_company where id = auth.uid();
  return v_name;
end $$;


ALTER FUNCTION public.switch_active_company(p_company uuid) OWNER TO postgres;

--
-- Name: unarchive_product(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.unarchive_product(p_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_company uuid := private.auth_company_id();
  v_actor uuid := auth.uid();
  v_key text := lower(btrim(coalesce(p_key, '')));
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may restore a product'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  delete from product_archives where company_id = v_company and product_key = v_key;
  insert into product_events (company_id, actor_id, action, product_key)
  values (v_company, v_actor, 'unarchive', v_key);
  return jsonb_build_object('archived', false, 'product_key', v_key);
end $$;


ALTER FUNCTION public.unarchive_product(p_key text) OWNER TO postgres;

--
-- Name: verify_company_password(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.verify_company_password(p_company_id uuid, p_password text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare hash text;
begin
  select password_hash into hash from companies where id = p_company_id;
  if hash is null then return false; end if;
  return hash = crypt(p_password, hash);
end;
$$;


ALTER FUNCTION public.verify_company_password(p_company_id uuid, p_password text) OWNER TO postgres;

--
-- Name: void_daily_record(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.void_daily_record(p_daily_record_id uuid, p_reason text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_record public.daily_records;
  v_reason text := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
begin
  if v_actor is null or v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  select * into v_record
    from public.daily_records dr
   where dr.id = p_daily_record_id
   for update;
  if not found or v_record.company_id <> v_company then
    raise exception 'daily record not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_record.status = 'voided' then
    return v_record.id;
  end if;
  if v_role not in ('owner', 'accountant')
     and not (v_role = 'worker' and v_record.recorded_by = v_actor and v_record.status = 'pending_confirmation') then
    raise exception 'only an owner or accountant can void daily records'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if not private.is_meaningful_reason(v_reason) then
    raise exception 'a meaningful reason is required to void a daily record'
      using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;

  update public.daily_records
     set status = 'voided', voided_by = v_actor, voided_at = now(), void_reason = v_reason, updated_at = now()
   where id = v_record.id;

  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, reason, metadata)
  values
    (v_record.id, v_company, v_actor, 'voided', v_record.status, 'voided', v_reason,
     jsonb_build_object('amount', v_record.amount, 'currency', v_record.currency, 'kind', v_record.kind));

  return v_record.id;
end;
$$;


ALTER FUNCTION public.void_daily_record(p_daily_record_id uuid, p_reason text) OWNER TO postgres;

--
-- Name: void_reimbursement_payout(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.void_reimbursement_payout(p_payout uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_actor uuid := auth.uid(); p record; v_ids uuid[]; v_name text;
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may void a reimbursement payout'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if not private.is_meaningful_reason(p_reason) then
    raise exception 'Please write a clear reason with at least 3 meaningful words. This says why the employee is owed the money again.'
      using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;

  select * into p from public.reimbursement_payouts where id = p_payout for update;
  if not found then raise exception 'payout not found' using errcode = 'P0001'; end if;
  if p.company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;
  -- A retry or a double click gets the previous result, not a second void.
  if p.voided_at is not null then
    return jsonb_build_object('status', 'already_voided', 'payout_id', p_payout);
  end if;

  select array_agg(receipt_id) into v_ids from public.reimbursement_payout_items
   where payout_id = p_payout and voided_at is null;

  update public.reimbursement_payouts
     set voided_at = now(), voided_by = v_actor, void_reason = btrim(p_reason)
   where id = p_payout;
  update public.reimbursement_payout_items set voided_at = now()
   where payout_id = p_payout and voided_at is null;

  perform set_config('risip.payout', 'on', true);
  perform set_config('risip.audit_event', 'reimbursement_voided', true);
  perform set_config('risip.audit_actor', v_actor::text, true);
  perform set_config('risip.audit_reason', btrim(p_reason), true);

  update public.receipts set reimbursed_at = null, reimbursed_by = null where id = any(v_ids);

  perform set_config('risip.payout', '', true);
  perform set_config('risip.audit_event', '', true);
  perform set_config('risip.audit_actor', '', true);
  perform set_config('risip.audit_reason', '', true);

  select full_name into v_name from public.profiles where id = v_actor;
  insert into public.app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  select p.company_id, p.paid_to, v_actor, 'reimbursement_voided', 'A payment record was cancelled',
         'TSh ' || trim(to_char(p.total_amount, 'FM999,999,999,999,990'))
           || ' recorded as paid to you was cancelled by ' || coalesce(v_name, 'finance')
           || '. Reason: ' || btrim(p_reason),
         jsonb_build_object('payout_id', p_payout, 'amount', p.total_amount)
   where p.paid_to is distinct from v_actor;

  return jsonb_build_object('status', 'voided', 'payout_id', p_payout,
    'receipts', coalesce(array_length(v_ids, 1), 0));
end $$;


ALTER FUNCTION public.void_reimbursement_payout(p_payout uuid, p_reason text) OWNER TO postgres;

--
-- Name: wa_add_product_unit(text, text, text, numeric, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_add_product_unit(p_phone text, p_name text, p_unit text, p_base_quantity numeric, p_retail numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid; v_company uuid; v_role text; v_currency text;
  v_key text := private.product_key(p_name);
  v_unit_key text := private.product_key(p_unit);
  v_product_name text;
  v_base_unit text;
  v_existing numeric;
  v_is_base boolean := false;
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
    raise exception 'only an owner or accountant can configure product units'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  if v_key is null or v_unit_key is null or length(v_unit_key) > 40 then
    raise exception 'which product and which unit?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if p_base_quantity is null or p_base_quantity <= 0 or p_base_quantity > 1000000 then
    raise exception 'that conversion is out of range' using errcode = 'P0001', hint = 'invalid_conversion';
  end if;
  if p_retail is not null and (p_retail <= 0 or p_retail > 1000000000) then
    raise exception 'that price is out of range' using errcode = 'P0001', hint = 'invalid_price';
  end if;

  select n.product_name into v_product_name
    from public.company_product_names(v_company) n
   where private.product_key(n.product_name) = v_key
   limit 1;
  -- A product the shop has never traded still has to be nameable, because this
  -- is now also how the very first unit of a brand new product is declared.
  v_product_name := coalesce(v_product_name, btrim(p_name));

  select u.unit_name into v_base_unit
    from public.product_units u
   where u.company_id = v_company and u.product_key = v_key and u.is_base
   limit 1;

  if v_base_unit is null then
    -- The first unit becomes the base, and a base unit is by definition one of
    -- itself. Anything else would declare a conversion with nothing to convert
    -- into.
    if abs(p_base_quantity - 1) > 0.000001 then
      raise exception 'the first unit of a product must be its base, with a conversion of one'
        using errcode = 'P0001', hint = 'no_base_unit';
    end if;
    v_is_base := true;
    v_base_unit := btrim(p_unit);
  end if;

  select u.base_quantity into v_existing
    from public.product_units u
   where u.company_id = v_company and u.product_key = v_key and u.unit_key = v_unit_key;
  if v_existing is not null and abs(v_existing - p_base_quantity) > 0.000001 then
    raise exception 'unit % already means % %', btrim(p_unit), v_existing, v_base_unit
      using errcode = 'P0001', hint = 'conversion_conflict';
  end if;

  insert into public.product_units
    (company_id, product_key, product_name, unit_key, unit_name, base_quantity,
     is_base, can_purchase, can_sell, can_count, created_by)
  values
    (v_company, v_key, v_product_name, v_unit_key, btrim(p_unit), round(p_base_quantity, 6),
     v_is_base, false, true, true, v_profile)
  on conflict (company_id, product_key, unit_key) do update
    set can_sell = true, can_count = true;

  if p_retail is not null then
    select currency into v_currency from public.companies where id = v_company;
    insert into public.product_selling_prices
      (company_id, product_key, product_name, retail_price, currency, recorded_by, sale_unit)
    values (v_company, v_key, v_product_name, round(p_retail, 2), v_currency, v_profile, btrim(p_unit));
  end if;

  insert into public.product_unit_audit_log (company_id, product_key, actor_id, action, metadata)
  values (v_company, v_key, v_profile, 'unit_added', jsonb_build_object(
    'unit', btrim(p_unit), 'base_quantity', round(p_base_quantity, 6),
    'base_unit', v_base_unit, 'is_base', v_is_base, 'retail', p_retail));

  return jsonb_build_object(
    'product', v_product_name, 'unit', btrim(p_unit), 'is_base', v_is_base,
    'base_unit', v_base_unit, 'base_quantity', round(p_base_quantity, 6));
end;
$$;


ALTER FUNCTION public.wa_add_product_unit(p_phone text, p_name text, p_unit text, p_base_quantity numeric, p_retail numeric) OWNER TO postgres;

--
-- Name: wa_allow_web_auth_request(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_allow_web_auth_request(p_phone_hash text, p_ip_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
begin
  if p_phone_hash !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid request fingerprint' using errcode = '22023';
  end if;

  -- One lock per phone prevents concurrent serverless invocations from racing
  -- past the count and issuing multiple login links.
  perform pg_advisory_xact_lock(hashtextextended(p_phone_hash, 0));

  if (select count(*) from public.wa_web_auth_request_log
      where phone_hash = p_phone_hash and created_at > now() - interval '15 minutes') >= 5
     or
     (select count(*) from public.wa_web_auth_request_log
      where ip_hash = p_ip_hash and created_at > now() - interval '15 minutes') >= 20 then
    return false;
  end if;

  insert into public.wa_web_auth_request_log (phone_hash, ip_hash)
  values (p_phone_hash, p_ip_hash);

  -- Opportunistic bounded retention; hashes are useful only for short-term abuse control.
  delete from public.wa_web_auth_request_log where created_at < now() - interval '2 days';
  return true;
end;
$_$;


ALTER FUNCTION public.wa_allow_web_auth_request(p_phone_hash text, p_ip_hash text) OWNER TO postgres;

--
-- Name: wa_bucha_reporting_snapshot(uuid, uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_bucha_reporting_snapshot(p_profile_id uuid, p_company_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_role public.user_role;
  v_company uuid;
begin
  select p.active_company_id, m.role into v_company, v_role
  from public.profiles p
  join public.company_members m on m.profile_id = p.id
    and m.company_id = p.active_company_id and m.deactivated_at is null
  where p.id = p_profile_id and p.deactivated_at is null;

  if v_company is null or v_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant can read company reporting'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.bucha_reporting_snapshot(p_from, p_to);
end;
$$;


ALTER FUNCTION public.wa_bucha_reporting_snapshot(p_profile_id uuid, p_company_id uuid, p_from timestamp with time zone, p_to timestamp with time zone) OWNER TO postgres;

--
-- Name: wa_cancel_daily_record_batch(uuid, uuid, uuid[], text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_cancel_daily_record_batch(p_profile_id uuid, p_company_id uuid, p_daily_record_ids uuid[], p_reason text) RETURNS uuid[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid;
  v_id uuid;
  v_ids uuid[] := '{}'::uuid[];
  v_distinct_count integer;
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id
     and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;
  select count(distinct ids.id) into v_distinct_count
    from unnest(p_daily_record_ids) as ids(id);
  if coalesce(cardinality(p_daily_record_ids), 0) < 2
     or cardinality(p_daily_record_ids) > 10
     or v_distinct_count <> cardinality(p_daily_record_ids) then
    raise exception 'a valid batch of unique record ids is required'
      using errcode = 'P0001', hint = 'invalid_batch';
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  foreach v_id in array p_daily_record_ids loop
    v_ids := array_append(v_ids, public.void_daily_record(v_id, p_reason));
  end loop;
  return v_ids;
end;
$$;


ALTER FUNCTION public.wa_cancel_daily_record_batch(p_profile_id uuid, p_company_id uuid, p_daily_record_ids uuid[], p_reason text) OWNER TO postgres;

--
-- Name: wa_cancel_daily_record_draft(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_cancel_daily_record_draft(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_reason text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid;
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id
     and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;
  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.void_daily_record(p_daily_record_id, p_reason);
end;
$$;


ALTER FUNCTION public.wa_cancel_daily_record_draft(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_reason text) OWNER TO postgres;

--
-- Name: wa_claim_daily_nudge(uuid, date, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_claim_daily_nudge(p_identity_id uuid, p_business_date date, p_kind text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_claimed boolean := false;
begin
  insert into public.whatsapp_daily_nudges (identity_id, business_date, kind)
  values (p_identity_id, p_business_date, p_kind)
  on conflict (identity_id, business_date, kind) do nothing;
  get diagnostics v_claimed = row_count;
  return v_claimed;
exception when others then
  -- A nudge is never worth failing a message for.
  return false;
end $$;


ALTER FUNCTION public.wa_claim_daily_nudge(p_identity_id uuid, p_business_date date, p_kind text) OWNER TO postgres;

--
-- Name: wa_clear_ai_context(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_clear_ai_context(p_identity_id uuid, p_company_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_context jsonb;
begin
  v_context := public.wa_resolve_context(p_identity_id);
  if v_context is null
     or (v_context ->> 'company_id')::uuid <> p_company_id then
    raise exception 'WhatsApp context is not active in this company'
      using errcode = 'P0001', hint = 'invalid_scope';
  end if;
  delete from public.whatsapp_ai_messages
   where identity_id = p_identity_id and company_id = p_company_id;
  delete from public.whatsapp_ai_threads
   where identity_id = p_identity_id and company_id = p_company_id;
  return true;
end $$;


ALTER FUNCTION public.wa_clear_ai_context(p_identity_id uuid, p_company_id uuid) OWNER TO postgres;

--
-- Name: wa_close_business_day(uuid, uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, integer, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_close_business_day(p_company_id uuid, p_profile_id uuid, p_business_date date, p_sales numeric, p_cogs numeric, p_profit numeric, p_purchases numeric, p_new_debt numeric, p_debt_paid numeric, p_record_count integer, p_worker_count integer, p_worker_label text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_existing public.daily_closures%rowtype;
  v_company_name text;
  v_queued integer := 0;
  v_expenses numeric := greatest(0, coalesce(p_sales, 0) - coalesce(p_cogs, 0) - coalesce(p_profit, 0));
begin
  if p_company_id is null or p_business_date is null then
    raise exception 'closure scope is required' using errcode = 'P0001', hint = 'invalid_scope';
  end if;

  select * into v_existing
    from public.daily_closures
   where company_id = p_company_id and business_date = p_business_date;
  if found then
    return jsonb_build_object(
      'closed', true, 'already_closed', true,
      'closed_at', v_existing.closed_at, 'queued', 0
    );
  end if;

  select name into v_company_name from public.companies where id = p_company_id;

  insert into public.daily_closures (
    company_id, business_date, closed_by, sales, cogs, profit,
    purchases, new_debt, debt_paid, record_count, worker_count
  ) values (
    p_company_id, p_business_date, p_profile_id,
    coalesce(p_sales, 0), coalesce(p_cogs, 0), coalesce(p_profit, 0),
    coalesce(p_purchases, 0), coalesce(p_new_debt, 0), coalesce(p_debt_paid, 0),
    coalesce(p_record_count, 0), coalesce(p_worker_count, 0)
  )
  on conflict (company_id, business_date) do nothing;

  with owners as (
    select i.id as identity_id, i.phone_e164, i.company_id,
           case when p.lang = 'sw' then 'sw' else 'en' end as lang
      from public.whatsapp_identities i
      join public.profiles p on p.id = i.profile_id
     where i.company_id = p_company_id
       and i.revoked_at is null
       and p.role = 'owner'
       and p.deactivated_at is null
       and i.proactive_notifications_opted_out_at is null
       and i.daily_summary_opted_in_at is not null
       and (p_profile_id is null or p.id <> p_profile_id)
  ), queued as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select o.identity_id, o.company_id, 'daily_summary', p_business_date, 'daily',
           o.phone_e164, o.lang, 'risip_daily_summary',
           jsonb_build_object(
             'business_name', coalesce(v_company_name, 'Risip'),
             'business_date', p_business_date,
             'sales', coalesce(p_sales, 0),
             'expenses', v_expenses,
             'note_key', 'day_closed',
             'note_worker', coalesce(p_worker_label, ''),
             'note_profit', coalesce(p_profit, 0),
             'note_records', coalesce(p_record_count, 0)
           )
      from owners o
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning 1
  )
  select count(*) into v_queued from queued;

  return jsonb_build_object('closed', true, 'already_closed', false, 'queued', v_queued);
end $$;


ALTER FUNCTION public.wa_close_business_day(p_company_id uuid, p_profile_id uuid, p_business_date date, p_sales numeric, p_cogs numeric, p_profit numeric, p_purchases numeric, p_new_debt numeric, p_debt_paid numeric, p_record_count integer, p_worker_count integer, p_worker_label text) OWNER TO postgres;

--
-- Name: wa_company_combos(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_company_combos(p_company_id uuid) RETURNS TABLE(name text, pieces jsonb)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select c.name, c.pieces
    from public.product_combos c
   where c.company_id = p_company_id
   order by c.name;
$$;


ALTER FUNCTION public.wa_company_combos(p_company_id uuid) OWNER TO postgres;

--
-- Name: wa_company_product_sale_units(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_company_product_sale_units(p_company_id uuid) RETURNS TABLE(product_key text, product_name text, unit_key text, unit_name text, base_quantity numeric, retail_price numeric, wholesale_price numeric, wholesale_min_qty numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  with latest as (
    select distinct on (s.product_key, s.sale_unit_key)
      s.product_key, s.sale_unit_key, s.retail_price, s.wholesale_price,
      s.wholesale_min_qty
    from public.product_selling_prices s
    where s.company_id = p_company_id and s.sale_unit_key is not null
    order by s.product_key, s.sale_unit_key, s.effective_from desc, s.created_at desc
  )
  select u.product_key, u.product_name, u.unit_key, u.unit_name, u.base_quantity,
         l.retail_price, l.wholesale_price, l.wholesale_min_qty
    from public.product_units u
    left join latest l on l.product_key = u.product_key and l.sale_unit_key = u.unit_key
   where u.company_id = p_company_id and u.can_sell
   order by u.product_key, u.base_quantity, u.unit_key;
$$;


ALTER FUNCTION public.wa_company_product_sale_units(p_company_id uuid) OWNER TO postgres;

--
-- Name: wa_company_vocabulary(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_company_vocabulary(p_company_id uuid) RETURNS TABLE(kind text, term text, product_name text, meaning text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select v.kind, v.term_display,
         (select n.product_name from public.company_product_names(p_company_id) n
           where private.product_key(n.product_name) = v.product_key limit 1),
         v.meaning
    from public.business_vocabulary v
   where v.company_id = p_company_id
   order by v.kind, v.term_key
   limit 200;
$$;


ALTER FUNCTION public.wa_company_vocabulary(p_company_id uuid) OWNER TO postgres;

--
-- Name: wa_configure_product_units(text, text, text, text, numeric, numeric, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_configure_product_units(p_phone text, p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid;
  v_company uuid;
  v_role text;
begin
  select i.profile_id, p.active_company_id, m.role
    into v_profile, v_company, v_role
    from public.whatsapp_identities i
    join public.profiles p on p.id = i.profile_id
    join public.company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may configure product units'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return private.configure_product_units(
    v_company, v_profile, p_name, p_base_unit, p_purchase_unit,
    p_purchase_size, p_purchase_cost, p_sale_units
  );
end;
$$;


ALTER FUNCTION public.wa_configure_product_units(p_phone text, p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb) OWNER TO postgres;

--
-- Name: wa_confirm_daily_record(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_confirm_daily_record(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid;
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id
     and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;
  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.confirm_daily_record(p_daily_record_id);
end;
$$;


ALTER FUNCTION public.wa_confirm_daily_record(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid) OWNER TO postgres;

--
-- Name: wa_confirm_daily_record_batch(uuid, uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_confirm_daily_record_batch(p_profile_id uuid, p_company_id uuid, p_daily_record_ids uuid[]) RETURNS uuid[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid;
  v_id uuid;
  v_ids uuid[] := '{}'::uuid[];
  v_distinct_count integer;
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id
     and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;
  select count(distinct ids.id) into v_distinct_count
    from unnest(p_daily_record_ids) as ids(id);
  if coalesce(cardinality(p_daily_record_ids), 0) < 2
     or cardinality(p_daily_record_ids) > 10
     or v_distinct_count <> cardinality(p_daily_record_ids) then
    raise exception 'a valid batch of unique record ids is required'
      using errcode = 'P0001', hint = 'invalid_batch';
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  foreach v_id in array p_daily_record_ids loop
    v_ids := array_append(v_ids, public.confirm_daily_record(v_id));
  end loop;
  return v_ids;
end;
$$;


ALTER FUNCTION public.wa_confirm_daily_record_batch(p_profile_id uuid, p_company_id uuid, p_daily_record_ids uuid[]) OWNER TO postgres;

--
-- Name: wa_consume_login_token(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_consume_login_token(p_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v record;
begin
  select * into v from wa_login_tokens
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;
  if not found then
    raise exception 'that link is not valid' using errcode = 'P0001', hint = 'bad_token';
  end if;
  update wa_login_tokens set attempts = attempts + 1 where id = v.id;
  if v.used_at is not null then
    raise exception 'that link has already been used' using errcode = 'P0001', hint = 'used_token';
  end if;
  if v.expires_at < now() then
    raise exception 'that link has expired' using errcode = 'P0001', hint = 'expired_token';
  end if;

  update wa_login_tokens set used_at = now() where id = v.id;
  return jsonb_build_object('profile_id', v.profile_id, 'phone', v.phone_e164);
end $$;


ALTER FUNCTION public.wa_consume_login_token(p_token text) OWNER TO postgres;

--
-- Name: wa_correct_draft_sale_bands(uuid, uuid, uuid, uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_correct_draft_sale_bands(p_identity_id uuid, p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_expected_record jsonb, p_answers jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_convo public.whatsapp_conversations%rowtype;
  v_record public.daily_records%rowtype;
  v_line public.daily_record_lines%rowtype;
  v_answer jsonb; v_plan jsonb := '[]'; v_change jsonb;
  v_price numeric; v_total numeric; v_count integer;
  v_seen text[] := '{}'; v_key text; v_method text; v_snapshot jsonb; v_lines jsonb;
begin
  if not exists (
    select 1 from public.whatsapp_identities i
    join public.profiles p on p.id = i.profile_id and p.deactivated_at is null
    join public.company_members m on m.profile_id = p.id and m.company_id = p_company_id and m.deactivated_at is null
    where i.id = p_identity_id and i.profile_id = p_profile_id
      and i.revoked_at is null and p.active_company_id = p_company_id
  ) then raise exception 'inactive_identity' using errcode = 'P0001'; end if;

  select * into v_convo from public.whatsapp_conversations
    where identity_id = p_identity_id and company_id = p_company_id and profile_id = p_profile_id for update;
  if v_convo.identity_id is null or v_convo.expires_at is null or v_convo.expires_at <= now()
    or v_convo.awaiting <> 'payment_source'
    or v_convo.options->>'kind' <> 'daily_record_confirmation'
    or v_convo.options->>'dailyRecordId' is distinct from p_daily_record_id::text
    or v_convo.options->'record' is distinct from p_expected_record then
    return jsonb_build_object('updated', false, 'reason', 'stale_draft');
  end if;
  select * into v_record from public.daily_records
    where id = p_daily_record_id and company_id = p_company_id and recorded_by = p_profile_id for update;
  if v_record.id is null or v_record.status <> 'pending_confirmation'
    or v_record.kind not in ('sale', 'debt_issued') then
    return jsonb_build_object('updated', false, 'reason', 'not_pending_sale');
  end if;
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) not between 1 and 50 then
    return jsonb_build_object('updated', false, 'reason', 'invalid_answers');
  end if;
  -- Validate every change before touching any row. Prices and totals are read
  -- and calculated here; the model supplies only product and canonical band.
  for v_answer in select value from jsonb_array_elements(p_answers) loop
    if v_answer->>'field' = 'payment_method' then
      if v_method is not null or v_record.kind = 'debt_issued'
        or coalesce(v_answer->>'value', '') not in ('cash', 'mobile_money', 'bank', 'other') then
        return jsonb_build_object('updated', false, 'reason', 'invalid_payment_method');
      end if;
      v_method := v_answer->>'value';
      continue;
    end if;
    if coalesce(v_answer->>'field', '') <> 'price_band'
      or coalesce(v_answer->>'value', '') not in ('retail', 'wholesale') then
      return jsonb_build_object('updated', false, 'reason', 'unsupported_correction');
    end if;
    v_key := private.product_key(v_answer->>'product');
    if v_key is null or v_key = any(v_seen) then
      return jsonb_build_object('updated', false, 'reason', 'missing_or_duplicate_product');
    end if;
    v_seen := array_append(v_seen, v_key);
    select count(*) into v_count from public.daily_record_lines
      where daily_record_id = v_record.id and private.product_key(description) = v_key;
    if v_count <> 1 then return jsonb_build_object('updated', false, 'reason', 'ambiguous_draft_product'); end if;
    select * into v_line from public.daily_record_lines
      where daily_record_id = v_record.id and private.product_key(description) = v_key for update;
    v_price := null;
    if nullif(btrim(v_line.unit), '') is not null then
      select case when v_answer->>'value' = 'retail' then s.unit_price else s.wholesale_price end
        into v_price from public.wa_price_sale_unit(p_company_id, v_line.description, v_line.unit, v_line.quantity, v_record.occurred_at) s;
    else
      select case when v_answer->>'value' = 'retail' then s.retail_price else s.wholesale_price end
        into v_price from public.wa_product_pricing(p_company_id, array[v_line.description], v_record.occurred_at) s;
    end if;
    if v_price is null or v_price <= 0 then return jsonb_build_object('updated', false, 'reason', 'missing_catalogue_price'); end if;
    v_plan := v_plan || jsonb_build_array(jsonb_build_object('id', v_line.id, 'price', v_price, 'band', v_answer->>'value', 'previous_price', v_line.unit_amount));
  end loop;
  if jsonb_array_length(v_plan) = 0 then return jsonb_build_object('updated', false, 'reason', 'no_band_correction'); end if;
  for v_change in select value from jsonb_array_elements(v_plan) loop
    update public.daily_record_lines set unit_amount = (v_change->>'price')::numeric,
      line_total = round(quantity * (v_change->>'price')::numeric, 2)
      where id = (v_change->>'id')::uuid and daily_record_id = v_record.id;
  end loop;
  select sum(line_total), jsonb_agg(jsonb_build_object('description', description, 'quantity', quantity,
    'unit_amount', unit_amount, 'unit', unit) order by line_number)
    into v_total, v_lines from public.daily_record_lines where daily_record_id = v_record.id;
  update public.daily_records set amount = v_total, payment_method = coalesce(v_method, payment_method), updated_at = now()
    where id = v_record.id;
  v_snapshot := (v_convo.options->'record') || jsonb_build_object('amount', v_total, 'lines', v_lines);
  if v_method is not null then v_snapshot := v_snapshot || jsonb_build_object('paymentMethod', v_method); end if;
  update public.whatsapp_conversations set options = jsonb_set(options, '{record}', v_snapshot),
    updated_at = now(), expires_at = now() + interval '30 minutes' where identity_id = p_identity_id;
  insert into public.daily_record_audit_log(daily_record_id, company_id, actor_id, action, from_status, to_status, metadata)
    values(v_record.id, p_company_id, p_profile_id, 'draft_corrected', 'pending_confirmation', 'pending_confirmation',
      jsonb_build_object('changes', v_plan, 'previous_amount', v_record.amount, 'amount', v_total, 'payment_method', v_method));
  return jsonb_build_object('updated', true, 'record', v_snapshot);
end;
$$;


ALTER FUNCTION public.wa_correct_draft_sale_bands(p_identity_id uuid, p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_expected_record jsonb, p_answers jsonb) OWNER TO postgres;

--
-- Name: wa_create_business(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_create_business(p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select private.wa_create_business_classified(
    p_user, p_phone, p_full_name, p_company_name, p_location,
    null, null, null, null
  );
$$;


ALTER FUNCTION public.wa_create_business(p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text) OWNER TO postgres;

--
-- Name: wa_create_business(uuid, text, text, text, text, text, text, numeric, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_create_business(p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text, p_category text, p_subcategory text, p_confidence numeric, p_keywords jsonb) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select private.wa_create_business_classified(
    p_user, p_phone, p_full_name, p_company_name, p_location,
    p_category, p_subcategory, p_confidence, p_keywords
  );
$$;


ALTER FUNCTION public.wa_create_business(p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text, p_category text, p_subcategory text, p_confidence numeric, p_keywords jsonb) OWNER TO postgres;

--
-- Name: wa_create_daily_record_batch_drafts(uuid, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_create_daily_record_batch_drafts(p_profile_id uuid, p_company_id uuid, p_source_message_id text, p_records jsonb) RETURNS uuid[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid; v_item record; v_source text := nullif(btrim(p_source_message_id), '');
  v_id uuid; v_ids uuid[] := '{}'::uuid[]; v_occurred_at timestamptz;
begin
  select p.active_company_id into v_active_company
  from public.profiles p join public.company_members m
    on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
  where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company' using errcode = 'P0001', hint = 'wrong_company';
  end if;
  if v_source is null or length(v_source) > 240 then
    raise exception 'a valid source message id is required' using errcode = 'P0001', hint = 'invalid_source_message_id';
  end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) < 2 or jsonb_array_length(p_records) > 10 then
    raise exception 'a batch must contain between 2 and 10 records' using errcode = 'P0001', hint = 'invalid_batch';
  end if;
  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  for v_item in select value, ordinality from jsonb_array_elements(p_records) with ordinality as items(value, ordinality)
  loop
    if jsonb_typeof(v_item.value) <> 'object' then
      raise exception 'each batch record must be an object' using errcode = 'P0001', hint = 'invalid_batch';
    end if;
    v_occurred_at := coalesce(nullif(btrim(v_item.value->>'occurred_at'), '')::timestamptz, clock_timestamp());
    v_id := public.create_daily_record_draft(
      v_item.value->>'kind', (v_item.value->>'amount')::numeric,
      nullif(btrim(v_item.value->>'party_name'), ''), nullif(btrim(v_item.value->>'description'), ''),
      v_occurred_at, null, 'whatsapp', v_source || '#' || v_item.ordinality::text,
      coalesce(v_item.value->'lines', '[]'::jsonb)
    );
    v_ids := array_append(v_ids, v_id);
  end loop;
  return v_ids;
end;
$$;


ALTER FUNCTION public.wa_create_daily_record_batch_drafts(p_profile_id uuid, p_company_id uuid, p_source_message_id text, p_records jsonb) OWNER TO postgres;

--
-- Name: wa_create_daily_record_draft(uuid, uuid, text, numeric, text, text, timestamp with time zone, text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_create_daily_record_draft(p_profile_id uuid, p_company_id uuid, p_kind text, p_amount numeric, p_party_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_occurred_at timestamp with time zone DEFAULT now(), p_source_message_id text DEFAULT NULL::text, p_lines jsonb DEFAULT '[]'::jsonb, p_payment_method text DEFAULT NULL::text, p_loss_reason text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid;
begin
  -- Tenancy, unchanged: the phone's profile must still be active in the very
  -- company the caller names.
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.create_daily_record_draft(
    p_kind, p_amount, p_party_name, p_description, p_occurred_at, null,
    'whatsapp', p_source_message_id, p_lines, p_payment_method, p_loss_reason
  );
end;
$$;


ALTER FUNCTION public.wa_create_daily_record_draft(p_profile_id uuid, p_company_id uuid, p_kind text, p_amount numeric, p_party_name text, p_description text, p_occurred_at timestamp with time zone, p_source_message_id text, p_lines jsonb, p_payment_method text, p_loss_reason text) OWNER TO postgres;

--
-- Name: wa_create_invite_code(text, text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_create_invite_code(p_phone text, p_role text DEFAULT 'worker'::text, p_days integer DEFAULT 7) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid; v_company uuid; v_role text; v_name text;
  v_code text; v_expires timestamptz;
begin
  select i.profile_id, p.active_company_id, m.role, c.name
    into v_profile, v_company, v_role, v_name
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
    join companies c on c.id = p.active_company_id
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  -- The same rule as the web: only an owner brings somebody into the company.
  if v_role <> 'owner' then
    raise exception 'only the owner may invite somebody'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_role not in ('worker', 'accountant') then
    raise exception 'an invite can only be for a worker or an accountant'
      using errcode = 'P0001', hint = 'bad_role';
  end if;

  -- No 0/O/1/I/L: this gets read aloud and typed on a phone keypad.
  loop
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                             (floor(random() * 31) + 1)::int, 1), '')
      into v_code from generate_series(1, 8);
    exit when not exists (select 1 from company_invite_codes where code = v_code);
  end loop;

  v_expires := now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)));

  -- One use. An invite forwarded on to a group chat should not keep letting
  -- people in, and the owner can always mint another in one message.
  insert into company_invite_codes (company_id, code, role, expires_at, max_uses, created_by)
  values (v_company, v_code, p_role::user_role, v_expires, 1, v_profile);

  return jsonb_build_object(
    'code', v_code,
    'role', p_role,
    'company_name', coalesce(v_name, ''),
    'expires_at', v_expires
  );
end;
$$;


ALTER FUNCTION public.wa_create_invite_code(p_phone text, p_role text, p_days integer) OWNER TO postgres;

--
-- Name: wa_create_supplier_credit_purchase_draft(uuid, uuid, text, jsonb, numeric, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_create_supplier_credit_purchase_draft(p_profile_id uuid, p_company_id uuid, p_supplier_name text, p_lines jsonb, p_amount numeric DEFAULT NULL::numeric, p_occurred_at timestamp with time zone DEFAULT now(), p_source_message_id text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid;
  v_supplier text := nullif(btrim(regexp_replace(coalesce(p_supplier_name, ''), '\s+', ' ', 'g')), '');
  v_message text := nullif(btrim(coalesce(p_source_message_id, '')), '');
  v_amount numeric(14,2) := case when p_amount is null then null else round(p_amount, 2) end;
  v_currency text;
  v_id uuid;
  v_existing public.daily_records%rowtype;
  v_line jsonb;
  v_desc text;
  v_unit text;
  v_key text;
  v_qty numeric;
  v_unit_amount numeric;
  v_sum numeric(14,2) := 0;
  v_normalized_lines jsonb := '[]'::jsonb;
  v_cost public.product_costs%rowtype;
  v_declared public.product_units%rowtype;
  v_matches integer;
begin
  select p.active_company_id into v_active_company
    from public.profiles p join public.company_members m on m.profile_id = p.id
      and m.company_id = p.active_company_id and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company' using errcode = 'P0001', hint = 'wrong_company';
  end if;
  if v_supplier is null or length(v_supplier) > 200 then
    raise exception 'supplier name is required' using errcode = 'P0001', hint = 'supplier_required';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'at least one purchased product is required' using errcode = 'P0001', hint = 'purchase_required';
  end if;
  if v_amount is not null and (v_amount <= 0 or v_amount > 100000000) then
    raise exception 'purchase amount must be positive' using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  if v_message is not null and length(v_message) > 256 then
    raise exception 'source message id is too long' using errcode = 'P0001', hint = 'invalid_source_message_id';
  end if;
  select c.currency into v_currency from public.companies c where c.id = p_company_id;
  if v_currency is null then raise exception 'active company not found' using errcode = 'P0001', hint = 'company_not_found'; end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_desc := nullif(btrim(v_line->>'description'), '');
    v_unit := nullif(btrim(v_line->>'unit'), '');
    v_qty := (v_line->>'quantity')::numeric;
    if v_desc is null or v_qty is null or v_qty <= 0 then
      raise exception 'each purchase line needs a product and positive quantity' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    v_key := private.product_key(v_desc);
    select count(*) into v_matches from public.product_units u
     where u.company_id = p_company_id and u.product_key = v_key and u.can_purchase
       and (v_unit is null or u.unit_key = private.product_key(v_unit) or u.unit_name = v_unit);
    if v_matches > 1 and v_unit is null then
      raise exception 'this product has more than one purchase unit; say which unit' using errcode = 'P0001', hint = 'unit_required';
    end if;
    select * into v_declared from public.product_units u
     where u.company_id = p_company_id and u.product_key = v_key and u.can_purchase
       and (v_unit is null or u.unit_key = private.product_key(v_unit) or u.unit_name = v_unit)
     order by u.is_base desc, u.created_at desc limit 1;
    if v_declared.id is not null then
      v_desc := v_declared.product_name;
      v_unit := v_declared.unit_name;
      v_key := v_declared.product_key;
    end if;
    select * into v_cost from public.product_costs c
     where c.company_id = p_company_id and private.product_key(c.product_key) = v_key
       and (c.unit is null or v_unit is null or private.product_key(c.unit) = private.product_key(v_unit))
       and (p_occurred_at is null or c.effective_from <= p_occurred_at)
     order by (case when v_unit is not null and c.unit is not null then 0 else 1 end), c.effective_from desc, c.created_at desc limit 1;
    if v_cost.id is null and v_amount is null then
      raise exception 'no configured purchase cost for %' , v_desc using errcode = 'P0001', hint = 'purchase_cost_required';
    end if;
    v_unit_amount := coalesce(
      (v_line->>'unit_amount')::numeric,
      v_cost.unit_cost,
      case when v_amount is not null and jsonb_array_length(p_lines) = 1
        then round(v_amount / v_qty, 2) end
    );
    if v_unit_amount is null or v_unit_amount < 0 then
      raise exception 'purchase line cost is invalid' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    v_line := jsonb_build_object('description', v_desc, 'quantity', v_qty, 'unit', v_unit, 'unit_amount', v_unit_amount);
    v_normalized_lines := v_normalized_lines || jsonb_build_array(v_line);
    v_sum := v_sum + round(v_qty * v_unit_amount, 2);
  end loop;
  if v_amount is null then v_amount := v_sum; end if;
  if v_amount <= 0 then raise exception 'purchase amount must be positive' using errcode = 'P0001', hint = 'invalid_amount'; end if;

  -- Rebuild line totals from trusted/server-resolved prices; no model-supplied
  -- total is accepted without matching the line arithmetic.
  if abs(v_sum - v_amount) > 0.01 then
    if jsonb_array_length(p_lines) = 1 and v_amount > 0 then
      v_normalized_lines := jsonb_set(v_normalized_lines, '{0,unit_amount}', to_jsonb(round(v_amount / ((v_normalized_lines->0->>'quantity')::numeric), 2)), false);
    else
      raise exception 'purchase total does not match configured line costs' using errcode = 'P0001', hint = 'purchase_total_mismatch';
    end if;
  end if;
  p_lines := v_normalized_lines;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.create_daily_record_draft(
    'supplier_payable', v_amount, v_supplier, 'Ununuzi wa bidhaa kwa deni', coalesce(p_occurred_at, now()), null,
    'whatsapp', v_message, p_lines, null, null
  );
end;
$$;


ALTER FUNCTION public.wa_create_supplier_credit_purchase_draft(p_profile_id uuid, p_company_id uuid, p_supplier_name text, p_lines jsonb, p_amount numeric, p_occurred_at timestamp with time zone, p_source_message_id text) OWNER TO postgres;

--
-- Name: wa_create_supplier_payment_draft(uuid, uuid, text, numeric, text, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_create_supplier_payment_draft(p_profile_id uuid, p_company_id uuid, p_supplier_name text, p_amount numeric, p_payment_method text, p_occurred_at timestamp with time zone DEFAULT now(), p_source_message_id text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid;
  v_supplier text := nullif(btrim(regexp_replace(coalesce(p_supplier_name, ''), '\s+', ' ', 'g')), '');
  v_key text := private.product_key(v_supplier);
  v_method text := nullif(lower(btrim(coalesce(p_payment_method, ''))), '');
  v_message text := nullif(btrim(coalesce(p_source_message_id, '')), '');
  v_outstanding numeric;
begin
  select p.active_company_id into v_active_company from public.profiles p
    join public.company_members m on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then raise exception 'WhatsApp identity is not active in this company' using errcode = 'P0001', hint = 'wrong_company'; end if;
  if v_supplier is null then raise exception 'supplier name is required' using errcode = 'P0001', hint = 'supplier_required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then raise exception 'payment amount must be positive' using errcode = 'P0001', hint = 'invalid_amount'; end if;
  if v_method = 'deni' then raise exception 'deni is not a payment method' using errcode = 'P0001', hint = 'deni_is_not_a_payment_method'; end if;
  if v_method not in ('cash', 'mobile_money', 'bank', 'other') then raise exception 'payment method is required' using errcode = 'P0001', hint = 'invalid_payment_method'; end if;

  select coalesce(sum(case when r.kind in ('supplier_payable', 'whole_animal_procurement') then r.amount else -r.amount end), 0)
    into v_outstanding from public.daily_records r
   where r.company_id = p_company_id and r.status = 'confirmed' and r.party_name is not null
     and private.product_key(r.party_name) = v_key
     and r.kind in ('supplier_payable', 'supplier_payment', 'whole_animal_procurement')
     and (r.kind <> 'whole_animal_procurement' or r.payment_method is null);
  if p_amount > v_outstanding then
    raise exception 'supplier payment exceeds outstanding balance' using errcode = 'P0001', hint = 'supplier_overpayment';
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.create_daily_record_draft(
    'supplier_payment', round(p_amount, 2), v_supplier, 'Malipo kwa supplier', coalesce(p_occurred_at, now()), null,
    'whatsapp', v_message, '[]'::jsonb, v_method, null
  );
end;
$$;


ALTER FUNCTION public.wa_create_supplier_payment_draft(p_profile_id uuid, p_company_id uuid, p_supplier_name text, p_amount numeric, p_payment_method text, p_occurred_at timestamp with time zone, p_source_message_id text) OWNER TO postgres;

--
-- Name: wa_create_whole_animal_breakdown_draft(uuid, uuid, uuid, jsonb, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_create_whole_animal_breakdown_draft(p_profile_id uuid, p_company_id uuid, p_source_procurement_daily_record_id uuid, p_outputs jsonb, p_occurred_at timestamp with time zone DEFAULT now(), p_source_message_id text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid;
  v_actor uuid := p_profile_id;
  v_source public.daily_records%rowtype;
  v_existing public.daily_records%rowtype;
  v_currency text;
  v_id uuid;
  v_breakdown_count integer;
  v_output jsonb;
  v_line integer;
  v_candidate text;
  v_unit_candidate text;
  v_quantity numeric;
  v_product_key text;
  v_product_name text;
  v_unit_key text;
  v_unit_name text;
  v_base_unit text;
  v_unit_base_quantity numeric;
  v_seen text[] := '{}';
  v_seen_key text;
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;
  if jsonb_typeof(p_outputs) <> 'array' or jsonb_array_length(p_outputs) < 1
     or jsonb_array_length(p_outputs) > 50 then
    raise exception 'breakdown needs between 1 and 50 measured outputs'
      using errcode = 'P0001', hint = 'invalid_outputs';
  end if;

  if nullif(btrim(coalesce(p_source_message_id, '')), '') is not null then
    select * into v_existing
      from public.daily_records r
     where r.company_id = p_company_id
       and r.source_message_id = nullif(btrim(p_source_message_id), '');
    if found then
      if v_existing.kind <> 'whole_animal_breakdown' then
        raise exception 'source message belongs to another record'
          using errcode = 'P0001', hint = 'idempotency_conflict';
      end if;
      return v_existing.id;
    end if;
  end if;

  select * into v_source
    from public.daily_records r
   where r.id = p_source_procurement_daily_record_id
   for update;
  if not found or v_source.company_id <> p_company_id
     or v_source.kind <> 'whole_animal_procurement' then
    raise exception 'whole-animal procurement source was not found'
      using errcode = 'P0001', hint = 'source_not_found';
  end if;
  if v_source.status <> 'confirmed' then
    raise exception 'only a confirmed whole-animal procurement can be broken down'
      using errcode = 'P0001', hint = 'source_not_confirmed';
  end if;
  if exists (
    select 1
      from public.whole_animal_breakdowns b
      join public.daily_records br on br.id = b.daily_record_id
     where b.source_procurement_daily_record_id = v_source.id
       and br.status <> 'voided'
  ) then
    raise exception 'this whole-animal procurement already has an active breakdown'
      using errcode = 'P0001', hint = 'source_already_broken_down';
  end if;

  select c.currency into v_currency from public.companies c where c.id = p_company_id;
  if v_currency is null then
    raise exception 'active company not found' using errcode = 'P0001', hint = 'company_not_found';
  end if;

  v_line := 0;
  for v_output in select value from jsonb_array_elements(p_outputs) loop
    v_line := v_line + 1;
    v_candidate := nullif(btrim(coalesce(v_output->>'product_key', v_output->>'product_name', '')), '');
    v_unit_candidate := nullif(btrim(coalesce(v_output->>'unit_key', v_output->>'unit', '')), '');
    if v_candidate is null then
      raise exception 'every breakdown output needs a product name' using errcode = 'P0001', hint = 'product_required';
    end if;
    if v_unit_candidate is null then
      raise exception 'every breakdown output needs a measured unit' using errcode = 'P0001', hint = 'unit_required';
    end if;
    begin
      v_quantity := (v_output->>'quantity')::numeric;
    exception when invalid_text_representation then
      raise exception 'every breakdown output needs a numeric quantity'
        using errcode = 'P0001', hint = 'quantity_required';
    end;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 1000000 then
      raise exception 'every breakdown output needs a positive measured quantity'
        using errcode = 'P0001', hint = 'quantity_required';
    end if;

    select u.product_key, u.product_name, u.unit_key, u.unit_name,
           u.base_quantity, b.unit_name
      into v_product_key, v_product_name, v_unit_key, v_unit_name,
           v_unit_base_quantity, v_base_unit
      from public.product_units u
      join public.product_units b
        on b.company_id = u.company_id
       and b.product_key = u.product_key
       and b.is_base
     where u.company_id = p_company_id
       and (u.product_key = private.product_key(v_candidate)
            or private.product_key(u.product_name) = private.product_key(v_candidate))
       and (u.unit_key = private.product_key(v_unit_candidate)
            or private.product_key(u.unit_name) = private.product_key(v_unit_candidate))
       and u.can_count
     limit 1;
    if v_product_key is null then
      raise exception 'output product or measured unit is not configured for this company'
        using errcode = 'P0001', hint = 'unknown_product_or_unit';
    end if;
    v_seen_key := v_product_key || '|' || v_unit_key;
    if v_seen_key = any(v_seen) then
      raise exception 'the same product and unit cannot appear twice in one breakdown'
        using errcode = 'P0001', hint = 'duplicate_output';
    end if;
    v_seen := array_append(v_seen, v_seen_key);
  end loop;

  insert into public.daily_records
    (company_id, recorded_by, source, source_message_id, kind, status, amount,
     currency, description, occurred_at)
  values
    (p_company_id, v_actor, 'whatsapp', nullif(btrim(p_source_message_id), ''),
     'whole_animal_breakdown', 'pending_confirmation', v_source.amount,
     v_currency, 'Breakdown ya ' || coalesce(v_source.description, 'ng''ombe mzima'),
     coalesce(p_occurred_at, now()))
  returning id into v_id;

  insert into public.whole_animal_breakdowns
    (daily_record_id, source_procurement_daily_record_id, company_id,
     purchase_total_snapshot, cost_allocation_status, allocated_cost_total,
     occurred_at, created_by)
  values
    (v_id, v_source.id, p_company_id, v_source.amount, 'incomplete', null,
     coalesce(p_occurred_at, now()), v_actor);

  v_line := 0;
  for v_output in select value from jsonb_array_elements(p_outputs) loop
    v_line := v_line + 1;
    v_candidate := nullif(btrim(coalesce(v_output->>'product_key', v_output->>'product_name', '')), '');
    v_unit_candidate := nullif(btrim(coalesce(v_output->>'unit_key', v_output->>'unit', '')), '');
    v_quantity := (v_output->>'quantity')::numeric;
    select u.product_key, u.product_name, u.unit_key, u.unit_name,
           u.base_quantity, b.unit_name
      into v_product_key, v_product_name, v_unit_key, v_unit_name,
           v_unit_base_quantity, v_base_unit
      from public.product_units u
      join public.product_units b
        on b.company_id = u.company_id
       and b.product_key = u.product_key
       and b.is_base
     where u.company_id = p_company_id
       and (u.product_key = private.product_key(v_candidate)
            or private.product_key(u.product_name) = private.product_key(v_candidate))
       and (u.unit_key = private.product_key(v_unit_candidate)
            or private.product_key(u.unit_name) = private.product_key(v_unit_candidate))
       and u.can_count
     limit 1;
    insert into public.whole_animal_breakdown_outputs
      (breakdown_daily_record_id, line_number, product_key, product_name,
       unit_key, unit_name, quantity, base_quantity, base_unit, allocated_cost)
    values
      (v_id, v_line, v_product_key, v_product_name, v_unit_key, v_unit_name,
       v_quantity, round(v_quantity * v_unit_base_quantity, 6), v_base_unit, null);
  end loop;

  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (v_id, p_company_id, v_actor, 'created', null, 'pending_confirmation',
     jsonb_build_object(
       'kind', 'whole_animal_breakdown',
       'source_procurement_daily_record_id', v_source.id,
       'purchase_total_snapshot', v_source.amount,
       'cost_allocation_status', 'incomplete',
       'output_count', jsonb_array_length(p_outputs),
       'source_message_id', nullif(btrim(p_source_message_id), '')
     ));
  return v_id;
end;
$$;


ALTER FUNCTION public.wa_create_whole_animal_breakdown_draft(p_profile_id uuid, p_company_id uuid, p_source_procurement_daily_record_id uuid, p_outputs jsonb, p_occurred_at timestamp with time zone, p_source_message_id text) OWNER TO postgres;

--
-- Name: wa_create_whole_animal_procurement_draft(uuid, uuid, text, integer, numeric, text, text, timestamp with time zone, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_create_whole_animal_procurement_draft(p_profile_id uuid, p_company_id uuid, p_animal_type text, p_animal_count integer, p_purchase_total numeric, p_supplier_name text DEFAULT NULL::text, p_payment_method text DEFAULT NULL::text, p_occurred_at timestamp with time zone DEFAULT now(), p_source_message_id text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid;
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.create_whole_animal_procurement_draft(
    p_animal_type, p_animal_count, p_purchase_total, p_supplier_name,
    p_payment_method, p_occurred_at, 'whatsapp', p_source_message_id,
    p_reference, p_note
  );
end;
$$;


ALTER FUNCTION public.wa_create_whole_animal_procurement_draft(p_profile_id uuid, p_company_id uuid, p_animal_type text, p_animal_count integer, p_purchase_total numeric, p_supplier_name text, p_payment_method text, p_occurred_at timestamp with time zone, p_source_message_id text, p_reference text, p_note text) OWNER TO postgres;

--
-- Name: wa_delete_combo(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_delete_combo(p_phone text, p_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid; v_company uuid; v_role text; v_key text; v_gone int;
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
    raise exception 'only an owner or accountant may remove a combination'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  v_key := private.product_key(btrim(coalesce(p_name, '')));
  delete from public.product_combos
   where company_id = v_company and name_key = v_key;
  get diagnostics v_gone = row_count;
  return jsonb_build_object('deleted', v_gone);
end $$;


ALTER FUNCTION public.wa_delete_combo(p_phone text, p_name text) OWNER TO postgres;

--
-- Name: wa_find_product_barcode(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_find_product_barcode(p_company_id uuid, p_barcode text) RETURNS TABLE(barcode text, product_key text, product_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select b.barcode, b.product_key, b.product_name
  from public.product_barcodes b
  where b.company_id = p_company_id
    and b.barcode = regexp_replace(coalesce(p_barcode, ''), '[^0-9]', '', 'g')
  limit 1;
$$;


ALTER FUNCTION public.wa_find_product_barcode(p_company_id uuid, p_barcode text) OWNER TO postgres;

--
-- Name: wa_forget_business_term(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_forget_business_term(p_phone text, p_term text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;


ALTER FUNCTION public.wa_forget_business_term(p_phone text, p_term text) OWNER TO postgres;

--
-- Name: wa_issue_login_token(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_issue_login_token(p_phone text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_profile uuid; v_token text;
begin
  select profile_id into v_profile from whatsapp_identities
   where phone_e164 = p_phone and revoked_at is null;
  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;

  -- Only the newest link works, so an old message in the chat history is dead.
  update wa_login_tokens set used_at = now()
   where profile_id = v_profile and used_at is null;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into wa_login_tokens (token_hash, profile_id, phone_e164, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_profile, p_phone,
          now() + interval '5 minutes');
  return v_token;
end $$;


ALTER FUNCTION public.wa_issue_login_token(p_phone text) OWNER TO postgres;

--
-- Name: wa_join_by_code(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_join_by_code(p_user uuid, p_phone text, p_code text, p_full_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v record; v_existing uuid;
begin
  select ic.* into v from company_invite_codes ic
   where ic.code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'that code was not recognised' using errcode = 'P0001', hint = 'bad_code';
  end if;
  if v.revoked_at is not null then
    raise exception 'that code has been cancelled' using errcode = 'P0001', hint = 'revoked_code';
  end if;
  if v.expires_at is not null and v.expires_at < now() then
    raise exception 'that code has expired' using errcode = 'P0001', hint = 'expired_code';
  end if;
  if v.max_uses is not null and v.uses >= v.max_uses then
    raise exception 'that code has already been used the maximum number of times'
      using errcode = 'P0001', hint = 'code_used_up';
  end if;

  -- A number already linked to somebody else must never be re-pointed silently.
  select profile_id into v_existing from whatsapp_identities
   where phone_e164 = p_phone and revoked_at is null;
  if v_existing is not null and v_existing <> p_user then
    raise exception 'this number is already linked to another account'
      using errcode = 'P0001', hint = 'already_linked';
  end if;

  if not exists (select 1 from profiles where id = p_user) then
    insert into profiles (id, company_id, active_company_id, full_name, phone, role)
    values (p_user, v.company_id, v.company_id,
            coalesce(nullif(btrim(p_full_name), ''), 'Mfanyakazi'), p_phone, v.role);
  end if;

  insert into company_members (profile_id, company_id, role)
  values (p_user, v.company_id, v.role)
  on conflict (profile_id, company_id) do update set deactivated_at = null;

  update profiles set active_company_id = v.company_id where id = p_user;

  if v_existing is null then
    insert into whatsapp_identities (profile_id, company_id, phone_e164, lang)
    values (p_user, v.company_id, p_phone,
            (select lang from whatsapp_onboarding where phone_e164 = p_phone));
  end if;

  update company_invite_codes set uses = uses + 1 where id = v.id;
  delete from whatsapp_onboarding where phone_e164 = p_phone;

  return jsonb_build_object('company_id', v.company_id, 'role', v.role,
    'company_name', (select name from companies where id = v.company_id));
end $$;


ALTER FUNCTION public.wa_join_by_code(p_user uuid, p_phone text, p_code text, p_full_name text) OWNER TO postgres;

--
-- Name: wa_last_daily_record(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_last_daily_record(p_company_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select case when r.id is null then null else jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'amount', r.amount, 'party_name', r.party_name,
    'description', r.description, 'occurred_at', r.occurred_at,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('description', l.description, 'quantity', l.quantity))
        from public.daily_record_lines l where l.daily_record_id = r.id
    ), '[]'::jsonb)
  ) end
  from (
    select * from public.daily_records
     where company_id = p_company_id and status = 'confirmed'
     order by confirmed_at desc nulls last, created_at desc
     limit 1
  ) r;
$$;


ALTER FUNCTION public.wa_last_daily_record(p_company_id uuid) OWNER TO postgres;

--
-- Name: wa_list_available_whole_animal_procurements(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_list_available_whole_animal_procurements(p_profile_id uuid, p_company_id uuid) RETURNS TABLE(daily_record_id uuid, animal_type text, animal_count integer, purchase_total numeric, occurred_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid;
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;

  return query
  select r.id, p.animal_type, p.animal_count, p.purchase_total_snapshot, r.occurred_at
    from public.daily_records r
    join public.whole_animal_procurements p on p.daily_record_id = r.id
   where r.company_id = p_company_id
     and r.kind = 'whole_animal_procurement'
     and r.status = 'confirmed'
     and not exists (
       select 1
         from public.whole_animal_breakdowns b
         join public.daily_records br on br.id = b.daily_record_id
        where b.source_procurement_daily_record_id = r.id
          and br.status <> 'voided'
     )
   order by r.occurred_at desc, r.created_at desc;
end;
$$;


ALTER FUNCTION public.wa_list_available_whole_animal_procurements(p_profile_id uuid, p_company_id uuid) OWNER TO postgres;

--
-- Name: wa_logout(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_logout(p_phone text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_identity uuid; v_profile uuid; v_company text; v_name text; v_changed int;
begin
  select i.id, i.profile_id into v_identity, v_profile
    from whatsapp_identities i
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_identity is null then
    raise exception 'this number is not linked'
      using errcode = 'P0001', hint = 'not_linked';
  end if;

  -- Read before revoking, so the goodbye can name the business they are leaving.
  select p.full_name, c.name into v_name, v_company
    from profiles p
    left join companies c on c.id = p.active_company_id
   where p.id = v_profile;

  update whatsapp_identities set revoked_at = now(), updated_at = now()
   where id = v_identity;
  get diagnostics v_changed = row_count;

  -- Anything that could still let this number back in, closed in the same breath.
  update whatsapp_link_tokens set revoked_at = now()
   where profile_id = v_profile and used_at is null and revoked_at is null;
  update wa_login_tokens set used_at = now()
   where profile_id = v_profile and used_at is null;

  delete from whatsapp_conversations where identity_id = v_identity;
  delete from whatsapp_ai_threads    where identity_id = v_identity;
  delete from whatsapp_ai_messages   where identity_id = v_identity;
  delete from whatsapp_onboarding    where phone_e164 = p_phone;

  return jsonb_build_object(
    'revoked', v_changed, 'person', v_name, 'company_name', v_company);
end $$;


ALTER FUNCTION public.wa_logout(p_phone text) OWNER TO postgres;

--
-- Name: wa_memberships(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_memberships(p_phone text) RETURNS TABLE(company_id uuid, company_name text, role public.user_role, is_active boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select c.id, c.name, m.role, (p.active_company_id = c.id)
    from whatsapp_identities i
    join company_members m on m.profile_id = i.profile_id and m.deactivated_at is null
    join companies c on c.id = m.company_id
    join profiles p on p.id = i.profile_id
   where i.phone_e164 = p_phone and i.revoked_at is null
   order by c.name;
$$;


ALTER FUNCTION public.wa_memberships(p_phone text) OWNER TO postgres;

--
-- Name: wa_next_cost_prompt(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_next_cost_prompt(p_phone text, p_daily_record_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid; v_company uuid; v_role text;
  v_key text; v_name text; v_unit_price numeric;
begin
  select i.profile_id, p.active_company_id, m.role
    into v_profile, v_company, v_role
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;

  -- No identity, or a role that could not act on the answer: say nothing.
  if v_profile is null or v_role not in ('owner', 'accountant') then
    return null;
  end if;

  select l.description,
         lower(btrim(l.description)),
         l.unit_amount
    into v_name, v_key, v_unit_price
    from daily_record_lines l
    join daily_records r on r.id = l.daily_record_id
   where l.daily_record_id = p_daily_record_id
     and r.company_id = v_company
     and r.kind = 'sale'
     and length(btrim(l.description)) > 1
     -- Nothing already priced.
     and not exists (
       select 1 from product_costs c
        where c.company_id = v_company and c.product_key = lower(btrim(l.description))
     )
     -- Nothing raised in the last week, and nothing refused twice.
     and not exists (
       select 1 from product_cost_prompts q
        where q.company_id = v_company
          and q.product_key = lower(btrim(l.description))
          and q.profile_id = v_profile
          and (q.skipped_count >= 2 or q.asked_at > clock_timestamp() - interval '7 days')
     )
   -- Biggest line first: the product carrying the most money is the one whose
   -- missing price distorts the estimate most.
   order by l.line_total desc
   limit 1;

  if v_key is null then
    return null;
  end if;

  -- Record the ask before returning it, so a crash mid-conversation cannot turn
  -- into the same question twice.
  insert into product_cost_prompts (company_id, product_key, profile_id)
  values (v_company, v_key, v_profile)
  on conflict (company_id, product_key, profile_id)
    do update set asked_at = clock_timestamp();

  return jsonb_build_object(
    'product', v_name,
    'product_key', v_key,
    'selling_price', v_unit_price);
end $$;


ALTER FUNCTION public.wa_next_cost_prompt(p_phone text, p_daily_record_id uuid) OWNER TO postgres;

--
-- Name: wa_pending_record_queue(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_pending_record_queue(p_company_id uuid, p_profile_id uuid) RETURNS TABLE(id uuid, kind text, amount numeric, party_name text, description text, occurred_at timestamp with time zone, lines jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select r.id, r.kind, r.amount, r.party_name, r.description, r.occurred_at,
         coalesce(
           (select jsonb_agg(jsonb_build_object(
              'description', l.description,
              'quantity', l.quantity,
              'line_total', l.line_total
            ) order by l.line_number)
            from public.daily_record_lines l
           where l.daily_record_id = r.id),
           '[]'::jsonb
         ) as lines
    from public.daily_records r
   where r.company_id = p_company_id
     and r.recorded_by = p_profile_id
     and r.status = 'pending_confirmation'
     and r.voided_at is null
     -- TODAY, in the shop's own timezone. A draft from another day belongs to
     -- that day's batch, and that batch is over.
     and (r.created_at at time zone 'Africa/Dar_es_Salaam')::date
         = (clock_timestamp() at time zone 'Africa/Dar_es_Salaam')::date
   order by r.created_at asc
   limit 40;
$$;


ALTER FUNCTION public.wa_pending_record_queue(p_company_id uuid, p_profile_id uuid) OWNER TO postgres;

--
-- Name: wa_place_shop_order(uuid, uuid, jsonb, text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_place_shop_order(p_buyer_company_id uuid, p_supplier_company_id uuid, p_lines jsonb, p_note text DEFAULT NULL::text, p_dry_run boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_supplier_active boolean;
  v_total numeric(14,2) := 0;
  v_order_no text;
  v_order_id uuid;
  v_lines jsonb := '[]'::jsonb;
  v_item jsonb;
  v_row record;
  v_qty numeric(14,3);
  v_price numeric(14,2);
  v_line_total numeric(14,2);
  v_phone text;
  v_note_owner uuid;
  v_proposal jsonb;
begin
  select coalesce((select cs.active from public.company_suppliers cs
                   where cs.company_id = p_supplier_company_id), false)
    into v_supplier_active;
  if not v_supplier_active then
    raise exception 'Supplier is not available for ordering'
      using errcode = 'P0001', hint = 'supplier_not_active';
  end if;
  if p_buyer_company_id = p_supplier_company_id then
    raise exception 'Cannot order from yourself' using errcode = 'P0001', hint = 'same_company';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Order lines are required' using errcode = 'P0001', hint = 'lines_required';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'Too many order lines' using errcode = 'P0001', hint = 'too_many_lines';
  end if;

  -- Rebuild clean lines: only product_key + a bounded quantity survive; the
  -- price is resolved by the supplier's own product_selling_prices.
  for v_item in select value from jsonb_array_elements(p_lines)
  loop
    v_qty := round(coalesce((v_item->>'quantity')::numeric, 0), 3);
    if v_qty <= 0 or v_qty > 1000000 then
      raise exception 'Order quantity must be between 0 and 1000000'
        using errcode = 'P0001', hint = 'bad_quantity';
    end if;
    select w.product_key, w.product_name, w.unit, w.wholesale_price, w.on_hand, w.has_count
      into v_row
      from public.wa_supplier_product_pricing(
        p_supplier_company_id, array[coalesce(v_item->>'product_key', '')]
      ) w
      where w.wholesale_price is not null
      limit 1;
    if v_row is null then
      raise exception 'Product % is not in the supplier''s wholesale catalogue',
        coalesce(nullif(btrim(v_item->>'product_key'), ''), 'that product')
        using errcode = 'P0001', hint = 'product_unpriced_or_unknown';
    end if;
    if v_row.has_count and v_qty > v_row.on_hand then
      raise exception 'Only % of % are on hand at the supplier',
        v_row.on_hand, v_qty
        using errcode = 'P0001', hint = 'stock_insufficient';
    end if;
    v_price := round(v_row.wholesale_price, 2);
    v_line_total := round(v_qty * v_price, 2);
    v_total := v_total + v_line_total;
    v_lines := v_lines || jsonb_build_object(
      'product_key', v_row.product_key,
      'product_name', v_row.product_name,
      'unit', v_row.unit,
      'quantity', v_qty,
      'wholesale_unit_price', v_price,
      'line_total', v_line_total
    );
  end loop;

  -- The number the buyer pays ("lipa namba"): the supplier owner's registered
  -- phone, falling back to their WhatsApp-linked number.
  select coalesce(
      (select p.phone from public.profiles p
        join public.company_members m on m.profile_id = p.id
       where m.company_id = p_supplier_company_id
         and m.role::text = 'owner' and m.deactivated_at is null
         and nullif(btrim(coalesce(p.phone, '')), '') is not null
       order by m.joined_at, p.created_at limit 1),
      (select i.phone_e164 from public.whatsapp_identities i
        join public.profiles p on p.id = i.profile_id
        join public.company_members m2 on m2.profile_id = p.id
       where m2.company_id = p_supplier_company_id
         and m2.role::text = 'owner' and m2.deactivated_at is null
         and i.revoked_at is null and i.opted_out_at is null
       order by m2.joined_at, p.created_at, i.verified_at desc limit 1)
    ) into v_phone;

  v_proposal := jsonb_build_object(
    'buyer_company_id', p_buyer_company_id,
    'supplier_company_id', p_supplier_company_id,
    'status', 'placed',
    'currency', 'TZS',
    'total_wholesale', v_total,
    'note', nullif(btrim(coalesce(p_note, '')), ''),
    'supplier_phone_e164', v_phone,
    'lines', v_lines
  );

  if p_dry_run then
    return jsonb_build_object('dry_run', true) || v_proposal;
  end if;

  v_order_no := 'AGZ-' || to_char(nextval('public.shop_order_no_seq'), 'FM0000');
  insert into public.shop_orders
    (order_no, buyer_company_id, supplier_company_id, status, currency,
     total_wholesale, note, supplier_phone_e164, placed_at)
  values
    (v_order_no, p_buyer_company_id, p_supplier_company_id, 'placed', 'TZS',
     v_total, v_proposal->>'note', v_phone, clock_timestamp())
  returning id into v_order_id;

  insert into public.shop_order_lines
    (order_id, product_key, product_name, unit, quantity, wholesale_unit_price, line_total)
  select v_order_id, l->>'product_key', l->>'product_name', nullif(l->>'unit', ''),
         (l->>'quantity')::numeric, (l->>'wholesale_unit_price')::numeric, (l->>'line_total')::numeric
    from jsonb_array_elements(v_lines) as l;

  insert into public.shop_order_events (order_id, event, actor_company_id, note)
  values (v_order_id, 'placed', p_buyer_company_id,
          'Agizo limewekwa WhatsApp – supplier anathibitisha.');

  -- Web bell for the supplier's owner, who must now fulfil the order.
  if private.shop_owner_of(p_supplier_company_id) is not null then
    insert into public.app_notifications
      (company_id, recipient_id, actor_id, type, title, body, metadata)
    values (
      p_supplier_company_id,
      private.shop_owner_of(p_supplier_company_id),
      null,
      'shop_order',
      'Agizo jipya la bidhaa',
      'Uma milki mpya (' || v_order_no || ') – jumla TSh ' || to_char(v_total, 'FM999G999G999') || '.',
      jsonb_build_object('order_id', v_order_id, 'order_no', v_order_no, 'direction', 'incoming')
    );
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_no', v_order_no,
    'supplier_phone_e164', v_phone,
    'total_wholesale', v_total,
    'currency', 'TZS'
  ) || v_proposal;
end;
$$;


ALTER FUNCTION public.wa_place_shop_order(p_buyer_company_id uuid, p_supplier_company_id uuid, p_lines jsonb, p_note text, p_dry_run boolean) OWNER TO postgres;

--
-- Name: wa_preview_product_rename(text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_preview_product_rename(p_phone text, p_from text, p_to text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_profile uuid; v_company uuid; v_role text;
begin
  select i.profile_id, p.active_company_id, m.role into v_profile, v_company, v_role
    from public.whatsapp_identities i join public.profiles p on p.id = i.profile_id
    join public.company_members m on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then raise exception 'WhatsApp identity not linked' using errcode = 'P0001', hint = 'not_linked'; end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may rename products' using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return private.product_rename_preview(v_company, p_from, p_to);
end;
$$;


ALTER FUNCTION public.wa_preview_product_rename(p_phone text, p_from text, p_to text) OWNER TO postgres;

--
-- Name: wa_price_sale_unit(uuid, text, text, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_price_sale_unit(p_company_id uuid, p_product text, p_unit text, p_quantity numeric) RETURNS TABLE(product_key text, product_name text, unit_name text, base_unit text, base_quantity numeric, unit_price numeric, price_source text, total numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  with wanted as (
    select private.product_key(p_product) as key, private.product_key(p_unit) as unit_key
  ),
  base as (
    select u.unit_name, u.unit_key
      from public.product_units u, wanted w
     where u.company_id = p_company_id and u.product_key = w.key and u.is_base
     limit 1
  ),
  measure as (
    select u.product_key, u.product_name, u.unit_name, u.unit_key, u.base_quantity
      from public.product_units u, wanted w
     where u.company_id = p_company_id and u.product_key = w.key and u.unit_key = w.unit_key
       and u.can_sell
     limit 1
  ),
  -- A price declared for this exact unit, and a price declared for the base.
  priced as (
    select distinct on (s.sale_unit_key) s.sale_unit_key, s.retail_price
      from public.product_selling_prices s, wanted w
     where s.company_id = p_company_id and s.product_key = w.key and s.sale_unit_key is not null
     order by s.sale_unit_key, s.effective_from desc, s.created_at desc
  ),
  own_price as (select p.retail_price from priced p, measure m where p.sale_unit_key = m.unit_key),
  base_price as (select p.retail_price from priced p, base b where p.sale_unit_key = b.unit_key)
  select
    m.product_key,
    m.product_name,
    m.unit_name,
    b.unit_name,
    round(m.base_quantity * p_quantity, 6),
    -- Its own price when it has one; otherwise derived from the base. This is
    -- the whole engine: a kifuko holding a kilo is worth what a kilo is worth,
    -- and a box of twelve packets is worth twelve packets.
    coalesce((select retail_price from own_price),
             round((select retail_price from base_price) * m.base_quantity, 2)),
    case when (select retail_price from own_price) is not null then 'unit' else 'derived' end,
    round(coalesce((select retail_price from own_price),
                   (select retail_price from base_price) * m.base_quantity) * p_quantity, 2)
    from measure m cross join base b
   where p_quantity > 0;
$$;


ALTER FUNCTION public.wa_price_sale_unit(p_company_id uuid, p_product text, p_unit text, p_quantity numeric) OWNER TO postgres;

--
-- Name: wa_price_sale_unit(uuid, text, text, numeric, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_price_sale_unit(p_company_id uuid, p_product text, p_unit text, p_quantity numeric, p_priced_at timestamp with time zone) RETURNS TABLE(product_key text, product_name text, unit_name text, base_unit text, base_quantity numeric, unit_price numeric, wholesale_price numeric, wholesale_min_qty numeric, price_source text, total numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  with wanted as (
    select private.product_key(p_product) as key, private.product_key(p_unit) as unit_key
  ),
  base as (
    select u.unit_name, u.unit_key from public.product_units u, wanted w
    where u.company_id = p_company_id and u.product_key = w.key and u.is_base limit 1
  ),
  measure as (
    select u.product_key, u.product_name, u.unit_name, u.unit_key, u.base_quantity
    from public.product_units u, wanted w
    where u.company_id = p_company_id and u.product_key = w.key
      and u.unit_key = w.unit_key and u.can_sell limit 1
  ),
  priced as (
    select distinct on (s.sale_unit_key) s.sale_unit_key, s.retail_price,
      s.wholesale_price, s.wholesale_min_qty
    from public.product_selling_prices s, wanted w
    where s.company_id = p_company_id and s.product_key = w.key
      and s.sale_unit_key is not null
      and (p_priced_at is null or s.effective_from <= p_priced_at)
    order by s.sale_unit_key, s.effective_from desc, s.created_at desc
  ),
  own_price as (
    select p.retail_price, p.wholesale_price, p.wholesale_min_qty
    from priced p, measure m where p.sale_unit_key = m.unit_key
  ),
  base_price as (
    select p.retail_price from priced p, base b where p.sale_unit_key = b.unit_key
  )
  select m.product_key, m.product_name, m.unit_name, b.unit_name,
    round(m.base_quantity * p_quantity, 6),
    coalesce((select retail_price from own_price),
             round((select retail_price from base_price) * m.base_quantity, 2)),
    (select wholesale_price from own_price),
    (select wholesale_min_qty from own_price),
    case when (select retail_price from own_price) is not null then 'unit' else 'derived' end,
    round(coalesce((select retail_price from own_price),
                   (select retail_price from base_price) * m.base_quantity) * p_quantity, 2)
  from measure m cross join base b
  where p_quantity > 0;
$$;


ALTER FUNCTION public.wa_price_sale_unit(p_company_id uuid, p_product text, p_unit text, p_quantity numeric, p_priced_at timestamp with time zone) OWNER TO postgres;

--
-- Name: wa_product_pricing(uuid, text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_product_pricing(p_company_id uuid, p_product_keys text[]) RETURNS TABLE(product_key text, retail_price numeric, wholesale_price numeric, wholesale_min_qty numeric, unit_cost numeric, avg_unit_price numeric, sold_quantity numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$ select * from public.wa_product_pricing(p_company_id, p_product_keys, null::timestamptz) $$;


ALTER FUNCTION public.wa_product_pricing(p_company_id uuid, p_product_keys text[]) OWNER TO postgres;

--
-- Name: wa_product_pricing(uuid, text[], timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_product_pricing(p_company_id uuid, p_product_keys text[], p_priced_at timestamp with time zone) RETURNS TABLE(product_key text, retail_price numeric, wholesale_price numeric, wholesale_min_qty numeric, unit_cost numeric, avg_unit_price numeric, sold_quantity numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  with wanted as (
    select distinct private.product_key(k) as product_key
      from unnest(coalesce(p_product_keys, '{}'::text[])) as k
     where private.product_key(k) is not null
  ),
  latest_price as (
    select distinct on (private.product_key(s.product_key))
      private.product_key(s.product_key) as product_key,
      s.retail_price, s.wholesale_price, s.wholesale_min_qty
    from public.product_selling_prices s
    where s.company_id = p_company_id
      and s.sale_unit_key is null
      and (p_priced_at is null or s.effective_from <= p_priced_at)
    order by private.product_key(s.product_key), s.effective_from desc, s.created_at desc
  ),
  latest_cost as (
    select distinct on (private.product_key(c.product_key))
      private.product_key(c.product_key) as product_key,
      coalesce(c.base_unit_cost, c.unit_cost) as unit_cost
    from public.product_costs c
    where c.company_id = p_company_id
      and (p_priced_at is null or c.effective_from <= p_priced_at)
    order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc
  ),
  achieved as (
    select private.product_key(l.description) as product_key,
      sum(coalesce(l.stock_base_quantity, l.quantity)) as sold_quantity,
      case when sum(coalesce(l.stock_base_quantity, l.quantity)) > 0
        then round(sum(l.line_total) / sum(coalesce(l.stock_base_quantity, l.quantity)), 2) end as avg_unit_price
    from public.daily_record_lines l
    join public.daily_records r on r.id = l.daily_record_id
    where r.company_id = p_company_id and r.kind = 'sale' and r.status = 'confirmed'
      and private.product_key(l.description) is not null
    group by private.product_key(l.description)
  )
  select w.product_key, p.retail_price, p.wholesale_price, p.wholesale_min_qty,
    c.unit_cost, a.avg_unit_price, coalesce(a.sold_quantity, 0)
  from wanted w
  left join latest_price p on p.product_key = w.product_key
  left join latest_cost c on c.product_key = w.product_key
  left join achieved a on a.product_key = w.product_key;
$$;


ALTER FUNCTION public.wa_product_pricing(p_company_id uuid, p_product_keys text[], p_priced_at timestamp with time zone) OWNER TO postgres;

--
-- Name: wa_queue_close_reminders(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_queue_close_reminders(p_limit integer DEFAULT 100) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_queued integer := 0;
begin
  with candidate as (
    select i.id as identity_id,
           i.company_id,
           i.phone_e164,
           case when p.lang = 'sw' then 'sw' else 'en' end as lang,
           coalesce(nullif(btrim(p.full_name), ''), null) as full_name,
           coalesce(c.timezone, 'Africa/Dar_es_Salaam') as tz,
           (clock_timestamp() at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::date as business_date,
           (clock_timestamp() at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::time as local_time,
           c.closing_time
      from public.whatsapp_identities i
      join public.profiles p on p.id = i.profile_id
      join public.companies c on c.id = i.company_id
     where i.revoked_at is null
       and p.deactivated_at is null
       and i.proactive_notifications_opted_out_at is null
       and c.closing_time is not null
  ), due as (
    select k.*,
           -- What they put in today, and only through WhatsApp: that is what
           -- proves the 24-hour window is open and this may go as plain text.
           (select count(*) from public.daily_records r
             where r.company_id = k.company_id
               and r.recorded_by = (select profile_id from public.whatsapp_identities where id = k.identity_id)
               and r.status = 'confirmed'
               and r.source = 'whatsapp'
               and (r.occurred_at at time zone k.tz)::date = k.business_date) as recorded_today
      from candidate k
     where k.local_time >= (k.closing_time + interval '45 minutes')
  ), eligible as (
    select d.*
      from due d
     where d.recorded_today > 0
       and not exists (
         select 1 from public.daily_closures dc
          where dc.company_id = d.company_id and dc.business_date = d.business_date)
       and not exists (
         select 1 from public.whatsapp_daily_nudges n
          where n.identity_id = d.identity_id
            and n.business_date = d.business_date
            and n.kind = 'close_reminder')
     order by d.company_id, d.identity_id
     limit greatest(1, least(500, p_limit))
  ), marked as (
    -- Claiming the nudge IS the lock: two runs cannot both queue the same
    -- person, whatever the delivery table does afterwards.
    insert into public.whatsapp_daily_nudges (identity_id, business_date, kind)
    select e.identity_id, e.business_date, 'close_reminder' from eligible e
    on conflict (identity_id, business_date, kind) do nothing
    returning identity_id, business_date
  ), queued as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select e.identity_id, e.company_id, 'close_reminder', e.business_date, 'close',
           e.phone_e164, e.lang, 'text',
           jsonb_build_object(
             'channel', 'text',
             'full_name', coalesce(e.full_name, ''),
             'recorded_today', e.recorded_today
           )
      from eligible e
      join marked m on m.identity_id = e.identity_id and m.business_date = e.business_date
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning 1
  )
  select count(*) into v_queued from queued;

  return v_queued;
end $$;


ALTER FUNCTION public.wa_queue_close_reminders(p_limit integer) OWNER TO postgres;

--
-- Name: wa_record_ai_interpretation(uuid, text, text, text, text, text, text, integer, integer, text, text, text, boolean, text, text, text, integer, integer, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_record_ai_interpretation(p_company_id uuid, p_wa_message_id text, p_model text, p_prompt_version text, p_tool_schema_version text, p_chosen_tool text, p_semantic_intent text, p_tool_rounds integer, p_latency_ms integer, p_backend_outcome text, p_rejection_code text, p_clarification_field text, p_fallback_used boolean, p_fallback_reason text, p_provider_failure_code text, p_route text DEFAULT NULL::text, p_cache_read_tokens integer DEFAULT NULL::integer, p_cache_write_tokens integer DEFAULT NULL::integer, p_failure_layer text DEFAULT NULL::text, p_retrieval_status text DEFAULT NULL::text, p_conversation_state text DEFAULT NULL::text, p_tool_result_status text DEFAULT NULL::text, p_tool_failure_code text DEFAULT NULL::text, p_runtime_version text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  delete from public.whatsapp_ai_interpretations where expires_at < now();

  insert into public.whatsapp_ai_interpretations (
    company_id, wa_message_id, model, prompt_version, tool_schema_version,
    chosen_tool, semantic_intent, tool_rounds, latency_ms, backend_outcome,
    rejection_code, clarification_field, fallback_used, fallback_reason,
    provider_failure_code, route, cache_read_tokens, cache_write_tokens,
    failure_layer, retrieval_status, conversation_state, tool_result_status,
    tool_failure_code, runtime_version
  ) values (
    p_company_id, p_wa_message_id, left(p_model, 64), left(p_prompt_version, 48),
    left(p_tool_schema_version, 48), left(p_chosen_tool, 64),
    left(coalesce(nullif(btrim(p_semantic_intent), ''), 'unknown'), 48),
    p_tool_rounds, p_latency_ms, p_backend_outcome, left(p_rejection_code, 64),
    left(p_clarification_field, 48), coalesce(p_fallback_used, false),
    p_fallback_reason, left(p_provider_failure_code, 200), left(p_route, 32),
    greatest(0, p_cache_read_tokens), greatest(0, p_cache_write_tokens),
    left(p_failure_layer, 32), left(p_retrieval_status, 16),
    left(p_conversation_state, 24), left(p_tool_result_status, 16),
    left(p_tool_failure_code, 96), left(p_runtime_version, 64)
  )
  on conflict (wa_message_id) do update set
    model = excluded.model,
    prompt_version = excluded.prompt_version,
    tool_schema_version = excluded.tool_schema_version,
    chosen_tool = excluded.chosen_tool,
    semantic_intent = excluded.semantic_intent,
    tool_rounds = excluded.tool_rounds,
    latency_ms = excluded.latency_ms,
    backend_outcome = excluded.backend_outcome,
    rejection_code = excluded.rejection_code,
    clarification_field = excluded.clarification_field,
    fallback_used = excluded.fallback_used,
    fallback_reason = excluded.fallback_reason,
    provider_failure_code = excluded.provider_failure_code,
    route = excluded.route,
    cache_read_tokens = excluded.cache_read_tokens,
    cache_write_tokens = excluded.cache_write_tokens,
    failure_layer = excluded.failure_layer,
    retrieval_status = excluded.retrieval_status,
    conversation_state = excluded.conversation_state,
    tool_result_status = excluded.tool_result_status,
    tool_failure_code = excluded.tool_failure_code,
    runtime_version = excluded.runtime_version;
exception when others then
  -- Operations telemetry must never prevent a merchant from receiving a reply.
  null;
end $$;


ALTER FUNCTION public.wa_record_ai_interpretation(p_company_id uuid, p_wa_message_id text, p_model text, p_prompt_version text, p_tool_schema_version text, p_chosen_tool text, p_semantic_intent text, p_tool_rounds integer, p_latency_ms integer, p_backend_outcome text, p_rejection_code text, p_clarification_field text, p_fallback_used boolean, p_fallback_reason text, p_provider_failure_code text, p_route text, p_cache_read_tokens integer, p_cache_write_tokens integer, p_failure_layer text, p_retrieval_status text, p_conversation_state text, p_tool_result_status text, p_tool_failure_code text, p_runtime_version text) OWNER TO postgres;

--
-- Name: wa_record_obligation_payment(uuid, uuid, uuid, numeric, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_record_obligation_payment(p_company_id uuid, p_profile_id uuid, p_obligation_id uuid, p_amount numeric, p_daily_record_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_obligation public.recurring_obligations%rowtype;
  v_today date := (clock_timestamp() at time zone 'Africa/Dar_es_Salaam')::date;
  v_covers_from date;
  v_covers_to date;
  v_paid numeric;
  v_outstanding numeric;
begin
  select * into v_obligation
    from public.recurring_obligations
   where id = p_obligation_id and company_id = p_company_id;
  if not found then
    raise exception 'no such recurring cost for this company'
      using errcode = 'P0001', hint = 'unknown_obligation';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'a payment needs an amount' using errcode = 'P0001', hint = 'invalid_amount';
  end if;

  v_covers_from := v_obligation.next_due_on;
  v_covers_to := (v_obligation.next_due_on + (v_obligation.period_months || ' months')::interval)::date - 1;

  insert into public.obligation_payments
    (obligation_id, company_id, amount, covers_from, covers_to, paid_on, recorded_by, daily_record_id)
  values
    (p_obligation_id, p_company_id, p_amount, v_covers_from, v_covers_to, v_today,
     p_profile_id, p_daily_record_id);

  select coalesce(sum(amount), 0) into v_paid
    from public.obligation_payments
   where obligation_id = p_obligation_id and covers_from = v_covers_from;
  v_outstanding := greatest(0, v_obligation.amount - v_paid);

  -- The due date only moves once the period is actually paid for. A half
  -- payment must not make the reminder go quiet.
  if v_outstanding <= 0 then
    update public.recurring_obligations
       set next_due_on = (v_obligation.next_due_on + (v_obligation.period_months || ' months')::interval)::date
     where id = p_obligation_id;
  end if;

  return jsonb_build_object(
    'paid', p_amount,
    'covers_from', v_covers_from,
    'covers_to', v_covers_to,
    'outstanding', v_outstanding,
    'period_settled', v_outstanding <= 0
  );
end $$;


ALTER FUNCTION public.wa_record_obligation_payment(p_company_id uuid, p_profile_id uuid, p_obligation_id uuid, p_amount numeric, p_daily_record_id uuid) OWNER TO postgres;

--
-- Name: wa_record_stock_count(text, text, numeric, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_record_stock_count(p_phone text, p_name text, p_quantity numeric, p_unit text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid;
  v_company uuid;
  v_key text := private.product_key(p_name);
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  v_declared public.product_units;
  v_previous_base numeric;
  v_previous_reported numeric;
  v_id uuid;
begin
  select i.profile_id, p.active_company_id
    into v_profile, v_company
    from public.whatsapp_identities i
    join public.profiles p on p.id = i.profile_id
    join public.company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this count for?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'a count cannot be negative' using errcode = 'P0001', hint = 'invalid_quantity';
  end if;
  if exists (select 1 from public.product_units where company_id = v_company and product_key = v_key) then
    if v_unit is null then
      raise exception 'this product has declared units; say which unit was counted'
        using errcode = 'P0001', hint = 'unit_required';
    end if;
    select * into v_declared from private.product_declared_unit(v_company, v_key, v_unit);
    if v_declared.id is null or not v_declared.can_count then
      raise exception 'the stated unit cannot be used to count this product'
        using errcode = 'P0001', hint = 'unknown_count_unit';
    end if;
  end if;
  select on_hand into v_previous_base from public.wa_stock_on_hand(v_company, p_name) limit 1;
  v_previous_reported := case
    when v_previous_base is null then null
    when v_declared.id is null then v_previous_base
    else round(v_previous_base / v_declared.base_quantity, 6)
  end;
  insert into public.stock_counts
    (company_id, product_key, product_name, quantity, unit, counted_by)
  values (v_company, v_key, btrim(p_name), round(p_quantity, 6), v_unit, v_profile)
  returning id into v_id;
  return jsonb_build_object(
    'id', v_id, 'product', btrim(p_name), 'quantity', round(p_quantity, 6),
    'unit', v_unit, 'previous', v_previous_reported);
end;
$$;


ALTER FUNCTION public.wa_record_stock_count(p_phone text, p_name text, p_quantity numeric, p_unit text) OWNER TO postgres;

--
-- Name: wa_record_stock_counts(text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_record_stock_counts(p_phone text, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid; v_company uuid; v_name text;
  v_item jsonb; v_product text; v_key text; v_qty numeric; v_unit text; v_existing text;
  v_saved int := 0;
begin
  select i.profile_id, p.active_company_id, c.name
    into v_profile, v_company, v_name
    from public.whatsapp_identities i
    join public.profiles p on p.id = i.profile_id
    join public.company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
    join public.companies c on c.id = p.active_company_id
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no counts were given' using errcode = 'P0001', hint = 'no_product';
  end if;
  if jsonb_array_length(p_items) > 120 then
    raise exception 'too many counts in one message' using errcode = 'P0001', hint = 'too_many';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := btrim(coalesce(v_item->>'product', ''));
    v_key := private.product_key(v_product);
    v_qty := (v_item->>'quantity')::numeric;
    v_unit := nullif(btrim(coalesce(v_item->>'unit', '')), '');
    if v_key is null or length(v_key) < 2 then
      raise exception 'a product name is missing' using errcode='P0001', hint='no_product';
    end if;
    if v_qty is null or v_qty < 0 then
      raise exception 'a count cannot be negative' using errcode='P0001', hint='invalid_quantity';
    end if;
    v_existing := private.product_unit(v_company, v_key);
    if v_unit is not null and v_existing is not null and lower(v_unit) <> lower(v_existing) then
      raise exception 'this product is measured in % — count it in %, not in %',
        v_existing, v_existing, v_unit using errcode='P0001', hint='unit_mismatch';
    end if;
    insert into public.stock_counts
      (company_id, product_key, product_name, quantity, unit, counted_by, note)
    values (v_company, v_key, v_product, round(v_qty, 3), coalesce(v_unit, v_existing),
            v_profile, 'WhatsApp bulk count');
    v_saved := v_saved + 1;
  end loop;
  return jsonb_build_object('saved', v_saved, 'company_name', v_name);
end;
$$;


ALTER FUNCTION public.wa_record_stock_counts(p_phone text, p_items jsonb) OWNER TO postgres;

--
-- Name: wa_recurring_obligations(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_recurring_obligations(p_company_id uuid) RETURNS TABLE(id uuid, kind text, label text, amount numeric, period_months integer, next_due_on date, days_until_due integer, paid_for_current_period numeric, outstanding numeric, last_paid_on date, previous_amount numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  with live as (
    select o.*
      from public.recurring_obligations o
     where o.company_id = p_company_id
       and o.superseded_at is null
  ), paid as (
    select p.obligation_id,
           sum(p.amount) filter (
             where p.covers_to >= (clock_timestamp() at time zone 'Africa/Dar_es_Salaam')::date
           ) as current_paid,
           max(p.paid_on) as last_paid_on
      from public.obligation_payments p
     where p.company_id = p_company_id
     group by p.obligation_id
  ), prior as (
    select distinct on (o.kind, coalesce(o.label, ''))
           o.kind, coalesce(o.label, '') as label_key, o.amount
      from public.recurring_obligations o
     where o.company_id = p_company_id
       and o.superseded_at is not null
     order by o.kind, coalesce(o.label, ''), o.superseded_at desc
  )
  select l.id, l.kind, l.label, l.amount, l.period_months, l.next_due_on,
         (l.next_due_on - (clock_timestamp() at time zone 'Africa/Dar_es_Salaam')::date)::integer
           as days_until_due,
         coalesce(pd.current_paid, 0) as paid_for_current_period,
         greatest(0, l.amount - coalesce(pd.current_paid, 0)) as outstanding,
         pd.last_paid_on,
         pr.amount as previous_amount
    from live l
    left join paid pd on pd.obligation_id = l.id
    left join prior pr on pr.kind = l.kind and pr.label_key = coalesce(l.label, '')
   order by l.next_due_on asc;
$$;


ALTER FUNCTION public.wa_recurring_obligations(p_company_id uuid) OWNER TO postgres;

--
-- Name: wa_release_whatsapp_turn(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_release_whatsapp_turn(p_phone text, p_owner_token uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  delete from public.whatsapp_turn_locks
   where phone_e164 = p_phone
     and owner_token = p_owner_token
  returning true;
$$;


ALTER FUNCTION public.wa_release_whatsapp_turn(p_phone text, p_owner_token uuid) OWNER TO postgres;

--
-- Name: wa_rename_product(text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_rename_product(p_phone text, p_from text, p_to text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_profile uuid; v_company uuid; v_role text;
begin
  select i.profile_id, p.active_company_id, m.role into v_profile, v_company, v_role
    from public.whatsapp_identities i join public.profiles p on p.id = i.profile_id
    join public.company_members m on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then raise exception 'WhatsApp identity not linked' using errcode = 'P0001', hint = 'not_linked'; end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may rename products' using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return private.rename_product_for_actor(v_company, v_profile, p_from, p_to, p_reason);
end;
$$;


ALTER FUNCTION public.wa_rename_product(p_phone text, p_from text, p_to text, p_reason text) OWNER TO postgres;

--
-- Name: wa_renew_whatsapp_turn(text, uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_renew_whatsapp_turn(p_phone text, p_owner_token uuid, p_lease_seconds integer DEFAULT 300) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  update public.whatsapp_turn_locks
     set lease_until = clock_timestamp() + (greatest(30, least(600, p_lease_seconds)) || ' seconds')::interval,
         updated_at = clock_timestamp()
   where phone_e164 = p_phone
     and owner_token = p_owner_token
  returning true;
$$;


ALTER FUNCTION public.wa_renew_whatsapp_turn(p_phone text, p_owner_token uuid, p_lease_seconds integer) OWNER TO postgres;

--
-- Name: wa_resolve_company_product_read(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_resolve_company_product_read(p_profile_id uuid, p_company_id uuid, p_name text) RETURNS TABLE(product_key text, product_name text, match_kind text, match_score numeric, ambiguous boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid;
  v_key text := private.product_key(p_name);
  v_alias_product text;
  v_alias_name text;
  v_exact boolean;
  v_tail_matches integer;
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
    -- 2. The word exactly as the shop taught it.
    select v.product_key into v_alias_product
      from public.business_vocabulary v
     where v.company_id = p_company_id
       and v.term_key = v_key
       and v.kind = 'product_alias'
       and v.product_key is not null
     limit 1;

    -- 3. The same vocabulary, reached from the tail of the phrase. Only when
    --    exactly one configured term ends this way; otherwise the shop's words
    --    have not settled it and the resolver below is the right place to ask.
    if v_alias_product is null then
      select count(*) into v_tail_matches
        from public.business_vocabulary v
       where v.company_id = p_company_id
         and v.kind = 'product_alias'
         and v.product_key is not null
         and v.term_key like '% ' || v_key;
      if v_tail_matches = 1 then
        select v.product_key into v_alias_product
          from public.business_vocabulary v
         where v.company_id = p_company_id
           and v.kind = 'product_alias'
           and v.product_key is not null
           and v.term_key like '% ' || v_key
         limit 1;
      end if;
    end if;

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
$$;


ALTER FUNCTION public.wa_resolve_company_product_read(p_profile_id uuid, p_company_id uuid, p_name text) OWNER TO postgres;

--
-- Name: wa_resolve_context(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_resolve_context(p_identity_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select jsonb_build_object(
    'identity_id', i.id,
    'profile_id', p.id,
    'profile_name', p.full_name,
    'company_id', c.id,
    'company_name', c.name,
    'role', m.role,
    'lang', coalesce(i.lang, p.lang, 'en'),
    'approval_flow_enabled', coalesce(c.approval_flow_enabled, false),
    'reversal_enabled', coalesce(c.reversal_enabled, false),
    'payouts_enabled', coalesce(c.payouts_enabled, false)
  )
  from public.whatsapp_identities i
  join public.profiles p
    on p.id = i.profile_id
   and p.deactivated_at is null
  join public.company_members m
    on m.profile_id = p.id
   and m.company_id = p.active_company_id
   and m.deactivated_at is null
  join public.companies c on c.id = m.company_id
  where i.id = p_identity_id
    and i.revoked_at is null
    and i.opted_out_at is null;
$$;


ALTER FUNCTION public.wa_resolve_context(p_identity_id uuid) OWNER TO postgres;

--
-- Name: wa_save_business_term(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_save_business_term(p_phone text, p_kind text, p_term text, p_product text DEFAULT NULL::text, p_meaning text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;


ALTER FUNCTION public.wa_save_business_term(p_phone text, p_kind text, p_term text, p_product text, p_meaning text) OWNER TO postgres;

--
-- Name: wa_save_combo(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_save_combo(p_phone text, p_name text, p_pieces jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid; v_company uuid; v_role text;
  v_name text; v_key text; v_piece jsonb; v_count int;
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
    raise exception 'only an owner or accountant may save a combination'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  v_key := private.product_key(v_name);
  if v_key is null or length(v_key) < 2 then
    raise exception 'that name cannot be used' using errcode = 'P0001', hint = 'bad_name';
  end if;

  if jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'no pieces given' using errcode = 'P0001', hint = 'empty';
  end if;
  v_count := jsonb_array_length(p_pieces);
  if v_count < 1 or v_count > 6 then
    raise exception 'a combination is one to six products'
      using errcode = 'P0001', hint = 'bad_pieces';
  end if;

  -- Every piece must be a product this company actually has. A combination
  -- pointing at a name nobody sells would price a sale from nothing.
  for v_piece in select * from jsonb_array_elements(p_pieces) loop
    if not exists (
      select 1 from public.company_product_names(v_company) n
       where private.product_key(n.product_name) = private.product_key(v_piece ->> 'key')
    ) then
      raise exception 'not a product of this business: %', coalesce(v_piece ->> 'name', v_piece ->> 'key')
        using errcode = 'P0001', hint = 'unknown_product';
    end if;
    if coalesce((v_piece ->> 'quantity')::numeric, 0) <= 0 then
      raise exception 'a piece needs a quantity above zero'
        using errcode = 'P0001', hint = 'bad_quantity';
    end if;
  end loop;

  insert into public.product_combos (company_id, name, name_key, pieces, created_by)
  values (v_company, v_name, v_key, p_pieces, v_profile)
  on conflict (company_id, name_key)
  do update set pieces = excluded.pieces, name = excluded.name, updated_at = now();

  return jsonb_build_object('saved', true, 'name', v_name, 'pieces', v_count);
end $$;


ALTER FUNCTION public.wa_save_combo(p_phone text, p_name text, p_pieces jsonb) OWNER TO postgres;

--
-- Name: wa_search_suppliers(text, uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_search_suppliers(p_term text, p_exclude_company_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10) RETURNS TABLE(supplier_company_id uuid, company_name text, hq_location text, product_key text, product_name text, unit text, wholesale_price numeric, wholesale_min_qty numeric, on_hand numeric, has_count boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  with tokens as (
    select distinct btrim(t) as token
      from regexp_split_to_table(btrim(coalesce(p_term, '')), '[\s|]+') as t
     where length(btrim(t)) >= 2
  ),
  candidates as (
    -- Most recent wholesale price per (product, supplier). DISTINCT ON only; no
    -- aggregate, which is invalid here without a GROUP BY.
    select distinct on (private.product_key(s.product_key), s.company_id)
      s.company_id,
      private.product_key(s.product_key) as product_key,
      s.product_name,
      s.wholesale_price,
      s.wholesale_min_qty
    from product_selling_prices s
    where s.wholesale_price is not null
      and exists (
        select 1 from tokens tk
        where position(lower(tk.token) in lower(private.product_key(s.product_key))) > 0
           or position(lower(tk.token) in lower(s.product_name)) > 0
      )
    order by private.product_key(s.product_key), s.company_id, s.effective_from desc, s.created_at desc
  )
  select
    c.id as supplier_company_id,
    c.name as company_name,
    c.hq_location,
    k.product_key,
    k.product_name,
    private.product_unit(c.id, k.product_key) as unit,
    k.wholesale_price,
    k.wholesale_min_qty,
    coalesce(h.on_hand, 0) as on_hand,
    coalesce(h.has_count, false) as has_count
  from candidates k
  join public.companies c on c.id = k.company_id
  join public.company_suppliers cs on cs.company_id = c.id and cs.active
  left join lateral wa_stock_on_hand(c.id, k.product_key) h on true
  where c.id is distinct from p_exclude_company_id
  order by c.name, k.product_key
  limit greatest(1, least(p_limit, 25));
$$;


ALTER FUNCTION public.wa_search_suppliers(p_term text, p_exclude_company_id uuid, p_limit integer) OWNER TO postgres;

--
-- Name: wa_set_business_hours(text, time without time zone, time without time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_set_business_hours(p_phone text, p_opening_time time without time zone, p_closing_time time without time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_company uuid;
  v_role text;
  v_name text;
begin
  select p.active_company_id, m.role::text, c.name
    into v_company, v_role, v_name
    from public.whatsapp_identities i
    join public.profiles p on p.id = i.profile_id
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
    join public.companies c on c.id = p.active_company_id
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_company is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only finance may set business hours'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_opening_time is null or p_closing_time is null then
    raise exception 'both business hours are required'
      using errcode = 'P0001', hint = 'empty';
  end if;

  update public.companies
     set opening_time = p_opening_time,
         opening_time_asked_at = coalesce(opening_time_asked_at, clock_timestamp()),
         closing_time = p_closing_time,
         closing_time_asked_at = coalesce(closing_time_asked_at, clock_timestamp())
   where id = v_company;

  return jsonb_build_object(
    'company_name', coalesce(v_name, ''),
    'opening_time', to_char(p_opening_time, 'HH24:MI'),
    'closing_time', to_char(p_closing_time, 'HH24:MI')
  );
end;
$$;


ALTER FUNCTION public.wa_set_business_hours(p_phone text, p_opening_time time without time zone, p_closing_time time without time zone) OWNER TO postgres;

--
-- Name: wa_set_closing_time(text, time without time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_set_closing_time(p_phone text, p_time time without time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid; v_company uuid; v_role text; v_name text;
begin
  select i.profile_id, p.active_company_id, m.role, c.name
    into v_profile, v_company, v_role, v_name
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
    join companies c on c.id = p.active_company_id
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only finance may set the closing time'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_time is null then
    raise exception 'no time given' using errcode = 'P0001', hint = 'empty';
  end if;

  update companies
     set closing_time = p_time,
         closing_time_asked_at = coalesce(closing_time_asked_at, clock_timestamp())
   where id = v_company;

  return jsonb_build_object('closing_time', to_char(p_time, 'HH24:MI'),
                            'company_name', coalesce(v_name, ''));
end;
$$;


ALTER FUNCTION public.wa_set_closing_time(p_phone text, p_time time without time zone) OWNER TO postgres;

--
-- Name: wa_set_draft_payment_method(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_set_draft_payment_method(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_payment_method text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid;
  v_method text := nullif(lower(btrim(coalesce(p_payment_method, ''))), '');
  v_record public.daily_records%rowtype;
begin
  -- Tenancy, exactly as wa_confirm_daily_record derives it.
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;

  if v_method = 'deni' then
    raise exception 'credit is recorded as debt_issued, not as a payment method'
      using errcode = 'P0001', hint = 'deni_is_not_a_payment_method';
  end if;
  if v_method is null or v_method not in ('cash', 'mobile_money', 'bank', 'other') then
    raise exception 'unsupported payment method' using errcode = 'P0001', hint = 'invalid_payment_method';
  end if;

  select * into v_record
    from public.daily_records
   where id = p_daily_record_id and company_id = p_company_id
   for update;

  if v_record.id is null then
    return jsonb_build_object('updated', false, 'reason', 'not_found');
  end if;
  -- Only a draft. A confirmed record is history.
  if v_record.status <> 'pending_confirmation' then
    return jsonb_build_object('updated', false, 'reason', 'not_pending', 'status', v_record.status);
  end if;
  -- A payment method on a debt would contradict the kind itself.
  if v_record.kind = 'debt_issued' then
    return jsonb_build_object('updated', false, 'reason', 'kind_is_credit');
  end if;

  update public.daily_records
     set payment_method = v_method, updated_at = now()
   where id = v_record.id;

  return jsonb_build_object('updated', true, 'payment_method', v_method, 'kind', v_record.kind);
end;
$$;


ALTER FUNCTION public.wa_set_draft_payment_method(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_payment_method text) OWNER TO postgres;

--
-- Name: wa_set_language(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_set_language(p_phone text, p_lang text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_profile uuid;
begin
  if p_lang not in ('en', 'sw') then raise exception 'unknown language %', p_lang; end if;
  update whatsapp_identities set lang = p_lang, updated_at = now()
   where phone_e164 = p_phone and revoked_at is null
   returning profile_id into v_profile;
  -- Sync to the person, so the web opens in the language they chose on the phone.
  if v_profile is not null then
    update profiles set lang = p_lang where id = v_profile;
  end if;
  update whatsapp_onboarding set lang = p_lang, updated_at = now() where phone_e164 = p_phone;
  return p_lang;
end $$;


ALTER FUNCTION public.wa_set_language(p_phone text, p_lang text) OWNER TO postgres;

--
-- Name: wa_set_product_cost(text, text, numeric, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_set_product_cost(p_phone text, p_name text, p_unit_cost numeric, p_unit text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid; v_company uuid; v_role user_role;
  v_key text; v_currency text; v_prev numeric; v_id uuid;
begin
  select i.profile_id into v_profile from whatsapp_identities i
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;

  select p.active_company_id, m.role into v_company, v_role
    from profiles p
    join company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = v_profile;
  if v_company is null then
    raise exception 'no active business' using errcode = 'P0001', hint = 'no_active_company';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only the owner may set a buying price'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  v_key := lower(btrim(coalesce(p_name, '')));
  if length(v_key) < 2 then
    raise exception 'which product is this price for?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if p_unit_cost is null or p_unit_cost <= 0 then
    raise exception 'a buying price must be greater than zero'
      using errcode = 'P0001', hint = 'invalid_cost';
  end if;

  select currency into v_currency from companies where id = v_company;

  select unit_cost into v_prev from product_costs
   where company_id = v_company and product_key = v_key
   order by effective_from desc, created_at desc limit 1;

  insert into product_costs
    (company_id, product_key, product_name, unit, unit_cost, currency, recorded_by)
  values
    (v_company, v_key, btrim(p_name), nullif(btrim(p_unit), ''), round(p_unit_cost, 2),
     v_currency, v_profile)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'product', btrim(p_name), 'unit', nullif(btrim(p_unit), ''),
    'unit_cost', round(p_unit_cost, 2), 'previous_cost', v_prev,
    'company_name', (select name from companies where id = v_company));
end $$;


ALTER FUNCTION public.wa_set_product_cost(p_phone text, p_name text, p_unit_cost numeric, p_unit text) OWNER TO postgres;

--
-- Name: wa_set_product_costs(text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_set_product_costs(p_phone text, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid; v_company uuid; v_role text; v_currency text; v_name text;
  v_item jsonb; v_product text; v_key text; v_cost numeric; v_unit text;
  v_saved int := 0;
begin
  select i.profile_id, p.active_company_id, m.role, c.name, c.currency
    into v_profile, v_company, v_role, v_name, v_currency
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
    join companies c on c.id = p.active_company_id
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked'
      using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only finance may set a buying price'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no prices were given' using errcode = 'P0001', hint = 'no_product';
  end if;
  if jsonb_array_length(p_items) > 60 then
    raise exception 'too many prices in one message' using errcode = 'P0001', hint = 'too_many';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := btrim(coalesce(v_item->>'product', ''));
    v_key := lower(v_product);
    v_cost := (v_item->>'unit_cost')::numeric;
    v_unit := nullif(btrim(coalesce(v_item->>'unit', '')), '');

    -- One bad entry fails the whole block. Skipping it quietly would leave the
    -- trader believing a price is set when it is not.
    if length(v_key) < 2 then
      raise exception 'a product name is missing' using errcode = 'P0001', hint = 'no_product';
    end if;
    if v_cost is null or v_cost <= 0 then
      raise exception 'a buying price must be greater than zero'
        using errcode = 'P0001', hint = 'invalid_cost';
    end if;

    insert into product_costs
      (company_id, product_key, product_name, unit, unit_cost, currency, recorded_by, note)
    values
      (v_company, v_key, v_product, v_unit, round(v_cost, 2), v_currency, v_profile,
       'WhatsApp bulk price list');
    v_saved := v_saved + 1;
  end loop;

  return jsonb_build_object('saved', v_saved, 'company_name', v_name);
end $$;


ALTER FUNCTION public.wa_set_product_costs(p_phone text, p_items jsonb) OWNER TO postgres;

--
-- Name: wa_set_recurring_obligation(uuid, uuid, text, text, numeric, integer, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_set_recurring_obligation(p_company_id uuid, p_profile_id uuid, p_kind text, p_label text, p_amount numeric, p_period_months integer, p_next_due_on date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_previous public.recurring_obligations%rowtype;
  -- FOUND is rewritten by the INSERT below, so the answer to "was there one
  -- before?" has to be taken the moment it is known. The rollback test caught
  -- this reporting every first-ever rent as a replacement.
  v_replaced boolean := false;
  v_id uuid;
begin
  if p_company_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'a recurring cost needs a company and an amount'
      using errcode = 'P0001', hint = 'invalid_obligation';
  end if;

  select * into v_previous
    from public.recurring_obligations
   where company_id = p_company_id
     and kind = p_kind
     and coalesce(label, '') = coalesce(p_label, '')
     and superseded_at is null
   order by effective_from desc
   limit 1;
  v_replaced := found;

  if v_replaced then
    update public.recurring_obligations
       set superseded_at = clock_timestamp()
     where id = v_previous.id;
  end if;

  insert into public.recurring_obligations
    (company_id, kind, label, amount, period_months, effective_from, next_due_on, created_by)
  values
    (p_company_id, p_kind, nullif(btrim(p_label), ''), p_amount, p_period_months,
     (clock_timestamp() at time zone 'Africa/Dar_es_Salaam')::date, p_next_due_on, p_profile_id)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'replaced', v_replaced,
    'previous_amount', case when v_replaced then v_previous.amount else null end
  );
end $$;


ALTER FUNCTION public.wa_set_recurring_obligation(p_company_id uuid, p_profile_id uuid, p_kind text, p_label text, p_amount numeric, p_period_months integer, p_next_due_on date) OWNER TO postgres;

--
-- Name: wa_set_selling_price(text, text, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_set_selling_price(p_phone text, p_name text, p_retail numeric, p_wholesale numeric DEFAULT NULL::numeric, p_min_qty numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid; v_company uuid; v_role text; v_currency text; v_name text;
  v_key text := private.product_key(p_name); v_id uuid;
begin
  select i.profile_id, p.active_company_id, m.role, c.currency, c.name
    into v_profile, v_company, v_role, v_currency, v_name
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
    join companies c on c.id = p.active_company_id
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode='P0001', hint='not_linked';
  end if;
  if v_role not in ('owner','accountant') then
    raise exception 'only finance may set a selling price'
      using errcode='P0001', hint='not_authorized';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this price for?' using errcode='P0001', hint='no_product';
  end if;
  if p_retail is null or p_retail <= 0 then
    raise exception 'a retail price must be greater than zero'
      using errcode='P0001', hint='invalid_price';
  end if;
  if p_wholesale is not null and p_wholesale > p_retail then
    raise exception 'a wholesale price cannot be higher than the retail price'
      using errcode='P0001', hint='wholesale_above_retail';
  end if;
  if p_min_qty is not null and p_wholesale is null then
    raise exception 'a bulk quantity needs a wholesale price to go with it'
      using errcode='P0001', hint='min_without_wholesale';
  end if;

  insert into product_selling_prices
    (company_id, product_key, product_name, retail_price, wholesale_price,
     wholesale_min_qty, currency, recorded_by)
  values
    (v_company, v_key, btrim(p_name), round(p_retail, 2),
     case when p_wholesale is null then null else round(p_wholesale, 2) end,
     p_min_qty, v_currency, v_profile)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'product', btrim(p_name), 'company_name', v_name,
    'retail', round(p_retail, 2),
    'wholesale', case when p_wholesale is null then null else round(p_wholesale, 2) end,
    'min_qty', p_min_qty);
end $$;


ALTER FUNCTION public.wa_set_selling_price(p_phone text, p_name text, p_retail numeric, p_wholesale numeric, p_min_qty numeric) OWNER TO postgres;

--
-- Name: wa_set_selling_prices(text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_set_selling_prices(p_phone text, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid; v_company uuid; v_role text; v_name text; v_currency text;
  v_item jsonb; v_product text; v_key text;
  v_retail numeric; v_wholesale numeric; v_min_qty numeric;
  v_saved int := 0;
begin
  select i.profile_id, p.active_company_id, m.role, c.name, c.currency
    into v_profile, v_company, v_role, v_name, v_currency
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
    join companies c on c.id = p.active_company_id
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only finance may set a selling price'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no prices given' using errcode = 'P0001', hint = 'empty';
  end if;
  if jsonb_array_length(p_items) > 120 then
    raise exception 'too many prices in one message' using errcode = 'P0001', hint = 'too_many';
  end if;

  -- Validate every line before writing any of them.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := btrim(coalesce(v_item ->> 'product', ''));
    v_retail := nullif(v_item ->> 'retail', '')::numeric;
    v_wholesale := nullif(v_item ->> 'wholesale', '')::numeric;
    v_min_qty := nullif(v_item ->> 'min_qty', '')::numeric;
    v_key := private.product_key(v_product);

    if v_key is null or length(v_key) < 2 then
      raise exception 'product name is not usable: %', v_product
        using errcode = 'P0001', hint = 'bad_product';
    end if;
    if v_retail is null or v_retail <= 0 or v_retail > 1000000000 then
      raise exception 'retail price for % is out of range', v_product
        using errcode = 'P0001', hint = 'bad_retail';
    end if;
    -- A trade price above the retail one is a typo every time, never a business
    -- model. Naming the product is what makes it fixable in one reply.
    if v_wholesale is not null and v_wholesale > v_retail then
      raise exception 'wholesale price for % is above its retail price', v_product
        using errcode = 'P0001', hint = 'wholesale_above_retail';
    end if;
    if v_min_qty is not null and v_wholesale is null then
      raise exception 'a starting quantity for % needs a wholesale price', v_product
        using errcode = 'P0001', hint = 'min_qty_without_wholesale';
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := btrim(coalesce(v_item ->> 'product', ''));
    v_retail := nullif(v_item ->> 'retail', '')::numeric;
    v_wholesale := nullif(v_item ->> 'wholesale', '')::numeric;
    v_min_qty := nullif(v_item ->> 'min_qty', '')::numeric;

    insert into product_selling_prices
      (company_id, product_key, product_name, retail_price, wholesale_price,
       wholesale_min_qty, currency, recorded_by)
    values
      (v_company, private.product_key(v_product), v_product, v_retail, v_wholesale,
       v_min_qty, coalesce(v_currency, 'TZS'), v_profile);
    v_saved := v_saved + 1;
  end loop;

  return jsonb_build_object('saved', v_saved, 'company_name', coalesce(v_name, ''));
end;
$$;


ALTER FUNCTION public.wa_set_selling_prices(p_phone text, p_items jsonb) OWNER TO postgres;

--
-- Name: wa_shop_order_action(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_shop_order_action(p_order_id uuid, p_actor_company_id uuid, p_action text, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_order public.shop_orders;
  v_is_buyer boolean;
  v_is_supplier boolean;
  v_counterparty uuid;
  v_title text;
  v_body text;
begin
  select * into v_order from public.shop_orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0001', hint = 'order_not_found';
  end if;
  v_is_buyer := v_order.buyer_company_id = p_actor_company_id;
  v_is_supplier := v_order.supplier_company_id = p_actor_company_id;
  if not (v_is_buyer or v_is_supplier) then
    raise exception 'Only a party to the order may update it'
      using errcode = 'P0001', hint = 'not_party';
  end if;

  case p_action
    when 'accept' then
      if not v_is_supplier or v_order.status <> 'placed' then
        raise exception 'Only the supplier may accept a placed order'
          using errcode = 'P0001', hint = 'bad_transition';
      end if;
      update public.shop_orders set status = 'accepted', accepted_at = clock_timestamp(), updated_at = clock_timestamp()
       where id = p_order_id;
      v_counterparty := v_order.buyer_company_id; v_title := 'Agizo limekubaliwa';
      v_body := 'Uma milki ' || v_order.order_no || ' imekubaliwa na muuzaji.';
    when 'reject' then
      if not v_is_supplier or v_order.status <> 'placed' then
        raise exception 'Only the supplier may reject a placed order'
          using errcode = 'P0001', hint = 'bad_transition';
      end if;
      update public.shop_orders set status = 'rejected', rejected_at = clock_timestamp(), updated_at = clock_timestamp()
       where id = p_order_id;
      v_counterparty := v_order.buyer_company_id; v_title := 'Agizo limekataliwa';
      v_body := 'Uma milki ' || v_order.order_no || ' imekataliwa na muuzaji.';
    when 'deliver' then
      if not v_is_supplier or v_order.status <> 'accepted' then
        raise exception 'Only the supplier may mark an accepted order as delivered'
          using errcode = 'P0001', hint = 'bad_transition';
      end if;
      update public.shop_orders set status = 'delivered', delivered_at = clock_timestamp(), updated_at = clock_timestamp()
       where id = p_order_id;
      v_counterparty := v_order.buyer_company_id; v_title := 'Agizo limetolewa';
      v_body := 'Uma milki ' || v_order.order_no || ' imetolewa. Thibitisha ukijua zimewasili.';
    when 'verify' then
      if not v_is_buyer or v_order.status <> 'delivered' then
        raise exception 'Only the buyer may verify a delivered order'
          using errcode = 'P0001', hint = 'bad_transition';
      end if;
      update public.shop_orders set status = 'verified', verified_at = clock_timestamp(), updated_at = clock_timestamp()
       where id = p_order_id;
      v_counterparty := v_order.supplier_company_id; v_title := 'Agizo limethibitishwa';
      v_body := 'Uma milki ' || v_order.order_no || ' imethibitishwa na mnunuzi.';
    when 'cancel' then
      if v_order.status not in ('placed', 'accepted') then
        raise exception 'Only a placed or accepted order may be cancelled'
          using errcode = 'P0001', hint = 'bad_transition';
      end if;
      update public.shop_orders set status = 'cancelled', cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
       where id = p_order_id;
      v_counterparty := case when v_is_buyer then v_order.supplier_company_id else v_order.buyer_company_id end;
      v_title := 'Agizo limeghairiwa';
      v_body := 'Uma milki ' || v_order.order_no || ' imeghairiwa.';
    else
      raise exception 'Unknown order action' using errcode = 'P0001', hint = 'unknown_action';
  end case;

  insert into public.shop_order_events (order_id, event, actor_company_id, note)
  values (p_order_id, p_action, p_actor_company_id, nullif(btrim(coalesce(p_note, '')), ''));

  if v_counterparty is not null and private.shop_owner_of(v_counterparty) is not null then
    insert into public.app_notifications
      (company_id, recipient_id, actor_id, type, title, body, metadata)
    values (
      v_counterparty,
      private.shop_owner_of(v_counterparty),
      null,
      'shop_order',
      v_title,
      v_body,
      jsonb_build_object('order_id', p_order_id, 'order_no', v_order.order_no, 'direction',
                         case when v_is_buyer then 'incoming' else 'outgoing' end)
    );
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', case p_action
        when 'accept' then 'accepted' when 'reject' then 'rejected'
        when 'deliver' then 'delivered' when 'verify' then 'verified'
        else 'cancelled' end,
    'order_no', v_order.order_no
  );
end;
$$;


ALTER FUNCTION public.wa_shop_order_action(p_order_id uuid, p_actor_company_id uuid, p_action text, p_note text) OWNER TO postgres;

--
-- Name: wa_shop_order_book(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_shop_order_book(p_company_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select jsonb_build_object(
    'outgoing', coalesce((select jsonb_agg(x order by x.placed_at desc) from (
      select o.id, o.order_no, o.status, o.total_wholesale, o.currency, o.placed_at,
             c.name as counterparty_name,
             coalesce((select jsonb_agg(jsonb_build_object(
                        'product_name', l.product_name, 'quantity', l.quantity,
                        'unit', l.unit, 'wholesale_unit_price', l.wholesale_unit_price,
                        'line_total', l.line_total))
                        from public.shop_order_lines l where l.order_id = o.id), '[]'::jsonb) as lines
        from public.shop_orders o
        join public.companies c on c.id = o.supplier_company_id
       where o.buyer_company_id = p_company_id) x), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(y order by y.placed_at desc) from (
      select o.id, o.order_no, o.status, o.total_wholesale, o.currency, o.placed_at,
             c.name as counterparty_name,
             coalesce((select jsonb_agg(jsonb_build_object(
                        'product_name', l.product_name, 'quantity', l.quantity,
                        'unit', l.unit, 'wholesale_unit_price', l.wholesale_unit_price,
                        'line_total', l.line_total))
                        from public.shop_order_lines l where l.order_id = o.id), '[]'::jsonb) as lines
        from public.shop_orders o
        join public.companies c on c.id = o.buyer_company_id
       where o.supplier_company_id = p_company_id) y), '[]'::jsonb),
    'counts', jsonb_build_object(
      'placed', (select count(*)::int from public.shop_orders o where (o.buyer_company_id = p_company_id or o.supplier_company_id = p_company_id) and o.status = 'placed'),
      'accepted', (select count(*)::int from public.shop_orders o where (o.buyer_company_id = p_company_id or o.supplier_company_id = p_company_id) and o.status = 'accepted'),
      'delivered', (select count(*)::int from public.shop_orders o where (o.buyer_company_id = p_company_id or o.supplier_company_id = p_company_id) and o.status = 'delivered'),
      'verified', (select count(*)::int from public.shop_orders o where (o.buyer_company_id = p_company_id or o.supplier_company_id = p_company_id) and o.status = 'verified'),
      'rejected', (select count(*)::int from public.shop_orders o where (o.buyer_company_id = p_company_id or o.supplier_company_id = p_company_id) and o.status = 'rejected'),
      'cancelled', (select count(*)::int from public.shop_orders o where (o.buyer_company_id = p_company_id or o.supplier_company_id = p_company_id) and o.status = 'cancelled')
    )
  );
$$;


ALTER FUNCTION public.wa_shop_order_book(p_company_id uuid) OWNER TO postgres;

--
-- Name: wa_skip_cost_prompt(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_skip_cost_prompt(p_phone text, p_product text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_profile uuid; v_company uuid; v_key text := lower(btrim(coalesce(p_product, '')));
begin
  select i.profile_id, p.active_company_id into v_profile, v_company
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null or v_key = '' then
    return jsonb_build_object('skipped', false);
  end if;

  insert into product_cost_prompts (company_id, product_key, profile_id, skipped_count)
  values (v_company, v_key, v_profile, 1)
  on conflict (company_id, product_key, profile_id)
    do update set skipped_count = product_cost_prompts.skipped_count + 1,
                  asked_at = clock_timestamp();

  return jsonb_build_object('skipped', true);
end $$;


ALTER FUNCTION public.wa_skip_cost_prompt(p_phone text, p_product text) OWNER TO postgres;

--
-- Name: wa_stock_on_hand(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_stock_on_hand(p_company_id uuid, p_product text DEFAULT NULL::text) RETURNS TABLE(product_name text, unit text, measured boolean, on_hand numeric, has_count boolean, counted_at timestamp with time zone, bought_since numeric, sold_since numeric, lost_since numeric, taken_since numeric, produced_since numeric, incomplete_purchases boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  with last_count as (
    select distinct on (product_key) product_key, product_name, quantity, unit, counted_at
      from public.stock_counts where company_id = p_company_id
     order by product_key, counted_at desc, created_at desc
  ),
  movement as (
    select private.product_key(l.description) as product_key,
      (array_agg(l.description order by r.occurred_at desc))[1] as product_name,
      (array_agg(nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') order by r.occurred_at desc)
        filter (where nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null))[1] as unit,
      bool_or(coalesce(l.stock_base_quantity, l.quantity) <> round(coalesce(l.stock_base_quantity, l.quantity))
        or nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null) as measured,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind in ('stock_purchase', 'supplier_payable')
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as bought_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind in ('sale', 'debt_issued')
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as sold_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'stock_loss'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as lost_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'owner_use'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as taken_since,
      0::numeric as produced_since
      from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
      left join last_count lc on lc.product_key = private.product_key(l.description)
     where r.company_id = p_company_id and r.status = 'confirmed'
       and r.kind in ('sale', 'debt_issued', 'stock_purchase', 'supplier_payable', 'stock_loss', 'owner_use')
       and private.product_key(l.description) is not null
     group by private.product_key(l.description)
    union all
    select o.product_key, max(o.product_name), max(o.base_unit), true,
      0::numeric, 0::numeric, 0::numeric, 0::numeric,
      coalesce(sum(o.base_quantity) filter (where lc.counted_at is null or r.occurred_at > lc.counted_at), 0)
      from public.whole_animal_breakdown_outputs o
      join public.daily_records r on r.id = o.breakdown_daily_record_id
      left join last_count lc on lc.product_key = o.product_key
     where r.company_id = p_company_id and r.status = 'confirmed'
     group by o.product_key
  ),
  grouped as (
    select product_key, max(product_name) as product_name, max(unit) as unit,
      bool_or(measured) as measured, sum(bought_since) as bought_since,
      sum(sold_since) as sold_since, sum(lost_since) as lost_since,
      sum(taken_since) as taken_since, sum(produced_since) as produced_since
      from movement group by product_key
  ),
  bare as (
    select count(*) > 0 as any_bare from public.daily_records r
     where r.company_id = p_company_id and r.status = 'confirmed'
       and r.kind in ('stock_purchase', 'supplier_payable')
       and not exists (select 1 from public.daily_record_lines l where l.daily_record_id = r.id)
  )
  select coalesce(g.product_name, lc.product_name), coalesce(lc.unit, g.unit),
    coalesce(g.measured, lc.unit is not null, false),
    coalesce(lc.quantity, 0) + coalesce(g.bought_since, 0) + coalesce(g.produced_since, 0)
      - coalesce(g.sold_since, 0) - coalesce(g.lost_since, 0) - coalesce(g.taken_since, 0),
    lc.product_key is not null, lc.counted_at, coalesce(g.bought_since, 0),
    coalesce(g.sold_since, 0), coalesce(g.lost_since, 0), coalesce(g.taken_since, 0),
    coalesce(g.produced_since, 0), (select any_bare from bare)
    from grouped g full join last_count lc on lc.product_key = g.product_key
   where p_product is null or private.product_key(coalesce(g.product_key, lc.product_key)) = private.product_key(p_product)
   order by coalesce(g.product_name, lc.product_name) limit 500;
$$;


ALTER FUNCTION public.wa_stock_on_hand(p_company_id uuid, p_product text) OWNER TO postgres;

--
-- Name: wa_stop_proactive_notifications(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_stop_proactive_notifications(p_phone text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_identity public.whatsapp_identities;
  v_company uuid;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_identity
    from public.whatsapp_identities i
   where i.phone_e164 = p_phone and i.revoked_at is null
   for update;
  if v_identity.id is null then
    return jsonb_build_object('stopped', false);
  end if;

  select p.active_company_id into v_company
    from public.profiles p where p.id = v_identity.profile_id;

  update public.whatsapp_identities
     set daily_summary_opted_in_at = null,
         debt_reminders_opted_in_at = null,
         proactive_notifications_opted_out_at = v_now,
         updated_at = v_now
   where id = v_identity.id;

  insert into public.whatsapp_notification_consent_log
    (identity_id, company_id, profile_id, channel, action, source)
  values
    (v_identity.id, v_company, v_identity.profile_id, 'all', 'stopped', 'whatsapp');

  return jsonb_build_object('stopped', true);
end;
$$;


ALTER FUNCTION public.wa_stop_proactive_notifications(p_phone text) OWNER TO postgres;

--
-- Name: wa_store_ai_exchange(uuid, uuid, text, text, text, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_store_ai_exchange(p_identity_id uuid, p_company_id uuid, p_wa_message_id text, p_user_text text, p_assistant_text text, p_topic text DEFAULT NULL::text, p_entities jsonb DEFAULT '{}'::jsonb, p_last_tool text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_context jsonb;
  v_profile_id uuid;
begin
  v_context := public.wa_resolve_context(p_identity_id);
  if v_context is null
     or (v_context ->> 'company_id')::uuid <> p_company_id then
    raise exception 'WhatsApp context is not active in this company'
      using errcode = 'P0001', hint = 'invalid_scope';
  end if;
  if coalesce(char_length(btrim(p_wa_message_id)), 0) = 0
     or coalesce(char_length(btrim(p_user_text)), 0) = 0
     or coalesce(char_length(btrim(p_assistant_text)), 0) = 0 then
    raise exception 'conversation exchange is incomplete'
      using errcode = 'P0001', hint = 'invalid_exchange';
  end if;
  if jsonb_typeof(coalesce(p_entities, '{}'::jsonb)) <> 'object' then
    raise exception 'conversation entities must be an object'
      using errcode = 'P0001', hint = 'invalid_entities';
  end if;

  v_profile_id := (v_context ->> 'profile_id')::uuid;

  insert into public.whatsapp_ai_messages
    (identity_id, company_id, profile_id, wa_message_id, role, content)
  values
    (p_identity_id, p_company_id, v_profile_id, left(btrim(p_wa_message_id), 255),
     'user', left(btrim(p_user_text), 4000))
  on conflict (wa_message_id, role) do nothing;

  insert into public.whatsapp_ai_messages
    (identity_id, company_id, profile_id, wa_message_id, role, content)
  values
    (p_identity_id, p_company_id, v_profile_id, left(btrim(p_wa_message_id), 255),
     'assistant', left(btrim(p_assistant_text), 4000))
  on conflict (wa_message_id, role) do nothing;

  insert into public.whatsapp_ai_threads
    (identity_id, company_id, profile_id, topic, entities, last_tool, expires_at, updated_at)
  values
    (p_identity_id, p_company_id, v_profile_id, nullif(left(btrim(p_topic), 100), ''),
     coalesce(p_entities, '{}'::jsonb), nullif(left(btrim(p_last_tool), 100), ''),
     clock_timestamp() + interval '24 hours', clock_timestamp())
  on conflict (identity_id, company_id) do update
    set profile_id = excluded.profile_id,
        topic = coalesce(excluded.topic, public.whatsapp_ai_threads.topic),
        entities = case when excluded.entities = '{}'::jsonb
          then public.whatsapp_ai_threads.entities else excluded.entities end,
        last_tool = coalesce(excluded.last_tool, public.whatsapp_ai_threads.last_tool),
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at;

  delete from public.whatsapp_ai_messages m
   where m.identity_id = p_identity_id
     and m.company_id = p_company_id
     and (m.expires_at < clock_timestamp()
       or m.id not in (
         select k.id
           from public.whatsapp_ai_messages k
          where k.identity_id = p_identity_id
            and k.company_id = p_company_id
            and k.expires_at >= clock_timestamp()
          order by k.created_at desc, k.id desc
          limit 24
       ));

  return true;
end $$;


ALTER FUNCTION public.wa_store_ai_exchange(p_identity_id uuid, p_company_id uuid, p_wa_message_id text, p_user_text text, p_assistant_text text, p_topic text, p_entities jsonb, p_last_tool text) OWNER TO postgres;

--
-- Name: wa_supplier_balances(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_supplier_balances(p_profile_id uuid, p_company_id uuid, p_supplier_name text DEFAULT NULL::text) RETURNS TABLE(supplier_name text, payable numeric, payments numeric, outstanding numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_active_company uuid;
  v_key text := nullif(private.product_key(p_supplier_name), '');
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m on m.profile_id = p.id
      and m.company_id = p.active_company_id and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;

  return query
  with facts as (
    select private.product_key(r.party_name) as supplier_key,
      max(btrim(r.party_name)) as supplier_name,
      sum(case when r.kind in ('supplier_payable', 'whole_animal_procurement') then r.amount else 0 end) as payable,
      sum(case when r.kind = 'supplier_payment' then r.amount else 0 end) as payments
      from public.daily_records r
     where r.company_id = p_company_id and r.status = 'confirmed'
       and r.party_name is not null
       and r.kind in ('supplier_payable', 'supplier_payment', 'whole_animal_procurement')
       and (r.kind <> 'whole_animal_procurement' or r.payment_method is null)
     group by private.product_key(r.party_name)
  )
  select f.supplier_name, f.payable, f.payments, f.payable - f.payments
    from facts f
   where (v_key is null or f.supplier_key = v_key)
     and f.payable - f.payments <> 0
   order by f.supplier_name;
end;
$$;


ALTER FUNCTION public.wa_supplier_balances(p_profile_id uuid, p_company_id uuid, p_supplier_name text) OWNER TO postgres;

--
-- Name: wa_supplier_product_pricing(uuid, text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_supplier_product_pricing(p_supplier_company_id uuid, p_product_keys text[]) RETURNS TABLE(product_key text, product_name text, unit text, retail_price numeric, wholesale_price numeric, wholesale_min_qty numeric, on_hand numeric, has_count boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  with wanted as (
    select distinct private.product_key(k) as product_key
      from unnest(coalesce(p_product_keys, '{}'::text[])) as k
     where k is not null and btrim(k) <> ''
  ),
  latest_price as (
    -- One row per wanted product: the supplier's most recent price. DISTINCT ON
    -- (not DISTINCT ON + array_agg) because the aggregate form is invalid without
    -- a GROUP BY; the ORDER BY picks the same winning row.
    select distinct on (p.product_key)
      p.product_key,
      s.product_name,
      s.retail_price,
      s.wholesale_price,
      s.wholesale_min_qty
    from wanted p
    join product_selling_prices s
      on s.company_id = p_supplier_company_id
     and private.product_key(s.product_key) = p.product_key
    order by p.product_key, s.effective_from desc, s.created_at desc
  )
  select
    w.product_key,
    p.product_name,
    private.product_unit(p_supplier_company_id, w.product_key) as unit,
    p.retail_price,
    p.wholesale_price,
    p.wholesale_min_qty,
    coalesce(h.on_hand, 0) as on_hand,
    coalesce(h.has_count, false) as has_count
  from wanted w
  left join latest_price p on p.product_key = w.product_key
  left join lateral wa_stock_on_hand(p_supplier_company_id, w.product_key) h on true;
$$;


ALTER FUNCTION public.wa_supplier_product_pricing(p_supplier_company_id uuid, p_product_keys text[]) OWNER TO postgres;

--
-- Name: wa_sweep_abandoned_drafts(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_sweep_abandoned_drafts(p_older_than_hours integer DEFAULT 12) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_dropped integer := 0;
begin
  with abandoned as (
    update public.daily_records
       set status = 'voided',
           -- The constraint requires a person, and a sweep has none. The
           -- person who drafted it is the honest answer: it was their draft
           -- and they left it. void_reason says how it ended, so nobody reads
           -- this as a deliberate reversal by them.
           voided_by = recorded_by,
           voided_at = clock_timestamp(),
           -- The reason has to be a real sentence: is_meaningful_reason
           -- demands twenty characters and eight distinct ones, which is
           -- deliberate — "voided" as a reason tells a shopkeeper nothing
           -- about their own books a year later.
           void_reason = 'Rasimu iliachwa bila kuthibitishwa ndani ya masaa 12',
           updated_at = clock_timestamp()
     where status = 'pending_confirmation'
       and voided_at is null
       and created_at < clock_timestamp()
           - (greatest(1, least(168, p_older_than_hours)) || ' hours')::interval
    returning 1
  )
  select count(*) into v_dropped from abandoned;
  return v_dropped;
exception when others then
  -- Housekeeping is never allowed to cost a shop its message.
  return 0;
end $$;


ALTER FUNCTION public.wa_sweep_abandoned_drafts(p_older_than_hours integer) OWNER TO postgres;

--
-- Name: wa_switch_active_company(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_switch_active_company(p_phone text, p_company uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_profile uuid; v_name text;
begin
  select profile_id into v_profile from public.whatsapp_identities where phone_e164 = p_phone and revoked_at is null;
  select c.name into v_name from public.company_members m join public.companies c on c.id = m.company_id
    where m.profile_id = v_profile and m.company_id = p_company and m.deactivated_at is null;
  if v_name is null then raise exception 'not_a_member'; end if;
  perform set_config('risip.allow_turn_switch', 'yes', true);
  update public.profiles set active_company_id = p_company where id = v_profile;
  return v_name;
end $$;


ALTER FUNCTION public.wa_switch_active_company(p_phone text, p_company uuid) OWNER TO postgres;

--
-- Name: wa_trim_typing_attempts(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_trim_typing_attempts(p_keep_hours integer DEFAULT 72) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_dropped integer := 0;
begin
  with gone as (
    delete from public.whatsapp_typing_attempts
     where created_at < clock_timestamp()
           - (greatest(1, least(720, p_keep_hours)) || ' hours')::interval
    returning 1
  )
  select count(*) into v_dropped from gone;
  return v_dropped;
exception when others then
  -- Housekeeping never costs a shop its message.
  return 0;
end $$;


ALTER FUNCTION public.wa_trim_typing_attempts(p_keep_hours integer) OWNER TO postgres;

--
-- Name: wa_try_acquire_whatsapp_turn(text, uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_try_acquire_whatsapp_turn(p_phone text, p_owner_token uuid, p_lease_seconds integer DEFAULT 300) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare v_acquired boolean;
begin
  if p_phone like 'identity:%' then
    perform 1 from public.profiles p join public.whatsapp_identities i on i.profile_id=p.id where i.id::text=substring(p_phone from 10) for update of p;
  end if;
  insert into public.whatsapp_turn_locks(phone_e164,owner_token,lease_until)
    values(p_phone,p_owner_token,clock_timestamp()+(greatest(30,least(600,p_lease_seconds)) || ' seconds')::interval)
  on conflict(phone_e164) do update set owner_token=excluded.owner_token,lease_until=excluded.lease_until,updated_at=clock_timestamp()
    where public.whatsapp_turn_locks.lease_until <= clock_timestamp() or public.whatsapp_turn_locks.owner_token=p_owner_token
  returning true into v_acquired;
  return coalesce(v_acquired,false);
end $$;


ALTER FUNCTION public.wa_try_acquire_whatsapp_turn(p_phone text, p_owner_token uuid, p_lease_seconds integer) OWNER TO postgres;

--
-- Name: wa_void_daily_record(text, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.wa_void_daily_record(p_phone text, p_daily_record_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_profile uuid;
  v_company uuid;
  v_role text;
  v_record public.daily_records%rowtype;
  v_said text := nullif(btrim(coalesce(p_reason, '')), '');
  v_stored text;
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
    raise exception 'only finance may void a record'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  if p_daily_record_id is null then
    select * into v_record
      from public.daily_records
     where company_id = v_company and status = 'confirmed'
     order by confirmed_at desc nulls last, created_at desc
     limit 1;
  else
    select * into v_record
      from public.daily_records
     where id = p_daily_record_id and company_id = v_company;
  end if;

  if v_record.id is null then
    return jsonb_build_object('voided', false, 'reason', 'not_found');
  end if;
  if v_record.status <> 'confirmed' then
    return jsonb_build_object('voided', false, 'reason', 'not_confirmed', 'status', v_record.status);
  end if;

  -- The trader's own words when they satisfy the constraint; the standard
  -- sentence when they do not. Either way the row is valid and the correction
  -- goes through.
  v_stored := case
    when v_said is not null and private.is_meaningful_reason(v_said) then v_said
    else 'Imefutwa na mwenye biashara kupitia WhatsApp'
  end;

  update public.daily_records
     set status = 'voided',
         voided_by = v_profile,
         voided_at = clock_timestamp(),
         void_reason = v_stored,
         updated_at = clock_timestamp()
   where id = v_record.id;

  -- What the app path has always written, and this one never did.
  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, reason, metadata)
  values
    (v_record.id, v_company, v_profile, 'voided', v_record.status, 'voided', v_stored,
     jsonb_build_object(
       'amount', v_record.amount,
       'currency', v_record.currency,
       'kind', v_record.kind,
       'source', 'whatsapp',
       -- Kept even when it was too short to store on the record itself, so the
       -- shop's actual words are never simply discarded.
       'said', v_said));

  return jsonb_build_object(
    'voided', true,
    'id', v_record.id,
    'kind', v_record.kind,
    'amount', v_record.amount,
    'party_name', v_record.party_name,
    'description', v_record.description,
    'occurred_at', v_record.occurred_at,
    'reason_stored', v_stored
  );
end;
$$;


ALTER FUNCTION public.wa_void_daily_record(p_phone text, p_daily_record_id uuid, p_reason text) OWNER TO postgres;

--
-- Name: whatsapp_revoke_on_deactivate(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.whatsapp_revoke_on_deactivate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.deactivated_at is not null and (old.deactivated_at is null) then
    update whatsapp_identities
       set revoked_at = now(), updated_at = now()
     where profile_id = new.id and revoked_at is null;
  end if;
  return new;
end $$;


ALTER FUNCTION public.whatsapp_revoke_on_deactivate() OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: auth; Owner: postgres
--

CREATE TABLE auth.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE auth.users OWNER TO postgres;

--
-- Name: job; Type: TABLE; Schema: cron; Owner: postgres
--

CREATE TABLE cron.job (
    jobid bigint NOT NULL,
    jobname text,
    schedule text,
    command text,
    active boolean DEFAULT true
);


ALTER TABLE cron.job OWNER TO postgres;

--
-- Name: job_jobid_seq; Type: SEQUENCE; Schema: cron; Owner: postgres
--

ALTER TABLE cron.job ALTER COLUMN jobid ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME cron.job_jobid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: app_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    actor_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.app_notifications OWNER TO postgres;

--
-- Name: billing_plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.billing_plans (
    code text NOT NULL,
    name_sw text NOT NULL,
    monthly_tzs integer NOT NULL,
    yearly_tzs integer NOT NULL,
    message_allowance integer NOT NULL,
    overage_tzs integer NOT NULL,
    max_users smallint NOT NULL,
    max_projects smallint NOT NULL,
    sort_order smallint NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT billing_plans_max_projects_check CHECK ((max_projects > 0)),
    CONSTRAINT billing_plans_max_users_check CHECK ((max_users > 0)),
    CONSTRAINT billing_plans_message_allowance_check CHECK ((message_allowance > 0)),
    CONSTRAINT billing_plans_monthly_tzs_check CHECK ((monthly_tzs > 0)),
    CONSTRAINT billing_plans_overage_tzs_check CHECK ((overage_tzs > 0)),
    CONSTRAINT billing_plans_yearly_tzs_check CHECK ((yearly_tzs > 0))
);


ALTER TABLE public.billing_plans OWNER TO postgres;

--
-- Name: TABLE billing_plans; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.billing_plans IS 'What each plan costs and allows. Prices live here, not in code, so a change is a data change. Invoices snapshot the amount and never read it back.';


--
-- Name: business_vocabulary; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.business_vocabulary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    kind text NOT NULL,
    term_key text NOT NULL,
    term_display text NOT NULL,
    product_key text,
    meaning text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_vocabulary_alias_has_product CHECK (((kind <> 'product_alias'::text) OR (product_key IS NOT NULL))),
    CONSTRAINT business_vocabulary_kind_check CHECK ((kind = ANY (ARRAY['product_alias'::text, 'semantic_term'::text, 'unit_alias'::text]))),
    CONSTRAINT business_vocabulary_meaning_check CHECK (((meaning IS NULL) OR (meaning = 'stock_loss'::text))),
    CONSTRAINT business_vocabulary_semantic_has_meaning CHECK (((kind <> 'semantic_term'::text) OR (meaning IS NOT NULL))),
    CONSTRAINT business_vocabulary_term_len CHECK (((length(term_key) >= 2) AND (length(term_key) <= 80)))
);


ALTER TABLE public.business_vocabulary OWNER TO postgres;

--
-- Name: business_vocabulary_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.business_vocabulary_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    term_key text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.business_vocabulary_audit_log OWNER TO postgres;

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_id uuid NOT NULL,
    company_id uuid NOT NULL,
    wa_message_id text NOT NULL,
    ordinal integer NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    chat_day date NOT NULL,
    tools text[] DEFAULT '{}'::text[] NOT NULL,
    awaiting text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    sensitive boolean DEFAULT false NOT NULL,
    CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


ALTER TABLE public.chat_messages OWNER TO postgres;

--
-- Name: companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    hq_location text NOT NULL,
    sector text,
    logo_url text,
    currency text DEFAULT 'TZS'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash text,
    scanner_inbox_token character varying(20) DEFAULT ('co.'::text || substr(md5((random())::text), 1, 6)) NOT NULL,
    scanner_sender_email text,
    approval_flow_enabled boolean DEFAULT false NOT NULL,
    allow_self_approval boolean DEFAULT false NOT NULL,
    reversal_enabled boolean DEFAULT false NOT NULL,
    payouts_enabled boolean DEFAULT false NOT NULL,
    closing_time time without time zone,
    closing_time_asked_at timestamp with time zone,
    timezone text DEFAULT 'Africa/Dar_es_Salaam'::text NOT NULL,
    business_category text,
    business_subcategory text,
    business_classification_confidence numeric(4,3),
    business_classification_keywords jsonb,
    business_classified_at timestamp with time zone,
    business_description text,
    ai_daily_request_limit integer,
    ai_daily_char_limit integer,
    ai_daily_cost_limit numeric(12,6),
    ai_monthly_request_limit integer,
    record_queue_size integer,
    opening_time time without time zone,
    opening_time_asked_at timestamp with time zone,
    CONSTRAINT companies_business_category_check CHECK (((business_category IS NULL) OR (business_category = ANY (ARRAY['Food & Beverages'::text, 'Retail & General Stores'::text, 'Liquid & Bulk Refills'::text, 'Services & Micro-Manufacturing'::text])))),
    CONSTRAINT companies_business_classification_confidence_check CHECK (((business_classification_confidence IS NULL) OR ((business_classification_confidence >= (0)::numeric) AND (business_classification_confidence <= (1)::numeric)))),
    CONSTRAINT companies_business_classification_keywords_check CHECK (((business_classification_keywords IS NULL) OR (jsonb_typeof(business_classification_keywords) = 'array'::text))),
    CONSTRAINT companies_business_subcategory_check CHECK ((((business_category IS NULL) AND (business_subcategory IS NULL)) OR ((business_category = 'Food & Beverages'::text) AND (business_subcategory = ANY (ARRAY['Kijiwe cha Chips'::text, 'Mama Lishe'::text, 'Genge la Mboga na Matunda'::text, 'Duka la Vinywaji na Grocery'::text, 'Bakery'::text]))) OR ((business_category = 'Retail & General Stores'::text) AND (business_subcategory = ANY (ARRAY['Duka la Mang''aa / Rejareja'::text, 'Duka la Nguo na Viatu'::text, 'Duka la Vipodozi'::text, 'Hardware'::text, 'Duka la Simu na Elektroniki'::text, 'Pharmacy'::text]))) OR ((business_category = 'Liquid & Bulk Refills'::text) AND (business_subcategory = ANY (ARRAY['Mafuta ya Kula ya Kupima'::text, 'Maziwa ya Kupima'::text, 'Gesi na Nishati'::text]))) OR ((business_category = 'Services & Micro-Manufacturing'::text) AND (business_subcategory = ANY (ARRAY['Stationery na Fedha'::text, 'Saluni'::text, 'Gereji na Spea'::text, 'Ushonaji'::text]))))),
    CONSTRAINT companies_record_queue_size_check CHECK (((record_queue_size IS NULL) OR ((record_queue_size >= 2) AND (record_queue_size <= 30))))
);


ALTER TABLE public.companies OWNER TO postgres;

--
-- Name: COLUMN companies.password_hash; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.password_hash IS 'Deprecated shared-company password. Retained temporarily for rollback; WhatsApp invite codes replace it.';


--
-- Name: COLUMN companies.closing_time; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.closing_time IS 'Local wall-clock time the shop closes its books. Null means never answered.';


--
-- Name: COLUMN companies.closing_time_asked_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.closing_time_asked_at IS 'When Risip last asked. Asked once, never nagged.';


--
-- Name: COLUMN companies.business_category; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.business_category IS 'Validated top-level Risip business classification; descriptive only.';


--
-- Name: COLUMN companies.business_subcategory; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.business_subcategory IS 'Validated Risip business subcategory; descriptive only.';


--
-- Name: COLUMN companies.business_classification_confidence; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.business_classification_confidence IS 'Confidence of the bounded onboarding classifier, between 0 and 1.';


--
-- Name: COLUMN companies.business_description; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.business_description IS 'Free text from WhatsApp onboarding, in the owner''s own words. Descriptive only: never used for finance, permissions or stock.';


--
-- Name: COLUMN companies.ai_daily_request_limit; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.ai_daily_request_limit IS 'Daily WhatsApp AI request ceiling. NULL uses the platform default (30).';


--
-- Name: COLUMN companies.ai_daily_char_limit; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.ai_daily_char_limit IS 'Daily WhatsApp AI input-character ceiling. NULL uses the platform default (36000).';


--
-- Name: COLUMN companies.ai_daily_cost_limit; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.ai_daily_cost_limit IS 'Daily WhatsApp AI estimated-cost ceiling in USD. NULL uses the platform default (0.15).';


--
-- Name: COLUMN companies.ai_monthly_request_limit; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.ai_monthly_request_limit IS 'Monthly WhatsApp AI request ceiling, counted over the UTC calendar month. NULL means no monthly ceiling. The daily limits in 0116 still apply.';


--
-- Name: COLUMN companies.record_queue_size; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.record_queue_size IS 'How many drafts may wait before Risip asks the shopkeeper to confirm them together. NULL means the old behaviour: every record is confirmed on its own, immediately. The queue also flushes on any question and on closing the day, so nothing waits longer than the next thing the shopkeeper says.';


--
-- Name: COLUMN companies.opening_time; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.opening_time IS 'Local wall-clock time the shop opens, captured during owner onboarding.';


--
-- Name: COLUMN companies.opening_time_asked_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.opening_time_asked_at IS 'When Risip captured the opening time during onboarding.';


--
-- Name: company_invite_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_invite_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    code text NOT NULL,
    role public.user_role DEFAULT 'worker'::public.user_role NOT NULL,
    expires_at timestamp with time zone,
    max_uses integer,
    uses integer DEFAULT 0 NOT NULL,
    revoked_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invite_code_role_not_owner CHECK ((role <> 'owner'::public.user_role)),
    CONSTRAINT invite_code_uses_sane CHECK (((max_uses IS NULL) OR (max_uses > 0)))
);


ALTER TABLE public.company_invite_codes OWNER TO postgres;

--
-- Name: company_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_members (
    profile_id uuid NOT NULL,
    company_id uuid NOT NULL,
    role public.user_role NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    deactivated_at timestamp with time zone
);


ALTER TABLE public.company_members OWNER TO postgres;

--
-- Name: company_suppliers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_suppliers (
    company_id uuid NOT NULL,
    active boolean DEFAULT true NOT NULL,
    opted_in_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    opted_in_by uuid,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE public.company_suppliers OWNER TO postgres;

--
-- Name: daily_closures; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.daily_closures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    business_date date NOT NULL,
    closed_by uuid,
    closed_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    sales numeric(14,2) DEFAULT 0 NOT NULL,
    cogs numeric(14,2) DEFAULT 0 NOT NULL,
    profit numeric(14,2) DEFAULT 0 NOT NULL,
    purchases numeric(14,2) DEFAULT 0 NOT NULL,
    new_debt numeric(14,2) DEFAULT 0 NOT NULL,
    debt_paid numeric(14,2) DEFAULT 0 NOT NULL,
    record_count integer DEFAULT 0 NOT NULL,
    worker_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.daily_closures OWNER TO postgres;

--
-- Name: TABLE daily_closures; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.daily_closures IS 'One row per shop per business day, written when a worker closes the day. Append-only: a correction is a new record, never an edit to history.';


--
-- Name: daily_record_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.daily_record_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    daily_record_id uuid NOT NULL,
    company_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    from_status text,
    to_status text NOT NULL,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT daily_record_audit_action_check CHECK ((action = ANY (ARRAY['created'::text, 'confirmed'::text, 'voided'::text, 'draft_corrected'::text]))),
    CONSTRAINT daily_record_audit_from_status_check CHECK (((from_status IS NULL) OR (from_status = ANY (ARRAY['pending_confirmation'::text, 'confirmed'::text, 'voided'::text])))),
    CONSTRAINT daily_record_audit_to_status_check CHECK ((to_status = ANY (ARRAY['pending_confirmation'::text, 'confirmed'::text, 'voided'::text])))
);


ALTER TABLE public.daily_record_audit_log OWNER TO postgres;

--
-- Name: daily_record_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.daily_record_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    daily_record_id uuid NOT NULL,
    line_number integer NOT NULL,
    description text NOT NULL,
    quantity numeric(14,3) DEFAULT 1 NOT NULL,
    unit_amount numeric(14,2) NOT NULL,
    line_total numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    unit text,
    stock_base_quantity numeric(18,6),
    stock_base_unit text,
    unit_base_quantity numeric(18,6),
    CONSTRAINT daily_record_lines_number_check CHECK ((line_number > 0)),
    CONSTRAINT daily_record_lines_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT daily_record_lines_stock_base_quantity_positive CHECK (((stock_base_quantity IS NULL) OR (stock_base_quantity > (0)::numeric))),
    CONSTRAINT daily_record_lines_total_check CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT daily_record_lines_unit_amount_check CHECK ((unit_amount >= (0)::numeric)),
    CONSTRAINT daily_record_lines_unit_base_quantity_positive CHECK (((unit_base_quantity IS NULL) OR (unit_base_quantity > (0)::numeric))),
    CONSTRAINT daily_record_lines_unit_check CHECK (((unit IS NULL) OR ((length(btrim(unit)) >= 1) AND (length(btrim(unit)) <= 20)))),
    CONSTRAINT daily_record_lines_unit_is_a_word CHECK (((unit IS NULL) OR (unit ~ '[[:alpha:]]'::text)))
);


ALTER TABLE public.daily_record_lines OWNER TO postgres;

--
-- Name: daily_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.daily_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    project_id uuid,
    recorded_by uuid,
    source text DEFAULT 'app'::text NOT NULL,
    source_message_id text,
    kind text NOT NULL,
    status text DEFAULT 'pending_confirmation'::text NOT NULL,
    amount numeric(14,2) NOT NULL,
    currency text NOT NULL,
    party_name text,
    description text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_by uuid,
    confirmed_at timestamp with time zone,
    voided_by uuid,
    voided_at timestamp with time zone,
    void_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_method text,
    loss_reason text,
    CONSTRAINT daily_records_amount_check CHECK (
CASE
    WHEN (kind = ANY (ARRAY['stock_loss'::text, 'owner_use'::text])) THEN (amount >= (0)::numeric)
    ELSE (amount > (0)::numeric)
END),
    CONSTRAINT daily_records_confirmed_fields_check CHECK (((status <> 'confirmed'::text) OR ((confirmed_by IS NOT NULL) AND (confirmed_at IS NOT NULL)))),
    CONSTRAINT daily_records_currency_check CHECK (((length(btrim(currency)) >= 1) AND (length(btrim(currency)) <= 12))),
    CONSTRAINT daily_records_kind_check CHECK ((kind = ANY (ARRAY['sale'::text, 'expense'::text, 'debt_issued'::text, 'customer_payment'::text, 'stock_purchase'::text, 'stock_loss'::text, 'owner_use'::text, 'supplier_payable'::text, 'supplier_payment'::text, 'whole_animal_procurement'::text, 'whole_animal_breakdown'::text]))),
    CONSTRAINT daily_records_loss_reason_len CHECK (((loss_reason IS NULL) OR ((length(btrim(loss_reason)) >= 1) AND (length(btrim(loss_reason)) <= 500)))),
    CONSTRAINT daily_records_payment_method_check CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['cash'::text, 'mobile_money'::text, 'bank'::text, 'other'::text])))),
    CONSTRAINT daily_records_source_check CHECK ((source = ANY (ARRAY['app'::text, 'whatsapp'::text, 'other'::text]))),
    CONSTRAINT daily_records_source_message_length_check CHECK (((source_message_id IS NULL) OR ((length(btrim(source_message_id)) >= 1) AND (length(btrim(source_message_id)) <= 256)))),
    CONSTRAINT daily_records_status_check CHECK ((status = ANY (ARRAY['pending_confirmation'::text, 'confirmed'::text, 'voided'::text]))),
    CONSTRAINT daily_records_supplier_fields_check CHECK (((kind <> ALL (ARRAY['supplier_payable'::text, 'supplier_payment'::text])) OR (party_name IS NOT NULL))),
    CONSTRAINT daily_records_supplier_payment_method_check CHECK (((kind <> 'supplier_payable'::text) OR (payment_method IS NULL))),
    CONSTRAINT daily_records_supplier_payment_requires_method_check CHECK (((kind <> 'supplier_payment'::text) OR (payment_method IS NOT NULL))),
    CONSTRAINT daily_records_voided_fields_check CHECK (((status <> 'voided'::text) OR ((voided_by IS NOT NULL) AND (voided_at IS NOT NULL) AND private.is_meaningful_reason(void_reason))))
);


ALTER TABLE public.daily_records OWNER TO postgres;

--
-- Name: COLUMN daily_records.payment_method; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.daily_records.payment_method IS 'Manually recorded by the trader: cash, mobile_money, bank, other. NULL means unstated. Never verified against any provider; Risip integrates with no payment gateway.';


--
-- Name: COLUMN daily_records.loss_reason; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.daily_records.loss_reason IS 'Why stock was lost, in the trader''s own words. Only meaningful for kind = stock_loss.';


--
-- Name: CONSTRAINT daily_records_amount_check ON daily_records; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON CONSTRAINT daily_records_amount_check ON public.daily_records IS 'Money must be positive, except for goods leaving the shelf with no recorded cost: a spoilage or an owner withdrawal may be worth zero, because the inventory movement is the fact and the value is not always known.';


--
-- Name: invite_links; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invite_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    role public.user_role NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invite_links_role_check CHECK ((role = ANY (ARRAY['accountant'::public.user_role, 'worker'::public.user_role])))
);


ALTER TABLE public.invite_links OWNER TO postgres;

--
-- Name: invoice_activity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    event text NOT NULL,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.invoice_activity OWNER TO postgres;

--
-- Name: invoice_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    receipt_id uuid,
    author_type text NOT NULL,
    author_name text,
    message text NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.invoice_comments OWNER TO postgres;

--
-- Name: invoice_receipts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_receipts (
    invoice_id uuid NOT NULL,
    receipt_id uuid NOT NULL
);


ALTER TABLE public.invoice_receipts OWNER TO postgres;

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    total_amount numeric(14,2) NOT NULL,
    tax_amount numeric(14,2) NOT NULL,
    pdf_url text,
    status public.invoice_status DEFAULT 'draft'::public.invoice_status NOT NULL,
    generated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    invoice_number text,
    client_name text,
    custom_notes text,
    signature_url text,
    public_token uuid DEFAULT gen_random_uuid() NOT NULL,
    line_items jsonb,
    signed_by uuid,
    signed_at timestamp with time zone,
    sent_at timestamp with time zone,
    CONSTRAINT invoices_check CHECK ((period_end >= period_start))
);


ALTER TABLE public.invoices OWNER TO postgres;

--
-- Name: legal_acceptances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.legal_acceptances (
    profile_id uuid NOT NULL,
    version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    language text NOT NULL,
    source text NOT NULL,
    privacy_acknowledged boolean DEFAULT true NOT NULL,
    CONSTRAINT legal_acceptances_language_check CHECK ((language = ANY (ARRAY['sw'::text, 'en'::text]))),
    CONSTRAINT legal_acceptances_privacy_acknowledged_check CHECK (privacy_acknowledged),
    CONSTRAINT legal_acceptances_source_check CHECK ((source = ANY (ARRAY['app'::text, 'web_signup'::text])))
);


ALTER TABLE public.legal_acceptances OWNER TO postgres;

--
-- Name: legal_policy_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.legal_policy_versions (
    version text NOT NULL,
    documents jsonb NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    active boolean DEFAULT false NOT NULL
);


ALTER TABLE public.legal_policy_versions OWNER TO postgres;

--
-- Name: marketplace_order_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marketplace_order_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_order_id uuid,
    buyer_company_id uuid NOT NULL,
    supplier_company_id uuid NOT NULL,
    buyer_profile_id uuid,
    query_text text NOT NULL,
    buyer_product_key text,
    supplier_product_key text NOT NULL,
    product_name text NOT NULL,
    match_confidence numeric(4,3) NOT NULL,
    match_basis text NOT NULL,
    quantity numeric NOT NULL,
    unit text,
    unit_price numeric,
    currency text,
    stock_snapshot_qty numeric,
    stock_counted_at timestamp with time zone,
    status text DEFAULT 'placed'::text NOT NULL,
    status_reason text,
    placed_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    rejected_at timestamp with time zone,
    delivered_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    CONSTRAINT marketplace_order_requests_check CHECK ((buyer_company_id <> supplier_company_id)),
    CONSTRAINT marketplace_order_requests_match_basis_check CHECK ((match_basis = ANY (ARRAY['barcode'::text, 'exact_name'::text, 'prefix_name'::text, 'fuzzy_name'::text]))),
    CONSTRAINT marketplace_order_requests_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT marketplace_order_requests_status_check CHECK ((status = ANY (ARRAY['placed'::text, 'accepted'::text, 'rejected'::text, 'delivered'::text, 'cancelled'::text])))
);


ALTER TABLE public.marketplace_order_requests OWNER TO postgres;

--
-- Name: marketplace_pending_selections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marketplace_pending_selections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_company_id uuid NOT NULL,
    buyer_profile_id uuid,
    query_text text NOT NULL,
    options jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL,
    consumed_at timestamp with time zone
);


ALTER TABLE public.marketplace_pending_selections OWNER TO postgres;

--
-- Name: marketplace_product_index; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marketplace_product_index (
    company_id uuid NOT NULL,
    product_key text NOT NULL,
    product_name text NOT NULL,
    normalized_name text NOT NULL,
    barcodes text[] DEFAULT '{}'::text[] NOT NULL,
    indexed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.marketplace_product_index OWNER TO postgres;

--
-- Name: merchant_memory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.merchant_memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    match_key text NOT NULL,
    vendor_name text NOT NULL,
    vendor_tin text,
    vendor_vrn text,
    category text,
    learned_from_receipt_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_memory_match_key_check CHECK (((char_length(TRIM(BOTH FROM match_key)) >= 3) AND (char_length(TRIM(BOTH FROM match_key)) <= 180))),
    CONSTRAINT merchant_memory_vendor_name_check CHECK (((char_length(TRIM(BOTH FROM vendor_name)) >= 1) AND (char_length(TRIM(BOTH FROM vendor_name)) <= 180)))
);


ALTER TABLE public.merchant_memory OWNER TO postgres;

--
-- Name: obligation_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.obligation_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    obligation_id uuid NOT NULL,
    company_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    covers_from date NOT NULL,
    covers_to date NOT NULL,
    paid_on date NOT NULL,
    recorded_by uuid,
    daily_record_id uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT obligation_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT obligation_payments_check CHECK ((covers_to >= covers_from))
);


ALTER TABLE public.obligation_payments OWNER TO postgres;

--
-- Name: ops_incidents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ops_incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    severity text NOT NULL,
    title text NOT NULL,
    detail text NOT NULL,
    owner text NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    clean_checks integer DEFAULT 0 NOT NULL,
    acknowledged_by uuid,
    acknowledged_at timestamp with time zone,
    acknowledgment text,
    CONSTRAINT ops_incidents_severity_check CHECK ((severity = ANY (ARRAY['down'::text, 'warn'::text])))
);


ALTER TABLE public.ops_incidents OWNER TO postgres;

--
-- Name: ops_monitor_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ops_monitor_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    complete boolean NOT NULL,
    findings jsonb NOT NULL,
    email_configured boolean DEFAULT false NOT NULL
);


ALTER TABLE public.ops_monitor_runs OWNER TO postgres;

--
-- Name: ops_privacy_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ops_privacy_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    kind text NOT NULL,
    status text DEFAULT 'received'::text NOT NULL,
    note text NOT NULL,
    due_at date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    CONSTRAINT ops_privacy_requests_kind_check CHECK ((kind = ANY (ARRAY['access'::text, 'correction'::text, 'export'::text, 'deletion'::text, 'complaint'::text]))),
    CONSTRAINT ops_privacy_requests_note_check CHECK (((length(btrim(note)) >= 10) AND (length(btrim(note)) <= 1000))),
    CONSTRAINT ops_privacy_requests_status_check CHECK ((status = ANY (ARRAY['received'::text, 'verified'::text, 'in_progress'::text, 'closed'::text])))
);


ALTER TABLE public.ops_privacy_requests OWNER TO postgres;

--
-- Name: ops_recovery_evidence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ops_recovery_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    result text NOT NULL,
    summary text NOT NULL,
    evidence_url text NOT NULL,
    tested_at timestamp with time zone NOT NULL,
    recorded_by uuid NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ops_recovery_evidence_evidence_url_check CHECK ((evidence_url ~ '^https://[^[:space:]]+$'::text)),
    CONSTRAINT ops_recovery_evidence_kind_check CHECK ((kind = ANY (ARRAY['backup_restore'::text, 'retry_recovery'::text, 'ai_evaluation'::text, 'access_review'::text]))),
    CONSTRAINT ops_recovery_evidence_result_check CHECK ((result = ANY (ARRAY['passed'::text, 'failed'::text, 'unverified'::text]))),
    CONSTRAINT ops_recovery_evidence_summary_check CHECK (((length(btrim(summary)) >= 10) AND (length(btrim(summary)) <= 1000)))
);


ALTER TABLE public.ops_recovery_evidence OWNER TO postgres;

--
-- Name: petty_cash_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.petty_cash_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    current_balance numeric(14,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.petty_cash_accounts OWNER TO postgres;

--
-- Name: petty_cash_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.petty_cash_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    type text NOT NULL,
    receipt_id uuid,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    project_id uuid,
    status text DEFAULT 'accepted'::text NOT NULL,
    responded_at timestamp with time zone,
    reverses_transaction_id uuid,
    reversal_reason text,
    reversed_at timestamp with time zone,
    reversed_by_transaction_id uuid,
    CONSTRAINT petty_cash_no_self_reversal CHECK (((reverses_transaction_id IS DISTINCT FROM id) AND (reversed_by_transaction_id IS DISTINCT FROM id))),
    CONSTRAINT petty_cash_reversal_needs_reason CHECK (((reverses_transaction_id IS NULL) OR (COALESCE(length(btrim(reversal_reason)), 0) >= 10))),
    CONSTRAINT petty_cash_reversed_marker_complete CHECK (((reversed_at IS NULL) = (reversed_by_transaction_id IS NULL))),
    CONSTRAINT petty_cash_transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text]))),
    CONSTRAINT petty_cash_transactions_type_check CHECK ((type = ANY (ARRAY['allocation'::text, 'expense'::text, 'adjustment'::text])))
);


ALTER TABLE public.petty_cash_transactions OWNER TO postgres;

--
-- Name: platform_admin_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid,
    admin_role public.platform_admin_role NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    reason text NOT NULL,
    before_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    after_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_admin_audit_logs_action_check CHECK (((length(action) >= 1) AND (length(action) <= 96))),
    CONSTRAINT platform_admin_audit_logs_reason_check CHECK (((length(reason) >= 1) AND (length(reason) <= 1000))),
    CONSTRAINT platform_admin_audit_logs_target_type_check CHECK (((length(target_type) >= 1) AND (length(target_type) <= 64)))
);


ALTER TABLE public.platform_admin_audit_logs OWNER TO postgres;

--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_admins (
    user_id uuid NOT NULL,
    role public.platform_admin_role NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.platform_admins OWNER TO postgres;

--
-- Name: platform_expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    category text NOT NULL,
    description text NOT NULL,
    amount_tzs integer NOT NULL,
    occurred_on date DEFAULT CURRENT_DATE NOT NULL,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT platform_expenses_amount_tzs_check CHECK ((amount_tzs > 0)),
    CONSTRAINT platform_expenses_category_check CHECK ((category = ANY (ARRAY['storage'::text, 'whatsapp_api'::text, 'email_resend'::text, 'edge_runtime'::text, 'ai_override'::text, 'snippe_fees'::text, 'infrastructure'::text, 'support'::text, 'marketing'::text, 'tax'::text, 'other'::text]))),
    CONSTRAINT platform_expenses_description_check CHECK (((length(btrim(description)) >= 1) AND (length(btrim(description)) <= 500)))
);


ALTER TABLE public.platform_expenses OWNER TO postgres;

--
-- Name: product_archives; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_archives (
    company_id uuid NOT NULL,
    product_key text NOT NULL,
    archived_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    archived_by uuid,
    reason text
);


ALTER TABLE public.product_archives OWNER TO postgres;

--
-- Name: product_barcodes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_barcodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    barcode text NOT NULL,
    product_key text NOT NULL,
    product_name text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_barcodes_digits CHECK ((barcode ~ '^[0-9]{6,18}$'::text)),
    CONSTRAINT product_barcodes_key CHECK (((length(btrim(product_key)) >= 1) AND (length(btrim(product_key)) <= 120))),
    CONSTRAINT product_barcodes_name CHECK (((length(btrim(product_name)) >= 1) AND (length(btrim(product_name)) <= 120)))
);


ALTER TABLE public.product_barcodes OWNER TO postgres;

--
-- Name: TABLE product_barcodes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.product_barcodes IS 'Scanned product codes mapped to this company''s own product_key. Descriptive only: never read by finance, stock or permissions.';


--
-- Name: product_combos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_combos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    name_key text NOT NULL,
    pieces jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_combos_name_key_len CHECK (((length(name_key) >= 2) AND (length(name_key) <= 80))),
    CONSTRAINT product_combos_pieces_shape CHECK (((jsonb_typeof(pieces) = 'array'::text) AND ((jsonb_array_length(pieces) >= 1) AND (jsonb_array_length(pieces) <= 6))))
);


ALTER TABLE public.product_combos OWNER TO postgres;

--
-- Name: TABLE product_combos; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.product_combos IS 'Shop-taught names for combinations of products (chips yai, zege). A reading rule only: sales are still stored as per-product lines.';


--
-- Name: product_cost_prompts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_cost_prompts (
    company_id uuid NOT NULL,
    product_key text NOT NULL,
    profile_id uuid NOT NULL,
    asked_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT product_cost_prompts_skipped_count_check CHECK ((skipped_count >= 0))
);


ALTER TABLE public.product_cost_prompts OWNER TO postgres;

--
-- Name: product_costs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_costs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    product_key text NOT NULL,
    product_name text NOT NULL,
    unit text,
    unit_cost numeric(14,2) NOT NULL,
    currency text NOT NULL,
    effective_from timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    recorded_by uuid,
    note text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    base_unit text,
    unit_base_quantity numeric(18,6),
    base_unit_cost numeric(18,6),
    CONSTRAINT product_costs_base_unit_cost_positive CHECK (((base_unit_cost IS NULL) OR (base_unit_cost > (0)::numeric))),
    CONSTRAINT product_costs_unit_base_quantity_positive CHECK (((unit_base_quantity IS NULL) OR (unit_base_quantity > (0)::numeric))),
    CONSTRAINT product_costs_unit_cost_check CHECK ((unit_cost > (0)::numeric)),
    CONSTRAINT product_costs_unit_is_a_word CHECK (((unit IS NULL) OR (unit ~ '[[:alpha:]]'::text)))
);


ALTER TABLE public.product_costs OWNER TO postgres;

--
-- Name: product_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    product_key text NOT NULL,
    target_key text,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT product_events_action_check CHECK ((action = ANY (ARRAY['merge'::text, 'archive'::text, 'unarchive'::text, 'rename'::text])))
);


ALTER TABLE public.product_events OWNER TO postgres;

--
-- Name: product_selling_prices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_selling_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    product_key text NOT NULL,
    product_name text NOT NULL,
    retail_price numeric(14,2) NOT NULL,
    wholesale_price numeric(14,2),
    wholesale_min_qty numeric(14,3),
    currency text NOT NULL,
    effective_from timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    recorded_by uuid,
    note text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    sale_unit text,
    sale_unit_key text,
    unit_base_quantity numeric(18,6),
    CONSTRAINT product_selling_prices_retail_price_check CHECK ((retail_price > (0)::numeric)),
    CONSTRAINT product_selling_prices_wholesale_min_qty_check CHECK (((wholesale_min_qty IS NULL) OR (wholesale_min_qty > (0)::numeric))),
    CONSTRAINT product_selling_prices_wholesale_price_check CHECK (((wholesale_price IS NULL) OR (wholesale_price > (0)::numeric))),
    CONSTRAINT selling_prices_unit_base_quantity_positive CHECK (((unit_base_quantity IS NULL) OR (unit_base_quantity > (0)::numeric))),
    CONSTRAINT selling_prices_wholesale_not_higher CHECK (((wholesale_price IS NULL) OR (wholesale_price <= retail_price)))
);


ALTER TABLE public.product_selling_prices OWNER TO postgres;

--
-- Name: product_unit_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_unit_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    product_key text NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE public.product_unit_audit_log OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    company_id uuid,
    full_name text NOT NULL,
    phone text,
    role public.user_role NOT NULL,
    deactivated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    active_company_id uuid,
    lang text,
    CONSTRAINT profiles_lang_check CHECK (((lang IS NULL) OR (lang = ANY (ARRAY['en'::text, 'sw'::text]))))
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: project_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.project_members (
    project_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    CONSTRAINT project_members_role_check CHECK ((role = ANY (ARRAY['member'::text, 'leader'::text])))
);


ALTER TABLE public.project_members OWNER TO postgres;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    site_location text,
    client_name text,
    start_date date,
    description text,
    status public.project_status DEFAULT 'active'::public.project_status NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    petty_cash_budget numeric(14,2) DEFAULT 0 NOT NULL
);


ALTER TABLE public.projects OWNER TO postgres;

--
-- Name: receipt_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.receipt_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    receipt_id uuid NOT NULL,
    user_id uuid NOT NULL,
    nickname text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT receipt_aliases_nickname_check CHECK (((char_length(TRIM(BOTH FROM nickname)) >= 1) AND (char_length(TRIM(BOTH FROM nickname)) <= 120)))
);


ALTER TABLE public.receipt_aliases OWNER TO postgres;

--
-- Name: receipt_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.receipt_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    receipt_id uuid,
    actor_id uuid,
    event text NOT NULL,
    old_status text,
    new_status text,
    old_amount numeric(14,2),
    new_amount numeric(14,2),
    payment_method text,
    petty_cash_account_id uuid,
    petty_cash_transaction_id uuid,
    reason text,
    self_approved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.receipt_audit_log OWNER TO postgres;

--
-- Name: receipts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    company_id uuid NOT NULL,
    uploaded_by uuid,
    image_url text,
    vendor_name text,
    vendor_tin text,
    vendor_vrn text,
    receipt_number text,
    verification_code text,
    receipt_date date,
    receipt_time time without time zone,
    total_amount numeric(14,2),
    tax_amount numeric(14,2),
    category text,
    status public.receipt_status DEFAULT 'processing'::public.receipt_status NOT NULL,
    raw_ai_response jsonb,
    low_confidence_fields text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scanned_doc_id uuid,
    payment_method text,
    duplicate_of uuid,
    reimbursed_at timestamp with time zone,
    reimbursed_by uuid,
    source text DEFAULT 'web'::text NOT NULL,
    details_confirmed boolean DEFAULT true NOT NULL,
    payment_method_suggested text,
    payment_method_reason text,
    submitted_at timestamp with time zone,
    submitted_by uuid,
    decided_at timestamp with time zone,
    decided_by uuid,
    decision_reason text,
    tra_status text,
    tra_verified_at timestamp with time zone,
    tra_differences jsonb,
    CONSTRAINT receipts_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash_personal'::text, 'petty_cash'::text, 'company_card'::text]))),
    CONSTRAINT receipts_payment_method_suggested_check CHECK ((payment_method_suggested = ANY (ARRAY['cash_personal'::text, 'petty_cash'::text, 'company_card'::text]))),
    CONSTRAINT receipts_source_check CHECK ((source = ANY (ARRAY['web'::text, 'batch'::text, 'inbound_email'::text, 'whatsapp'::text]))),
    CONSTRAINT receipts_tra_status_check CHECK (((tra_status IS NULL) OR (tra_status = ANY (ARRAY['verified'::text, 'not_found'::text, 'unreachable'::text, 'not_applicable'::text]))))
);

ALTER TABLE ONLY public.receipts REPLICA IDENTITY FULL;


ALTER TABLE public.receipts OWNER TO postgres;

--
-- Name: COLUMN receipts.payment_method; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.receipts.payment_method IS 'Confirmed payment source. NULL means nobody has confirmed it yet; such a receipt must not be treated as a reimbursement or as petty cash spend.';


--
-- Name: COLUMN receipts.details_confirmed; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.receipts.details_confirmed IS 'False until a human has chosen project, category and payment source. Receipts with false must not be approved or counted as project spend.';


--
-- Name: COLUMN receipts.payment_method_suggested; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.receipts.payment_method_suggested IS 'Proposal only, e.g. parsed from a WhatsApp caption. Never authoritative.';


--
-- Name: COLUMN receipts.tra_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.receipts.tra_status IS 'Result of the verify.tra.go.tz lookup. "verified" means the stored figures are TRA''s own.';


--
-- Name: COLUMN receipts.tra_differences; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.receipts.tra_differences IS 'Fields where the model disagreed with TRA, as [{field, extracted, official}].';


--
-- Name: recurring_obligations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recurring_obligations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    kind text NOT NULL,
    label text,
    amount numeric(14,2) NOT NULL,
    period_months integer NOT NULL,
    effective_from date NOT NULL,
    superseded_at timestamp with time zone,
    next_due_on date NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT recurring_obligations_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT recurring_obligations_kind_check CHECK ((kind = ANY (ARRAY['rent'::text, 'licence'::text, 'electricity'::text, 'water'::text, 'security'::text, 'other'::text]))),
    CONSTRAINT recurring_obligations_period_months_check CHECK ((period_months = ANY (ARRAY[1, 2, 3, 4, 6, 12])))
);


ALTER TABLE public.recurring_obligations OWNER TO postgres;

--
-- Name: TABLE recurring_obligations; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.recurring_obligations IS 'Rent and other costs that fall due on a schedule. Append-only: a change of amount is a new row that supersedes the old, so last year''s rent is still answerable.';


--
-- Name: reimbursement_payout_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reimbursement_payout_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payout_id uuid NOT NULL,
    receipt_id uuid NOT NULL,
    amount_paid numeric(14,2) NOT NULL,
    voided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reimbursement_payout_items_amount_paid_check CHECK ((amount_paid > (0)::numeric))
);


ALTER TABLE public.reimbursement_payout_items OWNER TO postgres;

--
-- Name: reimbursement_payouts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reimbursement_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    paid_to uuid,
    paid_by uuid,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    total_amount numeric(14,2) NOT NULL,
    method text,
    reference text,
    note text,
    voided_at timestamp with time zone,
    voided_by uuid,
    void_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payout_void_marker_complete CHECK (((voided_at IS NULL) = (voided_by IS NULL))),
    CONSTRAINT payout_void_needs_reason CHECK (((voided_at IS NULL) OR (COALESCE(length(btrim(void_reason)), 0) >= 10))),
    CONSTRAINT reimbursement_payouts_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'mobile_money'::text, 'bank'::text, 'other'::text]))),
    CONSTRAINT reimbursement_payouts_total_amount_check CHECK ((total_amount > (0)::numeric))
);


ALTER TABLE public.reimbursement_payouts OWNER TO postgres;

--
-- Name: scanned_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scanned_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    project_id uuid NOT NULL,
    file_url text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.scanned_documents OWNER TO postgres;

--
-- Name: shop_order_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shop_order_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    event text NOT NULL,
    actor_company_id uuid NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE public.shop_order_events OWNER TO postgres;

--
-- Name: shop_order_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shop_order_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_key text NOT NULL,
    product_name text NOT NULL,
    unit text,
    quantity numeric(14,3) NOT NULL,
    wholesale_unit_price numeric(14,2) NOT NULL,
    line_total numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT shop_order_lines_line_total_check CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT shop_order_lines_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT shop_order_lines_wholesale_unit_price_check CHECK ((wholesale_unit_price >= (0)::numeric))
);


ALTER TABLE public.shop_order_lines OWNER TO postgres;

--
-- Name: shop_order_no_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.shop_order_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.shop_order_no_seq OWNER TO postgres;

--
-- Name: shop_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shop_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_no text NOT NULL,
    buyer_company_id uuid NOT NULL,
    supplier_company_id uuid NOT NULL,
    status text DEFAULT 'placed'::text NOT NULL,
    currency text DEFAULT 'TZS'::text NOT NULL,
    total_wholesale numeric(14,2) DEFAULT 0 NOT NULL,
    note text,
    supplier_phone_e164 text,
    placed_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    accepted_at timestamp with time zone,
    rejected_at timestamp with time zone,
    delivered_at timestamp with time zone,
    verified_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT shop_orders_status_check CHECK ((status = ANY (ARRAY['placed'::text, 'accepted'::text, 'rejected'::text, 'delivered'::text, 'verified'::text, 'cancelled'::text]))),
    CONSTRAINT shop_orders_swap CHECK ((buyer_company_id <> supplier_company_id)),
    CONSTRAINT shop_orders_total_wholesale_check CHECK ((total_wholesale >= (0)::numeric))
);


ALTER TABLE public.shop_orders OWNER TO postgres;

--
-- Name: staff_retirement_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_retirement_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    retirement_id uuid NOT NULL,
    company_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    from_status public.staff_retirement_status,
    to_status public.staff_retirement_status,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_retirement_audit_log_action_check CHECK ((action = ANY (ARRAY['legacy_imported'::text, 'created'::text, 'resubmitted'::text, 'viewed'::text, 'approved'::text, 'changes_requested'::text, 'rejected'::text, 'paid'::text, 'received_confirmed'::text, 'cancelled'::text])))
);


ALTER TABLE public.staff_retirement_audit_log OWNER TO postgres;

--
-- Name: staff_retirement_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_retirement_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    retirement_id uuid NOT NULL,
    company_id uuid NOT NULL,
    project_id uuid NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_type text,
    ai_status text DEFAULT 'not_scanned'::text NOT NULL,
    ai_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.staff_retirement_documents OWNER TO postgres;

--
-- Name: staff_retirement_receipts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_retirement_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    retirement_id uuid NOT NULL,
    receipt_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.staff_retirement_receipts OWNER TO postgres;

--
-- Name: staff_retirements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_retirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    project_id uuid NOT NULL,
    staff_id uuid,
    title text DEFAULT 'Receipt retirement'::text NOT NULL,
    notes text,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    status public.staff_retirement_status DEFAULT 'submitted'::public.staff_retirement_status NOT NULL,
    viewed_at timestamp with time zone,
    approved_at timestamp with time zone,
    paid_at timestamp with time zone,
    received_confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    change_request_note text,
    change_request_receipt_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    submitted_at timestamp with time zone,
    submitted_by uuid,
    viewed_by uuid,
    approved_by uuid,
    paid_by uuid,
    received_confirmed_by uuid,
    cancelled_by uuid,
    cancelled_at timestamp with time zone,
    rejected_by uuid,
    rejected_at timestamp with time zone,
    decision_reason text,
    payment_method text,
    payment_reference text,
    paid_amount_snapshot numeric(14,2),
    CONSTRAINT staff_retirements_payment_method_check CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['cash'::text, 'mobile_money'::text, 'bank'::text, 'other'::text]))))
);


ALTER TABLE public.staff_retirements OWNER TO postgres;

--
-- Name: stock_counts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_counts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    product_key text NOT NULL,
    product_name text NOT NULL,
    quantity numeric(14,3) NOT NULL,
    unit text,
    counted_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    counted_by uuid,
    note text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    reported_quantity numeric(18,6),
    reported_unit text,
    unit_base_quantity numeric(18,6),
    CONSTRAINT stock_counts_quantity_check CHECK ((quantity >= (0)::numeric)),
    CONSTRAINT stock_counts_reported_quantity_nonnegative CHECK (((reported_quantity IS NULL) OR (reported_quantity >= (0)::numeric))),
    CONSTRAINT stock_counts_unit_base_quantity_positive CHECK (((unit_base_quantity IS NULL) OR (unit_base_quantity > (0)::numeric))),
    CONSTRAINT stock_counts_unit_is_a_word CHECK (((unit IS NULL) OR (unit ~ '[[:alpha:]]'::text)))
);


ALTER TABLE public.stock_counts OWNER TO postgres;

--
-- Name: subscription_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscription_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    invoice_id uuid,
    external_event_id text,
    kind text NOT NULL,
    payload jsonb,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE public.subscription_events OWNER TO postgres;

--
-- Name: subscription_invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscription_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    company_id uuid NOT NULL,
    plan text NOT NULL,
    cycle text NOT NULL,
    amount_tzs integer NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    snippe_reference text,
    snippe_status text,
    attempts smallint DEFAULT 0 NOT NULL,
    paid_at timestamp with time zone,
    paid_manually_by uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT subscription_invoices_amount_tzs_check CHECK ((amount_tzs > 0)),
    CONSTRAINT subscription_invoices_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT subscription_invoices_cycle_check CHECK ((cycle = ANY (ARRAY['monthly'::text, 'yearly'::text]))),
    CONSTRAINT subscription_invoices_period_forward CHECK ((period_end > period_start)),
    CONSTRAINT subscription_invoices_status_check CHECK ((status = ANY (ARRAY['open'::text, 'paid'::text, 'failed'::text, 'void'::text])))
);


ALTER TABLE public.subscription_invoices OWNER TO postgres;

--
-- Name: subscription_usage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscription_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    company_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    messages_used integer DEFAULT 0 NOT NULL,
    allowance integer NOT NULL,
    refreshed_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT subscription_usage_allowance_check CHECK ((allowance > 0)),
    CONSTRAINT subscription_usage_messages_used_check CHECK ((messages_used >= 0)),
    CONSTRAINT subscription_usage_period_forward CHECK ((period_end > period_start))
);


ALTER TABLE public.subscription_usage OWNER TO postgres;

--
-- Name: TABLE subscription_usage; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.subscription_usage IS 'One row per subscription per billing period. Counts messages the shop sent. Never blocks anything: the allowance is soft and enforcement is a conversation, not a wall.';


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    plan text NOT NULL,
    cycle text NOT NULL,
    status text DEFAULT 'trialing'::text NOT NULL,
    trial_ends_at timestamp with time zone,
    current_period_start date NOT NULL,
    current_period_end date NOT NULL,
    grace_until date,
    billing_phone text,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT subscriptions_cycle_check CHECK ((cycle = ANY (ARRAY['monthly'::text, 'yearly'::text]))),
    CONSTRAINT subscriptions_period_forward CHECK ((current_period_end > current_period_start)),
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'suspended'::text, 'cancelled'::text])))
);


ALTER TABLE public.subscriptions OWNER TO postgres;

--
-- Name: TABLE subscriptions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.subscriptions IS 'One row per company. Every company has one: created with a five-day trial by the onboarding RPCs, and backfilled for companies that registered earlier.';


--
-- Name: COLUMN subscriptions.status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.subscriptions.status IS 'suspended never deletes and never hides history: the shop reads its own books forever, it only stops being able to add to them.';


--
-- Name: supplier_claim_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_claim_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    company_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    from_status public.supplier_claim_status,
    to_status public.supplier_claim_status,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_claim_audit_log_action_check CHECK ((action = ANY (ARRAY['legacy_imported'::text, 'viewed'::text, 'approved_for_payment'::text, 'disputed'::text, 'paid'::text, 'received_confirmed'::text])))
);


ALTER TABLE public.supplier_claim_audit_log OWNER TO postgres;

--
-- Name: supplier_claim_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_claim_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    author_side text NOT NULL,
    author_name text,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_claim_messages_author_side_check CHECK ((author_side = ANY (ARRAY['supplier'::text, 'company'::text])))
);


ALTER TABLE public.supplier_claim_messages OWNER TO postgres;

--
-- Name: supplier_claim_receipts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_claim_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    vendor_name text,
    receipt_date date,
    total_amount numeric(14,2),
    tax_amount numeric(14,2),
    category text,
    verification_code text,
    image_url text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.supplier_claim_receipts OWNER TO postgres;

--
-- Name: supplier_claims; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    target_company_id uuid NOT NULL,
    title text NOT NULL,
    claim_note text,
    amount numeric(14,2),
    status public.supplier_claim_status DEFAULT 'submitted'::public.supplier_claim_status NOT NULL,
    public_token text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
    viewed_at timestamp with time zone,
    paid_at timestamp with time zone,
    received_confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    viewed_by uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    disputed_by uuid,
    disputed_at timestamp with time zone,
    paid_by uuid,
    paid_amount_snapshot numeric(14,2),
    payment_method text,
    payment_reference text,
    payment_note text,
    decision_reason text,
    CONSTRAINT supplier_claims_payment_method_check CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['cash'::text, 'mobile_money'::text, 'bank'::text, 'other'::text]))))
);


ALTER TABLE public.supplier_claims OWNER TO postgres;

--
-- Name: supplier_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_company_id uuid NOT NULL,
    supplier_name text NOT NULL,
    contact_name text NOT NULL,
    contact_email text,
    contact_phone text,
    supplier_tin text,
    note text,
    status public.supplier_connection_status DEFAULT 'pending'::public.supplier_connection_status NOT NULL,
    public_token text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.supplier_connections OWNER TO postgres;

--
-- Name: wa_login_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wa_login_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    profile_id uuid NOT NULL,
    phone_e164 text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.wa_login_tokens OWNER TO postgres;

--
-- Name: wa_web_auth_request_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wa_web_auth_request_log (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    phone_hash text NOT NULL,
    ip_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wa_web_auth_request_log_ip_hash_check CHECK ((ip_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT wa_web_auth_request_log_phone_hash_check CHECK ((phone_hash ~ '^[0-9a-f]{64}$'::text))
);


ALTER TABLE public.wa_web_auth_request_log OWNER TO postgres;

--
-- Name: TABLE wa_web_auth_request_log; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.wa_web_auth_request_log IS 'HMAC fingerprints used only for WhatsApp login request rate limiting; no raw phone or IP is stored.';


--
-- Name: web_signup_drafts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.web_signup_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_hash text NOT NULL,
    business_name text NOT NULL,
    business_description text NOT NULL,
    full_name text NOT NULL,
    location text NOT NULL,
    opening_time text NOT NULL,
    closing_time text NOT NULL,
    lang text DEFAULT 'sw'::text NOT NULL,
    claimed_by_phone text,
    claimed_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_ip text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    terms_version text,
    terms_accepted_at timestamp with time zone,
    CONSTRAINT web_signup_drafts_lang_check CHECK ((lang = ANY (ARRAY['sw'::text, 'en'::text]))),
    CONSTRAINT web_signup_drafts_time_check CHECK (((opening_time ~ '^[0-2][0-9]:[0-5][0-9]$'::text) AND (closing_time ~ '^[0-2][0-9]:[0-5][0-9]$'::text))),
    CONSTRAINT web_signup_terms_pair CHECK (((terms_version IS NULL) = (terms_accepted_at IS NULL)))
);


ALTER TABLE public.web_signup_drafts OWNER TO postgres;

--
-- Name: whatsapp_ai_interpretations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_ai_interpretations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    wa_message_id text NOT NULL,
    model text,
    prompt_version text,
    tool_schema_version text,
    chosen_tool text,
    semantic_intent text DEFAULT 'unknown'::text NOT NULL,
    tool_rounds smallint,
    latency_ms integer,
    backend_outcome text NOT NULL,
    rejection_code text,
    clarification_field text,
    fallback_used boolean DEFAULT false NOT NULL,
    fallback_reason text,
    provider_failure_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    route text,
    cache_read_tokens integer,
    cache_write_tokens integer,
    failure_layer text,
    retrieval_status text,
    conversation_state text,
    tool_result_status text,
    tool_failure_code text,
    runtime_version text,
    CONSTRAINT ai_interp_conversation_state_check CHECK (((conversation_state IS NULL) OR (conversation_state = ANY (ARRAY['none'::text, 'history'::text, 'active_question'::text, 'unknown'::text])))),
    CONSTRAINT ai_interp_failure_layer_check CHECK (((failure_layer IS NULL) OR (failure_layer = ANY (ARRAY['none'::text, 'input'::text, 'model'::text, 'tool_schema'::text, 'tool_execution'::text, 'backend_validation'::text, 'provider'::text, 'grounding'::text, 'retrieval'::text, 'state'::text, 'budget'::text, 'database'::text, 'deployment'::text, 'unknown'::text])))),
    CONSTRAINT ai_interp_fallback_reason_check CHECK (((fallback_reason IS NULL) OR (fallback_reason = ANY (ARRAY['model_success'::text, 'model_empty'::text, 'provider_error'::text, 'provider_timeout'::text, 'budget_block'::text, 'invalid_tool_schema'::text, 'model_reply_deferred_for_safety'::text, 'not_eligible'::text])))),
    CONSTRAINT ai_interp_latency_check CHECK (((latency_ms IS NULL) OR ((latency_ms >= 0) AND (latency_ms <= 600000)))),
    CONSTRAINT ai_interp_observability_code_lengths_check CHECK (((COALESCE(length(tool_failure_code), 0) <= 96) AND (COALESCE(length(runtime_version), 0) <= 64))),
    CONSTRAINT ai_interp_outcome_check CHECK ((backend_outcome = ANY (ARRAY['answered'::text, 'drafted'::text, 'clarified'::text, 'rejected'::text, 'fallback'::text, 'provider_failed'::text, 'budget_blocked'::text]))),
    CONSTRAINT ai_interp_retrieval_status_check CHECK (((retrieval_status IS NULL) OR (retrieval_status = ANY (ARRAY['available'::text, 'partial'::text, 'unavailable'::text, 'not_run'::text, 'unknown'::text])))),
    CONSTRAINT ai_interp_rounds_check CHECK (((tool_rounds IS NULL) OR ((tool_rounds >= 0) AND (tool_rounds <= 20)))),
    CONSTRAINT ai_interp_route_check CHECK (((route IS NULL) OR (route = ANY (ARRAY['ai_primary'::text, 'pending_protocol'::text, 'ai_outage_fallback'::text])))),
    CONSTRAINT ai_interp_short_codes_check CHECK (((COALESCE(length(chosen_tool), 0) <= 64) AND (COALESCE(length(semantic_intent), 0) <= 48) AND (COALESCE(length(rejection_code), 0) <= 64) AND (COALESCE(length(clarification_field), 0) <= 48) AND (COALESCE(length(provider_failure_code), 0) <= 200) AND (COALESCE(length(model), 0) <= 64) AND (COALESCE(length(prompt_version), 0) <= 48) AND (COALESCE(length(tool_schema_version), 0) <= 48))),
    CONSTRAINT ai_interp_tool_result_status_check CHECK (((tool_result_status IS NULL) OR (tool_result_status = ANY (ARRAY['none'::text, 'success'::text, 'error'::text, 'unknown'::text]))))
);


ALTER TABLE public.whatsapp_ai_interpretations OWNER TO postgres;

--
-- Name: TABLE whatsapp_ai_interpretations; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.whatsapp_ai_interpretations IS 'Stage A telemetry: what the assistant DID with a message. Never what the trader wrote. No message text, names, prices or balances. Expires after 30 days.';


--
-- Name: COLUMN whatsapp_ai_interpretations.route; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_ai_interpretations.route IS 'Who interpreted this message: ai_primary (the model, and the expected value for ordinary business language), pending_protocol (a bounded answer to a question Risip asked), ai_outage_fallback (the deterministic parsers, because the model could not be reached).';


--
-- Name: COLUMN whatsapp_ai_interpretations.cache_read_tokens; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_ai_interpretations.cache_read_tokens IS 'Prefix tokens served from cache across the whole turn. Zero with a non-zero write means something upstream changed between calls and the cache was paid for and thrown away.';


--
-- Name: COLUMN whatsapp_ai_interpretations.cache_write_tokens; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_ai_interpretations.cache_write_tokens IS 'Prefix tokens written to cache across the whole turn, billed at 1.25x.';


--
-- Name: COLUMN whatsapp_ai_interpretations.failure_layer; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_ai_interpretations.failure_layer IS 'Bounded root-cause layer for platform operations; never merchant text.';


--
-- Name: COLUMN whatsapp_ai_interpretations.retrieval_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_ai_interpretations.retrieval_status IS 'Aggregate availability of the company-scoped RAG lookup for this turn.';


--
-- Name: COLUMN whatsapp_ai_interpretations.conversation_state; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_ai_interpretations.conversation_state IS 'Whether the turn had no context, bounded history, or an active question.';


--
-- Name: COLUMN whatsapp_ai_interpretations.tool_result_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_ai_interpretations.tool_result_status IS 'Aggregate tool outcome only: none, success, error, or unknown.';


--
-- Name: COLUMN whatsapp_ai_interpretations.tool_failure_code; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_ai_interpretations.tool_failure_code IS 'Bounded infrastructure or validation code; never tool output.';


--
-- Name: COLUMN whatsapp_ai_interpretations.runtime_version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_ai_interpretations.runtime_version IS 'Semantic source release emitted by the deployed WhatsApp runtime.';


--
-- Name: whatsapp_ai_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_ai_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_id uuid NOT NULL,
    company_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    wa_message_id text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    expires_at timestamp with time zone DEFAULT (clock_timestamp() + '7 days'::interval) NOT NULL,
    CONSTRAINT whatsapp_ai_messages_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 4000))),
    CONSTRAINT whatsapp_ai_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text]))),
    CONSTRAINT whatsapp_ai_messages_wa_message_id_check CHECK (((char_length(wa_message_id) >= 1) AND (char_length(wa_message_id) <= 255)))
);


ALTER TABLE public.whatsapp_ai_messages OWNER TO postgres;

--
-- Name: whatsapp_ai_threads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_ai_threads (
    identity_id uuid NOT NULL,
    company_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    topic text,
    entities jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_tool text,
    expires_at timestamp with time zone DEFAULT (clock_timestamp() + '24:00:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT whatsapp_ai_threads_entities_check CHECK ((jsonb_typeof(entities) = 'object'::text)),
    CONSTRAINT whatsapp_ai_threads_last_tool_check CHECK (((last_tool IS NULL) OR (char_length(last_tool) <= 100))),
    CONSTRAINT whatsapp_ai_threads_topic_check CHECK (((topic IS NULL) OR (char_length(topic) <= 100)))
);


ALTER TABLE public.whatsapp_ai_threads OWNER TO postgres;

--
-- Name: whatsapp_ai_usage_daily; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_ai_usage_daily (
    company_id uuid NOT NULL,
    usage_day date DEFAULT (timezone('utc'::text, clock_timestamp()))::date NOT NULL,
    fallback_count integer DEFAULT 0 NOT NULL,
    input_chars integer DEFAULT 0 NOT NULL,
    estimated_cost numeric(12,6) DEFAULT 0 NOT NULL,
    blocked_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT whatsapp_ai_usage_daily_blocked_count_check CHECK ((blocked_count >= 0)),
    CONSTRAINT whatsapp_ai_usage_daily_estimated_cost_check CHECK ((estimated_cost >= (0)::numeric)),
    CONSTRAINT whatsapp_ai_usage_daily_fallback_count_check CHECK ((fallback_count >= 0)),
    CONSTRAINT whatsapp_ai_usage_daily_input_chars_check CHECK ((input_chars >= 0))
);


ALTER TABLE public.whatsapp_ai_usage_daily OWNER TO postgres;

--
-- Name: whatsapp_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    profile_id uuid,
    wa_message_id text,
    intent text,
    action text,
    outcome text,
    receipt_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    message_text text,
    claimed_by text
);


ALTER TABLE public.whatsapp_audit_log OWNER TO postgres;

--
-- Name: COLUMN whatsapp_audit_log.message_text; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_audit_log.message_text IS 'Inbound text, phone-shaped digit runs masked. Never a media caption from an unlinked number.';


--
-- Name: COLUMN whatsapp_audit_log.claimed_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_audit_log.claimed_by IS 'The parser that handled the message. conversational_ai means nothing deterministic matched.';


--
-- Name: whatsapp_conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_conversations (
    identity_id uuid NOT NULL,
    company_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    awaiting text,
    receipt_id uuid,
    options jsonb,
    expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    chat_day date DEFAULT ((now() AT TIME ZONE 'Africa/Dar_es_Salaam'::text))::date NOT NULL,
    CONSTRAINT whatsapp_conversations_awaiting_check CHECK ((awaiting = ANY (ARRAY['language'::text, 'project'::text, 'payment_source'::text, 'business'::text, 'product_cost'::text, 'product_analytics'::text, 'logout_confirm'::text, 'account_delete_confirm'::text, 'shop_order'::text])))
);


ALTER TABLE public.whatsapp_conversations OWNER TO postgres;

--
-- Name: whatsapp_daily_nudges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_daily_nudges (
    identity_id uuid NOT NULL,
    business_date date NOT NULL,
    kind text NOT NULL,
    sent_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT whatsapp_daily_nudges_kind_check CHECK ((kind = ANY (ARRAY['batch_hint'::text, 'close_reminder'::text])))
);


ALTER TABLE public.whatsapp_daily_nudges OWNER TO postgres;

--
-- Name: whatsapp_identities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    company_id uuid,
    phone_e164 text,
    wa_id text,
    verified_at timestamp with time zone DEFAULT now(),
    revoked_at timestamp with time zone,
    opted_out_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lang text,
    daily_summary_opted_in_at timestamp with time zone,
    debt_reminders_opted_in_at timestamp with time zone,
    proactive_notifications_opted_out_at timestamp with time zone,
    CONSTRAINT whatsapp_identities_lang_check CHECK ((lang = ANY (ARRAY['sw'::text, 'en'::text])))
);


ALTER TABLE public.whatsapp_identities OWNER TO postgres;

--
-- Name: COLUMN whatsapp_identities.lang; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_identities.lang IS 'sw | en | null. Null means the one-time language question has not been asked yet.';


--
-- Name: COLUMN whatsapp_identities.daily_summary_opted_in_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_identities.daily_summary_opted_in_at IS 'Explicit consent to receive the daily account summary template.';


--
-- Name: COLUMN whatsapp_identities.debt_reminders_opted_in_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_identities.debt_reminders_opted_in_at IS 'Explicit consent to receive stale-debt reminder templates.';


--
-- Name: COLUMN whatsapp_identities.proactive_notifications_opted_out_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_identities.proactive_notifications_opted_out_at IS 'STOP/SITISHA timestamp. Null is required before any proactive notification may be sent.';


--
-- Name: whatsapp_learning_gaps; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.whatsapp_learning_gaps AS
 SELECT company_id,
    created_at,
    intent,
    claimed_by,
    outcome,
    message_text
   FROM public.whatsapp_audit_log l
  WHERE ((message_text IS NOT NULL) AND ((claimed_by = 'conversational_ai'::text) OR (outcome = ANY (ARRAY['clarification'::text, 'failed'::text, 'unknown'::text, 'blocked'::text]))))
  ORDER BY created_at DESC;


ALTER VIEW public.whatsapp_learning_gaps OWNER TO postgres;

--
-- Name: whatsapp_link_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_link_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    profile_id uuid NOT NULL,
    company_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.whatsapp_link_tokens OWNER TO postgres;

--
-- Name: whatsapp_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wa_message_id text NOT NULL,
    phone_e164 text,
    profile_id uuid,
    company_id uuid,
    kind text DEFAULT 'image'::text NOT NULL,
    media_id text,
    media_mime text,
    media_bytes bigint,
    status text DEFAULT 'pending'::text NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    last_error text,
    receipt_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    caption text,
    timings jsonb,
    chat_identity_id uuid,
    transport text DEFAULT 'whatsapp'::text NOT NULL,
    request_hash text,
    CONSTRAINT whatsapp_messages_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text, 'skipped'::text]))),
    CONSTRAINT whatsapp_messages_transport_check CHECK ((transport = ANY (ARRAY['whatsapp'::text, 'web'::text])))
);


ALTER TABLE public.whatsapp_messages OWNER TO postgres;

--
-- Name: COLUMN whatsapp_messages.request_hash; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_messages.request_hash IS 'SHA-256 of normalized web input for replay equality. Never stores link tokens or raw input.';


--
-- Name: whatsapp_notification_consent_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_notification_consent_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_id uuid NOT NULL,
    company_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    channel text NOT NULL,
    action text NOT NULL,
    source text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT whatsapp_notification_consent_log_action_check CHECK ((action = ANY (ARRAY['enabled'::text, 'disabled'::text, 'stopped'::text]))),
    CONSTRAINT whatsapp_notification_consent_log_channel_check CHECK ((channel = ANY (ARRAY['daily_summary'::text, 'debt_reminder'::text, 'all'::text]))),
    CONSTRAINT whatsapp_notification_consent_log_source_check CHECK ((source = ANY (ARRAY['app'::text, 'whatsapp'::text])))
);


ALTER TABLE public.whatsapp_notification_consent_log OWNER TO postgres;

--
-- Name: whatsapp_notification_deliveries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_notification_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_id uuid NOT NULL,
    company_id uuid NOT NULL,
    notification_kind text NOT NULL,
    business_date date NOT NULL,
    subject_key text NOT NULL,
    phone_e164_snapshot text NOT NULL,
    language_snapshot text NOT NULL,
    template_name text NOT NULL,
    parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'sending'::text NOT NULL,
    attempt_count integer DEFAULT 1 NOT NULL,
    next_attempt_at timestamp with time zone,
    provider_message_id text,
    last_error text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT whatsapp_notification_deliveries_attempt_count_check CHECK (((attempt_count >= 1) AND (attempt_count <= 3))),
    CONSTRAINT whatsapp_notification_deliveries_language_snapshot_check CHECK ((language_snapshot = ANY (ARRAY['en'::text, 'sw'::text]))),
    CONSTRAINT whatsapp_notification_deliveries_notification_kind_check CHECK ((notification_kind = ANY (ARRAY['daily_summary'::text, 'debt_reminder'::text, 'close_reminder'::text, 'billing_due'::text, 'billing_overdue'::text, 'billing_suspended'::text, 'marketplace_order_new'::text, 'marketplace_order_accepted'::text, 'marketplace_order_rejected'::text, 'marketplace_order_delivered'::text, 'marketplace_order_cancelled'::text]))),
    CONSTRAINT whatsapp_notification_deliveries_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'unknown'::text, 'skipped'::text])))
);


ALTER TABLE public.whatsapp_notification_deliveries OWNER TO postgres;

--
-- Name: whatsapp_onboarding; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_onboarding (
    phone_e164 text NOT NULL,
    step text NOT NULL,
    lang text,
    draft jsonb DEFAULT '{}'::jsonb NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_onboarding_lang_check CHECK ((lang = ANY (ARRAY['en'::text, 'sw'::text])))
);


ALTER TABLE public.whatsapp_onboarding OWNER TO postgres;

--
-- Name: whatsapp_turn_locks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_turn_locks (
    phone_e164 text NOT NULL,
    owner_token uuid NOT NULL,
    lease_until timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE public.whatsapp_turn_locks OWNER TO postgres;

--
-- Name: whatsapp_typing_attempts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_typing_attempts (
    id bigint NOT NULL,
    wa_message_id text NOT NULL,
    attempt smallint NOT NULL,
    http_status smallint,
    meta_code integer,
    ms_since_received integer,
    queued_behind_earlier boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE public.whatsapp_typing_attempts OWNER TO postgres;

--
-- Name: TABLE whatsapp_typing_attempts; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.whatsapp_typing_attempts IS 'Every WhatsApp typing-indicator request and Meta''s answer. Diagnostic only; no message text, no phone number.';


--
-- Name: whatsapp_typing_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.whatsapp_typing_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.whatsapp_typing_attempts_id_seq OWNER TO postgres;

--
-- Name: whatsapp_typing_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.whatsapp_typing_attempts_id_seq OWNED BY public.whatsapp_typing_attempts.id;


--
-- Name: whole_animal_breakdown_outputs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whole_animal_breakdown_outputs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    breakdown_daily_record_id uuid NOT NULL,
    line_number integer NOT NULL,
    product_key text NOT NULL,
    product_name text NOT NULL,
    unit_key text NOT NULL,
    unit_name text NOT NULL,
    quantity numeric(18,6) NOT NULL,
    base_quantity numeric(18,6) NOT NULL,
    base_unit text NOT NULL,
    allocated_cost numeric(14,2),
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT whole_animal_breakdown_output_cost_check CHECK (((allocated_cost IS NULL) OR (allocated_cost >= (0)::numeric))),
    CONSTRAINT whole_animal_breakdown_output_line_check CHECK (((line_number >= 1) AND (line_number <= 50))),
    CONSTRAINT whole_animal_breakdown_output_names_check CHECK (((length(btrim(product_key)) >= 2) AND (length(btrim(product_name)) >= 2) AND (length(btrim(unit_key)) >= 1) AND (length(btrim(unit_name)) >= 1) AND (length(btrim(base_unit)) >= 1))),
    CONSTRAINT whole_animal_breakdown_output_quantity_check CHECK (((quantity > (0)::numeric) AND (base_quantity > (0)::numeric)))
);


ALTER TABLE public.whole_animal_breakdown_outputs OWNER TO postgres;

--
-- Name: TABLE whole_animal_breakdown_outputs; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.whole_animal_breakdown_outputs IS 'Server-validated actual output snapshots. Confirmed rows feed stock; pending and voided parent records do not.';


--
-- Name: whole_animal_breakdowns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whole_animal_breakdowns (
    daily_record_id uuid NOT NULL,
    source_procurement_daily_record_id uuid NOT NULL,
    company_id uuid NOT NULL,
    purchase_total_snapshot numeric(14,2) NOT NULL,
    cost_allocation_status text DEFAULT 'incomplete'::text NOT NULL,
    allocated_cost_total numeric(14,2),
    occurred_at timestamp with time zone NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT whole_animal_breakdown_allocated_check CHECK (((allocated_cost_total IS NULL) OR (allocated_cost_total >= (0)::numeric))),
    CONSTRAINT whole_animal_breakdown_cost_status_check CHECK ((cost_allocation_status = ANY (ARRAY['incomplete'::text, 'allocated'::text]))),
    CONSTRAINT whole_animal_breakdown_snapshot_check CHECK (((purchase_total_snapshot > (0)::numeric) AND (purchase_total_snapshot <= (100000000)::numeric)))
);


ALTER TABLE public.whole_animal_breakdowns OWNER TO postgres;

--
-- Name: TABLE whole_animal_breakdowns; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.whole_animal_breakdowns IS 'One confirmed whole-animal procurement transformed into actual measured outputs. Costs remain at source level until a configured allocation basis exists.';


--
-- Name: whole_animal_procurements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whole_animal_procurements (
    daily_record_id uuid NOT NULL,
    company_id uuid NOT NULL,
    animal_type text NOT NULL,
    animal_count integer NOT NULL,
    purchase_total_snapshot numeric(14,2) NOT NULL,
    per_animal_cost_snapshot numeric(14,2) NOT NULL,
    supplier_name text,
    reference text,
    note text,
    occurred_at timestamp with time zone NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whole_animal_count_check CHECK (((animal_count >= 1) AND (animal_count <= 1000))),
    CONSTRAINT whole_animal_note_len CHECK (((note IS NULL) OR ((length(btrim(note)) >= 1) AND (length(btrim(note)) <= 1000)))),
    CONSTRAINT whole_animal_reference_len CHECK (((reference IS NULL) OR ((length(btrim(reference)) >= 1) AND (length(btrim(reference)) <= 200)))),
    CONSTRAINT whole_animal_supplier_len CHECK (((supplier_name IS NULL) OR ((length(btrim(supplier_name)) >= 1) AND (length(btrim(supplier_name)) <= 200)))),
    CONSTRAINT whole_animal_total_check CHECK (((purchase_total_snapshot > (0)::numeric) AND (purchase_total_snapshot <= (100000000)::numeric))),
    CONSTRAINT whole_animal_type_check CHECK (((length(btrim(animal_type)) >= 2) AND (length(btrim(animal_type)) <= 100))),
    CONSTRAINT whole_animal_unit_cost_check CHECK ((per_animal_cost_snapshot > (0)::numeric))
);


ALTER TABLE public.whole_animal_procurements OWNER TO postgres;

--
-- Name: TABLE whole_animal_procurements; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.whole_animal_procurements IS 'Immutable procurement facts for whole animals. Confirmation/void status lives on daily_records. This table never creates product stock or animal yields.';


--
-- Name: COLUMN whole_animal_procurements.purchase_total_snapshot; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whole_animal_procurements.purchase_total_snapshot IS 'Server-validated total paid for the animals, frozen when the draft is created.';


--
-- Name: COLUMN whole_animal_procurements.per_animal_cost_snapshot; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whole_animal_procurements.per_animal_cost_snapshot IS 'Server-derived purchase_total_snapshot / animal_count. Never supplied as trusted arithmetic by a client or model.';


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: postgres
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE storage.buckets OWNER TO postgres;

--
-- Name: objects; Type: TABLE; Schema: storage; Owner: postgres
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb
);


ALTER TABLE storage.objects OWNER TO postgres;

--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: postgres
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    name text,
    statements text[],
    created_by text,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE supabase_migrations.schema_migrations OWNER TO postgres;

--
-- Name: decrypted_secrets; Type: TABLE; Schema: vault; Owner: postgres
--

CREATE TABLE vault.decrypted_secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    decrypted_secret text
);


ALTER TABLE vault.decrypted_secrets OWNER TO postgres;

--
-- Name: whatsapp_typing_attempts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_typing_attempts ALTER COLUMN id SET DEFAULT nextval('public.whatsapp_typing_attempts_id_seq'::regclass);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: job job_pkey; Type: CONSTRAINT; Schema: cron; Owner: postgres
--

ALTER TABLE ONLY cron.job
    ADD CONSTRAINT job_pkey PRIMARY KEY (jobid);


--
-- Name: app_notifications app_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_notifications
    ADD CONSTRAINT app_notifications_pkey PRIMARY KEY (id);


--
-- Name: billing_plans billing_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.billing_plans
    ADD CONSTRAINT billing_plans_pkey PRIMARY KEY (code);


--
-- Name: business_vocabulary_audit_log business_vocabulary_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_vocabulary_audit_log
    ADD CONSTRAINT business_vocabulary_audit_log_pkey PRIMARY KEY (id);


--
-- Name: business_vocabulary business_vocabulary_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_vocabulary
    ADD CONSTRAINT business_vocabulary_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_wa_message_id_ordinal_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_wa_message_id_ordinal_key UNIQUE (wa_message_id, ordinal);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_invite_codes company_invite_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_invite_codes
    ADD CONSTRAINT company_invite_codes_code_key UNIQUE (code);


--
-- Name: company_invite_codes company_invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_invite_codes
    ADD CONSTRAINT company_invite_codes_pkey PRIMARY KEY (id);


--
-- Name: company_marketplace_settings company_marketplace_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_marketplace_settings
    ADD CONSTRAINT company_marketplace_settings_pkey PRIMARY KEY (company_id);


--
-- Name: company_members company_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_pkey PRIMARY KEY (profile_id, company_id);


--
-- Name: company_suppliers company_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_suppliers
    ADD CONSTRAINT company_suppliers_pkey PRIMARY KEY (company_id);


--
-- Name: daily_closures daily_closures_company_id_business_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_closures
    ADD CONSTRAINT daily_closures_company_id_business_date_key UNIQUE (company_id, business_date);


--
-- Name: daily_closures daily_closures_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_closures
    ADD CONSTRAINT daily_closures_pkey PRIMARY KEY (id);


--
-- Name: daily_record_audit_log daily_record_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_record_audit_log
    ADD CONSTRAINT daily_record_audit_log_pkey PRIMARY KEY (id);


--
-- Name: daily_record_lines daily_record_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_record_lines
    ADD CONSTRAINT daily_record_lines_pkey PRIMARY KEY (id);


--
-- Name: daily_record_lines daily_record_lines_record_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_record_lines
    ADD CONSTRAINT daily_record_lines_record_number_unique UNIQUE (daily_record_id, line_number);


--
-- Name: daily_records daily_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_records
    ADD CONSTRAINT daily_records_pkey PRIMARY KEY (id);


--
-- Name: invite_links invite_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invite_links
    ADD CONSTRAINT invite_links_pkey PRIMARY KEY (id);


--
-- Name: invite_links invite_links_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invite_links
    ADD CONSTRAINT invite_links_token_key UNIQUE (token);


--
-- Name: invoice_activity invoice_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_activity
    ADD CONSTRAINT invoice_activity_pkey PRIMARY KEY (id);


--
-- Name: invoice_comments invoice_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_comments
    ADD CONSTRAINT invoice_comments_pkey PRIMARY KEY (id);


--
-- Name: invoice_receipts invoice_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_receipts
    ADD CONSTRAINT invoice_receipts_pkey PRIMARY KEY (invoice_id, receipt_id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: legal_acceptances legal_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.legal_acceptances
    ADD CONSTRAINT legal_acceptances_pkey PRIMARY KEY (profile_id, version);


--
-- Name: legal_policy_versions legal_policy_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.legal_policy_versions
    ADD CONSTRAINT legal_policy_versions_pkey PRIMARY KEY (version);


--
-- Name: marketplace_order_requests marketplace_order_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_order_requests
    ADD CONSTRAINT marketplace_order_requests_pkey PRIMARY KEY (id);


--
-- Name: marketplace_pending_selections marketplace_pending_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_pending_selections
    ADD CONSTRAINT marketplace_pending_selections_pkey PRIMARY KEY (id);


--
-- Name: marketplace_product_index marketplace_product_index_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_product_index
    ADD CONSTRAINT marketplace_product_index_pkey PRIMARY KEY (company_id, product_key);


--
-- Name: merchant_memory merchant_memory_company_id_match_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.merchant_memory
    ADD CONSTRAINT merchant_memory_company_id_match_key_key UNIQUE (company_id, match_key);


--
-- Name: merchant_memory merchant_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.merchant_memory
    ADD CONSTRAINT merchant_memory_pkey PRIMARY KEY (id);


--
-- Name: obligation_payments obligation_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.obligation_payments
    ADD CONSTRAINT obligation_payments_pkey PRIMARY KEY (id);


--
-- Name: ops_alert_deliveries ops_alert_deliveries_incident_id_event_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ops_alert_deliveries
    ADD CONSTRAINT ops_alert_deliveries_incident_id_event_key UNIQUE (incident_id, event);


--
-- Name: ops_alert_deliveries ops_alert_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ops_alert_deliveries
    ADD CONSTRAINT ops_alert_deliveries_pkey PRIMARY KEY (id);


--
-- Name: ops_incidents ops_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ops_incidents
    ADD CONSTRAINT ops_incidents_pkey PRIMARY KEY (id);


--
-- Name: ops_monitor_runs ops_monitor_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ops_monitor_runs
    ADD CONSTRAINT ops_monitor_runs_pkey PRIMARY KEY (id);


--
-- Name: ops_privacy_requests ops_privacy_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ops_privacy_requests
    ADD CONSTRAINT ops_privacy_requests_pkey PRIMARY KEY (id);


--
-- Name: ops_recovery_evidence ops_recovery_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ops_recovery_evidence
    ADD CONSTRAINT ops_recovery_evidence_pkey PRIMARY KEY (id);


--
-- Name: petty_cash_accounts petty_cash_accounts_company_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.petty_cash_accounts
    ADD CONSTRAINT petty_cash_accounts_company_id_user_id_key UNIQUE (company_id, user_id);


--
-- Name: petty_cash_accounts petty_cash_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.petty_cash_accounts
    ADD CONSTRAINT petty_cash_accounts_pkey PRIMARY KEY (id);


--
-- Name: petty_cash_transactions petty_cash_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.petty_cash_transactions
    ADD CONSTRAINT petty_cash_transactions_pkey PRIMARY KEY (id);


--
-- Name: platform_admin_audit_logs platform_admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_admin_audit_logs
    ADD CONSTRAINT platform_admin_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);


--
-- Name: platform_expenses platform_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_expenses
    ADD CONSTRAINT platform_expenses_pkey PRIMARY KEY (id);


--
-- Name: product_archives product_archives_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_archives
    ADD CONSTRAINT product_archives_pkey PRIMARY KEY (company_id, product_key);


--
-- Name: product_barcodes product_barcodes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_barcodes
    ADD CONSTRAINT product_barcodes_pkey PRIMARY KEY (id);


--
-- Name: product_combos product_combos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_combos
    ADD CONSTRAINT product_combos_pkey PRIMARY KEY (id);


--
-- Name: product_cost_prompts product_cost_prompts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_cost_prompts
    ADD CONSTRAINT product_cost_prompts_pkey PRIMARY KEY (company_id, product_key, profile_id);


--
-- Name: product_costs product_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_costs
    ADD CONSTRAINT product_costs_pkey PRIMARY KEY (id);


--
-- Name: product_events product_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_events
    ADD CONSTRAINT product_events_pkey PRIMARY KEY (id);


--
-- Name: product_selling_prices product_selling_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_selling_prices
    ADD CONSTRAINT product_selling_prices_pkey PRIMARY KEY (id);


--
-- Name: product_unit_audit_log product_unit_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_unit_audit_log
    ADD CONSTRAINT product_unit_audit_log_pkey PRIMARY KEY (id);


--
-- Name: product_units product_units_company_id_product_key_unit_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_company_id_product_key_unit_key_key UNIQUE (company_id, product_key, unit_key);


--
-- Name: product_units product_units_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: project_members project_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_pkey PRIMARY KEY (project_id, profile_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: receipt_aliases receipt_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipt_aliases
    ADD CONSTRAINT receipt_aliases_pkey PRIMARY KEY (id);


--
-- Name: receipt_aliases receipt_aliases_receipt_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipt_aliases
    ADD CONSTRAINT receipt_aliases_receipt_id_user_id_key UNIQUE (receipt_id, user_id);


--
-- Name: receipt_audit_log receipt_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipt_audit_log
    ADD CONSTRAINT receipt_audit_log_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: recurring_obligations recurring_obligations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recurring_obligations
    ADD CONSTRAINT recurring_obligations_pkey PRIMARY KEY (id);


--
-- Name: reimbursement_payout_items reimbursement_payout_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reimbursement_payout_items
    ADD CONSTRAINT reimbursement_payout_items_pkey PRIMARY KEY (id);


--
-- Name: reimbursement_payouts reimbursement_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reimbursement_payouts
    ADD CONSTRAINT reimbursement_payouts_pkey PRIMARY KEY (id);


--
-- Name: scanned_documents scanned_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scanned_documents
    ADD CONSTRAINT scanned_documents_pkey PRIMARY KEY (id);


--
-- Name: shop_order_events shop_order_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shop_order_events
    ADD CONSTRAINT shop_order_events_pkey PRIMARY KEY (id);


--
-- Name: shop_order_lines shop_order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shop_order_lines
    ADD CONSTRAINT shop_order_lines_pkey PRIMARY KEY (id);


--
-- Name: shop_orders shop_orders_order_no_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shop_orders
    ADD CONSTRAINT shop_orders_order_no_key UNIQUE (order_no);


--
-- Name: shop_orders shop_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shop_orders
    ADD CONSTRAINT shop_orders_pkey PRIMARY KEY (id);


--
-- Name: staff_retirement_audit_log staff_retirement_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirement_audit_log
    ADD CONSTRAINT staff_retirement_audit_log_pkey PRIMARY KEY (id);


--
-- Name: staff_retirement_documents staff_retirement_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirement_documents
    ADD CONSTRAINT staff_retirement_documents_pkey PRIMARY KEY (id);


--
-- Name: staff_retirement_receipts staff_retirement_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirement_receipts
    ADD CONSTRAINT staff_retirement_receipts_pkey PRIMARY KEY (id);


--
-- Name: staff_retirement_receipts staff_retirement_receipts_retirement_id_receipt_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirement_receipts
    ADD CONSTRAINT staff_retirement_receipts_retirement_id_receipt_id_key UNIQUE (retirement_id, receipt_id);


--
-- Name: staff_retirements staff_retirements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirements
    ADD CONSTRAINT staff_retirements_pkey PRIMARY KEY (id);


--
-- Name: stock_counts stock_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_counts
    ADD CONSTRAINT stock_counts_pkey PRIMARY KEY (id);


--
-- Name: subscription_events subscription_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_events
    ADD CONSTRAINT subscription_events_pkey PRIMARY KEY (id);


--
-- Name: subscription_invoices subscription_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_pkey PRIMARY KEY (id);


--
-- Name: subscription_usage subscription_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_usage
    ADD CONSTRAINT subscription_usage_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_company_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_company_id_key UNIQUE (company_id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: supplier_claim_audit_log supplier_claim_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claim_audit_log
    ADD CONSTRAINT supplier_claim_audit_log_pkey PRIMARY KEY (id);


--
-- Name: supplier_claim_messages supplier_claim_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claim_messages
    ADD CONSTRAINT supplier_claim_messages_pkey PRIMARY KEY (id);


--
-- Name: supplier_claim_receipts supplier_claim_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claim_receipts
    ADD CONSTRAINT supplier_claim_receipts_pkey PRIMARY KEY (id);


--
-- Name: supplier_claims supplier_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claims
    ADD CONSTRAINT supplier_claims_pkey PRIMARY KEY (id);


--
-- Name: supplier_claims supplier_claims_public_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claims
    ADD CONSTRAINT supplier_claims_public_token_key UNIQUE (public_token);


--
-- Name: supplier_connections supplier_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_connections
    ADD CONSTRAINT supplier_connections_pkey PRIMARY KEY (id);


--
-- Name: supplier_connections supplier_connections_public_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_connections
    ADD CONSTRAINT supplier_connections_public_token_key UNIQUE (public_token);


--
-- Name: wa_login_tokens wa_login_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wa_login_tokens
    ADD CONSTRAINT wa_login_tokens_pkey PRIMARY KEY (id);


--
-- Name: wa_login_tokens wa_login_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wa_login_tokens
    ADD CONSTRAINT wa_login_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: wa_web_auth_request_log wa_web_auth_request_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wa_web_auth_request_log
    ADD CONSTRAINT wa_web_auth_request_log_pkey PRIMARY KEY (id);


--
-- Name: web_signup_drafts web_signup_drafts_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.web_signup_drafts
    ADD CONSTRAINT web_signup_drafts_code_hash_key UNIQUE (code_hash);


--
-- Name: web_signup_drafts web_signup_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.web_signup_drafts
    ADD CONSTRAINT web_signup_drafts_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_ai_interpretations whatsapp_ai_interpretations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_ai_interpretations
    ADD CONSTRAINT whatsapp_ai_interpretations_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_ai_messages whatsapp_ai_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_ai_messages
    ADD CONSTRAINT whatsapp_ai_messages_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_ai_messages whatsapp_ai_messages_wa_message_id_role_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_ai_messages
    ADD CONSTRAINT whatsapp_ai_messages_wa_message_id_role_key UNIQUE (wa_message_id, role);


--
-- Name: whatsapp_ai_threads whatsapp_ai_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_ai_threads
    ADD CONSTRAINT whatsapp_ai_threads_pkey PRIMARY KEY (identity_id, company_id);


--
-- Name: whatsapp_ai_usage_daily whatsapp_ai_usage_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_ai_usage_daily
    ADD CONSTRAINT whatsapp_ai_usage_daily_pkey PRIMARY KEY (company_id, usage_day);


--
-- Name: whatsapp_audit_log whatsapp_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_audit_log
    ADD CONSTRAINT whatsapp_audit_log_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_conversations whatsapp_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_pkey PRIMARY KEY (identity_id);


--
-- Name: whatsapp_daily_nudges whatsapp_daily_nudges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_daily_nudges
    ADD CONSTRAINT whatsapp_daily_nudges_pkey PRIMARY KEY (identity_id, business_date, kind);


--
-- Name: whatsapp_identities whatsapp_identities_phone_e164_format; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_identities
    ADD CONSTRAINT whatsapp_identities_phone_e164_format CHECK (((phone_e164 ~ '^\+[1-9][0-9]{7,14}$'::text) OR ((phone_e164 = ('web:'::text || (profile_id)::text)) AND (verified_at IS NULL) AND (wa_id IS NULL)))) NOT VALID;


--
-- Name: whatsapp_identities whatsapp_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_identities
    ADD CONSTRAINT whatsapp_identities_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_link_tokens whatsapp_link_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_link_tokens
    ADD CONSTRAINT whatsapp_link_tokens_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_link_tokens whatsapp_link_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_link_tokens
    ADD CONSTRAINT whatsapp_link_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: whatsapp_messages whatsapp_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_messages whatsapp_messages_wa_message_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_wa_message_id_key UNIQUE (wa_message_id);


--
-- Name: whatsapp_notification_consent_log whatsapp_notification_consent_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_notification_consent_log
    ADD CONSTRAINT whatsapp_notification_consent_log_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_notification_deliveries whatsapp_notification_deliver_identity_id_notification_kind_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_notification_deliveries
    ADD CONSTRAINT whatsapp_notification_deliver_identity_id_notification_kind_key UNIQUE (identity_id, notification_kind, business_date, subject_key);


--
-- Name: whatsapp_notification_deliveries whatsapp_notification_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_notification_deliveries
    ADD CONSTRAINT whatsapp_notification_deliveries_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_onboarding whatsapp_onboarding_phone_e164_format; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_onboarding
    ADD CONSTRAINT whatsapp_onboarding_phone_e164_format CHECK ((phone_e164 ~ '^\+[1-9][0-9]{7,14}$'::text)) NOT VALID;


--
-- Name: whatsapp_onboarding whatsapp_onboarding_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_onboarding
    ADD CONSTRAINT whatsapp_onboarding_pkey PRIMARY KEY (phone_e164);


--
-- Name: whatsapp_turn_locks whatsapp_turn_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_turn_locks
    ADD CONSTRAINT whatsapp_turn_locks_pkey PRIMARY KEY (phone_e164);


--
-- Name: whatsapp_typing_attempts whatsapp_typing_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_typing_attempts
    ADD CONSTRAINT whatsapp_typing_attempts_pkey PRIMARY KEY (id);


--
-- Name: whole_animal_breakdown_outputs whole_animal_breakdown_output_breakdown_daily_record_id_lin_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whole_animal_breakdown_outputs
    ADD CONSTRAINT whole_animal_breakdown_output_breakdown_daily_record_id_lin_key UNIQUE (breakdown_daily_record_id, line_number);


--
-- Name: whole_animal_breakdown_outputs whole_animal_breakdown_output_breakdown_daily_record_id_pro_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whole_animal_breakdown_outputs
    ADD CONSTRAINT whole_animal_breakdown_output_breakdown_daily_record_id_pro_key UNIQUE (breakdown_daily_record_id, product_key, unit_key);


--
-- Name: whole_animal_breakdown_outputs whole_animal_breakdown_outputs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whole_animal_breakdown_outputs
    ADD CONSTRAINT whole_animal_breakdown_outputs_pkey PRIMARY KEY (id);


--
-- Name: whole_animal_breakdowns whole_animal_breakdowns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whole_animal_breakdowns
    ADD CONSTRAINT whole_animal_breakdowns_pkey PRIMARY KEY (daily_record_id);


--
-- Name: whole_animal_procurements whole_animal_procurements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whole_animal_procurements
    ADD CONSTRAINT whole_animal_procurements_pkey PRIMARY KEY (daily_record_id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: postgres
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: postgres
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: postgres
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: decrypted_secrets decrypted_secrets_pkey; Type: CONSTRAINT; Schema: vault; Owner: postgres
--

ALTER TABLE ONLY vault.decrypted_secrets
    ADD CONSTRAINT decrypted_secrets_pkey PRIMARY KEY (id);


--
-- Name: ai_interp_company_time_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_interp_company_time_idx ON public.whatsapp_ai_interpretations USING btree (company_id, created_at DESC);


--
-- Name: ai_interp_expiry_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_interp_expiry_idx ON public.whatsapp_ai_interpretations USING btree (expires_at);


--
-- Name: ai_interp_failure_time_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_interp_failure_time_idx ON public.whatsapp_ai_interpretations USING btree (failure_layer, created_at DESC);


--
-- Name: ai_interp_message_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ai_interp_message_idx ON public.whatsapp_ai_interpretations USING btree (wa_message_id);


--
-- Name: ai_interp_runtime_time_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_interp_runtime_time_idx ON public.whatsapp_ai_interpretations USING btree (runtime_version, created_at DESC);


--
-- Name: app_notifications_recipient_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX app_notifications_recipient_idx ON public.app_notifications USING btree (recipient_id, read_at, created_at DESC);


--
-- Name: business_vocabulary_audit_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX business_vocabulary_audit_company_idx ON public.business_vocabulary_audit_log USING btree (company_id, created_at DESC);


--
-- Name: business_vocabulary_company_kind_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX business_vocabulary_company_kind_idx ON public.business_vocabulary USING btree (company_id, kind);


--
-- Name: business_vocabulary_company_term_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX business_vocabulary_company_term_idx ON public.business_vocabulary USING btree (company_id, term_key);


--
-- Name: chat_messages_day_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX chat_messages_day_idx ON public.chat_messages USING btree (identity_id, company_id, chat_day, created_at);


--
-- Name: companies_scanner_inbox_token_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX companies_scanner_inbox_token_idx ON public.companies USING btree (scanner_inbox_token);


--
-- Name: company_invite_codes_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX company_invite_codes_company_idx ON public.company_invite_codes USING btree (company_id);


--
-- Name: company_members_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX company_members_company_idx ON public.company_members USING btree (company_id);


--
-- Name: daily_closures_company_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX daily_closures_company_date_idx ON public.daily_closures USING btree (company_id, business_date DESC);


--
-- Name: daily_record_audit_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX daily_record_audit_company_idx ON public.daily_record_audit_log USING btree (company_id, created_at DESC);


--
-- Name: daily_record_audit_record_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX daily_record_audit_record_idx ON public.daily_record_audit_log USING btree (daily_record_id, created_at DESC);


--
-- Name: daily_record_lines_record_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX daily_record_lines_record_idx ON public.daily_record_lines USING btree (daily_record_id, line_number);


--
-- Name: daily_records_company_kind_occurred_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX daily_records_company_kind_occurred_idx ON public.daily_records USING btree (company_id, kind, occurred_at DESC);


--
-- Name: daily_records_company_source_message_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX daily_records_company_source_message_unique ON public.daily_records USING btree (company_id, source_message_id) WHERE (source_message_id IS NOT NULL);


--
-- Name: daily_records_company_status_occurred_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX daily_records_company_status_occurred_idx ON public.daily_records USING btree (company_id, status, occurred_at DESC);


--
-- Name: daily_records_confirmed_reporting_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX daily_records_confirmed_reporting_idx ON public.daily_records USING btree (company_id, kind, occurred_at DESC) WHERE (status = 'confirmed'::text);


--
-- Name: daily_records_project_occurred_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX daily_records_project_occurred_idx ON public.daily_records USING btree (project_id, occurred_at DESC);


--
-- Name: daily_records_supplier_balance_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX daily_records_supplier_balance_idx ON public.daily_records USING btree (company_id, kind, party_name, status, occurred_at DESC) WHERE (kind = ANY (ARRAY['supplier_payable'::text, 'supplier_payment'::text, 'whole_animal_procurement'::text]));


--
-- Name: invite_links_project_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX invite_links_project_idx ON public.invite_links USING btree (project_id);


--
-- Name: invoices_project_period_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX invoices_project_period_idx ON public.invoices USING btree (project_id, period_start DESC);


--
-- Name: legal_one_active_version; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX legal_one_active_version ON public.legal_policy_versions USING btree (active) WHERE active;


--
-- Name: marketplace_orders_buyer_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX marketplace_orders_buyer_idx ON public.marketplace_order_requests USING btree (buyer_company_id, placed_at DESC);


--
-- Name: marketplace_orders_supplier_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX marketplace_orders_supplier_idx ON public.marketplace_order_requests USING btree (supplier_company_id, placed_at DESC);


--
-- Name: marketplace_pending_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX marketplace_pending_active_idx ON public.marketplace_pending_selections USING btree (buyer_company_id, created_at DESC) WHERE (consumed_at IS NULL);


--
-- Name: marketplace_product_index_barcodes; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX marketplace_product_index_barcodes ON public.marketplace_product_index USING gin (barcodes);


--
-- Name: marketplace_product_index_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX marketplace_product_index_trgm ON public.marketplace_product_index USING gin (normalized_name extensions.gin_trgm_ops);


--
-- Name: merchant_memory_company_lookup_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX merchant_memory_company_lookup_idx ON public.merchant_memory USING btree (company_id, match_key);


--
-- Name: obligation_payments_by_obligation_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX obligation_payments_by_obligation_idx ON public.obligation_payments USING btree (obligation_id, paid_on DESC);


--
-- Name: one_active_payout_per_receipt; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX one_active_payout_per_receipt ON public.reimbursement_payout_items USING btree (receipt_id) WHERE (voided_at IS NULL);


--
-- Name: ops_incident_active_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ops_incident_active_code ON public.ops_incidents USING btree (code) WHERE (resolved_at IS NULL);


--
-- Name: petty_cash_accounts_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX petty_cash_accounts_company_idx ON public.petty_cash_accounts USING btree (company_id);


--
-- Name: petty_cash_one_expense_per_receipt; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX petty_cash_one_expense_per_receipt ON public.petty_cash_transactions USING btree (receipt_id) WHERE ((receipt_id IS NOT NULL) AND (type = 'expense'::text) AND (reversed_at IS NULL));


--
-- Name: petty_cash_one_reversal_per_transaction; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX petty_cash_one_reversal_per_transaction ON public.petty_cash_transactions USING btree (reverses_transaction_id) WHERE (reverses_transaction_id IS NOT NULL);


--
-- Name: petty_cash_transactions_account_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX petty_cash_transactions_account_idx ON public.petty_cash_transactions USING btree (account_id, created_at DESC);


--
-- Name: platform_admin_audit_logs_target_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX platform_admin_audit_logs_target_idx ON public.platform_admin_audit_logs USING btree (target_type, target_id, created_at DESC);


--
-- Name: platform_admin_audit_logs_time_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX platform_admin_audit_logs_time_idx ON public.platform_admin_audit_logs USING btree (created_at DESC);


--
-- Name: platform_expenses_company_occurred_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX platform_expenses_company_occurred_idx ON public.platform_expenses USING btree (company_id, occurred_on DESC);


--
-- Name: platform_expenses_occurred_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX platform_expenses_occurred_idx ON public.platform_expenses USING btree (occurred_on DESC);


--
-- Name: product_barcodes_company_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX product_barcodes_company_code ON public.product_barcodes USING btree (company_id, barcode);


--
-- Name: product_barcodes_company_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX product_barcodes_company_product ON public.product_barcodes USING btree (company_id, product_key);


--
-- Name: product_combos_company_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX product_combos_company_name_idx ON public.product_combos USING btree (company_id, name_key);


--
-- Name: product_costs_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX product_costs_lookup ON public.product_costs USING btree (company_id, product_key, effective_from DESC, created_at DESC);


--
-- Name: product_events_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX product_events_company_idx ON public.product_events USING btree (company_id, created_at DESC);


--
-- Name: product_selling_prices_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX product_selling_prices_lookup ON public.product_selling_prices USING btree (company_id, product_key, effective_from DESC, created_at DESC);


--
-- Name: product_selling_prices_unit_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX product_selling_prices_unit_lookup ON public.product_selling_prices USING btree (company_id, product_key, sale_unit_key, effective_from DESC, created_at DESC);


--
-- Name: product_unit_audit_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX product_unit_audit_lookup ON public.product_unit_audit_log USING btree (company_id, product_key, created_at DESC);


--
-- Name: product_units_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX product_units_lookup ON public.product_units USING btree (company_id, product_key, unit_key);


--
-- Name: product_units_one_base; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX product_units_one_base ON public.product_units USING btree (company_id, product_key) WHERE is_base;


--
-- Name: profiles_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX profiles_company_idx ON public.profiles USING btree (company_id);


--
-- Name: projects_company_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX projects_company_status_idx ON public.projects USING btree (company_id, status);


--
-- Name: receipt_aliases_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX receipt_aliases_user_idx ON public.receipt_aliases USING btree (user_id, updated_at DESC);


--
-- Name: receipt_audit_log_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX receipt_audit_log_company_idx ON public.receipt_audit_log USING btree (company_id, created_at DESC);


--
-- Name: receipt_audit_log_receipt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX receipt_audit_log_receipt_idx ON public.receipt_audit_log USING btree (receipt_id, created_at DESC);


--
-- Name: receipts_duplicate_of_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX receipts_duplicate_of_idx ON public.receipts USING btree (duplicate_of);


--
-- Name: receipts_global_verification_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX receipts_global_verification_unique ON public.receipts USING btree (verification_code) WHERE ((verification_code IS NOT NULL) AND (status <> 'duplicate'::public.receipt_status));


--
-- Name: receipts_image_url_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX receipts_image_url_idx ON public.receipts USING btree (image_url);


--
-- Name: receipts_project_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX receipts_project_created_idx ON public.receipts USING btree (project_id, created_at DESC);


--
-- Name: receipts_scanned_doc_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX receipts_scanned_doc_idx ON public.receipts USING btree (scanned_doc_id);


--
-- Name: receipts_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX receipts_status_idx ON public.receipts USING btree (status);


--
-- Name: receipts_tra_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX receipts_tra_status_idx ON public.receipts USING btree (company_id, tra_status) WHERE (tra_status IS NOT NULL);


--
-- Name: receipts_unreimbursed_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX receipts_unreimbursed_idx ON public.receipts USING btree (company_id, uploaded_by) WHERE ((payment_method = 'cash_personal'::text) AND (status = 'confirmed'::public.receipt_status) AND (reimbursed_at IS NULL));


--
-- Name: recurring_obligations_live_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX recurring_obligations_live_idx ON public.recurring_obligations USING btree (company_id, kind) WHERE (superseded_at IS NULL);


--
-- Name: reimbursement_payout_items_payout_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX reimbursement_payout_items_payout_idx ON public.reimbursement_payout_items USING btree (payout_id);


--
-- Name: reimbursement_payouts_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX reimbursement_payouts_company_idx ON public.reimbursement_payouts USING btree (company_id, paid_at DESC);


--
-- Name: reimbursement_payouts_person_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX reimbursement_payouts_person_idx ON public.reimbursement_payouts USING btree (paid_to, paid_at DESC);


--
-- Name: scanned_documents_file_url_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scanned_documents_file_url_idx ON public.scanned_documents USING btree (file_url);


--
-- Name: scanned_documents_project_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scanned_documents_project_created_idx ON public.scanned_documents USING btree (project_id, created_at DESC);


--
-- Name: shop_order_events_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX shop_order_events_order_idx ON public.shop_order_events USING btree (order_id);


--
-- Name: shop_order_lines_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX shop_order_lines_order_idx ON public.shop_order_lines USING btree (order_id);


--
-- Name: shop_orders_buyer_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX shop_orders_buyer_idx ON public.shop_orders USING btree (buyer_company_id, placed_at DESC);


--
-- Name: shop_orders_supplier_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX shop_orders_supplier_idx ON public.shop_orders USING btree (supplier_company_id, placed_at DESC);


--
-- Name: staff_retirement_audit_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX staff_retirement_audit_company_idx ON public.staff_retirement_audit_log USING btree (company_id, created_at DESC);


--
-- Name: staff_retirement_audit_retirement_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX staff_retirement_audit_retirement_idx ON public.staff_retirement_audit_log USING btree (retirement_id, created_at DESC);


--
-- Name: staff_retirement_documents_retirement_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX staff_retirement_documents_retirement_idx ON public.staff_retirement_documents USING btree (retirement_id);


--
-- Name: staff_retirement_receipts_receipt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX staff_retirement_receipts_receipt_idx ON public.staff_retirement_receipts USING btree (receipt_id);


--
-- Name: staff_retirement_receipts_retirement_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX staff_retirement_receipts_retirement_idx ON public.staff_retirement_receipts USING btree (retirement_id);


--
-- Name: staff_retirements_company_staff_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX staff_retirements_company_staff_status_idx ON public.staff_retirements USING btree (company_id, staff_id, status, created_at DESC);


--
-- Name: staff_retirements_company_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX staff_retirements_company_status_idx ON public.staff_retirements USING btree (company_id, status, created_at DESC);


--
-- Name: staff_retirements_staff_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX staff_retirements_staff_idx ON public.staff_retirements USING btree (staff_id, created_at DESC);


--
-- Name: stock_counts_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX stock_counts_lookup ON public.stock_counts USING btree (company_id, product_key, counted_at DESC, created_at DESC);


--
-- Name: subscription_events_by_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX subscription_events_by_company_idx ON public.subscription_events USING btree (company_id, created_at DESC);


--
-- Name: subscription_events_external_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX subscription_events_external_uniq ON public.subscription_events USING btree (external_event_id) WHERE (external_event_id IS NOT NULL);


--
-- Name: subscription_invoices_one_per_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX subscription_invoices_one_per_period ON public.subscription_invoices USING btree (subscription_id, period_start);


--
-- Name: subscription_invoices_open_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX subscription_invoices_open_idx ON public.subscription_invoices USING btree (company_id, created_at DESC);


--
-- Name: subscription_invoices_snippe_reference_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX subscription_invoices_snippe_reference_uniq ON public.subscription_invoices USING btree (snippe_reference) WHERE (snippe_reference IS NOT NULL);


--
-- Name: subscription_usage_by_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX subscription_usage_by_company_idx ON public.subscription_usage USING btree (company_id, period_start DESC);


--
-- Name: subscription_usage_one_per_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX subscription_usage_one_per_period ON public.subscription_usage USING btree (subscription_id, period_start);


--
-- Name: subscriptions_due_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX subscriptions_due_idx ON public.subscriptions USING btree (current_period_end) WHERE (status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text]));


--
-- Name: supplier_claim_audit_claim_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX supplier_claim_audit_claim_idx ON public.supplier_claim_audit_log USING btree (claim_id, created_at DESC);


--
-- Name: supplier_claim_audit_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX supplier_claim_audit_company_idx ON public.supplier_claim_audit_log USING btree (company_id, created_at DESC);


--
-- Name: supplier_claim_messages_claim_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX supplier_claim_messages_claim_idx ON public.supplier_claim_messages USING btree (claim_id, created_at);


--
-- Name: supplier_claims_connection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX supplier_claims_connection_idx ON public.supplier_claims USING btree (connection_id, created_at DESC);


--
-- Name: supplier_claims_target_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX supplier_claims_target_idx ON public.supplier_claims USING btree (target_company_id, status, created_at DESC);


--
-- Name: supplier_claims_target_payment_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX supplier_claims_target_payment_idx ON public.supplier_claims USING btree (target_company_id, status, paid_at DESC);


--
-- Name: supplier_connections_target_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX supplier_connections_target_idx ON public.supplier_connections USING btree (target_company_id, status, created_at DESC);


--
-- Name: wa_login_tokens_profile_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wa_login_tokens_profile_idx ON public.wa_login_tokens USING btree (profile_id, created_at DESC);


--
-- Name: wa_web_auth_request_ip_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wa_web_auth_request_ip_idx ON public.wa_web_auth_request_log USING btree (ip_hash, created_at DESC);


--
-- Name: wa_web_auth_request_phone_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wa_web_auth_request_phone_idx ON public.wa_web_auth_request_log USING btree (phone_hash, created_at DESC);


--
-- Name: web_signup_drafts_expires_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX web_signup_drafts_expires_idx ON public.web_signup_drafts USING btree (expires_at) WHERE (claimed_at IS NULL);


--
-- Name: web_signup_drafts_ip_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX web_signup_drafts_ip_idx ON public.web_signup_drafts USING btree (created_ip, created_at);


--
-- Name: whatsapp_ai_messages_context_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_ai_messages_context_idx ON public.whatsapp_ai_messages USING btree (identity_id, company_id, created_at DESC);


--
-- Name: whatsapp_ai_messages_expiry_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_ai_messages_expiry_idx ON public.whatsapp_ai_messages USING btree (expires_at);


--
-- Name: whatsapp_ai_usage_daily_day_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_ai_usage_daily_day_idx ON public.whatsapp_ai_usage_daily USING btree (usage_day DESC, company_id);


--
-- Name: whatsapp_audit_log_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_audit_log_company_idx ON public.whatsapp_audit_log USING btree (company_id, created_at DESC);


--
-- Name: whatsapp_audit_log_learning; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_audit_log_learning ON public.whatsapp_audit_log USING btree (company_id, created_at DESC) WHERE (message_text IS NOT NULL);


--
-- Name: whatsapp_identities_active_phone_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX whatsapp_identities_active_phone_uniq ON public.whatsapp_identities USING btree (phone_e164) WHERE (revoked_at IS NULL);


--
-- Name: whatsapp_identities_active_profile_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX whatsapp_identities_active_profile_uniq ON public.whatsapp_identities USING btree (profile_id) WHERE (revoked_at IS NULL);


--
-- Name: whatsapp_link_tokens_profile_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_link_tokens_profile_idx ON public.whatsapp_link_tokens USING btree (profile_id, created_at DESC);


--
-- Name: whatsapp_messages_company_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_messages_company_created_idx ON public.whatsapp_messages USING btree (company_id, created_at);


--
-- Name: whatsapp_messages_identity_queue_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_messages_identity_queue_idx ON public.whatsapp_messages USING btree (chat_identity_id, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: whatsapp_messages_pending_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_messages_pending_idx ON public.whatsapp_messages USING btree (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: whatsapp_notification_consent_identity_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_notification_consent_identity_idx ON public.whatsapp_notification_consent_log USING btree (identity_id, created_at DESC);


--
-- Name: whatsapp_notification_delivery_retry_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_notification_delivery_retry_idx ON public.whatsapp_notification_deliveries USING btree (status, next_attempt_at) WHERE (status = 'failed'::text);


--
-- Name: whatsapp_typing_attempts_message_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_typing_attempts_message_idx ON public.whatsapp_typing_attempts USING btree (wa_message_id, attempt);


--
-- Name: whatsapp_typing_attempts_recent_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_typing_attempts_recent_idx ON public.whatsapp_typing_attempts USING btree (created_at DESC);


--
-- Name: whole_animal_breakdowns_company_occurred_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whole_animal_breakdowns_company_occurred_idx ON public.whole_animal_breakdowns USING btree (company_id, occurred_at DESC);


--
-- Name: whole_animal_breakdowns_source_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whole_animal_breakdowns_source_idx ON public.whole_animal_breakdowns USING btree (source_procurement_daily_record_id);


--
-- Name: whole_animal_outputs_breakdown_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whole_animal_outputs_breakdown_idx ON public.whole_animal_breakdown_outputs USING btree (breakdown_daily_record_id, line_number);


--
-- Name: whole_animal_procurements_company_occurred_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whole_animal_procurements_company_occurred_idx ON public.whole_animal_procurements USING btree (company_id, occurred_at DESC);


--
-- Name: daily_record_lines daily_record_lines_snapshot_stock_unit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER daily_record_lines_snapshot_stock_unit BEFORE INSERT ON public.daily_record_lines FOR EACH ROW EXECUTE FUNCTION private.snapshot_daily_record_stock_unit();


--
-- Name: daily_records daily_records_billing_gate; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER daily_records_billing_gate BEFORE INSERT ON public.daily_records FOR EACH ROW EXECUTE FUNCTION private.refuse_write_when_suspended();


--
-- Name: profiles guard_chat_business_switch; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_chat_business_switch BEFORE UPDATE OF active_company_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_chat_business_switch();


--
-- Name: whatsapp_identities guard_web_identity_notifications; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_web_identity_notifications BEFORE INSERT OR UPDATE ON public.whatsapp_identities FOR EACH ROW EXECUTE FUNCTION public.guard_web_identity_notifications();


--
-- Name: whatsapp_conversations keep_chat_question_day; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER keep_chat_question_day BEFORE UPDATE ON public.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION public.keep_chat_question_day();


--
-- Name: marketplace_order_requests marketplace_sync_shop_order_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER marketplace_sync_shop_order_trg AFTER UPDATE OF status ON public.marketplace_order_requests FOR EACH ROW EXECUTE FUNCTION private.marketplace_sync_shop_order();


--
-- Name: merchant_memory merchant_memory_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER merchant_memory_updated_at BEFORE UPDATE ON public.merchant_memory FOR EACH ROW EXECUTE FUNCTION public.merchant_memory_set_updated_at();


--
-- Name: petty_cash_transactions petty_cash_apply_transaction_ai; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER petty_cash_apply_transaction_ai AFTER INSERT OR UPDATE ON public.petty_cash_transactions FOR EACH ROW EXECUTE FUNCTION public.petty_cash_apply_transaction();


--
-- Name: petty_cash_transactions petty_cash_guard_balance_bi; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER petty_cash_guard_balance_bi BEFORE INSERT ON public.petty_cash_transactions FOR EACH ROW EXECUTE FUNCTION public.petty_cash_guard_balance();


--
-- Name: petty_cash_transactions petty_cash_protect_money_bu; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER petty_cash_protect_money_bu BEFORE UPDATE ON public.petty_cash_transactions FOR EACH ROW EXECUTE FUNCTION public.petty_cash_protect_money();


--
-- Name: product_costs product_costs_billing_gate; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER product_costs_billing_gate BEFORE INSERT ON public.product_costs FOR EACH ROW EXECUTE FUNCTION private.refuse_write_when_suspended();


--
-- Name: product_costs product_costs_guard_declared_unit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER product_costs_guard_declared_unit BEFORE INSERT ON public.product_costs FOR EACH ROW EXECUTE FUNCTION private.guard_product_cost_unit();


--
-- Name: product_costs product_costs_notify_ai; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER product_costs_notify_ai AFTER INSERT ON public.product_costs FOR EACH ROW EXECUTE FUNCTION public.product_costs_notify_members();


--
-- Name: product_selling_prices product_selling_prices_billing_gate; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER product_selling_prices_billing_gate BEFORE INSERT ON public.product_selling_prices FOR EACH ROW EXECUTE FUNCTION private.refuse_write_when_suspended();


--
-- Name: product_selling_prices product_selling_prices_guard_declared_unit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER product_selling_prices_guard_declared_unit BEFORE INSERT ON public.product_selling_prices FOR EACH ROW EXECUTE FUNCTION private.guard_product_selling_unit();


--
-- Name: receipt_aliases receipt_aliases_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER receipt_aliases_updated_at BEFORE UPDATE ON public.receipt_aliases FOR EACH ROW EXECUTE FUNCTION public.receipt_aliases_set_updated_at();


--
-- Name: receipts receipts_block_delete_when_booked_bd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER receipts_block_delete_when_booked_bd BEFORE DELETE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.receipts_block_delete_when_booked();


--
-- Name: receipts receipts_block_delete_when_paid_bd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER receipts_block_delete_when_paid_bd BEFORE DELETE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.receipts_block_delete_when_paid();


--
-- Name: receipts receipts_book_petty_cash_aiu; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER receipts_book_petty_cash_aiu AFTER INSERT OR UPDATE OF status, payment_method, total_amount ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.petty_cash_auto_book_receipt();


--
-- Name: receipts receipts_guard_live_staff_retirement_bu; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER receipts_guard_live_staff_retirement_bu BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.receipts_guard_live_staff_retirement();


--
-- Name: receipts receipts_guard_settlement_bu; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER receipts_guard_settlement_bu BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.receipts_guard_settlement();


--
-- Name: receipts receipts_guard_transitions_biu; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER receipts_guard_transitions_biu BEFORE INSERT OR UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.receipts_guard_transitions();


--
-- Name: receipts receipts_protect_booked_bu; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER receipts_protect_booked_bu BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.receipts_protect_booked();


--
-- Name: receipts receipts_set_company_id_biu; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER receipts_set_company_id_biu BEFORE INSERT OR UPDATE OF project_id ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.receipts_set_company_id();


--
-- Name: receipts receipts_write_audit_aiu; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER receipts_write_audit_aiu AFTER INSERT OR UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.receipts_write_audit();


--
-- Name: scanned_documents scanned_documents_set_company_id_biu; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER scanned_documents_set_company_id_biu BEFORE INSERT OR UPDATE OF project_id ON public.scanned_documents FOR EACH ROW EXECUTE FUNCTION public.scanned_documents_set_company_id();


--
-- Name: staff_retirement_receipts staff_retirement_receipt_live_guard_biu; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER staff_retirement_receipt_live_guard_biu BEFORE INSERT OR UPDATE OF retirement_id, receipt_id ON public.staff_retirement_receipts FOR EACH ROW EXECUTE FUNCTION public.staff_retirement_receipt_live_guard();


--
-- Name: staff_retirements staff_retirement_status_live_guard_bu; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER staff_retirement_status_live_guard_bu BEFORE UPDATE OF status ON public.staff_retirements FOR EACH ROW EXECUTE FUNCTION public.staff_retirement_status_live_guard();


--
-- Name: stock_counts stock_counts_billing_gate; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER stock_counts_billing_gate BEFORE INSERT ON public.stock_counts FOR EACH ROW EXECUTE FUNCTION private.refuse_write_when_suspended();


--
-- Name: stock_counts stock_counts_normalise_declared_unit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER stock_counts_normalise_declared_unit BEFORE INSERT ON public.stock_counts FOR EACH ROW EXECUTE FUNCTION private.normalise_stock_count_unit();


--
-- Name: profiles whatsapp_revoke_on_deactivate_au; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER whatsapp_revoke_on_deactivate_au AFTER UPDATE OF deactivated_at ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.whatsapp_revoke_on_deactivate();


--
-- Name: app_notifications app_notifications_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_notifications
    ADD CONSTRAINT app_notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: app_notifications app_notifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_notifications
    ADD CONSTRAINT app_notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: app_notifications app_notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_notifications
    ADD CONSTRAINT app_notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: business_vocabulary_audit_log business_vocabulary_audit_log_actor_id_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_vocabulary_audit_log
    ADD CONSTRAINT business_vocabulary_audit_log_actor_id_delete_set_null_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: business_vocabulary_audit_log business_vocabulary_audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_vocabulary_audit_log
    ADD CONSTRAINT business_vocabulary_audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: business_vocabulary business_vocabulary_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_vocabulary
    ADD CONSTRAINT business_vocabulary_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: business_vocabulary business_vocabulary_created_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_vocabulary
    ADD CONSTRAINT business_vocabulary_created_by_delete_set_null_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.whatsapp_identities(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_wa_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_wa_message_id_fkey FOREIGN KEY (wa_message_id) REFERENCES public.whatsapp_messages(wa_message_id) ON DELETE CASCADE;


--
-- Name: company_invite_codes company_invite_codes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_invite_codes
    ADD CONSTRAINT company_invite_codes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_invite_codes company_invite_codes_created_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_invite_codes
    ADD CONSTRAINT company_invite_codes_created_by_delete_set_null_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: company_marketplace_settings company_marketplace_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_marketplace_settings
    ADD CONSTRAINT company_marketplace_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_marketplace_settings company_marketplace_settings_contact_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_marketplace_settings
    ADD CONSTRAINT company_marketplace_settings_contact_profile_id_fkey FOREIGN KEY (contact_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: company_marketplace_settings company_marketplace_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_marketplace_settings
    ADD CONSTRAINT company_marketplace_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: company_members company_members_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_members company_members_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: company_suppliers company_suppliers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_suppliers
    ADD CONSTRAINT company_suppliers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_suppliers company_suppliers_opted_in_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_suppliers
    ADD CONSTRAINT company_suppliers_opted_in_by_fkey FOREIGN KEY (opted_in_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: daily_closures daily_closures_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_closures
    ADD CONSTRAINT daily_closures_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: daily_closures daily_closures_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_closures
    ADD CONSTRAINT daily_closures_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: daily_record_audit_log daily_record_audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_record_audit_log
    ADD CONSTRAINT daily_record_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: daily_record_audit_log daily_record_audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_record_audit_log
    ADD CONSTRAINT daily_record_audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: daily_record_audit_log daily_record_audit_log_daily_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_record_audit_log
    ADD CONSTRAINT daily_record_audit_log_daily_record_id_fkey FOREIGN KEY (daily_record_id) REFERENCES public.daily_records(id) ON DELETE CASCADE;


--
-- Name: daily_record_lines daily_record_lines_daily_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_record_lines
    ADD CONSTRAINT daily_record_lines_daily_record_id_fkey FOREIGN KEY (daily_record_id) REFERENCES public.daily_records(id) ON DELETE CASCADE;


--
-- Name: daily_records daily_records_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_records
    ADD CONSTRAINT daily_records_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: daily_records daily_records_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_records
    ADD CONSTRAINT daily_records_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: daily_records daily_records_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_records
    ADD CONSTRAINT daily_records_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: daily_records daily_records_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_records
    ADD CONSTRAINT daily_records_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: daily_records daily_records_voided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_records
    ADD CONSTRAINT daily_records_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: invite_links invite_links_created_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invite_links
    ADD CONSTRAINT invite_links_created_by_delete_set_null_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: invite_links invite_links_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invite_links
    ADD CONSTRAINT invite_links_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: invoice_activity invoice_activity_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_activity
    ADD CONSTRAINT invoice_activity_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_comments invoice_comments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_comments
    ADD CONSTRAINT invoice_comments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_comments invoice_comments_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_comments
    ADD CONSTRAINT invoice_comments_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE SET NULL;


--
-- Name: invoice_receipts invoice_receipts_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_receipts
    ADD CONSTRAINT invoice_receipts_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_receipts invoice_receipts_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_receipts
    ADD CONSTRAINT invoice_receipts_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE RESTRICT;


--
-- Name: invoices invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: invoices invoices_generated_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_generated_by_delete_set_null_fkey FOREIGN KEY (generated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_signed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_signed_by_fkey FOREIGN KEY (signed_by) REFERENCES public.profiles(id);


--
-- Name: legal_acceptances legal_acceptances_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.legal_acceptances
    ADD CONSTRAINT legal_acceptances_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: legal_acceptances legal_acceptances_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.legal_acceptances
    ADD CONSTRAINT legal_acceptances_version_fkey FOREIGN KEY (version) REFERENCES public.legal_policy_versions(version);


--
-- Name: marketplace_order_requests marketplace_order_requests_buyer_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_order_requests
    ADD CONSTRAINT marketplace_order_requests_buyer_company_id_fkey FOREIGN KEY (buyer_company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: marketplace_order_requests marketplace_order_requests_buyer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_order_requests
    ADD CONSTRAINT marketplace_order_requests_buyer_profile_id_fkey FOREIGN KEY (buyer_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: marketplace_order_requests marketplace_order_requests_supplier_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_order_requests
    ADD CONSTRAINT marketplace_order_requests_supplier_company_id_fkey FOREIGN KEY (supplier_company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: marketplace_pending_selections marketplace_pending_selections_buyer_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_pending_selections
    ADD CONSTRAINT marketplace_pending_selections_buyer_company_id_fkey FOREIGN KEY (buyer_company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: marketplace_pending_selections marketplace_pending_selections_buyer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_pending_selections
    ADD CONSTRAINT marketplace_pending_selections_buyer_profile_id_fkey FOREIGN KEY (buyer_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: marketplace_product_index marketplace_product_index_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketplace_product_index
    ADD CONSTRAINT marketplace_product_index_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: merchant_memory merchant_memory_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.merchant_memory
    ADD CONSTRAINT merchant_memory_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: merchant_memory merchant_memory_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.merchant_memory
    ADD CONSTRAINT merchant_memory_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: merchant_memory merchant_memory_learned_from_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.merchant_memory
    ADD CONSTRAINT merchant_memory_learned_from_receipt_id_fkey FOREIGN KEY (learned_from_receipt_id) REFERENCES public.receipts(id) ON DELETE SET NULL;


--
-- Name: obligation_payments obligation_payments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.obligation_payments
    ADD CONSTRAINT obligation_payments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: obligation_payments obligation_payments_daily_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.obligation_payments
    ADD CONSTRAINT obligation_payments_daily_record_id_fkey FOREIGN KEY (daily_record_id) REFERENCES public.daily_records(id) ON DELETE SET NULL;


--
-- Name: obligation_payments obligation_payments_obligation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.obligation_payments
    ADD CONSTRAINT obligation_payments_obligation_id_fkey FOREIGN KEY (obligation_id) REFERENCES public.recurring_obligations(id) ON DELETE CASCADE;


--
-- Name: obligation_payments obligation_payments_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.obligation_payments
    ADD CONSTRAINT obligation_payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ops_alert_deliveries ops_alert_deliveries_incident_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ops_alert_deliveries
    ADD CONSTRAINT ops_alert_deliveries_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.ops_incidents(id);


--
-- Name: ops_incidents ops_incidents_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ops_incidents
    ADD CONSTRAINT ops_incidents_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES auth.users(id);


--
-- Name: ops_privacy_requests ops_privacy_requests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ops_privacy_requests
    ADD CONSTRAINT ops_privacy_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: ops_privacy_requests ops_privacy_requests_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ops_privacy_requests
    ADD CONSTRAINT ops_privacy_requests_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: ops_recovery_evidence ops_recovery_evidence_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ops_recovery_evidence
    ADD CONSTRAINT ops_recovery_evidence_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id);


--
-- Name: petty_cash_accounts petty_cash_accounts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.petty_cash_accounts
    ADD CONSTRAINT petty_cash_accounts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: petty_cash_accounts petty_cash_accounts_user_id_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.petty_cash_accounts
    ADD CONSTRAINT petty_cash_accounts_user_id_delete_set_null_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: petty_cash_transactions petty_cash_transactions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.petty_cash_transactions
    ADD CONSTRAINT petty_cash_transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.petty_cash_accounts(id) ON DELETE CASCADE;


--
-- Name: petty_cash_transactions petty_cash_transactions_created_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.petty_cash_transactions
    ADD CONSTRAINT petty_cash_transactions_created_by_delete_set_null_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: petty_cash_transactions petty_cash_transactions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.petty_cash_transactions
    ADD CONSTRAINT petty_cash_transactions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: petty_cash_transactions petty_cash_transactions_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.petty_cash_transactions
    ADD CONSTRAINT petty_cash_transactions_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE SET NULL;


--
-- Name: petty_cash_transactions petty_cash_transactions_reversed_by_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.petty_cash_transactions
    ADD CONSTRAINT petty_cash_transactions_reversed_by_transaction_id_fkey FOREIGN KEY (reversed_by_transaction_id) REFERENCES public.petty_cash_transactions(id);


--
-- Name: petty_cash_transactions petty_cash_transactions_reverses_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.petty_cash_transactions
    ADD CONSTRAINT petty_cash_transactions_reverses_transaction_id_fkey FOREIGN KEY (reverses_transaction_id) REFERENCES public.petty_cash_transactions(id);


--
-- Name: platform_admins platform_admins_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: platform_admins platform_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: platform_expenses platform_expenses_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_expenses
    ADD CONSTRAINT platform_expenses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: platform_expenses platform_expenses_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_expenses
    ADD CONSTRAINT platform_expenses_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: product_archives product_archives_archived_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_archives
    ADD CONSTRAINT product_archives_archived_by_delete_set_null_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: product_archives product_archives_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_archives
    ADD CONSTRAINT product_archives_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: product_barcodes product_barcodes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_barcodes
    ADD CONSTRAINT product_barcodes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: product_barcodes product_barcodes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_barcodes
    ADD CONSTRAINT product_barcodes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: product_combos product_combos_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_combos
    ADD CONSTRAINT product_combos_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: product_combos product_combos_created_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_combos
    ADD CONSTRAINT product_combos_created_by_delete_set_null_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: product_cost_prompts product_cost_prompts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_cost_prompts
    ADD CONSTRAINT product_cost_prompts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: product_cost_prompts product_cost_prompts_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_cost_prompts
    ADD CONSTRAINT product_cost_prompts_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: product_costs product_costs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_costs
    ADD CONSTRAINT product_costs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: product_costs product_costs_recorded_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_costs
    ADD CONSTRAINT product_costs_recorded_by_delete_set_null_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: product_events product_events_actor_id_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_events
    ADD CONSTRAINT product_events_actor_id_delete_set_null_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: product_events product_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_events
    ADD CONSTRAINT product_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: product_selling_prices product_selling_prices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_selling_prices
    ADD CONSTRAINT product_selling_prices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: product_selling_prices product_selling_prices_recorded_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_selling_prices
    ADD CONSTRAINT product_selling_prices_recorded_by_delete_set_null_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: product_unit_audit_log product_unit_audit_log_actor_id_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_unit_audit_log
    ADD CONSTRAINT product_unit_audit_log_actor_id_delete_set_null_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: product_unit_audit_log product_unit_audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_unit_audit_log
    ADD CONSTRAINT product_unit_audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: product_units product_units_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: product_units product_units_created_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_created_by_delete_set_null_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_active_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_active_company_id_fkey FOREIGN KEY (active_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: projects projects_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: projects projects_created_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_delete_set_null_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: receipt_aliases receipt_aliases_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipt_aliases
    ADD CONSTRAINT receipt_aliases_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE CASCADE;


--
-- Name: receipt_aliases receipt_aliases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipt_aliases
    ADD CONSTRAINT receipt_aliases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: receipt_audit_log receipt_audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipt_audit_log
    ADD CONSTRAINT receipt_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: receipt_audit_log receipt_audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipt_audit_log
    ADD CONSTRAINT receipt_audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: receipt_audit_log receipt_audit_log_petty_cash_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipt_audit_log
    ADD CONSTRAINT receipt_audit_log_petty_cash_account_id_fkey FOREIGN KEY (petty_cash_account_id) REFERENCES public.petty_cash_accounts(id) ON DELETE SET NULL;


--
-- Name: receipt_audit_log receipt_audit_log_petty_cash_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipt_audit_log
    ADD CONSTRAINT receipt_audit_log_petty_cash_transaction_id_fkey FOREIGN KEY (petty_cash_transaction_id) REFERENCES public.petty_cash_transactions(id) ON DELETE SET NULL;


--
-- Name: receipt_audit_log receipt_audit_log_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipt_audit_log
    ADD CONSTRAINT receipt_audit_log_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE SET NULL;


--
-- Name: receipts receipts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: receipts receipts_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.profiles(id);


--
-- Name: receipts receipts_duplicate_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_duplicate_of_fkey FOREIGN KEY (duplicate_of) REFERENCES public.receipts(id) ON DELETE SET NULL;


--
-- Name: receipts receipts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: receipts receipts_reimbursed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_reimbursed_by_fkey FOREIGN KEY (reimbursed_by) REFERENCES public.profiles(id);


--
-- Name: receipts receipts_scanned_doc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_scanned_doc_id_fkey FOREIGN KEY (scanned_doc_id) REFERENCES public.scanned_documents(id) ON DELETE SET NULL;


--
-- Name: receipts receipts_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(id);


--
-- Name: receipts receipts_uploaded_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_uploaded_by_delete_set_null_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: recurring_obligations recurring_obligations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recurring_obligations
    ADD CONSTRAINT recurring_obligations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: recurring_obligations recurring_obligations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recurring_obligations
    ADD CONSTRAINT recurring_obligations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: reimbursement_payout_items reimbursement_payout_items_payout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reimbursement_payout_items
    ADD CONSTRAINT reimbursement_payout_items_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES public.reimbursement_payouts(id) ON DELETE CASCADE;


--
-- Name: reimbursement_payout_items reimbursement_payout_items_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reimbursement_payout_items
    ADD CONSTRAINT reimbursement_payout_items_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE RESTRICT;


--
-- Name: reimbursement_payouts reimbursement_payouts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reimbursement_payouts
    ADD CONSTRAINT reimbursement_payouts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: reimbursement_payouts reimbursement_payouts_paid_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reimbursement_payouts
    ADD CONSTRAINT reimbursement_payouts_paid_by_delete_set_null_fkey FOREIGN KEY (paid_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: reimbursement_payouts reimbursement_payouts_paid_to_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reimbursement_payouts
    ADD CONSTRAINT reimbursement_payouts_paid_to_delete_set_null_fkey FOREIGN KEY (paid_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: reimbursement_payouts reimbursement_payouts_voided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reimbursement_payouts
    ADD CONSTRAINT reimbursement_payouts_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: scanned_documents scanned_documents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scanned_documents
    ADD CONSTRAINT scanned_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: scanned_documents scanned_documents_created_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scanned_documents
    ADD CONSTRAINT scanned_documents_created_by_delete_set_null_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: scanned_documents scanned_documents_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scanned_documents
    ADD CONSTRAINT scanned_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: shop_order_events shop_order_events_actor_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shop_order_events
    ADD CONSTRAINT shop_order_events_actor_company_id_fkey FOREIGN KEY (actor_company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: shop_order_events shop_order_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shop_order_events
    ADD CONSTRAINT shop_order_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.shop_orders(id) ON DELETE CASCADE;


--
-- Name: shop_order_lines shop_order_lines_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shop_order_lines
    ADD CONSTRAINT shop_order_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.shop_orders(id) ON DELETE CASCADE;


--
-- Name: shop_orders shop_orders_buyer_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shop_orders
    ADD CONSTRAINT shop_orders_buyer_company_id_fkey FOREIGN KEY (buyer_company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: shop_orders shop_orders_supplier_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shop_orders
    ADD CONSTRAINT shop_orders_supplier_company_id_fkey FOREIGN KEY (supplier_company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: staff_retirement_audit_log staff_retirement_audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirement_audit_log
    ADD CONSTRAINT staff_retirement_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: staff_retirement_audit_log staff_retirement_audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirement_audit_log
    ADD CONSTRAINT staff_retirement_audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: staff_retirement_audit_log staff_retirement_audit_log_retirement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirement_audit_log
    ADD CONSTRAINT staff_retirement_audit_log_retirement_id_fkey FOREIGN KEY (retirement_id) REFERENCES public.staff_retirements(id) ON DELETE CASCADE;


--
-- Name: staff_retirement_documents staff_retirement_documents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirement_documents
    ADD CONSTRAINT staff_retirement_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: staff_retirement_documents staff_retirement_documents_created_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirement_documents
    ADD CONSTRAINT staff_retirement_documents_created_by_delete_set_null_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: staff_retirement_documents staff_retirement_documents_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirement_documents
    ADD CONSTRAINT staff_retirement_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: staff_retirement_documents staff_retirement_documents_retirement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirement_documents
    ADD CONSTRAINT staff_retirement_documents_retirement_id_fkey FOREIGN KEY (retirement_id) REFERENCES public.staff_retirements(id) ON DELETE CASCADE;


--
-- Name: staff_retirement_receipts staff_retirement_receipts_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirement_receipts
    ADD CONSTRAINT staff_retirement_receipts_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE RESTRICT;


--
-- Name: staff_retirement_receipts staff_retirement_receipts_retirement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirement_receipts
    ADD CONSTRAINT staff_retirement_receipts_retirement_id_fkey FOREIGN KEY (retirement_id) REFERENCES public.staff_retirements(id) ON DELETE CASCADE;


--
-- Name: staff_retirements staff_retirements_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirements
    ADD CONSTRAINT staff_retirements_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: staff_retirements staff_retirements_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirements
    ADD CONSTRAINT staff_retirements_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: staff_retirements staff_retirements_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirements
    ADD CONSTRAINT staff_retirements_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: staff_retirements staff_retirements_paid_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirements
    ADD CONSTRAINT staff_retirements_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: staff_retirements staff_retirements_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirements
    ADD CONSTRAINT staff_retirements_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: staff_retirements staff_retirements_received_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirements
    ADD CONSTRAINT staff_retirements_received_confirmed_by_fkey FOREIGN KEY (received_confirmed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: staff_retirements staff_retirements_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirements
    ADD CONSTRAINT staff_retirements_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: staff_retirements staff_retirements_staff_id_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirements
    ADD CONSTRAINT staff_retirements_staff_id_delete_set_null_fkey FOREIGN KEY (staff_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: staff_retirements staff_retirements_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirements
    ADD CONSTRAINT staff_retirements_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: staff_retirements staff_retirements_viewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_retirements
    ADD CONSTRAINT staff_retirements_viewed_by_fkey FOREIGN KEY (viewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: stock_counts stock_counts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_counts
    ADD CONSTRAINT stock_counts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: stock_counts stock_counts_counted_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_counts
    ADD CONSTRAINT stock_counts_counted_by_delete_set_null_fkey FOREIGN KEY (counted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: subscription_events subscription_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_events
    ADD CONSTRAINT subscription_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: subscription_events subscription_events_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_events
    ADD CONSTRAINT subscription_events_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.subscription_invoices(id) ON DELETE SET NULL;


--
-- Name: subscription_invoices subscription_invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: subscription_invoices subscription_invoices_paid_manually_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_paid_manually_by_fkey FOREIGN KEY (paid_manually_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: subscription_invoices subscription_invoices_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;


--
-- Name: subscription_usage subscription_usage_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_usage
    ADD CONSTRAINT subscription_usage_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: subscription_usage subscription_usage_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_usage
    ADD CONSTRAINT subscription_usage_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_fkey FOREIGN KEY (plan) REFERENCES public.billing_plans(code);


--
-- Name: supplier_claim_audit_log supplier_claim_audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claim_audit_log
    ADD CONSTRAINT supplier_claim_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: supplier_claim_audit_log supplier_claim_audit_log_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claim_audit_log
    ADD CONSTRAINT supplier_claim_audit_log_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.supplier_claims(id) ON DELETE CASCADE;


--
-- Name: supplier_claim_audit_log supplier_claim_audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claim_audit_log
    ADD CONSTRAINT supplier_claim_audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: supplier_claim_messages supplier_claim_messages_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claim_messages
    ADD CONSTRAINT supplier_claim_messages_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.supplier_claims(id) ON DELETE CASCADE;


--
-- Name: supplier_claim_receipts supplier_claim_receipts_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claim_receipts
    ADD CONSTRAINT supplier_claim_receipts_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.supplier_claims(id) ON DELETE CASCADE;


--
-- Name: supplier_claims supplier_claims_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claims
    ADD CONSTRAINT supplier_claims_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: supplier_claims supplier_claims_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claims
    ADD CONSTRAINT supplier_claims_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.supplier_connections(id) ON DELETE CASCADE;


--
-- Name: supplier_claims supplier_claims_disputed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claims
    ADD CONSTRAINT supplier_claims_disputed_by_fkey FOREIGN KEY (disputed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: supplier_claims supplier_claims_paid_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claims
    ADD CONSTRAINT supplier_claims_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: supplier_claims supplier_claims_target_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claims
    ADD CONSTRAINT supplier_claims_target_company_id_fkey FOREIGN KEY (target_company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: supplier_claims supplier_claims_viewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_claims
    ADD CONSTRAINT supplier_claims_viewed_by_fkey FOREIGN KEY (viewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: supplier_connections supplier_connections_approved_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_connections
    ADD CONSTRAINT supplier_connections_approved_by_delete_set_null_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: supplier_connections supplier_connections_target_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_connections
    ADD CONSTRAINT supplier_connections_target_company_id_fkey FOREIGN KEY (target_company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: wa_login_tokens wa_login_tokens_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wa_login_tokens
    ADD CONSTRAINT wa_login_tokens_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: web_signup_drafts web_signup_drafts_terms_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.web_signup_drafts
    ADD CONSTRAINT web_signup_drafts_terms_version_fkey FOREIGN KEY (terms_version) REFERENCES public.legal_policy_versions(version);


--
-- Name: whatsapp_ai_interpretations whatsapp_ai_interpretations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_ai_interpretations
    ADD CONSTRAINT whatsapp_ai_interpretations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: whatsapp_ai_messages whatsapp_ai_messages_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_ai_messages
    ADD CONSTRAINT whatsapp_ai_messages_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: whatsapp_ai_messages whatsapp_ai_messages_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_ai_messages
    ADD CONSTRAINT whatsapp_ai_messages_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.whatsapp_identities(id) ON DELETE CASCADE;


--
-- Name: whatsapp_ai_messages whatsapp_ai_messages_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_ai_messages
    ADD CONSTRAINT whatsapp_ai_messages_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: whatsapp_ai_threads whatsapp_ai_threads_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_ai_threads
    ADD CONSTRAINT whatsapp_ai_threads_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: whatsapp_ai_threads whatsapp_ai_threads_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_ai_threads
    ADD CONSTRAINT whatsapp_ai_threads_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.whatsapp_identities(id) ON DELETE CASCADE;


--
-- Name: whatsapp_ai_threads whatsapp_ai_threads_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_ai_threads
    ADD CONSTRAINT whatsapp_ai_threads_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: whatsapp_ai_usage_daily whatsapp_ai_usage_daily_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_ai_usage_daily
    ADD CONSTRAINT whatsapp_ai_usage_daily_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: whatsapp_audit_log whatsapp_audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_audit_log
    ADD CONSTRAINT whatsapp_audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: whatsapp_audit_log whatsapp_audit_log_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_audit_log
    ADD CONSTRAINT whatsapp_audit_log_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: whatsapp_audit_log whatsapp_audit_log_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_audit_log
    ADD CONSTRAINT whatsapp_audit_log_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE SET NULL;


--
-- Name: whatsapp_conversations whatsapp_conversations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: whatsapp_conversations whatsapp_conversations_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.whatsapp_identities(id) ON DELETE CASCADE;


--
-- Name: whatsapp_conversations whatsapp_conversations_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: whatsapp_conversations whatsapp_conversations_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE CASCADE;


--
-- Name: whatsapp_daily_nudges whatsapp_daily_nudges_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_daily_nudges
    ADD CONSTRAINT whatsapp_daily_nudges_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.whatsapp_identities(id) ON DELETE CASCADE;


--
-- Name: whatsapp_identities whatsapp_identities_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_identities
    ADD CONSTRAINT whatsapp_identities_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: whatsapp_identities whatsapp_identities_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_identities
    ADD CONSTRAINT whatsapp_identities_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: whatsapp_link_tokens whatsapp_link_tokens_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_link_tokens
    ADD CONSTRAINT whatsapp_link_tokens_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: whatsapp_link_tokens whatsapp_link_tokens_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_link_tokens
    ADD CONSTRAINT whatsapp_link_tokens_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: whatsapp_messages whatsapp_messages_chat_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_chat_identity_id_fkey FOREIGN KEY (chat_identity_id) REFERENCES public.whatsapp_identities(id);


--
-- Name: whatsapp_messages whatsapp_messages_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: whatsapp_messages whatsapp_messages_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: whatsapp_messages whatsapp_messages_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE SET NULL;


--
-- Name: whatsapp_notification_consent_log whatsapp_notification_consent_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_notification_consent_log
    ADD CONSTRAINT whatsapp_notification_consent_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: whatsapp_notification_consent_log whatsapp_notification_consent_log_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_notification_consent_log
    ADD CONSTRAINT whatsapp_notification_consent_log_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.whatsapp_identities(id) ON DELETE CASCADE;


--
-- Name: whatsapp_notification_consent_log whatsapp_notification_consent_log_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_notification_consent_log
    ADD CONSTRAINT whatsapp_notification_consent_log_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: whatsapp_notification_deliveries whatsapp_notification_deliveries_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_notification_deliveries
    ADD CONSTRAINT whatsapp_notification_deliveries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: whatsapp_notification_deliveries whatsapp_notification_deliveries_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_notification_deliveries
    ADD CONSTRAINT whatsapp_notification_deliveries_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.whatsapp_identities(id) ON DELETE CASCADE;


--
-- Name: whole_animal_breakdown_outputs whole_animal_breakdown_outputs_breakdown_daily_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whole_animal_breakdown_outputs
    ADD CONSTRAINT whole_animal_breakdown_outputs_breakdown_daily_record_id_fkey FOREIGN KEY (breakdown_daily_record_id) REFERENCES public.whole_animal_breakdowns(daily_record_id) ON DELETE RESTRICT;


--
-- Name: whole_animal_breakdowns whole_animal_breakdowns_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whole_animal_breakdowns
    ADD CONSTRAINT whole_animal_breakdowns_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: whole_animal_breakdowns whole_animal_breakdowns_created_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whole_animal_breakdowns
    ADD CONSTRAINT whole_animal_breakdowns_created_by_delete_set_null_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: whole_animal_breakdowns whole_animal_breakdowns_daily_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whole_animal_breakdowns
    ADD CONSTRAINT whole_animal_breakdowns_daily_record_id_fkey FOREIGN KEY (daily_record_id) REFERENCES public.daily_records(id) ON DELETE RESTRICT;


--
-- Name: whole_animal_breakdowns whole_animal_breakdowns_source_procurement_daily_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whole_animal_breakdowns
    ADD CONSTRAINT whole_animal_breakdowns_source_procurement_daily_record_id_fkey FOREIGN KEY (source_procurement_daily_record_id) REFERENCES public.daily_records(id) ON DELETE RESTRICT;


--
-- Name: whole_animal_procurements whole_animal_procurements_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whole_animal_procurements
    ADD CONSTRAINT whole_animal_procurements_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: whole_animal_procurements whole_animal_procurements_created_by_delete_set_null_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whole_animal_procurements
    ADD CONSTRAINT whole_animal_procurements_created_by_delete_set_null_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: whole_animal_procurements whole_animal_procurements_daily_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whole_animal_procurements
    ADD CONSTRAINT whole_animal_procurements_daily_record_id_fkey FOREIGN KEY (daily_record_id) REFERENCES public.daily_records(id) ON DELETE RESTRICT;


--
-- Name: objects objects_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: postgres
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: app_notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: app_notifications app_notifications_insert_same_company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY app_notifications_insert_same_company ON public.app_notifications FOR INSERT TO authenticated WITH CHECK (((company_id = private.auth_company_id()) AND (actor_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = app_notifications.recipient_id) AND (p.company_id = private.auth_company_id()))))));


--
-- Name: app_notifications app_notifications_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY app_notifications_select_own ON public.app_notifications FOR SELECT TO authenticated USING ((recipient_id = auth.uid()));


--
-- Name: app_notifications app_notifications_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY app_notifications_update_own ON public.app_notifications FOR UPDATE TO authenticated USING ((recipient_id = auth.uid())) WITH CHECK ((recipient_id = auth.uid()));


--
-- Name: billing_plans; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_plans billing_plans_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY billing_plans_select ON public.billing_plans FOR SELECT TO authenticated USING (true);


--
-- Name: business_vocabulary; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.business_vocabulary ENABLE ROW LEVEL SECURITY;

--
-- Name: business_vocabulary_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.business_vocabulary_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: business_vocabulary_audit_log business_vocabulary_audit_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY business_vocabulary_audit_read ON public.business_vocabulary_audit_log FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: business_vocabulary business_vocabulary_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY business_vocabulary_read ON public.business_vocabulary FOR SELECT TO authenticated USING ((company_id = private.auth_company_id()));


--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages chat_messages_self_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY chat_messages_self_read ON public.chat_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.whatsapp_identities i
     JOIN public.company_members m ON ((m.profile_id = i.profile_id)))
     JOIN public.profiles p ON ((p.id = i.profile_id)))
  WHERE ((i.id = chat_messages.identity_id) AND (i.profile_id = auth.uid()) AND (i.revoked_at IS NULL) AND (p.deactivated_at IS NULL) AND (m.company_id = chat_messages.company_id) AND (m.deactivated_at IS NULL)))));


--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY companies_select_own ON public.companies FOR SELECT TO authenticated USING ((id = private.auth_company_id()));


--
-- Name: companies companies_update_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY companies_update_owner ON public.companies FOR UPDATE TO authenticated USING (((id = private.auth_company_id()) AND (private.auth_role() = 'owner'::public.user_role))) WITH CHECK (((id = private.auth_company_id()) AND (private.auth_role() = 'owner'::public.user_role)));


--
-- Name: company_invite_codes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.company_invite_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: company_invite_codes company_invite_codes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY company_invite_codes_select ON public.company_invite_codes FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: company_marketplace_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.company_marketplace_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: company_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

--
-- Name: company_members company_members_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY company_members_select ON public.company_members FOR SELECT TO authenticated USING (((profile_id = auth.uid()) OR ((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])))));


--
-- Name: company_suppliers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.company_suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: company_suppliers company_suppliers_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY company_suppliers_select_own ON public.company_suppliers FOR SELECT TO authenticated USING ((company_id = private.auth_company_id()));


--
-- Name: daily_closures; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.daily_closures ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_closures daily_closures_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY daily_closures_select_own ON public.daily_closures FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: daily_record_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.daily_record_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_record_audit_log daily_record_audit_select_visible; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY daily_record_audit_select_visible ON public.daily_record_audit_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.daily_records dr
  WHERE ((dr.id = daily_record_audit_log.daily_record_id) AND (dr.company_id = private.auth_company_id()) AND ((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) OR (dr.recorded_by = auth.uid()))))));


--
-- Name: daily_record_lines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.daily_record_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_record_lines daily_record_lines_select_visible; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY daily_record_lines_select_visible ON public.daily_record_lines FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.daily_records dr
  WHERE ((dr.id = daily_record_lines.daily_record_id) AND (dr.company_id = private.auth_company_id()) AND ((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) OR (dr.recorded_by = auth.uid()))))));


--
-- Name: daily_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.daily_records ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_records daily_records_select_visible; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY daily_records_select_visible ON public.daily_records FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND ((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) OR (recorded_by = auth.uid()))));


--
-- Name: invite_links; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.invite_links ENABLE ROW LEVEL SECURITY;

--
-- Name: invite_links invite_links_delete_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invite_links_delete_owner ON public.invite_links FOR DELETE TO authenticated USING (((private.auth_role() = 'owner'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = invite_links.project_id) AND (p.company_id = private.auth_company_id()))))));


--
-- Name: invite_links invite_links_insert_leader; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invite_links_insert_leader ON public.invite_links FOR INSERT TO authenticated WITH CHECK ((private.is_project_leader(project_id) AND (role = 'worker'::public.user_role) AND (created_by = auth.uid())));


--
-- Name: invite_links invite_links_insert_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invite_links_insert_owner ON public.invite_links FOR INSERT TO authenticated WITH CHECK (((private.auth_role() = 'owner'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = invite_links.project_id) AND (p.company_id = private.auth_company_id()))))));


--
-- Name: invite_links invite_links_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invite_links_select ON public.invite_links FOR SELECT TO authenticated USING (((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = invite_links.project_id) AND (p.company_id = private.auth_company_id()))))));


--
-- Name: invite_links invite_links_select_leader; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invite_links_select_leader ON public.invite_links FOR SELECT TO authenticated USING (private.is_project_leader(project_id));


--
-- Name: invite_links invite_links_update_leader; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invite_links_update_leader ON public.invite_links FOR UPDATE TO authenticated USING (private.is_project_leader(project_id)) WITH CHECK (private.is_project_leader(project_id));


--
-- Name: invite_links invite_links_update_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invite_links_update_owner ON public.invite_links FOR UPDATE TO authenticated USING (((private.auth_role() = 'owner'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = invite_links.project_id) AND (p.company_id = private.auth_company_id())))))) WITH CHECK (((private.auth_role() = 'owner'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = invite_links.project_id) AND (p.company_id = private.auth_company_id()))))));


--
-- Name: invoice_activity; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.invoice_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_activity invoice_activity_finance_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoice_activity_finance_select ON public.invoice_activity FOR SELECT TO authenticated USING (((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_activity.invoice_id) AND (i.company_id = private.auth_company_id()))))));


--
-- Name: invoice_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.invoice_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_comments invoice_comments_finance_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoice_comments_finance_select ON public.invoice_comments FOR SELECT TO authenticated USING (((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_comments.invoice_id) AND (i.company_id = private.auth_company_id()))))));


--
-- Name: invoice_comments invoice_comments_finance_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoice_comments_finance_update ON public.invoice_comments FOR UPDATE TO authenticated USING (((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_comments.invoice_id) AND (i.company_id = private.auth_company_id())))))) WITH CHECK (true);


--
-- Name: invoice_receipts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.invoice_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_receipts invoice_receipts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoice_receipts_select ON public.invoice_receipts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.invoices i
     JOIN public.projects p ON ((p.id = i.project_id)))
  WHERE ((i.id = invoice_receipts.invoice_id) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) AND (p.company_id = private.auth_company_id())))));


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_delete_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoices_delete_owner ON public.invoices FOR DELETE TO authenticated USING (((private.auth_role() = 'owner'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = invoices.project_id) AND (p.company_id = private.auth_company_id()))))));


--
-- Name: invoices invoices_insert_finance; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoices_insert_finance ON public.invoices FOR INSERT TO authenticated WITH CHECK (((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = invoices.project_id) AND (p.company_id = private.auth_company_id())))) AND (generated_by = auth.uid())));


--
-- Name: invoices invoices_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated USING (((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = invoices.project_id) AND (p.company_id = private.auth_company_id()))))));


--
-- Name: invoices invoices_update_finance; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoices_update_finance ON public.invoices FOR UPDATE TO authenticated USING (((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = invoices.project_id) AND (p.company_id = private.auth_company_id())))) AND (status = 'draft'::public.invoice_status))) WITH CHECK (((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = invoices.project_id) AND (p.company_id = private.auth_company_id()))))));


--
-- Name: legal_acceptances; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

--
-- Name: legal_acceptances legal_acceptances_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY legal_acceptances_own ON public.legal_acceptances FOR SELECT TO authenticated USING ((profile_id = auth.uid()));


--
-- Name: legal_policy_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.legal_policy_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: legal_policy_versions legal_versions_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY legal_versions_read ON public.legal_policy_versions FOR SELECT TO anon, authenticated USING (true);


--
-- Name: marketplace_order_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.marketplace_order_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_pending_selections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.marketplace_pending_selections ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_product_index; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.marketplace_product_index ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_memory; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.merchant_memory ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_memory merchant_memory_insert_same_company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY merchant_memory_insert_same_company ON public.merchant_memory FOR INSERT TO authenticated WITH CHECK (((company_id = private.auth_company_id()) AND (created_by = auth.uid())));


--
-- Name: merchant_memory merchant_memory_select_same_company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY merchant_memory_select_same_company ON public.merchant_memory FOR SELECT TO authenticated USING ((company_id = private.auth_company_id()));


--
-- Name: merchant_memory merchant_memory_update_same_company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY merchant_memory_update_same_company ON public.merchant_memory FOR UPDATE TO authenticated USING ((company_id = private.auth_company_id())) WITH CHECK ((company_id = private.auth_company_id()));


--
-- Name: obligation_payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.obligation_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: obligation_payments obligation_payments_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY obligation_payments_select ON public.obligation_payments FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: ops_alert_deliveries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ops_alert_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_incidents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ops_incidents ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_monitor_runs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ops_monitor_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_privacy_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ops_privacy_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_recovery_evidence; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ops_recovery_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: petty_cash_accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.petty_cash_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: petty_cash_accounts petty_cash_accounts_insert_finance; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY petty_cash_accounts_insert_finance ON public.petty_cash_accounts FOR INSERT TO authenticated WITH CHECK (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: petty_cash_accounts petty_cash_accounts_leader_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY petty_cash_accounts_leader_select ON public.petty_cash_accounts FOR SELECT TO authenticated USING (private.leads_petty_user(user_id));


--
-- Name: petty_cash_accounts petty_cash_accounts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY petty_cash_accounts_select ON public.petty_cash_accounts FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR ((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])))));


--
-- Name: petty_cash_accounts petty_cash_accounts_update_finance; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY petty_cash_accounts_update_finance ON public.petty_cash_accounts FOR UPDATE TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])))) WITH CHECK (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: petty_cash_transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.petty_cash_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: petty_cash_transactions petty_cash_transactions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY petty_cash_transactions_select ON public.petty_cash_transactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.petty_cash_accounts a
  WHERE ((a.id = petty_cash_transactions.account_id) AND ((a.user_id = auth.uid()) OR ((a.company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))))))));


--
-- Name: petty_cash_transactions petty_cash_txn_leader_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY petty_cash_txn_leader_select ON public.petty_cash_transactions FOR SELECT TO authenticated USING (((project_id IS NOT NULL) AND private.is_project_leader(project_id)));


--
-- Name: platform_admin_audit_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.platform_admin_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_expenses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.platform_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: product_archives; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.product_archives ENABLE ROW LEVEL SECURITY;

--
-- Name: product_archives product_archives_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY product_archives_select ON public.product_archives FOR SELECT TO authenticated USING ((company_id = private.auth_company_id()));


--
-- Name: product_barcodes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;

--
-- Name: product_barcodes product_barcodes_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY product_barcodes_delete ON public.product_barcodes FOR DELETE TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: product_barcodes product_barcodes_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY product_barcodes_read ON public.product_barcodes FOR SELECT TO authenticated USING ((company_id = private.auth_company_id()));


--
-- Name: product_barcodes product_barcodes_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY product_barcodes_update ON public.product_barcodes FOR UPDATE TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])))) WITH CHECK (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: product_barcodes product_barcodes_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY product_barcodes_write ON public.product_barcodes FOR INSERT TO authenticated WITH CHECK (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: product_combos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.product_combos ENABLE ROW LEVEL SECURITY;

--
-- Name: product_combos product_combos_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY product_combos_read ON public.product_combos FOR SELECT TO authenticated USING ((company_id = private.auth_company_id()));


--
-- Name: product_combos product_combos_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY product_combos_write ON public.product_combos TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])))) WITH CHECK (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: product_cost_prompts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.product_cost_prompts ENABLE ROW LEVEL SECURITY;

--
-- Name: product_costs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;

--
-- Name: product_costs product_costs_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY product_costs_select ON public.product_costs FOR SELECT TO authenticated USING ((company_id = private.auth_company_id()));


--
-- Name: product_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

--
-- Name: product_events product_events_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY product_events_select ON public.product_events FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: product_selling_prices; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.product_selling_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: product_selling_prices product_selling_prices_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY product_selling_prices_select ON public.product_selling_prices FOR SELECT TO authenticated USING ((company_id = private.auth_company_id()));


--
-- Name: product_unit_audit_log product_unit_audit_finance_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY product_unit_audit_finance_read ON public.product_unit_audit_log FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: product_unit_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.product_unit_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: product_units; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;

--
-- Name: product_units product_units_company_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY product_units_company_read ON public.product_units FOR SELECT TO authenticated USING ((company_id = private.auth_company_id()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_scoped; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_select_scoped ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR ((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))) OR private.leads_petty_user(id)));


--
-- Name: profiles profiles_update_owner_same_company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_update_owner_same_company ON public.profiles FOR UPDATE TO authenticated USING (((private.auth_role() = 'owner'::public.user_role) AND (company_id = private.auth_company_id()))) WITH CHECK (((private.auth_role() = 'owner'::public.user_role) AND (company_id = private.auth_company_id())));


--
-- Name: profiles profiles_update_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK (((id = auth.uid()) AND (company_id = private.auth_company_id())));


--
-- Name: project_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

--
-- Name: project_members project_members_delete_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY project_members_delete_owner ON public.project_members FOR DELETE TO authenticated USING (((private.auth_role() = 'owner'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_members.project_id) AND (p.company_id = private.auth_company_id()))))));


--
-- Name: project_members project_members_insert_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY project_members_insert_owner ON public.project_members FOR INSERT TO authenticated WITH CHECK (((private.auth_role() = 'owner'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_members.project_id) AND (p.company_id = private.auth_company_id()))))));


--
-- Name: project_members project_members_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY project_members_select ON public.project_members FOR SELECT TO authenticated USING (private.auth_can_see_project(project_id));


--
-- Name: project_members project_members_update_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY project_members_update_owner ON public.project_members FOR UPDATE TO authenticated USING (((private.auth_role() = 'owner'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_members.project_id) AND (p.company_id = private.auth_company_id())))))) WITH CHECK (((private.auth_role() = 'owner'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_members.project_id) AND (p.company_id = private.auth_company_id()))))));


--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY projects_delete_owner ON public.projects FOR DELETE TO authenticated USING (((private.auth_role() = 'owner'::public.user_role) AND (company_id = private.auth_company_id())));


--
-- Name: projects projects_insert_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY projects_insert_owner ON public.projects FOR INSERT TO authenticated WITH CHECK (((private.auth_role() = 'owner'::public.user_role) AND (company_id = private.auth_company_id())));


--
-- Name: projects projects_select_visible; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY projects_select_visible ON public.projects FOR SELECT TO authenticated USING ((company_id = private.auth_company_id()));


--
-- Name: projects projects_update_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY projects_update_owner ON public.projects FOR UPDATE TO authenticated USING (((private.auth_role() = 'owner'::public.user_role) AND (company_id = private.auth_company_id()))) WITH CHECK (((private.auth_role() = 'owner'::public.user_role) AND (company_id = private.auth_company_id())));


--
-- Name: receipt_aliases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.receipt_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: receipt_aliases receipt_aliases_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY receipt_aliases_delete_own ON public.receipt_aliases FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: receipt_aliases receipt_aliases_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY receipt_aliases_insert_own ON public.receipt_aliases FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND private.auth_can_see_project(( SELECT receipts.project_id
   FROM public.receipts
  WHERE (receipts.id = receipt_aliases.receipt_id)))));


--
-- Name: receipt_aliases receipt_aliases_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY receipt_aliases_select_own ON public.receipt_aliases FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND private.auth_can_see_project(( SELECT receipts.project_id
   FROM public.receipts
  WHERE (receipts.id = receipt_aliases.receipt_id)))));


--
-- Name: receipt_aliases receipt_aliases_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY receipt_aliases_update_own ON public.receipt_aliases FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: receipt_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.receipt_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: receipt_audit_log receipt_audit_log_finance_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY receipt_audit_log_finance_select ON public.receipt_audit_log FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: receipts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: receipts receipts_delete_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY receipts_delete_owner ON public.receipts FOR DELETE TO authenticated USING (((private.auth_role() = 'owner'::public.user_role) AND (company_id = private.auth_company_id())));


--
-- Name: receipts receipts_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY receipts_insert_own ON public.receipts FOR INSERT TO authenticated WITH CHECK (((uploaded_by = auth.uid()) AND
CASE
    WHEN (project_id IS NULL) THEN (company_id = private.auth_company_id())
    ELSE private.auth_can_see_project(project_id)
END));


--
-- Name: receipts receipts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY receipts_select ON public.receipts FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND ((uploaded_by = auth.uid()) OR (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])))));


--
-- Name: receipts receipts_update_finance; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY receipts_update_finance ON public.receipts FOR UPDATE TO authenticated USING (((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) AND (company_id = private.auth_company_id()))) WITH CHECK (((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) AND (company_id = private.auth_company_id())));


--
-- Name: receipts receipts_update_own_any; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY receipts_update_own_any ON public.receipts FOR UPDATE TO authenticated USING (((uploaded_by = auth.uid()) AND (company_id = private.auth_company_id()))) WITH CHECK (((uploaded_by = auth.uid()) AND (company_id = private.auth_company_id())));


--
-- Name: receipts receipts_update_own_processing; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY receipts_update_own_processing ON public.receipts FOR UPDATE TO authenticated USING (((uploaded_by = auth.uid()) AND (status = 'processing'::public.receipt_status))) WITH CHECK ((uploaded_by = auth.uid()));


--
-- Name: recurring_obligations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.recurring_obligations ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring_obligations recurring_obligations_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY recurring_obligations_select ON public.recurring_obligations FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: reimbursement_payout_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.reimbursement_payout_items ENABLE ROW LEVEL SECURITY;

--
-- Name: reimbursement_payout_items reimbursement_payout_items_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY reimbursement_payout_items_select ON public.reimbursement_payout_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.reimbursement_payouts p
  WHERE (p.id = reimbursement_payout_items.payout_id))));


--
-- Name: reimbursement_payouts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.reimbursement_payouts ENABLE ROW LEVEL SECURITY;

--
-- Name: reimbursement_payouts reimbursement_payouts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY reimbursement_payouts_select ON public.reimbursement_payouts FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND ((paid_to = auth.uid()) OR (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])))));


--
-- Name: scanned_documents scanned_docs_member_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY scanned_docs_member_insert ON public.scanned_documents FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND private.auth_can_see_project(project_id)));


--
-- Name: scanned_documents scanned_docs_member_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY scanned_docs_member_select ON public.scanned_documents FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND ((created_by = auth.uid()) OR (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) OR (EXISTS ( SELECT 1
   FROM public.receipts r
  WHERE (r.scanned_doc_id = scanned_documents.id))))));


--
-- Name: scanned_documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.scanned_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_order_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.shop_order_events ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_order_events shop_order_events_select_order; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY shop_order_events_select_order ON public.shop_order_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.shop_orders o
  WHERE ((o.id = shop_order_events.order_id) AND ((o.buyer_company_id = private.auth_company_id()) OR (o.supplier_company_id = private.auth_company_id()))))));


--
-- Name: shop_order_lines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.shop_order_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_order_lines shop_order_lines_select_order; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY shop_order_lines_select_order ON public.shop_order_lines FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.shop_orders o
  WHERE ((o.id = shop_order_lines.order_id) AND ((o.buyer_company_id = private.auth_company_id()) OR (o.supplier_company_id = private.auth_company_id()))))));


--
-- Name: shop_orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_orders shop_orders_select_party; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY shop_orders_select_party ON public.shop_orders FOR SELECT TO authenticated USING (((buyer_company_id = private.auth_company_id()) OR (supplier_company_id = private.auth_company_id())));


--
-- Name: staff_retirement_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.staff_retirement_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_retirement_audit_log staff_retirement_audit_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY staff_retirement_audit_select ON public.staff_retirement_audit_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_retirements sr
  WHERE ((sr.id = staff_retirement_audit_log.retirement_id) AND (sr.company_id = private.auth_company_id()) AND ((sr.staff_id = auth.uid()) OR (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])))))));


--
-- Name: staff_retirement_documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.staff_retirement_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_retirement_documents staff_retirement_documents_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY staff_retirement_documents_select ON public.staff_retirement_documents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_retirements sr
  WHERE ((sr.id = staff_retirement_documents.retirement_id) AND (sr.company_id = private.auth_company_id()) AND ((sr.staff_id = auth.uid()) OR (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])))))));


--
-- Name: staff_retirement_receipts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.staff_retirement_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_retirement_receipts staff_retirement_receipts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY staff_retirement_receipts_select ON public.staff_retirement_receipts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_retirements sr
  WHERE ((sr.id = staff_retirement_receipts.retirement_id) AND (sr.company_id = private.auth_company_id()) AND ((sr.staff_id = auth.uid()) OR (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])))))));


--
-- Name: staff_retirements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.staff_retirements ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_retirements staff_retirements_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY staff_retirements_select ON public.staff_retirements FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND ((staff_id = auth.uid()) OR (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])))));


--
-- Name: stock_counts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_counts stock_counts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY stock_counts_select ON public.stock_counts FOR SELECT TO authenticated USING ((company_id = private.auth_company_id()));


--
-- Name: subscription_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_invoices; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_invoices subscription_invoices_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY subscription_invoices_select ON public.subscription_invoices FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = 'owner'::public.user_role)));


--
-- Name: subscription_usage; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_usage subscription_usage_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY subscription_usage_select ON public.subscription_usage FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = 'owner'::public.user_role)));


--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions subscriptions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND (private.auth_role() = 'owner'::public.user_role)));


--
-- Name: supplier_claim_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.supplier_claim_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_claim_audit_log supplier_claim_audit_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY supplier_claim_audit_select ON public.supplier_claim_audit_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.supplier_claims c
  WHERE ((c.id = supplier_claim_audit_log.claim_id) AND (c.target_company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))))));


--
-- Name: supplier_claim_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.supplier_claim_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_claim_messages supplier_claim_messages_internal_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY supplier_claim_messages_internal_select ON public.supplier_claim_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.supplier_claims c
  WHERE ((c.id = supplier_claim_messages.claim_id) AND (c.target_company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))))));


--
-- Name: supplier_claim_receipts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.supplier_claim_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_claim_receipts supplier_claim_receipts_internal_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY supplier_claim_receipts_internal_select ON public.supplier_claim_receipts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.supplier_claims c
  WHERE ((c.id = supplier_claim_receipts.claim_id) AND (c.target_company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))))));


--
-- Name: supplier_claims; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.supplier_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_claims supplier_claims_internal_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY supplier_claims_internal_select ON public.supplier_claims FOR SELECT TO authenticated USING (((target_company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: supplier_connections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.supplier_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_connections supplier_connections_internal_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY supplier_connections_internal_select ON public.supplier_connections FOR SELECT TO authenticated USING (((target_company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: supplier_connections supplier_connections_internal_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY supplier_connections_internal_update ON public.supplier_connections FOR UPDATE TO authenticated USING (((target_company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])))) WITH CHECK (((target_company_id = private.auth_company_id()) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role]))));


--
-- Name: wa_login_tokens; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.wa_login_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: wa_web_auth_request_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.wa_web_auth_request_log ENABLE ROW LEVEL SECURITY;

--
-- Name: web_signup_drafts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.web_signup_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_ai_interpretations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_ai_interpretations ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_ai_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_ai_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_ai_threads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_ai_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_ai_usage_daily; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_ai_usage_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_conversations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_daily_nudges; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_daily_nudges ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_identities; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_identities ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_identities whatsapp_identities_self_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY whatsapp_identities_self_select ON public.whatsapp_identities FOR SELECT TO authenticated USING ((profile_id = auth.uid()));


--
-- Name: whatsapp_link_tokens; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_link_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_notification_consent_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_notification_consent_log ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_notification_consent_log whatsapp_notification_consent_self_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY whatsapp_notification_consent_self_read ON public.whatsapp_notification_consent_log FOR SELECT TO authenticated USING ((profile_id = auth.uid()));


--
-- Name: whatsapp_notification_deliveries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_notification_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_onboarding; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_onboarding ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_turn_locks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_turn_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_typing_attempts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_typing_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: whole_animal_breakdown_outputs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whole_animal_breakdown_outputs ENABLE ROW LEVEL SECURITY;

--
-- Name: whole_animal_breakdown_outputs whole_animal_breakdown_outputs_select_visible; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY whole_animal_breakdown_outputs_select_visible ON public.whole_animal_breakdown_outputs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.whole_animal_breakdowns b
     JOIN public.daily_records r ON ((r.id = b.daily_record_id)))
  WHERE ((b.daily_record_id = whole_animal_breakdown_outputs.breakdown_daily_record_id) AND (b.company_id = private.auth_company_id()) AND ((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) OR (r.recorded_by = auth.uid()))))));


--
-- Name: whole_animal_breakdowns; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whole_animal_breakdowns ENABLE ROW LEVEL SECURITY;

--
-- Name: whole_animal_breakdowns whole_animal_breakdowns_select_visible; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY whole_animal_breakdowns_select_visible ON public.whole_animal_breakdowns FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND (EXISTS ( SELECT 1
   FROM public.daily_records r
  WHERE ((r.id = whole_animal_breakdowns.daily_record_id) AND ((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) OR (r.recorded_by = auth.uid())))))));


--
-- Name: whole_animal_procurements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whole_animal_procurements ENABLE ROW LEVEL SECURITY;

--
-- Name: whole_animal_procurements whole_animal_procurements_select_visible; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY whole_animal_procurements_select_visible ON public.whole_animal_procurements FOR SELECT TO authenticated USING (((company_id = private.auth_company_id()) AND (EXISTS ( SELECT 1
   FROM public.daily_records r
  WHERE ((r.id = whole_animal_procurements.daily_record_id) AND (r.company_id = private.auth_company_id()) AND ((private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) OR (r.recorded_by = auth.uid())))))));


--
-- Name: objects invoices read finance; Type: POLICY; Schema: storage; Owner: postgres
--

CREATE POLICY "invoices read finance" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'invoices'::text) AND (private.auth_role() = ANY (ARRAY['owner'::public.user_role, 'accountant'::public.user_role])) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = public.storage_first_uuid_segment(p.name)) AND (p.company_id = private.auth_company_id()))))));


--
-- Name: objects logos delete owner; Type: POLICY; Schema: storage; Owner: postgres
--

CREATE POLICY "logos delete owner" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'company-logos'::text) AND (private.auth_role() = 'owner'::public.user_role) AND (split_part(name, '/'::text, 1) = (private.auth_company_id())::text)));


--
-- Name: objects logos read public; Type: POLICY; Schema: storage; Owner: postgres
--

CREATE POLICY "logos read public" ON storage.objects FOR SELECT USING ((bucket_id = 'company-logos'::text));


--
-- Name: objects logos update owner; Type: POLICY; Schema: storage; Owner: postgres
--

CREATE POLICY "logos update owner" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'company-logos'::text) AND (private.auth_role() = 'owner'::public.user_role) AND (split_part(name, '/'::text, 1) = (private.auth_company_id())::text))) WITH CHECK (((bucket_id = 'company-logos'::text) AND (private.auth_role() = 'owner'::public.user_role) AND (split_part(name, '/'::text, 1) = (private.auth_company_id())::text)));


--
-- Name: objects logos write owner; Type: POLICY; Schema: storage; Owner: postgres
--

CREATE POLICY "logos write owner" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'company-logos'::text) AND (private.auth_role() = 'owner'::public.user_role) AND (split_part(name, '/'::text, 1) = (private.auth_company_id())::text)));


--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: postgres
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: objects receipts delete by owner; Type: POLICY; Schema: storage; Owner: postgres
--

CREATE POLICY "receipts delete by owner" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'receipts'::text) AND (private.auth_role() = 'owner'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = public.storage_first_uuid_segment(p.name)) AND (p.company_id = private.auth_company_id()))))));


--
-- Name: objects receipts read via project access; Type: POLICY; Schema: storage; Owner: postgres
--

CREATE POLICY "receipts read via project access" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'receipts'::text) AND ((EXISTS ( SELECT 1
   FROM public.receipts r
  WHERE (r.image_url = objects.name))) OR (EXISTS ( SELECT 1
   FROM public.scanned_documents d
  WHERE (d.file_url = objects.name))))));


--
-- Name: objects receipts upload by member; Type: POLICY; Schema: storage; Owner: postgres
--

CREATE POLICY "receipts upload by member" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'receipts'::text) AND private.auth_can_see_project(public.storage_first_uuid_segment(name))));


--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: postgres
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION supabase_realtime OWNER TO postgres;

--
-- Name: supabase_realtime app_notifications; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.app_notifications;


--
-- Name: supabase_realtime petty_cash_accounts; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.petty_cash_accounts;


--
-- Name: supabase_realtime petty_cash_transactions; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.petty_cash_transactions;


--
-- Name: supabase_realtime receipts; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.receipts;


--
-- Name: SCHEMA private; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;


--
-- Name: SCHEMA storage; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;


--
-- Name: FUNCTION auth_can_see_project(pid uuid); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.auth_can_see_project(pid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.auth_can_see_project(pid uuid) TO authenticated;


--
-- Name: FUNCTION auth_company_id(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.auth_company_id() FROM PUBLIC;
GRANT ALL ON FUNCTION private.auth_company_id() TO authenticated;


--
-- Name: FUNCTION auth_role(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.auth_role() FROM PUBLIC;
GRANT ALL ON FUNCTION private.auth_role() TO authenticated;


--
-- Name: FUNCTION configure_product_units(p_company uuid, p_actor uuid, p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.configure_product_units(p_company uuid, p_actor uuid, p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION private.configure_product_units(p_company uuid, p_actor uuid, p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb) TO service_role;


--
-- Name: FUNCTION gen_scanner_token(p_name text); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.gen_scanner_token(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.gen_scanner_token(p_name text) TO service_role;


--
-- Name: FUNCTION is_meaningful_reason(p_reason text); Type: ACL; Schema: private; Owner: postgres
--

GRANT ALL ON FUNCTION private.is_meaningful_reason(p_reason text) TO authenticated;


--
-- Name: FUNCTION is_project_leader(pid uuid); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.is_project_leader(pid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.is_project_leader(pid uuid) TO authenticated;
GRANT ALL ON FUNCTION private.is_project_leader(pid uuid) TO service_role;


--
-- Name: FUNCTION leads_petty_user(target_uid uuid); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.leads_petty_user(target_uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.leads_petty_user(target_uid uuid) TO authenticated;
GRANT ALL ON FUNCTION private.leads_petty_user(target_uid uuid) TO service_role;


--
-- Name: FUNCTION marketplace_link_shop_order(p_request_id uuid); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.marketplace_link_shop_order(p_request_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION marketplace_next_order_no(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.marketplace_next_order_no() FROM PUBLIC;


--
-- Name: TABLE company_marketplace_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.company_marketplace_settings TO service_role;


--
-- Name: FUNCTION mask_message_text(p_text text); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.mask_message_text(p_text text) FROM PUBLIC;


--
-- Name: TABLE product_units; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.product_units TO authenticated;


--
-- Name: FUNCTION product_declared_unit(p_company uuid, p_product_key text, p_unit text); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.product_declared_unit(p_company uuid, p_product_key text, p_unit text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.product_declared_unit(p_company uuid, p_product_key text, p_unit text) TO service_role;


--
-- Name: FUNCTION product_exists_for_company(p_company uuid, p_key text); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.product_exists_for_company(p_company uuid, p_key text) FROM PUBLIC;


--
-- Name: FUNCTION product_key(p_name text); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.product_key(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.product_key(p_name text) TO authenticated;
GRANT ALL ON FUNCTION private.product_key(p_name text) TO service_role;


--
-- Name: FUNCTION product_rename_preview(p_company uuid, p_from text, p_to text); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.product_rename_preview(p_company uuid, p_from text, p_to text) FROM PUBLIC;


--
-- Name: FUNCTION product_unit(p_company uuid, p_key text); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.product_unit(p_company uuid, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.product_unit(p_company uuid, p_key text) TO authenticated;
GRANT ALL ON FUNCTION private.product_unit(p_company uuid, p_key text) TO service_role;


--
-- Name: FUNCTION receipt_has_live_expense(p_receipt uuid); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.receipt_has_live_expense(p_receipt uuid) FROM PUBLIC;


--
-- Name: FUNCTION rename_product_for_actor(p_company uuid, p_actor uuid, p_from text, p_to text, p_reason text); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.rename_product_for_actor(p_company uuid, p_actor uuid, p_from text, p_to text, p_reason text) FROM PUBLIC;


--
-- Name: FUNCTION resolve_company_product_read(p_name text); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.resolve_company_product_read(p_name text) FROM PUBLIC;


--
-- Name: FUNCTION wa_create_business_classified(p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text, p_category text, p_subcategory text, p_confidence numeric, p_keywords jsonb); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.wa_create_business_classified(p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text, p_category text, p_subcategory text, p_confidence numeric, p_keywords jsonb) FROM PUBLIC;


--
-- Name: FUNCTION accept_legal_terms(p_version text, p_accept boolean, p_language text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.accept_legal_terms(p_version text, p_accept boolean, p_language text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_legal_terms(p_version text, p_accept boolean, p_language text) TO authenticated;


--
-- Name: FUNCTION allocate_project_petty_cash(p_project uuid, p_user uuid, p_amount numeric, p_description text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.allocate_project_petty_cash(p_project uuid, p_user uuid, p_amount numeric, p_description text) TO authenticated;


--
-- Name: FUNCTION archive_product(p_key text, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.archive_product(p_key text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.archive_product(p_key text, p_reason text) TO authenticated;


--
-- Name: FUNCTION billing_grace_days(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.billing_grace_days() FROM PUBLIC;


--
-- Name: FUNCTION billing_queue_reminders(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.billing_queue_reminders() FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_queue_reminders() TO service_role;


--
-- Name: FUNCTION billing_raise_due_invoices(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.billing_raise_due_invoices() FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_raise_due_invoices() TO service_role;


--
-- Name: FUNCTION billing_refresh_usage(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.billing_refresh_usage() FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_refresh_usage() TO service_role;


--
-- Name: FUNCTION billing_usage_now(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.billing_usage_now() FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_usage_now() TO authenticated;


--
-- Name: FUNCTION billing_usage_window(p_period_start date, p_period_end date, p_on date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.billing_usage_window(p_period_start date, p_period_end date, p_on date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_usage_window(p_period_start date, p_period_end date, p_on date) TO authenticated;
GRANT ALL ON FUNCTION public.billing_usage_window(p_period_start date, p_period_end date, p_on date) TO service_role;


--
-- Name: FUNCTION billing_write_block(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.billing_write_block() FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_write_block() TO authenticated;


--
-- Name: FUNCTION bucha_reporting_snapshot(p_from timestamp with time zone, p_to timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.bucha_reporting_snapshot(p_from timestamp with time zone, p_to timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bucha_reporting_snapshot(p_from timestamp with time zone, p_to timestamp with time zone) TO authenticated;


--
-- Name: FUNCTION cancel_petty_cash_request(p_transaction uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.cancel_petty_cash_request(p_transaction uuid) TO authenticated;


--
-- Name: FUNCTION cancel_retirement(p_retirement uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.cancel_retirement(p_retirement uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_retirement(p_retirement uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION chat_days(p_company uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.chat_days(p_company uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.chat_days(p_company uuid) TO authenticated;


--
-- Name: FUNCTION chat_link_phone(p_token_hash text, p_phone text, p_wa_id text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.chat_link_phone(p_token_hash text, p_phone text, p_wa_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.chat_link_phone(p_token_hash text, p_phone text, p_wa_id text) TO service_role;


--
-- Name: FUNCTION chat_pending(p_company uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.chat_pending(p_company uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.chat_pending(p_company uuid) TO authenticated;


--
-- Name: FUNCTION chat_usage_now(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.chat_usage_now() FROM PUBLIC;
GRANT ALL ON FUNCTION public.chat_usage_now() TO authenticated;


--
-- Name: FUNCTION claim_marketplace_notifications(p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.claim_marketplace_notifications(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_marketplace_notifications(p_limit integer) TO service_role;


--
-- Name: FUNCTION claim_whatsapp_notification_deliveries(p_now timestamp with time zone, p_debt_stale_days integer, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.claim_whatsapp_notification_deliveries(p_now timestamp with time zone, p_debt_stale_days integer, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_whatsapp_notification_deliveries(p_now timestamp with time zone, p_debt_stale_days integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION companies_awaiting_close(p_now timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.companies_awaiting_close(p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.companies_awaiting_close(p_now timestamp with time zone) TO service_role;


--
-- Name: FUNCTION company_current_selling_prices(p_product_key text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.company_current_selling_prices(p_product_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.company_current_selling_prices(p_product_key text) TO authenticated;


--
-- Name: FUNCTION company_plan_caps(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.company_plan_caps() FROM PUBLIC;
GRANT ALL ON FUNCTION public.company_plan_caps() TO authenticated;


--
-- Name: FUNCTION company_product_catalog(p_from timestamp with time zone, p_to timestamp with time zone, p_include_archived boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.company_product_catalog(p_from timestamp with time zone, p_to timestamp with time zone, p_include_archived boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.company_product_catalog(p_from timestamp with time zone, p_to timestamp with time zone, p_include_archived boolean) TO authenticated;


--
-- Name: FUNCTION company_product_names(p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.company_product_names(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.company_product_names(p_company_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.company_product_names(p_company_id uuid) TO authenticated;


--
-- Name: FUNCTION company_stock_on_hand(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.company_stock_on_hand() FROM PUBLIC;
GRANT ALL ON FUNCTION public.company_stock_on_hand() TO authenticated;


--
-- Name: FUNCTION complete_whatsapp_notification_delivery(p_delivery_id uuid, p_status text, p_provider_message_id text, p_error text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.complete_whatsapp_notification_delivery(p_delivery_id uuid, p_status text, p_provider_message_id text, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_whatsapp_notification_delivery(p_delivery_id uuid, p_status text, p_provider_message_id text, p_error text) TO service_role;


--
-- Name: FUNCTION configure_product_units(p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.configure_product_units(p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.configure_product_units(p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb) TO authenticated;


--
-- Name: FUNCTION confirm_daily_record(p_daily_record_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.confirm_daily_record(p_daily_record_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_daily_record(p_daily_record_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.confirm_daily_record(p_daily_record_id uuid) TO service_role;


--
-- Name: FUNCTION confirm_retirement_received(p_retirement uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.confirm_retirement_received(p_retirement uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_retirement_received(p_retirement uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION confirm_supplier_claim_received(p_claim_id uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.confirm_supplier_claim_received(p_claim_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_supplier_claim_received(p_claim_id uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION consume_whatsapp_ai_budget(p_company_id uuid, p_identity_id uuid, p_input_chars integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.consume_whatsapp_ai_budget(p_company_id uuid, p_identity_id uuid, p_input_chars integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_whatsapp_ai_budget(p_company_id uuid, p_identity_id uuid, p_input_chars integer) TO service_role;


--
-- Name: FUNCTION create_company_invite_code(p_role public.user_role, p_days integer, p_max_uses integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.create_company_invite_code(p_role public.user_role, p_days integer, p_max_uses integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_company_invite_code(p_role public.user_role, p_days integer, p_max_uses integer) TO authenticated;


--
-- Name: FUNCTION create_daily_record_draft(p_kind text, p_amount numeric, p_party_name text, p_description text, p_occurred_at timestamp with time zone, p_project_id uuid, p_source text, p_source_message_id text, p_lines jsonb, p_payment_method text, p_loss_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.create_daily_record_draft(p_kind text, p_amount numeric, p_party_name text, p_description text, p_occurred_at timestamp with time zone, p_project_id uuid, p_source text, p_source_message_id text, p_lines jsonb, p_payment_method text, p_loss_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_daily_record_draft(p_kind text, p_amount numeric, p_party_name text, p_description text, p_occurred_at timestamp with time zone, p_project_id uuid, p_source text, p_source_message_id text, p_lines jsonb, p_payment_method text, p_loss_reason text) TO authenticated;


--
-- Name: FUNCTION create_reimbursement_payout(p_receipt_ids uuid[], p_method text, p_reference text, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.create_reimbursement_payout(p_receipt_ids uuid[], p_method text, p_reference text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_reimbursement_payout(p_receipt_ids uuid[], p_method text, p_reference text, p_note text) TO authenticated;


--
-- Name: FUNCTION create_retirement(p_project_id uuid, p_title text, p_notes text, p_receipt_ids uuid[], p_documents jsonb, p_retirement_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.create_retirement(p_project_id uuid, p_title text, p_notes text, p_receipt_ids uuid[], p_documents jsonb, p_retirement_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_retirement(p_project_id uuid, p_title text, p_notes text, p_receipt_ids uuid[], p_documents jsonb, p_retirement_id uuid) TO authenticated;


--
-- Name: FUNCTION create_whatsapp_link_token(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_whatsapp_link_token() TO authenticated;


--
-- Name: FUNCTION create_whole_animal_procurement_draft(p_animal_type text, p_animal_count integer, p_purchase_total numeric, p_supplier_name text, p_payment_method text, p_occurred_at timestamp with time zone, p_source text, p_source_message_id text, p_reference text, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.create_whole_animal_procurement_draft(p_animal_type text, p_animal_count integer, p_purchase_total numeric, p_supplier_name text, p_payment_method text, p_occurred_at timestamp with time zone, p_source text, p_source_message_id text, p_reference text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_whole_animal_procurement_draft(p_animal_type text, p_animal_count integer, p_purchase_total numeric, p_supplier_name text, p_payment_method text, p_occurred_at timestamp with time zone, p_source text, p_source_message_id text, p_reference text, p_note text) TO authenticated;


--
-- Name: FUNCTION daily_profit_estimate(p_from timestamp with time zone, p_to timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.daily_profit_estimate(p_from timestamp with time zone, p_to timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.daily_profit_estimate(p_from timestamp with time zone, p_to timestamp with time zone) TO authenticated;


--
-- Name: FUNCTION decide_receipt(p_receipt uuid, p_decision text, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.decide_receipt(p_receipt uuid, p_decision text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decide_receipt(p_receipt uuid, p_decision text, p_reason text) TO authenticated;


--
-- Name: FUNCTION decide_retirement(p_retirement uuid, p_decision text, p_reason text, p_change_receipt_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.decide_retirement(p_retirement uuid, p_decision text, p_reason text, p_change_receipt_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decide_retirement(p_retirement uuid, p_decision text, p_reason text, p_change_receipt_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION decide_supplier_claim(p_claim_id uuid, p_action text, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.decide_supplier_claim(p_claim_id uuid, p_action text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decide_supplier_claim(p_claim_id uuid, p_action text, p_reason text) TO authenticated;


--
-- Name: FUNCTION delete_account_data(p_profile_id uuid, p_owned_company_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_account_data(p_profile_id uuid, p_owned_company_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_account_data(p_profile_id uuid, p_owned_company_ids uuid[]) TO service_role;


--
-- Name: FUNCTION delete_company_data(p_company_id uuid, p_allow_orphan_profiles boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_company_data(p_company_id uuid, p_allow_orphan_profiles boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_company_data(p_company_id uuid, p_allow_orphan_profiles boolean) TO service_role;


--
-- Name: FUNCTION ensure_chat_identity(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.ensure_chat_identity() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_chat_identity() TO authenticated;


--
-- Name: FUNCTION find_product_barcode(p_barcode text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.find_product_barcode(p_barcode text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.find_product_barcode(p_barcode text) TO authenticated;


--
-- Name: FUNCTION find_profile_by_name_in_company_v1(p_company_id uuid, p_full_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.find_profile_by_name_in_company_v1(p_company_id uuid, p_full_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.find_profile_by_name_in_company_v1(p_company_id uuid, p_full_name text) TO service_role;


--
-- Name: FUNCTION get_invite_info(p_token text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_invite_info(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_invite_info(p_token text) TO anon;
GRANT ALL ON FUNCTION public.get_invite_info(p_token text) TO authenticated;


--
-- Name: FUNCTION invoices_this_month_count(p_project uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.invoices_this_month_count(p_project uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.invoices_this_month_count(p_project uuid) TO authenticated;


--
-- Name: FUNCTION join_by_invite_v1(p_user_id uuid, p_token text, p_full_name text, p_phone text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.join_by_invite_v1(p_user_id uuid, p_token text, p_full_name text, p_phone text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_by_invite_v1(p_user_id uuid, p_token text, p_full_name text, p_phone text) TO service_role;


--
-- Name: FUNCTION join_company_by_password_v1(p_user_id uuid, p_company_id uuid, p_password text, p_full_name text, p_phone text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.join_company_by_password_v1(p_user_id uuid, p_company_id uuid, p_password text, p_full_name text, p_phone text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_company_by_password_v1(p_user_id uuid, p_company_id uuid, p_password text, p_full_name text, p_phone text) TO service_role;


--
-- Name: FUNCTION mark_receipts_reimbursed(p_receipt_ids uuid[], p_paid boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.mark_receipts_reimbursed(p_receipt_ids uuid[], p_paid boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_receipts_reimbursed(p_receipt_ids uuid[], p_paid boolean) TO authenticated;


--
-- Name: FUNCTION mark_retirement_paid(p_retirement uuid, p_method text, p_reference text, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.mark_retirement_paid(p_retirement uuid, p_method text, p_reference text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_retirement_paid(p_retirement uuid, p_method text, p_reference text, p_reason text) TO authenticated;


--
-- Name: FUNCTION mark_supplier_claim_paid(p_claim_id uuid, p_amount numeric, p_method text, p_reference text, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.mark_supplier_claim_paid(p_claim_id uuid, p_amount numeric, p_method text, p_reference text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_supplier_claim_paid(p_claim_id uuid, p_amount numeric, p_method text, p_reference text, p_note text) TO authenticated;


--
-- Name: FUNCTION marketplace_confirm_by_reply(p_supplier_company_id uuid, p_accept boolean, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.marketplace_confirm_by_reply(p_supplier_company_id uuid, p_accept boolean, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketplace_confirm_by_reply(p_supplier_company_id uuid, p_accept boolean, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.marketplace_confirm_by_reply(p_supplier_company_id uuid, p_accept boolean, p_reason text) TO service_role;


--
-- Name: FUNCTION marketplace_create_selection(p_buyer_company_id uuid, p_query text, p_buyer_profile_id uuid, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.marketplace_create_selection(p_buyer_company_id uuid, p_query text, p_buyer_profile_id uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketplace_create_selection(p_buyer_company_id uuid, p_query text, p_buyer_profile_id uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.marketplace_create_selection(p_buyer_company_id uuid, p_query text, p_buyer_profile_id uuid, p_limit integer) TO service_role;


--
-- Name: FUNCTION marketplace_incoming_orders(p_supplier_company_id uuid, p_status text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.marketplace_incoming_orders(p_supplier_company_id uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketplace_incoming_orders(p_supplier_company_id uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.marketplace_incoming_orders(p_supplier_company_id uuid, p_status text) TO service_role;


--
-- Name: FUNCTION marketplace_last_selection(p_buyer_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.marketplace_last_selection(p_buyer_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketplace_last_selection(p_buyer_company_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.marketplace_last_selection(p_buyer_company_id uuid) TO service_role;


--
-- Name: FUNCTION marketplace_my_orders(p_buyer_company_id uuid, p_status text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.marketplace_my_orders(p_buyer_company_id uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketplace_my_orders(p_buyer_company_id uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.marketplace_my_orders(p_buyer_company_id uuid, p_status text) TO service_role;


--
-- Name: FUNCTION marketplace_order_contacts(p_order_id uuid, p_for_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.marketplace_order_contacts(p_order_id uuid, p_for_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketplace_order_contacts(p_order_id uuid, p_for_company_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.marketplace_order_contacts(p_order_id uuid, p_for_company_id uuid) TO service_role;


--
-- Name: FUNCTION marketplace_pending_confirmation(p_supplier_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.marketplace_pending_confirmation(p_supplier_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketplace_pending_confirmation(p_supplier_company_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.marketplace_pending_confirmation(p_supplier_company_id uuid) TO service_role;


--
-- Name: FUNCTION marketplace_place_order(p_selection_id uuid, p_option_index integer, p_quantity numeric, p_buyer_profile_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.marketplace_place_order(p_selection_id uuid, p_option_index integer, p_quantity numeric, p_buyer_profile_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketplace_place_order(p_selection_id uuid, p_option_index integer, p_quantity numeric, p_buyer_profile_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.marketplace_place_order(p_selection_id uuid, p_option_index integer, p_quantity numeric, p_buyer_profile_id uuid) TO service_role;


--
-- Name: FUNCTION marketplace_reindex_all(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.marketplace_reindex_all() FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketplace_reindex_all() TO service_role;


--
-- Name: FUNCTION marketplace_reindex_company(p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.marketplace_reindex_company(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketplace_reindex_company(p_company_id uuid) TO service_role;


--
-- Name: FUNCTION marketplace_search_stock(p_buyer_company_id uuid, p_query text, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.marketplace_search_stock(p_buyer_company_id uuid, p_query text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketplace_search_stock(p_buyer_company_id uuid, p_query text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.marketplace_search_stock(p_buyer_company_id uuid, p_query text, p_limit integer) TO service_role;


--
-- Name: FUNCTION marketplace_update_order_status(p_order_id uuid, p_status text, p_reason text, p_actor_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.marketplace_update_order_status(p_order_id uuid, p_status text, p_reason text, p_actor_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketplace_update_order_status(p_order_id uuid, p_status text, p_reason text, p_actor_company_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.marketplace_update_order_status(p_order_id uuid, p_status text, p_reason text, p_actor_company_id uuid) TO service_role;


--
-- Name: FUNCTION merge_products(p_from_key text, p_into_key text, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.merge_products(p_from_key text, p_into_key text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.merge_products(p_from_key text, p_into_key text, p_reason text) TO authenticated;


--
-- Name: FUNCTION my_legal_acceptance(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.my_legal_acceptance() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_legal_acceptance() TO authenticated;


--
-- Name: FUNCTION my_memberships(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.my_memberships() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_memberships() TO authenticated;


--
-- Name: FUNCTION my_shop_order_action(p_order_id uuid, p_action text, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.my_shop_order_action(p_order_id uuid, p_action text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_shop_order_action(p_order_id uuid, p_action text, p_note text) TO authenticated;


--
-- Name: FUNCTION my_shop_orders(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.my_shop_orders() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_shop_orders() TO authenticated;


--
-- Name: FUNCTION my_supplier_status(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.my_supplier_status() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_supplier_status() TO authenticated;


--
-- Name: FUNCTION my_whatsapp_notification_preferences(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.my_whatsapp_notification_preferences() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_whatsapp_notification_preferences() TO authenticated;


--
-- Name: TABLE ops_alert_deliveries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ops_alert_deliveries TO service_role;


--
-- Name: FUNCTION ops_claim_alerts(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.ops_claim_alerts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ops_claim_alerts() TO service_role;


--
-- Name: FUNCTION ops_record_check(p_findings jsonb, p_complete boolean, p_email_configured boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.ops_record_check(p_findings jsonb, p_complete boolean, p_email_configured boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ops_record_check(p_findings jsonb, p_complete boolean, p_email_configured boolean) TO service_role;


--
-- Name: FUNCTION petty_cash_apply_transaction(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.petty_cash_apply_transaction() FROM PUBLIC;


--
-- Name: FUNCTION petty_cash_auto_book_receipt(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.petty_cash_auto_book_receipt() FROM PUBLIC;


--
-- Name: FUNCTION petty_cash_guard_balance(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.petty_cash_guard_balance() FROM PUBLIC;


--
-- Name: FUNCTION petty_cash_protect_money(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.petty_cash_protect_money() FROM PUBLIC;


--
-- Name: FUNCTION platform_admin_ack_incident(p_id uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_ack_incident(p_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_ack_incident(p_id uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION platform_admin_add_evidence(p_kind text, p_result text, p_summary text, p_url text, p_tested_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_add_evidence(p_kind text, p_result text, p_summary text, p_url text, p_tested_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_add_evidence(p_kind text, p_result text, p_summary text, p_url text, p_tested_at timestamp with time zone) TO authenticated;


--
-- Name: FUNCTION platform_admin_ai_ops(p_days integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_ai_ops(p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_ai_ops(p_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_ai_ops(p_days integer) TO service_role;


--
-- Name: FUNCTION platform_admin_audit_history(p_offset integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_audit_history(p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_audit_history(p_offset integer) TO authenticated;


--
-- Name: FUNCTION platform_admin_billing(p_days integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_billing(p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_billing(p_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_billing(p_days integer) TO service_role;


--
-- Name: FUNCTION platform_admin_company_detail(p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_company_detail(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_company_detail(p_company_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_company_detail(p_company_id uuid) TO service_role;


--
-- Name: FUNCTION platform_admin_company_finance(p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_company_finance(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_company_finance(p_company_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_company_finance(p_company_id uuid) TO service_role;


--
-- Name: FUNCTION platform_admin_company_health(p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_company_health(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_company_health(p_company_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_company_health(p_company_id uuid) TO service_role;


--
-- Name: FUNCTION platform_admin_company_subscription(p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_company_subscription(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_company_subscription(p_company_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_company_subscription(p_company_id uuid) TO service_role;


--
-- Name: FUNCTION platform_admin_deactivate_whatsapp_identity(p_identity_id uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_deactivate_whatsapp_identity(p_identity_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_deactivate_whatsapp_identity(p_identity_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_deactivate_whatsapp_identity(p_identity_id uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION platform_admin_ensure_subscription(p_company_id uuid, p_plan text, p_trial_days integer, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_ensure_subscription(p_company_id uuid, p_plan text, p_trial_days integer, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_ensure_subscription(p_company_id uuid, p_plan text, p_trial_days integer, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_ensure_subscription(p_company_id uuid, p_plan text, p_trial_days integer, p_reason text) TO service_role;


--
-- Name: FUNCTION platform_admin_expense_overview(p_from date, p_to date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_expense_overview(p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_expense_overview(p_from date, p_to date) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_expense_overview(p_from date, p_to date) TO service_role;


--
-- Name: FUNCTION platform_admin_governance(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_governance() FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_governance() TO authenticated;


--
-- Name: FUNCTION platform_admin_list_companies(p_search text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_list_companies(p_search text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_list_companies(p_search text) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_list_companies(p_search text) TO service_role;


--
-- Name: FUNCTION platform_admin_list_expenses(p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_list_expenses(p_limit integer, p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_list_expenses(p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_list_expenses(p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION platform_admin_mark_invoice_paid(p_invoice_id uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_mark_invoice_paid(p_invoice_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_mark_invoice_paid(p_invoice_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_mark_invoice_paid(p_invoice_id uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION platform_admin_marketplace(p_days integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_marketplace(p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_marketplace(p_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_marketplace(p_days integer) TO service_role;


--
-- Name: FUNCTION platform_admin_me(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_me() FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_me() TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_me() TO service_role;


--
-- Name: FUNCTION platform_admin_overview(p_days integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_overview(p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_overview(p_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_overview(p_days integer) TO service_role;


--
-- Name: FUNCTION platform_admin_performance(p_days integer, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_performance(p_days integer, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_performance(p_days integer, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_performance(p_days integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION platform_admin_privacy_request(p_id uuid, p_profile uuid, p_kind text, p_status text, p_note text, p_due date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_privacy_request(p_id uuid, p_profile uuid, p_kind text, p_status text, p_note text, p_due date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_privacy_request(p_id uuid, p_profile uuid, p_kind text, p_status text, p_note text, p_due date) TO authenticated;


--
-- Name: FUNCTION platform_admin_record_expense(p_company_id uuid, p_category text, p_description text, p_amount_tzs integer, p_occurred_on date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_record_expense(p_company_id uuid, p_category text, p_description text, p_amount_tzs integer, p_occurred_on date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_record_expense(p_company_id uuid, p_category text, p_description text, p_amount_tzs integer, p_occurred_on date) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_record_expense(p_company_id uuid, p_category text, p_description text, p_amount_tzs integer, p_occurred_on date) TO service_role;


--
-- Name: FUNCTION platform_admin_reliability(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_reliability() FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_reliability() TO authenticated;


--
-- Name: FUNCTION platform_admin_reset_company_ai_limits(p_company_id uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_reset_company_ai_limits(p_company_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_reset_company_ai_limits(p_company_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_reset_company_ai_limits(p_company_id uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION platform_admin_scanner_ops(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_scanner_ops() FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_scanner_ops() TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_scanner_ops() TO service_role;


--
-- Name: FUNCTION platform_admin_set_company_ai_limits(p_company_id uuid, p_daily_request_limit integer, p_daily_char_limit integer, p_daily_cost_limit numeric, p_monthly_request_limit integer, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_set_company_ai_limits(p_company_id uuid, p_daily_request_limit integer, p_daily_char_limit integer, p_daily_cost_limit numeric, p_monthly_request_limit integer, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_set_company_ai_limits(p_company_id uuid, p_daily_request_limit integer, p_daily_char_limit integer, p_daily_cost_limit numeric, p_monthly_request_limit integer, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_set_company_ai_limits(p_company_id uuid, p_daily_request_limit integer, p_daily_char_limit integer, p_daily_cost_limit numeric, p_monthly_request_limit integer, p_reason text) TO service_role;


--
-- Name: FUNCTION platform_admin_set_company_status(p_company_id uuid, p_status text, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_set_company_status(p_company_id uuid, p_status text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_set_company_status(p_company_id uuid, p_status text, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_set_company_status(p_company_id uuid, p_status text, p_reason text) TO service_role;


--
-- Name: FUNCTION platform_admin_set_marketplace_optin(p_company_id uuid, p_opt_in boolean, p_share_prices boolean, p_max_stock_age_days integer, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_set_marketplace_optin(p_company_id uuid, p_opt_in boolean, p_share_prices boolean, p_max_stock_age_days integer, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_set_marketplace_optin(p_company_id uuid, p_opt_in boolean, p_share_prices boolean, p_max_stock_age_days integer, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_set_marketplace_optin(p_company_id uuid, p_opt_in boolean, p_share_prices boolean, p_max_stock_age_days integer, p_reason text) TO service_role;


--
-- Name: FUNCTION platform_admin_set_subscription_grace(p_company_id uuid, p_grace_days integer, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_set_subscription_grace(p_company_id uuid, p_grace_days integer, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_set_subscription_grace(p_company_id uuid, p_grace_days integer, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_set_subscription_grace(p_company_id uuid, p_grace_days integer, p_reason text) TO service_role;


--
-- Name: FUNCTION platform_admin_set_subscription_plan(p_company_id uuid, p_plan text, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_set_subscription_plan(p_company_id uuid, p_plan text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_set_subscription_plan(p_company_id uuid, p_plan text, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_set_subscription_plan(p_company_id uuid, p_plan text, p_reason text) TO service_role;


--
-- Name: FUNCTION platform_admin_set_subscription_status(p_company_id uuid, p_status text, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_set_subscription_status(p_company_id uuid, p_status text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_set_subscription_status(p_company_id uuid, p_status text, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_set_subscription_status(p_company_id uuid, p_status text, p_reason text) TO service_role;


--
-- Name: FUNCTION platform_admin_set_trial(p_company_id uuid, p_days integer, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_set_trial(p_company_id uuid, p_days integer, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_set_trial(p_company_id uuid, p_days integer, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_set_trial(p_company_id uuid, p_days integer, p_reason text) TO service_role;


--
-- Name: FUNCTION platform_admin_set_whatsapp_ai(p_company_id uuid, p_enabled boolean, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_set_whatsapp_ai(p_company_id uuid, p_enabled boolean, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_set_whatsapp_ai(p_company_id uuid, p_enabled boolean, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_set_whatsapp_ai(p_company_id uuid, p_enabled boolean, p_reason text) TO service_role;


--
-- Name: FUNCTION platform_admin_settings(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_settings() FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_settings() TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_settings() TO service_role;


--
-- Name: FUNCTION platform_admin_shop_orders(p_days integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_shop_orders(p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_shop_orders(p_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_shop_orders(p_days integer) TO service_role;


--
-- Name: FUNCTION platform_admin_subscriptions(p_search text, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_subscriptions(p_search text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_subscriptions(p_search text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_subscriptions(p_search text, p_limit integer) TO service_role;


--
-- Name: FUNCTION platform_admin_whatsapp_identities(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_whatsapp_identities() FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_whatsapp_identities() TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_whatsapp_identities() TO service_role;


--
-- Name: FUNCTION platform_admin_whatsapp_ops(p_days integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_admin_whatsapp_ops(p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_admin_whatsapp_ops(p_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.platform_admin_whatsapp_ops(p_days integer) TO service_role;


--
-- Name: FUNCTION preview_product_rename(p_from text, p_to text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.preview_product_rename(p_from text, p_to text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.preview_product_rename(p_from text, p_to text) TO authenticated;


--
-- Name: FUNCTION price_band(p_company uuid, p_key text, p_unit_price numeric, p_quantity numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.price_band(p_company uuid, p_key text, p_unit_price numeric, p_quantity numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.price_band(p_company uuid, p_key text, p_unit_price numeric, p_quantity numeric) TO authenticated;
GRANT ALL ON FUNCTION public.price_band(p_company uuid, p_key text, p_unit_price numeric, p_quantity numeric) TO service_role;


--
-- Name: FUNCTION public_supplier_claim_status(p_claim_token text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.public_supplier_claim_status(p_claim_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.public_supplier_claim_status(p_claim_token text) TO anon;
GRANT ALL ON FUNCTION public.public_supplier_claim_status(p_claim_token text) TO authenticated;


--
-- Name: FUNCTION public_supplier_knock(p_target_company_id uuid, p_supplier_name text, p_contact_name text, p_contact_email text, p_contact_phone text, p_supplier_tin text, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.public_supplier_knock(p_target_company_id uuid, p_supplier_name text, p_contact_name text, p_contact_email text, p_contact_phone text, p_supplier_tin text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.public_supplier_knock(p_target_company_id uuid, p_supplier_name text, p_contact_name text, p_contact_email text, p_contact_phone text, p_supplier_tin text, p_note text) TO anon;
GRANT ALL ON FUNCTION public.public_supplier_knock(p_target_company_id uuid, p_supplier_name text, p_contact_name text, p_contact_email text, p_contact_phone text, p_supplier_tin text, p_note text) TO authenticated;


--
-- Name: FUNCTION public_supplier_submit_claim(p_connection_token text, p_title text, p_claim_note text, p_amount numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.public_supplier_submit_claim(p_connection_token text, p_title text, p_claim_note text, p_amount numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.public_supplier_submit_claim(p_connection_token text, p_title text, p_claim_note text, p_amount numeric) TO anon;
GRANT ALL ON FUNCTION public.public_supplier_submit_claim(p_connection_token text, p_title text, p_claim_note text, p_amount numeric) TO authenticated;


--
-- Name: FUNCTION receipts_block_delete_when_booked(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.receipts_block_delete_when_booked() FROM PUBLIC;


--
-- Name: FUNCTION receipts_block_delete_when_paid(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.receipts_block_delete_when_paid() FROM PUBLIC;


--
-- Name: FUNCTION receipts_guard_live_staff_retirement(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.receipts_guard_live_staff_retirement() FROM PUBLIC;


--
-- Name: FUNCTION receipts_guard_settlement(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.receipts_guard_settlement() FROM PUBLIC;


--
-- Name: FUNCTION receipts_guard_transitions(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.receipts_guard_transitions() FROM PUBLIC;


--
-- Name: FUNCTION receipts_protect_booked(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.receipts_protect_booked() FROM PUBLIC;


--
-- Name: FUNCTION receipts_write_audit(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.receipts_write_audit() FROM PUBLIC;


--
-- Name: FUNCTION record_stock_count(p_name text, p_quantity numeric, p_unit text, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.record_stock_count(p_name text, p_quantity numeric, p_unit text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_stock_count(p_name text, p_quantity numeric, p_unit text, p_note text) TO authenticated;


--
-- Name: FUNCTION rename_product(p_from text, p_to text, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rename_product(p_from text, p_to text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rename_product(p_from text, p_to text, p_reason text) TO authenticated;


--
-- Name: FUNCTION request_petty_cash_top_up(p_user uuid, p_amount numeric, p_description text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.request_petty_cash_top_up(p_user uuid, p_amount numeric, p_description text) TO authenticated;


--
-- Name: FUNCTION request_receipt_reversal(p_receipt uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.request_receipt_reversal(p_receipt uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_receipt_reversal(p_receipt uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION respond_to_petty_cash_request(p_transaction uuid, p_accept boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.respond_to_petty_cash_request(p_transaction uuid, p_accept boolean) TO authenticated;


--
-- Name: FUNCTION reverse_petty_cash_receipt(p_receipt uuid, p_transaction uuid, p_mode text, p_reason text, p_new_amount numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reverse_petty_cash_receipt(p_receipt uuid, p_transaction uuid, p_mode text, p_reason text, p_new_amount numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reverse_petty_cash_receipt(p_receipt uuid, p_transaction uuid, p_mode text, p_reason text, p_new_amount numeric) TO authenticated;


--
-- Name: FUNCTION revoke_whatsapp_identity(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.revoke_whatsapp_identity() TO authenticated;


--
-- Name: FUNCTION search_companies(q text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.search_companies(q text) FROM PUBLIC;


--
-- Name: FUNCTION set_company_password(p_password text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_company_password(p_password text) FROM PUBLIC;


--
-- Name: FUNCTION set_company_password_v1(p_password text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_company_password_v1(p_password text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_company_password_v1(p_password text) TO authenticated;


--
-- Name: FUNCTION set_company_supplier(p_active boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_company_supplier(p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_company_supplier(p_active boolean) TO authenticated;


--
-- Name: FUNCTION set_product_barcode(p_barcode text, p_product_key text, p_product_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_product_barcode(p_barcode text, p_product_key text, p_product_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_product_barcode(p_barcode text, p_product_key text, p_product_name text) TO authenticated;


--
-- Name: FUNCTION set_product_cost(p_name text, p_unit_cost numeric, p_unit text, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_product_cost(p_name text, p_unit_cost numeric, p_unit text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_product_cost(p_name text, p_unit_cost numeric, p_unit text, p_note text) TO authenticated;


--
-- Name: FUNCTION set_selling_price(p_name text, p_retail numeric, p_wholesale numeric, p_min_qty numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_selling_price(p_name text, p_retail numeric, p_wholesale numeric, p_min_qty numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_selling_price(p_name text, p_retail numeric, p_wholesale numeric, p_min_qty numeric) TO authenticated;


--
-- Name: FUNCTION set_whatsapp_notification_preferences(p_daily_summary boolean, p_debt_reminders boolean, p_closing_time time without time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_whatsapp_notification_preferences(p_daily_summary boolean, p_debt_reminders boolean, p_closing_time time without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_whatsapp_notification_preferences(p_daily_summary boolean, p_debt_reminders boolean, p_closing_time time without time zone) TO authenticated;


--
-- Name: FUNCTION signup_company_v1(p_user_id uuid, p_full_name text, p_phone text, p_company_name text, p_hq_location text, p_sector text, p_company_password text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.signup_company_v1(p_user_id uuid, p_full_name text, p_phone text, p_company_name text, p_hq_location text, p_sector text, p_company_password text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.signup_company_v1(p_user_id uuid, p_full_name text, p_phone text, p_company_name text, p_hq_location text, p_sector text, p_company_password text) TO service_role;


--
-- Name: FUNCTION submit_receipt(p_receipt uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.submit_receipt(p_receipt uuid) TO authenticated;


--
-- Name: FUNCTION submit_retirement(p_retirement uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.submit_retirement(p_retirement uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_retirement(p_retirement uuid) TO authenticated;


--
-- Name: FUNCTION switch_active_company(p_company uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.switch_active_company(p_company uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.switch_active_company(p_company uuid) TO authenticated;


--
-- Name: FUNCTION unarchive_product(p_key text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.unarchive_product(p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unarchive_product(p_key text) TO authenticated;


--
-- Name: FUNCTION verify_company_password(p_company_id uuid, p_password text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.verify_company_password(p_company_id uuid, p_password text) FROM PUBLIC;


--
-- Name: FUNCTION void_daily_record(p_daily_record_id uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.void_daily_record(p_daily_record_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.void_daily_record(p_daily_record_id uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION void_reimbursement_payout(p_payout uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.void_reimbursement_payout(p_payout uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.void_reimbursement_payout(p_payout uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION wa_add_product_unit(p_phone text, p_name text, p_unit text, p_base_quantity numeric, p_retail numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_add_product_unit(p_phone text, p_name text, p_unit text, p_base_quantity numeric, p_retail numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_add_product_unit(p_phone text, p_name text, p_unit text, p_base_quantity numeric, p_retail numeric) TO service_role;


--
-- Name: FUNCTION wa_allow_web_auth_request(p_phone_hash text, p_ip_hash text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_allow_web_auth_request(p_phone_hash text, p_ip_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_allow_web_auth_request(p_phone_hash text, p_ip_hash text) TO service_role;


--
-- Name: FUNCTION wa_bucha_reporting_snapshot(p_profile_id uuid, p_company_id uuid, p_from timestamp with time zone, p_to timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_bucha_reporting_snapshot(p_profile_id uuid, p_company_id uuid, p_from timestamp with time zone, p_to timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_bucha_reporting_snapshot(p_profile_id uuid, p_company_id uuid, p_from timestamp with time zone, p_to timestamp with time zone) TO service_role;


--
-- Name: FUNCTION wa_cancel_daily_record_batch(p_profile_id uuid, p_company_id uuid, p_daily_record_ids uuid[], p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_cancel_daily_record_batch(p_profile_id uuid, p_company_id uuid, p_daily_record_ids uuid[], p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_cancel_daily_record_batch(p_profile_id uuid, p_company_id uuid, p_daily_record_ids uuid[], p_reason text) TO service_role;


--
-- Name: FUNCTION wa_cancel_daily_record_draft(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_cancel_daily_record_draft(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_cancel_daily_record_draft(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION wa_claim_daily_nudge(p_identity_id uuid, p_business_date date, p_kind text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_claim_daily_nudge(p_identity_id uuid, p_business_date date, p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_claim_daily_nudge(p_identity_id uuid, p_business_date date, p_kind text) TO service_role;


--
-- Name: FUNCTION wa_clear_ai_context(p_identity_id uuid, p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_clear_ai_context(p_identity_id uuid, p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_clear_ai_context(p_identity_id uuid, p_company_id uuid) TO service_role;


--
-- Name: FUNCTION wa_close_business_day(p_company_id uuid, p_profile_id uuid, p_business_date date, p_sales numeric, p_cogs numeric, p_profit numeric, p_purchases numeric, p_new_debt numeric, p_debt_paid numeric, p_record_count integer, p_worker_count integer, p_worker_label text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_close_business_day(p_company_id uuid, p_profile_id uuid, p_business_date date, p_sales numeric, p_cogs numeric, p_profit numeric, p_purchases numeric, p_new_debt numeric, p_debt_paid numeric, p_record_count integer, p_worker_count integer, p_worker_label text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_close_business_day(p_company_id uuid, p_profile_id uuid, p_business_date date, p_sales numeric, p_cogs numeric, p_profit numeric, p_purchases numeric, p_new_debt numeric, p_debt_paid numeric, p_record_count integer, p_worker_count integer, p_worker_label text) TO service_role;


--
-- Name: FUNCTION wa_company_combos(p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_company_combos(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_company_combos(p_company_id uuid) TO service_role;


--
-- Name: FUNCTION wa_company_product_sale_units(p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_company_product_sale_units(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_company_product_sale_units(p_company_id uuid) TO service_role;


--
-- Name: FUNCTION wa_company_vocabulary(p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_company_vocabulary(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_company_vocabulary(p_company_id uuid) TO service_role;


--
-- Name: FUNCTION wa_configure_product_units(p_phone text, p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_configure_product_units(p_phone text, p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_configure_product_units(p_phone text, p_name text, p_base_unit text, p_purchase_unit text, p_purchase_size numeric, p_purchase_cost numeric, p_sale_units jsonb) TO service_role;


--
-- Name: FUNCTION wa_confirm_daily_record(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_confirm_daily_record(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_confirm_daily_record(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid) TO service_role;


--
-- Name: FUNCTION wa_confirm_daily_record_batch(p_profile_id uuid, p_company_id uuid, p_daily_record_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_confirm_daily_record_batch(p_profile_id uuid, p_company_id uuid, p_daily_record_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_confirm_daily_record_batch(p_profile_id uuid, p_company_id uuid, p_daily_record_ids uuid[]) TO service_role;


--
-- Name: FUNCTION wa_consume_login_token(p_token text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_consume_login_token(p_token text) FROM PUBLIC;


--
-- Name: FUNCTION wa_correct_draft_sale_bands(p_identity_id uuid, p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_expected_record jsonb, p_answers jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_correct_draft_sale_bands(p_identity_id uuid, p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_expected_record jsonb, p_answers jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_correct_draft_sale_bands(p_identity_id uuid, p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_expected_record jsonb, p_answers jsonb) TO service_role;


--
-- Name: FUNCTION wa_create_business(p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_create_business(p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text) FROM PUBLIC;


--
-- Name: FUNCTION wa_create_business(p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text, p_category text, p_subcategory text, p_confidence numeric, p_keywords jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_create_business(p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text, p_category text, p_subcategory text, p_confidence numeric, p_keywords jsonb) FROM PUBLIC;


--
-- Name: FUNCTION wa_create_daily_record_batch_drafts(p_profile_id uuid, p_company_id uuid, p_source_message_id text, p_records jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_create_daily_record_batch_drafts(p_profile_id uuid, p_company_id uuid, p_source_message_id text, p_records jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_create_daily_record_batch_drafts(p_profile_id uuid, p_company_id uuid, p_source_message_id text, p_records jsonb) TO service_role;


--
-- Name: FUNCTION wa_create_daily_record_draft(p_profile_id uuid, p_company_id uuid, p_kind text, p_amount numeric, p_party_name text, p_description text, p_occurred_at timestamp with time zone, p_source_message_id text, p_lines jsonb, p_payment_method text, p_loss_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_create_daily_record_draft(p_profile_id uuid, p_company_id uuid, p_kind text, p_amount numeric, p_party_name text, p_description text, p_occurred_at timestamp with time zone, p_source_message_id text, p_lines jsonb, p_payment_method text, p_loss_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_create_daily_record_draft(p_profile_id uuid, p_company_id uuid, p_kind text, p_amount numeric, p_party_name text, p_description text, p_occurred_at timestamp with time zone, p_source_message_id text, p_lines jsonb, p_payment_method text, p_loss_reason text) TO service_role;


--
-- Name: FUNCTION wa_create_invite_code(p_phone text, p_role text, p_days integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_create_invite_code(p_phone text, p_role text, p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_create_invite_code(p_phone text, p_role text, p_days integer) TO service_role;


--
-- Name: FUNCTION wa_create_supplier_credit_purchase_draft(p_profile_id uuid, p_company_id uuid, p_supplier_name text, p_lines jsonb, p_amount numeric, p_occurred_at timestamp with time zone, p_source_message_id text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_create_supplier_credit_purchase_draft(p_profile_id uuid, p_company_id uuid, p_supplier_name text, p_lines jsonb, p_amount numeric, p_occurred_at timestamp with time zone, p_source_message_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_create_supplier_credit_purchase_draft(p_profile_id uuid, p_company_id uuid, p_supplier_name text, p_lines jsonb, p_amount numeric, p_occurred_at timestamp with time zone, p_source_message_id text) TO service_role;


--
-- Name: FUNCTION wa_create_supplier_payment_draft(p_profile_id uuid, p_company_id uuid, p_supplier_name text, p_amount numeric, p_payment_method text, p_occurred_at timestamp with time zone, p_source_message_id text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_create_supplier_payment_draft(p_profile_id uuid, p_company_id uuid, p_supplier_name text, p_amount numeric, p_payment_method text, p_occurred_at timestamp with time zone, p_source_message_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_create_supplier_payment_draft(p_profile_id uuid, p_company_id uuid, p_supplier_name text, p_amount numeric, p_payment_method text, p_occurred_at timestamp with time zone, p_source_message_id text) TO service_role;


--
-- Name: FUNCTION wa_create_whole_animal_breakdown_draft(p_profile_id uuid, p_company_id uuid, p_source_procurement_daily_record_id uuid, p_outputs jsonb, p_occurred_at timestamp with time zone, p_source_message_id text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_create_whole_animal_breakdown_draft(p_profile_id uuid, p_company_id uuid, p_source_procurement_daily_record_id uuid, p_outputs jsonb, p_occurred_at timestamp with time zone, p_source_message_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_create_whole_animal_breakdown_draft(p_profile_id uuid, p_company_id uuid, p_source_procurement_daily_record_id uuid, p_outputs jsonb, p_occurred_at timestamp with time zone, p_source_message_id text) TO service_role;


--
-- Name: FUNCTION wa_create_whole_animal_procurement_draft(p_profile_id uuid, p_company_id uuid, p_animal_type text, p_animal_count integer, p_purchase_total numeric, p_supplier_name text, p_payment_method text, p_occurred_at timestamp with time zone, p_source_message_id text, p_reference text, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_create_whole_animal_procurement_draft(p_profile_id uuid, p_company_id uuid, p_animal_type text, p_animal_count integer, p_purchase_total numeric, p_supplier_name text, p_payment_method text, p_occurred_at timestamp with time zone, p_source_message_id text, p_reference text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_create_whole_animal_procurement_draft(p_profile_id uuid, p_company_id uuid, p_animal_type text, p_animal_count integer, p_purchase_total numeric, p_supplier_name text, p_payment_method text, p_occurred_at timestamp with time zone, p_source_message_id text, p_reference text, p_note text) TO service_role;


--
-- Name: FUNCTION wa_delete_combo(p_phone text, p_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_delete_combo(p_phone text, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_delete_combo(p_phone text, p_name text) TO service_role;


--
-- Name: FUNCTION wa_find_product_barcode(p_company_id uuid, p_barcode text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_find_product_barcode(p_company_id uuid, p_barcode text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_find_product_barcode(p_company_id uuid, p_barcode text) TO service_role;


--
-- Name: FUNCTION wa_forget_business_term(p_phone text, p_term text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_forget_business_term(p_phone text, p_term text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_forget_business_term(p_phone text, p_term text) TO service_role;


--
-- Name: FUNCTION wa_issue_login_token(p_phone text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_issue_login_token(p_phone text) FROM PUBLIC;


--
-- Name: FUNCTION wa_join_by_code(p_user uuid, p_phone text, p_code text, p_full_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_join_by_code(p_user uuid, p_phone text, p_code text, p_full_name text) FROM PUBLIC;


--
-- Name: FUNCTION wa_last_daily_record(p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_last_daily_record(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_last_daily_record(p_company_id uuid) TO service_role;


--
-- Name: FUNCTION wa_list_available_whole_animal_procurements(p_profile_id uuid, p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_list_available_whole_animal_procurements(p_profile_id uuid, p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_list_available_whole_animal_procurements(p_profile_id uuid, p_company_id uuid) TO service_role;


--
-- Name: FUNCTION wa_logout(p_phone text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_logout(p_phone text) FROM PUBLIC;


--
-- Name: FUNCTION wa_memberships(p_phone text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_memberships(p_phone text) FROM PUBLIC;


--
-- Name: FUNCTION wa_next_cost_prompt(p_phone text, p_daily_record_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_next_cost_prompt(p_phone text, p_daily_record_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION wa_pending_record_queue(p_company_id uuid, p_profile_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_pending_record_queue(p_company_id uuid, p_profile_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_pending_record_queue(p_company_id uuid, p_profile_id uuid) TO service_role;


--
-- Name: FUNCTION wa_place_shop_order(p_buyer_company_id uuid, p_supplier_company_id uuid, p_lines jsonb, p_note text, p_dry_run boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_place_shop_order(p_buyer_company_id uuid, p_supplier_company_id uuid, p_lines jsonb, p_note text, p_dry_run boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_place_shop_order(p_buyer_company_id uuid, p_supplier_company_id uuid, p_lines jsonb, p_note text, p_dry_run boolean) TO service_role;


--
-- Name: FUNCTION wa_preview_product_rename(p_phone text, p_from text, p_to text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_preview_product_rename(p_phone text, p_from text, p_to text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_preview_product_rename(p_phone text, p_from text, p_to text) TO service_role;


--
-- Name: FUNCTION wa_price_sale_unit(p_company_id uuid, p_product text, p_unit text, p_quantity numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_price_sale_unit(p_company_id uuid, p_product text, p_unit text, p_quantity numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_price_sale_unit(p_company_id uuid, p_product text, p_unit text, p_quantity numeric) TO service_role;


--
-- Name: FUNCTION wa_price_sale_unit(p_company_id uuid, p_product text, p_unit text, p_quantity numeric, p_priced_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_price_sale_unit(p_company_id uuid, p_product text, p_unit text, p_quantity numeric, p_priced_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_price_sale_unit(p_company_id uuid, p_product text, p_unit text, p_quantity numeric, p_priced_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION wa_product_pricing(p_company_id uuid, p_product_keys text[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_product_pricing(p_company_id uuid, p_product_keys text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_product_pricing(p_company_id uuid, p_product_keys text[]) TO service_role;


--
-- Name: FUNCTION wa_product_pricing(p_company_id uuid, p_product_keys text[], p_priced_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_product_pricing(p_company_id uuid, p_product_keys text[], p_priced_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_product_pricing(p_company_id uuid, p_product_keys text[], p_priced_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION wa_queue_close_reminders(p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_queue_close_reminders(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_queue_close_reminders(p_limit integer) TO service_role;


--
-- Name: FUNCTION wa_record_ai_interpretation(p_company_id uuid, p_wa_message_id text, p_model text, p_prompt_version text, p_tool_schema_version text, p_chosen_tool text, p_semantic_intent text, p_tool_rounds integer, p_latency_ms integer, p_backend_outcome text, p_rejection_code text, p_clarification_field text, p_fallback_used boolean, p_fallback_reason text, p_provider_failure_code text, p_route text, p_cache_read_tokens integer, p_cache_write_tokens integer, p_failure_layer text, p_retrieval_status text, p_conversation_state text, p_tool_result_status text, p_tool_failure_code text, p_runtime_version text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_record_ai_interpretation(p_company_id uuid, p_wa_message_id text, p_model text, p_prompt_version text, p_tool_schema_version text, p_chosen_tool text, p_semantic_intent text, p_tool_rounds integer, p_latency_ms integer, p_backend_outcome text, p_rejection_code text, p_clarification_field text, p_fallback_used boolean, p_fallback_reason text, p_provider_failure_code text, p_route text, p_cache_read_tokens integer, p_cache_write_tokens integer, p_failure_layer text, p_retrieval_status text, p_conversation_state text, p_tool_result_status text, p_tool_failure_code text, p_runtime_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_record_ai_interpretation(p_company_id uuid, p_wa_message_id text, p_model text, p_prompt_version text, p_tool_schema_version text, p_chosen_tool text, p_semantic_intent text, p_tool_rounds integer, p_latency_ms integer, p_backend_outcome text, p_rejection_code text, p_clarification_field text, p_fallback_used boolean, p_fallback_reason text, p_provider_failure_code text, p_route text, p_cache_read_tokens integer, p_cache_write_tokens integer, p_failure_layer text, p_retrieval_status text, p_conversation_state text, p_tool_result_status text, p_tool_failure_code text, p_runtime_version text) TO service_role;


--
-- Name: FUNCTION wa_record_obligation_payment(p_company_id uuid, p_profile_id uuid, p_obligation_id uuid, p_amount numeric, p_daily_record_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_record_obligation_payment(p_company_id uuid, p_profile_id uuid, p_obligation_id uuid, p_amount numeric, p_daily_record_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_record_obligation_payment(p_company_id uuid, p_profile_id uuid, p_obligation_id uuid, p_amount numeric, p_daily_record_id uuid) TO service_role;


--
-- Name: FUNCTION wa_record_stock_count(p_phone text, p_name text, p_quantity numeric, p_unit text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_record_stock_count(p_phone text, p_name text, p_quantity numeric, p_unit text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_record_stock_count(p_phone text, p_name text, p_quantity numeric, p_unit text) TO service_role;


--
-- Name: FUNCTION wa_record_stock_counts(p_phone text, p_items jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_record_stock_counts(p_phone text, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_record_stock_counts(p_phone text, p_items jsonb) TO service_role;


--
-- Name: FUNCTION wa_recurring_obligations(p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_recurring_obligations(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_recurring_obligations(p_company_id uuid) TO service_role;


--
-- Name: FUNCTION wa_release_whatsapp_turn(p_phone text, p_owner_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_release_whatsapp_turn(p_phone text, p_owner_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_release_whatsapp_turn(p_phone text, p_owner_token uuid) TO service_role;


--
-- Name: FUNCTION wa_rename_product(p_phone text, p_from text, p_to text, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_rename_product(p_phone text, p_from text, p_to text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_rename_product(p_phone text, p_from text, p_to text, p_reason text) TO service_role;


--
-- Name: FUNCTION wa_renew_whatsapp_turn(p_phone text, p_owner_token uuid, p_lease_seconds integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_renew_whatsapp_turn(p_phone text, p_owner_token uuid, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_renew_whatsapp_turn(p_phone text, p_owner_token uuid, p_lease_seconds integer) TO service_role;


--
-- Name: FUNCTION wa_resolve_company_product_read(p_profile_id uuid, p_company_id uuid, p_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_resolve_company_product_read(p_profile_id uuid, p_company_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_resolve_company_product_read(p_profile_id uuid, p_company_id uuid, p_name text) TO service_role;


--
-- Name: FUNCTION wa_resolve_context(p_identity_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_resolve_context(p_identity_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_resolve_context(p_identity_id uuid) TO service_role;


--
-- Name: FUNCTION wa_save_business_term(p_phone text, p_kind text, p_term text, p_product text, p_meaning text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_save_business_term(p_phone text, p_kind text, p_term text, p_product text, p_meaning text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_save_business_term(p_phone text, p_kind text, p_term text, p_product text, p_meaning text) TO service_role;


--
-- Name: FUNCTION wa_save_combo(p_phone text, p_name text, p_pieces jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_save_combo(p_phone text, p_name text, p_pieces jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_save_combo(p_phone text, p_name text, p_pieces jsonb) TO service_role;


--
-- Name: FUNCTION wa_search_suppliers(p_term text, p_exclude_company_id uuid, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_search_suppliers(p_term text, p_exclude_company_id uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_search_suppliers(p_term text, p_exclude_company_id uuid, p_limit integer) TO service_role;


--
-- Name: FUNCTION wa_set_business_hours(p_phone text, p_opening_time time without time zone, p_closing_time time without time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_set_business_hours(p_phone text, p_opening_time time without time zone, p_closing_time time without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_set_business_hours(p_phone text, p_opening_time time without time zone, p_closing_time time without time zone) TO service_role;


--
-- Name: FUNCTION wa_set_closing_time(p_phone text, p_time time without time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_set_closing_time(p_phone text, p_time time without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_set_closing_time(p_phone text, p_time time without time zone) TO service_role;


--
-- Name: FUNCTION wa_set_draft_payment_method(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_payment_method text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_set_draft_payment_method(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_payment_method text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_set_draft_payment_method(p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid, p_payment_method text) TO service_role;


--
-- Name: FUNCTION wa_set_language(p_phone text, p_lang text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_set_language(p_phone text, p_lang text) FROM PUBLIC;


--
-- Name: FUNCTION wa_set_product_cost(p_phone text, p_name text, p_unit_cost numeric, p_unit text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_set_product_cost(p_phone text, p_name text, p_unit_cost numeric, p_unit text) FROM PUBLIC;


--
-- Name: FUNCTION wa_set_product_costs(p_phone text, p_items jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_set_product_costs(p_phone text, p_items jsonb) FROM PUBLIC;


--
-- Name: FUNCTION wa_set_recurring_obligation(p_company_id uuid, p_profile_id uuid, p_kind text, p_label text, p_amount numeric, p_period_months integer, p_next_due_on date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_set_recurring_obligation(p_company_id uuid, p_profile_id uuid, p_kind text, p_label text, p_amount numeric, p_period_months integer, p_next_due_on date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_set_recurring_obligation(p_company_id uuid, p_profile_id uuid, p_kind text, p_label text, p_amount numeric, p_period_months integer, p_next_due_on date) TO service_role;


--
-- Name: FUNCTION wa_set_selling_price(p_phone text, p_name text, p_retail numeric, p_wholesale numeric, p_min_qty numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_set_selling_price(p_phone text, p_name text, p_retail numeric, p_wholesale numeric, p_min_qty numeric) FROM PUBLIC;


--
-- Name: FUNCTION wa_set_selling_prices(p_phone text, p_items jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_set_selling_prices(p_phone text, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_set_selling_prices(p_phone text, p_items jsonb) TO service_role;


--
-- Name: FUNCTION wa_shop_order_action(p_order_id uuid, p_actor_company_id uuid, p_action text, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_shop_order_action(p_order_id uuid, p_actor_company_id uuid, p_action text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_shop_order_action(p_order_id uuid, p_actor_company_id uuid, p_action text, p_note text) TO service_role;


--
-- Name: FUNCTION wa_shop_order_book(p_company_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_shop_order_book(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_shop_order_book(p_company_id uuid) TO service_role;


--
-- Name: FUNCTION wa_skip_cost_prompt(p_phone text, p_product text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_skip_cost_prompt(p_phone text, p_product text) FROM PUBLIC;


--
-- Name: FUNCTION wa_stock_on_hand(p_company_id uuid, p_product text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.wa_stock_on_hand(p_company_id uuid, p_product text) TO service_role;


--
-- Name: FUNCTION wa_stop_proactive_notifications(p_phone text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_stop_proactive_notifications(p_phone text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_stop_proactive_notifications(p_phone text) TO service_role;


--
-- Name: FUNCTION wa_store_ai_exchange(p_identity_id uuid, p_company_id uuid, p_wa_message_id text, p_user_text text, p_assistant_text text, p_topic text, p_entities jsonb, p_last_tool text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_store_ai_exchange(p_identity_id uuid, p_company_id uuid, p_wa_message_id text, p_user_text text, p_assistant_text text, p_topic text, p_entities jsonb, p_last_tool text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_store_ai_exchange(p_identity_id uuid, p_company_id uuid, p_wa_message_id text, p_user_text text, p_assistant_text text, p_topic text, p_entities jsonb, p_last_tool text) TO service_role;


--
-- Name: FUNCTION wa_supplier_balances(p_profile_id uuid, p_company_id uuid, p_supplier_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_supplier_balances(p_profile_id uuid, p_company_id uuid, p_supplier_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_supplier_balances(p_profile_id uuid, p_company_id uuid, p_supplier_name text) TO service_role;


--
-- Name: FUNCTION wa_supplier_product_pricing(p_supplier_company_id uuid, p_product_keys text[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_supplier_product_pricing(p_supplier_company_id uuid, p_product_keys text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_supplier_product_pricing(p_supplier_company_id uuid, p_product_keys text[]) TO service_role;


--
-- Name: FUNCTION wa_sweep_abandoned_drafts(p_older_than_hours integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_sweep_abandoned_drafts(p_older_than_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_sweep_abandoned_drafts(p_older_than_hours integer) TO service_role;


--
-- Name: FUNCTION wa_switch_active_company(p_phone text, p_company uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_switch_active_company(p_phone text, p_company uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_switch_active_company(p_phone text, p_company uuid) TO service_role;


--
-- Name: FUNCTION wa_trim_typing_attempts(p_keep_hours integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_trim_typing_attempts(p_keep_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_trim_typing_attempts(p_keep_hours integer) TO service_role;


--
-- Name: FUNCTION wa_try_acquire_whatsapp_turn(p_phone text, p_owner_token uuid, p_lease_seconds integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_try_acquire_whatsapp_turn(p_phone text, p_owner_token uuid, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_try_acquire_whatsapp_turn(p_phone text, p_owner_token uuid, p_lease_seconds integer) TO service_role;


--
-- Name: FUNCTION wa_void_daily_record(p_phone text, p_daily_record_id uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.wa_void_daily_record(p_phone text, p_daily_record_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_void_daily_record(p_phone text, p_daily_record_id uuid, p_reason text) TO service_role;


--
-- Name: TABLE billing_plans; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.billing_plans TO authenticated;


--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;


--
-- Name: TABLE company_suppliers; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.company_suppliers TO authenticated;


--
-- Name: TABLE daily_closures; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.daily_closures TO authenticated;


--
-- Name: TABLE daily_record_audit_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.daily_record_audit_log TO authenticated;


--
-- Name: TABLE daily_record_lines; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.daily_record_lines TO authenticated;


--
-- Name: TABLE daily_records; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.daily_records TO authenticated;


--
-- Name: TABLE legal_acceptances; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.legal_acceptances TO authenticated;


--
-- Name: TABLE legal_policy_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.legal_policy_versions TO anon;
GRANT SELECT ON TABLE public.legal_policy_versions TO authenticated;


--
-- Name: TABLE marketplace_order_requests; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.marketplace_order_requests TO service_role;


--
-- Name: TABLE marketplace_pending_selections; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.marketplace_pending_selections TO service_role;


--
-- Name: TABLE marketplace_product_index; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.marketplace_product_index TO service_role;


--
-- Name: TABLE merchant_memory; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.merchant_memory TO authenticated;


--
-- Name: TABLE obligation_payments; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.obligation_payments TO authenticated;


--
-- Name: TABLE ops_incidents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ops_incidents TO service_role;


--
-- Name: TABLE ops_monitor_runs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ops_monitor_runs TO service_role;


--
-- Name: TABLE ops_privacy_requests; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ops_privacy_requests TO service_role;


--
-- Name: TABLE ops_recovery_evidence; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ops_recovery_evidence TO service_role;


--
-- Name: TABLE platform_admin_audit_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.platform_admin_audit_logs TO service_role;


--
-- Name: TABLE platform_admins; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.platform_admins TO service_role;


--
-- Name: TABLE platform_expenses; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.platform_expenses TO service_role;


--
-- Name: TABLE product_archives; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.product_archives TO authenticated;


--
-- Name: TABLE product_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.product_events TO authenticated;


--
-- Name: TABLE product_selling_prices; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.product_selling_prices TO authenticated;


--
-- Name: TABLE product_unit_audit_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.product_unit_audit_log TO authenticated;


--
-- Name: TABLE receipt_aliases; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.receipt_aliases TO authenticated;


--
-- Name: TABLE recurring_obligations; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.recurring_obligations TO authenticated;


--
-- Name: TABLE shop_order_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.shop_order_events TO authenticated;


--
-- Name: TABLE shop_order_lines; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.shop_order_lines TO authenticated;


--
-- Name: TABLE shop_orders; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.shop_orders TO authenticated;


--
-- Name: TABLE stock_counts; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.stock_counts TO authenticated;


--
-- Name: TABLE subscription_invoices; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.subscription_invoices TO authenticated;


--
-- Name: TABLE subscription_usage; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.subscription_usage TO authenticated;


--
-- Name: TABLE subscriptions; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.subscriptions TO authenticated;


--
-- Name: TABLE whatsapp_learning_gaps; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.whatsapp_learning_gaps TO service_role;


--
-- Name: TABLE whatsapp_notification_consent_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.whatsapp_notification_consent_log TO authenticated;


--
-- Name: TABLE whatsapp_typing_attempts; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT ON TABLE public.whatsapp_typing_attempts TO service_role;


--
-- Name: SEQUENCE whatsapp_typing_attempts_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE public.whatsapp_typing_attempts_id_seq TO service_role;


--
-- Name: TABLE whole_animal_breakdown_outputs; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.whole_animal_breakdown_outputs TO authenticated;


--
-- Name: TABLE whole_animal_breakdowns; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.whole_animal_breakdowns TO authenticated;


--
-- Name: TABLE whole_animal_procurements; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.whole_animal_procurements TO authenticated;


--
-- Name: TABLE buckets; Type: ACL; Schema: storage; Owner: postgres
--

GRANT ALL ON TABLE storage.buckets TO anon;
GRANT ALL ON TABLE storage.buckets TO authenticated;
GRANT ALL ON TABLE storage.buckets TO service_role;


--
-- Name: TABLE objects; Type: ACL; Schema: storage; Owner: postgres
--

GRANT ALL ON TABLE storage.objects TO anon;
GRANT ALL ON TABLE storage.objects TO authenticated;
GRANT ALL ON TABLE storage.objects TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict xT08qFKghUhGd33WMCgUERTPadHlmoYQqLqI8aYEbLCDFFmIHmHeUFr1NggTcw0

