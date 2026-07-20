import { create } from 'zustand';
import { canViewTaskByDepartment, getTaskAssigneeIds, isTaskAssignee, supabase } from '../lib/supabase';
import type { Department, Profile, Task, Category, Status, ReportSchedule, TicketRequest, TicketStatus, WorkspaceDepartment } from '../lib/supabase';
import { buildRecurringTaskOccurrence, computeNextRecurrenceAfter } from '../lib/recurrence';

type Theme = 'light' | 'dark';
type AdminSettingsTab = 'users' | 'departments' | 'categories' | 'statuses';

export interface DashboardTaskFilters {
  status?: string;
  category?: string;
  assignee?: string;
  selfTasks?: 'all' | 'only' | 'hide';
}

const getReminderEmailErrorMessage = async (err: any) => {
  const message = err?.message || 'Failed to send reminder email.';
  const context = err?.context;
  const status = context?.status || context?.response?.status;

  if (context instanceof Response) {
    const body = await context.clone().json().catch(() => null);
    if (body?.error) {
      const details = body.details?.message || body.details?.error || body.details?.name;
      return details ? `${body.error} ${details}` : body.error;
    }
  }

  if (status === 404 || message.includes('Failed to send a request to the Edge Function')) {
    return 'The send-task-reminder Edge Function is not deployed or is not reachable in the active Supabase project.';
  }

  return message;
};

const getEdgeFunctionErrorMessage = async (err: any, fallback: string) => {
  const context = err?.context;
  if (context instanceof Response) {
    const body = await context.clone().json().catch(() => null);
    if (body?.error) return body.error;
  }
  return err?.message || fallback;
};

const isMissingReportSchedulesTable = (error: any) => (
  error?.code === 'PGRST205' ||
  error?.message?.includes("Could not find the table 'public.report_schedules'") ||
  error?.message?.includes("relation \"public.report_schedules\" does not exist")
);

const getUserSafeAlertMessage = (message: string) => {
  const containsDatabaseDetails = [
    /new row for relation/i,
    /violates (check|foreign key|unique|not-null) constraint/i,
    /duplicate key value/i,
    /relation ["'].*["'] does not exist/i,
    /column ["'].*["']/i,
    /SQLSTATE/i,
    /PGRST\d+/i
  ].some(pattern => pattern.test(message));

  return containsDatabaseDetails
    ? 'We could not complete that action. Please try again or contact an administrator.'
    : message;
};

interface StoreState {
  currentUser: Profile | null;
  isCheckingSession: boolean;
  isInvitedSession: boolean;
  isLoaded: boolean;
  profiles: Profile[];
  tasks: Task[];
  archivedTasks: Task[];
  categories: Category[];
  statuses: Status[];
  departments: WorkspaceDepartment[];
  theme: Theme;
  alertData: { message: string, type: 'error' | 'success' } | null;
  reminders: { id: string, taskId: string, message: string, type: 'warning' | 'urgent' | 'overdue' }[];
  dashboardTaskFilters: DashboardTaskFilters | null;
  adminSettingsTab: AdminSettingsTab;
  reportSchedules: ReportSchedule[];
  ticketRequests: TicketRequest[];

  setAlertData: (data: { message: string, type: 'error' | 'success' } | null) => void;
  viewMode: 'dashboard' | 'kanban' | 'scrum' | 'tickets' | 'settings' | 'archive' | 'my-tasks' | 'profile' | 'reminders' | 'recurring';
  setViewMode: (mode: 'dashboard' | 'kanban' | 'scrum' | 'tickets' | 'settings' | 'archive' | 'my-tasks' | 'profile' | 'reminders' | 'recurring') => void;
  setDashboardTaskFilters: (filters: DashboardTaskFilters | null) => void;
  setAdminSettingsTab: (tab: AdminSettingsTab) => void;
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
  updateUserDepartment: (userId: string, department: Department | null) => Promise<void>;
  inviteUser: (email: string) => Promise<boolean>;
  resetUserPassword: (userId: string) => Promise<boolean>;
  sendTaskReminderEmail: (taskId: string) => Promise<boolean>;
  sendEmployeeDeadlineReminders: (userId: string) => Promise<void>;
  sendReportEmailNow: () => Promise<boolean>;
  createReportSchedule: (schedule: { schedule_type: string; time_of_day: string; day_of_week?: number; day_of_month?: number }) => Promise<boolean>;
  deleteReportSchedule: (id: string) => Promise<boolean>;
  fetchReportSchedules: () => Promise<void>;
  createTicketRequest: (ticket: Pick<TicketRequest, 'title' | 'description' | 'priority' | 'category' | 'start_date' | 'end_date'>) => Promise<boolean>;
  fetchTicketRequests: () => Promise<void>;
  updateTicketRequestStatus: (id: string, status: TicketStatus) => Promise<void>;
  addCategory: (name: string, color: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addDepartment: (name: string, color: string) => Promise<void>;
  updateDepartmentPrivileges: (
    id: string,
    privileges: Pick<WorkspaceDepartment, 'can_view_all_tasks' | 'hide_tasks_from_other_departments'>
  ) => Promise<void>;
  deleteDepartment: (id: string) => Promise<void>;
  addStatus: (name: string, color: string) => Promise<void>;
  deleteStatus: (id: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  deleteTasks: (ids: string[]) => Promise<boolean>;
  restoreTask: (id: string) => Promise<void>;
  permanentlyDeleteTask: (id: string) => Promise<boolean>;
  permanentlyDeleteTasks: (ids: string[]) => Promise<boolean>;
  dismissReminder: (reminderId: string) => void;
  checkTaskDeadlines: () => void;
  processDueRecurringTasks: () => Promise<void>;
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
    if (saved && ['dashboard', 'kanban', 'scrum', 'tickets', 'settings', 'archive', 'my-tasks', 'profile', 'reminders', 'recurring'].includes(saved)) {
      return saved as StoreState['viewMode'];
    }
  } catch { }
  return 'dashboard';
};

// Guard against multiple initializations
let _initialized = false;
let _isProcessingRecurringTasks = false;

const hasPublicTaskOwner = (task: Partial<Task>) => (
  Boolean(task.is_self_task) ||
  Boolean(task.assignee_id) ||
  Boolean(task.assignee_ids?.length)
);

export const useStore = create<StoreState>((set, get) => ({
  currentUser: null,
  isCheckingSession: true,
  isInvitedSession: false,
  isLoaded: false,
  profiles: [],
  tasks: [],
  archivedTasks: [],
  categories: [],
  statuses: [],
  departments: [],
  theme: getInitialTheme(),
  alertData: null,
  reminders: [],
  dashboardTaskFilters: null,
  adminSettingsTab: 'users',
  reportSchedules: [],
  ticketRequests: [],

  setAlertData: (data) => set({
    alertData: data?.type === 'error'
      ? { ...data, message: getUserSafeAlertMessage(data.message) }
      : data
  }),
  setDashboardTaskFilters: (filters) => set({ dashboardTaskFilters: filters }),
  setAdminSettingsTab: (tab) => set({ adminSettingsTab: tab }),
  
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
      
      return isTaskAssignee(t, currentUser.id) ||
             (t.creator_id === currentUser.id) ||
             (t.observers && t.observers.includes(currentUser.id));
    });

    tasksToCheck.forEach(task => {
      if (!task.end_date) return;
      
      const deadline = new Date(task.end_date);
      const diffMs = deadline.getTime() - now.getTime();
      const diffHrs = diffMs / (1000 * 60 * 60);

      // 1. Overdue (Late)
      if (diffHrs <= 0) {
        const rId = `${task.id}-overdue`;
        if (!reminders.find(r => r.id === rId)) {
          newReminders.push({
            id: rId,
            taskId: task.id,
            message: `LATE: "${task.title}" was due at ${task.end_date}!`,
            type: 'overdue'
          });
        }
      }
      // 2. One Hour Reminder (Urgent)
      else if (diffHrs > 0 && diffHrs <= 1) {
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
      // 3. One Day Reminder (Warning)
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
  processDueRecurringTasks: async () => {
    if (_isProcessingRecurringTasks) return;
    _isProcessingRecurringTasks = true;

    try {
      const { tasks, statuses } = get();
      const now = new Date();
      const defaultStatus = statuses[0]?.name || 'To Do';
      const dueTemplates = tasks.filter(task => (
        task.is_recurring &&
        !task.parent_task_id &&
        task.recurrence_type &&
        task.next_recurrence_at &&
        new Date(task.next_recurrence_at).getTime() <= now.getTime()
      ));

      for (const template of dueTemplates) {
        if (!template.recurrence_type || !template.next_recurrence_at) continue;

        const occurrenceAt = new Date(template.next_recurrence_at);
        if (Number.isNaN(occurrenceAt.getTime())) continue;

        const nextRecurrence = computeNextRecurrenceAfter(
          template.recurrence_type,
          template.recurrence_time,
          template.recurrence_type === 'daily' ? null : template.recurrence_day,
          now
        ).toISOString();

        const { data: claimedTemplate, error: claimError } = await supabase
          .from('tasks')
          .update({ next_recurrence_at: nextRecurrence })
          .eq('id', template.id)
          .eq('next_recurrence_at', template.next_recurrence_at)
          .select()
          .maybeSingle();

        if (claimError || !claimedTemplate) continue;

        const occurrence = buildRecurringTaskOccurrence(template, occurrenceAt, defaultStatus);
        const { data: createdTask, error: insertError } = await supabase
          .from('tasks')
          .insert([occurrence])
          .select()
          .single();

        if (insertError) {
          await supabase
            .from('tasks')
            .update({ next_recurrence_at: template.next_recurrence_at })
            .eq('id', template.id);
          continue;
        }

        set((state) => ({
          tasks: [
            ...state.tasks
              .map(task => task.id === template.id ? { ...task, next_recurrence_at: nextRecurrence } : task)
              .filter(task => task.id !== createdTask.id),
            createdTask
          ]
        }));

        if (!createdTask.reminder_at) {
          try {
            const { error: reminderError } = await supabase.functions.invoke('send-task-reminder', {
              body: { task_id: createdTask.id }
            });

            if (reminderError) throw reminderError;

            get().setAlertData({
              message: `Recurring task "${createdTask.title}" is back to ${defaultStatus}. Reminder email sent.`,
              type: 'success'
            });
          } catch (err: any) {
            const message = await getReminderEmailErrorMessage(err);
            console.warn('Recurring task email reminder failed:', err);
            const isResendTestingLimit = message.includes('You can only send testing emails');
            get().setAlertData({
              message: isResendTestingLimit
                ? 'Recurring task was created, but Resend is in testing mode. Verify a domain or send only to your Resend account email.'
                : `Recurring task was created, but email failed: ${message}`,
              type: 'error'
            });
          }
        }
      }
    } finally {
      _isProcessingRecurringTasks = false;
    }
  },
  viewMode: getInitialViewMode(),
  updatePassword: async (password) => {
    const { error } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false }
    });
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
    const isInvited = Boolean(
      session && (
        params.get('type') === 'signup' ||
        session.user.user_metadata?.must_change_password === true
      )
    );
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
          supabase.from('profiles').select('*, user_roles(role)').eq('id', userId).maybeSingle(),
          supabase.from('tasks').select('*'),
          supabase.from('profiles').select('*, user_roles(role)'),
          supabase.from('categories').select('*').order('sort_order'),
          supabase.from('statuses').select('*').order('sort_order'),
          supabase.from('departments').select('*').order('sort_order')
        ]);

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout: Connection to workspace took too long (10s limit)")), 10000)
        );

        const results = await Promise.race([dataPromise, timeoutPromise]) as any[];
        let [
          { data: profile },
          { data: tasks },
          { data: profiles },
          { data: categories },
          { data: statuses },
          { data: departments }
        ] = results;

        // 2. Handle missing profile (Lazy creation)
        if (!profile) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const userEmail = session.user.email || '';
            const userFullName = session.user.user_metadata?.full_name || userEmail.split('@')[0];
            
            await supabase.from('profiles').upsert({ id: userId, email: userEmail, full_name: userFullName });
            await supabase.from('user_roles').upsert({ user_id: userId, role: 'Worker' });
            
            // Refetch
            const { data: finalP } = await supabase
              .from('profiles')
              .select('*, user_roles(role)')
              .eq('id', userId)
              .single();
            profile = finalP;
            const { data: allP } = await supabase.from('profiles').select('*, user_roles(role)');
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
        if (tasks) {
          set({
            tasks: tasks.filter((task: Task) => !task.deleted_at),
            archivedTasks: tasks.filter((task: Task) => Boolean(task.deleted_at))
          });
        }
        if (profiles) set({ profiles: profiles.map((p: any) => ({ ...p, role: getRole(p) })) });
        if (categories) set({ categories });
        if (statuses) set({ statuses });
        if (departments) set({ departments });
        if (profile && getRole(profile) === 'Admin') {
          const { data: ticketRequests } = await supabase
            .from('ticket_requests')
            .select('*')
            .order('created_at', { ascending: false });
          if (ticketRequests) set({ ticketRequests });
        } else {
          set({ ticketRequests: [] });
        }

        set({ isLoaded: true });
        get().checkTaskDeadlines();
        get().processDueRecurringTasks();
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
        set({
          currentUser: null,
          tasks: [],
          archivedTasks: [],
          profiles: [],
          categories: [],
          statuses: [],
          departments: [],
          ticketRequests: []
        });
      }
    });

    // 4. Hybrid Sync Fallback: Auto-refresh data every 20 seconds
    setInterval(() => {
      get().refreshData?.();
      get().checkTaskDeadlines?.();
      get().processDueRecurringTasks?.();
    }, 20000); 

    // Realtime subscriptions (non-blocking)
    try {
      const handleProfileUpdate = () => {
        supabase.from('profiles').select('*, user_roles(role)').then(({ data }) => {
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
            const currentArchivedTasks = state.archivedTasks;
            if (payload.eventType === 'INSERT') {
              const newTask = payload.new as Task;
              if (newTask.deleted_at) {
                if (currentArchivedTasks.some(task => task.id === newTask.id)) return state;
                return { archivedTasks: [...currentArchivedTasks, newTask] };
              }
              if (currentTasks.some(task => task.id === newTask.id)) return state;
              return { tasks: [...currentTasks, newTask] };
            }
            if (payload.eventType === 'UPDATE') {
              const updatedTask = payload.new as Task;
              if (updatedTask.deleted_at) {
                return {
                  tasks: currentTasks.filter(task => task.id !== updatedTask.id),
                  archivedTasks: [
                    ...currentArchivedTasks.filter(task => task.id !== updatedTask.id),
                    updatedTask
                  ]
                };
              }
              return {
                tasks: [
                  ...currentTasks.filter(task => task.id !== updatedTask.id),
                  updatedTask
                ],
                archivedTasks: currentArchivedTasks.filter(task => task.id !== updatedTask.id)
              };
            }
            if (payload.eventType === 'DELETE') {
              return {
                tasks: currentTasks.filter(task => task.id !== payload.old.id),
                archivedTasks: currentArchivedTasks.filter(task => task.id !== payload.old.id)
              };
            }
            return state;
          });
          get().checkTaskDeadlines();
          get().processDueRecurringTasks();
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

      supabase.channel('rt-departments')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, () => {
          supabase.from('departments').select('*').order('sort_order').then(({ data }) => { if (data) set({ departments: data }); });
        })
        .subscribe();

      supabase.channel('rt-statuses')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'statuses' }, () => {
          supabase.from('statuses').select('*').order('sort_order').then(({ data }) => { if (data) set({ statuses: data }); });
        })
        .subscribe();

      supabase.channel('rt-ticket-requests')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_requests' }, () => {
          if (get().currentUser?.role === 'Admin') get().fetchTicketRequests();
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime subscriptions failed (non-critical):', e);
    }
  },

  addTask: async (taskData) => {
    try {
      if (!hasPublicTaskOwner(taskData)) {
        get().setAlertData({ message: 'Tasks must have at least one assignee.', type: 'error' });
        return { success: false, error: new Error('Tasks must have at least one assignee.') };
      }

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
    const currentTask = prevTasks.find(task => task.id === taskId);
    const nextTask = currentTask ? { ...currentTask, ...updates } : updates;

    if (currentTask && !hasPublicTaskOwner(nextTask)) {
      get().setAlertData({ message: 'Tasks must have at least one assignee.', type: 'error' });
      return;
    }

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
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const { error } = await supabase.functions.invoke('admin-user-password', {
        body: {
          action: 'invite',
          email: normalizedEmail
        }
      });
      if (error) throw error;

      get().setAlertData({
        message: `Account created and invitation sent to ${normalizedEmail}.`,
        type: 'success'
      });
      await get().refreshData();
      return true;
    } catch (err: any) {
      console.error('Invitation request failed:', err);
      const message = await getEdgeFunctionErrorMessage(err, 'Unable to create the invited account.');
      get().setAlertData({ message, type: 'error' });
      return false;
    }
  },

  resetUserPassword: async (userId) => {
    const user = get().profiles.find(profile => profile.id === userId);
    if (!user) return false;

    try {
      const { data, error } = await supabase.functions.invoke('admin-user-password', {
        body: {
          action: 'reset_password',
          user_id: userId
        }
      });
      if (error) throw error;

      get().setAlertData({
        message: data?.email_sent === false
          ? `Password reset for ${user.full_name}. Share the temporary password manually.`
          : `Password reset and emailed to ${user.full_name}.`,
        type: 'success'
      });
      return true;
    } catch (err: any) {
      console.error('Password reset failed:', err);
      const message = await getEdgeFunctionErrorMessage(err, 'Unable to reset this password.');
      get().setAlertData({ message, type: 'error' });
      return false;
    }
  },

  updateUserDepartment: async (userId, department) => {
    const prevProfiles = get().profiles;
    set(state => ({
      profiles: state.profiles.map(profile => (
        profile.id === userId ? { ...profile, department } : profile
      )),
      currentUser: state.currentUser?.id === userId
        ? { ...state.currentUser, department }
        : state.currentUser
    }));

    const { error } = await supabase
      .from('profiles')
      .update({ department })
      .eq('id', userId);

    if (error) {
      set({
        profiles: prevProfiles,
        currentUser: prevProfiles.find(profile => profile.id === get().currentUser?.id) || get().currentUser
      });
      get().setAlertData({ message: `Error updating department: ${error.message}`, type: 'error' });
    } else {
      get().refreshData();
    }
  },

  sendTaskReminderEmail: async (taskId) => {
    const task = get().tasks.find(t => t.id === taskId);
    const recipients = task
      ? get().profiles.filter(profile => (
        task.is_self_task
          ? profile.id === task.creator_id
          : getTaskAssigneeIds(task).includes(profile.id)
      ))
      : [];

    if (!task) {
      get().setAlertData({ message: 'Task not found.', type: 'error' });
      return false;
    }

    if (!recipients.some(recipient => recipient.email)) {
      get().setAlertData({ message: 'This task does not have a recipient email.', type: 'error' });
      return false;
    }

    try {
      const { error } = await supabase.functions.invoke('send-task-reminder', {
        body: { task_id: taskId }
      });

      if (error) throw error;

      get().setAlertData({
        message: `Reminder email sent to ${recipients.map(recipient => recipient.full_name).join(', ')}.`,
        type: 'success'
      });
      return true;
    } catch (err: any) {
      const message = await getReminderEmailErrorMessage(err);
      get().setAlertData({
        message: `Failed to send reminder email: ${message}`,
        type: 'error'
      });
      return false;
    }
  },

  sendEmployeeDeadlineReminders: async (userId) => {
    const { tasks, profiles } = get();
    const user = profiles.find(p => p.id === userId);
    const now = Date.now();
    const remindableTasks = tasks
      .filter(task => (
        isTaskAssignee(task, userId) &&
        task.status !== 'Done' &&
        !task.is_self_task &&
        !!task.end_date &&
        new Date(task.end_date).getTime() > now
      ))
      .sort((a, b) => new Date(a.end_date || 0).getTime() - new Date(b.end_date || 0).getTime());

    if (!user?.email) {
      get().setAlertData({ message: 'This employee does not have an email address.', type: 'error' });
      return;
    }

    if (remindableTasks.length === 0) {
      get().setAlertData({
        message: `${user.full_name} has no active assigned tasks with future deadlines.`,
        type: 'error'
      });
      return;
    }

    let sentCount = 0;
    let lastError = '';

    for (const task of remindableTasks) {
      try {
        const { error } = await supabase.functions.invoke('send-task-reminder', {
          body: { task_id: task.id, recipient_id: userId }
        });

        if (error) throw error;
        sentCount += 1;
      } catch (err: any) {
        lastError = await getReminderEmailErrorMessage(err);
      }
    }

    if (sentCount > 0) {
      get().setAlertData({
        message: `Sent ${sentCount} reminder email${sentCount === 1 ? '' : 's'} to ${user.full_name}.`,
        type: 'success'
      });
      return;
    }

    get().setAlertData({
      message: `No reminder emails were sent. ${lastError}`,
      type: 'error'
    });
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

  addDepartment: async (name, color) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const { departments } = get();
    const { data, error } = await supabase
      .from('departments')
      .insert([{ name: trimmedName, color, sort_order: departments.length }])
      .select()
      .single();

    if (data) {
      set(state => ({ departments: [...state.departments, data] }));
      get().setAlertData({ message: 'Department created.', type: 'success' });
    } else if (error) {
      get().setAlertData({ message: `Error adding department: ${error.message}`, type: 'error' });
    }
  },

  updateDepartmentPrivileges: async (id, privileges) => {
    const prevDepartments = get().departments;

    set(state => ({
      departments: state.departments.map(department => (
        department.id === id ? { ...department, ...privileges } : department
      ))
    }));

    const { error } = await supabase
      .from('departments')
      .update(privileges)
      .eq('id', id);

    if (error) {
      set({ departments: prevDepartments });
      get().setAlertData({ message: `Error updating department privileges: ${error.message}`, type: 'error' });
      return;
    }

    get().setAlertData({ message: 'Department privileges updated.', type: 'success' });
  },

  deleteDepartment: async (id) => {
    const department = get().departments.find(candidate => candidate.id === id);
    if (!department) return;

    const prevDepartments = get().departments;
    const prevProfiles = get().profiles;
    set(state => ({
      departments: state.departments.filter(candidate => candidate.id !== id),
      profiles: state.profiles.map(profile => (
        profile.department === department.name ? { ...profile, department: null } : profile
      )),
      currentUser: state.currentUser?.department === department.name
        ? { ...state.currentUser, department: null }
        : state.currentUser
    }));

    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id);

    if (error) {
      set({
        departments: prevDepartments,
        profiles: prevProfiles,
        currentUser: prevProfiles.find(profile => profile.id === get().currentUser?.id) || get().currentUser
      });
      get().setAlertData({ message: `Error deleting department: ${error.message}`, type: 'error' });
    } else {
      get().setAlertData({ message: 'Department removed.', type: 'success' });
      get().refreshData();
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
        tasks: get().tasks.map(task => {
          const assigneeIds = getTaskAssigneeIds(task).filter(id => id !== userId);
          return isTaskAssignee(task, userId)
            ? { ...task, assignee_id: assigneeIds[0] || null, assignee_ids: assigneeIds }
            : task;
        })
      });
      set({ alertData: { message: 'User successfully erased from workspace', type: 'success' } });
    } catch (err: any) {
      set({ alertData: { message: err.message || 'Failed to erase user', type: 'error' } });
    }
  },

  deleteTask: async (id) => {
    const task = get().tasks.find(candidate => candidate.id === id);
    const currentUser = get().currentUser;
    if (!task || !currentUser) return;

    const archivedTask: Task = {
      ...task,
      deleted_at: new Date().toISOString(),
      deleted_by: currentUser.id
    };

    set(state => ({
      tasks: state.tasks.filter(candidate => candidate.id !== id),
      archivedTasks: [
        ...state.archivedTasks.filter(candidate => candidate.id !== id),
        archivedTask
      ]
    }));

    const { data, error } = await supabase
      .from('tasks')
      .update({
        deleted_at: archivedTask.deleted_at,
        deleted_by: currentUser.id,
        reminder_claimed_at: null
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error || !data) {
      set(state => ({
        tasks: [...state.tasks.filter(candidate => candidate.id !== id), task],
        archivedTasks: state.archivedTasks.filter(candidate => candidate.id !== id)
      }));
      if (error) console.error('Failed to archive task:', error);
      get().setAlertData({
        message: 'The task could not be archived. Please try again.',
        type: 'error'
      });
    } else {
      get().setAlertData({ message: 'Task moved to Archive.', type: 'success' });
    }
  },

  deleteTasks: async (ids) => {
    const uniqueIds = [...new Set(ids)];
    const tasksToArchive = get().tasks.filter(task => uniqueIds.includes(task.id));
    const currentUser = get().currentUser;
    if (!currentUser || tasksToArchive.length === 0) return false;

    const deletedAt = new Date().toISOString();
    const archivedTasks = tasksToArchive.map(task => ({
      ...task,
      deleted_at: deletedAt,
      deleted_by: currentUser.id
    }));
    const taskIds = tasksToArchive.map(task => task.id);

    set(state => ({
      tasks: state.tasks.filter(task => !taskIds.includes(task.id)),
      archivedTasks: [
        ...state.archivedTasks.filter(task => !taskIds.includes(task.id)),
        ...archivedTasks
      ]
    }));

    const { data, error } = await supabase
      .from('tasks')
      .update({
        deleted_at: deletedAt,
        deleted_by: currentUser.id,
        reminder_claimed_at: null
      })
      .in('id', taskIds)
      .select('id');

    if (error || !data || data.length !== taskIds.length) {
      set(state => ({
        tasks: [
          ...state.tasks.filter(task => !taskIds.includes(task.id)),
          ...tasksToArchive
        ],
        archivedTasks: state.archivedTasks.filter(task => !taskIds.includes(task.id))
      }));
      if (error) console.error('Failed to archive tasks:', error);
      get().setAlertData({
        message: 'The selected tasks could not be archived. Please try again.',
        type: 'error'
      });
      return false;
    }

    get().setAlertData({
      message: `${taskIds.length} task${taskIds.length === 1 ? '' : 's'} moved to Archive.`,
      type: 'success'
    });
    return true;
  },

  restoreTask: async (id) => {
    const task = get().archivedTasks.find(candidate => candidate.id === id);
    if (!task) return;

    const restoredTask: Task = {
      ...task,
      deleted_at: null,
      deleted_by: null
    };

    set(state => ({
      archivedTasks: state.archivedTasks.filter(candidate => candidate.id !== id),
      tasks: [...state.tasks.filter(candidate => candidate.id !== id), restoredTask]
    }));

    const { data, error } = await supabase
      .from('tasks')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error || !data) {
      set(state => ({
        tasks: state.tasks.filter(candidate => candidate.id !== id),
        archivedTasks: [...state.archivedTasks.filter(candidate => candidate.id !== id), task]
      }));
      const message = error?.message || 'You do not have permission to restore this task.';
      get().setAlertData({ message: `Error restoring task: ${message}`, type: 'error' });
    } else {
      get().setAlertData({ message: 'Task restored successfully.', type: 'success' });
    }
  },

  permanentlyDeleteTask: async (id) => {
    const task = get().archivedTasks.find(candidate => candidate.id === id);
    if (!task) return false;

    set(state => ({
      archivedTasks: state.archivedTasks.filter(candidate => candidate.id !== id)
    }));

    const { data, error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      set(state => ({
        archivedTasks: [...state.archivedTasks.filter(candidate => candidate.id !== id), task]
      }));
      const message = error?.message || 'You do not have permission to permanently delete this task.';
      get().setAlertData({ message: `Error permanently deleting task: ${message}`, type: 'error' });
      return false;
    }

    get().setAlertData({ message: 'Task permanently deleted.', type: 'success' });
    return true;
  },

  permanentlyDeleteTasks: async (ids) => {
    const uniqueIds = [...new Set(ids)];
    const tasksToDelete = get().archivedTasks.filter(task => uniqueIds.includes(task.id));
    const taskIds = tasksToDelete.map(task => task.id);
    if (taskIds.length === 0) return false;

    set(state => ({
      archivedTasks: state.archivedTasks.filter(task => !taskIds.includes(task.id))
    }));

    const { data, error } = await supabase
      .from('tasks')
      .delete()
      .in('id', taskIds)
      .not('deleted_at', 'is', null)
      .select('id');

    if (error || !data || data.length !== taskIds.length) {
      set(state => ({
        archivedTasks: [
          ...state.archivedTasks.filter(task => !taskIds.includes(task.id)),
          ...tasksToDelete
        ]
      }));
      if (error) console.error('Failed to permanently delete archived tasks:', error);
      get().setAlertData({
        message: 'The selected archived tasks could not be deleted. Please try again.',
        type: 'error'
      });
      return false;
    }

    get().setAlertData({
      message: `${taskIds.length} archived task${taskIds.length === 1 ? '' : 's'} permanently deleted.`,
      type: 'success'
    });
    return true;
  },

  logout: async () => {
    await supabase.auth.signOut();
  },

  getVisibleTasks: () => {
    const { tasks, currentUser, profiles, departments } = get();
    if (!currentUser) return [];

    return tasks.filter(task => {
      // If it's a self-task, ONLY the creator can see it, regardless of role.
      if (task.is_self_task) {
        return task.creator_id === currentUser.id;
      }
      
      if (currentUser.role === 'Admin') return true;
      return isTaskAssignee(task, currentUser.id) ||
        (task.creator_id === currentUser.id) ||
        (task.observers && task.observers.includes(currentUser.id)) ||
        canViewTaskByDepartment(task, currentUser, profiles, departments);
    });
  },
  sendReportEmailNow: async () => {
    const { currentUser, profiles } = get();

    if (currentUser?.role !== 'Admin') {
      get().setAlertData({ message: 'Only admins can send report emails.', type: 'error' });
      return false;
    }

    if (!profiles.some(profile => profile.role === 'Admin' && profile.email)) {
      get().setAlertData({ message: 'No admin email addresses are available for this report.', type: 'error' });
      return false;
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-task-reminder', {
        body: { send_report: true }
      });

      if (error) throw error;

      get().setAlertData({
        message: `Report sent to ${data?.recipientCount || 'all'} admin${data?.recipientCount === 1 ? '' : 's'} via email.`,
        type: 'success'
      });
      return true;
    } catch (err: any) {
      const message = await getReminderEmailErrorMessage(err);
      const context = err?.context;
      const status = context?.status || context?.response?.status;

      if (status === 404 || message.includes('Failed to send a request to the Edge Function')) {
        get().setAlertData({
          message: 'The send-task-reminder Edge Function needs to be re-deployed with the latest code to support report sending.',
          type: 'error'
        });
      } else {
        get().setAlertData({ message: `Failed to send report: ${message}`, type: 'error' });
      }
      return false;
    }
  },

  createReportSchedule: async (schedule) => {
    const currentUser = get().currentUser;
    if (currentUser?.role !== 'Admin') {
      get().setAlertData({ message: 'Only admins can schedule report emails.', type: 'error' });
      return false;
    }

    const { data, error } = await supabase.from('report_schedules').insert([{
      created_by: currentUser.id,
      schedule_type: schedule.schedule_type,
      time_of_day: schedule.time_of_day,
      day_of_week: schedule.day_of_week ?? null,
      day_of_month: schedule.day_of_month ?? null
    }]).select().single();

    if (error) {
      get().setAlertData({ message: `Error creating schedule: ${error.message}`, type: 'error' });
      return false;
    }

    set(s => ({ reportSchedules: [...s.reportSchedules, data] }));
    get().setAlertData({ message: 'Report schedule created.', type: 'success' });
    return true;
  },

  deleteReportSchedule: async (id) => {
    const { error } = await supabase.from('report_schedules').delete().eq('id', id);

    if (error) {
      get().setAlertData({ message: `Error deleting schedule: ${error.message}`, type: 'error' });
      return false;
    }

    set(s => ({ reportSchedules: s.reportSchedules.filter(rs => rs.id !== id) }));
    get().setAlertData({ message: 'Report schedule removed.', type: 'success' });
    return true;
  },

  fetchReportSchedules: async () => {
    const { data, error } = await supabase
      .from('report_schedules')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingReportSchedulesTable(error)) {
        set({ reportSchedules: [] });
        return;
      }

      get().setAlertData({ message: `Error loading report schedules: ${error.message}`, type: 'error' });
      return;
    }

    if (data) set({ reportSchedules: data });
  },

  createTicketRequest: async (ticket) => {
    const currentUser = get().currentUser;
    if (!currentUser) return false;

    const { data, error } = await supabase
      .from('ticket_requests')
      .insert([{
        requester_id: currentUser.id,
        title: ticket.title,
        description: ticket.description || null,
        priority: ticket.priority,
        category: ticket.category || null,
        start_date: ticket.start_date || null,
        end_date: ticket.end_date || null
      }])
      .select()
      .single();

    if (error) {
      get().setAlertData({ message: `Error submitting ticket: ${error.message}`, type: 'error' });
      return false;
    }

    if (currentUser.role === 'Admin' && data) {
      set(state => ({ ticketRequests: [data, ...state.ticketRequests] }));
    }

    get().setAlertData({ message: 'Ticket request submitted to admins.', type: 'success' });
    return true;
  },

  fetchTicketRequests: async () => {
    if (get().currentUser?.role !== 'Admin') {
      set({ ticketRequests: [] });
      return;
    }

    const { data, error } = await supabase
      .from('ticket_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      get().setAlertData({ message: `Error loading tickets: ${error.message}`, type: 'error' });
      return;
    }

    if (data) set({ ticketRequests: data });
  },

  updateTicketRequestStatus: async (id, status) => {
    const previousTickets = get().ticketRequests;
    set(state => ({
      ticketRequests: state.ticketRequests.map(ticket => (
        ticket.id === id ? { ...ticket, status } : ticket
      ))
    }));

    const { error } = await supabase
      .from('ticket_requests')
      .update({ status })
      .eq('id', id);

    if (error) {
      set({ ticketRequests: previousTickets });
      get().setAlertData({ message: `Error updating ticket: ${error.message}`, type: 'error' });
    }
  },

  getDashboardTasks: () => {
    const { tasks, currentUser, profiles, departments } = get();
    if (!currentUser) return [];

    return tasks.filter(task => {
      // 1. Never count private self-tasks in the 'overall' dashboard/totals
      if (task.is_self_task) return false;

      // 2. Admins see all public tasks
      if (currentUser.role === 'Admin') return true;

      // 3. Workers see public tasks they are involved in (assigned, created, or observing)
      return isTaskAssignee(task, currentUser.id) ||
             (task.creator_id === currentUser.id) ||
             (task.observers && task.observers.includes(currentUser.id)) ||
             canViewTaskByDepartment(task, currentUser, profiles, departments);
    });
  }
}));
