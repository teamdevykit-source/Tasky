-- =============================================
-- Migration: Scheduled task email reminders
-- =============================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS reminder_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reminder_claimed_at timestamptz DEFAULT NULL;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_date_order_check,
  DROP CONSTRAINT IF EXISTS tasks_reminder_before_end_check,
  DROP CONSTRAINT IF EXISTS tasks_reminder_has_assignee_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_date_order_check
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
    NOT VALID,
  ADD CONSTRAINT tasks_reminder_before_end_check
    CHECK (
      reminder_at IS NULL
      OR (end_date IS NOT NULL AND reminder_at <= end_date)
    )
    NOT VALID,
  ADD CONSTRAINT tasks_reminder_has_assignee_check
    CHECK (
      reminder_at IS NULL
      OR assignee_id IS NOT NULL
      OR COALESCE(cardinality(assignee_ids), 0) > 0
    )
    NOT VALID;

CREATE INDEX IF NOT EXISTS idx_tasks_due_email_reminders
  ON public.tasks (reminder_at)
  WHERE reminder_at IS NOT NULL
    AND reminder_sent_at IS NULL;

-- Atomically claim due reminders so overlapping cron runs cannot send duplicates.
CREATE OR REPLACE FUNCTION public.claim_due_task_reminders(batch_size integer DEFAULT 100)
RETURNS SETOF public.tasks
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.tasks AS task
  SET reminder_claimed_at = now()
  WHERE task.id IN (
    SELECT due_task.id
    FROM public.tasks AS due_task
    WHERE due_task.reminder_at IS NOT NULL
      AND due_task.reminder_at <= now()
      AND due_task.reminder_sent_at IS NULL
      AND due_task.status <> 'Done'
      AND (
        due_task.reminder_claimed_at IS NULL
        OR due_task.reminder_claimed_at < now() - interval '10 minutes'
      )
    ORDER BY due_task.reminder_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(batch_size, 1)
  )
  RETURNING task.*;
$$;

REVOKE ALL ON FUNCTION public.claim_due_task_reminders(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_task_reminders(integer) TO service_role;
