import React from 'react';
import type { User } from '../types';
import type { WSConnectionStatus } from '../services/websocket';
import { QrCode, ShieldCheck, Wifi, WifiOff, LogOut, User as UserIcon } from 'lucide-react';

interface NavbarProps {
  user: User;
  onLogout: () => void;
  wsStatus: WSConnectionStatus;
  activeSessionTitle?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  wsStatus,
  activeSessionTitle,
}) => {
  const getStatusBadge = () => {
    switch (wsStatus) {
      case 'CONNECTED':
        return (
          <span className="badge badge-emerald">
            <span className="pulse-dot text-emerald" />
            Live WS Stream
          </span>
        );
      case 'CONNECTING':
      case 'RECONNECTING':
        return (
          <span className="badge badge-amber">
            <Wifi className="w-3 h-3 animate-spin" />
            Syncing Feed
          </span>
        );
      default:
        return (
          <span className="badge badge-purple">
            <WifiOff className="w-3 h-3" />
            Offline
          </span>
        );
    }
  };

  return (
    <header style={{
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(7, 9, 14, 0.85)',
      backdropFilter: 'blur(20px)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      padding: '14px 28px',
    }}>
      <div style={{
        maxWidth: 1600,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--primary), var(--cyan))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-neon)',
          }}>
            <QrCode style={{ width: 24, height: 24, color: '#ffffff' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: '1.25rem',
                letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #ffffff 40%, var(--primary-light))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                AegisQR
              </span>
              <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>
                <ShieldCheck style={{ width: 12, height: 12 }} /> Anti-Proxy Engine
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
              Faculty Live Attendance & Dynamic Projection Console
            </p>
          </div>
        </div>

        {/* Center: Active Session context */}
        {activeSessionTitle && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--bg-glass)',
            padding: '6px 14px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-glow)',
          }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Active Lecture:</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--cyan)' }}>
              {activeSessionTitle}
            </span>
            {getStatusBadge()}
          </div>
        )}

        {/* Right: User Profile & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <UserIcon style={{ width: 18, height: 18, color: 'var(--text-muted)' }} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {user.full_name}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                {user.role} • {user.institution_id}
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="btn btn-ghost"
            style={{ padding: '8px 14px', fontSize: '0.85rem' }}
            title="Sign out"
          >
            <LogOut style={{ width: 16, height: 16 }} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
