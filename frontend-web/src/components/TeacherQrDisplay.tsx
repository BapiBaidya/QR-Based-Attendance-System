import React, { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import type { QRPayload } from '../types';
import { api } from '../api/client';
import { Maximize2, Minimize2, RefreshCw, ShieldCheck, Key, Clock, AlertTriangle } from 'lucide-react';

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
          dark: '#07090e',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H', // Highest error correction for easy scanning across lecture halls
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
      className={`glass-panel ${isFullscreen ? 'fullscreen-mode' : ''}`}
      style={{
        padding: isFullscreen ? '40px 60px' : '28px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background: isFullscreen ? '#07090e' : 'var(--bg-card)',
        minHeight: isFullscreen ? '100vh' : 520,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: 'rgba(6, 182, 212, 0.15)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <ShieldCheck style={{ width: 20, height: 20, color: 'var(--cyan)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: isFullscreen ? '1.5rem' : '1.15rem', fontWeight: 700 }}>
              Dynamic Rotating QR
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Rotates every 15s • HMAC-SHA256 Signed
            </p>
          </div>
        </div>

        {/* Circular Countdown Gauge & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Circular Countdown Ring */}
          <div style={{
            position: 'relative',
            width: 54,
            height: 54,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
              <circle
                cx="27"
                cy="27"
                r={radius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="4"
              />
              <circle
                cx="27"
                cy="27"
                r={radius}
                fill="none"
                stroke={secondsRemaining <= 4 ? 'var(--rose)' : 'var(--cyan)'}
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.8s linear, stroke 0.3s ease' }}
              />
            </svg>
            <div style={{
              position: 'absolute',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: secondsRemaining <= 4 ? '#fda4af' : 'var(--text-main)',
            }}>
              {secondsRemaining}s
            </div>
          </div>

          {/* Manual Rotate Button */}
          <button
            onClick={() => fetchQRPayload()}
            disabled={isLoading || !isSessionActive}
            className="btn btn-ghost"
            style={{ padding: '8px 12px' }}
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
            style={{ padding: '8px 12px' }}
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

      {/* Main Canvas Display with Glow Frame */}
      <div style={{
        position: 'relative',
        padding: 16,
        background: '#ffffff',
        borderRadius: 'var(--radius-lg)',
        boxShadow: isFullscreen 
          ? '0 0 60px rgba(6, 182, 212, 0.4), 0 20px 50px rgba(0, 0, 0, 0.8)'
          : '0 0 35px var(--cyan-glow), var(--shadow-lg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '14px 0',
      }}>
        <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 'var(--radius-sm)' }} />

        {/* Inactive overlay if session has ended */}
        {!isSessionActive && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(7, 9, 14, 0.92)',
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
            <h4 style={{ color: '#ffffff', fontSize: '1.2rem' }}>Session Closed</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 260 }}>
              Attendance submissions are locked. Dynamic QR rotations have been halted.
            </p>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          marginTop: 10,
          background: 'rgba(244, 63, 94, 0.15)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
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

      {/* Cryptographic Inspector Badges */}
      {payload && (
        <div style={{
          marginTop: 18,
          width: '100%',
          display: 'grid',
          gridTemplateColumns: isFullscreen ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)',
          gap: 10,
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-subtle)', fontSize: '0.72rem' }}>
              <Key style={{ width: 12, height: 12, color: 'var(--primary-light)' }} />
              <span>NONCE ID</span>
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
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-subtle)', fontSize: '0.72rem' }}>
              <Clock style={{ width: 12, height: 12, color: 'var(--amber)' }} />
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
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-subtle)', fontSize: '0.72rem' }}>
              <ShieldCheck style={{ width: 12, height: 12, color: 'var(--emerald)' }} />
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
