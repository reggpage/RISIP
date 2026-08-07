-- A company-scoped, human-confirmed merchant directory. A vendor is only added
-- when a user saves a correction; unverified AI guesses are never used as memory.
create table if not exists public.merchant_memory (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  match_key text not null check (char_length(trim(match_key)) between 3 and 180),
  vendor_name text not null check (char_length(trim(vendor_name)) between 1 and 180),
  vendor_tin text,
  vendor_vrn text,
  category text,
  learned_from_receipt_id uuid references public.receipts(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, match_key)
);

create index if not exists merchant_memory_company_lookup_idx
  on public.merchant_memory(company_id, match_key);

alter table public.merchant_memory enable row level security;
grant select, insert, update on public.merchant_memory to authenticated;
revoke all on public.merchant_memory from anon;

create policy merchant_memory_select_same_company on public.merchant_memory
  for select to authenticated
  using (company_id = private.auth_company_id());

create policy merchant_memory_insert_same_company on public.merchant_memory
  for insert to authenticated
  with check (company_id = private.auth_company_id() and created_by = auth.uid());

create policy merchant_memory_update_same_company on public.merchant_memory
  for update to authenticated
  using (company_id = private.auth_company_id())
  with check (company_id = private.auth_company_id());

create or replace function public.merchant_memory_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists merchant_memory_updated_at on public.merchant_memory;
create trigger merchant_memory_updated_at
  before update on public.merchant_memory
  for each row execute function public.merchant_memory_set_updated_at();
