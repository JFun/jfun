/* Tilt — physics core (pure, deterministic, node-testable). Continuous 2D marble
   dynamics for the tilt-the-phone mode: a gravity vector (from the accelerometer)
   accelerates every free marble; marbles coast with rolling resistance, bounce off
   the tray walls and each other (glass-on-glass), feel every hole as a DIMPLE
   (funnel pull), and sink into their matching hole only when slow enough —
   otherwise they rattle the lip and roll on. A captured marble sits recessed in
   its hole as a solid (infinite-mass) obstacle.

   Design rules:
   - FIXED timestep (callers accumulate real time and call step() in 1/120s slices)
     — same inputs → identical trajectories, so the core is regression-testable.
   - No randomness, no clock reads, no DOM — pure math on a world object.
   - step() emits EVENTS (wall hits, clacks, rim rattles, captures) with impact
     speeds so the UI drives sound/haptics/particles without re-deriving physics.

   Realism model (per the physics review):
   - acceleration ≈ (5/7)·g·sinθ for a rolling solid sphere, scaled to the board;
   - rolling resistance is a small ~CONSTANT deceleration (marbles COAST — the
     proportional term is only a whisper for numeric calm);
   - restitution: glass-glass ~0.88, ball-on-wood-wall ~0.5, with a slop so
     resting clusters don't buzz;
   - every open hole is a funnel: nearby marbles dip toward it regardless of
     color; capture = matching color AND slow (segment-tested so fast grazes
     can't tunnel the disc). */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TrayPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DT = 1 / 120;               // canonical step, seconds

  // Parameters scale off `unit` (one grid cell in px) so feel is size-independent.
  function defaultParams(unit) {
    return {
      // (5/7 rolling factor folded in) — full physical scale would be ~unit*32
      // per m/s²; unit*8 keeps an 8-cell tray playable while feeling weighty.
      accel: unit * 8,
      frictionK: 0.18,              // whisper of proportional damping, 1/s
      frictionC: unit * 0.9,        // TRUE rolling resistance (constant), px/s²
      restWall: 0.5,                // ball on wooden rail
      restBall: 0.88,               // glass on glass — crisp Newton's-cradle transfer
      restCaptured: 0.45,           // hitting a ball seated in a hole is a dull knock
      restSlop: unit * 0.5,         // below this approach speed, collide inelastically
      clackMin: unit * 0.8,         // approach speed before a clack event is worth a sound
      wallScrub: 2.5,               // tangential damping while grinding a wall, 1/s
      maxSpeed: unit * 38,          // safety clamp (invariant: maxSpeed*DT < marble diameter)
      stopSpeed: unit * 0.10,       // below this (and force-balanced) a marble rests
      captureFrac: 0.62,            // capture when path passes within holeR*frac
      captureSpeed: unit * 13,      // faster than this over the hole → rattles the lip
      capColliderFrac: 0.78,        // a captured ball sits recessed — smaller collider
      wellK: unit * 18,             // funnel pull at a hole's center, px/s²
      sinkTime: 0.22,               // capture snap animation, seconds
    };
  }

  /* world: geometry in px. marbles [{x,y,r,c}], holes [{x,y,r,c}] */
  function createWorld(opts) {
    const unit = opts.unit || 50;
    return {
      w: opts.w, h: opts.h, pad: opts.pad || 0, unit,
      params: Object.assign(defaultParams(unit), opts.params || {}),
      marbles: opts.marbles.map(m => ({
        x: m.x, y: m.y, vx: 0, vy: 0, r: m.r, c: m.c,
        captured: false, sink: null,     // sink: {fromX,fromY,toX,toY,t,ex,ey,sp}
        rimIn: -1,                       // hole index whose mouth we're currently over
        px: m.x, py: m.y,                // previous position (segment capture test)
      })),
      holes: opts.holes.map(h => ({ x: h.x, y: h.y, r: h.r, c: h.c, filled: false })),
      t: 0,
      events: [],
    };
  }

  function free(m) { return !m.captured; }
  function speedOf(m) { return Math.hypot(m.vx, m.vy); }
  function solvedWorld(w) { return w.marbles.every(m => m.captured); }
  // distance from point p to segment a→b
  function segDist(pxp, pyp, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(pxp - ax, pyp - ay);
    let t = ((pxp - ax) * dx + (pyp - ay) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(pxp - (ax + dx * t), pyp - (ay + dy * t));
  }

  /* gravity: {gx, gy} in m/s² SCREEN components (x right, y down). dt optional. */
  function step(w, gravity, dt) {
    dt = dt || DT;
    const P = w.params;
    w.events.length = 0;
    w.t += dt;

    const gmag = Math.hypot(gravity.gx, gravity.gy);
    for (const m of w.marbles) {
      if (m.captured) {
        if (m.sink && m.sink.t < P.sinkTime) m.sink.t += dt;
        continue;
      }
      m.px = m.x; m.py = m.y;
      // gravity
      m.vx += gravity.gx * P.accel * dt;
      m.vy += gravity.gy * P.accel * dt;
      // hole DIMPLES: every open hole pulls nearby marbles toward its center —
      // regardless of color; a real tray dips at every hole.
      for (const h of w.holes) {
        if (h.filled) continue;
        const wellR = h.r + m.r * 0.5;
        const d = Math.hypot(m.x - h.x, m.y - h.y);
        if (d < wellR && d > 1e-9) {
          const a = P.wellK * (1 - d / wellR) * dt;
          m.vx += (h.x - m.x) / d * a;
          m.vy += (h.y - m.y) / d * a;
        }
      }
      // rolling resistance: small constant deceleration + whisper of damping —
      // marbles COAST into their clacks instead of oozing to a halt.
      const sp = speedOf(m);
      if (sp > 0) {
        const drop = (P.frictionK * sp + P.frictionC) * dt;
        const ns = Math.max(0, sp - drop);
        const k = ns / sp;
        m.vx *= k; m.vy *= k;
      }
      // static rest: force balance, not a magic tilt gate — rolling resistance
      // holds the marble until the driving force exceeds it.
      if (speedOf(m) < P.stopSpeed && gmag * P.accel < P.frictionC * 1.3) { m.vx = 0; m.vy = 0; }
      const spc = speedOf(m);
      if (spc > P.maxSpeed) { const k = P.maxSpeed / spc; m.vx *= k; m.vy *= k; }
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      // walls: reflect ONLY velocity pointing into the wall (a marble pushed out
      // by the pair solver while already escaping must not be damped again),
      // and scrub the tangential component while grinding.
      const lo = w.pad + m.r, hiX = w.w - w.pad - m.r, hiY = w.h - w.pad - m.r;
      if (m.x < lo)  { m.x = lo;  if (m.vx < 0) { wallEv(w, m, -m.vx); m.vx = -m.vx * P.restWall; } m.vy *= 1 - P.wallScrub * dt; }
      if (m.x > hiX) { m.x = hiX; if (m.vx > 0) { wallEv(w, m, m.vx);  m.vx = -m.vx * P.restWall; } m.vy *= 1 - P.wallScrub * dt; }
      if (m.y < lo)  { m.y = lo;  if (m.vy < 0) { wallEv(w, m, -m.vy); m.vy = -m.vy * P.restWall; } m.vx *= 1 - P.wallScrub * dt; }
      if (m.y > hiY) { m.y = hiY; if (m.vy > 0) { wallEv(w, m, m.vy);  m.vy = -m.vy * P.restWall; } m.vx *= 1 - P.wallScrub * dt; }
    }

    // marble-marble collisions. A CAPTURED marble sits in its hole — recessed but
    // still a solid obstacle (a free marble knocks OFF it, never rolls through).
    // Iterated so contact chains transmit impulse within the step.
    const ms = w.marbles;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < ms.length; i++) {
        const a = ms[i];
        for (let j = i + 1; j < ms.length; j++) {
          const b = ms[j];
          if (!free(a) && !free(b)) continue;
          const aR = free(a) ? a.r : a.r * P.capColliderFrac;
          const bR = free(b) ? b.r : b.r * P.capColliderFrac;
          let dx = b.x - a.x, dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          const minD = aR + bR;
          if (dist >= minD) continue;
          if (dist < 1e-9) { dx = 1; dy = 0; dist = 1e-9; }   // degenerate: deterministic split axis
          const nx = dx / dist, ny = dy / dist;
          const overlap = minD - dist;
          if (free(a) && free(b)) {
            a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
            b.x += nx * overlap / 2; b.y += ny * overlap / 2;
            const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rvn < 0) {
              // restitution slop: gentle contacts collide inelastically (no buzz)
              const e = Math.abs(rvn) < P.restSlop ? 0 : P.restBall;
              const jimp = -(1 + e) * rvn / 2;
              a.vx -= jimp * nx; a.vy -= jimp * ny;
              b.vx += jimp * nx; b.vy += jimp * ny;
              if (pass === 0 && Math.abs(rvn) > P.clackMin)
                w.events.push({ type: "clack", speed: Math.abs(rvn), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, i, j });
            }
          } else {
            // one is captured: infinite mass — only the free marble moves; the
            // knock is duller than a free-pair clack (seated ball can't recoil)
            const mv = free(a) ? a : b;
            const sgn = free(a) ? -1 : 1;   // push the free one AWAY from the seated one
            mv.x += sgn * nx * overlap; mv.y += sgn * ny * overlap;
            const vn = mv.vx * (sgn * nx) + mv.vy * (sgn * ny);
            if (vn < 0) {
              const e = Math.abs(vn) < P.restSlop ? 0 : P.restCaptured;
              mv.vx -= (1 + e) * vn * (sgn * nx);
              mv.vy -= (1 + e) * vn * (sgn * ny);
              if (pass === 0 && Math.abs(vn) > P.clackMin)
                w.events.push({ type: "clack", speed: Math.abs(vn), x: mv.x, y: mv.y, i, j, dead: true });
            }
          }
        }
      }
    }
    // pair separation can shove a marble past a rail — re-clamp positions only
    // (no restitution, no event; the directional reflect above owns the bounce)
    for (const m of ms) {
      if (!free(m)) continue;
      const lo = w.pad + m.r, hiX = w.w - w.pad - m.r, hiY = w.h - w.pad - m.r;
      if (m.x < lo) m.x = lo; else if (m.x > hiX) m.x = hiX;
      if (m.y < lo) m.y = lo; else if (m.y > hiY) m.y = hiY;
    }

    // hole capture: the PATH this step is tested against the capture disc (fast
    // grazes can't tunnel). Slow enough → sinks; too fast → rattles the lip once
    // (speed loss + rim event) and rolls on.
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]; if (!free(m)) continue;
      let inside = -1;
      for (let hi = 0; hi < w.holes.length; hi++) {
        const h = w.holes[hi];
        if (h.filled || h.c !== m.c) continue;
        const d = segDist(h.x, h.y, m.px, m.py, m.x, m.y);
        if (d < h.r * P.captureFrac) {
          inside = hi;
          if (m.rimIn !== hi) {           // just entered the hole mouth
            const sp = speedOf(m);
            if (sp <= P.captureSpeed) {
              m.captured = true; h.filled = true;
              const svx = m.vx, svy = m.vy;
              const sn = sp > 0 ? sp : 1;
              m.sink = { fromX: m.x, fromY: m.y, toX: h.x, toY: h.y, t: 0,
                         ex: svx / sn, ey: svy / sn, sp: Math.min(1, sp / P.captureSpeed) };
              m.vx = 0; m.vy = 0;
              w.events.push({ type: "capture", speed: sp, x: h.x, y: h.y, i, color: m.c });
            } else {
              m.vx *= 0.85; m.vy *= 0.85;
              w.events.push({ type: "rim", speed: sp, x: h.x, y: h.y, i });
            }
          }
          break;
        }
      }
      m.rimIn = inside;
    }
    return w;
  }
  function wallEv(w, m, impact) {
    if (impact > w.unit * 1.2) w.events.push({ type: "wall", speed: impact, x: m.x, y: m.y });
  }

  /* render position honoring the sink snap: eases to center with a decaying
     settle-rattle along the entry direction — a ball dropping into a cup. */
  function renderPos(w, m) {
    if (m.captured && m.sink) {
      const p = Math.min(1, m.sink.t / w.params.sinkTime);
      const e = 1 - Math.pow(1 - p, 3);
      const wob = (1 - e) * Math.sin(p * 14) * 0.10 * (m.sink.sp || 0) * (m.r * 2);
      return { x: m.sink.fromX + (m.sink.toX - m.sink.fromX) * e + (m.sink.ex || 0) * wob,
               y: m.sink.fromY + (m.sink.toY - m.sink.fromY) * e + (m.sink.ey || 0) * wob,
               scale: 1 - 0.38 * e };   // sinks DEEP — a ball dropped into a recess
    }
    return { x: m.x, y: m.y, scale: 1 };
  }

  return { DT, createWorld, step, renderPos, solved: solvedWorld, VERSION: "1.2.0" };
});
