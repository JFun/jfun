#!/usr/bin/env bash
# Tilt self-test — the cost of a code change. syntax → engine determinism golden →
# every level BFS-solvable at its stored par (the fairness contract). Run after
# every edit.
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "— syntax —"
for f in web/js/*.js scripts/dev/*.cjs; do node --check "$f"; done
echo "ok"
echo "— engine tests —"
node scripts/dev/engine-tests.cjs
echo "— physics tests —"
node scripts/dev/physics-tests.cjs
echo "ALL TESTS PASSED"
