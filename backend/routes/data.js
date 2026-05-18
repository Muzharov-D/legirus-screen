import express from 'express';
import {
  loadTeams,
  loadPlayers,
  loadPlayer,
  loadMetrics,
  loadMatchesIndex,
  loadMatch,
  loadStandings,
  listStandings,
  loadCup,
  listCup,
  loadCalendar,
  listCalendar,
} from '../services/dataRepo.js';
import { query, isPgEnabled } from '../db/pool.js';
import { notifyCoachComment } from '../services/matchNotifications.js';
import { refreshAge, refreshAll } from '../services/standingsService.js';
import { refreshCupAge, refreshCupAll } from '../services/cupService.js';
import { refreshCalendarAge, refreshCalendarAll } from '../services/calendarService.js';

const router = express.Router();

// Browser-side cache (private — НЕ CDN, чтобы не утекли данные между
// юзерами с разными ролями). Для GET'ов с большим JSON и медленной
// PG-выборкой (match/:id, matches, players, standings) браузер
// переиспользует ответ в течение TTL — мгновенная навигация назад/вперёд.
// stale-while-revalidate даёт фоновую ревалидацию без блокировки.
function browserCache(res, ttlSec = 30, swrSec = 120) {
  res.setHeader('Cache-Control', `private, max-age=${ttlSec}, stale-while-revalidate=${swrSec}`);
}

// Команды клуба. head_coach видит весь список, остальные — только свою.
router.get('/teams', async (req, res) => {
  try {
    const all = await loadTeams();
    if (req.user?.role === 'head_coach') return res.json(all);
    if (!req.user?.teamId) return res.json({ ...all, teams: [] });
    const filtered = {
      ...all,
      teams: (all.teams || []).filter((t) => t.id === req.user.teamId),
    };
    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Список игроков — фильтр по teamId / роли.
// Игрок попадает в команду если она его primary (team_id) или указана в extra_teams
// (кейс: играет на год старше — заявка в одной возрастной группе, играет в другой).
function inTeam(p, teamId) {
  if (!teamId) return true;
  if (p.teamId === teamId) return true;
  if (Array.isArray(p.extraTeams) && p.extraTeams.includes(teamId)) return true;
  return false;
}

router.get('/players', async (req, res) => {
  try {
    const all = await loadPlayers();
    const requestedTeamId = req.query.teamId;

    if (req.user?.role === 'head_coach') {
      const players = requestedTeamId
        ? (all.players || []).filter((p) => inTeam(p, requestedTeamId))
        : all.players;
      return res.json({ players });
    }

    // Игрок и team_coach видят свою команду. Player не получает доступ к
    // топам/сравнениям других (route guards /players, /players/rating,
    // /analytics блокируют это на фронте), но team-данные нужны для
    // FormationField (фото, имена, рейтинги соседей на поле), ростера
    // команды и percentile в PizzaChart. Рейтинг — субъективная вещь,
    // эти данные о команде игроку показать можно.
    const ownTeamId = req.user?.teamId;
    if (!ownTeamId) return res.json({ players: [] });
    const players = (all.players || []).filter((p) => inTeam(p, ownTeamId));
    browserCache(res, 30, 120);
    res.json({ players });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Один игрок по id (с проверкой прав по роли).
// Используется на странице игрока для определения teamId, чтобы корректно
// подгрузить матчи нужной команды (head_coach может смотреть профиль игрока
// другой команды клуба).
router.get('/player/:playerId', async (req, res) => {
  try {
    const player = await loadPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });

    if (req.user?.role === 'head_coach') return res.json({ player });

    if (req.user?.role === 'team_coach') {
      if (player.teamId !== req.user.teamId) {
        return res.status(403).json({ error: 'Игрок другой команды' });
      }
      return res.json({ player });
    }

    if (req.user?.role === 'player') {
      // Игрок видит только своих по команде
      if (player.teamId !== req.user.teamId) {
        return res.status(403).json({ error: 'Игрок другой команды' });
      }
      return res.json({ player });
    }

    return res.status(403).json({ error: 'Доступ запрещён' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/metrics', async (_req, res) => {
  try { res.json(await loadMetrics()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Список матчей — фильтр по teamId / роли.
async function enrichMatch(m) {
  if (m.homeTeamName && m.awayTeamName) return m;
  try {
    const detail = await loadMatch(m.id);
    return {
      ...m,
      homeTeamName: m.homeTeamName || detail?.homeTeam?.name || null,
      awayTeamName: m.awayTeamName || detail?.awayTeam?.name || null,
      tournament: m.tournament || 'league',
    };
  } catch (_e) {
    return { ...m, tournament: m.tournament || 'league' };
  }
}

router.get('/matches', async (req, res) => {
  try {
    const all = await loadMatchesIndex();
    const requestedTeamId = req.query.teamId;

    let matches;
    if (req.user?.role === 'head_coach') {
      matches = requestedTeamId
        ? (all.matches || []).filter((m) => m.teamId === requestedTeamId)
        : (all.matches || []);
    } else {
      const ownTeamId = req.user?.teamId;
      if (!ownTeamId) return res.json({ matches: [] });
      matches = (all.matches || []).filter((m) => m.teamId === ownTeamId);
    }

    const enriched = await Promise.all(matches.map(enrichMatch));
    browserCache(res, 30, 120);
    res.json({ matches: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/match/:matchId', async (req, res) => {
  try {
    const match = await loadMatch(req.params.matchId);

    // Проверка доступа по команде. head_coach — всё; team_coach/player — только свою.
    if (req.user?.role !== 'head_coach') {
      if (!req.user?.teamId || match.teamId !== req.user.teamId) {
        return res.status(403).json({ error: 'Матч недоступен' });
      }
    }

    if (req.user?.role === 'player') {
      // Игрок видит всех игроков команды (нужно для PizzaChart percentile
      // — «vs игроки команды»), но у чужих обрезаем приватные поля:
      // splits / radar / maps. Свои собственные данные — полностью.
      // Без этого pizza-chart считал percentile vs 1 человека (= он сам)
      // и был бессмысленным.
      const ownId = req.user.playerId;
      const sanitize = (p) => {
        if (p.id === ownId) return p;
        const { splits, radar, maps, ...publicFields } = p;
        return publicFields;
      };
      const filtered = {
        ...match,
        players: (match.players || []).map(sanitize),
        _filteredFor: ownId,
      };
      browserCache(res, 30, 120);
      return res.json(filtered);
    }

    browserCache(res, 30, 120);
    res.json(match);
  } catch (e) {
    res.status(404).json({ error: `Матч ${req.params.matchId} не найден` });
  }
});

// Пост-матчевый комментарий тренера — сохраняем в calendar.coach_comment.
// Видят родители в публичной модалке. Редактируют тренеры (head_coach / team_coach).
router.patch('/match/:age/:extMatchId/comment', async (req, res) => {
  try {
    if (!['head_coach', 'team_coach'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ только для тренеров' });
    }
    if (!isPgEnabled()) {
      return res.status(503).json({ error: 'Сервис временно недоступен' });
    }
    const { age, extMatchId } = req.params;
    const raw = req.body?.comment;
    const comment = (raw == null) ? null : String(raw).trim();
    const value = comment && comment.length > 0 ? comment.slice(0, 4000) : null;

    const r = await query(
      `UPDATE calendar SET coach_comment = $1
         WHERE club_id = 'legirus' AND age_group = $2 AND ext_match_id = $3
       RETURNING coach_comment, home_team, away_team`,
      [value, age, extMatchId],
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ error: 'Матч не найден' });
    }
    const row = r.rows[0];
    res.json({ ok: true, coachComment: row.coach_comment });

    // Триггер push: только при сохранении непустого комментария.
    // notif_log дедуп — повторное «Сохранить» того же текста не разошлёт второй пуш
    // (UNIQUE на scope+scope_id = match-coach-comment + ext_match_id).
    if (value) {
      notifyCoachComment({
        clubId: 'legirus', ageGroup: age, extMatchId,
        homeTeam: row.home_team, awayTeam: row.away_team,
        excerpt: value,
      }).catch((e) => console.error('[notify] coach-comment failed:', e.message));
    }
    return;
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Турнирная таблица возрастной группы (Клубный зачёт)
router.get('/standings/:ageGroup', async (req, res) => {
  try {
    const data = await loadStandings(req.params.ageGroup);
    if (!data) return res.status(404).json({ error: `Таблица для возраста ${req.params.ageGroup} ещё не загружена` });
    browserCache(res, 60, 300);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/standings', async (_req, res) => {
  try {
    res.json({ ageGroups: await listStandings() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ручное переобновление таблицы (только для тренеров) — полезно после правки конфига
router.post('/standings/:ageGroup/refresh', async (req, res) => {
  try {
    if (!['head_coach', 'team_coach'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ только для тренеров' });
    }
    const data = await refreshAge(req.params.ageGroup);
    res.json({ ok: true, ageGroup: req.params.ageGroup, teams: data.table.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/standings/refresh', async (req, res) => {
  try {
    if (req.user?.role !== 'head_coach') {
      return res.status(403).json({ error: 'Доступ только для главного тренера' });
    }
    const results = await refreshAll();
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Кубковая сетка возрастной группы
router.get('/cup/:ageGroup', async (req, res) => {
  try {
    const data = await loadCup(req.params.ageGroup);
    if (!data) return res.status(404).json({ error: `Сетка кубка для возраста ${req.params.ageGroup} ещё не загружена` });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/cup', async (_req, res) => {
  try {
    res.json({ ageGroups: await listCup() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/cup/:ageGroup/refresh', async (req, res) => {
  try {
    if (!['head_coach', 'team_coach'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ только для тренеров' });
    }
    const data = await refreshCupAge(req.params.ageGroup);
    res.json({ ok: true, ageGroup: req.params.ageGroup, rounds: data.rounds.length, parseHint: data.parseHint });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/cup/refresh', async (req, res) => {
  try {
    if (req.user?.role !== 'head_coach') {
      return res.status(403).json({ error: 'Доступ только для главного тренера' });
    }
    const results = await refreshCupAll();
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Календарь сезона возрастной группы
router.get('/calendar/:ageGroup', async (req, res) => {
  try {
    const data = await loadCalendar(req.params.ageGroup);
    if (!data) return res.status(404).json({ error: `Календарь для возраста ${req.params.ageGroup} ещё не загружен` });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/calendar', async (_req, res) => {
  try {
    res.json({ ageGroups: await listCalendar() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/calendar/:ageGroup/refresh', async (req, res) => {
  try {
    if (!['head_coach', 'team_coach'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ только для тренеров' });
    }
    const data = await refreshCalendarAge(req.params.ageGroup);
    res.json({ ok: true, ageGroup: req.params.ageGroup, matches: data.matches.length, hint: data.parserHint });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/calendar/refresh', async (req, res) => {
  try {
    if (req.user?.role !== 'head_coach') {
      return res.status(403).json({ error: 'Доступ только для главного тренера' });
    }
    const results = await refreshCalendarAll();
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
