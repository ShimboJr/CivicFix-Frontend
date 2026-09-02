import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import AdminLayout from '../components/AdminLayout';
import IssueCard   from '../components/IssueCard';
import StatusBadge from '../components/StatusBadge';
import { subscribeToPush } from '../utils/pushNotifications';

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

// ── PushAlertBanner ────────────────────────────────────────────────────────────
//
// Shown only to admin users whose browser:
//   • Supports the Push API (PushManager in window)
//   • Has not yet granted notification permission for this site
//
// Once the admin clicks and grants permission the banner disappears for the
// rest of the session (and on future visits — Notification.permission will be
// 'granted' and the banner won't render).
function PushAlertBanner({ token }) {
  const [visible,  setVisible]  = useState(false);
  const [working,  setWorking]  = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Show only when push is supported AND permission is not yet 'granted'.
    // 'default' = never asked; 'denied' = admin blocked it (banner can't help).
    if (
      'PushManager' in window &&
      'Notification' in window &&
      Notification.permission !== 'granted'
    ) {
      setVisible(true);
    }
  }, []);

  const handleEnable = useCallback(async () => {
    setWorking(true);
    setErrorMsg('');
    try {
      await subscribeToPush(token);
      setVisible(false); // success — hide the banner
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setWorking(false);
    }
  }, [token]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      style={{
        display:      'flex',
        alignItems:   'flex-start',
        gap:          '0.75rem',
        background:   'linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)',
        border:       '1px solid #fca5a5',
        borderRadius: 'var(--cf-radius-md)',
        padding:      '0.9rem 1.1rem',
        marginBottom: '1.5rem',
        color:        '#fff',
        fontSize:     '0.875rem',
        lineHeight:   1.5,
      }}
    >
      {/* Icon */}
      <i
        className="bi bi-bell-fill"
        style={{ fontSize: '1.25rem', flexShrink: 0, marginTop: '0.1rem', opacity: 0.9 }}
      />

      {/* Text + action */}
      <div style={{ flex: 1 }}>
        <strong style={{ display: 'block', marginBottom: '0.2rem' }}>
          Enable urgent emergency alerts
        </strong>
        <span style={{ opacity: 0.9 }}>
          Get an instant push notification on this device whenever a new emergency
          report is submitted — even when this tab is closed.
        </span>

        {errorMsg && (
          <p style={{ margin: '0.45rem 0 0', fontSize: '0.8rem', color: '#fecaca' }}>
            <i className="bi bi-exclamation-circle" /> {errorMsg}
          </p>
        )}

        <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            id="push-enable-btn"
            onClick={handleEnable}
            disabled={working}
            style={{
              background:   working ? 'rgba(255,255,255,0.2)' : '#fff',
              color:        working ? '#fff' : '#b91c1c',
              border:       'none',
              borderRadius: '6px',
              padding:      '0.35rem 0.9rem',
              fontWeight:   700,
              fontSize:     '0.8rem',
              cursor:       working ? 'not-allowed' : 'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          '0.35rem',
              transition:   'background 0.15s',
            }}
          >
            {working ? (
              <><i className="bi bi-hourglass-split" /> Enabling…</>
            ) : (
              <><i className="bi bi-bell-fill" /> Enable alerts</>
            )}
          </button>

          <button
            id="push-dismiss-btn"
            onClick={() => setVisible(false)}
            style={{
              background:   'transparent',
              color:        'rgba(255,255,255,0.75)',
              border:       '1px solid rgba(255,255,255,0.3)',
              borderRadius: '6px',
              padding:      '0.35rem 0.9rem',
              fontWeight:   500,
              fontSize:     '0.8rem',
              cursor:       'pointer',
            }}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user, token } = useAuth();

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

      {/* Push alert opt-in banner — admin only, hidden once granted */}
      {user?.role === 'admin' && <PushAlertBanner token={token} />}

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
            <i className={`bi ${icon}`} /> {label}
          </Link>
        ))}
      </div>

      {/* Recent issues */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Recently Reported</h2>
        <Link to="/admin/issues" style={{ fontSize: '0.8125rem', color: 'var(--cf-primary)', fontWeight: 500 }}>
          View all <i className="bi bi-arrow-right" />
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
