import React, { useState, useMemo } from 'react';
import { useStore } from '../../../store/useStore';
import { TaskCard } from './TaskCard';
import { Search, ArrowUpDown, Lock, Plus, ListChecks, LayoutGrid } from 'lucide-react';
import { CreateTaskModal } from './CreateTaskModal';

export const MyTasksView: React.FC<{ onSelectTask: (id: string | null) => void }> = ({ onSelectTask }) => {
  const currentUser = useStore(s => s.currentUser);
  const tasks = useStore(s => s.tasks);
  const statuses = useStore(s => s.statuses);
  const updateTaskStatus = useStore(s => s.updateTaskStatus);
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'status'>('date');
  const [viewStyle, setViewStyle] = useState<'kanban' | 'list'>('kanban');

  // Filter tasks to ONLY show Self Tasks for the current user
  const mySelfTasks = useMemo(() => {
    if (!currentUser) return [];
    return tasks.filter(t => t.is_self_task && t.creator_id === currentUser.id);
  }, [tasks, currentUser]);

  const filteredTasks = useMemo(() => {
    let result = mySelfTasks.filter(t => 
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (t.description?.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (sortBy === 'name') result.sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === 'date') result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sortBy === 'status') result.sort((a, b) => a.status.localeCompare(b.status));

    return result;
  }, [mySelfTasks, searchQuery, sortBy]);

  if (!currentUser) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).style.background = 'rgba(129,140,248,0.05)';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.background = '';
  };

  const handleDrop = (e: React.DragEvent, statusName: string) => {
    (e.currentTarget as HTMLElement).style.background = '';
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      updateTaskStatus(taskId, statusName);
    }
  };

  return (
    <div className="animate-fadeIn">
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <div style={{ 
              width: '36px', height: '36px', borderRadius: 'var(--radius-md)', 
              background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' 
            }}>
              <Lock size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1)' }}>My Private Tasks</h1>
              <p style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>Personal workspace for your individual tasks and notes.</p>
            </div>
          </div>
        </div>

        <button 
          onClick={() => setIsCreateModalOpen(true)}
          className="primary-btn"
          style={{ padding: '0.7rem 1.25rem' }}
        >
          <Plus size={18} />
          <span>New Private Task</span>
        </button>
      </header>

      {/* Filter Bar */}
      <div style={{ 
        display: 'flex', 
        gap: '0.75rem', 
        flexWrap: 'wrap', 
        marginBottom: '1.5rem', 
        background: 'var(--surface-2)', 
        padding: '1rem 1.25rem', 
        borderRadius: 'var(--radius-xl)', 
        border: '1px solid var(--border)',
        alignItems: 'center'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
          <input 
            type="text" 
            placeholder="Search my tasks..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '0.6rem 1rem 0.6rem 2.5rem', 
              borderRadius: 'var(--radius-md)', 
              border: '1.5px solid var(--border)', 
              background: 'var(--surface)', 
              fontSize: '0.85rem',
              color: 'var(--text-1)',
              transition: 'var(--transition)'
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div className="filter-select-group">
            <ArrowUpDown size={13} style={{ opacity: 0.4 }} />
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="clean-select">
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
              <option value="status">Sort by Status</option>
            </select>
          </div>

          <div style={{ display: 'flex', padding: '0.2rem', background: 'var(--surface-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <button 
              onClick={() => setViewStyle('kanban')}
              style={{ 
                padding: '0.35rem 0.6rem', border: 'none', borderRadius: 'var(--radius-sm)',
                background: viewStyle === 'kanban' ? 'var(--surface)' : 'transparent',
                color: viewStyle === 'kanban' ? 'var(--primary)' : 'var(--text-4)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', transition: '0.2s'
              }}
            >
              <LayoutGrid size={14} />
            </button>
            <button 
              onClick={() => setViewStyle('list')}
              style={{ 
                padding: '0.35rem 0.6rem', border: 'none', borderRadius: 'var(--radius-sm)',
                background: viewStyle === 'list' ? 'var(--surface)' : 'transparent',
                color: viewStyle === 'list' ? 'var(--primary)' : 'var(--text-4)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', transition: '0.2s'
              }}
            >
              <ListChecks size={14} />
            </button>
          </div>
        </div>
      </div>

      {viewStyle === 'kanban' ? (
        <div className="board-container">
          {statuses.map(column => {
            const columnTasks = filteredTasks.filter(t => t.status === column.name);
            
            return (
              <div 
                key={column.id} 
                className="column" 
                style={{ borderTop: `3px solid ${column.color}` }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.name)}
              >
                <div className="column-title">
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: column.color }} />
                  {column.name}
                  <span className="badge" style={{ background: `${column.color}15`, color: column.color }}>
                    {columnTasks.length}
                  </span>
                </div>
                
                <div style={{ minHeight: '200px', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {columnTasks.map(task => (
                    <TaskCard key={task.id} task={task} onClick={() => onSelectTask(task.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {filteredTasks.length > 0 ? (
            <div style={{ padding: '0.5rem' }}>
              {filteredTasks.map(task => (
                <div 
                  key={task.id} 
                  onClick={() => onSelectTask(task.id)}
                  style={{ 
                    display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.875rem 1.25rem', 
                    borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'var(--transition)',
                    borderBottom: '1px solid var(--border-subtle)'
                  }}
                  className="hover-surface-2"
                >
                  <div style={{ 
                    width: '10px', height: '10px', borderRadius: '50%', 
                    background: statuses.find(s => s.name === task.status)?.color || 'var(--primary)' 
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-1)' }}>{task.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-4)' }}>{task.status}</div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-4)' }}>
                    {task.end_date || task.created_at.split('T')[0]}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
              <Lock size={32} style={{ color: 'var(--text-4)', opacity: 0.3, marginBottom: '1rem' }} />
              <p style={{ color: 'var(--text-4)' }}>No private tasks found matching your search.</p>
            </div>
          )}
        </div>
      )}

      {mySelfTasks.length === 0 && (
        <div style={{ 
          textAlign: 'center', padding: '6rem 2rem', background: 'var(--surface)', 
          borderRadius: 'var(--radius-2xl)', border: '1px dashed var(--border-strong)', marginTop: '2rem'
        }}>
          <div style={{ 
            width: '80px', height: '80px', background: 'var(--primary-light)', borderRadius: '50%', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem'
          }}>
            <Lock size={32} style={{ color: 'var(--primary)' }} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: '0.5rem' }}>No Private Tasks Yet</h2>
          <p style={{ color: 'var(--text-4)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto 2rem', lineHeight: 1.6 }}>
            "Self Tasks" are private items that only you can see. Use them for personal notes, individual focus, or brainstorming.
          </p>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="primary-btn"
            style={{ margin: '0 auto' }}
          >
            <Plus size={18} />
            <span>Create Your First Private Task</span>
          </button>
        </div>
      )}

      {isCreateModalOpen && (
        <CreateTaskModal 
          onClose={() => setIsCreateModalOpen(false)} 
          forceSelfTask={true}
        />
      )}
    </div>
  );
};
