import React from 'react';
import { useStore } from '../../../store/useStore';
import { Mail } from 'lucide-react';

export const ManageUsers: React.FC = () => {
  const { profiles, updateUserRole, currentUser } = useStore();

  if (currentUser?.role !== 'Admin') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        You do not have permission to view this page.
      </div>
    );
  }

  const ROLES = ['Admin', 'Worker'];

  return (
    <div className="scrum-container">
      <h2 style={{ marginBottom: '1rem', fontWeight: 600 }}>Manage Users</h2>
      <table className="scrum-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map(user => (
            <tr key={user.id} className="scrum-row">
              <td style={{ fontWeight: 500 }}>{user.full_name}</td>
              <td style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                {user.email}
                {user.email && (
                  <a 
                    href={`mailto:${user.email}`}
                    style={{ 
                      color: 'var(--primary)', 
                      opacity: 0.6, 
                      display: 'flex', 
                      alignItems: 'center',
                      padding: '4px',
                      borderRadius: '4px',
                      background: 'var(--surface-3)',
                      transition: 'all 0.2s'
                    }}
                    title={`Email ${user.full_name}`}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                  >
                    <Mail size={14} />
                  </a>
                )}
              </td>
              <td>
                <select 
                  className="task-status-select"
                  value={user.role}
                  onChange={(e) => updateUserRole(user.id, e.target.value as any)}
                  disabled={user.id === currentUser.id} // Don't let admin demote themselves directly strictly for safety
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
