# 05 — Project Kit Template

The blanks every new project starts from (the structure used by `dusk-prd`,
`gamesmith`, `encore`, `plot-twist`, `gravity-shift-prd`). Copy this folder into a
new project's `<name>-prd/` and fill it, in order. The gates in
[02-validation](02-validation.md) map onto these docs.

| File | Fill at | Gate |
|---|---|---|
| `00-CONTEXT.md` | concept | Gate 0 — incl. the Gate 4 one-sentence spread answer |
| `01-PRD.md` | concept → greybox | the complexity budget §0 is mandatory |
| `02-PRIOR-ART.md` | concept | Gate 0 — the [audit](../04-prior-art-audit.md) output |
| `03-PROTOTYPE-PLAN.md` | greybox | how the no-build greybox proves fun + solvability |

Keep them short and current — the same rule as the handbook. The deep research
lives in `game-context`/`app-context`; these are the project's working decisions.
