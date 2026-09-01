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
 * Geolocation strategy (high-accuracy watchPosition):
 *  GPS fixes improve over the first several seconds as more satellites lock
 *  in.  Rather than accepting the first reading from getCurrentPosition
 *  (which often comes from Wi-Fi/cell-tower triangulation and can be off by
 *  hundreds of metres), we use watchPosition with enableHighAccuracy:true so
 *  the device activates its GPS chip, accumulate readings for up to
 *  GPS_WATCH_MAX_MS, and stop early if position.coords.accuracy falls below
 *  GPS_ACCURACY_THRESHOLD_M.  We always keep the best (smallest-radius)
 *  reading seen across all callbacks.
 *
 *  The resulting accuracy (in metres) is shown as a translucent circle on
 *  the map so the resident can judge how tight the fix is, and a caption
 *  reminds them they can tap the map to manually fine-tune the pin.
 *  Clicking the map clears the accuracy circle (the circle only makes sense
 *  for auto-detected positions, not manually placed pins).
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
// ─────────────────────────────────
// GPS_WATCH_MAX_MS:         Maximum time to keep the watch alive before stopping
//                           and accepting whatever best reading we collected.
//                           8 seconds is long enough to get a GPS lock on most
//                           modern devices in open sky; short enough not to feel
//                           like a hang.
// GPS_ACCURACY_THRESHOLD_M: Stop the watch early once accuracy is this good.
//                           20 m is tighter than Wi-Fi triangulation (often
//                           >100 m) but achievable with a GPS chip in a few
//                           seconds of clear sky.
const GPS_WATCH_MAX_MS        = 8_000;
const GPS_ACCURACY_THRESHOLD_M = 20;

// Accuracy-circle appearance
// Leaflet's Circle takes a `pathOptions` object for Leaflet 1.x style props.
const ACCURACY_CIRCLE_OPTIONS = {
  color:       '#2563eb',   // blue stroke
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
  const map = useMapEvents({});        // get map instance
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
  // Shown as a translucent circle on the map so the resident can see how
  // precise the reading is.  Cleared when the user manually clicks the map
  // (their clicked pin is intentional; the circle would then be misleading).
  const [accuracyRadius, setAccuracyRadius] = useState(null);

  // Ref to imperative Leaflet map (for flyTo calls)
  const mapRef = useRef(null);

  // Debounce timer for forward-geocode on text input
  const debounceRef = useRef(null);

  // watchId from navigator.geolocation.watchPosition — kept in a ref so we
  // can clearWatch from both the timeout and the early-stop path without
  // creating a stale-closure problem.
  const watchIdRef      = useRef(null);
  const watchTimerRef   = useRef(null);

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

    // The user deliberately placed their own pin — the GPS accuracy circle no
    // longer refers to this position, so hide it to avoid confusion.
    setAccuracyRadius(null);

    // Optimistically push raw coords so the form isn't blocked
    onChange({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, latitude: lat, longitude: lng });
    setAddressText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);

    // Then refine with human-readable address
    const addr = await reverseGeocode(lat, lng);
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

      // Pan map to the geocoded location
      if (mapRef.current) {
        mapRef.current.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 14));
      }
    }, 600); // 600 ms debounce — avoids firing on every keystroke
  };

  // ── Stop any in-progress watch ────────────────────────────────────────────
  // Extracted so it can be called from both the timeout path and the early-
  // stop path without duplicating logic.
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

  // Clean up on unmount — don't leave a watch running in the background.
  useEffect(() => stopWatch, [stopWatch]);

  // ── "Use my location" button — watchPosition with high accuracy ──────────
  //
  // WHY watchPosition INSTEAD OF getCurrentPosition:
  //   getCurrentPosition returns the first available fix, which on mobile
  //   often comes from Wi-Fi/cell-tower triangulation (quick but coarse,
  //   accuracy radius typically 50–500 m).  GPS chip fixes improve as more
  //   satellites lock in over the first several seconds.  watchPosition lets
  //   us collect multiple fixes and keep the best one (smallest accuracy
  //   radius), then clearWatch once we're done.
  //
  // enableHighAccuracy: true   — asks the device to activate its GPS chip
  // maximumAge: 0              — forces a fresh reading (no cached fix)
  // timeout: 15000             — per-callback timeout (not total)
  //
  // We stop the watch when either:
  //   (a) GPS_WATCH_MAX_MS has elapsed (accept whatever best we collected)
  //   (b) accuracy ≤ GPS_ACCURACY_THRESHOLD_M (good enough — stop early)
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
    // Stored in a plain object so callbacks always close over the same
    // reference without stale-closure issues on the accuracy comparison.
    const best = { pos: null, accuracy: Infinity };

    // Shared callback for applying a position to the map + calling onChange.
    // Called both on early-stop and on the 8-second timeout.
    const applyPosition = async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy; // metres

      setMarkerPos([lat, lng]);
      setAccuracyRadius(acc);
      onChange({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, latitude: lat, longitude: lng });
      setAddressText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      if (mapRef.current) mapRef.current.flyTo([lat, lng], 16);

      const addr = await reverseGeocode(lat, lng);
      setAddressText(addr);
      onChange({ address: addr, latitude: lat, longitude: lng });
      setLocating(false);
    };

    const onSuccess = (pos) => {
      const accuracy = pos.coords.accuracy;

      // Keep the sharpest reading we've seen
      if (accuracy < best.accuracy) {
        best.accuracy = accuracy;
        best.pos      = pos;
      }

      // Early-stop: accuracy is good enough — no need to wait any longer
      if (accuracy <= GPS_ACCURACY_THRESHOLD_M) {
        stopWatch();
        applyPosition(pos);
      }
      // Otherwise keep watching until the timeout fires
    };

    const onError = (err) => {
      // If we already have a best reading, use it rather than showing an error
      // (e.g. the watch timed out on one callback but we got earlier fixes).
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
        timeout:            15_000, // per-callback timeout for the OS to return a reading
      }
    );

    // Hard deadline: stop the watch after GPS_WATCH_MAX_MS regardless of
    // whether we hit the accuracy threshold.  Apply whatever best reading
    // we've collected so far; if none arrived at all, show the error.
    watchTimerRef.current = setTimeout(() => {
      stopWatch();
      if (best.pos) {
        applyPosition(best.pos);
      } else {
        setLocating(false);
        setLocError('Unable to retrieve your location within the timeout. Please click the map instead.');
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
              position.coords.accuracy — the same value a native maps app shows
              as its "blue disc".  Leaflet's Circle takes radius in metres. */}
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
