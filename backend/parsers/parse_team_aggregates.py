"""Team aggregates parser (v1).

Each section returns a dict with:
  - mapImage: path to the rendered PNG (created by crop_maps.py)
  - <metric numbers>: parsed from PDF text where extractable; left at 0 otherwise

v1 ships only the mapImage paths so the UI can render heatmaps. Numerical
fields will be filled in v2 (per-section regex parsing on pages 12-20).
"""


def parse(pdf_path, match_id):
    prefix = f"/assets/maps/{match_id}-team-"
    return {
        "shooting":              {"mapImage": f"{prefix}shooting-map.png"},
        "setPieces":             {"mapImage": f"{prefix}set-pieces-map.png"},
        "possession":            {"mapImage": f"{prefix}possession-map.png"},
        "passes":                {"mapImage": f"{prefix}passes-map.png"},
        "attacks":               {"mapImage": f"{prefix}attacks-map.png"},
        "recoveriesAndTackling": {"mapImage": f"{prefix}recoveries-map.png"},
        "duels":                 {"mapImage": f"{prefix}duels-map.png"},
        "pressing":              {"mapImage": f"{prefix}pressing-map.png"},
        "positioning":           {"mapImage": f"{prefix}positioning-map.png"},
    }


if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("match_id")
    args = ap.parse_args()
    print(json.dumps(parse(args.pdf, args.match_id), ensure_ascii=False, indent=2))
