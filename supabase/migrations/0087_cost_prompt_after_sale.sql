-- Asking for a buying price at the moment it is cheapest to answer.
--
-- Production has 37 products and ZERO buying prices, so the profit estimate can
-- see 0% of trade and says so on every ask. The prices are not missing because
-- the trader refuses to give them — they are missing because the only way in was
-- to open the web app and think about all 37 at once.
--
-- Right after confirming "Tenzi za Rohoni 3 kwa 30,000" the product is already in
-- their head and the answer takes four seconds. That is the moment to ask.
--
-- NOT NAGGING IS THE WHOLE DESIGN. A prompt that reappears after every sale of
-- the same product would be the fastest way to make people stop confirming
-- records at all. So each ask is recorded, and a product is not raised again
-- within a week, nor ever after two skips. Somebody who does not want to answer
-- is asked twice in their life, not twice a day.
--
-- ONE AT A TIME. A five-line sale asks about one product, not five. The rest
-- come up on their own later sales.
--
-- Only owner/accountant are ever asked, because only they may set a price —
-- set_product_cost enforces that anyway, and asking a worker a question their
-- role forbids them to answer would be worse than not asking.
--
-- ROLLBACK
--   drop function public.wa_skip_cost_prompt(text, text);
--   drop function public.wa_next_cost_prompt(text, uuid);
--   drop table public.product_cost_prompts;

create table if not exists public.product_cost_prompts (
  company_id     uuid not null references public.companies(id) on delete cascade,
  product_key    text not null,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  asked_at       timestamptz not null default clock_timestamp(),
  skipped_count  integer not null default 0 check (skipped_count >= 0),
  primary key (company_id, product_key, profile_id)
);

alter table public.product_cost_prompts enable row level security;
revoke all on table public.product_cost_prompts from public, anon, authenticated;

-- How long a product rests after being raised, and how many refusals end it.
-- Both are deliberately generous: the cost of asking too often is that people
-- stop reading the confirmations, and that cost is much higher than a late price.
create or replace function public.wa_next_cost_prompt(
  p_phone text,
  p_daily_record_id uuid
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
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

revoke execute on function public.wa_next_cost_prompt(text, uuid) from public, anon, authenticated;

-- "RUKA". Counted, because two refusals mean stop asking.
create or replace function public.wa_skip_cost_prompt(p_phone text, p_product text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
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

revoke execute on function public.wa_skip_cost_prompt(text, text) from public, anon, authenticated;
