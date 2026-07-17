/* @jfun/difficulty — HARNESS: measure / certify-optimum / tune / seed-search,
   parameterised by a per-game GameAdapter. This is the reusable machine around
   the ONE thing each game must supply: how to drive its own engine.

   WHY an adapter (and why the certifier is NOT shared): every game's action space
   differs — Rattle pops colour clusters + rattles, Quarter is {L,R} rotations, a
   match-3 swaps tiles. But once a game exposes its discrete moves + a "distance to
   win" heuristic, the SEARCH (beam optimum), the WIN-RATE MEASUREMENT (policy
   rollouts = first-try clear-rate proxy), the BUDGET TUNING and the SEED SEARCH are
   all identical. Games that need a bespoke oracle (Tilt's continuous gesture search,
   Quarter's exhaustive DFS) keep it and only borrow measureWR + the curve math.

   GameAdapter contract — a plain object with:
     createWorld(spec)      -> world     // spec.seed is authoritative for spawn
     setBudget(spec, n)     -> spec'     // pure clone with the tap/move budget = n
     listMoves(world)       -> move[]    // discrete moves at a SETTLED state,
                                         // INCLUDING any "pass" move (rattle/shuffle)
     applyMove(world, move) -> void      // spend one budget unit + apply + settle (mutates)
     isWin(world)           -> boolean
     isLose(world)          -> boolean
     remaining(world)       -> number    // objective heuristic, lower = closer (0 at win)
     budgetLeft(world)      -> number    // taps/moves left
     snapshot(world)        -> snap       restore(world, snap) -> void   // cheap, for search
     stateKey(world)        -> string    // dedup key for the beam/DFS frontier
     policies: {                          // (world, moves, rng) -> move
       greedy(world, moves, rng)         // NOISELESS strongest line (winnability gate)
       attentive(world, moves, rng)      // reads the objective, ~10% slips = a real human
       casual?(world, moves, rng)        // ignores objective, ~20% random = distracted
     }
   A move may be any value the adapter understands; the harness never inspects it. */
(function (root, factory) {
  "use strict";
  const api = factory(typeof require === "function" ? require("./curve.js") : root.JfunDifficulty);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JfunDifficulty = Object.assign(root.JfunDifficulty || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (CURVE) {
  "use strict";
  // Node require resolves ./curve.js; a browser must load src/curve.js first. Fail loud.
  if (!CURVE || typeof CURVE.mulberry32 !== "function") throw new Error("@jfun/difficulty: harness.js needs curve.js loaded first");
  const mulberry32 = CURVE.mulberry32;
  function policyOf(adapter, name) {
    const p = adapter && adapter.policies && adapter.policies[name];
    if (typeof p !== "function") throw new Error("@jfun/difficulty: adapter has no policy '" + name + "'");
    return p;
  }

  // BEAM SEARCH over the adapter's discrete moves → botOptimum (fewest moves to
  // win), or null if unsolvable within maxDepth. `remaining` orders the frontier.
  // Give it a generous budget via setBudget so the optimum isn't clipped by the
  // level's real budget — this measures par, which the real budget is set FROM.
  function beamOptimum(adapter, spec, opts) {
    opts = opts || {};
    const width = opts.width || 8, maxDepth = opts.maxDepth || 24;
    const w = adapter.createWorld(adapter.setBudget(spec, maxDepth));
    if (adapter.isWin(w)) return 0;   // already satisfied at spawn → par 0
    let frontier = [{ snap: adapter.snapshot(w) }];
    const seen = new Set();
    for (let depth = 1; depth <= maxDepth; depth++) {
      const kids = [];
      for (const node of frontier) {
        adapter.restore(w, node.snap);
        for (const mv of adapter.listMoves(w)) {
          adapter.restore(w, node.snap);
          if (adapter.budgetLeft(w) <= 0) continue;
          adapter.applyMove(w, mv);
          if (adapter.isWin(w)) return depth;
          if (adapter.isLose(w) || adapter.budgetLeft(w) <= 0) continue;
          kids.push({ snap: adapter.snapshot(w), score: adapter.remaining(w), key: adapter.stateKey(w) });
        }
      }
      kids.sort((a, b) => a.score - b.score);
      frontier = [];
      for (const k of kids) { if (seen.has(k.key)) continue; seen.add(k.key); frontier.push(k); if (frontier.length >= width) break; }
      if (!frontier.length) break;
    }
    return null;
  }

  // run one policy rollout to a terminal state; returns { win, spare } (spare = budget left).
  function rollout(adapter, spec, policy, rng) {
    const w = adapter.createWorld(spec);
    let guard = 0, cap = adapter.budgetLeft(w) + 8, rattled = false;
    while (!adapter.isWin(w) && !adapter.isLose(w) && adapter.budgetLeft(w) > 0 && guard++ < cap) {
      const moves = adapter.listMoves(w);
      if (!moves.length) break;
      const mv = policy(w, moves, rng);
      if (adapter.isPass && adapter.isPass(mv)) rattled = true;   // used a rattle/shuffle
      adapter.applyMove(w, mv);
    }
    return { win: adapter.isWin(w), spare: adapter.budgetLeft(w), rattled };
  }

  // WIN-RATE = first-try clear-rate proxy: run `policyName` nRoll times (seeded,
  // reproducible) and report the fraction that clear + mean spare budget on wins.
  // Studios use exactly this — a bot-solver win-rate — as a pre-launch difficulty
  // gauge. Measure against the ATTENTIVE policy (a real human), not casual.
  function measureWR(adapter, spec, policyName, nRoll) {
    const policy = policyOf(adapter, policyName);
    let wins = 0, spare = 0;
    for (let i = 0; i < nRoll; i++) {
      const r = rollout(adapter, spec, policy, mulberry32(((spec.seed || 0) ^ (i * 0x9e3779b9 + 1)) >>> 0));
      if (r.win) { wins++; spare += r.spare; }
    }
    return { wr: wins / nRoll, spare: wins ? spare / wins : 0 };
  }

  // does the NOISELESS greedy line win at this budget? The fairness gate — if the
  // strongest simple line can't win, the board is unfair however clever the optimum.
  function greedyWins(adapter, spec) {
    return rollout(adapter, spec, policyOf(adapter, "greedy"), mulberry32(0)).win;
  }

  // TUNE the budget: the tightest greedy-winnable budget within a slack window over
  // par. Returns the tap/move count, or null (reject this seed — greedy can't win
  // tightly, i.e. a loose/unfair board). Mirrors a capped fair-budget: never balloon
  // the budget just to rescue a weak line — pick a friendlier seed instead.
  function tuneBudget(adapter, spec, par, slack, opts) {
    opts = opts || {};
    const padCap = opts.padCap == null ? 2 : opts.padCap;
    const sched = par + slack;
    // hardCap must never fall below the scheduled budget, or a loose slack (e.g.
    // breather 6) makes the loop body never run and every seed reads un-tunable.
    const hardCap = opts.hardCap == null ? Math.max(par + 5, sched) : opts.hardCap;
    const cap = Math.min(sched + padCap, hardCap);
    for (let taps = sched; taps <= cap; taps++) if (greedyWins(adapter, adapter.setBudget(spec, taps))) return taps;
    return null;
  }

  // SEED SEARCH: scan seeds, compute par (beam) + a tuned budget, measure the
  // attentive win-rate, and accept the first board whose WR lands in the target band
  // — BIASED TO THE HARD SIDE (a little harder than target ok, less easier), so the
  // campaign trends tough. Else the closest-to-target of up to scanCap boards. This
  // is the whole level-authoring loop, minus the game-specific `buildSpec`.
  //   buildSpec(seed) -> spec   (bake the level's objective/mix; only seed varies)
  //   opts.targetWR(n), opts.slackFor(n)  — from ./curve.js makeTargetCurve/makeSlackSchedule
  //   opts.guard(spec) -> bool  — optional extra gate (e.g. reachability of a floaty element)
  // Returns { seed, par, taps, wr, inBand } or null (no seed certified). `inBand`
  // distinguishes an accepted board from the closest-to-target fallback — check it
  // if you want to reject/flag a level the generator couldn't tune onto the curve.
  function searchSeed(adapter, buildSpec, n, opts) {
    opts = opts || {};
    const seedLo = opts.seedLo || 101, seedHi = opts.seedHi || 800;
    const width = opts.beamWidth || 8, maxDepth = opts.maxDepth || 24;
    const parLo = opts.parLo == null ? 2 : opts.parLo, parHi = opts.parHi == null ? 10 : opts.parHi;
    const nRoll = opts.nRoll || 60, scanCap = opts.scanCap || 30;
    const bandHi = opts.bandHi == null ? 0.14 : opts.bandHi, bandLo = opts.bandLo == null ? 0.22 : opts.bandLo;
    const policy = opts.policy || "attentive";
    const tgt = opts.targetWR(n), slack = opts.slackFor(n);
    let best = null, scanned = 0;
    for (let seed = seedLo; seed <= seedHi; seed++) {
      let cand;
      try {   // one bad seed (buildSpec/policy throw) must skip, not abort the whole scan
        const spec = buildSpec(seed);
        const par = beamOptimum(adapter, spec, { width, maxDepth });
        if (par == null || par < parLo || par > parHi) continue;
        if (opts.guard && !opts.guard(spec)) continue;
        const taps = tuneBudget(adapter, spec, par, slack, opts);
        if (taps == null) continue;
        const { wr } = measureWR(adapter, adapter.setBudget(spec, taps), policy, nRoll);
        cand = { seed, par, taps, wr, inBand: wr <= tgt + bandHi && wr >= tgt - bandLo };
      } catch (e) { continue; }
      if (cand.inBand) return cand;   // in band (hard-biased) — take it
      if (!best || Math.abs(cand.wr - tgt) < Math.abs(best.wr - tgt)) best = cand;
      if (++scanned >= scanCap) break;
    }
    return best;   // closest-to-target fallback (inBand:false), or null if nothing certified
  }

  return { beamOptimum, rollout, measureWR, greedyWins, tuneBudget, searchSeed, policyOf };
});
