# 03 — Distribution ★ (read this one most)

## The thesis the whole studio is built around

> **Building was never the bottleneck. Distribution is.**

Every project that died, died on *ship-then-silence* — not on code. A polished game
with no growth engine goes quiet (every entry on [06-lessons](06-lessons.md)). So
**distribution is the project**, and shared infra earns its existence only by
serving it. The failure mode of a monorepo is *productive procrastination*:
polishing infra while dodging the unglamorous growth work. Don't.

## The loop, codified

The one structural reason player N brings player N+1. Four parts, all in
[`@jfun/growth-loop`](../../packages/growth-loop/README.md) so every game ships them
by default:

1. **Daily = scarcity.** One instance/day, one attempt, a streak. Scarcity is what
   makes a result worth sharing and worth returning for. Resist "play again."
2. **The share card IS the ad — obsess over it.**
   - **Spoiler-free always** — never reveal today's solution to a recipient.
   - **Ownable signature** — a mark + "#<day>".
   - **Curiosity-inducing** — "same board — beat me?"
   - **Carries the instant-play link.**
   - **A/B the variants** (minimal score · "beat X% of the world" · "beat me").
3. **The link is the invite.** `?d=<day>&ref=<id>` opens the exact instance
   instantly on web (no install). Paid UA can't follow a link into a chat —
   **organic by construction.**
4. **Instrument k from line one.** `k = shares × conversion` is the number that
   decides whether a game lives.

## The k-funnel (the only growth scoreboard)

`daily_start → daily_solve → card_share → link_open → play_from_link`
→ derived: **share-rate, link-CTR, k.** `LoopTrack` fires these with **stable event
names** in every game — never rename them; the dashboards (and cross-game
comparison) depend on identical names.

## What does NOT count as a loop

A single-player utility/calm game with a "share" button bolted on is not a loop —
it's a vitamin (WhatNow, PAi, Lullaby Lane). A content/SEO play retains no users
(Final Chapter). The loop must make the thing **useless or less-good alone**, so
inviting is the natural move, not a chore. If you can't say in one sentence why N
brings N+1, you don't have a loop yet ([Gate 4](00-strategy.md)).

## Sequencing rule

If the monorepo (or any infra) ever becomes the reason a game stays loop-less,
**stop and build the loop.** Moraine v1.1 was the proof: the first unit of monorepo
work was also the highest-leverage product work — building `@jfun/growth-loop`
*and* shipping it into Moraine were the same task.
