import { Link } from 'react-router-dom';
import PublicNav from '../components/PublicNav';

/**
 * Minimal landing page placeholder.
 * Full home page (hero, how-it-works, map preview) comes in a later prompt.
 */
export default function Home() {
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
          {[
            { label: 'Issues Reported',  value: '2,400+' },
            { label: 'Issues Resolved',  value: '1,800+' },
            { label: 'Active Citizens',  value: '12,000+' },
          ].map(({ label, value }) => (
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
