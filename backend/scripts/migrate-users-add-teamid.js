// Одноразовая миграция users.json под новую модель ролей и teamId.
// Запускать ВРУЧНУЮ ОДИН РАЗ в Render Shell после деплоя фазы G1.
//
//   node scripts/migrate-users-add-teamid.js
//
// Что делает:
//   - старая роль `coach` → переименовывается в `head_coach` с teamId=null
//     (полные права на все команды; пароль и id остаются прежними).
//   - всем игрокам (role: 'player'), у кого нет teamId, проставляет
//     teamId='legirus-2010'.
//   - team_coach остаются как есть, новых пользователей не создаёт.
//
// Идемпотентен: повторный запуск ничего не меняет.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const USERS_PATH = process.env.USERS_PATH || path.join(DATA_DIR, 'users.json');
const DEFAULT_PLAYER_TEAM = 'legirus-2010';

if (!fs.existsSync(USERS_PATH)) {
  console.error(`Файл users.json не найден: ${USERS_PATH}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'));
let changed = 0;

for (const u of data.users || []) {
  const before = JSON.stringify(u);

  if (u.role === 'coach') {
    u.role = 'head_coach';
    if (!('teamId' in u)) u.teamId = null;
  }

  if (u.role === 'head_coach' && u.teamId === undefined) {
    u.teamId = null;
  }

  if (u.role === 'player' && !u.teamId) {
    u.teamId = DEFAULT_PLAYER_TEAM;
  }

  if (u.role === 'team_coach' && u.teamId === undefined) {
    u.teamId = null;
  }

  if (JSON.stringify(u) !== before) changed++;
}

if (!changed) {
  console.log('Изменений нет — миграция уже применена.');
  process.exit(0);
}

fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2), 'utf-8');
console.log(`✅ Обновлено пользователей: ${changed} (${USERS_PATH})`);
console.log('Перезапустите backend (Manual Deploy в Render), чтобы сбросился кеш userStore.');
