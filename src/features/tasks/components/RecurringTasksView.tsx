import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Lock, Repeat, Search, ShieldCheck, User as UserIcon } from 'lucide-react';
import { AppDateTimePicker } from '../../../components/Shared/AppDateTimePicker';
import { AppSelect } from '../../../components/Shared/AppSelect';
import { formatDateTime, formatTime12Hour } from '../../../lib/format';
import { computeNextRecurrence } from '../../../lib/recurrence';
import {
  getTaskAssigneeIds,
  isTaskAssignee,
  type RecurrenceType,
  type Task
} from '../../../lib/supabase';
import { useStore } from '../../../store/useStore';

const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getVisibleTask = (task: Task, currentUserId: string, role: string) => {
  if (task.is_self_task) return task.creator_id === currentUserId;
  if (role === 'Admin') return true;
  return isTaskAssignee(task, currentUserId) ||
    task.creator_id === currentUserId ||
    task.observers?.includes(currentUserId);
};

const getScheduleLabel = (task: Task) => {
  const time = formatTime12Hour(task.recurrence_time || '09:00');
  const type = task.recurrence_type as RecurrenceType | undefined;

  if (type === 'daily') return `Daily at ${time}`;
  if (type === 'weekly') return `Every ${daysOfWeek[task.recurrence_day || 0]} at ${time}`;
  if (type === 'monthly') return `Day ${task.recurrence_day || 1} of each month at ${time}`;
  return 'Schedule not set';
};

const getLatestOccurrence = (occurrences: Task[]) => (
  [...occurrences].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
);

const getEditableDay = (type: RecurrenceType, currentDay?: number | null) => {
  if (type === 'daily') return null;
  if (type === 'weekly') return currentDay ?? 1;
  return Math.min(Math.max(currentDay || 1, 1), 31);
};

export const RecurringTasksView: React.FC<{ onSelectTask: (id: string | null) => void }> = ({ onSelectTask }) => {
  const currentUser = useStore(s => s.currentUser);
  const tasks = useStore(s => s.tasks);
  const profiles = useStore(s => s.profiles);
  const statuses = useStore(s => s.statuses);
  const categories = useStore(s => s.categories);
  const updateTask = useStore(s => s.updateTask);
  const setAlertData = useStore(s => s.setAlertData);

  const [searchQuery, setSearchQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'team' | 'private'>('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [frequencyFilter, setFrequencyFilter] = useState<'all' | RecurrenceType>('all');
  const [timingFilter, setTimingFilter] = useState<'all' | 'due-soon' | 'overdue'>('all');

  const doneStatus = statuses.find(s => s.name.toLowerCase() === 'done')?.name || 'Done';

  const recurringRows = useMemo(() => {
    if (!currentUser) return [];

    return tasks
      .filter(task => (
        task.is_recurring &&
        !task.parent_task_id &&
        getVisibleTask(task, currentUser.id, currentUser.role)
      ))
      .map(template => {
        const occurrences = tasks.filter(task => task.parent_task_id === template.id);
        const completedCount = occurrences.filter(task => task.status === doneStatus).length;
        const latestOccurrence = getLatestOccurrence(occurrences);
        const progress = occurrences.length > 0
          ? Math.round((completedCount / occurrences.length) * 100)
          : 0;

        return {
          template,
          occurrences,
          completedCount,
          latestOccurrence,
          progress
        };
      })
      .filter(row => {
        const query = searchQuery.trim().toLowerCase();
        const matchesSearch = !query ||
          row.template.title.toLowerCase().includes(query) ||
          row.template.description?.toLowerCase().includes(query) ||
          row.template.category?.toLowerCase().includes(query);
        const matchesScope = scope === 'all' ||
          (scope === 'private' ? row.template.is_self_task : !row.template.is_self_task);
        const matchesPerson = personFilter === 'all' ||
          isTaskAssignee(row.template, personFilter) ||
          row.template.creator_id === personFilter ||
          row.template.observers?.includes(personFilter);
        const matchesCategory = categoryFilter === 'all' ||
          (categoryFilter === 'none' ? !row.template.category : row.template.category === categoryFilter);
        const matchesFrequency = frequencyFilter === 'all' || row.template.recurrence_type === frequencyFilter;
        const nextRun = new Date(row.template.next_recurrence_at || '');
        const isValidNextRun = !Number.isNaN(nextRun.getTime());
        const matchesTiming = timingFilter === 'all' ||
          (timingFilter === 'due-soon' && isValidNextRun && nextRun.getTime() <= Date.now() + (24 * 60 * 60 * 1000)) ||
          (timingFilter === 'overdue' && isValidNextRun && nextRun.getTime() <= Date.now());

        return matchesSearch && matchesScope && matchesPerson && matchesCategory && matchesFrequency && matchesTiming;
      })
      .sort((a, b) => (
        new Date(a.template.next_recurrence_at || 0).getTime() -
        new Date(b.template.next_recurrence_at || 0).getTime()
      ));
  }, [currentUser, tasks, doneStatus, searchQuery, scope, personFilter, categoryFilter, frequencyFilter, timingFilter]);

  if (!currentUser) return null;

  if (currentUser.role !== 'Admin') {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-4)' }}>
        <ShieldCheck size={48} style={{ marginBottom: '1rem', opacity: 0.18 }} />
        <p>Recurring task administration is available to admins only.</p>
      </div>
    );
  }

  const canEditSchedule = (task: Task) => {
    if (task.is_self_task) return task.creator_id === currentUser.id;
    return currentUser.role === 'Admin' ||
      task.creator_id === currentUser.id ||
      isTaskAssignee(task, currentUser.id);
  };

  const updateRecurringSchedule = async (
    task: Task,
    updates: { type?: RecurrenceType; time?: string; day?: number | null }
  ) => {
    const recurrenceType = updates.type || task.recurrence_type || 'daily';
    const recurrenceTime = updates.time || task.recurrence_time || '09:00';
    const recurrenceDay = updates.day !== undefined
      ? updates.day
      : getEditableDay(recurrenceType, task.recurrence_day);

    await updateTask(task.id, {
      recurrence_type: recurrenceType,
      recurrence_time: recurrenceTime,
      recurrence_day: recurrenceType === 'daily' ? null : recurrenceDay,
      next_recurrence_at: computeNextRecurrence(
        recurrenceType,
        recurrenceTime,
        recurrenceType === 'daily' ? null : recurrenceDay
      )
    });

    setAlertData({ message: 'Recurring schedule updated.', type: 'success' });
  };

  const nextDueCount = recurringRows.filter(row => {
    const next = new Date(row.template.next_recurrence_at || '');
    return !Number.isNaN(next.getTime()) && next.getTime() <= Date.now() + (24 * 60 * 60 * 1000);
  }).length;

  return (
    <div className="animate-fadeIn">
      <header style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: 'var(--radius-md)',
              background: 'rgba(52, 211, 153, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Repeat size={18} style={{ color: '#34d399' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1)' }}>Recurring Tasks</h1>
              <p style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>Schedules, generated work, and completion progress.</p>
            </div>
          </div>
        </div>
      </header>

      <div className="recurring-filter-bar" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <SummaryTile icon={<Repeat size={18} color="#34d399" />} label="Active Schedules" value={recurringRows.length} />
        <SummaryTile icon={<CalendarClock size={18} color="#818cf8" />} label="Due Soon" value={nextDueCount} />
        <SummaryTile
          icon={<CheckCircle2 size={18} color="#fbbf24" />}
          label="Generated Tasks"
          value={recurringRows.reduce((sum, row) => sum + row.occurrences.length, 0)}
        />
      </div>

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
            placeholder="Search recurring tasks..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.6rem 1rem 0.6rem 2.5rem',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)',
              background: 'var(--surface)',
              fontSize: '0.85rem',
              color: 'var(--text-1)'
            }}
          />
        </div>
        <div className="filter-select-group">
          <Lock size={13} style={{ opacity: 0.4 }} />
          <AppSelect
            value={scope}
            onChange={value => setScope(value as 'all' | 'team' | 'private')}
            options={[
              { value: 'all', label: 'All Recurring' },
              { value: 'team', label: 'Team Tasks' },
              { value: 'private', label: 'Private Tasks' }
            ]}
            compact
            searchable
            searchPlaceholder="Search scope..."
          />
        </div>
        <div className="filter-select-group">
          <UserIcon size={13} style={{ opacity: 0.4 }} />
          <AppSelect
            value={personFilter}
            onChange={setPersonFilter}
            options={[
              { value: 'all', label: 'All People' },
              ...profiles.map(profile => ({ value: profile.id, label: profile.full_name }))
            ]}
            compact
            searchable
            searchPlaceholder="Search people..."
          />
        </div>
        <div className="filter-select-group">
          <CalendarClock size={13} style={{ opacity: 0.4 }} />
          <AppSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: 'all', label: 'All Categories' },
              { value: 'none', label: 'No Category' },
              ...categories.map(category => ({
                value: category.name,
                label: category.name,
                color: category.color
              }))
            ]}
            compact
            searchable
            searchPlaceholder="Search categories..."
          />
        </div>
        <div className="filter-select-group">
          <Repeat size={13} style={{ opacity: 0.4 }} />
          <AppSelect
            value={frequencyFilter}
            onChange={value => setFrequencyFilter(value as 'all' | RecurrenceType)}
            options={[
              { value: 'all', label: 'All Frequencies' },
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' }
            ]}
            compact
            searchable
            searchPlaceholder="Search frequencies..."
          />
        </div>
        <div className="filter-select-group">
          <Clock size={13} style={{ opacity: 0.4 }} />
          <AppSelect
            value={timingFilter}
            onChange={value => setTimingFilter(value as 'all' | 'due-soon' | 'overdue')}
            options={[
              { value: 'all', label: 'All Timing' },
              { value: 'due-soon', label: 'Due in 24h' },
              { value: 'overdue', label: 'Due Now' }
            ]}
            compact
            searchable
            searchPlaceholder="Search timing..."
          />
        </div>
        {(searchQuery || scope !== 'all' || personFilter !== 'all' || categoryFilter !== 'all' || frequencyFilter !== 'all' || timingFilter !== 'all') && (
          <button
            className="recurring-clear-filters"
            onClick={() => {
              setSearchQuery('');
              setScope('all');
              setPersonFilter('all');
              setCategoryFilter('all');
              setFrequencyFilter('all');
              setTimingFilter('all');
            }}
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(248,113,113,0.1)',
              color: '#f87171',
              fontSize: '0.75rem',
              fontWeight: 700,
              border: '1px solid rgba(248,113,113,0.18)',
              cursor: 'pointer'
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {recurringRows.map(row => {
          const template = row.template;
          const assignees = profiles.filter(profile => getTaskAssigneeIds(template).includes(profile.id));
          const creator = profiles.find(p => p.id === template.creator_id);
          const statusColor = statuses.find(s => s.name === (row.latestOccurrence?.status || template.status))?.color || '#34d399';
          const categoryColor = categories.find(c => c.name === template.category)?.color || '#64748b';
          const isDueSoon = template.next_recurrence_at &&
            new Date(template.next_recurrence_at).getTime() <= Date.now() + (24 * 60 * 60 * 1000);

          return (
            <div
              key={template.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectTask(template.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') onSelectTask(template.id);
              }}
              style={{
                background: 'var(--surface)',
                borderRadius: 'var(--radius-xl)',
                border: `1px solid ${isDueSoon ? 'rgba(52, 211, 153, 0.35)' : 'var(--border)'}`,
                boxShadow: 'var(--shadow-sm)',
                padding: '1rem',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              className={`recurring-task-row ${template.priority === 'High' ? 'high-priority-row' : ''}`}
            >
              <div className="recurring-task-main">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {template.priority === 'High' && (
                    <span className="high-priority-alert">
                      <AlertTriangle size={12} />
                      High priority
                    </span>
                  )}
                  {template.category && (
                    <span style={{
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      color: categoryColor,
                      background: `${categoryColor}12`,
                      padding: '0.2rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      textTransform: 'uppercase',
                      border: `1px solid ${categoryColor}18`
                    }}>
                      {template.category}
                    </span>
                  )}
                  {template.is_self_task && <Lock size={12} style={{ color: 'var(--primary)' }} />}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: '0.35rem' }}>
                  {template.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.76rem', color: 'var(--text-4)' }}>
                  <UserIcon size={13} />
                  <span>
                    {template.is_self_task
                      ? creator?.full_name || 'Private'
                      : assignees.map(assignee => assignee.full_name).join(', ') || 'Unassigned'}
                  </span>
                </div>
              </div>

              <div className="recurring-task-schedule">
                {canEditSchedule(template) ? (
                  <div
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => e.stopPropagation()}
                    style={{
                      display: 'grid',
                      gap: '0.55rem',
                      marginBottom: '0.7rem',
                      padding: '0.75rem',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-lg)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#34d399', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>
                      <Clock size={13} />
                      Schedule
                    </div>
                    <div className="recurring-schedule-controls">
                      <AppSelect
                        value={template.recurrence_type || 'daily'}
                        onChange={value => updateRecurringSchedule(template, {
                          type: value as RecurrenceType,
                          day: getEditableDay(value as RecurrenceType, template.recurrence_day)
                        })}
                        options={[
                          { value: 'daily', label: 'Daily' },
                          { value: 'weekly', label: 'Weekly' },
                          { value: 'monthly', label: 'Monthly' }
                        ]}
                        compact
                      />
                      <AppDateTimePicker
                        value={template.recurrence_time || '09:00'}
                        onChange={value => updateRecurringSchedule(template, { time: value })}
                        includeDate={false}
                        includeTime
                        placeholder="Select time"
                        compact
                      />
                    </div>

                    {template.recurrence_type === 'weekly' && (
                      <AppSelect
                        value={String(template.recurrence_day ?? 1)}
                        onChange={value => updateRecurringSchedule(template, { day: Number(value) })}
                        options={daysOfWeek.map((day, index) => ({ value: String(index), label: day }))}
                        compact
                      />
                    )}

                    {template.recurrence_type === 'monthly' && (
                      <AppSelect
                        value={String(template.recurrence_day || 1)}
                        onChange={value => updateRecurringSchedule(template, { day: Number(value) })}
                        options={Array.from({ length: 31 }, (_, index) => {
                          const day = index + 1;
                          return { value: String(day), label: `Day ${day}` };
                        })}
                        compact
                      />
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.55rem' }}>
                    <Clock size={14} />
                    {getScheduleLabel(template)}
                  </div>
                )}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-4)', marginBottom: '0.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  Next Run
                </div>
                <div style={{ fontSize: '0.88rem', color: isDueSoon ? '#34d399' : 'var(--text-2)', fontWeight: 700 }}>
                  {formatDateTime(template.next_recurrence_at || undefined)}
                </div>
              </div>

              <div className="recurring-task-progress">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-4)', fontWeight: 700, textTransform: 'uppercase' }}>Progress</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-2)', fontWeight: 800 }}>{row.progress}%</span>
                </div>
                <div style={{ width: '100%', height: '8px', borderRadius: 'var(--radius-full)', background: 'var(--surface-3)', overflow: 'hidden', marginBottom: '0.65rem' }}>
                  <div style={{ width: `${row.progress}%`, height: '100%', background: statusColor }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.74rem', color: 'var(--text-4)' }}>
                  <span>{row.completedCount}/{row.occurrences.length} done</span>
                  <span>{row.latestOccurrence ? `Latest: ${row.latestOccurrence.status}` : 'No runs yet'}</span>
                </div>
              </div>
            </div>
          );
        })}

        {recurringRows.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '5rem 2rem',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-xl)',
            border: '1px dashed var(--border-strong)'
          }}>
            <Repeat size={34} style={{ color: 'var(--text-4)', opacity: 0.35, marginBottom: '1rem' }} />
            <h2 style={{ fontSize: '1.1rem', color: 'var(--text-1)', marginBottom: '0.4rem' }}>No recurring tasks found</h2>
            <p style={{ color: 'var(--text-4)', fontSize: '0.86rem' }}>Create a task and turn on Recurring Task to see it here.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const SummaryTile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div style={{
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.8rem'
  }}>
    <div style={{
      width: '38px',
      height: '38px',
      borderRadius: 'var(--radius-full)',
      background: 'var(--surface-3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-4)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
    </div>
  </div>
);
