# iOS Web Audio in Capacitor games — the gotcha playbook

Every studio game synthesizes audio with Web Audio inside a Capacitor WKWebView.
This page is the accumulated scar tissue (Tilt, Cut, …) — **read it before
touching audio in any app, and copy the checklist into every new shell.** Each
gotcha below silently produces "no sound" with zero errors; none of them are
caught by automated tests.

## The checklist (copy into every new iOS shell / game.js)

Native (`MainViewController.capacitorDidLoad`, needs `import AVFoundation`):

```swift
// 1. Silent switch: WKWebView's default AVAudioSession is 'ambient' — the
//    ringer/mute switch silences it completely. Games with music use .playback.
try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
try? AVAudioSession.sharedInstance().setActive(true)
// 2. Background/foreground: iOS DEACTIVATES the session on background or
//    interruption (call, Siri, alarm). Without re-activation on foreground the
//    WKWebView AudioContext stays dead and the game returns SILENT.
NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification,
                                       object: nil, queue: .main) { _ in
    try? AVAudioSession.sharedInstance().setActive(true)
}
```

Web (game.js):

```js
// 3. Resume-after-background — the context comes back in THREE bad shapes:
//      'suspended'   → resume() works
//      'interrupted' → SAFARI-ONLY state; ==='suspended' checks never match it;
//                      resume() works once the session is reactivated (rule 2)
//      ZOMBIE        → state SAYS 'running' but the output is dead and
//                      currentTime is FROZEN; resume() is a no-op. The ONLY fix
//                      is closing the context and rebuilding the whole graph.
//    So: retry resume with backoff, then VERIFY with an aliveness probe (is the
//    clock advancing?); dead → rebuild. See apps/cut/web/js/game.js
//    (audioAlive / rebuildAudio / resumeAudio / healAudio) for the canonical copy.
function audioAlive(cb){ // the state can LIE — trust only an advancing clock
  if(!actx||actx.state!=='running'){ cb(false); return; }
  const t0=actx.currentTime;
  setTimeout(()=>cb(!!actx&&actx.currentTime>t0),150);
}
// 4. Rebuilds outside a user gesture may be denied → keep an `audioDead` flag;
//    EVERY gesture handler calls healAudio(), which rebuilds in-gesture
//    (guaranteed allowed) or resumes anything !== 'running'. Never gate on
//    ==='suspended'.
```

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
