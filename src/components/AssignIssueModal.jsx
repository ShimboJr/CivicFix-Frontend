import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * AssignIssueModal — single-issue OR bulk-assign mode.
 *
 * ── Single mode ──────────────────────────────────────────────────────────────
 *   Props: issueId (string), issue (object, for the summary card), onClose, onAssigned
 *   Calls: PATCH /api/admin/issues/:id/assign   { staffId }
 *   onAssigned() called with no argument after success.
 *
 * ── Bulk mode ─────────────────────────────────────────────────────────────────
 *   Props: issueIds (string[]), onClose, onAssigned
 *   Calls: POST  /api/admin/issues/bulk-assign  { issueIds, staffId }
 *   onAssigned(result) called with the { succeeded, skipped } summary so the
 *   parent (ManageIssues) can display "N assigned, M skipped" feedback.
 *
 * The staff picker, workload badges, and high-load warning are identical in
 * both modes — no logic duplication.
 */

// Number of active issues at which a staff member is considered high-load.
const HIGH_WORKLOAD_THRESHOLD = 5;

export default function AssignIssueModal({ issue, issueId, issueIds, onClose, onAssigned }) {
  // Determine mode from props
  const isBulk = Array.isArray(issueIds) && issueIds.length > 0;

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
      if (isBulk) {
        const { data } = await api.post('/admin/issues/bulk-assign', {
          issueIds,
          staffId: selected,
        });
        onAssigned(data); // pass { succeeded, skipped } up to parent
      } else {
        await api.patch(`/admin/issues/${issueId || issue?._id}/assign`, { staffId: selected });
        onAssigned(); // single-issue: no result to surface here
      }
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  // ── Badge appearance ──────────────────────────────────────────────────────
  const badgeStyle = (count) => {
    const isHigh     = count >= HIGH_WORKLOAD_THRESHOLD;
    const isCritical = count >= HIGH_WORKLOAD_THRESHOLD + 2;
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
            {isBulk ? `Assign ${issueIds.length} Issues` : 'Assign Issue'}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--cf-text-muted)', lineHeight: 1 }}
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Context summary */}
        {isBulk ? (
          /* Bulk mode: show count + skip warning */
          <div style={{ background: 'var(--cf-bg)', borderRadius: 'var(--cf-radius-md)', padding: '0.7rem 0.9rem', marginBottom: '1.1rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              <i className="bi bi-layers me-1" style={{ color: 'var(--cf-primary)' }} />
              {issueIds.length} issue{issueIds.length !== 1 ? 's' : ''} selected
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--cf-text-muted)', marginTop: '0.25rem' }}>
              Already-resolved issues will be skipped automatically.
            </div>
          </div>
        ) : issue ? (
          /* Single mode: show the issue summary card */
          <div style={{ background: 'var(--cf-bg)', borderRadius: 'var(--cf-radius-md)', padding: '0.7rem 0.9rem', marginBottom: '1.1rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--cf-primary)', marginBottom: '0.25rem' }}>
              {issue.issueId}
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.4 }}>{issue.title}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--cf-text-muted)', marginTop: '0.25rem' }}>
              <i className="bi bi-geo-alt me-1"></i>{issue.location?.address}
            </div>
          </div>
        ) : null}

        {error && (
          <div className="cf-alert cf-alert-error" style={{ marginBottom: '1rem' }}>
            <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }}></i> {error}
          </div>
        )}

        {/* Staff picker */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label className="cf-form-label" style={{ margin: 0 }}>Assign to staff member</label>
            {!loading && staffList.length > 0 && (
              <span style={{ fontSize: '0.68rem', color: 'var(--cf-text-muted)' }}>sorted by current load ↑</span>
            )}
          </div>

          {loading ? (
            <div style={{ color: 'var(--cf-text-muted)', fontSize: '0.875rem', padding: '0.5rem 0' }}>Loading staff…</div>
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
                      display:     'flex',
                      alignItems:  'center',
                      gap:         '0.65rem',
                      width:       '100%',
                      padding:     '0.6rem 0.8rem',
                      borderRadius: 'var(--cf-radius-md)',
                      border:      `2px solid ${isSelected ? 'var(--cf-primary)' : 'var(--cf-border)'}`,
                      background:  isSelected ? 'var(--cf-primary-light)' : 'var(--cf-bg)',
                      cursor:      'pointer',
                      textAlign:   'left',
                      transition:  'border-color 120ms, background 120ms',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--cf-primary)'; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--cf-border)'; }}
                  >
                    {/* Radio dot */}
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      border:     `2px solid ${isSelected ? 'var(--cf-primary)' : 'var(--cf-border)'}`,
                      background: isSelected ? 'var(--cf-primary)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
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

          {/* High-load inline warning — shown when selected staff is at/above threshold */}
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
            {submitting
              ? <><span className="spinner-border spinner-border-sm me-2"></span>Assigning…</>
              : <><i className="bi bi-person-check"></i> {isBulk ? `Assign ${issueIds.length}` : 'Assign'}</>}
          </button>
          <button onClick={onClose} className="cf-btn cf-btn-outline" style={{ flex: 1 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
