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
function world(marbles, holes, params, blocks, slopes) {
  return PH.createWorld({ w: 400, h: 400, pad: 10, unit: UNIT,
    marbles: marbles.map(m => Object.assign({ r: 18 }, m)),
    holes: (holes || []).map(h => Object.assign({ r: 19 }, h)),
    blocks: blocks || [], slopes: slopes || [], params });
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
  // a slow WRONG-color ball PLUNKS into the cup and lodges — plugging it, not sinking
  const w = world([{ x: 60, y: 200, c: "b" }], [{ x: 220, y: 200, c: "r" }]);
  const evs = run(w, { gx: 2, gy: 0 }, 2);
  const m = w.marbles[0];
  t.ok("wrong ball is never CAPTURED (hole stays unfilled)", !m.captured && !w.holes[0].filled);
  t.ok("plunk event emitted", evs.some(e => e.type === "plunk"));
  t.ok("ball lodges in the cup", Math.hypot(m.x - 220, m.y - 200) < 19 + 9);
  // gentle tilt cannot free it…
  run(w, { gx: 2.5, gy: 0 }, 1.5);
  t.ok("gentle tilt can't free a lodged ball", Math.hypot(m.x - 220, m.y - 200) < 19 + 9);
  // …a HARD tilt pops it out
  run(w, { gx: 8, gy: 0 }, 1.5);
  t.ok("hard tilt pops it out of the cup", Math.hypot(m.x - 220, m.y - 200) > 19 + 9);
}
{
  // a lodged wrong ball PLUGS the hole: a GENTLE approach can't sink the rightful ball
  const w = world([{ x: 220, y: 200, c: "b" }, { x: 60, y: 200, c: "r" }], [{ x: 220, y: 200, c: "r" }]);
  run(w, { gx: 0, gy: 0 }, 0.2);           // blue starts on the cup → lodges immediately
  t.ok("squatter lodged", !w.marbles[0].captured && Math.hypot(w.marbles[0].x - 220, w.marbles[0].y - 200) < 17);
  run(w, { gx: 0.8, gy: 0 }, 3);           // red nudges in gently
  t.ok("gentle push: squatter stays, hole stays plugged, no capture",
    !w.marbles[1].captured && !w.holes[0].filled &&
    Math.hypot(w.marbles[0].x - 220, w.marbles[0].y - 200) < 17);
}
{
  // …but a FIRM shot knocks the squatter out billiard-style, then sinks (eviction skill)
  const w = world([{ x: 220, y: 200, c: "b" }, { x: 60, y: 200, c: "r" }], [{ x: 220, y: 200, c: "r" }]);
  run(w, { gx: 0, gy: 0 }, 0.2);           // blue lodges
  run(w, { gx: 3, gy: 0 }, 3.5);           // red arrives fast
  t.ok("firm shot evicts the squatter", Math.hypot(w.marbles[0].x - 220, w.marbles[0].y - 200) > 28);
  t.ok("rightful ball sinks after eviction", w.marbles[1].captured && w.holes[0].filled);
}
{
  // DEAD-END detection contract (game layer's game-over card keys off this):
  // a lodged ball sits within holeR*captureFrac*1.4 of a wrong open hole and
  // STAYS there under gentle drive — the exact predicate game.js polls
  const w = world([{ x: 60, y: 200, c: "b" }], [{ x: 220, y: 200, c: "r" }]);
  run(w, { gx: 2, gy: 0 }, 2);             // lodge it
  const lodgedNow = () => {
    const m = w.marbles[0], h = w.holes[0];
    return !m.captured && !h.filled && Math.hypot(m.x - h.x, m.y - h.y) < h.r * w.params.captureFrac * 1.4;
  };
  t.ok("lodged ball satisfies the dead-end predicate", lodgedNow());
  run(w, { gx: 1.5, gy: 0 }, 3.2);         // 3.2s of gentle drive — past the grace window
  t.ok("…and STAYS lodged through the 3s grace window (game over would fire)", lodgedNow());
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

t.section("wall blocks (banking)");
{
  // head-on: marble bounces back off a block face
  const w = world([{ x: 60, y: 225, c: "r" }], [], null, [{ x: 200, y: 200, w: 50, h: 50 }]);
  const evs = run(w, { gx: 4, gy: 0 }, 1.2);
  const m = w.marbles[0];
  t.ok("block stops the roll (never enters)", m.x <= 200 - m.r + 0.5);
  t.ok("block hit emits a wall event", evs.some(e => e.type === "wall"));
}
{
  // corner hit deflects diagonally (closest-point normal)
  const w = world([{ x: 60, y: 188, c: "r" }], [], null, [{ x: 200, y: 200, w: 50, h: 50 }]);
  w.marbles[0].vx = 600;
  run(w, { gx: 0, gy: 0 }, 0.8);
  t.ok("corner graze deflects off-axis", Math.abs(w.marbles[0].vy) > 5 || w.marbles[0].y < 187);
}
{
  // containment holds with blocks in play: 20s of hard shaking, never inside a block
  const blocks = [{ x: 150, y: 150, w: 50, h: 50 }, { x: 250, y: 100, w: 50, h: 50 }, { x: 100, y: 260, w: 50, h: 50 }];
  const w = world([{ x: 60, y: 60, c: "r" }, { x: 340, y: 60, c: "b" }, { x: 200, y: 340, c: "g" }], [], null, blocks);
  const rng = Core.makeRNG(11);
  let worst = 99;
  const steps = Math.round(20 / PH.DT);
  for (let i = 0; i < steps; i++) {
    PH.step(w, { gx: (rng() - 0.5) * 19.6, gy: (rng() - 0.5) * 19.6 });
    for (const m of w.marbles) for (const b of blocks) {
      const cx = Math.max(b.x, Math.min(m.x, b.x + b.w)), cy = Math.max(b.y, Math.min(m.y, b.y + b.h));
      const d = Math.hypot(m.x - cx, m.y - cy);
      if (d < worst) worst = d;
    }
  }
  t.ok("marbles never penetrate blocks under 20s shaking (min clearance ≥ r−ε)", worst >= 18 - 0.5);
  t.ok("still inside the tray", w.marbles.every(m => m.x >= 10 + m.r - 1e-6 && m.x <= 390 - m.r + 1e-6 && m.y >= 10 + m.r - 1e-6 && m.y <= 390 - m.r + 1e-6));
}

t.section("hills (ridge bumps — up needs speed, over the peak flings you on)");
{
  // slow ball: stalls climbing the near face and rolls BACK off the hill
  const hill = { x: 150, y: 180, w: 100, h: 50, ax: 1, ay: 0 };   // ridge at x=200
  const w = world([{ x: 100, y: 205, c: "r" }], [], null, [], [hill]);
  w.marbles[0].vx = 300;                   // not enough for the 50px climb
  let maxX = 0;
  for (let i = 0; i < Math.round(2.5 / PH.DT); i++) { PH.step(w, { gx: 0, gy: 0 }); if (w.marbles[0].x > maxX) maxX = w.marbles[0].x; }
  t.ok("slow ball never reaches the ridge", maxX < 200);
  t.ok("…and rolls back off the hill", w.marbles[0].x < 152);
}
{
  // fast ball: crests the ridge and the far face FLINGS it onward
  const hill = { x: 150, y: 180, w: 100, h: 50, ax: 1, ay: 0 };
  const w = world([{ x: 100, y: 205, c: "r" }], [], null, [], [hill]);
  w.marbles[0].vx = 800;
  let maxX = 0, vAtRidge = null, vAtExit = null;
  for (let i = 0; i < Math.round(1.5 / PH.DT); i++) {
    PH.step(w, { gx: 0, gy: 0 });
    const m0 = w.marbles[0];
    if (vAtRidge == null && m0.x >= 200) vAtRidge = Math.hypot(m0.vx, m0.vy);
    if (vAtExit == null && m0.x >= 250) vAtExit = Math.hypot(m0.vx, m0.vy);
    if (m0.x > maxX) maxX = m0.x;
  }
  t.ok("fast ball crests the ridge and carries on", maxX > 300);
  t.ok("the far face accelerates it (exit faster than at the ridge)",
    vAtRidge != null && vAtExit != null && vAtExit > vAtRidge + 50);
}
{
  // a ball resting on the far face rolls away from the ridge on its own
  const hill = { x: 150, y: 180, w: 100, h: 50, ax: 1, ay: 0 };
  const w = world([{ x: 225, y: 205, c: "r" }], [], null, [], [hill]);
  run(w, { gx: 0, gy: 0 }, 1.0);
  t.ok("ball on the far face slides off away from the ridge", w.marbles[0].x > 252);
}
{
  // works along the VERTICAL axis too
  const hill = { x: 180, y: 150, w: 50, h: 100, ax: 0, ay: 1 };   // ridge at y=200
  const w = world([{ x: 205, y: 100, c: "r" }], [], null, [], [hill]);
  w.marbles[0].vy = 800;
  let maxY = 0;
  for (let i = 0; i < Math.round(1.5 / PH.DT); i++) { PH.step(w, { gx: 0, gy: 0 }); if (w.marbles[0].y > maxY) maxY = w.marbles[0].y; }
  t.ok("vertical hill crests the same way", maxY > 300);
}
{
  // determinism holds with hills in play
  const mk = () => {
    const w = world([{ x: 80, y: 205, c: "r" }], [], null, [], [{ x: 150, y: 180, w: 100, h: 50, ax: 1, ay: 0 }]);
    run(w, { gx: 1.2, gy: 0.4 }, 2);
    return [w.marbles[0].x.toFixed(9), w.marbles[0].y.toFixed(9)];
  };
  t.eq("identical runs over a hill are bit-identical", mk(), mk());
}

t.section("tutorial script plays out (the demo IS the game)");
{
  // The tutorial card steps THIS world with THIS gravity track through the real
  // physics. If a tuning change ever breaks the story (no lodge, no escape, or
  // no final capture), the onboarding demo silently turns into a lie — pin it.
  const TUT = require(path.join(__dirname, "..", "..", "web", "js", "tutorial-script.js"));
  const w = PH.createWorld({
    w: TUT.WORLD.w, h: TUT.WORLD.h, pad: 0, unit: 1,
    marbles: TUT.WORLD.marbles.map(m => ({ x: m.x, y: m.y, r: m.r, c: m.c })),
    holes: TUT.WORLD.holes.map(h => ({ x: h.x, y: h.y, r: h.r, c: h.c })),
    blocks: [],
  });
  const m = w.marbles[0];
  const green = TUT.WORLD.holes.find(h => h.c !== m.c), red = TUT.WORLD.holes.find(h => h.c === m.c);
  let tt = 0, plunkT = null, escT = null, capT = null;
  let maxXearly = 0, minXreturn = 99;               // act 1: the follow-reversal
  const steps = Math.round((TUT.DUR + 0.4) / PH.DT);
  for (let i = 0; i < steps; i++) {
    PH.step(w, TUT.beatAt(tt));
    for (const e of w.events) {
      if (e.type === "plunk" && plunkT == null) plunkT = tt;
      if (e.type === "capture" && capT == null) capT = tt;
    }
    w.events.length = 0;
    if (tt < 1.5 && m.x > maxXearly) maxXearly = m.x;
    if (tt >= 1.5 && tt < 2.5 && m.x < minXreturn) minXreturn = m.x;
    if (plunkT != null && escT == null && Math.hypot(m.x - green.x, m.y - green.y) > 0.7) escT = tt;
    tt += PH.DT;
  }
  t.ok("act 1 TEACHES THE VERB: ball rolls right with the lean…", maxXearly > 1.9);
  t.ok("…then FOLLOWS the reverse lean back across the board", minXreturn < 0.8);
  t.ok("the trap only springs AFTER the reversal (plunk into green)",
    plunkT != null && plunkT > 2.4 && plunkT < 3.2);
  t.ok("stays lodged through the 'stuck' beat (1.5s+)", escT != null && escT - plunkT > 1.5);
  t.ok("hard-tilt beat pops it free before the story's last 2s", escT != null && escT < TUT.DUR - 2);
  t.ok("capture fires only AFTER the escape", capT != null && capT > escT);
  t.ok("captured in its MATCH (red), story solved before the loop resets",
    m.captured && Math.hypot(m.x - red.x, m.y - red.y) < 0.3 && PH.solved(w) && capT < TUT.DUR);
  t.ok("captions cover every beat", TUT.BEATS.every(b => b.cap && b.dur > 0) && TUT.DUR > 4 && TUT.DUR < 12);
}

process.exit(t.summary());
