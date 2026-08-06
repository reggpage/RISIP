-- Personal receipt names are private to the user who created them. Keeping
-- aliases separate from receipts means another team member cannot read them
-- through the normal company-wide receipt query.
create table if not exists public.receipt_aliases (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_id, user_id)
);

create index if not exists receipt_aliases_user_idx
  on public.receipt_aliases(user_id, updated_at desc);

alter table public.receipt_aliases enable row level security;

grant select, insert, update, delete on public.receipt_aliases to authenticated;
revoke all on public.receipt_aliases from anon;

drop policy if exists receipt_aliases_select_own on public.receipt_aliases;
create policy receipt_aliases_select_own on public.receipt_aliases
  for select to authenticated
  using (user_id = auth.uid() and private.auth_can_see_project(
    (select project_id from public.receipts where id = receipt_id)
  ));

drop policy if exists receipt_aliases_insert_own on public.receipt_aliases;
create policy receipt_aliases_insert_own on public.receipt_aliases
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and private.auth_can_see_project((select project_id from public.receipts where id = receipt_id))
  );

drop policy if exists receipt_aliases_update_own on public.receipt_aliases;
create policy receipt_aliases_update_own on public.receipt_aliases
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists receipt_aliases_delete_own on public.receipt_aliases;
create policy receipt_aliases_delete_own on public.receipt_aliases
  for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.receipt_aliases_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists receipt_aliases_updated_at on public.receipt_aliases;
create trigger receipt_aliases_updated_at
  before update on public.receipt_aliases
  for each row execute function public.receipt_aliases_set_updated_at();
