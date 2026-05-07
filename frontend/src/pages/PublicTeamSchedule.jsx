// Публичная страница расписания команды — без авторизации.
// Используется для расшаривания родителям, болельщикам.
// URL: /public/team/:age (например /public/team/2010)
//
// Источник: GET /api/public/calendar/:age — sanitized данные без личной статистики.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import MatchDetailSheet from '../components/MatchDetailSheet';
import CalendarSubscribeModal from '../components/CalendarSubscribeModal';
import './PublicTeamSchedule.css';

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = String(RAW_BASE).replace(/\/+$/, '');
const PREFIX = `${API_BASE}/api/public`;

const FILTERS = [
  { id: 'upcoming', label: 'Будущие' },
  { id: 'past',     label: 'Сыгранные' },
  { id: 'all',      label: 'Все' },
];

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function shortName(name) {
  if (!name) return '—';
  return String(name).replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '').trim();
}

function nrmName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export default function PublicTeamSchedule() {
  const { age } = useParams();
  const [cal, setCal] = useState(null);
  const [standings, setStandings] = useState(null);
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('upcoming');
  const [openMatch, setOpenMatch] = useState(null);
  const [showSubscribe, setShowSubscribe] = useState(false);

  useEffect(() => {
    if (!age) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${PREFIX}/calendar/${encodeURIComponent(age)}`).then((r) => r.ok ? r.json() : Promise.reject(new Error(`Календарь не найден (${r.status})`))),
      fetch(`${PREFIX}/standings/${encodeURIComponent(age)}`).then((r) => r.ok ? r.json() : null),
      fetch(`${PREFIX}/venues`).then((r) => r.ok ? r.json() : { venues: [] }),
    ]).then(([calData, standData, venueData]) => {
      setCal(calData);
      setStandings(standData);
      setVenues(venueData?.venues || []);
    }).catch((e) => {
      setError(e.message);
    }).finally(() => setLoading(false));
  }, [age]);

  // Lookup venue по совпадению имени стадиона из match.venue
  const venueByName = useMemo(() => {
    const map = new Map();
    for (const v of venues) {
      // ffspb даёт venue как "Балтика Санкт-Петербург" — попробуем мечить по началу
      map.set(nrmName(v.name), v);
    }
    return map;
  }, [venues]);

  function findVenue(matchVenue) {
    if (!matchVenue) return null;
    const key = nrmName(matchVenue);
    // Пробуем точное совпадение, потом — по подстроке
    if (venueByName.has(key)) return venueByName.get(key);
    for (const [vn, v] of venueByName) {
      if (key.startsWith(vn) || key.includes(vn)) return v;
    }
    return null;
  }

  const ourMatches = (cal?.matches || []).filter((m) => m.isOurMatch);
  const filtered = ourMatches.filter((m) => {
    if (filter === 'upcoming') return m.isUpcoming;
    if (filter === 'past')     return m.isPast;
    return true;
  });

  // Позиция Легируса в таблице
  const ourRow = standings?.table?.find((t) => t.isOurClub);

  return (
    <div className="public-page">
      <div className="public-page__container">
        <header className="public-page__head">
          <div className="public-page__brand">
            <img src="/assets/logos/legirus.png" alt="" className="public-page__logo" />
            <div>
              <div className="public-page__brand-eyebrow">АванDата</div>
              <h1 className="public-page__title">ФК Легирус · {age} г.р.</h1>
            </div>
          </div>
          {ourRow && (
            <div className="public-page__rank">
              <div className="public-page__rank-pos">{ourRow.pos}</div>
              <div className="public-page__rank-meta">
                место в лиге<br />
                <small>{ourRow.points} очков · {ourRow.wins}–{ourRow.draws}–{ourRow.losses}</small>
              </div>
            </div>
          )}
        </header>

        <button
          className="public-page__subscribe"
          onClick={() => setShowSubscribe(true)}
        >
          <span>📅</span>
          <span>Подписаться на расписание в календаре телефона</span>
        </button>

        {loading && <div className="public-page__empty">Загрузка...</div>}
        {error && (
          <div className="public-page__empty public-page__empty--error">
            Не удалось загрузить расписание: {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="public-page__filters">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={`public-page__filter ${filter === f.id ? 'is-active' : ''}`}
                  onClick={() => setFilter(f.id)}
                >{f.label}</button>
              ))}
              <span className="public-page__count">
                {filtered.length} матчей
              </span>
            </div>

            {filtered.length === 0 && (
              <div className="public-page__empty">
                {filter === 'upcoming' ? 'Будущих матчей нет' :
                 filter === 'past' ? 'Сыгранных матчей нет' :
                                     'Матчей не найдено'}
              </div>
            )}

            <div className="public-page__list">
              {filtered.map((m, i) => {
                const past = m.isPast;
                const tournamentLabel = m.tournament === 'cup' ? 'Кубок' : 'Лига';
                return (
                  <article
                    key={`${m.matchId || i}`}
                    className={`pub-card pub-card--clickable ${past ? 'pub-card--past' : ''}`}
                    onClick={() => setOpenMatch(m)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpenMatch(m); }}
                  >
                    <div className="pub-card__date">
                      {formatDate(m.date)}
                      {m.tournament && (
                        <span className={`pub-card__badge pub-card__badge--${m.tournament}`}>
                          {tournamentLabel}
                        </span>
                      )}
                    </div>
                    <div className="pub-card__teams">
                      <div className="pub-card__team pub-card__team--home">
                        {m.homeShield && <img className="pub-card__shield" src={m.homeShield} alt="" loading="lazy" />}
                        <span className="pub-card__team-name">{shortName(m.home)}</span>
                      </div>
                      <div className="pub-card__score">
                        {past && m.score
                          ? <span><b>{m.score.home}</b> : <b>{m.score.away}</b></span>
                          : <span className="pub-card__vs">vs</span>}
                      </div>
                      <div className="pub-card__team pub-card__team--away">
                        <span className="pub-card__team-name">{shortName(m.away)}</span>
                        {m.awayShield && <img className="pub-card__shield" src={m.awayShield} alt="" loading="lazy" />}
                      </div>
                    </div>
                    {m.venue && <div className="pub-card__venue">📍 {m.venue}</div>}
                  </article>
                );
              })}
            </div>

            <footer className="public-page__footer">
              <p>
                Расписание обновляется автоматически из источника stat.ffspb.org.<br />
                Последнее обновление: {cal?.lastUpdated ? new Date(cal.lastUpdated).toLocaleString('ru-RU') : '—'}
              </p>
              <p className="public-page__note">
                Это публичное расписание — общедоступная информация. Личная статистика игроков остаётся приватной;
                подробности матча и индивидуальные показатели доступны только тренерам и игрокам с авторизацией.
              </p>
            </footer>
          </>
        )}
      </div>

      {openMatch && (
        <MatchDetailSheet
          match={openMatch}
          venue={findVenue(openMatch.venue)}
          age={age}
          onClose={() => setOpenMatch(null)}
        />
      )}

      {showSubscribe && (
        <CalendarSubscribeModal
          feedUrl={(() => {
            // Абсолютный URL фида: используется как для подписки, так и в webcal://
            const apiBase = (typeof window !== 'undefined' ? window.location.origin : '');
            // Если backend на отдельном поддомене — используем VITE_API_BASE_URL
            const explicitApi = import.meta.env.VITE_API_BASE_URL;
            const base = explicitApi || apiBase;
            return base.replace(/\/+$/, '') + '/api/public/calendar/' + age + '.ics';
          })()}
          onClose={() => setShowSubscribe(false)}
        />
      )}
    </div>
  );
}
