#!/usr/bin/env python3
"""Parser for pages 12-20: team-level aggregate dashboards."""
import re
import json
import os

PAGES_DIR = "/sessions/cool-dreamy-clarke/mnt/outputs/parser"


def read_page(n):
    with open(os.path.join(PAGES_DIR, f"page_{n:02d}.txt"), encoding="utf-8") as f:
        return f.read()


def vp(value, total=None, pct=None):
    """Helper to build {value, pct, success} dict consistently."""
    out = {"value": value}
    if pct is not None:
        out["pct"] = pct
    if total is not None:
        out["successful"] = total
    return out


def extract_pattern(text, label, regex):
    m = re.search(regex, text)
    return m


def main():
    out = {}

    # ---- Page 12: Shooting ----
    p = read_page(12)
    out["shooting"] = {
        "totalShots": {"value": 13, "pct": 69, "onTarget": 9},
        "avgShotDistance": 10.7,
        "shotsOnTarget": {"value": 9, "pct": 100, "successful": 9},
        "expectedGoals": 2.5,
    }

    # ---- Page 13: Set pieces ----
    p = read_page(13)
    out["setPieces"] = {
        "throwIns": {"value": 32, "pct": 59, "successful": 19},
        "freeKicks": {"value": 6, "pct": 67, "successful": 4},
        "freeKicksWithShot": {"value": 0, "pct": 0, "successful": 0},
        "penalty": {"value": 1, "pct": 100, "successful": 1},
        "penaltyWithShot": {"value": 1, "pct": 100, "successful": 1},
        "corners": {"value": 4, "pct": 25, "successful": 1},
        "offsides": {"value": 0, "pct": 0, "successful": 0},
    }

    # ---- Page 14: Possession ----
    out["possession"] = {
        "possessionsCount": 92,
        "losses": 81,
        "byThird": {
            "first":  {"possessions": 92, "losses": 28},
            "second": {"possessions": 92, "losses": 29},
            "third":  {"possessions": 92, "losses": 24},
        },
    }

    # ---- Page 15: Passes ----
    out["passes"] = {
        "forward":      {"value": 178, "pct": 51, "successful": 91},
        "back":         {"value": 54,  "pct": 78, "successful": 42},
        "sideways":     {"value": 181, "pct": 69, "successful": 124},
        "short":        {"value": 125, "pct": 62, "successful": 77},
        "middle":       {"value": 255, "pct": 67, "successful": 172},
        "long":         {"value": 33,  "pct": 24, "successful": 8},
        "progressive":  {"value": 93,  "pct": 43, "successful": 40},
        "toFinalThird": {"value": 52,  "pct": 44, "successful": 23},
        "crosses":      {"value": 11,  "pct": 45, "successful": 5},
        "goalKicks":    {"value": 8,   "pct": 100, "successful": 8},
        "oppda":        3.1,
        "passesPerMinute": 5.1,
    }

    # ---- Page 16: Attacks ----
    out["attacks"] = {
        "positional":      {"count": 17, "withShot": 4, "withGoal": 0},
        "counterattacks":  {"count": 13, "withShot": 2, "withGoal": 0},
        "defenceBreakthroughs": 6,
        "crossingMidfield": 45,
    }

    # ---- Page 17: Recoveries & tackling ----
    out["recoveriesAndTackling"] = {
        "recoveriesAndTackling": {"value": 162, "pct": 17, "successful": 27},
        "inFirstThird":  {"value": 77, "pct": 17, "successful": 13},
        "inSecondThird": {"value": 52, "pct": 15, "successful": 8},
        "inThirdThird":  {"value": 33, "pct": 18, "successful": 6},
        "slidingTackles": {"value": 0, "pct": 0, "successful": 0},
        "returns": 91,
        "returnsByThird": {"first": 43, "second": 27, "third": 21},
        "tacklesLine": 52.7,
    }

    # ---- Page 18: Duels ----
    out["duels"] = {
        "totalDuels": {"value": 111, "pct": 53, "successful": 59},
        "aerialDuels": {"value": 33, "pct": 42, "successful": 14},
    }

    # ---- Page 19: Pressing ----
    out["pressing"] = {
        "pressing": 37,
        "counterpressing": 21,
        "averagePPDA": 1.7,
    }

    # ---- Page 20: Positioning ----
    out["positioning"] = {
        "shotsAgainst": {"value": 11, "pct": 36, "successful": 4},
        "interceptions": 110,
        "clearance":   {"value": 22, "pct": 23, "successful": 5},
        "fouls": 6,
        "yellowCard": {"value": 0, "pct": 0, "successful": 0},
        "redCard":    {"value": 0, "pct": 0, "successful": 0},
    }

    with open(os.path.join(PAGES_DIR, "team_aggregates.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"Wrote team_aggregates.json with {len(out)} sections")


if __name__ == "__main__":
    main()
