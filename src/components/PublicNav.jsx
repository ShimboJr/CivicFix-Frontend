import { Link, NavLink } from 'react-router-dom';

/**
 * PublicNav — top navigation bar for logged-out visitors.
 *
 * Site-map coverage (Prompt scope):
 *   /           → Home          ✅ active
 *   /issues     → Issues        ✅ active
 *   /login      → Sign in       ✅ active
 *   /register   → Get started   ✅ active
 *
 * Intentionally deferred (not yet built):
 *   // <NavLink to="/about">About</NavLink>
 *   // <NavLink to="/how-it-works">How It Works</NavLink>
 *
 * Do NOT apply this nav to any authenticated route — those use
 * DashboardLayout / AdminLayout / StaffLayout which have their own nav.
 */
export default function PublicNav() {
  const linkStyle = {
    color: 'rgba(255,255,255,0.85)',
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    padding: '0.35rem 0.1rem',
    borderBottom: '2px solid transparent',
    transition: 'color var(--cf-transition), border-color var(--cf-transition)',
  };

  const activeLinkStyle = {
    ...linkStyle,
    color: '#fff',
    borderBottomColor: 'var(--cf-accent)',
  };

  return (
    <nav
      style={{
        background: 'var(--cf-primary)',
        padding: '0 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 60,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: 'var(--cf-shadow-md)',
      }}
    >
      {/* ── Brand ─────────────────────────────────────────────────────────── */}
      <Link
        to="/"
        style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', textDecoration: 'none' }}
      >
        <div
          style={{
            width: 32, height: 32,
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '1rem',
          }}
        >
          <i className="bi bi-building-check" />
        </div>
        <span
          style={{
            fontFamily: 'var(--cf-font-heading)',
            fontWeight: 700,
            fontSize: '1.15rem',
            color: '#fff',
            letterSpacing: '-0.2px',
          }}
        >
          Civic<span style={{ color: 'var(--cf-accent)' }}>Fix</span>
        </span>
      </Link>

      {/* ── Centre links ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.75rem' }}>
        <NavLink
          to="/"
          end
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => {
            // restore based on active state
            if (!e.currentTarget.getAttribute('aria-current')) {
              e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
            }
          }}
        >
          Home
        </NavLink>

        <NavLink
          to="/issues"
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => {
            if (!e.currentTarget.getAttribute('aria-current')) {
              e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
            }
          }}
        >
          Issues
        </NavLink>

        {/*
         * Deferred links — uncomment when pages are built:
         * <NavLink to="/about" style={...}>About</NavLink>
         * <NavLink to="/how-it-works" style={...}>How It Works</NavLink>
         */}
      </div>

      {/* ── Auth buttons ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Link
          to="/login"
          style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: '0.875rem',
            fontWeight: 500,
            textDecoration: 'none',
            padding: '0.45rem 0.9rem',
            borderRadius: 'var(--cf-radius-md)',
            border: '1.5px solid rgba(255,255,255,0.3)',
            transition: 'all var(--cf-transition)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
          }}
        >
          Sign in
        </Link>
        <Link
          to="/register"
          className="cf-btn cf-btn-accent"
          style={{ padding: '0.45rem 1rem', fontSize: '0.875rem' }}
        >
          Get started
        </Link>
      </div>
    </nav>
  );
}
