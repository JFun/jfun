# <Project> — Prototype Plan (greybox)

## Goal of the greybox
Answer ONE question: <is the core twist actually fun / graspable?> Nothing else.

## Build
No-build HTML (web/ + plain <script> tags). Pull @studio/web-game-core for RNG /
grid / solver. Engine is pure + seedable from day one.

## Validation (before any human test)
- [ ] Solver/bot proves every instance solvable + optimal par (10/10 bot pass).
- [ ] Determinism golden pins same-seed → identical output.
- [ ] test.sh green (syntax → golden → invariants).

## Fun gate
~10 strangers, hands-on. Watch for: graspable in one sentence? fun without
explanation? want to play again / share? (→ handbook/02 Gate 2–3.)

## Kill criteria
If it's not fun or not graspable at self-test, fall back (handbook/00) — don't
polish a failing twist.
