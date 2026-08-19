-- Bounded business classification captured during WhatsApp onboarding.
--
-- This is descriptive company metadata only. It does not affect finance totals,
-- receipt extraction, flags, permissions, stock, or any ledger workflow.

alter table companies
  add column if not exists business_category text,
  add column if not exists business_subcategory text,
  add column if not exists business_classification_confidence numeric(4,3),
  add column if not exists business_classification_keywords jsonb,
  add column if not exists business_classified_at timestamptz;

alter table companies drop constraint if exists companies_business_category_check;
alter table companies add constraint companies_business_category_check check (
  business_category is null or business_category in (
    'Food & Beverages',
    'Retail & General Stores',
    'Liquid & Bulk Refills',
    'Services & Micro-Manufacturing'
  )
);

alter table companies drop constraint if exists companies_business_subcategory_check;
alter table companies add constraint companies_business_subcategory_check check (
  (business_category is null and business_subcategory is null)
  or (business_category = 'Food & Beverages' and business_subcategory in (
    'Kijiwe cha Chips', 'Mama Lishe', 'Genge la Mboga na Matunda',
    'Duka la Vinywaji na Grocery', 'Bakery'
  ))
  or (business_category = 'Retail & General Stores' and business_subcategory in (
    'Duka la Mang''aa / Rejareja', 'Duka la Nguo na Viatu',
    'Duka la Vipodozi', 'Hardware', 'Duka la Simu na Elektroniki', 'Pharmacy'
  ))
  or (business_category = 'Liquid & Bulk Refills' and business_subcategory in (
    'Mafuta ya Kula ya Kupima', 'Maziwa ya Kupima', 'Gesi na Nishati'
  ))
  or (business_category = 'Services & Micro-Manufacturing' and business_subcategory in (
    'Stationery na Fedha', 'Saluni', 'Gereji na Spea', 'Ushonaji'
  ))
);

alter table companies drop constraint if exists companies_business_classification_confidence_check;
alter table companies add constraint companies_business_classification_confidence_check check (
  business_classification_confidence is null
  or business_classification_confidence between 0 and 1
);

alter table companies drop constraint if exists companies_business_classification_keywords_check;
alter table companies add constraint companies_business_classification_keywords_check check (
  business_classification_keywords is null
  or jsonb_typeof(business_classification_keywords) = 'array'
);

comment on column companies.business_category is
  'Validated top-level Risip business classification; descriptive only.';
comment on column companies.business_subcategory is
  'Validated Risip business subcategory; descriptive only.';
comment on column companies.business_classification_confidence is
  'Confidence of the bounded onboarding classifier, between 0 and 1.';

create or replace function private.wa_create_business_classified(
  p_user uuid,
  p_phone text,
  p_full_name text,
  p_company_name text,
  p_location text,
  p_category text,
  p_subcategory text,
  p_confidence numeric,
  p_keywords jsonb
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
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

  delete from whatsapp_onboarding where phone_e164 = p_phone;
  return jsonb_build_object(
    'company_id', v_company,
    'company_name', btrim(p_company_name),
    'business_category', p_category,
    'business_subcategory', p_subcategory
  );
end $$;

revoke execute on function private.wa_create_business_classified(
  uuid, text, text, text, text, text, text, numeric, jsonb
) from public, anon, authenticated;

-- Retain the old five-argument entry point so a previously deployed webhook is
-- still compatible while the new webhook version is rolling out.
create or replace function public.wa_create_business(
  p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text
)
returns jsonb
language sql security definer set search_path = pg_catalog, public
as $$
  select private.wa_create_business_classified(
    p_user, p_phone, p_full_name, p_company_name, p_location,
    null, null, null, null
  );
$$;
revoke execute on function public.wa_create_business(uuid, text, text, text, text)
  from public, anon, authenticated;

-- New classified overload used by the updated onboarding state machine.
create or replace function public.wa_create_business(
  p_user uuid,
  p_phone text,
  p_full_name text,
  p_company_name text,
  p_location text,
  p_category text,
  p_subcategory text,
  p_confidence numeric,
  p_keywords jsonb
)
returns jsonb
language sql security definer set search_path = pg_catalog, public
as $$
  select private.wa_create_business_classified(
    p_user, p_phone, p_full_name, p_company_name, p_location,
    p_category, p_subcategory, p_confidence, p_keywords
  );
$$;
revoke execute on function public.wa_create_business(
  uuid, text, text, text, text, text, text, numeric, jsonb
) from public, anon, authenticated;

notify pgrst, 'reload schema';
