-- Run this once after migration_task_email_reminders.sql.
-- Replace the two placeholder values before running.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

SELECT vault.create_secret(
  'https://xemslalhsxdqgzyfdtqf.supabase.co',
  'tasky_project_url',
  'Tasky Supabase project URL'
);

SELECT vault.create_secret(
  'YOUR_SUPABASE_PUBLISHABLE_KEY',
  'tasky_publishable_key',
  'Publishable key used to invoke the reminder Edge Function'
);

SELECT vault.create_secret(
  'YOUR_RANDOM_CRON_SECRET',
  'tasky_reminder_cron_secret',
  'Must match the CRON_SECRET Edge Function secret'
);

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'tasky-send-due-task-reminders';

SELECT cron.schedule(
  'tasky-send-due-task-reminders',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'tasky_project_url'
      ) || '/functions/v1/send-task-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'tasky_publishable_key'
        ),
        'x-cron-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'tasky_reminder_cron_secret'
        )
      ),
      body := '{"process_due_reminders":true}'::jsonb
    ) AS request_id;
  $$
);
