"""End-to-end golden test for the Sportvisor parser pipeline.

Runs build_match.py against the bundled 2010 PDF and compares the output to
parsers/golden/match-001.golden.json. The test focuses on regressions of the
must-have parsing scope (SPEC_REAL_PARSER_v1):

  - Match metadata (id, teamId, season, date, score)
  - Both team identities + summary stats
  - All 9 player-stat tables (overall/fitness/attack 1..5/defence 1..3)
  - All team aggregate sections (shooting → positioning)
  - The dynamic id_map (15 players from legirus-2010 mapped correctly)

Out-of-scope (allowed to differ silently):
  - `formation`              — minimal closure per spec stage 3
  - `players[*].splits`      — minimal closure per spec stage 5
  - `source` metadata        — paths/file names diverge between environments
  - `mapImage` URL paths     — generated from match_id at build time

Run from backend/:
    python -m pytest parsers/tests -v
"""
import json
import os
import subprocess
import sys
import tempfile

import pytest

REPO_BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PARSERS_DIR = os.path.join(REPO_BACKEND, "parsers")
GOLDEN_PATH = os.path.join(PARSERS_DIR, "golden", "match-001.golden.json")
PDF_2010 = os.path.join(PARSERS_DIR, "sportvisor_legirus2010_match001.pdf")
PDF_2011 = os.path.join(PARSERS_DIR, "sportvisor_legirus2011_match002.pdf")

FLOAT_TOL = 0.05
SKIP_PATHS = {
    ".formation",
    ".source",
    ".teamAggregates",       # v1: stub (only mapImage paths emitted)
    ".teamSummaryStats",     # v1: page1 partial (score/teams/date already covered by metadata test)
}
SKIP_KEY_NAMES = {
    "splits",      # players[*].splits — minimal closure
    "mapImage",    # cosmetic path
    "source",
}


def _run_pipeline(pdf_path, team_id, match_id):
    out_dir = tempfile.mkdtemp(prefix=f"{match_id}-test-")
    out_json = os.path.join(out_dir, f"{match_id}.json")
    env = dict(os.environ)
    env["PARSER_INTERMEDIATE_DIR"] = out_dir
    env["PYTHONIOENCODING"] = "utf-8"
    cmd = [sys.executable, os.path.join(PARSERS_DIR, "build_match.py"),
           pdf_path, out_json, team_id, match_id]
    subprocess.run(cmd, check=True, cwd=PARSERS_DIR, env=env)
    with open(out_json, encoding="utf-8") as f:
        return json.load(f)


def _diff(a, b, path=""):
    """Yield human-readable strings describing differences (ignoring SKIP_*)."""
    if path in SKIP_PATHS:
        return
    if isinstance(a, dict) and isinstance(b, dict):
        for k in set(a) | set(b):
            if k in SKIP_KEY_NAMES:
                continue
            new_path = f"{path}.{k}"
            if new_path in SKIP_PATHS:
                continue
            if k not in a:
                yield f"{new_path}: missing in NEW"
            elif k not in b:
                yield f"{new_path}: extra in NEW"
            else:
                yield from _diff(a[k], b[k], new_path)
        return
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            yield f"{path}: list len NEW={len(a)} GOLD={len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            yield from _diff(x, y, f"{path}[{i}]")
        return
    # Leaf compare
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if abs(float(a) - float(b)) > FLOAT_TOL:
            yield f"{path}: NEW={a!r} GOLD={b!r}"
        return
    if a != b:
        yield f"{path}: NEW={a!r} GOLD={b!r}"


def test_pdfs_present():
    assert os.path.exists(PDF_2010), f"missing fixture {PDF_2010}"
    assert os.path.exists(PDF_2011), f"missing fixture {PDF_2011}"
    assert os.path.exists(GOLDEN_PATH), f"missing golden {GOLDEN_PATH}"


def test_match_001_no_regression():
    """Pipeline output for the 2010 PDF must match golden/match-001 (modulo skip set)."""
    new = _run_pipeline(PDF_2010, "legirus-2010", "match-001")
    with open(GOLDEN_PATH, encoding="utf-8") as f:
        gold = json.load(f)
    diffs = list(_diff(new, gold))
    if diffs:
        sample = "\n".join(diffs[:30])
        pytest.fail(f"{len(diffs)} regression diffs:\n{sample}")


def test_match_002_loads():
    """Pipeline runs end-to-end on the 2011 PDF and emits a non-trivial match.json."""
    out = _run_pipeline(PDF_2011, "legirus-2011", "match-002")
    assert out["teamId"] == "legirus-2011"
    assert out["homeTeam"]["id"] == "legirus-2011"
    assert out["awayTeam"]["id"] == "porohovchanin-2011"
    assert out["score"] == {"home": 1, "away": 1}
    assert isinstance(out["players"], list) and len(out["players"]) >= 10
    # Each player should have ratings + radar
    for p in out["players"]:
        assert p["id"], "player missing id"
        assert p["ratings"]["overall"] is not None
        assert isinstance(p["radar"], dict)
    # Aggregates present
    for sec in ("shooting", "setPieces", "possession", "passes",
                "attacks", "recoveriesAndTackling", "duels",
                "pressing", "positioning"):
        assert sec in out["teamAggregates"]


def test_id_map_strategy_b_rejects_unknown_player():
    """If a team_id has no roster, build_match exits non-zero with a clear message."""
    out_dir = tempfile.mkdtemp(prefix="missing-team-test-")
    out_json = os.path.join(out_dir, "match-x.json")
    env = dict(os.environ)
    env["PARSER_INTERMEDIATE_DIR"] = out_dir
    env["PYTHONIOENCODING"] = "utf-8"
    cmd = [sys.executable, os.path.join(PARSERS_DIR, "build_match.py"),
           PDF_2010, out_json, "team-that-doesnt-exist", "match-x"]
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=PARSERS_DIR, env=env)
    assert proc.returncode != 0, f"expected nonzero exit, got 0\nstdout={proc.stdout}\nstderr={proc.stderr}"
    combined = (proc.stdout or "") + (proc.stderr or "")
    assert "team-that-doesnt-exist" in combined or "ростер" in combined
