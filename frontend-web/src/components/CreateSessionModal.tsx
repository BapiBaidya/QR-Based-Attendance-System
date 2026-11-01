import React, { useState, useEffect } from 'react';
import type { ClassSession, Course } from '../types';
import { api } from '../api/client';
import { Play, X, Navigation, AlertCircle, Sparkles, BookOpen } from 'lucide-react';

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
  const [title, setTitle] = useState('Lecture: Dynamic Anti-Proxy Protocols');
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
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: 20,
    }}>
      <div className="glass-panel" style={{
        maxWidth: 560,
        width: '100%',
        padding: 32,
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-glow)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--primary), var(--cyan))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Sparkles style={{ width: 22, height: 22, color: '#ffffff' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Launch Attendance Session</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Configure classroom geofencing and initialize dynamic QR secrets
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: 6 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            color: '#fda4af',
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.825rem', color: 'var(--text-subtle)', marginBottom: 6, fontWeight: 600 }}>
              <BookOpen style={{ width: 14, height: 14, color: 'var(--cyan)' }} />
              <span>ASSIGNED COURSE</span>
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

          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', color: 'var(--text-subtle)', marginBottom: 6, fontWeight: 600 }}>
              SESSION / LECTURE TITLE
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

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: '0.825rem', color: 'var(--text-subtle)', fontWeight: 600 }}>
                CLASSROOM GEOLOCATION (LATITUDE / LONGITUDE)
              </label>
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={isDetectingLocation}
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: '0.75rem', height: 28, color: 'var(--cyan)' }}
              >
                <Navigation style={{ width: 12, height: 12 }} />
                <span>{isDetectingLocation ? 'Locating...' : 'Use My Current GPS'}</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <input
                  type="number"
                  step="any"
                  className="input-field"
                  placeholder="Latitude"
                  value={latitude}
                  onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>
              <div>
                <input
                  type="number"
                  step="any"
                  className="input-field"
                  placeholder="Longitude"
                  value={longitude}
                  onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Radius Slider */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: '0.825rem', color: 'var(--text-subtle)', fontWeight: 600 }}>
                GEOFENCE RADIUS (METERS)
              </label>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--cyan)', fontWeight: 700 }}>
                {radiusMeters} meters
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
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: 4 }}>
              <span>15m (Small Seminar Room)</span>
              <span>50m (Auditorium)</span>
              <span>150m (Lecture Complex)</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting || courses.length === 0} className="btn btn-primary">
              <Play style={{ width: 16, height: 16 }} />
              <span>{isSubmitting ? 'Launching...' : 'Start Session & Project QR'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
