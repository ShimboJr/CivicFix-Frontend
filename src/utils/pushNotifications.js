/**
 * utils/pushNotifications.js
 *
 * Exports a single function: subscribeToPush()
 *
 * Call this when an admin clicks "Enable Urgent Alerts".  It walks through
 * the full subscription handshake:
 *
 *   1. Check that the browser supports push (PushManager in window).
 *   2. Request (or confirm) notification permission from the user.
 *   3. Wait for the service worker that vite-plugin-pwa already registered —
 *      do NOT call navigator.serviceWorker.register() again here.
 *   4. Fetch the VAPID public key from the backend (avoids hardcoding it).
 *   5. Subscribe via pushManager.subscribe() with that key.
 *   6. POST the resulting PushSubscription to /api/push/subscribe.
 *
 * Returns { ok: true } on success, throws on any failure with a human-
 * readable message the UI can display.
 */

const API_BASE =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ── urlBase64ToUint8Array ─────────────────────────────────────────────────────
// Converts the URL-safe base64 VAPID public key string (as delivered by the
// backend) into the Uint8Array that pushManager.subscribe() requires as
// applicationServerKey.  This is the standard conversion function used in
// every Web Push guide.
function urlBase64ToUint8Array(base64String) {
  const padding  = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData  = atob(base64);
  const output   = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

/**
 * subscribeToPush()
 *
 * Full subscription flow — call on admin button click.
 *
 * @param {string} authToken  The logged-in user's JWT (from AuthContext).
 * @returns {Promise<{ ok: true }>}
 * @throws {Error}  On permission denial, missing browser support, or API error.
 */
export async function subscribeToPush(authToken) {
  // ── Step 0: capability guard ──────────────────────────────────────────────
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Web Push is not supported in this browser.');
  }

  // ── Step 1: request notification permission ───────────────────────────────
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      'Notification permission was denied. ' +
      'Please allow notifications for this site in your browser settings.'
    );
  }

  // ── Step 2: get the service worker registration ───────────────────────────
  // vite-plugin-pwa already registers the SW — we just wait for it to be
  // active rather than registering a second one.
  const registration = await navigator.serviceWorker.ready;

  // ── Step 3: fetch the VAPID public key from the backend ───────────────────
  const keyRes = await fetch(`${API_BASE}/push/vapid-public-key`);
  if (!keyRes.ok) {
    throw new Error('Could not fetch push configuration from server.');
  }
  const { publicKey } = await keyRes.json();

  // ── Step 4: subscribe via the Push API ────────────────────────────────────
  // If the browser already has a subscription for this SW + VAPID key, it
  // returns the existing one — subscribeIfNotExisting-semantics are built in.
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly:      true,       // required — must always show a notification
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  // ── Step 5: send the subscription to the backend ─────────────────────────
  // The server stores it in the user's pushSubscriptions array (deduplicated).
  const subJson = subscription.toJSON();
  const saveRes = await fetch(`${API_BASE}/push/subscribe`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      keys:     subJson.keys,   // { p256dh, auth }
    }),
  });

  if (!saveRes.ok) {
    const err = await saveRes.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to save push subscription on server.');
  }

  return { ok: true };
}
