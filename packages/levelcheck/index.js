/* @jfun/levelcheck — Node entry. Re-exports the frame-fit geometry lint, the
   winning-order discoverability check, and the distinctness (anti-clone)
   scoring. All pure functions over facts the game's own certifier extracts —
   winnability certification stays per-game (engines differ). */
"use strict";
module.exports = Object.assign({},
  require("./src/geometry.js"),
  require("./src/order.js"),
  require("./src/distinct.js"));
