// Страница /calendar — календарь сезона по возрастным группам.
// Источник: GET /api/data/calendar/:age (скрейп ffspb.org/.../calendar)
// Показываем будущие матчи (isUpcoming) с фильтром по возрастной группе.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchCalendar, fetchCalendarList } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import { useAuth } from '../contexts/AuthContext';
import CallupRoster from '../components/CallupRoster';
import './CalendarPage.css';

const FILTERS = [
  { id: 'upcoming', label: 'Будущие' },
  { id: 'past',     label: 'Сыгранные' },
  { id: 'all',      label: 'Все' },
];

// По умолчанию показываем только матчи нашего клуба (isOurMatch=true).
// Кнопка "Вся лига" даёт переключиться на полный календарь возрастной группы.

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

export default function CalendarPage() {
  const navigate = useNavigate();
  const { selectedTeam } = useTeam();
  const { isCoach } = useAuth();
  const [openCallup, setOpenCallup] = useState(null); // match object

  // Список доступных возрастных групп (тех, для которых есть calendar/{age}.json)
  const listRes = useApi(fetchCalendarList, []);
  const ages = listRes.data?.ageGroups || [];

  // По умолчанию — возраст выбранной команды (year — это ключ "2010" / "2011" и т.п.,
  // ageGroup это display "U-17" — не подходит как ключ бэка).
  const yearStr = selectedTeam?.year ? String(selectedTeam.year) : null;
  const defaultAge = (yearStr && ages.includes(yearStr)) ? yearStr
    : (ages.includes('2010') ? '2010' : ages[0]);

  const [age, setAge] = useState(defaultAge);
  const [filter, setFilter] = useState('upcoming');
  const [scope, setScope] = useState('ours'); // 'ours' | 'all'

  // Когда подгрузился список возрастов и текущий не валиден — переключаемся
  useEffect(() => {
    if (ages.length > 0 && !ages.includes(age)) setAge(defaultAge || ages[0]);
  }, [listRes.data]);

  const calRes = useApi(() => age ? fetchCalendar(age) : Promise.resolve(null), [age]);
  const cal = calRes.data;
  const matches = cal?.matches || [];

  const filtered = useMemo(() => {
    let arr = matches;
    if (scope === 'ours') arr = arr.filter((m) => m.isOurMatch);
    if (filter === 'upcoming') arr = arr.filter((m) => m.isUpcoming);
    if (filter === 'past')     arr = arr.filter((m) => m.isPast);
    return arr;
  }, [matches, filter, scope]);

  const ourTotal = useMemo(() => matches.filter((m) => m.isOurMatch).length, [matches]);

  return (
    <div className="page calendar-page">
      <header className="calendar-page__head">
        <div>
          <h1 className="calendar-page__title">Календарь сезона</h1>
          <div className="calendar-page__subtitle">
            {cal?.title || 'Расписание матчей'} · {filtered.length} матчей{scope === 'ours' && ourTotal > 0 ? ` из ${ourTotal} наших` : ''}
          </div>
          {cal?.lastUpdated && (
            <div className="calendar-page__updated">
              Обновлено: {new Date(cal.lastUpdated).toLocaleString('ru-RU')}
            </div>
          )}
        </div>
        <div className="calendar-page__controls">
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
          <div className="calendar-page__filters">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`calendar-page__filter ${filter === f.id ? 'is-active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
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

      {!calRes.loading && filtered.length === 0 && (
        <div className="empty-state">
          {filter === 'upcoming' ? 'Будущих матчей не найдено' :
           filter === 'past'     ? 'Сыгранных матчей нет' :
                                   'Матчи отсутствуют'}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="calendar-page__list">
          {filtered.map((m, i) => {
            const past = m.isPast;
            return (
              <div
                key={`${m.date || ''}-${i}`}
                className={`cal-card ${m.isOurMatch ? 'cal-card--ours' : ''} ${past ? 'cal-card--past' : ''}`}
              >
                <div className="cal-card__date">
                  {formatDate(m.date)}
                  {m.round && <span className="cal-card__round">· {m.round}</span>}
                </div>
                <div className="cal-card__teams">
                  <div className="cal-card__team cal-card__team--home">
                    {m.homeShield && (
                      <img className="cal-card__shield" src={m.homeShield} alt="" loading="lazy" />
                    )}
                    <span className="cal-card__team-name">{shortName(m.home)}</span>
                  </div>
                  <div className="cal-card__score">
                    {past && m.score
                      ? <span><b>{m.score.home}</b> : <b>{m.score.away}</b></span>
                      : <span className="cal-card__vs">vs</span>}
                  </div>
                  <div className="cal-card__team cal-card__team--away">
                    <span className="cal-card__team-name">{shortName(m.away)}</span>
                    {m.awayShield && (
                      <img className="cal-card__shield" src={m.awayShield} alt="" loading="lazy" />
                    )}
                  </div>
                </div>
                {m.venue && <div className="cal-card__venue">📍 {m.venue}</div>}
                {/* Кнопка «Состав» — только для тренера на upcoming наши матчи */}
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

      {openCallup && (
        <CallupRoster
          match={openCallup}
          age={age}
          teamId={selectedTeam?.id || `legirus-${age}`}
          onClose={() => setOpenCallup(null)}
        />
      )}

      {/* Если бэк говорит что парсер не нашёл блок — даём подсказку тренеру */}
      {cal && cal.parserHint === 'fallback-empty' && filtered.length === 0 && (
        <div className="calendar-page__hint">
          <b>Парсер календаря не нашёл данные на странице ffspb.</b><br />
          Возможно изменилась верстка источника. URL: <a href={cal.source} target="_blank" rel="noreferrer">{cal.source}</a><br />
          Можно вручную обновить через POST /api/data/calendar/{age}/refresh,
          либо настроить explicit URL в <code>backend/data/standings/_config.json</code> → <code>calendarSources</code>.
        </div>
      )}
    </div>
  );
}
