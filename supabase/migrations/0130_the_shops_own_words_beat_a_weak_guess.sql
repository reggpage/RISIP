-- MEASURED, and reported honestly at the end of part 4:
--
--   resolve "za mbwa"   ->  Chakula cha mbwa | alias   | 1.0
--   resolve "mbwa"      ->  Chakula cha mbwa | trigram | 0.4706
--
-- "vifuko 4 vya mbwa" leaves the language layer as goods "mbwa", because the
-- joiner belongs to the measure that led the sentence. The shop configured
-- "za mbwa", not "mbwa", so the phrase reached the catalogue only through a
-- trigram score sitting a hundredth above the 0.45 floor. It worked. It worked
-- for the wrong reason, and a shop with a genuinely similar name would have
-- been sold the wrong thing.
--
-- The fix is not a lower threshold and not a hardcoded word. It is one more
-- step in the order that already exists:
--
--   1. exact canonical product
--   2. exact company alias
--   3. THIS: the same alias reached through the shop's own vocabulary, when
--      the wording is the tail of exactly one configured term
--   4. the fuzzy resolver, unchanged
--   5. clarification, unchanged
--
-- Step 3 is deliberately narrow. It matches only when the words asked for are
-- the END of a configured term — "mbwa" is the tail of "za mbwa" — and only
-- when exactly ONE term ends that way. Two candidates mean the shop's own words
-- do not settle it either, and it falls through to the resolver that knows how
-- to ask. Nothing is invented and no threshold moves.
--
-- ROLLBACK: restore wa_resolve_company_product_read from 0124.

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
$fn$;

revoke all on function public.wa_resolve_company_product_read(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wa_resolve_company_product_read(uuid, uuid, text) to service_role;
