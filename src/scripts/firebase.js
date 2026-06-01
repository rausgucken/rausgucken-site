import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// Firebase client config — these are public/safe to commit (security via Firebase Rules)
const firebaseConfig = {
  apiKey:            import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain:        import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);

// Messaging only available in browser context (not SSR, not SW)
// Lazy-initialised — call getFCMToken() when push permission is granted
let _messaging = null;
function getMessagingInstance() {
  if (!_messaging && typeof window !== "undefined") {
    _messaging = getMessaging(firebaseApp);
  }
  return _messaging;
}

/**
 * Request FCM token for this device.
 * Call after Notification.requestPermission() === 'granted'.
 * VAPID key from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
 *
 * Phase 1: store anonymously with UUID
 * Phase 2 (accounts): call again after login, attach user_id to existing token row
 */
export async function getFCMToken(vapidKey) {
  const messaging = getMessagingInstance();
  if (!messaging) throw new Error("Messaging not available");
  return await getToken(messaging, { vapidKey });
}

/**
 * Handle foreground push messages (app is open).
 * Background messages handled by firebase-messaging-sw.js
 */
export function onForegroundMessage(callback) {
  const messaging = getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
