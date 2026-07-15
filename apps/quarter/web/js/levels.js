/* QUARTER — level backbone (T0 marble/walls/goal · T1 boulder).
   Tiny specs: an N×N bitmap + par (in TURNS, never time). Every level is
   certified by scripts/dev/verify.cjs — the exhaustive {L,R} search through the
   real engine — so par is the PROVEN minimum turn count, not a guess.
     '#' wall · '.' open · 'I' ice · 'M' marble · 'G' goal · 'B' boulder · 'Q' boulder-on-goal */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QuarterLevels = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const LEVELS = [
    // ---- T0: tap = quarter-turn · tumble · settle · undo (9×9) ----
    { par: 2, rows: [                       // L1 — U-corridor: fall, roll, rise. [R,R]
      "#########",
      "##M###G##",
      "##.###.##",
      "##.###.##",
      "##.###.##",
      "##.###.##",
      "##.....##",
      "#########",
      "#########"] },
    { par: 3, rows: [                       // L2 — ice S-bend: down, skate, up. [R,R,R]
      "#########",
      "##M#G..##",
      "##.###.##",
      "##.###.##",
      "##.###.##",
      "##.###.##",
      "##IIIII##",
      "#########",
      "#########"] },
    { par: 2, rows: [                       // L3 — L-bend the other way (teach CCW). [L,L]
      "#########",
      "##G###M##",
      "##.###.##",
      "##.###.##",
      "##.###.##",
      "##.###.##",
      "##.....##",
      "#########",
      "#########"] },
    { par: 5, rows: [                       // L4 — offset drop + banks (verifier: min RLLRR)
      "#########",
      "##M....##",
      "######.##",
      "##.....##",
      "##.######",
      "##....G##",
      "########.",
      "#########",
      "#########"] },
    // ---- T1: boulder — a 2nd body (~6× mass) that blocks + plugs ----
    { par: 5, rows: [                       // L5 — boulder plugs the goal; dump it in the pit beside it. [R,L,L,L,L]
      "#########",
      "##M######",
      "##.######",
      "##.######",
      "##.######",
      "##.######",
      "##....Q##",
      "#####.###",
      "#########"] },
    { par: 5, rows: [                       // L6 — boulder shelf + gap home (verifier: min LLLLR)
      "#########",
      "##M..B..#",
      "##.####.#",
      "##.####.#",
      "##.####.#",
      "##....G.#",
      "#########",
      "#########",
      "#########"] },
  ];
  return { LEVELS };
});
