import { lazy, Suspense, useState, useEffect } from 'react';
import { Sidebar } from './components/Layout/Sidebar';
import { Auth } from './features/auth/components/Auth';
import { useStore } from './store/useStore';
import { Menu } from 'lucide-react';
import './index.css';

const TaskBoard = lazy(() => import('./features/tasks/components/TaskBoard')
  .then(module => ({ default: module.TaskBoard })));
const CreateTaskModal = lazy(() => import('./features/tasks/components/CreateTaskModal')
  .then(module => ({ default: module.CreateTaskModal })));
const TaskDetailModal = lazy(() => import('./features/tasks/components/TaskDetailModal')
  .then(module => ({ default: module.TaskDetailModal })));
const DashboardAnalytics = lazy(() => import('./features/dashboard/components/DashboardAnalytics')
  .then(module => ({ default: module.DashboardAnalytics })));
const MyTasksView = lazy(() => import('./features/tasks/components/MyTasksView')
  .then(module => ({ default: module.MyTasksView })));
const RecurringTasksView = lazy(() => import('./features/tasks/components/RecurringTasksView')
  .then(module => ({ default: module.RecurringTasksView })));
const ProfileSettings = lazy(() => import('./features/profile/components/ProfileSettings')
  .then(module => ({ default: module.ProfileSettings })));
const AdminSettings = lazy(() => import('./features/admin/components/AdminSettings')
  .then(module => ({ default: module.AdminSettings })));
const CompleteProfileModal = lazy(() => import('./features/auth/components/CompleteProfileModal')
  .then(module => ({ default: module.CompleteProfileModal })));
const RemindersView = lazy(() => import('./features/reminders/components/RemindersView')
  .then(module => ({ default: module.RemindersView })));
const ArchiveView = lazy(() => import('./features/tasks/components/ArchiveView')
  .then(module => ({ default: module.ArchiveView })));
const TicketsView = lazy(() => import('./features/tickets/components/TicketsView')
  .then(module => ({ default: module.TicketsView })));

const ScreenFallback = () => (
  <div style={{ minHeight: '40vh', display: 'grid', placeItems: 'center' }}>
    <div className="spinner" aria-label="Loading screen" />
  </div>
);

function App() {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const currentUser = useStore(s => s.currentUser);
  const initialize = useStore(s => s.initialize);
  const dispose = useStore(s => s.dispose);
  const viewMode = useStore(s => s.viewMode);
  const setViewMode = useStore(s => s.setViewMode);
  const isCheckingSession = useStore(s => s.isCheckingSession);
  const isInvitedSession = useStore(s => s.isInvitedSession);

  // Realtime subscriptions handle data sync, so we no longer need the aggressive 
  // hard reload on focus which was causing issues with date pickers and modals.
  useEffect(() => {
    void initialize();
    return dispose;
  }, [initialize, dispose]);

  useEffect(() => {
    if (
      currentUser &&
      currentUser.role !== 'Admin' &&
      viewMode === 'recurring'
    ) {
      setViewMode('dashboard');
    }
  }, [currentUser, viewMode, setViewMode]);

  if (isCheckingSession) {
    return (
      <div style={{ 
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', 
        background: 'var(--bg)', color: 'var(--text-1)' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '44px', height: '44px', 
            background: 'var(--primary)', 
            borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem', fontWeight: 800, fontSize: '1.1rem', color: 'white',
            boxShadow: '0 8px 25px rgba(99,102,241,0.3)'
          }}>M</div>
          <div className="spinner" style={{ 
            width: '32px', height: '32px', margin: '0 auto 1.25rem'
          }}></div>
          <p style={{ 
            fontSize: '0.78rem', fontWeight: 600, opacity: 0.4, 
            letterSpacing: '0.1em', textTransform: 'uppercase' 
          }}>Initializing Session...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) return <Auth />;

  return (
    <div className="app-layout">
      <Sidebar 
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />
      <main className="main-content">
        {/* Mobile Header Toggle */}
        <div className="mobile-header">
          <div className="mobile-brand">
            <div className="mobile-brand-mark">M</div>
            <span>EL MERAKI</span>
          </div>
          <button
            className="mobile-menu-btn"
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
        </div>

        <Suspense fallback={<ScreenFallback />}>
          {viewMode === 'settings' ? (
            <AdminSettings />
          ) : viewMode === 'archive' ? (
            <ArchiveView />
          ) : viewMode === 'tickets' ? (
            <TicketsView />
          ) : viewMode === 'dashboard' ? (
            <DashboardAnalytics onOpenCreateModal={() => setIsCreateModalOpen(true)} />
          ) : viewMode === 'my-tasks' ? (
            <MyTasksView onSelectTask={setSelectedTaskId} />
          ) : viewMode === 'recurring' && currentUser.role === 'Admin' ? (
            <RecurringTasksView onSelectTask={setSelectedTaskId} />
          ) : viewMode === 'profile' ? (
            <ProfileSettings />
          ) : viewMode === 'reminders' ? (
            <RemindersView onSelectTask={setSelectedTaskId} onOpenCreateModal={() => setIsCreateModalOpen(true)} />
          ) : (
            <TaskBoard onSelectTask={setSelectedTaskId} onOpenCreateModal={() => setIsCreateModalOpen(true)} />
          )}
        </Suspense>
      </main>
      
      <Suspense fallback={null}>
        {isCreateModalOpen && (
          <CreateTaskModal onClose={() => setIsCreateModalOpen(false)} />
        )}

        {selectedTaskId && (
          <TaskDetailModal
            taskId={selectedTaskId}
            onClose={() => setSelectedTaskId(null)}
          />
        )}

        {isInvitedSession && <CompleteProfileModal />}
      </Suspense>

      <ToastNotification />
    </div>
  );
}

const ToastNotification = () => {
  const alertData = useStore(s => s.alertData);
  const setAlertData = useStore(s => s.setAlertData);

  useEffect(() => {
    if (alertData) {
      const t = setTimeout(() => setAlertData(null), 4000);
      return () => clearTimeout(t);
    }
  }, [alertData, setAlertData]);

  if (!alertData) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
      padding: '1rem 2rem', borderRadius: 'var(--radius-lg)',
      background: alertData.type === 'error' ? 'var(--danger)' : 'var(--primary)',
      color: 'white', fontWeight: 600, zIndex: 9999,
      boxShadow: '0 10px 25px rgba(0,0,0,0.2)', animation: 'slide-up 0.3s ease-out forwards',
      display: 'flex', alignItems: 'center', gap: '1rem'
    }}>
      <span>{alertData.message}</span>
      <button onClick={() => setAlertData(null)} style={{ color: 'white', opacity: 0.8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <Menu size={16} style={{ transform: 'rotate(45deg)' }} />
      </button>
    </div>
  );
};

export default App;
