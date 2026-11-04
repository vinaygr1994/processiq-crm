-- Background scheduler: every minute Supabase calls your app so workflows keep running when nobody is logged in.
-- 1) Replace REPLACE_WITH_CRON_SECRET below with the same value you set as CRON_SECRET in Vercel.
-- 2) Replace the URL if your app lives on a different address.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('processiq-tick') where exists (select 1 from cron.job where jobname = 'processiq-tick');
select cron.schedule(
  'processiq-tick',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://processiq-crm.vercel.app/api/cron/tick',
       headers := jsonb_build_object('Authorization', 'Bearer REPLACE_WITH_CRON_SECRET', 'Content-Type', 'application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 55000
     ); $$
);
