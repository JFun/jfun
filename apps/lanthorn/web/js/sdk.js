/* CrazyGames SDK wrapper (PRD §3 MVP scope). Every call is a safe no-op when
   the SDK script isn't present (local dev, Poki later, file://). The SDK
   script tag in index.html loads async with onerror swallowed. */
(function (root) {
  "use strict";
  const SDK = { ready: false };

  SDK.init = async function () {
    try {
      if (root.CrazyGames && root.CrazyGames.SDK && root.CrazyGames.SDK.init) {
        await root.CrazyGames.SDK.init();
        SDK.ready = true;
      }
    } catch (e) { /* sandbox or local — stay silent */ }
  };
  function game() { return SDK.ready ? root.CrazyGames.SDK.game : null; }
  let playing = false;   // pair start/stop exactly once (their SDK throttles dupes)
  SDK.loadingStart = function () { try { const g = game(); g && g.sdkGameLoadingStart(); } catch (e) {} };
  SDK.loadingStop = function () { try { const g = game(); g && g.sdkGameLoadingStop(); } catch (e) {} };
  SDK.gameplayStart = function () {
    if (playing) return; playing = true;
    try { const g = game(); g && g.gameplayStart(); } catch (e) {}
  };
  SDK.gameplayStop = function () {
    if (!playing) return; playing = false;
    try { const g = game(); g && g.gameplayStop(); } catch (e) {}
  };
  SDK.happytime = function () { try { const g = game(); g && g.happytime(); } catch (e) {} };

  root.LanthornSDK = SDK;
})(typeof globalThis !== "undefined" ? globalThis : this);
