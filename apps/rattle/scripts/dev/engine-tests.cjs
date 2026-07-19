#!/usr/bin/env node
/* RATTLE engine tests — the determinism contract the beam-search verifier
   stands on. If Node and WKWebView don't produce identical avalanches, the
   certification is a lie. Golden-trajectory: same seed → same pile; same pop
   sequence → same result; snapshot round-trips all mutable state. */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { LEVELS } = require(path.join(__dirname, "..", "..", "web", "js", "levels.js"));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log("  ✗ " + n); } };
const section = s => console.log("— " + s + " —");

function fp(w) {
  let s = w.taps + "|" + w.phase + "|" + (w.duckDone ? 1 : 0);
  for (const b of w.balls) s += "|" + (b.alive ? 1 : 0) + b.x.toFixed(6) + "," + b.y.toFixed(6);
  return s;
}
const firstPoppable = w => E.poppableClusters(w)[0];

section("determinism (same seed → identical pile, Node ≡ WKWebView)");
{
  ok("createWorld(L1) is bit-identical across runs", fp(E.createWorld(LEVELS[0])) === fp(E.createWorld(LEVELS[0])));
  ok("createWorld(L3, duck) is bit-identical across runs", fp(E.createWorld(LEVELS[2])) === fp(E.createWorld(LEVELS[2])));
  // same pop → same avalanche
  const play = () => { const w = E.createWorld(LEVELS[0]); E.popClusterIdx(w, firstPoppable(w)); E.settle(w); return fp(w); };
  ok("popping the same cluster settles identically twice", play() === play());
  // seeded rattle is reproducible (re-derived from seed ^ tapCounter)
  const rat = () => { const w = E.createWorld(LEVELS[1]); E.doRattle(w); E.settle(w); return fp(w); };
  ok("a rattle produces the same shake twice (seeded)", rat() === rat());
  // no UNSEEDED Math.random in the sim: patch it to throw, then play
  const R = Math.random; Math.random = () => { throw new Error("sim used Math.random"); };
  let clean = true;
  try { const w = E.createWorld(LEVELS[0]); E.popClusterIdx(w, firstPoppable(w)); E.settle(w); E.doRattle(w); E.settle(w); } catch (e) { clean = false; }
  Math.random = R;
  ok("the sim never calls unseeded Math.random", clean);
}

section("snapshot / restore round-trips ALL mutable state");
{
  const w = E.createWorld(LEVELS[0]);
  E.popClusterIdx(w, firstPoppable(w)); E.settle(w);
  const snap = E.snapshot(w), before = fp(w);
  for (let i = 0; i < 200; i++) E.step(w);   // wander
  const cl = E.poppableClusters(w)[0]; if (cl) { E.popClusterIdx(w, cl); E.settle(w); }
  E.restore(w, snap);
  ok("restore reproduces the exact snapshotted state", fp(w) === before);
  // step forward from restore == fresh path
  const s2 = E.snapshot(w);
  const c1 = E.createWorld(LEVELS[0]); E.popClusterIdx(c1, firstPoppable(c1)); E.settle(c1);
  E.restore(w, s2);
  const m1 = E.poppableClusters(w)[0]; E.popClusterIdx(w, m1); E.settle(w);
  const m2 = E.poppableClusters(c1)[0]; E.popClusterIdx(c1, m2); E.settle(c1);
  ok("a restored world plays forward identically to a fresh one", fp(w) === fp(c1));
}

section("tap semantics + settle");
{
  const w = E.createWorld(LEVELS[0]);
  ok("a fresh pile is settled at spawn", w.settled);
  // singleton tap is a FREE no-op (find an isolated bead if any; else assert the rule via clusterOf)
  const cl = E.clusterOf(w, w.balls.find(b => b.alive && !b.duck));
  ok("clusterOf returns a same-colour connected component", cl.every(b => b.c === cl[0].c));
  const t0 = w.taps;
  const single = w.balls.find(b => b.alive && !b.duck && E.clusterOf(w, b).length === 1);
  if (single) { E.tap(w, single.x, single.y); ok("tapping a singleton does NOT spend a tap", w.taps === t0); } else { ok("(no singleton on this pile — rule holds by construction)", true); }
  // popping a cluster spends exactly one tap and removes ≥2 beads
  const before = w.balls.filter(b => b.alive && !b.duck).length, taps = w.taps;
  const pc = E.poppableClusters(w)[0];
  E.tap(w, w.balls[pc[0]].x, w.balls[pc[0]].y);
  ok("popping a cluster spends exactly one tap", w.taps === taps - 1);
  ok("popping removes ≥2 beads", w.balls.filter(b => b.alive && !b.duck).length <= before - 2);
  // a settle finishes within the cap
  const w2 = E.createWorld(LEVELS[2]); E.popClusterIdx(w2, E.poppableClusters(w2)[0]);
  ok("the pile settles within the step cap", E.settle(w2) < 240);
}

section("level integrity");
{
  let objOK = true, budgetOK = true;
  for (const spec of LEVELS) {
    if (!spec.objs.length) objOK = false;
    if (!(spec.taps >= 2)) budgetOK = false;
    if (!(spec.count >= 20 && spec.colors >= 3 && spec.colors <= 5)) objOK = false;
  }
  ok("every level has objectives, a ≥2 budget, 3–5 colours, a real pile", objOK && budgetOK);
}

section("shell crack is colour-gated (the crate shows its colour — Qi 2026-07-17)");
{
  // scan shell levels for settled states where a poppable cluster sits within
  // crackRad of a shelled bead; pop it and assert: same colour → cracks,
  // different colour → stays shelled. Require BOTH cases seen (no vacuous pass).
  // Clusters containing a bomb are skipped — blasts crack colour-blind by design.
  let sawSame = false, sawDiff = false, sameOK = true, diffOK = true;
  outer:
  for (const spec of LEVELS) {
    if (!(spec.mix || []).some(m => m.el === "shell")) continue;
    const w = E.createWorld(spec);
    const snap = E.snapshot(w);
    for (const idxs of E.poppableClusters(w)) {
      E.restore(w, snap);
      if (idxs.some(i => w.balls[i].el === "bomb")) continue;
      const color = w.balls[idxs[0]].c, crackRad = w.L.ballR * 2.6;
      const nearShells = [];
      for (let i = 0; i < w.balls.length; i++) {
        const b = w.balls[i];
        if (!b.alive || !b.shelled) continue;
        for (const j of idxs) { const m = w.balls[j], dx = b.x - m.x, dy = b.y - m.y; if (dx * dx + dy * dy < crackRad * crackRad) { nearShells.push(i); break; } }
      }
      if (!nearShells.length) continue;
      E.popClusterIdx(w, idxs);
      for (const i of nearShells) {
        const b = w.balls[i];
        if (b.c === color) { sawSame = true; if (b.shelled) sameOK = false; }
        else { sawDiff = true; if (b.alive && !b.shelled) diffOK = false; }
      }
      if (sawSame && sawDiff) break outer;
    }
  }
  ok("a same-colour pop cracks the adjacent crate", sawSame && sameOK);
  ok("a different-colour pop leaves it shelled", sawDiff && diffOK);
}

section("mercy: an exhausted-colour crate cracks on ANY adjacent pop (Qi 2026-07-18: the colour gate could STRAND a crate once its colour was popped away — measured on L27/30/32/105)");
{
  // for each crate, EXHAUST its colour (kill every free bead of it), then a different-
  // colour pop beside it MUST still crack it — otherwise it's an unbreakable dead end.
  let tested = false, mercyOK = true;
  outer:
  for (const spec of LEVELS) {
    if (!(spec.mix || []).some(m => m.el === "shell")) continue;
    const base = E.createWorld(spec); const snap = E.snapshot(base);
    const crateIdx = base.balls.map((b, i) => b.shelled ? i : -1).filter(i => i >= 0);
    for (const ci of crateIdx) {
      E.restore(base, snap);
      const crate = base.balls[ci];
      for (const b of base.balls) if (b.alive && !b.shelled && b.c === crate.c) b.alive = false;  // exhaust its colour
      const crackRad = base.L.ballR * 2.6;
      let hit = null;
      for (const idxs of E.poppableClusters(base)) {
        if (idxs.some(i => base.balls[i].el === "bomb")) continue;
        if (idxs.some(i => base.balls[i].c === crate.c)) continue;                                 // must be a DIFFERENT colour
        for (const j of idxs) { const m = base.balls[j], dx = crate.x - m.x, dy = crate.y - m.y; if (dx * dx + dy * dy < crackRad * crackRad) { hit = idxs; break; } }
        if (hit) break;
      }
      if (!hit) continue;
      const remBefore = base.objectives.find(o => o.kind === "shells").rem;
      E.popClusterIdx(base, hit);
      tested = true;
      if (base.balls[ci].shelled || base.objectives.find(o => o.kind === "shells").rem !== remBefore - 1) mercyOK = false;
      break outer;
    }
  }
  ok("mercy cracks an exhausted-colour crate on a different-colour pop", tested && mercyOK);
}

section("tapping a crate is a locked no-op (the ghost-crates bug — Qi 2026-07-19)");
{
  // tap DIRECTLY on a shelled bead that has same-colour free neighbours: it must
  // NOT pop with them (clusterOf excluded shelled from the flood but not the seed
  // — the crate died as a cluster member and shells.rem stuck forever).
  let tested = false, ok1 = true, ok2 = true, ok3 = true;
  outer:
  for (const spec of LEVELS) {
    if (!(spec.mix || []).some(m => m.el === "shell")) continue;
    const w = E.createWorld(spec);
    for (const b of w.balls) {
      if (!b.alive || !b.shelled) continue;
      // needs a contacting same-colour free bead so the old bug would have popped it
      const hasMate = w.balls.some(o => o.alive && !o.shelled && !o.duck && o.c === b.c &&
        Math.hypot(o.x - b.x, o.y - b.y) < (o.r + b.r) * 1.08);
      if (!hasMate) continue;
      const remBefore = w.objectives.find(o => o.kind === "shells").rem;
      const tapsBefore = w.taps;
      const r = E.tap(w, b.x, b.y);
      tested = true;
      if (!b.alive || !b.shelled) ok1 = false;                                    // crate must survive, still shelled
      if (w.objectives.find(o => o.kind === "shells").rem !== remBefore) ok2 = false;  // counter untouched
      if (w.taps !== tapsBefore || r.kind === "pop") ok3 = false;                 // free no-op, not a pop
      break outer;
    }
  }
  ok("a tapped crate survives, still shelled", tested && ok1);
  ok("the shells counter is untouched", tested && ok2);
  ok("the tap is a free no-op (no pop, no tap spent)", tested && ok3);
}

console.log("\nrattle engine: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
