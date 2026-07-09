-- Run this once after deploying the send-task-reminder Edge Function.
-- Before running, create these Vault secrets with real values:
--   tasky_project_url
--   tasky_publishable_key
--   tasky_reminder_cron_secret
--
-- tasky_reminder_cron_secret must match the CRON_SECRET Edge Function secret.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'tasky_project_url'
  ) THEN
    RAISE EXCEPTION 'Missing vault secret: tasky_project_url.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'tasky_publishable_key'
  ) THEN
    RAISE EXCEPTION 'Missing vault secret: tasky_publishable_key.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'tasky_reminder_cron_secret'
  ) THEN
    RAISE EXCEPTION 'Missing vault secret: tasky_reminder_cron_secret.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'tasky_publishable_key'
      AND decrypted_secret = 'YOUR_SUPABASE_PUBLISHABLE_KEY'
  ) THEN
    RAISE EXCEPTION 'Vault secret tasky_publishable_key still has the placeholder value.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'tasky_reminder_cron_secret'
      AND decrypted_secret = 'YOUR_RANDOM_CRON_SECRET'
  ) THEN
    RAISE EXCEPTION 'Vault secret tasky_reminder_cron_secret still has the placeholder value.';
  END IF;
END;
$$;

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

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'tasky-process-recurring-tasks';

SELECT cron.schedule(
  'tasky-process-recurring-tasks',
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
      body := '{"process_due_recurring_tasks":true}'::jsonb
    ) AS request_id;
  $$
);
