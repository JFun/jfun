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

  // player prefs (persisted in the save) — both default ON. Sound gates ALL SFX at the
  // tone() source (the native session forces .playback, so muting the phone won't silence
  // the game — this is the only way to). Haptics drives the native @capacitor/haptics.
  let sfxOn = loadSave().sfx !== false, hapticsOn = loadSave().haptics !== false;
  const HAP = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) || null;
  function vibe(style) { if (!hapticsOn || !HAP) return; try { HAP.impact({ style: style }); } catch (e) {} }

  let W = 390, H = 844, DPR = 1, s = 1, ox = 0, oy = 0;   // screen; s/ox/oy = world→screen
  let world = null, level = 1, simT = 0, firstTap = false, cardUp = false, deadOffered = false, coach = null, rattledThisLevel = false, menuUp = false, ftue = null;
  // real device safe-area insets (notch / home indicator) — read from a CSS probe
  const INSET = { top: 0, bottom: 0 };
  const insetProbe = document.createElement("div");
  insetProbe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
  document.body.appendChild(insetProbe);
  function readInsets() { const c = getComputedStyle(insetProbe); INSET.top = parseFloat(c.paddingTop) || 0; INSET.bottom = parseFloat(c.paddingBottom) || 0; }
  let parts = [], rings = [], banner = "", bannerT = 99, wob = {};
  let comboN = 0, lastPopT = -9;   // chained pops within ~1.5s escalate a rising "combo" ting

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
  // iOS purges the WKWebView canvas backing on background → the pile renders blurry
  // on resume unless the canvas is re-asserted. resize() re-allocates it at full DPR.
  function onResume() { wakeAudio(); if (typeof resize === "function") resize(); }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") onResume(); });
  window.addEventListener("pageshow", onResume);
  function tone(type, f0, f1, dur, vol, when) {
    if (!AC || !sfxOn) return;
    try { const t0 = AC.currentTime + (when || 0); const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(Math.max(1, f0), t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.03); } catch (e) {}
  }
  function sClack(v) { if (!AC) return; if (simT - clackT > 0.07) { clackT = simT; clackN = 0; } if (clackN >= 5) return; clackN++; const f = 480 + Math.random() * 320; tone("triangle", f, f * 0.6, 0.045, Math.min(0.28, v * 0.5)); }
  // a merge/pop: bigger clusters ring higher + brighter; combo adds a rising ting on chained pops
  function sPop(size, combo) {
    const q = Math.min(size, 16);
    tone("square", 118 + q * 8, 60, 0.15, 0.30);                       // body
    tone("triangle", 520 + q * 42, 1000 + q * 70, 0.13, 0.20, 0.015);  // bright rise (bigger merge = higher)
    tone("sine", 300 + q * 22, 640 + q * 34, 0.10, 0.13, 0.03);        // sparkle tail
    if (q >= 5) tone("sine", 74, 40, 0.24, 0.26, 0.01);               // bass thump for big merges
    if (combo > 0) { const f = 660 * Math.pow(1.08, Math.min(combo, 10)); tone("triangle", f, f, 0.14, 0.16, 0.02); }   // combo ting climbs a step per chained pop
  }
  function sRattle() { for (let i = 0; i < 5; i++) tone("triangle", 300 + Math.random() * 500, 200, 0.05, 0.12, i * 0.02); }
  function sTap() { tone("triangle", 340, 250, 0.04, 0.12); tone("sine", 900, 700, 0.03, 0.05); }   // soft tick for a no-op tap (was a dull thud)
  function sQuack() { tone("triangle", 720, 1080, 0.06, 0.17); tone("triangle", 1080, 640, 0.10, 0.15, 0.055); tone("sine", 360, 300, 0.09, 0.07, 0.01); }   // cute rubber-duck squeak (up→down), not a buzz
  function sChime() { [784, 988, 1319].forEach((f, i) => tone("triangle", f, f, 0.16, 0.22, i * 0.065)); tone("sine", 392, 392, 0.28, 0.12, 0.02); }   // uplifting rising arpeggio (G–B–E) + soft root
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
    simT = 0; firstTap = false; cardUp = false; deadOffered = false; coach = null; ftue = null; rattledThisLevel = false;
    parts = []; rings = []; wob = {};
    banner = "LEVEL " + level; bannerT = 0;
    $("#hint").textContent = world.spec.hint; $("#hint").classList.remove("off");
    $("#ov").classList.remove("show");
    const sv = loadSave();
    sv.level = level; writeSave(sv);
    // element debut: on-board coach-mark the first time this element appears
    const intro = world.spec.intro;
    if (intro && !(sv.seen && sv.seen[intro])) startCoach(intro);
    if (level === 1 && !sv.tutorialDone && !coach) startFtue();   // first-run tutorial (design 2a–2c)
  }
  const rebuild = () => build(level);   // retry/restart
  function consume() {
    for (const e of world.events) {
      if (e.type === "clack") sClack(e.v);
      else if (e.type === "pop") { const P = PALETTE[e.color]; const combo = (simT - lastPopT < 1.5) ? comboN + 1 : 0; comboN = combo; lastPopT = simT; sPop(e.size, combo); vibe("LIGHT"); burst(e.x, e.y, P.b, 6 + e.size, HREF * 0.35); ringFx(e.x, e.y, world.L.ballR, world.L.ballR * (2 + e.size * 0.5), P.b, 0.42); }
      else if (e.type === "rattle") { sRattle(); vibe("HEAVY"); }
      else if (e.type === "wobble") { wob[e.i] = 1; sTap(); }
      else if (e.type === "crack") { sCrack(); vibe("LIGHT"); burst(e.x, e.y, "#a9762e", 10, HREF * 0.3); ringFx(e.x, e.y, world.L.ballR, world.L.ballR * 2, "#d3a35a", 0.4); }
      else if (e.type === "balloonpop") { sBalloonPop(); vibe("LIGHT"); burst(e.x, e.y, "#e95c84", 12, HREF * 0.4); ringFx(e.x, e.y, world.L.ballR, world.L.ballR * 2.4, "#ff9ab6", 0.4); }
      else if (e.type === "bomb") { sBoom(); vibe("HEAVY"); burst(e.x, e.y, "#ff8a3c", 22, HREF * 0.55); ringFx(e.x, e.y, world.L.ballR, world.L.ballR * 5, "#ff5a2a", 0.5); ringFx(e.x, e.y, world.L.ballR, world.L.ballR * 3.5, "#ffd24d", 0.4); }
      else if (e.type === "quack") sQuack();
      else if (e.type === "duck") { sChime(); vibe("MEDIUM"); ringFx(e.x, e.y, world.L.ballR, world.L.ballR * 2.6, "#ffd44d", 0.6); burst(e.x, e.y, "#ffd44d", 14, HREF * 0.4); }
      else if (e.type === "win") { sWin(); vibe("HEAVY"); confetti(); setTimeout(() => showCleared(e.spare), 620); }
      else if (e.type === "lose") { if (!cardUp) { vibe("MEDIUM"); showLose(); } }
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
    const last = level >= LV.length;
    if (last) { const sv2 = loadSave(); sv2.completed = 1; writeSave(sv2); }   // campaign milestone
    const sub = perfect
      ? '<span style="color:#ffce6b">★ PERFECT</span>'
      : (spare + (spare === 1 ? ' tap spare' : ' taps spare'));
    if (last) {
      // FINALE — every jar in the pantry emptied. Extra confetti + a campaign badge,
      // so L106 celebrates instead of silently looping "REPLAY" forever.
      setTimeout(confetti, 160); setTimeout(confetti, 520);
      $("#card").innerHTML =
        '<div class="glow"></div>' +
        '<div class="eyebrow" style="color:#4bd48a">CAMPAIGN COMPLETE</div>' +
        starsArc(stars) +
        '<h2>ALL ' + LV.length + ' CLEARED!</h2>' +
        '<div class="sub">You emptied every jar in the pantry.</div>' +
        '<div class="btns">' +
          '<button class="primary" id="againB">▸ PLAY FROM LEVEL 1</button>' +
          '<button class="ghost" id="replayB" style="flex:none;width:100%"><span>' + refreshIcon + 'Replay this level</span></button>' +
        '</div>';
      $("#ov").classList.add("show");
      $("#againB").onclick = () => build(1);
      $("#replayB").onclick = () => build(level);
      return;
    }
    $("#card").innerHTML =
      '<div class="glow"></div>' +
      starsArc(stars) +
      '<h2>CLEARED!</h2>' +
      '<div class="sub">' + sub + '</div>' +
      '<div class="btns">' +
        '<button class="primary" id="nextB">NEXT ▸</button>' +
        '<div class="row">' +
          '<button class="ghost" id="replayB"><span>' + refreshIcon + 'Replay</span></button>' +
          '<button class="ghost" id="mapB">Level map</button>' +
        '</div>' +
      '</div>';
    $("#ov").classList.add("show");
    $("#nextB").onclick = () => build(level + 1);
    $("#replayB").onclick = () => build(level);
    $("#mapB").onclick = () => { cardUp = false; $("#ov").classList.remove("show"); showScreen("levelpath"); };
  }

  /* -------- settings / pause overlay (the gear) --------
     Opened mid-play; pauses the sim, blocks board taps. Sound gate is the only way to
     silence the game (native session forces .playback). All prefs persist in the save. */
  /* ── SCREEN ROUTER (design v2): home / play / settings; pause is a card ── */
  let screen = "home", prevScreen = "home", homePile = null;
  const CHAPTER = n => Math.ceil(n / 10);
  const gearIcon = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><g fill="currentColor"><rect x="10.6" y="1.6" width="2.8" height="4.6" rx="1.4"/><rect x="10.6" y="1.6" width="2.8" height="4.6" rx="1.4" transform="rotate(45 12 12)"/><rect x="10.6" y="1.6" width="2.8" height="4.6" rx="1.4" transform="rotate(90 12 12)"/><rect x="10.6" y="1.6" width="2.8" height="4.6" rx="1.4" transform="rotate(135 12 12)"/><rect x="10.6" y="1.6" width="2.8" height="4.6" rx="1.4" transform="rotate(180 12 12)"/><rect x="10.6" y="1.6" width="2.8" height="4.6" rx="1.4" transform="rotate(225 12 12)"/><rect x="10.6" y="1.6" width="2.8" height="4.6" rx="1.4" transform="rotate(270 12 12)"/><rect x="10.6" y="1.6" width="2.8" height="4.6" rx="1.4" transform="rotate(315 12 12)"/></g><circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="2.6"/></svg>';
  const homeIcon = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/></svg>';
  function showScreen(name) {
    if (screen !== "settings") prevScreen = screen;    // so Back returns whence we came
    screen = name;
    $("#home").classList.toggle("show", name === "home");
    $("#settings").classList.toggle("show", name === "settings");
    $("#levelpath").classList.toggle("show", name === "levelpath");
    $("#gear").classList.toggle("hide", name !== "play");
    if (name !== "play") $("#hint").classList.add("off");
    if (name === "home") { if (!homePile) buildHome(); updateHomeChrome(); }
    if (name === "settings") renderSettingsScreen();
    if (name === "levelpath") renderLevelPath();
  }
  function updateHomeChrome() {
    const sv = loadSave(), lv = sv.level || 1;
    $("#homeSub").textContent = "LEVEL " + lv + " · CHAPTER " + CHAPTER(lv);
  }
  // a SHORT decorative pile of DESIGN-SIZED beads. The engine sizes beads by area over
  // a fixed half-screen region (ballR ∝ 1/√count), so it can't make a short small-bead
  // pile — build our own hex-packed pile at a fixed small radius (design 1f).
  let hseed = 0; const hrng = () => { hseed = (hseed * 1664525 + 1013904223) >>> 0; return hseed / 4294967296; };
  const HR = WREF / 18;   // ~21.7 world units → ~43px bead, matching the design
  function buildHome() {
    hseed = 20250719 >>> 0; homePile = [];
    const R = HR, rowH = R * 1.72, floorY = HREF - R - 2, rows = 4;
    for (let row = 0; row < rows; row++) {
      const y = floorY - row * rowH, stag = (row % 2) ? R : 0;
      for (let x = R + stag; x <= WREF - R; x += R * 2 + (hrng() - 0.5) * R * 0.12) {
        if (row === rows - 1 && hrng() < 0.42) continue;   // thin the crown → natural top
        homePile.push({ x: x + (hrng() - 0.5) * R * 0.2, y: y + (hrng() - 0.5) * R * 0.16, r: R, c: (hrng() * 5) | 0, alive: true });
      }
    }
  }
  // duck on an arbitrary 2d context (settings footer) — mirrors drawDuck, no wobble
  function duckOnCtx(g, x, y, r) {
    g.save(); g.translate(x, y); g.fillStyle = "#ffd44d";
    g.beginPath(); g.arc(0, r * 0.18, r * 0.72, 0, 7); g.fill();
    g.beginPath(); g.arc(-r * 0.22, -r * 0.42, r * 0.42, 0, 7); g.fill();
    g.fillStyle = "#ff9d3b"; g.beginPath(); g.moveTo(-r * 0.58, -r * 0.52); g.lineTo(-r * 0.95, -r * 0.40); g.lineTo(-r * 0.56, -r * 0.28); g.closePath(); g.fill();
    g.fillStyle = "#20242e"; g.beginPath(); g.arc(-r * 0.30, -r * 0.50, r * 0.075, 0, 7); g.fill(); g.restore();
  }
  // pause card (play gear → here; design 1m). menuUp pauses the sim.
  // The in-game gear opens ONE combined card (design 1m): SETTINGS + quick toggles
  // inline, then RESUME / Restart / Level map / Home. No nested "Settings" button —
  // the card IS the settings, so gear → settings reads straight (Qi: "settings inside settings").
  function pauseTog(id, label, on) {
    const knob = on
      ? '<span style="position:relative;width:46px;height:28px;border-radius:999px;background:linear-gradient(180deg,#ffce6b,#ff9d3b);box-shadow:inset 0 1px 2px rgba(0,0,0,.25)"><span style="position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.35)"></span></span>'
      : '<span style="position:relative;width:46px;height:28px;border-radius:999px;background:#1b1228;border:1.5px solid #3d2f52;box-sizing:border-box"><span style="position:absolute;top:2px;left:3px;width:21px;height:21px;border-radius:50%;background:#8b7c98"></span></span>';
    return '<button id="' + id + '" style="display:flex;align-items:center;justify-content:space-between;background:#140c22;border:1px solid #3a2e4c;border-radius:16px;padding:12px 14px;width:100%;box-sizing:border-box;cursor:pointer">' +
      '<span style="font:800 13.5px Nunito,sans-serif;color:#d9cbe8">' + label + '</span>' + knob + '</button>';
  }
  function openPause() {
    if (cardUp || menuUp || coach || screen !== "play") return;
    menuUp = true;
    const render = () => {
      $("#card").innerHTML =
        '<h2 style="font-size:28px">SETTINGS</h2>' +
        '<div style="font:800 10.5px Nunito;letter-spacing:.2em;color:#8b7c98;margin:5px 0 14px">GAME PAUSED · LEVEL ' + level + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">' +
          pauseTog("pSound", "Sound", sfxOn) + pauseTog("pHaptics", "Haptics", hapticsOn) +
        '</div>' +
        '<div class="btns">' +
          '<button class="primary" id="resumeB">RESUME&nbsp;&nbsp;▸</button>' +
          '<div class="row">' +
            '<button class="ghost" id="restartB"><span>' + refreshIcon + 'Restart</span></button>' +
            '<button class="ghost" id="mapB">Level map</button>' +
          '</div>' +
          '<button class="ghost" id="homeB"><span>' + homeIcon + 'Home</span></button>' +
        '</div>';
      $("#resumeB").onclick = closePause;
      $("#restartB").onclick = () => { closePause(); rebuild(); };
      $("#mapB").onclick = () => { closePause(); showScreen("levelpath"); };
      $("#homeB").onclick = () => { closePause(); showScreen("home"); };
      $("#pSound").onclick = () => { sfxOn = !sfxOn; persist("sfx", sfxOn); if (sfxOn) { initAudio(); sChime(); } render(); };
      $("#pHaptics").onclick = () => { hapticsOn = !hapticsOn; persist("haptics", hapticsOn); if (hapticsOn) vibe("MEDIUM"); render(); };
    };
    render();
    $("#ov").classList.add("show");
  }
  function closePause() { menuUp = false; $("#ov").classList.remove("show"); }
  // full settings screen (design 1p)
  function renderSettingsScreen() {
    $("#setSound").classList.toggle("on", sfxOn);
    $("#setHaptics").classList.toggle("on", hapticsOn);
    const dc = $("#setDuck"); if (dc) { const g = dc.getContext("2d"); g.clearRect(0, 0, dc.width, dc.height); duckOnCtx(g, dc.width / 2, dc.height / 2 + 4, 22); }
  }
  const persist = (k, v) => { const sv = loadSave(); sv[k] = v; writeSave(sv); };
  function openURL(u) { try { window.open(u, "_system") || window.open(u, "_blank"); } catch (e) { try { location.href = u; } catch (e2) {} } }
  function flashRow(id, msg) { const sm = $(id).querySelector("small"); if (sm) { const o = sm.textContent; sm.textContent = "✓ " + msg; setTimeout(() => { sm.textContent = o; }, 1400); } }
  function comingSoon(name) {
    $("#card").innerHTML = '<div class="eyebrow" style="color:var(--honey)">' + name + '</div><h2>Coming soon</h2>' +
      '<div class="msg" style="margin-top:10px">This is on the way — look for it after launch.</div>' +
      '<div class="btns"><button class="primary" id="csB">◂ BACK</button></div>';
    $("#ov").classList.add("show"); $("#csB").onclick = () => $("#ov").classList.remove("show");
  }
  /* ── VISUAL paged gallery — used by "How to play" + "Replay element intros".
     Renders the REAL bead/element painters (Qi: text-only felt like a test). ── */
  function withCtx(g, fn) { const old = ctx; ctx = g; try { fn(); } finally { ctx = old; } }
  function galDots(i, n) { let s = ""; for (let k = 0; k < n; k++) s += '<span style="width:6px;height:6px;border-radius:50%;background:' + (k === i ? "#ffce6b" : "rgba(150,130,175,.35)") + '"></span>'; return s; }
  function openGallery(title, pages) {
    let i = 0;
    function render() {
      const p = pages[i];
      $("#card").innerHTML =
        '<div class="eyebrow" style="color:var(--honey)">' + title + '</div>' +
        '<canvas class="galcv" width="260" height="200" style="width:160px;height:123px;display:block;margin:2px auto 8px"></canvas>' +
        '<h2 style="font-size:24px">' + p.title + '</h2>' +
        '<div class="msg" style="margin:6px 0 14px">' + p.caption + '</div>' +
        '<div class="btns"><button class="primary" id="galB">' + (i < pages.length - 1 ? "NEXT ▸" : "◂ DONE") + '</button>' +
        '<div style="display:flex;gap:6px;justify-content:center;margin-top:10px">' + galDots(i, pages.length) + '</div></div>';
      const cv = $(".galcv"); p.draw(cv.getContext("2d"), cv.width, cv.height);
      $("#galB").onclick = () => { if (i < pages.length - 1) { i++; render(); } else $("#ov").classList.remove("show"); };
    }
    $("#ov").classList.add("show"); render();
  }
  function drawHowPop(g, w, h) {
    withCtx(g, () => { const R = w * 0.15, cx = w / 2, cy = h * 0.5; drawBallScreen(cx - R, cy + R * 0.5, R, 2); drawBallScreen(cx + R, cy + R * 0.5, R, 2); drawBallScreen(cx, cy - R, R, 2); });
    g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = w * 0.018; g.beginPath(); g.arc(w / 2, h * 0.5 - w * 0.075, w * 0.26, 0, 7); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.9)"; g.beginPath(); g.arc(w / 2, h * 0.5 - w * 0.075, w * 0.045, 0, 7); g.fill();
  }
  function drawHowTumble(g, w, h) {
    withCtx(g, () => { const R = w * 0.11; drawBallScreen(w * 0.32, h * 0.78, R, 1); drawBallScreen(w * 0.5, h * 0.78, R, 3); drawBallScreen(w * 0.68, h * 0.78, R, 0); drawBallScreen(w * 0.41, h * 0.55, R, 2); drawBallScreen(w * 0.59, h * 0.55, R, 1); });
    g.strokeStyle = "rgba(255,206,107,0.85)"; g.lineWidth = w * 0.022; g.lineCap = "round";
    for (const yy of [0.16, 0.28]) { g.beginPath(); g.moveTo(w * 0.5 - w * 0.06, h * yy); g.lineTo(w * 0.5, h * (yy + 0.06)); g.lineTo(w * 0.5 + w * 0.06, h * yy); g.stroke(); }
  }
  function drawHowRattle(g, w, h) {
    withCtx(g, () => { const R = w * 0.12; drawBallScreen(w * 0.4, h * 0.55, R, 2); drawBallScreen(w * 0.6, h * 0.48, R, 1); drawBallScreen(w * 0.5, h * 0.74, R, 3); });
    g.strokeStyle = "rgba(255,206,107,0.9)"; g.lineWidth = w * 0.028; g.lineCap = "round";
    g.beginPath(); g.arc(w / 2, h * 0.58, w * 0.36, Math.PI * 0.78, Math.PI * 1.22); g.stroke();
    g.beginPath(); g.arc(w / 2, h * 0.58, w * 0.36, -Math.PI * 0.22, Math.PI * 0.22); g.stroke();
  }
  function openHowto() {
    openGallery("HOW TO PLAY", [
      { title: "POP", caption: "Tap a group of two or more touching beads of the same colour.", draw: drawHowPop },
      { title: "TUMBLE", caption: "The pile avalanches and re-clusters under gravity, setting up your next move.", draw: drawHowTumble },
      { title: "RATTLE", caption: "Stuck? Tap empty space to rattle the jar — fresh groups (costs one tap).", draw: drawHowRattle },
    ]);
  }
  /* ── element intros: not a mugshot + a sentence, but a little DIAGRAM of the
     rule — the element, a same-colour neighbour cluster, a tap-ring showing
     WHERE to tap, and an outcome glyph (Qi: "make those visual, text is painful"). ── */
  function tapRing(g, cx, cy, r) {
    g.strokeStyle = "rgba(255,255,255,0.92)"; g.lineWidth = Math.max(2, r * 0.13);
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.92)"; g.beginPath(); g.arc(cx, cy, r * 0.17, 0, 7); g.fill();
  }
  function arrow(g, x0, y0, x1, y1, col, lw) {
    g.strokeStyle = col; g.lineWidth = lw; g.lineCap = "round"; g.lineJoin = "round";
    const a = Math.atan2(y1 - y0, x1 - x0), ah = lw * 2.4;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
    g.lineTo(x1 - Math.cos(a - 0.5) * ah, y1 - Math.sin(a - 0.5) * ah);
    g.moveTo(x1, y1); g.lineTo(x1 - Math.cos(a + 0.5) * ah, y1 - Math.sin(a + 0.5) * ah); g.stroke();
  }
  function spark(g, cx, cy, r, col) {
    g.strokeStyle = col; g.lineWidth = 3; g.lineCap = "round";
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
  }
  // shared layout: element on the right, a tappable same-colour pair on the left
  function demoPair(g, w, h, col, drawEl) {
    const R = w * 0.095;
    withCtx(g, () => { drawEl(w * 0.6, h * 0.5); drawBallScreen(w * 0.26, h * 0.42, R, col); drawBallScreen(w * 0.26, h * 0.64, R, col); });
    tapRing(g, w * 0.26, h * 0.53, R * 1.95);
    arrow(g, w * 0.4, h * 0.53, w * 0.46, h * 0.53, "rgba(255,255,255,0.5)", 4);   // "…beside it"
  }
  function demoDuck(g, w, h) {
    g.fillStyle = "rgba(255,206,107,0.42)"; g.fillRect(w * 0.16, h * 0.9, w * 0.68, h * 0.035);   // the floor
    const R = w * 0.1;
    withCtx(g, () => { duckOnCtx(g, w * 0.5, h * 0.26, h * 0.15); drawBallScreen(w * 0.5 - R * 1.02, h * 0.6, R, 2); drawBallScreen(w * 0.5 + R * 1.02, h * 0.6, R, 2); });
    tapRing(g, w * 0.5, h * 0.6, R * 2.0);
    arrow(g, w * 0.83, h * 0.3, w * 0.83, h * 0.82, "rgba(255,255,255,0.5)", 4);   // duck sinks to floor
  }
  function demoStone(g, w, h) {
    demoPair(g, w, h, 2, (x, y) => drawStone(x, y, w * 0.15));
    const cx = w * 0.6, cy = h * 0.5, rr = w * 0.075;                              // ✗ = can't pop
    g.strokeStyle = "#ff5a6a"; g.lineWidth = 6; g.lineCap = "round";
    g.beginPath(); g.moveTo(cx - rr, cy - rr); g.lineTo(cx + rr, cy + rr); g.moveTo(cx + rr, cy - rr); g.lineTo(cx - rr, cy + rr); g.stroke();
  }
  function demoCrate(g, w, h) {
    demoPair(g, w, h, 2, (x, y) => drawShell(x, y, w * 0.15, 2));
    const cx = w * 0.6, cy = h * 0.5;                                              // crack glyph
    g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(cx, cy - w * 0.12); g.lineTo(cx - w * 0.035, cy - w * 0.02); g.lineTo(cx + w * 0.035, cy + w * 0.04); g.lineTo(cx - w * 0.02, cy + w * 0.12); g.stroke();
  }
  function demoBalloon(g, w, h) {
    demoPair(g, w, h, 1, (x, y) => drawBalloon(x, y - h * 0.02, w * 0.13, 0));
    spark(g, w * 0.6, h * 0.44, w * 0.15, "rgba(255,255,255,0.85)");               // burst
  }
  function demoBomb(g, w, h) {
    g.strokeStyle = "rgba(255,146,60,0.7)"; g.lineWidth = 4;                       // blast radius
    g.beginPath(); g.arc(w * 0.6, h * 0.5, w * 0.23, 0, 7); g.stroke();
    demoPair(g, w, h, 3, (x, y) => drawBomb(x, y, w * 0.12, 2, 0));
  }
  function elementGallery() {
    const P = (t, c, d) => ({ title: t, caption: c, draw: d });
    openGallery("ELEMENT INTROS", [
      P("RUBBER DUCK", "Pop below → it sinks to the floor.", demoDuck),
      P("STONE BEAD", "Can't pop — clear around it.", demoStone),
      P("CRATE", "Pop its colour beside → it cracks.", demoCrate),
      P("BALLOON", "Pop beside → it bursts.", demoBalloon),
      P("BOMB", "Pop beside → a big blast.", demoBomb),
    ]);
  }
  function wireChrome() {
    $("#playBtn").onclick = () => { initAudio(); build((loadSave().level) || 1); showScreen("play"); };
    $("#homeGear").onclick = () => showScreen("settings");
    $("#homeSub").onclick = () => showScreen("levelpath");   // tap "LEVEL N · CHAPTER M" → the map
    $("#homeSub").style.cursor = "pointer";
    $("#lpBack").onclick = () => showScreen("home");
    $("#setSound").onclick = () => { sfxOn = !sfxOn; persist("sfx", sfxOn); if (sfxOn) { initAudio(); sChime(); } renderSettingsScreen(); };
    $("#setHaptics").onclick = () => { hapticsOn = !hapticsOn; persist("haptics", hapticsOn); if (hapticsOn) vibe("MEDIUM"); renderSettingsScreen(); };
    $("#setReplay").onclick = () => { const sv = loadSave(); sv.seen = {}; writeSave(sv); elementGallery(); };   // show the visual gallery + re-arm in-game coaches
    $("#setHowto").onclick = openHowto;
    $("#setSupport").onclick = () => openURL("https://rattle-jfun.web.app/support");
    $("#setPrivacy").onclick = () => openURL("https://rattle-jfun.web.app/privacy");
    $("#setBack").onclick = () => showScreen(prevScreen === "settings" ? "home" : prevScreen);
  }
  // decorative home backdrop: the settled pile + a bobbing duck perched on top
  function renderHome() {
    relayout();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
    for (let i = 0; i < homePile.length; i++) { const b = homePile[i]; drawBead(b.x, b.y, b.r, b, i); }
    let topY = 1e9; for (const b of homePile) { if (Math.abs(b.x - WREF / 2) < WREF * 0.26 && b.y < topY) topY = b.y; }
    if (topY > 1e8) topY = HREF - HR * 5;
    const bob = Math.sin(simT * 1.85) * (7 / s);
    drawDuck(WREF / 2, topY - HR * 1.5 + bob, HR * 2.6, 0);
    ctx.restore();
  }

  /* ── LEVEL PATH (map): serpentine of 106 nodes; tap an unlocked one to play it ── */
  function starStr(n) { let s = ""; for (let k = 0; k < 3; k++) s += k < n ? "★" : '<span class="off">★</span>'; return s; }
  function renderLevelPath() {
    const sv = loadSave(), stars = sv.stars || {}, N = LV.length;
    const frontier = Math.min(N, sv.level || 1);
    let cleared = 0, starTotal = 0;
    for (let i = 1; i <= N; i++) { if (stars[i] > 0) cleared++; starTotal += stars[i] || 0; }
    $("#lpChapter").textContent = "CHAPTER " + CHAPTER(frontier);
    $("#lpStarCount").textContent = starTotal;
    $("#lpProgress").textContent = cleared + " CLEARED · " + N + " TOTAL";
    $("#lpBarFill").style.width = Math.round(cleared / N * 100) + "%";
    const W0 = Math.max(320, window.innerWidth || 390);
    const SP = 82, padTop = 150, padBot = 130, amp = Math.min(W0 * 0.30, 118), H0 = N * SP + padTop + padBot;
    const inner = $("#lpInner"); inner.style.height = H0 + "px";
    let html = "";
    for (let i = 1; i <= N; i++) {
      const spec = LV[i - 1], cx = W0 / 2 + Math.sin(i * 0.62) * amp, y = H0 - padBot - (i - 1) * SP;
      const done = (stars[i] || 0) > 0, cur = i === frontier, w = cur ? 66 : 54;
      const cls = cur ? "current" : (done ? "done" : "locked");
      let badge = "";
      if (spec.intro) badge = '<div class="lp-badge newel">NEW ELEMENT</div>';
      else if (spec.hard) badge = '<div class="lp-badge ' + spec.hard + '">' + (spec.hard === "super" ? "SUPER" : spec.hard === "extreme" ? "EXTREME" : "HARD") + '</div>';
      const tb = cur && (spec.hard === "super" || spec.hard === "extreme") ? " " + spec.hard : "";
      const starRow = (done && !cur) ? '<div class="lp-stars">' + starStr(stars[i]) + '</div>' : '';
      const duck = cur ? '<div class="duck"><canvas class="lpduck" width="76" height="76" style="width:38px;height:38px"></canvas></div>' : '';
      html += '<div class="lp-node ' + cls + '" data-lv="' + i + '" style="left:' + Math.round(cx - w / 2) + 'px;top:' + Math.round(y) + 'px">' +
        badge + '<div class="disc' + tb + '">' + (cur ? '<div class="pulse"></div>' : '') + i + '</div>' + starRow + duck + '</div>';
    }
    inner.innerHTML = html;
    const dk = inner.querySelector(".lpduck"); if (dk) duckOnCtx(dk.getContext("2d"), 38, 42, 26);
    inner.querySelectorAll(".lp-node").forEach(n => { const lv = +n.dataset.lv; if (lv <= frontier) n.onclick = () => { initAudio(); build(lv); showScreen("play"); }; });
    const sc = $("#lpScroll"); sc.scrollTop = Math.max(0, H0 - padBot - (frontier - 1) * SP - sc.clientHeight * 0.5);
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
    $("#restB").onclick = () => rebuild();
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
    $("#retryB").onclick = () => rebuild();
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

  /* ── FIRST-RUN TUTORIAL (FTUE, design 2a–2c): 3 steps on the real L1 board,
     each advanced by DOING the action (pop → rattle → LET'S PLAY). Canvas-drawn
     so the board stays LIVE + tappable underneath; SKIP / LET'S PLAY are
     hit-tested in pointerdown. Shows once (sv.tutorialDone). ── */
  const FTUE = [
    { title: "TAP TO POP!", sub: ["Beads of the same colour that touch", "pop together — try this group"] },
    { title: "STUCK? RATTLE!", sub: ["Tap empty space to shake the jar —", "the pile tumbles into new matches"] },
    { title: "EVERY TAP COUNTS", sub: ["Pops and rattles both cost one —", "clear the jar before taps run out"], cta: "LET'S PLAY  ▸" },
  ];
  function startFtue() { ftue = { step: 0, ripT: 0 }; $("#hint").classList.add("off"); }
  function endFtue() { ftue = null; const sv = loadSave(); sv.tutorialDone = 1; writeSave(sv); }
  function advanceFtue() { if (!ftue) return; ftue.step++; ftue.ripT = 0; if (ftue.step > 2) endFtue(); }
  function ftueCard(step) {
    const w = Math.min(330, W - 40), x = (W - w) / 2, h = FTUE[step].cta ? 172 : 106;
    const y = step === 0 ? INSET.top + 92 : step === 1 ? Math.round(H * 0.54) : INSET.top + 118;
    return { x, y, w, h };
  }
  function ftueSkip() { const w = 200, h = 62; return { x: (W - w) / 2, y: H - INSET.bottom - 30 - h, w, h }; }
  function ftuePlay() { const c = ftueCard(2), bw = 190, bh = 46; return { x: c.x + (c.w - bw) / 2, y: c.y + c.h - bh - 15, w: bw, h: bh }; }
  function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function ftueRipple(cx, cy) {
    const t = (ftue.ripT % 1.1) / 1.1;
    ctx.save();
    for (const ph of [0, 0.5]) { const p = (t + ph) % 1; ctx.globalAlpha = (1 - p) * 0.8; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 6 + p * 22, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 7); ctx.fill();
    ctx.restore();
  }
  function ftueArrows(cx, cy, R) {
    ctx.save(); ctx.strokeStyle = "#ffce6b"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const dir of [-1, 1]) {
      const ex = cx + dir * R * 0.42, ey = cy - R * 0.5;               // inner tip near the top of the ring
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.64, dir < 0 ? Math.PI * 1.18 : Math.PI * 1.82, dir < 0 ? Math.PI * 1.5 : Math.PI * 1.5, dir > 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex - dir * 9, ey - 3); ctx.lineTo(ex, ey + 6); ctx.lineTo(ex + dir * 5, ey - 8); ctx.stroke();
    }
    ctx.restore();
  }
  function ftueDots(step, cx, cy) {
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx + (i - 1) * 16, cy, 4.5, 0, 7); ctx.fillStyle = i === step ? "#ffce6b" : "rgba(150,130,175,0.35)"; ctx.fill(); }
  }
  function drawFtue() {
    ctx.save();
    ctx.fillStyle = "rgba(9,5,16,0.72)"; ctx.fillRect(0, 0, W, H);                 // dim the whole board
    const step = ftue.step;
    if (step === 0) {                                                              // spotlight the biggest real cluster
      let best = null; for (const c of E.allClusters(world)) if (c.length >= 2 && (!best || c.length > best.length)) best = c;
      if (best) {
        ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
        for (const b of best) if (b.alive) drawBead(b.x, b.y, b.r, b, world.balls.indexOf(b));   // re-draw bright over the dim
        ctx.restore();
        let cx = 0, cy = 0;
        for (const b of best) { const bx = ox + b.x * s, by = oy + b.y * s; ctx.strokeStyle = "rgba(255,206,107,0.95)"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(bx, by, b.r * s * 1.05, 0, 7); ctx.stroke(); cx += bx; cy += by; }
        ftueRipple(cx / best.length, cy / best.length);
      }
    } else if (step === 1) {                                                       // spotlight empty space + shake arrows
      const cx = W / 2, cy = Math.round(H * 0.30), R = Math.min(W, H) * 0.15;
      const gg = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.2); gg.addColorStop(0, "rgba(255,206,107,0.12)"); gg.addColorStop(1, "rgba(255,206,107,0)");
      ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,206,107,0.7)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
      ftueArrows(cx, cy, R); ftueRipple(cx, cy);
    } else {                                                                       // highlight the HUD taps card
      const top = INSET.top + 14, tcW = 66, tcH = 74, tcX = 12;
      ctx.save(); ctx.shadowColor = "rgba(255,206,107,0.55)"; ctx.shadowBlur = 22; rrect(tcX, top, tcW, tcH, 22); ctx.fillStyle = "rgba(26,16,42,0.98)"; ctx.fill(); ctx.restore();
      ctx.lineWidth = 2.5; ctx.strokeStyle = "#ffce6b"; rrect(tcX, top, tcW, tcH, 22); ctx.stroke();
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.font = "36px 'Lilita One', " + F; ctx.fillStyle = "#f6f0fc"; ctx.fillText(String(world.taps), tcX + tcW / 2, top + 45);
      ctx.font = "800 9.5px " + F; LS(2); ctx.fillStyle = "#8b7c98"; ctx.fillText("TAPS", tcX + tcW / 2 + 1, top + 61); LS(0);
    }
    // instructional card
    const info = FTUE[step], c = ftueCard(step);
    if (step === 2) { ctx.fillStyle = "#2e2340"; const px = c.x + 42; ctx.beginPath(); ctx.moveTo(px - 12, c.y); ctx.lineTo(px + 12, c.y); ctx.lineTo(px, c.y - 13); ctx.closePath(); ctx.fill(); }
    const grd = ctx.createLinearGradient(0, c.y, 0, c.y + c.h); grd.addColorStop(0, "#2e2340"); grd.addColorStop(1, "#1b1228");
    rrect(c.x, c.y, c.w, c.h, 24); ctx.fillStyle = grd; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#4d3c60"; rrect(c.x, c.y, c.w, c.h, 24); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.save(); ctx.shadowColor = "#140c22"; ctx.shadowOffsetY = 3; ctx.fillStyle = "#fff"; ctx.font = "28px 'Lilita One', " + F; ctx.fillText(info.title, c.x + c.w / 2, c.y + 44); ctx.restore();
    ctx.fillStyle = "#ffb648"; ctx.font = "800 14px " + F;
    ctx.fillText(info.sub[0], c.x + c.w / 2, c.y + 70); ctx.fillText(info.sub[1], c.x + c.w / 2, c.y + 90);
    if (info.cta) { const b = ftuePlay(); const bg = ctx.createLinearGradient(0, b.y, 0, b.y + b.h); bg.addColorStop(0, "#ffdf8f"); bg.addColorStop(0.45, "#ffb648"); bg.addColorStop(1, "#ff9d3b"); rrect(b.x, b.y, b.w, b.h, 16); ctx.fillStyle = bg; ctx.fill(); ctx.fillStyle = "#3a1e05"; ctx.font = "900 14px " + F; ctx.fillText(info.cta, b.x + b.w / 2, b.y + b.h / 2 + 5); }
    // footer: SKIP capsule + dots (steps 0/1) or dots only (step 2)
    if (step < 2) {
      const r = ftueSkip(); rrect(r.x, r.y, r.w, r.h, 20); ctx.fillStyle = "rgba(26,15,46,0.9)"; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = "#3d2f52"; rrect(r.x, r.y, r.w, r.h, 20); ctx.stroke();
      ftueDots(step, r.x + r.w / 2, r.y + 22);
      ctx.textAlign = "center"; ctx.fillStyle = "#b3a3c4"; ctx.font = "800 11px " + F; LS(2); ctx.fillText("SKIP TUTORIAL", r.x + r.w / 2, r.y + 46); LS(0);
    } else { ftueDots(step, W / 2, H - INSET.bottom - 40); }
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
  // design v2 "elevated toy-jar" glass tray — bg rgba(26,16,42,.88), 1.5px #4d3c60
  // border, inset top light, soft drop shadow. Ported from design_source 1h.
  function glassTray(x, y, w, h, r) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    rrect(x, y, w, h, r); ctx.fillStyle = "rgba(26,16,42,0.9)"; ctx.fill();
    ctx.restore();
    rrect(x, y, w, h, r); ctx.lineWidth = 1.5; ctx.strokeStyle = "#4d3c60"; ctx.stroke();
    ctx.save(); rrect(x, y, w, h, r); ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.13)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + r * 0.7, y + 1); ctx.lineTo(x + w - r * 0.7, y + 1); ctx.stroke();
    ctx.restore();
  }
  const LS = v => { if ("letterSpacing" in ctx) ctx.letterSpacing = v + "px"; };
  function drawHUD() {
    const top = INSET.top + 14;
    // ── TAPS card (glass tray, left) ──
    const tcW = 66, tcH = 74, tcX = 12;
    glassTray(tcX, top, tcW, tcH, 22);
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.font = "36px 'Lilita One', " + F; ctx.fillStyle = world.taps <= 2 ? "#ffb648" : "#f3ecfa";
    ctx.fillText(String(world.taps), tcX + tcW / 2, top + 45);
    ctx.font = "800 9.5px " + F; LS(2); ctx.fillStyle = "#8b7c98";
    ctx.fillText("TAPS", tcX + tcW / 2 + 1, top + 61); LS(0);
    // ── objective capsule (centered glass pill) ──
    const iconR = 12.5, countF = "21px 'Lilita One', " + F, padIn = 12, gap = 7, capH = 48, capPad = 6, divW = 1.5;
    ctx.font = countF; ctx.textAlign = "left";
    const segs = world.objectives.map(o => {
      const done = o.rem <= 0, txt = done ? "✓" : (o.kind === "duck" ? "↓" : String(o.rem));
      return { o, done, txt, w: padIn + 25 + gap + ctx.measureText(txt).width + padIn };
    });
    const capW = capPad * 2 + segs.reduce((a, s) => a + s.w, 0) + (segs.length - 1) * divW;
    const capX = Math.round(W / 2 - capW / 2);
    glassTray(capX, top, capW, capH, capH / 2);
    let sx = capX + capPad;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], cy = top + capH / 2, cx = sx + padIn + 12.5;
      if (s.o.kind === "pop") drawBallScreen(cx, cy, iconR, s.o.color);
      else if (s.o.kind === "shells") drawShellIcon(cx, cy, iconR);
      else if (s.o.kind === "balloons") drawBalloonIcon(cx, cy, iconR);
      else drawDuck(cx, cy, iconR * 1.15, 0);
      ctx.font = countF; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillStyle = s.done ? "#4bd48a" : (s.o.kind === "duck" ? "#ffce6b" : "#f6f0fc");
      ctx.fillText(s.txt, sx + padIn + 25 + gap, cy + 1); ctx.textBaseline = "alphabetic";
      sx += s.w;
      if (i < segs.length - 1) { ctx.fillStyle = "rgba(120,105,160,0.3)"; ctx.fillRect(sx, top + capH / 2 - 11, divW, 22); sx += divW; }
    }
    // ── level pill (under the capsule) ──
    const tier = world.spec.hard ? HARD_TIERS[world.spec.hard] : null;
    const lvTxt = "LEVEL " + level, pillPad = 11, pg = 6, pillH = 22;
    ctx.font = "800 10px " + F; LS(1.4); const lvW = ctx.measureText(lvTxt).width;
    ctx.font = "900 10px " + F; const tierW = tier ? ctx.measureText(tier.label).width : 0; LS(0);
    const pillW = pillPad * 2 + lvW + (tier ? pg + 4 + pg + tierW : 0);
    const pillX = Math.round(W / 2 - pillW / 2), pillY = top + capH + 6;
    rrect(pillX, pillY, pillW, pillH, pillH / 2); ctx.fillStyle = "rgba(26,16,42,0.78)"; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = "#3d2f52"; ctx.stroke();
    ctx.textBaseline = "middle"; ctx.textAlign = "left"; let px = pillX + pillPad, my = pillY + pillH / 2 + 0.5;
    ctx.font = "800 10px " + F; LS(1.4); ctx.fillStyle = "#b3a3c4"; ctx.fillText(lvTxt, px, my); px += lvW; LS(0);
    if (tier) {
      px += pg; ctx.fillStyle = tier.c; ctx.beginPath(); ctx.arc(px + 2, pillY + pillH / 2, 2, 0, 7); ctx.fill(); px += 4 + pg;
      ctx.font = "900 10px " + F; LS(1.4); ctx.fillStyle = tier.c; ctx.fillText(tier.label, px, my); LS(0);
    }
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
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
    ctx.translate(ox, oy); ctx.scale(s, s);   // world → screen
    drawWorld();
    ctx.restore();
    drawHUD();
    drawBanner();
    if (coach) drawCoach();
    if (ftue) drawFtue();
    // the gear hides whenever an overlay/coach/tutorial owns the screen
    $("#gear").classList.toggle("hide", cardUp || menuUp || !!coach || !!ftue || world.phase !== "play");
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
    if (ftue) {
      if (ftue.step < 2 && inRect(e.clientX, e.clientY, ftueSkip())) { endFtue(); return; }   // SKIP TUTORIAL
      if (ftue.step === 2) { if (inRect(e.clientX, e.clientY, ftuePlay())) endFtue(); return; }  // LET'S PLAY ends it; board taps blocked on the info step
      // steps 0/1: fall through so the real pop/rattle happens, then advance below
    }
    if (coach) { dismissCoach(); return; }               // tap to dismiss the on-board intro
    if (cardUp || menuUp || world.phase !== "play") return;
    if (!firstTap) { firstTap = true; $("#hint").classList.add("off"); }
    const wx = (e.clientX - ox) / s, wy = (e.clientY - oy) / s;
    const r = E.tap(world, wx, wy);
    if (r.kind === "rattle") rattledThisLevel = true;    // disqualifies the Perfect medal
    if (r.kind === "pop" || r.kind === "rattle" || r.kind === "singleton" || r.kind === "duck") consume();
    if (ftue) { if (ftue.step === 0 && r.kind === "pop") advanceFtue(); else if (ftue.step === 1 && r.kind === "rattle") advanceFtue(); }
  });
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  $("#gear").addEventListener("click", () => { initAudio(); openPause(); });
  // (no persistent RATTLE button — rattle is a tap on empty space; the 1d card handles the stuck case)

  /* ---------------- resize + loop ---------------- */
  function resize() {
    W = Math.max(200, window.innerWidth || 390); H = Math.max(320, window.innerHeight || 844);
    DPR = clamp(window.devicePixelRatio || 1, 1, 3);   // was 2.5 — capped BELOW iPhone's native 3× so the canvas rendered at 2.5× and the screen upscaled it → soft/blurry beads+HUD (Qi). 3 = crisp on every iPhone, no-op below.
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
  wireChrome();
  showScreen("home");   // boot into the home screen (PLAY builds + enters play)

  let last = 0, acc = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (!last) { last = t; return; }
    let dt = (t - last) / 1000; last = t; if (dt > 0.05) dt = 0.05; acc += dt; if (acc > 0.1) acc = 0.1;
    while (acc >= FDT) {
      simT += FDT;
      if (screen === "play") {
        bannerT += FDT;
        if (coach) coach.t += FDT;
        if (ftue) ftue.ripT += FDT;
        for (const k in wob) if (wob[k] > 0) wob[k] = Math.max(0, wob[k] - FDT * 3);
        for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += FDT; if (p.t >= p.life) { parts.splice(i, 1); continue; } p.vy += world.L.G * 0.6 * FDT; p.x += p.vx * FDT; p.y += p.vy * FDT; p.rot += p.vr * FDT; }
        for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += FDT; if (rings[i].t >= rings[i].life) rings.splice(i, 1); }
        if (world.phase === "play" && !menuUp) { E.step(world); consume(); }
      }
      acc -= FDT;
    }
    if (screen === "home") renderHome();
    else if (screen === "play") render();
    // settings: opaque DOM covers the canvas — no canvas work
  }
  requestAnimationFrame(frame);

  // automation hooks
  window.__r = { state: () => E.state(world), tapWorld: (x, y) => { const r = E.tap(world, x, y); consume(); return r; }, rattle: () => E.doRattle(world), goto: build, world: () => world, clusters: () => E.poppableClusters(world).length };
})();
