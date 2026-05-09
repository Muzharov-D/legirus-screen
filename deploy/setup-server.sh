#!/usr/bin/env bash
# Первоначальная настройка VPS под фронт ФК Легирус.
# Цель: Ubuntu 22.04 / 24.04 LTS, root или sudo-юзер.
#
# Использование:
#   1. Скопируй скрипт на сервер: scp setup-server.sh root@VPS_IP:/tmp/
#   2. Выполни:                    ssh root@VPS_IP "bash /tmp/setup-server.sh"
#   3. Скопируй nginx.conf:        scp deploy/nginx.conf root@VPS_IP:/etc/nginx/sites-available/legirus
#   4. Активируй сайт:             ssh root@VPS_IP "ln -sf /etc/nginx/sites-available/legirus /etc/nginx/sites-enabled/legirus && rm -f /etc/nginx/sites-enabled/default"
#   5. Получи SSL:                 ssh root@VPS_IP "certbot --nginx -d mobile.legirus.sportdata.tech --non-interactive --agree-tos -m ai4sportdata@gmail.com"
#   6. Залей dist/:                rsync -avz --delete dist/ root@VPS_IP:/var/www/legirus/dist/
#
# Дальше — push в main → GitHub Actions сам деплоит.

set -euo pipefail

echo "[1/6] Обновление пакетов..."
apt-get update -qq
apt-get upgrade -y -qq

echo "[2/6] Установка nginx, certbot, brotli, утилит..."
apt-get install -y -qq \
    nginx \
    certbot \
    python3-certbot-nginx \
    libnginx-mod-http-brotli-filter \
    libnginx-mod-http-brotli-static \
    rsync \
    curl \
    ufw \
    fail2ban \
    htop

echo "[3/6] Создание директорий..."
mkdir -p /var/www/legirus/dist
mkdir -p /var/www/certbot
chown -R www-data:www-data /var/www/legirus

echo "[4/6] Firewall — пропускаем 22 (SSH), 80 (HTTP), 443 (HTTPS)..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "[5/6] fail2ban для защиты SSH..."
systemctl enable --now fail2ban

echo "[6/6] Создание deploy-юзера 'legirus' (для GitHub Actions)..."
if ! id legirus &>/dev/null; then
    useradd -m -s /bin/bash legirus
    mkdir -p /home/legirus/.ssh
    chmod 700 /home/legirus/.ssh
    touch /home/legirus/.ssh/authorized_keys
    chmod 600 /home/legirus/.ssh/authorized_keys
    chown -R legirus:legirus /home/legirus/.ssh
    # Дать legirus право писать в /var/www/legirus
    usermod -aG www-data legirus
    chmod -R g+w /var/www/legirus
fi

echo ""
echo "✅ Базовая настройка завершена."
echo ""
echo "СЛЕДУЮЩИЕ ШАГИ:"
echo "  1. На локалке выполни:"
echo "     ssh-keygen -t ed25519 -f ~/.ssh/legirus_deploy -C 'github-actions-legirus'"
echo "     cat ~/.ssh/legirus_deploy.pub"
echo "  2. Содержимое .pub добавь сюда:"
echo "     echo 'PUB_KEY_СЮДА' >> /home/legirus/.ssh/authorized_keys"
echo "  3. Содержимое приватного ключа (~/.ssh/legirus_deploy) добавь в"
echo "     GitHub → Repo → Settings → Secrets → DEPLOY_SSH_KEY"
echo "  4. Скопируй nginx.conf и активируй сайт (см. комментарии вверху скрипта)."
echo "  5. DNS: A-запись mobile.legirus.sportdata.tech → IP этого сервера."
echo "  6. Получи SSL через certbot."
echo "  7. Push в main → GitHub Actions автодеплой dist/."
