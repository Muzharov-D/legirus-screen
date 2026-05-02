"""crop_maps.py — render team-level heatmap pages as PNGs (stub for v1).

Sportvisor team-aggregate pages (12-20) carry heatmaps. Real cropping is
deferred to a future iteration; this stub creates the directory and exits OK
so the pdfParser pipeline does not error out.
"""
import argparse, os, sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("maps_dir"); ap.add_argument("match_id")
    args = ap.parse_args()
    os.makedirs(args.maps_dir, exist_ok=True)
    print(f"crop_maps stub OK match_id={args.match_id} dir={args.maps_dir}")


if __name__ == "__main__":
    main()
