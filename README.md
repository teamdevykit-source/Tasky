# Tasky / EL MERAKI

Internal task-management SPA for administrators and workers. The React client talks directly to
Supabase for authentication, PostgreSQL data, Realtime updates, Edge Functions, and scheduled mail.

## Local setup

1. Copy `.env.example` to `.env.local` and provide `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`.
2. Run `npm install`.
3. Run `npm run dev`.

Use `npm run build` and `npm run lint` before publishing changes.

## Database changes

The canonical database history is `supabase/migrations/`. Apply it with:

```sh
npm run supabase:db:push
```

SQL files in the repository root are historical operator scripts. Do not run them against a live
project unless their contents have been reviewed against the current migrations. In particular,
authorization must be changed through a new migration because permissive PostgreSQL RLS policies
are combined with `OR`.

## Edge Functions and scheduled jobs

- `admin-user-password`: invitation and administrator password-reset workflow.
- `send-task-reminder`: assignment mail, due reminders, recurring-task processing, and reports.

Deploy the reminder function after database migrations, then configure the cron scripts using the
commands in `package.json`. Required function secrets include the Supabase service-role key, SMTP
credentials, `APP_URL`, and `CRON_SECRET`. Never expose a service-role key to the Vite client.

## Authorization model

- Admins manage public tasks, workspace settings, users, tickets, and reports.
- Workers can create private tasks and change status on public tasks assigned to them.
- Private tasks are visible only to their creator.
- Department-wide visibility is enforced by database RLS using the flags in `departments`.

The frontend visibility helpers are presentation safeguards; Supabase RLS is the authority.
