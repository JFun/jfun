# `@jfun/growth-loop` — the hero package

*v0.1, June 25, 2026. The one piece of shared code that attacks the real problem (distribution). Build this FIRST, and ship it into Moraine as its first consumer — that single move builds the package AND gives Moraine the loop it launched without.*

## Goal

Make "ship with a daily + share + streak loop, fully instrumented for virality" a **few lines of wiring**, so no future game ever launches loop-less again. The package owns the loop; the game owns the gameplay.

## What it provides (public API sketch)

```js
import { Daily, Streak, ShareCard, LoopTrack } from "@jfun/growth-loop";

// 1. Deterministic daily — same instance for everyone, no server
const today = Daily.seedForDate(new Date());     // UTC-date → int seed
const locked = Daily.isPlayed(today);            // one-attempt lock (localStorage)
Daily.markPlayed(today, { swipes: 4, par: 4 });

// 2. Streak — consecutive daily completions
const s = Streak.current();                      // {count, lastDay}
Streak.bump(today);

// 3. Share card — spoiler-free, ownable, carries the play link
const png = await ShareCard.render({
  title: "Moraine", n: today, line: "Solved in 4 ⭐ (par 4)",
  motif: boardThumbObfuscated,                   // optional, must NOT spoil
  url: "https://moraine.app/?d=142&ref=ME",
});
await ShareCard.share(png);                      // Web Share API / canvas→PNG fallback

// 4. The k-funnel — the only growth scoreboard
LoopTrack.dailyStart(today);
LoopTrack.dailySolve({ swipes, par });
LoopTrack.cardShare({ variant });
LoopTrack.linkOpen({ ref });                     // a shared link landed
LoopTrack.playFromLink({ ref });
// → derived: share-rate, link-CTR, k = shares × conversion
```

## Design rules (carry the lessons)

- **Daily = scarcity.** One instance/day, one attempt, a streak. Scarcity is what makes a result worth sharing and worth returning for. Resist "play again."
- **The share card is the ad — obsess over it.** Spoiler-free always (never reveal today's solution to a recipient). Ownable signature (mark + "#<day>"). Curiosity-inducing ("same board — beat me?"). Carries the instant-play link. Support **A/B variants** (minimal score · "beat X% of the world" · "beat me" challenge) and let `cardShare`/`linkOpen` pick the winner.
- **The link is the invite.** `?d=<day>&ref=<id>` opens the exact instance instantly on web (no install). Paid UA can't follow a link into a chat — organic by construction.
- **Instrument from line one.** k is the number that decides whether a game lives. Bake the funnel into the package so every game measures it identically.
- **Framework-agnostic.** No game-specific assumptions; the game passes in its result + an optional non-spoiling motif. Works for a puzzle, a story, anything.
- **Server-optional.** Daily/streak/share work fully client-side. The only thing needing a backend is the "beat X% of the world" percentile (add a tiny score-count endpoint later; greybox can estimate locally).

## First consumer: Moraine (do this immediately)

Moraine is in review with finite content (30 boards) and no loop. Wiring `@jfun/growth-loop` into it:
- adds a **daily board** (curate/rotate from the board bank until the generator exists) → a reason to return past board 30,
- adds the **share card** ("Moraine #142 — solved in 4 ⭐") → the missing acquisition loop,
- adds the **streak** → the retention spine,
- ships as **Moraine v1.1**, ready the moment v1.0 clears review.

So the first unit of monorepo work *is* the highest-leverage product work. That's the whole point of making this the hero.

## Definition of done

A game adds `@jfun/growth-loop`, passes its daily result + a link, and gets: a deterministic daily, one-attempt lock, a streak, a spoiler-free shareable card, and a full k-funnel in the analytics dashboard — without writing any of that itself. Moraine v1.1 is the proof.
