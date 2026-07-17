#!/usr/bin/env bash
# @jfun/difficulty — syntax + curve-math unit tests. The harness/report are proven
# per-game by the adapter dogfood (e.g. apps/rattle/scripts/dev/difficulty-dogfood.cjs).
set -e
cd "$(dirname "$0")/../.."
echo "— syntax —"
for f in src/curve.js src/harness.js src/report.js index.js; do node --check "$f" && echo "  ✓ $f"; done
echo "— curve-math unit tests —"
node scripts/dev/curve-tests.cjs
echo "ALL TESTS PASSED"
