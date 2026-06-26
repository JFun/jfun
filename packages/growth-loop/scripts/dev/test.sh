#!/usr/bin/env bash
# @studio/growth-loop self-test (the Lanthorn/Moraine discipline):
#   syntax → determinism golden (the contract) → loop behavior + funnel.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "— syntax —"
for f in src/*.js index.js index.mjs scripts/dev/*.cjs; do node --check "$f"; done
echo "ok"

echo "— determinism golden —"
node scripts/dev/golden.cjs

echo "— loop behavior + k-funnel —"
node scripts/dev/loop-tests.cjs

echo "ALL TESTS PASSED"
