/* test-harness self-test (the meta-test): the helpers must count, pin, and detect
   failure correctly — otherwise every downstream golden is untrustworthy. */
const path = require("path");
const { harness } = require(path.join(__dirname, "..", "..", "src", "harness.js"));

let bad = 0;
const assert = (n, c) => { if (!c) { bad++; console.error("  ✗ meta: " + n); } };

// a passing run tallies correctly
const a = harness("x");
a.ok("t", true).eq("e", 1, 1).golden("g", () => 42, 42).deterministic("d", () => 7).invariant("inv", [{ id: "a" }, { id: "b" }], () => true);
assert("all pass → failed==0", a.failed === 0 && a.passed === 5);
assert("summary 0 when green", a.summary() === 0);

// The next cases DELIBERATELY trip the harness to prove it detects failure —
// silence their (expected) console noise so the test output isn't alarming.
const realErr = console.error, realLog = console.log;
console.error = console.log = () => {};

// a failing run is detected
const b = harness("y");
b.ok("f", false).eq("ne", 1, 2).golden("badpin", () => 1, 2);
assert("failures detected", b.failed === 3 && b.passed === 0);
assert("summary 1 when red", b.summary() === 1);
assert("failure names captured", b.failures.length === 3);

// invariant names the offending item
const c = harness("z");
c.invariant("needs-even", [{ id: "ok2", v: 2 }, { id: "bad3", v: 3 }], it => it.v % 2 === 0);
assert("invariant fails on bad item", c.failed === 1);
assert("invariant reports the item id", c.failures[0].indexOf("bad3") >= 0);

// deterministic catches nondeterminism
const d = harness("w");
let n = 0;
d.deterministic("counter", () => ++n);
assert("nondeterminism caught", d.failed === 1);

console.error = realErr; console.log = realLog;

console.log(`\n${bad ? "✗" : "✓"} harness meta: ${bad ? bad + " failed" : "all green"}`);
process.exit(bad ? 1 : 0);
