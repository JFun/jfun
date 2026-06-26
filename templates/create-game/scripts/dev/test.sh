#!/usr/bin/env bash
# __GameName__ self-test — the cost of a code change. syntax → engine determinism
# golden → every daily winnable with a known par (the invariant that protects the
# loop). Run after every edit.
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "— syntax —"
for f in web/js/*.js scripts/dev/*.cjs; do node --check "$f"; done
echo "ok"
echo "— engine tests —"
node scripts/dev/engine-tests.cjs
echo "ALL TESTS PASSED"
