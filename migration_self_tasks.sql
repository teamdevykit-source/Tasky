-- =============================================================
-- MIGRATION: Self Tasks (Private Tasks)
-- =============================================================

-- 1. Add is_self_task column to results
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_self_task BOOLEAN DEFAULT FALSE;

-- 2. Update RLS policies to handle private tasks
-- We need to DROP existing policies first to redefine them clearly.
DROP POLICY IF EXISTS "View Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Update Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Delete Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Create Tasks" ON public.tasks;

-- VIEW POLICY: 
-- 1. If it's a self-task, ONLY the creator can see it.
-- 2. If it's NOT a self-task, the Assignee, Creator, Admin, or Observers can see it.
CREATE POLICY "View Tasks" ON public.tasks
    FOR SELECT USING (
        (is_self_task = true AND auth.uid() = creator_id) OR
        (is_self_task = false AND (
            auth.uid() = assignee_id OR 
            auth.uid() = creator_id OR 
            auth.uid() = ANY(observers) OR
            EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')
        ))
    );

-- CREATE POLICY: Anyone authenticated can create tasks.
CREATE POLICY "Create Tasks" ON public.tasks
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- UPDATE POLICY:
-- 1. If it's a self-task, ONLY the creator can update it.
-- 2. If it's NOT a self-task, Assignee, Creator or Admin can update it.
CREATE POLICY "Update Tasks" ON public.tasks
    FOR UPDATE USING (
        (is_self_task = true AND auth.uid() = creator_id) OR
        (is_self_task = false AND (
            auth.uid() = assignee_id OR 
            auth.uid() = creator_id OR
            EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')
        ))
    );

-- DELETE POLICY:
-- 1. If it's a self-task, ONLY the creator can delete it.
-- 2. If it's NOT a self-task, Creator or Admin can delete it.
CREATE POLICY "Delete Tasks" ON public.tasks
    FOR DELETE USING (
        (is_self_task = true AND auth.uid() = creator_id) OR
        (is_self_task = false AND (
            auth.uid() = creator_id OR
            EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')
        ))
    );
