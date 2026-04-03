import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile, Task, Category, Status } from '../lib/supabase';

type Theme = 'light' | 'dark';

interface StoreState {
  currentUser: Profile | null;
  isCheckingSession: boolean;
  profiles: Profile[];
  tasks: Task[];
  categories: Category[];
  statuses: Status[];
  theme: Theme;

  viewMode: 'kanban' | 'scrum' | 'settings';
  setViewMode: (mode: 'kanban' | 'scrum' | 'settings') => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  getVisibleTasks: () => Task[];
  initialize: () => void;
  addTask: (task: Omit<Task, 'id' | 'created_at'>) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  updateTaskStatus: (taskId: string, status: string) => Promise<void>;
  updateUserRole: (userId: string, role: Profile['role']) => Promise<void>;
  addCategory: (name: string, color: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addStatus: (name: string, color: string) => Promise<void>;
  deleteStatus: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  logout: () => Promise<void>;
}

const getInitialTheme = (): Theme => {
  try {
    const saved = localStorage.getItem('elmeraki-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return 'dark';
};

const applyTheme = (theme: Theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('elmeraki-theme', theme); } catch {}
};

// Apply initial theme immediately
applyTheme(getInitialTheme());

// Guard against multiple initializations
let _initialized = false;

export const useStore = create<StoreState>((set, get) => ({
  currentUser: null,
  isCheckingSession: true,
  profiles: [],
  tasks: [],
  categories: [],
  statuses: [],
  theme: getInitialTheme(),

  viewMode: 'kanban',
  setViewMode: (mode) => set({ viewMode: mode }),

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },

  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    set({ theme: newTheme });
  },

  initialize: async () => {
    // Prevent double-initialization (React StrictMode)
    if (_initialized) return;
    _initialized = true;

    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      set({ isCheckingSession: false });
    }
    
    const loadData = async (userId: string) => {
      const [{ data: profile }, { data: tasks }, { data: profiles }, { data: categories }, { data: statuses }] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name, user_roles(role)').eq('id', userId).single(),
        supabase.from('tasks').select('*'),
        supabase.from('profiles').select('id, email, full_name, user_roles(role)'),
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('statuses').select('*').order('sort_order')
      ]);
      const getRole = (p: any) => {
        if (Array.isArray(p.user_roles)) return p.user_roles[0]?.role || 'Worker';
        return p.user_roles?.role || 'Worker';
      };
      
      if (profile) set({ currentUser: { ...profile, role: getRole(profile) } as any });
      if (tasks) set({ tasks });
      if (profiles) set({ profiles: profiles.map((p: any) => ({ ...p, role: getRole(p) })) });
      if (categories) set({ categories });
      if (statuses) set({ statuses });
      set({ isCheckingSession: false });
    };

    if (session) {
      await loadData(session.user.id);
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await loadData(session.user.id);
      } else {
        set({ currentUser: null, tasks: [], profiles: [], categories: [], statuses: [] });
      }
    });

    // Optional: Realtime subscriptions (non-blocking, wrapped in try-catch)
    // These enhance the experience but are NOT required for CRUD to work.
    try {
      const handleProfileUpdate = () => {
        supabase.from('profiles').select('id, email, full_name, user_roles(role)').then(({ data }) => {
          if (data) {
            const getRole = (p: any) => {
              if (Array.isArray(p.user_roles)) return p.user_roles[0]?.role || 'Worker';
              return p.user_roles?.role || 'Worker';
            };
            const mappedProfiles = data.map((p: any) => ({ ...p, role: getRole(p) }));
            set({ profiles: mappedProfiles });
            const { currentUser } = get();
            if (currentUser) {
              const updatedProfile = mappedProfiles.find(p => p.id === currentUser.id);
              if (updatedProfile) set({ currentUser: updatedProfile as any });
            }
          }
        });
      };

      supabase.channel('rt-tasks')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
          supabase.from('tasks').select('*').then(({ data }) => { if (data) set({ tasks: data }); });
        })
        .subscribe();

      supabase.channel('rt-profiles')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, handleProfileUpdate)
        .subscribe();

      supabase.channel('rt-user-roles')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, handleProfileUpdate)
        .subscribe();

      supabase.channel('rt-categories')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
          supabase.from('categories').select('*').order('sort_order').then(({ data }) => { if (data) set({ categories: data }); });
        })
        .subscribe();

      supabase.channel('rt-statuses')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'statuses' }, () => {
          supabase.from('statuses').select('*').order('sort_order').then(({ data }) => { if (data) set({ statuses: data }); });
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime subscriptions failed (non-critical):', e);
    }
  },

  addTask: async (taskData) => {
    // Insert and get the new row back in one call
    const { data, error } = await supabase.from('tasks').insert([taskData]).select().single();
    if (error) {
      alert("Error adding task: " + error.message);
      return;
    }
    if (data) {
      // Immediately add to local state — no second network call needed
      set((state) => ({ tasks: [...state.tasks, data] }));
    }
  },

  updateTask: async (taskId, updates) => {
    // Optimistic update first for instant UI
    set((state) => ({
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t)
    }));
    const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
    if (error) {
      alert("Error updating task: " + error.message);
    }
  },

  updateTaskStatus: async (taskId, status) => {
    // Optimistic update for instant UI
    set((state) => ({
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, status } : t)
    }));
    const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId);
    if (error) {
      alert("Error updating status: " + error.message);
    }
  },

  updateUserRole: async (userId, role) => {
    // Optimistic
    set((state) => ({
      profiles: state.profiles.map(p => p.id === userId ? { ...p, role } : p)
    }));
    const { error } = await supabase.from('user_roles').update({ role }).eq('user_id', userId);
    if (error) {
      alert("Error updating role: " + error.message);
    }
  },

  addCategory: async (name, color) => {
    const { categories } = get();
    const { data, error } = await supabase.from('categories').insert([{ name, color, sort_order: categories.length }]).select().single();
    if (data) set((state) => ({ categories: [...state.categories, data] }));
    else if (error) alert("Error adding category: " + error.message);
  },

  deleteCategory: async (id) => {
    // Optimistic
    set((state) => ({ categories: state.categories.filter(c => c.id !== id) }));
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) alert("Error deleting category: " + error.message);
  },

  addStatus: async (name, color) => {
    const { statuses } = get();
    const { data, error } = await supabase.from('statuses').insert([{ name, color, sort_order: statuses.length }]).select().single();
    if (data) set((state) => ({ statuses: [...state.statuses, data] }));
    else if (error) alert("Error adding status: " + error.message);
  },

  deleteStatus: async (id) => {
    // Optimistic
    set((state) => ({ statuses: state.statuses.filter(s => s.id !== id) }));
    const { error } = await supabase.from('statuses').delete().eq('id', id);
    if (error) alert("Error deleting status: " + error.message);
  },

  deleteTask: async (id) => {
    // Optimistic
    set((state) => ({ tasks: state.tasks.filter(t => t.id !== id) }));
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) {
      alert("Error deleting task: " + error.message);
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
  },

  getVisibleTasks: () => {
    const { tasks, currentUser } = get();
    if (!currentUser) return [];
    
    return tasks.filter(task => {
      if (currentUser.role === 'Admin') return true;
      return (task.assignee_id === currentUser.id) || 
             (task.creator_id === currentUser.id) ||
             (task.observers && task.observers.includes(currentUser.id));
    });
  }
}));
