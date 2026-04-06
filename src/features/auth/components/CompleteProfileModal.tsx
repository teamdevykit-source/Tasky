import React, { useState } from 'react';
import { useStore } from '../../../store/useStore';
import { User, Key, ShieldCheck, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

export const CompleteProfileModal: React.FC = () => {
  const currentUser = useStore(s => s.currentUser);
  const updateProfile = useStore(s => s.updateProfile);
  const updatePassword = useStore(s => s.updatePassword);
  
  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!currentUser) return null;

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      // 1. Update Name
      await updateProfile({ full_name: fullName });
      // 2. Set Password
      await updatePassword(password);
      
      // 3. Close the modal by clearing the URL and flag
      const url = new URL(window.location.href);
      url.searchParams.delete('type');
      url.searchParams.delete('email');
      window.history.replaceState({}, '', url);
      useStore.setState({ isInvitedSession: false });
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, 
      background: 'rgba(5, 8, 16, 0.95)', 
      backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
      padding: '1.5rem'
    }}>
      <div className="animate-fadeIn" style={{
        maxWidth: '480px', width: '100%',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-2xl)',
        border: '1px solid var(--border)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden', position: 'relative'
      }}>
        {/* Decorative backdrop */}
        <div style={{
          position: 'absolute', top: '-10%', left: '-10%', width: '120%', height: '100%',
          background: 'radial-gradient(circle at 0px 0px, var(--primary-dark), transparent 50%)',
          opacity: 0.05, pointerEvents: 'none'
        }} />

        <div style={{ padding: '3rem 2.5rem', position: 'relative' }}>
          <div style={{ 
            width: '56px', height: '56px', background: 'var(--primary-light)', 
            borderRadius: 'var(--radius-xl)', display: 'flex', alignItems: 'center', 
            justifyContent: 'center', color: 'var(--primary)', marginBottom: '1.5rem',
            boxShadow: '0 8px 16px rgba(99, 102, 241, 0.15)'
          }}>
            <ShieldCheck size={28} />
          </div>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-1)', marginBottom: '0.6rem' }}>Welcome to El Meraki</h2>
          <p style={{ color: 'var(--text-4)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2.5rem' }}>
            To finalize your account and ensure you can log back in later, please provide your name and choose a secure password.
          </p>

          <form onSubmit={handleComplete} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {error && (
              <div style={{ 
                padding: '0.8rem 1rem', background: 'rgba(248, 113, 113, 0.08)', 
                color: 'var(--danger)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem',
                display: 'flex', alignItems: 'center', gap: '0.6rem', border: '1px solid rgba(248, 113, 113, 0.15)'
              }}>
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.72rem' }}>What is your full name?</label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
                <input 
                  type="text" 
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Alexander Hamilton"
                  style={{ paddingLeft: '2.75rem' }}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Choose your password</label>
              <div style={{ position: 'relative' }}>
                <Key size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  style={{ paddingLeft: '2.75rem' }}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Confirm your password</label>
              <div style={{ position: 'relative' }}>
                <CheckCircle2 size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Type it again"
                  style={{ paddingLeft: '2.75rem' }}
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="primary-btn" 
              disabled={loading}
              style={{ padding: '1rem', marginTop: '1rem', justifyContent: 'center', fontSize: '1rem' }}
            >
              {loading ? (
                <div className="spinner" />
              ) : (
                <>Finish Setup <ArrowRight size={18} /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
