import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useStore } from '../../../store/useStore';
import { Mail, User, ArrowRight, ShieldCheck, Zap, Globe, Sun, Moon, Eye, EyeOff } from 'lucide-react';

export const Auth = () => {
  const theme = useStore(s => s.theme);
  const toggleTheme = useStore(s => s.toggleTheme);
  const isDark = theme === 'dark';

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLogin, setIsLogin] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('type') !== 'signup';
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName || email.split('@')[0]
            },
            emailRedirectTo: window.location.origin,
          }
        });
        if (error) throw error;
        
        // Supabase returns data.user with empty identities if user already exists
        if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
          throw new Error('This email is already registered. Please log in instead.');
        }

        useStore.getState().setAlertData({ 
          message: 'Registration successful! Please check your email or log in.', 
          type: 'success' 
        });
        setIsLogin(true);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      let msg = err.message || 'Authentication failed. Please check your connection.';
      if (msg.toLowerCase().includes('already registered')) {
        msg = 'This email is already registered. Please log in instead.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand-section">
        <div className="auth-brand-content">
          <div className="brand-badge">
            <ShieldCheck size={14} /> EL MERAKI ENTERPRISE
          </div>
          <h1 className="brand-tagline">
            Next-Generation <br />
            <span className="text-gradient">Operational Control</span>
          </h1>
          <p className="brand-description">
            Streamline your organization's workflow with real-time task synchronization,
            advanced observability, and enterprise-grade security.
          </p>

          <div className="feature-list">
            <div className="feature-item">
              <div className="feature-icon"><Zap size={18} /></div>
              <div>
                <div className="feature-title">Real-time Sync</div>
                <div className="feature-desc">Updates propagate instantly across the team.</div>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon"><Globe size={18} /></div>
              <div>
                <div className="feature-title">Global Accessibility</div>
                <div className="feature-desc">Access your workspace from any device, anywhere.</div>
              </div>
            </div>
          </div>
        </div>
        <div className="auth-footer-brand">
          © 2026 El Meraki Ops. All rights Reserved.
        </div>
      </div>

      <div className="auth-form-section">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={{
            position: 'absolute', top: '1.5rem', right: '1.5rem',
            width: '38px', height: '38px', borderRadius: 'var(--radius-full)',
            background: 'var(--surface-3)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.2s', color: 'var(--text-3)',
            zIndex: 10
          }}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <div className="auth-card">
          <div className="auth-card-header">
            <div className="auth-logo">M</div>
            <h2 className="auth-title">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
            <p className="auth-subtitle">
              {isLogin
                ? 'Access your mission-critical dashboard'
                : 'Join the next generation of task management'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="auth-form">
            {error && (
              <div className="auth-error animate-shake">
                {error}
              </div>
            )}

            {!isLogin && (
              <div className="form-group-modern">
                <label className="form-label-modern">Full Name</label>
                <div className="input-with-icon">
                  <input
                    type="text"
                    className="input-modern"
                    placeholder="E.g. Alexander Hamilton"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required={!isLogin}
                  />
                  <User className="input-icon" size={18} />
                </div>
              </div>
            )}

            <div className="form-group-modern">
              <label className="form-label-modern">Email Address</label>
              <div className="input-with-icon">
                <input
                  type="email"
                  className="input-modern"
                  placeholder="name@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
                <Mail className="input-icon" size={18} />
              </div>
            </div>

            <div className="form-group-modern">
              <label className="form-label-modern">Password</label>
              <div className="input-with-icon">
                <input
                  type={showPassword ? "text" : "password"}
                  className="input-modern"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button 
                  type="button" 
                  className="input-icon toggle-password" 
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <span className="spinner"></span>
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="auth-toggle">
            <span>{isLogin ? "Don't have an account?" : "Already registered?"}</span>
            <button
              type="button"
              className="auth-toggle-btn"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? "Create one" : "Sign in"}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .auth-page {
            display: grid;
            grid-template-columns: 1fr 520px;
            min-height: 100vh;
            background: #050810;
        }

        .auth-brand-section {
            padding: 3.5rem;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
            background: radial-gradient(ellipse at top left, #1e1b4b 0%, #050810 70%);
            overflow: hidden;
        }

        .auth-brand-section::before {
            content: '';
            position: absolute;
            top: -15%;
            right: -15%;
            width: 500px;
            height: 500px;
            background: var(--primary-dark);
            filter: blur(180px);
            opacity: 0.12;
            border-radius: 50%;
        }

        .auth-brand-section::after {
            content: '';
            position: absolute;
            bottom: 10%;
            left: 20%;
            width: 300px;
            height: 300px;
            background: #7c3aed;
            filter: blur(150px);
            opacity: 0.06;
            border-radius: 50%;
        }

        .auth-brand-content {
            position: relative;
            z-index: 1;
        }

        .brand-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            background: rgba(129,140,248,0.08);
            padding: 0.35rem 0.75rem;
            border-radius: var(--radius-full);
            color: var(--primary);
            font-size: 0.65rem;
            font-weight: 700;
            letter-spacing: 0.12em;
            margin-bottom: 2.5rem;
            border: 1px solid rgba(129,140,248,0.12);
        }

        .brand-tagline {
            font-size: 3rem;
            font-weight: 800;
            color: white;
            line-height: 1.1;
            margin-bottom: 1.5rem;
            letter-spacing: -0.02em;
        }

        .text-gradient {
            background: linear-gradient(135deg, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .brand-description {
            color: #64748b;
            font-size: 1.05rem;
            line-height: 1.7;
            max-width: 480px;
            margin-bottom: 3.5rem;
        }

        .feature-list {
            display: flex;
            flex-direction: column;
            gap: 1.75rem;
        }

        .feature-item {
            display: flex;
            gap: 1rem;
            align-items: flex-start;
        }

        .feature-icon {
            width: 40px;
            height: 40px;
            background: rgba(129,140,248,0.06);
            border: 1px solid rgba(129,140,248,0.1);
            border-radius: var(--radius-md);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--primary);
            flex-shrink: 0;
        }

        .feature-title {
            color: #e2e8f0;
            font-weight: 600;
            font-size: 0.95rem;
            margin-bottom: 0.2rem;
        }

        .feature-desc {
            color: #475569;
            font-size: 0.85rem;
        }

        .auth-footer-brand {
            color: #334155;
            font-size: 0.8rem;
            position: relative;
            z-index: 1;
        }

        .auth-form-section {
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-elevated);
            padding: 2rem;
            border-left: 1px solid var(--border);
            position: relative;
        }

        .auth-card {
            width: 100%;
            max-width: 380px;
            animation: fadeInScale 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes fadeInScale {
            from { opacity: 0; transform: scale(0.96) translateY(8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .auth-logo {
            width: 44px;
            height: 44px;
            background: linear-gradient(135deg, var(--primary-dark), var(--primary));
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: var(--radius-md);
            font-weight: 800;
            font-size: 1.35rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 8px 20px rgba(99, 102, 241, 0.25);
        }

        .auth-title {
            font-size: 1.6rem;
            font-weight: 700;
            color: var(--text-1);
            margin-bottom: 0.4rem;
        }

        .auth-subtitle {
            color: var(--text-4);
            font-size: 0.9rem;
            margin-bottom: 2.25rem;
        }

        .form-group-modern {
            margin-bottom: 1.25rem;
        }

        .form-label-modern {
            display: block;
            font-size: 0.72rem;
            font-weight: 600;
            color: var(--text-3);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin-bottom: 0.45rem;
        }

        .input-with-icon {
            position: relative;
        }

        .input-icon {
            position: absolute;
            right: 1rem;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-4);
            transition: color 0.2s;
            z-index: 1;
        }
        
        .input-icon.toggle-password:hover {
            color: var(--text-1);
        }

        .input-modern {
            width: 100%;
            padding: 0.8rem 2.75rem 0.8rem 1rem;
            border-radius: var(--radius-md);
            border: 1.5px solid var(--border-strong);
            background: var(--surface);
            font-size: 0.95rem;
            color: var(--text-1);
            transition: all 0.2s;
        }

        .input-modern:focus {
            outline: none;
            border-color: var(--primary);
            background: var(--surface);
            box-shadow: 0 0 0 3px var(--primary-glow);
        }

        .input-modern::placeholder {
            color: var(--text-4);
        }

        .auth-submit-btn {
            width: 100%;
            padding: 0.85rem;
            background: linear-gradient(135deg, var(--primary-dark), var(--primary));
            color: white;
            border: none;
            border-radius: var(--radius-md);
            font-weight: 600;
            font-size: 0.95rem;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.6rem;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            margin-top: 1.75rem;
            box-shadow: 0 6px 20px rgba(99,102,241,0.25);
        }

        .auth-submit-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(99,102,241,0.35);
        }

        .auth-submit-btn:active {
            transform: translateY(0);
        }

        .auth-submit-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .auth-error {
            background: rgba(248,113,113,0.08);
            color: var(--danger);
            padding: 0.875rem 1rem;
            border-radius: var(--radius-md);
            font-size: 0.85rem;
            font-weight: 500;
            margin-bottom: 1.25rem;
            border: 1px solid rgba(248,113,113,0.15);
        }

        .auth-toggle {
            margin-top: 2rem;
            text-align: center;
            font-size: 0.85rem;
            color: var(--text-4);
        }

        .auth-toggle-btn {
            background: none;
            border: none;
            color: var(--primary);
            font-weight: 600;
            padding: 0 0.4rem;
            cursor: pointer;
            transition: opacity 0.2s;
        }

        .auth-toggle-btn:hover {
            opacity: 0.8;
        }

        .spinner {
            width: 20px;
            height: 20px;
            border: 2.5px solid rgba(255,255,255,0.2);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-4px); }
            75% { transform: translateX(4px); }
        }

        .animate-shake {
            animation: shake 0.3s;
        }

        @media (max-width: 1024px) {
            .auth-page {
                grid-template-columns: 1fr;
            }
            .auth-brand-section {
                display: none;
            }
            .auth-form-section {
                border-left: none;
            }
        }
      `}</style>
    </div>
  );
};
