import type { User, AuthTokens, ClassSession, QRPayload, AttendanceRecord, Course } from '../types';

const API_BASE = '/api/v1';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('qr_access_token');
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('qr_access_token', token);
    } else {
      localStorage.removeItem('qr_access_token');
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.setToken(null);
      localStorage.removeItem('qr_user');
      window.dispatchEvent(new Event('auth:unauthorized'));
    }

    if (!response.ok) {
      let errorMessage = 'An error occurred';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.error?.message || response.statusText;
      } catch {
        errorMessage = response.statusText;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Auth Endpoints
  public async login(email: string, password: string): Promise<AuthTokens & { user: User }> {
    const tokens = await this.request<AuthTokens>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.setToken(tokens.access_token);
    const user = await this.getCurrentUser();
    localStorage.setItem('qr_user', JSON.stringify(user));
    return { ...tokens, user };
  }

  public async getCurrentUser(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  public logout() {
    this.setToken(null);
    localStorage.removeItem('qr_user');
  }

  // Course Endpoints
  public async getCourses(): Promise<Course[]> {
    return this.request<Course[]>('/courses');
  }

  // Session Endpoints
  public async createSession(data: {
    course_id: string;
    title: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
  }): Promise<ClassSession> {
    return this.request<ClassSession>('/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async getSessionQR(sessionId: string): Promise<QRPayload> {
    return this.request<QRPayload>(`/sessions/${sessionId}/qr`);
  }

  public async endSession(sessionId: string): Promise<ClassSession> {
    return this.request<ClassSession>(`/sessions/${sessionId}/end`, {
      method: 'POST',
    });
  }

  // Attendance Endpoints
  public async getSessionAttendance(sessionId: string): Promise<AttendanceRecord[]> {
    return this.request<AttendanceRecord[]>(`/attendance/session/${sessionId}`);
  }

  public async overrideAttendance(data: {
    session_id: string;
    student_id: string;
    status: string;
    reason: string;
  }): Promise<AttendanceRecord> {
    return this.request<AttendanceRecord>('/attendance/override', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Admin Governance Endpoints
  public async getAdminUsers(role?: string): Promise<User[]> {
    const query = role && role !== 'ALL' ? `?role=${role}` : '';
    return this.request<User[]>(`/auth/admin/users${query}`);
  }

  public async getAdminAuditLogs(): Promise<any[]> {
    return this.request<any[]>('/auth/admin/audit-logs');
  }

  public async resetUserDevice(userId: string): Promise<User> {
    return this.request<User>(`/auth/admin/users/${userId}/reset-device`, {
      method: 'POST',
    });
  }
}

export const api = new ApiClient();
