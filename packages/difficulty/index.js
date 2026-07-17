/* @jfun/difficulty — Node entry. Re-exports the engine-agnostic curve math, the
   adapter-based measure/tune/seed-search harness, and the campaign reports.
   Browsers should import "./src/curve.js" directly (the curve math is the only
   part that runs client-side; measurement/tuning are dev-time Node tools). */
"use strict";
module.exports = Object.assign({},
  require("./src/curve.js"),
  require("./src/harness.js"),
  require("./src/report.js"));
