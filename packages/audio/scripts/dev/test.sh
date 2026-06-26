#!/usr/bin/env bash
# @studio/audio self-test: syntax → safe no-op + mute-pref persistence.
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "— syntax —"
for f in src/*.js index.js index.mjs scripts/dev/*.cjs; do node --check "$f"; done
echo "ok"
echo "— audio tests —"
node scripts/dev/audio-tests.cjs
echo "ALL TESTS PASSED"
