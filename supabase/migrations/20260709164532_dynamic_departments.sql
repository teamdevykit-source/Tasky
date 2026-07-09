CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#3b82f6',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.departments (name, color, sort_order)
VALUES
  ('Operations', '#3b82f6', 0),
  ('Finance', '#22c55e', 1),
  ('Top Management', '#ef4444', 2)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.departments (name, color, sort_order)
SELECT DISTINCT profile.department, '#3b82f6', 100
FROM public.profiles AS profile
WHERE profile.department IS NOT NULL
  AND btrim(profile.department) <> ''
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_department_check,
  DROP CONSTRAINT IF EXISTS profiles_department_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_department_fkey
  FOREIGN KEY (department)
  REFERENCES public.departments(name)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.departments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.departments TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can view departments" ON public.departments;
CREATE POLICY "Authenticated users can view departments"
  ON public.departments
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage departments" ON public.departments;
CREATE POLICY "Admins can manage departments"
  ON public.departments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
        AND user_roles.role = 'Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
        AND user_roles.role = 'Admin'
    )
  );

NOTIFY pgrst, 'reload schema';
