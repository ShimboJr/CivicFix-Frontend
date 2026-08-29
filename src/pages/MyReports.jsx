import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import DashboardLayout from '../components/DashboardLayout';
import IssueCard from '../components/IssueCard';
import StatusBadge from '../components/StatusBadge';

const ALL_STATUSES = ['Pending', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected'];

export default function MyReports() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search,        setSearch]        = useState('');
  const [activeStatus,  setActiveStatus]  = useState('');

  const fetchIssues = useCallback(() => {
    setLoading(true);
    api.get('/issues/my-issues')
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  // ── Client-side filter (search + status chip) ─────────────────────────────
  const filtered = (data?.issues || []).filter((issue) => {
    const matchStatus = !activeStatus || issue.status === activeStatus;
    const q = search.toLowerCase();
    const matchSearch = !q
      || issue.title.toLowerCase().includes(q)
      || issue.description?.toLowerCase().includes(q)
      || issue.location?.address?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <DashboardLayout title="My Reports">

      {/* ── Controls row ──────────────────────────────────────────────────── */}
      <div style={{
        display:        'flex',
        gap:            '0.75rem',
        marginBottom:   '1.25rem',
        flexWrap:       'wrap',
        alignItems:     'center',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <i className="bi bi-search" style={{
            position: 'absolute', left: '0.75rem', top: '50%',
            transform: 'translateY(-50%)', color: 'var(--cf-text-muted)', fontSize: '0.9rem',
          }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports…"
            className="cf-input"
            style={{ paddingLeft: '2.2rem', height: '38px' }}
          />
        </div>

        {/* Status filter chips */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveStatus('')}
            className={`cf-btn ${!activeStatus ? 'cf-btn-primary' : 'cf-btn-outline'}`}
            style={{ padding: '0.3rem 0.85rem', fontSize: '0.8rem', height: '38px' }}
          >
            All
          </button>
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setActiveStatus(activeStatus === s ? '' : s)}
              style={{
                padding: '0.3rem 0.75rem', height: '38px',
                borderRadius: 'var(--cf-radius-md)',
                border: '1.5px solid var(--cf-border)',
                background: activeStatus === s ? 'var(--cf-primary-light)' : 'var(--cf-surface)',
                cursor: 'pointer', fontSize: '0.78rem',
                borderColor: activeStatus === s ? 'var(--cf-primary)' : 'var(--cf-border)',
              }}
            >
              <StatusBadge status={s} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Results summary ───────────────────────────────────────────────── */}
      {!loading && !error && (
        <p style={{ color: 'var(--cf-text-secondary)', fontSize: '0.8125rem', marginBottom: '1rem' }}>
          Showing <strong>{filtered.length}</strong> of <strong>{data?.issues?.length || 0}</strong> reports
          {activeStatus && <> · Filtered by: <StatusBadge status={activeStatus} /></>}
        </p>
      )}

      {/* ── States ───────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: 260, borderRadius: 'var(--cf-radius-lg)', background: '#e5e7eb' }} />
          ))}
        </div>
      )}

      {error && (
        <div className="cf-alert cf-alert-error">
          <i className="bi bi-exclamation-circle-fill"></i> {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="cf-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--cf-text-secondary)' }}>
          <i className="bi bi-search" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.75rem', opacity: 0.35 }}></i>
          <p style={{ margin: 0 }}>No reports match your filters.</p>
          {activeStatus && (
            <button className="cf-btn cf-btn-outline" style={{ marginTop: '1rem', fontSize: '0.875rem' }} onClick={() => setActiveStatus('')}>
              Clear filter
            </button>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {filtered.map((issue) => <IssueCard key={issue._id} issue={issue} />)}
        </div>
      )}
    </DashboardLayout>
  );
}
