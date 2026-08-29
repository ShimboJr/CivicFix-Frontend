import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import StaffLayout from '../components/StaffLayout';
import IssueCard   from '../components/IssueCard';

const SEVERITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

const STAT_CARDS = [
  { key: 'total',      label: 'Total Assigned', icon: 'bi-inbox',         color: 'var(--cf-primary)' },
  { key: 'assigned',   label: 'Awaiting Start', icon: 'bi-hourglass',     color: '#8b5cf6' },
  { key: 'inProgress', label: 'In Progress',    icon: 'bi-arrow-repeat',  color: '#06b6d4' },
  { key: 'resolved',   label: 'Resolved',       icon: 'bi-check-circle',  color: '#10b981' },
];

export default function StaffDashboard() {
  const { user }          = useAuth();
  const navigate          = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get('/staff/my-issues')
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Sort open issues: Critical → High → Medium → Low, then by date
  const urgentIssues = (data?.issues || [])
    .filter((i) => i.status !== 'Resolved')
    .sort((a, b) => {
      const rankDiff = (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
      if (rankDiff !== 0) return rankDiff;
      return new Date(a.createdAt) - new Date(b.createdAt); // oldest first within same severity
    })
    .slice(0, 6);

  return (
    <StaffLayout>
      {/* ── Welcome bar ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', marginBottom: '0.2rem' }}>
            Welcome, {user?.name?.split(' ')[0]} 👷
          </h1>
          <p style={{ color: 'var(--cf-text-secondary)', fontSize: '0.875rem', margin: 0 }}>
            Here are the issues assigned to you.
          </p>
        </div>
        <Link to="/staff/assigned" className="cf-btn cf-btn-primary">
          <i className="bi bi-card-checklist"></i> All Assigned Issues
        </Link>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {[...Array(4)].map((_, i) => <div key={i} style={{ height: 88, borderRadius: 12, background: '#e5e7eb' }} />)}
        </div>
      ) : error ? (
        <div className="cf-alert cf-alert-error" style={{ marginBottom: '1.5rem' }}>
          <i className="bi bi-exclamation-circle-fill"></i> {error}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {STAT_CARDS.map(({ key, label, icon, color }) => (
            <div key={key} className="cf-card" style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {label}
                </span>
                <div style={{ width: 30, height: 30, borderRadius: 7, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
                  <i className={`bi ${icon}`} style={{ fontSize: '0.95rem' }}></i>
                </div>
              </div>
              <span style={{ fontSize: '1.85rem', fontWeight: 700, color, fontFamily: 'var(--cf-font-heading)', lineHeight: 1 }}>
                {data?.summary?.[key] ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Urgent open issues ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
          <i className="bi bi-exclamation-triangle me-2" style={{ color: '#f97316' }}></i>
          Most Urgent Open Issues
        </h2>
        <Link to="/staff/assigned" style={{ fontSize: '0.8125rem', color: 'var(--cf-primary)', fontWeight: 500 }}>
          View all <i className="bi bi-arrow-right"></i>
        </Link>
      </div>

      {!loading && !error && (
        urgentIssues.length === 0 ? (
          <div className="cf-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--cf-text-secondary)' }}>
            <i className="bi bi-check2-all" style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem', color: '#10b981', opacity: 0.7 }}></i>
            <p style={{ margin: 0, fontWeight: 500 }}>No open issues — all caught up! 🎉</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
            {urgentIssues.map((issue) => (
              <div key={issue._id}
                onClick={() => navigate(`/staff/issue/${issue._id}`)}
                style={{ cursor: 'pointer' }}>
                <IssueCard issue={issue} />
              </div>
            ))}
          </div>
        )
      )}
    </StaffLayout>
  );
}
