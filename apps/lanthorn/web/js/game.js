/* Lanthorn — UI + flow. One verb: drag a piece from the hand onto the board.
   Screens: title → game / sky; progression is linear (the Play button is the
   level odometer — no level browser, per genre convention). Progress in
   localStorage. Engine is pure (js/engine.js); this file owns DOM, drag,
   juice and the meta sky. */
(function () {
  "use strict";
  const E = globalThis.LanthornEngine;
  const LEVELS = globalThis.LANTHORN_LEVELS;
  const SDK = globalThis.LanthornSDK;
  const N = E.N;
  const $ = (id) => document.getElementById(id);
  // browser: ?debug=1 · iOS: DEBUG builds inject window.__LANTHORN_DEBUG (Release excludes it)
  const DEBUG = location.search.includes("debug=1") || !!window.__LANTHORN_DEBUG;

  // ---------- persistence ----------
  const SAVE_KEY = "lanthorn.v1";
  let store = { won: [], sound: true, bgm: true, haptics: true, tutDone: false };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && Array.isArray(s.won)) store = Object.assign(store, s);
  } catch (e) {}
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(store)); } catch (e) {} }
  const WORLD_SIZE = 20;                       // levels per world (matches planets.js SIZE)
  const worldOf = i => Math.floor(i / WORLD_SIZE);
  // Each world has its OWN night sky — lanterns are counted per planet, not as
  // one global total. skyByWorld: { worldIndex -> lantern count }. Migrate
  // older saves (single store.sky) by re-bucketing per world.
  if (!store.skyByWorld || typeof store.skyByWorld !== "object") {
    store.skyByWorld = {};
    for (let k = 0; k < store.won.length; k++) {
      if (!store.won[k]) continue;
      const w = worldOf(k), lant = k < LEVELS.length ? LEVELS[k].lanterns.length : 4;  // estimate generated
      store.skyByWorld[w] = (store.skyByWorld[w] || 0) + lant;
    }
    delete store.sky;
  }
  function skyOf(w) { return store.skyByWorld[w] || 0; }
  function firstOpen() { let i = 0; while (store.won[i]) i++; return i; }   // unbounded — endless tail
  function curWorld() { return worldOf(firstOpen()); }   // the planet you're currently in
  // levels 1-60 are the curated set; beyond that they're generated on the fly
  // (deterministic per number), so the odometer never hits a wall.
  function levelAt(i) { return i < LEVELS.length ? LEVELS[i] : genLevel(i + 1); }

  // debug-only teleport helpers (used by the dev panel + LD console). Mark
  // every level up to idx as won and keep the sky count honest, so jumping
  // deep behaves as if you'd genuinely arrived there.
  function wonThrough(idx) {
    store.won = []; store.skyByWorld = {}; store.tutDone = true;
    // per-world buckets: curated exact, generated estimated (never generate
    // here — generating hundreds of levels just to total the sky would stall).
    for (let k = 0; k < idx; k++) {
      store.won[k] = true;
      const lant = k < LEVELS.length ? LEVELS[k].lanterns.length : 4;
      const w = worldOf(k);
      store.skyByWorld[w] = (store.skyByWorld[w] || 0) + lant;
    }
  }
  function jumpToLevel(idx) { idx = Math.max(0, idx); wonThrough(idx); save(); startLevel(idx); }
  function jumpToWorld(w) { jumpToLevel(Math.max(0, w) * PLANETS.SIZE); }   // first level of world w (0-based)

  Snd.muted = !store.sound;
  Snd.haptics = store.haptics;

  // ---------- journey / planets ----------
  const PLANETS = globalThis.LANTHORN_PLANETS;
  let prevLevelIdx = null;        // last level entered this session (null on a cold load/relaunch)
  function applyPlanet(p) {                       // reskin the sky, walls & horizon-world
    const r = document.documentElement.style;
    r.setProperty("--night1", p.night1); r.setProperty("--night2", p.night2);
    r.setProperty("--wall1", p.wall[0]); r.setProperty("--wall2", p.wall[1]); r.setProperty("--wall3", p.wall[2]);
    r.setProperty("--world1", p.world[0]); r.setProperty("--world2", p.world[1]);
    if (globalThis.FX && FX.setPlanet) FX.setPlanet(p);   // each world's starfield
  }
  function arrive(p) {                             // the "a new world rises" beat
    const card = $("planetcard");
    card.innerHTML = "<small>NEW WORLD</small>" + p.name;   // tier is an internal label, not for players
    card.classList.add("show");
    clearTimeout(arrive._t);
    arrive._t = setTimeout(() => card.classList.remove("show"), 2000);
  }

  // ---------- screens ----------
  const screens = { title: $("scr-title"), game: $("scr-game"), sky: $("scr-sky") };
  let current = "title";
  function quitTelemetry() {   // leaving an unfinished level = a quit (heatmap source)
    if (current === "game" && g && !g.over) {
      Track.ev("level_quit", { level: g.level.id, lit: g.lanterns.filter(l => l.lit).length });
    }
  }
  function show(name) {
    if (current === "game" && name !== "game") { quitTelemetry(); SDK.gameplayStop(); }
    current = name;
    closeMenu();
    for (const k in screens) screens[k].classList.toggle("active", k === name);
    // the settings gear lives on home AND in the game HUD — one menu, moved
    if (name === "title") $("titleMenuSlot").appendChild($("menuWrap"));
    else if (name === "game") $("hudMenuSlot").appendChild($("menuWrap"));
    $("btnHome").style.display = name === "title" ? "none" : "";  // ⌂ is noise on home
    const here = skyOf(curWorld());                // lanterns lit in the current planet's sky
    FX.setScene(name, { skyCount: here });
    if (name === "title") {
      // Play button is the level odometer (Royal Match pattern); levels are
      // endless, so it always points at the next one.
      $("btnPlay").textContent = "Level " + (firstOpen() + 1);
      $("btnSkyLabel").textContent = here ? `Night sky · ${here}` : "Night sky";
    }
    if (name === "sky") {
      $("skyCount").innerHTML = here
        ? `<b>${here}</b> lantern${here === 1 ? "" : "s"} lit in this sky`
        : "This sky is waiting — light some lanterns.";
      const p = PLANETS.planetFor(firstOpen());
      applyPlanet(p);                              // home/sky reflect the world you're in
      $("skyplace").textContent = p.name;
    }
    if (name === "title") {
      applyPlanet(PLANETS.planetFor(firstOpen()));
      // travel trail: a couple of worlds behind you (nearest) up through the ones ahead
      const cur = PLANETS.indexFor(firstOpen());
      const nodes = [];
      for (let w = Math.max(0, cur - 2); w <= cur + 4; w++) {
        const p = PLANETS.planetFor(w * PLANETS.SIZE);
        nodes.push({ color: p.world[0], glow: p.world[1], current: w === cur });
      }
      if (FX.setJourney) FX.setJourney(nodes);
    }
  }

  // ---------- layout ----------
  function layout(forceW) {
    // Board visual width = 8*cell + 7*gap(3) + 2*pad(10) = 8*cell + 41, and it
    // sits inside .screen's 14px horizontal padding (28 total). Reserve all of it
    // plus a safety margin so the board fits WITH real side margins — the old
    // `- 44` left only ~2px, which clipped the right edge on a 390pt iPhone.
    // forceW (screenshot harness only) sizes for a fixed width since headless
    // Chrome reports a viewport that doesn't match its --window-size.
    const w = (typeof forceW === "number" && forceW > 0) ? forceW : innerWidth;
    const RESERVE = 28 /* screen padding */ + 41 /* board chrome */ + 6 /* breath */;
    const cell = Math.max(30, Math.min(52,
      Math.floor((w - RESERVE) / N),
      Math.floor((innerHeight - 252) / N)));
    document.documentElement.style.setProperty("--cell", cell + "px");
  }

  // ---------- board ----------
  const boardEl = $("board"), trayEl = $("tray"), ghost = $("ghost");
  const cells = [];
  function buildBoard() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const d = document.createElement("div");
      d.className = "cell";
      boardEl.appendChild(d); cells.push(d);
    }
  }

  let g = null, levelIdx = 0;
  const released = new Set();   // lanterns that already floated up this level
  let uiSlots = [0, 1, 2];      // tray slot → hand index; pieces keep their slot until used

  function startLevel(i) {
    quitTelemetry();             // restarting mid-level also abandons a run
    // Announce a world ONLY when you cross into it DURING play (won a world's
    // last level → Continue → next world). A cold start / app relaunch never
    // announces — prevLevelIdx is null on a fresh load, so resuming at any level
    // (mid-world OR a world's first level) stays silent; the HUD names the world.
    const enteringWorld = prevLevelIdx !== null
        && PLANETS.indexFor(i) !== PLANETS.indexFor(prevLevelIdx);
    prevLevelIdx = i;
    levelIdx = i;
    g = E.newGame(levelAt(i));
    released.clear();
    uiSlots = [0, 1, 2];
    $("nospace").classList.remove("show");
    hideOverlay();
    // step into this level's world: reskin, name it in the HUD, fill the
    // world-progress bar (level-in-world / 20), and announce a new world.
    const p = PLANETS.planetFor(i);
    applyPlanet(p);
    $("hudWorld").textContent = p.name;
    $("worldfill").style.width = ((i % PLANETS.SIZE + 1) / PLANETS.SIZE * 100) + "%";
    if (enteringWorld) arrive(p);
    show("game");
    render();
    SDK.gameplayStart();
    Track.ev("level_start", { level: g.level.id });
    const dn = document.querySelector(".devnow");   // keep the dev label honest however we got here
    if (dn) dn.textContent = `L${levelIdx + 1} · ${p.name}`;
  }

  function render(flash) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const d = cells[r * N + c];
      let cls = "cell";
      const v = g.grid[r][c];
      if (v === E.WALL) cls += " wall";
      if (v === E.FILLED) cls += " filled";
      if (flash && (flash.rows.includes(r) || flash.cols.includes(c)) && v !== E.WALL) cls += " flash";
      const ln = g.lanterns.find(l => l.r === r && l.c === c);
      let inner = "";
      if (ln) {
        if (released.has(r + "," + c)) cls += " released";
        // until the first lantern is ever lit, dim lanterns pulse to telegraph the goal
        else inner = `<div class="lan${ln.lit ? " lit-lan" : (store.tutDone ? "" : " hint")}"></div>`;
      }
      d.className = cls;
      if (d.innerHTML !== inner) d.innerHTML = inner;
    }
    trayEl.innerHTML = "";
    for (let s = 0; s < 3; s++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      const h = uiSlots[s];
      if (h !== null && g.hand[h] !== undefined) {
        const pieceEl = makePieceEl(g.hand[h], h);
        slot.appendChild(pieceEl);
        slot.addEventListener("pointerdown", ev => startDrag(ev, pieceEl));
      }
      trayEl.appendChild(slot);
    }
    $("hudLevel").textContent = "Level " + g.level.id;
    $("hudDots").innerHTML = g.lanterns.map(l => `<span class="dot${l.lit ? " on" : ""}"></span>`).join("");
    $("tut").style.display = store.tutDone ? "none" : "";
  }

  function makePieceEl(shapeKey, handIdx) {
    const arr = E.SHAPES[shapeKey];
    const maxR = Math.max(...arr.map(x => x[0])) + 1;
    const maxC = Math.max(...arr.map(x => x[1])) + 1;
    const el = document.createElement("div");
    el.className = "piece"; el.dataset.idx = handIdx; el.dataset.shape = shapeKey;
    // uniform mini-cell that lets even a 5-long piece fit its third-width slot
    const slotW = (cellPx() * 8 + 41 - 20) / 3;
    const mini = Math.max(14, Math.floor(Math.min(cellPx() * 0.52, (slotW - 12) / 5)));
    el.style.gridTemplateRows = `repeat(${maxR}, ${mini}px)`;
    el.style.gridTemplateColumns = `repeat(${maxC}, ${mini}px)`;
    const set = new Set(arr.map(x => x[0] + "," + x[1]));
    for (let r = 0; r < maxR; r++) for (let c = 0; c < maxC; c++) {
      const d = document.createElement("div");
      d.className = set.has(r + "," + c) ? "pc" : "hidden";
      el.appendChild(d);
    }
    return el;   // pickup is handled by the parent slot (bigger touch target)
  }

  // ---------- drag ----------
  function cellPx() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell")); }
  function lift() { return Math.max(64, cellPx() * 1.6); }
  let drag = null;

  function startDrag(ev, el) {
    if (!g || g.over || drag) return;
    ev.preventDefault();
    const shapeKey = el.dataset.shape, handIdx = +el.dataset.idx;
    const arr = E.SHAPES[shapeKey];
    const maxR = Math.max(...arr.map(x => x[0])) + 1;
    const maxC = Math.max(...arr.map(x => x[1])) + 1;
    const cs = cellPx(), gap = 3;
    ghost.innerHTML = "";
    ghost.style.display = "grid";
    ghost.style.gridTemplateRows = `repeat(${maxR}, ${cs}px)`;
    ghost.style.gridTemplateColumns = `repeat(${maxC}, ${cs}px)`;
    ghost.style.gap = gap + "px";
    const set = new Set(arr.map(x => x[0] + "," + x[1]));
    for (let r = 0; r < maxR; r++) for (let c = 0; c < maxC; c++) {
      const d = document.createElement("div");
      d.className = set.has(r + "," + c) ? "pc" : "hidden";
      if (d.className === "pc") { d.style.width = cs + "px"; d.style.height = cs + "px"; }
      ghost.appendChild(d);
    }
    el.classList.add("used");
    drag = { shapeKey, handIdx, el, cs, gap };
    moveDrag(ev);
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", endDrag, { once: true });
    window.addEventListener("pointercancel", cancelDrag, { once: true });
  }

  // anchor = board cell under the shape's top-left cell center (finger, lifted)
  function anchorAt(ev) {
    const p = { x: ev.clientX, y: ev.clientY - lift() };
    const r0 = cells[0].getBoundingClientRect();
    const pitch = drag.cs + drag.gap;
    const c = Math.floor((p.x - r0.left) / pitch);
    const r = Math.floor((p.y - r0.top) / pitch);
    if (r < 0 || c < 0 || r >= N || c >= N) return null;
    return { r, c };
  }

  function moveDrag(ev) {
    if (!drag) return;
    for (const d of cells) d.classList.remove("ok", "bad");
    const at = anchorAt(ev);
    let snapped = false;
    if (at) {
      const legal = E.canPlace(g, drag.shapeKey, at.r, at.c);
      for (const [dr, dc] of E.SHAPES[drag.shapeKey]) {
        const rr = at.r + dr, cc = at.c + dc;
        if (rr < N && cc < N) cells[rr * N + cc].classList.add(legal ? "ok" : "bad");
      }
      if (legal) {  // snap ghost onto the exact cells
        const rect = cells[at.r * N + at.c].getBoundingClientRect();
        ghost.style.left = rect.left + "px";
        ghost.style.top = rect.top + "px";
        snapped = true;
      }
    }
    ghost.classList.toggle("snap", snapped);
    if (!snapped) {
      ghost.style.left = (ev.clientX - drag.cs / 2) + "px";
      ghost.style.top = (ev.clientY - lift() - drag.cs / 2) + "px";
    }
  }

  function cancelDrag() {
    if (!drag) return;
    window.removeEventListener("pointermove", moveDrag);
    ghost.style.display = "none";
    for (const d of cells) d.classList.remove("ok", "bad");
    drag.el.classList.remove("used");
    drag = null;
  }

  function endDrag(ev) {
    if (!drag) return;
    window.removeEventListener("pointermove", moveDrag);
    ghost.style.display = "none";
    for (const d of cells) d.classList.remove("ok", "bad");
    const at = anchorAt(ev);
    const usedIdx = drag.handIdx;
    const res = at && E.place(g, usedIdx, at.r, at.c);
    if (!res) drag.el.classList.remove("used");
    drag = null;
    if (!res) return;

    // keep remaining pieces in their slots; engine hand indexes shifted down
    if (g.hand.length === 3) uiSlots = [0, 1, 2];          // hand was emptied → refilled
    else uiSlots = uiSlots.map(v => v === usedIdx ? null : (v !== null && v > usedIdx ? v - 1 : v));

    Snd.tap();
    const litNow = res.lit.slice();
    render(res.cleared);
    const nLines = res.cleared.rows.length + res.cleared.cols.length;
    if (nLines) {
      // lighting a lantern is the goal — its sound owns the moment; a plain
      // clear (no lantern) gets the neutral "cleared" whoosh instead.
      if (!litNow.length) Snd.clear(nLines);
      const rects = [];
      for (const r of res.cleared.rows) for (let c = 0; c < N; c++) rects.push(cells[r * N + c].getBoundingClientRect());
      for (const c of res.cleared.cols) for (let r = 0; r < N; r++) rects.push(cells[r * N + c].getBoundingClientRect());
      FX.sparkCells(rects);
      boardEl.classList.add("pulse");
      setTimeout(() => boardEl.classList.remove("pulse"), 130);
    }
    if (litNow.length) Snd.lantern();   // the distinct reward chime, once
    for (const ln of litNow) {
      const rect = cells[ln.r * N + ln.c].getBoundingClientRect();
      setTimeout(() => {
        FX.floatLantern(rect);
        released.add(ln.r + "," + ln.c);
        if (!g.over || g.won) render();
      }, 240);
    }
    if (litNow.length && !store.tutDone) { store.tutDone = true; save(); $("tut").classList.add("gone"); }
    if (g.over) {
      if (g.won) setTimeout(showEnd, 1000);
      else {                                  // staged beat: sweep + flicker, then card
        setTimeout(failMoment, 250);
        setTimeout(showEnd, 1900);
      }
    }
  }

  // The "no space left" moment (Block Blast staging): the jammed board stays
  // visible, the verdict sweeps in, the unlit lanterns flicker out.
  function failMoment() {
    if (!g || !g.over || g.won) return;
    closeMenu();
    Snd.fail();
    $("nospace").classList.add("show");
    for (const ln of g.lanterns) {
      if (ln.lit) continue;
      const lanEl = cells[ln.r * N + ln.c].querySelector(".lan");
      if (lanEl) lanEl.classList.add("flicker");
    }
  }

  // ---------- overlays ----------
  const overlay = $("overlay");
  function hideOverlay() { overlay.classList.remove("show", "winlight", "worldcard"); }
  // End card, Royal Match shape: level banner on top, one celebratory line,
  // lantern centerpiece with the sky reward, a single Continue, X to close.
  // Both end cards are wordless and mirrored: win = lit lantern + reward
  // badge; fail = the same lantern unlit, swaying, over a dots row showing
  // how close the run got.
  // the world-complete flourish: a wave of lanterns drifts up across the whole
  // screen (the planet's sky visibly filling) over a couple of extra spark bursts.
  function skyBloom() {
    const W = innerWidth, H = innerHeight, N = 16;
    for (let i = 0; i < N; i++) {
      const x = W * (0.06 + 0.88 * (i + 0.5) / N) + (i % 2 ? -18 : 18);
      const y = H * (0.55 + 0.32 * (((i * 7) % 5) / 5));
      const sz = 30 + (i % 4) * 9;
      setTimeout(() => FX.floatLantern({ left: x - sz / 2, top: y, width: sz, height: sz }), i * 70);
    }
    // bursts radiating from the planet itself (card centre), then a wider one
    const orb = { left: W * 0.5 - 40, top: H * 0.33, width: 80, height: 1 };
    FX.celebrate(orb);
    setTimeout(() => FX.celebrate(orb), 230);
    setTimeout(() => FX.celebrate({ left: W * 0.5 - 60, top: H * 0.29, width: 120, height: 1 }), 470);
  }

  function showEnd() {
    const t = $("ovTitle"), p = $("ovText"), b = $("ovBtns");
    const hero = $("ovHero"), heroLan = hero.querySelector(".lan");
    const badge = $("ovBadge"), dots = $("ovDots");
    closeMenu();
    overlay.classList.add("show");
    $("ovLevel").textContent = "Level " + g.level.id;
    b.innerHTML = "";
    t.textContent = ""; p.textContent = "";
    t.style.display = "none"; p.style.display = "none";
    hero.style.display = "block";
    SDK.gameplayStop();
    if (g.won) {
      overlay.classList.add("winlight");
      const firstClear = !store.won[levelIdx];
      Track.ev("level_win", { level: g.level.id, pieces: g.piecesUsed, first: firstClear });
      store.won[levelIdx] = true;
      if (firstClear) {                                       // count into this world's own sky
        const w = worldOf(levelIdx);
        store.skyByWorld[w] = (store.skyByWorld[w] || 0) + g.level.lanterns.length;
      }
      save();
      SDK.happytime();
      FX.celebrate(boardEl.getBoundingClientRect());
      dots.style.display = "none";
      // clearing a world's LAST level (first time) is a milestone: that planet's
      // whole night sky is now full. Swap the lantern hero for the glowing world
      // itself and let lanterns rise across the card before the next world rises.
      const worldDone = firstClear && (levelIdx % WORLD_SIZE === WORLD_SIZE - 1);
      if (worldDone) {
        const wp = PLANETS.planetFor(levelIdx);
        overlay.classList.add("worldcard");
        hero.style.display = "none";
        badge.style.display = "none";
        $("ovLevel").textContent = wp.name;
        t.textContent = "World complete"; t.style.display = "";
        $("ovWorldCount").textContent = "✦ " + skyOf(worldOf(levelIdx));
        Snd.win(); setTimeout(() => Snd.lantern(), 480);   // win fanfare blooms into the reward bell
        skyBloom();
      } else {
        Snd.win();
        hero.classList.remove("sad");
        heroLan.classList.add("lit-lan");
        // a replayed (already-lit) level adds nothing to the sky — drop the +N badge
        if (firstClear) { badge.style.display = ""; badge.textContent = "+" + g.level.lanterns.length; }
        else badge.style.display = "none";
      }
      // levels are endless — always a next one to continue to
      addBtn(b, "Continue", () => { Snd.ui(); startLevel(levelIdx + 1); }, "primary wide");
    } else {
      Track.ev("level_fail", { level: g.level.id, lit: g.lanterns.filter(l => l.lit).length,
                               lanterns: g.lanterns.length });
      $("nospace").classList.remove("show");
      hero.classList.add("sad");
      heroLan.classList.remove("lit-lan");
      badge.style.display = "none";
      dots.style.display = "flex";
      dots.innerHTML = g.lanterns.map(l => `<span class="dot${l.lit ? " on" : ""}"></span>`).join("");
      addBtn(b, "Retry", () => { Snd.ui(); startLevel(levelIdx); }, "primary wide");
    }
  }
  function addBtn(parent, label, fn, cls) {
    const btn = document.createElement("button");
    if (cls) btn.className = cls;
    btn.textContent = label;
    btn.addEventListener("click", fn);
    parent.appendChild(btn);
  }

  // ---------- wiring ----------
  $("btnPlay").addEventListener("click", () => { Snd.ui(); startLevel(firstOpen()); });
  $("btnSky").addEventListener("click", () => { Snd.ui(); show("sky"); });
  $("btnSkyHome").addEventListener("click", () => { Snd.ui(); show("title"); });
  // in-game gear menu (genre convention: one visible control, rest collapsed)
  const menuWrap = $("menuWrap");
  function closeMenu() { menuWrap.classList.remove("open"); }
  $("btnMenu").addEventListener("click", () => { Snd.ui(); menuWrap.classList.toggle("open"); });
  document.addEventListener("pointerdown", e => { if (!menuWrap.contains(e.target)) closeMenu(); });
  $("btnHome").addEventListener("click", () => { Snd.ui(); closeMenu(); hideOverlay(); show("title"); });
  // X on the end card → home, same exit as the HUD ⌂ (title is the hub:
  // Play continues, Levels/Sky one tap away, released lanterns visible).
  $("ovClose").addEventListener("click", () => { Snd.ui(); hideOverlay(); show("title"); });
  // settings toggles (menu stays open so the state flip is visible)
  function syncToggles() {
    $("btnMute").classList.toggle("off", !store.sound);
    $("btnBgm").classList.toggle("off", !store.bgm);
    $("btnVib").classList.toggle("off", !store.haptics);
  }
  $("btnMute").addEventListener("click", () => {
    store.sound = !store.sound; Snd.muted = !store.sound; save(); syncToggles(); Snd.ui();
  });
  $("btnBgm").addEventListener("click", () => {
    store.bgm = !store.bgm; save(); syncToggles();
    if (store.bgm) Snd.bgmOn(); else Snd.bgmOff();
    Snd.ui();
  });
  $("btnVib").addEventListener("click", () => {
    store.haptics = !store.haptics; Snd.haptics = store.haptics; save(); syncToggles();
    if (store.haptics) Snd.testBuzz();   // a little "it works" tap
    Snd.ui();
  });
  syncToggles();

  document.addEventListener("contextmenu", e => { if (current === "game") e.preventDefault(); });
  window.addEventListener("pagehide", quitTelemetry);   // closing the tab mid-level counts too
  window.addEventListener("resize", () => layout());   // ignore the event arg (forceW must be a number)
  window.addEventListener("keydown", e => {
    if (!DEBUG || current !== "game") return;
    if (e.key === "n") startLevel(levelIdx + 1);           // endless — no upper bound
    if (e.key === "p" && levelIdx > 0) startLevel(levelIdx - 1);
  });

  // ---------- debug hooks (?debug=1) for dev + screenshot harness ----------
  if (DEBUG) {
    window.LD = {
      goto: n => startLevel(n - 1),                 // raw jump (no progress marked)
      jump: n => jumpToLevel(n - 1),                // jump to level n, marking everything before it won
      world: w => jumpToWorld(w - 1),               // jump to the start of world w (1-based)
      worlds: () => PLANETS.ATLAS.map((p, i) => `${i + 1}. ${p.name} (Tier ${p.tier}, levels ${i * PLANETS.SIZE + 1}-${(i + 1) * PLANETS.SIZE})`),
      winNow() { g.lanterns.forEach(l => l.lit = true); g.over = true; g.won = true; render(); showEnd(); },
      failNow(unlit) {
        const k = unlit === undefined ? 2 : unlit;   // leave k lanterns unlit, force the card
        g.lanterns.forEach((l, i) => l.lit = i < g.lanterns.length - k);
        g.over = true; g.won = false; render(); showEnd();
      },
      moment(unlit) {  // the "no space left" sweep only (for eyeballing the beat)
        const k = unlit === undefined ? 2 : unlit;
        g.lanterns.forEach((l, i) => l.lit = i < g.lanterns.length - k);
        g.over = true; g.won = false; render(); failMoment();
      },
      winLevels(n) { for (let i = 0; i < n; i++) store.won[i] = true; save(); },
      reset() { localStorage.removeItem(SAVE_KEY); location.reload(); },
      state: () => ({ levelIdx, over: g && g.over, won: g && g.won, hand: g && g.hand }),
      game: () => g,
      render: () => render()
    };
    buildDevBar();
  }

  // On-device QA panel (debug builds only): tap ≡ top-left to teleport anywhere
  // in the journey without playing through — New user, jump to any level, step
  // world-by-world (◀W / W▶, each shows that world's palette + arrival + sky),
  // and Win the current level. Auto-absent from Release builds.
  function buildDevBar() {
    const wrap = document.createElement("div");
    wrap.id = "devbar";
    const toggle = document.createElement("button");
    toggle.className = "devtoggle"; toggle.textContent = "≡";
    toggle.onclick = () => wrap.classList.toggle("open");
    const row = document.createElement("div"); row.className = "devrow";
    const label = document.createElement("span"); label.className = "devnow";
    const refresh = () => {
      const p = PLANETS.planetFor(levelIdx);
      label.textContent = `L${levelIdx + 1} · ${p.name}`;
    };
    const mk = (text, fn) => {
      const b = document.createElement("button");
      b.textContent = text;
      b.onclick = () => { fn(); refresh(); if (!/World/.test(text)) wrap.classList.remove("open"); };
      row.appendChild(b);
    };
    mk("New", () => { store.won = []; store.skyByWorld = {}; store.tutDone = false; save(); hideOverlay(); show("title"); });
    mk("Lvl#", () => { const n = parseInt(prompt("Jump to level number", String(levelIdx + 1)), 10); if (n > 0) jumpToLevel(n - 1); });
    mk("◀ World", () => jumpToWorld(PLANETS.indexFor(levelIdx) - 1));   // start of previous world
    mk("World ▶", () => jumpToWorld(PLANETS.indexFor(levelIdx) + 1));   // start of next world
    mk("Last W", () => jumpToWorld(PLANETS.ATLAS.length - 1));          // last named world (The Veil)
    mk("Last L", () => jumpToLevel(PLANETS.ATLAS.length * PLANETS.SIZE - 1));  // last charted level (200)
    mk("Win", () => { if (g && !g.over) { g.lanterns.forEach(l => l.lit = true); g.over = true; g.won = true; render(); showEnd(); } });
    row.appendChild(label); refresh();
    wrap.appendChild(toggle); wrap.appendChild(row);
    document.body.appendChild(wrap);
  }

  // ---------- boot ----------
  SDK.init();
  SDK.loadingStart();
  layout();
  buildBoard();
  FX.init($("bg"), $("fx"));
  show("title");
  if (store.bgm) Snd.bgmOn();   // native: starts now; web: after first gesture
  SDK.loadingStop();

  // ---------- screenshot harness (App Store assets) ----------
  // ?shot=<state>&n=<level> drives the game to a fixed visual state on load so a
  // headless browser can capture pixel-exact store shots. Inert without ?shot, so
  // it never affects real play (a user never has the param). See scripts/dev/shots.sh.
  (function () {
    const q = new URLSearchParams(location.search);
    const shot = q.get("shot");
    if (!shot) return;
    const n = parseInt(q.get("n") || "7", 10);
    document.body.classList.add("shooting");          // CSS hides the dev bar/cursor
    store.won = []; store.skyByWorld = {};            // deterministic: every shot starts from fresh
    setTimeout(() => {                                 // progress (so a win shot is always a first-clear)
      layout();
      if (shot === "title") { show("title"); return; }
      if (shot === "sky") { store.skyByWorld[0] = 42; show("sky"); return; }   // seed a glowing sky
      startLevel(n - 1);
      if (shot === "win") {                            // light it and pop the win / world card
        FX.celebrate = function () {};                 // clean shot: no spark specks…
        FX.floatLantern = function () {};              // …and no bloom lanterns over the card
        g.lanterns.forEach(l => l.lit = true); g.over = true; g.won = true;
        render(); showEnd();
      }
    }, 220);
  })();
})();
