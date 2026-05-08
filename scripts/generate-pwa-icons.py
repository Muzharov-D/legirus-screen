#!/usr/bin/env python3
"""
Генератор PWA-иконок из лого ФК Легирус.

Вход:
  frontend/public/assets/logos/legirus-source.png
    — оригинал герба (например квадратный 1000x1000 с белыми полями).

Выходы (все PNG):
  frontend/public/icons/icon-192.png         — 192x192 (PWA standard)
  frontend/public/icons/icon-512.png         — 512x512 (PWA splash + большой иконкa)
  frontend/public/icons/icon-192-maskable.png — 192x192 с safe area (для Android adaptive)
  frontend/public/icons/icon-512-maskable.png — 512x512 с safe area
  frontend/public/icons/apple-touch-icon.png — 180x180 (iOS home screen)
  frontend/public/icons/favicon-32.png       — 32x32 (favicon)
  frontend/public/icons/favicon-16.png       — 16x16 (favicon)
  frontend/public/assets/logos/legirus.png   — 256x256 (для UI shape и шапки)

Maskable-варианты:
  Android adaptive icons обрезают края (круглый/squircle/squircle с padding 10%).
  Safe area = central 80% круг. Чтобы лого не обрезалось, делаем padding 10%
  и красно-чёрный градиент-фон по краям.

Запуск:
  cd <project_root>
  python3 scripts/generate-pwa-icons.py

Зависимость: Pillow (`pip install pillow` или `pip install --break-system-packages pillow`).
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print('ERROR: Нужен Pillow. Установи: pip install pillow', file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'frontend' / 'public' / 'assets' / 'logos' / 'legirus-source.png'
ICONS_DIR = ROOT / 'frontend' / 'public' / 'icons'
LOGOS_DIR = ROOT / 'frontend' / 'public' / 'assets' / 'logos'

# Красно-чёрный фон для maskable-иконок (safe area краёв)
BG_TOP = (26, 6, 6)         # #1a0606
BG_MID = (139, 24, 24)      # #8b1818
BG_BOTTOM = (10, 2, 2)      # #0a0202


def ensure_dirs():
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    LOGOS_DIR.mkdir(parents=True, exist_ok=True)


def load_source():
    if not SOURCE.exists():
        print(f'ERROR: Не найден файл {SOURCE}.', file=sys.stderr)
        print('  Положи оригинал лого как: frontend/public/assets/logos/legirus-source.png', file=sys.stderr)
        sys.exit(2)
    img = Image.open(SOURCE).convert('RGBA')
    print(f'  source: {img.size[0]}x{img.size[1]} px, mode={img.mode}')
    return img


def square_pad(img):
    """Привести к квадрату с прозрачным фоном (если не квадрат)."""
    w, h = img.size
    if w == h:
        return img
    s = max(w, h)
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    canvas.paste(img, ((s - w) // 2, (s - h) // 2), img)
    return canvas


def make_simple(img, size, out_path):
    """Простой ресайз: лого занимает весь квадрат."""
    out = img.resize((size, size), Image.LANCZOS)
    out.save(out_path, 'PNG', optimize=True)
    print(f'  → {out_path.relative_to(ROOT)} ({size}x{size})')


def make_maskable(img, size, out_path, padding_ratio=0.10):
    """Maskable: лого в центре с safe area (padding) на красно-чёрном фоне."""
    canvas = Image.new('RGBA', (size, size), BG_BOTTOM)
    # Простой вертикальный градиент
    for y in range(size):
        t = y / (size - 1)
        if t < 0.5:
            k = t * 2
            r = int(BG_TOP[0] * (1 - k) + BG_MID[0] * k)
            g = int(BG_TOP[1] * (1 - k) + BG_MID[1] * k)
            b = int(BG_TOP[2] * (1 - k) + BG_MID[2] * k)
        else:
            k = (t - 0.5) * 2
            r = int(BG_MID[0] * (1 - k) + BG_BOTTOM[0] * k)
            g = int(BG_MID[1] * (1 - k) + BG_BOTTOM[1] * k)
            b = int(BG_MID[2] * (1 - k) + BG_BOTTOM[2] * k)
        for x in range(size):
            canvas.putpixel((x, y), (r, g, b, 255))

    pad = int(size * padding_ratio)
    inner = size - 2 * pad
    logo = img.resize((inner, inner), Image.LANCZOS)
    canvas.paste(logo, (pad, pad), logo)
    canvas.save(out_path, 'PNG', optimize=True)
    print(f'  → {out_path.relative_to(ROOT)} ({size}x{size}, maskable, pad {pad}px)')


def main():
    ensure_dirs()
    src = square_pad(load_source())

    # Standard (any) — лого без падинга
    make_simple(src, 192, ICONS_DIR / 'icon-192.png')
    make_simple(src, 512, ICONS_DIR / 'icon-512.png')
    make_simple(src, 180, ICONS_DIR / 'apple-touch-icon.png')
    make_simple(src, 32,  ICONS_DIR / 'favicon-32.png')
    make_simple(src, 16,  ICONS_DIR / 'favicon-16.png')

    # Maskable — на градиент-фоне с safe area (для Android adaptive)
    make_maskable(src, 192, ICONS_DIR / 'icon-192-maskable.png')
    make_maskable(src, 512, ICONS_DIR / 'icon-512-maskable.png')

    # Шапка приложения
    make_simple(src, 256, LOGOS_DIR / 'legirus.png')

    print('\n✅ Готово.')


if __name__ == '__main__':
    main()
