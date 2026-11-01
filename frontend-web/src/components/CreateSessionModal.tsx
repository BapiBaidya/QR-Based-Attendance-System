import React, { useState, useEffect } from 'react';
import type { ClassSession, Course } from '../types';
import { api } from '../api/client';
import { Play, X, Navigation, AlertCircle, BookOpen, MapPin, Compass } from 'lucide-react';

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionCreated: (session: ClassSession) => void;
}

export const CreateSessionModal: React.FC<CreateSessionModalProps> = ({
  isOpen,
  onClose,
  onSessionCreated,
}) => {
  const [title, setTitle] = useState('CS401: Distributed Systems — Attendance');
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string>('');
  const [latitude, setLatitude] = useState<number>(28.6139);
  const [longitude, setLongitude] = useState<number>(77.2090);
  const [radiusMeters, setRadiusMeters] = useState<number>(50);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch teacher's assigned courses when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchCourses = async () => {
      setIsLoadingCourses(true);
      setError(null);
      try {
        const data = await api.getCourses();
        setCourses(data);
        if (data.length > 0 && !courseId) {
          setCourseId(data[0].id);
        }
      } catch (err: any) {
        console.error('Failed to load courses:', err);
        setError('Could not load assigned courses.');
      } finally {
        setIsLoadingCourses(false);
      }
    };

    fetchCourses();
  }, [isOpen]);

  if (!isOpen) return null;

  // Detect GPS coordinates via browser Navigator Geolocation API
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setIsDetectingLocation(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(parseFloat(pos.coords.latitude.toFixed(6)));
        setLongitude(parseFloat(pos.coords.longitude.toFixed(6)));
        setIsDetectingLocation(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setError('Could not retrieve current location. Using default classroom coordinates.');
        setIsDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId) {
      setError('Please select an assigned course for this lecture.');
      return;
    }
    if (!title.trim()) {
      setError('Lecture title is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const newSession = await api.createSession({
        course_id: courseId,
        title: title.trim(),
        latitude,
        longitude,
        radius_meters: radiusMeters,
      });

      onSessionCreated(newSession);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create attendance session');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(2, 4, 10, 0.85)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: 20,
    }}>
      <div className="glass-panel card-3d" style={{
        maxWidth: 600,
        width: '100%',
        padding: 34,
        background: 'linear-gradient(145deg, rgba(16, 24, 44, 0.95), rgba(8, 12, 24, 0.98))',
        border: '1px solid rgba(0, 242, 254, 0.3)',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 35px rgba(0, 242, 254, 0.15)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--cyan), var(--primary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px var(--cyan-glow)',
            }}>
              <Compass style={{ width: 24, height: 24, color: '#05070d' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                Launch Attendance Session
              </h3>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                Configure classroom geofencing and dynamic rotating HMAC-SHA256 QR
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: 6, borderRadius: '50%' }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            color: '#fda4af',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <AlertCircle style={{ width: 16, height: 16 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Course Selection */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-cyber)', marginBottom: 6, fontWeight: 700, letterSpacing: '0.04em' }}>
              <BookOpen style={{ width: 14, height: 14 }} />
              <span>ACADEMIC COURSE</span>
            </label>
            {isLoadingCourses ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading assigned courses...</div>
            ) : courses.length === 0 ? (
              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                color: '#fbbf24',
                fontSize: '0.825rem',
              }}>
                No courses assigned to your faculty profile. Please contact an Administrator.
              </div>
            ) : (
              <select
                className="input-field"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                required
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Session Title */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-cyber)', marginBottom: 6, fontWeight: 700, letterSpacing: '0.04em' }}>
              LECTURE / SESSION TITLE
            </label>
            <input
              type="text"
              className="input-field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. CS401: Distributed Systems Lecture 08"
              required
            />
          </div>

          {/* 3D Classroom Geolocation HUD Card */}
          <div style={{
            background: 'rgba(6, 12, 26, 0.7)',
            border: '1px solid rgba(0, 242, 254, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin style={{ width: 15, height: 15, color: 'var(--cyan)' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '0.04em' }}>
                  CLASSROOM GEOLOCATION & ANTI-PROXY RADAR
                </span>
              </div>
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={isDetectingLocation}
                className="btn btn-ghost"
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  height: 28,
                  color: 'var(--cyan)',
                  border: '1px solid rgba(0, 242, 254, 0.35)',
                  background: 'rgba(0, 242, 254, 0.08)',
                }}
              >
                <Navigation style={{ width: 12, height: 12 }} />
                <span>{isDetectingLocation ? 'Pinging GPS...' : 'Auto-Detect Classroom GPS'}</span>
              </button>
            </div>

            {/* Geolocation Explanation Pill */}
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              lineHeight: 1.4,
              marginBottom: 14,
              background: 'rgba(255, 255, 255, 0.02)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              borderLeft: '3px solid var(--cyan)',
            }}>
              <strong>What is this?</strong> Classroom Latitude & Longitude define the physical location of the room. When students scan the QR code, the system calculates their physical distance. Anyone attempting to scan from outside the classroom perimeter is instantly blocked.
            </div>

            {/* Coordinates Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-subtle)', marginBottom: 4 }}>
                  LATITUDE (NORTH/SOUTH)
                </label>
                <input
                  type="number"
                  step="any"
                  className="input-field"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
                  placeholder="Latitude"
                  value={latitude}
                  onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-subtle)', marginBottom: 4 }}>
                  LONGITUDE (EAST/WEST)
                </label>
                <input
                  type="number"
                  step="any"
                  className="input-field"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
                  placeholder="Longitude"
                  value={longitude}
                  onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>
            </div>

            {/* Radius Slider with Visual Geofence Tag */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', fontWeight: 600 }}>
                  ALLOWED GEOFENCE RADIUS
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--cyan)', fontWeight: 700 }}>
                  {radiusMeters} METERS
                </span>
              </div>
              <input
                type="range"
                min={15}
                max={150}
                step={5}
                value={radiusMeters}
                onChange={(e) => setRadiusMeters(parseInt(e.target.value, 10))}
                style={{ width: '100%', accentColor: 'var(--cyan)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-subtle)', marginTop: 4 }}>
                <span>15m (Lab / Seminar)</span>
                <span>50m (Auditorium / Hall)</span>
                <span>150m (Campus Wing)</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 6 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || courses.length === 0}
              className="btn btn-cyan"
              style={{ padding: '12px 24px' }}
            >
              <Play style={{ width: 16, height: 16 }} />
              <span>{isSubmitting ? 'Initializing Vault...' : 'Launch Session & Project QR'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
