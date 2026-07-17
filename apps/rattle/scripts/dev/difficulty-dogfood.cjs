#!/usr/bin/env node
/* DOGFOOD: prove @jfun/difficulty's shared harness, driven through Rattle's adapter,
   reproduces Rattle's OWN hand-inlined beam (verify.cjs / add-par.cjs) and win-rate
   (curve.cjs) — bit-for-bit — on every shipped level. If this passes, the extraction
   is faithful and Rattle (and future games) can trust the package. Usage:
     node scripts/dev/difficulty-dogfood.cjs */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { LEVELS } = require(path.join(__dirname, "..", "..", "web", "js", "levels.js"));
const D = require(path.join(__dirname, "..", "..", "..", "..", "packages", "difficulty"));
const adapter = require(path.join(__dirname, "difficulty-adapter.cjs"));

const DEPTH = 24, NROLL = 120;

/* ---- reference impls copied verbatim from verify.cjs / curve.cjs ---- */
function rem(w) { let r = 0; for (const o of w.objectives) { if (o.kind === "pop" || o.kind === "shells" || o.kind === "balloons") r += o.rem; else if (o.kind === "duck" && !w.duckDone) r += 8; } return r; }
function refBeam(spec, W, Dd) {
  const w = E.createWorld(Object.assign({}, spec, { taps: Dd }));
  let fr = [{ s: E.snapshot(w) }]; const seen = new Set();
  for (let d = 1; d <= Dd; d++) {
    const kids = [];
    for (const nd of fr) {
      E.restore(w, nd.s);
      const mv = E.poppableClusters(w).map(i => ({ t: "p", i })); mv.push({ t: "r" });
      for (const m of mv) {
        E.restore(w, nd.s);
        if (m.t === "r") { if (w.taps <= 0) continue; w.taps--; w.tapCounter++; E.applyRattle(w); }
        else { w.taps--; w.tapCounter++; E.popClusterIdx(w, m.i); }
        E.settle(w);
        if (E.isWin(w)) return d;
        if (E.isLose(w) || w.taps <= 0) continue;
        kids.push({ s: E.snapshot(w), sc: rem(w), k: rem(w) + ":" + w.balls.reduce((n, b) => n + (b.alive ? 1 : 0), 0) + ":" + w.taps });
      }
    }
    kids.sort((a, b) => a.sc - b.sc); fr = [];
    for (const k of kids) { if (seen.has(k.k)) continue; seen.add(k.k); fr.push(k); if (fr.length >= W) break; }
    if (!fr.length) break;
  }
  return null;
}
function m32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function objColors(w) { return new Set(w.objectives.filter(o => o.kind === "pop" && o.rem > 0).map(o => o.color)); }
function pickCasual(w, cls, rng) { if (!cls.length) return null; if (rng() < 0.20) return cls[(rng() * cls.length) | 0]; return cls.reduce((a, b) => b.length > a.length ? b : a); }
function pickSkilled(w, cls, rng) { if (!cls.length) return null; const oc = objColors(w); const oj = cls.filter(c => oc.has(w.balls[c[0]].c)); const pool = oj.length && rng() > 0.10 ? oj : cls; return pool.reduce((a, b) => b.length > a.length ? b : a); }
function refRun(spec, pick, rng) { const w = E.createWorld(spec); let g = 0; while (w.phase === "play" && w.taps > 0 && g++ < spec.taps + 8) { const c = E.poppableClusters(w); const mv = pick(w, c, rng); if (mv === null) { if (w.taps <= 0) break; w.taps--; w.tapCounter++; E.applyRattle(w); } else { w.taps--; w.tapCounter++; E.popClusterIdx(w, mv); } E.settle(w); } return E.isWin(w); }
function refWR(spec, pick, n) { let wins = 0; for (let i = 0; i < n; i++) if (refRun(spec, pick, m32((spec.seed ^ (i * 0x9e3779b9 + 1)) >>> 0))) wins++; return wins / n; }

/* ---- compare shared (via adapter) vs reference, per level ---- */
let fails = 0, n = 0;
for (let i = 0; i < LEVELS.length; i++) {
  const L = i + 1, spec = LEVELS[i]; n++;
  const sharedPar = D.beamOptimum(adapter, spec, { width: 8, maxDepth: DEPTH });
  const refPar = refBeam(spec, 8, DEPTH);
  const sharedCas = D.measureWR(adapter, spec, "casual", NROLL).wr;
  const refCas = refWR(spec, pickCasual, NROLL);
  const sharedAtt = D.measureWR(adapter, spec, "attentive", NROLL).wr;
  const refAtt = refWR(spec, pickSkilled, NROLL);
  const bad = sharedPar !== refPar || Math.abs(sharedCas - refCas) > 1e-9 || Math.abs(sharedAtt - refAtt) > 1e-9;
  if (bad) { fails++; console.error(`L${L} MISMATCH  par ${sharedPar}/${refPar}  cas ${sharedCas.toFixed(4)}/${refCas.toFixed(4)}  att ${sharedAtt.toFixed(4)}/${refAtt.toFixed(4)}`); }
  else if (spec.par != null && sharedPar !== spec.par) console.error(`L${L} note: shared par ${sharedPar} != shipped par ${spec.par}`);
}
if (fails) { console.error(`\n✗ ${fails}/${n} levels mismatch — shared harness diverges from Rattle's reference`); process.exit(1); }
console.log(`✓ @jfun/difficulty reproduces Rattle's beam + casual + attentive win-rates EXACTLY on all ${n} levels`);
