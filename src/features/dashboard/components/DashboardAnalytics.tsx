import React, { useMemo } from 'react';
import { useStore } from '../../../store/useStore';
import { BarChart, Activity, Users, Zap, LayoutDashboard, Target, ShieldCheck, ChevronDown, ChevronUp, Mail, Download } from 'lucide-react';
import { getTaskAssigneeIds, isTaskAssignee } from '../../../lib/supabase';
import { downloadEmployeeSummary } from '../../../lib/exportExcel';
import EmployeeScoreModal from './EmployeeScoreModal';
import ScheduleReportModal from './ScheduleReportModal';

export const DashboardAnalytics: React.FC<{ onOpenCreateModal: () => void }> = ({ onOpenCreateModal }) => {
  const [expandedRole, setExpandedRole] = React.useState<'Admin' | 'Worker' | null>(null);
  const [showAllTeamDirectory, setShowAllTeamDirectory] = React.useState(false);
  const tasks = useStore(s => s.tasks);
  const profiles = useStore(s => s.profiles);
  const currentUser = useStore(s => s.currentUser);
  const statuses = useStore(s => s.statuses);
  const categories = useStore(s => s.categories);
  const setViewMode = useStore(s => s.setViewMode);
  const setDashboardTaskFilters = useStore(s => s.setDashboardTaskFilters);
  const setAdminSettingsTab = useStore(s => s.setAdminSettingsTab);

  const getDashboardTasks = useStore(s => s.getDashboardTasks);
  const visibleTasks = useMemo(() => getDashboardTasks(), [getDashboardTasks, tasks]);

  const stats = useMemo(() => {
    const total = visibleTasks.length;
    
    // We assume the last status is "Done" or "Completed", or we just take tasks that have the last status.
    // If no explicit "Done" status, we just count them by grouping.
    const byStatus = statuses.map(s => ({
      ...s,
      count: visibleTasks.filter((t: any) => t.status === s.name).length
    }));
    
    // Catch orphaned tasks
    const unmappedTasks = visibleTasks.filter((t: any) => !statuses.find(s => s.name === t.status)).length;
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
      count: visibleTasks.filter((t: any) => t.category === c.name).length
    }));
    
    const unmappedCat = visibleTasks.filter((t: any) => t.category && !categories.find(c => c.name === t.category)).length;
    if (unmappedCat > 0) {
      byCategory.push({
        id: 'unmapped-cat',
        name: 'Unmapped',
        color: '#ff4444',
        sort_order: 999,
        count: unmappedCat
      });
    }
    
    const myTasks = visibleTasks.filter(task => isTaskAssignee(task, currentUser?.id)).length;

    const byRole = {
      Admin: profiles.filter(p => p.role === 'Admin').length,
      Worker: profiles.filter(p => p.role === 'Worker').length
    };

    const selfTasks = visibleTasks.filter((t: any) => t.is_self_task).length;

    return { total, byStatus, byCategory, myTasks, totalUsers: profiles.length, byRole, selfTasks };
  }, [visibleTasks, statuses, categories, currentUser]);

  const [selectedProfile, setSelectedProfile] = React.useState<any | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = React.useState(false);
  const teamDirectoryProfiles = showAllTeamDirectory ? profiles : profiles.slice(0, 6);

  const openEmployeeModal = (p: any) => {
    setSelectedProfile(p);
    setModalOpen(true);
  };

  if (!currentUser) return null;

  const openTaskBoard = (filters: { status?: string; category?: string; assignee?: string } = {}) => {
    setDashboardTaskFilters({ selfTasks: 'hide', ...filters });
    setViewMode('kanban');
  };

  const openSettings = (tab: 'users' | 'categories' | 'statuses') => {
    setAdminSettingsTab(tab);
    setViewMode('settings');
  };

  return (
    <div className="animate-fadeIn dashboard-page">
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {currentUser.role === 'Admin' && (
              <button className="primary-btn" onClick={() => setScheduleModalOpen(true)} style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>
                <Mail size={16} /> Email Report
              </button>
            )}
            <button className="primary-btn" onClick={() => downloadEmployeeSummary(visibleTasks as any, profiles, statuses)} style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>
              <Download size={16} /> Export Excel
            </button>
            <button className="primary-btn" onClick={onOpenCreateModal}>
              <Zap size={16} /> New Task
            </button>
          </div>
        </div>

        {/* Dynamic Welcome Message */}
        <button className="dashboard-welcome" onClick={() => setViewMode('profile')} style={{
          padding: '1rem 1.25rem', borderRadius: 'var(--radius-md)',
          background: currentUser.role === 'Admin' ? 'rgba(99, 102, 241, 0.08)' : 'rgba(52, 211, 153, 0.08)',
          border: `1px solid ${currentUser.role === 'Admin' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(52, 211, 153, 0.15)'}`,
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          width: '100%', cursor: 'pointer', textAlign: 'left'
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
        </button>
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
          onClick={() => openTaskBoard()}
        />
        <MetricCard 
          icon={<Users size={20} color="#34d399" />} 
          title="My Tasks" 
          value={stats.myTasks} 
          bg="rgba(52,211,153,0.1)"
          onClick={() => openTaskBoard({ assignee: currentUser.id })}
        />
        <MetricCard 
          icon={<Activity size={20} color="#fbbf24" />} 
          title="Categories In Use" 
          value={categories.filter(c => stats.byCategory.find(bc => bc.name === c.name && bc.count > 0)).length} 
          bg="rgba(251,191,36,0.1)"
          onClick={() => currentUser.role === 'Admin' ? openSettings('categories') : openTaskBoard()}
        />
        {currentUser.role === 'Admin' && (
          <MetricCard 
            icon={<ShieldCheck size={20} color="#c084fc" />} 
            title="Total Users" 
            value={stats.totalUsers} 
            bg="rgba(192,132,252,0.1)"
            onClick={() => openSettings('users')}
          />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        
        {/* Status Breakdown */}
        <div className="dashboard-panel" style={{ 
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
                <button
                  className="dashboard-progress-row"
                  key={s.id}
                  onClick={() => openTaskBoard(s.name === 'Unmapped' ? {} : { status: s.name })}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-2)' }}>{s.name}</span>
                    <span style={{ color: 'var(--text-4)', fontWeight: 600 }}>{s.count} ({percentage}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--surface-3)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                    <div style={{ width: `${percentage}%`, height: '100%', background: s.color || 'var(--primary)', transition: 'width 1s ease-out' }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Categories Breakdown */}
        <div className="dashboard-panel" style={{ 
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
                <button className="dashboard-category-card" key={c.id} onClick={() => openTaskBoard({ category: c.name })} style={{ 
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  background: 'var(--surface-2)', padding: '0.75rem 1rem', 
                  borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
                  flex: '1 1 calc(50% - 0.75rem)', cursor: 'pointer', textAlign: 'left'
                }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: c.color || 'var(--primary)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }}>{c.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-4)' }}>{c.count} tasks</div>
                  </div>
                </button>
              );
            })}
            {stats.byCategory.every(c => c.count === 0) && (
              <button
                onClick={() => currentUser.role === 'Admin' ? openSettings('categories') : openTaskBoard()}
                style={{
                  color: 'var(--text-4)',
                  fontSize: '0.85rem',
                  fontStyle: 'italic',
                  padding: '1rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                No category data available yet.
              </button>
            )}
          </div>
        </div>

        {/* Admin-only Team Analytics */}
        {currentUser.role === 'Admin' && (
          <div className="dashboard-panel" style={{ 
            background: 'var(--surface)', borderRadius: 'var(--radius-xl)', 
            padding: '1.5rem', border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div className="team-directory-header">
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-1)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={16} /> Team Directory
              </h2>
              {profiles.length > 6 && (
                <button
                  type="button"
                  className="team-directory-see-all"
                  onClick={() => setShowAllTeamDirectory(value => !value)}
                >
                  {showAllTeamDirectory ? 'Show less' : `See all ${profiles.length}`}
                </button>
              )}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Employee Score Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {teamDirectoryProfiles.map(p => {
                  // compute assigned tasks and completion percent
                  const assigned = visibleTasks.filter((t: any) => getTaskAssigneeIds(t).includes(p.id));
                  const maxSort = statuses.length > 0 ? Math.max(...statuses.map(s => s.sort_order || 0)) : 0;
                  const completed = assigned.filter((t: any) => {
                    const st = statuses.find(s => s.name === t.status);
                    return !!st && (st.sort_order || 0) === maxSort;
                  }).length;
                  const pct = assigned.length > 0 ? Math.round((completed / assigned.length) * 100) : 0;

                  return (
                    <button key={p.id} onClick={() => openEmployeeModal(p)} className="employee-score-card" style={{
                      background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '0.6rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.35rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div className="avatar" style={{ width: '28px', height: '28px', borderRadius: '999px', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{p.full_name.charAt(0).toUpperCase()}</div>
                        <div className="employee-meta" style={{ flex: 1, minWidth: 0 }}>
                          <div className="employee-name" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-1)' }}>{p.full_name}</div>
                          <div className="employee-tasks" style={{ fontSize: '0.75rem', color: 'var(--text-4)' }}>{assigned.length} tasks</div>
                        </div>
                        <div className="employee-pct" style={{ fontWeight: 800, flexShrink: 0, marginLeft: '0.4rem' }}>{pct}%</div>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'var(--surface-3)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div className="progress-fill" style={{ width: `${pct}%`, transition: 'width 0.6s ease' }} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Admins Group */}
              <div className="dashboard-role-group" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
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
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openTaskBoard({ assignee: p.id })}
                        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && openTaskBoard({ assignee: p.id })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.5rem 0.75rem',
                          borderBottom: '1px solid var(--border-subtle)',
                          borderTop: 'none',
                          borderLeft: 'none',
                          borderRight: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left'
                        }}
                      >
                        <div className="avatar" style={{ width: '24px', height: '24px', fontSize: '0.6rem' }}>{p.full_name.charAt(0).toUpperCase()}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }}>{p.full_name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-4)' }}>{p.email}</div>
                        </div>
                        {p.email && (
                          <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()} title={`Email ${p.full_name}`} style={{ color: 'var(--text-4)', opacity: 0.5 }}>
                            <Mail size={12} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Workers Group */}
              <div className="dashboard-role-group" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
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
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openTaskBoard({ assignee: p.id })}
                        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && openTaskBoard({ assignee: p.id })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.5rem 0.75rem',
                          borderBottom: '1px solid var(--border-subtle)',
                          borderTop: 'none',
                          borderLeft: 'none',
                          borderRight: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left'
                        }}
                      >
                        <div className="avatar" style={{ width: '24px', height: '24px', fontSize: '0.6rem' }}>{p.full_name.charAt(0).toUpperCase()}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }}>{p.full_name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-4)' }}>{p.email}</div>
                        </div>
                        {p.email && (
                          <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()} title={`Email ${p.full_name}`} style={{ color: 'var(--text-4)', opacity: 0.5 }}>
                            <Mail size={12} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <EmployeeScoreModal open={modalOpen} onClose={() => setModalOpen(false)} profile={selectedProfile} />
      <ScheduleReportModal open={scheduleModalOpen} onClose={() => setScheduleModalOpen(false)} />
    </div>
  );
};

const MetricCard = ({
  icon,
  title,
  value,
  bg,
  onClick
}: {
  icon: React.ReactNode,
  title: string,
  value: number,
  bg: string,
  onClick: () => void
}) => (
  <button className="metric-card" onClick={onClick} style={{ 
    background: 'var(--surface)', padding: '1.5rem', borderRadius: 'var(--radius-xl)',
    border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
    display: 'flex', alignItems: 'center', gap: '1.25rem',
    cursor: 'pointer', textAlign: 'left', width: '100%'
  }}>
    <div className="metric-card-icon" style={{ 
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
  </button>
);
