/* audio tests — in Node there's no AudioContext, so the contract is: every sound
   method is a SAFE no-op (never throws), the mute pref persists under the
   configured namespace, and toggle/setEnabled round-trip. (Actual sound output is
   feel-tested on device — see README; this is the load-bearing safety net.) */
const path = require("path");
const store = new Map();
global.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const Sfx = require(path.join(__dirname, "..", "..", "src", "audio.js"));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error("  ✗ " + n); } };

console.log("— sounds are safe no-ops without AudioContext —");
let threw = false;
try { ["slide", "blocked", "win", "dead", "tap"].forEach(m => Sfx[m]()); Sfx.clear(2); Sfx.unlock(); Sfx.wake(); } catch (e) { threw = true; console.error(e); }
ok("no method throws in Node", !threw);

console.log("— mute pref persists under the namespace —");
Sfx.init({ namespace: "moraine" });
ok("enabled by default", Sfx.enabled === true);
Sfx.setEnabled(false);
ok("mute persisted", store.get("moraine.muted.v1") === "1");
ok("enabled reflects mute", Sfx.enabled === false);
ok("toggle returns new state", Sfx.toggle() === true);

console.log(`\n${fail ? "✗" : "✓"} audio: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
