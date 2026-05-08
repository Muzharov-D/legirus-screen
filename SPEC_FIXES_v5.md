# SPEC_FIXES_v5.md — Фильтрация match для роли player: оставить публичные данные команды

**Дата:** 2026-04-30
**Статус:** к реализации Claude Code

---

## F1. Проблема

В роли `player` на главной (`/analytics`) в блоке «Лучший игрок матча» отображается **сам залогинившийся игрок**, а не реальный MOTM команды. Та же беда:

- Топ-5 игроков матча — показывает только себя (1 строка)
- Лидеры по линиям — только себя
- Рейтинг игроков (`/players/rating`) — таблица из 1 строки
- Лидеры категорий (`/players`) — везде «—» или «себя»

### Причина

В `backend/routes/data.js` для роли `player` мы фильтруем `match.players` до одного — собственного — игрока:

```js
if (req.user?.role === 'player') {
  const ownId = req.user.playerId;
  const owned = (match.players || []).find((p) => p.id === ownId);
  const filtered = {
    ...match,
    players: owned ? [owned] : [],   // ← здесь
  };
  return res.json(filtered);
}
```

Фронт сортирует `match.players` для определения MOTM / top-5 / лидеров — но в массиве остался один пользователь, поэтому он же и «лучший».

---

## F2. Решение — публичные/приватные поля игрока

В команде есть данные **публичные** (видят все, в том числе другие игроки) и **приватные** (только тренер + свой профиль).

### Публичные поля (видят все роли)

```
id, number, fullName, lastName, firstName, shortName,
position, positionFull, minutes,
ratings: { overall, fitness, attack, defence },
stats: { ... все группы — публичные агрегаты матча }
```

Логика: голы, удары, отборы, спринты, дистанция и пр. **видны на матче с трибуны** или на бумажном протоколе. Это не приватная информация. Тренер тоже разделяет эти числа с командой.

### Приватные поля (только свой профиль и тренер)

```
splits   — раскладка по таймам (1 тайм vs 2 тайм)
radar    — детальные значения по 14 осям радара
maps     — индивидуальные карты пасов и тепловые карты
```

Логика: это глубокая аналитика, обычно её обсуждают тренер с конкретным игроком наедине. Игрок видит только свои splits/radar/maps. Чужие — нет.

---

## F3. Что сделать

**Файл:** `backend/routes/data.js` — заменить блок фильтрации для роли player:

```js
router.get('/match/:matchId', (req, res) => {
  try {
    const match = loadMatch(req.params.matchId);

    if (req.user?.role === 'player') {
      const ownId = req.user.playerId;

      // Для каждого игрока: если это он сам — полный объект;
      // если другой — урезанный (без splits/radar/maps).
      const sanitize = (p) => {
        if (p.id === ownId) return p;          // свой — всё
        const { splits, radar, maps, ...publicFields } = p;
        return publicFields;                   // другие — без приватного
      };

      const filtered = {
        ...match,
        players: (match.players || []).map(sanitize),
        _filteredFor: ownId,
      };
      return res.json(filtered);
    }

    res.json(match);
  } catch (e) {
    res.status(404).json({ error: `Матч ${req.params.matchId} не найден` });
  }
});
```

Всё, фронт менять не надо: компоненты ClubOverview, PlayersLeaders, PlayersRating используют `match.players[i].ratings` и `match.players[i].stats` — оба этих поля теперь возвращаются для всех. А PlayerDetail на чужого игрока всё равно редиректит на свой (см. SPEC_FIXES_v3 D2.8) — так что отсутствие splits/radar/maps у других не критично.

---

## F4. Definition of done

- [ ] Логин как player (например `turapin`) → `/analytics`:
  - Блок «Лучший игрок матча» показывает **Галицкого М.** (или того, у кого max overall в матче), а не самого Турапина (если он не лидер).
  - Топ-5 игроков матча — 5 разных игроков, отсортированных по overall.
  - Лидеры по линиям — лидер каждой линии (защита, полузащита, нападение, вратари).
- [ ] `/players` (лидеры категорий) — все 10 карточек заполнены: голы, удары, отборы и т.д. — настоящими лидерами, не самим залогиненным.
- [ ] `/players/rating` — таблица с 15 строками (все игроки команды), сортировка работает.
- [ ] `/players/p17-turapin` (если залогинен Турапин) — открывается; splits/radar/maps на месте.
- [ ] `/players/p05-galitsky` (если залогинен Турапин) — автоматический редирект на `/players/p17-turapin` (как и раньше — этот guard на фронте).
- [ ] DevTools → Network → `/api/data/match/match-001` для роли player → внутри `players[]` 15 объектов; в **15 - 1 = 14** из них **отсутствуют** ключи `splits`, `radar`, `maps`; в одном — присутствуют (свой ID).

---

## F5. Карта изменяемых файлов

```
ИЗМЕНЯЕТСЯ:
~ backend/routes/data.js   (заменить блок фильтрации для player)
```

Никакие фронтенд-файлы, парсеры, seed-данные, .gitignore НЕ трогаются.

---

## F6. Команда для Claude Code

```
Реализуй SPEC_FIXES_v5.md в этой папке. Это бэкенд-only правка
в backend/routes/data.js — заменить фильтрацию для роли player
(оставить всех игроков с урезанными приватными полями).

Готовый код для замены роута приведён в спеке F3.

После — git commit, git push origin main. Render
автоматически передеплоит за 1-2 минуты (пересобирать ничего не
нужно, это runtime изменение).

Smoke-test после деплоя:
  1. На https://legirus-screen.vercel.app залогинься как player
     (например, turapin).
  2. На /analytics MOTM должен быть Галицкий М. (не Турапин).
  3. На /players/rating должна быть таблица из 15 строк.
  4. /players/p05-galitsky должен редиректить на /players/p17-turapin.

Не трогай frontend, парсеры, seed-данные.
```

---

## Контакт

- Проект: «Экран Легирус» (АванDата × ФК Легирус 2010)
- Бренд: SportData (`ai4sportdata@gmail.com`)
- Дата спеки: 30.04.2026
- Связана с: SPEC_FIXES_v3 D1.8 (изначальная фильтрация match для player)
