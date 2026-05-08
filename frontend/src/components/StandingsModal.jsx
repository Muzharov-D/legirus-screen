// Модалка с двумя таблицами: турнир и клубный зачёт.
// Открывается с public-страницы по клику на ранг-блоки.

import { useEffect } from 'react';
import './StandingsModal.css';

function shortName(name) {
  if (!name) return '—';
  return String(name).replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '').trim();
}

export default function StandingsModal({ tab = 'league', onClose, standings, clubRank, age }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="sm-backdrop" onClick={onClose}>
      <div className="sm-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="sm-close" onClick={onClose} aria-label="Закрыть">✕</button>

        {tab === 'league' && standings?.table && (
          <>
            <div className="sm-head">
              <h3>Лига {age}</h3>
              {standings.title && <div className="sm-sub">{standings.title}</div>}
            </div>
            <div className="sm-table-wrap">
              <table className="sm-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="sm-team">Команда</th>
                    <th>И</th>
                    <th>В</th>
                    <th>Н</th>
                    <th>П</th>
                    <th>±</th>
                    <th>О</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.table.map((t) => (
                    <tr key={t.team + (t.pos ?? '')} className={t.isOurClub ? 'sm-row--ours' : ''}>
                      <td className="sm-pos">{t.pos}</td>
                      <td className="sm-team">
                        {t.shield && <img src={t.shield} alt="" />}
                        <span>{shortName(t.team)}</span>
                      </td>
                      <td>{t.games ?? '—'}</td>
                      <td>{t.wins ?? '—'}</td>
                      <td>{t.draws ?? '—'}</td>
                      <td>{t.losses ?? '—'}</td>
                      <td>{(t.scored ?? 0) - (t.missed ?? 0)}</td>
                      <td className="sm-pts"><b>{t.points ?? '—'}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'club' && clubRank?.ranking && (
          <>
            <div className="sm-head">
              <h3>Клубный зачёт</h3>
              <div className="sm-sub">Сумма очков по всем возрастам · {clubRank.totalClubs} клубов</div>
            </div>
            <div className="sm-table-wrap">
              <table className="sm-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="sm-team">Клуб</th>
                    <th>И</th>
                    <th>В</th>
                    <th>Н</th>
                    <th>П</th>
                    <th>±</th>
                    <th>О</th>
                  </tr>
                </thead>
                <tbody>
                  {clubRank.ranking.map((c) => (
                    <tr key={c.name + c.rank} className={c.name.toLowerCase().includes('легирус') ? 'sm-row--ours' : ''}>
                      <td className="sm-pos">{c.rank}</td>
                      <td className="sm-team">
                        {c.shield && <img src={c.shield} alt="" />}
                        <span>{c.name}</span>
                      </td>
                      <td>{c.games}</td>
                      <td>{c.wins}</td>
                      <td>{c.draws}</td>
                      <td>{c.losses}</td>
                      <td>{c.goalsFor - c.goalsAgainst}</td>
                      <td className="sm-pts"><b>{c.points}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
