/* @jfun/difficulty — CAMPAIGN: the generation orchestrator. Node-only, dev-time.
   This is the layer every game was hand-rolling (Rattle's gen-campaign.cjs was
   ~440 lines of it): iterate the campaign, author each level BY INTENT, search a
   fair board onto the target curve, gate it, and verify the MEASURED difficulty
   distribution — cadence and all — before anything ships.

   What the framework owns: the loop, per-class bands/scan, the relax escalation,
   fallback detection, gate retries, cadence + distribution verdicts, the write/
   splice plumbing, and the exit-code contract. What the GAME owns (the plugin):
   its engine adapter, how intent becomes a spec (including element-semantic beat
   hardening — bomb=player-power→reduce, shell=par-inflating→hold), its REAL
   certifier (inside `evaluate` for non-bot-WR games — this package never
   implements a winnability certifier, per the package charter), its levelcheck
   fact extraction, and its serialization.

   PLUGIN contract (only the first three are required for generate-to-target):
     adapter                            — the GameAdapter (see ./harness.js)
     buildSpec(n, {relax, seed, beat})  -> spec    // intent → genome; apply beat
                                        // hardening INSIDE (game semantics), walk
                                        // it back as `relax` climbs
     finalize(n, found, spec, {beat, relax}) -> level  // freeze seed/par/budget/
                                        // labels — par is DATA from here on (the
                                        // pre-certified-par flow)
     guard?(spec) -> bool               // cheap per-seed gate (e.g. reachability)
     evaluate?(spec, n) -> {score, …}|null  // replaces the bot-WR default; the
                                        // game's REAL certifier runs inside it
     gates?(level, {pool, n}) -> {blocking:[{name,ok,detail}], advisory:[…]}
     fmt?(level) -> string; wrap?(body) -> fileString   // for writeLevels
     scoreOf?(board) -> number          // pool-ordering mode

   PLAN record (all curve inputs are FUNCTIONS (n)->v; ./curve.js + ./cadence.js
   makers are conveniences — a game may pass its shipped closures verbatim):
     len, targetWR(n), slackFor(n), beatFor?(n) -> {cls,tgt}|null,
     classes?: { normal: {bandLo,bandHi,scanCap,padCap}, hard: {…}, … },
     search?: { seedLo,seedHi,beamWidth,maxDepth,parLo,parHi,nRoll,policy },
     maxRelax [3], gateRetries [2],
     cadence?: cfg for checkCadence, distribution?: cfg for checkDistribution.

   EXIT-CODE CONTRACT: 0 = generated, in-band, cadence clean, gates green.
   1 = generation or blocking-gate failure — write NOTHING. 2 = WRITTEN, but
   flagged (cadence violation | fallback accept | distribution outlier): the
   file is usable, the flags are the retune queue. Escalation for a stubborn
   level, in order: widen its class's scanCap → allow one more relax → adjust
   the plugin's beat bump. NEVER silently widen an accept band — band edits are
   plan edits, visible in a diff. */
"use strict";
const fs = require("fs");
const H = require("./harness.js");
const CAD = require("./cadence.js");
const POOL = require("./pool.js");

const clsOf = b => b ? (b.cls || b.key || "hard") : "normal";   // legacy {key} beats welcome

/* ---- generateCampaign(plugin, plan, opts) → run record ----
   opts: lo/hi (sub-range; default 1..plan.len), existing (the currently-shipped
   level specs, REQUIRED for honest splice cadence — see below), onRow(row).
   Returns { rows, levels, fails, fallbacks, advisories, cadence, distribution,
   exitCode }. levels[] aligns with the RANGE (levels[n - lo], null for a failed
   level); rows contains only the successfully generated levels. */
function generateCampaign(plugin, plan, opts) {
  opts = opts || {};
  const lo = opts.lo || 1, hi = opts.hi || plan.len;
  const maxRelax = plan.maxRelax == null ? 3 : plan.maxRelax;
  const gateRetries = plan.gateRetries == null ? 2 : plan.gateRetries;

  // preflight: a broken snapshot/restore or hidden RNG makes every number below
  // a lie — fail the whole run before spending minutes on it.
  const pre = H.preflightAdapter(plugin.adapter, plugin.buildSpec(lo, { relax: 0, seed: (plan.search && plan.search.seedLo) || 101, beat: null }));
  if (!pre.ok) return { rows: [], levels: [], fails: [{ n: lo, why: "preflight: " + pre.problems.join("; ") }], fallbacks: [], advisories: [], cadence: { ok: false, violations: [] }, distribution: null, exitCode: 1 };

  const rows = [], levels = [], fails = [], fallbacks = [], advisories = [];
  for (let n = lo; n <= hi; n++) {
    const beat = plan.beatFor ? plan.beatFor(n) : null;
    const cls = clsOf(beat);
    const K = Object.assign({}, plan.search, plan.classes && plan.classes[cls]);
    const skipSeeds = new Set();
    const searchOpts = Object.assign({ targetWR: plan.targetWR, slackFor: plan.slackFor, guard: plugin.guard, skipSeeds: skipSeeds }, K);

    let found = null, relaxUsed = 0, level = null, gaveUp = null;
    for (let retry = 0; retry <= gateRetries && !level; retry++) {
      found = null;
      for (let relax = 0; relax <= maxRelax && !found; relax++) {   // escalate only when NOTHING certified
        relaxUsed = relax;
        const build = seed => plugin.buildSpec(n, { relax: relax, seed: seed, beat: beat });
        found = plugin.evaluate
          ? H.searchCandidate((spec) => plugin.evaluate(spec, n), build, n, searchOpts)
          : H.searchSeed(plugin.adapter, build, n, searchOpts);
      }
      if (!found) {   // keep an earlier gate diagnosis — a dry post-gate re-search must not clobber WHY the seed was excluded
        gaveUp = gaveUp ? gaveUp + "; then no candidate left after excluding " + skipSeeds.size + " gate-dead seed(s)"
          : "no certifying seed after relax " + maxRelax;
        break;
      }
      const spec = plugin.buildSpec(n, { relax: relaxUsed, seed: found.seed, beat: beat });
      const cand = plugin.finalize(n, found, spec, { beat: beat, relax: relaxUsed });
      if (plugin.gates) {
        const g = plugin.gates(cand, { pool: levels.filter(Boolean), n: n });
        const bad = (g.blocking || []).filter(x => !x.ok);
        if (bad.length) {
          skipSeeds.add(found.seed);   // this seed is gate-dead — exclude and re-search
          gaveUp = "blocking gate: " + bad.map(x => x.name + (x.detail ? " (" + x.detail + ")" : "")).join(", ");
          continue;
        }
        for (const a of (g.advisory || [])) if (!a.ok) advisories.push({ n: n, name: a.name, detail: a.detail });
      }
      level = cand;
    }
    if (!level) { fails.push({ n: n, why: gaveUp }); levels.push(null); continue; }

    if (!found.inBand) fallbacks.push({ n: n, score: found.score != null ? found.score : found.wr, tgt: plan.targetWR(n) });   // fallback accept — NEVER silent
    const row = { n: n, cls: cls, seed: found.seed, par: found.par, budget: found.taps != null ? found.taps : found.budget, wr: found.score != null ? found.score : found.wr, inBand: found.inBand, relax: relaxUsed };
    rows.push(row);
    levels.push(level);
    if (opts.onRow) opts.onRow(row, level);
  }

  // SPLICE-SEAM RE-MEASURE: measured wr is not persisted for untouched levels
  // (the Rattle gotcha — assertCadence only saw freshly-generated rows), so a
  // sub-range regen re-measures the one shipped level adjacent to each seam and
  // judges cadence across it. Needs opts.existing = the shipped spec array.
  let cadRows = rows.slice();
  if (opts.existing && (lo > 1 || hi < plan.len)) {
    const seam = [];
    if (lo > 1 && opts.existing[lo - 2]) seam.push({ n: lo - 1, spec: opts.existing[lo - 2] });
    if (hi < plan.len && opts.existing[hi]) seam.push({ n: hi + 1, spec: opts.existing[hi] });
    for (const s of seam) {
      const beat = plan.beatFor ? plan.beatFor(s.n) : null;
      const wr = plugin.evaluate
        ? (plugin.evaluate(s.spec, s.n) || {}).score
        : H.measureWR(plugin.adapter, s.spec, (plan.search && plan.search.policy) || "attentive", (plan.search && plan.search.nRoll) || 60).wr;
      if (wr != null) cadRows.push({ n: s.n, cls: clsOf(beat), wr: wr, seam: true });
      else advisories.push({ n: s.n, name: "seam-remeasure-failed", detail: "shipped neighbour did not evaluate — cadence across this seam is UNCHECKED" });
    }
    cadRows.sort((a, b) => a.n - b.n);
  }

  const cadence = CAD.checkCadence(cadRows, plan.cadence);
  const distribution = CAD.checkDistribution(rows, Object.assign({ targetWR: plan.targetWR }, plan.distribution));
  const exitCode = fails.length ? 1
    : (cadence.violations.length || fallbacks.length || distribution.outliers.length) ? 2 : 0;
  return { rows: rows, levels: levels, fails: fails, fallbacks: fallbacks, advisories: advisories, cadence: cadence, distribution: distribution, exitCode: exitCode };
}

/* ---- orderCampaign(plugin, pool, plan) — pool-ordering mode ----
   pool: proven boards. plan.order: { cycle?, minFlips, finaleMax, permutation? }.
   With plan.order.permutation, VALIDATES the hand-pinned order (the shipping
   gate); without it, PROPOSES one via sawtoothOrder — print it for hand-pinning,
   never auto-apply (board identity must stay keyed by source: the Tilt renumber
   scar). Ordering is cheap → fail hard, exit 0/1, no "written but flagged". */
function orderCampaign(plugin, pool, plan) {
  const ord = plan.order || {};
  const scores = pool.map(plugin.scoreOf);
  const perm = ord.permutation || POOL.sawtoothOrder(scores, ord);
  const violations = [];
  if (!POOL.validPermutation(perm, pool.length)) violations.push({ type: "invalid-permutation", detail: "not a permutation of 0.." + (pool.length - 1) });
  const verdict = POOL.checkOrder(perm.map(i => scores[i]), ord);
  violations.push.apply(violations, verdict.violations);
  return { perm: perm, scores: scores, flips: verdict.flips, violations: violations, proposed: !ord.permutation, exitCode: violations.length ? 1 : 0 };
}

/* ---- sampleAccept — the rejection-sampling generator skeleton (Tilt genPuzzle
   pattern: seeded attempts, attempt-derived rng, accept() is the game's REAL
   certifier and the only truth source — "never ship a lie"). Committed
   scripts/dev/gen-*.cjs built on this are the permanent home offline generators
   never had (Tilt's W2/W3 generators lived in scratchpads and are LOST — a
   pinned CURATED table must name the committed script that produced it). ----
   propose(rng, attempt) -> candidate|null; accept(candidate) -> truthy|{ok}. */
function sampleAccept(propose, accept, opts) {
  opts = opts || {};
  const seed = opts.seed == null ? 1 : opts.seed;
  const attempts = opts.attempts || 400, stride = opts.stride || 977;
  const mulberry32 = require("./curve.js").mulberry32;
  // accept() may return a boolean or a { ok, … } verdict. An object that CARRIES
  // an `ok` key must say ok === true — { ok: undefined } is a bug upstream, not
  // an accept. A truthy object without `ok` (bare metadata) accepts.
  const passes = v => v === true || (!!v && (typeof v !== "object" || !("ok" in v) || v.ok === true));
  for (let a = 0; a < attempts; a++) {
    const cand = propose(mulberry32((seed + a * stride) >>> 0), a);
    if (!cand) continue;
    const v = accept(cand);
    if (passes(v)) return { cand: cand, verdict: v, attempt: a };
  }
  return null;
}

/* ---- loadBearing — the two-sided element gate: the level must be solvable
   WITH its element AND unsolvable (within a BIGGER budget) with the element
   neutralized — else the element is decorative (Tilt's 9/15 skippable gates).
   certify(spec, budget) -> {ok,…} is the game's REAL certifier; neutralize is
   the game's transform (gates→walls, remove-post…). The must-fail half runs at
   budget×failFactor because exhaustion stands in for proof there — and BOTH
   failure verdicts are budget-relative, never deadness claims (direction rule):
   "uncertified" = the certifier found no line within budget (a red flag to
   inspect, NOT proof of impossibility — Tilt doctrine), "not-load-bearing" =
   the element is decorative. NOTE: with budget omitted, both calls pass
   undefined (the certifier's own default) and the ×failFactor asymmetry is
   LOST — pass an explicit budget when the asymmetry matters. */
function loadBearing(certify, spec, neutralize, opts) {
  opts = opts || {};
  const budget = opts.budget, failFactor = opts.failFactor == null ? 2 : opts.failFactor;
  const c1 = certify(spec, budget);
  if (!c1.ok) return { ok: false, why: "uncertified", cert: c1 };
  const c2 = certify(neutralize(spec), budget == null ? undefined : budget * failFactor);
  if (c2.ok) return { ok: false, why: "not-load-bearing", cert: c2 };
  return { ok: true, cert: c1 };
}

/* ---- writeLevels — serialize via the plugin, whole-file or splice ----
   cfg: fmt(level) -> line, wrap(body) -> whole file (whole-file mode),
   spliceRange: [lo, hi] + existing (all shipped levels; the range is replaced),
   spliceRegex: matches the levels block to replace [default: Rattle's
   `const LEVELS = [...]` — override it; regex-splicing is inherently fragile,
   which is why the default is exposed rather than buried],
   spliceWrap(body) -> replacement block [default rebuilds the Rattle-shaped
   `const LEVELS = [...]` — a game overriding spliceRegex almost certainly
   needs to override this too, or the default shape corrupts its file]. */
const DEFAULT_SPLICE_RE = /const LEVELS = \[[\s\S]*?\n  \];/;
function writeLevels(file, levels, cfg) {
  cfg = cfg || {};
  const fmt = cfg.fmt;
  if (cfg.spliceRange) {
    const all = cfg.existing.slice();
    const lo = cfg.spliceRange[0], hi = cfg.spliceRange[1];
    for (let n = lo; n <= hi; n++) all[n - 1] = levels[n - lo];
    const body = all.map(fmt).join("\n");
    const src = fs.readFileSync(file, "utf8");
    const re = cfg.spliceRegex || DEFAULT_SPLICE_RE;
    if (!re.test(src)) throw new Error("writeLevels: spliceRegex matched nothing in " + file);
    const block = (cfg.spliceWrap || (b => "const LEVELS = [\n" + b + "\n  ];"))(body);
    fs.writeFileSync(file, src.replace(re, () => block));   // fn replacement: level text may contain $-patterns
    return all.length;
  }
  fs.writeFileSync(file, cfg.wrap(levels.map(fmt).join("\n")));
  return levels.length;
}

/* ---- runCampaignCLI — the standard driver: parse [lo hi] [splice]
   [--seedFrom=k], generate, report, write, exit. Mirrors gen-campaign.cjs's
   contract: no args = full run + write; a range = debug print, no write;
   `splice` + range = regenerate the range into the existing file.
   --seedFrom shifts the seed scan window so a retune splice explores FRESH
   seeds instead of re-finding the same inBand:false fallback. Prints the
   retune queue as ready-to-run splice commands. */
function runCampaignCLI(plugin, plan, argv) {
  argv = argv || process.argv.slice(2);
  const splice = argv.indexOf("splice") >= 0;
  const seedFrom = (argv.find(a => /^--seedFrom=\d+$/.test(a)) || "").split("=")[1];
  const nums = argv.filter(a => !a.startsWith("--")).map(Number).filter(x => !isNaN(x));
  const lo = nums[0] || 1, hi = nums[1] || plan.len;
  const write = splice || !nums.length;
  if (seedFrom) {   // SHIFT the scan window, don't shrink it — seedLo alone past
    // seedHi (default 800) would scan ZERO seeds and every retune would exit 1
    const oldLo = (plan.search && plan.search.seedLo) || 101;
    const oldHi = (plan.search && plan.search.seedHi) || 800;
    plan = Object.assign({}, plan, { search: Object.assign({}, plan.search, { seedLo: +seedFrom, seedHi: oldHi + (+seedFrom - oldLo) }) });
  }

  let existing = null;
  try { existing = plugin.loadExisting ? plugin.loadExisting() : null; } catch (e) { existing = null; }
  if (splice && !existing) {   // fail loud BEFORE spending minutes generating
    console.error("splice needs the existing levels (plugin.loadExisting failed or missing) — aborting");
    return 1;
  }
  const t0 = Date.now();
  const run = generateCampaign(plugin, plan, {
    lo: lo, hi: hi, existing: existing,
    onRow: (row, level) => console.error(
      "L" + String(row.n).padStart(3) + (row.cls !== "normal" ? " [" + row.cls.toUpperCase() + "]" : "") +
      " seed=" + row.seed + " par=" + row.par + " bud=" + row.budget +
      " | " + Math.round(row.wr * 100) + "% (tgt " + Math.round(plan.targetWR(row.n) * 100) + "%)" +
      (row.inBand ? "" : "  ⚠ FALLBACK") + (row.relax ? " relax=" + row.relax : "")),
  });
  console.error("\n" + (hi - lo + 1 - run.fails.length) + "/" + (hi - lo + 1) + " generated in " + Math.round((Date.now() - t0) / 1000) + "s, " + run.fails.length + " fails");
  for (const f of run.fails) console.error("L" + f.n + " ✗ " + f.why);
  for (const v of run.cadence.violations) console.error("⚠ CADENCE " + v.type + ": L" + v.nA + "→L" + v.nB + (v.wr != null ? " (" + Math.round(v.wr * 100) + "%)" : ""));
  const d = run.distribution;
  if (d) {
    for (const c of Object.keys(d.classes)) { const x = d.classes[c]; console.error((x.ok ? "  " : "⚠ ") + c.padEnd(8) + " mean " + Math.round(x.meanWR * 100) + "% vs tgt " + Math.round(x.meanTgt * 100) + "% (" + x.count + " lvls)"); }
    const retune = [...new Set([...run.fallbacks.map(f => f.n), ...d.outliers.map(o => o.n), ...run.cadence.violations.map(v => v.nB)])].sort((a, b) => a - b);
    if (retune.length) { console.error("\nretune queue:"); for (const n of retune) console.error("  node " + (process.argv[1] || "gen").replace(process.cwd() + "/", "") + " splice " + n + " " + n + " --seedFrom=" + (((plan.search && plan.search.seedLo) || 101) + 700)); }
  }
  for (const a of run.advisories) console.error("~ advisory L" + a.n + " " + a.name + (a.detail ? ": " + a.detail : ""));

  if (write && !run.fails.length && plugin.file && plugin.fmt && (splice || plugin.wrap)) {
    if (splice) writeLevels(plugin.file, run.levels, { fmt: plugin.fmt, spliceRange: [lo, hi], existing: existing, spliceRegex: plugin.spliceRegex, spliceWrap: plugin.spliceWrap });
    else writeLevels(plugin.file, run.levels, { fmt: plugin.fmt, wrap: plugin.wrap });
    console.error("→ wrote " + plugin.file);
  }
  return run.exitCode;
}

module.exports = { generateCampaign, orderCampaign, sampleAccept, loadBearing, writeLevels, runCampaignCLI };
