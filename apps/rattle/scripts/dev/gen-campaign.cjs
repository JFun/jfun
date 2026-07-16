#!/usr/bin/env node
/* RATTLE — full campaign generator (T0–T7, 106 levels per the element ladder in
   design-4-rattle.md). Each level is authored by INTENT (tier element, objective,
   difficulty d∈[0,1] within the tier) and the PHYSICS picks a fair pile: we seed-
   search the same beam+greedy+reachability certifier verify.cjs uses.

   SAWTOOTH difficulty: every tier opens EASY (a breather when a new element lands)
   and ramps to hard — bigger objectives, denser elements, and a tightening tap
   slack (extra taps beyond the bot-optimal solve). The overall trend rises across
   tiers. First level of each element/toy tier is flagged `intro` (on-board coach-mark).

   Writes web/js/levels.js. Deterministic (fixed seed ranges, no RNG). Usage:
     node scripts/dev/gen-campaign.cjs            # generate all, write levels.js
     node scripts/dev/gen-campaign.cjs 39 52      # only a level range (debug, no write) */
const path = require("path");
const fs = require("fs");
const ENG = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));

/* ---- certifier (same policy as verify.cjs) ---- */
function remaining(w) {
  let r = 0;
  for (const o of w.objectives) {
    if (o.kind === "pop" || o.kind === "shells" || o.kind === "balloons") r += o.rem;
    else if (o.kind === "duck" && !w.duckDone) r += 8;
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
  const mv = ENG.poppableClusters(w).map(idxs => ({ type: "pop", idxs }));
  mv.push({ type: "rattle" });
  return mv;
}
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
        if (ENG.isWin(w)) return depth;
        if (ENG.isLose(w) || w.taps <= 0) continue;
        const rem = remaining(w);
        const key = rem + ":" + w.balls.reduce((n, b) => n + (b.alive ? 1 : 0), 0) + ":" + w.taps;
        kids.push({ snap: ENG.snapshot(w), score: rem, key });
      }
    }
    kids.sort((a, b) => a.score - b.score);
    frontier = [];
    for (const k of kids) { if (seen.has(k.key)) continue; seen.add(k.key); frontier.push(k); if (frontier.length >= width) break; }
    if (!frontier.length) break;
  }
  return null;
}
function greedy(spec, seed) {
  const w = ENG.createWorld(spec, seed);
  let guard = 0;
  while (w.phase === "play" && w.taps > 0 && guard++ < spec.taps + 6) {
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
// find the first seed (in a fixed window) that certifies this template with a
// generous budget; returns {seed, bot}. bot = fewest taps to win.
function findSeed(tmpl, slack) {
  for (let seed = 101; seed <= 720; seed++) {
    const spec = Object.assign({}, tmpl, { seed, taps: 24 });
    let bot;
    try { bot = beam(spec, 8, 24); } catch (e) { continue; }
    if (bot === null || bot < 2) continue;
    if (!balloonsReachable(spec)) continue;
    // confirm greedy wins at the EXACT budget we'll ship (bot + slack) — not a
    // looser proxy, or a tight level can pass here yet fail verify.cjs (FRAGILE).
    const gspec = Object.assign({}, spec, { taps: bot + slack });
    let g; try { g = greedy(gspec, seed); } catch (e) { continue; }
    if (!g) continue;
    return { seed, bot };
  }
  return null;
}

const lerp = (a, b, t) => a + (b - a) * t;
const ri = (a, b, t) => Math.round(lerp(a, b, t));
const clampi = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---- campaign schedule: the element ladder ---- */
const TIERS = [
  { key: "base",    from: 1,   to: 8,   colors: 3, el: null,      duck: false, obj: "pop"      },
  { key: "toy",     from: 9,   to: 16,  colors: 4, el: null,      duck: true,  obj: "duckpop"  },
  { key: "stone",   from: 17,  to: 26,  colors: 4, el: "stone",   duck: false, obj: "pop"      },
  { key: "shell",   from: 27,  to: 40,  colors: 4, el: "shell",   duck: false, obj: "shells"   },
  { key: "balloon", from: 41,  to: 54,  colors: 4, el: "balloon", duck: false, obj: "balloons" },
  { key: "bomb",    from: 55,  to: 70,  colors: 4, el: "bomb",    duck: false, obj: "pop"      },
  // finale: remix of all the strong elements, a 5th colour, tightest budget.
  // (ice + tar were CUT — friction changed motion, not decisions; see design-4-rattle.md.)
  { key: "combo",   from: 71,  to: 106, colors: 5, el: null,      duck: false, obj: "pop"      },
];
// per-element mix-density ramp (n at d=0 → n at d=1)
const ELDENS = { stone: [5, 13], shell: [4, 9], balloon: [4, 7], bomb: [3, 7] };
const COMBO_POOL = ["stone", "shell", "balloon", "bomb"];
const HINTS = {
  pop: "tap same-colour groups", duckpop: "bring the duck down",
  stone: "stones are dead weight — dig around them", shell: "pop right beside a crate to crack it",
  balloon: "pop beside a balloon to burst it", bomb: "pop beside a bomb to blow a hole",
  combo: "everything at once — plan the cascade",
};

function makeLevel(n) {
  const tier = TIERS.find(t => n >= t.from && n <= t.to);
  const len = tier.to - tier.from + 1, j = n - tier.from, d = len > 1 ? j / (len - 1) : 0;
  const tierIdx = TIERS.indexOf(tier);
  const count = ri(52, 76, d);
  const colors = tier.colors;
  const bias = { color: n % Math.max(1, colors - 1), share: lerp(0.48, 0.40, d) };
  const mix = [];
  if (tier.el) mix.push({ el: tier.el, n: ri(ELDENS[tier.el][0], ELDENS[tier.el][1], d) });
  // remix an earlier element in the harder half of an element tier
  const REMIX = { balloon: ["stone"], bomb: ["stone", "shell"] };
  if (REMIX[tier.key] && d > 0.55) mix.push({ el: REMIX[tier.key][n % REMIX[tier.key].length], n: ri(2, 4, d) });
  // COMBO finale: remix 1–2 of the strong elements, rotating by level
  if (tier.key === "combo") {
    const e1 = COMBO_POOL[n % 4];
    mix.push({ el: e1, n: ri(ELDENS[e1][0], Math.round((ELDENS[e1][0] + ELDENS[e1][1]) / 2), d) });
    if (d > 0.3) mix.push({ el: COMBO_POOL[(n + 1) % 4], n: ri(2, 4, d) });
  }
  const objs = [];
  const hintKey = tier.key === "base" ? "pop" : tier.key === "toy" ? "duckpop" : tier.key;
  if (tier.obj === "shells") { objs.push({ kind: "shells" }); if (d > 0.5) objs.push({ kind: "pop", color: bias.color, need: ri(11, 16, d) }); }
  else if (tier.obj === "balloons") { objs.push({ kind: "balloons" }); if (d > 0.5) objs.push({ kind: "pop", color: bias.color, need: ri(11, 16, d) }); }
  else if (tier.obj === "duckpop") { objs.push({ kind: "duck" }); objs.push({ kind: "pop", color: bias.color, need: ri(13, 18, d) }); }
  else { objs.push({ kind: "pop", color: bias.color, need: ri(14, 22, d) }); }
  const spec = { count, colors, duck: !!tier.duck, objs, bias, mix: mix.length ? mix : undefined };

  // SAWTOOTH slack (a bit harder — was 9→4): opens with a breather, ramps tight;
  // tightens across tiers so the combo finale is the pinch. Target ~80% first-try.
  const slack = clampi(ri(7, 3, d) - Math.floor(tierIdx * 0.3), 2, 8);
  let found = findSeed(spec, slack), useSlack = slack;
  if (!found) { found = findSeed(spec, slack + 1); useSlack = slack + 1; }   // loosen 1 if no seed is greedy-safe at the target slack
  if (!found) return { fail: true, n };
  const taps = found.bot + useSlack;
  const lv = { count, colors, taps, duck: !!tier.duck, seed: found.seed,
    objs, bias: { color: bias.color, share: +bias.share.toFixed(3) },
    hint: HINTS[hintKey] };
  if (mix.length) lv.mix = mix;
  // flag the debut level of each new element / the toy for the on-board coach-mark
  if (j === 0 && (tier.el || tier.duck)) lv.intro = tier.el || "duck";
  lv._bot = found.bot;
  return lv;
}

function fmt(lv) {
  const o = { count: lv.count, colors: lv.colors, taps: lv.taps, duck: lv.duck, seed: lv.seed };
  const parts = Object.entries(o).map(([k, v]) => k + ": " + JSON.stringify(v));
  parts.push("objs: " + JSON.stringify(lv.objs));
  if (lv.mix) parts.push("mix: " + JSON.stringify(lv.mix));
  parts.push("bias: " + JSON.stringify(lv.bias));
  if (lv.intro) parts.push('intro: "' + lv.intro + '"');
  parts.push('hint: ' + JSON.stringify(lv.hint));
  return "    { " + parts.join(", ") + " },";
}

const rangeArgs = process.argv.slice(2).map(Number);
const lo = rangeArgs[0] || 1, hi = rangeArgs[1] || 106;
const write = !rangeArgs.length;
const out = [];
let fails = 0;
const t0 = Date.now();
for (let n = lo; n <= hi; n++) {
  const lv = makeLevel(n);
  if (lv.fail) { console.error(`L${n} ✗ no certifying seed`); fails++; out.push(null); continue; }
  const tier = TIERS.find(t => n >= t.from && n <= t.to);
  console.error(`L${n} [${tier.key}] taps=${lv.taps} bot=${lv._bot} slack=${lv.taps - lv._bot} count=${lv.count}` + (lv.mix ? ` mix=${lv.mix.map(m => m.el + "×" + m.n).join(",")}` : "") + (lv.intro ? ` INTRO(${lv.intro})` : ""));
  out.push(lv);
}
console.error(`\n${hi - lo + 1 - fails}/${hi - lo + 1} generated in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${fails} fails`);

if (write && !fails) {
  const body = out.map(fmt).join("\n");
  const file = `/* RATTLE — full campaign (T0–T7, ${out.length} levels), generated by
   scripts/dev/gen-campaign.cjs per the element ladder in design-4-rattle.md.
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
  fs.writeFileSync(path.join(__dirname, "..", "..", "web", "js", "levels.js"), file);
  console.error("→ wrote web/js/levels.js (" + out.length + " levels)");
}
process.exit(fails ? 1 : 0);
