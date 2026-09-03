/**
 * SOSButton.jsx
 *
 * A fixed-position floating button rendered inside DashboardLayout so it
 * appears on every resident-portal page.  It is intentionally suppressed for
 * admin and staff roles (they have no need to share their own location) and on
 * the LiveLocationActive page itself (the page has its own full-screen UI).
 *
 * Interaction model — exactly two taps to activate:
 *   Tap 1 → opens a small confirm panel (no navigation, no form)
 *   Tap 2 → "Share My Location" button triggers geolocation + API call
 *
 * The component is self-contained; it holds no server state.  The caller
 * (DashboardLayout) simply renders <SOSButton /> and forgets about it.
 */

import { useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

// ── Duration options presented to the resident ────────────────────────────────
const DURATION_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '1 hour', value: 60 },
  { label: '4 hours', value: 240 },
];

// ── Inline styles (no external CSS dependency) ────────────────────────────────
// All colours reference the global design-system tokens already in index.css.

const S = {
  // The pulsing red FAB itself
  fab: {
    position:       'fixed',
    bottom:         '1.5rem',
    right:          '1.5rem',
    zIndex:         1060,          // above DashboardLayout's 1045 drawer
    width:          56,
    height:         56,
    borderRadius:   '50%',
    background:     'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
    border:         '3px solid rgba(255,255,255,0.35)',
    boxShadow:      '0 4px 18px rgba(220,38,38,0.55), 0 2px 6px rgba(0,0,0,0.3)',
    color:          '#fff',
    fontSize:       '1.35rem',
    cursor:         'pointer',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    transition:     'transform 140ms, box-shadow 140ms',
    // Animation defined inline via keyframe injection below
  },

  // Confirm panel — sits just above the FAB
  panel: {
    position:     'fixed',
    bottom:       '5rem',
    right:        '1.5rem',
    zIndex:       1059,
    width:        300,
    background:   '#fff',
    borderRadius: 14,
    boxShadow:    '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)',
    border:       '1px solid rgba(220,38,38,0.15)',
    padding:      '1.1rem 1.2rem',
    animation:    'sos-slide-up 180ms cubic-bezier(0.4,0,0.2,1)',
  },

  panelHeader: {
    display:      'flex',
    alignItems:   'center',
    gap:          '0.5rem',
    marginBottom: '0.6rem',
  },

  panelTitle: {
    fontFamily:  'var(--cf-font-heading)',
    fontWeight:  700,
    fontSize:    '0.9375rem',
    color:       '#dc2626',
    margin:      0,
  },

  panelDesc: {
    fontSize:    '0.8125rem',
    color:       'var(--cf-text-secondary)',
    lineHeight:  1.5,
    margin:      '0 0 0.9rem',
  },

  durationRow: {
    display:        'flex',
    gap:            '0.45rem',
    marginBottom:   '0.85rem',
  },

  durationBtn: (selected) => ({
    flex:         1,
    padding:      '0.4rem 0',
    borderRadius: 7,
    border:       selected ? '2px solid #dc2626' : '1.5px solid #e5e7eb',
    background:   selected ? '#fee2e2' : '#f9fafb',
    color:        selected ? '#dc2626' : 'var(--cf-text-secondary)',
    fontWeight:   selected ? 700 : 500,
    fontSize:     '0.8rem',
    cursor:       'pointer',
    transition:   'all 120ms',
  }),

  shareBtn: {
    width:          '100%',
    padding:        '0.65rem',
    borderRadius:   9,
    background:     'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
    border:         'none',
    color:          '#fff',
    fontWeight:     700,
    fontSize:       '0.9375rem',
    cursor:         'pointer',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '0.45rem',
    transition:     'opacity 140ms',
    fontFamily:     'var(--cf-font-body)',
  },

  errorMsg: {
    marginTop:   '0.6rem',
    fontSize:    '0.78rem',
    color:       '#b91c1c',
    background:  '#fee2e2',
    borderRadius: 6,
    padding:     '0.4rem 0.6rem',
    display:     'flex',
    gap:         '0.35rem',
    alignItems:  'flex-start',
  },

  closeBtn: {
    marginLeft:  'auto',
    background:  'none',
    border:      'none',
    cursor:      'pointer',
    color:       'var(--cf-text-muted)',
    padding:     '0.1rem',
    lineHeight:  1,
    fontSize:    '0.9rem',
  },
};

// Inject keyframes once (idempotent)
if (typeof document !== 'undefined' && !document.getElementById('sos-keyframes')) {
  const style = document.createElement('style');
  style.id = 'sos-keyframes';
  style.textContent = `
    @keyframes sos-pulse {
      0%, 100% { box-shadow: 0 4px 18px rgba(220,38,38,0.55), 0 2px 6px rgba(0,0,0,0.3); }
      50%       { box-shadow: 0 4px 28px rgba(220,38,38,0.85), 0 2px 10px rgba(0,0,0,0.35); }
    }
    @keyframes sos-slide-up {
      from { opacity: 0; transform: translateY(12px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)    scale(1); }
    }
  `;
  document.head.appendChild(style);
}

export default function SOSButton() {
  const { user }      = useAuth();
  const navigate      = useNavigate();
  const location      = useLocation();

  const [open,     setOpen]     = useState(false);
  const [duration, setDuration] = useState(60);      // minutes, default 1 hr
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Track whether the user has already pressed share once (prevents double-submit)
  const submittingRef = useRef(false);

  // ── Hide conditions ────────────────────────────────────────────────────────
  // 1. Only residents have live-location sharing
  // 2. Don't show the FAB while already on the active-sharing page
  if (user?.role !== 'resident') return null;
  if (location.pathname.startsWith('/dashboard/live-location')) return null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleFabClick = useCallback(() => {
    setError('');
    setOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setError('');
  }, []);

  const handleShare = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    setLoading(true);

    // ── Step 1: request geolocation permission and get first fix ─────────────
    let position;
    try {
      position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout:            10_000,
          maximumAge:         0,
        });
      });
    } catch (geoErr) {
      const denied =
        geoErr.code === geoErr.PERMISSION_DENIED ||
        geoErr.code === 1; // GeolocationPositionError.PERMISSION_DENIED

      setError(
        denied
          ? 'Location permission was denied. Please allow location access in your browser settings and try again — this feature cannot work without it.'
          : 'Could not get your location. Make sure GPS is enabled and try again.'
      );
      setLoading(false);
      submittingRef.current = false;
      return;
    }

    const { latitude, longitude, accuracy } = position.coords;

    // ── Step 2: call the API ──────────────────────────────────────────────────
    try {
      const { data } = await api.post('/live-location/start', {
        durationMinutes: duration,
        latitude,
        longitude,
        accuracy,
      });

      // Navigate immediately — the active page takes over
      navigate(`/dashboard/live-location/${data.sessionId}`, {
        state: { expiresAt: data.expiresAt, reportId: data.reportId },
      });
    } catch (apiErr) {
      setError(apiErr.message || 'Failed to start sharing. Please try again.');
      setLoading(false);
      submittingRef.current = false;
    }
  }, [duration, navigate]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Confirm panel ─────────────────────────────────────────────────── */}
      {open && (
        <div style={S.panel} role="dialog" aria-modal="true" aria-label="Share live location">
          <div style={S.panelHeader}>
            <i className="bi bi-broadcast" style={{ color: '#dc2626', fontSize: '1rem' }} />
            <p style={S.panelTitle}>Share Live Location</p>
            <button
              style={S.closeBtn}
              onClick={handleClose}
              aria-label="Close"
            >
              <i className="bi bi-x-lg" />
            </button>
          </div>

          <p style={S.panelDesc}>
            Your live location will be shared with CivicFix administrators until you stop
            it or time runs out. An urgent alert is sent to admins immediately.
          </p>

          {/* Duration picker */}
          <div style={{ marginBottom: '0.45rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cf-text-secondary)', margin: '0 0 0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Share for
            </p>
            <div style={S.durationRow}>
              {DURATION_OPTIONS.map(({ label, value }) => (
                <button
                  key={value}
                  style={S.durationBtn(duration === value)}
                  onClick={() => setDuration(value)}
                  aria-pressed={duration === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Primary action */}
          <button
            id="sos-share-btn"
            style={{ ...S.shareBtn, opacity: loading ? 0.7 : 1 }}
            onClick={handleShare}
            disabled={loading}
          >
            {loading ? (
              <>
                <span
                  style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#fff',
                    display: 'inline-block',
                    animation: 'cf-spin 0.7s linear infinite',
                  }}
                />
                Getting location…
              </>
            ) : (
              <>
                <i className="bi bi-broadcast-pin" />
                Share My Location
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div style={S.errorMsg} role="alert">
              <i className="bi bi-exclamation-triangle-fill" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Floating action button ─────────────────────────────────────────── */}
      <button
        id="sos-fab"
        aria-label="Share live location"
        aria-expanded={open}
        onClick={handleFabClick}
        style={{
          ...S.fab,
          animation: open ? 'none' : 'sos-pulse 2.2s ease-in-out infinite',
          transform: open ? 'scale(0.93)' : undefined,
        }}
        title="Share live location with admins"
      >
        {open
          ? <i className="bi bi-x-lg" style={{ fontSize: '1.1rem' }} />
          : <i className="bi bi-broadcast-pin" />
        }
      </button>
    </>
  );
}
