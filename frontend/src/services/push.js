// Frontend хелперы для PWA push-подписки.
// Использует Service Worker (/sw.js) и PushManager API.
//
// Поток: pushSupported() -> requestAndSubscribe() -> backend POST /api/push/subscribe
// Хранит в localStorage флаг подписки для UX (показать toggle).

import { apiFetch } from './api';

const LS_KEY = 'avandata.push.subscribed';

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isSubscribedLocally() {
  try { return localStorage.getItem(LS_KEY) === '1'; }
  catch { return false; }
}

export async function getRegistration() {
  if (!pushSupported()) return null;
  // Регистрируем sw.js (idempotent)
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Запрашивает разрешение и подписывает на push.
// Возвращает PushSubscription JSON или null если пользователь отказал.
export async function requestAndSubscribe() {
  if (!pushSupported()) throw new Error('Push не поддерживается этим браузером');

  const reg = await getRegistration();
  if (!reg) throw new Error('Не удалось зарегистрировать service worker');

  // Запрашиваем VAPID public key
  let publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    try {
      const resp = await apiFetch('/api/push/public-key');
      publicKey = resp.publicKey;
    } catch (e) {
      throw new Error('Push не настроен на сервере: ' + e.message);
    }
  }
  if (!publicKey) throw new Error('VAPID public key не получен');

  // Спрашиваем permission
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    throw new Error('Пользователь не разрешил уведомления');
  }

  // Если уже подписаны — возвращаем существующую
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  // Шлём на backend
  await apiFetch('/api/push/subscribe', {
    method: 'POST',
    body: subscription.toJSON(),
  });

  try { localStorage.setItem(LS_KEY, '1'); } catch {}
  return subscription.toJSON();
}

export async function unsubscribe() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try { localStorage.removeItem(LS_KEY); } catch {}
    return true;
  }
  try {
    await apiFetch('/api/push/unsubscribe', {
      method: 'POST',
      body: { endpoint: sub.endpoint },
    });
  } catch (_) {}
  await sub.unsubscribe();
  try { localStorage.removeItem(LS_KEY); } catch {}
  return true;
}

export async function checkExistingSubscription() {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return null;
    const sub = await reg.pushManager.getSubscription();
    return sub ? sub.toJSON() : null;
  } catch { return null; }
}
