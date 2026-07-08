import React, { useEffect, useState, useMemo } from 'react';
import { useStore } from '../../../store/useStore';
import { canViewTaskByDepartment, getTaskAssigneeIds, isTaskAssignee } from '../../../lib/supabase';
import { TaskCard } from './TaskCard';
import { Search, Filter, ArrowUpDown, Clock, User as UserIcon, Tag, LayoutGrid, ListChecks, Lock, AlertTriangle, AlertCircle, Plus } from 'lucide-react';
import { formatDateTime } from '../../../lib/format';
import { AppSelect } from '../../../components/Shared/AppSelect';

export const TaskBoard: React.FC<{ 
  onSelectTask: (id: string | null) => void,
  onOpenCreateModal: () => void 
}> = ({ onSelectTask, onOpenCreateModal }) => {
  const viewMode = useStore(s => s.viewMode);
  const currentUser = useStore(s => s.currentUser);
  const updateTaskStatus = useStore(s => s.updateTaskStatus);
  const profiles = useStore(s => s.profiles);
  const statuses = useStore(s => s.statuses);
  const categories = useStore(s => s.categories);
  const tasks = useStore(s => s.tasks);
  const dashboardTaskFilters = useStore(s => s.dashboardTaskFilters);
  const setDashboardTaskFilters = useStore(s => s.setDashboardTaskFilters);
  
  // Compute visible tasks based on role
  const visibleTasks = useMemo(() => {
    if (!currentUser) return [];
    return tasks.filter(task => {
      // If it's a self-task, ONLY the creator can see it, regardless of role.
      if (task.is_self_task) {
        return task.creator_id === currentUser.id;
      }
      
      if (currentUser.role === 'Admin') return true;
      return isTaskAssignee(task, currentUser.id) ||
             (task.creator_id === currentUser.id) ||
             (task.observers && task.observers.includes(currentUser.id)) ||
             canViewTaskByDepartment(task, currentUser, profiles);
    });
  }, [tasks, currentUser, profiles]);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterAssignee, setFilterAssignee] = useState<string>('All');
  const [filterSelfTasks, setFilterSelfTasks] = useState<'all' | 'only' | 'hide'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'status'>('date');

  useEffect(() => {
    if (!dashboardTaskFilters) return;

    setFilterStatus(dashboardTaskFilters.status || 'All');
    setFilterCategory(dashboardTaskFilters.category || 'All');
    setFilterAssignee(dashboardTaskFilters.assignee || 'All');
    setFilterSelfTasks(dashboardTaskFilters.selfTasks || 'all');
    setSearchQuery('');
    setDashboardTaskFilters(null);
  }, [dashboardTaskFilters, setDashboardTaskFilters]);

  const filteredTasks = useMemo(() => {
    let result = visibleTasks.filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (t.description?.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = filterStatus === 'All' || t.status === filterStatus;
      const matchesCategory = filterCategory === 'All' || t.category === filterCategory;
      const matchesAssignee = filterAssignee === 'All' ||
        (filterAssignee === 'unassigned'
          ? getTaskAssigneeIds(t).length === 0
          : isTaskAssignee(t, filterAssignee));
      const matchesSelf = 
        filterSelfTasks === 'all' ? true :
        filterSelfTasks === 'only' ? t.is_self_task === true :
        t.is_self_task !== true;

      return matchesSearch && matchesStatus && matchesCategory && matchesAssignee && matchesSelf;
    });

    if (sortBy === 'name') result.sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === 'date') result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sortBy === 'status') result.sort((a, b) => a.status.localeCompare(b.status));

    return result;
  }, [visibleTasks, searchQuery, filterStatus, filterCategory, filterAssignee, filterSelfTasks, sortBy]);

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
          <AppSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: 'All', label: 'All Statuses' },
              ...statuses.map(s => ({ value: s.name, label: s.name, color: s.color }))
            ]}
            compact
          />
        </div>

        <div className="filter-select-group">
          <Tag size={13} style={{ opacity: 0.4 }} />
          <AppSelect
            value={filterCategory}
            onChange={setFilterCategory}
            options={[
              { value: 'All', label: 'All Categories' },
              ...categories.map(c => ({ value: c.name, label: c.name, color: c.color }))
            ]}
            compact
          />
        </div>

        {currentUser.role === 'Admin' && (
          <div className="filter-select-group">
            <UserIcon size={13} style={{ opacity: 0.4 }} />
            <AppSelect
              value={filterAssignee}
              onChange={setFilterAssignee}
              options={[
                { value: 'All', label: 'All Assignees' },
                { value: 'unassigned', label: 'Unassigned' },
                ...profiles.map(p => ({ value: p.id, label: p.full_name }))
              ]}
              compact
            />
          </div>
        )}

        <div className="filter-select-group">
          <Lock size={13} style={{ opacity: 0.4 }} />
          <AppSelect
            value={filterSelfTasks}
            onChange={value => setFilterSelfTasks(value as 'all' | 'only' | 'hide')}
            options={[
              { value: 'all', label: 'All Tasks' },
              { value: 'only', label: 'Self Tasks Only' },
              { value: 'hide', label: 'Team Tasks Only' }
            ]}
            compact
          />
        </div>

        <div className="filter-select-group" style={{ background: 'var(--surface-3)', borderColor: 'transparent' }}>
          <ArrowUpDown size={13} style={{ color: 'var(--primary)' }} />
          <AppSelect
            value={sortBy}
            onChange={value => setSortBy(value as 'name' | 'date' | 'status')}
            options={[
              { value: 'date', label: 'Sort by Date' },
              { value: 'name', label: 'Sort by Name' },
              { value: 'status', label: 'Sort by Status' }
            ]}
            compact
          />
        </div>

        {(activeFilterCount > 0 || filterSelfTasks !== 'all' || searchQuery !== '') && (
          <button 
            onClick={() => { setFilterStatus('All'); setFilterCategory('All'); setFilterAssignee('All'); setFilterSelfTasks('all'); setSearchQuery(''); }}
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
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );

  if (viewMode === 'scrum') {
    return (
      <div className="animate-fadeIn">
        <header style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ 
                width: '36px', height: '36px', borderRadius: 'var(--radius-md)', 
                background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' 
              }}>
                <ListChecks size={18} style={{ color: 'var(--primary)' }} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1)' }}>List View</h1>
                <p style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>Analytical overview of all tasks and operations.</p>
              </div>
            </div>
            
            <button className="primary-btn" onClick={onOpenCreateModal}>
              <Plus size={16} /> New Task
            </button>
          </div>
        </header>

        <FilterBar />

        <div className="scrum-table-wrapper" style={{ borderRadius: 'var(--radius-xl)', overflowX: 'auto', overflowY: 'hidden' }}>
          <table className="scrum-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>Task</th>
                <th>Category</th>
                <th>Timeline</th>
                <th>Team</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(task => {
                const assignees = profiles.filter(profile => getTaskAssigneeIds(task).includes(profile.id));
                const isObs = task.observers?.includes(currentUser.id) && currentUser.role !== 'Admin';
                const canEdit = !isObs && (
                  currentUser.role === 'Admin' ||
                  isTaskAssignee(task, currentUser.id) ||
                  currentUser.id === task.creator_id
                );
                const catColor = categories.find(c => c.name === task.category)?.color || '#64748b';
                const statColor = statuses.find(s => s.name === task.status)?.color || '#64748b';

                return (
                  <tr 
                    key={task.id} 
                    className={`scrum-row ${task.priority === 'High' ? 'high-priority-row' : ''}`}
                    onClick={() => onSelectTask(task.id)}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {task.is_self_task && <Lock size={12} style={{ color: 'var(--primary)', opacity: 0.8 }} />}
                        {task.priority === 'High' && (
                          <span className="high-priority-alert">
                            <AlertTriangle size={12} />
                            High
                          </span>
                        )}
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-1)' }}>{task.title}</div>
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
                      <div style={{ 
                        display: 'flex', alignItems: 'center', gap: '0.4rem', 
                        fontSize: '0.8rem', 
                        color: (new Date(task.end_date || '').getTime() < Date.now() && task.status !== 'Done') ? 'var(--danger)' : 
                               (new Date(task.end_date || '').getTime() - Date.now() < 3600000 && task.status !== 'Done') ? '#f87171' : 'var(--text-3)',
                        fontWeight: (new Date(task.end_date || '').getTime() - Date.now() < 3600000 && task.status !== 'Done') ? 600 : 400
                      }}>
                        <Clock size={13} style={{ 
                          color: (new Date(task.end_date || '').getTime() < Date.now() && task.status !== 'Done') ? 'var(--danger)' : 'var(--primary)', 
                          opacity: 0.6 
                        }} />
                        <span style={{ whiteSpace: 'nowrap' }}>
                          {!task.start_date && !task.end_date 
                            ? 'No date' 
                            : task.start_date && task.end_date 
                              ? `${formatDateTime(task.start_date)} — ${formatDateTime(task.end_date)}`
                              : formatDateTime(task.start_date || task.end_date)}
                        </span>
                        {new Date(task.end_date || '').getTime() < Date.now() && task.status !== 'Done' && <AlertTriangle size={12} color="var(--danger)" />}
                        {(new Date(task.end_date || '').getTime() - Date.now() < 3600000 && new Date(task.end_date || '').getTime() > Date.now() && task.status !== 'Done') && <AlertCircle size={12} color="#f87171" />}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {/* Maker */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-4)', width: '40px' }}>MAKER</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div className="avatar" style={{ width: '20px', height: '20px', fontSize: '0.55rem' }}>
                              {(profiles.find(u => u.id === task.creator_id)?.full_name || '?').charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>{profiles.find(u => u.id === task.creator_id)?.full_name || 'Unknown'}</span>
                          </div>
                        </div>
                        {/* Assignee */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-4)', width: '40px' }}>OWNER</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div style={{ display: 'flex' }}>
                              {assignees.slice(0, 3).map((assignee, index) => (
                                <div
                                  key={assignee.id}
                                  className="avatar"
                                  title={assignee.full_name}
                                  style={{
                                    width: '20px', height: '20px', fontSize: '0.55rem',
                                    marginLeft: index === 0 ? 0 : '-5px'
                                  }}
                                >
                                  {assignee.full_name.charAt(0).toUpperCase()}
                                </div>
                              ))}
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)' }}>
                              {assignees.length > 0
                                ? assignees.map(assignee => assignee.full_name).join(', ')
                                : 'Unassigned'}
                            </span>
                          </div>
                        </div>
                        {/* Observers */}
                        {task.observers && task.observers.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-4)', width: '40px' }}>WATCH</span>
                            <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
                              {task.observers.map(obsId => {
                                const obs = profiles.find(p => p.id === obsId);
                                if (!obs) return null;
                                return (
                                  <div key={obsId} className="avatar" style={{ width: '18px', height: '18px', fontSize: '0.5rem' }} title={obs.full_name}>
                                    {obs.full_name.charAt(0).toUpperCase()}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
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
                        <div onClick={e => e.stopPropagation()}>
                          <AppSelect
                            value={task.status}
                            onChange={(value) => updateTaskStatus(task.id, value)}
                            options={statuses.map(s => ({ value: s.name, label: s.name, color: s.color }))}
                            accentColor={statColor}
                            style={{ 
                              width: '150px'
                            }}
                          />
                        </div>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              width: '36px', height: '36px', borderRadius: 'var(--radius-md)', 
              background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' 
            }}>
              <LayoutGrid size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1)' }}>Board View</h1>
              <p style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>Drag and drop tasks between status columns.</p>
            </div>
          </div>

          <button className="primary-btn" onClick={onOpenCreateModal}>
            <Plus size={16} /> New Task
          </button>
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
        {(() => {
          const unmappedTasks = filteredTasks.filter(t => !statuses.find(s => s.name === t.status));
          if (unmappedTasks.length === 0) return null;
          
          return (
            <div 
              key="unmapped" 
              className="column" 
              style={{ borderTop: `3px solid #ff4444` }}
            >
              <div className="column-title">
                <div style={{ 
                  width: '8px', height: '8px', borderRadius: '50%', 
                  background: '#ff4444', 
                  boxShadow: `0 0 10px #ff444460` 
                }} />
                Unmapped Status
                <span className="badge" style={{ 
                  background: `#ff444415`, color: '#ff4444', 
                  border: `1px solid #ff444425`,
                  fontSize: '0.6rem'
                }}>
                  {unmappedTasks.length}
                </span>
              </div>
              
              <div style={{ 
                minHeight: '250px', 
                display: 'flex', flexDirection: 'column', gap: '0.625rem',
                transition: 'var(--transition)'
              }}>
                {unmappedTasks.map(task => (
                  <TaskCard key={task.id} task={task} onClick={() => onSelectTask(task.id)} />
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
