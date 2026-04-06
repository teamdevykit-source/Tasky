import React from 'react';
import type { Task } from '../../../lib/supabase';
import { useStore } from '../../../store/useStore';
import { Calendar, Eye, GripVertical, Lock } from 'lucide-react';

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
      className="task-card" 
      style={{ borderLeft: `3px solid ${statusColor}`, cursor: isLocked ? 'pointer' : 'grab' }}
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
          {task.is_self_task && <Lock size={11} style={{ color: 'var(--primary)', opacity: 0.8 }} />}
          {isObserver && <Eye size={11} style={{ color: 'var(--success)', opacity: 0.7 }} />}
          {!isLocked && <GripVertical size={11} style={{ color: 'var(--text-4)', opacity: 0.4 }} />}
        </div>
      </div>
      
      {/* Title */}
      <div className="task-title">{task.title}</div>
      
      {/* Description removed as requested */}

      {/* Bottom Area */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
        {/* Date Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.68rem', color: 'var(--text-4)' }}>
          <Calendar size={11} style={{ opacity: 0.6 }} />
          <span>
            {!task.start_date && !task.end_date 
              ? 'No date' 
              : `${task.end_date || task.start_date || '—'}`}
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
