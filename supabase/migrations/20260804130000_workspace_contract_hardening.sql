-- Repair accounts created before the canonical profile trigger was installed.
INSERT INTO public.profiles (id, email, full_name)
SELECT
  auth_user.id,
  auth_user.email,
  COALESCE(
    NULLIF(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(split_part(auth_user.email, '@', 1), ''),
    'User'
  )
FROM auth.users AS auth_user
LEFT JOIN public.profiles AS profile ON profile.id = auth_user.id
WHERE profile.id IS NULL
  AND auth_user.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT profile.id, 'Worker'
FROM public.profiles AS profile
LEFT JOIN public.user_roles AS user_role ON user_role.user_id = profile.id
WHERE user_role.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Keep the profile bootstrap policy fast and deterministic for multi-row work.
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
CREATE POLICY "Users can create their own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id = (SELECT auth.uid())
    AND email = COALESCE((SELECT auth.jwt()) ->> 'email', '')
    AND department IS NULL
  );

-- One canonical INSERT policy avoids overlapping role policies while preserving
-- self-bootstrap as Worker and administrator-managed role creation.
DROP POLICY IF EXISTS "Users can create their worker role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users and admins can insert roles" ON public.user_roles;
CREATE POLICY "Users and admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = (SELECT auth.uid()) AND role = 'Worker')
    OR public.is_admin((SELECT auth.uid()))
  );

-- Serialize administrator removals so concurrent role changes cannot leave the
-- workspace without an Admin account.
CREATE OR REPLACE FUNCTION public.protect_last_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  removes_admin boolean := false;
BEGIN
  IF OLD.role = 'Admin' THEN
    IF TG_OP = 'DELETE' THEN
      removes_admin := true;
    ELSE
      removes_admin := NEW.role IS DISTINCT FROM 'Admin';
    END IF;
  END IF;

  IF removes_admin THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('public.user_roles.last_admin', 0)
    );

    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE role = 'Admin'
        AND user_id <> OLD.user_id
    ) THEN
      RAISE EXCEPTION 'The workspace must retain at least one administrator.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_last_admin_role() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_last_admin_role ON public.user_roles;
CREATE TRIGGER protect_last_admin_role
  BEFORE UPDATE OF role OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_last_admin_role();

-- The legacy generator is retained for compatibility but is no longer a public
-- API. The Edge Function uses the claimed, idempotent recurrence workflow.
ALTER FUNCTION public.generate_recurring_tasks() SET search_path = '';

-- Supabase's project defaults granted new functions to API roles. Reset the
-- current public-schema functions, then grant only the application entry points.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_task_by_department(uuid, uuid[], uuid[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_next_report_run_in_timezone(
  text, time, integer, integer, text, timestamptz
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_category(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_category_and_clear(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_department(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_status(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_completed_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_status_and_reassign(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_entirely(uuid) TO authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- Existing rows were audited before this migration; make the constraints fully
-- validated so schema introspection and future changes see the real guarantees.
ALTER TABLE public.tasks VALIDATE CONSTRAINT tasks_date_order_check;
ALTER TABLE public.tasks VALIDATE CONSTRAINT tasks_recurrence_shape_check;
ALTER TABLE public.tasks VALIDATE CONSTRAINT tasks_reminder_before_end_check;
ALTER TABLE public.tasks VALIDATE CONSTRAINT tasks_reminder_has_assignee_check;
ALTER TABLE public.ticket_requests VALIDATE CONSTRAINT ticket_requests_date_order_check;
ALTER TABLE public.report_schedules VALIDATE CONSTRAINT report_schedule_shape_check;

NOTIFY pgrst, 'reload schema';
