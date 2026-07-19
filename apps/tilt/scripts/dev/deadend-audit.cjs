#!/usr/bin/env node
/* Tilt DEAD-END COVERAGE AUDIT (verification Layer 3 — "the solver").
   For every gate level: enumerate ALL reachable discrete states (ball cell /
   captured / gate status), prove which are DEAD, then check every dead state
   against the game's shipped detectors. A dead state no detector can ever reach
   = the game goes SILENT on a stuck player — the exact class Qi kept finding by
   hand (L37, three times).

   The graph machinery (enumeration, dead-set proof, oracle cross-check,
   coverage algebra) is @jfun/statespace; this file supplies only Tilt's truth:

   - TRANSITIONS: E.tilt, filtered COLOUR-FEASIBLE (the shipped physics is
     colour-selective; any tilt whose anim path carries a wrong ball through a
     gate cell is rejected — states beyond it are phantoms).
   - ORACLE (scheduler): the slide model alone lies in the known direction — it
     cannot stop a ball mid-board, so it calls states dead that a player wins by
     gently rolling a ball onto its open home (the fiction game.js checkSeal
     documents). The oracle is a FINE-CONTROL model strictly MORE permissive
     than physics: balls move cell-by-cell independently and stop anywhere;
     wrong holes never trap; uncaptured balls never block; a pocket ball needs
     only (approach reachable + any other ball can reach its plate);
     colour-selective gate passage is exact. Dead even under THIS ⟹ truly dead.
   - DETECTORS (cell-level mirrors of game.js):
       noHelper — no uncaptured ball is self-finishable → definitive card
       seal     — a ball's home flood-fill unreachable  → definitive card
       offer    — wrong ball parked on a sealed pocket  → restart offer

   Winnability verdicts stay with certify.cjs on the real physics.
   Usage: node scripts/dev/deadend-audit.cjs [from [to]]   (default 31 45) */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { audit } = require("@jfun/statespace");

const N = E.N, DIR4 = E.DIR4, key = E.key;

function makeAdapter(L) {
  const P = E.build(L);
  if (!P || !(P.gates || []).length) return null;
  const holesMap = {}; for (const h of P.holesArr) holesMap[key(h.x, h.y)] = h.c;
  const wallSet = new Set((P.walls || []).map(w => key(w.x, w.y)));
  const gmap = {}; for (const g of P.gates) gmap[key(g.x, g.y)] = key(g.px, g.py);
  const gateCells = new Set(P.gates.map(g => key(g.x, g.y)));
  const holeCount = P.holesArr.length;

  // sealed pockets + each pocket colour's gate (game.js isGatePocketHole)
  const isPocket = {}, gateOf = {};
  for (const h of P.holesArr) {
    let adjGate = false, openFloor = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = h.x + dx, ny = h.y + dy;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
      const k = key(nx, ny);
      if (gateCells.has(k)) { adjGate = true; continue; }
      if (wallSet.has(k) || holesMap[k] !== undefined) continue;
      openFloor = true;
    }
    isPocket[h.c] = adjGate && !openFloor;
    if (isPocket[h.c]) for (const g of P.gates)
      if (Math.abs(g.x - h.x) + Math.abs(g.y - h.y) === 1) gateOf[h.c] = g;
  }
  const pocketColourOfGate = {};
  for (const g of P.gates) for (const h of P.holesArr)
    if (Math.abs(g.x - h.x) + Math.abs(g.y - h.y) === 1) pocketColourOfGate[key(g.x, g.y)] = h.c;

  /* ---- scheduler oracle (see header) ---- */
  function schedulerWinnable(st) {
    const balls = st.marbles.map(m => ({ c: m.c, x: m.x, y: m.y, fixed: m.fixed }));
    const homeOf = {}; for (const h of P.holesArr) homeOf[h.c] = h;
    for (const b of balls) {                     // wrong ball inside a pocket can never exit
      if (b.fixed) continue;
      const hc = holesMap[key(b.x, b.y)];
      if (hc !== undefined && hc !== b.c && isPocket[hc]) return false;
    }
    const reach = (fx, fy, blocked) => {
      const seen = new Set([key(fx, fy)]);
      const fq = [[fx, fy]];
      while (fq.length) {
        const [x, y] = fq.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k2 = key(nx, ny);
          if (nx < 0 || nx >= N || ny < 0 || ny >= N || seen.has(k2) || blocked.has(k2) || gateCells.has(k2)) continue;
          seen.add(k2); fq.push([nx, ny]);
        }
      }
      return seen;
    };
    const idx = balls.map((b, i) => i).filter(i => !balls[i].fixed);
    let mask0 = 0;
    balls.forEach((b, i) => { if (b.fixed) mask0 |= 1 << i; });
    const FULL = (1 << balls.length) - 1;
    const memo = new Map();
    const blockedFor = mask => {
      const bl = new Set(wallSet);
      balls.forEach((b, i) => { if (mask & (1 << i)) bl.add(key(homeOf[b.c].x, homeOf[b.c].y)); });
      return bl;
    };
    function dfs(mask) {
      if (mask === FULL) return true;
      if (memo.has(mask)) return memo.get(mask);
      memo.set(mask, false);                     // cycle guard
      const bl = blockedFor(mask);
      for (const i of idx) {
        if (mask & (1 << i)) continue;
        const b = balls[i], home = homeOf[b.c];
        let can = false;
        if (!isPocket[b.c]) {
          can = reach(b.x, b.y, bl).has(key(home.x, home.y));
        } else {
          const g = gateOf[b.c];
          const selfFin = (b.x === g.x && b.y === g.y) || (b.x === home.x && b.y === home.y);
          if (selfFin) can = true;
          else {
            const rb = reach(b.x, b.y, bl);
            let approach = false;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = g.x + dx, ny = g.y + dy;
              if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
              if (rb.has(key(nx, ny))) { approach = true; break; }
            }
            if (approach) {
              for (const j of idx) {
                if (j === i || (mask & (1 << j))) continue;
                if (reach(balls[j].x, balls[j].y, bl).has(key(g.px, g.py))) { can = true; break; }
              }
            }
          }
        }
        if (can && dfs(mask | (1 << i))) { memo.set(mask, true); return true; }
      }
      return false;
    }
    return dfs(mask0);
  }

  /* ---- detector predicates (cell-level mirrors of game.js) ---- */
  const uncap = st => st.marbles.filter(m => !m.fixed);
  function fireNoHelper(st) {
    const un = uncap(st);
    if (!un.length) return false;
    for (const m of un) {
      const home = P.holesArr.find(h => h.c === m.c);
      if (!home || !isPocket[m.c]) return false;
      const g = gateOf[m.c];
      if ((m.x === home.x && m.y === home.y) || (g && m.x === g.x && m.y === g.y)) return false;
    }
    return true;
  }
  function fireSeal(st) {
    const blocked = new Set(wallSet);
    for (const m of st.marbles) if (m.fixed) blocked.add(key(m.x, m.y));
    const un = uncap(st);
    for (const m of un) {
      const bl = new Set(blocked);
      if (un.length <= 1) for (const g of P.gates)
        if (!(m.x === g.x && m.y === g.y)) bl.add(key(g.x, g.y));
      const home = P.holesArr.find(h => h.c === m.c);
      if (!home) continue;
      const seen = new Set([key(m.x, m.y)]);
      const fq = [[m.x, m.y]];
      let ok = false;
      while (fq.length) {
        const [x, y] = fq.shift();
        if (x === home.x && y === home.y) { ok = true; break; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k2 = key(nx, ny);
          if (nx < 0 || nx >= N || ny < 0 || ny >= N || seen.has(k2) || bl.has(k2)) continue;
          seen.add(k2); fq.push([nx, ny]);
        }
      }
      if (!ok) return true;
    }
    return false;
  }
  const fireOffer = st => uncap(st).some(m => {
    const c = holesMap[key(m.x, m.y)];
    return c !== undefined && c !== m.c && isPocket[c];
  });

  return {
    P,
    initial: () => E.cloneState(P.init),
    moves: () => DIR4,
    apply: (st, d) => {
      const ns = E.cloneState(st);
      const r = E.tilt(ns, d, holesMap, wallSet, {}, gmap);
      if (!r.moved) return null;
      for (const a of r.anim) {                  // colour-feasibility (see header)
        if (a.fixed) continue;
        for (let i = 1; i < a.path.length; i++) {
          const pc = pocketColourOfGate[key(a.path[i].x, a.path[i].y)];
          if (pc !== undefined && pc !== a.m.c) return null;
        }
      }
      return ns;
    },
    stateKey: E.stateKey,
    isGoal: st => E.isSolved(st, holeCount),
    oracleWinnable: schedulerWinnable,
    detectors: { card: st => fireNoHelper(st) || fireSeal(st), offer: fireOffer },
  };
}

const from = +(process.argv[2] || 31), to = +(process.argv[3] || 45);
let anySilent = false, anyXchk = false, t0 = Date.now();
console.log("lvl  par  states  slideDead trueDead fiction | card@now offer@now | SILENT   xchk");
for (let L = from; L <= to; L++) {
  const a = makeAdapter(L);
  if (!a) { console.log(String(L).padStart(3) + "  (no gates — skipped)"); continue; }
  const r = audit(a);
  const flag = r.silent.length ? "✗ " + r.silent.length + " SILENT" : "✓ 0";
  if (r.silent.length) anySilent = true;
  if (r.xchkFail) anyXchk = true;
  console.log(String(L).padStart(3), String(a.P.par).padStart(4), String(r.states).padStart(7),
    String(r.deadN).padStart(9), String(r.trueDeadN).padStart(8), String(r.fictionN).padStart(7), " |",
    String(r.immCard).padStart(8), String(r.immOffer).padStart(9), " |", flag.padEnd(9),
    r.xchkFail ? "✗ " + r.xchkFail + " SCHEDULER BUG" : "✓");
  for (const k of r.silent.slice(0, 3))
    console.log("        silent e.g.:", r.state(k).marbles.map(m => m.c + "@" + m.x + "," + m.y + (m.fixed ? "*" : "")).join(" "));
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s.  ` +
  (anyXchk ? "✗ scheduler cross-check FAILED (called a slide-winnable state dead) — fix the oracle before trusting this audit. "
   : "") +
  (anySilent
    ? "✗ SILENT-STUCK states exist: a player can be PROVABLY dead (even under fine control) with no card and no reachable signal — add a detector or fix the board."
    : "✓ every provably-dead state signals (card now, or card/offer reachable) — no silent stucks."));
process.exit(anySilent || anyXchk ? 1 : 0);
