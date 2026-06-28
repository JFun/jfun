#!/usr/bin/env bash
# Lanthorn self-test: syntax, engine invariants, full 60-level bot validation.
# Run after every code change: scripts/dev/test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "— syntax —"
for f in web/js/*.js scripts/dev/*.cjs; do
  node --check "$f"
done
echo "ok"

echo "— engine tests —"
node scripts/dev/engine-tests.cjs

echo "— bot validation (60 levels × 100 runs) —"
node scripts/dev/bot-sim.cjs | tail -3

echo "ALL TESTS PASSED"
