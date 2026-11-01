import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import type { QRPayload } from '../types';
import { api } from '../api/client';
import { SessionWebSocketService } from '../services/websocket';
import { 
  ShieldCheck, 
  Maximize2, 
  Minimize2, 
  RefreshCw, 
  Users, 
  CheckCircle2, 
  Radio, 
  Lock,
  MapPin
} from 'lucide-react';

const ROTATION_INTERVAL_SECONDS = 15;

export const ProjectorScreen = () => {
  const [sessionId, setSessionId] = useState<string>('');
  const [sessionTitle, setSessionTitle] = useState<string>('Classroom Attendance');
  const [qrPayload, setQrPayload] = useState<QRPayload | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(ROTATION_INTERVAL_SECONDS);
  const [attendeeCount, setAttendeeCount] = useState<number>(0);
  const [isSessionActive, setIsSessionActive] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Extract sessionId and title from URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('sessionId') || '';
    const title = params.get('title') || 'Active Lecture Session';
    setSessionId(sid);
    setSessionTitle(title);
  }, []);

  // Fetch dynamic QR payload
  const fetchPayload = useCallback(async () => {
    if (!sessionId || !isSessionActive) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getSessionQR(sessionId);
      setQrPayload(data);
      setSecondsRemaining(ROTATION_INTERVAL_SECONDS);
    } catch (err: any) {
      console.error('[Projector] Failed to fetch QR:', err);
      setError(err.message || 'Connecting to session...');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isSessionActive]);

  // Initial load and 1s countdown timer
  useEffect(() => {
    if (!sessionId) return;
    fetchPayload();

    const ticker = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          fetchPayload();
          return ROTATION_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(ticker);
  }, [sessionId, fetchPayload]);

  // Connect WebSocket to listen for live check-ins and session end events
  useEffect(() => {
    if (!sessionId) return;
    const token = api.getToken();
    if (!token) return;

    const ws = new SessionWebSocketService(sessionId, token);

    ws.onAttendanceMarked(() => {
      setAttendeeCount((prev) => prev + 1);
    });

    ws.onSessionEnded(() => {
      setIsSessionActive(false);
    });

    ws.connect();

    return () => {
      ws.disconnect();
    };
  }, [sessionId]);

  // Render QR Canvas with high resolution for distant classroom projection
  useEffect(() => {
    if (!canvasRef.current || !qrPayload) return;

    const qrData = JSON.stringify({
      session_id: qrPayload.sid,
      timestamp: qrPayload.ts,
      nonce: qrPayload.nonce,
      signature: qrPayload.sig,
    });

    QRCode.toCanvas(
      canvasRef.current,
      qrData,
      {
        width: 440,
        margin: 2,
        color: {
          dark: '#05070d',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      },
      (err) => {
        if (err) {
          console.error('[Projector QRCode] Render error:', err);
          setError('Failed to render projected QR');
        }
      }
    );
  }, [qrPayload]);

  // Toggle Fullscreen Mode
  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.warn('Projector fullscreen rejected:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const progressPercent = (secondsRemaining / ROTATION_INTERVAL_SECONDS);
  const strokeDashoffset = circumference * (1 - progressPercent);

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: '100vh',
        width: '100vw',
        background: '#05070d',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: isFullscreen ? '40px 60px' : '30px 40px',
        position: 'relative',
        overflow: 'hidden',
        backgroundImage: `
          radial-gradient(circle at 50% 10%, rgba(0, 242, 254, 0.15), transparent 60%),
          radial-gradient(circle at 85% 85%, rgba(99, 102, 241, 0.15), transparent 55%),
          linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 100% 100%, 60px 60px, 60px 60px',
      }}
    >
      {/* Dynamic 3D Horizon Light Bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '10%',
        right: '10%',
        height: 2,
        background: 'linear-gradient(90deg, transparent, var(--cyan), #ffffff, var(--primary), transparent)',
        boxShadow: '0 0 25px var(--cyan)',
        pointerEvents: 'none',
      }} />

      {/* TOP BAR: Lecture Title & Controls */}
      <div style={{
        width: '100%',
        maxWidth: 1400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--cyan), var(--primary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 30px var(--cyan-glow)',
          }}>
            <Radio style={{ width: 28, height: 28, color: '#05070d' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                {sessionTitle}
              </h1>
              <span className="badge badge-emerald" style={{ fontSize: '0.75rem', padding: '5px 12px' }}>
                <span className="pulse-dot text-emerald" />
                Live Classroom Radar
              </span>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Anti-Proxy Dynamic QR Rotation • Student Geofence Verified
            </p>
          </div>
        </div>

        {/* Fullscreen Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={toggleFullscreen}
            className="btn btn-ghost"
            style={{ padding: '10px 20px', background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.15)' }}
            title="Toggle Classroom Fullscreen (F11)"
          >
            {isFullscreen ? <Minimize2 style={{ width: 20, height: 20 }} /> : <Maximize2 style={{ width: 20, height: 20 }} />}
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen (F11)'}</span>
          </button>
        </div>
      </div>

      {/* CENTER: 3D High-Contrast Holographic QR Code Box */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        margin: '20px 0',
      }}>
        <div style={{
          position: 'relative',
          padding: 24,
          background: '#ffffff',
          borderRadius: 28,
          boxShadow: '0 0 80px rgba(0, 242, 254, 0.45), 0 35px 70px rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '4px solid rgba(0, 242, 254, 0.6)',
          overflow: 'hidden',
        }}>
          {/* Animated Laser Scanner Line */}
          {isSessionActive && <div className="laser-scanner" />}

          {/* Tech Brackets */}
          <div style={{ position: 'absolute', top: 8, left: 8, width: 20, height: 20, borderTop: '4px solid var(--cyan-dark)', borderLeft: '4px solid var(--cyan-dark)' }} />
          <div style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderTop: '4px solid var(--cyan-dark)', borderRight: '4px solid var(--cyan-dark)' }} />
          <div style={{ position: 'absolute', bottom: 8, left: 8, width: 20, height: 20, borderBottom: '4px solid var(--cyan-dark)', borderLeft: '4px solid var(--cyan-dark)' }} />
          <div style={{ position: 'absolute', bottom: 8, right: 8, width: 20, height: 20, borderBottom: '4px solid var(--cyan-dark)', borderRight: '4px solid var(--cyan-dark)' }} />

          <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 14 }} />

          {/* Session Ended Transition Screen */}
          {!isSessionActive && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(5, 7, 13, 0.96)',
              borderRadius: 28,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
              textAlign: 'center',
              gap: 16,
            }}>
              <div style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--emerald)',
                boxShadow: '0 0 25px var(--emerald-glow)',
              }}>
                <CheckCircle2 style={{ width: 42, height: 42, color: 'var(--emerald)' }} />
              </div>
              <h2 style={{ fontSize: '2rem', fontWeight: 800 }}>Attendance Concluded</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: 340 }}>
                Attendance submissions for this lecture have been sealed by the faculty member.
              </p>
            </div>
          )}
        </div>

        {/* 15-Second Circular Rotation Clock & Countdown */}
        {isSessionActive && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            marginTop: 26,
            background: 'linear-gradient(135deg, rgba(16, 23, 41, 0.9), rgba(8, 12, 24, 0.95))',
            border: '1px solid rgba(0, 242, 254, 0.35)',
            padding: '12px 28px',
            borderRadius: 'var(--radius-full)',
            boxShadow: '0 12px 35px rgba(0,0,0,0.6), 0 0 20px rgba(0, 242, 254, 0.15)',
          }}>
            {/* Circular Gauge */}
            <div style={{ position: 'relative', width: 62, height: 62, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle cx="31" cy="31" r={radius} fill="none" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="5" />
                <circle
                  cx="31"
                  cy="31"
                  r={radius}
                  fill="none"
                  stroke={secondsRemaining <= 4 ? 'var(--rose)' : 'var(--cyan)'}
                  strokeWidth="5"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  style={{
                    transition: 'stroke-dashoffset 0.8s linear, stroke 0.3s ease',
                    filter: secondsRemaining <= 4 ? 'drop-shadow(0 0 8px var(--rose))' : 'drop-shadow(0 0 8px var(--cyan))',
                  }}
                />
              </svg>
              <div style={{
                position: 'absolute',
                fontFamily: 'var(--font-mono)',
                fontSize: '1rem',
                fontWeight: 800,
                color: secondsRemaining <= 4 ? '#fda4af' : 'var(--cyan)',
              }}>
                {secondsRemaining}s
              </div>
            </div>

            <div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                Rotating HMAC-SHA256 Token
              </div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <RefreshCw style={{ width: 13, height: 13, color: 'var(--cyan)', animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
                <span>Expires & burns in <strong style={{ color: 'var(--cyan)' }}>{secondsRemaining}s</strong></span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 14, color: 'var(--rose)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}
      </div>

      {/* BOTTOM BAR: Defensive Badges & Real-time Attendee Count */}
      <div style={{
        width: '100%',
        maxWidth: 1400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        paddingTop: 22,
        zIndex: 10,
      }}>
        {/* Anti-Proxy Defense Verification Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <ShieldCheck style={{ width: 18, height: 18, color: 'var(--cyan)' }} />
            <span>Screenshot Blocking (15s Window)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <Lock style={{ width: 18, height: 18, color: 'var(--emerald)' }} />
            <span>Single-Use Nonce Burn</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <MapPin style={{ width: 18, height: 18, color: 'var(--amber)' }} />
            <span>Geofence GPS Perimeter</span>
          </div>
        </div>

        {/* Live Attendance Counter with 3D Holographic Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.1))',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          padding: '10px 24px',
          borderRadius: 'var(--radius-full)',
          boxShadow: '0 0 25px rgba(16, 185, 129, 0.25)',
        }}>
          <Users style={{ width: 20, height: 20, color: 'var(--emerald)' }} />
          <span style={{ fontSize: '0.95rem', color: '#ffffff', fontWeight: 600 }}>
            <strong style={{ color: 'var(--emerald)', fontSize: '1.25rem', fontFamily: 'var(--font-mono)' }}>{attendeeCount}</strong> Students Checked In
          </span>
        </div>
      </div>
    </div>
  );
};
