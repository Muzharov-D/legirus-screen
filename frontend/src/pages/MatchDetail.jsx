import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fetchMatch, fetchPlayers } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import SectionTabs from '../components/SectionTabs';
import FormationField from '../components/FormationField';
import StatCompareBar from '../components/StatCompareBar';
import DonutComparisonCard from '../components/DonutComparisonCard';
import PlayerPhoto from '../components/PlayerPhoto';
import RatingPill from '../components/RatingPill';
import RatingCard from '../components/RatingCard';
import SoccerFieldImageMap from '../components/SoccerFieldImageMap';
import './MatchDetail.css';

const TABS = [
  { id: 'overall', label: 'Общее' },
  { id: 'mine', label: 'Моя команда' },
];

const SECTION_MAPS = [
  { id: 'shooting',              title: 'Удары' },
  { id: 'setPieces',             title: 'Стандарты' },
  { id: 'passes',                title: 'Передачи' },
  { id: 'attacks',               title: 'Атаки' },
  { id: 'recoveriesAndTackling', title: 'Отборы и возвраты' },
  { id: 'duels',                 title: 'Единоборства' },
  { id: 'pressing',              title: 'Прессинг' },
  { id: 'positioning',           title: 'Оборона' },
];

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.value !== undefined) return Number(v.value);
    if (v.pct !== undefined) return Number(v.pct);
    return null;
  }
  return Number(v);
}

function bestPlayer(match) {
  if (!match?.players?.length) return null;
  return [...match.players].sort(
    (a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0)
  )[0];
}

function topByMetric(players, getter, n = 3) {
  return [...players]
    .map((p) => ({ player: p, value: num(getter(p)) || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
    .filter((r) => r.value > 0);
}

export default function MatchDetail() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overall');

  const { selectedTeamId } = useTeam();
  const matchRes = useApi(() => fetchMatch(matchId), [matchId]);
  const playersRes = useApi(() => fetchPlayers(selectedTeamId), [selectedTeamId]);

  const match = matchRes.data;
  const players = playersRes.data?.players || [];
  const home = match?.teamSummaryStats?.home || {};
  const away = match?.teamSummaryStats?.away || {};
  const ta = match?.teamAggregates || {};
  const motm = bestPlayer(match);
  const teamRatings = match?.teamAvgRatings || {};

  const attackingActions = useMemo(() => {
    const pos = ta.attacks?.positional?.withShot || 0;
    const cnt = ta.attacks?.counterattacks?.withShot || 0;
    return pos + cnt;
  }, [ta]);

  const topGoals = useMemo(() => topByMetric(match?.players || [], (p) => p.stats?.attack4?.goal), [match]);
  const topAssists = useMemo(() => topByMetric(match?.players || [], (p) => p.stats?.attack1?.assist), [match]);
  const topTackles = useMemo(() => topByMetric(match?.players || [], (p) => p.stats?.defence1?.tackle), [match]);

  if (matchRes.error) return <div className="empty-state">Ошибка: {matchRes.error.message}</div>;
  if (!match) return <div className="empty-state">Загрузка матча…</div>;

  return (
    <div className="page match-detail">
      <div className="match-detail__topbar">
        <button className="match-detail__back" onClick={() => navigate('/matches')}>← К матчам</button>
        <SectionTabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {/* HERO: счёт и команды */}
      <div className="match-detail__hero">
        <div className="match-detail__team match-detail__team--home">
          <img src="/assets/logos/legirus.png" alt="" className="match-detail__team-logo-img" />
          <div className="match-detail__team-name">{match.homeTeam?.name}</div>
        </div>
        <div className="match-detail__score-block">
          <div className="match-detail__date">{fmtDate(match.date)}</div>
          <div className="match-detail__score">
            {match.score?.home}:{match.score?.away}
          </div>
          <div className="match-detail__status">МАТЧ РАЗОБРАН</div>
        </div>
        <div className="match-detail__team match-detail__team--away">
          <div className="match-detail__team-logo team-logo--away">П</div>
          <div className="match-detail__team-name">{match.awayTeam?.name}</div>
        </div>
      </div>

      {/* 4 рейтинга команды */}
      <div className="match-detail__ratings">
        <RatingCard label="Общий" value={teamRatings.overall} />
        <RatingCard label="Фитнес" value={teamRatings.fitness} />
        <RatingCard label="Атака" value={teamRatings.attack} />
        <RatingCard label="Защита" value={teamRatings.defence} />
      </div>

      <div className="match-detail__grid">
        <div className="match-detail__left">
          <FormationField formation={match.formation} players={players} ourTeamName={match.homeTeam?.name} />
          <div className="card guest-placeholder">
            <div className="page-section-title">Состав соперника</div>
            <div className="guest-placeholder__msg">{match.guestTeamPlaceholder || 'Нет данных об игроках команды.'}</div>
            <button className="guest-placeholder__btn" disabled>Назначить игроков</button>
          </div>
        </div>

        <div className="match-detail__center">
          {tab === 'overall' && (
            <div className="card">
              <div className="page-section-title">Командная статистика</div>
              <div className="match-detail__stats">
                <StatCompareBar label="Владение" home={home.possessionPct + '%'} away={away.possessionPct + '%'} />
                <StatCompareBar label="Удары" home={home.shots?.total} away={away.shots?.total} />
                <StatCompareBar label="Удары в створ" home={home.shots?.onTarget} away={away.shots?.onTarget} />
                <StatCompareBar label="xG" home={home.expectedGoals} away={away.expectedGoals} />
                <StatCompareBar label="Передачи" home={home.passes?.total} away={away.passes?.total} />
                <StatCompareBar label="Точные передачи" home={home.passes?.successful} away={away.passes?.successful} />
                <StatCompareBar label="Удары со штрафных" home={home.freeKickShots} away={away.freeKickShots} />
                <StatCompareBar label="Угловые" home={home.corners?.total} away={away.corners?.total} />
                <StatCompareBar label="Нарушения" home={home.fouls} away={away.fouls} />
                <StatCompareBar label="Жёлтые карточки" home={home.yellowCards} away={away.yellowCards} />
                <StatCompareBar label="Красные карточки" home={home.redCards} away={away.redCards} />
                <StatCompareBar label="Офсайды" home={home.offsides} away={away.offsides} />
              </div>
            </div>
          )}

          {tab === 'mine' && (
            <div className="card">
              <div className="page-section-title">Лидеры матча — наша команда</div>
              <div className="match-detail__breakdowns">
                <PlayerBreakdown title="Голы" rows={topGoals} navigate={navigate} />
                <PlayerBreakdown title="Ассисты" rows={topAssists} navigate={navigate} />
                <PlayerBreakdown title="Отборы" rows={topTackles} navigate={navigate} />
              </div>
            </div>
          )}

          <div className="match-detail__donuts">
            <DonutComparisonCard label="Удары в створ" home={home.shots?.onTarget} away={away.shots?.onTarget} />
            <DonutComparisonCard label="Прогрессивные передачи" home={ta.passes?.progressive} away={null} />
            <DonutComparisonCard label="Отборы" home={ta.duels?.totalDuels} away={null} />
            <DonutComparisonCard label="Перехваты" home={ta.positioning?.interceptions} away={null} />
            <DonutComparisonCard label="Атаки с ударом" home={attackingActions} away={null} />
            <DonutComparisonCard label="Кроссы" home={ta.passes?.crosses} away={null} />
          </div>
        </div>

        <div className="match-detail__right">
          {motm && (
            <div className="card best-player" onClick={() => navigate(`/players/${motm.id}`)}>
              <div className="page-section-title">Игрок матча</div>
              <div className="best-player__body">
                <PlayerPhoto player={motm} size={80} />
                <div className="best-player__info">
                  <div className="best-player__name">{motm.fullName}</div>
                  <div className="best-player__pos">№{motm.number} · {motm.positionFull}</div>
                </div>
                <RatingPill value={motm.ratings?.overall} size="xl" />
              </div>
            </div>
          )}
          <button className="card team-aggregates-cta" onClick={() => navigate('/analytics/team')}>
            <div className="page-section-title">Командные дашборды</div>
            <div className="team-aggregates-cta__body">
              9 секций: удары, стандарты, владение, передачи, атаки, отборы, единоборства, прессинг, оборона
              <span className="team-aggregates-cta__arrow">→</span>
            </div>
          </button>

          <div className="card top-scorers">
            <div className="page-section-title">Топ по рейтингу</div>
            {(match.players || [])
              .filter((p) => p.ratings?.overall != null)
              .sort((a, b) => b.ratings.overall - a.ratings.overall)
              .slice(0, 5)
              .map((p) => (
                <div key={p.id} className="top-scorers__row" onClick={() => navigate(`/players/${p.id}`)}>
                  <PlayerPhoto player={p} size={36} />
                  <div className="top-scorers__info">
                    <div className="top-scorers__name">{p.fullName}</div>
                    <div className="top-scorers__pos">{p.positionFull}</div>
                  </div>
                  <RatingPill value={p.ratings.overall} size="sm" />
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Командные карты — 8 секций */}
      <div className="card match-detail__maps-card">
        <div className="page-section-title">Командные карты — 8 секций</div>
        <div className="match-detail__maps-grid">
          {SECTION_MAPS.map((sec) => {
            const map = ta[sec.id]?.mapImage;
            if (!map) return null;
            return (
              <div className="match-detail__map-cell" key={sec.id}>
                <SoccerFieldImageMap src={map} title={sec.title} height={220} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlayerBreakdown({ title, rows, navigate }) {
  return (
    <div className="player-breakdown">
      <div className="player-breakdown__title">{title}</div>
      {rows.length === 0 && <div className="empty-state">Нет данных</div>}
      {rows.map(({ player, value }, i) => (
        <div
          key={player.id}
          className="player-breakdown__row"
          onClick={() => navigate(`/players/${player.id}`)}
        >
          <span className="player-breakdown__rank">{i + 1}</span>
          <PlayerPhoto player={player} size={36} />
          <div className="player-breakdown__info">
            <div className="player-breakdown__name">{player.lastName} {player.firstName?.[0]}.</div>
            <div className="player-breakdown__pos">№{player.number} · {player.position}</div>
          </div>
          <span className="player-breakdown__val">{value}</span>
        </div>
      ))}
    </div>
  );
}
