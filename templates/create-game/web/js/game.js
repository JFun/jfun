/* __GameName__ — game shell. The interesting part for the studio: the daily loop
   is ALREADY WIRED via @jfun/growth-loop. You shouldn't have to think about
   daily/streak/share/k-funnel — replace the engine rules and the loop just works.

   This starter is daily-only (one board/day) to make the loop the spine from day
   one. Add a level mode / free play alongside it however you like. */
(function () {
  "use strict";
  const E = window.GameEngine;
  const GL = window.GrowthLoop;
  const Track = window.Track || { ev() {}, init() {} };
  const Sfx = window.Sfx || { unlock() {}, tap() {}, win() {}, clear() {}, init() {} };

  // ---- studio infra: configure once ----
  Track.init({ gaId: "" });                          // ← paste "G-XXXXXXXXXX" to go live
  Sfx.init({ namespace: "__GAME__" });
  GL.configure({
    namespace: "__GAME__",
    epoch: new Date(),                               // ← pin your launch date for "#1"
    track: Track,
  });
  const PLAY_URL = "https://__GAME__.app/";          // ← your instant-play web URL

  const $ = id => document.getElementById(id);
  const boardEl = $("board"), hud = $("hud"), card = $("winCard");

  let day = 0, seed = 0, grid = null, moves = 0, par = 0, won = false, variant = null, ref = null;

  function startDaily(forDay, fromRef) {
    day = forDay == null ? GL.Daily.dayIndex() : forDay;
    seed = GL.Daily.seedForDay(day);
    variant = GL.ShareCard.pickVariant(day);
    ref = fromRef || null;
    par = E.par(seed);
    grid = E.build(seed);
    moves = 0; won = false;
    $("title").textContent = "__GameName__ · Daily #" + GL.Daily.number(day);
    card.classList.add("hidden");
    GL.LoopTrack.dailyStart(day);
    if (GL.Daily.isPlayed(day)) showResult(GL.Daily.playedResult(day), false);
    else render();
  }

  function render() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = `repeat(${E.N}, 1fr)`;
    for (let r = 0; r < E.N; r++) for (let c = 0; c < E.N; c++) {
      const cell = document.createElement("button");
      cell.className = "cell" + (grid[r][c] === E.FILLED ? " filled" : "");
      cell.onclick = () => onTap(r, c);
      boardEl.appendChild(cell);
    }
    hud.textContent = `${moves} moves · goal ${par} · ${E.countFilled(grid)} left`;
  }

  function onTap(r, c) {
    if (won) return;
    const cleared = E.tap(grid, r, c);
    if (!cleared || !cleared.length) return;
    moves++; Sfx.clear(0);
    render();
    if (E.isWon(grid)) onWin();
  }

  function onWin() {
    won = true;
    Sfx.win();
    GL.Daily.markPlayed(day, { swipes: moves, par });   // {swipes,par} = the loop's result shape
    const s = GL.Streak.bump(day);
    GL.LoopTrack.dailySolve({ swipes: moves, par });
    if (ref) GL.LoopTrack.playFromLink({ ref, variant });
    showResult({ swipes: moves, par }, true, s.count);
  }

  function showResult(res, fresh, streak) {
    won = true;
    $("winTitle").textContent = fresh ? "Solved!" : "Today's daily";
    $("winLine").textContent = res && res.swipes != null ? `Solved in ${res.swipes} · goal ${res.par}` : "Solved";
    const st = streak != null ? streak : GL.Streak.display(day);
    $("winStreak").textContent = st > 0 ? `🔥 ${st}-day streak` : "";
    card.classList.remove("hidden");
  }

  async function share() {
    Sfx.tap();
    const n = GL.Daily.number(day);
    const res = GL.Daily.playedResult(day) || { swipes: moves, par };
    const line = GL.ShareCard.variantLine(variant, { line: `Solved in ${res.swipes} · goal ${res.par}` });
    const url = GL.Daily.buildLink(PLAY_URL, { d: day, ref: myRef() });
    let channel = "none";
    try {
      const png = await GL.ShareCard.render({ title: "__GameName__", n, line, url });
      channel = await GL.ShareCard.share(png, { url, text: `__GameName__ #${n} — ${line}`, filename: `__GAME__-${n}` });
    } catch (e) {}
    GL.LoopTrack.cardShare({ variant, channel });
  }
  function myRef() {
    try { let r = localStorage.getItem("__GAME__.ref.v1"); if (!r) { r = Math.random().toString(36).slice(2, 8); localStorage.setItem("__GAME__.ref.v1", r); } return r; }
    catch (e) { return "anon"; }
  }

  $("btnShare").onclick = share;
  $("btnReplay").onclick = () => startDaily();
  ["pointerdown", "keydown"].forEach(ev => window.addEventListener(ev, () => Sfx.unlock(), { once: false, passive: true }));

  // Inbound shared link opens the exact daily (the invite half of the loop).
  const link = GL.Daily.parseLink();
  if (link.ref) GL.LoopTrack.linkOpen({ ref: link.ref, variant: GL.ShareCard.pickVariant(link.d) });
  startDaily(link.d != null ? link.d : undefined, link.ref);
})();
