# Миграция проекта на новый ноут

## Что у тебя есть сейчас

- **GitHub репо:** `https://github.com/Muzharov-D/legirus-screen` (всё там, кроме .env и data/credentials.txt)
- **Render:** backend production + PostgreSQL
- **Vercel:** frontend production
- **DNS-провайдер sportdata.tech** — там CNAME mobile.legirus → vercel
- **Локальная папка:** `C:\Users\dmuzharov\Documents\Claude\Projects\Экран Легирус`

## ⚠️ Что НЕ в Git (надо забрать вручную!)

| Файл | Что внутри |
|---|---|
| `backend/.env` | VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, DATABASE_URL, FFSPB_API_KEY, FFSPB_ENDPOINT |
| `frontend/.env` | VITE_VAPID_PUBLIC_KEY |
| `backend/data/credentials.txt` | Пароли учёток для команд (20 строк) |
| `backend/data/*.json` | venues, club-shields, player-photos, push-subscriptions, users, agent-rules, matches, players, teams, metrics |

`.env` ключи можно восстановить из Render Dashboard / Vercel Dashboard если потеряются. JSON-data в основном дублируется в PostgreSQL на Render — но venues.json и client-shields.json могут отличаться. Сохрани всю папку `backend/data/` на всякий случай.

---

## Этап 1: Сохранить ВСЁ перед уходом (на старом ноуте)

### 1.1. Закоммитить и запушить незавершённое

```powershell
cd "C:\Users\dmuzharov\Documents\Claude\Projects\Экран Легирус"

# Если Cowork держит git lock — закрой его перед командами ниже
git status

# Если что-то не закоммичено:
git add -A
git commit -m "WIP: backup before laptop change"

# Пушим всё что есть локально:
git push

# Проверь что нет неопубликованных коммитов:
git log @{u}..HEAD --oneline
# Должно быть пусто
```

### 1.2. Создать backup-папку с критичными файлами

```powershell
$ts = Get-Date -Format 'yyyy-MM-dd-HHmm'
$backup = "C:\Backup\legirus-$ts"
New-Item -ItemType Directory -Path $backup -Force

# .env файлы
Copy-Item "backend\.env" "$backup\backend.env"
Copy-Item "frontend\.env" "$backup\frontend.env"

# backend/data — может отличаться от PG, копируем целиком
Copy-Item -Recurse "backend\data" "$backup\backend-data"

# Заметки и документация (на всякий)
Copy-Item "MIGRATION.md" "$backup\MIGRATION.md"
if (Test-Path "HANDOFF.md") { Copy-Item "HANDOFF.md" "$backup\HANDOFF.md" }
if (Test-Path "CLAUDE.md")  { Copy-Item "CLAUDE.md"  "$backup\CLAUDE.md" }

Write-Host "Backup готов: $backup"
explorer $backup
```

### 1.3. Сохранить секреты Render и Vercel в текстовый файл

В **Render Dashboard** → твой сервис `legirus-api` → Environment:
- Скопируй ВСЕ переменные KEY=VALUE в файл `$backup\render-env.txt`

В **Vercel Dashboard** → твой проект → Settings → Environment Variables:
- Скопируй ВСЕ переменные в файл `$backup\vercel-env.txt`

В **GitHub Repo** → Settings → Secrets and variables → Actions:
- Записать имена секретов (значения GitHub не показывает) — `$backup\github-secrets.txt`

### 1.4. Скопировать backup в безопасное место

Хотя бы в **два** разных места:

```powershell
# Скопируй $backup на USB-флешку
Copy-Item -Recurse $backup "E:\Backup\"  # E: — твоя флешка

# И в облако (Yandex Disk / Google Drive / OneDrive — что есть)
# Просто перетащи папку $backup в окно облачной папки
```

⚠️ **НЕ заливай backup на GitHub** — там пароли и DB credentials.

### 1.5. Сделать ZIP всей рабочей папки (бонус)

На случай если что-то упустил:

```powershell
$proj = "C:\Users\dmuzharov\Documents\Claude\Projects\Экран Легирус"
$zip = "$backup\full-project-$ts.zip"

# Исключаем node_modules и dist — на новом ноуте npm install
Compress-Archive `
  -Path "$proj\*" `
  -DestinationPath $zip `
  -CompressionLevel Optimal

# Если PowerShell ругается на размер — используй 7zip:
# & "C:\Program Files\7-Zip\7z.exe" a -tzip "$zip" "$proj\*" -xr!node_modules -xr!dist
```

---

## Этап 2: Установка на новом ноуте

### 2.1. Базовое ПО

Скачай и установи:

1. **Git** — https://git-scm.com/download/win
2. **Node.js 20 LTS** — https://nodejs.org/ (LTS версия)
3. **VS Code** (опционально, для редактирования) — https://code.visualstudio.com/
4. **Claude Cowork desktop** — https://claude.ai/download

### 2.2. Залогиниться в Cowork под новым аккаунтом

Открой Cowork → войди через свой новый Anthropic-аккаунт.

### 2.3. Клонировать репо

```powershell
# Создай папку под проекты
mkdir "$env:USERPROFILE\Documents\Claude\Projects"
cd "$env:USERPROFILE\Documents\Claude\Projects"

# Клонируй (попросит логин в GitHub — введи логин и Personal Access Token вместо пароля)
git clone https://github.com/Muzharov-D/legirus-screen.git "Экран Легирус"

cd "Экран Легирус"
```

Если запросит auth — нужен **Personal Access Token** (классический пароль GitHub давно не работает):
- https://github.com/settings/tokens → Generate new token (classic) → repo scope → 90 дней

### 2.4. Восстановить .env и data из backup

Положи backup-папку с флешки/облака где удобно, например `C:\Backup\legirus-2026-XX-XX\`. Затем:

```powershell
$backup = "C:\Backup\legirus-2026-XX-XX"
$proj = "$env:USERPROFILE\Documents\Claude\Projects\Экран Легирус"

Copy-Item "$backup\backend.env"  "$proj\backend\.env"
Copy-Item "$backup\frontend.env" "$proj\frontend\.env"

# data восстанавливать только если хочешь работать с локальными JSON
# (production-данные живут в PG на Render — для разработки обычно достаточно их)
Copy-Item -Recurse "$backup\backend-data\*" "$proj\backend\data\" -Force
```

### 2.5. Установить зависимости

```powershell
cd "$env:USERPROFILE\Documents\Claude\Projects\Экран Легирус"

cd backend
npm install

cd ..\frontend
npm install
```

Если `npm install` падает с ошибками native-модулей (sharp, bcrypt, etc) — установи **Visual Studio Build Tools** или **windows-build-tools** через npm:
```powershell
npm install --global windows-build-tools
```

### 2.6. Запустить локально (проверка)

```powershell
# Терминал 1 — backend
cd backend
npm run dev
# Должно стартануть на http://localhost:3001

# Терминал 2 — frontend
cd frontend
npm run dev
# Должно стартануть на http://localhost:5173
```

Открой `http://localhost:5173` — должна загрузиться публичная страница ФК Легирус.

### 2.7. Открыть в Cowork и продолжить

В Cowork:
1. **Connect folder** → выбери папку `C:\Users\<NEW>\Documents\Claude\Projects\Экран Легирус`
2. В первом сообщении новому Claude:
   > Прочитай HANDOFF.md и MIGRATION.md, я переехал на новый ноут. Продолжаем работу с проекта.

Новый Claude увидит весь контекст через документы и git-историю. Локальные сессии Cowork **не переезжают** между аккаунтами — это нормально, история тут в коде и в `HANDOFF.md`.

---

## Этап 3: На что обратить внимание

### 3.1. PWA Service Worker

После git pull + новой сборки — у установленных PWA пользователей старый SW. Они получат soft-toast «Доступна новая версия» при следующем заходе. Если не получат — попроси их закрыть/открыть PWA.

### 3.2. Push-подписки

Подписки в PG на Render — **не трогай**, они продолжают работать. Привязаны к VAPID-ключам, которые в `backend/.env` (и в Render env vars). Если ключи случайно поменяются — все подписки умрут.

### 3.3. Production deploy

После любых правок:
```powershell
git add -A
git commit -m "..."
git push
```

Render и Vercel сами увидят коммит и задеплоят за 2-3 минуты.

### 3.4. Что НЕ переедет

- **История переписок с Claude** в Cowork (в `AppData\Roaming\Claude`) — она привязана к локальному ноуту и аккаунту
- **Кеш Cowork сессий** — то же самое
- **Локальные `node_modules` и `dist/`** — пересобираются `npm install` + `npm run build`

---

## Контрольный чек-лист перед сменой ноута

На старом ноуте:
- [ ] `git status` пустой (ничего не несохранено)
- [ ] `git push` выполнен
- [ ] Backup-папка создана и скопирована в **2** места (флешка + облако)
- [ ] В backup есть: `backend.env`, `frontend.env`, `backend-data/`, `render-env.txt`, `vercel-env.txt`
- [ ] Открыл backup и ОТКРЫЛ хотя бы один .env — убедился что не пустой

На новом ноуте:
- [ ] Git, Node.js 20, Cowork установлены
- [ ] `git clone` сработал
- [ ] `.env` файлы восстановлены
- [ ] `npm install` прошёл без ошибок (в backend и frontend)
- [ ] `npm run dev` запустил локальный фронт и видишь публичную страницу
- [ ] В Cowork открыл папку проекта новым аккаунтом

---

## Если что-то пошло не так

- **Потерял .env** — все ключи можно восстановить из Render/Vercel дашбордов
- **Потерял credentials.txt** — пароли тренеров можно сбросить через `POST /api/auth/change-password` (если у админа есть доступ к UI) или прямо в PG таблице `users`
- **Cowork не подхватывает контекст** — попроси «прочитай HANDOFF.md, MIGRATION.md и git log за последние 30 коммитов»
- **GitHub не пускает** — нужен Personal Access Token (https://github.com/settings/tokens)
