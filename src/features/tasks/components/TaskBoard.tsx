import React, { useState, useMemo } from 'react';
import { useStore } from '../../../store/useStore';
import { TaskCard } from './TaskCard';
import { Search, Filter, ArrowUpDown, Clock, User as UserIcon, Tag, LayoutGrid, ListChecks } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const TaskBoard: React.FC<{ onSelectTask: (id: string | null) => void }> = ({ onSelectTask }) => {
  const viewMode = useStore(s => s.viewMode);
  const currentUser = useStore(s => s.currentUser);
  const updateTaskStatus = useStore(s => s.updateTaskStatus);
  const profiles = useStore(s => s.profiles);
  const statuses = useStore(s => s.statuses);
  const categories = useStore(s => s.categories);
  const tasks = useStore(s => s.tasks);
  
  // Compute visible tasks based on role
  const visibleTasks = useMemo(() => {
    if (!currentUser) return [];
    return tasks.filter(task => {
      if (currentUser.role === 'Admin') return true;
      return (task.assignee_id === currentUser.id) || 
             (task.creator_id === currentUser.id) ||
             (task.observers && task.observers.includes(currentUser.id));
    });
  }, [tasks, currentUser]);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterAssignee, setFilterAssignee] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'status'>('date');

  const filteredTasks = useMemo(() => {
    let result = visibleTasks.filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (t.description?.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = filterStatus === 'All' || t.status === filterStatus;
      const matchesCategory = filterCategory === 'All' || t.category === filterCategory;
      const matchesAssignee = filterAssignee === 'All' || t.assignee_id === filterAssignee;
      return matchesSearch && matchesStatus && matchesCategory && matchesAssignee;
    });

    if (sortBy === 'name') result.sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === 'date') result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sortBy === 'status') result.sort((a, b) => a.status.localeCompare(b.status));

    return result;
  }, [visibleTasks, searchQuery, filterStatus, filterCategory, filterAssignee, sortBy]);

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

  const activeFilterCount = [filterStatus, filterCategory, filterAssignee].filter(f => f !== 'All').length;

  const FilterBar = () => (
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
      {/* Search */}
      <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
        <Search size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
        <input 
          type="text" 
          placeholder="Search tasks..." 
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
      
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="filter-select-group">
          <Filter size={13} style={{ opacity: 0.4 }} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="clean-select">
            <option value="All">All Statuses</option>
            {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>

        <div className="filter-select-group">
          <Tag size={13} style={{ opacity: 0.4 }} />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="clean-select">
            <option value="All">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        {currentUser.role === 'Admin' && (
          <div className="filter-select-group">
            <UserIcon size={13} style={{ opacity: 0.4 }} />
            <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="clean-select">
              <option value="All">All Assignees</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
        )}

        <div className="filter-select-group" style={{ background: 'var(--surface-3)', borderColor: 'transparent' }}>
          <ArrowUpDown size={13} style={{ color: 'var(--primary)' }} />
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="clean-select">
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>

        {activeFilterCount > 0 && (
          <button 
            onClick={() => { setFilterStatus('All'); setFilterCategory('All'); setFilterAssignee('All'); setSearchQuery(''); }}
            style={{ 
              padding: '0.4rem 0.75rem', 
              borderRadius: 'var(--radius-full)', 
              background: 'rgba(248,113,113,0.1)', 
              color: '#f87171', 
              fontSize: '0.75rem', 
              fontWeight: 600,
              border: '1px solid rgba(248,113,113,0.15)',
              cursor: 'pointer'
            }}
          >
            Clear {activeFilterCount}
          </button>
        )}
      </div>
    </div>
  );

  if (viewMode === 'scrum') {
    return (
      <div className="animate-fadeIn">
        <header style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <div style={{ 
              width: '36px', height: '36px', borderRadius: 'var(--radius-md)', 
              background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' 
            }}>
              <ListChecks size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1)' }}>Scrum Table</h1>
              <p style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>Analytical overview of all tasks and operations.</p>
            </div>
          </div>
        </header>

        <FilterBar />

        <div className="scrum-table-wrapper" style={{ borderRadius: 'var(--radius-xl)', overflowX: 'auto', overflowY: 'hidden' }}>
          <table className="scrum-table">
            <thead>
              <tr>
                <th style={{ width: '35%' }}>Task</th>
                <th>Category</th>
                <th>Timeline</th>
                <th>Assignee</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(task => {
                const assignee = profiles.find(u => u.id === task.assignee_id);
                const isObs = task.observers?.includes(currentUser.id) && currentUser.role !== 'Admin';
                const canEdit = !isObs && (currentUser.role === 'Admin' || currentUser.id === task.assignee_id || currentUser.id === task.creator_id);
                const catColor = categories.find(c => c.name === task.category)?.color || '#64748b';
                const statColor = statuses.find(s => s.name === task.status)?.color || '#64748b';

                return (
                  <tr 
                    key={task.id} 
                    className="scrum-row" 
                    onClick={() => onSelectTask(task.id)}
                  >
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-1)', marginBottom: '0.2rem' }}>{task.title}</div>
                      <div className="task-desc-markdown" style={{ fontSize: '0.78rem', maxHeight: '36px', overflow: 'hidden' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description || ''}</ReactMarkdown>
                      </div>
                    </td>
                    <td>
                      {task.category ? (
                        <div style={{ 
                          display: 'inline-flex', alignItems: 'center', gap: '0.4rem', 
                          background: `${catColor}15`, color: catColor, 
                          padding: '0.3rem 0.7rem', borderRadius: 'var(--radius-full)', 
                          fontSize: '0.7rem', fontWeight: 700, 
                          textTransform: 'uppercase', letterSpacing: '0.03em',
                          border: `1px solid ${catColor}20`
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: catColor }} />
                          {task.category}
                        </div>
                      ) : <span style={{ opacity: 0.25, fontSize: '0.8rem' }}>—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-3)' }}>
                        <Clock size={13} style={{ color: 'var(--primary)', opacity: 0.5 }} />
                        <span>{task.start_date || '?'} — {task.end_date || '?'}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div className="avatar" style={{ width: '26px', height: '26px', fontSize: '0.65rem' }}>
                          {assignee?.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-2)' }}>{assignee?.full_name || 'Unassigned'}</span>
                      </div>
                    </td>
                    <td>
                      {!canEdit ? (
                        <div style={{ 
                          color: statColor, background: `${statColor}12`, 
                          padding: '0.35rem 0.8rem', borderRadius: 'var(--radius-sm)', 
                          fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', 
                          display: 'inline-block', border: `1px solid ${statColor}20` 
                        }}>
                          {task.status}
                        </div>
                      ) : (
                        <select 
                          className="task-status-select"
                          value={task.status}
                          onClick={e => e.stopPropagation()}
                          onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                          style={{ 
                            padding: '0.45rem 0.8rem', width: '150px', fontWeight: 600, 
                            borderRadius: 'var(--radius-sm)', color: statColor, 
                            borderColor: `${statColor}30`, background: 'var(--surface)',
                            fontSize: '0.8rem'
                          }}
                        >
                          {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredTasks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '5rem', background: 'var(--surface)' }}>
              <div style={{ 
                width: '64px', height: '64px', background: 'var(--surface-3)', borderRadius: '50%', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' 
              }}>
                <Search size={24} style={{ color: 'var(--text-4)', opacity: 0.4 }} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.4rem' }}>No matches found</h3>
              <p style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>Adjust your filters or search query.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <header style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <div style={{ 
            width: '36px', height: '36px', borderRadius: 'var(--radius-md)', 
            background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' 
          }}>
            <LayoutGrid size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1)' }}>Kanban Board</h1>
            <p style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>Drag and drop tasks between status columns.</p>
          </div>
        </div>
      </header>

      <FilterBar />

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
                <div style={{ 
                  width: '8px', height: '8px', borderRadius: '50%', 
                  background: column.color, 
                  boxShadow: `0 0 10px ${column.color}60` 
                }} />
                {column.name}
                <span className="badge" style={{ 
                  background: `${column.color}15`, color: column.color, 
                  border: `1px solid ${column.color}25`,
                  fontSize: '0.6rem'
                }}>
                  {columnTasks.length}
                </span>
              </div>
              
              <div style={{ 
                minHeight: '250px', 
                display: 'flex', flexDirection: 'column', gap: '0.625rem',
                transition: 'var(--transition)'
              }}>
                {columnTasks.map(task => (
                  <TaskCard key={task.id} task={task} onClick={() => onSelectTask(task.id)} />
                ))}
                {columnTasks.length === 0 && (
                  <div style={{ 
                    textAlign: 'center', color: 'var(--text-4)', fontSize: '0.8rem', 
                    padding: '3rem 1rem', opacity: 0.5 
                  }}>
                    <div style={{ 
                      border: '2px dashed var(--border-strong)', 
                      borderRadius: 'var(--radius-lg)', 
                      padding: '1.5rem',
                      fontSize: '0.75rem'
                    }}>
                      Drop tasks here
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
