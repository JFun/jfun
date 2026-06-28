/* Lanthorn journey atlas — the worlds you travel out through. Each planet is a
   PALETTE + a name (no new rules — purely a reskin of the sky, walls and the
   horizon-world; the paper lantern stays warm gold throughout, the constant
   hero). Level number → planet, ~20 levels per world, so the curated 60 are
   the first three (Tier 1, home). Beyond the named worlds the palettes cycle
   for now (naming the deep tail is a content task). This is the Phase-0 thin
   slice: real journey feel, zero painted art — every world is CSS gradients. */
(function (root) {
  "use strict";
  // night1/night2 = sky gradient; wall = the 3 stops of a blocked-cell's stone;
  // world = the horizon orb's core→edge colors.
  const ATLAS = [
    // Tier 1 — home & near sky (the curated 60). star = starfield tint, density 0-1.
    { name: "Hearthfield",     tier: 1, night1: "#0a0e24", night2: "#1a2147", wall: ["#626a92","#474e74","#363c5e"], world: ["#ffd79a","#c9883e"], star: "#e8d6c0", density: 0.45 },
    { name: "Lantern Row",     tier: 1, night1: "#1a0e26", night2: "#3c1d3e", wall: ["#7c5a68","#5a3e4c","#44303a"], world: ["#ffa68e","#c9586a"], star: "#f2d2d6", density: 0.5 },
    { name: "Willowmere",      tier: 1, night1: "#08151e", night2: "#143038", wall: ["#4e6a72","#3a4e56","#2c3c44"], world: ["#86ccba","#2e7a6e"], star: "#cfe8e0", density: 0.5 },
    // Tier 2 — out among the stars (the Moon is the friendly first step up)
    { name: "The Moon",        tier: 2, night1: "#0c1026", night2: "#26305a", wall: ["#8a8c9e","#6a6c80","#52546a"], world: ["#fbf2d6","#cfc09a"], star: "#eaf0fa", density: 0.32 },
    { name: "The Long Road",   tier: 2, night1: "#08091c", night2: "#181a3a", wall: ["#56627e","#3e4860","#2e3648"], world: ["#8a96b8","#3a4668"], star: "#d2d8ee", density: 0.6 },
    { name: "The Quiet Above", tier: 2, night1: "#0a1228", night2: "#1c3056", wall: ["#6c7492","#4e5878","#3a4258"], world: ["#b8c6e0","#5a6e98"], star: "#dfe6ff", density: 0.92 },
    { name: "The Deep Field",  tier: 2, night1: "#07060f", night2: "#161028", wall: ["#46425e","#302c46","#22203a"], world: ["#7c6c9c","#2a2440"], star: "#d8d2ee", density: 1.0 },
    // Tier 3 — stranger luminous realms
    { name: "Nightbloom",      tier: 3, night1: "#110a22", night2: "#2c1648", wall: ["#403a5c","#2c2a46","#20203a"], world: ["#beaadc","#4a3a6a"], star: "#dcc8f2", density: 0.6 },
    { name: "Tidewell",        tier: 3, night1: "#06141c", night2: "#0e2e34", wall: ["#3a5a60","#2a4248","#203238"], world: ["#74cabe","#1e6a66"], star: "#bfeae2", density: 0.72 },
    { name: "The Veil",        tier: 3, night1: "#06121a", night2: "#103632", wall: ["#8aa0b8","#5a7088","#3a4a5e"], world: ["#7ed2a0","#6a5a9a"], star: "#cfe8d8", density: 0.72 },
  ];
  const SIZE = 20;                       // levels per world; curated 60 = first 3
  function indexFor(levelIdx) { return Math.floor(levelIdx / SIZE); }
  // Past the 10 named worlds the journey enters uncharted DEEP SKY — procedurally
  // hue-shifted per world so each stays visually distinct (no name/palette repeat).
  const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;
  function deepSky(i) {
    const h = i * 53;                    // spread hues around the wheel per world
    return {
      name: "Deep Sky", tier: 4,
      night1: hsl(h, 42, 7), night2: hsl(h, 46, 17),
      wall: [hsl(h, 18, 42), hsl(h, 20, 31), hsl(h, 22, 23)],
      world: [hsl(h + 28, 58, 72), hsl(h, 52, 34)],
      star: hsl(h + 180, 26, 86), density: 0.55 + ((i * 13) % 40) / 100,
    };
  }
  function planetFor(levelIdx) {
    const i = indexFor(levelIdx);
    return i < ATLAS.length ? ATLAS[i] : deepSky(i);
  }
  root.LANTHORN_PLANETS = { ATLAS, SIZE, indexFor, planetFor };
})(typeof globalThis !== "undefined" ? globalThis : this);
