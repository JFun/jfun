#!/usr/bin/env node
/* RATTLE — difficulty MEASUREMENT (not certification). Quantifies how hard each
   level actually is, so we tune from numbers not vibes. Key metric: the win-rate
   of a CASUAL policy (pop the biggest cluster, with 20% random noise — a plausible
   distracted player who doesn't plan or track the objective colour). Deterministic
   spawn (fixed seed) → the only variation is the policy's choices, so the win-rate
   ≈ "what fraction of natural play-throughs clear it". ~95% everywhere = too easy.
   Also reports botOptimum (fewest taps), slack, and start-board cluster stats.
   Usage: node scripts/dev/measure.cjs [rollouts] */
const path = require("path");
const ENG = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { LEVELS } = require(path.join(__dirname, "..", "..", "web", "js", "levels.js"));

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function remaining(w) {
  let r = 0;
  for (const o of w.objectives) {
    if (o.kind === "pop" || o.kind === "shells" || o.kind === "balloons") r += o.rem;
    else if (o.kind === "duck" && !w.duckDone) r += 8;
  }
  return r;
}
function clustersOf(w) {
  return ENG.poppableClusters(w).map(idxs => ({ idxs, color: w.balls[idxs[0]].c, size: idxs.length }));
}
// ---- botOptimum via beam (fewest taps to win) ----
function beam(spec, width, maxDepth) {
  const w = ENG.createWorld(spec);
  let frontier = [{ snap: ENG.snapshot(w) }];
  const seen = new Set();
  for (let depth = 1; depth <= maxDepth; depth++) {
    const kids = [];
    for (const node of frontier) {
      ENG.restore(w, node.snap);
      const moves = clustersOf(w).map(c => ({ type: "pop", idxs: c.idxs })); moves.push({ type: "rattle" });
      for (const mv of moves) {
        ENG.restore(w, node.snap);
        if (mv.type === "rattle") { if (w.taps <= 0) continue; w.taps--; w.tapCounter++; ENG.applyRattle(w); }
        else { w.taps--; w.tapCounter++; ENG.popClusterIdx(w, mv.idxs); }
        ENG.settle(w);
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
// ---- policies ----
function pickCasual(w, cls, rng) {          // pop the biggest cluster; 20% of the time a random one; ignores objective colour
  if (!cls.length) return "rattle";
  if (rng() < 0.20) return cls[(rng() * cls.length) | 0];
  return cls.reduce((a, b) => b.size > a.size ? b : a);
}
function pickRandom(w, cls, rng) {          // pure masher — floor difficulty
  if (!cls.length) return "rattle";
  return cls[(rng() * cls.length) | 0];
}
function rollout(spec, pick, rng) {
  const w = ENG.createWorld(spec);
  let guard = 0;
  while (w.phase === "play" && w.taps > 0 && guard++ < spec.taps + 8) {
    const mv = pick(w, clustersOf(w), rng);
    if (mv === "rattle") { if (w.taps <= 0) break; w.taps--; w.tapCounter++; ENG.applyRattle(w); }
    else if (mv) { w.taps--; w.tapCounter++; ENG.popClusterIdx(w, mv.idxs); }
    else break;
    ENG.settle(w);
  }
  return ENG.isWin(w);
}
function winRate(spec, pick, n) {
  let wins = 0;
  for (let i = 0; i < n; i++) { const rng = mulberry32((spec.seed ^ (i * 0x9e3779b9 + 1)) >>> 0); if (rollout(spec, pick, rng)) wins++; }
  return wins / n;
}

const N = +(process.argv[2] || 150);
const tierOf = n => n <= 8 ? "base" : n <= 16 ? "toy" : n <= 26 ? "stone" : n <= 40 ? "shell" : n <= 54 ? "balloon" : n <= 70 ? "bomb" : "combo";
const rows = [];
console.error(`measuring ${LEVELS.length} levels, ${N} rollouts each…`);
for (let i = 0; i < LEVELS.length; i++) {
  const L = i + 1, spec = LEVELS[i];
  const w0 = ENG.createWorld(spec);
  const cls0 = clustersOf(w0);
  const bot = beam(spec, 8, spec.taps);
  const casual = winRate(spec, pickCasual, N);
  const rand = winRate(spec, pickRandom, N);
  rows.push({ L, tier: tierOf(L), taps: spec.taps, bot, slack: bot == null ? null : spec.taps - bot,
    colors: spec.colors, count: spec.count, clusters0: cls0.length, maxCl0: cls0.reduce((m, c) => Math.max(m, c.size), 0),
    casual, rand });
  process.stderr.write(".");
}
process.stderr.write("\n");

// ---- report ----
const pct = x => x == null ? " -- " : (x * 100).toFixed(0).padStart(3) + "%";
console.log("\nL   tier     taps bot slk col clu maxCl  casualWR  masherWR");
for (const r of rows) console.log(
  String(r.L).padStart(3) + " " + r.tier.padEnd(8) + " " +
  String(r.taps).padStart(3) + " " + String(r.bot == null ? "-" : r.bot).padStart(3) + " " + String(r.slack == null ? "-" : r.slack).padStart(3) + " " +
  String(r.colors).padStart(3) + " " + String(r.clusters0).padStart(3) + " " + String(r.maxCl0).padStart(4) + "   " +
  pct(r.casual) + "     " + pct(r.rand));

// ---- aggregates ----
const tiers = ["base", "toy", "stone", "shell", "balloon", "bomb", "combo"];
console.log("\n=== by tier: mean casual win-rate (the difficulty proxy) ===");
for (const t of tiers) {
  const rs = rows.filter(r => r.tier === t); if (!rs.length) continue;
  const mc = rs.reduce((a, r) => a + r.casual, 0) / rs.length;
  const mb = rs.reduce((a, r) => a + (r.bot || 0), 0) / rs.length;
  const ms = rs.reduce((a, r) => a + (r.slack || 0), 0) / rs.length;
  console.log(`  ${t.padEnd(8)} casualWR ${(mc * 100).toFixed(0)}%   botOpt ${mb.toFixed(1)}   slack ${ms.toFixed(1)}   (n=${rs.length})`);
}
const all = rows.reduce((a, r) => a + r.casual, 0) / rows.length;
const hard = rows.filter(r => r.casual < 0.6).length;
const trivial = rows.filter(r => r.casual > 0.9).length;
console.log(`\n=== overall ===`);
console.log(`  mean casual win-rate: ${(all * 100).toFixed(0)}%`);
console.log(`  levels a casual player clears >90% of the time (trivial): ${trivial}/${rows.length}`);
console.log(`  levels where casual win-rate < 60% (genuinely challenging): ${hard}/${rows.length}`);
