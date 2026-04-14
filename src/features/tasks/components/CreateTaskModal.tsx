import React, { useState, useEffect } from 'react';
import { useStore } from '../../../store/useStore';
import { Clock, Calendar, Sparkles, CheckCircle2, X, ChevronDown, ChevronUp, Users, Lock, Repeat, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RecurrenceType } from '../../../lib/supabase';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_OF_WEEK_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Compute the next occurrence timestamp based on recurrence settings.
 */
function computeNextRecurrence(
  type: RecurrenceType,
  time: string,
  day: number | null
): string {
  const [hh, mm] = time.split(':').map(Number);
  const now = new Date();
  let next = new Date();

  if (type === 'daily') {
    next.setHours(hh, mm, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (type === 'weekly') {
    const targetDay = day ?? 1; // default Monday
    next.setHours(hh, mm, 0, 0);
    let diff = targetDay - now.getDay();
    if (diff < 0 || (diff === 0 && next <= now)) diff += 7;
    next.setDate(next.getDate() + diff);
  } else if (type === 'monthly') {
    const targetDate = day ?? 1;
    next = new Date(now.getFullYear(), now.getMonth(), targetDate, hh, mm, 0, 0);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
  }

  return next.toISOString();
}

export const CreateTaskModal: React.FC<{ onClose: () => void, forceSelfTask?: boolean }> = ({ onClose, forceSelfTask }) => {
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
  const [isObserversOpen, setIsObserversOpen] = useState(false);
  const [isAssigneeOpen, setIsAssigneeOpen] = useState(false);
  const [isSelfTask, setIsSelfTask] = useState(forceSelfTask || false);

  // ── Recurrence State ──
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('daily');
  const [recurrenceTime, setRecurrenceTime] = useState('09:00');
  const [recurrenceDay, setRecurrenceDay] = useState<number>(1); // Monday or 1st of month

  useEffect(() => {
    if (!currentUser) return;
    if (categories.length > 0 && !category) {
      setCategory(categories[0].name);
    }
  }, [categories, profiles, currentUser]);

  if (!currentUser) return null;

  const defaultStatus = statuses[0]?.name || 'To Do';
  const selectedCatObj = categories.find(c => c.name === category);
  const selectedCategoryColor = selectedCatObj?.color || '#818cf8';
  const assigneeObj = profiles.find(p => p.id === assigneeId);

  // ── Build recurrence summary text for preview ──
  const getRecurrenceSummary = () => {
    if (!isRecurring) return null;
    const timeLabel = recurrenceTime || '09:00';
    if (recurrenceType === 'daily') return `Repeats daily at ${timeLabel}`;
    if (recurrenceType === 'weekly') return `Repeats every ${DAYS_OF_WEEK_FULL[recurrenceDay]} at ${timeLabel}`;
    if (recurrenceType === 'monthly') return `Repeats on day ${recurrenceDay} of each month at ${timeLabel}`;
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);

    const nextRecurrence = isRecurring
      ? computeNextRecurrence(recurrenceType, recurrenceTime, recurrenceType === 'daily' ? null : recurrenceDay)
      : undefined;

    const result = await addTask({
      title,
      description,
      assignee_id: isSelfTask ? currentUser.id : (assigneeId || currentUser.id),
      creator_id: currentUser.id,
      status: defaultStatus,
      category: category || null,
      observers: isSelfTask ? [] : selectedObservers,
      is_self_task: isSelfTask,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      // Recurrence fields
      is_recurring: isRecurring || undefined,
      recurrence_type: isRecurring ? recurrenceType : undefined,
      recurrence_time: isRecurring ? recurrenceTime : undefined,
      recurrence_day: isRecurring && recurrenceType !== 'daily' ? recurrenceDay : undefined,
      next_recurrence_at: nextRecurrence
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
          <p style={{ color: 'var(--text-3)', fontSize: '0.9rem' }}>
            {isRecurring ? 'Your recurring task has been scheduled.' : 'Your task has been added to the board.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-grid" onClick={e => e.stopPropagation()} style={{ maxWidth: '960px' }}>
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

            {/* Self Task Toggle */}
            {!forceSelfTask && (
              <div style={{
                padding: '1rem',
                background: isSelfTask ? 'rgba(129, 140, 248, 0.08)' : 'var(--surface-3)',
                borderRadius: 'var(--radius-lg)',
                border: isSelfTask ? '1px solid rgba(129, 140, 248, 0.3)' : '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'var(--transition)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: isSelfTask ? 'var(--primary)' : 'var(--border-strong)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', transition: 'var(--transition)'
                  }}>
                    <Lock size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-1)' }}>Self Task (Private)</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-4)' }}>Only you can see and manage this task.</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSelfTask(!isSelfTask)}
                  style={{
                    width: '44px', height: '24px', borderRadius: 'var(--radius-full)',
                    background: isSelfTask ? 'var(--primary)' : 'var(--border-strong)',
                    position: 'relative', border: 'none', cursor: 'pointer', transition: '0.3s'
                  }}
                >
                  <div style={{
                    width: '18px', height: '18px', background: 'white', borderRadius: '50%',
                    position: 'absolute', top: '3px', left: isSelfTask ? '23px' : '3px',
                    transition: '0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }} />
                </button>
              </div>
            )}

            {/* ═══════════════════════════════════════ */}
            {/* ──── RECURRENCE SECTION ──────────────── */}
            {/* ═══════════════════════════════════════ */}
            <div style={{
              padding: '1rem',
              background: isRecurring ? 'rgba(52, 211, 153, 0.06)' : 'var(--surface-3)',
              borderRadius: 'var(--radius-lg)',
              border: isRecurring ? '1px solid rgba(52, 211, 153, 0.25)' : '1px solid var(--border)',
              transition: 'var(--transition)'
            }}>
              {/* Toggle Row */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: isRecurring
                      ? 'linear-gradient(135deg, #34d399, #10b981)'
                      : 'var(--border-strong)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', transition: 'var(--transition)',
                    boxShadow: isRecurring ? '0 4px 12px rgba(52,211,153,0.3)' : 'none'
                  }}>
                    <Repeat size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-1)' }}>Recurring Task</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-4)' }}>Automatically repeat this task on a schedule.</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRecurring(!isRecurring)}
                  style={{
                    width: '44px', height: '24px', borderRadius: 'var(--radius-full)',
                    background: isRecurring
                      ? 'linear-gradient(135deg, #34d399, #10b981)'
                      : 'var(--border-strong)',
                    position: 'relative', border: 'none', cursor: 'pointer', transition: '0.3s'
                  }}
                >
                  <div style={{
                    width: '18px', height: '18px', background: 'white', borderRadius: '50%',
                    position: 'absolute', top: '3px', left: isRecurring ? '23px' : '3px',
                    transition: '0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }} />
                </button>
              </div>

              {/* Recurrence Options (expanded) */}
              {isRecurring && (
                <div style={{
                  marginTop: '1.25rem',
                  paddingTop: '1.25rem',
                  borderTop: '1px solid rgba(52, 211, 153, 0.15)',
                  display: 'flex', flexDirection: 'column', gap: '1rem',
                  animation: 'fadeInUp 0.25s ease'
                }}>
                  {/* Frequency Selector */}
                  <div>
                    <label style={{ ...labelStyle, fontSize: '0.68rem' }}>Frequency</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {(['daily', 'weekly', 'monthly'] as RecurrenceType[]).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setRecurrenceType(type);
                            if (type === 'weekly') setRecurrenceDay(1);
                            if (type === 'monthly') setRecurrenceDay(1);
                          }}
                          style={{
                            flex: 1, padding: '0.55rem 0.5rem',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.78rem', fontWeight: 600,
                            border: recurrenceType === type
                              ? '1.5px solid #34d399'
                              : '1.5px solid var(--border-strong)',
                            background: recurrenceType === type
                              ? 'rgba(52, 211, 153, 0.1)'
                              : 'var(--surface)',
                            color: recurrenceType === type ? '#34d399' : 'var(--text-3)',
                            cursor: 'pointer', transition: 'var(--transition-fast)',
                            textTransform: 'capitalize'
                          }}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Day of Week Selector (for weekly) */}
                  {recurrenceType === 'weekly' && (
                    <div>
                      <label style={{ ...labelStyle, fontSize: '0.68rem' }}>Repeat On</label>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {DAYS_OF_WEEK.map((day, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setRecurrenceDay(idx)}
                            style={{
                              width: '40px', height: '36px',
                              borderRadius: 'var(--radius-md)',
                              fontSize: '0.72rem', fontWeight: 700,
                              border: recurrenceDay === idx
                                ? '1.5px solid #34d399'
                                : '1.5px solid var(--border-strong)',
                              background: recurrenceDay === idx
                                ? 'rgba(52, 211, 153, 0.12)'
                                : 'var(--surface)',
                              color: recurrenceDay === idx ? '#34d399' : 'var(--text-3)',
                              cursor: 'pointer',
                              transition: 'var(--transition-fast)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Day of Month Selector (for monthly) */}
                  {recurrenceType === 'monthly' && (
                    <div>
                      <label style={{ ...labelStyle, fontSize: '0.68rem' }}>Day of Month</label>
                      <div style={{ position: 'relative' }}>
                        <Calendar size={13} style={{
                          position: 'absolute', left: '0.75rem', top: '50%',
                          transform: 'translateY(-50%)', color: '#34d399', pointerEvents: 'none'
                        }} />
                        <select
                          value={recurrenceDay}
                          onChange={e => setRecurrenceDay(Number(e.target.value))}
                          style={{
                            ...inputStyle, paddingLeft: '2.25rem', fontSize: '0.82rem',
                            appearance: 'auto'
                          }}
                        >
                          {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>
                              {d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Time Picker */}
                  <div>
                    <label style={{ ...labelStyle, fontSize: '0.68rem' }}>At Time</label>
                    <div style={{ position: 'relative' }}>
                      <Clock size={13} style={{
                        position: 'absolute', left: '0.75rem', top: '50%',
                        transform: 'translateY(-50%)', color: '#34d399', pointerEvents: 'none'
                      }} />
                      <input
                        type="time"
                        value={recurrenceTime}
                        onChange={e => setRecurrenceTime(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: '2.25rem', fontSize: '0.82rem' }}
                      />
                    </div>
                  </div>

                  {/* Summary Badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.6rem 0.85rem',
                    background: 'rgba(52, 211, 153, 0.08)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(52, 211, 153, 0.15)'
                  }}>
                    <RotateCcw size={13} style={{ color: '#34d399', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600 }}>
                      {getRecurrenceSummary()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Assignee Selection (Dropdown) */}
            {currentUser.role === 'Admin' && !isSelfTask && (
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Assignee</label>
                <button 
                  type="button"
                  onClick={() => setIsAssigneeOpen(!isAssigneeOpen)}
                  style={{
                    width: '100%', padding: '0.7rem 1rem', borderRadius: 'var(--radius-md)',
                    background: 'var(--surface)', border: '1.5px solid var(--border-strong)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer', transition: 'var(--transition)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {assigneeObj ? (
                      <>
                        <div className="avatar" style={{ width: '22px', height: '22px', fontSize: '0.6rem', borderWidth: '1px' }}>
                          {assigneeObj.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-1)', fontWeight: 600 }}>{assigneeObj.full_name}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-4)' }}>({assigneeObj.role})</span>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-4)' }}>Select assignee...</span>
                    )}
                  </div>
                  {isAssigneeOpen ? <ChevronUp size={16} color="var(--text-4)" /> : <ChevronDown size={16} color="var(--text-4)" />}
                </button>

                {isAssigneeOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 0.4rem)', left: 0, right: 0,
                    background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
                    zIndex: 60, maxHeight: '200px', overflowY: 'auto', padding: '0.35rem'
                  }}>
                    {profiles.map(p => (
                      <div 
                        key={p.id} 
                        onClick={() => {
                          setAssigneeId(p.id);
                          setIsAssigneeOpen(false);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-md)', 
                          cursor: 'pointer', transition: 'var(--transition-fast)',
                          background: assigneeId === p.id ? 'var(--primary-light)' : 'transparent',
                          marginBottom: '0.15rem'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = assigneeId === p.id ? 'var(--primary-light)' : 'var(--surface-2)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = assigneeId === p.id ? 'var(--primary-light)' : 'transparent')}
                      >
                        <div className="avatar" style={{ width: '24px', height: '24px', fontSize: '0.65rem', borderWidth: '1px' }}>{p.full_name.charAt(0).toUpperCase()}</div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>{p.full_name}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-4)' }}>{p.role}</span>
                        </div>
                        {assigneeId === p.id && (
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                            <CheckCircle2 size={14} color="var(--primary)" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
                {isSubmitting ? 'Creating...' : isRecurring ? '🔁 Create Recurring Task' : 'Create Task'}
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
              borderLeft: `3px solid ${selectedCategoryColor}`,
              opacity: isSelfTask ? 0.85 : 1
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {isSelfTask && (
                    <div title="Private Task" style={{ color: 'var(--primary)', opacity: 0.8 }}>
                      <Lock size={12} />
                    </div>
                  )}
                  {isRecurring && (
                    <div title="Recurring Task" style={{ color: '#34d399', opacity: 0.9 }}>
                      <Repeat size={12} />
                    </div>
                  )}
                </div>
              </div>
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

              {/* Recurrence badge in preview */}
              {isRecurring && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  marginTop: '0.6rem', padding: '0.3rem 0.6rem',
                  background: 'rgba(52, 211, 153, 0.08)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(52, 211, 153, 0.12)',
                  width: 'fit-content'
                }}>
                  <Repeat size={10} style={{ color: '#34d399' }} />
                  <span style={{ fontSize: '0.62rem', color: '#34d399', fontWeight: 600 }}>
                    {getRecurrenceSummary()}
                  </span>
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
                  <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inputStyle, paddingLeft: '2.25rem', fontSize: '0.82rem' }} />
                </div>
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: '0.68rem' }}>End Date</label>
                <div style={{ position: 'relative' }}>
                  <Calendar size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
                  <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputStyle, paddingLeft: '2.25rem', fontSize: '0.82rem' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Observers Dropdown */}
          {!isSelfTask && (
            <div>
              <div style={sectionLabel}>Observers</div>
              <div style={{ position: 'relative' }}>
                <button 
                  type="button"
                  onClick={() => setIsObserversOpen(!isObserversOpen)}
                  style={{
                    width: '100%', padding: '0.65rem 1rem', borderRadius: 'var(--radius-md)',
                    background: 'var(--surface)', border: '1.5px solid var(--border-strong)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer', transition: 'var(--transition)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Users size={14} style={{ color: 'var(--primary)', opacity: 0.7 }} />
                    <span style={{ fontSize: '0.8rem', color: selectedObservers.length > 0 ? 'var(--text-1)' : 'var(--text-4)' }}>
                      {selectedObservers.length > 0 
                        ? `${selectedObservers.length} Observer${selectedObservers.length > 1 ? 's' : ''} selected` 
                        : 'Select observers...'}
                    </span>
                  </div>
                  {isObserversOpen ? <ChevronUp size={14} color="var(--text-4)" /> : <ChevronDown size={14} color="var(--text-4)" />}
                </button>

                {isObserversOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 0.4rem)', left: 0, right: 0,
                    background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
                    zIndex: 50, maxHeight: '200px', overflowY: 'auto', padding: '0.35rem'
                  }}>
                    {profiles.map(p => (
                      <label 
                        key={p.id} 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-md)', 
                          cursor: 'pointer', transition: 'var(--transition-fast)',
                          background: selectedObservers.includes(p.id) ? 'var(--primary-light)' : 'transparent',
                          marginBottom: '0.15rem'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = selectedObservers.includes(p.id) ? 'var(--primary-light)' : 'var(--surface-2)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = selectedObservers.includes(p.id) ? 'var(--primary-light)' : 'transparent')}
                      >
                        <input 
                          type="checkbox" 
                          checked={selectedObservers.includes(p.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedObservers([...selectedObservers, p.id]);
                            else setSelectedObservers(selectedObservers.filter(id => id !== p.id));
                          }}
                          style={{ accentColor: 'var(--primary)' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div className="avatar" style={{ width: '22px', height: '22px', fontSize: '0.6rem', borderWidth: '1px' }}>
                            {p.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-1)' }}>{p.full_name}</span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-4)' }}>{p.role}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                    {profiles.length === 0 && (
                      <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-4)' }}>
                        No other team members found.
                      </div>
                    )}
                  </div>
                )}
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
