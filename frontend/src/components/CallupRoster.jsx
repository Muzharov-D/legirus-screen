// CallupRoster — модалка для тренера: «Состав на матч».
// Показывает всех игроков команды + кнопки «Вызвать всех / убрать игрока / изменить статус».
// Открывается из CalendarPage по клику на upcoming наш матч (только если user — тренер).

import { useEffect, useState } from 'react';
import {
  fetchCallupsByMatch, callupSummary, callPlayers, callAllPending,
  removeFromCallup, respondCallup, fetchPlayers,
} from '../services/api';
import './CallupRoster.css';

const STATUS_LABELS = {
  pending:   { label: 'Не вызван', cls: 'pending', icon: '○' },
  called:    { label: 'Вызван',    cls: 'called',  icon: '📞' },
  confirmed: { label: 'Иду',       cls: 'go',      icon: '✓' },
  declined:  { label: 'Не иду',    cls: 'no',      icon: '✗' },
  excused:   { label: 'Уваж.',     cls: 'excused', icon: '✎' },
};

export default function CallupRoster({ match, age, teamId, onClose }) {
  const [roster, setRoster] = useState([]);   // { playerId, playerName, playerNumber, status }
  const [allPlayers, setAllPlayers] = useState([]); // полный список команды для добавления
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  async function load() {
    if (!match?.matchId || !age) return;
    setLoading(true);
    setErr(null);
    try {
      const [roR, plR] = await Promise.all([
        fetchCallupsByMatch(age, match.matchId),
        fetchPlayers(teamId),
      ]);
      setRoster(roR.callups || []);
      setAllPlayers(plR.players || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [match?.matchId, age]);

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

  // Игроки команды, которых ещё нет в призыве
  const rosterIds = new Set(roster.map((r) => r.playerId));
  const notIn = allPlayers.filter((p) => !rosterIds.has(p.id));

  async function handleCallAll() {
    setBusy('call-all');
    try {
      // Если кто-то ещё не в pending — добавим всех
      if (notIn.length > 0) {
        await callPlayers(age, match.matchId, notIn.map((p) => p.id));
      }
      // Затем pending → called
      await callAllPending(age, match.matchId);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  async function handleAddPlayer(playerId) {
    setBusy('add-' + playerId);
    try {
      await callPlayers(age, match.matchId, [playerId]);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  async function handleRemove(playerId) {
    setBusy('rem-' + playerId);
    try {
      await removeFromCallup(age, match.matchId, playerId);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  async function handleSetStatus(playerId, status) {
    setBusy('set-' + playerId);
    try {
      await respondCallup(age, match.matchId, status, null, playerId);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  // Сводка
  const counts = roster.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  const total = roster.length;
  const ready = (counts.confirmed || 0);
  const declined = (counts.declined || 0);
  const excused = (counts.excused || 0);
  const noAnswer = (counts.pending || 0) + (counts.called || 0);

  return (
    <div className="cr-backdrop" onClick={onClose}>
      <div className="cr-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="cr-close" onClick={onClose} aria-label="Закрыть">✕</button>

        <div className="cr-head">
          <h3>Состав на матч</h3>
          <div className="cr-match">{match.home} — {match.away}</div>
        </div>

        <div className="cr-summary">
          <div className="cr-stat cr-stat--total"><b>{total}</b><span>в призыве</span></div>
          <div className="cr-stat cr-stat--go"><b>{ready}</b><span>идут</span></div>
          <div className="cr-stat cr-stat--no"><b>{declined}</b><span>не идут</span></div>
          <div className="cr-stat cr-stat--excused"><b>{excused}</b><span>уваж.</span></div>
          <div className="cr-stat cr-stat--pending"><b>{noAnswer}</b><span>без ответа</span></div>
        </div>

        {loading && <div className="cr-empty">Загрузка...</div>}
        {err && <div className="cr-err">{err}</div>}

        {!loading && (
          <>
            <div className="cr-actions">
              <button
                className="cr-call-all"
                disabled={busy === 'call-all'}
                onClick={handleCallAll}
              >
                {busy === 'call-all' ? 'Отправляем...' : '📞 Вызвать всех'}
              </button>
            </div>

            <div className="cr-list">
              <div className="cr-section-title">В призыве ({roster.length})</div>
              {roster.map((r) => {
                const meta = STATUS_LABELS[r.status] || STATUS_LABELS.pending;
                return (
                  <div key={r.playerId} className={`cr-row cr-row--${meta.cls}`}>
                    <div className="cr-player">
                      {r.playerNumber != null && <b>{r.playerNumber}</b>}
                      <span>{r.playerName}</span>
                    </div>
                    <div className="cr-status">
                      <span className="cr-status-icon">{meta.icon}</span>
                      <span>{meta.label}</span>
                    </div>
                    <div className="cr-row-actions">
                      <select
                        value={r.status}
                        disabled={busy === 'set-' + r.playerId}
                        onChange={(e) => handleSetStatus(r.playerId, e.target.value)}
                      >
                        <option value="called">Вызван</option>
                        <option value="confirmed">Идёт</option>
                        <option value="declined">Не идёт</option>
                        <option value="excused">Уваж.</option>
                      </select>
                      <button
                        className="cr-remove"
                        disabled={busy === 'rem-' + r.playerId}
                        onClick={() => handleRemove(r.playerId)}
                        title="Убрать из призыва"
                      >×</button>
                    </div>
                  </div>
                );
              })}

              {notIn.length > 0 && (
                <>
                  <div className="cr-section-title">Не в призыве ({notIn.length})</div>
                  {notIn.map((p) => (
                    <div key={p.id} className="cr-row cr-row--out">
                      <div className="cr-player">
                        {p.number != null && <b>{p.number}</b>}
                        <span>{p.fullName}</span>
                      </div>
                      <div className="cr-status">—</div>
                      <div className="cr-row-actions">
                        <button
                          className="cr-add"
                          disabled={busy === 'add-' + p.id}
                          onClick={() => handleAddPlayer(p.id)}
                        >+ Добавить</button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
