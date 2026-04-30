import { loadMatch, loadAgentRules, loadPlayers } from './dataLoader.js';

function fmt(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] === undefined || vars[k] === null ? '—' : String(vars[k])
  );
}

function getMaxOverallPlayer(match) {
  return match.players
    .filter((p) => p.ratings)
    .reduce((best, p) =>
      !best || (p.ratings.overall ?? 0) > (best.ratings.overall ?? 0) ? p : best
    , null);
}

function findPlayer(match, playerId) {
  return match.players.find((p) => p.id === playerId);
}

export function generateInsight({ screenId, context = {} }) {
  const rules = loadAgentRules();
  const rule = rules[screenId] || rules.default;
  if (!rule) {
    return {
      important: 'Нет данных для анализа экрана.',
      meaning: 'Правила агента для этого экрана не заданы.',
      nextStep: { label: 'К матчам', screen: 'match-initial' },
    };
  }

  const matchId = context.matchId || 'match-001';
  let match = null;
  try { match = loadMatch(matchId); } catch (_) { match = null; }

  // build evaluation context
  const vars = { ...context };
  if (match) {
    vars.scoreHome = match.score?.home;
    vars.scoreAway = match.score?.away;
    vars.possession = match.teamSummaryStats?.home?.possessionPct;
    vars.shots = match.teamSummaryStats?.home?.shots?.total;
    vars.xgHome = match.teamSummaryStats?.home?.expectedGoals;
    vars.xgAway = match.teamSummaryStats?.away?.expectedGoals;
    vars.passes = match.teamSummaryStats?.home?.passes?.total;
    vars.teamOverall = match.teamAvgRatings?.overall;

    const motm = getMaxOverallPlayer(match);
    if (motm) {
      vars.motmName = motm.fullName;
      vars.motmRating = motm.ratings.overall;
      vars.motmPosition = motm.positionFull;
    }

    if (context.playerId) {
      const player = findPlayer(match, context.playerId);
      if (player) {
        vars.playerName = player.fullName;
        vars.playerRating = player.ratings?.overall;
        vars.playerPosition = player.positionFull;
        vars.minutes = player.minutes;
        const sprintMatch = player.splits?.['Sprint forward']?.match;
        const sprintFirst = player.splits?.['Sprint forward']?.first;
        const sprintSecond = player.splits?.['Sprint forward']?.second;
        vars.sprintFirst = sprintFirst;
        vars.sprintSecond = sprintSecond;
        const goalFirst = player.splits?.Goal?.first;
        const goalSecond = player.splits?.Goal?.second;
        vars.goalFirst = goalFirst;
        vars.goalSecond = goalSecond;
      }
    }
  }

  return {
    important: fmt(rule.important, vars),
    meaning: fmt(rule.meaning, vars),
    nextStep: rule.nextStep
      ? { label: fmt(rule.nextStep.label, vars), screen: rule.nextStep.screen }
      : null,
  };
}
