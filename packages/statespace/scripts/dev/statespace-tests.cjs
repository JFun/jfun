/* @jfun/statespace self-tests — toy graphs that pin every audit behaviour:
   reachable enumeration, dead-set proof, oracle fiction split, the oracle
   soundness cross-check, and immediate/eventual/SILENT detector coverage. */
const { harness } = require("@jfun/test-harness");
const { audit } = require("../../index.js");
const t = harness("statespace");

/* Toy 1 — a corridor with a pit. States are integers 0..5; moves +1/-1; 5 is
   the goal; entering 9 (the pit, from 2) is a one-way dead branch 9→8→7 (cycle
   7→8). Detector: card fires at 7 only. So pit states: 9 (eventual — reaches 7),
   8 (eventual), 7 (immediate). No oracle → all graph-dead are trueDead. */
function corridor(detectorAt) {
  return {
    initial: () => 0,
    moves: () => ["a", "b"],
    apply: (s, mv) => {
      if (s === 2 && mv === "b") return 9;                  // fall in the pit
      if (s === 9) return mv === "a" ? 8 : null;
      if (s === 8) return mv === "a" ? 7 : null;
      if (s === 7) return mv === "a" ? 8 : null;            // 7↔8 cycle, no escape
      if (mv === "a") return s < 5 ? s + 1 : null;
      return s > 0 ? s - 1 : null;
    },
    stateKey: s => String(s),
    isGoal: s => s === 5,
    detectors: { card: s => detectorAt.includes(s) },
  };
}
t.section("dead-set proof + coverage");
{
  const r = audit(corridor([7]));
  t.eq("corridor: states", r.states, 9);                    // 0..5 + 9,8,7
  t.eq("corridor: dead set is the pit", r.deadN, 3);
  t.eq("corridor: no oracle → all dead are true", r.trueDeadN, 3);
  t.eq("corridor: card fires immediately at 7", r.immCard, 1);
  t.eq("corridor: 8 and 9 reach the card — not silent", r.silent.length, 0);
}
{
  const r = audit(corridor([]));                            // no detector at all
  t.eq("no detector → every dead state is SILENT", r.silent.length, 3);
}
{
  // detector on a state the pit can NEVER reach → still silent
  const r = audit(corridor([4]));
  t.eq("detector outside the dead subgraph → pit still SILENT", r.silent.length, 3);
}

t.section("oracle fiction split + soundness cross-check");
{
  // oracle says 9 is recoverable (fine control climbs out) → fiction, not gated;
  // 8 and 7 stay truly dead; card at 7 covers both (8 reaches 7)
  const a = corridor([7]);
  a.oracleWinnable = s => s === 9 || ![7, 8, 9].includes(s);
  const r = audit(a);
  t.eq("oracle-recoverable state is FICTION", r.fictionN, 1);
  t.eq("remaining true dead", r.trueDeadN, 2);
  t.eq("sound oracle → cross-check clean", r.xchkFail, 0);
  t.eq("still no silent", r.silent.length, 0);
}
{
  // a BROKEN oracle that calls winnable state 3 dead → cross-check must catch it
  const a = corridor([7]);
  a.oracleWinnable = s => s !== 3 && ![7, 8, 9].includes(s);
  const r = audit(a);
  t.ok("broken oracle caught by cross-check", r.xchkFail > 0);
}

t.section("guards");
{
  let threw = false;
  try { audit(corridor([7]), { maxStates: 4 }); } catch (e) { threw = true; }
  t.ok("state cap throws instead of hanging", threw);
}
{
  // apply() must not mutate: object states with structural keys
  const a = {
    initial: () => ({ n: 0 }),
    moves: () => [1],
    apply: (s) => s.n < 3 ? { n: s.n + 1 } : null,
    stateKey: s => "s" + s.n,
    isGoal: s => s.n === 3,
    detectors: {},
  };
  const r = audit(a);
  t.eq("object states enumerate", r.states, 4);
  t.eq("no dead states in a clean chain", r.deadN, 0);
}

process.exit(t.summary());
