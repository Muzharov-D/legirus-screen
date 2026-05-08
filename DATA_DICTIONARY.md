# DATA DICTIONARY — match-001.json (Легирус 4:0 Пороховчанин, 19.04.2026)

## Источник
PDF Sportvisor `6097_4265.pdf`, 35 страниц.

## Структура match-001.json (313 KB)

### Корневой объект

| Поле | Тип | Описание | Источник в PDF |
|------|-----|----------|----------------|
| `id` | string | "match-001" | — |
| `date` | ISO date | "2026-04-19" | page 1 header |
| `season` | string | "2025-2026" | — |
| `homeTeam` | object | Легирус 2010 | page 1 |
| `awayTeam` | object | Пороховчанин 2010 | page 1 |
| `score.home` | int | 4 | page 1 |
| `score.away` | int | 0 | page 1 |
| `teamSummaryStats` | object | командная сводка home / away | page 1 центральная панель |
| `formation` | object | состав на поле + запасные | page 1 левая часть |
| `teamAggregates` | object | 9 командных дашбордов | pages 12-20 |
| `players[]` | array of 15 | детали по каждому игроку | pages 2-11, 21-35 |
| `teamAvgRatings` | object | средние рейтинги по составу | вычислено |
| `guestTeamPlaceholder` | string | сообщение об отсутствии данных соперника | page 1 |

### `teamSummaryStats.{home|away}` (page 1)

| Поле | Тип | Пример (home) | Описание |
|------|-----|---------------|----------|
| `possessionPct` | int 0-100 | 58 | Владение, % |
| `shots.total` | int | 13 | Удары, всего |
| `shots.accuracy` | int | 69 | % попадания в створ |
| `shots.onTarget` | int | 9 | Удары в створ |
| `expectedGoals` | float | 2.5 | xG |
| `passes.total` | int | 413 | Передачи, всего |
| `passes.accuracy` | int | 62 | % точных |
| `passes.successful` | int | 257 | Точные |
| `freeKickShots` | int | 6 | Удары со штрафных |
| `corners.total` | int | 4 | Угловые, всего |
| `corners.accuracy` | int | 25 | % реализации |
| `corners.successful` | int | 1 | Угловые с ударом |
| `fouls` | int | 6 | Нарушения |
| `yellowCards` | int | 0 | Жёлтые |
| `redCards` | int | 0 | Красные |
| `offsides` | int | 0 | Офсайды |

### `formation.starters[]` (page 1)

11 игроков. Каждый:
| Поле | Описание |
|------|----------|
| `number` | номер на майке |
| `shortName` | "В. Воронков" |
| `rating` | рейтинг матча (0.0-10.0) |
| `goals` | голы в матче |
| `positionSlot` | "Центральный нападающий" |

### `formation.substitutes[]` (page 1)

4 запасных. Поля: number, shortName, rating.

### `teamAggregates` (pages 12-20)

| Секция | PDF page | Содержание |
|--------|----------|------------|
| `shooting` | 12 | totalShots, avgShotDistance, shotsOnTarget, expectedGoals |
| `setPieces` | 13 | throwIns, freeKicks, freeKicksWithShot, penalty, corners, offsides |
| `possession` | 14 | possessionsCount, losses, byThird |
| `passes` | 15 | forward, back, sideways, short, middle, long, progressive, toFinalThird, crosses, goalKicks, oppda, passesPerMinute |
| `attacks` | 16 | positional, counterattacks, defenceBreakthroughs, crossingMidfield |
| `recoveriesAndTackling` | 17 | recoveries by third, returns, tacklesLine |
| `duels` | 18 | totalDuels, aerialDuels |
| `pressing` | 19 | pressing, counterpressing, averagePPDA |
| `positioning` | 20 | shotsAgainst, interceptions, clearance, fouls, cards |

Формат значений: `{ "value": число, "pct": процент?, "successful": успешные? }`. Например `corners.total = {"value": 4, "pct": 25, "successful": 1}` — 4 угловых, 25% реализации, 1 с ударом.

### `players[]` — 15 объектов (pages 2-11, 21-35)

#### Базовые поля

| Поле | Пример |
|------|--------|
| `id` | "p05-galitsky" (стабильный, не autoincrement) |
| `number` | 5 |
| `fullName` | "Михаил Галицкий" |
| `lastName` | "Галицкий" |
| `firstName` | "Михаил" |
| `shortName` | "Галицкий М." (формат таблиц pages 2-11) |
| `position` | "ЗАЩ" / "ЦП" / "НАП" / "ВР" / "SUB" |
| `positionFull` | "Центральный защитник" |
| `minutes` | 84 |

#### `ratings` (page 2 + индивидуальная страница)

```json
"ratings": { "overall": 9.5, "fitness": 8.2, "attack": 7.3, "defence": 8.4 }
```

#### `radar` (page 2 — это те же значения, что в radar диаграмме на индивидуальной странице)

14 ключей со значениями 0-10:
tackling, positioning, duels, pressing, distance, intensity, forwardPlay, possession, dribbling, shooting, setPiece, defenceTotal, fitnessTotal, attackTotal + speed, goalkeeping (доп.).

Использование: рисовать radar используя 14 осей из `metrics.json/radarAxes`.

#### `stats` — 9 групп статистики из pages 2-11

##### `stats.fitness` (page 3)

| Поле | Тип | Пример (Галицкий) | Описание |
|------|-----|-------------------|----------|
| `minutes` | int | 84 | Минуты |
| `fitnessTotal` | float | 8.2 | Общий фитнес-индекс |
| `totalDistance` | float | 11562.37 | Общая дистанция, м |
| `speed_4_5_5` | float | 703.29 | Дистанция в зоне 4-5.5 м/с |
| `speed_5_5_7` | float | 193.94 | Дистанция в зоне 5.5-7 м/с |
| `speed_7plus` | float | 683.73 | Дистанция в зоне 7+ м/с |
| `intenseRunning` | float | 3.80 | Интенсивный бег |
| `sprintsCount` | int | 57 | Количество спринтов |
| `sprintDistance` | float | 683.73 | Дистанция спринтов |
| `averageSpeed` | float | 2.31 | Средняя скорость, м/с |

##### `stats.attack1` (page 4) — голы и xG

| Поле | Описание |
|------|----------|
| `attackTotal` | общий рейтинг атаки |
| `goalActions` | голевые действия |
| `xG` | ожидаемые голы |
| `xA` | ожидаемые ассисты |
| `keyPass` | ключевые передачи |
| `assist`, `secondAssist`, `thirdAssist` | передачи в атаке |

##### `stats.attack2` (page 5) — пасы развития

10 полей в формате `{value, pct?}`: shotAssist, shotOnTargetAssist, intoPenArea, cross, passPacking, throughPass, progressivePass, passToFinalThird, progressiveRun, pass.

##### `stats.attack3` (page 6) — пасы по типу/направлению

passForward, passBack, passSideways, passShort, passMiddle, passLong, touchesInPenArea, receivedPass, foulsSuffered, technicalMistake.

##### `stats.attack4` (page 7) — потери и удары

loseOnOwnHalf, lostBall, dangerousLosesOnOwnHalf, dribble, dribblePacking, dribbleAgainst, goal, shot, freeKick, freeKickShot.

##### `stats.attack5` (page 8) — стандарты

directFreeKick, freeKickWithShot, entriesInBox, offside, penalty, byHead, corner, throwing, acceleration.

##### `stats.defence1` (page 9)

defenceTotal, tackle, slidingTackles, tackleAndRecovery, interception, recovery, clearance, blockedShot.

##### `stats.defence2` (page 10)

duel, aerialDuel, pressing, counterpressing, foul, yellowCard, redCard, dribbleAgainst, return, returnOnOppHalf.

##### `stats.defence3` (page 11)

save, goalkeeperExits, shotsAgainst, shotAgainst, goalKick, shortGoalKicks, longGoalKicks.

#### `splits` — 105 метрик с разбивкой Match / 1 тайм / 2 тайм (pages 21-35)

```json
"splits": {
  "Goal": { "match": 2, "first": 1, "second": 1 },
  "Pass forward accuracy": { "match": {"pct": 38}, "first": {"pct": 30}, "second": {"pct": 50} },
  ...
}
```

**Важно:** ключи на английском (как в PDF Sportvisor). Маппинг на русские лейблы — в `metrics.json/metricLabels`. Это исходные строки PDF — изменять опасно (потеря данных при переэкстракции).

Список 105 split-метрик (одинаков для всех игроков):

**Атака:** Offside, Pass with packing, Pass packing value, Pass into pen. area, Key pass, Cross, Entries in box, Assist, Second assist, Third assist, Shot on target assist, Sprint forward, Progressive pass, Progressive pass success, Progressive pass accuracy, Pass to final third, Pass to final third success, Pass to final third accuracy, Pass, Pass success, Pass accuracy, Pass forward, Pass forward success, Pass forward accuracy, Pass back, Pass back success, Pass back accuracy, Pass sideways, Pass sideways success, Pass sideways accuracy, Pass short, Pass short success, Pass short accuracy, Pass middle, Pass middle success, Pass middle accuracy, Pass long, Pass long success, Pass long accuracy, Touches in pen. area, Received pass, Fouls suffered, Lose on own half, Dangerous loses on own half, Autogoal, Technical mistake, Lost ball, Dribble, Dribble success, Success rate (дриблинг), Dribble packing, Dribble packing value, Goal actions, Goal, Shot, Shot success, Shot accuracy, Shot by head, Shot by head success, Shot by head accuracy, Free kick shot, Free kick shot success, Free kick shot accuracy, Free kick pass, Free kick pass success, Free kick pass accuracy, Direct free kick, Success, Accuracy, Free kick with shot, Penalty, Penalty success, Throwing, Throwing success, Throwing accuracy.

**Защита:** Tackle, Tackle success, Success rate (отбор), Sliding tackles, Dribble against, Return, Return on opp. half, Tackle & recovery, Tackle & recovery on opp. half, Blocked shot, Clearance, Clearance success, Foul, Interception, Sprint back, Recovery, Yellow card, Red card, Duel, Duel success, Ariel duel, Ariel duel success, Pressing, Contrpressing, Save, Shots against, Goalkeeper exits, Goal kick, Goal kick success, Short goal kicks, Long goal kicks.

### `teamAvgRatings` (вычислено)

Среднее по 15 игрокам:
```
overall: 8.08
fitness: 7.63
attack: 6.85
defence: 7.14
```

При расчёте можно использовать только стартеров (11) — для большей репрезентативности.

---

## Маппинг PDF → JSON

| PDF page | JSON path |
|----------|-----------|
| 1 (формация) | `formation` |
| 1 (центр панель) | `teamSummaryStats.{home,away}` |
| 2 (Player Stats Overall) | `players[].radar` + ratings + `players[].stats` ниже |
| 3 (Player Stats Fitness) | `players[].stats.fitness` |
| 4 (Attack 1/5) | `players[].stats.attack1` |
| 5 (Attack 2/5) | `players[].stats.attack2` |
| 6 (Attack 3/5) | `players[].stats.attack3` |
| 7 (Attack 4/5) | `players[].stats.attack4` |
| 8 (Attack 5/5) | `players[].stats.attack5` |
| 9 (Defence 1/3) | `players[].stats.defence1` |
| 10 (Defence 2/3) | `players[].stats.defence2` |
| 11 (Defence 3/3) | `players[].stats.defence3` |
| 12 (Shooting) | `teamAggregates.shooting` |
| 13 (Set pieces) | `teamAggregates.setPieces` |
| 14 (Possession) | `teamAggregates.possession` |
| 15 (Passes) | `teamAggregates.passes` |
| 16 (Attacks) | `teamAggregates.attacks` |
| 17 (Recoveries) | `teamAggregates.recoveriesAndTackling` |
| 18 (Duels) | `teamAggregates.duels` |
| 19 (Pressing) | `teamAggregates.pressing` |
| 20 (Positioning) | `teamAggregates.positioning` |
| 21-35 (индивидуалы) | `players[].splits` (105 метрик × M/1/2) |
