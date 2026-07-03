/* Tilt physics-core tests. The contract that makes tilt-the-phone mode shippable:
   deterministic trajectories (fixed timestep, no randomness), marbles never escape
   the tray, gravity accelerates and friction dissipates, collisions emit clacks,
   and capture fires ONLY on the matching hole. Uses @jfun/test-harness. */
const path = require("path");
const { harness } = require("@jfun/test-harness");
const PH = require(path.join(__dirname, "..", "..", "web", "js", "physics.js"));
const Core = require("@jfun/web-game-core");
const t = harness("tilt physics");

const UNIT = 50;
function world(marbles, holes, params) {
  return PH.createWorld({ w: 400, h: 400, pad: 10, unit: UNIT,
    marbles: marbles.map(m => Object.assign({ r: 18 }, m)),
    holes: (holes || []).map(h => Object.assign({ r: 19 }, h)), params });
}
function run(w, gravity, seconds) {
  const steps = Math.round(seconds / PH.DT);
  const evs = [];
  for (let i = 0; i < steps; i++) {
    const g = typeof gravity === "function" ? gravity(i * PH.DT) : gravity;
    PH.step(w, g);
    for (const e of w.events) evs.push(e);
  }
  return evs;
}

t.section("determinism");
{
  const mk = () => {
    const w = world([{ x: 60, y: 60, c: "r" }, { x: 200, y: 220, c: "b" }], [{ x: 300, y: 300, c: "r" }]);
    run(w, tt => ({ gx: Math.sin(tt * 3) * 4, gy: Math.cos(tt * 2) * 4 }), 5);
    return w.marbles.map(m => [m.x.toFixed(6), m.y.toFixed(6), m.captured]);
  };
  t.deterministic("5s varied-gravity trajectory", mk, 3);
}

t.section("gravity + friction");
{
  const w = world([{ x: 40, y: 200, c: "r" }]);
  run(w, { gx: 4, gy: 0 }, 0.5);
  const m = w.marbles[0];
  t.ok("gravity accelerates rightward", m.vx > UNIT && m.x > 40);
  // cut gravity: a real marble COASTS (rolling resistance is small)…
  run(w, { gx: 0, gy: 0 }, 1);
  t.ok("marble coasts after gravity cuts (no syrup)", Math.hypot(m.vx, m.vy) > UNIT * 3);
  // …but does come to rest eventually
  run(w, { gx: 0, gy: 0 }, 12);
  t.ok("rolling resistance eventually rests it", Math.hypot(m.vx, m.vy) < 1e-6);
}
{
  // no tilt, no motion: a resting marble stays put (no jitter/drift)
  const w = world([{ x: 200, y: 200, c: "r" }]);
  run(w, { gx: 0, gy: 0 }, 2);
  t.ok("flat tray → marble rests", w.marbles[0].x === 200 && w.marbles[0].y === 200);
}

t.section("containment");
{
  const w = world([{ x: 60, y: 60, c: "r" }, { x: 340, y: 60, c: "b" }, { x: 200, y: 340, c: "g" }]);
  const rng = Core.makeRNG(7);
  // 30s of erratic strong tilting
  const evs = run(w, () => ({ gx: (rng() - 0.5) * 19.6, gy: (rng() - 0.5) * 19.6 }), 30);
  const inside = w.marbles.every(m => m.x >= 10 + m.r - 1e-6 && m.x <= 390 - m.r + 1e-6 && m.y >= 10 + m.r - 1e-6 && m.y <= 390 - m.r + 1e-6);
  t.ok("marbles never escape the tray (30s hard shaking)", inside);
  t.ok("wall hits were emitted", evs.some(e => e.type === "wall"));
  t.ok("no NaN/instability", w.marbles.every(m => isFinite(m.x) && isFinite(m.y) && isFinite(m.vx) && isFinite(m.vy)));
}

t.section("collisions");
{
  const w = world([{ x: 100, y: 200, c: "r" }, { x: 300, y: 200, c: "b" }]);
  w.marbles[0].vx = 300; w.marbles[1].vx = -300;   // head-on
  const evs = run(w, { gx: 0, gy: 0 }, 1);
  t.ok("head-on collision emits a clack", evs.some(e => e.type === "clack" && e.speed > 100));
  t.ok("marbles bounced apart", w.marbles[0].x < w.marbles[1].x);
  const overlap = (w.marbles[0].r + w.marbles[1].r) - Math.hypot(w.marbles[1].x - w.marbles[0].x, w.marbles[1].y - w.marbles[0].y);
  t.ok("no residual overlap", overlap <= 0.5);
}

t.section("hole capture");
{
  // rolls (gently) over the MATCHING hole → sinks
  const w = world([{ x: 60, y: 200, c: "r" }], [{ x: 220, y: 200, c: "r" }]);
  const evs = run(w, { gx: 2, gy: 0 }, 2);
  t.ok("matching hole captures", w.marbles[0].captured && w.holes[0].filled && evs.some(e => e.type === "capture"));
  t.ok("solved when all captured", PH.solved(w));
}
{
  // rolls over a NON-matching hole → dips but keeps going
  const w = world([{ x: 60, y: 200, c: "b" }], [{ x: 220, y: 200, c: "r" }]);
  run(w, { gx: 2, gy: 0 }, 2);
  t.ok("other-color hole does NOT capture", !w.marbles[0].captured && !w.holes[0].filled);
}
{
  // second marble of the same color can't double-fill a hole
  const w = world([{ x: 60, y: 200, c: "r" }, { x: 60, y: 100, c: "r" }], [{ x: 220, y: 200, c: "r" }, { x: 220, y: 100, c: "r" }]);
  run(w, { gx: 2, gy: 0 }, 3);
  const capCount = w.marbles.filter(m => m.captured).length;
  const fillCount = w.holes.filter(h => h.filled).length;
  t.ok("captures pair one-to-one with holes", capCount === fillCount && capCount === 2);
}
{
  // every open hole is a DIMPLE: a wrong-color marble passing NEAR one gets pulled
  const w = world([{ x: 60, y: 214, c: "b" }], [{ x: 200, y: 200, c: "r" }]);
  run(w, { gx: 2, gy: 0 }, 1.2);
  t.ok("funnel tugs a passing marble toward the hole", w.marbles[0].y < 213.2 && !w.marbles[0].captured);
}

t.section("real-world behaviors");
{
  // a CAPTURED ball is a solid obstacle: a second ball bounces off it, never rolls through
  const w = world([{ x: 100, y: 200, c: "r" }, { x: 40, y: 200, c: "b" }], [{ x: 200, y: 200, c: "r" }]);
  const evs1 = run(w, { gx: 2, gy: 0 }, 2);
  t.ok("red sank first", w.marbles[0].captured);
  const evs = evs1.concat(run(w, { gx: 2, gy: 0 }, 3));
  const blue = w.marbles[1];
  t.ok("blue bounces off the sitting ball (clack emitted)", evs.some(e => e.type === "clack" && e.dead));
  t.ok("blue never passes through the filled hole", !blue.captured && blue.x < 390 - blue.r &&
    Math.hypot(blue.x - 200, blue.y - 200) >= (blue.r + w.marbles[0].r * w.params.capColliderFrac) - 0.6);
}
{
  // lip-out: a FAST ball rattles over its hole and keeps rolling (with a rim event)
  const w = world([{ x: 60, y: 200, c: "r" }], [{ x: 200, y: 200, c: "r" }]);
  w.marbles[0].vx = w.params.captureSpeed * 1.6;
  const evs = run(w, { gx: 0, gy: 0 }, 0.5);
  t.ok("fast ball is NOT captured", !w.marbles[0].captured);
  t.ok("rim rattle emitted, ball rolled past", evs.some(e => e.type === "rim") && w.marbles[0].x > 220);
}
{
  // glancing collision changes direction (not just head-on exchange)
  const w = world([{ x: 100, y: 186, c: "r" }, { x: 260, y: 214, c: "b" }]);
  w.marbles[0].vx = 400;                  // offset centers → oblique impact
  run(w, { gx: 0, gy: 0 }, 0.8);
  t.ok("glancing hit deflects both balls off the x-axis", Math.abs(w.marbles[0].vy) + Math.abs(w.marbles[1].vy) > 1 &&
    w.marbles[1].vx > 0);
}
{
  // contact chain: a row of touching balls transmits the push (newton's cradle-ish)
  const w = world([{ x: 100, y: 200, c: "r" }, { x: 137, y: 200, c: "b" }, { x: 174, y: 200, c: "g" }]);
  w.marbles[0].vx = 500;
  run(w, { gx: 0, gy: 0 }, 0.6);
  t.ok("impulse reaches the far ball in the chain", w.marbles[2].x > 200 || w.marbles[2].vx > 20);
}

process.exit(t.summary());
