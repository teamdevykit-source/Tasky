-- =============================================
-- Migration: Add task priority
-- =============================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Medium';

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_priority_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('High', 'Medium', 'Low'));
