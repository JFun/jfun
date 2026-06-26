/* __GameName__ engine tests. Determinism golden + "every daily is winnable with a
   finite par" — the invariant the daily loop leans on (never hand out an
   unsolvable daily). Uses @jfun/test-harness. Replace alongside your real rules. */
const path = require("path");
const { harness } = require("@jfun/test-harness");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const GL = require("@jfun/growth-loop");
const t = harness("__GAME__ engine");

t.section("determinism golden");
// Same seed → identical board, always (the daily contract).
t.deterministic("build(42)", () => E.build(42), 3);
t.golden("countFilled(build(42))", () => E.countFilled(E.build(42)), E.countFilled(E.build(42)));

t.section("every daily is winnable with a finite par");
// Sample a year of dailies; each must be solvable with a known integer par.
const days = Array.from({ length: 60 }, (_, i) => 20629 + i * 6);
t.invariant("daily has finite par", days, d => {
  const p = E.par(GL.Daily.seedForDay(d));
  return Number.isInteger(p) && p >= 0;
});

process.exit(t.summary());
