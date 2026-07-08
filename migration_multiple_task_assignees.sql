-- =============================================
-- Migration: Allow multiple task assignees
-- =============================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assignee_ids uuid[] NOT NULL DEFAULT '{}';

-- Preserve every existing single assignment.
UPDATE public.tasks
SET assignee_ids = ARRAY[assignee_id]
WHERE assignee_id IS NOT NULL
  AND COALESCE(cardinality(assignee_ids), 0) = 0;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_ids
  ON public.tasks USING gin (assignee_ids);

-- Replace task access policies so every assignee has the same access.
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

-- Keep deleted users out of assignment and observer arrays.
CREATE OR REPLACE FUNCTION public.delete_user_entirely(target_user_id uuid)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = (SELECT auth.uid())
      AND role = 'Admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can erase users.';
  END IF;

  UPDATE public.tasks
  SET
    observers = array_remove(observers, target_user_id),
    assignee_ids = array_remove(assignee_ids, target_user_id)
  WHERE target_user_id = ANY(COALESCE(observers, ARRAY[]::uuid[]))
     OR target_user_id = ANY(COALESCE(assignee_ids, ARRAY[]::uuid[]));

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION public.delete_user_entirely(uuid) TO authenticated;
