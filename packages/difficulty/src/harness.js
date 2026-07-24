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
   OPTIONAL members (load-bearing where present):
     isPass(move)      -> boolean   // marks a rattle/shuffle "pass" move (rollout's `rattled`)
     time(world)       -> seconds   // elapsed sim time — REQUIRED by timeOptimum (continuous games)
     activeTime(world) -> seconds   // active-input time, the fluid-human lower bound (timeOptimum)
     fingerprint(world)-> string    // FULL-state fingerprint for preflightAdapter — stateKey is a
                                    // deliberately-coarse dedup key and can miss a lossy snapshot
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

  // CANDIDATE SEARCH — the generalized accept loop under searchSeed: scan seeds,
  // score each candidate with `evaluate`, accept the first whose score lands in
  // the target band — BIASED TO THE HARD SIDE (a little harder than target ok,
  // less easier), so the campaign trends tough. Else the closest-to-target of up
  // to scanCap boards. `evaluate` is where a game's whole measurement pipeline
  // lives (and its REAL certifier, for games whose measure isn't bot-WR — the
  // framework never sees an uncertified score):
  //   evaluate(spec, n) -> { score, ...rideAlong } | null   (null = reject seed)
  //   buildSpec(seed)   -> spec
  //   opts.targetWR(n); bandLo/bandHi; scanCap; seedLo/seedHi;
  //   opts.skipSeeds    — a Set of seeds to skip (gate-retry exclusion)
  // Returns { seed, ...evaluated, inBand } or null. inBand:false = the
  // closest-to-target FALLBACK, not an accept — flag it (the "SUPER HARD level
  // measuring 82%" scar: every seed was too easy and the fallback won silently).
  function searchCandidate(evaluate, buildSpec, n, opts) {
    opts = opts || {};
    const seedLo = opts.seedLo || 101, seedHi = opts.seedHi || 800;
    const scanCap = opts.scanCap || 30;
    const bandHi = opts.bandHi == null ? 0.14 : opts.bandHi, bandLo = opts.bandLo == null ? 0.22 : opts.bandLo;
    const tgt = opts.targetWR(n);
    let best = null, scanned = 0;
    for (let seed = seedLo; seed <= seedHi; seed++) {
      if (opts.skipSeeds && opts.skipSeeds.has(seed)) continue;
      let cand;
      try {   // one bad seed (buildSpec/evaluate throw) must skip, not abort the whole scan
        const spec = buildSpec(seed);
        const m = evaluate(spec, n);
        if (!m) continue;
        cand = Object.assign({ seed: seed }, m, { inBand: m.score <= tgt + bandHi && m.score >= tgt - bandLo });
      } catch (e) { continue; }
      if (cand.inBand) return cand;   // in band (hard-biased) — take it
      if (!best || Math.abs(cand.score - tgt) < Math.abs(best.score - tgt)) best = cand;
      if (++scanned >= scanCap) break;
    }
    return best;   // closest-to-target fallback (inBand:false), or null if nothing certified
  }

  // the built-in evaluate: the bot-WR measurement pipeline, in the EXACT order
  // Rattle's original findSeed ran it (par → par-range → guard → tune → measure)
  // — reproduced bit-for-bit, which searchSeed's dogfood depends on.
  function botWREvaluate(adapter, n, opts) {
    const width = opts.beamWidth || 8, maxDepth = opts.maxDepth || 24;
    const parLo = opts.parLo == null ? 2 : opts.parLo, parHi = opts.parHi == null ? 10 : opts.parHi;
    const nRoll = opts.nRoll || 60;
    const policy = opts.policy || "attentive";
    const slack = opts.slackFor(n);
    return function evaluate(spec) {
      const par = beamOptimum(adapter, spec, { width: width, maxDepth: maxDepth });
      if (par == null || par < parLo || par > parHi) return null;
      if (opts.guard && !opts.guard(spec)) return null;
      const taps = tuneBudget(adapter, spec, par, slack, opts);
      if (taps == null) return null;
      const wr = measureWR(adapter, adapter.setBudget(spec, taps), policy, nRoll).wr;
      return { par: par, taps: taps, wr: wr, score: wr };
    };
  }

  // SEED SEARCH: the whole single-level authoring loop, minus the game-specific
  // `buildSpec` — a thin wrapper over searchCandidate with the bot-WR evaluate.
  // Signature and return shape unchanged (dogfood-proven bit-identical to
  // Rattle's original findSeed; the refactor is pinned by an equivalence test).
  //   buildSpec(seed) -> spec   (bake the level's objective/mix; only seed varies)
  //   opts.targetWR(n), opts.slackFor(n)  — from ./curve.js makeTargetCurve/makeSlackSchedule
  //   opts.guard(spec) -> bool  — optional extra gate (e.g. reachability of a floaty element)
  // Returns { seed, par, taps, wr, inBand } or null (no seed certified). `inBand`
  // distinguishes an accepted board from the closest-to-target fallback — check it
  // if you want to reject/flag a level the generator couldn't tune onto the curve.
  function searchSeed(adapter, buildSpec, n, opts) {
    opts = opts || {};
    const f = searchCandidate(botWREvaluate(adapter, n, opts), buildSpec, n, opts);
    return f && { seed: f.seed, par: f.par, taps: f.taps, wr: f.wr, inBand: f.inBand };
  }

  // TIME OPTIMUM — the continuous-game measure primitive (ports Tilt's local
  // time-minimizing search; the lazy-bot doctrine lives here now): best-first by
  // (priority asc, cumulative time asc), collect ALL wins within the state
  // budget, return the FASTEST winning line's { par, time, active }. A
  // capture-first / gentlest-first bot finds A solve but a SLOW one (it
  // optimises captures, not speed) → it makes every time-medal look impossible.
  // A speed-runner uses short/firm moves; this search does too, so its fastest
  // line is a fair achievability floor for the top medal tier. (Still a bot,
  // not a human — a LOWER bound; feel-test medal times upward from it.)
  // Needs the optional adapter members time(w) [required] and activeTime(w)
  // [optional]. Give `spec` a generous budget via setBudget — the search never
  // spends real budget semantics, it measures the optimum the budget is set FROM.
  //   opts.maxStates  state budget                                    [40000]
  //   opts.priority   (world) -> number, the first sort key           [adapter.remaining]
  //                   (Tilt's original used its uncaptured-marble count — pass it
  //                   for bit-faithful reproduction; `remaining` is usually finer)
  function timeOptimum(adapter, spec, opts) {
    opts = opts || {};
    const maxStates = opts.maxStates || 40000;
    const priority = opts.priority || (w => adapter.remaining(w));   // wrapped: never a detached method
    if (typeof adapter.time !== "function") throw new Error("@jfun/difficulty: timeOptimum needs adapter.time(w)");
    const w = adapter.createWorld(spec);
    const active = () => adapter.activeTime ? adapter.activeTime(w) : 0;
    if (adapter.isWin(w)) return { par: 0, time: 0, active: 0 };
    const seen = new Map([[adapter.stateKey(w), 0]]);
    const pq = [{ s: adapter.snapshot(w), pri: priority(w), depth: 0, t: 0 }];
    let explored = 0, best = null;
    while (pq.length && explored < maxStates) {
      pq.sort((a, b) => a.pri - b.pri || a.t - b.t);
      const node = pq.shift();
      if (best && node.t >= best.time) continue;   // prune paths already slower than the best win
      // restore BEFORE listing moves — the move list must come from THIS node's
      // state, not whatever the previous expansion left in w. (Tilt's original
      // used a constant move list so this couldn't bite there; a state-dependent
      // listMoves silently searched the wrong action space. Caught in review;
      // pinned by the every-listMoves-on-an-enqueued-state test.)
      adapter.restore(w, node.s);
      for (const mv of adapter.listMoves(w)) {
        adapter.restore(w, node.s);
        adapter.applyMove(w, mv);
        explored++;
        const t = adapter.time(w);
        if (adapter.isWin(w)) { if (!best || t < best.time) best = { par: node.depth + 1, time: t, active: active() }; continue; }
        if (adapter.isLose(w)) continue;
        const key = adapter.stateKey(w);
        if (seen.has(key) && seen.get(key) <= t) continue;
        seen.set(key, t);
        pq.push({ s: adapter.snapshot(w), pri: priority(w), depth: node.depth + 1, t: t });
      }
    }
    return best;
  }

  // ADAPTER PREFLIGHT — the determinism contract every search result depends on
  // (Quarter's engine-tests doctrine: "without it the certification is a lie").
  // Three checks, all mechanical:
  //   1. snapshot → move → restore returns to the SAME state (round-trip);
  //   2. a restored world REPLAYS a move sequence identically to a fresh one
  //      (catches snapshot/restore omitting a mutable field — the Tilt scar
  //      where missing hole-filled flags leaked captures across branches);
  //   3. no hidden Math.random in the sim path (tripwire patch during a rollout).
  // Compares adapter.fingerprint(w) when provided, else stateKey(w) — stateKey
  // is often deliberately coarse (a dedup key, not a full fingerprint), so a
  // lossy snapshot CAN slip past it; give the adapter a fingerprint for teeth.
  // Returns { ok, problems: [string…] }. Run once before generating a campaign.
  function preflightAdapter(adapter, spec, opts) {
    opts = opts || {};
    const steps = opts.steps || 6;
    const fp = adapter.fingerprint || adapter.stateKey;
    const problems = [];
    try {
      const greedy = policyOf(adapter, "greedy");   // inside the try: a missing policy is a problem, not an escape
      // 1. round-trip
      let w = adapter.createWorld(spec);
      const fp0 = fp(w), s0 = adapter.snapshot(w);
      const mv0 = adapter.listMoves(w)[0];
      if (mv0 == null && !adapter.isWin(w)) problems.push("no moves at spawn (and not won) — preflight could not exercise snapshot/restore");
      if (mv0 != null) {
        adapter.applyMove(w, mv0);
        adapter.restore(w, s0);
        if (fp(w) !== fp0) problems.push("snapshot/restore round-trip diverges (restore left state '" + fp(w) + "' vs '" + fp0 + "')");
      }
      // 2. restored world replays identically to a fresh one
      const trace = ws => {
        const rng = mulberry32(1), out = [];
        for (let i = 0; i < steps; i++) {
          if (adapter.isWin(ws) || adapter.isLose(ws) || adapter.budgetLeft(ws) <= 0) break;
          const moves = adapter.listMoves(ws);
          if (!moves.length) break;
          adapter.applyMove(ws, greedy(ws, moves, rng));
          out.push(fp(ws));
        }
        return out.join("→");
      };
      const fresh = trace(adapter.createWorld(spec));
      w = adapter.createWorld(spec);
      const snap = adapter.snapshot(w);
      const mv = adapter.listMoves(w)[0];
      if (mv != null) adapter.applyMove(w, mv);
      adapter.restore(w, snap);
      const replayed = trace(w);
      if (replayed !== fresh) problems.push("restored world does not replay like a fresh one — snapshot/restore is missing mutable state (fresh " + fresh + " vs restored " + replayed + ")");
      // 3. Math.random tripwire over a short rollout
      const realRandom = Math.random;
      Math.random = function () { throw new Error("@jfun/difficulty preflight: Math.random called in the sim path"); };
      try { trace(adapter.createWorld(spec)); }
      catch (e) { problems.push(String(e.message || e)); }
      finally { Math.random = realRandom; }
    } catch (e) {
      problems.push("preflight threw: " + String(e && e.message || e));
    }
    return { ok: !problems.length, problems: problems };
  }

  return { beamOptimum, rollout, measureWR, greedyWins, tuneBudget, searchSeed, searchCandidate, timeOptimum, preflightAdapter, policyOf };
});
