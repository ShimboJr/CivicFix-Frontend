/**
 * NearbyHelpPanel.jsx
 *
 * Supplementary, visually subordinate panel showing 2–3 nearby emergency
 * facilities (police stations, hospitals) using the Nominatim places API.
 *
 * Design contract:
 *   - This panel is SECONDARY. It must never compete visually with
 *     EmergencyCallBanner for attention — smaller text, neutral colours,
 *     no red, no pulsing animation.
 *   - Framing is explicitly "supplementary information, not dispatch."
 *   - Rendered only when coordinates are available; renders nothing when
 *     coords are null (no loading state visible to the user until search fires).
 *
 * Why Nominatim and not Google Places:
 *   No Google Places API key is configured in this project. CivicFix already
 *   uses Nominatim (nominatim.openstreetmap.org) for reverse geocoding in
 *   LocationPicker — this component reuses the same API to avoid adding a
 *   new dependency or requiring a billing account.
 *
 * Props:
 *   lat {number|null}  — WGS-84 latitude of the current report location
 *   lng {number|null}  — WGS-84 longitude of the current report location
 */

import { useEffect, useState, useRef } from 'react';

const NOMINATIM = 'https://nominatim.openstreetmap.org';

// Haversine distance in km between two lat/lng pairs
function haversineKm(lat1, lng1, lat2, lng2) {
  const R   = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

// Search Nominatim for nearby POIs of a given amenity type
async function searchAmenity(lat, lng, amenity, radius = 3000) {
  const url =
    `${NOMINATIM}/search` +
    `?format=json` +
    `&q=${encodeURIComponent(amenity)}` +
    `&viewbox=${lng - 0.05},${lat + 0.05},${lng + 0.05},${lat - 0.05}` +
    `&bounded=1` +
    `&limit=5` +
    `&addressdetails=1`;

  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('Nominatim error');
  const data = await res.json();

  return data
    .map((item) => ({
      id:      item.place_id,
      name:    item.display_name.split(',')[0], // first part is the facility name
      address: item.display_name,
      lat:     parseFloat(item.lat),
      lng:     parseFloat(item.lon),
      dist:    haversineKm(lat, lng, parseFloat(item.lat), parseFloat(item.lon)),
    }))
    .filter((item) => item.dist <= radius / 1000) // enforce radius in km
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3); // cap at 3 results
}

export default function NearbyHelpPanel({ lat, lng }) {
  const [facilities, setFacilities] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const abortRef = useRef(null);

  useEffect(() => {
    // Nothing to do if we have no coordinates
    if (lat == null || lng == null) {
      setFacilities([]);
      return;
    }

    // Cancel any in-flight request from the previous render
    if (abortRef.current) abortRef.current = false;
    const active = { alive: true };
    abortRef.current = active;

    setLoading(true);
    setError('');

    // Search for both police stations and hospitals/clinics in parallel
    Promise.allSettled([
      searchAmenity(lat, lng, 'police station'),
      searchAmenity(lat, lng, 'hospital'),
    ]).then((results) => {
      if (!active.alive) return; // component unmounted or coords changed

      const police   = results[0].status === 'fulfilled' ? results[0].value : [];
      const hospitals= results[1].status === 'fulfilled' ? results[1].value : [];

      // Merge, deduplicate by place_id, sort by distance, cap at 4
      const merged = [...police, ...hospitals]
        .filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 4);

      setFacilities(merged);
    }).catch(() => {
      if (!active.alive) return;
      setError('Could not load nearby facilities.');
    }).finally(() => {
      if (!active.alive) return;
      setLoading(false);
    });

    return () => { active.alive = false; };
  }, [lat, lng]);

  // Don't render the panel at all until we have coordinates
  if (lat == null || lng == null) return null;

  return (
    <div
      style={{
        /* Visually subordinate: neutral border, no red, smaller text */
        border:       '1px solid var(--cf-border-light)',
        borderRadius: 'var(--cf-radius-md)',
        background:   'var(--cf-surface)',
        padding:      '0.9rem 1rem',
        marginBottom: '1rem',
      }}
    >
      {/* Heading — clearly framed as supplementary */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '0.45rem',
        marginBottom: '0.6rem',
      }}>
        <i className="bi bi-geo-alt" style={{ color: 'var(--cf-text-secondary)', fontSize: '0.95rem' }} />
        <span style={{
          fontWeight:  600,
          fontSize:    '0.82rem',
          color:       'var(--cf-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          Nearby facilities
        </span>
        <span style={{
          fontSize:  '0.72rem',
          color:     'var(--cf-text-muted)',
          fontWeight: 400,
          marginLeft: 'auto',
        }}>
          supplementary information — not a dispatch service
        </span>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--cf-text-muted)' }}>
          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{ width: 14, height: 14, borderWidth: 2 }} />
          Searching nearby…
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <p style={{ fontSize: '0.78rem', color: 'var(--cf-text-muted)', margin: 0 }}>
          <i className="bi bi-wifi-off me-1" /> {error}
        </p>
      )}

      {/* Empty state */}
      {!loading && !error && facilities.length === 0 && (
        <p style={{ fontSize: '0.78rem', color: 'var(--cf-text-muted)', margin: 0 }}>
          No facilities found within 3 km. Use maps.google.com to search manually.
        </p>
      )}

      {/* Results */}
      {!loading && facilities.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {facilities.map((place, idx) => {
            const mapsUrl =
              `https://www.google.com/maps/dir/?api=1` +
              `&destination=${place.lat},${place.lng}`;

            return (
              <li
                key={place.id}
                style={{
                  display:    'flex',
                  alignItems: 'flex-start',
                  gap:        '0.6rem',
                  padding:    '0.55rem 0',
                  borderTop:  idx > 0 ? '1px solid var(--cf-border-light)' : 'none',
                }}
              >
                {/* Icon */}
                <i
                  className={`bi ${place.name.toLowerCase().includes('police') ? 'bi-shield' : 'bi-hospital'}`}
                  style={{ fontSize: '0.9rem', color: 'var(--cf-text-secondary)', flexShrink: 0, marginTop: 2 }}
                />

                {/* Name + address + distance */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight:   600,
                    fontSize:     '0.82rem',
                    color:        'var(--cf-text)',
                    whiteSpace:   'nowrap',
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {place.name}
                  </div>
                  <div style={{
                    fontSize:     '0.73rem',
                    color:        'var(--cf-text-muted)',
                    whiteSpace:   'nowrap',
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    marginTop:    '0.1rem',
                  }}>
                    {place.address}
                  </div>
                </div>

                {/* Distance + directions link */}
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--cf-text-muted)', marginBottom: '0.2rem' }}>
                    {formatDistance(place.dist)}
                  </div>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display:        'inline-flex',
                      alignItems:     'center',
                      gap:            '0.25rem',
                      fontSize:       '0.72rem',
                      fontWeight:     600,
                      color:          'var(--cf-primary)',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                  >
                    <i className="bi bi-signpost-2" />
                    Directions
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
