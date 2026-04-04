-- =============================================================
-- MIGRATION: REMOVE HARDCODED STATUS CHECK CONSTRAINT
-- =============================================================

-- The 'tasks' table likely has a check constraint restricting the 'status' column
-- to a few hardcoded values (e.g., 'To Do', 'In Progress', 'Done').
-- This prevents you from creating and using new, dynamic statuses.

-- 1. Identify and drop the constraint. 
-- Note: 'tasks_status_check' is the most likely name based on your error message.
ALTER TABLE public.tasks 
DROP CONSTRAINT IF EXISTS tasks_status_check;

-- 2. (Optional but Recommended) If you want to ensure data integrity
-- across the dynamic status names, you could instead set up a foreign key 
-- to the 'statuses' table, but it's simpler and more flexible for now 
-- to just let the app handle it and remove the hard check.
