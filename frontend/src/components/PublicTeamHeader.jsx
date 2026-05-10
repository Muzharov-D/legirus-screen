// Шапка public-страницы:
//   [длинный лого АванDата]  ——  [ФК Легирус U17 + щит + «+»]
// Левый блок — clickable → TG-канал АванDата.
// Правый блок — название клуба, тир (U11..U19) и щит Легируса.
// Под шапкой — горизонтальные табы команд из myTeams (если >1) + ранг-блоки.
// Кнопка «+» открывает AddTeamSheet с двумя страницами (Младшие / Старшие).

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tierForAge, leaguePosClass, clubPosClass, displayAge } from '../utils/ageRating';
import { useMyTeams, switchActive, removeTeam } from '../utils/myTeams';
import AddTeamSheet from './AddTeamSheet';
import './PublicTeamHeader.css';

const TG_AVANDATA = 'https://t.me/AvanData';

export default function PublicTeamHeader({
  age,
  ourLeagueRow,
  clubRank,
  onOpenLeague,
  onOpenClub,
}) {
  const navigate = useNavigate();
  const tier = tierForAge(age);
  const { teams: myTeams } = useMyTeams();
  const [sheetOpen, setSheetOpen] = useState(false);

  function tabClick(targetAge) {
    if (String(targetAge) === String(age)) return;
    switchActive(targetAge);
    navigate(`/public/team/${targetAge}`);
  }

  // Удалить активную команду без подтверждения и сразу перейти на следующую.
  // Если активная была единственной — навигация на лендинг (/).
  function removeActive() {
    removeTeam(String(age));
    // removeTeam внутри уже сделает switchActive на первую оставшуюся (или null)
    setTimeout(() => {
      const first = JSON.parse(localStorage.getItem('legirus.public.myTeams') || '[]')[0];
      if (first) navigate(`/public/team/${first}`, { replace: true });
      else navigate('/', { replace: true });
    }, 0);
  }

  return (
    <header className="public-header">
      <div className="public-header__row">
        {/* Слева — лого АванData (clickable → TG канал) */}
        <a
          className="public-header__platform"
          href={TG_AVANDATA}
          target="_blank"
          rel="noreferrer"
          title="Канал АванDата в Telegram"
        >
          <img
            src="/icons/avandata.png"
            onError={(e) => { e.currentTarget.src = '/assets/logos/log-3_white.png'; }}
            alt="АванDата"
            className="public-header__platform-logo"
          />
        </a>

        {/* Справа — клуб (название + тир + щит) */}
        <button
          type="button"
          className="public-header__club"
          onClick={() => onOpenClub && onOpenClub()}
          title="Профиль клуба"
        >
          <div className="public-header__club-text">
            <div className="public-header__club-name">ФК&nbsp;Легирус</div>
            <div className="public-header__club-tier">{tier}</div>
          </div>
          <img
            src="/icons/legirus.png"
            onError={(e) => { e.currentTarget.src = '/assets/logos/legirus.png'; }}
            alt="ФК Легирус"
            className="public-header__club-logo"
          />
        </button>
      </div>

      {/* ───── Табы личного набора команд ───── */}
      <nav className="public-header__myteams" aria-label="Мои команды">
        {myTeams.map((t) => (
          <button
            key={t}
            type="button"
            className={'public-header__myteam' + (String(t) === String(age) ? ' is-active' : '')}
            onClick={() => tabClick(t)}
            title={t === String(age) ? 'Активная команда' : `Переключиться на ${displayAge(t)}`}
          >
            <span className="public-header__myteam-tier">{tierForAge(t)}</span>
            <span className="public-header__myteam-year">{displayAge(t)}</span>
          </button>
        ))}

        <button
          type="button"
          className="public-header__addbtn"
          onClick={() => setSheetOpen(true)}
          aria-label="Добавить или переключить команду"
          title="Добавить ещё одну команду"
        >
          +
        </button>

        {myTeams.length > 1 && (
          <button
            type="button"
            className="public-header__rmbtn"
            onClick={removeActive}
            aria-label="Убрать активную команду из избранного"
            title={`Убрать ${displayAge(age)} из избранного`}
          >
            −
          </button>
        )}
      </nav>

      <div className="public-header__ranks">
        {ourLeagueRow && (
          <button
            type="button"
            className={`public-header__rank ${leaguePosClass(ourLeagueRow.pos)}`}
            onClick={onOpenLeague}
            title="Открыть таблицу лиги"
          >
            <div className="public-header__rank-pos">
              {ourLeagueRow.pos}
              {ourLeagueRow.pos <= 3 && (
                <span className="public-header__rank-medal">
                  {ourLeagueRow.pos === 1 ? '🥇' : ourLeagueRow.pos === 2 ? '🥈' : '🥉'}
                </span>
              )}
            </div>
            <div className="public-header__rank-meta">
              в лиге {tier}
              <small>
                {ourLeagueRow.points} очк · {ourLeagueRow.wins}-{ourLeagueRow.draws}-{ourLeagueRow.losses}
              </small>
            </div>
          </button>
        )}
        {clubRank?.ourClubRank && (
          <button
            type="button"
            className={`public-header__rank public-header__rank--club ${clubPosClass(clubRank.ourClubRank)}`}
            onClick={onOpenClub}
            title="Открыть клубный зачёт"
          >
            <div className="public-header__rank-pos">
              {clubRank.ourClubRank}
              {clubRank.ourClubRank <= 2 && (
                <span className="public-header__rank-medal">
                  {clubRank.ourClubRank === 1 ? '🥇' : '🥈'}
                </span>
              )}
            </div>
            <div className="public-header__rank-meta">
              клубный зачёт
              <small>
                {clubRank.ourClubStats?.points} очк
                {typeof clubRank.ourClubStats?.wins === 'number' && (
                  <> · {clubRank.ourClubStats.wins}-{clubRank.ourClubStats.draws ?? 0}-{clubRank.ourClubStats.losses ?? 0}</>
                )}
              </small>
            </div>
          </button>
        )}
      </div>

      {/* Bottom sheet выбора команды */}
      <AddTeamSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </header>
  );
}
