-- =============================================
-- Rollback: migration_report_schedules.sql
-- =============================================

DROP POLICY IF EXISTS "Admins can manage report schedules" ON public.report_schedules;

ALTER TABLE public.report_schedules DISABLE ROW LEVEL SECURITY;

REVOKE EXECUTE ON FUNCTION public.claim_due_report_schedules(integer) FROM service_role;

DROP FUNCTION IF EXISTS public.claim_due_report_schedules(integer);

DROP TRIGGER IF EXISTS set_report_schedule_next_run ON public.report_schedules;

DROP FUNCTION IF EXISTS public.set_report_schedule_next_run();

DROP FUNCTION IF EXISTS public.compute_next_report_run(text, time, int, int, timestamptz);

DROP INDEX IF EXISTS idx_report_schedules_next_run;

DROP TABLE IF EXISTS public.report_schedules;
