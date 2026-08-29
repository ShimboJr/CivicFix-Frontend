import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

const NAV = [
  { to: '/admin',              icon: 'bi-speedometer2',   label: 'Dashboard',   end: true },
  { to: '/admin/issues',       icon: 'bi-card-checklist', label: 'Issues' },
  { to: '/admin/users',        icon: 'bi-people',         label: 'Users' },
  { to: '/admin/categories',   icon: 'bi-tags',           label: 'Categories' },
  { to: '/admin/analytics',    icon: 'bi-bar-chart-line', label: 'Analytics' },
];

export default function AdminLayout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate          = useNavigate();

  const handleLogout = async () => { await logout(); navigate('/login', { replace: true }); };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--cf-bg)' }}>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside style={{
        width: '220px', minWidth: '220px',
        background: '#0d1b2a',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh',
      }}>
        {/* Logo */}
        <div style={{ padding: '1.4rem 1.25rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <div style={{
              width: 32, height: 32, borderRadius: 7,
              background: 'var(--cf-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '0.95rem',
            }}>
              <i className="bi bi-shield-check"></i>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--cf-font-heading)', fontWeight: 700, fontSize: '1rem', color: '#fff' }}>
                Civic<span style={{ color: 'var(--cf-accent)' }}>Fix</span>
              </div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Admin Panel
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0.9rem 0.65rem' }}>
          <p style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 0.6rem', marginBottom: '0.45rem' }}>
            Management
          </p>
          {NAV.map(({ to, icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.55rem 0.75rem', borderRadius: 7, marginBottom: '0.15rem',
                color:      isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
                fontSize:   '0.875rem', textDecoration: 'none',
                transition: 'background 120ms, color 120ms',
              })}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => {
                const active = e.currentTarget.getAttribute('aria-current') === 'page';
                e.currentTarget.style.background = active ? 'rgba(255,255,255,0.1)' : 'transparent';
                e.currentTarget.style.color      = active ? '#fff' : 'rgba(255,255,255,0.5)';
              }}
            >
              <i className={`bi ${icon}`} style={{ fontSize: '0.95rem', flexShrink: 0 }}></i>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div style={{ padding: '0.85rem 1.1rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.65rem' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'var(--cf-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
            }}>
              {user?.name?.[0]?.toUpperCase() || 'A'}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.68rem', textTransform: 'capitalize' }}>{user?.role}</div>
            </div>
            {/* Notification bell */}
            <NotificationBell />
          </div>
          <button onClick={handleLogout}
            style={{
              width: '100%', padding: '0.4rem',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 7, color: 'rgba(255,255,255,0.55)',
              fontSize: '0.78rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              transition: 'background 120ms',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          >
            <i className="bi bi-box-arrow-right"></i> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '1.75rem 2rem' }}>
        {title && (
          <h1 style={{ fontSize: '1.3rem', marginBottom: '1.5rem', color: 'var(--cf-text)' }}>{title}</h1>
        )}
        {children}
      </main>
    </div>
  );
}
