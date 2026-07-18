/* Tilt difficulty measurement (adopting @jfun/difficulty's "measure, don't guess").
   For each level, search the REAL physics for the optimal human-gesture line and
   report its par (gestures) AND its solve TIME — Tilt's medal currency. Compares
   the MEASURED optimal time to the current par-FORMULA medal times, so we can see
   how far the placeholder curve is from reality (engine.js flags medalTimes as
   "placeholder … replaced by certified bot percentiles when certify.cjs lands").

   Usage: node scripts/dev/difficulty.cjs [from [to]]   (default 31 60) */
const path = require("path");
const A = require("./difficulty-adapter.cjs");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));

// TIME-MINIMIZING search: best-first by (uncaptured, cumulative time), collect ALL
// wins in the state budget, return the FASTEST winning line's { par, time, active }.
// A capture-first / gentlest-first bot finds A solve but a SLOW one (it optimises
// captures, not speed) → it makes every medal look impossible. A speed-runner uses
// short/firm tilts; this search does too, so its fastest line is a fair achievability
// floor for the diamond tier. (Still a bot, not a human — a lower bound, feel-test up.)
function solve(level, { maxStates = 40000 } = {}) {
  const w = A.createWorld({ level, taps: 60 });
  if (A.isWin(w)) return { par: 0, time: 0, active: 0 };
  const MOVES = A.listMoves();
  const uncap = () => w.marbles.reduce((n, m) => n + (m.captured ? 0 : 1), 0);
  const seen = new Map([[A.stateKey(w), 0]]);
  const pq = [{ s: A.snapshot(w), un: uncap(), depth: 0, t: 0 }];
  let explored = 0, best = null;
  while (pq.length && explored < maxStates) {
    pq.sort((a, b) => a.un - b.un || a.t - b.t);
    const node = pq.shift();
    if (best && node.t >= best.time) continue;             // prune paths already slower than the best win
    for (const mv of MOVES) {
      A.restore(w, node.s);
      A.applyMove(w, mv);
      explored++;
      const t = A.time(w);
      if (A.isWin(w)) { if (!best || t < best.time) best = { par: node.depth + 1, time: t, active: A.activeTime(w) }; continue; }
      const key = A.stateKey(w);
      if (seen.has(key) && seen.get(key) <= t) continue;
      seen.set(key, t);
      pq.push({ s: A.snapshot(w), un: uncap(), depth: node.depth + 1, t });
    }
  }
  return best;
}

const FROM = +(process.argv[2] || 31), TO = +(process.argv[3] || 60);
const fmt = n => n == null ? " -- " : n.toFixed(1).padStart(4);
console.log("lvl world    par botPar | botTime active | curMedal D/G/S | diamond vs botTime");
const rows = [];
for (let L = FROM; L <= TO; L++) {
  const P = E.build(L);
  const world = E.worldFor(L).name;
  const r = solve(L);
  const med = E.medalTimes(P.par);
  rows.push({ L, world, storedPar: P.par, r, med });
  const flag = r ? (med.diamond < r.active ? "  ✗ diamond IMPOSSIBLE (< active-tilt min)"
    : med.diamond < r.time ? "  ⚠ diamond < bot settle-time" : "  ok") : "";
  console.log(
    String(L).padStart(3), world.padEnd(8),
    String(P.par).padStart(3), String(r ? r.par : "--").padStart(6), "|",
    fmt(r && r.time), fmt(r && r.active), "|",
    fmt(med.diamond), fmt(med.gold), fmt(med.silver), "|", flag
  );
}
const ok = rows.filter(r => r.r);
const imposs = ok.filter(r => r.med.diamond < r.r.active).length;
const med = arr => arr.length ? arr.slice().sort((a, b) => a - b)[arr.length >> 1] : 0;
console.log(`\nsolved ${ok.length}/${rows.length}.  ` +
  `median bot optTime ${med(ok.map(r => r.r.time)).toFixed(1)}s (active ${med(ok.map(r => r.r.active)).toFixed(1)}s).`);
console.log(`DIAMOND is IMPOSSIBLE (faster than the active-tilt minimum) on ${imposs}/${ok.length} levels — the par-formula is miscalibrated for these worlds.`);
// machine-readable fastest-solve table (level → seconds) for the medal recalibration
console.log("\nFASTEST_SOLVE = " + JSON.stringify(rows.reduce((o, r) => { if (r.r) o[r.L] = +r.r.time.toFixed(1); return o; }, {})));
