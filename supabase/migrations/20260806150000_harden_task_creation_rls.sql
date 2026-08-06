-- Keep task creation authorization consistent with the two application roles.
-- The helper is SECURITY DEFINER so task policies do not depend on user_roles RLS.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role_row.role
  FROM public.user_roles AS role_row
  WHERE role_row.user_id = (SELECT auth.uid())
    AND role_row.role IN ('Admin', 'Worker')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;

DROP POLICY IF EXISTS "Create Tasks" ON public.tasks;
CREATE POLICY "Create Tasks" ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    creator_id = (SELECT auth.uid())
    AND (
      assignee_id IS NOT NULL
      OR COALESCE(cardinality(assignee_ids), 0) > 0
    )
    AND (
      public.current_user_role() = 'Admin'
      OR (
        public.current_user_role() = 'Worker'
        AND COALESCE(is_self_task, false) = true
        AND assignee_id = (SELECT auth.uid())
        AND COALESCE(assignee_ids, ARRAY[assignee_id]::uuid[])
          <@ ARRAY[(SELECT auth.uid())]::uuid[]
        AND COALESCE(cardinality(observers), 0) = 0
      )
    )
  );

-- RLS does not protect TRUNCATE. Remove broad default grants and expose only
-- the table operations used by the browser application; policies still decide
-- which rows each authenticated user may access.
REVOKE ALL ON TABLE
  public.tasks,
  public.profiles,
  public.user_roles,
  public.categories,
  public.statuses,
  public.departments,
  public.ticket_requests,
  public.report_schedules
FROM anon;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.tasks,
  public.profiles,
  public.user_roles,
  public.categories,
  public.statuses,
  public.departments,
  public.ticket_requests,
  public.report_schedules
FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.categories TO authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.statuses TO authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.departments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ticket_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.report_schedules TO authenticated;

NOTIFY pgrst, 'reload schema';
