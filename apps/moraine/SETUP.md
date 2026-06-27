# apps/moraine — build & deploy in the monorepo

Moraine lives in the `jfun` monorepo as an npm workspace. The **web** game is
no-build (`python3 -m http.server web` or the repo's preview). The **iOS** app is
Capacitor (SPM, no CocoaPods). Two things a fresh `git clone` won't have:

## 1. Install deps from the repo ROOT (not here)

```bash
npm install            # at /Users/qili/git/jfun — hoists Capacitor deps to the root node_modules
```

Workspace hoisting puts `@capacitor/*` in the **root** `node_modules`. That's fine:
`cap sync` regenerates `ios/App/CapApp-SPM/Package.swift` with the correct relative
path (`../../../../../node_modules/...`, five levels up to the root) on every build.
**Do NOT copy a per-app `node_modules`** — it's unnecessary and goes stale.

## 2. Drop in `GoogleService-Info.plist` (gitignored — has Firebase keys)

It is intentionally **not** committed. Place it at:

```
apps/moraine/ios/App/App/GoogleService-Info.plist
```

Get it from the Firebase console (project for `com.jfun.moraine`) or copy the
existing one from a machine that already has it. Without it the build fails with
`Build input file cannot be found: …/GoogleService-Info.plist`.

## Deploy to the paired iPhone

```bash
bash apps/moraine/scripts/dev/deploy_ios.sh      # cap sync → build → install → launch
```

- Signing team: **`Y3T546NP6T`** (the paid publishing team), automatic signing.
- Device: iPhone 13 Pro `B7CC8868-E918-5043-A37E-32AC17F755E7` (edit `DEVICE_ID` in
  the script after `xcrun devicectl list devices` if it changes).
- Benign messages: `devicectl` "Connection reset by peer" (retry once) and
  `Code=1002 "No provider was found."` — the launch still succeeds.

TestFlight/App Store upload, the icon-alpha gotcha, and the privacy questionnaire:
see `docs/handbook/01-apple-rules.md` and `packages/native-shell/`.
