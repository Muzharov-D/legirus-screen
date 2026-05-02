"""Parse Sportvisor page 1: match metadata + team summary stats."""
import re
import logging
from lib.pdf_extract import extract_page_text

LOG = logging.getLogger("parser.page1")

_TITLE_RE = re.compile(r"^(.+?)\s+(\d+):(\d+)\s+(.+)$")
_DATE_RE = re.compile(r"\b(\d{2}\.\d{2}\.\d{4})\b")


def _to_int(s):
    if s is None: return 0
    s = re.sub(r"[^\d-]", "", str(s))
    return int(s) if s and s != "-" else 0


def _to_float(s):
    if s is None: return 0.0
    try:
        return float(str(s).replace(",", "."))
    except ValueError:
        return 0.0


def _parse_pct(s):
    if s is None: return 0
    m = re.search(r"(\d+)\s*%", str(s))
    return int(m.group(1)) if m else 0


def _parse_pct_pair(text, label):
    line = next((l for l in text.split("\n") if label in l), None)
    if not line:
        return None, None
    m = re.search(rf"(\S+)\s+{label}\s+(\S+)", line)
    return (m.group(1), m.group(2)) if m else (None, None)


def _stats_for_side(text, anchor, side):
    line = next((l for l in text.split("\n") if anchor in l), None)
    if not line:
        return None
    parts = line.split(anchor)
    if len(parts) != 2: return None
    chunk = parts[0].strip().split() if side == "home" else parts[1].strip().split()
    return chunk


def _resolve_away_team_id(name):
    import json, os
    teams_path = os.path.join(os.path.dirname(__file__), "..", "data", "teams.json")
    if not os.path.exists(teams_path):
        return None
    try:
        teams = json.load(open(teams_path, encoding="utf-8")).get("teams", [])
    except Exception:
        return None
    name = (name or "").strip()
    for t in teams:
        if t.get("name", "").strip() == name:
            return t["id"]
    return None


def parse(pdf_path, team_id, match_id):
    text = extract_page_text(pdf_path, 1)
    if not text:
        raise ValueError("Page 1 is empty")
    out = {"matchId": match_id, "homeStats": {}, "awayStats": {}, "formation": None}

    first_line = next((l.strip() for l in text.split("\n") if l.strip()), "")
    m = _TITLE_RE.match(first_line)
    if m:
        out["homeTeam"] = m.group(1).strip()
        out["awayTeam"] = m.group(4).strip()
        out["score"] = {"home": int(m.group(2)), "away": int(m.group(3))}
    else:
        out["homeTeam"] = ""; out["awayTeam"] = ""
        out["score"] = {"home": 0, "away": 0}

    md = _DATE_RE.search(text)
    if md:
        d, mo, y = md.group(1).split(".")
        out["date"] = f"{y}-{mo}-{d}"
    else:
        out["date"] = ""

    out["homeTeamId"] = team_id
    out["awayTeamId"] = _resolve_away_team_id(out["awayTeam"])

    home_poss, away_poss = _parse_pct_pair(text, "ВЛАДЕНИЕ")
    out["homeStats"]["possessionPct"] = _parse_pct(home_poss)
    out["awayStats"]["possessionPct"] = _parse_pct(away_poss)

    h = _stats_for_side(text, "УДАРЫ", "home")
    a = _stats_for_side(text, "УДАРЫ", "away")
    if h and len(h) >= 3:
        out["homeStats"]["shots"] = {"total": _to_int(h[-3]), "accuracy": _parse_pct(h[-2]), "onTarget": _to_int(h[-1])}
    else:
        out["homeStats"]["shots"] = {"total": 0, "accuracy": 0, "onTarget": 0}
    if a and len(a) >= 3:
        out["awayStats"]["shots"] = {"total": _to_int(a[0]), "accuracy": _parse_pct(a[1]), "onTarget": _to_int(a[2])}
    else:
        out["awayStats"]["shots"] = {"total": 0, "accuracy": 0, "onTarget": 0}

    xg = re.search(r"(\S+)\s*ОЖИДАЕМЫЕ", text)
    out["homeStats"]["expectedGoals"] = _to_float(xg.group(1)) if xg else 0.0
    xg2 = re.search(r"ГОЛЫ\s*\(xG\)\s*(\S+)", text)
    out["awayStats"]["expectedGoals"] = _to_float(xg2.group(1)) if xg2 else 0.0

    h = _stats_for_side(text, "ПАСЫ", "home") or _stats_for_side(text, "ПЕРЕДАЧИ", "home")
    a = _stats_for_side(text, "ПАСЫ", "away") or _stats_for_side(text, "ПЕРЕДАЧИ", "away")
    if h and len(h) >= 3:
        out["homeStats"]["passes"] = {"total": _to_int(h[-3]), "accuracy": _parse_pct(h[-2]), "successful": _to_int(h[-1])}
    else:
        out["homeStats"]["passes"] = {"total": 0, "accuracy": 0, "successful": 0}
    if a and len(a) >= 3:
        out["awayStats"]["passes"] = {"total": _to_int(a[0]), "accuracy": _parse_pct(a[1]), "successful": _to_int(a[2])}
    else:
        out["awayStats"]["passes"] = {"total": 0, "accuracy": 0, "successful": 0}

    h_fk, a_fk = _parse_pct_pair(text, "ШТРАФНЫЕ")
    if h_fk is None:
        line = next((l for l in text.split("\n") if "ШТРАФНЫЕ" in l), "")
        nums = re.findall(r"\d+", line)
        if len(nums) >= 2:
            h_fk, a_fk = nums[0], nums[1]
    out["homeStats"]["freeKickShots"] = _to_int(h_fk)
    out["awayStats"]["freeKickShots"] = _to_int(a_fk)

    h = _stats_for_side(text, "УГЛОВЫЕ", "home")
    a = _stats_for_side(text, "УГЛОВЫЕ", "away")
    if h and len(h) >= 3:
        out["homeStats"]["corners"] = {"total": _to_int(h[-3]), "accuracy": _parse_pct(h[-2]), "successful": _to_int(h[-1])}
    else:
        out["homeStats"]["corners"] = {"total": 0, "accuracy": 0, "successful": 0}
    if a and len(a) >= 3:
        out["awayStats"]["corners"] = {"total": _to_int(a[0]), "accuracy": _parse_pct(a[1]), "successful": _to_int(a[2])}
    else:
        out["awayStats"]["corners"] = {"total": 0, "accuracy": 0, "successful": 0}

    for label, key in [("НАРУШЕНИЯ", "fouls"), ("ОФСАЙДЫ", "offsides")]:
        h2, a2 = _parse_pct_pair(text, label)
        if h2 is None:
            line = next((l for l in text.split("\n") if label in l), "")
            nums = re.findall(r"\d+", line)
            if len(nums) >= 2:
                h2, a2 = nums[0], nums[1]
        out["homeStats"][key] = _to_int(h2)
        out["awayStats"][key] = _to_int(a2)

    m_yc = re.search(r"ЖЕЛТЫЕ[\s\S]{0,40}?(\d+)\s+(\d+)", text)
    out["homeStats"]["yellowCards"] = int(m_yc.group(1)) if m_yc else 0
    out["awayStats"]["yellowCards"] = int(m_yc.group(2)) if m_yc else 0
    m_rc = re.search(r"КРАСНЫЕ[\s\S]{0,40}?(\d+)\s+(\d+)", text)
    out["homeStats"]["redCards"] = int(m_rc.group(1)) if m_rc else 0
    out["awayStats"]["redCards"] = int(m_rc.group(2)) if m_rc else 0

    if "Нет данных об игроках команды" in text:
        out["guestTeamPlaceholder"] = (
            "Нет данных об игроках команды. Пожалуйста, укажите данные об игроках "
            "и их позициях для отображения схемы команды и расчёта точных рейтингов "
            "игроков по матчу"
        )
    return out


if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("output_json")
    ap.add_argument("team_id"); ap.add_argument("match_id")
    args = ap.parse_args()
    out = parse(args.pdf, args.team_id, args.match_id)
    with open(args.output_json, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"OK score={out.get('score')} date={out.get('date')}")
