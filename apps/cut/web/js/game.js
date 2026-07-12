"use strict";
/* CUT — Night Rig. Ported from the design handoff reference build
   (design/"CUT - Night Rig (reference build).html"), which is the source of
   truth for look, feel, physics constants, and audio. The simulation + render
   are a faithful transcription; the INTENTIONAL deltas vs the reference:
     · progress persistence (cleared[] → localStorage['cut.progress'], frontier boot)
     · @jfun/analytics Track.ev funnel events (level_start/complete/campaign)
     · DEV_UNLOCK dev-diagnostics flag on debug builds / localhost+LAN http
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
     · Settings REWORKED (Qi product call): the reference's demo-gated level
       grid + "Replay tutorials" are gone — replaced by an always-available
       "How to play" paged tutorial overlay that loops a self-contained mini
       demo per mechanic in the cue system's visual language (see openHowto/
       drawHowto); "Restart level" is now "Restart". A DEV-ONLY jump grid
       (#devJump, initDevJump) returns on DEV_UNLOCK builds for on-device
       feel-testing — stripped from the shipping app. ?level=N/__game.setLevel
       still work
     · FLOOR IS SURVIVABLE (thud → rest → crack after 48 steps); only SPIKES
       kill instantly — the reference's lethal-everywhere floor made spike
       placement fake stakes (Qi feedback; see collideBox/doChecks)
     · MEANINGFUL SPIKES: every spike sits in a MID-FLIGHT trajectory a wrong/
       lazy move actually takes (a floor spike only ever caught an already-
       missed crate — Qi: "cutter feels meaningless"). L8 raised into the wrong-
       cut plummet; L14/L15/L10 raised to left shelves that catch an early
       release; L11/L12-flanks/L20-flanks removed (their pad-lob / ceiling / gate
       is the real hazard). See buildLevel cases 7/9/13/14 + 10/11/19
     · LEVEL-LOCAL CLOCK: buildLevel resets stepCount=0 so pulse gates start at a
       FIXED phase every load/retry (they read stepCount*DT) — otherwise the gate
       sat at a random phase of the global clock and the timing didn't repeat
     · CAMPAIGN ENDING: winning the last level starts the CRATE-HOMECOMING
       ending — crates drift down trailing cut-rope snippets and stack into a
       warehouse pile (phase 'end', #endcard, tap to replay; see startEnding)
     · iOS CANVAS RECOVERY: draw() ALWAYS clears with a fillRect before drawing
       the offscreen bg cache (iOS WKWebView PURGES offscreen-canvas backing
       during long backgrounding → drawImage(bgCv) paints nothing → the frame
       accumulates into a smeared "tower" — hit on device overnight). On
       visibility-resume + pageshow, refreshRender() recreates the canvas backing
       + rebuilds bgCv/vgCv (no level rebuild, progress kept)
     · EXTENDED TO 100 LEVELS (element ladder past the handoff, Qi-directed):
       new mechanics — ELASTIC cord (T4, makeElasticRope), ROTATING anchor +
       spinning SAWBLADE (T5, makeRotor/makeBlade), WIND zone + MAGNET (T6,
       makeWind/makeMagnet), STAR pickup objective (makeStar) — plus gravity/
       mirror/geometry permutations. EVERY level is certified winnable by the
       seeded-cut fairness harness (scripts/dev/fairness.cjs, in test.sh); new
       levels are placed with its `land` probe. winNow() is a test-only hook.
       Difficulty is NOT yet sawtooth-ordered and the new mechanics lack in-level
       cues — deliberate (Qi: "build to 100, fine tune later")
   Everything else: keep the numbers in sync with the handoff — feel is the moat. */

/* ============================== globals ============================== */
const cv=document.getElementById('cv'), ctx=cv.getContext('2d');
const DT=1/120;
let W=0,H=0,DPR=1,G=0,S=40,SP=8,FLOORY=0;
// fullW = the FULL screen width (canvas + atmospheric background span); W = the
// aspect-capped PLAY field width (all gameplay/physics — byte-identical to phone).
// OX = horizontal offset that centers the play field in the full canvas. On every
// phone fullW===W and OX===0, so the framing is a pure no-op there.
let fullW=0,OX=0;
let level=0;
// 20 levels, 0..19 — the design's 12 restructured per pacing research (each new
// mechanic gets intro → develop → twist before the next; combos late; breathers
// between peaks). Levels 9-12/13-15/16-18 are our balloon/trolley/pulse arcs.
const LAST=52;
const cleared=new Array(LAST+1).fill(false);
let balloons=[],trolleys=[],rotors=[],blades=[],winds=[],magnets=[],stars=[];
let phase='play', phaseTimer=0, slowSteps=0, stepCount=0, creakCd=0;
let particles=[],cons=[],boxes=[],segs=[],pulleys=[],beams=[],anchorsPts=[];
let crate=null,decoy=null,basket=null,crackLines=null;
let sparks=[],confetti=[],streak=[];
let fireflies=[],winFlash=0,bgCv=null,vgCv=null;
let everCut=false,ptrDown=false,lastPX=0,lastPY=0;
let hintTimer=null, cutThisLevel=false, cue=null, CUES_ALWAYS=false, FORCE_CUE=null, FREEZE=false;
let seen={};
try{ seen=JSON.parse(localStorage.getItem('cut.seen')||'{}')||{}; }catch(_){ seen={}; }
function markSeen(k){ if(k&&!seen[k]){ seen[k]=true; try{ localStorage.setItem('cut.seen',JSON.stringify(seen)); }catch(_){} } }
function seenAlready(k){ return CUES_ALWAYS?false:!!seen[k]; }
// First-encounter cue: the first time a NEW mechanic appears, flag it so the
// renderer plays a one-time wordless attention animation (+ adaptive text).
function detectCue(){
  cue=null;
  const hasPulse=segs.some(s=>s.kind==='spike'&&s.pulse);
  const hasSpike=segs.some(s=>s.kind==='spike'&&!s.pulse);
  const hasElastic=cons.some(c=>c.type==='rope'&&c.mat==='elastic'&&!c.cut);
  // present[kind] → is that mechanic in THIS level (new mechanics first so an
  // intro level cues its new item even if an older mechanic is also present)
  const present={ elastic:hasElastic, rotor:rotors.length>0, wind:winds.length>0,
    magnet:magnets.length>0, blade:blades.length>0, star:stars.length>0,
    balloon:balloons.length>0, trolley:trolleys.length>0, pulse:hasPulse,
    spike:hasSpike, pad:segs.some(s=>s.kind==='pad'), pulley:pulleys.length>0 };
  const order=['elastic','rotor','wind','magnet','blade','star','balloon','trolley','pulse','spike','pad','pulley'];
  let k=null;
  if(FORCE_CUE){ if(present[FORCE_CUE]){ cue={kind:FORCE_CUE}; return; } }
  for(const kind of order){ if(present[kind] && !seenAlready(kind)){ k=kind; break; } }
  if(k) cue={kind:k};
}
let paused=false;
let settings={sfx:true,music:true,vibration:true};
try{ const _s=JSON.parse(localStorage.getItem('cut.settings')||'null'); if(_s&&typeof _s==='object') settings=Object.assign(settings,_s); }catch(_){}
function saveSettings(){ try{ localStorage.setItem('cut.settings',JSON.stringify(settings)); }catch(_){} }

// dev builds: a #if-DEBUG native build (window.__DEV_BUILD, stripped in
// Release) or a plain-http dev origin (localhost + private-LAN feel-testing).
// Gates dev-only diagnostics (audio debug trail); ships off.
const DEV_UNLOCK = !!(typeof window!=='undefined' && (window.__DEV_BUILD ||
  (location&&location.protocol==='http:'&&/^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname))));

// analytics — set the measurement id at release (empty → web stays inert; native
// routes to Firebase once @capacitor-firebase/analytics + GoogleService-Info are wired).
const CUT_GA_ID = "";

/* ============================== progress persistence ============================== */
const PROGRESS_KEY='cut.progress';
function loadProgress(){
  try{
    const p=JSON.parse(localStorage.getItem(PROGRESS_KEY)||'null');
    if(p&&Array.isArray(p.cleared)) for(let i=0;i<=LAST;i++) cleared[i]=!!p.cleared[i];
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
   ('cut.audiolog') pullable via devicectl appDataContainer. */
let audioDead=false;
function audioLog(ev){
  if(!DEV_UNLOCK) return;
  try{
    const l=JSON.parse(localStorage.getItem('cut.audiolog')||'[]');
    l.push([Date.now(), ev, actx?actx.state:'null', actx?Math.round(actx.currentTime*1000):-1, document.visibilityState]);
    localStorage.setItem('cut.audiolog', JSON.stringify(l.slice(-120)));
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
  // recover the render surfaces FIRST, before the audio-only early-return below —
  // iOS can purge the canvas backing during background regardless of audio state
  if(document.visibilityState==='visible') refreshRender();
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
function playPop(){
  if(!actx) return;
  const t0=actx.currentTime;
  const o=actx.createOscillator(); o.type='triangle';
  o.frequency.setValueAtTime(540,t0); o.frequency.exponentialRampToValueAtTime(120,t0+0.13);
  const g=actx.createGain(); g.gain.setValueAtTime(0.0001,t0);
  g.gain.exponentialRampToValueAtTime(0.5,t0+0.006); g.gain.exponentialRampToValueAtTime(0.0001,t0+0.15);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0+0.16);
  if(noiseBuf){
    const src=actx.createBufferSource(); src.buffer=noiseBuf;
    const hp=actx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1300;
    const ng=actx.createGain(); ng.gain.setValueAtTime(0.4,t0); ng.gain.exponentialRampToValueAtTime(0.001,t0+0.08);
    src.connect(hp); hp.connect(ng); ng.connect(master); src.start(t0); src.stop(t0+0.09);
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
  for(const i of idx) particles[i].boxed=true; // box corners: wind applies per-BOX (see physCore)
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
  if(opt.node!==undefined){ const q=particles[opt.node]; link(id,opt.node,Math.hypot(q.x-p.x,q.y-p.y),'rope'); return; }
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
// ELASTIC rope (T4 material) — a soft spring/bungee. Builds like makeRope, then
// tags every rope constraint it created with a stiffness < 1 (the solver
// under-corrects → it stretches under load and springs back) and scales the
// rest length by restScale (< 1 = pre-tensioned: it wants to CONTRACT, so
// cutting a restraint lets it fling the crate — a slingshot launcher). stiff
// governs bounciness; restScale governs launch power.
function makeElasticRope(path,startOpt,endOpt,o){
  o=o||{};
  const stiff=o.stiff===undefined?0.12:o.stiff;
  const restScale=o.restScale===undefined?1:o.restScale;
  const before=cons.length;
  const ids=makeRope(path,startOpt,endOpt);
  const idset=new Set(ids);
  for(let ci=before;ci<cons.length;ci++){
    const c=cons[ci];
    if(c.type==='rope'&&(idset.has(c.a)||idset.has(c.b))){ c.mat='elastic'; c.stiff=stiff; c.rest*=restScale; }
  }
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
// Balloon: a buoyant particle tethered (rope, pull-only) to the box's top two
// corners so it hangs the crate level and lifts it. Popped by swiping across it.
function makeBalloon(box,dist,lift,r){
  const c0=particles[box.idx[0]], c1=particles[box.idx[1]];
  const mx=(c0.x+c1.x)/2, my=(c0.y+c1.y)/2;
  const bx=mx, by=my-dist;
  const bi=pt(bx,by,0.25);
  particles[bi].balloon=true; particles[bi].gmul=-lift;
  const con0={a:bi,b:box.idx[0],rest:Math.hypot(c0.x-bx,c0.y-by),type:'rope',cut:false};
  const con1={a:bi,b:box.idx[1],rest:Math.hypot(c1.x-bx,c1.y-by),type:'rope',cut:false};
  cons.push(con0,con1);
  const bl={p:bi,r:r||S*0.44,popped:false,con:con0,con2:con1,popT:-999};
  balloons.push(bl);
  return bl;
}
// Moving anchor: a kinematic pin driven along a rail each step, dragging the
// crate into a swing. Rope end is pinned then re-tagged as the trolley node.
function makeTrolley(box,x1,y1,x2,y2,speed,t0){
  const sx=x1+(x2-x1)*t0, sy=y1+(y2-y1)*t0;
  const ids=makeRope([[sx,sy],harnessPt(box)],{pin:true},{box,mode:'harness'});
  anchorsPts.pop(); // drawn as a trolley carriage instead of a static bolt
  trolleys.push({p:ids[0],x1,y1,x2,y2,t:t0,dir:1,speed});
  return ids;
}
// Rotating anchor (T5): a kinematic pin ORBITING a center each step, swinging the
// crate in a circle — release (cut) at the right orbital angle to fling it
// tangentially. Like a trolley but circular. ang in radians, speed rad/s.
function makeRotor(box,cx,cy,r,ang0,speed){
  const sx=cx+Math.cos(ang0)*r, sy=cy+Math.sin(ang0)*r;
  const ids=makeRope([[sx,sy],harnessPt(box)],{pin:true},{box,mode:'harness'});
  anchorsPts.pop();
  rotors.push({p:ids[0],cx,cy,r,ang:ang0,speed});
  return ids;
}
// Sawblade (T5 hazard): a lethal spinning disc; touching its radius shatters the
// crate. Purely kinematic + a fail check (see collideBox); ang only drives the render.
function makeBlade(cx,cy,r,speed){ blades.push({cx,cy,r,ang:0,speed:speed===undefined?4:speed}); }
// Wind zone (T6): a rect region that adds a constant acceleration (ax,ay in units
// of H, like gravity) to any particle inside — carries the crate somewhere a
// plain drop can't reach. Applied in physCore.
// HORIZONTAL wind scales with W (calibrated to the phone aspect 844/390 so phone
// behavior is byte-IDENTICAL to the old ax*H), making the crate's sideways reach
// a constant fraction of the width at ANY aspect — so wind levels certified on
// iPhone also hold on the squarer iPad (where ax*H died at <half the reach).
// VERTICAL wind keeps ay*H (it should track gravity, which is H-scaled).
const WIND_ASPECT_REF = 844/390;
function makeWind(x,y,w,h,ax,ay){ winds.push({x,y,w,h,ax:ax*W*WIND_ASPECT_REF,ay:(ay||0)*H,t:0}); }
// Magnet (T6): a point that pulls particles with a normalized inverse-square
// force (curves the crate's fall). strength is in gravities AT the reference
// distance 0.25W (so strength≈2 ≈ gravity there); range in W. Applied in physCore.
function makeMagnet(x,y,strength,range){ magnets.push({x,y,s:strength,ref2:(0.25*W)*(0.25*W),range:(range||0.5)*W,soft2:(0.05*W)*(0.05*W)}); }
// Star pickup (objective modifier): the crate must pass through EVERY star before
// the win counts — a routing constraint layerable on any mechanic. Collected when
// a crate corner comes within radius (see doChecks).
function makeStar(x,y){ stars.push({x,y,r:0.05*W,got:false,gotT:-999}); }
// Pulse spikes: extend/retract on a schedule; lethal only while extended.
function spikeExt(sg){
  if(!sg.pulse) return 1;
  const T=stepCount*DT;
  const cp=((T/sg.period+(sg.off||0))%1+1)%1;
  const e=0.12, duty=sg.duty||0.5;
  if(cp<e) return cp/e;
  if(cp<duty-e) return 1;
  if(cp<duty) return Math.max(0,(duty-cp)/e);
  return 0;
}
function spikeActive(sg){ return spikeExt(sg)>0.6; }

function buildLevel(i){
  particles=[]; cons=[]; boxes=[]; segs=[]; pulleys=[]; beams=[]; anchorsPts=[];
  balloons=[]; trolleys=[]; rotors=[]; blades=[]; winds=[]; magnets=[]; stars=[];
  crate=null; decoy=null; basket=null; crackLines=null;
  cutThisLevel=false;
  sparks=[]; confetti=[]; streak=[];
  // Reset the world clock per level so pulse gates start at a FIXED phase every
  // load/retry (they read stepCount*DT). Otherwise the gate sits at a random
  // phase of the global clock each time — the timing a player learns doesn't
  // repeat on retry, and the sim's win windows drift run-to-run. All time-
  // relative state (cutT/popT ages) is recreated in this same buildLevel, so
  // zeroing here is safe. (Lesson: kinematic parts need a level-local clock.)
  phase='play'; phaseTimer=0; slowSteps=0; creakCd=0; stallSteps=0; groundedT=0; magnetHeldT=0; starMissT=0; stepCount=0;
  S=W/7; SP=W/40; G=H*2.0; FLOORY=H*0.985;
  const s=S;
  switch(i){
    case 0:{ // one vertical rope, basket below
      beams.push({x:0.35*W,y:0.028*H,w:0.30*W,h:0.024*H});
      const b=makeBox(0.5*W,0.34*H,s,0.25,'crate');
      makeRope([[0.5*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      setBasket(0.5*W,0.90*H);
    }break;
    case 1:{ // two parallel ropes — ORDER teach: cut the rope AWAY from the
             // basket first (crate tips toward it), then the other to drop in
      beams.push({x:0.5*W-s*0.9,y:0.028*H,w:s*1.8,h:0.024*H});
      const b=makeBox(0.5*W,0.35*H,s,0.25,'crate');
      makeRope([[0.5*W-s*0.5,0.052*H],cornerPos(0.5*W,0.35*H,s,0)],{pin:true},{box:b,mode:'corner',ci:0});
      makeRope([[0.5*W+s*0.5,0.052*H],cornerPos(0.5*W,0.35*H,s,1)],{pin:true},{box:b,mode:'corner',ci:1});
      setBasket(0.5*W+s*0.55,0.90*H);
    }break;
    case 2:{ // pendulum already swinging — release phase
      beams.push({x:0.33*W,y:0.028*H,w:0.24*W,h:0.024*H});
      const b=makeBox(0.75*W,0.28*H,s,0.25,'crate');
      makeRope([[0.45*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      pushBox(b,-0.15*H,0);
      setBasket(0.15*W,0.90*H);
    }break;
    case 3:{ // parallel ropes — tip it sideways into the offset basket. The spike
             // bar hovers under the STRAIGHT-DROP path: it punishes the lazy
             // both-cut specifically; the tip-arc clears it (spikes shape flight,
             // they don't decorate the floor — Qi feedback).
      beams.push({x:0.36*W,y:0.028*H,w:0.28*W,h:0.024*H});
      const cx=0.5*W,cy=0.38*H;
      const b=makeBox(cx,cy,s,0.25,'crate');
      makeRope([[cx-s/2,0.052*H],cornerPos(cx,cy,s,0)],{pin:true},{box:b,mode:'corner',ci:0});
      makeRope([[cx+s/2,0.052*H],cornerPos(cx,cy,s,1)],{pin:true},{box:b,mode:'corner',ci:1});
      segs.push({x1:0.34*W,y1:0.68*H,x2:0.50*W,y2:0.68*H,kind:'spike'});
      setBasket(0.70*W,0.90*H);
    }break;
    case 4:{ // bouncy pad up onto a ledge basket
      beams.push({x:0.17*W,y:0.028*H,w:0.16*W,h:0.024*H});
      const b=makeBox(0.30*W,0.515*H,s,0.25,'crate');
      makeRope([[0.25*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      segs.push({x1:0.10*W,y1:0.70*H,x2:0.58*W,y2:0.765*H,kind:'pad'});
      segs.push({x1:0.555*W,y1:0.676*H,x2:0.805*W,y2:0.676*H,kind:'solid'});
      setBasket(0.68*W,0.673*H);
    }break;
    case 5:{ // three ropes — release order
      beams.push({x:0.24*W,y:0.028*H,w:0.12*W,h:0.024*H});
      beams.push({x:0.49*W,y:0.028*H,w:0.12*W,h:0.024*H});
      beams.push({x:0.955*W,y:0.24*H,w:0.045*W,h:0.08*H});
      const cx=0.62*W,cy=0.35*H;
      const b=makeBox(cx,cy,s,0.25,'crate');
      makeRope([[0.30*W,0.052*H],cornerPos(cx,cy,s,0)],{pin:true},{box:b,mode:'corner',ci:0});
      makeRope([[0.55*W,0.052*H],cornerPos(cx,cy,s,1)],{pin:true},{box:b,mode:'corner',ci:1});
      makeRope([[0.965*W,0.28*H],cornerPos(cx,cy,s,2)],{pin:true},{box:b,mode:'corner',ci:2});
      setBasket(0.22*W,0.90*H);
    }break;
    case 6:{ // swing across to the far basket; wall pad saves overshoots. The
             // spikes sit on a raised mid-gap shelf: weak/early releases clip it,
             // a committed full swing clears it (mid-flight hazard, not floor decor).
      beams.push({x:0.28*W,y:0.028*H,w:0.24*W,h:0.024*H});
      const b=makeBox(0.14*W,0.30*H,s,0.25,'crate');
      makeRope([[0.40*W,0.05*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      pushBox(b,0.05*H,0);
      segs.push({x1:0.30*W,y1:0.66*H,x2:0.58*W,y2:0.66*H,kind:'spike'});
      segs.push({x1:0.985*W,y1:0.32*H,x2:0.985*W,y2:0.78*H,kind:'pad'});
      setBasket(0.83*W,0.90*H);
    }break;
    case 7:{ // counterweight: cut the restraint, then the line
      beams.push({x:0.40*W,y:0.028*H,w:0.20*W,h:0.024*H});
      beams.push({x:0.74*W,y:0.393*H,w:0.24*W,h:0.022*H});
      const pr=0.035*W;
      pulleys.push({x:0.5*W,y:0.09*H,r:pr});
      const b=makeBox(0.32*W,0.30*H,s,0.25,'crate');
      const d=makeBox(0.82*W,0.52*H,s*0.95,0.0625,'decoy');
      makeRope([harnessPt(b),[0.5*W,0.09*H-pr-4],harnessPt(d)],
        {box:b,mode:'harness'},{box:d,mode:'harness'});
      makeRope([[0.86*W,0.418*H],cornerPos(0.82*W,0.52*H,s*0.95,1)],
        {pin:true},{box:d,mode:'corner',ci:1});
      // The authored tableau is NOT a physical equilibrium: a crate hanging on
      // a DIAGONAL line always pendulums toward plumb-under-the-pulley (which
      // sits over the basket and would let a single line-cut win), and solving
      // tension through the free 4x-mass decoy makes the whole thing a perpetual
      // bungee — reproduced in the pristine reference. So the assembly is FROZEN
      // (crate + decoy pinned) until the level's first cut (see cutSegment):
      // visually identical to a static hang, and the first cut releases the
      // designed dynamics — restraint → decoy falls and hauls the crate to the
      // pulley; line → the crate drops onto the spikes below it.
      for(const ii of b.idx) particles[ii].im=0;
      b.lockedIm=0.25;
      for(const ii of d.idx) particles[ii].im=0;
      d.lockedIm=0.0625;
      // released decoy falls at a heavy winch-like terminal speed — a free-fall
      // decoy outruns the 10-iteration rope solver (the line solver-stretches
      // instead of hauling, the decoy floors, and the crate swings off slack)
      d.haulDamp=0.95;
      segs.push({x1:0.74*W,y1:0.415*H,x2:0.98*W,y2:0.415*H,kind:'solid'});
      // Cutting the LINE first drops the crate in a straight plummet around
      // 0.32W (it tumbles, so corners span ~0.22-0.42W); the winning restraint-
      // first haul lifts it up-and-right immediately (never below 0.39H until
      // x>0.50W). So the spike sits MID-FALL at 0.52H, not on the floor — the
      // wrong cut is impaled in the air, the haul clears it (a floor spike only
      // caught a crate that had already plummeted).
      segs.push({x1:0.10*W,y1:0.52*H,x2:0.48*W,y2:0.52*H,kind:'spike'});
      setBasket(0.53*W,0.90*H);
    }break;
    case 8:{ // BALLOON intro — the balloon floats the crate up; pop it to drop into the basket
      const b=makeBox(0.5*W,0.44*H,s,0.25,'crate');
      makeBalloon(b,0.14*H,6.0,s*0.5);
      setBasket(0.5*W,0.90*H);
    }break;
    case 9:{ // BALLOON develop — tethered float-SWING: the buoyant pair pendulums
             // up around the low anchor; pop at the arc's apex over the basket.
             // The tether is a LIGHT line (im 8): at rope mass 1/node its ~27
             // nodes outweigh the pair's lift margin and sink it (same engine
             // truth as the severed-tail lesson). Lift 8 keeps the swing lively.
      beams.push({x:0.44*W,y:0.86*H,w:0.12*W,h:0.024*H});
      const b=makeBox(0.30*W,0.52*H,s,0.25,'crate');
      makeBalloon(b,0.14*H,8.0,s*0.5);
      const tid=makeRope([[0.5*W,0.86*H],cornerPos(0.30*W,0.52*H,s,3)],{pin:true},{box:b,mode:'corner',ci:3});
      for(let ti=1;ti<tid.length;ti++) particles[tid[ti]].im=8;
      // The buoyant pair floats/swings at ~0.43-0.52H; pop at the arc's apex over
      // the basket (right). An EARLY pop drops the crate through the LEFT region
      // — a raised mid-flight shelf shreds it there while it sits well below the
      // pair's float line so the swing never touches it (a floor spike only
      // caught an already-missed crate — the L14/L15 lesson, applied to a pop).
      segs.push({x1:0.08*W,y1:0.70*H,x2:0.44*W,y2:0.70*H,kind:'spike'});
      setBasket(0.68*W,0.90*H);
    }break;
    case 10:{ // BALLOON spectacle — pop; a SHORT fall onto a nearly-flat pad lobs
              // the crate across into the basket. The pair must START above the
              // pad line: rising through a pad from below trampolines it away.
      const b=makeBox(0.26*W,0.30*H,s,0.25,'crate');
      makeBalloon(b,0.14*H,6.0,s*0.5);
      segs.push({x1:0.10*W,y1:0.46*H,x2:0.44*W,y2:0.482*H,kind:'pad'});
      // Breather: the pad LOB is the spectacle and a short lob just thuds and
      // retries — the old floor spike here only punished an already-missed lob
      // (fake stakes). Removed; the pad + basket carry the level.
      setBasket(0.72*W,0.90*H);
    }break;
    case 11:{ // BALLOON twist — spiked rafters: rising is NOT safe here; pop in time.
              // The CEILING spike is the whole point ("rising kills"); a well-timed
              // pop drops straight into the basket below. The old flanking FLOOR
              // spikes only caught a drift that had already missed — removed (the
              // ceiling twist is the hazard; a drift just thuds and retries).
      segs.push({x1:0.72*W,y1:0.14*H,x2:0.28*W,y2:0.14*H,kind:'spike'}); // points DOWN
      const b=makeBox(0.5*W,0.70*H,s,0.25,'crate');
      makeBalloon(b,0.14*H,6.0,s*0.5);
      setBasket(0.5*W,0.90*H);
    }break;
    case 12:{ // MOVING ANCHOR (trolley) intro — cut when the swinging crate is over the basket
      const b=makeBox(0.5*W,0.44*H,s,0.25,'crate');
      makeTrolley(b,0.20*W,0.13*H,0.80*W,0.13*H,0.34,0.5);
      setBasket(0.5*W,0.90*H);
    }break;
    case 13:{ // TROLLEY develop — faster patrol, offset basket beyond the rail.
              // The winning release rides the carriage RIGHT and arcs into the
              // far basket (every winning trajectory lives at x>=0.48W); a lazy/
              // early cut dumps the crate into the LEFT half. So the spikes are a
              // raised MID-FLIGHT shelf on the left — an impatient drop is shredded
              // in the air, the committed ride clears it (floor spikes only ever
              // caught an already-missed crate — Qi: "cutter feels meaningless").
      const b=makeBox(0.22*W,0.44*H,s,0.25,'crate');
      makeTrolley(b,0.15*W,0.13*H,0.72*W,0.13*H,0.45,0.1);
      segs.push({x1:0.07*W,y1:0.70*H,x2:0.44*W,y2:0.70*H,kind:'spike'});
      setBasket(0.84*W,0.90*H);
    }break;
    case 14:{ // TROLLEY twist — DIAGONAL rail: swing and drop height vary together.
              // Winners release near the low-right end (all wins at x>=0.54W); an
              // early release off the high-left end falls through the left region.
              // Raised mid-flight shelf on the left punishes that (see case 13).
      const b=makeBox(0.28*W,0.42*H,s,0.25,'crate');
      makeTrolley(b,0.20*W,0.10*H,0.70*W,0.35*H,0.40,0.15);
      segs.push({x1:0.07*W,y1:0.70*H,x2:0.46*W,y2:0.70*H,kind:'spike'});
      setBasket(0.82*W,0.90*H);
    }break;
    case 15:{ // PULSE SPIKES intro — drop through the gate while it's retracted
      beams.push({x:0.40*W,y:0.028*H,w:0.20*W,h:0.024*H});
      const b=makeBox(0.5*W,0.30*H,s,0.25,'crate');
      makeRope([[0.5*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      segs.push({x1:0.10*W,y1:0.62*H,x2:0.90*W,y2:0.62*H,kind:'spike',pulse:true,period:1.5,duty:0.5,off:0});
      setBasket(0.5*W,0.90*H);
    }break;
    case 16:{ // PULSE develop — pendulum × gate: the swing AND the beat must agree
      beams.push({x:0.33*W,y:0.028*H,w:0.24*W,h:0.024*H});
      const b=makeBox(0.75*W,0.28*H,s,0.25,'crate');
      makeRope([[0.45*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      pushBox(b,-0.15*H,0);
      // FAST gate (0.8s): a ~1.5s gate nearly matches the pendulum period, so
      // good alignments recur only every ~24s — a frustration trap. Duty 0.35 =
      // open ~65%: the skill is the SWING release; the gate adds rhythm, not a
      // precision wall (insight must win — research rule).
      segs.push({x1:0.02*W,y1:0.62*H,x2:0.42*W,y2:0.62*H,kind:'spike',pulse:true,period:0.8,duty:0.35,off:0});
      setBasket(0.15*W,0.90*H);
    }break;
    case 17:{ // PULSE twist — two gates in anti-phase; thread the beat
      beams.push({x:0.40*W,y:0.028*H,w:0.20*W,h:0.024*H});
      const b=makeBox(0.5*W,0.26*H,s,0.25,'crate');
      makeRope([[0.5*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      segs.push({x1:0.15*W,y1:0.50*H,x2:0.85*W,y2:0.50*H,kind:'spike',pulse:true,period:1.5,duty:0.45,off:0});
      segs.push({x1:0.15*W,y1:0.70*H,x2:0.85*W,y2:0.70*H,kind:'spike',pulse:true,period:1.5,duty:0.45,off:0.15});
      setBasket(0.5*W,0.92*H);
    }break;
    case 18:{ // BALLOON + PULSE — pop it to fall through the gate when it opens
      const b=makeBox(0.5*W,0.42*H,s,0.25,'crate');
      makeBalloon(b,0.14*H,6.0,s*0.5);
      segs.push({x1:0.15*W,y1:0.66*H,x2:0.85*W,y2:0.66*H,kind:'spike',pulse:true,period:1.5,duty:0.45,off:0.1});
      setBasket(0.5*W,0.92*H);
    }break;
    case 19:{ // FINALE — a floating pair rides a trolley tether: cut at the right
              // spot, then pop on the gate's beat. Everything you've learned, once.
      const railY=0.30*H;
      const b=makeBox(0.5*W,railY-0.16*H,s,0.25,'crate');
      makeBalloon(b,0.12*H,6.0,s*0.5);
      // tether from the trolley UP to the floating crate's bottom corner — the
      // rope's distance limit holds the buoyant pair, tracking the carriage
      const ids=makeRope([[0.24*W,railY],cornerPos(0.5*W,railY-0.16*H,s,3)],{pin:true},{box:b,mode:'corner',ci:3});
      anchorsPts.pop();
      trolleys.push({p:ids[0],x1:0.22*W,y1:railY,x2:0.78*W,y2:railY,t:0.05,dir:1,speed:0.30});
      // The PULSE GATE is the finale's real hazard — cut at the right trolley
      // phase, pop on the gate's open beat and drop through into the basket. The
      // old flanking FLOOR spikes only caught a drop that had already missed the
      // basket (fake stakes); removed so the gate carries the climax.
      segs.push({x1:0.18*W,y1:0.58*H,x2:0.82*W,y2:0.58*H,kind:'spike',pulse:true,period:1.5,duty:0.5,off:0});
      setBasket(0.5*W,0.90*H);
    }break;
    case 20:{ // ROTOR intro — the anchor ORBITS a hub; the crate swings in a
              // circle. Cut when it swings over the basket to drop it in.
      const cx=0.5*W, cy=0.27*H;
      const b=makeBox(cx,cy+0.26*H,s,0.25,'crate');
      makeRotor(b,cx,cy,0.12*W,Math.PI/2,1.5);
      setBasket(0.5*W,0.90*H);
    }break;
    case 21:{ // ELASTIC intro — the crate bounces on a stretchy cord; cut it at
              // the bottom of a bounce (moving up) to fling the crate up-and-over
              // into the basket. Timing teach: the cord stores energy, the cut
              // releases it. (GEOMETRY UNDER TUNING — probing launch landing.)
      beams.push({x:0.60*W,y:0.03*H,w:0.20*W,h:0.024*H});
      const b=makeBox(0.34*W,0.60*H,s,0.25,'crate');
      makeElasticRope([[0.66*W,0.055*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'},{stiff:0.16,restScale:0.66});
      setBasket(0.70*W,0.90*H);
    }break;
    case 22:{ // MAGNET intro — the crate falls past a magnet that curves its path
              // sideways into the offset basket.
      beams.push({x:0.40*W,y:0.03*H,w:0.16*W,h:0.024*H});
      const b=makeBox(0.44*W,0.27*H,s,0.25,'crate');
      makeRope([[0.44*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeMagnet(0.72*W,0.54*H,2.2,0.55);
      setBasket(0.74*W,0.90*H);
    }break;
    case 23:{ // ROTOR develop — faster orbit + an OFFSET basket: release on the
              // swing so momentum flings the crate sideways into it.
      const cx=0.40*W, cy=0.30*H;
      const b=makeBox(cx,cy+0.24*H,s,0.25,'crate');
      makeRotor(b,cx,cy,0.14*W,Math.PI/2,2.2);
      setBasket(0.74*W,0.90*H);
    }break;
    case 24:{ // MAGNET mirror — the pull curves the crate the other way.
      beams.push({x:0.50*W,y:0.03*H,w:0.16*W,h:0.024*H});
      const b=makeBox(0.54*W,0.27*H,s,0.25,'crate');
      makeRope([[0.54*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeMagnet(0.26*W,0.54*H,2.2,0.55);
      setBasket(0.24*W,0.90*H);
    }break;
    case 25:{ // WIND intro — cut the rope; the crate drops into a rightward gale
              // that carries it across into a basket a straight drop would miss.
      beams.push({x:0.20*W,y:0.03*H,w:0.16*W,h:0.024*H});
      const b=makeBox(0.26*W,0.27*H,s,0.25,'crate');
      makeRope([[0.26*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeWind(0.20*W,0.42*H,0.64*W,0.40*H,3.2,0);
      setBasket(0.74*W,0.90*H);
    }break;
    case 26:{ // STAR intro — grab the star on the way down before landing home.
      beams.push({x:0.42*W,y:0.03*H,w:0.16*W,h:0.024*H});
      const b=makeBox(0.5*W,0.30*H,s,0.25,'crate');
      makeRope([[0.5*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeStar(0.5*W,0.62*H);
      setBasket(0.5*W,0.90*H);
    }break;
    case 27:{ // ELASTIC × PULSE twist — the cord flings the crate through a timed
              // GATE: two timings compose — release on the bounce AND when the
              // gate is open, or the fling is shredded. (first elastic combo.)
      beams.push({x:0.50*W,y:0.03*H,w:0.20*W,h:0.024*H});
      const b=makeBox(0.20*W,0.62*H,s,0.25,'crate');
      makeElasticRope([[0.54*W,0.05*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'},{stiff:0.15,restScale:0.54});
      segs.push({x1:0.56*W,y1:0.48*H,x2:0.56*W,y2:0.90*H,kind:'spike',pulse:true,period:1.4,duty:0.5,off:0}); // VERTICAL gate/doorway
      setBasket(0.84*W,0.90*H);
    }break;
    case 28:{ // MAGNET × GATE — the pull curves the fall through a VERTICAL pulse
              // gate on the way to the basket: cut so the curve arrives on the
              // open beat. Horseshoe + vertical gate bar = visually unmistakable,
              // and the timing is legible. (was a plain left-curve clone of L32 —
              // Qi spotted it. Tried and cut along the way: a two-magnet S-curve —
              // a second in-range magnet either captures or slingshots, there is
              // no "gentle nudge" regime in an inverse-square pull — and a blade,
              // which the fat curving sweep of the crate can't safely pass.)
      beams.push({x:0.44*W,y:0.03*H,w:0.14*W,h:0.024*H});
      const b=makeBox(0.52*W,0.23*H,s,0.25,'crate');
      makeRope([[0.52*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeMagnet(0.26*W,0.54*H,2.2,0.55); // L32's proven pull numbers
      segs.push({x1:0.38*W,y1:0.55*H,x2:0.38*W,y2:0.90*H,kind:'spike',pulse:true,period:1.5,duty:0.45,off:0});
      setBasket(0.24*W,0.90*H);
    }break;
    case 29:{ // ROTOR × SAWBLADE twist — a spinning blade waits below the orbit;
              // an early/wrong release drops the crate onto it — time the fling to
              // arc past it into the offset basket.
      const cx=0.40*W, cy=0.30*H;
      const b=makeBox(cx,cy+0.24*H,s,0.25,'crate');
      makeRotor(b,cx,cy,0.14*W,Math.PI/2,2.2);
      makeBlade(0.40*W,0.66*H,0.07*W,5);
      setBasket(0.74*W,0.90*H);
    }break;
    case 30:{ // UPDRAFT — a gentle up-and-right draft lofts the crate across a
              // longer hang than the flat gales. (gentle-carry rule)
      beams.push({x:0.16*W,y:0.03*H,w:0.14*W,h:0.024*H});
      const b=makeBox(0.22*W,0.30*H,s,0.25,'crate');
      makeRope([[0.22*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeWind(0.16*W,0.36*H,0.66*W,0.44*H,1.5,-0.5);
      setBasket(0.66*W,0.90*H);
    }break;
    case 31:{ // MAGNET × SWING — a pendulum crate + a magnet: the pull bends the
              // release arc; time the cut so the curve lands home.
      beams.push({x:0.28*W,y:0.03*H,w:0.16*W,h:0.024*H});
      const b=makeBox(0.62*W,0.24*H,s,0.25,'crate');
      makeRope([[0.32*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      pushBox(b,-0.14*H,0);
      makeMagnet(0.72*W,0.60*H,1.8,0.55);
      setBasket(0.72*W,0.90*H);
    }break;
    case 32:{ // TWO STARS — grab both on the straight drop before landing.
      beams.push({x:0.42*W,y:0.03*H,w:0.16*W,h:0.024*H});
      const b=makeBox(0.5*W,0.24*H,s,0.25,'crate');
      makeRope([[0.5*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeStar(0.5*W,0.50*H); makeStar(0.5*W,0.70*H);
      setBasket(0.5*W,0.90*H);
    }break;
    case 33:{ // ELASTIC mirror — the cord flings the crate LEFT into the basket.
      beams.push({x:0.20*W,y:0.03*H,w:0.20*W,h:0.024*H});
      const b=makeBox(0.66*W,0.60*H,s,0.25,'crate');
      makeElasticRope([[0.34*W,0.055*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'},{stiff:0.16,restScale:0.66});
      setBasket(0.30*W,0.90*H);
    }break;
    case 34:{ // MAGNET × spike — the pull curves you clear of a spike that sits
              // under the straight drop. (Magnet strong enough that ANY cut
              // height clears — cut height must never silently decide; Qi hit
              // the shallow-curve miss on device.)
      beams.push({x:0.46*W,y:0.03*H,w:0.14*W,h:0.024*H});
      const b=makeBox(0.5*W,0.25*H,s,0.25,'crate');
      makeRope([[0.5*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeMagnet(0.74*W,0.56*H,2.3,0.65);
      // under the STRAIGHT-DROP line: without the magnet's pull you'd land here
      // (meaningful-spike rule) — the curve clears its right edge with margin
      segs.push({x1:0.34*W,y1:0.66*H,x2:0.50*W,y2:0.66*H,kind:'spike'});
      setBasket(0.76*W,0.90*H);
    }break;
    case 35:{ // WIND × PULSE — ride the gale across, but the gate must be open.
      beams.push({x:0.16*W,y:0.03*H,w:0.14*W,h:0.024*H});
      const b=makeBox(0.22*W,0.24*H,s,0.25,'crate');
      makeRope([[0.22*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeWind(0.16*W,0.40*H,0.66*W,0.44*H,3.4,0);
      segs.push({x1:0.56*W,y1:0.40*H,x2:0.56*W,y2:0.86*H,kind:'spike',pulse:true,period:1.5,duty:0.5,off:0});
      setBasket(0.78*W,0.90*H);
    }break;
    case 36:{ // WIND × star — ride the gale through a star into the basket.
              // (gentle-carry rule: soft gravity + soft gale = readable arc;
              // hot arrivals ricochet off the basket and read as unfair)
      G=H*1.5;
      beams.push({x:0.18*W,y:0.03*H,w:0.14*W,h:0.024*H});
      const b=makeBox(0.24*W,0.26*H,s,0.25,'crate');
      makeRope([[0.24*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeWind(0.18*W,0.36*H,0.62*W,0.42*H,1.3,0);
      makeStar(0.42*W,0.62*H);
      setBasket(0.60*W,0.90*H);
    }break;
    case 37:{ // ROTOR mirror-slow — a gentle reverse orbit to a left basket.
      const cx=0.62*W, cy=0.29*H;
      const b=makeBox(cx,cy+0.24*H,s,0.25,'crate');
      makeRotor(b,cx,cy,0.13*W,Math.PI/2,-2.0);
      setBasket(0.28*W,0.90*H);
    }break;
    case 38:{ // MAGNET × LEDGE — a solid shelf sits under the straight drop: cut
              // cold and the crate cracks on it; the pull carries you past its
              // edge into the far basket. Shelf + horseshoe = visually distinct
              // from the bare-curve levels (L31 sibling de-dup).
      beams.push({x:0.40*W,y:0.03*H,w:0.14*W,h:0.024*H});
      const b=makeBox(0.44*W,0.27*H,s,0.25,'crate'); // L31's exact start — 0.03H higher tips the curve into flyby chaos
      makeRope([[0.44*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeMagnet(0.72*W,0.54*H,2.2,0.55); // the proven smooth right-curve
      // horizontal gate under the curve's descent: arrive on the open beat.
      // (a solid ledge was tried and cut — solids + magnet curves = ricochet
      // chaos; gates kill cleanly, no bounce)
      segs.push({x1:0.50*W,y1:0.72*H,x2:0.90*W,y2:0.72*H,kind:'spike',pulse:true,period:1.5,duty:0.45,off:0});
      setBasket(0.74*W,0.90*H);
    }break;
    case 39:{ // STAR × pendulum — the star hangs in the swing path; release so the
              // crate sweeps through it into the far basket.
      beams.push({x:0.33*W,y:0.028*H,w:0.24*W,h:0.024*H});
      const b=makeBox(0.75*W,0.28*H,s,0.25,'crate');
      makeRope([[0.45*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      pushBox(b,-0.15*H,0);
      makeStar(0.32*W,0.66*H);
      setBasket(0.15*W,0.90*H);
    }break;
    case 40:{ // MAGNET × 2 stars — the curve threads both on its way home.
      beams.push({x:0.44*W,y:0.03*H,w:0.14*W,h:0.024*H});
      const b=makeBox(0.48*W,0.25*H,s,0.25,'crate');
      makeRope([[0.48*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeMagnet(0.74*W,0.56*H,2.2,0.62);
      makeStar(0.60*W,0.46*H); makeStar(0.70*W,0.68*H);
      setBasket(0.74*W,0.90*H);
    }break;
    case 41:{ // TROLLEY diagonal mirror.
      const b=makeBox(0.72*W,0.42*H,s,0.25,'crate');
      makeTrolley(b,0.80*W,0.10*H,0.30*W,0.35*H,0.40,0.15);
      setBasket(0.18*W,0.90*H);
    }break;
    case 42:{ // MAGNET far — a long cross-field pull to the far corner.
      beams.push({x:0.66*W,y:0.03*H,w:0.14*W,h:0.024*H});
      // TROLLEY × MAGNET — ride the rail, cut over the pull: the magnet curves
      // your drop into the corner basket. Rail + horseshoe = distinct tableau,
      // and the timing is visible. (The old cross-field magnet reel had NO
      // stable regime — any strength that crosses the field is flyby chaos;
      // ceiling-thread / hover-beacon / star-trail variants all tried and cut.)
      const b=makeBox(0.30*W,0.42*H,s,0.25,'crate');
      makeTrolley(b,0.20*W,0.13*H,0.80*W,0.13*H,0.34,0.2);
      makeMagnet(0.26*W,0.62*H,2.2,0.55);
      setBasket(0.24*W,0.90*H);
    }break;
    case 43:{ // TWO STARS × tip — tip the crate through two stars into the basket.
      beams.push({x:0.36*W,y:0.028*H,w:0.28*W,h:0.024*H});
      const cx=0.5*W,cy=0.38*H; const b=makeBox(cx,cy,s,0.25,'crate');
      makeRope([[cx-s/2,0.052*H],cornerPos(cx,cy,s,0)],{pin:true},{box:b,mode:'corner',ci:0});
      makeRope([[cx+s/2,0.052*H],cornerPos(cx,cy,s,1)],{pin:true},{box:b,mode:'corner',ci:1});
      makeStar(0.5*W,0.58*H); makeStar(0.5*W,0.74*H);
      setBasket(0.5*W,0.90*H);
    }break;
    case 44:{ // TROLLEY revisit — a mid-speed patrol to an offset basket + star.
      const b=makeBox(0.30*W,0.42*H,s,0.25,'crate');
      makeTrolley(b,0.18*W,0.13*H,0.74*W,0.13*H,0.40,0.2);
      makeStar(0.5*W,0.62*H);
      setBasket(0.80*W,0.90*H);
    }break;
    case 45:{ // WIND × GATE mirror — ride the leftward gale through the doorway.
      beams.push({x:0.82*W,y:0.03*H,w:0.14*W,h:0.024*H});
      const b=makeBox(0.78*W,0.24*H,s,0.25,'crate');
      makeRope([[0.78*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeWind(0.18*W,0.40*H,0.66*W,0.44*H,-3.4,0);
      segs.push({x1:0.44*W,y1:0.40*H,x2:0.44*W,y2:0.86*H,kind:'spike',pulse:true,period:1.5,duty:0.5,off:0});
      setBasket(0.22*W,0.90*H);
    }break;
    case 46:{ // DOUBLE GATE 2 — two staggered gates, tighter windows.
      beams.push({x:0.40*W,y:0.028*H,w:0.20*W,h:0.024*H});
      const b=makeBox(0.5*W,0.22*H,s,0.25,'crate');
      makeRope([[0.5*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      // TRIPLE gauntlet — three short staggered gates (was a two-full-gate clone
      // of L59); visibly "the gauntlet", a late-campaign capstone
      segs.push({x1:0.24*W,y1:0.46*H,x2:0.76*W,y2:0.46*H,kind:'spike',pulse:true,period:1.6,duty:0.4,off:0});
      segs.push({x1:0.30*W,y1:0.62*H,x2:0.70*W,y2:0.62*H,kind:'spike',pulse:true,period:1.6,duty:0.4,off:0.33});
      segs.push({x1:0.36*W,y1:0.78*H,x2:0.64*W,y2:0.78*H,kind:'spike',pulse:true,period:1.6,duty:0.4,off:0.66});
      setBasket(0.5*W,0.92*H);
    }break;
    case 47:{ // STAGGERED HALF-GATES — a left half-gate up high, a right half-gate
              // below, anti-phase: the drop weaves the staircase. (was a full-gate
              // clone)
      beams.push({x:0.30*W,y:0.028*H,w:0.20*W,h:0.024*H});
      const b=makeBox(0.40*W,0.26*H,s,0.25,'crate');
      makeRope([[0.40*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      segs.push({x1:0.10*W,y1:0.50*H,x2:0.52*W,y2:0.50*H,kind:'spike',pulse:true,period:1.6,duty:0.42,off:0});
      segs.push({x1:0.30*W,y1:0.70*H,x2:0.72*W,y2:0.70*H,kind:'spike',pulse:true,period:1.6,duty:0.42,off:0.5});
      setBasket(0.40*W,0.90*H);
    }break;
    case 48:{ // HEAVY GRAVITY, LOW HANG — the crate dangles just above a short,
              // fast gate: a snap drop with a razor window. Visually a compressed
              // bottom-half tableau, nothing like the high full-gate drops.
      G=H*2.7;
      beams.push({x:0.40*W,y:0.36*H,w:0.20*W,h:0.024*H});
      const b=makeBox(0.5*W,0.56*H,s,0.25,'crate');
      makeRope([[0.5*W,0.384*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      segs.push({x1:0.32*W,y1:0.74*H,x2:0.68*W,y2:0.74*H,kind:'spike',pulse:true,period:1.1,duty:0.45,off:0});
      setBasket(0.5*W,0.90*H);
    }break;
    case 49:{ // TIP-ORDER × gate — two ropes; tip toward the offset basket, then
              // drop the second rope through a NARROW gate on the beat. (was a
              // straight-drop full-gate clone of L16 — Qi spotted the dup)
      beams.push({x:0.5*W-s*0.9,y:0.028*H,w:s*1.8,h:0.024*H});
      const cx=0.5*W,cy=0.34*H; const b=makeBox(cx,cy,s,0.25,'crate');
      makeRope([[cx-s/2,0.052*H],cornerPos(cx,cy,s,0)],{pin:true},{box:b,mode:'corner',ci:0});
      makeRope([[cx+s/2,0.052*H],cornerPos(cx,cy,s,1)],{pin:true},{box:b,mode:'corner',ci:1});
      segs.push({x1:0.48*W,y1:0.62*H,x2:0.82*W,y2:0.62*H,kind:'spike',pulse:true,period:1.5,duty:0.45,off:0});
      setBasket(0.64*W,0.90*H);
    }break;
    case 50:{ // DIAGONAL GATE — a slanted pulse bar across the field; the drop
              // threads it on the beat. A tilted strip reads nothing like the
              // flat gates. (was a full-gate clone of L16 — Qi spotted the dups)
      beams.push({x:0.40*W,y:0.028*H,w:0.20*W,h:0.024*H});
      const b=makeBox(0.5*W,0.24*H,s,0.25,'crate');
      makeRope([[0.5*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      segs.push({x1:0.14*W,y1:0.50*H,x2:0.86*W,y2:0.68*H,kind:'spike',pulse:true,period:1.6,duty:0.42,off:0});
      setBasket(0.5*W,0.90*H);
    }break;
    case 51:{ // MAGNET × spike × star — curve clear of the spike, grab the star.
              // (retuned like L54: strong enough that any cut height clears)
      beams.push({x:0.46*W,y:0.03*H,w:0.14*W,h:0.024*H});
      const b=makeBox(0.5*W,0.24*H,s,0.25,'crate');
      makeRope([[0.5*W,0.052*H],harnessPt(b)],{pin:true},{box:b,mode:'harness'});
      makeMagnet(0.80*W,0.50*H,3.2,0.72);
      makeStar(0.66*W,0.52*H);
      segs.push({x1:0.38*W,y1:0.66*H,x2:0.54*W,y2:0.66*H,kind:'spike'});
      setBasket(0.80*W,0.90*H);
    }break;
    case 52:{ // FINALE (L100) — a fast orbit threaded past the blade to the far
              // corner: everything you've mastered, one clean release.
      const cx=0.46*W, cy=0.26*H; const b=makeBox(cx,cy+0.22*H,s,0.25,'crate');
      makeRotor(b,cx,cy,0.15*W,Math.PI/2,2.6);
      makeBlade(0.46*W,0.62*H,0.075*W,6);
      setBasket(0.82*W,0.90*H);
    }break;
  }
  segs.push({x1:-0.5*W,y1:FLOORY,x2:1.5*W,y2:FLOORY,kind:'floor'});
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
      if(sg.kind==='floor'||sg.kind==='spike'){
        if(sg.kind==='spike'&&sg.pulse&&!spikeActive(sg)){ /* retracted: harmless */ }
        else if(isCrate&&!settling){
          if(sg.kind==='spike'){ // spikes: instant death
            if(phase==='play'&&hitSeg(p,r,sg)){ failLevel(sg.kind); return; }
          }else{ // bare floor: survivable thud — the crate cracks after a beat
            // (a lethal-everywhere floor made spike placement meaningless)
            if(resolveSeg(p,r,sg,0.15,0.7)) crateGrounded=true;
          }
        }else{
          resolveSeg(p,r,sg,0.15,0.7);
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
        if(sg.kind==='floor'||sg.kind==='spike'){
          if(sg.kind==='spike'&&sg.pulse&&!spikeActive(sg)){ /* retracted */ }
          else if(isCrate&&!settling){
            if(sg.kind==='spike'){ if(phase==='play'&&hitSeg(m,r,sg)){ failLevel(sg.kind); return; } }
            else{ if(resolveSeg(m,r,sg,0.15,0.7)) crateGrounded=true; }
          }
          else resolveSeg(m,r,sg,0.15,0.7);
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
let crateGrounded=false, groundedT=0; // bare-floor contact → delayed crack (see collideBox)
// Is the crate genuinely SUSPENDED from above by a taut, uncut rope (a hang the
// player can still cut to progress) — vs perched / balanced / rested (stuck)? The
// stall watchdog uses this instead of a height guard: a crate rested on a HIGH
// ledge or balanced below a pulley has no taut up-rope, so it's caught; a real
// hang (pre-cut, or an intermediate hang between cuts) is not (no false-fire).
function crateSuspended(){
  if(!crate) return false;
  const cset=crate.idx;
  for(const c of cons){
    if(c.cut||c.type!=='rope') continue;
    const aIn=cset.indexOf(c.a)>=0, bIn=cset.indexOf(c.b)>=0;
    if(aIn===bIn) continue; // both-crate diagonal or neither — not a suspending line
    const cp=aIn?c.a:c.b, op=aIn?c.b:c.a;
    const a=particles[cp], o=particles[op];
    // other end meaningfully HIGHER and the link ~taut → the crate hangs from it
    if(o.y < a.y - crate.side*0.25 && Math.hypot(o.x-a.x,o.y-a.y) > c.rest*0.85) return true;
  }
  return false;
}
function collideAll(){
  crateGrounded=false;
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
  for(const bl of balloons){
    if(bl.popped) continue;
    const p=particles[bl.p];
    if(p.y<0.085*H){ p.y=0.085*H; if(p.py<p.y) p.py=p.y; }
  }
}
function inBasket(p){
  const b=basket;
  return p.x>b.x-b.iw/2+3 && p.x<b.x+b.iw/2-3 &&
         p.y>b.yb-b.wh-S*0.35 && p.y<b.yb+5;
}
let stallSteps=0, magnetHeldT=0, starMissT=0;
function doChecks(){
  if(!crate) return;
  const c=boxCenter(crate);
  if(c.x<-S||c.x>W+S||c.y>H+2*S){ failLevel('off'); return; }
  // magnet CAPTURE watchdog (T6): a magnet is an attractor, so it can trap the
  // crate in a slow decaying orbit / jitter it against the core forever (speed
  // never stays below the settle threshold → the stall watchdog can't latch; the
  // crate never reaches the basket → dead-end, hit on device L35). Proximity+time
  // instead of speed: if the crate lingers within ~0.15W of a magnet without
  // winning, it's captured → soft-reset. A crate merely FALLING PAST a magnet
  // clears the radius in well under this window.
  if(magnets.length){
    let near=false; for(const mg of magnets){ if((c.x-mg.x)*(c.x-mg.x)+(c.y-mg.y)*(c.y-mg.y) < (0.15*W)*(0.15*W)){ near=true; break; } }
    if(near) magnetHeldT++; else magnetHeldT=0;
    if(magnetHeldT>=300){ failLevel('stall'); return; }
  }
  // sawblade (T5): any crate corner inside a spinning blade's disc shatters it
  if(blades.length){
    const br=crate.side*0.18;
    for(const i of crate.idx){ const p=particles[i];
      for(const bl of blades){ const dx=p.x-bl.cx, dy=p.y-bl.cy; if(dx*dx+dy*dy<(bl.r+br)*(bl.r+br)){ failLevel('blade'); return; } }
    }
  }
  // star pickups (objective): collect when a crate corner passes within radius
  if(stars.length){
    for(const st of stars){ if(st.got) continue;
      for(const i of crate.idx){ const p=particles[i]; const dx=p.x-st.x, dy=p.y-st.y; if(dx*dx+dy*dy<(st.r+crate.side*0.3)*(st.r+crate.side*0.3)){ st.got=true; st.gotT=stepCount; if(!settling) playPlopChime(); break; } }
    }
  }
  // bare-floor landing: the crate survives the thud, then cracks after a beat
  if(crateGrounded) groundedT++; else groundedT=0;
  if(groundedT>=48){ failLevel('floor'); return; }
  if(basket){
    let all=true, sp2=0;
    for(const i of crate.idx){
      const p=particles[i];
      if(!inBasket(p)) all=false;
      sp2+=Math.hypot(p.x-p.px,p.y-p.py)/DT;
    }
    sp2/=4;
    const starsDone=stars.every(s=>s.got); // must collect every star before the win counts
    if(all&&sp2<0.25*H&&starsDone) slowSteps++; else slowSteps=0;
    if(slowSteps>=36) winLevel();
    // STAR-MISS dead-end (hit on device L43): the crate settled INSIDE the basket
    // with stars uncollected — the win is gated on stars so it never fires, and
    // the stall watchdog is guarded by !all so it can't fire either → permanent
    // 'play'. A crate at rest in the basket can never collect anything, so the
    // run is decided: fail → retry after a readable beat.
    if(stars.length&&all&&sp2<0.05*H&&!starsDone) starMissT++; else starMissT=0;
    if(starMissT>=90){ failLevel('stall'); return; }
    // stall watchdog: crate settled somewhere that is neither basket nor floor
    // (e.g. perched on the basket rim) — soft-reset so the level can't dead-end.
    // Threshold is 0.05*H (reference used 0.02*H, which sits BELOW the sim's
    // contact-jitter noise floor: gravity alone re-injects G*DT^2 = 0.0167*H px/s
    // per step, and a tilted rim-perch with a severed-rope remnant attached rocks
    // at 17-30px/s forever — the watchdog never fired and the level dead-ended
    // on device). 0.05*H is still 5x below the win threshold. Once the player has
    // cut this level, a settled crate that is NOT suspended by a taut up-rope is
    // stuck — perched on a rim (original bug), rested on a HIGH ledge, or balanced
    // below a pulley (L8, hit on device). A genuine hang (pre-cut, or an
    // intermediate hang between cuts) IS suspended, so it never false-fires.
    if(!all&&sp2<0.05*H&&cutThisLevel&&!crateSuspended()) stallSteps++; else stallSteps=0;
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
/* ============================== ending ============================== */
// CAMPAIGN ENDING — a CRATE HOMECOMING (the lantern festival was cut: Qi —
// "balloon seems not closely related to product"). Little crates drift down
// from the night sky, each trailing its just-cut rope snippet, and stack into a
// warehouse pile along the ground: "ALL CRATES HOME", shown literally in the
// game's own icons (crate, cut rope, the haul made visible).
let endT=0, endCrates=[], endPile=[], endPlan=[], endSpawnI=0;
const END_COLS=13;
function startEnding(){
  phase='end'; endT=0; endCrates=[]; endPile=new Array(END_COLS).fill(0); endSpawnI=0;
  // ONE CRATE PER LEVEL CLEARED (Qi) — the mound IS the campaign. Greedy plan:
  // place each of the LAST+1 crates in the column minimizing height + a
  // center-distance penalty → a centered mound of exactly that many crates,
  // whatever the campaign size.
  endPlan=[];
  const hts=new Array(END_COLS).fill(0), mid=(END_COLS-1)/2;
  for(let n=0;n<=LAST;n++){
    let best=0, bv=1e9;
    for(let c=0;c<END_COLS;c++){ const v=hts[c]+Math.abs(c-mid)*0.6; if(v<bv-1e-9){ bv=v; best=c; } }
    hts[best]++; endPlan.push(best);
  }
  const h=document.getElementById('hint'); if(h) h.classList.add('hide');
  const sub=document.getElementById('endSub1'); if(sub) sub.textContent='all '+(LAST+1)+' levels cleared';
}
function stepEnding(){
  endT++;
  stepFX();
  const size=W/END_COLS;
  if(endT%12===0&&endSpawnI<endPlan.length){
    const col=endPlan[endSpawnI++];
    endCrates.push({col, x:(col+0.5)*size, y:-size, vy:0,
      rot:(Math.random()-0.5)*0.6, vr:(Math.random()-0.5)*0.02,
      sway:6+Math.random()*14, ph:Math.random()*6.3, t:0, landed:false,
      targetY:FLOORY-(endPile[col]+0.5)*size*0.96, squash:0});
    endPile[col]++;
  }
  for(const c of endCrates){
    if(c.landed){ if(c.squash>0) c.squash*=0.86; continue; }
    c.t+=DT;
    c.vy=Math.min(c.vy+0.35*H*DT, 0.34*H); // gentle parachute-fall terminal speed
    c.y+=c.vy*DT;
    if(c.y>=c.targetY){ c.y=c.targetY; c.landed=true; c.squash=0.22; c.rot*=0.25; if(endT%2===0) playThump(); }
  }
  if(endT%170===0) spawnConfetti((0.2+Math.random()*0.6)*W, 0.30*H);
  if(endT===90){ const ec=document.getElementById('endcard'); if(ec) ec.classList.add('show'); }
}
// mini crate in the world's own art (brown planks, amber band, dark braces)
function drawMiniCrate(x,y,sd,rot,squash){
  ctx.save(); ctx.translate(x,y); if(rot) ctx.rotate(rot);
  if(squash) ctx.scale(1/Math.sqrt(1-squash*0.5),1-squash*0.5);
  const h=sd/2;
  ctx.fillStyle='#7c5029'; ctx.fillRect(-h,-h,sd,sd);
  ctx.fillStyle='rgba(255,179,71,0.94)'; ctx.fillRect(-h,-sd*0.11,sd,sd*0.22);
  ctx.fillStyle='rgba(255,255,255,0.22)'; ctx.fillRect(-h,-sd*0.11,sd,sd*0.05);
  ctx.strokeStyle='rgba(38,19,6,0.5)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(-h+2,-sd*0.30); ctx.lineTo(h-2,-sd*0.30);
  ctx.moveTo(-h+2,sd*0.30); ctx.lineTo(h-2,sd*0.30); ctx.stroke();
  ctx.strokeStyle='#38240f'; ctx.lineWidth=1.8; ctx.strokeRect(-h,-h,sd,sd);
  ctx.strokeStyle='#262e42'; ctx.lineWidth=Math.max(2,sd*0.06); ctx.lineCap='butt';
  const br=sd*0.17;
  ctx.beginPath(); ctx.moveTo(-h+1,-h+br); ctx.lineTo(-h+1,-h+1); ctx.lineTo(-h+br,-h+1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(h-br,-h+1); ctx.lineTo(h-1,-h+1); ctx.lineTo(h-1,-h+br); ctx.stroke();
  ctx.restore();
}
function drawEndCrates(now){
  const size=W/END_COLS;
  for(const c of endCrates){
    const sway=c.landed?0:Math.sin(c.t*2.2+c.ph)*c.sway;
    const x=c.x+sway, sd=size*0.9;
    if(!c.landed){
      // the just-cut rope snippet trailing above — the game's verb, falling home
      ctx.save(); ctx.lineCap='round';
      const rx=x, ry=c.y-sd*0.55, rl=sd*0.5, lean=Math.sin(c.t*2.2+c.ph+0.6)*0.35;
      ctx.strokeStyle='rgba(10,6,2,0.5)'; ctx.lineWidth=Math.max(2.6,W*0.008);
      ctx.beginPath(); ctx.moveTo(rx,ry); ctx.quadraticCurveTo(rx+lean*14,ry-rl*0.5,rx+lean*26,ry-rl); ctx.stroke();
      ctx.strokeStyle='hsl(33,55%,55%)'; ctx.lineWidth=Math.max(1.8,W*0.006);
      ctx.beginPath(); ctx.moveTo(rx,ry); ctx.quadraticCurveTo(rx+lean*14,ry-rl*0.5,rx+lean*26,ry-rl); ctx.stroke();
      ctx.restore();
    }
    drawMiniCrate(x,c.y,sd,c.landed?c.rot*0.3:c.rot+Math.sin(c.t*1.6+c.ph)*0.08,c.squash);
  }
  // warm hearth-glow over the grown pile
  const maxRows=Math.max(...endPile,0);
  if(maxRows>0){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const gy=FLOORY-maxRows*size*0.5;
    const gl=ctx.createRadialGradient(W/2,gy,0,W/2,gy,W*0.55);
    gl.addColorStop(0,'rgba(255,183,99,'+Math.min(0.10,0.02*maxRows).toFixed(3)+')');
    gl.addColorStop(1,'rgba(255,183,99,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(W/2,gy,W*0.55,0,7); ctx.fill();
    ctx.restore();
  }
}
function advanceLevel(){
  if(level>=LAST){ startEnding(); return; } // campaign complete — the great ending
  level++;
  buildLevel(level);
  trackLevelStart(); // post-win entry into a fresh level
}
// integrate + constraints + collisions — the physics core, damping as parameter
// so buildLevel can pre-settle a level invisibly (heavy damping) without the
// phase/FX/checks side effects of step().
function physCore(damp){
  for(const tr of trolleys){
    tr.t+=tr.dir*tr.speed*DT;
    if(tr.t>=1){ tr.t=1; tr.dir=-1; } else if(tr.t<=0){ tr.t=0; tr.dir=1; }
    const p=particles[tr.p];
    p.x=tr.x1+(tr.x2-tr.x1)*tr.t; p.y=tr.y1+(tr.y2-tr.y1)*tr.t;
    p.px=p.x; p.py=p.y;
  }
  for(const ro of rotors){
    ro.ang+=ro.speed*DT;
    const p=particles[ro.p];
    p.x=ro.cx+Math.cos(ro.ang)*ro.r; p.y=ro.cy+Math.sin(ro.ang)*ro.r;
    p.px=p.x; p.py=p.y;
  }
  for(const bl of blades) bl.ang+=bl.speed*DT;
  const g=G*DT*DT, dt2=DT*DT;
  for(const p of particles){
    if(p.im===0) continue;
    const dmp=p.damp||damp; // per-particle override (L8 decoy winch — see buildLevel)
    const vx=(p.x-p.px)*dmp, vy=(p.y-p.py)*dmp;
    p.px=p.x; p.py=p.y;
    p.x+=vx; p.y+=vy+g*(p.gmul===undefined?1:p.gmul); // balloons: buoyant gmul<0
    // wind zones (T6): constant push while inside the rect. Box corners are
    // EXCLUDED (per-particle wind torques a box crossing the zone edge into
    // chaotic tumbling — boxes get a uniform per-box push below). freeTail
    // followers are EXCLUDED from wind AND magnets: a severed tail is draped
    // decoration; external forces on it couple back into the crate through the
    // harness links and made single-rope wind/magnet levels chaatically unfair
    // (cut height silently decided the outcome — hit on device L54/L58).
    if(!p.boxed&&!p.freeTail) for(const wz of winds){ if(p.x>=wz.x&&p.x<=wz.x+wz.w&&p.y>=wz.y&&p.y<=wz.y+wz.h){ p.x+=wz.ax*dt2; p.y+=wz.ay*dt2; } }
    // magnets (T6): normalized inverse-square pull (softened, capped near center)
    if(!p.freeTail) for(const mg of magnets){
      const dx=mg.x-p.x, dy=mg.y-p.y, d2=dx*dx+dy*dy, d=Math.sqrt(d2)||1;
      if(d<mg.range){ const a=Math.min(mg.s*H*mg.ref2/(d2+mg.soft2), mg.s*H*6)*dt2; p.x+=dx/d*a; p.y+=dy/d*a; }
    }
  }
  // per-BOX wind: uniform push on all 4 corners once the box CENTER is inside —
  // torque-free carry (a crate leans into the gale as one body, no tumbling)
  if(winds.length) for(const b of boxes){
    const c=boxCenter(b);
    for(const wz of winds){ if(c.x>=wz.x&&c.x<=wz.x+wz.w&&c.y>=wz.y&&c.y<=wz.y+wz.h){
      for(const i of b.idx){ const p=particles[i]; if(p.im>0){ p.x+=wz.ax*dt2; p.y+=wz.ay*dt2; } }
    } }
  }
  for(const wz of winds) wz.t+=DT;
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
      // per-constraint stiffness: rigid links + normal ropes solve fully (1);
      // an ELASTIC rope (material tag, stiff<1) under-corrects each iteration so
      // it stretches under load and springs back — a bungee that stores energy
      // and launches the crate (T4 element; see makeElasticRope).
      const k=(c.stiff===undefined?1:c.stiff)*(d-c.rest)/d/im;
      a.x+=dx*k*aim; a.y+=dy*k*aim;
      b.x-=dx*k*bim; b.y-=dy*k*bim;
    }
  }
  collideAll();
}
function step(){
  stepCount++;
  if(phase==='end'){ stepEnding(); return; }
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
function popBalloon(bl){
  if(bl.popped) return;
  bl.popped=true; bl.popT=stepCount;
  if(bl.con) bl.con.cut=true;
  if(bl.con2) bl.con2.cut=true;
  const p=particles[bl.p]; p.im=0; p.gmul=1;
  spawnSparks(p.x,p.y,14);
  playPop();
}
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
  for(const bl of balloons){
    if(bl.popped) continue;
    const p=particles[bl.p];
    const q=closestOnSeg(p.x,p.y,ax,ay,bx,by);
    if(Math.hypot(p.x-q.x,p.y-q.y)<=bl.r){ popBalloon(bl); n++; }
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
    }else if(sg.kind==='spike'){
      const ext=spikeExt(sg);
      const h=S*0.30*ext, tw=Math.max(8,S*0.26);
      const n=Math.max(2,Math.floor(L/tw));
      if(sg.pulse){
        const cp=((stepCount*DT/sg.period+(sg.off||0))%1+1)%1;
        ctx.strokeStyle='#39445f'; ctx.lineWidth=4; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(sg.x1,sg.y1); ctx.lineTo(sg.x2,sg.y2); ctx.stroke();
        if((cp>0.84||cp<0.02)&&ext<0.6){
          ctx.save(); ctx.globalCompositeOperation='lighter';
          const gl=0.5+0.5*Math.sin(stepCount*0.5);
          ctx.strokeStyle='rgba(255,59,48,'+(0.10+0.16*gl).toFixed(3)+')'; ctx.lineWidth=9;
          ctx.beginPath(); ctx.moveTo(sg.x1,sg.y1); ctx.lineTo(sg.x2,sg.y2); ctx.stroke();
          ctx.restore();
        }
      }
      if(ext>0.02){
        ctx.strokeStyle='rgba(255,59,48,'+(0.30*ext).toFixed(3)+')'; ctx.lineWidth=7; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(sg.x1,sg.y1); ctx.lineTo(sg.x2,sg.y2); ctx.stroke();
        ctx.fillStyle=spikeActive(sg)?'#e0342c':'#b0392f';
        for(let k=0;k<n;k++){
          const t0=k/n, t1=(k+1)/n, tm=(t0+t1)/2;
          ctx.beginPath();
          ctx.moveTo(sg.x1+dx*t0,sg.y1+dy*t0);
          ctx.lineTo(sg.x1+dx*tm+nx*h,sg.y1+dy*tm+ny*h);
          ctx.lineTo(sg.x1+dx*t1,sg.y1+dy*t1);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.strokeStyle='#5a1512'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(sg.x1,sg.y1); ctx.lineTo(sg.x2,sg.y2); ctx.stroke();
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
      if(c.mat==='elastic') cur.elastic=true;
      if(t>maxT) maxT=t;
    }else{
      if(cur){ cur.taut=maxT; chains.push(cur); }
      cur={pts:[a,b],last:c.b,elastic:c.mat==='elastic'}; maxT=t;
    }
  }
  if(cur){ cur.taut=maxT; chains.push(cur); }
  return chains;
}
function drawRopes(){
  const base=Math.max(2,W*0.009);
  ctx.lineCap='round'; ctx.lineJoin='round';
  for(const ch of ropeChains()){
    if(ch.elastic){ drawElasticChain(ch,base); continue; }
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
// ELASTIC rope (T4) — drawn as a teal spring coil so it reads as "springy /
// stores energy," distinct from the amber ropes. Coils tighten (more turns,
// lower amplitude) as the spring stretches taut.
function drawElasticChain(ch,base){
  const p0=ch.pts[0], p1=ch.pts[ch.pts.length-1];
  const dx=p1.x-p0.x, dy=p1.y-p0.y, L=Math.hypot(dx,dy)||1;
  const ux=dx/L, uy=dy/L, nx=-uy, ny=ux;
  const stretch=Math.min(1,ch.taut);
  const amp=(1-0.5*stretch)*Math.max(6,base*2.2);   // fatter when slack
  const turns=Math.max(5,Math.round(L/Math.max(10,base*2.6)));
  const seg=turns*2;
  const coil=[];
  coil.push([p0.x,p0.y]);
  for(let i=1;i<seg;i++){
    const t=i/seg, s=(i%2?1:-1);
    coil.push([p0.x+dx*t+nx*amp*s, p0.y+dy*t+ny*amp*s]);
  }
  coil.push([p1.x,p1.y]);
  const draw=()=>{ ctx.beginPath(); ctx.moveTo(coil[0][0],coil[0][1]); for(let i=1;i<coil.length;i++) ctx.lineTo(coil[i][0],coil[i][1]); };
  ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
  draw(); ctx.strokeStyle='rgba(6,20,20,0.5)'; ctx.lineWidth=base*1.4; ctx.stroke();
  ctx.globalCompositeOperation='lighter';
  draw(); ctx.strokeStyle='rgba(95,224,208,'+(0.55+0.35*stretch).toFixed(2)+')'; ctx.lineWidth=base*0.95; ctx.stroke();
  // anchor nubs
  for(const p of [p0,p1]){ ctx.beginPath(); ctx.arc(p.x,p.y,base*0.9,0,7); ctx.fillStyle='rgba(150,240,225,0.9)'; ctx.fill(); }
  ctx.restore();
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
function drawTrolleys(){
  for(const tr of trolleys){
    ctx.lineCap='round';
    ctx.strokeStyle='#2a3350'; ctx.lineWidth=5;
    ctx.beginPath(); ctx.moveTo(tr.x1,tr.y1); ctx.lineTo(tr.x2,tr.y2); ctx.stroke();
    ctx.strokeStyle='#3a4664'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(tr.x1,tr.y1-2); ctx.lineTo(tr.x2,tr.y2-2); ctx.stroke();
    ctx.fillStyle='#1e2536';
    for(const [ex,ey] of [[tr.x1,tr.y1],[tr.x2,tr.y2]]){ ctx.beginPath(); ctx.arc(ex,ey,4.5,0,7); ctx.fill(); }
    const p=particles[tr.p];
    ctx.save(); ctx.translate(p.x,p.y);
    ctx.fillStyle='#0a0c12';
    ctx.beginPath(); ctx.arc(-7,-9,3.4,0,7); ctx.fill();
    ctx.beginPath(); ctx.arc(7,-9,3.4,0,7); ctx.fill();
    ctx.fillStyle='#2b3446';
    roundRectPath(-13,-8,26,15,4); ctx.fill();
    ctx.strokeStyle='#46527a'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.fillStyle='#ffb347';
    ctx.beginPath(); ctx.arc(0,4,2.4,0,7); ctx.fill();
    ctx.restore();
  }
}
function drawRotors(){
  for(const ro of rotors){
    // faint orbit ring + hub
    ctx.save();
    ctx.strokeStyle='rgba(120,150,210,0.16)'; ctx.lineWidth=1.5; ctx.setLineDash([3,5]);
    ctx.beginPath(); ctx.arc(ro.cx,ro.cy,ro.r,0,7); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='#2a3350'; ctx.beginPath(); ctx.arc(ro.cx,ro.cy,5,0,7); ctx.fill();
    ctx.strokeStyle='#46527a'; ctx.lineWidth=1.5; ctx.stroke();
    // arm to the orbiting carriage
    const p=particles[ro.p];
    ctx.strokeStyle='#3a4664'; ctx.lineWidth=3; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(ro.cx,ro.cy); ctx.lineTo(p.x,p.y); ctx.stroke();
    ctx.fillStyle='#2b3446'; ctx.beginPath(); ctx.arc(p.x,p.y,6,0,7); ctx.fill();
    ctx.strokeStyle='#46527a'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.fillStyle='#ffb347'; ctx.beginPath(); ctx.arc(p.x,p.y,2.4,0,7); ctx.fill();
    ctx.restore();
  }
}
function drawBlades(){
  for(const bl of blades){
    ctx.save(); ctx.translate(bl.cx,bl.cy); ctx.rotate(bl.ang);
    // glow
    ctx.globalCompositeOperation='lighter';
    const gl=ctx.createRadialGradient(0,0,0,0,0,bl.r*1.5);
    gl.addColorStop(0,'rgba(255,70,58,0.16)'); gl.addColorStop(1,'rgba(255,70,58,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(0,0,bl.r*1.5,0,7); ctx.fill();
    ctx.globalCompositeOperation='source-over';
    // toothed disc
    const teeth=12;
    ctx.fillStyle='#c33'; ctx.beginPath();
    for(let i=0;i<teeth;i++){
      const a0=i/teeth*6.283, a1=(i+0.5)/teeth*6.283;
      ctx.lineTo(Math.cos(a0)*bl.r, Math.sin(a0)*bl.r);
      ctx.lineTo(Math.cos(a1)*bl.r*0.82, Math.sin(a1)*bl.r*0.82);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='#8a2b26'; ctx.beginPath(); ctx.arc(0,0,bl.r*0.55,0,7); ctx.fill();
    ctx.fillStyle='#1e2536'; ctx.beginPath(); ctx.arc(0,0,bl.r*0.14,0,7); ctx.fill();
    ctx.restore();
  }
}
function drawWinds(){
  for(const wz of winds){
    ctx.save();
    ctx.fillStyle='rgba(150,205,255,0.045)'; ctx.fillRect(wz.x,wz.y,wz.w,wz.h);
    ctx.strokeStyle='rgba(150,205,255,0.12)'; ctx.setLineDash([4,6]); ctx.lineWidth=1.5;
    ctx.strokeRect(wz.x,wz.y,wz.w,wz.h); ctx.setLineDash([]);
    const mag=Math.hypot(wz.ax,wz.ay)||1, ux=wz.ax/mag, uy=wz.ay/mag, px=-uy, py=ux;
    const span=Math.abs(ux)>0.5?wz.w:wz.h, cxz=wz.x+wz.w/2, cyz=wz.y+wz.h/2;
    ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
    for(let i=0;i<7;i++){
      const ph=((wz.t*0.5)+i*0.19)%1, lane=(i*0.29+0.12)%1-0.5;
      const bx=cxz+px*lane*(Math.abs(ux)>0.5?wz.h:wz.w)*0.85, by=cyz+py*lane*(Math.abs(ux)>0.5?wz.h:wz.w)*0.85;
      const tr=(ph-0.5)*span*0.92, cx=bx+ux*tr, cy=by+uy*tr, a=Math.sin(ph*Math.PI)*0.4;
      ctx.strokeStyle='rgba(180,220,255,'+a.toFixed(3)+')'; ctx.lineWidth=2.2;
      ctx.beginPath(); ctx.moveTo(cx-ux*9,cy-uy*9); ctx.lineTo(cx+ux*7,cy+uy*7);
      ctx.moveTo(cx+ux*7,cy+uy*7); ctx.lineTo(cx+ux*1-px*4,cy+uy*1-py*4);
      ctx.moveTo(cx+ux*7,cy+uy*7); ctx.lineTo(cx+ux*1+px*4,cy+uy*1+py*4); ctx.stroke();
    }
    ctx.restore(); ctx.globalCompositeOperation='source-over';
  }
}
// Iconic HORSESHOE magnet (Qi: the purple orb "can't really tell it's magnet").
// Purple body (red would read as hazard in this world) + silver pole tips,
// opening downward. Shared by the world renderer, the cue, and the How-to page.
function drawHorseshoe(x,y,R){
  const leg=R*0.9, tube=Math.max(6,R*0.6);
  ctx.save(); ctx.translate(x,y); ctx.lineCap='butt';
  ctx.strokeStyle='#2c1656'; ctx.lineWidth=tube+3;   // dark outline
  ctx.beginPath(); ctx.moveTo(-R,leg); ctx.lineTo(-R,0); ctx.arc(0,0,R,Math.PI,0); ctx.lineTo(R,leg); ctx.stroke();
  ctx.strokeStyle='#7a3fd4'; ctx.lineWidth=tube;     // purple body
  ctx.beginPath(); ctx.moveTo(-R,leg); ctx.lineTo(-R,0); ctx.arc(0,0,R,Math.PI,0); ctx.lineTo(R,leg); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.22)'; ctx.lineWidth=tube*0.3; // sheen
  ctx.beginPath(); ctx.arc(0,-R*0.06,R+tube*0.22,Math.PI*1.15,Math.PI*1.85); ctx.stroke();
  for(const sx of [-R,R]){ // silver pole tips
    ctx.fillStyle='#cfd8ea'; ctx.fillRect(sx-tube/2,leg-tube*0.85,tube,tube*0.85);
    ctx.strokeStyle='#2c1656'; ctx.lineWidth=1.5; ctx.strokeRect(sx-tube/2,leg-tube*0.85,tube,tube*0.85);
  }
  ctx.restore();
}
function drawMagnets(){
  for(const mg of magnets){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    for(let i=0;i<3;i++){
      const ph=((stepCount*0.012)+i/3)%1, rr=mg.range*(0.18+ph*0.82), a=(1-ph)*0.11;
      ctx.strokeStyle='rgba(190,140,255,'+a.toFixed(3)+')'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(mg.x,mg.y,rr,0,7); ctx.stroke();
    }
    ctx.restore(); ctx.globalCompositeOperation='source-over';
    drawHorseshoe(mg.x,mg.y,0.03*W);
  }
}
// Active-pull feedback (drawn OVER the crate): whenever the crate is in a
// magnet's range, field dashes stream from the crate toward the magnet and the
// crate's IRON CORNER BRACES glint — answering "the box is wood, how does a
// magnet grab it?": it grabs the metal corners. Always-on physics feedback,
// not just a first-encounter cue.
function drawMagnetPull(){
  if(!crate||!magnets.length) return;
  const c=boxCenter(crate);
  for(const mg of magnets){
    const dx=mg.x-c.x, dy=mg.y-c.y, d=Math.hypot(dx,dy);
    if(d>=mg.range||d<8) continue;
    const ux=dx/d, uy=dy/d;
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
    for(let i=0;i<3;i++){
      const ph=((stepCount*0.02)+i/3)%1;
      const px=c.x+dx*ph, py=c.y+dy*ph, a=Math.sin(ph*Math.PI)*0.5;
      ctx.strokeStyle='rgba(200,155,255,'+a.toFixed(3)+')'; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.moveTo(px-ux*7,py-uy*7); ctx.lineTo(px+ux*4,py+uy*4); ctx.stroke();
    }
    const gl=0.35+0.3*(0.5+0.5*Math.sin(stepCount*0.15));
    for(const idx of crate.idx){
      const p=particles[idx];
      ctx.fillStyle='rgba(205,170,255,'+gl.toFixed(3)+')';
      ctx.beginPath(); ctx.arc(p.x,p.y,3.2,0,7); ctx.fill();
    }
    ctx.restore(); ctx.globalCompositeOperation='source-over';
  }
}
// 5-point star path around (x,y); caller fills/strokes. Shared by the field
// star, the basket badges, the cue, and the How-to page.
function starPath(x,y,rOuter,rInner,rot){
  ctx.beginPath();
  for(let i=0;i<10;i++){ const a=i/10*6.283-Math.PI/2+(rot||0), rr=(i%2?rInner:rOuter); ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr); }
  ctx.closePath();
}
// badge slot position for star i (shared by the badges, the guide line, the cue)
function starBadgePos(i){
  const n=stars.length, bs=Math.max(7,S*0.16), gap=bs*2.6;
  return {x:basket.x-(n-1)*gap/2+i*gap, y:basket.yb-basket.wh-S*0.85, bs};
}
function drawStars(){
  for(let si=0;si<stars.length;si++){
    const st=stars[si];
    const got=st.got, age=stepCount-st.gotT;
    // "belongs there" guide (the Tilt lesson): a faint dotted line MARCHING from
    // the star to its badge slot above the basket — wordless "this goes there,
    // before you land" (Qi: the star's purpose still wasn't visually intuitive)
    if(!got&&basket){
      const bp=starBadgePos(si);
      ctx.save(); ctx.globalCompositeOperation='lighter';
      const a=0.16+0.08*Math.sin(stepCount*0.05);
      ctx.strokeStyle='rgba(255,214,140,'+a.toFixed(3)+')'; ctx.lineWidth=2; ctx.lineCap='round';
      ctx.setLineDash([2,9]); ctx.lineDashOffset=-(stepCount*0.7)%11;
      ctx.beginPath(); ctx.moveTo(st.x,st.y); ctx.lineTo(bp.x,bp.y-bp.bs*1.6); ctx.stroke();
      ctx.setLineDash([]); ctx.restore(); ctx.globalCompositeOperation='source-over';
    }
    ctx.save(); ctx.translate(st.x,st.y);
    if(got){
      // brief burst on collect, then gone
      if(age<14){ ctx.globalCompositeOperation='lighter'; const k=age/14;
        ctx.strokeStyle='rgba(255,224,140,'+((1-k)*0.8).toFixed(3)+')'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(0,0,st.r*(0.6+k*1.8),0,7); ctx.stroke(); }
      ctx.restore(); continue;
    }
    const pulse=1+0.08*Math.sin(stepCount*0.08);
    ctx.globalCompositeOperation='lighter';
    const gl=ctx.createRadialGradient(0,0,0,0,0,st.r*2.2);
    gl.addColorStop(0,'rgba(255,214,110,0.5)'); gl.addColorStop(1,'rgba(255,214,110,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(0,0,st.r*2.2,0,7); ctx.fill();
    ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='#ffd76a'; ctx.strokeStyle='#c8912f'; ctx.lineWidth=2;
    starPath(0,0,st.r*pulse,st.r*0.46,stepCount*0.01);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
// Star REQUIREMENT badges over the basket (Qi: "what's the star for" — the cue
// alone didn't say). One badge slot per star, floating above the rim: dim
// outline = still needed, gold = collected. Persistent, wordless statement that
// the basket only accepts the crate once every star is collected.
function drawStarBadges(){
  if(!stars.length||!basket) return;
  for(let i=0;i<stars.length;i++){
    const st=stars[i], bp=starBadgePos(i), x=bp.x, y=bp.y, bs=bp.bs;
    if(st.got){
      const age=stepCount-st.gotT;
      if(age<16){ ctx.save(); ctx.globalCompositeOperation='lighter'; const k=age/16;
        ctx.strokeStyle='rgba(255,224,140,'+((1-k)*0.7).toFixed(3)+')'; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.arc(x,y,bs*(1+k*1.4),0,7); ctx.stroke(); ctx.restore(); }
      ctx.fillStyle='#ffd76a'; ctx.strokeStyle='#c8912f'; ctx.lineWidth=1.6;
      starPath(x,y,bs,bs*0.46,0); ctx.fill(); ctx.stroke();
    }else{
      ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.strokeStyle='rgba(200,208,228,0.5)'; ctx.lineWidth=1.6;
      starPath(x,y,bs,bs*0.46,0); ctx.fill(); ctx.stroke();
    }
  }
}
function drawBalloons(){
  for(const bl of balloons){
    const p=particles[bl.p];
    if(bl.popped){
      const age=stepCount-bl.popT;
      if(age>=0&&age<12){
        const k=age/12, R=bl.r*(0.6+k*1.3);
        ctx.strokeStyle='rgba(255,190,120,'+((1-k)*0.75).toFixed(3)+')'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(p.x,p.y,R,0,7); ctx.stroke();
      }
      continue;
    }
    const r=bl.r;
    const c0=particles[bl.con.b], c1=particles[bl.con2.b];
    const ax=(c0.x+c1.x)/2, ay=(c0.y+c1.y)/2;
    const kx=p.x, ky=p.y+r*0.98;
    // warm lantern glow
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const gl=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*1.9);
    gl.addColorStop(0,'rgba(255,168,90,0.30)'); gl.addColorStop(1,'rgba(255,168,90,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(p.x,p.y,r*1.9,0,7); ctx.fill();
    ctx.restore();
    // string
    ctx.strokeStyle='rgba(220,225,235,0.45)'; ctx.lineWidth=1.6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(kx,ky);
    ctx.quadraticCurveTo((kx+ax)/2+6,(ky+ay)/2,ax,ay); ctx.stroke();
    // body
    ctx.save(); ctx.translate(p.x,p.y);
    const grad=ctx.createRadialGradient(-r*0.3,-r*0.42,r*0.1,0,0,r);
    grad.addColorStop(0,'#ffcf8f'); grad.addColorStop(0.55,'#f2843c'); grad.addColorStop(1,'#c8672a');
    ctx.fillStyle=grad;
    ctx.beginPath(); ctx.ellipse(0,0,r*0.86,r,0,0,7); ctx.fill();
    ctx.strokeStyle='rgba(120,60,20,0.35)'; ctx.lineWidth=1.4; ctx.stroke();
    ctx.fillStyle='#c8672a';
    ctx.beginPath(); ctx.moveTo(-3,r*0.95); ctx.lineTo(3,r*0.95); ctx.lineTo(0,r*1.13); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-r*0.32,-r*0.4,r*0.15,r*0.26,-0.4,0,7); ctx.fill();
    ctx.restore();
  }
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
  if(FREEZE||everCut||phase!=='play'||level!==0) return;
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
  if(FREEZE||!cue||cutThisLevel||phase!=='play') return;
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
  }else if(cue.kind==='balloon'){
    // DEMO: a swipe pops the balloon → a ghost crate falls into the basket (loops)
    const bl=balloons.find(x=>!x.popped);
    if(bl){
      const p=particles[bl.p], r=bl.r;
      const cc=crate?boxCenter(crate):{x:p.x,y:p.y+0.28*H};
      const gs=crate?crate.side:0.14*W;
      const endY=basket?basket.yb-basket.wh*0.45:cc.y+0.42*H;
      const cyc=2600, t=(now%cyc)/cyc, popT=0.42;
      if(t<popT){
        // attention ring on the balloon + a hand sweeping across it
        const pulse=0.5+0.5*Math.sin(now/240);
        ctx.strokeStyle='rgba(255,224,170,'+(0.3+0.34*pulse).toFixed(3)+')'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(p.x,p.y,r*1.16+pulse*4,0,7); ctx.stroke();
        drawGhostCrate(cc.x,cc.y,gs,0.4*Math.min(1,t/0.06),1,0);
        const ap=Math.max(0,(t-(popT-0.26))/0.26);
        if(ap>0){
          const fx=p.x-r*1.7+(r*1.9)*ap, fade=Math.min(1,ap/0.15);
          ctx.save(); ctx.globalCompositeOperation='lighter';
          ctx.strokeStyle='rgba(255,236,190,'+(0.55*fade).toFixed(3)+')'; ctx.lineWidth=3; ctx.lineCap='round';
          ctx.beginPath(); ctx.moveTo(fx-r*0.7,p.y); ctx.lineTo(fx,p.y); ctx.stroke();
          ctx.restore();
          drawTutorialHand(fx,p.y,4.4,fade);
        }
      }else{
        const u=(t-popT)/(1-popT);
        if(u<0.28){
          const b=u/0.28, R=r*(0.6+b*1.6);
          ctx.save(); ctx.globalCompositeOperation='lighter';
          ctx.strokeStyle='rgba(255,196,128,'+((1-b)*0.8).toFixed(3)+')'; ctx.lineWidth=3;
          ctx.beginPath(); ctx.arc(p.x,p.y,R,0,7); ctx.stroke();
          for(let k=0;k<6;k++){ const a=k/6*6.28; ctx.fillStyle='rgba(255,214,150,'+((1-b)*0.75).toFixed(3)+')'; ctx.beginPath(); ctx.arc(p.x+Math.cos(a)*R*0.9,p.y+Math.sin(a)*R*0.9,2.2,0,7); ctx.fill(); }
          ctx.restore();
        }
        const e=u*u, gy=cc.y+(endY-cc.y)*e, ga=(u>0.84)?(1-(u-0.84)/0.16):1;
        drawGhostCrate(cc.x,gy,gs,ga*0.95,1,0);
        for(let k=0;k<3;k++){
          const ph=((now/560)+k/3)%1, yy=gy+gs*0.6+ph*0.08*H, a=Math.sin(ph*Math.PI)*0.55*ga;
          ctx.strokeStyle='rgba(255,200,120,'+a.toFixed(3)+')'; ctx.lineWidth=3;
          ctx.beginPath(); ctx.moveTo(cc.x-10,yy); ctx.lineTo(cc.x,yy+8); ctx.lineTo(cc.x+10,yy); ctx.stroke();
        }
      }
    }
  }else if(cue.kind==='trolley'){
    // DEMO: the anchor slides — motion streaks + a ring on the carriage
    const tr=trolleys[0];
    if(tr){
      const p=particles[tr.p], dirx=(tr.dir>0?1:-1);
      ctx.save(); ctx.globalCompositeOperation='lighter';
      for(let k=0;k<3;k++){
        const ph=((now/650)+k/3)%1, x=p.x+dirx*(12+ph*44), a=Math.sin(ph*Math.PI)*0.7;
        ctx.strokeStyle='rgba(150,205,255,'+a.toFixed(3)+')'; ctx.lineWidth=3.2; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(x,p.y-5); ctx.lineTo(x+dirx*9,p.y); ctx.lineTo(x,p.y+5); ctx.stroke();
      }
      ctx.restore();
      const pulse=0.5+0.5*Math.sin(now/240);
      ctx.strokeStyle='rgba(180,210,255,'+(0.28+0.34*pulse).toFixed(3)+')'; ctx.lineWidth=2.6;
      ctx.beginPath(); ctx.arc(p.x,p.y,17+pulse*4,0,7); ctx.stroke();
    }
  }else if(cue.kind==='pulse'){
    // DEMO: when the gate is retracted, a green "go now" glow + down chevrons
    const sg=segs.find(s=>s.kind==='spike'&&s.pulse);
    if(sg&&!spikeActive(sg)){
      const mx=(sg.x1+sg.x2)/2, my=(sg.y1+sg.y2)/2;
      ctx.save(); ctx.globalCompositeOperation='lighter';
      const g=ctx.createRadialGradient(mx,my,0,mx,my,0.24*W);
      g.addColorStop(0,'rgba(120,230,150,0.16)'); g.addColorStop(1,'rgba(120,230,150,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(mx,my,0.24*W,0,7); ctx.fill();
      ctx.restore();
      for(let k=0;k<3;k++){
        const ph=((now/600)+k/3)%1, yy=my-0.10*H+ph*0.08*H, a=Math.sin(ph*Math.PI)*0.85;
        ctx.strokeStyle='rgba(150,240,170,'+a.toFixed(3)+')'; ctx.lineWidth=3.2; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(mx-11,yy); ctx.lineTo(mx,yy+9); ctx.lineTo(mx+11,yy); ctx.stroke();
      }
    }
  }else if(cue.kind==='magnet'){
    // DEMO: chevrons converge INWARD on the magnet (it pulls) + a ghost crate curves toward it
    const mg=magnets[0];
    if(mg){
      ctx.save(); ctx.globalCompositeOperation='lighter';
      const pulse=0.5+0.5*Math.sin(now/240);
      const g=ctx.createRadialGradient(mg.x,mg.y,0,mg.x,mg.y,0.2*W);
      g.addColorStop(0,'rgba(190,140,255,'+(0.12+0.14*pulse).toFixed(3)+')'); g.addColorStop(1,'rgba(190,140,255,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(mg.x,mg.y,0.2*W,0,7); ctx.fill();
      for(let i=0;i<6;i++){
        const ang=i/6*6.283, ph=((now/750)+i*0.02)%1, rr=0.05*W+0.15*W*(1-ph);
        const cx=mg.x+Math.cos(ang)*rr, cy=mg.y+Math.sin(ang)*rr, a=Math.sin(ph*Math.PI)*0.75;
        const ix=-Math.cos(ang), iy=-Math.sin(ang), px=-iy, py=ix; // inward + perpendicular
        ctx.strokeStyle='rgba(200,150,255,'+a.toFixed(3)+')'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(cx-ix*7+px*6,cy-iy*7+py*6); ctx.lineTo(cx+ix*3,cy+iy*3); ctx.lineTo(cx-ix*7-px*6,cy-iy*7-py*6); ctx.stroke();
      }
      ctx.restore();
      const cyc=2600, t=(now%cyc)/cyc, sx=mg.x-0.24*W, sy=mg.y-0.16*H;
      let gx=sx+(mg.x-sx)*t, gy=sy+(mg.y+0.22*H-sy)*(t*t); gx+=(mg.x-gx)*t*0.5; // curve toward magnet
      let ga=1; if(t<0.08) ga=t/0.08; if(t>0.9) ga=1-(t-0.9)/0.1;
      drawGhostCrate(gx,gy,0.1*W,ga*0.9,1,0);
    }
  }else if(cue.kind==='wind'){
    // DEMO: a ghost crate is blown sideways along the gale
    const wz=winds[0];
    if(wz){
      const mag=Math.hypot(wz.ax,wz.ay)||1, ux=wz.ax/mag, uy=wz.ay/mag, px=-uy, py=ux;
      const cyc=2400, t=(now%cyc)/cyc, sx=wz.x+wz.w*0.18, sy=wz.y+wz.h*0.34;
      const gx=sx+ux*wz.w*0.62*t, gy=sy+uy*wz.h*0.5*t+0.14*H*t*t;
      let ga=1; if(t<0.08) ga=t/0.08; if(t>0.9) ga=1-(t-0.9)/0.1;
      ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
      for(let i=0;i<3;i++){ const ph=((now/460)+i/3)%1, ax2=gx-ux*34+ux*68*ph, ay2=gy-uy*34+uy*68*ph, a=Math.sin(ph*Math.PI)*0.6;
        ctx.strokeStyle='rgba(180,220,255,'+a.toFixed(3)+')'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(ax2-ux*9,ay2-uy*9); ctx.lineTo(ax2+ux*7,ay2+uy*7);
        ctx.moveTo(ax2+ux*7,ay2+uy*7); ctx.lineTo(ax2+ux*1-px*4,ay2+uy*1-py*4);
        ctx.moveTo(ax2+ux*7,ay2+uy*7); ctx.lineTo(ax2+ux*1+px*4,ay2+uy*1+py*4); ctx.stroke(); }
      ctx.restore();
      drawGhostCrate(gx,gy,0.1*W,ga*0.9,1,0);
    }
  }else if(cue.kind==='elastic'){
    // DEMO: a hand cuts the springy cord → a ghost crate flings up-and-over to the basket
    const cc=crate?boxCenter(crate):null;
    if(cc&&basket){
      const cyc=2600, t=(now%cyc)/cyc, cutT=0.42;
      if(t<cutT){
        // anchor the sweeping hand ON the elastic cord (midpoint of its live chain)
        let ex=cc.x, ey=cc.y-0.14*H, n=0, sx=0, sy=0;
        for(const c2 of cons){ if(c2.type==='rope'&&c2.mat==='elastic'&&!c2.cut){ const a=particles[c2.a],b=particles[c2.b]; sx+=(a.x+b.x)/2; sy+=(a.y+b.y)/2; n++; } }
        if(n){ ex=sx/n; ey=sy/n; }
        const ap=Math.min(1,t/cutT), fade=Math.min(1,Math.min(ap,1-ap)/0.2), hx=ex-0.09*W+0.18*W*ap, hy=ey;
        ctx.save(); ctx.globalCompositeOperation='lighter';
        ctx.strokeStyle='rgba(95,224,208,'+(0.5*fade).toFixed(3)+')'; ctx.lineWidth=3; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(hx-0.06*W,hy); ctx.lineTo(hx,hy); ctx.stroke(); ctx.restore();
        drawTutorialHand(hx,hy,4.6,fade);
      }else{
        const u=(t-cutT)/(1-cutT), ex=basket.x, ey=basket.yb-basket.wh*0.42;
        const gx=cc.x+(ex-cc.x)*u, gy=cc.y+(ey-cc.y)*u-Math.sin(Math.min(1,u)*Math.PI)*0.15*H;
        let ga=1; if(u>0.88) ga=1-(u-0.88)/0.12;
        drawGhostCrate(gx,gy,crate.side,ga*0.9,1,0);
      }
    }
  }else if(cue.kind==='rotor'){
    // DEMO: mark the bottom of the orbit (release point) + a ghost crate drops to the basket
    const ro=rotors[0];
    if(ro&&basket){
      const bx=ro.cx, by=ro.cy+ro.r, cyc=2400, t=(now%cyc)/cyc, pulse=0.5+0.5*Math.sin(now/240);
      ctx.save(); ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle='rgba(150,205,255,'+(0.3+0.3*pulse).toFixed(3)+')'; ctx.lineWidth=2.6;
      ctx.beginPath(); ctx.arc(bx,by,15+pulse*4,0,7); ctx.stroke(); ctx.restore();
      const sy=by+0.02*H, ey=basket.yb-basket.wh*0.42, gy=sy+(ey-sy)*(t*t), gx=bx+(basket.x-bx)*t;
      let ga=1; if(t<0.08) ga=t/0.08; if(t>0.9) ga=1-(t-0.9)/0.1;
      drawGhostCrate(gx,gy,crate?crate.side:0.12*W,ga*0.9,1,0);
    }
  }else if(cue.kind==='blade'){
    // DEMO: a ghost crate touches the spinning blade and shatters (keep clear)
    const bl=blades[0];
    if(bl){
      const cyc=2200, t=(now%cyc)/cyc;
      ctx.save(); ctx.globalCompositeOperation='lighter';
      const amb=0.1+0.1*(0.5+0.5*Math.sin(now/200));
      const g=ctx.createRadialGradient(bl.cx,bl.cy,0,bl.cx,bl.cy,bl.r*2.2);
      g.addColorStop(0,'rgba(255,70,58,'+amb.toFixed(3)+')'); g.addColorStop(1,'rgba(255,70,58,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(bl.cx,bl.cy,bl.r*2.2,0,7); ctx.fill(); ctx.restore();
      if(t<0.5){
        const u=t/0.5, sy=bl.cy-0.15*H, gy=sy+(bl.cy-bl.r-sy)*(u*u);
        drawGhostCrate(bl.cx,gy,0.09*W,(t<0.06?t/0.06:1)*0.9,1,0);
      }else{
        const u=(t-0.5)/0.5; ctx.save(); ctx.globalCompositeOperation='lighter';
        for(let i=0;i<4;i++){ const ang=-Math.PI/2+(i-1.5)*0.55, sp=0.08*W, fx=bl.cx+Math.cos(ang)*sp*u, fy=bl.cy-bl.r+Math.sin(ang)*sp*u+0.5*0.3*H*u*u;
          drawGhostCrate(fx,fy,0.038*W,(1-u)*0.85,1,(i-1.5)*0.6+u*2); }
        ctx.restore();
      }
    }
  }else if(cue.kind==='star'){
    // DEMO: a ghost crate falls THROUGH the star (it lights up + the basket badge
    // fills) and lands in the basket — "grab every star on the way home". The
    // route into the basket is the point: the star gates the win (Qi feedback).
    const st=stars[0];
    if(st&&basket){
      const cyc=3000, t=(now%cyc)/cyc, pulse=0.5+0.5*Math.sin(now/240);
      const passT=0.42; // ghost crosses the star here
      ctx.save(); ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle='rgba(255,214,110,'+(0.35+0.35*pulse).toFixed(3)+')'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(st.x,st.y,st.r*1.4+pulse*5,0,7); ctx.stroke();
      if(Math.abs(t-passT)<0.07){ for(let i=0;i<6;i++){ const a=i/6*6.28;
        ctx.strokeStyle='rgba(255,224,140,0.7)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(st.x+Math.cos(a)*st.r,st.y+Math.sin(a)*st.r); ctx.lineTo(st.x+Math.cos(a)*st.r*1.9,st.y+Math.sin(a)*st.r*1.9); ctx.stroke(); } }
      ctx.restore();
      let gx,gy,ga=1;
      if(t<passT){ const u=t/passT; gx=st.x; gy=st.y-0.14*H+(0.14*H)*u*u; if(t<0.08) ga=t/0.08; }
      else{ const u=(t-passT)/(1-passT), ex=basket.x, ey=basket.yb-basket.wh*0.45;
        gx=st.x+(ex-st.x)*u; gy=st.y+(ey-st.y)*(u*u); if(u>0.86) ga=1-(u-0.86)/0.14; }
      drawGhostCrate(gx,gy,0.1*W,ga*0.85,1,0);
      // after the pass, highlight the basket's badge slot filling gold
      if(t>=passT){ const bs=Math.max(7,S*0.16), bx=basket.x, by=basket.yb-basket.wh-S*0.85;
        ctx.save(); ctx.globalCompositeOperation='lighter';
        ctx.strokeStyle='rgba(255,224,140,'+(0.4+0.3*pulse).toFixed(3)+')'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(bx,by,bs*1.7,0,7); ctx.stroke(); ctx.restore();
      }
    }
  }
  ctx.globalCompositeOperation='source-over';
  ctx.restore();
}
/* ============================== how to play ============================== */
// Paged tutorial (Settings → "How to play"): each page loops one mechanic's
// mini demo in the cue system's visual language over a dimmed game. Unlike
// first-encounter cues it is always available and never touches 'cut.seen'.
// Demos are self-contained (local geometry) — they never read level state.
const HOWTO=[
  {cap:'swipe to cut the rope', draw:howtoCutPage},
  {cap:'spikes shatter the crate', draw:howtoSpikePage},
  {cap:'pads bounce the crate', draw:howtoPadPage},
  {cap:'a falling weight lifts the crate', draw:howtoPulleyPage},
  {cap:'swipe a balloon to pop it', draw:howtoBalloonPage},
  {cap:'the hook slides — time your cut', draw:howtoTrolleyPage},
  {cap:'pass while the spikes are down', draw:howtoPulsePage},
  {cap:'cut the springy cord to fling the crate', draw:howtoElasticPage},
  {cap:'the anchor spins — release toward home', draw:howtoRotorPage},
  {cap:'spinning blades wreck the crate', draw:howtoBladePage},
  {cap:'the gale carries the crate', draw:howtoWindPage},
  {cap:'magnets tug the crate’s iron corners', draw:howtoMagnetPage},
  {cap:'grab every star, then land', draw:howtoStarPage},
];
let howtoPage=-1, howtoT0=0;
function openHowto(page){
  howtoPage=Math.max(0,Math.min(HOWTO.length-1,page|0));
  howtoT0=performance.now();
  paused=true;
  document.body.classList.add('howto-open');
  document.getElementById('howto').classList.remove('hidden');
  syncHowto();
}
function closeHowto(){
  howtoPage=-1; paused=false;
  document.body.classList.remove('howto-open');
  document.getElementById('howto').classList.add('hidden');
}
function advanceHowto(){
  if(howtoPage>=HOWTO.length-1){ closeHowto(); return; }
  howtoPage++; howtoT0=performance.now(); syncHowto();
}
function syncHowto(){
  document.getElementById('howtoCap').textContent=HOWTO[howtoPage].cap;
  const dots=document.getElementById('howtoDots');
  if(!dots.childElementCount) for(let i=0;i<HOWTO.length;i++) dots.appendChild(document.createElement('span'));
  for(let i=0;i<dots.children.length;i++) dots.children[i].classList.toggle('on',i===howtoPage);
  document.getElementById('howtoNext').textContent=(howtoPage>=HOWTO.length-1)?'tap to finish':'tap to continue';
}
function drawHowto(now){
  if(howtoPage<0) return;
  ctx.save();
  // fully opaque: the how-to is a self-contained teaching overlay; any bleed of
  // the paused level behind (busy levels ghost through even at 0.97) reads as a glitch
  ctx.fillStyle='#080b12'; ctx.fillRect(-OX,0,fullW,H); // full-screen scrim (drawn inside the OX translate)
  ctx.lineCap='round'; ctx.lineJoin='round';
  HOWTO[howtoPage].draw(Math.max(0,now-howtoT0));
  ctx.restore();
  ctx.globalCompositeOperation='source-over';
  ctx.globalAlpha=1;
}
// -- demo building blocks (imitate the world renderers, local coords) --
function howtoBasketBack(bx,byb,iw,wh){
  ctx.fillStyle='rgba(22,13,7,0.95)';
  ctx.fillRect(bx-iw/2+2,byb-wh+2,iw-4,wh-2);
}
function howtoBasketFront(bx,byb,iw,wh){
  const l=bx-iw/2, r=bx+iw/2, t=byb-wh, lw=Math.max(5,iw*0.075);
  ctx.strokeStyle='#b06a28'; ctx.lineWidth=lw;
  ctx.beginPath(); ctx.moveTo(l,t); ctx.lineTo(l,byb); ctx.lineTo(r,byb); ctx.lineTo(r,t); ctx.stroke();
  ctx.save(); ctx.globalCompositeOperation='lighter';
  for(const tx of [l,r]){
    const gl=ctx.createRadialGradient(tx,t,0,tx,t,iw*0.35);
    gl.addColorStop(0,'rgba(255,183,99,0.35)'); gl.addColorStop(1,'rgba(255,183,99,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(tx,t,iw*0.35,0,7); ctx.fill();
    ctx.beginPath(); ctx.arc(tx,t,lw*0.55,0,7); ctx.fillStyle='#ffcf8a'; ctx.fill();
  }
  ctx.restore();
}
function howtoWinGlow(bx,topY,k){
  if(k<=0) return;
  ctx.save(); ctx.globalCompositeOperation='lighter';
  const R=0.16*W*(1+(1-k)*1.2);
  const g=ctx.createRadialGradient(bx,topY,0,bx,topY,R);
  g.addColorStop(0,'rgba(255,195,115,'+(0.45*k).toFixed(3)+')'); g.addColorStop(1,'rgba(255,195,115,0)');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(bx,topY,R,0,7); ctx.fill();
  ctx.restore();
}
function howtoRope(x1,y1,x2,y2,taut){
  const base=Math.max(2,W*0.009);
  const seg=()=>{ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); };
  seg(); ctx.strokeStyle='rgba(10,6,2,0.55)'; ctx.lineWidth=base*(1.55-0.4*taut); ctx.stroke();
  seg(); ctx.strokeStyle='hsl(33,'+(48+taut*18)+'%,'+(46+taut*20)+'%)'; ctx.lineWidth=base*(1.15-0.4*taut); ctx.stroke();
  ctx.save(); ctx.setLineDash([base*1.6,base*2.6]);
  seg(); ctx.strokeStyle='rgba(255,214,150,'+(0.30+taut*0.30).toFixed(2)+')'; ctx.lineWidth=Math.max(1,base*0.42); ctx.stroke();
  ctx.restore();
}
function howtoSpikeStrip(x1,y,x2,ext,active){
  const L=x2-x1, h=S*0.30*ext, tw=Math.max(8,S*0.26), n=Math.max(2,Math.floor(L/tw));
  if(ext>0.02){
    ctx.strokeStyle='rgba(255,59,48,'+(0.30*ext).toFixed(3)+')'; ctx.lineWidth=7;
    ctx.beginPath(); ctx.moveTo(x1,y); ctx.lineTo(x2,y); ctx.stroke();
    ctx.fillStyle=active?'#e0342c':'#b0392f';
    for(let k=0;k<n;k++){
      const t0=k/n, t1=(k+1)/n, tm=(t0+t1)/2;
      ctx.beginPath();
      ctx.moveTo(x1+L*t0,y); ctx.lineTo(x1+L*tm,y-h); ctx.lineTo(x1+L*t1,y);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.strokeStyle='#5a1512'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(x1,y); ctx.lineTo(x2,y); ctx.stroke();
}
function howtoSweepHand(fx,fy,ax,fade,now){ // comet trail from ax→fx at height fy + ripple + hand
  ctx.save(); ctx.globalCompositeOperation='lighter';
  const grad=ctx.createLinearGradient(ax,fy,fx,fy);
  grad.addColorStop(0,'rgba(255,201,111,0)');
  grad.addColorStop(1,'rgba(255,214,140,'+(0.6*fade).toFixed(3)+')');
  ctx.strokeStyle=grad; ctx.lineWidth=7;
  ctx.beginPath(); ctx.moveTo(ax,fy); ctx.lineTo(fx,fy); ctx.stroke();
  ctx.restore();
  ctx.globalAlpha=fade;
  ctx.strokeStyle='rgba(255,214,140,.7)'; ctx.lineWidth=2.4;
  ctx.beginPath(); ctx.arc(fx,fy,13*(1+0.18*Math.sin(now/110)),0,7); ctx.stroke();
  ctx.fillStyle='rgba(255,224,170,.9)';
  ctx.beginPath(); ctx.arc(fx,fy,4,0,7); ctx.fill();
  ctx.globalAlpha=1;
  drawTutorialHand(fx,fy,5,fade);
}
// -- pages --
function howtoCutPage(tms){
  const cyc=3800, t=(tms%cyc)/cyc, now=tms;
  const cx=W/2, beamY=0.20*H, gs=0.13*W, hangY=0.36*H;
  const bkYb=0.60*H, iw=0.30*W, wh=0.085*H, cutT=0.42;
  ctx.fillStyle='#232b41'; roundRectPath(cx-0.20*W,beamY-6,0.40*W,12,5); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.fillRect(cx-0.20*W,beamY-6,0.40*W,2);
  howtoBasketBack(cx,bkYb,iw,wh);
  const midY=(beamY+hangY-gs/2)/2;
  if(t<cutT){
    const sway=Math.sin(now/620)*4;
    howtoRope(cx,beamY+4,cx+sway*0.4,hangY-gs/2,0.8);
    drawGhostCrate(cx+sway*0.4,hangY,gs,Math.min(1,t/0.05),1,sway*0.004);
    const sp=(t-0.10)/(cutT-0.10);
    if(sp>0&&sp<=1){
      const ax=cx-0.15*W, bx=cx+0.15*W;
      const p=sp<.5?2*sp*sp:1-Math.pow(-2*sp+2,2)/2;
      const fx=ax+(bx-ax)*p, fade=Math.min(1,Math.min(sp,1-sp)/0.15);
      howtoSweepHand(fx,midY,fx-(bx-ax)*Math.min(p,0.5),fade,now);
    }
  }else{
    const u=(t-cutT)/(1-cutT);
    const st=Math.max(0,1-u*2.2);
    if(st>0){ ctx.globalAlpha=st; howtoRope(cx,beamY+4,cx+8*Math.sin(now/300),midY-8,0.2); ctx.globalAlpha=1; }
    if(u<0.18){
      ctx.save(); ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle='rgba(255,214,140,'+((1-u/0.18)*0.8).toFixed(3)+')'; ctx.lineWidth=2.6;
      ctx.beginPath(); ctx.arc(cx,midY,6+u/0.18*20,0,7); ctx.stroke();
      ctx.restore();
    }
    const restY=bkYb-wh*0.42, fu=Math.min(1,u/0.55);
    const cy=hangY+(restY-hangY)*fu*fu;
    const alpha=u>0.9?1-(u-0.9)/0.1:1;
    const sq=(u>0.55&&u<0.72)?0.9:1;
    drawGhostCrate(cx,cy,gs,alpha*0.95,sq,0);
    howtoWinGlow(cx,bkYb-wh,(u>0.58&&u<0.95)?Math.max(0,1-(u-0.58)/0.37):0);
  }
  howtoBasketFront(cx,bkYb,iw,wh);
}
function howtoSpikePage(tms){
  const cyc=2600, t=(tms%cyc)/cyc, now=tms;
  const mx=W/2, y=0.50*H, x1=mx-0.19*W, x2=mx+0.19*W;
  const gs=0.12*W, rad=gs/2, startY=0.26*H, restY=y-S*0.30-rad-2;
  ctx.save(); ctx.globalCompositeOperation='lighter';
  const amb=0.08+0.10*(0.5+0.5*Math.sin(now/260));
  const g=ctx.createRadialGradient(mx,y,0,mx,y,0.16*W);
  g.addColorStop(0,'rgba(255,70,58,'+amb.toFixed(3)+')'); g.addColorStop(1,'rgba(255,70,58,0)');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(mx,y,0.16*W,0,7); ctx.fill();
  ctx.restore();
  howtoSpikeStrip(x1,y,x2,1,true);
  if(t<0.5){
    const u=t/0.5, gy=startY+(restY-startY)*u*u;
    drawGhostCrate(mx,gy,gs,(t<0.06?t/0.06:1)*0.95,1,0);
  }else{
    const u=(t-0.5)/0.5;
    ctx.save(); ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle='rgba(255,80,66,'+((1-u)*0.85).toFixed(3)+')'; ctx.lineWidth=3.2;
    ctx.beginPath(); ctx.arc(mx,restY,8+0.11*W*u,0,7); ctx.stroke();
    const flash=ctx.createRadialGradient(mx,restY,0,mx,restY,0.1*W);
    flash.addColorStop(0,'rgba(255,90,72,'+((1-u)*0.6).toFixed(3)+')'); flash.addColorStop(1,'rgba(255,90,72,0)');
    ctx.fillStyle=flash; ctx.beginPath(); ctx.arc(mx,restY,0.1*W,0,7); ctx.fill();
    ctx.restore();
    for(let i=0;i<4;i++){
      const ang=-Math.PI/2+(i-1.5)*0.55, sp=0.085*W;
      const fx=mx+Math.cos(ang)*sp*u, fy=restY+Math.sin(ang)*sp*u+0.5*0.34*H*u*u;
      drawGhostCrate(fx,fy,gs*0.42,(1-u)*0.9,1,(i-1.5)*0.6+u*2);
    }
  }
}
function howtoPadPage(tms){
  const cyc=2200, t=(tms%cyc)/cyc, now=tms;
  const mx=W/2, my=0.50*H, x1=mx-0.16*W, x2=mx+0.16*W;
  const gs=0.12*W, rad=gs/2, off=rad+6, hA=0.14*H, hB=0.22*H;
  const contact=Math.max(0,1-Math.abs(t-0.42)/0.09);
  ctx.strokeStyle='rgba(88,213,255,0.22)'; ctx.lineWidth=11;
  ctx.beginPath(); ctx.moveTo(x1,my); ctx.lineTo(x2,my); ctx.stroke();
  ctx.save(); ctx.globalCompositeOperation='lighter';
  ctx.strokeStyle='rgba(88,213,255,'+(0.16+0.5*contact+0.1*(0.5+0.5*Math.sin(now/230))).toFixed(3)+')';
  ctx.lineWidth=11; ctx.beginPath(); ctx.moveTo(x1,my); ctx.lineTo(x2,my); ctx.stroke();
  if(contact>0.02){
    ctx.strokeStyle='rgba(150,224,255,'+(contact*0.7).toFixed(3)+')'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(mx,my,10+22*(1-contact),0,7); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle='#58d5ff'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(x1,my); ctx.lineTo(x2,my); ctx.stroke();
  ctx.strokeStyle='#2e3750'; ctx.lineWidth=4;
  for(const ex of [x1,x2]){ ctx.beginPath(); ctx.moveTo(ex,my); ctx.lineTo(ex,my+10); ctx.stroke(); }
  let dist, alpha=1;
  if(t<0.42){ const u=t/0.42; dist=hA+(off-hA)*(u*u); }
  else if(t<0.86){ const u=(t-0.42)/0.44; dist=off+(hB-off)*Math.sin(u*Math.PI/2); }
  else { dist=hB; alpha=1-(t-0.86)/0.14; }
  if(t<0.06) alpha=t/0.06;
  drawGhostCrate(mx,my-dist,gs,alpha,1-0.32*contact,0);
}
function howtoPulleyPage(tms){
  const cyc=3000, t=(tms%cyc)/cyc, now=tms;
  const cx=W/2, py=0.26*H, r=15;
  const wx=cx+0.17*W, cxx=cx-0.17*W, gs=0.11*W, ws=0.085*W;
  let k, alpha=1;
  if(t<0.18){ k=0; alpha=t<0.06?t/0.06:1; }
  else if(t<0.80){ const u=(t-0.18)/0.62; k=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2; }
  else { k=1; alpha=1-(t-0.80)/0.20; }
  const yC=0.50*H-0.16*H*k, yW=0.36*H+0.16*H*k;
  ctx.globalAlpha=alpha;
  howtoRope(cxx,yC-gs/2,cx-r,py,1);
  howtoRope(cx+r,py,wx,yW-ws/2,1);
  ctx.strokeStyle='hsl(33,60%,58%)'; ctx.lineWidth=Math.max(2,W*0.009);
  ctx.beginPath(); ctx.arc(cx,py,r+2,Math.PI,0); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,py,r,0,7); ctx.fillStyle='#222939'; ctx.fill();
  ctx.lineWidth=2.5; ctx.strokeStyle='#39445f'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,py,r*0.32,0,7); ctx.fillStyle='#39445f'; ctx.fill();
  drawGhostCrate(cxx,yC,gs,alpha*0.95,1,0);
  ctx.fillStyle='#3d434f'; roundRectPath(wx-ws/2,yW-ws/2,ws,ws,3); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.10)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(wx-ws/2+3,yW-ws/2+3); ctx.lineTo(wx+ws/2-3,yW+ws/2-3);
  ctx.moveTo(wx+ws/2-3,yW-ws/2+3); ctx.lineTo(wx-ws/2+3,yW+ws/2-3); ctx.stroke();
  ctx.strokeStyle='#1d222c'; ctx.lineWidth=2.5; roundRectPath(wx-ws/2,yW-ws/2,ws,ws,3); ctx.stroke();
  if(k>0.02&&k<0.98){
    for(let i=0;i<3;i++){
      const ph=((now/900)+i/3)%1, a=Math.sin(ph*Math.PI)*0.8;
      let yy=yW+ws*0.9+ph*0.07*H;
      ctx.strokeStyle='rgba(255,140,130,'+a.toFixed(3)+')'; ctx.lineWidth=3.2;
      ctx.beginPath(); ctx.moveTo(wx-11,yy); ctx.lineTo(wx,yy+9); ctx.lineTo(wx+11,yy); ctx.stroke();
      yy=yC-gs*0.9-ph*0.07*H;
      ctx.strokeStyle='rgba(150,224,255,'+a.toFixed(3)+')';
      ctx.beginPath(); ctx.moveTo(cxx-11,yy+9); ctx.lineTo(cxx,yy); ctx.lineTo(cxx+11,yy+9); ctx.stroke();
    }
  }
  ctx.globalAlpha=1;
}
function howtoBalloonPage(tms){
  const cyc=3400, t=(tms%cyc)/cyc, now=tms;
  const cx=W/2, r=0.055*W, gs=0.11*W, popT=0.40;
  const bkYb=0.62*H, iw=0.28*W, wh=0.08*H;
  const bobY=0.28*H+Math.sin(now/520)*4, crateY=bobY+r+0.10*H;
  howtoBasketBack(cx,bkYb,iw,wh);
  if(t<popT){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const gl=ctx.createRadialGradient(cx,bobY,0,cx,bobY,r*1.9);
    gl.addColorStop(0,'rgba(255,168,90,0.30)'); gl.addColorStop(1,'rgba(255,168,90,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(cx,bobY,r*1.9,0,7); ctx.fill();
    ctx.restore();
    ctx.strokeStyle='rgba(220,225,235,0.45)'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.moveTo(cx,bobY+r*0.98);
    ctx.quadraticCurveTo(cx+5,(bobY+crateY)/2,cx,crateY-gs/2); ctx.stroke();
    ctx.save(); ctx.translate(cx,bobY);
    const grad=ctx.createRadialGradient(-r*0.3,-r*0.42,r*0.1,0,0,r);
    grad.addColorStop(0,'#ffcf8f'); grad.addColorStop(0.55,'#f2843c'); grad.addColorStop(1,'#c8672a');
    ctx.fillStyle=grad; ctx.beginPath(); ctx.ellipse(0,0,r*0.86,r,0,0,7); ctx.fill();
    ctx.strokeStyle='rgba(120,60,20,0.35)'; ctx.lineWidth=1.4; ctx.stroke();
    ctx.fillStyle='#c8672a';
    ctx.beginPath(); ctx.moveTo(-3,r*0.95); ctx.lineTo(3,r*0.95); ctx.lineTo(0,r*1.13); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-r*0.32,-r*0.4,r*0.15,r*0.26,-0.4,0,7); ctx.fill();
    ctx.restore();
    const pulse=0.5+0.5*Math.sin(now/240);
    ctx.strokeStyle='rgba(255,224,170,'+(0.3+0.34*pulse).toFixed(3)+')'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(cx,bobY,r*1.16+pulse*4,0,7); ctx.stroke();
    drawGhostCrate(cx,crateY,gs,0.9*Math.min(1,t/0.06),1,0);
    const ap=Math.max(0,(t-(popT-0.24))/0.24);
    if(ap>0){
      const fx=cx-r*1.7+r*1.9*ap, fade=Math.min(1,ap/0.15);
      ctx.save(); ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle='rgba(255,236,190,'+(0.55*fade).toFixed(3)+')'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(fx-r*0.7,bobY); ctx.lineTo(fx,bobY); ctx.stroke();
      ctx.restore();
      drawTutorialHand(fx,bobY,4.4,fade);
    }
  }else{
    const u=(t-popT)/(1-popT), popY=0.28*H;
    if(u<0.28){
      const b=u/0.28, R=r*(0.6+b*1.6);
      ctx.save(); ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle='rgba(255,196,128,'+((1-b)*0.8).toFixed(3)+')'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(cx,popY,R,0,7); ctx.stroke();
      for(let i=0;i<6;i++){ const a=i/6*6.28;
        ctx.fillStyle='rgba(255,214,150,'+((1-b)*0.75).toFixed(3)+')';
        ctx.beginPath(); ctx.arc(cx+Math.cos(a)*R*0.9,popY+Math.sin(a)*R*0.9,2.2,0,7); ctx.fill(); }
      ctx.restore();
    }
    const startY=popY+r+0.10*H, endY=bkYb-wh*0.42;
    const e=Math.min(1,u/0.62), gy=startY+(endY-startY)*e*e;
    const ga=u>0.86?1-(u-0.86)/0.14:1;
    drawGhostCrate(cx,gy,gs,ga*0.95,1,0);
    howtoWinGlow(cx,bkYb-wh,(u>0.62&&u<0.95)?Math.max(0,1-(u-0.62)/0.33):0);
  }
  howtoBasketFront(cx,bkYb,iw,wh);
}
function howtoTrolleyPage(tms){
  const now=tms, y=0.28*H, x1=W/2-0.22*W, x2=W/2+0.22*W;
  ctx.strokeStyle='#2a3350'; ctx.lineWidth=5;
  ctx.beginPath(); ctx.moveTo(x1,y); ctx.lineTo(x2,y); ctx.stroke();
  ctx.strokeStyle='#3a4664'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(x1,y-2); ctx.lineTo(x2,y-2); ctx.stroke();
  ctx.fillStyle='#1e2536';
  for(const ex of [x1,x2]){ ctx.beginPath(); ctx.arc(ex,y,4.5,0,7); ctx.fill(); }
  const ph=(now%2600)/2600, k=0.5-0.5*Math.cos(ph*Math.PI*2);
  const px=x1+(x2-x1)*(0.10+0.80*k), dirx=Math.sin(ph*Math.PI*2)>=0?1:-1;
  const gs=0.11*W, lag=-dirx*9, cy=y+0.17*H;
  howtoRope(px,y+3,px+lag,cy-gs/2,0.85);
  drawGhostCrate(px+lag,cy,gs,0.95,1,lag*0.006);
  ctx.save(); ctx.translate(px,y);
  ctx.fillStyle='#0a0c12';
  ctx.beginPath(); ctx.arc(-7,-9,3.4,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(7,-9,3.4,0,7); ctx.fill();
  ctx.fillStyle='#2b3446'; roundRectPath(-13,-8,26,15,4); ctx.fill();
  ctx.strokeStyle='#46527a'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='#ffb347'; ctx.beginPath(); ctx.arc(0,4,2.4,0,7); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation='lighter';
  for(let i=0;i<3;i++){
    const p2=((now/650)+i/3)%1, x=px+dirx*(14+p2*40), a=Math.sin(p2*Math.PI)*0.7;
    ctx.strokeStyle='rgba(150,205,255,'+a.toFixed(3)+')'; ctx.lineWidth=3.2;
    ctx.beginPath(); ctx.moveTo(x,y-5); ctx.lineTo(x+dirx*9,y); ctx.lineTo(x,y+5); ctx.stroke();
  }
  ctx.restore();
}
function howtoPulsePage(tms){
  const cyc=3600, t=(tms%cyc)/cyc, now=tms;
  const y=0.44*H, x1=W/2-0.20*W, x2=W/2+0.20*W, mx=W/2;
  const bkYb=0.64*H, iw=0.26*W, wh=0.075*H;
  let ext;
  if(t<0.30) ext=1;
  else if(t<0.38) ext=1-(t-0.30)/0.08;
  else if(t<0.72) ext=0;
  else if(t<0.80) ext=(t-0.72)/0.08;
  else ext=1;
  howtoBasketBack(mx,bkYb,iw,wh);
  ctx.strokeStyle='#39445f'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(x1,y); ctx.lineTo(x2,y); ctx.stroke();
  if(ext<0.05&&t<0.60){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const g=ctx.createRadialGradient(mx,y,0,mx,y,0.20*W);
    g.addColorStop(0,'rgba(120,230,150,0.16)'); g.addColorStop(1,'rgba(120,230,150,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(mx,y,0.20*W,0,7); ctx.fill();
    ctx.restore();
    for(let i=0;i<3;i++){
      const p2=((now/600)+i/3)%1, yy=y-0.10*H+p2*0.08*H, a=Math.sin(p2*Math.PI)*0.85;
      ctx.strokeStyle='rgba(150,240,170,'+a.toFixed(3)+')'; ctx.lineWidth=3.2;
      ctx.beginPath(); ctx.moveTo(mx-11,yy); ctx.lineTo(mx,yy+9); ctx.lineTo(mx+11,yy); ctx.stroke();
    }
  }
  if(t>0.62&&t<0.72){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const gl=0.5+0.5*Math.sin(now/90);
    ctx.strokeStyle='rgba(255,59,48,'+(0.10+0.16*gl).toFixed(3)+')'; ctx.lineWidth=9;
    ctx.beginPath(); ctx.moveTo(x1,y); ctx.lineTo(x2,y); ctx.stroke();
    ctx.restore();
  }
  howtoSpikeStrip(x1,y,x2,ext,ext>0.6);
  if(t>=0.34){
    const u=Math.min(1,(t-0.34)/0.30);
    const sy=0.22*H, ey=bkYb-wh*0.42, gy=sy+(ey-sy)*u*u;
    let ga=1;
    if(t<0.40) ga=(t-0.34)/0.06;
    if(t>0.94) ga=1-(t-0.94)/0.06;
    drawGhostCrate(mx,gy,0.10*W,ga*0.95,1,0);
    howtoWinGlow(mx,bkYb-wh,(u>=1&&t<0.94)?Math.max(0,1-(t-0.64)/0.30):0);
  }
  howtoBasketFront(mx,bkYb,iw,wh);
}
// a teal spring coil between two points (how-to demo — mirrors drawElasticChain)
function howtoSpringCoil(x0,y0,x1,y1,base){
  const dx=x1-x0, dy=y1-y0, L=Math.hypot(dx,dy)||1, nx=-dy/L, ny=dx/L;
  const amp=Math.max(6,base*2.2), turns=Math.max(5,Math.round(L/Math.max(10,base*2.6))), seg=turns*2;
  const coil=[[x0,y0]];
  for(let i=1;i<seg;i++){ const tt=i/seg, s=(i%2?1:-1); coil.push([x0+dx*tt+nx*amp*s, y0+dy*tt+ny*amp*s]); }
  coil.push([x1,y1]);
  const draw=()=>{ ctx.beginPath(); ctx.moveTo(coil[0][0],coil[0][1]); for(let i=1;i<coil.length;i++) ctx.lineTo(coil[i][0],coil[i][1]); };
  ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
  draw(); ctx.strokeStyle='rgba(6,20,20,0.5)'; ctx.lineWidth=base*1.4; ctx.stroke();
  ctx.globalCompositeOperation='lighter';
  draw(); ctx.strokeStyle='rgba(95,224,208,0.72)'; ctx.lineWidth=base*0.95; ctx.stroke();
  for(const p of [[x0,y0],[x1,y1]]){ ctx.beginPath(); ctx.arc(p[0],p[1],base*0.9,0,7); ctx.fillStyle='rgba(150,240,225,0.9)'; ctx.fill(); }
  ctx.restore(); ctx.globalCompositeOperation='source-over';
}
function howtoElasticPage(tms){
  const cyc=3800, t=(tms%cyc)/cyc, now=tms, base=Math.max(2,W*0.009);
  const anchorX=0.64*W, anchorY=0.12*H;
  const startX=0.34*W, startY=0.52*H;
  const bkX=0.72*W, bkYb=0.82*H, iw=0.26*W, wh=0.075*H, cutT=0.42;
  ctx.fillStyle='#232b41'; roundRectPath(anchorX-0.10*W,anchorY-6,0.20*W,12,5); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.fillRect(anchorX-0.10*W,anchorY-6,0.20*W,2);
  howtoBasketBack(bkX,bkYb,iw,wh);
  let cx,cy,alpha=1;
  if(t<cutT){
    const bob=Math.sin(now/280)*0.02*H;
    cx=startX; cy=startY+bob;
    howtoSpringCoil(anchorX,anchorY,cx,cy-0.055*H,base);
    drawGhostCrate(cx,cy,0.11*W,Math.min(1,t/0.06)*0.95,1,0);
    const ap=Math.max(0,(t-(cutT-0.24))/0.24);
    if(ap>0){
      const midx=(anchorX+cx)/2, midy=(anchorY+cy)/2;
      const fx=midx-0.09*W+0.18*W*ap, fade=Math.min(1,ap/0.15);
      howtoSweepHand(fx,midy,fx-0.10*W,fade,now);
    }
  }else{
    const u=(t-cutT)/(1-cutT);
    const ex=bkX, ey=bkYb-wh*0.42;
    cx=startX+(ex-startX)*u;
    cy=startY+(ey-startY)*u - Math.sin(Math.min(1,u)*Math.PI)*0.16*H; // fling arc
    if(u>0.9) alpha=1-(u-0.9)/0.1;
    if(u<0.14){ ctx.save(); ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle='rgba(95,224,208,'+((1-u/0.14)*0.75).toFixed(3)+')'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(startX,startY,6+u/0.14*30,0,7); ctx.stroke(); ctx.restore(); }
    drawGhostCrate(cx,cy,0.11*W,alpha*0.95,1,0);
    howtoWinGlow(bkX,bkYb-wh,(u>0.62&&u<0.95)?Math.max(0,1-(u-0.62)/0.33):0);
  }
  howtoBasketFront(bkX,bkYb,iw,wh);
}
function howtoRotorPage(tms){
  const now=tms, cx=0.5*W, cy=0.30*H, R=0.15*W;
  const bkX=0.5*W, bkYb=0.78*H, iw=0.26*W, wh=0.075*H;
  howtoBasketBack(bkX,bkYb,iw,wh);
  // orbit ring + hub (the world's rotor look)
  ctx.save();
  ctx.strokeStyle='rgba(120,150,210,0.2)'; ctx.lineWidth=1.5; ctx.setLineDash([3,5]);
  ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='#2a3350'; ctx.beginPath(); ctx.arc(cx,cy,5,0,7); ctx.fill();
  ctx.strokeStyle='#46527a'; ctx.lineWidth=1.5; ctx.stroke();
  const cyc=3000, t=(now%cyc)/cyc;
  const relT=0.55; // carriage reaches the bottom of the orbit here
  const ang=Math.PI/2+(t<relT? (t/relT-1)*4.4 : 0); // sweeps into bottom position
  const px=cx+Math.cos(ang)*R, py=cy+Math.sin(ang)*R;
  ctx.strokeStyle='#3a4664'; ctx.lineWidth=3; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(px,py); ctx.stroke();
  ctx.fillStyle='#2b3446'; ctx.beginPath(); ctx.arc(px,py,6,0,7); ctx.fill();
  ctx.strokeStyle='#46527a'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.restore();
  // release marker at the bottom of the orbit (over the basket)
  const pulse=0.5+0.5*Math.sin(now/240);
  ctx.save(); ctx.globalCompositeOperation='lighter';
  ctx.strokeStyle='rgba(150,205,255,'+(0.3+0.3*pulse).toFixed(3)+')'; ctx.lineWidth=2.6;
  ctx.beginPath(); ctx.arc(cx,cy+R,14+pulse*4,0,7); ctx.stroke(); ctx.restore();
  // crate: swings with the carriage, releases at the marker, drops into the basket
  const gs=0.10*W;
  if(t<relT){
    drawGhostCrate(px,py+0.075*H,gs,Math.min(1,t/0.06)*0.95,1,0);
    howtoRope(px,py,px,py+0.075*H-gs/2,0.85);
  }else{
    const u=(t-relT)/(1-relT), sy=cy+R+0.075*H, ey=bkYb-wh*0.42;
    const gy=sy+(ey-sy)*u*u; let ga=1; if(u>0.88) ga=1-(u-0.88)/0.12;
    drawGhostCrate(cx,gy,gs,ga*0.95,1,0);
    howtoWinGlow(bkX,bkYb-wh,(u>0.6&&u<0.95)?Math.max(0,1-(u-0.6)/0.35):0);
  }
  howtoBasketFront(bkX,bkYb,iw,wh);
}
function howtoBladePage(tms){
  const now=tms, cx=0.5*W, cy=0.48*H, r=0.075*W;
  const cyc=2400, t=(now%cyc)/cyc;
  // spinning toothed disc (world look, local geometry)
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(now/300);
  ctx.globalCompositeOperation='lighter';
  const gl=ctx.createRadialGradient(0,0,0,0,0,r*1.6);
  gl.addColorStop(0,'rgba(255,70,58,0.18)'); gl.addColorStop(1,'rgba(255,70,58,0)');
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(0,0,r*1.6,0,7); ctx.fill();
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle='#c33'; ctx.beginPath();
  for(let i=0;i<12;i++){ const a0=i/12*6.283, a1=(i+0.5)/12*6.283;
    ctx.lineTo(Math.cos(a0)*r,Math.sin(a0)*r); ctx.lineTo(Math.cos(a1)*r*0.82,Math.sin(a1)*r*0.82); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle='#8a2b26'; ctx.beginPath(); ctx.arc(0,0,r*0.55,0,7); ctx.fill();
  ctx.fillStyle='#1e2536'; ctx.beginPath(); ctx.arc(0,0,r*0.14,0,7); ctx.fill();
  ctx.restore();
  // ghost crate falls onto it and shatters (the spike-page teach, rotary flavor)
  const gs=0.10*W;
  if(t<0.5){
    const u=t/0.5, sy=cy-0.16*H, gy=sy+(cy-r-gs/2-sy)*u*u;
    drawGhostCrate(cx,gy,gs,(t<0.06?t/0.06:1)*0.95,1,0);
  }else{
    const u=(t-0.5)/0.5;
    ctx.save(); ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle='rgba(255,80,66,'+((1-u)*0.85).toFixed(3)+')'; ctx.lineWidth=3.2;
    ctx.beginPath(); ctx.arc(cx,cy-r,8+0.1*W*u,0,7); ctx.stroke(); ctx.restore();
    for(let i=0;i<4;i++){ const ang=-Math.PI/2+(i-1.5)*0.55, sp=0.08*W;
      const fx=cx+Math.cos(ang)*sp*u, fy=cy-r+Math.sin(ang)*sp*u+0.5*0.3*H*u*u;
      drawGhostCrate(fx,fy,gs*0.42,(1-u)*0.9,1,(i-1.5)*0.6+u*2); }
  }
}
function howtoWindPage(tms){
  const now=tms;
  const zx=0.14*W, zy=0.34*H, zw=0.6*W, zh=0.3*H;
  const bkX=0.76*W, bkYb=0.80*H, iw=0.26*W, wh=0.075*H;
  howtoBasketBack(bkX,bkYb,iw,wh);
  // wind zone (world look): dashed rect + drifting arrows
  ctx.save();
  ctx.fillStyle='rgba(150,205,255,0.05)'; ctx.fillRect(zx,zy,zw,zh);
  ctx.strokeStyle='rgba(150,205,255,0.14)'; ctx.setLineDash([4,6]); ctx.lineWidth=1.5;
  ctx.strokeRect(zx,zy,zw,zh); ctx.setLineDash([]);
  ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
  for(let i=0;i<6;i++){
    const ph=((now/1400)+i*0.19)%1, lane=(i*0.31+0.15)%1;
    const ax=zx+zw*0.06+zw*0.85*ph, ay=zy+zh*lane, a=Math.sin(ph*Math.PI)*0.4;
    ctx.strokeStyle='rgba(180,220,255,'+a.toFixed(3)+')'; ctx.lineWidth=2.2;
    ctx.beginPath(); ctx.moveTo(ax-9,ay); ctx.lineTo(ax+7,ay);
    ctx.moveTo(ax+7,ay); ctx.lineTo(ax+1,ay-4); ctx.moveTo(ax+7,ay); ctx.lineTo(ax+1,ay+4); ctx.stroke();
  }
  ctx.restore(); ctx.globalCompositeOperation='source-over';
  // ghost crate drops in on the left, gets carried right, lands in the basket
  const cyc=3000, t=(now%cyc)/cyc, gs=0.10*W;
  const sx=zx+zw*0.15, sy=zy-0.06*H;
  const gx=sx+(bkX-sx)*(t*t*0.4+t*0.6), gy=sy+(bkYb-wh*0.42-sy)*(t*t);
  let ga=1; if(t<0.08) ga=t/0.08; if(t>0.9) ga=1-(t-0.9)/0.1;
  drawGhostCrate(gx,gy,gs,ga*0.95,1,0);
  howtoWinGlow(bkX,bkYb-wh,(t>0.72&&t<0.97)?Math.max(0,1-(t-0.72)/0.25):0);
  howtoBasketFront(bkX,bkYb,iw,wh);
}
function howtoMagnetPage(tms){
  const now=tms, mx=0.62*W, my=0.42*H;
  const bkX=0.62*W, bkYb=0.80*H, iw=0.26*W, wh=0.075*H;
  howtoBasketBack(bkX,bkYb,iw,wh);
  // pulsing field rings + the horseshoe
  ctx.save(); ctx.globalCompositeOperation='lighter';
  for(let i=0;i<3;i++){
    const ph=((now/2600)+i/3)%1, rr=0.06*W+0.16*W*ph, a=(1-ph)*0.13;
    ctx.strokeStyle='rgba(190,140,255,'+a.toFixed(3)+')'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(mx,my,rr,0,7); ctx.stroke();
  }
  ctx.restore(); ctx.globalCompositeOperation='source-over';
  drawHorseshoe(mx,my,0.032*W);
  // ghost crate falls from the upper-left; the pull bends its path toward the
  // magnet (field dashes + glinting iron corners), then it drops into the basket
  const cyc=3200, t=(now%cyc)/cyc, gs=0.10*W;
  const sx=0.26*W, sy=0.16*H;
  const bendX=sx+(mx-sx)*Math.min(1,t*1.5), gx=bendX, gy=sy+(bkYb-wh*0.42-sy)*(t*t);
  let ga=1; if(t<0.08) ga=t/0.08; if(t>0.9) ga=1-(t-0.9)/0.1;
  // field dashes from crate toward the magnet while in range
  const dx=mx-gx, dy=my-gy, d=Math.hypot(dx,dy);
  if(d<0.3*W&&d>10){
    const ux=dx/d, uy=dy/d;
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
    for(let i=0;i<3;i++){
      const ph=((now/900)+i/3)%1, px=gx+dx*ph, py=gy+dy*ph, a=Math.sin(ph*Math.PI)*0.5*ga;
      ctx.strokeStyle='rgba(200,155,255,'+a.toFixed(3)+')'; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.moveTo(px-ux*7,py-uy*7); ctx.lineTo(px+ux*4,py+uy*4); ctx.stroke();
    }
    // glint the ghost's iron corners
    const h=gs/2, gl=0.35+0.3*(0.5+0.5*Math.sin(now/140));
    for(const [ox,oy] of [[-h,-h],[h,-h],[h,h],[-h,h]]){
      ctx.fillStyle='rgba(205,170,255,'+(gl*ga).toFixed(3)+')';
      ctx.beginPath(); ctx.arc(gx+ox,gy+oy,2.8,0,7); ctx.fill();
    }
    ctx.restore(); ctx.globalCompositeOperation='source-over';
  }
  drawGhostCrate(gx,gy,gs,ga*0.95,1,0);
  howtoWinGlow(bkX,bkYb-wh,(t>0.72&&t<0.97)?Math.max(0,1-(t-0.72)/0.25):0);
  howtoBasketFront(bkX,bkYb,iw,wh);
}
function howtoStarPage(tms){
  const now=tms, sx=0.5*W, sy=0.40*H, sr=0.05*W;
  const bkX=0.5*W, bkYb=0.80*H, iw=0.26*W, wh=0.075*H;
  howtoBasketBack(bkX,bkYb,iw,wh);
  const cyc=3200, t=(now%cyc)/cyc, passT=0.45, pulse=0.5+0.5*Math.sin(now/240);
  const collected=t>=passT;
  // the field star (until collected)
  if(!collected){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const gl=ctx.createRadialGradient(sx,sy,0,sx,sy,sr*2.2);
    gl.addColorStop(0,'rgba(255,214,110,0.5)'); gl.addColorStop(1,'rgba(255,214,110,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(sx,sy,sr*2.2,0,7); ctx.fill();
    ctx.restore(); ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='#ffd76a'; ctx.strokeStyle='#c8912f'; ctx.lineWidth=2;
    starPath(sx,sy,sr,sr*0.46,now/900); ctx.fill(); ctx.stroke();
  }else if(t<passT+0.1){
    const k=(t-passT)/0.1;
    ctx.save(); ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle='rgba(255,224,140,'+((1-k)*0.8).toFixed(3)+')'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(sx,sy,sr*(0.6+k*1.8),0,7); ctx.stroke(); ctx.restore();
  }
  // the basket's badge slot: dim outline until the star is collected, then gold
  const bs=Math.max(7,0.02*W), by=bkYb-wh-0.035*H;
  if(collected){ ctx.fillStyle='#ffd76a'; ctx.strokeStyle='#c8912f'; }
  else{ ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.strokeStyle='rgba(200,208,228,0.5)'; }
  ctx.lineWidth=1.6; starPath(bkX,by,bs,bs*0.46,0); ctx.fill(); ctx.stroke();
  // ghost crate: falls through the star, then on into the basket
  const gs=0.10*W; let gx,gy,ga=1;
  if(t<passT){ const u=t/passT; gx=sx; gy=sy-0.16*H+0.16*H*u*u; if(t<0.08) ga=t/0.08; }
  else{ const u=(t-passT)/(1-passT); gx=sx; gy=sy+(bkYb-wh*0.42-sy)*(u*u); if(u>0.88) ga=1-(u-0.88)/0.12; }
  drawGhostCrate(gx,gy,gs,ga*0.95,1,0);
  howtoWinGlow(bkX,bkYb-wh,(collected&&t>0.75&&t<0.97)?Math.max(0,1-(t-0.75)/0.22):0);
  howtoBasketFront(bkX,bkYb,iw,wh);
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
  // ALWAYS clear the frame first. bgCv is an OFFSCREEN canvas whose backing store
  // iOS WKWebView can PURGE during long backgrounding — then drawImage(bgCv) paints
  // nothing, the frame never clears, and every draw accumulates on top of the last
  // (the crate smears into a tall tower, confetti leave trails — the "render bug"
  // hit on device after an overnight background). This fillRect guarantees a clean
  // frame regardless of bgCv's state; makeBgCache on resume restores the pretty bg.
  ctx.fillStyle='#090b11'; ctx.fillRect(0,0,fullW,H);
  if(bgCv) ctx.drawImage(bgCv,0,0,fullW,H);
  // fireflies drift across the FULL width (atmosphere, not gameplay)
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
  // GAMEPLAY + overlays render in the centered play field (OX offset)
  ctx.save(); ctx.translate(OX,0);
  if(basket){
    const pool=ctx.createRadialGradient(basket.x,FLOORY,0,basket.x,FLOORY,S*2.4);
    pool.addColorStop(0,'rgba(255,183,99,0.13)'); pool.addColorStop(1,'rgba(255,183,99,0)');
    ctx.fillStyle=pool;
    ctx.beginPath(); ctx.ellipse(basket.x,FLOORY+2,S*2.4,S*0.55,0,0,7); ctx.fill();
  }
  drawBeams();
  drawSegs();
  drawWinds();
  drawTrolleys();
  drawRotors();
  drawMagnets();
  drawBasketBack();
  drawRopes();
  for(const b of boxes) if(b.kind!=='crate') drawBox(b);
  if(crate) drawBox(crate);
  drawMagnetPull();
  drawBlades();
  drawStars();
  drawBalloons();
  drawBasketFront();
  drawStarBadges();
  drawFX(now);
  if(vgCv) ctx.drawImage(vgCv,-OX,0,fullW,H); // full-width vignette (drawn at -OX inside the OX translate → screen 0..fullW)
  drawGestureHint(now);
  drawCue(now);
  if(phase==='end') drawEndCrates(now);
  drawHowto(now);
  ctx.restore();
  if(crate&&phase==='play'&&!paused){
    const v=boxVel(crate);
    updateWhoosh(Math.hypot(v.vx,v.vy));
  }else updateWhoosh(0);
}
/* ============================== input ============================== */
function evtPos(e){
  // canvas is full-screen; subtract OX so pointer maps into the centered play field
  const r=cv.getBoundingClientRect();
  return [e.clientX-r.left-OX,e.clientY-r.top];
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
  if(howtoPage>=0){ advanceHowto(); return; }
  if(phase==='end'){
    if(endT>90){ // tap after the card shows → play again from the top
      const ec=document.getElementById('endcard'); if(ec) ec.classList.remove('show');
      level=0; buildLevel(0); trackLevelStart();
    }
    return;
  }
  try{ cv.setPointerCapture(e.pointerId); }catch(_){}
  ptrDown=true;
  const [x,y]=evtPos(e);
  lastPX=x; lastPY=y;
  streak.push({x,y,t:performance.now()});
});
cv.addEventListener('pointermove',e=>{
  // `paused` is true whenever Settings or the How-to overlay is open; a pointer
  // captured BEFORE the overlay opened keeps ptrDown=true and would otherwise
  // keep cutting ropes on the frozen board underneath (setPointerCapture bypasses
  // the DOM scrims). Freeze cutting while paused.
  if(!ptrDown||paused) return;
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
  lvlEl.textContent='LEVEL '+(level+1);
  renderDevJump();
}
// DEV-ONLY level jump — a grid in the Settings sheet for reaching any level on
// device while authoring content. Shown ONLY on DEV_UNLOCK builds (native
// #if-DEBUG __DEV_BUILD, or plain-http localhost/LAN); stripped from the shipping
// App Store build, so the player-facing UI stays chrome-free (Qi's call).
const devLevelsEl=document.getElementById('devLevels');
const devCells=[];
function initDevJump(){
  if(!DEV_UNLOCK||!devLevelsEl) return;
  const wrap=document.getElementById('devJump'); if(wrap) wrap.classList.remove('hidden');
  for(let i=0;i<=LAST;i++){
    const c=document.createElement('button');
    c.className='lvlCell'; c.type='button'; c.textContent=(i+1);
    c.addEventListener('click',()=>{
      const switching=i!==level;
      level=i; buildLevel(i); renderDevJump(); closeSettings();
      if(switching) trackLevelStart();
    });
    devLevelsEl.appendChild(c); devCells.push(c);
  }
}
function renderDevJump(){
  if(!devCells.length) return;
  for(let i=0;i<=LAST;i++){ if(devCells[i]) devCells[i].className='lvlCell'+(cleared[i]?' cleared':'')+(i===level?' cur':''); }
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
  setEl.classList.remove('show');
  paused=howtoPage>=0; // a stray tap on the fading sheet must not unfreeze the tutorial
  setTimeout(()=>setEl.classList.add('hidden'),240);
}
function initSettings(){
  renderSettings();
  setBtn.addEventListener('click',openSettings);
  document.getElementById('setScrim').addEventListener('click',closeSettings);
  document.getElementById('setClose').addEventListener('click',closeSettings);
  document.getElementById('setRestart').addEventListener('click',()=>{ buildLevel(level); closeSettings(); });
  document.getElementById('setHow').addEventListener('click',()=>{ closeSettings(); openHowto(0); });
  document.getElementById('howtoClose').addEventListener('click',closeHowto);
  document.querySelectorAll('#settings .setRow').forEach(row=>{
    row.addEventListener('click',()=>{
      const k=row.dataset.k; settings[k]=!settings[k]; saveSettings(); renderSettings();
      healAudio();
      applyAudioSettings();
      if(k==='vibration'&&settings.vibration) vibe(14);
    });
  });
  const panel=new URLSearchParams(location.search).get('panel');
  if(panel==='settings') openSettings();
  if(panel==='howto') openHowto(0);
}
/* ============================== boot ============================== */
function seededRng(seed){ let s=seed; return ()=>{ s=(s*16807+11)%2147483647; return (s&0xffff)/0xffff; }; }
function makeBgCache(){
  // background spans the FULL screen width (fullW), so on wide screens the sky,
  // stars, moon, mist and floor continue seamlessly into the play field's margins
  // — no visible panel edge. Star/mound density scales with fullW/W so the margins
  // are as starry as the centered play column.
  const fw=fullW||W, dens=fw/W;
  const floorY=H*0.985;
  bgCv=document.createElement('canvas');
  bgCv.width=Math.round(fw*DPR); bgCv.height=Math.round(H*DPR);
  const c=bgCv.getContext('2d');
  c.scale(DPR,DPR);
  const bg=c.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#16203a'); bg.addColorStop(0.55,'#0c1017'); bg.addColorStop(1,'#090b11');
  c.fillStyle=bg; c.fillRect(0,0,fw,H);
  const moon=c.createRadialGradient(fw*0.5-W*0.12,H*0.09,0,fw*0.5-W*0.12,H*0.09,Math.max(fw,H)*0.55);
  moon.addColorStop(0,'rgba(140,165,215,0.16)'); moon.addColorStop(1,'rgba(140,165,215,0)');
  c.fillStyle=moon; c.fillRect(0,0,fw,H*0.62);
  const r=seededRng(3);
  c.fillStyle='#cfd8ea';
  for(let i=0;i<Math.round(52*dens);i++){ c.globalAlpha=0.1+r()*0.45; c.fillRect(r()*fw,r()*H*0.5,0.7+r(),0.7+r()); }
  c.globalAlpha=1;
  c.fillStyle='#0d1220';
  c.beginPath(); c.ellipse(fw*0.2,floorY+H*0.05,fw*0.56,H*0.076,0,0,7); c.fill();
  c.fillStyle='#0b0f1a';
  c.beginPath(); c.ellipse(fw*0.85,floorY+H*0.06,fw*0.64,H*0.085,0,0,7); c.fill();
  const mist=c.createLinearGradient(0,floorY-H*0.06,0,floorY);
  mist.addColorStop(0,'rgba(150,170,215,0)'); mist.addColorStop(1,'rgba(150,170,215,0.07)');
  c.fillStyle=mist; c.fillRect(0,floorY-H*0.06,fw,H*0.06);
  c.fillStyle='#06080d'; c.fillRect(0,floorY,fw,H-floorY);
  c.strokeStyle='#2a3350'; c.lineWidth=2;
  c.beginPath(); c.moveTo(0,floorY); c.lineTo(fw,floorY); c.stroke();
  vgCv=document.createElement('canvas');
  vgCv.width=Math.round(fw*DPR); vgCv.height=Math.round(H*DPR);
  const v=vgCv.getContext('2d');
  v.scale(DPR,DPR);
  const vg=v.createRadialGradient(fw/2,H*0.45,H*0.25,fw/2,H*0.45,Math.max(fw,H)*0.8);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.32)');
  v.fillStyle=vg; v.fillRect(0,0,fw,H);
  const ts=v.createLinearGradient(0,0,0,H*0.11);
  ts.addColorStop(0,'rgba(0,0,0,0.28)'); ts.addColorStop(1,'rgba(0,0,0,0)');
  v.fillStyle=ts; v.fillRect(0,0,fw,H*0.11);
}
function initFireflies(){
  fireflies=[];
  const fw=fullW||W, n=Math.round(7*fw/W);
  for(let i=0;i<n;i++){
    fireflies.push({x:(0.03+0.94*Math.random())*fw,y:(0.16+0.55*Math.random())*H,
      t:Math.random()*20,p:Math.random()*6.3});
  }
}
// The game is feel-tuned at phone aspect (~0.46). On a much wider screen (iPad
// portrait ~0.75) filling edge-to-edge would change every trajectory, so we CAP
// the play field's aspect at MAX_ASPECT: the canvas is sized to the capped field
// and CENTERED, and the page's night-gradient background fills the side margins
// (the "Night Rig" sits framed in a moonlit hall). Every phone is <=~0.563 so
// none is capped — phones are byte-identical to before. Input is canvas-relative
// (getBoundingClientRect), so centering needs no coordinate offset.
// = the phone aspect the whole campaign is certified + feel-tuned at (390/844).
// A wider screen (iPad, and even some older phones) renders at THIS aspect,
// centered, sky in the margins — so every device plays the exact tuned game.
// (L6's 3-rope order solve is razor-thin and breaks past ~0.47, which forces
// this anyway; capping here also fixes it on wide older phones.)
const MAX_ASPECT=390/844;
function resize(){
  const sw=Math.max(200,window.innerWidth), sh=Math.max(300,window.innerHeight);
  DPR=Math.min(window.devicePixelRatio||1,3);
  let w=sw; if(w/sh>MAX_ASPECT) w=Math.round(sh*MAX_ASPECT);
  const h=sh, ox=Math.round((sw-w)/2);
  // The CANVAS fills the whole screen (so the night sky/stars/mist span full
  // width); GAMEPLAY renders in the centered w-wide play field (translated by OX
  // in draw, offset by OX in input). corner HUD hugs the play field via --ox.
  cv.width=Math.round(sw*DPR); cv.height=Math.round(h*DPR);
  cv.style.width=sw+'px'; cv.style.height=h+'px'; cv.style.left='0px';
  document.documentElement.style.setProperty('--ox', ox+'px');
  const changed=(w!==W||h!==H||sw!==fullW);
  fullW=sw; OX=ox;
  if(w!==W||h!==H){ W=w; H=h; buildLevel(level); }
  if(changed){ makeBgCache(); initFireflies(); }
}
window.addEventListener('resize',resize);
// Recover the canvas after a long background: iOS purges the MAIN canvas + the
// offscreen bg/vignette caches' GPU backing. Re-assigning cv.width recreates the
// main backing; makeBgCache rebuilds the offscreen caches. Does NOT rebuild the
// level (progress kept) — only the render surfaces. Also reset the frame clock so
// the accumulator doesn't dump a huge catch-up burst on the first resumed frame.
function refreshRender(){
  cv.width=Math.round(fullW*DPR); cv.height=Math.round(H*DPR); // canvas is full-screen width
  cv.style.width=fullW+'px'; cv.style.height=H+'px'; cv.style.left='0px';
  makeBgCache();
  lastT=performance.now(); acc=0;
  draw(performance.now());
}
window.addEventListener('pageshow',refreshRender);
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
  simN:(n)=>{ for(let i=0;i<n;i++) step(); }, // headless stepping WITHOUT draw — the fairness certifier runs 100s of rollouts; draw() per step is ~15x slower
  winNow:()=>{ if(phase==='play') winLevel(); }, // test-only: force the win transition (ending smoke checks win→lantern ending without re-solving the level)

  cutAt:(x1,y1,x2,y2)=>cutSegment(x1,y1,x2,y2),
  // dev/test-only hooks (harmless in prod):
  ropes:()=>cons.filter(c=>c.type==='rope'&&!c.cut).map(c=>{const a=particles[c.a],b=particles[c.b];return {x1:a.x,y1:a.y,x2:b.x,y2:b.y,mx:(a.x+b.x)/2,my:(a.y+b.y)/2};}),
  balloons:()=>balloons.filter(b=>!b.popped).map(b=>({x:particles[b.p].x,y:particles[b.p].y,r:b.r})),
  setLevel:(i)=>{ level=Math.max(0,Math.min(LAST,i|0)); buildLevel(level); },
  howto:(p)=>{ if(p<0) closeHowto(); else openHowto(p); },
  dims:()=>({W,H,S,SP,FLOORY,LAST})
};
loadProgress();
level=frontierLevel();
CUES_ALWAYS=new URLSearchParams(location.search).get('cues')==='always';
FORCE_CUE=new URLSearchParams(location.search).get('cue')||null;
FREEZE=!!new URLSearchParams(location.search).get('freeze');
(function(){ const _lv=parseInt(new URLSearchParams(location.search).get('level'),10); if(_lv>=1&&_lv<=LAST+1) level=_lv-1; })();
try{ if(window.Track) Track.init({ gaId: CUT_GA_ID }); }catch(_){}
resize();
initSettings();
initDevJump();
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
if(FREEZE){ for(let i=0;i<50;i++) step(); paused=true; draw(performance.now()); }
else requestAnimationFrame(frame);
