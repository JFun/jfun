/* @jfun/audio — a tiny procedural SFX synth (Web Audio). Lifted from Moraine's
   audio.js (canonical). No asset files: every sound is generated on the fly, so it
   bundles to nothing and works offline. iOS needs a user gesture to start audio —
   call Sfx.unlock() on the first pointer/key. A mute preference persists in
   localStorage under a configurable namespace. UMD: browser global `Sfx`.

   Configure once (optional): Sfx.init({ namespace: "moraine" }) before reading the
   mute pref. The named-sound API (slide/clear/blocked/win/dead/tap) is a generic
   palette — a game uses whichever fit; per-game sound *choices* stay in the game. */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Sfx = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  let KEY = "studio.muted.v1";
  let ctx = null, master = null, enabled = true, primed = false, interrupted = false;
  const readPref = () => { try { enabled = root.localStorage.getItem(KEY) !== "1"; } catch (e) {} };
  readPref();

  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
    // Any drop out of "running" on iOS is an interruption (backgrounding, a call)
    // that POISONS the render graph — flag it so the next gesture rebuilds fresh.
    ctx.onstatechange = function () { if (ctx && ctx.state !== "running") { primed = false; interrupted = true; } };
    return ctx;
  }
  function unlock() {
    if (interrupted && ctx) {
      try { ctx.close(); } catch (e) {}
      ctx = null; master = null; primed = false; interrupted = false;
    }
    const c = ensure();
    if (!c) return;
    if (c.state !== "running") { const p = c.resume(); if (p && p.catch) p.catch(function () {}); }
    if (!primed) {
      try {
        const b = c.createBuffer(1, 1, 22050);
        const s = c.createBufferSource();
        s.buffer = b; s.connect(c.destination); s.start(0);
        primed = true;
      } catch (e) {}
    }
  }
  function wake() { if (ctx && ctx.state !== "running") { const p = ctx.resume(); if (p && p.catch) p.catch(function () {}); } }

  function tone(freq, dur, type, gain, delay, glideTo) {
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function whoosh(dur, gain, fromHz, toHz) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(fromHz, t);
    lp.frequency.exponentialRampToValueAtTime(toHz, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // Ascending notes — each clear in a cascade climbs this for a rising chime.
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 987.77, 1046.5, 1244.5, 1396.9];

  const Sfx = {
    get enabled() { return enabled; },
    // Set the localStorage namespace for the mute pref (call before first read).
    init(opts) { opts = opts || {}; if (opts.namespace) { KEY = opts.namespace + ".muted.v1"; readPref(); } return Sfx; },
    setEnabled(v) { enabled = !!v; try { root.localStorage.setItem(KEY, enabled ? "0" : "1"); } catch (e) {} if (enabled) unlock(); },
    toggle() { this.setEnabled(!enabled); return enabled; },
    unlock, wake,
    slide() { if (!enabled || !ensure()) return; whoosh(0.11, 0.05, 900, 180); },
    clear(depth) { if (!enabled || !ensure()) return; const f = NOTES[Math.min(depth || 0, NOTES.length - 1)]; tone(f, 0.24, "triangle", 0.22); tone(f * 2, 0.16, "sine", 0.06); },
    blocked() { if (!enabled || !ensure()) return; tone(160, 0.10, "sine", 0.12, 0, 90); },
    win() { if (!enabled || !ensure()) return; [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.32, "triangle", 0.2, i * 0.09)); },
    dead() { if (!enabled || !ensure()) return; tone(330, 0.2, "triangle", 0.18, 0); tone(247, 0.34, "triangle", 0.18, 0.15); },
    tap() { if (!enabled || !ensure()) return; tone(680, 0.05, "sine", 0.05); },
    VERSION: "0.1.0",
  };

  // Re-resume on every path back into the foreground (iOS suspends the context).
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") wake(); });
  }
  if (root.addEventListener) { root.addEventListener("pageshow", wake); root.addEventListener("focus", wake); }

  return Sfx;
});
