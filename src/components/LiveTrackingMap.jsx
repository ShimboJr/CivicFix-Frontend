/**
 * LiveTrackingMap.jsx
 *
 * Admin-only component that renders a Leaflet map for a LiveLocationSession.
 *
 * ── ACTIVE session ────────────────────────────────────────────────────────────
 *   Polls GET /api/live-location/:id every ~10 seconds and shows:
 *     • A marker at currentLocation (the most recent ping)
 *     • An accuracy circle around it (same pattern as LocationPicker)
 *     • A polyline connecting all points in locationTrail (movement pattern)
 *     • "Last updated X seconds ago" relative time in the footer
 *     • Staleness warning if >60 s have elapsed since the last ping
 *     • Session status chip
 *
 * ── ENDED / EXPIRED session ───────────────────────────────────────────────────
 *   Performs ONE final fetch on mount (no polling) then renders a clearly-labelled
 *   static "Movement History" view:
 *     • Full polyline of the complete locationTrail
 *     • Distinct green start marker labelled "Sharing started here"
 *     • Distinct red end marker labelled "Last known location"
 *     • Hoverable/tappable trail points showing each point's timestamp
 *     • A share-window caption: "Shared from {startedAt} to {endedAt|expiresAt}"
 *   No staleness language ("last updated X ago") — that framing only makes sense
 *   for a live session.
 *
 * Trade-off note (visible in UI for active sessions):
 *   This uses polling, not push-based real-time.  Position updates on the admin
 *   map lag the resident's actual position by up to ~10 seconds — the polling
 *   interval.  Acceptable for this deployment; a genuine real-time upgrade would
 *   require Pusher or Ably because the serverless backend cannot hold a
 *   persistent WebSocket connection.
 *
 * Props:
 *   sessionId  {string}  — LiveLocationSession._id to track
 *   onEnded    {fn?}     — optional callback fired when status turns non-active
 *                          (receives the new status string; does NOT mean the
 *                           map disappears — the parent must decide that)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import api from '../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS   = 10_000;   // 10-second polling cadence (active only)
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

// Trail polyline style (active)
const TRAIL_OPTIONS = {
  color:     '#2563eb',
  weight:    3,
  opacity:   0.65,
  dashArray: '6 4',
};

// Trail polyline style (history — solid, more visible)
const HISTORY_TRAIL_OPTIONS = {
  color:     '#2563eb',
  weight:    3.5,
  opacity:   0.75,
};

// Hoverable point style (history)
const HISTORY_POINT_OPTIONS = {
  radius:      5,
  color:       '#2563eb',
  fillColor:   '#93c5fd',
  fillOpacity: 0.85,
  weight:      1.5,
};

// Status chip colours
const STATUS_CHIPS = {
  active:  { bg: '#dcfce7', border: '#16a34a', text: '#15803d' },
  ended:   { bg: '#f8fafc', border: '#94a3b8', text: '#475569' },
  expired: { bg: '#fee2e2', border: '#fca5a5', text: '#b91c1c' },
};

// ── Custom Leaflet icons ───────────────────────────────────────────────────────
function makeIcon(color, label) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        background:${color};border:2.5px solid #fff;
        border-radius:50%;width:16px;height:16px;
        box-shadow:0 2px 6px rgba(0,0,0,0.35);
        display:flex;align-items:center;justify-content:center;
      " title="${label}"></div>`,
    iconSize:   [16, 16],
    iconAnchor: [8, 8],
  });
}
const START_ICON = makeIcon('#16a34a', 'Sharing started here');
const END_ICON   = makeIcon('#dc2626', 'Last known location');

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

// ── Helper — absolute date/time string ────────────────────────────────────────
function fmtDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
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

// ── Sub-component: fits map bounds to show the full trail ─────────────────────
function BoundsFitter({ positions }) {
  const map    = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && positions.length >= 2 && map) {
      map.fitBounds(positions, { padding: [40, 40], maxZoom: 17 });
      fitted.current = true;
    }
  }, [positions, map]);
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

  const pollerRef   = useRef(null);
  const tickerRef   = useRef(null);  // 1-s UI clock for relative time
  const isActiveRef = useRef(true);  // false once status != 'active' or unmount

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

  // ── On mount: initial fetch + polling (active only) + 1-s UI ticker ──────
  useEffect(() => {
    isActiveRef.current = true;
    fetchSession();

    // Polling and the 1-second ticker are only meaningful while the session
    // is active.  fetchSession() turns them off automatically if the first
    // response comes back with a non-active status.
    pollerRef.current = setInterval(() => {
      if (isActiveRef.current) fetchSession();
    }, POLL_INTERVAL_MS);

    tickerRef.current = setInterval(() => {
      if (!isActiveRef.current) return;
      setSession((prev) => {
        if (!prev) return prev;
        const diffMs = prev.lastPingAt
          ? Date.now() - new Date(prev.lastPingAt).getTime()
          : Infinity;
        setIsStale(diffMs > STALE_THRESHOLD_MS);
        setRelPingTime(relativeTime(prev.lastPingAt));
        return prev;
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
  const isFinished = session && session.status !== 'active';

  const currentPos = session?.currentLocation
    ? [session.currentLocation.latitude, session.currentLocation.longitude]
    : null;

  const accuracyM = session?.currentLocation?.accuracy ?? null;

  // Full trail — includes timestamp on each point for tooltips
  const trailPoints = (session?.locationTrail ?? [])
    .filter((p) => p.latitude != null && p.longitude != null);

  const trailPositions = trailPoints.map((p) => [p.latitude, p.longitude]);

  // Start and end for history view
  const startPoint = trailPoints.length > 0 ? trailPoints[0] : null;
  const endPoint   = trailPoints.length > 0 ? trailPoints[trailPoints.length - 1] : null;

  const startPos = startPoint ? [startPoint.latitude, startPoint.longitude] : null;
  const endPos   = endPoint   ? [endPoint.latitude,   endPoint.longitude]   : null;

  // Share-window caption: "Shared from X to Y"
  const sessionStartedAt = session?.locationTrail?.[0]?.timestamp ?? session?.createdAt;
  const sessionEndedAt   = session?.endedAt ?? session?.expiresAt;

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
        Loading tracking data…
      </div>
    );
  }

  // ── Fetch error ───────────────────────────────────────────────────────────
  if (fetchError && !session) {
    return (
      <div className="cf-alert cf-alert-error" style={{ marginBottom: '1.25rem' }}>
        <i className="bi bi-exclamation-circle-fill" />
        {fetchError} — map unavailable
      </div>
    );
  }

  // ── Border / shadow differ for finished vs live ───────────────────────────
  const wrapperBorder  = isFinished ? '#64748b' : '#dc2626';
  const wrapperShadow  = isFinished
    ? '0 2px 8px rgba(0,0,0,0.06)'
    : '0 0 0 3px rgba(220,38,38,0.12), 0 4px 16px rgba(185,28,28,0.1)';
  const headerBg       = isFinished ? '#f8fafc' : '#fff5f5';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        border:       `2px solid ${wrapperBorder}`,
        borderRadius: 14,
        overflow:     'hidden',
        background:   '#fff',
        marginBottom: '1.25rem',
        boxShadow:    wrapperShadow,
      }}
    >
      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <div style={{
        padding:      '0.75rem 1rem',
        background:   headerBg,
        borderBottom: '1px solid rgba(100,116,139,0.18)',
        display:      'flex',
        alignItems:   'center',
        gap:          '0.65rem',
        flexWrap:     'wrap',
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

        {/* History icon — only when finished */}
        {isFinished && (
          <i
            className="bi bi-clock-history"
            style={{ color: '#64748b', fontSize: '0.95rem', flexShrink: 0 }}
          />
        )}

        <span style={{
          fontWeight:  700,
          fontSize:    '0.9375rem',
          color:       isFinished ? '#334155' : '#b91c1c',
          fontFamily:  'var(--cf-font-heading)',
        }}>
          <i
            className={isFinished ? 'bi bi-map' : 'bi bi-broadcast-pin'}
            style={{ marginRight: '0.35rem' }}
          />
          {isFinished ? 'Movement History' : 'Live Location Tracking'}
        </span>

        {/* Status chip */}
        <span style={{
          display:       'inline-flex',
          alignItems:    'center',
          padding:       '0.15rem 0.6rem',
          background:    statusChip.bg,
          border:        `1px solid ${statusChip.border}`,
          borderRadius:  999,
          fontSize:      '0.72rem',
          fontWeight:    700,
          color:         statusChip.text,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
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

      {/* ── Share-window caption (finished sessions only) ────────────────── */}
      {isFinished && (sessionStartedAt || sessionEndedAt) && (
        <div style={{
          padding:     '0.55rem 1rem',
          background:  '#f1f5f9',
          borderBottom:'1px solid #e2e8f0',
          fontSize:    '0.8rem',
          color:       '#475569',
          display:     'flex',
          alignItems:  'center',
          gap:         '0.45rem',
          flexWrap:    'wrap',
        }}>
          <i className="bi bi-calendar-range" style={{ color: '#64748b', flexShrink: 0 }} />
          <span>
            Shared from{' '}
            <strong>{fmtDateTime(sessionStartedAt)}</strong>
            {sessionEndedAt && (
              <> to <strong>{fmtDateTime(sessionEndedAt)}</strong></>
            )}
          </span>
          {trailPoints.length > 0 && (
            <span style={{ marginLeft: 'auto', fontStyle: 'italic', color: '#64748b' }}>
              {trailPoints.length} location point{trailPoints.length !== 1 ? 's' : ''} recorded
            </span>
          )}
        </div>
      )}

      {/* ── Staleness warning (active sessions only) ─────────────────────── */}
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

      {/* ── Legend (finished sessions with a trail) ──────────────────────── */}
      {isFinished && trailPositions.length > 0 && (
        <div style={{
          padding:     '0.45rem 1rem',
          background:  '#f8fafc',
          borderBottom:'1px solid #e2e8f0',
          display:     'flex',
          gap:         '1.25rem',
          flexWrap:    'wrap',
          fontSize:    '0.76rem',
          color:       '#475569',
          alignItems:  'center',
        }}>
          <span style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
            <span style={{
              width:12, height:12, borderRadius:'50%',
              background:'#16a34a', border:'2px solid #fff',
              boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
              display:'inline-block', flexShrink:0,
            }}/>
            Sharing started here
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
            <span style={{
              width:12, height:12, borderRadius:'50%',
              background:'#dc2626', border:'2px solid #fff',
              boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
              display:'inline-block', flexShrink:0,
            }}/>
            Last known location
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
            <span style={{
              width:16, height:3,
              background:'#2563eb',
              display:'inline-block', flexShrink:0,
              borderRadius:2,
            }}/>
            Movement path
          </span>
          <span style={{ marginLeft:'auto', fontStyle:'italic', color:'#94a3b8' }}>
            Hover a point to see its timestamp
          </span>
        </div>
      )}

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <div style={{ height: 380, position: 'relative' }}>
        {!currentPos && !startPos && (
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
            {isFinished ? 'No location data recorded for this session.' : 'Waiting for first location ping…'}
          </div>
        )}

        <MapContainer
          center={currentPos || startPos || DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          whenReady={() => setMapReady(true)}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* ── ACTIVE SESSION ──────────────────────────────────────────── */}
          {!isFinished && (
            <>
              {/* Auto-pan to latest position on every poll update */}
              {currentPos && mapReady && <MapPanner center={currentPos} />}

              {/* Movement trail */}
              {trailPositions.length >= 2 && (
                <Polyline positions={trailPositions} pathOptions={TRAIL_OPTIONS} />
              )}

              {/* Current position marker */}
              {currentPos && <Marker position={currentPos} />}

              {/* Accuracy circle */}
              {currentPos && accuracyM != null && accuracyM > 0 && (
                <Circle
                  center={currentPos}
                  radius={accuracyM}
                  pathOptions={ACCURACY_CIRCLE_OPTIONS}
                />
              )}
            </>
          )}

          {/* ── FINISHED SESSION — static Movement History ──────────────── */}
          {isFinished && (
            <>
              {/* Fit map to show full trail on first render */}
              {trailPositions.length >= 2 && mapReady && (
                <BoundsFitter positions={trailPositions} />
              )}

              {/* Full path polyline */}
              {trailPositions.length >= 2 && (
                <Polyline positions={trailPositions} pathOptions={HISTORY_TRAIL_OPTIONS} />
              )}

              {/* Hoverable intermediate trail points (exclude first & last) */}
              {trailPoints.slice(1, -1).map((p, idx) => (
                <CircleMarker
                  key={idx}
                  center={[p.latitude, p.longitude]}
                  pathOptions={HISTORY_POINT_OPTIONS}
                  radius={5}
                >
                  <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                    <span style={{ fontSize: '0.75rem' }}>
                      {p.timestamp
                        ? new Date(p.timestamp).toLocaleString('en-GB', {
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                            day: 'numeric', month: 'short',
                          })
                        : 'Unknown time'}
                    </span>
                  </Tooltip>
                </CircleMarker>
              ))}

              {/* Start marker */}
              {startPos && (
                <Marker position={startPos} icon={START_ICON}>
                  <Tooltip direction="top" offset={[0, -10]} opacity={0.95} permanent={false}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#15803d' }}>
                      <i className="bi bi-flag-fill" style={{ marginRight: '0.3rem' }} />
                      Sharing started here
                      {startPoint?.timestamp && (
                        <><br />{new Date(startPoint.timestamp).toLocaleString('en-GB', {
                          hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
                        })}</>
                      )}
                    </span>
                  </Tooltip>
                </Marker>
              )}

              {/* End marker — distinct from start */}
              {endPos && endPos !== startPos && (
                <Marker position={endPos} icon={END_ICON}>
                  <Tooltip direction="top" offset={[0, -10]} opacity={0.95} permanent={false}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#b91c1c' }}>
                      <i className="bi bi-geo-alt-fill" style={{ marginRight: '0.3rem' }} />
                      Last known location
                      {endPoint?.timestamp && (
                        <><br />{new Date(endPoint.timestamp).toLocaleString('en-GB', {
                          hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
                        })}</>
                      )}
                    </span>
                  </Tooltip>
                </Marker>
              )}
            </>
          )}
        </MapContainer>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div style={{
        padding:    '0.6rem 1rem',
        borderTop:  '1px solid var(--cf-border-light)',
        display:    'flex',
        flexWrap:   'wrap',
        gap:        '0.4rem 1.5rem',
        fontSize:   '0.78rem',
        color:      'var(--cf-text-secondary)',
        background: '#fafafa',
        alignItems: 'center',
      }}>
        {/* ── Active session footer ──────────────────────────────────────── */}
        {!isFinished && (
          <>
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

            {/* Polling note */}
            <span style={{
              width:     '100%',
              fontSize:  '0.7rem',
              color:     'var(--cf-text-muted)',
              fontStyle: 'italic',
              marginTop: '0.1rem',
            }}>
              <i className="bi bi-info-circle me-1" />
              Updates every ~10 s via polling. Position may lag the resident's actual location by up to 10 seconds.
            </span>
          </>
        )}

        {/* ── Finished session footer ────────────────────────────────────── */}
        {isFinished && (
          <>
            <span>
              <i className="bi bi-check2-circle me-1" style={{ color: '#64748b' }} />
              Session <strong>{session.status}</strong>
              {session.endedAt
                ? <> · ended {fmtDateTime(session.endedAt)}</>
                : session.expiresAt
                  ? <> · expired {fmtDateTime(session.expiresAt)}</>
                  : null
              }
            </span>

            {trailPositions.length > 0 && (
              <span style={{ marginLeft: 'auto' }}>
                <i className="bi bi-map me-1" />
                {trailPositions.length} point{trailPositions.length !== 1 ? 's' : ''} recorded
              </span>
            )}

            <span style={{
              width:     '100%',
              fontSize:  '0.7rem',
              color:     'var(--cf-text-muted)',
              fontStyle: 'italic',
              marginTop: '0.1rem',
            }}>
              <i className="bi bi-info-circle me-1" />
              This is a static history view. Hover or tap any point on the path to see its timestamp.
            </span>
          </>
        )}
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
