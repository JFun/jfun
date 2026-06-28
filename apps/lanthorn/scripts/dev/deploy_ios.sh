#!/usr/bin/env bash
# Lanthorn one-shot iPhone deploy (Capacitor): test → cap sync → build → install → launch.
# Wireless via devicectl (device paired with "Connect via network").
# Config defaults to Debug (dev loop, ships the ≡ dev panel via #if DEBUG).
# Override for a clean production-like build:  LANTHORN_CONFIG=Release scripts/dev/deploy_ios.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

DEVICE_ID="${LANTHORN_DEVICE_ID:-B7CC8868-E918-5043-A37E-32AC17F755E7}"  # iPhone 13 Pro
BUNDLE_ID="com.jfun.lanthorn"
CONFIG="${LANTHORN_CONFIG:-Debug}"
APP="ios/App/build/derived/Build/Products/${CONFIG}-iphoneos/App.app"

echo "— self-test —"
scripts/dev/test.sh

echo "— cap sync (web → ios/App/App/public) —"
npx cap sync ios 2>&1 | tail -2

# Bust WKWebView's HTTP cache: an install-over keeps the app's data container, so
# WKWebView can serve STALE js/css (URLs unchanged) until the next uninstall —
# that's how a code fix can "not take" on device. Stamp the BUNDLED index.html's
# asset URLs with a per-build token (web/ stays pristine) so every build is fresh.
echo "— cache-bust bundled assets —"
STAMP="$(date +%s)"
sed -i '' -E 's#(src="js/[a-z-]+\.js)"#\1?v='"$STAMP"'"#g; s#(href="style\.css)"#\1?v='"$STAMP"'"#g' ios/App/App/public/index.html
echo "  stamped ?v=$STAMP"

echo "— build ($CONFIG) —"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration "$CONFIG" \
  -destination 'generic/platform=iOS' -derivedDataPath ios/App/build/derived \
  -allowProvisioningUpdates build 2>&1 | grep -E "BUILD|error:" | tail -3

echo "— install —"
do_install() { xcrun devicectl device install app --device "$DEVICE_ID" "$APP" 2>&1 | tail -2; }
do_install || { echo "install failed (transient?) — retrying once"; sleep 3; do_install; }

echo "— launch —"
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" 2>&1 | tail -1
echo "DEPLOYED ✓"
