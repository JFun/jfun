#!/usr/bin/env node
/* Tilt DEAD-END COVERAGE AUDIT (verification Layer 3 — "the solver").
   For every gate level: enumerate ALL reachable discrete states (ball cell /
   captured / gate status), prove which are DEAD (backward reachability from
   solved), then check every dead state against the game's shipped detectors.
   A dead state no detector can ever reach = the game goes SILENT on a stuck
   player — the exact class Qi kept finding by hand (L37, three times).

   Soundness scope (see docs/handbook/09-difficulty.md "wrong oracle" scar):
   TWO deadness oracles, because the slide model alone lies in the known
   direction — it cannot stop a ball mid-board, so it calls states dead that a
   player can win by gently rolling a ball onto its open home (the very fiction
   game.js checkSeal documents). So:
     1. slide-dead     — unreachable-to-solved in the discrete slide graph
                         (candidate generator, NOT physics-sound on its own)
     2. scheduler-dead — a FINE-CONTROL oracle strictly MORE permissive than
                         physics: balls move cell-by-cell independently and stop
                         anywhere; wrong holes never trap; uncaptured balls never
                         block; a pocket ball needs only (approach reachable +
                         any other ball can reach its plate); colour-selective
                         gate passage is exact. If even THIS can't finish, no
                         physics play can ⟹ TRULY dead.
   Coverage is required only for slide-dead ∧ scheduler-dead states. States that
   are slide-dead but scheduler-winnable are the discrete fiction — reported,
   not gated. Winnability verdicts stay with certify.cjs on the real physics.

   Detector predicates mirror game.js at the CELL level:
     noHelper  — no uncaptured ball is self-finishable (open home, or sitting at
                 its own gate/pocket cell)              → definitive DEAD END card
     seal      — some ball's home is flood-fill unreachable past walls+captured
                 (+ gates-as-walls for the last free marble)  → DEAD END card
     offer     — a wrong-colour ball parked on a sealed pocket cell → the
                 non-destructive "tap to restart" offer

   Coverage per dead state: IMMEDIATE (a card fires right there), EVENTUAL (some
   continuation reaches a card/offer — a wandering player will surface it), or
   SILENT (no reachable state ever signals — the audit failure).

   Usage: node scripts/dev/deadend-audit.cjs [from [to]]   (default 31 45) */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));

const N = E.N, DIR4 = E.DIR4, key = E.key;

function auditLevel(L) {
  const P = E.build(L);
  if (!P || !(P.gates || []).length) return null;
  const holesMap = {}; for (const h of P.holesArr) holesMap[key(h.x, h.y)] = h.c;
  const wallSet = new Set((P.walls || []).map(w => key(w.x, w.y)));
  const gmap = {}; for (const g of P.gates) gmap[key(g.x, g.y)] = key(g.px, g.py);
  const gateCells = new Set(P.gates.map(g => key(g.x, g.y)));
  const holeCount = P.holesArr.length;

  // sealed pockets + each pocket colour's gate cell (game.js isGatePocketHole)
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

  /* ---- enumerate the full reachable graph (colour-feasible transitions only) ----
     E.tilt is colour-agnostic on gates, but the shipped physics is colour-
     SELECTIVE: a wrong-colour ball never crosses a gate cell. Reject any tilt
     whose anim path carries a wrong ball through a gate cell — states beyond it
     are physically unreachable and would poison both the audit domain and the
     scheduler cross-check. */
  const pocketColourOfGate = {};
  for (const g of P.gates) for (const h of P.holesArr)
    if (Math.abs(g.x - h.x) + Math.abs(g.y - h.y) === 1) pocketColourOfGate[key(g.x, g.y)] = h.c;
  const apply = (st, d) => {
    const ns = E.cloneState(st);
    const r = E.tilt(ns, d, holesMap, wallSet, {}, gmap);
    if (!r.moved) return null;
    for (const a of r.anim) {
      if (a.fixed) continue;
      for (let i = 1; i < a.path.length; i++) {
        const pc = pocketColourOfGate[key(a.path[i].x, a.path[i].y)];
        if (pc !== undefined && pc !== a.m.c) return null;   // wrong colour in a doorway — impossible in physics
      }
    }
    return ns;
  };
  const nodes = new Map(), adj = new Map();
  const init = E.cloneState(P.init);
  nodes.set(E.stateKey(init), init);
  const q = [init];
  while (q.length) {
    const st = q.shift(), k = E.stateKey(st);
    if (adj.has(k)) continue;
    const kids = [];
    for (const d of DIR4) {
      const ns = apply(st, d);
      if (!ns) continue;
      const nk = E.stateKey(ns);
      kids.push(nk);
      if (!nodes.has(nk)) { nodes.set(nk, ns); q.push(ns); }
    }
    adj.set(k, kids);
    if (nodes.size > 500000) throw new Error("L" + L + " state-space cap exceeded");
  }

  /* ---- dead = reachable ∧ cannot reach solved ---- */
  const radj = new Map();
  for (const [k, kids] of adj) for (const nk of kids) {
    if (!radj.has(nk)) radj.set(nk, []);
    radj.get(nk).push(k);
  }
  const canSolve = new Set();
  for (const [k, st] of nodes) if (E.isSolved(st, holeCount)) canSolve.add(k);
  const solvedN = canSolve.size;
  {
    const bq = [...canSolve];
    while (bq.length) {
      const k = bq.shift();
      for (const p of (radj.get(k) || [])) if (!canSolve.has(p)) { canSolve.add(p); bq.push(p); }
    }
  }
  const dead = [];
  for (const [k, st] of nodes) if (!canSolve.has(k) && !E.isSolved(st, holeCount)) dead.push(k);

  /* ---- scheduler-dead: the physics-permissive fine-control oracle ---- */
  // Balls indexed by colour; positions fixed at the state's cells; the only
  // search variable is the CAPTURE ORDER (mask-memoised). reach() is 4-dir
  // flood over walls + captured-ball cells; every gate cell is a wall for every
  // ball (entry is modelled as the assisted/occupancy EVENT, and nothing lies
  // beyond a pocket). Uncaptured balls never block (they can move aside).
  function schedulerWinnable(st) {
    const balls = st.marbles.map(m => ({ c: m.c, x: m.x, y: m.y, fixed: m.fixed }));
    const homeOf = {}; for (const h of P.holesArr) homeOf[h.c] = h;
    // a wrong-colour ball INSIDE a sealed pocket can never exit (colour-selective
    // gate = permanent wall for it) → its own home is unfillable → dead now.
    for (const b of balls) {
      if (b.fixed) continue;
      const hc = holesMap[key(b.x, b.y)];
      if (hc !== undefined && hc !== b.c && isPocket[hc]) return false;
    }
    const gatesAll = new Set(P.gates.map(g => key(g.x, g.y)));
    const reach = (fx, fy, blocked) => {
      const seen = new Set([key(fx, fy)]);
      const fq = [[fx, fy]];
      while (fq.length) {
        const [x, y] = fq.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k2 = key(nx, ny);
          if (nx < 0 || nx >= N || ny < 0 || ny >= N || seen.has(k2) || blocked.has(k2) || gatesAll.has(k2)) continue;
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
      memo.set(mask, false);                       // cycle guard
      const bl = blockedFor(mask);
      for (const i of idx) {
        if (mask & (1 << i)) continue;
        const b = balls[i], home = homeOf[b.c];
        let can = false;
        if (!isPocket[b.c]) {                      // open home: roll onto it
          can = reach(b.x, b.y, bl).has(key(home.x, home.y));
        } else {
          const g = gateOf[b.c];
          const selfFin = (b.x === g.x && b.y === g.y) || (b.x === home.x && b.y === home.y);
          if (selfFin) can = true;
          else {
            // approach: any free non-gate neighbour of the gate cell, reachable by b
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
      if (!home || !isPocket[m.c]) return false;                     // open-home ball = helper
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

  /* ---- true deadness: slide-dead ∧ scheduler-dead ---- */
  const trueDead = [], fiction = [];
  for (const k of dead) (schedulerWinnable(nodes.get(k)) ? fiction : trueDead).push(k);

  // soundness cross-check: the scheduler must be MORE permissive than the slide
  // model — any slide-winnable state it calls dead is a scheduler bug.
  let xchkFail = 0;
  {
    const winnable = [...nodes.keys()].filter(k => canSolve.has(k) && !E.isSolved(nodes.get(k), holeCount));
    const step = Math.max(1, Math.floor(winnable.length / 400));
    for (let i = 0; i < winnable.length; i += step)
      if (!schedulerWinnable(nodes.get(winnable[i]))) xchkFail++;
  }

  /* ---- coverage over TRUE dead: immediate / eventual / SILENT ---- */
  const deadSet = new Set(dead);     // signal may be reached through any dead state
  const signal = new Set();          // dead states where a card or the offer fires
  let immCard = 0, immOffer = 0;
  const trueSet = new Set(trueDead);
  for (const k of dead) {
    const st = nodes.get(k);
    const card = fireNoHelper(st) || fireSeal(st);
    if (card && trueSet.has(k)) immCard++;
    else if (!card && fireOffer(st) && trueSet.has(k)) immOffer++;
    if (card || fireOffer(st)) signal.add(k);
  }
  // dead is closed under transitions, so "eventual" = reverse-reach from signal states
  const canSignal = new Set(signal);
  {
    const bq = [...signal];
    while (bq.length) {
      const k = bq.shift();
      for (const p of (radj.get(k) || [])) if (deadSet.has(p) && !canSignal.has(p)) { canSignal.add(p); bq.push(p); }
    }
  }
  const silent = trueDead.filter(k => !canSignal.has(k));
  return {
    L, par: P.par, states: nodes.size, solvedN, deadN: dead.length,
    trueDeadN: trueDead.length, fictionN: fiction.length, xchkFail,
    immCard, immOffer, silent,
    sample: silent.slice(0, 3).map(k => nodes.get(k).marbles.map(m => m.c + "@" + m.x + "," + m.y + (m.fixed ? "*" : "")).join(" ")),
  };
}

const from = +(process.argv[2] || 31), to = +(process.argv[3] || 45);
let anySilent = false, anyXchk = false, t0 = Date.now();
console.log("lvl  par  states  slideDead trueDead fiction | card@now offer@now | SILENT   xchk");
for (let L = from; L <= to; L++) {
  const r = auditLevel(L);
  if (!r) { console.log(String(L).padStart(3) + "  (no gates — skipped)"); continue; }
  const flag = r.silent.length ? "✗ " + r.silent.length + " SILENT" : "✓ 0";
  if (r.silent.length) anySilent = true;
  if (r.xchkFail) anyXchk = true;
  console.log(String(r.L).padStart(3), String(r.par).padStart(4), String(r.states).padStart(7),
    String(r.deadN).padStart(9), String(r.trueDeadN).padStart(8), String(r.fictionN).padStart(7), " |",
    String(r.immCard).padStart(8), String(r.immOffer).padStart(9), " |", flag.padEnd(9),
    r.xchkFail ? "✗ " + r.xchkFail + " SCHEDULER BUG" : "✓");
  for (const s of r.sample) console.log("        silent e.g.:", s);
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s.  ` +
  (anyXchk ? "✗ scheduler cross-check FAILED (called a slide-winnable state dead) — fix the oracle before trusting this audit. "
   : "") +
  (anySilent
    ? "✗ SILENT-STUCK states exist: a player can be PROVABLY dead (even under fine control) with no card and no reachable signal — add a detector or fix the board."
    : "✓ every provably-dead state signals (card now, or card/offer reachable) — no silent stucks."));
process.exit(anySilent || anyXchk ? 1 : 0);
