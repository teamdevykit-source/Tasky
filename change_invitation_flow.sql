-- 1. Drop the automatic trigger so users aren't added to Profiles until they log in
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Add INSERT policies so users can create their own profile/role on first login
-- Note: We allow users to insert a profile for themselves ONLY if the ID matches their auth.uid()
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- 3. Add INSERT policy for user_roles so users can assign themselves 'Worker' role on first login
-- We restrict this to ONLY 'Worker' role to prevent self-elevation to 'Admin'
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;
CREATE POLICY "Users can insert their own role" ON public.user_roles
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND 
        role = 'Worker'
    );
