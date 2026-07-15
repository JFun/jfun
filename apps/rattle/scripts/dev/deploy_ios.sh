#!/usr/bin/env bash
# TEMPLATE — one-shot iPhone deploy (Capacitor): self-test → cap sync → cache-bust
# → build → install → launch. Wireless via devicectl (device paired with "Connect
# via network"). Canonical shape from Lanthorn. Copy to <game>/scripts/dev/ and
# fill the three vars below.
#
#   Override config for a clean prod-like build:  APP_CONFIG=Release scripts/dev/deploy_ios.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

# ─── EDIT THESE ────────────────────────────────────────────────────────────────
DEVICE_ID="${APP_DEVICE_ID:-B7CC8868-E918-5043-A37E-32AC17F755E7}"  # xcrun devicectl list devices
BUNDLE_ID="com.jfun.rattle"
# ────────────────────────────────────────────────────────────────────────────────
CONFIG="${APP_CONFIG:-Debug}"
APP="ios/App/build/derived/Build/Products/${CONFIG}-iphoneos/App.app"
# Qi (2026-07-06): ALWAYS deploy as a fresh new user, until further notice —
# uninstall wipes the data container (save/localStorage) so every build boots
# clean. Set FRESH_INSTALL=0 to keep data for a specific run.
FRESH_INSTALL="${FRESH_INSTALL:-1}"

# true (0) if BUNDLE_ID is currently installed on the device. On any query
# failure we assume PRESENT — safer: it forces a retry/abort rather than a
# silent install-over that would keep the old data container.
app_installed() {
  local tmp rc; tmp="$(mktemp)"
  if ! xcrun devicectl device info apps --device "$DEVICE_ID" --json-output "$tmp" >/dev/null 2>&1; then
    rm -f "$tmp"; return 0
  fi
  if /usr/bin/python3 -c "import json,sys;d=json.load(open('$tmp'));sys.exit(0 if '$BUNDLE_ID' in [a.get('bundleIdentifier') for a in d.get('result',{}).get('apps',[])] else 1)"; then
    rc=0; else rc=1; fi
  rm -f "$tmp"; return "$rc"
}

echo "— self-test —"
scripts/dev/test.sh

echo "— cap sync (web → ios/App/App/public) —"
npx cap sync ios 2>&1 | tail -2

# Bust WKWebView's HTTP cache: install-over keeps the data container, so WKWebView
# can serve STALE js/css until the next uninstall. Stamp the BUNDLED index.html's
# asset URLs with a per-build token (web/ stays pristine) so every build is fresh.
echo "— cache-bust bundled assets —"
STAMP="$(date +%s)"
sed -i '' -E 's#(src="js/[a-z/-]+\.js)"#\1?v='"$STAMP"'"#g; s#(href="style\.css)"#\1?v='"$STAMP"'"#g' ios/App/App/public/index.html
echo "  stamped ?v=$STAMP"

echo "— build ($CONFIG) —"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration "$CONFIG" \
  -destination 'generic/platform=iOS' -derivedDataPath ios/App/build/derived \
  -allowProvisioningUpdates build 2>&1 | grep -E "BUILD|error:" | tail -3

if [ "$FRESH_INSTALL" = "1" ]; then
  echo "— uninstall (fresh new-user state) —"
  # Qi standing rule: EVERY deploy boots as a brand-new user. The uninstall wipes
  # the data container (save/localStorage). A transient "Connection reset by peer"
  # can leave the app installed, so retry AND VERIFY it's actually gone — never
  # install-over (that keeps old progress/settings = not a fresh user).
  for i in 1 2 3; do
    xcrun devicectl device uninstall app --device "$DEVICE_ID" "$BUNDLE_ID" 2>&1 | tail -1 || true
    if ! app_installed; then echo "  ✓ confirmed gone — data container wiped"; break; fi
    echo "  still present after attempt $i — retrying"; sleep 3
  done
  if app_installed; then
    echo "  ✗ ABORT: could not confirm uninstall. Installing now would KEEP old data"
    echo "    (not a fresh user). Check the device link (xcrun devicectl list devices) and re-run."
    exit 1
  fi
fi

echo "— install —"
do_install() { xcrun devicectl device install app --device "$DEVICE_ID" "$APP" 2>&1 | tail -2; }
do_install || { echo "install failed (transient?) — retrying once"; sleep 3; do_install; }

echo "— launch —"
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" 2>&1 | tail -1
echo "DEPLOYED ✓"
