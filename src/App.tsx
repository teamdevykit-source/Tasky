import { useState, useEffect } from 'react';
import { Sidebar } from './components/Layout/Sidebar';
import { TaskBoard } from './features/tasks/components/TaskBoard';
import { CreateTaskModal } from './features/tasks/components/CreateTaskModal';
import { TaskDetailModal } from './features/tasks/components/TaskDetailModal';
import { DashboardAnalytics } from './features/dashboard/components/DashboardAnalytics';
import { MyTasksView } from './features/tasks/components/MyTasksView';
import { ProfileSettings } from './features/profile/components/ProfileSettings';
import { Auth } from './features/auth/components/Auth';
import { AdminSettings } from './features/admin/components/AdminSettings';
import { CompleteProfileModal } from './features/auth/components/CompleteProfileModal';
import { RemindersView } from './features/reminders/components/RemindersView';
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

  if (isCheckingSession) {
    return (
      <div style={{ 
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', 
        background: 'var(--bg)', color: 'var(--text-1)' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '44px', height: '44px', 
            background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))', 
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
        <div 
          className="mobile-header"
          style={{
            display: window.innerWidth <= 1024 ? 'flex' : 'none',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 0',
            marginBottom: '1rem',
            borderBottom: '1px solid var(--border)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              width: '32px', height: '32px', 
              background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))', 
              color: 'white', borderRadius: 'var(--radius-sm)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              fontWeight: '800', fontSize: '0.85rem'
            }}>M</div>
            <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>EL MERAKI</span>
          </div>
          <button 
            onClick={() => setIsMobileSidebarOpen(true)}
            style={{ 
              padding: '0.5rem', background: 'var(--surface-3)', 
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              color: 'var(--text-1)'
            }}
          >
            <Menu size={20} />
          </button>
        </div>

        {viewMode === 'settings' ? (
          <AdminSettings />
        ) : viewMode === 'dashboard' ? (
          <DashboardAnalytics onOpenCreateModal={() => setIsCreateModalOpen(true)} />
        ) : viewMode === 'my-tasks' ? (
          <MyTasksView onSelectTask={setSelectedTaskId} />
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
