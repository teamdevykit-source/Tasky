import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile, Task, Category, Status } from '../lib/supabase';

type Theme = 'light' | 'dark';

interface StoreState {
  currentUser: Profile | null;
  isCheckingSession: boolean;
  isInvitedSession: boolean;
  isLoaded: boolean;
  profiles: Profile[];
  tasks: Task[];
  categories: Category[];
  statuses: Status[];
  theme: Theme;
  alertData: { message: string, type: 'error' | 'success' } | null;
  reminders: { id: string, taskId: string, message: string, type: 'warning' | 'urgent' }[];

  setAlertData: (data: { message: string, type: 'error' | 'success' } | null) => void;
  viewMode: 'dashboard' | 'kanban' | 'scrum' | 'settings' | 'my-tasks' | 'profile' | 'reminders';
  setViewMode: (mode: 'dashboard' | 'kanban' | 'scrum' | 'settings' | 'my-tasks' | 'profile' | 'reminders') => void;
  updatePassword: (password: string) => Promise<void>;
  updateProfile: (updates: { full_name?: string, job_title?: string }) => Promise<void>;
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
  dismissReminder: (reminderId: string) => void;
  checkTaskDeadlines: () => void;
  logout: () => Promise<void>;
  getDashboardTasks: () => Task[];
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
    if (saved && ['dashboard', 'kanban', 'scrum', 'settings', 'my-tasks', 'profile', 'reminders'].includes(saved)) {
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
  isInvitedSession: false,
  isLoaded: false,
  profiles: [],
  tasks: [],
  categories: [],
  statuses: [],
  theme: getInitialTheme(),
  alertData: null,
  reminders: [],

  setAlertData: (data) => set({ alertData: data }),
  
  dismissReminder: (id) => set(s => ({ 
    reminders: s.reminders.filter(r => r.id !== id) 
  })),

  checkTaskDeadlines: () => {
    const { tasks, currentUser, reminders } = get();
    if (!currentUser) return;

    const newReminders: StoreState['reminders'] = [];
    const now = new Date();
    
    // Admins get reminders for EVERYTHING (except private tasks).
    // Workers only get reminders for tasks they are assigned to, created, or observe.
    const tasksToCheck = tasks.filter(t => {
      if (t.status === 'Done' || t.is_self_task) return false;
      
      if (currentUser.role === 'Admin') return true;
      
      return (t.assignee_id === currentUser.id) ||
             (t.creator_id === currentUser.id) ||
             (t.observers && t.observers.includes(currentUser.id));
    });

    tasksToCheck.forEach(task => {
      if (!task.end_date) return;
      
      const deadline = new Date(task.end_date);
      const diffMs = deadline.getTime() - now.getTime();
      const diffHrs = diffMs / (1000 * 60 * 60);

      // 1. One Hour Reminder (Urgent)
      if (diffHrs > 0 && diffHrs <= 1) {
        const rId = `${task.id}-one-hour`;
        if (!reminders.find(r => r.id === rId)) {
          newReminders.push({
            id: rId,
            taskId: task.id,
            message: `URGENT: "${task.title}" is due very soon (less than 1 hour)!`,
            type: 'urgent'
          });
        }
      }
      // 2. One Day Reminder (Warning)
      else if (diffHrs > 1 && diffHrs <= 24) {
        const rId = `${task.id}-one-day`;
        if (!reminders.find(r => r.id === rId)) {
          newReminders.push({
            id: rId,
            taskId: task.id,
            message: `REMINDER: "${task.title}" is due in less than 24 hours.`,
            type: 'warning'
          });
        }
      }
    });

    if (newReminders.length > 0) {
      set(s => ({ reminders: [...s.reminders, ...newReminders] }));
    }
  },
  viewMode: getInitialViewMode(),
  updatePassword: async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      set({ alertData: { message: error.message, type: 'error' } });
      throw error;
    }
    set({ alertData: { message: 'Password updated successfully!', type: 'success' } });
  },
  updateProfile: async (updates) => {
    const { currentUser } = get();
    if (!currentUser) return;
    
    // 1. Update Auth metadata
    if (updates.full_name) {
      await supabase.auth.updateUser({ data: { full_name: updates.full_name } });
    }
    
    // 2. Update Public profiles table
    const { error } = await supabase.from('profiles').update(updates).eq('id', currentUser.id);
    if (error) {
      set({ alertData: { message: error.message, type: 'error' } });
      throw error;
    }
    
    // 3. Update local state
    set({ 
      currentUser: { ...currentUser, ...updates },
      profiles: get().profiles.map(p => p.id === currentUser.id ? { ...p, ...updates } : p)
    });
  },
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

    // Handle invitation deep-link: We want them to stay logged in but we'll show a "finish" UI
    const params = new URLSearchParams(window.location.search);
    const isInvited = (params.get('type') === 'signup' && !!session);
    if (isInvited) set({ isInvitedSession: true });

    if (!session) {
      set({ isCheckingSession: false });
      return;
    }

    const loadData = async (userId: string, isSilent = false) => {
      // 1. Avoid redundant loads if already loaded, UNLESS it's a silent refresh request
      if (get().isLoaded && !isSilent) return;
      
      // 2. Only show the full-screen loader if it's the very first load
      if (!isSilent) set({ isCheckingSession: true });
      try {
        console.log("🚀 Starting workspace load for:", userId);
        
        // 1. Fetch data with a 10-second timeout to prevent 'infinite loading'
        const dataPromise = Promise.all([
          supabase.from('profiles').select('id, email, full_name, job_title, user_roles(role)').eq('id', userId).maybeSingle(),
          supabase.from('tasks').select('*'),
          supabase.from('profiles').select('id, email, full_name, job_title, user_roles(role)'),
          supabase.from('categories').select('*').order('sort_order'),
          supabase.from('statuses').select('*').order('sort_order')
        ]);

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout: Connection to workspace took too long (10s limit)")), 10000)
        );

        const results = await Promise.race([dataPromise, timeoutPromise]) as any[];
        let [{ data: profile }, { data: tasks }, { data: profiles }, { data: categories }, { data: statuses }] = results;

        // 2. Handle missing profile (Lazy creation)
        if (!profile) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const userEmail = session.user.email || '';
            const userFullName = session.user.user_metadata?.full_name || userEmail.split('@')[0];
            
            await supabase.from('profiles').upsert({ id: userId, email: userEmail, full_name: userFullName });
            await supabase.from('user_roles').upsert({ user_id: userId, role: 'Worker' });
            
            // Refetch
            const { data: finalP } = await supabase.from('profiles').select('id, email, full_name, job_title, user_roles(role)').eq('id', userId).single();
            profile = finalP;
            const { data: allP } = await supabase.from('profiles').select('id, email, full_name, job_title, user_roles(role)');
            profiles = allP;
          }
        }

        const getRole = (p: any) => {
          if (!p) return 'Worker';
          const r = Array.isArray(p.user_roles) ? p.user_roles[0]?.role : p.user_roles?.role;
          return r || 'Worker';
        };

        // 3. Selective State Updates
        if (profile) set({ currentUser: { ...profile, role: getRole(profile) } as any });
        if (tasks) set({ tasks });
        if (profiles) set({ profiles: profiles.map((p: any) => ({ ...p, role: getRole(p) })) });
        if (categories) set({ categories });
        if (statuses) set({ statuses });

        set({ isLoaded: true });
        if (isSilent) {
          // If silent, just update parts of state if needed, but usually initialize has set them already
        }
      } catch (error) {
        console.error("❌ Loading Error:", error);
        // Only alert on failure if it's NOT a silent background update
        if (!isSilent) {
          get().setAlertData({ 
            message: "Could not connect to database. Please check your internet or retry.", 
            type: 'error' 
          });
        }
      } finally {
        if (!isSilent) {
          set({ isCheckingSession: false });
          // Emergency release if somehow catch failed
          setTimeout(() => set({ isCheckingSession: false }), 100);
        }
      }
    };

    set({
      refreshData: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await loadData(session.user.id, true); // true = silent refresh
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

    // 4. Hybrid Sync Fallback: Auto-refresh data every 20 seconds
    setInterval(() => {
      get().refreshData?.();
    }, 20000); 

    // Realtime subscriptions (non-blocking)
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
        set((state) => ({ tasks: [...state.tasks, data] }));
        get().refreshData(); // Sync for non-realtime users
        return { success: true, data };
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
    } else {
      get().refreshData(); // Sync for non-realtime users
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
    } else {
      get().refreshData(); // Sync for non-realtime users
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
      // 1. Check if email already exists in profiles (application users)
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existing) {
        get().setAlertData({ message: `User with email ${email} is already in the workspace.`, type: 'error' });
        return;
      }

      // 2. Send invitation via OTP / Magic Link
      // We route them to origin/login explicitly to ensure they see the app entrance
      const { error } = await supabase.auth.signInWithOtp({ 
        email,
        options: { 
          emailRedirectTo: `${window.location.origin}?type=signup&email=${encodeURIComponent(email)}`,
        }
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
      // Use RPC for complete erasure (including auth.users)
      const { error } = await supabase.rpc('delete_user_entirely', { target_user_id: userId });
      if (error) throw error;
      
      set({ 
        profiles: get().profiles.filter(p => p.id !== userId),
        tasks: get().tasks.map(t => t.assignee_id === userId ? { ...t, assignee_id: null } : t)
      });
      set({ alertData: { message: 'User successfully erased from workspace', type: 'success' } });
    } catch (err: any) {
      set({ alertData: { message: err.message || 'Failed to erase user', type: 'error' } });
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
      // If it's a self-task, ONLY the creator can see it, regardless of role.
      if (task.is_self_task) {
        return task.creator_id === currentUser.id;
      }
      
      if (currentUser.role === 'Admin') return true;
      return (task.assignee_id === currentUser.id) ||
        (task.creator_id === currentUser.id) ||
        (task.observers && task.observers.includes(currentUser.id));
    });
  },
  getDashboardTasks: () => {
    const { tasks, currentUser } = get();
    if (!currentUser) return [];

    return tasks.filter(task => {
      // 1. Never count private self-tasks in the 'overall' dashboard/totals
      if (task.is_self_task) return false;

      // 2. Admins see all public tasks
      if (currentUser.role === 'Admin') return true;

      // 3. Workers see public tasks they are involved in (assigned, created, or observing)
      return (task.assignee_id === currentUser.id) ||
             (task.creator_id === currentUser.id) ||
             (task.observers && task.observers.includes(currentUser.id));
    });
  }
}));
