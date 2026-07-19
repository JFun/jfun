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
    // colour-gated crates: while shells remain, their colours ARE objective colours
    if (w.objectives.some(o => o.kind === "shells" && o.rem > 0))
      for (const b of w.balls) if (b.alive && b.shelled) objColors.add(b.c);
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
// pick a fair, TIGHT board for level n. Budget is bot-optimal + a sawtooth slack
// (slackFor) — the primary difficulty lever, and exactly the "fewer taps" Qi asked
// for. fairBudget guarantees a perfect player can still win. We then measure the
// attentive-player WR once at that budget and accept the first seed whose WR sits in
// the target band (a light filter that rejects seed-variance outliers); else the
// closest of up to 30 certifiable seeds. One WR sweep per seed (fast). {seed,bot,taps,wr}.
function findSeed(spec, n) {
  const tgt = targetWR(n);
  let best = null, scanned = 0;
  for (let seed = 101; seed <= 800; seed++) {
    const s = Object.assign({}, spec, { seed, taps: 12 });
    let bot; try { bot = beam(s, 8, 12); } catch (e) { continue; }   // depth 12: bot>10 is rejected anyway — identical accepts, ~2x faster rejects
    if (bot === null || bot < 2 || bot > 10) continue;
    if (!balloonsReachable(s)) continue;
    const taps = fairBudget(spec, seed, bot, n);   // bot + scheduled slack, greedy-winnable
    if (taps === null) continue;
    const wr = playWR(Object.assign({}, spec, { seed, taps }), 60);
    const cand = { seed, bot, taps, wr };
    // accept the first acceptable board, biased to the HARD side (allow a little harder
    // than target, less easier) so the campaign trends tough. Fallback = closest to target.
    // NORMAL levels get a TIGHT low band — they must never accidentally land hard next
    // to a labeled beat (the cadence guarantees hard levels are never adjacent).
    const isBeat = !!hardTier(n);
    const bandLo = isBeat ? 0.22 : 0.12, bandHi = isBeat ? 0.07 : 0.14;   // beats must not land soft — a HARD label at normal-WR lies
    if (wr <= tgt + bandHi && wr >= tgt - bandLo) return cand;
    if (!best || Math.abs(wr - tgt) < Math.abs(best.wr - tgt)) best = cand;
    if (++scanned >= (hardTier(n) ? 60 : 30)) break;   // beats scan deeper — tight-budget seeds are rarer
  }
  return best;   // closest certifiable board (null only if nothing certified at all)
}

const lerp = (a, b, t) => a + (b - a) * t;
const ri = (a, b, t) => Math.round(lerp(a, b, t));
const clampi = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---- difficulty tuning: set the tap budget so the ATTENTIVE-player win-rate hits
   the target curve. Attentive policy = pop the biggest OBJECTIVE-colour cluster (else
   biggest), 10% noise — a normal player who reads the goal. This is the REALISTIC
   human proxy: the old "casual" bot ignored the objective + played 20% random, so it
   under-modelled a real player and left the game far too easy (Qi cleared ~everything
   to L50). Tighter budgets = fewer taps = the fix. measure.cjs reports both bots. ---- */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function objColors(w) {
  const s = new Set(w.objectives.filter(o => o.kind === "pop" && o.rem > 0).map(o => o.color));
  // colour-gated crates: while shells remain, their colours ARE objective colours
  if (w.objectives.some(o => o.kind === "shells" && o.rem > 0))
    for (const b of w.balls) if (b.alive && b.shelled) s.add(b.c);
  return s;
}
function pickPlay(w, cls, rng) {
  if (!cls.length) return "rattle";
  const oc = objColors(w);
  const oj = cls.filter(c => oc.has(w.balls[c[0]].c));
  const pool = (oj.length && rng() > 0.10) ? oj : cls;   // reads the objective, 10% slips
  return pool.reduce((a, b) => b.length > a.length ? b : a);
}
function playRollout(spec, rng) {
  const w = ENG.createWorld(spec);
  let guard = 0;
  while (w.phase === "play" && w.taps > 0 && guard++ < spec.taps + 8) {
    const mv = pickPlay(w, ENG.poppableClusters(w), rng);
    if (mv === "rattle") { if (w.taps <= 0) break; w.taps--; w.tapCounter++; ENG.applyRattle(w); }
    else { w.taps--; w.tapCounter++; ENG.popClusterIdx(w, mv); }
    ENG.settle(w);
  }
  return ENG.isWin(w);
}
function playWR(spec, nRoll) {
  let wins = 0;
  for (let i = 0; i < nRoll; i++) if (playRollout(spec, mulberry32((spec.seed ^ (i * 0x9e3779b9 + 1)) >>> 0))) wins++;
  return wins / nRoll;
}
// first-try target for a NORMAL attentive player (tighter than the old casual-tuned
// curve): teach ~0.92 → normal baseline ~0.70–0.80 → hard beats (cycle end) dip to
// ~0.54, breathers ~0.84; floor 0.50. Sawtooth on a ~10-level cycle.
/* ---- 3-TIER HARD CADENCE (Qi 2026-07-17 after the flow/Royal-Match research):
   predictable, labeled, evenly-spaced hard beats — never adjacent, breather right
   after each X9. Old curve dipped cyc 8 AND 9 → consecutive hard levels BY DESIGN
   (measured collisions at L68-69/L88-90/L98-100/L105-106); this replaces it.
     X4  (L24,34,44…)             → HARD            tgt 65%
     X9  (L29,49,59,79,89…)       → SUPER HARD      tgt 55%
     X9 every 3rd cycle (39,69,99) + finale 106 → EXTREMELY HARD  tgt 45%
   Normals hold a gentle 84→76% decline; the X10/X1 after a super are breathers.
   Magnitudes match the genre (RM inferred: normal ~83 / hard ~60 / super ~40). */
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
// colour count is the sharpest lever in a collapse game: 3 = giant clusters (teach),
// 4 = normal, 5 = clusters starve → forced rattles → real planning depth.
function colorsFor(n) { return n <= 8 ? 3 : n <= 40 ? 4 : 5; }
// SLACK over the bot-optimal tap count — the primary difficulty lever. A sawtooth:
// each 10-level cycle opens loose (breather after a hard beat) and tightens to par
// (slack 0) on the last two levels; the back half of the campaign runs a tap tighter
// still. This is "fewer taps" made systematic — the old campaign shipped slack up to
// +8, which is why a normal player cleared everything first try.
function slackFor(n) {
  let s;
  if (n <= 4) s = 3;                     // very first levels: a little room to learn
  else if (n <= 8) s = 2;                // rest of teach
  else if (n <= 16) s = Math.round(lerp(3, 1, (n - 9) / 7));   // TOY tier owns its ramp
                                         // (breather→hard beat) — the 10-cycle misaligns here,
                                         // leaving the duck tier flat; a tier-relative ramp fixes it.
  else {
    const cyc = (n - 1) % 10;            // position in the 3-tier cadence
    if (hardTier(n)) s = 1;              // every labeled beat (X4/X9/finale) is par+1 tight
    else if (cyc === 9 || cyc === 0) s = 3;   // breather right after the X9 beat
    else s = 2;                          // normals
  }
  if (n > 40) s = Math.max(1, s - 1);    // back half: one tap tighter across the board
  if (n > 80) s = Math.max(1, s - 1);    // finale: tightest
  return s;                              // floor 1: taps is ALWAYS ≥ par+1 so the efficiency-star
                                         // grade never degenerates (par==taps → auto-3★/PERFECT).
}
// bot + scheduled slack, GUARANTEEING a perfect (greedy) player can win — but with a
// TIGHT cap: give greedy at most 2 taps beyond the schedule (never a loose par+5..7 board
// that reads as generous and undercuts the "harder" goal). If greedy still can't win in
// that window, return null so findSeed REJECTS this seed and tries a greedy-friendlier one.
function fairBudget(spec, seed, bot, n) {
  const sched = bot + slackFor(n);
  // labeled beats ship at par+slack EXACTLY — the +2 greedy pad softened L59 to 73%.
  // If greedy cannot win this seed at the tight budget, findSeed rejects the SEED.
  const cap = hardTier(n) ? sched : Math.min(sched + 2, bot + 5);   // pad only for normals
  for (let taps = sched; taps <= cap; taps++) {
    if (greedy(Object.assign({}, spec, { seed, taps }), seed)) return taps;
  }
  return null;
}

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
const ELDENS = { stone: [4, 11], shell: [3, 8], balloon: [3, 6], bomb: [3, 6] };
const COMBO_POOL = ["stone", "shell", "balloon", "bomb"];
const HINTS = {
  pop: "tap same-colour groups", duckpop: "bring the duck down",
  stone: "stones are dead weight — dig around them", shell: "pop the crate's own colour right beside it",
  balloon: "pop beside a balloon to burst it", bomb: "pop beside a bomb to blow a hole",
  combo: "everything at once — plan the cascade",
};

function makeLevel(n) {
  const tier = TIERS.find(t => n >= t.from && n <= t.to);
  const len = tier.to - tier.from + 1, j = n - tier.from, d = len > 1 ? j / (len - 1) : 0;
  const tierIdx = TIERS.indexOf(tier);
  const count = ri(54, 78, d);
  const colors = colorsFor(n);                        // 3→4→5 across the campaign (the sharp lever)
  const bias = { color: n % Math.max(1, colors - 1), share: lerp(0.42, 0.34, d) };   // scarcer objective → can't just pop the biggest group
  // TOY tier: scarcer objective colour at the hard end so the scarce-colour pop is the
  // BINDING constraint, not the "free" duck-fall — otherwise the tier stays flat/easy.
  if (tier.key === "toy") bias.share = lerp(0.42, 0.31, d);   // moderate intro → scarcer hard end
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
  const hintKey = tier.key === "base" ? "pop" : tier.key === "toy" ? "duckpop" : tier.key;
  // element tiers ALWAYS carry a scarce-colour pop co-objective: "clear the shells AND
  // pop N blue" under a tight budget is where efficiency (and failure) lives. Without it,
  // "crack all shells" has no wasteful move, so tap-tightening can't harden it (L30 sat
  // at 100% WR even at par) — measured, not guessed. need ramps with difficulty.
  // `relax` (0..) trims the co-objective + mix so a too-dense board (bot>cap) still yields
  // a certifiable level rather than a hard fail that would abort the whole write.
  function buildObjs(relax) {
    const objs = [];
    const cut = relax * 3;
    if (tier.obj === "shells") { objs.push({ kind: "shells" }); objs.push({ kind: "pop", color: bias.color, need: Math.max(5, ri(9, 16, d) - cut) }); }
    else if (tier.obj === "balloons") { objs.push({ kind: "balloons" }); objs.push({ kind: "pop", color: bias.color, need: Math.max(5, ri(9, 16, d) - cut) }); }
    else if (tier.obj === "duckpop") { objs.push({ kind: "duck" }); objs.push({ kind: "pop", color: bias.color, need: Math.max(10, ri(11, 19, d) - cut) }); }
    else { objs.push({ kind: "pop", color: bias.color, need: Math.max(9, ri(14, 22, d) - cut) }); }
    return objs;
  }
  function trimMix(relax) {
    if (!mix.length || relax === 0) return mix.length ? mix : undefined;
    const m = mix.map(x => Object.assign({}, x));
    m[0].n = Math.max(ELDENS[m[0].el] ? ELDENS[m[0].el][0] : 2, m[0].n - relax);   // thin the primary element
    return m;
  }

  // LABELED BEATS get intrinsically HARDER SPECS — a target alone can't harden a
  // board whose physics ceiling sits above it (first cadence regen shipped a "SUPER
  // HARD" L79 measuring 82%: every seed was too easy, so the fallback won). Bigger
  // objective + denser elements + scarcer colour pull the ceiling down into band;
  // the relax loop still walks it back if the spec over-shoots into uncertifiable.
  const beat = hardTier(n);
  const bump = beat ? (beat.key === "extreme" ? 3 : beat.key === "super" ? 2 : 1) : 0;
  if (bump) bias.share = Math.max(0.24, +(bias.share - bump * 0.02).toFixed(3));
  const NEED_BUMP = [0, 2, 3, 5];

  // findSeed picks a seed AND a tight sawtooth tap budget (bot + slackFor), then
  // certifies the attentive-player win-rate lands near this level's target. Degrade the
  // objective if a board is too dense to certify, so generation never aborts mid-run.
  const tgt = targetWR(n);
  let found = null, objs = null, mixUsed = null;
  for (let relax = 0; relax <= 3 && !found; relax++) {
    objs = buildObjs(relax);
    if (bump) for (const o of objs) if (o.kind === "pop") o.need += NEED_BUMP[bump];
    mixUsed = trimMix(relax);
    // Element bumps on a beat must respect what each element DOES:
    //   bomb  = PLAYER POWER → REDUCE it (more bombs made L99 read 80%; a hard level
    //           hands you fewer helpers — the CC/RM pattern). Floor 2 keeps identity.
    //   shell = RAISES PAR → leave alone (more crates → bigger budget → difficulty
    //           washes out; L39 measured 58%→85% with shell×10).
    //   stone/balloon = genuine constraints → bump. Real levers stay need + scarcity.
    if (bump && mixUsed) mixUsed = mixUsed.map(m =>
      m.el === "bomb" ? Object.assign({}, m, { n: Math.max(2, m.n - bump) })
      : m.el === "shell" ? m
      : Object.assign({}, m, { n: Math.min(m.n + bump, 12) }));
    found = findSeed({ count, colors, duck: !!tier.duck, objs, bias, mix: mixUsed }, n);
  }
  if (!found) return { fail: true, n };
  const lv = { count, colors, taps: found.taps, par: found.bot, duck: !!tier.duck, seed: found.seed,
    objs, bias: { color: bias.color, share: +bias.share.toFixed(3) },
    hint: HINTS[hintKey] };
  if (mixUsed && mixUsed.length) lv.mix = mixUsed;
  // flag the debut level of each new element / the toy for the on-board coach-mark
  if (j === 0 && (tier.el || tier.duck)) lv.intro = tier.el || "duck";
  const ht = hardTier(n);
  if (ht) lv.hard = ht.key;   // labeled beat → the game shows a HARD/SUPER/EXTREME badge
  lv._bot = found.bot; lv._wr = found.wr; lv._tgt = tgt;
  return lv;
}

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

const splice = process.argv.includes("splice");   // regenerate a range and splice into existing levels.js
const rangeArgs = process.argv.slice(2).map(Number).filter(x => !isNaN(x));
const lo = rangeArgs[0] || 1, hi = rangeArgs[1] || 106;
const write = !rangeArgs.length;
const out = [];
let fails = 0;
const t0 = Date.now();
for (let n = lo; n <= hi; n++) {
  const lv = makeLevel(n);
  if (lv.fail) { console.error(`L${n} ✗ no certifying seed`); fails++; out.push(null); continue; }
  const tier = TIERS.find(t => n >= t.from && n <= t.to);
  console.error(`L${String(n).padStart(3)} [${tier.key.padEnd(7)}] col=${lv.colors} taps=${lv.taps} bot=${lv._bot} | attWR ${(lv._wr * 100).toFixed(0)}% (tgt ${(lv._tgt * 100).toFixed(0)}%)` + (lv.mix ? ` mix=${lv.mix.map(m => m.el + "×" + m.n).join(",")}` : "") + (lv.intro ? ` INTRO(${lv.intro})` : ""));
  out.push(lv);
}
console.error(`\n${hi - lo + 1 - fails}/${hi - lo + 1} generated in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${fails} fails`);

// CADENCE ASSERTION — the structural guarantee the flow research demands: hard
// levels are never adjacent (measured, not just targeted), and the level right
// after an X9 beat is a genuine breather. Runs on the generated range's measured
// _wr; violations print loudly so the offending level gets hand-retuned.
function assertCadence(levels, lo) {
  let bad = 0;
  for (let i = 0; i + 1 < levels.length; i++) {
    const a = levels[i], b = levels[i + 1];
    if (!a || !b || a._wr == null || b._wr == null) continue;
    const nA = lo + i, nB = lo + i + 1;
    if (nA > 16 && a._wr <= 0.66 && b._wr <= 0.66)
      { console.error(`⚠ CADENCE: L${nA} (${Math.round(a._wr * 100)}%) and L${nB} (${Math.round(b._wr * 100)}%) are ADJACENT HARD`); bad++; }
    const ht = hardTier(nA);
    if (ht && (ht.key === "super" || ht.key === "extreme") && nB <= 106 && b._wr < 0.72)
      { console.error(`⚠ CADENCE: L${nB} (${Math.round(b._wr * 100)}%) is no breather after the L${nA} ${ht.key} beat`); bad++; }
  }
  if (bad) console.error(`⚠ ${bad} cadence violation(s) — retune the flagged level(s) with a single-level splice`);
  else console.error("cadence OK: no adjacent hards, breathers hold after every X9 beat");
  return bad;
}

// SPLICE: replace levels lo..hi in the EXISTING levels.js, keep the other 98 as-is
// (only the toy tier changed — no need to pay for a full 106-level regen).
if (splice && !fails) {
  const existing = require(path.join(__dirname, "..", "..", "web", "js", "levels.js")).LEVELS.slice();
  for (let n = lo; n <= hi; n++) existing[n - 1] = out[n - lo];
  const body = existing.map(fmt).join("\n");
  const file = fs.readFileSync(path.join(__dirname, "..", "..", "web", "js", "levels.js"), "utf8");
  const rebuilt = file.replace(/const LEVELS = \[[\s\S]*?\n  \];/, "const LEVELS = [\n" + body + "\n  ];");
  fs.writeFileSync(path.join(__dirname, "..", "..", "web", "js", "levels.js"), rebuilt);
  console.error(`→ spliced levels ${lo}-${hi} into web/js/levels.js (${existing.length} total)`);
  process.exit(assertCadence(out, lo) ? 2 : 0);   // exit 2 = written but cadence flagged
}

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
  process.exit(assertCadence(out, 1) ? 2 : 0);
}
process.exit(fails ? 1 : 0);
