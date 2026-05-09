# Деплой на Yandex Cloud (zero-risk параллельно с Vercel)

## Архитектура

```
ru.legirus.sportdata.tech (CNAME → Yandex CDN)
            │
       ┌────┴─────────────┐
       │  Yandex CDN      │  ← российский IP, не блокируется
       └────┬─────────────┘
            │
   ┌────────┴─────────────┐
   ▼                      ▼
Object Storage      Cloud Function
(статика SPA)       (proxy /api/* → Render)
```

**План zero-risk:**
1. Поднимаем всё на тестовом поддомене `ru.legirus.sportdata.tech`
2. `mobile.legirus.sportdata.tech` остаётся на Vercel — родители продолжают пользоваться
3. Тестируем `ru.*` на 5-10 родителях через МТС/Билайн без VPN
4. Если работает — переключаем DNS `mobile.*` на Yandex
5. Если что-то не так — DNS обратно на Vercel за 5 минут

---

## Шаг 1. Регистрация в Yandex Cloud

1. https://console.cloud.yandex.ru/ — войди через Yandex ID
2. Создай **облако** и **каталог** (folder) — например `legirus`
3. Активируй платёжный аккаунт (привязка карты обязательна, но первые 3 мес — пробный грант 4000₽; обычный месячный счёт нашего объёма ~50-100₽)

## Шаг 2. Service account для деплоя

1. **IAM → Сервисные аккаунты → Создать**
   - Имя: `legirus-deploy`
   - Роли: `storage.editor`, `functions.functionInvoker`, `cdn.editor`
2. **Создать статический ключ доступа** для S3-совместимого API:
   - Сохрани `aws_access_key_id` и `aws_secret_access_key` — это `YC_S3_ACCESS_KEY` и `YC_S3_SECRET_KEY` в GitHub Secrets
3. **Создать OAuth-токен** (или IAM-токен) для CDN purge:
   - https://oauth.yandex.ru/authorize?response_type=token&client_id=1a6990aa636648e9b2ef855fa7bec2fb
   - Сохрани токен — это `YC_IAM_TOKEN`

## Шаг 3. Object Storage — bucket для статики

1. **Object Storage → Создать бакет**
   - Имя: `legirus-frontend-ru` (или любое уникальное)
   - Доступ: **публичный для чтения**
   - Класс хранилища: **стандартный**
2. **Настройки → Веб-сайт**
   - Включи hosting
   - Главная страница: `index.html`
   - Страница ошибки: `index.html` ← **важно для SPA-роутинга**
3. Запиши endpoint: `https://legirus-frontend-ru.website.yandexcloud.net`

## Шаг 4. Cloud Function — proxy на Render

1. **Cloud Functions → Создать функцию**
   - Имя: `legirus-api-proxy`
2. **Создать версию:**
   - Среда выполнения: `nodejs20`
   - Точка входа: `index.handler`
   - Таймаут: 30 сек
   - Память: 256 МБ
   - Сервисный аккаунт: `legirus-deploy`
   - **Загрузить ZIP** с содержимым `deploy/yandex/cloud-function/`:
     ```bash
     cd deploy/yandex/cloud-function
     zip -r function.zip index.js package.json
     ```
3. **Сделать функцию публичной** (вкладка → Настройки):
   - "Публичная функция" → ON
   - Получишь URL: `https://functions.yandexcloud.net/<function-id>`

## Шаг 5. CDN — соединить bucket + function под одним доменом

1. **Cloud CDN → Создать ресурс CDN**
   - Источник: **bucket** `legirus-frontend-ru`
   - Доменное имя: `ru.legirus.sportdata.tech`
   - Протокол: HTTPS
   - SSL: **сертификат Let's Encrypt** (Yandex выпустит сам)
   - Кеширование по умолчанию: 1 час (в коде Cache-Control строже)
2. **Дополнительные настройки → правила** для path-based routing:
   - Правило 1: `/api/*` → пере-origin на функцию `https://functions.yandexcloud.net/<function-id>`
3. Скопируй CDN endpoint: `cl-xxxxxxxxxx.edgecdn.ru` → это значение для CNAME

## Шаг 6. DNS — поддомен для тестирования

В панели управления `sportdata.tech`:
- **Создай новую CNAME**:
  - Name: `ru.legirus`
  - Value: `cl-xxxxxxxxxx.edgecdn.ru` (CDN endpoint из шага 5)
  - TTL: 300

⚠️ Не трогай существующую запись `mobile.legirus` — она на Vercel и продолжает работать.

## Шаг 7. GitHub Secrets для авто-деплоя

GitHub → Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Значение |
|---|---|
| `YC_S3_ACCESS_KEY` | из шага 2.2 |
| `YC_S3_SECRET_KEY` | из шага 2.2 |
| `YC_BUCKET` | `legirus-frontend-ru` |
| `YC_IAM_TOKEN` | из шага 2.3 |
| `YC_CDN_RESOURCE_ID` | ID ресурса CDN из консоли |
| `YC_TEST_DOMAIN` | `ru.legirus.sportdata.tech` |

## Шаг 8. Первый деплой

```bash
git add deploy/ .github/workflows/deploy-yandex.yml
git commit -m "Yandex Cloud: параллельный деплой на ru.legirus.*"
git push
```

GitHub Actions запустит workflow `Deploy to Yandex Cloud`, соберёт фронт, зальёт в bucket с правильными Cache-Control. Через 2-3 минуты:

```bash
curl -I https://ru.legirus.sportdata.tech/
# Должен быть HTTP 200
```

## Шаг 9. Тестирование

1. Открой `https://ru.legirus.sportdata.tech/` с десктопа через VPN — должно работать
2. **Без VPN** с мобильника на МТС / Билайн / Ростелекоме — должно открыться
3. Проверь API: `curl https://ru.legirus.sportdata.tech/api/public/calendar/2012`
4. Проверь Service Worker: DevTools → Application → SW → activated
5. Дай 5 родителям ссылку `ru.legirus.sportdata.tech` на пару дней

## Шаг 10. Production switch (после подтверждения работы)

В DNS-панели:
- **Удали** старую запись `mobile.legirus` → vercel-dns-016
- **Создай** новую CNAME:
  - Name: `mobile.legirus`
  - Value: `cl-xxxxxxxxxx.edgecdn.ru` (тот же CDN endpoint что ru.*)
  - TTL: 300
- В CDN-настройках Yandex — добавь второй домен в ресурс: `mobile.legirus.sportdata.tech`

Через 5-15 минут весь трафик идёт через Yandex.

## Откат (если что-то сломалось)

В DNS:
- Верни запись `mobile.legirus` на CNAME → `7cc22c7a5cf84896.vercel-dns-016.com.`

Через 5 минут пользователи снова на Vercel. Yandex bucket оставь — пригодится.

---

## Стоимость (примерно)

Один клуб, ~100 родителей, ~50 запросов на родителя в день = 5000 запросов/день:
- Object Storage: 0₽ (бесплатный tier 1GB трафик/мес покрывает)
- Cloud Function: 0₽ (бесплатный tier 1M вызовов/мес)
- CDN: ~50-100₽ за входящий трафик (15-30 ГБ/мес)

**Итого: 50-100₽/мес.**

## Что мониторить

- Cloud Function: логи в консоли — следи за 5xx
- CDN: статистика Hit Ratio (должно быть >70%)
- Object Storage: занятый объём (не должно расти)
