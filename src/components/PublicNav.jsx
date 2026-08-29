import { useState, useCallback } from 'react';
import { Link, NavLink } from 'react-router-dom';

/**
 * PublicNav — top navigation bar for logged-out visitors.
 *
 * Responsive strategy:
 *   lg+ (≥992 px):  standard horizontal layout — brand left, links centre, auth right.
 *   < lg (mobile):  brand + hamburger on one row; tapping hamburger reveals the
 *                   nav links and auth buttons stacked vertically below.
 *
 * Bootstrap JS is NOT loaded in this project — the collapse open/close is driven by
 * React `useState`.  Bootstrap's `.collapse` / `.collapse.show` CSS classes handle
 * `display:none` vs `display:block` without any JS plugin.
 *
 * Site-map coverage:
 *   /         → Home        ✅
 *   /issues   → Issues      ✅
 *   /login    → Sign in     ✅
 *   /register → Get started ✅
 *
 * Intentionally deferred (not yet built):
 *   // <NavLink to="/about">About</NavLink>
 *   // <NavLink to="/how-it-works">How It Works</NavLink>
 *
 * Do NOT apply this nav to any authenticated route — those use DashboardLayout /
 * AdminLayout / StaffLayout which carry their own sidebar navigation.
 */
export default function PublicNav() {
  const [open, setOpen] = useState(false);

  // Shared close callback — passed to every NavLink so the panel collapses
  // as soon as the user taps a link on mobile.
  const close = useCallback(() => setOpen(false), []);

  // ── Nav-link style function ──────────────────────────────────────────────
  // Active state: white text + bold + accent bottom-border (underline indicator).
  // The border-bottom shows as a text-underline on mobile (acceptable) and as a
  // tab-style underline indicator on the desktop horizontal bar (intended).
  const navLinkStyle = ({ isActive }) => ({
    color:          isActive ? '#fff' : 'rgba(255,255,255,0.82)',
    fontWeight:     isActive ? 600 : 500,
    fontSize:       '0.875rem',
    textDecoration: 'none',
    padding:        '0.4rem 0',
    paddingBottom:  isActive ? 'calc(0.4rem - 2px)' : '0.4rem',  // compensate for border height
    display:        'block',
    borderBottom:   isActive ? '2px solid var(--cf-accent)' : '2px solid transparent',
    transition:     'color 150ms, border-color 150ms',
  });

  return (
    <nav
      className="navbar navbar-expand-lg"
      style={{
        background:  'var(--cf-primary)',
        position:    'sticky',
        top:         0,
        zIndex:      200,
        boxShadow:   'var(--cf-shadow-md)',
        padding:     '0.4rem 1.5rem',
      }}
    >
      {/* ── Brand ──────────────────────────────────────────────────────────── */}
      <Link
        to="/"
        className="navbar-brand"
        onClick={close}
        style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', textDecoration: 'none', padding: 0 }}
      >
        <div style={{
          width: 32, height: 32,
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '1rem',
        }}>
          <i className="bi bi-building-check" />
        </div>
        <span style={{
          fontFamily:    'var(--cf-font-heading)',
          fontWeight:    700,
          fontSize:      '1.15rem',
          color:         '#fff',
          letterSpacing: '-0.2px',
        }}>
          Civic<span style={{ color: 'var(--cf-accent)' }}>Fix</span>
        </span>
      </Link>

      {/* ── Hamburger toggler (hidden at lg+, visible below lg) ────────────── */}
      {/* Bootstrap's .navbar-toggler inside .navbar-expand-lg is automatically
          hidden at ≥992 px via Bootstrap's CSS — no extra d-lg-none needed.   */}
      <button
        type="button"
        className="navbar-toggler"
        aria-expanded={open}
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        onClick={() => setOpen((v) => !v)}
        style={{
          background:  'rgba(255,255,255,0.1)',
          border:      '1px solid rgba(255,255,255,0.28)',
          borderRadius: 6,
          padding:     '0.32rem 0.58rem',
          cursor:      'pointer',
          lineHeight:  1,
          boxShadow:   'none',   /* suppress Bootstrap's focus ring colour */
        }}
      >
        {/* Swap icon so the button communicates its current state */}
        <i
          className={`bi ${open ? 'bi-x-lg' : 'bi-list'}`}
          style={{ fontSize: '1.2rem', color: '#fff', display: 'block' }}
        />
      </button>

      {/* ── Collapsible panel ──────────────────────────────────────────────── */}
      {/* Bootstrap's .collapse hides the div (display:none) below lg.
          Adding .show makes it display:block — no JS plugin required.
          At lg+ Bootstrap overrides back to flex regardless of the show class. */}
      <div className={`navbar-collapse collapse${open ? ' show' : ''}`}>

        {/* ── Centre nav links ───────────────────────────────────────────── */}
        {/* gap-4 provides the horizontal space between items at lg+.         */}
        <ul className="navbar-nav mx-auto mb-3 mb-lg-0 gap-lg-4">

          <li className="nav-item">
            <NavLink to="/" end onClick={close} className="nav-link" style={navLinkStyle}>
              Home
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink to="/issues" onClick={close} className="nav-link" style={navLinkStyle}>
              Issues
            </NavLink>
          </li>

          {/*
           * Deferred links — uncomment and add routes when pages are built:
           * <li className="nav-item">
           *   <NavLink to="/about" onClick={close} className="nav-link" style={navLinkStyle}>About</NavLink>
           * </li>
           * <li className="nav-item">
           *   <NavLink to="/how-it-works" onClick={close} className="nav-link" style={navLinkStyle}>How It Works</NavLink>
           * </li>
           */}
        </ul>

        {/* ── Auth buttons ───────────────────────────────────────────────── */}
        {/* flex-column on mobile so both buttons stack; flex-row at lg+.
            align-items-start keeps them left-aligned (not stretched) in column. */}
        <div className="d-flex flex-column flex-lg-row align-items-start align-items-lg-center gap-2 pb-2 pb-lg-0">

          {/* Sign in — ghost button style, kept consistent in both layouts */}
          <Link
            to="/login"
            onClick={close}
            style={{
              color:        'rgba(255,255,255,0.85)',
              fontSize:     '0.875rem',
              fontWeight:   500,
              textDecoration: 'none',
              padding:      '0.45rem 0.9rem',
              borderRadius: 'var(--cf-radius-md)',
              border:       '1.5px solid rgba(255,255,255,0.3)',
              transition:   'all var(--cf-transition)',
              display:      'inline-block',
              whiteSpace:   'nowrap',
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

          {/* Get started — accent-filled button, visually distinct in both
              desktop and mobile collapsed menus (uses the shared cf-btn class). */}
          <Link
            to="/register"
            onClick={close}
            className="cf-btn cf-btn-accent"
            style={{ padding: '0.45rem 1rem', fontSize: '0.875rem', whiteSpace: 'nowrap' }}
          >
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}
