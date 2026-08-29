import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * ResetPassword — reads the raw token from the URL param (/reset-password/:token),
 * lets the user choose a new password, and calls PUT /auth/reset-password/:token.
 *
 * On success the backend returns a fresh JWT → we log the user straight in via
 * useAuth().loginWithData() and redirect to their role dashboard.
 *
 * On failure (expired / invalid token) we show the backend's error and offer a
 * link back to /forgot-password to request a fresh link.
 */

const ROLE_REDIRECT = {
  admin:    '/admin',
  staff:    '/staff',
  resident: '/dashboard',
};

export default function ResetPassword() {
  const { token }  = useParams();
  const navigate   = useNavigate();
  const { loginWithData } = useAuth();

  const [form,    setForm]    = useState({ password: '', confirm: '' });
  const [errors,  setErrors]  = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false); // password changed successfully

  // ── Field handler ────────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: '' }));
    setApiError('');
  };

  // ── Client-side validation ───────────────────────────────────────────────────
  const validate = () => {
    const errs = {};
    if (!form.password)              errs.password = 'Password is required';
    else if (form.password.length < 6) errs.password = 'Password must be at least 6 characters';
    if (!form.confirm)               errs.confirm = 'Please confirm your new password';
    else if (form.confirm !== form.password) errs.confirm = 'Passwords do not match';
    return errs;
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    setApiError('');

    try {
      const { data } = await api.put(`/auth/reset-password/${token}`, {
        password: form.password,
      });

      // Backend returns a fresh auth payload — log the user in immediately
      if (data.token) {
        loginWithData(data);
        setDone(true);
        // Brief delay so the success banner is visible before the redirect
        setTimeout(() => navigate(ROLE_REDIRECT[data.role] || '/dashboard', { replace: true }), 1500);
      } else {
        // Fallback: no token returned — just redirect to login
        setDone(true);
        setTimeout(() => navigate('/login', { replace: true }), 1500);
      }
    } catch (err) {
      setApiError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
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
          Set a new password
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--cf-text-secondary)', fontSize: '0.875rem', marginBottom: '1.75rem' }}>
          Choose a strong password you haven't used before.
        </p>

        {/* Success state */}
        {done && (
          <div className="cf-alert cf-alert-success" style={{ marginBottom: '1.25rem' }}>
            <i className="bi bi-check-circle-fill" style={{ flexShrink: 0 }}></i>
            <span>Password updated! Redirecting you now…</span>
          </div>
        )}

        {/* API / token error */}
        {apiError && (
          <div className="cf-alert cf-alert-error" style={{ marginBottom: '1.25rem' }}>
            <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }}></i>
            <div>
              <div>{apiError}</div>
              {/* Expired / invalid token — offer to request a new link */}
              {apiError.toLowerCase().includes('invalid') || apiError.toLowerCase().includes('expired') ? (
                <div style={{ marginTop: '0.4rem', fontSize: '0.85rem' }}>
                  <Link to="/forgot-password" style={{ fontWeight: 600 }}>
                    Request a new reset link
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Form — hide once done to prevent double-submit */}
        {!done && (
          <form onSubmit={handleSubmit} noValidate>

            {/* New password */}
            <div style={{ marginBottom: '1.1rem' }}>
              <label htmlFor="reset-password" className="cf-form-label">
                New password
              </label>
              <input
                id="reset-password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange}
                className={`cf-input ${errors.password ? 'is-invalid' : ''}`}
                placeholder="At least 6 characters"
                disabled={loading}
              />
              {errors.password && <p className="cf-field-error">{errors.password}</p>}
            </div>

            {/* Confirm password */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="reset-confirm" className="cf-form-label">
                Confirm new password
              </label>
              <input
                id="reset-confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={handleChange}
                className={`cf-input ${errors.confirm ? 'is-invalid' : ''}`}
                placeholder="••••••••"
                disabled={loading}
              />
              {errors.confirm && <p className="cf-field-error">{errors.confirm}</p>}
            </div>

            <button
              type="submit"
              className="cf-btn cf-btn-primary"
              style={{ width: '100%', marginBottom: '1rem' }}
              disabled={loading}
            >
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Updating…</>
                : <><i className="bi bi-lock-fill"></i> Set new password</>
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
