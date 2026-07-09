import React, { useMemo, useState } from 'react';
import { Archive, Calendar, RotateCcw, Search, Trash2, UserRound } from 'lucide-react';
import { formatDateTime } from '../../../lib/format';
import { getTaskAssigneeIds } from '../../../lib/supabase';
import { useStore } from '../../../store/useStore';
import { ConfirmationModal } from '../../../components/Shared/ConfirmationModal';

export const ArchiveView: React.FC = () => {
  const archivedTasks = useStore(state => state.archivedTasks);
  const profiles = useStore(state => state.profiles);
  const restoreTask = useStore(state => state.restoreTask);
  const permanentlyDeleteTask = useStore(state => state.permanentlyDeleteTask);
  const [searchQuery, setSearchQuery] = useState('');
  const [restoringTaskId, setRestoringTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<{ id: string; title: string } | null>(null);

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return [...archivedTasks]
      .filter(task => (
        !query ||
        task.title.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        task.category?.toLowerCase().includes(query)
      ))
      .sort((a, b) => (
        new Date(b.deleted_at || 0).getTime() - new Date(a.deleted_at || 0).getTime()
      ));
  }, [archivedTasks, searchQuery]);

  const handleRestore = async (taskId: string) => {
    setRestoringTaskId(taskId);
    await restoreTask(taskId);
    setRestoringTaskId(null);
  };

  const handlePermanentDelete = async (taskId: string, taskTitle: string) => {
    setTaskToDelete({ id: taskId, title: taskTitle });
  };

  const confirmPermanentDelete = async () => {
    if (!taskToDelete) return;

    setDeletingTaskId(taskToDelete.id);
    await permanentlyDeleteTask(taskToDelete.id);
    setDeletingTaskId(null);
  };

  return (
    <div className="animate-fadeIn">
      <header style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.4rem' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: 'var(--radius-md)',
            background: 'var(--primary-light)', color: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Archive size={18} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1)' }}>Archive</h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-4)' }}>
              Restore deleted tasks to their previous place.
            </p>
          </div>
        </div>
      </header>

      <div style={{ position: 'relative', maxWidth: '420px', marginBottom: '1.25rem' }}>
        <Search
          size={15}
          style={{
            position: 'absolute', left: '0.9rem', top: '50%',
            transform: 'translateY(-50%)', color: 'var(--text-4)'
          }}
        />
        <input
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder="Search archived tasks..."
          style={{
            width: '100%', padding: '0.72rem 1rem 0.72rem 2.45rem',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)',
            background: 'var(--surface)', color: 'var(--text-1)', outline: 'none'
          }}
        />
      </div>

      {filteredTasks.length === 0 ? (
        <div style={{
          padding: '4rem 2rem', textAlign: 'center', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', color: 'var(--text-4)'
        }}>
          <Archive size={42} style={{ marginBottom: '0.8rem', opacity: 0.2 }} />
          <p style={{ fontWeight: 600, color: 'var(--text-3)' }}>
            {searchQuery ? 'No archived tasks match your search.' : 'The archive is empty.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {filteredTasks.map(task => {
            const assignees = profiles.filter(profile => getTaskAssigneeIds(task).includes(profile.id));
            const deletedBy = profiles.find(profile => profile.id === task.deleted_by);
            const isRestoring = restoringTaskId === task.id;
            const isDeleting = deletingTaskId === task.id;

            return (
              <div
                key={task.id}
                className={task.priority === 'High' ? 'high-priority-row' : ''}
                style={{
                  display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                  padding: '1rem 1.1rem', background: 'var(--surface)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-1)' }}>
                      {task.title}
                    </h3>
                    {task.priority === 'High' && <span className="high-priority-alert">High</span>}
                    {task.category && (
                      <span style={{
                        padding: '0.16rem 0.42rem', borderRadius: 'var(--radius-full)',
                        background: 'var(--surface-3)', color: 'var(--text-3)',
                        fontSize: '0.62rem', fontWeight: 700
                      }}>
                        {task.category}
                      </span>
                    )}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap',
                    marginTop: '0.55rem', color: 'var(--text-4)', fontSize: '0.7rem'
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Calendar size={12} />
                      Deleted {formatDateTime(task.deleted_at || undefined)}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <UserRound size={12} />
                      {assignees.length > 0
                        ? assignees.map(assignee => assignee.full_name).join(', ')
                        : 'Unassigned'}
                    </span>
                    {deletedBy && <span>Deleted by {deletedBy.full_name}</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleRestore(task.id)}
                    disabled={isRestoring || isDeleting}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                      padding: '0.62rem 0.9rem', borderRadius: 'var(--radius-md)',
                      background: 'var(--primary-light)', color: 'var(--primary)',
                      border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                      fontWeight: 700, fontSize: '0.76rem',
                      cursor: isRestoring || isDeleting ? 'wait' : 'pointer',
                      opacity: isRestoring || isDeleting ? 0.6 : 1
                    }}
                  >
                    <RotateCcw size={14} />
                    {isRestoring ? 'Restoring...' : 'Restore'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePermanentDelete(task.id, task.title)}
                    disabled={isRestoring || isDeleting}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                      padding: '0.62rem 0.9rem', borderRadius: 'var(--radius-md)',
                      background: 'rgba(248,113,113,0.12)', color: 'var(--danger)',
                      border: '1px solid rgba(248,113,113,0.24)',
                      fontWeight: 700, fontSize: '0.76rem',
                      cursor: isRestoring || isDeleting ? 'wait' : 'pointer',
                      opacity: isRestoring || isDeleting ? 0.6 : 1
                    }}
                  >
                    <Trash2 size={14} />
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmationModal
        isOpen={Boolean(taskToDelete)}
        onClose={() => setTaskToDelete(null)}
        onConfirm={confirmPermanentDelete}
        title="Permanently delete task"
        message={`"${taskToDelete?.title || 'This task'}" will be permanently removed. This cannot be undone.`}
        confirmText={deletingTaskId ? 'Deleting...' : 'Delete permanently'}
        type="danger"
      />
    </div>
  );
};
