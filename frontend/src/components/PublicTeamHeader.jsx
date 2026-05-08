// Flashscore-style шапка для public-страницы:
//   [лого АванDата] -- [U17/U16/U15/U14 + дивизион] -- [лого Легируса]
// Лого АванDата — clickable → TG канал.
// Под шапкой — горизонтальный селектор возрастов + блоки позиции в лиге/клубном зачёте.

import { useNavigate } from 'react-router-dom';
import { AGE_GROUPS, tierForAge, leaguePosClass, clubPosClass } from '../utils/ageRating';
import './PublicTeamHeader.css';

const TG_AVANDATA = 'https://t.me/AvanData';

export default function PublicTeamHeader({
  age,
  divisionName,        // например "Дивизион 2"
  ourLeagueRow,        // запись из standings.table с pos/points/wins/draws/losses
  clubRank,            // { ourClubRank, ourClubStats, totalClubs }
  onOpenLeague,        // callback: открыть StandingsModal в режиме 'league'
  onOpenClub,          // callback: открыть в режиме 'club'
}) {
  const navigate = useNavigate();
  const tier = tierForAge(age);

  return (
    <header className="public-header">
      {/* Top row — две команды + центральный divider */}
      <div className="public-header__row">
        {/* Слева — АванDата (платформа) */}
        <a
          className="public-header__brand public-header__brand--platform"
          href={TG_AVANDATA}
          target="_blank"
          rel="noreferrer"
          title="Канал АванDата в Telegram"
        >
          <img
            src="/assets/logos/avandata.png"
            onError={(e) => { e.currentTarget.src = '/assets/logos/log-3_white.png'; }}
            alt="АванDата"
            className="public-header__logo public-header__logo--platform"
          />
          <div className="public-header__brand-meta">
            <div className="public-header__brand-name">АванDата</div>
            <div className="public-header__brand-sub">Telegram&nbsp;↗</div>
          </div>
        </a>

        {/* Центр — турнирная категория + дивизион */}
        <div className="public-header__center">
          <div className="public-header__tier">{tier}</div>
          {divisionName && <div className="public-header__division">{divisionName}</div>}
        </div>

        {/* Справа — Легирус (клуб) */}
        <button
          type="button"
          className="public-header__brand public-header__brand--club"
          onClick={() => onOpenClub && onOpenClub()}
          title="Профиль клуба"
        >
          <div className="public-header__brand-meta public-header__brand-meta--right">
            <div className="public-header__brand-name">ФК&nbsp;Легирус</div>
            <div className="public-header__brand-sub">{age}&nbsp;г.р.</div>
          </div>
          <img
            src="/assets/logos/legirus.png"
            alt="ФК Легирус"
            className="public-header__logo public-header__logo--club"
          />
        </button>
      </div>

      {/* Возрастной свитчер — все 4 команды */}
      <nav className="public-header__age-switcher" aria-label="Выбор команды">
        {AGE_GROUPS.map((a) => (
          <button
            key={a}
            type="button"
            className={`public-header__age-btn ${a === String(age) ? 'is-active' : ''}`}
            onClick={() => navigate(`/public/team/${a}`)}
          >
            <span className="public-header__age-tier">{tierForAge(a)}</span>
            <span className="public-header__age-year">{a}</span>
          </button>
        ))}
      </nav>

      {/* Ранг-блоки: лига и клубный зачёт */}
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
                {clubRank.ourClubStats?.points} очк · из {clubRank.totalClubs}
              </small>
            </div>
          </button>
        )}
      </div>
    </header>
  );
}
