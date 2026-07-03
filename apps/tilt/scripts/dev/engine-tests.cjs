/* Tilt engine tests. Determinism golden + fairness invariants swept across the
   level campaign: every level's puzzle is BFS-verified solvable at its stored par
   via its stored solution, hole colors are distinct, and marbles never start on
   holes. Uses @jfun/test-harness. */
const path = require("path");
const { harness } = require("@jfun/test-harness");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const t = harness("tilt engine");

t.section("resolver fixtures");
{
  // lone marble slides to the wall
  let st = { marbles: [{ x: 1, y: 3, c: "r", fixed: false }] };
  let r = E.tilt(st, "R", {});
  t.ok("rolls to the wall", r.moved && st.marbles[0].x === 7 && !st.marbles[0].fixed);
  // snaps into its matching hole mid-path
  st = { marbles: [{ x: 1, y: 3, c: "r", fixed: false }] };
  r = E.tilt(st, "R", { "5,3": "r" });
  t.ok("snaps into matching hole", st.marbles[0].x === 5 && st.marbles[0].fixed);
  // rolls PAST a non-matching hole
  st = { marbles: [{ x: 1, y: 3, c: "r", fixed: false }] };
  r = E.tilt(st, "R", { "5,3": "b" });
  t.ok("ignores other-color hole", st.marbles[0].x === 7 && !st.marbles[0].fixed);
  // stacks against another marble; fixed marbles block
  st = { marbles: [{ x: 1, y: 3, c: "r", fixed: false }, { x: 6, y: 3, c: "b", fixed: true }] };
  r = E.tilt(st, "R", {});
  t.ok("blocked by fixed marble", st.marbles[0].x === 5);
}

t.section("determinism");
t.deterministic("build(1)", () => E.build(1), 3);
t.deterministic("build(5)", () => E.build(5), 3);
t.deterministic("build(17)", () => E.build(17), 3);

t.section("every level fair across the campaign");
const LEVELS = [];
for (let L = 1; L <= 30; L++) LEVELS.push(L);
const boards = LEVELS.map(L => ({ name: "L" + L, L, p: E.build(L) }));

t.invariant("puzzle generated", boards, it => !!it.p);
t.invariant("hole count matches the ramp", boards, it =>
  it.p.holesArr.length === E.rampFor(it.L).nHoles);
t.invariant("hole colors are DISTINCT (goal legible at a glance)", boards, it =>
  new Set(it.p.holesArr.map(h => h.c)).size === it.p.holesArr.length);
t.invariant("holes at distinct in-bounds cells", boards, it => {
  const seen = new Set();
  return it.p.holesArr.every(h => {
    const k = h.x + "," + h.y;
    if (seen.has(k)) return false;
    seen.add(k);
    return h.x >= 0 && h.x < E.N && h.y >= 0 && h.y < E.N && it.p.holes[k] === h.c;
  }) && Object.keys(it.p.holes).length === it.p.holesArr.length;
});
t.invariant("one matching marble per hole, none starting on a hole", boards, it => {
  const holeColors = it.p.holesArr.map(h => h.c).sort().join("");
  const marbleColors = it.p.init.marbles.map(m => m.c).sort().join("");
  return holeColors === marbleColors &&
    it.p.init.marbles.every(m => !it.p.holes[m.x + "," + m.y] && !m.fixed);
});
t.invariant("par respects the ramp floor", boards, it => it.p.par >= E.rampFor(it.L).minPar);
t.invariant("stored solution solves in exactly par tilts", boards, it => {
  const st = E.cloneState(it.p.init);
  for (const d of it.p.solution) E.tilt(st, d, it.p.holes);
  return it.p.solution.length === it.p.par && E.isSolved(st, it.p.holesArr.length);
});
t.invariant("independent BFS agrees with par", boards, it => {
  const s = E.solveBFS(it.p.init, it.p.holes, it.p.holesArr.length, it.p.par + 1);
  return !!s && s.length === it.p.par;
});

t.section("ramp shape");
t.ok("holes climb 3→6", E.rampFor(1).nHoles === 3 && E.rampFor(5).nHoles === 4 && E.rampFor(9).nHoles === 5 && E.rampFor(13).nHoles === 6 && E.rampFor(40).nHoles === 6);

process.exit(t.summary());
