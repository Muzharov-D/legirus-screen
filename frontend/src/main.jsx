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

// Регистрируем service worker для PWA: push + offline-first cache.
// SW логика — см. /public/sw.js.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Проверяем обновления при каждой загрузке страницы (cheap)
        try { reg.update(); } catch (_) {}
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
        // SW обновился — мягкий тост с предложением перезагрузить.
        // Не делаем авто-reload: можно уронить состояние формы пользователя.
        showUpdateToast();
      }
    });

    // Когда SW сменил controller (новая версия активирована) — НЕ перезагружаем
    // автоматически, ждём подтверждения пользователя через toast выше.
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

// Toast при обнаружении новой версии SW. Кликом перезагружаем — пользователь решает когда.
function showUpdateToast() {
  if (document.getElementById('avandata-update-toast')) return;
  const card = document.createElement('div');
  card.id = 'avandata-update-toast';
  card.style.cssText = [
    'position:fixed', 'bottom:20px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:99999', 'background:#0d1424', 'border:1px solid #ef4444',
    'border-radius:12px', 'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
    'color:#f1f5fb', 'padding:12px 18px', 'font-family:system-ui,sans-serif',
    'font-size:14px', 'cursor:pointer', 'display:flex',
    'align-items:center', 'gap:10px'
  ].join(';');
  card.innerHTML = '<span>🔄 Доступна новая версия. <b style="color:#fca5a5">Обновить</b></span>';
  card.onclick = () => window.location.reload();
  document.body.appendChild(card);
}
