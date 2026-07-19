/* RATTLE — game layer: render + input + audio + the RATTLE verb + cards.
   Consumes the pure deterministic RattleEngine (fixed WREF×HREF world space);
   the render maps that world onto the screen, so what the player pops IS the
   physics the verifier certified. Pile/vessel/HUD ported from prototypes/
   13-rattle.html, recoloured to the honey identity; FX/audio driven off events. */
(function () {
  "use strict";
  const E = window.RattleEngine, LV = window.RattleLevels.LEVELS;
  const FDT = E.FDT, WREF = E.WREF, HREF = E.HREF;
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = p => { p = clamp(p, 0, 1); const c = 1.70158, x = p - 1; return 1 + (c + 1) * x * x * x + c * x * x; };
  const PALETTE = [
    { b: "#ffce6b", d: "#8a5f16" }, { b: "#6ea8ff", d: "#1d4faf" }, { b: "#ff6b6b", d: "#a02733" },
    { b: "#4bd48a", d: "#136e42" }, { b: "#9d7bff", d: "#5a35c2" },
  ];
  const canvas = $("#c"); let ctx = canvas.getContext("2d");   // ctx is briefly swapped to an offscreen canvas to render debut-card bead icons
  const SK = "rattle.save.v1";
  const loadSave = () => { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch (e) { return {}; } };
  const writeSave = o => { try { localStorage.setItem(SK, JSON.stringify(o)); } catch (e) {} };
  const F = "Nunito, -apple-system, system-ui, sans-serif";

  let W = 390, H = 844, DPR = 1, s = 1, ox = 0, oy = 0;   // screen; s/ox/oy = world→screen
  let world = null, level = 1, simT = 0, firstTap = false, cardUp = false, deadOffered = false, coach = null, rattledThisLevel = false;
  // real device safe-area insets (notch / home indicator) — read from a CSS probe
  const INSET = { top: 0, bottom: 0 };
  const insetProbe = document.createElement("div");
  insetProbe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
  document.body.appendChild(insetProbe);
  function readInsets() { const c = getComputedStyle(insetProbe); INSET.top = parseFloat(c.paddingTop) || 0; INSET.bottom = parseFloat(c.paddingBottom) || 0; }
  let parts = [], rings = [], shakeA = 0, banner = "", bannerT = 99, wob = {};

  /* ---------------- audio (ported, honey-neutral) ----------------
     iOS WKWebView hardening — docs/handbook/08-ios-webaudio.md. After background /
     interruption the context returns 'suspended' | 'interrupted' (Safari-only —
     never === 'suspended') | ZOMBIE (state LIES 'running' but the clock is frozen).
     resume() cannot revive interrupted/zombie; the only cure is close()+rebuild,
     done IN A GESTURE (creation outside a gesture can be denied). Pairs with the
     native AVAudioSession.setActive(true) on didBecomeActive (AppDelegate.swift) —
     without that, web resume can never restart output. tone()/sPop/etc. read the
     module-scoped AC/master, so a rebuild reassigns them transparently. */
  let AC = null, master = null, clackT = 0, clackN = 0, audioPoisoned = false;
  function buildAudio() {
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      AC = new A();
      const cp = AC.createDynamicsCompressor(); master = AC.createGain(); master.gain.value = 0.45; master.connect(cp); cp.connect(AC.destination);
      AC.onstatechange = () => { if (AC && AC.state !== "running") audioPoisoned = true; };   // any drop from running poisons the graph
    } catch (e) { AC = null; master = null; }
  }
  // call on EVERY user gesture: rebuild a poisoned context, create if absent, resume.
  function initAudio() {
    if (audioPoisoned && AC) { try { AC.close(); } catch (e) {} AC = null; master = null; audioPoisoned = false; }
    if (!AC) buildAudio();
    if (AC && AC.state !== "running") AC.resume().catch(() => {});
    // zombie guard: state can lie 'running' with a frozen clock → flag for the next gesture to rebuild
    if (AC && AC.state === "running") { const t0 = AC.currentTime; setTimeout(() => { if (AC && AC.state === "running" && AC.currentTime <= t0) audioPoisoned = true; }, 160); }
  }
  // foreground paths only resume (the native session reactivates on didBecomeActive);
  // a poisoned context is healed by the next gesture's initAudio().
  function wakeAudio() { if (AC && AC.state !== "running") AC.resume().catch(() => {}); }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wakeAudio(); });
  window.addEventListener("pageshow", wakeAudio);
  function tone(type, f0, f1, dur, vol, when) {
    if (!AC) return;
    try { const t0 = AC.currentTime + (when || 0); const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(Math.max(1, f0), t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.03); } catch (e) {}
  }
  function sClack(v) { if (!AC) return; if (simT - clackT > 0.07) { clackT = simT; clackN = 0; } if (clackN >= 5) return; clackN++; const f = 480 + Math.random() * 320; tone("triangle", f, f * 0.6, 0.045, Math.min(0.28, v * 0.5)); }
  function sPop(size) { const q = Math.min(size, 14); tone("square", 110 + q * 7, 55, 0.16, 0.34); tone("triangle", 560 + q * 45, 900 + q * 60, 0.12, 0.20, 0.02); if (q >= 6) tone("sine", 70, 40, 0.22, 0.26, 0.01); }
  function sRattle() { for (let i = 0; i < 5; i++) tone("triangle", 300 + Math.random() * 500, 200, 0.05, 0.12, i * 0.02); }
  function sThud() { tone("sine", 150, 88, 0.12, 0.22); }
  function sQuack() { tone("sawtooth", 310, 170, 0.13, 0.16); }
  function sChime() { tone("triangle", 784, 784, 0.18, 0.26); tone("triangle", 1175, 1175, 0.24, 0.22, 0.09); }
  function sWin() { [523, 659, 784, 1046].forEach((f, i) => tone("triangle", f, f, 0.2, 0.28, i * 0.09)); }
  function sCrack() { tone("square", 230, 90, 0.09, 0.26); tone("triangle", 150, 80, 0.13, 0.2, 0.02); }
  function sBalloonPop() { tone("square", 880, 120, 0.06, 0.3); tone("sine", 300, 90, 0.1, 0.16, 0.01); }
  function sBoom() { tone("sine", 92, 30, 0.42, 0.42); tone("square", 165, 42, 0.24, 0.3, 0.01); tone("triangle", 420, 70, 0.2, 0.2, 0.02); }

  /* ---------------- fx ---------------- */
  function burst(x, y, color, n, spd) { for (let i = 0; i < n; i++) { if (parts.length > 240) parts.shift(); const a = Math.random() * 6.283, sp = (0.3 + Math.random() * 0.8) * spd; parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - spd * 0.3, t: 0, life: 0.45 + Math.random() * 0.4, color, r: world.L.ballR * (0.14 + Math.random() * 0.14), rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12 }); } }
  function ringFx(x, y, r0, r1, color, life) { if (rings.length > 24) rings.shift(); rings.push({ x, y, r0, r1, color, t: 0, life }); }
  function confetti() { for (let i = 0; i < 44; i++) { const c = PALETTE[(Math.random() * world.spec.colors) | 0].b; const L = world.L; const x = L.vx0 + Math.random() * (L.vx1 - L.vx0), y = L.vTop + Math.random() * (L.vFloor - L.vTop) * 0.4; if (parts.length > 240) parts.shift(); const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8, sp = HREF * (0.3 + Math.random() * 0.5); parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.7 + Math.random() * 0.6, color: c, r: L.ballR * (0.14 + Math.random() * 0.16), rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14 }); } }

  /* ---------------- level flow ---------------- */
  function build(n) {
    level = clamp(n | 0, 1, LV.length);
    world = E.createWorld(LV[level - 1]);
    simT = 0; firstTap = false; cardUp = false; deadOffered = false; coach = null; rattledThisLevel = false;
    parts = []; rings = []; shakeA = 0; wob = {};
    banner = "LEVEL " + level; bannerT = 0;
    $("#hint").textContent = world.spec.hint; $("#hint").classList.remove("off");
    $("#ov").classList.remove("show");
    const sv = loadSave(); sv.level = level; writeSave(sv);
    // element debut: on-board coach-mark the first time this element appears
    const intro = world.spec.intro;
    if (intro && !(sv.seen && sv.seen[intro])) startCoach(intro);
  }
  function consume() {
    for (const e of world.events) {
      if (e.type === "clack") sClack(e.v);
      else if (e.type === "pop") { const P = PALETTE[e.color]; sPop(e.size); for (let k = 0; k < e.size; k++) {} burst(e.x, e.y, P.b, 6 + e.size, HREF * 0.35); ringFx(e.x, e.y, world.L.ballR, world.L.ballR * (2 + e.size * 0.5), P.b, 0.42); if (e.size >= 6) shakeA = Math.min(6, 2 + e.size * 0.4); }
      else if (e.type === "rattle") { sRattle(); shakeA = Math.max(shakeA, 3.5); }
      else if (e.type === "wobble") { wob[e.i] = 1; sThud(); }
      else if (e.type === "crack") { sCrack(); burst(e.x, e.y, "#a9762e", 10, HREF * 0.3); ringFx(e.x, e.y, world.L.ballR, world.L.ballR * 2, "#d3a35a", 0.4); shakeA = Math.max(shakeA, 2); }
      else if (e.type === "balloonpop") { sBalloonPop(); burst(e.x, e.y, "#e95c84", 12, HREF * 0.4); ringFx(e.x, e.y, world.L.ballR, world.L.ballR * 2.4, "#ff9ab6", 0.4); }
      else if (e.type === "bomb") { sBoom(); burst(e.x, e.y, "#ff8a3c", 22, HREF * 0.55); ringFx(e.x, e.y, world.L.ballR, world.L.ballR * 5, "#ff5a2a", 0.5); ringFx(e.x, e.y, world.L.ballR, world.L.ballR * 3.5, "#ffd24d", 0.4); shakeA = Math.min(8, shakeA + 5); }
      else if (e.type === "quack") sQuack();
      else if (e.type === "duck") { sChime(); ringFx(e.x, e.y, world.L.ballR, world.L.ballR * 2.6, "#ffd44d", 0.6); burst(e.x, e.y, "#ffd44d", 14, HREF * 0.4); }
      else if (e.type === "win") { sWin(); confetti(); setTimeout(() => showCleared(e.spare), 620); }
      else if (e.type === "lose") { if (!cardUp) showLose(); }
      else if (e.type === "nopairs") { if (!deadOffered && !cardUp && world.taps > 0) { deadOffered = true; showNoPairs(); } }
    }
    world.events.length = 0;
    devLog();
  }
  // DEV-ONLY flight recorder: after every consumed tap, snapshot the objective +
  // crate state into localStorage (rolling 150). Pullable off-device via
  // `devicectl copy --domain-type appDataContainer` → localstorage.sqlite3, so a
  // "chip says 2, board shows none" report becomes a readable board history
  // instead of a screenshot argument. Dev builds only — never ships.
  let devLogSig = "";
  function devLog() {
    if (!(typeof DEV_UNLOCK !== "undefined" && DEV_UNLOCK) || !world) return;
    try {
      // consume() runs every frame — only record actual STATE CHANGES (tap spent /
      // objective moved / level switch), or 150 entries is 2.5s of noise.
      const sig = level + "|" + world.taps + "|" + world.objectives.map(o => o.rem).join(",");
      if (sig === devLogSig) return;
      devLogSig = sig;
      // board bounds + the full render mapping: detects BOTH physics-out-of-bounds
      // (bead beyond walls/floor) AND a device-side mapping anomaly (ox/oy/s/insets)
      // — the two live hypotheses for "counted crate, empty screen, no ring".
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const b of world.balls) { if (!b.alive) continue; if (b.x < minX) minX = b.x; if (b.x > maxX) maxX = b.x; if (b.y < minY) minY = b.y; if (b.y > maxY) maxY = b.y; }
      const log = JSON.parse(localStorage.getItem("rattle.devlog") || "[]");
      log.push({
        t: Date.now(), lv: level, taps: world.taps, phase: world.phase,
        objs: world.objectives.map(o => ({ k: o.kind, c: o.color, rem: o.rem })),
        // every bead that IS or EVER WAS shelled — alive:0 on a shelled bead would
        // prove a kill-without-decrement, the one path all fuzzing says can't happen
        crates: world.balls.filter(b => b.shelled).map(b => ({ c: b.c, x: Math.round(b.x), y: Math.round(b.y), alive: b.alive ? 1 : 0 })),
        alive: world.balls.reduce((n, b) => n + (b.alive ? 1 : 0), 0),
        bounds: [Math.round(minX), Math.round(maxX), Math.round(minY), Math.round(maxY)],
        map: { W, H, s: +s.toFixed(4), ox: Math.round(ox), oy: Math.round(oy), it: INSET.top, ib: INSET.bottom, r: Math.round(world.L.ballR) },
      });
      while (log.length > 150) log.shift();
      localStorage.setItem("rattle.devlog", JSON.stringify(log));
    } catch (e) {}
  }

  /* ---------------- cards ---------------- */
  // shared card icons (from the design source)
  const refreshIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>';
  const rattleIcon = (sz, col, sw) => '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke="' + col + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 8V6M16 8V6M9 14l-1.5 3.5M15 14l1.5 3.5M12 14v3.5"/></svg>';
  const DUCK_SVG = '<svg width="46" height="46" viewBox="0 0 24 24" fill="#ffd44d"><circle cx="13" cy="14" r="6.4"/><circle cx="9.4" cy="9.2" r="3.8"/><path d="M6.6 8.2 3.2 9.2 6.7 10.6z" fill="#ff9d3b"/><circle cx="8.6" cy="8.6" r="0.8" fill="#20242e"/><ellipse cx="14.5" cy="14.6" rx="3" ry="1.9" fill="rgba(200,150,30,0.55)"/></svg>';
  // win stars — a fanned arc: outer 40px rotated ±12°, centre 56px raised; earned=gold, else dim
  function starsArc(n) {
    const col = on => on ? "#ffce6b" : "rgba(150,130,175,.28)";
    const sh = (on, d) => "text-shadow:0 " + d + "px 0 " + (on ? "#9a6a12" : "rgba(0,0,0,.35)");
    return '<div class="stars">' +
      '<span style="font-size:40px;color:' + col(n >= 1) + ';' + sh(n >= 1, 3) + ';transform:rotate(-12deg)">★</span>' +
      '<span style="font-size:56px;color:' + col(n >= 2) + ';' + sh(n >= 2, 4) + ';margin-bottom:5px">★</span>' +
      '<span style="font-size:40px;color:' + col(n >= 3) + ';' + sh(n >= 3, 3) + ';transform:rotate(12deg)">★</span>' +
    '</div>';
  }
  function showCleared(spare) {
    cardUp = true;
    // EFFICIENCY stars vs the verifier's bot-optimal `par` (not the generous budget):
    // 3★ = within a tap of optimal, 2★ = tidy, 1★ = any clear. Perfect = par + no rattle.
    // par is oracle-guaranteed reachable, so every 3★ is fair. docs: skilled-player research.
    const par = world.spec.par || world.spec.taps;
    const used = world.spec.taps - spare;
    // PERFECT = matched the bot-optimal solve with no rattle. `===` (not `<=`): the budget is
    // always ≥ par+1, so a full-budget clear can never fake a PERFECT. 3★ = within a tap of par.
    const perfect = used === par && !rattledThisLevel;
    const stars = used <= par + 1 ? 3 : used <= par + 3 ? 2 : 1;
    const sv = loadSave();
    sv.stars = sv.stars || {}; const prevStars = sv.stars[level] || 0; const bestStars = Math.max(prevStars, stars); sv.stars[level] = bestStars;
    sv.perfect = sv.perfect || {}; if (perfect) sv.perfect[level] = 1;
    sv.best = sv.best || {}; sv.best[level] = Math.max(sv.best[level] || 0, spare);
    writeSave(sv);
    // the stars ARE the grade — no par/used numbers on the card (reads like a debug
    // readout, and it's redundant with the stars). Just a warm line + a Perfect flourish.
    const gotToy = level % 2 === 1;
    const toyN = 3 + level;   // deterministic toy-chest slot (Excavate collection pattern)
    const toyBit = gotToy ? ' · <span style="color:#4bd48a">new toy' + (perfect ? '!' : ' unlocked!') + '</span>' : '';
    const sub = perfect
      ? '<span style="color:#ffce6b">★ PERFECT</span>' + toyBit
      : (spare + (spare === 1 ? ' tap spare' : ' taps spare') + toyBit);
    $("#card").innerHTML =
      '<div class="glow"></div>' +
      starsArc(stars) +
      '<h2>CLEARED!</h2>' +
      '<div class="sub">' + sub + '</div>' +
      (gotToy ? '<div class="toy">' + DUCK_SVG + '<div class="lab"><b>Rubber Duck</b><span>toy ' + toyN + ' of 50 · Bath-Time set</span></div></div>' : '') +
      '<div class="btns">' +
        '<button class="primary" id="nextB">' + (level < LV.length ? "NEXT ▸" : "REPLAY ▸") + '</button>' +
        '<div class="row">' +
          '<button class="ghost" id="replayB"><span>' + refreshIcon + 'Replay</span></button>' +
          '<button class="ghost" id="chestB">Toy chest</button>' +
        '</div>' +
      '</div>';
    $("#ov").classList.add("show");
    $("#nextB").onclick = () => build(level < LV.length ? level + 1 : level);
    $("#replayB").onclick = () => build(level);
    $("#chestB").onclick = () => showToyChest(spare);
  }
  function showToyChest(spare) {   // placeholder — full collection screen is a follow-up
    cardUp = true;
    const owned = 3 + level;
    $("#card").innerHTML =
      '<div class="eyebrow" style="color:var(--honey)">TOY CHEST</div>' +
      '<h2 style="text-shadow:0 3px 0 #140c22">' + owned + ' <span style="color:var(--dim2);font-size:20px">/ 50</span></h2>' +
      '<div class="msg" style="margin-top:10px">Every couple of levels drops a toy. The full collection screen is on the way.</div>' +
      '<div class="btns"><button class="primary" id="backB">◂ BACK</button></div>';
    $("#ov").classList.add("show");
    $("#backB").onclick = () => showCleared(spare);
  }
  function showNoPairs() {
    cardUp = true;
    $("#card").innerHTML =
      '<div style="width:66px;height:66px;margin:0 auto 12px;border-radius:20px;background:#140c22;border:1px solid #3a2e4c;display:flex;align-items:center;justify-content:center">' + rattleIcon(36, "#ffce6b", 2) + '</div>' +
      '<h2 style="font-size:24px;margin:0 0 6px;text-shadow:0 3px 0 #140c22">NO PAIRS LEFT</h2>' +
      '<div class="msg">No same-color cluster to pop — but you\'re not stuck. Rattle the jar and the pile re-settles into fresh clusters.</div>' +
      '<div class="btns">' +
        '<button class="primary" id="ratB">' + rattleIcon(20, "#3a1e05", 2.4) + 'RATTLE THE JAR</button>' +
        '<button class="ghost" id="restB"><span>' + refreshIcon + 'Restart level</span></button>' +
      '</div>' +
      '<div class="foot">rattle costs 1 tap · the pile is never a dead end</div>';
    $("#ov").classList.add("show");
    $("#ratB").onclick = () => { $("#ov").classList.remove("show"); cardUp = false; deadOffered = false; rattledThisLevel = true; initAudio(); E.doRattle(world); };
    $("#restB").onclick = () => build(level);
  }
  // out of taps with the level unfinished — a genuine loss (rattle can't help at 0 taps)
  function showLose() {
    cardUp = true;
    // per-objective remaining — never sum different kinds into one "beads" count
    // (a two-objective shell/balloon level has crates AND beads left, different units).
    const parts = [];
    for (const o of world.objectives) {
      if (o.rem <= 0) continue;
      if (o.kind === "duck") parts.push("the duck");
      else if (o.kind === "shells") parts.push(o.rem + (o.rem === 1 ? " crate" : " crates"));
      else if (o.kind === "balloons") parts.push(o.rem + (o.rem === 1 ? " balloon" : " balloons"));
      else parts.push(o.rem + (o.rem === 1 ? " bead" : " beads"));
    }
    const need = parts.length ? parts.join(" + ") + " to go" : "almost there";
    $("#card").innerHTML =
      '<div style="width:66px;height:66px;margin:0 auto 12px;border-radius:20px;background:#140c22;border:1px solid #3a2e4c;display:flex;align-items:center;justify-content:center"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ff5a3c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg></div>' +
      '<h2 style="font-size:24px;margin:0 0 6px;text-shadow:0 3px 0 #140c22">OUT OF TAPS</h2>' +
      '<div class="msg">So close — ' + need + '. Give it another go.</div>' +
      '<div class="btns"><button class="primary" id="retryB"><span>' + refreshIcon + '</span>TRY AGAIN</button></div>' +
      '<div class="foot">every restart re-forms the pile from the same seed</div>';
    $("#ov").classList.add("show");
    $("#retryB").onclick = () => build(level);
  }
  // element debut copy — the on-board coach-mark's bubble text. NEW ELEMENT eyebrow ·
  // Lilita name · honey rule + dim detail. (ice + tar cut — see design-4-rattle.md;
  // their engine rules remain dormant but no level spawns them.)
  /* Qi 2026-07-17: "too much wording — less text, more visual." One short
     imperative per card; the SPOTLIGHT + per-element animation do the teaching
     (the duck gets a chevron trail down to a glowing floor target). */
  const ELEM_INTRO = {
    stone:   { name: "STONE BEAD",   c: 0, rule: "Dead weight — dig around it" },
    shell:   { name: "SHELL BEAD",   c: 0, rule: "Pop the crate's colour beside it" },
    balloon: { name: "BALLOON BEAD", c: 0, rule: "Pop beside it to burst it" },
    bomb:    { name: "BOMB BEAD",    c: 2, rule: "Pop beside it — boom!" },
  };
  /* -------- on-board element intro: a Royal-Match-style coach-mark that
     SPOTLIGHTS the real element on the pile and explains it there, instead of a
     disconnected modal card. Dim veil + soft hole on the actual bead + pulsing
     ring + a pointer bubble; tap anywhere to continue. -------- */
  const COACH = Object.assign({
    duck: { name: "RUBBER DUCK", rule: "Pop below it — down to the floor" },
  }, ELEM_INTRO);
  function startCoach(el) {
    let bead = null;
    if (el === "duck") bead = world.duck;
    else { let top = 1e9; for (const b of world.balls) { if (!b.alive || isNaN(b.x) || isNaN(b.y)) continue; const isEl = el === "shell" ? b.shelled : b.el === el; if (!isEl) continue; if (b.y < top) { top = b.y; bead = b; } } }
    if (!bead) return;                                   // no visible instance — skip
    coach = { el, bead, t: 0 }; $("#hint").classList.add("off");
  }
  function dismissCoach() {
    if (!coach) return;
    const sv = loadSave(); sv.seen = sv.seen || {}; sv.seen[coach.el] = 1; writeSave(sv);
    coach = null;
  }
  function drawCoach() {
    const info = COACH[coach.el]; if (!info) { coach = null; return; }
    const b = coach.bead;
    if (!b.alive && coach.el !== "duck") { dismissCoach(); return; }
    const sx = ox + b.x * s, sy = oy + b.y * s, sr = Math.max(b.r * s, 16);
    const fade = clamp(coach.t / 0.28, 0, 1);
    const hole = sr * 3.0;
    // dim veil that FADES to clear over the real bead — a radial fill drawn ON TOP
    // of the board (no compositing), so the spotlighted bead still shows through
    ctx.save(); ctx.globalAlpha = fade;
    const g = ctx.createRadialGradient(sx, sy, sr * 0.85, sx, sy, hole);
    g.addColorStop(0, "rgba(9,5,16,0)"); g.addColorStop(0.5, "rgba(9,5,16,0)"); g.addColorStop(1, "rgba(9,5,16,0.82)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // pulsing highlight ring on the bead
    const pulse = 0.5 + 0.5 * Math.sin(simT * 4.5);
    ctx.save(); ctx.globalAlpha = fade;
    ctx.strokeStyle = "rgba(255,206,107," + (0.5 + 0.4 * pulse) + ")";
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, sr * (1.28 + 0.14 * pulse), 0, 7); ctx.stroke();
    ctx.restore();
    // DUCK: the mechanic is directional, so SHOW it — animated chevrons flowing
    // from the duck down to a glowing target on the floor (replaces a sentence).
    if (coach.el === "duck") {
      const floorY = oy + world.L.vFloor * s;
      const top = sy + sr * 1.7, span = floorY - 10 - top;
      if (span > 50) {
        ctx.save(); ctx.globalAlpha = fade;
        const spacing = 34, off = (simT * 46) % spacing, chW = 11, chH = 7;
        for (let y = top + off; y < floorY - 14; y += spacing) {
          const p = (y - top) / span;                                  // fade in/out along the trail
          ctx.strokeStyle = "rgba(255,206,107," + (0.85 * Math.sin(Math.PI * clamp(p, 0.04, 0.96))) + ")";
          ctx.lineWidth = 3.5; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(sx - chW, y); ctx.lineTo(sx, y + chH); ctx.lineTo(sx + chW, y); ctx.stroke();
        }
        // floor target: a soft pulsing landing strip under the duck
        ctx.strokeStyle = "rgba(255,206,107," + (0.45 + 0.35 * pulse) + ")";
        ctx.lineWidth = 4; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(sx - 26, floorY - 4); ctx.lineTo(sx + 26, floorY - 4); ctx.stroke();
        ctx.restore();
      }
    }
    // pointer bubble — COMPACT (Qi: less text, more visual): eyebrow + name +
    // one short imperative. Above the spotlight if there's room, else below.
    const bw = Math.min(300, W - 30), bh = 124;
    const above = sy - hole - bh - 24 > INSET.top + 14;
    const by = above ? sy - hole - bh - 22 : sy + hole + 22;
    const bx = clamp(sx - bw / 2, 14, W - bw - 14);
    const px = clamp(sx, bx + 30, bx + bw - 30);
    ctx.save(); ctx.globalAlpha = fade;
    ctx.fillStyle = above ? "#1a1226" : "#2a2038";        // pointer triangle toward the bead
    ctx.beginPath();
    if (above) { ctx.moveTo(px - 13, by + bh); ctx.lineTo(px + 13, by + bh); ctx.lineTo(px, by + bh + 15); }
    else { ctx.moveTo(px - 13, by); ctx.lineTo(px + 13, by); ctx.lineTo(px, by - 15); }
    ctx.closePath(); ctx.fill();
    const grd = ctx.createLinearGradient(0, by, 0, by + bh); grd.addColorStop(0, "#2a2038"); grd.addColorStop(1, "#1a1226");
    rrect(bx, by, bw, bh, 22); ctx.fillStyle = grd; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#4a3a5c"; rrect(bx, by, bw, bh, 22); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
    ctx.fillStyle = "#ff5a3c"; ctx.font = "900 12px " + F;                    // eyebrow 12
    ctx.fillText(coach.el === "duck" ? "NEW FRIEND" : "NEW ELEMENT", bx + bw / 2, by + 30);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.fillStyle = "#fff"; ctx.font = "25px 'Lilita One', " + F;             // title (Lilita display)
    ctx.fillText(info.name, bx + bw / 2, by + 62);
    ctx.fillStyle = "#ffb648"; ctx.font = "800 14.5px " + F;                  // the ONE line
    ctx.fillText(info.rule, bx + bw / 2, by + 88);
    ctx.fillStyle = "#8b7c98"; ctx.font = "800 12px " + F;
    ctx.fillText("TAP TO CONTINUE ▸", bx + bw / 2, by + bh - 16);
    ctx.restore();
  }

  /* ---------------- rendering (world space via s/ox/oy) ---------------- */
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  function rrect(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawGlyph(x, y, r, c) {
    ctx.fillStyle = PALETTE[c].d; ctx.strokeStyle = PALETTE[c].d;
    if (c === 0) { ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, 7); ctx.fill(); }
    else if (c === 1) { ctx.beginPath(); ctx.moveTo(x, y - r * 0.42); ctx.lineTo(x + r * 0.38, y + r * 0.28); ctx.lineTo(x - r * 0.38, y + r * 0.28); ctx.closePath(); ctx.fill(); }
    else if (c === 2) { ctx.fillRect(x - r * 0.30, y - r * 0.30, r * 0.60, r * 0.60); }
    else if (c === 3) { ctx.beginPath(); ctx.moveTo(x, y - r * 0.42); ctx.lineTo(x + r * 0.38, y); ctx.lineTo(x, y + r * 0.42); ctx.lineTo(x - r * 0.38, y); ctx.closePath(); ctx.fill(); }
    else { ctx.lineWidth = r * 0.18; ctx.beginPath(); ctx.arc(x, y, r * 0.30, 0, 7); ctx.stroke(); }
  }
  function drawBall(x, y, r, c) {
    const P = PALETTE[c];
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = P.b; ctx.fill();
    ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(x, y, r * 0.90, 0, 7); ctx.lineWidth = r * 0.18; ctx.strokeStyle = P.d; ctx.stroke(); ctx.globalAlpha = 1;
    drawGlyph(x, y, r, c);
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(x - r * 0.36, y - r * 0.40, r * 0.15, 0, 7); ctx.fill();
  }
  function drawDuck(x, y, r, wb) {
    ctx.save(); ctx.translate(x, y); if (wb > 0) ctx.rotate(Math.sin(simT * 30) * wb * 0.15);
    ctx.fillStyle = "#ffd44d";
    ctx.beginPath(); ctx.arc(0, r * 0.18, r * 0.72, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.42, r * 0.42, 0, 7); ctx.fill();
    ctx.fillStyle = "#ff9d3b"; ctx.beginPath(); ctx.moveTo(-r * 0.58, -r * 0.52); ctx.lineTo(-r * 0.95, -r * 0.40); ctx.lineTo(-r * 0.56, -r * 0.28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#20242e"; ctx.beginPath(); ctx.arc(-r * 0.30, -r * 0.50, r * 0.075, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(200,150,30,0.55)"; ctx.beginPath(); ctx.ellipse(r * 0.16, r * 0.22, r * 0.32, r * 0.20, -0.4, 0, 7); ctx.fill();
    ctx.restore();
  }
  // ---- element bead painters (world space); c<0 = colourless element ----
  function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255), g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255), b = clamp(Math.round((n & 255) * f), 0, 255); return "rgb(" + r + "," + g + "," + b + ")"; }
  function drawStone(x, y, r) {   // T2: grey speckled dead weight, no colour
    const g = ctx.createRadialGradient(x - r * 0.32, y - r * 0.36, r * 0.2, x, y, r);
    g.addColorStop(0, "#9b9488"); g.addColorStop(0.62, "#6d685c"); g.addColorStop(1, "#494538");
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = "rgba(38,34,26,0.5)";
    for (const [dx, dy, rr] of [[-.3, .12, .12], [.26, -.16, .09], [.06, .36, .1], [.36, .27, .07]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, 7); ctx.fill(); }
    ctx.strokeStyle = "rgba(28,25,20,0.55)"; ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.08); ctx.lineTo(x - r * 0.05, y + r * 0.06); ctx.lineTo(x + r * 0.22, y - r * 0.26); ctx.stroke();
    ctx.strokeStyle = "rgba(18,16,12,0.4)"; ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.arc(x, y, r * 0.93, 0, 7); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.13)"; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.38, r * 0.3, r * 0.17, -0.5, 0, 7); ctx.fill();
  }
  function drawShell(x, y, r, c) {   // T3: coloured bead behind wooden crate slats
    // Qi 2026-07-19: the crate's COLOUR must read at a glance (it's the whole rule —
    // "pop this colour beside it"). Full-strength bead, NO dark wash, THIN + TRANSLUCENT
    // wooden slats (colour tints through) crossed in an X, and a bold BRIGHT-colour rim
    // as the unmistakable colour cue. (Qi preferred these wooden bars over steel ones.)
    // Qi 2026-07-19: the ball must look IDENTICAL to its neighbours — ANY translucent
    // layer tints it (alpha compositing; 50% wood still pulled red→brown, measured).
    // Jail-bar look, made to work: the exact plain bead, then vertical wooden bars that
    // are FULLY OPAQUE — no alpha, no blending — so every strip of ball showing between
    // the bars is 100% the bead's own colour. Wood (not steel) per Qi's earlier call.
    drawBall(x, y, r, c);
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 0.98, 0, 7); ctx.clip();
    // the classic crossed-X planks (the shape Qi picked), kept FULLY OPAQUE
    const plank = a => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      const g = ctx.createLinearGradient(0, -r * 0.16, 0, r * 0.16);
      g.addColorStop(0, "#c58f42"); g.addColorStop(0.5, "#9e702f"); g.addColorStop(1, "#6f4e1f");
      ctx.fillStyle = g; ctx.fillRect(-r * 1.25, -r * 0.16, r * 2.5, r * 0.32);
      ctx.strokeStyle = "#4a3010"; ctx.lineWidth = r * 0.03; ctx.strokeRect(-r * 1.25, -r * 0.16, r * 2.5, r * 0.32);
      ctx.restore();
    };
    plank(-0.7); plank(0.7); ctx.restore();
    // brass bolt heads at the plank ends
    ctx.fillStyle = "#eccf92";
    for (const [dx, dy] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, r * 0.07, 0, 7); ctx.fill(); }
  }
  function drawBalloon(x, y, r, i) {   // T4: glossy translucent + knot + string
    ctx.strokeStyle = "rgba(255,255,255,0.34)"; ctx.lineWidth = Math.max(1, r * 0.05); ctx.beginPath(); ctx.moveTo(x, y + r * 0.92); ctx.quadraticCurveTo(x + r * 0.32 * Math.sin(simT * 2 + i), y + r * 1.45, x + r * 0.05, y + r * 1.95); ctx.stroke();
    const g = ctx.createRadialGradient(x - r * 0.34, y - r * 0.4, r * 0.14, x, y, r * 1.02);
    g.addColorStop(0, "rgba(255,152,182,0.95)"); g.addColorStop(0.68, "rgba(233,92,132,0.74)"); g.addColorStop(1, "rgba(188,58,110,0.64)");
    ctx.beginPath(); ctx.arc(x, y, r * 0.98, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = "rgba(200,70,112,0.92)"; ctx.beginPath(); ctx.moveTo(x - r * 0.16, y + r * 0.9); ctx.lineTo(x + r * 0.16, y + r * 0.9); ctx.lineTo(x, y + r * 1.16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.82)"; ctx.beginPath(); ctx.ellipse(x - r * 0.34, y - r * 0.35, r * 0.19, r * 0.3, -0.5, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.32)"; ctx.beginPath(); ctx.arc(x + r * 0.28, y + r * 0.24, r * 0.1, 0, 7); ctx.fill();
  }
  function drawIce(x, y, r, c) {   // T5: frosty faceted, colour still reads
    const P = PALETTE[c];
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = P.b; ctx.fill();
    ctx.globalAlpha = 0.42; ctx.fillStyle = "#e2f3ff"; circle(x, y, r); ctx.globalAlpha = 1;
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 0.98, 0, 7); ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = r * 0.05;
    ctx.beginPath(); ctx.moveTo(x - r, y - r * 0.2); ctx.lineTo(x + r * 0.3, y + r); ctx.moveTo(x - r * 0.2, y - r); ctx.lineTo(x + r * 0.62, y + r * 0.4); ctx.moveTo(x + r * 0.1, y - r * 0.5); ctx.lineTo(x + r, y + r * 0.1); ctx.stroke(); ctx.restore();
    ctx.fillStyle = P.d; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = r * 0.09; ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, 7); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(x - r * 0.34, y - r * 0.4, r * 0.13, 0, 7); ctx.fill();
  }
  function drawTar(x, y, r, c) {   // T6: oily black, colour hint at the rim, drip
    const P = PALETTE[c];
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.34, r * 0.14, x, y, r);
    g.addColorStop(0, shade(P.b, 0.55)); g.addColorStop(0.7, shade(P.d, 0.5)); g.addColorStop(1, "#0d0a08");
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = "#0d0a08"; ctx.beginPath(); ctx.moveTo(x - r * 0.2, y + r * 0.68); ctx.quadraticCurveTo(x, y + r * 1.32, x + r * 0.2, y + r * 0.68); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.05, y + r * 1.18, r * 0.11, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.ellipse(x - r * 0.28, y - r * 0.32, r * 0.11, r * 0.27, -0.6, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(180,220,255,0.22)"; ctx.beginPath(); ctx.arc(x + r * 0.3, y + r * 0.14, r * 0.13, 0, 7); ctx.fill();
    ctx.strokeStyle = P.b; ctx.globalAlpha = 0.5; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  }
  function drawBomb(x, y, r, c, i) {   // T7: dark casing, colour band, danger ring, lit fuse
    const P = PALETTE[c];
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.34, r * 0.14, x, y, r);
    g.addColorStop(0, "#4c4652"); g.addColorStop(0.7, "#26232c"); g.addColorStop(1, "#141117");
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = P.b; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.arc(x, y, r * 0.58, 0, 7); ctx.stroke();
    const pu = 0.5 + 0.5 * Math.sin(simT * 6 + i);
    ctx.strokeStyle = "rgba(255,72,60," + (0.45 + 0.4 * pu) + ")"; ctx.lineWidth = r * 0.09; ctx.beginPath(); ctx.arc(x, y, r * 0.82, 0, 7); ctx.stroke();
    ctx.strokeStyle = "#c8a15a"; ctx.lineWidth = r * 0.09; ctx.beginPath(); ctx.moveTo(x, y - r * 0.9); ctx.quadraticCurveTo(x + r * 0.4, y - r * 1.28, x + r * 0.16, y - r * 1.5); ctx.stroke();
    const sp = 0.6 + 0.4 * Math.sin(simT * 22 + i);
    ctx.fillStyle = "#ffd24d"; ctx.beginPath(); ctx.arc(x + r * 0.16, y - r * 1.5, r * 0.13 * sp + r * 0.05, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,120,40,0.85)"; ctx.beginPath(); ctx.arc(x + r * 0.16, y - r * 1.5, r * 0.09 * sp + r * 0.03, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.34)"; ctx.beginPath(); ctx.arc(x - r * 0.34, y - r * 0.4, r * 0.12, 0, 7); ctx.fill();
  }
  function drawBead(x, y, r, b, i) {
    if (b.el === "stone") drawStone(x, y, r);
    else if (b.shelled) drawShell(x, y, r, b.c);
    else if (b.el === "balloon") drawBalloon(x, y, r, i);
    else if (b.el === "ice") drawIce(x, y, r, b.c);
    else if (b.el === "tar") drawTar(x, y, r, b.c);
    else if (b.el === "bomb") drawBomb(x, y, r, b.c, i);
    else drawBall(x, y, r, b.c);
  }
  function drawWorld() {
    const L = world.L;
    // FULL-BLEED: no jar — beads pile against the screen edges. Only the duck
    // bring-down zone gets a subtle cue.
    // duck bring-down zone
    if (world.duck && !world.duckDone) {
      const zy = L.vFloor - L.wallHalf - L.ballR * 2.3;
      ctx.fillStyle = "rgba(255,182,72,0.06)"; ctx.fillRect(L.vx0 + L.wallHalf, zy, L.innerW, L.vFloor - L.wallHalf - zy);
      ctx.save(); ctx.setLineDash([6, 7]); ctx.strokeStyle = "rgba(255,182,72,0.35)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L.vx0 + L.wallHalf + 3, zy); ctx.lineTo(L.vx1 - L.wallHalf - 3, zy); ctx.stroke(); ctx.restore();
    }
    // when crates are ALL that's left, spotlight each remaining one — a camouflaged
    // (dark bead + planks) or edge-clipped crate is genuinely unfindable, and Qi hit
    // exactly that on L27 (chip said 2, both crates invisible-in-plain-sight). The
    // ring protrudes past the bead so even a wall-hugging clipped crate shows an arc.
    const shellsLeftOnly = world.objectives.some(o => o.kind === "shells" && o.rem > 0) &&
      world.objectives.every(o => o.kind === "shells" || o.rem <= 0 || (o.kind === "duck" && world.duckDone));
    // beads
    for (let i = 0; i < world.balls.length; i++) {
      const b = world.balls[i]; if (!b.alive || b.duck) continue;
      let x = b.x; if (wob[i] > 0) x += Math.sin(simT * 40) * wob[i] * b.r * 0.14;
      drawBead(x, b.y, b.r, b, i);
      if (b.popG && world.settled) { ctx.globalAlpha = 0.20 + 0.14 * Math.sin(simT * 3 + (b.x + b.y) * 0.02); ctx.beginPath(); ctx.arc(x, b.y, b.r * 1.04, 0, 7); ctx.lineWidth = 1.5; ctx.strokeStyle = "#ffffff"; ctx.stroke(); ctx.globalAlpha = 1; }
    }
    // crate spotlight — drawn AFTER the whole bead pass so neighbouring beads can't
    // occlude the ring (inside the loop it was painted over and read as no cue at all)
    if (shellsLeftOnly) {
      const p = 0.5 + 0.5 * Math.sin(simT * 4);
      for (const b of world.balls) {
        if (!b.alive || !b.shelled) continue;
        // ring = the crate's OWN colour (Qi 2026-07-19: "pop this colour beside it").
        // Once that colour is gone from the board, mercy lets ANY pop crack it, so a
        // coloured ring would lie — fall back to neutral gold to signal "any pop now".
        const live = world.balls.some(o => o.alive && !o.shelled && o.c === b.c);
        const ring = live ? PALETTE[b.c].b : "#ffce6b";
        ctx.globalAlpha = 0.6 + 0.35 * p;
        ctx.strokeStyle = ring; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1.14 + 0.10 * p), 0, 7); ctx.stroke();
        ctx.globalAlpha = 0.25 + 0.18 * p;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1.40 + 0.18 * p), 0, 7); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    if (world.duck && world.duck.alive) drawDuck(world.duck.x, world.duck.y, world.duck.r, wob.duck || 0);
    // fx
    for (const g of rings) { const q = clamp(g.t / g.life, 0, 1), e = q * (2 - q); ctx.globalAlpha = (1 - q) * 0.85; ctx.strokeStyle = g.color; ctx.lineWidth = Math.max(1.5, L.ballR * 0.2 * (1 - q) + 1); ctx.beginPath(); ctx.arc(g.x, g.y, g.r0 + (g.r1 - g.r0) * e, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
    for (const p of parts) { ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2); ctx.restore(); }
    ctx.globalAlpha = 1;
  }
  // HUD (screen space, in the safe area): LEVEL + big TAPS readout · chips
  function drawHUD() {
    const top = INSET.top + 12;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    // labeled beats keep a persistent tinted tag next to the level number
    const tier = world.spec.hard ? HARD_TIERS[world.spec.hard] : null;
    ctx.font = "800 13px " + F; ctx.fillStyle = tier ? tier.c : "rgba(179,163,196,0.9)";
    ctx.fillText("LEVEL " + level + (tier ? " · " + tier.label : ""), 16, top + 11);
    ctx.font = "44px 'Lilita One', " + F; ctx.fillStyle = world.taps <= 2 ? "#ffb648" : "#f3ecfa";
    ctx.fillText(String(world.taps), 15, top + 50);
    const tw = ctx.measureText(String(world.taps)).width;
    ctx.font = "800 12px " + F; ctx.fillStyle = "rgba(179,163,196,0.8)";
    ctx.fillText("TAPS", 15 + tw + 7, top + 50);
    // chips (right-aligned): bead icon + count
    const ch = 30, fs = 17;
    ctx.font = "800 " + fs + "px " + F;
    const items = world.objectives.map(o => { const done = o.rem <= 0; const txt = done ? "✓" : (o.kind === "duck" ? "↓" : String(o.rem)); return { o, txt, done, w: ch * 1.05 + ctx.measureText(txt).width + ch * 0.5 }; });
    let x = W - 14 - items.reduce((a, i) => a + i.w + 6, 0) + 6, y = top + 2;
    for (const it of items) {
      rrect(x, y, it.w, ch, ch / 2); ctx.fillStyle = "rgba(28,19,48,0.92)"; ctx.fill();
      ctx.strokeStyle = it.done ? "rgba(75,212,138,0.85)" : "rgba(120,105,160,0.4)"; ctx.lineWidth = 1.2; ctx.stroke();
      const ir = ch * 0.31, ix = x + ch * 0.56, iy = y + ch / 2;
      if (it.o.kind === "pop") drawBallScreen(ix, iy, ir, it.o.color);
      else if (it.o.kind === "shells") drawShellIcon(ix, iy, ir);
      else if (it.o.kind === "balloons") drawBalloonIcon(ix, iy, ir);
      else drawDuck(ix, iy, ir * 1.1, 0);
      ctx.fillStyle = it.done ? "#4bd48a" : "#e9eefb"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "800 " + fs + "px " + F;
      ctx.fillText(it.txt, x + ch * 1.06, y + ch / 2 + 0.5); ctx.textBaseline = "alphabetic";
      x += it.w + 6;
    }
  }
  // bead drawn at native (unscaled) screen size for the chips — glyph per colour MUST
  // match the on-board drawGlyph (0 dot · 1 triangle · 2 square · 3 diamond · 4 ring) so
  // the objective chip looks like the pile it points at (colour 3 = diamond, not triangle).
  function drawBallScreen(x, y, r, c) {
    const P = PALETTE[c];
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = P.b; ctx.fill();
    ctx.fillStyle = P.d; ctx.strokeStyle = P.d;
    if (c === 0) { ctx.beginPath(); ctx.arc(x, y, r * 0.34, 0, 7); ctx.fill(); }
    else if (c === 1) { ctx.beginPath(); ctx.moveTo(x, y - r * 0.42); ctx.lineTo(x + r * 0.38, y + r * 0.28); ctx.lineTo(x - r * 0.38, y + r * 0.28); ctx.closePath(); ctx.fill(); }
    else if (c === 2) { ctx.fillRect(x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.6); }
    else if (c === 3) { ctx.beginPath(); ctx.moveTo(x, y - r * 0.42); ctx.lineTo(x + r * 0.38, y); ctx.lineTo(x, y + r * 0.42); ctx.lineTo(x - r * 0.38, y); ctx.closePath(); ctx.fill(); }
    else { ctx.lineWidth = r * 0.20; ctx.beginPath(); ctx.arc(x, y, r * 0.30, 0, 7); ctx.stroke(); }
  }
  function drawShellIcon(x, y, r) { ctx.fillStyle = "#976a2b"; rrect(x - r, y - r, r * 2, r * 2, r * 0.4); ctx.fill(); ctx.strokeStyle = "#5c3a16"; ctx.lineWidth = r * 0.22; ctx.beginPath(); ctx.moveTo(x - r * 0.8, y - r * 0.8); ctx.lineTo(x + r * 0.8, y + r * 0.8); ctx.moveTo(x + r * 0.8, y - r * 0.8); ctx.lineTo(x - r * 0.8, y + r * 0.8); ctx.stroke(); }
  function drawBalloonIcon(x, y, r) { const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.12, x, y, r); g.addColorStop(0, "#ff9ab6"); g.addColorStop(1, "#d6467e"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - r * 0.08, r * 0.88, 0, 7); ctx.fill(); ctx.fillStyle = "#d6467e"; ctx.beginPath(); ctx.moveTo(x - r * 0.16, y + r * 0.7); ctx.lineTo(x + r * 0.16, y + r * 0.7); ctx.lineTo(x, y + r * 0.95); ctx.closePath(); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.34, r * 0.16, 0, 7); ctx.fill(); }
  // labeled hard tiers (flow research: TELEGRAPH the spikes — a hard level the
  // player sees coming reads as challenge, a blindside one as ambush)
  const HARD_TIERS = {
    hard:    { label: "HARD",           c: "#ffb648" },
    super:   { label: "SUPER HARD",     c: "#ff5a3c" },
    extreme: { label: "EXTREMELY HARD", c: "#c86bff" },
  };
  function drawBanner() {
    const tier = world && world.spec.hard ? HARD_TIERS[world.spec.hard] : null;
    const life = tier ? 1.9 : 1.2;                 // labeled beats linger a beat longer
    if (bannerT >= life) return;
    const a = bannerT < 0.15 ? bannerT / 0.15 : bannerT > life - 0.4 ? Math.max(0, (life - bannerT) / 0.4) : 1;
    const sc = 0.8 + 0.2 * easeOutBack(clamp(bannerT / 0.35, 0, 1));
    ctx.save(); ctx.globalAlpha = a * 0.95; ctx.translate(W / 2, H * 0.32); ctx.scale(sc, sc);
    ctx.font = "900 " + Math.max(20, Math.min(W, H) * 0.09).toFixed(1) + "px " + F; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(255,182,72,0.5)"; ctx.shadowBlur = 16; ctx.fillStyle = "#f3ecfa"; ctx.fillText(banner, 0, 0);
    if (tier) {
      if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
      ctx.font = "900 17px " + F; ctx.shadowColor = tier.c; ctx.shadowBlur = 18;
      ctx.fillStyle = tier.c; ctx.fillText(tier.label, 0, 38);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    }
    ctx.restore();
  }
  function render() {
    relayout();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shakeA > 0.05) ctx.translate((Math.random() - 0.5) * shakeA, (Math.random() - 0.5) * shakeA);
    ctx.translate(ox, oy); ctx.scale(s, s);   // world → screen
    drawWorld();
    ctx.restore();
    drawHUD();
    drawBanner();
    if (coach) drawCoach();
  }

  /* ---------------- input ---------------- */
  // DEV-ONLY level jump (Qi: "so I don't have to play all the way through").
  // Gate = Cut's pattern: native #if-DEBUG injects window.__DEV_BUILD (compiled out
  // of Release, so nothing ships to the App Store) OR a plain-http dev origin.
  const DEV_UNLOCK = !!(typeof window !== "undefined" && (window.__DEV_BUILD ||
    (location && location.protocol === "http:" && /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname))));
  function devJump() {
    const raw = window.prompt("DEV — jump to level (1–" + LV.length + "):", String(level));
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 1 && n <= LV.length) {
      const sv = loadSave(); sv.level = n; writeSave(sv);   // persist so relaunch stays here
      build(n);
    }
  }
  canvas.addEventListener("pointerdown", e => {
    e.preventDefault(); initAudio();
    // dev builds: tapping the "LEVEL N" HUD label opens the jump prompt
    if (DEV_UNLOCK && e.clientY < INSET.top + 34 && e.clientX < 190) { devJump(); return; }
    if (coach) { dismissCoach(); return; }               // tap to dismiss the on-board intro
    if (cardUp || world.phase !== "play") return;
    if (!firstTap) { firstTap = true; $("#hint").classList.add("off"); }
    const wx = (e.clientX - ox) / s, wy = (e.clientY - oy) / s;
    const r = E.tap(world, wx, wy);
    if (r.kind === "rattle") rattledThisLevel = true;    // disqualifies the Perfect medal
    if (r.kind === "pop" || r.kind === "rattle" || r.kind === "singleton" || r.kind === "duck") consume();
  });
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  // (no persistent RATTLE button — rattle is a tap on empty space; the 1d card handles the stuck case)

  /* ---------------- resize + loop ---------------- */
  function resize() {
    W = Math.max(200, window.innerWidth || 390); H = Math.max(320, window.innerHeight || 844);
    DPR = clamp(window.devicePixelRatio || 1, 1, 2.5);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    relayout();
  }
  // fit the world BETWEEN the safe insets — called every frame so it picks up the
  // env() values once WKWebView resolves them (a portrait-lock never re-resizes)
  function relayout() {
    readInsets();
    s = W / WREF; ox = 0;                        // fill the width edge-to-edge
    oy = (H - INSET.bottom) - HREF * s;          // world floor → just above the home indicator
  }
  window.addEventListener("resize", resize);
  resize();
  build((loadSave().level) || 1);

  let last = 0, acc = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (!last) { last = t; return; }
    let dt = (t - last) / 1000; last = t; if (dt > 0.05) dt = 0.05; acc += dt; if (acc > 0.1) acc = 0.1;
    while (acc >= FDT) {
      simT += FDT; bannerT += FDT; shakeA = Math.max(0, shakeA - FDT * 14);
      if (coach) coach.t += FDT;
      for (const k in wob) if (wob[k] > 0) wob[k] = Math.max(0, wob[k] - FDT * 3);
      for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += FDT; if (p.t >= p.life) { parts.splice(i, 1); continue; } p.vy += world.L.G * 0.6 * FDT; p.x += p.vx * FDT; p.y += p.vy * FDT; p.rot += p.vr * FDT; }
      for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += FDT; if (rings[i].t >= rings[i].life) rings.splice(i, 1); }
      if (world.phase === "play") { E.step(world); consume(); }
      acc -= FDT;
    }
    render();
  }
  requestAnimationFrame(frame);

  // automation hooks
  window.__r = { state: () => E.state(world), tapWorld: (x, y) => { const r = E.tap(world, x, y); consume(); return r; }, rattle: () => E.doRattle(world), goto: build, world: () => world, clusters: () => E.poppableClusters(world).length };
})();
