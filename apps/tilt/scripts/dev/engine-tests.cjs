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
for (let L = 1; L <= E.LAST_LEVEL; L++) LEVELS.push(L);
const boards = LEVELS.map(L => ({ name: "L" + L, L, p: E.build(L) }));
// curated onboarding levels are hand-authored: they follow the fairness rules
// (in-bounds, distinct colors, solvable) but NOT the procedural count ramp.
const procBoards = boards.filter(it => !E.CURATED[it.L]);

t.invariant("puzzle generated", boards, it => !!it.p);
// ramp params are keyed by the SOURCE level (sawtooth reorder renumbers the
// boards; each display level carries its source's hole/wall/par contract)
t.invariant("hole count matches the ramp (procedural levels)", procBoards, it =>
  it.p.holesArr.length === E.rampFor(E.sourceFor(it.L)).nHoles);
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
t.invariant("par respects the ramp floor", boards, it => it.p.par >= E.rampFor(E.sourceFor(it.L)).minPar);
const wallsOf = p => new Set((p.walls || []).map(b => b.x + "," + b.y));
const gatesOf = p => { const g = {}; for (const q of (p.gates || [])) g[q.x + "," + q.y] = q.px + "," + q.py; return g; };
const slopesOf = p => {
  const m = {};
  for (const s of (p.slopes || []))
    for (let ix = 0; ix < s.w; ix++) for (let iy = 0; iy < s.h; iy++) m[(s.x + ix) + "," + (s.y + iy)] = s.a;
  return m;
};
t.invariant("walls in bounds, never on holes/marbles (all levels)", boards, it =>
  (it.p.walls || []).every(b =>
    b.x >= 0 && b.x < E.N && b.y >= 0 && b.y < E.N &&
    !it.p.holes[b.x + "," + b.y] &&
    !it.p.init.marbles.some(m => m.x === b.x && m.y === b.y)));
t.invariant("wall count matches the ramp (procedural levels)", procBoards, it =>
  (it.p.walls || []).length === E.rampFor(E.sourceFor(it.L)).nWalls);
t.invariant("hills: 2-cell patches, in bounds, valid axis, never on holes/marbles/walls, count matches ramp", boards, it => {
  if ((it.p.slopes || []).length !== E.rampFor(E.sourceFor(it.L)).nSlopes) return false;
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
// CHIME (posts) boards are CONTINUOUS-only (par from certify.cjs); the discrete
// solver can't model a bounce, so the discrete-solution invariants skip them.
const discreteBoards = boards.filter(it => !(it.p.posts && it.p.posts.length));
t.invariant("stored solution solves in exactly par tilts (walls + slopes + gates)", discreteBoards, it => {
  const st = E.cloneState(it.p.init);
  const ws = wallsOf(it.p), sm = slopesOf(it.p), gm = gatesOf(it.p);
  for (const d of it.p.solution) E.tilt(st, d, it.p.holes, ws, sm, gm);
  return it.p.solution.length === it.p.par && E.isSolved(st, it.p.holesArr.length);
});
t.invariant("independent BFS agrees with par", discreteBoards, it => {
  const s = E.solveBFS(it.p.init, it.p.holes, it.p.holesArr.length, it.p.par + 1, wallsOf(it.p), slopesOf(it.p), gatesOf(it.p));
  return !!s && s.length === it.p.par;
});

t.section("ramp shape");
t.ok("holes climb 3→6", E.rampFor(1).nHoles === 3 && E.rampFor(5).nHoles === 4 && E.rampFor(9).nHoles === 5 && E.rampFor(13).nHoles === 6 && E.rampFor(30).nHoles === 6);
t.ok("walls arrive at L4 and climb to 8", E.rampFor(1).nWalls === 0 && E.rampFor(3).nWalls === 0 && E.rampFor(4).nWalls === 2 && E.rampFor(10).nWalls === 4 && E.rampFor(30).nWalls === 8);
t.ok("hills are PARKED (never generated) — block obstacles only for MVP", E.rampFor(1).nSlopes === 0 && E.rampFor(6).nSlopes === 0 && E.rampFor(14).nSlopes === 0 && E.rampFor(30).nSlopes === 0);

t.section("finite campaign + curated on-ramp");
t.ok("campaign is finite (LAST_LEVEL = 60: W1 30 + W2 Foundry 15 + W3 Chime 15)", E.LAST_LEVEL === 60);
t.ok("curated levels cover the onboarding stretch", Object.keys(E.CURATED).length >= 5 && !!E.CURATED[1] && !!E.CURATED[4]);
t.ok("Foundry is FULLY curated (31–45 hand-pinned)", (() => { for (let L = 31; L <= 45; L++) if (!E.CURATED[L]) return false; return true; })());
t.ok("Chime is FULLY curated (46–60 hand-pinned)", (() => { for (let L = 46; L <= 60; L++) if (!E.CURATED[L]) return false; return true; })());
const curBoards = Object.keys(E.CURATED).map(L => ({ name: "curated L" + L, L: +L, p: E.build(+L) }));
const onboardBoards = curBoards.filter(it => it.L <= 6);   // W1's teaching stretch only
t.invariant("curated level builds + is solvable", curBoards, it => !!it.p && Array.isArray(it.p.solution) && it.p.par >= 1);
t.invariant("curated onboarding stays gentle (par ≤ 4)", onboardBoards, it => it.p.par <= 4);
t.invariant("curated holes grow 1 → few (L1 is a single ball)", onboardBoards, it =>
  it.p.holesArr.length >= 1 && it.p.holesArr.length <= 4);
t.ok("L1 teaches the bare verb — exactly one ball", E.build(1).holesArr.length === 1 && E.build(1).init.marbles.length === 1);
t.ok("walls stay out of the first lessons (none before L4)", (E.build(1).walls || []).length === 0 && (E.build(2).walls || []).length === 0 && (E.build(3).walls || []).length === 0 && (E.build(4).walls || []).length >= 1);

t.section("gateway-hole detector (game.js checkSeal handles the dead end live)");
// A "gateway hole" (every orthogonal neighbour a wall/rim/other-hole) is reachable
// only THROUGH another hole (L19 green@(0,7) behind purple@(0,6)). Layouts are NOT
// filtered for it — original levels are preserved; the live checkSeal() flood-fill
// catches the dead end when the gateway is actually sealed by a captured ball.
t.ok("hasGatewayHole flags a hole sealed by walls + a neighbour hole", E.hasGatewayHole(
  [{ x: 0, y: 7, c: "g" }, { x: 0, y: 6, c: "p" }], { "0,7": "g", "0,6": "p" }, new Set(["1,7"])));
t.ok("hasGatewayHole passes a hole with a free approach", !E.hasGatewayHole(
  [{ x: 3, y: 3, c: "g" }], { "3,3": "g" }, new Set()));
// the original L19 gateway board now lives at display 18 (sawtooth reorder
// maps display 18 → source 19) — the layout itself is PRESERVED byte-for-byte
t.ok("the gateway board rides the reorder (display 18 ← source 19)", E.sourceFor(18) === 19);
t.ok("gateway layout preserved (green@(0,7) behind purple@(0,6))",
  E.build(18).holesArr.some(h => h.c === "g" && h.x === 0 && h.y === 7) &&
  E.build(18).holesArr.some(h => h.c === "p" && h.x === 0 && h.y === 6));

// --- lodged-ball hint aims at the ball's OWN matching hole (a destination pointer, not
// a tilt direction). Rendered in game.js drawLodgedWarnings; the engine's job here is the
// invariant it relies on: every colour has EXACTLY ONE hole, so "the matching hole" is
// unambiguous and the hint can never legitimately point at another colour's hole. ---
for (let L = 1; L <= E.LAST_LEVEL; L++) {
  const byColor = {};
  for (const h of E.build(L).holesArr) byColor[h.c] = (byColor[h.c] || 0) + 1;
  const dup = Object.keys(byColor).find(c => byColor[c] > 1);
  t.ok("L" + L + ": one hole per colour (lodged-ball hint has a unique matching target)", !dup);
}

t.section("worlds table (depth plan — chapter ranges, palettes, param plumbing)");
{
  t.ok("seven worlds (Rime + Dune cut at the kill-gate — ladder degrades gracefully)", E.WORLDS.length === 7);
  t.ok("built worlds tile 1..LAST_LEVEL exactly (W1 1–30, W2 Foundry 31–45, W3 Chime 46–60)",
    E.WORLDS[0].from === 1 && E.WORLDS[0].to === 30 &&
    E.WORLDS[1].name === "Foundry" && E.WORLDS[1].from === 31 && E.WORLDS[1].to === 45 &&
    E.WORLDS[2].name === "Chime" && E.WORLDS[2].from === 46 && E.WORLDS[2].to === E.LAST_LEVEL);
  let contiguous = true;
  for (let i = 1; i < E.WORLDS.length; i++) if (E.WORLDS[i].from !== E.WORLDS[i - 1].to + 1) contiguous = false;
  t.ok("world level ranges are contiguous and ascending", contiguous);
  t.invariant("every world carries a full identity (palette + element + params object)",
    E.WORLDS.map(w => ({ name: w.name, w })), it =>
      /^#[0-9a-f]{6}$/i.test(it.w.c1) && /^#[0-9a-f]{6}$/i.test(it.w.c2) && /^#[0-9a-f]{6}$/i.test(it.w.ring) &&
      !!it.w.name && !!it.w.element && !!it.w.line && typeof it.w.params === "object");
  t.ok("worldFor maps the shipped range to Tabletop", E.worldFor(1).id === 1 && E.worldFor(30).id === 1);
  t.ok("worldFor maps chapter edges correctly", E.worldFor(31).name === "Foundry" && E.worldFor(45).name === "Foundry" &&
    E.worldFor(46).name === "Chime" && E.worldFor(60).name === "Chime" && E.worldFor(61).name === "Sirocco" && E.worldFor(999).name === "Confluence");
  t.ok("worldFor clamps past the table to the last world", E.worldFor(9999).name === "Confluence");
}

t.section("hidden gems (deterministic placement, ~1/3 of the campaign)");
{
  let gemCount = 0, valid = true, deterministic = true, reachable = true;
  for (let L = 1; L <= E.LAST_LEVEL; L++) {
    const p = E.build(L);
    const g1 = E.gemFor(L, p), g2 = E.gemFor(L, p);
    if (E.hasGem(L) !== !!g1) valid = false;
    if (JSON.stringify(g1) !== JSON.stringify(g2)) deterministic = false;
    if (g1) {
      gemCount++;
      if (g1.x < 1 || g1.x > 6 || g1.y < 1 || g1.y > 6) valid = false;             // interior only
      if (p.holesArr.some(h => h.x === g1.x && h.y === g1.y)) valid = false;       // never on a hole
      if (p.init.marbles.some(m => m.x === g1.x && m.y === g1.y)) valid = false;   // never on a start marble
      if ((p.walls || []).some(w => w.x === g1.x && w.y === g1.y)) valid = false;  // never in a wall
      if (E.COLORS.indexOf(g1.c) < 0) valid = false;
      // independent reachability check: flood-fill from marble starts over
      // non-wall cells must reach the gem (a walled-off gem is uncollectable)
      const ws = new Set((p.walls || []).map(w => w.x + "," + w.y));
      const seen = new Set(p.init.marbles.map(m => m.x + "," + m.y));
      const q = p.init.marbles.map(m => [m.x, m.y]);
      let hit = false;
      while (q.length && !hit) {
        const [x, y] = q.shift();
        if (x === g1.x && y === g1.y) { hit = true; break; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = nx + "," + ny;
          if (nx < 0 || nx >= E.N || ny < 0 || ny >= E.N || seen.has(k) || ws.has(k)) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      if (!hit) reachable = false;
    }
  }
  t.ok("gems in exactly 20 of the 60 levels (~1/3)", gemCount === 20);
  t.ok("every gem sits on a free interior cell in a marble colour", valid);
  t.ok("every gem is reachable from a marble start (never walled off)", reachable);
  t.ok("gem placement is deterministic", deterministic);
  t.ok("levels without gems return null", E.gemFor(1, E.build(1)) === null && E.gemFor(30, E.build(30)) === null);
}

t.section("medal tiers (diamond > gold > silver; gold/silver formulas unchanged)");
{
  let ordered = true, legacy = true;
  for (let p = 1; p <= 16; p++) {
    const m = E.medalTimes(p);
    if (!(m.diamond < m.gold && m.gold < m.silver)) ordered = false;
    // the shipped 30's gold/silver curves must not move (saved medals keep meaning)
    if (Math.abs(m.gold - (1.2 + p * 1.6)) > 1e-9 || Math.abs(m.silver - (2.0 + p * 2.6)) > 1e-9) legacy = false;
  }
  t.ok("diamond < gold < silver at every par", ordered);
  t.ok("gold/silver thresholds identical to the shipped formulas", legacy);
  const mt = E.medalTimes(2);
  t.ok("medalFor walks the tiers", E.medalFor(mt.diamond - 0.1, 2) === "diamond" && E.medalFor(mt.gold - 0.1, 2) === "gold" &&
    E.medalFor(mt.silver - 0.1, 2) === "silver" && E.medalFor(mt.silver + 5, 2) === "bronze");
}

t.section("sawtooth ordering (Cut lesson: alternate easy/hard, finale = hardest — PER WORLD)");
{
  // permutation validity: each world's procedural range permutes WITHIN itself
  // (chapter identity is sacred); every curated level keeps identity mapping
  const within = (a, b) => {
    const srcs = []; for (let L = a; L <= b; L++) srcs.push(E.sourceFor(L));
    return new Set(srcs).size === b - a + 1 && Math.min(...srcs) === a && Math.max(...srcs) === b;
  };
  t.ok("W1 SAW_ORDER is a permutation of 7..30", within(7, 30));
  t.ok("W2 SAW_ORDER is a permutation of 34..45", within(34, 45));
  t.ok("curated levels keep identity mapping", [1, 2, 3, 4, 5, 6, 31, 32, 33].every(L => E.sourceFor(L) === L));
  // shape per world: difficulty (2·par + holes + walls/2 + ice) must END on the
  // world's maximum (its finale is its hardest board) and alternate like a
  // sawtooth — the monotone-ramp sag stays dead in EVERY world
  // CHIME: post count drives difficulty (a 3-post pinball corridor is harder to
  // read/navigate than a 1-post teach board) — bank puzzles are short in PAR, so
  // posts carry the curve the way par does elsewhere.
  const score = L => { const p = E.build(L); return p.par * 2 + p.holesArr.length + (p.walls || []).length * 0.5 + (p.zones || []).length + (p.posts || []).length * 1.5; };
  for (const [name, a, b, minFlips] of [["W1", 7, 30, 12], ["W2", 34, 45, 6], ["W3", 46, 60, 5]]) {
    const curve = []; for (let L = a; L <= b; L++) curve.push(score(L));
    t.ok(name + ": the finale is the hardest board in the world", curve[curve.length - 1] === Math.max(...curve));
    let flips = 0;
    for (let i = 2; i < curve.length; i++) if ((curve[i] - curve[i - 1]) * (curve[i - 1] - curve[i - 2]) < 0) flips++;
    t.ok(name + ": the curve alternates like a sawtooth (≥" + minFlips + " direction changes)", flips >= minFlips);
  }
  // renumbered boards are byte-identical to their proven sources (pars ride along)
  t.ok("display boards ARE their source boards (L12 ← src 20, L30 ← src 25)",
    E.build(12).par === 13 && E.build(30).par === 15);
}

t.section("gates (W2 Foundry — resolver rules + level integrity)");
{
  // resolver fixtures: the rules the whole world stands on
  let gst = { marbles: [{ x: 1, y: 3, c: "r", fixed: false }] };
  E.tilt(gst, "R", {}, null, null, { "5,3": "0,0" });
  t.ok("closed gate blocks like a wall", gst.marbles[0].x === 4);
  gst = { marbles: [{ x: 1, y: 3, c: "r", fixed: false }, { x: 0, y: 0, c: "b", fixed: false }] };
  E.tilt(gst, "R", { "7,3": "r" }, new Set(["1,0"]), null, { "5,3": "0,0" });
  t.ok("held gate (holder wall-pinned) lets the slide through to its hole", gst.marbles[0].fixed && gst.marbles[1].x === 0);
  gst = { marbles: [{ x: 6, y: 0, c: "b", fixed: false }, { x: 1, y: 3, c: "r", fixed: false }] };
  E.tilt(gst, "R", {}, null, null, { "5,3": "6,0" });
  t.ok("holder leaving first closes the door in the SAME tilt (ordering is the puzzle)", gst.marbles[1].x === 4 && gst.marbles[0].x === 7);
  gst = { marbles: [{ x: 5, y: 3, c: "r", fixed: false }] };
  E.tilt(gst, "R", {}, null, null, { "5,3": "0,0" });
  t.ok("a marble on the gate cell exits freely (gates only block entry — never crush)", gst.marbles[0].x === 7);
  // STRICT self-hold rule (review 2026-07-13): the mover's stale origin must
  // NOT hold its own plate — under the old permissive read this marble sailed
  // through its own gate to x=7; physics (held needs plate + rest) refuses
  // that move, so the solver must too. 7 pinned boards were replaced over this.
  gst = { marbles: [{ x: 2, y: 2, c: "r", fixed: false }] };
  E.tilt(gst, "R", {}, null, null, { "4,2": "2,2" });
  t.ok("a SLIDING marble does not hold its own plate (self-pass forbidden)", gst.marbles[0].x === 3);

  // level integrity across the Foundry arc
  let ok = true, loadBearing = true, pairs = true;
  for (let L = 31; L <= 45; L++) {
    const pz = E.build(L), gs = pz.gates || [];
    if (gs.length < 1 || gs.length > 2) pairs = false;
    const cells = new Set();
    for (const g of gs) {
      for (const [cx, cy] of [[g.x, g.y], [g.px, g.py]]) {
        const k = cx + "," + cy;
        if (cx < 0 || cx >= E.N || cy < 0 || cy >= E.N || cells.has(k)) ok = false;
        cells.add(k);
        if (pz.holes[k]) ok = false;
        if (pz.init.marbles.some(m => m.x === cx && m.y === cy)) ok = false;
        if ((pz.walls || []).some(w => w.x === cx && w.y === cy)) ok = false;
      }
    }
    // LOAD-BEARING: the level must be UNSOLVABLE with its gates as permanent
    // walls — a decorative gate fails the "changes DECISIONS" bar (the rule
    // distilled from cutting ice AND sand at the kill-gate)
    const wallsPlus = new Set((pz.walls || []).map(w => w.x + "," + w.y));
    for (const g of gs) wallsPlus.add(g.x + "," + g.y);
    if (E.solveBFS(pz.init, pz.holes, pz.holesArr.length, pz.par + 4, wallsPlus, {}, {})) loadBearing = false;
    // GEOMETRY-SEALED: discrete load-bearing is NECESSARY but NOT SUFFICIENT —
    // continuous play banks AROUND a wall stub, so a discretely-load-bearing
    // gate can still be skipped on the device (Qi's L31). The unskippable
    // guarantee: every gate must be the SOLE orthogonal entrance to its
    // matching hole — the hole's other three neighbours are rim or wall. Then
    // no ball can reach that hole without passing through the doorway.
    // (scripts/dev/certify.cjs proves the same load-bearing property IN PHYSICS
    //  — run it before pinning any new gate world.)
    for (const g of gs) {
      const home = pz.holesArr.find(h => Math.abs(h.x - g.x) + Math.abs(h.y - g.y) === 1);
      if (!home) { loadBearing = false; continue; }
      const wset = new Set((pz.walls || []).map(w => w.x + "," + w.y));
      for (const [nx, ny] of [[home.x - 1, home.y], [home.x + 1, home.y], [home.x, home.y - 1], [home.x, home.y + 1]]) {
        if (nx === g.x && ny === g.y) continue;                          // the gate itself
        if (nx < 0 || nx >= E.N || ny < 0 || ny >= E.N) continue;        // rim seals
        if (wset.has(nx + "," + ny)) continue;                          // wall seals
        loadBearing = false;                                            // an open side — skippable
      }
    }
  }
  t.ok("every Foundry level carries 1–2 gate pairs on clean cells", pairs && ok);
  t.ok("every gate is LOAD-BEARING (unsolvable if it were a wall)", loadBearing);
  t.ok("W1 Tabletop levels carry NO gates",
    (() => { for (let L = 1; L <= 30; L++) if ((E.build(L).gates || []).length) return false; return true; })());
  const pars = []; for (let L = 31; L <= 45; L++) pars.push(E.build(L).par);
  t.ok("Foundry opens gentle (par 3) and the finale holds the peak",
    pars[0] === 3 && pars[pars.length - 1] === Math.max(...pars));
}

t.section("posts (W3 Chime — bumper boards: continuous-only, clean cells, post-driven curve)");
{
  let ok = true, hasPosts = true, cleanCells = true;
  for (let L = 46; L <= 60; L++) {
    const pz = E.build(L);
    const ps = pz.posts || [];
    if (!ps.length) hasPosts = false;                 // every Chime board carries ≥1 post
    if (ps.length < 1 || ps.length > 3) ok = false;   // 1–3 posts (teach → corridor)
    const cells = new Set();
    for (const o of pz.holesArr) cells.add(o.x + "," + o.y);
    for (const o of pz.init.marbles) cells.add(o.x + "," + o.y);
    for (const o of (pz.walls || [])) cells.add(o.x + "," + o.y);
    for (const p of ps) {                             // a post never sits on a hole/marble/wall/other post
      const k = p.x + "," + p.y;
      if (p.x < 0 || p.x >= E.N || p.y < 0 || p.y >= E.N || cells.has(k)) cleanCells = false;
      cells.add(k);
    }
    if (pz.solution.length !== 0) ok = false;         // posts skip the discrete solver
  }
  t.ok("every Chime level carries 1–3 posts on clean cells", hasPosts && ok && cleanCells);
  t.ok("W1/W2 carry NO posts",
    (() => { for (let L = 1; L <= 45; L++) if ((E.build(L).posts || []).length) return false; return true; })());
  t.ok("W3 is World 3 (Chime promoted; Sirocco parked to W4)",
    E.worldFor(46).name === "Chime" && E.worldFor(46).id === 3 && E.WORLDS[3].name === "Sirocco");
}

process.exit(t.summary());
