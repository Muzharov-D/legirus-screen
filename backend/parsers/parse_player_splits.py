#!/usr/bin/env python3
"""Parse pages 21-35 (individual player profiles) with Match / 1 time / 2 time splits."""
import re, json, os, subprocess

PAGES_DIR = "/sessions/cool-dreamy-clarke/mnt/outputs/parser"
PDF_PATH = "/sessions/cool-dreamy-clarke/mnt/uploads/6097_4265.pdf"

PAGE_PLAYER = {
    21: (17, "Турапин", "Матвей", "Центральный атакующий полузащитник"),
    22: (5,  "Галицкий", "Михаил", "Центральный защитник"),
    23: (8,  "Закусилов", "Артем", "Правый полузащитник"),
    24: (2,  "Октябрев", "Арсений", "Центральный защитник"),
    25: (19, "Бондарь", "Даниил", "Левый защитник"),
    26: (21, "Бобин", "Денис", "Центральный атакующий полузащитник"),
    27: (9,  "Воронков", "Владимир", "Центральный нападающий"),
    28: (33, "Макаров", "Кузьма", "Левый полузащитник"),
    29: (52, "Татарченко", "Георгий", "Вратарь"),
    30: (12, "Клебанов", "Семён", "Правый защитник"),
    31: (15, "Дютиль", "Андрей", "Центральный атакующий полузащитник"),
    32: (31, "Безбородкин", "Дмитрий", "Правый защитник"),
    33: (23, "Ахмадов", "Джайхун", "Центральный полузащитник"),
    34: (1,  "Семёнов", "Максим", "Вратарь"),
    35: (22, "Кондаков", "Алексей", "Центральный атакующий полузащитник"),
}

def extract_raw(page):
    r = subprocess.run(["pdftotext", "-raw", "-f", str(page), "-l", str(page), PDF_PATH, "-"],
                       capture_output=True, text=True, check=True)
    return r.stdout

VALUE_RE = re.compile(r"^([+-]?\d+(?:\.\d+)?%?)$")

def parse_value(token):
    if token.endswith("%"):
        v = token[:-1]
        return {"pct": float(v) if "." in v else int(v)}
    if "." in token:
        return float(token)
    return int(token)

def parse_metric_lines(raw_text):
    metrics = {}
    for ln in raw_text.split("\n"):
        ln = ln.strip()
        if not ln: continue
        tokens = ln.split()
        if len(tokens) < 4: continue
        last3 = tokens[-3:]
        if all(VALUE_RE.match(t) for t in last3):
            label = " ".join(tokens[:-3])
            if label.startswith("19.04.2026") or label.startswith("Match") or label == "":
                continue
            if re.fullmatch(r"[\d\s.\-+]+", label):
                continue
            metrics[label] = {
                "match": parse_value(last3[0]),
                "first": parse_value(last3[1]),
                "second": parse_value(last3[2]),
            }
    return metrics

def main():
    out = {}
    for page, (num, last, first, pos_full) in PAGE_PLAYER.items():
        raw = extract_raw(page)
        metrics = parse_metric_lines(raw)
        out[num] = {
            "number": num,
            "lastName": last,
            "firstName": first,
            "fullName": f"{first} {last}",
            "positionFull": pos_full,
            "splits": metrics,
        }
    with open(os.path.join(PAGES_DIR, "player_splits.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    for num, d in out.items():
        print(f"#{num:>2} {d['fullName']} -> {len(d['splits'])} metrics")

if __name__ == "__main__":
    main()
