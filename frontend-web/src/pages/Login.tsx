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
      overflow: 'hidden',
    }}>
      {/* 3D Ambient Volumetric Light Orbs */}
      <div style={{
        position: 'absolute',
        width: 500,
        height: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, transparent 70%)',
        top: '10%',
        left: '20%',
        filter: 'blur(50px)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        width: 450,
        height: 450,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0, 242, 254, 0.2) 0%, transparent 70%)',
        bottom: '10%',
        right: '20%',
        filter: 'blur(50px)',
        pointerEvents: 'none',
      }} />

      <div className="glass-panel card-3d" style={{
        maxWidth: 480,
        width: '100%',
        padding: '42px 38px',
        position: 'relative',
        zIndex: 10,
        background: 'linear-gradient(145deg, rgba(16, 23, 44, 0.88), rgba(8, 12, 24, 0.95))',
        border: '1px solid rgba(0, 242, 254, 0.25)',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 35px rgba(0, 242, 254, 0.15)',
      }}>
        {/* Brand Icon & Heading */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 60,
            height: 60,
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, var(--cyan), var(--primary))',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 25px var(--cyan-glow)',
            marginBottom: 16,
            border: '1px solid rgba(255, 255, 255, 0.3)',
          }}>
            <QrCode style={{ width: 34, height: 34, color: '#05070d' }} />
          </div>

          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 6 }}>
            AegisQR Console
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Enterprise Anti-Proxy Dynamic QR & Faculty Command Center
          </p>
        </div>

        {/* Demo Fast-Fill Pill Buttons */}
        <div style={{
          background: 'rgba(6, 12, 26, 0.7)',
          border: '1px solid rgba(0, 242, 254, 0.2)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px',
          marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--text-cyber)', marginBottom: 8, fontWeight: 700, letterSpacing: '0.04em' }}>
            <Sparkles style={{ width: 13, height: 13, color: 'var(--cyan)' }} />
            <span>FAST DEMO CREDENTIALS</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => handleDemoFill('TEACHER')}
              className="btn btn-ghost"
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '0.78rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(0, 242, 254, 0.25)',
                color: 'var(--cyan)',
                fontWeight: 700,
              }}
            >
              Faculty / Teacher
            </button>
            <button
              type="button"
              onClick={() => handleDemoFill('ADMIN')}
              className="btn btn-ghost"
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '0.78rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                color: '#c084fc',
                fontWeight: 700,
              }}
            >
              Administrator
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.35)',
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
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-cyber)', marginBottom: 6, fontWeight: 700, letterSpacing: '0.03em' }}>
              INSTITUTION EMAIL
            </label>
            <div style={{ position: 'relative' }}>
              <Mail style={{
                width: 17,
                height: 17,
                color: 'var(--text-subtle)',
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
              }} />
              <input
                type="email"
                className="input-field"
                placeholder="teacher@university.edu"
                style={{ paddingLeft: 42 }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-cyber)', marginBottom: 6, fontWeight: 700, letterSpacing: '0.03em' }}>
              PASSWORD
            </label>
            <div style={{ position: 'relative' }}>
              <Lock style={{
                width: 17,
                height: 17,
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
            style={{ width: '100%', padding: '13px', marginTop: 8, fontSize: '0.95rem' }}
          >
            <span>{isLoading ? 'Verifying Identity...' : 'Sign In to Portal'}</span>
            <ArrowRight style={{ width: 16, height: 16 }} />
          </button>
        </form>

        <div style={{
          marginTop: 26,
          paddingTop: 18,
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          textAlign: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
          <ShieldCheck style={{ width: 15, height: 15, color: 'var(--cyan)' }} />
          <span>Secured with Argon2id & Hardware Device Lock</span>
        </div>
      </div>
    </div>
  );
};
