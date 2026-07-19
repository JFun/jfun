/* @jfun/test-harness — the test discipline, packaged. Carries the Lanthorn/
   Moraine shape (syntax → determinism golden → solver/bot invariants) as small
   reusable helpers so every package writes golden + invariant tests the same way.
   Plain CJS (a Node test utility, not browser code). Per-game golden FIXTURES and
   board data stay in each game; this is just the scaffolding around them.

   Usage:
     const { harness } = require("@jfun/test-harness");
     const t = harness("engine");
     t.section("determinism golden");
     t.golden("corner D,U", () => E.key(run(board, ["D","U"])), "100000|...");
     t.ok("solvable", E.solvable(board, mode));
     process.exit(t.summary());            // 0 if all passed, 1 otherwise */
"use strict";

function harness(label) {
  let pass = 0, fail = 0;
  const fails = [];
  const J = v => { try { return JSON.stringify(v); } catch (e) { return String(v); } };

  const api = {
    section(name) { console.log("— " + name + " —"); return api; },

    ok(name, cond) {
      if (cond) pass++;
      else { fail++; fails.push(name); console.error("  ✗ " + name); }
      return api;
    },

    eq(name, got, want) {
      const g = J(got), w = J(want);
      if (g === w) pass++;
      else { fail++; fails.push(name); console.error(`  ✗ ${name}\n      got  ${g}\n      want ${w}`); }
      return api;
    },

    // A golden value: run fn() and assert it equals the PINNED expected. The
    // contract that makes extraction parity-safe — a diff here is intentional.
    golden(name, fn, expected) { return api.eq("golden: " + name, fn(), expected); },

    // Determinism: fn() must produce identical output across `runs` invocations
    // (same inputs → identical output). Catches hidden nondeterminism.
    deterministic(name, fn, runs) {
      runs = runs || 3;
      const first = J(fn());
      for (let i = 1; i < runs; i++) if (J(fn()) !== first) return api.ok("deterministic: " + name, false);
      return api.ok("deterministic: " + name, true);
    },

    // Invariant over a set of items — asserts pred(item) holds for every one,
    // naming the first failure (the solver/bot-invariant pattern).
    invariant(name, items, pred) {
      for (const it of items) {
        let okv = false; try { okv = !!pred(it); } catch (e) { okv = false; }
        if (!okv) return api.ok(`${name} [${labelOf(it)}]`, false);
      }
      return api.ok(name + " (×" + items.length + ")", true);
    },

    // Verification Layer 2 (docs/handbook/10-verification.md): seeded invariant
    // FUZZ as a first-class test shape. Runs `trials` fresh worlds × `rounds`
    // random actions each; `round(world, rng, trial, round)` performs ONE action
    // (with per-step invariant checks inside) and returns a violation string or
    // null/undefined. Deterministic given a seeded rng — a failure reproduces
    // exactly and is tagged with its trial/round. The technique that found
    // Tilt's 1e-9 collision explosion and well-freeze capture bug, which unit
    // assertions plus weeks of human play had missed.
    fuzz(name, cfg) {
      const trials = cfg.trials == null ? 6 : cfg.trials;
      const rounds = cfg.rounds == null ? 6 : cfg.rounds;
      let violation = null;
      for (let tr = 0; tr < trials && !violation; tr++) {
        const world = cfg.setup(tr);
        for (let r = 0; r < rounds && !violation; r++) {
          try { violation = cfg.round(world, cfg.rng, tr, r) || null; }
          catch (e) { violation = "THREW: " + (e && e.message); }
          if (violation) violation += ` [trial ${tr} round ${r}]`;
        }
      }
      return api.ok(name + (violation ? " — " + violation : ""), !violation);
    },

    // Print the tally and return an exit code (0 = all passed). Pass to
    // process.exit(t.summary()).
    summary() {
      console.log(`\n${fail ? "✗" : "✓"} ${label}: ${pass} passed, ${fail} failed`);
      return fail ? 1 : 0;
    },
    get passed() { return pass; },
    get failed() { return fail; },
    get failures() { return fails.slice(); },
  };
  function labelOf(it) { return it && (it.id || it.name) ? (it.id || it.name) : J(it); }
  return api;
}

module.exports = { harness, VERSION: "0.1.0" };
