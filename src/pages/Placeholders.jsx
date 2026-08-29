// Placeholder pages for protected route zones.
// Full implementations come in subsequent prompts.

import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function PlaceholderPage({ icon, title, description, route }) {
  const { logout } = useAuth();
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cf-bg)' }}>
      {/* Mini top bar */}
      <div style={{
        background: 'var(--cf-surface)',
        borderBottom: '1px solid var(--cf-border)',
        padding: '0.85rem 2rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: 'var(--cf-font-heading)', fontWeight: 700, color: 'var(--cf-primary)' }}>
          <i className="bi bi-building-check me-2"></i>
          Civic<span style={{ color: 'var(--cf-accent)' }}>Fix</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--cf-text-muted)', marginLeft: '0.6rem', fontWeight: 400 }}>
            {route}
          </span>
        </span>
        <button onClick={logout} className="cf-btn cf-btn-outline" style={{ fontSize: '0.8125rem', padding: '0.35rem 0.85rem' }}>
          <i className="bi bi-box-arrow-right"></i> Sign out
        </button>
      </div>

      {/* Placeholder body */}
      <div className="cf-placeholder" style={{ gap: '0.75rem' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'var(--cf-primary-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className={`bi ${icon}`} style={{ fontSize: '1.75rem', color: 'var(--cf-primary)' }}></i>
        </div>
        <h2 style={{ margin: 0, color: 'var(--cf-text)' }}>{title}</h2>
        <p style={{ maxWidth: 400, color: 'var(--cf-text-secondary)', margin: 0 }}>{description}</p>
        <div style={{
          marginTop: '0.5rem',
          padding: '0.6rem 1.2rem',
          background: 'var(--cf-accent-light)',
          borderRadius: 'var(--cf-radius-md)',
          fontSize: '0.8125rem',
          color: 'var(--cf-accent-dark)',
          fontWeight: 500,
        }}>
          <i className="bi bi-clock-history me-1"></i> Full UI coming in the next prompt
        </div>
        <Link to="/" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
          <i className="bi bi-arrow-left me-1"></i> Back to Home
        </Link>
      </div>
    </div>
  );
}

export function ResidentDashboard() {
  return (
    <PlaceholderPage
      icon="bi-house-check"
      title="Resident Dashboard"
      description="View and manage your reported issues, track their progress, and engage with your community."
      route="/dashboard"
    />
  );
}

export function AdminDashboard() {
  return (
    <PlaceholderPage
      icon="bi-speedometer2"
      title="Admin Dashboard"
      description="Manage all platform issues, assign staff, review analytics, and configure categories."
      route="/admin"
    />
  );
}

export function StaffDashboard() {
  return (
    <PlaceholderPage
      icon="bi-tools"
      title="Staff Portal"
      description="View your assigned issues, update progress, and upload resolution proof images."
      route="/staff"
    />
  );
}
