# Tilt — App Store submission kit

Everything to paste into App Store Connect for v1.0, tuned for ASO. Bundle: `com.jfun.tilt`.
Apple indexes **name + subtitle + keywords together** and stems plurals, so nothing repeats across those three fields (repeats waste indexing space).

---

## 1. Name (listing title) — 30 char max

The store title MUST be globally unique. Check availability in ASC (My Apps → +).
The name UNDER THE ICON stays just `Tilt` (`CFBundleDisplayName`, no uniqueness rule).

- **Recommended:** `Tilt: Marble Roll Puzzle`  (24) — keywords: tilt, marble, roll, puzzle
- Alt 1 (if taken): `Tilt: Roll the Marbles`  (22)
- Alt 2 (if taken): `Marble Tilt: Roll & Match`  (25)

## 2. Subtitle — 30 char max

- **Recommended:** `Color-match maze, one hand`  (26) — keywords: color, match, maze, one, hand
- Alt: `Roll balls into color holes`  (27)

## 3. Keywords field — 100 char, comma-separated, NO spaces

Excludes every word already in the name/subtitle (tilt, marble, roll, puzzle, color, match, maze, one, hand). Singular forms only (Apple auto-matches plurals).

```
ball,hole,gravity,physics,brain,relax,arcade,balance,labyrinth,casual,skill,offline,dexterity,neon
```

## 4. Promotional text — 170 char (editable anytime, no review)

```
Tilt your phone and roll every marble home. 30 real-physics color-match levels, from easy to clever. No forced ads, no login. Just gravity, marbles, and your best time.
```

## 5. Description — plain ASCII only

(Apple's description field rejects box-drawing chars and can reject em-dashes / markdown asterisks — this is plain hyphens only.)

```
Tilt your phone and every marble rolls at once. Guide each ball into the hole that matches its color using real gravity and physics. Easy to pick up, tricky to master.

HOW TO PLAY
- Tilt the phone in any direction. Marbles roll with real momentum.
- Land each colored ball in its matching colored hole.
- Roll too slowly into the wrong hole and the ball gets stuck. Tilt hard to pop it free.
- Clear every ball to finish the level. Beat the clock for gold.

FEATURES
- Pure tilt controls. No buttons, no swiping. Just you and gravity.
- Real marble physics: momentum, bounces, and collisions you can feel.
- 30 handcrafted, solver-verified levels that ramp from easy to clever.
- Bank shots off walls and thread tight gaps.
- Beat your best time on every level and chase three stars.
- Relaxing to play, satisfying to master, and great one-handed.
- No accounts, no logins, no forced ads.

Roll, match, repeat. How fast can you clear them all?
```

## 6. What's New (release notes, v1.0)

```
First release. Tilt, roll, and match your way through 30 levels. Thanks for playing!
```

## 7. Category

- Primary: **Games > Puzzle**
- Secondary: **Games > Arcade**

## 8. Age rating

**4+** — answer every content question **None / No**. No objectionable content, no user-generated content, no web access, no gambling.

## 9. App Privacy (must match the privacy policy page)

Firebase Analytics only. No ads, no Google Signals, no data brokers, no cross-app tracking.

Declare exactly two data types (both must match the privacy page, which discloses identifiers):
- **Usage Data > Product Interaction** — Linked: **No** · Tracking: **No** · Purpose: **Analytics**
- **Identifiers > Device ID** — Linked: **No** · Tracking: **No** · Purpose: **Analytics**
  (Firebase collects the IDFV + a Firebase Installation ID; the privacy page discloses this, so the questionnaire must too or you risk a second-round rejection.)

Do NOT check Advertising Data, Crash Data, Performance Data, or Location.
"Used for tracking = No" everywhere, so **no ATT prompt** is required.

## 10. App Review notes (paste into the "Notes" field)

```
1. Purpose & audience: Tilt is a casual physics puzzle for all ages. You tilt the phone and roll colored marbles into matching-color holes.
2. How to use: No login, no accounts, no in-app purchases. Open the app, tap the tray, and tilt the phone to roll the marbles into their matching holes. Tap the top-left icon for the level list, the gear for settings.
3. Devices tested: iPhone (iOS 17/18) and iPad.
4. External services: Firebase Analytics (Google) for anonymous gameplay/engagement events only. No backend, no auth, no payments, no ads, no AI services.
5. Regional differences: None. The app works consistently in all regions. English-only UI.
6. Regulated industry / protected content: None.
7. Demo account: Not applicable (no accounts).
```

## 11. Screenshots — DONE

`apps/tilt/screenshots/appstore/{iphone-6.7, iphone-6.5, ipad-13}/{01-play, 02-win, 03-levels, 04-howto}.png` at exact App Store pixel sizes. Drag each folder into its slot (>=3 per slot; 4 provided). Regenerate: `python3 -m http.server 4173 -d web` then `node scripts/dev/shots.cjs`.

## 12. URLs

Hosted in the jfun monorepo via GitHub Pages (main, `/docs`) at `docs/tilt/`:
- **Support URL:** `https://jfun.github.io/jfun/tilt/support.html`
- **Privacy Policy URL:** `https://jfun.github.io/jfun/tilt/privacy.html`

Paste Support into App Information -> Support URL and Privacy into App Privacy -> Privacy Policy URL. (Live ~1-2 min after the docs land on `main` + Pages builds; `docs/.nojekyll` serves them static.)

## 13. Pre-upload checklist

- [ ] Reserve the final name in ASC (confirm availability)
- [x] Support + Privacy pages written (`apps/tilt/docs/`); still need HOSTING + paste URLs into ASC
- [x] App icon has NO alpha channel (verified `hasAlpha: no`, 1024x1024)
- [x] Encryption compliance: `ITSAppUsesNonExemptEncryption=false` already set
- [x] iPad orientations: `UIRequiresFullScreen` already set (portrait-only universal)
- [x] Screenshots at exact sizes (section 11)
- [x] Dev level-jump auto-stripped from Release builds (#if DEBUG gated)
- [x] Build 1.0 (1) archived Release + uploaded to TestFlight

## 14. Full App Store Connect walkthrough (do in this order)

These live in the LEFT SIDEBAR of the app (app-level, apply to every version) plus the version page.

### A. Pricing and Availability
- **Price:** Free (USD 0.00 / "Free").
- **Availability:** All countries and regions.
- Pre-Orders: off. No custom pricing.

### B. App Privacy  (Privacy Policy URL + data questionnaire)
- **Privacy Policy URL:** `https://jfun.github.io/jfun/tilt/privacy.html`
- "Do you or your partners collect data from this app?" -> **Yes**.
- Add exactly TWO data types:
  1. **Usage Data -> Product Interaction**
  2. **Identifiers -> Device ID**
- For BOTH, on the follow-up screens: Purpose = **Analytics** only; "Linked to the user's identity?" = **No**; "Used for tracking?" = **No**.
- Result should read "Data Not Linked to You", no tracking -> no ATT prompt needed. Publish.

### C. Age Rating  (App Information -> Age Rating, "Edit")
- Answer EVERY content question **None** / **No** (no violence, sexual content, profanity, drugs, horror, gambling, contests, unrestricted web, medical). No age-verification features.
- Result: **4+**. Save.

### D. App Information
- **Category:** Primary **Puzzle**, Secondary **Arcade**.
- **Content Rights:** "No, it does not contain, show, or access third-party content."

### E. Version page (1.0 Prepare for Submission) - remaining fields
- Screenshots (drag from `screenshots/appstore/*`), Description, Keywords, Promo text, Support URL, Copyright `2026 Qili Chen` (all in this doc).
- **Build:** select **1.0 (1)** once it finishes processing (~5-15 min, email confirms).
- **App Review Information:** Sign-In Required = **No**; fill your contact name / phone / email; paste the section-10 reviewer notes. Attachment optional.
- **Version Release:** "Automatically release this version" (recommended for a first app).

### F. Submit-time gotchas
- **IDFA / Advertising Identifier:** if asked "Does this app use the Advertising Identifier (IDFA)?" -> **No** (Firebase Analytics does NOT use IDFA; no ads).
- **Export Compliance:** `ITSAppUsesNonExemptEncryption=false` is set, so it should not prompt; if it does, answer "uses no non-exempt encryption".
- **Skip entirely:** Game Center, In-App Purchases, App Clip, iMessage App, Custom Product Pages, In-App Events.
- First submission often gets a boilerplate "2.1 Information Needed" - the section-10 notes answer it; a 30-60s screen recording of gameplay helps.

Then: **Add for Review**.
