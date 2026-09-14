#!/usr/bin/env python3
"""
sync_sheet.py — regenerate the app's bundled plan data from the master Google Sheet.

The Google Sheet is the master training plan. This script downloads it (read-only,
no credentials — the sheet is shared as "anyone with the link can view") and writes:

  workouts.js   — the 175 daily rows from the DAILY WORKOUTS tab (unchanged format)
  plan-meta.js  — per-day focus/coach notes (OFFSEASON MASTER tab), phase overview,
                  testing schedule, loading guide and safety text from the other tabs

Usage:
  python tools/sync_sheet.py            # fetch from Google and regenerate
  python tools/sync_sheet.py --check    # fetch and report differences only
  python tools/sync_sheet.py --file x.xlsx   # use a downloaded copy instead

Requires only the Python standard library.
"""
import json, re, sys, zipfile, io, html, urllib.request, os
from datetime import datetime, timedelta

SHEET_ID = "1ivJpDhBESTyWTp1_TOPuP8xVfK5xyDHc"
XLSX_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Sheet phase labels ("1 — Rebuild", "2 — Establish"...) -> descriptive names used in the app
PHASE_NAMES = {
    "1": "Rebuild", "2": "Strength + Acceleration", "3": "Maximum Velocity",
    "4": "Strength → Power", "5": "Specialization", "6": "Sharpen",
}
DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


# ---------------------------------------------------------------- xlsx reader
def read_xlsx(data):
    """Return {sheetName: [ {col: value}, ... ]} using only zipfile + regex."""
    z = zipfile.ZipFile(io.BytesIO(data))
    wb = z.read("xl/workbook.xml").decode("utf-8")
    sheets = re.findall(r'<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wb)
    rels = {}
    for rel in re.findall(r"<Relationship [^>]*>", z.read("xl/_rels/workbook.xml.rels").decode("utf-8")):
        rid, tgt = re.search(r' Id="([^"]+)"', rel), re.search(r' Target="([^"]+)"', rel)
        if rid and tgt:
            rels[rid.group(1)] = tgt.group(1)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        ss = z.read("xl/sharedStrings.xml").decode("utf-8")
        for si in re.findall(r"<si>(.*?)</si>", ss, re.S):
            shared.append(html.unescape("".join(re.findall(r"<t[^>]*>([^<]*)</t>", si))))
    out = {}
    for name, rid in sheets:
        target = rels[rid]
        path = target.lstrip("/") if target.lstrip("/").startswith("xl/") else "xl/" + target
        xml = z.read(path).decode("utf-8")
        rows = []
        for row in re.findall(r"<row[^>]*>(.*?)</row>", xml, re.S):
            cells = {}
            for m in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)', row, re.S):
                col, attrs, body = m.group(1), m.group(2), m.group(3) or ""
                t = re.search(r'\bt="(\w+)"', attrs)
                t = t.group(1) if t else "n"
                if t == "s":
                    v = re.search(r"<v>(.*?)</v>", body)
                    val = shared[int(v.group(1))] if v else ""
                elif t == "inlineStr":
                    val = html.unescape("".join(re.findall(r"<t[^>]*>([^<]*)</t>", body)))
                else:
                    v = re.search(r"<v>(.*?)</v>", body)
                    val = html.unescape(v.group(1)) if v else ""
                cells[col] = val
            rows.append(cells)
        out[html.unescape(name)] = rows
    return out


def col_index(col):
    n = 0
    for ch in col:
        n = n * 26 + ord(ch) - 64
    return n - 1


def row_list(cells, width=12):
    lst = [""] * width
    for c, v in cells.items():
        i = col_index(c)
        if i < width:
            lst[i] = v.strip() if isinstance(v, str) else v
    return lst


def excel_date(v):
    """Excel serial number or 'Sep 14, 2026' -> 'YYYY-MM-DD' (None if not a date)."""
    s = str(v).strip()
    if re.fullmatch(r"\d+(\.\d+)?", s):
        return (datetime(1899, 12, 30) + timedelta(days=float(s))).strftime("%Y-%m-%d")
    for fmt in ("%b %d, %Y", "%B %d, %Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


# ---------------------------------------------------------------- build data
def build_workouts(daily):
    out = []
    for cells in daily:
        r = row_list(cells, 10)
        d = excel_date(r[0])
        if not d or r[1] not in DAYS:
            continue
        phase_num = str(r[3]).split("—")[0].strip()
        week = str(r[2]).strip()
        out.append({
            "date": d, "day": r[1], "week": week,
            "weekNumber": int(re.sub(r"\D", "", week) or 0),
            "phase": PHASE_NAMES.get(phase_num, str(r[3])), "type": str(r[4]).upper(),
            "warmup": r[5], "speed": r[6], "jumps": r[7], "strength": r[8], "recovery": r[9],
        })
    return out


def build_meta(book):
    days = {}
    for cells in book.get("OFFSEASON MASTER", []):
        r = row_list(cells, 9)
        d = excel_date(r[0])
        if not d or r[1] not in DAYS:
            continue
        note = re.sub(r"^☐\s*Done\s*\|?\s*", "", str(r[8])).strip()
        days[d] = {"focus": r[5], "note": note, "location": r[7]}
    phases = []
    for cells in book.get("PHASE OVERVIEW", []):
        r = row_list(cells, 7)
        m = re.match(r"(\d)\s*—\s*(.+)", str(r[0]))
        if not m:
            continue
        phases.append({"num": int(m.group(1)), "label": m.group(2),
                       "name": PHASE_NAMES.get(m.group(1), m.group(2)), "dates": r[1],
                       "goal": r[2], "speed": r[3], "strength": r[4], "lj": r[5], "outcome": r[6]})
    tests = []
    for cells in book.get("TESTING & PROGRESS", []):
        r = row_list(cells, 8)
        if r[0] and r[0] != "Test" and not str(r[0]).startswith("TESTING"):
            tests.append({"test": r[0], "baseline": r[1], "next": r[3], "goal": r[5]})
    safety = [row_list(c, 2)[0] for c in book.get("WARMUP & SAFETY", []) if row_list(c, 2)[0]]
    loading = []
    for cells in book.get("EXERCISE & LOADING GUIDE", []):
        r = row_list(cells, 4)
        if r[0] and r[0] != "Movement":
            loading.append({"movement": r[0], "start": r[1], "progression": r[2], "stop": r[3]})
    return {"generated": datetime.now().strftime("%Y-%m-%d"), "sheetId": SHEET_ID,
            "days": days, "phases": phases, "tests": tests, "safety": safety, "loading": loading}


def js_file(var, obj):
    return f"{var} = {json.dumps(obj, ensure_ascii=False, indent=2)};\n"


def main():
    check = "--check" in sys.argv
    src = sys.argv[sys.argv.index("--file") + 1] if "--file" in sys.argv else None
    data = open(src, "rb").read() if src else urllib.request.urlopen(XLSX_URL, timeout=60).read()
    book = read_xlsx(data)
    workouts = build_workouts(book["DAILY WORKOUTS"])
    if len(workouts) < 100:
        sys.exit(f"Refusing to write: only {len(workouts)} rows parsed from DAILY WORKOUTS")
    meta = build_meta(book)
    wpath, mpath = os.path.join(ROOT, "workouts.js"), os.path.join(ROOT, "plan-meta.js")
    old = []
    if os.path.exists(wpath):
        old = json.loads(re.search(r"\[.*\]", open(wpath, encoding="utf-8").read(), re.S).group(0))
    changed = [w["date"] for w, o in zip(workouts, old) if w != o] + [w["date"] for w in workouts[len(old):]]
    print(f"Parsed {len(workouts)} days ({workouts[0]['date']} -> {workouts[-1]['date']}); "
          f"{len(meta['days'])} focus rows; {len(meta['phases'])} phases; {len(meta['tests'])} tests; "
          f"{len(changed)} changed day(s) vs current workouts.js")
    if changed:
        print("  changed:", ", ".join(changed[:20]), "..." if len(changed) > 20 else "")
    if check:
        return
    with open(wpath, "w", encoding="utf-8", newline="\n") as f:
        f.write(js_file("window.WORKOUTS", workouts))
    with open(mpath, "w", encoding="utf-8", newline="\n") as f:
        f.write(js_file("window.PLAN_META", meta))
    print("Wrote workouts.js and plan-meta.js")


if __name__ == "__main__":
    main()
