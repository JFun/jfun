#!/usr/bin/env node
/* RATTLE — measure an arbitrary levels.js file (for before/after difficulty comparison).
   Same two player models as curve.cjs: casual (biggest cluster, 20% noise, ignores the
   objective) and attentive (biggest OBJECTIVE cluster, 10% noise — the realistic human).
   Usage: node scripts/dev/measure-file.cjs <path-to-levels.js> [rollouts]
   Emits JSON [{L,tier,taps,bot,casual,attentive,attSpare}] to stdout, summary to stderr. */
const path = require("path");
const G = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const file = process.argv[2];
if (!file) { console.error("usage: measure-file.cjs <levels.js> [rollouts]"); process.exit(1); }
const src = require("fs").readFileSync(file, "utf8");
const mod = { exports: {} };
new Function("module", "exports", "globalThis", src)(mod, mod.exports, {});
const LEVELS = (mod.exports && mod.exports.LEVELS) || [];
function m32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function rem(w){let r=0;for(const o of w.objectives){if(o.kind==="pop"||o.kind==="shells"||o.kind==="balloons")r+=o.rem;else if(o.kind==="duck"&&!w.duckDone)r+=8;}return r;}
function beam(spec,W,D){const w=G.createWorld(spec);let fr=[{s:G.snapshot(w)}];const seen=new Set();for(let d=1;d<=D;d++){const kids=[];for(const nd of fr){G.restore(w,nd.s);const mv=G.poppableClusters(w).map(i=>({t:"p",i}));mv.push({t:"r"});for(const m of mv){G.restore(w,nd.s);if(m.t==="r"){if(w.taps<=0)continue;w.taps--;w.tapCounter++;G.applyRattle(w);}else{w.taps--;w.tapCounter++;G.popClusterIdx(w,m.i);}G.settle(w);if(G.isWin(w))return d;if(G.isLose(w)||w.taps<=0)continue;const k=rem(w)+":"+w.balls.reduce((n,b)=>n+(b.alive?1:0),0)+":"+w.taps;kids.push({s:G.snapshot(w),sc:rem(w),k});}}kids.sort((a,b)=>a.sc-b.sc);fr=[];for(const k of kids){if(seen.has(k.k))continue;seen.add(k.k);fr.push(k);if(fr.length>=W)break;}if(!fr.length)break;}return null;}
function objColors(w){const s=new Set(w.objectives.filter(o=>o.kind==="pop"&&o.rem>0).map(o=>o.color));if(w.objectives.some(o=>o.kind==="shells"&&o.rem>0))for(const b of w.balls)if(b.alive&&b.shelled)s.add(b.c);return s;}   // colour-gated crates: shell colours are objectives too
function pickCasual(w,cls,rng){if(!cls.length)return null;if(rng()<0.20)return cls[(rng()*cls.length)|0];return cls.reduce((a,b)=>b.length>a.length?b:a);}
function pickAtt(w,cls,rng){if(!cls.length)return null;const oc=objColors(w);const oj=cls.filter(c=>oc.has(w.balls[c[0]].c));const pool=oj.length&&rng()>0.10?oj:cls;return pool.reduce((a,b)=>b.length>a.length?b:a);}
function run(spec,pick,rng){const w=G.createWorld(spec);let g=0;while(w.phase==="play"&&w.taps>0&&g++<spec.taps+8){const c=G.poppableClusters(w);const mv=pick(w,c,rng);if(mv===null){if(w.taps<=0)break;w.taps--;w.tapCounter++;G.applyRattle(w);}else{w.taps--;w.tapCounter++;G.popClusterIdx(w,mv);}G.settle(w);}return{win:G.isWin(w),spare:w.taps};}
function stats(spec,pick,n){let wins=0,spare=0;for(let i=0;i<n;i++){const r=run(spec,pick,m32((spec.seed^(i*0x9e3779b9+1))>>>0));if(r.win){wins++;spare+=r.spare;}}return{wr:wins/n,spare:wins?spare/wins:0};}
const N=+(process.argv[3]||150);
const tierOf=n=>n<=8?"base":n<=16?"toy":n<=26?"stone":n<=40?"shell":n<=54?"balloon":n<=70?"bomb":"combo";
const rows=[];
for(let i=0;i<LEVELS.length;i++){const L=i+1,spec=LEVELS[i];const bot=beam(spec,8,spec.taps+2);const cas=stats(spec,pickCasual,N);const at=stats(spec,pickAtt,N);rows.push({L,tier:tierOf(L),taps:spec.taps,par:spec.par||null,bot,casual:+cas.wr.toFixed(3),attentive:+at.wr.toFixed(3),attSpare:+at.spare.toFixed(1)});process.stderr.write(".");}
process.stderr.write("\n");
const mc=rows.reduce((a,r)=>a+r.casual,0)/rows.length, ma=rows.reduce((a,r)=>a+r.attentive,0)/rows.length;
console.error(`${path.basename(file)}: ${rows.length} levels · mean casual ${(mc*100).toFixed(0)}% · mean ATTENTIVE ${(ma*100).toFixed(0)}% · attentive>95% on ${rows.filter(r=>r.attentive>0.95).length}/${rows.length}`);
console.log(JSON.stringify(rows));
