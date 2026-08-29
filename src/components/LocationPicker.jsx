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
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
} from 'react-leaflet';

// ── Constants ──────────────────────────────────────────────────────────────────
const LAGOS_CENTER = [6.5244, 3.3792];   // Default map centre (Lagos, Nigeria)
const DEFAULT_ZOOM = 12;
const NOMINATIM    = 'https://nominatim.openstreetmap.org';

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
  const [markerPos,    setMarkerPos]    = useState(
    value?.latitude && value?.longitude
      ? [value.latitude, value.longitude]
      : null
  );
  const [addressText,  setAddressText]  = useState(value?.address || '');
  const [geocoding,    setGeocoding]    = useState(false);
  const [geoError,     setGeoError]     = useState('');   // forward-geocode miss
  const [locating,     setLocating]     = useState(false); // browser geolocation
  const [locError,     setLocError]     = useState('');

  // Ref to imperative Leaflet map (for flyTo calls)
  const mapRef = useRef(null);

  // Debounce timer for forward-geocode on text input
  const debounceRef = useRef(null);

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

  // ── "Use my location" button ──────────────────────────────────────────────
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLocError('Your browser does not support Geolocation.');
      return;
    }
    setLocating(true);
    setLocError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMarkerPos([lat, lng]);
        onChange({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, latitude: lat, longitude: lng });
        setAddressText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        if (mapRef.current) mapRef.current.flyTo([lat, lng], 16);

        const addr = await reverseGeocode(lat, lng);
        setAddressText(addr);
        onChange({ address: addr, latitude: lat, longitude: lng });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocError('Location access was denied. Please allow it in your browser settings or click the map instead.');
        } else {
          setLocError('Unable to retrieve your location. Please click the map instead.');
        }
      },
      { timeout: 10000 }
    );
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
      <p style={{ fontSize: '0.76rem', color: 'var(--cf-text-muted)', marginBottom: '0.5rem', marginTop: 0 }}>
        <i className="bi bi-info-circle me-1" />
        Click anywhere on the map to drop a pin, or type an address above.
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
        </p>
      )}
    </div>
  );
}
