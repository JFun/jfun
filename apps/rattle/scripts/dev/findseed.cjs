#!/usr/bin/env node
/* RATTLE — element-level seed finder. Given a spec TEMPLATE (no seed), sweep a
   seed range through the SAME beam+greedy certifier verify.cjs uses and print
   the seeds that certify (solvable ∧ botOptimum in [minBot..taps-1] ∧ greedy
   wins). Lets us author element levels by intent (count/colours/mix/objective)
   and let the physics pick a fair pile. Usage: node findseed.cjs '<jsonTemplate>' [seedStart] [seedEnd] */
const path = require("path");
const ENG = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));

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
  while (w.phase === "play" && w.taps > 0 && guard++ < spec.taps + 4) {
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

const tmpl = JSON.parse(process.argv[2]);
const s0 = +(process.argv[3] || 100), s1 = +(process.argv[4] || 400);
const minBot = tmpl._minBot || 2;
const wanted = +(process.argv[5] || 6);   // how many good seeds to print
let found = 0;
for (let seed = s0; seed <= s1 && found < wanted; seed++) {
  const spec = Object.assign({}, tmpl, { seed });
  let bot;
  try { bot = beam(spec, 8, spec.taps); } catch (e) { continue; }
  if (bot === null || bot < minBot) continue;
  let g;
  try { g = greedy(spec, seed); } catch (e) { continue; }
  if (!g) continue;
  console.log(`seed=${seed}  botOptimum=${bot}  slack=${spec.taps - bot}  greedy=win`);
  found++;
}
if (!found) console.log("no certifying seed in [" + s0 + "," + s1 + "] — loosen taps/objective/mix");
