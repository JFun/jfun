# Dowse — coding-session guide

A vanilla-JS web game in the `jfun` studio. **No build step** — `web/` runs with
`python3 -m http.server`. Ships to iOS via Capacitor (`com.jfun.dowse`).

## The game

A felt tray hides invisible pegs. Swipe to tilt: all 3 amber marbles roll at once
until they hit a wall, a hidden peg, or each other — any peg a marble bumps is
permanently revealed. Park the marbles into the target formation (anywhere on the
board) within the tilt budget. **No undo**: every tilt is one irreversible decision
that is simultaneously a probe and a move. Ported from `prototypes/11-dowse.html`
(port, don't reimplement — see the studio memory).

**LEVEL CAMPAIGN, not a daily** (the Excavate lesson: this user found one-a-day too
little). `engine.build(level)` derives the board from `seedForLevel(level)`; the ramp
(`rampFor`) scales grid size 6→7→8, peg count, par range, and budget slack down from
+5 to +2 as levels climb. Win → next level; loss → felt lifts (full layout reveal) +
solver ghost replay + Retry.

## Architecture (studio convention)

- `web/js/engine.js` — PURE, deterministic, node-testable. Tilt resolver, BFS
  solver, generator + tiered verifier. **Fairness invariants baked into
  acceptance**: solvable within budget at a known par; pegless-solve must FAIL
  within budget (pegs are load-bearing — edge-slam spam can't win); ≥2 distinct
  optimal openers on strict tiers. Tier ladder relaxes par range → openers →
  pegless-fail, but NEVER solvability.
- `web/js/game.js` — rendering (felt canvas, ghost preview, peg-reveal pop,
  particles), bespoke WebAudio (clack/thunk/pop — kept from the prototype, richer
  than @jfun/audio for this game), input (swipe + d-pad + arrows), level flow,
  share, localStorage progress (`dowse.campaign.v1`).
- `scripts/dev/engine-tests.cjs` — determinism golden + invariants swept across
  levels. Run `bash scripts/dev/test.sh` after EVERY edit.
- `scripts/dev/deploy_ios.sh` — one-shot: self-test → cap sync → cache-bust →
  xcodebuild → devicectl install/launch.

## Discipline (non-negotiable)

- Self-test before "done"; UI changes need a real render (serve `web/` and look).
- Determinism is sacred: same level → identical board for everyone.
- Never ship an unsolvable level — the tiered verifier + tests are the guard.
- iOS shell cloned from Excavate's known-good SPM project; team `Y3T546NP6T`.
