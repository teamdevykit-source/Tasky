-- =============================================================
-- FINAL FAIL-SAFE MIGRATION (Worker & Admin only)
-- =============================================================

-- 1. Create the new user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
    role text NOT NULL CHECK (role IN ('Admin', 'Worker')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Everyone can view user_roles" ON public.user_roles;
CREATE POLICY "Everyone can view user_roles" ON public.user_roles
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can update user_roles" ON public.user_roles;
CREATE POLICY "Admins can update user_roles" ON public.user_roles
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')
    );

DROP POLICY IF EXISTS "Admins can insert user_roles" ON public.user_roles;
CREATE POLICY "Admins can insert user_roles" ON public.user_roles
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')
    );


-- 2. Clean up Old Roles!
-- Drop EVERYTHING related to the old role column in profiles to ensure no constraints remain.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role CASCADE;


-- 3. Upgrade the Trigger Function to be robust
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    -- Step A: Insert the core profile
    -- We use ON CONFLICT DO NOTHING to prevent registration retry errors
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        new.id, 
        new.email, 
        COALESCE(new.raw_user_meta_data->>'full_name', new.email)
    )
    ON CONFLICT (id) DO NOTHING;

    -- Step B: Insert the default role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (
        new.id,
        'Worker'
    )
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Re-bind the trigger to be sure it's alive
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created 
  AFTER INSERT ON auth.users 
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 5. UPGRADE TASK SECURITY to use the new user_roles table
-- Drop old policies first
DROP POLICY IF EXISTS "Anyone can select tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins can insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can update task status" ON public.tasks;

-- Only Creator, Assignee, or Admin can see a task
CREATE POLICY "View Tasks" ON public.tasks
    FOR SELECT USING (
        auth.uid() = assignee_id OR 
        auth.uid() = creator_id OR 
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')
    );

-- Anyone can create tasks (or restrict to Admin if you prefer)
-- If only admins should create, change auth.role() = 'authenticated' to the check below.
CREATE POLICY "Create Tasks" ON public.tasks
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Only Admin or the Assignee can update status
CREATE POLICY "Update Tasks" ON public.tasks
    FOR UPDATE USING (
        auth.uid() = assignee_id OR 
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin')
    );


-- 6. Migrate current data if not already done
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'Worker' FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

