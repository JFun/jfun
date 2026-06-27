#!/usr/bin/env bash
# Root test runner — fans out to each package's own test.sh. Carries the
# Lanthorn/Moraine discipline up to the monorepo level: syntax → invariants →
# golden. Run after EVERY change (it is the cost of a code change, not a separate
# decision). A package is tested iff it has scripts/dev/test.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

# Vendored browser copies (no-build games inline a package's .js) must match their
# package source — a stale growth-loop.js = two clients with different daily seeds.
echo "═══ vendor-sync drift-check ═══"
if node scripts/vendor-sync.mjs --check; then :; else fail=1; echo "  ✗ vendor copies are stale"; fi
echo

for pkg in packages/*/; do
  t="${pkg}scripts/dev/test.sh"
  if [[ -f "$t" ]]; then
    echo "═══ ${pkg%/} ═══"
    if bash "$t"; then :; else fail=1; echo "  ✗ ${pkg%/} FAILED"; fi
    echo
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "✗ SOME PACKAGE TESTS FAILED"
  exit 1
fi
echo "✓ ALL PACKAGE TESTS PASSED"
