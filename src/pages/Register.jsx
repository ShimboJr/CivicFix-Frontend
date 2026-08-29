import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLE_REDIRECT = {
  admin:    '/admin',
  staff:    '/staff',
  resident: '/dashboard',
};

// ── Field is defined OUTSIDE Register so React never remounts inputs on re-render ──
function Field({ id, label, name, type = 'text', placeholder, autoComplete, value, error, onChange }) {
  return (
    <div style={{ marginBottom: '1.1rem' }}>
      <label htmlFor={id} className="cf-form-label">{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        className={`cf-input ${error ? 'is-invalid' : ''}`}
        placeholder={placeholder}
      />
      {error && <p className="cf-field-error">{error}</p>}
    </div>
  );
}

export default function Register() {
  const { register } = useAuth();
  const navigate     = useNavigate();

  const [form, setForm] = useState({
    name:            '',
    email:           '',
    password:        '',
    confirmPassword: '',
    location:        '',
  });
  const [errors,   setErrors]   = useState({});
  const [apiError, setApiError] = useState('');
  const [loading,  setLoading]  = useState(false);

  // ── Field change handler ───────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    setApiError('');
  };

  // ── Client-side validation ─────────────────────────────────────────────────
  const validate = () => {
    const errs = {};
    if (!form.name.trim())
      errs.name = 'Full name is required';
    if (!form.email.trim())
      errs.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email))
      errs.email = 'Enter a valid email address';
    if (!form.password)
      errs.password = 'Password is required';
    else if (form.password.length < 6)
      errs.password = 'Password must be at least 6 characters';
    if (!form.confirmPassword)
      errs.confirmPassword = 'Please confirm your password';
    else if (form.password !== form.confirmPassword)
      errs.confirmPassword = 'Passwords do not match';
    return errs;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      const { name, email, password, location } = form;
      const user = await register({ name: name.trim(), email: email.trim(), password, location: location.trim() });
      navigate(ROLE_REDIRECT[user.role] || '/dashboard', { replace: true });
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cf-page-center" style={{ padding: '2rem 1rem' }}>
      <div className="cf-card cf-auth-card" style={{ maxWidth: '440px' }}>

        {/* Logo */}
        <div className="cf-auth-logo">
          <div className="logo-icon">
            <i className="bi bi-building-check"></i>
          </div>
          <span className="logo-text">Civic<span>Fix</span></span>
        </div>

        <h1 style={{ fontSize: '1.35rem', textAlign: 'center', marginBottom: '0.25rem' }}>
          Create your account
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--cf-text-secondary)', fontSize: '0.875rem', marginBottom: '1.75rem' }}>
          Join your community — report issues, track progress
        </p>

        {/* API Error */}
        {apiError && (
          <div className="cf-alert cf-alert-error" style={{ marginBottom: '1.25rem' }}>
            <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }}></i>
            <span>{apiError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <Field id="reg-name"     label="Full name"        name="name"            placeholder="Jane Doe"            autoComplete="name"           value={form.name}            error={errors.name}            onChange={handleChange} />
          <Field id="reg-email"    label="Email address"    name="email"           type="email" placeholder="you@example.com"   autoComplete="email"          value={form.email}           error={errors.email}           onChange={handleChange} />
          <Field id="reg-location" label="City / Location"  name="location"        placeholder="e.g. Lagos Island"   autoComplete="address-level2" value={form.location}        error={errors.location}        onChange={handleChange} />
          <Field id="reg-pw"       label="Password"         name="password"        type="password" placeholder="Min. 6 characters" autoComplete="new-password"   value={form.password}        error={errors.password}        onChange={handleChange} />
          <Field id="reg-cpw"      label="Confirm password" name="confirmPassword" type="password" placeholder="Repeat password"    autoComplete="new-password"   value={form.confirmPassword}  error={errors.confirmPassword}  onChange={handleChange} />

          <button
            type="submit"
            className="cf-btn cf-btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={loading}
          >
            {loading
              ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Creating account…</>
              : <><i className="bi bi-person-plus"></i> Create account</>
            }
          </button>
        </form>

        <div className="cf-divider">or</div>

        <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--cf-text-secondary)', margin: 0 }}>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
