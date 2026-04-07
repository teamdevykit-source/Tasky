import React from 'react';
import { useStore } from '../../../store/useStore';
import { Bell, AlertTriangle, Clock, Calendar, ChevronRight, CheckCircle2 } from 'lucide-react';
import { formatDateTime } from '../../../lib/format';

export const RemindersView: React.FC<{ onSelectTask: (id: string) => void }> = ({ onSelectTask }) => {
  const reminders = useStore(s => s.reminders);
  const tasks = useStore(s => s.tasks);
  const profiles = useStore(s => s.profiles);
  const currentUser = useStore(s => s.currentUser);
  const dismissReminder = useStore(s => s.dismissReminder);

  if (!currentUser) return null;

  const urgentReminders = reminders.filter(r => r.type === 'urgent');
  const upcomingReminders = reminders.filter(r => r.type === 'warning');

  return (
    <div className="animate-fadeIn">
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ 
            width: '40px', height: '40px', borderRadius: '12px', 
            background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' 
          }}>
            <Bell size={20} style={{ color: 'var(--primary)' }} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-1)' }}>Upcoming Priority Notifications</h1>
        </div>
        <p style={{ color: 'var(--text-4)', fontSize: '0.9rem' }}>
          Manage your task alerts and stay on top of critical project deadlines.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        
        {/* Urgent Alerts Section */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', padding: '0 0.5rem' }}>
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-1)' }}>Urgent Alerts</h2>
            <span className="badge" style={{ background: 'var(--danger)', color: 'white', border: 'none' }}>{urgentReminders.length}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {urgentReminders.length > 0 ? urgentReminders.map(r => {
              const task = tasks.find(t => t.id === r.taskId);
              if (!task) return null;
              const assignee = profiles.find(p => p.id === task.assignee_id);

              return (
                <div 
                  key={r.id} 
                  className="task-card"
                  style={{ 
                    border: '1px solid rgba(239, 68, 68, 0.2)', 
                    background: 'rgba(239, 68, 68, 0.05)',
                    padding: '1.25rem'
                  }}
                  onClick={() => onSelectTask(task.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--danger)', marginBottom: '0.5rem' }}>
                        Due in less than 1 hour!
                      </h3>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '1rem' }}>{task.title}</div>
                      
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-4)' }}>
                          <Clock size={14} /> 
                          <span style={{ fontWeight: 600, color: 'var(--danger)' }}>{formatDateTime(task.end_date)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-4)' }}>
                          <Calendar size={14} /> 
                          <span>{task.category || 'No Category'}</span>
                        </div>
                      </div>
                    </div>

                    <button 
                      className="close-btn" 
                      onClick={(e) => { e.stopPropagation(); dismissReminder(r.id); }}
                      style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}
                    >
                      <CheckCircle2 size={16} />
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(239, 68, 68, 0.1)' }}>
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
            }) : (
              <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--surface-2)', borderRadius: 'var(--radius-xl)', color: 'var(--text-4)' }}>
                <Clock size={32} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                <p>No urgent deadlines at the moment.</p>
              </div>
            )}
          </div>
        </section>

        {/* Upcoming Section */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', padding: '0 0.5rem' }}>
            <Calendar size={18} style={{ color: 'var(--primary)' }} />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-1)' }}>Upcoming Tomorrow</h2>
            <span className="badge">{upcomingReminders.length}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {upcomingReminders.length > 0 ? upcomingReminders.map(r => {
              const task = tasks.find(t => t.id === r.taskId);
              if (!task) return null;
              const assignee = profiles.find(p => p.id === task.assignee_id);

              return (
                <div 
                  key={r.id} 
                  className="task-card"
                  style={{ padding: '1.25rem' }}
                  onClick={() => onSelectTask(task.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '1rem' }}>{task.title}</div>
                      
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-4)' }}>
                          <Clock size={14} /> 
                          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{formatDateTime(task.end_date)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-4)' }}>
                          <Calendar size={14} /> 
                          <span>{task.category || 'No Category'}</span>
                        </div>
                      </div>
                    </div>

                    <button 
                      className="close-btn" 
                      onClick={(e) => { e.stopPropagation(); dismissReminder(r.id); }}
                    >
                      <CheckCircle2 size={16} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
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
            }) : (
              <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--surface-2)', borderRadius: 'var(--radius-xl)', color: 'var(--text-4)' }}>
                <Calendar size={32} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                <p>No deadlines for tomorrow.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
