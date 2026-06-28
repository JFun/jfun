/* Behavior tests for the stateful loop: one-attempt lock, streak transitions,
   link round-trip, and the k-funnel routing to an injected analytics sink. We
   stub localStorage on the global so the exact browser code path runs in Node. */
const path = require("path");

// minimal in-memory localStorage stub
const store = new Map();
global.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
};

const GL = require(path.join(__dirname, "..", "..", "src", "growth-loop.js"));

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };
const eq = (name, got, want) => ok(name + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

// capture the funnel
const events = [];
GL.configure({ namespace: "t", epoch: 20629 /* 2026-06-25 = #1 */, track: { ev: (n, p) => events.push([n, p]) } });

console.log("— one-attempt lock —");
const day = 20629;
ok("fresh day not played", GL.Daily.isPlayed(day) === false);
GL.Daily.markPlayed(day, { swipes: 4, par: 4 });
ok("locked after markPlayed", GL.Daily.isPlayed(day) === true);
eq("result persisted", GL.Daily.playedResult(day), { swipes: 4, par: 4 });
ok("other day still open", GL.Daily.isPlayed(day + 1) === false);

console.log("— human number relative to epoch —");
eq("epoch day is #1", GL.Daily.number(20629), 1);
eq("next day is #2", GL.Daily.number(20630), 2);

console.log("— streak transitions —");
store.clear();
let s = GL.Streak.bump(100);
eq("first completion → 1", s.count, 1);
s = GL.Streak.bump(100);
eq("same day → no double count", s.count, 1);
s = GL.Streak.bump(101);
eq("consecutive → 2", s.count, 2);
s = GL.Streak.bump(103);
eq("gap → reset to 1", s.count, 1);
eq("best preserved across reset", s.best, 2);
eq("display lapses after a miss", GL.Streak.display(110), 0);
eq("display holds the morning after", GL.Streak.display(104), 1);

console.log("— link round-trip —");
const link = GL.Daily.buildLink("https://moraine.app/", { d: 142, ref: "ME" });
ok("link carries d+ref", /[?&]d=142/.test(link) && /[?&]ref=ME/.test(link));
eq("parseLink recovers", GL.Daily.parseLink("?d=142&ref=ME"), { d: 142, ref: "ME" });
eq("parseLink ignores a malformed d", GL.Daily.parseLink("?d=abc&ref=ME"), { ref: "ME" });
eq("parseLink with only ref", GL.Daily.parseLink("?ref=ME"), { ref: "ME" });

console.log("— k-funnel routes to the sink with stable names —");
events.length = 0;
GL.LoopTrack.dailyStart(day);
GL.LoopTrack.dailySolve({ swipes: 3, par: 4 });
GL.LoopTrack.cardShare({ variant: "challenge", channel: "share-files" });
GL.LoopTrack.linkOpen({ ref: "ME", variant: "challenge" });
GL.LoopTrack.playFromLink({ ref: "ME", variant: "challenge" });
eq("event names in order", events.map(e => e[0]),
  ["daily_start", "daily_solve", "card_share", "link_open", "play_from_link"]);
eq("beatPar derived", events[1][1].beatPar, true);

console.log(`\n${fail ? "✗" : "✓"} loop: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
