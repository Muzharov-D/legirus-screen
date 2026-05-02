"""Player splits parser (stub for v1).

Per-player M/1/2 splits live on PDF pages 21+ in a table-per-player layout.
v1 returns an empty dict; UI gracefully falls back to "no splits available".
"""


def parse(pdf_path):
    return {}


if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    args = ap.parse_args()
    print(json.dumps(parse(args.pdf), ensure_ascii=False, indent=2))
