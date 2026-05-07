// JSON-репо для тренировок (Sprint 5.1).
// Структура файла backend/data/trainings.json:
//   {
//     "trainings": [{
//       id: 'uuid',
//       teamId: 'legirus-2010',
//       startsAt: '2026-05-08T17:00:00+03:00',
//       durationMin: 90,
//       venueId: null | string,        // ссылка на venues.json по id
//       venueText: null | 'Балтика',   // если venueId не задан
//       type: 'training' | 'extra' | 'warmup' | 'recovery' | 'meet',
//       notes: null | string,
//       createdBy: 'u-coach',
//       createdAt: '2026-05-06T...Z',
//       updatedAt: '2026-05-06T...Z'
//     }],
//     "attendance": {
//       'training-uuid': {
//         'p17-turapin': { status: 'present'|'absent'|'late'|'excused', markedBy: 'u-coach', markedAt: '...' }
//       }
//     }
//   }
//
// Когда подключим PG, перепишем сигнатуры на async через db/pool.js, фронт не тронем.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FILE = path.resolve(__dirname, '..', 'data', 'trainings.json');

const VALID_TYPES = ['training', 'extra', 'warmup', 'recovery', 'meet'];
const VALID_STATUS = ['present', 'absent', 'late', 'excused'];

function ensureFile() {
  if (!fs.existsSync(FILE)) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ trainings: [], attendance: {} }, null, 2), 'utf-8');
  }
}

function readAll() {
  ensureFile();
  try {
    const raw = fs.readFileSync(FILE, 'utf-8');
    const data = JSON.parse(raw || '{}');
    if (!Array.isArray(data.trainings)) data.trainings = [];
    if (!data.attendance || typeof data.attendance !== 'object') data.attendance = {};
    return data;
  } catch (e) {
    console.error('[trainingsRepo] read failed:', e.message);
    return { trainings: [], attendance: {} };
  }
}

function writeAll(data) {
  ensureFile();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, FILE);
}

function nowIso() { return new Date().toISOString(); }

// === LIST ===
// Возвращает тренировки команды с опциональным фильтром по диапазону дат.
// Если scope='upcoming' — только startsAt >= now; 'past' — < now.
export function listTrainings(teamId, { scope, from, to, limit } = {}) {
  if (!teamId) throw new Error('teamId required');
  const { trainings } = readAll();
  let arr = trainings.filter((t) => t.teamId === teamId);
  const now = Date.now();
  if (scope === 'upcoming') arr = arr.filter((t) => new Date(t.startsAt).getTime() >= now);
  if (scope === 'past')     arr = arr.filter((t) => new Date(t.startsAt).getTime() < now);
  if (from) arr = arr.filter((t) => new Date(t.startsAt).getTime() >= new Date(from).getTime());
  if (to)   arr = arr.filter((t) => new Date(t.startsAt).getTime() <= new Date(to).getTime());
  arr.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  if (limit) arr = arr.slice(0, Number(limit));
  return arr;
}

export function getTraining(id) {
  const { trainings } = readAll();
  return trainings.find((t) => t.id === id) || null;
}

// === CREATE ===
export function createTraining(input, user) {
  if (!input?.teamId)  throw new Error('teamId required');
  if (!input?.startsAt) throw new Error('startsAt required');
  const type = input.type || 'training';
  if (!VALID_TYPES.includes(type)) throw new Error('type invalid');

  const data = readAll();
  const t = {
    id: crypto.randomUUID(),
    teamId: input.teamId,
    startsAt: input.startsAt,
    durationMin: Number(input.durationMin) || 90,
    venueId:   input.venueId   || null,
    venueText: input.venueText || null,
    type,
    notes:     input.notes     || null,
    createdBy: user?.id || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  data.trainings.push(t);
  writeAll(data);
  return t;
}

// === UPDATE ===
export function updateTraining(id, patch, user) {
  const data = readAll();
  const idx = data.trainings.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error('not found');
  const t = data.trainings[idx];
  const next = { ...t };
  for (const k of ['startsAt','durationMin','venueId','venueText','type','notes']) {
    if (patch[k] !== undefined) next[k] = patch[k];
  }
  if (next.type && !VALID_TYPES.includes(next.type)) throw new Error('type invalid');
  next.updatedAt = nowIso();
  data.trainings[idx] = next;
  writeAll(data);
  return next;
}

// === DELETE ===
export function deleteTraining(id) {
  const data = readAll();
  const before = data.trainings.length;
  data.trainings = data.trainings.filter((t) => t.id !== id);
  if (data.attendance[id]) delete data.attendance[id];
  if (data.trainings.length === before) throw new Error('not found');
  writeAll(data);
  return true;
}

// === ATTENDANCE ===
// Возвращает map { playerId: { status, markedBy, markedAt } } для конкретной тренировки.
export function getAttendance(trainingId) {
  const { attendance } = readAll();
  return attendance[trainingId] || {};
}

// Массовая отметка: { playerId: 'present', ... } или { playerId: { status, note } }
export function setAttendance(trainingId, marks, user) {
  if (!getTraining(trainingId)) throw new Error('training not found');
  const data = readAll();
  if (!data.attendance[trainingId]) data.attendance[trainingId] = {};
  const slot = data.attendance[trainingId];
  for (const [playerId, val] of Object.entries(marks || {})) {
    const status = typeof val === 'string' ? val : val?.status;
    if (!VALID_STATUS.includes(status)) continue;
    slot[playerId] = {
      status,
      note: typeof val === 'object' ? (val.note || null) : null,
      markedBy: user?.id || null,
      markedAt: nowIso(),
    };
  }
  writeAll(data);
  return slot;
}

// Аггрегат для игрока: сколько тренировок прошло, сколько пропустил.
export function playerAttendanceStats(teamId, playerId, { from, to } = {}) {
  const data = readAll();
  const trs = data.trainings.filter((t) => t.teamId === teamId);
  const fromTs = from ? new Date(from).getTime() : 0;
  const toTs = to ? new Date(to).getTime() : Date.now();
  let total = 0, present = 0, late = 0, absent = 0, excused = 0;
  for (const tr of trs) {
    const ts = new Date(tr.startsAt).getTime();
    if (ts < fromTs || ts > toTs) continue;
    if (ts > Date.now()) continue; // только прошедшие
    total += 1;
    const mark = data.attendance[tr.id]?.[playerId]?.status;
    if (mark === 'present') present += 1;
    else if (mark === 'late') late += 1;
    else if (mark === 'absent') absent += 1;
    else if (mark === 'excused') excused += 1;
  }
  const attendedRaw = present + late;
  return {
    total,
    present, late, absent, excused,
    attendedPct: total ? Math.round((attendedRaw / total) * 100) : null,
  };
}
