/* @jfun/levelcheck — Node entry. Re-exports the frame-fit geometry lint, the
   winning-order discoverability check, the distinctness (anti-clone) scoring,
   and the human-solvability robustness judges (win density / solve windows).
   All pure functions over facts the game's own certifier extracts —
   winnability certification stays per-game (engines differ). */
"use strict";
module.exports = Object.assign({},
  require("./src/geometry.js"),
  require("./src/order.js"),
  require("./src/distinct.js"),
  require("./src/robustness.js"),
  require("./src/gates.js"));
