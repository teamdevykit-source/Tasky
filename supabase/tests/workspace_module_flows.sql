BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE authenticated;

DO $audit$
DECLARE
  admin_id uuid;
  worker_id uuid;
  other_admin_ids uuid[];
  initial_status text;
  category_id uuid;
  department_id uuid;
  status_id uuid;
  task_id uuid;
  recurring_task_id uuid;
  self_task_id uuid;
  ticket_id uuid;
  schedule_id uuid;
  approved_task_id uuid;
BEGIN
  SELECT role.user_id
  INTO admin_id
  FROM public.user_roles AS role
  JOIN public.profiles AS profile ON profile.id = role.user_id
  WHERE role.role = 'Admin'
  ORDER BY role.created_at, role.user_id
  LIMIT 1;

  SELECT role.user_id
  INTO worker_id
  FROM public.user_roles AS role
  JOIN public.profiles AS profile ON profile.id = role.user_id
  WHERE role.role = 'Worker'
  ORDER BY role.created_at, role.user_id
  LIMIT 1;

  SELECT name
  INTO initial_status
  FROM public.statuses
  WHERE is_completed = false
  ORDER BY sort_order, name
  LIMIT 1;

  IF admin_id IS NULL OR worker_id IS NULL OR initial_status IS NULL THEN
    RAISE EXCEPTION 'The audit requires an Admin, a Worker, and a non-completed status.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles WHERE role NOT IN ('Admin', 'Worker')
  ) THEN
    RAISE EXCEPTION 'An unsupported workspace role exists.';
  END IF;

  IF has_table_privilege('anon', 'public.tasks', 'INSERT')
    OR has_table_privilege('anon', 'public.tasks', 'TRUNCATE')
    OR has_table_privilege('authenticated', 'public.tasks', 'TRUNCATE')
  THEN
    RAISE EXCEPTION 'Task table grants exceed the application role contract.';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin_id::text, 'role', 'authenticated')::text,
    true
  );

  IF public.current_user_role() IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'The current Admin role could not be resolved.';
  END IF;

  SELECT id INTO category_id
  FROM public.create_category('__audit_category__', '#64748b');

  SELECT id INTO department_id
  FROM public.create_department('__audit_department__', '#64748b');

  UPDATE public.departments
  SET can_view_all_tasks = true,
      hide_tasks_from_other_departments = false
  WHERE id = department_id;

  SELECT id INTO status_id
  FROM public.create_status('__audit_status__', '#64748b');

  INSERT INTO public.tasks (
    title,
    description,
    assignee_id,
    assignee_ids,
    creator_id,
    status,
    priority,
    category,
    observers,
    is_self_task
  ) VALUES (
    '__audit_public_task__',
    'Rollback-only workspace audit',
    worker_id,
    ARRAY[worker_id],
    admin_id,
    initial_status,
    'Medium',
    '__audit_category__',
    ARRAY[admin_id],
    false
  )
  RETURNING id INTO task_id;

  UPDATE public.tasks
  SET priority = 'High',
      reminder_at = now() + interval '30 minutes',
      end_date = now() + interval '1 hour'
  WHERE id = task_id;

  UPDATE public.tasks
  SET deleted_at = now(),
      deleted_by = admin_id,
      reminder_claimed_at = NULL
  WHERE id = task_id;

  UPDATE public.tasks
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE id = task_id;

  INSERT INTO public.tasks (
    title,
    description,
    assignee_id,
    assignee_ids,
    creator_id,
    status,
    priority,
    observers,
    is_self_task,
    is_recurring,
    recurrence_type,
    recurrence_time,
    recurrence_timezone,
    next_recurrence_at
  ) VALUES (
    '__audit_recurring_task__',
    'Rollback-only recurrence audit',
    worker_id,
    ARRAY[worker_id],
    admin_id,
    initial_status,
    'Low',
    ARRAY[]::uuid[],
    false,
    true,
    'daily',
    '09:00',
    'Africa/Cairo',
    now() + interval '1 day'
  )
  RETURNING id INTO recurring_task_id;

  INSERT INTO public.report_schedules (
    created_by,
    schedule_type,
    time_of_day,
    day_of_week,
    day_of_month,
    timezone
  ) VALUES (
    admin_id,
    'daily',
    '09:00',
    NULL,
    NULL,
    'Africa/Cairo'
  )
  RETURNING id INTO schedule_id;

  DELETE FROM public.report_schedules WHERE id = schedule_id;

  UPDATE public.user_roles SET role = 'Worker' WHERE user_id = worker_id;
  PERFORM public.delete_user_entirely(gen_random_uuid());

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', worker_id::text, 'role', 'authenticated')::text,
    true
  );

  IF public.current_user_role() IS DISTINCT FROM 'Worker' THEN
    RAISE EXCEPTION 'The current Worker role could not be resolved.';
  END IF;

  INSERT INTO public.tasks (
    title,
    description,
    assignee_id,
    assignee_ids,
    creator_id,
    status,
    priority,
    observers,
    is_self_task
  ) VALUES (
    '__audit_self_task__',
    'Rollback-only private-task audit',
    worker_id,
    ARRAY[worker_id],
    worker_id,
    initial_status,
    'Medium',
    ARRAY[]::uuid[],
    true
  )
  RETURNING id INTO self_task_id;

  UPDATE public.tasks SET status = initial_status WHERE id = self_task_id;
  UPDATE public.tasks SET deleted_at = now(), deleted_by = worker_id WHERE id = self_task_id;
  DELETE FROM public.tasks WHERE id = self_task_id;

  BEGIN
    INSERT INTO public.tasks (
      title,
      description,
      assignee_id,
      assignee_ids,
      creator_id,
      status,
      priority,
      observers,
      is_self_task
    ) VALUES (
      '__audit_forbidden_public_task__',
      '',
      worker_id,
      ARRAY[worker_id],
      worker_id,
      initial_status,
      'Medium',
      ARRAY[]::uuid[],
      false
    );
    RAISE EXCEPTION 'A Worker unexpectedly created a public task.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO public.ticket_requests (
    requester_id,
    title,
    description,
    priority,
    category,
    status
  ) VALUES (
    worker_id,
    '__audit_ticket__',
    'Rollback-only ticket audit',
    'Medium',
    '__audit_category__',
    'Open'
  )
  RETURNING id INTO ticket_id;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin_id::text, 'role', 'authenticated')::text,
    true
  );

  UPDATE public.ticket_requests AS ticket
  SET status = 'Approved'
  WHERE ticket.id = ticket_id
  RETURNING ticket.linked_task_id INTO approved_task_id;

  IF approved_task_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tasks WHERE id = approved_task_id
  ) THEN
    RAISE EXCEPTION 'Ticket approval did not create its linked task.';
  END IF;

  PERFORM public.set_completed_status(status_id);
  PERFORM public.delete_status_and_reassign(status_id, NULL);
  PERFORM public.delete_category_and_clear(category_id);
  DELETE FROM public.departments WHERE id = department_id;

  SELECT array_agg(role.user_id ORDER BY role.user_id)
  INTO other_admin_ids
  FROM public.user_roles AS role
  WHERE role.role = 'Admin'
    AND role.user_id <> admin_id;

  IF COALESCE(cardinality(other_admin_ids), 0) > 0 THEN
    UPDATE public.user_roles
    SET role = 'Worker'
    WHERE user_id = ANY(other_admin_ids);
  END IF;

  BEGIN
    UPDATE public.user_roles SET role = 'Worker' WHERE user_id = admin_id;
    RAISE EXCEPTION 'The final administrator was unexpectedly demoted.';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

END;
$audit$;

RESET ROLE;
SET LOCAL ROLE service_role;

DO $service_audit$
DECLARE
  audit_id uuid := gen_random_uuid();
BEGIN
  PERFORM public.consume_api_rate_limit(audit_id, '__workspace_audit__', 1, 60);
  PERFORM public.compute_next_task_recurrence(
    'daily',
    '09:00',
    NULL,
    'Africa/Cairo',
    now()
  );
  PERFORM public.complete_recurring_task_claim(audit_id, now(), now() + interval '1 day');
  PERFORM public.release_recurring_task_claim(audit_id);
  PERFORM public.complete_report_schedule_claim(audit_id, false);

  IF NOT has_function_privilege(
    current_user,
    'public.claim_due_task_reminders(integer)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    current_user,
    'public.claim_due_recurring_tasks(integer)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    current_user,
    'public.claim_due_report_schedules(integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'The service role cannot execute one or more claim functions.';
  END IF;
END;
$service_audit$;

ROLLBACK;
