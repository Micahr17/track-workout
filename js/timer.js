/* timer.js — the built-in rest timer (single instance, shown as a bottom sheet).
 * Uses wall-clock deadlines so it stays accurate when the phone screen sleeps. */
(function () {
  let el, deadline = 0, remaining = 0, total = 0, tick = null, paused = false, label = "", audio = null, onDone = null;

  function mount() {
    if (el) return;
    el = U.h(`
      <div class="timerSheet" id="timerSheet" hidden role="dialog" aria-label="Rest timer" aria-live="polite">
        <div class="timerTop"><span class="eyebrow" id="timerLabel">Rest</span><button class="ghost small" id="timerClose" aria-label="Close timer">✕</button></div>
        <div class="timerRing"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ringBg" cx="60" cy="60" r="54"/><circle class="ringFg" id="ringFg" cx="60" cy="60" r="54"/></svg><div class="timerDigits" id="timerDigits">0:00</div></div>
        <div class="timerAdjust"><button class="chip" data-adj="-30">−30s</button><button class="chip" data-adj="-15">−15s</button><button class="chip" data-adj="15">+15s</button><button class="chip" data-adj="30">+30s</button></div>
        <div class="timerBtns"><button class="secondary" id="timerReset">Reset</button><button class="primary" id="timerPause">Pause</button><button class="secondary" id="timerStop">Stop</button></div>
      </div>`);
    document.body.appendChild(el);
    U.$("#timerClose", el).onclick = stop;
    U.$("#timerStop", el).onclick = stop;
    U.$("#timerPause", el).onclick = () => paused ? resume() : pause();
    U.$("#timerReset", el).onclick = () => { start(total, label, onDone); };
    U.$$("[data-adj]", el).forEach(b => b.onclick = () => adjust(+b.dataset.adj));
  }

  function render() {
    U.$("#timerDigits", el).textContent = remaining <= 0 ? "GO" : U.mmss(remaining);
    const ring = U.$("#ringFg", el);
    const C = 2 * Math.PI * 54;
    ring.style.strokeDasharray = C;
    ring.style.strokeDashoffset = C * (1 - (total ? U.clamp(remaining / total, 0, 1) : 0));
    el.classList.toggle("done", remaining <= 0);
    U.$("#timerPause", el).textContent = paused ? "Resume" : "Pause";
  }

  function loop() {
    if (paused) return;
    remaining = Math.ceil((deadline - Date.now()) / 1000);
    render();
    if (remaining <= 0) { finish(); return; }
    tick = setTimeout(loop, 250);
  }

  function finish() {
    clearTimeout(tick); remaining = 0; render();
    const s = Store.settings();
    if (s.vibrate) U.vibrate([250, 120, 250, 120, 400]);
    if (s.sound) beep();
    if (onDone) onDone();
  }

  function beep() {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime;
      [0, 0.18, 0.36].forEach((dt, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = "sine"; o.frequency.value = i === 2 ? 1046 : 880;
        g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.4, t0 + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.15);
        o.connect(g).connect(audio.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.16);
      });
    } catch (e) { }
  }
  /** iOS only allows audio after a user gesture — call this from the START REST tap. */
  function unlockAudio() { try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch (e) { } }

  function start(seconds, lbl = "Rest", done = null) {
    mount(); unlockAudio();
    total = seconds; remaining = seconds; label = lbl; onDone = done; paused = false;
    deadline = Date.now() + seconds * 1000;
    U.$("#timerLabel", el).textContent = lbl;
    el.hidden = false; requestAnimationFrame(() => el.classList.add("open"));
    clearTimeout(tick); loop();
  }
  function pause() { if (paused) return; paused = true; clearTimeout(tick); remaining = Math.ceil((deadline - Date.now()) / 1000); render(); }
  function resume() { if (!paused) return; paused = false; deadline = Date.now() + remaining * 1000; loop(); }
  function adjust(d) { deadline += d * 1000; total = Math.max(5, total + d); remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); if (paused) render(); else { clearTimeout(tick); loop(); } }
  function stop() { clearTimeout(tick); paused = false; if (el) { el.classList.remove("open"); setTimeout(() => { el.hidden = true; }, 200); } }

  window.Timer = { start, pause, resume, stop, unlockAudio, isRunning: () => el && !el.hidden };
})();
