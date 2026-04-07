import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Bell, AlertTriangle, Clock, X } from 'lucide-react';

export const ReminderBell: React.FC = () => {
  const reminders = useStore(s => s.reminders);
  const dismissReminder = useStore(s => s.dismissReminder);
  const setViewMode = useStore(s => s.setViewMode);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'none',
          border: 'none',
          padding: '0.4rem',
          color: reminders.length > 0 ? 'var(--primary)' : 'var(--text-4)',
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          borderRadius: '50%'
        }}
        className="hover-surface"
      >
        <Bell size={20} fill={reminders.length > 0 ? "var(--primary)" : "none"} fillOpacity={0.1} />
        {reminders.length > 0 && (
          <span style={{
            position: 'absolute',
            top: '0',
            right: '0',
            width: '14px',
            height: '14px',
            background: 'var(--danger)',
            color: 'white',
            borderRadius: '50%',
            fontSize: '9px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--bg)'
          }}>
            {reminders.length}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div 
            onClick={() => setIsOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 100 }}
          />
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: '-10px',
            width: '320px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-xl)',
            zIndex: 101,
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-1)' }}>Reminders</span>
              {reminders.length > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600 }}>{reminders.length} active</span>}
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {reminders.length > 0 ? (
                reminders.map(r => (
                  <div key={r.id} style={{
                    padding: '0.875rem 1rem',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'flex-start',
                    background: r.type === 'urgent' ? 'rgba(239,68,68,0.03)' : 'transparent'
                  }}>
                    <div style={{
                      marginTop: '2px',
                      color: r.type === 'urgent' ? 'var(--danger)' : 'var(--primary)'
                    }}>
                      {r.type === 'urgent' ? <AlertTriangle size={15} /> : <Clock size={15} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-1)', lineHeight: 1.4, marginBottom: '0.2rem' }}>{r.message}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-4)' }}>{r.type === 'urgent' ? 'Due in less than 1 hour' : 'Due tomorrow'}</div>
                    </div>
                    <button 
                      onClick={() => dismissReminder(r.id)}
                      style={{ background: 'none', border: 'none', padding: '0.25rem', color: 'var(--text-4)', cursor: 'pointer' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              ) : (
                <div style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-4)' }}>
                   <Bell size={24} style={{ opacity: 0.1, marginBottom: '0.5rem' }} />
                   <p style={{ fontSize: '0.8rem' }}>No active reminders.</p>
                </div>
              )}
            </div>
            
            {reminders.length > 0 ? (
              <button 
                onClick={() => { setViewMode('reminders'); setIsOpen(false); }}
                style={{ 
                  width: '100%', padding: '0.875rem', textAlign: 'center', 
                  background: 'var(--surface-2)', border: 'none',
                  borderTop: '1px solid var(--border)', cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)',
                  transition: 'background 0.2s ease'
                }}
                className="hover-surface"
              >
                View All Reminders
              </button>
            ) : (
              <div style={{ padding: '0.75rem', textAlign: 'center', background: 'var(--surface-2)' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-4)' }}>These are based on upcoming task deadlines.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
