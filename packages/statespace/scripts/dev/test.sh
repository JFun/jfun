#!/usr/bin/env bash
# @jfun/statespace self-test — syntax + toy-graph audit behaviour pins.
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "— syntax —"
node --check index.js
node --check scripts/dev/statespace-tests.cjs
echo "ok"
echo "— statespace tests —"
node scripts/dev/statespace-tests.cjs
echo "ALL TESTS PASSED"
