-- PostgREST needs SELECT privilege to validate the public API contract with the
-- anonymous key. Every table remains protected by policies scoped to the
-- authenticated role, so anonymous requests can inspect shape but return no rows.
GRANT SELECT ON TABLE
  public.tasks,
  public.profiles,
  public.user_roles,
  public.categories,
  public.statuses,
  public.departments,
  public.ticket_requests,
  public.report_schedules
TO anon;

NOTIFY pgrst, 'reload schema';
