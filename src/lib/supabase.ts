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

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  job_title?: string;
  role: UserRole;
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

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee_id: string | null;
  creator_id: string;
  status: string;
  category: string | null;
  observers: string[];
  is_self_task?: boolean;
  start_date?: string;
  end_date?: string;
  created_at: string;
  // Recurrence fields
  is_recurring?: boolean;
  recurrence_type?: RecurrenceType | null;
  recurrence_time?: string | null;   // HH:MM format
  recurrence_day?: number | null;    // 0-6 for weekly (Sun-Sat), 1-31 for monthly
  next_recurrence_at?: string | null;
  parent_task_id?: string | null;
}
