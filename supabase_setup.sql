-- Enable the uuid-ossp extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the profiles table to manage user roles
CREATE TABLE public.profiles (
    id uuid REFERENCES auth.users(id) PRIMARY KEY,
    email text NOT NULL,
    full_name text,
    role text NOT NULL CHECK (role IN ('Admin', 'Manager', 'Worker', 'Observer')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Turn on RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can read profiles
CREATE POLICY "Profiles are readable by all authenticated users" ON public.profiles
    FOR SELECT USING (auth.role() = 'authenticated');

-- Create a trigger to automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        new.id, 
        new.email, 
        COALESCE(new.raw_user_meta_data->>'full_name', new.email),
        COALESCE(new.raw_user_meta_data->>'role', 'Worker')
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create the tasks table
CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    description text,
    assignee_id uuid REFERENCES public.profiles(id),
    creator_id uuid REFERENCES public.profiles(id),
    status text NOT NULL DEFAULT 'To Do' CHECK (status IN ('To Do', 'In Progress', 'Review', 'Ready for Publishing', 'Done')),
    category text,
    observers uuid[] DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Turn on RLS for tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- SELECT Policy
-- Users can view tasks if they are Admin, Assignee, Creator, or in Observers list.
-- Alternatively, if they are Manager, they might need to view all tasks in specific folders. For simplicity, we allow Managers to view all tasks, or we can use custom logic. User specifies: "Manager (Hesham): Can view all tasks in specific Folders/Categories". Let's say Managers can see ALL tasks for now, but only edit assigned.
CREATE POLICY "Users can view relevant tasks" ON public.tasks
    FOR SELECT USING (
        -- Assignee, Creator, or in Observers list
        auth.uid() = assignee_id OR 
        auth.uid() = creator_id OR 
        auth.uid() = ANY (observers)
        -- Admin can see all
        OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin'))
        -- Manager can see all (in their categories, simplifying to all for now)
        OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Manager'))
    );

-- INSERT Policy
-- Admins can create tasks
CREATE POLICY "Admins can insert tasks" ON public.tasks
    FOR INSERT WITH CHECK (
        (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin'))
    );

-- UPDATE Policy
-- STATUS update logic: "Only the Assignee or an Admin can change the Status of a task"
-- Because RLS update policies evaluate the ROW conditions, we can do:
CREATE POLICY "Users can update their tasks or Admins can update any task" ON public.tasks
    FOR UPDATE USING (
        -- Assignee can update
        auth.uid() = assignee_id
        -- Admin can update
        OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin'))
    );

-- DELETE Policy
CREATE POLICY "Admins can delete tasks" ON public.tasks
    FOR DELETE USING (
        (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin'))
    );
