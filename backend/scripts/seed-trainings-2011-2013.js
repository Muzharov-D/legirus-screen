// Создаёт регулярные тренировки на 4 недели вперёд для 2011 / 2012 / 2013.
// Запуск: NODE_ENV=production node backend/scripts/seed-trainings-2011-2013.js
//
// Расписание (предоставлено head_coach):
//   2013 (U14): ПН 18:00-19:30, СР 17:45-19:15, ПТ 19:30-21:00
//   2012 (U15): ПН 19:30-21:00, СР 17:45-19:15, ПТ 19:30-21:00
//   2011 (U16): ВТ 18:00-19:30, ЧТ 19:30-21:00, ПТ 19:30-21:00
//
// Площадка по умолчанию — "Нова Арена" (как у 2010). При наличии match-collision
// в тот же день — слот пропускается.

import { createTraining, listTrainings } from '../services/trainingsRepo.js';
import { isPgEnabled, query } from '../db/pool.js';

const SCHEDULES = {
  'legirus-2013': [
    { dow: 1, hour: 18, minute: 0, durationMin: 90 }, // ПН 18:00-19:30
    { dow: 3, hour: 17, minute: 45, durationMin: 90 }, // СР 17:45-19:15
    { dow: 5, hour: 19, minute: 30, durationMin: 90 }, // ПТ 19:30-21:00
  ],
  'legirus-2012': [
    { dow: 1, hour: 19, minute: 30, durationMin: 90 }, // ПН 19:30-21:00
    { dow: 3, hour: 17, minute: 45, durationMin: 90 }, // СР 17:45-19:15
    { dow: 5, hour: 19, minute: 30, durationMin: 90 }, // ПТ 19:30-21:00
  ],
  'legirus-2011': [
    { dow: 2, hour: 18, minute: 0, durationMin: 90 },  // ВТ 18:00-19:30
    { dow: 4, hour: 19, minute: 30, durationMin: 90 }, // ЧТ 19:30-21:00
    { dow: 5, hour: 19, minute: 30, durationMin: 90 }, // ПТ 19:30-21:00
  ],
};

const VENUE = 'Нова Арена';
const WEEKS_AHEAD = 4;
const NOW = new Date();
const SYSTEM_USER = { id: 'seed-script', fullName: 'seed-script', role: 'head_coach' };

// Возвращает ближайший в будущем дату с указанными dow/hour/minute (СПб таймзона +03)
function nextOccurrence(weekOffset, dow, hour, minute) {
  // dow: 1=ПН ... 7=ВС
  const d = new Date(NOW);
  d.setHours(hour, minute, 0, 0);
  // currentDow: 1..7 (ПН=1)
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
    const rows = await query(
      `SELECT id FROM matches WHERE team_id = $1 AND date_iso >= $2 AND date_iso <= $3 LIMIT 1`,
      [teamId, dayStart.toISOString(), dayEnd.toISOString()]
    );
    return rows.length > 0;
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
  for (const teamId of Object.keys(SCHEDULES)) {
    await seedTeam(teamId);
  }
  console.log('\nDone.');
  process.exit(0);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
