import React, { useState } from 'react';
import { api } from '../api/client';
import type { User } from '../types';
import { QrCode, ShieldCheck, Lock, Mail, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await api.login(email.trim(), password);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // Pre-fill demo accounts for instant evaluation
  const handleDemoFill = (role: 'TEACHER' | 'ADMIN') => {
    if (role === 'TEACHER') {
      setEmail('teacher@university.edu');
      setPassword('TeacherPass123!');
    } else {
      setEmail('admin@university.edu');
      setPassword('AdminPass123!');
    }
    setError(null);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
    }}>
      <div className="glass-panel" style={{
        maxWidth: 460,
        width: '100%',
        padding: '40px 36px',
        position: 'relative',
        zIndex: 10,
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px var(--primary-glow)',
      }}>
        {/* Brand Icon & Heading */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, var(--primary), var(--cyan))',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-neon)',
            marginBottom: 16,
          }}>
            <QrCode style={{ width: 32, height: 32, color: '#ffffff' }} />
          </div>

          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 6 }}>
            AegisQR Console
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Enterprise Anti-Proxy Dynamic QR & Faculty Feed
          </p>
        </div>

        {/* Demo Fast-Fill Pill Buttons */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-subtle)', marginBottom: 8 }}>
            <Sparkles style={{ width: 12, height: 12, color: 'var(--cyan)' }} />
            <span>QUICK PRE-FILL CREDENTIALS</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => handleDemoFill('TEACHER')}
              className="btn btn-ghost"
              style={{ flex: 1, padding: '6px 10px', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)' }}
            >
              Faculty / Teacher
            </button>
            <button
              type="button"
              onClick={() => handleDemoFill('ADMIN')}
              className="btn btn-ghost"
              style={{ flex: 1, padding: '6px 10px', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)' }}
            >
              Administrator
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#fda4af',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Sign In Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-subtle)', marginBottom: 6, fontWeight: 600 }}>
              INSTITUTION EMAIL
            </label>
            <div style={{ position: 'relative' }}>
              <Mail style={{
                width: 16,
                height: 16,
                color: 'var(--text-subtle)',
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
              }} />
              <input
                type="email"
                className="input-field"
                placeholder="prof.turing@university.edu"
                style={{ paddingLeft: 42 }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-subtle)', marginBottom: 6, fontWeight: 600 }}>
              PASSWORD
            </label>
            <div style={{ position: 'relative' }}>
              <Lock style={{
                width: 16,
                height: 16,
                color: 'var(--text-subtle)',
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
              }} />
              <input
                type="password"
                className="input-field"
                placeholder="••••••••••••"
                style={{ paddingLeft: 42 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', marginTop: 8 }}
          >
            <span>{isLoading ? 'Authenticating...' : 'Sign In to Faculty Portal'}</span>
            <ArrowRight style={{ width: 16, height: 16 }} />
          </button>
        </form>

        <div style={{
          marginTop: 24,
          paddingTop: 18,
          borderTop: '1px solid var(--border-subtle)',
          textAlign: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
          <ShieldCheck style={{ width: 14, height: 14, color: 'var(--cyan)' }} />
          <span>Protected with Argon2id & Hardware Device Lock</span>
        </div>
      </div>
    </div>
  );
};
