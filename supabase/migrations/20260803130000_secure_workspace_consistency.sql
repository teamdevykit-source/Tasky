-- Consolidate authorization and workflow rules after years of additive SQL scripts.
-- PostgreSQL permissive RLS policies are ORed together, so every legacy policy
-- must be removed before the canonical policies below are installed.

CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS role_row
    WHERE role_row.user_id = $1
      AND role_row.role = 'Admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_task_by_department(
  task_creator_id uuid,
  task_assignee_ids uuid[],
  task_observers uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH viewer AS (
    SELECT profile.department
    FROM public.profiles AS profile
    WHERE profile.id = (SELECT auth.uid())
  )
  SELECT EXISTS (
    SELECT 1
    FROM viewer
    JOIN public.departments AS viewer_department
      ON viewer_department.name = viewer.department
    WHERE viewer_department.can_view_all_tasks = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.profiles AS participant
        JOIN public.departments AS participant_department
          ON participant_department.name = participant.department
        WHERE participant.id = ANY(
          array_remove(
            ARRAY[task_creator_id]
              || COALESCE(task_assignee_ids, ARRAY[]::uuid[])
              || COALESCE(task_observers, ARRAY[]::uuid[]),
            NULL
          )
        )
          AND participant.department IS DISTINCT FROM viewer.department
          AND participant_department.hide_tasks_from_other_departments = true
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_task_by_department(uuid, uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_task_by_department(uuid, uuid[], uuid[])
  TO authenticated, service_role;

-- Permissive PostgreSQL policies are combined with OR. Remove every policy on
-- the application tables, including unknown policies created outside this repo,
-- before installing the single canonical policy set below.
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY[
        'tasks', 'profiles', 'user_roles', 'categories', 'statuses',
        'departments', 'ticket_requests', 'report_schedules'
      ])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      policy_record.policyname,
      policy_record.tablename
    );
  END LOOP;
END;
$$;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View Tasks" ON public.tasks
  FOR SELECT
  TO authenticated
  USING (
    (COALESCE(is_self_task, false) = true AND creator_id = (SELECT auth.uid()))
    OR (
      COALESCE(is_self_task, false) = false
      AND (
        public.is_admin((SELECT auth.uid()))
        OR creator_id = (SELECT auth.uid())
        OR (SELECT auth.uid()) = ANY(COALESCE(assignee_ids, ARRAY[]::uuid[]))
        OR (SELECT auth.uid()) = ANY(COALESCE(observers, ARRAY[]::uuid[]))
        OR public.can_view_task_by_department(
          creator_id,
          COALESCE(assignee_ids, ARRAY[assignee_id]::uuid[]),
          observers
        )
      )
    )
  );

CREATE POLICY "Create Tasks" ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    creator_id = (SELECT auth.uid())
    AND (
      COALESCE(is_self_task, false) = true
      OR (
        public.is_admin((SELECT auth.uid()))
        AND (
          assignee_id IS NOT NULL
          OR COALESCE(cardinality(assignee_ids), 0) > 0
        )
      )
    )
  );

CREATE POLICY "Update Tasks" ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (
    creator_id = (SELECT auth.uid())
    OR (
      COALESCE(is_self_task, false) = false
      AND (
        public.is_admin((SELECT auth.uid()))
        OR (SELECT auth.uid()) = ANY(COALESCE(assignee_ids, ARRAY[]::uuid[]))
        OR (SELECT auth.uid()) = assignee_id
      )
    )
  )
  WITH CHECK (
    creator_id = (SELECT auth.uid())
    OR (
      COALESCE(is_self_task, false) = false
      AND (
        public.is_admin((SELECT auth.uid()))
        OR (SELECT auth.uid()) = ANY(COALESCE(assignee_ids, ARRAY[]::uuid[]))
        OR (SELECT auth.uid()) = assignee_id
      )
    )
  );

CREATE POLICY "Delete Tasks" ON public.tasks
  FOR DELETE
  TO authenticated
  USING (
    deleted_at IS NOT NULL
    AND (
      (COALESCE(is_self_task, false) = true AND creator_id = (SELECT auth.uid()))
      OR (COALESCE(is_self_task, false) = false AND public.is_admin((SELECT auth.uid())))
    )
  );

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_key timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_timezone text NOT NULL DEFAULT 'Africa/Cairo';

ALTER TABLE public.statuses
  ADD COLUMN IF NOT EXISTS is_completed boolean NOT NULL DEFAULT false;

-- RLS controls rows, while this trigger protects columns. Non-admin assignees
-- may update only the task status; creators retain edit access to their tasks.
CREATE OR REPLACE FUNCTION public.protect_task_update_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF actor_id IS NULL OR public.is_admin(actor_id) THEN
    RETURN NEW;
  END IF;

  IF OLD.creator_id = actor_id THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
      OR NEW.is_self_task IS DISTINCT FROM OLD.is_self_task
      OR NEW.parent_task_id IS DISTINCT FROM OLD.parent_task_id
      OR NEW.recurrence_claimed_at IS DISTINCT FROM OLD.recurrence_claimed_at
      OR NEW.recurrence_key IS DISTINCT FROM OLD.recurrence_key
      OR (
        NEW.deleted_at IS NOT NULL
        AND OLD.deleted_at IS NULL
        AND NEW.deleted_by IS DISTINCT FROM actor_id
      )
      OR (NEW.deleted_at IS NULL AND NEW.deleted_by IS NOT NULL)
    THEN
      RAISE EXCEPTION 'Task identity and system fields cannot be changed.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
    OR NEW.assignee_ids IS DISTINCT FROM OLD.assignee_ids
    OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
    OR NEW.priority IS DISTINCT FROM OLD.priority
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.observers IS DISTINCT FROM OLD.observers
    OR NEW.is_self_task IS DISTINCT FROM OLD.is_self_task
    OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date
    OR NEW.reminder_at IS DISTINCT FROM OLD.reminder_at
    OR NEW.reminder_sent_at IS DISTINCT FROM OLD.reminder_sent_at
    OR NEW.reminder_claimed_at IS DISTINCT FROM OLD.reminder_claimed_at
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
    OR NEW.is_recurring IS DISTINCT FROM OLD.is_recurring
    OR NEW.recurrence_type IS DISTINCT FROM OLD.recurrence_type
    OR NEW.recurrence_time IS DISTINCT FROM OLD.recurrence_time
    OR NEW.recurrence_day IS DISTINCT FROM OLD.recurrence_day
    OR NEW.next_recurrence_at IS DISTINCT FROM OLD.next_recurrence_at
    OR NEW.parent_task_id IS DISTINCT FROM OLD.parent_task_id
    OR NEW.recurrence_claimed_at IS DISTINCT FROM OLD.recurrence_claimed_at
    OR NEW.recurrence_key IS DISTINCT FROM OLD.recurrence_key
    OR NEW.recurrence_timezone IS DISTINCT FROM OLD.recurrence_timezone
  THEN
    RAISE EXCEPTION 'Assignees may only update task status.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_task_update_fields() FROM PUBLIC;
DROP TRIGGER IF EXISTS protect_task_update_fields ON public.tasks;
CREATE TRIGGER protect_task_update_fields
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_task_update_fields();

-- A user may edit their display fields but cannot promote themselves, alter
-- their identity, or move themselves into a privileged department.
CREATE OR REPLACE FUNCTION public.protect_profile_update_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF actor_id IS NULL OR public.is_admin(actor_id) THEN
    RETURN NEW;
  END IF;

  IF OLD.id <> actor_id THEN
    RAISE EXCEPTION 'Users may update only their own profile.' USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.department IS DISTINCT FROM OLD.department
  THEN
    RAISE EXCEPTION 'Identity and department fields are administrator-managed.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_update_fields() FROM PUBLIC;
DROP TRIGGER IF EXISTS protect_profile_update_fields ON public.profiles;
CREATE TRIGGER protect_profile_update_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_update_fields();

DROP POLICY IF EXISTS "Profiles are readable by all authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all other profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can read any profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete any profile" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create their own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (
    id = (SELECT auth.uid())
    AND email = COALESCE((SELECT auth.jwt() ->> 'email'), '')
    AND department IS NULL
  );
CREATE POLICY "Users and admins can update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())));
CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

-- Keep role values aligned with the application and remove overlapping role policies.
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check CHECK (role IN ('Admin', 'Worker'));

DROP POLICY IF EXISTS "Everyone can view user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage any role" ON public.user_roles;

CREATE POLICY "Authenticated users can view roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create their worker role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND role = 'Worker');
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Everyone can view categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Authenticated users can view categories" ON public.categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can update categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY "Admins can delete categories" ON public.categories
  FOR DELETE TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Everyone can view statuses" ON public.statuses;
DROP POLICY IF EXISTS "Admins can manage statuses" ON public.statuses;
CREATE POLICY "Authenticated users can view statuses" ON public.statuses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can update statuses" ON public.statuses
  FOR UPDATE TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY "Admins can delete statuses" ON public.statuses
  FOR DELETE TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

CREATE POLICY "Authenticated users can view departments" ON public.departments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can update departments" ON public.departments
  FOR UPDATE TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY "Admins can delete departments" ON public.departments
  FOR DELETE TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

-- Allocate display order under a transaction-scoped lock so simultaneous
-- administrators cannot create rows with the same position.
CREATE OR REPLACE FUNCTION public.create_category(category_name text, category_color text)
RETURNS public.categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  created_row public.categories;
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Only administrators can create categories.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(category_name), '') IS NULL THEN
    RAISE EXCEPTION 'Category name is required.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('category-sort-order', 0));
  INSERT INTO public.categories (name, color, sort_order)
  SELECT btrim(category_name), category_color, COALESCE(MAX(sort_order), -1) + 1
  FROM public.categories
  RETURNING * INTO created_row;
  RETURN created_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_status(status_name text, status_color text)
RETURNS public.statuses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  created_row public.statuses;
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Only administrators can create statuses.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(status_name), '') IS NULL THEN
    RAISE EXCEPTION 'Status name is required.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('status-sort-order', 0));
  INSERT INTO public.statuses (name, color, sort_order, is_completed)
  SELECT btrim(status_name), status_color, COALESCE(MAX(sort_order), -1) + 1, false
  FROM public.statuses
  RETURNING * INTO created_row;
  RETURN created_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_department(department_name text, department_color text)
RETURNS public.departments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  created_row public.departments;
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Only administrators can create departments.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(department_name), '') IS NULL THEN
    RAISE EXCEPTION 'Department name is required.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('department-sort-order', 0));
  INSERT INTO public.departments (name, color, sort_order)
  SELECT btrim(department_name), department_color, COALESCE(MAX(sort_order), -1) + 1
  FROM public.departments
  RETURNING * INTO created_row;
  RETURN created_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_category(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_status(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_department(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_category(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_status(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_department(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(COALESCE(NEW.email, ''), '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'Worker')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP POLICY IF EXISTS "Users can view their ticket requests" ON public.ticket_requests;
CREATE POLICY "Users can view their ticket requests"
  ON public.ticket_requests
  FOR SELECT TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );
CREATE POLICY "Users can create their ticket requests"
  ON public.ticket_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin((SELECT auth.uid()))
    OR (
      requester_id = (SELECT auth.uid())
      AND status = 'Open'
    )
  );
CREATE POLICY "Admins can update ticket requests"
  ON public.ticket_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY "Admins can delete ticket requests"
  ON public.ticket_requests
  FOR DELETE TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

ALTER TABLE public.ticket_requests DROP CONSTRAINT IF EXISTS ticket_requests_date_order_check;
ALTER TABLE public.ticket_requests
  ADD COLUMN IF NOT EXISTS linked_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;
ALTER TABLE public.ticket_requests
  ADD CONSTRAINT ticket_requests_date_order_check
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date) NOT VALID;

CREATE OR REPLACE FUNCTION public.create_task_from_approved_ticket()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  initial_status text;
BEGIN
  IF NEW.status = 'Approved'
    AND OLD.status IS DISTINCT FROM 'Approved'
    AND NEW.linked_task_id IS NULL
  THEN
    SELECT name INTO initial_status
    FROM public.statuses
    WHERE is_completed = false
    ORDER BY sort_order, name
    LIMIT 1;

    IF initial_status IS NULL THEN
      RAISE EXCEPTION 'A non-completed task status is required before approving tickets.';
    END IF;

    INSERT INTO public.tasks (
      title, description, assignee_id, assignee_ids, creator_id, status,
      priority, category, observers, is_self_task, start_date, end_date
    ) VALUES (
      NEW.title,
      COALESCE(NEW.description, ''),
      NEW.requester_id,
      ARRAY[NEW.requester_id],
      (SELECT auth.uid()),
      initial_status,
      NEW.priority,
      NEW.category,
      ARRAY[]::uuid[],
      false,
      NEW.start_date,
      NEW.end_date
    )
    RETURNING id INTO NEW.linked_task_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_task_from_approved_ticket ON public.ticket_requests;
CREATE TRIGGER create_task_from_approved_ticket
  BEFORE UPDATE OF status ON public.ticket_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.create_task_from_approved_ticket();

ALTER TABLE public.report_schedules DROP CONSTRAINT IF EXISTS report_schedule_shape_check;
ALTER TABLE public.report_schedules
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Cairo',
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.report_schedules
  ADD CONSTRAINT report_schedule_shape_check CHECK (
    (schedule_type = 'daily' AND day_of_week IS NULL AND day_of_month IS NULL)
    OR (schedule_type = 'weekly' AND day_of_week IS NOT NULL AND day_of_month IS NULL)
    OR (schedule_type = 'monthly' AND day_of_week IS NULL AND day_of_month IS NOT NULL)
  ) NOT VALID;

CREATE POLICY "Admins can manage report schedules" ON public.report_schedules
  FOR ALL TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.compute_next_report_run_in_timezone(
  schedule_type text,
  time_of_day time,
  day_of_week integer,
  day_of_month integer,
  schedule_timezone text,
  after timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  local_after timestamp;
  candidate timestamp;
  month_start date;
  safe_month_day integer;
BEGIN
  local_after := after AT TIME ZONE schedule_timezone;
  candidate := date_trunc('day', local_after) + time_of_day;

  IF schedule_type = 'daily' THEN
    IF candidate <= local_after THEN candidate := candidate + interval '1 day'; END IF;
  ELSIF schedule_type = 'weekly' THEN
    WHILE EXTRACT(DOW FROM candidate)::integer <> day_of_week
      OR candidate <= local_after
    LOOP
      candidate := candidate + interval '1 day';
    END LOOP;
  ELSE
    month_start := date_trunc('month', local_after)::date;
    safe_month_day := LEAST(
      day_of_month,
      EXTRACT(DAY FROM (month_start + interval '1 month - 1 day'))::integer
    );
    candidate := make_date(
      EXTRACT(YEAR FROM month_start)::integer,
      EXTRACT(MONTH FROM month_start)::integer,
      safe_month_day
    ) + time_of_day;
    IF candidate <= local_after THEN
      month_start := (month_start + interval '1 month')::date;
      safe_month_day := LEAST(
        day_of_month,
        EXTRACT(DAY FROM (month_start + interval '1 month - 1 day'))::integer
      );
      candidate := make_date(
        EXTRACT(YEAR FROM month_start)::integer,
        EXTRACT(MONTH FROM month_start)::integer,
        safe_month_day
      ) + time_of_day;
    END IF;
  END IF;

  RETURN candidate AT TIME ZONE schedule_timezone;
EXCEPTION WHEN invalid_parameter_value THEN
  RAISE EXCEPTION 'Unknown report timezone: %', schedule_timezone USING ERRCODE = '22023';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_report_schedule_next_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.next_run_at := public.compute_next_report_run_in_timezone(
    NEW.schedule_type,
    NEW.time_of_day,
    NEW.day_of_week,
    NEW.day_of_month,
    NEW.timezone,
    now()
  );
  NEW.claimed_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_report_schedule_next_run ON public.report_schedules;
CREATE TRIGGER set_report_schedule_next_run
  BEFORE INSERT OR UPDATE OF schedule_type, time_of_day, day_of_week, day_of_month, timezone
  ON public.report_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_report_schedule_next_run();

REVOKE ALL ON FUNCTION public.compute_next_report_run_in_timezone(
  text, time, integer, integer, text, timestamptz
) FROM PUBLIC;

WITH chosen_status AS (
  SELECT id
  FROM public.statuses
  ORDER BY
    CASE
      WHEN is_completed = true THEN 0
      WHEN lower(name) IN ('done', 'completed', 'complete') THEN 1
      ELSE 2
    END,
    sort_order DESC,
    name
  LIMIT 1
)
UPDATE public.statuses
SET is_completed = (id = (SELECT id FROM chosen_status))
WHERE EXISTS (SELECT 1 FROM chosen_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_statuses_single_completed
  ON public.statuses (is_completed)
  WHERE is_completed = true;

CREATE OR REPLACE FUNCTION public.status_is_complete(status_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.statuses
    WHERE name = status_name AND is_completed = true
  );
$$;

REVOKE ALL ON FUNCTION public.status_is_complete(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.status_is_complete(text) TO authenticated, service_role;

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
      AND COALESCE(due_task.is_recurring, false) = false
      AND due_task.reminder_at IS NOT NULL
      AND due_task.reminder_at <= now()
      AND due_task.reminder_sent_at IS NULL
      AND NOT public.status_is_complete(due_task.status)
      AND (
        due_task.reminder_claimed_at IS NULL
        OR due_task.reminder_claimed_at < now() - interval '10 minutes'
      )
    ORDER BY due_task.reminder_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(COALESCE(batch_size, 100), 1)
  )
  RETURNING task.*;
$$;

REVOKE ALL ON FUNCTION public.claim_due_task_reminders(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_task_reminders(integer) TO service_role;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_key timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_timezone text NOT NULL DEFAULT 'Africa/Cairo';

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_recurrence_shape_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_recurrence_shape_check CHECK (
  COALESCE(is_recurring, false) = false
  OR (
    recurrence_type IN ('daily', 'weekly', 'monthly')
    AND recurrence_time IS NOT NULL
    AND next_recurrence_at IS NOT NULL
    AND (
      (recurrence_type = 'daily' AND recurrence_day IS NULL)
      OR (recurrence_type = 'weekly' AND recurrence_day BETWEEN 0 AND 6)
      OR (recurrence_type = 'monthly' AND recurrence_day BETWEEN 1 AND 31)
    )
  )
) NOT VALID;

CREATE OR REPLACE FUNCTION public.compute_next_task_recurrence(
  recurrence_type text,
  recurrence_time time,
  recurrence_day integer,
  recurrence_timezone text,
  after timestamptz
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT public.compute_next_report_run_in_timezone(
    recurrence_type,
    recurrence_time,
    CASE WHEN recurrence_type = 'weekly' THEN recurrence_day ELSE NULL END,
    CASE WHEN recurrence_type = 'monthly' THEN recurrence_day ELSE NULL END,
    recurrence_timezone,
    after
  );
$$;

REVOKE ALL ON FUNCTION public.compute_next_task_recurrence(text, time, integer, text, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_next_task_recurrence(text, time, integer, text, timestamptz)
  TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_unique_recurrence_occurrence
  ON public.tasks (parent_task_id, recurrence_key)
  WHERE parent_task_id IS NOT NULL AND recurrence_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_due_recurring_tasks(batch_size integer DEFAULT 50)
RETURNS SETOF public.tasks
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.tasks AS task
  SET recurrence_claimed_at = now()
  WHERE task.id IN (
    SELECT due.id
    FROM public.tasks AS due
    WHERE due.deleted_at IS NULL
      AND due.is_recurring = true
      AND due.parent_task_id IS NULL
      AND due.next_recurrence_at IS NOT NULL
      AND due.next_recurrence_at <= now()
      AND (
        due.recurrence_claimed_at IS NULL
        OR due.recurrence_claimed_at < now() - interval '10 minutes'
      )
    ORDER BY due.next_recurrence_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(COALESCE(batch_size, 50), 1)
  )
  RETURNING task.*;
$$;

CREATE OR REPLACE FUNCTION public.complete_recurring_task_claim(
  template_id uuid,
  claimed_occurrence_at timestamptz,
  following_recurrence_at timestamptz
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH updated AS (
    UPDATE public.tasks
    SET next_recurrence_at = following_recurrence_at,
        recurrence_claimed_at = NULL
    WHERE id = template_id
      AND next_recurrence_at = claimed_occurrence_at
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

CREATE OR REPLACE FUNCTION public.release_recurring_task_claim(template_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.tasks SET recurrence_claimed_at = NULL WHERE id = template_id;
$$;

REVOKE ALL ON FUNCTION public.claim_due_recurring_tasks(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_recurring_task_claim(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_recurring_task_claim(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_recurring_tasks(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_recurring_task_claim(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_recurring_task_claim(uuid) TO service_role;

ALTER TABLE public.report_schedules
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_due_report_schedules(batch_size integer DEFAULT 10)
RETURNS SETOF public.report_schedules
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.report_schedules AS schedule
  SET claimed_at = now()
  WHERE schedule.id IN (
    SELECT due.id
    FROM public.report_schedules AS due
    WHERE due.is_active = true
      AND due.next_run_at <= now()
      AND (due.claimed_at IS NULL OR due.claimed_at < now() - interval '15 minutes')
    ORDER BY due.next_run_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(COALESCE(batch_size, 10), 1)
  )
  RETURNING schedule.*;
$$;

CREATE OR REPLACE FUNCTION public.complete_report_schedule_claim(
  schedule_id uuid,
  delivery_succeeded boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF delivery_succeeded THEN
    UPDATE public.report_schedules AS schedule
    SET next_run_at = public.compute_next_report_run_in_timezone(
          schedule.schedule_type,
          schedule.time_of_day,
          schedule.day_of_week,
          schedule.day_of_month,
          schedule.timezone,
          now()
        ),
        last_run_at = now(),
        claimed_at = NULL
    WHERE schedule.id = schedule_id;
  ELSE
    UPDATE public.report_schedules SET claimed_at = NULL WHERE id = schedule_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_report_schedules(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_report_schedule_claim(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_report_schedules(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_report_schedule_claim(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_status_and_reassign(
  target_status_id uuid,
  replacement_status_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_name text;
  replacement_name text;
  old_is_completed boolean;
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Only administrators can delete statuses.' USING ERRCODE = '42501';
  END IF;

  SELECT name, is_completed INTO old_name, old_is_completed
  FROM public.statuses WHERE id = target_status_id FOR UPDATE;
  IF old_name IS NULL THEN
    RAISE EXCEPTION 'Status not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT name INTO replacement_name
  FROM public.statuses
  WHERE id = COALESCE(
    replacement_status_id,
    (SELECT id FROM public.statuses WHERE id <> target_status_id ORDER BY sort_order, name LIMIT 1)
  )
    AND id <> target_status_id;

  IF replacement_name IS NULL THEN
    RAISE EXCEPTION 'Create another status before deleting the only status.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.tasks SET status = replacement_name WHERE status = old_name;
  IF old_is_completed THEN
    UPDATE public.statuses SET is_completed = false WHERE id = target_status_id;
    UPDATE public.statuses SET is_completed = true WHERE name = replacement_name;
  END IF;
  DELETE FROM public.statuses WHERE id = target_status_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_status_and_reassign(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_status_and_reassign(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_completed_status(target_status_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Only administrators can configure statuses.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE id = target_status_id) THEN
    RAISE EXCEPTION 'Status not found.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.statuses SET is_completed = false WHERE is_completed = true;
  UPDATE public.statuses SET is_completed = true WHERE id = target_status_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_completed_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_completed_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_category_and_clear(target_category_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_name text;
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Only administrators can delete categories.' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO old_name FROM public.categories WHERE id = target_category_id FOR UPDATE;
  IF old_name IS NULL THEN
    RAISE EXCEPTION 'Category not found.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.tasks SET category = NULL WHERE category = old_name;
  UPDATE public.ticket_requests SET category = NULL WHERE category = old_name;
  DELETE FROM public.categories WHERE id = target_category_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_category_and_clear(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_category_and_clear(uuid) TO authenticated;

-- Normalize assignment arrays and remove references to accounts that no longer exist.
UPDATE public.tasks AS task
SET assignee_ids = ARRAY(
  SELECT DISTINCT assignee_id_value
  FROM unnest(COALESCE(task.assignee_ids, ARRAY[]::uuid[])) AS assignee_id_value
  JOIN public.profiles AS profile ON profile.id = assignee_id_value
)
WHERE EXISTS (
  SELECT 1
  FROM unnest(COALESCE(task.assignee_ids, ARRAY[]::uuid[])) AS assignee_id_value
  LEFT JOIN public.profiles AS profile ON profile.id = assignee_id_value
  WHERE profile.id IS NULL
);

UPDATE public.tasks
SET assignee_id = CASE
  WHEN COALESCE(cardinality(assignee_ids), 0) > 0 THEN assignee_ids[1]
  ELSE NULL
END
WHERE assignee_id IS DISTINCT FROM CASE
  WHEN COALESCE(cardinality(assignee_ids), 0) > 0 THEN assignee_ids[1]
  ELSE NULL
END;

CREATE OR REPLACE FUNCTION public.sync_task_assignees()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.assignee_ids := ARRAY(
    SELECT DISTINCT candidate
    FROM unnest(
      COALESCE(NEW.assignee_ids, ARRAY[]::uuid[])
      || CASE WHEN NEW.assignee_id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[NEW.assignee_id] END
    ) AS candidate
    WHERE candidate IS NOT NULL
  );
  NEW.assignee_id := CASE
    WHEN cardinality(NEW.assignee_ids) > 0 THEN NEW.assignee_ids[1]
    ELSE NULL
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_task_assignees ON public.tasks;
CREATE TRIGGER sync_task_assignees
  BEFORE INSERT OR UPDATE OF assignee_id, assignee_ids ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_task_assignees();

-- Deleting a user removes their private work, removes them from public task
-- participation, and then removes the Auth account. Public tasks remain for audit.
CREATE OR REPLACE FUNCTION public.delete_user_entirely(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Only administrators can delete users.' USING ERRCODE = '42501';
  END IF;
  IF target_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Administrators cannot delete their own account.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.tasks
  WHERE creator_id = target_user_id
    AND COALESCE(is_self_task, false) = true;

  UPDATE public.tasks
  SET observers = array_remove(COALESCE(observers, ARRAY[]::uuid[]), target_user_id),
      assignee_ids = CASE
        WHEN COALESCE(is_self_task, false) = false
          AND cardinality(
            array_remove(COALESCE(assignee_ids, ARRAY[]::uuid[]), target_user_id)
          ) = 0
        THEN ARRAY[COALESCE(NULLIF(creator_id, target_user_id), (SELECT auth.uid()))]
        ELSE array_remove(COALESCE(assignee_ids, ARRAY[]::uuid[]), target_user_id)
      END,
      assignee_id = CASE
        WHEN COALESCE(is_self_task, false) = false
          AND cardinality(
            array_remove(COALESCE(assignee_ids, ARRAY[]::uuid[]), target_user_id)
          ) = 0
        THEN COALESCE(NULLIF(creator_id, target_user_id), (SELECT auth.uid()))
        WHEN assignee_id = target_user_id THEN (
          array_remove(COALESCE(assignee_ids, ARRAY[]::uuid[]), target_user_id)
        )[1]
        ELSE assignee_id
      END
  WHERE target_user_id = ANY(COALESCE(observers, ARRAY[]::uuid[]))
     OR target_user_id = ANY(COALESCE(assignee_ids, ARRAY[]::uuid[]))
     OR assignee_id = target_user_id;

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_entirely(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_entirely(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_tasks_creator_id ON public.tasks (creator_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON public.tasks (assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_by ON public.tasks (deleted_by);
CREATE INDEX IF NOT EXISTS idx_tasks_observers ON public.tasks USING gin (observers);
CREATE INDEX IF NOT EXISTS idx_report_schedules_created_by ON public.report_schedules (created_by);

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  actor_id uuid NOT NULL,
  action_key text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (actor_id, action_key)
);

REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  actor_id uuid,
  action_key text,
  max_attempts integer,
  window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_count integer;
BEGIN
  IF actor_id IS NULL OR max_attempts < 1 OR window_seconds < 1 THEN
    RETURN false;
  END IF;

  INSERT INTO public.api_rate_limits AS rate_limit (
    actor_id, action_key, window_started_at, attempt_count
  ) VALUES (
    actor_id, action_key, now(), 1
  )
  ON CONFLICT (actor_id, action_key) DO UPDATE
  SET window_started_at = CASE
        WHEN rate_limit.window_started_at <= now() - make_interval(secs => window_seconds)
          THEN now()
        ELSE rate_limit.window_started_at
      END,
      attempt_count = CASE
        WHEN rate_limit.window_started_at <= now() - make_interval(secs => window_seconds)
          THEN 1
        ELSE rate_limit.attempt_count + 1
      END
  RETURNING attempt_count INTO current_count;

  RETURN current_count <= max_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(uuid, text, integer, integer) TO service_role;

-- Realtime is additive. Never drop and recreate the shared publication.
DO $$
DECLARE
  table_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH table_name IN ARRAY ARRAY[
      'tasks', 'profiles', 'user_roles', 'categories', 'statuses',
      'departments', 'ticket_requests', 'report_schedules'
    ] LOOP
      IF to_regclass('public.' || table_name) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime'
            AND schemaname = 'public'
            AND tablename = table_name
        )
      THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
      END IF;
    END LOOP;
  END IF;
END;
$$;

ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.ticket_requests REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
