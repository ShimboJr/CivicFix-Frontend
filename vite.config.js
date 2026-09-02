import react       from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA }  from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      // ── Service worker strategy ─────────────────────────────────────────
      // Switched from generateSW → injectManifest so we can add custom event
      // listeners (push, notificationclick) to the service worker.
      //
      // injectManifest builds our hand-written src/sw.js through Vite,
      // substitutes self.__WB_MANIFEST with the actual precache manifest, and
      // outputs the final sw.js into the dist root — exactly where browsers
      // expect to find it at the site root.
      //
      // autoUpdate behaviour is preserved: the SW silently installs updated
      // versions in the background via the Workbox precaching logic in sw.js.
      strategies:  'injectManifest',
      srcDir:      'src',
      filename:    'sw.js',
      registerType: 'autoUpdate',

      // ── injectManifest precache glob ────────────────────────────────────
      // Same set as the old workbox.globPatterns — the app shell only.
      // API routes are deliberately excluded (see note below).
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Explicitly do NOT add any runtimeCaching entries for /api/* here.
        // CivicFix is a live civic reporting tool. Caching /api/* responses would
        // risk surfacing stale issue lists, outdated statuses, or expired auth
        // tokens — all of which would actively mislead a resident, not just be a
        // minor inconvenience.  Every API call must always hit the network fresh.
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
