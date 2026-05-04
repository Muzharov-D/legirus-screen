const RAW_BASE = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = String(RAW_BASE).replace(/\/+$/, '');
const PREFIX = `${API_BASE}/api`;
const TOKEN_KEY = 'legirus.auth.token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function fetchJson(path, opts = {}) {
  const token = getToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${PREFIX}${path}`, { ...opts, headers });

  if (res.status === 401) {
    setToken(null);
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Не авторизован');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `API ${res.status}: ${res.statusText}`;
    try { msg = JSON.parse(text).error || msg; } catch (_) { if (text) msg = text; }
    throw new Error(msg);
  }
  return res.json();
}

// Auth
export async function login(username, password) {
  const res = await fetch(`${PREFIX}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    let msg = `Ошибка входа (${res.status})`;
    try { msg = JSON.parse(text).error || msg; } catch (_) { if (text) msg = text; }
    throw new Error(msg);
  }
  const data = JSON.parse(text);
  setToken(data.token);
  return data.user;
}
export async function fetchMe() { return fetchJson('/auth/me'); }
export function logout() { setToken(null); }

// Data
export const fetchTeams = () => fetchJson('/data/teams');
export const fetchPlayers = (teamId) =>
  fetchJson(`/data/players${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''}`);
export const fetchMatches = (teamId) =>
  fetchJson(`/data/matches${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''}`);
export const fetchMatch = (id) => fetchJson(`/data/match/${id}`);
export const fetchMetrics = () => fetchJson('/data/metrics');

export async function fetchAgentInsight(screenId, context) {
  return fetchJson('/agent/insight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ screenId, context: context || {} }),
  });
}

export async function uploadPdf(file, teamId, tournament) {
  const fd = new FormData();
  fd.append('file', file);
  if (teamId) fd.append('teamId', teamId);
  if (tournament) fd.append('tournament', tournament);
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${PREFIX}/upload-pdf`, { method: 'POST', body: fd, headers });
  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Не авторизован');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `Upload failed: ${res.status}`;
    try { msg = JSON.parse(text).error || msg; } catch (_) { if (text) msg = text; }
    throw new Error(msg);
  }
  return res.json();
}

export function toAssetUrl(p) {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/assets')) return API_BASE ? `${API_BASE}${p}` : p;
  return p;
}
