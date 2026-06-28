#!/usr/bin/env node
/* gen-levels.cjs — Lanthorn level content pipeline (01-level-design-spec.md):
     1. generate: archetype geometry + lantern placement + seed
     2. bot-validate: 30-run screen, authored-seed must be bot-winnable,
        then 100 seed-variants; discard if win% outside band or any single
        lantern never lit across runs (unfair placement)
     3. band-sort: within each band order by win% descending (gentle ramp),
        breathers (archetype A) pinned at every 10th level
     4. write web/js/levels.js (60 levels)
   The 10 greybox kit levels (human fun-gate set) are all kept, but placed at
   positions lawful under tuning.json's position bands (A=1-10, B=11-30,
   C=31-60): kit 1-4 (band A) stay as the openers; kit 5-7 (band B) join the
   11-30 pool; kit 8-10 (band C) join the 31-60 pool. The greybox compressed
   the full ramp into 10 levels for the fun gate — the production curve must
   not (PRD §2).
   Deterministic: fixed master seed → same levels.js every run.
   Usage: node scripts/dev/gen-levels.cjs */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const E = require(path.join(ROOT, "web", "js", "engine.js"));
const TUNING_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, "lanthorn-prd", "tuning.json"), "utf8"));

// Greybox levels 1-10 are the shipped, fun-gate-validated set — import verbatim
// from the kit (it registers a browser-style global).
require(path.join(ROOT, "lanthorn-prd", "greybox", "engine.js"));
const GREYBOX_LEVELS = globalThis.LanthornEngine.LEVELS;

const N = E.N;
const MASTER_SEED = 20260611;
const rng = E.makeRNG(MASTER_SEED);
const SCREEN_RUNS = 30, FINAL_RUNS = 100;
const MAX_ATTEMPTS_PER_SLOT = 250;
const BAND_MIN = Object.fromEntries(
  Object.entries(TUNING_JSON.easyCurve.bands).map(([k, v]) => [k, v.botWinMin]));
const MAX_BLOCKED = TUNING_JSON.board.maxBlockedCells;
// Band C gets a ceiling so late levels aren't accidentally trivial; B is floor-only
// (waves, not walls — PRD §2).
const BAND_CEIL = { B: 1.01, C: 0.96 };

function rInt(n) { return Math.floor(rng() * n); }
function pick(arr) { return arr[rInt(arr.length)]; }

// ---------- archetype geometry (01-level-design-spec.md table) ----------
function genBlocked(arch) {
  switch (arch) {
    case "A": return [];                                    // open field
    case "B": return [[0,0],[0,7],[7,0],[7,7]];             // corners
    case "C": {                                             // partial frame ring
      const len = 3 + rInt(2);                              // 3-4 per edge
      const start = 2 + rInt(8 - 4 - len + 1);              // stay off corners
      const horiz = rng() < 0.5;
      const cells = [];
      for (let i = 0; i < len; i++) {
        if (horiz) cells.push([0, start + i], [7, start + i]);
        else cells.push([start + i, 0], [start + i, 7]);
      }
      return cells;
    }
    case "D": {                                             // channel segment
      const len = 3 + rInt(2);
      const line = 2 + rInt(4);                             // rows/cols 2-5
      const start = 1 + rInt(7 - len);
      const horiz = rng() < 0.5;
      const cells = [];
      for (let i = 0; i < len; i++) cells.push(horiz ? [line, start + i] : [start + i, line]);
      return cells;
    }
    case "E": {                                             // 2-3 scattered dominoes
      const k = 2 + rInt(2);
      const cells = [], occ = [];
      let guard = 0;
      while (cells.length < k * 2 && guard++ < 300) {
        const horiz = rng() < 0.5;
        const r = 1 + rInt(6), c = 1 + rInt(6);
        const pts = horiz ? [[r, c], [r, c + 1]] : [[r, c], [r + 1, c]];
        if (pts.some(([pr, pc]) => pr > 6 || pc > 6)) continue;
        const clash = pts.some(([pr, pc]) =>
          occ.some(([qr, qc]) => Math.max(Math.abs(pr - qr), Math.abs(pc - qc)) <= 1));
        if (clash) continue;
        for (const p of pts) { occ.push(p); cells.push(p); }
      }
      return cells.length >= 4 ? cells : null;
    }
    case "F": {                                             // diagonal staircase
      const len = 5 + rInt(2);
      const off = rInt(8 - len + 1);
      const anti = rng() < 0.5;
      const cells = [];
      for (let i = 0; i < len; i++) {
        const r = off + i;
        cells.push([r, anti ? 7 - r : r]);
      }
      return cells;
    }
  }
}

// Lantern rules (spec): never on blocked, never all in one line, spread out
// (pairwise Manhattan ≥ 2). Fairness beyond that is the bot gate's job.
function genLanterns(count, blocked) {
  const bset = new Set(blocked.map(([r, c]) => r + "," + c));
  const cells = [];
  let guard = 0;
  while (cells.length < count && guard++ < 600) {
    const r = rInt(8), c = rInt(8);
    if (bset.has(r + "," + c)) continue;
    if (cells.some(([pr, pc]) => Math.abs(pr - r) + Math.abs(pc - c) < 2)) continue;
    cells.push([r, c]);
  }
  if (cells.length < count) return null;
  if (new Set(cells.map(x => x[0])).size === 1) return null;
  if (new Set(cells.map(x => x[1])).size === 1) return null;
  return cells;
}

// ---------- slot plans ----------
// Worlds are 20 levels; each ramps to a CLIMAX. Breathers (archetype A, easy
// relief) sit at world MIDPOINTS (10, 30, 50); world FINALES (20, 40, 60) are
// the hardest of their band — the level the World-complete card pays off. So a
// movable pool fills the finale slots with the toughest generated boards.
// Counts (incl. the kit levels that join each band's pool):
// A: kit 1-4 pinned + 5 generated movable + breather at 10        → 10 slots
// B: 16 generated + kit 5-7 movable, breather 30, PEAK at 20      → 20 slots
// C: 26 generated + kit 8-10 movable, breather 50, PEAKS at 40,60 → 30 slots
function slotPlans() {
  const plans = [];
  const archA = ["B", "C", "D", "B", "E"];        // gentle geometry for openers
  const lanA = [3, 3, 3, 4, 4];
  for (let i = 0; i < 5; i++) plans.push({ key: "A" + i, band: "A", arch: archA[i], lanterns: lanA[i], breather: false });
  plans.push({ key: "A-breather", band: "A", arch: "A", lanterns: 3, breather: true, pinId: 10 });

  const cycleB = ["B", "C", "D", "E", "F"];
  for (let i = 0; i < 16; i++) {
    const lanterns = i < 5 ? 3 : (i < 10 ? 4 : 5);
    plans.push({ key: "B" + i, band: "B", arch: cycleB[i % cycleB.length], lanterns, breather: false });
  }
  plans.push({ key: "B-breather-30", band: "B", arch: "A", lanterns: 4, breather: true, pinId: 30 });

  const cycleC = ["C", "D", "E", "F", "B"];
  for (let i = 0; i < 26; i++) {
    const lanterns = i < 8 ? 4 : (i < 16 ? 5 : (rng() < 0.5 ? 5 : 6));
    plans.push({ key: "C" + i, band: "C", arch: cycleC[i % cycleC.length], lanterns, breather: false });
  }
  plans.push({ key: "C-breather-50", band: "C", arch: "A", lanterns: 4, breather: true, pinId: 50 });
  return plans;
}

// ---------- generate one validated level for a plan ----------
function generateFor(plan) {
  let lanternCount = plan.lanterns;
  for (let round = 0; round < 3; round++) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_SLOT; attempt++) {
      const blocked = genBlocked(plan.arch);
      if (!blocked || blocked.length > MAX_BLOCKED) continue;
      const lanterns = genLanterns(lanternCount, blocked);
      if (!lanterns) continue;
      const seed = 12000 + rInt(900000);
      const cand = { id: 0, band: plan.band, blocked, lanterns, seed };

      const screen = E.simulateLevel(cand, SCREEN_RUNS);
      if (screen.winRate < BAND_MIN[plan.band]) continue;
      if (screen.lanternLitCounts.some(n => n === 0)) continue;
      if (!E.botPlay(cand, cand.seed).won) continue;        // authored queue must be kind

      const final = E.simulateLevel(cand, FINAL_RUNS);
      if (final.winRate < BAND_MIN[plan.band] || final.winRate > (BAND_CEIL[plan.band] || 1.01)) continue;
      if (final.lanternLitCounts.some(n => n === 0)) continue;

      return { level: { ...cand, par: final.bestPieces, archetype: plan.arch },
               winRate: final.winRate, medianPieces: final.medianPieces, plan };
    }
    lanternCount = Math.max(TUNING_JSON.lanterns.min, lanternCount - 1); // relief valve
    process.stderr.write(`  slot ${plan.key}: relaxing lanterns to ${lanternCount}\n`);
  }
  throw new Error(`could not generate a passing level for slot ${plan.key}`);
}

// ---------- main ----------
function main() {
  const t0 = Date.now();

  // Kit levels: re-sim for par, tag with their actual geometry archetype.
  const KIT_ARCH = { 1: "A", 2: "A", 3: "B", 4: "B", 5: "C", 6: "D", 7: "C", 8: "E", 9: "D", 10: "F" };
  const kit = GREYBOX_LEVELS.map(lv => {
    const sim = E.simulateLevel(lv, FINAL_RUNS);
    return { level: { id: lv.id, band: lv.band, blocked: lv.blocked, lanterns: lv.lanterns,
                      seed: lv.seed, par: sim.bestPieces, archetype: KIT_ARCH[lv.id], kit: true },
             winRate: sim.winRate, medianPieces: sim.medianPieces,
             plan: { band: lv.band, arch: KIT_ARCH[lv.id], breather: false } };
  });
  process.stderr.write(`greybox kit re-validated (${Date.now() - t0} ms)\n`);

  const plans = slotPlans();
  const generated = [];
  for (const plan of plans) {
    const g = generateFor(plan);
    generated.push(g);
    process.stderr.write(`  slot ${plan.key} (${plan.band}/${plan.arch}${plan.breather ? " breather" : ""}): ` +
      `win ${(g.winRate * 100).toFixed(0)}% par ${g.level.par}\n`);
  }

  // Assemble: kit 1-4 pinned as openers; per band, breathers pin the world
  // MIDPOINTS (10,30,50) and the HARDEST movable levels pin the world FINALES
  // (20,40,60 — 60 the toughest of all). Remaining "body" slots take the rest
  // sorted easy→hard, so each world eases in and ramps toward its climax.
  const out = [];
  for (const k of kit.slice(0, 4)) out.push(k);                       // positions 1-4

  const SLOTS = { A: [5, 6, 7, 8, 9, 10], B: [], C: [] };
  for (let id = 11; id <= 30; id++) SLOTS.B.push(id);
  for (let id = 31; id <= 60; id++) SLOTS.C.push(id);
  const KIT_POOL = { A: [], B: kit.slice(4, 7), C: kit.slice(7, 10) };
  const BREATHER_ID = new Set([10, 30, 50]);
  const FINALE_ID = new Set([20, 40, 60]);

  for (const band of ["A", "B", "C"]) {
    const movable = generated.filter(g => g.plan.band === band && !g.plan.breather)
                             .concat(KIT_POOL[band])
                             .sort((a, b) => b.winRate - a.winRate);   // [0] easiest … [last] hardest
    // avoid identical archetypes back to back where a cheap swap fixes it
    for (let i = 1; i < movable.length; i++) {
      if (movable[i].plan.arch !== movable[i - 1].plan.arch) continue;
      for (let j = i + 1; j < movable.length; j++) {
        if (movable[j].plan.arch === movable[i - 1].plan.arch) continue;
        if (Math.abs(movable[j].winRate - movable[i].winRate) > 0.04) break;
        [movable[i], movable[j]] = [movable[j], movable[i]];
        break;
      }
    }
    const finales = SLOTS[band].filter(id => FINALE_ID.has(id)).sort((a, b) => a - b);
    const bodies = SLOTS[band].filter(id => !FINALE_ID.has(id) && !BREATHER_ID.has(id));
    // pull the hardest N off the tail; the later finale gets the harder board (60 hardest)
    const peaks = movable.splice(movable.length - finales.length, finales.length);
    finales.forEach((id, i) => { peaks[i].level.id = id; peaks[i].plan.finale = true; out.push(peaks[i]); });
    bodies.forEach((id, i) => { movable[i].level.id = id; out.push(movable[i]); });        // easy→hard
    for (const id of SLOTS[band].filter(s => BREATHER_ID.has(s))) {
      const g = generated.find(x => x.plan.pinId === id);
      g.level.id = id; out.push(g);
    }
  }
  out.sort((a, b) => a.level.id - b.level.id);
  for (const o of out) o.entry = o.level;

  // ---------- emit ----------
  const table = ["lvl band arch    win%  bandMin  median  par  verdict   (* = greybox kit level)"];
  for (const { entry, winRate, medianPieces } of out) {
    const min = BAND_MIN[entry.band];
    table.push(
      String(entry.id).padStart(3) + "  " + entry.band + "   " + (entry.archetype + (entry.kit ? "*" : "")).padEnd(6) +
      (winRate * 100).toFixed(0).padStart(4) + "%   " + (min * 100).toFixed(0).padStart(4) + "%  " +
      String(medianPieces).padStart(6) + "  " + String(entry.par).padStart(3) + "  " +
      (winRate >= min ? "PASS" : "FAIL"));
  }
  const allPass = out.every(({ entry, winRate }) => winRate >= BAND_MIN[entry.band]);
  table.push(allPass ? "ALL LEVELS WITHIN BANDS ✓" : "FAILURES PRESENT ✗");

  const lines = out.map(({ entry }) => {
    const o = { id: entry.id, band: entry.band, archetype: entry.archetype,
                blocked: entry.blocked, lanterns: entry.lanterns, seed: entry.seed, par: entry.par };
    if (entry.kit) o.kit = true;
    return "  " + JSON.stringify(o);
  });
  const body =
`/* AUTO-GENERATED by scripts/dev/gen-levels.cjs — do not hand-edit.
   Regenerate: node scripts/dev/gen-levels.cjs
   60 levels under the position-band law (tuning.json: A=1-10, B=11-30,
   C=31-60). All 10 greybox kit levels are kept (* in table): kit 1-4 open the
   game, kit 5-10 are redistributed into their lawful bands. The rest are
   generated per lanthorn-prd/01-level-design-spec.md. Every level validated
   by the greedy bot (${FINAL_RUNS} seed-variants, no assist) against
   tuning.json bands; authored queues of generated levels are bot-winnable.
   Master seed ${MASTER_SEED}.

${table.join("\n")}
*/
(function (root) {
  "use strict";
  const LEVELS = [
${lines.join(",\n")}
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = LEVELS;
  else root.LANTHORN_LEVELS = LEVELS;
})(typeof globalThis !== "undefined" ? globalThis : this);
`;
  fs.writeFileSync(path.join(ROOT, "web", "js", "levels.js"), body);
  console.log(table.join("\n"));
  console.log(`\nwrote web/js/levels.js (${out.length} levels) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
