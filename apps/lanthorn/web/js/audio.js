/* Lanthorn audio — pre-rendered WAVs (scripts/dev/gen_sounds.py → sounds/),
   played NATIVELY on iOS: the shell exposes webkit.messageHandlers.sound and
   routes names into AVAudioEngine with preloaded buffers (full volume, no
   WebAudio attenuation, survives backgrounding via the shell's lifecycle
   handling). On plain web the same WAVs play through WebAudio. Haptics ride
   along on the same bridge. */
(function (root) {
  "use strict";
  const Snd = { muted: false, haptics: true };
  const NAMES = ["tap", "ui", "clear", "clear2", "lantern", "win", "fail", "bgm"];
  // Capacitor app (NativeFX plugin) > legacy hand-rolled shell > plain web
  const CAP = !!(root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform());
  const NATIVE = CAP || !!(root.webkit && root.webkit.messageHandlers && root.webkit.messageHandlers.sound);

  function post(handler, msg) {
    try {
      if (CAP) {
        const fx = root.Capacitor.Plugins.NativeFX;
        if (handler === "sound") fx.sound({ name: msg });
        else fx.haptic({ kind: msg });
      } else {
        root.webkit.messageHandlers[handler].postMessage(msg);
      }
    } catch (e) {}
  }
  function buzz(kind) { if (Snd.haptics) post("haptic", kind); }

  // ---------- web fallback: same WAVs through WebAudio ----------
  let ctx = null, master = null, loading = false;
  const bufs = {};
  function ensureCtx() {
    if (!ctx) {
      try { ctx = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.95;
      master.connect(ctx.destination);
    }
    if (ctx.state !== "running") { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  function loadAll() {
    if (loading || !ensureCtx()) return;
    loading = true;
    const grab = (name, ext) =>
      fetch("sounds/" + name + "." + ext)
        .then(r => r.arrayBuffer())
        .then(ab => ctx.decodeAudioData(ab))
        .then(buf => {
          bufs[name] = buf;
          if (name === "bgm" && bgmWant) webBgmStart();
        });
    for (const name of NAMES) {
      if (name === "bgm") grab(name, "m4a").catch(() => grab(name, "wav").catch(() => {}));
      else grab(name, "wav").catch(() => {});
    }
  }
  function webPlay(name) {
    const c = ensureCtx();
    if (!c || !bufs[name]) return;
    const src = c.createBufferSource();
    src.buffer = bufs[name];
    src.connect(master);
    src.start();
  }

  // ---------- background music (loop) ----------
  let bgmWant = false, bgmSrc = null, bgmGain = null;
  function webBgmStart() {
    const c = ensureCtx();
    if (!c || !bufs.bgm || bgmSrc) return;
    if (!bgmGain) { bgmGain = c.createGain(); bgmGain.gain.value = 0.6; bgmGain.connect(master); }
    bgmSrc = c.createBufferSource();
    bgmSrc.buffer = bufs.bgm;
    bgmSrc.loop = true;
    bgmSrc.connect(bgmGain);
    bgmSrc.start();
  }
  function webBgmStop() {
    if (bgmSrc) { try { bgmSrc.stop(); } catch (e) {} bgmSrc = null; }
  }
  Snd.bgmOn = function () {
    bgmWant = true;
    if (NATIVE) post("sound", "bgm-on");
    else webBgmStart();
  };
  Snd.bgmOff = function () {
    bgmWant = false;
    if (NATIVE) post("sound", "bgm-off");
    else webBgmStop();
  };

  function play(name) {
    if (Snd.muted) return;
    if (NATIVE) post("sound", name);
    else webPlay(name);
  }

  // ---------- game-facing API (unchanged surface) ----------
  Snd.tap = () => { play("tap"); buzz("light"); };
  Snd.ui = () => play("ui");
  Snd.clear = (lines) => { play(lines > 1 ? "clear2" : "clear"); buzz("medium"); };
  Snd.lantern = () => { play("lantern"); buzz("medium"); };
  Snd.win = () => { play("win"); buzz("success"); };
  Snd.fail = () => { play("fail"); buzz("warning"); };
  Snd.testBuzz = () => buzz("medium");   // settings demo when vibration is re-enabled

  // first gesture: unlock + start decoding (web path only — native needs none)
  Snd.warmup = function () {
    if (NATIVE) return;
    ensureCtx();
    loadAll();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", () => Snd.warmup(), { once: true, capture: true });
    // returning from background: WebAudio contexts come back suspended
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && ctx && ctx.state !== "running") { try { ctx.resume(); } catch (e) {} }
    });
  }

  root.Snd = Snd;
})(typeof globalThis !== "undefined" ? globalThis : this);
