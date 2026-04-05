-- 1. Enable Realtime for all tables
-- This adds the tables to the supabase_realtime publication, which is
-- the mechanism Supabase uses to stream changes to clients.
BEGIN;
  -- Remove existing publication if any, and recreate it for a clean start
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

-- 2. Add public tables to the publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.statuses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;

-- 3. Set Replica Identity to FULL for all tables
-- This ensures that when a record is UPDATED or DELETED, 
-- Realtime sends the full old record so the frontend can react properly.
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.categories REPLICA IDENTITY FULL;
ALTER TABLE public.statuses REPLICA IDENTITY FULL;
ALTER TABLE public.user_roles REPLICA IDENTITY FULL;

-- 4. Ensure RLS doesn't block the Realtime engine
-- Some Realtime implementations need to check the 'authenticated' role
-- which is already handled in your existing policies.

-- IMPORTANT: In some Supabase configurations, you must explicitly 
-- grant permissions on the REALTIME schema for users to subscribe.
GRANT USAGE ON SCHEMA realtime TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA realtime TO authenticated;

-- Ensure authenticated role can also see the publication 
-- (This is usually default but good to be explicit for 'security' issues)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
