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
  alertData: { message: string, type: 'error' | 'success' } | null;

  setAlertData: (data: { message: string, type: 'error' | 'success' } | null) => void;
  viewMode: 'dashboard' | 'kanban' | 'scrum' | 'settings';
  setViewMode: (mode: 'dashboard' | 'kanban' | 'scrum' | 'settings') => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  getVisibleTasks: () => Task[];
  initialize: () => void;
  refreshData: () => Promise<void>;
  addTask: (taskData: Omit<Task, 'id' | 'created_at'>) => Promise<{ success: boolean, data?: any, error?: any }>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  updateTaskStatus: (taskId: string, status: string) => Promise<void>;
  updateUserRole: (userId: string, role: Profile['role']) => Promise<void>;
  updateUserJobTitle: (userId: string, jobTitle: string) => Promise<void>;
  inviteUser: (email: string) => Promise<void>;
  addCategory: (name: string, color: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addStatus: (name: string, color: string) => Promise<void>;
  deleteStatus: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const getInitialTheme = (): Theme => {
  try {
    const saved = localStorage.getItem('elmeraki-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { }
  return 'dark';
};

const applyTheme = (theme: Theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('elmeraki-theme', theme); } catch { }
};

// Apply initial theme immediately
applyTheme(getInitialTheme());

const getInitialViewMode = (): StoreState['viewMode'] => {
  try {
    const saved = localStorage.getItem('elmeraki-view');
    if (saved === 'dashboard' || saved === 'kanban' || saved === 'scrum' || saved === 'settings') {
      return saved as StoreState['viewMode'];
    }
  } catch { }
  return 'dashboard';
};

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
  alertData: null,

  setAlertData: (data) => set({ alertData: data }),
  viewMode: getInitialViewMode(),
  setViewMode: (mode) => {
    try { localStorage.setItem('elmeraki-view', mode); } catch { }
    set({ viewMode: mode });
  },

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },

  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    set({ theme: newTheme });
  },

  refreshData: async () => {},

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
        supabase.from('profiles').select('id, email, full_name, job_title, user_roles(role)').eq('id', userId).single(),
        supabase.from('tasks').select('*'),
        supabase.from('profiles').select('id, email, full_name, job_title, user_roles(role)'),
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

    set({
      refreshData: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await loadData(session.user.id);
        }
      }
    });

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
        supabase.from('profiles').select('id, email, full_name, job_title, user_roles(role)').then(({ data }) => {
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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
          set((state) => {
            const currentTasks = state.tasks;
            if (payload.eventType === 'INSERT') {
              if (currentTasks.some(t => t.id === payload.new.id)) return state;
              return { tasks: [...currentTasks, payload.new as Task] };
            }
            if (payload.eventType === 'UPDATE') {
              return { tasks: currentTasks.map(t => t.id === payload.new.id ? (payload.new as Task) : t) };
            }
            if (payload.eventType === 'DELETE') {
              return { tasks: currentTasks.filter(t => t.id !== payload.old.id) };
            }
            return state;
          });
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
    try {
      const { data, error } = await supabase.from('tasks').insert([taskData]).select().single();
      if (error) {
        get().setAlertData({ message: "Error adding task: " + error.message, type: 'error' });
        return { success: false, error };
      }
      if (data) {
        set((state) => ({ tasks: [...state.tasks, data] }));
        return { success: true, data };
      }
      return { success: false };
    } catch (err: any) {
      get().setAlertData({ message: "Network or session error: " + err.message, type: 'error' });
      return { success: false, error: err };
    }
  },

  updateTask: async (taskId, updates) => {
    // Optimistic update first for instant UI
    const prevTasks = get().tasks;
    set((state) => ({
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t)
    }));
    const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
    if (error) {
      set({ tasks: prevTasks });
      get().setAlertData({ message: "Error updating task: " + error.message, type: 'error' });
    }
  },

  updateTaskStatus: async (taskId, status) => {
    // Optimistic update for instant UI
    const prevTasks = get().tasks;
    set((state) => ({
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, status } : t)
    }));
    const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId);
    if (error) {
      set({ tasks: prevTasks });
      get().setAlertData({ message: "Error updating status: " + error.message, type: 'error' });
    }
  },

  updateUserRole: async (userId, role) => {
    // Optimistic
    const prevProfiles = get().profiles;
    set((state) => ({
      profiles: state.profiles.map(p => p.id === userId ? { ...p, role } : p)
    }));
    const { error } = await supabase.from('user_roles').update({ role }).eq('user_id', userId);
    if (error) {
      set({ profiles: prevProfiles });
      get().setAlertData({ message: "Error updating role: " + error.message, type: 'error' });
    }
  },

  updateUserJobTitle: async (userId, jobTitle) => {
    const prevProfiles = get().profiles;
    set((state) => ({
      profiles: state.profiles.map(p => p.id === userId ? { ...p, job_title: jobTitle } : p)
    }));
    const { error } = await supabase.from('profiles').update({ job_title: jobTitle }).eq('id', userId);
    if (error) {
      set({ profiles: prevProfiles });
      get().setAlertData({ message: "Error updating job title: " + error.message, type: 'error' });
    }
  },

  inviteUser: async (email) => {
    try {
      // Create user or send magic link depending on Supabase settings
      const { error } = await supabase.auth.signInWithOtp({ 
        email,
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) throw error;
      get().setAlertData({ message: `Invitation sent to ${email} successfully!`, type: 'success' });
    } catch (err: any) {
      get().setAlertData({ message: "Failed to invite: " + err.message, type: 'error' });
    }
  },

  addCategory: async (name, color) => {
    const { categories } = get();
    const { data, error } = await supabase.from('categories').insert([{ name, color, sort_order: categories.length }]).select().single();
    if (data) set((state) => ({ categories: [...state.categories, data] }));
    else if (error) get().setAlertData({ message: "Error adding category: " + error.message, type: 'error' });
  },

  deleteCategory: async (id) => {
    // Optimistic
    const prevCategories = get().categories;
    set((state) => ({ categories: state.categories.filter(c => c.id !== id) }));
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) {
      set({ categories: prevCategories });
      get().setAlertData({ message: "Error deleting category: " + error.message, type: 'error' });
    }
  },

  addStatus: async (name, color) => {
    const { statuses } = get();
    const { data, error } = await supabase.from('statuses').insert([{ name, color, sort_order: statuses.length }]).select().single();
    if (data) set((state) => ({ statuses: [...state.statuses, data] }));
    else if (error) get().setAlertData({ message: "Error adding status: " + error.message, type: 'error' });
  },

  deleteStatus: async (id) => {
    // Optimistic
    const prevStatuses = get().statuses;
    set((state) => ({ statuses: state.statuses.filter(s => s.id !== id) }));
    const { error } = await supabase.from('statuses').delete().eq('id', id);
    if (error) {
      set({ statuses: prevStatuses });
      get().setAlertData({ message: "Error deleting status: " + error.message, type: 'error' });
    }
  },

  deleteUser: async (userId: string) => {
    try {
      // First delete from user_roles to prevent FK issues if set up
      const { error: roleError } = await supabase.from('user_roles').delete().eq('user_id', userId);
      if (roleError) throw roleError;

      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;
      
      set({ 
        profiles: get().profiles.filter(p => p.id !== userId),
        tasks: get().tasks.map(t => t.assignee_id === userId ? { ...t, assignee_id: null } : t)
      });
      set({ alertData: { message: 'User removed from workspace', type: 'success' } });
    } catch (err: any) {
      set({ alertData: { message: err.message || 'Failed to delete user', type: 'error' } });
    }
  },

  deleteTask: async (id) => {
    const prevTasks = get().tasks;
    set((state) => ({ tasks: state.tasks.filter(t => t.id !== id) }));
    
    const { error, data } = await supabase.from('tasks').delete().eq('id', id).select();
    
    if (error || !data || data.length === 0) {
      set({ tasks: prevTasks }); // Revert
      const msg = error ? error.message : "You do not have permission to delete this task or it doesn't exist.";
      get().setAlertData({ message: "Error deleting task: " + msg, type: 'error' });
    } else {
      get().setAlertData({ message: "Task successfully deleted.", type: 'success' });
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
