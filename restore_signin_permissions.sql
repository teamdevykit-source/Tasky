-- =============================================================
-- MIGRATION: RESTORE SIGN-IN PERMISSIONS
-- =============================================================

-- If you are having trouble signing in, it's likely because the 
-- RLS security blocked you from reading your own profile or role.

-- 1. Ensure Profile Visibility (Critical for sign-in)
-- Users MUST be able to read their own profile to get into the app.
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

-- (Optional) Allows users to see who else is in the workspace
DROP POLICY IF EXISTS "Users can view all other profiles" ON public.profiles;
CREATE POLICY "Users can view all other profiles" 
ON public.profiles FOR SELECT 
USING (true);

-- 2. Ensure Role Visibility (Critical for app features)
-- Users MUST be able to read their own role to determine if they are an Admin or Worker.
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
CREATE POLICY "Users can read own role" 
ON public.user_roles FOR SELECT 
USING (auth.uid() = user_id);

-- (Optional) Admins can see all roles to manage the workspace
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" 
ON public.user_roles FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'Admin'
  )
);
