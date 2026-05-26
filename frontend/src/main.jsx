// ВАЖНО: Sentry init должен быть ПЕРЕД импортом App, чтобы успеть
// проинструментировать React-fiber и поймать ошибки на старте.
import './sentry.js';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import './styles/mobile.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// SELF-HEAL для застрявших PWA. Должно совпадать с CACHE_VERSION в /sw.js.
// При деплое новой версии обновлять BOTH: эта константа + sw.js CACHE_VERSION.
// Если несовпадает (или SW не отвечает на ping — значит pre-self-heal версия) —
// JS принудительно делает unregister + reload, чтобы получить свежий код.
// Анти-петля: не чаще 1 раза в 10 минут.
const EXPECTED_SW_VERSION = 'v12-2026-05-26-fix-foreign-stats';

function askSWVersion() {
  return new Promise((resolve) => {
    if (!navigator.serviceWorker?.controller) return resolve(null);
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 2000);
    ch.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data?.version || null);
    };
    try {
      navigator.serviceWorker.controller.postMessage({ type: 'get-version' }, [ch.port2]);
    } catch (_) {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function selfHealIfStale() {
  if (!navigator.serviceWorker?.controller) return; // нет SW — нечего лечить
  const LAST_HEAL_KEY = 'avandata.sw.last-heal';
  const now = Date.now();
  const last = Number(localStorage.getItem(LAST_HEAL_KEY) || 0);
  if (now - last < 10 * 60 * 1000) return; // anti-loop: не чаще 1р/10мин

  const swVersion = await askSWVersion();
  if (swVersion === EXPECTED_SW_VERSION) return; // всё ок

  console.log('[sw] self-heal: expected', EXPECTED_SW_VERSION, 'got', swVersion || 'no-response');
  localStorage.setItem(LAST_HEAL_KEY, String(now));
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.unregister();
  } catch (_) {}
  window.location.reload();
}

// Регистрируем service worker для PWA: push + offline-first cache.
// SW логика — см. /public/sw.js.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // updateViaCache: 'none' — браузер НИКОГДА не использует HTTP-кеш для проверки
    // обновлений sw.js. Это критично для iOS PWA, где SW может «застревать» на
    // старой версии месяцами из-за агрессивного кеширования.
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        // Проверяем обновления при каждой загрузке страницы (cheap)
        try { reg.update(); } catch (_) {}
        // Дополнительно — каждый раз когда вкладка снова видима (returned to PWA).
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            try { reg.update(); } catch (_) {}
          }
        });
        // Если нашёлся новый installing SW — слушаем его статус
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // controller существует — значит мы переходим со старой версии на новую
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              // Новая версия готова. Просим SW активироваться немедленно.
              installing.postMessage({ type: 'skip-waiting' });
            }
          });
        });
      })
      .catch((err) => console.warn('[sw] регистрация не удалась:', err));

    // Слушаем messages от SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === 'push') {
        showInPageNotification(data);
      } else if (data.type === 'sw-updated') {
        // SW активировался — показываем кратко тост и автоматически перезагружаем
        // через 2 секунды (даём пользователю заметить, что обновление произошло).
        showUpdateToast({ autoReloadInMs: 2000 });
      }
    });

    // Когда SW сменил controller (новая версия активирована, .claim() прошёл) —
    // АВТО-перезагрузка ровно один раз. Это страховка на случай, если
    // 'sw-updated' postMessage не дошёл до listener'а из-за race condition.
    let reloadedByController = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedByController) return;
      reloadedByController = true;
      // Небольшая задержка, чтобы тост успел отрисоваться, если он есть.
      setTimeout(() => window.location.reload(), 300);
    });

    // Self-heal: через 3 сек после загрузки проверяем что SW текущей версии.
    // Если нет — выкидываем его и перезагружаем страницу.
    // Это спасает от ситуации «застрявший SW не обновляется» — даёт пользователю
    // авто-восстановление без ручного «закрой/открой PWA».
    setTimeout(selfHealIfStale, 3000);
  });
}

function showInPageNotification({ title, body, url }) {
  let host = document.getElementById('avandata-push-banner');
  if (!host) {
    host = document.createElement('div');
    host.id = 'avandata-push-banner';
    host.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none';
    document.body.appendChild(host);
  }
  const card = document.createElement('div');
  card.style.cssText = 'background:#0d1424;border:1px solid #22d3ee;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#f1f5fb;padding:14px 16px;min-width:280px;max-width:380px;font-family:system-ui,sans-serif;pointer-events:auto;cursor:pointer;animation:avandata-slide-in 220ms ease-out';
  card.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:20px">🔔</span><div style="font-weight:700;font-size:14px;color:#22d3ee">' +
    String(title || '').replace(/[<>]/g, '') + '</div></div>' +
    '<div style="font-size:13px;line-height:1.4;color:#d6e2ff">' + String(body || '').replace(/[<>]/g, '') + '</div>';
  if (!document.getElementById('avandata-push-anim')) {
    const style = document.createElement('style');
    style.id = 'avandata-push-anim';
    style.textContent = '@keyframes avandata-slide-in{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}';
    document.head.appendChild(style);
  }
  card.onclick = () => {
    if (url) window.location.href = url;
    card.remove();
  };
  host.appendChild(card);
  setTimeout(() => { card.style.transition = 'opacity 300ms'; card.style.opacity = '0'; setTimeout(() => card.remove(), 300); }, 8000);
}

// Toast при активации новой версии SW. Опционально — auto-reload через autoReloadInMs.
function showUpdateToast({ autoReloadInMs = 0 } = {}) {
  if (document.getElementById('avandata-update-toast')) return;
  const card = document.createElement('div');
  card.id = 'avandata-update-toast';
  card.style.cssText = [
    'position:fixed', 'bottom:20px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:99999', 'background:#0d1424', 'border:1px solid #dc2626',
    'border-radius:12px', 'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
    'color:#f1f5fb', 'padding:12px 18px', 'font-family:system-ui,sans-serif',
    'font-size:14px', 'cursor:pointer', 'display:flex',
    'align-items:center', 'gap:10px'
  ].join(';');
  const action = autoReloadInMs > 0 ? 'обновляю…' : 'Обновить';
  card.innerHTML = '<span>🔄 Новая версия установлена. <b style="color:#fca5a5">' + action + '</b></span>';
  card.onclick = () => window.location.reload();
  document.body.appendChild(card);
  if (autoReloadInMs > 0) {
    setTimeout(() => window.location.reload(), autoReloadInMs);
  }
}
