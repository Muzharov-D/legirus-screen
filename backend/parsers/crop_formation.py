"""crop_formation.py — render the lineup/formation card from page 1 as PNG.

Sportvisor draws a beautiful formation card on the left side of page 1 with
player photos, jersey numbers, ratings, goal markers (x2 for scorers) and
team colors. Cropping it as an image is simpler and visually correct vs.
geometrically reconstructing each player's position.

Output:
  <maps_dir>/<match_id>-formation-map.png   (200 DPI, thumb)
  <maps_dir>/<match_id>-formation-full.png  (300 DPI, lightbox)
"""
import argparse, os, sys
import pdfplumber

# bbox of the lineup card on page 1 (842x596 landscape, A4-ish)
BBOX = (0, 100, 270, 510)


def render(pdf_path, out_dir, match_id):
    os.makedirs(out_dir, exist_ok=True)
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        cropped = page.crop(BBOX)
        for variant, dpi in [("map", 200), ("full", 300)]:
            out = os.path.join(out_dir, f"{match_id}-formation-{variant}.png")
            cropped.to_image(resolution=dpi).save(out, format="PNG")
    return [
        os.path.join(out_dir, f"{match_id}-formation-map.png"),
        os.path.join(out_dir, f"{match_id}-formation-full.png"),
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("maps_dir"); ap.add_argument("match_id")
    args = ap.parse_args()
    saved = render(args.pdf, args.maps_dir, args.match_id)
    print(f"crop_formation OK: {len(saved)} files")


if __name__ == "__main__":
    main()
