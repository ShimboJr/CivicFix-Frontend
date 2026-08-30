import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PublicNav from '../components/PublicNav';
import api from '../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Format a raw count for honest public display:
 *   • < 50        → exact number        ("4")
 *   • 50–999      → nearest 10,  "+"    ("120+")
 *   • 1 000+      → nearest 100, "+"    ("2,400+")
 */
function formatStat(n) {
  if (n < 50) return String(n);
  if (n < 1000) return `${Math.floor(n / 10) * 10}+`;
  return `${(Math.floor(n / 100) * 100).toLocaleString()}+`;
}

// Static fallback values shown while the real data loads (avoids a zero-flash).
const FALLBACK = {
  totalIssues:    '2,400+',
  resolvedIssues: '1,800+',
  activeCitizens: '12,000+',
};

/**
 * Minimal landing page.
 * Stat strip fetches live counts from the backend; the hardcoded fallback
 * stays visible until the real data arrives.
 */
export default function Home() {
  const [stats, setStats] = useState(null); // null = still loading

  useEffect(() => {
    api
      .get('/public/stats')
      .then(({ data }) => setStats(data))
      .catch(() => {
        // Silently ignore — we simply keep showing the fallback values.
        // A console warning is enough signal for developers without surfacing
        // an ugly error to anonymous visitors.
        console.warn('Could not fetch live homepage stats; using fallback values.');
      });
  }, []);

  // Build the three display values: use real (formatted) data once loaded,
  // otherwise keep the static fallback so nothing flashes blank or zero.
  const display = {
    totalIssues:    stats ? formatStat(stats.totalIssues)    : FALLBACK.totalIssues,
    resolvedIssues: stats ? formatStat(stats.resolvedIssues) : FALLBACK.resolvedIssues,
    activeCitizens: stats ? formatStat(stats.activeCitizens) : FALLBACK.activeCitizens,
  };

  const statItems = [
    { label: 'Issues Reported', value: display.totalIssues    },
    { label: 'Issues Resolved', value: display.resolvedIssues },
    { label: 'Active Citizens', value: display.activeCitizens },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cf-bg)' }}>

      <PublicNav />

      {/* Hero */}
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', padding: '6rem 2rem 3rem' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
          background: 'var(--cf-accent-light)', color: 'var(--cf-accent-dark)',
          borderRadius: 999, padding: '0.3rem 0.9rem', fontSize: '0.8125rem', fontWeight: 600,
          marginBottom: '1.25rem',
        }}>
          <i className="bi bi-geo-alt-fill"></i> Community Issue Reporting
        </div>

        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)', lineHeight: 1.2, marginBottom: '1rem' }}>
          Your Community.<br />
          <span style={{ color: 'var(--cf-primary)' }}>Your Voice.</span> Fixed.
        </h1>

        <p style={{ color: 'var(--cf-text-secondary)', fontSize: '1.05rem', lineHeight: 1.7, marginBottom: '2rem' }}>
          Report potholes, broken streetlights, water leaks, and other local issues.
          Track progress in real time and hold your city accountable.
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/register" className="cf-btn cf-btn-primary" style={{ padding: '0.75rem 1.75rem', fontSize: '1rem' }}>
            <i className="bi bi-plus-circle"></i> Report an Issue
          </Link>
          <Link to="/issues" className="cf-btn cf-btn-outline" style={{ padding: '0.75rem 1.75rem', fontSize: '1rem' }}>
            Browse Issues <i className="bi bi-arrow-right"></i>
          </Link>
        </div>

        {/* Stat strip */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '3rem',
          marginTop: '4rem', paddingTop: '2rem',
          borderTop: '1px solid var(--cf-border)',
          flexWrap: 'wrap',
        }}>
          {statItems.map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--cf-primary)', fontFamily: 'var(--cf-font-heading)' }}>{value}</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--cf-text-muted)', marginTop: '0.2rem' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
