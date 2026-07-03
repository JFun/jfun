/* Dowse engine tests. Determinism golden + fairness invariants swept across the
   level ramp. The invariants ARE the game's fairness contract: every level is
   solvable within budget at the stored par via the stored line; on strict tiers the
   pegs are load-bearing (pegless-solve fails within budget, so edge-slam spam can't
   win). Uses @jfun/test-harness. */
const path = require("path");
const { harness } = require("@jfun/test-harness");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const t = harness("dowse engine");

const pegSetOf = b => new Set(b.pegs.map(p => p.x + "," + p.y));

t.section("resolver fixtures");
{
  const N = 7;
  let m = E.resolveTilt([{ x: 0, y: 3 }], "right", new Set(), N);
  t.ok("lone marble rolls to the wall", m[0].tx === 6 && m[0].ty === 3 && m[0].cause === "wall");
  m = E.resolveTilt([{ x: 0, y: 3 }], "right", new Set(["4,3"]), N);
  t.ok("peg stops it one short", m[0].tx === 3 && m[0].cause === "peg" && m[0].pegKey === "4,3");
  m = E.resolveTilt([{ x: 0, y: 3 }, { x: 2, y: 3 }], "right", new Set(), N);
  t.ok("marbles stack against the wall", m[0].tx === 5 && m[0].cause === "marble" && m[1].tx === 6 && m[1].cause === "wall");
  m = E.resolveTilt([{ x: 3, y: 0 }, { x: 3, y: 2 }], "down", new Set(["3,5"]), N);
  t.ok("vertical: peg stops leader, follower stacks", m[1].ty === 4 && m[1].cause === "peg" && m[0].ty === 3 && m[0].cause === "marble");
}

t.section("determinism");
t.deterministic("build(1)", () => E.build(1), 3);
t.deterministic("build(7)", () => E.build(7), 3);
t.deterministic("build(23)", () => E.build(23), 3);
t.golden("seedForLevel stable", () => E.seedForLevel(12), ((12 * 0x9e3779b1) ^ 0xd05e) >>> 0);

t.section("every level fair across the ramp");
const LEVELS = [];
for (let L = 1; L <= 45; L++) LEVELS.push(L);
const boards = LEVELS.map(L => ({ name: "L" + L, L, b: E.build(L) }));

t.invariant("board generated", boards, it => !!it.b);
t.invariant("grid matches ramp", boards, it => it.b.N === E.rampFor(it.L).N);
t.invariant("3 distinct marbles in bounds, off pegs", boards, it => {
  const seen = new Set();
  return it.b.marbles.length === 3 && it.b.marbles.every(m => {
    const k = m.x + "," + m.y;
    if (seen.has(k) || pegSetOf(it.b).has(k)) return false;
    seen.add(k);
    return m.x >= 0 && m.x < it.b.N && m.y >= 0 && m.y < it.b.N;
  });
});
t.invariant("pegs interior + spaced (Chebyshev ≥2)", boards, it =>
  it.b.pegs.every((p, i) =>
    p.x >= 1 && p.x <= it.b.N - 2 && p.y >= 1 && p.y <= it.b.N - 2 &&
    it.b.pegs.every((q, j) => i === j || Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) >= 2)));
t.invariant("not already solved at start", boards, it => !E.isGoal(it.b.marbles, it.b.tk));
t.invariant("budget = par + ramp slack", boards, it => it.b.budget === it.b.par + E.rampFor(it.L).slack);
t.invariant("stored line solves in exactly par tilts", boards, it => {
  let ms = it.b.marbles.map(m => ({ x: m.x, y: m.y }));
  const pegs = pegSetOf(it.b);
  for (const dir of it.b.line) ms = E.applyMoves(E.resolveTilt(ms, dir, pegs, it.b.N));
  return it.b.line.length === it.b.par && E.isGoal(ms, it.b.tk);
});
t.invariant("independent BFS agrees with par", boards, it => {
  const s = E.solve(it.b.marbles, pegSetOf(it.b), it.b.tk, it.b.budget, it.b.N);
  return !!s && s.par === it.b.par;
});
const strict = boards.filter(it => it.b.tier <= 2);
t.invariant("strict tiers: pegless-solve FAILS within budget", strict, it =>
  !E.solve(it.b.marbles, new Set(), it.b.tk, it.b.budget, it.b.N));
t.ok("most levels accept on a strict tier (" + strict.length + "/" + boards.length + ")",
  strict.length >= boards.length * 0.9);

t.invariant("pre-revealed pegs are a subset of pegs, per ramp fraction", boards, it => {
  const pegKeys = new Set(it.b.pegs.map(p => p.x + "," + p.y));
  const want = Math.min(it.b.pegs.length, Math.ceil(it.b.pegs.length * E.rampFor(it.L).preReveal));
  return it.b.revealed.length === want && it.b.revealed.every(k => pegKeys.has(k));
});
t.invariant("levels 1-2 start with ALL pegs visible (old-Tilt on-ramp)", boards.filter(it => it.L < 3), it =>
  it.b.revealed.length === it.b.pegs.length);
t.invariant("levels 8+ start fully hidden", boards.filter(it => it.L >= 8), it =>
  it.b.revealed.length === 0);

t.section("ramp shape");
t.ok("grid grows 6→7→8", E.rampFor(1).N === 6 && E.rampFor(5).N === 7 && E.rampFor(15).N === 8);
t.ok("slack tightens and never grows", [1, 5, 20, 35, 60].map(L => E.rampFor(L).slack).every((s, i, a) => i === 0 || s <= a[i - 1]));
t.invariant("early levels use row/column targets only", boards.filter(it => it.L < 3), it =>
  it.b.shape.name === "row" || it.b.shape.name === "column");

process.exit(t.summary());
