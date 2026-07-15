#!/usr/bin/env node
/* Tilt continuous certifier (depth-plan Phase 2 — pulled forward after the
   Foundry review: TWO discrete-only fictions shipped in one day, so discrete
   BFS alone is not a shipping gate for gate boards).

   Certifies that a level is WINNABLE IN THE REAL PHYSICS by searching the
   space of human gestures: a gesture is one sustained tilt (direction ×
   strength) held until the board settles — gentle strengths let holes catch
   and wrong holes lodge, hard strengths pop lodged balls and shove stacks.
   Best-first over settled states (more captures first), deduped by rounded
   positions. A certified board provably has a playable line; an uncertified
   board within budget is a red flag, not proof of impossibility — inspect it.

   Usage: node scripts/dev/certify.cjs [fromLevel [toLevel]]   (default 31 45) */
const path = require("path");
const E = require(path.join(__dirname, "../../web/js/engine.js"));
const PH = require(path.join(__dirname, "../../web/js/physics.js"));

const DIRS = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };
// a GESTURE = hold a tilt (strength, seconds), then ease flat and let the
// board settle — that's how a human actually plays (sustained hard tilts
// never "settle" numerically: pressed marbles jitter above any threshold)
const GESTURES = [
  { mag: 1.8, hold: 4 },    // gentle cruise — holes catch, wrong holes lodge
  { mag: 1.8, hold: 1.5 },  // gentle nudge
  { mag: 4, hold: 1.2 },    // firm shove
  { mag: 8, hold: 0.7 },    // hard flick — pops lodged balls, breaks stacks
  { mag: 8, hold: 2 },      // hard sustained — full-board slam
];
const MAX_STATES = 30000;            // search budget per board

function mkWorld(P, gatesAsWalls) {
  // gatesAsWalls: convert every gate cell to a permanent wall (gate never
  // opens). Used for the LOAD-BEARING half of certification — the board MUST
  // become uncertifiable, else the gate is decorative (a ball banks around it,
  // which the discrete solver can't see — Qi's L31 skippable-gate bug).
  const blocks = (P.walls || []).map(b => ({ x: b.x, y: b.y, w: 1, h: 1 }));
  if (gatesAsWalls) for (const g of (P.gates || [])) blocks.push({ x: g.x, y: g.y, w: 1, h: 1 });
  return PH.createWorld({
    w: 8, h: 8, pad: 0, unit: 1,
    marbles: P.init.marbles.map(m => ({ x: m.x + 0.5, y: m.y + 0.5, r: 0.36, c: m.c })),
    holes: P.holesArr.map(h => ({ x: h.x + 0.5, y: h.y + 0.5, r: 0.42, c: h.c })),
    blocks,
    gates: gatesAsWalls ? [] : (P.gates || []).map(g => ({ x: g.x, y: g.y, px: g.px, py: g.py })),
    posts: (P.posts || []).map(pp => ({ x: pp.x + 0.5, y: pp.y + 0.5, r: 0.34 })),   // CHIME bumper posts
  });
}
// snapshot EVERYTHING mutable: marble kinematics + px/py (segment-capture
// memory) + sink anim, hole filled flags (missing these leaked captures
// across search branches), gate held, world clock
const snap = w => w.marbles.map(m => [m.x, m.y, m.vx, m.vy, m.captured, m.sink && { ...m.sink }, m.px, m.py])
  .concat([w.gates.map(g => g.held), w.holes.map(h => h.filled), w.t]);
function restore(w, s) {
  w.marbles.forEach((m, i) => { const [x, y, vx, vy, cap, sink, px, py] = s[i]; m.x = x; m.y = y; m.vx = vx; m.vy = vy; m.captured = cap; m.sink = sink ? { ...sink } : null; m.px = px; m.py = py; });
  s[w.marbles.length].forEach((h, i) => { w.gates[i].held = h; });
  s[w.marbles.length + 1].forEach((f, i) => { w.holes[i].filled = f; });
  w.t = s[w.marbles.length + 2];
  w.events.length = 0;
}
function gesture(w, dir, ges) {
  const g = { gx: DIRS[dir][0] * ges.mag, gy: DIRS[dir][1] * ges.mag };
  for (let i = 0; i < Math.round(ges.hold / PH.DT); i++) { PH.step(w, g); w.events.length = 0; }
  let settled = 0;                                     // ease flat, let it rest
  for (let i = 0; i < Math.round(5 / PH.DT); i++) {
    PH.step(w, { gx: 0, gy: 0 });
    w.events.length = 0;
    const vmax = Math.max(0, ...w.marbles.map(m => m.captured ? 0 : Math.hypot(m.vx, m.vy)));
    if (vmax < 0.04) { if (++settled > 30) return true; } else settled = 0;
  }
  return false;
}
// settled-state hash: captured flags + half-cell-rounded rest positions + gate states
const hash = w => w.marbles.map(m => m.captured ? "C" : (Math.round(m.x * 2) + "." + Math.round(m.y * 2))).join("|")
  + "#" + w.gates.map(g => +g.held).join("");
const nCaptured = w => w.marbles.filter(m => m.captured).length;

function certify(P, maxStates, gatesAsWalls) {
  const w = mkWorld(P, gatesAsWalls);
  const start = snap(w);
  const seen = new Set([hash(w)]);
  // best-first: more captures → shallower depth first
  const pq = [{ s: start, caps: 0, depth: 0, line: "" }];
  let explored = 0;
  while (pq.length && explored < maxStates) {
    pq.sort((a, b) => (b.caps - a.caps) || (a.depth - b.depth));
    const node = pq.shift();
    for (const d of Object.keys(DIRS)) {
      for (const ges of GESTURES) {
        explored++;
        restore(w, node.s);
        if (!gesture(w, d, ges)) continue;
        const h = hash(w);
        if (seen.has(h)) continue;
        seen.add(h);
        const caps = nCaptured(w);
        const line = node.line + d + ges.mag + "×" + ges.hold + " ";
        if (caps === w.marbles.length) {
          for (let i = 0; i < 240 && !PH.solved(w); i++) PH.step(w, { gx: 0, gy: 0 });
          if (PH.solved(w)) return { ok: true, gestures: node.depth + 1, line: line.trim(), explored };
        }
        pq.push({ s: snap(w), caps, depth: node.depth + 1, line });
      }
    }
  }
  return { ok: false, explored };
}

const from = +(process.argv[2] || 31), to = +(process.argv[3] || 45);
let allOK = true;
for (let L = from; L <= to; L++) {
  const P = E.build(L);
  if (!P) { console.log(`L${L} BUILD FAILED ✗`); allOK = false; continue; }
  const t0 = Date.now();
  const r = certify(P, MAX_STATES);
  // LOAD-BEARING: with the gates walled the board must be UNwinnable in physics.
  // If it still certifies, the gate is skippable (banked around) — the fault
  // the discrete load-bearing check can't catch. Only run when there are gates.
  const hasGates = (P.gates || []).length > 0;
  const walled = hasGates ? certify(P, MAX_STATES * 2, true) : { ok: false };
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const pass = r.ok && !walled.ok;
  if (!pass) allOK = false;
  console.log(pass
    ? `L${L} par=${P.par} CERTIFIED ✓  ${r.gestures} gestures (${r.line})  [${r.explored} states, ${dt}s]`
    : !r.ok
      ? `L${L} par=${P.par} NOT CERTIFIED ✗ (unsolvable in physics)  [${r.explored} states, ${dt}s]`
      : `L${L} par=${P.par} NOT LOAD-BEARING ✗ (winnable with gates walled — skippable)  [${dt}s]`);
}
process.exit(allOK ? 0 : 1);
