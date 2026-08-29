import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import AdminLayout from '../components/AdminLayout';
import IssueCard   from '../components/IssueCard';
import StatusBadge from '../components/StatusBadge';

const STAT_CARDS = [
  { key: 'totalReports', label: 'Total Reports',  icon: 'bi-file-earmark-text', color: 'var(--cf-primary)' },
  { key: 'pending',      label: 'Pending',         icon: 'bi-clock',              color: '#f59e0b',          sub: 'byStatus' },
  { key: 'inProgress',  label: 'In Progress',      icon: 'bi-arrow-repeat',       color: '#06b6d4',          sub: 'byStatus' },
  { key: 'resolved',    label: 'Resolved',         icon: 'bi-check-circle',       color: '#10b981',          sub: 'byStatus' },
  { key: 'rejected',    label: 'Rejected',         icon: 'bi-x-circle',           color: '#ef4444',          sub: 'byStatus' },
];

function StatCard({ label, icon, color, value }) {
  return (
    <div className="cf-card" style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          <i className={`bi ${icon}`} style={{ fontSize: '1rem' }}></i>
        </div>
      </div>
      <span style={{ fontSize: '2rem', fontWeight: 700, color, fontFamily: 'var(--cf-font-heading)', lineHeight: 1 }}>
        {value ?? <span style={{ opacity: 0.3 }}>—</span>}
      </span>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats,   setStats]   = useState(null);
  const [recent,  setRecent]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/admin/stats'),
      api.get('/issues?limit=8&sortBy=newest'),
    ])
      .then(([s, i]) => { setStats(s.data); setRecent(i.data.issues); })
      .finally(() => setLoading(false));
  }, []);

  const getVal = (card) => {
    if (!stats) return undefined;
    if (card.sub === 'byStatus') return stats.byStatus?.[card.key];
    return stats[card.key];
  };

  return (
    <AdminLayout title="Dashboard">

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {STAT_CARDS.map((card) => (
          <StatCard key={card.key} label={card.label} icon={card.icon} color={card.color} value={getVal(card)} />
        ))}
      </div>

      {/* Quick links */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {[
          { to: '/admin/issues',     icon: 'bi-card-checklist', label: 'Manage Issues' },
          { to: '/admin/users',      icon: 'bi-people',          label: 'Manage Users' },
          { to: '/admin/categories', icon: 'bi-tags',            label: 'Categories' },
          { to: '/admin/analytics',  icon: 'bi-bar-chart-line',  label: 'Analytics' },
        ].map(({ to, icon, label }) => (
          <Link key={to} to={to} className="cf-btn cf-btn-outline" style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}>
            <i className={`bi ${icon}`}></i> {label}
          </Link>
        ))}
      </div>

      {/* Recent issues */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Recently Reported</h2>
        <Link to="/admin/issues" style={{ fontSize: '0.8125rem', color: 'var(--cf-primary)', fontWeight: 500 }}>
          View all <i className="bi bi-arrow-right"></i>
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
          {[...Array(4)].map((_, i) => <div key={i} style={{ height: 240, borderRadius: 12, background: '#e5e7eb' }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
          {recent.map((issue) => <IssueCard key={issue._id} issue={issue} />)}
        </div>
      )}
    </AdminLayout>
  );
}
