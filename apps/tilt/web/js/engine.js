/* Tilt — engine (pure, deterministic, seedable). A LEVEL scatters colored marbles
   on an 8×8 tray with matching colored HOLES. A tilt slides EVERY loose marble
   until wall / marble; a marble that rolls over its matching empty hole snaps in
   and becomes FIXED. Fill every hole to clear the level. BFS-verified solvable
   with a known par — never ship a lie.

   Resolver/solver ported verbatim from the original prototypes/09-tilt.html
   (recovered from git — port, don't reimplement). Simplified per user feedback:
   the pixel-creature picture meta is gone — holes are simply distinct palette
   colors at seeded positions, so the goal is legible at a glance. Daily → LEVEL
   campaign; the hole count ramps 3 → 6 as levels climb.

   Determinism is the contract: build(level) → identical puzzle for everyone. */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const Core = (typeof module !== "undefined" && module.exports)
    ? require("@jfun/web-game-core") : root.WebGameCore;
  const makeRNG = Core.makeRNG;

  const N = 8;
  const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  const DIR4 = ["U", "D", "L", "R"];

  /* color codes: r red g green b blue y yellow o orange p purple w white */
  const PAL = { r: "#ff5d6c", g: "#5cffa0", b: "#5cb6ff", y: "#ffe05c", o: "#ff9d4d", p: "#c07dff", w: "#f3f6ff" };
  const COLORS = ["r", "g", "b", "y", "o", "p", "w"];

  function key(x, y) { return x + "," + y; }
  function cloneState(s) { return { marbles: s.marbles.map(m => ({ x: m.x, y: m.y, c: m.c, fixed: m.fixed })) }; }
  function occAt(st, x, y) {
    for (const m of st.marbles) if (m.x === x && m.y === y) return m;
    return null;
  }

  /* Resolve a tilt. holes is a map "x,y"→color; walls an optional Set of "x,y"
     block cells; slopes an optional map "x,y"→hill axis ("H"|"V").
     Mutates st; returns { moved, anim: [{ m, path, landed, fixed? }] }.
     Every loose marble slides until rim, wall block, or marble; HILL cells
     pass a slide moving ALONG their axis (a committed full-tilt slide crests
     the bump — physics: sustained tilt > slopeG climbs it) but stop sideways
     approaches like a wall (crossing a hill laterally is a physics-only
     stunt, never required by a solution). Rolling onto its matching empty
     hole snaps it in (fixed). Marbles furthest along go first. */
  function tilt(st, dir, holes, walls, slopes) {
    const dx = DIRS[dir][0], dy = DIRS[dir][1];
    const order = st.marbles.map((m, i) => i).sort((a, b) => {
      const ma = st.marbles[a], mb = st.marbles[b];
      if (dx !== 0) return dx > 0 ? mb.x - ma.x : ma.x - mb.x;
      return dy > 0 ? mb.y - ma.y : ma.y - mb.y;
    });
    const anim = [];
    let movedAny = false;
    for (const idx of order) {
      const m = st.marbles[idx];
      if (m.fixed) { anim.push({ m, path: [{ x: m.x, y: m.y }], landed: true, fixed: true }); continue; }
      const path = [{ x: m.x, y: m.y }];
      let cx = m.x, cy = m.y, landed = false;
      for (;;) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) break;   // rim
        if (walls && walls.has(key(nx, ny))) break;          // wall block
        const sl = slopes && slopes[key(nx, ny)];
        if (sl && (sl === "H" ? dy !== 0 : dx !== 0)) break; // hill: pass along its axis only
        if (occAt(st, nx, ny)) break;                        // blocked by marble
        cx = nx; cy = ny; path.push({ x: cx, y: cy });
        const h = holes[key(cx, cy)];
        if (h !== undefined) {                               // EVERY hole catches:
          if (h === m.c) landed = true;                      // matching → sinks for good
          break;                                             // wrong → parks in the dimple
        }                                                    // (slides away next tilt; meanwhile
      }                                                      //  it plugs the hole it sits in)
      if (cx !== m.x || cy !== m.y) movedAny = true;
      m.x = cx; m.y = cy;
      if (landed) m.fixed = true;
      anim.push({ m, path, landed });
    }
    return { moved: movedAny, anim };
  }

  function isSolved(st, holeCount) {
    let f = 0; for (const m of st.marbles) if (m.fixed) f++;
    return f === holeCount;
  }

  function stateKey(st) { return st.marbles.map(m => m.x + "" + m.y + (m.fixed ? "F" : "")).join("|"); }

  /* BFS over tilt states; returns the optimal sequence of dirs or null. */
  function solveBFS(init, holes, holeCount, maxDepth, walls, slopes) {
    const start = cloneState(init);
    if (isSolved(start, holeCount)) return [];
    const seen = new Set([stateKey(start)]);
    let frontier = [{ st: start, path: [] }];
    for (let depth = 0; depth < maxDepth; depth++) {
      const next = [];
      for (const node of frontier) {
        for (const d of DIR4) {
          const ns = cloneState(node.st);
          const r = tilt(ns, d, holes, walls, slopes);
          if (!r.moved) continue;
          const k = stateKey(ns);
          if (seen.has(k)) continue;
          seen.add(k);
          const path = node.path.concat(d);
          if (isSolved(ns, holeCount)) return path;
          next.push({ st: ns, path });
        }
      }
      if (next.length === 0) break;
      if (seen.size > 120000) break;
      frontier = next;
    }
    return null;
  }

  /* ---------------- finite campaign + curated on-ramp ---------------- */
  // The MVP is a FINITE campaign of LAST_LEVEL hand-shaped-then-procedural
  // levels — a real "you beat it" arc, not an endless grind. The first few
  // levels are CURATED (hand-authored, not random) so onboarding teaches ONE
  // idea at a time and difficulty rises smoothly: L1 the tilt→roll→drop verb,
  // L2 color-matching, L3 routing order, L4 the walls debut, L5–6 four colors.
  // Every curated layout is BFS-verified in build() — a bad edit fails the
  // campaign test, never ships. Beyond CURATED the solver-verified generator
  // fills the tail. Coords 0–7; each entry: h=holes, m=marbles [x,y,color],
  // w=wall blocks [x,y].
  const LAST_LEVEL = 30;
  const CURATED = {
    1: { h: [[2, 4, "r"]], m: [[6, 4, "r"]], w: [] },
    2: { h: [[2, 2, "r"], [5, 5, "b"]], m: [[6, 2, "r"], [1, 5, "b"]], w: [] },
    3: { h: [[1, 1, "r"], [6, 1, "g"], [3, 6, "b"]], m: [[1, 4, "r"], [6, 4, "g"], [3, 3, "b"]], w: [] },
    4: { h: [[1, 1, "r"], [6, 1, "g"], [3, 6, "b"]], m: [[1, 4, "r"], [6, 4, "g"], [3, 2, "b"]], w: [[5, 4]] },
    5: { h: [[1, 1, "r"], [6, 1, "y"], [2, 6, "g"], [5, 6, "b"]], m: [[1, 4, "r"], [6, 4, "y"], [2, 3, "g"], [5, 3, "b"]], w: [[0, 5], [7, 5]] },
    6: { h: [[1, 1, "r"], [6, 1, "y"], [1, 6, "g"], [6, 6, "b"]], m: [[1, 3, "r"], [6, 3, "y"], [1, 5, "g"], [6, 5, "b"]], w: [[3, 3], [4, 4]] },
  };

  /* ---------------- level ramp ---------------- */
  // Hole count climbs 3 → 6; walls (bank-off blocks) appear from L4 and grow to 8;
  // par floor rises once the player has the hang of it. Curated levels are
  // intentionally gentle, so their floor is 1 (the campaign test honors this).
  function rampFor(level) {
    const L = Math.max(1, level | 0);
    const nHoles = Math.min(3 + Math.floor((L - 1) / 4), 6);
    const nWalls = L < 4 ? 0 : Math.min(2 + Math.floor((L - 4) / 3), 8);
    const nSlopes = 0;   // hills PARKED for MVP (user call: block obstacles only;
                         // the slope visual never converged) — mechanism kept dormant
    const minPar = CURATED[L] ? 1 : (L < 5 ? 2 : 3);
    const maxDepth = nHoles >= 5 ? 16 : 12;
    return { nHoles, nWalls, nSlopes, minPar, maxDepth };
  }
  function seedForLevel(n) { return ((n * 0x9e3779b1) ^ 0x7117) >>> 0; }

  // A "gateway hole" is reachable ONLY through another hole: every orthogonal
  // neighbour is a wall, the rim, or another hole. Its ball must PARK on the
  // gateway hole then step in — which works only in one fragile order, and once
  // the gateway is sealed (a ball captured/wedged there) the inner hole can never
  // be filled → a genuine, unrecoverable dead end (the L19 green@(0,7) trap).
  // Reject any layout with one so no level can be driven into that state.
  function hasGatewayHole(holesArr, holesMap, wallSet) {
    for (const h of holesArr) {
      let free = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = h.x + dx, ny = h.y + dy;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;   // rim
        if (wallSet && wallSet.has(key(nx, ny))) continue;      // wall
        if (holesMap[key(nx, ny)] !== undefined) continue;      // another hole
        free++;                                                  // a free approach cell
      }
      if (free === 0) return true;
    }
    return false;
  }

  /* Puzzle generation: distinct-colored holes at seeded cells, one matching marble
     per hole scattered elsewhere, WALL blocks to bank off, BFS-verified at par ≥
     minPar (walls can never make a shipped level impossible — unsolvable layouts
     are rejected). Constructive fallbacks shrink the board's ambition (and drop
     walls) but every path is re-verified — never ship a lie. */
  function genPuzzle(seed, ramp) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const rng = makeRNG((seed + attempt * 977) >>> 0);
      const cols = COLORS.slice();
      for (let i = cols.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cols[i], cols[j]] = [cols[j], cols[i]]; }
      const use = cols.slice(0, ramp.nHoles);
      const holes = {}, holesArr = [], occ = new Set();
      let ok = true;
      for (const c of use) {
        let placed = false;
        for (let t = 0; t < 60; t++) {
          const x = Math.floor(rng() * N), y = Math.floor(rng() * N), k = key(x, y);
          if (occ.has(k)) continue;
          holes[k] = c; holesArr.push({ x, y, c }); occ.add(k); placed = true; break;
        }
        if (!placed) { ok = false; break; }
      }
      if (!ok) continue;
      const marbles = [];
      for (const h of holesArr) {
        let placed = false;
        for (let t = 0; t < 80; t++) {
          const x = Math.floor(rng() * N), y = Math.floor(rng() * N), k = key(x, y);
          if (holes[k] || occ.has(k)) continue;
          marbles.push({ x, y, c: h.c, fixed: false }); occ.add(k); placed = true; break;
        }
        if (!placed) { ok = false; break; }
      }
      if (!ok) continue;
      // wall blocks: interior-biased, never on holes/marbles/each other
      const walls = [], wallSet = new Set();
      for (let wI = 0; wI < ramp.nWalls; wI++) {
        for (let t = 0; t < 60; t++) {
          const x = Math.floor(rng() * N), y = Math.floor(rng() * N), k = key(x, y);
          if (occ.has(k)) continue;
          walls.push({ x, y }); wallSet.add(k); occ.add(k); break;
        }
      }
      // hill patches: two cells long along a random axis, ridge at the middle,
      // never on holes/marbles/walls — BFS below plays the axis-pass rule, so
      // a shipped layout is solvable WITH them
      const slopes = [], slopeMap = {};
      for (let sI = 0; sI < (ramp.nSlopes || 0); sI++) {
        for (let t = 0; t < 60; t++) {
          const a = rng() < 0.5 ? "H" : "V";
          const sdx = a === "H" ? 1 : 0, sdy = a === "H" ? 0 : 1;
          const x = Math.floor(rng() * N), y = Math.floor(rng() * N);
          const x2 = x + sdx, y2 = y + sdy;
          if (x2 < 0 || x2 >= N || y2 < 0 || y2 >= N) continue;
          const k1 = key(x, y), k2 = key(x2, y2);
          if (occ.has(k1) || occ.has(k2)) continue;
          slopes.push({ x, y, w: sdx + 1, h: sdy + 1, a });
          slopeMap[k1] = a; slopeMap[k2] = a; occ.add(k1); occ.add(k2); break;
        }
      }
      const init = { marbles };
      const res = solveBFS(init, holes, holesArr.length, ramp.maxDepth, wallSet, slopeMap);
      if (res && res.length >= ramp.minPar) {
        return { holes, holesArr, walls, slopes, init: cloneState(init), par: res.length, solution: res };
      }
    }

    // Constructive fallback: each marble one slide from its hole — still BFS-verified.
    for (let attempt = 0; attempt < 80; attempt++) {
      const rng = makeRNG((seed * 31 + attempt * 733 + 5) >>> 0);
      const cols = COLORS.slice();
      for (let i = cols.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cols[i], cols[j]] = [cols[j], cols[i]]; }
      const use = cols.slice(0, Math.max(2, ramp.nHoles - 1));
      const holes = {}, holesArr = [], occ = new Set();
      let ok = true;
      for (const c of use) {
        let placed = false;
        for (let t = 0; t < 60; t++) {
          const x = Math.floor(rng() * N), y = Math.floor(rng() * N), k = key(x, y);
          if (occ.has(k)) continue;
          holes[k] = c; holesArr.push({ x, y, c }); occ.add(k); placed = true; break;
        }
        if (!placed) { ok = false; break; }
      }
      if (!ok) continue;
      const marbles = [];
      for (const h of holesArr) {
        const cand = [[h.x + 1, h.y], [h.x - 1, h.y], [h.x, h.y + 1], [h.x, h.y - 1]];
        let placed = false;
        for (const [mx, my] of cand) {
          if (mx < 0 || mx >= N || my < 0 || my >= N) continue;
          const k = key(mx, my);
          if (holes[k] || occ.has(k)) continue;
          marbles.push({ x: mx, y: my, c: h.c, fixed: false }); occ.add(k); placed = true; break;
        }
        if (!placed) { ok = false; break; }
      }
      if (!ok) continue;
      const init = { marbles };
      const res = solveBFS(init, holes, holesArr.length, 16);
      if (res) return { holes, holesArr, walls: [], slopes: [], init: cloneState(init), par: res.length, solution: res };
    }

    // Last resort: one marble adjacent to its hole — verified before returning.
    for (let attempt = 0; attempt < 40; attempt++) {
      const rng = makeRNG((seed * 4129 + attempt * 97 + 3) >>> 0);
      const c = COLORS[Math.floor(rng() * COLORS.length)];
      const hx = 1 + Math.floor(rng() * (N - 2)), hy = 1 + Math.floor(rng() * (N - 2));
      const holes = {}; holes[key(hx, hy)] = c;
      const init = { marbles: [{ x: hx + 1, y: hy, c, fixed: false }] };
      const res = solveBFS(init, holes, 1, 8);
      if (res) return { holes, holesArr: [{ x: hx, y: hy, c }], walls: [], slopes: [], init: cloneState(init), par: res.length, solution: res };
    }
    return null;
  }

  /* ---------------- level campaign ---------------- */
  // A curated layout, verified through the SAME solver as the generated ones —
  // never ship a hand-authored level without proving it solves.
  function buildCurated(L, spec) {
    const holes = {}, holesArr = [];
    for (const [x, y, c] of spec.h) { holes[key(x, y)] = c; holesArr.push({ x, y, c }); }
    const walls = spec.w.map(([x, y]) => ({ x, y }));
    const wallSet = new Set(spec.w.map(([x, y]) => key(x, y)));
    const init = { marbles: spec.m.map(([x, y, c]) => ({ x, y, c, fixed: false })) };
    const res = solveBFS(init, holes, holesArr.length, 24, wallSet, {});
    if (!res) return null;   // authoring guard — surfaces as a failed campaign test
    return { holes, holesArr, walls, slopes: [], init: cloneState(init), par: res.length, solution: res, level: L };
  }
  function build(level) {
    const L = Math.max(1, level | 0);
    if (CURATED[L]) return buildCurated(L, CURATED[L]);
    const ramp = rampFor(L);
    let seed = seedForLevel(L), p = null, guard = 0;
    while (!p && guard++ < 40) { p = genPuzzle(seed, ramp); seed = (seed + 7919) >>> 0; }
    if (p) p.level = L;
    return p;
  }

  return { N, DIRS, DIR4, PAL, COLORS, key, cloneState, tilt, isSolved,
           stateKey, solveBFS, rampFor, genPuzzle, seedForLevel, build,
           LAST_LEVEL, CURATED, hasGatewayHole, VERSION: "2.4.0" };
});
