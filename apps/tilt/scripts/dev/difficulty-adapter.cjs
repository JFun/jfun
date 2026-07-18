/* Tilt's GameAdapter for @jfun/difficulty. Tilt is a CONTINUOUS, time-scored,
   infinite-retry game (README fit table: "curve math + measureWR only — keeps its
   gesture certifier"), so a "move" is one human GESTURE — a sustained tilt
   (direction × strength) held until the board settles, the exact vocabulary the
   certifier searches. The harness then gives us beam-par + solve-TIME + win-rate
   over the REAL physics; the winnability certifier stays scripts/dev/certify.cjs.

   Extra beyond the standard contract: `time(w)` = elapsed physics seconds (the
   MEDAL currency — Tilt grades on time, not tap count). */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const PH = require(path.join(__dirname, "..", "..", "web", "js", "physics.js"));

const DIRS = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };
// same gesture vocabulary as certify.cjs (gentle catch → hard pop/slam)
const GESTURES = [
  { mag: 1.8, hold: 4 }, { mag: 1.8, hold: 1.5 }, { mag: 4, hold: 1.2 },
  { mag: 8, hold: 0.7 }, { mag: 8, hold: 2 },
];
const MOVES = [];
for (const d of Object.keys(DIRS)) for (const g of GESTURES) MOVES.push({ dir: d, mag: g.mag, hold: g.hold });

// apply a gesture: hold the tilt, ease flat, let the board settle. Advances w.t
// (the true elapsed time). Same shape as certify's gesture().
function applyGesture(w, mv) {
  const g = { gx: DIRS[mv.dir][0] * mv.mag, gy: DIRS[mv.dir][1] * mv.mag };
  for (let i = 0; i < Math.round(mv.hold / PH.DT); i++) { PH.step(w, g); w.events.length = 0; }
  let settled = 0;
  for (let i = 0; i < Math.round(5 / PH.DT); i++) {
    PH.step(w, { gx: 0, gy: 0 }); w.events.length = 0;
    const vmax = Math.max(0, ...w.marbles.map(m => m.captured ? 0 : Math.hypot(m.vx, m.vy)));
    if (vmax < 0.04) { if (++settled > 30) break; } else settled = 0;
  }
}

function mkWorld(level) {
  const P = E.build(level);
  return PH.createWorld({
    w: 8, h: 8, pad: 0, unit: 1,
    marbles: P.init.marbles.map(m => ({ x: m.x + 0.5, y: m.y + 0.5, r: 0.36, c: m.c })),
    holes: P.holesArr.map(h => ({ x: h.x + 0.5, y: h.y + 0.5, r: 0.42, c: h.c })),
    blocks: (P.walls || []).map(b => ({ x: b.x, y: b.y, w: 1, h: 1 })),
    gates: (P.gates || []).map(g => {
      const pk = P.holesArr.find(h => Math.abs(h.x - g.x) + Math.abs(h.y - g.y) === 1);
      return { x: g.x, y: g.y, px: g.px, py: g.py, pocketColor: pk ? pk.c : null };
    }),
    posts: (P.posts || []).map(pp => ({ x: pp.x + 0.5, y: pp.y + 0.5, r: 0.34 })),
    params: E.worldFor(level).params,
  });
}

// objective heuristic: uncaptured balls dominate, distance-to-home breaks ties
function remaining(w) {
  let r = 0;
  for (const m of w.marbles) {
    if (m.captured) continue;
    const h = w.holes.find(hh => hh.c === m.c && !hh.filled);
    r += 100 + (h ? Math.hypot(m.x - h.x, m.y - h.y) : 0);
  }
  return r;
}

const snapM = w => w.marbles.map(m => [m.x, m.y, m.vx, m.vy, m.captured, m.sink && { ...m.sink }, m.px, m.py, m.rimIn]);

const adapter = {
  createWorld: spec => { const w = mkWorld(spec.level); w._budget = spec.taps != null ? spec.taps : 40; return w; },
  setBudget: (spec, n) => Object.assign({}, spec, { taps: n }),
  listMoves: () => MOVES,
  applyMove: (w, mv) => { w._act = (w._act || 0) + mv.hold; applyGesture(w, mv); w._budget--; },
  isWin: w => PH.solved(w),
  isLose: () => false,                                  // no fail state — rollout ends on budget
  remaining,
  budgetLeft: w => w._budget,
  time: w => w.t,                                       // total elapsed seconds (bot settles between gestures)
  activeTime: w => w._act || 0,                         // sum of HOLD seconds — the fluid-human lower bound
  snapshot: w => ({ m: snapM(w), g: w.gates.map(g => g.held), h: w.holes.map(h => h.filled), t: w.t, a: w._act || 0, b: w._budget }),
  restore: (w, s) => {
    w.marbles.forEach((m, i) => { const a = s.m[i]; m.x = a[0]; m.y = a[1]; m.vx = a[2]; m.vy = a[3]; m.captured = a[4]; m.sink = a[5] ? { ...a[5] } : null; m.px = a[6]; m.py = a[7]; m.rimIn = a[8]; });
    s.g.forEach((v, i) => { w.gates[i].held = v; });
    s.h.forEach((v, i) => { w.holes[i].filled = v; });
    w.t = s.t; w._act = s.a; w._budget = s.b; w.events.length = 0;
  },
  stateKey: w => w.marbles.map(m => m.captured ? "C" : (Math.round(m.x * 2) + "." + Math.round(m.y * 2))).join("|") + "#" + w.gates.map(g => +g.held).join(""),
  policies: {
    // NOISELESS strongest 1-ply line (the winnability gate for FORWARD play — note
    // gate puzzles need setup moves a 1-ply greedy may miss; use beamOptimum for par)
    greedy: (w, moves) => bestMove(w, moves),
    // a real human executing the line: reads the objective, ~10% slips
    attentive: (w, moves, rng) => rng() < 0.10 ? moves[(rng() * moves.length) | 0] : bestMove(w, moves),
  },
};

// 1-ply lookahead: the gesture that most reduces `remaining` (a win wins), faster on ties
function bestMove(w, moves) {
  const snap = adapter.snapshot(w);
  let best = null, bestScore = Infinity, bestT = Infinity;
  for (const mv of moves) {
    adapter.restore(w, snap);
    applyGesture(w, mv);
    const sc = PH.solved(w) ? -1e9 : remaining(w);
    const dt = w.t - snap.t;
    if (sc < bestScore || (sc === bestScore && dt < bestT)) { bestScore = sc; bestT = dt; best = mv; }
  }
  adapter.restore(w, snap);
  return best;
}

module.exports = adapter;
