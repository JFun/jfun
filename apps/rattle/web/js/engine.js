/* RATTLE — engine (pure, deterministic, browser + Node).

   Toon Blast with the grid ripped out: a vessel of rigid colored beads (Verlet
   circles + spatial hash). Tap a touching same-colour cluster of ≥2 → it pops,
   everything above avalanches under real gravity and re-clusters. Tap the JAR
   (empty space) → RATTLE: a seeded shake that re-forms clusters (costs 1 tap,
   the softlock escape). Win = objective chips hit 0 within the tap budget.

   Ported verbatim from prototypes/13-rattle.html (feel-passed by Qi). Made a
   pure, DETERMINISTIC module so the beam-search verifier runs the exact physics
   the player feels: the sim itself has no randomness — only SPAWN and RATTLE do,
   and both are mulberry32-seeded (spawn from spec.seed once; rattle re-derived
   from spec.seed ^ tapCounter, so snapshots need no live RNG stream). The vessel
   lives in a FIXED reference space (WREF×HREF) independent of screen, so Node
   and WKWebView produce identical avalanches. No DOM/audio/render here — the
   game layer draws the sparkle off the EVENTS this module emits. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RattleEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FDT = 1 / 120;
  const WREF = 390, HREF = 844;
  const STONE = -2, BALLOON = -3;   // element colour sentinels (no clusterable colour)        // canonical sim space — phone aspect (screen-independent)
  const NCOLORS_MAX = 5;

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- layout (fixed, per level) — FULL-BLEED ----------------
     The play field is the whole phone (design update 2026-07-15): beads pile
     against the SCREEN edges, no floating jar. So the collision walls ARE the
     world bounds (x∈[R, WREF−R], floor at HREF−R), the top is open, and the
     bead radius is sized so the pile fills ~the bottom half. */
  function layout(count) {
    const vx0 = 0, vx1 = WREF, vTop = 0, vFloor = HREF, wallHalf = 0;
    const innerW = WREF;
    const G = HREF * 2.4;
    const pileH = HREF * 0.52;            // target settled pile ≈ bottom half
    const ballR = Math.sqrt(0.84 * innerW * pileH / (Math.PI * (count + 4)));
    const cell = ballR * 2.2;
    return { vx0, vx1, vTop, vFloor, wallHalf, innerW, G, ballR, cell };
  }

  function mkBall(x, y, r, c, isDuck, el) {
    el = el || null;
    const density = el === "stone" ? 3 : 1;                 // T2 stone: dead weight
    const m = r * r * (isDuck ? 1.6 : 1) * density;
    return { x, y, px: x, py: y, r, m, im: 1 / m, c, duck: !!isDuck, alive: true, sleepN: 0, popG: false, el, shelled: el === "shell" };
  }

  /* ---------------- world creation (deterministic spawn) ---------------- */
  function createWorld(spec, seedOverride) {
    const seed = (seedOverride == null ? spec.seed : seedOverride) >>> 0;
    const L = layout(spec.count);
    const w = {
      spec, seed, taps: spec.taps, tapCounter: 0,
      phase: "play", duckDone: false, settled: false,
      simT: 0, stepCount: 0, lastTapT: 0,
      L, balls: [], duck: null,
      grid: new Map(),
      objectives: spec.objs.map(o => ({ kind: o.kind, color: o.kind === "pop" ? o.color : -1, need: o.kind === "pop" ? o.need : 1, rem: o.kind === "pop" ? o.need : 1 })),
      events: [],
    };
    const rng = mulberry32(seed);
    // color deck: guarantee the biased objective color has headroom over its quota
    const deck = [];
    const nb = Math.round(spec.count * spec.bias.share);
    for (let i = 0; i < nb; i++) deck.push(spec.bias.color);
    const others = [];
    for (let c = 0; c < spec.colors; c++) if (c !== spec.bias.color) others.push(c);
    for (let i = 0; deck.length < spec.count; i++) deck.push(others[i % others.length]);
    for (let i = deck.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    // loose lattice from the floor up
    const R = L.ballR;
    const perRow = Math.max(3, Math.floor(L.innerW / (R * 2.15)));
    for (let i = 0; i < spec.count; i++) {
      const col = i % perRow;
      const jx = (rng() - 0.5) * R * 0.8;
      const x = L.vx0 + L.wallHalf + R * 1.1 + col * ((L.innerW - R * 2.2) / Math.max(1, perRow - 1)) + jx;
      const y = L.vFloor - L.wallHalf - R - Math.floor(i / perRow) * R * 2.05 - rng() * R * 0.3;
      w.balls.push(mkBall(x, y, R, deck[i], false));
    }
    if (spec.duck) {
      const rows = Math.ceil(spec.count / perRow);
      const dx = L.vx0 + L.wallHalf + L.innerW * (0.35 + rng() * 0.3);
      const dy = L.vFloor - L.wallHalf - rows * R * 1.1;
      w.duck = mkBall(dx, dy, R * 2.15, -1, true);
      w.balls.push(w.duck);
    }
    // ELEMENT MIX (T2-T7): convert some spawned beads into elements, seeded.
    // stone/balloon lose their colour (sentinels); shell/ice/tar/bomb keep it.
    if (spec.mix) {
      const pool = []; for (let i = 0; i < w.balls.length; i++) if (!w.balls[i].duck) pool.push(i);
      for (let i = pool.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      let pi = 0;
      for (const m of spec.mix) {
        for (let k = 0; k < m.n && pi < pool.length; k++, pi++) {
          const b = w.balls[pool[pi]];
          b.el = m.el;
          if (m.el === "stone") { b.c = STONE; b.shelled = false; b.m = b.r * b.r * 3; b.im = 1 / b.m; }
          else if (m.el === "balloon") { b.c = BALLOON; b.m = b.r * b.r * 0.55; b.im = 1 / b.m; }
          else if (m.el === "shell") { b.shelled = true; }   // keeps colour, revealed on crack
        }
      }
    }
    for (const o of w.objectives) {   // clear-all-type quotas are counted from the pile
      if (o.kind === "shells") { o.need = o.rem = w.balls.filter(b => b.shelled).length; }
      else if (o.kind === "balloons") { o.need = o.rem = w.balls.filter(b => b.el === "balloon" && b.alive).length; }
    }
    for (let i = 0; i < 360; i++) physSub(w);      // pre-settle: opens on a resting pile
    for (const b of w.balls) { b.px = b.x; b.py = b.y; b.sleepN = 99; }
    w.settled = true;
    markPoppable(w);
    return w;
  }

  /* ---------------- physics (Verlet + spatial hash) ---------------- */
  function fricPair(a, b) {
    if (a.el === "tar" || b.el === "tar") return 2.0;         // T6 tar dams the avalanche
    if (a.el === "ice" && b.el === "ice") return 0.18;        // T5 ice slumps flat
    if (a.el === "ice" || b.el === "ice") return 0.5;
    return 1;
  }
  function solvePair(w, a, b, doVel) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const minD = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 >= minD * minD || d2 < 1e-9) return;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    const overlap = minD - d;
    const ws = a.im + b.im, wa = a.im / ws, wb = b.im / ws;
    a.x -= nx * overlap * wa; a.y -= ny * overlap * wa;
    b.x += nx * overlap * wb; b.y += ny * overlap * wb;
    if (overlap > (a.r + b.r) * 0.10) { a.sleepN = 0; b.sleepN = 0; }   // wake only on real penetration, not static compression
    if (!doVel) return;
    const vax = a.x - a.px, vay = a.y - a.py, vbx = b.x - b.px, vby = b.y - b.py;
    const rvx = vax - vbx, rvy = vay - vby;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    const e = 0.08;
    const jn = -(1 + e) * vn / ws;
    let ix = nx * jn, iy = ny * jn;
    const vtx = rvx - vn * nx, vty = rvy - vn * ny;
    const tf = 0.22 * fricPair(a, b);                // per-material tangential friction
    ix -= vtx * tf / ws; iy -= vty * tf / ws;
    a.px -= ix * a.im; a.py -= iy * a.im;
    b.px += ix * b.im; b.py += iy * b.im;
    const spd = -vn / FDT;
    if (spd > HREF * 0.25) w.events.push({ type: "clack", v: spd / HREF });
  }
  function wallCollide(w, b) {
    const L = w.L, e = 0.10;
    const lo = L.vx0 + L.wallHalf + b.r, hi = L.vx1 - L.wallHalf - b.r, Fy = L.vFloor - L.wallHalf - b.r;
    if (b.x < lo) { const vx = b.x - b.px; b.x = lo; b.px = b.x + vx * e; if (vx < -0.5) b.sleepN = 0; }
    else if (b.x > hi) { const vx = b.x - b.px; b.x = hi; b.px = b.x + vx * e; if (vx > 0.5) b.sleepN = 0; }
    if (b.y > Fy) {
      const vy = b.y - b.py; b.y = Fy; b.py = b.y + vy * e;
      const ff = b.el === "ice" ? 0.985 : b.el === "tar" ? 0.55 : 0.85;   // ice slides, tar sticks
      const vx = (b.x - b.px) * ff; b.px = b.x - vx;
      if (vy / FDT > HREF * 0.30) w.events.push({ type: "clack", v: vy / FDT / HREF });
    }
    if (b.y < b.r) { const vy = b.y - b.py; b.y = b.r; b.py = b.y + vy * e; }
    if (b.el === "balloon" && b.y < HREF * 0.26) { b.y = HREF * 0.26; if (b.py < b.y) b.py = b.y; }   // stay on-screen
  }
  function physSub(w) {
    w.stepCount++;
    const R = w.L.ballR, G = w.L.G, cell = w.L.cell, grid = w.grid;
    const thr = R * 0.010, vmax = R * 1.1;
    for (const b of w.balls) {
      if (!b.alive) continue;
      const damp = b.el === "ice" ? 0.9995 : b.el === "tar" ? 0.99 : 0.998;   // T5 ice slides, T6 tar drags
      let vx = (b.x - b.px) * damp, vy = (b.y - b.py) * damp;
      const sp2 = vx * vx + vy * vy;
      if (sp2 > vmax * vmax) { const s = vmax / Math.sqrt(sp2); vx *= s; vy *= s; }
      if (sp2 < thr * thr * 16 && b.el !== "ice") { vx *= 0.96; vy *= 0.96; }   // micro-damp (ice keeps its glide)
      b.px = b.x; b.py = b.y;
      const gs = b.el === "balloon" ? -1.6 : 1;               // T4 balloon floats up (buoyant, but the perch clamp below keeps it touching the pile so it stays poppable)
      b.x += vx; b.y += vy + G * FDT * FDT * gs;
      if (sp2 < thr * thr) b.sleepN++; else b.sleepN = 0;
    }
    grid.clear();
    for (let i = 0; i < w.balls.length; i++) {
      const b = w.balls[i];
      if (!b.alive || b.duck) continue;
      const k = Math.floor(b.x / cell) + Math.floor(b.y / cell) * 8192;
      const a = grid.get(k); if (a) a.push(i); else grid.set(k, [i]);
    }
    for (let iter = 0; iter < 4; iter++) {
      const doVel = iter === 0;
      for (let i = 0; i < w.balls.length; i++) {
        const a = w.balls[i];
        if (!a.alive || a.duck) continue;
        const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
        for (let gy = cy - 1; gy <= cy + 1; gy++) for (let gx = cx - 1; gx <= cx + 1; gx++) {
          const arr = grid.get(gx + gy * 8192);
          if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const j = arr[k];
            if (j <= i) continue;
            const b = w.balls[j];
            if (!b.alive) continue;
            if (a.sleepN > 30 && b.sleepN > 30 && (w.stepCount & 1)) continue;
            solvePair(w, a, b, doVel);
          }
        }
      }
      if (w.duck && w.duck.alive) for (const b of w.balls) { if (!b.alive || b.duck) continue; solvePair(w, w.duck, b, doVel); }
      for (const b of w.balls) if (b.alive) wallCollide(w, b);
    }
    // T4 balloon perch clamp: a buoyant balloon in this OPEN-TOP full-bleed vessel
    // would otherwise rise to the ceiling and detach from the pile, stranding the
    // "pop a cluster beside it" objective (a real softlock). Clamp each balloon to
    // rest just above its highest nearby supporting bead — it floats to the pile
    // surface but always stays in contact with poppable beads.
    for (const b of w.balls) {
      if (!b.alive || b.el !== "balloon") continue;
      let surfaceY = Infinity;
      for (const o of w.balls) {
        if (!o.alive || o === b || o.el === "balloon" || o.duck) continue;
        if (Math.abs(o.x - b.x) < R * 2.4 && o.y < surfaceY) surfaceY = o.y;
      }
      if (surfaceY !== Infinity) {
        const cap = surfaceY - R * 1.5;                 // ~touching the surface bead (< 2R apart)
        if (b.y < cap) { b.y = cap; if (b.py < b.y) b.py = b.y; }
      }
    }
    w.settled = true;
    const rest2 = (R * 0.06) * (R * 0.06);
    for (const b of w.balls) { if (!b.alive) continue; const dx = b.x - b.px, dy = b.y - b.py; if (dx * dx + dy * dy > rest2) { w.settled = false; break; } }
  }

  /* ---------------- clusters (contact graph, on demand) ---------------- */
  function contact(a, b) { const dx = a.x - b.x, dy = a.y - b.y, t = (a.r + b.r) * 1.05; return dx * dx + dy * dy < t * t; }
  function clusterOf(w, seed) {
    const out = [seed], seen = new Set([seed]), stack = [seed];
    while (stack.length) {
      const a = stack.pop();
      for (const b of w.balls) {
        if (!b.alive || b.duck || b.c < 0 || b.shelled || b.c !== seed.c || seen.has(b)) continue;
        if (contact(a, b)) { seen.add(b); out.push(b); stack.push(b); }
      }
    }
    return out;
  }
  function allClusters(w) {
    const res = [], seen = new Set();
    for (const b of w.balls) {
      if (!b.alive || b.duck || b.c < 0 || b.shelled || seen.has(b)) continue;
      const cl = clusterOf(w, b);
      for (const m of cl) seen.add(m);
      res.push(cl);
    }
    return res;
  }
  function markPoppable(w) {
    for (const b of w.balls) b.popG = false;
    for (const cl of allClusters(w)) if (cl.length >= 2) for (const m of cl) m.popG = true;
  }
  function anyPoppable(w) { for (const b of w.balls) if (b.alive && b.popG) return true; return false; }
  // poppable clusters as index-lists — the verifier's move set (deterministic order)
  function poppableClusters(w) {
    return allClusters(w).filter(cl => cl.length >= 2).map(cl => cl.map(b => w.balls.indexOf(b)));
  }

  /* ---------------- pop / rattle / tap ---------------- */
  function wake(w, x, y, rad) { for (const b of w.balls) { if (!b.alive) continue; const dx = b.x - x, dy = b.y - y; if (dx * dx + dy * dy < rad * rad) b.sleepN = 0; } }
  function popClusterIdx(w, idxs) {
    const cl = idxs.map(i => w.balls[i]);
    let cx = 0, cy = 0; for (const m of cl) { cx += m.x; cy += m.y; } cx /= cl.length; cy /= cl.length;
    const color = cl[0].c;
    for (const m of cl) m.alive = false;
    // outward shockwave impulse on touching neighbours → satisfying local slump
    const R = w.L.ballR, rad = R * 3.2, k0 = HREF * 0.25 * FDT;
    for (const b of w.balls) {
      if (!b.alive) continue;
      for (const m of cl) {
        const dx = b.x - m.x, dy = b.y - m.y, d2 = dx * dx + dy * dy;
        if (d2 < rad * rad && d2 > 1) { const d = Math.sqrt(d2), k = (1 - d / rad) * k0; b.px -= (dx / d) * k; b.py -= (dy / d) * k; b.sleepN = 0; break; }
      }
    }
    wake(w, cx, cy, rad * 2);
    for (const o of w.objectives) if (o.kind === "pop" && o.color === color && o.rem > 0) o.rem = Math.max(0, o.rem - cl.length);
    w.events.push({ type: "pop", color, size: cl.length, x: cx, y: cy });
    // ELEMENT callbacks in the crack radius: T3 shell cracks, T4 balloon pops.
    // A shell only cracks from a SAME-COLOUR pop (Qi 2026-07-17: the crate shows its
    // bead's colour, so players read it as "pop this colour next to it"). MERCY: once
    // a crate's colour is exhausted from the board (no free bead of it remains to bring
    // adjacent), the colour rule would STRAND it forever — so it becomes crackable by
    // ANY adjacent pop. Removes the dead-end the colour gate introduced (measured on
    // L27/30/32/105) while keeping the strict rule whenever the colour is still poppable.
    // Bomb blasts stay colour-blind (see explodeBombs).
    const crackRad = R * 2.6;
    const colourLive = {};   // memoised: is there a free (non-shell) bead of colour c?
    const canCrack = b => b.c === color || (colourLive[b.c] == null
      ? (colourLive[b.c] = w.balls.some(o => o.alive && !o.shelled && o.c === b.c))
      : colourLive[b.c]) === false;
    for (const b of w.balls) {
      if (!b.alive) continue;
      let near = false;
      for (const m of cl) { const dx = b.x - m.x, dy = b.y - m.y; if (dx * dx + dy * dy < crackRad * crackRad) { near = true; break; } }
      if (!near) continue;
      if (b.shelled) { if (canCrack(b)) { b.shelled = false; b.sleepN = 0; w.events.push({ type: "crack", x: b.x, y: b.y }); decObj(w, "shells", 1); } }
      else if (b.el === "balloon") { b.alive = false; w.events.push({ type: "balloonpop", x: b.x, y: b.y }); decObj(w, "balloons", 1); }
    }
    // T7 bomb: any bomb in the popped cluster detonates (AoE, chains)
    const bombs = cl.filter(m => m.el === "bomb");
    if (bombs.length) explodeBombs(w, bombs);
    checkWin(w);
  }
  function decObj(w, kind, n) { for (const o of w.objectives) if (o.kind === kind && o.rem > 0) o.rem = Math.max(0, o.rem - n); }
  function explodeBombs(w, bombs) {
    const R = w.L.ballR, rad = R * 2.5, k0 = HREF * 0.55 * FDT;
    const queue = bombs.slice();
    while (queue.length) {
      const bomb = queue.shift();
      w.events.push({ type: "bomb", x: bomb.x, y: bomb.y });
      for (const b of w.balls) {
        if (!b.alive) continue;
        const dx = b.x - bomb.x, dy = b.y - bomb.y, d2 = dx * dx + dy * dy;
        if (d2 < rad * rad) {
          if (b.shelled) { b.shelled = false; decObj(w, "shells", 1); b.sleepN = 0; continue; }
          b.alive = false;
          if (b.c >= 0) for (const o of w.objectives) if (o.kind === "pop" && o.color === b.c && o.rem > 0) o.rem = Math.max(0, o.rem - 1);
          if (b.el === "balloon") decObj(w, "balloons", 1);
          if (b.el === "bomb") queue.push(b);          // chain
        } else if (d2 < rad * rad * 2.6 && d2 > 1) {   // ring impulse
          const d = Math.sqrt(d2), k = (1 - d / (rad * 1.6)) * k0;
          if (k > 0) { b.px -= dx / d * k; b.py -= dy / d * k; b.sleepN = 0; }
        }
      }
    }
  }
  // RATTLE: a seeded shake, re-derived from (seed, tapCounter) so it's snapshot-free
  function applyRattle(w) {
    const rng = mulberry32((w.seed ^ (w.tapCounter * 0x9e3779b9)) >>> 0);
    // kick 0.16 was a sub-pixel jiggle; 0.5 lofted the pile but it resettled into
    // ~the SAME positions (only 17% of beads moved >1R in a full pile → Qi: "not
    // much difference before/after"). 0.9 + a real loft genuinely REARRANGES the
    // pile — ~60% of beads relocate >1R (neighbours actually swap), bounded &
    // ball-safe. All 106 levels re-certified at this strength.
    const R = w.L.ballR, kick = HREF * 0.9 * FDT;
    for (const b of w.balls) {
      if (!b.alive) continue;
      const a = rng() * 6.2832, s = (0.5 + rng() * 0.7) * kick;
      b.px -= Math.cos(a) * s; b.py -= Math.sin(a) * s - kick * 1.5;   // strong upward loft → the jar jumps & re-tumbles
      b.sleepN = 0;
    }
    w.events.push({ type: "rattle" });
  }
  function ballAtIdx(w, x, y) {
    let best = -1, bd = 1e18, R = w.L.ballR;
    for (let i = 0; i < w.balls.length; i++) {
      const b = w.balls[i];
      if (!b.alive) continue;
      const dx = b.x - x, dy = b.y - y, rr = b.r + R * 0.35, d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 < bd) { bd = d2; best = i; }
    }
    return best;
  }
  // returns { kind: "pop"|"rattle"|"singleton"|"duck"|"none", size }
  function tap(w, x, y) {
    if (w.phase !== "play") return { kind: "none" };
    w.lastTapT = w.simT;
    const i = ballAtIdx(w, x, y);
    if (i < 0) return doRattle(w);                 // empty space → rattle
    const b = w.balls[i];
    if (b.duck) { w.events.push({ type: "quack" }); wake(w, b.x, b.y, b.r * 2.2); return { kind: "duck" }; }
    // a CRATE is locked — tapping it must NOT pop it. clusterOf excludes shelled
    // beads from the flood but not the SEED, so a direct tap made the crate join
    // its colour-neighbours and die as a popped bead WITHOUT decrementing the
    // shells objective (Qi's ghost-crates: chip said 2, both crates alive=0 in the
    // device flight-recorder). Bots never tap crates, so every fuzz/beam missed
    // this — the human's action space included a move the search's didn't.
    if (b.shelled) { w.events.push({ type: "wobble", i }); return { kind: "locked" }; }   // free no-op
    const cl = clusterOf(w, b);
    if (cl.length < 2) { w.events.push({ type: "wobble", i }); return { kind: "singleton" }; }   // free no-op
    if (w.taps <= 0) return { kind: "none" };
    w.taps--; w.tapCounter++;
    popClusterIdx(w, cl.map(m => w.balls.indexOf(m)));
    return { kind: "pop", size: cl.length };
  }
  function doRattle(w) {
    if (w.phase !== "play" || w.taps <= 0) return { kind: "none" };
    w.taps--; w.tapCounter++;
    applyRattle(w);
    return { kind: "rattle" };
  }

  /* ---------------- win / lose / step ---------------- */
  function allMet(w) {
    for (const o of w.objectives) {
      if ((o.kind === "pop" || o.kind === "shells" || o.kind === "balloons") && o.rem > 0) return false;
      if (o.kind === "duck" && !w.duckDone) return false;
    }
    return true;
  }
  function checkWin(w) { if (w.phase === "play" && allMet(w)) { w.phase = "win"; w.events.push({ type: "win", spare: w.taps }); } }
  function forceSettle(w) { for (const b of w.balls) { b.px = b.x; b.py = b.y; b.sleepN = 99; } w.settled = true; }

  function step(w) {
    w.simT += FDT;
    physSub(w);
    if (w.stepCount % 20 === 0) markPoppable(w);
    // duck reaching the vessel floor band = collected
    if (w.duck && w.duck.alive && !w.duckDone && w.phase === "play") {
      const restY = w.L.vFloor - w.L.wallHalf - w.duck.r;
      if (w.duck.y > restY - w.L.ballR * 1.3) {
        w.duckDone = true;
        for (const o of w.objectives) if (o.kind === "duck") o.rem = 0;
        w.events.push({ type: "duck", x: w.duck.x, y: w.duck.y });
        checkWin(w);
      }
    }
    if (w.phase === "play" && !allMet(w)) {
      if (w.taps <= 0) {
        if (w.settled && w.simT - w.lastTapT > 0.7) { w.phase = "lose"; w.events.push({ type: "lose", reason: "OUT OF TAPS" }); }
        else if (w.simT - w.lastTapT > 6) { forceSettle(w); w.phase = "lose"; w.events.push({ type: "lose", reason: "OUT OF TAPS" }); }
      } else if (w.settled && w.simT - w.lastTapT > 0.9 && w.stepCount > 60) {
        markPoppable(w);
        if (!anyPoppable(w)) w.events.push({ type: "nopairs" });   // offer a rattle (never a hard dead end)
      }
    }
  }

  // settle the pile AND resolve the turn (duck-down + win) — but NOT the
  // real-time lose-timers (the verifier/undo decide win/lose by budget). The
  // game's rAF loop uses step() instead, which adds the lose detection.
  function resolveTurn(w) {
    if (w.duck && w.duck.alive && !w.duckDone && w.phase === "play") {
      const restY = w.L.vFloor - w.L.wallHalf - w.duck.r;
      if (w.duck.y > restY - w.L.ballR * 1.3) {
        w.duckDone = true;
        for (const o of w.objectives) if (o.kind === "duck") o.rem = 0;
        w.events.push({ type: "duck", x: w.duck.x, y: w.duck.y });
        checkWin(w);
      }
    }
  }
  function settle(w, maxSteps) {
    const cap = maxSteps || 300;
    let quiet = 0;
    for (let i = 0; i < cap; i++) {
      physSub(w); resolveTurn(w);
      if (w.settled) { if (++quiet > 18 && i > 4) { markPoppable(w); return i + 1; } } else quiet = 0;
    }
    forceSettle(w); resolveTurn(w); markPoppable(w); return cap;
  }

  /* ---------------- verifier + undo support ---------------- */
  function snapshot(w) {
    return {
      balls: w.balls.map(b => [b.x, b.y, b.px, b.py, b.alive ? 1 : 0, b.sleepN, b.shelled ? 1 : 0]),
      taps: w.taps, tapCounter: w.tapCounter, phase: w.phase, duckDone: w.duckDone ? 1 : 0,
      settled: w.settled ? 1 : 0, simT: w.simT, stepCount: w.stepCount, lastTapT: w.lastTapT,
      obj: w.objectives.map(o => o.rem),
    };
  }
  function restore(w, s) {
    w.balls.forEach((b, i) => { const a = s.balls[i]; b.x = a[0]; b.y = a[1]; b.px = a[2]; b.py = a[3]; b.alive = !!a[4]; b.sleepN = a[5]; b.shelled = !!a[6]; });
    w.taps = s.taps; w.tapCounter = s.tapCounter; w.phase = s.phase; w.duckDone = !!s.duckDone;
    w.settled = !!s.settled; w.simT = s.simT; w.stepCount = s.stepCount; w.lastTapT = s.lastTapT;
    w.objectives.forEach((o, i) => o.rem = s.obj[i]);
    w.events.length = 0;
    markPoppable(w);
  }
  const isWin = w => w.phase === "win";
  const isLose = w => w.phase === "lose";

  function state(w) {
    return {
      taps: w.taps, phase: w.phase, settled: w.settled, duckDone: w.duckDone,
      ballsLeft: w.balls.reduce((n, b) => n + (b.alive && !b.duck ? 1 : 0), 0),
      objectives: w.objectives.map(o => ({ kind: o.kind, color: o.color, remaining: o.rem })),
      poppable: poppableClusters(w).length,
    };
  }

  return {
    FDT, WREF, HREF, NCOLORS_MAX, mulberry32,
    createWorld, step, settle, tap, doRattle, applyRattle, popClusterIdx,
    clusterOf, allClusters, poppableClusters, markPoppable, anyPoppable,
    snapshot, restore, isWin, isLose, state, ballAtIdx,
    VERSION: "0.1.0",
  };
});
