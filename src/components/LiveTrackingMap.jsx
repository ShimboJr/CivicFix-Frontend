/**
 * LiveTrackingMap.jsx
 *
 * Admin-only component that polls GET /api/live-location/:id every ~10 seconds
 * and renders a Leaflet map showing:
 *   • A marker at currentLocation (the most recent ping)
 *   • An accuracy circle around it (same pattern as LocationPicker)
 *   • A polyline connecting all points in locationTrail (movement pattern)
 *
 * Additional UI:
 *   • lastPingAt shown as a relative time ("12 seconds ago")
 *   • Staleness warning if >60 s have elapsed since the last ping — an active
 *     session going quiet is itself operationally significant, not just a glitch
 *   • Session status chip (active / ended / expired)
 *   • Polling stops automatically once status is no longer 'active'
 *
 * Trade-off note (visible in UI):
 *   This uses polling, not push-based real-time. Position updates on the admin
 *   map lag the resident's actual position by up to ~10 seconds — the polling
 *   interval. Acceptable for this deployment; a genuine real-time upgrade would
 *   require Pusher or Ably because the serverless backend cannot hold a
 *   persistent WebSocket connection.
 *
 * Props:
 *   sessionId  {string}  — LiveLocationSession._id to track
 *   onEnded    {fn?}     — optional callback fired when status turns non-active
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Polyline,
  useMap,
} from 'react-leaflet';
import api from '../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS   = 10_000;   // 10-second polling cadence
const STALE_THRESHOLD_MS = 60_000;   // warn if lastPingAt > 60 s ago
const DEFAULT_CENTER     = [6.5244, 3.3792]; // Lagos — same as LocationPicker
const DEFAULT_ZOOM       = 15;

// Accuracy-circle appearance — same palette as LocationPicker
const ACCURACY_CIRCLE_OPTIONS = {
  color:       '#dc2626',
  fillColor:   '#ef4444',
  fillOpacity: 0.10,
  weight:      1.5,
};

// Trail polyline style
const TRAIL_OPTIONS = {
  color:     '#2563eb',
  weight:    3,
  opacity:   0.65,
  dashArray: '6 4',
};

// Status chip colours
const STATUS_CHIPS = {
  active:  { bg: '#dcfce7', border: '#16a34a', text: '#15803d' },
  ended:   { bg: '#f8fafc', border: '#94a3b8', text: '#475569' },
  expired: { bg: '#fee2e2', border: '#fca5a5', text: '#b91c1c' },
};

// ── Helper — relative time string ─────────────────────────────────────────────
function relativeTime(dateStr) {
  if (!dateStr) return 'never';
  const diffMs  = Date.now() - new Date(dateStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5)   return 'just now';
  if (diffSec < 60)  return `${diffSec} second${diffSec !== 1 ? 's' : ''} ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60)  return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  const diffH   = Math.floor(diffMin / 60);
  return `${diffH} hour${diffH !== 1 ? 's' : ''} ago`;
}

// ── Sub-component: imperatively pans the map to a new centre ─────────────────
// Must be rendered inside <MapContainer> to have access to the Leaflet map instance.
function MapPanner({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && map) {
      map.panTo(center, { animate: true, duration: 0.6 });
    }
  }, [center, map]);
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LiveTrackingMap({ sessionId, onEnded }) {
  const [session,      setSession]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [fetchError,   setFetchError]   = useState('');
  const [relPingTime,  setRelPingTime]  = useState('');
  const [isStale,      setIsStale]      = useState(false);
  const [mapReady,     setMapReady]     = useState(false);

  const pollerRef    = useRef(null);
  const tickerRef    = useRef(null);   // 1-s UI clock for relative time
  const isActiveRef  = useRef(true);   // false once status != 'active' or unmount

  // ── Fetch session data ────────────────────────────────────────────────────
  const fetchSession = useCallback(async () => {
    try {
      const { data } = await api.get(`/live-location/${sessionId}`);
      setSession(data);
      setFetchError('');

      // Stop polling once session is no longer active
      if (data.status !== 'active') {
        isActiveRef.current = false;
        clearInterval(pollerRef.current);
        clearInterval(tickerRef.current);
        if (onEnded) onEnded(data.status);
      }
    } catch (err) {
      setFetchError(err.message || 'Failed to fetch tracking data');
    } finally {
      setLoading(false);
    }
  }, [sessionId, onEnded]);

  // ── On mount: initial fetch + polling + 1-s UI ticker ────────────────────
  useEffect(() => {
    isActiveRef.current = true;
    fetchSession();

    pollerRef.current = setInterval(() => {
      if (isActiveRef.current) fetchSession();
    }, POLL_INTERVAL_MS);

    // 1-second ticker to keep relPingTime fresh without re-polling the server
    tickerRef.current = setInterval(() => {
      if (!isActiveRef.current) return;
      setSession((prev) => {
        if (!prev) return prev;
        // Update derived staleness and relative time in the same tick
        const diffMs = prev.lastPingAt
          ? Date.now() - new Date(prev.lastPingAt).getTime()
          : Infinity;
        setIsStale(diffMs > STALE_THRESHOLD_MS);
        setRelPingTime(relativeTime(prev.lastPingAt));
        return prev; // don't actually clone session, just side-effect
      });
    }, 1_000);

    return () => {
      isActiveRef.current = false;
      clearInterval(pollerRef.current);
      clearInterval(tickerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Derived map data ──────────────────────────────────────────────────────
  const currentPos = session?.currentLocation
    ? [session.currentLocation.latitude, session.currentLocation.longitude]
    : null;

  const accuracyM = session?.currentLocation?.accuracy ?? null;

  // Convert trail to Leaflet latlng pairs (oldest→newest = natural order in DB)
  const trailPositions = (session?.locationTrail ?? [])
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => [p.latitude, p.longitude]);

  const statusChip = STATUS_CHIPS[session?.status] ?? STATUS_CHIPS.expired;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        border:       '2px solid #dc2626',
        borderRadius: 12,
        padding:      '1.5rem',
        background:   '#fff',
        display:      'flex',
        alignItems:   'center',
        gap:          '0.75rem',
        color:        'var(--cf-text-muted)',
        fontSize:     '0.875rem',
        marginBottom: '1.25rem',
      }}>
        <div className="cf-spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
        Loading live tracking data…
      </div>
    );
  }

  // ── Fetch error ───────────────────────────────────────────────────────────
  if (fetchError && !session) {
    return (
      <div className="cf-alert cf-alert-error" style={{ marginBottom: '1.25rem' }}>
        <i className="bi bi-exclamation-circle-fill" />
        {fetchError} — live map unavailable
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        border:       `2px solid ${session?.status === 'active' ? '#dc2626' : '#94a3b8'}`,
        borderRadius: 14,
        overflow:     'hidden',
        background:   '#fff',
        marginBottom: '1.25rem',
        boxShadow:    session?.status === 'active'
          ? '0 0 0 3px rgba(220,38,38,0.12), 0 4px 16px rgba(185,28,28,0.1)'
          : '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <div style={{
        padding:        '0.75rem 1rem',
        background:     session?.status === 'active' ? '#fff5f5' : '#f8fafc',
        borderBottom:   '1px solid rgba(220,38,38,0.15)',
        display:        'flex',
        alignItems:     'center',
        gap:            '0.65rem',
        flexWrap:       'wrap',
      }}>
        {/* Pulsing dot — only when active */}
        {session?.status === 'active' && (
          <span
            aria-hidden="true"
            style={{
              display:      'inline-block',
              width:        10,
              height:       10,
              borderRadius: '50%',
              background:   '#dc2626',
              flexShrink:   0,
              animation:    'ltm-pulse 1.5s ease-out infinite',
            }}
          />
        )}

        <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#b91c1c', fontFamily: 'var(--cf-font-heading)' }}>
          <i className="bi bi-broadcast-pin" style={{ marginRight: '0.35rem' }} />
          Live Location Tracking
        </span>

        {/* Status chip */}
        <span style={{
          display:      'inline-flex',
          alignItems:   'center',
          padding:      '0.15rem 0.6rem',
          background:   statusChip.bg,
          border:       `1px solid ${statusChip.border}`,
          borderRadius: 999,
          fontSize:     '0.72rem',
          fontWeight:   700,
          color:        statusChip.text,
          textTransform:'uppercase',
          letterSpacing:'0.05em',
        }}>
          {session?.status ?? 'unknown'}
        </span>

        {/* Reporter name */}
        {session?.reporter?.name && (
          <span style={{ fontSize: '0.8rem', color: 'var(--cf-text-secondary)', marginLeft: 'auto' }}>
            <i className="bi bi-person me-1" />
            {session.reporter.name}
          </span>
        )}
      </div>

      {/* ── Staleness warning ───────────────────────────────────────────── */}
      {session?.status === 'active' && isStale && (
        <div
          role="alert"
          style={{
            padding:     '0.6rem 1rem',
            background:  '#fef3c7',
            borderBottom:'1px solid #f59e0b',
            display:     'flex',
            gap:         '0.5rem',
            alignItems:  'center',
            fontSize:    '0.8125rem',
            color:       '#92400e',
          }}
        >
          <i className="bi bi-exclamation-triangle-fill" style={{ color: '#d97706', flexShrink: 0 }} />
          <strong>No pings received for over 60 seconds.</strong>
          &nbsp;The resident may have lost connection, locked their screen, or be in a signal dead zone.
          This silence is itself operationally significant — attempt contact via phone.
        </div>
      )}

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <div style={{ height: 360, position: 'relative' }}>
        {!currentPos && (
          <div style={{
            position:       'absolute',
            inset:          0,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            background:     '#f8fafc',
            zIndex:         1,
            gap:            '0.5rem',
            color:          'var(--cf-text-muted)',
            fontSize:       '0.875rem',
          }}>
            <i className="bi bi-geo-alt" style={{ fontSize: '2rem', opacity: 0.35 }} />
            Waiting for first location ping…
          </div>
        )}

        <MapContainer
          center={currentPos || DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          whenReady={() => setMapReady(true)}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Auto-pan to latest position on every poll update */}
          {currentPos && mapReady && <MapPanner center={currentPos} />}

          {/* Movement trail — polyline connecting all recorded pings */}
          {trailPositions.length >= 2 && (
            <Polyline positions={trailPositions} pathOptions={TRAIL_OPTIONS} />
          )}

          {/* Current position marker */}
          {currentPos && <Marker position={currentPos} />}

          {/* Accuracy circle — same pattern as LocationPicker */}
          {currentPos && accuracyM != null && accuracyM > 0 && (
            <Circle
              center={currentPos}
              radius={accuracyM}
              pathOptions={ACCURACY_CIRCLE_OPTIONS}
            />
          )}
        </MapContainer>
      </div>

      {/* ── Footer — ping metadata ───────────────────────────────────────── */}
      <div style={{
        padding:      '0.6rem 1rem',
        borderTop:    '1px solid var(--cf-border-light)',
        display:      'flex',
        flexWrap:     'wrap',
        gap:          '0.4rem 1.5rem',
        fontSize:     '0.78rem',
        color:        'var(--cf-text-secondary)',
        background:   '#fafafa',
        alignItems:   'center',
      }}>
        {/* Last ping */}
        <span>
          <i className="bi bi-clock me-1" />
          Last ping:&nbsp;
          <strong style={{ color: isStale ? '#b91c1c' : 'var(--cf-text)' }}>
            {relPingTime || relativeTime(session?.lastPingAt)}
          </strong>
        </span>

        {/* Accuracy */}
        {accuracyM != null && (
          <span>
            <i className="bi bi-crosshair me-1" />
            Accuracy: <strong>±{Math.round(accuracyM)} m</strong>
          </span>
        )}

        {/* Coordinates */}
        {currentPos && (
          <span style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
            {currentPos[0].toFixed(6)}, {currentPos[1].toFixed(6)}
          </span>
        )}

        {/* Trail point count */}
        {trailPositions.length > 0 && (
          <span style={{ marginLeft: 'auto' }}>
            <i className="bi bi-map me-1" />
            {trailPositions.length} trail point{trailPositions.length !== 1 ? 's' : ''}
          </span>
        )}

        {/* Polling note — visible at all times; intentional transparency about lag */}
        <span style={{
          width:      '100%',
          fontSize:   '0.7rem',
          color:      'var(--cf-text-muted)',
          fontStyle:  'italic',
          marginTop:  '0.1rem',
        }}>
          <i className="bi bi-info-circle me-1" />
          Updates every ~10 s via polling. Position may lag the resident's actual location by up to 10 seconds.
        </span>
      </div>

      {/* Inject keyframe once */}
      <style>{`
        @keyframes ltm-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(220,38,38,0.7); }
          70%  { box-shadow: 0 0 0 8px rgba(220,38,38,0); }
          100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
        }
      `}</style>
    </div>
  );
}
