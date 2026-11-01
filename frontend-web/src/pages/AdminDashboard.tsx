import { useState, useEffect } from 'react';
import type { User } from '../types';
import { api } from '../api/client';
import { Navbar } from '../components/Navbar';
import { 
  ShieldCheck, 
  Users, 
  Smartphone, 
  RotateCcw, 
  FileText, 
  Search, 
  CheckCircle2, 
  Info
} from 'lucide-react';

interface AdminDashboardProps {
  user: User;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'USERS' | 'AUDIT'>('USERS');
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load users or audit logs
  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'USERS') {
        const data = await api.getAdminUsers(roleFilter);
        setUsers(data);
      } else {
        const logs = await api.getAdminAuditLogs();
        setAuditLogs(logs);
      }
    } catch (err: any) {
      console.error('Failed to fetch admin data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, roleFilter]);

  // Handle resetting a student's bound device
  const handleResetDevice = async (targetUser: User) => {
    if (!window.confirm(`Are you sure you want to reset the bound hardware device for ${targetUser.full_name} (${targetUser.institution_id})? This will unbind their phone and allow them to register a new device.`)) {
      return;
    }

    try {
      await api.resetUserDevice(targetUser.id);
      setToastMessage(`Device binding reset successfully for ${targetUser.full_name}. An immutable audit log entry was created.`);
      fetchData();
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      alert(`Failed to reset device: ${err.message}`);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.institution_id.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        user={user}
        onLogout={onLogout}
        wsStatus="CONNECTED"
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
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
          <span>{toastMessage}</span>
        </div>
      )}

      <main style={{ flex: 1, padding: '28px', maxWidth: 1600, margin: '0 auto', width: '100%' }}>
        {/* Header & Role Info Banner */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Administrator Governance Hub</h2>
                <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>
                  <ShieldCheck style={{ width: 12, height: 12 }} /> System Authority
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
                Platform identity governance, hardware UUID binding resets, and compliance audit trail
              </p>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: 8, background: 'var(--bg-glass)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setActiveTab('USERS')}
                className={`btn ${activeTab === 'USERS' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                <Users style={{ width: 16, height: 16 }} />
                <span>Users & Device Locks</span>
              </button>

              <button
                onClick={() => setActiveTab('AUDIT')}
                className={`btn ${activeTab === 'AUDIT' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                <FileText style={{ width: 16, height: 16 }} />
                <span>Security Audit Logs</span>
              </button>
            </div>
          </div>

          {/* Role Separation Notice */}
          <div style={{
            marginTop: 18,
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid var(--border-glow)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: '0.85rem',
            color: 'var(--primary-light)',
          }}>
            <Info style={{ width: 18, height: 18, flexShrink: 0 }} />
            <span>
              <strong>RBAC Policy Active:</strong> Administrators govern system compliance, users, and device resets. Attendance sessions are launched exclusively by assigned course teachers.
            </span>
          </div>
        </div>

        {/* Tab 1: Users & Device Binding Management */}
        {activeTab === 'USERS' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            {/* Search & Filter Bar */}
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
              <div style={{ position: 'relative', width: 280 }}>
                <Search style={{ width: 16, height: 16, color: 'var(--text-subtle)', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search by name, email, roll ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: 36, fontSize: '0.85rem', height: 38 }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>Role Filter:</span>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="input-field"
                  style={{ width: 140, height: 38, fontSize: '0.85rem' }}
                >
                  <option value="ALL">All Roles</option>
                  <option value="STUDENT">Students Only</option>
                  <option value="TEACHER">Faculty Only</option>
                  <option value="ADMIN">Admins Only</option>
                </select>
              </div>
            </div>

            {/* Users Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-subtle)', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.78rem' }}>
                    <th style={{ padding: '12px 14px' }}>USER</th>
                    <th style={{ padding: '12px 14px' }}>ROLE</th>
                    <th style={{ padding: '12px 14px' }}>INSTITUTION ID</th>
                    <th style={{ padding: '12px 14px' }}>BOUND DEVICE UUID</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background 0.2s ease' }}>
                      <td style={{ padding: '14px' }}>
                        <div style={{ fontWeight: 600, color: '#ffffff' }}>{u.full_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{u.email}</div>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <span className={`badge ${u.role === 'ADMIN' ? 'badge-purple' : u.role === 'TEACHER' ? 'badge-cyan' : 'badge-emerald'}`} style={{ fontSize: '0.68rem' }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: '14px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {u.institution_id}
                      </td>
                      <td style={{ padding: '14px' }}>
                        {u.device_id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--emerald)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                            <Smartphone style={{ width: 14, height: 14 }} />
                            <span>{u.device_id.slice(0, 18)}...</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-subtle)', fontSize: '0.78rem' }}>No device bound</span>
                        )}
                      </td>
                      <td style={{ padding: '14px', textAlign: 'right' }}>
                        {u.role === 'STUDENT' && u.device_id && (
                          <button
                            onClick={() => handleResetDevice(u)}
                            className="btn btn-ghost"
                            style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--rose)' }}
                            title="Reset bound device for student"
                          >
                            <RotateCcw style={{ width: 14, height: 14 }} />
                            <span>Reset Device</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredUsers.length === 0 && !isLoading && (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-subtle)' }}>
                  No users found matching your search.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Security Audit Logs */}
        {activeTab === 'AUDIT' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ marginBottom: 18, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 14 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Immutable System Audit Trail</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                All sensitive operations (manual overrides, device unbinding, logins) are cryptographically stored with actor IDs
              </p>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-subtle)', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.78rem' }}>
                    <th style={{ padding: '12px 14px' }}>EVENT / ACTION</th>
                    <th style={{ padding: '12px 14px' }}>ACTOR ID</th>
                    <th style={{ padding: '12px 14px' }}>RESOURCE</th>
                    <th style={{ padding: '12px 14px' }}>AUDIT PAYLOAD DETAILS</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>TIMESTAMP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '14px' }}>
                        <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '14px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {log.actor_id ? `${log.actor_id.slice(0, 8)}...` : 'System'}
                      </td>
                      <td style={{ padding: '14px', color: 'var(--cyan)', fontSize: '0.8rem' }}>
                        {log.resource_type}
                      </td>
                      <td style={{ padding: '14px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {JSON.stringify(log.payload)}
                      </td>
                      <td style={{ padding: '14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {auditLogs.length === 0 && !isLoading && (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-subtle)' }}>
                  No audit logs recorded yet.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
