# Sprint 4 ТЗ — Multi-club поддержка

**Срок:** ~1.5 недели (требует Sprint 3 завершённым)
**Цель:** один инстанс АванDаты обслуживает 10 клубов лиги. Каждый клуб видит **только свои** данные. Super-admin видит всех.

---

## 1. Бизнес-логика

| Роль                  | Видимость                                                  |
|-----------------------|-------------------------------------------------------------|
| `super_admin`         | Все клубы, все команды, все игроки. Может создавать клубы. |
| `head_coach`          | Все команды **своего** клуба. Загружает PDF любой команды клуба. |
| `team_coach`          | Только своя команда (как сейчас).                          |
| `player`              | Только своя команда; полные данные только по себе.         |

Внешние команды-соперники могут принадлежать **другим клубам системы** (тогда отображаются с их именем) или **внешним школам** (хранятся как «незарегистрированный клуб» — текстовое имя без записи в `clubs`).

---

## 2. Изменения в схеме

После Sprint 3 у нас уже есть `clubs.id` и FK на нём в `teams/users/standings/calendar`. Что нужно:

```sql
-- 010_multi_club.sql

-- Уникальные slug'и клубов для URL
ALTER TABLE clubs ADD COLUMN slug TEXT UNIQUE;
UPDATE clubs SET slug = id;        -- legacy легirus → 'legirus'

-- Видимый домен/поддомен (опц., для брендинга)
ALTER TABLE clubs ADD COLUMN subdomain TEXT UNIQUE;
ALTER TABLE clubs ADD COLUMN palette JSONB DEFAULT '{}'::jsonb;  -- цвета бренда
ALTER TABLE clubs ADD COLUMN logo_url TEXT;

-- Расширяем роль user
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin','head_coach','team_coach','player'));

-- super_admin не привязан к клубу — club_id = NULL
-- Все остальные роли требуют club_id NOT NULL — добавим триггером
CREATE OR REPLACE FUNCTION enforce_user_club_id() RETURNS trigger AS $$
BEGIN
  IF NEW.role <> 'super_admin' AND NEW.club_id IS NULL THEN
    RAISE EXCEPTION 'club_id обязателен для роли %', NEW.role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_club_required
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_user_club_id();

-- Конфиг скрейпа на уровне клуба (а не глобальный _config.json)
CREATE TABLE scrape_config (
  club_id        TEXT PRIMARY KEY REFERENCES clubs(id) ON DELETE CASCADE,
  league_name    TEXT NOT NULL,
  ourClubMatcher TEXT NOT NULL,
  season         TEXT NOT NULL,
  sources        JSONB NOT NULL,           -- { "2010": "https://...", ... }
  cup_sources    JSONB DEFAULT '{}'::jsonb,
  calendar_sources JSONB DEFAULT '{}'::jsonb
);

-- Индексы для multi-tenant scoping
CREATE INDEX idx_teams_club_active ON teams(club_id, active);
CREATE INDEX idx_matches_club ON matches((SELECT club_id FROM teams t WHERE t.id = matches.team_id));
-- NB: matches.club_id денормализуем для скорости:
ALTER TABLE matches ADD COLUMN club_id TEXT REFERENCES clubs(id) ON DELETE CASCADE;
UPDATE matches m SET club_id = (SELECT club_id FROM teams WHERE id = m.team_id);
ALTER TABLE matches ALTER COLUMN club_id SET NOT NULL;
CREATE INDEX idx_matches_club_date ON matches(club_id, match_date DESC);
```

---

## 3. Middleware: club scoping

`backend/middleware/clubScope.js` — после `authenticate` ставит `req.clubId`:

```js
export function clubScope(req, res, next) {
  if (req.user?.role === 'super_admin') {
    // super_admin может явно переключать клуб через query ?clubId= или header X-Club-Id
    req.clubId = req.query.clubId || req.headers['x-club-id'] || null;
  } else {
    req.clubId = req.user?.club_id || null;
    if (!req.clubId) return res.status(403).json({ error: 'Пользователь не привязан к клубу' });
  }
  next();
}
```

Подключить ВСЕ data-роуты под `clubScope`:
```js
app.use('/api/data', authenticate, clubScope, dataRoutes);
```

---

## 4. Изменения в `dataRepo`

Каждая функция получает `clubId` как явный параметр или из `req.clubId`:

```js
loadTeams(clubId)
  → SELECT * FROM teams WHERE club_id = $1

loadPlayers(clubId, teamId?)
  → SELECT p.* FROM players p JOIN teams t ON p.team_id=t.id
    WHERE t.club_id = $1 AND ($2::text IS NULL OR p.team_id = $2)

loadMatchesIndex(clubId, teamId?)
  → SELECT * FROM matches WHERE club_id = $1 AND ($2::text IS NULL OR team_id = $2)

loadMatch(matchId, clubId)
  → SELECT * FROM matches WHERE id = $1 AND club_id = $2
    -- если не в клубе пользователя → 404 (не утечка ID)

loadStandings(clubId, ageGroup)
  → SELECT * FROM standings WHERE club_id = $1 AND age_group = $2
    ORDER BY fetched_at DESC LIMIT 1
```

**super_admin без выбранного клуба** — особый случай: либо отдаём агрегат по всем (для дашборда), либо ошибка «выберите клуб».

---

## 5. Изменения в frontend

**Контекст клуба** — новый `ClubContext` поверх `AuthContext`:

```jsx
// frontend/src/contexts/ClubContext.jsx
export const ClubContext = createContext({});

export function ClubProvider({ children }) {
  const { user } = useAuth();
  const [clubs, setClubs] = useState([]);
  const [selectedClubId, setSelectedClubId] = useState(null);

  useEffect(() => {
    if (user?.role === 'super_admin') {
      fetchClubs().then((r) => {
        setClubs(r.clubs);
        setSelectedClubId(localStorage.getItem('avandata.club') || r.clubs[0]?.id);
      });
    } else if (user?.club_id) {
      setSelectedClubId(user.club_id);
    }
  }, [user]);

  // При смене клуба super_admin'ом — выставляем X-Club-Id header в api.js
  return (
    <ClubContext.Provider value={{ clubs, selectedClubId, selectClub: setSelectedClubId }}>
      {children}
    </ClubContext.Provider>
  );
}
```

**`api.js`** — добавляет header в каждом fetch:
```js
const clubId = getSelectedClubId();
if (clubId) headers['X-Club-Id'] = clubId;
```

**Селектор клуба в AppHeader** — отображается только для `super_admin`. Для остальных — ничего (видят только свой).

**Брендинг** — палитра/лого подтягиваются из `clubs.palette/logo_url`:
- CSS-переменные `--brand-primary`, `--brand-accent` инжектятся в `:root` через ClubContext
- `<img src={club.logoUrl}>` вместо хардкода `/assets/logos/legirus.png`
- Заголовок «ФК Легирус» → `club.displayName`

---

## 6. Регистрация нового клуба (admin flow)

`POST /api/admin/clubs` (super_admin only):
```json
{
  "id": "dynamo-spb",
  "name": "Динамо",
  "displayName": "СШ Динамо СПб",
  "slug": "dynamo-spb",
  "ffspbMatcher": "Динамо",
  "palette": { "primary": "#0033cc", "accent": "#ffd700" }
}
```

После создания клуба:
1. `POST /api/admin/clubs/:id/teams` — добавить команды (5 возрастов)
2. `POST /api/admin/clubs/:id/scrape-config` — задать ffspb URLs для standings/cup/calendar
3. `POST /api/admin/clubs/:id/users` — пригласить head_coach (с временным паролем)

UI для всего этого — отдельная страница `/admin/clubs` (только super_admin).

---

## 7. Cron-ы и multi-club

`standingsService.refreshAll()` — теперь итерирует по `SELECT * FROM scrape_config`:

```js
const configs = await db.query('SELECT * FROM scrape_config');
for (const cfg of configs.rows) {
  for (const [age, url] of Object.entries(cfg.sources)) {
    const { table } = await fetchAndParse(url, cfg.league_name, cfg.ourClubMatcher);
    await db.query(
      'INSERT INTO standings(club_id, age_group, season, table_data, source_url, league_name) VALUES ($1,$2,$3,$4,$5,$6)',
      [cfg.club_id, age, cfg.season, JSON.stringify(table), url, cfg.league_name]
    );
  }
}
```

Аналогично для `calendarService` и `cupService`.

---

## 8. Push notifications в multi-club

`pushService.notifyMatchProcessed(match)` теперь `WHERE team_id = $1 AND club_id = $2` — чтобы уведомление случайно не ушло подписчикам другого клуба с пересекающимся team_id.

---

## 9. Миграция данных Легируса

```sql
INSERT INTO clubs (id, name, display_name, slug, ffspb_matcher)
  VALUES ('legirus', 'Легирус', 'ФК Легирус', 'legirus', 'Легирус');

UPDATE teams SET club_id = 'legirus' WHERE club_id IS NULL;
UPDATE users SET club_id = 'legirus' WHERE club_id IS NULL;
UPDATE matches SET club_id = 'legirus' WHERE club_id IS NULL;

-- Перенос _config.json в scrape_config
INSERT INTO scrape_config (club_id, league_name, ourClubMatcher, season, sources, cup_sources)
  SELECT 'legirus', 'Вторая лига', 'Легирус', '2025-2026',
    '{"2010": "...", "2011": "...", "2012": "...", "2013": "..."}'::jsonb,
    '{"2010": "...", ...}'::jsonb;
```

После миграции `backend/data/standings/_config.json` удалить.

---

## 10. Routing и UI

**Маршруты остаются** (`/club`, `/matches`, `/calendar`, `/players`, ...) — никаких префиксов `/club/:slug/...`. Активный клуб — в контексте, не в URL.

Опц. (long-tail): субдоменное разделение `legirus.avandata.app`, `dynamo.avandata.app` — middleware читает `host`, ставит `req.clubId`. Реализуется поверх описанного flow без переработки.

---

## 11. Тестирование

- Unit: `dataRepo` каждой функции с моком БД, проверка что club_id всегда в WHERE
- Integration: 2 фикстурных клуба, проверка что user клуба A не видит данные клуба B (404 на match других)
- E2E: super_admin переключает клуб → данные обновляются без логина повторно

---

## 12. Definition of Done

- [ ] 10 клубов созданы через `/api/admin/clubs`
- [ ] Каждый клуб имеет свой `scrape_config` и cron подтягивает standings раздельно
- [ ] head_coach клуба A не видит ни одной строки клуба B (HTTP 403/404 на любой ID)
- [ ] super_admin может переключать клуб в шапке без логина
- [ ] Брендинг (логотип/палитра) корректно подтягивается на старте после смены клуба
- [ ] Push-уведомления уходят только подписчикам нужного club_id
- [ ] Прогон полного flow: загрузка PDF клубом A → подписчики A получают push, подписчики B не получают
- [ ] Документация HANDOFF обновлена (раздел «Multi-club», «Регистрация нового клуба»)
