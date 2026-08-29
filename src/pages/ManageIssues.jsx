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

  const [issues,    setIssues]    = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [pages,     setPages]     = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [categories, setCategories] = useState([]);

  // Filters
  const [search,   setSearch]   = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sevFilter, setSevFilter] = useState('');

  // Modals / actions
  const [assignTarget, setAssignTarget]  = useState(null);  // issue being assigned
  const [statusTarget, setStatusTarget]  = useState(null);  // { issue, newStatus }
  const [deleteTarget, setDeleteTarget]  = useState(null);  // issue to delete
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState('');

  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data)).catch(() => {});
  }, []);

  const fetchIssues = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page, limit: PAGE_SIZE, sortBy: 'newest',
      ...(search     && { search }),
      ...(catFilter  && { category: catFilter }),
      ...(statusFilter && { status: statusFilter }),
      ...(sevFilter  && { severity: sevFilter }),
    });
    api.get(`/issues?${params}`)
      .then(({ data }) => { setIssues(data.issues); setTotal(data.total); setPages(data.pages); })
      .finally(() => setLoading(false));
  }, [page, search, catFilter, statusFilter, sevFilter]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  // ── Status change ─────────────────────────────────────────────────────────
  const handleStatusChange = async (issueId, newStatus) => {
    setActionLoading(true); setActionError('');
    try {
      await api.patch(`/admin/issues/${issueId}/status`, { status: newStatus });
      fetchIssues();
    } catch (err) { setActionError(err.message); }
    finally { setActionLoading(false); setStatusTarget(null); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(true); setActionError('');
    try {
      await api.delete(`/issues/${deleteTarget._id}`);
      setDeleteTarget(null); fetchIssues();
    } catch (err) { setActionError(err.message); }
    finally { setActionLoading(false); }
  };

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

  return (
    <AdminLayout title="Manage Issues">

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
          <i className="bi bi-search" style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--cf-text-muted)', fontSize: '0.85rem' }}></i>
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search issues…" className="cf-input" style={{ paddingLeft: '2.1rem', height: 36, fontSize: '0.85rem' }} />
        </div>

        {[
          { val: catFilter,    set: setCatFilter,    placeholder: 'All Categories', opts: categories.map((c) => ({ v: c._id, l: c.name })) },
          { val: statusFilter, set: setStatusFilter, placeholder: 'All Statuses',   opts: STATUSES.map((s) => ({ v: s, l: s })) },
          { val: sevFilter,    set: setSevFilter,    placeholder: 'All Severities', opts: SEVERITIES.map((s) => ({ v: s, l: s })) },
        ].map(({ val, set, placeholder, opts }) => (
          <select key={placeholder} value={val}
            onChange={(e) => { set(e.target.value); setPage(1); }}
            className="cf-input"
            style={{ height: 36, fontSize: '0.85rem', width: 'auto', minWidth: 140, cursor: 'pointer' }}>
            <option value="">{placeholder}</option>
            {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        ))}

        <button onClick={() => { setSearch(''); setCatFilter(''); setStatusFilter(''); setSevFilter(''); setPage(1); }}
          className="cf-btn cf-btn-outline" style={{ height: 36, fontSize: '0.8rem', padding: '0 0.85rem' }}>
          <i className="bi bi-x-circle"></i> Clear
        </button>

        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--cf-text-muted)' }}>
          {total} issue{total !== 1 ? 's' : ''}
        </span>
      </div>

      {actionError && (
        <div className="cf-alert cf-alert-error" style={{ marginBottom: '1rem' }}>
          <i className="bi bi-exclamation-circle-fill"></i> {actionError}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="cf-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
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
                <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--cf-text-muted)' }}>
                  <div className="cf-spinner" style={{ margin: '0 auto' }}></div>
                </td></tr>
              ) : issues.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--cf-text-muted)', fontSize: '0.875rem' }}>
                  No issues match the current filters.
                </td></tr>
              ) : issues.map((issue) => (
                <tr key={issue._id}
                  style={{ transition: 'background 100ms' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--cf-bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
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
              ))}
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

      {/* ── Assign Modal ─────────────────────────────────────────────────── */}
      {assignTarget && (
        <AssignIssueModal
          issue={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => { setAssignTarget(null); fetchIssues(); }}
        />
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
