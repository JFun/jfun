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

  /* Resolve a tilt. holes is a map "x,y"→color. Mutates st; returns
     { moved, anim: [{ m, path: [{x,y}...], landed, fixed? }] }.
     Every loose marble slides until wall or marble; rolling onto its matching
     empty hole snaps it in (fixed). Marbles furthest along the direction go first. */
  function tilt(st, dir, holes) {
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
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) break;   // wall
        if (occAt(st, nx, ny)) break;                        // blocked by marble
        cx = nx; cy = ny; path.push({ x: cx, y: cy });
        const h = holes[key(cx, cy)];
        if (h === m.c) { landed = true; break; }             // matching empty hole: snap
      }
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
  function solveBFS(init, holes, holeCount, maxDepth) {
    const start = cloneState(init);
    if (isSolved(start, holeCount)) return [];
    const seen = new Set([stateKey(start)]);
    let frontier = [{ st: start, path: [] }];
    for (let depth = 0; depth < maxDepth; depth++) {
      const next = [];
      for (const node of frontier) {
        for (const d of DIR4) {
          const ns = cloneState(node.st);
          const r = tilt(ns, d, holes);
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

  /* ---------------- level ramp ---------------- */
  // Hole count climbs 3 → 6; par floor rises once the player has the hang of it.
  function rampFor(level) {
    const L = Math.max(1, level | 0);
    const nHoles = Math.min(3 + Math.floor((L - 1) / 4), 6);
    const minPar = L < 5 ? 2 : 3;
    const maxDepth = nHoles >= 5 ? 16 : 12;
    return { nHoles, minPar, maxDepth };
  }
  function seedForLevel(n) { return ((n * 0x9e3779b1) ^ 0x7117) >>> 0; }

  /* Puzzle generation: distinct-colored holes at seeded cells, one matching marble
     per hole scattered elsewhere, BFS-verified at par ≥ minPar. Constructive
     fallbacks shrink the board's ambition but every path is re-verified —
     never ship a lie. */
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
      const init = { marbles };
      const res = solveBFS(init, holes, holesArr.length, ramp.maxDepth);
      if (res && res.length >= ramp.minPar) {
        return { holes, holesArr, init: cloneState(init), par: res.length, solution: res };
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
      if (res) return { holes, holesArr, init: cloneState(init), par: res.length, solution: res };
    }

    // Last resort: one marble adjacent to its hole — verified before returning.
    for (let attempt = 0; attempt < 40; attempt++) {
      const rng = makeRNG((seed * 4129 + attempt * 97 + 3) >>> 0);
      const c = COLORS[Math.floor(rng() * COLORS.length)];
      const hx = 1 + Math.floor(rng() * (N - 2)), hy = 1 + Math.floor(rng() * (N - 2));
      const holes = {}; holes[key(hx, hy)] = c;
      const init = { marbles: [{ x: hx + 1, y: hy, c, fixed: false }] };
      const res = solveBFS(init, holes, 1, 8);
      if (res) return { holes, holesArr: [{ x: hx, y: hy, c }], init: cloneState(init), par: res.length, solution: res };
    }
    return null;
  }

  /* ---------------- level campaign ---------------- */
  function build(level) {
    const L = Math.max(1, level | 0);
    const ramp = rampFor(L);
    let seed = seedForLevel(L), p = null, guard = 0;
    while (!p && guard++ < 40) { p = genPuzzle(seed, ramp); seed = (seed + 7919) >>> 0; }
    if (p) p.level = L;
    return p;
  }

  return { N, DIRS, DIR4, PAL, COLORS, key, cloneState, tilt, isSolved,
           stateKey, solveBFS, rampFor, genPuzzle, seedForLevel, build, VERSION: "2.0.0" };
});
