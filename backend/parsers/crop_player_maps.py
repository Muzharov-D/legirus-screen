"""crop_player_maps.py — render per-player Sportvisor pages as PNG heatmaps.

Player pages start at p21+ in the PDF. Each page header has the form:
  "<date> <home> <score> <away> Player Stats – <Имя> <Фамилия>"

We map header names to player.id via players.json (looked up by teamId).
For each player we render the first page where they appear at two sizes:
  -heatmap.png     (general overview, used as fitnessHeatmap)
  -attack-map.png  (a copy for now; v2 will crop attack-only region)

Output naming aligned with golden:
  match-XXX-<player-id>-heatmap.png
  match-XXX-<player-id>-attack-map.png
"""
import argparse, os, re, json, sys
import pdfplumber

PARSERS_DIR = os.path.dirname(os.path.abspath(__file__))
PLAYERS_JSON = os.path.join(PARSERS_DIR, "..", "data", "players.json")

# Header anchor: "Player Stats – <FullName>" or "Player Stats - <FullName>"
HEADER_RE = re.compile(r"Player\s+Stats\s*[–—\-]\s*(.+?)\s*$")


def load_roster(team_id):
    if not os.path.exists(PLAYERS_JSON):
        return []
    data = json.load(open(PLAYERS_JSON, encoding="utf-8"))
    return [p for p in data.get("players", []) if p.get("teamId") == team_id]


def match_player_by_name(name_in_pdf, roster):
    """Try matching '<First> <Last>' or '<Last> <First>' against roster fullName."""
    name = (name_in_pdf or "").strip()
    if not name:
        return None
    for p in roster:
        if (p.get("fullName") or "").strip() == name:
            return p
    # Try swapping word order
    parts = name.split()
    if len(parts) == 2:
        swapped = f"{parts[1]} {parts[0]}"
        for p in roster:
            if (p.get("fullName") or "").strip() == swapped:
                return p
    # Fall back: lastName + firstName initial
    if parts:
        last = parts[0]
        for p in roster:
            if (p.get("lastName") or "").strip() == last:
                return p
        first = parts[0]
        for p in roster:
            if (p.get("firstName") or "").strip() == first:
                return p
    return None


def render(pdf_path, out_dir, match_id, team_id):
    os.makedirs(out_dir, exist_ok=True)
    roster = load_roster(team_id)
    if not roster:
        print(f"  WARN: no roster for {team_id}", file=sys.stderr)
        return []

    saved = []
    seen_pids = set()
    with pdfplumber.open(pdf_path) as pdf:
        # Player pages start at 21
        for pn in range(21, len(pdf.pages) + 1):
            page = pdf.pages[pn - 1]
            text = page.extract_text() or ""
            first_line = next((l for l in text.split("\n") if l.strip()), "")
            m = HEADER_RE.search(first_line)
            if not m:
                continue
            name = m.group(1).strip()
            player = match_player_by_name(name, roster)
            if not player:
                print(f"  p{pn}: no roster match for {name!r}", file=sys.stderr)
                continue
            pid = player["id"]
            if pid in seen_pids:
                continue  # only first page per player
            seen_pids.add(pid)

            # Render full page at two sizes — heatmap (general) + attack-map (copy for v1)
            for variant, dpi in [("heatmap", 150), ("attack-map", 150)]:
                out = os.path.join(out_dir, f"{match_id}-{pid}-{variant}.png")
                page.to_image(resolution=dpi).save(out, format="PNG")
                saved.append(out)

    return saved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("maps_dir")
    ap.add_argument("match_id")
    ap.add_argument("team_id", nargs="?", default=None)
    args = ap.parse_args()
    if not args.team_id:
        # Best-effort: derive from match_id pattern (legacy callers); v1 expects explicit.
        print("crop_player_maps: team_id is required for v1", file=sys.stderr)
        return 0
    saved = render(args.pdf, args.maps_dir, args.match_id, args.team_id)
    print(f"crop_player_maps OK: {len(saved)} files written for {args.team_id}")


if __name__ == "__main__":
    main()
