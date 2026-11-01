import React, { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import type { QRPayload } from '../types';
import { api } from '../api/client';
import { Maximize2, Minimize2, RefreshCw, ShieldCheck, Key, Clock, AlertTriangle, Cpu } from 'lucide-react';

interface TeacherQrDisplayProps {
  sessionId: string;
  isSessionActive: boolean;
  onPayloadChange?: (payload: QRPayload) => void;
}

const ROTATION_INTERVAL_SECONDS = 15;

export const TeacherQrDisplay: React.FC<TeacherQrDisplayProps> = ({
  sessionId,
  isSessionActive,
  onPayloadChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [payload, setPayload] = useState<QRPayload | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(ROTATION_INTERVAL_SECONDS);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Fetch the latest dynamic QR payload from backend
  const fetchQRPayload = useCallback(async () => {
    if (!isSessionActive) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getSessionQR(sessionId);
      setPayload(data);
      setSecondsRemaining(ROTATION_INTERVAL_SECONDS);
      if (onPayloadChange) {
        onPayloadChange(data);
      }
    } catch (err: any) {
      console.error('[QR] Failed to fetch dynamic QR payload:', err);
      setError(err.message || 'Failed to generate QR payload');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isSessionActive, onPayloadChange]);

  // Initial fetch and 1-second countdown ticker
  useEffect(() => {
    fetchQRPayload();

    const ticker = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          fetchQRPayload();
          return ROTATION_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(ticker);
  }, [fetchQRPayload]);

  // Render QR payload to canvas whenever payload changes
  useEffect(() => {
    if (!canvasRef.current || !payload) return;

    // The student mobile app reads this JSON string
    const qrData = JSON.stringify({
      session_id: payload.sid,
      timestamp: payload.ts,
      nonce: payload.nonce,
      signature: payload.sig,
    });

    QRCode.toCanvas(
      canvasRef.current,
      qrData,
      {
        width: isFullscreen ? 480 : 320,
        margin: 2,
        color: {
          dark: '#05070d',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      },
      (err) => {
        if (err) {
          console.error('[QRCode] Render error:', err);
          setError('Failed to render QR Code');
        }
      }
    );
  }, [payload, isFullscreen]);

  // Handle Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.warn('Fullscreen request denied:', err);
      });
    } else {
      document.exitFullscreen?.().then(() => {
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

  // SVG Circular countdown calculations
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const progressPercent = (secondsRemaining / ROTATION_INTERVAL_SECONDS);
  const strokeDashoffset = circumference * (1 - progressPercent);

  return (
    <div
      ref={containerRef}
      className={`glass-panel card-3d ${isFullscreen ? 'fullscreen-mode' : ''}`}
      style={{
        padding: isFullscreen ? '40px 60px' : '28px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background: isFullscreen ? '#05070d' : 'linear-gradient(145deg, rgba(16, 23, 41, 0.8), rgba(9, 13, 26, 0.95))',
        border: '1px solid rgba(0, 242, 254, 0.25)',
        minHeight: isFullscreen ? '100vh' : 530,
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(0, 242, 254, 0.1)',
      }}
    >
      {/* Top Header / Status */}
      <div style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(99, 102, 241, 0.3))',
            border: '1px solid rgba(0, 242, 254, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(0, 242, 254, 0.25)',
          }}>
            <Cpu style={{ width: 22, height: 22, color: 'var(--cyan)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: isFullscreen ? '1.5rem' : '1.18rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Dynamic Rotating QR
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Rotates every 15s • HMAC-SHA256 • Redis SETNX Nonce
            </p>
          </div>
        </div>

        {/* Circular Countdown Gauge & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Circular Countdown Ring */}
          <div style={{
            position: 'relative',
            width: 52,
            height: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
              <circle
                cx="26"
                cy="26"
                r={radius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="4"
              />
              <circle
                cx="26"
                cy="26"
                r={radius}
                fill="none"
                stroke={secondsRemaining <= 4 ? 'var(--rose)' : 'var(--cyan)'}
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{
                  transition: 'stroke-dashoffset 0.8s linear, stroke 0.3s ease',
                  filter: secondsRemaining <= 4 ? 'drop-shadow(0 0 6px var(--rose))' : 'drop-shadow(0 0 6px var(--cyan))',
                }}
              />
            </svg>
            <div style={{
              position: 'absolute',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.88rem',
              fontWeight: 800,
              color: secondsRemaining <= 4 ? '#fda4af' : 'var(--cyan)',
            }}>
              {secondsRemaining}s
            </div>
          </div>

          {/* Manual Rotate Button */}
          <button
            onClick={() => fetchQRPayload()}
            disabled={isLoading || !isSessionActive}
            className="btn btn-ghost"
            style={{ padding: '8px 12px', height: 38 }}
            title="Rotate QR code now"
          >
            <RefreshCw style={{
              width: 16,
              height: 16,
              animation: isLoading ? 'spin 1s linear infinite' : 'none',
            }} />
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="btn btn-ghost"
            style={{ padding: '8px 12px', height: 38 }}
            title={isFullscreen ? 'Exit projector mode' : 'Open projector mode'}
          >
            {isFullscreen ? (
              <Minimize2 style={{ width: 16, height: 16 }} />
            ) : (
              <Maximize2 style={{ width: 16, height: 16 }} />
            )}
          </button>
        </div>
      </div>

      {/* Main Canvas Display with 3D Cyber Frame & Laser Scanner */}
      <div style={{
        position: 'relative',
        padding: 16,
        background: '#ffffff',
        borderRadius: 'var(--radius-lg)',
        boxShadow: isFullscreen 
          ? '0 0 80px rgba(0, 242, 254, 0.45), 0 25px 60px rgba(0, 0, 0, 0.9)'
          : '0 0 45px rgba(0, 242, 254, 0.35), 0 15px 35px rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '14px 0',
        overflow: 'hidden',
        border: '3px solid rgba(0, 242, 254, 0.6)',
      }}>
        {/* Animated Laser Scanner Line */}
        {isSessionActive && <div className="laser-scanner" />}

        {/* 4 Corner Tech Brackets */}
        <div style={{ position: 'absolute', top: 6, left: 6, width: 14, height: 14, borderTop: '3px solid var(--cyan-dark)', borderLeft: '3px solid var(--cyan-dark)' }} />
        <div style={{ position: 'absolute', top: 6, right: 6, width: 14, height: 14, borderTop: '3px solid var(--cyan-dark)', borderRight: '3px solid var(--cyan-dark)' }} />
        <div style={{ position: 'absolute', bottom: 6, left: 6, width: 14, height: 14, borderBottom: '3px solid var(--cyan-dark)', borderLeft: '3px solid var(--cyan-dark)' }} />
        <div style={{ position: 'absolute', bottom: 6, right: 6, width: 14, height: 14, borderBottom: '3px solid var(--cyan-dark)', borderRight: '3px solid var(--cyan-dark)' }} />

        <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 'var(--radius-sm)' }} />

        {/* Inactive overlay if session has ended */}
        {!isSessionActive && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(5, 7, 13, 0.94)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
            textAlign: 'center',
          }}>
            <AlertTriangle style={{ width: 44, height: 44, color: 'var(--amber)' }} />
            <h4 style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: 800 }}>Session Concluded</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 280 }}>
              Attendance submissions are permanently locked. Dynamic cryptographic rotation halted.
            </p>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          marginTop: 10,
          background: 'rgba(244, 63, 94, 0.15)',
          border: '1px solid rgba(244, 63, 94, 0.35)',
          padding: '8px 16px',
          borderRadius: 'var(--radius-md)',
          color: '#fda4af',
          fontSize: '0.825rem',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <AlertTriangle style={{ width: 16, height: 16 }} />
          <span>{error}</span>
        </div>
      )}

      {/* 3D Cryptographic Inspector Badges */}
      {payload && (
        <div style={{
          marginTop: 18,
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}>
          <div style={{
            background: 'rgba(6, 12, 26, 0.7)',
            border: '1px solid rgba(0, 242, 254, 0.2)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-cyber)', fontSize: '0.72rem', fontWeight: 700 }}>
              <Key style={{ width: 12, height: 12 }} />
              <span>NONCE UUID</span>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: 'var(--cyan)',
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {payload.nonce}
            </div>
          </div>

          <div style={{
            background: 'rgba(6, 12, 26, 0.7)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fbbf24', fontSize: '0.72rem', fontWeight: 700 }}>
              <Clock style={{ width: 12, height: 12 }} />
              <span>EPOCH TS</span>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: 'var(--text-main)',
              marginTop: 4,
            }}>
              {payload.ts}
            </div>
          </div>

          <div style={{
            background: 'rgba(6, 12, 26, 0.7)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399', fontSize: '0.72rem', fontWeight: 700 }}>
              <ShieldCheck style={{ width: 12, height: 12 }} />
              <span>HMAC SIG</span>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: 'var(--emerald)',
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {payload.sig.slice(0, 10)}...{payload.sig.slice(-6)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
