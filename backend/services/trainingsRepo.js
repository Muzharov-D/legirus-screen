// PG-aware repo для тренировок (Sprint 5.1 + 5.2).
// При DATABASE_URL — читает/пишет в PG, иначе fallback на JSON-файл (legacy MVP).
//
// Сигнатуры всех функций — async, идентичны JSON-варианту:
//   listTrainings(teamId, opts)
//   getTraining(id)
//   createTraining(input, user)
//   updateTraining(id, patch, user)
//   deleteTraining(id)
//   getAttendance(trainingId)
//   setAttendance(trainingId, marks, user)
//   playerAttendanceStats(teamId, playerId, opts)
//
// Двойной режим training_attendance:
//   - response_status (going/not_going) — сам игрок до тренировки
//   - presence_status (present/late/excused/absent) — тренер постфактум
// Frontend старого UI использует presence (отметка тренера после трены) —
// поэтому setAttendance(marks={ playerId: 'present' | 'late' | ... }) пишет в presence_*.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { isPgEnabled, query } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FILE = path.resolve(__dirname, '..', 'data', 'trainings.json');

const VALID_TYPES = ['training', 'extra', 'warmup', 'recovery', 'meet'];
const VALID_PRESENCE = ['present', 'late', 'excused', 'absent'];
const VALID_RESPONSE = ['going', 'not_going'];

// === JSON fallback ===
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

// === Helpers ===
function rowToTraining(r) {
  return {
    id: r.id,
    teamId: r.team_id,
    startsAt: r.starts_at instanceof Date ? r.starts_at.toISOString() : r.starts_at,
    durationMin: r.duration_min,
    venueId: r.venue_id,
    venueText: r.venue_text,
    type: r.type,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

// === LIST ===
export async function listTrainings(teamId, { scope, from, to, limit } = {}) {
  if (!teamId) throw new Error('teamId required');

  if (isPgEnabled()) {
    const params = [teamId];
    let where = 'team_id = $1';
    if (scope === 'upcoming') where += ' AND starts_at >= NOW()';
    else if (scope === 'past') where += ' AND starts_at < NOW()';
    if (from) { params.push(from); where += ` AND starts_at >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND starts_at <= $${params.length}`; }
    let sql = `SELECT id, team_id, starts_at, duration_min, venue_id, venue_text, type, notes,
                      created_by, created_at, updated_at
               FROM trainings WHERE ${where} ORDER BY starts_at ASC`;
    if (limit) sql += ` LIMIT ${Number(limit)}`;
    const r = await query(sql, params);
    return r.rows.map(rowToTraining);
  }

  // JSON fallback
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

export async function getTraining(id) {
  if (isPgEnabled()) {
    const r = await query(`SELECT id, team_id, starts_at, duration_min, venue_id, venue_text, type, notes,
                                  created_by, created_at, updated_at
                           FROM trainings WHERE id = $1`, [id]);
    return r.rows[0] ? rowToTraining(r.rows[0]) : null;
  }
  const { trainings } = readAll();
  return trainings.find((t) => t.id === id) || null;
}

// === CREATE ===
export async function createTraining(input, user) {
  if (!input?.teamId)    throw new Error('teamId required');
  if (!input?.startsAt)  throw new Error('startsAt required');
  const type = input.type || 'training';
  if (!VALID_TYPES.includes(type)) throw new Error('type invalid');

  if (isPgEnabled()) {
    const r = await query(
      `INSERT INTO trainings (team_id, starts_at, duration_min, venue_id, venue_text, type, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, team_id, starts_at, duration_min, venue_id, venue_text, type, notes,
                 created_by, created_at, updated_at`,
      [input.teamId, input.startsAt, Number(input.durationMin) || 90,
       input.venueId || null, input.venueText || null, type, input.notes || null,
       user?.id || null]);
    return rowToTraining(r.rows[0]);
  }

  // JSON
  const data = readAll();
  const t = {
    id: crypto.randomUUID(),
    teamId: input.teamId,
    startsAt: input.startsAt,
    durationMin: Number(input.durationMin) || 90,
    venueId: input.venueId || null,
    venueText: input.venueText || null,
    type,
    notes: input.notes || null,
    createdBy: user?.id || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  data.trainings.push(t);
  writeAll(data);
  return t;
}

// === UPDATE ===
export async function updateTraining(id, patch, user) {
  if (isPgEnabled()) {
    if (patch.type && !VALID_TYPES.includes(patch.type)) throw new Error('type invalid');
    const fields = [];
    const params = [];
    const map = {
      startsAt: 'starts_at',
      durationMin: 'duration_min',
      venueId: 'venue_id',
      venueText: 'venue_text',
      type: 'type',
      notes: 'notes',
    };
    for (const [k, col] of Object.entries(map)) {
      if (patch[k] !== undefined) {
        params.push(patch[k]);
        fields.push(`${col} = $${params.length}`);
      }
    }
    if (fields.length === 0) return await getTraining(id);
    params.push(id);
    const r = await query(
      `UPDATE trainings SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING id, team_id, starts_at, duration_min, venue_id, venue_text, type, notes,
                 created_by, created_at, updated_at`,
      params);
    if (r.rows.length === 0) throw new Error('not found');
    return rowToTraining(r.rows[0]);
  }

  // JSON
  const data = readAll();
  const idx = data.trainings.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error('not found');
  const next = { ...data.trainings[idx] };
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
export async function deleteTraining(id) {
  if (isPgEnabled()) {
    const r = await query(`DELETE FROM trainings WHERE id = $1`, [id]);
    if (r.rowCount === 0) throw new Error('not found');
    return true;
  }
  const data = readAll();
  const before = data.trainings.length;
  data.trainings = data.trainings.filter((t) => t.id !== id);
  if (data.attendance[id]) delete data.attendance[id];
  if (data.trainings.length === before) throw new Error('not found');
  writeAll(data);
  return true;
}

// === ATTENDANCE (presence — отметка тренера постфактум) ===
export async function getAttendance(trainingId) {
  if (isPgEnabled()) {
    const r = await query(
      `SELECT player_id, response_status, response_at, presence_status, presence_at, marked_by, note
       FROM training_attendance WHERE training_id = $1`, [trainingId]);
    const out = {};
    for (const row of r.rows) {
      // Для backward-compat фронта возвращаем status = presence_status, иначе response_status
      out[row.player_id] = {
        status: row.presence_status || row.response_status,
        response: row.response_status,
        presence: row.presence_status,
        markedBy: row.marked_by,
        markedAt: row.presence_at instanceof Date ? row.presence_at.toISOString() : row.presence_at,
        respondedAt: row.response_at instanceof Date ? row.response_at.toISOString() : row.response_at,
        note: row.note,
      };
    }
    return out;
  }
  const { attendance } = readAll();
  return attendance[trainingId] || {};
}

// Тренер отмечает посещаемость постфактум: { playerId: 'present'|'late'|'excused'|'absent' }
// Игрок RSVP: { playerId: 'going'|'not_going' } — если приходит из RSVP-эндпоинта.
// Для backward-compat — если status один из presence-значений, идёт в presence_*; иначе в response_*.
export async function setAttendance(trainingId, marks, user) {
  if (isPgEnabled()) {
    const t = await getTraining(trainingId);
    if (!t) throw new Error('training not found');
    for (const [playerId, val] of Object.entries(marks || {})) {
      const status = typeof val === 'string' ? val : val?.status;
      const note = typeof val === 'object' ? (val.note || null) : null;
      if (!status) continue;
      if (VALID_PRESENCE.includes(status)) {
        await query(
          `INSERT INTO training_attendance (training_id, player_id, presence_status, presence_at, marked_by, note)
           VALUES ($1, $2, $3, NOW(), $4, $5)
           ON CONFLICT (training_id, player_id) DO UPDATE SET
             presence_status = EXCLUDED.presence_status,
             presence_at = NOW(),
             marked_by = EXCLUDED.marked_by,
             note = COALESCE(EXCLUDED.note, training_attendance.note)`,
          [trainingId, playerId, status, user?.id || null, note]);
      } else if (VALID_RESPONSE.includes(status)) {
        await query(
          `INSERT INTO training_attendance (training_id, player_id, response_status, response_at, note)
           VALUES ($1, $2, $3, NOW(), $4)
           ON CONFLICT (training_id, player_id) DO UPDATE SET
             response_status = EXCLUDED.response_status,
             response_at = NOW(),
             note = COALESCE(EXCLUDED.note, training_attendance.note)`,
          [trainingId, playerId, status, note]);
      }
    }
    return await getAttendance(trainingId);
  }

  // JSON
  if (!(await getTraining(trainingId))) throw new Error('training not found');
  const data = readAll();
  if (!data.attendance[trainingId]) data.attendance[trainingId] = {};
  const slot = data.attendance[trainingId];
  for (const [playerId, val] of Object.entries(marks || {})) {
    const status = typeof val === 'string' ? val : val?.status;
    if (![...VALID_PRESENCE, ...VALID_RESPONSE].includes(status)) continue;
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

// Аггрегат для игрока: % посещаемости за период (только presence_status, считаем прошедшие).
export async function playerAttendanceStats(teamId, playerId, { from, to } = {}) {
  if (isPgEnabled()) {
    const params = [teamId, playerId];
    let dateFilter = 't.starts_at < NOW()';
    if (from) { params.push(from); dateFilter += ` AND t.starts_at >= $${params.length}`; }
    if (to)   { params.push(to);   dateFilter += ` AND t.starts_at <= $${params.length}`; }
    const r = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE ta.presence_status = 'present')::int AS present,
         COUNT(*) FILTER (WHERE ta.presence_status = 'late')::int    AS late,
         COUNT(*) FILTER (WHERE ta.presence_status = 'excused')::int AS excused,
         COUNT(*) FILTER (WHERE ta.presence_status = 'absent')::int  AS absent
       FROM trainings t
       LEFT JOIN training_attendance ta
         ON ta.training_id = t.id AND ta.player_id = $2
       WHERE t.team_id = $1 AND ${dateFilter}`,
      params);
    const s = r.rows[0] || { total: 0, present: 0, late: 0, excused: 0, absent: 0 };
    const attended = (s.present || 0) + (s.late || 0);
    return {
      total: s.total,
      present: s.present, late: s.late, absent: s.absent, excused: s.excused,
      attendedPct: s.total ? Math.round((attended / s.total) * 100) : null,
    };
  }

  // JSON
  const data = readAll();
  const trs = data.trainings.filter((t) => t.teamId === teamId);
  const fromTs = from ? new Date(from).getTime() : 0;
  const toTs = to ? new Date(to).getTime() : Date.now();
  let total = 0, present = 0, late = 0, absent = 0, excused = 0;
  for (const tr of trs) {
    const ts = new Date(tr.startsAt).getTime();
    if (ts < fromTs || ts > toTs) continue;
    if (ts > Date.now()) continue;
    total += 1;
    const mark = data.attendance[tr.id]?.[playerId]?.status;
    if (mark === 'present') present += 1;
    else if (mark === 'late') late += 1;
    else if (mark === 'absent') absent += 1;
    else if (mark === 'excused') excused += 1;
  }
  const attended = present + late;
  return {
    total, present, late, absent, excused,
    attendedPct: total ? Math.round((attended / total) * 100) : null,
  };
}
