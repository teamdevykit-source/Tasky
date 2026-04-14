import React, { useState } from 'react';
import { useStore } from '../../../store/useStore';
import { Plus, Trash2, Settings, Users, Layers, Tag, ShieldCheck, Mail } from 'lucide-react';
import { ConfirmationModal } from '../../../components/Shared/ConfirmationModal';

export const AdminSettings: React.FC = () => {
  const currentUser = useStore(s => s.currentUser);
  const profiles = useStore(s => s.profiles);
  const updateUserRole = useStore(s => s.updateUserRole);
  const updateUserJobTitle = useStore(s => s.updateUserJobTitle);
  const categories = useStore(s => s.categories);
  const addCategory = useStore(s => s.addCategory);
  const deleteCategory = useStore(s => s.deleteCategory);
  const statuses = useStore(s => s.statuses);
  const addStatus = useStore(s => s.addStatus);
  const deleteStatus = useStore(s => s.deleteStatus);
  const inviteUser = useStore(s => s.inviteUser);
  const deleteUser = useStore(s => s.deleteUser);

  const [activeTab, setActiveTab] = useState<'users' | 'categories' | 'statuses'>('users');
  const [inviteEmail, setInviteEmail] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#818cf8');
  const [newStatus, setNewStatus] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#818cf8');

  // Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  if (currentUser?.role !== 'Admin') {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-4)' }}>
        <ShieldCheck size={48} style={{ marginBottom: '1rem', opacity: 0.15 }} />
        <p>You do not have administrative permissions to view this page.</p>
      </div>
    );
  }

  const ROLES = ['Admin', 'Worker'];

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    addCategory(newCategory.trim(), newCategoryColor);
    setNewCategory('');
    setNewCategoryColor('#818cf8');
  };

  const handleAddStatus = () => {
    if (!newStatus.trim()) return;
    addStatus(newStatus.trim(), newStatusColor);
    setNewStatus('');
    setNewStatusColor('#818cf8');
  };

  const handleInviteUser = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) return;
    await inviteUser(inviteEmail.trim());
    setInviteEmail('');
  };

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="logo-icon">
            <Settings size={18} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1)' }}>System Settings</h1>
            <p style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>Configure workspace users, categories, and workflow statuses.</p>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="toggle-group" style={{ marginBottom: '2rem' }}>
        <button 
          className={`toggle-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={14} style={{ display: 'inline', marginRight: '6px' }}/>
          Users
        </button>
        <button 
          className={`toggle-btn ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          <Layers size={14} style={{ display: 'inline', marginRight: '6px' }}/>
          Categories
        </button>
        <button 
          className={`toggle-btn ${activeTab === 'statuses' ? 'active' : ''}`}
          onClick={() => setActiveTab('statuses')}
        >
          <Tag size={14} style={{ display: 'inline', marginRight: '6px' }}/>
          Statuses
        </button>
      </div>

      <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <div style={{ 
              display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', padding: '1.25rem', 
              background: 'var(--surface)', borderRadius: 'var(--radius-lg)', 
              border: '1px solid var(--border)', alignItems: 'flex-end'
            }}>
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Invite New Workspace Member</label>
                <input
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInviteUser()}
                  style={{ width: '100%' }}
                />
              </div>
              <button className="primary-btn" onClick={handleInviteUser} style={{ height: '40px', fontSize: '0.82rem' }} disabled={!inviteEmail}>
                <Plus size={16} /> Send Invite
              </button>
            </div>

            <div className="scrum-table-wrapper">
              <table className="scrum-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Job Title (Label)</th>
                  <th>Role</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(user => (
                  <tr key={user.id} className="scrum-row">
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div className="avatar" style={{ width: '30px', height: '30px', fontSize: '0.7rem' }}>
                            {user.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{user.full_name}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-3)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {user.email}
                        {user.email && (
                          <a href={`mailto:${user.email}`} title={`Email ${user.full_name}`} style={{ color: 'var(--primary)', opacity: 0.6, display: 'flex', alignItems: 'center' }}>
                            <Mail size={13} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td>
                      <input 
                        type="text"
                        placeholder="e.g. Manager"
                        defaultValue={user.job_title || ''}
                        onBlur={(e) => {
                          if (e.target.value !== (user.job_title || '')) {
                            updateUserJobTitle(user.id, e.target.value);
                          }
                        }}
                        style={{
                          padding: '0.35rem 0.6rem', width: '130px',
                          borderRadius: 'var(--radius-sm)', fontSize: '0.82rem',
                          border: '1px solid var(--border)', background: 'var(--surface-2)',
                          color: 'var(--text-1)'
                        }}
                      />
                    </td>
                    <td>
                      <select 
                        value={user.role}
                        onChange={(e) => updateUserRole(user.id, e.target.value as any)}
                        disabled={user.id === currentUser.id}
                        style={{ 
                          padding: '0.4rem 0.8rem', width: '130px',
                          borderRadius: 'var(--radius-sm)', fontSize: '0.82rem',
                          fontWeight: 600
                        }}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>
                      {user.id !== currentUser.id && (
                        <button 
                          style={{ 
                            color: 'var(--danger)', background: 'rgba(248,113,113,0.08)', 
                            border: 'none', cursor: 'pointer', padding: '0.4rem', 
                            borderRadius: 'var(--radius-sm)', transition: 'var(--transition)'
                          }}
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: 'Delete User',
                              message: `Are you sure you want to delete user "${user.full_name}" and remove them from all tasks? This action cannot be undone.`,
                              onConfirm: () => deleteUser(user.id)
                            });
                          }}
                          title="Remove user"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === 'categories' && (
          <div>
            {/* Add form */}
            <div style={{ 
              display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', padding: '1.25rem', 
              background: 'var(--surface)', borderRadius: 'var(--radius-lg)', 
              border: '1px solid var(--border)', alignItems: 'flex-end'
            }}>
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Category Name</label>
                <input
                  type="text"
                  placeholder="e.g. Urgent Logistics"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={fieldLabel}>Color</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="color"
                    value={newCategoryColor}
                    onChange={e => setNewCategoryColor(e.target.value)}
                    style={{ 
                      width: '40px', height: '40px', border: '1px solid var(--border-strong)', 
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: '2px',
                      background: 'var(--surface-2)'
                    }}
                  />
                  <button className="primary-btn" onClick={handleAddCategory} style={{ height: '40px', fontSize: '0.82rem' }}>
                    <Plus size={16} /> Add
                  </button>
                </div>
              </div>
            </div>
            
            <div className="scrum-table-wrapper">
              <table className="scrum-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Color</th>
                    <th style={{ width: '70px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat.id} className="scrum-row">
                      <td style={{ fontWeight: 600, color: 'var(--text-1)' }}>{cat.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ width: '20px', height: '10px', borderRadius: '10px', background: cat.color }} />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-4)', fontFamily: 'monospace' }}>{cat.color}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          style={{ 
                            color: 'var(--danger)', background: 'rgba(248,113,113,0.08)', 
                            border: 'none', cursor: 'pointer', padding: '0.4rem', 
                            borderRadius: 'var(--radius-sm)', transition: 'var(--transition)' 
                          }}
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: 'Delete Category',
                              message: `Are you sure you want to delete category "${cat.name}"? Tasks in this category will remain, but the category will be removed.`,
                              onConfirm: () => deleteCategory(cat.id)
                            });
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {categories.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-4)', padding: '3rem' }}>
                        <Layers size={28} style={{ display: 'block', margin: '0 auto 0.75rem', opacity: 0.1 }} />
                        No categories defined.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Statuses Tab */}
        {activeTab === 'statuses' && (
          <div>
            <div style={{ 
              display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', padding: '1.25rem', 
              background: 'var(--surface)', borderRadius: 'var(--radius-lg)', 
              border: '1px solid var(--border)', alignItems: 'flex-end'
            }}>
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Status Name</label>
                <input
                  type="text"
                  placeholder="e.g. In Review"
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddStatus()}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={fieldLabel}>Color</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="color"
                    value={newStatusColor}
                    onChange={e => setNewStatusColor(e.target.value)}
                    style={{ 
                      width: '40px', height: '40px', border: '1px solid var(--border-strong)', 
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: '2px',
                      background: 'var(--surface-2)'
                    }}
                  />
                  <button className="primary-btn" onClick={handleAddStatus} style={{ height: '40px', fontSize: '0.82rem' }}>
                    <Plus size={16} /> Add
                  </button>
                </div>
              </div>
            </div>

            <div className="scrum-table-wrapper">
              <table className="scrum-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Color</th>
                    <th style={{ width: '70px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {statuses.map(s => (
                    <tr key={s.id} className="scrum-row">
                      <td style={{ fontWeight: 600, color: 'var(--text-1)' }}>{s.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: s.color, boxShadow: `0 0 8px ${s.color}50` }} />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-4)', fontFamily: 'monospace' }}>{s.color}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          style={{ 
                            color: 'var(--danger)', background: 'rgba(248,113,113,0.08)', 
                            border: 'none', cursor: 'pointer', padding: '0.4rem', 
                            borderRadius: 'var(--radius-sm)', transition: 'var(--transition)' 
                          }}
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: 'Delete Status',
                              message: `Are you sure you want to delete status "${s.name}"? Tasks currently with this status will be reset.`,
                              onConfirm: () => deleteStatus(s.id)
                            });
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {statuses.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-4)', padding: '3rem' }}>
                        <Tag size={28} style={{ display: 'block', margin: '0 auto 0.75rem', opacity: 0.1 }} />
                        No statuses defined.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* Confirmation Modal */}
        <ConfirmationModal
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        />
      </div>
    </div>
  );
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 600,
  marginBottom: '0.4rem',
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
};
