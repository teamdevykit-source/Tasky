import React, { useState, useEffect } from 'react';
import { useStore } from '../../../store/useStore';
import { Clock, Calendar, Sparkles, CheckCircle2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const CreateTaskModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const addTask = useStore(s => s.addTask);
  const currentUser = useStore(s => s.currentUser);
  const profiles = useStore(s => s.profiles);
  const categories = useStore(s => s.categories);
  const statuses = useStore(s => s.statuses);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState(currentUser?.id || '');
  const [category, setCategory] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedObservers, setSelectedObservers] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    if (categories.length > 0 && !category) {
      setCategory(categories[0].name);
    }
    if (currentUser.role === 'Admin') {
      const firstWorker = profiles.find(p => p.role === 'Worker');
      if (firstWorker && assigneeId === currentUser.id) {
        setAssigneeId(firstWorker.id);
      }
    }
  }, [categories, profiles, currentUser]);

  if (!currentUser) return null;

  const defaultStatus = statuses[0]?.name || 'To Do';
  const selectedCatObj = categories.find(c => c.name === category);
  const selectedCategoryColor = selectedCatObj?.color || '#818cf8';
  const assigneeObj = profiles.find(p => p.id === assigneeId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);

    const result = await addTask({
      title,
      description,
      assignee_id: assigneeId || currentUser.id,
      creator_id: currentUser.id,
      status: defaultStatus,
      category: category || null,
      observers: selectedObservers,
      start_date: startDate || undefined,
      end_date: endDate || undefined
    });

    setIsSubmitting(false);

    if (result && result.success) {
      setShowSuccess(true);
      setTimeout(() => onClose(), 900);
    }
  };

  if (showSuccess) {
    return (
      <div className="modal-overlay">
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--radius-2xl)',
          padding: '3rem 2.5rem', textAlign: 'center', maxWidth: '360px', width: '100%',
          boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border)',
          animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{
            width: '64px', height: '64px', background: 'rgba(52,211,153,0.1)',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem', border: '1px solid rgba(52,211,153,0.15)'
          }}>
            <CheckCircle2 size={32} color="#34d399" strokeWidth={2.5} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-1)' }}>Task Created!</h2>
          <p style={{ color: 'var(--text-3)', fontSize: '0.9rem' }}>Your task has been added to the board.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-2xl)',
        width: '100%',
        maxWidth: '960px',
        maxHeight: '92vh',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-xl)',
        display: 'grid',
        gridTemplateColumns: '1fr 300px',
        border: '1px solid var(--border-strong)',
        animation: 'modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* LEFT — Form */}
        <div style={{ padding: '2.5rem', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                color: selectedCategoryColor, fontSize: '0.7rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem'
              }}>
                <Sparkles size={12} />
                New Task
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-1)' }}>Create Task</h2>
            </div>
            <button onClick={onClose} style={{
              padding: '0.5rem', borderRadius: 'var(--radius-md)',
              background: 'var(--surface-3)', color: 'var(--text-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'var(--transition)', border: '1px solid var(--border)'
            }}>
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Title */}
            <div>
              <label style={labelStyle}>Task Title *</label>
              <input
                required
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                style={inputStyle}
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Description <span style={{ color: 'var(--text-4)', fontStyle: 'italic', fontWeight: 400 }}>(Markdown)</span></label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Add details, requirements, or notes..."
                style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }}
              />
            </div>

            {/* Category Pills */}
            <div>
              <label style={labelStyle}>Category</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                <button type="button" onClick={() => setCategory('')}
                  style={{
                    padding: '0.35rem 0.875rem', borderRadius: 'var(--radius-full)',
                    fontSize: '0.78rem', fontWeight: 600,
                    border: `1.5px solid ${category === '' ? 'var(--primary)' : 'var(--border-strong)'}`,
                    background: category === '' ? 'var(--primary-light)' : 'transparent',
                    color: category === '' ? 'var(--primary)' : 'var(--text-3)',
                    transition: 'var(--transition-fast)', cursor: 'pointer'
                  }}>
                  None
                </button>
                {categories.map(cat => (
                  <button key={cat.id} type="button" onClick={() => setCategory(cat.name)}
                    style={{
                      padding: '0.35rem 0.875rem', borderRadius: 'var(--radius-full)',
                      fontSize: '0.78rem', fontWeight: 600,
                      border: `1.5px solid ${category === cat.name ? cat.color : 'var(--border-strong)'}`,
                      background: category === cat.name ? `${cat.color}15` : 'transparent',
                      color: category === cat.name ? cat.color : 'var(--text-3)',
                      transition: 'var(--transition-fast)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.35rem'
                    }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cat.color }} />
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Assignee (Admin only) */}
            {currentUser.role === 'Admin' && (
              <div>
                <label style={labelStyle}>Assignee</label>
                <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={inputStyle}>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>)}
                </select>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
              <button type="button" onClick={onClose} style={{
                flex: 1, padding: '0.8rem', borderRadius: 'var(--radius-md)',
                background: 'var(--surface-3)', color: 'var(--text-2)',
                fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.9rem',
                transition: 'var(--transition)'
              }}>
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting}
                style={{
                  flex: 2, padding: '0.8rem', borderRadius: 'var(--radius-md)',
                  background: `linear-gradient(135deg, ${selectedCategoryColor}, ${selectedCategoryColor}cc)`,
                  color: 'white', fontWeight: 600, border: 'none', cursor: 'pointer',
                  fontSize: '0.9rem', opacity: isSubmitting ? 0.6 : 1,
                  transition: 'var(--transition)',
                  boxShadow: `0 4px 15px ${selectedCategoryColor}30`
                }}>
                {isSubmitting ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT — Preview & Meta */}
        <div style={{
          background: 'var(--surface-2)', borderLeft: '1px solid var(--border)',
          padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.75rem', overflowY: 'auto'
        }}>
          {/* Live Preview */}
          <div>
            <div style={sectionLabel}>Preview</div>
            <div style={{
              background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)', padding: '1.125rem',
              borderLeft: `3px solid ${selectedCategoryColor}`
            }}>
              {category && (
                <span style={{
                  fontSize: '0.6rem', fontWeight: 700, color: selectedCategoryColor,
                  background: `${selectedCategoryColor}12`, padding: '0.15rem 0.45rem',
                  borderRadius: 'var(--radius-sm)', textTransform: 'uppercase',
                  display: 'inline-block', marginBottom: '0.4rem', letterSpacing: '0.04em'
                }}>
                  {category}
                </span>
              )}
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-1)', marginBottom: '0.3rem' }}>
                {title || <span style={{ opacity: 0.25, fontStyle: 'italic' }}>Task title...</span>}
              </div>
              {description && (
                <div className="task-desc-markdown" style={{ fontSize: '0.78rem' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
                </div>
              )}
              {assigneeObj && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.6rem' }}>
                  <div className="avatar" style={{ width: '18px', height: '18px', fontSize: '0.55rem', borderWidth: '1px' }}>{assigneeObj.full_name.charAt(0)}</div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-4)' }}>{assigneeObj.full_name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div>
            <div style={sectionLabel}>Timeline</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ ...labelStyle, fontSize: '0.68rem' }}>Start Date</label>
                <div style={{ position: 'relative' }}>
                  <Clock size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inputStyle, paddingLeft: '2.25rem', fontSize: '0.82rem' }} />
                </div>
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: '0.68rem' }}>End Date</label>
                <div style={{ position: 'relative' }}>
                  <Calendar size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputStyle, paddingLeft: '2.25rem', fontSize: '0.82rem' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Observers */}
          {currentUser.role === 'Admin' && (
            <div>
              <div style={sectionLabel}>Observers</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {profiles.map(p => (
                  <label key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    background: selectedObservers.includes(p.id) ? 'var(--primary-light)' : 'transparent',
                    transition: 'var(--transition-fast)',
                    border: selectedObservers.includes(p.id) ? '1px solid rgba(129,140,248,0.15)' : '1px solid transparent'
                  }}>
                    <input type="checkbox" checked={selectedObservers.includes(p.id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedObservers([...selectedObservers, p.id]);
                        else setSelectedObservers(selectedObservers.filter(id => id !== p.id));
                      }}
                      style={{ accentColor: '#818cf8' }}
                    />
                    <div className="avatar" style={{ width: '20px', height: '20px', fontSize: '0.55rem', borderWidth: '1px' }}>{p.full_name.charAt(0)}</div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-2)' }}>{p.full_name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const sectionLabel: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 700,
  color: 'var(--text-4)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: '0.7rem'
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 600,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '0.45rem'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.7rem 1rem',
  borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--border-strong)',
  background: 'var(--surface)',
  fontSize: '0.9rem',
  color: 'var(--text-1)',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s'
};
