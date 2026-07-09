import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

// Initialize Supabase Client with robust Realtime configuration
export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Types
export type UserRole = 'Admin' | 'Worker';
export type Department = string;

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  job_title?: string;
  department?: Department | null;
  role: UserRole;
}

export interface WorkspaceDepartment {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  can_view_all_tasks: boolean;
  hide_tasks_from_other_departments: boolean;
  created_at: string;
}

export interface ReportSchedule {
  id: string;
  created_by: string;
  schedule_type: 'daily' | 'weekly' | 'monthly';
  time_of_day: string;
  day_of_week: number | null;
  day_of_month: number | null;
  next_run_at: string;
  last_run_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface Status {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export type RecurrenceType = 'daily' | 'weekly' | 'monthly';
export type TaskPriority = 'High' | 'Medium' | 'Low';
export type TicketStatus = 'Open' | 'In Review' | 'Approved' | 'Rejected';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee_id: string | null;
  assignee_ids?: string[];
  creator_id: string;
  status: string;
  priority?: TaskPriority;
  category: string | null;
  observers: string[];
  is_self_task?: boolean;
  start_date?: string;
  end_date?: string;
  reminder_at?: string | null;
  reminder_sent_at?: string | null;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  // Recurrence fields
  is_recurring?: boolean;
  recurrence_type?: RecurrenceType | null;
  recurrence_time?: string | null;   // HH:MM format
  recurrence_day?: number | null;    // 0-6 for weekly (Sun-Sat), 1-31 for monthly
  next_recurrence_at?: string | null;
  parent_task_id?: string | null;
}

export interface TicketRequest {
  id: string;
  requester_id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  category: string | null;
  start_date: string | null;
  end_date: string | null;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
}

export const getTaskAssigneeIds = (
  task: Pick<Task, 'assignee_id' | 'assignee_ids'>
): string[] => {
  if (task.assignee_ids?.length) return [...new Set(task.assignee_ids)];
  return task.assignee_id ? [task.assignee_id] : [];
};

export const isTaskAssignee = (
  task: Pick<Task, 'assignee_id' | 'assignee_ids'>,
  userId?: string | null
) => Boolean(userId && getTaskAssigneeIds(task).includes(userId));

export const canViewTaskByDepartment = (
  task: Task,
  currentUser: Profile,
  profiles: Profile[],
  departments: WorkspaceDepartment[] = []
) => {
  if (!currentUser.department) return false;

  const currentDepartment = departments.find(department => department.name === currentUser.department);
  const canViewAllTasks = currentDepartment?.can_view_all_tasks ||
    currentUser.department === 'Operations' ||
    currentUser.department === 'Finance';

  if (!canViewAllTasks) {
    return false;
  }

  const participantIds = new Set([
    task.creator_id,
    ...getTaskAssigneeIds(task),
    ...(task.observers || [])
  ]);

  return !profiles.some(profile => {
    if (!participantIds.has(profile.id) || !profile.department) return false;
    if (profile.department === currentUser.department) return false;

    const participantDepartment = departments.find(department => department.name === profile.department);
    return participantDepartment?.hide_tasks_from_other_departments ||
      profile.department === 'Top Management';
  });
};
