import type { Task } from './supabase';

export const WORKSPACE_SELECTS = {
  profiles: 'id,email,full_name,job_title,department,created_at,user_roles(role)',
  user_roles: 'id,user_id,role,created_at',
  tasks: 'id,title,description,assignee_id,assignee_ids,creator_id,status,priority,category,observers,is_self_task,start_date,end_date,reminder_at,reminder_sent_at,reminder_claimed_at,created_at,deleted_at,deleted_by,is_recurring,recurrence_type,recurrence_time,recurrence_day,next_recurrence_at,parent_task_id,recurrence_claimed_at,recurrence_key,recurrence_timezone',
  categories: 'id,name,color,sort_order,created_at',
  departments: 'id,name,color,sort_order,can_view_all_tasks,hide_tasks_from_other_departments,created_at',
  statuses: 'id,name,color,sort_order,is_completed,created_at',
  ticket_requests: 'id,requester_id,title,description,priority,category,start_date,end_date,status,created_at,updated_at,linked_task_id',
  report_schedules: 'id,created_by,schedule_type,time_of_day,day_of_week,day_of_month,next_run_at,last_run_at,is_active,timezone,claimed_at,created_at'
} as const;

export type TaskUpdate = Partial<Pick<Task,
  | 'title'
  | 'description'
  | 'assignee_id'
  | 'assignee_ids'
  | 'status'
  | 'priority'
  | 'category'
  | 'observers'
  | 'is_self_task'
  | 'start_date'
  | 'end_date'
  | 'reminder_at'
  | 'reminder_sent_at'
  | 'is_recurring'
  | 'recurrence_type'
  | 'recurrence_time'
  | 'recurrence_day'
  | 'next_recurrence_at'
  | 'parent_task_id'
  | 'recurrence_timezone'
>>;

const TASK_UPDATE_COLUMNS = new Set<keyof TaskUpdate>([
  'title',
  'description',
  'assignee_id',
  'assignee_ids',
  'status',
  'priority',
  'category',
  'observers',
  'is_self_task',
  'start_date',
  'end_date',
  'reminder_at',
  'reminder_sent_at',
  'is_recurring',
  'recurrence_type',
  'recurrence_time',
  'recurrence_day',
  'next_recurrence_at',
  'parent_task_id',
  'recurrence_timezone'
]);

export const sanitizeTaskUpdates = (updates: TaskUpdate): TaskUpdate => (
  Object.fromEntries(
    Object.entries(updates).filter(([key, value]) => (
      TASK_UPDATE_COLUMNS.has(key as keyof TaskUpdate) && value !== undefined
    ))
  ) as TaskUpdate
);
