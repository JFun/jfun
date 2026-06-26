/* __GameName__ — STARTER engine (REPLACE the rules with your game). This is a
   deliberately trivial placeholder so a freshly-scaffolded game runs and exercises
   the daily loop end-to-end on day one. It builds a small deterministic board from
   a seed (so everyone gets the same daily) using @studio/web-game-core primitives.

   Keep the SHAPE — a pure, deterministic, seedable engine with a golden test — and
   swap in your real rules. The loop wiring in game.js doesn't care what the game
   is, only that it reports {moves, par} on a win. */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  // web-game-core: browser global in the page, require() in node tests.
  const Core = (typeof module !== "undefined" && module.exports)
    ? require("@studio/web-game-core") : root.WebGameCore;
  const { makeRNG, EMPTY, FILLED } = Core;

  const N = 5;

  // Build a deterministic board from a seed: ~40% of cells start FILLED. Pure
  // function of the seed → same daily for everyone (the determinism contract).
  function build(seed) {
    const rng = makeRNG(seed);
    const grid = Array.from({ length: N }, () => Array(N).fill(EMPTY));
    let filled = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (rng() < 0.4) { grid[r][c] = FILLED; filled++; }
    }
    if (!filled) grid[0][0] = FILLED;     // never hand out an already-won board
    return grid;
  }

  // Placeholder rule: tapping a filled cell clears it and its orthogonal
  // neighbors. Returns the cells cleared (for animation) or null if it was a
  // no-op (tapped empty). Mutates grid.
  function tap(grid, r, c) {
    if (grid[r][c] !== FILLED) return null;
    const cleared = [];
    const hit = (rr, cc) => { if (rr >= 0 && rr < N && cc >= 0 && cc < N && grid[rr][cc] === FILLED) { grid[rr][cc] = EMPTY; cleared.push({ r: rr, c: cc }); } };
    hit(r, c); hit(r - 1, c); hit(r + 1, c); hit(r, c - 1); hit(r, c + 1);
    return cleared;
  }

  const isWon = grid => grid.every(row => row.every(v => v !== FILLED));
  const countFilled = grid => grid.reduce((n, row) => n + row.filter(v => v === FILLED).length, 0);

  // Par: optimal taps via the core BFS scaffold (proves every daily is winnable
  // and gives the player a goal). Bounded — the 5×5 placeholder solves shallow.
  function par(seed) {
    const start = build(seed);
    const res = Core.bfsSolve(start, {
      moves: cellMoves(),
      apply: (g, mv) => { const ng = Core.cloneGrid(g); const cl = tap(ng, mv[0], mv[1]); return cl && cl.length ? { next: ng } : { changed: false }; },
      isWon, key: Core.key, maxDepth: 16,
    });
    return res.par;
  }
  function cellMoves() { const m = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) m.push([r, c]); return m; }

  return { N, build, tap, isWon, countFilled, par, EMPTY, FILLED, VERSION: "0.1.0" };
});
