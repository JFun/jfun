#!/usr/bin/env bash
# One-shot TestFlight upload (Capacitor, Release): cap sync -> cache-bust -> archive
# (Release) -> export + upload to App Store Connect. Uses Xcode's signed-in Apple ID
# (team Y3T546NP6T, App Manager access) via ExportOptions.plist destination=upload —
# no API key needed. BUMP CURRENT_PROJECT_VERSION in the pbxproj before each upload
# (the (MARKETING_VERSION, CURRENT_PROJECT_VERSION) pair must be unique per upload).
#   node ../../scripts/new-game.mjs stamps __GameName__; edit team/ExportOptions if it differs.
set -euo pipefail
cd "$(dirname "$0")/../.."

ARCHIVE="build/__GameName__.xcarchive"
EXPORT="build/export"

echo "— cap sync (web -> ios/App/App/public) —"
npx cap sync ios 2>&1 | tail -2

echo "— cache-bust bundled assets —"
STAMP="$(date +%s)"
sed -i '' -E 's#(src="js/[a-z/-]+\.js)"#\1?v='"$STAMP"'"#g; s#(href="style\.css)"#\1?v='"$STAMP"'"#g' ios/App/App/public/index.html
echo "  stamped ?v=$STAMP"

echo "— archive (Release) —"
rm -rf "$ARCHIVE"
xcodebuild archive -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates 2>&1 | grep -E "ARCHIVE|BUILD|error:|Signing Identity|Provisioning" | tail -8

echo "— export + upload to App Store Connect —"
rm -rf "$EXPORT"
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist ExportOptions.plist -exportPath "$EXPORT" \
  -allowProvisioningUpdates 2>&1 | tail -12
echo "— done (look for 'Upload succeeded' / '** EXPORT SUCCEEDED **' above) —"
# NOTE: Firebase/Google-framework dSYM 'Upload Symbols Failed' warnings are HARMLESS
# (precompiled, no dSYM). Archive dev-signing may show the FREE team N9DH28SYTB — a
# red herring; the ARCHIVE's team = pbxproj DEVELOPMENT_TEAM and the distribution
# export uses ExportOptions teamID. 'Upload succeeded' == it went to the paid team.
