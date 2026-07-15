#!/usr/bin/env bash
# Rattle — syntax + determinism + physics-faithful certification of every level
# (beam search through the real circle engine). Run after every edit.
set -e
cd "$(dirname "$0")/../.."
echo "— syntax —"
for f in web/js/engine.js web/js/levels.js web/js/game.js; do
  [ -f "$f" ] && node --check "$f" && echo "  ✓ $f"
done
echo "— engine tests —"
node scripts/dev/engine-tests.cjs
echo "— physics-faithful level certification —"
node scripts/dev/verify.cjs
echo "ALL TESTS PASSED"
