"""crop_maps.py — render team-level Sportvisor pages as PNG heatmaps.

Each Sportvisor PDF has 9 team-aggregate pages (12-20):
  p12 shooting | p13 setPieces | p14 possession | p15 passes
  p16 attacks  | p17 recoveriesAndTackling | p18 duels | p19 pressing
  p20 positioning

We render each page at 2 resolutions:
  -map.png  (thumb for cards in match-detail UI, ~120 DPI)
  -full.png (high-res for lightbox, ~200 DPI)

Output naming matches the patterns referenced from match.json:
  match-XXX-team-shooting-map.png  / -full.png
  match-XXX-team-set-pieces-map.png / ...
  ...
"""
import argparse, os, sys
import pdfplumber

# (1-based page number, slug used in filename)
PAGES = [
    (12, "shooting"),
    (13, "set-pieces"),
    (14, "possession"),
    (15, "passes"),
    (16, "attacks"),
    (17, "recoveries"),
    (18, "duels"),
    (19, "pressing"),
    (20, "positioning"),
]


def render(pdf_path, out_dir, match_id, dpi_thumb=120, dpi_full=200):
    os.makedirs(out_dir, exist_ok=True)
    saved = []
    with pdfplumber.open(pdf_path) as pdf:
        for pn, slug in PAGES:
            if pn > len(pdf.pages):
                print(f"  WARN: PDF has only {len(pdf.pages)} pages, skipping p{pn}")
                continue
            page = pdf.pages[pn - 1]
            for variant, dpi in [("map", dpi_thumb), ("full", dpi_full)]:
                out = os.path.join(out_dir, f"{match_id}-team-{slug}-{variant}.png")
                page.to_image(resolution=dpi).save(out, format="PNG")
                saved.append(out)
    return saved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("maps_dir"); ap.add_argument("match_id")
    args = ap.parse_args()
    saved = render(args.pdf, args.maps_dir, args.match_id)
    print(f"crop_maps OK: {len(saved)} files written to {args.maps_dir}")


if __name__ == "__main__":
    main()
