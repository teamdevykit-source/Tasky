import { useState, useEffect } from 'react';
import { Sidebar } from './components/Layout/Sidebar';
import { TaskBoard } from './features/tasks/components/TaskBoard';
import { CreateTaskModal } from './features/tasks/components/CreateTaskModal';
import { TaskDetailModal } from './features/tasks/components/TaskDetailModal';
import { DashboardAnalytics } from './features/dashboard/components/DashboardAnalytics';
import { MyTasksView } from './features/tasks/components/MyTasksView';
import { RecurringTasksView } from './features/tasks/components/RecurringTasksView';
import { ProfileSettings } from './features/profile/components/ProfileSettings';
import { Auth } from './features/auth/components/Auth';
import { AdminSettings } from './features/admin/components/AdminSettings';
import { CompleteProfileModal } from './features/auth/components/CompleteProfileModal';
import { RemindersView } from './features/reminders/components/RemindersView';
import { ArchiveView } from './features/tasks/components/ArchiveView';
import { useStore } from './store/useStore';
import { Menu } from 'lucide-react';
import './index.css';

function App() {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const currentUser = useStore(s => s.currentUser);
  const initialize = useStore(s => s.initialize);
  const checkTaskDeadlines = useStore(s => s.checkTaskDeadlines);
  const viewMode = useStore(s => s.viewMode);
  const setViewMode = useStore(s => s.setViewMode);
  const isCheckingSession = useStore(s => s.isCheckingSession);
  const isInvitedSession = useStore(s => s.isInvitedSession);

  // Realtime subscriptions handle data sync, so we no longer need the aggressive 
  // hard reload on focus which was causing issues with date pickers and modals.
  useEffect(() => {
    initialize();
    
    // Initial check
    checkTaskDeadlines();
    
    // Check every minute
    const interval = setInterval(() => {
      checkTaskDeadlines();
    }, 60000);
    
    return () => clearInterval(interval);
  }, [initialize, checkTaskDeadlines]);

  useEffect(() => {
    if (
      currentUser &&
      currentUser.role !== 'Admin' &&
      (viewMode === 'recurring' || viewMode === 'archive')
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

        {viewMode === 'settings' ? (
          <AdminSettings />
        ) : viewMode === 'archive' && currentUser.role === 'Admin' ? (
          <ArchiveView />
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
      </main>
      
      {isCreateModalOpen && (
        <CreateTaskModal onClose={() => setIsCreateModalOpen(false)} />
      )}
      
      {selectedTaskId && (
        <TaskDetailModal 
          taskId={selectedTaskId} 
          onClose={() => setSelectedTaskId(null)} 
        />
      )}

      {isInvitedSession && (
        <CompleteProfileModal />
      )}

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
