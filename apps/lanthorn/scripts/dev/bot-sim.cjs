#!/usr/bin/env node
/* bot-sim.cjs — validate the shipped 60-level set against tuning.json bands.
   Greedy 1-ply bot, 100 seed-variants per level, no assist (PRD §2 contract).
   Run: node scripts/dev/bot-sim.cjs [--runs=N]   (exit 0 = all within bands) */
"use strict";
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const E = require(path.join(ROOT, "web", "js", "engine.js"));
const LEVELS = require(path.join(ROOT, "web", "js", "levels.js"));

const runsArg = process.argv.find(a => a.startsWith("--runs="));
const RUNS = runsArg ? parseInt(runsArg.split("=")[1], 10) : 100;

const t0 = Date.now();
let fails = 0;
console.log(`bot-sim (greedy 1-ply, ${RUNS} seed-variants/level, no assist)\n`);
console.log("lvl band  win%   bandMin  median-pieces  verdict");
for (const lv of LEVELS) {
  const r = E.simulateLevel(lv, RUNS);
  const pass = r.winRate >= r.bandMin;
  const fair = r.lanternLitCounts.every(n => n > 0);
  if (!pass || !fair) fails++;
  console.log(
    String(lv.id).padStart(3) + "  " + lv.band + "   " +
    (r.winRate * 100).toFixed(0).padStart(4) + "%   " +
    (r.bandMin * 100).toFixed(0).padStart(4) + "%   " +
    String(r.medianPieces).padStart(8) + "       " +
    (pass && fair ? "PASS" : "FAIL" + (fair ? "" : " (unlightable lantern)")));
}
console.log(fails === 0 ? "\nALL LEVELS WITHIN BANDS ✓" : `\n${fails} LEVEL(S) OUTSIDE BANDS ✗`);
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(fails === 0 ? 0 : 1);
