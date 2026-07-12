#!/usr/bin/env bash
# TestFlight archive + upload (Capacitor / SPM, no CocoaPods).
# Split into two stages so the OUTWARD upload is an explicit, separate command:
#
#   scripts/dev/testflight.sh archive   # local only: self-test → cap sync → cache-bust → archive → verify
#   scripts/dev/testflight.sh upload    # OUTWARD: export the archive → upload to App Store Connect
#
# First upload is (MARKETING_VERSION 1.0, CURRENT_PROJECT_VERSION 1). Before ANY
# re-upload, bump CURRENT_PROJECT_VERSION in BOTH Debug+Release configs of
# ios/App/App.xcodeproj/project.pbxproj (ASC needs a unique version,build pair).
# Team/scheme/plist match docs/handbook/07-app-store-release.md.
set -euo pipefail
cd "$(dirname "$0")/../.."

SCHEME="App"
PROJECT="ios/App/App.xcodeproj"
ARCHIVE="ios/App/build/App.xcarchive"
EXPORT_DIR="ios/App/build/export"
OPTS="scripts/dev/ExportOptions.plist"

case "${1:-}" in
  archive)
    echo "— self-test —"
    scripts/dev/test.sh
    echo "— cap sync (web → ios/App/App/public) —"
    npx cap sync ios 2>&1 | tail -2
    # Same cache-bust as deploy_ios.sh: stamp bundled asset URLs so a TestFlight
    # UPDATE (data container survives) can't serve stale js/css from WKWebView.
    echo "— cache-bust bundled assets —"
    STAMP="$(date +%s)"
    sed -i '' -E 's#(src="js/[a-z/-]+\.js)"#\1?v='"$STAMP"'"#g; s#(href="style\.css)"#\1?v='"$STAMP"'"#g' ios/App/App/public/index.html
    echo "  stamped ?v=$STAMP"
    echo "— archive (Release) —"
    rm -rf "$ARCHIVE"
    xcodebuild archive -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
      -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
      -allowProvisioningUpdates 2>&1 | grep -E "ARCHIVE (SUCCEEDED|FAILED)|error:|Provisioning|Signing Identity" | tail -10
    echo "— verify archive —"
    for k in Team CFBundleShortVersionString CFBundleVersion; do
      printf "  %-28s " "$k"; plutil -extract "ApplicationProperties.$k" raw "$ARCHIVE/Info.plist" 2>/dev/null || echo "?"
    done
    echo "ARCHIVED ✓  →  scripts/dev/testflight.sh upload   (OUTWARD: sends to App Store Connect)"
    ;;
  upload)
    [ -d "$ARCHIVE" ] || { echo "no archive at $ARCHIVE — run 'testflight.sh archive' first"; exit 1; }
    echo "— export + upload to App Store Connect —"
    rm -rf "$EXPORT_DIR"
    xcodebuild -exportArchive -archivePath "$ARCHIVE" \
      -exportOptionsPlist "$OPTS" -exportPath "$EXPORT_DIR" \
      -allowProvisioningUpdates 2>&1 | tail -18
    ;;
  *)
    echo "usage: $0 {archive|upload}"; exit 1;;
esac
