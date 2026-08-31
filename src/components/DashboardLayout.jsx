/**
 * DashboardLayout.jsx — single responsive shell for ALL authenticated roles.
 *
 * Desktop (≥992 px / Bootstrap `lg`):
 *   Persistent 230 px sidebar, exactly as before.
 *
 * Mobile (<992 px):
 *   • 52 px sticky top bar  — hamburger | brand | NotificationBell | avatar
 *   • Off-canvas drawer     — slides in from left, backdrop closes it,
 *                             NavLink taps also close it
 *   • Main content          — full width, minWidth:0 prevents flex overflow
 *
 * AdminLayout and StaffLayout re-export this component so every page import
 * continues to work without touching a single page file.
 *
 * IMPORTANT: NavItems, SidebarLogo, SidebarFooter are defined at MODULE scope,
 * not inside DashboardLayout's render function.  Defining sub-components inside
 * a render function gives them a new reference identity on every render, causing
 * React to unmount + remount the subtree (focus-loss bug, flicker, etc.).
 */

import { useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

// ── Per-role sidebar configuration ───────────────────────────────────────────
const ROLE_CONFIG = {
  resident: {
    sidebarBg:    'var(--cf-primary)',          // deep civic teal
    logoIconBg:   'rgba(255,255,255,0.15)',
    logoIcon:     'bi-building-check',
    sectionLabel: 'Resident Portal',
    avatarBg:     'var(--cf-accent)',
    nav: [
      { to: '/dashboard',              icon: 'bi-house',           label: 'Overview',        end: true },
      { to: '/dashboard/report',       icon: 'bi-plus-circle',     label: 'Report Issue' },
      { to: '/dashboard/my-reports',   icon: 'bi-card-checklist',  label: 'My Reports' },
      { to: '/map',                    icon: 'bi-map',             label: 'Community Map' },
      // Emergency link — visually distinct from routine nav items
      { to: '/dashboard/report-emergency', icon: 'bi-exclamation-triangle-fill', label: 'Report Emergency', emergency: true },
    ],
  },
  admin: {
    sidebarBg:    '#0d1b2a',
    logoIconBg:   'var(--cf-accent)',
    logoIcon:     'bi-shield-check',
    sectionLabel: 'Management',
    avatarBg:     'var(--cf-accent)',
    nav: [
      { to: '/admin',            icon: 'bi-speedometer2',   label: 'Dashboard',  end: true },
      { to: '/admin/issues',     icon: 'bi-card-checklist', label: 'Issues' },
      { to: '/admin/users',      icon: 'bi-people',         label: 'Users' },
      { to: '/admin/categories', icon: 'bi-tags',           label: 'Categories' },
      { to: '/admin/analytics',  icon: 'bi-bar-chart-line', label: 'Analytics' },
    ],
  },
  staff: {
    sidebarBg:    '#1a3a2a',
    logoIconBg:   '#10b981',
    logoIcon:     'bi-tools',
    sectionLabel: 'My Work',
    avatarBg:     '#10b981',
    nav: [
      { to: '/staff',          icon: 'bi-house',          label: 'Overview',        end: true },
      { to: '/staff/assigned', icon: 'bi-card-checklist', label: 'Assigned Issues' },
    ],
  },
};

// ── NavItems — module-scope to keep reference stable across renders ───────────
function NavItems({ cfg, onLinkClick }) {
  return (
    <>
      <p style={{
        fontSize: '0.6875rem', fontWeight: 700,
        color: 'rgba(255,255,255,0.38)',
        textTransform: 'uppercase', letterSpacing: '0.09em',
        padding: '0 0.6rem', marginBottom: '0.5rem',
        marginTop: '0.25rem',
      }}>
        {cfg.sectionLabel}
      </p>

      {cfg.nav.map(({ to, icon, label, end, emergency }) => (
        emergency
          /* ── Emergency link: always red, never blends with routine items ── */
          ? (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onLinkClick}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: '0.65rem',
                padding: '0.58rem 0.75rem',
                borderRadius: 8, marginBottom: '0.2rem',
                // Active: solid red; Inactive: red-tinted with border
                color:      '#fff',
                background: isActive ? '#b91c1c' : 'rgba(239,68,68,0.18)',
                border:     isActive ? '1px solid #b91c1c' : '1px solid rgba(239,68,68,0.45)',
                fontWeight: 700,
                fontSize:   '0.9rem', textDecoration: 'none',
                transition: 'background 140ms, border-color 140ms',
                marginTop:  '0.5rem', // extra gap above emergency link
              })}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#b91c1c';
                e.currentTarget.style.borderColor = '#b91c1c';
              }}
              onMouseLeave={(e) => {
                const active = e.currentTarget.getAttribute('aria-current') === 'page';
                e.currentTarget.style.background  = active ? '#b91c1c' : 'rgba(239,68,68,0.18)';
                e.currentTarget.style.borderColor = active ? '#b91c1c' : 'rgba(239,68,68,0.45)';
              }}
            >
              <i className={`bi ${icon}`} style={{ fontSize: '1rem', flexShrink: 0 }} />
              {label}
            </NavLink>
          )
          /* ── Regular nav link ──────────────────────────────────────────── */
          : (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onLinkClick}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: '0.65rem',
                padding: '0.58rem 0.75rem', borderRadius: 8, marginBottom: '0.2rem',
                color:      isActive ? '#fff' : 'rgba(255,255,255,0.62)',
                background: isActive ? 'rgba(255,255,255,0.14)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
                fontSize:   '0.9rem', textDecoration: 'none',
                transition: 'background 140ms, color 140ms',
              })}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.09)';
              }}
              onMouseLeave={(e) => {
                const active = e.currentTarget.getAttribute('aria-current') === 'page';
                e.currentTarget.style.background = active ? 'rgba(255,255,255,0.14)' : 'transparent';
              }}
            >
              <i className={`bi ${icon}`} style={{ fontSize: '1rem', flexShrink: 0 }} />
              {label}
            </NavLink>
          )
      ))}
    </>
  );
}

// ── Sidebar logo block ────────────────────────────────────────────────────────
function SidebarLogo({ cfg }) {
  return (
    <div style={{ padding: '1.4rem 1.25rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 7,
          background: cfg.logoIconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '0.95rem',
        }}>
          <i className={`bi ${cfg.logoIcon}`} />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--cf-font-heading)', fontWeight: 700, fontSize: '1.05rem', color: '#fff' }}>
            Civic<span style={{ color: 'var(--cf-accent)' }}>Fix</span>
          </div>
          <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {cfg.sectionLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar user footer ───────────────────────────────────────────────────────
// showBell=true on desktop sidebar, false inside the mobile drawer (bell is
// already in the top bar so we don't want to render it twice).
function SidebarFooter({ cfg, user, onLogout, showBell }) {
  return (
    <div style={{ padding: '0.9rem 1.1rem', borderTop: '1px solid rgba(255,255,255,0.09)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.7rem' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: cfg.avatarBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: '0.875rem', flexShrink: 0,
        }}>
          {user?.name?.[0]?.toUpperCase() || '?'}
        </div>
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', textTransform: 'capitalize' }}>
            {user?.role}
          </div>
        </div>
        {showBell && <NotificationBell />}
      </div>

      <button
        onClick={onLogout}
        style={{
          width: '100%', padding: '0.45rem',
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 7, color: 'rgba(255,255,255,0.65)',
          fontSize: '0.8125rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
          transition: 'background 140ms',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.13)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
      >
        <i className="bi bi-box-arrow-right" /> Sign out
      </button>
    </div>
  );
}

// ── Main layout component ─────────────────────────────────────────────────────
export default function DashboardLayout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const cfg = ROLE_CONFIG[user?.role] ?? ROLE_CONFIG.resident;

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE ONLY (hidden at lg+)
      ═══════════════════════════════════════════════════════════════════ */}

      {/* ── Sticky top bar ─────────────────────────────────────────────── */}
      <header
        className="d-flex d-lg-none"
        style={{
          position: 'sticky', top: 0, zIndex: 1040,
          background: cfg.sidebarBg,
          height: 52,
          alignItems: 'center',
          padding: '0 1rem',
          gap: '0.75rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.22)',
        }}
      >
        {/* Hamburger */}
        <button
          aria-label="Open navigation menu"
          onClick={() => setDrawerOpen(true)}
          style={{
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <i className="bi bi-list" style={{ fontSize: '1.25rem' }} />
        </button>

        {/* Brand */}
        <span style={{ flex: 1, fontFamily: 'var(--cf-font-heading)', fontWeight: 700, fontSize: '1.1rem', color: '#fff' }}>
          Civic<span style={{ color: 'var(--cf-accent)' }}>Fix</span>
        </span>

        {/* Bell + avatar — keep accessible on mobile */}
        <NotificationBell />
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: cfg.avatarBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: '0.875rem', flexShrink: 0,
        }}>
          {user?.name?.[0]?.toUpperCase() || '?'}
        </div>
      </header>

      {/* ── Backdrop ───────────────────────────────────────────────────── */}
      {/* Rendered via opacity/pointer-events so it can transition smoothly */}
      <div
        aria-hidden="true"
        onClick={closeDrawer}
        style={{
          position: 'fixed', inset: 0, zIndex: 1044,
          background: 'rgba(0,0,0,0.45)',
          opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? 'auto' : 'none',
          transition: 'opacity 240ms',
        }}
      />

      {/* ── Off-canvas drawer ─────────────────────────────────────────── */}
      {/* d-lg-none: Bootstrap hides this at ≥992px (display:none!important) */}
      <div
        className="d-lg-none"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: 265, zIndex: 1045,
          background: cfg.sidebarBg,
          display: 'flex', flexDirection: 'column',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)',
          overflowY: 'auto',
          boxShadow: '4px 0 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Drawer header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.9rem 1rem 0.85rem',
          borderBottom: '1px solid rgba(255,255,255,0.09)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: cfg.logoIconBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '0.85rem',
            }}>
              <i className={`bi ${cfg.logoIcon}`} />
            </div>
            <span style={{ fontFamily: 'var(--cf-font-heading)', fontWeight: 700, fontSize: '1rem', color: '#fff' }}>
              Civic<span style={{ color: 'var(--cf-accent)' }}>Fix</span>
            </span>
          </div>

          <button
            aria-label="Close navigation menu"
            onClick={closeDrawer}
            style={{
              background: 'rgba(255,255,255,0.08)', border: 'none',
              borderRadius: 6, width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.75)', cursor: 'pointer',
            }}
          >
            <i className="bi bi-x-lg" style={{ fontSize: '0.9rem' }} />
          </button>
        </div>

        {/* Nav links — each link click closes the drawer */}
        <nav style={{ flex: 1, padding: '1rem 0.75rem' }}>
          <NavItems cfg={cfg} onLinkClick={closeDrawer} />
        </nav>

        {/* Footer — bell is already in the top bar, so showBell=false */}
        <SidebarFooter cfg={cfg} user={user} onLogout={handleLogout} showBell={false} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          PAGE SHELL  —  desktop sidebar (lg+) + main content
          The sidebar is hidden on mobile via d-none d-lg-flex.
          The main area uses minWidth:0 to prevent flex overflow.
      ═══════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--cf-bg)' }}>

        {/* ── Desktop persistent sidebar (hidden on mobile) ─────────────── */}
        {/* d-none: hidden by default | d-lg-flex: shown as flex at ≥992px */}
        <aside
          className="d-none d-lg-flex"
          style={{
            width: 230, minWidth: 230,
            background: cfg.sidebarBg,
            flexDirection: 'column',
            position: 'sticky', top: 0, height: '100vh',
            overflowY: 'auto',
          }}
        >
          <SidebarLogo cfg={cfg} />
          <nav style={{ flex: 1, padding: '1rem 0.75rem' }}>
            <NavItems cfg={cfg} onLinkClick={undefined} />
          </nav>
          <SidebarFooter cfg={cfg} user={user} onLogout={handleLogout} showBell={true} />
        </aside>

        {/* ── Main content ──────────────────────────────────────────────── */}
        {/* minWidth:0 is the key fix for clipped content:
            flex children default to min-width:auto which can exceed the
            available space.  Setting minWidth:0 lets the item shrink below
            its content's natural width so it never overflows the viewport. */}
        <main style={{
          flex: 1,
          minWidth: 0,
          overflowX: 'hidden',
          overflowY: 'auto',
          padding: 'clamp(1rem, 3vw, 2rem)',
        }}>
          {title && (
            <h1 style={{ fontSize: '1.35rem', marginBottom: '1.5rem', color: 'var(--cf-text)' }}>
              {title}
            </h1>
          )}
          {children}
        </main>
      </div>
    </>
  );
}
