-- Reconstructable core schema. The next two historical migration versions are
-- placeholders because their original SQL was lost; this idempotent migration
-- makes both fresh and existing projects converge safely.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  job_title text,
  department text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'Worker' CHECK (role IN ('Admin', 'Worker')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#94a3b8',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#94a3b8',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assignee_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  creator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'To Do',
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
  category text,
  observers uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  is_self_task boolean NOT NULL DEFAULT false,
  start_date timestamptz,
  end_date timestamptz,
  reminder_at timestamptz,
  reminder_sent_at timestamptz,
  reminder_claimed_at timestamptz,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_type text CHECK (recurrence_type IN ('daily', 'weekly', 'monthly')),
  recurrence_time time,
  recurrence_day integer,
  next_recurrence_at timestamptz,
  parent_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles,
  public.user_roles,
  public.categories,
  public.statuses,
  public.tasks
TO authenticated;

CREATE POLICY "Profiles are readable by all authenticated users" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = (SELECT auth.uid()));

CREATE POLICY "Everyone can view user_roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert their own role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND role = 'Worker');

CREATE POLICY "Everyone can view categories" ON public.categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Everyone can view statuses" ON public.statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "View Tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (creator_id = (SELECT auth.uid()) OR (SELECT auth.uid()) = ANY(assignee_ids));
CREATE POLICY "Create Tasks" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (creator_id = (SELECT auth.uid()));
CREATE POLICY "Update Tasks" ON public.tasks
  FOR UPDATE TO authenticated USING (creator_id = (SELECT auth.uid()));

INSERT INTO public.categories (name, color, sort_order)
VALUES
  ('Operations', '#3b82f6', 0),
  ('Logistics', '#8b5cf6', 1),
  ('Warehouse', '#f59e0b', 2),
  ('Finance', '#22c55e', 3)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.statuses (name, color, sort_order)
VALUES
  ('To Do', '#94a3b8', 0),
  ('In Progress', '#3b82f6', 1),
  ('Review', '#f59e0b', 2),
  ('Ready for Publishing', '#6366f1', 3),
  ('Done', '#10b981', 4)
ON CONFLICT (name) DO NOTHING;
