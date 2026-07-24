#!/usr/bin/env bash
# @jfun/difficulty — syntax + curve-math + generation-framework tests. The
# harness/report are additionally proven per-game by the adapter dogfood
# (e.g. apps/rattle/scripts/dev/difficulty-dogfood.cjs + gen-dogfood.cjs).
set -e
cd "$(dirname "$0")/../.."
echo "— syntax —"
for f in src/curve.js src/cadence.js src/pool.js src/harness.js src/report.js src/campaign.js index.js; do node --check "$f" && echo "  ✓ $f"; done
echo "— curve-math unit tests —"
node scripts/dev/curve-tests.cjs
echo "— generation-framework tests (toy game) —"
node scripts/dev/campaign-tests.cjs
echo "ALL TESTS PASSED"
