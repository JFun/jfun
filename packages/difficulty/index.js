/* @jfun/difficulty — Node entry. Re-exports the engine-agnostic curve math, the
   labeled-beat cadence + distribution checks, the pool-ordering mode, the
   adapter-based measure/tune/seed-search harness, the campaign reports, and the
   generation orchestrator (generateCampaign & co — the level-generation
   framework; the winnability certifier stays per-game, invoked via plugin
   slots). Browsers should import "./src/curve.js" (and, if needed,
   "./src/cadence.js" / "./src/pool.js") directly — those are the pure-math
   files; measurement/tuning/generation are dev-time Node tools. */
"use strict";
module.exports = Object.assign({},
  require("./src/curve.js"),
  require("./src/cadence.js"),
  require("./src/pool.js"),
  require("./src/harness.js"),
  require("./src/report.js"),
  require("./src/campaign.js"));
