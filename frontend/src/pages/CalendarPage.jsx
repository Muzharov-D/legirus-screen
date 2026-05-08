// /calendar — единая страница расписания: матчи + тренировки.
// Два режима: «Список» (хронологический список) и «Неделя» (7-дневная сетка).
//
// Источники:
//   GET /api/data/calendar/:age — матчи с ffspb
//   GET /api/trainings/team/:teamId — тренировки команды (только для тренеров/игроков)

import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { fetchCalendar, fetchCalendarList, fetchTrainingsByTeam } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import { useAuth } from '../contexts/AuthContext';
import CallupRoster from '../components/CallupRoster';
import './CalendarPage.css';

const FILTERS = [
  { id: 'upcoming', label: 'Будущие' },
  { id: 'past',     label: 'Сыгранные' },
  { id: 'all',      label: 'Все' },
];

const TRAINING_TYPES = {
  training: { label: 'Тренировка', icon: '🏃' },
  extra:    { label: 'Доп. занятие', icon: '⚡' },
  warmup:   { label: 'Разминка', icon: '🔥' },
  recovery: { label: 'Восстановление', icon: '💧' },
  meet:     { label: 'Сбор', icon: '👥' },
};

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fmtDayHeader(d) {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const day = startOfDay(d);
  const ms = day.getTime();
  if (ms === today.getTime()) return 'Сегодня';
  if (ms === tomorrow.getTime()) return 'Завтра';
  return day.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: 'short' });
}
function shortName(name) {
  if (!name) return '—';
  return String(name).replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '').trim();
}

export default function CalendarPage() {
  const { selectedTeam } = useTeam();
  const { isCoach, user } = useAuth();
  const [openCallup, setOpenCallup] = useState(null);

  // Список доступных возрастных групп
  const listRes = useApi(fetchCalendarList, []);
  const ages = listRes.data?.ageGroups || [];

  const yearStr = selectedTeam?.year ? String(selectedTeam.year) : null;
  const defaultAge = (yearStr && ages.includes(yearStr)) ? yearStr
    : (ages.includes('2010') ? '2010' : ages[0]);

  const [age, setAge] = useState(defaultAge);
  const [filter, setFilter] = useState('upcoming');
  const [scope, setScope] = useState('ours'); // 'ours' | 'all'
  const [view, setView] = useState('list');     // 'list' | 'week'

  useEffect(() => {
    if (ages.length > 0 && !ages.includes(age)) setAge(defaultAge || ages[0]);
  }, [listRes.data]);

  const calRes = useApi(() => age ? fetchCalendar(age) : Promise.resolve(null), [age]);
  const cal = calRes.data;
  const matches = cal?.matches || [];

  // Тренировки команды — для аутентифицированных юзеров команды
  const teamId = selectedTeam?.id || (age ? `legirus-${age}` : null);
  const showTrainings = !!user && !!teamId; // тренировки видят только залогинены
  const trRes = useApi(
    () => showTrainings ? fetchTrainingsByTeam(teamId, { scope: 'all', limit: 100 })
                        : Promise.resolve({ trainings: [] }),
    [teamId, showTrainings]);
  const trainings = trRes.data?.trainings || [];

  // === LIST view ===
  const listFiltered = useMemo(() => {
    let arr = matches;
    if (scope === 'ours') arr = arr.filter((m) => m.isOurMatch);
    if (filter === 'upcoming') arr = arr.filter((m) => m.isUpcoming);
    if (filter === 'past')     arr = arr.filter((m) => m.isPast);
    return arr;
  }, [matches, filter, scope]);

  const ourTotal = useMemo(() => matches.filter((m) => m.isOurMatch).length, [matches]);

  // === WEEK view: группируем матчи + тренировки по дням (7 дней вперёд от сегодня) ===
  const weekDays = useMemo(() => {
    const today = startOfDay(new Date());
    const buckets = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      buckets.push({ date: d, key: d.toISOString().slice(0, 10), events: [] });
    }
    function bucketFor(iso) {
      if (!iso) return null;
      const k = startOfDay(new Date(iso)).toISOString().slice(0, 10);
      return buckets.find((b) => b.key === k);
    }
    // Матчи нашей команды (upcoming)
    for (const m of matches) {
      if (!m.isOurMatch) continue;
      const b = bucketFor(m.date);
      if (b) b.events.push({ type: 'match', time: m.date, data: m });
    }
    for (const t of trainings) {
      const b = bucketFor(t.startsAt);
      if (b) b.events.push({ type: 'training', time: t.startsAt, data: t });
    }
    for (const b of buckets) b.events.sort((a, b) => new Date(a.time) - new Date(b.time));
    return buckets;
  }, [matches, trainings]);

  return (
    <div className="page calendar-page">
      <header className="calendar-page__head">
        <div>
          <h1 className="calendar-page__title">Календарь</h1>
          <div className="calendar-page__subtitle">
            {cal?.title || 'Расписание'} · {selectedTeam?.name || age + ' г.р.'}
            {scope === 'ours' && ourTotal > 0 ? ` · ${ourTotal} наших матчей` : ''}
          </div>
          {cal?.lastUpdated && (
            <div className="calendar-page__updated">
              Обновлено: {new Date(cal.lastUpdated).toLocaleString('ru-RU')}
            </div>
          )}
        </div>
        <div className="calendar-page__controls">
          {/* View switch — Список / Неделя */}
          <div className="calendar-page__filters calendar-page__view-toggle">
            <button
              className={`calendar-page__filter ${view === 'list' ? 'is-active' : ''}`}
              onClick={() => setView('list')}
            >📋 Список</button>
            <button
              className={`calendar-page__filter ${view === 'week' ? 'is-active' : ''}`}
              onClick={() => setView('week')}
            >📆 Неделя</button>
          </div>

          {ages.length > 0 && (
            <select
              className="calendar-page__select"
              value={age || ''}
              onChange={(e) => setAge(e.target.value)}
            >
              {ages.map((a) => (
                <option key={a} value={a}>{a} г.р.</option>
              ))}
            </select>
          )}

          {/* Filter и scope только в списочном режиме */}
          {view === 'list' && (
            <>
              <div className="calendar-page__filters">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    className={`calendar-page__filter ${filter === f.id ? 'is-active' : ''}`}
                    onClick={() => setFilter(f.id)}
                  >{f.label}</button>
                ))}
              </div>
              <div className="calendar-page__filters">
                <button
                  className={`calendar-page__filter ${scope === 'ours' ? 'is-active' : ''}`}
                  onClick={() => setScope('ours')}
                >Только наши</button>
                <button
                  className={`calendar-page__filter ${scope === 'all' ? 'is-active' : ''}`}
                  onClick={() => setScope('all')}
                >Вся лига</button>
              </div>
            </>
          )}
        </div>
      </header>

      {(listRes.loading || calRes.loading) && (
        <div className="empty-state">Загрузка календаря…</div>
      )}

      {calRes.error && (
        <div className="empty-state empty-state--error">
          Не удалось загрузить календарь: {calRes.error.message || String(calRes.error)}
        </div>
      )}

      {/* === LIST VIEW === */}
      {view === 'list' && !calRes.loading && (
        <>
          {listFiltered.length === 0 ? (
            <div className="empty-state">
              {filter === 'upcoming' ? 'Будущих матчей не найдено' :
               filter === 'past'     ? 'Сыгранных матчей нет' :
                                       'Матчи отсутствуют'}
            </div>
          ) : (
            <div className="calendar-page__list">
              {listFiltered.map((m, i) => {
                const past = m.isPast;
                return (
                  <div
                    key={`${m.date || ''}-${i}`}
                    className={`cal-card ${m.isOurMatch ? 'cal-card--ours' : ''} ${past ? 'cal-card--past' : ''}`}
                  >
                    <div className="cal-card__date">
                      {formatDate(m.date)}
                      {m.round && <span className="cal-card__round">· {m.round}</span>}
                      {m.tournament === 'cup' && <span className="cal-card__badge cal-card__badge--cup">Кубок</span>}
                    </div>
                    <div className="cal-card__teams">
                      <div className="cal-card__team cal-card__team--home">
                        {m.homeShield && <img className="cal-card__shield" src={m.homeShield} alt="" loading="lazy" />}
                        <span className="cal-card__team-name">{shortName(m.home)}</span>
                      </div>
                      <div className="cal-card__score">
                        {past && m.score
                          ? <span><b>{m.score.home}</b> : <b>{m.score.away}</b></span>
                          : <span className="cal-card__vs">vs</span>}
                      </div>
                      <div className="cal-card__team cal-card__team--away">
                        <span className="cal-card__team-name">{shortName(m.away)}</span>
                        {m.awayShield && <img className="cal-card__shield" src={m.awayShield} alt="" loading="lazy" />}
                      </div>
                    </div>
                    {m.venue && <div className="cal-card__venue">📍 {m.venue}</div>}
                    {isCoach && m.isOurMatch && !past && (
                      <button
                        className="cal-card__roster-btn"
                        onClick={(e) => { e.stopPropagation(); setOpenCallup(m); }}
                      >
                        👥 Состав на матч
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* === WEEK VIEW === */}
      {view === 'week' && !calRes.loading && (
        <div className="calendar-page__week-grid">
          {weekDays.map((b) => (
            <div key={b.key} className="cal-week-day">
              <div className="cal-week-day__head">
                <span className="cal-week-day__title">{fmtDayHeader(b.date)}</span>
                {b.events.length > 0 && <span className="cal-week-day__count">{b.events.length}</span>}
              </div>
              {b.events.length === 0 ? (
                <div className="cal-week-day__empty">—</div>
              ) : (
                <div className="cal-week-day__events">
                  {b.events.map((e, i) => {
                    if (e.type === 'match') {
                      const m = e.data;
                      const ourHome = (m.home || '').toLowerCase().includes('легирус');
                      const opp = ourHome ? m.away : m.home;
                      const oppShield = ourHome ? m.awayShield : m.homeShield;
                      return (
                        <button
                          key={'m' + i}
                          className={`cal-week-card cal-week-card--match ${m.tournament === 'cup' ? 'cal-week-card--cup' : ''}`}
                          onClick={() => isCoach && !m.isPast ? setOpenCallup(m) : null}
                          disabled={!isCoach || m.isPast}
                          type="button"
                        >
                          <div className="cal-week-card__time">⚽ {fmtTime(m.date)}</div>
                          <div className="cal-week-card__title">
                            {ourHome ? '🏠 ' : '✈️ '}
                            {oppShield && <img src={oppShield} alt="" className="cal-week-card__shield" />}
                            {shortName(opp)}
                          </div>
                          {m.venue && <div className="cal-week-card__venue">📍 {m.venue}</div>}
                          {m.tournament === 'cup' && <span className="cal-week-card__badge">Кубок</span>}
                        </button>
                      );
                    }
                    const t = e.data;
                    const tt = TRAINING_TYPES[t.type] || TRAINING_TYPES.training;
                    return (
                      <div
                        key={'t' + i}
                        className="cal-week-card cal-week-card--training"
                      >
                        <div className="cal-week-card__time">{tt.icon} {fmtTime(t.startsAt)}</div>
                        <div className="cal-week-card__title">{tt.label}</div>
                        {t.venueText && <div className="cal-week-card__venue">📍 {t.venueText}</div>}
                        <div className="cal-week-card__sub">{t.durationMin} мин</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {openCallup && (
        <CallupRoster
          match={openCallup}
          age={age}
          teamId={selectedTeam?.id || `legirus-${age}`}
          onClose={() => setOpenCallup(null)}
        />
      )}
    </div>
  );
}
