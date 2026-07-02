# AGENTS.md

Guidance for Codex and other coding agents working on this repository.

## Project Overview

- Project name: Tasky, branded in the UI as EL MERAKI.
- Purpose: internal task management for assigning, tracking, organizing, and monitoring work.
- Users: Admin and Worker.
- Platform: web app.
- App type: React single-page app connected directly to Supabase.

## Technology Stack

- Frontend: React 19 with Vite.
- Language: TypeScript.
- Backend: Supabase, with no custom backend server in this repo.
- Database: Supabase PostgreSQL.
- Authentication: Supabase Auth with email/password and OTP invitation flow.
- Realtime: Supabase Realtime subscriptions.
- State management: Zustand.
- Styling: custom CSS.
- Icons: lucide-react.
- Markdown rendering: react-markdown with remark-gfm.

## Architecture

- Use the existing frontend SPA plus Supabase backend pattern.
- Keep the feature-based structure.
- Do not introduce MVC, Clean Architecture, DDD, microservices, or a custom backend unless explicitly requested.
- Prefer existing local patterns over new abstractions.
- Data access currently happens through the Supabase client, mostly in `src/store/useStore.ts`.

## Project Structure

```txt
src/
  assets/
  components/
    Layout/
    Notifications/
    Shared/
  features/
    admin/
    auth/
    dashboard/
    profile/
    reminders/
    tasks/
  lib/
    supabase.ts
    format.ts
  store/
    useStore.ts
  App.tsx
  main.tsx
  index.css
  mobile_fixes.css
```

SQL setup and migration files live in the repository root.

## Coding Standards

- Use TypeScript.
- Use single quotes.
- Use semicolons.
- Use 2-space indentation.
- Keep line length reasonable, preferably around 100-120 characters.
- Components: PascalCase, for example `TaskBoard`.
- Interfaces and types: PascalCase, for example `Task` and `Profile`.
- Variables and functions: camelCase.
- Database tables and columns: snake_case.
- React component files: PascalCase `.tsx`.
- Add comments only for complex business logic, RLS assumptions, migrations, or non-obvious Supabase behavior.

## Frontend Rules

- Keep domain UI inside `src/features/<feature>/components`.
- Put shared reusable UI in `src/components/Shared`.
- Put layout UI in `src/components/Layout`.
- Keep data/business logic mostly in `src/store/useStore.ts` or focused helper/service files.
- Avoid moving business logic deeply into presentational components.
- Prefer controlled React forms.
- Keep Supabase client setup and shared app types in `src/lib/supabase.ts`.
- Preserve existing custom CSS conventions unless a requested change requires broader styling work.

## Supabase And Database Rules

- Do not expose service-role keys or private credentials in frontend code.
- Do not delete database columns without explicit approval.
- Do not casually change RLS policies.
- Always consider RLS impact when changing auth, roles, tasks, profiles, or user deletion.
- Database changes must be represented as SQL migrations/files.
- Preserve existing Supabase behavior unless the requested task requires a change.
- Current core tables:
  - `profiles`
  - `user_roles`
  - `tasks`
  - `categories`
  - `statuses`
- Current important RPC:
  - `delete_user_entirely(target_user_id uuid)`
- Current role model:
  - `Admin`
  - `Worker`

## Current Modules

- Authentication
- User profiles
- Roles and permissions
- Admin settings
- User management
- Tasks
- Kanban/task board
- My Tasks
- Dashboard analytics
- Categories
- Statuses
- Reminders
- Recurring tasks
- Self/private tasks
- Realtime updates
- Profile settings
- Invitations

## Testing And Verification

- No test framework is currently configured.
- For meaningful TypeScript or UI changes, run:

```bash
npm run build
```

- If lint-related work is touched, run:

```bash
npm run lint
```

- Recommended future testing stack:
  - Vitest and React Testing Library for unit/component tests.
  - Playwright for end-to-end tests.

## Git And Change Discipline

- Never revert user changes unless explicitly asked.
- Never refactor unrelated files.
- Keep changes feature-scoped.
- Avoid introducing new dependencies unless there is a clear need.
- Preserve backward compatibility where possible.
- Explain significant architectural decisions.
- Use conventional commit style when asked to create commits:
  - `feat:`
  - `fix:`
  - `refactor:`
  - `docs:`
  - `chore:`

## Preferred Codex Response Format

For substantial work, respond with:

1. Short plan.
2. Implementation summary.
3. Affected files.
4. Testing or verification.
5. Risks or notes, only when relevant.

For small fixes, keep the response short: what changed, where, and whether it was tested.
