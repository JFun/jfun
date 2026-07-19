#!/usr/bin/env bash
# Tilt self-test — the cost of a code change. The four machine verification layers
# (docs/handbook/09-difficulty.md + the L37 saga):
#   syntax → engine determinism/fairness (incl. Layer 1 pars) → physics unit tests
#   → Layer 2 physics fuzz (invariants under seeded random play)
#   → Layer 3 dead-end coverage audit (every provably-dead state must signal)
# Layer 1's full continuous certifier (certify.cjs) runs when pinning new worlds;
# Layer 4 (difficulty measurement) is scripts/dev/difficulty.cjs. Run after every edit.
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "— syntax —"
for f in web/js/*.js scripts/dev/*.cjs; do node --check "$f"; done
echo "ok"
echo "— engine tests —"
node scripts/dev/engine-tests.cjs
echo "— physics tests —"
node scripts/dev/physics-tests.cjs
echo "— physics fuzz (Layer 2: invariants under random play) —"
node scripts/dev/fuzz-tests.cjs
echo "— dead-end coverage audit (Layer 3: every provably-dead state signals) —"
node scripts/dev/deadend-audit.cjs
echo "ALL TESTS PASSED"
