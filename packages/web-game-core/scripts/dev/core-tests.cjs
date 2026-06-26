/* web-game-core tests. The RNG golden is the contract (same seed → identical
   stream everywhere); the solver scaffold is validated against a trivial
   reference game so a refactor can't quietly break the discipline. */
const path = require("path");
const C = require(path.join(__dirname, "..", "..", "src", "web-game-core.js"));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("  ✗ " + n); } };
const eq = (n, g, w) => ok(n + ` (got ${JSON.stringify(g)})`, JSON.stringify(g) === JSON.stringify(w));

console.log("— RNG determinism golden (mulberry32) —");
{
  const r = C.makeRNG(12345);
  eq("seed 12345 stream", [r(), r(), r()].map(x => +x.toFixed(10)), [0.9797282678, 0.3067522645, 0.4842054215]);
  // same seed → identical stream (the daily/replay contract)
  const a = C.makeRNG(777), b = C.makeRNG(777);
  ok("same seed reproduces", a() === b() && a() === b());
  eq("seeded shuffle is stable", C.shuffle(C.makeRNG(7), [1, 2, 3, 4, 5]), [4, 2, 3, 5, 1]);
}

console.log("— grid + key helpers —");
{
  const g = C.makeGrid(2, 3, C.EMPTY);
  eq("makeGrid shape", [g.length, g[0].length], [2, 3]);
  g[1][2] = C.FILLED;
  eq("key round-trips", C.key(C.fromKey(C.key(g))), C.key(g));
  const c = C.cloneGrid(g); c[0][0] = C.WALL;
  ok("cloneGrid is deep", g[0][0] === C.EMPTY);
}

console.log("— generic full-line detection —");
{
  // bottom row full with a wall among blocks → reported (wall counts, ≥1 clearable)
  const g = [[0, 0, 0], [0, 0, 0], [1, 2, 1]];
  eq("full row w/ wall", C.fullLines(g), { rows: [2], cols: [] });
  // an all-wall row must NOT be reported (loose guard)
  eq("all-wall row ignored", C.fullLines([[2, 2, 2], [0, 0, 0], [0, 0, 0]]), { rows: [], cols: [] });
}

console.log("— BFS solver scaffold (reference game: reach target int) —");
{
  // toy game: a number; moves +1/×2; win at 10. par from 3 is 4 (3→6→7→8→9→10? no);
  // BFS finds the true shortest. We just assert it finds AN optimal short path.
  const spec = {
    moves: ["inc", "dbl"],
    apply: (s, m) => { const next = m === "inc" ? s + 1 : s * 2; return next > 20 ? { changed: false } : { next, changed: next !== s }; },
    isWon: s => s === 10,
    key: s => String(s),
    maxDepth: 12,
  };
  const res = C.bfsSolve(3, spec);
  ok("solvable from 3", res.solvable);
  // verify the returned path actually reaches 10 in res.par steps
  let s = 3; for (const m of res.solution) s = m === "inc" ? s + 1 : s * 2;
  ok("solution reaches win", s === 10);
  eq("par == solution length", res.par, res.solution.length);
  ok("unsolvable detected", C.bfsSolve(11, { ...spec, isWon: s => s === 7, moves: ["dbl"] }).solvable === false);
  ok("solvable() fail-open probe agrees", C.solvable(3, spec) === true);

  // ARRAY move tokens (e.g. [r,c]) must NOT be flattened in the returned path —
  // the regression that the string-move game above can't catch.
  const arr = {
    moves: [[0], [1]],                                  // token = a 1-element array
    apply: (s, m) => { const next = s + (m[0] + 1); return next > 5 ? { changed: false } : { next, changed: true }; },
    isWon: s => s === 4, key: s => String(s), maxDepth: 6,
  };
  const ar = C.bfsSolve(0, arr);
  ok("array move tokens stay intact", ar.solvable && ar.solution.every(m => Array.isArray(m)));
  let v = 0; for (const m of ar.solution) v += m[0] + 1;
  ok("array-token solution replays to win", v === 4);
}

console.log(`\n${fail ? "✗" : "✓"} core: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
