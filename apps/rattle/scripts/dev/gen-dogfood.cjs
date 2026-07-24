#!/usr/bin/env node
/* GEN-DOGFOOD: prove the framework edition (gen-campaign2.cjs over
   @jfun/difficulty generateCampaign) reproduces the ORIGINAL gen-campaign.cjs
   BIT-FOR-BIT — generator vs generator, both run NOW on the same engine.
   (Comparing against the shipped levels.js would chase engine drift, not
   framework bugs: the engine has changed since the campaign was generated.)

   For each range: run the original in `splice` mode (it writes its levels into
   web/js/levels.js), capture the serialized level LINES byte-for-byte plus the
   per-level decision trace (taps/bot/wr) from stderr, `git checkout` the file
   back, then run the framework edition in-process and compare:
     1. fmt line per level — byte-identical (seed, taps, par, objs, mix, bias,
        intro, hard, hint all live here);
     2. decision trace — same taps/bot, same measured WR (rounded %, the only
        precision the original prints).
   EFFICIENCY: the per-seed math (beam par + WR) is ALREADY proven bit-identical
   by difficulty-dogfood.cjs + the searchSeed≡legacy test, and the curve math by
   the maker≡verbatim pin — so this only needs to exercise the ORCHESTRATION
   (spec building, per-class bands, relax, serialization). The default range set
   is therefore the CHEAP levels that collectively hit every orchestration path
   (teach start, teach/toy + toy/stone edges, one X4 hard beat, shell intro +
   normal with colour-gated crates), skipping the pathologically expensive tiers
   (balloon = 3000-step idle-sim/seed, bomb, combo, 5-colour finale — same
   buildSpec shapes, and the bit-fidelity review already line-compared them). Run
   `... full` for the exhaustive 9-range set (hours; use caffeinate + stream).

   Usage: node scripts/dev/gen-dogfood.cjs            # cheap representative set
          node scripts/dev/gen-dogfood.cjs 24 24      # a specific range
          node scripts/dev/gen-dogfood.cjs full       # every tier incl. finale */
const path = require("path");
const fs = require("fs");
const { execSync, execFileSync } = require("child_process");
const D = require(path.join(__dirname, "..", "..", "..", "..", "packages", "difficulty"));
const { plugin, plan } = require(path.join(__dirname, "gen-campaign2.cjs"));

const APP = path.join(__dirname, "..", "..");
const LEVELS_FILE = path.join(APP, "web", "js", "levels.js");
const argNums = process.argv.slice(2).map(Number).filter(x => !isNaN(x));
const FULL = process.argv.includes("full");
// cheap representative set (every orchestration path, no balloon/bomb/combo/finale)
const CHEAP = [[1, 4], [8, 9], [16, 17], [24, 24], [27, 28]];
// the exhaustive set: adds a super/extreme beat, balloon/bomb tiers, the finale
const FULLSET = [[1, 4], [8, 9], [16, 17], [24, 24], [29, 29], [39, 41], [55, 55], [79, 79], [105, 106]];
const RANGES = argNums.length ? [[argNums[0], argNums[1] || argNums[0]]] : (FULL ? FULLSET : CHEAP);

function levelLines(src) {
  const m = src.match(/const LEVELS = \[\n([\s\S]*?)\n  \];/);
  if (!m) throw new Error("no LEVELS block found");
  return m[1].split("\n");
}
function runOld(lo, hi) {
  let err = null, out = "";
  try {   // the trace goes to stderr — fold it into stdout via the shell
    out = execSync("node scripts/dev/gen-campaign.cjs " + lo + " " + hi + " splice 2>&1",
      { cwd: APP, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    if (e.status === 2) out = e.stdout || "";   // written-but-cadence-flagged: fine
    else err = "old generator exited " + e.status + ":\n" + (e.stdout || e.message);
  }
  const lines = err ? null : levelLines(fs.readFileSync(LEVELS_FILE, "utf8")).slice(lo - 1, hi);
  execSync("git checkout -- web/js/levels.js", { cwd: APP });
  return { lines, trace: out, err };
}
function parseTrace(text) {
  // L 24 [stone  ] col=4 taps=6 bot=5 | attWR 72% (tgt 65%) …
  const rows = {};
  for (const line of String(text).split("\n")) {
    const m = line.match(/^L\s*(\d+)\s+\[.*?\]\s+col=(\d+)\s+taps=(\d+)\s+bot=(\d+)\s+\|\s+attWR\s+(\d+)%/);
    if (m) rows[+m[1]] = { taps: +m[3], bot: +m[4], wr: +m[5] };
  }
  return rows;
}

let identical = 0, diffs = 0, total = 0;
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";
console.error(`dogfood ${RANGES.map(r => r[0] + "-" + r[1]).join(" ")}  (streaming; each range prints when its old+new runs finish)`);
for (const [lo, hi] of RANGES) {
  const rt0 = Date.now();
  console.error(`\n== range ${lo}-${hi} == [${el()} elapsed] running old generator…`);
  const old = runOld(lo, hi);
  console.error(`   old+new done in ${((Date.now() - rt0) / 1000).toFixed(0)}s`);
  if (old.err) { console.error("  ✗ " + old.err); diffs += hi - lo + 1; total += hi - lo + 1; continue; }
  const oldTrace = parseTrace(old.trace);
  const run = D.generateCampaign(plugin, plan, { lo, hi });
  for (let n = lo; n <= hi; n++) {
    total++;
    const i = n - lo;
    const newLevel = run.levels[i];
    if (!newLevel) { console.error(`  L${n} ✗ framework produced no level (${JSON.stringify(run.fails)})`); diffs++; continue; }
    const newLine = plugin.fmt(newLevel);
    const oldLine = old.lines[i];
    const row = run.rows.find(r => r.n === n);
    const ot = oldTrace[n];
    const traceOK = ot && ot.taps === row.budget && ot.bot === row.par && ot.wr === Math.round(row.wr * 100);
    if (newLine === oldLine && traceOK) { identical++; console.error(`  L${n} ✓ byte-identical (seed=${row.seed} par=${row.par} taps=${row.budget} wr=${Math.round(row.wr * 100)}%)`); }
    else {
      diffs++;
      console.error(`  L${n} ✗ DIVERGED`);
      if (newLine !== oldLine) { console.error(`    old: ${oldLine}`); console.error(`    new: ${newLine}`); }
      if (!traceOK) console.error(`    trace old=${JSON.stringify(ot)} new={taps:${row.budget},bot:${row.par},wr:${Math.round(row.wr * 100)}}`);
    }
  }
}
console.error(`\n${identical}/${total} byte-identical, ${diffs} diverged, in ${Math.round((Date.now() - t0) / 60000)}min`);
process.exit(diffs ? 1 : 0);
