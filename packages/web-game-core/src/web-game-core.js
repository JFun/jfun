/* @studio/web-game-core — the deterministic primitives shared by the vanilla-JS
   games (Lanthorn/Moraine lineage). The REUSABLE parts only: a seeded RNG, grid
   helpers, generic full-line detection, and the BFS solver/validation scaffold.
   The game RULES (Moraine's settle/cascade, Lanthorn's place/lanterns) stay in
   each game's own engine.js — this package never assumes a specific game.

   UMD (the no-build ethos — same pattern as the games' engine.js): browser global
   `WebGameCore`, Node `require`, ESM via the package entry. Determinism is sacred:
   makeRNG is the canonical mulberry32 (Lanthorn engine.js), pinned by a golden. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WebGameCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ---- cell vocabulary (the lowest common denominator across the games) ----
  const EMPTY = 0, FILLED = 1, WALL = 2;

  // ---- RNG: mulberry32 (canonical, from Lanthorn engine.js). Same seed →
  // identical stream on every client. The contract the daily/replay depend on. ----
  function makeRNG(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Deterministic helpers built on a stream.
  function rngInt(rng, n) { return Math.floor(rng() * n); }
  function pick(rng, arr) { return arr[rngInt(rng, arr.length)]; }
  // Fisher–Yates on a COPY (pure); stable for a given rng stream.
  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rngInt(rng, i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // ---- grid helpers ----
  function makeGrid(rows, cols, fill) { return Array.from({ length: rows }, () => Array(cols).fill(fill == null ? EMPTY : fill)); }
  function cloneGrid(g) { return g.map(row => row.slice()); }
  // Stable string key of a grid (solver visited-set / golden fixtures).
  function key(g) { return g.map(row => row.join("")).join("|"); }
  function fromKey(str) { return str.split("|").map(row => row.split("").map(Number)); }

  // ---- generic full-line detection ----
  // A line counts as "full" when every cell satisfies isFilled, and is reported
  // only if it has ≥1 cell satisfying isClearable (the loose guard — an all-wall
  // line clears nothing and must never be returned, or a cascade loops forever).
  // Defaults match the simple vocabulary: filled = non-empty, clearable = FILLED.
  function fullLines(grid, opts) {
    opts = opts || {};
    const isFilled = opts.isFilled || (v => v !== EMPTY);
    const isClearable = opts.isClearable || (v => v === FILLED);
    const R = grid.length, C = grid[0] ? grid[0].length : 0;
    const rows = [], cols = [];
    for (let r = 0; r < R; r++) {
      let full = true, clr = false;
      for (let c = 0; c < C; c++) { const v = grid[r][c]; if (!isFilled(v)) { full = false; break; } if (isClearable(v)) clr = true; }
      if (full && clr) rows.push(r);
    }
    for (let c = 0; c < C; c++) {
      let full = true, clr = false;
      for (let r = 0; r < R; r++) { const v = grid[r][c]; if (!isFilled(v)) { full = false; break; } if (isClearable(v)) clr = true; }
      if (full && clr) cols.push(c);
    }
    return { rows, cols };
  }

  // ---- BFS solver / validation scaffold ----
  // The discipline that makes extraction safe (CLAUDE.md non-negotiable): prove a
  // start state is solvable and find its OPTIMAL move count (par). Parameterized by
  // the game — it supplies how to enumerate moves, apply one, test the win, and key
  // a state. Returns { solvable, par, solution, states }.
  //   spec.moves   : array of move tokens to try at each node
  //   spec.apply   : (state, move) → { next, changed }  (changed:false = no-op, skipped)
  //   spec.isWon   : (state) → boolean
  //   spec.key     : (state) → string   (visited-set identity)
  //   spec.maxDepth: search cap (default 20)
  function bfsSolve(start, spec) {
    const maxDepth = spec.maxDepth || 20;
    if (spec.isWon(start)) return { solvable: true, par: 0, solution: [], states: 1 };
    const seen = new Set([spec.key(start)]);
    let frontier = [{ s: start, path: [] }], states = 1;
    for (let depth = 1; depth <= maxDepth; depth++) {
      const next = [];
      for (const node of frontier) {
        for (const mv of spec.moves) {
          const r = spec.apply(node.s, mv);
          if (!r || r.changed === false) continue;
          const ns = r.next !== undefined ? r.next : r;
          const k = spec.key(ns);
          if (seen.has(k)) continue;
          seen.add(k); states++;
          const path = node.path.concat([mv]);   // [mv] so ARRAY move tokens (e.g. [r,c]) aren't flattened
          if (spec.isWon(ns)) return { solvable: true, par: depth, solution: path, states };
          next.push({ s: ns, path });
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    return { solvable: false, par: null, solution: null, states };
  }
  // Bounded fail-OPEN solvability probe (runtime dead-end detection — never hangs
  // the UI). Returns true if a win is reachable, OR if the bound is hit undecided
  // (we'd rather miss a dead end than falsely declare one).
  function solvable(start, spec, maxStates) {
    maxStates = maxStates || 100000;
    if (spec.isWon(start)) return true;
    const seen = new Set([spec.key(start)]);
    let frontier = [start], count = 1;
    while (frontier.length) {
      const next = [];
      for (const s of frontier) {
        for (const mv of spec.moves) {
          const r = spec.apply(s, mv);
          if (!r || r.changed === false) continue;
          const ns = r.next !== undefined ? r.next : r;
          if (spec.isWon(ns)) return true;
          const k = spec.key(ns);
          if (seen.has(k)) continue;
          seen.add(k);
          if (++count > maxStates) return true;   // fail-open
          next.push(ns);
        }
      }
      frontier = next;
    }
    return false;
  }

  return {
    EMPTY, FILLED, WALL,
    makeRNG, rngInt, pick, shuffle,
    makeGrid, cloneGrid, key, fromKey,
    fullLines, bfsSolve, solvable,
    VERSION: "0.1.0",
  };
});
