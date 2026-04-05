-- 1. Ensure profiles are deleted when auth.users are deleted
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_id_fkey,
ADD CONSTRAINT profiles_id_fkey 
FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Create a function to allow Admins to delete users entirely and purge their data
CREATE OR REPLACE FUNCTION public.delete_user_entirely(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Security Check: Only an authorized Admin can perform this operation
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role = 'Admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can erase users.';
    END IF;

    -- Clean up observers (observers is a UUID array, so it won't cascade automatically)
    UPDATE public.tasks 
    SET observers = array_remove(observers, target_user_id)
    WHERE target_user_id = ANY(observers);

    -- Delete from auth.users
    -- Because of the ON DELETE CASCADE on Profiles, this will automatically 
    -- delete the profile and the user's role records.
    DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Grant access to the function for authenticated users
GRANT EXECUTE ON FUNCTION public.delete_user_entirely(UUID) TO authenticated;
