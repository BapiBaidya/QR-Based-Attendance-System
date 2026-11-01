import React, { useState } from 'react';
import type { AttendanceRecord } from '../types';
import { api } from '../api/client';
import { 
  Users, 
  Search, 
  MapPin, 
  CheckCircle2, 
  Clock, 
  Smartphone, 
  Edit3, 
  Check,
  X,
  AlertCircle
} from 'lucide-react';

interface LiveAttendanceListProps {
  records: AttendanceRecord[];
  sessionId: string;
  isSessionActive: boolean;
  onRecordUpdated?: (updated: AttendanceRecord) => void;
}

export const LiveAttendanceList: React.FC<LiveAttendanceListProps> = ({
  records,
  sessionId,
  isSessionActive,
  onRecordUpdated,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  
  // Manual Override Modal State
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const filteredRecords = records.filter((rec) => {
    const matchesSearch = 
      rec.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.institution_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'ALL' || rec.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const handleOpenOverride = (record: AttendanceRecord) => {
    setSelectedRecord(record);
    setOverrideReason('');
    setOverrideError(null);
    setOverrideModalOpen(true);
  };

  const handleSaveOverride = async () => {
    if (!selectedRecord || !overrideReason.trim()) {
      setOverrideError('Please provide an audit reason for manual override.');
      return;
    }

    setIsSubmittingOverride(true);
    setOverrideError(null);

    try {
      const updated = await api.overrideAttendance({
        session_id: sessionId,
        student_id: selectedRecord.student_id,
        status: 'MANUAL_OVERRIDE',
        reason: overrideReason.trim(),
      });

      if (onRecordUpdated) {
        onRecordUpdated({
          ...selectedRecord,
          status: updated.status,
        });
      }
      setOverrideModalOpen(false);
    } catch (err: any) {
      setOverrideError(err.message || 'Failed to submit override');
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  const formatDistance = (meters: number | null) => {
    if (meters === null || meters === undefined) return 'GPS Verified';
    if (meters < 10) return `${meters.toFixed(1)}m (Center)`;
    return `${meters.toFixed(1)}m`;
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header and Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 14,
        marginBottom: 20,
        borderBottom: '1px solid var(--border-subtle)',
        paddingBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Users style={{ width: 22, height: 22, color: 'var(--primary-light)' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Live Check-in Stream</h3>
              <span className="badge badge-emerald" style={{ fontSize: '0.75rem' }}>
                {records.length} Present
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Sub-second live WebSocket ingestion & hardware verification
            </p>
          </div>
        </div>

        {/* Search & Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 220 }}>
            <Search style={{
              width: 16,
              height: 16,
              color: 'var(--text-subtle)',
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
            }} />
            <input
              type="text"
              placeholder="Search student or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field"
              style={{ paddingLeft: 36, paddingRight: 12, fontSize: '0.85rem', height: 38 }}
            />
          </div>

          <div style={{ position: 'relative' }}>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field"
              style={{
                height: 38,
                fontSize: '0.85rem',
                padding: '0 12px',
                width: 140,
                cursor: 'pointer',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="MANUAL_OVERRIDE">Override</option>
            </select>
          </div>
        </div>
      </div>

      {/* Real-time Records List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxHeight: 520,
        paddingRight: 6,
      }}>
        {filteredRecords.length === 0 ? (
          <div style={{
            padding: '48px 20px',
            textAlign: 'center',
            color: 'var(--text-subtle)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}>
            <Clock style={{ width: 36, height: 36, opacity: 0.4 }} />
            <div>
              <p style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                {searchQuery ? 'No matching check-ins found' : 'Waiting for student scans...'}
              </p>
              <p style={{ fontSize: '0.8rem', marginTop: 4 }}>
                {isSessionActive 
                  ? 'Project the dynamic QR code above. Verified check-ins will appear instantly.'
                  : 'Session is currently closed.'}
              </p>
            </div>
          </div>
        ) : (
          filteredRecords.map((record, index) => (
            <div
              key={record.id || `${record.student_id}-${index}`}
              className="animate-fade-in"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Student info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(6, 182, 212, 0.2))',
                  border: '1px solid var(--border-glow)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  color: 'var(--cyan)',
                }}>
                  {record.student_name.charAt(0)}
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      {record.student_name}
                    </span>
                    {record.status === 'MANUAL_OVERRIDE' ? (
                      <span className="badge badge-amber" style={{ fontSize: '0.65rem' }}>
                        Override
                      </span>
                    ) : (
                      <span className="badge badge-emerald" style={{ fontSize: '0.65rem' }}>
                        <CheckCircle2 style={{ width: 10, height: 10 }} /> Verified
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', marginTop: 2 }}>
                    ID: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{record.institution_id}</span>
                  </div>
                </div>
              </div>

              {/* Telemetry: Distance, Device, Timestamp */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                {/* Distance Badge */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.8rem',
                  color: 'var(--cyan)',
                  background: 'rgba(6, 182, 212, 0.08)',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                }}>
                  <MapPin style={{ width: 12, height: 12 }} />
                  <span>{formatDistance(record.distance_meters)}</span>
                </div>

                {/* Device Bound indicator */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                }} title="Hardware UUID verified on device">
                  <Smartphone style={{ width: 14, height: 14, color: 'var(--primary-light)' }} />
                  <span style={{ fontSize: '0.75rem' }}>Bound Phone</span>
                </div>

                {/* Timestamp */}
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  color: 'var(--text-subtle)',
                  minWidth: 70,
                  textAlign: 'right',
                }}>
                  {formatTime(record.marked_at)}
                </div>

                {/* Manual Override action button */}
                {isSessionActive && (
                  <button
                    onClick={() => handleOpenOverride(record)}
                    className="btn btn-ghost"
                    style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                    title="Audit / Manual Override"
                  >
                    <Edit3 style={{ width: 14, height: 14 }} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Manual Override Dialog */}
      {overrideModalOpen && selectedRecord && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
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
            padding: 28,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-glow)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Edit3 style={{ width: 22, height: 22, color: 'var(--amber)' }} />
                <h4 style={{ fontSize: '1.15rem' }}>Manual Attendance Override</h4>
              </div>
              <button onClick={() => setOverrideModalOpen(false)} className="btn btn-ghost" style={{ padding: 6 }}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              You are manually adjusting attendance for <strong style={{ color: '#ffffff' }}>{selectedRecord.student_name}</strong> ({selectedRecord.institution_id}). All overrides are recorded in the immutable system audit trail.
            </p>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-subtle)', marginBottom: 6 }}>
                REASON FOR OVERRIDE (REQUIRED AUDIT COMPLIANCE)
              </label>
              <textarea
                rows={3}
                className="input-field"
                placeholder="e.g. Student experienced temporary GPS drift inside classroom; verified present."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>

            {overrideError && (
              <div style={{
                background: 'rgba(244, 63, 94, 0.15)',
                color: '#fda4af',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <AlertCircle style={{ width: 16, height: 16 }} />
                <span>{overrideError}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setOverrideModalOpen(false)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveOverride}
                disabled={isSubmittingOverride}
                className="btn btn-primary"
              >
                <Check style={{ width: 16, height: 16 }} />
                <span>{isSubmittingOverride ? 'Saving...' : 'Confirm Override'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
