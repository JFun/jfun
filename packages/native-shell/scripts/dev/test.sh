#!/usr/bin/env bash
# @studio/native-shell self-test. It ships TEMPLATES, not runnable JS — so the
# contract is: the shell scripts parse, the plist/config are well-formed, and the
# signing team is the PAID publishing team (Y3T546NP6T), never the free one.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "— shell template parses —"
bash -n templates/deploy_ios.sh
echo "ok"

echo "— required templates present —"
for f in templates/NativeFX.swift templates/deploy_ios.sh templates/ExportOptions.plist templates/capacitor.config.json; do
  [[ -s "$f" ]] || { echo "  ✗ missing/empty: $f"; exit 1; }
done
echo "ok"

echo "— plist / config well-formed —"
plutil -lint templates/ExportOptions.plist >/dev/null 2>&1 || { echo "  ✗ ExportOptions.plist invalid"; exit 1; }
node -e 'JSON.parse(require("fs").readFileSync("templates/capacitor.config.json","utf8"))' || { echo "  ✗ capacitor.config.json invalid JSON"; exit 1; }
echo "ok"

echo "— signing team is the PAID publishing team —"
grep -q "Y3T546NP6T" templates/ExportOptions.plist || { echo "  ✗ wrong/missing teamID"; exit 1; }
echo "ok"

echo "ALL TESTS PASSED"
