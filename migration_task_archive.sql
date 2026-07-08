-- =============================================
-- Migration: Recoverable task archive
-- =============================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid DEFAULT NULL;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_deleted_by_fkey;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_deleted_by_fkey
  FOREIGN KEY (deleted_by)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_archive_deleted_at
  ON public.tasks (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- Keep archived tasks out of the scheduled email reminder queue.
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
    WHERE due_task.deleted_at IS NULL
      AND due_task.reminder_at IS NOT NULL
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
