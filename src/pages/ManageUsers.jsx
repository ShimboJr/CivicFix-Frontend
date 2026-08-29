import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AdminLayout from '../components/AdminLayout';

const ROLES = ['resident', 'staff', 'admin'];

const ROLE_COLOR = {
  resident: { bg: '#dbeafe', color: '#1e40af' },
  staff:    { bg: '#ede9fe', color: '#5b21b6' },
  admin:    { bg: '#fee2e2', color: '#991b1b' },
};

export default function ManageUsers() {
  const { user: me }    = useAuth();
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [actionError, setActionError] = useState('');
  const [deletingId,  setDeletingId]  = useState(null);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    api.get('/admin/users')
      .then(({ data }) => setUsers(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleRoleChange = async (userId, newRole) => {
    setActionError('');
    try {
      await api.patch(`/admin/users/${userId}/role`, { role: newRole });
      setUsers((prev) => prev.map((u) => u._id === userId ? { ...u, role: newRole } : u));
    } catch (err) { setActionError(err.message); }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Delete this user? This cannot be undone.')) return;
    setActionError('');
    try {
      await api.delete(`/admin/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u._id !== userId));
    } catch (err) { setActionError(err.message); }
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const Th = ({ children }) => (
    <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--cf-bg)', borderBottom: '1px solid var(--cf-border)', whiteSpace: 'nowrap' }}>
      {children}
    </th>
  );
  const Td = ({ children, style }) => (
    <td style={{ padding: '0.75rem 0.85rem', fontSize: '0.8375rem', borderBottom: '1px solid var(--cf-border-light)', verticalAlign: 'middle', ...style }}>
      {children}
    </td>
  );

  return (
    <AdminLayout title="Manage Users">

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 300 }}>
          <i className="bi bi-search" style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--cf-text-muted)', fontSize: '0.85rem' }}></i>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…" className="cf-input" style={{ paddingLeft: '2.1rem', height: 36, fontSize: '0.85rem' }} />
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--cf-text-muted)' }}>
          {filtered.length} user{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {(error || actionError) && (
        <div className="cf-alert cf-alert-error" style={{ marginBottom: '1rem' }}>
          <i className="bi bi-exclamation-circle-fill"></i> {error || actionError}
        </div>
      )}

      <div className="cf-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Location</Th>
                <Th>Joined</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center' }}>
                  <div className="cf-spinner" style={{ margin: '0 auto' }}></div>
                </td></tr>
              ) : filtered.map((u) => (
                <tr key={u._id}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--cf-bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: ROLE_COLOR[u.role]?.bg || 'var(--cf-primary-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: ROLE_COLOR[u.role]?.color || 'var(--cf-primary)',
                        fontWeight: 700, fontSize: '0.78rem', flexShrink: 0,
                      }}>
                        {u.name?.[0]?.toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 500 }}>{u.name}</span>
                      {u._id === me?._id && (
                        <span style={{ fontSize: '0.65rem', background: 'var(--cf-primary-light)', color: 'var(--cf-primary)', borderRadius: 999, padding: '0.1rem 0.45rem', fontWeight: 600 }}>You</span>
                      )}
                    </div>
                  </Td>
                  <Td style={{ color: 'var(--cf-text-secondary)', fontSize: '0.82rem' }}>{u.email}</Td>
                  <Td>
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u._id, e.target.value)}
                      disabled={u._id === me?._id}
                      style={{
                        border: `1px solid ${ROLE_COLOR[u.role]?.bg || 'var(--cf-border)'}`,
                        background: ROLE_COLOR[u.role]?.bg,
                        color:      ROLE_COLOR[u.role]?.color,
                        borderRadius: 999, padding: '0.2rem 0.7rem',
                        fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  </Td>
                  <Td style={{ color: 'var(--cf-text-secondary)', fontSize: '0.82rem' }}>{u.location || '—'}</Td>
                  <Td style={{ color: 'var(--cf-text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {new Date(u.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Td>
                  <Td>
                    <button
                      onClick={() => handleDelete(u._id)}
                      disabled={u._id === me?._id}
                      title={u._id === me?._id ? 'Cannot delete yourself' : 'Delete user'}
                      style={{
                        padding: '0.3rem 0.55rem', border: '1px solid #fee2e2', borderRadius: 6,
                        background: 'transparent', cursor: u._id === me?._id ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem', color: u._id === me?._id ? 'var(--cf-text-muted)' : '#ef4444',
                        opacity: u._id === me?._id ? 0.4 : 1,
                      }}>
                      <i className="bi bi-trash"></i>
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
