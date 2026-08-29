import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// ── Bootstrap CSS + Icons (must come before local styles) ────────────────────
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

// ── Leaflet CSS (must come before local styles) ───────────────────────────────
import 'leaflet/dist/leaflet.css';

// ── Leaflet default-icon fix for Vite bundler ─────────────────────────────────
import './utils/leafletIconFix.js';

// ── CivicFix global design system (overrides & custom tokens) ────────────────
import './index.css';


import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
