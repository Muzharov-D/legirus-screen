// Одноразовая миграция: проставить teamId='legirus-2010' существующим
// данным (players.json, matches.json, matches/match-*.json), которые
// были созданы до фазы G1 «масштабирование на несколько команд».
//
// Идемпотентен: если teamId уже стоит — поле не перезаписывается.
// Запуск:  node scripts/migrate-add-teamid.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const MATCHES_DIR = path.join(DATA_DIR, 'matches');
const DEFAULT_TEAM_ID = 'legirus-2010';

function patchJson(filePath, mutator) {
  if (!fs.existsSync(filePath)) {
    console.log(`  пропущено (нет файла): ${filePath}`);
    return;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const obj = JSON.parse(raw);
  const changed = mutator(obj);
  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
    console.log(`  обновлён: ${filePath}`);
  } else {
    console.log(`  без изменений: ${filePath}`);
  }
}

console.log(`Миграция teamId → ${DEFAULT_TEAM_ID}`);

// 1) players.json
patchJson(path.join(DATA_DIR, 'players.json'), (obj) => {
  let changed = false;
  for (const p of obj.players || []) {
    if (!p.teamId) { p.teamId = DEFAULT_TEAM_ID; changed = true; }
  }
  return changed;
});

// 2) matches.json (индекс)
patchJson(path.join(DATA_DIR, 'matches.json'), (obj) => {
  let changed = false;
  for (const m of obj.matches || []) {
    if (!m.teamId) { m.teamId = DEFAULT_TEAM_ID; changed = true; }
  }
  return changed;
});

// 3) каждый matches/*.json
if (fs.existsSync(MATCHES_DIR)) {
  for (const f of fs.readdirSync(MATCHES_DIR)) {
    if (!f.endsWith('.json')) continue;
    patchJson(path.join(MATCHES_DIR, f), (obj) => {
      if (obj.teamId) return false;
      obj.teamId = DEFAULT_TEAM_ID;
      return true;
    });
  }
} else {
  console.log(`  пропущено (нет каталога): ${MATCHES_DIR}`);
}

console.log('Готово.');
