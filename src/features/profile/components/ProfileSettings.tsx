import React, { useState } from 'react';
import { useStore } from '../../../store/useStore';
import { User, Shield, Key, CheckCircle2, AlertCircle, Briefcase, Mail } from 'lucide-react';

export const ProfileSettings: React.FC = () => {
  const currentUser = useStore(s => s.currentUser);
  const updatePassword = useStore(s => s.updatePassword);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!currentUser) return null;

  const handleUpdatePassword = async (e: React.FormEvent) => {
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
      await updatePassword(password);
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fadeIn" style={{ maxWidth: '800px' }}>
      <header style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div className="avatar" style={{ width: '48px', height: '48px', fontSize: '1.25rem', borderRadius: 'var(--radius-lg)' }}>
            {currentUser.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-1)' }}>Account Settings</h1>
            <p style={{ color: 'var(--text-4)', fontSize: '0.9rem' }}>Manage your personal information and security preferences.</p>
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        
        {/* Personal Info Card */}
        <section style={cardStyle}>
          <div style={cardHeaderStyle}>
            <User size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Personal Information</h3>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
            <div style={infoGroupStyle}>
              <label style={labelStyle}>Full Name</label>
              <div style={infoValueStyle}>
                <User size={14} style={{ opacity: 0.5 }} />
                <span>{currentUser.full_name}</span>
              </div>
            </div>

            <div style={infoGroupStyle}>
              <label style={labelStyle}>Email Address</label>
              <div style={infoValueStyle}>
                <Mail size={14} style={{ opacity: 0.5 }} />
                <span>{currentUser.email}</span>
              </div>
            </div>

            <div style={infoGroupStyle}>
              <label style={labelStyle}>Job Title / Label</label>
              <div style={infoValueStyle}>
                <Briefcase size={14} style={{ opacity: 0.5 }} />
                <span>{currentUser.job_title || 'No title set'}</span>
              </div>
            </div>

            <div style={infoGroupStyle}>
              <label style={labelStyle}>System Role</label>
              <div style={infoValueStyle}>
                <Shield size={14} style={{ opacity: 0.5 }} />
                <span className="badge" style={{ 
                  background: currentUser.role === 'Admin' ? 'rgba(99,102,241,0.1)' : 'rgba(52,211,153,0.1)',
                  color: currentUser.role === 'Admin' ? 'var(--primary)' : 'var(--success)',
                  margin: 0, padding: '0.15rem 0.6rem'
                }}>
                  {currentUser.role}
                </span>
              </div>
            </div>
          </div>
          
          <div style={{ 
            marginTop: '2rem', padding: '1rem', borderRadius: 'var(--radius-md)', 
            background: 'var(--surface-3)', border: '1px solid var(--border)',
            display: 'flex', gap: '0.75rem', alignItems: 'flex-start'
          }}>
            <AlertCircle size={16} style={{ color: 'var(--text-4)', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '0.8rem', color: 'var(--text-4)', lineHeight: 1.5 }}>
              To change your display name or job title, please contact your workspace administrator. 
              Email addresses cannot be changed at this time.
            </p>
          </div>
        </section>

        {/* Security / Password Card */}
        <section style={cardStyle}>
          <div style={cardHeaderStyle}>
            <Key size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Security & Password</h3>
          </div>

          <div style={{ maxWidth: '400px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-3)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              If you logged in via an invitation link, you should set a password here so you can log back in later.
            </p>

            <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {error && (
                <div style={{ 
                  padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', 
                  background: 'rgba(248,113,113,0.1)', color: 'var(--danger)', 
                  fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                  border: '1px solid rgba(248,113,113,0.2)'
                }}>
                  <AlertCircle size={15} />
                  {error}
                </div>
              )}

              <div className="form-group">
                <label style={labelStyle}>New Password</label>
                <input 
                  type="password" 
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                />
              </div>

              <div className="form-group">
                <label style={labelStyle}>Confirm New Password</label>
                <input 
                  type="password" 
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-type your password"
                  required
                />
              </div>

              <button 
                type="submit" 
                className="primary-btn" 
                disabled={loading || !password}
                style={{ width: 'fit-content', padding: '0.75rem 1.75rem' }}
              >
                {loading ? <div className="spinner" /> : <><CheckCircle2 size={16} /> Update Password</>}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  padding: '2rem',
  borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-sm)'
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  marginBottom: '2rem',
  color: 'var(--text-1)',
  borderBottom: '1px solid var(--border-subtle)',
  paddingBottom: '1rem'
};

const infoGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem'
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 700,
  color: 'var(--text-4)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em'
};

const infoValueStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  background: 'var(--surface-2)',
  padding: '0.75rem 1rem',
  borderRadius: 'var(--radius-md)',
  fontSize: '0.9rem',
  color: 'var(--text-2)',
  border: '1px solid var(--border-subtle)'
};
