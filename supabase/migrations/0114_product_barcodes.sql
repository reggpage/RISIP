-- The number under the stripes, tied to the shop's own name for the thing.
--
-- A barcode is worth one thing here and it is worth a lot: a key that cannot be
-- mistyped. "daftari" and "daftari kubwa" are two catalogue rows a person has to
-- keep straight; 6011040121093 is the same packet every time. What it is NOT is
-- a name or a price — there is no free database of Tanzanian goods, and
-- inventing one would put names in the ledger that nobody chose.
--
-- Company-scoped, deliberately. Two shops selling the same packet call it
-- different things and charge different prices, and neither should be able to
-- see or shift the other's catalogue. The unique index is therefore per company,
-- not global.
--
-- Descriptive only: nothing in finance, stock or permissions reads this table.
-- It maps a number to a product_key that the ledger already uses.
--
-- ROLLBACK:
--   drop table public.product_barcodes;

create table if not exists public.product_barcodes (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  barcode      text not null,
  product_key  text not null,
  product_name text not null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint product_barcodes_digits check (barcode ~ '^[0-9]{6,18}$'),
  constraint product_barcodes_key check (length(btrim(product_key)) between 1 and 120),
  constraint product_barcodes_name check (length(btrim(product_name)) between 1 and 120)
);

-- One code means one product within a shop. Scanning it twice must not be able
-- to produce two answers.
create unique index if not exists product_barcodes_company_code
  on public.product_barcodes (company_id, barcode);

-- A product may carry several codes: the same sugar arrives in a 1kg packet and
-- a 2kg packet, and a shop that sells both as "sukari" scans two numbers.
create index if not exists product_barcodes_company_product
  on public.product_barcodes (company_id, product_key);

alter table public.product_barcodes enable row level security;

-- Everyone in the company can READ: a worker at the counter scanning a packet is
-- the whole point, and the table holds no money.
drop policy if exists product_barcodes_read on public.product_barcodes;
create policy product_barcodes_read on public.product_barcodes
  for select to authenticated
  using (company_id = private.auth_company_id());

-- Only owner and accountant may WRITE. A barcode saved against the wrong
-- product misprices every sale that follows it, which is the same reason only
-- they may set prices.
drop policy if exists product_barcodes_write on public.product_barcodes;
create policy product_barcodes_write on public.product_barcodes
  for insert to authenticated
  with check (
    company_id = private.auth_company_id()
    and private.auth_role() in ('owner', 'accountant')
  );

drop policy if exists product_barcodes_update on public.product_barcodes;
create policy product_barcodes_update on public.product_barcodes
  for update to authenticated
  using (company_id = private.auth_company_id() and private.auth_role() in ('owner', 'accountant'))
  with check (company_id = private.auth_company_id() and private.auth_role() in ('owner', 'accountant'));

drop policy if exists product_barcodes_delete on public.product_barcodes;
create policy product_barcodes_delete on public.product_barcodes
  for delete to authenticated
  using (company_id = private.auth_company_id() and private.auth_role() in ('owner', 'accountant'));

comment on table public.product_barcodes is
  'Scanned product codes mapped to this company''s own product_key. Descriptive only: never read by finance, stock or permissions.';

-- Saving a scan: the barcode, and the shop's name for what it is.
--
-- Written as an RPC rather than a bare insert so that re-scanning a code the
-- shop already knows UPDATES the name instead of failing on the unique index —
-- somebody correcting "sukri" to "sukari" should not meet a constraint error.
create or replace function public.set_product_barcode(
  p_barcode text,
  p_product_key text,
  p_product_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
end $$;

revoke execute on function public.set_product_barcode(text, text, text) from public, anon;
grant execute on function public.set_product_barcode(text, text, text) to authenticated;

-- Looking one up, for the scanner page and for WhatsApp.
create or replace function public.find_product_barcode(p_barcode text)
returns table (barcode text, product_key text, product_name text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select b.barcode, b.product_key, b.product_name
  from public.product_barcodes b
  where b.company_id = private.auth_company_id()
    and b.barcode = regexp_replace(coalesce(p_barcode, ''), '[^0-9]', '', 'g')
  limit 1;
$$;

revoke execute on function public.find_product_barcode(text) from public, anon;
grant execute on function public.find_product_barcode(text) to authenticated;

-- The WhatsApp side reads with the service role and has no auth.uid(), so it
-- passes the company explicitly. Service role only: it crosses no tenant
-- boundary because the caller has already resolved the identity's company.
create or replace function public.wa_find_product_barcode(p_company_id uuid, p_barcode text)
returns table (barcode text, product_key text, product_name text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select b.barcode, b.product_key, b.product_name
  from public.product_barcodes b
  where b.company_id = p_company_id
    and b.barcode = regexp_replace(coalesce(p_barcode, ''), '[^0-9]', '', 'g')
  limit 1;
$$;

revoke execute on function public.wa_find_product_barcode(uuid, text) from public, anon, authenticated;
grant execute on function public.wa_find_product_barcode(uuid, text) to service_role;
