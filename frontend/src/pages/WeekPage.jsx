// /week — недельный вид: 7 дней вперёд с матчами и тренировками для выбранной команды.
// Подгружает оба источника параллельно: GET /api/data/calendar/:age + GET /api/trainings/team/:teamId.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCalendar, fetchTrainingsByTeam } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import './WeekPage.css';

const TYPES = {
  training: { label: 'Тренировка', icon: '🏃', cls: 'training' },
  extra:    { label: 'Доп. занятие', icon: '⚡', cls: 'extra' },
  warmup:   { label: 'Разминка', icon: '🔥', cls: 'warmup' },
  recovery: { label: 'Восстановление', icon: '💧', cls: 'recovery' },
  meet:     { label: 'Сбор', icon: '👥', cls: 'meet' },
};

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fmtDate(d) {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const day = startOfDay(d);
  const dayMs = day.getTime();
  if (dayMs === today.getTime()) return 'Сегодня';
  if (dayMs === tomorrow.getTime()) return 'Завтра';
  return day.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: 'short' });
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function shortName(n) {
  if (!n) return '—';
  return String(n).replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '').trim();
}

export default function WeekPage() {
  const navigate = useNavigate();
  const { selectedTeam } = useTeam();
  const [matches, setMatches] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const teamId = selectedTeam?.id;
  const age = selectedTeam?.year ? String(selectedTeam.year) : null;

  useEffect(() => {
    if (!teamId || !age) return;
    setLoading(true);
    setErr(null);
    Promise.all([
      fetchCalendar(age).catch(() => null),
      fetchTrainingsByTeam(teamId, { scope: 'upcoming', limit: 50 }).catch(() => ({ trainings: [] })),
    ]).then(([cal, tr]) => {
      setMatches((cal?.matches || []).filter((m) => m.isOurMatch && m.isUpcoming));
      setTrainings(tr?.trainings || []);
    }).catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [teamId, age]);

  // Группируем все события (матчи и тренировки) по дням, на 7 дней вперёд
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    const horizon = new Date(today); horizon.setDate(horizon.getDate() + 7);
    const buckets = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      buckets.push({ date: d, key: d.toISOString().slice(0,10), events: [] });
    }
    function findBucket(iso) {
      if (!iso) return null;
      const k = startOfDay(new Date(iso)).toISOString().slice(0,10);
      return buckets.find((b) => b.key === k);
    }
    for (const m of matches) {
      const b = findBucket(m.date);
      if (b) b.events.push({ type: 'match', time: m.date, data: m });
    }
    for (const t of trainings) {
      const b = findBucket(t.startsAt);
      if (b) b.events.push({ type: 'training', time: t.startsAt, data: t });
    }
    for (const b of buckets) b.events.sort((a, b) => new Date(a.time) - new Date(b.time));
    return buckets;
  }, [matches, trainings]);

  const totalEvents = days.reduce((s, b) => s + b.events.length, 0);

  return (
    <div className="week-page">
      <header className="week-page__head">
        <div>
          <h1>Неделя</h1>
          <div className="week-page__sub">
            {selectedTeam?.name || '—'} · {totalEvents} {totalEvents === 1 ? 'событие' : 'событий'} на 7 дней
          </div>
        </div>
      </header>

      {loading && <div className="week-page__empty">Загрузка...</div>}
      {err && <div className="week-page__empty week-page__empty--error">{err}</div>}

      {!loading && !err && (
        <div className="week-page__grid">
          {days.map((b) => (
            <div key={b.key} className="week-day">
              <div className="week-day__head">
                <span className="week-day__title">{fmtDate(b.date)}</span>
                {b.events.length > 0 && <span className="week-day__count">{b.events.length}</span>}
              </div>
              {b.events.length === 0 ? (
                <div className="week-day__empty">—</div>
              ) : (
                <div className="week-day__events">
                  {b.events.map((e, i) => {
                    if (e.type === 'match') {
                      const m = e.data;
                      const ourHome = (m.home || '').toLowerCase().includes('легирус');
                      const opp = ourHome ? m.away : m.home;
                      const oppShield = ourHome ? m.awayShield : m.homeShield;
                      return (
                        <div
                          key={'m-' + i}
                          className={`week-card week-card--match ${m.tournament === 'cup' ? 'week-card--cup' : ''}`}
                          onClick={() => navigate(`/calendar`)}
                          role="button"
                        >
                          <div className="week-card__time">⚽ {fmtTime(m.date)}</div>
                          <div className="week-card__title">
                            {ourHome ? '🏠 ' : '✈️ '}
                            {oppShield && <img src={oppShield} alt="" className="week-card__shield" />}
                            {shortName(opp)}
                          </div>
                          {m.venue && <div className="week-card__venue">📍 {m.venue}</div>}
                          {m.tournament === 'cup' && <span className="week-card__badge">Кубок</span>}
                        </div>
                      );
                    }
                    const t = e.data;
                    const tt = TYPES[t.type] || TYPES.training;
                    return (
                      <div
                        key={'t-' + i}
                        className={`week-card week-card--${tt.cls}`}
                        onClick={() => navigate(`/trainings`)}
                        role="button"
                      >
                        <div className="week-card__time">{tt.icon} {fmtTime(t.startsAt)}</div>
                        <div className="week-card__title">{tt.label}</div>
                        {t.venueText && <div className="week-card__venue">📍 {t.venueText}</div>}
                        <div className="week-card__sub">{t.durationMin} мин</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
