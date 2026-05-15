// Sprint 5.5+: события матча из FFSPB API.
// Дополняет данные SportVisor PDF — даёт «сразу после игры» базовый протокол:
// голы, карточки, замены. Без замены SportVisor: тактический разбор поверх.
//
// Cron каждые 6h: для каждого нашего сыгранного матча (isPast=TRUE) без events_data —
// тянет /api/matches/{ext_match_id}, нормализует events[], сохраняет в calendar.events_data.

import { isPgEnabled, query } from '../db/pool.js';
import { isFfspbConfigured, getMatch as apiGetMatch } from './ffspbApi.js';

// EventType из FFSPB API (исследование 2026-05-15 на 300 последних матчах +
// сверка с UI stat.ffspb.org):
//   0  — гол с игры
//   1  — автогол (идёт в счёт противнику)
//   2  — гол с пенальти
//   3  — незабитый пенальти
//   4  — жёлтая карточка (обычная, без удаления)
//   5  — красная карточка (прямая)
//   6  — жёлтая карточка из связки «2ЖК → удаление» (обе записи помечаются 6)
//   15 — травма (в comment — записка врача)
// Замены в `events` НЕ приходят — они в match.participatedPlayers[]
// (см. normalizeSubstitutions ниже).
const TYPE_MAP = {
  0:  { kind: 'goal',           icon: '⚽',     label: 'Гол' },
  1:  { kind: 'own_goal',       icon: '🥅',     label: 'Автогол' },
  2:  { kind: 'penalty',        icon: '⚽',     label: 'Гол с пенальти' },
  3:  { kind: 'penalty_missed', icon: '⛔',     label: 'Незабитый пенальти' },
  4:  { kind: 'yellow',         icon: '🟨',     label: 'Жёлтая' },
  5:  { kind: 'red',            icon: '🟥',     label: 'Красная' },
  6:  { kind: 'yellow_to_red',  icon: '🟨→🟥', label: 'Жёлтая (→ удаление)' },
  15: { kind: 'injury',         icon: '🩹',     label: 'Травма' },
};

function normalizeEvent(e, hostId) {
  const meta = TYPE_MAP[e.eventType] || { kind: 'other', icon: '·', label: 'Событие' };
  const teamSide = e.team?.['@id'] === hostId ? 'host' : 'guest';
  const author = e.author || {};
  const profile = (typeof author.member === 'object' && author.member) ? author.member : {};
  const firstName = author.firstName || profile.firstName || '';
  const lastName = author.surname || profile.surname || '';
  const playerName = (lastName + (firstName ? ' ' + firstName.slice(0, 1) + '.' : '')).trim();
  const assist = e.assist || null;
  const assistName = assist ? (assist.surname || '') : null;
  return {
    minute: e.minute ?? null,
    addedTime: e.addedTime || false,
    eventType: e.eventType,
    kind: meta.kind,
    icon: meta.icon,
    label: meta.label,
    team: teamSide,
    playerName: playerName || '—',
    playerId: author['@id']?.split('/').pop() || null,
    assistName: assistName || null,
    comment: e.comment || e.wideComment || '',
  };
}

function normalizeEvents(match) {
  if (!match || !Array.isArray(match.events)) return [];
  const hostId = match.host?.['@id'];
  return match.events.map((e) => normalizeEvent(e, hostId));
}

function shortName(player) {
  if (!player) return '—';
  const last = player.surname || player.member?.surname || '';
  const first = player.firstName || player.member?.firstName || '';
  return (last + (first ? ' ' + first.slice(0, 1) + '.' : '')).trim() || '—';
}

// Замены приходят в FFSPB не как match.events, а как match.participatedPlayers[].
// Каждый PlayerParticipation у УХОДЯЩЕГО игрока содержит:
//   bench: 0|1 (стартовый или с лавки), number, replacedBy: Player, replaceMin: number.
// У вошедшего (того, на кого ссылается replacedBy) данные пустые — replaceMin=0, replacedBy=null.
function normalizeSubstitutions(match) {
  if (!match || !Array.isArray(match.participatedPlayers)) return [];
  const hostId = match.host?.['@id'];
  const byPlayerId = new Map();
  for (const p of match.participatedPlayers) {
    const pid = p.request?.['@id'];
    if (pid) byPlayerId.set(pid, p);
  }
  const subs = [];
  for (const p of match.participatedPlayers) {
    if (!p.replacedBy || !p.replaceMin) continue;
    const inParticipation = byPlayerId.get(p.replacedBy['@id']);
    const teamSide = p.team?.['@id'] === hostId ? 'host' : 'guest';
    const outName = shortName(p.request);
    const inName = shortName(p.replacedBy);
    subs.push({
      minute: p.replaceMin,
      addedTime: false,
      eventType: 'sub',
      kind: 'sub',
      icon: '🔄',
      label: 'Замена',
      team: teamSide,
      playerName: outName,
      playerId: p.request?.['@id']?.split('/').pop() || null,
      assistName: null,
      comment: `⇄ ${inName}`,
      out: {
        playerId: p.request?.['@id']?.split('/').pop() || null,
        name: outName,
        number: p.number ?? null,
        photo: p.request?.photo || null,
      },
      in: {
        playerId: p.replacedBy?.['@id']?.split('/').pop() || null,
        name: inName,
        number: inParticipation?.number ?? null,
        photo: p.replacedBy?.photo || null,
      },
    });
  }
  return subs;
}

function buildTimeline(match) {
  const events = normalizeEvents(match);
  const subs = normalizeSubstitutions(match);
  return [...events, ...subs].sort((a, b) => (a.minute || 0) - (b.minute || 0));
}

// Sync events для одного матча
export async function fetchAndStoreEvents(extMatchId, ageGroup, clubId = 'legirus') {
  const apiMatch = await apiGetMatch(extMatchId);
  const timeline = buildTimeline(apiMatch);
  await query(
    `UPDATE calendar SET events_data = $1::jsonb, events_fetched_at = NOW()
     WHERE club_id = $2 AND age_group = $3 AND ext_match_id = $4`,
    [JSON.stringify(timeline), clubId, ageGroup, extMatchId]);
  return { extMatchId, events: timeline.length };
}

// Главный tick: для всех наших isPast матчей с пустым/устаревшим events_data — fetch + save.
//
// КРИТИЧНО: судья заполняет протокол постепенно — сначала только финальный счёт
// (попадает в standings сразу), потом детальный протокол с goals/cards/subs может
// появиться через 1-24 часа. Если первый pull попал на момент когда events ещё нет,
// мы записывали [] и больше никогда не пробовали. Поэтому условие на 2 уровнях:
//   1. events_data IS NULL — никогда не тянули (новые матчи)
//   2. ИЛИ events_data это пустой массив И прошло >2ч с прошлой попытки
//      (даём судье время дозаполнить, но ретраим)
// Окно — 7 дней (после этого протокол обычно полностью заполнен либо никогда).
export async function syncRecentEvents() {
  if (!isPgEnabled() || !isFfspbConfigured()) return { skipped: true };
  const r = await query(`
    SELECT ext_match_id, age_group, club_id
    FROM calendar
    WHERE club_id = 'legirus' AND is_our_match = TRUE
      AND score_home IS NOT NULL
      AND match_date >= NOW() - INTERVAL '7 days'
      AND (
        events_data IS NULL
        OR (
          jsonb_typeof(events_data) = 'array'
          AND jsonb_array_length(events_data) = 0
          AND (events_fetched_at IS NULL OR events_fetched_at < NOW() - INTERVAL '2 hours')
        )
      )
    ORDER BY match_date DESC
    LIMIT 50`);
  if (r.rows.length === 0) return { fetched: 0 };

  let ok = 0, fail = 0;
  for (const row of r.rows) {
    try {
      const res = await fetchAndStoreEvents(row.ext_match_id, row.age_group, row.club_id);
      console.log(`[match-events] ${row.age_group}/${row.ext_match_id}: ${res.events} events`);
      ok++;
    } catch (e) {
      console.error(`[match-events] ${row.age_group}/${row.ext_match_id} failed:`, e.message);
      fail++;
    }
  }
  return { fetched: ok, failed: fail };
}

let timer = null;
// Flashscore-режим: события матчей (голы, замены) обновляются каждые 30 минут.
// FFSPB сам обновляется по факту заполнения протокола судьёй после матча — чаще нет смысла.
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export function startMatchEventsCron() {
  if (timer) return;
  // Первый прогон через 25 секунд после старта (после calendar+standings+players-sync)
  setTimeout(() => syncRecentEvents().catch((e) => console.error('[match-events] tick failed:', e.message)), 25_000);
  timer = setInterval(() => syncRecentEvents().catch(() => {}), REFRESH_INTERVAL_MS);
  console.log('[match-events] cron started, every 30 min');
}
export function stopMatchEventsCron() { if (timer) clearInterval(timer); timer = null; }
