# @studio/growth-loop ★

The hero. A drop-in **daily + streak + spoiler-free share card + k-funnel**, fully
instrumented — so no future game launches loop-less again. The package owns the
loop; the game owns the gameplay.

## Why it exists

> Building was never the bottleneck — distribution is. This is the one piece of
> shared code that attacks the actual problem. Every game wires it in a few lines
> and ships *with* a loop by default instead of bolting one on never.

## Consume it (no build)

It ships as one UMD file, so a no-build game loads it like any other script and
reads `window.GrowthLoop`:

```html
<script src="js/growth-loop.js"></script>
```

Modern (ESM/bundler) consumers import the named API:

```js
import { configure, Daily, Streak, ShareCard, LoopTrack } from "@studio/growth-loop";
```

## Wire it (the whole loop)

```js
const GL = window.GrowthLoop;                       // or the ESM import
GL.configure({
  namespace: "moraine",                             // isolates localStorage
  epoch: new Date("2026-06-25T00:00:00Z"),          // launch day → "#1"
  track: window.Track,                              // your @studio/analytics sink
});

// 1. Deterministic daily — one instance for everyone, no server.
const day  = GL.Daily.dayIndex();                   // monotonic UTC handle
const seed = GL.Daily.seedForDate();                // well-mixed RNG seed for `day`
const n    = GL.Daily.number(day);                  // human "#142"

if (GL.Daily.isPlayed(day)) showResult(GL.Daily.playedResult(day));
else {
  GL.LoopTrack.dailyStart(day);
  const board = pickDailyBoard(seed);               // YOUR game seeds its content
  // …play…
  GL.Daily.markPlayed(day, { swipes, par });        // 2. one-attempt lock
  GL.Streak.bump(day);                              // 3. streak (retention spine)
  GL.LoopTrack.dailySolve({ swipes, par });
}

// 4. The share card IS the ad — spoiler-free, ownable, carries the play link.
const variant = GL.ShareCard.pickVariant(day);
const png = await GL.ShareCard.render({
  title: "Moraine", n, line: GL.ShareCard.variantLine(variant, { line: `Solved in ${swipes} ⭐` }),
  motif: boardThumbObfuscated,                      // OPTIONAL — must NOT spoil
  url: GL.Daily.buildLink("https://moraine.app/", { d: day, ref: myId }),
});
const channel = await GL.ShareCard.share(png, { url, text: `Moraine #${n}`, filename: `moraine-${n}` });
GL.LoopTrack.cardShare({ variant, channel });

// On landing from a shared link (?d=…&ref=…):
const { d, ref } = GL.Daily.parseLink();
if (ref) { GL.LoopTrack.linkOpen({ ref }); /* …if they play… */ GL.LoopTrack.playFromLink({ ref }); }
```

## The k-funnel (the only growth scoreboard)

`daily_start → daily_solve → card_share → link_open → play_from_link`. Stable
event names — **don't rename them**, dashboards derive share-rate, link-CTR, and
`k = shares × conversion` from them.

## Determinism is sacred

`Daily.dayIndex` and `Daily.seedForDate` are pure functions of the UTC date,
pinned by `scripts/dev/golden.cjs`. Change them and every existing share link and
daily silently desyncs. A diff to the golden must be a deliberate, migration-aware
change. Run `bash scripts/dev/test.sh` after every edit.
