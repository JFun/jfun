#!/usr/bin/env node
/* RATTLE — campaign generator, @jfun/difficulty FRAMEWORK edition. The same
   106-level element-ladder campaign as gen-campaign.cjs, but the orchestration
   (per-level loop, relax escalation, per-class bands/scan, fallback flags,
   cadence + distribution verdicts, write/splice, exit codes) is the package's
   generateCampaign; this file is only what is genuinely Rattle's:
     - the curve closures (targetWR / slackFor / hardTier) — passed VERBATIM for
       bit-fidelity with the original (the declarative makers reproduce them
       exactly; campaign-tests pins maker(n) === verbatim(n) for all n 1..106);
     - the content schedule (TIERS / ELDENS / REMIX / COMBO_POOL / HINTS);
     - buildSpec: intent → spec, incl. the element-semantic beat bumps
       (bomb = player power → REDUCE; shell = par-inflating → HOLD;
       stone/balloon = genuine constraints → RAISE) and the relax walk-back;
     - the balloon-reachability guard (bots play fast and miss idle-time
       physics — buoyant balloons drift free and strand a slow human);
     - finalize + fmt/wrap (the levels.js serialization).
   Certification stays verify.cjs in test.sh, as ever.

   Usage (same contract as gen-campaign.cjs):
     node scripts/dev/gen-campaign2.cjs                 # full 106, write levels.js
     node scripts/dev/gen-campaign2.cjs 39 52           # range debug, no write
     node scripts/dev/gen-campaign2.cjs 79 79 splice    # regen a range into levels.js
     …plus --seedFrom=801 to shift a retune's seed scan past already-tried seeds.
   Exit: 0 clean · 1 generation failure (nothing written) · 2 written-but-flagged
   (fallback accept / cadence / distribution — the printed retune queue). NOTE:
   unlike the original, cadence+distribution are judged on EVERY run (the
   original only asserted cadence when writing) — a debug range can exit 2 where
   the original exited 0; the generated LEVELS are bit-identical regardless
   (gen-dogfood.cjs is the proof). */
const path = require("path");
const ENG = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const D = require(path.join(__dirname, "..", "..", "..", "..", "packages", "difficulty"));
const adapter = require(path.join(__dirname, "difficulty-adapter.cjs"));

const lerp = (a, b, t) => a + (b - a) * t;
const ri = (a, b, t) => Math.round(lerp(a, b, t));

/* ---- the shipped curve closures, VERBATIM from gen-campaign.cjs ---- */
function hardTier(n) {
  if (n <= 20) return null;   // teach + toy ramps, then stone settles in before the first labeled beat (L24)
  if (n === 106) return { key: "extreme", tgt: 0.45 };   // campaign finale
  const cyc = (n - 1) % 10;
  if (cyc === 3) return { key: "hard", tgt: 0.65 };
  if (cyc === 8) return ((n - 9) % 30 === 0) ? { key: "extreme", tgt: 0.45 } : { key: "super", tgt: 0.55 };
  return null;
}
function targetWR(n) {
  const ht = hardTier(n);
  if (ht) return ht.tgt;
  let base;
  if (n <= 8) base = lerp(0.94, 0.88, (n - 1) / 7);
  else if (n <= 16) base = lerp(0.86, 0.58, (n - 9) / 7);   // TOY tier: low target → accept band forces hard boards
  else {
    base = lerp(0.84, 0.76, (n - 17) / (106 - 17));         // normal levels: gentle decline
    const cyc = (n - 1) % 10;
    if (cyc === 9) base += 0.07;                            // breather right after the X9 beat
    else if (cyc === 0) base += 0.05;
  }
  return Math.max(0.42, Math.min(0.95, base));
}
function colorsFor(n) { return n <= 8 ? 3 : n <= 40 ? 4 : 5; }
function slackFor(n) {
  let s;
  if (n <= 4) s = 3;
  else if (n <= 8) s = 2;
  else if (n <= 16) s = Math.round(lerp(3, 1, (n - 9) / 7));   // toy tier owns its ramp
  else {
    const cyc = (n - 1) % 10;
    if (hardTier(n)) s = 1;              // every labeled beat is par+1 tight
    else if (cyc === 9 || cyc === 0) s = 3;   // breather right after the X9 beat
    else s = 2;
  }
  if (n > 40) s = Math.max(1, s - 1);
  if (n > 80) s = Math.max(1, s - 1);
  return s;
}

/* ---- content schedule (verbatim) ---- */
const TIERS = [
  { key: "base",    from: 1,   to: 8,   colors: 3, el: null,      duck: false, obj: "pop"      },
  { key: "toy",     from: 9,   to: 16,  colors: 4, el: null,      duck: true,  obj: "duckpop"  },
  { key: "stone",   from: 17,  to: 26,  colors: 4, el: "stone",   duck: false, obj: "pop"      },
  { key: "shell",   from: 27,  to: 40,  colors: 4, el: "shell",   duck: false, obj: "shells"   },
  { key: "balloon", from: 41,  to: 54,  colors: 4, el: "balloon", duck: false, obj: "balloons" },
  { key: "bomb",    from: 55,  to: 70,  colors: 4, el: "bomb",    duck: false, obj: "pop"      },
  { key: "combo",   from: 71,  to: 106, colors: 5, el: null,      duck: false, obj: "pop"      },
];
const ELDENS = { stone: [4, 11], shell: [3, 8], balloon: [3, 6], bomb: [3, 6] };
const COMBO_POOL = ["stone", "shell", "balloon", "bomb"];
const REMIX = { balloon: ["stone"], bomb: ["stone", "shell"] };
const HINTS = {
  pop: "tap same-colour groups", duckpop: "bring the duck down",
  stone: "stones are dead weight — dig around them", shell: "pop the crate's own colour right beside it",
  balloon: "pop beside a balloon to burst it", bomb: "pop beside a bomb to blow a hole",
  combo: "everything at once — plan the cascade",
};

/* ---- intent → spec (the exact spec-building half of the old makeLevel) ---- */
function coreSpec(n, relax, beat) {
  const tier = TIERS.find(t => n >= t.from && n <= t.to);
  const len = tier.to - tier.from + 1, j = n - tier.from, d = len > 1 ? j / (len - 1) : 0;
  const count = ri(54, 78, d);
  const colors = colorsFor(n);
  const bias = { color: n % Math.max(1, colors - 1), share: lerp(0.42, 0.34, d) };
  if (tier.key === "toy") bias.share = lerp(0.42, 0.31, d);   // scarce colour is the BINDING constraint
  const mix = [];
  if (tier.el) mix.push({ el: tier.el, n: ri(ELDENS[tier.el][0], ELDENS[tier.el][1], d) });
  if (REMIX[tier.key] && d > 0.55) mix.push({ el: REMIX[tier.key][n % REMIX[tier.key].length], n: ri(2, 4, d) });
  if (tier.key === "combo") {
    const e1 = COMBO_POOL[n % 4];
    mix.push({ el: e1, n: ri(ELDENS[e1][0], Math.round((ELDENS[e1][0] + ELDENS[e1][1]) / 2), d) });
    if (d > 0.3) mix.push({ el: COMBO_POOL[(n + 1) % 4], n: ri(2, 4, d) });
  }

  // labeled beats get intrinsically HARDER SPECS — a target alone can't harden a
  // board whose physics ceiling sits above it (the "SUPER HARD at 82%" scar)
  const bump = beat ? (beat.key === "extreme" ? 3 : beat.key === "super" ? 2 : 1) : 0;
  if (bump) bias.share = Math.max(0.24, +(bias.share - bump * 0.02).toFixed(3));
  const NEED_BUMP = [0, 2, 3, 5];

  const cut = relax * 3;
  const objs = [];
  if (tier.obj === "shells") { objs.push({ kind: "shells" }); objs.push({ kind: "pop", color: bias.color, need: Math.max(5, ri(9, 16, d) - cut) }); }
  else if (tier.obj === "balloons") { objs.push({ kind: "balloons" }); objs.push({ kind: "pop", color: bias.color, need: Math.max(5, ri(9, 16, d) - cut) }); }
  else if (tier.obj === "duckpop") { objs.push({ kind: "duck" }); objs.push({ kind: "pop", color: bias.color, need: Math.max(10, ri(11, 19, d) - cut) }); }
  else { objs.push({ kind: "pop", color: bias.color, need: Math.max(9, ri(14, 22, d) - cut) }); }
  if (bump) for (const o of objs) if (o.kind === "pop") o.need += NEED_BUMP[bump];

  let mixUsed = mix.length ? mix : undefined;
  if (mixUsed && relax > 0) {
    const m = mixUsed.map(x => Object.assign({}, x));
    m[0].n = Math.max(ELDENS[m[0].el] ? ELDENS[m[0].el][0] : 2, m[0].n - relax);   // thin the primary element
    mixUsed = m;
  }
  // element bumps on a beat respect what each element DOES (measured, not guessed):
  // bomb = PLAYER POWER → reduce (floor 2 keeps identity); shell = RAISES PAR →
  // hold (budget washes difficulty out); stone/balloon = constraints → raise.
  if (bump && mixUsed) mixUsed = mixUsed.map(m =>
    m.el === "bomb" ? Object.assign({}, m, { n: Math.max(2, m.n - bump) })
    : m.el === "shell" ? m
    : Object.assign({}, m, { n: Math.min(m.n + bump, 12) }));

  return { tier, j, spec: { count, colors, duck: !!tier.duck, objs, bias, mix: mixUsed } };
}

/* balloon-reachability guard, verbatim: run 3000 idle steps; every balloon must
   rest near a crackable neighbour or a slow human's board strands the objective */
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

/* ---- serialization (verbatim fmt + header) ---- */
function fmt(lv) {
  const o = { count: lv.count, colors: lv.colors, taps: lv.taps, par: lv.par, duck: lv.duck, seed: lv.seed };
  const parts = Object.entries(o).map(([k, v]) => k + ": " + JSON.stringify(v));
  parts.push("objs: " + JSON.stringify(lv.objs));
  if (lv.mix) parts.push("mix: " + JSON.stringify(lv.mix));
  parts.push("bias: " + JSON.stringify(lv.bias));
  if (lv.intro) parts.push('intro: "' + lv.intro + '"');
  if (lv.hard) parts.push('hard: "' + lv.hard + '"');
  parts.push('hint: ' + JSON.stringify(lv.hint));
  return "    { " + parts.join(", ") + " },";
}
function wrap(body) {
  const count = body.split("\n").length;   // matches the original's ${out.length}
  return `/* RATTLE — full campaign (T0–T7, ${count} levels), generated by
   scripts/dev/gen-campaign2.cjs per the element ladder in design-4-rattle.md.
   Sawtooth difficulty: each tier opens easy, ramps hard; slack tightens across
   the run. \`intro\` flags the on-board coach-mark for a new element/the duck.
   Every level is physics-certified (beam+greedy+balloon-reachability). Regenerate
   with the script — do not hand-edit. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RattleLevels = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const LEVELS = [
${body}
  ];
  return { LEVELS };
});
`;
}

/* ---- the plugin + plan ---- */
const plugin = {
  adapter,
  buildSpec: (n, o) => Object.assign(coreSpec(n, o.relax, o.beat).spec, { seed: o.seed }),
  guard: balloonsReachable,
  finalize: (n, found, spec, ctx) => {
    const { tier, j } = coreSpec(n, ctx.relax, ctx.beat);
    const hintKey = tier.key === "base" ? "pop" : tier.key === "toy" ? "duckpop" : tier.key;
    const lv = { count: spec.count, colors: spec.colors, taps: found.taps, par: found.par, duck: spec.duck, seed: found.seed,
      objs: spec.objs, bias: { color: spec.bias.color, share: +spec.bias.share.toFixed(3) },
      hint: HINTS[hintKey] };
    if (spec.mix && spec.mix.length) lv.mix = spec.mix;
    if (j === 0 && (tier.el || tier.duck)) lv.intro = tier.el || "duck";   // debut coach-mark
    if (ctx.beat) lv.hard = ctx.beat.key;                                  // HARD/SUPER/EXTREME badge
    return lv;
  },
  fmt, wrap,
  file: path.join(__dirname, "..", "..", "web", "js", "levels.js"),
  loadExisting: () => require(path.join(__dirname, "..", "..", "web", "js", "levels.js")).LEVELS,
};

const plan = {
  len: 106,
  targetWR, slackFor,
  beatFor: hardTier,
  classes: {
    normal:  { bandLo: 0.12, bandHi: 0.14, scanCap: 30, padCap: 2 },
    hard:    { bandLo: 0.22, bandHi: 0.07, scanCap: 60, padCap: 0 },   // beats ship at par+slack EXACTLY
    super:   { bandLo: 0.22, bandHi: 0.07, scanCap: 60, padCap: 0 },   // — the +2 greedy pad softened L59
    extreme: { bandLo: 0.22, bandHi: 0.07, scanCap: 60, padCap: 0 },
  },
  search: { seedLo: 101, seedHi: 800, beamWidth: 8, maxDepth: 12, parLo: 2, parHi: 10, nRoll: 60, policy: "attentive" },
  maxRelax: 3,
  cadence: { from: 17, adjacentHardMax: 0.66, breatherAfter: { classes: ["super", "extreme"], minWR: 0.72 } },
  distribution: { bandLo: 0.22, bandHi: 0.14, classMeanTol: 0.05 },
};

module.exports = { plugin, plan, hardTier, targetWR, slackFor };
if (require.main === module) process.exit(D.runCampaignCLI(plugin, plan));
