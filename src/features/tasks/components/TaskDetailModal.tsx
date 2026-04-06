import React from 'react';
import { useStore } from '../../../store/useStore';
import { X, Clock, Trash2, CheckCircle2, AlignLeft, Eye, Lock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const TaskDetailModal: React.FC<{ taskId: string, onClose: () => void }> = ({ taskId, onClose }) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false);
  const tasks = useStore(s => s.tasks);
  const profiles = useStore(s => s.profiles);
  const categories = useStore(s => s.categories);
  const statuses = useStore(s => s.statuses);
  const currentUser = useStore(s => s.currentUser);
  const updateTaskStatus = useStore(s => s.updateTaskStatus);
  const deleteTask = useStore(s => s.deleteTask);
  
  const task = tasks.find(t => t.id === taskId);
  
  if (!task || !currentUser) return null;

  const assignee = profiles.find(u => u.id === task.assignee_id);
  const creator = profiles.find(u => u.id === task.creator_id);
  const isObserver = task.observers?.includes(currentUser.id) && currentUser.role !== 'Admin';
  
  // PERMISSIONS:
  // 1. If self-task: ONLY the creator can edit/delete.
  // 2. If regular task: Creator, Assignee, or Admin can edit/delete.
  const canEdit = task.is_self_task 
    ? (currentUser.id === task.creator_id)
    : (!isObserver && (currentUser.role === 'Admin' || currentUser.id === task.assignee_id || currentUser.id === task.creator_id));
  const catColor = categories.find(c => c.name === task.category)?.color || '#64748b';
  const statColor = statuses.find(s => s.name === task.status)?.color || '#64748b';

  const handleDelete = () => {
    setIsConfirmingDelete(true);
  };

  const confirmDelete = async () => {
    try {
      await deleteTask(task.id);
      onClose();
    } catch (e: any) {
      // In case it throws an error instead of just alerting in store
      console.error(e);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px', width: '95%', padding: 0 }}>
        
        {/* Header with gradient */}
        <div style={{ 
          background: `linear-gradient(135deg, ${statColor}cc, ${catColor}99)`, 
          padding: '2.25rem 2.5rem', color: 'white', position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Decorative circles */}
          <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ position: 'absolute', bottom: '-20px', right: '80px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
          
          <button className="close-btn" onClick={onClose} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}>
            <X size={20} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ 
              background: 'rgba(255,255,255,0.15)', padding: '0.25rem 0.7rem', 
              borderRadius: 'var(--radius-full)', fontSize: '0.7rem', fontWeight: 700, 
              textTransform: 'uppercase', letterSpacing: '0.05em',
              backdropFilter: 'blur(4px)'
            }}>
              {task.status}
            </div>
            {task.category && (
              <div style={{ 
                background: 'rgba(255,255,255,0.08)', padding: '0.25rem 0.7rem', 
                borderRadius: 'var(--radius-full)', fontSize: '0.7rem', fontWeight: 600, 
                textTransform: 'uppercase', letterSpacing: '0.05em' 
              }}>
                {task.category}
              </div>
            )}
            {task.is_self_task && (
              <div style={{ 
                background: 'rgba(255,255,255,0.2)', padding: '0.25rem 0.7rem', 
                borderRadius: 'var(--radius-full)', fontSize: '0.7rem', fontWeight: 700, 
                textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '0.35rem',
                border: '1px solid rgba(255,255,255,0.3)'
              }}>
                <Lock size={12} /> Self Task
              </div>
            )}
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.25, paddingRight: '2rem' }}>{task.title}</h1>
        </div>

        {/* Body */}
        <div className="modal-detail-grid">
          
          {isConfirmingDelete && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)'
            }}>
              <div style={{
                background: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-lg)',
                maxWidth: '400px', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
              }}>
                <Trash2 size={40} style={{ margin: '0 auto 1rem', color: 'var(--danger)', opacity: 0.8 }} />
                <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-1)' }}>Delete Task</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-3)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                  Are you sure you want to delete this task? This action cannot be undone and will remove it from the database permanently.
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button 
                    onClick={() => setIsConfirmingDelete(false)}
                    style={{ padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', color: 'var(--text-1)' }}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmDelete}
                    style={{ padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-md)', background: 'var(--danger)', color: 'white' }}
                  >
                    Delete Permanently
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Left: Description */}
          <div style={{ padding: '2.5rem', borderRight: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.25rem', color: 'var(--primary)', opacity: 0.6 }}>
              <AlignLeft size={16} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Description</span>
            </div>
            
            <div className="task-desc-markdown" style={{ 
              fontSize: '0.95rem', lineHeight: 1.7, color: 'var(--text-2)',
              WebkitLineClamp: 'unset'
            }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {task.description || '*No description provided.*'}
              </ReactMarkdown>
            </div>

            {currentUser.role === 'Admin' && (
              <button 
                onClick={handleDelete}
                style={{ 
                  marginTop: '3rem', display: 'flex', alignItems: 'center', gap: '0.4rem', 
                  color: 'var(--danger)', fontWeight: 500, fontSize: '0.85rem', opacity: 0.5,
                  transition: 'var(--transition)', padding: '0.5rem 0'
                }}
                className="hover-opacity"
              >
                <Trash2 size={15} /> Delete Task
              </button>
            )}
          </div>

          {/* Right: Sidebar meta */}
          <aside style={{ padding: '2rem 1.75rem', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {/* Assignee */}
            <div>
              <h3 style={metaLabel}>Assignee</h3>
              <div style={{ 
                display: 'flex', alignItems: 'center', gap: '0.6rem', 
                background: 'var(--surface)', padding: '0.8rem', borderRadius: 'var(--radius-md)', 
                border: '1px solid var(--border)' 
              }}>
                <div className="avatar" style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}>{assignee?.full_name.charAt(0)}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-1)' }}>{assignee?.full_name || 'Unassigned'}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-4)' }}>Assignee</div>
                </div>
              </div>
            </div>

            {/* Creator */}
            {creator && (
              <div>
                <h3 style={metaLabel}>Created By</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-2)' }}>
                  <div className="avatar" style={{ width: '24px', height: '24px', fontSize: '0.6rem', borderWidth: '1px' }}>{creator.full_name.charAt(0)}</div>
                  {creator.full_name}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div>
              <h3 style={metaLabel}>Timeline</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                  <Clock size={14} style={{ color: 'var(--primary)', opacity: 0.6 }} />
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{task.start_date || 'TBD'}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-4)' }}>Start</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                  <CheckCircle2 size={14} style={{ color: statColor, opacity: 0.6 }} />
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{task.end_date || 'TBD'}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-4)' }}>Deadline</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Observers */}
            {!task.is_self_task && (
              <div>
                <h3 style={metaLabel}>
                  <Eye size={12} style={{ display: 'inline', marginRight: '0.3rem', opacity: 0.5 }} />
                  Observers
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {task.observers && task.observers.length > 0 ? (
                    task.observers.map(id => {
                      const u = profiles.find(p => p.id === id);
                      return (
                        <div key={id} className="avatar" title={u?.full_name} style={{ width: '26px', height: '26px', fontSize: '0.6rem' }}>
                          {u?.full_name.charAt(0)}
                        </div>
                      );
                    })
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-4)' }}>No observers.</span>
                  )}
                </div>
              </div>
            )}

            {/* Status Control */}
            <div style={{ marginTop: 'auto' }}>
              <h3 style={metaLabel}>Status</h3>
              {canEdit ? (
                <select 
                  value={task.status}
                  onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                  style={{ 
                    width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', 
                    fontSize: '0.85rem', fontWeight: 600, color: statColor, 
                    borderColor: `${statColor}30`, background: 'var(--surface)',
                    border: `1.5px solid ${statColor}30`
                  }}
                >
                  {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              ) : (
                <div style={{ 
                  padding: '0.65rem', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', 
                  fontSize: '0.8rem', textAlign: 'center', color: 'var(--text-4)',
                  border: '1px solid var(--border)'
                }}>
                  {task.status} <span style={{ opacity: 0.5 }}>(Read-only)</span>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

const metaLabel: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 700,
  color: 'var(--text-4)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '0.6rem'
};
