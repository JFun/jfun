#!/usr/bin/env bash
# Quarter — the cost of a code change: syntax + determinism + EXHAUSTIVE
# certification of every level (the {L,R} tree search through the real engine).
# Run after every edit.
set -e
cd "$(dirname "$0")/../.."

echo "— syntax —"
for f in web/js/engine.js web/js/levels.js web/js/game.js; do
  [ -f "$f" ] && node --check "$f" && echo "  ✓ $f"
done

echo "— engine tests —"
node scripts/dev/engine-tests.cjs

echo "— exhaustive level certification —"
node scripts/dev/verify.cjs

echo "ALL TESTS PASSED"
