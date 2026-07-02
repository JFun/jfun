/* Excavate engine tests. Determinism golden + fairness/well-formedness invariants across
   the modifier deck (blur/decoy/multi/bedrock/silhouette/fog). Every buried subject is
   always present and each hottest tile stays diggable (bedrock never buries a subject or
   its 4-neighbours), so no level is unsolvable — mods tune difficulty, not solvability.
   Uses @jfun/test-harness. */
const path = require("path");
const { harness } = require("@jfun/test-harness");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const t = harness("excavate engine");
const N = E.N, TILES = E.TILES;
const rc = i => [Math.floor(i / N), i % N];
const seedFor = n => ((n * 0x9e3779b1) ^ 0x51ed) >>> 0;

t.section("determinism");
t.deterministic("build(42, L4, multi+blur)", () => E.build(42, 4, { multi: 2, blur: 6 }), 3);
t.golden("par(42, L4) stable", () => E.par(42, 4, { multi: 2 }), E.par(42, 4, { multi: 2 }));

// a spread of (seed, level, mods) covering the deck
const cases = [];
for (let i = 1; i <= 120; i++) {
  const lvl = 1 + (i % 8);
  const mods = {};
  if (i % 2) mods.blur = 4 + (i % 8);
  if (i % 3 === 0) mods.decoy = 1 + (i % 3);
  if (i % 4 === 0) mods.multi = 2;
  if (i % 5 === 0) mods.bedrock = 2 + (i % 4);
  if (i % 6 === 0) mods.silhouette = true;
  if (i % 7 === 0) mods.fog = true;
  cases.push({ seed: seedFor(i), level: lvl, mods });
}

t.section("puzzle is valid across the modifier deck");

t.invariant("all buried subjects are among the distinct choices", cases, c => {
  const b = E.build(c.seed, c.level, c.mods);
  const uniq = new Set(b.choices);
  return uniq.size === b.choices.length && b.answers.every(a => uniq.has(a)) &&
    b.choices.length === 6 && b.answers.length === (c.mods.multi === 2 ? 2 : 1);
});

t.invariant("dot field well-formed (36 cells, 0..4)", cases, c => {
  const b = E.build(c.seed, c.level, c.mods);
  return b.dots.length === TILES && b.hintLevel.length === TILES && b.dots.every(d => Number.isInteger(d) && d >= 0 && d <= 4);
});

t.invariant("each subject tile is that subject's true hottest (min-saliency) cell", cases, c => {
  const b = E.build(c.seed, c.level, c.mods);
  return b.subjectTiles.every((st, k) => st >= 0 && st < TILES && b.saliency[k][st] === Math.min.apply(null, b.saliency[k]));
});

t.invariant("bedrock never buries a subject tile or its 4-neighbours (stays winnable)", cases, c => {
  const b = E.build(c.seed, c.level, c.mods);
  for (const st of b.subjectTiles) {
    if (b.bedrock[st]) return false;
    const [sr, sc] = rc(st);
    for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const nr = sr + dr, nc = sc + dc, ni = nr * N + nc;
      if (nr >= 0 && nc >= 0 && nr < N && nc < N && b.bedrock[ni]) return false;
    }
  }
  return true;
});

t.invariant("two-subject boards have 2 distinct, separated focals", cases.filter(c => c.mods.multi === 2), c => {
  const b = E.build(c.seed, c.level, c.mods);
  if (b.subjects.length !== 2 || b.subjects[0].name === b.subjects[1].name) return false;
  const d = Math.hypot(b.focals[0].x - b.focals[1].x, b.focals[0].y - b.focals[1].y);
  return d >= 0.3;   // forced apart (constraint target 0.42, allow a little slack)
});

t.invariant("par/budget sane (par 2..9, budget > par, blur 0..12)", cases, c => {
  const b = E.build(c.seed, c.level, c.mods);
  return b.parDigs >= 2 && b.parDigs <= 9 && b.budget > b.parDigs && b.blur >= 0 && b.blur <= 12;
});

t.section("difficulty ramps");
t.invariant("more blur mod ⇒ more blur", [0], () => {
  for (let i = 0; i < 30; i++) { const s = seedFor(500 + i); if (!(E.build(s, 3, { blur: 8 }).blur > E.build(s, 3, { blur: 2 }).blur)) return false; }
  return true;
});

process.exit(t.summary());
