# 01 — Apple Review Rules

## 4.1 / 4.3 — the differentiation line (the Gravity Flip scar)

**Genre mechanics are safe; cloning a specific iconic title is not.** *Gravity
Flip* was rejected as "design spam" — same mechanism as Flappy Bird.

- ✅ Use a **genre's** verbs (match, slide, drop, place, swipe-gravity).
- ❌ Never clone a **specific hit's** identity, name, or signature feel.
- Do the [prior-art audit](04-prior-art-audit.md) and **rename after research** if
  needed. Keep a one-line note articulating your original mechanic ready for the
  reviewer (the Gravity Flip scar earns this paranoia).

## Submission gotchas (each has bitten us — all need a RE-ARCHIVE to fix)

- **App icon must have NO alpha channel.** A 1024×1024 marketing icon with alpha
  → App Store Connect silently blanks it (no error email). `sips -g hasAlpha` to
  check; flatten onto the brand bg and drop alpha. Godot/most generators emit RGBA.
- **Universal + portrait-only → validation REJECT.** An iPad-supported app must
  support all 4 orientations OR add `UIRequiresFullScreen=true`. Bites
  Capacitor/Godot games with `TARGETED_DEVICE_FAMILY="1,2"`.
- **Encryption compliance** — add `ITSAppUsesNonExemptEncryption=false` to Info.plist
  (most games: answer "No") to skip the per-build prompt.
- The team id is baked into the `.xcarchive` at archive time — changing
  `DEVELOPMENT_TEAM` needs a re-archive, not just a re-export.

## Signing — use the PAID team, not the free one

An Apple ID is usually in two teams: a free auto-created "personal team" (can't
publish, leaves a red-herring cert) and the **paid** team. For this studio:
**`Y3T546NP6T` ("Qili Chen")**, `tbcql1986@gmail.com`. See
[`@jfun/native-shell`](../../packages/native-shell/README.md) for the full upload
flow and pbxproj notes.

## Privacy questionnaire (Firebase Analytics, no ads)

Apple's "tracking" is narrow: third-party ad-linking or data brokers. First-party
engagement analytics is **NOT tracking**. For a casual game with Firebase Analytics
only (no ads, no Google Signals): declare **Usage Data → Product Interaction**
(Linked=No, Tracking=No, Analytics); answer ATT/tracking = No. The privacy policy
must match the questionnaire exactly.

## 2.1 "Information Needed" (first-submission boilerplate)

Most new apps get this regardless of issues. Reply with the 7 items (purpose,
how-to, devices tested, external services, regional differences, regulated content,
demo account) + a 30–60s screen recording.
