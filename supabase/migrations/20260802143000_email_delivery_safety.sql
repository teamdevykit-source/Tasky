-- Replace legacy task email automation with one assignment-only notification trigger.

DROP TRIGGER IF EXISTS on_task_assignment_auto ON public.tasks;
DROP TRIGGER IF EXISTS on_recurring_task_created ON public.tasks;
DROP FUNCTION IF EXISTS public.handle_task_notification();
DROP FUNCTION IF EXISTS public.handle_recurring_task_notification();

DO $$
DECLARE
  legacy_job_id bigint;
BEGIN
  FOR legacy_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'hourly-deadline-check'
  LOOP
    PERFORM cron.unschedule(legacy_job_id);
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.check_upcoming_deadlines();

-- User invitations now go through the authenticated admin-user-password Edge Function.
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text);

CREATE OR REPLACE FUNCTION public.notify_new_task_assignees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  previous_assignee_ids uuid[] := ARRAY[]::uuid[];
  current_assignee_ids uuid[] := ARRAY[]::uuid[];
  added_assignee_ids uuid[] := ARRAY[]::uuid[];
  project_url text;
  publishable_key text;
  cron_secret text;
BEGIN
  IF NEW.is_self_task THEN
    RETURN NEW;
  END IF;

  current_assignee_ids := CASE
    WHEN COALESCE(cardinality(NEW.assignee_ids), 0) > 0 THEN NEW.assignee_ids
    WHEN NEW.assignee_id IS NOT NULL THEN ARRAY[NEW.assignee_id]
    ELSE ARRAY[]::uuid[]
  END;

  IF TG_OP = 'UPDATE' THEN
    previous_assignee_ids := CASE
      WHEN COALESCE(cardinality(OLD.assignee_ids), 0) > 0 THEN OLD.assignee_ids
      WHEN OLD.assignee_id IS NOT NULL THEN ARRAY[OLD.assignee_id]
      ELSE ARRAY[]::uuid[]
    END;
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT candidate_id
    FROM unnest(current_assignee_ids) AS candidate_id
    WHERE candidate_id IS NOT NULL
      AND NOT candidate_id = ANY(previous_assignee_ids)
  )
  INTO added_assignee_ids;

  IF COALESCE(cardinality(added_assignee_ids), 0) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'tasky_project_url';

  SELECT decrypted_secret INTO publishable_key
  FROM vault.decrypted_secrets
  WHERE name = 'tasky_publishable_key';

  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'tasky_reminder_cron_secret';

  IF project_url IS NULL OR publishable_key IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'Task assignment email skipped because required Vault secrets are missing.';
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := project_url || '/functions/v1/send-task-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', publishable_key,
        'x-cron-secret', cron_secret
      ),
      body := jsonb_build_object(
        'task_id', NEW.id,
        'recipient_ids', to_jsonb(added_assignee_ids),
        'assigned_by_id', COALESCE(auth.uid(), NEW.creator_id),
        'notification_type', 'assignment'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Email transport must never prevent the task transaction from completing.
    RAISE WARNING 'Unable to queue assignment email for task %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_new_task_assignees() FROM PUBLIC;

CREATE TRIGGER notify_task_assignment
  AFTER INSERT OR UPDATE OF assignee_id, assignee_ids
  ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_task_assignees();
