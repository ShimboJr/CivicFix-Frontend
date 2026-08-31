import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import AdminLayout    from '../components/AdminLayout';
import StatusBadge    from '../components/StatusBadge';
import AssignIssueModal from '../components/AssignIssueModal';

const STATUSES   = ['Pending', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected'];
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const PAGE_SIZE  = 15;

const SEVERITY_COLOR = { Low: '#10b981', Medium: '#f59e0b', High: '#f97316', Critical: '#ef4444' };

export default function ManageIssues() {
  const navigate = useNavigate();

  const [issues,     setIssues]     = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [pages,      setPages]      = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [categories, setCategories] = useState([]);

  // Filters
  const [search,       setSearch]       = useState('');
  const [catFilter,    setCatFilter]    = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sevFilter,    setSevFilter]    = useState('');

  // Modals / actions
  const [assignTarget,  setAssignTarget]  = useState(null);  // issue (single) or null
  const [bulkAssigning, setBulkAssigning] = useState(false); // true = modal in bulk mode
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState('');
  const [actionResult,  setActionResult]  = useState('');   // bulk result message

  // Reject dialog state
  const [rejectDialog,  setRejectDialog]  = useState(false); // show inline reject dialog
  const [rejectReason,  setRejectReason]  = useState('');

  // ── Selection (Set of issue _id strings) ─────────────────────────────────
  const [selected, setSelected] = useState(new Set());

  // Clear selection whenever filters or page change
  useEffect(() => { setSelected(new Set()); }, [page, search, catFilter, statusFilter, sevFilter]);

  const toggleRow = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allOnPageSelected =
    issues.length > 0 && issues.every((i) => selected.has(i._id));

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      // Deselect all on this page
      setSelected((prev) => {
        const next = new Set(prev);
        issues.forEach((i) => next.delete(i._id));
        return next;
      });
    } else {
      // Select all on this page (preserving cross-page selections)
      setSelected((prev) => {
        const next = new Set(prev);
        issues.forEach((i) => next.add(i._id));
        return next;
      });
    }
  };

  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data)).catch(() => {});
  }, []);

  const fetchIssues = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page, limit: PAGE_SIZE, sortBy: 'newest',
      ...(search       && { search }),
      ...(catFilter    && { category: catFilter }),
      ...(statusFilter && { status: statusFilter }),
      ...(sevFilter    && { severity: sevFilter }),
    });
    api.get(`/issues?${params}`)
      .then(({ data }) => { setIssues(data.issues); setTotal(data.total); setPages(data.pages); })
      .finally(() => setLoading(false));
  }, [page, search, catFilter, statusFilter, sevFilter]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  // ── Status change (single row) ────────────────────────────────────────────
  const handleStatusChange = async (issueId, newStatus) => {
    setActionLoading(true); setActionError(''); setActionResult('');
    try {
      await api.patch(`/admin/issues/${issueId}/status`, { status: newStatus });
      fetchIssues();
    } catch (err) { setActionError(err.message); }
    finally { setActionLoading(false); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(true); setActionError(''); setActionResult('');
    try {
      await api.delete(`/issues/${deleteTarget._id}`);
      setDeleteTarget(null); fetchIssues();
    } catch (err) { setActionError(err.message); }
    finally { setActionLoading(false); }
  };

  // ── Bulk reject ───────────────────────────────────────────────────────────
  const handleBulkReject = async () => {
    setActionLoading(true); setActionError(''); setActionResult('');
    try {
      const { data } = await api.post('/admin/issues/bulk-reject', {
        issueIds: [...selected],
        reason:   rejectReason.trim() || undefined,
      });
      setSelected(new Set());
      setRejectDialog(false);
      setRejectReason('');
      // Build a human-readable result message
      const parts = [];
      if (data.succeeded.length) parts.push(`${data.succeeded.length} rejected`);
      if (data.skipped.length)   parts.push(`${data.skipped.length} skipped (already resolved/rejected)`);
      setActionResult(parts.join(', ') || 'No changes made.');
      fetchIssues();
    } catch (err) { setActionError(err.message); }
    finally { setActionLoading(false); }
  };

  // Called by AssignIssueModal after a successful bulk or single assign
  const handleAssigned = (result) => {
    setBulkAssigning(false);
    setAssignTarget(null);
    setSelected(new Set());
    if (result) {
      // Bulk result object
      const parts = [];
      if (result.succeeded.length) parts.push(`${result.succeeded.length} assigned`);
      if (result.skipped.length)   parts.push(`${result.skipped.length} skipped (already resolved)`);
      setActionResult(parts.join(', ') || 'No changes made.');
    }
    fetchIssues();
  };

  // ── Table cell helpers ────────────────────────────────────────────────────
  const Th = ({ children, style }) => (
    <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--cf-bg)', borderBottom: '1px solid var(--cf-border)', whiteSpace: 'nowrap', ...style }}>
      {children}
    </th>
  );

  const Td = ({ children, style }) => (
    <td style={{ padding: '0.7rem 0.85rem', fontSize: '0.8375rem', color: 'var(--cf-text)', borderBottom: '1px solid var(--cf-border-light)', verticalAlign: 'middle', ...style }}>
      {children}
    </td>
  );

  const hasSelection = selected.size > 0;

  return (
    <AdminLayout title="Manage Issues">

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 100%', maxWidth: '100%' }}>
          <i className="bi bi-search" style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--cf-text-muted)', fontSize: '0.85rem' }}></i>
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search issues…" className="cf-input" style={{ paddingLeft: '2.1rem', height: 36, fontSize: '0.85rem' }} />
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', flex: '1 1 auto' }}>
          {[
            { val: catFilter,    set: setCatFilter,    placeholder: 'All Categories', opts: categories.map((c) => ({ v: c._id, l: c.name })) },
            { val: statusFilter, set: setStatusFilter, placeholder: 'All Statuses',   opts: STATUSES.map((s) => ({ v: s, l: s })) },
            { val: sevFilter,    set: setSevFilter,    placeholder: 'All Severities', opts: SEVERITIES.map((s) => ({ v: s, l: s })) },
          ].map(({ val, set, placeholder, opts }) => (
            <select key={placeholder} value={val}
              onChange={(e) => { set(e.target.value); setPage(1); }}
              className="cf-input"
              style={{ height: 36, fontSize: '0.85rem', flex: '1 1 120px', minWidth: 120, cursor: 'pointer' }}>
              <option value="">{placeholder}</option>
              {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          ))}

          <button onClick={() => { setSearch(''); setCatFilter(''); setStatusFilter(''); setSevFilter(''); setPage(1); }}
            className="cf-btn cf-btn-outline" style={{ height: 36, fontSize: '0.8rem', padding: '0 0.85rem', flexShrink: 0 }}>
            <i className="bi bi-x-circle"></i> Clear
          </button>
        </div>

        <span style={{ fontSize: '0.78rem', color: 'var(--cf-text-muted)', whiteSpace: 'nowrap' }}>
          {total} issue{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Bulk action bar ───────────────────────────────────────────────── */}
      {hasSelection && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
          padding: '0.6rem 1rem', marginBottom: '0.85rem',
          background: 'var(--cf-primary-light)',
          border: '1.5px solid var(--cf-primary)',
          borderRadius: 'var(--cf-radius-md)',
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--cf-primary)' }}>
            <i className="bi bi-check2-square me-1" />
            {selected.size} selected
          </span>
          <button
            onClick={() => setBulkAssigning(true)}
            className="cf-btn cf-btn-primary"
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.9rem' }}
          >
            <i className="bi bi-person-check me-1" />
            Assign Selected
          </button>
          <button
            onClick={() => { setRejectDialog(true); setRejectReason(''); }}
            style={{
              fontSize: '0.8rem', padding: '0.35rem 0.9rem',
              borderRadius: 'var(--cf-radius-md)', border: '1.5px solid #ef4444',
              background: 'transparent', color: '#ef4444', cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <i className="bi bi-x-circle me-1" />
            Reject Selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ background: 'none', border: 'none', fontSize: '0.8rem', color: 'var(--cf-text-muted)', cursor: 'pointer', marginLeft: 'auto', textDecoration: 'underline' }}
          >
            Clear selection
          </button>
        </div>
      )}

      {actionError && (
        <div className="cf-alert cf-alert-error" style={{ marginBottom: '1rem' }}>
          <i className="bi bi-exclamation-circle-fill"></i> {actionError}
        </div>
      )}

      {actionResult && !actionError && (
        <div className="cf-alert cf-alert-success" style={{ marginBottom: '1rem' }}>
          <i className="bi bi-check-circle-fill"></i> {actionResult}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="cf-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {/* Select-all checkbox */}
                <Th style={{ width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    disabled={loading || issues.length === 0}
                    title={allOnPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                    style={{ cursor: 'pointer', width: 15, height: 15 }}
                  />
                </Th>
                <Th>ID</Th>
                <Th style={{ minWidth: 220 }}>Title</Th>
                <Th>Category</Th>
                <Th>Severity</Th>
                <Th>Status</Th>
                <Th>Reporter</Th>
                <Th>Date</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--cf-text-muted)' }}>
                  <div className="cf-spinner" style={{ margin: '0 auto' }}></div>
                </td></tr>
              ) : issues.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: 'var(--cf-text-muted)', fontSize: '0.875rem' }}>
                  No issues match the current filters.
                </td></tr>
              ) : issues.map((issue) => {
                const isChecked = selected.has(issue._id);
                return (
                  <tr key={issue._id}
                    style={{ transition: 'background 100ms', background: isChecked ? 'var(--cf-primary-light)' : 'transparent' }}
                    onMouseEnter={(e) => { if (!isChecked) e.currentTarget.style.background = 'var(--cf-bg)'; }}
                    onMouseLeave={(e) => { if (!isChecked) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Row checkbox */}
                    <Td style={{ textAlign: 'center', width: 40 }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRow(issue._id)}
                        style={{ cursor: 'pointer', width: 15, height: 15 }}
                      />
                    </Td>
                    <Td><span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--cf-primary)', fontWeight: 600 }}>{issue.issueId}</span></Td>
                    <Td style={{ maxWidth: 260 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>
                        {issue.title}
                      </span>
                    </Td>
                    <Td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}>
                        <i className={`bi ${issue.category?.icon || 'bi-tag'}`} style={{ color: 'var(--cf-primary)' }}></i>
                        {issue.category?.name}
                      </span>
                    </Td>
                    <Td>
                      <span style={{ background: SEVERITY_COLOR[issue.severity] + '20', color: SEVERITY_COLOR[issue.severity], padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600 }}>
                        {issue.severity}
                      </span>
                    </Td>
                    <Td>
                      <select
                        value={issue.status}
                        onChange={(e) => handleStatusChange(issue._id, e.target.value)}
                        disabled={actionLoading}
                        style={{ border: 'none', background: 'transparent', fontSize: '0.82rem', cursor: 'pointer', padding: 0 }}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Td>
                    <Td style={{ fontSize: '0.8rem', color: 'var(--cf-text-secondary)' }}>{issue.reportedBy?.name}</Td>
                    <Td style={{ fontSize: '0.78rem', color: 'var(--cf-text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(issue.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button title="View detail"
                          onClick={() => navigate(`/issue/${issue._id}`)}
                          style={{ padding: '0.3rem 0.55rem', border: '1px solid var(--cf-border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--cf-primary)' }}>
                          <i className="bi bi-eye"></i>
                        </button>
                        <button title="Assign to staff"
                          onClick={() => setAssignTarget(issue)}
                          style={{ padding: '0.3rem 0.55rem', border: '1px solid var(--cf-border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', color: '#8b5cf6' }}>
                          <i className="bi bi-person-check"></i>
                        </button>
                        <button title="Delete issue"
                          onClick={() => setDeleteTarget(issue)}
                          style={{ padding: '0.3rem 0.55rem', border: '1px solid #fee2e2', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', color: '#ef4444' }}>
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="cf-btn cf-btn-outline" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
            <i className="bi bi-chevron-left"></i>
          </button>
          {[...Array(pages)].map((_, i) => (
            <button key={i} onClick={() => setPage(i + 1)}
              style={{ width: 32, height: 32, borderRadius: 6, border: '1.5px solid', fontSize: '0.82rem', cursor: 'pointer', fontWeight: page === i + 1 ? 700 : 400, background: page === i + 1 ? 'var(--cf-primary)' : 'var(--cf-surface)', color: page === i + 1 ? '#fff' : 'var(--cf-text)', borderColor: page === i + 1 ? 'var(--cf-primary)' : 'var(--cf-border)' }}>
              {i + 1}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
            className="cf-btn cf-btn-outline" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
            <i className="bi bi-chevron-right"></i>
          </button>
        </div>
      )}

      {/* ── Single-issue Assign Modal ─────────────────────────────────────── */}
      {assignTarget && (
        <AssignIssueModal
          issueId={assignTarget._id}
          issue={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => handleAssigned(null)}
        />
      )}

      {/* ── Bulk Assign Modal ─────────────────────────────────────────────── */}
      {bulkAssigning && (
        <AssignIssueModal
          issueIds={[...selected]}
          onClose={() => setBulkAssigning(false)}
          onAssigned={handleAssigned}
        />
      )}

      {/* ── Bulk Reject Dialog ────────────────────────────────────────────── */}
      {rejectDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="cf-card" style={{ maxWidth: 440, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#ef4444' }}>
                <i className="bi bi-x-circle me-2"></i>
                Reject {selected.size} Issue{selected.size !== 1 ? 's' : ''}
              </h3>
              <button onClick={() => setRejectDialog(false)} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--cf-text-muted)', lineHeight: 1 }}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <p style={{ color: 'var(--cf-text-secondary)', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.6 }}>
              Already-resolved or already-rejected issues in the selection will be skipped automatically.
            </p>

            <div style={{ marginBottom: '1.1rem' }}>
              <label className="cf-form-label">Rejection reason <span style={{ fontWeight: 400, color: 'var(--cf-text-muted)' }}>(optional — applied to all selected)</span></label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="cf-input"
                rows={3}
                style={{ resize: 'vertical' }}
                placeholder="e.g. Duplicate report, out of jurisdiction…"
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={handleBulkReject}
                disabled={actionLoading}
                style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}
              >
                {actionLoading
                  ? <><span className="spinner-border spinner-border-sm me-2"></span>Rejecting…</>
                  : <>Confirm Reject {selected.size}</>}
              </button>
              <button onClick={() => setRejectDialog(false)} className="cf-btn cf-btn-outline" style={{ flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="cf-card" style={{ maxWidth: 420, width: '100%' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#ef4444' }}><i className="bi bi-exclamation-triangle me-2"></i>Delete Issue?</h3>
            <p style={{ color: 'var(--cf-text-secondary)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
              This will permanently delete <strong>{deleteTarget.issueId}</strong> and all its comments. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={handleDelete} disabled={actionLoading}
                style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                {actionLoading ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button onClick={() => setDeleteTarget(null)} className="cf-btn cf-btn-outline" style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
