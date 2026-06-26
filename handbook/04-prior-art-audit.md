# 04 — Prior-Art / Differentiation Audit

A repeatable method to (a) dodge an Apple 4.3 rejection ([01](01-apple-rules.md))
and (b) confirm the concept is actually ownable ([00](00-strategy.md)). Run it at
**Gate 0**, before greybox. It worked — Gravity Shift → Moraine after the audit.

## The four surfaces

1. **App Store** — search the mechanic + the obvious names. Use multiple search
   methods (the autocomplete, the category top charts, the "similar apps" rail).
   Note the incumbents and exactly how your one innovation differs.
2. **Steam** — broader indie space; catches PC originals the App Store misses.
3. **USPTO** — a 10-minute manual trademark search on the name (and close
   variants). Clear the *name*, not just the concept.
4. **Web / general** — plain search for the name + mechanic; catches itch.io,
   crazygames, viral one-offs (e.g. Wplace-style phenomena).

## What you're deciding

- **Is the mechanic a genre primitive or a specific hit's identity?** Genre = safe;
  specific clone = reject risk + no moat.
- **Is the NAME clear** on all four surfaces? If not, rename now (cheap) not later
  (expensive — store listing, assets, bundle id).
- **What is the one-sentence differentiator?** Write it down; it's both the
  reviewer note and the marketing hook.

## Outputs

- A filled `02-PRIOR-ART.md` in the project kit ([05](05-kit-template/)) listing
  incumbents, the differentiator, and the name-clearance result per surface.
- A backup name (in case USPTO/legal flags the first).
- Go/rename/kill decision recorded in the decision log.

## Note

Keep the audit honest — the point is to find the reason to *change* the concept
early, not to rubber-stamp it. "Found nothing" usually means you didn't search the
right surface.
