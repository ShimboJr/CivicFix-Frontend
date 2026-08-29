import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import api from '../services/api';
import AdminLayout from '../components/AdminLayout';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convert decimal hours to a human-readable string (minutes / hours / days) */
function formatHours(h) {
  if (h === null || h === undefined) return '—';
  if (h < 1)   return `${Math.round(h * 60)} min`;
  if (h < 24)  return `${h.toFixed(1)} hrs`;
  return `${(h / 24).toFixed(1)} days`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid var(--cf-border)', borderRadius: 8, padding: '0.6rem 0.9rem', fontSize: '0.82rem', boxShadow: 'var(--cf-shadow-md)' }}>
      <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ margin: 0, color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

// ── Month-window options ───────────────────────────────────────────────────────
const MONTH_OPTIONS = [
  { label: '6 mo',  value: 6  },
  { label: '12 mo', value: 12 },
  { label: '24 mo', value: 24 },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function Analytics() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [months,     setMonths]     = useState(12); // controlled window param

  const fetchAnalytics = useCallback((m) => {
    setLoading(true);
    setError('');
    api.get(`/admin/analytics?months=${m}`)
      .then(({ data }) => setData(data))
      .catch((err)   => setError(err.response?.data?.message || err.message))
      .finally(()    => setLoading(false));
  }, []);

  // Initial fetch + re-fetch whenever months changes
  useEffect(() => { fetchAnalytics(months); }, [months, fetchAnalytics]);

  // Derived chart data
  const monthlyData  = (data?.byMonth || []).map((m) => ({
    name:   `${MONTH_NAMES[m._id.month - 1]} '${String(m._id.year).slice(2)}`,
    issues: m.count,
  }));
  const categoryData = (data?.byCategory || []).map((c) => ({
    name:  c._id,
    count: c.count,
  })).sort((a, b) => b.count - a.count);

  const problemAreas   = data?.problemAreas         || [];
  const avgOverall     = data?.avgResolutionTime?.overall;
  const avgByCategory  = data?.avgResolutionTime?.byCategory || [];
  const maxAreaCount   = problemAreas[0]?.count || 1;

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <AdminLayout title="Analytics">
        <div className="cf-spinner-wrap" style={{ minHeight: '60vh' }}><div className="cf-spinner" /></div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Analytics">
        <div className="cf-alert cf-alert-error"><i className="bi bi-exclamation-circle-fill" /> {error}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Analytics">

      {/* ── Top stat row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        {[
          {
            label: 'Resolution Rate',
            value: data?.resolutionRate,
            icon:  'bi-check2-circle',
            color: '#10b981',
          },
          {
            label: 'Avg Resolution Time',
            value: formatHours(avgOverall),
            icon:  'bi-clock-history',
            color: '#8b5cf6',
          },
          {
            label: 'Top Location',
            value: problemAreas[0]?.address || data?.topLocations?.[0]?.location || '—',
            icon:  'bi-geo-alt',
            color: 'var(--cf-primary)',
          },
          {
            label: 'Top Category',
            value: categoryData[0]?.name || '—',
            icon:  'bi-tag',
            color: '#f59e0b',
          },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="cf-card" style={{ padding: '1.1rem 1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <i className={`bi ${icon}`} style={{ color, fontSize: '1.1rem' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color, fontFamily: 'var(--cf-font-heading)', wordBreak: 'break-word', lineHeight: 1.2 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

        {/* ── Issues by Category — Horizontal Bar ───────────────────────── */}
        <div className="cf-card">
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1.25rem' }}>
            <i className="bi bi-bar-chart-horizontal me-2" style={{ color: 'var(--cf-primary)' }} />
            Issues by Category
          </h2>
          {categoryData.length === 0 ? (
            <p style={{ color: 'var(--cf-text-muted)', fontSize: '0.875rem' }}>No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--cf-border-light)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--cf-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: 'var(--cf-text-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Issues" fill="var(--cf-primary)" radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Issues over Time — Line Chart (with window control) ─────────── */}
        <div className="cf-card">
          {/* Header row: title + 6/12/24 month toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
              <i className="bi bi-graph-up me-2" style={{ color: 'var(--cf-accent)' }} />
              Issues per Month
            </h2>

            {/* Month-window button group */}
            <div style={{
              display: 'flex',
              background: 'var(--cf-bg)',
              border: '1.5px solid var(--cf-border)',
              borderRadius: 'var(--cf-radius-md)',
              overflow: 'hidden',
            }}>
              {MONTH_OPTIONS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setMonths(value)}
                  style={{
                    padding: '0.3rem 0.7rem',
                    border: 'none',
                    borderRight: value !== 24 ? '1px solid var(--cf-border)' : 'none',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: months === value ? 700 : 400,
                    background: months === value ? 'var(--cf-primary)' : 'transparent',
                    color:      months === value ? '#fff' : 'var(--cf-text-secondary)',
                    transition: 'background 120ms, color 120ms',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="cf-spinner" />
            </div>
          ) : monthlyData.length === 0 ? (
            <p style={{ color: 'var(--cf-text-muted)', fontSize: '0.875rem' }}>Not enough data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyData} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cf-border-light)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--cf-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--cf-text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="issues" name="Issues" stroke="var(--cf-accent)" strokeWidth={2.5} dot={{ fill: 'var(--cf-accent)', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Most Problematic Areas ────────────────────────────────────── */}
        <div className="cf-card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
              <i className="bi bi-exclamation-triangle me-2" style={{ color: '#f59e0b' }} />
              Most Problematic Areas
              <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', fontWeight: 400, color: 'var(--cf-text-muted)' }}>
                (grouped by ~100 m coordinate bucket)
              </span>
            </h2>
            <Link
              to="/map"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                fontSize: '0.8rem', fontWeight: 600, color: 'var(--cf-primary)',
                textDecoration: 'none',
              }}
            >
              <i className="bi bi-map" /> View on map →
            </Link>
          </div>

          {problemAreas.length === 0 ? (
            <p style={{ color: 'var(--cf-text-muted)', fontSize: '0.875rem' }}>
              No location data yet — issues need coordinates (from the map picker) to appear here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {problemAreas.map((area, i) => {
                const pct = Math.round((area.count / maxAreaCount) * 100);
                return (
                  <Link
                    key={i}
                    to="/map"
                    style={{ display: 'flex', alignItems: 'center', gap: '1rem', textDecoration: 'none', color: 'inherit', padding: '0.4rem 0.25rem', borderRadius: 6, transition: 'background 120ms' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cf-bg)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Rank badge */}
                    <span style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : 'var(--cf-border)',
                      color: i < 3 ? '#fff' : 'var(--cf-text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', fontWeight: 700,
                    }}>
                      {i + 1}
                    </span>

                    {/* Address */}
                    <span style={{
                      flex: 1, fontSize: '0.85rem', fontWeight: 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: 'var(--cf-text)',
                    }}>
                      {area.address || `${area.lat}, ${area.lng}`}
                    </span>

                    {/* Mini bar */}
                    <div style={{ width: 140, background: 'var(--cf-border-light)', borderRadius: 999, height: 8, flexShrink: 0 }}>
                      <div style={{
                        width: `${pct}%`, height: '100%', borderRadius: 999,
                        background: i === 0 ? '#f59e0b' : 'var(--cf-primary)',
                        transition: 'width 600ms ease',
                      }} />
                    </div>

                    {/* Count badge */}
                    <span style={{
                      minWidth: 28, textAlign: 'right', flexShrink: 0,
                      fontSize: '0.82rem', fontWeight: 700,
                      color: 'var(--cf-primary)',
                    }}>
                      {area.count}
                    </span>

                    {/* Coordinates sub-label */}
                    <span style={{ fontSize: '0.68rem', color: 'var(--cf-text-muted)', flexShrink: 0, fontFamily: 'monospace' }}>
                      {area.lat}, {area.lng}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Average Resolution Time ───────────────────────────────────── */}
        <div className="cf-card" style={{ gridColumn: '1 / -1' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}>
            <i className="bi bi-clock-history me-2" style={{ color: '#8b5cf6' }} />
            Average Resolution Time
          </h2>

          {avgOverall === null ? (
            <p style={{ color: 'var(--cf-text-muted)', fontSize: '0.875rem' }}>
              No resolved issues yet — this stat will appear once at least one issue reaches "Resolved" status.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.5rem', alignItems: 'start' }}>

              {/* Headline figure */}
              <div style={{
                padding: '1.25rem 1.75rem',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                borderRadius: 'var(--cf-radius-lg)',
                textAlign: 'center', flexShrink: 0,
              }}>
                <div style={{ fontSize: '2.25rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--cf-font-heading)', lineHeight: 1 }}>
                  {formatHours(avgOverall)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Overall average
                </div>
              </div>

              {/* Per-category breakdown */}
              {avgByCategory.length > 0 && (
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.65rem' }}>
                    By Category
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {avgByCategory.map((row) => {
                      const maxHrs = avgByCategory[0]?.avgHours || 1;
                      const pct    = Math.round((row.avgHours / maxHrs) * 100);
                      return (
                        <div key={row.category} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ width: 130, fontSize: '0.82rem', color: 'var(--cf-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {row.category}
                          </span>
                          <div style={{ flex: 1, background: 'var(--cf-border-light)', borderRadius: 999, height: 8 }}>
                            <div style={{
                              width: `${pct}%`, height: '100%', borderRadius: 999,
                              background: 'linear-gradient(90deg, #8b5cf6, #6d28d9)',
                              transition: 'width 600ms ease',
                            }} />
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8b5cf6', width: 64, textAlign: 'right', flexShrink: 0 }}>
                            {formatHours(row.avgHours)}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--cf-text-muted)', flexShrink: 0 }}>
                            ({row.count} issue{row.count !== 1 ? 's' : ''})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Top Locations (legacy address-based — kept for reference) ──── */}
        {data?.topLocations?.length > 0 && (
          <div className="cf-card" style={{ gridColumn: '1 / -1' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}>
              <i className="bi bi-geo-alt me-2" style={{ color: 'var(--cf-primary)' }} />
              Top 5 Locations by Address
              <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', fontWeight: 400, color: 'var(--cf-text-muted)' }}>
                (raw address string — use "Most Problematic Areas" above for coordinate-aware ranking)
              </span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {data.topLocations.map((loc, i) => {
                const max = data.topLocations[0]?.count || 1;
                const pct = Math.round((loc.count / max) * 100);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ width: 18, color: 'var(--cf-text-muted)', fontSize: '0.78rem', textAlign: 'right', flexShrink: 0 }}>#{i + 1}</span>
                    <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.location}</span>
                    <div style={{ width: 160, background: 'var(--cf-border-light)', borderRadius: 999, height: 8, flexShrink: 0 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--cf-primary)', borderRadius: 999, transition: 'width 600ms ease' }} />
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cf-primary)', width: 28, textAlign: 'right', flexShrink: 0 }}>{loc.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* ── Seed data note ────────────────────────────────────────────────── */}
      <p style={{
        marginTop: '1.5rem', padding: '0.75rem 1rem',
        background: 'var(--cf-surface)', border: '1px solid var(--cf-border-light)',
        borderRadius: 'var(--cf-radius-md)', fontSize: '0.78rem', color: 'var(--cf-text-muted)',
      }}>
        <i className="bi bi-info-circle me-1" />
        <strong>Demo data note:</strong> Problem areas and resolution times are only as meaningful as the underlying data.
        With a handful of seeded issues, expect single-issue buckets and resolution times measured in minutes.
        Expand seed data before a live demo for realistic-looking charts.
      </p>

    </AdminLayout>
  );
}
