ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS can_view_all_tasks boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_tasks_from_other_departments boolean NOT NULL DEFAULT false;

UPDATE public.departments
SET can_view_all_tasks = true
WHERE name IN ('Operations', 'Finance');

UPDATE public.departments
SET hide_tasks_from_other_departments = true
WHERE name = 'Top Management';

GRANT SELECT ON public.departments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.departments TO authenticated;

NOTIFY pgrst, 'reload schema';
