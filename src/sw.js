/**
 * src/sw.js — CivicFix custom service worker
 *
 * Built by vite-plugin-pwa's injectManifest strategy.  Vite processes this
 * file through its pipeline and replaces self.__WB_MANIFEST with the actual
 * precache manifest at build time.
 *
 * Responsibilities:
 *   1. Precache + serve the app shell (SPA routing via navigateFallback)
 *   2. Handle incoming Web Push events → show OS-level notification
 *   3. Handle notificationclick → focus or open the admin emergency page
 *
 * IMPORTANT: do NOT import any React / app modules here.  This file runs in
 * the service worker global scope (ServiceWorkerGlobalScope), not in the
 * browser window.  Only Workbox helpers and raw SW APIs are available.
 */

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute }            from 'workbox-routing';

// ── 1. Precache the app shell ─────────────────────────────────────────────────
//
// self.__WB_MANIFEST is replaced at build time by vite-plugin-pwa with an
// array of { url, revision } objects for every file matched by globPatterns.
// precacheAndRoute handles cache versioning and stale-while-revalidate for
// the shell automatically.
precacheAndRoute(self.__WB_MANIFEST);

// ── SPA navigation fallback ───────────────────────────────────────────────────
// Any navigation request that does not match a precached asset (e.g. a deep
// link to /admin/emergency-reports) is served the cached index.html so React
// Router can handle client-side routing.
const navigationHandler = createHandlerBoundToURL('/index.html');
const navigationRoute   = new NavigationRoute(navigationHandler, {
  // Never intercept API calls — those must always reach the network.
  denylist: [/^\/api\//],
});
registerRoute(navigationRoute);

// ── 2. Push event → show OS notification ─────────────────────────────────────
//
// Fired when the server calls webpush.sendNotification() for this subscription.
// The payload is a JSON string: { title, body, url } — see utils/webPush.js.
//
// event.waitUntil() keeps the SW alive until showNotification() resolves,
// guaranteeing the notification appears even if the page is closed.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Non-JSON payload — use defaults below
  }

  const title   = data.title || '🚨 CivicFix Alert';
  const options = {
    body:               data.body  || 'A new emergency report has been submitted.',
    icon:               '/icons/pwa-192x192.png',
    badge:              '/icons/pwa-192x192.png',
    // tag collapses rapid duplicate alerts into a single notification entry.
    // renotify:true ensures the device still rings/vibrates on each update.
    tag:                'civicfix-emergency',
    renotify:           true,
    // requireInteraction keeps the notification visible until the admin
    // explicitly dismisses or clicks it (effective on desktop Chrome/Edge).
    requireInteraction: true,
    data: {
      url: data.url || '/admin/emergency-reports',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── 3. notificationclick → focus or open the target page ─────────────────────
//
// When the admin clicks the notification:
//   a. Close it immediately (prevents OS-level duplicate artefacts)
//   b. If a CivicFix tab is already open, bring it to the front and navigate.
//   c. Otherwise, open a new tab at the report's direct URL.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/admin/emergency-reports';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Prefer an existing tab at the same origin
        for (const client of clientList) {
          try {
            if (new URL(client.url).origin === self.location.origin) {
              return client.focus().then((c) => {
                // navigate() is available on WindowClient in modern browsers
                if (c && c.navigate) return c.navigate(targetUrl);
              });
            }
          } catch {
            // Ignore malformed URLs
          }
        }
        // No existing tab — open a new window
        return self.clients.openWindow(targetUrl);
      })
  );
});
