/* Lanthorn endless tail — levels past the 60 curated ones are generated here,
   so the odometer never hits a wall and the night sky fills forever (the
   Block Blast "endless alongside designed" model). Each level number maps
   DETERMINISTICALLY to one board (same seed every player, same as a designed
   level — "a level is a designed object, not a slot machine"), validated
   solvable + kind via the same engine the curated set was built with.
   Difficulty ramps with world depth (no brutal spike); each 20-level world
   eases in, dips to an archetype-A breather at its midpoint, and ends on its
   hardest level (the climax the World-complete card pays off). Faithful port
   of scripts/dev/gen-levels.cjs geometry. */
(function (root) {
  "use strict";
  const E = root.LanthornEngine;
  const N = E.N;
  const MAX_BLOCKED = 14;
  const CYCLE = ["C", "D", "E", "F", "B"];   // archetypes, mirrors the band-C curated cycle
  const cache = {};

  function genLevel(n) {                       // n is the 1-based level number (>60)
    if (cache[n]) return cache[n];
    // deterministic per-n RNG: hash n so adjacent levels don't look alike
    const rng = E.makeRNG((Math.imul(n, 2654435761) ^ 0x9e3779b9) >>> 0);
    const rInt = m => Math.floor(rng() * m);
    // each 20-level world ramps to a climax: relief valley at its MIDPOINT
    // (…,70,90,110), hardest level at its FINALE (…,80,100,120) — the one the
    // World-complete card pays off. (NOT every 10th easy — that put the easiest
    // level last, backwards from the genre.)
    const breather = n % 20 === 10;
    const finale = n % 20 === 0;
    // finale forces a TIGHT geometry (E/F are the low-win-rate archetypes in the
    // curated data) so the world climax is reliably hard, not a cycle fluke.
    const arch = breather ? "A" : (finale ? (Math.floor(n / 20) % 2 ? "F" : "E") : CYCLE[(n - 61) % CYCLE.length]);

    // ----- depth-scaled difficulty (§0-legal levers only: more lanterns,
    // tighter geometry, lower target win-rate). Ramps from a band-C feel at the
    // first endless world toward band-D and a gentle expert floor far out; the
    // world finale is a notch harder again, every board still solvable & fair.
    const worldIdx = Math.floor((n - 1) / 20);       // 3 = first endless world (The Moon)
    const depth = Math.max(0, worldIdx - 3);
    const base = Math.max(0.32, 0.62 - depth * 0.022);
    const targetWin = breather ? 0.82 : base;   // finale ignores this — it takes the hardest board found
    const maxWalls = breather ? 0 : Math.min(MAX_BLOCKED, 5 + depth);
    const lanternBase = breather ? Math.min(5, 3 + Math.floor(depth / 6))
                                 : Math.min(6, 4 + Math.floor(depth / 3) + (finale ? 1 : 0));

    function genBlocked(a) {
      switch (a) {
        case "A": return [];
        case "B": return [[0,0],[0,7],[7,0],[7,7]];
        case "C": {
          const len = 3 + rInt(2);
          const start = 2 + rInt(8 - 4 - len + 1);
          const horiz = rng() < 0.5;
          const cells = [];
          for (let i = 0; i < len; i++) {
            if (horiz) cells.push([0, start + i], [7, start + i]);
            else cells.push([start + i, 0], [start + i, 7]);
          }
          return cells;
        }
        case "D": {
          const len = 3 + rInt(2);
          const line = 2 + rInt(4);
          const start = 1 + rInt(7 - len);
          const horiz = rng() < 0.5;
          const cells = [];
          for (let i = 0; i < len; i++) cells.push(horiz ? [line, start + i] : [start + i, line]);
          return cells;
        }
        case "E": {
          const k = 2 + rInt(2);
          const cells = [], occ = [];
          let guard = 0;
          while (cells.length < k * 2 && guard++ < 300) {
            const horiz = rng() < 0.5;
            const r = 1 + rInt(6), c = 1 + rInt(6);
            const pts = horiz ? [[r, c], [r, c + 1]] : [[r, c], [r + 1, c]];
            if (pts.some(([pr, pc]) => pr > 6 || pc > 6)) continue;
            const clash = pts.some(([pr, pc]) =>
              occ.some(([qr, qc]) => Math.max(Math.abs(pr - qr), Math.abs(pc - qc)) <= 1));
            if (clash) continue;
            for (const p of pts) { occ.push(p); cells.push(p); }
          }
          return cells.length >= 4 ? cells : null;
        }
        case "F": {
          const len = 5 + rInt(2);
          const off = rInt(8 - len + 1);
          const anti = rng() < 0.5;
          const cells = [];
          for (let i = 0; i < len; i++) { const r = off + i; cells.push([r, anti ? 7 - r : r]); }
          return cells;
        }
      }
    }

    function genLanterns(count, blocked) {
      const bset = new Set(blocked.map(([r, c]) => r + "," + c));
      const cells = [];
      let guard = 0;
      while (cells.length < count && guard++ < 600) {
        const r = rInt(8), c = rInt(8);
        if (bset.has(r + "," + c)) continue;
        if (cells.some(([pr, pc]) => Math.abs(pr - r) + Math.abs(pc - c) < 2)) continue;
        cells.push([r, c]);
      }
      if (cells.length < count) return null;
      if (new Set(cells.map(x => x[0])).size === 1) return null;
      if (new Set(cells.map(x => x[1])).size === 1) return null;
      return cells;
    }

    // pad the archetype with extra scattered stones to tighten deeper boards
    function padWalls(blocked) {
      const want = Math.min(maxWalls, blocked.length + Math.round(depth * 0.7));
      const set = new Set(blocked.map(c => c[0] + "," + c[1]));
      let guard = 0;
      while (blocked.length < want && guard++ < 200) {
        const r = rInt(8), c = rInt(8), k = r + "," + c;
        if (set.has(k)) continue;
        set.add(k); blocked.push([r, c]);
      }
      return blocked;
    }

    // Generate candidates and keep the one whose bot win-rate is CLOSEST to the
    // depth target — that's what makes deep levels actually harder (not just
    // "allowed to be"). Hard gates: solvable from its authored queue, every
    // lantern lightable, and never below a fairness floor.
    // Accept the first board whose win-rate lands in a band around the depth
    // target (fast); otherwise keep the closest. Bounded so a level generates
    // in a few dozen ms even deep in the tail.
    const lo = targetWin - 0.07, hi = targetWin + 0.10;
    let lanternCount = lanternBase;
    let best = null, bestErr = Infinity;       // non-finale: board closest to the depth target
    let hard = null, hardWin = Infinity;       // finale: the hardest fair board found = the world climax
    const attempts = finale ? 26 : 18;         // scan a few more for the finale so its min is a real peak
    for (let round = 0; round < 2; round++) {
      for (let attempt = 0; attempt < attempts; attempt++) {
        let blocked = genBlocked(arch);
        if (!blocked) continue;
        if (!breather) blocked = padWalls(blocked);
        if (blocked.length > MAX_BLOCKED) blocked = blocked.slice(0, MAX_BLOCKED);
        const lanterns = genLanterns(lanternCount, blocked);
        if (!lanterns) continue;
        const seed = 300000 + rInt(2000000);
        const cand = { id: n, band: "C", blocked, lanterns, seed, archetype: arch };
        if (!E.botPlay(cand, cand.seed).won) continue;          // solvable from its authored queue
        // finale picks the HARDEST board, so it needs a low-noise estimate to
        // choose well (10-run variance would pick a fluke); bodies stay cheap.
        const sim = E.simulateLevel(cand, finale ? 28 : 10);
        if (sim.lanternLitCounts.some(x => x === 0)) continue;  // every lantern lightable
        // fairness floor — never near-impossible. The finale min-PICKS the
        // hardest fair board, so it needs headroom above true-unfair (noise near
        // a low floor overshoots into walls); 0.42 keeps the climax hard but
        // always winnable. Deep, every level is hard, so the finale reads as a
        // fair-but-tough cap + the World-complete payoff rather than a spike.
        if (sim.winRate < (finale ? 0.42 : 0.30)) continue;
        cand.par = sim.bestPieces || lanterns.length;
        if (finale) {                                           // climax: keep the hardest, scan them all
          if (sim.winRate < hardWin) { hardWin = sim.winRate; hard = cand; }
          continue;
        }
        if (sim.winRate >= lo && sim.winRate <= hi) { cache[n] = cand; return cand; }
        const err = Math.abs(sim.winRate - targetWin);
        if (err < bestErr) { bestErr = err; best = cand; }
      }
      lanternCount = Math.max(2, lanternCount - 1);             // relief valve if nothing valid
    }
    if (finale && hard) { cache[n] = hard; return hard; }
    if (best) { cache[n] = best; return best; }
    // last-resort fallback: trivial open board (should never be reached)
    const fb = { id: n, band: "C", blocked: [], lanterns: [[2,2],[5,5]], seed: 300000 + n, archetype: "A", par: 4 };
    cache[n] = fb;
    return fb;
  }

  root.genLevel = genLevel;
})(typeof globalThis !== "undefined" ? globalThis : this);
