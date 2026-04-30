"""Crop attack-passmap and fitness-heatmap from individual player pages 21-35.
Page rendered at 200 DPI = 2342 x 1656 px.
"""
from PIL import Image
import os

RENDERS = "/sessions/cool-dreamy-clarke/mnt/outputs/parser/page_renders"
OUT = "/sessions/cool-dreamy-clarke/mnt/Экран Легирус/frontend/public/assets/maps"
os.makedirs(OUT, exist_ok=True)

PAGE_PLAYER = {
    21: "p17-turapin", 22: "p05-galitsky", 23: "p08-zakusilov", 24: "p02-oktyabrev",
    25: "p19-bondar", 26: "p21-bobin", 27: "p09-voronkov", 28: "p33-makarov",
    29: "p52-tatarchenko", 30: "p12-klebanov", 31: "p15-dutil", 32: "p31-bezborodkin",
    33: "p23-ahmadov", 34: "p01-maksim", 35: "p22-kondakov",
}

# Verified on p-27 (Voronkov)
ATTACK_MAP_BOX  = (725, 130, 1020, 720)   # passmap with shots/passes/dribbles
FITNESS_MAP_BOX = (1200, 1000, 1495, 1495) # heatmap of player movement

for page, pid in PAGE_PLAYER.items():
    src = os.path.join(RENDERS, f"p-{page}.png")
    img = Image.open(src)
    img.crop(ATTACK_MAP_BOX).save(os.path.join(OUT, f"match-001-{pid}-attack-map.png"), optimize=True)
    img.crop(FITNESS_MAP_BOX).save(os.path.join(OUT, f"match-001-{pid}-heatmap.png"), optimize=True)
    print(f"  {pid}: attack-map + heatmap saved")
