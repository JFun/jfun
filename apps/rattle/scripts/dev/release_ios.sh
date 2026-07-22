#!/usr/bin/env bash
# One command: ship a new App Store build (Capacitor iOS).
#   self-test → bump build → cap sync → cache-bust → archive → export + upload to ASC.
#
# ACCOUNT-INDEPENDENT by design: signs with the local Apple Distribution cert + the
# "Rattle App Store" profile, and authenticates the UPLOAD with the ASC API key (.p8)
# via xcodebuild's -authenticationKey* flags. No Xcode-account sign-in, so it dodges
# the "Failed to Use Accounts" / cloud-signing errors that bit the first upload.
#
# One-time prereqs (durable — see memory/rattle-app.md for how they were minted):
#   • Apple Distribution cert in the login keychain (team Y3T546NP6T)
#   • Provisioning profile "Rattle App Store" installed (com.jfun.rattle · App Store)
#   • ASC API key at ~/.appstoreconnect/private_keys/AuthKey_<keyId>.p8
#   • scripts/dev/.asc-config.json  →  {"keyId","issuerId","appId"}  (gitignored)
#
# Usage:  scripts/dev/release_ios.sh          (bumps build, uploads)
#         SKIP_TESTS=1 scripts/dev/release_ios.sh   (skip the self-test gate)
set -euo pipefail
cd "$(dirname "$0")/../.."

TEAM_ID="Y3T546NP6T"
BUNDLE_ID="com.jfun.rattle"
SCHEME="App"
PROFILE="Rattle App Store"
PROJ="ios/App/App.xcodeproj"
PBXPROJ="ios/App/App.xcodeproj/project.pbxproj"
ARCHIVE="ios/App/build/Rattle.xcarchive"
EXPORT_DIR="ios/App/build/export"
CFG="scripts/dev/.asc-config.json"

# ─── ASC identifiers (issuerId/keyId are IDs, not secrets; only the .p8 is secret) ───
[ -f "$CFG" ] || { echo "✗ missing $CFG (see .asc-config.example.json)"; exit 1; }
KEY_ID="$(python3 -c "import json;print(json.load(open('$CFG'))['keyId'])")"
ISSUER_ID="$(python3 -c "import json;print(json.load(open('$CFG'))['issuerId'])")"
P8="$HOME/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8"
[ -f "$P8" ] || { echo "✗ missing API key $P8"; exit 1; }

# ─── 0. self-test gate (106-level cert + engine tests) — a release must never regress ──
if [ "${SKIP_TESTS:-0}" != "1" ]; then
  echo "— self-test —"
  scripts/dev/test.sh
fi

# ─── 1. bump CURRENT_PROJECT_VERSION on every config (Debug + Release must stay in lockstep) ──
CUR="$(grep -m1 -E 'CURRENT_PROJECT_VERSION = [0-9]+;' "$PBXPROJ" | grep -oE '[0-9]+' | head -1)"
NEXT=$((CUR + 1))
sed -i '' -E "s/CURRENT_PROJECT_VERSION = ${CUR};/CURRENT_PROJECT_VERSION = ${NEXT};/g" "$PBXPROJ"
MKT="$(grep -m1 -E 'MARKETING_VERSION = ' "$PBXPROJ" | grep -oE '[0-9]+(\.[0-9]+)+' | head -1)"
echo "— build ${MKT} (${CUR} → ${NEXT}) —"

# ─── 2. sync web → ios public ──
echo "— cap sync (web → ios/App/App/public) —"
npx cap sync ios 2>&1 | tail -2

# ─── 3. cache-bust bundled assets (WKWebView serves stale js/css over an install otherwise) ──
STAMP="$(date +%s)"
sed -i '' -E 's#(src="js/[a-z/-]+\.js)"#\1?v='"$STAMP"'"#g; s#(href="style\.css)"#\1?v='"$STAMP"'"#g' ios/App/App/public/index.html
echo "— cache-bust ?v=$STAMP —"

# ─── 4. archive (Release, MANUAL Apple Distribution signing — no Xcode account needed) ──
echo "— archive —"
rm -rf "$ARCHIVE"
xcodebuild archive \
  -project "$PROJ" -scheme "$SCHEME" -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  PROVISIONING_PROFILE_SPECIFIER="$PROFILE" \
  2>&1 | grep -E "ARCHIVE (SUCCEEDED|FAILED)|error:" | tail -5
[ -d "$ARCHIVE" ] || { echo "✗ archive failed (see full log above)"; exit 1; }

# ─── 5. ExportOptions: manual signing + upload-via-API-key ──
cat > ios/App/build/ExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>${TEAM_ID}</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key><dict><key>${BUNDLE_ID}</key><string>${PROFILE}</string></dict>
  <key>uploadSymbols</key><true/>
  <key>stripSwiftSymbols</key><true/>
</dict></plist>
PLIST

# ─── 6. export + upload (authenticated by the .p8 API key, not an Xcode account) ──
echo "— export + upload —"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist ios/App/build/ExportOptions.plist \
  -exportPath "$EXPORT_DIR" \
  -authenticationKeyPath "$P8" \
  -authenticationKeyID "$KEY_ID" \
  -authenticationKeyIssuerID "$ISSUER_ID" \
  2>&1 | grep -E "EXPORT (SUCCEEDED|FAILED)|Upload (succeeded|failed)|error:|Progress" | tail -8

echo "✓ RELEASED — build ${MKT} (${NEXT}) uploading to App Store Connect (processing ~5–15 min)."
echo "  Attach it to the version + submit:  node scripts/dev/asc-api.cjs build   then   ... submit"
