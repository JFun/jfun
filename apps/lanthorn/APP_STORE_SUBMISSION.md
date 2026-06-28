# Lanthorn — App Store Submission Checklist

Bundle `com.jfun.lanthorn` · Apple team `Y3T546NP6T` (tbcql1986@gmail.com) ·
Universal (iPhone + iPad) · v1.0.

Legend: `[x]` done · `[~]` I can do (Claude) · `[ ]` you (owner, in App Store Connect / external)

---

## 0. Pre-submission gates (do these first)

- [ ] **Fun gate** (PRD §4) — 10 testers on levels 1-20; pass = >=8 finish 10 levels AND >=6 ask for more. This is the real go/no-go. *(I can publish the web build to a shareable URL for testers.)*
- [ ] **USPTO trademark check** on "Lanthorn" — *preliminary knockout search done, clear so far:* no exact "Lanthorn" mark in the USPTO database (per Justia/Trademarkia mirrors) and no App Store app named Lanthorn. Two things to confirm at [tmsearch.uspto.gov](https://tmsearch.uspto.gov/): (1) existing **LANTERN** marks — "Lanthorn" is the archaic spelling of "lantern", so check for LIVE LANTERN marks in **Class 009** (game software) / **041** (online games); (2) "Lanthorn" is used as a business name in *other* fields (a branding studio, a monitoring-software co, an AI-camera co) — field-specific, so likely fine for a game. Not legal advice; this is a knockout search, not a full clearance. Backups: Lanternrise, Glowmoor.
- [ ] **Enable GitHub Pages** (code is now pushed to `main`, so this is ready) → repo Settings → Pages → Branch `main`, Folder `/docs`, Save. Wait ~1-2 min. This makes the Privacy + Support URLs live. Then verify both return 200:
  - `https://jfun.github.io/lanthorn/privacy.html`
  - `https://jfun.github.io/lanthorn/support.html`
- [ ] **Register the App ID** (do this first if the bundle ID isn't already registered): [developer.apple.com → Identifiers → +](https://developer.apple.com/account/resources/identifiers/bundleId/add/bundle) → App IDs → App → Description `Lanthorn`, Bundle ID **Explicit** `com.jfun.lanthorn`, team `Y3T546NP6T`, **enable NO capabilities** → Continue → Register. *(The app needs zero App ID capabilities — verified: only Firebase Analytics + native audio/haptics, none of which require one. No push, Sign in with Apple, Game Center, App Groups, or associated domains.)*
- [ ] **Create the App Store Connect app record:** [App Store Connect → Apps](https://appstoreconnect.apple.com/apps) → ➕ → **New App** → iOS · Name `Lanthorn` · English (U.S.) · Bundle ID `com.jfun.lanthorn` (appears in the dropdown once the App ID above exists) · SKU `lanthorn-ios` · Full Access → **Create**. No metadata needed to create the shell record. Use the `Qili Chen - Y3T546NP6T` team (not a free/personal team).

---

## ASO (App Store Optimization) — read before filling §1-§3

**Positioning:** Do NOT compete head-on for "block puzzle" — Block Blast / 1010 / Woody
own it and a new app can't rank there. Lanthorn's winnable lane is the **cozy / relaxing /
lantern** niche. Lean every text field and screenshot into: calm, no-pressure, lanterns,
light, cozy worlds, night sky.

**How iOS search actually works (different from Google Play):**
- Apple indexes only the **App Name + Subtitle + Keyword field** — NOT the description. So
  keywords live in those three; the description is purely for conversion.
- Apple **auto-combines** words across all three fields (name "cozy"+"block"+"puzzle" =>
  ranks for "cozy block puzzle"). So **never repeat a word** across name/subtitle/keywords — a
  repeat is a wasted slot.
- Keyword field: **no spaces** (commas only, every char counts), **singular forms** (Apple
  matches plurals), and **omit** your app name, "app", "game", and your category — Apple adds
  those automatically.
- **No competitor brand names** (Block Blast, 1010, Woody) — Apple may reject for trademark and
  it draws bad-fit users. Keep every keyword **relevant** (irrelevant terms like "wood"/"merge"
  can trigger rejection and hurt retention signals that feed ranking).

**Free keyword multiplier — extra English locales:** add **English (U.K.)**, **English
(Australia)**, **English (Canada)** localizations. Each gives another Name + Subtitle +
100-char keyword field to index. Reuse the same screenshots/description; just vary the keywords
(e.g. soothing, calming, brain teaser, time killer, unwind, before bed). Big free coverage win.

**Conversion levers (after they find it):**
- **Screenshots** are the #1 lever and the first 1-2 show in search results. Our current set is
  raw gameplay — add short benefit captions ("Light every lantern", "Drift through cozy
  worlds", "No timers. No pressure."). *(I can produce captioned versions.)*
- **Ratings** drive both rank and conversion — add an in-app rating prompt
  (SKStoreReviewController) after ~3-5 wins. *(Small code add; I can do it.)*
- **Icon** must read at thumbnail size against a sea of bright block grids — the warm glowing
  lantern on dark is differentiated; keep it bold and simple.
- **App preview video** (15-30s) is optional but lifts conversion further.

**Post-launch:** ASO is iterative — the keyword field can change every version. Watch which
terms bring installs (ASC Analytics) and swap the weak ones each update.

---

## 1. App information (App Store Connect → App Information)

- [ ] **App Store name (<=30):** `Lanthorn: Cozy Block Puzzle` — keyword-bearing. (The name shown under the icon on the device stays `Lanthorn` via CFBundleDisplayName; only the *Store* name carries keywords.)
- [ ] **Subtitle (<=30):** `Relax with calm lantern lights` — deliberately uses *different* words than the name (relax, calm, lantern, lights).
- [ ] **Category:** Primary = Games > Puzzle. Secondary (optional) = Games > Casual.
- [ ] **Content rights:** does not use third-party content → No.
- [ ] **Age rating:** answer all questionnaire items **None / No** → results in **4+**.
- [ ] **Privacy Policy URL:** `https://jfun.github.io/lanthorn/privacy.html`
- [ ] **Support URL:** `https://jfun.github.io/lanthorn/support.html`

---

## 2. Version metadata (the version page — copy/paste below)

- [ ] **Promotional text (<=170):**
  > Light lanterns, fill your night sky, and drift through warm little worlds. A calm block puzzle with no timers and nothing to buy.

- [ ] **Description (<=4000, plain ASCII — no markdown, no em-dashes/box characters):**
  ```
  Lanthorn is a cozy block puzzle about light.

  Drag pieces onto the board and fill a complete row or column through a lantern
  to light it. Light every lantern to finish a level, then travel outward through
  warm, hand-made worlds as your night sky slowly fills with light.

  That is the whole game. One simple move, nothing to memorize.

  - No timers and no pressure. Play at your own pace.
  - No accounts and no sign-in. Just open and play.
  - No ads interrupting you, and nothing to buy.
  - Fully playable offline.
  - Levels that gently grow with you, plus an endless journey beyond.

  A calm puzzle for a quiet moment. Light a lantern, fill the sky.
  ```

- [ ] **Keywords (<=100, comma-separated, NO spaces, singular, none repeating the name/subtitle):**
  ```
  zen,brain,logic,grid,offline,casual,night,sky,glow,unwind,quiet,mindful,tiles,lamp,star,evening
  ```
  *(Note: `cozy, block, puzzle, relax, calm, lantern, light` are intentionally absent here — they're
  already in the name/subtitle and Apple combines across fields. Adjust as ASC Analytics shows what ranks.)*

- [ ] **Copyright:** `2026 JFun`
- [ ] **Marketing URL (optional):** leave blank or the support URL.

---

## 3. Visual assets

- [x] **App icon 1024x1024, no alpha** — already in the build's asset catalog (`hasAlpha: no` verified).
- [x] **Screenshots** — in `screenshots/appstore/` (drag into the version's "Previews and Screenshots"):
  - iPhone 6.9"/6.5" slot (1242x2688): `iphone65_1_play` `iphone65_2_win` `iphone65_3_sky` `iphone65_4_title`
  - iPad 13" slot (2048x2732): `ipad13_1_play` `ipad13_2_win` `ipad13_3_sky` `ipad13_4_title`
- [ ] App preview video — optional, skipping.

> Note: Apple now also accepts/asks for the 6.9" iPhone size (1290x2796). Our 6.5" (1242x2688) set is still accepted; if ASC requires 6.9", say the word and I'll re-render that size (one line in `scripts/dev/shots.py`).

---

## 4. Build (TestFlight)

- [x] **First build uploaded** — v1.0 (build 2) uploaded to App Store Connect ✅ (June 14, 2026). One-shot script: `scripts/dev/upload_testflight.sh` (self-test → bump build → cap sync + cache-bust → archive → export & upload via Xcode's signed-in Apple ID; auto-increments the build number each run).
- [x] **Encryption compliance** — `ITSAppUsesNonExemptEncryption=false` in Info.plist (no prompt).
- [x] **iPad orientation fix** — added `UIRequiresFullScreen=YES` to Info.plist. *(Required: a Universal app that's portrait-only must declare full-screen, else upload is rejected with "you need to include all … orientations to support iPad multitasking.")*
- [ ] **Processing** — wait ~5-15 min; Apple emails when the build is ready (or if it fails processing).
- [ ] **Missing Compliance?** — if TestFlight shows it on the build, click → "None of the above" (we already set the Info.plist flag, so it usually won't ask).
- [ ] **Select the build** on the version page → Build section (after processing finishes).
- [ ] **Internal testers** — add yourself/team under TestFlight → Internal Testing; installable immediately once processed (no Beta App Review). External testers need Beta App Review (~24h first time).

> Subsequent uploads: just run `scripts/dev/upload_testflight.sh` again (it bumps the build number); commit the pbxproj bump after.

---

## 5. App Privacy (App Store Connect → App Privacy) — must match privacy.html

Profile: Firebase Analytics only. No ads, no Google Signals, no IAP, no accounts, no Crashlytics.

- [ ] **Data collected → Usage Data → Product Interaction**
  - Linked to the user? **No**
  - Used for tracking? **No**
  - Purpose: **Analytics**
- [ ] (Only if a reviewer flags a mismatch) add **Identifiers → Device ID**, also Linked=No, Tracking=No, Analytics.
- [ ] **Do NOT** check Advertising Data, Crash Data, Performance Data, or Location.
- [ ] Tracking = **No** across the board → **no ATT prompt** required (the app does not meet Apple's definition of tracking).

---

## 6. Review information (version page → App Review Information)

- [ ] **Sign-in required:** No.
- [ ] **Contact:** first/last name, phone, email (tbcql1986@gmail.com).
- [ ] **Notes** (paste this — pre-empts the common 2.1 "information needed" reply):
  ```
  1. Purpose & audience: Lanthorn is a single-player cozy block puzzle for a
     general audience. Drag pieces onto a grid, fill a lantern's row or column to
     light it, and progress through levels.
  2. How to use: open the app and tap Play. Drag pieces from the tray to the board.
     No login, no accounts, and no in-app purchases.
  3. Devices tested: iPhone 13 Pro (iOS 18.x), iPad (iPadOS 18.x).
  4. External services: Firebase Analytics (Google) for anonymous gameplay events
     only. No backend, authentication, payment, ads, or AI services.
  5. Regional differences: none. English-only UI, identical worldwide.
  6. Regulated industry / protected content: none.
  7. Demo account: not applicable (no accounts).
  ```

---

## 7. Submit

- [ ] Set version release option (Manual is safest for a first launch).
- [ ] Click **Add for Review** / **Submit**.
- [ ] First-time apps often get a 2.1 "Information Needed" reply regardless — the Notes above usually satisfy it; attach a 30-60s screen recording if asked.

---

## Status snapshot (as of this session)

Done: privacy + support HTML pages (`docs/`), 8 centered screenshots, icon no-alpha,
encryption key, v1.0/build 1, native Firebase Analytics live, ASO metadata drafted
(§ASO), trademark knockout preliminary-clear (§0), and **code pushed to the public
GitHub repo** (Firebase `GoogleService-Info.plist` purged from history + gitignored;
it lives on disk for builds, never in the repo).

Blocking on you: fun gate, USPTO confirm (~5 min on tmsearch.uspto.gov), enable GitHub
Pages (now ready), register the App ID + create the ASC app record. Once the app record
exists (Xcode is already signed into the team from your deploys), I run the TestFlight
upload (bump build → archive → upload).

Not an App Store blocker but pending: web GA measurement ID (the CrazyGames-channel gate).
