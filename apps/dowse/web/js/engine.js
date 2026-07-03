/* Dowse — engine (pure, deterministic, seedable). A LEVEL hides pegs under an N×N
   felt; 3 marbles roll together on every tilt until wall / peg / marble. The player
   parks the marbles into a 3-cell TARGET formation (matched under translation only,
   anywhere on the board) within a tilt BUDGET. Every peg a marble bumps is revealed —
   the probe IS the move, so information and position spend the same currency.

   Determinism is the contract: build(level) → identical board for everyone.

   FAIRNESS (baked into acceptance, verified by scripts/dev/engine-tests.cjs):
   - solvable within budget at a known par (BFS-certified, solution line kept);
   - pegless-solve must FAIL within budget → interior stops are load-bearing, so
     edge-slam spam can never win (relaxed only on the last-resort tier);
   - ≥2 distinct optimal openers on strict tiers (reduces first-move guess punishment).

   LEVEL RAMP (rampFor): grid 6→7→8, pegs 4→10, par window rises, budget slack
   tightens +5 → +2. Ported from prototypes/11-dowse.html — port, don't reimplement. */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const Core = (typeof module !== "undefined" && module.exports)
    ? require("@jfun/web-game-core") : root.WebGameCore;
  const makeRNG = Core.makeRNG;

  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const DIR4 = ["left", "right", "up", "down"];

  // 3-cell target shapes, normalized (min x/y at 0), matched under translation only.
  // Order matters: the first `shapePool` entries are the level's allowed pool, so the
  // easiest-to-read shapes (row/column) come first for early levels.
  const SHAPES = [
    { name: "row",      cells: [[0, 0], [1, 0], [2, 0]] },
    { name: "column",   cells: [[0, 0], [0, 1], [0, 2]] },
    { name: "diagonal", cells: [[0, 0], [1, 1], [2, 2]] },
    { name: "diagonal", cells: [[2, 0], [1, 1], [0, 2]] },
    { name: "L",        cells: [[0, 0], [0, 1], [1, 1]] },
    { name: "L",        cells: [[1, 0], [1, 1], [0, 1]] },
    { name: "hook",     cells: [[0, 0], [1, 0], [1, 1]] },
    { name: "hook",     cells: [[0, 0], [1, 0], [0, 1]] },
  ];

  function normKey(cells) {
    let mx = 99, my = 99;
    for (const c of cells) { if (c[0] < mx) mx = c[0]; if (c[1] < my) my = c[1]; }
    return cells.map(c => (c[0] - mx) + "," + (c[1] - my)).sort().join("|");
  }
  function stateKey(ms) { return ms.map(m => m.x + "," + m.y).sort().join("|"); }
  function isGoal(ms, tk) { return normKey(ms.map(m => [m.x, m.y])) === tk; }

  // Tilt resolver: all marbles roll until wall / peg / settled marble. Leading
  // marbles (nearest the wall being tilted toward) settle first.
  function resolveTilt(marbles, dir, pegSet, N) {
    const dx = DIRS[dir][0], dy = DIRS[dir][1];
    const order = marbles.map((_, i) => i)
      .sort((a, b) => dx ? (marbles[b].x - marbles[a].x) * dx : (marbles[b].y - marbles[a].y) * dy);
    const settled = new Set();
    const moves = new Array(marbles.length);
    for (const i of order) {
      let x = marbles[i].x, y = marbles[i].y, cause = "wall", pegKey = null;
      for (;;) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) { cause = "wall"; break; }
        const k = nx + "," + ny;
        if (pegSet.has(k)) { cause = "peg"; pegKey = k; break; }
        if (settled.has(k)) { cause = "marble"; break; }
        x = nx; y = ny;
      }
      settled.add(x + "," + y);
      moves[i] = { fx: marbles[i].x, fy: marbles[i].y, tx: x, ty: y, cause, pegKey,
        dist: Math.abs(x - marbles[i].x) + Math.abs(y - marbles[i].y) };
    }
    return moves;
  }
  function applyMoves(moves) { return moves.map(m => ({ x: m.tx, y: m.ty })); }

  // BFS over settled states; returns { par, line } or null if no solution within cap.
  function solve(marbles, pegSet, tk, cap, N) {
    if (isGoal(marbles, tk)) return { par: 0, line: [] };
    const seen = new Set([stateKey(marbles)]);
    let q = [{ ms: marbles, line: [] }], head = 0;
    while (head < q.length) {
      const cur = q[head++];
      if (cur.line.length >= cap) continue;
      for (const dir of DIR4) {
        const ms = applyMoves(resolveTilt(cur.ms, dir, pegSet, N));
        const k = stateKey(ms);
        if (seen.has(k)) continue;
        seen.add(k);
        const line = cur.line.concat(dir);
        if (isGoal(ms, tk)) return { par: line.length, line };
        if (line.length < cap) q.push({ ms, line });
      }
    }
    return null;
  }

  /* ---------------- level ramp ---------------- */
  function rampFor(level) {
    const L = Math.max(1, level | 0);
    const N = L < 5 ? 6 : L < 15 ? 7 : 8;
    const pegBase = N === 6 ? 4 : N === 7 ? 6 : 8;   // want = pegBase + rng*(span+1)
    const pegSpan = N === 6 ? 1 : 2;
    const minPegs = pegBase;                          // acceptance floor
    const slack = L < 5 ? 5 : L < 20 ? 4 : L < 35 ? 3 : 2;
    const parLo = N === 6 ? (L < 3 ? 2 : 3) : N === 7 ? 5 : 6;
    const parHi = N === 6 ? 6 : N === 7 ? 9 : 11;
    const shapePool = L < 3 ? 2 : L < 5 ? 4 : SHAPES.length; // row/col → +diagonals → all
    const openers = L < 3 ? 1 : 2;                    // strict-tier distinct optimal openers
    // preReveal: how much of the board starts VISIBLE. Early levels play like pure
    // slide-planning (all pegs shown — the old-Tilt feel); deduction ramps in later.
    const preReveal = L < 3 ? 1 : L < 5 ? 0.5 : L < 8 ? 0.15 : 0; // fraction of pegs
    return { N, pegBase, pegSpan, minPegs, slack, parLo, parHi, shapePool, openers, preReveal };
  }
  function seedForLevel(n) { return ((n * 0x9e3779b1) ^ 0xd05e) >>> 0; }

  /* ---------------- generator + verifier ---------------- */
  function genBoard(seed, ramp) {
    const rng = makeRNG(seed);
    const N = ramp.N;
    const want = ramp.pegBase + Math.floor(rng() * (ramp.pegSpan + 1));
    const pegs = []; let guard = 0;
    while (pegs.length < want && guard++ < 500) {
      const x = 1 + Math.floor(rng() * (N - 2)), y = 1 + Math.floor(rng() * (N - 2));
      let ok = true;
      for (const p of pegs) if (Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) < 2) { ok = false; break; }
      if (ok) pegs.push({ x, y });
    }
    if (pegs.length < ramp.minPegs) return null;
    const occ = new Set(pegs.map(p => p.x + "," + p.y));
    const marbles = []; guard = 0;
    while (marbles.length < 3 && guard++ < 300) {
      const x = Math.floor(rng() * N), y = Math.floor(rng() * N), k = x + "," + y;
      if (!occ.has(k)) { occ.add(k); marbles.push({ x, y }); }
    }
    if (marbles.length < 3) return null;
    const shape = SHAPES[Math.floor(rng() * ramp.shapePool)];
    return { N, pegs, marbles, shape, tk: normKey(shape.cells) };
  }

  // Acceptance for one candidate board under the given constraints.
  function evaluate(b, ramp, opts) {
    const pegSet = new Set(b.pegs.map(p => p.x + "," + p.y));
    if (isGoal(b.marbles, b.tk)) return null;          // never start solved
    const sol = solve(b.marbles, pegSet, b.tk, opts.parHi, b.N);
    if (!sol || sol.par < opts.parLo) return null;
    const budget = sol.par + ramp.slack;
    if (opts.requirePeglessFail && solve(b.marbles, new Set(), b.tk, budget, b.N)) return null;
    if (opts.openers > 0) {
      let firsts = 0;
      const k0 = stateKey(b.marbles);
      for (const dir of DIR4) {
        const ms = applyMoves(resolveTilt(b.marbles, dir, pegSet, b.N));
        if (stateKey(ms) === k0) continue;
        if (isGoal(ms, b.tk)) { if (sol.par === 1) firsts++; continue; }
        const s2 = solve(ms, pegSet, b.tk, sol.par - 1, b.N);
        if (s2 && s2.par === sol.par - 1) firsts++;
      }
      if (firsts < opts.openers) return null;
    }
    return { par: sol.par, budget, line: sol.line };
  }

  // Tier ladder: strict in-range → widened par (openers relaxed to 1) → any
  // solvable (pegless-fail relaxed). Solvability-within-budget is NEVER relaxed.
  function build(level) {
    const ramp = rampFor(level);
    const baseSeed = seedForLevel(level);
    for (let i = 0; i < 160; i++) {
      const b = genBoard((baseSeed + i * 131) >>> 0, ramp);
      if (!b) continue;
      const ev = evaluate(b, ramp, { parLo: ramp.parLo, parHi: ramp.parHi, openers: ramp.openers, requirePeglessFail: true });
      if (ev) return finish(b, ev, level, 1);
    }
    for (let i = 0; i < 220; i++) {
      const b = genBoard((baseSeed + 7777 + i * 131) >>> 0, ramp);
      if (!b) continue;
      const ev = evaluate(b, ramp, { parLo: Math.max(2, ramp.parLo - 2), parHi: ramp.parHi + 3, openers: 1, requirePeglessFail: true });
      if (ev) return finish(b, ev, level, 2);
    }
    for (let i = 0; i < 3000; i++) {
      const b = genBoard(((baseSeed ^ 0x517cc1b7) + i * 97) >>> 0, ramp);
      if (!b) continue;
      const ev = evaluate(b, ramp, { parLo: 2, parHi: ramp.parHi + 4, openers: 0, requirePeglessFail: false });
      if (ev) return finish(b, ev, level, 3);
    }
    return null; // practically unreachable — tests sweep levels to prove it
  }
  function finish(b, ev, level, tier) {
    const ramp = rampFor(level);
    // Pre-revealed pegs: first ceil(frac·n) in (seeded) generation order — deterministic.
    const k = Math.min(b.pegs.length, Math.ceil(b.pegs.length * ramp.preReveal));
    return {
      level, N: b.N,
      pegs: b.pegs.map(p => ({ x: p.x, y: p.y })),
      revealed: b.pegs.slice(0, k).map(p => p.x + "," + p.y),
      marbles: b.marbles.map(m => ({ x: m.x, y: m.y })),
      shape: { name: b.shape.name, cells: b.shape.cells.map(c => c.slice()) },
      tk: b.tk, par: ev.par, budget: ev.budget, line: ev.line.slice(), tier,
    };
  }

  return { SHAPES, DIRS, DIR4, normKey, stateKey, isGoal, resolveTilt, applyMoves,
           solve, rampFor, seedForLevel, build, VERSION: "1.0.0" };
});
