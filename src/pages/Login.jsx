import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Role → redirect path map
const ROLE_REDIRECT = {
  admin:    '/admin',
  staff:    '/staff',
  resident: '/dashboard',
};

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [form,    setForm]    = useState({ email: '', password: '' });
  const [errors,  setErrors]  = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Field change handler ───────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear field error on keystroke
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    setApiError('');
  };

  // ── Client-side validation ─────────────────────────────────────────────────
  const validate = () => {
    const errs = {};
    if (!form.email.trim())    errs.email    = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.password)        errs.password = 'Password is required';
    return errs;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      const user = await login(form.email.trim(), form.password);
      navigate(ROLE_REDIRECT[user.role] || '/dashboard', { replace: true });
    } catch (err) {
      setApiError(err.message);
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
          Sign in to your account
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--cf-text-secondary)', fontSize: '0.875rem', marginBottom: '1.75rem' }}>
          Report and track issues in your community
        </p>

        {/* API Error */}
        {apiError && (
          <div className="cf-alert cf-alert-error" style={{ marginBottom: '1.25rem' }}>
            <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }}></i>
            <span>{apiError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>

          {/* Email */}
          <div style={{ marginBottom: '1.1rem' }}>
            <label htmlFor="login-email" className="cf-form-label">Email address</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              className={`cf-input ${errors.email ? 'is-invalid' : ''}`}
              placeholder="you@example.com"
            />
            {errors.email && <p className="cf-field-error">{errors.email}</p>}
          </div>

          {/* Password */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="login-password" className="cf-form-label">Password</label>
              <a href="#" style={{ fontSize: '0.8rem' }}>Forgot password?</a>
            </div>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              className={`cf-input ${errors.password ? 'is-invalid' : ''}`}
              placeholder="••••••••"
            />
            {errors.password && <p className="cf-field-error">{errors.password}</p>}
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="cf-btn cf-btn-primary"
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading
              ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Signing in…</>
              : <><i className="bi bi-box-arrow-in-right"></i> Sign in</>
            }
          </button>
        </form>

        <div className="cf-divider">or</div>

        <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--cf-text-secondary)', margin: 0 }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ fontWeight: 600 }}>Create one</Link>
        </p>
      </div>
    </div>
  );
}
