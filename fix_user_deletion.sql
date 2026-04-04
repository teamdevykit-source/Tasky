-- =============================================================
-- MIGRATION: FIX USER DELETION AND REGISTRATION ERRORS
-- =============================================================

-- 1. Ensure tasks don't block user deletion
-- These commands ensure that when a user is removed from the workspace, 
-- their tasks are preserved but become 'unassigned' rather than being lost 
-- or blocking the deletion.

-- Modify assignee link to allow null on delete
ALTER TABLE public.tasks 
DROP CONSTRAINT IF EXISTS fk_tasks_assignee,
DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;

ALTER TABLE public.tasks
ADD CONSTRAINT tasks_assignee_id_fkey 
FOREIGN KEY (assignee_id) 
REFERENCES public.profiles(id) 
ON DELETE SET NULL;

-- Modify creator link to allow null on delete (so task history is kept)
ALTER TABLE public.tasks 
DROP CONSTRAINT IF EXISTS fk_tasks_creator,
DROP CONSTRAINT IF EXISTS tasks_creator_id_fkey;

ALTER TABLE public.tasks
ADD CONSTRAINT tasks_creator_id_fkey 
FOREIGN KEY (creator_id) 
REFERENCES public.profiles(id) 
ON DELETE SET NULL;

-- 2. Ensure user_roles are cleaned up automatically
ALTER TABLE public.user_roles
DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;
