import React from 'react';
import type { Task } from '../../../lib/supabase';
import { useStore } from '../../../store/useStore';
import { Calendar, Eye, GripVertical, Lock, AlertTriangle, AlertCircle, Repeat } from 'lucide-react';
import { formatDateTime } from '../../../lib/format';

export const TaskCard: React.FC<{ task: Task, onClick: () => void }> = ({ task, onClick }) => {
  const currentUser = useStore(s => s.currentUser);
  const updateTaskStatus = useStore(s => s.updateTaskStatus);
  const profiles = useStore(s => s.profiles);
  const statuses = useStore(s => s.statuses);
  const categories = useStore(s => s.categories);
  
  const assignee = profiles.find(u => u.id === task.assignee_id);
  
  const isObserver = task.observers?.includes(currentUser?.id || '') && currentUser?.role !== 'Admin';
  
  // PERMISSIONS:
  // 1. If self-task: ONLY the creator can edit/drag.
  // 2. If regular task: Creator, Assignee, or Admin can edit/drag.
  const canEditStatus = task.is_self_task 
    ? (currentUser?.id === task.creator_id)
    : (!isObserver && (currentUser?.role === 'Admin' || currentUser?.id === task.assignee_id || currentUser?.id === task.creator_id));
  
  const isLocked = !canEditStatus;

  const currentStatus = statuses.find(s => s.name === task.status);
  const statusColor = currentStatus?.color || '#94a3b8';
  const statusNames = statuses.map(s => s.name);
  const categoryColor = categories.find(c => c.name === task.category)?.color || '#64748b';

  const isOverdue = React.useMemo(() => {
    if (!task.end_date || task.status === 'Done') return false;
    return new Date(task.end_date).getTime() < Date.now();
  }, [task.end_date, task.status]);

  const isUrgent = React.useMemo(() => {
    if (!task.end_date || task.status === 'Done' || isOverdue) return false;
    const diff = new Date(task.end_date).getTime() - Date.now();
    return diff < (1000 * 60 * 60); // 1 hour
  }, [task.end_date, task.status, isOverdue]);

  const isWarning = React.useMemo(() => {
    if (!task.end_date || task.status === 'Done' || isUrgent || isOverdue) return false;
    const diff = new Date(task.end_date).getTime() - Date.now();
    return diff < (1000 * 60 * 60 * 24); // 24 hours
  }, [task.end_date, task.status, isUrgent, isOverdue]);

  const handleDragStart = (e: React.DragEvent) => {
    if (isLocked) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('taskId', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div 
      className={`task-card ${isOverdue || isUrgent ? 'urgent-pulse' : ''}`} 
      style={{ 
        borderLeft: `3px solid ${statusColor}`, 
        border: isOverdue ? '1.5px solid var(--danger)' : isUrgent ? '1.5px solid #f87171' : undefined,
        cursor: isLocked ? 'pointer' : 'grab',
        boxShadow: isUrgent || isOverdue ? '0 0 12px rgba(239, 68, 68, 0.15)' : 'var(--shadow-sm)'
      }}
      draggable={!isLocked}
      onDragStart={handleDragStart}
      onClick={onClick}
    >
      {/* Top Row: Category + Icons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {task.category ? (
          <span style={{ 
            fontSize: '0.62rem', fontWeight: 700, color: categoryColor, 
            background: `${categoryColor}12`, padding: '0.2rem 0.5rem', 
            borderRadius: 'var(--radius-sm)', textTransform: 'uppercase', 
            letterSpacing: '0.04em',
            border: `1px solid ${categoryColor}18`
          }}>
            {task.category}
          </span>
        ) : <span />}
        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
          {isOverdue && <div title="OVERDUE" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.6rem', fontWeight: 800 }}><AlertTriangle size={12}/></div>}
          {isUrgent && <div title="ENDS SOON ( < 1h )" style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.6rem', fontWeight: 800 }}><AlertCircle size={12}/></div>}
          {task.is_self_task && <Lock size={11} style={{ color: 'var(--primary)', opacity: 0.8 }} />}
          {task.is_recurring && <Repeat size={11} style={{ color: '#34d399', opacity: 0.85 }} />}
          {isObserver && <Eye size={11} style={{ color: 'var(--success)', opacity: 0.7 }} />}
          {!isLocked && <GripVertical size={11} style={{ color: 'var(--text-4)', opacity: 0.4 }} />}
        </div>
      </div>
      
      {/* Title */}
      <div className="task-title">{task.title}</div>
      
      {/* Description removed as requested */}

      {/* Bottom Area */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.68rem', 
          color: isOverdue ? 'var(--danger)' : isUrgent ? '#f87171' : isWarning ? '#f59e0b' : 'var(--text-4)',
          fontWeight: isUrgent || isOverdue ? 600 : 400
        }}>
          <Calendar size={11} style={{ opacity: 0.6 }} />
          <span>
            {!task.start_date && !task.end_date 
              ? 'No date' 
              : task.start_date && task.end_date 
                ? `${formatDateTime(task.start_date)} — ${formatDateTime(task.end_date)}`
                : formatDateTime(task.start_date || task.end_date)}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
            {/* Maker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--text-4)', width: '32px' }}>MAKER</span>
              <div className="avatar" style={{ width: '18px', height: '18px', fontSize: '0.5rem', borderWidth: '1px' }}>
                {(profiles.find(u => u.id === task.creator_id)?.full_name || '?').charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-3)' }}>
                {profiles.find(u => u.id === task.creator_id)?.full_name?.split(' ')[0] || 'Unknown'}
              </span>
            </div>

            {/* Owner */}
            {!task.is_self_task && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--text-4)', width: '32px' }}>OWNER</span>
                {assignee ? (
                  <>
                    <div className="avatar" style={{ width: '18px', height: '18px', fontSize: '0.5rem', borderWidth: '1.5px' }}>
                      {assignee.full_name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-2)' }}>
                      {assignee.full_name.split(' ')[0]}
                    </span>
                  </>
                ) : <span style={{ fontSize: '0.65rem', fontStyle: 'italic', color: 'var(--text-4)' }}>Unassigned</span>}
              </div>
            )}

            {/* Observers */}
            {task.observers && task.observers.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--text-4)', width: '32px' }}>WATCH</span>
                <div style={{ display: 'flex', gap: '0.15rem' }}>
                  {task.observers.slice(0, 4).map(obsId => {
                    const obs = profiles.find(p => p.id === obsId);
                    if (!obs) return null;
                    return (
                      <div key={obsId} className="avatar" style={{ width: '16px', height: '16px', fontSize: '0.45rem', borderWidth: '1px' }} title={obs.full_name}>
                        {obs.full_name.charAt(0).toUpperCase()}
                      </div>
                    );
                  })}
                  {task.observers.length > 4 && <span style={{ fontSize: '0.55rem', color: 'var(--text-4)' }}>+{task.observers.length - 4}</span>}
                </div>
              </div>
            )}
          </div>

          {isLocked ? (
            <span style={{ 
              fontSize: '0.62rem', fontWeight: 700, color: statusColor, 
              textTransform: 'uppercase', letterSpacing: '0.03em',
              background: `${statusColor}10`, padding: '0.15rem 0.4rem',
              borderRadius: 'var(--radius-sm)'
            }}>
              {task.status}
            </span>
          ) : (
            <select 
              value={task.status}
              onClick={e => e.stopPropagation()}
              onChange={(e) => updateTaskStatus(task.id, e.target.value)}
              style={{ 
                fontSize: '0.68rem', border: `1px solid ${statusColor}30`, 
                background: 'var(--surface-2)', padding: '0.2rem 1.25rem 0.2rem 0.4rem', 
                height: '22px', color: statusColor, fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer'
              }}
            >
              {statusNames.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>
    </div>
  );
};
