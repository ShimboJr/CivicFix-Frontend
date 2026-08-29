import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import StaffLayout from '../components/StaffLayout';
import StatusBadge  from '../components/StatusBadge';

const SEVERITY_COLOR = { Low: '#10b981', Medium: '#f59e0b', High: '#f97316', Critical: '#ef4444' };
const ALL_STATUSES   = ['Assigned', 'In Progress', 'Resolved'];

export default function AssignedIssues() {
  const navigate = useNavigate();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search,       setSearch]       = useState('');

  const fetchIssues = useCallback(() => {
    setLoading(true);
    api.get('/staff/my-issues')
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  const filtered = (data?.issues || []).filter((issue) => {
    const matchStatus = !statusFilter || issue.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q
      || issue.title.toLowerCase().includes(q)
      || issue.location?.address?.toLowerCase().includes(q)
      || issue.issueId?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

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
    <StaffLayout title="Assigned Issues">

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 100%', maxWidth: '100%' }}>
          <i className="bi bi-search" style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--cf-text-muted)', fontSize: '0.85rem' }}></i>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, location, ID…" className="cf-input"
            style={{ paddingLeft: '2.1rem', height: 36, fontSize: '0.85rem' }} />
        </div>

        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <button onClick={() => setStatusFilter('')}
            className={`cf-btn ${!statusFilter ? 'cf-btn-primary' : 'cf-btn-outline'}`}
            style={{ height: 36, fontSize: '0.8rem', padding: '0 0.85rem' }}>
            All
          </button>
          {ALL_STATUSES.map((s) => (
            <button key={s}
              onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
              style={{
                height: 36, padding: '0 0.75rem', borderRadius: 'var(--cf-radius-md)',
                border: `1.5px solid ${statusFilter === s ? 'var(--cf-primary)' : 'var(--cf-border)'}`,
                background: statusFilter === s ? 'var(--cf-primary-light)' : 'var(--cf-surface)',
                cursor: 'pointer', fontSize: '0.78rem',
              }}>
              <StatusBadge status={s} />
            </button>
          ))}
        </div>

        <span style={{ fontSize: '0.78rem', color: 'var(--cf-text-muted)', whiteSpace: 'nowrap' }}>
          {filtered.length} issue{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <div className="cf-alert cf-alert-error" style={{ marginBottom: '1rem' }}>
          <i className="bi bi-exclamation-circle-fill"></i> {error}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="cf-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th>ID</Th>
                <Th style={{ minWidth: 220 }}>Title</Th>
                <Th>Category</Th>
                <Th>Severity</Th>
                <Th>Status</Th>
                <Th>Location</Th>
                <Th>Reported</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center' }}>
                  <div className="cf-spinner" style={{ margin: '0 auto' }}></div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--cf-text-muted)', fontSize: '0.875rem' }}>
                  {data?.issues?.length === 0 ? 'No issues have been assigned to you yet.' : 'No issues match the current filter.'}
                </td></tr>
              ) : filtered.map((issue) => (
                <tr key={issue._id}
                  style={{ cursor: 'pointer', transition: 'background 100ms' }}
                  onClick={() => navigate(`/staff/issue/${issue._id}`)}
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
                  <Td><StatusBadge status={issue.status} /></Td>
                  <Td style={{ color: 'var(--cf-text-secondary)', fontSize: '0.8rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {issue.location?.address}
                  </Td>
                  <Td style={{ color: 'var(--cf-text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {new Date(issue.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </Td>
                  <Td>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/staff/issue/${issue._id}`); }}
                      style={{ padding: '0.3rem 0.7rem', border: '1px solid var(--cf-border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--cf-primary)' }}>
                      <i className="bi bi-arrow-right-circle"></i> Work on this
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </StaffLayout>
  );
}
