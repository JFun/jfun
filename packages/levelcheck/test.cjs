#!/usr/bin/env node
/* Self-test for @jfun/levelcheck — pure-function edge cases. Run: node test.cjs */
"use strict";
const LC = require("./index.js");
let n = 0;
function ok(cond, msg) { n++; if (!cond) { console.error("FAIL: " + msg); process.exit(1); } }

// --- frameFit ---
ok(LC.frameFit([{ name: "basket", l: 10, r: 90, t: 50, b: 95 }], { w: 100, h: 100 }).length === 0, "in-frame passes");
{ // the actual bucket bug: right wall off-frame
  const v = LC.frameFit([{ name: "basket", l: 74, r: 101.6, t: 50, b: 95 }], { w: 100, h: 100 });
  ok(v.length === 1 && /right/.test(v[0].problems[0]), "off-right caught");
}
ok(LC.frameFit([{ name: "b", l: 2, r: 98, t: 2, b: 98 }], { w: 100, h: 100 }, { margin: 5 }).length === 1, "margin enforced");
ok(LC.frameFit([{ name: "b", l: NaN, r: 1, t: 0, b: 1 }], { w: 100, h: 100 })[0].problems[0] === "non-finite bounds", "NaN caught");
ok(LC.frameFit([], { w: 100, h: 100 }).length === 0, "empty items pass");

// --- monotoneOrder ---
ok(LC.monotoneOrder([0.05, 0.09, 0.13, 0.17], { minGap: 0.02 }).ok, "readable descending-stair order passes");
ok(!LC.monotoneOrder([0.05, 0.06, 0.13], { minGap: 0.02 }).ok, "sub-gap step flagged");
ok(!LC.monotoneOrder([0.05, 0.13, 0.09], { minGap: 0.02 }).ok, "non-monotone flagged");
ok(LC.monotoneOrder([0.17, 0.13, 0.09], { minGap: 0.02 }).dir === "decreasing", "direction detected");
ok(LC.monotoneOrder([0.5], {}).ok && LC.monotoneOrder([], {}).ok, "trivial sequences pass");
ok(!LC.monotoneOrder([0.1, 0.1, 0.1], { minGap: 0.02 }).ok, "equal values (unreadable which is first) flagged");

// --- distinctness ---
ok(LC.jaccard(["rope", "spike"], ["rope", "spike"]) === 1, "jaccard identical");
ok(LC.jaccard([], []) === 1, "jaccard empty-empty = 1 (both mechanically bare)");
ok(LC.jaccard(["rope"], ["pad"]) === 0, "jaccard disjoint");
ok(LC.pointsDistance([[0, 0]], [[0, 0]]) === 0, "same layout = 0");
ok(LC.pointsDistance([], [[0.5, 0.5]]) === 1, "one empty = 1");
{
  const a = { id: 1, mechanics: ["rope", "spike"], points: [[0.1, 0.1], [0.5, 0.6]] };
  const b = { id: 2, mechanics: ["rope", "spike"], points: [[0.11, 0.1], [0.5, 0.61]] };
  const c = { id: 3, mechanics: ["balloon", "gate"], points: [[0.9, 0.2]] };
  const pairs = LC.nearDuplicates([a, b, c]);
  ok(pairs[0].a === 1 && pairs[0].b === 2 && pairs[0].flagged, "near-clone pair ranked first + flagged");
  ok(pairs[pairs.length - 1].dist > 0.4, "distinct pair ranked last");
}

// --- scalars channel (the Rattle case: same mechanics/points, different counts) ---
ok(LC.scalarsDistance({ taps: 4, need: 14 }, { taps: 4, need: 14 }) === 0, "identical scalars = 0");
ok(LC.scalarsDistance({ taps: 4 }, { taps: 8 }) === 0.5, "taps 4 vs 8 = 0.5");
ok(LC.scalarsDistance({ taps: 4 }, { need: 14 }) === 1, "disjoint keys = max different");
ok(LC.scalarsDistance({}, {}) === 0, "empty scalars = 0");
{
  const a = { id: 1, mechanics: ["stone"], scalars: { taps: 4, need: 14 } };
  const b = { id: 2, mechanics: ["stone"], scalars: { taps: 4, need: 15 } };
  const c = { id: 3, mechanics: ["stone"], scalars: { taps: 9, need: 40 } };
  ok(LC.featureDistance(a, b) < LC.featureDistance(a, c), "scalar channel separates count-different boards");
  ok(LC.featureDistance(a, b) > 0, "near-identical counts still nonzero");
}

// --- hash ---
{
  const flat = new Array(64).fill(128);
  const half = new Array(64).fill(0).map((_, i) => (i < 32 ? 255 : 0));
  const h1 = LC.hashFromLuma(half), h2 = LC.hashFromLuma(half.slice().reverse());
  ok(LC.hamming(h1, h1) === 0, "hash self-distance 0");
  ok(LC.hamming(h1, h2) === 64, "opposite halves = max distance");
  ok(LC.hashFromLuma(flat).length === 16, "hash is 16 hex chars");
}

// --- robustness (human-possible, not just winnable) ---
ok(LC.winDensity([true, false, true, false]) === 0.5, "winDensity counts booleans");
ok(LC.winDensity([{ win: true }, { win: false }]) === 0.5, "winDensity counts objects");
ok(LC.winDensity([]) === 0, "empty attempts = 0 density");
{
  // healthy level: a wide contiguous timing band wins (like the shipped walks @0)
  const good = [];
  for (let d = 0; d <= 480; d += 20) good.push({ x: d, win: d <= 200 });
  const w = LC.solveWindow(good, { minWidth: 60 });
  ok(w.ok && w.widest.lo === 0 && w.widest.hi === 200, "wide contiguous band passes");
}
{
  // THE L59 BOOMERANG PATTERN: one isolated winning sample in a big sweep —
  // raw "winnable" but a lottery. minRun=2 default kills the lone point.
  const lottery = [];
  for (let d = 0; d <= 480; d += 20) lottery.push({ x: d, win: d === 460 });
  const w = LC.solveWindow(lottery, { minWidth: 60 });
  ok(!w.ok && LC.winDensity(lottery) < 0.05, "isolated lottery win FAILS the window gate");
  ok(w.widest && w.widest.n === 1 && w.widest.width === 0, "lone win = zero-width band");
}
{
  // scattered wins (win, lose, win, lose): never contiguous → no real band
  const scatter = [{ x: 0, win: true }, { x: 20, win: false }, { x: 40, win: true }, { x: 60, win: false }];
  ok(!LC.solveWindow(scatter, { minWidth: 10 }).ok, "scattered wins are not a tolerance band");
}
{
  // THE GALLOWS DROP PATTERN: the TAUGHT method has zero window; only an
  // unintended method wins. methodWindows exposes it.
  const s = [];
  for (let d = 0; d <= 200; d += 20) s.push({ x: d, win: true, method: "unintended-line-cut" });
  // taught tie-cut never wins → absent from methods entirely
  const mw = LC.methodWindows(s, { minWidth: 40 });
  ok(mw["unintended-line-cut"] && mw["unintended-line-cut"].ok, "unintended method shows its window");
  ok(!("tie-cut" in mw), "taught method with no wins is ABSENT — the tell the game asserts on");
}
{
  // mixed methods on one axis: each method's band breaks at the other's wins
  const s = [];
  for (let d = 0; d <= 100; d += 20) s.push({ x: d, win: true, method: d < 60 ? "A" : "B" });
  const mw = LC.methodWindows(s, { minWidth: 30 });
  ok(mw.A.ok && mw.A.widest.hi === 40 && mw.B.ok && mw.B.widest.lo === 60, "per-method bands split correctly");
}
{
  // THE SAME-X MULTI-METHOD BUG (caught live on Cut L54): certifiers emit one
  // attempt PER METHOD at each knob value. Sibling attempts at the same x must
  // NOT read as losses on each other's axes — that shredded every band to
  // width 0 and made a human-beaten level report as a lottery.
  const s = [];
  for (let d = 0; d <= 200; d += 20) {
    s.push({ x: d, win: false, method: "top" });     // single cut never wins
    s.push({ x: d, win: true, method: "casc↓" });    // cascade wins broadly
  }
  const mw = LC.methodWindows(s, { minWidth: 60 });
  ok(mw["casc↓"].ok && mw["casc↓"].widest.width === 200, "same-x sibling attempts don't shred the winner's band");
  ok(!("top" in mw), "never-winning method absent");
}
{
  // untagged losses DO break every method's band
  const s = [{ x: 0, win: true, method: "A" }, { x: 20, win: false }, { x: 40, win: true, method: "A" }];
  ok(!LC.methodWindows(s, { minWidth: 10 }).A.ok, "untagged loss breaks the band");
}
ok(LC.solveWindow([], {}).winFraction === 0 && !LC.solveWindow([], {}).ok, "empty samples: no window");
ok(!LC.solveWindow([{ x: NaN, win: true }], {}).ok, "NaN knob values dropped");

// --- adversarial-review hardening ---
function throws(fn, msg) { let t = false; try { fn(); } catch (_) { t = true; } ok(t, msg); }
throws(() => LC.frameFit([{ name: "b", l: 0, r: 1e9, t: 0, b: 1 }], { w: NaN, h: NaN }), "NaN frame throws (blocking gate fails loud)");
ok(/inverted/.test(LC.frameFit([{ name: "b", l: 90, r: 10, t: 95, b: 5 }], { w: 100, h: 100 })[0].problems[0]), "inverted bounds caught");
{
  const m = LC.monotoneOrder([0.9, 0.7, 0.5, 0.95], { minGap: 0.02 });
  ok(m.dir === "decreasing" && m.violations.length === 1 && m.violations[0].i === 3, "majority-vote dir: the end outlier is THE violation");
}
ok(!LC.monotoneOrder([0.1, 0.1, 0.1]).ok, "equal values fail even with default minGap (strict)");
ok(LC.pointsDistance([[NaN, 0.5]], [[NaN, 0.5]]) === 0, "NaN points dropped, not scored as max-distance");
throws(() => LC.featureDistance({ id: 1 }, { id: 2 }), "no feature channels at all = adapter bug, throws");
ok(LC.nearDuplicates([{ id: 1, mechanics: ["a"], points: [[0, 0]] }, { id: 2, mechanics: ["a"], points: [[0, 0]] }], { threshold: 0 })[0].flagged, "threshold 0 still flags exact clones (inclusive)");
throws(() => LC.hashFromLuma(new Array(64).fill(NaN)), "NaN luma throws");
throws(() => LC.hamming("gggggggggggggggg", "0000000000000000"), "non-hex hash throws");

// --- gates bundle (runGates severity routing + poolDistinct) ---
{
  // frame violation lands in BLOCKING; readable order lands in ADVISORY
  const g = LC.runGates({
    frame: { items: [{ name: "basket", l: 74, r: 101.6, t: 50, b: 95 }], frame: { w: 100, h: 100 } },
    order: { values: [0.05, 0.09, 0.13], minGap: 0.02 },
  });
  ok(g.blocking.length === 1 && g.blocking[0].name === "frame-fit" && !g.blocking[0].ok, "frame violation routed BLOCKING");
  ok(g.advisory.length === 1 && g.advisory[0].name === "order-discoverable" && g.advisory[0].ok, "order routed ADVISORY");
}
{
  // robustness: taught method with a real band passes; an ABSENT taught method
  // (the Gallows tell) fails; advisory:true downgrades (the pulse-gate carve-out)
  const samples = [];
  for (let x = 0; x < 200; x += 10) samples.push({ x, win: x >= 60 && x <= 160, method: "casc" });
  const good = LC.runGates({ sweep: { samples, taught: "casc", minWidth: 60, minRun: 2 } });
  ok(good.blocking.every(b => b.ok), "taught method with a wide band passes blocking");
  const gallows = LC.runGates({ sweep: { samples, taught: "top", minWidth: 60, minRun: 2 } });
  ok(gallows.blocking.some(b => b.name === "taught-method-window" && !b.ok && /NEVER wins/.test(b.detail)), "absent taught method = the Gallows tell, blocking");
  const pulse = LC.runGates({ sweep: { samples, taught: "top", minWidth: 60, minRun: 2, advisory: true } });
  ok(pulse.blocking.length === 0 && pulse.advisory.some(a => a.name === "taught-method-window"), "advisory:true downgrades the sweep group (pulse-gate carve-out)");
  const lotterySamples = []; for (let x = 0; x < 250; x += 10) lotterySamples.push({ x, win: x === 70 });
  const lottery = LC.runGates({ sweep: { samples: lotterySamples, minWidth: 60, minRun: 2 } });
  ok(lottery.blocking.some(b => b.name === "win-density" && !b.ok), "1-in-25 win = lottery (density < 0.05), blocking");
}
{
  // poolDistinct: candidate vs accepted pool (nearDuplicates ranks within ONE set;
  // this is the generation-time probe)
  const pool = [
    { id: "L1", mechanics: ["rope", "spike"], points: [[0.2, 0.3], [0.8, 0.9]] },
    { id: "L2", mechanics: ["wind"], points: [[0.5, 0.5]] },
  ];
  const clone = LC.poolDistinct({ mechanics: ["rope", "spike"], points: [[0.2, 0.3], [0.8, 0.9]] }, pool);
  ok(clone.flagged && clone.closest === "L1" && clone.minDist === 0, "planted clone flagged against the pool");
  const fresh = LC.poolDistinct({ mechanics: ["magnet", "star"], points: [[0.1, 0.9]] }, pool);
  ok(!fresh.flagged, "distinct candidate passes");
  ok(!LC.poolDistinct({ mechanics: ["a"] }, []).flagged, "empty pool is trivially distinct");
  { // weights passthrough: mech-identical/layout-far reads as a clone only when layout is zero-weighted
    const cand = { mechanics: ["rope"], points: [[0.9, 0.9]] }, one = [{ id: "L1", mechanics: ["rope"], points: [[0.1, 0.1]] }];
    ok(LC.poolDistinct(cand, one, { weights: { wMech: 1, wLayout: 0 } }).flagged, "weights passed through (mech-only → clone)");
    ok(!LC.poolDistinct(cand, one).flagged, "default weights count layout distance");
  }
  const viaGates = LC.runGates({ distinct: { feature: pool[0], pool } });
  ok(viaGates.advisory.some(a => a.name === "pool-distinct" && !a.ok), "distinctness routed ADVISORY through runGates");
}

console.log(`  @jfun/levelcheck: ${n} assertions passed`);
