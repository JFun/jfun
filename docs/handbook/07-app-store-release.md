# App Store release — the whole pipeline (web/Capacitor games)

The evergreen playbook for taking a jfun game from "runs on device" to "submitted for
App Review." Established shipping **Tilt v1.0** (2026-07-05). `templates/create-game`
already carries the scripts below, so a scaffolded game inherits most of this.

Team: **`Y3T546NP6T`** (Qili Chen — the PAID publishing team; the free `N9DH28SYTB`
personal team can NOT publish and is a recurring red herring). Studio support email:
`jayfunlin@gmail.com`.

---

## 1. Analytics — use `@jfun/analytics`, do NOT reinvent

The studio already has a canonical analytics module: **`@jfun/analytics`** (UMD global
`Track`, vendored into `web/js/vendor/analytics.js` by `new-game.mjs`). It routes
`Track.ev(name, params)` to **Firebase** on native (`@capacitor-firebase/analytics`) and
**gtag** on web — one API, both platforms. It's inert until `Track.init({ gaId })` is
called (or running native), and inert inside the legacy iOS shell so device tests never
pollute the web cohort.

- Call `Track.init({ gaId: "G-…" })` once at startup (omit `gaId` → web stays inert).
- Log with `Track.ev("level_start", { level })`. **Keep event names stable** — dashboards
  depend on them.
- Do NOT hand-roll a `track()` wrapper. (Tilt did this and diverged; migrate it to
  `Track.ev` in a future update.)

## 2. Firebase wiring (per app)

1. In the app's package.json add `@capacitor-firebase/analytics` + `@capacitor-firebase/app`
   (`^8.3.0`). `cap sync` auto-wires `CapApp-SPM/Package.swift` + the ios `packageClassList`.
2. `@capacitor-firebase/app`'s `FirebaseAppPlugin.swift` calls `FirebaseApp.configure()` on
   load — **no AppDelegate change**.
3. Register the iOS app + fetch its config via the **Firebase CLI** (no console needed):
   ```
   firebase apps:create IOS "<App>" --bundle-id com.jfun.<app> --project <proj>
   firebase apps:sdkconfig IOS <appId> --project <proj> --out ios/App/App/GoogleService-Info.plist
   ```
   (Firebase iOS API keys are public-by-design / bundle-restricted — safe to commit.
   `IS_ANALYTICS_ENABLED=false` inside the plist is a **legacy** flag — leave it; it does
   NOT control collection.)
4. **⚠ Wire the plist into the Xcode target BY HAND — `cap sync` does NOT do this.** Add 4
   fragments to `App.xcodeproj/project.pbxproj` (reuse the UUIDs `F1AE…0001/0002`): a
   `PBXFileReference`, a `PBXBuildFile`, the file in the **App** `PBXGroup` children, and
   the build file in the `PBXResourcesBuildPhase`. Without this the plist isn't bundled →
   `FirebaseApp.configure()` finds nothing at runtime. Mirror a sibling app's pbxproj.
5. **⚠ Enable Google Analytics on the project — console-only, no `firebase` command:**
   `console.firebase.google.com/project/<proj>/analytics` → Enable / link a GA property.
   Until this is done the SDK logs events into the void (no GA4 property to land in).
6. Auto-events (sessions, retention, first_open) flow for free; add custom funnel events
   via `Track.ev`. dSYM "Upload Symbols Failed" warnings for Firebase/Google frameworks at
   upload are HARMLESS (precompiled, no dSYM).
7. **Verify end-to-end on device** with `scripts/dev/firebase_debug.sh` (deploy first): it
   relaunches with `-FIRDebugEnabled` so events stream to Firebase **DebugView** with their
   params. ⚠ the `--` separator before the bundle id is REQUIRED or `devicectl` misparses
   the flag (`Missing value for '-l'`).

## 3. Support + Privacy pages — hosted IN-MONOREPO

The old per-app standalone repos (`JFun/moraine` etc.) are **deprecated**. Host in `jfun`:
- Pages are enabled on `JFun/jfun` (public repo → free Pages) from **`main` / `/docs`**,
  base `https://jfun.github.io/jfun/`. `docs/.nojekyll` serves files static.
- Put an app's pages at **`docs/<app>/{support,privacy,index}.html`** → URLs
  `https://jfun.github.io/jfun/<app>/support.html` + `/privacy.html`.
- Start from `templates/create-game/docs/{support,privacy}.html` (dark theme, Firebase
  disclosure baked in). The privacy page MUST match the App-Privacy questionnaire (§8).
- Live ~1-2 min after the pages hit `main`. Verify with `curl -sS -o /dev/null -w "%{http_code}" <url>`.
- **⚠ Do NOT make `JFun/jfun` private on the free plan — it unpublishes Pages and 404s every app's Support/Privacy URL.** GitHub serves Pages from a private repo only on **Team/Enterprise** (for orgs; Pro for personal); the free org plan cannot. A dead Support/Privacy URL is an App-Review rejection, and a takedown risk once the app is live. If the repo must go private, first move hosting off it and re-point App Store Connect once: (a) split `/docs` into a **public** repo or the org site `JFun.github.io`; (b) **Firebase Hosting** — free, already wired per app (`firebase init hosting` → `firebase deploy`), and independent of repo visibility; or (c) any static host. A **custom domain** on whichever host is the permanent fix — after that Apple's URLs never change again, no matter where the pages move. Keep the repo public until any in-review app (Support/Privacy URLs are checked during review) is approved and stable.

## 4. App Store screenshots — CDP harness

`scripts/dev/shots.cjs` (canonical in the template): headless Chrome via
`chrome-remote-interface` + `Emulation.setDeviceMetricsOverride({ width, height,
deviceScaleFactor })` → **exact device-pixel PNGs, no clipping** (plain `--window-size`
clamps to ~500px and crops; the Claude_Preview MCP also clips viewports >~500px — never
screenshot tablet layouts there, check computed metrics instead).

- game.js needs a `?shot=<scene>` harness (inert for users) that seeds state + renders the
  named scene (`play` / `win` / `levels` / `howto`), and forces a couple of resize passes
  so the board fits headless.
- Run: `python3 -m http.server 4173 -d web` then `node scripts/dev/shots.cjs` →
  `screenshots/appstore/{iphone-6.7,iphone-6.5,ipad-13}/*.png`
  (1290×2796 / 1242×2688 / 2048×2732). ASC minimum: 6.9"/6.7" iPhone + 13" iPad (6.5"
  optional). ≥3 per slot.

## 5. Universal (iPhone + iPad) — scale up for iPad

`TARGETED_DEVICE_FAMILY="1,2"` needs `UIRequiresFullScreen` (portrait-only) to pass iPad
validation. A phone-width `#wrap{max-width:480}` leaves the board tiny on iPad; add:
- a `@media (min-width:700px)` block (bump `#wrap` max-width + HUD type), and
- a tablet branch in the JS board-sizer (`innerWidth>=700` → board ~78% of width).

Portrait-lock means width is always the device short side, so `min-width:700` targets iPad
only (iPhone short side ≤ ~430) — iPhone layout is untouched.

## 6. Dev hooks OFF in Release — build-gated, automatic

Never rely on a manual flag. Gate dev affordances on a native `#if DEBUG` signal:
- `MainViewController.capacitorDidLoad()` injects `window.__DEV_BUILD=true` via a
  `.atDocumentStart` `WKUserScript` (needs `import WebKit`). Compiled out of Release.
- JS reads `const DEV_X = !!window.__DEV_BUILD || location.protocol === "http:"` — on in
  Debug native builds + browser localhost, **off in Release/App-Store builds**.

## 7. TestFlight upload

`scripts/dev/upload_testflight.sh` + `ExportOptions.plist` (`destination=upload`, team
`Y3T546NP6T`, automatic signing — uses Xcode's signed-in Apple ID, no API key):
1. **Bump `CURRENT_PROJECT_VERSION`** in the pbxproj (Debug + Release) before each upload —
   the `(MARKETING_VERSION, CURRENT_PROJECT_VERSION)` pair must be unique per upload.
2. `bash scripts/dev/upload_testflight.sh` → cap sync → cache-bust → `xcodebuild archive`
   (Release) → `-exportArchive` upload. Success ends `Progress 100%: Upload succeeded.` +
   `** EXPORT SUCCEEDED **`.
3. Archive dev-signing may show the FREE team `N9DH28SYTB` — a red herring; the archive's
   team = pbxproj `DEVELOPMENT_TEAM` (paid), and "Upload succeeded" proves it went to the
   paid team (the free team can't upload at all).
4. Verify the build shows up in ASC → app → TestFlight → iOS Builds (~5-15 min processing).

Prereqs already handled by the template/Info.plist: `ITSAppUsesNonExemptEncryption=false`
(skips the encryption prompt), `UIRequiresFullScreen`.

**⚠ Firebase + signing — archive with AUTOMATIC signing (never force a manual profile).**
Firebase pulls in SPM package targets (Firebase / Promises / GoogleUtilities). If you pass
manual-signing overrides GLOBALLY on the `xcodebuild archive` line
(`CODE_SIGN_STYLE=Manual PROVISIONING_PROFILE_SPECIFIER=…`), the profile leaks onto those
SPM targets → **`ARCHIVE FAILED`: "<target> does not support provisioning profiles"**.
Automatic signing assigns the profile to the App target only and leaves the SPM targets
alone. So archive with `-allowProvisioningUpdates` and NO signing overrides (only
`DEVELOPMENT_TEAM`), exactly like Cut/Tilt. This bit Rattle 1.0(2) — the Firebase-less
1.0(1) had no SPM targets so a manual archive worked; adding Firebase broke it.

**Account-independent path (no Xcode-signed-in Apple ID).** `destination=upload` via the
Xcode account fails `Failed to Use Accounts` on an expired session. To ship without an
Xcode login, authenticate with the ASC API key on BOTH steps:
`xcodebuild archive … -allowProvisioningUpdates -authenticationKeyPath <p8>
-authenticationKeyID <id> -authenticationKeyIssuerID <issuer> DEVELOPMENT_TEAM=…`, then
export with a **manual**-signing `ExportOptions.plist` (`signingStyle=manual`,
`signingCertificate "Apple Distribution"`, the App Store profile) + the same
`-authenticationKey*` flags. Needs a local Apple Distribution cert + App Store profile
installed (mint both via the API once — see `rattle`'s memory). `apps/rattle/scripts/dev/
release_ios.sh` is the canonical one-command version (self-test → bump → cap sync → archive
→ export+upload); `asc-api.cjs checklist` prints the web-UI-only steps that remain.

## 8. App Store Connect submission — do in this order

App-level (left sidebar), then the version page:

1. **Pricing and Availability:** Free · all countries and regions.
2. **App Privacy:** Privacy Policy URL (§3). "Collects data?" Yes → **Usage Data → Product
   Interaction** AND **Identifiers → Device ID**, both *Analytics* / *not linked* / *not
   tracking* → no ATT prompt. (Must match the privacy page.)
3. **Age Rating:** answer every question None/No → typically **4+**.
4. **App Information:** Category (Games → e.g. Puzzle + **Casual**; ASC has NO "Arcade"
   subcategory). **Content Rights IS in the API** (unlike App Privacy / Age Rating) — the
   app-level `contentRightsDeclaration` attribute; `asc-api.cjs finalize` sets it to
   `DOES_NOT_USE_THIRD_PARTY_CONTENT` (original game: own engine/art/audio, open-licensed fonts).
5. **Version page:** screenshots, description (plain ASCII — no em-dashes/asterisks or the
   field rejects them), keywords (name+subtitle+keywords indexed together, zero overlap,
   singular forms), promo text, support URL, copyright `<year> Qili Chen`. Select the
   **Build** once processed. **App Review Information:** Sign-In Required = No + contact +
   notes. **Version Release:** automatic.
6. **Submit-time gotchas:** IDFA question → **No** (Firebase Analytics doesn't use IDFA; no
   ads). Skip Game Center / IAP / App Clip / iMessage. First submission often gets a
   boilerplate "2.1 Information Needed" — reply with the review notes + a 30-60s gameplay
   screen recording.

Then **Add for Review**.

## Icon gotcha

The 1024 App Store icon must have **no alpha channel** or ASC silently blanks it. Verify:
`sips -g hasAlpha <App>/Images.xcassets/AppIcon.appiconset/*1024*.png` → must be `no`.
Flatten onto the brand bg if `yes` (Pillow: composite via alpha → RGB), then re-archive.
