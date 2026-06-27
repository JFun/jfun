#!/usr/bin/env bash
# Gravity-puzzle self-test (port of Lanthorn's discipline). Run after EVERY code
# change — it is the cost of a code change, not a separate decision.
#   syntax → engine determinism + rules → board solvability/par invariants.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "— syntax —"
for f in web/js/*.js scripts/dev/*.cjs; do
  node --check "$f"
done
echo "ok"

echo "— vendor-sync (web/js/growth-loop.js matches @jfun/growth-loop) —"
node ../../scripts/vendor-sync.mjs --check

echo "— engine tests —"
node scripts/dev/engine-tests.cjs

echo "— board report (solvable + par + mash) —"
node scripts/dev/solver.cjs

echo "ALL TESTS PASSED"
