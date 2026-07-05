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

  /* ---------- audio (impacts sell the physics) ---------- */
  let AC = null;
  function initAudio() {
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
  function sndPlunk() { if (!throttled("plunk", 120)) return; tone(240, 110, 0.12, 0.32, "sine"); noiseBurst(0.03, 0.1, 900); }
  function sndRim() { if (!throttled("rim", 90)) return; tone(300, 180, 0.05, 0.2, "triangle"); tone(250, 140, 0.05, 0.16, "triangle", 0.05); noiseBurst(0.03, 0.12, 1200); }
  function sndWinChord() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.28, 0.22, "triangle", i * 0.09)); }
  function sndFail() { tone(320, 150, 0.25, 0.3, "triangle"); tone(210, 90, 0.35, 0.26, "triangle", 0.13); }
  function haptic(style) {
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H && H.impact) { H.impact({ style: style === "heavy" ? "HEAVY" : style === "medium" ? "MEDIUM" : "LIGHT" }).catch(() => {}); return; }
    if (navigator.vibrate) try { navigator.vibrate(style === "heavy" ? 35 : style === "medium" ? 20 : 10); } catch (e) {}
  }

  /* ---------- campaign persistence ---------- */
  const SK = "tilt.campaign.v1";
  function loadSave() { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch (e) { return {}; } }
  function writeSave(o) { try { localStorage.setItem(SK, JSON.stringify(o)); } catch (e) {} }

  /* ---------- game state (tilt-only: one input, one story) ---------- */
  let level = 1, P, won = false, lost = false;

  /* ---------- tilt state ---------- */
  let world = null, tiltPhase = "ready"; // ready → armed → running → done
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
    const availW = Math.min(window.innerWidth - 54, 480 - 54);  // wrap padding + .trayframe
    const availH = Math.max(200, window.innerHeight - 335); // meta + timer + hint chip (no footer)
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
    won = false;
    const sv = loadSave();
    sv.level = Math.max(sv.level || 1, n);
    writeSave(sv);
    $("#ov").classList.remove("show");
    buildWorld();
    updateHUD();
    draw();
    showOnboarding();
    // first launch ever: show the animated how-to card once
    if (!sv.tutSeen) {
      showTutorial(() => { const s = loadSave(); s.tutSeen = 1; writeSave(s); showOnboarding(); });
    } else if ((P.walls || []).length && !sv.wallsSeen) {
      // a mechanic's debut gets a once-only intro card (design 6b)
      showMechanicIntro(() => { const s = loadSave(); s.wallsSeen = 1; writeSave(s); showOnboarding(); });
    }
  }
  // physics world in CELL units (resize-proof; rendering scales by CELL)
  function buildWorld() {
    world = PH.createWorld({
      w: N, h: N, pad: 0, unit: 1,
      marbles: P.init.marbles.map(m => ({ x: m.x + 0.5, y: m.y + 0.5, r: 0.36, c: m.c })),
      holes: P.holesArr.map(h => ({ x: h.x + 0.5, y: h.y + 0.5, r: 0.42, c: h.c })),
      blocks: (P.walls || []).map(b => ({ x: b.x, y: b.y, w: 1, h: 1 })),
      slopes: (P.slopes || []).map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h,
        ax: s.a === "H" ? 1 : 0, ay: s.a === "H" ? 0 : 1 })),
    });
    tiltPhase = "ready";
    watchdogShown = false;
    lastCaptureT = 0;
    lost = false; stuckAt = -1;
    rollAng.length = 0; rollHead.length = 0;
    updateTimePill();
  }
  function showOnboarding() {
    const wallsNew = (P.walls || []).length > 0 && level <= 6;    // walls debut around L4
    const slopesNew = (P.slopes || []).length > 0 && level <= 8;  // slopes debut around L6
    if (slopesNew) flashHint("<b>New: hills.</b> Bring speed over the ridge", 0, "hill");
    else if (wallsNew) flashHint("<b>Walls!</b> Bank shots off them", 0, "wall");
    else flashHint("<b>Tap the tray</b>, then tilt", 0, "tilt");
  }
  function updateHUD() {
    $("#lvlN").textContent = level;
    const b = bestFor(loadSave(), level);
    $("#bestLab").textContent = b ? "BEST " + b.toFixed(1) + "s" : "FIRST RUN";
  }

  /* ---------- drawing ---------- */
  function key(x, y) { return x + "," + y; }
  // Crisp flat-graphic hole: clean dark disc + bright colored ring + dimple.
  // (A gradient-heavy "3D cup" treatment was tried and REVERTED — wide soft
  // gradients at this size read as BLUR, not depth. If real depth is ever
  // wanted, the path is tight gradients/hard edges or pre-rendered sprites,
  // not more canvas soft-shading.)
  function roundedHole(ctx, x, y, c, r) {
    ctx.save();
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

  function drawGridBg() {
    tctx.clearRect(0, 0, trayC.width, trayC.height);
    tctx.fillStyle = "#ffffff0f";       // grid = dots at intersections (quieter than lines)
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      tctx.beginPath(); tctx.arc(i * CELL, j * CELL, 1.4, 0, 7); tctx.fill();
    }
    drawSlopes();
    drawBlocks();
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
    for (const s of P.slopes) {
      const x = s.x * CELL, y = s.y * CELL, w = s.w * CELL, h = s.h * CELL;
      const horiz = s.a === "H";
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
      const rows = (horiz ? s.w : s.h) * SUB, cols = (horiz ? s.h : s.w) * 2;
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
    for (const b of P.walls) {
      const x = b.x * CELL, y = b.y * CELL, s = CELL, rr = Math.max(4, CELL * 0.16);
      // drop shadow (raised block)
      tctx.fillStyle = "#00000055";
      roundRectPath(tctx, x + 2, y + 4, s - 4, s - 4, rr); tctx.fill();
      // body
      const g = tctx.createLinearGradient(x, y, x, y + s);
      g.addColorStop(0, "#4a54a0"); g.addColorStop(1, "#2e3670");
      tctx.fillStyle = g;
      roundRectPath(tctx, x + 1.5, y + 1.5, s - 3, s - 3, rr); tctx.fill();
      tctx.lineWidth = 1.5; tctx.strokeStyle = "#6a76c9";
      roundRectPath(tctx, x + 1.5, y + 1.5, s - 3, s - 3, rr); tctx.stroke();
      // top bevel highlight
      tctx.strokeStyle = "#ffffff2b"; tctx.lineWidth = 1;
      tctx.beginPath(); tctx.moveTo(x + rr, y + 3); tctx.lineTo(x + s - rr, y + 3); tctx.stroke();
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
     ring in its own color and gold chevrons march toward its matching hole —
     you see WHICH ball is stuck and WHERE it belongs. Draw-pass overlay only;
     costs nothing when nothing is lodged. Same lodge test as lodgedCount(). */
  function drawLodgedWarnings() {
    if (tiltPhase !== "running" || won || lost) return;
    const t = world.t;
    for (const m of world.marbles) {
      if (m.captured) continue;
      let lodged = false;
      for (const h of world.holes) {
        if (h.filled || h.c === m.c) continue;
        if (Math.hypot(m.x - h.x, m.y - h.y) < h.r * world.params.captureFrac * 1.4) { lodged = true; break; }
      }
      if (!lodged) continue;
      const px = m.x * CELL, py = m.y * CELL;
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      tctx.save();
      tctx.beginPath(); tctx.arc(px, py, R * (1.4 + 0.28 * pulse), 0, 7);
      tctx.strokeStyle = SKIN[m.c]; tctx.globalAlpha = 0.35 + 0.45 * pulse; tctx.lineWidth = 3.5;
      tctx.stroke();
      tctx.restore();
      let target = null;
      for (const h of world.holes) if (!h.filled && h.c === m.c) { target = h; break; }
      if (!target) continue;
      const ang = Math.atan2(target.y - m.y, target.x - m.x), ph = (t * 1.8) % 1;
      tctx.save();
      tctx.lineWidth = 4; tctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const a = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, ph * 1.4 - i * 0.18)))) * 0.95;
        if (a <= 0) continue;
        const d = R * (2.9 + i * 1.1 + ph * 1.3); // start clear of the pulsing ring
        const cx = px + Math.cos(ang) * d, cy = py + Math.sin(ang) * d;
        const nx = Math.cos(ang), ny = Math.sin(ang), ox = -ny, oy = nx;
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
  function draw() { if (world) drawTiltBoard(); }
  function drawTiltBoard() {
    drawGridBg();
    drawWorld(tctx, world, CELL, { ang: rollAng, head: rollHead });
    drawLodgedWarnings();
    if (tiltPhase === "ready") {
      tctx.fillStyle = "#ffffffd9";
      tctx.font = Math.round(CELL * 0.4) + "px 'Lilita One','Arial Rounded MT Bold',-apple-system,sans-serif";
      tctx.textAlign = "center";
      tctx.fillText("TAP TO START", trayC.width / 2, trayC.height - CELL * 0.45);
    }
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

  /* ---------- new-mechanic intro card (design 6b), Royal Match style ----------
     Shown ONCE when a mechanic debuts (walls today; reuse for hills). A real
     physics bank shot plays on the tipping mini-phone — same fixed timestep,
     same painters, so the demo IS the game. */
  function showMechanicIntro(onDone) {
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
    function paintWall(x, y, s) {
      const rr2 = Math.max(4, s * 0.16);
      roundRectPath(c, x + 2, y + 4, s - 4, s - 4, rr2); c.fillStyle = "#00000055"; c.fill();
      const g = c.createLinearGradient(x, y, x, y + s);
      g.addColorStop(0, "#4a54a0"); g.addColorStop(1, "#2e3670");
      roundRectPath(c, x + 1.5, y + 1.5, s - 3, s - 3, rr2); c.fillStyle = g; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = "#6a76c9";
      roundRectPath(c, x + 1.5, y + 1.5, s - 3, s - 3, rr2); c.stroke();
      c.strokeStyle = "#ffffff2b"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x + rr2, y + 3); c.lineTo(x + s - rr2, y + 3); c.stroke();
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
      for (const bl of WCELLS) paintWall(bl.x * S, bl.y * S, S);
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
    const TUT = window.TutorialScript;
    $("#card").innerHTML = `
      <h2 style="font-size:22px">ROLL EACH BALL INTO<br>ITS MATCHING HOLE</h2>
      <canvas id="tutCv" style="margin:6px auto 0; display:block; max-width:100%"></canvas>
      <div id="tutCap" class="creature" style="min-height:20px; margin-bottom:12px">&nbsp;</div>
      <div class="row"><button id="tutGo" class="primary">GOT IT ▸</button></div>`;
    $("#ov").classList.add("show");
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
      $("#ov").classList.remove("show");
      onDone && onDone();
    };
  }

  /* ---------- tilt-the-phone mode: continuous sim ---------- */
  let lastT = 0, acc = 0, lastCaptureT = 0;
  let armT0 = 0, armSx = 0, armSy = 0, armN = 0;   // neutral-tilt ANGLE calibration sampling (armSx=pitch Σ, armSy=roll Σ)
  const rollAng = [], rollHead = [];                // rolling-texture cue per marble
  function hasInputSource() { return motionOK || !!devG || Object.values(keysHeld).some(Boolean); }
  function tiltLoop(now) {
    requestAnimationFrame(tiltLoop);
    if (!world) return;
    if (tiltPhase === "armed") {
      // calibrate: average the held angle for ~0.35s → that's the new "flat"
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
    setRollLevel(won || lost ? 0 : smax);
    draw();
    if (!lost) updateTimePill();
    checkDeadEnd();
    if (!won && !lost && PH.solved(world) &&
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
      } else if (e.type === "plunk") {
        sndPlunk(); haptic("medium");   // wrong cup — you'll feel it
        flashHint("Tilt hard — it pops free!", 1, "stuck");
      } else if (e.type === "capture") {
        lastCaptureT = world.t;
        sndCapture(); haptic("medium");
        popAt(e.x * CELL, e.y * CELL, SKIN[e.color]);
      }
    }
  }
  function startTiltRun() {
    initAudio(); initRollSound(); requestMotion();
    if (tiltPhase === "ready") {
      tiltPhase = "armed";
      armT0 = performance.now(); armSx = 0; armSy = 0; armN = 0; watchdogShown = false;
      $("#hint").style.opacity = 0;   // calibration is instant + automatic — no message (device feedback 2026-07)
    }
  }
  function updateTimePill() {
    if (!world) return;
    $("#timeV").textContent = world.t.toFixed(1);
  }
  function bestFor(sv, lvl) { return sv.best && sv.best[lvl]; }
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
  let stuckAt = -1;                 // world.t when the all-lodged state began
  function checkDeadEnd() {
    if (won || lost || !world || tiltPhase !== "running") return;
    const lc = lodgedCount();
    if (lc.freeN > 0 && lc.lodged === lc.freeN) {
      if (stuckAt < 0) stuckAt = world.t;
      else if (world.t - stuckAt > 3) {          // 3s grace to shake free
        lost = true;
        sndFail(); haptic("heavy");
        showGameOver(lc.freeN);
      }
    } else stuckAt = -1;
  }
  function showGameOver(nStuck) {
    tiltPhase = "done";
    const sunk = world.marbles.filter(m => m.captured).length;
    $("#card").innerHTML = `
      <h2>STUCK!</h2>
      <div class="creature" style="color:var(--bad)">${nStuck > 1 ? "Every ball is wedged in a wrong hole" : "Your last ball is wedged in a wrong hole"}</div>
      <div class="stats">
        <div><span class="slab">SUNK</span><b>${sunk}/${P.holesArr.length}</b></div>
        <div><span class="slab">TIME</span><b>${world.t.toFixed(1)}s</b></div>
      </div>
      <div class="row"><button id="retry" class="primary">⟳ TRY AGAIN</button></div>`;
    $("#ov").classList.add("show");
    $("#retry").onclick = () => startLevel(level);
  }
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
      popAt(Math.random() * trayC.width, Math.random() * trayC.height * 0.6, Object.values(SKIN)[Math.floor(Math.random() * 7)]);
      if (++burst > 8) clearInterval(bi);
    }, 70);
    setTimeout(() => showTiltResult(time, prev), 700);
  }
  function showTiltResult(time, prevBest) {
    const sv = loadSave();
    const isPB = !prevBest || time <= prevBest;
    $("#card").innerHTML = `
      <div class="glow"></div>
      <div class="stars"><span>★</span><span class="big">★</span><span>★</span></div>
      <h2>LEVEL ${level} CLEAR!</h2>
      <div class="creature">${isPB ? '<span style="color:var(--good)">New best!</span>' : '<span style="color:var(--gold)">Solved</span>'}</div>
      <div class="stats">
        <div><span class="slab">TIME</span><b>${time.toFixed(1)}s</b></div>
        <div><span class="slab">BEST</span><b style="color:var(--gold)">${(sv.best[level]).toFixed(1)}s</b></div>
      </div>
      <div class="row">
        <button id="nextLvl" class="primary">NEXT ▸</button>
        <button id="replay">⟳ Replay</button>
      </div>`;
    $("#ov").classList.add("show");
    $("#nextLvl").onclick = () => startLevel(level + 1);
    $("#replay").onclick = () => startLevel(level);   // chase the best time
  }

  // Visual hint chips (design 5a): every hint is [glyph] + short text. Glyphs are
  // the game's own pieces — tipping phone, bubble level, wall block, wedged ball —
  // built as plain DOM, animated by CSS keyframes only (no rAF, no perf cost).
  const GLYPHS = {
    tilt: '<span class="g-rock"><span class="g-phone"><i class="g-ball"></i></span></span>',
    wall: '<span class="g-wall"></span>',
    hill: '<span class="g-wall"></span>',   // hills reuse the block glyph for now
    // a 2.8s demo, not an icon: phone snaps steep, the wedged ball pops out of
    // the blue ring and rolls away (device feedback: "Tilt HARD" told, didn't show)
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
    $("#ov").classList.remove("show");
    updateHUD(); draw(); showOnboarding();
  }

  $("#reset").onclick = () => { restart(); toast("Level restarted"); haptic("light"); };

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
  {
    // rules migration: lodge-and-escape restored + dead-end game over (layouts
    // regenerated again), so old best times aren't comparable — clear them
    // once; keep level progress
    const sv = loadSave();
    if (!sv.rulesV3) { sv.rulesV3 = 1; delete sv.best; writeSave(sv); }
  }
  tryNativeMotion();   // native accelerometer needs no gesture/permission — flow from boot
  try { window.__tilt = { puzzle: () => P, level: () => level,
    goto: n => startLevel(n), won: () => won, restart,
    world: () => world, phase: () => tiltPhase,
    start: startTiltRun, setGravity: (gx, gy) => { devG = (gx == null) ? null : { gx, gy }; },
    feedVec: (x, y, z) => lpVec(x, y, z, 1), angles: () => tiltAngles(),
    setCal: (p, r) => { cal = { pitch: p, roll: r }; }, gravity: () => currentGravity(),
    tut: () => tutWorld, tutStep: s => tutStepFn && tutStepFn(s), showTut: () => showTutorial(() => {}),
    showWalls: () => showMechanicIntro(() => {}),
    stepN: (n, g) => {
      tiltPhase = "running";
      for (let i = 0; i < n; i++) { PH.step(world, g || currentGravity()); consumeEvents(); checkDeadEnd(); }
      let guard = 0;
      while (PH.solved(world) && !world.marbles.every(m => m.sink && m.sink.t >= world.params.sinkTime) && guard++ < 120)
        PH.step(world, { gx: 0, gy: 0 });
      draw(); updateTimePill();
      if (!won && !lost && PH.solved(world)) winTilt();
    } }; } catch (e) {}
  startLevel(loadSave().level || 1);
  sizeBoards();
})();
