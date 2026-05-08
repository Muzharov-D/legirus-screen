#!/usr/bin/env python3
"""Скрипт загрузки фото игроков по списку «Имя URL».

Использование:
    1. Открыть player_photos_list.txt и вставить туда строки в формате:
         Ахмадов Джайхун https://img.nagradion.ru/images/normal/m/person1583730950.jpg
         Воронков Владимир https://example.com/photo.jpg
       (имя может быть в любом порядке — "Имя Фамилия" или "Фамилия Имя")
    2. python3 fetch_player_photos.py
    3. Файлы сохранятся в frontend/public/assets/players/{playerId}.png
       Не-PNG исходники конвертируются автоматически.

Скрипт сопоставляет имя из списка с игроками из players.json по фамилии и инициалу.
"""
import json
import os
import re
import sys
import urllib.request
from urllib.error import URLError, HTTPError
from io import BytesIO

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PLAYERS_JSON = os.path.join(ROOT, "backend", "data", "players.json")
PHOTOS_DIR = os.path.join(ROOT, "frontend", "public", "assets", "players")
LIST_FILE = os.path.join(os.path.dirname(__file__), "player_photos_list.txt")

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) Legirus-PhotoFetcher/1.0"


def load_players():
    """Загружает справочник игроков и возвращает маппинг lastname (lowercase) → playerId."""
    with open(PLAYERS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    by_lastname = {}
    by_full = {}
    for p in data["players"]:
        by_lastname[p["lastName"].lower()] = p["id"]
        # full name in both orders
        by_full[(p["firstName"] + " " + p["lastName"]).lower()] = p["id"]
        by_full[(p["lastName"] + " " + p["firstName"]).lower()] = p["id"]
    return by_lastname, by_full


def parse_line(line):
    """Извлекает имя и URL из строки 'Фамилия Имя URL'."""
    line = line.strip()
    if not line or line.startswith("#"):
        return None, None
    m = re.match(r"^(.+?)\s+(https?://\S+)\s*$", line)
    if not m:
        return None, None
    return m.group(1).strip(), m.group(2).strip()


def match_player(name, by_lastname, by_full):
    """Сопоставляет имя из списка с playerId по справочнику."""
    n = name.lower().strip()
    if n in by_full:
        return by_full[n]
    parts = n.split()
    if not parts:
        return None
    # try first token as lastname, then second
    for cand in (parts[0], parts[-1]):
        if cand in by_lastname:
            return by_lastname[cand]
    return None


def download(url, out_path):
    """Скачивает URL и сохраняет в out_path. Конвертирует в PNG если нужно."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
        ctype = resp.headers.get("Content-Type", "")
    # detect format and convert if needed
    is_png = data[:8] == b"\x89PNG\r\n\x1a\n" or "png" in ctype.lower()
    if not is_png:
        try:
            from PIL import Image
            img = Image.open(BytesIO(data)).convert("RGB")
            # crop to square center
            w, h = img.size
            s = min(w, h)
            img = img.crop(((w-s)//2, (h-s)//2, (w+s)//2, (h+s)//2))
            img = img.resize((400, 400), Image.LANCZOS)
            img.save(out_path, "PNG", optimize=True)
            return f"converted from {ctype} ({w}×{h} → 400×400 PNG)"
        except ImportError:
            # fallback — save raw bytes with original ext
            ext = "jpg" if "jpeg" in ctype or "jpg" in ctype else "bin"
            alt_path = out_path.replace(".png", f".{ext}")
            with open(alt_path, "wb") as f:
                f.write(data)
            return f"saved raw {ctype} (Pillow not installed)"
    with open(out_path, "wb") as f:
        f.write(data)
    return f"PNG ({len(data)} bytes)"


def main():
    if not os.path.exists(LIST_FILE):
        # create example template
        with open(LIST_FILE, "w", encoding="utf-8") as f:
            f.write("# Список игроков для загрузки фото\n")
            f.write("# Формат: «Фамилия Имя URL» на строке (или «Имя Фамилия URL»)\n")
            f.write("# Строки начинающиеся с # игнорируются\n\n")
            f.write("# Пример:\n")
            f.write("# Ахмадов Джайхун https://img.nagradion.ru/images/normal/m/person1583730950.jpg\n")
        print(f"Создан шаблон: {LIST_FILE}")
        print("Заполните его и запустите скрипт ещё раз.")
        return

    os.makedirs(PHOTOS_DIR, exist_ok=True)
    by_lastname, by_full = load_players()

    with open(LIST_FILE, encoding="utf-8") as f:
        lines = f.readlines()

    ok, fail, skip = 0, 0, 0
    print(f"Обрабатываю {LIST_FILE}\n")
    for i, line in enumerate(lines, 1):
        name, url = parse_line(line)
        if not name or not url:
            continue
        pid = match_player(name, by_lastname, by_full)
        if not pid:
            print(f"  ✗ строка {i}: '{name}' — не найден в players.json")
            fail += 1
            continue
        out = os.path.join(PHOTOS_DIR, f"{pid}.png")
        try:
            info = download(url, out)
            print(f"  ✓ {pid:25s} ← {name} ({info})")
            ok += 1
        except (URLError, HTTPError, Exception) as e:
            print(f"  ✗ {pid:25s} ← {name}: {e}")
            fail += 1

    print(f"\nИтого: загружено {ok}, ошибок {fail}, пропущено {skip}")
    print(f"Папка: {PHOTOS_DIR}")


if __name__ == "__main__":
    main()
