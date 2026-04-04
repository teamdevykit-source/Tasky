-- =============================================================
-- MIGRATION: FIX ADMIN PERMISSIONS FOR USER DELETION
-- =============================================================

-- Sometimes Supabase RLS (Row-Level Security) blocks even an Admin 
-- from deleting other people's profile records.

-- 1. Enable RLS on the profiles table if it isn't already
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Create the policy to allow Admins to delete any profile
-- This gives the Admin full control over the workspace directory.
DROP POLICY IF EXISTS "Admins can delete any profile" ON public.profiles;
CREATE POLICY "Admins can delete any profile" 
ON public.profiles 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'Admin'
  )
);

-- 3. Also allow Admins to manage roles
-- (Allows you to delete from user_roles table)
DROP POLICY IF EXISTS "Admins can manage any role" ON public.user_roles;
CREATE POLICY "Admins can manage any role" 
ON public.user_roles 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_Roles.user_id = auth.uid() 
    AND user_roles.role = 'Admin'
  )
);

-- 4. Also ensure other users can read profiles (Directory visibility)
DROP POLICY IF EXISTS "Anyone can read any profile" ON public.profiles;
CREATE POLICY "Anyone can read any profile" 
ON public.profiles 
FOR SELECT 
USING (true);
