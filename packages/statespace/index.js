/* @jfun/statespace — verification Layer 3, packaged. "The solver": enumerate a
   game's reachable state graph, PROVE which states are dead (can never reach a
   goal), filter through a game-supplied physics-permissive oracle, and audit
   that every truly-dead state is DETECTED by the game (a card fires, or one is
   reachable) — the "silent stuck" class that otherwise only human play finds.

   Born from Tilt's L37 saga (docs/handbook/10-verification.md): four device-
   found bugs in a week, each catchable by this audit + its sibling layers.

   THE DIRECTION RULE (why the oracle exists): a discrete/cell abstraction of a
   continuous engine errs BOTH ways. Its "winnable" has certified false wins;
   its "dead" calls states dead that a player wins with fine control (stopping
   mid-board). So graph-dead is only a CANDIDATE: the game supplies
   `oracleWinnable`, a model strictly MORE permissive than its physics, and only
   states dead even under the oracle count as truly dead. The audit cross-checks
   the oracle against the graph (any graph-winnable state the oracle calls dead
   = an oracle bug) and reports it as a failure of the audit itself.
   Games whose graph IS the real engine (e.g. Quarter's {L,R} full-engine
   settles) simply omit the oracle — deadness is exact.

   GameAdapter contract (all state values are opaque to this package):
     initial()            -> state
     moves(state)         -> move[]            (moves may depend on the state)
     apply(state, move)   -> state | null      (null = illegal / no-op; must NOT mutate its input)
     stateKey(state)      -> string            (dedup key)
     isGoal(state)        -> bool
     oracleWinnable(state)-> bool              OPTIONAL permissive oracle (see above)
     detectors: {
       card(state)  -> bool                    the game's definitive verdict UI
       offer(state) -> bool                    OPTIONAL softer signal (e.g. a restart offer)
     }

   audit(adapter, opts) -> {
     states, goalN,                     graph size / raw goal states
     deadN, trueDeadN, fictionN,        graph-dead / oracle-confirmed / oracle-recoverable
     xchkFail,                          oracle cross-check failures (MUST be 0 to trust the run)
     immCard, immOffer,                 truly-dead states signalling immediately
     silent,                            truly-dead state keys from which NO signal is ever reachable
     state(key) -> state                lookup for reporting silent samples
   }
   opts: { maxStates (default 500k, throws over), xchkSample (default 400) } */
"use strict";

function audit(adapter, opts) {
  opts = opts || {};
  const maxStates = opts.maxStates || 500000;
  const key = adapter.stateKey;

  /* ---- enumerate the reachable graph ---- */
  const init = adapter.initial();
  const nodes = new Map([[key(init), init]]);
  const adj = new Map();
  const q = [init];
  while (q.length) {
    const st = q.shift(), k = key(st);
    if (adj.has(k)) continue;
    const kids = [];
    for (const mv of adapter.moves(st)) {
      const ns = adapter.apply(st, mv);
      if (!ns) continue;
      const nk = key(ns);
      kids.push(nk);
      if (!nodes.has(nk)) { nodes.set(nk, ns); q.push(ns); }
    }
    adj.set(k, kids);
    if (nodes.size > maxStates) throw new Error("@jfun/statespace: state cap exceeded (" + maxStates + ")");
  }
  const radj = new Map();
  for (const [k, kids] of adj) for (const nk of kids) {
    if (!radj.has(nk)) radj.set(nk, []);
    radj.get(nk).push(k);
  }

  /* ---- dead = reachable ∧ cannot reach a goal ---- */
  const canGoal = new Set();
  for (const [k, st] of nodes) if (adapter.isGoal(st)) canGoal.add(k);
  const goalN = canGoal.size;
  {
    const bq = [...canGoal];
    while (bq.length) {
      const k = bq.shift();
      for (const p of (radj.get(k) || [])) if (!canGoal.has(p)) { canGoal.add(p); bq.push(p); }
    }
  }
  const dead = [];
  for (const [k, st] of nodes) if (!canGoal.has(k) && !adapter.isGoal(st)) dead.push(k);

  /* ---- oracle filter + soundness cross-check ---- */
  const oracle = adapter.oracleWinnable;
  const trueDead = [], fiction = [];
  for (const k of dead) ((oracle && oracle(nodes.get(k))) ? fiction : trueDead).push(k);
  let xchkFail = 0;
  if (oracle) {
    const winnable = [...nodes.keys()].filter(k => canGoal.has(k) && !adapter.isGoal(nodes.get(k)));
    const step = Math.max(1, Math.floor(winnable.length / (opts.xchkSample || 400)));
    for (let i = 0; i < winnable.length; i += step)
      if (!oracle(nodes.get(winnable[i]))) xchkFail++;
  }

  /* ---- detector coverage over the truly dead: immediate / eventual / SILENT ----
     dead is closed under transitions (a successor of a dead state is dead), so a
     signal is "eventually reachable" iff the state reverse-reaches a signalling
     dead state. Signals on FICTION dead states still count as reachable signals
     (a wandering player passes through them). ---- */
  const det = adapter.detectors || {};
  const cardFn = det.card || (() => false), offerFn = det.offer || (() => false);
  const deadSet = new Set(dead), trueSet = new Set(trueDead);
  const signal = new Set();
  let immCard = 0, immOffer = 0;
  for (const k of dead) {
    const st = nodes.get(k);
    const card = cardFn(st);
    const offer = !card && offerFn(st);
    if (trueSet.has(k)) { if (card) immCard++; else if (offer) immOffer++; }
    if (card || offer) signal.add(k);
  }
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
    states: nodes.size, goalN,
    deadN: dead.length, trueDeadN: trueDead.length, fictionN: fiction.length,
    xchkFail, immCard, immOffer, silent,
    state: k => nodes.get(k),
  };
}

module.exports = { audit };
