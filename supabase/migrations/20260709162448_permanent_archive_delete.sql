GRANT DELETE ON public.tasks TO authenticated;

DROP POLICY IF EXISTS "Delete Tasks" ON public.tasks;
CREATE POLICY "Delete Tasks" ON public.tasks
  FOR DELETE
  TO authenticated
  USING (
    deleted_at IS NOT NULL
    AND (
      (
        COALESCE(is_self_task, false) = true
        AND (SELECT auth.uid()) = creator_id
      )
      OR
      (
        COALESCE(is_self_task, false) = false
        AND EXISTS (
          SELECT 1
          FROM public.user_roles
          WHERE user_id = (SELECT auth.uid())
            AND role = 'Admin'
        )
      )
    )
  );

NOTIFY pgrst, 'reload schema';
