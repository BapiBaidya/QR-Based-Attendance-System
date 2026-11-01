import { useState, useEffect } from 'react';
import type { User } from './types';
import { api } from './api/client';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { ProjectorScreen } from './pages/ProjectorScreen';

export function App() {
  // Check if current URL is the dedicated classroom projector screen
  const isProjectorRoute = window.location.pathname.startsWith('/projector');

  if (isProjectorRoute) {
    return <ProjectorScreen />;
  }

  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Check stored user on load
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = api.getToken();
      const storedUser = localStorage.getItem('qr_user');

      if (storedToken && storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          setUser(parsed);
          // Refresh user profile in background
          const freshUser = await api.getCurrentUser();
          setUser(freshUser);
          localStorage.setItem('qr_user', JSON.stringify(freshUser));
        } catch (err) {
          console.warn('Session expired or invalid:', err);
          api.logout();
          setUser(null);
        }
      }
      setIsInitializing(false);
    };

    checkAuth();

    // Listen for unauthorized events from api client
    const handleUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const handleLogout = () => {
    api.logout();
    setUser(null);
  };

  if (isInitializing) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-darkest)',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-display)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="pulse-dot" style={{ color: 'var(--cyan)' }} />
          <span>Initializing AegisQR Security Hub...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />;
  }

  // Role-Based Views:
  // - ADMIN gets the Governance & Security Audit Hub
  // - TEACHER gets the Faculty Lecture & Dynamic QR Projection Console
  // - STUDENT gets guidance on using the mobile app
  if (user.role === 'ADMIN') {
    return <AdminDashboard user={user} onLogout={handleLogout} />;
  }

  if (user.role === 'TEACHER') {
    return <Dashboard user={user} onLogout={handleLogout} />;
  }

  // Fallback for Student logging in on web console
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div className="glass-panel" style={{ maxWidth: 440, padding: 36 }}>
        <h3 style={{ fontSize: '1.3rem', marginBottom: 8 }}>Student Portal</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 20 }}>
          Welcome, {user.full_name} ({user.institution_id}). Attendance check-ins must be completed from your registered physical mobile device using the scanner app.
        </p>
        <button onClick={handleLogout} className="btn btn-ghost">Sign Out</button>
      </div>
    </div>
  );
}

export default App;
