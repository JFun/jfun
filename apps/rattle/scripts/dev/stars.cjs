#!/usr/bin/env node
/* RATTLE — efficiency-star threshold preview. par = verifier bot-optimal taps.
   Proposed grade on taps USED (= budget − spare):
     3★  used ≤ par+1      2★  used ≤ par+3      1★  any clear
     PERFECT  used == par AND no rattle used
   Reports each level's par/budget and, from a SKILLED policy (objective-biggest,
   10% noise) run many times, the BEST taps it manages — so you can see how
   attainable each tier is before we wire it in. Usage: node scripts/dev/stars.cjs [rolls] */
const path = require("path");
const G = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { LEVELS } = require(path.join(__dirname, "..", "..", "web", "js", "levels.js"));
function m32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function rem(w){let r=0;for(const o of w.objectives){if(o.kind==="pop"||o.kind==="shells"||o.kind==="balloons")r+=o.rem;else if(o.kind==="duck"&&!w.duckDone)r+=8;}return r;}
function beam(spec,W,D){const w=G.createWorld(spec);let fr=[{s:G.snapshot(w)}];const seen=new Set();for(let d=1;d<=D;d++){const kids=[];for(const nd of fr){G.restore(w,nd.s);const mv=G.poppableClusters(w).map(i=>({t:"p",i}));mv.push({t:"r"});for(const m of mv){G.restore(w,nd.s);if(m.t==="r"){if(w.taps<=0)continue;w.taps--;w.tapCounter++;G.applyRattle(w);}else{w.taps--;w.tapCounter++;G.popClusterIdx(w,m.i);}G.settle(w);if(G.isWin(w))return d;if(G.isLose(w)||w.taps<=0)continue;const k=rem(w)+":"+w.balls.reduce((n,b)=>n+(b.alive?1:0),0)+":"+w.taps;kids.push({s:G.snapshot(w),sc:rem(w),k});}}kids.sort((a,b)=>a.sc-b.sc);fr=[];for(const k of kids){if(seen.has(k.k))continue;seen.add(k.k);fr.push(k);if(fr.length>=W)break;}if(!fr.length)break;}return null;}
function objColors(w){return new Set(w.objectives.filter(o=>o.kind==="pop"&&o.rem>0).map(o=>o.color));}
function pickSkilled(w,cls,rng){if(!cls.length)return null;const oc=objColors(w);const oj=cls.filter(c=>oc.has(w.balls[c[0]].c));const pool=oj.length&&rng()>0.10?oj:cls;return pool.reduce((a,b)=>b.length>a.length?b:a);}
function playSkilled(spec,rng){const w=G.createWorld(spec);let used=0,rat=0,g=0;while(w.phase==="play"&&w.taps>0&&g++<spec.taps+8){const mv=pickSkilled(w,G.poppableClusters(w),rng);if(mv===null){if(w.taps<=0)break;w.taps--;w.tapCounter++;G.applyRattle(w);rat++;}else{w.taps--;w.tapCounter++;G.popClusterIdx(w,mv);}used++;G.settle(w);}return{win:G.isWin(w),used,rat};}
const N=+(process.argv[2]||80);
const tierOf=n=>n<=8?"base":n<=16?"toy":n<=26?"stone":n<=40?"shell":n<=54?"balloon":n<=70?"bomb":"combo";
let got3=0,got2=0,gotPerf=0,rows=[];
for(let i=0;i<LEVELS.length;i++){const L=i+1,spec=LEVELS[i];const par=beam(spec,8,spec.taps);let best=1e9,bestRat=0,perf=false;for(let k=0;k<N;k++){const r=playSkilled(spec,m32((spec.seed^(k*2654435761+1))>>>0));if(r.win&&r.used<best){best=r.used;bestRat=r.rat;}if(r.win&&r.used===par&&r.rat===0)perf=true;}
  const three=best<=par+1, two=best<=par+3;
  if(three)got3++; if(two)got2++; if(perf)gotPerf++;
  rows.push({L,tier:tierOf(L),par,budget:spec.taps,skilledBest:best===1e9?"-":best,three,two,perf});}
console.log("thresholds:  3★ used≤par+1   2★ used≤par+3   1★ any clear   PERFECT used==par & no rattle\n");
console.log("L   tier    par bud skilledBest  3★? PERFECT?");
for(const L of [1,5,10,17,20,30,45,55,70,90,105,106]){const r=rows[L-1];if(r)console.log(String(r.L).padStart(3)+" "+r.tier.padEnd(7)+" "+String(r.par).padStart(3)+" "+String(r.budget).padStart(3)+"    "+String(r.skilledBest).padStart(3)+"        "+(r.three?"yes":"no ")+"   "+(r.perf?"yes":"no"));}
console.log(`\n=== attainability (skilled bot, best of ${N} tries) ===`);
console.log(`  can reach 3★ (≤par+1): ${got3}/106 levels`);
console.log(`  can reach 2★ (≤par+3): ${got2}/106`);
console.log(`  can PERFECT (==par, no rattle): ${gotPerf}/106`);
console.log(`  → 3★ is a genuine chase: a good bot only nails it on ${(got3/106*100).toFixed(0)}% even trying ${N}×`);
