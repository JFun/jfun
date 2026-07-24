#!/usr/bin/env node
/* CUT fairness certifier — the content-longevity harness (docs/longevity).
 *
 * The doc's #1 investment and our own scar (L5/L8 shipped UNSOLVABLE in the
 * reference because they were never physics-validated). This drives the REAL
 * continuous engine (web/js/game.js via window.__game) — NEVER a discrete solver
 * (the discrete-solver-is-wrong-oracle lesson) — and for each level runs a
 * seeded sweep of the whole cut action space:
 *   · for every rope, cut it (perpendicular swipe through its midpoint) after
 *     each delay in a grid; also pop each balloon after each delay; also a
 *     "cut everything at once" strategy per delay.
 * A level CERTIFIES if it is won in >= MIN_WINS distinct rollouts (physics is
 * noisy → require a margin, not a single fluke), reports its win-rate as a
 * difficulty band for the sawtooth ordering pass, and flags whether the LAZY
 * play (cut-all at t=0) trivially wins (fine for tutorial levels, a red flag for
 * skill levels).
 *
 *   node scripts/dev/fairness.cjs            # certify all levels (coarse grid)
 *   node scripts/dev/fairness.cjs 21 28      # certify a range, fine grid
 *   node scripts/dev/fairness.cjs 24         # certify one level, fine grid
 */
const CDP = require('chrome-remote-interface');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
// Shared level-QA gates (frame-fit, order discoverability, distinctness) —
// workspace-linked; path fallback keeps worktrees without node_modules working.
let LC; try { LC = require('@jfun/levelcheck'); }
catch (_) { LC = require(path.resolve(__dirname, '../../../../packages/levelcheck')); }
let DIFF; try { DIFF = require('@jfun/difficulty'); }
catch (_) { DIFF = require(path.resolve(__dirname, '../../../../packages/difficulty')); }

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9461;
const HTTP_PORT = 4187;
const WEB = path.join(__dirname, '..', '..', 'web');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.woff2':'font/woff2', '.json':'application/json', '.png':'image/png' };

function serve() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = path.join(WEB, p);
      if (!f.startsWith(WEB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(HTTP_PORT, () => resolve(s));
  });
}

// Certifier runs entirely in-page: sweep the cut action space per level.
// Bot policy mirrors the real one-thumb verb: swipe the LONGEST rope (the main
// suspending line), pop each balloon, cut EVERYTHING, and — for order-dependent
// levels (tip-order, pulley) — a two-stage sequential cut. Early-exit once a
// level is certified (wins>=minWins); only truly-unsolvable levels pay the full
// sweep, which is exactly the alarm we want to raise.
const inPage = (loLevel, hiLevel, delayStep, maxDelay, minWins, gaps) => `(function(){
  const g = window.__game;
  if (!g || !g.setLevel || !g.ropes || !g.cutAt || !g.simN) return { fatal: 'window.__game missing hooks (need simN)' };
  const RUN = 960;
  // step in small batches with the NO-DRAW hook (draw() per step is ~15x slower
  // and useless headless); check phase every batch — plenty prompt for terminal.
  function runOut(){ for (let k=0;k<RUN;k+=8){ g.simN(8); const p=g.state().phase; if (p!=='play') return p; } return 'play'; }
  function stepN(n){ g.simN(n); }
  function cutRope(r){ const dx=r.x2-r.x1, dy=r.y2-r.y1, L=Math.hypot(dx,dy)||1, e=Math.max(14,L);
    return g.cutAt(r.mx + dy/L*e, r.my - dx/L*e, r.mx - dy/L*e, r.my + dx/L*e); } // returns links severed (0 = swipe missed)
  function popBalloon(b){ g.cutAt(b.x-b.r-6, b.y, b.x+b.r+6, b.y); }
  // the single-cut target = the TOP-most rope segment: cutting nearest the anchor
  // reliably severs the load path and releases the crate (grabbing the "longest"
  // segment can pick a harness branch that leaves the crate still hanging).
  // Skip severed free TAILS (dangling chain remnants): they are not load paths,
  // so cutting them wastes bot swipes, inflates par, and pollutes the recorded
  // winning order with junk entries. ropes() flags them via particle.freeTail.
  function topmost(){ const rs=g.ropes(); let best=null,by=1e9; for(const r of rs){ if(r.tail) continue; if(r.my<by){by=r.my;best=r;} } return best; }
  function bottommost(){ const rs=g.ropes(); let best=null,by=-1e9; for(const r of rs){ if(r.tail) continue; if(r.my>by){by=r.my;best=r;} } return best; }
  function longest(){ return topmost(); } // single-cut target
  const delays = []; for (let d=0; d<=${maxDelay}; d+=${delayStep}) delays.push(d);
  const gaps = ${JSON.stringify(gaps)};
  const H = g.dims().H, Wd = g.dims().W;
  const out = [];
  for (let idx=${loLevel}; idx<=${hiLevel}; idx++){
    let wins=0, single=0, singleTried=0, firstWin=null, winBy=null, done=false;
    // level-QA facts captured at the FIRST win: par (cuts used) + the winning
    // cascade's cut order as anchor-height fractions (discoverability lint)
    let winPar=null, winOrd=null;
    const win = (d,how,cuts,ordYs)=>{ wins++; if(firstWin===null){ firstWin=d; winBy=how; winPar=(cuts==null?null:cuts); winOrd=ordYs||null; } };
    // pass 1 — single cut + balloon pops across the delay grid (the dominant
    // timing solve; the TOP-most cut also serves as the difficulty proxy)
    for (const d of delays){
      // top-most single-cut (main suspending line) — the band probe
      g.setLevel(idx); stepN(d); let r=topmost(); if(r){ cutRope(r); singleTried++; if (runOut()==='win'){ single++; win(d,'top',1); } }
      // bottom-most single-cut — the "cut the tie-down, leave the cord" solve
      // (elastic slingshot / counterweight restraint), which topmost never finds
      g.setLevel(idx); stepN(d); r=bottommost(); if(r){ cutRope(r); if (runOut()==='win') win(d,'bottom',1); }
      for (let bi=0; bi<8; bi++){ g.setLevel(idx); stepN(d); const b=g.balloons()[bi]; if(!b) break; popBalloon(b); if(runOut()==='win') win(d,'pop',1); }
      if (wins>=${minWins}) { done=true; break; }
    }
    // pass 2 — escalate: cut-all, then a CASCADE (release every rope top-down
    // with a gap between cuts) which covers N-rope release-order levels.
    if (!done) for (const d of delays){
      g.setLevel(idx); stepN(d);
      const nAll = g.ropes().length + g.balloons().length;
      for(const r of g.ropes()) cutRope(r); for(const b of g.balloons()) popBalloon(b);
      if (runOut()==='win') win(d,'all',nAll);
      for (const gap of gaps){
        for (const pick of [topmost, bottommost]){ // release order: top-down AND bottom-up
          g.setLevel(idx); stepN(d);
          let guard=0; const seq=[]; let r2; let lastLive=Infinity;
          while((r2=pick()) && guard++<12){
            // fail→auto-retry rebuilds every rope: live count JUMPS back up —
            // restart the recorded order (par/order describe ONE clean attempt)
            const liveN=g.ropes().filter(rr=>!rr.tail).length;
            if (liveN>lastLive) seq.length=0;
            // ANCHOR IDENTITY = (x,y) of the segment's top endpoint. Collapse by
            // 2D proximity, not height alone: same-anchor link re-cuts sit at
            // ~the same point, while two DIFFERENT anchors at near-equal heights
            // keep separate entries (height-only collapse aliased them away AND
            // made the order lint's sub-gap check structurally unreachable).
            const topFirst=r2.y1<=r2.y2;
            const e={x:+((topFirst?r2.x1:r2.x2)/Wd).toFixed(3), y:+(Math.min(r2.y1,r2.y2)/H).toFixed(3)};
            const prev=seq[seq.length-1];
            if (cutRope(r2)>0 && (!prev || Math.hypot(prev.x-e.x,prev.y-e.y)>=0.02)) seq.push(e);
            lastLive=g.ropes().filter(rr=>!rr.tail).length;
            stepN(gap); }
          const nPop=g.balloons().length;
          for(const b of g.balloons()) popBalloon(b);
          if (runOut()==='win') win(d,pick===topmost?'casc↓':'casc↑',seq.length+nPop,seq.map(ee=>ee.y));
        }
      }
      if (wins>=${minWins}) break;
    }
    // lazy probe — cut everything, sampled at SEVERAL delays (t=0 alone was a
    // blind spot: L60 Split Cradle failed cut-all at t=0 but won at every
    // other delay — trivially brute-forceable yet unflagged)
    let lazyWin = false;
    for(const ld of [0,120,240]){
      g.setLevel(idx); stepN(ld);
      for(const r of g.ropes()) cutRope(r); for(const b of g.balloons()) popBalloon(b);
      if(runOut()==='win'){ lazyWin=true; break; }
    }
    g.setLevel(idx);
    const nRopes=g.ropes().length, nBalloons=g.balloons().length;
    const gm = g.geom ? g.geom() : null; // frame-fit + discoverability facts for @jfun/levelcheck
    out.push({ idx, level: idx+1, wins, single, singleTried,
      singleRate: singleTried? +(single/singleTried).toFixed(2):0, firstWin, winBy, winPar, winOrd, lazyWin,
      nRopes, nBalloons,
      geom: gm?{W:gm.W,H:gm.H,basket:gm.basket,nAnchors:gm.anchors.length,nPulleys:gm.mechanics.pulley}:null });
  }
  return { out, minWins:${minWins}, delays: delays.length };
})()`;

// Robustness probe (the human-possible gate, @jfun/levelcheck): a FULL
// no-early-exit sweep along the player's timing knob. The certify sweep's
// minWins early-exit can prove "a win exists" but can NEVER measure how
// hittable it is — that's how L59 Boomerang (1/200 lottery) and the Gallows
// counterweight (taught cut dead, unintended cut certified) shipped. Every
// (delay, method) attempt becomes a {x, win, method} sample; Node judges with
// methodWindows/winDensity: the intended method needs a wide CONTIGUOUS band.
const robustProbe = (idx) => `(function(){
  const g=window.__game;
  function cutRope(r){ const dx=r.x2-r.x1,dy=r.y2-r.y1,L=Math.hypot(dx,dy)||1,e=Math.max(14,L); return g.cutAt(r.mx+dy/L*e,r.my-dx/L*e,r.mx-dy/L*e,r.my+dx/L*e); }
  function topmost(){ const rs=g.ropes(); let best=null,by=1e9; for(const r of rs){ if(r.tail)continue; if(r.my<by){by=r.my;best=r;} } return best; }
  function bottommost(){ const rs=g.ropes(); let best=null,by=-1e9; for(const r of rs){ if(r.tail)continue; if(r.my>by){by=r.my;best=r;} } return best; }
  function runOut(){ for(let k=0;k<960;k+=8){ g.simN(8); const p=g.state().phase; if(p!=='play') return p; } return 'play'; }
  const H=g.dims().H;
  // PATIENT-PLAYER policy — the human proxy: cut a rope, WAIT until the crate
  // stabilizes on its new pivot (speed settles or a patience cap), cut the
  // next. Humans time cuts reactively off what they see; fixed-gap cascades
  // under-model them (they made even the shipped, human-beaten walks look like
  // delay lotteries). If the patient policy wins across a wide delay band, a
  // human can find it; if only razor gaps win, it's an execution lottery.
  function patient(pick){
    let guard=0,r2;
    while((r2=pick())&&guard++<12){
      cutRope(r2);
      g.simN(24); // reaction time (~0.2s) before watching for stability
      // cut the next rope when the crate looks "mostly stopped" (~100px/s) —
      // 0.30H exited after ~2 swings-worth of speed decay (too eager, landed
      // the cadence at ~gap 50, outside L54's measured 140-190 win band)
      for(let k=0;k<420;k+=12){ const c=g.state().crate; if(Math.hypot(c.vx,c.vy)<0.12*H) break; g.simN(12); if(g.state().phase!=='play') break; }
      if(g.state().phase!=='play') break;
    }
    return runOut();
  }
  const gaps=[30,70,120,170];
  const samples=[];
  for(let d=0; d<=480; d+=20){
    g.setLevel(${idx}); g.simN(d); let r=topmost();
    if(r){ cutRope(r); samples.push({x:d,win:runOut()==='win',method:'top'}); }
    g.setLevel(${idx}); g.simN(d); r=bottommost();
    if(r){ cutRope(r); samples.push({x:d,win:runOut()==='win',method:'bottom'}); }
    g.setLevel(${idx}); g.simN(d); samples.push({x:d,win:patient(topmost)==='win',method:'patient↓'});
    g.setLevel(${idx}); g.simN(d); samples.push({x:d,win:patient(bottommost)==='win',method:'patient↑'});
    for(const pick of [topmost,bottommost]){
      let any=false;
      for(const gap of gaps){
        g.setLevel(${idx}); g.simN(d);
        let guard=0,r2; while((r2=pick())&&guard++<12){ cutRope(r2); g.simN(gap); }
        if(runOut()==='win'){ any=true; break; }
      }
      samples.push({x:d,win:any,method:pick===topmost?'casc↓':'casc↑'});
    }
    g.setLevel(${idx}); g.simN(d);
    for(const rr of g.ropes()) cutRope(rr); for(const b of g.balloons()) g.cutAt(b.x-b.r-6,b.y,b.x+b.r+6,b.y);
    samples.push({x:d,win:runOut()==='win',method:'all'});
  }
  g.setLevel(${idx});
  const hasGate = g.geom ? g.geom().mechanics.gate>0 : false;
  return { samples, hasGate };
})()`;

// Distinctness probe (advisory report): per level, the mechanics set + layout
// landmarks (normalized anchors/hazards/basket) + an 8x8 canvas luma —
// @jfun/levelcheck ranks the closest pairs Node-side (the anti-clone gate).
const distinctProbe = (lo, hi) => `(function(){
  const g=window.__game;
  if (!g || !g.geom || !g.luma8) return { fatal: '__game.geom/luma8 hooks missing' };
  const out=[];
  for (let idx=${lo}; idx<=${hi}; idx++){
    g.setLevel(idx); g.stepN(2); // draw so the canvas shows this level
    const gm=g.geom();
    const mech=Object.keys(gm.mechanics).filter(k=>gm.mechanics[k]>0&&k!=='boxes'&&k!=='solid');
    mech.push('r'+Math.min(gm.anchors.length,6)); // LOGICAL rope bucket via pinned anchors (ropes() counts LINKS — every level would read 'r6')
    const pts=[];
    for(const a of gm.anchors) pts.push([+(a.x/gm.W).toFixed(3),+(a.y/gm.H).toFixed(3)]);
    for(const h of gm.hazards){ pts.push([+(h.x1/gm.W).toFixed(3),+(h.y1/gm.H).toFixed(3)]);
      pts.push([+(h.x2/gm.W).toFixed(3),+(h.y2/gm.H).toFixed(3)]); }
    if(gm.basket) pts.push([+(((gm.basket.l+gm.basket.r)/2)/gm.W).toFixed(3),+(gm.basket.b/gm.H).toFixed(3)]);
    for(const st of (gm.stars||[])) pts.push([+(st.x/gm.W).toFixed(3),+(st.y/gm.H).toFixed(3)]);
    out.push({ idx, mechanics:mech, points:pts, luma:g.luma8() });
  }
  return out;
})()`;

// Landing probe (authoring aid): for one level, cut the top of the cord/rope at
// each delay and report the crate's apex + rest landing (x,y as fractions) and
// outcome — so a level's basket/wall can be placed where the launch actually goes.
const landProbe = (idx) => `(function(){
  const g=window.__game, W=g.dims().W, H=g.dims().H;
  function topcut(){ const rs=g.ropes(); if(!rs.length) return false; let t=rs[0],by=1e9; for(const r of rs){ if(r.my<by){by=r.my;t=r;} }
    const dx=t.x2-t.x1,dy=t.y2-t.y1,L=Math.hypot(dx,dy)||1,e=Math.max(14,L); g.cutAt(t.mx+dy/L*e,t.my-dx/L*e,t.mx-dy/L*e,t.my+dx/L*e); return true; }
  const out=[];
  for(let d=0; d<=280; d+=10){
    g.setLevel(${idx}); for(let i=0;i<d;i++) g.simN(1); if(!topcut()){ out.push({d,o:'norope'}); continue; }
    let minY=1e9, res='play';
    for(let i=0;i<700;i++){ g.simN(1); const s=g.state(); if(s.crate.y<minY) minY=s.crate.y; if(s.phase!=='play'){ res=s.phase; break; } }
    const c=g.state().crate;
    out.push({d, o:res, apex:+(minY/H).toFixed(2), x:+(c.x/W).toFixed(2), y:+(c.y/H).toFixed(2)});
  }
  return out;
})()`;

(async () => {
  const mode = process.argv[2];
  const args = process.argv.slice(2).map(Number).filter(n => !isNaN(n));
  // `ipad` token → certify at iPad-portrait aspect (~0.75) instead of phone
  // (~0.46). Cut fills the screen and mixes W-scaled sizes with H-scaled gravity,
  // so the aspect ratio changes trajectories — this measures which levels survive.
  const ipad = process.argv.includes('ipad');
  const VW = ipad ? 1024 : 390, VH = ipad ? 1366 : 844;
  // range | single | all (all → 0..LAST, queried live so new levels are covered)
  let lo = 0, hi = null, fine = false;
  if (args.length === 1) { lo = hi = args[0] - 1; fine = true; }
  else if (args.length >= 2) { lo = args[0] - 1; hi = args[1] - 1; fine = true; }
  // Always use the fine grid: early-exit keeps solvable levels fast regardless of
  // density, and a coarse grid FLICKERS tight/order-dependent levels in and out of
  // certification (the sampled delays miss their narrow windows). fine = reliable.
  const delayStep = 10, maxDelay = 480, minWins = 2, gaps = [30,70,120,170];

  const server = await serve();
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--user-data-dir=/tmp/cut-fairness-profile',
    '--remote-debugging-port=' + CDP_PORT, 'about:blank'], { stdio: 'ignore' });
  let client;
  for (let i = 0; i < 30 && !client; i++) { try { client = await CDP({ port: CDP_PORT }); } catch (e) { await sleep(400); } }
  if (!client) { chrome.kill(); server.close(); throw new Error('no Chrome on ' + CDP_PORT); }
  const { Page, Runtime, Emulation } = client;
  await Runtime.enable(); await Page.enable();
  await Emulation.setDeviceMetricsOverride({ width: VW, height: VH, deviceScaleFactor: 2, mobile: true });
  if (ipad) console.log(`  [iPad aspect ${VW}x${VH} = ${(VW/VH).toFixed(2)}]`);
  await Page.navigate({ url: `http://localhost:${HTTP_PORT}/?sat=0&sab=0` });
  await Page.loadEventFired();
  for (let i = 0; i < 40; i++) { const r = await Runtime.evaluate({ expression: 'typeof window.__game', returnByValue: true }); if (r.result.value === 'object') break; await sleep(150); }

  // Landing-probe mode: `node fairness.cjs land <level>` → trajectory table
  if (mode === 'land') {
    const lvl = (args[0] || 1) - 1;
    const r = await Runtime.evaluate({ expression: landProbe(lvl), returnByValue: true, timeout: 120000 });
    await client.close(); chrome.kill(); server.close();
    console.log(`  landing probe L${lvl + 1} (cut top of cord at delay d; apex/rest as H-fractions, x as W-fraction)`);
    for (const p of r.result.value) console.log(`  d${String(p.d).padStart(3)}  ${p.o === 'win' ? 'WIN ' : p.o === 'fail' ? 'fail' : p.o}  apex ${p.apex}H  land (${p.x}W, ${p.y}H)`);
    return;
  }

  // Robustness gate: `node fairness.cjs robust <level> [<hi>]` — the
  // human-possible judgment. Full no-early-exit sweep → @jfun/levelcheck
  // solveWindow/methodWindows. VERDICT: at least one method must hold a
  // contiguous winning band ≥60 steps (0.5s of timing slack) — else the level
  // is a lottery even though the certify sweep calls it winnable. Run this on
  // every NEW level before shipping it.
  if (mode === 'robust') {
    const lo2 = (args[0] || 1) - 1, hi2 = (args[1] || args[0] || 1) - 1;
    const MIN_WIDTH = 60, MIN_RUN = 2;
    let anyFail = false;
    for (let idx = lo2; idx <= hi2; idx++) {
      const r = await Runtime.evaluate({ expression: robustProbe(idx), returnByValue: true, timeout: 280000 });
      const res2 = r.result.value;
      if (!res2 || !Array.isArray(res2.samples)) { console.error('ROBUST FATAL at L' + (idx + 1) + ':', res2); process.exit(1); }
      const samples = res2.samples;
      const mw = LC.methodWindows(samples, { minWidth: MIN_WIDTH, minRun: MIN_RUN });
      const okMethods = Object.keys(mw).filter(m => mw[m].ok);
      console.log(`  L${idx + 1} robustness (25-delay full sweep, band gate ≥${MIN_WIDTH} steps):`);
      for (const m of Object.keys(mw)) {
        const w = mw[m];
        const band = w.widest ? `[${w.widest.lo}..${w.widest.hi}] width ${w.widest.width} (${w.widest.n} pts)` : '—';
        console.log(`    ${m.padEnd(6)} density ${(w.winFraction * 100).toFixed(0).padStart(3)}%  widest ${band}  ${w.ok ? '✓ band' : '✗ no band'}`);
      }
      if (!Object.keys(mw).length) console.log('    (no method ever won)');
      if (okMethods.length) console.log(`    VERDICT: HUMAN-SOLVABLE via ${okMethods.join(', ')}`);
      else if (res2.hasGate && Object.keys(mw).length) {
        // PULSE-GATE exemption: the blind bots can't watch the gate, but the
        // player CAN — the gate is a visible clock, and its duty window
        // (~0.4×period ≈ 0.4s) is the designed, discoverable timing. A win
        // existing at all proves the pre-gate setup works; the "narrowness"
        // is exactly the visible beat. Advisory, not a failure.
        console.log('    VERDICT: ⚠ pulse-gate level — blind-bot windows are narrow BY DESIGN (the gate is a visible clock); wins exist, human-judge the beat feel');
      }
      else { console.log('    VERDICT: ✗ LOTTERY — winnable but no human-hittable window'); anyFail = true; }
    }
    await client.close(); chrome.kill(); server.close();
    if (anyFail) { console.error('\nROBUSTNESS FAILED'); process.exit(1); }
    return;
  }

  // Distinctness report: `node fairness.cjs distinct` — @jfun/levelcheck ranks
  // the closest level pairs by mechanics+layout features and by an 8x8 canvas
  // hash. ADVISORY: it queues pairs for a human eyeball (the anti-clone gate),
  // it does not fail the run.
  if (mode === 'distinct') {
    const rl = await Runtime.evaluate({ expression: 'window.__game.dims().LAST', returnByValue: true });
    const last = rl.result.value | 0;
    const r = await Runtime.evaluate({ expression: distinctProbe(0, last), returnByValue: true, timeout: 280000 });
    await client.close(); chrome.kill(); server.close();
    const rows = r.result.value;
    if (!rows || rows.fatal) { console.error('DISTINCT FATAL:', rows && rows.fatal); process.exit(1); }
    const hashes = new Map(rows.map(x => [x.idx, LC.hashFromLuma(x.luma)]));
    const pairs = LC.nearDuplicates(rows.map(x => ({ id: x.idx, mechanics: x.mechanics, points: x.points })));
    console.log(`  distinctness report — ${rows.length} levels, closest pairs first (feature dist <0.18 or hash <12/64 = ⚠ eyeball it):`);
    for (const p of pairs.slice(0, 15)) {
      const hd = LC.hamming(hashes.get(p.a), hashes.get(p.b));
      const flag = (p.flagged || hd < 12) ? '  ⚠ near-clone?' : '';
      console.log(`  L${String(p.a + 1).padStart(2)} ↔ L${String(p.b + 1).padStart(2)}  feat ${p.dist.toFixed(3)}  hash ${String(hd).padStart(2)}/64${flag}`);
    }
    return;
  }

  if (hi === null) { const r = await Runtime.evaluate({ expression: 'window.__game.dims().LAST', returnByValue: true }); hi = (r.result.value|0) || 19; }
  const res = await Runtime.evaluate({ expression: inPage(lo, hi, delayStep, maxDelay, minWins, gaps), returnByValue: true, timeout: 280000, awaitPromise: true });
  await client.close(); chrome.kill(); server.close();

  const data = res.result.value;
  if (!data || data.fatal) { console.error('FAIRNESS FATAL:', data && data.fatal); process.exit(1); }
  // difficulty band from the single-cut timing sweep (the fraction of delays that
  // win with the plain main-rope cut) — a proxy for how tight the window is.
  // Exempt: levels whose intended solve needs a precise, non-generic technique
  // the top-down bot can't reproduce — they are certified by BESPOKE sim-tests
  // pins instead. Keep this list tiny and each entry tied to a real pin.
  //   L8 — frozen counterweight: the win needs cutting the RESTRAINT first (a
  //        short, non-topmost rope), not a top-down release (that drops the
  //        crate on the spikes). Pinned as l8line/l8restraint in sim-tests.
  const EXEMPT = { 8: 'restraint-first; sim-tests l8line/l8restraint' };
  const band = r => r >= 0.5 ? 'easy  ' : r >= 0.25 ? 'med   ' : r >= 0.1 ? 'hard  ' : r > 0 ? 'v.hard' : 'seq/pop';
  const fails = [];
  const orderWarns = [];
  console.log(`  fairness certify (${data.delays}-delay grid, minWins=${data.minWins})`);
  for (const L of data.out) {
    const ok = L.wins >= data.minWins;
    const exempt = EXEMPT[L.level];
    const tag = ok ? '✓' : (exempt ? '⊘ exempt' : '✗ UNSOLVABLE');
    // UNDISCOVERABLE-SOLVE flag: a SINGLE-cord, no-balloon level whose only win
    // came from a bottom-cut or cascade is unfair in practice — the player sees
    // one rope and one verb; cut HEIGHT silently changing the outcome (severed-
    // tail mass altering a magnet/wind curve) is not discoverable. Surface it.
    // "Single cord" = ONE pinned anchor and NO pulley (a pulley implies a second
    // visible line, and counterweight restraint-solves are designed bottom cuts).
    // The old `nRopes<=1` compared LINK counts (~20 per cord) — dead code the
    // adversarial review caught; geom.nAnchors resurrects the gate honestly.
    const oneCord = L.geom ? (L.geom.nAnchors<=1 && !L.geom.nPulleys) : (L.nRopes<=1);
    const undisc = ok && !exempt && oneCord && !L.nBalloons && L.winBy && L.winBy!=='top' && L.winBy!=='pop' && L.single===0;
    // @jfun/levelcheck gates through the shared runGates BUNDLE (severity routing
    // in one place, instead of hand-wiring each judge here):
    //   GEOMETRY / frame-fit (BLOCKING) — every must-be-visible object fully
    //     inside the play field (the machine version of the device-caught
    //     "bucket is not fully displayed" bug).
    //   ORDER-DISCOVERABILITY (ADVISORY) — a multi-cut win found by the TOP-DOWN
    //     cascade should be readable off anchor HEIGHT (monotone, ≥2% of screen
    //     height per step). Only casc↓ is instrumented (its cut segments sit AT
    //     the anchors, so segment-y ≈ the visible anchor height; casc↑ cuts at
    //     the crate end, where segment-y says nothing about which anchor). Some
    //     families read via a different cue (2-rope tips read by basket side),
    //     so this warns, not fails.
    // Facts are conditional — pass `frame` only when a basket exists, `order`
    // only for a qualifying casc↓ win; runGates judges whatever it is given.
    const gateFacts = {};
    if (L.geom && L.geom.basket)
      gateFacts.frame = { items: [Object.assign({ name: 'basket' }, L.geom.basket)], frame: { w: L.geom.W, h: L.geom.H }, margin: 2 };
    if (ok && L.winBy === 'casc↓' && Array.isArray(L.winOrd) && L.winOrd.length >= 3)
      gateFacts.order = { values: L.winOrd, minGap: 0.02 };
    const gates = LC.runGates(gateFacts);
    const geomFail = gates.blocking.find(g => g.name === 'frame-fit' && !g.ok) || null;
    const ordWarn = gates.advisory.some(g => g.name === 'order-discoverable' && !g.ok);
    if (ordWarn) orderWarns.push(`L${L.level}: winning ${L.winBy} order [${L.winOrd.join(', ')}] is not height-readable (needs monotone steps ≥0.02H) — verify the player has another cue`);
    // par (cuts in the first win) is meaningful for singles (1) and the clean
    // anchor-end casc↓; suppressed for 'all' (cut-everything) and casc↑ (its
    // bottom-end cuts can leave pin-anchored dangles it re-cuts — inflated).
    const showPar = L.winPar != null && (L.winBy === 'top' || L.winBy === 'bottom' || L.winBy === 'pop' || L.winBy === 'casc↓');
    console.log(`  L${String(L.level).padStart(2)} ${tag}  ${band(L.singleRate)}  wins≥${L.wins}  single ${L.single}/${L.singleTried}  firstWin@${L.firstWin==null?'—':L.firstWin}${L.winBy?' by '+L.winBy:''}${showPar?'  par '+L.winPar:''}${L.lazyWin?'  ⚠ lazy-cut wins':''}${undisc?'  ⚠⚠ UNDISCOVERABLE-SOLVE':''}${ordWarn?'  ⚠ order-gap':''}${geomFail?'  ✗ GEOMETRY':''}${exempt&&!ok?'  ('+exempt+')':''}`);
    if (!ok && !exempt) fails.push(`L${L.level}: certified UNSOLVABLE — only ${L.wins} win(s) found across the seeded cut sweep (single/all/cascade/pop)`);
    if (undisc) fails.push(`L${L.level}: UNDISCOVERABLE-SOLVE — single-rope level won only by '${L.winBy}' (cut height silently decides; retune the geometry so a plain cut wins)`);
    // Deep-chapter contract (L54+): the whole point is that brute force LOSES.
    // A lazy cut-all win there is a design defect, not a footnote — BLOCKING.
    // (Base-campaign levels legitimately win by cut-all, so scope to 54+.)
    if (L.lazyWin && L.level >= 54) fails.push(`L${L.level}: lazy cut-all WINS — violates the deep-chapter brute-force-must-fail contract (reshape hazards so the free drop dies)`);
    if (geomFail) fails.push(`L${L.level}: GEOMETRY — ${geomFail.detail} (must sit fully inside the play field)`);
  }
  if (orderWarns.length) console.log('  advisory (order discoverability):\n  - ' + orderWarns.join('\n  - '));

  // SAWTOOTH ORDERING GATE (@jfun/difficulty checkOrder) — the distribution-
  // matching net Cut lacked. Cut's difficulty order was hand-built by a one-time
  // reorder (a python case-block splice) with NO regression net, so a future
  // insert or reorder can silently sag the campaign into a monotone ramp — the
  // exact sag that reorder fixed. Pin the SHAPE over the full campaign: per-level
  // difficulty = the measured single-cut BAND (easy 1 … seq/pop 5 — the same
  // 1-4(+5) scale the hand-built band curve used), higher = harder. The certifier
  // is deterministic (fixed-DT Verlet, no RNG in the sim), so this sequence is
  // stable run-to-run, which is why it can BLOCK. Only meaningful full-campaign,
  // so skip on sub-ranges. finaleMax holds because the deep-backbone chapter (the
  // hardest, seq/pop) closes the campaign.
  if (!fine) {
    const BI = { 'easy': 1, 'med': 2, 'hard': 3, 'v.hard': 4, 'seq/pop': 5 };
    const diffs = data.out.map(L => BI[band(L.singleRate).trim()]);
    const MIN_FLIPS = 28;   // the shipped campaign has 44 (deterministic); 28 = a 36% margin — catches a real sag, never false-fails a minor edit
    const ord = DIFF.checkOrder(diffs, { minFlips: MIN_FLIPS, finaleMax: true });
    const finaleBand = band(data.out[data.out.length - 1].singleRate).trim();
    console.log(`  sawtooth ordering: ${ord.flips} easy↔hard direction changes (need ≥${MIN_FLIPS}), finale band '${finaleBand}' ${ord.ok ? '✓' : '✗'}`);
    if (!ord.ok) fails.push(`SAWTOOTH — difficulty order degraded: ${ord.violations.map(v => v.type + ' (' + v.detail + ')').join('; ')} (a reorder or insert flattened the easy↔hard alternation; restore the sawtooth)`);
  }

  if (fails.length) { console.error('\nFAIRNESS FAILED:\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('  ALL CERTIFIED — every level winnable within the seeded cut sweep');
})().catch(e => { console.error(e); process.exit(1); });
