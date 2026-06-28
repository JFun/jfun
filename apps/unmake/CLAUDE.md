# Unmake — rules for Claude coding sessions

A cozy order-of-operations teardown puzzle. Unity 6 LTS, iOS/Android. First **engine
app** in the studio monorepo (see root `docs/plan/CLAUDE.md` → engine apps are in-scope
under `apps/`, self-contained, but must still serve the distribution-first directive).

## Architecture (do not blur these layers)

- **`Assets/Unmake/Core/` is pure C#** — `noEngineReferences: true`. All puzzle rules
  live here: `TeardownObject` (a dependency graph of `Part`s + `Fastener`s),
  `TeardownSession` (runtime: removability, fragility, tray, stars), `TeardownSolver`
  (Dijkstra feasibility + par). **Never** `using UnityEngine` in Core.
- **`Assets/Unmake/Unity/`** is the skin: `TeardownObjectAsset` (ScriptableObject you
  author in the Inspector → `ToCore()`), `TeardownController` (input/UI ↔ session),
  view/animation. No rules here.
- **`Assets/Unmake/Editor/`** — the Teardown Validator window.
- **`Assets/Unmake/Tests/`** — EditMode NUnit; the contract.

## Non-negotiables

- **Determinism is sacred.** Same object + same actions ⇒ identical result; the solver
  returns identical par + order every run (`Solver_IsDeterministic` pins this). If you
  add a daily generator later, seed it (mulberry32, like `@jfun/web-game-core`).
- **Every shipped object must pass the solver** — `Feasible == true` and the stamped
  `par` equals `ComputePar`. Author objects as `TeardownObjectAsset`, then run
  **Unmake ▸ Teardown Validator** to stamp par. `Authored_Par_Matches_Solver` guards it.
- **A fair object always has a break-free solution.** The solver only explores
  break-free part removals, so feasibility *is* fairness. Don't ship an object the
  validator rejects.
- **Keep Core engine-free** so it stays headless-testable (and server-portable).

## How to add a level

1. Assets ▸ Create ▸ Unmake ▸ Teardown Object.
2. Fill in parts: their fasteners (id/type/tool/`revealedAfter`), `coveredBy`, and any
   `fragile` + `breaksIfPresent`.
3. Run **Unmake ▸ Teardown Validator** → it proves solvability and stamps `par`.
4. Add an EditMode test asserting `Feasible` (and par if it's a sample). Run the suite.

## Test

`Window ▸ General ▸ Test Runner ▸ EditMode ▸ Run All` after every rules change. The
pure-C# Core is **also runnable headlessly** — `bash scripts/dev/test.sh` (or
`dotnet test tests/headless/Unmake.Core.Tests.csproj`) links the same Core sources +
`Tests/CoreTests.cs` and runs them with no Unity (needs `brew install dotnet`). One
contract, two runners — use the headless one when you can't open the editor, and in CI.

## Prime directive (carried from the repo)

Building was never the bottleneck — distribution is. Before this grows features, wire
the **daily teardown + share card + streak** loop and analytics (re-implemented
natively; the JS `@jfun/growth-loop` can't be imported into Unity). See `docs/MVP-SPEC.md`.
