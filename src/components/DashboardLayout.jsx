import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/dashboard',            icon: 'bi-house',          label: 'Overview' },
  { to: '/dashboard/report',     icon: 'bi-plus-circle',    label: 'Report Issue' },
  { to: '/dashboard/my-reports', icon: 'bi-card-list',      label: 'My Reports' },
  { to: '/map',                  icon: 'bi-map',            label: 'Community Map' },
];

export default function DashboardLayout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate          = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--cf-bg)' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside style={{
        width:       '240px',
        minWidth:    '240px',
        background:  'var(--cf-primary)',
        display:     'flex',
        flexDirection: 'column',
        padding:     '0',
        position:    'sticky',
        top:         0,
        height:      '100vh',
      }}>
        {/* Logo */}
        <div style={{ padding: '1.5rem 1.25rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
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
            <span style={{ fontFamily: 'var(--cf-font-heading)', fontWeight: 700, fontSize: '1.15rem', color: '#fff' }}>
              Civic<span style={{ color: 'var(--cf-accent)' }}>Fix</span>
            </span>
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '1rem 0.75rem' }}>
          <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 0.5rem', marginBottom: '0.5rem' }}>
            Resident Portal
          </p>
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              style={({ isActive }) => ({
                display:     'flex',
                alignItems:  'center',
                gap:         '0.65rem',
                padding:     '0.6rem 0.75rem',
                borderRadius: '8px',
                marginBottom: '0.2rem',
                color:        isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                background:   isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                fontWeight:   isActive ? 600 : 400,
                fontSize:     '0.9rem',
                textDecoration: 'none',
                transition:   'background 150ms, color 150ms',
              })}
              onMouseEnter={(e) => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = 'transparent'; }}
            >
              <i className={`bi ${icon}`} style={{ fontSize: '1rem', flexShrink: 0 }}></i>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--cf-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '0.875rem',
              flexShrink: 0,
            }}>
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem', textTransform: 'capitalize' }}>
                {user?.role}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              width:        '100%',
              padding:      '0.45rem',
              background:   'rgba(255,255,255,0.08)',
              border:       '1px solid rgba(255,255,255,0.15)',
              borderRadius: '7px',
              color:        'rgba(255,255,255,0.7)',
              fontSize:     '0.8125rem',
              cursor:       'pointer',
              display:      'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              transition:   'background 150ms',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.14)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
          >
            <i className="bi bi-box-arrow-right"></i> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
        {title && (
          <h1 style={{ fontSize: '1.4rem', marginBottom: '1.5rem', color: 'var(--cf-text)' }}>
            {title}
          </h1>
        )}
        {children}
      </main>
    </div>
  );
}
