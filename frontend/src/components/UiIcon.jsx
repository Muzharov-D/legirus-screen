// Универсальный <UiIcon name="..." /> для UI-иконок из /public/icons/ui/.
// Используется вместо эмодзи в текстовых местах: 📍🏃⚽📅🔗🥇 etc.
// Часть файлов лежит с пробелом/заглавной — маппим напрямую.

import './UiIcon.css';

const ICON_MAP = {
  pin:               '/icons/ui/pin.svg',
  close:             '/icons/ui/close.svg',
  check:             '/icons/ui/check.svg',
  running:           '/icons/ui/running.svg',
  trophy:            '/icons/ui/trophy.svg',
  ball:              '/icons/ui/ball.svg',
  calendar:          '/icons/ui/Calender.svg',     // оригинал с опечаткой
  share:             '/icons/ui/Share.svg',
  'phone-share':     '/icons/ui/Phone.svg',
  list:              '/icons/ui/List.svg',
  map:               '/icons/ui/map.svg',
  bell:              '/icons/ui/bell.svg',
  'bell-off':        '/icons/ui/bell-off.svg',
  android:           '/icons/ui/android.svg',
  mobile:            '/icons/ui/mobile.svg',
  'training-extra':    '/icons/ui/training-extra.svg',
  'training-warmup':   '/icons/ui/training-warmup.svg',
  'training-recovery': '/icons/ui/training-recovery.svg',
  'training-meet':     '/icons/ui/training-meet.svg',
  'yellow-card':     '/icons/ui/Y%20card.svg',     // пробел в имени → URL-encoded
  'red-card':        '/icons/ui/R%20card.svg',
};

export default function UiIcon({ name, size = 16, alt = '', className = '' }) {
  const src = ICON_MAP[name];
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={`ui-icon ${className}`.trim()}
      width={size}
      height={size}
      aria-hidden={alt ? undefined : 'true'}
    />
  );
}
