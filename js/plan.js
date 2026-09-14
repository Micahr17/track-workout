/* plan.js — the training plan: bundled data, live Google Sheet sync, and derived facts.
 *
 * Source of truth = the Google Sheet (DAILY WORKOUTS tab). Order of preference at runtime:
 *   1. a fresh copy fetched from the Sheet's public CSV export (validated, cached locally)
 *   2. the last validated copy cached in localStorage
 *   3. workouts.js bundled with the app (always available offline)
 * plan-meta.js (focus, notes, phases, tests) is regenerated with tools/sync_sheet.py.
 */
(function () {
  const SHEET_ID = "1ivJpDhBESTyWTp1_TOPuP8xVfK5xyDHc";
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
  const PHASE_NAMES = { 1: "Rebuild", 2: "Strength + Acceleration", 3: "Maximum Velocity", 4: "Strength → Power", 5: "Specialization", 6: "Sharpen" };
  const BUNDLED = window.WORKOUTS || [];
  const META = window.PLAN_META || { days: {}, phases: [], tests: [], safety: [], loading: [] };

  let rows = BUNDLED;
  let source = "bundled";
  const cached = Store.plan();
  if (cached && validate(cached.rows)) { rows = cached.rows; source = "cached"; }

  const byDate = () => Object.fromEntries(rows.map(r => [r.date, r]));
  let index = byDate();

  /* ---------------------------------------------------------------- validation */
  function validate(list) {
    if (!Array.isArray(list) || list.length < 100) return false;
    return list.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.type && r.phase && "warmup" in r && "speed" in r && "jumps" in r && "strength" in r && "recovery" in r);
  }

  /* ---------------------------------------------------------------- CSV → rows */
  function parseCSV(text) {
    const out = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); out.push(row); }
    return out;
  }
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function sheetDate(s) {
    s = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})$/);
    if (m && MONTHS[m[1].toLowerCase()] != null) return `${m[3]}-${String(MONTHS[m[1].toLowerCase()] + 1).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    const d = new Date(s); return isNaN(d) ? null : U.todayISO(d);
  }
  function rowsFromCSV(text) {
    const table = parseCSV(text);
    const hi = table.findIndex(r => /^date$/i.test((r[0] || "").trim()) && /^day$/i.test((r[1] || "").trim()));
    if (hi < 0) throw new Error("DAILY WORKOUTS header row not found");
    const out = [];
    for (const r of table.slice(hi + 1)) {
      const date = sheetDate(r[0]); if (!date || !r[1]) continue;
      const phaseNum = String(r[3] || "").split("—")[0].trim();
      const week = String(r[2] || "").trim();
      out.push({
        date, day: r[1].trim(), week, weekNumber: +week.replace(/\D/g, "") || 0,
        phase: PHASE_NAMES[phaseNum] || String(r[3] || "").trim(), type: String(r[4] || "").trim().toUpperCase(),
        warmup: (r[5] || "").trim(), speed: (r[6] || "").trim(), jumps: (r[7] || "").trim(), strength: (r[8] || "").trim(), recovery: (r[9] || "").trim(),
      });
    }
    return out;
  }

  /* ---------------------------------------------------------------- sync */
  const listeners = [];
  function status() {
    const c = Store.plan();
    return { source, fetchedAt: c?.fetchedAt || null, lastAttempt: Store.meta().lastSyncAttempt || null, lastError: Store.meta().lastSyncError || null, online: navigator.onLine, count: rows.length };
  }
  async function sync({ silent = true } = {}) {
    if (!navigator.onLine) { Store.setMeta("lastSyncError", "Offline"); notify(); return { ok: false, reason: "offline" }; }
    Store.setMeta("lastSyncAttempt", Date.now());
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(CSV_URL + "&_=" + Date.now(), { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(t);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const fresh = rowsFromCSV(await res.text());
      if (!validate(fresh)) throw new Error("Sheet data failed validation (" + fresh.length + " rows)");
      const changed = JSON.stringify(fresh) !== JSON.stringify(rows);
      Store.setPlan({ rows: fresh, fetchedAt: Date.now(), source: "sheet" });
      Store.setMeta("lastSyncError", null);
      rows = fresh; index = byDate(); source = "sheet";
      notify(changed);
      return { ok: true, changed };
    } catch (e) {
      Store.setMeta("lastSyncError", e.name === "AbortError" ? "Timed out" : e.message);
      notify(false);
      return { ok: false, reason: e.message };
    }
  }
  function notify(changed) { listeners.forEach(fn => fn(status(), changed)); }
  function onSync(fn) { listeners.push(fn); }

  /* ---------------------------------------------------------------- derived facts */
  const first = () => rows[0].date, last = () => rows[rows.length - 1].date;
  const SEASON_START = () => U.addDays(last(), 1);            // team practice begins the day after the plan ends
  const GOALS = [
    { id: "100m", label: "100m", goal: 11.00, pr: 11.90, unit: "s", lower: true, primary: true },
    { id: "lj", label: "Long jump", goal: 22 * 12, pr: 19 * 12 + 11, unit: "in", lower: false, primary: true },
    { id: "200m", label: "200m", goal: 22.50, pr: 24.00, unit: "s", lower: true },
    { id: "400m", label: "400m", goal: 52.00, pr: 56.00, unit: "s", lower: true },
  ];
  const TESTS = [
    { id: "30m", label: "30m sprint", unit: "s", lower: true },
    { id: "fly20", label: "Flying 20m", unit: "s", lower: true },
    { id: "60m", label: "60m", unit: "s", lower: true },
    { id: "100m", label: "100m", unit: "s", lower: true, goal: "100m" },
    { id: "150m", label: "150m", unit: "s", lower: true },
    { id: "sbj", label: "Standing broad jump", unit: "in", lower: false },
    { id: "lj", label: "Long jump", unit: "in", lower: false, goal: "lj" },
    { id: "200m", label: "200m", unit: "s", lower: true, goal: "200m" },
    { id: "400m", label: "400m", unit: "s", lower: true, goal: "400m" },
  ];

  /** Sprint reps on hard days per week — used to detect reduced-volume (deload) weeks from the data itself. */
  function sprintVolume(r) { let n = 0; for (const m of r.speed.matchAll(/(\d+)×(\d+)m/g)) n += +m[1]; return n; }
  function reducedWeeks() {
    const weeks = {};
    rows.forEach(r => { if (r.type === "HARD") { weeks[r.weekNumber] ||= { phase: r.phase, vol: 0 }; weeks[r.weekNumber].vol += sprintVolume(r); } });
    const out = new Set();
    Object.keys(weeks).map(Number).sort((a, b) => a - b).forEach(w => {
      const prev = weeks[w - 1];
      if (prev && prev.phase === weeks[w].phase && weeks[w].vol < prev.vol * 0.9) out.add(w);
    });
    return out;
  }
  let reduced = reducedWeeks();

  /** Testing weeks from the sheet's TESTING & PROGRESS tab ("Week 4", "Week 23–25"). */
  function testingWeeks() {
    const map = {};
    (META.tests || []).forEach(t => {
      [t.baseline, t.next].forEach(s => {
        const m = String(s || "").match(/Week\s+(\d+)(?:\s*[–-]\s*(\d+))?/i);
        if (!m) return;
        for (let w = +m[1]; w <= +(m[2] || m[1]); w++) (map[w] ||= []).push(t.test);
      });
    });
    return map;
  }
  const testing = testingWeeks();

  const phaseInfo = num => (META.phases || []).find(p => p.num === num) || { num, name: PHASE_NAMES[num] };
  function phaseRange(num) { const list = rows.filter(r => Parser.PHASE_NUM[r.phase] === num); return list.length ? { start: list[0].date, end: list[list.length - 1].date, weeks: [...new Set(list.map(r => r.weekNumber))] } : null; }

  const Plan = {
    SHEET_URL, GOALS, TESTS, META,
    rows: () => rows, get: date => index[date], first, last, seasonStart: SEASON_START,
    inRange: date => date >= first() && date <= last(),
    phaseInfo, phaseRange, phaseNames: PHASE_NAMES,
    isReducedWeek: w => reduced.has(w),
    testsForWeek: w => testing[w] || [],
    isTestingWeek: w => !!testing[w],
    status, sync, onSync,
    refreshDerived() { index = byDate(); reduced = reducedWeeks(); },
  };
  onSync(() => Plan.refreshDerived());
  window.Plan = Plan;
})();
