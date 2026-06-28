/* Lanthorn analytics — scores the PRD §4 web gate (D1/D7 retention + the
   per-level quit heatmap). GA4 via gtag.js; the module is COMPLETELY INERT
   until a measurement ID is set below, and always inert inside the iOS test
   shell so device sessions never pollute the web cohort.

   Setup (~5 min): analytics.google.com → create property → Web data stream →
   paste the "G-XXXXXXXXXX" Measurement ID here. Retention reports are
   automatic; level events land in Reports → Engagement → Events.

   Events: level_start {level} · level_win {level, pieces, first}
           level_fail {level, lit, lanterns} · level_quit {level, lit}
   Names follow Firebase conventions so a later native iOS port (Firebase
   Analytics) reports apples-to-apples. */
(function (root) {
  "use strict";
  const GA_MEASUREMENT_ID = "";   // ← paste "G-XXXXXXXXXX" to go live

  // In the Capacitor app, events route through the NATIVE Firebase SDK
  // (NativeFX.track → Analytics.logEvent — Tinker Lab-style). On plain web
  // they go through gtag into the same Firebase project's web stream.
  const CAP_NATIVE = !!(root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform());
  const LEGACY_SHELL = !CAP_NATIVE
    && !!(root.webkit && root.webkit.messageHandlers && root.webkit.messageHandlers.sound);
  const WEB_ENABLED = !!GA_MEASUREMENT_ID && !CAP_NATIVE && !LEGACY_SHELL;
  const Track = { enabled: CAP_NATIVE || WEB_ENABLED };

  if (WEB_ENABLED) {
    root.dataLayer = root.dataLayer || [];
    root.gtag = function () { root.dataLayer.push(arguments); };
    root.gtag("js", new Date());
    root.gtag("config", GA_MEASUREMENT_ID, { send_page_view: true });
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_MEASUREMENT_ID;
    s.onerror = () => { Track.enabled = CAP_NATIVE; };
    document.head.appendChild(s);
  }

  Track.ev = function (name, params) {
    if (!Track.enabled) return;
    try {
      if (CAP_NATIVE) root.Capacitor.Plugins.NativeFX.track({ name, params: params || {} });
      else root.gtag("event", name, params || {});
    } catch (e) {}
  };

  root.Track = Track;
})(typeof globalThis !== "undefined" ? globalThis : this);
