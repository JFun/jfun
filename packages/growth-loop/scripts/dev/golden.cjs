/* Determinism golden — THE contract (CLAUDE.md "Determinism is sacred in
   growth-loop"). seedForDate / dayIndex are pure functions of the UTC date; the
   whole daily + share loop breaks the instant two clients disagree. These values
   are PINNED — if a refactor changes them, every existing share link and daily
   silently desyncs, so a diff here must be a deliberate, migration-aware change. */
const path = require("path");
const GL = require(path.join(__dirname, "..", "..", "src", "growth-loop.js"));

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (String(got) === String(want)) pass++;
  else { fail++; console.error(`  ✗ ${name}: got ${got} want ${want}`); }
};
const D = ds => new Date(ds + "T12:00:00Z");

console.log("— dayIndex (UTC, monotonic) —");
eq("epoch", GL.Daily.dayIndex(D("1970-01-01")), 0);
eq("2000-01-01", GL.Daily.dayIndex(D("2000-01-01")), 10957);
eq("2026-06-25", GL.Daily.dayIndex(D("2026-06-25")), 20629);
eq("2026-06-26 is +1", GL.Daily.dayIndex(D("2026-06-26")) - GL.Daily.dayIndex(D("2026-06-25")), 1);

console.log("— seedForDate (pinned RNG seeds) —");
eq("1970-01-01", GL.Daily.seedForDate(D("1970-01-01")), 0);
eq("2000-01-01", GL.Daily.seedForDate(D("2000-01-01")), 32926475);
eq("2026-01-01", GL.Daily.seedForDate(D("2026-01-01")), 4277262279);
eq("2026-06-25", GL.Daily.seedForDate(D("2026-06-25")), 2787696485);
eq("2026-06-26", GL.Daily.seedForDate(D("2026-06-26")), 1473802157);

console.log("— seedForDay matches seedForDate for the same day —");
eq("seedForDay(20629) == seedForDate(2026-06-25)", GL.Daily.seedForDay(20629), GL.Daily.seedForDate(D("2026-06-25")));

console.log("— timezone independence (same UTC day → same seed) —");
eq("00:00Z == 23:59Z same day",
  GL.Daily.seedForDate(new Date("2026-06-25T00:00:00Z")),
  GL.Daily.seedForDate(new Date("2026-06-25T23:59:59Z")));

console.log("— share-card variant is deterministic per day —");
eq("variant stable for a day", GL.ShareCard.pickVariant(20629), GL.ShareCard.pickVariant(20629));

console.log(`\n${fail ? "✗" : "✓"} golden: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
