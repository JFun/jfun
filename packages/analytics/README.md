# @jfun/analytics

One `Track` API → Firebase (native iOS) / gtag (web). Lifted from Moraine's
canonical `analytics.js` + Lanthorn's legacy-shell guard. **Inert** until a GA id
is set (or running native), and always inert inside an iOS test shell.

```html
<script src="js/analytics.js"></script>   <!-- browser global `Track` -->
```
```js
Track.init({ gaId: "G-XXXXXXXXXX" });      // omit gaId → web stays inert; native always on
Track.ev("level_start", { level: 3 });     // Firebase-convention names
```

**Event names are a contract — keep them stable.** The dashboards (and
`@jfun/growth-loop`'s k-funnel) depend on exact names. `Track.ev` never throws.
