/* Tilt physics fuzz gate (verification Layer 2). Seeded random human-ish play
   over the REAL physics with invariants asserted every step — the bounded,
   CI-stable slice of the deep-fuzz technique that found the 1e-9 collision
   explosion (a ball flung to y≈-3.6e8) and the well-freeze capture bug, both of
   which 260 deterministic assertions plus weeks of human play had missed.

   Invariants:
     per step:    every marble finite; every marble inside the tray;
                  captured ⟹ sitting in its own (matching, filled) hole
     per settle:  a settled matching ball over its OPEN hole must be captured
                  (the well-freeze class — funnel pull vs rest threshold)

   Deterministic (seeded) so a failure reproduces exactly. Uses @jfun/test-harness. */
const path = require("path");
const { harness } = require("@jfun/test-harness");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const PH = require(path.join(__dirname, "..", "..", "web", "js", "physics.js"));
const Core = require("@jfun/web-game-core");
const t = harness("tilt fuzz");

const MR = 0.36, HR = 0.42;
function mkWorld(level) {
  const P = E.build(level);
  return { P, w: PH.createWorld({
    w: 8, h: 8, pad: 0, unit: 1,
    marbles: P.init.marbles.map(m => ({ x: m.x + 0.5, y: m.y + 0.5, r: MR, c: m.c })),
    holes: P.holesArr.map(h => ({ x: h.x + 0.5, y: h.y + 0.5, r: HR, c: h.c })),
    blocks: (P.walls || []).map(b => ({ x: b.x, y: b.y, w: 1, h: 1 })),
    gates: (P.gates || []).map(g => {
      const pk = P.holesArr.find(h => Math.abs(h.x - g.x) + Math.abs(h.y - g.y) === 1);
      return { x: g.x, y: g.y, px: g.px, py: g.py, pocketColor: pk ? pk.c : null };
    }),
    posts: (P.posts || []).map(pp => ({ x: pp.x + 0.5, y: pp.y + 0.5, r: 0.34 })),
    params: E.worldFor(level).params,
  }) };
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
const MAGS = [1.8, 4, 8];

function checkStep(w) {
  const lo = 0 + MR - 0.02, hi = 8 - MR + 0.02;
  for (const m of w.marbles) {
    if (!isFinite(m.x) || !isFinite(m.y) || !isFinite(m.vx) || !isFinite(m.vy)) return "NON-FINITE";
    if (m.x < lo || m.x > hi || m.y < lo || m.y > hi) return "ESCAPED @" + m.x.toFixed(2) + "," + m.y.toFixed(2);
    if (m.captured) {
      const own = w.holes.find(h => h.filled && h.c === m.c && Math.hypot(h.x - m.x, h.y - m.y) < HR + MR);
      if (!own) return "CAPTURED-NOT-IN-OWN-HOLE (" + m.c + ")";
    }
  }
  return null;
}
function checkSettled(w) {
  for (const m of w.marbles) {
    if (m.captured || Math.hypot(m.vx, m.vy) > 1e-3) continue;
    const h = w.holes.find(hh => !hh.filled && hh.c === m.c);
    if (h && Math.hypot(m.x - h.x, m.y - h.y) < HR * w.params.captureFrac) return "WELL-FREEZE (" + m.c + " rests on own open hole uncaptured)";
  }
  return null;
}

// levels sampled across every world/element: curated, walls, gates (1+2 pairs), posts
const LEVELS = [2, 8, 16, 31, 37, 39, 44, 46, 53, 60];
const TRIALS = 6, GESTURES = 6;   // bounded smoke slice — the deep hunt (600-3000 trials) stays a scratch tool

// the trial/round loop + violation tagging is @jfun/test-harness t.fuzz (Layer 2,
// shared); this file supplies only Tilt's truth: the gesture model + invariants.
for (const L of LEVELS) {
  t.fuzz(`L${L}: ${TRIALS}×${GESTURES} random gestures, invariants hold`, {
    trials: TRIALS, rounds: GESTURES,
    rng: Core.makeRNG((0xF0220 ^ L) >>> 0),
    setup: () => mkWorld(L).w,
    round: (w, rng) => {
      const d = DIRS[Math.floor(rng() * DIRS.length)], mag = MAGS[Math.floor(rng() * MAGS.length)];
      const hold = Math.round((0.4 + rng() * 1.1) / PH.DT);
      let violation = null;
      for (let s = 0; s < hold && !violation; s++) {
        PH.step(w, { gx: d[0] * mag, gy: d[1] * mag }); w.events.length = 0;
        violation = checkStep(w);
      }
      let settled = 0;
      for (let s = 0; s < 240 && !violation; s++) {              // ≤2s ease-flat
        PH.step(w, { gx: 0, gy: 0 }); w.events.length = 0;
        violation = checkStep(w);
        const vmax = Math.max(0, ...w.marbles.map(m => m.captured ? 0 : Math.hypot(m.vx, m.vy)));
        if (vmax < 0.04) { if (++settled > 25) break; } else settled = 0;
      }
      return violation || checkSettled(w);
    },
  });
}

process.exit(t.summary());
