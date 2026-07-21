# Browser pixel-verify — proving a visual/feel change actually renders

Companion to [10-verification](10-verification.md): the machine layers prove the
*logic* is sound; this page is how you prove the *pixels* are what you think —
the last check before a device round-trip. Born from the Rattle rattle-strength
saga (2026-07): a mechanic that fired but was too weak to see, and ~4 probes
wasted chasing a phantom "it's broken" that was really Chrome serving a stale
`engine.js`. The rule that ties it together:

> A UI/feel change isn't done until you've **seen the pixels change** — but the
> browser lies to you in specific, repeatable ways. Make it honest first.

## The six ways the browser lies (and the fix)

| # | The lie | Symptom | The honest tool |
|---|---|---|---|
| 1 | **Stale JS** — `python -m http.server` sends no `Cache-Control`, so Chrome heuristically caches your `.js`. After you edit, the preview runs your OLD code. | Your fix "does nothing" live, but Node sees it fine. | Serve with **`@jfun/web-game-core`'s `serve.cjs`** (sends `no-store`), or cache-bust the `<script src>` query. |
| 2 | **Wrong frame** — a screenshot after a tap lands on whatever frame the round-trip finishes on (usually *settled*). | A transient (loft, flash, shake) looks like it never happened. | Sample world state over rAF frames and report the **arc**; screenshot near the measured apex. |
| 3 | **Eyeballing colour** — a translucent overlay shifts a bead's colour by a dozen RGB points; the eye says "fine". | "Looks about right" ships a tint bug. | **`getImageData`** and compare bytes. Scope the region (exclude HUD). |
| 4 | **Synthetic events miss** — a dispatched `PointerEvent` can silently not reach the handler (coords, capture, guards). | The action never fires; you measure noise. | Drive the game through its **automation hook** (below), not synthetic input. |
| 5 | **Perceptibility** — a mechanic is fully wired yet too weak to notice. | "Nothing happens" even though the code runs. | Measure the **effect magnitude in Node** against a threshold (see below). |
| 6 | **Render order** — an overlay drawn inside the field loop is painted over by a later sibling. | The cue is "there" in code, invisible on screen. | Draw overlays/cues **after** the whole field pass. |

## Node is the physics oracle

The deterministic engine (browser + Node UMD) runs *identically* in both. Node
has no HTTP cache, no render loop, no screenshot timing — so when a browser
number is ambiguous or suspicious, **reproduce it in Node**. In the rattle saga
Node measured a 4.9R pile loft while the live browser measured 0.1R for the same
level; the *gap itself was the bug* (lie #1, a cached engine), not the physics.
Trust Node; make the browser agree with it.

Perceptibility (lie #5) is just this pointed at feel: a jiggle gravity re-settles
to the *same* rest config is invisible even though "it fired". The old Rattle
rattle moved beads **0.05 of a bead-radius** and the clusters came out identical
— prove the magnitude, don't assume the wiring is enough.

## The automation hook — `window.__<game>`

Expose a tiny object on `window` that reads live state and fires actions. It
makes browser verification deterministic and immune to lies #2 and #4, and lets
`javascript_tool` measure the real world instead of screenshotting guesses:

```js
window.__r = {
  world:   () => world,                       // the live sim — read ball.y, objectives, …
  state:   () => E.state(world),              // a serialisable snapshot
  tapWorld:(x, y) => { const r = E.tap(world, x, y); consume(); return r; },
  rattle:  () => E.doRattle(world),           // fire a verb straight, no synthetic input
  goto:    build,                             // jump to a level/state
};
```

With it, measuring a transient is a loop, not a screenshot gamble:

```js
const w = window.__r.world(), top = () => Math.min(...w.balls.map(b => b.y));
const rest = top(); window.__r.rattle();
const arc = []; for (let i = 0; i < 60; i++) { await new Promise(requestAnimationFrame); arc.push(top()); }
// arc reveals the full up-and-back loft; rest - min(arc) is the amplitude.
```

Rattle and Quarter already ship this. **Gate it to dev** (`DEV_UNLOCK` — localhost/LAN
origin or a `#if DEBUG` injected flag) so it never reaches production.

## Two render-order laws (both bit us this arc)

- **Overlays render after the field pass.** A cue drawn inside the per-object
  loop gets painted over by later siblings — Rattle's crate spotlight was
  invisible until moved after the bead pass (pixel-sampled: 21/192 gold →
  visible only post-pass).
- **Any overlay with opacity > 0 tints what's under it.** Alpha-compositing a
  "lock" or "wood" layer over a coloured element shifts its colour (measured red
  238,98,100 → 208,108,81 at 0.8α). A mark on a coloured face must be **opaque**
  (covers-or-doesn't) or drawn **off** the face.

## Adopting in a game

1. Swap the dev server: point the app's `.claude/launch.json` at
   `node ../../packages/web-game-core/scripts/dev/serve.cjs web <port>` instead
   of `python3 -m http.server`. (Or keep python and cache-bust `<script>` query
   strings — but the server is one line and forgets forever.)
2. Add a dev-gated `window.__<game>` hook exposing `world/state/<verb>/goto`.
3. When verifying a feel/motion change, **measure the magnitude in Node first**,
   then confirm the browser agrees; screenshot last, at the right frame.

One line to keep: *the machines find the logical bugs, the browser confirms the
render, and the human is left with only true feel.*
