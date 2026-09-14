/* utils.js — small shared helpers (dates, formatting, DOM) */
(function () {
  const U = {};

  /** Local calendar date as YYYY-MM-DD (never UTC — the workout must not switch early/late). */
  U.todayISO = function (d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  /** Parse YYYY-MM-DD as a local Date at noon (avoids DST edge cases). */
  U.fromISO = iso => new Date(iso + "T12:00:00");
  U.addDays = (iso, n) => { const d = U.fromISO(iso); d.setDate(d.getDate() + n); return U.todayISO(d); };
  U.daysBetween = (a, b) => Math.round((U.fromISO(b) - U.fromISO(a)) / 864e5);

  U.fmtLong = iso => U.fromISO(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  U.fmtMedium = iso => U.fromISO(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  U.fmtShort = iso => U.fromISO(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  U.fmtMonthYear = iso => U.fromISO(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  U.weekday = iso => U.fromISO(iso).toLocaleDateString(undefined, { weekday: "long" });

  U.mmss = sec => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
  U.duration = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

  U.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  U.$ = (sel, root = document) => root.querySelector(sel);
  U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  U.h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  U.clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  U.uid = () => Math.random().toString(36).slice(2, 10);

  /** Parse "2–3" / "2-3" / "2" into {min,max}. */
  U.range = s => {
    if (s == null) return null;
    const m = String(s).match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)/);
    if (m) return { min: +m[1], max: +m[2] };
    const n = String(s).match(/\d+(?:\.\d+)?/);
    return n ? { min: +n[0], max: +n[0] } : null;
  };

  /** Feet/inches helpers for jump distances (stored in inches). */
  U.inchesToFtIn = inches => { const ft = Math.floor(inches / 12); const inn = Math.round((inches - ft * 12) * 4) / 4; return `${ft}'${inn}"`; };
  U.inchesToMeters = inches => (inches * 0.0254).toFixed(2) + " m";
  U.parseFtIn = s => { // "19'11" or "19 11" or "19'11.5\""
    const m = String(s).trim().match(/^(\d+)\s*['’ ]\s*(\d+(?:\.\d+)?)?/);
    if (!m) return null; return (+m[1]) * 12 + (+(m[2] || 0));
  };

  U.vibrate = pattern => { try { navigator.vibrate && navigator.vibrate(pattern); } catch (e) { } };

  window.U = U;
})();
