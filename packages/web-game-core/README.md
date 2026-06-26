# @jfun/web-game-core

Deterministic primitives for the vanilla-JS games (Lanthorn/Moraine lineage). The
**reusable** parts only — the game RULES stay in each game's `engine.js`.

```js
import { makeRNG, fullLines, bfsSolve } from "@jfun/web-game-core";
// or browser global `WebGameCore`
```

- **`makeRNG(seed)`** — canonical mulberry32. Same seed → identical stream
  everywhere (pairs with `@jfun/growth-loop`'s `seedForDate`). Pinned by a golden.
- **grid** — `makeGrid/cloneGrid/key/fromKey`, cells `EMPTY/FILLED/WALL`.
- **`fullLines(grid, {isFilled,isClearable})`** — generic full-row/col detection
  with the loose-guard (an all-wall line never clears).
- **`bfsSolve(start, spec)` / `solvable(start, spec, max)`** — the BFS validation
  scaffold (prove solvable + optimal par), parameterized by the game's
  `moves/apply/isWon/key`. The discipline that makes extraction safe.
