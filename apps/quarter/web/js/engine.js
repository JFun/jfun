/* QUARTER (Tilt 2) — engine (pure, deterministic, browser + Node).

   The ONE sim both the game and the verifier run — no second implementation,
   so the exhaustive {L,R} tree search certifies the exact physics the player
   feels. Ported verbatim from prototypes/16-quarter.html (feel-passed by Qi,
   "high quality"): board-space N×N grid, gravity is always screen-DOWN and a
   quarter-turn TWEENS the gravity vector while the renderer rotates the board
   by the same angle, so the marble tumbles LIVE through the 0.35 s turn (the
   moat). Walls never move; only `g` rotates; the angle quantizes to an exact
   90° multiple at tween end (zero drift = determinism).

   PURITY: no DOM, no audio, no rendering, and ZERO Math.random / Date / clock
   in the sim — particles/shake/sound are the game layer's job, driven off the
   EVENTS this module emits. Determinism is the contract: same level + same
   {L,R} sequence (settled between taps) → identical state hash, on device and
   in Node. snapshot()/restore() serialize ALL mutable state so undo and the
   verifier round-trip a single source of truth. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QuarterEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DT = 1 / 120;
  const HP = Math.PI / 2;
  const CS = 64;                    // board-space px per cell (fixed; the screen scales it)
  const MRF = 0.30;                 // marble radius as a fraction of CS (0.6-cell diameter)
  const BORF = 0.42;                // boulder radius fraction
  const GRAV = CS * 55;             // gravity accel, board units/s²
  const MAXV = CS * 26;             // hard speed clamp
  const WELLR = CS * 0.85;          // goal dimple pull radius
  const WELLK = CS * 26;            // dimple pull strength
  const CAPR = CS * 0.45;           // capture radius
  const CAPSP = CS * 7;             // must be slower than this to sink
  const TWEEN = 0.35;               // quarter-turn duration, s
  const CAP_DWELL = 0.3;            // slow-in-hole dwell before a win

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOutCubic(p) { p = clamp(p, 0, 1); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }

  /* ---------------- level parsing ----------------
     A level spec is { par, rows[] } of equal-length strings (the N×N bitmap):
       '#' wall · '.' open · 'I' open+ice · 'M' marble spawn · 'G' goal hole
       'B' boulder · 'Q' boulder ON the goal
     N is the row count (square: every row length must equal N). */
  function makeBody(kind, c, r) {
    const rad = (kind === "boulder" ? BORF : MRF) * CS;
    return {
      kind, x: (c + 0.5) * CS, y: (r + 0.5) * CS,
      spawnX: (c + 0.5) * CS, spawnY: (r + 0.5) * CS,
      vx: 0, vy: 0, r: rad, m: kind === "boulder" ? 3 : 1,
      rot: 0, contact: false, restT: 0, resting: false,
    };
  }

  function createWorld(spec) {
    const rows = spec.rows;
    const N = rows.length;
    const S = N * CS;
    const walls = new Uint8Array(N * N);
    let mSpawn = null, bSpawn = null, goal = { x: 0, y: 0 };
    for (let r = 0; r < N; r++) {
      const row = rows[r];
      for (let c = 0; c < N; c++) {
        const ch = row.charAt(c);
        if (ch === "#") walls[r * N + c] = 1;
        else if (ch === "I") walls[r * N + c] = 2;
        else if (ch === "M") mSpawn = [c, r];
        else if (ch === "G") goal = { x: (c + 0.5) * CS, y: (r + 0.5) * CS };
        else if (ch === "B") bSpawn = [c, r];
        else if (ch === "Q") { bSpawn = [c, r]; goal = { x: (c + 0.5) * CS, y: (r + 0.5) * CS }; }
      }
    }
    const bodies = [makeBody("marble", mSpawn[0], mSpawn[1])];
    if (bSpawn) bodies.push(makeBody("boulder", bSpawn[0], bSpawn[1]));
    return {
      N, S, CS, walls, goal, bodies,
      par: spec.par || 0,
      theta: 0, qCount: 0, rot: null, queue: [],
      turns: 0, phase: "play",      // "play" | "won"
      capT: 0, t: 0,
      events: [],
    };
  }

  function cellIdx(w, c, r) { return r * w.N + c; }
  function isIceCell(w, b) {
    const c = clamp(Math.floor(b.x / CS), 0, w.N - 1);
    const r = clamp(Math.floor(b.y / CS), 0, w.N - 1);
    return w.walls[cellIdx(w, c, r)] === 2;
  }

  /* ---------------- physics (board space) ---------------- */
  function onImpact(w, b, impact, px, py) {
    if (impact < CS * 2) return;
    w.events.push({ type: "impact", kind: b.kind, speed: impact, x: px, y: py });
  }
  function collideCells(w, b, h, quiet) {
    const N = w.N, S = w.S, theta = w.theta;
    const c0 = clamp(Math.floor((b.x - b.r) / CS), 0, N - 1);
    const c1 = clamp(Math.floor((b.x + b.r) / CS), 0, N - 1);
    const r0 = clamp(Math.floor((b.y - b.r) / CS), 0, N - 1);
    const r1 = clamp(Math.floor((b.y + b.r) / CS), 0, N - 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (w.walls[cellIdx(w, c, r)] !== 1) continue;
        const bx = c * CS, by = r * CS;
        const px = clamp(b.x, bx, bx + CS), py = clamp(b.y, by, by + CS);
        let dx = b.x - px, dy = b.y - py;
        let d = Math.hypot(dx, dy);
        if (d >= b.r) continue;
        if (d < 1e-9) { dx = -Math.sin(theta); dy = -Math.cos(theta); d = 1; }   // degenerate: push against gravity
        const nx = dx / d, ny = dy / d;
        b.x = px + nx * b.r; b.y = py + ny * b.r;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          const rest = b.kind === "boulder" ? 0.08 : 0.25;
          b.vx -= (1 + rest) * vn * nx;
          b.vy -= (1 + rest) * vn * ny;
          const scr = b.kind === "boulder" ? 5 : (isIceCell(w, b) ? 0.25 : 3);
          const tx = -ny, ty = nx;
          const vt = b.vx * tx + b.vy * ty;
          const k = Math.max(0, 1 - scr * h);
          b.vx += tx * vt * (k - 1); b.vy += ty * vt * (k - 1);
          if (!quiet) onImpact(w, b, -vn, px, py);
        }
        b.contact = true;
      }
    }
    // outer bounds (belt AND braces — border cells are walls in every level)
    const lo = b.r, hi = S - b.r;
    if (b.x < lo) { b.x = lo; if (b.vx < 0) b.vx = -b.vx * 0.25; b.contact = true; }
    else if (b.x > hi) { b.x = hi; if (b.vx > 0) b.vx = -b.vx * 0.25; b.contact = true; }
    if (b.y < lo) { b.y = lo; if (b.vy < 0) b.vy = -b.vy * 0.25; b.contact = true; }
    else if (b.y > hi) { b.y = hi; if (b.vy > 0) b.vy = -b.vy * 0.25; b.contact = true; }
  }
  function dimple(w, b) {
    const dx = w.goal.x - b.x, dy = w.goal.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d < WELLR && d > 1e-6) {
      const a = WELLK * (1 - d / WELLR) * DT;
      b.vx += dx / d * a; b.vy += dy / d * a;
    }
  }
  function integrateBody(w, b, gx, gy) {
    const theta = w.theta;
    const sp0 = Math.hypot(b.vx, b.vy);
    const sub = clamp(Math.ceil((sp0 + GRAV * DT) * DT / (b.r * 0.5)), 1, 6);
    const h = DT / sub;
    for (let k = 0; k < sub; k++) {
      b.vx += gx * h; b.vy += gy * h;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAXV) { const s = MAXV / sp; b.vx *= s; b.vy *= s; }
      b.x += b.vx * h; b.y += b.vy * h;
      collideCells(w, b, h, false);
    }
    if (b.kind === "marble") dimple(w, b);
    const ux = Math.sin(theta), uy = Math.cos(theta);
    const vt = -b.vx * uy + b.vy * ux;
    b.rot += vt / b.r * DT;
  }
  function pairCollide(w, loud) {
    if (w.bodies.length < 2) return;
    const a = w.bodies[0], b = w.bodies[1];
    let dx = b.x - a.x, dy = b.y - a.y;
    let d = Math.hypot(dx, dy);
    const minD = a.r + b.r;
    if (d >= minD) return;
    if (d < 1e-9) { dx = 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d;
    const overlap = minD - d;
    const ima = 1 / a.m, imb = 1 / b.m, s = ima + imb;
    a.x -= nx * overlap * (ima / s); a.y -= ny * overlap * (ima / s);
    b.x += nx * overlap * (imb / s); b.y += ny * overlap * (imb / s);
    const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rvn < 0) {
      const e = Math.abs(rvn) < CS * 1.2 ? 0 : 0.2;   // restitution slop: gentle contacts don't buzz
      const j = -(1 + e) * rvn / s;
      a.vx -= j * ima * nx; a.vy -= j * ima * ny;
      b.vx += j * imb * nx; b.vy += j * imb * ny;
      if (loud && Math.abs(rvn) > CS * 2.5)
        w.events.push({ type: "clack", speed: Math.abs(rvn), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
    a.contact = true; b.contact = true;
  }
  function postBody(w, b) {
    const ice = isIceCell(w, b);
    let fk, fc;
    if (b.kind === "boulder") { fk = 1.5; fc = ice ? CS * 1.5 : CS * 10; }
    else { fk = ice ? 0.12 : 0.5; fc = ice ? CS * 0.15 : CS * 4; }
    if (!b.contact) { fk = 0.05; fc = 0; }        // airborne: nearly free
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const drop = (fk * sp + fc) * DT;
      const ns = Math.max(0, sp - drop);
      const k = ns / sp;
      b.vx *= k; b.vy *= k;
    }
    const sp2 = Math.hypot(b.vx, b.vy);
    if (b.contact && sp2 < CS * 0.5) {
      const damp = ice ? (sp2 < CS * 0.1 ? 2 : 0) : 8;
      if (damp > 0) { const k2 = Math.max(0, 1 - damp * DT); b.vx *= k2; b.vy *= k2; }
    }
    if (sp2 < CS * 0.3) b.restT += DT; else b.restT = 0;
    b.resting = b.restT > 0.2;
  }
  function winCheck(w) {
    const m = w.bodies[0];
    const d = Math.hypot(m.x - w.goal.x, m.y - w.goal.y);
    const sp = Math.hypot(m.vx, m.vy);
    if (d < CAPR && sp < CAPSP) {
      w.capT += DT;
      const k = Math.max(0, 1 - 6 * DT);
      m.vx *= k; m.vy *= k;
      if (w.capT >= CAP_DWELL && w.phase !== "won") {
        w.phase = "won";
        m.vx = 0; m.vy = 0; w.queue.length = 0;
        w.events.push({ type: "win", turns: w.turns, x: w.goal.x, y: w.goal.y });
      }
    } else {
      w.capT = 0;
    }
  }
  function watchdog(w) {
    for (const b of w.bodies) {
      if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.vx) || !isFinite(b.vy) ||
          b.x < -CS || b.x > w.S + CS || b.y < -CS || b.y > w.S + CS) {
        b.x = b.spawnX; b.y = b.spawnY; b.vx = 0; b.vy = 0; b.restT = 0;
      }
    }
  }

  /* ---------------- turning ---------------- */
  function startTurn(w, d) {
    const dq = d === "R" ? 1 : -1;
    const from = w.qCount * HP;
    w.qCount += dq;
    w.rot = { from, to: w.qCount * HP, t: 0, dur: TWEEN };
    w.turns++;
    w.events.push({ type: "turn", dir: d });
  }
  // One buffered tap max: returns false when a turn is running AND one is queued.
  function turn(w, d) {
    d = d === "L" ? "L" : "R";
    if (w.phase !== "play") return false;
    if (w.rot) {
      if (w.queue.length >= 1) return false;
      w.queue.push(d);
      return true;
    }
    startTurn(w, d);
    return true;
  }

  /* ---------------- fixed step ---------------- */
  function step(w) {
    w.t += DT;
    // rotation tween — physics stays LIVE underneath; angle quantizes at the end
    if (w.rot) {
      w.rot.t += DT;
      const p = clamp(w.rot.t / w.rot.dur, 0, 1);
      w.theta = lerp(w.rot.from, w.rot.to, easeInOutCubic(p));
      if (w.rot.t >= w.rot.dur || w.rot.t > 1.5) {   // >1.5s = stall watchdog
        w.theta = w.rot.to;                          // exact 90° multiple, zero drift
        w.rot = null;
        if (w.queue.length && w.phase === "play") startTurn(w, w.queue.shift());
      }
    }
    if (w.phase === "won") return;
    const gx = Math.sin(w.theta) * GRAV, gy = Math.cos(w.theta) * GRAV;
    for (const b of w.bodies) { b.contact = false; integrateBody(w, b, gx, gy); }
    for (let pass = 0; pass < 2; pass++) {
      pairCollide(w, pass === 0);
      for (const b of w.bodies) collideCells(w, b, DT * 0.5, true);
    }
    for (const b of w.bodies) postBody(w, b);
    winCheck(w);
    watchdog(w);
  }

  /* ---------------- verifier + undo support ----------------
     snapshot serializes EVERY mutable field (bodies incl. velocities + rest
     timers, rotation state, queue, turn count, phase, dwell). restore() is its
     exact inverse — the single source of truth the undo and the DFS both
     round-trip, so a missed field fails loudly instead of silently corrupting. */
  function snapshot(w) {
    return {
      bodies: w.bodies.map(b => [b.x, b.y, b.vx, b.vy, b.rot, b.restT, b.resting ? 1 : 0, b.contact ? 1 : 0]),
      theta: w.theta, qCount: w.qCount,
      rot: w.rot ? [w.rot.from, w.rot.to, w.rot.t, w.rot.dur] : null,
      queue: w.queue.slice(),
      turns: w.turns, phase: w.phase, capT: w.capT, t: w.t,
    };
  }
  function restore(w, s) {
    w.bodies.forEach((b, i) => {
      const a = s.bodies[i];
      b.x = a[0]; b.y = a[1]; b.vx = a[2]; b.vy = a[3]; b.rot = a[4];
      b.restT = a[5]; b.resting = !!a[6]; b.contact = !!a[7];
    });
    w.theta = s.theta; w.qCount = s.qCount;
    w.rot = s.rot ? { from: s.rot[0], to: s.rot[1], t: s.rot[2], dur: s.rot[3] } : null;
    w.queue = s.queue.slice();
    w.turns = s.turns; w.phase = s.phase; w.capT = s.capT; w.t = s.t;
    w.events.length = 0;
  }

  // step until every body rests (|v| small for a beat) or a hard cap — the unit
  // the DFS costs one of per tree node. Returns the step count used.
  function settle(w, maxSteps) {
    const cap = maxSteps || 720;   // 6 s at 120 Hz
    let quiet = 0;
    for (let i = 0; i < cap; i++) {
      step(w);
      if (w.phase === "won") return i + 1;
      if (w.rot) { quiet = 0; continue; }
      const moving = w.bodies.some(b => Math.hypot(b.vx, b.vy) > CS * 0.12);
      if (!moving) { if (++quiet > 60) return i + 1; } else quiet = 0;   // rest held 0.5 s
    }
    return cap;
  }

  const isWon = w => w.phase === "won";

  // transposition key: positions to ¼-cell, orientation mod 4, phase — folds the
  // L·R-returns-home branches the exhaustive search would otherwise re-explore.
  function hashState(w) {
    let s = ((w.qCount % 4) + 4) % 4 + "|" + w.phase;
    for (const b of w.bodies) s += "|" + Math.round(b.x / CS * 4) + "," + Math.round(b.y / CS * 4);
    return s;
  }

  return {
    DT, CS, HP, TWEEN, MRF, BORF, CAPR,
    createWorld, step, turn, snapshot, restore, settle, isWon, hashState,
    VERSION: "0.1.0",
  };
});
