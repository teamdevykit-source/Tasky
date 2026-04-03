import React from 'react';
import { useStore } from '../../store/useStore';
import { Plus, KanbanSquare, List, Settings, LogOut, Zap, Sun, Moon, X } from 'lucide-react';

interface SidebarProps {
  onOpenCreateModal: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenCreateModal, isOpen, onClose }) => {
  const currentUser = useStore(s => s.currentUser);
  const viewMode = useStore(s => s.viewMode);
  const setViewMode = useStore(s => s.setViewMode);
  const logout = useStore(s => s.logout);
  const tasks = useStore(s => s.tasks);
  const theme = useStore(s => s.theme);
  const toggleTheme = useStore(s => s.toggleTheme);
  
  if (!currentUser) return null;

  const taskCount = tasks.length;
  const isDark = theme === 'dark';

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="sidebar-backdrop"
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', 
            backdropFilter: 'blur(4px)', zIndex: 90, display: window.innerWidth > 1024 ? 'none' : 'block'
          }}
        />
      )}
      
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div>
        {/* Brand & Mobile Close */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div className="sidebar-brand" style={{ padding: 0 }}>
            <div style={{ 
              width: '34px', height: '34px', 
              background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))', 
              color: 'white', borderRadius: 'var(--radius-sm)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              fontWeight: '800', fontSize: '0.85rem',
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)'
            }}>M</div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>EL MERAKI</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-4)', fontWeight: 500, letterSpacing: '0.08em' }}>OPS CENTER</div>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="mobile-close-btn"
            style={{ 
              display: window.innerWidth > 1024 ? 'none' : 'flex',
              padding: '0.4rem', borderRadius: 'var(--radius-sm)', 
              background: 'var(--surface)', color: 'var(--text-3)', border: '1px solid var(--border)'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats mini */}
        <div style={{ 
          margin: '1.5rem 0', padding: '0.875rem', 
          background: 'var(--surface)', borderRadius: 'var(--radius-md)', 
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '0.6rem'
        }}>
          <div style={{ 
            width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', 
            background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' 
          }}>
            <Zap size={15} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{taskCount}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-4)', fontWeight: 500 }}>Total Tasks</div>
          </div>
        </div>

        {/* Navigation */}
        <div className="nav-label">Navigation</div>
        <nav className="nav-group">
          <button 
            className={`nav-item ${viewMode === 'kanban' ? 'active' : ''}`}
            onClick={() => setViewMode('kanban')}
          >
            <KanbanSquare size={17} />
            <span>Kanban Board</span>
          </button>
          
          <button 
            className={`nav-item ${viewMode === 'scrum' ? 'active' : ''}`}
            onClick={() => setViewMode('scrum')}
          >
            <List size={17} />
            <span>Scrum Table</span>
          </button>

          {currentUser.role === 'Admin' && (
            <button 
              className={`nav-item ${viewMode === 'settings' ? 'active' : ''}`}
              onClick={() => setViewMode('settings')}
            >
              <Settings size={17} />
              <span>Settings</span>
            </button>
          )}
        </nav>

        {/* Create Task Button */}
        <button className="primary-btn" onClick={onOpenCreateModal} style={{ 
          width: '100%', marginTop: '1.5rem', justifyContent: 'center', 
          padding: '0.75rem' 
        }}>
          <Plus size={17} />
          <span>New Task</span>
        </button>
      </div>

      {/* Bottom Section: Theme + User */}
      <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="theme-toggle-btn"
          style={{ 
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.6rem 0.875rem', 
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            fontSize: '0.8rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '0.75rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {isDark ? <Moon size={15} style={{ color: 'var(--primary)' }} /> : <Sun size={15} style={{ color: '#f59e0b' }} />}
            <span>{isDark ? 'Dark Mode' : 'Light Mode'}</span>
          </div>
          {/* Toggle Pill */}
          <div style={{
            width: '36px', height: '20px',
            borderRadius: 'var(--radius-full)',
            background: isDark ? 'var(--primary)' : '#e5e7eb',
            position: 'relative',
            transition: 'background 0.25s ease',
            flexShrink: 0
          }}>
            <div style={{
              width: '16px', height: '16px',
              borderRadius: '50%',
              background: 'white',
              position: 'absolute',
              top: '2px',
              left: isDark ? '18px' : '2px',
              transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
          </div>
        </button>

        {/* User Profile */}
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: '0.625rem', 
          padding: '0.75rem', background: 'var(--surface)', 
          borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' 
        }}>
          <div className="avatar" style={{ width: '32px', height: '32px', fontSize: '0.75rem' }}>
            {currentUser.full_name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ 
              fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-1)', 
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' 
            }}>
              {currentUser.full_name}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-4)', fontWeight: 500 }}>{currentUser.role}</div>
          </div>
        </div>
        <button className="nav-item" onClick={() => logout()} style={{ 
          padding: '0.6rem 0.875rem', marginTop: '0.5rem', width: '100%', 
          fontSize: '0.8rem', color: 'var(--text-4)' 
        }}>
          <LogOut size={15} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
    </>
  );
};
