"""Crop attack-passmap and fitness-heatmap from individual player pages 21-35.
PDF rendered at 200 DPI = 2342 x 1656 px.

Usage:
    python crop_player_maps.py <input.pdf> <out_dir> <match_id>

Pre-rendered page PNGs are looked up in PARSER_RENDERS_DIR (defaults to
<input.pdf>/page_renders).
"""
import argparse, os, sys

try:
    from PIL import Image
except ImportError:
    sys.stderr.write("Pillow не установлен; пропуск crop_player_maps\n")
    sys.exit(0)


PAGE_PLAYER = {
    21: "p17-turapin", 22: "p05-galitsky", 23: "p08-zakusilov", 24: "p02-oktyabrev",
    25: "p19-bondar", 26: "p21-bobin", 27: "p09-voronkov", 28: "p33-makarov",
    29: "p52-tatarchenko", 30: "p12-klebanov", 31: "p15-dutil", 32: "p31-bezborodkin",
    33: "p23-ahmadov", 34: "p01-maksim", 35: "p22-kondakov",
}

ATTACK_MAP_BOX  = (725, 130, 1020, 720)
FITNESS_MAP_BOX = (1200, 1000, 1495, 1495)


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
    for page, pid in PAGE_PLAYER.items():
        src = os.path.join(renders, f"p-{page}.png")
        if not os.path.exists(src):
            continue
        img = Image.open(src)
        img.crop(ATTACK_MAP_BOX).save(
            os.path.join(args.out_dir, f"{args.match_id}-{pid}-attack-map.png"),
            optimize=True,
        )
        img.crop(FITNESS_MAP_BOX).save(
            os.path.join(args.out_dir, f"{args.match_id}-{pid}-heatmap.png"),
            optimize=True,
        )
        saved += 1

    print(f"crop_player_maps: saved {saved} player map pairs for {args.match_id}")


if __name__ == "__main__":
    main()
