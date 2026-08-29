import { Navigate } from 'react-router-dom';
import { useAuth }   from '../context/AuthContext';

// ── Minimal Unauthorized page ─────────────────────────────────────────────────
function UnauthorizedPage() {
  return (
    <div className="cf-placeholder">
      <i className="bi bi-shield-x"></i>
      <h2 style={{ color: 'var(--cf-status-rejected)' }}>Access Denied</h2>
      <p>You do not have permission to view this page.</p>
      <a href="/" className="cf-btn cf-btn-outline" style={{ marginTop: '0.5rem' }}>
        <i className="bi bi-arrow-left"></i> Back to Home
      </a>
    </div>
  );
}

/**
 * ProtectedRoute
 *
 * Props:
 *  - allowedRoles  {string[]}  optional — if provided, user.role must be in the list
 *  - children      {ReactNode} the page to render when all guards pass
 */
function ProtectedRoute({ allowedRoles, children }) {
  const { user, loading } = useAuth();

  // 1. Still resolving token — show a spinner, never redirect prematurely
  if (loading) {
    return (
      <div className="cf-spinner-wrap">
        <div className="cf-spinner" aria-label="Loading…" />
      </div>
    );
  }

  // 2. Not authenticated → go to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 3. Authenticated but wrong role
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <UnauthorizedPage />;
  }

  // 4. All clear
  return children;
}

export default ProtectedRoute;
