/* @jfun/analytics — one Track API → Firebase (native iOS) / gtag (web). Lifted
   from Moraine's analytics.js (canonical) + Lanthorn's legacy-shell guard. The
   module is INERT unless a GA measurement id is set (or running native), and
   always inert inside an iOS test shell so device sessions never pollute the web
   cohort. Event names follow Firebase conventions — KEEP THEM STABLE; the existing
   dashboards depend on them (CLAUDE.md non-negotiable).

   Native (Capacitor): events log via @capacitor-firebase/analytics. Web: gtag into
   the same Firebase project's web stream. Configure once before the game starts:
     Track.init({ gaId: "G-XXXXXXXXXX" });   // omit gaId → web stays inert
   then Track.ev("level_start", { level: 3 }). UMD: browser global `Track`. */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Track = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const isNative = () => !!(root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform());
  // The pre-Capacitor WKWebView shell exposed webkit.messageHandlers.sound — detect
  // it so the old native test harness never counts as a web session.
  const isLegacyShell = () => !isNative() && !!(root.webkit && root.webkit.messageHandlers && root.webkit.messageHandlers.sound);

  const Track = { enabled: false, gaId: "" };

  // Initialize. On native, events route through Firebase regardless of gaId. On
  // web, a gaId turns gtag on (and stays off without one). Idempotent-ish: safe to
  // call once at startup. Returns Track for chaining.
  Track.init = function (opts) {
    opts = opts || {};
    Track.gaId = opts.gaId || Track.gaId || "";
    const native = isNative();
    const webEnabled = !!Track.gaId && !native && !isLegacyShell();
    Track.enabled = native || webEnabled;
    if (webEnabled && !Track._gtagLoaded) {
      Track._gtagLoaded = true;
      root.dataLayer = root.dataLayer || [];
      root.gtag = root.gtag || function () { root.dataLayer.push(arguments); };
      root.gtag("js", new Date());
      root.gtag("config", Track.gaId, { send_page_view: true });
      try {
        const s = document.createElement("script");
        s.async = true;
        s.src = "https://www.googletagmanager.com/gtag/js?id=" + Track.gaId;
        s.onerror = () => { Track.enabled = native; };
        document.head.appendChild(s);
      } catch (e) {}
    }
    return Track;
  };

  Track.ev = function (name, params) {
    if (!Track.enabled) return;
    try {
      if (isNative()) root.Capacitor.Plugins.FirebaseAnalytics.logEvent({ name: name, params: params || {} });
      else root.gtag("event", name, params || {});
    } catch (e) {}
  };

  Track.VERSION = "0.1.0";
  return Track;
});
