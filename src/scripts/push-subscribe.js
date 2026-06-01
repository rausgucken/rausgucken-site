/**
 * push-subscribe.js
 * Handles FCM permission flow, token registration, and saved-slug sync.
 * Imported by meine-events/index.astro.
 *
 * Flow:
 *   1. User taps "Aktivieren"
 *   2. Notification.requestPermission()
 *   3. getFCMToken(VAPID_KEY) → FCM device token
 *   4. Generate/load rg-uuid from localStorage
 *   5. POST /subscribe to Shipyard push backend
 *   6. On every subsequent save/unsave → postUpdateSaved()
 */

import { getFCMToken, onForegroundMessage } from './firebase.js';

// VAPID public key — safe to expose in client code
const VAPID_KEY = 'BCKx6ykyg8WDBqoINDCB5decyLG2RN1mt7zCeImyxvvHdk2VEkWKZn5ZBokAi7e7jM28Oj1V5OTF6IMK-Xe_eR8';

// Push backend — same host if proxied, or direct Shipyard URL for Capacitor
// For web: use Cloudflare Tunnel URL (set below after tunnel is configured)
// For Capacitor Android: set PUSH_API_URL in capacitor.config.json server.androidScheme or env
const PUSH_API_URL  = 'https://push.rausgucken.de';
const PUSH_SECRET   = '';  // Populated at build time via env injection — see note below

// NOTE on PUSH_SECRET:
// The API secret guards write endpoints from random callers.
// For web PWA: the secret is not needed if PUSH_API_URL is behind Cloudflare (rate-limited).
// For now, ship without secret in client — the backend accepts empty secret in dev mode.
// When ready to harden: inject via Astro env vars (import.meta.env.PUBLIC_PUSH_SECRET).

function getOrCreateUUID() {
  let uuid = localStorage.getItem('rg-uuid');
  if (!uuid) {
    uuid = crypto.randomUUID();
    localStorage.setItem('rg-uuid', uuid);
  }
  return uuid;
}

function getSavedSlugs() {
  try {
    const saved = JSON.parse(localStorage.getItem('rg-saved-events') || '[]');
    return saved.map(e => e.slug).filter(Boolean);
  } catch {
    return [];
  }
}

async function postJSON(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (PUSH_SECRET) headers['X-Push-Secret'] = PUSH_SECRET;
  const res = await fetch(PUSH_API_URL + path, {
    method: path === '/unsubscribe' ? 'DELETE' : 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Push API ${path} → ${res.status}`);
  return res.json();
}

/**
 * Full push subscription flow.
 * Call on "Aktivieren" button click.
 * Returns { success: true } or throws.
 */
export async function subscribePush() {
  if (!('Notification' in window)) throw new Error('Notifications not supported');
  if (!('serviceWorker' in navigator)) throw new Error('Service worker not supported');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permission denied');

  // Ensure SW is registered before getting token
  await navigator.serviceWorker.ready;

  const fcmToken = await getFCMToken(VAPID_KEY);
  if (!fcmToken) throw new Error('Could not get FCM token');

  const uuid       = getOrCreateUUID();
  const savedSlugs = getSavedSlugs();

  await postJSON('/subscribe', { uuid, fcm_token: fcmToken, saved_slugs: savedSlugs });

  // Store subscription state
  localStorage.setItem('rg-push-enabled', '1');
  localStorage.setItem('rg-fcm-token', fcmToken);

  // Handle foreground messages (app open)
  onForegroundMessage(payload => {
    const { title, body } = payload.notification || {};
    const link = payload.fcmOptions?.link || '/meine-events/';
    // Show browser notification even when app is open
    if (Notification.permission === 'granted') {
      new Notification(title || 'rausgucken.de', { body, icon: '/android-chrome-192x192.png', data: { url: link } });
    }
  });

  return { success: true };
}

/**
 * Sync saved slugs to backend after every save/unsave.
 * Silent — no UI feedback needed.
 */
export async function postUpdateSaved() {
  if (localStorage.getItem('rg-push-enabled') !== '1') return;
  const uuid       = localStorage.getItem('rg-uuid');
  const savedSlugs = getSavedSlugs();
  if (!uuid) return;
  try {
    await postJSON('/update-saved', { uuid, saved_slugs: savedSlugs });
  } catch (e) {
    console.warn('[push] update-saved failed:', e.message);
  }
}

/**
 * Unsubscribe from push. Call on explicit opt-out.
 */
export async function unsubscribePush() {
  const uuid = localStorage.getItem('rg-uuid');
  if (!uuid) return;
  try {
    await postJSON('/unsubscribe', { uuid });
  } catch (e) {
    console.warn('[push] unsubscribe failed:', e.message);
  }
  localStorage.removeItem('rg-push-enabled');
  localStorage.removeItem('rg-fcm-token');
}
