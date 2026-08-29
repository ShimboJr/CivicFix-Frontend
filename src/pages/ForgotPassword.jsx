import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

/**
 * ForgotPassword — single email-input form.
 *
 * Design rules:
 *   - Matches the Login / Register card style exactly (cf-page-center, cf-auth-card).
 *   - Never adds client-side logic that implies whether the email was registered —
 *     just displays whatever generic message the backend returns.
 *   - Shows a clear "Back to sign in" link at all times.
 */
export default function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');   // backend's generic message
  const [error,   setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) { setError('Please enter your email address.'); return; }
    if (!/\S+@\S+\.\S+/.test(trimmed)) { setError('Please enter a valid email address.'); return; }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data } = await api.post('/auth/forgot-password', { email: trimmed });
      setSuccess(data.message);
    } catch (err) {
      // Even on unexpected server errors show a neutral message — don't leak details
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cf-page-center">
      <div className="cf-card cf-auth-card">

        {/* Logo */}
        <div className="cf-auth-logo">
          <div className="logo-icon">
            <i className="bi bi-building-check"></i>
          </div>
          <span className="logo-text">Civic<span>Fix</span></span>
        </div>

        <h1 style={{ fontSize: '1.35rem', textAlign: 'center', marginBottom: '0.25rem' }}>
          Forgot your password?
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--cf-text-secondary)', fontSize: '0.875rem', marginBottom: '1.75rem' }}>
          Enter your email and we'll send you a reset link.
        </p>

        {/* Success banner — shown after a successful submission */}
        {success && (
          <div className="cf-alert cf-alert-success" style={{ marginBottom: '1.25rem' }}>
            <i className="bi bi-envelope-check-fill" style={{ flexShrink: 0 }}></i>
            <span>{success}</span>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="cf-alert cf-alert-error" style={{ marginBottom: '1.25rem' }}>
            <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }}></i>
            <span>{error}</span>
          </div>
        )}

        {/* Only show the form until a success message is received */}
        {!success && (
          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="forgot-email" className="cf-form-label">
                Email address
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                className="cf-input"
                placeholder="you@example.com"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="cf-btn cf-btn-primary"
              style={{ width: '100%', marginBottom: '1rem' }}
              disabled={loading}
            >
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Sending…</>
                : <><i className="bi bi-envelope-arrow-up"></i> Send reset link</>
              }
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--cf-text-secondary)', margin: '0.5rem 0 0' }}>
          <Link to="/login" style={{ fontWeight: 600 }}>
            <i className="bi bi-arrow-left me-1"></i>Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
