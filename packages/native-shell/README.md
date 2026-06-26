# @jfun/native-shell

The Capacitor iOS shell, as **templates** (not a buildable module). A new game's
`ios/` is a Capacitor app that loads `web/`; these are the pieces that recur.

## What's here

| File | Role |
|---|---|
| `templates/NativeFX.swift` | Local Capacitor plugin: native AVAudio sample playback (revives after backgrounding/interruptions), Taptic haptics (`light/medium/success/warning`), and Firebase `track(name, params)`. The web game calls `NativeFX.sound({name})` / `NativeFX.haptic({kind})` / `NativeFX.track({name,params})`. |
| `templates/deploy_ios.sh` | One-shot wireless deploy: self-test → `cap sync` → cache-bust bundled assets → `xcodebuild` → `devicectl` install + launch. |
| `templates/ExportOptions.plist` | TestFlight/App Store upload (`destination=upload`, automatic signing, team `Y3T546NP6T`). |
| `templates/capacitor.config.json` | `appId`/`appName`/`webDir: web` + iOS no-scroll/no-zoom defaults. |

Copy into a new game and replace `__GAME__` / `__GameName__` / the device id.

## Signing — use the PAID team, not the free one

An Apple ID is usually in **two** teams: a free auto-created "personal team"
(10-char id, can't publish, leaves a red-herring "Apple Development (FREEID)" cert
in the keychain) and the **paid** Individual/Org team. For this studio the
publishing team is **`Y3T546NP6T` ("Qili Chen")**, Apple ID `tbcql1986@gmail.com`.
Put that exact id in pbxproj `DEVELOPMENT_TEAM` (Debug + Release), the
`ExportOptions.plist` `teamID`, and `deploy_ios.sh`. The team is baked into the
`.xcarchive` at archive time — change it and you must **re-archive**, not just
re-export. Distribution signing needs that account signed into Xcode → Settings →
Accounts (a keychain cert alone is not enough).

## pbxproj hand-registration note (no-build / no-CocoaPods)

These games use plain `<script>` tags and Capacitor via **SPM, not CocoaPods**, so
the plugin JS shim isn't bundled. Two consequences:

1. **`NativeFX.swift` must be added to the App target manually** in Xcode (it's a
   local plugin, not a pod) — drag it into the `App` group and confirm target
   membership, or hand-add the `PBXBuildFile`/`PBXFileReference` entries to
   `project.pbxproj`. `capacitorDidLoad` (MainViewController) registers the plugin.
2. From the web side, resolve native plugins with `Capacitor.registerPlugin("Haptics")`
   (the documented no-build path) rather than expecting `Capacitor.Plugins.*` to be
   pre-populated by a bundled shim.

For the full TestFlight upload flow, icon-alpha gotcha, iPad-orientation rejection,
and the privacy questionnaire, see the studio handbook (`docs/handbook/01-apple-rules.md`)
and the global session playbook.
