import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import IssueCard from '../components/IssueCard';
import PublicNav from '../components/PublicNav';

const STATUSES   = ['Pending', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected'];
const PAGE_SIZE  = 12;

/**
 * PublicIssues — publicly browsable issue board.
 * No auth check — anyone can load this page.
 *
 * Hits the existing GET /api/issues endpoint with the same query params
 * that ManageIssues / MyReports already use:
 *   category, status, severity, search, page, limit
 *
 * Returns { issues, total, page, pages } — standard shape from Prompt 3.
 */
export default function PublicIssues() {
  const [issues,    setIssues]    = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [pages,     setPages]     = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [categories, setCategories] = useState([]);

  // Filters
  const [search,       setSearch]       = useState('');
  const [catFilter,    setCatFilter]    = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Load categories once for filter dropdown
  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data)).catch(() => {});
  }, []);

  const fetchIssues = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page,
      limit: PAGE_SIZE,
      sortBy: 'newest',
      ...(search       && { search }),
      ...(catFilter    && { category: catFilter }),
      ...(statusFilter && { status: statusFilter }),
    });
    api.get(`/issues?${params}`)
      .then(({ data }) => {
        setIssues(data.issues);
        setTotal(data.total);
        setPages(data.pages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, catFilter, statusFilter]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  // Reset to page 1 whenever filters change
  const handleFilterChange = (setter) => (val) => {
    setter(val);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setCatFilter('');
    setStatusFilter('');
    setPage(1);
  };

  const hasActiveFilters = search || catFilter || statusFilter;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cf-bg)' }}>
      <PublicNav />

      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--cf-primary) 0%, var(--cf-primary-dark) 100%)',
          padding: '3rem 2rem 3.5rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* subtle pattern overlay */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.04) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.06) 0%, transparent 50%)',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            background: 'rgba(242,165,65,0.18)', color: 'var(--cf-accent)',
            borderRadius: 999, padding: '0.3rem 0.9rem',
            fontSize: '0.8125rem', fontWeight: 600,
            marginBottom: '1rem',
          }}
        >
          <i className="bi bi-geo-alt-fill" /> Community Reports
        </div>

        <h1
          style={{
            color: '#fff',
            fontSize: 'clamp(1.6rem, 4vw, 2.25rem)',
            marginBottom: '0.6rem',
            fontFamily: 'var(--cf-font-heading)',
          }}
        >
          Browse Local Issues
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '1rem', maxWidth: 520, margin: '0 auto' }}>
          View community-reported infrastructure problems in your area.
          <Link to="/register" style={{ color: 'var(--cf-accent)', marginLeft: '0.3rem', fontWeight: 600 }}>
            Sign up
          </Link>{' '}
          to report your own or upvote existing ones.
        </p>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* ── Filter bar ──────────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex', gap: '0.6rem', flexWrap: 'wrap',
            marginBottom: '1.5rem', alignItems: 'center',
          }}
        >
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
            <i
              className="bi bi-search"
              style={{
                position: 'absolute', left: '0.7rem', top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--cf-text-muted)', fontSize: '0.85rem',
              }}
            />
            <input
              id="public-issues-search"
              value={search}
              onChange={(e) => handleFilterChange(setSearch)(e.target.value)}
              placeholder="Search issues…"
              className="cf-input"
              style={{ paddingLeft: '2.1rem', height: 38, fontSize: '0.875rem' }}
            />
          </div>

          {/* Category filter */}
          <select
            id="public-issues-category"
            value={catFilter}
            onChange={(e) => handleFilterChange(setCatFilter)(e.target.value)}
            className="cf-input"
            style={{ height: 38, fontSize: '0.875rem', width: 'auto', minWidth: 150, cursor: 'pointer' }}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            id="public-issues-status"
            value={statusFilter}
            onChange={(e) => handleFilterChange(setStatusFilter)(e.target.value)}
            className="cf-input"
            style={{ height: 38, fontSize: '0.875rem', width: 'auto', minWidth: 150, cursor: 'pointer' }}
          >
            <option value="">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Clear */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="cf-btn cf-btn-outline"
              style={{ height: 38, fontSize: '0.8rem', padding: '0 0.85rem' }}
            >
              <i className="bi bi-x-circle" /> Clear
            </button>
          )}

          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.8125rem',
              color: 'var(--cf-text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? '…' : `${total} issue${total !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* ── Issue grid ──────────────────────────────────────────────────────── */}
        {loading ? (
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 320,
            }}
          >
            <div className="cf-spinner" />
          </div>
        ) : issues.length === 0 ? (
          <div
            style={{
              textAlign: 'center', padding: '5rem 1rem',
              color: 'var(--cf-text-muted)',
            }}
          >
            <i className="bi bi-inbox" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', color: 'var(--cf-border)' }} />
            <p style={{ fontSize: '1.05rem', fontWeight: 500, color: 'var(--cf-text-secondary)', marginBottom: '0.4rem' }}>
              No issues found
            </p>
            <p style={{ fontSize: '0.875rem' }}>
              {hasActiveFilters
                ? 'Try clearing some filters.'
                : 'No community reports yet — be the first to report one.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="cf-btn cf-btn-outline"
                style={{ marginTop: '0.75rem' }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1.25rem',
              marginBottom: '2rem',
            }}
          >
            {issues.map((issue) => (
              <IssueCard key={issue._id} issue={issue} />
            ))}
          </div>
        )}

        {/* ── Pagination ──────────────────────────────────────────────────────── */}
        {!loading && pages > 1 && (
          <div
            style={{
              display: 'flex', gap: '0.4rem',
              justifyContent: 'center', alignItems: 'center',
              paddingTop: '0.5rem',
            }}
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="cf-btn cf-btn-outline"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              aria-label="Previous page"
            >
              <i className="bi bi-chevron-left" />
            </button>

            {[...Array(pages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                style={{
                  width: 34, height: 34,
                  borderRadius: 6,
                  border: '1.5px solid',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  fontWeight: page === i + 1 ? 700 : 400,
                  background:   page === i + 1 ? 'var(--cf-primary)' : 'var(--cf-surface)',
                  color:        page === i + 1 ? '#fff'               : 'var(--cf-text)',
                  borderColor:  page === i + 1 ? 'var(--cf-primary)' : 'var(--cf-border)',
                  transition: 'all var(--cf-transition)',
                }}
                aria-label={`Page ${i + 1}`}
                aria-current={page === i + 1 ? 'page' : undefined}
              >
                {i + 1}
              </button>
            ))}

            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="cf-btn cf-btn-outline"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              aria-label="Next page"
            >
              <i className="bi bi-chevron-right" />
            </button>
          </div>
        )}

        {/* ── Guest CTA strip ─────────────────────────────────────────────────── */}
        {!loading && issues.length > 0 && (
          <div
            style={{
              marginTop: '3rem',
              background: 'var(--cf-surface)',
              border: '1px solid var(--cf-border-light)',
              borderRadius: 'var(--cf-radius-lg)',
              padding: '2rem',
              textAlign: 'center',
              boxShadow: 'var(--cf-shadow-sm)',
            }}
          >
            <i
              className="bi bi-megaphone"
              style={{ fontSize: '1.75rem', color: 'var(--cf-primary)', marginBottom: '0.75rem', display: 'block' }}
            />
            <h2 style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>
              See something that needs fixing?
            </h2>
            <p style={{ color: 'var(--cf-text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem', maxWidth: 400, margin: '0 auto 1.25rem' }}>
              Create a free account to report issues, upvote reports, and track progress in your community.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/register" className="cf-btn cf-btn-primary" style={{ padding: '0.6rem 1.5rem' }}>
                <i className="bi bi-plus-circle" /> Create account
              </Link>
              <Link to="/login" className="cf-btn cf-btn-outline" style={{ padding: '0.6rem 1.5rem' }}>
                Sign in
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
