# Unmake — Level ramp & authoring

Tutorial is woven into levels 1–3 (no separate wall). Each object reuses a shared
library of ~30–40 part meshes. Levels **1–5** are already built in code in
`Core/SampleObjects.cs` and pinned by the test suite (marked ★) — each one
solver-proven feasible with a stamped, solver-exact par.

| # | Object | Teaches | New lever |
|---|--------|---------|-----------|
| 1 ★ | Picture frame | tap-unscrew + lift | straight cover chain (par 7) |
| 2 ★ | Wall clock | remove cover → reveal | one cover layer (par 6) |
| 3 ★ | Toy car | rotate to find a hidden screw underneath | `revealedAfter` (par 6) |
| 4 ★ | Desk lamp | longer chain (shade→bulb→reflector→socket) + arm + base | depth (par 11) |
| 5 ★ | Wind-up robot | release the spring before the chest panel | `fragile` + tool swap (par 12) |
| 6 | Old radio | many small parts | tray-slot pressure |
| 7 | Handheld console | disconnect the ribbon cable before the board | `wire` fragility |
| 8 | Bicycle | several valid orders, one fragile chain | combinatorial |
| 9 | Camera | lens→mirror box→shutter, hidden each layer | deep nesting |
| 10 | Sewing machine | a bit of every lever | synthesis |
| 11 | Arcade cabinet (mini) | showpiece complexity | scale |
| 12 | Mystery heirloom | finale + a "what's inside" reveal | payoff |

(★ = `HiddenScrewBox` is an extra tiny object used only by tests for the hidden-fastener
rule; it's not a shipped level.)

## The data model (how an object is encoded)

An object is a list of **parts**; each part has:

- `fasteners` — each with `id`, `type` (Screw/Bolt/Clip/Pin/Wire/Spring), `tool`
  (None/Screwdriver/Wrench/Pliers/Cutter), optional `colorId`, and optional
  `revealedAfter` (a part id that must be removed before the fastener is reachable —
  this is how "hidden screw" works).
- `coveredBy` — part ids physically on top; they must be removed first.
- `fragile` + `breaksIfPresent` — if fragile, the listed parts must be removed **before**
  this one or it breaks (loses the intact star; fails Challenge mode).

A part is **removable** when it's uncovered *and* all its fasteners are gone. The whole
object is solved when every part is removed.

### Worked example — the wind-up robot (level 5, par 12)

```
back_plate   : screws screw_b1, screw_b2
chest_panel  : screw  screw_c1
battery      : (no fasteners)  coveredBy [back_plate]
spring       : (no fasteners)  coveredBy [back_plate]  fragile, breaksIfPresent [chest_panel]
arm_left     : screw  screw_a1
head         : bolt   bolt_h1 (tool: Wrench)
```

Break-free optimal order (what the solver returns):
`unscrew screw_c1 → lift chest_panel → unscrew screw_b1 → unscrew screw_b2 →
lift back_plate → lift battery → lift spring → unscrew screw_a1 → lift arm_left →
[tool:Wrench] unscrew bolt_h1 → lift head`.

Par = 5 fasteners + 6 lifts + 1 wrench swap = **12**. Pull the spring while the chest
panel is still on and it snaps — that's the level's "aha."

## Authoring workflow

1. Assets ▸ Create ▸ Unmake ▸ Teardown Object; fill in the parts as above.
2. Run **Unmake ▸ Teardown Validator** — it proves the object is fully disassemblable
   without breakage, prints the optimal order, and stamps `par`.
3. Add an EditMode test asserting `Feasible` (and the par for hero levels). Run the
   suite. A level that the validator rejects does not ship.

## Difficulty knobs (for tuning the ramp)

Number of parts · depth of the cover chain · count of hidden fasteners · number of
fragile constraints · tray-slot limit · number of distinct tools. Raise one knob at a
time per level; let par creep up smoothly.
