/* Rattle's GameAdapter for @jfun/difficulty — the ~40 lines that teach the shared
   harness to drive Rattle's engine. Everything difficulty-related (measure / par /
   tune / seed-search / reports) then comes from the package. The certifier stays
   Rattle's own verify.cjs (beam is shared, but the reachability guard etc. are local).
   A move is { pop: idxs } or { rattle: true }. Policies mirror the ones that were
   hand-inlined in verify/gen-campaign/curve — see the dogfood test for proof they
   reproduce the shipped numbers. */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));

function remaining(w) {
  let r = 0;
  for (const o of w.objectives) {
    if (o.kind === "pop" || o.kind === "shells" || o.kind === "balloons") r += o.rem;
    else if (o.kind === "duck" && !w.duckDone) r += 8;
  }
  return r;
}
const objColors = w => {
  const s = new Set(w.objectives.filter(o => o.kind === "pop" && o.rem > 0).map(o => o.color));
  // colour-gated crates: while shells remain, their colours ARE objective colours
  if (w.objectives.some(o => o.kind === "shells" && o.rem > 0))
    for (const b of w.balls) if (b.alive && b.shelled) s.add(b.c);
  return s;
};
const pops = moves => moves.filter(m => m.pop);
const rattleMove = moves => moves.find(m => m.rattle);
const biggest = ms => ms.reduce((a, b) => b.pop.length > a.pop.length ? b : a);

module.exports = {
  createWorld: spec => E.createWorld(spec),
  setBudget: (spec, n) => Object.assign({}, spec, { taps: n }),
  listMoves: w => { const mv = E.poppableClusters(w).map(idxs => ({ pop: idxs })); mv.push({ rattle: true }); return mv; },
  applyMove: (w, mv) => { w.taps--; w.tapCounter++; if (mv.rattle) E.applyRattle(w); else E.popClusterIdx(w, mv.pop); E.settle(w); },
  isWin: w => E.isWin(w),
  isLose: w => E.isLose(w),
  isPass: mv => !!mv.rattle,   // a rattle is the "pass" move — disqualifies PERFECT
  remaining,
  budgetLeft: w => w.taps,
  snapshot: w => E.snapshot(w),
  restore: (w, s) => E.restore(w, s),
  stateKey: w => remaining(w) + ":" + w.balls.reduce((n, b) => n + (b.alive ? 1 : 0), 0) + ":" + w.taps,
  policies: {
    // NOISELESS: biggest objective-colour cluster, else biggest, else rattle
    greedy: (w, moves, _rng) => {
      const oc = objColors(w), p = pops(moves);
      const oj = p.filter(m => oc.has(w.balls[m.pop[0]].c));
      return (oj.length ? biggest(oj) : p.length ? biggest(p) : rattleMove(moves));
    },
    // a real human: reads the objective, ~10% slips
    attentive: (w, moves, rng) => {
      const p = pops(moves); if (!p.length) return rattleMove(moves);
      const oc = objColors(w), oj = p.filter(m => oc.has(w.balls[m.pop[0]].c));
      return biggest((oj.length && rng() > 0.10) ? oj : p);
    },
    // distracted: ignores the objective, ~20% random
    casual: (w, moves, rng) => {
      const p = pops(moves); if (!p.length) return rattleMove(moves);
      if (rng() < 0.20) return p[(rng() * p.length) | 0];
      return biggest(p);
    },
  },
};
