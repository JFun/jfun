# iOS Web Audio in Capacitor games — the gotcha playbook

Every studio game synthesizes audio with Web Audio inside a Capacitor WKWebView.
This page is the accumulated scar tissue (Tilt, Cut, …) — **read it before
touching audio in any app, and copy the checklist into every new shell.** Each
gotcha below silently produces "no sound" with zero errors; none of them are
caught by automated tests.

## The checklist (copy into every new iOS shell / game.js)

> **Why this keeps recurring (2026-07-15 audit of all 8 apps).** The fix is TWO
> layers and BOTH must be present — but the audit found the native half lived
> ONLY in Cut. There is no committed `ios/` template (each app hand-runs
> `npx cap add ios`), so every other shell (Tilt uses native audio; Quarter,
> Rattle, Excavate, Moraine, Dowse do NOT) shipped without it. And the web half
> was documented only as a *pointer* to Cut's `game.js`, so copies drift or lag.
> Durable homes, going forward:
> - **Native → `AppDelegate.swift`.** Every Capacitor app already has one (in the
>   pbxproj — no new file, no storyboard/pbxproj surgery). **MANDATORY the moment
>   you run `npx cap add ios`.** This is the single thing that fixes "lost sound
>   after background."
> - **Web → use `@jfun/audio`** (`packages/audio`, auto-vendored by
>   `new-game.mjs`) — it bakes in resume + close-and-rebuild-on-gesture + the
>   zombie clock-probe. Only hand-roll (Cut/Rattle do, for bespoke synths) with
>   the canonical snippet below.

Native — the always-present home is `AppDelegate.swift` (add `import AVFoundation`):

```swift
func application(_ application: UIApplication, didFinishLaunchingWithOptions ...) -> Bool {
    // 1. Silent switch: WKWebView's default session is 'ambient' — the ringer/mute
    //    switch silences it. .playback ignores it; mixWithOthers is polite.
    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
    try? AVAudioSession.sharedInstance().setActive(true)
    return true
}
func applicationDidBecomeActive(_ application: UIApplication) {
    // 2. iOS DEACTIVATES the session on background/interruption (call, Siri,
    //    Control Center). Without this reactivation the WKWebView AudioContext
    //    stays dead ('interrupted') and the game returns SILENT — web resume()
    //    can NEVER restart output until this runs. THE fix for the recurring bug.
    try? AVAudioSession.sharedInstance().setActive(true)
}
```
(Only put these in `MainViewController.capacitorDidLoad` instead — as Cut does —
if you already keep a custom MainViewController for the `#if DEBUG` DEV-flag
injection. Same two calls, either home works.)

Web — bespoke-audio apps (hand-rolled synths, e.g. Cut/Rattle) use this canonical
lifecycle (`@jfun/audio` already implements the same shape — prefer it):

```js
let AC=null, master=null, poisoned=false;
function buildAudio(){
  try{ AC=new (window.AudioContext||window.webkitAudioContext)();
    master=AC.createGain(); master.connect(AC.destination); /* + your graph */
    AC.onstatechange=()=>{ if(AC&&AC.state!=='running') poisoned=true; }; // any drop from running poisons the graph
  }catch(e){ AC=null; master=null; }
}
// call on EVERY user gesture — rebuild a poisoned context, create if absent, resume
function initAudio(){
  if(poisoned&&AC){ try{AC.close();}catch(e){} AC=null; master=null; poisoned=false; }
  if(!AC) buildAudio();
  if(AC&&AC.state!=='running') AC.resume().catch(()=>{});
  // ZOMBIE guard: state can LIE 'running' with a FROZEN clock → flag for next gesture
  if(AC&&AC.state==='running'){ const t0=AC.currentTime;
    setTimeout(()=>{ if(AC&&AC.state==='running'&&AC.currentTime<=t0) poisoned=true; },160); }
}
function wakeAudio(){ if(AC&&AC.state!=='running') AC.resume().catch(()=>{}); } // foreground = resume only; a gesture rebuilds
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') wakeAudio(); });
window.addEventListener('pageshow', wakeAudio);
```
Rules baked in above: NEVER gate on `==='suspended'` (test `!== 'running'` —
`'interrupted'` is a separate Safari-only state); the rebuild MUST run in a user
gesture (creation outside one can be denied), so `initAudio()` fires from every
`pointerdown` and every sound is downstream of a gesture that called it; `tone()`
must read the module-scoped `AC`/`master` so a rebuild reassigns them. Cut's
richer variant (`audioAlive`/`rebuildAudio`/`resumeAudio` with back-off retries +
a `localStorage` dev audio trail) is warranted only when audio must resume WITHOUT
a tap (background music) — `apps/cut/web/js/game.js` is that reference.

## The rules behind the checklist

1. **`.playback` category or the mute switch silences the game.**
   (`mixWithOthers` keeps the player's podcast running — the polite default for
   casual games.) Symptom: app silent for some users, fine for others — the
   difference is the ringer switch position.

2. **Re-activate the session on `didBecomeActive`.** iOS tears the session down
   on background; the web layer cannot fix this — `resume()` succeeds only
   after native `setActive(true)`. Symptom: *sound lost when returning from
   background* (the exact recurring bug).

3. **`'interrupted'` ≠ `'suspended'`.** WebKit's AudioContext has a third,
   Safari-only state. Every "resume if suspended" check ever written misses it.
   Test `state !== 'running'`. Symptom: sound never comes back even on taps.

4. **Resume needs retries.** The visibilitychange fires before the audio
   session is reactivated; the first `resume()` can be a silent no-op. Back-off
   retry (6 tries over ~2.5s) + gesture-heal covers all observed orderings.

5. **The ZOMBIE context — the state LIES.** After background/interruption the
   context often reports `'running'` while its output is dead and
   `actx.currentTime` is frozen. No state check catches it and `resume()` does
   nothing. Detect with an aliveness probe (clock advancing over ~150ms);
   recover by `actx.close()` + rebuilding the entire graph (`ensureAudio`
   again). Rebuild in-gesture when possible (`audioDead` flag consumed by the
   next tap) — creation outside a gesture can be denied. Do NOT manually
   `suspend()` on hide on native (iOS suspends the webview itself; a manual
   suspend just adds one more broken state to unwind) — reserve manual
   suspend-on-hide for the web build.

6. **DEV builds keep an audio event trail** (`localStorage['cut.audiolog']`
   pattern: [ts, event, state, currentTimeMs, visibility]) so a device-only
   audio bug can be debugged from DATA — pull the container with
   `xcrun devicectl device copy from --domain-type appDataContainer
   --domain-identifier <bundle.id>` instead of iterating blind.

7. **A music-layer failure must never kill SFX.** Do NOT call the music startup
   inside `ensureAudio`'s try/catch — an exception there nulls the context and
   silently takes every sound down with it. Init the context first; start music
   in its own guarded call. (Cut hit this: total silence from one bug.)

8. **Schedule music on the audio clock, not setTimeout.** Raw `setTimeout`
   jitters ±10ms per note — audibly sloppy rhythm. Use a lookahead scheduler
   (tick every ~120ms, schedule notes while `next < currentTime + 0.4`), and
   skip scheduling while `state !== 'running'` (push `next` forward) or notes
   pile up and blurt on resume.

9. **Automated tests never exercise audio.** `ensureAudio` runs on a real
   pointerdown; test hooks that call game functions directly bypass it — a
   completely broken audio path passes every suite. Verify by hand: preview
   `preview_click` on the canvas + an instrumented `AudioContext` (patch the
   constructor, count `createOscillator` calls over ~2s). An OfflineAudioContext
   render (RMS / peak / onset grid) validates synthesis and levels.

10. **Music taste rules (product, from Tilt/Cut feedback):** no low detuned-saw
    drones, no sustained pads under dark scenes, no sparse random plucks (horror
    tropes — "scary"). Friendly = predictable: fixed tune, steady beat, plucked
    decaying timbres. See Cut's "Night Kalimba" (fixed 8-bar C-major loop,
    76 BPM quarters).

11. **Escalation path: native audio.** If WKWebView audio keeps fighting you
    (latency, interruptions, background modes), Tilt's answer was a tiny native
    plugin (`SoundNative.swift`) — synthesis/playback in AVFoundation, JS just
    sends events. More code, zero WKWebView audio politics.

## Debugging silence, fastest order

1. Ringer switch / volume / Bluetooth route (ask the user — 30 seconds).
2. Pull the DEV audio log (rule 6) — it names the failing shape directly
   ('resume-try' loops = session not reactivating; 'zombie' = rebuild path).
3. Check `actx.state` on device — `'interrupted'` → rules 2–4; `'running'`
   but silent → rule 5 (zombie).
4. Instrumented-probe the web build in the preview (rule 9) to split
   web-logic bugs from iOS-session bugs.
