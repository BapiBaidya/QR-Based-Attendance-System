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
  Lock
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
          dark: '#07090e',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H', // Highest error correction for distant phone scanning
      },
      (err) => {
        if (err) console.error('[Projector] Canvas render error:', err);
      }
    );
  }, [qrPayload]);

  // Fullscreen Handler
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFs);
    return () => document.removeEventListener('fullscreenchange', handleFs);
  }, []);

  // SVG circular countdown ring values
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progressPercent = secondsRemaining / ROTATION_INTERVAL_SECONDS;
  const strokeDashoffset = circumference * (1 - progressPercent);

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: '100vh',
        width: '100vw',
        background: '#07090e',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '36px 48px',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Background Cybernetic Ambient Gradients */}
      <div style={{
        position: 'absolute',
        top: '-15%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '70vw',
        height: '40vh',
        background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.22), transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
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
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--primary), var(--cyan))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 25px var(--cyan-glow)',
          }}>
            <Radio style={{ width: 28, height: 28, color: '#ffffff' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                {sessionTitle}
              </h1>
              <span className="badge badge-emerald" style={{ fontSize: '0.75rem' }}>
                <span className="pulse-dot text-emerald" />
                Live Attendance Feed
              </span>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Dynamic Anti-Proxy QR Rotation • Open student scanner to check in
            </p>
          </div>
        </div>

        {/* Fullscreen Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={toggleFullscreen}
            className="btn btn-ghost"
            style={{ padding: '10px 18px', background: 'rgba(255, 255, 255, 0.06)' }}
            title="Toggle Classroom Fullscreen (F11)"
          >
            {isFullscreen ? <Minimize2 style={{ width: 20, height: 20 }} /> : <Maximize2 style={{ width: 20, height: 20 }} />}
            <span style={{ fontSize: '0.85rem' }}>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      {/* CENTER: Jumbo High-Contrast QR Code Box */}
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
          boxShadow: '0 0 70px rgba(6, 182, 212, 0.45), 0 30px 60px rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 12 }} />

          {/* Session Ended Transition Screen */}
          {!isSessionActive && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(7, 9, 14, 0.96)',
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
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--emerald)',
              }}>
                <CheckCircle2 style={{ width: 36, height: 36, color: 'var(--emerald)' }} />
              </div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Attendance Concluded</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: 320 }}>
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
            gap: 16,
            marginTop: 26,
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid var(--border-glow)',
            padding: '10px 24px',
            borderRadius: 'var(--radius-full)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
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
                  style={{ transition: 'stroke-dashoffset 0.8s linear, stroke 0.3s ease' }}
                />
              </svg>
              <div style={{
                position: 'absolute',
                fontFamily: 'var(--font-mono)',
                fontSize: '1rem',
                fontWeight: 800,
                color: secondsRemaining <= 4 ? '#fda4af' : '#ffffff',
              }}>
                {secondsRemaining}s
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                Rotating HMAC-SHA256 Token
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw style={{ width: 12, height: 12, animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
                <span>Next token rotation in {secondsRemaining} seconds</span>
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
        borderTop: '1px solid var(--border-subtle)',
        paddingTop: 20,
        zIndex: 10,
      }}>
        {/* Anti-Proxy Defense Verification Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <ShieldCheck style={{ width: 18, height: 18, color: 'var(--cyan)' }} />
            <span>Screenshot Blocking (15s Window)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <Lock style={{ width: 18, height: 18, color: 'var(--emerald)' }} />
            <span>Single-Use Nonce Burn Active</span>
          </div>
        </div>

        {/* Live Attendance Counter */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          padding: '8px 20px',
          borderRadius: 'var(--radius-full)',
        }}>
          <Users style={{ width: 18, height: 18, color: 'var(--emerald)' }} />
          <span style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 600 }}>
            <strong style={{ color: 'var(--emerald)', fontSize: '1.1rem' }}>{attendeeCount}</strong> Students Checked In
          </span>
        </div>
      </div>
    </div>
  );
};
