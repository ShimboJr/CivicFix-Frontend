import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import api from '../services/api';
import AdminLayout from '../components/AdminLayout';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

export default function Analytics() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get('/admin/analytics')
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Transform byMonth into chart data
  const monthlyData = (data?.byMonth || []).map((m) => ({
    name:  `${MONTH_NAMES[m._id.month - 1]} '${String(m._id.year).slice(2)}`,
    issues: m.count,
  }));

  // Transform byCategory
  const categoryData = (data?.byCategory || []).map((c) => ({
    name:  c._id,
    count: c.count,
  })).sort((a, b) => b.count - a.count);

  if (loading) {
    return (
      <AdminLayout title="Analytics">
        <div className="cf-spinner-wrap" style={{ minHeight: '60vh' }}><div className="cf-spinner"></div></div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Analytics">
        <div className="cf-alert cf-alert-error"><i className="bi bi-exclamation-circle-fill"></i> {error}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Analytics">

      {/* ── Top stat row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        {[
          { label: 'Resolution Rate', value: data?.resolutionRate, icon: 'bi-check2-circle', color: '#10b981' },
          { label: 'Top Location',    value: data?.topLocations?.[0]?.location || '—', icon: 'bi-geo-alt', color: 'var(--cf-primary)' },
          { label: 'Top Category',    value: categoryData[0]?.name || '—', icon: 'bi-tag', color: '#f59e0b' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="cf-card" style={{ padding: '1.1rem 1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <i className={`bi ${icon}`} style={{ color, fontSize: '1.1rem' }}></i>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color, fontFamily: 'var(--cf-font-heading)' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

        {/* ── Issues by Category — Horizontal Bar ───────────────────────── */}
        <div className="cf-card">
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1.25rem' }}>
            <i className="bi bi-bar-chart-horizontal me-2" style={{ color: 'var(--cf-primary)' }}></i>
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

        {/* ── Issues over Time — Line Chart ──────────────────────────────── */}
        <div className="cf-card">
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1.25rem' }}>
            <i className="bi bi-graph-up me-2" style={{ color: 'var(--cf-accent)' }}></i>
            Issues per Month (Last 6 Months)
          </h2>
          {monthlyData.length === 0 ? (
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

        {/* ── Top Locations ─────────────────────────────────────────────── */}
        {data?.topLocations?.length > 0 && (
          <div className="cf-card" style={{ gridColumn: '1 / -1' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}>
              <i className="bi bi-geo-alt me-2" style={{ color: 'var(--cf-primary)' }}></i>
              Top 5 Locations by Report Volume
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
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--cf-primary)', borderRadius: 999, transition: 'width 600ms ease' }}></div>
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--cf-primary)', width: 28, textAlign: 'right', flexShrink: 0 }}>{loc.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
