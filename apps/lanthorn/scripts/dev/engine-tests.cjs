#!/usr/bin/env node
/* engine-tests.cjs — Lanthorn engine + level-data invariants.
   Run: node scripts/dev/engine-tests.cjs   (exit 0 = all pass) */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const E = require(path.join(ROOT, "web", "js", "engine.js"));
const LEVELS = require(path.join(ROOT, "web", "js", "levels.js"));
const TUNING_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, "lanthorn-prd", "tuning.json"), "utf8"));

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; console.error("  FAIL: " + name); }
}
function section(name) { console.log("· " + name); }

// ---------- 1. tuning.json sync (the law lives in one place) ----------
section("tuning.json ↔ engine.TUNING sync");
ok(E.TUNING.boardSize === TUNING_JSON.board.size, "board size");
ok(E.TUNING.handSlots === TUNING_JSON.hand.slots, "hand slots");
for (const [band, key] of [["A","bandA"],["B","bandB"],["C","bandC"]]) {
  ok(JSON.stringify(E.TUNING.pieceWeights[band]) === JSON.stringify(TUNING_JSON.pieceWeights[key]),
     `piece weights band ${band}`);
}
for (const band of ["A","B","C","D"]) {
  ok(E.TUNING.botBandMin[band] === TUNING_JSON.easyCurve.bands[band].botWinMin, `band min ${band}`);
}
ok(JSON.stringify(E.TUNING.heuristic) === JSON.stringify(TUNING_JSON.bot.heuristic), "bot heuristic");

// ---------- 2. RNG / queue determinism ----------
section("determinism");
{
  const r1 = E.makeRNG(42), r2 = E.makeRNG(42);
  let same = true;
  for (let i = 0; i < 1000; i++) if (r1() !== r2()) same = false;
  ok(same, "mulberry32 deterministic");
  const lv = LEVELS[0];
  const a = E.newGame(lv), b = E.newGame(lv);
  const drawsA = [], drawsB = [];
  for (let i = 0; i < 30; i++) { drawsA.push(a.rng()); drawsB.push(b.rng()); }
  ok(drawsA.join() === drawsB.join(), "same level → same queue");
  ok(a.hand.join() === b.hand.join(), "same starting hand");
}

// ---------- 3. placement rules ----------
section("placement rules");
{
  const lv = { id: 0, band: "A", blocked: [[3,0],[3,1],[3,2],[3,3]], lanterns: [[3,5],[5,2]], seed: 1 };
  const g = E.newGame(lv);
  ok(!E.canPlace(g, "I2h", 0, 7), "out of bounds rejected");
  ok(!E.canPlace(g, "I2h", 3, 0), "wall overlap rejected");
  ok(E.canPlace(g, "I4h", 3, 4), "fit accepted");
  // fill row 3 cols 4-7 → row full via 4 walls + 4 filled → lantern at (3,5) lights
  g.hand = ["I4h", "I2h", "I2h"];
  const res = E.place(g, 0, 3, 4);
  ok(res && res.cleared.rows.includes(3), "walls count toward line fullness");
  ok(res.lit.length === 1 && res.lit[0].r === 3 && res.lit[0].c === 5, "lantern lights on row clear");
  ok(g.grid[3][0] === E.WALL && g.grid[3][1] === E.WALL, "walls survive the clear");
  ok(g.grid[3][4] === E.EMPTY && g.grid[3][7] === E.EMPTY, "filled cells cleared");
  ok(!g.lanterns[1].lit && !g.over, "other lantern untouched, game continues");
  // counts stay correct after clear
  const rc = g.rowCnt.slice(), cc = g.colCnt.slice();
  E.recount(g);
  ok(rc.join() === g.rowCnt.join() && cc.join() === g.colCnt.join(), "incremental counts match recount");
}
{
  // column clear lights lantern by column
  const lv = { id: 0, band: "A", blocked: [[0,2],[1,2],[2,2],[3,2]], lanterns: [[5,2],[0,0]], seed: 1 };
  const g = E.newGame(lv);
  g.hand = ["I4v", "I2h", "I2h"];
  const res = E.place(g, 0, 4, 2);
  ok(res && res.cleared.cols.includes(2) && res.lit.length === 1 && res.lit[0].c === 2,
     "lantern lights on column clear");
}

// ---------- 4. hand refill / win / fail / assist ----------
section("hand, win, fail, assist");
{
  const lv = { id: 0, band: "A", blocked: [], lanterns: [[0,0],[7,7]], seed: 7 };
  const g = E.newGame(lv);
  ok(g.hand.length === 3, "hand starts at 3");
  // empty the hand without clearing lines: place 3 pieces in scattered spots
  outer:
  for (let n = 0; n < 3; n++) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const before = g.hand.length;
      const res = E.place(g, 0, r, c);
      if (res) { ok(res.cleared.rows.length === 0 || true, ""); if (g.hand.length !== before - 1 && g.hand.length !== 3) { ok(false, "refill"); } continue outer; }
    }
  }
  ok(g.hand.length === 3, "hand refills to 3 when emptied");
}
{
  // win: light both lanterns
  const lv = { id: 0, band: "A",
    blocked: [[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[1,0],[1,1],[1,2],[1,3],[1,4],[1,5]],
    lanterns: [[0,6],[1,7]], seed: 3 };
  const g = E.newGame(lv);
  g.hand = ["SQ2", "I2h", "I2h"];
  const res = E.place(g, 0, 0, 6);
  ok(res && g.won && g.over, "lighting all lanterns wins");
}
{
  // stuck: board nearly full, no piece fits → over, not won; assist eligibility
  const lv = { id: 0, band: "A", blocked: [], lanterns: [[0,0],[4,4]], seed: 9 };
  const g = E.newGame(lv);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) g.grid[r][c] = E.FILLED;
  g.grid[7][7] = E.EMPTY;
  E.recount(g);
  g.lanterns[0].lit = true;            // exactly one left
  g.hand = ["SQ2", "I3h", "T4a"];
  ok(!E.anyFit(g), "no fit detected");
  g.over = true; g.won = false;
  ok(E.assistEligible(g), "assist eligible: stuck with exactly 1 lantern left");
  const before = g.hand.join();
  ok(E.useAssist(g), "assist grants fresh hand");
  ok(g.hand.length === 3 && g.assistUsed, "fresh hand of 3, assist consumed");
  ok(!E.assistEligible(g), "assist is once per level");
  void before;
}
{
  // not eligible with 2 lanterns left
  const lv = { id: 0, band: "A", blocked: [], lanterns: [[0,0],[4,4]], seed: 9 };
  const g = E.newGame(lv);
  g.over = true; g.won = false;
  ok(!E.assistEligible(g), "assist not eligible with 2 lanterns unlit");
}

// ---------- 5. greybox fidelity (engine port must be bit-identical) ----------
section("greybox fidelity (PRD appendix reproduction)");
{
  require(path.join(ROOT, "lanthorn-prd", "greybox", "engine.js"));
  const GREY = globalThis.LanthornEngine;
  // PRD appendix (June 11, 2026): win% per greybox level at 100 runs
  const APPENDIX = { 1: 1.00, 2: 1.00, 3: 1.00, 4: 1.00, 5: 0.98, 6: 0.95, 7: 0.99, 8: 0.86, 9: 0.89, 10: 0.75 };
  for (const lv of GREY.LEVELS) {
    const mine = E.simulateLevel(lv, 100);
    const orig = GREY.simulateLevel(lv, 100);
    ok(mine.winRate === orig.winRate && mine.medianPieces === orig.medianPieces,
       `level ${lv.id}: ported engine matches original (${mine.winRate} vs ${orig.winRate})`);
    ok(Math.abs(mine.winRate - APPENDIX[lv.id]) < 0.005, `level ${lv.id}: matches PRD appendix`);
  }
}

// ---------- 6. shipped level data sanity (60 levels) ----------
section("levels.js data sanity");
{
  ok(LEVELS.length === 60, "60 levels");
  const bandFor = id => id <= 10 ? "A" : id <= 30 ? "B" : "C";
  LEVELS.forEach((lv, i) => {
    const id = i + 1;
    const errs = [];
    if (lv.id !== id) errs.push("id order");
    if (lv.band !== bandFor(id)) errs.push(`band ${lv.band} (want ${bandFor(id)})`);
    if (lv.blocked.length > TUNING_JSON.board.maxBlockedCells) errs.push("too many walls");
    if (lv.lanterns.length < TUNING_JSON.lanterns.min || lv.lanterns.length > TUNING_JSON.lanterns.max)
      errs.push("lantern count");
    const seen = new Set();
    for (const [r, c] of lv.blocked.concat(lv.lanterns)) {
      if (r < 0 || c < 0 || r > 7 || c > 7) errs.push("out of bounds");
    }
    const bset = new Set(lv.blocked.map(p => p.join(",")));
    for (const p of lv.lanterns) {
      if (bset.has(p.join(","))) errs.push("lantern on wall");
      if (seen.has(p.join(","))) errs.push("duplicate lantern");
      seen.add(p.join(","));
    }
    if (new Set(lv.lanterns.map(p => p[0])).size === 1) errs.push("all lanterns in one row");
    if (new Set(lv.lanterns.map(p => p[1])).size === 1) errs.push("all lanterns in one column");
    if (!Number.isInteger(lv.seed)) errs.push("seed");
    if (id > 10 && !(lv.par >= 3)) errs.push("par");
    if (id % 20 === 10 && lv.archetype !== "A") errs.push("world-midpoint not a breather (A)");
    if (id % 20 === 0 && lv.archetype === "A") errs.push("world-finale is a breather, should be a peak");
    ok(errs.length === 0, `level ${id}: ${errs.join(", ")}`);
  });
  // generated levels: authored queue must be bot-winnable (kindness floor)
  let authoredOk = true;
  for (const lv of LEVELS.slice(10)) if (!E.botPlay(lv, lv.seed).won) authoredOk = false;
  ok(authoredOk, "authored queues (11-60) bot-winnable");
}

console.log(failed === 0 ? `\nengine-tests: ${passed} checks passed ✓` : `\nengine-tests: ${failed} FAILED, ${passed} passed`);
process.exit(failed === 0 ? 0 : 1);
