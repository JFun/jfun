/* Lanthorn greybox engine — shared by greybox.html (browser) and bot-sim.cjs (node).
   House rules: 1 verb (drag/place), walls count toward line fullness, lanterns light
   when a full line through them clears. No timers, no counters, no per-piece state. */
(function () {
  "use strict";

  // ---------- RNG (mulberry32) ----------
  function makeRNG(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Shapes (fixed orientations; families share tuning weights) ----------
  const SHAPES = {
    I2h: [[0,0],[0,1]], I2v: [[0,0],[1,0]],
    I3h: [[0,0],[0,1],[0,2]], I3v: [[0,0],[1,0],[2,0]],
    I4h: [[0,0],[0,1],[0,2],[0,3]], I4v: [[0,0],[1,0],[2,0],[3,0]],
    I5h: [[0,0],[0,1],[0,2],[0,3],[0,4]], I5v: [[0,0],[1,0],[2,0],[3,0],[4,0]],
    SQ2: [[0,0],[0,1],[1,0],[1,1]],
    L3a: [[0,0],[1,0],[1,1]], L3b: [[0,0],[0,1],[1,0]],
    L3c: [[0,0],[0,1],[1,1]], L3d: [[0,1],[1,0],[1,1]],
    T4a: [[0,0],[0,1],[0,2],[1,1]], T4b: [[0,1],[1,0],[1,1],[2,1]],
    T4c: [[1,0],[1,1],[1,2],[0,1]], T4d: [[0,0],[1,0],[2,0],[1,1]],
    S4h: [[0,1],[0,2],[1,0],[1,1]], S4v: [[0,0],[1,0],[1,1],[2,1]],
    Z4h: [[0,0],[0,1],[1,1],[1,2]], Z4v: [[0,1],[1,0],[1,1],[2,0]]
  };
  const FAMILY = {
    I2: ["I2h","I2v"], I3: ["I3h","I3v"], I4: ["I4h","I4v"], I5: ["I5h","I5v"],
    SQ2: ["SQ2"], L3: ["L3a","L3b","L3c","L3d"], T4: ["T4a","T4b","T4c","T4d"],
    S4: ["S4h","S4v"], Z4: ["Z4h","Z4v"]
  };

  const TUNING = {
    boardSize: 8,
    handSlots: 3,
    pieceWeights: {
      A: { I2: 3, I3: 3, I4: 2, SQ2: 2, L3: 2, T4: 1, S4: 0, Z4: 0, I5: 0 },
      B: { I2: 2, I3: 3, I4: 2, SQ2: 2, L3: 2, T4: 2, S4: 1, Z4: 1, I5: 0 },
      C: { I2: 2, I3: 2, I4: 2, SQ2: 2, L3: 2, T4: 2, S4: 2, Z4: 2, I5: 1 }
    },
    botBandMin: { A: 0.85, B: 0.70, C: 0.55, D: 0.40 },
    heuristic: { clearBonus: 100, goalLineProgress: 8, adjacency: 1, centerPenalty: 0.25 }
  };

  function buildPool(band) {
    const w = TUNING.pieceWeights[band] || TUNING.pieceWeights.B;
    const pool = [];
    for (const fam in w) {
      const weight = w[fam];
      if (!weight) continue;
      for (const sh of FAMILY[fam]) for (let i = 0; i < weight; i++) pool.push(sh);
    }
    return pool;
  }

  // ---------- Levels (greybox 1–10; ramp A→F archetypes, lanterns 2→5) ----------
  const LEVELS = [
    { id:1,  band:"A", blocked: [], lanterns: [[3,3],[4,4]], seed: 11001 },
    { id:2,  band:"A", blocked: [], lanterns: [[2,5],[5,2]], seed: 11002 },
    { id:3,  band:"A", blocked: [[0,0],[0,7],[7,0],[7,7]], lanterns: [[0,3],[7,4]], seed: 11003 },
    { id:4,  band:"A", blocked: [[0,0],[0,7],[7,0],[7,7]], lanterns: [[3,0],[3,7],[6,3]], seed: 11004 },
    { id:5,  band:"B", blocked: [[0,2],[0,3],[0,4],[0,5],[7,2],[7,3],[7,4],[7,5]], lanterns: [[0,1],[4,4],[7,6]], seed: 11005 },
    { id:6,  band:"B", blocked: [[4,2],[4,3],[4,4],[4,5]], lanterns: [[4,0],[4,7],[1,1]], seed: 11006 },
    { id:7,  band:"B", blocked: [[2,0],[3,0],[4,0],[5,0],[2,7],[3,7],[4,7],[5,7]], lanterns: [[3,1],[4,6],[0,0],[7,7]], seed: 11007 },
    { id:8,  band:"C", blocked: [[2,2],[2,3],[5,4],[5,5]], lanterns: [[2,4],[5,3],[0,7],[7,0]], seed: 11008 },
    { id:9,  band:"C", blocked: [[2,3],[3,3],[4,3],[5,3]], lanterns: [[0,3],[7,3],[3,6],[4,1]], seed: 11009 },
    { id:10, band:"C", blocked: [[1,1],[2,2],[3,3],[4,4],[5,5],[6,6]], lanterns: [[1,6],[6,1],[3,5],[5,3]], seed: 11010 }
  ];

  // ---------- Game ----------
  const N = TUNING.boardSize;
  const EMPTY = 0, FILLED = 1, WALL = 2;

  function newGame(level, seedOverride) {
    const grid = Array.from({ length: N }, () => new Array(N).fill(EMPTY));
    for (const [r, c] of level.blocked) grid[r][c] = WALL;
    const lanterns = level.lanterns.map(([r, c]) => ({ r, c, lit: false }));
    const rng = makeRNG(seedOverride === undefined ? level.seed : seedOverride);
    const pool = buildPool(level.band);
    const g = { level, grid, lanterns, rng, pool, hand: [], piecesUsed: 0, assistUsed: false, over: false, won: false };
    refill(g);
    return g;
  }

  function drawShape(g) { return g.pool[Math.floor(g.rng() * g.pool.length)]; }
  function refill(g) { while (g.hand.length < TUNING.handSlots) g.hand.push(drawShape(g)); }

  function canPlace(g, shapeKey, r, c) {
    const cells = SHAPES[shapeKey];
    for (const [dr, dc] of cells) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= N || cc >= N) return false;
      if (g.grid[rr][cc] !== EMPTY) return false;
    }
    return true;
  }

  function lineFull(g, kind, idx) {
    for (let i = 0; i < N; i++) {
      const v = kind === "row" ? g.grid[idx][i] : g.grid[i][idx];
      if (v === EMPTY) return false; // walls (2) and filled (1) both count
    }
    return true;
  }

  // Place piece at (r,c). Returns {cleared:{rows,cols}, lit:[lantern...]} or null if illegal.
  function place(g, handIdx, r, c) {
    const shapeKey = g.hand[handIdx];
    if (!shapeKey || !canPlace(g, shapeKey, r, c)) return null;
    for (const [dr, dc] of SHAPES[shapeKey]) g.grid[r + dr][c + dc] = FILLED;
    g.hand.splice(handIdx, 1);
    g.piecesUsed++;

    const rows = [], cols = [];
    for (let i = 0; i < N; i++) {
      if (lineFull(g, "row", i)) rows.push(i);
      if (lineFull(g, "col", i)) cols.push(i);
    }
    const lit = [];
    for (const ln of g.lanterns) {
      if (!ln.lit && (rows.includes(ln.r) || cols.includes(ln.c))) { ln.lit = true; lit.push(ln); }
    }
    for (const i of rows) for (let j = 0; j < N; j++) if (g.grid[i][j] === FILLED) g.grid[i][j] = EMPTY;
    for (const j of cols) for (let i = 0; i < N; i++) if (g.grid[i][j] === FILLED) g.grid[i][j] = EMPTY;

    if (g.hand.length === 0) refill(g);

    if (g.lanterns.every(l => l.lit)) { g.over = true; g.won = true; }
    else if (!anyFit(g)) { g.over = true; g.won = false; }
    return { cleared: { rows, cols }, lit };
  }

  function anyFit(g) {
    for (const sh of g.hand) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (canPlace(g, sh, r, c)) return true;
    }
    return false;
  }

  // Assist (PRD §2): once per level, when exactly 1 lantern unlit and stuck → fresh hand.
  function assistEligible(g) {
    return !g.assistUsed && g.over && !g.won && g.lanterns.filter(l => !l.lit).length === 1;
  }
  function useAssist(g) {
    if (!assistEligible(g)) return false;
    g.assistUsed = true; g.hand = []; refill(g);
    g.over = !anyFit(g); g.won = false;
    return true;
  }

  // ---------- Greedy bot (1-ply, tuning heuristic; plays WITHOUT assist) ----------
  function filledFrac(g, kind, idx) {
    let n = 0;
    for (let i = 0; i < N; i++) {
      const v = kind === "row" ? g.grid[idx][i] : g.grid[i][idx];
      if (v !== EMPTY) n++;
    }
    return n / N;
  }
  function scoreMove(g, shapeKey, r, c) {
    const H = TUNING.heuristic;
    // simulate on a cheap copy
    const sim = { grid: g.grid.map(row => row.slice()), lanterns: g.lanterns.map(l => ({ ...l })) };
    for (const [dr, dc] of SHAPES[shapeKey]) sim.grid[r + dr][c + dc] = FILLED;
    let clears = 0;
    const fullR = [], fullC = [];
    for (let i = 0; i < N; i++) {
      let fr = true, fc = true;
      for (let j = 0; j < N; j++) {
        if (sim.grid[i][j] === EMPTY) fr = false;
        if (sim.grid[j][i] === EMPTY) fc = false;
      }
      if (fr) { clears++; fullR.push(i); }
      if (fc) { clears++; fullC.push(i); }
    }
    let goalClears = 0, goalProgress = 0;
    for (const ln of sim.lanterns) {
      if (ln.lit) continue;
      if (fullR.includes(ln.r) || fullC.includes(ln.c)) goalClears++;
      else {
        let rN = 0, cN = 0;
        for (let j = 0; j < N; j++) {
          if (sim.grid[ln.r][j] !== EMPTY) rN++;
          if (sim.grid[j][ln.c] !== EMPTY) cN++;
        }
        goalProgress += Math.max(rN, cN) / N;
      }
    }
    let adj = 0, centerDist = 0, cells = 0;
    for (const [dr, dc] of SHAPES[shapeKey]) {
      const rr = r + dr, cc = c + dc; cells++;
      centerDist += Math.abs(rr - 3.5) + Math.abs(cc - 3.5);
      const nb = [[rr-1,cc],[rr+1,cc],[rr,cc-1],[rr,cc+1]];
      for (const [ar, ac] of nb) {
        if (ar < 0 || ac < 0 || ar >= N || ac >= N) { adj++; continue; } // edges count as snug
        if (g.grid[ar][ac] !== EMPTY) adj++;
      }
    }
    return goalClears * H.clearBonus * 2 + clears * H.clearBonus +
           goalProgress * H.goalLineProgress + adj * H.adjacency -
           (centerDist / cells) * H.centerPenalty;
  }

  function botStep(g) {
    let best = null, bestScore = -Infinity;
    for (let h = 0; h < g.hand.length; h++) {
      const sh = g.hand[h];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (!canPlace(g, sh, r, c)) continue;
        const s = scoreMove(g, sh, r, c);
        if (s > bestScore) { bestScore = s; best = { h, r, c }; }
      }
    }
    if (!best) return false;
    place(g, best.h, best.r, best.c);
    return true;
  }

  function botPlay(level, seed, maxPieces) {
    const g = newGame(level, seed);
    const cap = maxPieces || 200;
    while (!g.over && g.piecesUsed < cap) { if (!botStep(g)) break; }
    return { won: g.won, pieces: g.piecesUsed };
  }

  function simulateLevel(level, runs) {
    const n = runs || 100;
    let wins = 0; const pieceCounts = [];
    for (let i = 0; i < n; i++) {
      const res = botPlay(level, level.seed * 1000 + i);
      if (res.won) { wins++; pieceCounts.push(res.pieces); }
    }
    pieceCounts.sort((a, b) => a - b);
    return {
      id: level.id, band: level.band, winRate: wins / n,
      medianPieces: pieceCounts.length ? pieceCounts[Math.floor(pieceCounts.length / 2)] : null,
      bandMin: TUNING.botBandMin[level.band]
    };
  }

  globalThis.LanthornEngine = {
    TUNING, SHAPES, FAMILY, LEVELS, N,
    makeRNG, newGame, canPlace, place, anyFit,
    assistEligible, useAssist, botStep, botPlay, simulateLevel
  };
})();
