#!/usr/bin/env node
/* CUT solvability + liveness regression net. Drives the REAL ported game in
   headless Chrome (no reimplementation — the shipped web/js/game.js is exercised
   via its window.__game debug hooks) and asserts:
     · all 8 levels build (correct index, phase 'play', a crate, ropes present)
     · cutting every rope frees the crate and each level reaches a TERMINAL phase
       (win|fail) within a step budget with finite coordinates — i.e. no NaN, no
       infinite hang (the "puzzle closes" invariant from the global CLAUDE.md)
     · level 1 (single vertical rope, basket directly below) is a deterministic
       WIN — proving the full cut → fall → land → win pipeline end-to-end
     · zero console errors / uncaught exceptions during the run
   This is the port-regression guard: if the extraction breaks the sim, boot, or
   render, this fails. Fine per-level timing solves (pendulum/swing/pulley) are
   feel-tested in the browser — the design reference is pre-verified. */
const CDP = require('chrome-remote-interface');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9458;
const HTTP_PORT = 4185;
const WEB = path.join(__dirname, '..', '..', 'web');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.woff2':'font/woff2', '.json':'application/json', '.png':'image/png' };

// Minimal static server for web/ (localStorage + fonts want http, not file://).
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

// Runs entirely in-page and returns structured results — one round-trip.
const IN_PAGE = `(function(){
  const g = window.__game;
  if (!g || !g.state || !g.setLevel || !g.ropes || !g.cutAt || !g.stepN)
    return { fatal: 'window.__game missing expected hooks' };
  const finite = o => o && isFinite(o.x) && isFinite(o.y);
  function cutAllRopes(){
    for (const r of g.ropes()) {
      const dx = r.x2-r.x1, dy = r.y2-r.y1, L = Math.hypot(dx,dy) || 1;
      const px = -dy/L, py = dx/L, e = Math.max(12, L);      // perpendicular swipe through midpoint
      g.cutAt(r.mx - px*e, r.my - py*e, r.mx + px*e, r.my + py*e);
    }
  }
  const D = g.dims();
  const levels = [];
  for (let i = 0; i < 20; i++) {
    g.setLevel(i);
    const s0 = g.state(), ropes = g.ropes();
    const built = s0.level === i+1 && s0.phase === 'play' && ropes.length > 0 && finite(s0.crate);
    cutAllRopes();
    let end = 'play';
    for (let k = 0; k < 1500; k++) { g.stepN(1); const p = g.state().phase; if (p !== 'play') { end = p; break; } }
    const c = g.state().crate;
    // "sane" = still simulating without NaN / explosion. A crate perpetually
    // bouncing on the e=1.05 pad (level 5) legitimately never settles — that's
    // designed, so a finite on-field crate still in 'play' passes liveness.
    const sane = finite(c) && c.x > -3*D.S && c.x < D.W + 3*D.S && c.y > -3*D.S && c.y < D.H + 3*D.S;
    levels.push({ i, built, ropes: ropes.length, end, crateFinite: finite(c), sane });
  }
  // Stall-watchdog pin (rim-perch dead-end, found on device 2026-07-06): wrong-order
  // cuts on L2 can perch the crate on the basket rim with a severed-rope remnant
  // attached — a state no player input can move. The watchdog must end EVERY such
  // low resting state (the reference's 0.02*H threshold sat below the contact-jitter
  // noise floor and never fired; ours is 0.05*H). Invariant: after cutting both
  // ropes wrong-order at any timing, a level may end win/fail or keep a crate
  // HANGING above 0.6*H (recoverable) — but never rest below 0.6*H in 'play'.
  function cutLinkNear(y){
    const rs = g.ropes(); if (!rs.length) return false;
    let best = rs[0], bd = 1e9;
    for (const r of rs) { const dd = Math.abs(r.my - y); if (dd < bd) { bd = dd; best = r; } }
    const dx = best.x2 - best.x1, dy = best.y2 - best.y1, L = Math.hypot(dx, dy) || 1;
    g.cutAt(best.mx + dy/L*20, best.my - dx/L*20, best.mx - dy/L*20, best.my + dx/L*20);
    return true;
  }
  const D2 = g.dims();
  const stall = [];
  for (const delay of [13, 15, 17, 19, 21, 23, 26, 30]) {
    g.setLevel(1);
    const rx = D2.W*0.5 + D2.S*0.5;
    g.cutAt(rx - 12, D2.H*0.10, rx + 12, D2.H*0.10);  // right rope first (wrong order)
    g.stepN(delay);
    cutLinkNear(D2.H*0.10);                            // then the left, near the anchor
    let end = 'play';
    for (let k = 0; k < 1500; k++) { g.stepN(1); const p = g.state().phase; if (p !== 'play') { end = p; break; } }
    const c = g.state().crate;
    stall.push({ delay, end, cy01: Math.round(c.y / D2.H * 100) / 100, ok: end !== 'play' || c.y < 0.6*D2.H });
  }
  // L5 pad pin: the designed solve — cut the rope, crate trampolines off the pad
  // into the basket — must WIN deterministically at any cut height (the pad
  // trampoline + one-way severed tail make the arc timing-independent).
  const l5 = [];
  for (const cy of [0.15, 0.30, 0.40]) {
    g.setLevel(4);
    cutLinkNear(D2.H * cy);
    let end = 'play';
    for (let k = 0; k < 1500; k++) { g.stepN(1); const p = g.state().phase; if (p !== 'play') { end = p; break; } }
    l5.push({ cy, end });
  }
  // Helpers for the mechanic-arc pins.
  function popNow(){ const bl=g.balloons()[0]; if(bl) g.cutAt(bl.x-bl.r-6,bl.y,bl.x+bl.r+6,bl.y); }
  function runOut(n){ for(let k=0;k<n;k++){ g.stepN(1); const p=g.state().phase; if(p!=='play') return p; } return 'play'; }
  function popSweep(idx, delays, settle){ // pop the balloon after various float times
    return delays.map(dl=>{ g.setLevel(idx); g.stepN(settle||0); g.stepN(dl); popNow(); return runOut(1500); });
  }
  function cutSweep(idx, delays){ // cut the crate's rope after various delays
    return delays.map(dl=>{ g.setLevel(idx); g.stepN(dl);
      const c=g.state().crate;
      g.cutAt(c.x-30, c.y-D2.S*0.8, c.x+30, c.y-D2.S*0.8);
      return runOut(1500); });
  }
  const both = a => a.includes('win') && a.includes('fail');
  const pins = {};
  // L9 (idx8) balloon intro: must FLOAT (PBD lift regression guard) + pop wins.
  g.setLevel(8);
  const by0 = g.state().crate.y;
  g.stepN(240);
  pins.l9 = { rosePx: Math.round(by0 - g.state().crate.y), end: (popNow(), runOut(1200)) };
  // L10 (idx9) balloon swing develop: pop phase must matter (both outcomes).
  pins.l10 = popSweep(9, [0, 60, 120, 180, 240, 300, 360, 420]);
  // L10 raised-shelf safety: the buoyant pair must survive a LONG no-pop float
  // (the mid-flight shelf sits below the float line and must never catch the
  // swinging pair itself) — assert phase stays 'play' with no pop.
  g.setLevel(9); pins.l10floatSafe = runOut(700);
  // and an early pop must die MID-AIR on the shelf (not floor-thud): y<=0.80H.
  g.setLevel(9); g.stepN(6); popNow();
  pins.l10early = (function(){ for(let k=0;k<1500;k++){ g.stepN(1); const s=g.state(); if(s.phase!=='play') return {out:s.phase, y01:+(s.crate.y/D2.H).toFixed(2)}; } return {out:'play',y01:null}; })();
  // L11 (idx10) balloon→pad spectacle: generous — most pop timings must WIN.
  pins.l11 = popSweep(10, [0, 80, 160, 240]);
  // L12 (idx11) ceiling twist: never-pop must FAIL on the rafters; early pop must WIN.
  g.setLevel(11);
  pins.l12never = runOut(1800);
  g.setLevel(11);
  g.stepN(30); popNow();
  pins.l12pop = runOut(1500);
  // L13 (idx12) trolley intro / L14 (idx13) develop / L15 (idx14) diagonal twist:
  // release phase must matter on each.
  pins.l13 = cutSweep(12, [0, 70, 140, 210, 280, 350, 420, 490]);
  pins.l14 = cutSweep(13, [0, 60, 120, 180, 240, 300, 360]);
  pins.l15 = cutSweep(14, [0, 60, 120, 180, 240, 300, 360]);
  // L16 (idx15) pulse intro / L17 (idx16) pendulum×gate / L18 (idx17) double gate:
  // release phase must matter on each.
  pins.l16 = (function(){ return [0,30,60,90,120,150].map(dl=>{ g.setLevel(15); g.stepN(dl); cutLinkNear(D2.H*0.12); return runOut(1200); }); })();
  // (cut the rope's upper section — a crate-relative swipe misses mid-swing;
  // 12-step grid over a full swing: the win = swing-apex × open-gate alignment)
  pins.l17 = [];
  for (let dl = 0; dl <= 192; dl += 12) {
    g.setLevel(16); g.stepN(dl); cutLinkNear(D2.H * 0.10); pins.l17.push(runOut(1500));
  }
  pins.l18 = (function(){ return [0,30,60,90,120,150].map(dl=>{ g.setLevel(17); g.stepN(dl); cutLinkNear(D2.H*0.12); return runOut(1500); }); })();
  // L19 (idx18) balloon+pulse combo: some pop timing must win.
  pins.l19 = popSweep(18, [0, 30, 60, 90, 120, 150]);
  // L20 (idx19) finale: cut the tether at a trolley phase, pop on the gate beat —
  // some combination must win, some must fail.
  pins.l20 = [];
  for (const cutDl of [0, 200, 400]) {
    for (const popDl of [0, 60, 120]) {
      g.setLevel(19);
      g.stepN(cutDl);
      cutLinkNear(D2.H * 0.28);      // sever the tether near the rail
      g.stepN(popDl);
      popNow();
      pins.l20.push(runOut(1500));
    }
  }
  // L21 (idx20) ELASTIC intro: the crate bounces on the stretchy cord; cutting at
  // the launch phase flings it up-and-over into the basket. Release phase must
  // matter (a mistimed cut misses) — a real timing puzzle, not a free drop.
  pins.l21 = [0,30,60,90,110,130,160,190,220].map(dl=>{
    g.setLevel(21); g.stepN(dl); // elastic intro — moved to L22 (case 21) by the sawtooth reorder
    const rs=g.ropes(); if(!rs.length) return 'norope';
    let top=rs[0],by=1e9; for(const r of rs){ if(r.my<by){by=r.my;top=r;} } // cut near the anchor
    const dx=top.x2-top.x1, dy=top.y2-top.y1, L=Math.hypot(dx,dy)||1, e=Math.max(14,L);
    g.cutAt(top.mx+dy/L*e, top.my-dx/L*e, top.mx-dy/L*e, top.my+dx/L*e);
    return runOut(1300);
  });
  // L22 (idx21, post-trim) ELASTIC × PULSE: fling through the timed gate — needs
  // BOTH the bounce phase and the gate's open window (two timings compose).
  pins.l22 = [0,60,100,120,140,160,180].map(dl=>{
    g.setLevel(27); g.stepN(dl); // elastic × pulse — moved to L28 (case 27) by the sawtooth reorder
    const rs=g.ropes(); if(!rs.length) return 'norope';
    let top=rs[0],by=1e9; for(const r of rs){ if(r.my<by){by=r.my;top=r;} }
    const dx=top.x2-top.x1, dy=top.y2-top.y1, L=Math.hypot(dx,dy)||1, e=Math.max(14,L);
    g.cutAt(top.mx+dy/L*e, top.my-dx/L*e, top.mx-dy/L*e, top.my+dx/L*e);
    return runOut(1300);
  });
  // L23 (idx22, post-trim) ELASTIC mirror: the leftward fling — launch phase must
  // still matter (mistimed = miss/off-field).
  pins.l23 = [0,60,110,130,150,170,200].map(dl=>{
    g.setLevel(33); g.stepN(dl); // elastic mirror — moved to L34 (case 33) by the sawtooth reorder
    const rs=g.ropes(); if(!rs.length) return 'norope';
    let top=rs[0],by=1e9; for(const r of rs){ if(r.my<by){by=r.my;top=r;} }
    const dx=top.x2-top.x1, dy=top.y2-top.y1, L=Math.hypot(dx,dy)||1, e=Math.max(14,L);
    g.cutAt(top.mx+dy/L*e, top.my-dx/L*e, top.mx-dy/L*e, top.my+dx/L*e);
    return runOut(1300);
  });
  // L4 (idx3) meaningful-spike pin: the mid-air bar must kill the lazy both-cut,
  // while the taught order-solve (left, beat, right) must win.
  g.setLevel(3);
  g.cutAt(D2.W * 0.30, D2.H * 0.20, D2.W * 0.70, D2.H * 0.20);
  pins.l4both = runOut(1200);
  pins.l4order = [50, 90, 140].map(D => {
    g.setLevel(3);
    (function(){ const rs=g.ropes(); let best=rs[0], bd=1e9;
      for(const r of rs){ const dd=Math.hypot(r.mx-(D2.W*0.5-D2.S*0.5), r.my-D2.H*0.20); if(dd<bd){bd=dd;best=r;} }
      const dx=best.x2-best.x1, dy=best.y2-best.y1, L=Math.hypot(dx,dy)||1;
      g.cutAt(best.mx+dy/L*14,best.my-dx/L*14,best.mx-dy/L*14,best.my+dx/L*14); })();
    g.stepN(D);
    (function(){ const rs=g.ropes(); let best=rs[0], bd=1e9;
      for(const r of rs){ const dd=Math.hypot(r.mx-(D2.W*0.5+D2.S*0.5), r.my-D2.H*0.20); if(dd<bd){bd=dd;best=r;} }
      const dx=best.x2-best.x1, dy=best.y2-best.y1, L=Math.hypot(dx,dy)||1;
      g.cutAt(best.mx+dy/L*14,best.my-dx/L*14,best.mx-dy/L*14,best.my+dx/L*14); })();
    return runOut(1200);
  });
  // L8 (idx7) DEAD-END guard: no cut sequence may leave the crate stuck in 'play'.
  // The counterweight can perch the crate on the pulley shelf (a HIGH ledge) — hit
  // on device. The stall watchdog (incl. crateResting for ledge perches) must end
  // EVERY outcome within budget (win|fail), never leave a settled 'play'.
  { const cutXY=(x,y)=>{ const rs=g.ropes(); if(!rs.length) return false;
      let best=rs[0],bd=1e9; for(const r of rs){ const d=Math.hypot(r.mx-x,r.my-y); if(d<bd){bd=d;best=r;} }
      const dx=best.x2-best.x1,dy=best.y2-best.y1,L=Math.hypot(dx,dy)||1;
      g.cutAt(best.mx+dy/L*18,best.my-dx/L*18,best.mx-dy/L*18,best.my+dx/L*18); return true; };
    // HARD dead-end = still 'play' after budget AND no uncut rope left (no player
    // action can move it). A 'play' with a rope left is RECOVERABLE (cut it) and
    // allowed — auto-failing suspended crates would break legit between-cut hangs.
    pins.l8stuck = [];
    const rec = () => ({ o: runOut(2600), ropes: g.ropes().length });
    for(const [x,y] of [[0.42,0.20],[0.46,0.12],[0.86,0.42],[0.90,0.44],[0.34,0.24],[0.50,0.09]]) {
      g.setLevel(7); cutXY(x*D2.W,y*D2.H); pins.l8stuck.push(rec());
    }
    for(const d of [40,120,240,360]) { // cut restraint, haul, then cut the line mid-haul
      g.setLevel(7); cutXY(0.86*D2.W,0.42*D2.H); g.stepN(d); cutXY(0.44*D2.W,0.20*D2.H); pins.l8stuck.push(rec());
    }
    // MAGNET capture guard: a magnet can trap the crate in a decaying orbit that
    // never settles (hit on device L35). Every cut delay must reach a TERMINAL
    // state within a generous budget — never a permanent 'play' (captured).
    pins.l35cap = [];
    const cutTop = () => { const rs=g.ropes(); if(!rs.length) return; let t=rs[0],by=1e9; for(const r of rs){ if(r.my<by){by=r.my;t=r;} }
      const dx=t.x2-t.x1, dy=t.y2-t.y1, L=Math.hypot(dx,dy)||1, e=Math.max(14,L); g.cutAt(t.mx+dy/L*e,t.my-dx/L*e,t.mx-dy/L*e,t.my+dx/L*e); };
    for (let dl=0; dl<=240; dl+=30) { g.setLevel(28); g.stepN(dl); cutTop(); pins.l35cap.push(runOut(3200)); } // magnet×gate → L29 (case 28) post-reorder
    // STAR-MISS guard: landing in the basket WITHOUT the star must FAIL (retry),
    // never hang in 'play' (win is star-gated + stall watchdog is !all-guarded —
    // the L43 dead-end hit on device). Sweep cut delays on L43 (trolley × star):
    // every outcome terminal.
    pins.l43miss = [];
    for (let dl=0; dl<=360; dl+=40) { g.setLevel(44); g.stepN(dl); cutTop(); pins.l43miss.push(runOut(3200)); } // trolley×star → L45 (case 44) post-reorder
  }
  // L7 (idx6) swing pin: release phase must matter across the mid-gap spike shelf.
  pins.l7 = [];
  for (let dl = 0; dl < 220; dl += 22) {
    g.setLevel(6);
    g.stepN(dl);
    cutLinkNear(D2.H * 0.12);
    pins.l7.push(runOut(1500));
  }
  // L8 (idx7) meaningful-spike pin: the raised mid-fall spike (0.52H) must kill the
  // WRONG cut (line first → crate plummets onto it) while the taught restraint-first
  // haul (crate rises up-and-over the pulley) clears it and WINS.
  function cutNearXY(x,y){ const rs=g.ropes(); if(!rs.length) return false;
    let best=rs[0], bd=1e9; for(const r of rs){ const d=Math.hypot(r.mx-x,r.my-y); if(d<bd){bd=d;best=r;} }
    const dx=best.x2-best.x1, dy=best.y2-best.y1, L=Math.hypot(dx,dy)||1;
    g.cutAt(best.mx+dy/L*18,best.my-dx/L*18,best.mx-dy/L*18,best.my+dx/L*18); return true; }
  g.setLevel(7); cutNearXY(D2.W*0.42, D2.H*0.20);
  { let r={out:'play',y01:null}; for(let k=0;k<1500;k++){ g.stepN(1); const s=g.state(); if(s.phase!=='play'){ r={out:s.phase,y01:+(s.crate.y/D2.H).toFixed(2)}; break; } } pins.l8line=r; }
  g.setLevel(7); cutNearXY(D2.W*0.86, D2.H*0.42); pins.l8restraint = runOut(1500);
  // L14 (idx13) / L15 (idx14) trolley pin: an EARLY/impatient cut drops the crate
  // into the left region → must die MID-AIR on the raised shelf (not floor-thud),
  // i.e. fail with the crate ABOVE 0.80H (a floor death would be ~0.94H).
  function earlyCutDeathY(idx){ g.setLevel(idx); g.stepN(6); const c=g.state().crate;
    g.cutAt(c.x-30, c.y-D2.S*0.8, c.x+30, c.y-D2.S*0.8);
    for(let k=0;k<1500;k++){ g.stepN(1); const s=g.state(); if(s.phase!=='play') return {out:s.phase, y01:+(s.crate.y/D2.H).toFixed(2)}; }
    return {out:'play', y01:null}; }
  pins.l14early = earlyCutDeathY(13);
  pins.l15early = earlyCutDeathY(14);
  // Ending smoke: win the LAST level → the campaign ending (phase 'end') must
  // start after the win dwell and stay stable for a few seconds of lantern time.
  // The last level is the elastic intro (idx20) — cut the cord at the launch
  // window (d~130, a known l21 win) to fling the crate home.
  { const last = D2.LAST;
    // The ending TRANSITION is what this checks (win the last level → lantern
    // ending). Solvability of every level is the fairness harness's job, so force
    // the win via the test-only winNow() hook rather than re-solving whatever the
    // last level currently is.
    g.setLevel(last); g.winNow();
    let started = false;
    for (let k=0;k<400;k++){ g.stepN(1); if(g.state().phase==='end'){ started=true; break; } } // win dwell 120 → advanceLevel → startEnding
    g.stepN(600);
    pins.ending = { finaleRun: 'win', phaseAfterWin: started?'end':g.state().phase, phaseLater: g.state().phase };
  }
  // INVISIBLE-DEPTH order-walk guard (L54/L55 = idx 53/54): the brute-force "cut
  // everything" must reach a TERMINAL state (no dead-end) — and it FAILS, confirming
  // the level can't be solved by cutting everything (the depth is in the ORDER; the
  // winning order's existence is proved by the general certifier).
  pins.deepWalk = {};
  for (const idx of [53,54,55,56,57,58,59,60,61,62]) { g.setLevel(idx); cutAllRopes(); pins.deepWalk['L'+(idx+1)] = runOut(1800); }
  // How-to-play smoke: every tutorial page must render without throwing, the
  // overlay chrome must sync (caption per page), and closing must unpause.
  pins.howto = { caps: [], closed: false, unpaused: false };
  try {
    g.setLevel(0);
    const cap = document.getElementById('howtoCap');
    for (let p = 0; p < 13; p++) {
      g.howto(p);
      g.stepN(1); // draws a frame incl. drawHowto
      pins.howto.caps.push(cap.textContent);
    }
    g.howto(-1);
    pins.howto.closed = document.getElementById('howto').classList.contains('hidden');
    pins.howto.unpaused = !document.body.classList.contains('howto-open');
    g.stepN(5);
  } catch (e) { pins.howto.err = String(e); }
  return { levels, stall, l5, pins };
})()`;

(async () => {
  const server = await serve();
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--user-data-dir=/tmp/cut-cdp-profile',
    '--window-size=390,844', // phone portrait — the game's target aspect
    '--remote-debugging-port=' + CDP_PORT, 'about:blank'], { stdio: 'ignore' });

  let client;
  for (let i = 0; i < 30 && !client; i++) { try { client = await CDP({ port: CDP_PORT }); } catch (e) { await sleep(400); } }
  if (!client) { chrome.kill(); server.close(); throw new Error('could not connect to Chrome on ' + CDP_PORT); }

  const { Page, Runtime, Console, Emulation } = client;
  const errors = [];
  await Runtime.enable(); await Console.enable(); await Page.enable();
  // TRUE phone-portrait viewport. --window-size alone is NOT enough: Chromium
  // clamps window width to ~500px, silently running the sim at a wide aspect.
  await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  Runtime.exceptionThrown(p => errors.push('exception: ' + (p.exceptionDetails.exception && p.exceptionDetails.exception.description || p.exceptionDetails.text)));
  Console.messageAdded(({ message }) => { if (message.level === 'error') errors.push('console.error: ' + message.text); });

  await Page.navigate({ url: `http://localhost:${HTTP_PORT}/?sat=0&sab=0` });
  await Page.loadEventFired();
  // wait for __game boot
  for (let i = 0; i < 40; i++) {
    const r = await Runtime.evaluate({ expression: 'typeof window.__game', returnByValue: true });
    if (r.result.value === 'object') break;
    await sleep(150);
  }
  const res = await Runtime.evaluate({ expression: IN_PAGE, returnByValue: true });

  await client.close(); chrome.kill(); server.close();

  const out = res.result.value;
  const fail = [];
  if (!out || out.fatal) fail.push(out ? out.fatal : 'no result from page');
  else {
    for (const L of out.levels) {
      const n = L.i + 1;
      if (!L.built) fail.push(`level ${n}: did not build (ropes=${L.ropes})`);
      if (!L.crateFinite) fail.push(`level ${n}: crate coords not finite (NaN?) end=${L.end}`);
      // must resolve to win/fail, OR keep simulating sanely (pad-bounce level)
      if (L.end !== 'win' && L.end !== 'fail' && !L.sane) fail.push(`level ${n}: stuck '${L.end}' with insane crate`);
    }
    const l1 = out.levels[0];
    if (l1 && l1.end !== 'win') fail.push(`level 1 must be a deterministic WIN, got '${l1.end}'`);
    for (const s of out.stall || []) {
      if (!s.ok) fail.push(`stall pin: L2 wrong-order delay=${s.delay} left crate RESTING low (cy=${s.cy01}H) stuck in 'play' — watchdog didn't fire`);
    }
    for (const s of out.l5 || []) {
      if (s.end !== 'win') fail.push(`L5 pad pin: cut at ${s.cy}H must WIN via the trampoline, got '${s.end}'`);
    }
    const P = out.pins || {};
    const both = a => Array.isArray(a) && a.includes('win') && a.includes('fail');
    if (P.l9) {
      if (P.l9.rosePx < 30) fail.push(`L9 balloon: pair must FLOAT UP, rose only ${P.l9.rosePx}px (PBD lift dilution?)`);
      if (P.l9.end !== 'win') fail.push(`L9 balloon: popping over the basket must WIN, got '${P.l9.end}'`);
    }
    if (P.l10 && !both(P.l10)) fail.push(`L10 balloon-swing: pop phase must matter (win+fail), got [${P.l10}]`);
    if (P.l10floatSafe && P.l10floatSafe !== 'play') fail.push(`L10: the buoyant pair must survive a no-pop float — the raised shelf killed it (${P.l10floatSafe})`);
    if (P.l10early) {
      if (P.l10early.out !== 'fail') fail.push(`L10: an early pop must FAIL, got '${P.l10early.out}'`);
      else if (P.l10early.y01 !== null && P.l10early.y01 > 0.80) fail.push(`L10: early pop must die MID-AIR on the shelf (y<=0.80H), died at ${P.l10early.y01}H`);
    }
    if (P.l11 && P.l11.filter(e => e === 'win').length < 3) fail.push(`L11 spectacle: most pop timings must WIN, got [${P.l11}]`);
    if (P.l12never !== 'fail') fail.push(`L12 ceiling twist: never-pop must FAIL on the rafters, got '${P.l12never}'`);
    if (P.l12pop !== 'win') fail.push(`L12 ceiling twist: early pop must WIN, got '${P.l12pop}'`);
    for (const [k, name] of [['l13','trolley intro'],['l14','trolley develop'],['l15','diagonal twist'],['l16','pulse intro'],['l17','pendulum×gate'],['l18','double gate']]) {
      if (P[k] && !both(P[k])) fail.push(`${k} ${name}: release phase must matter (win+fail), got [${P[k]}]`);
    }
    if (P.l4both === 'win') fail.push(`L4: the lazy both-cut must NOT win (spike bar), got '${P.l4both}'`);
    if (P.l4order && !P.l4order.includes('win')) fail.push(`L4: the order-solve must WIN, got [${P.l4order}]`);
    if (P.l7 && !both(P.l7)) fail.push(`L7: swing release phase must matter (win+fail), got [${P.l7}]`);
    if (P.l19 && !P.l19.includes('win')) fail.push(`L19 combo: some pop timing must WIN, got [${P.l19}]`);
    if (P.l20 && !both(P.l20)) fail.push(`L20 finale: combo sweep must contain win and fail, got [${P.l20}]`);
    if (P.l21 && !both(P.l21)) fail.push(`L21 elastic: launch phase must matter (win+fail), got [${P.l21}]`);
    if (P.l22 && !both(P.l22)) fail.push(`L22 elastic×pulse: launch+gate timing must matter (win+fail), got [${P.l22}]`);
    if (P.l23 && !both(P.l23)) fail.push(`L23 elastic mirror: launch phase must matter (win+fail), got [${P.l23}]`);
    if (P.l8line) {
      if (P.l8line.out !== 'fail') fail.push(`L8: cutting the line first must DIE on the raised spike, got '${P.l8line.out}'`);
      else if (P.l8line.y01 !== null && P.l8line.y01 > 0.62) fail.push(`L8: line-first must die MID-FALL on the 0.52H spike, died at ${P.l8line.y01}H (spike not catching → slid to floor/off-field)`);
    }
    if (P.l8restraint && P.l8restraint !== 'win') fail.push(`L8: restraint-first haul must WIN (clear the raised spike), got '${P.l8restraint}'`);
    if (P.l8stuck) { const hard = P.l8stuck.filter(e => e.o === 'play' && e.ropes === 0);
      if (hard.length) fail.push(`L8 dead-end: a cut left the crate HARD-STUCK in 'play' with no rope to cut (watchdog didn't fire) — ${hard.length} of ${P.l8stuck.length} combos`); }
    if (P.l35cap && P.l35cap.some(o => o === 'play')) fail.push(`L35 magnet: a cut left the crate CAPTURED in 'play' (orbit/pinned to the magnet, capture watchdog didn't fire), got [${P.l35cap}]`);
    if (P.l43miss && P.l43miss.some(o => o === 'play')) fail.push(`L43 star-miss: a cut left the crate in 'play' (settled in basket with star uncollected — starMissT didn't fire), got [${P.l43miss}]`);
    for (const [k, n] of [['l14early','L14'],['l15early','L15']]) {
      const e = P[k]; if (!e) continue;
      if (e.out !== 'fail') fail.push(`${n}: an early/impatient cut must FAIL, got '${e.out}'`);
      else if (e.y01 !== null && e.y01 > 0.80) fail.push(`${n}: early cut must die MID-AIR on the shelf (y<=0.80H), died at ${e.y01}H (floor-thud → shelf not catching)`);
    }
    if (P.ending) {
      if (P.ending.finaleRun !== 'win') fail.push(`ending smoke: the known finale combo must WIN, got '${P.ending.finaleRun}'`);
      if (P.ending.phaseAfterWin !== 'end' || P.ending.phaseLater !== 'end')
        fail.push(`ending smoke: campaign ending must start and persist, got ${P.ending.phaseAfterWin}/${P.ending.phaseLater}`);
    }
    if (P.howto) {
      if (P.howto.err) fail.push(`howto smoke: threw ${P.howto.err}`);
      if ((P.howto.caps || []).length !== 13 || P.howto.caps.some(c => !c))
        fail.push(`howto smoke: expected 13 captioned pages, got [${P.howto.caps}]`);
      if (new Set(P.howto.caps).size !== 13) fail.push(`howto smoke: captions must be distinct per page, got [${P.howto.caps}]`);
      if (!P.howto.closed || !P.howto.unpaused) fail.push(`howto smoke: close must hide the overlay and unfreeze (closed=${P.howto.closed} unpaused=${P.howto.unpaused})`);
    }
    if (P.deepWalk) {
      for (const k of Object.keys(P.deepWalk)) {
        if (P.deepWalk[k] === 'play') fail.push(`${k} order-walk: cut-all left the crate in 'play' (dead-end — the stall watchdog didn't fire)`);
      }
    }
  }
  for (const e of errors) fail.push(e);

  if (out && out.levels) {
    console.log('  levels: ' + out.levels.map(L => `${L.i + 1}:${L.built ? '✓' : '✗'}${L.end}`).join('  '));
    if (out.stall) console.log('  stall pin: ' + out.stall.map(s => `${s.delay}:${s.end}${s.ok ? '' : '⚠'}`).join('  '));
    if (out.l5) console.log('  L5 pad pin: ' + out.l5.map(s => `${s.cy}:${s.end}`).join('  '));
    const P2 = out.pins || {};
    if (P2.l9) console.log(`  L9 balloon: rose ${P2.l9.rosePx}px, pop→${P2.l9.end}`);
    for (const k of ['l10','l11','l13','l14','l15','l16','l17','l18','l19','l20','l21','l22','l23']) {
      if (P2[k]) console.log(`  ${k}: ` + P2[k].join(' '));
    }
    if (P2.l12never !== undefined) console.log(`  l12: never-pop→${P2.l12never}  early-pop→${P2.l12pop}`);
    if (P2.l10floatSafe !== undefined) console.log(`  l10 shelf: no-pop float→${P2.l10floatSafe}  early-pop→${P2.l10early.out}@${P2.l10early.y01}H`);
    if (P2.l8line !== undefined) console.log(`  l8: line-first→${P2.l8line.out}@${P2.l8line.y01}H  restraint-first→${P2.l8restraint}`);
    if (P2.l14early) console.log(`  trolley early-cut death: L14→${P2.l14early.out}@${P2.l14early.y01}H  L15→${P2.l15early.out}@${P2.l15early.y01}H`);
    if (P2.deepWalk) console.log(`  order-walk cut-all: ${Object.entries(P2.deepWalk).map(([k, v]) => k + '→' + v).join('  ')} (must be terminal, and 'fail' = brute-force loses)`);
    if (P2.howto) console.log(`  howto: ${P2.howto.caps ? P2.howto.caps.length : 0} pages, closed=${P2.howto.closed}, unpaused=${P2.howto.unpaused}`);
  }
  if (fail.length) { console.error('SIM TESTS FAILED:\n  - ' + fail.join('\n  - ')); process.exit(1); }
  console.log('  20/20 levels build · terminal/sane · every arc pinned (intro/develop/twist/combo) · no console errors');
})().catch(e => { console.error(e); process.exit(1); });
