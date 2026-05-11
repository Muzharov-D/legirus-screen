// Bottom-sheet с деталями матча для родителя.
// Открывается по клику на карточку матча. Главная фича — кнопка маршрута в Я.Картах.

import { useEffect } from 'react';
import useModalBack from '../utils/useModalBack';
import { shieldFor } from '../utils/legirus';
import UiIcon from './UiIcon';
import './MatchDetailSheet.css';

function shortName(name) {
  if (!name) return '—';
  const cleaned = String(name)
    .replace(/^(ГБОУ|ГБУ|МБОУ|МАОУ|ГКУ|МКУ|ГКОУ)\s+(ДО\s+|ДОД\s+|ДОУ\s+)?/i, '')
    .replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '')
    .replace(/\bрайона\b/gi, 'р-на')
    .replace(/\bрайон\b/gi, 'р-н')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(' ').slice(0, 3).join(' ');
}

// shieldFor() и isLegirus() — из utils/legirus (single source of truth)

// Маппинг типа события матча → имя UI-иконки в /icons/ui/
const EVENT_KIND_TO_ICON = {
  goal: 'ball',
  goal_special: 'ball',
  penalty: 'ball',
  penalty_missed: 'ball', // мяч + CSS-перечёркивание поверх (см. .mds-tl-icon-wrap--strike)
  own_goal: 'ball',
  yellow_card: 'yellow-card',
  yellow: 'yellow-card',
  red_card: 'red-card',
  red: 'red-card',
  substitution: 'running',
  substitution_in: 'running',
  substitution_out: 'running',
  sub: 'running',
};

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

export default function MatchDetailSheet({ match, venue, age, onClose, theme = 'default', extra = null }) {
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
  // Android back / swipe-back — закрывает модалку
  useModalBack(onClose, !!match);

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
          <div className="mds-header-left">
            <span className={`mds-badge mds-badge--${match.tournament || 'league'}`}>
              <UiIcon name={match.tournament === 'cup' ? 'trophy' : 'ball'} size={12} /> {tournamentLabel}
            </span>
            {match.round && (
              <span className="mds-round">{match.round}</span>
            )}
          </div>
          <div className="mds-date">
            {match.date ? fmtDate(match.date) : <span className="mds-no-date">Дата уточняется</span>}
          </div>
        </div>

        <div className="mds-teams">
          <div className="mds-team mds-team--home">
            <img
              src={shieldFor(match.home, match.homeShield)}
              alt=""
              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
            />
            <span>{shortName(match.home)}</span>
          </div>
          <div className="mds-vs">
            {past && match.score
              ? <span><b>{match.score.home}</b> : <b>{match.score.away}</b></span>
              : <span className="mds-vs-text">vs</span>}
          </div>
          <div className="mds-team mds-team--away">
            <img
              src={shieldFor(match.away, match.awayShield)}
              alt=""
              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
            />
            <span>{shortName(match.away)}</span>
          </div>
        </div>

        {/* События матча в виде 2 колонок: home слева, away справа, минута по центру */}
        {past && Array.isArray(match.events) && match.events.length > 0 && (
          <div className="mds-events">
            <div className="mds-events__title"><UiIcon name="ball" size={12} /> Ход матча</div>
            <div className="mds-tl-list">
              {[...match.events]
                .sort((a, b) => (a.minute || 0) - (b.minute || 0))
                .map((e, i) => {
                  const side = (e.team === 'away' || e.team === 'guest') ? 'away' : 'home';
                  return (
                    <div key={i} className={`mds-tl-row mds-tl-row--${e.kind} mds-tl-row--${side}`}>
                      <div className="mds-tl-side mds-tl-side--home">
                        {side === 'home' && (
                          <span className="mds-tl-event">
                            <span className="mds-tl-text">
                              <b>{e.playerName || ''}</b>
                              {e.kind === 'penalty_missed' && <small className="mds-tl-label-missed"> — Незабитый пенальти</small>}
                              {e.assistName && <small> · ассист: {e.assistName}</small>}
                              {e.comment && <small> — {e.comment}</small>}
                            </span>
                            {EVENT_KIND_TO_ICON[e.kind] ? (
                              <span className={`mds-tl-icon-wrap${e.kind === 'penalty_missed' ? ' mds-tl-icon-wrap--strike' : ''}`}>
                                <UiIcon name={EVENT_KIND_TO_ICON[e.kind]} size={16} className="mds-tl-icon" />
                              </span>
                            ) : (
                              <span className="mds-tl-icon mds-tl-icon--emoji" aria-hidden>{e.icon || '·'}</span>
                            )}
                          </span>
                        )}
                      </div>
                      <div className="mds-tl-minute">{e.minute ? e.minute + "'" : '—'}</div>
                      <div className="mds-tl-side mds-tl-side--away">
                        {side === 'away' && (
                          <span className="mds-tl-event">
                            {EVENT_KIND_TO_ICON[e.kind] ? (
                              <span className={`mds-tl-icon-wrap${e.kind === 'penalty_missed' ? ' mds-tl-icon-wrap--strike' : ''}`}>
                                <UiIcon name={EVENT_KIND_TO_ICON[e.kind]} size={16} className="mds-tl-icon" />
                              </span>
                            ) : (
                              <span className="mds-tl-icon mds-tl-icon--emoji" aria-hidden>{e.icon || '·'}</span>
                            )}
                            <span className="mds-tl-text">
                              <b>{e.playerName || ''}</b>
                              {e.kind === 'penalty_missed' && <small className="mds-tl-label-missed"> — Незабитый пенальти</small>}
                              {e.assistName && <small> · ассист: {e.assistName}</small>}
                              {e.comment && <small> — {e.comment}</small>}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
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

        {yaUrl && !past && (
          <a
            className="mds-cta"
            href={yaUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <UiIcon name="map" size={20} className="mds-cta-icon" />
            <span>Маршрут в Яндекс.Картах</span>
          </a>
        )}

        {icsUrl && !past && (
          <a className="mds-cta-secondary" href={icsUrl}>
            <UiIcon name="calendar" size={18} />
            <span>В мой календарь</span>
          </a>
        )}

        {!match.venue && (
          <div className="mds-no-venue">
            Адрес стадиона пока не указан. Уточните у тренера в чате команды.
          </div>
        )}

        {extra}

        <div className="mds-footer">
          {past
            ? 'Матч уже сыгран. Тренер выложит разбор после анализа.'
            : 'Сбор обычно за 30 минут до начала. Уточните точное время у тренера.'}
        </div>
      </div>
    </div>
  );
}
