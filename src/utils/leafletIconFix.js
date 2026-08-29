/**
 * leafletIconFix.js
 *
 * Leaflet's default marker icons reference image files using relative paths
 * that break when bundled by Vite (or any modern bundler) because the asset
 * URLs are baked into the CSS rather than resolved at build time.
 *
 * Fix: import the PNGs explicitly so Vite fingerprints them, then tell
 * Leaflet to use those resolved URLs via L.Icon.Default.mergeOptions().
 *
 * Import this file exactly ONCE, in main.jsx, after importing leaflet/dist/leaflet.css.
 */
import L from 'leaflet';

import markerIcon2x   from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon     from 'leaflet/dist/images/marker-icon.png';
import markerShadow   from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl:       markerIcon,
  shadowUrl:     markerShadow,
});
