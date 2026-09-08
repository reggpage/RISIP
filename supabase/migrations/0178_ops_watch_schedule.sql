-- Run the operations watchdog every five minutes with a Vault-backed secret.
-- The command records every check; email remains opt-in via OPS_ALERT_ENABLED.
do $migration$
declare old_job bigint;
begin
  select jobid into old_job from cron.job where jobname = 'risip-ops-watch' limit 1;
  if old_job is not null then perform cron.unschedule(old_job); end if;
  perform cron.schedule(
    'risip-ops-watch',
    '*/5 * * * *',
    $command$
      select net.http_post(
        url := 'https://dsbplcqhlewxnivfwlcx.supabase.co/functions/v1/ops-watch',
        body := '{"mode":"watch"}'::jsonb,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-ops-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'risip_ops_monitor_cron_secret' limit 1)
        ),
        timeout_milliseconds := 10000
      );
    $command$
  );
end $migration$;
