// Шапка public-страницы:
//   [длинный лого АванDата] ←------ воздух ------→ [ФК Легирус U17 + щит]
// Левый блок — clickable → TG-канал АванDата.
// Правый блок — название клуба, тир (U17/U16/U15/U14) и щит Легируса.
// Под шапкой — возрастной свитчер и ранг-блоки.

import { useNavigate } from 'react-router-dom';
import { AGE_GROUPS, tierForAge, leaguePosClass, clubPosClass } from '../utils/ageRating';
import './PublicTeamHeader.css';

const TG_AVANDATA = 'https://t.me/AvanData';

// Реверс возрастов: младший → старший (U14 первый)
const AGE_GROUPS_REV = [...AGE_GROUPS].reverse();

export default function PublicTeamHeader({
  age,
  ourLeagueRow,
  clubRank,
  onOpenLeague,
  onOpenClub,
}) {
  const navigate = useNavigate();
  const tier = tierForAge(age);

  return (
    <header className="public-header">
      <div className="public-header__row">
        {/* Слева — длинный лого АванDата (clickable → TG канал) */}
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

      <nav className="public-header__age-switcher" aria-label="Выбор команды">
        {AGE_GROUPS_REV.map((a) => (
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
