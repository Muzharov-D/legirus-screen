// Создаёт регулярные тренировки на 4 недели вперёд для 2011 / 2012 / 2013.
// Запуск: NODE_ENV=production node scripts/seed-trainings-2011-2013.js (из ~/project/src/backend)
//
// Расписание:
//   2013 (U14): ПН 18:00-19:30, СР 17:45-19:15, ПТ 19:30-21:00
//   2012 (U15): ПН 19:30-21:00, СР 17:45-19:15, ПТ 19:30-21:00
//   2011 (U16): ВТ 18:00-19:30, ЧТ 19:30-21:00, ПТ 19:30-21:00
//
// Автор записей берётся первый head_coach из таблицы users (FK constraint).

import { createTraining, listTrainings } from '../services/trainingsRepo.js';
import { isPgEnabled, query } from '../db/pool.js';

const SCHEDULES = {
  'legirus-2013': [
    { dow: 1, hour: 18, minute: 0, durationMin: 90 },
    { dow: 3, hour: 17, minute: 45, durationMin: 90 },
    { dow: 5, hour: 19, minute: 30, durationMin: 90 },
  ],
  'legirus-2012': [
    { dow: 1, hour: 19, minute: 30, durationMin: 90 },
    { dow: 3, hour: 17, minute: 45, durationMin: 90 },
    { dow: 5, hour: 19, minute: 30, durationMin: 90 },
  ],
  'legirus-2011': [
    { dow: 2, hour: 18, minute: 0, durationMin: 90 },
    { dow: 4, hour: 19, minute: 30, durationMin: 90 },
    { dow: 5, hour: 19, minute: 30, durationMin: 90 },
  ],
};

const VENUE = 'Нова Арена';
const WEEKS_AHEAD = 4;
const NOW = new Date();
let SYSTEM_USER = null;

function nextOccurrence(weekOffset, dow, hour, minute) {
  const d = new Date(NOW);
  d.setHours(hour, minute, 0, 0);
  const currentDow = ((d.getDay() + 6) % 7) + 1;
  let delta = dow - currentDow;
  if (delta < 0 || (delta === 0 && d <= NOW)) delta += 7;
  d.setDate(d.getDate() + delta + (weekOffset * 7));
  return d;
}

async function hasMatchOnDate(teamId, date) {
  if (!isPgEnabled()) return false;
  const dayStart = new Date(date); dayStart.setHours(0,0,0,0);
  const dayEnd   = new Date(date); dayEnd.setHours(23,59,59,999);
  try {
    const result = await query(
      `SELECT id FROM matches WHERE team_id = $1 AND date_iso >= $2 AND date_iso <= $3 LIMIT 1`,
      [teamId, dayStart.toISOString(), dayEnd.toISOString()]
    );
    return (result.rows || []).length > 0;
  } catch {
    return false;
  }
}

async function isDuplicate(teamId, isoStart) {
  const list = await listTrainings(teamId, { scope: 'all', limit: 500 });
  return list.some((t) => t.startsAt && new Date(t.startsAt).toISOString() === isoStart);
}

async function seedTeam(teamId) {
  const slots = SCHEDULES[teamId];
  if (!slots) return;
  console.log(`\n=== ${teamId} ===`);
  let created = 0, skipped = 0, conflicts = 0;
  for (let week = 0; week < WEEKS_AHEAD; week++) {
    for (const slot of slots) {
      const startsAt = nextOccurrence(week, slot.dow, slot.hour, slot.minute);
      const iso = startsAt.toISOString();
      if (await hasMatchOnDate(teamId, startsAt)) {
        console.log(`  [SKIP match-day] ${iso}`);
        conflicts++; continue;
      }
      if (await isDuplicate(teamId, iso)) {
        console.log(`  [SKIP dup]       ${iso}`);
        skipped++; continue;
      }
      await createTraining({
        teamId,
        startsAt: iso,
        durationMin: slot.durationMin,
        venueText: VENUE,
        type: 'training',
        notes: '',
      }, SYSTEM_USER);
      console.log(`  [CREATE]         ${iso}`);
      created++;
    }
  }
  console.log(`  → создано: ${created}, дубли: ${skipped}, конфликты с матчами: ${conflicts}`);
}

(async () => {
  console.log('Seeding regular trainings for 2011/2012/2013...');
  console.log('PG enabled:', isPgEnabled());

  const headsResult = await query(`SELECT id, full_name FROM users WHERE role = 'head_coach' LIMIT 1`);
  const heads = headsResult.rows || [];
  if (heads.length === 0) {
    console.error('Нет ни одного head_coach в users — сначала создайте аккаунт.');
    process.exit(1);
  }
  SYSTEM_USER = { id: heads[0].id, fullName: heads[0].full_name, role: 'head_coach' };
  console.log(`Author: ${SYSTEM_USER.fullName} (${SYSTEM_USER.id})`);

  for (const teamId of Object.keys(SCHEDULES)) {
    await seedTeam(teamId);
  }
  console.log('\nDone.');
  process.exit(0);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
