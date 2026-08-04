import { existsSync, readFileSync } from 'node:fs';

const loadEnvFile = (fileName) => {
  if (!existsSync(fileName)) return;

  for (const line of readFileSync(fileName, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]*)=(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!process.env[key]) process.env[key] = value;
  }
};

loadEnvFile('.env.local');
loadEnvFile('.env');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');
}

const tableColumns = {
  profiles: 'id,email,full_name,job_title,department,created_at',
  user_roles: 'id,user_id,role,created_at',
  tasks: [
    'id', 'title', 'description', 'assignee_id', 'assignee_ids', 'creator_id',
    'status', 'priority', 'category', 'observers', 'is_self_task', 'start_date',
    'end_date', 'reminder_at', 'reminder_sent_at', 'reminder_claimed_at',
    'created_at', 'deleted_at', 'deleted_by', 'is_recurring', 'recurrence_type',
    'recurrence_time', 'recurrence_day', 'next_recurrence_at', 'parent_task_id',
    'recurrence_claimed_at', 'recurrence_key', 'recurrence_timezone'
  ].join(','),
  categories: 'id,name,color,sort_order,created_at',
  departments: [
    'id', 'name', 'color', 'sort_order', 'can_view_all_tasks',
    'hide_tasks_from_other_departments', 'created_at'
  ].join(','),
  statuses: 'id,name,color,sort_order,is_completed,created_at',
  ticket_requests: [
    'id', 'requester_id', 'title', 'description', 'priority', 'category',
    'start_date', 'end_date', 'status', 'created_at', 'updated_at', 'linked_task_id'
  ].join(','),
  report_schedules: [
    'id', 'created_by', 'schedule_type', 'time_of_day', 'day_of_week',
    'day_of_month', 'next_run_at', 'last_run_at', 'is_active', 'timezone',
    'claimed_at', 'created_at'
  ].join(',')
};

const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`
};

const failures = [];

for (const [table, columns] of Object.entries(tableColumns)) {
  const requestUrl = new URL(`/rest/v1/${table}`, supabaseUrl);
  requestUrl.searchParams.set('select', columns);
  requestUrl.searchParams.set('limit', '1');

  const response = await fetch(requestUrl, { headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    failures.push(`${table}: ${body.message || `HTTP ${response.status}`}`);
  }
}

for (const functionName of ['admin-user-password', 'send-task-reminder']) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'OPTIONS',
    headers
  });
  if (!response.ok) failures.push(`${functionName}: HTTP ${response.status}`);
}

if (failures.length > 0) {
  console.error('Live Supabase contract check failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `Live Supabase contract is valid: ${Object.keys(tableColumns).length} tables and 2 Edge Functions.`
  );
}
