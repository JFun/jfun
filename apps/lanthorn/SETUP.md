# apps/lanthorn — build & deploy in the monorepo

Lanthorn lives in the `jfun` monorepo as an npm workspace. The **web** game is
no-build (`python3 -m http.server web` or the repo's preview). The **iOS** app is
Capacitor (SPM, no CocoaPods). Two things a fresh `git clone` won't have (the
import carried only git-tracked source):

## 1. Install deps from the repo ROOT

```bash
npm install            # at /Users/qili/git/jfun — hoists Capacitor deps to the root node_modules
```

Workspace hoisting puts `@capacitor/*` in the **root** `node_modules`. `cap sync`
regenerates `ios/App/CapApp-SPM/Package.swift` with the correct relative paths on
every build, so **don't copy a per-app `node_modules`**.

## 2. Drop in `GoogleService-Info.plist` (gitignored — has Firebase keys)

Not committed. Place it at:

```
apps/lanthorn/ios/App/App/GoogleService-Info.plist
```

Get it from the Firebase console (project for `com.jfun.lanthorn`) or copy from a
machine that already has it. Without it the iOS build fails with
`Build input file cannot be found: …/GoogleService-Info.plist`.

## Deploy to the paired iPhone

```bash
bash apps/lanthorn/scripts/dev/deploy_ios.sh      # test → cap sync → build → install → launch
```

- Bundle id **`com.jfun.lanthorn`**, signing team **`Y3T546NP6T`** (automatic).
- Device: iPhone 13 Pro `B7CC8868-E918-5043-A37E-32AC17F755E7` (edit the script's
  `DEVICE_ID` after `xcrun devicectl list devices` if it changes).
- Benign `devicectl` messages: "Connection reset by peer" (retry once) and
  `Code=1002 "No provider was found."` — the launch still succeeds.

Lanthorn keeps its **own** inlined `web/js/` (engine/analytics/audio — the
canonical sources the `@jfun` packages were extracted from). Adopting the `@jfun`
packages is an opt-in step, not done here. App Store specifics:
`docs/handbook/01-apple-rules.md` and `packages/native-shell/`.
