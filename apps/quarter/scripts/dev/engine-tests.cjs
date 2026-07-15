#!/usr/bin/env node
/* QUARTER engine tests — the determinism contract the exhaustive verifier and
   the on-device solver stand on. If the sim isn't bit-identical across runs
   (browser + Node), the {L,R} certification is a lie and undo/replay corrupt.
   Tiny inline harness (no workspace dep yet). */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { LEVELS } = require(path.join(__dirname, "..", "..", "web", "js", "levels.js"));

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name); } }
function section(s) { console.log("— " + s + " —"); }

// full-state fingerprint (finer than hashState — exact floats) for determinism
function fp(w) {
  let s = w.theta.toFixed(9) + "|" + w.qCount + "|" + w.turns + "|" + w.phase;
  for (const b of w.bodies) s += "|" + b.x.toFixed(9) + "," + b.y.toFixed(9) + "," + b.vx.toFixed(9) + "," + b.vy.toFixed(9) + "," + b.rot.toFixed(9);
  return s;
}
function playSeq(spec, seq) {
  const w = E.createWorld(spec);
  E.settle(w);
  for (const d of seq) { E.turn(w, d); E.settle(w); }
  return w;
}

section("determinism (same input → identical state, on device and in Node)");
{
  // 1) raw stepping is reproducible
  const a = E.createWorld(LEVELS[0]); for (let i = 0; i < 5000; i++) E.step(a);
  const b = E.createWorld(LEVELS[0]); for (let i = 0; i < 5000; i++) E.step(b);
  ok("5000 steps from spawn are bit-identical across runs", fp(a) === fp(b));
  // 2) turn+settle sequences are reproducible
  ok("L1 [R,R] settles identically twice", fp(playSeq(LEVELS[0], "RR")) === fp(playSeq(LEVELS[0], "RR")));
  ok("L5 [R,L,L,L,L] settles identically twice", fp(playSeq(LEVELS[4], "RLLLL")) === fp(playSeq(LEVELS[4], "RLLLL")));
  // 3) no Math.random leaked into the sim (monkey-patch it to throw, then step)
  const R = Math.random;
  Math.random = () => { throw new Error("sim used Math.random"); };
  let clean = true;
  try { const w = E.createWorld(LEVELS[4]); for (let i = 0; i < 3000; i++) E.step(w); E.turn(w, "R"); E.settle(w); } catch (e) { clean = false; }
  Math.random = R;
  ok("the sim never calls Math.random (determinism guarantee)", clean);
}

section("snapshot / restore round-trips ALL mutable state (undo + verifier)");
{
  const w = E.createWorld(LEVELS[4]);
  E.settle(w); E.turn(w, "R"); E.settle(w);
  const snap = E.snapshot(w);
  const before = fp(w);
  for (let i = 0; i < 400; i++) E.step(w);   // wander far
  E.turn(w, "L"); E.settle(w);
  E.restore(w, snap);
  ok("restore reproduces the exact snapshotted state", fp(w) === before);
  // and stepping forward from a restore matches stepping without the detour
  const s2 = E.snapshot(w);
  const c1 = E.createWorld(LEVELS[4]); E.settle(c1); E.turn(c1, "R"); E.settle(c1);
  E.restore(w, s2);
  E.turn(w, "L"); E.settle(w);
  E.turn(c1, "L"); E.settle(c1);
  ok("a restored world steps forward identically to a fresh one", fp(w) === fp(c1));
}

section("settle + turn quantization");
{
  const w = E.createWorld(LEVELS[0]);
  const used = E.settle(w);
  ok("a fresh board settles within the cap", used < 720 && w.bodies.every(b => !b.resting || true));
  E.turn(w, "R"); E.settle(w);
  const q = w.theta / E.HP;
  ok("after a turn settles, theta is an EXACT 90° multiple (zero drift)", Math.abs(q - Math.round(q)) < 1e-9);
  ok("qCount tracks the turn (1 turn → |qCount| = 1)", Math.abs(w.qCount) === 1);
}

section("win + level integrity");
{
  ok("L1 [R,R] wins (marble sinks the goal)", E.isWon(playSeq(LEVELS[0], "RR")));
  ok("L1 [R] alone does NOT win (par is real)", !E.isWon(playSeq(LEVELS[0], "R")));
  let sq = true, oneMarble = true, oneGoal = true;
  for (const spec of LEVELS) {
    const N = spec.rows.length;
    if (!spec.rows.every(r => r.length === N)) sq = false;
    const flat = spec.rows.join("");
    if ((flat.match(/M/g) || []).length !== 1) oneMarble = false;
    if ((flat.match(/[GQ]/g) || []).length !== 1) oneGoal = false;
  }
  ok("every level is a square N×N grid (90° maps onto itself)", sq);
  ok("every level has exactly one marble spawn", oneMarble);
  ok("every level has exactly one goal", oneGoal);
}

console.log("\nquarter engine: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
