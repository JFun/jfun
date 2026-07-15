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
      restPost: 1.12,               // W3 CHIME bumper — restitution >1: a hit LEAVES faster than it arrived
      restSlop: unit * 0.5,         // below this approach speed, collide inelastically
      clackMin: unit * 0.8,         // approach speed before a clack event is worth a sound
      wallScrub: 2.5,               // tangential damping while grinding a wall, 1/s
      maxSpeed: unit * 38,          // safety clamp (invariant: maxSpeed*DT < marble diameter)
      stopSpeed: unit * 0.10,       // below this (and force-balanced) a marble rests
      captureFrac: 0.62,            // capture when path passes within holeR*frac
      captureSpeed: unit * 13,      // faster than this over the hole → rattles the lip
      capColliderFrac: 0.78,        // a captured ball sits recessed — smaller collider
      wellK: unit * 18,             // funnel pull at a hole's mouth, px/s²
      cupHoldK: unit * 40,          // hold force on a WRONG ball lodged in a cup —
                                    // escape needs a hard tilt (> ~cupHoldK/accel m/s²)
      slopeG: 3.5,                  // hill steepness, in m/s² of extra gravity
                                    // away from the ridge (≈ a 21° incline)
      iceFriction: 0.06,            // rolling-resistance MULTIPLIER inside an ice
                                    // zone — near-frictionless: a marble on ice
                                    // COMMITS to its line (slides until blocked),
                                    // the "committed lines" World-2 (Rime) lesson
      iceGrip: 0.35,                // TILT-authority multiplier on ice — the slipping
                                    // contact transmits only a fraction of your steer,
                                    // so mid-ice the line barely bends (friction alone
                                    // was unfeelable: gravity outweighs felt friction
                                    // ~10:1 at normal tilts — grip loss is the felt
                                    // difference, retuned after Qi's "can't tell" test)
                                    // [ICE is DORMANT: Rime was CUT at the kill-gate —
                                    //  machinery + tests stay, like the parked slopes]
      sandFriction: 3.5,            // rolling-resistance MULTIPLIER on a sand pad
      sandDragK: 1.2 / unit,        // quadratic drag on sand (units 1/LENGTH — must
                                    // scale by 1/unit or px-worlds get unit× overdrag;
                                    // the crawl test caught exactly this) — the momentum
                                    // killer: v² term DOMINATES at speed (12 cells/s
                                    // dies to a crawl inside ~a cell; the felt-vs-sand
                                    // contrast is unmissable — the Rime lesson: an
                                    // element must ADD a dominant force, not shave a
                                    // minor one). Slow crawls survive; parking on sand
                                    // holds against small tilts (a new verb).
      plateRest: unit * 2.5,        // W2 FOUNDRY: a marble slower than this whose
                                    // center covers a plate cell is PARKED — it
                                    // holds the linked gate open (rolling across
                                    // at speed is not parking, matching the
                                    // discrete rule). Gate-cell occupancy also
                                    // holds it open: a gate NEVER crushes.
      sinkTime: 0.22,               // capture snap animation, seconds
    };
  }

  /* world: geometry in px. marbles [{x,y,r,c}], holes [{x,y,r,c}],
     blocks [{x,y,w,h}] — solid AABB wall blocks to bank off,
     slopes [{x,y,w,h,ax,ay}] — HILLS: a ridge across the patch center,
     (ax,ay) the unit axis. While a marble is on the patch it feels slopeG
     of extra gravity AWAY from the ridge — climbing to the peak needs speed
     (stall → roll back), cresting flings you down the far side. A real bump:
     both ends meet the floor, works from either direction. */
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
      blocks: (opts.blocks || []).map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
      slopes: (opts.slopes || []).map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h, ax: s.ax, ay: s.ay })),
      // zones (DORMANT — ice + sand were cut at the kill-gate; machinery stays)
      zones: (opts.zones || []).map(z => ({ x: z.x, y: z.y, w: z.w, h: z.h, kind: z.kind || "ice" })),
      // W2 FOUNDRY gates: {x,y} gate cell + {px,py} plate cell. `held` is the
      // physics truth (recomputed each step from marble positions); the game
      // renders its own eased animation off it. A closed gate is a solid block.
      gates: (opts.gates || []).map(g => ({ x: g.x, y: g.y, px: g.px, py: g.py, held: false })),
      // W3 CHIME bumper posts: fixed circles a marble rebounds off LIVELY
      // (restPost>1). Off-centre contact steers the bounce — bank into pockets
      // no straight tilt reaches. idx drives the per-post pentatonic note.
      posts: (opts.posts || []).map((p, i) => ({ x: p.x, y: p.y, r: p.r, idx: i })),
      t: 0,
      events: [],
    };
  }
  // circle vs fixed circle (CHIME bumper post): push out along the centre-line
  // normal, reflect the inbound normal velocity with restitution >1 (adds
  // energy — "arrive hot → flung"). Tangential velocity is PRESERVED (no scrub,
  // unlike a wall), so an off-centre hit banks off at an angle — the whole verb.
  function collidePost(w, m, p, dt, withEvents) {
    const P = w.params;
    let dx = m.x - p.x, dy = m.y - p.y;
    let d = Math.hypot(dx, dy);
    const minD = m.r + p.r;
    if (d >= minD) return;
    if (d < 1e-9) { dx = 0; dy = -1; d = 1e-9; }   // dead-centre: deterministic straight-back
    const nx = dx / d, ny = dy / d;
    m.x = p.x + nx * minD; m.y = p.y + ny * minD;
    const vn = m.vx * nx + m.vy * ny;
    if (vn < 0) {
      if (withEvents) w.events.push({ type: "bump", speed: -vn, x: p.x, y: p.y, i: p.idx });
      m.vx -= (1 + P.restPost) * vn * nx;
      m.vy -= (1 + P.restPost) * vn * ny;
    }
  }
  // circle vs AABB block: push out along the closest-point normal, reflect the
  // inbound normal velocity (corners get the diagonal normal for free).
  function collideBlock(w, m, b, dt, withEvents) {
    const P = w.params;
    const cx = m.x < b.x ? b.x : m.x > b.x + b.w ? b.x + b.w : m.x;
    const cy = m.y < b.y ? b.y : m.y > b.y + b.h ? b.y + b.h : m.y;
    let dx = m.x - cx, dy = m.y - cy;
    let d = Math.hypot(dx, dy);
    if (d >= m.r) return;
    if (d < 1e-9) { dx = 0; dy = -1; d = 1e-9; }   // degenerate (center on face): push up, deterministic
    const nx = dx / d, ny = dy / d;
    m.x = cx + nx * m.r; m.y = cy + ny * m.r;
    const vn = m.vx * nx + m.vy * ny;
    if (vn < 0) {
      if (withEvents) wallEv(w, m, -vn);
      m.vx -= (1 + P.restWall) * vn * nx;
      m.vy -= (1 + P.restWall) * vn * ny;
      // grind the tangential component like the outer rails
      const tx = -ny, ty = nx;
      const vt = m.vx * tx + m.vy * ty;
      const k = 1 - P.wallScrub * dt;
      m.vx += tx * vt * (k - 1); m.vy += ty * vt * (k - 1);
    }
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
    // FOUNDRY gates: held = a slow (parked) free marble covers the plate cell,
    // OR any free marble covers the gate cell itself (never crush). Evaluated
    // from current positions before movement — deterministic; emits an event
    // on every transition so the UI can clunk/thud + animate the bars.
    const cu = w.unit;   // gate/plate cells are UNIT-sized squares at world-coord origins
    for (let gi = 0; gi < w.gates.length; gi++) {
      const g = w.gates[gi];
      let held = false;
      for (const m of w.marbles) {
        if (m.captured) continue;
        const onPlate = m.x >= g.px && m.x <= g.px + cu && m.y >= g.py && m.y <= g.py + cu;
        if (onPlate && speedOf(m) < P.plateRest) { held = true; break; }
        if (m.x >= g.x && m.x <= g.x + cu && m.y >= g.y && m.y <= g.y + cu) { held = true; break; }
      }
      if (held !== g.held) w.events.push({ type: "gate", i: gi, open: held, x: (g.x + cu / 2) / cu, y: (g.y + cu / 2) / cu });
      g.held = held;
    }
    for (const m of w.marbles) {
      if (m.captured) {
        if (m.sink && m.sink.t < P.sinkTime) m.sink.t += dt;
        continue;
      }
      m.px = m.x; m.py = m.y;
      // ZONES (checked once per marble per step, by KIND):
      //   ice  — the contact SLIPS: tilt authority drops to iceGrip, friction to
      //          iceFriction; the marble commits to its entry line (DORMANT — Rime cut).
      //   sand — heavy going: friction × sandFriction plus a QUADRATIC drag that
      //          murders speed (fast entries die to a crawl within ~a cell); full
      //          steering, easy resting — sand is where precision lives.
      // No zones → both flags stay false → byte-identical to shipped Tabletop.
      let onIce = false, onSand = false;
      for (const z of w.zones) {
        if (m.x >= z.x && m.x <= z.x + z.w && m.y >= z.y && m.y <= z.y + z.h) {
          if (z.kind === "sand") onSand = true; else onIce = true;
          break;
        }
      }
      const gripMul = onIce ? P.iceGrip : 1;
      // gravity (scaled by grip — on ice your tilt barely bends the line)
      m.vx += gravity.gx * P.accel * gripMul * dt;
      m.vy += gravity.gy * P.accel * gripMul * dt;
      // HILLS: constant extra pull AWAY from the ridge while on the patch —
      // climbing needs speed (stall → roll back), the far side flings you on
      for (const s of w.slopes) {
        if (m.x >= s.x && m.x <= s.x + s.w && m.y >= s.y && m.y <= s.y + s.h) {
          const t = s.ax ? m.x - (s.x + s.w / 2) : m.y - (s.y + s.h / 2);
          const sgn = t > 0 ? 1 : t < 0 ? -1 : 0;
          m.vx += s.ax * sgn * P.slopeG * P.accel * dt;
          m.vy += s.ay * sgn * P.slopeG * P.accel * dt;
        }
      }
      // hole DIMPLES: every open hole pulls nearby marbles toward its center —
      // regardless of color; a real tray dips at every hole. A WRONG ball deep in
      // the cup feels a much stronger hold (it's lodged) — escaping needs a hard
      // sustained tilt; the mistake costs time (and the DEAD-END detector in the
      // game layer ends the run when every remaining ball is wedged).
      for (const h of w.holes) {
        if (h.filled) continue;
        const wellR = h.r + m.r * 0.5;
        const d = Math.hypot(m.x - h.x, m.y - h.y);
        if (d < wellR && d > 1e-9) {
          const deep = d < h.r * P.captureFrac * 1.4 && h.c !== m.c;
          if (deep) {
            // lodged: constant-strength hold (a cup wall, not a slope) + settling
            // damping — escape requires drive > cupHoldK, i.e. a HARD tilt
            const a = P.cupHoldK * dt;
            m.vx += (h.x - m.x) / d * a;
            m.vy += (h.y - m.y) / d * a;
            const dk = 1 - 6 * dt;
            m.vx *= dk; m.vy *= dk;
          } else {
            const a = P.wellK * (1 - d / wellR) * dt;
            m.vx += (h.x - m.x) / d * a;
            m.vy += (h.y - m.y) / d * a;
          }
        }
      }
      const fMul = onIce ? P.iceFriction : onSand ? P.sandFriction : 1;
      // rolling resistance: small constant deceleration + whisper of damping —
      // marbles COAST into their clacks instead of oozing to a halt. On ice the
      // resistance all but vanishes; on SAND it multiplies AND gains a v² drag
      // (the momentum killer — dominant exactly when the marble is fast).
      const sp = speedOf(m);
      if (sp > 0) {
        let drop = (P.frictionK * sp + P.frictionC) * fMul * dt;
        if (onSand) drop += P.sandDragK * sp * sp * dt;
        const ns = Math.max(0, sp - drop);
        const k = ns / sp;
        m.vx *= k; m.vy *= k;
      }
      // static rest: force balance, not a magic tilt gate — rolling resistance
      // holds the marble until the driving force exceeds it. On ice both sides
      // scale (grip-reduced drive vs near-zero resistance): a marble still
      // almost never rests there — it commits.
      if (speedOf(m) < P.stopSpeed && gmag * P.accel * gripMul < P.frictionC * fMul * 1.3) { m.vx = 0; m.vy = 0; }
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
      // interior wall blocks — bank off them
      for (const b of w.blocks) collideBlock(w, m, b, dt, true);
      // closed gates are walls (held gates are open floor)
      for (const g of w.gates) if (!g.held) collideBlock(w, m, { x: g.x, y: g.y, w: w.unit, h: w.unit }, dt, true);
      // bumper posts (CHIME) — bounce lively, ring a note
      for (const p of w.posts) collidePost(w, m, p, dt, true);
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
    // pair separation can shove a marble past a rail or into a block — re-clamp
    // (rails: position only; blocks: quiet collide, no event — the directional
    // reflect above owns the audible bounce)
    for (const m of ms) {
      if (!free(m)) continue;
      const lo = w.pad + m.r, hiX = w.w - w.pad - m.r, hiY = w.h - w.pad - m.r;
      if (m.x < lo) m.x = lo; else if (m.x > hiX) m.x = hiX;
      if (m.y < lo) m.y = lo; else if (m.y > hiY) m.y = hiY;
      for (const b of w.blocks) collideBlock(w, m, b, dt, false);
      for (const g of w.gates) if (!g.held) collideBlock(w, m, { x: g.x, y: g.y, w: w.unit, h: w.unit }, dt, false);
      for (const p of w.posts) collidePost(w, m, p, dt, false);
    }

    // holes catch EVERYTHING: the PATH this step is tested against each open
    // hole's capture disc (fast grazes can't tunnel). Too fast → rattles the lip
    // once and rolls on (any color). Slow + matching → sinks for good. Slow +
    // WRONG color → plunks into the cup and lodges (the hold force above keeps
    // it there, plugging the hole, until a hard tilt pops it out).
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]; if (!free(m)) continue;
      let inside = -1;
      for (let hi = 0; hi < w.holes.length; hi++) {
        const h = w.holes[hi];
        if (h.filled) continue;
        const d = segDist(h.x, h.y, m.px, m.py, m.x, m.y);
        if (d < h.r * P.captureFrac) {
          inside = hi;
          if (m.rimIn !== hi) {           // just entered the hole mouth
            const sp = speedOf(m);
            if (sp > P.captureSpeed) {
              m.vx *= 0.85; m.vy *= 0.85;
              w.events.push({ type: "rim", speed: sp, x: h.x, y: h.y, i });
            } else if (h.c === m.c) {
              m.captured = true; h.filled = true;
              const svx = m.vx, svy = m.vy;
              const sn = sp > 0 ? sp : 1;
              m.sink = { fromX: m.x, fromY: m.y, toX: h.x, toY: h.y, t: 0,
                         ex: svx / sn, ey: svy / sn, sp: Math.min(1, sp / P.captureSpeed) };
              m.vx = 0; m.vy = 0;
              w.events.push({ type: "capture", speed: sp, x: h.x, y: h.y, i, color: m.c });
            } else {
              // wrong cup: the drop swallows the ball's momentum — it lodges
              m.vx *= 0.12; m.vy *= 0.12;
              w.events.push({ type: "plunk", speed: sp, x: h.x, y: h.y, i, color: m.c });
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

  return { DT, createWorld, step, renderPos, solved: solvedWorld, VERSION: "1.6.0" };
});
