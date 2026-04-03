-- 1. FIX: ALLOW ANYONE TO CREATE TASKS (If you want workers to submit tasks)
-- Drop the old policy first if it exists
DROP POLICY IF EXISTS "Admins can insert tasks" ON public.tasks;

-- Create the new policy allowing all authenticated users to insert tasks
CREATE POLICY "Anyone can insert tasks" ON public.tasks
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2. ENABLE UPDATES FOR PROFILES (So the Manage Users UI works)
-- Drop the policy if it exists (in case you run this twice)
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;

-- Allow Admins to update user roles
CREATE POLICY "Admins can update profiles" ON public.profiles
    FOR UPDATE USING (
        (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin'))
    );

-- 3. BOOTSTRAP YOUR FIRST ADMIN!
-- Replace the email below with your ACTUAL signup email to make yourself the first Admin,
-- enabling you to see the "Users" tab and manage everyone else.
-- UPDATE public.profiles SET role = 'Admin' WHERE email = 'your-email@example.com';
