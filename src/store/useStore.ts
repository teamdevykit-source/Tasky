import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { canViewTaskByDepartment, getTaskAssigneeIds, isTaskAssignee, isTaskComplete, supabase } from '../lib/supabase';
import type {
  Category,
  Department,
  Profile,
  ReportSchedule,
  Status,
  Task,
  TicketRequest,
  TicketStatus,
  UserRole,
  WorkspaceDepartment
} from '../lib/supabase';
import { withTimeout } from '../lib/async';
import {
  sanitizeTaskUpdates,
  WORKSPACE_SELECTS
} from '../lib/workspaceContract';
import type { TaskUpdate } from '../lib/workspaceContract';

type Theme = 'light' | 'dark';
type AdminSettingsTab = 'users' | 'departments' | 'categories' | 'statuses';

export interface DashboardTaskFilters {
  status?: string;
  category?: string;
  assignee?: string;
  selfTasks?: 'all' | 'only' | 'hide';
}

type ErrorLike = {
  message?: string;
  code?: string;
  context?: Response | { status?: number; response?: { status?: number } };
};

type ProfileRow = Omit<Profile, 'role'> & {
  user_roles?: { role?: UserRole } | { role?: UserRole }[] | null;
};

const asErrorLike = (error: unknown): ErrorLike => (
  typeof error === 'object' && error !== null ? error as ErrorLike : {}
);

const getContextStatus = (context: ErrorLike['context']) => {
  if (!context) return undefined;
  if (context instanceof Response) return context.status;
  return context.status || context.response?.status;
};

const getReminderEmailErrorMessage = async (error: unknown) => {
  const err = asErrorLike(error);
  const message = err.message || 'Failed to send reminder email.';
  const context = err.context;
  const status = getContextStatus(context);

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

const getEdgeFunctionErrorMessage = async (error: unknown, fallback: string) => {
  const err = asErrorLike(error);
  const context = err.context;
  if (context instanceof Response) {
    const body = await context.clone().json().catch(() => null);
    if (body?.error) return body.error;
  }
  return err?.message || fallback;
};

const isMissingReportSchedulesTable = (error: unknown) => {
  const err = asErrorLike(error);
  return err.code === 'PGRST205' ||
  err.message?.includes("Could not find the table 'public.report_schedules'") ||
  err.message?.includes("relation \"public.report_schedules\" does not exist");
};

const mapProfile = (profile: ProfileRow): Profile => {
  const roleRelation = Array.isArray(profile.user_roles)
    ? profile.user_roles[0]
    : profile.user_roles;
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    job_title: profile.job_title,
    department: profile.department,
    role: roleRelation?.role || 'Worker'
  };
};

const SESSION_TIMEOUT_MS = 10000;
const DATA_REQUEST_TIMEOUT_MS = 15000;
const WORKSPACE_LOAD_TIMEOUT_MS = 30000;

const fetchPagedRows = async <T>(table: string, select = '*'): Promise<T[]> => {
  const pageSize = 500;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const query = supabase
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    const { data, error } = await withTimeout(
      query,
      DATA_REQUEST_TIMEOUT_MS,
      `Loading ${table}`
    );
    if (error) throw error;
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};

const getUserSafeAlertMessage = (message: string) => {
  if (/row-level security policy/i.test(message)) {
    return 'Your permissions or session changed. Refresh the page and sign in again if needed.';
  }

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
  initializationError: string | null;
  isInvitedSession: boolean;
  isPasswordRecoverySession: boolean;
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
  initialize: () => Promise<void>;
  retryInitialization: () => Promise<void>;
  dispose: () => void;
  refreshData: () => Promise<void>;
  addTask: (
    taskData: Omit<Task, 'id' | 'created_at'>
  ) => Promise<{ success: boolean; data?: Task; error?: unknown }>;
  updateTask: (taskId: string, updates: TaskUpdate) => Promise<boolean>;
  updateTaskStatus: (taskId: string, status: string) => Promise<boolean>;
  updateUserRole: (userId: string, role: Profile['role']) => Promise<void>;
  updateUserJobTitle: (userId: string, jobTitle: string) => Promise<void>;
  updateUserDepartment: (userId: string, department: Department | null) => Promise<void>;
  inviteUser: (email: string) => Promise<boolean>;
  resetUserPassword: (userId: string) => Promise<boolean>;
  sendTaskReminderEmail: (taskId: string) => Promise<boolean>;
  sendEmployeeDeadlineReminders: (userId: string) => Promise<void>;
  sendReportEmailNow: () => Promise<boolean>;
  createReportSchedule: (schedule: {
    schedule_type: string;
    time_of_day: string;
    day_of_week?: number;
    day_of_month?: number;
    timezone: string;
  }) => Promise<boolean>;
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
  setCompletedStatus: (id: string) => Promise<void>;
  deleteStatus: (id: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  deleteTask: (id: string) => Promise<boolean>;
  deleteTasks: (ids: string[]) => Promise<boolean>;
  restoreTask: (id: string) => Promise<void>;
  permanentlyDeleteTask: (id: string) => Promise<boolean>;
  permanentlyDeleteTasks: (ids: string[]) => Promise<boolean>;
  dismissReminder: (reminderId: string) => void;
  checkTaskDeadlines: () => void;
  logout: () => Promise<void>;
  getDashboardTasks: () => Task[];
}

const getInitialTheme = (): Theme => {
  try {
    const saved = localStorage.getItem('elmeraki-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage may be unavailable in restricted browsing contexts.
  }
  return 'dark';
};

const applyTheme = (theme: Theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('elmeraki-theme', theme);
  } catch {
    // Theme still applies for the current session.
  }
};

// Apply initial theme immediately
applyTheme(getInitialTheme());

const getInitialViewMode = (): StoreState['viewMode'] => {
  try {
    const saved = localStorage.getItem('elmeraki-view');
    if (saved && ['dashboard', 'kanban', 'scrum', 'tickets', 'settings', 'archive', 'my-tasks', 'profile', 'reminders', 'recurring'].includes(saved)) {
      return saved as StoreState['viewMode'];
    }
  } catch {
    // Fall back to the dashboard when preferences cannot be read.
  }
  return 'dashboard';
};

// Guard against multiple initializations
let _initialized = false;
let _loadSequence = 0;
let _loadingSequence = 0;
let _lifecycleGeneration = 0;
let _disposeSync: (() => void) | null = null;
let _workspaceLoadPromise: Promise<void> | null = null;
let _workspaceLoadUserId: string | null = null;

const hasPublicTaskOwner = (task: Partial<Task>) => (
  Boolean(task.is_self_task) ||
  Boolean(task.assignee_id) ||
  Boolean(task.assignee_ids?.length)
);

const splitTasksByArchiveState = (tasks: Task[]) => ({
  tasks: tasks.filter(task => !task.deleted_at),
  archivedTasks: tasks.filter(task => Boolean(task.deleted_at))
});

const dismissedReminderIds = new Set<string>();
try {
  const savedDismissals = JSON.parse(localStorage.getItem('elmeraki-dismissed-reminders') || '[]');
  if (Array.isArray(savedDismissals)) {
    savedDismissals.filter((value): value is string => typeof value === 'string')
      .forEach(value => dismissedReminderIds.add(value));
  }
} catch {
  // A malformed preference must not prevent the app from loading.
}

const persistReminderDismissals = () => {
  try {
    localStorage.setItem(
      'elmeraki-dismissed-reminders',
      JSON.stringify([...dismissedReminderIds].slice(-500))
    );
  } catch {
    // Storage can be unavailable in private browsing; in-memory dismissal still works.
  }
};

export const useStore = create<StoreState>((set, get) => ({
  currentUser: null,
  isCheckingSession: true,
  initializationError: null,
  isInvitedSession: false,
  isPasswordRecoverySession: false,
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
  
  dismissReminder: (id) => {
    dismissedReminderIds.add(id);
    persistReminderDismissals();
    set(state => ({ reminders: state.reminders.filter(reminder => reminder.id !== id) }));
  },

  checkTaskDeadlines: () => {
    const { currentUser, statuses } = get();
    if (!currentUser) return;

    const newReminders: StoreState['reminders'] = [];
    const now = new Date();
    
    const tasksToCheck = get().getVisibleTasks().filter(task => (
      !isTaskComplete(task, statuses)
      && !(task.is_recurring && !task.parent_task_id)
    ));

    tasksToCheck.forEach(task => {
      if (!task.end_date) return;
      
      const deadline = new Date(task.end_date);
      const diffMs = deadline.getTime() - now.getTime();
      const diffHrs = diffMs / (1000 * 60 * 60);

      // 1. Overdue (Late)
      if (diffHrs <= 0) {
        const rId = `${task.id}-${task.end_date}-overdue`;
        if (!dismissedReminderIds.has(rId)) {
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
        const rId = `${task.id}-${task.end_date}-one-hour`;
        if (!dismissedReminderIds.has(rId)) {
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
        const rId = `${task.id}-${task.end_date}-one-day`;
        if (!dismissedReminderIds.has(rId)) {
          newReminders.push({
            id: rId,
            taskId: task.id,
            message: `REMINDER: "${task.title}" is due in less than 24 hours.`,
            type: 'warning'
          });
        }
      }
    });

    set({ reminders: newReminders });
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
    set({
      alertData: { message: 'Password updated successfully!', type: 'success' },
      isInvitedSession: false,
      isPasswordRecoverySession: false
    });
  },
  updateProfile: async (updates) => {
    const { currentUser } = get();
    if (!currentUser) return;

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', currentUser.id)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      const updateError = error || new Error('Your profile was not updated.');
      set({ alertData: { message: updateError.message, type: 'error' } });
      throw updateError;
    }

    if (updates.full_name) {
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: updates.full_name }
      });
      if (authError) {
        await supabase
          .from('profiles')
          .update({ full_name: currentUser.full_name })
          .eq('id', currentUser.id);
        set({ alertData: { message: authError.message, type: 'error' } });
        throw authError;
      }
    }
    
    set({ 
      currentUser: { ...currentUser, ...updates },
      profiles: get().profiles.map(p => p.id === currentUser.id ? { ...p, ...updates } : p)
    });
  },
  setViewMode: (mode) => {
    try {
      localStorage.setItem('elmeraki-view', mode);
    } catch {
      // Navigation still works without persistence.
    }
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
    if (_initialized) return;
    _initialized = true;
    const lifecycleGeneration = ++_lifecycleGeneration;
    const sessionLoaderId = ++_loadingSequence;
    set({ isCheckingSession: true, initializationError: null });

    const { data: recoveryListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY' && nextSession) {
        set({ isPasswordRecoverySession: true });
      }
    });

    let session: Session | null;
    try {
      const sessionResult = await withTimeout(
        supabase.auth.getSession(),
        SESSION_TIMEOUT_MS,
        'Session check'
      );
      if (sessionResult.error) throw sessionResult.error;
      session = sessionResult.data.session;
    } catch (error: unknown) {
      recoveryListener.subscription.unsubscribe();
      if (lifecycleGeneration !== _lifecycleGeneration) return;
      _initialized = false;
      const message = asErrorLike(error).message || 'Unable to initialize your session.';
      set({
        isCheckingSession: false,
        initializationError: getUserSafeAlertMessage(message)
      });
      return;
    }

    if (lifecycleGeneration !== _lifecycleGeneration) {
      recoveryListener.subscription.unsubscribe();
      return;
    }

    const isInvitationSession = (candidate: Session | null) => {
      const currentParams = new URLSearchParams(window.location.search);
      return Boolean(
        candidate && (
          currentParams.get('type') === 'signup' ||
          candidate.user.user_metadata?.must_change_password === true
        )
      );
    };
    set({ isInvitedSession: isInvitationSession(session) });

    const performWorkspaceLoad = async (userId: string) => {
      const requestId = ++_loadSequence;
      let profiles: ProfileRow[];

      const [initialProfiles, tasks, categories, statuses, departments, ticketRequests] =
        await withTimeout(
          Promise.all([
            fetchPagedRows<ProfileRow>('profiles', WORKSPACE_SELECTS.profiles),
            fetchPagedRows<Task>('tasks', WORKSPACE_SELECTS.tasks),
            fetchPagedRows<Category>('categories', WORKSPACE_SELECTS.categories),
            fetchPagedRows<Status>('statuses', WORKSPACE_SELECTS.statuses),
            fetchPagedRows<WorkspaceDepartment>('departments', WORKSPACE_SELECTS.departments),
            fetchPagedRows<TicketRequest>('ticket_requests', WORKSPACE_SELECTS.ticket_requests)
          ]),
          WORKSPACE_LOAD_TIMEOUT_MS,
          'Workspace loading'
        );

      profiles = initialProfiles;
      let profile = profiles.find(candidate => candidate.id === userId) || null;

      if (!profile) {
        const currentSessionResult = await withTimeout(
          supabase.auth.getSession(),
          SESSION_TIMEOUT_MS,
          'Session verification'
        );
        if (currentSessionResult.error) throw currentSessionResult.error;
        const currentSession = currentSessionResult.data.session;
        if (!currentSession || currentSession.user.id !== userId) {
          throw new Error('Your session changed while the workspace was loading.');
        }

        const userEmail = currentSession.user.email || '';
        const userFullName = currentSession.user.user_metadata?.full_name || userEmail.split('@')[0];
        const profileResult = await withTimeout(
          supabase.from('profiles').upsert({
            id: userId,
            email: userEmail,
            full_name: userFullName
          }),
          DATA_REQUEST_TIMEOUT_MS,
          'Creating your profile'
        );
        if (profileResult.error) throw profileResult.error;

        const roleResult = await withTimeout(
          supabase.from('user_roles').upsert({ user_id: userId, role: 'Worker' }),
          DATA_REQUEST_TIMEOUT_MS,
          'Creating your workspace role'
        );
        if (roleResult.error) throw roleResult.error;

        profiles = await fetchPagedRows<ProfileRow>('profiles', WORKSPACE_SELECTS.profiles);
        profile = profiles.find(candidate => candidate.id === userId) || null;
      }

      if (!profile) {
        throw new Error('Your authenticated account does not have an accessible workspace profile.');
      }

      if (
        requestId !== _loadSequence ||
        lifecycleGeneration !== _lifecycleGeneration
      ) return;

      set({
        currentUser: mapProfile(profile),
        ...splitTasksByArchiveState(tasks),
        profiles: profiles.map(mapProfile),
        categories: [...categories].sort((a, b) => a.sort_order - b.sort_order),
        statuses: [...statuses].sort((a, b) => a.sort_order - b.sort_order),
        departments: [...departments].sort((a, b) => a.sort_order - b.sort_order),
        ticketRequests: [...ticketRequests].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        isLoaded: true,
        initializationError: null
      });
      get().checkTaskDeadlines();
    };

    const loadData = async (userId: string, isSilent = false) => {
      if (!isSilent && get().isLoaded && get().currentUser?.id === userId) return;

      const loaderId = isSilent ? null : ++_loadingSequence;
      if (loaderId !== null) {
        set({ isCheckingSession: true, initializationError: null });
      }

      let loadPromise = _workspaceLoadUserId === userId ? _workspaceLoadPromise : null;
      if (!loadPromise) {
        const trackedPromise = performWorkspaceLoad(userId).finally(() => {
          if (_workspaceLoadPromise === trackedPromise) {
            _workspaceLoadPromise = null;
            _workspaceLoadUserId = null;
          }
        });
        _workspaceLoadPromise = trackedPromise;
        _workspaceLoadUserId = userId;
        loadPromise = trackedPromise;
      }

      try {
        await loadPromise;
      } catch (error: unknown) {
        console.error('Workspace loading error:', error);
        if (!isSilent && lifecycleGeneration === _lifecycleGeneration) {
          const message = asErrorLike(error).message ||
            'Could not load your workspace. Please check your connection and try again.';
          set({
            initializationError: getUserSafeAlertMessage(message),
            isLoaded: false
          });
        }
      } finally {
        if (
          loaderId !== null &&
          loaderId === _loadingSequence &&
          lifecycleGeneration === _lifecycleGeneration
        ) {
          set({ isCheckingSession: false });
        }
      }
    };

    set({
      refreshData: async () => {
        try {
          const result = await withTimeout(
            supabase.auth.getSession(),
            SESSION_TIMEOUT_MS,
            'Session refresh'
          );
          if (result.error) throw result.error;
          if (result.data.session) {
            await loadData(result.data.session.user.id, true);
          }
        } catch (error: unknown) {
          console.warn('Unable to refresh the workspace:', asErrorLike(error).message);
        }
      }
    });

    if (session) {
      await loadData(session.user.id);
    } else if (sessionLoaderId === _loadingSequence) {
      set({ isCheckingSession: false, initializationError: null });
    }

    if (lifecycleGeneration !== _lifecycleGeneration) {
      recoveryListener.subscription.unsubscribe();
      return;
    }

    const handleAuthChange = async (event: AuthChangeEvent, nextSession: Session | null) => {
      if (lifecycleGeneration !== _lifecycleGeneration) return;

      if (!nextSession) {
        if (event !== 'SIGNED_OUT' && event !== 'INITIAL_SESSION') return;
        ++_loadSequence;
        ++_loadingSequence;
        _workspaceLoadPromise = null;
        _workspaceLoadUserId = null;
        set({
          currentUser: null,
          isCheckingSession: false,
          initializationError: null,
          isInvitedSession: false,
          isPasswordRecoverySession: false,
          isLoaded: false,
          tasks: [],
          archivedTasks: [],
          profiles: [],
          categories: [],
          statuses: [],
          departments: [],
          reportSchedules: [],
          ticketRequests: [],
          reminders: []
        });
        return;
      }

      set({
        isInvitedSession: isInvitationSession(nextSession),
        isPasswordRecoverySession: event === 'PASSWORD_RECOVERY'
          ? true
          : get().isPasswordRecoverySession
      });

      if (event === 'TOKEN_REFRESHED') return;

      const isCurrentWorkspace = get().isLoaded && get().currentUser?.id === nextSession.user.id;
      if (event === 'INITIAL_SESSION' && isCurrentWorkspace) return;
      if (event === 'SIGNED_IN' && isCurrentWorkspace) return;

      if (event === 'USER_UPDATED' && isCurrentWorkspace) {
        await loadData(nextSession.user.id, true);
        return;
      }

      if (!isCurrentWorkspace) {
        ++_loadSequence;
        set({
          currentUser: null,
          isLoaded: false,
          tasks: [],
          archivedTasks: [],
          reminders: []
        });
      }
      await loadData(nextSession.user.id);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      queueMicrotask(() => {
        void handleAuthChange(event, nextSession);
      });
    });
    recoveryListener.subscription.unsubscribe();

    const refreshInterval = window.setInterval(() => {
      void get().refreshData();
      get().checkTaskDeadlines();
    }, 60000);

    // Browser tabs can miss realtime events while suspended. Reconcile with the
    // database as soon as the user returns or the connection comes back online.
    const refreshWhenActive = () => {
      if (document.visibilityState === 'visible') void get().refreshData();
    };
    window.addEventListener('focus', refreshWhenActive);
    window.addEventListener('online', refreshWhenActive);
    document.addEventListener('visibilitychange', refreshWhenActive);

    // Realtime subscriptions (non-blocking)
    try {
      const refreshWorkspace = () => void get().refreshData();

      supabase.channel('rt-tasks')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
          const deletedTaskId = payload.eventType === 'DELETE'
            ? (payload.old as Partial<Task>).id
            : null;

          // A DELETE normally includes the primary key. If it does not, fetch the
          // authoritative task list instead of leaving a stale task in local state.
          if (payload.eventType === 'DELETE' && !deletedTaskId) {
            void get().refreshData();
            return;
          }

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
                tasks: currentTasks.filter(task => task.id !== deletedTaskId),
                archivedTasks: currentArchivedTasks.filter(task => task.id !== deletedTaskId)
              };
            }
            return state;
          });
          get().checkTaskDeadlines();
        })
        .subscribe(status => {
          // Realtime can reconnect after changes occurred. A fresh server read on
          // every successful subscription closes that gap for all admins.
          if (status === 'SUBSCRIBED') void get().refreshData();
        });

      supabase.channel('rt-profiles')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refreshWorkspace)
        .subscribe();

      supabase.channel('rt-user-roles')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, refreshWorkspace)
        .subscribe();

      supabase.channel('rt-categories')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
          supabase.from('categories').select(WORKSPACE_SELECTS.categories).order('sort_order')
            .then(({ data }) => { if (data) set({ categories: data }); });
        })
        .subscribe();

      supabase.channel('rt-departments')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, () => {
          supabase.from('departments').select(WORKSPACE_SELECTS.departments).order('sort_order')
            .then(({ data }) => { if (data) set({ departments: data }); });
        })
        .subscribe();

      supabase.channel('rt-statuses')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'statuses' }, () => {
          supabase.from('statuses').select(WORKSPACE_SELECTS.statuses).order('sort_order')
            .then(({ data }) => { if (data) set({ statuses: data }); });
        })
        .subscribe();

      supabase.channel('rt-ticket-requests')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_requests' }, () => {
          void get().fetchTicketRequests();
        })
        .subscribe();

      supabase.channel('rt-report-schedules')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'report_schedules' }, () => {
          if (get().currentUser?.role === 'Admin') void get().fetchReportSchedules();
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime subscriptions failed (non-critical):', e);
    }

    _disposeSync = () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener('focus', refreshWhenActive);
      window.removeEventListener('online', refreshWhenActive);
      document.removeEventListener('visibilitychange', refreshWhenActive);
      authListener.subscription.unsubscribe();
      void supabase.removeAllChannels();
    };
  },

  retryInitialization: async () => {
    get().dispose();
    set({
      isCheckingSession: true,
      initializationError: null,
      isLoaded: false
    });
    await get().initialize();
  },

  dispose: () => {
    _disposeSync?.();
    _disposeSync = null;
    _initialized = false;
    ++_loadSequence;
    ++_loadingSequence;
    ++_lifecycleGeneration;
    _workspaceLoadPromise = null;
    _workspaceLoadUserId = null;
  },

  addTask: async (taskData) => {
    try {
      const currentUser = get().currentUser;
      if (!currentUser) {
        const error = new Error('Your session is not ready. Please sign in again.');
        get().setAlertData({ message: error.message, type: 'error' });
        return { success: false, error };
      }

      const userResult = await withTimeout(
        supabase.auth.getUser(),
        SESSION_TIMEOUT_MS,
        'Task identity verification'
      );
      if (userResult.error) throw userResult.error;
      if (userResult.data.user?.id !== taskData.creator_id) {
        const error = new Error('Your session changed. Please sign in again before creating a task.');
        get().setAlertData({ message: error.message, type: 'error' });
        return { success: false, error };
      }

      const roleResult = await withTimeout(
        supabase.rpc('current_user_role'),
        SESSION_TIMEOUT_MS,
        'Task permission verification'
      );
      if (roleResult.error) throw roleResult.error;

      const authoritativeRole = roleResult.data as UserRole | null;
      if (authoritativeRole !== 'Admin' && authoritativeRole !== 'Worker') {
        const error = new Error('Your account does not have an active workspace role.');
        get().setAlertData({ message: error.message, type: 'error' });
        return { success: false, error };
      }

      if (authoritativeRole !== currentUser.role) {
        set(state => ({
          currentUser: state.currentUser
            ? { ...state.currentUser, role: authoritativeRole }
            : state.currentUser,
          profiles: state.profiles.map(profile => (
            profile.id === currentUser.id
              ? { ...profile, role: authoritativeRole }
              : profile
          ))
        }));
      }

      if (authoritativeRole !== 'Admin' && !taskData.is_self_task) {
        const error = new Error('Workers can create only private tasks.');
        get().setAlertData({ message: error.message, type: 'error' });
        return { success: false, error };
      }

      if (!hasPublicTaskOwner(taskData)) {
        get().setAlertData({ message: 'Tasks must have at least one assignee.', type: 'error' });
        return { success: false, error: new Error('Tasks must have at least one assignee.') };
      }

      const insertPayload = Object.fromEntries(
        Object.entries(taskData).filter(([, value]) => value !== undefined)
      ) as Omit<Task, 'id' | 'created_at'>;

      const insertTask = () => withTimeout(
        supabase
          .from('tasks')
          .insert([insertPayload])
          .select()
          .single(),
        DATA_REQUEST_TIMEOUT_MS,
        'Creating task'
      );

      let { data, error } = await insertTask();
      if (error?.code === '42501' || /row-level security policy/i.test(error?.message || '')) {
        const refreshResult = await withTimeout(
          supabase.auth.refreshSession(),
          SESSION_TIMEOUT_MS,
          'Refreshing task permissions'
        );
        if (!refreshResult.error && refreshResult.data.user?.id === taskData.creator_id) {
          ({ data, error } = await insertTask());
        }
      }

      if (error) {
        console.error('Task creation failed:', error);
        get().setAlertData({
          message: 'Error adding task: ' + getUserSafeAlertMessage(error.message),
          type: 'error'
        });
        return { success: false, error };
      }
      set((state) => ({ tasks: [...state.tasks, data] }));
      void get().refreshData(); // Sync for clients whose realtime connection is unavailable.
      return { success: true, data };
    } catch (error: unknown) {
      get().setAlertData({
        message: `Network or session error: ${asErrorLike(error).message || 'Unknown error'}`,
        type: 'error'
      });
      return { success: false, error };
    }
  },

  updateTask: async (taskId, updates) => {
    const currentTask = get().tasks.find(task => task.id === taskId);
    if (!currentTask) {
      get().setAlertData({ message: 'This task is no longer available.', type: 'error' });
      return false;
    }

    const sanitizedUpdates = sanitizeTaskUpdates(updates);
    if (Object.keys(sanitizedUpdates).length === 0) return true;

    const nextTask = { ...currentTask, ...sanitizedUpdates };

    if (!hasPublicTaskOwner(nextTask)) {
      get().setAlertData({ message: 'Tasks must have at least one assignee.', type: 'error' });
      return false;
    }

    set((state) => ({
      tasks: state.tasks.map(task => task.id === taskId ? nextTask : task)
    }));

    try {
      const result = await withTimeout(
        supabase
          .from('tasks')
          .update(sanitizedUpdates)
          .eq('id', taskId)
          .select('id')
          .maybeSingle(),
        DATA_REQUEST_TIMEOUT_MS,
        'Updating task'
      );

      if (result.error) throw result.error;
      if (!result.data) {
        throw new Error('The task was not updated. It may have been removed or your access changed.');
      }

      void get().refreshData();
      return true;
    } catch (error: unknown) {
      set(state => ({
        tasks: state.tasks.map(task => task.id === taskId ? currentTask : task)
      }));
      get().setAlertData({
        message: `Error updating task: ${getUserSafeAlertMessage(
          asErrorLike(error).message || 'Please try again.'
        )}`,
        type: 'error'
      });
      return false;
    }
  },

  updateTaskStatus: async (taskId, status) => get().updateTask(taskId, { status }),

  updateUserRole: async (userId, role) => {
    // Optimistic
    const prevProfiles = get().profiles;
    set((state) => ({
      profiles: state.profiles.map(p => p.id === userId ? { ...p, role } : p)
    }));
    const { data, error } = await supabase
      .from('user_roles')
      .update({ role })
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      const previousProfile = prevProfiles.find(profile => profile.id === userId);
      if (previousProfile) {
        set(state => ({
          profiles: state.profiles.map(profile => profile.id === userId ? previousProfile : profile)
        }));
      }
      get().setAlertData({
        message: `Error updating role: ${error?.message || 'No workspace role was updated.'}`,
        type: 'error'
      });
    }
  },

  updateUserJobTitle: async (userId, jobTitle) => {
    const prevProfiles = get().profiles;
    set((state) => ({
      profiles: state.profiles.map(p => p.id === userId ? { ...p, job_title: jobTitle } : p)
    }));
    const { data, error } = await supabase
      .from('profiles')
      .update({ job_title: jobTitle })
      .eq('id', userId)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      const previousProfile = prevProfiles.find(profile => profile.id === userId);
      if (previousProfile) {
        set(state => ({
          profiles: state.profiles.map(profile => profile.id === userId ? previousProfile : profile)
        }));
      }
      get().setAlertData({
        message: `Error updating job title: ${error?.message || 'No profile was updated.'}`,
        type: 'error'
      });
    }
  },

  inviteUser: async (email) => {
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const { data, error } = await supabase.functions.invoke('admin-user-password', {
        body: {
          action: 'invite',
          email: normalizedEmail
        }
      });
      if (error) throw error;

      get().setAlertData({
        message: data?.resent
          ? `Invitation re-sent to ${normalizedEmail}.`
          : `Account created and invitation queued for ${normalizedEmail}.`,
        type: 'success'
      });
      await get().refreshData();
      return true;
    } catch (error: unknown) {
      console.error('Invitation request failed:', error);
      const message = await getEdgeFunctionErrorMessage(error, 'Unable to create the invited account.');
      get().setAlertData({ message, type: 'error' });
      return false;
    }
  },

  resetUserPassword: async (userId) => {
    const user = get().profiles.find(profile => profile.id === userId);
    if (!user) return false;

    try {
      const { error } = await supabase.functions.invoke('admin-user-password', {
        body: {
          action: 'reset_password',
          user_id: userId
        }
      });
      if (error) throw error;

      get().setAlertData({
        message: `Password reset link emailed to ${user.full_name}.`,
        type: 'success'
      });
      return true;
    } catch (error: unknown) {
      console.error('Password reset failed:', error);
      const message = await getEdgeFunctionErrorMessage(error, 'Unable to reset this password.');
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

    const { data, error } = await supabase
      .from('profiles')
      .update({ department })
      .eq('id', userId)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      const previousProfile = prevProfiles.find(profile => profile.id === userId);
      if (previousProfile) {
        set(state => ({
          profiles: state.profiles.map(profile => profile.id === userId ? previousProfile : profile),
          currentUser: state.currentUser?.id === userId ? previousProfile : state.currentUser
        }));
      }
      get().setAlertData({
        message: `Error updating department: ${error?.message || 'No profile was updated.'}`,
        type: 'error'
      });
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
        body: { task_id: taskId, manual_reminder: true }
      });

      if (error) throw error;

      get().setAlertData({
        message: `Reminder email sent to ${recipients.map(recipient => recipient.full_name).join(', ')}.`,
        type: 'success'
      });
      return true;
    } catch (error: unknown) {
      const message = await getReminderEmailErrorMessage(error);
      get().setAlertData({
        message: `Failed to send reminder email: ${message}`,
        type: 'error'
      });
      return false;
    }
  },

  sendEmployeeDeadlineReminders: async (userId) => {
    const { tasks, profiles, statuses } = get();
    const user = profiles.find(p => p.id === userId);
    const now = Date.now();
    const remindableTasks = tasks
      .filter(task => (
        isTaskAssignee(task, userId) &&
        !isTaskComplete(task, statuses) &&
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

    try {
      const { error } = await supabase.functions.invoke('send-task-reminder', {
        body: { deadline_digest_recipient_id: userId }
      });
      if (error) throw error;

      get().setAlertData({
        message: `Sent one deadline digest with ${remindableTasks.length} task${remindableTasks.length === 1 ? '' : 's'} to ${user.full_name}.`,
        type: 'success'
      });
    } catch (error: unknown) {
      const message = await getReminderEmailErrorMessage(error);
      get().setAlertData({ message: `Deadline digest was not sent. ${message}`, type: 'error' });
    }
  },

  addCategory: async (name, color) => {
    const { data, error } = await supabase
      .rpc('create_category', { category_name: name, category_color: color });
    if (data) set((state) => ({ categories: [...state.categories, data as Category] }));
    else if (error) get().setAlertData({ message: 'Error adding category: ' + error.message, type: 'error' });
  },

  deleteCategory: async (id) => {
    // Optimistic
    const category = get().categories.find(candidate => candidate.id === id);
    if (!category) return;
    set((state) => ({ categories: state.categories.filter(c => c.id !== id) }));
    const { error } = await supabase.rpc('delete_category_and_clear', { target_category_id: id });
    if (error) {
      set(state => ({ categories: [...state.categories.filter(c => c.id !== id), category] }));
      get().setAlertData({ message: "Error deleting category: " + error.message, type: 'error' });
    } else {
      set(state => ({
        tasks: state.tasks.map(task => task.category === category.name ? { ...task, category: null } : task),
        ticketRequests: state.ticketRequests.map(ticket => (
          ticket.category === category.name ? { ...ticket, category: null } : ticket
        ))
      }));
    }
  },

  addDepartment: async (name, color) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const { data, error } = await supabase
      .rpc('create_department', { department_name: trimmedName, department_color: color });

    if (data) {
      set(state => ({ departments: [...state.departments, data as WorkspaceDepartment] }));
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

    const { data, error } = await supabase
      .from('departments')
      .update(privileges)
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      const previousDepartment = prevDepartments.find(department => department.id === id);
      if (previousDepartment) {
        set(state => ({
          departments: state.departments.map(department => (
            department.id === id ? previousDepartment : department
          ))
        }));
      }
      get().setAlertData({
        message: `Error updating department privileges: ${error?.message || 'No department was updated.'}`,
        type: 'error'
      });
      return;
    }

    get().setAlertData({ message: 'Department privileges updated.', type: 'success' });
  },

  deleteDepartment: async (id) => {
    const department = get().departments.find(candidate => candidate.id === id);
    if (!department) return;

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

    const { data, error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      set(state => ({
        departments: [...state.departments.filter(candidate => candidate.id !== id), department],
        profiles: state.profiles.map(profile => (
          profile.department === null
            ? prevProfiles.find(previous => previous.id === profile.id) || profile
            : profile
        )),
        currentUser: state.currentUser?.department === null
          ? prevProfiles.find(profile => profile.id === state.currentUser?.id) || state.currentUser
          : state.currentUser
      }));
      get().setAlertData({
        message: `Error deleting department: ${error?.message || 'No department was deleted.'}`,
        type: 'error'
      });
    } else {
      get().setAlertData({ message: 'Department removed.', type: 'success' });
      get().refreshData();
    }
  },

  addStatus: async (name, color) => {
    const { data, error } = await supabase
      .rpc('create_status', { status_name: name, status_color: color });
    if (data) set((state) => ({ statuses: [...state.statuses, data as Status] }));
    else if (error) get().setAlertData({ message: 'Error adding status: ' + error.message, type: 'error' });
  },

  setCompletedStatus: async (id) => {
    const { error } = await supabase.rpc('set_completed_status', { target_status_id: id });
    if (error) {
      get().setAlertData({ message: `Error updating completed status: ${error.message}`, type: 'error' });
      return;
    }
    set(state => ({
      statuses: state.statuses.map(status => ({ ...status, is_completed: status.id === id }))
    }));
    get().checkTaskDeadlines();
    get().setAlertData({ message: 'Completed status updated.', type: 'success' });
  },

  deleteStatus: async (id) => {
    const status = get().statuses.find(candidate => candidate.id === id);
    if (!status) return;
    const replacement = get().statuses.find(candidate => candidate.id !== id);
    set((state) => ({ statuses: state.statuses.filter(s => s.id !== id) }));
    const { error } = await supabase.rpc('delete_status_and_reassign', {
      target_status_id: id,
      replacement_status_id: replacement?.id || null
    });
    if (error) {
      set(state => ({ statuses: [...state.statuses.filter(s => s.id !== id), status] }));
      get().setAlertData({ message: "Error deleting status: " + error.message, type: 'error' });
    } else if (replacement) {
      set(state => ({
        tasks: state.tasks.map(task => task.status === status.name
          ? { ...task, status: replacement.name }
          : task)
      }));
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
    } catch (error: unknown) {
      set({
        alertData: { message: asErrorLike(error).message || 'Failed to erase user', type: 'error' }
      });
    }
  },

  deleteTask: async (id) => {
    const task = get().tasks.find(candidate => candidate.id === id);
    const currentUser = get().currentUser;
    if (!task || !currentUser) return false;

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
      return false;
    } else {
      get().setAlertData({ message: 'Task moved to Archive.', type: 'success' });
      return true;
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
      tasks: state.tasks.filter(candidate => candidate.id !== id),
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
      tasks: state.tasks.filter(task => !taskIds.includes(task.id)),
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
    ++_loadSequence;
    ++_loadingSequence;
    _workspaceLoadPromise = null;
    _workspaceLoadUserId = null;
    set({ isCheckingSession: false, initializationError: null });
    try {
      const { error } = await withTimeout(
        supabase.auth.signOut(),
        SESSION_TIMEOUT_MS,
        'Sign out'
      );
      if (error) throw error;
    } catch (error: unknown) {
      get().setAlertData({
        message: `Could not sign out: ${asErrorLike(error).message || 'Unknown error'}`,
        type: 'error'
      });
    }
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
    } catch (error: unknown) {
      const message = await getReminderEmailErrorMessage(error);
      const status = getContextStatus(asErrorLike(error).context);

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
      day_of_month: schedule.day_of_month ?? null,
      timezone: schedule.timezone
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
    const { data, error } = await supabase
      .from('report_schedules')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      get().setAlertData({
        message: `Error deleting schedule: ${error?.message || 'No report schedule was deleted.'}`,
        type: 'error'
      });
      return false;
    }

    set(s => ({ reportSchedules: s.reportSchedules.filter(rs => rs.id !== id) }));
    get().setAlertData({ message: 'Report schedule removed.', type: 'success' });
    return true;
  },

  fetchReportSchedules: async () => {
    const { data, error } = await supabase
      .from('report_schedules')
      .select(WORKSPACE_SELECTS.report_schedules)
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

    if (data) {
      set(state => ({ ticketRequests: [data, ...state.ticketRequests] }));
    }

    get().setAlertData({ message: 'Ticket request submitted to admins.', type: 'success' });
    return true;
  },

  fetchTicketRequests: async () => {
    if (!get().currentUser) {
      set({ ticketRequests: [] });
      return;
    }

    const { data, error } = await supabase
      .from('ticket_requests')
      .select(WORKSPACE_SELECTS.ticket_requests)
      .order('created_at', { ascending: false });

    if (error) {
      get().setAlertData({ message: `Error loading tickets: ${error.message}`, type: 'error' });
      return;
    }

    if (data) set({ ticketRequests: data });
  },

  updateTicketRequestStatus: async (id, status) => {
    const previousTicket = get().ticketRequests.find(ticket => ticket.id === id);
    set(state => ({
      ticketRequests: state.ticketRequests.map(ticket => (
        ticket.id === id ? { ...ticket, status } : ticket
      ))
    }));

    const { data, error } = await supabase
      .from('ticket_requests')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (previousTicket) {
        set(state => ({
          ticketRequests: state.ticketRequests.map(ticket => (
            ticket.id === id ? previousTicket : ticket
          ))
        }));
      }
      get().setAlertData({ message: `Error updating ticket: ${error.message}`, type: 'error' });
    } else if (data) {
      set(state => ({
        ticketRequests: state.ticketRequests.map(ticket => ticket.id === id ? data : ticket)
      }));
      if (status === 'Approved') void get().refreshData();
    }
  },

  getDashboardTasks: () => {
    const { tasks, currentUser, profiles, departments } = get();
    if (!currentUser) return [];

    return tasks.filter(task => {
      if (task.is_recurring && !task.parent_task_id) return false;
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
