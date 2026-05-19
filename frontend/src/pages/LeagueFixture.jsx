// Полный календарь лиги — все матчи возраста, не только Легируса.
// URL: /public/team/:age/league
//
// Источник: тот же /api/public/calendar/:age — там УЖЕ лежат все матчи
// турнира (фронт PublicTeamSchedule просто фильтровал по isOurMatch).
// Здесь — наоборот, показываем всё, наш матч просто подсвечен.
//
// Группировка по турам (round). Без раунда — отдельная секция «Без тура».
// Клик на матч → MatchDetailSheet (он умеет показывать любой матч,
// для не-нашего покажет минимум: счёт, дата, стадион).

import { useEffect, useMemo, useState } from 'react';
import { useAutoRefresh, bustCache } from '../hooks/useAutoRefresh';
import { useParams, useNavigate } from 'react-router-dom';
import MatchDetailSheet from '../components/MatchDetailSheet';
import OfflineBanner from '../components/OfflineBanner';
import UiIcon from '../components/UiIcon';
import Skeleton from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { shieldFor, isLegirus } from '../utils/legirus';
import { fmtRelative } from '../utils/dates';
import './LeagueFixture.css';
import './PublicTeamSchedule.css';

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = String(RAW_BASE).replace(/\/+$/, '');
const PREFIX = `${API_BASE}/api/public`;

function shortName(name) {
  if (!name) return '—';
  return String(name)
    .replace(/^(ГБОУ|ГБУ|МБОУ|МАОУ|ГКУ|МКУ|ГКОУ)\s+(ДО\s+|ДОД\s+|ДОУ\s+)?/i, '')
    .replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '')
    .replace(/\bрайона\b/gi, 'р-на')
    .trim()
    .split(' ').slice(0, 3).join(' ');
}

// Парсим номер тура из строки «Тур 10» / «10 тур» / «10» → 10. Используется
// для сортировки секций.
function roundNum(round) {
  if (!round) return Infinity;
  const m = String(round).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

export default function LeagueFixture() {
  const { age } = useParams();
  const navigate = useNavigate();
  const [cal, setCal] = useState(null);
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openMatch, setOpenMatch] = useState(null);
  const [tournament, setTournament] = useState('league'); // league | cup
  const [filter, setFilter] = useState('all'); // all | past | upcoming

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(bustCache(`${PREFIX}/calendar/${age}`)).then((r) => r.ok ? r.json() : null),
      fetch(bustCache(`${PREFIX}/venues`)).then((r) => r.ok ? r.json() : { venues: [] }),
    ])
      .then(([cd, vd]) => {
        if (!cd) { setError('Календарь недоступен'); setLoading(false); return; }
        setCal(cd);
        setVenues(vd?.venues || []);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { load(); }, [age]);
  useAutoRefresh(load, 30 * 60 * 1000); // 30 мин

  function findVenue(matchVenue) {
    if (!matchVenue) return null;
    const key = String(matchVenue).toLowerCase().trim();
    for (const v of venues) {
      const vname = String(v.name || '').toLowerCase().trim();
      if (key === vname || key.startsWith(vname) || key.includes(vname)) return v;
    }
    return null;
  }

  // Определяем «нашу» группу в лиге динамически — по любому нашему матчу.
  // Легирус играет только в своей группе (например «Вторая лига»). Жёстко
  // отсеиваем чужие группы (Третья лига и т.п.) — пользователь не хочет
  // видеть матчи команд из других дивизионов.
  const ourGroup = useMemo(() => {
    const our = (cal?.matches || []).find((m) => m.isOurMatch && m.tournament === 'league' && m.group);
    return our ? our.group : null;
  }, [cal]);

  // Фильтруем по турниру + статусу + нашей группе, группируем по round
  const grouped = useMemo(() => {
    const matches = (cal?.matches || []).filter((m) => {
      if (m.tournament && m.tournament !== tournament) return false;
      if (filter === 'past' && !m.isPast) return false;
      if (filter === 'upcoming' && m.isPast) return false;
      // Для лиги — только наша группа (отсеиваем 3-ю лигу и др. дивизионы).
      // Для кубка group=null чаще всего — кубок все стадии в одном дереве.
      if (tournament === 'league' && ourGroup && m.group && m.group !== ourGroup) return false;
      return true;
    });
    const byRound = new Map();
    for (const m of matches) {
      const key = m.round || 'Без тура';
      if (!byRound.has(key)) byRound.set(key, []);
      byRound.get(key).push(m);
    }
    // Сортируем туры — по номеру (Тур 1, Тур 2…), потом «Без тура» в конец
    const sorted = [...byRound.entries()].sort(([a], [b]) => {
      const na = roundNum(a), nb = roundNum(b);
      return na - nb;
    });
    // Внутри тура сортируем по дате
    for (const [, list] of sorted) {
      list.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : Infinity;
        const db = b.date ? new Date(b.date).getTime() : Infinity;
        return da - db;
      });
    }
    return sorted;
  }, [cal, tournament, filter]);

  const totalMatches = useMemo(
    () => grouped.reduce((sum, [, list]) => sum + list.length, 0),
    [grouped],
  );

  return (
    <div className="league-fixture public-page">
      <OfflineBanner />

      <div className="league-fixture__topbar">
        <button className="league-fixture__back" onClick={() => navigate(`/public/team/${age}`)}>
          ← К моей команде
        </button>
        <div className="league-fixture__title">
          {cal?.title || 'Календарь лиги'}
        </div>
      </div>

      {loading && (
        <div className="league-fixture__skeleton">
          <Skeleton h={44} br={10} />
          <Skeleton.List count={6} h={68} gap={8} br={10} />
        </div>
      )}

      {error && (
        <div className="public-page__empty public-page__empty--error">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Сегмент лига / кубок */}
          <div className="league-fixture__tournament">
            <button
              className={`league-fixture__seg ${tournament === 'league' ? 'is-active' : ''}`}
              onClick={() => setTournament('league')}
            >
              <UiIcon name="ball" size={14} /> Лига
            </button>
            <button
              className={`league-fixture__seg ${tournament === 'cup' ? 'is-active' : ''}`}
              onClick={() => setTournament('cup')}
            >
              <UiIcon name="trophy" size={14} /> Кубок
            </button>
          </div>

          {/* Фильтр прошедшие/будущие/все */}
          <div className="public-page__filters">
            {[
              { key: 'all',      label: 'Все' },
              { key: 'past',     label: 'Прошедшие' },
              { key: 'upcoming', label: 'Будущие' },
            ].map((f) => (
              <button
                key={f.key}
                className={`public-page__filter ${filter === f.key ? 'is-active' : ''}`}
                onClick={() => setFilter(f.key)}
              >{f.label}</button>
            ))}
            <span className="league-fixture__count">{totalMatches}</span>
          </div>

          {/* Список матчей по турам */}
          {totalMatches === 0 ? (
            <EmptyState icon="📋" title="Нет матчей" subtitle="Календарь пуст для выбранного фильтра." />
          ) : (
            <div className="league-fixture__list">
              {grouped.map(([roundKey, list]) => (
                <div key={roundKey} className="league-fixture__round">
                  <div className="league-fixture__round-head">
                    <span className="league-fixture__round-name">{roundKey}</span>
                    <span className="league-fixture__round-count">{list.length}</span>
                  </div>
                  <div className="league-fixture__round-list">
                    {list.map((m, i) => (
                      <article
                        key={m.matchId || i}
                        className={
                          'lf-card'
                          + (m.isOurMatch ? ' lf-card--ours' : '')
                          + (m.isPast ? ' lf-card--past' : ' lf-card--upcoming')
                        }
                        onClick={() => setOpenMatch(m)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="lf-card__date">
                          {m.date ? fmtRelative(m.date) : 'Дата уточняется'}
                        </div>
                        <div className="lf-card__teams">
                          <div className={`lf-card__team lf-card__team--home ${isLegirus(m.home) ? 'lf-card__team--us' : ''}`}>
                            <img
                              src={shieldFor(m.home, m.homeShield)}
                              alt=""
                              className="lf-card__shield"
                              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                            />
                            <span className="lf-card__name">{shortName(m.home)}</span>
                          </div>
                          <div className="lf-card__score">
                            {m.isPast && m.score
                              ? <span><b>{m.score.home}</b>:<b>{m.score.away}</b></span>
                              : <span className="lf-card__vs">vs</span>}
                          </div>
                          <div className={`lf-card__team lf-card__team--away ${isLegirus(m.away) ? 'lf-card__team--us' : ''}`}>
                            <span className="lf-card__name">{shortName(m.away)}</span>
                            <img
                              src={shieldFor(m.away, m.awayShield)}
                              alt=""
                              className="lf-card__shield"
                              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                            />
                          </div>
                        </div>
                        {m.venue && <div className="lf-card__venue">{m.venue}</div>}
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {openMatch && (
        <MatchDetailSheet
          match={openMatch}
          venue={findVenue(openMatch.venue)}
          age={age}
          onClose={() => setOpenMatch(null)}
        />
      )}
    </div>
  );
}
