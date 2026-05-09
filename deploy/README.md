# Деплой фронта на российский VPS (обход блокировок Vercel)

## Зачем это нужно

Vercel-IP заблокированы Роскомнадзором у мобильных операторов (МТС, Билайн, Ростелеком, Теле2). Через TSPU они режут трафик к AWS-диапазонам. VPN обходит, обычный пользователь — нет.

Решение: статика и API-прокси на VPS с российским IP. Сервер-сервер запросы к Render не блокируются (TSPU режет только клиентский трафик).

## Архитектура

```
Родитель из Питера
       │
       │ HTTPS → mobile.legirus.sportdata.tech (российский IP VPS)
       ▼
   ┌─────────────────────────┐
   │  VPS (Selectel / Beget) │
   │  nginx                  │
   │   ├─ /          → /var/www/legirus/dist (Vite SPA)
   │   ├─ /assets/*  → cache 1 год
   │   ├─ /sw.js     → no-cache (важно для PWA-обновлений)
   │   └─ /api/*     → proxy_pass → legirus-api.onrender.com
   └─────────────────────────┘
                │
                │ server-to-server (РФ→Frankfurt, не режется)
                ▼
       legirus-api.onrender.com
```

## Что выбрать из VPS

Все российские, IP в РФ, цены в месяц:

| Провайдер | План | Цена | Для чего |
|---|---|---|---|
| **Timeweb Cloud** | Pulsar 1 vCPU 1GB | **219₽** | Самый простой, удобная панель |
| **Beget Cloud VPS** | Start 1 vCPU 1GB | **228₽** | Родной российский, проверенный |
| **Selectel** | Бюджетный 1 vCPU 1GB | **300₽** | Серьёзная инфраструктура |
| **Reg.ru VPS** | VPS-1 1 vCPU 1GB | **240₽** | Если домен у них же |

Я бы взял **Timeweb Cloud Pulsar** — дёшево и просто. ОС: Ubuntu 22.04 LTS.

## Полная инструкция (~30 минут)

### 1. Купи VPS
- Зарегистрируйся в Timeweb Cloud / Beget / Selectel
- Создай VPS (Ubuntu 22.04, минимальный план)
- Получи IP-адрес и root-пароль

### 2. Подключись и накати базу
```bash
ssh root@VPS_IP
# (введи пароль из письма)

# Обнови систему и поставь nginx + certbot + утилиты:
curl -fsSL https://raw.githubusercontent.com/<твой-github>/<репо>/main/deploy/setup-server.sh -o /tmp/setup.sh
bash /tmp/setup.sh
```

(Или просто скопируй `deploy/setup-server.sh` через `scp` и запусти.)

### 3. Настрой DNS
В панели управления доменом `sportdata.tech`:
- **Удали** существующую CNAME-запись `mobile.legirus` → `vercel-dns-016.com`
- **Создай** A-запись:
  - Name: `mobile.legirus`
  - Value: `IP_ТВОЕГО_VPS`
  - TTL: 300 (5 минут)

Подожди 5-15 минут, проверь:
```bash
dig +short mobile.legirus.sportdata.tech
# Должен показать IP VPS
```

### 4. Положи nginx-конфиг
На локалке:
```bash
scp deploy/nginx.conf root@VPS_IP:/etc/nginx/sites-available/legirus
```

На VPS:
```bash
ln -sf /etc/nginx/sites-available/legirus /etc/nginx/sites-enabled/legirus
rm -f /etc/nginx/sites-enabled/default
nginx -t
# Если "test is successful":
systemctl reload nginx
```

### 5. Получи SSL
```bash
certbot --nginx -d mobile.legirus.sportdata.tech \
        --non-interactive --agree-tos -m ai4sportdata@gmail.com
```

Certbot сам пропишет в nginx.conf пути к сертификату и добавит auto-renewal через systemd-таймер.

### 6. Залей первую версию dist
На локалке:
```bash
cd frontend
npm run build
rsync -avz --delete dist/ root@VPS_IP:/var/www/legirus/dist/
```

Открой `https://mobile.legirus.sportdata.tech/` — должно работать.

### 7. Настрой авто-деплой через GitHub Actions

**На локалке** сгенерируй deploy-ключ:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/legirus_deploy -C 'github-actions-legirus' -N ''
cat ~/.ssh/legirus_deploy.pub
```

**На VPS** добавь публичную часть в `legirus`-юзера:
```bash
echo 'ssh-ed25519 AAAA... github-actions-legirus' >> /home/legirus/.ssh/authorized_keys
chown legirus:legirus /home/legirus/.ssh/authorized_keys
chmod 600 /home/legirus/.ssh/authorized_keys
```

**В GitHub репо** → Settings → Secrets and variables → Actions → New repository secret:
- `DEPLOY_HOST` = IP твоего VPS (или `mobile.legirus.sportdata.tech`)
- `DEPLOY_SSH_KEY` = содержимое `~/.ssh/legirus_deploy` (приватный, целиком включая `-----BEGIN/END-----`)

Запушь в main → workflow `Deploy frontend → VPS` соберёт и зальёт сам. Первый ручной запуск можно сделать через UI:
GitHub → Actions → Deploy frontend → Run workflow.

### 8. Vercel — оставить или снести?

**Оставить** для preview-деплоев и /club, /calendar (не публичная часть, тренеры могут ходить через VPN).

**Снести**, если хочется чисто. Но удалять домен `mobile.legirus.sportdata.tech` из Vercel не нужно — он просто перестанет получать трафик после смены DNS.

## Проверка после миграции

```bash
# DNS резолвится в твой IP
dig +short mobile.legirus.sportdata.tech

# HTTPS работает
curl -I https://mobile.legirus.sportdata.tech/

# API проходит через nginx
curl -s https://mobile.legirus.sportdata.tech/api/public/calendar/2012 | head -c 200

# Проверь с реального МТС/Билайн/Ростелекома без VPN
```

## Что делать при следующих изменениях фронта

```bash
git add -A && git commit -m "..." && git push
# GitHub Actions сам пересоберёт и зальёт за ~2 минуты
```

При обновлении SW — не забудь поменять `CACHE_VERSION` в `frontend/public/sw.js`.
