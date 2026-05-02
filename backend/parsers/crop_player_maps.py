"""crop_player_maps.py — render per-player heatmap pages as PNGs (stub for v1).

Player heatmap pages (21+) require per-player coordinates to crop. v1 is a
no-op stub so the pipeline succeeds; per-player heatmap PNGs are not produced.
"""
import argparse, os, sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("maps_dir"); ap.add_argument("match_id")
    args = ap.parse_args()
    os.makedirs(args.maps_dir, exist_ok=True)
    print(f"crop_player_maps stub OK match_id={args.match_id} dir={args.maps_dir}")


if __name__ == "__main__":
    main()
