-- Lightweight in-app notifications for company events such as staff leaving.

create table if not exists app_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  type text not null,
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_recipient_idx
  on app_notifications(recipient_id, read_at, created_at desc);

alter table app_notifications enable row level security;

drop policy if exists app_notifications_select_own on app_notifications;
create policy app_notifications_select_own on app_notifications
  for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists app_notifications_update_own on app_notifications;
create policy app_notifications_update_own on app_notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

drop policy if exists app_notifications_insert_same_company on app_notifications;
create policy app_notifications_insert_same_company on app_notifications
  for insert to authenticated
  with check (
    company_id = private.auth_company_id()
    and actor_id = auth.uid()
    and exists (
      select 1 from profiles p
      where p.id = recipient_id and p.company_id = private.auth_company_id()
    )
  );
