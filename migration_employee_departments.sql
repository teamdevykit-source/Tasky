-- =============================================
-- Migration: Employee departments and task visibility
-- =============================================

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

REVOKE ALL ON FUNCTION public.current_user_department() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.task_involves_top_management(uuid, uuid, uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_department() TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_involves_top_management(uuid, uuid, uuid[], uuid[]) TO authenticated;

DROP POLICY IF EXISTS "Users can view relevant tasks" ON public.tasks;
DROP POLICY IF EXISTS "View Tasks" ON public.tasks;

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
        -- Direct participants always retain access to their own work.
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
