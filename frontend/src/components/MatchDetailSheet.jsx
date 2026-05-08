// Bottom-sheet с деталями матча для родителя.
// Открывается по клику на карточку матча. Главная фича — кнопка маршрута в Я.Картах.

import { useEffect } from 'react';
import './MatchDetailSheet.css';

function shortName(name) {
  if (!name) return '—';
  return String(name).replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '').trim();
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    weekday: 'short', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
}

// Точка по координатам или fallback на текстовый search
function buildYandexMapsUrl(venue, coords) {
  if (coords && coords.lat && coords.lng) {
    // С маршрутом — rtext=~lat,lng означает «отсюда» (~) до этой точки
    return `https://yandex.ru/maps/?rtext=~${coords.lat}%2C${coords.lng}&rtt=auto`;
  }
  if (venue) {
    return `https://yandex.ru/maps/?text=${encodeURIComponent(venue)}`;
  }
  return null;
}

export default function MatchDetailSheet({ match, venue, age, onClose, theme = 'default' }) {
  // Esc для закрытия
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!match) return null;

  const past = match.isPast;
  const tournamentLabel = match.tournament === 'cup' ? 'Кубок' : 'Лига';
  const yaUrl = buildYandexMapsUrl(match.venue, venue);

  // Single-event ICS для скачивания (только если есть matchId и age)
  const apiBase = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const icsUrl = (match.matchId && age)
    ? apiBase.replace(/\/+$/, '') + '/api/public/match/' + age + '/' + match.matchId + '.ics'
    : null;

  return (
    <div className={`mds-backdrop mds-theme--${theme}`} onClick={onClose}>
      <div className="mds-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="mds-close" onClick={onClose} aria-label="Закрыть">✕</button>

        <div className="mds-header">
          <span className={`mds-badge mds-badge--${match.tournament || 'league'}`}>
            🏆 {tournamentLabel}
          </span>
          <div className="mds-date">{fmtDate(match.date)}</div>
        </div>

        <div className="mds-teams">
          <div className="mds-team mds-team--home">
            {match.homeShield && <img src={match.homeShield} alt="" />}
            <span>{shortName(match.home)}</span>
          </div>
          <div className="mds-vs">
            {past && match.score
              ? <span><b>{match.score.home}</b> : <b>{match.score.away}</b></span>
              : <span className="mds-vs-text">vs</span>}
          </div>
          <div className="mds-team mds-team--away">
            {match.awayShield && <img src={match.awayShield} alt="" />}
            <span>{shortName(match.away)}</span>
          </div>
        </div>

        {/* События матча из FFSPB API (голы, карточки, замены) — ниже шапки матча */}
        {past && Array.isArray(match.events) && match.events.length > 0 && (
          <div className="mds-events">
            <div className="mds-events__title">⚽ События</div>
            {match.events.map((e, i) => (
              <div key={i} className={`mds-event mds-event--${e.kind} mds-event--${e.team}`}>
                <span className="mds-event__minute">{e.minute ? e.minute + "'" : '—'}</span>
                <span className="mds-event__icon">{e.icon}</span>
                <span className="mds-event__player">
                  {e.playerName}
                  {e.assistName && <span className="mds-event__assist"> · ассист: {e.assistName}</span>}
                  {e.comment && <span className="mds-event__comment"> — {e.comment}</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {match.venue && (
          <div className="mds-venue">
            <div className="mds-venue-icon">📍</div>
            <div className="mds-venue-text">
              <div className="mds-venue-name">{match.venue}</div>
              {venue && venue.fullName && venue.fullName !== match.venue && (
                <div className="mds-venue-sub">{venue.fullName}</div>
              )}
            </div>
          </div>
        )}

        {/* Маршрут в Я.Картах только для будущих матчей — на сыгранные ехать незачем */}
        {yaUrl && !past && (
          <a
            className="mds-cta"
            href={yaUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="mds-cta-icon">🗺</span>
            <span>Маршрут в Я.Картах</span>
          </a>
        )}

        {icsUrl && !past && (
          <a
            className="mds-cta-secondary"
            href={icsUrl}
            // Без download-атрибута: на iOS Safari это позволяет браузеру
            // распознать text/calendar и открыть превью с кнопкой
            // «Add to Calendar». На Android Chrome всё равно скачает файл.
          >
            <span>📅</span>
            <span>В мой календарь</span>
          </a>
        )}

        {!match.venue && (
          <div className="mds-no-venue">
            Адрес стадиона пока не указан. Уточните у тренера в чате команды.
          </div>
        )}

        <div className="mds-footer">
          {past
            ? 'Матч уже сыгран. Тренер выложит разбор после анализа.'
            : 'Сбор обычно за 30 минут до начала. Уточните точное время у тренера.'}
        </div>
      </div>
    </div>
  );
}
