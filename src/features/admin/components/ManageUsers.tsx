import React from 'react';
import { useStore } from '../../../store/useStore';

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
              <td>{user.email}</td>
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
