import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * AssignIssueModal
 * Props:
 *  - issue     {object}    — the issue being assigned
 *  - onClose   {function}  — close without action
 *  - onAssigned {function} — called after a successful assignment
 */
export default function AssignIssueModal({ issue, onClose, onAssigned }) {
  const [staffList,  setStaffList]  = useState([]);
  const [selected,   setSelected]   = useState('');
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  // Fetch all users then filter staff client-side to avoid a new endpoint
  useEffect(() => {
    api.get('/admin/users')
      .then(({ data }) => setStaffList(data.filter((u) => u.role === 'staff')))
      .catch(() => setError('Could not load staff list.'))
      .finally(() => setLoading(false));
  }, []);

  const handleAssign = async () => {
    if (!selected) return;
    setSubmitting(true); setError('');
    try {
      await api.patch(`/admin/issues/${issue._id}/assign`, { staffId: selected });
      onAssigned();
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div className="cf-card" style={{ width: '100%', maxWidth: 440 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
            <i className="bi bi-person-check me-2" style={{ color: 'var(--cf-primary)' }}></i>
            Assign Issue
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--cf-text-muted)', lineHeight: 1 }}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Issue summary */}
        <div style={{ background: 'var(--cf-bg)', borderRadius: 'var(--cf-radius-md)', padding: '0.7rem 0.9rem', marginBottom: '1.1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--cf-primary)', marginBottom: '0.25rem' }}>
            {issue.issueId}
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.4 }}>{issue.title}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--cf-text-muted)', marginTop: '0.25rem' }}>
            <i className="bi bi-geo-alt me-1"></i>{issue.location?.address}
          </div>
        </div>

        {error && (
          <div className="cf-alert cf-alert-error" style={{ marginBottom: '1rem' }}>
            <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }}></i> {error}
          </div>
        )}

        {/* Staff picker */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label className="cf-form-label">Assign to staff member</label>
          {loading ? (
            <div style={{ color: 'var(--cf-text-muted)', fontSize: '0.875rem', padding: '0.5rem 0' }}>Loading staff…</div>
          ) : staffList.length === 0 ? (
            <div className="cf-alert cf-alert-error">No staff members found. Promote a user to staff first.</div>
          ) : (
            <select value={selected} onChange={(e) => setSelected(e.target.value)} className="cf-input" style={{ cursor: 'pointer' }}>
              <option value="">Select a staff member…</option>
              {staffList.map((u) => (
                <option key={u._id} value={u._id}>{u.name} — {u.email}</option>
              ))}
            </select>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleAssign}
            disabled={!selected || submitting || loading}
            className="cf-btn cf-btn-primary"
            style={{ flex: 1 }}
          >
            {submitting ? 'Assigning…' : <><i className="bi bi-person-check"></i> Assign</>}
          </button>
          <button onClick={onClose} className="cf-btn cf-btn-outline" style={{ flex: 1 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
