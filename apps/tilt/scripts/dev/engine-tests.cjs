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
  // a non-matching hole CATCHES the slide — ball parks in the dimple, unfixed
  st = { marbles: [{ x: 1, y: 3, c: "r", fixed: false }] };
  r = E.tilt(st, "R", { "5,3": "b" });
  t.ok("wrong-color hole parks the ball (dimple catch)", st.marbles[0].x === 5 && !st.marbles[0].fixed);
  // …and it slides away freely on the next tilt
  r = E.tilt(st, "R", { "5,3": "b" });
  t.ok("parked ball escapes on the next tilt", st.marbles[0].x === 7);
  // stacks against another marble; fixed marbles block
  st = { marbles: [{ x: 1, y: 3, c: "r", fixed: false }, { x: 6, y: 3, c: "b", fixed: true }] };
  r = E.tilt(st, "R", {});
  t.ok("blocked by fixed marble", st.marbles[0].x === 5);
  // wall block stops the slide one short
  st = { marbles: [{ x: 1, y: 3, c: "r", fixed: false }] };
  r = E.tilt(st, "R", {}, new Set(["5,3"]));
  t.ok("wall block stops the marble", st.marbles[0].x === 4 && !st.marbles[0].fixed);
  // HILL cells pass a slide moving ALONG their axis (either direction)…
  st = { marbles: [{ x: 1, y: 3, c: "r", fixed: false }] };
  r = E.tilt(st, "R", {}, null, { "4,3": "H", "5,3": "H" });
  t.ok("axis slide crests the hill left→right", st.marbles[0].x === 7);
  st = { marbles: [{ x: 7, y: 3, c: "r", fixed: false }] };
  r = E.tilt(st, "L", {}, null, { "4,3": "H", "5,3": "H" });
  t.ok("axis slide crests the hill right→left", st.marbles[0].x === 0);
  // …but a SIDEWAYS approach stops at its base, like a wall
  st = { marbles: [{ x: 4, y: 0, c: "r", fixed: false }] };
  r = E.tilt(st, "D", {}, null, { "4,3": "H", "5,3": "H" });
  t.ok("sideways approach stops at the hill's base", st.marbles[0].y === 2);
  // a slide over the hill still snaps into its matching hole beyond it
  st = { marbles: [{ x: 1, y: 3, c: "r", fixed: false }] };
  r = E.tilt(st, "R", { "6,3": "r" }, null, { "4,3": "H", "5,3": "H" });
  t.ok("slide over the hill sinks in its matching hole", st.marbles[0].x === 6 && st.marbles[0].fixed);
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
const wallsOf = p => new Set((p.walls || []).map(b => b.x + "," + b.y));
const slopesOf = p => {
  const m = {};
  for (const s of (p.slopes || []))
    for (let ix = 0; ix < s.w; ix++) for (let iy = 0; iy < s.h; iy++) m[(s.x + ix) + "," + (s.y + iy)] = s.a;
  return m;
};
t.invariant("walls in bounds, never on holes/marbles, count matches ramp", boards, it => {
  const ws = wallsOf(it.p);
  if ((it.p.walls || []).length !== E.rampFor(it.L).nWalls) return false;
  return (it.p.walls || []).every(b =>
    b.x >= 0 && b.x < E.N && b.y >= 0 && b.y < E.N &&
    !it.p.holes[b.x + "," + b.y] &&
    !it.p.init.marbles.some(m => m.x === b.x && m.y === b.y));
});
t.invariant("hills: 2-cell patches, in bounds, valid axis, never on holes/marbles/walls, count matches ramp", boards, it => {
  if ((it.p.slopes || []).length !== E.rampFor(it.L).nSlopes) return false;
  const ws = wallsOf(it.p);
  return (it.p.slopes || []).every(s => {
    if ((s.a !== "H" && s.a !== "V") || s.w * s.h !== 2) return false;
    if (s.a === "H" ? s.w !== 2 : s.h !== 2) return false;   // laid along the axis
    for (let ix = 0; ix < s.w; ix++) for (let iy = 0; iy < s.h; iy++) {
      const x = s.x + ix, y = s.y + iy, k = x + "," + y;
      if (x < 0 || x >= E.N || y < 0 || y >= E.N) return false;
      if (it.p.holes[k] || ws.has(k)) return false;
      if (it.p.init.marbles.some(m => m.x === x && m.y === y)) return false;
    }
    return true;
  });
});
t.invariant("stored solution solves in exactly par tilts (with walls + slopes)", boards, it => {
  const st = E.cloneState(it.p.init);
  const ws = wallsOf(it.p), sm = slopesOf(it.p);
  for (const d of it.p.solution) E.tilt(st, d, it.p.holes, ws, sm);
  return it.p.solution.length === it.p.par && E.isSolved(st, it.p.holesArr.length);
});
t.invariant("independent BFS agrees with par", boards, it => {
  const s = E.solveBFS(it.p.init, it.p.holes, it.p.holesArr.length, it.p.par + 1, wallsOf(it.p), slopesOf(it.p));
  return !!s && s.length === it.p.par;
});

t.section("ramp shape");
t.ok("holes climb 3→6", E.rampFor(1).nHoles === 3 && E.rampFor(5).nHoles === 4 && E.rampFor(9).nHoles === 5 && E.rampFor(13).nHoles === 6 && E.rampFor(40).nHoles === 6);
t.ok("walls arrive at L4 and climb to 8", E.rampFor(1).nWalls === 0 && E.rampFor(3).nWalls === 0 && E.rampFor(4).nWalls === 2 && E.rampFor(10).nWalls === 4 && E.rampFor(40).nWalls === 8);
t.ok("hills are PARKED (never generated) — block obstacles only for MVP", E.rampFor(1).nSlopes === 0 && E.rampFor(6).nSlopes === 0 && E.rampFor(14).nSlopes === 0 && E.rampFor(40).nSlopes === 0);

process.exit(t.summary());
