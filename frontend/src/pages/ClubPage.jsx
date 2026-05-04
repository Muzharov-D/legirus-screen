import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchMatches, fetchMatch, fetchStandings } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import { useAuth } from '../contexts/AuthContext';
import PlayerPhoto from '../components/PlayerPhoto';
import { ratingColor, ratingTextColor } from '../utils/colors';
import './ClubPage.css';

function num(v) {
  if (v == null) return null;
  if (typeof v === 'object') {
    if (v.value !== undefined) return Number(v.value);
    if (v.pct !== undefined)   return Number(v.pct);
    return null;
  }
  return Number(v);
}

const TOP_CATEGORIES = [
  {
    id: 'rating',
    title: 'Топ-5 по рейтингу',
    subtitle: 'средний за сезон',
    getter: (p) => num(p.ratings?.overall),
    aggregate: 'avg',
    digits: 2,
    suffix: '',
  },
  {
    id: 'goals',
    title: 'Лидеры по голам',
    subtitle: 'всего за сезон',
    getter: (p) => num(p.stats?.attack4?.goal),
    aggregate: 'sum',
    digits: 0,
    suffix: '',
  },
  {
    id: 'assists',
    title: 'Лидеры по ассистам',
    subtitle: 'всего за сезон',
    getter: (p) => num(p.stats?.attack1?.assist),
    aggregate: 'sum',
    digits: 0,
    suffix: '',
  },
  {
    id: 'xg',
    title: 'Лидеры по xG',
    subtitle: 'сумма ожидаемых голов',
    getter: (p) => num(p.stats?.attack1?.xG),
    aggregate: 'sum',
    digits: 2,
    suffix: '',
  },
  {
    id: 'xa',
    title: 'Лидеры по xA',
    subtitle: 'сумма ожидаемых ассистов',
    getter: (p) => num(p.stats?.attack1?.xA),
    aggregate: 'sum',
    digits: 2,
    suffix: '',
  },
  {
    id: 'fitness',
    title: 'Топ по фитнес-рейтингу',
    subtitle: 'средний за сезон',
    getter: (p) => num(p.ratings?.fitness),
    aggregate: 'avg',
    digits: 2,
    suffix: '',
  },
  {
    id: 'distance',
    title: 'Лидеры по пробегу',
    subtitle: 'средний за матч',
    getter: (p) => num(p.stats?.fitness?.totalDistance),
    aggregate: 'avg',
    digits: 0,
    suffix: ' м',
  },
];

export default function ClubPage() {
  const navigate = useNavigate();
  const { selectedTeam } = useTeam();
  const { canSeePlayer } = useAuth();
  // Возраст для standings: пробуем year → парсим из id (legirus-2010 → 2010) → пустую строку
  const ageGroup = String(
    selectedTeam?.year
    || (selectedTeam?.id || '').match(/(\d{4})/)?.[1]
    || ''
  );

  // Standings
  const standingsRes = useApi(
    () => (ageGroup ? fetchStandings(ageGroup).catch(() => null) : Promise.resolve(null)),
    [ageGroup]
  );
  const standings = standingsRes.data;

  // Все матчи сезона — для агрегатов
  const matchesRes = useApi(() => fetchMatches(selectedTeam?.id), [selectedTeam?.id]);
  const matches = matchesRes.data?.matches || [];
  const matchIdsKey = useMemo(() => matches.map((m) => m.id).join('|'), [matches]);

  const [allMatches, setAllMatches] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (!matches.length) { setAllMatches([]); return; }
    let cancelled = false;
    setLoadingDetails(true);
    Promise.all(matches.map((m) => fetchMatch(m.id).catch(() => null)))
      .then((rs) => { if (!cancelled) setAllMatches(rs.filter(Boolean)); })
      .finally(() => { if (!cancelled) setLoadingDetails(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchIdsKey]);

  const topByCategory = useMemo(() => {
    if (!allMatches.length) return {};
    const byPlayer = new Map();
    allMatches.forEach((m) => {
      (m.players || []).forEach((p) => {
        if (!byPlayer.has(p.id)) byPlayer.set(p.id, { player: p, matches: [] });
        const e = byPlayer.get(p.id);
        e.player = p;
        e.matches.push(p);
      });
    });

    const out = {};
    TOP_CATEGORIES.forEach((cat) => {
      const list = [];
      byPlayer.forEach(({ player, matches }) => {
        const values = matches
          .map((p) => cat.getter(p))
          .filter((v) => v != null && !isNaN(v));
        if (!values.length) return;
        const total = values.reduce((a, b) => a + b, 0);
        const value = cat.aggregate === 'sum' ? total : total / values.length;
        if (cat.aggregate === 'sum' && value <= 0) return; // прячем нулевых бомбардиров
        list.push({ player, value, games: values.length });
      });
      out[cat.id] = list.sort((a, b) => b.value - a.value).slice(0, 5);
    });
    return out;
  }, [allMatches]);

  const fmt = (v, digits) => {
    if (v == null || isNaN(v)) return '—';
    return digits === 0 ? Math.round(v).toLocaleString('ru-RU') : v.toFixed(digits);
  };

  return (
    <div className="page club-page">
      {/* HERO */}
      <div className="club-page__hero">
        <div className="club-page__hero-text">
          <div className="club-page__hero-eyebrow">Мой клуб</div>
          <h1 className="club-page__hero-title">ФК Легирус</h1>
          <div className="club-page__hero-sub">
            {selectedTeam?.name || 'Команда не выбрана'}
            {selectedTeam?.ageGroup && <> · {selectedTeam.ageGroup}</>}
          </div>
        </div>
      </div>

      {/* STANDINGS */}
      <div className="card club-standings">
        <div className="page-section-title">
          Клубный зачёт
          {standings?.title && <span className="club-standings__hint"> · {standings.title}</span>}
        </div>
        {standingsRes.loading && <div className="empty-state">Загрузка таблицы…</div>}
        {!standingsRes.loading && !standings && (
          <div className="empty-state">
            Таблица для возраста <b>{ageGroup || '—'}</b> ещё не подгрузилась.
            Парсер обновляется раз в сутки и при перезапуске сервера —
            попробуй обновить страницу через минуту.
          </div>
        )}
        {standings && (
          <div className="club-standings__wrap">
            <table className="club-standings__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Команда</th>
                  <th>И</th>
                  <th>В</th>
                  <th>Н</th>
                  <th>П</th>
                  <th>З-П</th>
                  <th className="club-standings__pts">О</th>
                </tr>
              </thead>
              <tbody>
                {(standings.table || []).map((row) => (
                  <tr key={row.pos} className={row.isOurClub ? 'club-standings__row--ours' : ''}>
                    <td className="club-standings__pos">{row.pos}</td>
                    <td className="club-standings__team">{row.team}</td>
                    <td>{row.games}</td>
                    <td>{row.wins}</td>
                    <td>{row.draws}</td>
                    <td>{row.losses}</td>
                    <td className="club-standings__gd">
                      {row.goalsFor}–{row.goalsAgainst}
                    </td>
                    <td className="club-standings__pts">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {standings.lastUpdated && (
              <div className="club-standings__updated">
                Обновлено: {new Date(standings.lastUpdated).toLocaleString('ru-RU')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* TOP PLAYERS */}
      <div className="page-section-title club-top-title">Топ футболистов клуба</div>
      {loadingDetails && allMatches.length === 0 && (
        <div className="empty-state">Считаем сезонные агрегаты…</div>
      )}
      <div className="club-top-grid">
        {TOP_CATEGORIES.map((cat) => {
          const list = topByCategory[cat.id] || [];
          if (!list.length) return null;
          return (
            <div className="card club-top-card" key={cat.id}>
              <div className="club-top-card__head">
                <div className="club-top-card__title">{cat.title}</div>
                <div className="club-top-card__sub">{cat.subtitle}</div>
              </div>
              <div className="club-top-card__list">
                {list.map((row, i) => {
                  const unlocked = canSeePlayer(row.player.id);
                  return (
                    <div
                      key={row.player.id}
                      className={'club-top-row' + (unlocked ? '' : ' club-top-row--locked')}
                      onClick={() => { if (unlocked) navigate(`/players/${row.player.id}`); }}
                      title={unlocked ? '' : 'Доступно только тренеру'}
                    >
                      <div className="club-top-row__rank">{i + 1}</div>
                      <PlayerPhoto player={row.player} size={36} />
                      <div className="club-top-row__info">
                        <div className="club-top-row__name">{row.player.fullName}</div>
                        <div className="club-top-row__pos">
                          №{row.player.number} · {row.player.position || row.player.positionFull}
                        </div>
                      </div>
                      {cat.id === 'rating' || cat.id === 'fitness' ? (
                        <div
                          className="club-top-row__pill"
                          style={{
                            background: ratingColor(row.value),
                            color: ratingTextColor(row.value),
                          }}
                        >
                          {fmt(row.value, cat.digits)}
                        </div>
                      ) : (
                        <div className="club-top-row__value">
                          {fmt(row.value, cat.digits)}{cat.suffix}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
