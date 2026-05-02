"""Team aggregates parser (stub for v1).

The team-aggregate values live on PDF pages 12-20 as numbers overlaid on
heatmap images. Extracting them is feasible but heavy; v1 provides the
schema with empty values + correct mapImage paths so the UI can render
heatmaps even before aggregates are populated.
"""


def parse(pdf_path, match_id):
    prefix = "/assets/maps/"
    keys = [
        ("shooting", "shooting-map"),
        ("setPieces", "setpieces-map"),
        ("possession", "possession-map"),
        ("passes", "passes-map"),
        ("attacks", "attacks-map"),
        ("recoveriesAndTackling", "recoveries-map"),
        ("duels", "duels-map"),
        ("pressing", "pressing-map"),
        ("positioning", "positioning-map"),
    ]
    out = {}
    for name, suffix in keys:
        out[name] = {"mapImage": f"{prefix}{match_id}-team-{suffix}.png"}
    return out


if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("match_id")
    args = ap.parse_args()
    print(json.dumps(parse(args.pdf, args.match_id), ensure_ascii=False, indent=2))
