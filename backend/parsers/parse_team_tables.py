"""Parse Sportvisor team-level player tables (pages 2-11).

Output schema (matches golden/match-001.golden.json):
{
  "overall":  {<num>: {...}},
  "fitness":  {<num>: {...}},
  "attack1":  {<num>: {...}},
  "attack2..5": {<num>: {<key>: {value, pct}}},
  "defence1":   {<num>: {...}},
  "defence2..3": {<num>: {<key>: {value, pct}}},
}
"""
import re
import logging
from lib.pdf_extract import extract_page_text, parse_value_with_pct, parse_number, parse_ru_number, split_row_tokens

LOG = logging.getLogger("parser.team_tables")

PAGE_OVERALL  = 2
PAGE_FITNESS  = 3
PAGE_ATTACK1  = 4
PAGE_ATTACK2  = 5
PAGE_ATTACK3  = 6
PAGE_ATTACK4  = 7
PAGE_ATTACK5  = 8
PAGE_DEFENCE1 = 9
PAGE_DEFENCE2 = 10
PAGE_DEFENCE3 = 11

OVERALL_COLUMNS = [
    "overallIndex", "fitnessTotal", "distance", "intensity", "speed",
    "attackTotal", "possession", "forwardPlay", "dribbling", "shooting", "setPiece",
    "defenceTotal", "pressing", "duels", "positioning", "tackling", "goalkeeping",
]
FITNESS_COLUMNS = [
    "fitnessTotal", "totalDistance",
    "speed_4_5_5", "speed_5_5_7", "speed_7plus",
    "intenseRunning", "sprintsCount", "sprintDistance", "averageSpeed",
]
ATTACK1_COLUMNS = [
    "attackTotal", "goalActions", "xG", "xA",
    "keyPass", "assist", "secondAssist", "thirdAssist",
]
ATTACK2_COLUMNS = [
    "shotAssist", "shotOnTargetAssist", "intoPenArea", "cross",
    "passPacking", "throughPass", "progressivePass",
    "passToFinalThird", "progressiveRun", "pass",
]
ATTACK3_COLUMNS = [
    "passForward", "passBack", "passSideways", "passShort", "passMiddle", "passLong",
    "touchesInPenArea", "receivedPass", "foulsSuffered", "technicalMistake",
]
ATTACK4_COLUMNS = [
    "loseOnOwnHalf", "lostBall", "dangerousLosesOnOwnHalf",
    "dribble", "dribblePacking", "dribbleAgainst",
    "goal", "shot", "freeKick", "freeKickShot",
]
ATTACK5_COLUMNS = [
    "directFreeKick", "freeKickWithShot", "entriesInBox",
    "offside", "penalty", "byHead", "corner", "throwing", "acceleration",
]
DEFENCE1_COLUMNS = [
    "defenceTotal", "tackle", "slidingTackles", "tackleAndRecovery",
    "interception", "recovery", "clearance", "blockedShot",
]
DEFENCE2_COLUMNS = [
    "duel", "aerialDuel", "pressing", "counterpressing",
    "foul", "yellowCard", "redCard", "dribbleAgainst",
    "return", "returnOnOppHalf",
]
DEFENCE3_COLUMNS = [
    "save", "goalkeeperExits", "shotsAgainst", "shotAgainst",
    "goalKick", "shortGoalKicks", "longGoalKicks",
]

_ROW_RE = re.compile(r"^(\d{1,2})\s+(\S+)\s+(\S+\.?)\s+(.+)$")


def _data_rows(text):
    for raw in (text or "").split("\n"):
        line = raw.strip()
        if not line:
            continue
        m = _ROW_RE.match(line)
        if not m:
            continue
        num = m.group(1)
        if not (1 <= int(num) <= 99):
            continue
        name = f"{m.group(2)} {m.group(3)}"
        rest = m.group(4)
        yield num, name, rest


def _strip_position_minutes(rest):
    parts = rest.split(None, 2)
    if len(parts) < 3:
        return None, None, []
    position = parts[0]
    try:
        minutes = int(parts[1])
    except ValueError:
        return None, None, []
    remaining_text = parts[2] if len(parts) > 2 else ""
    return position, minutes, split_row_tokens(remaining_text)


def parse_overall(pdf_path):
    out = {}
    text = extract_page_text(pdf_path, PAGE_OVERALL)
    for num, name, rest in _data_rows(text):
        position, minutes, tokens = _strip_position_minutes(rest)
        if position is None or len(tokens) < len(OVERALL_COLUMNS):
            LOG.warning("overall: skip row #%s (incomplete)", num)
            continue
        row = {"name": name, "position": position, "minutes": minutes}
        for i, col in enumerate(OVERALL_COLUMNS):
            row[col] = parse_number(tokens[i])
        out[num] = row
    return out


def _parse_with_position(pdf_path, page_num, columns, plain_numbers=True):
    out = {}
    text = extract_page_text(pdf_path, page_num)
    for num, name, rest in _data_rows(text):
        position, minutes, tokens = _strip_position_minutes(rest)
        if position is None or len(tokens) < len(columns):
            LOG.warning("page %d: skip row #%s (incomplete)", page_num, num)
            continue
        if plain_numbers:
            row = {"name": name, "position": position, "minutes": minutes}
            for i, col in enumerate(columns):
                row[col] = parse_ru_number(tokens[i])
        else:
            row = {
                "name": name,
                "position": position,
                "minutes": {"value": minutes, "pct": None},
            }
            for i, col in enumerate(columns):
                row[col] = parse_value_with_pct(tokens[i])
        out[num] = row
    return out


def _parse_metrics_only(pdf_path, page_num, columns):
    out = {}
    text = extract_page_text(pdf_path, page_num)
    for num, name, rest in _data_rows(text):
        tokens = split_row_tokens(rest)
        if len(tokens) < len(columns):
            LOG.warning("page %d: skip row #%s (got %d, need %d)",
                        page_num, num, len(tokens), len(columns))
            continue
        row = {}
        for i, col in enumerate(columns):
            row[col] = parse_value_with_pct(tokens[i])
        out[num] = row
    return out


def parse_fitness(pdf_path):
    return _parse_with_position(pdf_path, PAGE_FITNESS, FITNESS_COLUMNS, plain_numbers=True)


def parse_attack1(pdf_path):
    return _parse_with_position(pdf_path, PAGE_ATTACK1, ATTACK1_COLUMNS, plain_numbers=True)


def parse_attack2(pdf_path):
    return _parse_metrics_only(pdf_path, PAGE_ATTACK2, ATTACK2_COLUMNS)


def parse_attack3(pdf_path):
    return _parse_metrics_only(pdf_path, PAGE_ATTACK3, ATTACK3_COLUMNS)


def parse_attack4(pdf_path):
    return _parse_metrics_only(pdf_path, PAGE_ATTACK4, ATTACK4_COLUMNS)


def parse_attack5(pdf_path):
    return _parse_metrics_only(pdf_path, PAGE_ATTACK5, ATTACK5_COLUMNS)


def parse_defence1(pdf_path):
    return _parse_with_position(pdf_path, PAGE_DEFENCE1, DEFENCE1_COLUMNS, plain_numbers=False)


def parse_defence2(pdf_path):
    return _parse_metrics_only(pdf_path, PAGE_DEFENCE2, DEFENCE2_COLUMNS)


def parse_defence3(pdf_path):
    return _parse_metrics_only(pdf_path, PAGE_DEFENCE3, DEFENCE3_COLUMNS)


def parse_all(pdf_path):
    return {
        "overall":  parse_overall(pdf_path),
        "fitness":  parse_fitness(pdf_path),
        "attack1":  parse_attack1(pdf_path),
        "attack2":  parse_attack2(pdf_path),
        "attack3":  parse_attack3(pdf_path),
        "attack4":  parse_attack4(pdf_path),
        "attack5":  parse_attack5(pdf_path),
        "defence1": parse_defence1(pdf_path),
        "defence2": parse_defence2(pdf_path),
        "defence3": parse_defence3(pdf_path),
    }


if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("output_json")
    args = ap.parse_args()
    data = parse_all(args.pdf)
    with open(args.output_json, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"OK overall={len(data['overall'])} players, tables={len(data)}")
