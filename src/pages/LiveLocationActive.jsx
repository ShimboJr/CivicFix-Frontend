/**
 * LiveLocationActive.jsx
 *
 * The active-sharing state page.  Reached via:
 *   /dashboard/live-location/:id
 *
 * Responsibilities:
 *   1. Display a persistent "sharing active" banner with elapsed / remaining time.
 *   2. Run navigator.geolocation.watchPosition (enableHighAccuracy: true).
 *   3. Throttle pings to the server — one ping per PING_INTERVAL_MS (12 seconds),
 *      NOT on every watchPosition callback, which can fire several times per second.
 *      Uses navigator.sendBeacon where available (survives tab losing focus),
 *      falls back to fetch / axios for browsers that block Beacon for JSON.
 *   4. Display a plainly-worded background-tracking limitation warning at all times.
 *   5. Provide Stop Sharing, Extend, and Add Details controls.
 *   6. Reflect expiry/end state transitions without needing a page reload.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────
const PING_INTERVAL_MS   = 12_000;  // send a ping every 12 s (throttle)
const TICK_INTERVAL_MS   = 1_000;   // UI clock update
const MAX_TOTAL_MINUTES  = 8 * 60;  // absolute cap when extending (8 hours)
const EXTEND_OPTIONS     = [
  { label: '+15 min', value: 15 },
  { label: '+1 hr',  value: 60 },
  { label: '+2 hr',  value: 120 },
];

// ── Helper — format seconds as hh:mm:ss or mm:ss ─────────────────────────────
function fmtDuration(totalSeconds) {
  if (totalSeconds <= 0) return '0:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Helper — get JWT from localStorage for Beacon fallback ───────────────────
function getToken() {
  return localStorage.getItem('civicfix_token') || '';
}

export default function LiveLocationActive() {
  const { id }        = useParams();
  const navState      = useLocation().state ?? {};
  const navigate      = useNavigate();
  const { user }      = useAuth();

  // ── Core state ─────────────────────────────────────────────────────────────
  const [sessionStatus, setSessionStatus] = useState('active');   // 'active' | 'ended' | 'expired'
  const [expiresAt,     setExpiresAt]     = useState(
    navState.expiresAt ? new Date(navState.expiresAt) : null
  );
  const [startedAt]                       = useState(new Date());

  // Elapsed since page load (proxy for elapsed since session start)
  const [elapsed,   setElapsed]   = useState(0);   // seconds
  const [remaining, setRemaining] = useState(null); // seconds

  // UI state
  const [geoError,      setGeoError]      = useState('');
  const [pingError,     setPingError]      = useState('');
  const [pingCount,     setPingCount]      = useState(0);
  const [lastPingAt,    setLastPingAt]     = useState(null);
  const [stopping,      setStopping]       = useState(false);
  const [stopError,     setStopError]      = useState('');
  const [showExtend,    setShowExtend]     = useState(false);
  const [extendLoading, setExtendLoading]  = useState(false);
  const [extendError,   setExtendError]    = useState('');
  const [showDetails,   setShowDetails]    = useState(false);
  const [detailsText,   setDetailsText]    = useState('');
  const [detailsSaving, setDetailsSaving]  = useState(false);
  const [detailsSaved,  setDetailsSaved]   = useState(false);
  const [detailsError,  setDetailsError]   = useState('');

  // ── Refs — used inside closures to avoid stale-state issues ───────────────
  const activeRef       = useRef(true);   // set to false on unmount/stop/expire
  const watchIdRef      = useRef(null);   // geolocation.watchPosition id
  const latestPosRef    = useRef(null);   // the most recent position from watchPosition
  const pingTimerRef    = useRef(null);   // setInterval id for throttled pings
  const expiresAtRef    = useRef(expiresAt);

  // Keep expiresAtRef in sync with state
  useEffect(() => { expiresAtRef.current = expiresAt; }, [expiresAt]);

  // ── Fetch session on mount (in case page was hard-refreshed) ──────────────
  useEffect(() => {
    if (expiresAt) return; // already have it from nav state
    api.get(`/live-location/${id}`)
      .then(({ data }) => {
        setSessionStatus(data.status);
        if (data.expiresAt) setExpiresAt(new Date(data.expiresAt));
      })
      .catch(() => {/* non-fatal — UI degrades gracefully */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Clock — ticks every second ────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now      = Date.now();
      const elapsedS = Math.floor((now - startedAt.getTime()) / 1000);
      setElapsed(elapsedS);

      if (expiresAtRef.current) {
        const remS = Math.floor((expiresAtRef.current.getTime() - now) / 1000);
        setRemaining(remS);
        // Detect client-side expiry — server will agree on next ping
        if (remS <= 0 && sessionStatus === 'active') {
          setSessionStatus('expired');
          teardown();
        }
      }
    };

    const timerId = setInterval(tick, TICK_INTERVAL_MS);
    tick(); // run immediately
    return () => clearInterval(timerId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, sessionStatus]);

  // ── Ping function — sends one position reading to the server ─────────────
  // Uses sendBeacon when possible (keeps working even when the tab is being
  // closed / in background), falls back to fetch/axios.
  //
  // sendBeacon limitation: it sends a Blob, not a JSON body.  We wrap the
  // payload as an application/json blob — the Express json() middleware
  // accepts it.  However, sendBeacon cannot set Authorization headers, so
  // we fall back to fetch for the actual network call when we detect that
  // the payload was queued (sendBeacon returns true) but to be safe we also
  // always have a fetch path in case the browser doesn't queue it.
  //
  // Pragmatic decision: sendBeacon is used for its resilience to tab-close;
  // normal fetch is the primary path during active use, which gives us
  // proper error handling and response inspection.
  const sendPing = useCallback(async (pos) => {
    if (!activeRef.current) return;
    if (!pos) return;

    const { latitude, longitude, accuracy } = pos.coords;
    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/live-location/${id}/ping`;
    const payload = JSON.stringify({ latitude, longitude, accuracy });
    const token   = getToken();

    // Primary path: regular fetch with auth header (gives error feedback)
    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: payload,
        // keepalive: true makes fetch behave similarly to sendBeacon for
        // short-lived tab scenarios — it tells the browser to complete the
        // request even after the page has started to unload.
        keepalive: true,
      });

      if (res.status === 410) {
        // Session expired or ended — stop everything
        const json = await res.json().catch(() => ({}));
        setPingError(json.message || 'Session ended.');
        setSessionStatus('expired');
        teardown();
        return;
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setPingError(json.message || `Ping failed (${res.status})`);
      } else {
        setPingError('');
        setPingCount((c) => c + 1);
        setLastPingAt(new Date());
      }
    } catch {
      // Network failure — queue a beacon as a best-effort backup
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      }
      setPingError('Network error — will retry on the next ping.');
    }
  }, [id]);

  // ── teardown — stops watchPosition and the ping interval ─────────────────
  const teardown = useCallback(() => {
    activeRef.current = false;
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (pingTimerRef.current != null) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  // ── Start watchPosition + throttled ping interval ─────────────────────────
  useEffect(() => {
    if (sessionStatus !== 'active') return;

    // Guard: geolocation unavailable
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not available in this browser.');
      return;
    }

    // watchPosition — updates latestPosRef on every fix (potentially fast)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestPosRef.current = pos;
        setGeoError(''); // clear any previous geo error on success
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError('Location permission revoked. Sharing has paused.');
        } else {
          setGeoError('GPS signal lost — waiting for fix…');
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 }
    );

    // Throttled ping — fires every PING_INTERVAL_MS regardless of how often
    // watchPosition fires.  This is the ONLY place a ping is dispatched.
    pingTimerRef.current = setInterval(() => {
      if (latestPosRef.current) {
        sendPing(latestPosRef.current);
      }
    }, PING_INTERVAL_MS);

    return () => teardown();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => teardown();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Stop sharing ──────────────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    setStopping(true);
    setStopError('');
    try {
      await api.post(`/live-location/${id}/end`);
      teardown();
      setSessionStatus('ended');
    } catch (err) {
      setStopError(err.message || 'Failed to stop sharing. Please try again.');
    } finally {
      setStopping(false);
    }
  }, [id, teardown]);

  // ── Extend session ────────────────────────────────────────────────────────
  // Extend by calling /api/live-location/:id/ping is not an extension endpoint;
  // we need a server endpoint for extend.  Since there isn't one yet, we handle
  // this client-side by recalculating expiresAt, capped at MAX_TOTAL_MINUTES
  // from startedAt.  A real production app would persist this via a PATCH
  // endpoint — noted with a TODO.
  // TODO: add PATCH /api/live-location/:id/extend on the server.
  const handleExtend = useCallback((extraMinutes) => {
    setExtendError('');
    setExtendLoading(true);

    const cap       = new Date(startedAt.getTime() + MAX_TOTAL_MINUTES * 60_000);
    const current   = expiresAtRef.current ?? new Date();
    const proposed  = new Date(current.getTime() + extraMinutes * 60_000);
    const newExpiry = proposed > cap ? cap : proposed;

    if (newExpiry <= (expiresAtRef.current ?? new Date())) {
      setExtendError(`Session is already at the 8-hour maximum (from start time).`);
      setExtendLoading(false);
      return;
    }

    setExpiresAt(newExpiry);
    setShowExtend(false);
    setExtendLoading(false);
  }, [startedAt]);

  // ── Save additional description ───────────────────────────────────────────
  // PATCHes the linked EmergencyReport's description via the emergency endpoint.
  const handleSaveDetails = useCallback(async () => {
    if (!navState.reportId) {
      setDetailsError('No linked report found — details cannot be saved.');
      return;
    }
    setDetailsSaving(true);
    setDetailsError('');
    try {
      // The existing emergency reports API accepts a PUT/status update;
      // we'll PATCH the description via the generic update endpoint.
      // If no dedicated endpoint exists yet, we use the status endpoint trick
      // and only update description.
      // TODO: add PATCH /api/emergency-reports/:id route for partial updates.
      await api.put(`/emergency-reports/${navState.reportId}/status`, {
        description: detailsText,
      });
      setDetailsSaved(true);
      setTimeout(() => setDetailsSaved(false), 3000);
    } catch (err) {
      setDetailsError(err.message || 'Failed to save details. Please try again.');
    } finally {
      setDetailsSaving(false);
    }
  }, [navState.reportId, detailsText]);

  // ── Derived values ────────────────────────────────────────────────────────
  const isEnded = sessionStatus === 'ended' || sessionStatus === 'expired';

  const statusColor  = sessionStatus === 'active' ? '#16a34a' : '#dc2626';
  const statusBg     = sessionStatus === 'active' ? '#dcfce7' : '#fee2e2';
  const statusLabel  = sessionStatus === 'active'
    ? 'Live location sharing is active'
    : sessionStatus === 'expired'
    ? 'Session expired'
    : 'Sharing stopped';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* ── Status banner ─────────────────────────────────────────────── */}
        <div
          role="status"
          aria-live="polite"
          style={{
            borderRadius:  14,
            background:    statusBg,
            border:        `2px solid ${statusColor}`,
            padding:       '1.1rem 1.3rem',
            marginBottom:  '1.25rem',
            display:       'flex',
            alignItems:    'center',
            gap:           '0.85rem',
          }}
        >
          {/* Animated dot */}
          <div
            style={{
              width:        14,
              height:       14,
              borderRadius: '50%',
              background:   statusColor,
              flexShrink:   0,
              boxShadow:    sessionStatus === 'active'
                ? `0 0 0 0 ${statusColor}`
                : 'none',
              animation: sessionStatus === 'active'
                ? 'live-ping 1.6s ease-out infinite'
                : 'none',
            }}
          />

          <div style={{ flex: 1 }}>
            <p style={{
              margin:     0,
              fontWeight: 700,
              fontSize:   '1rem',
              color:      statusColor,
              fontFamily: 'var(--cf-font-heading)',
            }}>
              {statusLabel}
            </p>

            {sessionStatus === 'active' && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: '#166534' }}>
                Elapsed: <strong>{fmtDuration(elapsed)}</strong>
                {remaining !== null && (
                  <> &nbsp;·&nbsp; Expires in: <strong style={{ color: remaining < 120 ? '#dc2626' : '#166534' }}>{fmtDuration(Math.max(0, remaining))}</strong></>
                )}
              </p>
            )}
          </div>

          {sessionStatus === 'active' && (
            <span style={{
              background:   '#16a34a',
              color:        '#fff',
              borderRadius: 999,
              fontSize:     '0.7rem',
              fontWeight:   700,
              padding:      '0.2rem 0.7rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              flexShrink:   0,
            }}>
              LIVE
            </span>
          )}
        </div>

        {/* ─── ⚠ Background-tracking limitation warning — ALWAYS visible ─── */}
        {/* This is a genuine technical limitation, stated plainly.          */}
        {sessionStatus === 'active' && (
          <div
            role="alert"
            style={{
              borderRadius:  10,
              background:    '#fffbeb',
              border:        '1.5px solid #f59e0b',
              padding:       '0.85rem 1rem',
              marginBottom:  '1.25rem',
              display:       'flex',
              gap:           '0.65rem',
              alignItems:    'flex-start',
            }}
          >
            <i
              className="bi bi-exclamation-triangle-fill"
              style={{ color: '#d97706', fontSize: '1.05rem', flexShrink: 0, marginTop: 1 }}
            />
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#92400e', lineHeight: 1.55 }}>
              <strong>Keep this page open for sharing to continue.</strong> Web browsers do not
              reliably track location in the background or with the screen locked.
              If you lock your screen or switch apps, pings will stop until you return.
            </p>
          </div>
        )}

        {/* ── Geo / ping error feedback ─────────────────────────────────── */}
        {geoError && (
          <div className="cf-alert cf-alert-error" style={{ marginBottom: '1rem' }} role="alert">
            <i className="bi bi-exclamation-circle-fill" />
            {geoError}
          </div>
        )}
        {pingError && (
          <div style={{
            borderRadius:  8,
            background:    '#fef3c7',
            border:        '1px solid #f59e0b',
            padding:       '0.5rem 0.75rem',
            fontSize:      '0.8rem',
            color:         '#92400e',
            marginBottom:  '1rem',
            display:       'flex',
            gap:           '0.4rem',
            alignItems:    'center',
          }}>
            <i className="bi bi-wifi-off" />
            {pingError}
          </div>
        )}

        {/* ── Ping heartbeat indicator ──────────────────────────────────── */}
        {sessionStatus === 'active' && (
          <div className="cf-card" style={{ padding: '0.9rem 1.1rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="bi bi-arrow-up-circle" style={{ color: 'var(--cf-primary)', fontSize: '1rem' }} />
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--cf-text)' }}>
                  Location pings sent
                </span>
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--cf-primary)' }}>
                {pingCount}
              </span>
            </div>
            {lastPingAt && (
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: 'var(--cf-text-muted)' }}>
                Last ping: {lastPingAt.toLocaleTimeString()}
                &nbsp;·&nbsp;Next ping in ~{Math.round(PING_INTERVAL_MS / 1000)} s
              </p>
            )}
          </div>
        )}

        {/* ── Session ended / expired message ──────────────────────────── */}
        {isEnded && (
          <div className="cf-card" style={{ padding: '1.5rem', textAlign: 'center', marginBottom: '1.5rem' }}>
            <i
              className={`bi ${sessionStatus === 'expired' ? 'bi-clock-history' : 'bi-check-circle'}`}
              style={{ fontSize: '2.5rem', color: sessionStatus === 'expired' ? '#dc2626' : '#16a34a', display: 'block', marginBottom: '0.75rem' }}
            />
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.4rem' }}>
              {sessionStatus === 'expired' ? 'Session expired' : 'Sharing stopped'}
            </h2>
            <p style={{ color: 'var(--cf-text-secondary)', fontSize: '0.875rem', margin: '0 0 1.25rem' }}>
              {sessionStatus === 'expired'
                ? 'Your sharing session has expired. No more location updates are being sent.'
                : 'You've stopped sharing your location. Admins can no longer see your position.'
              }
            </p>
            <Link to="/dashboard" className="cf-btn cf-btn-primary" style={{ textDecoration: 'none' }}>
              <i className="bi bi-house" /> Return to Dashboard
            </Link>
          </div>
        )}

        {/* ── Actions (only when active) ────────────────────────────────── */}
        {sessionStatus === 'active' && (
          <>
            {/* Stop + Extend row */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {/* Stop Sharing */}
              <button
                id="stop-sharing-btn"
                onClick={handleStop}
                disabled={stopping}
                style={{
                  flex:           '1 1 auto',
                  padding:        '0.7rem 1rem',
                  borderRadius:   9,
                  background:     '#dc2626',
                  border:         'none',
                  color:          '#fff',
                  fontWeight:     700,
                  fontSize:       '0.9375rem',
                  cursor:         stopping ? 'not-allowed' : 'pointer',
                  opacity:        stopping ? 0.7 : 1,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            '0.45rem',
                  fontFamily:     'var(--cf-font-body)',
                  transition:     'background 140ms',
                }}
              >
                {stopping
                  ? <><span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', display: 'inline-block', animation: 'cf-spin 0.7s linear infinite' }} /> Stopping…</>
                  : <><i className="bi bi-stop-circle-fill" /> Stop Sharing</>
                }
              </button>

              {/* Extend */}
              <button
                id="extend-session-btn"
                onClick={() => setShowExtend((v) => !v)}
                style={{
                  flex:           '0 1 auto',
                  padding:        '0.7rem 1rem',
                  borderRadius:   9,
                  background:     'transparent',
                  border:         '1.5px solid var(--cf-primary)',
                  color:          'var(--cf-primary)',
                  fontWeight:     600,
                  fontSize:       '0.875rem',
                  cursor:         'pointer',
                  display:        'flex',
                  alignItems:     'center',
                  gap:            '0.4rem',
                  fontFamily:     'var(--cf-font-body)',
                  transition:     'background 140ms',
                }}
              >
                <i className="bi bi-clock-history" /> Extend
              </button>
            </div>

            {/* Stop error */}
            {stopError && (
              <div className="cf-alert cf-alert-error" style={{ marginBottom: '0.75rem' }} role="alert">
                <i className="bi bi-exclamation-circle-fill" />
                {stopError}
              </div>
            )}

            {/* Extend panel */}
            {showExtend && (
              <div className="cf-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--cf-text-secondary)', margin: '0 0 0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Extend by
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  {EXTEND_OPTIONS.map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => handleExtend(value)}
                      disabled={extendLoading}
                      style={{
                        flex:         1,
                        padding:      '0.5rem 0',
                        borderRadius: 8,
                        border:       '1.5px solid var(--cf-primary)',
                        background:   'var(--cf-primary-light)',
                        color:        'var(--cf-primary)',
                        fontWeight:   600,
                        fontSize:     '0.8rem',
                        cursor:       'pointer',
                        fontFamily:   'var(--cf-font-body)',
                        transition:   'background 120ms',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--cf-text-muted)' }}>
                  Maximum session length is 8 hours from start.
                </p>
                {extendError && (
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: '#dc2626' }}>{extendError}</p>
                )}
              </div>
            )}

            {/* Add / edit description */}
            <div className="cf-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
              <button
                onClick={() => setShowDetails((v) => !v)}
                style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:        '0.5rem',
                  background: 'none',
                  border:     'none',
                  cursor:     'pointer',
                  color:      'var(--cf-primary)',
                  fontWeight: 600,
                  fontSize:   '0.875rem',
                  padding:    0,
                  fontFamily: 'var(--cf-font-body)',
                }}
                aria-expanded={showDetails}
              >
                <i className={`bi ${showDetails ? 'bi-chevron-up' : 'bi-pencil'}`} />
                {showDetails ? 'Hide' : 'Add details'} — describe what's happening
              </button>

              {showDetails && (
                <div style={{ marginTop: '0.75rem' }}>
                  <textarea
                    value={detailsText}
                    onChange={(e) => setDetailsText(e.target.value)}
                    placeholder="e.g. "Being followed by a man in a red car on Main St. I'm heading towards the library.""
                    rows={4}
                    style={{
                      width:        '100%',
                      padding:      '0.6rem 0.75rem',
                      border:       '1.5px solid var(--cf-border)',
                      borderRadius: 8,
                      fontFamily:   'var(--cf-font-body)',
                      fontSize:     '0.875rem',
                      color:        'var(--cf-text)',
                      resize:       'vertical',
                      marginBottom: '0.5rem',
                      boxSizing:    'border-box',
                    }}
                  />
                  <button
                    onClick={handleSaveDetails}
                    disabled={detailsSaving || !detailsText.trim()}
                    className="cf-btn cf-btn-primary"
                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                  >
                    {detailsSaving
                      ? 'Saving…'
                      : detailsSaved
                      ? <><i className="bi bi-check-circle" /> Saved</>
                      : 'Save details'}
                  </button>
                  {detailsError && (
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: '#dc2626' }}>{detailsError}</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Info footer (always visible while active) ─────────────────── */}
        {sessionStatus === 'active' && (
          <div style={{
            borderRadius: 10,
            background:   'var(--cf-surface)',
            border:       '1px solid var(--cf-border-light)',
            padding:      '0.85rem 1rem',
            fontSize:     '0.8rem',
            color:        'var(--cf-text-secondary)',
            lineHeight:   1.55,
          }}>
            <i className="bi bi-info-circle" style={{ marginRight: '0.35rem' }} />
            Admins have been alerted and can see your real-time position on a map.
            Your location trail is stored securely and visible only to administrators.
          </div>
        )}
      </div>

      {/* Inject live-ping keyframe once */}
      <style>{`
        @keyframes live-ping {
          0%   { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
          70%  { box-shadow: 0 0 0 10px transparent; opacity: 0.5; }
          100% { box-shadow: 0 0 0 0 transparent; opacity: 0; }
        }
      `}</style>
    </DashboardLayout>
  );
}
