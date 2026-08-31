import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * AssignIssueModal
 * Props:
 *  - issue      {object}    — the issue being assigned
 *  - onClose    {function}  — close without action
 *  - onAssigned {function}  — called after a successful assignment
 *
 * Staff are fetched from GET /api/admin/staff-workload, which returns them
 * sorted lightest-load-first and includes their active issue count.  That
 * ordering is preserved here — the list is NOT re-sorted by name.
 *
 * An admin CAN still assign to an overloaded staff member if they choose;
 * the badge is informational only.  Locking assignment would remove control
 * from the admin, which is the wrong trade-off.
 */

// Number of active issues at which a staff member is considered high-load.
// Surfaced as a named constant so it's easy to tune without hunting magic numbers.
const HIGH_WORKLOAD_THRESHOLD = 5;

export default function AssignIssueModal({ issue, onClose, onAssigned }) {
  const [staffList,  setStaffList]  = useState([]);
  const [selected,   setSelected]   = useState('');
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  // Fetch staff with their active issue counts, already sorted lightest-first
  useEffect(() => {
    api.get('/admin/staff-workload')
      .then(({ data }) => setStaffList(data))
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

  // ── Badge appearance ──────────────────────────────────────────────────────
  // Normal  : subtle primary-tinted pill
  // High    : amber — already loaded, admin should notice
  // Critical: red   — at or above threshold, visually distinct at a glance
  const badgeStyle = (count) => {
    const isHigh     = count >= HIGH_WORKLOAD_THRESHOLD;
    const isCritical = count >= HIGH_WORKLOAD_THRESHOLD + 2; // ≥ 7 = clearly overloaded
    return {
      display:      'inline-flex',
      alignItems:   'center',
      gap:          '0.25rem',
      fontSize:     '0.7rem',
      fontWeight:   700,
      padding:      '0.15rem 0.5rem',
      borderRadius: 999,
      whiteSpace:   'nowrap',
      flexShrink:   0,
      background:   isCritical ? '#fee2e2' : isHigh ? '#fef3c7' : 'var(--cf-primary-light)',
      color:        isCritical ? '#b91c1c' : isHigh ? '#92400e' : 'var(--cf-primary)',
    };
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1000, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '1rem',
      }}
    >
      <div className="cf-card" style={{ width: '100%', maxWidth: 460 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
            <i className="bi bi-person-check me-2" style={{ color: 'var(--cf-primary)' }}></i>
            Assign Issue
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--cf-text-muted)', lineHeight: 1 }}
          >
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
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label className="cf-form-label" style={{ margin: 0 }}>Assign to staff member</label>
            {/* Legend — only shown once data is loaded */}
            {!loading && staffList.length > 0 && (
              <span style={{ fontSize: '0.68rem', color: 'var(--cf-text-muted)' }}>
                sorted by current load ↑
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ color: 'var(--cf-text-muted)', fontSize: '0.875rem', padding: '0.5rem 0' }}>
              Loading staff…
            </div>
          ) : staffList.length === 0 ? (
            <div className="cf-alert cf-alert-error">No staff members found. Promote a user to staff first.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: 260, overflowY: 'auto' }}>
              {staffList.map((u) => {
                const isSelected = selected === u._id;
                const isHighLoad = u.activeCount >= HIGH_WORKLOAD_THRESHOLD;
                return (
                  <button
                    key={u._id}
                    type="button"
                    onClick={() => setSelected(u._id)}
                    style={{
                      display:        'flex',
                      alignItems:     'center',
                      gap:            '0.65rem',
                      width:          '100%',
                      padding:        '0.6rem 0.8rem',
                      borderRadius:   'var(--cf-radius-md)',
                      border:         `2px solid ${isSelected ? 'var(--cf-primary)' : 'var(--cf-border)'}`,
                      background:     isSelected ? 'var(--cf-primary-light)' : 'var(--cf-bg)',
                      cursor:         'pointer',
                      textAlign:      'left',
                      transition:     'border-color 120ms, background 120ms',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.borderColor = 'var(--cf-primary)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.borderColor = 'var(--cf-border)';
                    }}
                  >
                    {/* Selection indicator dot */}
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      border:     `2px solid ${isSelected ? 'var(--cf-primary)' : 'var(--cf-border)'}`,
                      background: isSelected ? 'var(--cf-primary)' : 'transparent',
                      display:    'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && (
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                      )}
                    </div>

                    {/* Name + email */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 600, fontSize: '0.875rem',
                        color: isSelected ? 'var(--cf-primary)' : 'var(--cf-text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {u.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--cf-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.email}
                      </div>
                    </div>

                    {/* Workload badge */}
                    <span style={badgeStyle(u.activeCount)}>
                      {isHighLoad && <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: '0.65rem' }} />}
                      {u.activeCount} active
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* High-load warning — shown only when the selected staff is at threshold */}
          {selected && (() => {
            const pick = staffList.find((u) => u._id === selected);
            return pick && pick.activeCount >= HIGH_WORKLOAD_THRESHOLD ? (
              <div style={{
                marginTop: '0.6rem', padding: '0.5rem 0.75rem',
                background: '#fef3c7', borderRadius: 'var(--cf-radius-md)',
                border: '1px solid #fcd34d',
                fontSize: '0.78rem', color: '#92400e',
                display: 'flex', gap: '0.45rem', alignItems: 'flex-start',
              }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                <span>
                  <strong>{pick.name}</strong> already has {pick.activeCount} active issue{pick.activeCount !== 1 ? 's' : ''}.
                  You can still assign — this is just a heads-up.
                </span>
              </div>
            ) : null;
          })()}
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
