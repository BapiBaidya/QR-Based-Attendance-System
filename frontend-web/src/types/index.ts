export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

export interface User {
  id: string;
  email: string;
  institution_id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  device_id?: string | null;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface ClassSession {
  id: string;
  course_id: string;
  teacher_id: string;
  title: string;
  status: SessionStatus;
  latitude: number;
  longitude: number;
  radius_meters: number;
  started_at: string;
  ended_at?: string | null;
}

export interface QRPayload {
  sid: string;
  ts: number;
  nonce: string;
  sig: string;
  expires_in_seconds: number;
}

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'MANUAL_OVERRIDE' | 'ABSENT';

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  institution_id: string;
  status: AttendanceStatus;
  distance_meters: number | null;
  marked_at: string;
  device_id?: string | null;
  verified?: boolean;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  teacher_id?: string;
  department_id?: string;
}

// WebSocket Envelope & Event Types
export interface WSEnvelope<T = any> {
  event: 'session.connected' | 'attendance.marked' | 'session.ended' | 'error' | 'ping' | 'pong';
  session_id: string;
  data: T;
  ts: string;
}

export interface AttendanceMarkedPayload {
  record_id: string;
  student_id: string;
  student_name: string;
  institution_id: string;
  status: AttendanceStatus;
  distance_meters: number | null;
  marked_at: string;
}

export interface SessionEndedPayload {
  session_id: string;
  ended_at: string;
  total_attendees: number;
}

export interface ConnectionAckPayload {
  session_id: string;
  message: string;
  subscribed_as: string;
}
