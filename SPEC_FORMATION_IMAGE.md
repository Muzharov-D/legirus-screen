# SPEC_FORMATION_IMAGE — fallback на PNG расстановки из PDF

## Контекст

Парсер расстановки геометрически сопоставляет жирные глифы номеров с именами и рейтингами по координатам. Это работает для PDF 2010 (полная расстановка), но не для PDF 2011 (тренер не назначил позиции в Sportvisor) и не извлекает `goals` (количество голов в форме игрока) и `positionSlot` (название позиции на поле).

Решение: бэкенд теперь крапит сам блок расстановки с page 1 PDF как PNG (`-formation-map.png` 200 DPI и `-formation-full.png` 300 DPI). Это даёт «бесплатно» весь визуал — фото игроков, цвета команды, отметки голеатора `x2`, блок «Запасные» — без необходимости реконструировать данные.

JSON match теперь содержит:

```json
{
  "formation": { "starters": [...], "substitutes": [...] }   // structured (если есть)
  "formationImage": "/api/maps/match-XXX-formation-map.png",
  "formationImageFull": "/api/maps/match-XXX-formation-full.png"
}
```

PNG для match-001 и match-002 уже сгенерированы и закоммичены в `frontend/public/assets/maps/`.

## Цель

Frontend `FormationField` компонент должен показывать **картинку** из `formationImage` если `formation.starters` пуст или `formation` равен `null`. Если есть structured `formation.starters` — продолжать рендерить как сейчас (для match-001).

## Что менять

### 1) `frontend/src/components/FormationField.jsx`

Принять два новых prop'а и сделать early-return на картинку:

```jsx
export default function FormationField({
  formation,
  players,
  ourTeamName = 'Легирус 2010',
  imageSrc,         // NEW — /assets/maps/<id>-formation-map.png
  imageFullSrc,     // NEW — для лайтбокса (опционально)
}) {
  const starters = formation?.starters || [];
  const subs = formation?.substitutes || [];

  // ── Fallback на картинку расстановки из PDF ──
  if (starters.length === 0 && imageSrc) {
    return (
      <div className="formation">
        <div className="formation__head">
          <div className="formation__title">Расстановка</div>
          <div className="formation__team">{ourTeamName}</div>
        </div>
        <a
          className="formation__pitch-wrap"
          href={imageFullSrc || imageSrc}
          target="_blank"
          rel="noopener noreferrer"
          title="Открыть в полном размере"
        >
          <img
            src={imageSrc}
            alt={`Расстановка ${ourTeamName}`}
            className="formation__pitch-img"
          />
        </a>
      </div>
    );
  }

  // existing structured rendering — без изменений
  const placed = buildLayout(starters);
  // ... rest of the file as-is
}
```

### 2) `frontend/src/components/FormationField.css`

Добавить стиль для картинки в конец файла:

```css
.formation__pitch-img {
  display: block;
  width: 100%;
  height: auto;
  max-width: 600px;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
}
.formation__pitch-wrap {
  display: block;
  text-align: center;
  cursor: zoom-in;
}
```

### 3) `frontend/src/pages/MatchDetail.jsx`

Передать новые props в `FormationField`:

Старая строка 130:
```jsx
<FormationField formation={match.formation} players={players} ourTeamName={match.homeTeam?.name} />
```

Заменить на:
```jsx
<FormationField
  formation={match.formation}
  players={players}
  ourTeamName={match.homeTeam?.name}
  imageSrc={match.formationImage}
  imageFullSrc={match.formationImageFull}
/>
```

## Регрессия и smoke-тест

1. Открыть match-001 (legirus-2010, есть `formation.starters` 11+4) → должна рендериться **прежняя структурная расстановка** на схеме поля. Картинка НЕ показывается.
2. Открыть match-002 (legirus-2011, `formation: null`, есть `formationImage`) → показывается **картинка расстановки из PDF**, обёрнутая в `<a target="_blank">` для открытия full-size.
3. Если у матча нет ни `formation.starters`, ни `formationImage` → пустое состояние / placeholder (как было).

## Не делать в этой работе

- Не менять `buildLayout`, `players`, `ratings` props.
- Не трогать `players.json` или backend.
- Не вводить отдельный image lightbox компонент — обычная ссылка `target="_blank"` достаточна для v1.

## Backend (для контекста, уже готов)

- `backend/parsers/crop_formation.py` рендерит формацию с page 1 PDF.
- `build_match.py` записывает `formationImage` + `formationImageFull` в match.json.
- PNG уже в `frontend/public/assets/maps/match-{001,002}-formation-{map,full}.png`.

После применения этой спеки и push'а на main — match-002 покажет реальную картинку расстановки из PDF на странице матча, а match-001 продолжит работать как сейчас.
