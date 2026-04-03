import React from 'react';
import type { Task } from '../../../lib/supabase';
import { useStore } from '../../../store/useStore';
import { Calendar, Eye, GripVertical } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const TaskCard: React.FC<{ task: Task, onClick: () => void }> = ({ task, onClick }) => {
  const currentUser = useStore(s => s.currentUser);
  const updateTaskStatus = useStore(s => s.updateTaskStatus);
  const profiles = useStore(s => s.profiles);
  const statuses = useStore(s => s.statuses);
  const categories = useStore(s => s.categories);
  
  const assignee = profiles.find(u => u.id === task.assignee_id);
  
  const isObserver = task.observers?.includes(currentUser?.id || '') && currentUser?.role !== 'Admin';
  const canEditStatus = !isObserver && (currentUser?.role === 'Admin' || currentUser?.id === task.assignee_id || currentUser?.id === task.creator_id);
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
          {isObserver && <Eye size={11} style={{ color: 'var(--success)', opacity: 0.7 }} />}
          {!isLocked && <GripVertical size={11} style={{ color: 'var(--text-4)', opacity: 0.4 }} />}
        </div>
      </div>
      
      {/* Title */}
      <div className="task-title">{task.title}</div>
      
      {/* Description */}
      {task.description && (
        <div className="task-desc-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {task.description}
          </ReactMarkdown>
        </div>
      )}

      {/* Bottom Row: Avatar + Date + Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.375rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {assignee ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <div className="avatar" style={{ fontSize: '0.6rem', width: '22px', height: '22px', borderWidth: '1.5px' }}>
                {assignee.full_name.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-2)' }}>
                {assignee.full_name.split(' ')[0]}
              </span>
            </div>
          ) : null}
          {(task.start_date || task.end_date) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.68rem', color: 'var(--text-4)', marginLeft: '0.25rem' }}>
              <Calendar size={10} />
              <span>{task.end_date || task.start_date || '—'}</span>
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
  );
};
