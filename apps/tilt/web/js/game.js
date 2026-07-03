/* Tilt — game UI. Faithful port of the original prototypes/09-tilt.html feel
   (twin boards, glossy marbles, 3D tray tip, landing pops, undo/restart, result
   card + creature collection) re-plumbed from a daily onto a LEVEL CAMPAIGN:
   engine.build(level), win → next level. The one hardening change: tilt
   animation completion has a setTimeout fail-safe so game state never depends
   on requestAnimationFrame (throttled tabs / webviews freeze rAF). */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const E = window.GameEngine;
  const PH = window.TrayPhysics;
  const N = E.N, PAL = E.PAL;

  /* ---------- audio (impacts sell the physics) ---------- */
  let AC = null;
  function initAudio() {
    if (AC) { resumeAudio(); return; }
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  // iOS suspends the AudioContext when the app backgrounds and does NOT auto-resume
  function resumeAudio() { if (AC && AC.state !== "running") { try { AC.resume().catch(() => {}); } catch (e) {} } }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resumeAudio(); });
  window.addEventListener("focus", resumeAudio);
  window.addEventListener("pageshow", resumeAudio);
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
  const sndAt = {};
  function throttled(kind, ms) { const now = performance.now(); if (sndAt[kind] && now - sndAt[kind] < ms) return false; sndAt[kind] = now; return true; }
  // glass, not wood: high, short, bright — throttled PER PAIR so chain clacks all speak
  function sndClack(vol, pitch, key, dead) {
    if (!throttled("clack" + (key || ""), 45)) return;
    if (dead) { tone(760 * pitch, 430 * pitch, 0.045, 0.3 * vol, "sine"); noiseBurst(0.02, 0.1 * vol, 1500); return; }
    tone(1900 * pitch, 1350 * pitch, 0.035, 0.26 * vol, "sine"); noiseBurst(0.02, 0.14 * vol, 3000);
  }
  function sndWallHit(vol) { if (!throttled("wall", 60)) return; tone(120, 65, 0.1, 0.4 * vol, "sine"); noiseBurst(0.04, 0.2 * vol, 700); }
  // continuous rolling rumble — gain/brightness track the fastest free marble
  let rollSrc = null, rollGain = null, rollFilter = null;
  function initRollSound() {
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
  function setRollLevel(maxSpeed) {   // maxSpeed in cells/s; 0 silences
    if (!rollGain || !AC) return;
    const g = Math.min(0.11, maxSpeed / 15 * 0.11);
    rollGain.gain.setTargetAtTime(g, AC.currentTime, 0.06);
    rollFilter.frequency.setTargetAtTime(300 + maxSpeed * 70, AC.currentTime, 0.06);
  }
  function sndCapture() { tone(500, 760, 0.12, 0.25, "sine"); tone(760, 1050, 0.2, 0.2, "triangle", 0.07); }
  function sndRim() { if (!throttled("rim", 90)) return; tone(300, 180, 0.05, 0.2, "triangle"); tone(250, 140, 0.05, 0.16, "triangle", 0.05); noiseBurst(0.03, 0.12, 1200); }
  function sndWinChord() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.28, 0.22, "triangle", i * 0.09)); }
  function haptic(style) {
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H && H.impact) { H.impact({ style: style === "medium" ? "MEDIUM" : "LIGHT" }).catch(() => {}); return; }
    if (navigator.vibrate) try { navigator.vibrate(style === "medium" ? 20 : 10); } catch (e) {}
  }

  /* ---------- campaign persistence ---------- */
  const SK = "tilt.campaign.v1";
  function loadSave() { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch (e) { return {}; } }
  function writeSave(o) { try { localStorage.setItem(SK, JSON.stringify(o)); } catch (e) {} }

  /* ---------- game state ---------- */
  let level = 1, P, state, history, moveCount, won, firstHintShown = false;
  const DIR_EMOJI = { U: "⬆️", D: "⬇️", L: "⬅️", R: "➡️" };
  let moveTrail = [];

  /* ---------- tilt-the-phone mode state ---------- */
  // mode: 'tilt' = real physics driven by the device accelerometer (the hero on
  // a phone); 'swipe' = the classic discrete slide (fallback + desktop).
  let mode = "swipe";
  let world = null, tiltPhase = "ready"; // ready → running → done
  // Tilt lives in ANGLE space. We keep the low-passed 3-axis gravity DIRECTION
  // vector and derive pitch/roll; calibration subtracts ANGLES. Subtracting raw
  // vector components is a trap: a few degrees of grip roll has an x-component
  // that scales with cos(pitch), so pitching the phone up leaks a phantom
  // sideways force ("more gravity on the left/right when tilting straight up").
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
    if (vecOK) return { pitch: Math.atan2(-motV.y, -motV.z), roll: Math.atan2(motV.x, -motV.z) };
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
  // neutral-tilt baseline: whatever ANGLE you hold the phone at when the run arms
  // becomes "flat" — calibrated per-axis in angle space so pitch and roll never
  // bleed into each other.
  let cal = { pitch: 0, roll: 0 };
  function currentGravity() {
    if (devG) return devG;
    let kx = 0, ky = 0;
    if (keysHeld.L) kx -= 4; if (keysHeld.R) kx += 4;
    if (keysHeld.U) ky -= 4; if (keysHeld.D) ky += 4;
    if (kx || ky) return { gx: kx, gy: ky };
    const t = tiltAngles();
    let gx = FLIP_X * 9.8 * Math.sin(t.roll - cal.roll);
    let gy = FLIP_Y * 9.8 * Math.sin(t.pitch - cal.pitch);
    const mg = Math.hypot(gx, gy);
    if (mg > 9.8) { gx *= 9.8 / mg; gy *= 9.8 / mg; }
    return { gx, gy };
  }

  const trayC = $("#tray"), tctx = trayC.getContext("2d");
  let CELL = 40, R = 15;

  function sizeBoards() {
    // ONE big board — the tray gets the full width (and never outgrows the height)
    const availW = Math.min(window.innerWidth - 28, 480 - 28);
    const availH = Math.max(200, window.innerHeight - 320); // header + meta + hint + footer
    const traySize = Math.min(availW, availH);
    CELL = Math.floor(traySize / N);
    const tpx = CELL * N;
    trayC.width = tpx; trayC.height = tpx; trayC.style.width = tpx + "px"; trayC.style.height = tpx + "px";
    R = CELL * 0.36;
    if (P) draw();
  }

  function startLevel(n) {
    level = n;
    P = E.build(n);
    if (!P) { flashHint("Could not build this level — try again."); return; }
    state = E.cloneState(P.init);
    history = []; moveCount = 0; won = false; moveTrail = []; firstHintShown = false;
    const sv = loadSave();
    sv.level = Math.max(sv.level || 1, n);
    writeSave(sv);
    $("#ov").classList.remove("show");
    if (mode === "tilt") buildWorld();
    applyModeUI();
    updateHUD();
    draw();
    showOnboarding();
  }
  // physics world in CELL units (resize-proof; rendering scales by CELL)
  function buildWorld() {
    world = PH.createWorld({
      w: N, h: N, pad: 0, unit: 1,
      marbles: P.init.marbles.map(m => ({ x: m.x + 0.5, y: m.y + 0.5, r: 0.36, c: m.c })),
      holes: P.holesArr.map(h => ({ x: h.x + 0.5, y: h.y + 0.5, r: 0.42, c: h.c })),
    });
    tiltPhase = "ready";
    watchdogShown = false;
    lastCaptureT = 0;
    rollAng.length = 0; rollHead.length = 0;
    updateTimePill();
  }
  function showOnboarding() {
    const h = $("#hint");
    if (mode === "tilt") {
      h.innerHTML = "<b>Tap the tray</b>, then tilt your phone — the marbles follow gravity";
    } else {
      h.innerHTML = level === 1
        ? "Swipe the tray &mdash; <b>every marble rolls together</b>"
        : "Level " + level + " &mdash; " + P.holesArr.length + " marbles, " + P.holesArr.length + " holes";
    }
    h.style.opacity = 1;
  }
  function updateHUD() {
    $("#lvlN").textContent = level;
    $("#moves").textContent = moveCount;
    $("#par").textContent = P.par;
  }

  /* ---------- drawing ---------- */
  function key(x, y) { return x + "," + y; }
  function roundedHole(ctx, x, y, c, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 1.04, 0, 7);
    ctx.fillStyle = "#05060b";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = c + "cc";        // bright ring — the goal must read at a glance
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, 7);     // colored dimple at the bottom of the hole
    ctx.fillStyle = c + "2e";
    ctx.fill();
    ctx.restore();
  }
  function marbleGrad(ctx, x, y, c, r) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.18, shade(c, 40));
    g.addColorStop(0.7, c);
    g.addColorStop(1, shade(c, -55));
    return g;
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  let renderPos = null; // index -> {x,y px} during animation
  function cellCenter(x, y) { return [x * CELL + CELL / 2, y * CELL + CELL / 2]; }

  function drawGridBg() {
    tctx.clearRect(0, 0, trayC.width, trayC.height);
    tctx.strokeStyle = "#ffffff08";
    for (let i = 1; i < N; i++) {
      tctx.beginPath(); tctx.moveTo(i * CELL, 4); tctx.lineTo(i * CELL, trayC.height - 4); tctx.stroke();
      tctx.beginPath(); tctx.moveTo(4, i * CELL); tctx.lineTo(trayC.width - 4, i * CELL); tctx.stroke();
    }
  }
  function drawMarbleAt(px, py, col, r, locked, roll) {
    tctx.beginPath(); tctx.arc(px, py + r * 0.25, r * 0.9, 0, 7); tctx.fillStyle = "#00000040"; tctx.fill();
    tctx.beginPath(); tctx.arc(px, py, r, 0, 7);
    tctx.fillStyle = marbleGrad(tctx, px, py, col, r);
    tctx.fill();
    // rolling-texture cue: a dark swirl revolving with the roll — without it the
    // marble reads as a sliding puck no matter how good the dynamics are
    if (roll && Math.cos(roll.ang) > 0) {
      const k = Math.cos(roll.ang);
      const off = Math.sin(roll.ang) * r * 0.45;
      const sx = px + Math.cos(roll.head) * off, sy = py + Math.sin(roll.head) * off;
      tctx.save();
      tctx.beginPath(); tctx.arc(px, py, r * 0.96, 0, 7); tctx.clip();
      tctx.globalAlpha = 0.22 * k;
      tctx.beginPath(); tctx.arc(sx, sy, r * 0.34, 0, 7); tctx.fillStyle = "#1a1030"; tctx.fill();
      tctx.restore();
      tctx.globalAlpha = 1;
    }
    if (locked) {
      tctx.lineWidth = 2.5; tctx.strokeStyle = col; tctx.stroke();
      tctx.beginPath(); tctx.arc(px, py, r * 1.25, 0, 7); tctx.strokeStyle = col + "40"; tctx.lineWidth = 3; tctx.stroke();
    }
    tctx.beginPath(); tctx.arc(px - r * 0.32, py - r * 0.36, r * 0.18, 0, 7); tctx.fillStyle = "#ffffffcc"; tctx.fill();
  }
  // a captured ball: no drop shadow, darkened, and the hole's rim ring re-stroked
  // OVER its edge — it is IN the recess, under the lip
  function drawRecessedAt(px, py, col, r, ringX, ringY) {
    tctx.beginPath(); tctx.arc(px, py, r, 0, 7);
    tctx.fillStyle = marbleGrad(tctx, px, py, col, r);
    tctx.fill();
    tctx.fillStyle = "rgba(0,0,0,0.32)";
    tctx.beginPath(); tctx.arc(px, py, r, 0, 7); tctx.fill();
    tctx.lineWidth = 3; tctx.strokeStyle = col + "cc";
    tctx.beginPath(); tctx.arc(ringX, ringY, R * 1.04, 0, 7); tctx.stroke();
  }
  function draw() { if (mode === "tilt" && world) drawTiltBoard(); else drawSwipeBoard(); }
  function drawSwipeBoard() {
    drawGridBg();
    for (const k in P.holes) {
      const [x, y] = k.split(",").map(Number);
      const [cx, cy] = cellCenter(x, y);
      const filled = state.marbles.some(m => m.fixed && m.x === x && m.y === y);
      if (!filled) roundedHole(tctx, cx, cy, PAL[P.holes[k]], R);
    }
    state.marbles.forEach((m, i) => {
      let px, py;
      if (renderPos && renderPos[i]) { px = renderPos[i].x; py = renderPos[i].y; }
      else { const c = cellCenter(m.x, m.y); px = c[0]; py = c[1]; }
      drawMarbleAt(px, py, PAL[m.c], R, m.fixed);
    });
  }
  function drawTiltBoard() {
    drawGridBg();
    // holes stay visible even when filled — the captured ball sits recessed inside
    for (const h of world.holes) roundedHole(tctx, h.x * CELL, h.y * CELL, PAL[h.c], R);
    // captured balls first (they're IN the tray floor, under the live balls)
    world.marbles.forEach(m => {
      if (!m.captured) return;
      const rp = PH.renderPos(world, m);
      drawRecessedAt(rp.x * CELL, rp.y * CELL, PAL[m.c], R * rp.scale,
        (m.sink ? m.sink.toX : m.x) * CELL, (m.sink ? m.sink.toY : m.y) * CELL);
    });
    world.marbles.forEach((m, i) => {
      if (m.captured) return;
      const rp = PH.renderPos(world, m);
      drawMarbleAt(rp.x * CELL, rp.y * CELL, PAL[m.c], R * rp.scale, false,
        rollAng[i] != null ? { ang: rollAng[i], head: rollHead[i] || 0 } : null);
    });
    if (tiltPhase === "ready") {
      tctx.fillStyle = "#e8ecffdd";
      tctx.font = "700 " + Math.round(CELL * 0.42) + "px -apple-system,sans-serif";
      tctx.textAlign = "center";
      tctx.fillText("tap to start", trayC.width / 2, trayC.height - CELL * 0.45);
    }
  }

  /* ---------- tilt animation (rAF renders; a timer guarantees completion) ---------- */
  let animating = false;
  function animateTilt(anim, onDone) {
    animating = true;
    const start = performance.now();
    const DUR = Math.min(260, 90 + Math.max(...anim.map(a => a.path.length)) * 40);
    renderPos = {};
    const paths = anim.map(a => {
      const idx = state.marbles.indexOf(a.m);
      return { idx, pts: a.path.map(p => cellCenter(p.x, p.y)), landed: a.landed && !a.fixed };
    });
    let finished = false;
    function done() {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      renderPos = null; animating = false;
      for (const p of paths) { if (p.landed) { const last = p.pts[p.pts.length - 1]; popAt(last[0], last[1], PAL[state.marbles[p.idx].c]); } }
      draw();
      onDone && onDone(paths.some(p => p.landed));
    }
    // fail-safe: if rAF is throttled/paused, complete the move anyway
    const guard = setTimeout(done, DUR + 160);
    function frame(now) {
      if (finished) return;
      let t = (now - start) / DUR; if (t > 1) t = 1;
      const e = 1 - Math.pow(1 - t, 2.4);
      for (const p of paths) {
        const seg = e * (p.pts.length - 1);
        const i = Math.min(p.pts.length - 2, Math.floor(seg));
        const f = seg - i;
        if (p.pts.length === 1) { renderPos[p.idx] = { x: p.pts[0][0], y: p.pts[0][1] }; continue; }
        const a = p.pts[i], b = p.pts[Math.min(i + 1, p.pts.length - 1)];
        renderPos[p.idx] = { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f };
      }
      draw();
      if (t < 1) requestAnimationFrame(frame);
      else done();
    }
    requestAnimationFrame(frame);
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
    tctx.save();
    for (const p of pops) {
      tctx.globalAlpha = p.life;
      tctx.beginPath(); tctx.arc(p.x, p.y, R * 0.22 * p.life + 1, 0, 7); tctx.fillStyle = p.color; tctx.fill();
    }
    tctx.restore();
    requestAnimationFrame(runPops);
  }

  /* ---------- tilt-the-phone mode: continuous sim ---------- */
  let lastT = 0, acc = 0, lastCaptureT = 0;
  let armT0 = 0, armSx = 0, armSy = 0, armN = 0;   // neutral-tilt ANGLE calibration sampling (armSx=pitch Σ, armSy=roll Σ)
  const rollAng = [], rollHead = [];                // rolling-texture cue per marble
  function hasInputSource() { return motionOK || !!devG || Object.values(keysHeld).some(Boolean); }
  function tiltLoop(now) {
    requestAnimationFrame(tiltLoop);
    if (mode !== "tilt" || !world) return;
    if (tiltPhase === "armed") {
      // calibrate: average the held angle for ~0.35s → that's the new "flat"
      lastT = now; draw();
      if (!hasInputSource()) {
        if (!watchdogShown && now - armT0 > 2500) {
          watchdogShown = true; tiltPhase = "ready";
          flashHint(motionDenied
            ? "Motion is blocked — quit and reopen the app to retry, or use 👆 Swipe"
            : "No tilt detected — tap the tray to retry, or use 👆 Swipe");
        }
        return;
      }
      if (devG || Object.values(keysHeld).some(Boolean)) { cal = { pitch: 0, roll: 0 }; beginRun(); return; }
      const ta = tiltAngles();
      armSx += ta.pitch; armSy += ta.roll; armN++;
      if (now - armT0 >= 350 && armN >= 6) {
        cal = { pitch: armSx / armN, roll: armSy / armN };
        beginRun();
      }
      return;
    }
    if (tiltPhase !== "running") { lastT = now; setRollLevel(0); if (tiltPhase === "ready") draw(); return; }
    let dt = (now - lastT) / 1000; lastT = now;
    if (dt > 0.05) dt = 0.05;   // clamp hiccups (backgrounding etc.)
    acc += dt;
    const g = currentGravity();
    while (acc >= PH.DT) { PH.step(world, g); acc -= PH.DT; consumeEvents(); }
    // rolling-texture cue + rolling-rumble level
    let smax = 0;
    world.marbles.forEach((m, i) => {
      if (m.captured) return;
      const s = Math.hypot(m.vx, m.vy);
      if (s > smax) smax = s;
      if (s > 0.05) { rollAng[i] = (rollAng[i] || 0) + (s / m.r) * dt; rollHead[i] = Math.atan2(m.vy, m.vx); }
    });
    setRollLevel(won ? 0 : smax);
    draw();
    updateTimePill();
    if (!won && PH.solved(world) &&
        world.marbles.every(m => m.sink && m.sink.t >= world.params.sinkTime)) winTilt();
  }
  let watchdogShown = false;
  function beginRun() { tiltPhase = "running"; $("#hint").style.opacity = 0; }
  requestAnimationFrame(tiltLoop);
  function consumeEvents() {
    for (const e of world.events) {
      if (e.type === "clack") {
        const v = Math.min(1, e.speed / 10);
        sndClack(0.3 + 0.7 * v, 0.85 + 0.35 * v, e.i + "_" + e.j, e.dead);
        if (e.speed > 4) haptic("light");
      } else if (e.type === "wall") {
        const v = Math.min(1, e.speed / 22);
        sndWallHit(0.25 + 0.75 * v);
        if (e.speed > 6) haptic(e.speed > 13 ? "medium" : "light");
      } else if (e.type === "rim") {
        sndRim(); haptic("light");
      } else if (e.type === "capture") {
        lastCaptureT = world.t;
        sndCapture(); haptic("medium");
        popAt(e.x * CELL, e.y * CELL, PAL[e.color]);
      }
    }
  }
  function startTiltRun() {
    initAudio(); initRollSound(); requestMotion();
    if (tiltPhase === "ready") {
      tiltPhase = "armed";
      armT0 = performance.now(); armSx = 0; armSy = 0; armN = 0; watchdogShown = false;
      flashHint("Hold the phone how you like — calibrating…");
    }
  }
  function updateTimePill() {
    if (!world) return;
    $("#timeV").textContent = world.t.toFixed(1) + "s";
  }
  function bestFor(sv, lvl) { return sv.best && sv.best[lvl]; }
  function winTilt() {
    won = true; tiltPhase = "done";
    // score the moment the LAST marble dropped, not the end of its sink animation
    const time = Math.round((lastCaptureT || world.t) * 10) / 10;
    const sv = loadSave();
    sv.level = Math.max(sv.level || 1, level + 1);
    sv.best = sv.best || {};
    const prev = sv.best[level];
    sv.best[level] = prev ? Math.min(prev, time) : time;
    writeSave(sv);
    sndWinChord(); haptic("medium");
    let burst = 0; const bi = setInterval(() => {
      popAt(Math.random() * trayC.width, Math.random() * trayC.height * 0.6, Object.values(PAL)[Math.floor(Math.random() * 7)]);
      if (++burst > 8) clearInterval(bi);
    }, 70);
    setTimeout(() => showTiltResult(time, prev), 700);
  }
  function showTiltResult(time, prevBest) {
    const sv = loadSave();
    const isPB = !prevBest || time <= prevBest;
    $("#card").innerHTML = `
      <h2>Level ${level} clear!</h2>
      <div class="creature">${isPB ? '<span style="color:var(--good)">New best!</span>' : '<span style="color:var(--gold)">Solved</span>'}</div>
      <div class="stats">
        <div><b>${time.toFixed(1)}s</b>time</div>
        <div><b>${(sv.best[level]).toFixed(1)}s</b>best</div>
        <div><b>${P.holesArr.length}</b>marbles</div>
      </div>
      <div class="row">
        <button id="nextLvl" class="primary">Next level ▸</button>
        <button id="share">Share</button>
      </div>`;
    $("#ov").classList.add("show");
    $("#nextLvl").onclick = () => startLevel(level + 1);
    $("#share").onclick = () => {
      const txt = `Tilt — Level ${level} ⏱ ${time.toFixed(1)}s${isPB ? " ⭐" : ""}\nplay tilt`;
      if (navigator.share) navigator.share({ text: txt }).catch(() => copy(txt));
      else copy(txt);
    };
  }

  /* ---------- mode switching ---------- */
  function applyModeUI() {
    const tilt = mode === "tilt";
    document.querySelector(".arrows").style.display = tilt ? "none" : "";
    $("#undo").style.display = tilt ? "none" : "";
    $("#swipeScore").hidden = tilt;
    $("#tiltScore").hidden = !tilt;
    $("#modeBtn").textContent = tilt ? "👆 Swipe" : "📱 Tilt";  // shows what you switch TO
    $("#bestLab").textContent = "";
    if (tilt) {
      const b = bestFor(loadSave(), level);
      $("#bestLab").textContent = b ? " · best " + b.toFixed(1) + "s" : "";
    }
    document.querySelector(".sub").textContent = tilt
      ? "Tilt your phone — the marbles follow real gravity into their matching holes."
      : "Swipe to tilt the tray — every marble rolls at once. Roll each into its matching hole.";
  }
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    const sv = loadSave(); sv.mode = m; writeSave(sv);
    startLevel(level);   // fresh board in the new mode
  }

  /* ---------- a move (swipe mode) ---------- */
  function doTilt(dir) {
    if (mode === "tilt") return;
    if (animating || won) return;
    const before = E.cloneState(state);
    const probe = E.cloneState(state);
    const r = E.tilt(probe, dir, P.holes);
    if (!r.moved) { buzz(8); flashHint("Nothing rolled that way."); return; }
    const r2 = E.tilt(state, dir, P.holes); // mutates state; anim refs state.marbles
    history.push(before);
    moveCount++; moveTrail.push(dir);
    tiltTray(dir);
    $("#hint").style.opacity = 0;
    animateTilt(r2.anim, (landed) => {
      updateHUD();
      if (E.isSolved(state, P.holesArr.length)) { winGame(); return; }
      const left = P.holesArr.length - state.marbles.filter(m => m.fixed).length;
      const h = $("#hint");
      if (!firstHintShown && moveCount === 1) {
        firstHintShown = true;
        h.innerHTML = "See? <b>all marbles moved.</b> Fill every hole &mdash; " + left + " left";
      } else {
        h.textContent = landed ? (left + " hole" + (left === 1 ? "" : "s") + " to go!") : left + " hole" + (left === 1 ? "" : "s") + " left";
      }
      h.style.opacity = 1;
    });
  }
  function tiltTray(dir) {
    const map = { U: "perspective(600px) rotateX(7deg)", D: "perspective(600px) rotateX(-7deg)",
      L: "perspective(600px) rotateY(-7deg)", R: "perspective(600px) rotateY(7deg)" };
    trayC.style.transform = map[dir];
    setTimeout(() => { trayC.style.transform = ""; }, 150);
  }
  function flashHint(t) { const h = $("#hint"); h.textContent = t; h.style.opacity = 1; }
  function buzz(ms) { if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }

  /* ---------- win ---------- */
  function winGame() {
    won = true;
    buzz([30, 40, 60]);
    const sv = loadSave();
    sv.level = Math.max(sv.level || 1, level + 1);
    writeSave(sv);
    updateHUD();
    let burst = 0; const bi = setInterval(() => {
      popAt(Math.random() * trayC.width, Math.random() * trayC.height * 0.6, Object.values(PAL)[Math.floor(Math.random() * 7)]);
      if (++burst > 8) clearInterval(bi);
    }, 70);
    setTimeout(showResult, 700);
  }

  /* ---------- result overlay ---------- */
  function buildGrid() { return moveTrail.map(d => DIR_EMOJI[d]).join(""); }
  function chunkTrail(t) {
    const arr = Array.from(t);
    let out = "";
    for (let i = 0; i < arr.length; i += 8) { out += arr.slice(i, i + 8).join("") + "\n"; }
    return out.trim() || "—";
  }
  function showResult() {
    const underPar = moveCount <= P.par;
    const verdict = underPar ? `<span style="color:var(--good)">Under par!</span>`
                             : `<span style="color:var(--gold)">Solved</span>`;
    $("#card").innerHTML = `
      <h2>Level ${level} clear!</h2>
      <div class="creature">${verdict}</div>
      <div class="grid">${chunkTrail(buildGrid())}</div>
      <div class="stats">
        <div><b>${moveCount}</b>moves</div>
        <div><b>${P.par}</b>par</div>
        <div><b>${P.holesArr.length}</b>holes</div>
      </div>
      <div class="row">
        <button id="nextLvl" class="primary">Next level ▸</button>
        <button id="share">Share</button>
      </div>`;
    $("#ov").classList.add("show");
    $("#nextLvl").onclick = () => startLevel(level + 1);
    $("#share").onclick = share;
  }

  function share() {
    const underPar = moveCount <= P.par;
    const txt = `Tilt — Level ${level}\n${moveCount}/${P.par} moves ${underPar ? "⭐" : ""}\n${chunkTrail(buildGrid())}\nplay tilt`;
    if (navigator.share) {
      navigator.share({ text: txt }).catch(() => copy(txt));
    } else copy(txt);
  }
  function copy(txt) {
    try {
      const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
      toast("Result copied!");
    } catch (e) { toast("Copy failed"); }
  }
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 1600); }

  /* ---------- controls ---------- */
  function undo() {
    if (animating || won || history.length === 0) return;
    state = history.pop(); moveCount--; moveTrail.pop();
    updateHUD(); draw(); buzz(8);
  }
  function restart() {
    if (animating) return;
    state = E.cloneState(P.init); history = []; moveCount = 0; won = false; moveTrail = []; firstHintShown = false;
    if (mode === "tilt") buildWorld();
    $("#ov").classList.remove("show");
    updateHUD(); draw(); showOnboarding();
  }

  document.querySelectorAll(".arrows button").forEach(b => {
    b.addEventListener("click", () => doTilt(b.dataset.d));
  });
  $("#undo").onclick = undo;
  $("#reset").onclick = restart;
  $("#modeBtn").onclick = () => setMode(mode === "tilt" ? "swipe" : "tilt");
  $("#next").onclick = () => {
    if (won) { if (mode === "tilt") { /* card already shown on win */ $("#ov").classList.add("show"); } else showResult(); return; }
    toast(mode === "tilt" ? "Sink every marble first!" : "Fill every hole first!");
  };

  /* tray input: swipe mode = swipe-to-slide; tilt mode = tap to start the run */
  let sx = 0, sy = 0, sw = false;
  function onStart(e) {
    if (mode === "tilt") { startTiltRun(); return; }
    const p = pt(e); sx = p.x; sy = p.y; sw = true;
  }
  function onEnd(e) {
    if (mode === "tilt" || !sw) return; sw = false; const p = pt(e);
    const dx = p.x - sx, dy = p.y - sy;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) doTilt(dx > 0 ? "R" : "L");
    else doTilt(dy > 0 ? "D" : "U");
  }
  function pt(e) { const t = e.changedTouches ? e.changedTouches[0] : e; return { x: t.clientX, y: t.clientY }; }
  trayC.addEventListener("touchstart", e => { e.preventDefault(); onStart(e); }, { passive: false });
  trayC.addEventListener("touchend", e => { e.preventDefault(); onEnd(e); }, { passive: false });
  trayC.addEventListener("mousedown", onStart);
  window.addEventListener("mouseup", onEnd);
  const KEYMAP = { ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R", w: "U", s: "D", a: "L", d: "R" };
  window.addEventListener("keydown", e => {
    const d = KEYMAP[e.key];
    if (d) {
      e.preventDefault();
      if (mode === "tilt") { startTiltRun(); keysHeld[d] = true; }
      else doTilt(d);
    }
    if (e.key === "z") undo();
  });
  window.addEventListener("keyup", e => { const d = KEYMAP[e.key]; if (d) keysHeld[d] = false; });
  window.addEventListener("resize", sizeBoards);

  /* ---------- boot ---------- */
  {
    const sv = loadSave();
    // default: real-physics tilt on touch devices, classic swipe on desktop
    mode = sv.mode || (("ontouchstart" in window) ? "tilt" : "swipe");
    tryNativeMotion();   // native accelerometer needs no gesture/permission — flow from boot
  }
  try { window.__tilt = { tilt: doTilt, state: () => state, puzzle: () => P, level: () => level,
    goto: n => startLevel(n), moves: () => moveCount, won: () => won, undo, restart,
    mode: () => mode, setMode, world: () => world, phase: () => tiltPhase,
    start: startTiltRun, setGravity: (gx, gy) => { devG = (gx == null) ? null : { gx, gy }; },
    feedVec: (x, y, z) => lpVec(x, y, z, 1), angles: () => tiltAngles(),
    setCal: (p, r) => { cal = { pitch: p, roll: r }; }, gravity: () => currentGravity(),
    stepN: (n, g) => {
      tiltPhase = "running";
      for (let i = 0; i < n; i++) { PH.step(world, g || currentGravity()); consumeEvents(); }
      let guard = 0;
      while (PH.solved(world) && !world.marbles.every(m => m.sink && m.sink.t >= world.params.sinkTime) && guard++ < 120)
        PH.step(world, { gx: 0, gy: 0 });
      draw(); updateTimePill();
      if (!won && PH.solved(world)) winTilt();
    } }; } catch (e) {}
  startLevel(loadSave().level || 1);
  sizeBoards();
})();
