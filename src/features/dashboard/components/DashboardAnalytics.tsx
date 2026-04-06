import React, { useMemo } from 'react';
import { useStore } from '../../../store/useStore';
import { BarChart, Activity, Clock, Users, Zap, LayoutDashboard, Target, ShieldCheck, ChevronDown, ChevronUp, Lock } from 'lucide-react';

export const DashboardAnalytics: React.FC = () => {
  const [expandedRole, setExpandedRole] = React.useState<'Admin' | 'Worker' | null>(null);
  const tasks = useStore(s => s.tasks);
  const profiles = useStore(s => s.profiles);
  const currentUser = useStore(s => s.currentUser);
  const statuses = useStore(s => s.statuses);
  const categories = useStore(s => s.categories);

  const visibleTasks = useMemo(() => {
    if (!currentUser) return [];
    return tasks.filter(t => {
      // If it's a self-task, ONLY the creator can see it, regardless of role.
      if (t.is_self_task) {
        return t.creator_id === currentUser.id;
      }
      
      if (currentUser.role === 'Admin') return true;
      return (t.assignee_id === currentUser.id) || 
             (t.creator_id === currentUser.id) || 
             (t.observers && t.observers.includes(currentUser.id));
    });
  }, [tasks, currentUser]);

  const stats = useMemo(() => {
    const total = visibleTasks.length;
    
    // We assume the last status is "Done" or "Completed", or we just take tasks that have the last status.
    // If no explicit "Done" status, we just count them by grouping.
    const byStatus = statuses.map(s => ({
      ...s,
      count: visibleTasks.filter(t => t.status === s.name).length
    }));
    
    // Catch orphaned tasks
    const unmappedTasks = visibleTasks.filter(t => !statuses.find(s => s.name === t.status)).length;
    if (unmappedTasks > 0) {
      byStatus.push({
        id: 'unmapped-status',
        name: 'Unmapped',
        color: '#ff4444',
        sort_order: 999,
        count: unmappedTasks
      });
    }
    
    const byCategory = categories.map(c => ({
      ...c,
      count: visibleTasks.filter(t => t.category === c.name).length
    }));
    
    const unmappedCat = visibleTasks.filter(t => t.category && !categories.find(c => c.name === t.category)).length;
    if (unmappedCat > 0) {
      byCategory.push({
        id: 'unmapped-cat',
        name: 'Unmapped',
        color: '#ff4444',
        sort_order: 999,
        count: unmappedCat
      });
    }
    
    const unassigned = visibleTasks.filter(t => !t.assignee_id).length;
    
    const myTasks = visibleTasks.filter(t => t.assignee_id === currentUser?.id).length;

    const byRole = {
      Admin: profiles.filter(p => p.role === 'Admin').length,
      Worker: profiles.filter(p => p.role === 'Worker').length
    };

    const selfTasks = visibleTasks.filter(t => t.is_self_task).length;

    return { total, byStatus, byCategory, unassigned, myTasks, totalUsers: profiles.length, byRole, selfTasks };
  }, [visibleTasks, statuses, categories, currentUser]);

  if (!currentUser) return null;

  return (
    <div className="animate-fadeIn">
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ 
            width: '36px', height: '36px', borderRadius: 'var(--radius-md)', 
            background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' 
          }}>
            <LayoutDashboard size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1)' }}>Analytics Dashboard</h1>
            <p style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>High-level overview of your workspace performance.</p>
          </div>
        </div>

        {/* Dynamic Welcome Message */}
        <div style={{
          padding: '1rem 1.25rem', borderRadius: 'var(--radius-md)',
          background: currentUser.role === 'Admin' ? 'rgba(99, 102, 241, 0.08)' : 'rgba(52, 211, 153, 0.08)',
          border: `1px solid ${currentUser.role === 'Admin' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(52, 211, 153, 0.15)'}`,
          display: 'flex', alignItems: 'center', gap: '0.75rem'
        }}>
          <div style={{ fontSize: '1.2rem' }}>👋</div>
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '0.1rem' }}>
              Welcome back, {currentUser.full_name}!
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
              {currentUser.role === 'Admin' 
                ? "You are logged in as the Administrator of this project. You have full access to all tasks and settings."
                : `You are involved as a ${currentUser.job_title || 'Worker'} in this project. You can view and manage tasks related to you.`}
            </p>
          </div>
        </div>
      </header>

      {/* Top Metrics Cards */}
      <div style={{ 
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1.5rem', marginBottom: '2rem' 
      }}>
        <MetricCard 
          icon={<Target size={20} color="#818cf8" />} 
          title="Total Tasks" 
          value={stats.total} 
          bg="rgba(129,140,248,0.1)"
        />
        <MetricCard 
          icon={<Users size={20} color="#34d399" />} 
          title="My Tasks" 
          value={stats.myTasks} 
          bg="rgba(52,211,153,0.1)"
        />
        <MetricCard 
          icon={<Activity size={20} color="#fbbf24" />} 
          title="Categories In Use" 
          value={categories.filter(c => stats.byCategory.find(bc => bc.name === c.name && bc.count > 0)).length} 
          bg="rgba(251,191,36,0.1)"
        />
        <MetricCard 
          icon={<Clock size={20} color="#f87171" />} 
          title="Unassigned" 
          value={stats.unassigned} 
          bg="rgba(248,113,113,0.1)"
        />
        <MetricCard 
          icon={<Lock size={20} color="#f472b6" />} 
          title="Self Tasks" 
          value={stats.selfTasks} 
          bg="rgba(244,114,182,0.1)"
        />
        {currentUser.role === 'Admin' && (
          <MetricCard 
            icon={<ShieldCheck size={20} color="#c084fc" />} 
            title="Total Users" 
            value={stats.totalUsers} 
            bg="rgba(192,132,252,0.1)"
          />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        
        {/* Status Breakdown */}
        <div style={{ 
          background: 'var(--surface)', borderRadius: 'var(--radius-xl)', 
          padding: '1.5rem', border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart size={16} /> Task Progress
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {stats.byStatus.map(s => {
              const percentage = stats.total > 0 ? Math.round((s.count / stats.total) * 100) : 0;
              return (
                <div key={s.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-2)' }}>{s.name}</span>
                    <span style={{ color: 'var(--text-4)', fontWeight: 600 }}>{s.count} ({percentage}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--surface-3)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                    <div style={{ width: `${percentage}%`, height: '100%', background: s.color || 'var(--primary)', transition: 'width 1s ease-out' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Categories Breakdown */}
        <div style={{ 
          background: 'var(--surface)', borderRadius: 'var(--radius-xl)', 
          padding: '1.5rem', border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Zap size={16} /> Category Distribution
          </h2>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {stats.byCategory.sort((a,b) => b.count - a.count).map(c => {
              if (c.count === 0) return null;
              return (
                <div key={c.id} style={{ 
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  background: 'var(--surface-2)', padding: '0.75rem 1rem', 
                  borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
                  flex: '1 1 calc(50% - 0.75rem)'
                }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: c.color || 'var(--primary)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }}>{c.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-4)' }}>{c.count} tasks</div>
                  </div>
                </div>
              );
            })}
            {stats.byCategory.every(c => c.count === 0) && (
              <div style={{ color: 'var(--text-4)', fontSize: '0.85rem', fontStyle: 'italic', padding: '1rem' }}>
                No category data available yet.
              </div>
            )}
          </div>
        </div>

        {/* Admin-only Team Analytics */}
        {currentUser.role === 'Admin' && (
          <div style={{ 
            background: 'var(--surface)', borderRadius: 'var(--radius-xl)', 
            padding: '1.5rem', border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={16} /> Team Directory
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Admins Group */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <button 
                  onClick={() => setExpandedRole(expandedRole === 'Admin' ? null : 'Admin')}
                  style={{ 
                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    padding: '0.875rem 1rem', background: 'var(--surface-2)', border: 'none', cursor: 'pointer' 
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <ShieldCheck size={14} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>Admins</span>
                    <span style={{ fontSize: '0.7rem', background: 'var(--primary-light)', color: 'var(--primary)', padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-full)' }}>{stats.byRole.Admin}</span>
                  </div>
                  {expandedRole === 'Admin' ? <ChevronUp size={14} color="var(--text-4)"/> : <ChevronDown size={14} color="var(--text-4)"/>}
                </button>
                
                {expandedRole === 'Admin' && (
                  <div style={{ background: 'var(--surface)', padding: '0.5rem', borderTop: '1px solid var(--border)' }}>
                    {profiles.filter(p => p.role === 'Admin').map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div className="avatar" style={{ width: '24px', height: '24px', fontSize: '0.6rem' }}>{p.full_name.charAt(0).toUpperCase()}</div>
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }}>{p.full_name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-4)' }}>{p.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Workers Group */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <button 
                  onClick={() => setExpandedRole(expandedRole === 'Worker' ? null : 'Worker')}
                  style={{ 
                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    padding: '0.875rem 1rem', background: 'var(--surface-2)', border: 'none', cursor: 'pointer' 
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Users size={14} style={{ color: '#34d399' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>Workers</span>
                    <span style={{ fontSize: '0.7rem', background: 'rgba(52,211,153,0.1)', color: '#34d399', padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-full)' }}>{stats.byRole.Worker}</span>
                  </div>
                  {expandedRole === 'Worker' ? <ChevronUp size={14} color="var(--text-4)"/> : <ChevronDown size={14} color="var(--text-4)"/>}
                </button>
                
                {expandedRole === 'Worker' && (
                  <div style={{ background: 'var(--surface)', padding: '0.5rem', borderTop: '1px solid var(--border)' }}>
                    {profiles.filter(p => p.role === 'Worker').map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div className="avatar" style={{ width: '24px', height: '24px', fontSize: '0.6rem' }}>{p.full_name.charAt(0).toUpperCase()}</div>
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }}>{p.full_name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-4)' }}>{p.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MetricCard = ({ icon, title, value, bg }: { icon: React.ReactNode, title: string, value: number, bg: string }) => (
  <div style={{ 
    background: 'var(--surface)', padding: '1.5rem', borderRadius: 'var(--radius-xl)',
    border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
    display: 'flex', alignItems: 'center', gap: '1.25rem'
  }}>
    <div style={{ 
      width: '48px', height: '48px', borderRadius: 'var(--radius-full)', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
        {title}
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  </div>
);
