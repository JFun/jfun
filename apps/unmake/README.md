# Unmake

A cozy logic puzzle about taking things apart **in the right order**. Tap to unscrew,
peel back panels, and fully disassemble an object without breaking anything — calm,
tactile, quietly brain-bending. One verb: *remove*.

This is the studio's first **engine app** (Unity, iOS/Android) — see the repo root
`README.md` and `docs/plan/CLAUDE.md` for why engine apps now live in `apps/`. It does
not use the no-build `@jfun/*` web packages, but it honors the same prime directive
(ship a daily/share/streak loop + analytics — see the MVP spec).

## Why it's defensible

The screw-puzzle hits (Screw Jam, etc.) are colour-sorting in disguise; Disassembly 3D
is a physics sandbox with no goal. Nobody owns *"the correct sequence is the puzzle."*
That's the whole game — each object is a hidden **dependency graph**.

## Open it

1. Install **Unity 6 LTS** (`6000.0.x`) via Unity Hub (see `SETUP.md`).
2. Open this folder (`apps/unmake`) as a project. Unity resolves packages and
   regenerates `Library/` on first open.
3. Press Play on an empty scene with a `Bootstrap` component (Assets ▸ Unmake ▸ Unity)
   to watch the sample robot solve + play in the Console — **no art required**.

## Run the tests (the contract)

Two ways, **one source of truth** (`Assets/Unmake/Tests/CoreTests.cs`):

- **Headless / CI** — `bash scripts/dev/test.sh` (needs `brew install dotnet`). The
  `tests/headless/` project *links* the engine-free `Core` + the same NUnit tests and
  runs them with `dotnet test` — no Unity required.
- **In Unity** — `Window ▸ General ▸ Test Runner ▸ EditMode ▸ Run All`.

The suite proves each sample object is fully disassemblable without breakage and that
its **par is solver-optimal** — the same "tests are the contract" stance as Moraine's
BFS solver. Levels 1–5 (`SampleObjects`) are covered.

## Layout

```
Assets/Unmake/
  Core/     ★ pure C#, no UnityEngine — the deterministic rules + solver
    Enums, Fastener, Part, TeardownObject   data model (a dependency graph)
    TeardownSession                          runtime state: removability, fragility, stars
    TeardownSolver                           Dijkstra par oracle + fairness validator
    SampleObjects                            frame / robot / hidden-screw box (from LEVELS.md)
  Unity/    MonoBehaviour + ScriptableObject bridge (no rules live here)
    TeardownObjectAsset                      author levels in the Inspector → ToCore()
    TeardownController                       input/UI ↔ TeardownSession
    Bootstrap                                zero-art Console smoke test
  Editor/   Unmake ▸ Teardown Validator      solve + stamp par on an asset
  Tests/    EditMode NUnit                    the rules + par contract
docs/
  MVP-SPEC.md   the build-ready spec (loop, meta, monetization, gates, scope)
  LEVELS.md     the 12-level ramp + how to author objects
```

## The shape of the core

`Core` has **no UnityEngine dependency** (its asmdef sets `noEngineReferences: true`),
so the rules are plain, deterministic C# that the test suite — and one day a server —
can run headless. The Unity layer is a thin skin over it. Keep game *rules* in `Core`;
keep meshes, taps, and animation in `Unity`.
