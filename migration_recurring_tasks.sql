-- =============================================
-- Migration: Add Recurring Task Support
-- =============================================

-- 1. Add recurrence columns to tasks table
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_type text DEFAULT NULL
    CHECK (recurrence_type IN ('daily', 'weekly', 'monthly') OR recurrence_type IS NULL),
  ADD COLUMN IF NOT EXISTS recurrence_time time DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recurrence_day integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_recurrence_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL DEFAULT NULL;

-- 2. Index for efficient recurrence lookups
CREATE INDEX IF NOT EXISTS idx_tasks_next_recurrence
  ON public.tasks (next_recurrence_at)
  WHERE is_recurring = true AND next_recurrence_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task
  ON public.tasks (parent_task_id)
  WHERE parent_task_id IS NOT NULL;
