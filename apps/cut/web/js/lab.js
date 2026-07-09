"use strict";
/* CUT LAB — mechanic-variety ideation sandbox (lab.html). A THROWAWAY clone of
   game.js carrying six candidate mechanics, one demo level each: Balloon,
   Moving anchor, Gust fan, Moving basket, Conveyor, Rope web. Feel-test page
   for choosing what enters the campaign — NOT shipped; winners get
   re-implemented cleanly in game.js. Cloned-from header kept for provenance: */
/* CUT — Night Rig. Ported from the design handoff reference build
   (design/"CUT - Night Rig (reference build).html"), which is the source of
   truth for look, feel, physics constants, and audio. The simulation + render
   are a faithful transcription; the INTENTIONAL deltas vs the reference:
     · progress persistence (cleared[] → localStorage['cutlab.progress'], frontier boot)
     · @jfun/analytics Track.ev funnel events (level_start/complete/campaign)
     · dev-unlock for the dot rail on debug builds / localhost+LAN http
     · window.__game debug hooks (state/stepN/cutAt/ropes/setLevel/dims)
     · buildLevel also resets stallSteps=0 (defensive; behaviorally neutral)
     · visibilitychange SUSPENDS audio when hidden (spec's pause-on-background rec;
       reference only resumed)
     · vibe() routes through Capacitor Haptics on native (navigator.vibrate is a
       no-op on iOS); win/fail use notification haptics, cut/toggle light impact
     · stall watchdog speed threshold 0.05*H (reference 0.02*H sat below the
       contact-jitter noise floor — rim-perch dead-ended on device; see doChecks)
     · music bed REPLACED — "Night Kalimba": a fixed friendly C-major tune,
       steady plucked quarters, no drones/randomness (the reference's saw drone
       AND a lullaby-pad rework both read as scary; see startMusic)
     · PAD TRAMPOLINE: a real pad impact reflects the whole box's velocity at
       e=1.25 (the cue's advertised 1.6x height ratio), tangential mostly
       absorbed (the reference's per-corner bounce is averaged away by the rigid
       links — crate landed dead, L5 unsolvable; see collideBox)
     · SEVERED-TAIL RELAXATION: cut rope segments with no anchor go 4x lighter
       (a tail is 75% of the crate's mass in the reference — it yanked the crate
       mid-flight and fed perch-rocking; see relaxFreeRopes)
     · L8 FROZEN ASSEMBLY + WINCH: the authored counterweight tableau is not a
       physical equilibrium (diagonal-rope crate pendulums; free 4x decoy =
       perpetual bungee, in the reference too) — crate+decoy are pinned until
       the level's first cut; the released decoy falls at winch speed (per-
       particle damp 0.95: free-fall outruns the rope solver and the line
       solver-stretches instead of hauling). Restraint cut → spectacular haul
       over the pulley into the basket; line cut first → crate drops onto the
       spikes (see buildLevel case 7)
   Everything else: keep the numbers in sync with the handoff — feel is the moat. */

/* ============================== globals ============================== */
const cv=document.getElementById('cv'), ctx=cv.getContext('2d');
const DT=1/120;
let W=0,H=0,DPR=1,G=0,S=40,SP=8,FLOORY=0;
let level=0;
const LAST=6; // 7 lab demo levels, 0..6
const LAB_NAMES=['BALLOON','MOVING ANCHOR','GUST FAN','MOVING BASKET','CONVEYOR','ROPE WEB','PULSE SPIKES'];
const cleared=[false,false,false,false,false,false,false,false];
let balloons=[],fans=[],trolleys=[],movingBasket=null; // lab mechanic state
let phase='play', phaseTimer=0, slowSteps=0, stepCount=0, creakCd=0;
let particles=[],cons=[],boxes=[],segs=[],pulleys=[],beams=[],anchorsPts=[];
let crate=null,decoy=null,basket=null,crackLines=null;
let sparks=[],confetti=[],streak=[];
let fireflies=[],winFlash=0,bgCv=null,vgCv=null;
let everCut=true,ptrDown=false,lastPX=0,lastPY=0; // LAB: gesture hint off
let hintTimer=null, cutThisLevel=false, cue=null, CUES_ALWAYS=false, FORCE_CUE=null;
let seen={};
try{ seen=JSON.parse(localStorage.getItem('cutlab.seen')||'{}')||{}; }catch(_){ seen={}; }
function markSeen(k){ if(k&&!seen[k]){ seen[k]=true; try{ localStorage.setItem('cutlab.seen',JSON.stringify(seen)); }catch(_){} } }
function seenAlready(k){ return CUES_ALWAYS?false:!!seen[k]; }
// First-encounter cue: the first time a NEW mechanic appears, flag it so the
// renderer plays a one-time wordless attention animation (+ adaptive text).
function detectCue(){
  cue=null;
  if(true) return; // LAB: cue demos off — the mechanics themselves are on trial
  let k=null;
  if(FORCE_CUE){
    if(FORCE_CUE==='pad'&&segs.some(s=>s.kind==='pad')) k='pad';
    else if(FORCE_CUE==='spike'&&segs.some(s=>s.kind==='spike')) k='spike';
    else if(FORCE_CUE==='pulley'&&pulleys.length) k='pulley';
    if(k){ cue={kind:k}; return; }
  }
  if(segs.some(s=>s.kind==='spike') && !seenAlready('spike')) k='spike';
  else if(segs.some(s=>s.kind==='pad') && !seenAlready('pad')) k='pad';
  else if(pulleys.length && !seenAlready('pulley')) k='pulley';
  if(k) cue={kind:k};
}
let paused=false;
let settings={sfx:true,music:true,vibration:true};
try{ const _s=JSON.parse(localStorage.getItem('cutlab.settings')||'null'); if(_s&&typeof _s==='object') settings=Object.assign(settings,_s); }catch(_){}
function saveSettings(){ try{ localStorage.setItem('cutlab.settings',JSON.stringify(settings)); }catch(_){} }

// dev-unlock: on a #if-DEBUG native build (window.__DEV_BUILD, stripped in
// Release) or a plain-http dev origin (localhost + private-LAN feel-testing),
// every dot is tappable. Ships locked; a public https deploy stays locked too.
const DEV_UNLOCK = !!(typeof window!=='undefined' && (window.__DEV_BUILD ||
  (location&&location.protocol==='http:'&&/^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname))));

// analytics — set the measurement id at release (empty → web stays inert; native
// routes to Firebase once @capacitor-firebase/analytics + GoogleService-Info are wired).
const CUT_GA_ID = "";

/* ============================== progress persistence ============================== */
const PROGRESS_KEY='cutlab.progress';
function loadProgress(){
  try{
    const p=JSON.parse(localStorage.getItem(PROGRESS_KEY)||'null');
    if(p&&Array.isArray(p.cleared)) for(let i=0;i<8;i++) cleared[i]=!!p.cleared[i];
  }catch(_){}
}
function saveProgress(){
  try{ localStorage.setItem(PROGRESS_KEY,JSON.stringify({cleared:cleared.slice()})); }catch(_){}
}
function frontierLevel(){ for(let i=0;i<=LAST;i++) if(!cleared[i]) return i; return LAST; }
function trackLevelStart(){ try{ if(window.Track) Track.ev('level_start',{level:level+1}); }catch(_){} }

/* ============================== audio ============================== */
let actx=null,master=null,whooshGain=null,whooshFilt=null,noiseBuf=null,musicGain=null;
let musicTimer=null,musicOn=false,musicNext=0,musicIdx=0;
function ensureAudio(){
  if(actx) return;
  try{
    actx=new (window.AudioContext||window.webkitAudioContext)();
    master=actx.createGain(); master.gain.value=settings.sfx?0.55:0.0; master.connect(actx.destination);
    musicGain=actx.createGain(); musicGain.gain.value=0.0; musicGain.connect(actx.destination);
    const len=Math.floor(actx.sampleRate*1.2);
    noiseBuf=actx.createBuffer(1,len,actx.sampleRate);
    const d=noiseBuf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    const src=actx.createBufferSource(); src.buffer=noiseBuf; src.loop=true;
    whooshFilt=actx.createBiquadFilter(); whooshFilt.type='bandpass';
    whooshFilt.frequency.value=500; whooshFilt.Q.value=0.8;
    whooshGain=actx.createGain(); whooshGain.gain.value=0;
    src.connect(whooshFilt); whooshFilt.connect(whooshGain); whooshGain.connect(master);
    src.start();
  }catch(e){ actx=null; try{ console.warn('audio init failed',e); }catch(_){} }
  // OUTSIDE the init try/catch: a music-layer failure must never null actx and
  // take the SFX down with it.
  if(actx){ try{ applyAudioSettings(); }catch(e){ try{ console.warn('music start failed',e); }catch(_){} } }
}
/* Background→foreground audio recovery (docs/handbook/08-ios-webaudio.md).
   iOS/WKWebView can return the context in THREE bad shapes:
     · 'suspended'   — resume() works
     · 'interrupted' — Safari-only state; resume() works once the session is back
     · ZOMBIE        — state SAYS 'running' but output is dead and currentTime is
                       FROZEN; resume() is a no-op. Only teardown+rebuild fixes it.
   So: retry resume with backoff, then VERIFY liveness (currentTime advancing);
   dead → rebuild the whole engine. A rebuild outside a user gesture may be
   denied, so audioDead is also left as a flag and the next tap rebuilds
   synchronously in-gesture. DEV builds keep a diagnostic trail in localStorage
   ('cutlab.audiolog') pullable via devicectl appDataContainer. */
let audioDead=false;
function audioLog(ev){
  if(!DEV_UNLOCK) return;
  try{
    const l=JSON.parse(localStorage.getItem('cutlab.audiolog')||'[]');
    l.push([Date.now(), ev, actx?actx.state:'null', actx?Math.round(actx.currentTime*1000):-1, document.visibilityState]);
    localStorage.setItem('cutlab.audiolog', JSON.stringify(l.slice(-120)));
  }catch(_){}
}
function audioAlive(cb){ // the state can LIE — trust only an advancing clock
  if(!actx||actx.state!=='running'){ cb(false); return; }
  const t0=actx.currentTime;
  setTimeout(()=>cb(!!actx&&actx.currentTime>t0),150);
}
function rebuildAudio(){
  audioLog('rebuild');
  try{ stopMusic(); }catch(_){}
  try{ if(actx) actx.close(); }catch(_){}
  actx=null; master=null; whooshGain=null; whooshFilt=null; noiseBuf=null; musicGain=null;
  ensureAudio(); // recreates the graph; applyAudioSettings restarts the music
  audioLog('rebuilt');
}
function resumeAudio(){
  if(!actx) return;
  let tries=0;
  const kick=()=>{
    if(!actx||document.visibilityState!=='visible') return;
    if(actx.state!=='running'){
      audioLog('resume-try');
      try{ actx.resume(); }catch(_){}
    }
    if(++tries<6){ setTimeout(kick,250*tries); return; }
    // out of retries — verify the survivor isn't a zombie
    audioAlive(ok=>{
      audioLog(ok?'alive':'zombie');
      if(ok){ audioDead=false; return; }
      rebuildAudio();
      audioAlive(ok2=>{ audioDead=!ok2; audioLog(ok2?'rebuild-alive':'rebuild-dead'); });
    });
  };
  kick();
}
document.addEventListener('visibilitychange',()=>{
  audioLog('vis');
  if(!actx) return;
  if(document.visibilityState==='visible') resumeAudio();
  else{
    updateWhoosh(0);
    // manual suspend only on the WEB (hidden tabs keep running otherwise);
    // on native, iOS suspends the webview itself — our extra suspend just adds
    // one more broken state to recover from
    const C=window.Capacitor;
    if(!(C&&C.isNativePlatform&&C.isNativePlatform())){ try{ actx.suspend(); }catch(_){} }
  }
});
// navigator.vibrate is a no-op on iOS — on native, route through the Capacitor
// Haptics plugin (cut/toggle → light impact; win/fail → notification haptic).
function vibe(p,kind){
  if(!settings.vibration) return;
  try{
    const C=window.Capacitor;
    const Hap=C&&C.isNativePlatform&&C.isNativePlatform()&&C.Plugins&&C.Plugins.Haptics;
    if(Hap){
      if(kind==='win') Hap.notification({type:'SUCCESS'});
      else if(kind==='fail') Hap.notification({type:'ERROR'});
      else Hap.impact({style:'LIGHT'});
      return;
    }
    if(navigator.vibrate) navigator.vibrate(p);
  }catch(_){}
}
function applyAudioSettings(){
  if(!actx) return;
  master.gain.setTargetAtTime(settings.sfx?0.55:0.0, actx.currentTime, 0.02);
  musicGain.gain.setTargetAtTime(settings.music?0.16:0.0, actx.currentTime, 0.05);
  if(settings.music) startMusic(); else stopMusic();
}
/* Music bed — "Night Kalimba" (INTENTIONAL delta from the handoff; product call
   by Qi 2026-07-06: the reference's saw drone read as scary, and a lullaby
   pad + sparse random plucks STILL did — "can't we be simple"). So: SIMPLE.
   No drones, no randomness — a fixed, friendly 8-bar kalimba tune in C major
   (C→G→Am→F), steady quarter notes at 76 BPM, soft plucked sines only, fully
   predictable like a toy music box. Web-Audio-clock lookahead scheduler keeps
   the rhythm tight. Same music bus, gain (0.16), and start/stop API. */
const MUSIC_Q=60/76; // quarter note at 76 BPM (s)
const MUSIC_TUNE=[ // [melody Hz, bass Hz|0] per quarter — 8 bars of C-G-Am-F
  [523.25,130.81],[659.26,0],[783.99,0],[659.26,0],   // C:  C5 E5 G5 E5
  [493.88,196.00],[587.33,0],[783.99,0],[587.33,0],   // G:  B4 D5 G5 D5
  [440.00,220.00],[523.25,0],[659.26,0],[523.25,0],   // Am: A4 C5 E5 C5
  [440.00,174.61],[523.25,0],[698.46,0],[523.25,0],   // F:  A4 C5 F5 C5
  [783.99,130.81],[659.26,0],[523.25,0],[659.26,0],   // C:  G5 E5 C5 E5
  [783.99,196.00],[587.33,0],[493.88,0],[587.33,0],   // G:  G5 D5 B4 D5
  [659.26,220.00],[523.25,0],[440.00,0],[523.25,0],   // Am: E5 C5 A4 C5
  [698.46,174.61],[659.26,0],[587.33,0],[523.25,0],   // F:  F5 E5 D5 C5 (turnaround)
];
function playKalimba(f,t0,vol,dec){
  const o=actx.createOscillator(); o.type='sine'; o.frequency.value=f;
  const g=actx.createGain();
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.linearRampToValueAtTime(vol,t0+0.008);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+dec);
  o.connect(g); g.connect(musicGain);
  const h=actx.createOscillator(); h.type='sine'; h.frequency.value=f*3; // soft mallet tick
  const hg=actx.createGain();
  hg.gain.setValueAtTime(0.0001,t0);
  hg.gain.linearRampToValueAtTime(vol*0.18,t0+0.006);
  hg.gain.exponentialRampToValueAtTime(0.0001,t0+0.12);
  h.connect(hg); hg.connect(musicGain);
  o.start(t0); o.stop(t0+dec+0.05); h.start(t0); h.stop(t0+0.15);
}
function startMusic(){
  if(!actx||musicOn) return;
  musicOn=true;
  musicIdx=0; musicNext=actx.currentTime+0.15;
  const tick=()=>{
    if(!musicOn) return;
    if(actx.state==='running'){
      while(musicNext<actx.currentTime+0.40){ // lookahead-schedule on the audio clock
        const nt=MUSIC_TUNE[musicIdx%MUSIC_TUNE.length];
        try{
          playKalimba(nt[0],musicNext,0.20,1.1);
          if(nt[1]) playKalimba(nt[1],musicNext,0.14,1.6);
        }catch(e){}
        musicIdx++; musicNext+=MUSIC_Q;
      }
    }else musicNext=Math.max(musicNext,actx.currentTime+0.15); // clean pickup after suspend
    musicTimer=setTimeout(tick,120);
  };
  tick();
}
function stopMusic(){
  if(!musicOn) return;
  musicOn=false;
  if(musicTimer){ clearTimeout(musicTimer); musicTimer=null; }
  // in-flight plucks decay in <=1.6s and the music-off gain ramp mutes them anyway
}
function playSnip(tension){
  if(!actx) return;
  const t0=actx.currentTime;
  const src=actx.createBufferSource(); src.buffer=noiseBuf;
  const hp=actx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1900;
  const g=actx.createGain();
  g.gain.setValueAtTime(0.5,t0); g.gain.exponentialRampToValueAtTime(0.001,t0+0.07);
  src.connect(hp); hp.connect(g); g.connect(master); src.start(t0); src.stop(t0+0.08);
  const f=170+Math.min(650,Math.max(0,(tension-1)*2600));
  const o=actx.createOscillator(); o.type='triangle';
  o.frequency.setValueAtTime(f,t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(60,f*0.8),t0+0.26);
  const og=actx.createGain();
  og.gain.setValueAtTime(0.34,t0); og.gain.exponentialRampToValueAtTime(0.001,t0+0.3);
  o.connect(og); og.connect(master); o.start(t0); o.stop(t0+0.32);
}
function playCreak(i){
  if(!actx) return;
  const t0=actx.currentTime;
  const src=actx.createBufferSource(); src.buffer=noiseBuf;
  src.playbackRate.value=0.25+Math.random()*0.2;
  const bp=actx.createBiquadFilter(); bp.type='bandpass';
  bp.frequency.value=220+Math.random()*180; bp.Q.value=9;
  const g=actx.createGain();
  const v=0.02+0.06*Math.min(1,i);
  g.gain.setValueAtTime(v,t0); g.gain.exponentialRampToValueAtTime(0.001,t0+0.11);
  src.connect(bp); bp.connect(g); g.connect(master); src.start(t0); src.stop(t0+0.12);
}
function playThump(){
  if(!actx) return;
  const t0=actx.currentTime;
  const o=actx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(115,t0); o.frequency.exponentialRampToValueAtTime(40,t0+0.22);
  const g=actx.createGain();
  g.gain.setValueAtTime(0.55,t0); g.gain.exponentialRampToValueAtTime(0.001,t0+0.26);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0+0.28);
  const src=actx.createBufferSource(); src.buffer=noiseBuf;
  const lp=actx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=220;
  const ng=actx.createGain();
  ng.gain.setValueAtTime(0.35,t0); ng.gain.exponentialRampToValueAtTime(0.001,t0+0.12);
  src.connect(lp); lp.connect(ng); ng.connect(master); src.start(t0); src.stop(t0+0.14);
}
function playWah(){
  if(!actx) return;
  const t0=actx.currentTime+0.12;
  const o=actx.createOscillator(); o.type='sawtooth';
  o.frequency.setValueAtTime(215,t0); o.frequency.linearRampToValueAtTime(148,t0+0.34);
  const lp=actx.createBiquadFilter(); lp.type='lowpass';
  lp.frequency.setValueAtTime(900,t0); lp.frequency.linearRampToValueAtTime(280,t0+0.34);
  const g=actx.createGain();
  g.gain.setValueAtTime(0.11,t0); g.gain.linearRampToValueAtTime(0.0001,t0+0.38);
  o.connect(lp); lp.connect(g); g.connect(master); o.start(t0); o.stop(t0+0.4);
}
function playPlopChime(){
  if(!actx) return;
  const t0=actx.currentTime;
  const p=actx.createOscillator(); p.type='sine';
  p.frequency.setValueAtTime(260,t0); p.frequency.exponentialRampToValueAtTime(115,t0+0.12);
  const pg=actx.createGain();
  pg.gain.setValueAtTime(0.35,t0); pg.gain.exponentialRampToValueAtTime(0.001,t0+0.16);
  p.connect(pg); pg.connect(master); p.start(t0); p.stop(t0+0.18);
  const notes=[[659.25,0.12],[987.77,0.26]];
  for(const [f,dt] of notes){
    const o=actx.createOscillator(); o.type='triangle'; o.frequency.value=f;
    const g=actx.createGain();
    g.gain.setValueAtTime(0.0001,t0+dt);
    g.gain.linearRampToValueAtTime(0.22,t0+dt+0.02);
    g.gain.exponentialRampToValueAtTime(0.001,t0+dt+0.5);
    o.connect(g); g.connect(master); o.start(t0+dt); o.stop(t0+dt+0.55);
  }
}
function updateWhoosh(speed){
  if(!actx||!whooshGain) return;
  const t=Math.max(0,Math.min(0.2,(speed-0.35*H)/H*0.45));
  whooshGain.gain.setTargetAtTime(t,actx.currentTime,0.06);
  whooshFilt.frequency.setTargetAtTime(300+speed*0.6,actx.currentTime,0.08);
}

/* ============================== math / collision ============================== */
function segInt(ax,ay,bx,by,cx,cy,dx,dy){
  const rX=bx-ax,rY=by-ay,sX=dx-cx,sY=dy-cy;
  const den=rX*sY-rY*sX;
  if(Math.abs(den)<1e-9) return null;
  const t=((cx-ax)*sY-(cy-ay)*sX)/den;
  const u=((cx-ax)*rY-(cy-ay)*rX)/den;
  return (t>=0&&t<=1&&u>=0&&u<=1)?{t,u}:null;
}
function closestOnSeg(px,py,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1;
  const l2=dx*dx+dy*dy;
  let t=l2>0?((px-x1)*dx+(py-y1)*dy)/l2:0;
  t=Math.max(0,Math.min(1,t));
  return {x:x1+t*dx,y:y1+t*dy};
}
function bounce(p,nx,ny,e,fr){
  const vx=p.x-p.px, vy=p.y-p.py;
  const vn=vx*nx+vy*ny;
  if(vn>=0) return;
  const vtx=vx-vn*nx, vty=vy-vn*ny;
  const nvx=vtx*fr-vn*e*nx, nvy=vty*fr-vn*e*ny;
  p.px=p.x-nvx; p.py=p.y-nvy;
}
function hitSeg(p,r,sg){ // detection only (for fail surfaces)
  if(segInt(p.px,p.py,p.x,p.y,sg.x1,sg.y1,sg.x2,sg.y2)) return true;
  const q=closestOnSeg(p.x,p.y,sg.x1,sg.y1,sg.x2,sg.y2);
  const dx=p.x-q.x, dy=p.y-q.y;
  return dx*dx+dy*dy<r*r;
}
function resolveSeg(p,r,sg,e,fr){
  let dx=sg.x2-sg.x1, dy=sg.y2-sg.y1;
  const L=Math.hypot(dx,dy)||1;
  let nx=dy/L, ny=-dx/L;
  const sd=(p.px-sg.x1)*nx+(p.py-sg.y1)*ny;
  if(sd<0){ nx=-nx; ny=-ny; }
  const hit=segInt(p.px,p.py,p.x,p.y,sg.x1,sg.y1,sg.x2,sg.y2);
  if(hit){
    const ix=p.px+(p.x-p.px)*hit.t, iy=p.py+(p.y-p.py)*hit.t;
    p.x=ix+nx*r; p.y=iy+ny*r;
    bounce(p,nx,ny,e,fr);
    return true;
  }
  const q=closestOnSeg(p.x,p.y,sg.x1,sg.y1,sg.x2,sg.y2);
  const ddx=p.x-q.x, ddy=p.y-q.y;
  const d2=ddx*ddx+ddy*ddy;
  if(d2<r*r){
    const d=Math.sqrt(d2)||1e-6;
    let mx=ddx/d, my=ddy/d;
    if(mx*nx+my*ny<0){ mx=nx; my=ny; }
    p.x=q.x+mx*r; p.y=q.y+my*r;
    bounce(p,mx,my,e,fr);
    return true;
  }
  return false;
}
function collideCircle(p,r,cx,cy,R){
  const dx=p.x-cx, dy=p.y-cy;
  const rr=R+r;
  const d2=dx*dx+dy*dy;
  if(d2>=rr*rr) return;
  const d=Math.sqrt(d2)||1e-6;
  const nx=dx/d, ny=dy/d;
  p.x=cx+nx*rr; p.y=cy+ny*rr;
  bounce(p,nx,ny,0,0.995);
}

/* ============================== fx ============================== */
function spawnSparks(x,y,n){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, sp2=(0.25+Math.random()*0.9)*H;
    sparks.push({x,y,vx:Math.cos(a)*sp2,vy:Math.sin(a)*sp2-0.2*H,
      life:20+Math.random()*22,max:42,
      col:Math.random()<0.5?'#ffd98a':'#ffedc9'});
  }
}
function spawnConfetti(x,y){
  const cols=['#ffb347','#7fd4ff','#ff7fa8','#a8ff8a','#ffe97f','#c69cff'];
  for(let i=0;i<30;i++){
    const a=-Math.PI/2+(Math.random()-0.5)*1.9, sp2=(0.35+Math.random()*0.75)*H;
    confetti.push({x:x+(Math.random()-0.5)*S,y,
      vx:Math.cos(a)*sp2,vy:Math.sin(a)*sp2,
      rot:Math.random()*6.3,vr:(Math.random()-0.5)*14,
      life:110+Math.random()*60,max:170,
      col:cols[i%cols.length],sz:2.5+Math.random()*3.5});
  }
}
function genCracks(){
  const out=[];
  const cx0=0.35+Math.random()*0.3, cy0=0.35+Math.random()*0.3;
  const n=6+((Math.random()*3)|0);
  for(let k=0;k<n;k++){
    const a=k/n*Math.PI*2+Math.random()*0.5;
    const l1=0.14+Math.random()*0.16, l2=l1+0.12+Math.random()*0.2;
    const a2=a+(Math.random()-0.5)*0.7;
    const mx=cx0+Math.cos(a)*l1, my=cy0+Math.sin(a)*l1;
    out.push({x1:cx0,y1:cy0,x2:mx,y2:my});
    out.push({x1:mx,y1:my,x2:cx0+Math.cos(a2)*l2,y2:cy0+Math.sin(a2)*l2});
  }
  return out;
}
function stepFX(){
  for(let i=sparks.length-1;i>=0;i--){
    const p=sparks[i];
    p.x+=p.vx*DT; p.y+=p.vy*DT; p.vy+=G*DT; p.vx*=0.985; p.life--;
    if(p.life<=0) sparks.splice(i,1);
  }
  for(let i=confetti.length-1;i>=0;i--){
    const p=confetti[i];
    p.x+=p.vx*DT; p.y+=p.vy*DT; p.vy+=G*DT*0.55; p.vx*=0.99; p.rot+=p.vr*DT; p.life--;
    if(p.life<=0||p.y>FLOORY+20) confetti.splice(i,1);
  }
  if(basket&&basket.squash>0) basket.squash=Math.max(0,basket.squash-0.035);
  if(winFlash>0) winFlash=Math.max(0,winFlash-0.014);
  for(const f of fireflies){
    f.t+=DT;
    f.x+=Math.sin(f.t*0.5+f.p)*14*DT;
    f.y+=Math.cos(f.t*0.37+f.p*2.1)*11*DT;
  }
}
/* ============================== world building ============================== */
function pt(x,y,im){
  particles.push({x,y,px:x,py:y,im:(im===undefined?1:im),cutT:-999,rope:false,freeTail:false});
  return particles.length-1;
}
function link(a,b,rest,type){
  cons.push({a,b,rest,type,cut:false});
}
function makeBox(cx,cy,side,im,kind){
  const h=side/2;
  const off=[[-h,-h],[h,-h],[h,h],[-h,h]]; // TL TR BR BL
  const idx=off.map(o=>pt(cx+o[0],cy+o[1],im));
  const dg=side*Math.SQRT2;
  link(idx[0],idx[1],side,'rigid'); link(idx[1],idx[2],side,'rigid');
  link(idx[2],idx[3],side,'rigid'); link(idx[3],idx[0],side,'rigid');
  link(idx[0],idx[2],dg,'rigid');  link(idx[1],idx[3],dg,'rigid');
  const b={idx,side,kind,seed:1+(cx*7+cy*13)%5,padCd:0};
  boxes.push(b);
  if(kind==='crate') crate=b; else decoy=b;
  return b;
}
function pushBox(b,vx,vy){
  for(const i of b.idx){ particles[i].px=particles[i].x-vx*DT; particles[i].py=particles[i].y-vy*DT; }
}
function harnessPt(b){ // bridle knot above box top edge
  const cx=(particles[b.idx[0]].x+particles[b.idx[1]].x)/2;
  const cy=(particles[b.idx[0]].y+particles[b.idx[1]].y)/2;
  return [cx,cy-b.side*0.35];
}
function attachEnd(id,opt){
  if(!opt) return;
  const p=particles[id];
  if(opt.pin){ p.im=0; anchorsPts.push({x:p.x,y:p.y}); return; }
  if(opt.mode==='harness'){
    for(const ci of [0,1]){
      const c=particles[opt.box.idx[ci]];
      link(id,opt.box.idx[ci],Math.hypot(c.x-p.x,c.y-p.y),'rope');
    }
  }else{
    const c=particles[opt.box.idx[opt.ci]];
    link(id,opt.box.idx[opt.ci],Math.max(SP*0.5,Math.hypot(c.x-p.x,c.y-p.y)),'rope');
  }
}
function makeRope(path,startOpt,endOpt){
  let total=0;
  for(let k=1;k<path.length;k++) total+=Math.hypot(path[k][0]-path[k-1][0],path[k][1]-path[k-1][1]);
  const n=Math.max(2,Math.round(total/SP));
  const st=total/n;
  const cornerEnd=endOpt&&endOpt.mode==='corner';
  const last=cornerEnd?n-1:n; // corner attach: box corner IS the final node
  const ids=[];
  for(let k=0;k<=last;k++){
    const d=k*st;
    // walk polyline
    let rem=d, x=path[0][0], y=path[0][1];
    for(let j=1;j<path.length;j++){
      const sl=Math.hypot(path[j][0]-path[j-1][0],path[j][1]-path[j-1][1]);
      if(rem<=sl||j===path.length-1){
        const t=sl>0?Math.min(1,rem/sl):0;
        x=path[j-1][0]+(path[j][0]-path[j-1][0])*t;
        y=path[j-1][1]+(path[j][1]-path[j-1][1])*t;
        break;
      }
      rem-=sl;
    }
    const id=pt(x,y,1);
    particles[id].rope=true;
    ids.push(id);
  }
  for(let k=0;k<ids.length-1;k++) link(ids[k],ids[k+1],st,'rope');
  attachEnd(ids[0],startOpt);
  if(cornerEnd) link(ids[ids.length-1],endOpt.box.idx[endOpt.ci],st,'rope');
  else attachEnd(ids[ids.length-1],endOpt);
  return ids;
}
function setBasket(x,yb){
  basket={x,yb,iw:1.9*S,wh:1.25*S,squash:0};
  const l=x-basket.iw/2, r=x+basket.iw/2, t=yb-basket.wh;
  segs.push({x1:l,y1:t,x2:l,y2:yb,kind:'basket'});
  segs.push({x1:l,y1:yb,x2:r,y2:yb,kind:'basket'});
  segs.push({x1:r,y1:yb,x2:r,y2:t,kind:'basket'});
}
function cornerPos(cx,cy,side,ci){
  const h=side/2;
  const off=[[-h,-h],[h,-h],[h,h],[-h,h]];
  return [cx+off[ci][0],cy+off[ci][1]];
}
// LAB: buoyant balloon bridled to the box's top corners. Cut the anchor rope and
// the pair floats; swipe the balloon (or its strings) to pop and drop the crate.
function makeBalloon(bx,by,box){
  // im low (heavy) so constraint projections move the CORNERS, not the balloon —
  // PBD dilutes lift through bridle→corners→rigid-links; a light balloon absorbs
  // its own corrections and the pair sinks despite net analytic buoyancy
  const id=pt(bx,by,0.08);
  const p=particles[id];
  p.grav=-7; p.wind=0.8; p.balloon=true; p.r=0.045*W;
  for(const ci of [0,1]){
    const c=particles[box.idx[ci]];
    link(id,box.idx[ci],Math.hypot(c.x-bx,c.y-by),'rope');
  }
  balloons.push({i:id,dead:false});
}
function spikeActive(sg){
  if(!sg.pulse) return true;
  return ((stepCount+sg.pulse.ph)%sg.pulse.period)/sg.pulse.period<sg.pulse.duty;
}

function buildLevel(i){
  particles=[]; cons=[]; boxes=[]; segs=[]; pulleys=[]; beams=[]; anchorsPts=[];
  crate=null; decoy=null; basket=null; crackLines=null;
  balloons=[]; fans=[]; trolleys=[]; movingBasket=null; // lab mechanics
  cutThisLevel=false;
  sparks=[]; confetti=[]; streak=[];
  phase='play'; phaseTimer=0; slowSteps=0; creakCd=0; stallSteps=0;
  S=W/7; SP=W/40; G=H*2.0; FLOORY=H*0.985;
  const s=S;
  switch(i){
    case 0:{ // BALLOON — tethered from BELOW; cut the tether, the pair floats
             // up-right; pop the balloon over the basket to drop the crate
      const b=makeBox(0.30*W,0.52*H,s,0.25,'crate');
      makeBalloon(0.30*W,0.52*H-s*0.5-0.09*H,b);
      // low pedestal the tether is bolted to (drawn as a beam block)
      beams.push({x:0.24*W,y:0.80*H,w:0.12*W,h:0.024*H});
      makeRope([[0.30*W,0.80*H],cornerPos(0.30*W,0.52*H,s,3)],{pin:true},{box:b,mode:'corner',ci:3});
      segs.push({x1:0.05*W,y1:FLOORY,x2:0.55*W,y2:FLOORY,kind:'spike'});
      setBasket(0.72*W,0.90*H);
    }break;
    case 1:{ // MOVING ANCHOR — trolley patrols the beam; time the cut
      beams.push({x:0.15*W,y:0.028*H,w:0.60*W,h:0.024*H});
      const b=makeBox(0.22*W,0.35*H,s,0.25,'crate');
      const ids=makeRope([[0.22*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      trolleys.push({i:ids[0],x0:0.22*W,x1:0.68*W,y:0.052*H,w:(2*Math.PI)/480,ph:-Math.PI/2,t0:stepCount});
      anchorsPts.length=0; // trolley car replaces the static bolt
      segs.push({x1:0.05*W,y1:FLOORY,x2:0.62*W,y2:FLOORY,kind:'spike'});
      setBasket(0.82*W,0.90*H);
    }break;
    case 2:{ // GUST FAN — a sideways breeze bends the fall; plan the trajectory
      beams.push({x:0.40*W,y:0.028*H,w:0.20*W,h:0.024*H});
      const b=makeBox(0.5*W,0.28*H,s,0.25,'crate');
      makeRope([[0.5*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      // short strong gust high up: the crate exits with sideways speed early and
      // converts to a steep arc, entering the basket MOUTH from above (a shallow
      // sideways approach clips the near rim post and ricochets)
      fans.push({x:0.30*W,y:0.35*H,w:0.50*W,h:0.13*H,ax:1.1,ay:0});
      segs.push({x1:0.30*W,y1:FLOORY,x2:0.62*W,y2:FLOORY,kind:'spike'});
      setBasket(0.80*W,0.90*H);
    }break;
    case 3:{ // MOVING BASKET — the goal patrols; lead the target
      beams.push({x:0.40*W,y:0.028*H,w:0.20*W,h:0.024*H});
      const b=makeBox(0.5*W,0.30*H,s,0.25,'crate');
      makeRope([[0.5*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      segs.push({x1:0.08*W,y1:FLOORY,x2:0.92*W,y2:FLOORY,kind:'spike'});
      setBasket(0.5*W,0.90*H);
      movingBasket={x0:0.5*W,amp:0.28*W,w:(2*Math.PI)/540,t0:stepCount};
    }break;
    case 4:{ // CONVEYOR — the belt carries the crate to the drop point
      beams.push({x:0.15*W,y:0.028*H,w:0.20*W,h:0.024*H});
      const b=makeBox(0.25*W,0.30*H,s,0.25,'crate');
      makeRope([[0.25*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      segs.push({x1:0.12*W,y1:0.58*H,x2:0.60*W,y2:0.58*H,kind:'belt',beltV:0.35*W});
      segs.push({x1:0.05*W,y1:FLOORY,x2:0.72*W,y2:FLOORY,kind:'spike'});
      setBasket(0.80*W,0.90*H);
    }break;
    case 5:{ // ROPE WEB — X-lacing; cut the crossers first or it swings wide
      beams.push({x:0.10*W,y:0.028*H,w:0.16*W,h:0.024*H});
      beams.push({x:0.74*W,y:0.028*H,w:0.16*W,h:0.024*H});
      const cx=0.5*W,cy=0.35*H;
      const b=makeBox(cx,cy,s,0.25,'crate');
      makeRope([[0.18*W,0.052*H],cornerPos(cx,cy,s,0)],{pin:true},{box:b,mode:'corner',ci:0});
      makeRope([[0.82*W,0.052*H],cornerPos(cx,cy,s,1)],{pin:true},{box:b,mode:'corner',ci:1});
      makeRope([[0.18*W,0.052*H],cornerPos(cx,cy,s,1)],{pin:true},{box:b,mode:'corner',ci:1});
      makeRope([[0.82*W,0.052*H],cornerPos(cx,cy,s,0)],{pin:true},{box:b,mode:'corner',ci:0});
      segs.push({x1:0.15*W,y1:FLOORY,x2:0.38*W,y2:FLOORY,kind:'spike'});
      segs.push({x1:0.62*W,y1:FLOORY,x2:0.85*W,y2:FLOORY,kind:'spike'});
      setBasket(0.5*W,0.90*H);
    }break;
    case 6:{ // PULSE SPIKES — the drop corridor blinks; time the release
      beams.push({x:0.40*W,y:0.028*H,w:0.20*W,h:0.024*H});
      const b=makeBox(0.5*W,0.26*H,s,0.25,'crate');
      makeRope([[0.5*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      // inward-pointing pulsing spike strips flanking the drop corridor
      // collision uses the spike BASE line + radius (~10px), not the drawn tips —
      // strips must sit at 0.42/0.58W for on-phase spikes to actually clip the crate
      segs.push({x1:0.42*W,y1:0.52*H,x2:0.42*W,y2:0.68*H,kind:'spike',pulse:{period:264,duty:0.45,ph:0}});
      segs.push({x1:0.58*W,y1:0.68*H,x2:0.58*W,y2:0.52*H,kind:'spike',pulse:{period:264,duty:0.45,ph:0}});
      segs.push({x1:0.30*W,y1:0.52*H,x2:0.40*W,y2:0.52*H,kind:'solid'});
      segs.push({x1:0.60*W,y1:0.52*H,x2:0.70*W,y2:0.52*H,kind:'solid'});
      segs.push({x1:0.15*W,y1:FLOORY,x2:0.40*W,y2:FLOORY,kind:'spike'});
      segs.push({x1:0.60*W,y1:FLOORY,x2:0.85*W,y2:FLOORY,kind:'spike'});
      setBasket(0.5*W,0.90*H);
    }break;
  }
  updateHUD();
  detectCue();
  scheduleHint();
}

/* ============================== simulation ============================== */
function boxCenter(b){
  let x=0,y=0;
  for(const i of b.idx){ x+=particles[i].x; y+=particles[i].y; }
  return {x:x/4,y:y/4};
}
function boxVel(b){
  let vx=0,vy=0;
  for(const i of b.idx){
    vx+=(particles[i].x-particles[i].px);
    vy+=(particles[i].y-particles[i].py);
  }
  return {vx:vx/4/DT,vy:vy/4/DT};
}
function collideBox(b){
  const r=b.side*0.18;
  const isCrate=(b.kind==='crate');
  // box velocity BEFORE resolution (per-step units) — for the pad trampoline below
  let vbx=0,vby=0;
  for(const i of b.idx){ vbx+=particles[i].x-particles[i].px; vby+=particles[i].y-particles[i].py; }
  vbx/=4; vby/=4;
  let padSeg=null;
  for(const i of b.idx){
    const p=particles[i];
    for(const sg of segs){
      if(sg.pulse&&!spikeActive(sg)) continue; // LAB: pulsing spikes pass-through when off
      if(sg.kind==='floor'||sg.kind==='spike'){
        if(isCrate&&!settling){
          if(phase==='play'&&hitSeg(p,r,sg)){ failLevel(sg.kind); return; }
        }else{
          resolveSeg(p,r,sg,0.15,0.7);
        }
      }else if(sg.kind==='belt'){ // LAB: conveyor — carry TOWARD belt speed (idempotent
        // across the many per-step contact samples; naive add compounds ~8x)
        if(resolveSeg(p,r,sg,0.1,0.9)){
          const L2=Math.hypot(sg.x2-sg.x1,sg.y2-sg.y1)||1;
          const tx2=(sg.x2-sg.x1)/L2, ty2=(sg.y2-sg.y1)/L2;
          const vt=(p.x-p.px)*tx2+(p.y-p.py)*ty2, dv=sg.beltV*DT-vt;
          if(dv>0){ p.px-=tx2*dv; p.py-=ty2*dv; }
        }
      }else if(sg.kind==='pad'){
        if(resolveSeg(p,r,sg,1.05,1.0)){ padSeg=sg; if(isCrate&&!settling) padFlash=8; }
      }else if(sg.kind==='basket'){
        if(isCrate) resolveSeg(p,r,sg,0.22,0.8);
      }else{ // solid
        resolveSeg(p,r,sg,0.2,0.75);
      }
      if(phase==='fail') return;
    }
    for(const pl of pulleys) collideCircle(p,r,pl.x,pl.y,pl.r);
  }
  // dense edge sampling — a thin wall (basket rim) slips clean between two
  // corners otherwise; sample each edge every ~r px and lever corrections
  // back to the two corner particles
  const E=[[0,1],[1,2],[2,3],[3,0]];
  const NS=Math.max(2,Math.ceil(b.side/(r*0.9)));
  for(const e of E){
    const A=particles[b.idx[e[0]]], B=particles[b.idx[e[1]]];
    for(let si=1;si<NS;si++){
      const t=si/NS;
      const m={x:A.x+(B.x-A.x)*t,y:A.y+(B.y-A.y)*t,
               px:A.px+(B.px-A.px)*t,py:A.py+(B.py-A.py)*t};
      const ox=m.x,oy=m.y,opx=m.px,opy=m.py;
      for(const sg of segs){
        if(sg.pulse&&!spikeActive(sg)) continue; // LAB: pulsing spikes pass-through when off
        if(sg.kind==='floor'||sg.kind==='spike'){
          if(isCrate&&!settling){ if(phase==='play'&&hitSeg(m,r,sg)){ failLevel(sg.kind); return; } }
          else resolveSeg(m,r,sg,0.15,0.7);
        }else if(sg.kind==='belt'){
          if(resolveSeg(m,r,sg,0.1,0.9)){
            const L3=Math.hypot(sg.x2-sg.x1,sg.y2-sg.y1)||1;
            const tx3=(sg.x2-sg.x1)/L3, ty3=(sg.y2-sg.y1)/L3;
            const vt3=(m.x-m.px)*tx3+(m.y-m.py)*ty3, dv3=sg.beltV*DT-vt3;
            if(dv3>0){ m.px-=tx3*dv3; m.py-=ty3*dv3; }
          }
        }else if(sg.kind==='pad'){
          if(resolveSeg(m,r,sg,1.05,1.0)){ padSeg=sg; if(isCrate&&!settling) padFlash=8; }
        }else if(sg.kind==='basket'){
          if(isCrate) resolveSeg(m,r,sg,0.22,0.8);
        }else{
          resolveSeg(m,r,sg,0.2,0.75);
        }
        if(phase==='fail') return;
      }
      const dx=m.x-ox,dy=m.y-oy,dpx=m.px-opx,dpy=m.py-opy;
      if(dx||dy||dpx||dpy){
        const k=1/((1-t)*(1-t)+t*t);
        A.x+=dx*(1-t)*k;A.y+=dy*(1-t)*k;A.px+=dpx*(1-t)*k;A.py+=dpy*(1-t)*k;
        B.x+=dx*t*k;B.y+=dy*t*k;B.px+=dpx*t*k;B.py+=dpy*t*k;
      }
    }
  }
  // PAD TRAMPOLINE (intentional delta — see header). The reference's per-corner
  // e=1.05 bounce gets averaged away by the rigid links (one corner rebounds, the
  // other three still fall, the constraint solver splits the difference), so a
  // box lands DEAD on the pad and L5 is unsolvable. Design intent is unambiguous
  // (the handoff's pad cue: crate "launches UP higher than it fell"), so a real
  // impact reflects the WHOLE box's velocity about the pad normal at e=1.05.
  // Slow/grazing contact (vn below 0.10*H px/s) keeps the reference behavior so
  // a box can rest on or slide along a pad without jittering.
  if(padSeg&&b.padCd<=0){
    let nx=padSeg.y2-padSeg.y1, ny=-(padSeg.x2-padSeg.x1);
    const L=Math.hypot(nx,ny)||1; nx/=L; ny/=L;
    const c0=boxCenter(b);
    if((c0.x-padSeg.x1)*nx+(c0.y-padSeg.y1)*ny<0){ nx=-nx; ny=-ny; }
    const vn=vbx*nx+vby*ny;
    if(vn<-0.10*H*DT){
      // e matches the design's pad CUE, which animates the ghost crate rising to
      // 0.19H after a 0.12H fall — a 1.6x height ratio, i.e. e≈1.25 (the code's
      // 1.05 was per-corner restitution, not a trampoline spec; at 1.05 the L5
      // arc clips the basket rim post by ~4px and washes back). Tangential mostly
      // ABSORBED (fr=0.3) — a trampoline kills sideways slip, and fr=1.0 slings
      // the crate down-slope and off-field.
      const e=1.25, fr=0.3;
      const nvx=(vbx-vn*nx)*fr-vn*e*nx, nvy=(vby-vn*ny)*fr-vn*e*ny;
      for(const i of b.idx){ particles[i].px=particles[i].x-nvx; particles[i].py=particles[i].y-nvy; }
      // fling any FREE rope tail along with the box (same velocity, zero relative
      // motion) — otherwise the slack tail cascades taut mid-flight and yanks the
      // launch off its designed arc (measured: vx slammed 143→-2 by the tail).
      // Anchored chains are left alone: a still-pinned rope SHOULD arrest the box.
      const adj=new Map();
      for(const c2 of cons){
        if(c2.cut||c2.type!=='rope') continue;
        if(!adj.has(c2.a)) adj.set(c2.a,[]);
        if(!adj.has(c2.b)) adj.set(c2.b,[]);
        adj.get(c2.a).push(c2.b); adj.get(c2.b).push(c2.a);
      }
      const owner2=new Map();
      boxes.forEach((bx,bi)=>bx.idx.forEach(id=>owner2.set(id,bi)));
      const seen3=new Set(b.idx), stack=[...b.idx], comp=[];
      let pinned=false;
      const touched2=new Set();
      while(stack.length){
        const id=stack.pop();
        for(const nb of adj.get(id)||[]) if(!seen3.has(nb)){
          seen3.add(nb); stack.push(nb); comp.push(nb);
          if(particles[nb].im===0) pinned=true;
          if(owner2.has(nb)) touched2.add(owner2.get(nb));
        }
      }
      // fling only decorative tails (no anchor, no second box) — a structural
      // box-to-box rope must keep its own dynamics
      if(!pinned&&touched2.size===0) for(const id of comp){ const p2=particles[id]; if(p2.rope&&p2.im>0){ p2.px=p2.x-nvx; p2.py=p2.y-nvy; } }
      b.padCd=12;
    }
  }
  if(b.padCd>0) b.padCd--;
}
let padFlash=0;
let settling=false; // true during buildLevel's hidden pre-settle — no fails, no flash
function collideAll(){
  for(const b of boxes){
    collideBox(b);
    if(phase==='fail') return;
  }
  for(const p of particles){
    if(!p.rope) continue;
    if(p.y>FLOORY-2){
      p.y=FLOORY-2;
      bounce(p,0,-1,0.05,0.5);
    }
    for(const pl of pulleys) collideCircle(p,2.5,pl.x,pl.y,pl.r);
  }
}
function inBasket(p){
  const b=basket;
  return p.x>b.x-b.iw/2+3 && p.x<b.x+b.iw/2-3 &&
         p.y>b.yb-b.wh-S*0.35 && p.y<b.yb+5;
}
let stallSteps=0;
function doChecks(){
  if(!crate) return;
  const c=boxCenter(crate);
  if(c.x<-S||c.x>W+S||c.y>H+2*S){ failLevel('off'); return; }
  if(basket){
    let all=true, sp2=0;
    for(const i of crate.idx){
      const p=particles[i];
      if(!inBasket(p)) all=false;
      sp2+=Math.hypot(p.x-p.px,p.y-p.py)/DT;
    }
    sp2/=4;
    if(all&&sp2<0.25*H) slowSteps++; else slowSteps=0;
    if(slowSteps>=36) winLevel();
    // stall watchdog: crate settled somewhere that is neither basket nor floor
    // (e.g. perched on the basket rim) — soft-reset so the level can't dead-end.
    // Threshold is 0.05*H (reference used 0.02*H, which sits BELOW the sim's
    // contact-jitter noise floor: gravity alone re-injects G*DT^2 = 0.0167*H px/s
    // per step, and a tilted rim-perch with a severed-rope remnant attached rocks
    // at 17-30px/s forever — the watchdog never fired and the level dead-ended
    // on device). 0.05*H is still 5x below the win threshold; hanging/transit
    // states are excluded by the c.y>0.6*H guard (all rope hang points are higher).
    if(!all&&sp2<0.05*H&&c.y>0.6*H) stallSteps++; else stallSteps=0;
    if(stallSteps>=300) failLevel('stall');
  }
}
function winLevel(){
  if(phase!=='play') return;
  phase='win'; phaseTimer=0;
  const wasCleared=cleared[level];
  cleared[level]=true;
  basket.squash=1;
  winFlash=1;
  const c=boxCenter(crate);
  spawnConfetti(c.x,basket.yb-basket.wh);
  playPlopChime();
  vibe([0,15,45,22],'win');
  if(cue) markSeen(cue.kind);
  { const _h=document.getElementById('hint'); _h.classList.add('hide'); if(hintTimer){ clearTimeout(hintTimer); hintTimer=null; } }
  updateHUD();
  if(!wasCleared) saveProgress();
  // campaign_complete is a once-per-player milestone: only on the first clear
  // that completes the whole set (replays of the last level must not re-fire it,
  // and a dev-jumped cleared[7] with holes in 1-7 doesn't count).
  try{ if(window.Track){ Track.ev('level_complete',{level:level+1}); if(!wasCleared&&cleared.every(c2=>c2)) Track.ev('campaign_complete',{}); } }catch(_){}
}
function failLevel(kind){
  if(phase!=='play') return;
  phase='fail'; phaseTimer=0;
  crackLines=genCracks();
  if(kind==='floor'||kind==='spike') playThump();
  playWah();
  vibe([0,18,55,30],'fail');
  updateWhoosh(0);
}
function advanceLevel(){
  if(level<LAST) level++;
  buildLevel(level);
  trackLevelStart(); // post-win entry into a fresh level (incl. last-level replay)
}
// integrate + constraints + collisions — the physics core, damping as parameter
// so buildLevel can pre-settle a level invisibly (heavy damping) without the
// phase/FX/checks side effects of step().
function physCore(damp){
  const g=G*DT*DT;
  // LAB kinematics: patrolling anchors + moving basket. Phase MUST key off a
  // level-local clock (t0 captured at build) — the global stepCount would
  // teleport the part to a random phase on the level's first step and the
  // rope-coupled trolley slingshots the crate off-field.
  for(const tr of trolleys){
    const nx=tr.x0+(tr.x1-tr.x0)*(0.5+0.5*Math.sin((stepCount-tr.t0)*tr.w+tr.ph));
    const p=particles[tr.i];
    p.px=p.x; p.py=p.y; p.x=nx; p.y=tr.y;
  }
  if(basket&&movingBasket){
    const nx=movingBasket.x0+movingBasket.amp*Math.sin((stepCount-movingBasket.t0)*movingBasket.w);
    const dx=nx-basket.x;
    if(dx){ basket.x=nx; for(const sg of segs) if(sg.kind==='basket'){ sg.x1+=dx; sg.x2+=dx; } }
  }
  for(const p of particles){
    if(p.im===0) continue;
    const dmp=p.damp||damp; // per-particle override (L8 decoy winch — see buildLevel)
    const vx=(p.x-p.px)*dmp, vy=(p.y-p.py)*dmp;
    p.px=p.x; p.py=p.y;
    p.x+=vx; p.y+=vy+(p.grav!==undefined?p.grav:1)*g; // balloons: negative gravity
    if(p.wind&&p.y<0.35*H) p.x+=p.wind*g;              // breeze blows only up HIGH —
    // a ground-level breeze swings the tethered pair into the basket by itself
    for(const f of fans){                              // gust zones push everything
      if(p.x>f.x&&p.x<f.x+f.w&&p.y>f.y&&p.y<f.y+f.h){ p.x+=f.ax*g; p.y+=f.ay*g; }
    }
    if(p.balloon&&p.y<0.10*H){ p.y=0.10*H; if(p.py<p.y) p.py=p.y; } // soft ceiling
  }
  for(let it=0;it<10;it++){
    for(const c of cons){
      if(c.cut) continue;
      const a=particles[c.a], b=particles[c.b];
      const dx=b.x-a.x, dy=b.y-a.y;
      const d=Math.hypot(dx,dy);
      if(d<1e-9) continue;
      if(c.type==='rope'&&d<c.rest) continue; // ropes only pull
      // one-way free tails: a severed (unpinned) tail follows whatever it's tied
      // to but never moves it — the full correction lands on the tail side
      let aim=a.im, bim=b.im;
      if(a.freeTail&&!b.freeTail) bim=0;
      else if(b.freeTail&&!a.freeTail) aim=0;
      const im=aim+bim;
      if(im===0) continue;
      const k=(d-c.rest)/d/im;
      a.x+=dx*k*aim; a.y+=dy*k*aim;
      b.x-=dx*k*bim; b.y-=dy*k*bim;
    }
  }
  collideAll();
}
function step(){
  stepCount++;
  stepFX();
  if(padFlash>0) padFlash--;
  if(phase==='fail'){
    phaseTimer++;
    if(phaseTimer>=96) buildLevel(level);
    return;
  }
  physCore(0.9995);
  if(phase==='play'){
    doChecks();
  }
  if(phase==='win'){
    phaseTimer++;
    if(phaseTimer>=120) advanceLevel();
  }
  // creak under high tension
  if(creakCd>0) creakCd--;
  else{
    let maxT=0;
    for(const c of cons){
      if(c.cut||c.type!=='rope') continue;
      const a=particles[c.a], b=particles[c.b];
      const t=Math.hypot(b.x-a.x,b.y-a.y)/c.rest;
      if(t>maxT) maxT=t;
    }
    if(maxT>1.045){
      playCreak((maxT-1)*14);
      creakCd=28+(Math.random()*26|0);
    }
  }
}
/* ============================== cutting ============================== */
// Severed-tail relaxation (intentional delta — see header): rope nodes weigh
// mass 1 vs the crate's TOTAL 16, so a ~12-node severed tail is 75% of the
// crate's mass — it yanks the crate mid-flight (killed the pad bounce, fed the
// rim-perch rocking). After a cut, any rope component reachable from the cut
// that has NO pinned anchor goes slack-light (im 1→3, i.e. 4x lighter). Chains
// still holding an anchor — and the uncut pulley line doing counterweight duty —
// keep their designed mass, so pendulum/pulley feel is untouched.
function relaxFreeRopes(seedIds){
  const adj=new Map();
  for(const c of cons){
    if(c.cut||c.type!=='rope') continue;
    if(!adj.has(c.a)) adj.set(c.a,[]);
    if(!adj.has(c.b)) adj.set(c.b,[]);
    adj.get(c.a).push(c.b); adj.get(c.b).push(c.a);
  }
  const owner=new Map();
  boxes.forEach((bx,bi)=>bx.idx.forEach(id=>owner.set(id,bi)));
  const done=new Set();
  for(const seed of seedIds){
    if(done.has(seed)) continue;
    const comp=[], stack=[seed], seen2=new Set([seed]);
    let pinned=false;
    const touched=new Set();
    while(stack.length){
      const id=stack.pop();
      comp.push(id);
      if(particles[id].im===0) pinned=true;
      if(owner.has(id)) touched.add(owner.get(id));
      for(const nb of adj.get(id)||[]) if(!seen2.has(nb)){ seen2.add(nb); stack.push(nb); }
    }
    // a rope is a decorative TAIL only if it holds no anchor AND hangs off at
    // most ONE box — a box-to-box rope (the L8 counterweight line) is STRUCTURAL
    // and must keep its designed two-way physics.
    const isTail=!pinned&&touched.size<=1;
    for(const id of comp){
      done.add(id);
      // freeTail marks the node a pure FOLLOWER: the constraint solver applies
      // tail↔box corrections to the tail side only (see step()), so a severed
      // tail can never push or pull the crate — it's draped decoration.
      if(isTail&&particles[id].rope&&particles[id].im>0){ particles[id].im=3; particles[id].freeTail=true; }
    }
  }
}
function cutSegment(ax,ay,bx,by){
  if(phase!=='play') return 0;
  let n=0;
  const cutEnds=[];
  // LAB: swiping across a balloon pops it — its bridle links sever and the box drops
  for(const bl of balloons){
    if(bl.dead) continue;
    const p=particles[bl.i];
    const q=closestOnSeg(p.x,p.y,ax,ay,bx,by);
    if(Math.hypot(p.x-q.x,p.y-q.y)<p.r){
      bl.dead=true; n++;
      p.grav=1; p.balloon=false; p.wind=0;
      for(const c of cons){ if(!c.cut&&c.type==='rope'&&(c.a===bl.i||c.b===bl.i)){ c.cut=true; } }
      spawnSparks(p.x,p.y,16);
      playThump();
    }
  }
  for(const c of cons){
    if(c.cut||c.type!=='rope') continue;
    const A=particles[c.a], B=particles[c.b];
    const hit=segInt(ax,ay,bx,by,A.x,A.y,B.x,B.y);
    if(!hit) continue;
    c.cut=true; n++;
    cutEnds.push(c.a,c.b);
    A.cutT=B.cutT=stepCount;
    const ix=ax+(bx-ax)*hit.t, iy=ay+(by-ay)*hit.t;
    const d=Math.hypot(B.x-A.x,B.y-A.y)||1;
    const tension=d/c.rest;
    // whip: fling the two new free ends apart
    const imp=(0.12+Math.max(0,tension-1)*4)*H*DT;
    A.px+=(B.x-A.x)/d*imp*(A.im>0?1:0);
    A.py+=(B.y-A.y)/d*imp*(A.im>0?1:0);
    B.px-=(B.x-A.x)/d*imp*(B.im>0?1:0);
    B.py-=(B.y-A.y)/d*imp*(B.im>0?1:0);
    spawnSparks(ix,iy,10);
    playSnip(tension);
  }
  if(n>0){
    vibe(9); cutThisLevel=true;
    // unfreeze a frozen assembly (L8 counterweight — see buildLevel case 7) on
    // the level's first cut, BEFORE tail relaxation so masses are true
    for(const bx of boxes){ if(bx.lockedIm!==undefined){
      for(const ii of bx.idx){ particles[ii].im=bx.lockedIm; if(bx.haulDamp) particles[ii].damp=bx.haulDamp; }
      bx.lockedIm=undefined;
    } }
    relaxFreeRopes(cutEnds);
    if(hintTimer){ clearTimeout(hintTimer); hintTimer=null; }
    document.getElementById('hint').classList.add('hide');
  }
  if(n>0&&!everCut) everCut=true;
  return n;
}
/* ============================== rendering ============================== */
function drawBeams(){
  for(const b of beams){
    ctx.fillStyle='#1e2536';
    ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle='#3a4664';
    ctx.fillRect(b.x,b.y,b.w,Math.max(1.5,b.h*0.18));
    ctx.fillStyle='rgba(0,0,0,0.4)';
    ctx.fillRect(b.x,b.y+b.h-2,b.w,2);
  }
  for(const a of anchorsPts){
    ctx.beginPath(); ctx.arc(a.x,a.y,4.5,0,7); ctx.fillStyle='#46527a'; ctx.fill();
    ctx.beginPath(); ctx.arc(a.x,a.y,2,0,7); ctx.fillStyle='#0a0c12'; ctx.fill();
  }
}
function drawSegs(){
  for(const sg of segs){
    if(sg.kind==='floor'||sg.kind==='basket') continue;
    const dx=sg.x2-sg.x1, dy=sg.y2-sg.y1;
    const L=Math.hypot(dx,dy)||1;
    const nx=dy/L, ny=-dx/L; // up-ish for left-to-right floors
    if(sg.kind==='solid'){
      ctx.lineCap='round';
      ctx.strokeStyle='#242b3d'; ctx.lineWidth=8;
      ctx.beginPath(); ctx.moveTo(sg.x1,sg.y1); ctx.lineTo(sg.x2,sg.y2); ctx.stroke();
      ctx.strokeStyle='#39445f'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(sg.x1+nx*3,sg.y1+ny*3); ctx.lineTo(sg.x2+nx*3,sg.y2+ny*3); ctx.stroke();
    }else if(sg.kind==='pad'){
      ctx.lineCap='round';
      ctx.strokeStyle='rgba(88,213,255,0.22)'; ctx.lineWidth=11;
      ctx.beginPath(); ctx.moveTo(sg.x1,sg.y1); ctx.lineTo(sg.x2,sg.y2); ctx.stroke();
      ctx.strokeStyle=padFlash>0?'#dff6ff':'#58d5ff'; ctx.lineWidth=padFlash>0?4.5:3;
      ctx.beginPath(); ctx.moveTo(sg.x1,sg.y1); ctx.lineTo(sg.x2,sg.y2); ctx.stroke();
      ctx.strokeStyle='#2e3750'; ctx.lineWidth=4;
      for(const [ex,ey] of [[sg.x1,sg.y1],[sg.x2,sg.y2]]){
        ctx.beginPath(); ctx.moveTo(ex,ey); ctx.lineTo(ex-nx*10,ey-ny*10); ctx.stroke();
      }
    }else if(sg.kind==='belt'){ // LAB: conveyor — dark bar + travelling chevrons
      ctx.lineCap='round';
      ctx.strokeStyle='#242b3d'; ctx.lineWidth=10;
      ctx.beginPath(); ctx.moveTo(sg.x1,sg.y1); ctx.lineTo(sg.x2,sg.y2); ctx.stroke();
      ctx.strokeStyle='#39445f'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(sg.x1+nx*4,sg.y1+ny*4); ctx.lineTo(sg.x2+nx*4,sg.y2+ny*4); ctx.stroke();
      const tx=dx/L, ty=dy/L, spc=S*0.42;
      const off=((stepCount*sg.beltV*DT/2)%spc+spc)%spc;
      ctx.strokeStyle='rgba(255,179,71,0.55)'; ctx.lineWidth=2.4; ctx.lineJoin='round';
      for(let d2=off; d2<L-4; d2+=spc){
        const mx2=sg.x1+tx*d2, my2=sg.y1+ty*d2;
        ctx.beginPath();
        ctx.moveTo(mx2-tx*6+nx*3.5,my2-ty*6+ny*3.5);
        ctx.lineTo(mx2,my2);
        ctx.lineTo(mx2-tx*6-nx*3.5,my2-ty*6-ny*3.5);
        ctx.stroke();
      }
    }else if(sg.kind==='spike'){
      const act=spikeActive(sg); // LAB: pulsing spikes dim to a ghost when off
      const h=S*0.30, tw=Math.max(8,S*0.26);
      const n=Math.max(2,Math.floor(L/tw));
      ctx.save();
      if(!act) ctx.globalAlpha=0.18;
      ctx.strokeStyle='rgba(255,59,48,0.30)'; ctx.lineWidth=7; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(sg.x1,sg.y1); ctx.lineTo(sg.x2,sg.y2); ctx.stroke();
      ctx.fillStyle='#e0342c';
      for(let k=0;k<n;k++){
        const t0=k/n, t1=(k+1)/n, tm=(t0+t1)/2;
        ctx.beginPath();
        ctx.moveTo(sg.x1+dx*t0,sg.y1+dy*t0);
        ctx.lineTo(sg.x1+dx*tm+nx*h,sg.y1+dy*tm+ny*h);
        ctx.lineTo(sg.x1+dx*t1,sg.y1+dy*t1);
        ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle='#5a1512'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(sg.x1,sg.y1); ctx.lineTo(sg.x2,sg.y2); ctx.stroke();
      ctx.restore();
    }
  }
  for(const pl of pulleys){
    ctx.beginPath(); ctx.arc(pl.x,pl.y,pl.r,0,7);
    ctx.fillStyle='#222939'; ctx.fill();
    ctx.lineWidth=2.5; ctx.strokeStyle='#39445f'; ctx.stroke();
    ctx.beginPath(); ctx.arc(pl.x,pl.y,pl.r*0.32,0,7);
    ctx.fillStyle='#39445f'; ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1.5;
    for(let k=0;k<3;k++){
      const a=k*Math.PI/1.5+0.5;
      ctx.beginPath(); ctx.moveTo(pl.x+Math.cos(a)*pl.r*0.35,pl.y+Math.sin(a)*pl.r*0.35);
      ctx.lineTo(pl.x+Math.cos(a)*pl.r*0.85,pl.y+Math.sin(a)*pl.r*0.85); ctx.stroke();
    }
  }
}
/* LAB renderers */
function drawBalloons(){
  for(const bl of balloons){
    if(bl.dead) continue;
    const p=particles[bl.i], r=p.r;
    ctx.save();
    const gl=ctx.createRadialGradient(p.x-r*0.35,p.y-r*0.45,r*0.1,p.x,p.y,r);
    gl.addColorStop(0,'#ffd9a0'); gl.addColorStop(0.55,'#ffb347'); gl.addColorStop(1,'#b06a28');
    ctx.fillStyle=gl;
    ctx.beginPath(); ctx.ellipse(p.x,p.y,r*0.88,r,0,0,7); ctx.fill();
    ctx.strokeStyle='#38240f'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(p.x,p.y,r*0.88,r,0,0,7); ctx.stroke();
    ctx.fillStyle='#b06a28';
    ctx.beginPath();
    ctx.moveTo(p.x,p.y+r); ctx.lineTo(p.x-4,p.y+r+7); ctx.lineTo(p.x+4,p.y+r+7); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation='lighter';
    ctx.fillStyle='rgba(255,236,190,0.35)';
    ctx.beginPath(); ctx.ellipse(p.x-r*0.3,p.y-r*0.4,r*0.22,r*0.3,0,0,7); ctx.fill();
    ctx.restore();
  }
}
function drawFans(){
  for(const f of fans){
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    const dir=Math.sign(f.ax)||1;
    for(let k=0;k<9;k++){
      const ph=((stepCount*2.2+k*53)% (f.w+40))-20;
      const x=dir>0? f.x+ph : f.x+f.w-ph;
      const y=f.y+((k*97)%Math.max(1,f.h-8))+4;
      const a=0.10+0.10*Math.sin((stepCount+k*31)/17);
      ctx.strokeStyle='rgba(88,213,255,'+Math.max(0,a).toFixed(3)+')';
      ctx.lineWidth=2; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+dir*S*0.5,y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+dir*S*0.5,y); ctx.lineTo(x+dir*S*0.36,y-3.5);
      ctx.moveTo(x+dir*S*0.5,y); ctx.lineTo(x+dir*S*0.36,y+3.5); ctx.stroke();
    }
    ctx.restore();
  }
}
function drawTrolleys(){
  for(const tr of trolleys){
    const p=particles[tr.i];
    ctx.save();
    ctx.strokeStyle='#39445f'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(tr.x0,tr.y-3); ctx.lineTo(tr.x1,tr.y-3); ctx.stroke(); // rail
    roundRectPath(p.x-13,p.y-9,26,13,4);
    ctx.fillStyle='#222939'; ctx.fill();
    ctx.strokeStyle='#39445f'; ctx.lineWidth=2; ctx.stroke();
    for(const wx of [-7,7]){
      ctx.beginPath(); ctx.arc(p.x+wx,p.y+5,3.4,0,7);
      ctx.fillStyle='#46527a'; ctx.fill();
      ctx.strokeStyle='#0a0c12'; ctx.lineWidth=1.2; ctx.stroke();
    }
    ctx.restore();
  }
}
function basketXform(){
  const b=basket;
  const sq=b.squash;
  ctx.translate(b.x,b.yb);
  ctx.scale(1+sq*0.12,1-sq*0.18);
  ctx.translate(-b.x,-b.yb);
}
function drawBasketBack(){
  if(!basket) return;
  const b=basket;
  const l=b.x-b.iw/2, r=b.x+b.iw/2, t=b.yb-b.wh;
  ctx.save(); basketXform();
  ctx.fillStyle='rgba(22,13,7,0.95)';
  ctx.fillRect(l+2,t+2,b.iw-4,b.wh-2);
  const sp2=Math.max(9,S*0.30);
  let row=0;
  for(let y=t+sp2;y<b.yb-4;y+=sp2){
    ctx.strokeStyle=row%2?'rgba(176,106,40,0.32)':'rgba(140,82,30,0.32)';
    ctx.lineWidth=2;
    const off=(row%2)*sp2*0.5;
    for(let x=l+sp2*0.9+off;x<r-6;x+=sp2){
      ctx.beginPath(); ctx.arc(x,y,sp2*0.42,Math.PI,0,row%2===1); ctx.stroke();
    }
    row++;
  }
  ctx.restore();
}
function drawBasketFront(){
  if(!basket) return;
  const b=basket;
  const l=b.x-b.iw/2, r=b.x+b.iw/2, t=b.yb-b.wh;
  const gap=FLOORY-b.yb;
  if(gap>6&&gap<0.12*H){
    ctx.strokeStyle='#242b3d'; ctx.lineWidth=4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(l+5,b.yb); ctx.lineTo(l+5,FLOORY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r-5,b.yb); ctx.lineTo(r-5,FLOORY); ctx.stroke();
  }
  ctx.save(); basketXform();
  const lw=Math.max(5,S*0.16);
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.strokeStyle='#b06a28'; ctx.lineWidth=lw;
  ctx.beginPath(); ctx.moveTo(l,t); ctx.lineTo(l,b.yb); ctx.lineTo(r,b.yb); ctx.lineTo(r,t); ctx.stroke();
  ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=lw*0.3;
  ctx.beginPath(); ctx.moveTo(l+lw*0.3,b.yb-lw*0.1); ctx.lineTo(r-lw*0.3,b.yb-lw*0.1); ctx.stroke();
  ctx.globalCompositeOperation='lighter';
  for(const tx of [l,r]){
    const gl=ctx.createRadialGradient(tx,t,0,tx,t,S*0.55);
    gl.addColorStop(0,'rgba(255,183,99,0.35)'); gl.addColorStop(1,'rgba(255,183,99,0)');
    ctx.fillStyle=gl;
    ctx.beginPath(); ctx.arc(tx,t,S*0.55,0,7); ctx.fill();
    ctx.beginPath(); ctx.arc(tx,t,lw*0.55,0,7); ctx.fillStyle='#ffcf8a'; ctx.fill();
  }
  ctx.globalCompositeOperation='source-over';
  if(winFlash>0){
    ctx.globalCompositeOperation='lighter';
    const k=1-winFlash;
    const R=S*(1.1+k*1.9);
    const gl2=ctx.createRadialGradient(b.x,t-S*0.1,0,b.x,t-S*0.1,R);
    gl2.addColorStop(0,'rgba(255,195,115,'+(0.42*winFlash).toFixed(3)+')');
    gl2.addColorStop(1,'rgba(255,195,115,0)');
    ctx.fillStyle=gl2;
    ctx.beginPath(); ctx.arc(b.x,t-S*0.1,R,0,7); ctx.fill();
    ctx.globalCompositeOperation='source-over';
  }
  ctx.restore();
}
function ropeChains(){
  const chains=[];
  let cur=null, maxT=0;
  for(const c of cons){
    if(c.type!=='rope'||c.cut){
      if(cur){ cur.taut=maxT; chains.push(cur); cur=null; }
      continue;
    }
    const a=particles[c.a], b=particles[c.b];
    const t=Math.max(0,Math.min(1,(Math.hypot(b.x-a.x,b.y-a.y)/c.rest-1)/0.07));
    if(cur&&cur.last===c.a){
      cur.pts.push(b); cur.last=c.b;
      if(t>maxT) maxT=t;
    }else{
      if(cur){ cur.taut=maxT; chains.push(cur); }
      cur={pts:[a,b],last:c.b}; maxT=t;
    }
  }
  if(cur){ cur.taut=maxT; chains.push(cur); }
  return chains;
}
function drawRopes(){
  const base=Math.max(2,W*0.009);
  ctx.lineCap='round'; ctx.lineJoin='round';
  for(const ch of ropeChains()){
    const taut=ch.taut;
    const path=()=>{
      ctx.beginPath();
      ctx.moveTo(ch.pts[0].x,ch.pts[0].y);
      for(let i=1;i<ch.pts.length;i++) ctx.lineTo(ch.pts[i].x,ch.pts[i].y);
    };
    path();
    ctx.strokeStyle='rgba(10,6,2,0.55)';
    ctx.lineWidth=base*(1.55-0.4*taut);
    ctx.stroke();
    path();
    ctx.strokeStyle='hsl(33,'+(48+taut*18)+'%,'+(46+taut*20)+'%)';
    ctx.lineWidth=base*(1.15-0.4*taut);
    ctx.stroke();
    ctx.save();
    ctx.setLineDash([base*1.6,base*2.6]);
    path();
    ctx.strokeStyle='rgba(255,214,150,'+(0.30+taut*0.30).toFixed(2)+')';
    ctx.lineWidth=Math.max(1,base*0.42);
    ctx.stroke();
    ctx.restore();
  }
  // fresh cut-end flashes
  ctx.globalCompositeOperation='lighter';
  for(const p of particles){
    const age=stepCount-p.cutT;
    if(age>=0&&age<24){
      const al=1-age/24;
      ctx.fillStyle='rgba(255,214,140,'+(al*0.9).toFixed(3)+')';
      ctx.beginPath(); ctx.arc(p.x,p.y,1.5+al*4,0,7); ctx.fill();
    }
  }
  ctx.globalCompositeOperation='source-over';
}
function drawBox(b){
  const P=b.idx.map(i=>particles[i]);
  const sd=b.side;
  const path=()=>{
    ctx.beginPath();
    ctx.moveTo(P[0].x,P[0].y); ctx.lineTo(P[1].x,P[1].y);
    ctx.lineTo(P[2].x,P[2].y); ctx.lineTo(P[3].x,P[3].y); ctx.closePath();
  };
  path();
  ctx.fillStyle=b.kind==='crate'?'#7c5029':'#3d434f';
  ctx.fill();
  ctx.save();
  path(); ctx.clip();
  const ex={x:(P[1].x-P[0].x)/sd,y:(P[1].y-P[0].y)/sd};
  const ey={x:(P[3].x-P[0].x)/sd,y:(P[3].y-P[0].y)/sd};
  ctx.transform(ex.x,ex.y,ey.x,ey.y,P[0].x,P[0].y);
  if(b.kind==='crate'){
    ctx.strokeStyle='rgba(38,19,6,0.4)'; ctx.lineWidth=1.4;
    for(let k=1;k<=4;k++){
      const y=sd*k/5;
      ctx.beginPath(); ctx.moveTo(2,y);
      ctx.quadraticCurveTo(sd/2,y+Math.sin(b.seed+k)*3,sd-2,y);
      ctx.stroke();
    }
    ctx.strokeStyle='rgba(38,19,6,0.3)'; ctx.lineWidth=1.2;
    for(const fx of [0.34,0.66]){
      ctx.beginPath(); ctx.moveTo(sd*fx,2); ctx.lineTo(sd*fx,sd-2); ctx.stroke();
    }
    ctx.fillStyle='rgba(255,179,71,0.94)';
    ctx.fillRect(0,sd*0.40,sd,sd*0.20);
    ctx.fillStyle='rgba(255,255,255,0.22)';
    ctx.fillRect(0,sd*0.40,sd,sd*0.05);
    ctx.strokeStyle='rgba(255,207,138,0.45)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(3,1.5); ctx.lineTo(sd-3,1.5); ctx.stroke();
    ctx.strokeStyle='#262e42'; ctx.lineWidth=Math.max(3,sd*0.052); ctx.lineCap='butt';
    const br=sd*0.16, in2=Math.max(1.6,sd*0.024);
    ctx.beginPath(); ctx.moveTo(in2,br); ctx.lineTo(in2,in2); ctx.lineTo(br,in2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sd-br,in2); ctx.lineTo(sd-in2,in2); ctx.lineTo(sd-in2,br); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sd-in2,sd-br); ctx.lineTo(sd-in2,sd-in2); ctx.lineTo(sd-br,sd-in2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(br,sd-in2); ctx.lineTo(in2,sd-in2); ctx.lineTo(in2,sd-br); ctx.stroke();
    ctx.lineCap='round';
  }else{
    ctx.strokeStyle='rgba(255,255,255,0.10)'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(3,3); ctx.lineTo(sd-3,sd-3);
    ctx.moveTo(sd-3,3); ctx.lineTo(3,sd-3); ctx.stroke();
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=4;
    ctx.strokeRect(2,2,sd-4,sd-4);
  }
  if(phase==='fail'&&b.kind==='crate'&&crackLines){
    ctx.strokeStyle='rgba(16,8,3,'+Math.min(1,phaseTimer/8).toFixed(2)+')';
    ctx.lineWidth=2.2; ctx.lineCap='round';
    for(const cl of crackLines){
      ctx.beginPath(); ctx.moveTo(cl.x1*sd,cl.y1*sd); ctx.lineTo(cl.x2*sd,cl.y2*sd); ctx.stroke();
    }
  }
  ctx.restore();
  path();
  ctx.strokeStyle=b.kind==='crate'?'#38240f':'#1d222c';
  ctx.lineWidth=2.5; ctx.lineJoin='round'; ctx.stroke();
}
function firstRopeChord(){
  const chains=ropeChains();
  if(!chains.length) return null;
  // longest chain = the main suspending rope
  let best=null,bestLen=-1;
  for(const ch of chains){
    let L=0;
    for(let i=1;i<ch.pts.length;i++) L+=Math.hypot(ch.pts[i].x-ch.pts[i-1].x,ch.pts[i].y-ch.pts[i-1].y);
    if(L>bestLen){ bestLen=L; best=ch; }
  }
  // point ~55% along its arc length — clear, visible span
  const target=bestLen*0.55; let acc=0;
  for(let i=1;i<best.pts.length;i++){
    const seg=Math.hypot(best.pts[i].x-best.pts[i-1].x,best.pts[i].y-best.pts[i-1].y);
    if(acc+seg>=target){
      const t=seg?(target-acc)/seg:0;
      return {x:best.pts[i-1].x+(best.pts[i].x-best.pts[i-1].x)*t,
              y:best.pts[i-1].y+(best.pts[i].y-best.pts[i-1].y)*t};
    }
    acc+=seg;
  }
  const m=best.pts[Math.floor(best.pts.length/2)];
  return {x:m.x,y:m.y};
}
function roundRectPath(x,y,w,h,r){
  ctx.beginPath();
  if(ctx.roundRect){ ctx.roundRect(x,y,w,h,r); }
  else{
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
}
// Stylized tutorial hand: index-finger tip sits at (x,y), hand body below
function drawTutorialHand(x,y,s,alpha){
  ctx.save();
  ctx.globalAlpha=alpha;
  ctx.translate(x,y);
  ctx.rotate(0.26);
  ctx.fillStyle='#eef2f8';
  ctx.shadowColor='rgba(0,0,0,0.5)';
  ctx.shadowBlur=5*s; ctx.shadowOffsetX=1.2*s; ctx.shadowOffsetY=2.2*s;
  roundRectPath(-1.9*s,1.9*s,3.9*s,3.8*s,1.55*s); ctx.fill();               // palm / fist
  ctx.beginPath(); ctx.ellipse(-1.85*s,3.05*s,0.72*s,1.15*s,-0.5,0,7); ctx.fill(); // thumb
  ctx.shadowBlur=2.5*s; ctx.shadowOffsetY=1.2*s;
  roundRectPath(-0.6*s,-0.3*s,1.2*s,3.6*s,0.6*s); ctx.fill();               // index finger
  ctx.restore();
}
function drawGestureHint(now){
  if(everCut||phase!=='play'||level!==0) return;
  const mid=firstRopeChord(); if(!mid) return;
  const dx=W*0.145, dy=H*0.03;
  const ax=mid.x-dx, ay=mid.y-dy, bx=mid.x+dx, by=mid.y+dy;
  const ang=Math.atan2(by-ay,bx-ax);
  ctx.save();
  ctx.lineCap='round'; ctx.lineJoin='round';
  // dashed guide path
  ctx.setLineDash([2,8]);
  ctx.strokeStyle='rgba(255,255,255,.34)'; ctx.lineWidth=2.4;
  ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
  ctx.setLineDash([]);
  // arrowhead
  ctx.strokeStyle='rgba(255,255,255,.6)'; ctx.lineWidth=2.6;
  ctx.beginPath();
  ctx.moveTo(bx,by); ctx.lineTo(bx-Math.cos(ang-0.5)*13,by-Math.sin(ang-0.5)*13);
  ctx.moveTo(bx,by); ctx.lineTo(bx-Math.cos(ang+0.5)*13,by-Math.sin(ang+0.5)*13);
  ctx.stroke();
  // animated finger sweep
  const cyc=2100, tt=now%cyc;
  if(tt<1200){
    let p=tt/1200; p=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
    const fade=Math.min(1,Math.min(tt,1200-tt)/180);
    const fx=ax+(bx-ax)*p, fy=ay+(by-ay)*p;
    // comet trail
    ctx.globalCompositeOperation='lighter';
    const tailLen=Math.min(p,0.5);
    const sx=fx-(bx-ax)*tailLen, sy=fy-(by-ay)*tailLen;
    const grad=ctx.createLinearGradient(sx,sy,fx,fy);
    grad.addColorStop(0,'rgba(255,201,111,0)');
    grad.addColorStop(1,'rgba(255,214,140,'+(0.6*fade).toFixed(3)+')');
    ctx.strokeStyle=grad; ctx.lineWidth=7;
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(fx,fy); ctx.stroke();
    ctx.globalCompositeOperation='source-over';
    // fingertip contact ripple + tutorial hand
    const pulse=1+0.18*Math.sin(now/110);
    ctx.globalAlpha=fade;
    ctx.strokeStyle='rgba(255,214,140,.7)'; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.arc(fx,fy,13*pulse,0,7); ctx.stroke();
    ctx.fillStyle='rgba(255,224,170,.9)';
    ctx.beginPath(); ctx.arc(fx,fy,4,0,7); ctx.fill();
    ctx.globalAlpha=1;
    drawTutorialHand(fx,fy,5,fade);
  }
  ctx.restore();
}
function drawGhostCrate(cx,cy,size,alpha,squashY,rot){
  if(alpha<=0) return;
  ctx.save();
  ctx.globalAlpha=Math.max(0,Math.min(1,alpha));
  ctx.translate(cx,cy);
  if(rot) ctx.rotate(rot);
  const sq=squashY||1; ctx.scale(1/Math.sqrt(sq),sq);
  const h=size/2;
  ctx.fillStyle='rgba(255,214,150,0.14)';
  roundRectPath(-h,-h,size,size,size*0.14); ctx.fill();
  ctx.fillStyle='rgba(255,179,71,0.42)';
  ctx.fillRect(-h,-size*0.11,size,size*0.22);
  ctx.strokeStyle='rgba(255,226,175,0.85)'; ctx.lineWidth=2;
  roundRectPath(-h,-h,size,size,size*0.14); ctx.stroke();
  ctx.restore();
}
function drawCue(now){
  if(!cue||cutThisLevel||phase!=='play') return;
  ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
  if(cue.kind==='pad'){
    // DEMO: a ghost crate drops onto the pad, squashes, and launches UP higher than it fell
    const s=segs.find(x=>x.kind==='pad');
    if(s){
      const mx=(s.x1+s.x2)/2, my=(s.y1+s.y2)/2;
      const dx=s.x2-s.x1, dy=s.y2-s.y1, L=Math.hypot(dx,dy)||1;
      let nx=-dy/L, ny=dx/L; if(ny>0){ nx=-nx; ny=-ny; }   // up-facing normal
      const cyc=2200, t=(now%cyc)/cyc;
      const gs=0.10*W, rad=gs/2, off=rad+6, hA=0.12*H, hB=0.19*H;
      const contact=Math.max(0,1-Math.abs(t-0.42)/0.09);
      // pad glow — steady pulse, flares on contact
      ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle='rgba(88,213,255,'+(0.16+0.5*contact+0.1*(0.5+0.5*Math.sin(now/230))).toFixed(3)+')';
      ctx.lineWidth=11; ctx.beginPath(); ctx.moveTo(s.x1,s.y1); ctx.lineTo(s.x2,s.y2); ctx.stroke();
      let dist, alpha=1;
      if(t<0.42){ const u=t/0.42; dist=hA+(off-hA)*(u*u); }              // fall (accelerate)
      else if(t<0.86){ const u=(t-0.42)/0.44; dist=off+(hB-off)*Math.sin(u*Math.PI/2); } // launch up
      else { dist=hB; alpha=1-(t-0.86)/0.14; }                          // fade at apex
      if(t<0.06) alpha=t/0.06;
      const squash=1-0.32*contact;
      const gx=mx+nx*dist, gy=my+ny*dist;
      if(contact>0.02){
        ctx.strokeStyle='rgba(150,224,255,'+(contact*0.7).toFixed(3)+')'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(mx,my,10+22*(1-contact),0,7); ctx.stroke();
      }
      ctx.globalCompositeOperation='source-over';
      drawGhostCrate(gx,gy,gs,alpha,squash,0);
    }
  }else if(cue.kind==='spike'){
    // DEMO: a ghost crate falls onto the spikes and shatters (don't let it touch)
    const s=segs.find(x=>x.kind==='spike');
    if(s){
      const mx=(s.x1+s.x2)/2, topY=Math.min(s.y1,s.y2);
      const cyc=2200, t=(now%cyc)/cyc;
      const gs=0.10*W, rad=gs/2, startY=topY-0.15*H, restY=topY-rad-2;
      ctx.globalCompositeOperation='lighter';
      const amb=0.08+0.10*(0.5+0.5*Math.sin(now/260));
      const g=ctx.createRadialGradient(mx,topY,0,mx,topY,0.15*W);
      g.addColorStop(0,'rgba(255,70,58,'+amb.toFixed(3)+')'); g.addColorStop(1,'rgba(255,70,58,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(mx,topY,0.15*W,0,7); ctx.fill();
      ctx.globalCompositeOperation='source-over';
      if(t<0.5){
        const u=t/0.5, gy=startY+(restY-startY)*(u*u);
        let alpha=1; if(t<0.06) alpha=t/0.06;
        drawGhostCrate(mx,gy,gs,alpha*0.95,1,0);
      }else{
        const u=(t-0.5)/0.5;
        ctx.globalCompositeOperation='lighter';
        ctx.strokeStyle='rgba(255,80,66,'+((1-u)*0.85).toFixed(3)+')'; ctx.lineWidth=3.2;
        ctx.beginPath(); ctx.arc(mx,restY,8+0.11*W*u,0,7); ctx.stroke();
        const flash=ctx.createRadialGradient(mx,restY,0,mx,restY,0.1*W);
        flash.addColorStop(0,'rgba(255,90,72,'+((1-u)*0.6).toFixed(3)+')'); flash.addColorStop(1,'rgba(255,90,72,0)');
        ctx.fillStyle=flash; ctx.beginPath(); ctx.arc(mx,restY,0.1*W,0,7); ctx.fill();
        ctx.globalCompositeOperation='source-over';
        for(let i=0;i<4;i++){
          const ang=-Math.PI/2+(i-1.5)*0.55, sp=0.085*W;
          const fx=mx+Math.cos(ang)*sp*u, fy=restY+Math.sin(ang)*sp*u+0.5*0.34*H*u*u;
          drawGhostCrate(fx,fy,gs*0.42,(1-u)*0.9,1,(i-1.5)*0.6+u*2);
        }
      }
    }
  }else if(cue.kind==='pulley'){
    const p=pulleys[0];
    if(p&&typeof p.x==='number'){
      const r=(p.r||18)+10, a0=(now/520)%(Math.PI*2);
      ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle='rgba(180,200,255,0.42)'; ctx.lineWidth=3.4;
      ctx.beginPath(); ctx.arc(p.x,p.y,r,a0,a0+Math.PI*1.15); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x,p.y,r,a0+Math.PI,a0+Math.PI+Math.PI*1.15); ctx.stroke();
      // seesaw demo: weight side sinks (down chevrons), crate side lifts (up chevrons)
      const wc=decoy?boxCenter(decoy):{x:p.x+0.2*W,y:p.y+0.3*H};
      const cc=crate?boxCenter(crate):{x:p.x-0.2*W,y:p.y+0.3*H};
      for(let k=0;k<3;k++){
        const ph=((now/900)+k/3)%1, yy=wc.y-0.06*H+ph*0.12*H, a=Math.sin(ph*Math.PI)*0.8;
        ctx.strokeStyle='rgba(255,140,130,'+a.toFixed(3)+')'; ctx.lineWidth=3.2;
        ctx.beginPath(); ctx.moveTo(wc.x-11,yy); ctx.lineTo(wc.x,yy+9); ctx.lineTo(wc.x+11,yy); ctx.stroke();
      }
      for(let k=0;k<3;k++){
        const ph=((now/900)+k/3)%1, yy=cc.y-0.02*H-ph*0.12*H, a=Math.sin(ph*Math.PI)*0.8;
        ctx.strokeStyle='rgba(150,224,255,'+a.toFixed(3)+')'; ctx.lineWidth=3.2;
        ctx.beginPath(); ctx.moveTo(cc.x-11,yy+9); ctx.lineTo(cc.x,yy); ctx.lineTo(cc.x+11,yy+9); ctx.stroke();
      }
    }
  }
  ctx.globalCompositeOperation='source-over';
  ctx.restore();
}
function drawFX(now){
  ctx.globalCompositeOperation='lighter';
  for(const p of sparks){
    const al=p.life/p.max;
    ctx.fillStyle=p.col;
    ctx.globalAlpha=al*0.55;
    ctx.beginPath(); ctx.arc(p.x,p.y,3.4,0,7); ctx.fill();
    ctx.globalAlpha=Math.min(1,al*1.4);
    ctx.fillStyle='#fff8ea';
    ctx.beginPath(); ctx.arc(p.x,p.y,1.5,0,7); ctx.fill();
  }
  ctx.globalAlpha=1;
  // blade streak
  while(streak.length&&now-streak[0].t>220) streak.shift();
  for(let i=1;i<streak.length;i++){
    const a=Math.max(0,1-(now-streak[i].t)/150);
    if(a<=0) continue;
    ctx.strokeStyle='rgba(215,235,255,'+(a*0.25).toFixed(3)+')';
    ctx.lineWidth=8; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(streak[i-1].x,streak[i-1].y); ctx.lineTo(streak[i].x,streak[i].y); ctx.stroke();
    ctx.strokeStyle='rgba(240,250,255,'+(a*0.85).toFixed(3)+')';
    ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(streak[i-1].x,streak[i-1].y); ctx.lineTo(streak[i].x,streak[i].y); ctx.stroke();
  }
  ctx.globalCompositeOperation='source-over';
  for(const p of confetti){
    ctx.save();
    ctx.globalAlpha=Math.min(1,p.life/40);
    ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.fillStyle=p.col;
    ctx.fillRect(-p.sz/2,-p.sz/2,p.sz,p.sz*0.7);
    ctx.restore();
  }
  ctx.globalAlpha=1;
}
function draw(now){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  if(bgCv) ctx.drawImage(bgCv,0,0,W,H);
  else{ ctx.fillStyle='#0c1017'; ctx.fillRect(0,0,W,H); }
  if(basket){
    const pool=ctx.createRadialGradient(basket.x,FLOORY,0,basket.x,FLOORY,S*2.4);
    pool.addColorStop(0,'rgba(255,183,99,0.13)'); pool.addColorStop(1,'rgba(255,183,99,0)');
    ctx.fillStyle=pool;
    ctx.beginPath(); ctx.ellipse(basket.x,FLOORY+2,S*2.4,S*0.55,0,0,7); ctx.fill();
  }
  ctx.globalCompositeOperation='lighter';
  for(const f of fireflies){
    const a=0.16+0.38*(0.5+0.5*Math.sin(f.t*1.8+f.p));
    const gl=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,7);
    gl.addColorStop(0,'rgba(255,214,140,'+(a*0.7).toFixed(3)+')');
    gl.addColorStop(1,'rgba(255,214,140,0)');
    ctx.fillStyle=gl;
    ctx.beginPath(); ctx.arc(f.x,f.y,7,0,7); ctx.fill();
    ctx.fillStyle='rgba(255,236,190,'+a.toFixed(3)+')';
    ctx.fillRect(f.x-0.7,f.y-0.7,1.5,1.5);
  }
  ctx.globalCompositeOperation='source-over';
  drawBeams();
  drawFans();
  drawSegs();
  drawTrolleys();
  drawBasketBack();
  drawRopes();
  for(const b of boxes) if(b.kind!=='crate') drawBox(b);
  if(crate) drawBox(crate);
  drawBalloons();
  drawBasketFront();
  drawFX(now);
  if(vgCv) ctx.drawImage(vgCv,0,0,W,H);
  drawGestureHint(now);
  drawCue(now);
  if(crate&&phase==='play'&&!paused){
    const v=boxVel(crate);
    updateWhoosh(Math.hypot(v.vx,v.vy));
  }else updateWhoosh(0);
}
/* ============================== input ============================== */
function evtPos(e){
  const r=cv.getBoundingClientRect();
  return [e.clientX-r.left,e.clientY-r.top];
}
// One heal path for every user gesture: rebuild a known-dead engine while we
// hold gesture privileges; resume anything not running (incl. iOS
// 'interrupted'); flag lying 'running'-but-frozen zombies for the next tap.
function healAudio(){
  ensureAudio();
  if(audioDead){ rebuildAudio(); audioDead=false; return; }
  if(actx&&actx.state!=='running'){ try{ actx.resume(); }catch(_){} }
  audioAlive(ok=>{ if(!ok&&actx&&actx.state==='running'){ audioDead=true; audioLog('tap-zombie'); } });
}
cv.addEventListener('pointerdown',e=>{
  e.preventDefault();
  healAudio();
  try{ cv.setPointerCapture(e.pointerId); }catch(_){}
  ptrDown=true;
  const [x,y]=evtPos(e);
  lastPX=x; lastPY=y;
  streak.push({x,y,t:performance.now()});
});
cv.addEventListener('pointermove',e=>{
  if(!ptrDown) return;
  const [x,y]=evtPos(e);
  if(x===lastPX&&y===lastPY) return;
  cutSegment(lastPX,lastPY,x,y);
  streak.push({x,y,t:performance.now()});
  lastPX=x; lastPY=y;
});
cv.addEventListener('pointerup',()=>{ ptrDown=false; });
cv.addEventListener('pointercancel',()=>{ ptrDown=false; });
cv.addEventListener('contextmenu',e=>e.preventDefault());
/* ============================== hud ============================== */
const lvlEl=document.getElementById('lvl');
const dotsEl=document.getElementById('dots');
const dots=[];
function unlockedIdx(i){ return true; } // LAB: every mechanic open for feel-testing
function initDots(){
  for(let i=0;i<=LAST;i++){
    const d=document.createElement('button');
    d.className='dot';
    d.setAttribute('aria-label','level '+(i+1));
    d.addEventListener('click',()=>{
      if(!unlockedIdx(i)&&!DEV_UNLOCK) return;
      const switching=i!==level; // re-tapping the current dot is a restart, not a new entry
      level=i; buildLevel(i);
      if(switching) trackLevelStart();
    });
    dotsEl.appendChild(d); dots.push(d);
  }
}
function activeHintText(){
  // fully visual coaching — animated hand + ghost demos carry the teaching, no captions
  return null;
}
function scheduleHint(){
  const h=document.getElementById('hint');
  if(hintTimer){ clearTimeout(hintTimer); hintTimer=null; }
  h.classList.add('hide');
  // wordless gesture/cue teaches immediately; surface words only if the player
  // is still stuck after ~4.5s (roughly two hint loops)
  const txt=activeHintText();
  if(txt){
    h.textContent=txt;
    hintTimer=setTimeout(()=>{ if(activeHintText()===txt) h.classList.remove('hide'); }, 4500);
  }
}
function updateHUD(){
  lvlEl.textContent='LAB '+(level+1)+' · '+LAB_NAMES[level];
  for(let i=0;i<=LAST;i++){
    dots[i].className='dot'+(cleared[i]?' cleared':'')+(i===level?' cur':'')+
      ((unlockedIdx(i)||DEV_UNLOCK)?'':' locked');
  }
}
const setBtn=document.getElementById('setBtn');
const setEl=document.getElementById('settings');
function renderSettings(){
  document.querySelectorAll('#settings .setRow').forEach(row=>row.querySelector('.sw').classList.toggle('on',!!settings[row.dataset.k]));
}
function openSettings(){
  healAudio();
  applyAudioSettings();
  setEl.classList.remove('hidden'); paused=true;
  requestAnimationFrame(()=>setEl.classList.add('show'));
}
function closeSettings(){
  setEl.classList.remove('show'); paused=false;
  setTimeout(()=>setEl.classList.add('hidden'),240);
}
function initSettings(){
  renderSettings();
  setBtn.addEventListener('click',openSettings);
  document.getElementById('setScrim').addEventListener('click',closeSettings);
  document.getElementById('setClose').addEventListener('click',closeSettings);
  document.getElementById('setRestart').addEventListener('click',()=>{ buildLevel(level); closeSettings(); });
  document.querySelectorAll('#settings .setRow').forEach(row=>{
    row.addEventListener('click',()=>{
      const k=row.dataset.k; settings[k]=!settings[k]; saveSettings(); renderSettings();
      healAudio();
      applyAudioSettings();
      if(k==='vibration'&&settings.vibration) vibe(14);
    });
  });
  if(new URLSearchParams(location.search).get('panel')==='settings') openSettings();
}
/* ============================== boot ============================== */
function seededRng(seed){ let s=seed; return ()=>{ s=(s*16807+11)%2147483647; return (s&0xffff)/0xffff; }; }
function makeBgCache(){
  const floorY=H*0.985;
  bgCv=document.createElement('canvas');
  bgCv.width=Math.round(W*DPR); bgCv.height=Math.round(H*DPR);
  const c=bgCv.getContext('2d');
  c.scale(DPR,DPR);
  const bg=c.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#16203a'); bg.addColorStop(0.55,'#0c1017'); bg.addColorStop(1,'#090b11');
  c.fillStyle=bg; c.fillRect(0,0,W,H);
  const moon=c.createRadialGradient(W*0.38,H*0.09,0,W*0.38,H*0.09,Math.max(W,H)*0.55);
  moon.addColorStop(0,'rgba(140,165,215,0.16)'); moon.addColorStop(1,'rgba(140,165,215,0)');
  c.fillStyle=moon; c.fillRect(0,0,W,H*0.62);
  const r=seededRng(3);
  c.fillStyle='#cfd8ea';
  for(let i=0;i<52;i++){ c.globalAlpha=0.1+r()*0.45; c.fillRect(r()*W,r()*H*0.5,0.7+r(),0.7+r()); }
  c.globalAlpha=1;
  c.fillStyle='#0d1220';
  c.beginPath(); c.ellipse(W*0.2,floorY+H*0.05,W*0.56,H*0.076,0,0,7); c.fill();
  c.fillStyle='#0b0f1a';
  c.beginPath(); c.ellipse(W*0.85,floorY+H*0.06,W*0.64,H*0.085,0,0,7); c.fill();
  const mist=c.createLinearGradient(0,floorY-H*0.06,0,floorY);
  mist.addColorStop(0,'rgba(150,170,215,0)'); mist.addColorStop(1,'rgba(150,170,215,0.07)');
  c.fillStyle=mist; c.fillRect(0,floorY-H*0.06,W,H*0.06);
  c.fillStyle='#06080d'; c.fillRect(0,floorY,W,H-floorY);
  c.strokeStyle='#2a3350'; c.lineWidth=2;
  c.beginPath(); c.moveTo(0,floorY); c.lineTo(W,floorY); c.stroke();
  vgCv=document.createElement('canvas');
  vgCv.width=Math.round(W*DPR); vgCv.height=Math.round(H*DPR);
  const v=vgCv.getContext('2d');
  v.scale(DPR,DPR);
  const vg=v.createRadialGradient(W/2,H*0.45,H*0.25,W/2,H*0.45,H*0.8);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.32)');
  v.fillStyle=vg; v.fillRect(0,0,W,H);
  const ts=v.createLinearGradient(0,0,0,H*0.11);
  ts.addColorStop(0,'rgba(0,0,0,0.28)'); ts.addColorStop(1,'rgba(0,0,0,0)');
  v.fillStyle=ts; v.fillRect(0,0,W,H*0.11);
}
function initFireflies(){
  fireflies=[];
  for(let i=0;i<7;i++){
    fireflies.push({x:(0.06+0.88*Math.random())*W,y:(0.16+0.55*Math.random())*H,
      t:Math.random()*20,p:Math.random()*6.3});
  }
}
function resize(){
  const w=Math.max(200,window.innerWidth), h=Math.max(300,window.innerHeight);
  DPR=Math.min(window.devicePixelRatio||1,3);
  cv.width=Math.round(w*DPR); cv.height=Math.round(h*DPR);
  cv.style.width=w+'px'; cv.style.height=h+'px';
  if(w!==W||h!==H){ W=w; H=h; makeBgCache(); initFireflies(); buildLevel(level); }
}
window.addEventListener('resize',resize);
let acc=0,lastT=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  let ms=now-lastT; lastT=now;
  if(ms>50) ms=50;
  acc+=ms/1000;
  if(paused) acc=0;
  else while(acc>=DT){ step(); acc-=DT; }
  draw(now);
}
window.__game={
  state:()=>{
    const c=crate?boxCenter(crate):{x:0,y:0};
    const v=crate?boxVel(crate):{vx:0,vy:0};
    return {level:level+1,cleared:cleared.slice(),phase,
      crate:{x:c.x,y:c.y,vx:v.vx,vy:v.vy}};
  },
  stepN:(n)=>{ for(let i=0;i<n;i++) step(); draw(performance.now()); },
  cutAt:(x1,y1,x2,y2)=>cutSegment(x1,y1,x2,y2),
  // dev/test-only hooks (harmless in prod):
  ropes:()=>cons.filter(c=>c.type==='rope'&&!c.cut).map(c=>{const a=particles[c.a],b=particles[c.b];return {x1:a.x,y1:a.y,x2:b.x,y2:b.y,mx:(a.x+b.x)/2,my:(a.y+b.y)/2};}),
  balloons:()=>balloons.filter(b=>!b.dead).map(b=>({x:particles[b.i].x,y:particles[b.i].y,r:particles[b.i].r})),
  setLevel:(i)=>{ level=Math.max(0,Math.min(LAST,i|0)); buildLevel(level); },
  dims:()=>({W,H,S,SP,FLOORY})
};
loadProgress();
level=frontierLevel();
CUES_ALWAYS=new URLSearchParams(location.search).get('cues')==='always';
FORCE_CUE=new URLSearchParams(location.search).get('cue')||null;
(function(){ const _lv=parseInt(new URLSearchParams(location.search).get('level'),10); if(_lv>=1&&_lv<=LAST+1) level=_lv-1; })();
try{ if(window.Track) Track.init({ gaId: CUT_GA_ID }); }catch(_){}
initDots();
resize();
initSettings();
(function(){
  // presentation-only: reach & hold a transient beat for gallery frames
  const dm=new URLSearchParams(location.search).get('demo');
  if(!dm) return;
  try{
    if(dm==='cut'||dm==='win'){
      level=0; buildLevel(0);
      cutSegment(W*0.4,H*0.12,W*0.6,H*0.12);
      let g=0; const cap=(dm==='cut')?46:420;
      while(g<cap && !(dm==='win'&&phase==='win')){ step(); g++; }
      if(dm==='win'){ for(let i=0;i<22;i++) step(); }
      paused=true;
    }else if(dm==='fail'){
      level=3; buildLevel(3);
      cutSegment(W*0.4,H*0.08,W*0.6,H*0.08);
      let g=0; while(g<420 && phase==='play'){ step(); g++; }
      for(let i=0;i<10;i++) step();
      paused=true;
    }
  }catch(e){}
})();
trackLevelStart();
requestAnimationFrame(frame);
