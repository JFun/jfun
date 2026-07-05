/* scratch: simulate the tutorial beat script with the real physics and print
   the story milestones — used to tune the beat numbers before pinning tests */
const path = require("path");
const PH = require(path.join(__dirname, "..", "..", "web", "js", "physics.js"));
const TUT = require(path.join(__dirname, "..", "..", "web", "js", "tutorial-script.js"));

const w = PH.createWorld({
  w: TUT.WORLD.w, h: TUT.WORLD.h, pad: 0, unit: 1,
  marbles: TUT.WORLD.marbles.map(m => ({ ...m })),
  holes: TUT.WORLD.holes.map(h => ({ ...h })),
  blocks: [],
});
const m = w.marbles[0];
const green = TUT.WORLD.holes[0], red = TUT.WORLD.holes[1];
let t = 0, plunkT = null, escT = null, capT = null, lodged = false;
const steps = Math.round((TUT.DUR + 0.5) / PH.DT);
for (let i = 0; i < steps; i++) {
  const b = TUT.beatAt(t);
  PH.step(w, b);
  for (const e of w.events) {
    if (e.type === "plunk" && plunkT == null) { plunkT = t; lodged = true; }
    if (e.type === "capture" && capT == null) capT = t;
  }
  w.events.length = 0;
  if (lodged && escT == null && Math.hypot(m.x - green.x, m.y - green.y) > 0.7) escT = t;
  t += PH.DT;
  if (i % 60 === 0) console.log(t.toFixed(2), "pos", m.x.toFixed(2), m.y.toFixed(2),
    "v", Math.hypot(m.vx, m.vy).toFixed(2), "cap", !!m.captured, "beat", b.cap.slice(0, 12));
}
console.log("---");
console.log("plunk into green at", plunkT && plunkT.toFixed(2));
console.log("escaped green at   ", escT && escT.toFixed(2));
console.log("captured at        ", capT && capT.toFixed(2), m.captured ? "(RED ✓)" : "(NOT CAPTURED ✗)");
console.log("solved:", PH.solved(w), " DUR:", TUT.DUR.toFixed(2));
