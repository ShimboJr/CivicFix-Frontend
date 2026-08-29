import { Link } from 'react-router-dom';

/**
 * Minimal landing page placeholder.
 * Full home page (hero, how-it-works, map preview) comes in a later prompt.
 */
export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cf-bg)' }}>

      {/* Slim top bar */}
      <nav style={{
        background:   'var(--cf-primary)',
        padding:      '0.9rem 2rem',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: 34, height: 34,
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '1rem',
          }}>
            <i className="bi bi-building-check"></i>
          </div>
          <span style={{ fontFamily: 'var(--cf-font-heading)', fontWeight: 700, fontSize: '1.2rem', color: '#fff' }}>
            Civic<span style={{ color: 'var(--cf-accent)' }}>Fix</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <Link to="/map"
            style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
          >
            <i className="bi bi-map" /> Community Map
          </Link>
          <Link to="/login"    className="cf-btn cf-btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', padding: '0.45rem 1rem', fontSize: '0.875rem' }}>Sign in</Link>
          <Link to="/register" className="cf-btn cf-btn-accent"  style={{ padding: '0.45rem 1rem', fontSize: '0.875rem' }}>Get started</Link>
        </div>
      </nav>

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
          <Link to="/login" className="cf-btn cf-btn-outline" style={{ padding: '0.75rem 1.75rem', fontSize: '1rem' }}>
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
