import React from 'react';
import { useStore } from '../../store/useStore';
import { Plus, KanbanSquare, List, Settings } from 'lucide-react';
import { ReminderBell } from '../Notifications/ReminderBell';

export const Header: React.FC<{ onOpenCreateModal: () => void }> = ({ onOpenCreateModal }) => {
  const { currentUser, viewMode, setViewMode, logout } = useStore();
  if (!currentUser) return null;

  return (
    <header className="header">
      <div className="logo">
        <div className="logo-icon">M</div>
        EL MERAKI OPS
      </div>

      <div className="header-controls">
        <div className="toggle-group">
          <button 
            className={`toggle-btn ${viewMode === 'kanban' ? 'active' : ''}`} 
            onClick={() => setViewMode('kanban')}
          >
            <KanbanSquare size={14} style={{ display: 'inline', marginRight: '4px' }}/>
            Kanban
          </button>
          <button 
            className={`toggle-btn ${viewMode === 'scrum' ? 'active' : ''}`} 
            onClick={() => setViewMode('scrum')}
          >
            <List size={14} style={{ display: 'inline', marginRight: '4px' }}/>
            Scrum
          </button>
          {currentUser.role === 'Admin' && (
            <button 
              className={`toggle-btn ${viewMode === 'settings' ? 'active' : ''}`} 
              onClick={() => setViewMode('settings')}
            >
              <Settings size={14} style={{ display: 'inline', marginRight: '4px' }}/>
              Settings
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginLeft: '1.25rem' }}>
          <ReminderBell />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>{currentUser.full_name}</span>
            <button className="secondary-btn" onClick={() => logout()} style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}>Logout</button>
          </div>
        </div>

        <button className="primary-btn" onClick={onOpenCreateModal}>
          <Plus size={16} /> New Task
        </button>
      </div>
    </header>
  );
};
