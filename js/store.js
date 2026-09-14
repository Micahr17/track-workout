/* store.js — local persistence layer.
 *
 * Everything the athlete logs lives here, namespaced under one localStorage key.
 * The public API is intentionally small and async-free so the UI stays simple; a
 * future backend/IndexedDB adapter only needs to implement load()/persist().
 *
 * Shape:
 *   days[date]   = { checks:{itemKey:true}, sets:{itemKey:{n:{w,r,rpe}}}, times:{itemKey:{n:"3.12"}},
 *                    choice:{itemKey:i}, hamstring:"green|yellow|red", pit:true|false,
 *                    started:ms, completed:ms, durationMs, notes:"" }
 *   tests[]      = { id, date, test, value, unit }
 *   settings     = { theme, sound, vibrate, units }
 *   plan         = { rows:[...], fetchedAt:ms, source:"sheet" }   (synced copy of the Sheet)
 */
(function () {
  const KEY = "trackWorkout.v2";
  const LEGACY_KEY = "trackWorkoutStateV1";
  const DEFAULTS = { days: {}, tests: [], settings: { theme: "system", sound: true, vibrate: true, units: "imperial" }, plan: null, meta: {} };

  let data = load();
  let timer = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) { console.warn("store: could not read", e); }
    const fresh = JSON.parse(JSON.stringify(DEFAULTS));
    migrateLegacy(fresh);
    return fresh;
  }

  /** v1 stored "completed:<date>" flags; keep those days marked complete. */
  function migrateLegacy(target) {
    try {
      const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || "{}");
      Object.keys(old).forEach(k => {
        if (k.startsWith("completed:") && old[k]) {
          const date = k.slice(10);
          target.days[date] = { checks: {}, sets: {}, times: {}, choice: {}, completed: Date.now(), legacy: true };
        }
      });
    } catch (e) { }
  }

  function persist() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(data)); }
      catch (e) { console.warn("store: could not save", e); }
    }, 80);
  }

  const Store = {
    day(date) {
      if (!data.days[date]) data.days[date] = { checks: {}, sets: {}, times: {}, choice: {} };
      const d = data.days[date];
      d.checks ||= {}; d.sets ||= {}; d.times ||= {}; d.choice ||= {};
      return d;
    },
    hasDay: date => !!data.days[date],
    allDays: () => data.days,
    save: persist,

    setCheck(date, key, val) { const d = Store.day(date); if (val) d.checks[key] = true; else delete d.checks[key]; persist(); },
    setSet(date, key, n, field, val) { const d = Store.day(date); d.sets[key] ||= {}; d.sets[key][n] ||= {}; d.sets[key][n][field] = val; persist(); },
    setTime(date, key, n, val) { const d = Store.day(date); d.times[key] ||= {}; if (val) d.times[key][n] = val; else delete d.times[key][n]; persist(); },
    setField(date, field, val) { const d = Store.day(date); d[field] = val; persist(); },

    /** Most recent logged sets for an exercise name before `date` → {date, sets:[{w,r,rpe}]} */
    lastLog(exerciseId, beforeDate) {
      const dates = Object.keys(data.days).filter(d => d < beforeDate).sort().reverse();
      for (const d of dates) {
        const sets = data.days[d].sets || {};
        for (const k of Object.keys(sets)) {
          if (k.split("|")[1] === exerciseId) {
            const list = Object.values(sets[k]).filter(s => s.w || s.r || s.rpe);
            if (list.length) return { date: d, sets: list };
          }
        }
      }
      return null;
    },

    tests: () => data.tests,
    addTest(t) { t.id = t.id || U.uid(); data.tests.push(t); data.tests.sort((a, b) => a.date.localeCompare(b.date)); persist(); },
    removeTest(id) { data.tests = data.tests.filter(t => t.id !== id); persist(); },

    settings: () => data.settings,
    setSetting(k, v) { data.settings[k] = v; persist(); },

    plan: () => data.plan,
    setPlan(p) { data.plan = p; persist(); },
    meta: () => data.meta,
    setMeta(k, v) { data.meta[k] = v; persist(); },

    exportJSON: () => JSON.stringify(data, null, 2),
    reset() { data = JSON.parse(JSON.stringify(DEFAULTS)); localStorage.removeItem(KEY); localStorage.removeItem(LEGACY_KEY); },
  };
  window.Store = Store;
})();
