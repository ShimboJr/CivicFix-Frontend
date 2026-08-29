import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import DashboardLayout from '../components/DashboardLayout';
import IssueCard from '../components/IssueCard';

const STAT_CARDS = [
  { key: 'total',      label: 'Total Reports',  icon: 'bi-file-earmark-text', color: 'var(--cf-primary)' },
  { key: 'pending',    label: 'Pending',         icon: 'bi-clock',              color: '#f59e0b' },
  { key: 'inProgress', label: 'In Progress',     icon: 'bi-arrow-repeat',       color: '#06b6d4' },
  { key: 'resolved',   label: 'Resolved',        icon: 'bi-check-circle',       color: '#10b981' },
];

export default function ResidentDashboard() {
  const { user } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get('/issues/my-issues')
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      {/* ── Welcome bar ─────────────────────────────────────────────────── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   '1.75rem',
        flexWrap:       'wrap',
        gap:            '1rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', marginBottom: '0.2rem' }}>
            Welcome back, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p style={{ color: 'var(--cf-text-secondary)', fontSize: '0.875rem', margin: 0 }}>
            Here's a snapshot of your community reports.
          </p>
        </div>
        <Link to="/dashboard/report" className="cf-btn cf-btn-accent">
          <i className="bi bi-plus-circle"></i> Report an Issue
        </Link>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 90, borderRadius: 'var(--cf-radius-lg)',
              background: '#e5e7eb', animation: 'cf-pulse 1.4s ease infinite',
            }} />
          ))}
        </div>
      ) : error ? (
        <div className="cf-alert cf-alert-error" style={{ marginBottom: '1.5rem' }}>
          <i className="bi bi-exclamation-circle-fill"></i> {error}
        </div>
      ) : (
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap:                 '1rem',
          marginBottom:        '2rem',
        }}>
          {STAT_CARDS.map(({ key, label, icon, color }) => (
            <div key={key} className="cf-card" style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {label}
                </span>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: `${color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color,
                }}>
                  <i className={`bi ${icon}`} style={{ fontSize: '1rem' }}></i>
                </div>
              </div>
              <span style={{ fontSize: '1.75rem', fontWeight: 700, color, fontFamily: 'var(--cf-font-heading)', lineHeight: 1 }}>
                {data?.summary?.[key] ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Recent reports ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Recent Reports</h2>
        <Link to="/dashboard/my-reports" style={{ fontSize: '0.8125rem', color: 'var(--cf-primary)', fontWeight: 500 }}>
          View all <i className="bi bi-arrow-right"></i>
        </Link>
      </div>

      {!loading && !error && (
        data?.issues?.length === 0 ? (
          <div className="cf-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--cf-text-secondary)' }}>
            <i className="bi bi-inbox" style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem', opacity: 0.4 }}></i>
            <p style={{ margin: '0 0 1rem' }}>You haven't reported any issues yet.</p>
            <Link to="/dashboard/report" className="cf-btn cf-btn-primary">
              <i className="bi bi-plus-circle"></i> Report your first issue
            </Link>
          </div>
        ) : (
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap:                 '1rem',
          }}>
            {data?.issues?.slice(0, 6).map((issue) => (
              <IssueCard key={issue._id} issue={issue} />
            ))}
          </div>
        )
      )}
    </DashboardLayout>
  );
}
