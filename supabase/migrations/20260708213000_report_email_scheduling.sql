-- =============================================
-- Migration: Scheduled report email delivery
-- =============================================

CREATE TABLE IF NOT EXISTS public.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  schedule_type text NOT NULL CHECK (schedule_type IN ('daily', 'weekly', 'monthly')),
  time_of_day time NOT NULL DEFAULT '09:00',
  day_of_week int CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month int CHECK (day_of_month BETWEEN 1 AND 31),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run
  ON public.report_schedules (next_run_at)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.compute_next_report_run(
  schedule_type text,
  time_of_day time,
  day_of_week int,
  day_of_month int,
  after timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  candidate timestamptz;
BEGIN
  candidate := date_trunc('day', $5) + time_of_day;
  IF candidate <= $5 THEN
    candidate := candidate + interval '1 day';
  END IF;

  IF schedule_type = 'weekly' THEN
    WHILE EXTRACT(DOW FROM candidate) != day_of_week LOOP
      candidate := candidate + interval '1 day';
    END LOOP;
  ELSIF schedule_type = 'monthly' THEN
    WHILE EXTRACT(DAY FROM candidate) != day_of_month LOOP
      candidate := candidate + interval '1 day';
    END LOOP;
  END IF;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_report_schedule_next_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.next_run_at := public.compute_next_report_run(
    NEW.schedule_type,
    NEW.time_of_day,
    NEW.day_of_week,
    NEW.day_of_month,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_report_schedule_next_run ON public.report_schedules;
CREATE TRIGGER set_report_schedule_next_run
  BEFORE INSERT OR UPDATE OF schedule_type, time_of_day, day_of_week, day_of_month
  ON public.report_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_report_schedule_next_run();

CREATE OR REPLACE FUNCTION public.claim_due_report_schedules(batch_size int DEFAULT 10)
RETURNS SETOF public.report_schedules
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.report_schedules AS rs
  SET next_run_at = public.compute_next_report_run(
    rs.schedule_type, rs.time_of_day, rs.day_of_week, rs.day_of_month, now()
  ),
      last_run_at = now()
  WHERE rs.id IN (
    SELECT due.id
    FROM public.report_schedules AS due
    WHERE due.is_active = true
      AND due.next_run_at <= now()
    ORDER BY due.next_run_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(COALESCE(batch_size, 10), 1)
  )
  RETURNING rs.*;
$$;

REVOKE ALL ON FUNCTION public.compute_next_report_run(text, time, int, int, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_report_schedule_next_run() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_report_schedules(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_report_schedules(integer) TO service_role;

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage report schedules" ON public.report_schedules;
CREATE POLICY "Admins can manage report schedules"
  ON public.report_schedules
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'Admin'
    )
  );

NOTIFY pgrst, 'reload schema';
