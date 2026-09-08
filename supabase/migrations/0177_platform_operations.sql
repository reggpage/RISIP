-- Durable operations state. No merchant messages or ledger values are stored here.
create table public.ops_monitor_runs (
  id uuid primary key default gen_random_uuid(), checked_at timestamptz not null default now(),
  complete boolean not null, findings jsonb not null, email_configured boolean not null default false
);
create table public.ops_incidents (
  id uuid primary key default gen_random_uuid(), code text not null, severity text not null check(severity in ('down','warn')),
  title text not null, detail text not null, owner text not null,
  opened_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  resolved_at timestamptz, clean_checks integer not null default 0,
  acknowledged_by uuid references auth.users(id), acknowledged_at timestamptz, acknowledgment text
);
create unique index ops_incident_active_code on public.ops_incidents(code) where resolved_at is null;
create table public.ops_alert_deliveries (
  id uuid primary key default gen_random_uuid(), incident_id uuid not null references public.ops_incidents(id),
  event text not null check(event in ('opened','recovered')), status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
  attempts integer not null default 0, available_at timestamptz not null default now(), sent_at timestamptz,
  last_error text, created_at timestamptz not null default now(), unique(incident_id,event)
);
create table public.ops_recovery_evidence (
  id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('backup_restore','retry_recovery','ai_evaluation','access_review')),
  result text not null check(result in ('passed','failed','unverified')), summary text not null check(length(btrim(summary)) between 10 and 1000),
  evidence_url text not null check(evidence_url ~ '^https://[^[:space:]]+$'), tested_at timestamptz not null,
  recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now()
);
create table public.ops_privacy_requests (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id),
  kind text not null check(kind in ('access','correction','export','deletion','complaint')),
  status text not null default 'received' check(status in ('received','verified','in_progress','closed')),
  note text not null check(length(btrim(note)) between 10 and 1000), due_at date not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
do $$ declare name text; begin
  foreach name in array array['ops_monitor_runs','ops_incidents','ops_alert_deliveries','ops_recovery_evidence','ops_privacy_requests'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated',name);
    execute format('grant all on public.%I to service_role',name);
  end loop;
end $$;

create function public.ops_record_check(p_findings jsonb,p_complete boolean,p_email_configured boolean) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
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
end $$;
revoke all on function public.ops_record_check(jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.ops_record_check(jsonb,boolean,boolean) to service_role;

create function public.ops_claim_alerts() returns setof public.ops_alert_deliveries
language sql security definer set search_path=pg_catalog,public as $$
  update public.ops_alert_deliveries set status='sending',attempts=attempts+1,available_at=now()+interval '2 minutes'
  where id in (select id from public.ops_alert_deliveries where status in ('pending','failed','sending') and available_at<=now() and attempts<8 order by created_at for update skip locked limit 20) returning *;
$$;
revoke all on function public.ops_claim_alerts() from public,anon,authenticated;
grant execute on function public.ops_claim_alerts() to service_role;

create function public.platform_admin_reliability() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
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
create function public.platform_admin_ack_incident(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.platform_admin_role; previous jsonb;
begin
 r:=private.require_platform_admin('write_company');
 if length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'Provide a meaningful response note'; end if;
 select to_jsonb(i) into strict previous from public.ops_incidents i where id=p_id for update;
 if previous->>'resolved_at' is not null then raise exception 'Incident already recovered'; end if;
 update public.ops_incidents set acknowledged_by=auth.uid(),acknowledged_at=now(),acknowledgment=btrim(p_reason) where id=p_id;
 perform private.platform_admin_audit(r,'acknowledge_incident','ops_incident',p_id,p_reason,previous,jsonb_build_object('acknowledged_by',auth.uid()));
end $$;
create function public.platform_admin_add_evidence(p_kind text,p_result text,p_summary text,p_url text,p_tested_at timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.platform_admin_role; item uuid;
begin
 r:=private.require_platform_admin('write_company');
 if p_tested_at>now() or p_tested_at is null then raise exception 'Test time must be in the past'; end if;
 insert into public.ops_recovery_evidence(kind,result,summary,evidence_url,tested_at,recorded_by) values(p_kind,p_result,btrim(p_summary),p_url,p_tested_at,auth.uid()) returning id into item;
 perform private.platform_admin_audit(r,'record_recovery_evidence','ops_evidence',item,p_summary,'{}',jsonb_build_object('kind',p_kind,'result',p_result,'url',p_url));
 return item;
end $$;
create function public.platform_admin_audit_history(p_offset integer default 0) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform private.require_platform_admin('read');
 return coalesce((select jsonb_agg(to_jsonb(a)) from(select * from public.platform_admin_audit_logs order by created_at desc,id desc offset greatest(0,least(p_offset,100000)) limit 50)a),'[]'::jsonb);
end $$;
create function public.platform_admin_governance() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.platform_admin_role;
begin
 r:=private.require_platform_admin('read');
 return jsonb_build_object(
  'policy',(select jsonb_build_object('version',version,'publishedAt',published_at,'accepted',(select count(*) from public.legal_acceptances a where a.version=v.version),'profiles',(select count(*) from public.profiles where deactivated_at is null)) from public.legal_policy_versions v where active),
  'roles',(select jsonb_agg(to_jsonb(a)) from(select role,count(*) as count from public.platform_admins where active group by role)a),
  'requests',case when r in ('super_admin','operations','support') then coalesce((select jsonb_agg(to_jsonb(p)) from(select * from public.ops_privacy_requests order by created_at desc limit 100)p),'[]'::jsonb) else '[]'::jsonb end
 );
end $$;
create function public.platform_admin_privacy_request(p_id uuid,p_profile uuid,p_kind text,p_status text,p_note text,p_due date) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
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
do $$ declare signature text; begin
 foreach signature in array array['platform_admin_reliability()','platform_admin_ack_incident(uuid,text)','platform_admin_add_evidence(text,text,text,text,timestamp with time zone)','platform_admin_audit_history(integer)','platform_admin_governance()','platform_admin_privacy_request(uuid,uuid,text,text,text,date)'] loop
  execute 'revoke all on function public.'||signature||' from public,anon';
  execute 'grant execute on function public.'||signature||' to authenticated';
 end loop;
end $$;
