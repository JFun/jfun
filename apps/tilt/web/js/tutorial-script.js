/* Tilt — tutorial demo script (pure data). The tutorial card runs the REAL
   physics (TrayPhysics.createWorld/step) on this pocket world, driven by this
   scripted gravity track, and renders with the game's own primitives — the
   demo is not a cartoon of the game, it IS the game. Because it's pure data,
   the node tests simulate the whole story and prove it actually plays out:
   roll → wrong hole (stuck) → hard tilt pops it free → sinks in its match.

   Units match the game: world in CELL units (unit = 1), gravity in m/s² as
   the accelerometer feeds it (escape from a wrong cup needs > ~5 m/s²). */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TutorialScript = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // mini portrait tray — same marble/hole radii as the real board
  const WORLD = {
    w: 2.7, h: 4.5,
    marbles: [{ x: 0.7, y: 0.8, r: 0.36, c: "r" }],
    holes: [
      { x: 1.95, y: 1.7, r: 0.42, c: "g" },   // WRONG color — the trap on the way
      { x: 0.55, y: 3.5, r: 0.42, c: "r" },   // the match, down the left wall
    ],
  };

  // piecewise-constant gravity beats; captions teach while physics demonstrates.
  // Act 1 teaches THE VERB with a direction reversal (lean right → ball right,
  // lean back → ball follows back — one-way rolls look scripted, the reversal
  // proves causation). Act 2 is the trap story: wrong hole → STUCK → tilt
  // HARD → pops out → sinks in its match.
  const BEATS = [
    { dur: 0.6,  gx: 0,    gy: 0,    cap: "Tilt the phone — the ball follows" },
    { dur: 0.8,  gx: 2.2,  gy: 0,    cap: "Tilt the phone — the ball follows" },
    { dur: 1.0,  gx: -2.2, gy: 0.05, cap: "Tilt the phone — the ball follows" },
    { dur: 1.1,  gx: 1.9,  gy: 1.02, cap: "Roll it to its matching hole" },
    { dur: 1.3,  gx: 0.8,  gy: 0.6,  cap: "Wrong color? It gets STUCK" },
    { dur: 0.55, gx: -7.2, gy: 1.2,  cap: "Tilt HARD to pop it out", chev: -1 },
    { dur: 0.25, gx: -1.2, gy: 1.5,  cap: "Tilt HARD to pop it out", chev: -1 },
    { dur: 1.8,  gx: -1.2, gy: 1.5,  cap: "Match the color — it sinks in" },
  ];
  const DUR = BEATS.reduce((s, b) => s + b.dur, 0);

  function beatIndexAt(t) {
    let a = 0;
    for (let i = 0; i < BEATS.length; i++) { if (t < a + BEATS[i].dur) return i; a += BEATS[i].dur; }
    return BEATS.length - 1;
  }
  function beatAt(t) { return BEATS[beatIndexAt(t)]; }

  return { WORLD, BEATS, DUR, beatAt, beatIndexAt, VERSION: "3.0.0" };
});
