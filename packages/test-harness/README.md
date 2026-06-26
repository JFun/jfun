# @studio/test-harness

The test discipline, packaged: assertion + golden + determinism + invariant
helpers, so every package writes tests the same shape (syntax → golden →
invariants). Plain CJS — a Node test utility.

```js
const { harness } = require("@studio/test-harness");
const t = harness("engine");
t.section("determinism golden");
t.golden("corner D,U", () => E.key(run(board, ["D","U"])), "100000|...");
t.deterministic("same seed", () => run(board, dirs));
t.invariant("every board solvable", BOARDS, b => E.solvable(toGrid(b), b.mode));
process.exit(t.summary());   // 0 if green, 1 otherwise
```

Per-game golden fixtures and board data stay in each game; this is the scaffolding
around them.
