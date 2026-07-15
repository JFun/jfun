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
     block cells; slopes an optional map "x,y"→hill axis ("H"|"V");
     gates an optional map "x,y"→"px,py" (plate cell key) — W2 FOUNDRY:
     a gate cell is a WALL while its plate is EMPTY; any RESTING marble on the
     plate (color-agnostic, but never the mover itself mid-slide) holds it
     open; a marble occupying the gate cell
     itself also holds it open (never crushes). Occupancy is evaluated LIVE
     during resolution (furthest-first order), so a plate-holder that slides
     away in the same tilt closes the door for marbles behind it — that
     ordering IS the sequencing puzzle, deterministic and BFS-searchable.
     Mutates st; returns { moved, anim: [{ m, path, landed, fixed? }] }.
     Every loose marble slides until rim, wall block, closed gate, or marble;
     HILL cells pass a slide moving ALONG their axis but stop sideways
     approaches. Rolling onto its matching empty hole snaps it in (fixed).
     Marbles furthest along go first. */
  function tilt(st, dir, holes, walls, slopes, gates) {
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
        const gp = gates && gates[key(nx, ny)];
        if (gp !== undefined) {                              // gate: wall while closed
          // STRICT hold rule (review + continuous replay, 2026-07-13). Two
          // discrete-only fictions are banned because device physics refuses
          // them: (1) SELF-HOLD — the mover's stale origin counting as plate
          // occupancy ("a RESTING marble holds the door", a rolling one
          // doesn't); (2) the UNPINNED-HOLDER RACE — discrete order lets a
          // runner cross "before" a holder that the same tilt is pulling off
          // the plate, but on device both accelerate together and the door
          // slams in ~60ms (holder passes plateRest after ~0.08 cells). So a
          // plate holds ONLY while its holder is a different marble that is
          // PINNED against this tilt: the cell behind it (along d) is rim,
          // wall, or a seated marble. Gate-CELL occupancy still counts as-is
          // (anti-crush; exiting the doorway is always legal). Boards that
          // leaned on either fiction were replaced when this landed.
          const holder = occAt(st, +gp.split(",")[0], +gp.split(",")[1]);
          let plateHeld = false;
          if (holder && holder !== m) {
            const bx = holder.x + dx, by = holder.y + dy;
            const behind = occAt(st, bx, by);
            plateHeld = bx < 0 || bx >= N || by < 0 || by >= N ||
              (walls && walls.has(key(bx, by))) ||
              (behind && behind.fixed);
          }
          const held = plateHeld || occAt(st, nx, ny);
          if (!held) break;                                  // closed — plate + gate cell empty
        }
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
  function solveBFS(init, holes, holeCount, maxDepth, walls, slopes, gates) {
    const start = cloneState(init);
    if (isSolved(start, holeCount)) return [];
    const seen = new Set([stateKey(start)]);
    let frontier = [{ st: start, path: [] }];
    for (let depth = 0; depth < maxDepth; depth++) {
      const next = [];
      for (const node of frontier) {
        for (const d of DIR4) {
          const ns = cloneState(node.st);
          const r = tilt(ns, d, holes, walls, slopes, gates);
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
  // W1 Tabletop = 1–30 (shipped) · W2 Dune = 31–45 (sand pads). Dune's curated
  // on-ramp (31–33) teaches the sand verb one idea at a time: the dead stop →
  // sand as brakes → braked lines composed. Entries may carry
  // z: [[x,y,w,h]] sand pads — TRANSPARENT to the discrete resolver (a slide
  // commits to the same stop with or without ice), so BFS verification is
  // unchanged; sand lives in the continuous feel (speed dies on it).
  const LAST_LEVEL = 60;
  const CURATED = {
    1: { h: [[2, 4, "r"]], m: [[6, 4, "r"]], w: [] },
    2: { h: [[2, 2, "r"], [5, 5, "b"]], m: [[6, 2, "r"], [1, 5, "b"]], w: [] },
    3: { h: [[1, 1, "r"], [6, 1, "g"], [3, 6, "b"]], m: [[1, 4, "r"], [6, 4, "g"], [3, 3, "b"]], w: [] },
    4: { h: [[1, 1, "r"], [6, 1, "g"], [3, 6, "b"]], m: [[1, 4, "r"], [6, 4, "g"], [3, 2, "b"]], w: [[5, 4]] },
    5: { h: [[1, 1, "r"], [6, 1, "y"], [2, 6, "g"], [5, 6, "b"]], m: [[1, 4, "r"], [6, 4, "y"], [2, 3, "g"], [5, 3, "b"]], w: [[0, 5], [7, 5]] },
    6: { h: [[1, 1, "r"], [6, 1, "y"], [1, 6, "g"], [6, 6, "b"]], m: [[1, 3, "r"], [6, 3, "y"], [1, 5, "g"], [6, 5, "b"]], w: [[3, 3], [4, 4]] },
// — W2 FOUNDRY (plates & gates) — the FULL world is hand-pinned: gate BFS
    // is too slow for on-device generation, so every board came from the
    // offline gate-search lab (scratchpad/gate-search.cjs pattern) and is
    // BFS-verified at build with its gate LOAD-BEARING (unsolvable if the gate
    // were a wall — the "changes DECISIONS" bar that ice and sand failed).
    // Entries carry g: [[gateX, gateY, plateX, plateY], ...] (≤2 pairs).
    // Arc: 31–33 teach · 34–38 one gate in a wall run · 39–42 two pairs,
    // order matters · 43–45 keeper finales (par curve 3→11, finale = max).
    31: { h: [[6, 7, "p"], [0, 4, "g"]], m: [[2, 7, "p"], [4, 6, "g"]], w: [[7, 7], [6, 6]], g: [[5, 7, 5, 6]] },
    32: { h: [[7, 0, "o"], [5, 2, "p"]], m: [[5, 5, "o"], [1, 1, "p"]], w: [[6, 0]], g: [[7, 1, 5, 0]] },
    33: { h: [[0, 0, "b"], [1, 2, "r"]], m: [[6, 0, "b"], [4, 6, "r"]], w: [[0, 1]], g: [[1, 0, 0, 2]] },
    34: { h: [[0, 7, "y"], [2, 2, "b"]], m: [[1, 2, "y"], [7, 5, "b"]], w: [[1, 7], [5, 3]], g: [[0, 6, 2, 7]] },
    35: { h: [[0, 0, "r"], [2, 3, "b"], [3, 5, "y"]], m: [[3, 7, "r"], [5, 6, "b"], [1, 7, "y"]], w: [[1, 0], [5, 1], [7, 7], [4, 4], [2, 6]], g: [[0, 1, 0, 5]] },
    36: { h: [[7, 1, "y"], [7, 4, "p"]], m: [[7, 6, "y"], [0, 7, "p"]], w: [[6, 1], [7, 0], [2, 3]], g: [[7, 2, 0, 0]] },
    37: { h: [[5, 0, "p"], [0, 2, "b"], [2, 6, "g"], [2, 7, "r"]], m: [[4, 5, "p"], [3, 6, "b"], [7, 6, "g"], [2, 2, "r"]], w: [[6, 0], [5, 1], [1, 2], [0, 1], [7, 1], [7, 0], [3, 3], [1, 7]], g: [[4, 0, 5, 2], [0, 3, 2, 0]] },
    38: { h: [[0, 3, "p"], [4, 0, "r"], [7, 7, "y"]], m: [[6, 4, "p"], [3, 1, "r"], [3, 6, "y"]], w: [[1, 3], [0, 2], [1, 7], [2, 5]], g: [[0, 4, 0, 1]] },
    39: { h: [[7, 0, "y"], [0, 5, "r"], [2, 4, "b"], [0, 2, "o"]], m: [[6, 7, "y"], [3, 2, "r"], [1, 0, "b"], [4, 2, "o"]], w: [[6, 0], [1, 5], [0, 6], [6, 4], [1, 6], [3, 3], [5, 2]], g: [[7, 1, 5, 0], [0, 4, 0, 7]] },
    40: { h: [[7, 0, "p"], [5, 4, "r"], [0, 7, "b"]], m: [[3, 0, "p"], [0, 2, "r"], [6, 4, "b"]], w: [[7, 1], [6, 1], [1, 5]], g: [[6, 0, 7, 2]] },
    41: { h: [[0, 3, "r"], [4, 1, "y"], [0, 7, "o"]], m: [[4, 2, "r"], [3, 1, "y"], [1, 6, "o"]], w: [[1, 3], [0, 2], [2, 3], [7, 6], [5, 4], [7, 3]], g: [[0, 4, 0, 0]] },
    42: { h: [[5, 7, "p"], [4, 1, "r"], [2, 0, "b"]], m: [[5, 4, "p"], [4, 6, "r"], [2, 5, "b"]], w: [[6, 7], [5, 6], [3, 6], [1, 3], [6, 5]], g: [[4, 7, 5, 5]] },
    43: { h: [[7, 2, "r"], [1, 7, "y"], [5, 4, "p"]], m: [[0, 3, "r"], [7, 5, "y"], [1, 4, "p"]], w: [[6, 2], [7, 3], [5, 6], [0, 2], [0, 6], [7, 4]], g: [[7, 1, 6, 7]] },
    44: { h: [[3, 0, "r"], [5, 3, "p"], [1, 5, "y"]], m: [[5, 4, "r"], [1, 0, "p"], [0, 5, "y"]], w: [[2, 0], [3, 1], [2, 7], [6, 4], [7, 6], [4, 5]], g: [[4, 0, 0, 0]] },
    45: { h: [[0, 1, "b"], [0, 4, "y"], [4, 7, "p"]], m: [[4, 2, "b"], [6, 4, "y"], [4, 0, "p"]], w: [[0, 0], [0, 2], [2, 4], [6, 0], [0, 5], [5, 3]], g: [[1, 1, 1, 0]] },
    // W3 CHIME (46-60) — bumper posts. CONTINUOUS-only element: a pinball bounce
    // can't be discretely solved, so each board carries its CERTIFIED par (par 2:
    // aim → bank → sink) and skips solveBFS. Every board is bank-required (the
    // post shortens/enables the solve — scripts/dev/certify.cjs) and difficulty
    // rises by POST COUNT (1 → 3, pinball corridors); the finale is the busiest.
    46: { h: [[0, 7, "r"]], m: [[6, 1, "r"]], w: [[0, 6], [3, 7]], p: [[6, 5]], par: 2 },
    47: { h: [[0, 3, "r"]], m: [[6, 0, "r"]], w: [[1, 3], [0, 4], [4, 7], [0, 1]], p: [[6, 3]], par: 2 },
    48: { h: [[6, 4, "r"]], m: [[1, 0, "r"]], w: [[4, 4], [2, 0]], p: [[4, 0], [0, 5]], par: 2 },
    49: { h: [[5, 5, "r"]], m: [[0, 0, "r"]], w: [[6, 5], [7, 0]], p: [[4, 0], [5, 1], [1, 5]], par: 2 },
    50: { h: [[5, 3, "r"]], m: [[0, 7, "r"]], w: [[0, 3], [4, 7]], p: [[5, 7], [0, 5]], par: 2 },
    51: { h: [[2, 5, "r"]], m: [[6, 1, "r"]], w: [[2, 4], [5, 5]], p: [[6, 3], [1, 3], [2, 2]], par: 2 },
    52: { h: [[4, 6, "r"]], m: [[0, 1, "r"]], w: [[4, 5], [2, 5], [3, 4]], p: [[2, 1], [5, 7]], par: 2 },
    53: { h: [[5, 7, "r"]], m: [[1, 1, "r"]], w: [[4, 7], [5, 1], [4, 2]], p: [[4, 1], [3, 4], [5, 4]], par: 2 },
    54: { h: [[4, 5, "r"]], m: [[1, 0, "r"]], w: [[4, 6], [2, 0]], p: [[1, 3], [1, 2]], par: 2 },
    55: { h: [[7, 0, "r"]], m: [[1, 6, "r"]], w: [[6, 0], [7, 5]], p: [[4, 6], [1, 5], [3, 3]], par: 2 },
    56: { h: [[4, 0, "r"]], m: [[1, 6, "r"]], w: [[5, 0], [3, 0], [4, 3]], p: [[1, 2], [4, 2]], par: 2 },
    57: { h: [[0, 5, "r"]], m: [[6, 0, "r"]], w: [[0, 6], [6, 7], [4, 0]], p: [[6, 5], [6, 6], [5, 2]], par: 2 },
    58: { h: [[3, 0, "r"]], m: [[0, 7, "r"]], w: [[3, 1], [4, 7], [0, 1]], p: [[5, 7], [2, 3]], par: 2 },
    59: { h: [[6, 4, "r"]], m: [[1, 1, "r"]], w: [[6, 3], [1, 0], [2, 1]], p: [[1, 4], [5, 5], [2, 3]], par: 2 },
    60: { h: [[1, 6, "r"]], m: [[7, 1, "r"]], w: [[1, 7], [1, 4], [7, 3], [2, 3]], p: [[7, 5], [3, 1], [5, 2]], par: 2 },
  };

  /* ---------------- level ramp ---------------- */
  // Hole count climbs 3 → 6; walls (bank-off blocks) appear from L4 and grow to 8;
  // par floor rises once the player has the hang of it. Curated levels are
  // intentionally gentle, so their floor is 1 (the campaign test honors this).
  function rampFor(level) {
    const L = Math.max(1, level | 0);
    if (L >= 31) {
      // W2 FOUNDRY: every level is hand-pinned in CURATED (gate-aware BFS is too
      // slow for on-device generation; boards come from the offline gate-search
      // lab, each verified load-bearing) — this branch is completeness only.
      return { nHoles: 4, nWalls: 4, nSlopes: 0, nZones: 0, minPar: 1, maxDepth: 18 };
    }
    const nHoles = Math.min(3 + Math.floor((L - 1) / 4), 6);
    const nWalls = L < 4 ? 0 : Math.min(2 + Math.floor((L - 4) / 3), 8);
    const nSlopes = 0;   // hills PARKED for MVP (user call: block obstacles only;
                         // the slope visual never converged) — mechanism kept dormant
    const minPar = CURATED[L] ? 1 : (L < 5 ? 2 : 3);
    const maxDepth = nHoles >= 5 ? 16 : 12;
    return { nHoles, nWalls, nSlopes, nZones: 0, minPar, maxDepth };
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
      // SAND pads (W2 Dune) — kind assigned by the world at build time.
      // Fairness rules: never on/adjacent-to a hole (the final approach to every
      // cup happens on FELT, so capture speed is always controllable), never on
      // a start marble or wall. Ice is TRANSPARENT to the BFS below — the
      // discrete slide already commits to the same stop — so zone placement can
      // never break solvability; it only shapes the continuous feel.
      const zones = [];
      if (ramp.nZones) {
        const holeMargin = new Set();
        for (const h of holesArr) {
          holeMargin.add(key(h.x, h.y));
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) holeMargin.add(key(h.x + dx, h.y + dy));
        }
        // the FIRST zone is a wide PAD (3–4 × 2–3 cells — a real surface you
        // live on for a beat; thin strips alone were crossed too fast to feel,
        // Qi's "can't tell anything different" test), the rest are lane strips.
        const zoneOcc = new Set();
        for (let zI = 0; zI < ramp.nZones; zI++) {
          for (let t = 0; t < 120; t++) {
            let zw, zh;
            if (zI === 0) { zw = 3 + Math.floor(rng() * 2); zh = 2 + Math.floor(rng() * 2); }
            else {
              const horiz = rng() < 0.5;
              const len = 2 + Math.floor(rng() * 3);         // 2–4 cells
              zw = horiz ? len : 1; zh = horiz ? 1 : len;
            }
            const x = Math.floor(rng() * (N - zw + 1)), y = Math.floor(rng() * (N - zh + 1));
            let ok2 = true;
            for (let ix = 0; ix < zw && ok2; ix++) for (let iy = 0; iy < zh; iy++) {
              const k = key(x + ix, y + iy);
              if (zoneOcc.has(k) || holeMargin.has(k) || occ.has(k)) { ok2 = false; break; }
            }
            if (!ok2) continue;
            for (let ix = 0; ix < zw; ix++) for (let iy = 0; iy < zh; iy++) zoneOcc.add(key(x + ix, y + iy));
            zones.push({ x, y, w: zw, h: zh });
            break;
          }
        }
        if (!zones.length || (zones[0].w < 2 || zones[0].h < 2)) continue;   // a Dune board without its wide pad isn't Dune — reroll
      }
      const init = { marbles };
      const res = solveBFS(init, holes, holesArr.length, ramp.maxDepth, wallSet, slopeMap);
      if (res && res.length >= ramp.minPar) {
        return { holes, holesArr, walls, slopes, zones, init: cloneState(init), par: res.length, solution: res };
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
      if (res) return { holes, holesArr, walls: [], slopes: [], zones: [], init: cloneState(init), par: res.length, solution: res };
    }

    // Last resort: one marble adjacent to its hole — verified before returning.
    for (let attempt = 0; attempt < 40; attempt++) {
      const rng = makeRNG((seed * 4129 + attempt * 97 + 3) >>> 0);
      const c = COLORS[Math.floor(rng() * COLORS.length)];
      const hx = 1 + Math.floor(rng() * (N - 2)), hy = 1 + Math.floor(rng() * (N - 2));
      const holes = {}; holes[key(hx, hy)] = c;
      const init = { marbles: [{ x: hx + 1, y: hy, c, fixed: false }] };
      const res = solveBFS(init, holes, 1, 8);
      if (res) return { holes, holesArr: [{ x: hx, y: hy, c }], walls: [], slopes: [], zones: [], init: cloneState(init), par: res.length, solution: res };
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
    const zones = (spec.z || []).map(([x, y, w, h]) => ({ x, y, w, h }));
    const gates = (spec.g || []).map(([x, y, px, py]) => ({ x, y, px, py }));
    const posts = (spec.p || []).map(([x, y]) => ({ x, y }));
    const gmap = {};
    for (const g of gates) gmap[key(g.x, g.y)] = key(g.px, g.py);
    const init = { marbles: spec.m.map(([x, y, c]) => ({ x, y, c, fixed: false })) };
    // CHIME bumper posts are a CONTINUOUS-only element — a pinball bounce can't
    // be modelled by the discrete BFS, so a posts level carries its par
    // PRE-CERTIFIED (scripts/dev/certify.cjs continuous gesture search) and skips
    // the solver. Every posts board is certified solvable + post-load-bearing.
    if (posts.length) {
      return { holes, holesArr, walls, slopes: [], zones, gates, posts, init: cloneState(init), par: spec.par, solution: [], level: L };
    }
    const res = solveBFS(init, holes, holesArr.length, 24, wallSet, {}, gmap);
    if (!res) return null;   // authoring guard — surfaces as a failed campaign test
    return { holes, holesArr, walls, slopes: [], zones, gates, posts, init: cloneState(init), par: res.length, solution: res, level: L };
  }
  /* ---------------- sawtooth ordering (2026-07-12, the Cut lesson applied) ----------------
     The old monotone ramp SAGGED: difficulty (2·par + holes + walls/2) peaked at
     source L25 (score 40) then DECLINED into the finale (L28–30 ≈ 30) — the
     campaign ended on a shrug. Display levels 7–30 are now a PERMUTATION of the
     same 24 proven boards (identical puzzles, renumbered — pars/solutions ride
     along) laid out as an easy↔hard sawtooth: valleys rise 16.5 → ~30, teeth at
     ~33–36, the three peaks (35.5 / 36 / 40) spread apart, and the TRUE hardest
     board is the finale. Curated 1–6 stay fixed (the teaching arc). Old saves'
     bests/medals don't compare across the renumbering — game.js migrates
     (sawV1). Keyed by SOURCE for generation so every board is byte-identical to
     its already-BFS-verified original. */
  // Each world saw-tooths WITHIN its own range (display↔source never crosses a
  // world boundary — chapter identity is sacred). W1: 7–30 over the curated 6.
  // W2 Rime: 34–45 over the curated 31–33 (raw generation peaked at src 42/43
  // and sagged into 45 — same disease, same cure; finale = the hardest board).
  const SAW_ORDER = {
    7: 9, 8: 14, 9: 10, 10: 17, 11: 7, 12: 20, 13: 11, 14: 18, 15: 12, 16: 22,
    17: 29, 18: 19, 19: 8, 20: 24, 21: 16, 22: 13, 23: 28, 24: 26, 25: 15,
    26: 21, 27: 30, 28: 23, 29: 27, 30: 25,
    // W2 Foundry (31–45) is hand-ordered in CURATED — identity mapping; its
    // authored par curve (3→11, teeth included, finale = max) IS the sawtooth.
  };
  function sourceFor(level) { const L = Math.max(1, level | 0); return SAW_ORDER[L] || L; }
  function build(level) {
    const L = Math.max(1, level | 0);
    if (CURATED[L]) return buildCurated(L, CURATED[L]);
    const src = sourceFor(L);
    const ramp = rampFor(src);
    let seed = seedForLevel(src), p = null, guard = 0;
    while (!p && guard++ < 40) { p = genPuzzle(seed, ramp); seed = (seed + 7919) >>> 0; }
    if (p) p.level = L;
    return p;
  }

  /* ---------------- worlds (depth plan — LEVELS_SPEC §6 / docs/longevity/tilt-depth.md) ----------------
     Planet = world = a 15–16-level chapter carrying exactly ONE new visible
     element + an honest ≤2-param retune + a palette identity. This table is the
     single source of truth for chapter ranges, palettes (c1/c2/ring), element
     lines, and per-world physics param OVERRIDES (merged over defaultParams by
     createWorld). W1 ships; W2+ are locked UI until their element lands. The
     param invariants (lodge-escape ≤ ~6.5 m/s², no tunneling, accel 0.7–1.4×)
     are PINNED in physics-tests — a world that silently violates them fails CI,
     not review. Forbidden forever: gravity rotation/inversion, timers, touch verbs. */
  // RIME (ice) was CUT at the kill-gate (2026-07-12, Qi device test: grip-ice
  // still didn't read) — the ladder degrades gracefully to 8 worlds; the ice
  // physics machinery stays dormant + tested (the parked-slopes precedent).
  const WORLDS = [
    { id: 1, name: "Tabletop",   from: 1,   to: 30,  c1: "#2c3373", c2: "#1f2554", ring: "#ffc63e", element: "Blocks & holes",  line: "Every marble home — the whole verb.", params: {} },
    { id: 2, name: "Foundry",    from: 31,  to: 45,  c1: "#642e18", c2: "#37170a", ring: "#ff8a2a", element: "Plates & gates",  line: "A resting marble holds the door.",    params: {} },
    { id: 3, name: "Chime",      from: 46,  to: 60,  c1: "#5a2a4d", c2: "#301529", ring: "#ff8fb0", element: "Bumper posts",    line: "Bank a rebound to reach what tilt can't.", params: {} },
    { id: 4, name: "Sirocco",    from: 61,  to: 76,  c1: "#1d5747", c2: "#0f2f26", ring: "#5fe0b0", element: "Wind lanes",      line: "Fight the current with your tilt.",   params: {} },
    { id: 5, name: "Highlands",  from: 77,  to: 92,  c1: "#2f5426", c2: "#172c12", ring: "#a3e05c", element: "Bowls & domes",   line: "Terrain bends every route.",          params: {} },
    { id: 6, name: "Undercity",  from: 93,  to: 108, c1: "#3a2a6b", c2: "#1c1340", ring: "#b06bff", element: "Wells & grates",  line: "Drop a floor. Land where you planned.", params: {} },
    { id: 7, name: "Confluence", from: 109, to: 140, c1: "#243a63", c2: "#101c33", ring: "#eef1ff", element: "The grand remix", line: "Everything you know, at once.",       params: {} },
  ];
  function worldFor(level) {
    const L = Math.max(1, level | 0);
    for (const w of WORLDS) if (L >= w.from && L <= w.to) return w;
    return WORLDS[WORLDS.length - 1];
  }

  /* ---------------- hidden gems (depth plan Phase 0 — the collection lap) ----------------
     ~⅓ of levels hide a gem on an empty interior cell; rolling over it collects
     it (game layer). Placement is DETERMINISTIC (same level → same gem for
     everyone, node-tested) and never sits on a hole / starting marble / wall.
     Takes the BUILT puzzle so it never re-runs the BFS generator. */
  const GEM_MOD = 3, GEM_REM = 2;   // levels L ≡ 2 (mod 3) carry a gem → 10 of the 30
  function hasGem(level) { const L = Math.max(1, level | 0); return L % GEM_MOD === GEM_REM; }
  function gemFor(level, p) {
    const L = Math.max(1, level | 0);
    if (!hasGem(L) || !p) return null;
    const occ = new Set(), wallSet = new Set();
    for (const h of p.holesArr) occ.add(key(h.x, h.y));
    for (const m of p.init.marbles) occ.add(key(m.x, m.y));
    for (const w of (p.walls || [])) { occ.add(key(w.x, w.y)); wallSet.add(key(w.x, w.y)); }
    // gates: no gem on the door or the plate; treat the door as a wall for
    // reachability (conservative — it may be closed when the player arrives)
    for (const g of (p.gates || [])) { occ.add(key(g.x, g.y)); wallSet.add(key(g.x, g.y)); occ.add(key(g.px, g.py)); }
    for (const pp of (p.posts || [])) { occ.add(key(pp.x, pp.y)); wallSet.add(key(pp.x, pp.y)); }   // CHIME: no gem on/behind a post
    // a gem must be ROLLABLE-OVER: flood-fill from the marble starts over
    // non-wall cells (holes are passable — a rolling ball crosses them) so a
    // wall pocket can never hide an unreachable gem
    const reach = new Set();
    const q = p.init.marbles.map(m => [m.x, m.y]);
    for (const [mx, my] of q) reach.add(key(mx, my));
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + "," + ny;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N || reach.has(k) || wallSet.has(k)) continue;
        reach.add(k); q.push([nx, ny]);
      }
    }
    const rng = makeRNG((seedForLevel(L) ^ 0x6e37) >>> 0);
    const c = COLORS[Math.floor(rng() * COLORS.length)];
    for (let t = 0; t < 400; t++) {
      const x = 1 + Math.floor(rng() * (N - 2)), y = 1 + Math.floor(rng() * (N - 2));
      const k = key(x, y);
      if (occ.has(k) || !reach.has(k)) continue;
      return { x, y, c };
    }
    return null;   // pathological board with no free reachable interior cell — no gem
  }

  /* ---------------- time medals + the diamond tier (depth plan Phase 0) ----------------
     Gold/silver formulas are UNCHANGED from the shipped 30 (existing saves keep
     their meaning). Diamond sits above gold — the mastery tier, hidden on the
     win card until the level's first clear. These placeholder curves get
     replaced by certified bot percentiles (P10/P40/P75, diamond P2) when
     certify.cjs lands (Phase 2); the ORDERING contract is node-tested. */
  function medalTimes(par) {
    const p = Math.max(1, par || 1);
    return { diamond: 0.8 + p * 1.05, gold: 1.2 + p * 1.6, silver: 2.0 + p * 2.6 };
  }
  function medalFor(time, par) {
    const t = medalTimes(par);
    return time <= t.diamond ? "diamond" : time <= t.gold ? "gold" : time <= t.silver ? "silver" : "bronze";
  }

  return { N, DIRS, DIR4, PAL, COLORS, key, cloneState, tilt, isSolved,
           stateKey, solveBFS, rampFor, genPuzzle, seedForLevel, build,
           LAST_LEVEL, CURATED, hasGatewayHole,
           WORLDS, worldFor, hasGem, gemFor, medalTimes, medalFor,
           SAW_ORDER, sourceFor,
           VERSION: "2.8.0" };
});
