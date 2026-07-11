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
    g.cutAt(r.mx + dy/L*e, r.my - dx/L*e, r.mx - dy/L*e, r.my + dx/L*e); }
  function popBalloon(b){ g.cutAt(b.x-b.r-6, b.y, b.x+b.r+6, b.y); }
  // the single-cut target = the TOP-most rope segment: cutting nearest the anchor
  // reliably severs the load path and releases the crate (grabbing the "longest"
  // segment can pick a harness branch that leaves the crate still hanging).
  function topmost(){ const rs=g.ropes(); let best=null,by=1e9; for(const r of rs){ if(r.my<by){by=r.my;best=r;} } return best; }
  function bottommost(){ const rs=g.ropes(); let best=null,by=-1e9; for(const r of rs){ if(r.my>by){by=r.my;best=r;} } return best; }
  function longest(){ return topmost(); } // single-cut target
  const delays = []; for (let d=0; d<=${maxDelay}; d+=${delayStep}) delays.push(d);
  const gaps = ${JSON.stringify(gaps)};
  const out = [];
  for (let idx=${loLevel}; idx<=${hiLevel}; idx++){
    let wins=0, single=0, singleTried=0, firstWin=null, winBy=null, done=false;
    const win = (d,how)=>{ wins++; if(firstWin===null){ firstWin=d; winBy=how; } };
    // pass 1 — single cut + balloon pops across the delay grid (the dominant
    // timing solve; the TOP-most cut also serves as the difficulty proxy)
    for (const d of delays){
      // top-most single-cut (main suspending line) — the band probe
      g.setLevel(idx); stepN(d); let r=topmost(); if(r){ cutRope(r); singleTried++; if (runOut()==='win'){ single++; win(d,'top'); } }
      // bottom-most single-cut — the "cut the tie-down, leave the cord" solve
      // (elastic slingshot / counterweight restraint), which topmost never finds
      g.setLevel(idx); stepN(d); r=bottommost(); if(r){ cutRope(r); if (runOut()==='win') win(d,'bottom'); }
      for (let bi=0; bi<8; bi++){ g.setLevel(idx); stepN(d); const b=g.balloons()[bi]; if(!b) break; popBalloon(b); if(runOut()==='win') win(d,'pop'); }
      if (wins>=${minWins}) { done=true; break; }
    }
    // pass 2 — escalate: cut-all, then a CASCADE (release every rope top-down
    // with a gap between cuts) which covers N-rope release-order levels.
    if (!done) for (const d of delays){
      g.setLevel(idx); stepN(d); for(const r of g.ropes()) cutRope(r); for(const b of g.balloons()) popBalloon(b);
      if (runOut()==='win') win(d,'all');
      for (const gap of gaps){
        for (const pick of [topmost, bottommost]){ // release order: top-down AND bottom-up
          g.setLevel(idx); stepN(d);
          let guard=0;
          while(g.ropes().length && guard++<12){ const r=pick(); if(!r) break; cutRope(r); stepN(gap); }
          for(const b of g.balloons()) popBalloon(b);
          if (runOut()==='win') win(d,pick===topmost?'casc↓':'casc↑');
        }
      }
      if (wins>=${minWins}) break;
    }
    // lazy probe — cut everything at t=0 (trivial-solve flag)
    g.setLevel(idx); for(const r of g.ropes()) cutRope(r); for(const b of g.balloons()) popBalloon(b);
    const lazyWin = runOut()==='win';
    out.push({ idx, level: idx+1, wins, single, singleTried,
      singleRate: singleTried? +(single/singleTried).toFixed(2):0, firstWin, winBy, lazyWin,
      nRopes: (g.setLevel(idx), g.ropes().length), nBalloons: g.balloons().length });
  }
  return { out, minWins:${minWins}, delays: delays.length };
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
  await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
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
  console.log(`  fairness certify (${data.delays}-delay grid, minWins=${data.minWins})`);
  for (const L of data.out) {
    const ok = L.wins >= data.minWins;
    const exempt = EXEMPT[L.level];
    const tag = ok ? '✓' : (exempt ? '⊘ exempt' : '✗ UNSOLVABLE');
    // UNDISCOVERABLE-SOLVE flag: a SINGLE-rope, no-balloon level whose only win
    // came from a bottom-cut or cascade is unfair in practice — the player sees
    // one rope and one verb; cut HEIGHT silently changing the outcome (severed-
    // tail mass altering a magnet/wind curve) is not discoverable. Surface it.
    const undisc = ok && L.nRopes<=1 && !L.nBalloons && L.winBy && L.winBy!=='top' && L.winBy!=='pop' && L.single===0;
    console.log(`  L${String(L.level).padStart(2)} ${tag}  ${band(L.singleRate)}  wins≥${L.wins}  single ${L.single}/${L.singleTried}  firstWin@${L.firstWin==null?'—':L.firstWin}${L.winBy?' by '+L.winBy:''}${L.lazyWin?'  ⚠ lazy-cut wins':''}${undisc?'  ⚠⚠ UNDISCOVERABLE-SOLVE':''}${exempt&&!ok?'  ('+exempt+')':''}`);
    if (!ok && !exempt) fails.push(`L${L.level}: certified UNSOLVABLE — only ${L.wins} win(s) found across the seeded cut sweep (single/all/cascade/pop)`);
    if (undisc) fails.push(`L${L.level}: UNDISCOVERABLE-SOLVE — single-rope level won only by '${L.winBy}' (cut height silently decides; retune the geometry so a plain cut wins)`);
  }
  if (fails.length) { console.error('\nFAIRNESS FAILED:\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('  ALL CERTIFIED — every level winnable within the seeded cut sweep');
})().catch(e => { console.error(e); process.exit(1); });
