-- =============================================================
-- MIGRATION: ADD JOB TITLE (LABEL) TO PROFILES
-- =============================================================

-- Add the new job_title column to the profiles table
-- This allows admins to visually label users (e.g. Manager, Accountant)
-- without altering their underlying security permissions (Worker/Admin).
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS job_title text;

-- Update the realtime publication if it's not automatically doing it 
-- (optional but good practice as we're picking up new columns)
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Optionally, if there's any RLS on profiles to update profiles, 
-- ensure workers can't promote themselves:
-- (Assuming Admins can already UPDATE profiles, which we'll secure below just in case)
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')
    );
