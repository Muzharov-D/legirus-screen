"""Crop heatmap regions from rendered PDF pages.

Pages 12-20 each have a 'soccer field map' card on right-center of the layout.
At 200 DPI on A4 landscape (842.88 x 595.92 pts → 2342 x 1656 px) the map
regions are roughly:
  Page 12 (Карта ударов):       map field at x≈760-1240, y≈230-1100
  Page 13 (Карта стандартов):   similar
  Page 15 (Распределение передач): similar
  Page 16 (Направления атак):   similar
  Page 17 (Карта возвратов):    similar
  Page 18 (Карта единоборств):  similar
  Page 19 (Карта прессинга):    similar
  Page 20 (Карта позиционирования): similar

Page 14 (Possession) is line charts, not a field map.

Usage:
    python crop_maps.py <input.pdf> <out_dir> <match_id>

Pre-rendered page PNGs are looked up in PARSER_RENDERS_DIR (defaults to
<input.pdf>/page_renders).
"""
import argparse, os, sys

try:
    from PIL import Image
except ImportError:
    sys.stderr.write("Pillow не установлен; пропуск crop_maps\n")
    sys.exit(0)


TEAM_MAPS = {
    12: ("shooting",            "Карта ударов"),
    13: ("set-pieces",          "Карта событий (стандарты)"),
    15: ("passes",              "Распределение передач"),
    16: ("attacks",             "Направления атак"),
    17: ("recoveries",          "Карта возвратов и отборов"),
    18: ("duels",               "Карта единоборств"),
    19: ("pressing",            "Карта прессинга"),
    20: ("positioning",         "Карта позиционирования"),
}

TEAM_MAP_BOX = (760, 220, 1245, 1115)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input_pdf")
    ap.add_argument("out_dir")
    ap.add_argument("match_id")
    args = ap.parse_args()

    renders = os.environ.get(
        "PARSER_RENDERS_DIR",
        os.path.join(os.path.dirname(os.path.abspath(args.input_pdf)), "page_renders"),
    )
    if not os.path.isdir(renders):
        sys.stderr.write(f"Нет каталога с рендерами страниц: {renders}\n")
        sys.exit(0)

    os.makedirs(args.out_dir, exist_ok=True)
    saved = 0
    for page, (slug, label) in TEAM_MAPS.items():
        src = os.path.join(renders, f"p-{page}.png")
        if not os.path.exists(src):
            continue
        img = Image.open(src)
        map_crop = img.crop(TEAM_MAP_BOX)
        out_map = os.path.join(args.out_dir, f"{args.match_id}-team-{slug}-map.png")
        map_crop.save(out_map, optimize=True)
        # Уменьшенная копия страницы — для отладки.
        full_out = os.path.join(args.out_dir, f"{args.match_id}-team-{slug}-full.png")
        thumb = img.copy()
        thumb.thumbnail((1400, 1000))
        thumb.save(full_out, optimize=True)
        saved += 1

    print(f"crop_maps: saved {saved} team maps for {args.match_id}")


if __name__ == "__main__":
    main()
