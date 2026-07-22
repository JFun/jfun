#!/usr/bin/env bash
# Verify Firebase Analytics end-to-end on device: relaunch the INSTALLED app with
# Firebase debug logging so events stream live to Firebase DebugView.
#
#   scripts/dev/deploy_ios.sh        # install first (fresh build with the SDK)
#   scripts/dev/firebase_debug.sh    # then this — relaunches in debug mode
#   → open the DebugView URL below and tap through the app; events appear in
#     seconds with their params (app_open, level_start, level_complete, …).
#
# ⚠ GOTCHA codified here: devicectl parses a leading-dash launch arg as its OWN
# option ("Error: Missing value for '-l <path>'"), so the `--` separator before the
# bundle id is REQUIRED to pass -FIRDebugEnabled through to the app. Debug mode then
# persists on the device until a relaunch with -FIRDebugDisabled.
set -euo pipefail
DEVICE_ID="${APP_DEVICE_ID:-B7CC8868-E918-5043-A37E-32AC17F755E7}"  # xcrun devicectl list devices
BUNDLE_ID="com.jfun.rattle"
PROJECT="rattle-jfun"

xcrun devicectl device process launch --terminate-existing --device "$DEVICE_ID" \
  -- "$BUNDLE_ID" -FIRDebugEnabled 2>&1 | grep -ivE "provisioning paramter|No provider" | tail -2
echo "✓ relaunched with Firebase debug ON"
echo "  watch → https://console.firebase.google.com/project/${PROJECT}/analytics/debugview"
echo "  (turn off later with: … process launch … -- ${BUNDLE_ID} -FIRDebugDisabled)"
