#!/usr/bin/env bash
# @studio/web-game-core self-test: syntax → RNG determinism golden → grid/line
# primitives → BFS solver scaffold on a tiny reference game.
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "— syntax —"
for f in src/*.js index.js index.mjs scripts/dev/*.cjs; do node --check "$f"; done
echo "ok"
echo "— core tests —"
node scripts/dev/core-tests.cjs
echo "ALL TESTS PASSED"
