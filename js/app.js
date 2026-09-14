/* app.js — screens, state and interactions for Track Workout.
 * Screens: today · workout (focused mode) · plan · progress · history · settings
 * All persistent state goes through Store; all plan data comes from Plan/Parser. */
(function () {
  const VERSION = "2.0.0";
  const { $, $$, esc } = U;
  const state = { screen: "today", date: U.todayISO(), workoutDate: null, workoutSection: null, calMonth: null, phaseOpen: null, showRaw: {} };
  const parsedCache = {};

  /* ---------------------------------------------------------------- data helpers */
  function dayFor(date) {
    const row = Plan.get(date); if (!row) return null;
    const k = date + "|" + JSON.stringify(row);
    if (!parsedCache[k]) parsedCache[k] = Parser.parseWorkout(row, Plan.META);
    return parsedCache[k];
  }
  const TYPE_LABEL = { HARD: "Hard day", LIGHT: "Light day", RECOVERY: "Recovery day", REST: "Rest day" };
  const TYPE_NOTE = {
    HARD: "Quality over quantity. Full recovery between fast reps.",
    LIGHT: "This should leave you feeling better, not exhausted.",
    RECOVERY: "Recovery is part of training. Do not add unnecessary conditioning.",
    REST: "Today is part of the program. Recover and come back ready.",
  };
  function coachNote(day) {
    const parts = [TYPE_NOTE[day.type]];
    [day.sheetNote, day.recoveryCue].forEach(s => { if (s && !parts.some(p => p.toLowerCase() === s.toLowerCase())) parts.push(s); });
    return parts.join(" ");
  }
  function focusTitle(day) {
    let f = day.focus || "";
    if (day.type === "REST") f = "Complete rest";
    return f.replace(/\bLJ\b/g, "Long jump").replace(/\+/g, " + ").replace(/\s+/g, " ").trim();
  }
  const dayState = date => Store.day(date);
  const progressFor = date => { const d = dayFor(date); return d ? Parser.progress(d, dayState(date)) : { total: 0, done: 0, pct: 0 }; };
  const isComplete = date => { const s = Store.hasDay(date) && dayState(date); return !!(s && s.completed); };

  /* ---------------------------------------------------------------- navigation */
  const SCREENS = ["today", "plan", "progress", "history", "settings", "workout"];
  function go(screen, opts = {}) {
    if (screen === "workout") { state.workoutDate = opts.date || state.date; state.workoutSection = opts.section || null; }
    if (opts.date && screen === "today") state.date = opts.date;
    state.screen = screen;
    $$(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.screen === screen || (screen === "workout" && b.dataset.screen === "today")));
    $$(".screen").forEach(s => s.classList.toggle("active", s.id === "screen-" + screen));
    document.body.classList.toggle("inWorkout", screen === "workout");
    render();
    window.scrollTo({ top: 0 });
  }
  function render() {
    const fn = { today: renderToday, workout: renderWorkout, plan: renderPlan, progress: renderProgress, history: renderHistory, settings: renderSettings }[state.screen];
    fn && fn();
  }

  /* ================================================================ TODAY */
  function renderToday() {
    const date = state.date, today = U.todayISO(), isToday = date === today;
    const day = dayFor(date);
    const root = $("#screen-today");
    const dateNav = `
      <div class="dateNav">
        <button class="iconbtn" data-action="prevDay" aria-label="Previous day">‹</button>
        <div class="dateNavMid"><div class="dateNavDay">${esc(U.weekday(date))}</div><div class="dateNavDate">${esc(U.fromISO(date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }))}</div></div>
        <button class="iconbtn" data-action="nextDay" aria-label="Next day">›</button>
      </div>
      ${isToday ? "" : `<button class="pill accent" data-action="goToday">↩ Back to today</button>`}`;

    if (!day) {
      const first = Plan.first(), last = Plan.last();
      const before = date < first;
      root.innerHTML = `<header class="pageHead"><div class="brandline">Track Workout</div></header>${dateNav}
        <section class="hero soft">
          <div class="eyebrow">${before ? "Pre-season" : "Offseason complete"}</div>
          <h1>${before ? "The plan hasn't started yet" : "Plan complete — hand off to the team"}</h1>
          <p class="muted">${before
            ? `Your offseason plan begins <b>${esc(U.fmtMedium(first))}</b> — ${U.daysBetween(today, first)} day${U.daysBetween(today, first) === 1 ? "" : "s"} from today. Until then: easy movement, sleep, and a normal routine.`
            : `The structured plan ended ${esc(U.fmtMedium(last))}. Team practice takes over from here — maintain per your coaches and keep sprinting pain-free.`}</p>
          <button class="primary" data-action="openDate" data-date="${before ? first : last}">${before ? "Preview Day 1" : "Review the final week"}</button>
        </section>
        ${syncFooter()}`;
      return;
    }

    const st = dayState(date), prog = progressFor(date), done = !!st.completed;
    const flags = [];
    if (Plan.isReducedWeek(day.weekNumber)) flags.push(`<span class="badge warn">Reduced-volume week</span>`);
    if (Plan.isTestingWeek(day.weekNumber) && day.type === "HARD") flags.push(`<span class="badge info">Testing week</span>`);
    if (day.timeTrial) flags.push(`<span class="badge info">Time trial</span>`);
    const typeClass = day.type.toLowerCase();

    const sectionsOverview = day.sections.filter(s => !s.empty).map(s => {
      const n = countItems(s.items);
      return `<button class="overviewRow" data-action="startSection" data-section="${s.id}"><span class="ovIcon">${s.icon}</span><span class="ovText"><b>${esc(s.title)}</b><small>${n} item${n === 1 ? "" : "s"}${s.id === "speed" && s.phaseLabel ? ` · ${esc(s.phaseLabel)} tempo` : ""}</small></span><span class="chev">›</span></button>`;
    }).join("");

    const startLabel = done ? "Review workout" : prog.done > 0 ? "Continue workout" : day.type === "REST" ? "Open rest day" : "Start workout";
    root.innerHTML = `
      <header class="pageHead"><div class="brandline">Track Workout</div></header>
      ${dateNav}
      <section class="hero ${typeClass}">
        <div class="heroChips"><span class="chip">${esc(day.week)}</span><span class="chip">${esc(day.phase)}</span><span class="chip strong">${TYPE_LABEL[day.type]}</span></div>
        ${flags.length ? `<div class="flags">${flags.join("")}</div>` : ""}
        <div class="eyebrow">Today's focus</div>
        <h1 class="focusTitle">${esc(focusTitle(day))}</h1>
        <p class="coach">${esc(coachNote(day))}</p>
        ${day.location ? `<div class="locLine">📍 ${esc(day.location)}</div>` : ""}
      </section>

      <section class="card progressCard">
        <div class="progressLabel"><span>Workout completion</span><strong>${done ? "Complete ✓" : prog.pct + "%"}</strong></div>
        <div class="progress" role="progressbar" aria-valuenow="${prog.pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${done ? 100 : prog.pct}%"></div></div>
        <div class="progressSub">${prog.done} / ${prog.total} complete${st.durationMs ? ` · ${U.duration(st.durationMs)}` : ""}</div>
        <button class="primary big" data-action="startWorkout">${startLabel}</button>
      </section>

      ${day.type === "REST" ? `<section class="card restCard"><div class="eyebrow">Sunday</div><h2>Complete rest</h2><p class="muted">${esc(Plan.get(date).recovery)}</p></section>` : `<section class="card"><div class="cardHead"><h2>Session overview</h2><span class="muted small">Tap to open</span></div><div class="overview">${sectionsOverview}</div></section>`}
      ${Plan.isTestingWeek(day.weekNumber) && day.type === "HARD" ? `<section class="card infoCard"><div class="eyebrow">Testing week (per the sheet)</div><p>Scheduled this week: <b>${esc(Plan.testsForWeek(day.weekNumber).join(", "))}</b>. Timing controls are expanded in workout mode. Do not test through pain.</p></section>` : ""}
      ${syncFooter()}`;
  }
  function countItems(items) { return items.reduce((n, it) => n + (it.kind === "cue" ? 0 : it.kind === "choice" ? 1 : it.kind === "pit" ? 1 : 1), 0); }
  function syncFooter() {
    const s = Plan.status();
    const when = s.fetchedAt ? relTime(s.fetchedAt) : null;
    const txt = s.source === "bundled" ? "Using built-in plan" : `Plan synced from Sheet ${when}`;
    const err = s.lastError && s.lastError !== "Offline" ? ` · last sync failed` : (!s.online ? " · offline" : "");
    return `<div class="syncLine" data-action="goSettings"><span class="dot ${s.source === "bundled" ? "grey" : "green"}"></span>${esc(txt + err)}</div>`;
  }
  function relTime(ms) { const m = Math.round((Date.now() - ms) / 60000); if (m < 1) return "just now"; if (m < 60) return m + " min ago"; const h = Math.round(m / 60); if (h < 24) return h + " h ago"; return Math.round(h / 24) + " d ago"; }

  /* ================================================================ WORKOUT MODE */
  function renderWorkout() {
    const date = state.workoutDate, day = dayFor(date), root = $("#screen-workout");
    if (!day) { go("today"); return; }
    const st = dayState(date), prog = progressFor(date);
    if (!st.started && !st.completed) { st.started = Date.now(); Store.save(); }
    const testingWeek = Plan.isTestingWeek(day.weekNumber) && day.type === "HARD";
    const ctx = { date, st, day, timingProminent: testingWeek || day.timeTrial };

    // Hamstring gate: shown before hard sprinting
    let ham = "";
    if (day.hamstringCheck) {
      const v = st.hamstring;
      const msg = {
        yellow: "Something feels different. <b>Do not push through it.</b> Keep the warm-up and any pain-free, easy movement; reduce or skip the fast portion today and reassess before the next fast session.",
        red: "<b>Stop the fast portion today.</b> Do not sprint through pain. Pain-free movement only, and do not progress speed work until sprinting feels completely normal again. Persistent symptoms → get it checked.",
      }[v];
      ham = `<section class="card hamCard ${v || "pending"}" id="hamCard">
        <div class="eyebrow">Hamstring check</div>
        <h3>${v ? ({ green: "Normal / pain-free ✓", yellow: "Different / unusually tight", red: "Painful" })[v] : "How does your hamstring feel?"}</h3>
        ${v ? (msg ? `<p class="hamMsg">${msg}</p>` : `<p class="muted">Train as planned. Stop the fast portion immediately if anything changes.</p>`) + `<button class="ghost small" data-action="hamReset">Change answer</button>`
          : `<p class="muted">Answer before the fast work. The plan's rule: pain or unusual tightness = stop the fast portion, reassess, and do not progress.</p>
             <div class="hamBtns">
               <button class="hamBtn green" data-action="ham" data-v="green">🟢 <span>Normal / pain-free</span></button>
               <button class="hamBtn yellow" data-action="ham" data-v="yellow">🟡 <span>Different / unusually tight</span></button>
               <button class="hamBtn red" data-action="ham" data-v="red">🔴 <span>Painful</span></button>
             </div>`}
      </section>`;
    }

    const sections = day.sections.filter(s => !s.empty).map(s => renderSection(s, ctx)).join("");
    const complete = !!st.completed;
    const finished = prog.total > 0 && prog.done >= prog.total;

    root.innerHTML = `
      <div class="wkTop">
        <button class="iconbtn" data-action="exitWorkout" aria-label="Back">‹</button>
        <div class="wkTitle"><b>${esc(focusTitle(day))}</b><small>${esc(U.fmtMedium(date))} · ${esc(day.week)} · ${TYPE_LABEL[day.type]}</small></div>
        <button class="iconbtn" data-action="manualTimer" aria-label="Open rest timer">⏱</button>
      </div>
      <div class="wkProgress"><div style="width:${prog.pct}%"></div></div>
      <div class="wkBody">
        <div class="wkStats"><span>${prog.done} / ${prog.total} complete</span><strong>${prog.pct}%</strong></div>
        ${Plan.isReducedWeek(day.weekNumber) ? `<div class="notice warn">Reduced-volume week — the plan deliberately lowers sprint volume this week. Do not add reps.</div>` : ""}
        ${testingWeek ? `<div class="notice info">Testing week: ${esc(Plan.testsForWeek(day.weekNumber).join(", "))}. Time inputs are open below — record results under Progress → Testing.</div>` : ""}
        ${ham}
        ${sections}
        <section class="card notesCard">
          <div class="eyebrow">How did today feel?</div>
          <textarea id="dayNotes" rows="3" placeholder="Optional — e.g. “Felt fast today.” “Squats felt heavy.” “Hamstring felt completely normal.”" aria-label="Workout notes">${esc(st.notes || "")}</textarea>
        </section>
        ${complete ? `<section class="card doneCard"><div class="bigEmoji">🎉</div><h2>Workout complete</h2>
            <div class="doneStats"><div><small>Duration</small><b>${st.durationMs ? U.duration(st.durationMs) : "—"}</b></div><div><small>Completed</small><b>${prog.done} / ${prog.total}</b></div><div><small>Finished</small><b>${new Date(st.completed).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</b></div></div>
            <button class="primary big" data-action="exitWorkout">Done</button><button class="ghost small" data-action="reopen">Reopen workout</button></section>`
        : `<section class="finishWrap"><button class="primary big ${finished ? "" : "outline"}" data-action="finish">${finished ? "Finish workout 🎉" : "Finish workout"}</button>${finished ? "" : `<small class="muted">${prog.total - prog.done} item${prog.total - prog.done === 1 ? "" : "s"} still unchecked — you can finish anyway.</small>`}</section>`}
      </div>`;

    if (state.workoutSection) { const el = $("#sec-" + state.workoutSection); if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50); state.workoutSection = null; }
  }

  function renderSection(s, ctx) {
    const showRaw = state.showRaw[ctx.date + s.id];
    const inner = s.items.map(it => renderItem(it, ctx, s)).join("");
    const dur = s.duration ? `<button class="chip timerChip" data-action="timer" data-sec="${s.duration.seconds}" data-label="${esc(s.title)}">⏱ ${esc(s.duration.label)}</button>` : "";
    const phased = s.phaseLabel ? `<div class="notice subtle">Showing the <b>${esc(s.phaseLabel)}</b> tempo prescription for this phase.</div>` : "";
    return `<section class="card section" id="sec-${s.id}">
      <div class="sectionHead"><div><div class="eyebrow">${s.icon} ${esc(s.title)}</div><h3>${esc(s.tagline)}</h3></div>${dur}</div>
      ${phased}
      <div class="items">${inner}</div>
      <button class="rawToggle" data-action="toggleRaw" data-sec="${s.id}" aria-expanded="${!!showRaw}">${showRaw ? "Hide" : "Show"} exact prescription</button>
      ${showRaw ? `<div class="raw">${esc(s.raw)}${s.others ? s.others.map(o => `<div class="rawOther">${esc(o)}</div>`).join("") : ""}</div>` : ""}
    </section>`;
  }

  function renderItem(it, ctx, s) {
    const { st } = ctx;
    const checks = st.checks;
    switch (it.kind) {
      case "cue": return `<div class="cue">💬 ${esc(it.text)}</div>`;
      case "simple": {
        const on = !!checks[it.key];
        const timer = it.duration ? tBtn(it.duration, it.name) : it.rest ? tBtn(it.rest, "Rest", true) : "";
        return `<label class="item ${on ? "on" : ""} ${it.optional ? "optional" : ""}"><input type="checkbox" class="check" data-action="check" data-key="${esc(it.key)}" ${on ? "checked" : ""} aria-label="${esc(it.name)}"><div class="itemText"><div class="itemTitle">${esc(it.name)}${it.optional ? ` <span class="tag">optional</span>` : ""}</div>${it.detail ? `<div class="itemSub">${esc(it.detail)}</div>` : ""}${timer}</div></label>`;
      }
      case "sets": return renderSets(it, ctx);
      case "reps": return renderReps(it, ctx);
      case "sprint": return renderSprint(it, ctx);
      case "choice": {
        const idx = st.choice[it.key] ?? 0;
        return `<div class="choice"><div class="eyebrow">The plan offers a choice</div><div class="seg">${it.options.map((o, i) => `<button class="${i === idx ? "on" : ""}" data-action="choose" data-key="${esc(it.key)}" data-idx="${i}">${esc(o.label)}</button>`).join("")}</div>${it.options[idx].items.map(x => renderItem(x, ctx, s)).join("")}</div>`;
      }
      case "pit": {
        const pit = st.pit;
        const q = `<div class="pitQ ${pit === undefined ? "" : "answered"}"><div class="eyebrow">Long jump pit available?</div>
          <div class="seg"><button class="${pit === true ? "on" : ""}" data-action="pit" data-v="1">Yes — safe pit</button><button class="${pit === false ? "on" : ""}" data-action="pit" data-v="0">No pit</button></div>
          ${pit === undefined ? `<p class="muted small">Never jump into an unsafe area. Choose to reveal the prescribed work.</p>` : pit ? `<p class="muted small">Full long-jump work. Technique first; stop if the approach feels off.</p>` : `<p class="muted small">No-pit alternative from the plan (no full jumps today).</p>`}</div>`;
        if (pit === undefined) return q;
        return q + (pit ? it.pit : it.noPit).map(x => renderItem(x, ctx, s)).join("");
      }
    }
    return "";
  }
  const tBtn = (rest, label, isRest) => `<button type="button" class="timerBtn" data-action="timer" data-sec="${rest.seconds}" data-label="${esc(label)}">⏱ ${isRest ? "Start rest · " : ""}${esc(rest.label)}</button>`;

  function renderSets(it, ctx) {
    const { st, date } = ctx;
    const n = it.sets.max, req = it.sets.min;
    const last = it.log ? Store.lastLog(it.id, date) : null;
    const rows = [];
    for (let i = 1; i <= n; i++) {
      const k = `${it.key}#${i}`, on = !!st.checks[k], opt = i > req;
      const log = st.sets[it.key]?.[i] || {};
      rows.push(`<div class="setRow ${on ? "on" : ""} ${opt ? "optional" : ""}">
        <label class="setCheck"><input type="checkbox" class="check" data-action="check" data-key="${esc(k)}" ${on ? "checked" : ""} aria-label="${esc(it.name)} set ${i}"><span>Set ${i}${opt ? "*" : ""}</span></label>
        ${it.log ? `<div class="setInputs">
          <label><span>Weight</span><input inputmode="decimal" placeholder="lb" value="${esc(log.w || "")}" data-action="setLog" data-key="${esc(it.key)}" data-n="${i}" data-f="w"></label>
          <label><span>Reps</span><input inputmode="numeric" placeholder="${esc(rangeText(it.reps))}" value="${esc(log.r || "")}" data-action="setLog" data-key="${esc(it.key)}" data-n="${i}" data-f="r"></label>
          <label><span>RPE</span><input inputmode="decimal" placeholder="${esc(it.rpe || "–")}" value="${esc(log.rpe || "")}" data-action="setLog" data-key="${esc(it.key)}" data-n="${i}" data-f="rpe"></label>
        </div>` : ""}
      </div>`);
    }
    const target = `${rangeText(it.sets)} × ${esc(it.repsLabel)}${it.rpe ? ` · RPE ${esc(it.rpe)}` : ""}`;
    return `<div class="exercise">
      <div class="exHead"><div><div class="exName">${esc(it.name)}</div><div class="exTarget">Target: ${target}${it.sets.max > it.sets.min ? ` <span class="tag">*extra set optional</span>` : ""}</div>${it.note ? `<div class="itemSub">${esc(it.note)}</div>` : ""}</div>${it.rest ? tBtn(it.rest, "Rest", true) : ""}</div>
      ${last ? `<div class="lastTime">Last time (${esc(U.fmtShort(last.date))}): ${last.sets.map(s => `${s.w ? esc(s.w) + (s.r ? " × " : "") : ""}${s.r ? esc(s.r) : ""}${s.rpe ? " @ RPE " + esc(s.rpe) : ""}`).filter(Boolean).join(" · ")}</div>` : (it.log ? `<div class="lastTime muted">No previous log — choose a conservative load (RPE ${esc(it.rpe || "6–7")}).</div>` : "")}
      <div class="setRows">${rows.join("")}</div>
    </div>`;
  }
  const rangeText = r => r.min === r.max ? String(r.min) : `${r.min}–${r.max}`;

  function renderReps(it, ctx) {
    const { st } = ctx; const n = it.reps.max, req = it.reps.min;
    const pills = []; for (let i = 1; i <= n; i++) { const k = `${it.key}#${i}`; pills.push(`<button class="repPill ${st.checks[k] ? "on" : ""} ${i > req ? "optional" : ""}" data-action="toggle" data-key="${esc(k)}" aria-pressed="${!!st.checks[k]}" aria-label="${esc(it.name)} rep ${i}">${i}</button>`); }
    return `<div class="exercise"><div class="exHead"><div><div class="exName">${esc(it.name)}</div><div class="exTarget">${rangeText(it.reps)} reps${it.reps.max > it.reps.min ? ` · ${it.reps.min} required, up to ${it.reps.max}` : ""}</div></div>${it.rest ? tBtn(it.rest, "Rest", true) : ""}</div><div class="repPills">${pills.join("")}</div></div>`;
  }

  function renderSprint(it, ctx) {
    const { st } = ctx; const n = it.reps.max, req = it.reps.min;
    let doneN = 0; for (let i = 1; i <= n; i++) if (st.checks[`${it.key}#${i}`]) doneN = i;
    const next = doneN + 1, allDone = doneN >= n;
    const showTimes = ctx.timingProminent && it.timeable || st.choice[it.key + ":times"];
    const pills = []; for (let i = 1; i <= n; i++) { const k = `${it.key}#${i}`; pills.push(`<button class="repPill ${st.checks[k] ? "on" : ""} ${i > req ? "optional" : ""}" data-action="toggle" data-key="${esc(k)}" aria-pressed="${!!st.checks[k]}" aria-label="${esc(it.name)} rep ${i}">${i}</button>`); }
    const times = showTimes ? `<div class="timeGrid">${Array.from({ length: n }, (_, i) => i + 1).map(i => `<label class="timeCell"><span>Rep ${i}</span><input inputmode="decimal" placeholder="s" value="${esc(st.times[it.key]?.[i] || "")}" data-action="time" data-key="${esc(it.key)}" data-n="${i}"></label>`).join("")}</div>` : "";
    const perRep = it.perRep ? `<div class="itemSub">Rep intensities: ${esc(it.perRep.join(", "))}</div>` : "";
    return `<div class="exercise sprint ${it.timeTrial ? "tt" : ""} ${it.optional ? "optional" : ""}">
      <div class="exHead"><div><div class="exName">${esc(it.name)}${it.optional ? ` <span class="tag">optional</span>` : ""}${it.timeTrial ? ` <span class="tag info">Test</span>` : ""}</div>
        <div class="exTarget">${it.reps.max > 1 ? `${rangeText(it.reps)} reps` : "1 rep"}${it.intensity ? ` · ${esc(it.intensity)}` : ""}${it.buildIn ? ` · ${esc(it.buildIn)} build-in` : ""}${it.rest ? ` · Rest ${esc(it.rest.label)}` : ""}</div>${perRep}${it.note ? `<div class="itemSub">${esc(it.note)}</div>` : ""}${it.onlyIf ? `<div class="itemSub">Only if ${esc(it.onlyIf)}</div>` : ""}</div></div>
      <div class="sprintMain">
        <div class="sprintRep"><small>Rep</small><b>${allDone ? n : next} <span>/ ${n}</span></b></div>
        <div class="sprintBtns">
          ${allDone ? `<div class="doneTag">All reps complete ✓</div>` : `<button class="primary" data-action="toggle" data-key="${esc(it.key)}#${next}">Complete rep ${next}</button>`}
          ${it.rest ? `<button class="secondary" data-action="timer" data-sec="${it.rest.seconds}" data-label="Rest · ${esc(it.name)}">⏱ Start rest</button>` : `<button class="secondary" data-action="manualTimer">⏱ Timer</button>`}
        </div>
      </div>
      <div class="repPills">${pills.join("")}</div>
      ${it.timeable ? (showTimes ? times : `<button class="ghost small" data-action="showTimes" data-key="${esc(it.key)}">+ Add times</button>`) : ""}
    </div>`;
  }

  /* ================================================================ PLAN */
  function renderPlan() {
    const root = $("#screen-plan"), today = U.todayISO();
    const todayRow = Plan.get(today);
    const curPhase = todayRow ? Parser.PHASE_NUM[todayRow.phase] : (today < Plan.first() ? 0 : 7);
    const months = [["September", 1], ["October", 2], ["November", 3], ["December", 4], ["January", 5], ["February → March", 6]];
    const cards = months.map(([month, num]) => {
      const info = Plan.phaseInfo(num), range = Plan.phaseRange(num);
      const status = num === curPhase ? "current" : num < curPhase ? "past" : "upcoming";
      return `<button class="phaseCard ${status}" data-action="phase" data-num="${num}">
        <div class="phaseMonth">${month}</div><div class="phaseName">${esc(info.name)}</div>
        <div class="phaseDates">${range ? `${esc(U.fmtShort(range.start))} – ${esc(U.fmtShort(range.end))} · Weeks ${range.weeks[0]}–${range.weeks[range.weeks.length - 1]}` : ""}</div>
        ${status === "current" ? `<span class="badge accent">Current phase</span>` : ""}</button>`;
    }).join("");
    root.innerHTML = `
      <header class="pageHead"><div class="eyebrow">Offseason</div><h1>Your plan</h1><p class="muted">${esc(U.fmtMedium(Plan.first()))} → ${esc(U.fmtMedium(Plan.last()))} · 25 weeks</p></header>
      <div class="weekRhythm"><span>Mon <b>Hard</b></span><span>Tue <b>Light</b></span><span>Wed <b>Hard</b></span><span>Thu <b>Light</b></span><span>Fri <b>Recovery</b></span><span>Sat <b>Hard</b></span><span>Sun <b>Rest</b></span></div>
      <div class="phaseGrid">${cards}</div>
      <section class="card calCard"><div class="cardHead"><h2>Calendar</h2><div class="calNav"><button class="iconbtn small" data-action="calPrev" aria-label="Previous month">‹</button><b id="calTitle"></b><button class="iconbtn small" data-action="calNext" aria-label="Next month">›</button></div></div>
        <div id="calendar"></div>
        <div class="legend"><span><i class="lg hard"></i>Hard</span><span><i class="lg light"></i>Light</span><span><i class="lg recovery"></i>Recovery</span><span><i class="lg rest"></i>Rest</span><span><i class="lg done"></i>Completed</span><span><i class="lg today"></i>Today</span></div>
      </section>
      <div id="phaseSheet"></div>`;
    renderCalendar();
    if (state.phaseOpen) renderPhaseSheet(state.phaseOpen);
  }

  function renderCalendar() {
    const today = U.todayISO();
    if (!state.calMonth) { const base = Plan.inRange(today) ? today : Plan.first(); state.calMonth = base.slice(0, 7); }
    const [y, m] = state.calMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1), daysIn = new Date(y, m, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // Monday first
    $("#calTitle").textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    let cells = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(d => `<div class="calHead">${d}</div>`).join("");
    for (let i = 0; i < offset; i++) cells += `<div class="calCell empty"></div>`;
    for (let d = 1; d <= daysIn; d++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const row = Plan.get(iso);
      if (!row) { cells += `<div class="calCell out">${d}</div>`; continue; }
      const done = isComplete(iso), partial = !done && Store.hasDay(iso) && progressFor(iso).done > 0;
      cells += `<button class="calCell ${row.type.toLowerCase()} ${done ? "done" : ""} ${partial ? "partial" : ""} ${iso === today ? "today" : ""} ${iso < today && !done ? "past" : ""}" data-action="openDate" data-date="${iso}" aria-label="${esc(U.fmtMedium(iso))}, ${row.type.toLowerCase()}${done ? ", completed" : ""}"><span>${d}</span><i></i></button>`;
    }
    $("#calendar").innerHTML = `<div class="calGrid">${cells}</div>`;
  }

  function renderPhaseSheet(num) {
    const info = Plan.phaseInfo(num), range = Plan.phaseRange(num);
    const el = $("#phaseSheet");
    if (!num) { el.innerHTML = ""; return; }
    const rows = [["Purpose", info.goal], ["Speed focus", info.speed], ["Strength focus", info.strength], ["Long jump", info.lj], ["Key outcome", info.outcome]].filter(r => r[1]);
    el.innerHTML = `<div class="sheetBack" data-action="closePhase"></div><div class="sheet" role="dialog" aria-label="${esc(info.name)} phase">
      <div class="sheetHandle"></div><div class="eyebrow">Phase ${num}${info.label && info.label !== info.name ? ` · ${esc(info.label)}` : ""}</div><h2>${esc(info.name)}</h2>
      <p class="muted">${range ? `${esc(U.fmtMedium(range.start))} → ${esc(U.fmtMedium(range.end))} · Weeks ${range.weeks[0]}–${range.weeks[range.weeks.length - 1]}` : esc(info.dates || "")}</p>
      <dl class="kv">${rows.map(r => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join("")}<dt>Weekly structure</dt><dd>Mon hard · Tue light · Wed hard · Thu light · Fri recovery (frisbee) · Sat hard · Sun rest</dd>${range && range.weeks.some(w => Plan.isReducedWeek(w)) ? `<dt>Reduced-volume week</dt><dd>Week ${range.weeks.filter(w => Plan.isReducedWeek(w)).join(", ")}</dd>` : ""}${range && range.weeks.some(w => Plan.isTestingWeek(w)) ? `<dt>Testing</dt><dd>Week ${range.weeks.filter(w => Plan.isTestingWeek(w)).join(", ")}</dd>` : ""}</dl>
      ${range ? `<button class="primary" data-action="openDate" data-date="${range.start}">View first day</button>` : ""}
    </div>`;
  }

  /* ================================================================ PROGRESS */
  function fmtVal(v, unit) { if (unit === "in") return Store.settings().units === "metric" ? U.inchesToMeters(v) : U.inchesToFtIn(v); return Number(v).toFixed(2) + " s"; }
  function bestTest(id) { const list = Store.tests().filter(t => t.test === id); if (!list.length) return null; const T = Plan.TESTS.find(t => t.id === id); return list.reduce((b, t) => (T.lower ? t.value < b.value : t.value > b.value) ? t : b); }

  function renderProgress() {
    const root = $("#screen-progress"), today = U.todayISO();
    const inPlan = Plan.inRange(today);
    const seasonStart = Plan.seasonStart();
    const daysToSeason = U.daysBetween(today, seasonStart);
    const daysToStart = U.daysBetween(today, Plan.first());
    const row = Plan.get(today);
    const completedCount = Object.entries(Store.allDays()).filter(([d, s]) => s.completed && Plan.get(d)).length;
    const elapsed = inPlan ? U.daysBetween(Plan.first(), today) + 1 : 0;

    const goalCards = Plan.GOALS.map(g => {
      const best = bestTest(g.id);
      const current = best && (g.lower ? best.value < g.pr : best.value > g.pr) ? best.value : g.pr;
      const gap = Math.abs(g.goal - g.pr), closed = Math.abs(current - g.pr), pct = gap ? U.clamp(Math.round(closed / gap * 100), 0, 100) : 0;
      return `<div class="goalCard ${g.primary ? "isPrimary" : ""}">
        <div class="goalHead"><span class="eyebrow">${esc(g.label)}${g.primary ? " · primary" : ""}</span></div>
        <div class="goalNums"><div><small>Goal</small><b>${fmtVal(g.goal, g.unit)}</b></div><div><small>Current</small><b>${fmtVal(current, g.unit)}</b></div></div>
        <div class="progress thin"><div style="width:${pct}%"></div></div>
        <small class="muted">${best && current !== g.pr ? `Best test ${esc(U.fmtShort(best.date))} · ${pct}% of the gap closed` : `PR ${fmtVal(g.pr, g.unit)} · progress shows once test results beat it`}</small>
      </div>`;
    }).join("");

    const tests = Store.tests();
    const charts = Plan.TESTS.map(T => {
      const pts = tests.filter(t => t.test === T.id);
      if (pts.length < 2) return "";
      return `<div class="chartCard"><div class="cardHead"><b>${esc(T.label)}</b><small class="muted">${T.lower ? "lower is better" : "farther is better"}</small></div>${lineChart(pts, T)}</div>`;
    }).join("");

    const list = tests.slice().reverse().map(t => { const T = Plan.TESTS.find(x => x.id === t.test); return `<div class="testRow"><div><b>${esc(T?.label || t.test)}</b><small class="muted">${esc(U.fmtMedium(t.date))}</small></div><div class="testVal">${fmtVal(t.value, T?.unit || "s")}</div><button class="ghost small" data-action="delTest" data-id="${esc(t.id)}" aria-label="Delete result">✕</button></div>`; }).join("");

    root.innerHTML = `
      <header class="pageHead"><div class="eyebrow">Athlete</div><h1>Progress</h1><p class="muted">Long jump · 100m · 200m · 400m</p></header>
      <section class="hero dark"><div class="eyebrow">April 2027 targets</div>
        <div class="targetGrid">${Plan.GOALS.map(g => `<div><small>${esc(g.label)}</small><b>${fmtVal(g.goal, g.unit)}</b></div>`).join("")}</div>
        <div class="statRow">
          <div><small>Current phase</small><b>${row ? esc(row.phase) : (today < Plan.first() ? "Pre-plan" : "Handoff")}</b></div>
          ${inPlan ? `<div><small>Days until team practice</small><b>${daysToSeason}</b></div><div><small>Day</small><b>${elapsed} / ${Plan.rows().length}</b></div>` : today < Plan.first() && daysToStart <= 60 ? `<div><small>Days until plan starts</small><b>${daysToStart}</b></div>` : ""}
          <div><small>Workouts completed</small><b>${completedCount}</b></div>
        </div></section>
      <section class="card"><div class="cardHead"><h2>Goals vs current</h2></div><div class="goalGrid">${goalCards}</div>
        <p class="muted small">Current PRs: 100m 11.90 · 200m 24.00 · 400m 56.00 · Long jump 19'11". Targets are targets, not guarantees — the plan's job is consistent, pain-free training.</p></section>
      <section class="card"><div class="cardHead"><h2>Testing</h2><small class="muted">Do not test through pain</small></div>
        <p class="muted small">Per the sheet: baseline testing week 4, retest week 13, 100m / long jump in weeks 23–25.</p>
        <form id="testForm" class="testForm">
          <label><span>Test</span><select name="test">${Plan.TESTS.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join("")}</select></label>
          <label><span>Date</span><input type="date" name="date" value="${today}" required></label>
          <label class="valField"><span id="testUnitLabel">Time (s)</span><input name="value" inputmode="decimal" placeholder="e.g. 4.21" required></label>
          <button class="primary" type="submit">Save result</button>
        </form>
        ${charts ? `<div class="charts">${charts}</div>` : `<p class="muted small">Charts appear once a test has two or more results.</p>`}
        <div class="testList">${list || `<p class="muted small">No results yet.</p>`}</div>
      </section>`;
    const sel = $("#testForm select"), lab = $("#testUnitLabel"), inp = $("#testForm input[name=value]");
    const upd = () => { const T = Plan.TESTS.find(t => t.id === sel.value); const metric = Store.settings().units === "metric"; lab.textContent = T.unit === "in" ? (metric ? "Distance (m)" : "Distance (ft'in)") : "Time (s)"; inp.placeholder = T.unit === "in" ? (metric ? "e.g. 6.07" : "e.g. 19'11") : "e.g. 4.21"; };
    sel.onchange = upd; upd();
  }

  function lineChart(pts, T) {
    const W = 320, H = 140, P = { l: 40, r: 12, t: 12, b: 26 };
    const vals = pts.map(p => p.value); let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) { hi += 1; lo -= 1; } const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
    const x = i => P.l + (pts.length === 1 ? 0 : i / (pts.length - 1) * (W - P.l - P.r));
    const y = v => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
    const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    const fmt = v => T.unit === "in" ? (Store.settings().units === "metric" ? (v * 0.0254).toFixed(2) : U.inchesToFtIn(v)) : v.toFixed(2);
    const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.label)} trend">
      ${ticks.map(t => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${P.l - 6}" y="${y(t) + 4}" class="tick" text-anchor="end">${esc(fmt(t))}</text>`).join("")}
      <path d="${path}" class="line"/>
      ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.value)}" r="4" class="pt"/><text x="${x(i)}" y="${H - 8}" class="tick" text-anchor="${i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}">${esc(U.fmtShort(p.date))}</text>`).join("")}
    </svg>`;
  }

  /* ================================================================ HISTORY */
  function renderHistory() {
    const root = $("#screen-history");
    const days = Object.entries(Store.allDays()).filter(([d, s]) => Plan.get(d) && (s.completed || Object.keys(s.checks || {}).length)).sort((a, b) => b[0].localeCompare(a[0]));
    const items = days.map(([d, s]) => {
      const day = dayFor(d), p = progressFor(d), done = !!s.completed;
      return `<button class="historyItem ${done ? "done" : ""}" data-action="openWorkout" data-date="${d}">
        <div class="hiMark">${done ? "✓" : `${p.pct}%`}</div>
        <div class="hiText"><b>${esc(U.fmtMedium(d))}</b><small>${esc(focusTitle(day))} · ${done ? "100% complete" : `${p.pct}% complete`}${s.durationMs ? ` · ${U.duration(s.durationMs)}` : ""}</small>${s.notes ? `<small class="hiNote">“${esc(s.notes)}”</small>` : ""}</div><span class="chev">›</span></button>`;
    }).join("");
    const total = Plan.rows().filter(r => r.date <= U.todayISO()).length, doneN = days.filter(([, s]) => s.completed).length;
    root.innerHTML = `<header class="pageHead"><div class="eyebrow">Log</div><h1>History</h1><p class="muted">${doneN} completed${total ? ` · ${Math.round(doneN / total * 100)}% of days so far` : ""}</p></header>
      <div class="historyList">${items || `<section class="card empty"><div class="bigEmoji">🏁</div><h3>No workouts logged yet</h3><p class="muted">Finish your first session and it will appear here with your weights, times and notes.</p><button class="primary" data-action="goTodayTab">Go to today</button></section>`}</div>`;
  }

  /* ================================================================ SETTINGS */
  function renderSettings() {
    const root = $("#screen-settings"), s = Store.settings(), st = Plan.status();
    const opt = (name, val, label) => `<button class="${s[name] === val ? "on" : ""}" data-action="setting" data-name="${name}" data-val="${val}">${label}</button>`;
    root.innerHTML = `<header class="pageHead"><div class="eyebrow">App</div><h1>Settings</h1></header>
      <section class="card"><h3>Appearance</h3><div class="seg">${opt("theme", "system", "System")}${opt("theme", "light", "Light")}${opt("theme", "dark", "Dark")}</div></section>
      <section class="card"><h3>Rest timer</h3><div class="rowSet"><span>Sound</span><div class="seg">${opt("sound", true, "On")}${opt("sound", false, "Off")}</div></div><div class="rowSet"><span>Vibration</span><div class="seg">${opt("vibrate", true, "On")}${opt("vibrate", false, "Off")}</div></div></section>
      <section class="card"><h3>Units</h3><div class="seg">${opt("units", "imperial", "Feet / inches")}${opt("units", "metric", "Metres")}</div><p class="muted small">Weights are logged as typed (lb or kg — your choice).</p></section>
      <section class="card"><h3>Plan sync</h3>
        <p class="muted small">The Google Sheet is the master plan. The app reads its public CSV export (no login, no keys) and falls back to the built-in copy offline.</p>
        <dl class="kv small"><dt>Source</dt><dd>${st.source === "sheet" ? "Google Sheet (live)" : st.source === "cached" ? "Google Sheet (cached copy)" : "Built-in plan"}</dd><dt>Last synced</dt><dd>${st.fetchedAt ? esc(new Date(st.fetchedAt).toLocaleString()) : "Never"}</dd>${st.lastError ? `<dt>Last error</dt><dd>${esc(st.lastError)}</dd>` : ""}<dt>Days loaded</dt><dd>${st.count}</dd></dl>
        <div class="btnRow"><button class="primary" data-action="syncNow">Sync now</button><a class="secondary btnLink" href="${Plan.SHEET_URL}" target="_blank" rel="noopener">Open Sheet</a></div>
        <div id="syncMsg" class="muted small"></div></section>
      <section class="card"><h3>Your data</h3><p class="muted small">Everything is stored on this device only.</p>
        <div class="btnRow"><button class="secondary" data-action="export">Copy backup (JSON)</button><button class="secondary danger" data-action="reset">Reset all local data</button></div><div id="dataMsg" class="muted small"></div></section>
      <section class="card"><h3>About</h3><dl class="kv small"><dt>Version</dt><dd>${VERSION}</dd><dt>Plan</dt><dd>${esc(U.fmtShort(Plan.first()))} → ${esc(U.fmtShort(Plan.last()))} · ${Plan.rows().length} days</dd><dt>Installed</dt><dd>${window.matchMedia("(display-mode: standalone)").matches || navigator.standalone ? "Yes (home screen)" : "Browser"}</dd></dl></section>`;
  }

  /* ================================================================ EVENTS */
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-action]"); if (!t) return;
    const a = t.dataset.action, date = state.workoutDate;
    const rerender = () => render();
    switch (a) {
      case "prevDay": state.date = U.addDays(state.date, -1); renderToday(); break;
      case "nextDay": state.date = U.addDays(state.date, 1); renderToday(); break;
      case "goToday": state.date = U.todayISO(); renderToday(); break;
      case "goTodayTab": go("today", { date: U.todayISO() }); break;
      case "goSettings": go("settings"); break;
      case "openDate": state.phaseOpen = null; go("today", { date: t.dataset.date }); break;
      case "startWorkout": go("workout", { date: state.date }); break;
      case "startSection": go("workout", { date: state.date, section: t.dataset.section }); break;
      case "openWorkout": go("workout", { date: t.dataset.date }); break;
      case "exitWorkout": state.date = date; go("today"); break;
      case "toggleRaw": state.showRaw[date + t.dataset.sec] = !state.showRaw[date + t.dataset.sec]; rerender(); break;
      case "ham": Store.setField(date, "hamstring", t.dataset.v); U.vibrate(10); rerender(); break;
      case "hamReset": Store.setField(date, "hamstring", undefined); rerender(); break;
      case "pit": Store.setField(date, "pit", t.dataset.v === "1"); rerender(); break;
      case "choose": { const d = Store.day(date); d.choice[t.dataset.key] = +t.dataset.idx; Store.save(); rerender(); break; }
      case "toggle": { const d = Store.day(date); Store.setCheck(date, t.dataset.key, !d.checks[t.dataset.key]); U.vibrate(8); rerender(); afterCheck(); break; }
      case "showTimes": { const d = Store.day(date); d.choice[t.dataset.key + ":times"] = true; Store.save(); rerender(); break; }
      case "timer": Timer.start(+t.dataset.sec, t.dataset.label || "Rest"); break;
      case "manualTimer": Timer.start(120, "Rest timer"); break;
      case "finish": finishWorkout(); break;
      case "reopen": { const d = Store.day(date); d.completed = null; d.durationMs = null; Store.save(); rerender(); break; }
      case "phase": state.phaseOpen = +t.dataset.num; renderPhaseSheet(state.phaseOpen); break;
      case "closePhase": state.phaseOpen = null; renderPhaseSheet(null); break;
      case "calPrev": case "calNext": { const [y, m] = state.calMonth.split("-").map(Number); const d = new Date(y, m - 1 + (a === "calNext" ? 1 : -1), 1); state.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; renderCalendar(); break; }
      case "delTest": if (confirm("Delete this test result?")) { Store.removeTest(t.dataset.id); renderProgress(); } break;
      case "setting": { let v = t.dataset.val; if (v === "true") v = true; else if (v === "false") v = false; Store.setSetting(t.dataset.name, v); applyTheme(); renderSettings(); break; }
      case "syncNow": { $("#syncMsg").textContent = "Syncing…"; Plan.sync().then(r => { $("#syncMsg").textContent = r.ok ? (r.changed ? "Updated — the plan changed since the last sync." : "Up to date with the Sheet.") : "Sync failed: " + r.reason; Object.keys(parsedCache).forEach(k => delete parsedCache[k]); renderSettings(); }); break; }
      case "export": { const json = Store.exportJSON(); (navigator.clipboard?.writeText(json) || Promise.reject()).then(() => $("#dataMsg").textContent = "Backup copied to clipboard.", () => { const w = window.open("", "_blank"); if (w) { w.document.write("<pre>" + esc(json) + "</pre>"); } }); break; }
      case "reset": if (confirm("Erase all workout logs, notes and test results on this device? This cannot be undone.")) { Store.reset(); location.reload(); } break;
    }
  });

  document.addEventListener("change", e => {
    const t = e.target; if (!t.dataset?.action) return;
    if (t.dataset.action === "check") { Store.setCheck(state.workoutDate, t.dataset.key, t.checked); U.vibrate(8); render(); afterCheck(); }
  });
  document.addEventListener("input", e => {
    const t = e.target, d = state.workoutDate;
    if (t.id === "dayNotes") { Store.setField(d, "notes", t.value); return; }
    if (t.dataset?.action === "setLog") { Store.setSet(d, t.dataset.key, t.dataset.n, t.dataset.f, t.value.trim()); return; }
    if (t.dataset?.action === "time") { Store.setTime(d, t.dataset.key, t.dataset.n, t.value.trim()); return; }
  });
  document.addEventListener("submit", e => {
    if (e.target.id !== "testForm") return;
    e.preventDefault();
    const f = new FormData(e.target), T = Plan.TESTS.find(t => t.id === f.get("test"));
    let v = String(f.get("value")).trim(), val;
    if (T.unit === "in") { val = Store.settings().units === "metric" ? parseFloat(v) / 0.0254 : (U.parseFtIn(v) ?? parseFloat(v) * 12); } else val = parseFloat(v);
    if (!isFinite(val) || val <= 0) { alert("Enter a valid number" + (T.unit === "in" && Store.settings().units !== "metric" ? " like 19'11" : "")); return; }
    Store.addTest({ date: f.get("date"), test: T.id, value: Math.round(val * 1000) / 1000, unit: T.unit });
    renderProgress();
  });
  $$(".navbtn").forEach(b => b.addEventListener("click", () => { if (b.dataset.screen === "today") state.date = U.todayISO(); go(b.dataset.screen); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && state.phaseOpen) { state.phaseOpen = null; renderPhaseSheet(null); } });

  function afterCheck() {
    const d = state.workoutDate, p = progressFor(d), st = Store.day(d);
    if (p.total && p.done >= p.total && !st.completed) { finishWorkout(true); }
  }
  function finishWorkout(auto) {
    const d = state.workoutDate, st = Store.day(d);
    st.completed = Date.now();
    st.durationMs = st.started ? Math.max(0, st.completed - st.started) : null;
    Store.save(); U.vibrate([60, 40, 60]); render();
    setTimeout(() => $(".doneCard")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  /* ================================================================ THEME / PWA / BOOT */
  function applyTheme() {
    const t = Store.settings().theme;
    document.documentElement.dataset.theme = t === "system" ? "" : t;
    const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    $("meta[name=theme-color]").setAttribute("content", dark ? "#0a1327" : "#0b1730");
  }
  applyTheme();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);

  // Keep "today" correct if the app stays open past midnight or returns from background
  let lastSeen = U.todayISO();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { const now = U.todayISO(); if (now !== lastSeen) { if (state.date === lastSeen) state.date = now; lastSeen = now; render(); } } });

  // Sync with the Sheet in the background (never blocks first paint)
  Plan.onSync((s, changed) => { if (changed) { Object.keys(parsedCache).forEach(k => delete parsedCache[k]); render(); toast("Plan updated from the Google Sheet"); } else if (state.screen === "today") { const el = $(".syncLine"); if (el) el.outerHTML = syncFooter(); } });
  setTimeout(() => Plan.sync(), 400);
  window.addEventListener("online", () => Plan.sync());

  function toast(msg) { const t = U.h(`<div class="toast">${esc(msg)}</div>`); document.body.appendChild(t); requestAnimationFrame(() => t.classList.add("show")); setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 3200); }

  // Dev escape hatch: localStorage.setItem("tw.nosw", "1") disables the service worker for live-reload testing.
  if ("serviceWorker" in navigator && !localStorage.getItem("tw.nosw")) {
    navigator.serviceWorker.register("sw.js").then(reg => {
      reg.addEventListener("updatefound", () => { const nw = reg.installing; nw?.addEventListener("statechange", () => { if (nw.state === "installed" && navigator.serviceWorker.controller) toast("Update ready — reopen the app to use it"); }); });
    }).catch(() => { });
  }
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; $("#installBtn").hidden = false; });
  $("#installBtn").addEventListener("click", async () => { if (installPrompt) { installPrompt.prompt(); installPrompt = null; $("#installBtn").hidden = true; } });

  go("today");
})();
