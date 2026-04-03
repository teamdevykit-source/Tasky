import { useState, useEffect } from 'react';
import { Sidebar } from './components/Layout/Sidebar';
import { TaskBoard } from './features/tasks/components/TaskBoard';
import { CreateTaskModal } from './features/tasks/components/CreateTaskModal';
import { TaskDetailModal } from './features/tasks/components/TaskDetailModal';
import { Auth } from './features/auth/components/Auth';
import { AdminSettings } from './features/admin/components/AdminSettings';
import { useStore } from './store/useStore';
import { Menu } from 'lucide-react';
import './index.css';

function App() {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const currentUser = useStore(s => s.currentUser);
  const initialize = useStore(s => s.initialize);
  const viewMode = useStore(s => s.viewMode);
  const isCheckingSession = useStore(s => s.isCheckingSession);

  useEffect(() => {
    initialize();
  }, [initialize]);

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
        onOpenCreateModal={() => setIsCreateModalOpen(true)} 
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
        ) : (
          <TaskBoard onSelectTask={setSelectedTaskId} />
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
    </div>
  );
}

export default App;
