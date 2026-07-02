/* Excavate — level campaign. Dig the hot/cold field to uncover buried OBJECTS, then name
   them all for a star rating, level by level. A deck of MODIFIERS (blur, decoy, fog,
   silhouette, bedrock, multi-object) is layered per level by modsForLevel(): each debuts
   solo on an easy board, then combines. Progress + 3-star medals persist locally. Puzzle
   math is the pure engine (engine.js); this file owns the canvas art, the modifier
   rendering, and the campaign flow. */
(function () {
  "use strict";
  const E = window.GameEngine, WGC = window.WebGameCore;
  const Track = window.Track || { ev() {}, init() {} };
  const Sfx = window.Sfx || { unlock() {}, tap() {}, win() {}, clear() {}, init() {} };
  const N = E.N, TILES = E.TILES;
  const $ = id => document.getElementById(id);
  Track.init({ gaId: "" }); Sfx.init({ namespace: "excavate" });
  const PROG_KEY = "excavate.campaign.v1";
  const COL_KEY = "excavate.collection.v2";
  const SEEN_KEY = "excavate.seen.v1";

  const DRAW = {}; // filled after the draw fns are declared (hoisted), see bottom of art block

  // ---------- campaign definition ----------
  // authored teaching arc — each new modifier debuts solo, then combines
  const ARC = [
    {},                              // 1  base read
    { blur: 4 },                     // 2  blur
    { decoy: 2 },                    // 3  decoy
    { fog: true },                   // 4  fog of war
    { silhouette: true },            // 5  silhouette
    { bedrock: 3 },                  // 6  bedrock
    { multi: 2 },                    // 7  TWO objects (headline)
    { multi: 2, blur: 5 },           // 8
    { fog: true, decoy: 2 },         // 9
    { silhouette: true, decoy: 1 },  // 10
    { bedrock: 4, blur: 5 },         // 11
    { multi: 2, fog: true },         // 12
  ];
  function seedForLevel(n) { return ((n * 0x9e3779b1) ^ 0x51ed) >>> 0; }
  function modsForLevel(n) {
    if (n <= ARC.length) return ARC[n - 1];
    const r = WGC.makeRNG((seedForLevel(n) ^ 0xA11CE) >>> 0);
    const m = {};
    if (r() < 0.55) m.blur = 4 + Math.floor(r() * 8);
    if (r() < 0.5) m.decoy = 1 + Math.floor(r() * 3);
    if (r() < 0.4) m.multi = 2;
    if (r() < 0.35) m.bedrock = 2 + Math.floor(r() * 4);
    if (r() < 0.3) m.silhouette = true;
    if (r() < 0.35) m.fog = true;
    if (Object.keys(m).length === 0) m.blur = 6;
    return m;
  }

  // ---------- state ----------
  let level = 1, seed = 0, p = null, cx = null;
  let budget = 0, opened = 0, openedSet = null, parDigs = 0, finished = false, won = false;
  let found = null, wrongGuesses = 0, selected = null, litTiles = null;
  let gridCells = [];

  function loadProg() { try { return JSON.parse(localStorage.getItem(PROG_KEY)) || { level: 1, stars: {} }; } catch (e) { return { level: 1, stars: {} }; } }
  function saveProg(pr) { try { localStorage.setItem(PROG_KEY, JSON.stringify(pr)); } catch (e) {} }

  // ---------- per-level build ----------
  function startLevel(n) {
    level = n;
    seed = seedForLevel(n);
    p = E.build(seed, n, modsForLevel(n));
    parDigs = p.parDigs; budget = p.budget;
    opened = 0; openedSet = new Set(); finished = false; won = false;
    found = new Set(); wrongGuesses = 0; selected = null;
    litTiles = new Set();
    if (p.fog) seedFog();
    $("ov").classList.add("hidden");
    renderPhoto(false); updateBlur(); buildGrid(); refreshHud(); buildChoices(); setHow();
    if (n === 1 && !localStorage.getItem("excavate.onboarded.v3")) { onboard(); try { localStorage.setItem("excavate.onboarded.v3", "1"); } catch (e) {} }
    maybeIntro();
  }

  function seedFog() {
    // light a few tiles so there's a thread to pull — at least one warm one
    const r = WGC.makeRNG((seed ^ 0xF06) >>> 0);
    const idx = Array.from({ length: TILES }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    let warmLit = false;
    for (const i of idx) { if (litTiles.size >= 4) break; if (!p.bedrock[i]) { litTiles.add(i); if (p.hintLevel[i] >= 2) warmLit = true; } }
    if (!warmLit) { for (const i of idx) { if (p.hintLevel[i] >= 2 && !p.bedrock[i]) { litTiles.add(i); break; } } }
  }

  function onboard() {
    const si = p.subjectTiles[0], [sr, sc] = [Math.floor(si / N), si % N];
    let ni = -1;
    for (const d of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { const nr = sr + d[0], nc = sc + d[1]; if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue; const cand = nr * N + nc; if (!p.bedrock[cand]) { ni = cand; break; } }
    if (ni < 0) ni = si;
    digTile(ni, true);
    gridCells[si].classList.add("hint");
  }

  // ---------- photo (buried objects) ----------
  function drawSubjectTo(ctx, name, cxc, cyc, size, silhouette) {
    const fn = DRAW[name] || function () {};
    if (!silhouette) { ctx.save(); ctx.translate(cxc, cyc); fn(ctx, size); ctx.restore(); return; }
    const pad = Math.ceil(size * 2.4), oc = document.createElement("canvas"); oc.width = pad; oc.height = pad;
    const octx = oc.getContext("2d"); octx.translate(pad / 2, pad / 2); fn(octx, size);
    octx.globalCompositeOperation = "source-in"; octx.fillStyle = "#0a0d16"; octx.fillRect(-pad / 2, -pad / 2, pad, pad);
    ctx.drawImage(oc, Math.round(cxc - pad / 2), Math.round(cyc - pad / 2));
  }
  function renderPhoto(showColor) {
    const cv = $("photo"), dpr = Math.min(2, window.devicePixelRatio || 1), sz = cv.clientWidth || 360;
    cv.width = sz * dpr; cv.height = sz * dpr; cx = cv.getContext("2d"); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = cx.createLinearGradient(0, 0, 0, sz); g.addColorStop(0, p.sky[0]); g.addColorStop(1, p.sky[1]);
    cx.fillStyle = g; cx.fillRect(0, 0, sz, sz);
    const f0 = p.focals[0];
    const vr = cx.createRadialGradient(sz * f0.x, sz * f0.y, sz * 0.05, sz * 0.5, sz * 0.5, sz * 0.8);
    vr.addColorStop(0, "#ffffff12"); vr.addColorStop(1, "#00000055"); cx.fillStyle = vr; cx.fillRect(0, 0, sz, sz);
    const gr = WGC.makeRNG((seed ^ 0x9e37) >>> 0);
    for (let i = 0; i < 110; i++) { cx.fillStyle = "rgba(255,255,255," + (gr() * 0.04) + ")"; cx.beginPath(); cx.arc(gr() * sz, gr() * sz, gr() * 1.5, 0, 7); cx.fill(); }
    const sil = p.silhouette && !showColor;
    const size = sz * (p.subjects.length > 1 ? 0.24 : 0.34);
    p.focals.forEach((f, k) => drawSubjectTo(cx, p.subjects[k].name, sz * f.x, sz * f.y, size, sil));
  }
  function updateBlur() {
    const frac = Math.min(1, opened / Math.max(3, parDigs + 2));
    const eff = (p.blur || 0) * (1 - frac);
    $("photo").style.filter = eff > 0.15 ? "blur(" + eff.toFixed(1) + "px)" : "none";
  }

  // ---------- grid ----------
  const DOTCOL = ["var(--cold)", "var(--cool)", "var(--warm)", "var(--hot)", "var(--hot)"];
  function dotVisible(i) { return !p.fog || openedSet.has(i) || litTiles.has(i); }
  function buildGrid() {
    const grid = $("grid"); grid.innerHTML = ""; grid.style.gridTemplate = `repeat(${N},1fr)/repeat(${N},1fr)`;
    gridCells = [];
    for (let i = 0; i < TILES; i++) {
      const t = document.createElement("div"); t.className = "tile"; t.dataset.i = i;
      const cap = document.createElement("div"); cap.className = "cap";
      if (p.bedrock[i]) { t.classList.add("rock"); cap.classList.add("rock"); }
      else { const dot = document.createElement("div"); dot.className = "dot"; cap.appendChild(dot); }
      const ring = document.createElement("div"); ring.className = "ring";
      t.appendChild(cap); t.appendChild(ring); t.addEventListener("click", () => onTile(i));
      grid.appendChild(t); gridCells.push(t);
      paintDot(i);
    }
  }
  function paintDot(i) {
    if (p.bedrock[i]) return;
    const dot = gridCells[i].querySelector(".dot"); if (!dot) return;
    if (dotVisible(i)) { const hl = p.dots[i]; dot.style.background = DOTCOL[hl]; dot.style.color = DOTCOL[hl]; dot.style.opacity = ""; }
    else { dot.style.background = "transparent"; dot.style.boxShadow = "none"; dot.style.opacity = "0"; }
  }

  function onTile(i) {
    if (finished || openedSet.has(i) || p.bedrock[i]) return;
    if (budget <= 0) { toast("No digs left — name it!"); return; }
    Sfx.unlock(); Sfx.clear(0);
    digTile(i, false);
    if (p.hintLevel[i] >= 4) hint("Hot patch — you're on it. <em>Name it!</em>");
    else if (p.hintLevel[i] <= 1 && !p.fog) hint("Cold — the object is elsewhere.");
    else setHow();
    refreshHud();
  }
  function dist(a, b) { return Math.max(Math.abs(Math.floor(a / N) - Math.floor(b / N)), Math.abs(a % N - b % N)); }
  function digTile(i, freebie) {
    if (openedSet.has(i) || p.bedrock[i]) return;
    openedSet.add(i); if (!freebie) { opened++; budget--; }
    gridCells[i].classList.add("open");
    if (!freebie) gridCells.forEach(t => t.classList.remove("hint"));
    // fog: light up neighbours
    if (p.fog) { revealAround(i, p.fog.radius); }
    popAt(i, p.dots[i]);
    updateBlur();
  }
  function revealAround(i, radius) {
    const [r, c] = [Math.floor(i / N), i % N];
    for (let dr = -radius; dr <= radius; dr++) for (let dc = -radius; dc <= radius; dc++) {
      const nr = r + dr, nc = c + dc; if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue;
      const ni = nr * N + nc; if (!litTiles.has(ni)) { litTiles.add(ni); paintDot(ni); }
    }
  }

  // ---------- HUD + naming ----------
  function refreshHud() {
    $("budget").textContent = budget;
    $("par").textContent = parDigs;
    $("dayN").textContent = "Level " + level;
    $("budgetStat").classList.toggle("lowbudget", budget <= 1);
  }
  function renderStars(el, n) { el.innerHTML = ""; for (let i = 0; i < 3; i++) { const s = document.createElement("span"); s.textContent = i < n ? "★" : "☆"; s.className = i < n ? "on" : ""; el.appendChild(s); } }
  function setHow(msg) {
    if (msg) { $("how").innerHTML = msg; return; }
    let s;
    if (p.subjects.length > 1) s = `Two buried — <b>${found.size}/${p.subjects.length}</b> named`;
    else if (p.silhouette) s = "Name it by its shape";
    else if (p.fog) s = "Dig to sense the heat";
    else if (p.bedrock.some(Boolean)) s = "Read the heat around the stone";
    else if (p.blur) s = "Dig to sharpen the picture";
    else s = "Dig the warm tiles, then name it";
    $("how").innerHTML = s;
  }

  function buildChoices() {
    selected = new Set();
    const wrap = $("choices"); wrap.innerHTML = "";
    p.choices.forEach(n => {
      const b = document.createElement("button"); b.type = "button"; b.className = "choice"; b.textContent = n; b.dataset.name = n;
      b.addEventListener("click", () => selectChoice(n, b));
      wrap.appendChild(b);
    });
    $("guessBtn").textContent = p.answers.length > 1 ? "Name both" : "Name it";
  }
  // tap to select; with two objects you may select BOTH before committing (one pass)
  function selectChoice(name, btn) {
    if (finished || btn.classList.contains("wrong") || btn.classList.contains("got")) return;
    Sfx.unlock(); Sfx.tap();
    const rem = p.answers.length - found.size;   // how many still to name
    if (selected.has(name)) { selected.delete(name); btn.classList.remove("sel"); return; }
    if (rem <= 1) { selected.clear(); [...$("choices").children].forEach(c => c.classList.remove("sel")); }
    else if (selected.size >= rem) { toast("Pick " + rem + " — tap one to deselect."); return; }
    selected.add(name); btn.classList.add("sel");
  }
  function doGuess() {
    if (finished) return;
    Sfx.unlock();
    const rem = p.answers.length - found.size;
    if (selected.size === 0) { toast(rem > 1 ? "Tap " + rem + " names." : "Tap a name first."); return; }
    if (selected.size < rem) { toast("Pick " + rem + " name" + (rem > 1 ? "s" : "") + ", then Name it."); return; }
    Sfx.tap();
    let wrong = 0;
    [...selected].forEach(name => {
      const chip = $("choices").querySelector('[data-name="' + name + '"]');
      if (p.answers.indexOf(name) >= 0) { found.add(name); if (chip) { chip.classList.add("got"); chip.classList.remove("sel"); } }
      else { wrong++; if (chip) { chip.classList.add("wrong"); chip.classList.remove("sel"); } }
    });
    selected.clear();
    if (found.size >= p.answers.length) return onWin();
    if (wrong > 0) {
      wrongGuesses += wrong;
      budget = Math.max(0, budget - wrong); flash($("budget")); refreshHud();
      toast("Not quite — keep reading the heat.");
      if (budget <= 0) return onLose();
    }
    setHow();
  }

  // ---------- win / lose ----------
  function stars() { let s = 1; if (opened <= parDigs) s = 2; if (opened <= parDigs && wrongGuesses === 0) s = 3; return s; }
  function onWin() {
    finished = true; won = true; Sfx.win();
    bloomReveal();
    p.subjectTiles.forEach(st => { gridCells[st].classList.add("subject"); gridCells[st].querySelector(".ring").classList.add("show"); });
    const had = readCol();
    const newly = p.subjects.filter(s => !had[s.name]).map(s => s.name);   // first-time finds
    p.subjects.forEach(s => collect(s.name, s.emoji));
    const earned = stars();
    const pr = loadProg();
    pr.stars[level] = Math.max(pr.stars[level] || 0, earned);
    pr.level = Math.max(pr.level, level + 1);
    saveProg(pr);
    setTimeout(() => showResult(true, earned, newly), 700);
    confetti(true);
  }
  function onLose() {
    finished = true; won = false; Sfx.clear(0);
    bloomReveal();
    p.subjectTiles.forEach(st => { gridCells[st].classList.add("subject"); gridCells[st].querySelector(".ring").classList.add("show"); });
    setTimeout(() => showResult(false, 0), 700);
    confetti(false);
  }
  function hexA(h, a) { const n = parseInt(h.slice(1), 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  // render the unearthed object(s) big, as illustrated art on the mound (the hero)
  function renderHeroArt(container, subjects, isNew) {
    container.innerHTML = ""; container.classList.toggle("pair", subjects.length > 1);
    const cvSize = subjects.length > 1 ? 100 : 132, dpr = Math.min(2, window.devicePixelRatio || 1);
    subjects.forEach((s, i) => {
      const wrap = document.createElement("div"); wrap.className = "object" + (i > 0 ? " two" : "");
      if (isNew(s.name)) { const pill = document.createElement("span"); pill.className = "newpill"; pill.textContent = "NEW"; wrap.appendChild(pill); }
      const cv = document.createElement("canvas"); cv.className = "artc";
      cv.width = cvSize * dpr; cv.height = cvSize * dpr; cv.style.width = cvSize + "px"; cv.style.height = cvSize + "px";
      const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.save(); g.translate(cvSize / 2, cvSize / 2); (DRAW[s.name] || function () {})(g, cvSize * 0.42); g.restore();
      wrap.appendChild(cv); container.appendChild(wrap);
    });
  }
  function renderMedal(el, earned) {
    el.innerHTML = ""; const cls = ["s1", "mid s2", "s3"];
    for (let i = 0; i < 3; i++) { const s = document.createElement("span"); s.className = "star " + cls[i] + (i < earned ? " lit" : ""); s.textContent = "★"; el.appendChild(s); }
  }
  function showResult(win, earned, newly) {
    newly = newly || [];
    $("ovCard").classList.toggle("lose", !win);
    $("ovLvl").textContent = level;
    $("ovTitle").textContent = win ? (p.subjects.length > 1 ? "Double dig!" : "Unearthed!") : "Out of digs";
    // hero: show the object(s) either way — a loss quietly reveals the answer
    renderHeroArt($("ovObjects"), p.subjects, name => win && newly.indexOf(name) >= 0);
    $("ovName").innerHTML = p.subjects.map(s => s.name).join(' <span class="plus">+</span> ');
    const rarest = p.subjects.reduce((a, b) => (b.tier > a.tier ? b : a)), rc = E.RARITY[rarest.tier - 1];
    const rib = $("ovRarity"); rib.textContent = rc.name; rib.style.color = rc.color;
    rib.style.background = hexA(rc.color, .10); rib.style.borderColor = hexA(rc.color, .35);
    $("ovAura").style.background = "radial-gradient(circle at center, " + hexA(rc.color, .32) + ", " + hexA(rc.color, 0) + " 66%)";
    $("ovPar").textContent = win ? "" : "Read the heat, spend digs wisely — try again.";
    $("ovPar").style.display = win ? "none" : "";
    $("nextBtn").style.display = win ? "" : "none";
    $("retryBtn").style.display = win ? "none" : "";   // win → just "Next level"; loss → just "Retry"
    $("ov").classList.remove("hidden");
  }

  // ---------- collection ----------
  function readCol() { try { return JSON.parse(localStorage.getItem(COL_KEY)) || {}; } catch (e) { return {}; } }
  function collect(name, emoji) { try { const c = readCol(); c[name] = emoji; localStorage.setItem(COL_KEY, JSON.stringify(c)); } catch (e) {} }
  function buildGallery() {
    const g = $("ovGallery"); if (!g) return; g.innerHTML = ""; const got = readCol();
    E.SUBJECTS.forEach(b => { const c = document.createElement("div"); c.className = "gchip"; if (got[b.name]) { c.classList.add("got"); c.textContent = b.emoji; } else c.textContent = "·"; g.appendChild(c); });
  }

  // ---------- juice ----------
  function popAt(i, level2) { const rect = gridCells[i].getBoundingClientRect(); const cols = ["#5d6b9e", "#3d9bff", "#ff9e3d", "#ff5a4d", "#ff5a4d"]; spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 8 + level2 * 2, cols[level2]); }
  function bloomReveal() {
    litTiles = new Set(Array.from({ length: TILES }, (_, i) => i)); // fog fully lifts
    renderPhoto(true); $("photo").style.filter = "none";
    $("photo").animate([{ filter: "saturate(.6) brightness(.85)" }, { filter: "saturate(1.25) brightness(1.12)" }, { filter: "saturate(1) brightness(1)" }], { duration: 900, easing: "ease" });
    for (let i = 0; i < TILES; i++) if (!p.bedrock[i]) setTimeout(() => gridCells[i].classList.add("open"), (Math.floor(i / N) + i % N) * 22);
  }
  const fx = $("fx"); let fctx, fdpr = 1, parts = [], raf = 0;
  function fxResize() { fdpr = window.devicePixelRatio || 1; fx.width = window.innerWidth * fdpr; fx.height = window.innerHeight * fdpr; fctx = fx.getContext("2d"); }
  function spawnParticles(x, y, n, col) { for (let i = 0; i < n; i++) { const a = Math.random() * 7, sp = 1 + Math.random() * 4; parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, life: 1, col, r: 2 + Math.random() * 3 }); } if (!raf) raf = requestAnimationFrame(tick); }
  function confetti(win) { fxResize(); const cx2 = window.innerWidth / 2, cy2 = window.innerHeight * 0.4; const cols = win ? ["#ffce5c", "#3ddc97", "#3d9bff", "#ff9e3d"] : ["#5d6b9e", "#8b93ad"]; for (let i = 0; i < (win ? 70 : 22); i++) { const a = Math.random() * 7, sp = 2 + Math.random() * 7; parts.push({ x: cx2, y: cy2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, life: 1.4, col: cols[i % cols.length], r: 3 + Math.random() * 4, g: 0.15 }); } if (!raf) raf = requestAnimationFrame(tick); }
  // wipe the ENTIRE backing store each frame (reset transform → clear → restore dpr) so particles never leave trails
  function tick() { fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, fx.width, fx.height); fctx.setTransform(fdpr, 0, 0, fdpr, 0, 0); let alive = false; for (const pt of parts) { if (pt.life <= 0) continue; alive = true; pt.vy += (pt.g || 0.18); pt.x += pt.vx; pt.y += pt.vy; pt.life -= 0.02; fctx.globalAlpha = Math.max(0, pt.life); fctx.fillStyle = pt.col; fctx.beginPath(); fctx.arc(pt.x, pt.y, pt.r, 0, 7); fctx.fill(); } fctx.globalAlpha = 1; parts = parts.filter(pt => pt.life > 0); raf = alive ? requestAnimationFrame(tick) : 0; }

  // ---------- helpers ----------
  function hint(html) { $("how").innerHTML = html; }
  function flash(el) { if (!el) return; el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 400); }
  let toastTimer; function toast(msg) { const t = $("toast"); t.innerHTML = msg.replace(/<[^>]+>/g, ""); t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1700); }

  // ---------- procedural subject art ----------
  function blob(cx, fill, pts) { cx.fillStyle = fill; cx.beginPath(); cx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]); cx.closePath(); cx.fill(); }
  function circle(cx, x, y, r, fill) { cx.fillStyle = fill; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill(); }
  function eye(cx, x, r) { circle(cx, x, 0, r, "#fff"); circle(cx, x, 0, r * 0.55, "#111"); circle(cx, x - r * 0.2, -r * 0.2, r * 0.18, "#fff"); }
  function roundRect(cx, x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); cx.fill(); }
  function catDraw(cx, s) { blob(cx, "#5a4636", [[-s * .55, -s * .55], [-s * .3, -s * .05], [-s * .75, -s * .1]]); blob(cx, "#5a4636", [[s * .55, -s * .55], [s * .3, -s * .05], [s * .75, -s * .1]]); circle(cx, 0, 0, s * .6, "#6b5340"); circle(cx, 0, s * .05, s * .55, "#7a6049"); eye(cx, -s * .22, s * .13); eye(cx, s * .22, s * .13); blob(cx, "#e58a8a", [[0, s * .22], [-s * .08, s * .3], [s * .08, s * .3]]); cx.strokeStyle = "#caa"; cx.lineWidth = s * .03; cx.beginPath(); for (const d of [-1, 1]) { cx.moveTo(d * s * .1, s * .28); cx.lineTo(d * s * .5, s * .2); cx.moveTo(d * s * .1, s * .32); cx.lineTo(d * s * .52, s * .32); } cx.stroke(); }
  function boatDraw(cx, s) { blob(cx, "#fff", [[0, -s * .7], [0, s * .1], [s * .55, s * .1]]); blob(cx, "#e74c3c", [[-s * .1, -s * .6], [-s * .1, s * .05], [-s * .6, s * .05]]); cx.fillStyle = "#6b4a2a"; cx.fillRect(-s * .02, -s * .7, s * .05, s * .85); blob(cx, "#3a2a1a", [[-s * .7, s * .1], [s * .7, s * .1], [s * .5, s * .4], [-s * .5, s * .4]]); }
  function balloonDraw(cx, s) { const g = cx.createRadialGradient(-s * .2, -s * .3, s * .1, 0, 0, s * .7); g.addColorStop(0, "#ffd36b"); g.addColorStop(1, "#e8743b"); cx.fillStyle = g; cx.beginPath(); cx.ellipse(0, -s * .1, s * .55, s * .7, 0, 0, 7); cx.fill(); cx.strokeStyle = "#c85a2a"; cx.lineWidth = s * .04; for (const d of [-.45, 0, .45]) { cx.beginPath(); cx.moveTo(d * s * .7, -s * .1); cx.lineTo(d * s, -s * .1); cx.stroke(); } cx.strokeStyle = "#caa"; cx.lineWidth = s * .02; cx.beginPath(); cx.moveTo(-s * .2, s * .55); cx.lineTo(-s * .3, s * .85); cx.moveTo(s * .2, s * .55); cx.lineTo(s * .3, s * .85); cx.stroke(); cx.fillStyle = "#6b4a2a"; cx.fillRect(-s * .18, s * .55, s * .36, s * .3); }
  function lighthouseDraw(cx, s) { blob(cx, "#eee", [[-s * .25, s * .7], [s * .25, s * .7], [s * .15, -s * .5], [-s * .15, -s * .5]]); cx.fillStyle = "#e74c3c"; cx.fillRect(-s * .2, -s * .2, s * .4, s * .18); cx.fillRect(-s * .18, s * .2, s * .36, s * .16); circle(cx, 0, -s * .5, s * .18, "#ffec99"); cx.fillStyle = "#444"; cx.fillRect(-s * .22, -s * .6, s * .44, s * .1); }
  function mushroomDraw(cx, s) { cx.fillStyle = "#e9d8b8"; cx.beginPath(); cx.ellipse(0, s * .3, s * .28, s * .45, 0, 0, 7); cx.fill(); cx.fillStyle = "#d23b3b"; cx.beginPath(); cx.arc(0, 0, s * .6, Math.PI, 0); cx.fill(); for (const a of [[-.3, -.2, .1], [.2, -.3, .08], [.35, -.1, .07], [-.05, -.4, .06]]) circle(cx, a[0] * s, a[1] * s, a[2] * s, "#fff"); }
  function rocketDraw(cx, s) { blob(cx, "#eee", [[0, -s * .7], [s * .22, -s * .1], [s * .22, s * .4], [-s * .22, s * .4], [-s * .22, -s * .1]]); circle(cx, 0, -s * .1, s * .12, "#5bc0ff"); blob(cx, "#e74c3c", [[s * .22, s * .1], [s * .45, s * .45], [s * .22, s * .4]]); blob(cx, "#e74c3c", [[-s * .22, s * .1], [-s * .45, s * .45], [-s * .22, s * .4]]); blob(cx, "#ff9e3d", [[-s * .12, s * .4], [s * .12, s * .4], [0, s * .7]]); }
  function flowerDraw(cx, s) { for (let i = 0; i < 8; i++) { const a = i / 8 * 7; circle(cx, Math.cos(a) * s * .4, Math.sin(a) * s * .4, s * .2, "#ffd23b"); } circle(cx, 0, 0, s * .26, "#7a4a1a"); cx.fillStyle = "#3a8a2a"; cx.fillRect(-s * .05, s * .4, s * .1, s * .5); }
  function owlDraw(cx, s) { circle(cx, 0, 0, s * .55, "#7a5a3a"); circle(cx, 0, s * .05, s * .5, "#9a7a52"); circle(cx, -s * .2, -s * .05, s * .2, "#fff"); circle(cx, s * .2, -s * .05, s * .2, "#fff"); circle(cx, -s * .2, -s * .05, s * .1, "#222"); circle(cx, s * .2, -s * .05, s * .1, "#222"); blob(cx, "#ff9e3d", [[0, s * .05], [-s * .06, s * .16], [s * .06, s * .16]]); blob(cx, "#7a5a3a", [[-s * .5, -s * .5], [-s * .2, -s * .15], [-s * .55, -s * .1]]); blob(cx, "#7a5a3a", [[s * .5, -s * .5], [s * .2, -s * .15], [s * .55, -s * .1]]); }
  function fishDraw(cx, s) { const g = cx.createLinearGradient(-s, 0, s, 0); g.addColorStop(0, "#ff9e3d"); g.addColorStop(1, "#ffd23b"); cx.fillStyle = g; cx.beginPath(); cx.ellipse(0, 0, s * .5, s * .32, 0, 0, 7); cx.fill(); blob(cx, "#e8743b", [[s * .4, 0], [s * .7, -s * .25], [s * .7, s * .25]]); circle(cx, -s * .25, -s * .05, s * .09, "#fff"); circle(cx, -s * .25, -s * .05, s * .045, "#111"); cx.strokeStyle = "#e8743b"; cx.lineWidth = s * .04; for (const x of [-.05, .1, .25]) { cx.beginPath(); cx.moveTo(x * s, -s * .25); cx.lineTo(x * s, s * .25); cx.stroke(); } }
  function cactusDraw(cx, s) { cx.fillStyle = "#3a8a4a"; roundRect(cx, -s * .15, -s * .5, s * .3, s * 1, s * .15); roundRect(cx, -s * .5, -s * .1, s * .35, s * .2, s * .1); roundRect(cx, -s * .5, -s * .3, s * .2, s * .25, s * .1); roundRect(cx, s * .15, 0, s * .35, s * .2, s * .1); roundRect(cx, s * .3, -s * .25, s * .2, s * .25, s * .1); for (const a of [[-.3, .1], [.3, .05], [0, -.2], [0, .3]]) circle(cx, a[0] * s, a[1] * s, s * .06, "#ffd23b"); }
  function whaleDraw(cx, s) { cx.fillStyle = "#5b9bd5"; cx.beginPath(); cx.ellipse(0, 0, s * .55, s * .35, 0, 0, 7); cx.fill(); blob(cx, "#5b9bd5", [[-s * .45, 0], [-s * .75, -s * .25], [-s * .75, s * .25]]); cx.fillStyle = "#cfe6ff"; cx.beginPath(); cx.ellipse(s * .05, s * .12, s * .4, s * .18, 0, 0, 7); cx.fill(); circle(cx, s * .3, -s * .08, s * .06, "#111"); cx.strokeStyle = "#cfe6ff"; cx.lineWidth = s * .05; cx.beginPath(); cx.moveTo(s * .2, -s * .3); cx.quadraticCurveTo(s * .3, -s * .6, s * .4, -s * .45); cx.stroke(); }
  function strawberryDraw(cx, s) { blob(cx, "#e23b4b", [[0, s * .6], [s * .45, -s * .1], [s * .2, -s * .4], [-s * .2, -s * .4], [-s * .45, -s * .1]]); for (let i = -1; i <= 1; i++) blob(cx, "#3a8a3a", [[i * s * .18, -s * .4], [i * s * .18 - s * .1, -s * .55], [i * s * .18 + s * .1, -s * .55]]); for (let i = 0; i < 10; i++) circle(cx, (i % 3 - 1) * s * .22 + ((i * 37) % 5 - 2) * s * .04, (Math.floor(i / 3) - 1) * s * .22 + s * .05, s * .035, "#ffe17a"); }
  function starDraw(cx, s) { const pts = []; for (let i = 0; i < 5; i++) { const oa = -Math.PI / 2 + i * 2 * Math.PI / 5, ia = oa + Math.PI / 5; pts.push([Math.cos(oa) * s * .7, Math.sin(oa) * s * .7]); pts.push([Math.cos(ia) * s * .3, Math.sin(ia) * s * .3]); } blob(cx, "#ffd23b", pts); cx.strokeStyle = "#e9a92e"; cx.lineWidth = s * .06; cx.lineJoin = "round"; cx.beginPath(); cx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]); cx.closePath(); cx.stroke(); circle(cx, 0, 0, s * .16, "#e9a92e"); }
  function moonDraw(cx, s) { cx.fillStyle = "#f6e3a8"; cx.beginPath(); cx.arc(0, 0, s * .55, Math.PI * .35, Math.PI * 1.65, false); cx.arc(s * .35, 0, s * .5, Math.PI * 1.4, Math.PI * .6, true); cx.closePath(); cx.fill(); circle(cx, s * .5, -s * .5, s * .07, "#f5c542"); circle(cx, s * .58, -s * .18, s * .05, "#f5c542"); }
  function sunDraw(cx, s) { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, nx = Math.cos(a), ny = Math.sin(a), px = -Math.sin(a), py = Math.cos(a); blob(cx, "#ffb300", [[nx * s * .7, ny * s * .7], [nx * s * .42 + px * s * .16, ny * s * .42 + py * s * .16], [nx * s * .42 - px * s * .16, ny * s * .42 - py * s * .16]]); } circle(cx, 0, 0, s * .42, "#ffce3b"); }
  function cloudDraw(cx, s) { cx.fillStyle = "#eef3fb"; roundRect(cx, -s * .6, s * .05, s * 1.2, s * .3, s * .15); circle(cx, -s * .3, s * .02, s * .28, "#eef3fb"); circle(cx, s * .02, -s * .1, s * .38, "#eef3fb"); circle(cx, s * .34, s * .0, s * .3, "#eef3fb"); }
  function umbrellaDraw(cx, s) { cx.strokeStyle = "#3a2a1a"; cx.lineWidth = s * .06; cx.beginPath(); cx.moveTo(0, -s * .05); cx.lineTo(0, s * .5); cx.stroke(); cx.strokeStyle = "#3a2a1a"; cx.lineWidth = s * .05; cx.beginPath(); cx.moveTo(0, s * .5); cx.arc(-s * .12, s * .5, s * .12, 0, Math.PI); cx.stroke(); cx.fillStyle = "#e74c3c"; cx.beginPath(); cx.arc(0, 0, s * .6, Math.PI, 0); cx.closePath(); cx.fill(); cx.fillStyle = "#e74c3c"; cx.beginPath(); cx.moveTo(-s * .6, 0); for (const x of [-.4, -.2, 0, .2, .4, .6]) { cx.quadraticCurveTo((x * s - s * .1), s * .12, x * s, 0); } cx.closePath(); cx.fill(); cx.fillStyle = "#f28b7d"; for (const x of [-.4, 0, .4]) { cx.beginPath(); cx.moveTo(x * s - s * .1, -s * .01); cx.quadraticCurveTo(x * s, s * .1, x * s + s * .1, -s * .01); cx.lineTo(x * s, -s * .3); cx.closePath(); cx.fill(); } circle(cx, 0, -s * .6, s * .05, "#3a2a1a"); }
  function iceCreamDraw(cx, s) { blob(cx, "#d9a441", [[-s * .32, -s * .05], [s * .32, -s * .05], [0, s * .65]]); cx.strokeStyle = "#b5842f"; cx.lineWidth = s * .028; cx.beginPath(); cx.moveTo(-s * .2, s * .16); cx.lineTo(s * .2, s * .16); cx.stroke(); cx.beginPath(); cx.moveTo(-s * .12, s * .38); cx.lineTo(s * .12, s * .38); cx.stroke(); cx.beginPath(); cx.moveTo(-s * .1, -s * .02); cx.lineTo(s * .12, s * .55); cx.stroke(); cx.beginPath(); cx.moveTo(s * .1, -s * .02); cx.lineTo(-s * .12, s * .55); cx.stroke(); circle(cx, 0, -s * .12, s * .34, "#fff3d8"); circle(cx, 0, -s * .4, s * .3, "#f4a6c0"); }
  function ghostDraw(cx, s) { cx.fillStyle = "#eef2ff"; cx.beginPath(); cx.arc(0, -s * .05, s * .5, Math.PI, 0); cx.lineTo(s * .5, s * .25); cx.quadraticCurveTo(s * .42, s * .55, s * .28, s * .3); cx.quadraticCurveTo(s * .16, s * .1, s * .05, s * .35); cx.quadraticCurveTo(-s * .05, s * .58, -s * .16, s * .32); cx.quadraticCurveTo(-s * .28, s * .08, -s * .38, s * .38); cx.quadraticCurveTo(-s * .46, s * .5, -s * .5, s * .25); cx.closePath(); cx.fill(); cx.fillStyle = "#222839"; cx.beginPath(); cx.ellipse(-s * .17, -s * .1, s * .07, s * .11, 0, 0, 7); cx.fill(); cx.beginPath(); cx.ellipse(s * .17, -s * .1, s * .07, s * .11, 0, 0, 7); cx.fill(); cx.beginPath(); cx.ellipse(0, s * .13, s * .06, s * .08, 0, 0, 7); cx.fill(); }
  function snowmanDraw(cx, s) { circle(cx, 0, s * .28, s * .36, "#eef4fb"); circle(cx, 0, -s * .22, s * .26, "#eef4fb"); cx.fillStyle = "#222"; cx.beginPath(); cx.rect(-s * .3, -s * .48, s * .6, s * .07); cx.fill(); cx.beginPath(); cx.rect(-s * .17, -s * .68, s * .34, s * .22); cx.fill(); circle(cx, -s * .1, -s * .26, s * .045, "#222"); circle(cx, s * .1, -s * .26, s * .045, "#222"); blob(cx, "#f5a623", [[0, -s * .18], [s * .16, -s * .15], [0, -s * .1]]); circle(cx, 0, s * .12, s * .04, "#222"); circle(cx, 0, s * .3, s * .045, "#222"); circle(cx, 0, s * .46, s * .045, "#222"); }
  function butterflyDraw(cx, s) { for (const dx of [-1, 1]) { cx.fillStyle = "#8b7bff"; cx.beginPath(); cx.ellipse(dx * s * .26, -s * .2, s * .28, s * .26, dx * .5, 0, 7); cx.fill(); cx.fillStyle = "#7a68f0"; cx.beginPath(); cx.ellipse(dx * s * .22, s * .24, s * .2, s * .18, -dx * .45, 0, 7); cx.fill(); circle(cx, dx * s * .34, -s * .22, s * .06, "#c9c0ff"); } cx.fillStyle = "#241f38"; cx.beginPath(); cx.ellipse(0, 0, s * .06, s * .4, 0, 0, 7); cx.fill(); circle(cx, 0, -s * .4, s * .085, "#241f38"); cx.strokeStyle = "#241f38"; cx.lineWidth = s * .028; for (const dx of [-1, 1]) { cx.beginPath(); cx.moveTo(0, -s * .46); cx.quadraticCurveTo(dx * s * .13, -s * .66, dx * s * .2, -s * .58); cx.stroke(); circle(cx, dx * s * .2, -s * .58, s * .03, "#241f38"); } }
  function crownDraw(cx, s) { blob(cx, "#ffd23b", [[-s * .58, s * .32], [s * .58, s * .32], [s * .58, -s * .05], [s * .33, -s * .42], [s * .12, -s * .12], [0, -s * .45], [-s * .12, -s * .12], [-s * .33, -s * .42], [-s * .58, -s * .05]]); circle(cx, -s * .33, -s * .42, s * .075, "#58cfe0"); circle(cx, 0, -s * .45, s * .075, "#e0584e"); circle(cx, s * .33, -s * .42, s * .075, "#58cfe0"); circle(cx, -s * .22, s * .12, s * .07, "#e0584e"); circle(cx, s * .22, s * .12, s * .07, "#58cfe0"); }
  function anchorDraw(cx, s) { cx.strokeStyle = "#b9c2d0"; cx.fillStyle = "#b9c2d0"; cx.lineWidth = s * .12; cx.lineCap = "round"; cx.lineJoin = "round"; cx.beginPath(); cx.arc(0, -s * .5, s * .13, 0, 7); cx.stroke(); cx.beginPath(); cx.moveTo(0, -s * .37); cx.lineTo(0, s * .5); cx.stroke(); cx.beginPath(); cx.moveTo(-s * .38, -s * .18); cx.lineTo(s * .38, -s * .18); cx.stroke(); cx.beginPath(); cx.moveTo(0, s * .5); cx.quadraticCurveTo(-s * .5, s * .5, -s * .5, -s * .02); cx.stroke(); cx.beginPath(); cx.moveTo(0, s * .5); cx.quadraticCurveTo(s * .5, s * .5, s * .5, -s * .02); cx.stroke(); blob(cx, "#b9c2d0", [[-s * .5, -s * .16], [-s * .62, s * .12], [-s * .34, s * .06]]); blob(cx, "#b9c2d0", [[s * .5, -s * .16], [s * .62, s * .12], [s * .34, s * .06]]); }
  function birdDraw(cx, s) { cx.fillStyle = "#5aa9e0"; cx.beginPath(); cx.ellipse(-s * .08, s * .1, s * .42, s * .38, 0, 0, 7); cx.fill(); cx.fillStyle = "#5aa9e0"; cx.beginPath(); cx.arc(s * .28, -s * .22, s * .26, 0, 7); cx.fill(); cx.fillStyle = "#bfe0f5"; cx.beginPath(); cx.ellipse(-s * .05, s * .22, s * .24, s * .22, 0, 0, 7); cx.fill(); blob(cx, "#f5a623", [[s * .5, -s * .24], [s * .74, -s * .16], [s * .5, -s * .08]]); blob(cx, "#3f8fce", [[-s * .18, -s * .02], [-s * .42, s * .06], [-s * .1, s * .28]]); eye(cx, s * .34, s * .055); }
  function heartDraw(cx, s) { cx.fillStyle = "#e0584e"; cx.beginPath(); cx.moveTo(0, -s * .18); cx.bezierCurveTo(s * .18, -s * .5, s * .62, -s * .38, s * .58, -s * .02); cx.bezierCurveTo(s * .54, s * .28, s * .2, s * .42, 0, s * .6); cx.bezierCurveTo(-s * .2, s * .42, -s * .54, s * .28, -s * .58, -s * .02); cx.bezierCurveTo(-s * .62, -s * .38, -s * .18, -s * .5, 0, -s * .18); cx.closePath(); cx.fill(); blob(cx, "#c23d4a", [[0, s * .6], [s * .26, s * .3], [-s * .26, s * .3]]); cx.fillStyle = "#fff"; cx.globalAlpha = .5; cx.beginPath(); cx.ellipse(-s * .28, -s * .2, s * .1, s * .16, -Math.PI / 5, 0, 7); cx.fill(); cx.globalAlpha = 1; }
  function appleDraw(cx, s) { circle(cx, -s * .2, s * .1, s * .42, "#e0584e"); circle(cx, s * .2, s * .1, s * .42, "#e0584e"); circle(cx, 0, s * .22, s * .44, "#e0584e"); circle(cx, -s * .22, -s * .12, s * .14, "#ef8078"); cx.fillStyle = "#5a3a1a"; cx.beginPath(); cx.moveTo(-s * .05, -s * .28); cx.lineTo(s * .05, -s * .28); cx.lineTo(s * .06, -s * .55); cx.lineTo(-s * .04, -s * .55); cx.closePath(); cx.fill(); blob(cx, "#5ba63a", [[s * .06, -s * .46], [s * .42, -s * .58], [s * .3, -s * .3]]); }
  function treeDraw(cx, s) { cx.fillStyle = "#6b4a2a"; cx.beginPath(); cx.rect(-s * .1, s * .3, s * .2, s * .42); cx.fill(); circle(cx, 0, s * .05, s * .32, "#3a8a3a"); circle(cx, -s * .3, -s * .12, s * .26, "#4a9a4a"); circle(cx, s * .3, -s * .12, s * .26, "#4a9a4a"); circle(cx, 0, -s * .38, s * .28, "#4a9a4a"); circle(cx, -s * .12, -s * .15, s * .2, "#5aaa5a"); }
  function beeDraw(cx, s) { cx.fillStyle = "#eef3fb"; cx.beginPath(); cx.ellipse(-s * .12, -s * .28, s * .26, s * .16, -.5, 0, 7); cx.fill(); cx.beginPath(); cx.ellipse(s * .12, -s * .28, s * .22, s * .14, .5, 0, 7); cx.fill(); cx.fillStyle = "#ffce3b"; cx.beginPath(); cx.ellipse(-s * .05, 0, s * .5, s * .3, 0, 0, 7); cx.fill(); cx.fillStyle = "#241f1a"; for (const x of [-.28, -.02, .24]) { cx.beginPath(); cx.ellipse(x * s, 0, s * .07, s * .29, 0, 0, 7); cx.fill(); } blob(cx, "#241f1a", [[-s * .5, 0], [-s * .68, -s * .16], [-s * .68, s * .16]]); circle(cx, s * .52, 0, s * .2, "#241f1a"); circle(cx, s * .58, -s * .05, s * .06, "#fff"); circle(cx, s * .59, -s * .04, s * .03, "#111"); }
  function cherryDraw(cx, s) { cx.strokeStyle = "#6b4a2a"; cx.lineWidth = s * .06; cx.lineCap = "round"; cx.beginPath(); cx.moveTo(0, -s * .62); cx.quadraticCurveTo(-s * .32, -s * .35, -s * .34, s * .12); cx.stroke(); cx.beginPath(); cx.moveTo(0, -s * .62); cx.quadraticCurveTo(s * .32, -s * .35, s * .34, s * .12); cx.stroke(); blob(cx, "#5ba63a", [[0, -s * .62], [s * .3, -s * .72], [s * .34, -s * .46], [s * .06, -s * .5]]); circle(cx, -s * .34, s * .34, s * .3, "#e0584e"); circle(cx, s * .34, s * .34, s * .3, "#e0584e"); circle(cx, -s * .44, s * .24, s * .09, "#f2938c"); circle(cx, s * .24, s * .24, s * .09, "#f2938c"); }
  function cupcakeDraw(cx, s) { blob(cx, "#d9a441", [[-s * .38, s * .1], [s * .38, s * .1], [s * .28, s * .58], [-s * .28, s * .58]]); cx.strokeStyle = "#b8862f"; cx.lineWidth = s * .04; cx.lineCap = "round"; for (const x of [-.15, 0, .15]) { cx.beginPath(); cx.moveTo(x * s, s * .13); cx.lineTo(x * s * .78, s * .55); cx.stroke(); } blob(cx, "#f4a6c0", [[-s * .44, s * .12], [s * .44, s * .12], [s * .36, -s * .04], [-s * .36, -s * .04]]); circle(cx, -s * .22, -s * .08, s * .2, "#f4a6c0"); circle(cx, s * .22, -s * .1, s * .2, "#f4a6c0"); circle(cx, 0, -s * .32, s * .22, "#f4a6c0"); circle(cx, 0, -s * .5, s * .1, "#e23c4e"); }
  function bellDraw(cx, s) { cx.strokeStyle = "#d99a1f"; cx.lineWidth = s * .07; cx.beginPath(); cx.arc(0, -s * .58, s * .11, Math.PI, 2 * Math.PI); cx.stroke(); blob(cx, "#ffce3b", [[-s * .16, -s * .48], [s * .16, -s * .48], [s * .34, s * .22], [s * .5, s * .34], [-s * .5, s * .34], [-s * .34, s * .22]]); cx.fillStyle = "#e9a92e"; cx.beginPath(); cx.rect(-s * .5, s * .3, s, s * .12); cx.fill(); cx.strokeStyle = "#d99a1f"; cx.lineWidth = s * .04; cx.lineJoin = "round"; cx.beginPath(); cx.moveTo(-s * .16, -s * .48); cx.lineTo(s * .16, -s * .48); cx.lineTo(s * .34, s * .22); cx.lineTo(s * .5, s * .34); cx.lineTo(-s * .5, s * .34); cx.lineTo(-s * .34, s * .22); cx.closePath(); cx.stroke(); circle(cx, 0, s * .5, s * .1, "#e9a92e"); }
  function keyDraw(cx, s) { cx.strokeStyle = "#ffce3b"; cx.lineWidth = s * .14; cx.lineCap = "round"; cx.beginPath(); cx.arc(0, -s * .42, s * .26, 0, 7); cx.stroke(); cx.beginPath(); cx.moveTo(0, -s * .16); cx.lineTo(0, s * .58); cx.stroke(); cx.fillStyle = "#ffce3b"; cx.fillRect(0, s * .3, s * .26, s * .1); cx.fillRect(0, s * .48, s * .18, s * .1); circle(cx, 0, -s * .42, s * .1, "#e8a72b"); }
  function crabDraw(cx, s) { blob(cx, "#e35b4a", [[-s * .5, s * .05], [-s * .42, -s * .2], [-s * .18, -s * .32], [s * .18, -s * .32], [s * .42, -s * .2], [s * .5, s * .05], [s * .34, s * .28], [0, s * .36], [-s * .34, s * .28]]); cx.strokeStyle = "#c84636"; cx.lineWidth = s * .06; cx.lineCap = "round"; for (const dir of [-1, 1]) { for (const ly of [.06, .18, .3]) { cx.beginPath(); cx.moveTo(dir * s * .32, ly * s); cx.lineTo(dir * s * .58, (ly + .08) * s); cx.stroke(); } } for (const dir of [-1, 1]) { cx.strokeStyle = "#e35b4a"; cx.lineWidth = s * .12; cx.lineCap = "round"; cx.beginPath(); cx.moveTo(dir * s * .4, -s * .12); cx.lineTo(dir * s * .62, -s * .34); cx.stroke(); circle(cx, dir * s * .66, -s * .4, s * .16, "#e35b4a"); blob(cx, "#c84636", [[dir * s * .66, -s * .4], [dir * s * .82, -s * .5], [dir * s * .8, -s * .38]]); } for (const dir of [-1, 1]) { cx.strokeStyle = "#c84636"; cx.lineWidth = s * .05; cx.lineCap = "round"; cx.beginPath(); cx.moveTo(dir * s * .12, -s * .3); cx.lineTo(dir * s * .14, -s * .46); cx.stroke(); circle(cx, dir * s * .14, -s * .5, s * .07, "#fff"); circle(cx, dir * s * .14, -s * .5, s * .035, "#111"); } }
  function turtleDraw(cx, s) { cx.fillStyle = "#4a8f30"; for (const x of [-.34, -.1, .14, .38]) { cx.beginPath(); cx.ellipse(x * s, s * .34, s * .08, s * .12, 0, 0, 7); cx.fill(); } circle(cx, s * .52, s * .06, s * .15, "#5ba63a"); circle(cx, s * .6, s * .02, s * .035, "#111"); cx.fillStyle = "#5ba63a"; cx.beginPath(); cx.ellipse(-s * .05, s * .12, s * .5, s * .4, 0, Math.PI, 0); cx.fill(); cx.beginPath(); cx.rect(-s * .55, s * .1, s * 1, s * .06); cx.fill(); blob(cx, "#3a7a2a", [[-s * .28, s * .05], [-s * .12, -s * .04], [-s * .04, s * .05], [-s * .12, s * .12]]); blob(cx, "#3a7a2a", [[s * .02, -s * .12], [s * .18, -s * .18], [s * .26, -s * .06], [s * .18, s * .02], [s * .02, s * .0]]); blob(cx, "#3a7a2a", [[-s * .02, s * .04], [s * .12, s * .02], [s * .16, s * .12], [s * .0, s * .13]]); }
  function duckDraw(cx, s) { circle(cx, s * .08, s * .18, s * .38, "#ffd23b"); circle(cx, -s * .26, -s * .26, s * .26, "#ffd23b"); blob(cx, "#f5a623", [[-s * .5, -s * .28], [-s * .72, -s * .32], [-s * .5, -s * .16]]); circle(cx, -s * .34, -s * .32, s * .05, "#222"); blob(cx, "#f2c02e", [[-s * .05, s * .08], [s * .32, s * .02], [s * .1, s * .3]]); }
  function robotDraw(cx, s) { cx.strokeStyle = "#9098a6"; cx.lineWidth = s * .045; cx.beginPath(); cx.moveTo(0, -s * .42); cx.lineTo(0, -s * .62); cx.stroke(); circle(cx, 0, -s * .66, s * .07, "#e0584e"); cx.fillStyle = "#aeb6c4"; roundRect(cx, -s * .45, -s * .42, s * .9, s * .86, s * .18); circle(cx, -s * .19, -s * .06, s * .13, "#5bc0ff"); circle(cx, s * .19, -s * .06, s * .13, "#5bc0ff"); circle(cx, -s * .19, -s * .06, s * .06, "#e8f7ff"); circle(cx, s * .19, -s * .06, s * .06, "#e8f7ff"); cx.strokeStyle = "#5a6472"; cx.lineWidth = s * .04; cx.lineCap = "round"; for (const x of [-.14, 0, .14]) { cx.beginPath(); cx.moveTo(x * s, s * .18); cx.lineTo(x * s, s * .32); cx.stroke(); } }
  function pumpkinDraw(cx, s) { cx.fillStyle = "#5ba63a"; cx.beginPath(); cx.rect(-s * .07, -s * .62, s * .14, s * .2); cx.fill(); cx.fillStyle = "#ef8a2a"; cx.beginPath(); cx.ellipse(-s * .28, s * .04, s * .28, s * .42, 0, 0, 7); cx.fill(); cx.beginPath(); cx.ellipse(s * .28, s * .04, s * .28, s * .42, 0, 0, 7); cx.fill(); cx.beginPath(); cx.ellipse(0, s * .04, s * .5, s * .46, 0, 0, 7); cx.fill(); cx.strokeStyle = "#cf6f1a"; cx.lineWidth = s * .045; cx.lineCap = "round"; for (const x of [-.24, 0, .24]) { cx.beginPath(); cx.moveTo(x * s, -s * .4); cx.quadraticCurveTo(x * s * 1.35, s * .04, x * s, s * .46); cx.stroke(); } }
  function diamondDraw(cx, s) { blob(cx, "#58cfe0", [[-s * .32, -s * .3], [s * .32, -s * .3], [s * .5, -s * .12], [0, s * .55], [-s * .5, -s * .12]]); cx.strokeStyle = "#a6ecf5"; cx.lineWidth = s * .045; cx.lineJoin = "round"; cx.lineCap = "round"; cx.beginPath(); cx.moveTo(-s * .5, -s * .12); cx.lineTo(s * .5, -s * .12); cx.stroke(); cx.beginPath(); cx.moveTo(-s * .32, -s * .3); cx.lineTo(-s * .5, -s * .12); cx.stroke(); cx.beginPath(); cx.moveTo(s * .32, -s * .3); cx.lineTo(s * .5, -s * .12); cx.stroke(); cx.beginPath(); cx.moveTo(-s * .5, -s * .12); cx.lineTo(0, s * .55); cx.stroke(); cx.beginPath(); cx.moveTo(s * .5, -s * .12); cx.lineTo(0, s * .55); cx.stroke(); cx.beginPath(); cx.moveTo(-s * .32, -s * .3); cx.lineTo(0, s * .55); cx.stroke(); cx.beginPath(); cx.moveTo(s * .32, -s * .3); cx.lineTo(0, s * .55); cx.stroke(); blob(cx, "#ffffff", [[-s * .18, -s * .25], [-s * .04, -s * .25], [-s * .1, -s * .15]]); circle(cx, s * .16, -s * .02, s * .05, "#ffffff"); }
  function houseDraw(cx, s) { cx.fillStyle = "#e9d8b8"; roundRect(cx, -s * .42, -s * .12, s * .84, s * .74, s * .04); blob(cx, "#d0503f", [[-s * .56, -s * .12], [0, -s * .68], [s * .56, -s * .12]]); cx.fillStyle = "#6b4a2a"; roundRect(cx, -s * .12, s * .18, s * .24, s * .44, s * .03); circle(cx, s * .06, s * .4, s * .028, "#e9d8b8"); cx.fillStyle = "#5bc0ff"; roundRect(cx, s * .16, s * .04, s * .2, s * .2, s * .02); cx.strokeStyle = "#e9d8b8"; cx.lineWidth = s * .035; cx.beginPath(); cx.moveTo(s * .26, s * .04); cx.lineTo(s * .26, s * .24); cx.moveTo(s * .16, s * .14); cx.lineTo(s * .36, s * .14); cx.stroke(); }
  function carDraw(cx, s) { blob(cx, "#e0584e", [[-s * .62, s * .1], [-s * .58, -s * .1], [s * .58, -s * .1], [s * .62, s * .1], [s * .55, s * .28], [-s * .55, s * .28]]); blob(cx, "#f08276", [[-s * .3, -s * .1], [-s * .16, -s * .42], [s * .24, -s * .42], [s * .34, -s * .1]]); blob(cx, "#bfe0f5", [[-s * .2, -s * .12], [-s * .1, -s * .34], [s * .18, -s * .34], [s * .24, -s * .12]]); circle(cx, -s * .34, s * .3, s * .16, "#222"); circle(cx, s * .34, s * .3, s * .16, "#222"); circle(cx, -s * .34, s * .3, s * .07, "#b8bdc4"); circle(cx, s * .34, s * .3, s * .07, "#b8bdc4"); circle(cx, s * .56, s * .02, s * .06, "#ffe98a"); }
  Object.assign(DRAW, {
    "Cat": catDraw, "Sailboat": boatDraw, "Hot-air Balloon": balloonDraw, "Lighthouse": lighthouseDraw, "Mushroom": mushroomDraw, "Rocket": rocketDraw, "Flower": flowerDraw, "Owl": owlDraw, "Fish": fishDraw, "Cactus": cactusDraw, "Whale": whaleDraw, "Strawberry": strawberryDraw, "Star": starDraw, "Moon": moonDraw, "Sun": sunDraw, "Cloud": cloudDraw, "Umbrella": umbrellaDraw, "Ice Cream": iceCreamDraw, "Ghost": ghostDraw, "Snowman": snowmanDraw, "Butterfly": butterflyDraw, "Crown": crownDraw, "Anchor": anchorDraw, "Bird": birdDraw,
    "Heart": heartDraw, "Apple": appleDraw, "Tree": treeDraw, "Bee": beeDraw, "Cherry": cherryDraw, "Cupcake": cupcakeDraw, "Bell": bellDraw, "Key": keyDraw, "Crab": crabDraw, "Turtle": turtleDraw, "Duck": duckDraw, "Robot": robotDraw, "Pumpkin": pumpkinDraw, "Diamond": diamondDraw, "House": houseDraw, "Car": carDraw,
  });
  try { window.__DRAW = DRAW; window.__ex = { showResult: showResult, startLevel: startLevel, cur: function () { return p; } }; } catch (e) {}

  // ---------- one-time VISUAL intros for new mechanics (Royal-Match style: show, don't tell) ----------
  function seenSet() { try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || {}; } catch (e) { return {}; } }
  function markSeen(k) { try { const s = seenSet(); s[k] = 1; localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (e) {} }
  const DOTCOLS = ["#5d6b9e", "#3d9bff", "#ff9e3d", "#ff5a4d", "#ff5a4d"];
  function panel(g, w, h, c) { const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, c || "#1c2b4a"); grd.addColorStop(1, "#0e1524"); g.fillStyle = grd; roundRect(g, 3, 3, w - 6, h - 6, 16); }
  function miniDot(g, x, y, r, lvl) { g.save(); g.fillStyle = DOTCOLS[lvl]; g.shadowColor = DOTCOLS[lvl]; g.shadowBlur = r; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore(); }
  function miniTile(g, x, y, s, rock) { g.fillStyle = rock ? "#3c3f49" : "#222839"; roundRect(g, x, y, s, s, 8); }
  const INTROS = {
    multi: { title: "Two Buried!", blurb: "Find and name BOTH.", viz(g, w, h) { panel(g, w, h); drawSubjectTo(g, "Cat", w * 0.34, h * 0.54, h * 0.26, false); drawSubjectTo(g, "Rocket", w * 0.66, h * 0.54, h * 0.26, false); } },
    silhouette: { title: "Shadows", blurb: "Name it by its shape alone.", viz(g, w, h) { panel(g, w, h, "#3f6f9e"); drawSubjectTo(g, "Owl", w * 0.5, h * 0.54, h * 0.34, true); } },
    fog: { title: "Fog", blurb: "Heat is hidden — dig to reveal it.", viz(g, w, h) { panel(g, w, h, "#141a2c"); const n = 4, m = h * 0.78, cell = m / n, ox = (w - m) / 2, oy = (h - m) / 2, lit = { "0,0": 3, "1,0": 2, "0,1": 2, "1,1": 4 }; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { miniTile(g, ox + c * cell + 3, oy + r * cell + 3, cell - 6); const k = c + "," + r; if (lit[k] != null) miniDot(g, ox + c * cell + cell / 2, oy + r * cell + cell / 2, cell * 0.15, lit[k]); } } },
    bedrock: { title: "Bedrock", blurb: "Grey stone can't be dug.", viz(g, w, h) { panel(g, w, h, "#141a2c"); const s = h * 0.46, y = (h - s) / 2; miniTile(g, w * 0.3 - s / 2, y, s); miniDot(g, w * 0.3, y + s / 2, s * 0.16, 3); miniTile(g, w * 0.62 - s / 2, y, s, true); g.fillStyle = "#4c505b"; g.beginPath(); g.arc(w * 0.62, y + s / 2, s * 0.22, 0, 7); g.fill(); } },
    decoy: {
      title: "Fake Heat", blurb: "Looks warm — but nothing's there.",
      viz(g, w, h) {
        panel(g, w, h, "#141a2c");
        const s = h * 0.46, y = (h - s) / 2, ay = h * 0.5;
        miniTile(g, w * 0.27 - s / 2, y, s); miniDot(g, w * 0.27, ay, s * 0.2, 2);   // a warm-looking dot
        g.strokeStyle = "#8b93ad"; g.lineWidth = 3; g.lineCap = "round"; const ax = w * 0.5;   // "dig" arrow
        g.beginPath(); g.moveTo(ax - 15, ay); g.lineTo(ax + 15, ay); g.moveTo(ax + 6, ay - 7); g.lineTo(ax + 15, ay); g.lineTo(ax + 6, ay + 7); g.stroke();
        g.fillStyle = "#0b0c10"; roundRect(g, w * 0.73 - s / 2, y, s, s, 8);          // dug → empty hole
        g.strokeStyle = "#ff5a4d"; g.lineWidth = 3.5; const cx0 = w * 0.73, r = s * 0.17;
        g.beginPath(); g.moveTo(cx0 - r, ay - r); g.lineTo(cx0 + r, ay + r); g.moveTo(cx0 + r, ay - r); g.lineTo(cx0 - r, ay + r); g.stroke();
      },
    },
    blur: { title: "Blurry Dig", blurb: "Each dig sharpens the picture.", viz(g, w, h) { panel(g, w, h); g.save(); g.filter = "blur(3px)"; drawSubjectTo(g, "Flower", w * 0.5, h * 0.54, h * 0.34, false); g.restore(); } },
  };
  function showIntro(key) {
    const meta = INTROS[key]; if (!meta) return;
    const cv = $("introViz"), dpr = 2; cv.width = 260 * dpr; cv.height = 150 * dpr;
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    meta.viz(g, 260, 150);
    $("introTitle").textContent = meta.title; $("introBlurb").textContent = meta.blurb;
    $("intro").classList.remove("hidden");
  }
  function maybeIntro() {
    const active = [];
    if (p.subjects.length > 1) active.push("multi");
    if (p.silhouette) active.push("silhouette");
    if (p.fog) active.push("fog");
    if (p.bedrock.some(Boolean)) active.push("bedrock");
    if ((p.mods.decoy || 0) > 0) active.push("decoy");
    if (p.blur) active.push("blur");
    const seen = seenSet();
    const k = active.find(x => !seen[x]);
    if (k) { markSeen(k); showIntro(k); }
  }

  // ---------- collection screen (see what you've found, grouped by rarity) ----------
  function openCollection() {
    const got = readCol(), body = $("collBody"); body.innerHTML = "";
    $("collCount").textContent = E.SUBJECTS.filter(s => got[s.name]).length + " / " + E.subjectCount;
    for (let t = 1; t <= 5; t++) {
      const r = E.RARITY[t - 1];
      const sec = document.createElement("div"); sec.className = "collsec";
      const h = document.createElement("div"); h.className = "collsec-h"; h.textContent = r.name; h.style.color = r.color; sec.appendChild(h);
      const grid = document.createElement("div"); grid.className = "collgrid";
      E.SUBJECTS.filter(s => s.tier === t).forEach(s => {
        const cell = document.createElement("div"); cell.className = "collcell";
        if (got[s.name]) {
          const cv = document.createElement("canvas"); cv.width = 120; cv.height = 120; cv.className = "collart";
          const g = cv.getContext("2d");
          const grad = g.createLinearGradient(0, 0, 0, 120); grad.addColorStop(0, s.sky[0]); grad.addColorStop(1, s.sky[1]); g.fillStyle = grad; g.fillRect(0, 0, 120, 120);
          g.save(); g.translate(60, 60); (DRAW[s.name] || function () {})(g, 40); g.restore();
          cell.appendChild(cv);
          const nm = document.createElement("div"); nm.className = "collname"; nm.textContent = s.name; cell.appendChild(nm);
        } else {
          cell.classList.add("locked");
          const q = document.createElement("div"); q.className = "collq"; q.textContent = "?"; cell.appendChild(q);
          const nm = document.createElement("div"); nm.className = "collname"; nm.textContent = "?????"; cell.appendChild(nm);
        }
        grid.appendChild(cell);
      });
      sec.appendChild(grid); body.appendChild(sec);
    }
    $("collscreen").classList.remove("hidden");
  }

  // ---------- wiring ----------
  const cardEl = $("ov");
  $("guessBtn").addEventListener("click", doGuess);
  $("introBtn").addEventListener("click", () => $("intro").classList.add("hidden"));
  $("colBtn").addEventListener("click", openCollection);
  $("collClose").addEventListener("click", () => $("collscreen").classList.add("hidden"));
  $("nextBtn").addEventListener("click", () => { cardEl.classList.add("hidden"); setTimeout(() => startLevel(level + 1), 260); });
  $("retryBtn").addEventListener("click", () => { cardEl.classList.add("hidden"); setTimeout(() => startLevel(level), 260); });
  let rt; window.addEventListener("resize", () => { fxResize(); clearTimeout(rt); rt = setTimeout(() => { if (cx) renderPhoto(finished && won); }, 200); });

  function boot() { fxResize(); startLevel(loadProg().level || 1); }
  if (document.readyState === "complete" || document.readyState === "interactive") boot();
  else window.addEventListener("load", boot);
})();
