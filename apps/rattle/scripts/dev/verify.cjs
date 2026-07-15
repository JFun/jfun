#!/usr/bin/env node
/* RATTLE — the physics-faithful verifier (docs/longevity/design-4-rattle.md).
   The oracle is the SAME continuous circle engine the player runs — cluster
   formation after an avalanche is a physics outcome, never a logic solver.

   Action space at each settled state = the poppable same-colour clusters (the
   board hands you the moves) + one rattle. BEAM SEARCH (width W, depth = tap
   budget) proves solvability and measures botOptimum (fewest taps to win). Then
   a GREEDY-policy rollout confirms the level is forgiving (not a frame-perfect
   fluke). Accept iff: solvable within budget ∧ botOptimum ≥ 2 (no one-tap
   trivial) ∧ greedy also wins. Usage: node scripts/dev/verify.cjs [maxLevel] */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "levels.js"));
const ENG = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { LEVELS } = E;

// remaining-objective heuristic (lower = closer to a win)
function remaining(w) {
  let r = 0;
  for (const o of w.objectives) {
    // shells/balloons clear via the shockwave of an ADJACENT cluster pop — same
    // "units of work" as a pop objective from the search's point of view.
    if (o.kind === "pop" || o.kind === "shells" || o.kind === "balloons") r += o.rem;
    else if (o.kind === "duck" && !w.duckDone) r += 8;   // an unbrought duck is ~8 "units" of work
  }
  return r;
}
function applyMove(w, mv) {
  if (mv.type === "rattle") { if (w.taps <= 0) return false; w.taps--; w.tapCounter++; ENG.applyRattle(w); }
  else { w.taps--; w.tapCounter++; ENG.popClusterIdx(w, mv.idxs); }
  ENG.settle(w);
  return true;
}
function movesFrom(w) {
  const mv = ENG.poppableClusters(w).map(idxs => ({ type: "pop", idxs, color: w.balls[idxs[0]].c, size: idxs.length }));
  mv.push({ type: "rattle" });
  return mv;
}

// BFS-by-depth with beam pruning → first winning depth IS botOptimum.
function beam(spec, width, maxDepth) {
  const w = ENG.createWorld(spec);
  let frontier = [{ snap: ENG.snapshot(w) }];
  const seen = new Set();
  for (let depth = 1; depth <= maxDepth; depth++) {
    const kids = [];
    for (const node of frontier) {
      ENG.restore(w, node.snap);
      for (const mv of movesFrom(w)) {
        ENG.restore(w, node.snap);
        if (!applyMove(w, mv)) continue;
        if (ENG.isWin(w)) return { win: depth };
        if (ENG.isLose(w) || w.taps <= 0) continue;
        const rem = remaining(w);
        const key = rem + ":" + w.balls.reduce((n, b) => n + (b.alive ? 1 : 0), 0) + ":" + w.taps;
        kids.push({ snap: ENG.snapshot(w), score: rem, key });
      }
    }
    // dedupe by coarse key + keep the closest-to-win W states
    kids.sort((a, b) => a.score - b.score);
    frontier = [];
    for (const k of kids) { if (seen.has(k.key)) continue; seen.add(k.key); frontier.push(k); if (frontier.length >= width) break; }
    if (!frontier.length) break;
  }
  return { win: null };
}

// greedy policy: pop the biggest objective-colour cluster; else the biggest
// cluster (churn toward new clusters); else rattle. A forgiving level wins here.
function greedy(spec, seed) {
  const w = ENG.createWorld(spec, seed);
  let guard = 0;
  while (w.phase === "play" && w.taps > 0 && guard++ < spec.taps + 4) {
    const objColors = new Set(w.objectives.filter(o => o.kind === "pop" && o.rem > 0).map(o => o.color));
    const cls = ENG.poppableClusters(w).map(idxs => ({ idxs, color: w.balls[idxs[0]].c, size: idxs.length }));
    let pick = null;
    const objCls = cls.filter(c => objColors.has(c.color));
    if (objCls.length) pick = objCls.reduce((a, b) => b.size > a.size ? b : a);
    else if (cls.length) pick = cls.reduce((a, b) => b.size > a.size ? b : a);
    if (pick) applyMove(w, { type: "pop", idxs: pick.idxs });
    else applyMove(w, { type: "rattle" });
  }
  return ENG.isWin(w);
}

// Balloon reachability guard: the beam/greedy play FAST, so they never see a
// buoyant balloon drift up and detach from the pile over idle time — yet a human
// staring at the board does, and a detached balloon strands the "pop beside it"
// objective (a real softlock Qi hit). Simulate a long idle and assert every
// balloon still has a bead within its crack radius (2.6·R).
function balloonsReachable(spec) {
  if (!(spec.mix || []).some(m => m.el === "balloon")) return true;
  const w = ENG.createWorld(spec);
  const R = w.L.ballR, crack2 = (R * 2.6) * (R * 2.6);
  for (let i = 0; i < 3000; i++) ENG.step(w);
  for (const b of w.balls) {
    if (!b.alive || b.el !== "balloon") continue;
    let near = false;
    for (const o of w.balls) {
      if (!o.alive || o === b || o.el === "balloon" || o.duck) continue;
      const dx = o.x - b.x, dy = o.y - b.y;
      if (dx * dx + dy * dy < crack2) { near = true; break; }
    }
    if (!near) return false;
  }
  return true;
}

const maxLevel = +(process.argv[2] || LEVELS.length);
let allOK = true;
for (let i = 0; i < Math.min(maxLevel, LEVELS.length); i++) {
  const L = i + 1, spec = LEVELS[i];
  const t0 = Date.now();
  const res = beam(spec, 8, spec.taps);
  const g = greedy(spec, spec.seed);
  const reach = balloonsReachable(spec);
  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  const solvable = res.win !== null;
  const nonTrivial = solvable && res.win >= 2;
  const pass = solvable && nonTrivial && g && reach;
  if (!pass) allOK = false;
  console.log(pass
    ? `L${L} taps=${spec.taps} CERTIFIED ✓  botOptimum=${res.win} (slack ${spec.taps - res.win}) · greedy wins · [${dt}s]`
    : !solvable
      ? `L${L} taps=${spec.taps} ✗ UNSOLVABLE within budget  [${dt}s]`
      : !nonTrivial
        ? `L${L} ✗ TRIVIAL: wins in ${res.win} tap  [${dt}s]`
        : !reach
          ? `L${L} taps=${spec.taps} ✗ BALLOON STRANDED: a balloon drifts free of the pile on idle → unreachable objective  [${dt}s]`
          : `L${L} taps=${spec.taps} ✗ FRAGILE: beam solves (botOpt ${res.win}) but greedy policy fails  [${dt}s]`);
}
console.log(allOK ? "\nALL LEVELS CERTIFIED ✓" : "\nCERTIFICATION FAILED ✗");
process.exit(allOK ? 0 : 1);
