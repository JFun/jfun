# Unmake — local setup (gitignored build essentials)

Everything here is either large, machine-specific, or secret, so it's **not** committed
(see `.gitignore`). This file is the checklist to get a working build on a fresh machine.

## 1. Editor

- **Unity Hub** → install **Unity 6 LTS (`6000.0.x`)** with the **iOS** and **Android**
  Build Support modules.
- Open `apps/unmake` as a project. First open regenerates `Library/`, `Temp/`, `*.csproj`,
  `*.sln` (all gitignored) and rewrites `ProjectSettings/ProjectVersion.txt` to your
  exact editor version. That's expected.

## 2. Packages

`Packages/manifest.json` pins the registry packages (Input System, URP, Addressables,
Test Framework, IDE bridges). Unity resolves them on open; if a pinned patch version
isn't available it'll pick the nearest — fine for now.

**DOTween** (juicy part animations) is an Asset Store / external package, not on the
UPM registry. Install it into `Assets/Plugins/Demigiant/` (gitignored) via the Asset
Store, or swap to the free OpenUPM mirror. The Core + tests don't need it; only the
view layer does.

## 3. Signing & deploy (when you're ready to put it on a device)

- **iOS:** set the bundle id to `com.jfun.unmake`, team `Y3T546NP6T` (studio Apple
  team, same as Moraine/Lanthorn). Build to Xcode, then run on a paired device.
- **Android:** keystore lives **outside** git — never commit `*.keystore` / `*.p12` /
  `*.mobileprovision`. Drop them locally and point Project Settings ▸ Player at them.
- `ExportOptions.plist` is gitignored — generate per machine.

## 4. Smoke test (no art, no device)

Open a new scene, add an empty GameObject, attach **Bootstrap** (`Assets/Unmake/Unity`),
press Play. The Console should print the solver's par for the sample robot, the optimal
order, and a 3★ intact playthrough. If that logs, the Core loop is wired correctly.

## 5. Tests

`Window ▸ General ▸ Test Runner ▸ EditMode ▸ Run All`. All green = the rules + par
contract holds.
