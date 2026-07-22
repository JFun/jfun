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

console.log(`  @jfun/levelcheck: ${n} assertions passed`);
