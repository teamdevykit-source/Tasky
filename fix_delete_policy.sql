-- Fix DELETE policy for tasks to use the new user_roles table
DROP POLICY IF EXISTS "Admins can delete tasks" ON public.tasks;

CREATE POLICY "Admins can delete tasks" ON public.tasks
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')
    );
