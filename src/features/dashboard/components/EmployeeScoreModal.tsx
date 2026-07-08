import React from 'react';
import { getTaskAssigneeIds } from '../../../lib/supabase';
import { useStore } from '../../../store/useStore';
import { formatDateTime } from '../../../lib/format';

export const EmployeeScoreModal: React.FC<{
  open: boolean;
  onClose: () => void;
  profile: any | null;
}> = ({ open, onClose, profile }) => {
  const tasks = useStore(s => s.tasks);
  const statuses = useStore(s => s.statuses);

  if (!open || !profile) return null;

  const assigned = tasks.filter(t => getTaskAssigneeIds(t).includes(profile.id));
  const maxSort = statuses.length > 0 ? Math.max(...statuses.map(s => s.sort_order || 0)) : 0;

  const isCompleted = (task: any) => {
    const st = statuses.find(s => s.name === task.status);
    return !!st && (st.sort_order || 0) === maxSort;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div style={{ width: '720px', maxWidth: '95%', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '1rem', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>{profile.full_name} — Tasks</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="primary-btn" onClick={onClose} style={{ padding: '0.4rem 0.6rem' }}>Close</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '999px', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{profile.full_name.charAt(0).toUpperCase()}</div>
          <div>
            <div style={{ fontWeight: 700 }}>{profile.full_name}</div>
            <div style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>{profile.email}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
              {assigned.length} tasks
            </div>
            <div style={{ color: 'var(--text-4)', fontSize: '0.75rem' }}>{assigned.filter(isCompleted).length} completed</div>
          </div>
        </div>

        <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
          {assigned.length === 0 && (
            <div style={{ padding: '1rem', color: 'var(--text-4)' }}>No tasks assigned.</div>
          )}

          {assigned.map((t: any) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isCompleted(t) ? 'var(--primary)' : 'var(--surface-3)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{t.title || t.name || 'Untitled task'}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-4)' }}>{t.status || 'No status'}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '0.75rem', color: t.end_date && new Date(t.end_date) < new Date() && !isCompleted(t) ? 'var(--danger, #e53e3e)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                  {t.end_date ? formatDateTime(t.end_date) : 'No deadline'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-4)' }}>{isCompleted(t) ? 'Completed' : 'Incomplete'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EmployeeScoreModal;
