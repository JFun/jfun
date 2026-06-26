# @studio/audio

Procedural Web Audio SFX — **no asset files**, generated on the fly, bundles to
nothing, works offline. Lifted from Moraine's canonical `audio.js`.

```html
<script src="js/audio.js"></script>        <!-- browser global `Sfx` -->
```
```js
Sfx.init({ namespace: "moraine" });         // mute pref key = moraine.muted.v1
window.addEventListener("pointerdown", () => Sfx.unlock(), { once:false }); // iOS gesture
Sfx.slide(); Sfx.clear(depth); Sfx.win(); Sfx.tap(); Sfx.toggle();
```

iOS needs a user gesture to start audio (`unlock()`), and the context is rebuilt
after a backgrounding interruption. Sound *output* is feel-tested on device; the
package test only guarantees the methods are safe no-ops without an AudioContext.
