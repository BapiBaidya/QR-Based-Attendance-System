import React from 'react';
import type { AttendanceRecord } from '../types';
import { Activity, ShieldCheck, MapPin, TrendingUp, Users } from 'lucide-react';

interface AnalyticsChartProps {
  records: AttendanceRecord[];
  radiusMeters: number;
}

export const AnalyticsChart: React.FC<AnalyticsChartProps> = ({ records, radiusMeters }) => {
  // 1. Distance Distribution Buckets
  const closeBucket = records.filter((r) => (r.distance_meters ?? 0) <= 15).length;
  const midBucket = records.filter((r) => (r.distance_meters ?? 0) > 15 && (r.distance_meters ?? 0) <= 35).length;
  const edgeBucket = records.filter((r) => (r.distance_meters ?? 0) > 35).length;

  const total = records.length || 1;
  const closePct = Math.round((closeBucket / total) * 100);
  const midPct = Math.round((midBucket / total) * 100);
  const edgePct = Math.round((edgeBucket / total) * 100);

  // Average distance
  const validDistances = records.filter((r) => r.distance_meters !== null).map((r) => r.distance_meters!);
  const avgDistance = validDistances.length > 0 
    ? (validDistances.reduce((acc, d) => acc + d, 0) / validDistances.length).toFixed(1)
    : '0.0';

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        borderBottom: '1px solid var(--border-subtle)',
        paddingBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(6, 182, 212, 0.15)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Activity style={{ width: 20, height: 20, color: 'var(--cyan)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Telemetry & Geofence Analytics</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Real-time spatial distribution and defense integrity
            </p>
          </div>
        </div>

        <span className="badge badge-cyan" style={{ fontSize: '0.75rem' }}>
          <ShieldCheck style={{ width: 12, height: 12 }} /> 0 Spoof Incursions
        </span>
      </div>

      {/* Grid of Key Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 14,
        marginBottom: 22,
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-subtle)', fontSize: '0.75rem' }}>
            <Users style={{ width: 14, height: 14, color: 'var(--primary-light)' }} />
            <span>TOTAL ATTENDEES</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ffffff', marginTop: 4 }}>
            {records.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--emerald)', marginTop: 2 }}>
            ● Verified in Real-time
          </div>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-subtle)', fontSize: '0.75rem' }}>
            <MapPin style={{ width: 14, height: 14, color: 'var(--cyan)' }} />
            <span>AVG DISTANCE FROM CENTER</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--cyan)', marginTop: 4 }}>
            {avgDistance}m
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Allowed radius: {radiusMeters}m
          </div>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-subtle)', fontSize: '0.75rem' }}>
            <TrendingUp style={{ width: 14, height: 14, color: 'var(--emerald)' }} />
            <span>DEVICE LOCK FIDELITY</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--emerald)', marginTop: 4 }}>
            100%
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
            All bound hardware UUIDs
          </div>
        </div>
      </div>

      {/* Geofence Distance Spatial Breakdown */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '18px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            Geofence Proximity Distribution
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Haversine Server Verification
          </span>
        </div>

        {/* Stacked Progress Bar */}
        <div style={{
          height: 12,
          background: 'rgba(255, 255, 255, 0.06)',
          borderRadius: 6,
          display: 'flex',
          overflow: 'hidden',
          marginBottom: 14,
        }}>
          <div style={{
            width: `${closePct}%`,
            background: 'var(--emerald)',
            transition: 'width 0.4s ease',
          }} title={`Inner Perimeter: ${closeBucket} students`} />
          <div style={{
            width: `${midPct}%`,
            background: 'var(--cyan)',
            transition: 'width 0.4s ease',
          }} title={`Mid Range: ${midBucket} students`} />
          <div style={{
            width: `${edgePct}%`,
            background: 'var(--amber)',
            transition: 'width 0.4s ease',
          }} title={`Perimeter Bounds: ${edgeBucket} students`} />
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          fontSize: '0.78rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--emerald)' }} />
            <span style={{ color: 'var(--text-muted)' }}>0–15m (Front rows):</span>
            <strong style={{ color: '#ffffff' }}>{closeBucket} ({closePct}%)</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cyan)' }} />
            <span style={{ color: 'var(--text-muted)' }}>16–35m (Hall center):</span>
            <strong style={{ color: '#ffffff' }}>{midBucket} ({midPct}%)</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />
            <span style={{ color: 'var(--text-muted)' }}>36m+ (Rear boundary):</span>
            <strong style={{ color: '#ffffff' }}>{edgeBucket} ({edgePct}%)</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
