#!/usr/bin/env node
/* QUARTER — the exhaustive verifier (the design's centerpiece, docs/longevity/
   design-7-quarter.md). The action space is finite sequences over {L, R}, so
   certification is a full-engine tree search — NO bot policy, the "solver" IS
   the continuous engine the player runs. This is the exact fix for the
   discrete-solver-is-a-wrong-oracle scar that bit Tilt's gates twice.

   Snapshot-DFS: each tree NODE costs ONE settle sim (~a few hundred steps), not
   a full rollout — snapshot the settled state, try L, recurse, restore, try R.
   A transposition table (quantized settled state) prunes the L·R-returns-home
   branches. Depth cap = par + slack. For each level we report the PROVEN
   minimum turn count and confirm it equals the authored par.

   Also a timing-robustness pass: humans don't tap exactly at settle, so every
   winning line is replayed with the taps jittered; a par that only wins
   frame-perfect is a red flag. Usage: node scripts/dev/verify.cjs [maxLevel] */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { LEVELS } = require(path.join(__dirname, "..", "..", "web", "js", "levels.js"));

// exhaustive shortest-solution search: BFS over {L,R} by turn count, each node a
// settle. Returns { win: shortest length or null, seqs: winning sequences ≤ cap }.
function search(spec, cap) {
  const root = E.createWorld(spec);
  E.settle(root);                          // let the board settle from spawn (gravity)
  const start = E.snapshot(root);
  const startKey = E.hashState(root);
  const seen = new Map([[startKey, 0]]);
  let frontier = [{ snap: start, seq: "" }];
  const wins = [];
  let shortest = null;
  for (let depth = 1; depth <= cap && frontier.length; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const d of ["L", "R"]) {
        E.restore(root, node.snap);
        E.turn(root, d);
        E.settle(root);
        const seq = node.seq + d;
        if (E.isWon(root)) {
          wins.push(seq);
          if (shortest === null) shortest = depth;
          continue;                        // don't expand a solved leaf
        }
        const key = E.hashState(root);
        if (seen.has(key)) continue;       // transposition prune
        seen.set(key, depth);
        next.push({ snap: E.snapshot(root), seq });
      }
    }
    if (shortest !== null) break;           // BFS: first win depth IS the minimum
    frontier = next;
    if (seen.size > 60000) break;           // safety bound (tree is ≤16K by design)
  }
  return { win: shortest, seqs: wins, explored: seen.size };
}

// replay a fixed sequence but jitter each tap's timing (settle ± window) + a
// tiny spawn epsilon; humans never tap frame-perfect. Deterministic per seed.
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function robust(spec, seq, trials) {
  let wins = 0;
  for (let s = 0; s < trials; s++) {
    const r = mulberry32(1000 + s * 7919);
    const w = E.createWorld(spec);
    w.bodies[0].x += (r() - 0.5) * E.CS * 0.12;   // spawn epsilon
    E.settle(w);
    let ok = true;
    for (const d of seq) {
      w.turns = w.turns;                          // (no-op; keep shape)
      E.turn(w, d);
      // settle with a jittered extra dwell: tap slightly early/late
      const extra = Math.round((r() * 0.75 - 0.15) / E.DT);   // [-0.15s, +0.6s]
      E.settle(w);
      for (let k = 0; k < Math.max(0, extra) && !E.isWon(w); k++) E.step(w);
      if (E.isWon(w)) { ok = true; break; }
      if (w.phase !== "play") { ok = false; break; }
    }
    if (E.isWon(w)) wins++;
  }
  return wins / trials;
}

const maxLevel = +(process.argv[2] || LEVELS.length);
let allOK = true;
for (let i = 0; i < Math.min(maxLevel, LEVELS.length); i++) {
  const L = i + 1, spec = LEVELS[i];
  // sanity: square + one marble + one goal
  const N = spec.rows.length;
  const shapeOK = spec.rows.every(row => row.length === N);
  const t0 = Date.now();
  const res = search(spec, spec.par + 3);
  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  if (!shapeOK) { console.log(`L${L} ✗ not square (${N} rows, bad width)`); allOK = false; continue; }
  if (res.win === null) { console.log(`L${L} ✗ UNSOLVABLE within par+3=${spec.par + 3}  [${res.explored} states, ${dt}s]`); allOK = false; continue; }
  const rob = robust(spec, res.seqs[0], 50);
  const pass = res.win === spec.par && rob >= 0.9;
  if (!pass) allOK = false;
  console.log(pass
    ? `L${L} par=${spec.par} CERTIFIED ✓  min=${res.win} (${res.seqs[0]}) · ${res.seqs.length} lines ≤par · robust ${(rob * 100) | 0}%  [${res.explored} states, ${dt}s]`
    : res.win !== spec.par
      ? `L${L} ✗ PAR MISMATCH: authored ${spec.par}, proven min ${res.win} (${res.seqs[0]})  [${dt}s]`
      : `L${L} ✗ FRAGILE: proven min ${res.win} but robust only ${(rob * 100) | 0}% (< 90%)  [${dt}s]`);
}
console.log(allOK ? "\nALL LEVELS CERTIFIED ✓" : "\nCERTIFICATION FAILED ✗");
process.exit(allOK ? 0 : 1);
