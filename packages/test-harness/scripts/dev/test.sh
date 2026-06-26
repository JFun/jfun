#!/usr/bin/env bash
# @studio/test-harness self-test (meta): the helpers must count/pin/detect correctly.
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "— syntax —"
for f in src/*.js scripts/dev/*.cjs; do node --check "$f"; done
echo "ok"
echo "— harness meta-tests —"
node scripts/dev/harness-tests.cjs
echo "ALL TESTS PASSED"
