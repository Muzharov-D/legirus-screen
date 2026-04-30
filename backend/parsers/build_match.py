"""Build the consolidated match-001.json by merging:
   - team_tables.json (pages 2-11, per-player match totals)
   - team_aggregates.json (pages 12-20, team breakdowns)
   - player_splits.json (pages 21-35, per-player M/1/2 splits)
   - page1_summary.json (page 1 match panel)
"""
import json, os
P = "/sessions/cool-dreamy-clarke/mnt/outputs/parser"

def load(name):
    return json.load(open(os.path.join(P, name), encoding="utf-8"))

team_tables = load("team_tables.json")
team_aggregates = load("team_aggregates.json")
player_splits = load("player_splits.json")
page1 = load("page1_summary.json")

ID_MAP = {
    "17": "p17-turapin", "5": "p05-galitsky", "8": "p08-zakusilov",
    "2": "p02-oktyabrev", "19": "p19-bondar", "21": "p21-bobin",
    "9": "p09-voronkov", "33": "p33-makarov", "52": "p52-tatarchenko",
    "12": "p12-klebanov", "15": "p15-dutil", "31": "p31-bezborodkin",
    "23": "p23-ahmadov", "1": "p01-maksim", "22": "p22-kondakov",
}

# Build players section: 15 players with all data
players = []
for num_str, pid in ID_MAP.items():
    n = num_str
    overall = team_tables["overall"].get(n, {})
    fitness = team_tables["fitness"].get(n, {})
    attack1 = team_tables["attack1"].get(n, {})
    attack2 = team_tables["attack2"].get(n, {})
    attack3 = team_tables["attack3"].get(n, {})
    attack4 = team_tables["attack4"].get(n, {})
    attack5 = team_tables["attack5"].get(n, {})
    defence1 = team_tables["defence1"].get(n, {})
    defence2 = team_tables["defence2"].get(n, {})
    defence3 = team_tables["defence3"].get(n, {})
    splits_obj = player_splits.get(n, {})

    player = {
        "id": pid,
        "number": int(n),
        "fullName": splits_obj.get("fullName"),
        "lastName": splits_obj.get("lastName"),
        "firstName": splits_obj.get("firstName"),
        "shortName": overall.get("name"),
        "position": overall.get("position"),
        "positionFull": splits_obj.get("positionFull"),
        "minutes": overall.get("minutes"),
        "ratings": {
            "overall": overall.get("overallIndex"),
            "fitness": overall.get("fitnessTotal"),
            "attack": overall.get("attackTotal"),
            "defence": overall.get("defenceTotal"),
        },
        "radar": {
            "tackling": overall.get("tackling"),
            "positioning": overall.get("positioning"),
            "duels": overall.get("duels"),
            "pressing": overall.get("pressing"),
            "distance": overall.get("distance"),
            "intensity": overall.get("intensity"),
            "forwardPlay": overall.get("forwardPlay"),
            "possession": overall.get("possession"),
            "dribbling": overall.get("dribbling"),
            "shooting": overall.get("shooting"),
            "setPiece": overall.get("setPiece"),
            "defenceTotal": overall.get("defenceTotal"),
            "fitnessTotal": overall.get("fitnessTotal"),
            "attackTotal": overall.get("attackTotal"),
            "speed": overall.get("speed"),
            "goalkeeping": overall.get("goalkeeping"),
        },
        "stats": {
            "fitness": fitness,
            "attack1": attack1,
            "attack2": attack2,
            "attack3": attack3,
            "attack4": attack4,
            "attack5": attack5,
            "defence1": defence1,
            "defence2": defence2,
            "defence3": defence3,
        },
        "splits": splits_obj.get("splits", {}),
    }
    players.append(player)

# Sort by overall rating desc
players.sort(key=lambda p: -(p["ratings"]["overall"] or 0))

match = {
    "id": "match-001",
    "date": page1["date"],
    "season": "2025-2026",
    "homeTeam": {"id": page1["homeTeamId"], "name": page1["homeTeam"], "isOurTeam": True},
    "awayTeam": {"id": page1["awayTeamId"], "name": page1["awayTeam"], "isOurTeam": False},
    "score": page1["score"],
    "teamSummaryStats": {
        "home": page1["homeStats"],
        "away": page1["awayStats"],
    },
    "formation": page1["formation"],
    "teamAggregates": team_aggregates,
    "players": players,
    "guestTeamPlaceholder": page1["guestTeamPlaceholder"],
    "source": {"file": "6097_4265.pdf", "tool": "Sportvisor", "extracted": "2026-04-29"},
}

# Average team ratings
ratings = [p["ratings"] for p in players if p.get("ratings", {}).get("overall")]
avg = lambda key: round(sum(r[key] for r in ratings)/len(ratings), 2) if ratings else None
match["teamAvgRatings"] = {
    "overall": avg("overall"),
    "fitness": avg("fitness"),
    "attack": avg("attack"),
    "defence": avg("defence"),
}

with open(os.path.join(P, "match-001.json"), "w", encoding="utf-8") as f:
    json.dump(match, f, ensure_ascii=False, indent=2)
print("match-001.json size:", os.path.getsize(os.path.join(P, "match-001.json")))
print("Players:", len(match["players"]))
print("Team avg ratings:", match["teamAvgRatings"])
