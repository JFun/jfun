/* Excavate — engine (pure, deterministic, seedable). A LEVEL buries one or two
   illustrated OBJECTS under a 6×6 grid and exposes a hot/cold saliency field. The
   player spends a scarce DIG BUDGET to uncover patches of the (possibly blurred /
   silhouetted) art, reads the heat, and NAMES every buried object from tappable chips
   for a star rating. Determinism is the contract: build(seed, level, mods) → identical
   puzzle for everyone.

   MODIFIERS (a `mods` object, chosen per level by game.js) stack on top of the base
   level ramp:
     blur       px of photo blur (sharpens as you dig)
     decoy      count of false warm dots (cold tiles shown warm)
     multi      2 ⇒ two objects buried (heat = max of both fields); name BOTH
     bedrock    count of un-diggable stone tiles (occlusion, never on a subject tile)
     silhouette shape-only reveal (colour floods in on solve) — UI flag
     fog        {radius} ⇒ dots hidden until you dig near — UI flag
   The subject(s) are always present and each hottest tile stays diggable, so every
   level is winnable — mods tune difficulty/feel, not solvability. Procedural ART lives
   in game.js keyed by name. */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GameEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const Core = (typeof module !== "undefined" && module.exports)
    ? require("@jfun/web-game-core") : root.WebGameCore;
  const makeRNG = Core.makeRNG;

  const N = 6, TILES = N * N;

  // 40 objects across 5 RARITY tiers in a PYRAMID (COMMON → LEGENDARY): many everyday
  // Commons, few precious Legendaries — closer to real "common sense". Tier N unlocks at
  // level 5·(N−1)+1, so rarity rides the level curve: early = common, deep = legendary.
  const SUBJECTS = [
    // tier 1 — COMMON (12): the most universal, everyday things
    { name: "Sun",            emoji: "☀️", sky: ["#3a2408", "#7a4a12"], tier: 1 },
    { name: "Moon",           emoji: "🌙", sky: ["#0a1024", "#1c2b52"], tier: 1 },
    { name: "Star",           emoji: "⭐", sky: ["#0c1430", "#23306a"], tier: 1 },
    { name: "Cloud",          emoji: "☁️", sky: ["#1c3a5a", "#3f6f9e"], tier: 1 },
    { name: "Heart",          emoji: "❤️", sky: ["#2a1622", "#4f2a3a"], tier: 1 },
    { name: "Cat",            emoji: "🐱", sky: ["#2a2438", "#46324f"], tier: 1 },
    { name: "Apple",          emoji: "🍎", sky: ["#241a12", "#4a3020"], tier: 1 },
    { name: "Tree",           emoji: "🌳", sky: ["#18220f", "#3a4a1e"], tier: 1 },
    { name: "Flower",         emoji: "🌻", sky: ["#243016", "#4a6620"], tier: 1 },
    { name: "Fish",           emoji: "🐠", sky: ["#08263a", "#136086"], tier: 1 },
    { name: "Bird",           emoji: "🐦", sky: ["#173a2a", "#2e6650"], tier: 1 },
    { name: "House",          emoji: "🏠", sky: ["#1c2436", "#3a4f6b"], tier: 1 },
    // tier 2 — UNCOMMON (10): everyday but a bit more specific
    { name: "Car",            emoji: "🚗", sky: ["#1a2030", "#33405a"], tier: 2 },
    { name: "Duck",           emoji: "🦆", sky: ["#1c2436", "#3a4f6b"], tier: 2 },
    { name: "Ice Cream",      emoji: "🍦", sky: ["#2a1622", "#4f2a3a"], tier: 2 },
    { name: "Umbrella",       emoji: "☂️", sky: ["#1a2436", "#33465f"], tier: 2 },
    { name: "Butterfly",      emoji: "🦋", sky: ["#241a30", "#463a58"], tier: 2 },
    { name: "Bee",            emoji: "🐝", sky: ["#2a2408", "#5a4a10"], tier: 2 },
    { name: "Cherry",         emoji: "🍒", sky: ["#2a1218", "#4a2028"], tier: 2 },
    { name: "Strawberry",     emoji: "🍓", sky: ["#2a1622", "#4f2a3a"], tier: 2 },
    { name: "Mushroom",       emoji: "🍄", sky: ["#15301f", "#2c5a3a"], tier: 2 },
    { name: "Hot-air Balloon",emoji: "🎈", sky: ["#1c2b4a", "#4a6dbb"], tier: 2 },
    // tier 3 — RARE (8): less-everyday creatures & things
    { name: "Snowman",        emoji: "⛄", sky: ["#12233a", "#2b4a6b"], tier: 3 },
    { name: "Owl",            emoji: "🦉", sky: ["#1f1a2e", "#3a2f50"], tier: 3 },
    { name: "Crab",           emoji: "🦀", sky: ["#2a1414", "#521f1f"], tier: 3 },
    { name: "Turtle",         emoji: "🐢", sky: ["#12280f", "#2a5020"], tier: 3 },
    { name: "Cactus",         emoji: "🌵", sky: ["#3a2a14", "#6b4e22"], tier: 3 },
    { name: "Sailboat",       emoji: "⛵", sky: ["#13314f", "#2e6fa0"], tier: 3 },
    { name: "Cupcake",        emoji: "🧁", sky: ["#241624", "#452843"], tier: 3 },
    { name: "Key",            emoji: "🔑", sky: ["#241c08", "#4a3a10"], tier: 3 },
    // tier 4 — EPIC (6): special, rarely-seen
    { name: "Whale",          emoji: "🐳", sky: ["#0a2438", "#155277"], tier: 4 },
    { name: "Ghost",          emoji: "👻", sky: ["#14121e", "#2a2740"], tier: 4 },
    { name: "Anchor",         emoji: "⚓", sky: ["#0a1e2e", "#154055"], tier: 4 },
    { name: "Lighthouse",     emoji: "🗼", sky: ["#102032", "#274a6b"], tier: 4 },
    { name: "Bell",           emoji: "🔔", sky: ["#241c08", "#5a4610"], tier: 4 },
    { name: "Pumpkin",        emoji: "🎃", sky: ["#2a1808", "#5a3410"], tier: 4 },
    // tier 5 — LEGENDARY (4): precious / impressive prizes
    { name: "Rocket",         emoji: "🚀", sky: ["#0c1430", "#23306a"], tier: 5 },
    { name: "Crown",          emoji: "👑", sky: ["#241c08", "#5a4610"], tier: 5 },
    { name: "Robot",          emoji: "🤖", sky: ["#1a1e26", "#333a4a"], tier: 5 },
    { name: "Diamond",        emoji: "💎", sky: ["#0a2430", "#155060"], tier: 5 },
  ];
  const MAXTIER = 5;
  const RARITY = [
    { name: "Common",    color: "#9aa6bd" },
    { name: "Uncommon",  color: "#4bd48a" },
    { name: "Rare",      color: "#4b9bff" },
    { name: "Epic",      color: "#a878ff" },
    { name: "Legendary", color: "#ffce5c" },
  ];
  const DISTRACT = ["Dog", "Tent", "Kite", "Snail", "Acorn", "Pear", "Frog"];
  // visually-confusable groups — one member is forced into the chips as a "read the
  // image carefully" trap (fair: tellable apart from the revealed art if you look).
  const LOOKALIKE = [
    ["Cat", "Owl"], ["Fish", "Whale"], ["Bird", "Duck"], ["Sun", "Star", "Flower"],
    ["Apple", "Cherry", "Strawberry"], ["Apple", "Pumpkin"], ["Ice Cream", "Cupcake"],
    ["Butterfly", "Bee"], ["Lighthouse", "Rocket"], ["Snowman", "Ghost"], ["Heart", "Apple"], ["Diamond", "Star"],
  ];

  function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  const rc = i => [Math.floor(i / N), i % N];

  function build(seed, level, mods) {
    level = Math.max(1, Math.round(level || 1));
    mods = mods || {};
    const off = level - 1;
    const rng = makeRNG(seed >>> 0);
    const nSub = mods.multi === 2 ? 2 : 1;

    // unlocked object pool grows with level (a new tier every 5 levels)
    const maxTier = Math.min(MAXTIER, 1 + Math.floor((level - 1) / 5));
    const pool = SUBJECTS.filter(s => s.tier <= maxTier);
    const subjects = [];
    while (subjects.length < nSub) {
      const s = pool[Math.floor(rng() * pool.length)];
      if (!subjects.includes(s)) subjects.push(s);
    }

    // focal point(s) — tight/central at low level, drift out with level; two-subject
    // focals are forced apart so the board shows two distinct warm basins
    const spread = Math.min(0.14 + off * 0.05, 0.42);
    const clamp01 = v => Math.max(0.12, Math.min(0.88, v));
    const focals = [];
    if (nSub === 2) {
      // two focals mirrored around a jittered centre → guaranteed apart (separation ~0.48–0.64)
      const ang = rng() * Math.PI * 2, r = 0.24 + rng() * 0.08;
      const ox = 0.5 + (rng() * 2 - 1) * 0.06, oy = 0.5 + (rng() * 2 - 1) * 0.06;
      focals.push({ x: clamp01(ox + Math.cos(ang) * r), y: clamp01(oy + Math.sin(ang) * r) });
      focals.push({ x: clamp01(ox - Math.cos(ang) * r), y: clamp01(oy - Math.sin(ang) * r) });
    } else {
      focals.push({ x: 0.5 + (rng() * 2 - 1) * spread, y: 0.5 + (rng() * 2 - 1) * spread });
    }

    // per-subject saliency (distance) + combined display heat = max closeness
    const salis = focals.map(f => {
      const arr = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) arr.push(Math.hypot((c + 0.5) / N - f.x, (r + 0.5) / N - f.y));
      return arr;
    });
    let maxD = 0; for (const a of salis) for (const d of a) if (d > maxD) maxD = d;
    const hintLevel = [];
    for (let i = 0; i < TILES; i++) {
      let t = 0; for (const a of salis) t = Math.max(t, 1 - a[i] / maxD);
      hintLevel.push(Math.max(0, Math.min(4, Math.round(t * 4 + (t > 0.93 ? 1 : 0)))));
    }
    const subjectTiles = salis.map(a => { let m = 0; for (let i = 0; i < TILES; i++) if (a[i] < a[m]) m = i; return m; });

    // displayed dots = true heat + decoy warm spots on cold tiles
    const dots = hintLevel.slice();
    const nDecoy = mods.decoy || 0;
    if (nDecoy > 0) {
      const dr = makeRNG((seed ^ 0xC0FFEE) >>> 0);
      const cold = [];
      for (let i = 0; i < TILES; i++) if (hintLevel[i] <= 1 && subjectTiles.indexOf(i) < 0) cold.push(i);
      shuffle(cold, dr);
      for (let k = 0; k < nDecoy && k < cold.length; k++) dots[cold[k]] = 2;
    }

    // bedrock: un-diggable tiles, never a subject tile nor its 4-neighbours (keep each
    // hottest tile reachable), biased to colder ground at low level
    const bedrock = new Array(TILES).fill(false);
    const nBed = mods.bedrock || 0;
    if (nBed > 0) {
      const br = makeRNG((seed ^ 0xBED70) >>> 0);
      const protect = new Set();
      subjectTiles.forEach(st => { protect.add(st); const [sr, scc] = rc(st); for (const [dr2, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { const nr = sr + dr2, nc = scc + dc; if (nr >= 0 && nc >= 0 && nr < N && nc < N) protect.add(nr * N + nc); } });
      const cand = [];
      for (let i = 0; i < TILES; i++) if (!protect.has(i) && (level < 4 ? hintLevel[i] <= 1 : true)) cand.push(i);
      shuffle(cand, br);
      for (let k = 0; k < nBed && k < cand.length; k++) bedrock[cand[k]] = true;
    }

    // target digs + budget (scaled up for two subjects) + blur
    const perPar = Math.max(2, Math.min(5, 2 + Math.round(off / 2)));
    const parDigs = Math.round(perPar * (nSub === 2 ? 1.7 : 1));
    const slack = Math.max(2, Math.min(4, 5 - Math.floor(level / 2)));
    const budget = parDigs + slack + (nSub === 2 ? 1 : 0);
    const blur = Math.max(0, Math.min(12, mods.blur || 0));

    // choices: every buried subject's name + look-alike-ish distractors; a couple extra
    // chips when two are buried
    // choices: the answer(s) + look-alikes drawn only from UNLOCKED objects + a few
    // generic distractors (never offer an object the player hasn't met yet)
    const need = subjects.map(s => s.name);
    const wantN = 6;                              // always 6 chips (fits a 3-row layout)
    const dr2 = makeRNG((seed ^ 0x55) >>> 0);
    const unlockedNames = pool.map(s => s.name);
    const opts = new Set(need);
    // force one UNLOCKED look-alike per answer (confusable in the chips, distinguishable from the art)
    for (const ans of need) {
      if (opts.size >= wantN) break;
      const cands = [];
      for (const grp of LOOKALIKE) if (grp.indexOf(ans) >= 0) for (const m of grp) if (m !== ans && need.indexOf(m) < 0 && unlockedNames.indexOf(m) >= 0 && !opts.has(m)) cands.push(m);
      if (cands.length) opts.add(cands[Math.floor(dr2() * cands.length)]);
    }
    const cpool = unlockedNames.filter(n => !opts.has(n)).concat(DISTRACT);
    while (opts.size < wantN) opts.add(cpool[Math.floor(dr2() * cpool.length)]);
    const choices = shuffle(Array.from(opts), dr2);

    return {
      seed, level, mods,
      subjects: subjects.map(s => ({ name: s.name, emoji: s.emoji, sky: s.sky.slice(), tier: s.tier })),
      answers: need, focals, saliency: salis, hintLevel, dots, subjectTiles, bedrock,
      silhouette: !!mods.silhouette, fog: mods.fog ? { radius: mods.fogRadius || 1 } : null,
      blur, parDigs, budget, choices, sky: subjects[0].sky.slice(),
    };
  }

  function par(seed, level, mods) { return build(seed, level, mods).parDigs; }

  return { N, TILES, build, par, SUBJECTS, RARITY, subjectCount: SUBJECTS.length, VERSION: "4.1.0" };
});
