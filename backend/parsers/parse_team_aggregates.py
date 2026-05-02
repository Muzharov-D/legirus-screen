"""Team aggregates parser (v1 stub: mapImage paths only).

Real numeric extraction from pages 12-20 deferred to v2 (FS truncation
blocks larger writes on the workspace mount). Visual heatmaps render via
crop_maps.py PNGs, mapImage paths below are sufficient for the UI.
"""


def parse(pdf_path, match_id):
    p = f"/assets/maps/{match_id}-team-"
    return {
        "shooting":              {"mapImage": f"{p}shooting-map.png"},
        "setPieces":             {"mapImage": f"{p}set-pieces-map.png"},
        "possession":            {"mapImage": f"{p}possession-map.png"},
        "passes":                {"mapImage": f"{p}passes-map.png"},
        "attacks":               {"mapImage": f"{p}attacks-map.png"},
        "recoveriesAndTackling": {"mapImage": f"{p}recoveries-map.png"},
        "duels":                 {"mapImage": f"{p}duels-map.png"},
        "pressing":              {"mapImage": f"{p}pressing-map.png"},
        "positioning":           {"mapImage": f"{p}positioning-map.png"},
    }


if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("match_id")
    args = ap.parse_args()
    print(json.dumps(parse(args.pdf, args.match_id), ensure_ascii=False, indent=2))
