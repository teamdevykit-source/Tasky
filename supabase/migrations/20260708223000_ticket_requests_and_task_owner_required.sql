-- =============================================
-- Migration: Ticket requests and required task owners
-- =============================================

CREATE TABLE IF NOT EXISTS public.ticket_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
  category text,
  start_date timestamptz,
  end_date timestamptz,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Review', 'Approved', 'Rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_requests_status_created
  ON public.ticket_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_requests_requester
  ON public.ticket_requests (requester_id);

CREATE OR REPLACE FUNCTION public.set_ticket_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_ticket_requests_updated_at ON public.ticket_requests;
CREATE TRIGGER set_ticket_requests_updated_at
  BEFORE UPDATE ON public.ticket_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ticket_requests_updated_at();

ALTER TABLE public.ticket_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create ticket requests" ON public.ticket_requests;
CREATE POLICY "Users can create ticket requests"
  ON public.ticket_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins can manage ticket requests" ON public.ticket_requests;
CREATE POLICY "Admins can manage ticket requests"
  ON public.ticket_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = (SELECT auth.uid())
        AND role = 'Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = (SELECT auth.uid())
        AND role = 'Admin'
    )
  );

UPDATE public.tasks
SET
  assignee_id = COALESCE(assignee_id, creator_id),
  assignee_ids = CASE
    WHEN COALESCE(cardinality(assignee_ids), 0) = 0 AND creator_id IS NOT NULL THEN ARRAY[creator_id]
    ELSE assignee_ids
  END
WHERE COALESCE(is_self_task, false) = false
  AND creator_id IS NOT NULL
  AND assignee_id IS NULL
  AND COALESCE(cardinality(assignee_ids), 0) = 0;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_public_tasks_require_assignee;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_public_tasks_require_assignee
  CHECK (
    COALESCE(is_self_task, false) = true
    OR assignee_id IS NOT NULL
    OR COALESCE(cardinality(assignee_ids), 0) > 0
  );

NOTIFY pgrst, 'reload schema';
