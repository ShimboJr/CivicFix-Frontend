/**
 * LocationPicker.jsx
 *
 * An interactive Leaflet map that lets a user pick a location by:
 *  1. Clicking anywhere on the map to drop/move a marker
 *  2. Typing a free-text address and forward-geocoding it (Nominatim)
 *  3. Pressing "Use my location" to geolocate via the browser API
 *
 * Props:
 *  value    — { address, latitude, longitude } | null
 *  onChange — (payload: { address, latitude, longitude }) => void
 *
 * The map click is the primary input; the text field is kept in sync
 * as a confirmation / fallback.  Neither path blocks the other:
 *  • A reverse-geocode failure shows raw coordinates instead of crashing.
 *  • A forward-geocode failure is surfaced as a small inline notice.
 *  • Geolocation denial shows a polite message.
 *
 * ── Geolocation strategy (high-accuracy watchPosition) ────────────────────────
 *
 * GPS fixes improve over the first several seconds as more satellites lock in.
 * Rather than accepting the first reading from getCurrentPosition (which often
 * comes from Wi-Fi/cell-tower triangulation, accuracy 50–500 m), we use
 * watchPosition with enableHighAccuracy:true so the device activates its GPS
 * chip, accumulate readings for up to GPS_WATCH_MAX_MS, and stop early if
 * position.coords.accuracy falls below GPS_ACCURACY_THRESHOLD_M.
 *
 * Key design choices that prevent the three bugs this file previously had:
 *
 *   FIX 1 — One geocode call per session, not one per tick
 *     onSuccess never calls applyPosition.  It only updates the `best` tracker.
 *     applyPosition (and therefore reverseGeocode) is called exactly once, at
 *     the moment the watch window ends — either via early-stop or timeout.
 *
 *   FIX 2 — Stale-response protection via geocodeEpochRef
 *     Every time applyPosition starts a reverseGeocode call, it stamps the
 *     current value of geocodeEpochRef.  If a newer call has been started by
 *     the time the fetch resolves, the older result is discarded.  An older,
 *     slower response can never overwrite a newer, better result.
 *
 *   FIX 3 — Graceful degradation: best-available, not all-or-nothing
 *     The timeout path applies best.pos when it exists (any accuracy), only
 *     showing an error when truly zero position updates arrived.  A real GPS
 *     reading with wide uncertainty is far better than forcing a manual pin drop.
 *     The error message is tightened to "no GPS signal" which is the only case
 *     that now reaches it.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  useMapEvents,
} from 'react-leaflet';

// ── Constants ──────────────────────────────────────────────────────────────────
const LAGOS_CENTER = [6.5244, 3.3792];   // Default map centre (Lagos, Nigeria)
const DEFAULT_ZOOM = 12;
const NOMINATIM    = 'https://nominatim.openstreetmap.org';

// High-accuracy GPS watch parameters
// GPS_WATCH_MAX_MS:         Maximum time to keep the watch alive before stopping
//                           and accepting whatever best reading we collected.
//                           8 seconds is long enough to get a GPS lock on most
//                           modern devices in open sky; short enough not to feel
//                           like a hang.
// GPS_ACCURACY_THRESHOLD_M: Stop the watch early once accuracy is this good.
//                           20 m is tighter than Wi-Fi triangulation (often
//                           >100 m) but achievable with a GPS chip in a few
//                           seconds of clear sky.
const GPS_WATCH_MAX_MS         = 8_000;
const GPS_ACCURACY_THRESHOLD_M = 20;

// Accuracy-circle appearance
const ACCURACY_CIRCLE_OPTIONS = {
  color:       '#2563eb',
  fillColor:   '#3b82f6',
  fillOpacity: 0.12,
  weight:      1.5,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reverse-geocode a lat/lng via Nominatim.  Falls back to raw coords string. */
async function reverseGeocode(lat, lng) {
  try {
    const res  = await fetch(
      `${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) throw new Error('Nominatim error');
    const data = await res.json();
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

/** Forward-geocode a query string via Nominatim. Returns first result or null. */
async function forwardGeocode(query) {
  try {
    const res  = await fetch(
      `${NOMINATIM}/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) throw new Error('Nominatim error');
    const data = await res.json();
    if (!data.length) return null;
    return {
      lat:     parseFloat(data[0].lat),
      lng:     parseFloat(data[0].lon),
      address: data[0].display_name,
    };
  } catch {
    return null;
  }
}

// ── Internal sub-component: listens to map click events ───────────────────────
function ClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) });
  return null;
}

// ── Internal sub-component: exposes imperative map methods to the parent ───────
function MapController({ controllerRef }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (controllerRef) controllerRef.current = map;
  }, [map, controllerRef]);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LocationPicker({ value, onChange }) {
  // markerPos drives the visible marker; null = no marker yet
  const [markerPos,     setMarkerPos]    = useState(
    value?.latitude && value?.longitude
      ? [value.latitude, value.longitude]
      : null
  );
  const [addressText,   setAddressText]  = useState(value?.address || '');
  const [geocoding,     setGeocoding]    = useState(false);
  const [geoError,      setGeoError]     = useState('');   // forward-geocode miss
  const [locating,      setLocating]     = useState(false); // browser geolocation
  const [locError,      setLocError]     = useState('');

  // accuracyRadius: metres reported by position.coords.accuracy for the best
  // GPS fix we collected, or null when no GPS fix is active.
  const [accuracyRadius, setAccuracyRadius] = useState(null);

  // Ref to imperative Leaflet map (for flyTo calls)
  const mapRef = useRef(null);

  // Debounce timer for forward-geocode on text input
  const debounceRef = useRef(null);

  // watchId + timer from watchPosition — kept in refs to avoid stale closures
  const watchIdRef    = useRef(null);
  const watchTimerRef = useRef(null);

  // ── FIX 2: geocode epoch / request-id tracker ─────────────────────────────
  // Incremented each time applyPosition kicks off a reverseGeocode call.
  // The async callback checks whether the epoch still matches before writing
  // any state — if a newer call has been issued, the older result is ignored.
  // This guarantees that an older, slower Nominatim response arriving late
  // can never overwrite a newer, better result already applied to the form.
  const geocodeEpochRef = useRef(0);

  // ── Sync prop value → internal state (controlled usage) ──────────────────
  useEffect(() => {
    if (value?.latitude && value?.longitude) {
      setMarkerPos([value.latitude, value.longitude]);
    }
    if (value?.address !== undefined) {
      setAddressText(value.address);
    }
  }, [value]);

  // ── Map click → reverse-geocode → call onChange ──────────────────────────
  const handleMapClick = useCallback(async ({ lat, lng }) => {
    setMarkerPos([lat, lng]);
    setGeoError('');
    setLocError('');

    // The user deliberately placed their own pin — clear the GPS accuracy
    // circle since it no longer refers to this position.
    setAccuracyRadius(null);

    // Optimistically push raw coords so the form isn't blocked
    onChange({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, latitude: lat, longitude: lng });
    setAddressText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);

    // Stamp the epoch for this geocode call
    const myEpoch = ++geocodeEpochRef.current;

    // Then refine with a human-readable address
    const addr = await reverseGeocode(lat, lng);

    // Discard if a newer call has already run (e.g. user clicked map twice quickly)
    if (geocodeEpochRef.current !== myEpoch) return;

    setAddressText(addr);
    onChange({ address: addr, latitude: lat, longitude: lng });
  }, [onChange]);

  // ── Text input → debounced forward-geocode ────────────────────────────────
  const handleAddressInput = (e) => {
    const q = e.target.value;
    setAddressText(q);
    setGeoError('');

    clearTimeout(debounceRef.current);
    if (!q.trim()) return;

    debounceRef.current = setTimeout(async () => {
      setGeocoding(true);
      const result = await forwardGeocode(q);
      setGeocoding(false);

      if (!result) {
        setGeoError('Address not found — try a more specific query, or click the map.');
        return;
      }

      const { lat, lng, address } = result;
      setMarkerPos([lat, lng]);
      setAddressText(address);
      onChange({ address, latitude: lat, longitude: lng });

      if (mapRef.current) {
        mapRef.current.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 14));
      }
    }, 600);
  };

  // ── Stop any in-progress watch ────────────────────────────────────────────
  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (watchTimerRef.current !== null) {
      clearTimeout(watchTimerRef.current);
      watchTimerRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => stopWatch, [stopWatch]);

  // ── "Use my location" button — watchPosition with high accuracy ──────────
  //
  // ── FIX 1: one geocode call per session ──────────────────────────────────
  // onSuccess NEVER calls applyPosition — it only keeps `best` updated.
  // applyPosition is called exactly once, at the moment the watch ends
  // (early-stop when threshold is met, or 8s timeout with best-available).
  //
  // ── FIX 3: graceful degradation ──────────────────────────────────────────
  // The timeout path applies best.pos regardless of its accuracy value — a
  // real GPS reading at 80m accuracy is far better than failing entirely.
  // The error message only fires when truly zero updates were received.
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLocError('Your browser does not support Geolocation.');
      return;
    }

    // Cancel any previous watch before starting a new one
    stopWatch();

    setLocating(true);
    setLocError('');
    setAccuracyRadius(null);

    // Track the best position seen so far (smallest accuracy radius).
    // Plain object — callbacks always close over the same reference.
    const best = { pos: null, accuracy: Infinity };

    // Guards against applyPosition being called a second time if the OS
    // delivers one extra position event after clearWatch() is processed
    // (a known browser behaviour on some platforms).
    let watchEnded = false;

    // ── applyPosition: called exactly ONCE per session ────────────────────
    //
    // FIX 1: called only from early-stop or timeout — never from each tick.
    // FIX 2: stamps a geocodeEpoch so any previous in-flight call is ignored.
    const applyPosition = async (pos) => {
      // Re-entracy guard — belt-and-suspenders on top of stopWatch()
      if (watchEnded) return;
      watchEnded = true;

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;

      // Immediately update the map and form with raw coords so the user sees
      // instant feedback even before the geocode resolves.
      setMarkerPos([lat, lng]);
      setAccuracyRadius(acc);
      onChange({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, latitude: lat, longitude: lng });
      setAddressText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      if (mapRef.current) mapRef.current.flyTo([lat, lng], 16);

      // Stamp this geocode generation.  Any earlier in-flight call (from a
      // previous "My location" press) will see a mismatched epoch and discard
      // its result without touching state.
      const myEpoch = ++geocodeEpochRef.current;

      const addr = await reverseGeocode(lat, lng);

      // FIX 2: discard if a newer geocode has been issued (e.g. user pressed
      // "My location" again while this fetch was in-flight).
      if (geocodeEpochRef.current !== myEpoch) return;

      setAddressText(addr);
      onChange({ address: addr, latitude: lat, longitude: lng });
      setLocating(false);
    };

    // ── onSuccess: collect readings, never geocode ────────────────────────
    const onSuccess = (pos) => {
      const accuracy = pos.coords.accuracy;

      // Keep the sharpest reading seen so far
      if (accuracy < best.accuracy) {
        best.accuracy = accuracy;
        best.pos      = pos;
      }

      // Early-stop: accuracy threshold met — no need to wait out the full window
      if (accuracy <= GPS_ACCURACY_THRESHOLD_M) {
        stopWatch();
        applyPosition(pos);
      }
      // Otherwise: keep watching — timeout will call applyPosition at deadline
    };

    const onError = (err) => {
      // If we already have a best reading, use it rather than showing an error.
      // This covers the case where the watch timed out on one callback but
      // valid fixes arrived earlier in the session.
      if (best.pos) {
        stopWatch();
        applyPosition(best.pos);
        return;
      }
      stopWatch();
      setLocating(false);
      if (err.code === err.PERMISSION_DENIED) {
        setLocError('Location access was denied. Please allow it in your browser settings or click the map instead.');
      } else {
        setLocError('Unable to retrieve your location. Please click the map instead.');
      }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      onSuccess,
      onError,
      {
        enableHighAccuracy: true,
        maximumAge:         0,      // never return a cached fix
        timeout:            15_000, // per-callback OS timeout
      }
    );

    // ── Hard deadline ─────────────────────────────────────────────────────
    // Stop the watch after GPS_WATCH_MAX_MS regardless of accuracy threshold.
    //
    // FIX 3: Apply whatever best reading we collected, even if its accuracy
    // never crossed the 20m threshold.  Any real GPS reading — even 200m —
    // is far better than forcing the user to drop a pin manually.
    // Only show an error when truly zero position updates arrived at all
    // (which means GPS is genuinely non-functional on this device/environment).
    watchTimerRef.current = setTimeout(() => {
      stopWatch();
      if (best.pos) {
        // Good-enough accuracy or not — use it.  The accuracy circle on the map
        // will show the user exactly how precise the reading is so they can
        // tap to fine-tune if needed.
        applyPosition(best.pos);
      } else {
        // Zero updates received — GPS is actually broken (no signal, airplane
        // mode, hardware disabled).  This is the only case that shows an error.
        setLocating(false);
        setLocError('Could not get a GPS signal. Please click the map to set your location manually.');
      }
    }, GPS_WATCH_MAX_MS);
  };

  return (
    <div>
      {/* ── Address text field ──────────────────────────────────────────── */}
      <div style={{ marginBottom: '0.6rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <i className="bi bi-geo-alt" style={{
              position: 'absolute', left: '0.75rem', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--cf-text-muted)',
              pointerEvents: 'none',
            }} />
            <input
              type="text"
              value={addressText}
              onChange={handleAddressInput}
              className="cf-input"
              style={{ paddingLeft: '2.25rem', paddingRight: geocoding ? '2.25rem' : undefined }}
              placeholder="Type an address or click the map…"
            />
            {geocoding && (
              <span style={{
                position: 'absolute', right: '0.75rem', top: '50%',
                transform: 'translateY(-50%)', fontSize: '0.7rem',
                color: 'var(--cf-text-muted)',
              }}>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              </span>
            )}
          </div>

          {/* Use my location */}
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={locating}
            title="Use my current location"
            style={{
              flexShrink: 0,
              padding: '0.55rem 0.75rem',
              background: 'var(--cf-primary-light)',
              border: '1.5px solid var(--cf-primary)',
              borderRadius: 'var(--cf-radius-md)',
              color: 'var(--cf-primary)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              fontSize: '0.8125rem', fontWeight: 600,
              transition: 'background 150ms',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => !locating && (e.currentTarget.style.background = '#b8d8eb')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--cf-primary-light)')}
          >
            {locating
              ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              : <i className="bi bi-crosshair" />
            }
            {locating ? 'Locating…' : 'My location'}
          </button>
        </div>

        {/* Error notices */}
        {geoError && <p style={{ fontSize: '0.78rem', color: 'var(--cf-status-rejected)', marginTop: '0.3rem' }}>{geoError}</p>}
        {locError && <p style={{ fontSize: '0.78rem', color: '#d97706', marginTop: '0.3rem' }}>{locError}</p>}
      </div>

      {/* ── Hint ───────────────────────────────────────────────────────────── */}
      {/* After a GPS fix: remind the user they can tap to fine-tune the pin. */}
      {/* Before a fix: explain the two input methods.                        */}
      <p style={{ fontSize: '0.76rem', color: 'var(--cf-text-muted)', marginBottom: '0.5rem', marginTop: 0 }}>
        <i className="bi bi-info-circle me-1" />
        {accuracyRadius !== null
          ? <>GPS fix acquired — accuracy ≈ {Math.round(accuracyRadius)} m (shown as blue circle).{' '}
              <strong style={{ color: 'var(--cf-text-secondary)' }}>Not quite right? Tap the map to adjust.</strong></>
          : 'Click anywhere on the map to drop a pin, or type an address above.'
        }
      </p>

      {/* ── Leaflet map ────────────────────────────────────────────────────── */}
      <div style={{
        height: 320,
        borderRadius: 'var(--cf-radius-md)',
        overflow: 'hidden',
        border: '1.5px solid var(--cf-border)',
      }}>
        <MapContainer
          center={markerPos || LAGOS_CENTER}
          zoom={markerPos ? 15 : DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <ClickHandler onMapClick={handleMapClick} />
          <MapController controllerRef={mapRef} />

          {markerPos && <Marker position={markerPos} />}

          {/* Accuracy circle — only shown after a GPS fix, not after a manual
              map click.  The radius (metres) comes directly from the browser's
              position.coords.accuracy.  Leaflet's Circle takes radius in metres. */}
          {markerPos && accuracyRadius !== null && (
            <Circle
              center={markerPos}
              radius={accuracyRadius}
              pathOptions={ACCURACY_CIRCLE_OPTIONS}
            />
          )}
        </MapContainer>
      </div>

      {/* ── Coordinates display (when a pin has been dropped) ─────────────── */}
      {markerPos && (
        <p style={{
          fontSize: '0.73rem', color: 'var(--cf-text-muted)',
          marginTop: '0.35rem', marginBottom: 0, fontFamily: 'monospace',
        }}>
          <i className="bi bi-pin-map me-1" />
          {markerPos[0].toFixed(6)}, {markerPos[1].toFixed(6)}
          {accuracyRadius !== null && (
            <span style={{ marginLeft: '0.6rem', color: '#2563eb' }}>
              ± {Math.round(accuracyRadius)} m
            </span>
          )}
        </p>
      )}
    </div>
  );
}
