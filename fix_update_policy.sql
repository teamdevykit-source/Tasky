-- ============================================
-- RUN THIS IN YOUR SUPABASE SQL EDITOR
-- ============================================

-- 1. Fix the UPDATE RLS policy to allow Creators to update their tasks
DROP POLICY IF EXISTS "Users can update their tasks or Admins can update any task" ON public.tasks;

CREATE POLICY "Users can update their tasks or Admins can update any task" ON public.tasks
    FOR UPDATE USING (
        auth.uid() = assignee_id
        OR auth.uid() = creator_id
        OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin'))
    );

-- 2. Remove the hardcoded status CHECK constraint so dynamic statuses work
--    (Find the constraint name first, then drop it)
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
