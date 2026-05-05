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

// Регистрируем service worker для PWA push (idempotent).
// SW сам обрабатывает push/notificationclick — см. /public/sw.js.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .catch((err) => console.warn('[sw] регистрация не удалась:', err));

    // Слушаем messages от SW — показываем in-page баннер на случай если
    // Windows подавил системное уведомление (Focus Assist / Quiet Hours).
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, title, body, url } = event.data || {};
      if (type !== 'push') return;
      showInPageNotification({ title, body, url });
    });
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
