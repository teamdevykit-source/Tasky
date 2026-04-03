import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Types
export type UserRole = 'Admin' | 'Worker';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
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

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee_id: string;
  creator_id: string;
  status: string;
  category: string | null;
  observers: string[];
  start_date?: string;
  end_date?: string;
  created_at: string;
}
