// Тонкий клиент для официального API stat.ffspb.org (API Platform / JSON-LD).
// Документация: https://stat.ffspb.org/api/docs.json
//
// Авторизация: HTTP-header `X-AUTH-TOKEN: <ключ>`
// ENV: FFSPB_API_KEY и FFSPB_ENDPOINT (default https://stat.ffspb.org/api)
//
// Фишки:
//   - Auto-pagination через Hydra view (next link) — для list-эндпоинтов
//   - Простой retry на 5xx (3 попытки, экспоненциальный backoff)
//   - Все методы возвращают plain JSON (без @id/@context на верхнем уровне массива)

const ENDPOINT = (process.env.FFSPB_ENDPOINT || 'https://stat.ffspb.org/api').replace(/\/+$/, '');
const KEY = process.env.FFSPB_API_KEY || '';

export function isFfspbConfigured() { return !!KEY; }

async function fetchWithRetry(url, opts = {}, attempt = 1) {
  const headers = {
    'Accept': 'application/ld+json',
    'X-AUTH-TOKEN': KEY,
    ...(opts.headers || {}),
  };
  try {
    const res = await fetch(url, { ...opts, headers });
    if (res.status >= 500 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return fetchWithRetry(url, opts, attempt + 1);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`FFSPB ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  } catch (e) {
    if (attempt < 3 && /timeout|ECONNRESET|fetch failed/i.test(e.message)) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return fetchWithRetry(url, opts, attempt + 1);
    }
    throw e;
  }
}

// Список с автоматической пагинацией через `hydra:view.hydra:next`.
// Вернёт все элементы со всех страниц.
export async function listAll(path, params = {}) {
  if (!isFfspbConfigured()) throw new Error('FFSPB_API_KEY не задан в env');
  const url = new URL(ENDPOINT + path);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(`${k}[]`, item);
    } else if (v != null) {
      url.searchParams.set(k, v);
    }
  }
  // По умолчанию запрашиваем максимум на странице (API Platform default 30)
  if (!url.searchParams.has('itemsPerPage')) url.searchParams.set('itemsPerPage', '100');

  const all = [];
  let next = url.toString();
  let safety = 50; // от бесконечного цикла
  while (next && safety-- > 0) {
    const data = await fetchWithRetry(next);
    const items = data['hydra:member'] || data.member || [];
    for (const item of items) all.push(item);
    const view = data['hydra:view'] || data.view;
    const nextRel = view?.['hydra:next'] || view?.next;
    next = nextRel ? new URL(nextRel, ENDPOINT).toString() : null;
  }
  return all;
}

// Один объект.
export async function getOne(path, params = {}) {
  if (!isFfspbConfigured()) throw new Error('FFSPB_API_KEY не задан в env');
  const url = new URL(ENDPOINT + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
  return fetchWithRetry(url.toString());
}

// === Удобные обёртки ===

// Все матчи турнира. options: { hasLineups, dateGte, dateLte, orderByDate }
export async function listMatches(tournamentId, opts = {}) {
  const params = { tournament_id: tournamentId };
  if (opts.hasLineups != null)  params.has_lineups = opts.hasLineups ? 1 : 0;
  if (opts.dateGte) params['date[gte]'] = Math.floor(new Date(opts.dateGte).getTime() / 1000);
  if (opts.dateLte) params['date[lte]'] = Math.floor(new Date(opts.dateLte).getTime() / 1000);
  if (opts.orderByDate) params['order[date]'] = opts.orderByDate; // 'asc' | 'desc'
  if (!params['order[date]']) params['order[date]'] = 'asc';
  return listAll('/matches', params);
}

export async function getMatch(matchId) {
  return getOne(`/matches/${matchId}`);
}

// Турнирная таблица. /api/standings требует фильтр `tournament` (IRI), не `tournament_id`.
export async function listStandings(tournamentId) {
  return listAll('/standings', { tournament: `/api/tournaments/${tournamentId}` });
}

// Кубок: playoffs (сетка). Как и standings — нужен IRI `tournament`, не `tournament_id`.
export async function listPlayoffs(tournamentId) {
  return listAll('/playoffs', { tournament: `/api/tournaments/${tournamentId}` });
}

// Состав команды: GET /api/teams/{id} обычно содержит embedded players,
// либо отдельный endpoint. Проверим оба.
export async function getTeamWithPlayers(teamId) {
  return getOne(`/teams/${teamId}`);
}
export async function listTeamPlayers(teamId) {
  // API Platform поддерживает фильтр по team
  return listAll('/players', { 'currentTeam.id': teamId });
}

// События матча (если в Match.events мало — можно отдельно)
export async function listMatchEvents(matchId) {
  return listAll('/match_events', { 'match.id': matchId });
}

// Топ-игроки турнира по выбранной метрике (top_by).
// FFSPB требует IRI `tournament` + параметр `top_by`. Возможные значения top_by
// определяются API — на момент исследования это goals, assists, и т.д.
// (см. /api/data/_debug/top-players/:tid в data.js).
export async function listTournamentTopPlayers(tournamentId, topBy = 'goals') {
  return listAll('/tournament_top_players', {
    tournament: `/api/tournaments/${tournamentId}`,
    top_by: topBy,
  });
}
