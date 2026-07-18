/* Tilt — game UI, "Arcade Night" skin (2026-07 design pass: hero timer, gold
   chips, glow-ring holes, framed tray — see Tilt — Redesign Directions.dc.html).
   ONE input, one story: tilt the physical phone, the marbles
   follow gravity (TrayPhysics fixed-step sim), sink each in its matching hole,
   race the clock. Level campaign via engine.build(level) — the discrete engine
   also generates/verifies every layout (BFS-solvable, never ship a lie).
   Rendering/audio/haptics consume physics EVENTS; game state never depends on
   requestAnimationFrame alone (throttled tabs / webviews freeze rAF).
   The former swipe mode was removed on purpose — it confused the pitch. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const E = window.GameEngine;
  const PH = window.TrayPhysics;
  const N = E.N, PAL = E.PAL;
  // Arcade Night skin: retuned marble colors (render-side only — the engine's
  // PAL + color KEYS are untouched, so engine/physics tests stay green)
  const SKIN = { r: "#ff4d6b", g: "#3ce07d", b: "#43a6ff", y: "#ffd23e", o: "#ff8a2a", p: "#b06bff", w: "#f2f5ff" };
  // the restart/replay icon = the DESIGN's SVG (Feather refresh-cw), NOT the thin
  // Unicode ⟳ — sized up for the bigger buttons
  const IC_RESTART = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-5px;margin-right:5px"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>';

  /* ---------- audio (impacts sell the physics) ---------- */
  let AC = null;
  function initAudio() {
    if (initNativeAudio()) return;   // device: native engine owns all audio
    if (AC) { resumeAudio(); return; }
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  // iOS suspends the AudioContext when the app backgrounds and does NOT auto-
  // resume. Worse: after backgrounding, WKWebView's context can come back
  // LYING — state reads "running" while it renders SILENCE — so no state check
  // can be trusted (a state-gated rebuild shipped and still lost sound on
  // device). The only reliable recovery: REBUILD the whole context on every
  // return to foreground, then rebuild AGAIN inside the first touch — a user
  // gesture is the one place iOS reliably starts audio. (The native side
  // reactivates the AVAudioSession in AppDelegate; this is the web half.)
  let audioSuspect = false;
  function resumeAudio() {
    if (AC && AC.state !== "running") { try { AC.resume().catch(() => {}); } catch (e) {} }
  }
  function rebuildAudio() {
    try { AC.close().catch(() => {}); } catch (e) {}
    AC = null; rollSrc = null; rollGain = null; rollFilter = null;
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    initRollSound();
    resumeAudio();
  }
  function onForeground() {
    if (!AC) return;          // audio never started — nothing to revive
    audioSuspect = true;
    rebuildAudio();
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") onForeground(); });
  window.addEventListener("pageshow", onForeground);
  window.addEventListener("focus", resumeAudio);
  document.addEventListener("touchstart", () => {
    if (audioSuspect && AC) { rebuildAudio(); audioSuspect = false; }
    else resumeAudio();
  }, { passive: true });
  function tone(freq, freq2, dur, vol, type, when) {
    if (!AC) return;
    const t = AC.currentTime + (when || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || "triangle";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noiseBurst(dur, vol, hp) {
    if (!AC) return;
    const t = AC.currentTime;
    const n = Math.floor(AC.sampleRate * dur);
    const buf = AC.createBuffer(1, n, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = AC.createBufferSource(); s.buffer = buf;
    const f = AC.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
    const g = AC.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(AC.destination);
    s.start(t);
  }
  // Settings gates (persisted in the save, default ON). SFX_ON gates every snd* call
  // + the rolling rumble; VIBE_ON gates haptic(). applySettings() reloads them.
  let SFX_ON = true, VIBE_ON = true;
  function applySettings() { const sv = loadSave(); SFX_ON = !sv.soundOff; VIBE_ON = !sv.vibeOff; }
  // Firebase Analytics: the native plugin auto-collects sessions/retention/first_open;
  // these are the custom funnel events on top. Safe no-op in the browser / if absent.
  function track(name, params) {
    try {
      const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAnalytics;
      if (A) A.logEvent({ name: name, params: params || {} });
    } catch (e) {}
  }
  const sndAt = {};
  function throttled(kind, ms) { const now = performance.now(); if (sndAt[kind] && now - sndAt[kind] < ms) return false; sndAt[kind] = now; return true; }
  // glass, not wood: high, short, bright — throttled PER PAIR so chain clacks all speak
  function sndClack(vol, pitch, key, dead) {
    if (!SFX_ON) return;
    if (!throttled("clack" + (key || ""), 45)) return;
    if (snReady) { SN.play({ name: dead ? "clackDead" : "clack", rate: pitch, vol }); return; }
    if (dead) { tone(760 * pitch, 430 * pitch, 0.045, 0.3 * vol, "sine"); noiseBurst(0.02, 0.1 * vol, 1500); return; }
    tone(1900 * pitch, 1350 * pitch, 0.035, 0.26 * vol, "sine"); noiseBurst(0.02, 0.14 * vol, 3000);
  }
  function sndWallHit(vol) { if (!SFX_ON) return; if (!throttled("wall", 60)) return; if (snReady) { SN.play({ name: "wall", rate: 1, vol }); return; } tone(120, 65, 0.1, 0.4 * vol, "sine"); noiseBurst(0.04, 0.2 * vol, 700); }
  // continuous rolling rumble — gain/brightness track the fastest free marble
  let rollSrc = null, rollGain = null, rollFilter = null;
  function initRollSound() {
    if (SN) return;                    // native roll loop lives in the engine
    if (rollSrc || !AC) return;
    const n = Math.floor(AC.sampleRate * 0.5);
    const buf = AC.createBuffer(1, n, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    rollSrc = AC.createBufferSource(); rollSrc.buffer = buf; rollSrc.loop = true;
    rollFilter = AC.createBiquadFilter(); rollFilter.type = "lowpass"; rollFilter.frequency.value = 350;
    rollGain = AC.createGain(); rollGain.gain.value = 0;
    rollSrc.connect(rollFilter); rollFilter.connect(rollGain); rollGain.connect(AC.destination);
    rollSrc.start();
  }
  let rollSentAt = 0, rollSentGain = -1;
  function setRollLevel(maxSpeed, onIce) {   // maxSpeed in cells/s; 0 silences
    if (!SFX_ON) maxSpeed = 0;        // settings: sound off → no rolling rumble
    // the surface SPEAKS: ice opens the filter into a glassy hiss, sand chokes
    // it into a low grind — the ear learns the element as fast as the eye
    const fMulS = onIce === "ice" ? 2.6 : onIce === "sand" ? 0.45 : 1;
    const gMulS = onIce === "ice" ? 0.8 : onIce === "sand" ? 1.15 : 1;
    if (snReady) {
      const now = performance.now();
      const gain = Math.min(0.11, maxSpeed / 15 * 0.11) * gMulS;
      if (now - rollSentAt < 60 && Math.abs(gain - rollSentGain) < 0.008) return;
      rollSentAt = now; rollSentGain = gain;
      SN.setRoll({ gain, freq: (300 + maxSpeed * 70) * fMulS });
      return;
    }
    if (!rollGain || !AC) return;
    const g = Math.min(0.11, maxSpeed / 15 * 0.11) * gMulS;
    rollGain.gain.setTargetAtTime(g, AC.currentTime, 0.06);
    rollFilter.frequency.setTargetAtTime((300 + maxSpeed * 70) * fMulS, AC.currentTime, 0.06);
  }
  function sndCapture() { if (!SFX_ON) return; if (snReady) { SN.play({ name: "capture", rate: 1, vol: 1 }); return; } tone(500, 760, 0.12, 0.25, "sine"); tone(760, 1050, 0.2, 0.2, "triangle", 0.07); }
  function sndPlunk() { if (!SFX_ON) return; if (!throttled("plunk", 120)) return; if (snReady) { SN.play({ name: "plunk", rate: 1, vol: 1 }); return; } tone(240, 110, 0.12, 0.32, "sine"); noiseBurst(0.03, 0.1, 900); }
  function sndRim() { if (!SFX_ON) return; if (!throttled("rim", 90)) return; if (snReady) { SN.play({ name: "rim", rate: 1, vol: 1 }); return; } tone(300, 180, 0.05, 0.2, "triangle"); tone(250, 140, 0.05, 0.16, "triangle", 0.05); noiseBurst(0.03, 0.12, 1200); }
  // gate voice: open = rising metallic slide, close = a heavy iron thunk —
  // state changes speak even when the door is off-fovea (Foundry)
  function sndGate(open, gi) {
    if (!SFX_ON) return; if (!throttled("gate" + (gi || 0), 90)) return;   // per-door: twin boards keep both voices
    if (snReady) { SN.play({ name: open ? "gateOpen" : "gateClose", rate: 1, vol: 1 }); return; }
    if (open) { tone(160, 430, 0.13, 0.22, "triangle"); noiseBurst(0.05, 0.08, 2000); }
    else { tone(150, 58, 0.12, 0.34, "sine"); noiseBurst(0.035, 0.14, 500); }
  }
  // CHIME bumper: each post rings a PENTATONIC note (idx → scale degree) so a
  // bank chain plays a phrase. Pitch rides the post index; a hot hit is louder.
  const PENTA = [1, 1.122, 1.26, 1.498, 1.682];   // major pentatonic ratios
  function sndBump(idx, speed) {
    if (!SFX_ON) return; if (!throttled("bump" + (idx || 0), 55)) return;
    const rate = PENTA[(idx || 0) % 5], vol = Math.min(1, 0.4 + speed / 14);
    if (snReady) { SN.play({ name: "bump", rate, vol }); return; }
    tone(660 * rate, 520 * rate, 0.12, 0.22 * vol, "triangle"); tone(990 * rate, 780 * rate, 0.08, 0.12 * vol, "sine", 0.01);
  }
  function sndWinChord() { if (!SFX_ON) return; if (snReady) { SN.play({ name: "win", rate: 1, vol: 1 }); return; } [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.28, 0.22, "triangle", i * 0.09)); }
  function sndFail() { if (!SFX_ON) return; if (snReady) { SN.play({ name: "fail", rate: 1, vol: 1 }); return; } tone(320, 150, 0.25, 0.3, "triangle"); tone(210, 90, 0.35, 0.26, "triangle", 0.13); }
  function haptic(style) {
    if (!VIBE_ON) return;              // settings: vibration off
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H && H.impact) { H.impact({ style: style === "heavy" ? "HEAVY" : style === "medium" ? "MEDIUM" : "LIGHT" }).catch(() => {}); return; }
    if (navigator.vibrate) try { navigator.vibrate(style === "heavy" ? 35 : style === "medium" ? 20 : 10); } catch (e) {}
  }

  /* ---------- NATIVE audio (SoundNative plugin) — the backgrounding fix ----------
     WKWebView's WebAudio unit dies silently after backgrounding and lies about
     it (state "running", no output) — unfixable from JS after three attempts.
     On device, ALL SFX go through a native AVAudioEngine that owns the audio
     session and restarts itself on real interruption/foreground notifications.
     The samples are the game's own synthesized sounds, rendered ONCE offline
     (OfflineAudioContext is session-independent) and shipped to native as WAV;
     playback varies rate (pitch) and volume per call. Web path = browser only. */
  const SN = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SoundNative;
  let snReady = false, snBooting = false;
  function initNativeAudio() {
    if (!SN) return false;
    if (snReady || snBooting) return true;
    snBooting = true;
    renderAllSamples()
      .then(async samples => {
        for (const smp of samples) await SN.loadSample(smp);
        await SN.start();
        snReady = true;
      })
      .catch(() => { snBooting = false; });   // native boot failed → web fallback
    return true;
  }
  function renderSample(name, dur, build) {
    const sr = 44100;
    const oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, Math.ceil(sr * dur), sr);
    build(oc);
    return oc.startRendering().then(buf => ({ name, wav: wavB64(buf) }));
  }
  function oTone(oc, freq, freq2, dur, vol, type, when) {
    const t = when || 0;
    const o = oc.createOscillator(), g = oc.createGain();
    o.type = type || "triangle";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(oc.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function oNoise(oc, dur, vol, hp, when) {
    const t = when || 0;
    const n = Math.floor(oc.sampleRate * dur);
    const buf = oc.createBuffer(1, n, oc.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 1234567;   // deterministic noise — same sample every boot
    for (let i = 0; i < n; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = ((seed / 4294967296) * 2 - 1) * (1 - i / n); }
    const src = oc.createBufferSource(); src.buffer = buf;
    const f = oc.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
    const g = oc.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(oc.destination);
    src.start(t);
  }
  function wavB64(buf) {
    const d = buf.getChannelData(0), n = d.length;
    const bytes = new Uint8Array(44 + n * 2);
    const dv = new DataView(bytes.buffer);
    const ws = (o, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
    ws(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); ws(8, "WAVE");
    ws(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, buf.sampleRate, true); dv.setUint32(28, buf.sampleRate * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    ws(36, "data"); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, d[i])); dv.setInt16(44 + i * 2, v * 32767, true); }
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(bin);
  }
  function renderAllSamples() {
    return Promise.all([
      renderSample("clack", 0.08, oc => { oTone(oc, 1900, 1350, 0.035, 0.26, "sine"); oNoise(oc, 0.02, 0.14, 3000); }),
      renderSample("clackDead", 0.1, oc => { oTone(oc, 760, 430, 0.045, 0.3, "sine"); oNoise(oc, 0.02, 0.1, 1500); }),
      renderSample("wall", 0.16, oc => { oTone(oc, 120, 65, 0.1, 0.4, "sine"); oNoise(oc, 0.04, 0.2, 700); }),
      renderSample("rim", 0.15, oc => { oTone(oc, 300, 180, 0.05, 0.2, "triangle"); oTone(oc, 250, 140, 0.05, 0.16, "triangle", 0.05); oNoise(oc, 0.03, 0.12, 1200); }),
      renderSample("plunk", 0.2, oc => { oTone(oc, 240, 110, 0.12, 0.32, "sine"); oNoise(oc, 0.03, 0.1, 900); }),
      renderSample("capture", 0.35, oc => { oTone(oc, 500, 760, 0.12, 0.25, "sine"); oTone(oc, 760, 1050, 0.2, 0.2, "triangle", 0.07); }),
      renderSample("bump", 0.2, oc => { oTone(oc, 660, 520, 0.12, 0.22, "triangle"); oTone(oc, 990, 780, 0.08, 0.12, "sine", 0.01); }),
      renderSample("gateOpen", 0.22, oc => { oTone(oc, 160, 430, 0.13, 0.22, "triangle"); oNoise(oc, 0.05, 0.08, 2000); }),
      renderSample("gateClose", 0.2, oc => { oTone(oc, 150, 58, 0.12, 0.34, "sine"); oNoise(oc, 0.035, 0.14, 500); }),
      renderSample("win", 0.66, oc => { [523, 659, 784, 1047].forEach((f, i) => oTone(oc, f, f * 1.01, 0.28, 0.22, "triangle", i * 0.09)); }),
      renderSample("fail", 0.55, oc => { oTone(oc, 320, 150, 0.25, 0.3, "triangle"); oTone(oc, 210, 90, 0.35, 0.26, "triangle", 0.13); }),
      renderSample("roll", 0.5, oc => {
        const n = Math.floor(oc.sampleRate * 0.5);
        const buf = oc.createBuffer(1, n, oc.sampleRate);
        const d = buf.getChannelData(0);
        let seed = 424242;
        for (let i = 0; i < n; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = (seed / 4294967296) * 2 - 1; }
        const src = oc.createBufferSource(); src.buffer = buf; src.connect(oc.destination); src.start(0);
      }),
    ]);
  }

  /* ---------- campaign persistence ---------- */
  const SK = "tilt.campaign.v1";
  function loadSave() { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch (e) { return {}; } }
  function writeSave(o) { try { localStorage.setItem(SK, JSON.stringify(o)); } catch (e) {} }

  /* ---------- game state (tilt-only: one input, one story) ---------- */
  let level = 1, P, won = false, lost = false;

  /* ---------- tilt state ---------- */
  let world = null, tiltPhase = "ready"; // ready → armed → running → done
  // We keep the low-passed 3-axis gravity DIRECTION vector; board gravity is its
  // screen-plane component (gx = 9.8·x, gy = −9.8·y — exact and bounded at EVERY
  // orientation). Never go back to per-axis atan2 angles for this: they divide
  // by z, which vanishes upright — hand jitter swung roll to ±90° and it flipped
  // sign past vertical (device bug: balls frozen with the phone straight up).
  let motV = { x: 0, y: 0, z: -1 };      // gravity direction, device coords, g-units (flat face-up = 0,0,-1)
  let vecOK = false;                      // a 3-axis source is flowing
  let motA = null;                        // orientation-fallback angles {pitch, roll} (radians)
  let devG = null;                        // dev/test override
  const keysHeld = {};                    // desktop: arrows tilt while held
  let motionAttached = false, motionOK = false, motionDenied = false;
  // sign safety valves — flip after a device feel-test if a direction is inverted.
  const FLIP_X = 1, FLIP_Y = 1;
  const PLATFORM_SIGN = /iPhone|iPad|iPod/.test(navigator.userAgent || "") ? 1 : -1;
  function lpVec(x, y, z, a) {
    motV.x += (x - motV.x) * a;
    motV.y += (y - motV.y) * a;
    motV.z += (z - motV.z) * a;
    vecOK = true; motionOK = true;
  }
  function tiltAngles() {
    // pitch: top-of-phone toward/away (0 = flat, +90° = upright portrait)
    // roll:  left/right edge down     (+ = right edge down)
    // roll uses hypot(y,z), NOT -z, as the reference: atan2(x, -z) degenerates
    // to ±90° garbage as the phone nears vertical (z → 0).
    if (vecOK) return {
      pitch: Math.atan2(-motV.y, -motV.z),
      roll: Math.atan2(motV.x, Math.hypot(motV.y, motV.z)),
    };
    if (motA) return motA;
    return { pitch: 0, roll: 0 };
  }
  // NATIVE motion (Capacitor MotionNative plugin → CoreMotion): needs NO permission
  // prompt, EVER — starts at boot so gravity is already flowing before the first
  // tap. The WebKit DeviceMotionEvent path below is only the browser fallback
  // (its permission grant is session-scoped in WKWebView and cost us a regression).
  let nativeTried = false, nativeUp = false;
  function tryNativeMotion() {
    if (nativeTried) return nativeUp;
    nativeTried = true;
    const MN = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MotionNative;
    if (!MN || !MN.addListener || !MN.start) return false;
    nativeUp = true;
    MN.addListener("accel", d => {
      if (!d || d.x == null) return;
      // CoreMotion g-units, iOS device coords (flat face-up z≈-1)
      lpVec(d.x, d.y, d.z, 1 - Math.exp(-(1 / 60) / 0.04));
    });
    MN.start().catch(() => { nativeUp = false; });
    return nativeUp;
  }
  function attachMotion() {
    if (motionAttached) return;
    motionAttached = true;
    window.addEventListener("devicemotion", e => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      // normalize to g-units; PLATFORM_SIGN maps spec engines onto the iOS convention
      let iv = e.interval || 16.7; if (iv < 1) iv *= 1000;
      const a = 1 - Math.exp(-(iv / 1000) / 0.04);
      const s = PLATFORM_SIGN / 9.81;
      lpVec(g.x * s, g.y * s, (g.z == null ? -9.81 : g.z) * s, a);
    });
    // fallback source: orientation angles (some webviews expose one but not the other)
    window.addEventListener("deviceorientation", e => {
      if (vecOK || e.beta == null || e.gamma == null) return;
      motionOK = true;
      const p = e.beta * Math.PI / 180, r = e.gamma * Math.PI / 180;
      if (!motA) motA = { pitch: p, roll: r };
      else { motA.pitch += (p - motA.pitch) * 0.35; motA.roll += (r - motA.roll) * 0.35; }
    });
  }
  function requestMotion() {
    if (motionOK) return;
    if (tryNativeMotion()) return;   // native path: seamless, no prompt — done
    // browser fallback: ask each run until events actually flow — a denied prompt
    // shouldn't latch us dead
    const ask = D => (D && typeof D.requestPermission === "function")
      ? D.requestPermission().catch(() => "denied") : Promise.resolve("granted");
    Promise.all([ask(window.DeviceMotionEvent), ask(window.DeviceOrientationEvent)]).then(rs => {
      attachMotion();   // listeners are harmless either way; events fire only if allowed
      motionDenied = rs.every(s => s !== "granted");
    });
  }
  // ABSOLUTE gravity — the phone's real attitude IS the tray (user call 2026-07:
  // per-run neutral calibration was invisible state that bred "sometimes" bugs —
  // arm at a steep grip and upright lost its pull. Now flat = still, upright =
  // max, every run identical, live from the tap — no gate, no coaching; the
  // feel teaches itself). `cal` survives only as a dev/test hook (setCal); the
  // game never writes it.
  let cal = { pitch: 0, roll: 0 };
  function currentGravity() {
    if (devG) return devG;
    let kx = 0, ky = 0;
    if (keysHeld.L) kx -= 4; if (keysHeld.R) kx += 4;
    if (keysHeld.U) ky -= 4; if (keysHeld.D) ky += 4;
    if (kx || ky) return { gx: kx, gy: ky };
    if (vecOK) {
      // un-rotate by `cal` (identity in real play — dev hook only), then read
      // the screen-plane components. |g| ≤ 9.8 by construction.
      const m = Math.hypot(motV.x, motV.y, motV.z) || 1;
      const x = motV.x / m, y = motV.y / m, z = motV.z / m;
      const cp = Math.cos(cal.pitch), sp = Math.sin(cal.pitch);
      const y1 = y * cp - z * sp, z1 = y * sp + z * cp;
      const cr = Math.cos(cal.roll), sr = Math.sin(cal.roll);
      const x1 = x * cr + z1 * sr;
      return { gx: FLIP_X * 9.8 * x1, gy: FLIP_Y * -9.8 * y1 };
    }
    // orientation-angle fallback (browser only)
    const t = tiltAngles();
    let gx = FLIP_X * 9.8 * Math.sin(t.roll - cal.roll);
    let gy = FLIP_Y * 9.8 * Math.sin(t.pitch - cal.pitch);
    const mg = Math.hypot(gx, gy);
    if (mg > 9.8) { gx *= 9.8 / mg; gy *= 9.8 / mg; }
    return { gx, gy };
  }

  const trayC = $("#tray"), tctx = trayC.getContext("2d");
  let CELL = 40, R = 15, PAD = 10;   // PAD = rim gutter painted on the canvas (render-only)

  function sizeBoards() {
    // ONE big board — the tray gets the full width (and never outgrows the height)
    // Tablets (iPad) scale UP: the board grows to ~78% of the width (capped) so it
    // fills the screen instead of floating phone-sized in a sea of empty space. The
    // #wrap max-width + HUD type scale up to match in a min-width:700 media query.
    const tablet = window.innerWidth >= 700;
    const maxTray = tablet ? Math.min(700, Math.round(window.innerWidth * 0.78)) : 480 - 54;
    const availW = Math.min(window.innerWidth - 54, maxTray);  // wrap padding + .trayframe
    const availH = Math.max(200, window.innerHeight - (tablet ? 400 : 335)); // meta + timer + hint (no footer)
    // floor the tray size: a zero/negative viewport (embedded panes mid-layout,
    // headless first-frame) must never produce a negative CELL/R — clamp + retry
    const traySize = Math.max(120, Math.min(availW, availH));
    // rim gutter (design 2026-07): the rail thickens INWARD by PAD so border-cell
    // hole rings + rim-hugging balls sit fully on the felt. Engine layouts are
    // untouched — pure render geometry; all play art draws translated by PAD.
    PAD = Math.max(9, Math.round(traySize * 0.03));
    CELL = Math.floor((traySize - 2 * PAD) / N);
    const tpx = CELL * N + 2 * PAD;
    trayC.width = tpx; trayC.height = tpx; trayC.style.width = tpx + "px"; trayC.style.height = tpx + "px";
    R = CELL * 0.36;
    if (P) draw();
  }

  function startLevel(n) {
    level = Math.max(1, Math.min(n | 0 || 1, E.LAST_LEVEL));
    n = level;
    P = E.build(n);
    if (!P) { flashHint("Could not build this level — try again."); return; }
    won = false;
    track("level_start", { level: n });
    const sv = loadSave();
    sv.level = Math.max(sv.level || 1, n);
    writeSave(sv);
    $("#ov").classList.remove("show", "deadend");
    buildWorld();
    updateHUD();
    draw();
    showOnboarding();
    // first launch ever: show the animated how-to card once
    const wNow = E.worldFor(n);
    if (!sv.tutSeen) {
      showTutorial(() => { const s = loadSave(); s.tutSeen = 1; writeSave(s); showOnboarding(); });
    } else if (wNow.id > 1 && !(sv.worldSeen || {})[wNow.id]) {
      // a WORLD's debut gets its intro card once (palette + live element demo).
      // Entering a later world also retires EARLIER mechanics' intro cards
      // (Qi feedback: no re-teaching walls in W2 — seen-in-spirit stays seen).
      showWorldIntro(wNow, () => { const s = loadSave(); s.worldSeen = s.worldSeen || {}; s.worldSeen[wNow.id] = 1; s.wallsSeen = 1; writeSave(s); showOnboarding(); });
    } else if ((P.walls || []).length && !sv.wallsSeen && wNow.id === 1) {
      // a mechanic's intro card fires ONLY in its debut world (design 6b)
      showMechanicIntro(() => { const s = loadSave(); s.wallsSeen = 1; writeSave(s); showOnboarding(); });
    }
  }
  /* ---------- run-scoped FEAT tracking (depth plan Phase 0) ----------
     Pure event listeners over the physics events — zero new physics. Feats are
     judged per RUN and persisted on a win (once earned on a level, kept forever,
     like medals). no-clack = marbles never collided; zero-lodge = never plunked
     a wrong cup; no-stop = after the first real motion, the loose marbles never
     all rested before the last capture. */
  let runClacks = 0, runPlunks = 0, runMoved = false, runStopped = false, stopT = 0;
  // gem state for THIS level: {x,y,c,got} from the deterministic engine placement;
  // null when the level has no gem or it was already collected on a past run.
  let gem = null;
  function featDefs() {
    const defs = [];
    if (P.init.marbles.length >= 2) defs.push({ id: "c", name: "NO-CLACK", desc: "never hit another marble" });
    defs.push({ id: "l", name: "ZERO-LODGE", desc: "never plugged a wrong hole" });
    defs.push({ id: "s", name: "NO-STOP", desc: "never came to rest" });
    return defs;
  }
  function runFeats() {   // feat id → earned THIS run
    return { c: runClacks === 0, l: runPlunks === 0, s: runMoved && !runStopped };
  }
  // physics world in CELL units (resize-proof; rendering scales by CELL).
  // Per-world PARAM plumbing (depth plan Phase 1): the level's world may retune
  // ≤2 physics params (E.WORLDS[..].params, merged over defaults by createWorld;
  // W1 = {}). The pinned physics-tests keep every world escapable + tunnel-free.
  function buildWorld() {
    world = PH.createWorld({
      w: N, h: N, pad: 0, unit: 1,
      marbles: P.init.marbles.map(m => ({ x: m.x + 0.5, y: m.y + 0.5, r: 0.36, c: m.c })),
      holes: P.holesArr.map(h => ({ x: h.x + 0.5, y: h.y + 0.5, r: 0.42, c: h.c })),
      blocks: (P.walls || []).map(b => ({ x: b.x, y: b.y, w: 1, h: 1 })),
      slopes: (P.slopes || []).map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h,
        ax: s.a === "H" ? 1 : 0, ay: s.a === "H" ? 0 : 1 })),
      zones: (P.zones || []).map(z => ({ x: z.x, y: z.y, w: z.w, h: z.h, kind: E.worldFor(level).zoneKind || "ice" })),
      // pocketColor = the sealed pocket hole this gate guards (its sole orthogonal
      // neighbour that is a hole). Passed to the physics so ONLY that colour's ball
      // may pass through the gate — a wrong ball can never enter the dead-end pocket.
      gates: (P.gates || []).map(g => {
        const pocket = (P.holesArr || []).find(h =>
          Math.abs(h.x - g.x) + Math.abs(h.y - g.y) === 1);
        return { x: g.x, y: g.y, px: g.px, py: g.py, pocketColor: pocket ? pocket.c : null };
      }),
      posts: (P.posts || []).map(pp => ({ x: pp.x + 0.5, y: pp.y + 0.5, r: 0.34 })),
      params: E.worldFor(level).params,
    });
    curHoleSocket = E.worldFor(level).id === 3;   // CHIME holes are recessed sockets, not neon orbs
    tiltPhase = "ready";
    watchdogShown = false; restChecked = false;
    lastCaptureT = 0;
    lost = false; stuckHint = false; deadInfo = null;
    pocketStuckSince = 0; pocketOffered = false;
    gateBlockFx = {}; gateContact = new Set();   // gate colour-lock flash (gateRuleHintShown persists — teach once)
    try { const hn = $("#hint"); hn.onclick = null; hn.style.pointerEvents = "none"; } catch (e) {}
    rollAng.length = 0; rollHead.length = 0;
    runClacks = 0; runPlunks = 0; runMoved = false; runStopped = false; stopT = 0;
    const sv = loadSave();
    const g = E.gemFor(level, P);
    gem = (g && !(sv.gems || {})[level]) ? { x: g.x, y: g.y, c: g.c, got: false } : null;
    updateTimePill();
  }
  function showOnboarding() {
    const zk = (P.zones || []).length > 0 ? (E.worldFor(level).zoneKind || "ice") : null;
    const postsNew = (P.posts || []).length > 0 && level <= 48;   // posts debut at L46 (Chime teach block)
    const gatesNew = (P.gates || []).length > 0 && level <= 33;   // gates debut at L31 (Foundry teach block)
    const sandNew = zk === "sand" && level <= 36;                 // (dormant — Dune cut)
    const iceNew = zk === "ice" && level <= 36;                   // (dormant — Rime cut)
    const wallsNew = (P.walls || []).length > 0 && level <= 6;    // walls debut around L4
    const slopesNew = (P.slopes || []).length > 0 && level <= 8;  // slopes debut around L6
    if (postsNew) flashHint("<b>Posts!</b> Bank off them to reach the socket", 0, "post");
    else if (gatesNew) flashHint("<b>Gates!</b> Park a marble on the plate", 0, "gate");
    else if (sandNew) flashHint("<b>Sand!</b> Fast lines die here", 0, "sand");
    else if (iceNew) flashHint("<b>Ice!</b> No stopping — commit the line", 0, "ice");
    else if (slopesNew) flashHint("<b>New: hills.</b> Bring speed over the ridge", 0, "hill");
    else if (wallsNew) flashHint("<b>Walls!</b> Bank shots off them", 0, "wall");
    else flashHint("<b>Tap the tray</b>, then tilt", 0, "tilt");
  }
  function updateHUD() {
    $("#lvlN").textContent = level;
    const sv = loadSave();
    const b = bestFor(sv, level), m = bestMedal(sv, level);
    // best time + a persistent medal pip so "chase gold" is always visible
    $("#bestLab").innerHTML = b
      ? `BEST ${b.toFixed(1)}s${m ? ` <span style="color:${MEDAL_COL[m]}">●</span>` : ""}`
      : "FIRST RUN";
  }

  /* ---------- drawing ---------- */
  function key(x, y) { return x + "," + y; }
  // Crisp flat-graphic hole: clean dark disc + bright colored ring + dimple.
  // (A gradient-heavy "3D cup" treatment was tried and REVERTED — wide soft
  // gradients at this size read as BLUR, not depth. If real depth is ever
  // wanted, the path is tight gradients/hard edges or pre-rendered sprites,
  // not more canvas soft-shading.)
  let curHoleSocket = false;   // CHIME: draw holes as recessed sockets (set per board)
  function roundedHole(ctx, x, y, c, r) {
    ctx.save();
    if (curHoleSocket) {
      // recessed metal SOCKET (design: a bloomed neon orb reads as a second
      // ball beside the ball-sized posts) — dark cup, thin colour rim, inner lip
      const g = ctx.createRadialGradient(x, y - r * 0.25, r * 0.15, x, y, r * 1.06);
      g.addColorStop(0, "#04050d"); g.addColorStop(1, "#171b30");
      ctx.beginPath(); ctx.arc(x, y, r * 1.06, 0, 7); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 2.6; ctx.strokeStyle = c; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(x, y, r * 1.02, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.5; ctx.lineWidth = 3; ctx.strokeStyle = "#00000070";
      ctx.beginPath(); ctx.arc(x, y + r * 0.14, r * 0.66, 0.1, Math.PI - 0.1); ctx.stroke();
      ctx.restore(); return;
    }
    ctx.beginPath();
    ctx.arc(x, y, r * 1.1, 0, 7);
    ctx.fillStyle = "#070918";
    ctx.fill();
    ctx.shadowColor = c; ctx.shadowBlur = 12;      // soft neon halo
    ctx.lineWidth = 5;
    ctx.strokeStyle = c;               // bright ring — the goal must read at a glance
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, 7);      // colored dimple at the bottom of the hole
    ctx.fillStyle = c + "30";
    ctx.fill();
    ctx.restore();
  }
  function marbleGrad(ctx, x, y, c, r) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.42, r * 0.08, x, y, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.16, shade(c, 60));
    g.addColorStop(0.55, c);
    g.addColorStop(1, shade(c, -70));
    return g;
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* ---------- marble skins (depth plan Phase 0 — cosmetics, never bought) ----------
     A skin is a FINISH, not a recolor — the marble's colour identity (its match)
     must stay legible, so every skin only layers highlights/rims over the same
     base gradient. Earned by medals, feats, gems; equipped skin persists in the
     save and applies everywhere marbles draw (board + tutorial + collection). */
  function featCount(sv) { let n = 0; const f = sv.feats || {}; for (const L in f) for (const k in f[L]) if (f[L][k]) n++; return n; }
  function goldCount(sv) { let n = 0; const md = sv.medal || {}; for (const L in md) if (md[L] === "gold" || md[L] === "diamond") n++; return n; }
  function gemCount(sv) { return Object.keys(sv.gems || {}).length; }
  const GEM_TOTAL = (() => { let n = 0; for (let L = 1; L <= E.LAST_LEVEL; L++) if (E.hasGem(L)) n++; return n; })();
  const SKINS = [
    { id: "classic", name: "Classic", cond: "always yours", need: () => true },
    { id: "pearl", name: "Pearl", cond: "earn 15 feats", need: sv => featCount(sv) >= 15 },
    { id: "gilded", name: "Gilded", cond: "gold on all " + E.LAST_LEVEL + " levels", need: sv => goldCount(sv) >= E.LAST_LEVEL },
    { id: "prism", name: "Prism", cond: "find all " + GEM_TOTAL + " gems", need: sv => gemCount(sv) >= GEM_TOTAL },
  ];
  let skinFx = "classic";
  function applySkin() { const sv = loadSave(); skinFx = SKINS.some(s => s.id === sv.skin) ? sv.skin : "classic"; }
  function drawSkinFx(c, px, py, r) {
    if (skinFx === "pearl") {
      // milky sheen: broad soft top-light + a cool rim glow
      const g = c.createRadialGradient(px - r * 0.2, py - r * 0.5, r * 0.05, px, py, r);
      g.addColorStop(0, "rgba(255,255,255,0.5)"); g.addColorStop(0.5, "rgba(255,255,255,0.12)"); g.addColorStop(1, "rgba(255,255,255,0)");
      c.beginPath(); c.arc(px, py, r, 0, 7); c.fillStyle = g; c.fill();
      c.lineWidth = 1.4; c.strokeStyle = "rgba(255,255,255,0.45)";
      c.beginPath(); c.arc(px, py, r - 0.8, 0, 7); c.stroke();
    } else if (skinFx === "gilded") {
      // gold band + a warm spark at 10 o'clock
      c.lineWidth = 1.8; c.strokeStyle = "rgba(255,198,62,0.9)";
      c.beginPath(); c.arc(px, py, r - 0.9, 0, 7); c.stroke();
      c.beginPath(); c.arc(px - r * 0.45, py - r * 0.1, r * 0.11, 0, 7); c.fillStyle = "#ffe9a8"; c.fill();
    } else if (skinFx === "prism") {
      // spectral rim: hue sweeps around the band — reads as iridescence
      for (let i = 0; i < 6; i++) {
        c.strokeStyle = "hsla(" + (i * 60) + ",90%,70%,0.55)";
        c.lineWidth = 1.6;
        c.beginPath(); c.arc(px, py, r - 0.9, i * 1.047 - 0.6, i * 1.047 + 0.62); c.stroke();
      }
      c.beginPath(); c.arc(px + r * 0.4, py + r * 0.25, r * 0.09, 0, 7); c.fillStyle = "#ffffffd0"; c.fill();
    }
  }

  // the rim gutter, painted on the canvas: outer rail band + inset felt, so edge
  // holes/balls have room inside the felt (the DOM .trayframe is the outer bevel).
  function paintRim() {
    const w = trayC.width, hgt = trayC.height;
    const g = tctx.createLinearGradient(0, 0, 0, hgt);
    g.addColorStop(0, "#272e66"); g.addColorStop(1, "#1b2150");
    roundRectPath(tctx, 0, 0, w, hgt, 15); tctx.fillStyle = g; tctx.fill();
    const f = tctx.createLinearGradient(0, PAD, 0, hgt - PAD);
    f.addColorStop(0, "#171c46"); f.addColorStop(1, "#0f1233");
    roundRectPath(tctx, PAD, PAD, w - 2 * PAD, hgt - 2 * PAD, 10);
    tctx.fillStyle = f; tctx.fill();
    tctx.lineWidth = 1.5; tctx.strokeStyle = "#0a0d26"; tctx.stroke();
    tctx.strokeStyle = "#ffffff12"; tctx.lineWidth = 1;
    tctx.beginPath(); tctx.moveTo(16, 1); tctx.lineTo(w - 16, 1); tctx.stroke();
  }
  function drawGridBg() {
    tctx.clearRect(0, 0, trayC.width, trayC.height);
    paintRim();
    tctx.save(); tctx.translate(PAD, PAD);   // play space begins inside the rim
    tctx.fillStyle = "#ffffff0f";       // grid = dots at intersections (quieter than lines)
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      tctx.beginPath(); tctx.arc(i * CELL, j * CELL, 1.4, 0, 7); tctx.fill();
    }
    drawZones();
    drawSlopes();
    drawBlocks();
    tctx.restore();
  }
  // ZONES — BEACH SAND v4 (design 2026-07-12, user reference #2): warm
  // peach-tan radial, ~900 ultra-fine salt-and-pepper specks (5 tones), 3
  // barely-there mottle patches, ~8 quiet shell flecks. NO hollows/clumps/
  // marks. Rendered ONCE into an offscreen cache and blitted per frame — a
  // thousand arc() fills per rAF is exactly the jank class we just fixed.
  // (ICE painter kept in the cache renderer — dormant, Rime cut.)
  let zoneCv = null, zoneCvKey = "";
  function zoneHash(a, b) { let h = (a * 374761393 + b * 668265263) ^ 0x5bf03635; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0); }
  function renderZoneCache() {
    const px = CELL * N;
    zoneCv = document.createElement("canvas");
    zoneCv.width = px; zoneCv.height = px;
    const c = zoneCv.getContext("2d");
    const kind = E.worldFor(level).zoneKind || "ice";
    for (let zi = 0; zi < P.zones.length; zi++) {
      const z = P.zones[zi];
      const x = z.x * CELL, y = z.y * CELL, w = z.w * CELL, h = z.h * CELL;
      const rr = Math.max(5, CELL * 0.16);
      c.save();
      roundRectPath(c, x + 1.5, y + 1.5, w - 3, h - 3, rr);
      c.clip();
      if (kind === "sand") {
        // warm peach-tan radial: bright heart, deeper edges
        const cx = x + w / 2, cy = y + h / 2;
        const rad = c.createRadialGradient(cx, cy, Math.min(w, h) * 0.1, cx, cy, Math.hypot(w, h) * 0.62);
        rad.addColorStop(0, "#f0d6a6"); rad.addColorStop(0.55, "#e4c48e"); rad.addColorStop(1, "#d0ac72");
        c.fillStyle = rad; c.fillRect(x, y, w, h);
        const seed0 = zoneHash(z.x * 31 + z.y, z.w * 17 + z.h);
        // 3 barely-there large mottle patches
        for (let k = 0; k < 3; k++) {
          const hh = zoneHash(seed0, k + 101);
          const mx = x + (hh % 1000) / 1000 * w, my = y + ((hh >> 10) % 1000) / 1000 * h;
          const mr = CELL * (0.6 + ((hh >> 20) % 100) / 200);
          const mg = c.createRadialGradient(mx, my, 0, mx, my, mr);
          mg.addColorStop(0, "rgba(165,128,74,0.055)"); mg.addColorStop(1, "rgba(165,128,74,0)");
          c.fillStyle = mg; c.beginPath(); c.arc(mx, my, mr, 0, 7); c.fill();
        }
        // even ULTRA-FINE salt-and-pepper stipple (~110/cell at reference scale)
        const TONES = ["#fff3d6", "#f4dcae", "#c9a266", "#a5804a", "#8f6f42"];
        const scale = CELL / 44;
        const n = Math.round(110 * z.w * z.h * Math.min(1.6, scale * scale));
        for (let k = 0; k < n; k++) {
          const hh = zoneHash(seed0, k);
          const sx = x + (hh % 4096) / 4096 * w;
          const sy = y + ((hh >> 12) % 4096) / 4096 * h;
          const t = TONES[hh % 5];
          const rP = (0.3 + ((hh >> 7) % 100) / 200) * scale;   // 0.3–0.8px
          c.globalAlpha = 0.08 + ((hh >> 3) % 100) / 455;       // .08–.30
          c.beginPath(); c.arc(sx, sy, Math.max(0.3, rP), 0, 7);
          c.fillStyle = t; c.fill();
        }
        c.globalAlpha = 1;
        // ~8 quiet shell flecks
        for (let k = 0; k < 8; k++) {
          const hh = zoneHash(seed0, k + 900);
          const sx = x + (hh % 1000) / 1000 * w, sy = y + ((hh >> 10) % 1000) / 1000 * h;
          c.globalAlpha = 0.32;
          c.beginPath(); c.arc(sx, sy, (1.1 + (hh % 3) * 0.35) * scale, 0, 7);
          c.fillStyle = hh % 2 ? "#fff6e0" : "#fff3d6"; c.fill();
        }
        c.globalAlpha = 1;
      } else {
        // frosted glass (dormant ice look)
        const g = c.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, "#9fd8ff2e"); g.addColorStop(0.5, "#cdeeff3d"); g.addColorStop(1, "#9fd8ff2e");
        c.fillStyle = g; c.fillRect(x, y, w, h);
        c.strokeStyle = "#e8f7ff66"; c.lineWidth = 2; c.lineCap = "round";
        const horiz = w >= h, len = horiz ? w : h;
        for (let i = 0; i < 3; i++) {
          const f = (i + 0.6) / 3.4;
          c.beginPath();
          if (horiz) { const sx = x + len * f; c.moveTo(sx - CELL * 0.22, y + h * 0.72); c.lineTo(sx + CELL * 0.22, y + h * 0.24); }
          else { const sy = y + len * f; c.moveTo(x + w * 0.28, sy + CELL * 0.22); c.lineTo(x + w * 0.72, sy - CELL * 0.22); }
          c.stroke();
        }
      }
      c.restore();
      // quiet rim seats the surface into the felt (no hard mark)
      c.strokeStyle = kind === "sand" ? "#a5804a44" : "#bfe9ff59"; c.lineWidth = 1.5;
      roundRectPath(c, x + 1.5, y + 1.5, w - 3, h - 3, rr);
      c.stroke();
    }
  }
  function drawZones() {
    if (!P || !P.zones || !P.zones.length) return;
    const key = level + ":" + CELL;
    if (!zoneCv || zoneCvKey !== key) { renderZoneCache(); zoneCvKey = key; }
    tctx.drawImage(zoneCv, 0, 0);
  }
  // HILL rendering (lab v2 — corrected projection): the peak is NEAREST the
  // camera, so it MAGNIFIES — checker rows are widest at the ridge and
  // compress toward the ends; the silhouette is a lens/pillow (ends slightly
  // narrower), NEVER a bow-tie (v1 pinched the ridge as if it were far away —
  // inverted geometry, read as cinched fabric on device). Two-tone lit/shadow
  // faces, soft ridge highlight, cast shadow seats it on the floor.
  function drawSlopes() {
    if (!P || !P.slopes) return;
    const mix = (c1, c2, t) => {
      const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
      const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
      const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
      const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
      return "rgb(" + r + "," + g + "," + bl + ")";
    };
    for (const sl of P.slopes) {
      const x = sl.x * CELL, y = sl.y * CELL, w = sl.w * CELL, h = sl.h * CELL;
      const horiz = sl.a === "H";
      const half = (horiz ? w : h) / 2;
      const K = 0.38, B = 0.16;                    // ridge magnification, end narrowing
      const pos = u => half * ((1 + K) * u - K * u * u);
      const wid = u => 1 - B * u;
      const pt = (f, u, c) => {
        const a = pos(u), o = c * wid(u);
        if (horiz) return [x + w / 2 + f * a, y + h / 2 + o * h];
        return [x + w / 2 + o * w, y + h / 2 + f * a];
      };
      const quad = (f, u0, u1, c0, c1) => {
        const p0 = pt(f, u0, c0), p1 = pt(f, u1, c0), p2 = pt(f, u1, c1), p3 = pt(f, u0, c1);
        tctx.beginPath(); tctx.moveTo(p0[0], p0[1]); tctx.lineTo(p1[0], p1[1]);
        tctx.lineTo(p2[0], p2[1]); tctx.lineTo(p3[0], p3[1]); tctx.closePath();
      };
      tctx.save();
      tctx.beginPath(); tctx.rect(x + 1, y + 1, w - 2, h - 2); tctx.clip();
      tctx.fillStyle = "#161a2c"; tctx.fillRect(x, y, w, h);
      const SUB = 3;                                // sub-rows keep the magnification smooth
      const rows = (horiz ? sl.w : sl.h) * SUB, cols = (horiz ? sl.h : sl.w) * 2;
      for (const f of [-1, 1]) {
        const lit = f < 0;
        const hiA = lit ? "#8a97dd" : "#4a548e", hiB = lit ? "#6b79bd" : "#3a4374";
        const loA = "#1d2338", loB = "#161b2e";
        for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) {
          const t = (r + 0.5) / rows;
          quad(f, r / rows, (r + 1) / rows, cc / cols - 0.5, (cc + 1) / cols - 0.5);
          const checker = (Math.floor(r / (SUB / 2)) + cc) % 2;
          tctx.fillStyle = checker ? mix(hiB, loB, t) : mix(hiA, loA, t);
          tctx.fill();
        }
      }
      // ridge: soft highlight band (the peak catches light) + fine crisp line
      const q0 = pt(-1, 0.22, -0.5), q1 = pt(1, 0.22, -0.5), q2 = pt(1, 0.22, 0.5), q3 = pt(-1, 0.22, 0.5);
      const rg = horiz
        ? tctx.createLinearGradient(q0[0], 0, q1[0], 0)
        : tctx.createLinearGradient(0, q0[1], 0, q1[1]);
      rg.addColorStop(0, "rgba(190,200,245,0)");
      rg.addColorStop(0.5, "rgba(200,212,255,0.28)");
      rg.addColorStop(1, "rgba(190,200,245,0)");
      tctx.fillStyle = rg;
      tctx.beginPath(); tctx.moveTo(q0[0], q0[1]); tctx.lineTo(q1[0], q1[1]);
      tctx.lineTo(q2[0], q2[1]); tctx.lineTo(q3[0], q3[1]); tctx.closePath(); tctx.fill();
      tctx.strokeStyle = "rgba(215,225,255,0.75)"; tctx.lineWidth = 1.5; tctx.lineCap = "round";
      tctx.beginPath();
      if (horiz) { tctx.moveTo(x + w / 2, y + 3); tctx.lineTo(x + w / 2, y + h - 3); }
      else { tctx.moveTo(x + 3, y + h / 2); tctx.lineTo(x + w - 2, y + h / 2); }
      tctx.stroke();
      // shadow-side base seam
      tctx.strokeStyle = "rgba(0,0,0,0.5)"; tctx.lineWidth = 2;
      tctx.beginPath();
      if (horiz) { tctx.moveTo(x + 2, y + h - 1.5); tctx.lineTo(x + w - 2, y + h - 1.5); }
      else { tctx.moveTo(x + w - 1.5, y + 2); tctx.lineTo(x + w - 1.5, y + h - 2); }
      tctx.stroke();
      tctx.restore();
      // cast shadow on the floor beyond the shadow side (light from top-left)
      tctx.fillStyle = "rgba(0,0,0,0.30)";
      if (horiz) tctx.fillRect(x + 3, y + h, w - 6, 3);
      else tctx.fillRect(x + w, y + 3, 3, h - 6);
    }
  }
  function drawBlocks() {
    if (!P || !P.walls) return;
    // real-block walls (design 2026-07-12, ported from the reference build);
    // ADJACENT CELLS MERGE into one continuous run: zero inset + square corners
    // on shared edges, front lip only at the bottom of a run, gloss only at its
    // top, shadow only under the bottom cell — no felt gap inside a wall.
    // Freestanding blocks keep rounded corners + breathing room. The 1.5px
    // seam reads as mortar.
    const wset = new Set(P.walls.map(q => q.x + "," + q.y));
    const rrC = (x2, y2, w2, h2, tl, tr, br, bl) => {
      tctx.beginPath();
      tctx.moveTo(x2 + tl, y2);
      tctx.arcTo(x2 + w2, y2, x2 + w2, y2 + h2, tr);
      tctx.arcTo(x2 + w2, y2 + h2, x2, y2 + h2, br);
      tctx.arcTo(x2, y2 + h2, x2, y2, bl);
      tctx.arcTo(x2, y2, x2 + w2, y2, tl);
      tctx.closePath();
    };
    for (const b of P.walls) {
      const x = b.x * CELL, y = b.y * CELL, s = CELL, rr = Math.max(3, CELL * 0.12);
      const nb = {
        u: wset.has(b.x + "," + (b.y - 1)), d: wset.has(b.x + "," + (b.y + 1)),
        l: wset.has((b.x - 1) + "," + b.y), r: wset.has((b.x + 1) + "," + b.y),
      };
      const m = 1.5, lift = Math.max(4, s * 0.16);
      const L = nb.l ? 0 : m, R = nb.r ? 0 : m, T = nb.u ? 0 : m, B = nb.d ? 0 : m;
      const bx = x + L, bw = s - L - R;
      const tl = (nb.u || nb.l) ? 0 : rr, tr = (nb.u || nb.r) ? 0 : rr;
      const br = (nb.d || nb.r) ? 0 : rr, bl = (nb.d || nb.l) ? 0 : rr;
      if (!nb.d) { // shadow only under the bottom of a run
        tctx.fillStyle = "#00000066";
        rrC(bx + 1.5, y + T + 3.5, bw, s - T - B - 2, tl, tr, br, bl); tctx.fill();
      }
      const gb = tctx.createLinearGradient(x, y, x, y + s);
      gb.addColorStop(0, "#262c60"); gb.addColorStop(1, "#151a40");
      tctx.fillStyle = gb;
      rrC(bx, y + T, bw, s - T - B, tl, tr, br, bl); tctx.fill();        // body = front face
      const faceH = nb.d ? s - T : s - T - lift;                          // face runs through shared edges
      const gt = tctx.createLinearGradient(x, y, x, y + faceH);
      gt.addColorStop(0, "#5b67ba"); gt.addColorStop(1, "#3a4390");
      tctx.fillStyle = gt;
      rrC(bx, y + T, bw, faceH, tl, tr, nb.d ? 0 : br, nb.d ? 0 : bl); tctx.fill(); // raised top face
      tctx.lineWidth = 1.5; tctx.strokeStyle = "#7c89dd";
      rrC(bx, y + T, bw, faceH, tl, tr, nb.d ? 0 : br, nb.d ? 0 : bl); tctx.stroke();
      if (!nb.u) { // gloss strip only on the top block of a run
        rrC(bx + 3, y + T + 2.5, bw - 6, faceH * 0.3, rr * 0.6, rr * 0.6, rr * 0.6, rr * 0.6);
        tctx.fillStyle = "#ffffff30"; tctx.fill();
      }
    }
  }
  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  // Shared marble/board renderers — the TUTORIAL uses these too (same ctx-param
  // primitives + the same physics = perfectly consistent motion and look).
  function drawMarbleAt(c, px, py, col, r, locked, roll) {
    c.beginPath(); c.ellipse(px, py + r * 0.55, r * 0.85, r * 0.5, 0, 0, 7); c.fillStyle = "#00000052"; c.fill();
    c.beginPath(); c.arc(px, py, r, 0, 7);
    c.fillStyle = marbleGrad(c, px, py, col, r);
    c.fill();
    c.lineWidth = 1.2; c.strokeStyle = shade(col, -85) + "88"; c.stroke();
    drawSkinFx(c, px, py, r);   // equipped cosmetic finish (colour identity untouched)
    // rolling-texture cue: a dark swirl revolving with the roll — without it the
    // marble reads as a sliding puck no matter how good the dynamics are
    if (roll && Math.cos(roll.ang) > 0) {
      const k = Math.cos(roll.ang);
      const off = Math.sin(roll.ang) * r * 0.45;
      const sx = px + Math.cos(roll.head) * off, sy = py + Math.sin(roll.head) * off;
      c.save();
      c.beginPath(); c.arc(px, py, r * 0.96, 0, 7); c.clip();
      c.globalAlpha = 0.22 * k;
      c.beginPath(); c.arc(sx, sy, r * 0.34, 0, 7); c.fillStyle = "#1a1030"; c.fill();
      c.restore();
      c.globalAlpha = 1;
    }
    if (locked) {
      c.lineWidth = 2.5; c.strokeStyle = col; c.stroke();
      c.beginPath(); c.arc(px, py, r * 1.25, 0, 7); c.strokeStyle = col + "40"; c.lineWidth = 3; c.stroke();
    }
    c.beginPath(); c.arc(px - r * 0.3, py - r * 0.36, r * 0.2, 0, 7); c.fillStyle = "#ffffffe8"; c.fill();
    c.beginPath(); c.arc(px - r * 0.05, py - r * 0.52, r * 0.09, 0, 7); c.fillStyle = "#ffffff90"; c.fill();
  }
  // a captured ball: no drop shadow, darkened, and the hole's rim ring re-stroked
  // OVER its edge — it is IN the recess, under the lip
  function drawRecessedAt(c, px, py, col, r, ringX, ringY, ringR) {
    c.beginPath(); c.arc(px, py, r, 0, 7);
    c.fillStyle = marbleGrad(c, px, py, col, r);
    c.fill();
    c.fillStyle = "rgba(0,0,0,0.32)";
    c.beginPath(); c.arc(px, py, r, 0, 7); c.fill();
    c.lineWidth = 3; c.strokeStyle = col + "cc";
    c.beginPath(); c.arc(ringX, ringY, ringR, 0, 7); c.stroke();
  }
  // draw any physics world into any ctx at a given cell scale — the ONE renderer
  // for the game board and the tutorial demo alike
  function drawWorld(c, w, S, rolls) {
    for (const h of w.holes) roundedHole(c, h.x * S, h.y * S, SKIN[h.c], S * 0.36);
    w.marbles.forEach(m => {
      if (!m.captured) return;
      const rp = PH.renderPos(w, m);
      drawRecessedAt(c, rp.x * S, rp.y * S, SKIN[m.c], S * 0.36 * rp.scale,
        (m.sink ? m.sink.toX : m.x) * S, (m.sink ? m.sink.toY : m.y) * S, S * 0.36 * 1.04);
    });
    w.marbles.forEach((m, i) => {
      if (m.captured) return;
      const rp = PH.renderPos(w, m);
      let dip = 0;
      for (const h of w.holes) {
        if (h.filled) continue;
        const wellR = h.r + m.r * 0.5;
        const d = Math.hypot(m.x - h.x, m.y - h.y);
        if (d < wellR) { const t = 1 - d / wellR; if (t > dip) dip = t; }
      }
      // hill lift: a ball crossing a bump rises toward the camera — slightly
      // bigger and shifted up at the ridge, back to normal at the ends
      // (continuous at the patch edges, so it never pops)
      let lift = 0;
      for (const sl of (w.slopes || [])) {
        if (m.x >= sl.x && m.x <= sl.x + sl.w && m.y >= sl.y && m.y <= sl.y + sl.h) {
          const half = sl.ax ? sl.w / 2 : sl.h / 2;
          const t = sl.ax ? Math.abs(m.x - (sl.x + sl.w / 2)) : Math.abs(m.y - (sl.y + sl.h / 2));
          const e = 1 - t / half;
          if (e > lift) lift = e;
        }
      }
      drawMarbleAt(c, rp.x * S, rp.y * S - lift * S * 0.16, SKIN[m.c],
        S * 0.36 * rp.scale * (1 - 0.16 * dip) * (1 + 0.18 * lift), false,
        rolls && rolls.ang[i] != null ? { ang: rolls.ang[i], head: rolls.head[i] || 0 } : null);
    });
  }
  /* wrong-hole made VISIBLE on the board (design 6a): the lodged ball pulses a
     ring in its own color and gold chevrons march toward its MATCHING hole —
     you see WHICH ball is stuck and WHERE it belongs. This is a DESTINATION
     pointer — it aims straight at the ball's OWN colour hole (a diagonal is right
     when that's where the hole is), NOT a "which way to tilt" arrow (the "Tilt
     HARD to pop it out!" banner already covers freeing it).
     REGRESSION FIXED 2026-07-05: game.js had drifted from the design to snapping
     the arrow to an open *tilt* cardinal — so a white ball plugging the green cup,
     whose white home sat one row up behind a wall, got sent LEFT to the yellow
     hole. Restored to the design's straight-at-the-matching-hole aim. Draw-pass
     overlay only; costs nothing when nothing is lodged. Same test as lodgedCount(). */
  // Angle from a lodged ball to the empty hole it belongs in (radians), or null
  // when that matching hole is already filled/absent. Straight at the home hole.
  function homeAngle(m) {
    for (const h of world.holes) if (!h.filled && h.c === m.c) return Math.atan2(h.y - m.y, h.x - m.x);
    return null;
  }
  function drawLodgedWarnings() {
    if (tiltPhase !== "running" || won || lost) return;
    const t = world.t, pulse = 0.5 + 0.5 * Math.sin(t * 6);
    for (const m of world.marbles) {
      if (m.captured) continue;
      let wedged = false;
      for (const h of world.holes) {
        if (h.filled || h.c === m.c) continue;
        if (Math.hypot(m.x - h.x, m.y - h.y) < h.r * world.params.captureFrac * 1.4) { wedged = true; break; }
      }
      if (!wedged) continue;
      const home = world.holes.find(h => !h.filled && h.c === m.c);   // its matching hole
      const px = m.x * CELL, py = m.y * CELL;
      // pulsing ring in the ball's colour — WHICH ball is stuck
      tctx.save();
      tctx.beginPath(); tctx.arc(px, py, R * (1.4 + 0.28 * pulse), 0, 7);
      tctx.strokeStyle = SKIN[m.c]; tctx.globalAlpha = 0.35 + 0.45 * pulse; tctx.lineWidth = 3.5;
      tctx.stroke(); tctx.restore();
      if (!home) continue;
      // gold chevrons straight at the matching hole — WHERE IT BELONGS (the only
      // on-board arrow; "how to tilt" lives in the bottom banner glyph, not here)
      const ang = Math.atan2(home.y - m.y, home.x - m.x);
      const reach = Math.hypot(home.x - m.x, home.y - m.y) * CELL - home.r * CELL * 0.6;
      const ph = (t * 1.8) % 1, nx = Math.cos(ang), ny = Math.sin(ang), ox = -ny, oy = nx;
      tctx.save();
      tctx.lineWidth = 4; tctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const a = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, ph * 1.4 - i * 0.18)))) * 0.95;
        if (a <= 0) continue;
        const d = R * (2.9 + i * 1.1 + ph * 1.3);
        if (d > reach) continue;
        const cx = px + nx * d, cy = py + ny * d;
        tctx.strokeStyle = "rgba(255,198,62," + a + ")";
        tctx.beginPath();
        tctx.moveTo(cx - nx * 6 + ox * 7, cy - ny * 6 + oy * 7);
        tctx.lineTo(cx + nx * 5, cy + ny * 5);
        tctx.lineTo(cx - nx * 6 - ox * 7, cy - ny * 6 - oy * 7);
        tctx.stroke();
      }
      tctx.restore();
    }
  }
  // hidden gem on the felt (depth plan Phase 0): a faceted brilliant in a marble
  // colour, soft glow + slow pulse — legible as "roll over me", never mistakable
  // for a hole (holes are rings; the gem is a filled crystal). Board-render only.
  function drawGem(c, px, py, col, r, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    c.save();
    c.translate(px, py);
    c.shadowColor = col; c.shadowBlur = 8 + 7 * pulse;
    // crown silhouette: flat table, angled girdle, pointed pavilion
    const w = r * 1.15, tb = r * 0.52, gy = -r * 0.22, ty = -r * 0.78;
    c.beginPath();
    c.moveTo(-tb, ty); c.lineTo(tb, ty);          // table
    c.lineTo(w, gy); c.lineTo(0, r);              // right girdle → culet
    c.lineTo(-w, gy); c.closePath();
    c.fillStyle = col; c.fill();
    c.shadowBlur = 0;
    // facets: darker pavilion wedges + bright table
    c.fillStyle = "rgba(0,0,0,0.28)";
    c.beginPath(); c.moveTo(-w, gy); c.lineTo(-tb * 0.4, gy); c.lineTo(0, r); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(w, gy); c.lineTo(tb * 0.4, gy); c.lineTo(0, r); c.closePath(); c.fill();
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.beginPath(); c.moveTo(-tb, ty); c.lineTo(tb, ty); c.lineTo(tb * 0.55, gy); c.lineTo(-tb * 0.55, gy); c.closePath(); c.fill();
    c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-tb, ty); c.lineTo(tb, ty); c.lineTo(w, gy); c.lineTo(0, r); c.lineTo(-w, gy); c.closePath();
    c.stroke();
    // travelling glint
    const ga = (t * 1.1) % 6.283;
    c.globalAlpha = 0.35 + 0.65 * pulse;
    c.beginPath(); c.arc(Math.cos(ga) * r * 0.3, gy + Math.sin(ga) * r * 0.2, r * 0.14, 0, 7);
    c.fillStyle = "#ffffff"; c.fill();
    c.restore();
  }
  function zoneKindAt(m) {
    for (const z of (P.zones || [])) {
      if (m.x >= z.x && m.x <= z.x + z.w && m.y >= z.y && m.y <= z.y + z.h)
        return E.worldFor(level).zoneKind || "ice";
    }
    return null;
  }
  /* PLATES & GATES (W2 Foundry — LEVELS_SPEC element visual): the pair is
     STATE, painted live each frame — bar retraction eases toward the physics
     world's `held`. Layer "under" draws the dotted link, the gold plate pad
     and the 3 orange bars (below the marbles); layer "over" re-draws only the
     wall-coloured lintel so a passing ball rolls THROUGH the doorway, never
     over it. Reads gates straight off the physics world (cell units) so the
     intro demo and the board share one painter, like drawWorld. */
  function drawGates(c, w2, S, layer) {
    if (!w2 || !w2.gates || !w2.gates.length) return;
    for (let gi = 0; gi < w2.gates.length; gi++) {
      const g = w2.gates[gi];
      if (g._a === undefined) g._a = g.held ? 1 : 0;   // render-only anim state
      if (layer === "under") g._a += ((g.held ? 1 : 0) - g._a) * 0.18;   // once per frame (the "over" pass re-reads)
      const a = g._a;
      const gx = g.x * S, gy = g.y * S, px = g.px * S, py = g.py * S;
      const lint = S * 0.24;
      // COLOUR-MATCH the pocket (Qi feedback): a gate seals exactly one hole —
      // tint its plate, bars and link with THAT hole's colour so, on a two-pair
      // board, you can tell at a glance which plate opens which gate (the red
      // pocket's plate/gate/link are all red, the yellow pocket's all yellow).
      // The lintel stays wall-coloured — it's a door IN the wall, not a piece.
      let acc = "#ffc63e";
      for (const h of w2.holes) if (Math.abs(Math.floor(h.x) - g.x) + Math.abs(Math.floor(h.y) - g.y) === 1) { acc = SKIN[h.c] || acc; break; }
      if (layer === "under") {
        c.save();
        // dotted link plate → gate, lit while held
        c.strokeStyle = acc;
        c.globalAlpha = 0.15 + 0.4 * a;
        c.lineWidth = Math.max(1.5, S * 0.05);
        c.setLineDash([Math.max(2, S * 0.06), Math.max(5, S * 0.16)]);
        c.beginPath();
        c.moveTo(px + S / 2, py + S / 2);
        c.lineTo(gx + S / 2, gy + S / 2);
        c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
        // plate: pocket-coloured pad ring — fill deepens + glow while pressed
        const inset = S * 0.14, rr = Math.max(3, S * 0.14);
        const lit = a > 0.5;
        if (lit) { c.shadowColor = acc; c.shadowBlur = 12 * a; }
        roundRectPath(c, px + inset, py + inset, S - 2 * inset, S - 2 * inset, rr);
        c.fillStyle = acc + (lit ? "33" : "1c");
        c.fill();
        c.lineWidth = Math.max(1.5, S * 0.055);
        c.strokeStyle = lit ? acc : acc + "aa";
        c.stroke();
        c.shadowBlur = 0;
        c.fillStyle = lit ? acc : acc + "55";   // "park here" dot
        c.beginPath(); c.arc(px + S / 2, py + S / 2, S * 0.07, 0, 7); c.fill();
        // 3 bars sliding up into the lintel; pocket-coloured glow while shut
        const drop = (S * 0.94 - lint * 0.6) * (1 - a);   // shut bars reach the cell floor
        c.lineCap = "round";
        c.lineWidth = Math.max(2.5, S * 0.1);
        c.strokeStyle = acc;
        if (a < 0.5) { c.shadowColor = acc; c.shadowBlur = 6 * (1 - a); }
        for (let i = 0; i < 3; i++) {
          const bx = gx + S * (0.25 + 0.25 * i);
          c.beginPath();
          c.moveTo(bx, gy + lint * 0.6);
          c.lineTo(bx, gy + lint * 0.6 + Math.max(S * 0.06, drop));
          c.stroke();
        }
        c.restore();
        // COLOUR MEMBRANE (Qi: "can't tell why the wrong colour won't pass"): an
        // OPEN doorway is NOT empty floor — only the pocket-colour ball may cross.
        // As the bars retract, a translucent shimmering FIELD in the pocket colour
        // fades in to fill the doorway, so a wrong ball visibly bounces off a
        // COLOURED barrier (never an invisible wall) and the matching ball is seen
        // passing through its own colour. Drawn under the balls; the flare (over)
        // still punches on an actual rejection.
        if (g.pocketColor && a > 0.05) {
          const ix = gx + S * 0.10, iy = gy + lint * 0.75, iw = S * 0.80, ih = gy + S * 0.94 - iy;
          const rr2 = Math.max(2, S * 0.10);
          c.save();
          roundRectPath(c, ix, iy, iw, ih, rr2);
          c.save();
          c.clip();
          c.globalAlpha = 0.22 * a;
          c.fillStyle = acc;
          c.fillRect(ix, iy, iw, ih);
          // slow downward-drifting shimmer bands — reads as a live field, not paint
          const ph = (w2.t * 0.35) % 1;
          c.globalAlpha = 0.18 * a;
          for (let i = 0; i < 2; i++) {
            const by = iy + ((ph + i * 0.5) % 1) * ih;
            c.fillRect(ix, by - S * 0.05, iw, S * 0.10);
          }
          c.restore();
          // glowing boundary so the field has an edge you expect to hit
          c.globalAlpha = 0.5 * a;
          c.strokeStyle = acc; c.lineWidth = Math.max(1.5, S * 0.05);
          c.shadowColor = acc; c.shadowBlur = 8 * a;
          c.stroke();
          c.restore();
        }
      } else {
        // lintel: wall-coloured header the bars retract into (same face colours
        // as the real blocks so the doorway reads as part of the wall family)
        c.save();
        const lg = c.createLinearGradient(0, gy, 0, gy + lint);
        lg.addColorStop(0, "#5b67ba"); lg.addColorStop(1, "#3a4390");
        roundRectPath(c, gx + S * 0.03, gy + S * 0.02, S * 0.94, lint, Math.max(2, S * 0.06));
        c.fillStyle = lg; c.fill();
        c.lineWidth = 1.2; c.strokeStyle = "#7c89dd"; c.stroke();
        c.fillStyle = "#ffffff2b";
        c.fillRect(gx + S * 0.1, gy + S * 0.02 + 1.5, S * 0.8, Math.max(1.5, lint * 0.2));
        c.restore();
        // PERSISTENT COLOUR KEY (on the board, not just the easy-to-miss banner):
        // a little marble in the pocket colour rides the lintel so "only the
        // <colour> ball passes here" reads at a glance. On the lintel so it never
        // covers a ball rolling through the doorway below.
        c.save();
        c.shadowColor = acc; c.shadowBlur = Math.max(3, S * 0.16);
        drawMarbleAt(c, gx + S / 2, gy + lint * 0.5, acc, S * 0.16, false, null);
        c.restore();
        // COLOUR-LOCK flare: a wrong-colour ball just bounced off this OPEN gate.
        // A bright pocket-colour PULSE + expanding ring over the doorway (a
        // rejection flare — deliberately NOT the closing bars, which would read as
        // "the gate shut") so "only its own colour passes" reads at the bounce.
        const bt = gateBlockFx[gi], age = bt === undefined ? 9 : w2.t - bt;
        if (age >= 0 && age < 0.45) {
          const k = 1 - age / 0.45, ccx = gx + S / 2, ccy = gy + S / 2;
          c.save();
          c.globalAlpha = 0.5 * k; c.shadowColor = acc; c.shadowBlur = 18 * k; c.fillStyle = acc;
          roundRectPath(c, gx + S * 0.08, gy + S * 0.08, S * 0.84, S * 0.84, Math.max(3, S * 0.14));
          c.fill(); c.shadowBlur = 0;
          c.globalAlpha = 0.9 * k; c.lineWidth = Math.max(2, S * 0.06); c.strokeStyle = acc;
          c.beginPath(); c.arc(ccx, ccy, S * (0.3 + 0.55 * (1 - k)), 0, 7); c.stroke();
          c.restore();
        }
      }
    }
  }
  // BUMPER POSTS (W3 Chime): a metal pillar with a pink ring; on impact the ring
  // flares and 2 expanding chime rings pulse out (design element visual). postFx
  // holds per-post {t,sp} of the last bump so the flare/rings animate off world.t.
  let postFx = {};
  // gateBlockFx[gi] = world.t of the last time a WRONG-colour ball was rejected by
  // an OPEN colour-selective gate — drives a brief colour-flash of the doorway so
  // "only its own colour passes" reads at the moment of the bounce. gateContact
  // tracks who's touching each gate so the flash + hint fire once per contact.
  let gateBlockFx = {}, gateContact = new Set(), gateRuleHintShown = false;
  function checkGateBlocks() {
    if (won || lost || !world || tiltPhase !== "running") return;
    const now = new Set();
    for (let gi = 0; gi < world.gates.length; gi++) {
      const g = world.gates[gi];
      if (!g.held || !g.pocketColor) continue;           // only OPEN, colour-keyed gates
      for (let mi = 0; mi < world.marbles.length; mi++) {
        const m = world.marbles[mi];
        if (m.captured || m.c === g.pocketColor) continue;   // wrong-colour only
        const cx = Math.max(g.x, Math.min(m.x, g.x + world.unit));
        const cy = Math.max(g.y, Math.min(m.y, g.y + world.unit));
        if (Math.hypot(m.x - cx, m.y - cy) < m.r + 0.03) {   // touching the gate
          const key = gi + ":" + mi; now.add(key);
          if (!gateContact.has(key)) {                        // fresh bounce
            gateBlockFx[gi] = world.t;
            if (!gateRuleHintShown) { gateRuleHintShown = true; flashHint("Gates pass only their own colour", 0, "gate"); }
          }
        }
      }
    }
    gateContact = now;
  }
  function drawPosts(c, w2, S, now) {
    if (!w2 || !w2.posts || !w2.posts.length) return;
    for (const p of w2.posts) {
      const px = p.x * S, py = p.y * S, r = p.r * S;
      const fx = postFx[p.idx];
      const age = fx ? now - fx.t : 99;
      const flare = age < 0.35 ? (1 - age / 0.35) : 0;
      if (age < 0.6) {                       // expanding chime rings
        for (let k = 0; k < 2; k++) {
          const a = age - k * 0.12;
          if (a < 0 || a > 0.5) continue;
          const rr = r * (1 + a * 6), al = (1 - a / 0.5) * 0.5;
          c.beginPath(); c.arc(px, py, rr, 0, 7);
          c.strokeStyle = "#ff8fb0"; c.globalAlpha = al; c.lineWidth = Math.max(1.5, S * 0.05); c.stroke();
        }
        c.globalAlpha = 1;
      }
      c.beginPath(); c.ellipse(px, py + r * 0.5, r * 0.95, r * 0.5, 0, 0, 7); c.fillStyle = "#00000055"; c.fill();
      const g = c.createRadialGradient(px - r * 0.4, py - r * 0.45, r * 0.15, px, py, r);
      g.addColorStop(0, "#eef1ff"); g.addColorStop(0.5, "#aab3d0"); g.addColorStop(1, "#4a5280");
      c.beginPath(); c.arc(px, py, r, 0, 7); c.fillStyle = g; c.fill();
      if (flare > 0) { c.shadowColor = "#ff8fb0"; c.shadowBlur = 14 * flare; }
      c.lineWidth = Math.max(1.6, S * 0.06); c.strokeStyle = "#ff8fb0"; c.globalAlpha = 0.7 + 0.3 * flare;
      c.beginPath(); c.arc(px, py, r * 0.92, 0, 7); c.stroke();
      c.shadowBlur = 0; c.globalAlpha = 1;
    }
  }
  function draw() { if (world) drawTiltBoard(); }
  function drawTiltBoard() {
    drawGridBg();
    tctx.save(); tctx.translate(PAD, PAD);   // play space begins inside the rim
    drawGates(tctx, world, CELL, "under");
    drawPosts(tctx, world, CELL, world.t);
    if (gem && !gem.got) drawGem(tctx, (gem.x + 0.5) * CELL, (gem.y + 0.5) * CELL, SKIN[gem.c], CELL * 0.30, world.t);
    // ICE marbles wear the icy halo (dormant kind); SAND gets the half-sunk
    // treatment AFTER the marbles draw (the lip overlaps the ball's bottom)
    for (const m of world.marbles) {
      if (m.captured || zoneKindAt(m) !== "ice") continue;
      const g = tctx.createRadialGradient(m.x * CELL, m.y * CELL, R * 0.3, m.x * CELL, m.y * CELL, R * 1.9);
      g.addColorStop(0, "#bfe9ff33"); g.addColorStop(0.6, "#9fd8ff22"); g.addColorStop(1, "#00000000");
      tctx.beginPath(); tctx.arc(m.x * CELL, m.y * CELL, R * 1.9, 0, 7);
      tctx.fillStyle = g; tctx.fill();
    }
    drawWorld(tctx, world, CELL, { ang: rollAng, head: rollHead });
    // BEACH SAND v4: a ball on sand sits HALF-SUNK — displaced lip over its
    // lower quarter (#eccfa0→#d5b47e), bright rim crest, skid dents trailing
    // while it moves (design 2026-07-12).
    for (const m of world.marbles) {
      if (m.captured || zoneKindAt(m) !== "sand") continue;
      const px = m.x * CELL, py = m.y * CELL;
      const sp = Math.hypot(m.vx, m.vy);
      if (sp > 1.2) {   // skid dents: two soft dashes behind the motion
        const nx = -m.vx / sp, ny = -m.vy / sp;
        tctx.strokeStyle = "rgba(143,111,66,0.4)"; tctx.lineWidth = Math.max(1.5, R * 0.16); tctx.lineCap = "round";
        for (let k = 1; k <= 2; k++) {
          const d = R * (1.5 + k * 0.85);
          tctx.beginPath();
          tctx.moveTo(px + nx * d - ny * R * 0.3, py + ny * d + nx * R * 0.3);
          tctx.lineTo(px + nx * (d + R * 0.5), py + ny * (d + R * 0.5));
          tctx.stroke();
        }
      }
      // displaced lip: covers the ball's bottom ~28% — it reads sunk IN the sand
      const ly = py + R * 0.62;
      const lg = tctx.createLinearGradient(0, ly - R * 0.4, 0, ly + R * 0.42);
      lg.addColorStop(0, "#eccfa0"); lg.addColorStop(1, "#d5b47e");
      tctx.beginPath(); tctx.ellipse(px, ly, R * 1.12, R * 0.42, 0, 0, 7);
      tctx.fillStyle = lg; tctx.fill();
      // rim crest: the pushed-up bright edge of the lip
      tctx.beginPath(); tctx.ellipse(px, ly, R * 1.12, R * 0.42, 0, Math.PI * 1.05, Math.PI * 1.95);
      tctx.strokeStyle = "#fff6e0"; tctx.lineWidth = 1.4; tctx.stroke();
    }
    drawGates(tctx, world, CELL, "over");
    drawLodgedWarnings();
    tctx.restore();
    if (deadInfo) drawDeadEnd();             // dims full canvas itself, then offsets by PAD
    if (tiltPhase === "ready") {
      tctx.fillStyle = "#ffffffd9";
      tctx.font = Math.round(CELL * 0.4) + "px 'Lilita One','Arial Rounded MT Bold',-apple-system,sans-serif";
      tctx.textAlign = "center";
      tctx.fillText("TAP TO START", trayC.width / 2, trayC.height - PAD - CELL * 0.45);
    }
  }
  // The "why" behind a dead end, drawn ON the board. COLOUR-CONSISTENT: the trapped
  // ball, its matching-colour home hole, and the tie between them are ALL the ball's
  // own colour (so "this green ball ↔ its green hole" reads at a glance). The ONLY
  // red is the ✕ on the ball actually sealing the way — the single problem.
  function drawDeadEnd() {
    const t = performance.now() / 1000, pulse = 0.5 + 0.5 * Math.sin(t * 5);
    const col = SKIN[deadInfo.color];
    tctx.save();
    tctx.fillStyle = "rgba(8,10,32,0.66)"; tctx.fillRect(0, 0, trayC.width, trayC.height);
    tctx.translate(PAD, PAD);            // annotation is in play (CELL) space, inside the rim
    tctx.lineCap = "round";
    const bpx = deadInfo.bx * CELL, bpy = deadInfo.by * CELL;
    const hpx = (deadInfo.home.x + 0.5) * CELL, hpy = (deadInfo.home.y + 0.5) * CELL;
    // tie: ball ↔ its home hole, dotted, in the ball's OWN colour (a "these belong
    // together" link, not a route — the ball can't actually travel it)
    tctx.strokeStyle = col; tctx.globalAlpha = 0.4 + 0.3 * pulse; tctx.lineWidth = 3; tctx.setLineDash([5, 9]);
    tctx.beginPath(); tctx.moveTo(bpx, bpy); tctx.lineTo(hpx, hpy); tctx.stroke();
    tctx.setLineDash([]); tctx.globalAlpha = 1;
    // its home hole, ringed in the ball's colour + pulsing (the target it wants)
    tctx.strokeStyle = col; tctx.lineWidth = 4; tctx.globalAlpha = 0.55 + 0.45 * pulse;
    tctx.beginPath(); tctx.arc(hpx, hpy, R * (1.18 + 0.12 * pulse), 0, 7); tctx.stroke();
    tctx.globalAlpha = 1;
    // the trapped ball, redrawn bright + a ring in its colour
    tctx.fillStyle = col;
    tctx.beginPath(); tctx.arc(bpx, bpy, R, 0, 7); tctx.fill();
    tctx.strokeStyle = col; tctx.lineWidth = 3.5; tctx.globalAlpha = 0.55 + 0.45 * pulse;
    tctx.beginPath(); tctx.arc(bpx, bpy, R * (1.35 + 0.22 * pulse), 0, 7); tctx.stroke();
    tctx.globalAlpha = 1;
    // the ONE problem: a red ✕ on the ball sealing the hole's only approach
    tctx.strokeStyle = "#ff5a6e"; tctx.lineWidth = 5;
    for (const s of deadInfo.seals) {
      const cx = (s.x + 0.5) * CELL, cy = (s.y + 0.5) * CELL, r = CELL * 0.3;
      tctx.beginPath(); tctx.moveTo(cx - r, cy - r); tctx.lineTo(cx + r, cy + r);
      tctx.moveTo(cx + r, cy - r); tctx.lineTo(cx - r, cy + r); tctx.stroke();
    }
    tctx.restore();
  }

  /* particle pops (decorative — rAF-only is fine here) */
  let pops = [];
  function popAt(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * 7, sp = 2 + Math.random() * 3;
      pops.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color });
    }
    if (pops.length <= 10) runPops();
    buzz(18);
  }
  function runPops() {
    if (pops.length === 0) return;
    draw();
    pops.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.05; });
    pops = pops.filter(p => p.life > 0);
    tctx.save(); tctx.translate(PAD, PAD);   // pops are in play (CELL) space
    for (const p of pops) {
      tctx.globalAlpha = p.life;
      tctx.beginPath(); tctx.arc(p.x, p.y, R * 0.22 * p.life + 1, 0, 7); tctx.fillStyle = p.color; tctx.fill();
    }
    tctx.restore();
    requestAnimationFrame(runPops);
  }

  /* ---------- new-mechanic intro card (design 6b), Royal Match style ----------
     Shown ONCE when a mechanic debuts (walls today; reuse for hills). A real
     physics bank shot plays on the tipping mini-phone — same fixed timestep,
     same painters, so the demo IS the game. */
  function showMechanicIntro(onDone) {
    resetCardChrome();
    $("#card").innerHTML = `
      <div style="display:flex; justify-content:center; margin-bottom:8px">
        <span class="g-wall" style="width:26px; height:26px; border-radius:5px"></span>
      </div>
      <h2 style="font-size:26px">NEW: WALLS!</h2>
      <canvas id="wallsCv" style="margin:4px auto 0; display:block; max-width:100%"></canvas>
      <div id="wallsCap" class="creature" style="min-height:20px; margin-bottom:12px">&nbsp;</div>
      <div class="row"><button id="wallsGo" class="primary">GOT IT ▸</button></div>`;
    $("#ov").classList.add("show");
    const cv = document.getElementById("wallsCv"), c = cv.getContext("2d");
    const LW = 300, LH = 220;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = LW * dpr; cv.height = LH * dpr;
    cv.style.width = LW + "px"; cv.style.height = LH + "px";
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    cv.style.filter = "drop-shadow(0 14px 14px rgba(0,0,0,0.5))";
    const GW = 7, GH = 5, S = 34, SW = GW * S, SH = GH * S;
    const BEATS = [
      { gx: 7, gy: 0, dur: 1.5, cap: "Walls stop your marbles", reset: true },
      { gx: 5, gy: 7, dur: 1.5, cap: "Slide along them…" },
      { gx: 7, gy: -7, dur: 1.6, cap: "…bank it up…" },
      // gentle settle: fast balls roll OVER holes (that's the game's physics),
      // so the payoff drop must arrive slow — drift down the edge into the well
      { gx: 4, gy: 3, dur: 1.7, cap: "…and drop it in!" },
      { gx: 0, gy: 0, dur: 1.0, cap: "…and drop it in!" },
    ];
    const DUR = BEATS.reduce((s, b) => s + b.dur, 0);
    const beatAt = (t) => { let a = 0; for (const b of BEATS) { a += b.dur; if (t < a) return b; } return BEATS[BEATS.length - 1]; };
    const WCELLS = [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }];
    const rolls = { ang: [], head: [] };
    let w = null, t = 0, phiX = 0, phiY = 0, capShown = "", on = true;
    function resetW() {
      w = PH.createWorld({
        w: GW, h: GH, pad: 0, unit: 1,
        marbles: [{ x: 1.3, y: 2.5, r: 0.36, c: "r" }],
        holes: [{ x: 6.55, y: 1.35, r: 0.42, c: "r" }],  // ON the right-edge climb lane — the bank shot must SINK
        blocks: WCELLS.map(b => ({ x: b.x, y: b.y, w: 1, h: 1 })),
      });
      rolls.ang.length = 0; rolls.head.length = 0;
    }
    function stepOne() {
      PH.step(w, beatAt(t));
      w.events.length = 0;
      w.marbles.forEach((m, i) => {
        if (m.captured) return;
        const s = Math.hypot(m.vx, m.vy);
        if (s > 0.05) { rolls.ang[i] = (rolls.ang[i] || 0) + (s / m.r) * PH.DT; rolls.head[i] = Math.atan2(m.vy, m.vx); }
      });
      t += PH.DT;
      if (t >= DUR) { t = 0; resetW(); }
    }
    function paintWall(x, y, s, nbU, nbD) {
      // real-block look (design 2026-07-12), vertical-run aware for the demo
      const rr2 = Math.max(3, s * 0.12), m2 = 1.5, lift = Math.max(4, s * 0.16);
      const T = nbU ? 0 : m2, B = nbD ? 0 : m2;
      const tl = nbU ? 0 : rr2, tr = nbU ? 0 : rr2, br = nbD ? 0 : rr2, bl = nbD ? 0 : rr2;
      const rrC2 = (x2, y2, w2, h2, a, b2, d, e) => {
        c.beginPath(); c.moveTo(x2 + a, y2);
        c.arcTo(x2 + w2, y2, x2 + w2, y2 + h2, b2); c.arcTo(x2 + w2, y2 + h2, x2, y2 + h2, d);
        c.arcTo(x2, y2 + h2, x2, y2, e); c.arcTo(x2, y2, x2 + w2, y2, a); c.closePath();
      };
      if (!nbD) { c.fillStyle = "#00000066"; rrC2(x + m2 + 1.5, y + T + 3.5, s - 2 * m2, s - T - B - 2, tl, tr, br, bl); c.fill(); }
      const gb = c.createLinearGradient(x, y, x, y + s);
      gb.addColorStop(0, "#262c60"); gb.addColorStop(1, "#151a40");
      c.fillStyle = gb; rrC2(x + m2, y + T, s - 2 * m2, s - T - B, tl, tr, br, bl); c.fill();
      const faceH = nbD ? s - T : s - T - lift;
      const gt = c.createLinearGradient(x, y, x, y + faceH);
      gt.addColorStop(0, "#5b67ba"); gt.addColorStop(1, "#3a4390");
      c.fillStyle = gt; rrC2(x + m2, y + T, s - 2 * m2, faceH, tl, tr, nbD ? 0 : br, nbD ? 0 : bl); c.fill();
      c.lineWidth = 1.5; c.strokeStyle = "#7c89dd";
      rrC2(x + m2, y + T, s - 2 * m2, faceH, tl, tr, nbD ? 0 : br, nbD ? 0 : bl); c.stroke();
      if (!nbU) { rrC2(x + m2 + 3, y + T + 2.5, s - 2 * m2 - 6, faceH * 0.3, rr2 * 0.6, rr2 * 0.6, rr2 * 0.6, rr2 * 0.6); c.fillStyle = "#ffffff30"; c.fill(); }
    }
    function render() {
      c.clearRect(0, 0, LW, LH);
      const b = beatAt(t);
      const tX = Math.asin(Math.max(-0.85, Math.min(0.85, b.gx / 9.8)));
      const tY = Math.asin(Math.max(-0.85, Math.min(0.85, b.gy / 9.8)));
      phiX += (tX - phiX) * 0.09; phiY += (tY - phiY) * 0.09;
      const DEG = 180 / Math.PI;
      cv.style.transform = "perspective(560px) rotateY(" + (phiX * DEG).toFixed(2) + "deg) rotateX(" + (-phiY * DEG).toFixed(2) + "deg)";
      const PW = SW + 20, PHH = SH + 34;
      c.save();
      c.translate(LW / 2, LH / 2);
      roundRectPath(c, -PW / 2, -PHH / 2, PW, PHH, 16);
      const bg = c.createLinearGradient(0, -PHH / 2, 0, PHH / 2);
      bg.addColorStop(0, "#333b7d"); bg.addColorStop(1, "#252b5e");
      c.fillStyle = bg; c.fill();
      c.lineWidth = 2; c.strokeStyle = "#6a76c9"; c.stroke();
      roundRectPath(c, -13, -PHH / 2 + 6, 26, 5, 2.5);
      c.fillStyle = "#0c102e"; c.fill();
      c.save();
      c.translate(-SW / 2, -SH / 2 + 5);
      roundRectPath(c, 0, 0, SW, SH, 7);
      c.fillStyle = "#0c102e"; c.fill();
      c.clip();
      c.fillStyle = "#ffffff0d";
      for (let i = 1; i < GW; i++) for (let j = 1; j < GH; j++) { c.beginPath(); c.arc(i * S, j * S, 1.2, 0, 7); c.fill(); }
      for (const bl of WCELLS) paintWall(bl.x * S, bl.y * S, S,
        WCELLS.some(q => q.x === bl.x && q.y === bl.y - 1),
        WCELLS.some(q => q.x === bl.x && q.y === bl.y + 1));
      drawWorld(c, w, S, rolls);
      c.restore();
      c.restore();
      const capEl = document.getElementById("wallsCap");
      if (capEl && capShown !== b.cap) { capShown = b.cap; capEl.textContent = b.cap; }
    }
    resetW();
    let last = 0, acc = 0;
    function frame(now) {
      if (!on || !document.getElementById("wallsCv")) return;
      requestAnimationFrame(frame);
      if (!last) { last = now; render(); return; }
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;
      acc += dt;
      while (acc >= PH.DT) { stepOne(); acc -= PH.DT; }
      render();
    }
    requestAnimationFrame(frame);
    $("#wallsGo").onclick = () => { on = false; $("#ov").classList.remove("show"); onDone && onDone(); };
  }

  /* ---------- WORLD INTRO card (depth plan §6) — once per world, on entering ----
     Full-card takeover in the world's palette: eyebrow WORLD N (ring color),
     the world name big, a LIVE physics demo of the new element (same fixed
     timestep, same painters — the demo IS the game), the element line, a feel
     whisper, ENTER in the ring color. One visible physics rule per world. */
  const WORLD_WHISPER = { 2: "One rests. One runs.", 3: "Aim the rebound." };
  function showWorldIntro(w, onDone) {
    resetCardChrome();
    $("#card").className = "card worldintro";
    $("#card").style.background = `linear-gradient(180deg,${w.c1},${w.c2})`;
    $("#card").style.borderColor = w.ring + "66";
    $("#card").innerHTML = `
      <div class="wi-eyebrow" style="color:${w.ring}">WORLD ${w.id}</div>
      <h2 class="wi-name">${w.name}</h2>
      <canvas id="wiCv" style="margin:2px auto 0; display:block; max-width:100%"></canvas>
      <div id="wiCap" class="creature" style="min-height:20px; margin-bottom:2px">&nbsp;</div>
      <div class="wi-new">New: <b>${w.element}</b> — ${w.line}</div>
      <div class="wi-whisper">${WORLD_WHISPER[w.id] || ""}</div>
      <div class="row"><button id="wiGo" class="primary" style="background:${w.ring}; color:#06222f">ENTER ▸</button></div>`;
    $("#ov").classList.add("show");
    const cv = document.getElementById("wiCv"), c = cv.getContext("2d");
    const LW = 300, LH = 200;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = LW * dpr; cv.height = LH * dpr;
    cv.style.width = LW + "px"; cv.style.height = LH + "px";
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    cv.style.filter = "drop-shadow(0 14px 14px rgba(0,0,0,0.5))";
    const GW = 7, GH = 5, S = 34, SW = GW * S, SH = GH * S;
    const kind = w.zoneKind || (w.id === 2 ? "gate" : w.id === 3 ? "post" : "ice");
    const ICE = { x: 1.6, y: 1.6, w: 3.8, h: 1.8, kind };
    // Foundry demo pieces (cells): plate (1,2) pocketed by a pin + shelf so the
    // keeper STAYS parked under the crossing tilt; gate (4,4) under a short
    // wall run; the runner's hole sits ON its rolling line — the capture
    // corridor is holeR·0.62 ≈ 0.26 cells, so a hole 0.29 off the floor path
    // never captures (story beats verified in scratch gate-demo-check.cjs:
    // open 0.4s · sunk 2.2s · door drops 3.9s · 5.4s loop).
    const GATE_BLOCKS = [{ x: 2, y: 2 }, { x: 1, y: 3 }, { x: 4, y: 3 }];
    const CHIME_POST = { x: 3.32, y: 3.36, r: 0.34 };   // bank pivot (scratch chime-demo-search)
    const BEATS = kind === "post" ? [
      { gx: 0.8, gy: 1.88, dur: 1.2, cap: "Aim at the post", reset: true },
      { gx: 0.52, gy: 2.82, dur: 1.6, cap: "Bank off it" },
      { gx: -0.61, gy: -0.53, dur: 1.5, cap: "Into the socket" },
      { gx: 0, gy: 0, dur: 1.0, cap: "Into the socket" },
    ] : kind === "gate" ? [
      { gx: 0, gy: 6, dur: 1.4, cap: "Park a marble on the plate", reset: true },
      { gx: 3.4, gy: 2, dur: 1.6, cap: "Held open — roll through" },
      { gx: 1.2, gy: 2, dur: 0.8, cap: "Through — and home" },
      { gx: -5, gy: -2.5, dur: 1.2, cap: "Leave — the door drops" },
      { gx: 0, gy: 0, dur: 0.4, cap: "Leave — the door drops" },
    ] : kind === "sand" ? [
      { gx: 7, gy: 0, dur: 1.8, cap: "Sand swallows your speed", reset: true },
      { gx: 7, gy: 0.5, dur: 1.5, cap: "Crawl through — or go around" },
      { gx: 2.5, gy: 5, dur: 1.7, cap: "Stop exactly where you mean to" },
      { gx: 0, gy: 0, dur: 1.0, cap: "Stop exactly where you mean to" },
    ] : [
      { gx: 6, gy: 0, dur: 1.7, cap: "Ice barely steers — commit the line", reset: true },
      { gx: -3.5, gy: 0.5, dur: 1.6, cap: "Grip returns off the ice" },
      { gx: 3, gy: 5, dur: 1.8, cap: "Pick your line, then land it" },
      { gx: 0, gy: 0, dur: 1.0, cap: "Pick your line, then land it" },
    ];
    const DUR = BEATS.reduce((s, b) => s + b.dur, 0);
    const beatAt = t => { let a = 0; for (const b of BEATS) { a += b.dur; if (t < a) return b; } return BEATS[BEATS.length - 1]; };
    const rolls = { ang: [], head: [] };
    let dw = null, t = 0, phiX = 0, phiY = 0, capShown = "", on = true;
    function resetW() {
      dw = kind === "post" ? PH.createWorld({
        w: GW, h: GH, pad: 0, unit: 1,
        marbles: [{ x: 0.81, y: 1.48, r: 0.36, c: "r" }],
        holes: [{ x: 5.96, y: 4.22, r: 0.42, c: "r" }],
        posts: [CHIME_POST],
      }) : kind === "gate" ? PH.createWorld({
        w: GW, h: GH, pad: 0, unit: 1,
        marbles: [{ x: 1.5, y: 0.6, r: 0.36, c: "y" },    // keeper — parks
                  { x: 0.5, y: 4.4, r: 0.36, c: "b" }],   // runner — crosses
        holes: [{ x: 5.7, y: 4.6, r: 0.42, c: "b" }],
        blocks: GATE_BLOCKS.map(b => ({ x: b.x, y: b.y, w: 1, h: 1 })),
        // pocketColor matches the runner: the intro demo shows the BLUE membrane
        // and the blue ball passing through its own colour — the rule, taught live
        gates: [{ x: 4, y: 4, px: 1, py: 2, pocketColor: "b" }],
      }) : PH.createWorld({
        w: GW, h: GH, pad: 0, unit: 1,
        marbles: [{ x: 0.8, y: 2.5, r: 0.36, c: "b" }],
        holes: [{ x: 5.5, y: 4.4, r: 0.42, c: "b" }],
        zones: [ICE],
      });
      rolls.ang.length = 0; rolls.head.length = 0;
    }
    function stepOne() {
      PH.step(dw, beatAt(t));
      for (const e of dw.events) if (e.type === "bump") postFx[e.i] = { t: dw.t, sp: e.speed };   // demo chime rings
      dw.events.length = 0;
      dw.marbles.forEach((m, i) => {
        if (m.captured) return;
        const s = Math.hypot(m.vx, m.vy);
        if (s > 0.05) { rolls.ang[i] = (rolls.ang[i] || 0) + (s / m.r) * PH.DT; rolls.head[i] = Math.atan2(m.vy, m.vx); }
      });
      t += PH.DT;
      if (t >= DUR) { t = 0; resetW(); }
    }
    function paintIceMini(x, y, wpx, hpx) {
      const rr = Math.max(4, S * 0.18);
      c.save();
      roundRectPath(c, x + 1.5, y + 1.5, wpx - 3, hpx - 3, rr); c.clip();
      if (kind === "sand") {
        // beach sand v4-lite: peach-tan radial + fine stipple + a few shells
        const rad = c.createRadialGradient(x + wpx / 2, y + hpx / 2, 4, x + wpx / 2, y + hpx / 2, Math.hypot(wpx, hpx) * 0.6);
        rad.addColorStop(0, "#f0d6a6"); rad.addColorStop(0.55, "#e4c48e"); rad.addColorStop(1, "#d0ac72");
        c.fillStyle = rad; c.fillRect(x, y, wpx, hpx);
        const TONES = ["#fff3d6", "#f4dcae", "#c9a266", "#a5804a", "#8f6f42"];
        for (let k = 0; k < 130; k++) {
          const hsh = (k * 2654435761) >>> 0;
          c.globalAlpha = 0.08 + (hsh % 100) / 455;
          c.beginPath();
          c.arc(x + ((hsh >> 8) % 1000) / 1000 * wpx, y + ((hsh >> 18) % 1000) / 1000 * hpx, 0.3 + (hsh % 50) / 100, 0, 7);
          c.fillStyle = TONES[hsh % 5]; c.fill();
        }
        c.globalAlpha = 0.32;
        for (let k = 0; k < 4; k++) {
          const hsh = ((k + 9) * 2246822519) >>> 0;
          c.beginPath(); c.arc(x + (hsh % 1000) / 1000 * wpx, y + ((hsh >> 10) % 1000) / 1000 * hpx, 1.2, 0, 7);
          c.fillStyle = "#fff6e0"; c.fill();
        }
        c.globalAlpha = 1;
      } else {
        const g = c.createLinearGradient(x, y, x + wpx, y + hpx);
        g.addColorStop(0, "#9fd8ff3a"); g.addColorStop(0.5, "#cdeeff4d"); g.addColorStop(1, "#9fd8ff3a");
        c.fillStyle = g; c.fillRect(x, y, wpx, hpx);
        c.strokeStyle = "#e8f7ff70"; c.lineWidth = 2; c.lineCap = "round";
        for (let i = 0; i < 3; i++) {
          const sx = x + wpx * ((i + 0.6) / 3.4);
          c.beginPath(); c.moveTo(sx - 8, y + hpx * 0.72); c.lineTo(sx + 8, y + hpx * 0.24); c.stroke();
        }
      }
      c.restore();
      c.strokeStyle = kind === "sand" ? "#a5804a55" : "#bfe9ff66"; c.lineWidth = 1.5;
      roundRectPath(c, x + 1.5, y + 1.5, wpx - 3, hpx - 3, rr); c.stroke();
    }
    function paintBlockMini(x, y) {
      // simplified real-block (34px scale): dark body, raised lit top face,
      // gloss — same family as the board's drawBlocks
      const m = 1.5, rr = Math.max(3, S * 0.12), lift = Math.max(3, S * 0.16);
      const gb = c.createLinearGradient(0, y, 0, y + S);
      gb.addColorStop(0, "#262c60"); gb.addColorStop(1, "#151a40");
      roundRectPath(c, x + m, y + m, S - 2 * m, S - 2 * m, rr);
      c.fillStyle = gb; c.fill();
      const gt = c.createLinearGradient(0, y, 0, y + S - lift);
      gt.addColorStop(0, "#5b67ba"); gt.addColorStop(1, "#3a4390");
      roundRectPath(c, x + m, y + m, S - 2 * m, S - 2 * m - lift, rr);
      c.fillStyle = gt; c.fill();
      c.lineWidth = 1.2; c.strokeStyle = "#7c89dd"; c.stroke();
      roundRectPath(c, x + 4, y + 3.5, S - 8, (S - lift) * 0.3, rr * 0.6);
      c.fillStyle = "#ffffff30"; c.fill();
    }
    function render() {
      c.clearRect(0, 0, LW, LH);
      const b = beatAt(t);
      const tX = Math.asin(Math.max(-0.85, Math.min(0.85, b.gx / 9.8)));
      const tY = Math.asin(Math.max(-0.85, Math.min(0.85, b.gy / 9.8)));
      phiX += (tX - phiX) * 0.09; phiY += (tY - phiY) * 0.09;
      const DEG = 180 / Math.PI;
      cv.style.transform = "perspective(560px) rotateY(" + (phiX * DEG).toFixed(2) + "deg) rotateX(" + (-phiY * DEG).toFixed(2) + "deg)";
      const PW = SW + 20, PHH = SH + 26;
      c.save();
      c.translate(LW / 2, LH / 2);
      roundRectPath(c, -PW / 2, -PHH / 2, PW, PHH, 16);
      const bg = c.createLinearGradient(0, -PHH / 2, 0, PHH / 2);
      bg.addColorStop(0, w.c1); bg.addColorStop(1, w.c2);
      c.fillStyle = bg; c.fill();
      c.lineWidth = 2; c.strokeStyle = w.ring + "66"; c.stroke();
      c.save();
      c.translate(-SW / 2, -SH / 2 + 3);
      roundRectPath(c, 0, 0, SW, SH, 7);
      c.fillStyle = "#0c102e"; c.fill();
      c.clip();
      c.fillStyle = "#ffffff0d";
      for (let i = 1; i < GW; i++) for (let j = 1; j < GH; j++) { c.beginPath(); c.arc(i * S, j * S, 1.2, 0, 7); c.fill(); }
      if (kind === "post") {
        curHoleSocket = true;                 // Chime holes are sockets in the demo too
        drawPosts(c, dw, S, dw.t);
        drawWorld(c, dw, S, rolls);
        curHoleSocket = false;
      } else if (kind === "gate") {
        for (const b of GATE_BLOCKS) paintBlockMini(b.x * S, b.y * S);
        drawGates(c, dw, S, "under");
        drawWorld(c, dw, S, rolls);
        drawGates(c, dw, S, "over");
      } else {
        paintIceMini(ICE.x * S, ICE.y * S, ICE.w * S, ICE.h * S);
        drawWorld(c, dw, S, rolls);
      }
      c.restore();
      c.restore();
      const capEl = document.getElementById("wiCap");
      if (capEl && capShown !== b.cap) { capShown = b.cap; capEl.textContent = b.cap; }
    }
    resetW();
    let last = 0, acc = 0;
    function frame(now) {
      if (!on || !document.getElementById("wiCv")) return;
      requestAnimationFrame(frame);
      if (!last) { last = now; render(); return; }
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;
      acc += dt;
      while (acc >= PH.DT) { stepOne(); acc -= PH.DT; }
      render();
    }
    requestAnimationFrame(frame);
    $("#wiGo").onclick = () => {
      on = false;
      $("#card").className = "card";
      $("#card").style.background = ""; $("#card").style.borderColor = "";
      $("#ov").classList.remove("show");
      onDone && onDone();
    };
  }

  /* ---------- tutorial: a real mini-game inside a tilting phone ----------
     Runs the ACTUAL physics (PH.createWorld/PH.step, same fixed timestep) on a
     pocket world and renders with the SAME primitives as the board (drawWorld)
     — the demo is not a cartoon of the game, it IS the game, so look and
     motion match exactly. TutorialScript's gravity track (node-verified to
     play out) TIPS the little phone in real 3D — CSS perspective rotateX/Y on
     the canvas, the dipping edge falls away from the viewer, exactly the
     physical gesture. (An in-plane 2D spin is the one gesture that does
     NOTHING in this game — never depict it.) Story on loop:
     roll → wrong hole → STUCK → hard tilt pops it free → sinks in its match. */
  let tutWorld = null, tutRAF = 0, tutOn = false, tutT = 0, tutStepFn = null;
  function showTutorial(onDone) {
    resetCardChrome();
    const TUT = window.TutorialScript;
    $("#card").innerHTML = `
      <h2 style="font-size:22px">ROLL EACH BALL INTO<br>ITS MATCHING HOLE</h2>
      <canvas id="tutCv" style="margin:6px auto 0; display:block; max-width:100%"></canvas>
      <div id="tutCap" class="creature" style="min-height:20px; margin-bottom:12px">&nbsp;</div>
      <div class="row"><button id="tutGo" class="primary">GOT IT ▸</button></div>`;
    $("#ov").classList.add("show");
    overlayAbovePanels();   // "How to Play" opens from the settings sheet on a panel too
    const cv = document.getElementById("tutCv"), c = cv.getContext("2d");
    const LW = 300, LH = 240;                       // logical size
    // crisp on Retina: back the canvas at device resolution, draw in logical px
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = LW * dpr; cv.height = LH * dpr;
    cv.style.width = LW + "px"; cv.style.height = LH + "px";
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the 3D tip lives on the ELEMENT: GPU-projected, shadow follows the tilt
    cv.style.filter = "drop-shadow(0 14px 14px rgba(0,0,0,0.5))";
    const S = 34;                                   // px per cell in the mini tray
    const SW = TUT.WORLD.w * S, SH = TUT.WORLD.h * S;
    const rolls = { ang: [], head: [] };
    let phiX = 0, phiY = 0, capShown = "";          // smoothed 3D lean; caption cache
    let tutBeatIdx = -1;
    function resetTutWorld() {
      tutWorld = PH.createWorld({
        w: TUT.WORLD.w, h: TUT.WORLD.h, pad: 0, unit: 1,
        marbles: TUT.WORLD.marbles.map(m => ({ x: m.x, y: m.y, r: m.r, c: m.c })),
        holes: TUT.WORLD.holes.map(h => ({ x: h.x, y: h.y, r: h.r, c: h.c })),
        blocks: [],
      });
      rolls.ang.length = 0; rolls.head.length = 0;
    }
    function resetTut() { resetTutWorld(); tutT = 0; tutBeatIdx = -1; }
    function stepOne() {
      const bi = TUT.beatIndexAt(tutT);
      if (bi !== tutBeatIdx) {                      // segment boundary → fresh world
        if (TUT.BEATS[bi].reset) resetTutWorld();
        tutBeatIdx = bi;
      }
      PH.step(tutWorld, TUT.BEATS[bi]);
      tutWorld.events.length = 0;                   // demo is silent — no audio/haptics
      tutWorld.marbles.forEach((m, i) => {          // same rolling-swirl cue as the game
        if (m.captured) return;
        const s = Math.hypot(m.vx, m.vy);
        if (s > 0.05) { rolls.ang[i] = (rolls.ang[i] || 0) + (s / m.r) * PH.DT; rolls.head[i] = Math.atan2(m.vy, m.vx); }
      });
      tutT += PH.DT;
      if (tutT >= TUT.DUR + 0.4) resetTut();        // loop
    }
    function render() {
      c.clearRect(0, 0, LW, LH);
      const b = TUT.beatAt(tutT);
      // TIP the phone in 3D, exactly like holding it: the edge gravity pulls
      // toward falls AWAY from the viewer (perspective foreshortening), the
      // same rotateX/Y language the game's own tray tip used. gx → lean about
      // the vertical axis, gy → about the horizontal one; angle = the real
      // physical tilt asin(g/9.8).
      const tX = Math.asin(Math.max(-0.85, Math.min(0.85, b.gx / 9.8)));
      const tY = Math.asin(Math.max(-0.85, Math.min(0.85, b.gy / 9.8)));
      phiX += (tX - phiX) * 0.09;
      phiY += (tY - phiY) * 0.09;
      const DEG = 180 / Math.PI;
      cv.style.transform = "perspective(560px) rotateY(" + (phiX * DEG).toFixed(2) +
        "deg) rotateX(" + (-phiY * DEG).toFixed(2) + "deg)";
      const PW = SW + 20, PHH = SH + 34;
      c.save();
      c.translate(LW / 2, LH / 2);
      // phone body (shadow comes from the element's drop-shadow, so it tilts too)
      roundRectPath(c, -PW / 2, -PHH / 2, PW, PHH, 16);
      c.fillStyle = "#2e356f"; c.fill();
      c.lineWidth = 2; c.strokeStyle = "#6a76c9"; c.stroke();
      roundRectPath(c, -13, -PHH / 2 + 6, 26, 5, 2.5);   // speaker slit
      c.fillStyle = "#0c0e18"; c.fill();
      // screen = the mini tray, drawn by the game's own renderer
      c.save();
      c.translate(-SW / 2, -SH / 2 + 5);
      roundRectPath(c, 0, 0, SW, SH, 7);
      c.fillStyle = "#0c0e18"; c.fill();
      c.clip();
      c.strokeStyle = "#ffffff08";                  // the board's faint grid
      for (let i = 1; i < TUT.WORLD.w; i++) { c.beginPath(); c.moveTo(i * S, 3); c.lineTo(i * S, SH - 3); c.stroke(); }
      for (let j = 1; j < TUT.WORLD.h; j++) { c.beginPath(); c.moveTo(3, j * S); c.lineTo(SW - 3, j * S); c.stroke(); }
      drawWorld(c, tutWorld, S, rolls);
      c.restore();
      c.restore();
      // hard-tilt chevrons, marching the way the phone dips
      if (b.chev) {
        const ph = (tutT * 1.8) % 1;
        const cy = LH / 2, x0 = b.chev < 0 ? 44 : LW - 44;
        for (let i = 0; i < 3; i++) {
          const a = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, ph * 1.4 - i * 0.18)))) * 0.9;
          if (a <= 0) continue;
          c.strokeStyle = "rgba(255,198,62," + a + ")"; c.lineWidth = 3.5; c.lineCap = "round";
          const cx = x0 + b.chev * (i * 11 + ph * 12);
          c.beginPath(); c.moveTo(cx - 5 * b.chev, cy - 8); c.lineTo(cx + 4 * b.chev, cy); c.lineTo(cx - 5 * b.chev, cy + 8); c.stroke();
        }
      }
      if (capShown !== b.cap) { capShown = b.cap; $("#tutCap").textContent = b.cap; }
    }
    // rAF drives the demo with the game loop's own accumulator pattern — vsync-
    // smooth, fixed-timestep, frame-drop tolerant. (Card is decorative: if rAF
    // is throttled the game itself never stalls.)
    let last = 0, acc2 = 0;
    function frame(now) {
      if (!tutOn) return;
      tutRAF = requestAnimationFrame(frame);
      if (!last) { last = now; render(); return; }
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;
      acc2 += dt;
      while (acc2 >= PH.DT) { stepOne(); acc2 -= PH.DT; }
      render();
    }
    tutStepFn = secs => {                           // dev hook: preview browsers suspend rAF
      const n = Math.round(secs / PH.DT);
      for (let i = 0; i < n; i++) stepOne();
      render();
    };
    resetTut();
    tutOn = true;
    render();
    tutRAF = requestAnimationFrame(frame);
    $("#tutGo").onclick = () => {
      tutOn = false; cancelAnimationFrame(tutRAF);
      tutWorld = null; tutStepFn = null;
      $("#ov").classList.remove("show", "deadend", "above");
      onDone && onDone();
    };
  }

  /* ---------- tilt-the-phone mode: continuous sim ---------- */
  let lastT = 0, acc = 0, lastCaptureT = 0;
  let armT0 = 0;   // armed = waiting only for an input source (watchdog)
  const rollAng = [], rollHead = [];                // rolling-texture cue per marble
  function hasInputSource() { return motionOK || !!devG || Object.values(keysHeld).some(Boolean); }
  function tiltLoop(now) {
    requestAnimationFrame(tiltLoop);
    if (lsOpen || wsOpen || colOpen) { lastT = now; return; }   // a nav panel is up — freeze the run underneath
    if (!world) return;
    if (tiltPhase === "armed") {
      // no calibration, no gate: gravity is absolute and live from the first
      // frame — armed only waits for an input source (watchdog below)
      lastT = now; draw();
      if (!hasInputSource()) {
        if (!watchdogShown && now - armT0 > 2500) {
          watchdogShown = true; tiltPhase = "ready";
          flashHint(motionDenied
            ? "Motion blocked — quit and reopen the app"
            : "No tilt — tap to retry (or arrow keys)", 1, "blocked");
        }
        return;
      }
      beginRun();
      return;
    }
    if (tiltPhase === "dead") {   // frozen board + persistent "why" annotation (banner is a bottom sheet)
      lastT = now; setRollLevel(0); draw();
      return;
    }
    if (tiltPhase !== "running") {
      lastT = now; setRollLevel(0);
      // "ready" repaints for the gem pulse — but NEVER under a card overlay:
      // iOS recomposites #ov's full-screen backdrop-blur every canvas frame,
      // janking the very buttons on the card (the "settings X dead/slow" bug)
      if (tiltPhase === "ready" && !$("#ov").classList.contains("show")) draw();
      return;
    }
    let dt = (now - lastT) / 1000; lastT = now;
    if (dt > 0.05) dt = 0.05;   // clamp hiccups (backgrounding etc.)
    acc += dt;
    const g = currentGravity();
    while (acc >= PH.DT) { PH.step(world, g); acc -= PH.DT; consumeEvents(); if (lost) break; }
    // rolling-texture cue + rolling-rumble level
    let smax = 0, freeN = 0, fastIce = null;
    world.marbles.forEach((m, i) => {
      if (m.captured) return;
      freeN++;
      const s = Math.hypot(m.vx, m.vy);
      if (s > smax) { smax = s; fastIce = zoneKindAt(m); }
      if (s > 0.05) { rollAng[i] = (rollAng[i] || 0) + (s / m.r) * dt; rollHead[i] = Math.atan2(m.vy, m.vx); }
    });
    setRollLevel(won || lost ? 0 : smax, fastIce);
    trackRunSignals(smax, freeN, dt);
    draw();
    if (!lost) updateTimePill();
    checkDeadEnd();
    checkGateBlocks();   // flash + one-time hint when a wrong colour bounces off an open gate
    // seal re-check ON SETTLE, not only on capture: a ball can roll into a pocket
    // already sealed by walls + captured balls AFTER the last capture — that dead
    // end fires no capture event, so nothing would catch it. Cheap O(64) flood-fill,
    // run once each time the board comes to rest.
    if (!won && !lost) {
      if (smax < 0.05) { if (!restChecked) { restChecked = true; checkSeal(); } }
      else restChecked = false;
    }
    if (!won && !lost && PH.solved(world) &&
        world.marbles.every(m => m.sink && m.sink.t >= world.params.sinkTime)) winTilt();
  }
  let watchdogShown = false, restChecked = false;
  function beginRun() { tiltPhase = "running"; $("#hint").style.opacity = 0; }
  requestAnimationFrame(tiltLoop);
  function consumeEvents() {
    for (const e of world.events) {
      if (e.type === "clack") {
        runClacks++;   // feat: no-clack
        const v = Math.min(1, e.speed / 10);
        sndClack(0.3 + 0.7 * v, 0.85 + 0.35 * v, e.i + "_" + e.j, e.dead);
        if (e.speed > 4) haptic("light");
      } else if (e.type === "wall") {
        const v = Math.min(1, e.speed / 22);
        sndWallHit(0.25 + 0.75 * v);
        if (e.speed > 6) haptic(e.speed > 13 ? "medium" : "light");
      } else if (e.type === "rim") {
        sndRim(); haptic("light");
      } else if (e.type === "gate") {
        sndGate(e.open, e.i); haptic("light");
        // teach the colour-lock rule at the FIRST gate opening — a reliable,
        // contextual moment (you WILL open a gate to solve any gate level),
        // unlike the wrong-ball bounce which is rare. Once per session; the
        // bounce flare then reinforces it. Only for colour-keyed gates.
        if (e.open && !gateRuleHintShown && world.gates[e.i] && world.gates[e.i].pocketColor) {
          gateRuleHintShown = true; flashHint("Gates pass only their own colour", 0, "gate");
        }
      } else if (e.type === "bump") {
        postFx[e.i] = { t: world.t, sp: e.speed };
        sndBump(e.i, e.speed); if (e.speed > 6) haptic(e.speed > 13 ? "medium" : "light");
      } else if (e.type === "plunk") {
        runPlunks++;   // feat: zero-lodge
        sndPlunk(); haptic("medium");   // wrong cup — you'll feel it
        // "Tilt HARD to pop it out!" is TRUE for an open hole but a LIE for a
        // gate-pocket (the gate can't be held open during the tilt that would
        // drag the ball out — proven unwinnable). Don't tell the player to do
        // something impossible; the pocket-rescue offer takes over quickly.
        if (!isGatePocketHole(Math.round(e.x - 0.5), Math.round(e.y - 0.5))) {
          flashHint("Tilt HARD to pop it out!", 1, "stuck"); stuckHint = true;
        }
      } else if (e.type === "capture") {
        lastCaptureT = world.t;
        sndCapture(); haptic("medium");
        popAt(e.x * CELL, e.y * CELL, SKIN[e.color]);
        checkSeal();   // a new permanent obstacle — did it seal off any remaining ball's home?
      }
    }
  }
  // per-step run signals shared by tiltLoop AND the __tilt.stepN dev hook (the
  // hook must exercise the same feat/gem logic real play does, or tests lie):
  // feat no-stop — once the board has genuinely moved, any 0.4s window where
  // EVERY loose marble rests (before the final capture) forfeits the feat; the
  // pre-first-tilt stillness never counts, neither does the sink animation.
  function trackRunSignals(smax, freeN, dt) {
    if (won || lost || freeN <= 0) return;
    if (smax > 1.0) runMoved = true;
    if (runMoved) {
      if (smax < 0.08) { stopT += dt; if (stopT > 0.4) runStopped = true; }
      else stopT = 0;
    }
    checkGem();
  }
  // gem pickup: a FREE marble rolling over the gem cell collects it — persisted
  // immediately (a found gem survives a dead-end retry; the collection is the
  // reward lap, not a win condition). Distinct haptic identity: a quick double tap.
  function checkGem() {
    if (!gem || gem.got) return;
    const gx = gem.x + 0.5, gy = gem.y + 0.5;
    for (const m of world.marbles) {
      if (m.captured) continue;
      if (Math.hypot(m.x - gx, m.y - gy) < 0.5) {
        gem.got = true;
        // store the gem's COLOUR (not just 1) so the Collection screen never has to
        // rebuild the level to know it — E.build() BFS-generates W1 boards (~0.3s
        // each on desktop, 2-4× on device), and building every gem-level on the
        // first Collection open cost seconds of cold-start lag (Qi).
        const sv = loadSave(); sv.gems = sv.gems || {}; sv.gems[level] = gem.c; writeSave(sv);
        track("gem_collect", { level: level });
        sndCapture();
        haptic("light"); setTimeout(() => haptic("light"), 70);
        popAt(gx * CELL, gy * CELL, SKIN[gem.c]);
        toast("💎 Gem found!");
        return;
      }
    }
  }
  function startTiltRun() {
    // NEVER arm while a card overlay is up (review 2026-07-12): #ov blocks
    // pointer input but the desktop keydown path bypassed it — a run could
    // play out blind UNDER the tutorial/world-intro card, destroying the
    // intro's button (the only place its cleanup + once-only flag live).
    if ($("#ov").classList.contains("show")) return;
    initAudio(); initRollSound(); requestMotion();
    if (tiltPhase === "ready") {
      tiltPhase = "armed";
      armT0 = performance.now(); watchdogShown = false;
      $("#hint").style.opacity = 0;
    }
  }
  function updateTimePill() {
    if (!world) return;
    $("#timeV").textContent = world.t.toFixed(1);
  }
  function bestFor(sv, lvl) { return sv.best && sv.best[lvl]; }
  /* ---------- time medals (the replay hook) ----------
     Threshold math lives in engine.js (E.medalTimes/E.medalFor — pure, node-
     tested; gold/silver formulas unchanged from the shipped 30). DIAMOND (depth
     plan Phase 0) sits above gold: the mastery tier, hidden on the win card
     until a level's first clear. Placeholder curves until certify.cjs replaces
     them with bot percentiles. */
  const medalTimes = E.medalTimes, medalFor = E.medalFor;
  const MEDAL_RANK = { bronze: 1, silver: 2, gold: 3, diamond: 4 };
  const MEDAL_COL = { diamond: "var(--diamond)", gold: "var(--gold)", silver: "var(--silver)", bronze: "var(--bronze)" };
  function bestMedal(sv, lvl) { return sv.medal && sv.medal[lvl]; }
  // 3 stars, lit center-out by tier (bronze 1 / silver 2 / gold+ 3), tinted the
  // medal colour — the big centre star anchors every tier so bronze still reads.
  // Diamond lights all three in ice-blue (its 4th rank lives in the medal strip).
  function medalStarsHTML(medal) {
    const lit = { 1: [1], 2: [0, 1], 3: [0, 1, 2] }[Math.min(3, MEDAL_RANK[medal])];
    const cls = ["", "big", ""];
    return [0, 1, 2].map(i => {
      const on = lit.indexOf(i) >= 0;
      return `<span class="${cls[i]}" style="color:${on ? MEDAL_COL[medal] : "var(--dim2)"};${on ? "" : "opacity:.28"}">★</span>`;
    }).join("");
  }
  /* ---------- dead end = game over (the card, not endless grinding) ----------
     Lodged balls ARE physically escapable (hard tilt), but when EVERY remaining
     ball sits wedged in a wrong hole and stays there past the grace window, the
     run is dead — say so with a card and a one-tap retry, Royal Match style. */
  function lodgedCount() {
    let lodged = 0, freeN = 0;
    for (const m of world.marbles) {
      if (m.captured) continue;
      freeN++;
      for (const h of world.holes) {
        if (h.filled || h.c === m.c) continue;
        if (Math.hypot(m.x - h.x, m.y - h.y) < h.r * world.params.captureFrac * 1.4) { lodged++; break; }
      }
    }
    return { lodged, freeN };
  }
  // A GATE-POCKET hole's sole orthogonal entrance is its gate (its other
  // neighbours are rim/wall) — the deliberate FOUNDRY seal. A WRONG-colour ball
  // that lodges in one is effectively inescapable by hand (freeing it needs the
  // gate held open during the very tilt that drags the ball toward the gate,
  // which the plate rule forbids). We never CLAIM the board dead — some pockets
  // stay technically winnable and a false "dead" card is the exact regression
  // that got reverted before — but after a grace window we offer a one-tap
  // restart so the player is never stranded on an impossible "Tilt HARD" hint.
  function isGatePocketHole(hx, hy) {
    const gates = P.gates || [];
    if (!gates.length) return false;
    const isWall = (x, y) => (P.walls || []).some(w => w.x === x && w.y === y);
    const isGate = (x, y) => gates.some(g => g.x === x && g.y === y);
    const isHole = (x, y) => (P.holesArr || []).some(o => o.x === x && o.y === y);
    let adjGate = false, openFloor = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = hx + dx, ny = hy + dy;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;   // rim
      if (isGate(nx, ny)) { adjGate = true; continue; }
      if (isWall(nx, ny) || isHole(nx, ny)) continue;
      openFloor = true;                                        // a permanently-open approach
    }
    return adjGate && !openFloor;
  }
  // is a wrong-colour ball wedged in a sealed gate-pocket right now?
  function pocketTrapped() {
    for (const m of world.marbles) {
      if (m.captured) continue;
      for (const h of world.holes) {
        if (h.filled || h.c === m.c) continue;
        if (Math.hypot(m.x - h.x, m.y - h.y) < h.r * world.params.captureFrac * 1.4 &&
            isGatePocketHole(Math.round(h.x - 0.5), Math.round(h.y - 0.5))) return true;
      }
    }
    return false;
  }
  let stuckHint = false;            // "pop it out" hint is up — clear it once nothing is wedged
  let pocketStuckSince = 0, pocketOffered = false;   // gate-pocket restart-offer state
  // DEAD END, done RIGHT (2026-07): a full solver run is not just slow (~1s) but the
  // WRONG oracle — the discrete slide model can't stop a ball mid-board, so it calls
  // almost every settled arrangement "dead" though the player could still roll home.
  // The only UNRECOVERABLE dead end is PHYSICAL: a ball's home hole walled/captured
  // off so it can never reach it. Walls are static and the fragile "gateway hole" is
  // now forbidden at build (engine.hasGatewayHole), so this can only happen when a
  // CAPTURED ball (a permanent obstacle) seals the last approach — so we re-check
  // only on capture, with a cheap grid flood-fill. Wrong holes are passable (lip-out),
  // captured balls + walls block. Sound: fires only on a genuine seal, never on a
  // ball that just rolled somewhere awkward. Cost: a 64-cell BFS, instant.
  function homeReachable(m, blocked) {
    const home = P.holesArr.find(h => h.c === m.c);
    if (!home) return true;
    const sx = Math.max(0, Math.min(N - 1, Math.round(m.x - 0.5)));
    const sy = Math.max(0, Math.min(N - 1, Math.round(m.y - 0.5)));
    const seen = new Set([sx + "," + sy]);
    let q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === home.x && y === home.y) return true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + "," + ny;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N || seen.has(k) || blocked.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return false;
  }
  let deadInfo = null;
  function checkSeal() {
    if (won || lost || !world || tiltPhase !== "running") return;
    const blocked = new Set(), capCells = new Set();
    for (const b of (P.walls || [])) blocked.add(b.x + "," + b.y);
    for (const m of world.marbles) if (m.captured) { const k = Math.round(m.x - 0.5) + "," + Math.round(m.y - 0.5); blocked.add(k); capCells.add(k); }
    const freeN = world.marbles.filter(mm => !mm.captured).length;
    for (const m of world.marbles) {
      if (m.captured) continue;
      // FOUNDRY gates: for the LAST free marble a closed gate is a permanent
      // wall — nobody is left to hold the plate, and it cannot hold the plate
      // and travel through its own door (leaving closes it). With ≥2 free
      // marbles a gate stays passable-in-principle (another marble can park),
      // so this under-detects but can never falsely end a live run. A marble
      // already INSIDE the gate cell exits freely (anti-crush keeps it open).
      let bl = blocked;
      if (freeN <= 1 && (P.gates || []).length) {
        bl = new Set(blocked);
        for (const g of P.gates)
          if (!(Math.floor(m.x) === g.x && Math.floor(m.y) === g.y)) bl.add(g.x + "," + g.y);
      }
      if (homeReachable(m, bl)) continue;
      // this ball can never reach its hole — capture the "why" for the board
      // annotation: the ball, its sealed home hole, and the CAPTURED ball(s) doing the
      // sealing. Sealers can cap the HOME's approach (gateway trap) OR box the BALL
      // into a pocket (walls left/right, captured balls up/down) — mark both so the ✕
      // lands on the real culprit. Walls are static context; only captured balls count.
      const home = P.holesArr.find(h => h.c === m.c);
      const bx = Math.round(m.x - 0.5), by = Math.round(m.y - 0.5);
      const seals = [], seen = new Set();
      for (const [cx, cy] of [[home.x, home.y], [bx, by]]) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy, k = nx + "," + ny;
          if (nx >= 0 && nx < N && ny >= 0 && ny < N && capCells.has(k) && !seen.has(k)) { seen.add(k); seals.push({ x: nx, y: ny }); }
        }
      }
      // gate-caused seal (reachable without the gate walls, not with) → the ✕
      // belongs on the shut door DOING the sealing: a gate is a culprit iff
      // opening it alone restores the path (joint cuts mark every closed door)
      if (bl !== blocked && homeReachable(m, blocked)) {
        let marked = 0;
        for (const g of P.gates) {
          const gk = g.x + "," + g.y;
          if (!bl.has(gk)) continue;
          const bl2 = new Set(bl); bl2.delete(gk);
          if (homeReachable(m, bl2)) { seals.push({ x: g.x, y: g.y }); marked++; }
        }
        if (!marked) for (const g of P.gates) if (bl.has(g.x + "," + g.y)) seals.push({ x: g.x, y: g.y });
      }
      lost = true; sndFail(); haptic("heavy");
      track("dead_end", { level: level });
      deadInfo = { bx: m.x, by: m.y, home: { x: home.x, y: home.y }, seals: seals, color: m.c };
      tiltPhase = "dead";           // board keeps the "why" annotation up; banner slides in
      showDeadEnd("This ball can’t reach its hole");
      return;
    }
  }
  function checkDeadEnd() {
    if (won || lost || !world || tiltPhase !== "running") return;
    const lc = lodgedCount();
    // the "Tilt HARD to pop it out!" hint only makes sense while a ball is
    // actually wedged — once the last wrong ball frees, drop it
    if (stuckHint && lc.lodged === 0) { $("#hint").style.opacity = 0; stuckHint = false; }
    // gate-pocket rescue: a wrong ball wedged in a sealed pocket can't be popped
    // out by hand. After a grace window swap the impossible "Tilt HARD" hint for
    // a one-tap restart. NON-destructive by design — a still-winnable board is
    // unaffected (the player just ignores the offer and keeps tilting).
    if (pocketTrapped()) {
      if (!pocketStuckSince) pocketStuckSince = world.t;
      if (world.t - pocketStuckSince > 1.2 && !pocketOffered) { pocketOffered = true; showPocketRescue(); }
    } else if (pocketStuckSince) {
      pocketStuckSince = 0;
      if (pocketOffered) { pocketOffered = false; clearPocketRescue(); }
    }
  }
  // a tappable "you're stuck — restart?" chip in the hint slot (opts back into
  // pointer events; the hint is pointer-events:none by default)
  function showPocketRescue() {
    const h = $("#hint");
    h.innerHTML = '<span class="chip-hint hot" style="cursor:pointer">' + (GLYPHS.stuck || "") +
      '<span>Stuck in a gate — tap to restart</span></span>';
    h.style.opacity = 1; h.style.pointerEvents = "auto";
    h.onclick = () => { haptic("light"); clearPocketRescue(); restart(); };
  }
  function clearPocketRescue() {
    const h = $("#hint");
    h.onclick = null; h.style.pointerEvents = "none";
    if (!stuckHint) h.style.opacity = 0;
  }
  // Dead-end banner: a COMPACT bottom sheet that does NOT cover the board — the
  // annotation on the board is the explanation, and it stays lit (phase "dead")
  // until the player taps. One line, no stats.
  function showDeadEnd(reason) {
    resetCardChrome();
    reason = reason || "No way to finish from this position";
    $("#card").innerHTML = `
      <h2>DEAD END!</h2>
      <div class="creature" style="color:var(--bad)">${reason}</div>
      <div class="row"><button id="retry" class="primary">${IC_RESTART}TRY AGAIN</button></div>`;
    $("#ov").classList.add("show", "deadend");
    $("#retry").onclick = () => startLevel(level);
  }
  function winTilt() {
    won = true; tiltPhase = "done";
    // score the moment the LAST marble dropped, not the end of its sink animation
    const time = Math.round((lastCaptureT || world.t) * 10) / 10;
    const sv = loadSave();
    sv.level = Math.min(Math.max(sv.level || 1, level + 1), E.LAST_LEVEL);
    sv.best = sv.best || {};
    const prev = sv.best[level];
    sv.best[level] = prev ? Math.min(prev, time) : time;
    // medal: keep the best tier ever earned on this level
    const medal = medalFor(time, level, P.par);
    sv.medal = sv.medal || {};
    if (!sv.medal[level] || MEDAL_RANK[medal] > MEDAL_RANK[sv.medal[level]]) sv.medal[level] = medal;
    // feats: judged per run, kept forever once earned on this level (mastery lap)
    const rf = runFeats(), defs = featDefs();
    sv.feats = sv.feats || {};
    const fRec = sv.feats[level] = sv.feats[level] || {};
    let earned = 0;
    for (const d of defs) { if (rf[d.id]) { fRec[d.id] = 1; } if (fRec[d.id]) earned++; }
    track("level_complete", { level: level, time_ms: Math.round(time * 1000),
      stars: Math.min(3, MEDAL_RANK[medal]), medal: medal, feats: earned,
      gem: gem && gem.got ? 1 : 0 });
    if (level >= E.LAST_LEVEL) sv.done = 1;
    writeSave(sv);
    // world-complete funnel event (was on the retired finish card): fires when a
    // world's last built level is cleared. diamond counts as gold-or-better.
    const wE = E.worldFor(level);
    if (level >= Math.min(wE.to, E.LAST_LEVEL)) {
      let g = 0, s = 0, b = 0, d = 0;
      for (let L = wE.from; L <= Math.min(wE.to, E.LAST_LEVEL); L++) {
        const mm = (sv.medal || {})[L];
        if (mm === "diamond") { d++; g++; } else if (mm === "gold") g++; else if (mm === "silver") s++; else if (mm === "bronze") b++;
      }
      track("world_complete", { world: wE.id, golds: g, diamonds: d, stars: g * 3 + s * 2 + b });
    }
    // haptic identity: a diamond-tier run lands HEAVY — you'll know without looking
    sndWinChord(); haptic(medal === "diamond" ? "heavy" : "medium");
    let burst = 0; const bi = setInterval(() => {
      popAt(Math.random() * trayC.width, Math.random() * trayC.height * 0.6, Object.values(SKIN)[Math.floor(Math.random() * 7)]);
      if (++burst > 8) clearInterval(bi);
    }, 70);
    setTimeout(() => showTiltResult(time, prev), 700);
  }
  /* ---------- win card v2 (depth plan Phase 0, LEVELS_SPEC §6) ----------
     Top→bottom additions: medal strip B/S/G/D (letter chips with thresholds; the
     run's tier lit), feats rows (this run: green check / dim), gem chip when the
     gem was found this run. DIAMOND is hidden until the level's first clear —
     the strip shows a teaser note instead (the mastery lap reveals itself). The
     old "chase" line is retired: the strip IS the chase, all thresholds visible. */
  const IC_GEM = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9z"></path><path d="M2 9h20"></path><path d="M12 22 8 9l4-6 4 6-4 13"></path></svg>';
  function medalStripHTML(medal, mt, firstClear, diaNew) {
    const chips = [
      { k: "bronze", L: "B", col: "#cd8a4a", sub: "CLEAR" },
      { k: "silver", L: "S", col: "#c8d0e8", sub: "≤ " + mt.silver.toFixed(1) + "s" },
      { k: "gold", L: "G", col: "#ffc63e", sub: "≤ " + mt.gold.toFixed(1) + "s" },
    ];
    // diamond hides until the level's first clear — EXCEPT when this very run
    // earned it (reveal-on-earn: the card must never announce DIAMOND up top
    // while the strip denies the tier exists)
    const showDia = !firstClear || medal === "diamond";
    if (showDia) chips.push({ k: "diamond", L: "D", col: "#7ee7ff", sub: "≤ " + mt.diamond.toFixed(1) + "s", dia: true });
    const row = chips.map(c => `
      <div class="mchip${medal === c.k ? " on" : ""}${c.dia ? " dia" : ""}" style="--mc:${c.col}">
        ${c.dia && diaNew ? '<i class="mnew">NEW</i>' : ""}
        <span class="mlet">${c.L}</span><span class="msub">${c.sub}</span>
      </div>`).join("");
    return `<div class="mstrip">${row}</div>` +
      (showDia ? "" : '<div class="mnote">Diamond appears after your first clear</div>');
  }
  // feats speak ONLY when earned (Qi: dim you-missed rows crowded the card):
  // one slim line of green chips for THIS run's feats, nothing otherwise
  function featChipsHTML(rf) {
    const got = featDefs().filter(d => rf[d.id]);
    if (!got.length) return "";
    return '<div class="featline">' + got.map(d => `<span class="fchip">✓ ${d.name}</span>`).join("") + "</div>";
  }
  // ONE card ends a world (Qi feedback 2026-07-12: the level-clear card → a
  // second "world complete" card → WORLDS → hunt-the-ladder was three stops of
  // friction). Clearing a world's LAST built level folds the world-complete
  // moment into THIS card (a ribbon) and its primary action flows STRAIGHT to
  // what's next: the next world if it's built (no ladder detour), else the
  // ladder (there's genuinely nowhere else to go until it ships).
  // card-chrome hygiene: the world intro skins #card (class + inline palette)
  // and normally cleans up in its ENTER handler — but any card that replaces
  // #card.innerHTML would otherwise inherit the leaked skin (review 2026-07-12).
  // Every card renderer resets the chrome first; cheap and idempotent.
  function resetCardChrome() {
    const c = $("#card");
    c.className = "card";
    c.style.background = ""; c.style.borderColor = "";
  }
  function showTiltResult(time, prevBest) {
    resetCardChrome();
    const sv = loadSave();
    const isPB = !prevBest || time <= prevBest;
    const medal = medalFor(time, level, P.par);         // THIS run's medal — the card rates the run you just played, not your best-ever
    const mt = medalTimes(level, P.par);
    const firstClear = !prevBest;
    // NEW tag rides the diamond chip until the player has SEEN it once
    // (persisted flag — a diamond earned before the chip ever displayed still
    // deserves its introduction)
    const diaShown = !firstClear || medal === "diamond";
    const diaNew = diaShown && !sv.diaSeen;
    if (diaNew) { sv.diaSeen = 1; writeSave(sv); }
    // dev hook (__tilt.result) can stage a card without a persisted best
    const bestShown = (sv.best && sv.best[level] != null) ? sv.best[level] : time;
    const gemChip = gem && gem.got
      ? `<div class="gemchip">${IC_GEM}<b>GEM FOUND</b><span>added to your collection</span></div>` : "";
    // world-transition state
    const w = E.worldFor(level);
    const isWorldEnd = level >= Math.min(w.to, E.LAST_LEVEL);
    const next = isWorldEnd ? E.WORLDS[w.id] : null;      // WORLDS is 0-indexed; id (1-based) → the next entry
    const nextBuilt = !!(next && next.from <= E.LAST_LEVEL);
    const ribbon = isWorldEnd
      ? `<div class="wc-ribbon" style="--ring:${w.ring}">★ WORLD ${w.id} · ${w.name.toUpperCase()} COMPLETE</div>` : "";
    let primLabel, primAction;
    if (!isWorldEnd) { primLabel = "NEXT ▸"; primAction = () => startLevel(level + 1); }
    else if (nextBuilt) { primLabel = next.name.toUpperCase() + " ▸"; primAction = () => startLevel(next.from); }
    else { primLabel = "WORLDS ▸"; primAction = () => { $("#ov").classList.remove("show"); openWorlds(); }; }
    $("#card").innerHTML = `
      <div class="glow"></div>
      ${ribbon}
      <div class="stars">${medalStarsHTML(medal)}</div>
      <h2>LEVEL ${level} CLEAR!</h2>
      <div class="creature"><span style="color:${MEDAL_COL[medal]}">${medal.toUpperCase()}</span>${isPB ? ' · <span style="color:var(--good)">New best!</span>' : ""}</div>
      ${medalStripHTML(medal, mt, firstClear, diaNew)}
      ${isWorldEnd ? "" : featChipsHTML(runFeats())}
      ${gemChip}
      <div class="stats">
        <div><span class="slab">TIME</span><b>${time.toFixed(1)}s</b></div>
        <div><span class="slab">BEST</span><b style="color:var(--gold)">${bestShown.toFixed(1)}s</b></div>
      </div>
      <div class="row">
        <button id="nextLvl" class="primary">${primLabel}</button>
        <button id="replay">${IC_RESTART}Replay</button>
      </div>`;
    $("#ov").classList.add("show");
    $("#nextLvl").onclick = primAction;
    $("#replay").onclick = () => startLevel(level);   // chase the best time
  }
  // DEV: preview the world-transition without playing through — fully clear a
  // world (silver on each level) and pop its world-end card. id defaults to the
  // current world. (`__tilt.finishWorld(n)` / `?shot=worldend`.)
  function devFinishWorld(id) {
    const w = E.WORLDS[((id || E.worldFor(level).id) - 1)] || E.WORLDS[0];
    const to = Math.min(w.to, E.LAST_LEVEL);
    const sv = loadSave(); sv.best = sv.best || {}; sv.medal = sv.medal || {};
    // DEV preview only — mark the world cleared at silver WITHOUT building every
    // level. E.build() BFS-GENERATES each procedural W1 board (~0.3s each), so
    // the old per-level loop cost ~9s on tap for World 1 (Qi: "took a long time
    // to respond"). Only the shown level `to` is built (by startLevel below);
    // the rest get a nominal best so the ladder still reads as cleared.
    for (let L = w.from; L <= to; L++) {
      if (!sv.medal[L]) sv.medal[L] = "silver";
      if (sv.best[L] == null) sv.best[L] = 8;
    }
    sv.level = Math.min(Math.max(sv.level || 1, to), E.LAST_LEVEL); writeSave(sv);
    startLevel(to);                                        // builds ONLY level `to`
    won = true; tiltPhase = "done";
    const t = Math.round(E.medalTimes(level, P.par).silver * 10) / 10;   // accurate time for the card
    sv.best[to] = t; writeSave(sv);
    showTiltResult(t, t);
  }
  /* ---------- Level Select (the home) — replaces the dev long-press jumper ----------
     The app opens HERE (design LEVELS_SPEC). Linear frontier unlock: level N is
     playable once N-1 is cleared; cleared levels stay open to replay for a better
     time; the rest are HARD-locked (the dead-end retry is free, so no safety-skip).
     Progress reuses the save game.js already writes — sv.best[L] (best seconds) ⇒
     cleared, sv.medal[L] ⇒ stars (bronze 1★ / silver 2★ / gold 3★ = cleared /
     under-target / under-par). Dev/screenshots still reach any level via ?lvl=N
     and window.__tilt.goto(). */
  function clearedLvl(sv, L) { return !!(sv.best && sv.best[L]); }
  function unlockedLvl(sv, L) { return L <= 1 || clearedLvl(sv, L - 1); }
  function frontierLvl(sv) { let L = 1; while (L < E.LAST_LEVEL && clearedLvl(sv, L)) L++; return L; }
  function starsFor(sv, L) { const m = (sv.medal || {})[L]; return m ? Math.min(3, MEDAL_RANK[m]) : (clearedLvl(sv, L) ? 1 : 0); }
  function totalStars(sv) { let s = 0; for (let L = 1; L <= E.LAST_LEVEL; L++) s += starsFor(sv, L); return s; }
  const IC_LOCK = '<svg class="tlock" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
  // DEV JUMP: with DEV_UNLOCK on, EVERY tile in the Level Select is tappable —
  // locked ones included — so you can jump to any level on the device without
  // grinding there (the on-device replacement for the old long-press jumper; the
  // grid shows a gold "· DEV: TAP ANY" tag so it's obvious). Flip to false for the
  // release hard-lock. Browser/console also have ?lvl=N and window.__tilt.goto(n).
  // ON only in DEBUG native builds (MainViewController injects window.__DEV_BUILD via
  // #if DEBUG) and browser dev (http://localhost). A Release/App-Store build has neither
  // → hard-locked grid, no "DEV: TAP ANY". No manual flag to forget.
  const DEV_UNLOCK = !!window.__DEV_BUILD || location.protocol === "http:";
  let lsOpen = false;
  // the grid shows ONE world's levels (the ladder is the world-level nav; a
  // 45-tile all-campaign wall stopped scaling the moment W2 shipped)
  function buildLevelSelect(w) {
    const sv = loadSave(), frontier = frontierLvl(sv);
    let html = "";
    for (let L = w.from; L <= Math.min(w.to, E.LAST_LEVEL); L++) {
      if (clearedLvl(sv, L)) {
        const st = starsFor(sv, L);
        let stars = ""; for (let i = 0; i < 3; i++) stars += `<i class="${i < st ? "on" : ""}">★</i>`;
        html += `<button class="lvltile done" data-l="${L}"><span class="tn">${L}</span>` +
          `<span class="ts">${stars}</span><span class="tb">${sv.best[L].toFixed(1)}s</span></button>`;
      } else if (L === frontier) {
        html += `<button class="lvltile play" data-l="${L}"><span class="tn">${L}</span>` +
          `<span class="tplay">PLAY</span></button>`;
      } else {
        html += `<button class="lvltile lock" data-l="${L}"${DEV_UNLOCK ? "" : " disabled"}>${IC_LOCK}<span class="tnl">${L}</span></button>`;
      }
    }
    const grid = $("#lsGrid");
    grid.innerHTML = html;
    grid.querySelectorAll(DEV_UNLOCK ? ".lvltile" : ".lvltile:not(.lock)").forEach(bn =>
      bn.onclick = () => { haptic("light"); closeLevelSelect(); startLevel(+bn.dataset.l); });
    $("#lsStarN").textContent = totalStars(sv);
    $("#lsDev").style.display = DEV_UNLOCK ? "inline" : "none";
  }
  function openLevelSelect(wid) {
    // grid header + backdrop carry the world identity (spec: the grid is the
    // world's interior, re-skinned in its palette); defaults to the world
    // currently being played
    const w = (wid && E.WORLDS[wid - 1]) || E.worldFor(level);
    $("#lsTitle").textContent = w.name.toUpperCase();
    $("#levelsel").style.background =
      `radial-gradient(130% 100% at 50% -20%, ${w.c1} 0%, ${w.c2} 55%, var(--bg) 100%)`;
    buildLevelSelect(w); lsOpen = true; $("#levelsel").classList.add("show");
  }
  function closeLevelSelect() { lsOpen = false; $("#levelsel").classList.remove("show"); }

  /* ---------- Worlds home (depth plan §6) — the ladder of 9 world cards ----------
     Linear unlock, one card per planet. Only W1 Tabletop is PLAYABLE today; the
     ladder shows where the campaign is going (locked cards carry each world's
     element name). The first locked world wears the unlock note — and stays
     HONEST: once Tabletop is fully cleared it says the next world is coming in
     an update, never pretending clearing unlocks something that isn't built. */
  let wsOpen = false, colOpen = false;
  const IC_PAD = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
  const IC_CHECK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  function worldProgress(sv, w) {
    const to = Math.min(w.to, E.LAST_LEVEL);
    let cleared = 0, stars = 0, total = Math.max(0, to - w.from + 1);
    for (let L = w.from; L <= to; L++) { if (clearedLvl(sv, L)) cleared++; stars += starsFor(sv, L); }
    return { cleared, stars, total };
  }
  function buildWorlds() {
    const sv = loadSave();
    let html = "", noteDone = false;
    const frontier = frontierLvl(sv);
    for (const w of E.WORLDS) {
      const playable = w.from <= E.LAST_LEVEL;
      const prev = E.WORLDS[w.id - 2];
      const prevDone = !prev || worldProgress(sv, prev).cleared >= worldProgress(sv, prev).total;
      const pr = worldProgress(sv, w);
      // a world you have TOUCHED is unlocked no matter how you got in (dev
      // tap-any, migrations, future promos) — a padlock on the world you are
      // actively playing is a lie (Qi device report)
      const touched = pr.cleared > 0 || (frontier >= w.from && frontier <= Math.min(w.to, E.LAST_LEVEL));
      const open = prevDone || touched;
      const eyebrow = `<span class="w-eyebrow">WORLD ${w.id} · LV ${w.from}–${w.to}</span>`;
      const nameEl = `<span class="w-name">${w.name}</span><span class="w-el">${w.element}</span>`;
      if (playable && open && pr.cleared >= pr.total) {
        // cleared world — check + progress + the gold-star tally
        html += `<div class="wcard done" data-w="${w.id}" style="--c1:${w.c1};--c2:${w.c2};--ring:${w.ring}">
          <span class="w-left">${eyebrow}${nameEl}</span>
          <span class="w-right"><span class="w-check">${IC_CHECK}</span>
            <span class="w-count">${pr.cleared}/${pr.total}</span>
            <span class="w-stars">★ ${pr.stars}</span></span></div>`;
      } else if (playable && open) {
        // the CURRENT world — ring glow, PLAY pill, progress track
        html += `<div class="wcard cur" data-w="${w.id}" style="--c1:${w.c1};--c2:${w.c2};--ring:${w.ring};--ring22:${w.ring}22">
          <span class="w-left">${eyebrow}${nameEl}
            <span class="w-prog"><i style="width:${Math.round(100 * pr.cleared / Math.max(1, pr.total))}%"></i></span></span>
          <span class="w-right"><button class="w-play" data-w="${w.id}">PLAY</button>
            <span class="w-count">${pr.cleared}/${pr.total}</span></span></div>`;
      } else if (!playable) {
        // COMING SOON — this world isn't built yet. NEVER a padlock, regardless
        // of the previous world's state (Qi feedback: a lock says "clear the one
        // before it", but you can't unlock what doesn't exist). Distinct "soon"
        // state: SOON tag, lighter dim, a tap explains it; only the FIRST notes.
        const note = !noteDone ? (noteDone = true, `<span class="w-note soon">Coming in the next update</span>`) : "";
        html += `<div class="wcard soon" data-wname="${w.name}" style="--c1:${w.c1};--c2:${w.c2};--ring:${w.ring}">
          <span class="w-left">${eyebrow}${nameEl}${note}</span>
          <span class="w-right"><span class="w-soon">SOON</span></span></div>`;
      } else {
        // HARD LOCK — a BUILT world gated behind an uncleared one (the real
        // progression gate; padlock + "clear X to unlock" is honest here)
        let note = "";
        if (!noteDone) { noteDone = true; note = `<span class="w-note">Clear ${prev ? prev.name : ""} to unlock</span>`; }
        html += `<div class="wcard lock" style="--c1:${w.c1};--c2:${w.c2};--ring:${w.ring}">
          <span class="w-left">${eyebrow}${nameEl}${note}</span>
          <span class="w-right"><span class="w-pad">${IC_PAD}</span></span></div>`;
      }
    }
    const list = $("#wsList");
    list.innerHTML = html;
    list.querySelectorAll(".wcard.cur,.wcard.done").forEach(cd =>
      cd.onclick = () => { haptic("light"); closeWorlds(); openLevelSelect(+cd.dataset.w); });
    list.querySelectorAll(".w-play").forEach(bn =>
      bn.onclick = ev => { ev.stopPropagation(); haptic("light"); closeWorlds(); startLevel(frontierLvl(loadSave())); });
    list.querySelectorAll(".wcard.soon").forEach(cd =>
      cd.onclick = () => { haptic("light"); toast(cd.dataset.wname + " — coming in the next update"); });
    $("#wsStarN").textContent = totalStars(sv);
  }
  function openWorlds() { buildWorlds(); wsOpen = true; $("#worldsel").classList.add("show"); }
  function closeWorlds() { wsOpen = false; $("#worldsel").classList.remove("show"); }

  /* ---------- Collection (depth plan §6) — gems found + marble skins ----------
     Gems: one tile per gem level, found = the gem drawn in its own colour,
     missing = "?" . Skins: 2×2, tap an unlocked skin to equip (persists; applies
     to every marble everywhere). Rule of the house: earned by medals, feats and
     gems — never bought. */
  // The Collection screen does ZERO builds: the gem-level LIST is free (E.hasGem)
  // and each gem's COLOUR comes from E.gemColorFor(L) (seed-derived, board-independent
  // — see engine.js). Previously it E.build()'d every gem-level for the colour, which
  // BFS-generates W1 boards = ~2s desktop / 4-8s device of cold-start lag (Qi). Works
  // for legacy `1` saves too — the colour never needed the built board.
  function buildCollection() {
    const sv = loadSave();
    const got = sv.gems || {};
    const levels = [];
    for (let L = 1; L <= E.LAST_LEVEL; L++) if (E.hasGem(L)) levels.push(L);
    const nGot = levels.filter(L => got[L]).length;
    let html = `<div class="col-lab">GEMS <b>${nGot}</b> / ${levels.length}</div><div class="gemgrid">`;
    for (const L of levels) {
      html += got[L]
        ? `<div class="gemtile" title="Level ${L}"><canvas data-gem="${E.gemColorFor(L)}" width="52" height="52"></canvas></div>`
        : `<div class="gemtile miss" title="Level ${L}">?</div>`;
    }
    html += `</div><div class="col-lab">MARBLE SKINS</div><div class="skingrid">`;
    for (const s of SKINS) {
      const un = s.need(sv), eq = skinFx === s.id;
      html += `<div class="skintile${eq ? " eq" : ""}${un ? "" : " lock"}" data-skin="${s.id}">
        ${eq ? '<span class="stag">EQUIPPED</span>' : ""}
        <canvas data-prev="${s.id}" width="112" height="112"></canvas>
        <span class="sname">${s.name}</span><span class="scond">${un ? (s.id === "classic" ? s.cond : "unlocked — " + s.cond) : s.cond}</span></div>`;
    }
    html += `</div><div class="col-note">Earned by medals, feats and gems — never bought.</div>`;
    const body = $("#colBody");
    body.innerHTML = html;
    body.querySelectorAll("canvas[data-gem]").forEach(cv => {
      const c = cv.getContext("2d");
      drawGem(c, 26, 26, SKIN[cv.dataset.gem], 15, 1.8);
    });
    body.querySelectorAll("canvas[data-prev]").forEach(cv => {
      const c = cv.getContext("2d");
      c.setTransform(2, 0, 0, 2, 0, 0);            // 2× backing for crisp preview
      const saved = skinFx; skinFx = cv.dataset.prev;
      drawMarbleAt(c, 28, 27, SKIN.b, 17, false, null);
      skinFx = saved;
    });
    body.querySelectorAll(".skintile").forEach(tl => {
      tl.onclick = () => {
        const s = SKINS.find(x => x.id === tl.dataset.skin);
        const svNow = loadSave();
        if (!s.need(svNow)) { haptic("light"); toast("Locked — " + s.cond); return; }
        svNow.skin = s.id; writeSave(svNow); applySkin();
        track("skin_equip", { skin: s.id });
        haptic("light"); buildCollection();
      };
    });
  }
  function openCollection() { buildCollection(); colOpen = true; $("#collect").classList.add("show"); }
  function closeCollection() { colOpen = false; $("#collect").classList.remove("show"); }

  /* ---------- Settings (design screenshot 11) — a modal in the #ov overlay ----------
     Toggles for Sound Effects + Vibration (persisted in the save, default ON; gate
     SFX_ON/VIBE_ON via applySettings). Music has NO track yet → row HIDDEN per the
     spec ("add one or hide until it exists"). How to Play replays the tutorial. */
  const IC_SOUND = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
  const IC_VIBE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>';
  const IC_HELP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
  const IC_X = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  function settingRow(id, ic, label, key) {
    const on = !loadSave()[key];
    return `<button class="set-row" id="${id}"><span class="set-ic${on ? "" : " off"}">${ic}</span>` +
      `<span class="set-lbl">${label}</span><span class="set-tog${on ? " on" : ""}"></span></button>`;
  }
  // the #ov overlay sits at z 20 — UNDER the nav panels (z 25/26), so the
  // dead-end banner can never float above an opened panel. Settings/tutorial
  // opened FROM a panel header must therefore lift the overlay above it.
  function overlayAbovePanels() { $("#ov").classList.toggle("above", lsOpen || wsOpen || colOpen); }
  function openSettings() {
    overlayAbovePanels();
    resetCardChrome();
    $("#card").className = "card settings";
    $("#card").innerHTML =
      `<div class="set-head"><h2>SETTINGS</h2><button id="setClose" class="set-x">${IC_X}</button></div>` +
      settingRow("rowSound", IC_SOUND, "Sound Effects", "soundOff") +
      settingRow("rowVibe", IC_VIBE, "Vibration", "vibeOff") +
      `<div class="set-div"></div>` +
      `<button class="set-row2" id="rowHow"><span class="set-ic sm">${IC_HELP}</span>` +
      `<span class="set-lbl">How to Play</span><span class="set-chev">›</span></button>` +
      // DEV row — on-device world-transition preview (debug builds only, same
      // DEV_UNLOCK gate as the tap-any level grid; stripped from Release). Pops
      // the current world's world-end card so the transition needs zero playthrough.
      (DEV_UNLOCK ? `<button class="set-row2" id="rowDev"><span class="set-ic sm" style="color:var(--gold)">⚑</span>` +
        `<span class="set-lbl" style="color:var(--gold)">DEV · Preview world end</span><span class="set-chev">›</span></button>` : "") +
      `<div class="set-ver">Tilt v1.0 · com.jfun.tilt</div>`;
    $("#ov").classList.add("show");
    // close must be UNKILLABLE (Qi device report: X unresponsive; browser repro
    // clean on every path -> harden all paths + surface errors via dev toasts):
    // click + touchend on the X, plus tap-outside-the-card closes like any sheet.
    const xBtn = $("#setClose");
    xBtn.onclick = closeSettings;
    xBtn.addEventListener("touchend", e => { e.preventDefault(); closeSettings(); }, { passive: false });
    $("#ov").onclick = e => { if (e.target === $("#ov")) closeSettings(); };
    $("#rowSound").onclick = () => toggleSetting("soundOff", "#rowSound");
    $("#rowVibe").onclick = () => toggleSetting("vibeOff", "#rowVibe");
    $("#rowHow").onclick = () => { closeSettings(); showTutorial(() => {}); };
    if (DEV_UNLOCK) $("#rowDev").onclick = () => { closeSettings(); devFinishWorld(E.worldFor(level).id); };
  }
  function toggleSetting(key, sel) {
    const sv = loadSave(); sv[key] = !sv[key]; writeSave(sv); applySettings();
    const on = !sv[key];
    $(sel).querySelector(".set-tog").classList.toggle("on", on);
    $(sel).querySelector(".set-ic").classList.toggle("off", !on);
    haptic("light");   // self-gates: silent if vibration was just turned off
  }
  function closeSettings() { $("#ov").onclick = null; $("#card").className = "card"; $("#ov").classList.remove("show", "above"); }

  // Visual hint chips (design 5a): every hint is [glyph] + short text. Glyphs are
  // the game's own pieces — tipping phone, bubble level, wall block, wedged ball —
  // built as plain DOM, animated by CSS keyframes only (no rAF, no perf cost).
  const GLYPHS = {
    tilt: '<span class="g-rock"><span class="g-phone"><i class="g-ball"></i></span></span>',
    wall: '<span class="g-wall"></span>',
    hill: '<span class="g-wall"></span>',   // hills reuse the block glyph for now
    ice: '<span class="g-ice"></span>',     // pale glass band (dormant — Rime cut)
    sand: '<span class="g-sand"></span>',   // warm grain pad (dormant — Dune cut)
    gate: '<span class="g-gate"><i></i><i></i><i></i></span>',   // barred door (Foundry)
    post: '<span class="g-post"></span>',   // metal pillar + pink ring (Chime)
    stuck: '<span class="g-poprock"><i class="g-popring"></i><i class="g-ball g-popout"></i></span>',
    blocked: '<span class="g-phone g-noflow"><i class="g-slash"></i></span>',
  };
  function flashHint(t, hot, glyph) {
    const h = $("#hint");
    h.innerHTML = '<span class="chip-hint' + (hot ? " hot" : "") + '">' +
      (GLYPHS[glyph] || "") + "<span>" + t + "</span></span>";
    h.style.opacity = 1;
  }
  function buzz(ms) { if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 1600); }

  /* ---------- controls ---------- */
  function restart() {
    won = false; lost = false;
    buildWorld();
    $("#ov").classList.remove("show", "deadend");
    updateHUD(); draw(); showOnboarding();
  }

  /* header layers button → WORLDS home (the ladder); tapping a world opens its
     level grid; the grid's back-chevron returns to the ladder; the ladder's
     back-chevron resumes the board. Collection lives on the ladder header. */
  $("#levelsBtn").onclick = () => { haptic("light"); openWorlds(); };
  $("#wsBack").onclick = () => { haptic("light"); closeWorlds(); };
  $("#wsCollect").onclick = () => { haptic("light"); openCollection(); };
  $("#colBack").onclick = () => { haptic("light"); closeCollection(); };
  $("#lsBack").onclick = () => { haptic("light"); closeLevelSelect(); openWorlds(); };
  /* settings ⚙ — in-game header (right, replaced restart) + panel headers */
  $("#settingsBtn").onclick = () => { haptic("light"); openSettings(); };
  $("#lsSettings").onclick = () => { haptic("light"); openSettings(); };
  $("#wsSettings").onclick = () => { haptic("light"); openSettings(); };

  /* tray input: tap anywhere on the tray to start the run */
  trayC.addEventListener("touchstart", e => { e.preventDefault(); startTiltRun(); }, { passive: false });
  trayC.addEventListener("mousedown", startTiltRun);
  const KEYMAP = { ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R", w: "U", s: "D", a: "L", d: "R" };
  window.addEventListener("keydown", e => {
    const d = KEYMAP[e.key];
    if (d) { e.preventDefault(); startTiltRun(); keysHeld[d] = true; }
  });
  window.addEventListener("keyup", e => { const d = KEYMAP[e.key]; if (d) keysHeld[d] = false; });
  window.addEventListener("resize", sizeBoards);

  /* ---------- boot ---------- */
  // dev-only: ?lvl=N jumps straight to a level (skips tutorial + intro cards)
  // so headless WebKit screenshots can reach any state — inert in Capacitor
  try {
    const q = new URLSearchParams(location.search);
    if (q.has("lvl")) { const sv = loadSave(); sv.tutSeen = 1; sv.rulesV3 = 1; sv.mvpV1 = 1; sv.sawV1 = 1; sv.foundryV1 = 1; sv.medalV2 = 1; sv.wallsSeen = 1; sv.worldSeen = {}; for (const w of E.WORLDS) if (w.id > 1) sv.worldSeen[w.id] = 1; sv.level = +q.get("lvl") || 1; writeSave(sv); }
  } catch (e) {}
  {
    // rules migration: lodge-and-escape restored + dead-end game over (layouts
    // regenerated again), so old best times aren't comparable — clear them
    // once; keep level progress
    const sv = loadSave();
    if (!sv.rulesV3) { sv.rulesV3 = 1; delete sv.best; writeSave(sv); }
    // curated onboarding changed L1–6 layouts + added medals — old bests/medals
    // for those don't compare; clear once, keep progress (capped to the campaign)
    if (!sv.mvpV1) {
      sv.mvpV1 = 1; delete sv.best; delete sv.medal;
      if (sv.level) sv.level = Math.min(sv.level, E.LAST_LEVEL);
      writeSave(sv);
    }
    // sawtooth reorder (v1.1): level numbers now name DIFFERENT boards — old
    // bests/medals/feats/gems keyed by number don't compare; clear once
    // (precedent: rulesV3/mvpV1; v1.0 is still in review, so no live players)
    if (!sv.sawV1) {
      sv.sawV1 = 1; delete sv.best; delete sv.medal; delete sv.feats; delete sv.gems; delete sv.diaSeen;
      if (sv.level) sv.level = Math.min(sv.level, E.LAST_LEVEL);
      writeSave(sv);
    }
    // Foundry (one-shot, 2026-07-13): Dune (sand) cut at the kill-gate — W2
    // 31–45 are all-new gate boards, so per-level records above 30 name
    // different boards; clear just those, re-arm the W2 intro card
    if (!sv.foundryV1) {
      sv.foundryV1 = 1;
      for (const o of [sv.best, sv.medal, sv.feats, sv.gems]) if (o) for (const k in o) if (+k > 30) delete o[k];
      if (sv.worldSeen) delete sv.worldSeen[2];
      if ((sv.level || 1) > 31) sv.level = 31;
      delete sv.done;
      writeSave(sv);
    }
    // Medals V2 (one-shot): medal thresholds moved from the guessed par-formula to
    // MEASURED fastest-solve times (the old formula shipped impossible diamonds).
    // Re-derive every cleared level's medal from its stored best time under the new
    // thresholds so earned medals stay honest — kept times, upgraded stars.
    if (!sv.medalV2) {
      sv.medalV2 = 1;
      sv.medal = sv.medal || {};
      if (sv.best) for (const k in sv.best) sv.medal[k] = E.medalFor(sv.best[k], +k);
      writeSave(sv);
    }
  }
  if (DEV_UNLOCK) {
    // dev builds: uncaught errors become a visible toast — the device has no console
    window.addEventListener("error", e => { try { toast("⚠ " + (e.message || "error").slice(0, 60)); } catch (x) {} });
    window.addEventListener("unhandledrejection", e => { try { toast("⚠ " + String(e.reason).slice(0, 60)); } catch (x) {} });
  }
  applySettings();     // load persisted Sound/Vibration toggles before the first sound
  applySkin();         // equipped marble finish (collection cosmetic)
  tryNativeMotion();   // native accelerometer needs no gesture/permission — flow from boot
  try { window.__tilt = { puzzle: () => P, level: () => level,
    goto: n => startLevel(n), won: () => won, restart,
    world: () => world, phase: () => tiltPhase,
    start: startTiltRun, setGravity: (gx, gy) => { devG = (gx == null) ? null : { gx, gy }; },
    feedVec: (x, y, z) => lpVec(x, y, z, 1), angles: () => tiltAngles(),
    setCal: (p, r) => { cal = { pitch: p, roll: r }; }, gravity: () => currentGravity(),
    levelsel: openLevelSelect, frontier: () => frontierLvl(loadSave()), homeAngle: m => homeAngle(m), checkSeal: () => { checkSeal(); return lost; }, deadInfo: () => deadInfo,
    worlds: openWorlds, collection: openCollection, finishWorld: id => devFinishWorld(id),
    worldIntro: id => showWorldIntro(E.WORLDS[(id || 2) - 1], () => {}),
    gem: () => gem, feats: () => runFeats(), save: () => loadSave(), setSkin: id => { const s = loadSave(); s.skin = id; writeSave(s); applySkin(); },
    result: (tm, prev) => showTiltResult(tm == null ? 3.0 : tm, prev),
    tut: () => tutWorld, tutStep: s => tutStepFn && tutStepFn(s), showTut: () => showTutorial(() => {}),
    showWalls: () => showMechanicIntro(() => {}),
    stepN: (n, g) => {
      tiltPhase = "running";
      for (let i = 0; i < n; i++) {
        PH.step(world, g || currentGravity()); consumeEvents(); checkDeadEnd(); checkGateBlocks();
        let smax = 0, freeN = 0;   // same run signals as tiltLoop — feats/gems behave identically here
        for (const m of world.marbles) { if (m.captured) continue; freeN++; const s = Math.hypot(m.vx, m.vy); if (s > smax) smax = s; }
        trackRunSignals(smax, freeN, PH.DT);
      }
      let guard = 0;
      while (PH.solved(world) && !world.marbles.every(m => m.sink && m.sink.t >= world.params.sinkTime) && guard++ < 120)
        PH.step(world, { gx: 0, gy: 0 });
      draw(); updateTimePill();
      if (!won && !lost && PH.solved(world)) winTilt();
    } }; } catch (e) {}
  {
    // ---- dev screenshot harness (App Store captures) — inert unless ?shot= is set ----
    //   ?shot=play&lvl=<n> · ?shot=win&lvl=<n>&s=<1-3> · ?shot=levels · ?shot=howto
    // Driven by scripts/dev/shots.cjs (headless Chrome/CDP at exact device pixel sizes).
    const q = new URLSearchParams(window.__SHOT__ || location.search);
    const shot = q.get("shot");
    if (shot) {
      const sv = loadSave();
      sv.tutSeen = 1; sv.rulesV3 = 1; sv.mvpV1 = 1; sv.sawV1 = 1; sv.foundryV1 = 1; sv.medalV2 = 1; sv.wallsSeen = 1;
      sv.worldSeen = {}; for (const w of E.WORLDS) if (w.id > 1) sv.worldSeen[w.id] = 1;   // dev/shots skip intro cards (contract)
      if (shot === "levels" || shot === "worlds" || shot === "collect") {   // seed a rich, mostly-cleared save
        sv.best = {}; sv.medal = {}; sv.gems = {}; sv.feats = {};
        const meds = ["gold", "diamond", "gold", "silver", "gold", "silver", "gold", "gold", "silver", "gold", "gold"];
        const times = [4.2, 7.1, 5.8, 9.3, 6.0, 11.2, 8.7, 10.4, 7.9, 6.6, 8.1];
        for (let L = 1; L <= 11; L++) { sv.best[L] = times[L - 1]; sv.medal[L] = meds[L - 1]; }
        for (const L of [2, 5, 8]) sv.gems[L] = 1;
        for (let L = 1; L <= 8; L++) sv.feats[L] = { c: 1, l: 1, s: L % 2 };
      }
      writeSave(sv);
      const lvl = +(q.get("lvl") || (shot === "win" ? 6 : 12)) || 12;
      if (shot === "howto") { startLevel(5); showTutorial(function () {}); }
      else if (shot === "levels") { startLevel(12); openLevelSelect(); try { $("#lsDev").style.display = "none"; } catch (e) {} }
      else if (shot === "worlds") { startLevel(12); openWorlds(); }
      else if (shot === "collect") { startLevel(12); openCollection(); }
      else if (shot === "worldend") { devFinishWorld(1); }
      else if (shot === "worldintro") { startLevel(lvl); showWorldIntro(E.WORLDS[1], function () {}); }
      else if (shot === "win") {
        startLevel(lvl);
        const stars = Math.max(1, Math.min(3, +(q.get("s") || 3)));
        const mt = medalTimes(level, P.par);
        const time = Math.round((stars === 3 ? Math.max(0.6, mt.gold - 0.6) : stars === 2 ? (mt.gold + mt.silver) / 2 : mt.silver + 1) * 10) / 10;
        const svw = loadSave(); svw.best = svw.best || {}; svw.best[lvl] = time; writeSave(svw);
        won = true; tiltPhase = "done";
        showTiltResult(time, null);
      } else { startLevel(lvl); }                    // play
      // headless: force board resize recomputes so it fits the final viewport width
      [120, 420, 900].forEach(function (t) { setTimeout(function () { sizeBoards(); draw(); }, t); });
    } else {
      // Boot straight INTO the game (feel call: new player lands on level 1 + tutorial,
      // not the Level Select). Returning players resume at their frontier; ?lvl=N jumps.
      let bootLvl = 0;
      try { if (q.has("lvl")) bootLvl = +q.get("lvl") || 1; } catch (e) {}
      startLevel(bootLvl || frontierLvl(loadSave()));
    }
  }
  sizeBoards();
})();
