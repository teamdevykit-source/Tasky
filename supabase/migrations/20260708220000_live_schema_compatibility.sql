-- =============================================
-- Migration: Bring live project schema in line with the app
-- =============================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assignee_ids uuid[] NOT NULL DEFAULT '{}';

UPDATE public.tasks
SET assignee_ids = ARRAY[assignee_id]
WHERE assignee_id IS NOT NULL
  AND COALESCE(cardinality(assignee_ids), 0) = 0;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_ids
  ON public.tasks USING gin (assignee_ids);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Medium';

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_priority_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('High', 'Medium', 'Low'));

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

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department text DEFAULT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_department_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_department_check
  CHECK (department IN ('Operations', 'Finance', 'Top Management') OR department IS NULL);

CREATE INDEX IF NOT EXISTS idx_profiles_department
  ON public.profiles (department)
  WHERE department IS NOT NULL;

CREATE OR REPLACE FUNCTION public.current_user_department()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profile.department
  FROM public.profiles AS profile
  WHERE profile.id = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.task_involves_top_management(
  task_creator_id uuid,
  task_assignee_id uuid,
  task_assignee_ids uuid[],
  task_observers uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.department = 'Top Management'
      AND (
        profile.id = task_creator_id
        OR profile.id = task_assignee_id
        OR profile.id = ANY(COALESCE(task_assignee_ids, ARRAY[]::uuid[]))
        OR profile.id = ANY(COALESCE(task_observers, ARRAY[]::uuid[]))
      )
  );
$$;

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

REVOKE ALL ON FUNCTION public.current_user_department() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.task_involves_top_management(uuid, uuid, uuid[], uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_task_reminders(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_department() TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_involves_top_management(uuid, uuid, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_task_reminders(integer) TO service_role;

DROP POLICY IF EXISTS "Users can view relevant tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update their tasks or Admins can update any task" ON public.tasks;
DROP POLICY IF EXISTS "View Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Update Tasks" ON public.tasks;

CREATE POLICY "View Tasks" ON public.tasks
  FOR SELECT
  USING (
    (
      COALESCE(is_self_task, false) = true
      AND (SELECT auth.uid()) = creator_id
    )
    OR
    (
      COALESCE(is_self_task, false) = false
      AND (
        COALESCE(assignee_ids, ARRAY[]::uuid[]) @> ARRAY[(SELECT auth.uid())]
        OR (SELECT auth.uid()) = assignee_id
        OR (SELECT auth.uid()) = creator_id
        OR (SELECT auth.uid()) = ANY(COALESCE(observers, ARRAY[]::uuid[]))
        OR EXISTS (
          SELECT 1
          FROM public.user_roles
          WHERE user_id = (SELECT auth.uid())
            AND role = 'Admin'
        )
        OR (
          (SELECT public.current_user_department()) IN ('Operations', 'Finance')
          AND NOT public.task_involves_top_management(
            creator_id,
            assignee_id,
            assignee_ids,
            observers
          )
        )
      )
    )
  );

CREATE POLICY "Update Tasks" ON public.tasks
  FOR UPDATE
  USING (
    (
      COALESCE(is_self_task, false) = true
      AND (SELECT auth.uid()) = creator_id
    )
    OR
    (
      COALESCE(is_self_task, false) = false
      AND (
        COALESCE(assignee_ids, ARRAY[]::uuid[]) @> ARRAY[(SELECT auth.uid())]
        OR (SELECT auth.uid()) = assignee_id
        OR (SELECT auth.uid()) = creator_id
        OR EXISTS (
          SELECT 1
          FROM public.user_roles
          WHERE user_id = (SELECT auth.uid())
            AND role = 'Admin'
        )
      )
    )
  );

NOTIFY pgrst, 'reload schema';
