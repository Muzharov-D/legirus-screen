"""Page 1: match summary stats panel."""
import json, os
PAGES_DIR = "/sessions/cool-dreamy-clarke/mnt/outputs/parser"

# Hand-verified from PDF page 1 (statistics panel + formation)
match_summary = {
    "matchId": "match-001",
    "date": "2026-04-19",
    "homeTeam": "Легирус 2010",
    "awayTeam": "Пороховчанин 2010",
    "homeTeamId": "legirus-2010",
    "awayTeamId": "porohovchanin-2010",
    "score": {"home": 4, "away": 0},
    "homeStats": {
        "possessionPct": 58,
        "shots": {"total": 13, "accuracy": 69, "onTarget": 9},
        "expectedGoals": 2.5,
        "passes": {"total": 413, "accuracy": 62, "successful": 257},
        "freeKickShots": 6,
        "corners": {"total": 4, "accuracy": 25, "successful": 1},
        "fouls": 6,
        "yellowCards": 0,
        "redCards": 0,
        "offsides": 0
    },
    "awayStats": {
        "possessionPct": 42,
        "shots": {"total": 11, "accuracy": 36, "onTarget": 4},
        "expectedGoals": 2.1,
        "passes": {"total": 334, "accuracy": 57, "successful": 192},
        "freeKickShots": 6,
        "corners": {"total": 3, "accuracy": 67, "successful": 2},
        "fouls": 6,
        "yellowCards": 0,
        "redCards": 0,
        "offsides": 0
    },
    "formation": {
        "starters": [
            {"number": 9,  "shortName": "В. Воронков",   "rating": 8.4, "goals": 2, "positionSlot": "Центральный нападающий"},
            {"number": 17, "shortName": "М. Турапин",    "rating": 7.7, "goals": 0, "positionSlot": "Левый полузащитник"},
            {"number": 21, "shortName": "Д. Бобин",      "rating": 7.7, "goals": 0, "positionSlot": "Центральный полузащитник"},
            {"number": 15, "shortName": "А. Дютиль",     "rating": 7.8, "goals": 0, "positionSlot": "Правый полузащитник"},
            {"number": 33, "shortName": "К. Макаров",    "rating": 8.0, "goals": 0, "positionSlot": "Левый полузащитник"},
            {"number": 8,  "shortName": "А. Закусилов",  "rating": 8.1, "goals": 0, "positionSlot": "Правый полузащитник"},
            {"number": 19, "shortName": "Д. Бондарь",    "rating": 8.7, "goals": 0, "positionSlot": "Левый защитник"},
            {"number": 2,  "shortName": "А. Октябрев",   "rating": 9.0, "goals": 1, "positionSlot": "Центральный защитник"},
            {"number": 5,  "shortName": "М. Галицкий",   "rating": 9.5, "goals": 0, "positionSlot": "Центральный защитник"},
            {"number": 12, "shortName": "С. Клебанов",   "rating": 9.2, "goals": 0, "positionSlot": "Правый защитник"},
            {"number": 52, "shortName": "Г. Татарченко", "rating": 7.8, "goals": 0, "positionSlot": "Вратарь"}
        ],
        "substitutes": [
            {"number": 31, "shortName": "Д. Безбородкин", "rating": 8.1},
            {"number": 23, "shortName": "Д. Ахмадов",    "rating": 8.4},
            {"number": 22, "shortName": "А. Кондаков",   "rating": 7.2},
            {"number": 1,  "shortName": "С. Максим",     "rating": 5.6}
        ]
    },
    "guestTeamPlaceholder": "Нет данных об игроках команды. Пожалуйста, укажите данные об игроках и их позициях для отображения схемы команды и расчёта точных рейтингов игроков по матчу"
}

with open(os.path.join(PAGES_DIR, "page1_summary.json"), "w", encoding="utf-8") as f:
    json.dump(match_summary, f, ensure_ascii=False, indent=2)
print("page1_summary.json written")
