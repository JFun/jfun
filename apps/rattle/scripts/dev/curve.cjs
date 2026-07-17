#!/usr/bin/env node
/* RATTLE — per-level difficulty curve, TWO player models, because they diverge:
   • casual : pop the biggest cluster, 20% noise, IGNORES the objective colour
              (a distracted player) — this is what measure.cjs / the tuner use.
   • skilled: pop the biggest OBJECTIVE-colour cluster, else biggest, 10% noise
              (a competent player who reads the goal — i.e. YOU).
   Also reports botOptimum and the skilled win's spare-tap margin (how much room a
   good player has left — high = the level never threatened them). Emits JSON.
   Usage: node scripts/dev/curve.cjs [rollouts]  (add `json` for pure JSON) */
const path = require("path");
const ENG = require(path.join(__dirname, "..", "..", "web", "js", "levels.js"));
const G = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { LEVELS } = ENG;
function m32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function rem(w){let r=0;for(const o of w.objectives){if(o.kind==="pop"||o.kind==="shells"||o.kind==="balloons")r+=o.rem;else if(o.kind==="duck"&&!w.duckDone)r+=8;}return r;}
function beam(spec,width,maxDepth){const w=G.createWorld(spec);let fr=[{snap:G.snapshot(w)}];const seen=new Set();for(let d=1;d<=maxDepth;d++){const kids=[];for(const nd of fr){G.restore(w,nd.snap);const mv=G.poppableClusters(w).map(i=>({t:"p",i})); mv.push({t:"r"});for(const m of mv){G.restore(w,nd.snap);if(m.t==="r"){if(w.taps<=0)continue;w.taps--;w.tapCounter++;G.applyRattle(w);}else{w.taps--;w.tapCounter++;G.popClusterIdx(w,m.i);}G.settle(w);if(G.isWin(w))return d;if(G.isLose(w)||w.taps<=0)continue;const k=rem(w)+":"+w.balls.reduce((n,b)=>n+(b.alive?1:0),0)+":"+w.taps;kids.push({snap:G.snapshot(w),score:rem(w),key:k});}}kids.sort((a,b)=>a.score-b.score);fr=[];for(const k of kids){if(seen.has(k.key))continue;seen.add(k.key);fr.push(k);if(fr.length>=width)break;}if(!fr.length)break;}return null;}
function objColors(w){return new Set(w.objectives.filter(o=>o.kind==="pop"&&o.rem>0).map(o=>o.color));}
function pickCasual(w,cls,rng){if(!cls.length)return null;if(rng()<0.20)return cls[(rng()*cls.length)|0];return cls.reduce((a,b)=>b.length>a.length?b:a);}
function pickSkilled(w,cls,rng){if(!cls.length)return null;const oc=objColors(w);const oj=cls.filter(c=>oc.has(w.balls[c[0]].c));const pool=oj.length&&rng()>0.10?oj:cls;return pool.reduce((a,b)=>b.length>a.length?b:a);}
function run(spec,pick,rng){const w=G.createWorld(spec);let g=0;while(w.phase==="play"&&w.taps>0&&g++<spec.taps+8){const c=G.poppableClusters(w);const mv=pick(w,c,rng);if(mv===null){if(w.taps<=0)break;w.taps--;w.tapCounter++;G.applyRattle(w);}else{w.taps--;w.tapCounter++;G.popClusterIdx(w,mv);}G.settle(w);}return{win:G.isWin(w),spare:w.taps};}
function stats(spec,pick,n){let wins=0,spare=0;for(let i=0;i<n;i++){const r=run(spec,pick,m32((spec.seed^(i*0x9e3779b9+1))>>>0));if(r.win){wins++;spare+=r.spare;}}return{wr:wins/n,spare:wins?spare/wins:0};}
const N=+(process.argv.find(a=>/^\d+$/.test(a))||120);
const jsonOnly=process.argv.includes("json");
const tierOf=n=>n<=8?"base":n<=16?"toy":n<=26?"stone":n<=40?"shell":n<=54?"balloon":n<=70?"bomb":"combo";
const rows=[];
for(let i=0;i<LEVELS.length;i++){const L=i+1,spec=LEVELS[i];const bot=beam(spec,8,spec.taps);const cas=stats(spec,pickCasual,N);const sk=stats(spec,pickSkilled,N);rows.push({L,tier:tierOf(L),taps:spec.taps,colors:spec.colors,bot,casual:+cas.wr.toFixed(3),skilled:+sk.wr.toFixed(3),skilledSpare:+sk.spare.toFixed(1)});if(!jsonOnly)process.stderr.write(".");}
if(!jsonOnly){process.stderr.write("\n");
  const mc=rows.reduce((a,r)=>a+r.casual,0)/rows.length, ms=rows.reduce((a,r)=>a+r.skilled,0)/rows.length, msp=rows.reduce((a,r)=>a+r.skilledSpare,0)/rows.length, mb=rows.reduce((a,r)=>a+(r.bot||0),0)/rows.length;
  console.error(`mean casual WR ${(mc*100).toFixed(0)}%  ·  mean SKILLED WR ${(ms*100).toFixed(0)}%  ·  mean skilled spare taps ${msp.toFixed(1)}  ·  mean botOpt ${mb.toFixed(1)}`);
  console.error(`skilled clears >95% on ${rows.filter(r=>r.skilled>0.95).length}/106 levels, wins with >=3 spare taps on ${rows.filter(r=>r.skilledSpare>=3).length}/106`);
}
console.log(JSON.stringify(rows));
