# Verification layers — machines find the logical bugs, humans keep the feel

Born from the Tilt L37 saga (2026-07): four device-found bugs in one week —
a vanishing ball, a "looks complete, won't win" capture freeze, and two
silent dead-ends — each of which a machine layer could have caught first. The
goal of this net: **a human tester should only ever discover *feel* bugs.**

## The four machine layers

Each answers a different question about a level; together they bracket the game.

| # | Layer | Question | Tool shape | Tilt reference |
|---|---|---|---|---|
| 1 | **Winnability certification** | Can it be beaten at all? | Search the REAL engine for one winning line; also prove mechanics load-bearing (board must FAIL with the mechanic removed) | `apps/tilt/scripts/dev/certify.cjs` |
| 2 | **Invariant fuzzing** | Can any play sequence break the engine? | Seeded random input over the real physics, invariants asserted EVERY step (in-bounds, finite, captured⟹own-hole, settled-on-own-hole⟹captured) | `fuzz-tests.cjs` (bounded, in test.sh) + deep scratch fuzz |
| 3 | **Dead-state coverage audit** | If the player is hopeless, does the game KNOW? | Enumerate reachable states, prove the dead set, assert every dead state fires a detector (card/offer) | `deadend-audit.cjs` (in test.sh) |
| 4 | **Bot-play at volume** | Is it TUNED right on realistic paths? | Bot policies × N rollouts → win-rates, solve-times, grade thresholds ([09-difficulty](09-difficulty.md)) | `difficulty.cjs` + `@jfun/difficulty` |

One-line contrast: **1** proves a good path exists · **2** proves no path breaks
the engine (sampled) · **3** proves every bad path is detected (exhaustive) ·
**4** measures what typical paths feel like. A level passing all four can still
*feel* wrong — that residue is the human's whole job.

## The direction rule (what makes cheap models sound)

A discrete/cell abstraction of a continuous engine errs in BOTH directions
(Tilt shipped three bugs where the cell model said "winnable" and the physics
said no — and its slide model calls states "dead" that a player wins by
stopping mid-board). You can still use cheap models, but only pointed the
sound way:

- **"This state is DEAD"** → prove it in a model **strictly MORE permissive**
  than physics (free escapes, stop-anywhere fine control, ignore simultaneity).
  If even that model can't win, no play can. Tilt's audit uses a fine-control
  scheduler oracle for exactly this.
- **"This level is WINNABLE"** → demonstrate it in the **real engine** (a
  concrete input line). Never trust the cell model's yes.
- **Never both directions from the same model.** That's the self-hold /
  bankable-gate trap ([09-difficulty](09-difficulty.md) scars).
- **Cross-check the oracle**: any state the real-model search can win must be
  winnable by the permissive oracle — a violation is an oracle bug, and the
  audit should fail loudly on it (this caught a colour-rule mismatch on day one).
- Best of all is a **structural counting proof** (e.g. "the last gated ball can
  have no plate-holder") — model-independent, cannot false-fire, and the only
  honest basis for a definitive in-game "DEAD END" verdict. Solver-guessed
  deadness only ever warrants a non-destructive restart *offer*.

## Adopting in a new game

1. Ship Layer 1 first — never let a human play an uncertified level (standing
   studio rule since the prototype rounds).
2. Add Layer 2 the first time the game has continuous state: fuzz + the
   invariant list, grown by converting EVERY human-found bug into a permanent
   invariant (that's the real spec-mining loop).
3. Add Layer 3 the moment a mechanic can make progress irreversible (captures,
   consumed resources, one-way doors): enumerate, prove dead, assert detection.
4. Layer 4 when tuning difficulty/grades ([09-difficulty](09-difficulty.md)).

Wire 2 and 3 into the game's `test.sh` (bounded, seconds); keep the deep
versions as dev tools. Cut/Rattle/Quarter each have Layer 1 (+4 for Rattle);
their Layers 2–3 are open ports of the Tilt reference.
