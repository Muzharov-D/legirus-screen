// Вау-карточка прошедшего матча с inline таймлайном (стиль ЛЧ ПСЖ-Бавария).
// Используется только для past matches вместо обычной pub-card.

import './MatchReportCard.css';

function shortName(name) {
  if (!name) return '—';
  return String(name).replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '').trim();
}
function isLegirus(name) {
  return String(name || '').toLowerCase().includes('легирус');
}
function shieldFor(name, fallback) {
  return isLegirus(name) ? '/icons/legirus.png' : fallback;
}

const KIND_META = {
  goal:           { icon: '⚽',  label: 'Гол',          tone: 'goal' },
  own_goal:       { icon: '⚽',  label: 'Автогол',      tone: 'goal-own' },
  penalty:        { icon: '🎯',  label: 'Пенальти',     tone: 'goal' },
  penalty_missed: { icon: '🚫',  label: 'Не реализован',tone: 'miss' },
  yellow_card:    { icon: '🟨',  label: 'Жёлтая',       tone: 'yellow' },
  yellow:         { icon: '🟨',  label: 'Жёлтая',       tone: 'yellow' },
  red_card:       { icon: '🟥',  label: 'Удаление',     tone: 'red' },
  red:            { icon: '🟥',  label: 'Удаление',     tone: 'red' },
  substitution:   { icon: '🔄',  label: 'Замена',       tone: 'sub' },
  substitution_in:{ icon: '🟢',  label: 'Выход',        tone: 'sub' },
  substitution_out:{icon: '🔴',  label: 'Уход',         tone: 'sub' },
};

function eventMeta(kind) {
  return KIND_META[kind] || { icon: '•', label: kind || '', tone: 'misc' };
}

export default function MatchReportCard({ match, onOpen }) {
  const events = Array.isArray(match.events) ? match.events : [];
  const home = match.home || '';
  const away = match.away || '';
  const score = match.score || {};
  const homeScore = score.home ?? '—';
  const awayScore = score.away ?? '—';

  const ourHome = isLegirus(home);
  const ourAway = isLegirus(away);
  // Определяем результат относительно нашей команды
  let result = 'draw';
  if (typeof score.home === 'number' && typeof score.away === 'number') {
    if (score.home === score.away) result = 'draw';
    else if ((ourHome && score.home > score.away) || (ourAway && score.away > score.home)) result = 'win';
    else result = 'lose';
  }

  const tournamentLabel = match.tournament === 'cup' ? 'Кубок' : 'Лига';
  const dateStr = new Date(match.date).toLocaleString('ru-RU', {
    day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
  });

  // Группируем голы по командам для compact-summary до timeline
  const goalsHome = events.filter((e) =>
    (e.kind === 'goal' || e.kind === 'penalty') && e.team === 'home'
  );
  const goalsAway = events.filter((e) =>
    (e.kind === 'goal' || e.kind === 'penalty') && (e.team === 'away' || e.team === 'guest')
  );
  const cards = events.filter((e) =>
    e.kind === 'yellow_card' || e.kind === 'red_card' || e.kind === 'yellow' || e.kind === 'red'
  ).length;

  const sortedEvents = [...events].sort((a, b) => (a.minute || 0) - (b.minute || 0));

  return (
    <article
      className={`mrc mrc--${result}`}
      onClick={() => onOpen && onOpen(match)}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && onOpen) onOpen(match); }}
    >
      {/* Header: дата + бейдж + результат-метка */}
      <div className="mrc__head">
        <div className="mrc__date">{dateStr}</div>
        <div className="mrc__head-right">
          {match.tournament && (
            <span className={`mrc__badge mrc__badge--${match.tournament}`}>
              {tournamentLabel}
            </span>
          )}
          <span className={`mrc__result-tag mrc__result-tag--${result}`}>
            {result === 'win'  ? 'Победа' : result === 'lose' ? 'Поражение' : 'Ничья'}
          </span>
        </div>
      </div>

      {/* Centerpiece: команды + большой счёт */}
      <div className="mrc__teams">
        <div className="mrc__team mrc__team--home">
          <img
            className="mrc__shield"
            src={shieldFor(home, match.homeShield)}
            alt=""
            loading="lazy"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          />
          <span className="mrc__team-name">{shortName(home)}</span>
        </div>
        <div className="mrc__score-block">
          <div className="mrc__score">
            <b className={typeof score.home === 'number' && score.home > (score.away ?? 0) ? 'mrc__score-winner' : ''}>{homeScore}</b>
            <span className="mrc__score-sep">:</span>
            <b className={typeof score.away === 'number' && score.away > (score.home ?? 0) ? 'mrc__score-winner' : ''}>{awayScore}</b>
          </div>
          <div className="mrc__score-label">матч сыгран</div>
        </div>
        <div className="mrc__team mrc__team--away">
          <img
            className="mrc__shield"
            src={shieldFor(away, match.awayShield)}
            alt=""
            loading="lazy"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          />
          <span className="mrc__team-name">{shortName(away)}</span>
        </div>
      </div>

      {/* Compact stat row — голеадоры + карточки одной строкой */}
      {(goalsHome.length > 0 || goalsAway.length > 0) && (
        <div className="mrc__scorers">
          <div className="mrc__scorers-side mrc__scorers-side--home">
            {goalsHome.map((g, i) => (
              <span key={'gh' + i} className="mrc__scorer">
                ⚽ {g.playerName} <small>{g.minute || '—'}'</small>
              </span>
            ))}
          </div>
          <div className="mrc__scorers-side mrc__scorers-side--away">
            {goalsAway.map((g, i) => (
              <span key={'ga' + i} className="mrc__scorer">
                <small>{g.minute || '—'}'</small> {g.playerName} ⚽
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Timeline: все ключевые события по минутам */}
      {sortedEvents.length > 0 && (
        <div className="mrc__timeline">
          <div className="mrc__timeline-title">
            <span>Ход матча</span>
            {cards > 0 && <span className="mrc__timeline-stat">🟨🟥 {cards}</span>}
          </div>
          <ol className="mrc__timeline-list">
            {sortedEvents.map((e, i) => {
              const meta = eventMeta(e.kind);
              const side = (e.team === 'away' || e.team === 'guest') ? 'away' : 'home';
              const isOurEvent =
                (side === 'home' && ourHome) ||
                (side === 'away' && ourAway);
              return (
                <li
                  key={i}
                  className={`mrc__tl-item mrc__tl-item--${meta.tone} mrc__tl-item--${side} ${isOurEvent ? 'is-ours' : ''}`}
                >
                  <span className="mrc__tl-minute">{e.minute ? e.minute + "'" : '—'}</span>
                  <span className="mrc__tl-icon">{e.icon || meta.icon}</span>
                  <span className="mrc__tl-text">
                    <b>{e.playerName || meta.label}</b>
                    {e.assistName && (
                      <small className="mrc__tl-assist"> · ассист: {e.assistName}</small>
                    )}
                    {e.comment && (
                      <small className="mrc__tl-comment"> — {e.comment}</small>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Footer: venue + CTA-подсказка */}
      <div className="mrc__foot">
        {match.venue && <div className="mrc__venue">📍 {match.venue}</div>}
        <button type="button" className="mrc__more" onClick={(ev) => { ev.stopPropagation(); onOpen && onOpen(match); }}>
          Подробнее →
        </button>
      </div>
    </article>
  );
}
