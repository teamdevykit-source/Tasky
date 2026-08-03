-- Legacy convenience script retained for operators who run it manually.
-- Realtime publication changes must be additive; never drop the shared publication.
DO $$
DECLARE
  table_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'Supabase Realtime publication does not exist.';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'tasks', 'profiles', 'user_roles', 'categories', 'statuses',
    'departments', 'ticket_requests', 'report_schedules'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.tasks REPLICA IDENTITY FULL;
