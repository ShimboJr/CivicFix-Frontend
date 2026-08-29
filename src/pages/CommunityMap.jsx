/**
 * CommunityMap.jsx — Public route: /map
 *
 * Fetches all issues from GET /api/issues (using limit=500, paginating if needed)
 * and plots one marker per issue that has valid lat/lng coordinates.
 *
 * Design decision — colour by STATUS rather than severity:
 *   Status gives users an immediate sense of action-state (has this been dealt with?)
 *   which is more actionable at a glance on a civic map than severity.
 *   Severity is still visible in the popup for anyone who wants it.
 *   Colours reuse the exact CSS variable values from StatusBadge for consistency.
 *
 * NOTE: If the issue count grows to 200+ and markers overlap heavily, the
 * next step would be to install `react-leaflet-cluster` and wrap the markers
 * in a <MarkerClusterGroup>.  We intentionally skip it here until real data
 * proves it's needed, to avoid shipping an unused dependency.
 */

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';

// ── Defaults ──────────────────────────────────────────────────────────────────
const LAGOS_CENTER  = [6.5244, 3.3792];
const DEFAULT_ZOOM  = 12;

// ── Status → map pin colour (matches CSS tokens in index.css) ─────────────────
const STATUS_COLOR = {
  'Pending':      '#f59e0b',
  'Under Review': '#3b82f6',
  'Assigned':     '#8b5cf6',
  'In Progress':  '#06b6d4',
  'Resolved':     '#10b981',
  'Rejected':     '#ef4444',
};

// Build a small coloured circle marker SVG for each status
function makeIcon(color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 22 28">
      <path d="M11 0C4.925 0 0 4.925 0 11c0 7.778 11 17 11 17S22 18.778 22 11C22 4.925 17.075 0 11 0z"
            fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="11" cy="11" r="5" fill="#fff" fill-opacity="0.85"/>
    </svg>`;
  return L.divIcon({
    className: '',
    html: svg,
    iconSize:   [22, 28],
    iconAnchor: [11, 28],
    popupAnchor:[0, -28],
  });
}

// Pre-build one icon per status
const STATUS_ICONS = Object.fromEntries(
  Object.entries(STATUS_COLOR).map(([s, c]) => [s, makeIcon(c)])
);
const FALLBACK_ICON = makeIcon('#9ca3af');

// ── Sub-component: nudges the map when no external controllerRef needed ───────
function FitBoundsOnLoad({ issues }) {
  const map = useMap();
  useEffect(() => {
    const pts = issues.filter(
      (i) => i.location?.latitude && i.location?.longitude
    ).map((i) => [i.location.latitude, i.location.longitude]);
    if (pts.length > 0) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once after first render with data
  return null;
}

const STATUSES   = ['Pending', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected'];

export default function CommunityMap() {
  const [allIssues,   setAllIssues]   = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  // Client-side filters (no re-fetch)
  const [catFilter,    setCatFilter]    = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // ── Fetch all issues (up to limit=500; extend if needed) ─────────────────
  useEffect(() => {
    Promise.all([
      api.get('/issues?limit=500&sortBy=newest').catch(() => ({ data: { issues: [] } })),
      api.get('/categories').catch(() => ({ data: [] })),
    ]).then(([issuesRes, catsRes]) => {
      setAllIssues(issuesRes.data.issues || []);
      setCategories(catsRes.data || []);
    }).catch(() => {
      setError('Failed to load issues. Please try again later.');
    }).finally(() => setLoading(false));
  }, []);

  // ── Client-side filter ────────────────────────────────────────────────────
  const visible = useMemo(() => {
    return allIssues.filter((issue) => {
      if (!issue.location?.latitude || !issue.location?.longitude) return false;
      if (catFilter    && issue.category?._id !== catFilter)   return false;
      if (statusFilter && issue.status !== statusFilter)        return false;
      return true;
    });
  }, [allIssues, catFilter, statusFilter]);

  // ── Legend ────────────────────────────────────────────────────────────────
  const Legend = () => (
    <div style={{
      display: 'flex', gap: '0.75rem', flexWrap: 'wrap',
      alignItems: 'center', fontSize: '0.78rem',
    }}>
      {Object.entries(STATUS_COLOR).map(([status, color]) => (
        <span key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{
            display: 'inline-block', width: 10, height: 10,
            borderRadius: '50%', background: color,
            border: '1.5px solid rgba(0,0,0,0.15)',
          }} />
          {status}
        </span>
      ))}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--cf-bg)' }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <nav style={{
        background: 'var(--cf-primary)', padding: '0.85rem 2rem',
        display: 'flex', alignItems: 'center', gap: '1rem',
        justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: 34, height: 34, background: 'rgba(255,255,255,0.15)',
            borderRadius: 8, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#fff', fontSize: '1rem',
          }}>
            <i className="bi bi-building-check" />
          </div>
          <span style={{ fontFamily: 'var(--cf-font-heading)', fontWeight: 700, fontSize: '1.15rem', color: '#fff' }}>
            Civic<span style={{ color: 'var(--cf-accent)' }}>Fix</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
            <i className="bi bi-map me-1" /> Community Map
          </span>
          <Link to="/" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8125rem', textDecoration: 'none' }}>
            <i className="bi bi-house me-1" />Home
          </Link>
          <Link to="/login" className="cf-btn cf-btn-outline"
            style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}>
            Sign in
          </Link>
        </div>
      </nav>

      {/* ── Filter bar + legend ───────────────────────────────────────────── */}
      <div style={{
        background: 'var(--cf-surface)', borderBottom: '1px solid var(--cf-border-light)',
        padding: '0.75rem 2rem', display: 'flex', alignItems: 'center',
        gap: '0.75rem', flexWrap: 'wrap', flexShrink: 0,
      }}>
        {/* Category filter */}
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="cf-input"
          style={{ height: 36, fontSize: '0.84rem', width: 'auto', minWidth: 150, cursor: 'pointer' }}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="cf-input"
          style={{ height: 36, fontSize: '0.84rem', width: 'auto', minWidth: 150, cursor: 'pointer' }}
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Clear */}
        {(catFilter || statusFilter) && (
          <button
            onClick={() => { setCatFilter(''); setStatusFilter(''); }}
            className="cf-btn cf-btn-outline"
            style={{ height: 36, fontSize: '0.8rem', padding: '0 0.85rem' }}
          >
            <i className="bi bi-x-circle" /> Clear
          </button>
        )}

        <span style={{ fontSize: '0.78rem', color: 'var(--cf-text-muted)' }}>
          {visible.length} pin{visible.length !== 1 ? 's' : ''} shown
          {allIssues.length - visible.length > 0
            ? ` (${allIssues.filter(i => !i.location?.latitude).length} without coordinates hidden)`
            : ''}
        </span>

        <div style={{ marginLeft: 'auto' }}>
          <Legend />
        </div>
      </div>

      {/* ── Map area ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(245,246,248,0.85)',
          }}>
            <div>
              <div className="cf-spinner" style={{ margin: '0 auto 0.75rem' }} />
              <p style={{ textAlign: 'center', color: 'var(--cf-text-muted)', fontSize: '0.875rem' }}>Loading issues…</p>
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: '2rem' }}>
            <div className="cf-alert cf-alert-error">
              <i className="bi bi-exclamation-circle-fill" />
              {error}
            </div>
          </div>
        )}

        {!error && (
          <MapContainer
            center={LAGOS_CENTER}
            zoom={DEFAULT_ZOOM}
            style={{ height: '100%', width: '100%', minHeight: '80vh' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Fit bounds after first meaningful render */}
            {!loading && visible.length > 0 && <FitBoundsOnLoad issues={visible} />}

            {visible.map((issue) => (
              <Marker
                key={issue._id}
                position={[issue.location.latitude, issue.location.longitude]}
                icon={STATUS_ICONS[issue.status] || FALLBACK_ICON}
              >
                <Popup maxWidth={260} minWidth={200}>
                  <div style={{ fontFamily: 'var(--cf-font-body)', lineHeight: 1.5 }}>
                    {/* Title */}
                    <p style={{
                      fontWeight: 700, fontSize: '0.875rem',
                      margin: '0 0 0.4rem',
                      color: 'var(--cf-text)',
                      wordBreak: 'break-word',
                    }}>
                      {issue.title}
                    </p>

                    {/* Category */}
                    {issue.category?.name && (
                      <p style={{ margin: '0 0 0.4rem', fontSize: '0.775rem', color: 'var(--cf-text-secondary)' }}>
                        <i className="bi bi-tag me-1" style={{ color: 'var(--cf-primary)' }} />
                        {issue.category.name}
                      </p>
                    )}

                    {/* Status badge */}
                    <div style={{ marginBottom: '0.6rem' }}>
                      <StatusBadge status={issue.status} />
                    </div>

                    {/* Address */}
                    {issue.location?.address && (
                      <p style={{ margin: '0 0 0.55rem', fontSize: '0.75rem', color: 'var(--cf-text-muted)' }}>
                        <i className="bi bi-geo-alt me-1" />
                        {issue.location.address}
                      </p>
                    )}

                    {/* View details link */}
                    <Link
                      to={`/issue/${issue._id}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        background: 'var(--cf-primary)', color: '#fff',
                        padding: '0.35rem 0.75rem', borderRadius: 6,
                        fontSize: '0.78rem', fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <i className="bi bi-eye" /> View details
                    </Link>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
