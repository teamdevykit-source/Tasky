-- Archived legacy tasks may contain invalid historical dates. Keep enforcing date
-- order for active tasks without blocking an update that moves a task to Archive.
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_date_order_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_date_order_check
  CHECK (
    deleted_at IS NOT NULL
    OR start_date IS NULL
    OR end_date IS NULL
    OR end_date >= start_date
  )
  NOT VALID;
