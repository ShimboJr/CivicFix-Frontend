import react       from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA }  from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      // ── Service worker strategy ─────────────────────────────────────────
      // autoUpdate: the SW silently installs updated versions in the
      // background without prompting the user, which is appropriate for a
      // project of this size.  No "new version available, reload?" banner needed.
      registerType: 'autoUpdate',

      // ── What the service worker pre-caches ─────────────────────────────
      // Only the app's own static shell (JS, CSS, HTML, icons).
      //
      // IMPORTANT — API routes are intentionally excluded.
      // CivicFix is a live civic reporting tool. Caching /api/* responses would
      // risk surfacing stale issue lists, outdated statuses, or expired auth
      // tokens — all of which would actively mislead a resident, not just be a
      // minor inconvenience.  Every API call must always hit the network fresh.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Explicitly do NOT add any runtimeCaching entries for /api/* here.
        // The default Workbox behaviour for un-cached URLs is network-only,
        // which is exactly what we want for every API request.
        navigateFallback: 'index.html',
      },

      // ── Web App Manifest ────────────────────────────────────────────────
      manifest: {
        name:             'CivicFix',
        short_name:       'CivicFix',
        description:      'Report and track local civic issues in your community.',
        theme_color:      '#0B4F6C',  // matches --cf-primary in index.css
        background_color: '#0B4F6C',  // splash screen background on mobile
        display:          'standalone',
        start_url:        '/',
        scope:            '/',
        icons: [
          {
            src:   '/icons/pwa-192x192.png',
            sizes: '192x192',
            type:  'image/png',
          },
          {
            src:   '/icons/pwa-512x512.png',
            sizes: '512x512',
            type:  'image/png',
          },
          {
            // Maskable variant uses the same 512×512 PNG.
            // The brand background already fills the full canvas so the safe
            // zone (inner 80%) shows the icon without clipping on Android.
            src:     '/icons/pwa-512x512.png',
            sizes:   '512x512',
            type:    'image/png',
            purpose: 'maskable',
          },
        ],
      },

      // ── Dev mode ─────────────────────────────────────────────────────────
      // Enable the service worker during `vite dev` so you can test PWA
      // behaviour without running a full build every time.
      devOptions: {
        enabled: false, // flip to true locally if you want to test SW in dev
      },
    }),
  ],
});
