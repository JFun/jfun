#!/usr/bin/env bash
# Lanthorn -> TestFlight / App Store. One shot: self-test -> bump build -> cap sync
# + cache-bust -> archive (Release, distribution-signed) -> export & upload via
# Xcode's signed-in Apple ID (destination=upload, no API key). Team Y3T546NP6T,
# bundle com.jfun.lanthorn. ExportOptions.plist lives at repo root.
#
# Each run auto-increments CURRENT_PROJECT_VERSION (ASC needs a unique build per
# upload) — commit the pbxproj bump afterward. (MARKETING_VERSION bump is manual.)
set -uo pipefail   # not -e: xcodebuild success is checked via its log
cd "$(dirname "$0")/../.."

PROJ="ios/App/App.xcodeproj"; PBX="$PROJ/project.pbxproj"
ARCHIVE="build/Lanthorn.xcarchive"; EXPORT="build/export"

echo "— self-test —"; scripts/dev/test.sh || exit 1

echo "— bump build number —"
CUR=$(grep -m1 'CURRENT_PROJECT_VERSION = ' "$PBX" | grep -oE '[0-9]+' | head -1)
NEXT=$((CUR + 1))
sed -i '' -E "s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = $NEXT;/g" "$PBX"
echo "  build $CUR -> $NEXT  (commit the pbxproj change after a successful upload)"

echo "— cap sync + cache-bust bundled assets —"
npx cap sync ios >/dev/null 2>&1
STAMP="$(date +%s)"
sed -i '' -E 's#(src="js/[a-z-]+\.js)"#\1?v='"$STAMP"'"#g; s#(href="style\.css)"#\1?v='"$STAMP"'"#g' ios/App/App/public/index.html

echo "— archive (Release, distribution-signed) —"
rm -rf "$ARCHIVE"
xcodebuild archive -project "$PROJ" -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates 2>&1 | tee /tmp/tf_archive.log | grep -E "ARCHIVE SUCCEEDED|error:" || true
grep -q "ARCHIVE SUCCEEDED" /tmp/tf_archive.log || { echo "  ✗ archive failed — see /tmp/tf_archive.log"; exit 1; }

echo "— export + upload to App Store Connect —"
rm -rf "$EXPORT"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist ExportOptions.plist \
  -exportPath "$EXPORT" -allowProvisioningUpdates 2>&1 | tee /tmp/tf_export.log \
  | grep -iE "Upload succeeded|EXPORT (SUCCEEDED|FAILED)|error:|Invalid bundle" || true
if grep -q "EXPORT SUCCEEDED" /tmp/tf_export.log; then
  echo "  ✓ build $NEXT uploaded. Apple processes it ~5-15 min, then it shows in TestFlight."
  echo "    Commit the build-number bump (ios/App/App.xcodeproj/project.pbxproj)."
else
  echo "  ✗ upload failed — see /tmp/tf_export.log"; exit 1
fi
