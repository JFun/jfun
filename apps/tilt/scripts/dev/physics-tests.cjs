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
function world(marbles, holes, params, blocks, slopes, zones) {
  return PH.createWorld({ w: 400, h: 400, pad: 10, unit: UNIT,
    marbles: marbles.map(m => Object.assign({ r: 18 }, m)),
    holes: (holes || []).map(h => Object.assign({ r: 19 }, h)),
    blocks: blocks || [], slopes: slopes || [], zones: zones || [], params });
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
{
  // DEGENERATE-COLLISION regression (device: a ball "vanished after going through
  // the gate"). When a ball's CENTRE ends up inside a block/gate/post cell, or two
  // balls coincide, the push-out normal was (unit vector)/1e-9 = a ~1e9 normal that
  // hurled the ball to ±3.6e8 — off the tray, gone. Each degenerate must yield a
  // UNIT normal; the ball must stay finite AND inside the tray.
  const inBounds = m => isFinite(m.x) && isFinite(m.y) &&
    m.x >= 10 + m.r - 1e-6 && m.x <= 390 - m.r + 1e-6 && m.y >= 10 + m.r - 1e-6 && m.y <= 390 - m.r + 1e-6;
  // (a) centre dead inside a wall block (collideBlock)
  const wa = PH.createWorld({ w: 400, h: 400, pad: 10, unit: UNIT,
    marbles: [{ x: 180 + UNIT / 2, y: 180 + UNIT / 2, r: 18, c: "r" }],
    holes: [], blocks: [{ x: 180, y: 180, w: UNIT, h: UNIT }] });
  run(wa, { gx: 0, gy: 0 }, 0.3);
  t.ok("ball with centre inside a block is ejected, finite + in-bounds (no 1e9 fling)", inBounds(wa.marbles[0]));
  // (b) centre dead on a bumper post (collidePost)
  const wp = PH.createWorld({ w: 400, h: 400, pad: 10, unit: UNIT,
    marbles: [{ x: 200, y: 200, r: 18, c: "r" }], holes: [], posts: [{ x: 200, y: 200, r: 17 }] });
  run(wp, { gx: 0, gy: 0 }, 0.3);
  t.ok("ball dead-centre on a post is ejected, finite + in-bounds",
    inBounds(wp.marbles[0]) && Math.hypot(wp.marbles[0].x - 200, wp.marbles[0].y - 200) > 1);
  // (c) two exactly-coincident balls (marble-marble split)
  const wc = world([{ x: 200, y: 200, c: "r" }, { x: 200, y: 200, c: "b" }]);
  run(wc, { gx: 0, gy: 0 }, 0.3);
  t.ok("coincident balls separate cleanly, finite + in-bounds",
    inBounds(wc.marbles[0]) && inBounds(wc.marbles[1]) &&
    Math.hypot(wc.marbles[0].x - wc.marbles[1].x, wc.marbles[0].y - wc.marbles[1].y) > 1);
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
  // WELL-FREEZE regression (device-repro'd "looks complete, won't win"): a
  // MATCHING ball that rolls in and comes to REST in the funnel — just off
  // dead-center, phone LEVEL — must still be captured. The funnel's pull-to-
  // center (wellK/120) is weaker than the come-to-rest threshold (stopSpeed),
  // so before the settle-capture it sat in its own hole forever, uncaptured,
  // and the level never registered as solved.
  const wf = world([{ x: 220, y: 200, c: "r" }], [{ x: 220, y: 200, c: "r" }]);
  wf.marbles[0].y = 200 - wf.holes[0].r * 0.8;   // outer well: past the mouth, inside the funnel
  wf.marbles[0].vx = 0; wf.marbles[0].vy = 0;
  run(wf, { gx: 0, gy: 0 }, 1.2);                // phone held dead level — no help
  t.ok("matching ball settling in its own funnel is captured (well-freeze fixed)",
    wf.marbles[0].captured && wf.holes[0].filled && PH.solved(wf));
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

t.section("ICE zones (DORMANT — Rime cut at the kill-gate; machinery stays tested like the parked slopes)");
{
  // a WIDE frictional runway (no rails in play) — same initial velocity, gravity
  // OFF: on felt the marble rolls out and rests; on ice it just keeps going.
  const coast = (zones) => {
    const w = PH.createWorld({ w: 4000, h: 400, pad: 10, unit: UNIT,
      marbles: [{ x: 60, y: 200, r: 18, c: "r" }], holes: [], zones: zones || [] });
    w.marbles[0].vx = 300;
    run(w, () => ({ gx: 0, gy: 0 }), 6);
    return w.marbles[0];
  };
  const allIce = [{ x: 0, y: 0, w: 4000, h: 400, kind: "ice" }];
  const felt = coast([]), ice = coast(allIce);
  t.ok("felt: the marble rolls out and RESTS (friction holds it)", Math.hypot(felt.vx, felt.vy) < 0.02);
  t.ok("ice: the marble is STILL sliding after 6s (no stopping short)", Math.hypot(ice.vx, ice.vy) > 150);
  t.ok("ice carries it far beyond the felt roll-out (committed line)", (ice.x - 60) > (felt.x - 60) * 1.6);
  // GRIP: crossing at speed under a hard sideways tilt — on ice the line barely
  // bends (tilt authority ≈ iceGrip), then steer returns off the ice
  const steer = (zones) => {
    const w = PH.createWorld({ w: 4000, h: 4000, pad: 10, unit: UNIT,
      marbles: [{ x: 60, y: 200, r: 18, c: "r" }], holes: [], zones: zones || [] });
    w.marbles[0].vx = 300;
    run(w, () => ({ gx: 0, gy: 3 }), 1);
    return w.marbles[0];
  };
  const sf = steer([]), si = steer([{ x: 0, y: 0, w: 4000, h: 4000, kind: "ice" }]);
  const ratio = si.vy / sf.vy;
  t.ok("on ice a sideways tilt bends the line to ~grip fraction (0.25–0.5×)", ratio > 0.25 && ratio < 0.5);
  t.ok("the icy path deflects far less (the committed line is visible)", (si.y - 200) < (sf.y - 200) * 0.55);
  // NO zones == the shipped behavior EXACTLY (Tabletop must be byte-identical)
  const a = coast([]), b = coast(undefined);
  t.ok("no ice zones → identical to the shipped physics (Tabletop no-op)",
    a.x.toFixed(9) === b.x.toFixed(9) && a.vx.toFixed(9) === b.vx.toFixed(9));
  // determinism holds WITH zones
  const iceZone = [{ x: 0, y: 0, w: 400, h: 400, kind: "ice" }];
  const mk = () => { const w = world([{ x: 60, y: 60, c: "r" }], [], null, [], [], iceZone);
    run(w, tt => ({ gx: Math.sin(tt * 3) * 4, gy: 2 }), 4); return [w.marbles[0].x.toFixed(6), w.marbles[0].y.toFixed(6)]; };
  t.deterministic("ice trajectory is deterministic", mk, 3);
  // a marble only feels ice while its CENTER is inside the zone: it exits a
  // finite patch and regains full grip + friction beyond it
  const w2 = world([{ x: 60, y: 200, c: "r" }], [], null, [], [], [{ x: 40, y: 180, w: 60, h: 40, kind: "ice" }]);
  run(w2, () => ({ gx: 5, gy: 0 }), 2.5);
  t.ok("a marble exits a finite ice patch and feels felt again beyond it", w2.marbles[0].x > 120);
}

t.section("SAND pads (World 2 Dune — the momentum killer)");
{
  // skid-kill: a sprinting marble (12 cells/s) enters sand with gravity off —
  // the v² drag murders the speed almost immediately (THE feelable contrast;
  // pinned so the element can never quietly weaken below perception again)
  const sandAll = [{ x: 0, y: 0, w: 4000, h: 400, kind: "sand" }];
  const skid = (zones) => {
    const w = PH.createWorld({ w: 4000, h: 400, pad: 10, unit: UNIT,
      marbles: [{ x: 60, y: 200, r: 18, c: "r" }], holes: [], zones: zones || [] });
    w.marbles[0].vx = 600;                          // 12 cells/s
    run(w, () => ({ gx: 0, gy: 0 }), 0.35);
    return w.marbles[0];
  };
  const sFelt = skid([]), sSand = skid(sandAll);
  t.ok("sand kills a sprint (>70% of speed gone in 0.35s)", Math.hypot(sSand.vx, sSand.vy) < 600 * 0.3);
  t.ok("felt keeps most of it (the contrast IS the element)", Math.hypot(sFelt.vx, sFelt.vy) > 600 * 0.55);
  t.ok("the skid dies within ~2 cells on sand", (sSand.x - 60) < UNIT * 2.2);
  // crawl: sustained tilt through sand reaches a slow terminal velocity —
  // passable, never fast (heavy going, not a wall)
  const crawl = PH.createWorld({ w: 4000, h: 400, pad: 10, unit: UNIT,
    marbles: [{ x: 60, y: 200, r: 18, c: "r" }], holes: [], zones: sandAll });
  run(crawl, () => ({ gx: 3, gy: 0 }), 3);
  const vC = Math.hypot(crawl.marbles[0].vx, crawl.marbles[0].vy);
  t.ok("sustained tilt CRAWLS through sand (terminal < 6.5 cells/s)", vC > UNIT * 0.5 && vC < UNIT * 6.5);
  // park: sand holds a slow marble against a small tilt (felt would keep rolling)
  const park = (zones) => {
    const w = PH.createWorld({ w: 4000, h: 400, pad: 10, unit: UNIT,
      marbles: [{ x: 200, y: 200, r: 18, c: "r" }], holes: [], zones: zones || [] });
    w.marbles[0].vx = 40;
    run(w, () => ({ gx: 0.35, gy: 0 }), 3);
    return Math.hypot(w.marbles[0].vx, w.marbles[0].vy);
  };
  t.ok("a marble PARKS on sand under a small tilt (a new verb)", park(sandAll) < 0.02);
  t.ok("on felt the same tilt keeps it rolling", park([]) > UNIT * 0.5);
  // determinism with sand
  const mk = () => { const w = world([{ x: 60, y: 60, c: "r" }], [], null, [], [], [{ x: 0, y: 0, w: 400, h: 400, kind: "sand" }]);
    run(w, tt => ({ gx: Math.sin(tt * 3) * 4, gy: 2 }), 4); return [w.marbles[0].x.toFixed(6), w.marbles[0].y.toFixed(6)]; };
  t.deterministic("sand trajectory is deterministic", mk, 3);
}

t.section("GATES (World 2 Foundry — plates & gates: state, not friction)");
{
  // gates take WORLD-COORD cell origins (unit-sized squares): gate cell spans
  // px 200-250 × 150-200; plate spans 50-100 × 300-350 (matches the game where
  // unit=1 makes origins equal cell indices)
  const mkGate = (marbles, blocks) => PH.createWorld({ w: 400, h: 400, pad: 10, unit: UNIT,
    marbles: marbles.map(m => Object.assign({ r: 18 }, m)), holes: [], blocks: blocks || [],
    gates: [{ x: 4 * UNIT, y: 3 * UNIT, px: 1 * UNIT, py: 6 * UNIT }] });
  // pin block right of the plate — this world runs ~10× gravity, so an unpinned
  // holder is flung off the plate in under half a second (the same reason every
  // curated level pockets its holder against the tilts the solution uses)
  const PIN = { x: 2 * UNIT, y: 6 * UNIT, w: UNIT, h: UNIT };
  // 1) closed gate is SOLID: marble driven at the gate cell bounces/stops before it
  {
    const w = mkGate([{ x: 60, y: 185, c: "r" }]);
    run(w, () => ({ gx: 4, gy: 0 }), 2);
    t.ok("closed gate blocks a rolling marble", w.marbles[0].x < 4 * UNIT - 10);
    t.ok("gate never reported open", w.gates[0].held === false);
  }
  // 2) a PARKED marble on the plate holds the gate open — a second marble passes
  {
    const w = mkGate([{ x: 75, y: 325, c: "b" }, { x: 60, y: 185, c: "r" }], [PIN]);
    // b sits at the plate cell (1,6) → px 75, 325 — pinned against PIN under gx>0
    const evs = run(w, () => ({ gx: 3, gy: 0 }), 0.4);
    t.ok("plate-parked marble opens the gate (event emitted)", w.gates[0].held === true && evs.some(e => e.type === "gate" && e.open));
    run(w, () => ({ gx: 3, gy: 0 }), 2.2);
    t.ok("runner passes THROUGH the held gate cell", w.marbles[1].x > 5 * UNIT);
  }
  // 3) leaving the plate closes it — the block is back
  {
    // SHELF keeps the runner in the gate row while gy evicts the holder — else
    // the runner would slip through during the very tilt that empties the plate
    const SHELF = { x: 1 * UNIT, y: 4 * UNIT, w: UNIT, h: UNIT };
    const w = mkGate([{ x: 75, y: 325, c: "b" }, { x: 75, y: 175, c: "r" }], [PIN, SHELF]);
    run(w, () => ({ gx: 0, gy: 0 }), 0.2);
    t.ok("held while parked", w.gates[0].held === true);
    // pure-down tilt: holder drops off the plate into the open row below; the
    // runner just settles onto SHELF, still left of the gate
    const evs = run(w, () => ({ gx: 0, gy: 3 }), 1.5);
    t.ok("gate closes once the plate empties (close event)", w.gates[0].held === false && evs.some(e => e.type === "gate" && !e.open));
    // runner now rolls right along the shelf row and stops at the gate
    run(w, () => ({ gx: 4, gy: 0 }), 1.5);
    t.ok("closed again: the runner is blocked", w.marbles[1].x < 4 * UNIT - 10);
  }
  // 4) anti-crush: a marble INSIDE the gate cell keeps it open while the plate empties
  {
    const w = mkGate([{ x: 75, y: 325, c: "b" }, { x: 4.5 * UNIT, y: 175, c: "r" }]);
    run(w, () => ({ gx: 0, gy: 0 }), 0.2);
    t.ok("both hold: plate + occupant", w.gates[0].held === true);
    const w2 = mkGate([{ x: 4.5 * UNIT, y: 175, c: "r" }]);
    run(w2, () => ({ gx: 0, gy: 0 }), 0.3);
    t.ok("occupant ALONE keeps the gate open (never crushes)", w2.gates[0].held === true);
    run(w2, () => ({ gx: 4, gy: 0 }), 1.5);
    t.ok("occupant exits freely through its own gate", w2.marbles[0].x > 5.2 * UNIT);
  }
  // 5) rolling ACROSS the plate at speed does NOT hold the gate (parked ≠ passing)
  {
    const w = mkGate([{ x: 60, y: 325, c: "b" }]);
    w.marbles[0].vx = 500;                        // 10 cells/s sprint across the plate row
    let openedEver = false;
    for (let i = 0; i < 60; i++) { PH.step(w, { gx: 0, gy: 0 }); if (w.gates[0].held) openedEver = true; }
    t.ok("a sprinting cross of the plate never opens the gate", openedEver === false);
  }
  // 5b) COLOUR-SELECTIVE passage: a gate that guards a colour pocket lets ONLY that
  // colour through while HELD (any ball still holds the plate). A wrong ball can
  // never enter the sealed pocket → the unwinnable "wrong ball trapped behind a
  // gate" state (Qi L37) cannot form. pocketColor undefined = colour-agnostic (the
  // tests above), so this is opt-in and the shipped no-pocketColor gates are unchanged.
  {
    const mkSel = (marbles, pocketColor) => PH.createWorld({ w: 400, h: 400, pad: 10, unit: UNIT,
      marbles: marbles.map(m => Object.assign({ r: 18 }, m)), holes: [], blocks: [PIN],
      gates: [{ x: 4 * UNIT, y: 3 * UNIT, px: 1 * UNIT, py: 6 * UNIT, pocketColor }] });
    // gate guards a RED pocket; blue holder parks the plate open
    const wr = mkSel([{ x: 75, y: 325, c: "b" }, { x: 60, y: 185, c: "r" }], "r");
    run(wr, () => ({ gx: 3, gy: 0 }), 0.4);
    t.ok("colour-selective gate still opens on a (any-colour) plate hold", wr.gates[0].held === true);
    run(wr, () => ({ gx: 3, gy: 0 }), 2.2);
    t.ok("MATCHING-colour ball passes the held colour-selective gate", wr.marbles[1].x > 5 * UNIT);
    // same, but the runner is the WRONG colour (green for a red pocket)
    const wg = mkSel([{ x: 75, y: 325, c: "b" }, { x: 60, y: 185, c: "g" }], "r");
    run(wg, () => ({ gx: 3, gy: 0 }), 2.6);
    t.ok("WRONG-colour ball is blocked even while the gate is held open", wg.marbles[1].x < 4 * UNIT - 10);
  }
  // 6) no gates → byte-identical to shipped physics
  {
    const a = PH.createWorld({ w: 400, h: 400, pad: 10, unit: UNIT, marbles: [{ x: 60, y: 185, r: 18, c: "r" }], holes: [] });
    const b = PH.createWorld({ w: 400, h: 400, pad: 10, unit: UNIT, marbles: [{ x: 60, y: 185, r: 18, c: "r" }], holes: [], gates: [] });
    run(a, () => ({ gx: 3, gy: 1 }), 3); run(b, () => ({ gx: 3, gy: 1 }), 3);
    t.ok("no gates → identical trajectories (Tabletop no-op)", a.marbles[0].x.toFixed(9) === b.marbles[0].x.toFixed(9) && a.marbles[0].y.toFixed(9) === b.marbles[0].y.toFixed(9));
  }
  // 7) determinism with gates
  const mk = () => { const w = mkGate([{ x: 75, y: 325, c: "b" }, { x: 60, y: 185, c: "r" }]);
    run(w, tt => ({ gx: Math.sin(tt * 2) * 4, gy: 2 }), 4); return w.marbles.map(m => [m.x.toFixed(6), m.y.toFixed(6)]); };
  t.deterministic("gate trajectory is deterministic", mk, 3);
}

t.section("BUMPER POSTS (World 3 Chime — lively rebound + off-centre steer, no discrete model)");
{
  const PR = 17;   // post radius (0.34 cell at unit 50)
  const mkPost = (marbles, posts) => PH.createWorld({ w: 500, h: 500, pad: 10, unit: UNIT,
    marbles: marbles.map(m => Object.assign({ r: 18 }, m)), holes: [], posts: posts });
  // 1) restitution > 1: a head-on hit LEAVES faster than it arrived (adds energy)
  {
    const w = mkPost([{ x: 60, y: 250, c: "r" }], [{ x: 320, y: 250, r: PR }]);
    w.marbles[0].vx = 8 * UNIT;
    let before = 0, after = 0, bumped = false;
    for (let i = 0; i < 400; i++) {
      const pre = Math.hypot(w.marbles[0].vx, w.marbles[0].vy);
      PH.step(w, { gx: 0, gy: 0 });
      if (w.events.some(e => e.type === "bump")) { before = pre; after = Math.hypot(w.marbles[0].vx, w.marbles[0].vy); bumped = true; break; }
      w.events.length = 0;
    }
    t.ok("a head-on bump ADDS energy (restitution > 1)", bumped && after > before);
    t.ok("bump event carries a post index for the pentatonic note", bumped);
  }
  // 2) off-centre contact STEERS: a purely-horizontal marble leaves with real vy
  {
    const w = mkPost([{ x: 60, y: 235, c: "r" }], [{ x: 320, y: 250, r: PR }]);
    w.marbles[0].vx = 8 * UNIT;
    let vy = 0;
    for (let i = 0; i < 400; i++) { PH.step(w, { gx: 0, gy: 0 });
      if (w.events.some(e => e.type === "bump")) { vy = w.marbles[0].vy; break; } w.events.length = 0; }
    t.ok("an off-centre hit steers the bounce (gains perpendicular velocity)", Math.abs(vy) > 1 * UNIT);
  }
  // 3) a slow graze is gentle, a fast hit is flung (speed-punished)
  {
    const slow = mkPost([{ x: 250, y: 250, c: "r" }], [{ x: 320, y: 250, r: PR }]); slow.marbles[0].vx = 1.5 * UNIT;
    const fast = mkPost([{ x: 250, y: 250, c: "r" }], [{ x: 320, y: 250, r: PR }]); fast.marbles[0].vx = 12 * UNIT;
    const exitOf = w => { for (let i = 0; i < 400; i++) { PH.step(w, { gx: 0, gy: 0 }); if (w.events.some(e => e.type === "bump")) return Math.hypot(w.marbles[0].vx, w.marbles[0].vy); w.events.length = 0; } return 0; };
    t.ok("arrive hot → flung harder than a slow graze", exitOf(fast) > exitOf(slow) * 3);
  }
  // 4) no posts → byte-identical to a post-less world (Tabletop/Foundry no-op)
  {
    const a = PH.createWorld({ w: 400, h: 400, pad: 10, unit: UNIT, marbles: [{ x: 60, y: 185, r: 18, c: "r" }], holes: [] });
    const b = PH.createWorld({ w: 400, h: 400, pad: 10, unit: UNIT, marbles: [{ x: 60, y: 185, r: 18, c: "r" }], holes: [], posts: [] });
    run(a, () => ({ gx: 3, gy: 1 }), 3); run(b, () => ({ gx: 3, gy: 1 }), 3);
    t.ok("no posts → identical trajectories", a.marbles[0].x.toFixed(9) === b.marbles[0].x.toFixed(9) && a.marbles[0].y.toFixed(9) === b.marbles[0].y.toFixed(9));
  }
  // 5) determinism with posts
  const mk2 = () => { const w = mkPost([{ x: 80, y: 250, c: "r" }], [{ x: 260, y: 250, r: PR }, { x: 360, y: 180, r: PR }]);
    run(w, tt => ({ gx: Math.sin(tt * 2) * 5, gy: Math.cos(tt) * 3 }), 4); return w.marbles.map(m => [m.x.toFixed(6), m.y.toFixed(6)]); };
  t.deterministic("post trajectory is deterministic", mk2, 3);
}

t.section("world param invariants (depth plan — every planet must stay escapable + tunneling-free)");
{
  // PINNED CONTRACT for planet retunes (docs/longevity/tilt-depth.md): for EVERY
  // world's merged params — (1) a lodged ball must stay escapable with a hard
  // physical tilt: escape drive ≈ cupHoldK/accel ≤ ~6.5 m/s² (|g| caps at 9.8;
  // a low-g "moon" that silently pushes this past reach makes wrong holes
  // permanent — the death-by-feel regression); (2) no tunneling: maxSpeed·DT
  // must stay under a marble diameter (0.72 cells); (3) honest retunes only:
  // accel within 0.7–1.4× of the shipped feel. W1 = defaults; this test is the
  // gate every FUTURE world's params must pass before it ships.
  const E2 = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
  const base = PH.createWorld({ w: 8, h: 8, pad: 0, unit: 1, marbles: [], holes: [] }).params;
  for (const wd of E2.WORLDS) {
    const w = PH.createWorld({ w: 8, h: 8, pad: 0, unit: 1, marbles: [], holes: [], params: wd.params });
    const P = w.params;
    t.ok("W" + wd.id + " " + wd.name + ": lodge escape within physical tilt (cupHoldK/accel ≤ 6.5)",
      P.cupHoldK / P.accel <= 6.5);
    t.ok("W" + wd.id + " " + wd.name + ": no tunneling (maxSpeed·DT < marble diameter)",
      P.maxSpeed * PH.DT < 0.72);
    t.ok("W" + wd.id + " " + wd.name + ": accel is an honest retune (0.7–1.4× shipped)",
      P.accel >= base.accel * 0.7 - 1e-9 && P.accel <= base.accel * 1.4 + 1e-9);
    t.ok("W" + wd.id + " " + wd.name + ": capture strictness stays in the taught band (0.6–1.6×)",
      P.captureSpeed >= base.captureSpeed * 0.6 - 1e-9 && P.captureSpeed <= base.captureSpeed * 1.6 + 1e-9);
  }
}

process.exit(t.summary());
