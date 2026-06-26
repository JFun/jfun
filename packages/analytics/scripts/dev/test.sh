#!/usr/bin/env bash
# @studio/analytics self-test: syntax → inert-by-default + stable event routing.
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "— syntax —"
for f in src/*.js index.js index.mjs scripts/dev/*.cjs; do node --check "$f"; done
echo "ok"
echo "— analytics tests —"
node scripts/dev/analytics-tests.cjs
echo "ALL TESTS PASSED"
