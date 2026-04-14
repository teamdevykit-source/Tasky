import React, { useState } from 'react';
import { useStore } from '../../../store/useStore';
import { Bell, AlertTriangle, Clock, Calendar, ChevronRight, CheckCircle2, ListTodo, XCircle, Search, Filter, X, Users, Mail, Zap } from 'lucide-react';
import { formatDateTime } from '../../../lib/format';

export const RemindersView: React.FC<{ 
  onSelectTask: (id: string) => void,
  onOpenCreateModal: () => void 
}> = ({ onSelectTask, onOpenCreateModal }) => {
  const reminders = useStore(s => s.reminders);
  const tasks = useStore(s => s.tasks);
  const profiles = useStore(s => s.profiles);
  const categories = useStore(s => s.categories);
  const currentUser = useStore(s => s.currentUser);
  const dismissReminder = useStore(s => s.dismissReminder);
  const getVisibleTasks = useStore(s => s.getVisibleTasks);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeAssigneeId, setActiveAssigneeId] = useState<string | null>(null);

  if (!currentUser) return null;

  // 1. Initial Data Fetching
  const visibleTasks = getVisibleTasks();
  
  // 2. Filtration Logic
  const filterTask = (task: any) => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (task.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory ? task.category === activeCategory : true;
    const matchesAssignee = activeAssigneeId ? task.assignee_id === activeAssigneeId : true;
    return matchesSearch && matchesCategory && matchesAssignee;
  };

  // 3. Process Lists
  const undoneTasks = visibleTasks.filter(t => t.status !== 'Done' && filterTask(t));

  const overdueReminders = reminders.filter(r => {
    const t = tasks.find(task => task.id === r.taskId);
    return r.type === 'overdue' && t && filterTask(t);
  });
  
  const urgentReminders = reminders.filter(r => {
    const t = tasks.find(task => task.id === r.taskId);
    return r.type === 'urgent' && t && filterTask(t);
  });

  const getTaskInfo = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return null;
    const assignee = profiles.find(p => p.id === task.assignee_id);
    return { task, assignee };
  };

  const handleEmailReminder = (task: any, assignee: any) => {
    if (!assignee?.email) {
      alert("This user doesn't have an email address associated with their profile.");
      return;
    }
    
    const isOverdue = task.end_date && new Date(task.end_date) < new Date();
    const statusLabel = isOverdue ? '🚨 OVERDUE' : '⏳ REMINDER';
    
    const subject = encodeURIComponent(`${statusLabel}: ${task.title}`);
    const body = encodeURIComponent(
      `Hello ${assignee.full_name},\n\n` +
      `This is a notification regarding your assigned task:\n\n` +
      `📌 TASK: ${task.title}\n` +
      `📅 DEADLINE: ${task.end_date ? formatDateTime(task.end_date) : 'No deadline set'}\n` +
      `📂 CATEGORY: ${task.category || 'General'}\n` +
      `💬 DESCRIPTION: ${task.description || 'No additional details.'}\n\n` +
      `Please check the Task Manager app to update your progress.\n\n` +
      `Best regards,\n` +
      `${currentUser.full_name}`
    );

    window.location.href = `mailto:${assignee.email}?subject=${subject}&body=${body}`;
  };

  const ReminderCard = ({ r, color, label }: { r: any; color: string; label: string }) => {
    const taskInfo = getTaskInfo(r.taskId);
    if (!taskInfo) return null;
    const { task, assignee } = taskInfo;

    return (
      <div 
        key={r.id} 
        className="task-card"
        style={{ 
          border: `1px solid ${color}33`, 
          background: `${color}0D`,
          padding: '1.25rem'
        }}
        onClick={() => onSelectTask(task.id)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {label}
            </h3>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '1rem' }}>{task.title}</div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-4)' }}>
                <Clock size={14} /> 
                <span style={{ fontWeight: 600, color }}>{formatDateTime(task.end_date)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-4)' }}>
                <Calendar size={14} /> 
                <span>{task.category || 'No Category'}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button 
              className="close-btn" 
              title="Send email reminder"
              onClick={(e) => { e.stopPropagation(); handleEmailReminder(task, assignee); }}
              style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}
            >
              <Mail size={16} />
            </button>
            <button 
              className="close-btn" 
              onClick={(e) => { e.stopPropagation(); dismissReminder(r.id); }}
              style={{ background: `${color}1A`, color }}
            >
              <CheckCircle2 size={16} />
            </button>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${color}1A` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className="avatar" style={{ width: '24px', height: '24px', fontSize: '0.6rem' }}>
              {assignee?.full_name.charAt(0) || '?'}
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{assignee?.full_name || 'Unassigned'}</span>
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            VIEW TASK <ChevronRight size={14} />
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fadeIn">
      <header style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              width: '36px', height: '36px', borderRadius: 'var(--radius-md)', 
              background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' 
            }}>
              <Bell size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1)' }}>Reminders Assistant</h1>
              <p style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>Keep track of your deadlines and urgent tasks.</p>
            </div>
          </div>

          <button className="primary-btn" onClick={onOpenCreateModal}>
            <Zap size={16} /> New Task
          </button>
        </div>

        {/* ──── FILTRATION TOOLBAR ──── */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '1.25rem', 
          background: 'var(--surface-2)',
          padding: '1.5rem',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          {/* Row 1: Search */}
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
            <input 
              type="text" 
              placeholder="Search delayed or pending tasks..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.8rem 1rem 0.8rem 2.75rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-1)',
                fontSize: '0.95rem',
                outline: 'none',
                boxShadow: 'var(--shadow-xs)'
              }}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'flex-start' }}>
            {/* Row 2: Category Filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-4)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Filter size={14} />
                Category
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => setActiveCategory(null)}
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: activeCategory === null ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                    background: activeCategory === null ? 'var(--primary-light)' : 'var(--surface)',
                    color: activeCategory === null ? 'var(--primary)' : 'var(--text-3)',
                    cursor: 'pointer',
                    transition: 'var(--transition-fast)'
                  }}
                >
                  All Categories
                </button>
                {categories.map(cat => (
                  <button 
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.name)}
                    style={{
                      padding: '0.45rem 1rem',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      border: activeCategory === cat.name ? `1.5px solid ${cat.color}` : '1px solid var(--border)',
                      background: activeCategory === cat.name ? `${cat.color}15` : 'var(--surface)',
                      color: activeCategory === cat.name ? cat.color : 'var(--text-3)',
                      cursor: 'pointer',
                      transition: 'var(--transition-fast)'
                    }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 3: Assignee Filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-4)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Users size={14} />
                Assignee
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => setActiveAssigneeId(null)}
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: activeAssigneeId === null ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                    background: activeAssigneeId === null ? 'var(--primary-light)' : 'var(--surface)',
                    color: activeAssigneeId === null ? 'var(--primary)' : 'var(--text-3)',
                    cursor: 'pointer',
                    transition: 'var(--transition-fast)'
                  }}
                >
                  All Team
                </button>
                {profiles.map(p => (
                  <button 
                    key={p.id}
                    onClick={() => setActiveAssigneeId(p.id)}
                    style={{
                      padding: '0.35rem 0.8rem 0.35rem 0.45rem',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      border: activeAssigneeId === p.id ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                      background: activeAssigneeId === p.id ? 'var(--primary-light)' : 'var(--surface)',
                      color: activeAssigneeId === p.id ? 'var(--primary)' : 'var(--text-3)',
                      cursor: 'pointer',
                      transition: 'var(--transition-fast)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem'
                    }}
                  >
                    <div className="avatar" style={{ width: '20px', height: '20px', fontSize: '0.55rem', border: activeAssigneeId === p.id ? '1px solid var(--primary)' : '1px solid var(--border)' }}>
                      {p.full_name.charAt(0)}
                    </div>
                    {p.full_name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
        
        {/* Critical Alerts Dashboard */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
          
          {/* Overdue Section */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
              <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <XCircle size={20} />
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Overdue Tasks</h2>
              </div>
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: '99px', background: '#ef4444', color: 'white', fontSize: '0.75rem', fontWeight: 700 }}>{overdueReminders.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {overdueReminders.length > 0 ? overdueReminders.map(r => (
                <ReminderCard key={r.id} r={r} color="#ef4444" label="LATE" />
              )) : (
                <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--surface-2)', borderRadius: 'var(--radius-xl)', color: 'var(--text-4)', border: '2px dashed var(--border)' }}>
                  <CheckCircle2 size={32} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                  <p style={{ fontSize: '0.9rem' }}>{searchTerm || activeCategory || activeAssigneeId ? 'No matches found.' : 'No overdue tasks. Great job!'}</p>
                </div>
              )}
            </div>
          </section>

          {/* Urgent Section */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
              <div style={{ color: '#f97316', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={20} />
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Due Soon</h2>
              </div>
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: '99px', background: '#f97316', color: 'white', fontSize: '0.75rem', fontWeight: 700 }}>{urgentReminders.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {urgentReminders.length > 0 ? urgentReminders.map(r => (
                <ReminderCard key={r.id} r={r} color="#f97316" label="URGENT" />
              )) : (
                <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--surface-2)', borderRadius: 'var(--radius-xl)', color: 'var(--text-4)', border: '2px dashed var(--border)' }}>
                  <Clock size={32} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                  <p style={{ fontSize: '0.9rem' }}>{searchTerm || activeCategory || activeAssigneeId ? 'No matches found.' : 'Everything is currently on schedule.'}</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* All Undone Tasks Section */}
        <section style={{ borderTop: '1px solid var(--border)', paddingTop: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
            <div style={{ 
              width: '36px', height: '36px', borderRadius: '10px', 
              background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <ListTodo size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-1)' }}>Pending Assignments</h2>
              <p style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>List of all currently active tasks across your workspace.</p>
            </div>
            <span style={{ marginLeft: '1rem', padding: '0.2rem 0.8rem', borderRadius: '99px', background: 'var(--surface-3)', color: 'var(--text-2)', fontSize: '0.8rem', fontWeight: 700, border: '1px solid var(--border)' }}>
              {undoneTasks.length} {searchTerm || activeCategory || activeAssigneeId ? 'MATCHES' : 'TOTAL'}
            </span>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
            gap: '1.25rem' 
          }}>
            {undoneTasks.length > 0 ? undoneTasks.map(task => {
              const assignee = profiles.find(p => p.id === task.assignee_id);
              const isOverdue = task.end_date && new Date(task.end_date) < new Date();

              return (
                <div 
                  key={task.id} 
                  className="task-card"
                  style={{ 
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '160px',
                    border: isOverdue ? '1.5px solid #ef444433' : '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                  onClick={() => onSelectTask(task.id)}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <span style={{ 
                          fontSize: '0.62rem', fontWeight: 700, color: 'var(--primary)', 
                          background: 'var(--primary-light)', padding: '0.2rem 0.5rem', 
                          borderRadius: '4px', textTransform: 'uppercase'
                        }}>
                          {task.category || 'TASKS'}
                        </span>
                        {isOverdue && (
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>Overdue</span>
                        )}
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleEmailReminder(task, assignee); }}
                        style={{ border: 'none', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', padding: '2px' }}
                        title="Email Assignee"
                      >
                        <Mail size={14} />
                      </button>
                    </div>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: '0.5rem', lineHeight: 1.4 }}>{task.title}</h3>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
                    <div className="avatar" style={{ width: '24px', height: '24px', fontSize: '0.65rem' }}>
                      {assignee?.full_name.charAt(0) || '?'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: isOverdue ? '#ef4444' : 'var(--text-4)', fontSize: '0.7rem', fontWeight: 600 }}>
                      <Calendar size={12} />
                      {task.end_date ? formatDateTime(task.end_date) : 'No deadline'}
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div style={{ gridColumn: '1 / -1', padding: '4rem', textAlign: 'center', color: 'var(--text-4)' }}>
                <p>{searchTerm || activeCategory || activeAssigneeId ? 'No tasks match your selection criteria.' : 'No active tasks found in your workspace.'}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
