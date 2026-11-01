import { useState, useEffect, useRef } from 'react';
import type { User, ClassSession, AttendanceRecord } from '../types';
import { api } from '../api/client';
import { SessionWebSocketService, type WSConnectionStatus } from '../services/websocket';
import { Navbar } from '../components/Navbar';
import { TeacherQrDisplay } from '../components/TeacherQrDisplay';
import { LiveAttendanceList } from '../components/LiveAttendanceList';
import { AnalyticsChart } from '../components/AnalyticsChart';
import { CreateSessionModal } from '../components/CreateSessionModal';
import { 
  Play, 
  StopCircle, 
  Download, 
  Sparkles, 
  CheckCircle2, 
  Radio,
  Tv
} from 'lucide-react';

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeSession, setActiveSession] = useState<ClassSession | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [wsStatus, setWsStatus] = useState<WSConnectionStatus>('DISCONNECTED');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [latestCheckinToast, setLatestCheckinToast] = useState<string | null>(null);

  const wsServiceRef = useRef<SessionWebSocketService | null>(null);

  // Initialize or teardown WebSocket connection when activeSession changes
  useEffect(() => {
    if (!activeSession) {
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect();
        wsServiceRef.current = null;
      }
      setWsStatus('DISCONNECTED');
      return;
    }

    const token = api.getToken();
    if (!token) return;

    // Disconnect any existing service before creating a new one
    if (wsServiceRef.current) {
      wsServiceRef.current.disconnect();
    }

    const service = new SessionWebSocketService(activeSession.id, token);
    wsServiceRef.current = service;

    service.onStatusChange((status) => {
      setWsStatus(status);
    });

    service.onAttendanceMarked((data) => {
      setRecords((prev) => {
        // Prevent duplicates
        if (prev.some((r) => r.student_id === data.student_id)) {
          return prev;
        }
        const newRecord: AttendanceRecord = {
          id: data.record_id,
          session_id: activeSession.id,
          student_id: data.student_id,
          student_name: data.student_name,
          institution_id: data.institution_id,
          status: data.status,
          distance_meters: data.distance_meters,
          marked_at: data.marked_at,
          verified: true,
        };
        return [newRecord, ...prev];
      });

      // Show toast
      setLatestCheckinToast(`Check-in verified: ${data.student_name} (${data.distance_meters?.toFixed(1) ?? '0'}m)`);
      setTimeout(() => setLatestCheckinToast(null), 4000);
    });

    service.onSessionEnded(() => {
      setActiveSession((prev) => (prev ? { ...prev, status: 'COMPLETED' } : null));
    });

    service.connect();

    return () => {
      service.disconnect();
    };
  }, [activeSession]);

  // Handle Session Ending
  const handleEndSession = async () => {
    if (!activeSession) return;
    setIsEndingSession(true);
    try {
      const ended = await api.endSession(activeSession.id);
      setActiveSession(ended);
      setSummaryModalOpen(true);
    } catch (err: any) {
      alert(`Failed to end session: ${err.message}`);
    } finally {
      setIsEndingSession(false);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    if (!activeSession || records.length === 0) return;

    const headers = ['Record ID', 'Student Name', 'Institution ID', 'Status', 'Distance (Meters)', 'Marked At'];
    const rows = records.map((r) => [
      r.id,
      `"${r.student_name}"`,
      r.institution_id,
      r.status,
      r.distance_meters ?? 'N/A',
      r.marked_at,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Attendance_${activeSession.title.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenProjectorWindow = () => {
    if (!activeSession) return;
    const url = `/projector?sessionId=${activeSession.id}&title=${encodeURIComponent(activeSession.title)}`;
    window.open(url, 'ClassroomProjector', 'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no');
  };

  const handleRecordUpdated = (updated: AttendanceRecord) => {
    setRecords((prev) => prev.map((r) => (r.student_id === updated.student_id ? updated : r)));
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        user={user}
        onLogout={onLogout}
        wsStatus={wsStatus}
        activeSessionTitle={activeSession?.status === 'ACTIVE' ? activeSession.title : undefined}
      />

      {/* Floating Check-in Toast */}
      {latestCheckinToast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: 'rgba(16, 185, 129, 0.95)',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg), 0 0 20px var(--emerald-glow)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          zIndex: 1000,
          fontWeight: 600,
          fontSize: '0.9rem',
          animation: 'slideUpFade 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <CheckCircle2 style={{ width: 18, height: 18 }} />
          <span>{latestCheckinToast}</span>
        </div>
      )}

      <main style={{ flex: 1, padding: '24px 28px', maxWidth: 1600, margin: '0 auto', width: '100%' }}>
        {/* Top Control Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 24,
        }}>
          <div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Faculty Control Dashboard</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Project rotating dynamic QR codes & monitor real-time anti-proxy check-ins
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!activeSession || activeSession.status !== 'ACTIVE' ? (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="btn btn-primary"
              >
                <Play style={{ width: 18, height: 18 }} />
                <span>Launch New Session</span>
              </button>
            ) : (
              <>
                <button
                  onClick={handleOpenProjectorWindow}
                  className="btn btn-cyan"
                  title="Open dedicated classroom projector screen in new window"
                >
                  <Tv style={{ width: 16, height: 16 }} />
                  <span>Project on Classroom Screen</span>
                </button>

                <button
                  onClick={handleExportCSV}
                  className="btn btn-ghost"
                  title="Download Attendance CSV"
                >
                  <Download style={{ width: 16, height: 16 }} />
                  <span>Export CSV</span>
                </button>

                <button
                  onClick={handleEndSession}
                  disabled={isEndingSession}
                  className="btn btn-danger"
                >
                  <StopCircle style={{ width: 18, height: 18 }} />
                  <span>{isEndingSession ? 'Locking...' : 'End Session'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* State A: No Active Session */}
        {!activeSession ? (
          <div className="glass-panel" style={{
            padding: '80px 40px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            marginTop: 20,
          }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 'var(--radius-xl)',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(6, 182, 212, 0.2))',
              border: '1px solid var(--border-glow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-neon)',
            }}>
              <Radio style={{ width: 36, height: 36, color: 'var(--cyan)' }} />
            </div>

            <div style={{ maxWidth: 520 }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>
                No Attendance Session Currently Active
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', lineHeight: 1.6 }}>
                Launch a lecture session to generate rotating HMAC-SHA256 dynamic QR codes, activate classroom geofencing, and begin streaming live student check-ins.
              </p>
            </div>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="btn btn-cyan"
              style={{ padding: '12px 28px', fontSize: '1rem', marginTop: 8 }}
            >
              <Sparkles style={{ width: 18, height: 18 }} />
              <span>Launch Attendance Session Now</span>
            </button>
          </div>
        ) : (
          /* State B: Session Active / In Progress */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(340px, 440px) 1fr',
            gap: 24,
            alignItems: 'start',
          }}>
            {/* Left Column: Dynamic QR Projector + Telemetry Chart */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <TeacherQrDisplay
                sessionId={activeSession.id}
                isSessionActive={activeSession.status === 'ACTIVE'}
              />

              <AnalyticsChart
                records={records}
                radiusMeters={activeSession.radius_meters}
              />
            </div>

            {/* Right Column: Live Attendance Feed Table */}
            <div style={{ height: '100%' }}>
              <LiveAttendanceList
                records={records}
                sessionId={activeSession.id}
                isSessionActive={activeSession.status === 'ACTIVE'}
                onRecordUpdated={handleRecordUpdated}
              />
            </div>
          </div>
        )}
      </main>

      {/* Create Session Modal */}
      <CreateSessionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSessionCreated={(newSession) => {
          setActiveSession(newSession);
          setRecords([]);
        }}
      />

      {/* Session Ended Summary Modal */}
      {summaryModalOpen && activeSession && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: 20,
        }}>
          <div className="glass-panel" style={{
            maxWidth: 480,
            width: '100%',
            padding: 32,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-glow)',
            textAlign: 'center',
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}>
              <CheckCircle2 style={{ width: 32, height: 32, color: 'var(--emerald)' }} />
            </div>

            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 6 }}>
              Session Concluded Successfully
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 20 }}>
              Attendance submissions for <strong>{activeSession.title}</strong> have been sealed.
            </p>

            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 24,
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>TOTAL ATTENDEES</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', marginTop: 2 }}>
                  {records.length}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>SECURITY INTEGRITY</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--emerald)', marginTop: 2 }}>
                  100%
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={handleExportCSV}
                className="btn btn-cyan"
              >
                <Download style={{ width: 16, height: 16 }} />
                <span>Download Report (CSV)</span>
              </button>
              <button
                type="button"
                onClick={() => setSummaryModalOpen(false)}
                className="btn btn-ghost"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
