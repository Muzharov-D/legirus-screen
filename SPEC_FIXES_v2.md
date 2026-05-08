# SPEC_FIXES_v2.md — Lightbox карт и починка навигации ИИ-агента

**Дата:** 2026-04-30
**Статус:** к реализации Claude Code
**Контекст:** после первой итерации (`SPEC_FIXES_v1.md`) пользователь сообщил два новых дефекта:

1. PNG-карты, вырезанные из PDF Sportvisor, отображаются мелко — зональные числа на полях нечитаемы. Карты не кликабельны.
2. ИИ-агент не переходит по предлагаемым подсказкам — кнопка «Открыть» в карточке агента ничего не делает на половине экранов.

Все правки строго в `C:\Users\dmuzharov\Documents\Claude\Projects\Экран Легирус`.

---

## C1. Lightbox для PNG-карт

### Текущее состояние

`frontend/src/components/SoccerFieldImageMap.jsx` (26 строк) рендерит обычный `<img>` без любого взаимодействия:

```jsx
<img src={url} alt={...} style={{ height, width: 'auto' }} onError={...} />
```

Высоты карт по умолчанию — 320–420 px. Вырезанные регионы шириной ~485 px (см. `crop_maps.py`) при таком масштабе сжимаются и зональные числа («3», «5», «12»…) становятся нечитаемыми.

Места использования компонента:

- `frontend/src/pages/PlayerDetail.jsx` — две карты: `attackMap` и `fitnessHeatmap`
- `frontend/src/pages/MatchDetail.jsx` — командные карты по 8 секциям из `teamAggregates.{section}.mapImage`
- (потенциально на `match-team-aggregates` экране, если будет реализован)

### Задание

**Файл:** `frontend/src/components/SoccerFieldImageMap.jsx`

Расширить компонент: при клике по карте открывается полноэкранный модал с увеличенной картой.

**Поведение:**

1. Курсор `zoom-in` на `.soccer-map__frame`
2. Значок 🔍 в правом верхнем углу карты (CSS-only, position: absolute) с подписью «Увеличить» — для аффорданса.
3. Клик по карте → `setIsOpen(true)`.
4. Модал рендерится через `createPortal(modal, document.body)` — чтобы не подрезался overflow родителей.
5. Модал занимает 100% viewport, фон `rgba(0, 0, 0, 0.85)`, изображение по центру с `max-width: 92vw; max-height: 88vh; object-fit: contain;`.
6. Заголовок (если задан `title`) — над изображением, цвет золотой.
7. Закрытие тремя способами: клик по фону (не по самому `<img>`), клик по кнопке `×` в правом верхнем углу модала, клавиша `Esc`.
8. При открытом модале блокировать прокрутку body (`document.body.style.overflow = 'hidden'`), при закрытии — возвращать.
9. Plain animation: `opacity 0 → 1` за 180ms на overlay; на изображении — лёгкое масштабирование `scale(0.96)` → `scale(1)` за 200ms.

### Готовый код для замены

`frontend/src/components/SoccerFieldImageMap.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toAssetUrl } from '../services/api';
import './SoccerFieldImageMap.css';

export default function SoccerFieldImageMap({ src, title, height = 320, alt = '' }) {
  const [errored, setErrored] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const url = toAssetUrl(src);

  // ESC closes modal + body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const canOpen = !errored && url;

  return (
    <div className="soccer-map">
      {title && <div className="soccer-map__title">{title}</div>}
      <div
        className={`soccer-map__frame ${canOpen ? 'soccer-map__frame--clickable' : ''}`}
        onClick={() => canOpen && setIsOpen(true)}
        role={canOpen ? 'button' : undefined}
        tabIndex={canOpen ? 0 : undefined}
        onKeyDown={(e) => { if (canOpen && (e.key === 'Enter' || e.key === ' ')) setIsOpen(true); }}
        title={canOpen ? 'Нажмите для увеличения' : undefined}
      >
        {canOpen ? (
          <>
            <img
              src={url}
              alt={alt || title || 'Карта поля'}
              style={{ height, width: 'auto', display: 'block' }}
              onError={() => setErrored(true)}
            />
            <div className="soccer-map__zoom-hint" aria-hidden="true">
              <span className="soccer-map__zoom-icon">🔍</span>
              <span className="soccer-map__zoom-label">Увеличить</span>
            </div>
          </>
        ) : (
          <div className="soccer-map__empty" style={{ height }}>Нет карты</div>
        )}
      </div>

      {isOpen && createPortal(
        <div className="soccer-map__lightbox" onClick={() => setIsOpen(false)}>
          <button
            className="soccer-map__lightbox-close"
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
            aria-label="Закрыть"
          >
            ×
          </button>
          {title && <div className="soccer-map__lightbox-title">{title}</div>}
          <img
            className="soccer-map__lightbox-img"
            src={url}
            alt={alt || title || 'Карта поля'}
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </div>
  );
}
```

### CSS — дописать в `frontend/src/components/SoccerFieldImageMap.css`

В **конец** файла:

```css
.soccer-map__frame {
  position: relative;
}
.soccer-map__frame--clickable {
  cursor: zoom-in;
  transition: box-shadow 0.15s, transform 0.15s;
}
.soccer-map__frame--clickable:hover {
  box-shadow: 0 0 0 2px rgba(255, 208, 0, 0.5);
  transform: translateY(-1px);
}
.soccer-map__frame--clickable:focus-visible {
  outline: 2px solid #ffd000;
  outline-offset: 2px;
}

.soccer-map__zoom-hint {
  position: absolute;
  top: 14px;
  right: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 14px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
}
.soccer-map__frame--clickable:hover .soccer-map__zoom-hint,
.soccer-map__frame--clickable:focus-visible .soccer-map__zoom-hint {
  opacity: 1;
}
.soccer-map__zoom-icon { font-size: 12px; }
.soccer-map__zoom-label { letter-spacing: 0.03em; }

.soccer-map__lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  animation: lb-fade 0.18s ease-out;
}
@keyframes lb-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.soccer-map__lightbox-close {
  position: absolute;
  top: 24px;
  right: 32px;
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  color: #fff;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.soccer-map__lightbox-close:hover {
  background: rgba(255, 208, 0, 0.18);
  color: #ffd000;
}
.soccer-map__lightbox-title {
  color: #ffd000;
  font-size: 16px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 18px;
}
.soccer-map__lightbox-img {
  max-width: 92vw;
  max-height: 84vh;
  object-fit: contain;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  cursor: default;
  animation: lb-zoom 0.2s ease-out;
}
@keyframes lb-zoom {
  from { transform: scale(0.96); }
  to   { transform: scale(1); }
}
```

### Definition of done — C1

- [ ] Клик по любой карте на `players-detail` (Карта пасов и ударов, Тепловая карта движения) открывает full-screen модал с увеличенной картой.
- [ ] Клик по любой командной карте на `match-detail` (если они уже там есть) — то же.
- [ ] При hover на карту виден лейбл «🔍 Увеличить» в правом верхнем углу.
- [ ] Курсор на frame — `zoom-in`.
- [ ] Esc, клик по фону, клик по `×` — все три закрывают модал.
- [ ] Прокрутка body заблокирована, пока модал открыт.
- [ ] Никаких ошибок в консоли.
- [ ] Если `src` отсутствует или 404 — карта показывает «Нет карты», на ней клик ничего не делает.

---

## C2. Починка навигации ИИ-агента

### Текущее состояние

`frontend/src/components/AgentCard.jsx` уже умеет рисовать кнопку CTA «{label} →» и вызывать `navigate(path)`. Но логика маршрутизации поломана:

```jsx
const screenToPath = {
  'analytics-overview': '/analytics',
  'match-detail': '/matches/match-001',          // ❌ matchId захардкожен
  'match-team-aggregates': '/analytics/team',    // ❌ это путь сравнения, а не агрегатов
  'match-initial': '/matches',
  'matches-overview': '/matches',
  'players-leaders': '/players',
  'players-detail': null,                        // ❌ null — кнопка молча не работает
  'comparison': '/analytics/team',
};

function go() {
  if (!data?.nextStep) return;
  const path = screenToPath[data.nextStep.screen];
  if (path) {
    navigate(path);
    onClose?.();
  }
}
```

Сценарии, в которых кнопка ничего не делает:

| Откуда (screenId) | Что возвращает agent (`nextStep.screen`) | Что в map | Результат |
|-------------------|-----------------------------------------|-----------|-----------|
| `players-leaders`  | `players-detail`                        | `null`    | Молча не работает |
| `players-detail`   | `players-detail-vs-team`                | нет ключа | Молча не работает |
| `match-detail`     | `match-team-aggregates`                 | `/analytics/team` | Уводит на ComparisonView (не дашборды) |
| `analytics-overview` | `match-detail`                       | `/matches/match-001` | Работает, но игнорирует context.matchId |

Источник правил: `backend/data/agent-rules.json`. Там `players-detail.nextStep.screen === 'players-detail-vs-team'` — но реального экрана с таким ID нет, это секция внутри `players-detail`.

### Задание

#### C2.1 Frontend — переписать AgentCard

**Файл:** `frontend/src/components/AgentCard.jsx`

Заменить плоский `screenToPath` на функцию `screenToUrl(screen, context)`, которая учитывает `matchId` и `playerId` из контекста и поддерживает якоря для секций внутри страницы.

**Готовый код для замены:**

```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAgentInsight } from '../services/api';
import './AgentCard.css';

const SCREEN_ROUTES = {
  'analytics-overview':     () => '/analytics',
  'comparison':             () => '/analytics/team',
  'analytics-team-positive': () => '/analytics/team',
  'analytics-team-negative': () => '/analytics/team',

  'matches-overview':       () => '/matches',
  'match-initial':          () => '/matches',
  'match-detail':           (ctx) => `/matches/${ctx?.matchId || 'match-001'}`,
  'match-team-aggregates':  (ctx) => `/matches/${ctx?.matchId || 'match-001'}#aggregates`,

  'players-leaders':        () => '/players',
  'players-rating':         () => '/players/rating',
  'players-detail':         (ctx) => (ctx?.playerId ? `/players/${ctx.playerId}` : '/players'),
  'players-detail-vs-team': (ctx) => (ctx?.playerId ? `/players/${ctx.playerId}#vs-team` : '/players'),
  'players-detail-by-position': (ctx) => (ctx?.playerId ? `/players/${ctx.playerId}#by-position` : '/players'),
  'players-detail-halftime':    (ctx) => (ctx?.playerId ? `/players/${ctx.playerId}#halftime` : '/players'),
};

function screenToUrl(screen, context) {
  const fn = SCREEN_ROUTES[screen];
  return fn ? fn(context) : null;
}

export default function AgentCard({ screenId, context, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAgentInsight(screenId, context)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [screenId, JSON.stringify(context || {})]);

  const nextPath = data?.nextStep ? screenToUrl(data.nextStep.screen, context) : null;
  const canGo = Boolean(nextPath);

  function go() {
    if (!canGo) return;
    // Support hash navigation: split path + hash; navigate then scroll to hash
    const [pathname, hash] = nextPath.split('#');
    navigate(hash ? `${pathname}#${hash}` : pathname);
    if (hash) {
      // delay so the destination page mounts before scrolling
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
    onClose?.();
  }

  return (
    <div className="agent-card">
      <div className="agent-card__head">
        <span className="agent-card__title">ИИ-агент</span>
        <button className="agent-card__close" onClick={onClose}>✕</button>
      </div>
      {loading && <div className="agent-card__loading">Анализ экрана…</div>}
      {error && <div className="agent-card__error">Ошибка: {error}</div>}
      {data && (
        <div className="agent-card__body">
          <div className="agent-card__section">
            <div className="agent-card__label">Что важно сейчас</div>
            <div className="agent-card__text">{data.important}</div>
          </div>
          <div className="agent-card__section">
            <div className="agent-card__label">Что это значит</div>
            <div className="agent-card__text">{data.meaning}</div>
          </div>
          {data.nextStep && (
            <button
              className={`agent-card__cta ${canGo ? '' : 'agent-card__cta--disabled'}`}
              onClick={go}
              disabled={!canGo}
              title={canGo ? '' : 'Переход недоступен для этого экрана'}
            >
              {data.nextStep.label} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

#### C2.2 CSS — дописать disabled-стиль

В `frontend/src/components/AgentCard.css` добавить:

```css
.agent-card__cta--disabled {
  background: rgba(255, 208, 0, 0.18);
  color: rgba(14, 14, 42, 0.5);
  cursor: not-allowed;
  filter: grayscale(0.4);
}
```

#### C2.3 Backend — починить agent-rules.json

**Файл:** `backend/data/agent-rules.json`

`players-detail.nextStep.screen` сейчас `players-detail-vs-team` — экран с таким именем не существует. Заменить, чтобы переход был на реальный экран. Также добавить правило для нового экрана `players-rating`.

Заменить блок `"players-detail"` на:

```json
"players-detail": {
  "important": "Игрок {playerName}, рейтинг {playerRating}, {minutes} мин. на поле.",
  "meaning": "Сравните 1 тайм vs 2 тайм по спринтам ({sprintFirst} vs {sprintSecond}) и голам ({goalFirst} vs {goalSecond}). Радар покажет сильные и слабые стороны.",
  "nextStep": { "label": "Сравнить с командой", "screen": "players-detail-vs-team" }
},
```

(Оставить как есть — `players-detail-vs-team` теперь корректно резолвится во фронте через хеш-якорь `/players/{id}#vs-team`. См. C2.4.)

И добавить новое правило для `players-rating`:

```json
"players-rating": {
  "important": "Все 15 игроков команды отсортированы по выбранной метрике.",
  "meaning": "Активная метрика подсвечена прогресс-баром — её значение видно у каждого игрока. Кликните строку, чтобы открыть золотой профиль.",
  "nextStep": { "label": "К лидерам матча", "screen": "players-leaders" }
},
```

#### C2.4 Frontend — добавить anchors на `players-detail`

**Файл:** `frontend/src/pages/PlayerDetail.jsx`

Чтобы хеш-навигация (`/players/{id}#vs-team`) работала, добавить `id` атрибуты на ключевые секции:

| Секция | id |
|--------|----|
| Карточка «Игрок vs средние по команде» | `vs-team` |
| Карточка «Сравнение по позиции» | `by-position` |
| Карточка «1 тайм vs 2 тайм» (HalfTimeBars) | `halftime` |

Пример:

```jsx
<div className="card" id="vs-team">
  <div className="page-section-title">Игрок vs средние по команде</div>
  ...
</div>
```

После реализации C2.1 (со scrollIntoView) при клике из агента «Сравнить с командой» страница откроется и автоматически скролится к этой секции.

### Definition of done — C2

- [ ] Кнопка CTA в агенте на `analytics-overview` ведёт на `/matches/{matchId}` (не на захардкоженный `match-001`, а на реальный из контекста).
- [ ] Кнопка CTA на `players-leaders` ведёт на `/players` (или на профиль лидера, если контекст содержит playerId).
- [ ] Кнопка CTA на `players-detail` ведёт на `/players/{id}#vs-team` и страница плавно скролится к карточке «Игрок vs средние по команде».
- [ ] Кнопка CTA на `match-detail` ведёт на `/matches/{matchId}#aggregates` (anchor зарезервирован — рендерить экран match-team-aggregates позже).
- [ ] Если `nextStep.screen` не зарезолвлен в `SCREEN_ROUTES`, кнопка остаётся видимой, но visibly disabled (полупрозрачная, cursor not-allowed, hint в title).
- [ ] Никаких console.error при кликах.

---

## D. Порядок реализации (рекомендация)

1. **C1** — lightbox карт (изолированная правка, можно сразу проверять).
2. **C2.3** — agent-rules.json (исправить правила).
3. **C2.1 + C2.2** — переписать AgentCard + добавить disabled-стиль.
4. **C2.4** — добавить anchors на PlayerDetail.
5. Сборка `npm run build`, smoke-test (как в SPEC_FIXES_v1, B6).

---

## E. Карта изменяемых файлов

```
ИЗМЕНЯЮТСЯ:
~ frontend/src/components/SoccerFieldImageMap.jsx     (lightbox + portal)
~ frontend/src/components/SoccerFieldImageMap.css     (clickable frame, hint, lightbox styles)
~ frontend/src/components/AgentCard.jsx               (новый screenToUrl, scrollIntoView, disabled state)
~ frontend/src/components/AgentCard.css               (disabled CTA стиль)
~ frontend/src/pages/PlayerDetail.jsx                 (id atributes для anchors)
~ backend/data/agent-rules.json                       (добавлено правило для players-rating)
```

Никакие seed-данные, парсеры, PNG не трогаются.

---

## F. Что вне рамок этой спеки

- Реализация отдельного экрана `match-team-aggregates` (9 секций по pages 12-20) — отдельная задача, упомянута в `TASK_SPEC_FOR_CODE.md` §4.2 и в `SPEC_FIXES_v1.md` B2.
- Pan/zoom внутри lightbox (свайпом / колесом) — не нужен, обычное увеличение полностью решает проблему читаемости зон.
- Lazy-loading карт — карты лежат локально в `/assets/maps/`, не nado.

---

## G. Контакт

- Проект: «Экран Легирус» (АванDата × ФК Легирус 2010)
- Бренд: SportData (`ai4sportdata@gmail.com`)
- Дата спеки: 30.04.2026
- Связана с: `SPEC_FIXES_v1.md` (предыдущая итерация — была сосредоточена на дизайне и таблице игроков)
