import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger'
}) => {
  if (!isOpen) return null;

  const color = type === 'danger' ? 'var(--danger)' : type === 'warning' ? '#f59e0b' : 'var(--primary)';
  const bgColor = type === 'danger' ? 'rgba(239, 68, 68, 0.1)' : type === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(99, 102, 241, 0.1)';

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div 
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-xl)',
          padding: '2rem',
          maxWidth: '420px',
          width: '90%',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--border)',
          animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          position: 'relative'
        }}
      >
        <button 
          onClick={onClose}
          style={{
            position: 'absolute', top: '1.25rem', right: '1.25rem',
            padding: '0.4rem', borderRadius: 'var(--radius-md)',
            background: 'var(--surface-3)', border: '1px solid var(--border)',
            color: 'var(--text-4)', cursor: 'pointer'
          }}
        >
          <X size={16} />
        </button>

        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: 'var(--radius-lg)',
            background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, border: `1px solid ${color}20`
          }}>
            <AlertCircle size={24} color={color} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: '0.5rem' }}>{title}</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-3)', lineHeight: 1.6 }}>{message}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
          <button 
            onClick={onClose}
            style={{
              padding: '0.6rem 1.25rem', borderRadius: 'var(--radius-md)',
              background: 'var(--surface-3)', border: '1px solid var(--border)',
              color: 'var(--text-1)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
            }}
          >
            {cancelText}
          </button>
          <button 
            onClick={() => {
              onConfirm();
              onClose();
            }}
            style={{
              padding: '0.6rem 1.25rem', borderRadius: 'var(--radius-md)',
              background: color, border: 'none',
              color: 'white', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
              boxShadow: `0 4px 12px ${color}30`
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};
