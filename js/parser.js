/* parser.js — turns the plan's prose prescriptions into actionable items.
 *
 * IMPORTANT: this module only *reads* the plan. It never alters a prescription.
 * Every section keeps its original text (`section.raw`) so the athlete can always see
 * exactly what the master sheet says; parsing just organises it into checkable units.
 *
 * Item kinds:
 *   simple  — one checkbox (+ optional detail / rest / duration timer)
 *   sets    — N sets (checkbox per set); strength sets also log weight / reps / RPE
 *   reps    — N single efforts (approach runs, quality jumps)
 *   sprint  — N reps of a distance with intensity, rest and optional timing
 *   choice  — the plan offers alternatives ("6×120m OR 10×100m"); athlete picks one
 *   pit     — long-jump branch: options for pit available / no pit
 */
(function () {
  const SECTIONS = [
    { id: "warmup", icon: "🔥", title: "Warm-up", field: "warmup", tagline: "Get ready" },
    { id: "speed", icon: "⚡", title: "Speed", field: "speed", tagline: "Quality first" },
    { id: "jumps", icon: "💥", title: "Jumps / Plyos", field: "jumps", tagline: "Explosive, clean landings" },
    { id: "strength", icon: "🏋️", title: "Strength", field: "strength", tagline: "Clean reps, no grinding" },
    { id: "recovery", icon: "🧘", title: "Recovery", field: "recovery", tagline: "Finish well" },
  ];
  const EMPTY = /^\s*(none|no training|no lifting(?:\/sprint session)?|no jumps|no warm-up needed|no structured training)\.?\s*$/i;
  const DASH = "[–—-]";
  const NUM = "\\d+(?:\\.\\d+)?";
  const RANGE = `${NUM}(?:\\s*${DASH}\\s*${NUM})?`;
  const CUE_RE = /\b(must|if\b|keep|stop|do not|don't|should|every rep|quality|never|only|not a|feel|choose|optional|technique|relaxed)/i;

  const norm = s => String(s || "").replace(/\s+/g, " ").replace(/×/g, "×").replace(/\s*×\s*/g, "×").trim();
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const rangeLabel = r => r.min === r.max ? String(r.min) : `${r.min}–${r.max}`;

  /* ---------------------------------------------------------------- rest parsing */
  /** Find a prescribed rest in text → {label, seconds, min, max} or null. */
  function parseRest(text) {
    if (!text) return null;
    const m = text.match(new RegExp(`~?\\s*(${RANGE})\\s*(min(?:ute)?s?|s(?:ec(?:ond)?s?)?)\\b`, "i"));
    if (!m) return null;
    const r = U.range(m[1]);
    const mult = /^m/i.test(m[2]) ? 60 : 1;
    const min = r.min * mult, max = r.max * mult;
    const unit = mult === 60 ? "min" : "s";
    const label = (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`) + ` ${unit}`;
    // default to the middle of a range, rounded to 5 s
    const seconds = Math.round(((min + max) / 2) / 5) * 5;
    return { label, seconds, min, max };
  }
  const isRestChunk = c => /^(?:full\s+)?(?:rest|recovery)?\s*~?\d+/.test(c) && /\b(rest|recovery|between|after|on\b)/i.test(c) && !/×/.test(c)
    || /^rest\s+~?\d/i.test(c) || /^\d+[–-]?\d*\s*(?:min|s)\s+(?:rest|recovery)/i.test(c) || /^~?\d+[–-]?\d*\s*(?:min|s)$/i.test(c);

  /* ---------------------------------------------------------------- chunking */
  /** Split prose into chunks on ";" and sentence boundaries, keeping "e.g. 2×10/side" intact. */
  function chunks(text) {
    const out = [];
    norm(text).split(/;\s*/).forEach(part => {
      // sentence split: ". " followed by a capital letter or a digit that starts a new instruction
      part.split(/\.\s+(?=[A-Z0-9])/).forEach(s => { s = s.replace(/\.$/, "").trim(); if (s) out.push(s); });
    });
    return out;
  }

  /* ---------------------------------------------------------------- item builders */
  function simple(text, extra = {}) {
    const rest = /\b(rest|between)\b/i.test(text) ? parseRest(text) : null;
    const dur = /^~?\d+[–-]?\d*\s*min\b/i.test(text) ? parseRest(text) : null; // "5–8 min easy jog"
    const optional = extra.optional || /^optional\b/i.test(text);
    return Object.assign({ kind: "simple", name: cap(text.replace(/^optional\s+/i, "")), rest, duration: dur }, extra, { optional });
  }

  /** "Back squat 3×6 RPE 6–7" / "4×3 takeoff drills" / "pogos 3×12" / "bounds 2×20m" */
  function parseSets(c, section) {
    let m = c.match(new RegExp(`^(.*?)\\s*(${RANGE})×(${RANGE})\\s*(m\\b|s\\b)?\\s*(/leg|/side|/arm)?\\s*(?:RPE\\s*(${RANGE}))?\\s*(?:,\\s*)?(.*)$`, "i"));
    if (!m) return null;
    let name = m[1].trim(), tail = m[7].trim();
    if (!name && tail) { name = tail; tail = ""; }             // "4×3 takeoff drills"
    if (!name) name = "Jumps";
    const sets = U.range(m[2]), reps = U.range(m[3]);
    const unit = (m[4] || "").toLowerCase();
    const per = m[5] || "";
    const rpe = m[6] ? m[6].replace(/-/g, "–") : null;
    const rest = tail ? parseRest(tail) : null;
    const note = tail && !rest ? tail : "";
    const repsLabel = rangeLabel(reps) + (unit === "m" ? "m" : unit === "s" ? "s" : "") + (per ? per : "");
    return {
      kind: "sets", name: cap(name), sets, reps, repsLabel, rpe, rest, note,
      log: section === "strength",                       // weight/reps/RPE logging only for lifts
      id: slug(name),
    };
  }

  /** "6 approach runs", "4–6 quality LJ jumps" */
  function parseReps(c) {
    const m = c.match(new RegExp(`^(${RANGE})\\s+(?!min\\b|s\\b)([a-z].*)$`, "i"));
    if (!m) return null;
    const reps = U.range(m[1]);
    if (/^(min|minutes|s|sec)\b/i.test(m[2])) return null;
    return { kind: "reps", name: cap(m[2].replace(/,.*$/, "").trim()), reps, rest: parseRest(m[2]), id: slug(m[2]) };
  }

  /* ---------------------------------------------------------------- sprint parsing */
  const SPRINT_GROUP = new RegExp(`(?:(${RANGE})×)?(${NUM})m\\b((?:\\s+(?:flying|build-?ups?|progressive|tempo|relaxed|fast|controlled))*)(?:\\s+with\\s+(${RANGE}m)\\s+build-in)?(?:\\s+(time trial))?`, "gi");

  /** Parse one speed chunk into sprint items. Handles "4×20m + 4×30m @ 70–80%; 2–4 min rest" style chunks. */
  function parseSprintChunk(c, ctx) {
    const items = [];
    let text = c;
    const optional = /^(?:then\s+)?optional\b/i.test(text);
    const onlyIf = (text.match(/\bonly if (.+)$/i) || [])[1];
    text = text.replace(/^(?:then\s+)?(?:optional\s+)?/i, "");
    const timeTrial = /time trial/i.test(text);
    const intens = text.match(new RegExp(`@\\s*~?\\s*(${RANGE})\\s*%`));
    const perRep = text.match(/(?:at|@)\s*((?:~?\d+%\s*,?\s*){2,})/i);
    const groups = [];
    let g;
    SPRINT_GROUP.lastIndex = 0;
    while ((g = SPRINT_GROUP.exec(text))) {
      const reps = g[1] ? U.range(g[1]) : { min: 1, max: 1 };
      const mods = (g[3] || "").trim().toLowerCase();
      groups.push({ reps, dist: +g[2], flying: /flying/.test(mods), buildup: /build/.test(mods) && !/flying/.test(mods) || (/progressive/.test(mods)), tempo: /tempo|relaxed/.test(mods), buildIn: g[4] || null, index: g.index });
    }
    if (!groups.length) return null;
    // Rest inside the chunk: text after the last group and intensity, e.g. ", 2–3 min"
    const after = text.slice(groups[groups.length - 1].index).replace(SPRINT_GROUP, "").replace(/@\s*~?[\d–\-.]+\s*%/g, "");
    const inlineRest = /\d\s*(min|s)\b/i.test(after) ? parseRest(after) : null;
    let cue = after.replace(new RegExp(`,?\\s*(?:full\\s+)?~?${RANGE}\\s*(?:min(?:ute)?s?|s(?:ec)?)\\b[^,;]*`, "i"), "").replace(/^[\s,;.]+|[\s,;.]+$/g, "").replace(/^(?:rest|recovery)\b.*$/i, "").trim();
    if (/^at\b/i.test(cue) || /^only if/i.test(cue)) cue = "";

    groups.forEach(gr => {
      const isTT = timeTrial;
      let name = `${gr.dist}m ` + (isTT ? "time trial" : gr.flying ? "flying sprint" : gr.buildup ? "build-up" : gr.tempo || ctx.tempo ? "tempo run" : "sprint");
      let intensity = intens ? `${intens[1].replace(/-/g, "–")}%` : (isTT ? "Controlled / max effort" : (gr.buildup && !perRep ? "Progressive" : null));
      const perRepList = perRep && gr.buildup ? perRep[1].match(/~?\d+%/g) : null;
      items.push({
        kind: "sprint", name: cap(name), reps: gr.reps, dist: gr.dist, intensity, perRep: perRepList,
        flying: gr.flying, buildIn: gr.buildIn, buildup: gr.buildup, timeTrial: isTT, optional, onlyIf,
        rest: inlineRest, timeable: !gr.buildup, id: slug(name),
      });
    });
    if (cue && !isRestChunk(cue) && cue.length > 3 && !/^(?:with|then)/i.test(cue)) items[items.length - 1].note = cap(cue);
    return items;
  }

  /** Apply a standalone rest chunk ("2–4 min after 30s/60s, 60–90s after 100s") to preceding sprint items. */
  function applyRest(c, items) {
    let targets = items.filter(i => i.kind === "sprint" || i.kind === "reps" || i.kind === "sets");
    if (!targets.length) { const lastSimple = [...items].reverse().find(i => i.kind === "simple"); if (!lastSimple) return false; targets = [lastSimple]; }
    const pairs = [...c.matchAll(new RegExp(`(~?${RANGE}\\s*(?:min|s)\\b)[^\\d]*?(?:after|on)\\s+((?:\\d+s?[/\\s]*)+)`, "gi"))];
    if (pairs.length && pairs.some(p => /\d/.test(p[2]))) {
      pairs.forEach(p => {
        const rest = parseRest(p[1]);
        const dists = (p[2].match(/\d+/g) || []).map(Number);
        targets.forEach(t => { if (t.kind === "sprint" && dists.includes(t.dist)) t.rest = rest; });
      });
      return true;
    }
    const rest = parseRest(c);
    if (!rest) return false;
    const flyingOnly = /flying/i.test(c);
    const fastOnly = /\bfast reps\b/i.test(c);
    const jumpsOnly = /\bjumps?\b/i.test(c);
    targets.forEach(t => {
      if (t.rest) return;
      if (flyingOnly && !t.flying) return;
      if (fastOnly && (t.buildup || (!t.flying && !t.intensity))) return;
      if (jumpsOnly && !/jump/i.test(t.name)) return;
      if (t.kind === "sprint" && t.buildup && !/build/i.test(c)) return;
      t.rest = rest;
    });
    return true;
  }

  /* ---------------------------------------------------------------- per-section parsers */
  function parseGenericChunk(c, sectionId, items, ctx) {
    c = c.replace(/^then:?\s*/i, "").trim();
    if (!c) return;
    if (isRestChunk(c)) { if (!applyRest(c, items)) items.push({ kind: "cue", text: cap(c) }); return; }
    if (sectionId === "speed" || /\d×\d+m\b/.test(c) && sectionId !== "jumps" && sectionId !== "warmup") {
      const s = parseSprintChunk(c, ctx); if (s) { items.push(...s); return; }
    }
    if (/×/.test(c)) {
      const s = parseSets(c, sectionId);
      if (s) {
        // warm-up/recovery: quick single-check items (e.g. "ankle rocks 2×10/side")
        if (sectionId === "warmup" || sectionId === "recovery") { items.push(simple(c.replace(/,\s*~?\d+[–-]?\d*\s*(?:min|s)\b.*$/i, ""), { rest: s.rest })); return; }
        // "3×20m buildups" inside warm-up handled above; in jumps sets are fine
        items.push(s); return;
      }
    }
    const rounds = c.match(/^(.*?)\s*(\d+)\s*rounds?:\s*(.+)$/i);
    if (rounds) { items.push({ kind: "sets", name: cap(rounds[1] || "Circuit"), sets: { min: +rounds[2], max: +rounds[2] }, reps: { min: 1, max: 1 }, repsLabel: "round", note: cap(rounds[3]), log: false, id: slug(rounds[1] || "circuit") }); return; }
    if (sectionId === "jumps" || sectionId === "speed") {
      const r = parseReps(c); if (r) { items.push(r); return; }
    }
    // speed section: anything that isn't a sprint or a timed block is coaching text, not a checkbox
    if (sectionId === "speed" && !/^~?\d+[–-]?\d*\s*min\b/i.test(c)) { items.push({ kind: "cue", text: cap(c) }); return; }
    if (CUE_RE.test(c) && !/^\d/.test(c) && !/\d+\/(side|leg)/i.test(c) && c.split(" ").length > 3 && !/^(then:|optional)/i.test(c) && !/\b(jog|walk|bike|stretch|mobility|breathing)\b/i.test(c)) {
      items.push({ kind: "cue", text: cap(c) }); return;
    }
    const text = c.replace(/^then:?\s*/i, "");
    if (!text) return;
    items.push(simple(text, { optional: /^optional\b/i.test(text) }));
  }

  /** Jumps: split "If pit: … If no pit: …" into a pit branch. */
  function parseJumps(text, ctx) {
    const m = norm(text).match(/^if\s+(?:safe\s+)?pit(?:\s+available)?:\s*(.+?)\.?\s*if\s+no\s+pit:\s*(.+)$/i);
    if (!m) return parseSection(text, "jumps", ctx);
    const build = t => { const items = []; chunksPlus(t).forEach(c => parseGenericChunk(c, "jumps", items, ctx)); return items; };
    return [{ kind: "pit", id: "lj", pit: build(m[1]), noPit: build(m[2]), rawPit: m[1], rawNoPit: m[2] }];
  }
  /** Like chunks() but also splits " + " lists such as "6 approach runs + 4 quality LJ jumps, 2–3 min between jumps". */
  function chunksPlus(text) {
    const out = [];
    chunks(text).forEach(c => {
      if (/\s\+\s/.test(c) && !/@/.test(c)) {
        const parts = c.split(/\s\+\s/);
        // a trailing ", 2–3 min between jumps" belongs to the whole group
        const last = parts[parts.length - 1];
        const restM = last.match(/,\s*(~?\d.*(?:min|s)\b.*)$/i);
        if (restM) { parts[parts.length - 1] = last.slice(0, restM.index); out.push(...parts, restM[1]); }
        else out.push(...parts);
      } else out.push(c);
    });
    return out;
  }

  /** Thursday tempo: "Phase 1: … Phase 2: …" — show the current phase's prescription, keep the rest as reference. */
  function parsePhased(text, ctx) {
    const parts = [...norm(text).matchAll(/Phase\s+(\d):\s*([^]*?)(?=\s*Phase\s+\d:|$)/g)];
    if (!parts.length) return null;
    const cur = parts.find(p => +p[1] === ctx.phaseNum) || parts[0];
    const items = [];
    const body = cur[2].replace(/\.$/, "");
    const alt = body.split(/\s+OR\s+/i);
    if (alt.length === 2) {
      const opts = alt.map(a => { const its = []; chunks(a).forEach(c => parseGenericChunk(c, "speed", its, { ...ctx, tempo: true })); return its; });
      // rest usually only stated once at the end → share it
      const rest = opts[1].find(i => i.rest)?.rest || opts[0].find(i => i.rest)?.rest;
      opts.forEach(o => o.forEach(i => { if (!i.rest && i.kind === "sprint") i.rest = rest; }));
      items.push({ kind: "choice", id: "tempo", options: opts.map((o, i) => ({ label: alt[i].replace(/,.*$/, ""), items: o })) });
    } else chunks(body).forEach(c => parseGenericChunk(c, "speed", items, { ...ctx, tempo: true }));
    items.forEach(i => { if (i.kind === "sprint") { i.tempo = true; i.timeable = false; } });
    return { items, phaseLabel: `Phase ${cur[1]}`, others: parts.filter(p => p !== cur).map(p => `Phase ${p[1]}: ${p[2]}`) };
  }

  function parseSection(text, sectionId, ctx) {
    const items = [];
    (sectionId === "jumps" ? chunksPlus(text) : chunks(text)).forEach(c => parseGenericChunk(c, sectionId, items, ctx));
    return items;
  }

  /* ---------------------------------------------------------------- recovery tail cue */
  /** Recovery text = a mobility list followed by a day-specific coaching sentence. Split them. */
  function splitRecovery(text) {
    const t = norm(text);
    const m = t.match(/^(.*?easy breathing \d+ min\.?)\s*(.*)$/i);
    if (m) return { list: m[1], cue: m[2].trim() };
    return { list: t, cue: "" };
  }

  function slug(s) { return String(s).toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

  /* ---------------------------------------------------------------- public API */
  const PHASE_NUM = { "Rebuild": 1, "Strength + Acceleration": 2, "Maximum Velocity": 3, "Strength → Power": 4, "Specialization": 5, "Sharpen": 6 };

  /** Parse one workout row into a structured day. */
  function parseWorkout(w, meta = {}) {
    const ctx = { phaseNum: PHASE_NUM[w.phase] || 1, type: w.type };
    const sections = [];
    let recoveryCue = "";
    SECTIONS.forEach(sec => {
      const raw = w[sec.field] || "";
      const empty = EMPTY.test(raw);
      let items = [], extra = {};
      if (!empty) {
        if (sec.id === "jumps") items = parseJumps(raw, ctx);
        else if (sec.id === "speed" && /Phase\s+\d:/.test(raw)) { const p = parsePhased(raw, ctx); items = p.items; extra = { phaseLabel: p.phaseLabel, others: p.others }; }
        else if (sec.id === "recovery") {
          if (w.type === "REST") { items = [{ kind: "simple", name: "Complete rest day", detail: raw }]; }
          else if (w.type === "RECOVERY") {
            items = [
              { kind: "simple", name: "Friday frisbee (5–9 PM)", detail: "Counts as the day's activity." },
              { kind: "simple", name: "10–15 min easy mobility afterward", duration: parseRest("10–15 min") },
              { kind: "cue", text: "If frisbee is intense, do not add conditioning." },
            ];
          } else {
            const { list, cue } = splitRecovery(raw);
            recoveryCue = cue;
            const head = list.match(/^(~?\d+[–-]?\d*\s*min):\s*(.*)$/i);
            items = parseSection(head ? head[2] : list, "recovery", ctx);
            if (head) extra = { duration: parseRest(head[1]) };
          }
        }
        else if (sec.id === "warmup" && w.type === "RECOVERY") items = [{ kind: "simple", name: "Optional 5 min walk + light mobility", optional: true, duration: parseRest("5 min") }];
        else items = parseSection(raw, sec.id, ctx);
      }
      // stable keys: section:index (choice/pit options get their own sub keys)
      items.forEach((it, i) => keyItem(it, `${sec.id}:${i}`));
      sections.push({ ...sec, raw, empty, items, ...extra });
    });

    const dayMeta = (meta.days || {})[w.date] || {};
    const hasSprint = sections.some(s => s.id === "speed" && s.items.some(i => i.kind === "sprint" && !i.tempo));
    const hasPit = sections.some(s => s.items.some(i => i.kind === "pit"));
    const timeTrial = sections.some(s => s.items.some(i => i.kind === "sprint" && i.timeTrial));
    return {
      date: w.date, day: w.day, week: w.week, weekNumber: w.weekNumber, phase: w.phase, phaseNum: ctx.phaseNum, type: w.type,
      sections, focus: dayMeta.focus || defaultFocus(w), location: dayMeta.location || "",
      sheetNote: dayMeta.note || "", recoveryCue, hasSprint, hasPit, timeTrial,
      hamstringCheck: w.type === "HARD" && hasSprint,
    };
  }

  function keyItem(it, key) {
    it.key = key;
    if (it.kind === "choice") it.options.forEach((o, oi) => o.items.forEach((x, xi) => keyItem(x, `${key}.${oi}.${xi}`)));
    if (it.kind === "pit") { it.pit.forEach((x, xi) => keyItem(x, `${key}.p.${xi}`)); it.noPit.forEach((x, xi) => keyItem(x, `${key}.n.${xi}`)); }
    if (it.id) it.key = `${key}|${it.id}`;
  }

  function defaultFocus(w) {
    return { HARD: "Speed + power", LIGHT: "Upper body + aerobic", RECOVERY: "No structured training", REST: "Complete rest" }[w.type] || "Training";
  }

  /** Count required + completed units for progress. */
  function progress(day, dayState) {
    let total = 0, done = 0;
    const checks = dayState.checks || {};
    const walk = (items) => items.forEach(it => {
      if (it.kind === "cue") return;
      if (it.kind === "choice") { const idx = dayState.choice?.[it.key] ?? 0; walk(it.options[idx].items); return; }
      if (it.kind === "pit") { const pit = dayState.pit; if (pit === undefined) { total += 1; return; } walk(pit ? it.pit : it.noPit); return; }
      if (it.kind === "sets") { const n = it.sets.min; total += n; for (let i = 1; i <= n; i++) if (checks[`${it.key}#${i}`]) done++; return; }
      if (it.kind === "reps" || it.kind === "sprint") { if (it.optional) return; const n = it.reps.min; total += n; for (let i = 1; i <= n; i++) if (checks[`${it.key}#${i}`]) done++; return; }
      if (it.optional) return;
      total += 1; if (checks[it.key]) done++;
    });
    day.sections.forEach(s => walk(s.items));
    return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
  }

  window.Parser = { SECTIONS, parseWorkout, parseRest, progress, PHASE_NUM, slug };
})();
