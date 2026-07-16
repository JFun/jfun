/* QUARTER (Tilt 2) — game layer: render + input + audio + undo + the on-device
   solver ("no way home"). Consumes the pure QuarterEngine; all physics live
   there so the game the player feels IS the physics the verifier certified.
   Board rendering ported from prototypes/16-quarter.html (feel-passed), recoloured
   to the periwinkle Tilt-2 identity. FX/audio are driven off engine EVENTS. */
(function () {
  "use strict";
  const E = window.QuarterEngine, LV = window.QuarterLevels.LEVELS;
  const CS = E.CS, DT = E.DT, HP = E.HP;
  const $ = s => document.querySelector(s);
  const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = p => { p = clamp(p, 0, 1); const c = 1.70158, x = p - 1; return 1 + (c + 1) * x * x * x + c * x * x; };

  const canvas = $("#c"), ctx = canvas.getContext("2d");
  const SK = "quarter.save.v1";
  const loadSave = () => { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch (e) { return {}; } };
  const writeSave = o => { try { localStorage.setItem(SK, JSON.stringify(o)); } catch (e) {} };

  let W = 320, H = 640, dpr = 1;
  let board = { cx: 160, cy: 320, size: 280, inner: 264 };
  let world = null, level = 1;
  let time = 0, firstTap = false;
  let history = [], idleSnap = null, lastTurns = 0, solvedShown = false, deadChecked = false;

  // FX pools (game layer — engine emits events, we draw the sparkle)
  let parts = [], rings = [];
  let shake = 0, shakeX = 0, shakeY = 0, flashL = 0, flashR = 0;
  let sink = null, winT = 0, winStars = 0;

  function rnd() { return Math.random(); }
  function burst(x, y, n, col, spd) {
    for (let i = 0; i < n; i++) {
      if (parts.length > 160) parts.shift();
      const a = rnd() * 6.2832, s = (0.25 + rnd() * 0.75) * spd;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, dec: 1.7 + rnd() * 1.8, size: CS * (0.045 + rnd() * 0.075), col });
    }
  }
  function ringFx(x, y, r0, r1, col, life) { if (rings.length > 20) rings.shift(); rings.push({ x, y, r0, r1, col, t: 0, life: life || 0.45 }); }

  /* ---------------- audio (ported; lazy, resumes on foreground) ---------------- */
  // iOS WKWebView audio hardening — docs/handbook/08-ios-webaudio.md. After
  // background/interruption the context returns 'suspended'|'interrupted'|ZOMBIE
  // (state lies 'running', clock frozen); the cure is close()+rebuild in a gesture.
  // Pairs with AppDelegate's AVAudioSession.setActive on didBecomeActive.
  let AC = null, master = null, noiseBuf = null, lastThump = 0, audioPoisoned = false;
  function buildAudio() {
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      AC = new C(); master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
      const n = Math.floor(AC.sampleRate * 0.4); noiseBuf = AC.createBuffer(1, n, AC.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      AC.onstatechange = () => { if (AC && AC.state !== "running") audioPoisoned = true; };
    } catch (e) { AC = null; master = null; noiseBuf = null; }
  }
  function ensureAudio() {   // call on every user gesture: rebuild a poisoned context, create if absent, resume
    if (audioPoisoned && AC) { try { AC.close(); } catch (e) {} AC = null; master = null; noiseBuf = null; audioPoisoned = false; }
    if (!AC) buildAudio();
    if (AC && AC.state !== "running") AC.resume().catch(() => {});
    if (AC && AC.state === "running") { const t0 = AC.currentTime; setTimeout(() => { if (AC && AC.state === "running" && AC.currentTime <= t0) audioPoisoned = true; }, 160); }
  }
  function wakeAudio() { if (AC && AC.state !== "running") AC.resume().catch(() => {}); }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wakeAudio(); });
  window.addEventListener("pageshow", wakeAudio);
  function noiseHit(t, dur, gain, cut, type) { if (!AC) return; const s = AC.createBufferSource(); s.buffer = noiseBuf; const f = AC.createBiquadFilter(); f.type = type || "lowpass"; f.frequency.value = cut; const g = AC.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(1e-4, t + dur); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02); }
  function tone(fr, t, dur, gain, type, slide) { if (!AC) return; const o = AC.createOscillator(); o.type = type || "sine"; o.frequency.setValueAtTime(fr, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur); const g = AC.createGain(); g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(1e-4, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03); }
  function sndTurn(d) {
    if (!AC) return; const t = AC.currentTime; const up = d === "R";
    const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = AC.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.1;
    f.frequency.setValueAtTime(up ? 340 : 720, t); f.frequency.exponentialRampToValueAtTime(up ? 760 : 320, t + E.TWEEN);
    const g = AC.createGain(); g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.06); g.gain.exponentialRampToValueAtTime(1e-4, t + E.TWEEN + 0.05);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + E.TWEEN + 0.1);
    tone(up ? 220 : 330, t, 0.12, 0.05, "triangle", up ? 330 : 220);
  }
  function sndThump(vol, mat) {
    if (!AC || vol < 0.04) return; const t = AC.currentTime; if (t - lastThump < 0.03) return; lastThump = t; vol = clamp(vol, 0, 1);
    if (mat === "boulder") { tone(90 + 40 * vol, t, 0.13, 0.32 * vol, "sine", 46); noiseHit(t, 0.07, 0.22 * vol, 300); }
    else if (mat === "clack") { tone(640 + 320 * vol, t, 0.07, 0.15 + 0.1 * vol, "triangle"); noiseHit(t, 0.03, 0.1 * vol, 2400, "highpass"); }
    else { tone(130 + 60 * vol, t, 0.09, 0.26 * vol, "sine", 60); noiseHit(t, 0.045, 0.15 * vol, 900); }
  }
  function sndCapture() { if (!AC) return; const t = AC.currentTime; noiseHit(t, 0.06, 0.15, 700); tone(659, t + 0.05, 0.28, 0.17, "sine"); tone(988, t + 0.18, 0.34, 0.19, "sine"); tone(1319, t + 0.32, 0.42, 0.15, "sine"); }

  /* ---------------- level flow ---------------- */
  function build(n) {
    level = clamp(n | 0, 1, LV.length);
    world = E.createWorld(LV[level - 1]);
    E.settle(world);
    history = []; idleSnap = E.snapshot(world); lastTurns = 0;
    solvedShown = false; deadChecked = false;
    parts.length = 0; rings.length = 0; sink = null; winT = 0;
    shake = 0; flashL = flashR = 0; firstTap = false;
    $("#hint").classList.remove("off");
    $("#ov").classList.remove("show");
    const sv = loadSave(); sv.level = level; writeSave(sv);
    updateHUD();
  }
  function updateHUD() {
    $("#turnN").textContent = "TURN " + world.turns;
    $("#parN").textContent = "PAR " + world.par;
    // pips: one per par turn, filled up to current, par-th ringed gold
    const pips = $("#pips"); pips.innerHTML = "";
    const shown = Math.max(world.par, world.turns);
    for (let i = 0; i < shown; i++) {
      const p = document.createElement("span");
      p.className = "pip" + (i < world.turns ? " on" : "") + (i === world.par - 1 ? " par" : "");
      pips.appendChild(p);
    }
    $("#undoBtn").disabled = history.length === 0 || world.phase !== "play";
  }

  // undo snapshot bookkeeping: idleSnap holds the settled state before each tap;
  // when a turn actually starts, push it so undo returns to that settled board.
  function doTurn(d) {
    if (!world || world.phase !== "play") return;
    ensureAudio();
    if (!firstTap) { firstTap = true; $("#hint").classList.add("off"); }
    E.turn(world, d);
  }
  function undo() {
    if (!history.length || world.phase !== "play") return;
    ensureAudio();
    E.restore(world, history.pop());
    lastTurns = world.turns;
    parts.length = 0; rings.length = 0; sink = null;
    deadChecked = false; $("#ov").classList.remove("show");
    updateHUD();
  }

  /* ---------------- the on-device solver: "no way home" ----------------
     The SAME exhaustive {L,R} search the verifier runs, from the CURRENT state.
     If no sequence within depth wins, the position is provably dead → offer
     undo. Runs on a scratch clone so the live world is untouched. */
  function reachableWin(snap, depth) {
    const scratch = E.createWorld(LV[level - 1]);
    E.restore(scratch, snap);
    const seen = new Set([E.hashState(scratch)]);
    let frontier = [snap];
    for (let dpt = 0; dpt < depth && frontier.length; dpt++) {
      const next = [];
      for (const s of frontier) {
        for (const d of ["L", "R"]) {
          E.restore(scratch, s);
          E.turn(scratch, d);
          E.settle(scratch);
          if (E.isWon(scratch)) return true;
          const k = E.hashState(scratch);
          if (seen.has(k)) continue;
          seen.add(k);
          next.push(E.snapshot(scratch));
        }
      }
      frontier = next;
      if (seen.size > 40000) return true;   // give up → assume reachable (never a false dead-end)
    }
    return false;
  }

  /* ---------------- events → FX/audio ---------------- */
  function consume() {
    for (const e of world.events) {
      if (e.type === "turn") { sndTurn(e.dir); if (e.dir === "R") flashR = 1; else flashL = 1; }
      else if (e.type === "impact") {
        const vol = clamp(e.speed / (CS * 18), 0, 1);
        sndThump(vol, e.kind === "boulder" ? "boulder" : "wall");
        if (e.speed > CS * 5) { burst(e.x, e.y, clamp(2 + Math.floor(vol * 7), 2, 8), e.kind === "boulder" ? "#9d8b7b" : "#8fb2ff", e.speed * 0.32); shake = Math.min(4, vol * 5); }
      } else if (e.type === "clack") {
        sndThump(clamp(e.speed / (CS * 14), 0, 1), "clack"); burst(e.x, e.y, 5, "#cfe0ff", e.speed * 0.3);
      } else if (e.type === "win") {
        onWin(e.turns);
      }
    }
    world.events.length = 0;
  }
  function onWin(turns) {
    solvedShown = true;
    winStars = turns <= world.par ? 3 : (turns <= world.par + 1 ? 2 : 1);
    const m = world.bodies[0]; sink = { fx: m.x, fy: m.y, t: 0 }; winT = 0;
    sndCapture();
    burst(world.goal.x, world.goal.y, 22, "#ffce6b", CS * 8);
    burst(world.goal.x, world.goal.y, 10, "#eef1ff", CS * 5);
    ringFx(world.goal.x, world.goal.y, E.CAPR, CS * 2.6, "#ffce6b", 0.6);
    const sv = loadSave(); sv.best = sv.best || {};
    sv.best[level] = sv.best[level] ? Math.min(sv.best[level], turns) : turns;
    writeSave(sv);
    setTimeout(showSolved, 780);
  }

  /* ---------------- cards ---------------- */
  const STAR = on => '<svg width="34" height="34" viewBox="0 0 24 24" fill="' + (on ? "#ffce6b" : "rgba(120,130,190,.3)") + '"><path d="m12 2 2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 21.4l1.4-6.8L2.2 9l6.9-.7L12 2Z"/></svg>';
  function showSolved() {
    const sv = loadSave(), best = (sv.best || {})[level] || world.turns;
    const diff = world.turns - world.par;
    const tag = diff < 0 ? "under par!" : diff === 0 ? "on par" : "+" + diff + " over";
    $("#card").innerHTML =
      '<div class="stars">' + STAR(winStars >= 1) + STAR(winStars >= 2) + STAR(winStars >= 3) + '</div>' +
      '<h2>IN!</h2>' +
      '<div class="sub">' + world.turns + (world.turns === 1 ? " turn" : " turns") + " · par " + world.par + " · " + tag + '</div>' +
      '<div class="stats">' +
        '<div class="stat"><div class="lab">TURNS</div><div class="val">' + world.turns + '</div></div>' +
        '<div class="stat"><div class="lab">PAR</div><div class="val">' + world.par + '</div></div>' +
        '<div class="stat"><div class="lab">BEST</div><div class="val gold">' + best + '</div></div>' +
      '</div>' +
      '<div class="row">' +
        (level < LV.length ? '<button class="primary" id="nextB">NEXT ▸</button>' : '<button class="primary" id="nextB">REPLAY ▸</button>') +
        '<button class="ghost" id="replayB">↺</button>' +
      '</div>';
    $("#ov").classList.add("show");
    $("#nextB").onclick = () => { build(level < LV.length ? level + 1 : level); };
    $("#replayB").onclick = () => build(level);
  }
  function showDead() {
    $("#card").innerHTML =
      '<h2 style="font-size:34px">NO WAY HOME</h2>' +
      '<div class="msg">From here the marble can\'t reach the goal, no matter how you turn.</div>' +
      '<div class="row">' +
        '<button class="primary" id="undoB">UNDO LAST TURN</button>' +
        '<button class="ghost" id="restB">↺</button>' +
      '</div>' +
      '<div class="foot">powered by the on-device solver · provably fair</div>';
    $("#ov").classList.add("show");
    $("#undoB").onclick = () => { $("#ov").classList.remove("show"); undo(); };
    $("#restB").onclick = () => build(level);
  }

  /* ---------------- fixed-step loop ---------------- */
  function tick() {
    // FX advance (board space, pulled by current gravity)
    const gux = Math.sin(world.theta), guy = Math.cos(world.theta);
    if (shake > 0) { shake = Math.max(0, shake - DT * 20); shakeX = (rnd() - 0.5) * shake; shakeY = (rnd() - 0.5) * shake; } else shakeX = shakeY = 0;
    if (flashL > 0) flashL = Math.max(0, flashL - DT * 3.2);
    if (flashR > 0) flashR = Math.max(0, flashR - DT * 3.2);
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.vx += gux * E.CS * 55 * 0.22 * DT; p.vy += guy * E.CS * 55 * 0.22 * DT; p.vx *= 1 - 1.8 * DT; p.vy *= 1 - 1.8 * DT; p.x += p.vx * DT; p.y += p.vy * DT; p.life -= p.dec * DT; if (p.life <= 0) parts.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += DT; if (rings[i].t >= rings[i].life) rings.splice(i, 1); }
    if (sink) sink.t += DT;
    if (world.phase === "won") { winT += DT; time += DT; return; }

    E.step(world);
    // undo bookkeeping: a turn started this step → push the pre-tap settled snap
    if (world.turns > lastTurns) { history.push(idleSnap); lastTurns = world.turns; deadChecked = false; updateHUD(); }
    consume();
    time += DT;
    // idle → refresh the pre-tap snapshot + run the dead-position solver ONCE
    const idle = !world.rot && world.queue.length === 0 && world.phase === "play" && world.bodies.every(b => Math.hypot(b.vx, b.vy) < CS * 0.14);
    if (idle) {
      idleSnap = E.snapshot(world);
      if (!deadChecked && world.turns > 0) {
        deadChecked = true;
        if (!reachableWin(idleSnap, world.par + 3)) showDead();
      }
    }
  }

  /* ---------------- rendering (ported, recoloured periwinkle) ---------------- */
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
  function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawPlate() {
    const N = world.N, S = world.S;
    ctx.fillStyle = "#0d0b22"; rr(0, 0, S, S, CS * 0.3); ctx.fill();
    ctx.strokeStyle = "rgba(150,140,210,0.06)"; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 1; i < N; i++) { ctx.moveTo(i * CS, 4); ctx.lineTo(i * CS, S - 4); ctx.moveTo(4, i * CS); ctx.lineTo(S - 4, i * CS); }
    ctx.stroke();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const v = world.walls[r * N + c], x = c * CS, y = r * CS;
      if (v === 1) {
        const g = ctx.createLinearGradient(x, y, x, y + CS); g.addColorStop(0, "#2a2752"); g.addColorStop(1, "#1c1a3c");
        ctx.fillStyle = g; rr(x + 2.5, y + 2.5, CS - 5, CS - 5, 10); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.06)"; rr(x + 6, y + 5, CS - 12, 5, 2.5); ctx.fill();
      } else if (v === 2) {
        ctx.fillStyle = "rgba(120,175,255,0.15)"; rr(x + 3, y + 3, CS - 6, CS - 6, 9); ctx.fill();
        ctx.strokeStyle = "rgba(200,230,255,0.38)"; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(x + CS * 0.24, y + CS * 0.70); ctx.lineTo(x + CS * 0.46, y + CS * 0.30);
        ctx.moveTo(x + CS * 0.55, y + CS * 0.74); ctx.lineTo(x + CS * 0.78, y + CS * 0.34); ctx.stroke();
      }
    }
  }
  function drawGoal() {
    const g0 = world.goal, pulse = world.phase === "play" ? 0.5 + 0.5 * Math.sin(time * 3.2) : 1, R = CS * 0.5;
    const g = ctx.createRadialGradient(g0.x, g0.y, R * 0.1, g0.x, g0.y, R);
    g.addColorStop(0, "#050416"); g.addColorStop(0.75, "#0a0820"); g.addColorStop(1, "rgba(255,206,107,0.24)");
    ctx.fillStyle = g; circle(g0.x, g0.y, R);
    ctx.strokeStyle = "rgba(255,206,107," + (0.55 + 0.35 * pulse).toFixed(3) + ")"; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(g0.x, g0.y, R, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = "rgba(255,206,107," + (0.12 + 0.16 * pulse).toFixed(3) + ")"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(g0.x, g0.y, R + 6 + pulse * 3, 0, 6.2832); ctx.stroke();
  }
  function drawMarble(m) {
    let x = m.x, y = m.y, sc = 1;
    if (sink) { const p = Math.min(1, sink.t / 0.25), e = 1 - Math.pow(1 - p, 3); x = lerp(sink.fx, world.goal.x, e); y = lerp(sink.fy, world.goal.y, e); sc = 1 - 0.45 * e; }
    ctx.save(); ctx.translate(x, y); ctx.rotate(-world.theta); ctx.scale(sc, sc);
    ctx.shadowColor = "rgba(143,178,255,0.6)"; ctx.shadowBlur = 14;
    const g = ctx.createRadialGradient(-m.r * 0.35, -m.r * 0.4, m.r * 0.12, 0, 0, m.r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.55, "#d9e4f8"); g.addColorStop(1, "#7f92c2");
    ctx.fillStyle = g; circle(0, 0, m.r); ctx.shadowBlur = 0;
    ctx.rotate(world.theta + m.rot); ctx.fillStyle = "rgba(90,110,160,0.5)";
    for (let i = 0; i < 3; i++) { const a = i * 2.094; circle(Math.cos(a) * m.r * 0.55, Math.sin(a) * m.r * 0.55, m.r * 0.13); }
    ctx.rotate(-world.theta - m.rot); ctx.fillStyle = "rgba(255,255,255,0.75)"; circle(-m.r * 0.3, -m.r * 0.34, m.r * 0.26);
    ctx.restore();
  }
  function drawBoulder(b) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
    const g = ctx.createRadialGradient(-b.r * 0.3, -b.r * 0.35, b.r * 0.15, 0, 0, b.r);
    g.addColorStop(0, "#9c8a78"); g.addColorStop(0.65, "#6f6155"); g.addColorStop(1, "#463d34");
    ctx.fillStyle = g; circle(0, 0, b.r);
    ctx.strokeStyle = "rgba(20,16,12,0.5)"; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(-b.r * 0.55, -b.r * 0.15); ctx.lineTo(-b.r * 0.05, -b.r * 0.5);
    ctx.moveTo(b.r * 0.15, b.r * 0.05); ctx.lineTo(b.r * 0.55, -b.r * 0.28);
    ctx.moveTo(-b.r * 0.3, b.r * 0.42); ctx.lineTo(b.r * 0.12, b.r * 0.5); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.10)"; circle(-b.r * 0.28, -b.r * 0.32, b.r * 0.22);
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, b.r - 1.2, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }
  function drawParts() {
    for (const p of parts) { ctx.globalAlpha = clamp(p.life, 0, 1) * 0.85; ctx.fillStyle = p.col; circle(p.x, p.y, p.size * (0.4 + 0.6 * p.life)); }
    ctx.globalAlpha = 1;
    for (const r of rings) { const q = clamp(r.t / r.life, 0, 1), e = q * (2 - q); ctx.globalAlpha = (1 - q) * 0.9; ctx.strokeStyle = r.col; ctx.lineWidth = Math.max(1.5, 6 * (1 - q)); ctx.beginPath(); ctx.arc(r.x, r.y, lerp(r.r0, r.r1, e), 0, 6.2832); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function drawBoard() {
    const inner = board.inner, ix = board.cx - inner / 2, iy = board.cy - inner / 2, S = world.S;
    ctx.save(); rr(ix, iy, inner, inner, inner * 0.06); ctx.clip();
    ctx.fillStyle = "#080619"; ctx.fillRect(ix, iy, inner, inner);
    const rg = ctx.createRadialGradient(board.cx, board.cy, inner * 0.1, board.cx, board.cy, inner * 0.75);
    rg.addColorStop(0, "rgba(143,178,255,0.06)"); rg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = rg; ctx.fillRect(ix, iy, inner, inner);
    ctx.translate(board.cx + shakeX, board.cy + shakeY);
    const sc = inner / S; ctx.scale(sc, sc); ctx.rotate(world.theta); ctx.translate(-S / 2, -S / 2);
    drawPlate(); drawGoal(); drawParts();
    for (let i = world.bodies.length - 1; i >= 0; i--) { const b = world.bodies[i]; if (b.kind === "boulder") drawBoulder(b); else drawMarble(b); }
    ctx.restore();
    const ft = (board.size - inner) / 2;
    ctx.strokeStyle = "#221d44"; ctx.lineWidth = ft; rr(ix - ft / 2, iy - ft / 2, inner + ft, inner + ft, inner * 0.06 + ft / 2); ctx.stroke();
    ctx.strokeStyle = "rgba(150,140,210,0.25)"; ctx.lineWidth = 1.5; rr(ix - ft, iy - ft, inner + ft * 2, inner + ft * 2, inner * 0.06 + ft); ctx.stroke();
  }
  function drawEdgeFlashes() {
    if (flashL > 0) { const g = ctx.createLinearGradient(0, 0, W * 0.16, 0); g.addColorStop(0, "rgba(143,178,255," + (0.22 * flashL).toFixed(3) + ")"); g.addColorStop(1, "rgba(143,178,255,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W * 0.16, H); }
    if (flashR > 0) { const g = ctx.createLinearGradient(W, 0, W - W * 0.16, 0); g.addColorStop(0, "rgba(143,178,255," + (0.22 * flashR).toFixed(3) + ")"); g.addColorStop(1, "rgba(143,178,255,0)"); ctx.fillStyle = g; ctx.fillRect(W - W * 0.16, 0, W * 0.16, H); }
  }
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawEdgeFlashes();
    drawBoard();
  }

  /* ---------------- input ---------------- */
  window.addEventListener("pointerdown", ensureAudio, true);
  canvas.addEventListener("pointerdown", e => {
    e.preventDefault(); ensureAudio();
    if (world.phase === "won") return;                    // solved card handles NEXT
    doTurn(e.clientX < W / 2 ? "L" : "R");
  });
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  window.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") { doTurn("L"); e.preventDefault(); }
    else if (e.key === "ArrowRight") { doTurn("R"); e.preventDefault(); }
    else if (e.key === "z" || e.key === "Backspace") { undo(); e.preventDefault(); }
  });
  $("#ccwBtn").addEventListener("click", () => doTurn("L"));
  $("#cwBtn").addEventListener("click", () => doTurn("R"));
  $("#undoBtn").addEventListener("click", undo);
  $("#levelsBtn").addEventListener("click", () => { const n = prompt("Level (1–" + LV.length + ")", level); if (n) build(+n); });
  $("#gearBtn").addEventListener("click", () => {});

  /* ---------------- resize + loop ---------------- */
  function resize() {
    W = Math.max(160, window.innerWidth || 320); H = Math.max(260, window.innerHeight || 640);
    dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    const topPad = Math.max(78, H * 0.12), botPad = Math.max(128, H * 0.18);
    let size = Math.min(W * 0.92, H - topPad - botPad); size = Math.max(160, size);
    const ft = Math.max(8, size * 0.028);
    board = { cx: W / 2, cy: topPad + (H - topPad - botPad) / 2, size, inner: size - ft * 2 };
  }
  window.addEventListener("resize", resize);
  resize();
  const sv0 = loadSave();
  build(sv0.level || 1);

  let acc = 0, last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    acc += Math.min(50, now - last) / 1000; last = now;
    let guard = 0;
    while (acc >= DT && guard < 600) { tick(); acc -= DT; guard++; }
    render();
  }
  requestAnimationFrame(frame);

  // automation hooks (verifier parity + preview checks)
  window.__q = {
    state: () => ({ level, par: world.par, turns: world.turns, won: world.phase === "won", rotating: !!world.rot, marble: { x: world.bodies[0].x, y: world.bodies[0].y } }),
    turn: doTurn, undo, goto: build, world: () => world,
    dead: showDead,   // dev: preview the no-way-home card (T0/T1 have no real dead-ends)
    solvable: () => reachableWin(E.snapshot(world), world.par + 3),
  };
})();
