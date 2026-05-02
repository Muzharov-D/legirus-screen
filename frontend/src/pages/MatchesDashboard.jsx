import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchMatches, fetchTeams, fetchMatch } from '../services/api';
import MatchList from '../components/MatchList';
import PdfUploadDialog from '../components/PdfUploadDialog';
import PlayerPhoto from '../components/PlayerPhoto';
import RatingPill from '../components/RatingPill';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import './MatchesDashboard.css';

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.value !== undefined) return Number(v.value);
    if (v.pct !== undefined) return Number(v.pct);
    return null;
  }
  return Number(v);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function MatchesDashboard() {
  const navigate = useNavigate();
  const { user, canSeePlayer } = useAuth();
  const { selectedTeamId, selectedTeam } = useTeam();
  const canUpload = user?.role === 'head_coach' || user?.role === 'team_coach';
  const matchesRes = useApi(() => fetchMatches(selectedTeamId), [selectedTeamId]);
  const teamsRes = useApi(fetchTeams, []);
  const [uploadOpen, setUploadOpen] = useState(false);

  const matches = matchesRes.data?.matches || [];
  const teams = teamsRes.data?.teams || [];
  const ourTeam = selectedTeam || teams.find((t) => t.id === selectedTeamId) || teams.find((t) => t.isOurTeam);
  const lastMatchEntry = matches[0] || null;
  const lastMatchRes = useApi(
    () => (lastMatchEntry?.id ? fetchMatch(lastMatchEntry.id) : Promise.resolve(null)),
    [lastMatchEntry?.id]
  );
  const lastMatch = lastMatchRes.data;

  const totalGames = matches.length;
  const goalsFor = matches.reduce((s, m) =>
    s + (m.homeTeamId === ourTeam?.id ? m.score?.home || 0 : m.score?.away || 0), 0);
  const goalsAgainst = matches.reduce((s, m) =>
    s + (m.homeTeamId === ourTeam?.id ? m.score?.away || 0 : m.score?.home || 0), 0);
  const cleanSheets = matches.filter((m) =>
    (m.homeTeamId === ourTeam?.id ? m.score?.away : m.score?.home) === 0).length;
  const avgGoals = totalGames ? (goalsFor / totalGames).toFixed(2) : '—';

  // Сезон — берём из первого матча
  const season = matches[0]?.season || '2025-2026';

  const topScorers = useMemo(() => {
    if (!lastMatch?.players) return [];
    return [...lastMatch.players]
      .map((p) => ({ player: p, goals: num(p.stats?.attack4?.goal) || 0, assists: num(p.stats?.attack1?.assist) || 0 }))
      .filter((r) => r.goals > 0 || r.assists > 0)
      .sort((a, b) => (b.goals * 10 + b.assists) - (a.goals * 10 + a.assists))
      .slice(0, 3);
  }, [lastMatch]);

  return (
    <div className="page matches-dashboard">
      {/* Season hero */}
      <div className="matches-dashboard__hero">
        <div className="matches-dashboard__hero-text">
          <div className="matches-dashboard__hero-eyebrow">Сезон</div>
          <h1 className="matches-dashboard__hero-title">{season}</h1>
          <div className="matches-dashboard__hero-sub">
            ФК {ourTeam?.name?.toUpperCase() || 'Легирус 2010'} · {totalGames} матч{totalGames === 1 ? '' : 'ей'} разобран{totalGames === 1 ? '' : 'о'}
          </div>
        </div>
        {canUpload && (
          <button className="matches-dashboard__upload" onClick={() => setUploadOpen(true)}>
            + Загрузить отчёт Sportvisor
          </button>
        )}
      </div>

      <div className="matches-dashboard__grid">
        <aside className="matches-dashboard__col-left">
          <MatchList matches={matches} teams={teams} />
        </aside>

        <section className="matches-dashboard__col-right">
          {/* Сводка последнего матча */}
          {lastMatch && (
            <div className="card matches-dashboard__last">
              <div className="page-section-title">Сводка последнего матча</div>
              <div className="matches-dashboard__last-body">
                <div className="matches-dashboard__last-date">{fmtDate(lastMatch.date)}</div>
                <div className="matches-dashboard__last-teams">
                  <div className="matches-dashboard__last-team">
                    <img src="/assets/logos/legirus.png" alt="" />
                    <span>{lastMatch.homeTeam?.name?.replace(/ 20\d{2}$/, '') || 'Легирус'}</span>
                  </div>
                  <div className="matches-dashboard__last-score">
                    <span className={lastMatch.score?.home > lastMatch.score?.away ? 'win' : ''}>{lastMatch.score?.home}</span>
                    <span className="sep">:</span>
                    <span className={lastMatch.score?.away > lastMatch.score?.home ? 'win' : ''}>{lastMatch.score?.away}</span>
                  </div>
                  <div className="matches-dashboard__last-team away">
                    <span>{lastMatch.awayTeam?.name?.replace(/ 20\d{2}$/, '') || 'Соперник'}</span>
                    <div className="matches-dashboard__last-placeholder">?</div>
                  </div>
                </div>
                <button
                  className="matches-dashboard__last-btn"
                  onClick={() => navigate(`/matches/${lastMatch.id}`)}
                >
                  Открыть детали матча →
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <div className="page-section-title">Информация по сезону</div>
            <div className="matches-dashboard__season">
              <SeasonStat label="Всего матчей"            value={totalGames} />
              <SeasonStat label="Забитые голы"            value={goalsFor} />
              <SeasonStat label="Пропущенные голы"        value={goalsAgainst} />
              <SeasonStat label="Среднее голов за игру"   value={avgGoals} />
              <SeasonStat label="Сухие матчи"             value={cleanSheets} />
              <SeasonStat label="Игроков на поле"         value={11} />
            </div>
          </div>

          {/* Топ-3 бомбардира */}
          {topScorers.length > 0 && (
            <div className="card">
              <div className="page-section-title">Топ-3 бомбардира сезона</div>
              <div className="matches-dashboard__scorers">
                {topScorers.map(({ player, goals, assists }, i) => {
                  const unlocked = canSeePlayer(player.id);
                  return (
                  <div
                    key={player.id}
                    className={'scorer-row' + (unlocked ? '' : ' scorer-row--locked')}
                    onClick={() => { if (unlocked) navigate(`/players/${player.id}`); }}
                    title={unlocked ? '' : 'Доступно только тренеру'}
                  >
                    <span className="scorer-row__rank">{i + 1}</span>
                    <PlayerPhoto player={player} size={42} />
                    <div className="scorer-row__info">
                      <div className="scorer-row__name">{player.fullName}</div>
                      <div className="scorer-row__pos">№{player.number} · {player.positionFull || player.position}</div>
                    </div>
                    <div className="scorer-row__stats">
                      <span><b>{goals}</b> Г</span>
                      <span><b>{assists}</b> А</span>
                    </div>
                    <RatingPill value={player.ratings?.overall} size="sm" />
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {canUpload && (
            <div className="card">
              <div className="page-section-title">Подсказка</div>
              <div className="matches-dashboard__hint">
                Нажмите кнопку <b>«Загрузить отчёт Sportvisor»</b>, чтобы добавить новый матч. Парсер автоматически извлечёт командные показатели, индивидуальные метрики (105 на игрока) и тематические карты.
              </div>
            </div>
          )}
        </section>
      </div>

      {uploadOpen && (
        <PdfUploadDialog
          onClose={() => setUploadOpen(false)}
          onSuccess={() => window.location.reload()}
        />
      )}
    </div>
  );
}

function SeasonStat({ label, value }) {
  return (
    <div className="season-stat">
      <div className="season-stat__value">{value}</div>
      <div className="season-stat__label">{label}</div>
    </div>
  );
}
