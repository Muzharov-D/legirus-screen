"""Crop heatmap regions from rendered PDF pages.

Pages 12-20 each have a 'soccer field map' card on right-center of the layout.
At 200 DPI on A4 landscape (842.88 x 595.92 pts → 2342 x 1656 px), the map regions are:
  Page 12 (Shooting / Карта ударов):       map field at x≈760-1240, y≈230-1100
  Page 13 (Set pieces / Карта событий):    similar
  Page 15 (Passes / Распределение передач): similar
  Page 16 (Attacks / Направления атак):    similar
  Page 17 (Recoveries / Карта событий):    similar
  Page 18 (Duels / Карта событий):         similar
  Page 19 (Pressing / Карта прессинга):    similar
  Page 20 (Positioning / Карта событий):   similar

Page 14 (Possession) has time/percent line charts, not a field map.

Pages 21-35 (individual players) each have a smaller field/zones card on top right.
"""
from PIL import Image
import os

RENDERS = "/sessions/cool-dreamy-clarke/mnt/outputs/parser/page_renders"
OUT = "/sessions/cool-dreamy-clarke/mnt/Экран Легирус/frontend/public/assets/maps"
os.makedirs(OUT, exist_ok=True)

# Map name per team-aggregate page
TEAM_MAPS = {
    12: ("shooting",            "Карта ударов"),
    13: ("set-pieces",          "Карта событий (стандарты)"),
    15: ("passes",              "Распределение передач"),
    16: ("attacks",             "Направления атак"),
    17: ("recoveries",          "Карта возвратов и отборов"),
    18: ("duels",               "Карта единоборств"),
    19: ("pressing",            "Карта прессинга"),
    20: ("positioning",         "Карта позиционирования (удары против/перехваты)"),
}

# Crop coordinates for the field-map card on team pages (200 DPI)
# Empirical from p-12.png: card occupies roughly x:765-1240, y:230-1100
TEAM_MAP_BOX = (760, 220, 1245, 1115)

# Crop coordinates for the timeline distribution chart card (right of map)
TEAM_TIMELINE_BOX = (1260, 220, 2260, 740)

for page, (slug, label) in TEAM_MAPS.items():
    src = os.path.join(RENDERS, f"p-{page}.png")
    if not os.path.exists(src):
        continue
    img = Image.open(src)
    map_crop = img.crop(TEAM_MAP_BOX)
    out_map = os.path.join(OUT, f"match-001-team-{slug}-map.png")
    map_crop.save(out_map, optimize=True)
    print(f"  saved {out_map} ({map_crop.size})")
    # Save full page for reference (down-scaled by 50%)
    full_out = os.path.join(OUT, f"match-001-team-{slug}-full.png")
    img.thumbnail((1400, 1000))
    img.save(full_out, optimize=True)
    print(f"  saved {full_out}")
