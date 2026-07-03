/* Dowse — game UI. Faithful port of prototypes/11-dowse.html rendering/feel
   (felt canvas, ghost preview, peg-reveal pop, bespoke WebAudio, particles,
   solver ghost replay on loss) re-plumbed from a daily onto a LEVEL CAMPAIGN:
   engine.build(level), win → next level, loss → retry. Progress in localStorage. */
(function () {
  "use strict";
  const E = window.GameEngine;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeInQuad = t => t * t;
  const easeOutBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const DIRS = E.DIRS;

  /* ---------------- audio (bespoke — richer than a generic kit for this game) ---------------- */
  let AC = null;
  function initAudio() { if (AC) return; try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
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
  function noiseBurst(dur, vol, hp, when) {
    if (!AC) return;
    const t = AC.currentTime + (when || 0);
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
  function sndClack(pitch, vol) { const v = vol == null ? 1 : vol; tone(210 * pitch, 140 * pitch, 0.07, 0.28 * v, "triangle"); noiseBurst(0.035, 0.16 * v, 1800); }
  function sndMarble(pitch) { tone(330 * pitch, 250 * pitch, 0.05, 0.2, "triangle"); noiseBurst(0.025, 0.1, 2600); }
  function sndThunk() { tone(105, 58, 0.16, 0.5, "sine"); noiseBurst(0.06, 0.22, 500); }
  function sndPop() { tone(420, 640, 0.09, 0.2, "sine", 0.05); }
  function sndWin() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.28, 0.22, "triangle", i * 0.09)); }
  function sndLose() { tone(220, 110, 0.5, 0.25, "sine"); tone(165, 82, 0.6, 0.2, "sine", 0.12); }

  /* ---------------- campaign persistence ---------------- */
  const PROG_KEY = "dowse.campaign.v1";
  const LS = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const LSset = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  function loadProg() { try { return JSON.parse(LS(PROG_KEY)) || { level: 1 }; } catch (e) { return { level: 1 }; } }
  function saveProg(p) { LSset(PROG_KEY, JSON.stringify(p)); }

  /* ---------------- state ---------------- */
  let level = 1, board = null, pegSet = null, game = null;
  let anim = null, replay = null, previewDir = null, previewGhost = null;
  let winAt = 0, loseAt = 0;
  const particles = [];
  let pegReveal = {}; // pegKey -> reveal timestamp

  /* ---------------- device-gravity lean (physical-tray feel) ---------------- */
  let leanX = 0, leanY = 0, motionOn = false;
  function enableMotion() {
    if (motionOn) return;
    const D = window.DeviceMotionEvent;
    if (!D) return;
    const attach = () => {
      motionOn = true;
      window.addEventListener("devicemotion", e => {
        const g = e.accelerationIncludingGravity;
        if (!g || g.x == null) return;
        // low-pass toward the gravity direction in screen space (portrait):
        // tilt right → marbles drift right; tilt toward you (top up) → drift down.
        leanX = leanX * 0.88 + clamp(-g.x / 6, -1, 1) * 0.12;
        leanY = leanY * 0.88 + clamp(g.y / 6, -1, 1) * 0.12;
      });
    };
    if (typeof D.requestPermission === "function") {
      D.requestPermission().then(s => { if (s === "granted") attach(); }).catch(() => {});
    } else attach();
  }

  /* ---------------- DOM refs ---------------- */
  const cv = document.getElementById("board"), cx = cv.getContext("2d");
  const wrap = document.getElementById("wrap");
  const tgtCv = document.getElementById("tgt"), tgtCx = tgtCv.getContext("2d");
  const msgEl = document.getElementById("msg");
  const ticksEl = document.getElementById("ticks"), parLbl = document.getElementById("parLbl");
  const pegCountEl = document.getElementById("pegCount");
  const panel = document.getElementById("panel");
  const dpadEl = document.getElementById("dpad");
  const toastEl = document.getElementById("toast");
  function setMsg(t, cls) { msgEl.textContent = t; msgEl.className = cls || ""; }

  /* ---------------- layout / felt ---------------- */
  let W = 0, cell = 0, pad = 0, dpr = 1, felt = null;
  function N() { return board ? board.N : 7; }
  function resize() {
    const w = Math.min(wrap.clientWidth, 430);
    if (w <= 0) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = w; cv.style.height = w + "px";
    cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr);
    pad = w * 0.055; cell = (w - pad * 2) / N();
    felt = document.createElement("canvas");
    felt.width = cv.width; felt.height = cv.height;
    const f = felt.getContext("2d"); f.scale(dpr, dpr);
    const g = f.createLinearGradient(0, 0, w, w);
    g.addColorStop(0, "#182033"); g.addColorStop(.55, "#141a2b"); g.addColorStop(1, "#111624");
    f.fillStyle = g; roundRect(f, 1, 1, w - 2, w - 2, 14); f.fill();
    const rng = window.WebGameCore.makeRNG(42);
    for (let i = 0; i < 2200; i++) {
      const x = 2 + rng() * (w - 4), y = 2 + rng() * (w - 4);
      f.fillStyle = rng() < .5 ? "rgba(255,255,255," + (rng() * 0.035) + ")" : "rgba(0,0,0," + (rng() * 0.05) + ")";
      f.fillRect(x, y, 1.2, 1.2);
    }
    for (let gx = 0; gx < N(); gx++) for (let gy = 0; gy < N(); gy++) {
      const c = cc(gx, gy);
      f.fillStyle = "rgba(0,0,0,0.16)";
      f.beginPath(); f.arc(c.x, c.y, 1.8, 0, 7); f.fill();
      f.strokeStyle = "rgba(140,160,220,0.05)"; f.lineWidth = 1;
      f.strokeRect(pad + gx * cell + .5, pad + gy * cell + .5, cell - 1, cell - 1);
    }
    f.strokeStyle = "#31406a"; f.lineWidth = 2.5; roundRect(f, 4, 4, w - 8, w - 8, 11); f.stroke();
    f.strokeStyle = "rgba(157,123,255,0.35)"; f.lineWidth = 1; f.setLineDash([5, 5]);
    roundRect(f, 9, 9, w - 18, w - 18, 8); f.stroke(); f.setLineDash([]);
    const v = f.createRadialGradient(w / 2, w / 2, w * .32, w / 2, w / 2, w * .75);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.32)");
    f.fillStyle = v; roundRect(f, 1, 1, w - 2, w - 2, 14); f.fill();
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function cc(gx, gy) { return { x: pad + (gx + .5) * cell, y: pad + (gy + .5) * cell }; }

  /* ---------------- level flow ---------------- */
  function startLevel(n) {
    level = n;
    board = E.build(n);
    if (!board) { setMsg("Could not verify this level — try again.", "bad"); return; }
    pegSet = new Set(board.pegs.map(p => p.x + "," + p.y));
    document.getElementById("lvl").textContent = "Level " + level;
    document.getElementById("shapeNo").textContent = "· " + board.shape.name;
    resize();          // grid size may change with the ramp
    renderTarget();
    newGame();
  }
  function newGame() {
    game = { marbles: board.marbles.map(m => ({ x: m.x, y: m.y })), revealed: new Set(board.revealed),
      tiltsUsed: 0, strip: [], over: false, won: false };
    anim = null; replay = null; previewGhost = null; previewDir = null;
    winAt = 0; loseAt = 0; particles.length = 0; pegReveal = {};
    panel.hidden = true;
    dpadEl.style.opacity = "1"; dpadEl.style.pointerEvents = "auto";
    const hidden = board.pegs.length - board.revealed.length;
    setMsg(hidden === 0
      ? "Every peg is visible on this felt — plan your slides and park the target shape."
      : level === 1
        ? "Park the 3 marbles into the target shape — anywhere on the felt. Swipe to tilt: every clack maps a hidden peg."
        : "Level " + level + " — " + (board.revealed.length ? hidden + " of " + board.pegs.length + " pegs still hidden." : board.pegs.length + " hidden pegs. Read the clacks."));
    renderTicks(); renderPegCount();
  }

  /* ---------------- particles / drawing ---------------- */
  function spawnBurst(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = (0.4 + Math.random() * 0.6) * spd;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: 0.02 + Math.random() * 0.025, r: 1.5 + Math.random() * 2.5, color });
    }
  }
  function drawPeg(pk, t) {
    const [gx, gy] = pk.split(",").map(Number);
    const c = cc(gx, gy);
    const born = pegReveal[pk] || 0;
    let s = 1;
    if (born) { const p = clamp((t - born) / 380, 0, 1); s = easeOutBack(p); }
    const r = cell * 0.31 * s;
    if (r <= 0.5) return;
    const g = cx.createRadialGradient(c.x - r * .35, c.y - r * .4, r * .15, c.x, c.y, r * 1.35);
    g.addColorStop(0, "rgba(120,140,210,0.55)");
    g.addColorStop(.55, "rgba(80,95,160,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = g; cx.beginPath(); cx.arc(c.x, c.y, r * 1.35, 0, 7); cx.fill();
    cx.fillStyle = "rgba(23,30,50,0.9)"; cx.beginPath(); cx.arc(c.x, c.y, r * .92, 0, 7); cx.fill();
    cx.strokeStyle = "rgba(157,123,255,0.6)"; cx.lineWidth = 1.5;
    cx.beginPath(); cx.arc(c.x, c.y, r * .92, 0, 7); cx.stroke();
    cx.fillStyle = "rgba(157,123,255,0.5)"; cx.beginPath(); cx.arc(c.x, c.y, r * .22, 0, 7); cx.fill();
    if (born && t - born < 600) {
      const p = (t - born) / 600;
      cx.strokeStyle = "rgba(157,123,255," + (0.7 * (1 - p)) + ")"; cx.lineWidth = 2.5 * (1 - p);
      cx.beginPath(); cx.arc(c.x, c.y, r + p * cell * 0.9, 0, 7); cx.stroke();
    }
  }
  function drawMarble(x, y, r, glow, alpha) {
    cx.globalAlpha = alpha == null ? 1 : alpha;
    cx.fillStyle = "rgba(0,0,0,0.38)";
    cx.beginPath(); cx.ellipse(x + r * .15, y + r * .45, r * .95, r * .6, 0, 0, 7); cx.fill();
    if (glow > 0) { cx.shadowColor = "rgba(255,181,71," + (0.9 * glow) + ")"; cx.shadowBlur = 18 * glow; }
    const g = cx.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r * 1.05);
    g.addColorStop(0, "#ffd9a0"); g.addColorStop(.45, "#ffb547"); g.addColorStop(.85, "#c97a14"); g.addColorStop(1, "#8f5209");
    cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill();
    cx.shadowBlur = 0;
    cx.fillStyle = "rgba(255,255,255,0.55)";
    cx.beginPath(); cx.ellipse(x - r * .35, y - r * .42, r * .26, r * .16, -0.6, 0, 7); cx.fill();
    cx.globalAlpha = 1;
  }
  function currentMarblePositions(t) {
    const out = [];
    for (let i = 0; i < 3; i++) {
      let gx, gy, sq = 0;
      if (anim) {
        const mv = anim.moves[i];
        const dx = DIRS[anim.dir][0], dy = DIRS[anim.dir][1];
        const p = anim.durs[i] > 0 ? clamp((t - anim.t0) / anim.durs[i], 0, 1) : 1;
        const e = easeInQuad(p);
        gx = mv.fx + (mv.tx - mv.fx) * e; gy = mv.fy + (mv.ty - mv.fy) * e;
        if (!anim.fired[i] && p >= 1) { anim.fired[i] = true; onMarbleSettle(i, mv, t); }
        if (anim.fired[i] && anim.settleT[i]) {
          const dt = t - anim.settleT[i];
          const q = clamp(dt / 140, 0, 1);
          sq = (1 - q) * Math.min(0.22, mv.dist * 0.06);
          // impact rebound: damped recoil back along the travel axis
          if (anim.bounce[i] > 0 && dt < 380) {
            const off = anim.bounce[i] * Math.exp(-dt / 95) * Math.sin(dt / 48);
            gx -= dx * off; gy -= dy * off;
          }
          // momentum nudge: this marble was hit by another — brief forward shove
          if (anim.nudge[i] && t >= anim.nudge[i].t0) {
            const nt = t - anim.nudge[i].t0;
            if (nt < 320) { const off = anim.nudge[i].amp * Math.exp(-nt / 80) * Math.sin(nt / 40); gx += dx * off; gy += dy * off; }
          }
        }
      } else {
        gx = game.marbles[i].x; gy = game.marbles[i].y;
        // device-gravity lean: the tray feels alive in the hand (subtle, idle only)
        gx += leanX * 0.09; gy += leanY * 0.09;
      }
      const c = cc(gx, gy);
      out.push({ px: c.x, py: c.y, sq });
    }
    return out;
  }
  function draw(t) {
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, W, W);
    cx.drawImage(felt, 0, 0, W, W);
    if (loseAt) {
      const p = clamp((t - loseAt) / 900, 0, 1);
      cx.fillStyle = "rgba(140,160,220," + (0.06 * Math.sin(p * Math.PI)) + ")"; cx.fillRect(0, 0, W, W);
    }
    for (const p of board.pegs) {
      const pk = p.x + "," + p.y;
      if (game.revealed.has(pk) && (!pegReveal[pk] || t >= pegReveal[pk])) drawPeg(pk, t);
    }
    if (previewGhost && !anim && !game.over) {
      for (const mv of previewGhost) {
        const a = cc(mv.fx, mv.fy), b = cc(mv.tx, mv.ty);
        if (mv.dist > 0) {
          cx.strokeStyle = "rgba(255,181,71,0.15)"; cx.lineWidth = cell * 0.5; cx.lineCap = "round";
          cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
        }
        cx.setLineDash([4, 4]); cx.strokeStyle = "rgba(255,181,71,0.6)"; cx.lineWidth = 1.6;
        cx.beginPath(); cx.arc(b.x, b.y, cell * 0.34, 0, 7); cx.stroke(); cx.setLineDash([]);
      }
    }
    const ms = currentMarblePositions(t);
    if (winAt) {
      const pulse = 0.5 + 0.5 * Math.sin((t - winAt) / 300);
      cx.strokeStyle = "rgba(255,181,71," + (0.25 + 0.3 * pulse) + ")"; cx.lineWidth = cell * 0.7; cx.lineCap = "round"; cx.lineJoin = "round";
      cx.beginPath(); cx.moveTo(ms[0].px, ms[0].py); cx.lineTo(ms[1].px, ms[1].py); cx.lineTo(ms[2].px, ms[2].py); cx.stroke();
    }
    const r = cell * 0.36;
    for (const m of ms) {
      cx.save(); cx.translate(m.px, m.py);
      if (m.sq > 0) {
        const ax = anim ? Math.abs(DIRS[anim.dir][0]) : 0;
        cx.scale(1 - (ax ? m.sq : -m.sq * 0.6), 1 - (ax ? -m.sq * 0.6 : m.sq));
      }
      drawMarble(0, 0, r, winAt ? 0.6 + 0.4 * Math.sin((t - winAt) / 300) : 0);
      cx.restore();
    }
    if (replay) drawReplay(t);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vx *= .96; p.vy *= .96; p.life -= p.decay;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      cx.globalAlpha = p.life; cx.fillStyle = p.color;
      cx.beginPath(); cx.arc(p.x, p.y, p.r * p.life, 0, 7); cx.fill();
    }
    cx.globalAlpha = 1;
    if (!game.over && game.tiltsUsed === 0 && !anim && level === 1) {
      const ph = (t / 900) % 1;
      for (let i = 0; i < 3; i++) {
        const a = clamp(Math.sin(Math.PI * clamp(ph * 1.4 - i * 0.15, 0, 1)), 0, 1) * 0.5;
        if (a <= 0) continue;
        const x = W / 2 - 24 + i * 16 + ph * 26, y = W - pad * 0.62;
        cx.strokeStyle = "rgba(110,168,255," + a + ")"; cx.lineWidth = 2.5; cx.lineCap = "round";
        cx.beginPath(); cx.moveTo(x - 5, y - 6); cx.lineTo(x + 2, y); cx.lineTo(x - 5, y + 6); cx.stroke();
      }
    }
  }
  function drawReplay(t) {
    if (t >= replay.nextAt) advanceReplay(t);
    const r = cell * 0.27;
    for (let i = 0; i < 3; i++) {
      let gx, gy;
      if (replay.moving) {
        const p = clamp((t - replay.mt0) / replay.mdur, 0, 1), e = easeOutCubic(p);
        gx = replay.from[i].x + (replay.to[i].x - replay.from[i].x) * e;
        gy = replay.from[i].y + (replay.to[i].y - replay.from[i].y) * e;
        if (p >= 1 && i === 2) replay.moving = false;
      } else { gx = replay.ms[i].x; gy = replay.ms[i].y; }
      const c = cc(gx, gy);
      cx.setLineDash([3, 3]); cx.strokeStyle = "rgba(157,123,255,0.85)"; cx.lineWidth = 2;
      cx.beginPath(); cx.arc(c.x, c.y, r, 0, 7); cx.stroke(); cx.setLineDash([]);
      cx.fillStyle = "rgba(157,123,255,0.18)";
      cx.beginPath(); cx.arc(c.x, c.y, r, 0, 7); cx.fill();
    }
    cx.fillStyle = "rgba(157,123,255,0.75)"; cx.font = "600 11px -apple-system,sans-serif"; cx.textAlign = "center";
    cx.fillText("the solver’s perfect line · " + replay.step + "/" + board.line.length, W / 2, pad * 0.62);
  }
  function advanceReplay(t) {
    if (replay.step >= board.line.length) {
      replay.step = 0; replay.ms = board.marbles.map(m => ({ x: m.x, y: m.y }));
      replay.moving = false; replay.nextAt = t + 1300; return;
    }
    const dir = board.line[replay.step];
    const mv = E.resolveTilt(replay.ms, dir, pegSet, board.N);
    replay.from = replay.ms.map(m => ({ x: m.x, y: m.y }));
    replay.to = mv.map(m => ({ x: m.tx, y: m.ty }));
    replay.ms = E.applyMoves(mv);
    replay.moving = true; replay.mt0 = t; replay.mdur = 340;
    replay.step++; replay.nextAt = t + 900;
  }

  /* ---------------- HUD ---------------- */
  function renderTarget() {
    const s = 68; tgtCx.clearRect(0, 0, s, s);
    tgtCx.fillStyle = "#0e1320"; tgtCx.fillRect(0, 0, s, s);
    const cs = board.shape.cells;
    let mx = 0, my = 0; for (const c of cs) { mx = Math.max(mx, c[0]); my = Math.max(my, c[1]); }
    const u = s / 3.6, ox = (s - (mx + 1) * u) / 2, oy = (s - (my + 1) * u) / 2;
    for (const c of cs) {
      const x = ox + (c[0] + .5) * u, y = oy + (c[1] + .5) * u;
      const g = tgtCx.createRadialGradient(x - 2, y - 2, 1, x, y, u * .42);
      g.addColorStop(0, "#ffd9a0"); g.addColorStop(1, "#c97a14");
      tgtCx.fillStyle = g; tgtCx.beginPath(); tgtCx.arc(x, y, u * .4, 0, 7); tgtCx.fill();
    }
  }
  function renderTicks() {
    ticksEl.innerHTML = "";
    for (let i = 0; i < board.budget; i++) {
      const s = document.createElement("span");
      s.className = "tick" + (i >= board.par ? " over" : "") + (i < game.tiltsUsed ? " used" : "");
      ticksEl.appendChild(s);
    }
    parLbl.textContent = "tilts " + game.tiltsUsed + "/" + board.budget + " · par " + board.par;
  }
  function renderPegCount() { pegCountEl.textContent = game.revealed.size + "/" + board.pegs.length; }

  /* ---------------- tilt flow ---------------- */
  function vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
  function computePreview(dir) {
    previewDir = dir;
    previewGhost = dir ? E.resolveTilt(game.marbles, dir, game.revealed, board.N) : null;
  }
  function doTilt(dir) {
    if (!board || !game || anim || replay || game.over) return;
    initAudio(); enableMotion();
    const moves = E.resolveTilt(game.marbles, dir, pegSet, board.N);
    computePreview(null);
    if (!moves.some(m => m.dist > 0)) {
      setMsg("Nothing rolls that way — tilt not spent.", "warn");
      tone(160, 120, 0.08, 0.12, "sine");
      return;
    }
    game.tiltsUsed++;
    const t0 = performance.now();
    // Constant-acceleration physics: rolling time ∝ √distance (t = √(2d/a)), so long
    // rolls arrive FAST — position eases with t² (easeInQuad = uniform acceleration).
    const durs = moves.map(m => m.dist === 0 ? 0 : Math.sqrt(m.dist) * 195 + 40 + Math.random() * 20);
    anim = { dir, moves, t0, durs, fired: [false, false, false], settleT: [0, 0, 0], newPegs: 0,
      bounce: [0, 0, 0], nudge: [null, null, null],
      maxEnd: t0 + Math.max(...durs) + 220 };
    // Fail-safe: rAF can be throttled/paused (hidden tab, webview under pressure).
    // State progression must never depend on the render loop — if the frame loop
    // hasn't settled this tilt shortly after its animation window, settle it here.
    const myAnim = anim;
    myAnim.failSafe = setTimeout(() => {
      if (anim !== myAnim) return;
      const t = performance.now();
      myAnim.moves.forEach((mv, i) => { if (!myAnim.fired[i]) { myAnim.fired[i] = true; onMarbleSettle(i, mv, t); } });
      finalizeTilt(t);
    }, Math.max(...durs) + 320);
    renderTicks();
  }
  function onMarbleSettle(i, mv, t) {
    anim.settleT[i] = t;
    if (mv.dist === 0) return;
    const speed = Math.sqrt(mv.dist);                       // arrival speed ∝ √d under constant accel
    const c = cc(mv.tx, mv.ty);
    spawnBurst(c.x, c.y, "rgba(255,200,120,0.9)", 2 + Math.round(speed), 1 + speed * 0.5);
    // impact rebound: hard stops (wall/peg) recoil along -dir, harder hits recoil more
    if (mv.cause !== "marble") anim.bounce[i] = Math.min(0.18, 0.055 * speed);
    if (mv.cause === "peg") {
      if (!game.revealed.has(mv.pegKey)) {
        game.revealed.add(mv.pegKey);
        pegReveal[mv.pegKey] = t;
        anim.newPegs++;
        sndThunk(); sndPop(); vibrate(25);
        const [px, py] = mv.pegKey.split(",").map(Number), pc = cc(px, py);
        spawnBurst(pc.x, pc.y, "rgba(157,123,255,0.9)", 10, 2.2);
        renderPegCount();
      } else sndClack(0.72 + 0.11 * speed + Math.random() * 0.08, Math.min(1.25, 0.6 + 0.25 * speed));
    } else if (mv.cause === "marble") {
      sndMarble(0.95 + Math.random() * 0.2);
      // momentum transfer: the marble it hit gets a small forward shove-and-return
      const dx = DIRS[anim.dir][0], dy = DIRS[anim.dir][1];
      const hk = (mv.tx + dx) + "," + (mv.ty + dy);
      for (let j = 0; j < 3; j++) {
        if (j === i) continue;
        const pj = anim.fired[j] ? { x: anim.moves[j].tx, y: anim.moves[j].ty } : null;
        if (pj && pj.x + "," + pj.y === hk) { anim.nudge[j] = { t0: t, amp: Math.min(0.1, 0.035 * speed) }; break; }
      }
    } else sndClack(0.72 + 0.11 * speed + Math.random() * 0.08, Math.min(1.25, 0.6 + 0.25 * speed));
  }
  function finalizeTilt(t) {
    if (!anim) return;
    clearTimeout(anim.failSafe);
    game.marbles = E.applyMoves(anim.moves);
    const newPegs = anim.newPegs;
    anim = null;
    if (E.isGoal(game.marbles, board.tk)) { game.strip.push("w"); win(t); return; }
    game.strip.push(newPegs > 0 ? "o" : "q");
    if (game.tiltsUsed >= board.budget) { lose(t); return; }
    const left = board.budget - game.tiltsUsed;
    if (newPegs > 0) setMsg("Clack — " + (newPegs > 1 ? newPegs + " pegs" : "a peg") + " mapped. That knowledge cost a tilt; spend the rest well.");
    else if (left <= 2) setMsg(left + " tilt" + (left > 1 ? "s" : "") + " left. Ghost shows only what you’ve mapped — surprises still lurk.", "warn");
    else setMsg("Quiet tilt — no new pegs. " + left + " tilts left.");
  }
  function win(t) {
    game.over = true; game.won = true; winAt = t;
    sndWin(); vibrate(60);
    for (const m of game.marbles) { const c = cc(m.x, m.y); spawnBurst(c.x, c.y, "rgba(255,181,71,0.95)", 14, 2.6); }
    setMsg("Constellation formed. The felt keeps the rest of its secrets.", "");
    dpadEl.style.opacity = ".35"; dpadEl.style.pointerEvents = "none";
    const prog = loadProg();
    prog.level = Math.max(prog.level || 1, level + 1);
    saveProg(prog);
    setTimeout(() => showPanel(resultData()), 850);
  }
  function lose(t) {
    game.over = true; game.won = false; loseAt = t;
    game.finalFound = game.revealed.size;
    sndLose(); vibrate([30, 60, 30]);
    setMsg("Out of tilts. The felt lifts…", "bad");
    dpadEl.style.opacity = ".35"; dpadEl.style.pointerEvents = "none";
    let i = 0;
    for (const p of board.pegs) {
      const pk = p.x + "," + p.y;
      if (!game.revealed.has(pk)) { game.revealed.add(pk); pegReveal[pk] = t + 300 + i * 140; i++; }
    }
    pegCountEl.textContent = game.finalFound + "/" + board.pegs.length;
    setTimeout(() => { replay = { ms: board.marbles.map(m => ({ x: m.x, y: m.y })), step: 0, moving: false, nextAt: performance.now() + 400 }; }, 900 + i * 140);
    setTimeout(() => showPanel(resultData()), 1400);
  }
  function resultData() {
    return { won: game.won, tilts: game.tiltsUsed,
      found: game.won ? game.revealed.size : (game.finalFound != null ? game.finalFound : game.revealed.size),
      strip: game.strip.slice() };
  }

  /* ---------------- share / panel ---------------- */
  const EMO = { o: "\u{1F7E0}", q: "⬜", w: "✨" };
  function stripEmoji(d) { return d.strip.map(s => EMO[s]).join("") + (d.won ? "" : "❌"); }
  function shareText(d) {
    const diff = d.tilts - board.par;
    const head = d.won
      ? "Dowse L" + level + " — " + d.tilts + "/" + board.budget + " tilts · par " + board.par + " (" + (diff === 0 ? "par" : (diff > 0 ? "+" : "") + diff) + ") · pegs " + d.found + "/" + board.pegs.length
      : "Dowse L" + level + " — X/" + board.budget + " tilts · par " + board.par + " · pegs " + d.found + "/" + board.pegs.length;
    return head + "\n" + stripEmoji(d);
  }
  function toast(t) { toastEl.textContent = t; toastEl.classList.add("show"); setTimeout(() => toastEl.classList.remove("show"), 1400); }
  function doCopy(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => toast("Copied!"), () => fallbackCopy(txt));
    } else fallbackCopy(txt);
  }
  function fallbackCopy(txt) {
    const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied!"); } catch (e) { toast("Copy failed"); }
    document.body.removeChild(ta);
  }
  function doShare(txt) {
    if (navigator.share) { navigator.share({ text: txt }).catch(() => {}); }
    else doCopy(txt);
  }
  function showPanel(d) {
    const diff = d.tilts - board.par;
    const chips = [];
    if (d.won && d.tilts === board.par) chips.push('<span class="chip">✦ CLEAN · par-exact</span>');
    if (d.won && d.found * 2 < board.pegs.length) chips.push('<span class="chip viol">◐ HALF-BLIND · solved on ' + d.found + "/" + board.pegs.length + " pegs</span>");
    panel.innerHTML =
      '<h2 class="' + (d.won ? "win" : "lose") + '">' + (d.won ? "Solved in " + d.tilts + " tilt" + (d.tilts > 1 ? "s" : "") + "!" : "The felt keeps it — this time") + "</h2>" +
      '<div class="stats">' + (d.won
        ? "par " + board.par + " · " + (diff === 0 ? "right on par" : (diff > 0 ? "+" : "") + diff) + " · pegs found " + d.found + "/" + board.pegs.length
        : "par was " + board.par + " · you mapped " + d.found + "/" + board.pegs.length + " pegs · watch the perfect line replay above") + "</div>" +
      (chips.length ? '<div class="chips">' + chips.join("") + "</div>" : "") +
      '<div class="strip">' + stripEmoji(d) + "</div>" +
      '<div class="btnrow">' +
        (d.won ? '<button class="btn primary" id="bNext">Next level</button>' : '<button class="btn primary" id="bRetry">Retry level</button>') +
        '<button class="btn" id="bShare">Share</button><button class="btn" id="bCopy">Copy</button>' +
      "</div>";
    panel.hidden = false;
    const txt = shareText(d);
    const bn = document.getElementById("bNext"), br = document.getElementById("bRetry");
    const bs = document.getElementById("bShare"), bc = document.getElementById("bCopy");
    if (bn) bn.onclick = () => startLevel(level + 1);
    if (br) br.onclick = () => newGame();
    if (bs) bs.onclick = () => doShare(txt);
    if (bc) bc.onclick = () => doCopy(txt);
  }

  /* ---------------- input ---------------- */
  document.addEventListener("keydown", e => {
    const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    if (map[e.key]) { e.preventDefault(); doTilt(map[e.key]); }
  });
  for (const b of document.querySelectorAll(".dbtn")) {
    b.addEventListener("click", () => doTilt(b.dataset.dir));
    b.addEventListener("pointerenter", e => { if (e.pointerType === "mouse" && game && !game.over && !anim) computePreview(b.dataset.dir); });
    b.addEventListener("pointerleave", () => { if (previewDir) computePreview(null); });
  }
  let swipe = null;
  wrap.addEventListener("pointerdown", e => {
    enableMotion();
    if (!game || game.over || anim) return;
    swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, dir: null };
    wrap.setPointerCapture && wrap.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  wrap.addEventListener("pointermove", e => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (Math.abs(dx) < 16 && Math.abs(dy) < 16) { if (swipe.dir) { swipe.dir = null; computePreview(null); } return; }
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    if (dir !== swipe.dir) { swipe.dir = dir; computePreview(dir); }
  });
  function endSwipe(e) {
    if (!swipe || (e.pointerId !== undefined && e.pointerId !== swipe.id)) return;
    const d = swipe.dir; swipe = null;
    computePreview(null);
    if (d) doTilt(d);
  }
  wrap.addEventListener("pointerup", endSwipe);
  wrap.addEventListener("pointercancel", () => { swipe = null; computePreview(null); });

  /* ---------------- main loop / init ---------------- */
  function frame(t) {
    if (board && game) {
      draw(t);
      if (anim && t > anim.maxEnd && anim.fired.every(f => f)) finalizeTilt(t);
    }
    requestAnimationFrame(frame);
  }
  function init() {
    window.addEventListener("resize", resize);
    startLevel(loadProg().level || 1);
    requestAnimationFrame(frame);
  }
  try { window.__dowse = { tilt: d => doTilt(d), state: () => game, board: () => board, level: () => level, goto: n => startLevel(n), finish: t => finalizeTilt(t) }; } catch (e) {}
  init();
})();
