-- ==========================================
-- ADD DATES & OBSERVERS TO TASKS
-- ==========================================

-- 1. Add columns to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS start_date date,
ADD COLUMN IF NOT EXISTS end_date date,
ADD COLUMN IF NOT EXISTS observers uuid[] DEFAULT '{}';

-- 2. Update the View Policy to include Observers
DROP POLICY IF EXISTS "View Tasks" ON public.tasks;

CREATE POLICY "View Tasks" ON public.tasks
    FOR SELECT USING (
        auth.uid() = assignee_id OR 
        auth.uid() = creator_id OR 
        auth.uid() = ANY(observers) OR
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')
    );
