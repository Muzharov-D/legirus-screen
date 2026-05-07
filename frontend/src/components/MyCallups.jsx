// Блок «Ближайшие матчи — ответь иду/не иду» для игрока на ClubPage.
// Подгружает GET /api/callups/me и для каждого матча показывает кнопки RSVP.
//
// Тренеры этот блок не видят — для них есть CallupRoster (на match-странице).

import { useEffect, useState } from 'react';
import { fetchMyCallups, respondCallup } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './MyCallups.css';

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function shortName(name) {
  if (!name) return '—';
  return String(name).replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '').trim();
}

const STATUS_OPTIONS = [
  { id: 'confirmed', label: 'Иду',  icon: '✓', cls: 'go' },
  { id: 'declined',  label: 'Не иду', icon: '✗', cls: 'no' },
  { id: 'excused',   label: 'Уваж.', icon: '✎', cls: 'excused' },
];

export default function MyCallups() {
  const { isPlayer, user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // ageGroup-extMatchId
  const [err, setErr] = useState(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchMyCallups();
      setItems(r.callups || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (isPlayer) load(); }, [isPlayer, user?.playerId]);

  if (!isPlayer) return null;
  if (loading) return null;
  if (items.length === 0) return null;

  async function respond(callup, status) {
    const key = callup.ageGroup + '-' + callup.extMatchId;
    setBusy(key);
    try {
      await respondCallup(callup.ageGroup, callup.extMatchId, status, null);
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="my-callups">
      <div className="my-callups__head">
        <h3>Ближайшие матчи</h3>
        <span>{items.length}</span>
      </div>
      <div className="my-callups__list">
        {items.map((c) => {
          const m = c.match || {};
          const ourHome = (m.home || '').toLowerCase().includes('легирус');
          const opp = ourHome ? m.away : m.home;
          const oppShield = ourHome ? m.awayShield : m.homeShield;
          const key = c.ageGroup + '-' + c.extMatchId;
          const myStatus = c.status;
          return (
            <article key={c.id} className={`my-callup my-callup--${myStatus}`}>
              <div className="my-callup__row">
                <div className="my-callup__opp">
                  {oppShield && <img src={oppShield} alt="" className="my-callup__shield" />}
                  <div>
                    <div className="my-callup__opp-name">
                      {ourHome ? '🏠 ' : '✈️ '}{shortName(opp)}
                    </div>
                    <div className="my-callup__date">{fmt(m.date)}</div>
                    {m.venue && <div className="my-callup__venue">📍 {m.venue}</div>}
                  </div>
                </div>
                {m.tournament === 'cup' && <span className="my-callup__badge">Кубок</span>}
              </div>
              <div className="my-callup__buttons">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    className={`my-callup__btn my-callup__btn--${opt.cls} ${myStatus === opt.id ? 'is-on' : ''}`}
                    disabled={busy === key}
                    onClick={() => respond(c, opt.id)}
                  >
                    <span className="my-callup__btn-icon">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
              {myStatus && myStatus !== 'pending' && myStatus !== 'called' && (
                <div className="my-callup__hint">
                  Ваш ответ: <b>{STATUS_OPTIONS.find((s) => s.id === myStatus)?.label || myStatus}</b>. Можно изменить.
                </div>
              )}
            </article>
          );
        })}
      </div>
      {err && <div className="my-callups__err">{err}</div>}
    </section>
  );
}
