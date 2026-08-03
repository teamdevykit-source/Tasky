import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Archive, KanbanSquare, List, Settings, LogOut, Zap, Sun, Moon, X, LayoutDashboard, Lock, Bell, Repeat, Ticket, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 380;
const SIDEBAR_DEFAULT_WIDTH = 272;

const clampSidebarWidth = (width: number) => (
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
);

const getStoredSidebarWidth = () => {
  try {
    const storedWidth = Number(window.localStorage.getItem('tasky-sidebar-width'));
    return Number.isFinite(storedWidth) && storedWidth > 0
      ? clampSidebarWidth(storedWidth)
      : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
};

const getStoredSidebarCollapsed = () => {
  try {
    return window.localStorage.getItem('tasky-sidebar-collapsed') === 'true';
  } catch {
    return false;
  }
};

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const [sidebarWidth, setSidebarWidth] = useState(getStoredSidebarWidth);
  const [isCollapsed, setIsCollapsed] = useState(getStoredSidebarCollapsed);
  const [isResizing, setIsResizing] = useState(false);
  const currentUser = useStore(s => s.currentUser);
  const viewMode = useStore(s => s.viewMode);
  const setViewMode = useStore(s => s.setViewMode);
  const logout = useStore(s => s.logout);
  const theme = useStore(s => s.theme);
  const toggleTheme = useStore(s => s.toggleTheme);
  const archivedTaskCount = useStore(state => state.archivedTasks.length);
  const ticketCount = useStore(state => state.ticketRequests.filter(ticket => ticket.status !== 'Approved' && ticket.status !== 'Rejected').length);
  const getDashboardTasks = useStore(s => s.getDashboardTasks);
  const reminders = useStore(s => s.reminders);

  if (!currentUser) return null;
  const taskCount = getDashboardTasks().length;
  const isDark = theme === 'dark';
  const navigate = (mode: Parameters<typeof setViewMode>[0]) => {
    setViewMode(mode);
    onClose();
  };

  const saveSidebarWidth = (width: number) => {
    const nextWidth = clampSidebarWidth(width);
    setSidebarWidth(nextWidth);
    try {
      window.localStorage.setItem('tasky-sidebar-width', String(nextWidth));
    } catch {
      // Local storage can be unavailable in restricted browser contexts.
    }
  };

  const toggleCollapsed = () => {
    setIsCollapsed(collapsed => {
      const nextCollapsed = !collapsed;
      try {
        window.localStorage.setItem('tasky-sidebar-collapsed', String(nextCollapsed));
      } catch {
        // Local storage can be unavailable in restricted browser contexts.
      }
      return nextCollapsed;
    });
  };

  const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizing || isCollapsed) return;
    saveSidebarWidth(event.clientX);
  };

  const stopResizing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizing) return;
    setIsResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    if (isCollapsed) setIsCollapsed(false);
    saveSidebarWidth(sidebarWidth + (event.key === 'ArrowRight' ? 12 : -12));
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onClose}
        />
      )}
      
      <aside
        className={`sidebar ${isOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''} ${isResizing ? 'is-resizing' : ''}`}
        style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      >
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={event => {
            if (isCollapsed || window.innerWidth <= 1024) return;
            setIsResizing(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={handleResizePointerMove}
          onPointerUp={stopResizing}
          onPointerCancel={stopResizing}
          onLostPointerCapture={() => setIsResizing(false)}
          onKeyDown={handleResizeKeyDown}
        />
        <div
          className="sidebar-scroll-region"
          role="region"
          aria-label="Task navigation"
          tabIndex={0}
        >
        {/* Brand & Mobile Close */}
        <div className="sidebar-top-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div className="sidebar-brand" style={{ padding: 0 }}>
            <div style={{ 
              width: '34px', height: '34px', 
              background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))', 
              color: 'white', borderRadius: 'var(--radius-sm)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              fontWeight: '800', fontSize: '0.85rem',
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)'
            }}>M</div>
            <div className="sidebar-brand-copy">
              <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>EL MERAKI</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-4)', fontWeight: 500, letterSpacing: '0.08em' }}>OPS CENTER</div>
            </div>
          </div>
          
          <div className="sidebar-header-actions">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="sidebar-collapse-btn"
              aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
            <button
              onClick={onClose}
              className="mobile-close-btn"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Stats mini */}
        <div className="sidebar-task-summary" style={{
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
          <div className="sidebar-task-copy">
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{taskCount}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-4)', fontWeight: 500 }}>Total Tasks</div>
          </div>
        </div>

        {/* Navigation */}
        <div className="nav-label">Navigation</div>
        <nav className="nav-group">
          <button 
            className={`nav-item ${viewMode === 'dashboard' ? 'active' : ''}`}
            onClick={() => navigate('dashboard')}
            title={isCollapsed ? 'Dashboard' : undefined}
          >
            <LayoutDashboard size={17} />
            <span>Dashboard</span>
          </button>
          
          <button 
            className={`nav-item ${viewMode === 'my-tasks' ? 'active' : ''}`}
            onClick={() => navigate('my-tasks')}
            title={isCollapsed ? 'My Tasks' : undefined}
            style={{ position: 'relative' }}
          >
            <Lock size={17} />
            <span>My Tasks</span>
            <div
              className="nav-pill nav-pill-private"
              style={{
                marginLeft: 'auto',
                background: 'var(--primary-light)',
                padding: '0.1rem 0.4rem',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.65rem',
                fontWeight: 700,
                color: 'var(--primary)'
              }}
            >
              Private
            </div>
          </button>

          <button 
            className={`nav-item ${viewMode === 'reminders' ? 'active' : ''}`}
            onClick={() => navigate('reminders')}
            title={isCollapsed ? 'Reminders' : undefined}
            style={{ position: 'relative' }}
          >
            <Bell size={17} />
            <span>Reminders</span>
            {reminders.length > 0 && (
              <div className="nav-pill nav-pill-count" style={{ 
                marginLeft: 'auto', 
                background: reminders.some(r => r.type === 'urgent') ? 'var(--danger)' : 'var(--primary)', 
                padding: '0.1rem 0.4rem', 
                borderRadius: 'var(--radius-full)', 
                fontSize: '0.65rem', 
                fontWeight: 700, 
                color: 'white' 
              }}>
                {reminders.length}
              </div>
            )}
          </button>

          {currentUser.role === 'Admin' && (
            <button
              className={`nav-item ${viewMode === 'recurring' ? 'active' : ''}`}
              onClick={() => navigate('recurring')}
              title={isCollapsed ? 'Recurring Tasks' : undefined}
            >
              <Repeat size={17} />
              <span>Recurring Tasks</span>
            </button>
          )}

          <button 
            className={`nav-item ${viewMode === 'kanban' ? 'active' : ''}`}
            onClick={() => navigate('kanban')}
            title={isCollapsed ? 'Board View' : undefined}
          >
            <KanbanSquare size={17} />
            <span>Board View</span>
          </button>
          
          <button 
            className={`nav-item ${viewMode === 'scrum' ? 'active' : ''}`}
            onClick={() => navigate('scrum')}
            title={isCollapsed ? 'List View' : undefined}
          >
            <List size={17} />
            <span>List View</span>
          </button>

          {currentUser.role === 'Admin' && (
            <>
              <button
                className={`nav-item ${viewMode === 'tickets' ? 'active' : ''}`}
                onClick={() => navigate('tickets')}
                title={isCollapsed ? 'Tickets' : undefined}
              >
                <Ticket size={17} />
                <span>Tickets</span>
                {ticketCount > 0 && (
                  <span className="nav-pill nav-pill-count" style={{
                    marginLeft: 'auto',
                    padding: '0.1rem 0.4rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--primary)',
                    color: 'white',
                    fontSize: '0.65rem',
                    fontWeight: 700
                  }}>
                    {ticketCount}
                  </span>
                )}
              </button>
              <button
                className={`nav-item ${viewMode === 'settings' ? 'active' : ''}`}
                onClick={() => navigate('settings')}
                title={isCollapsed ? 'Settings' : undefined}
              >
                <Settings size={17} />
                <span>Settings</span>
              </button>
              <button
                className={`nav-item ${viewMode === 'archive' ? 'active' : ''}`}
                onClick={() => navigate('archive')}
                title={isCollapsed ? 'Archive' : undefined}
              >
                <Archive size={17} />
                <span>Archive</span>
                {archivedTaskCount > 0 && (
                  <span className="nav-pill nav-pill-count" style={{
                    marginLeft: 'auto',
                    padding: '0.1rem 0.4rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--surface-3)',
                    color: 'var(--text-2)',
                    fontSize: '0.65rem',
                    fontWeight: 700
                  }}>
                    {archivedTaskCount}
                  </span>
                )}
              </button>
            </>
          )}
          {currentUser.role !== 'Admin' && (
            <>
              <button
                className={`nav-item ${viewMode === 'tickets' ? 'active' : ''}`}
                onClick={() => navigate('tickets')}
                title={isCollapsed ? 'My Tickets' : undefined}
              >
                <Ticket size={17} />
                <span>My Tickets</span>
              </button>
              <button
                className={`nav-item ${viewMode === 'archive' ? 'active' : ''}`}
                onClick={() => navigate('archive')}
                title={isCollapsed ? 'Archive' : undefined}
              >
                <Archive size={17} />
                <span>Archive</span>
                {archivedTaskCount > 0 && <span className="nav-pill">{archivedTaskCount}</span>}
              </button>
            </>
          )}
        </nav>
      </div>

      {/* Bottom Section: Theme + User */}
      <div className="sidebar-footer">
        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="theme-toggle-btn"
          title={isCollapsed ? (isDark ? 'Use light mode' : 'Use dark mode') : undefined}
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
          <div className="theme-toggle-copy" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {isDark ? <Moon size={15} style={{ color: 'var(--primary)' }} /> : <Sun size={15} style={{ color: '#f59e0b' }} />}
            <span>{isDark ? 'Dark Mode' : 'Light Mode'}</span>
          </div>
          {/* Toggle Pill */}
          <div className="theme-toggle-switch" style={{
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
        <div 
          onClick={() => navigate('profile')}
          className={`sidebar-user-section ${viewMode === 'profile' ? 'active' : ''}`}
          title={isCollapsed ? currentUser.full_name : undefined}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '0.625rem', 
            padding: '0.75rem', background: viewMode === 'profile' ? 'var(--primary-light)' : 'var(--surface)', 
            borderRadius: 'var(--radius-md)', border: `1px solid ${viewMode === 'profile' ? 'var(--primary)' : 'var(--border)'}`,
            cursor: 'pointer', transition: 'var(--transition)'
          }}
        >
          <div className="avatar" style={{ 
            width: '32px', height: '32px', fontSize: '0.75rem',
            background: viewMode === 'profile' ? 'var(--primary)' : 'var(--surface-3)',
            color: viewMode === 'profile' ? 'white' : 'var(--text-1)'
          }}>
            {currentUser.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-user-copy" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ 
              fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-1)', 
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' 
            }}>
              {currentUser.full_name}
            </div>
            <div style={{ fontSize: '0.65rem', color: viewMode === 'profile' ? 'var(--primary)' : 'var(--text-4)', fontWeight: 500 }}>
              {currentUser.job_title ? `${currentUser.job_title}` : currentUser.role}
            </div>
          </div>
        </div>
        <button
          className="nav-item"
          onClick={() => logout()}
          title={isCollapsed ? 'Sign Out' : undefined}
          style={{
            padding: '0.6rem 0.875rem', marginTop: '0.5rem', width: '100%',
            fontSize: '0.8rem', color: 'var(--text-4)'
          }}
        >
          <LogOut size={15} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
    </>
  );
};
