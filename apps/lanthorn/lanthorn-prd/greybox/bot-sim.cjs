/* Headless level validation: node bot-sim.cjs [runs]
   Greedy bot (no assist) over seed-variants per level; compares win% to tuning bands. */
require("./engine.js");
const E = globalThis.LanthornEngine;

const runs = parseInt(process.argv[2], 10) || 100;
console.log(`Lanthorn greybox bot-sim — greedy 1-ply, ${runs} seed-variants/level, no assist\n`);
console.log("lvl band  win%   bandMin  median-pieces  verdict");

let allPass = true;
for (const level of E.LEVELS) {
  const r = E.simulateLevel(level, runs);
  const pass = r.winRate >= r.bandMin;
  if (!pass) allPass = false;
  console.log(
    String(r.id).padStart(3) + "  " + r.band + "   " +
    (r.winRate * 100).toFixed(0).padStart(4) + "%   " +
    (r.bandMin * 100).toFixed(0).padStart(4) + "%   " +
    String(r.medianPieces ?? "-").padStart(8) + "       " +
    (pass ? "PASS" : "FAIL — regenerate or hand-fix (01-spec §pipeline)")
  );
}
console.log("\n" + (allPass ? "ALL LEVELS WITHIN BANDS ✓" : "SOME LEVELS OUT OF BAND ✗ — fix before fun gate"));
process.exit(allPass ? 0 : 1);
