#!/usr/bin/env bash
# CUT self-test — the cost of a code change. syntax → solvability/liveness of all
# 8 levels driven through the REAL ported physics in headless Chrome. Run after
# every edit (global CLAUDE.md: run it before claiming done).
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "— syntax —"
for f in web/js/*.js web/js/vendor/*.js scripts/dev/*.cjs; do node --check "$f"; done
echo "ok"
echo "— sim tests (headless Chrome: build + solvability + liveness) —"
node scripts/dev/sim-tests.cjs
echo "— fairness certify (headless Chrome: every level winnable in the seeded cut sweep) —"
node scripts/dev/fairness.cjs
echo "ALL TESTS PASSED"
