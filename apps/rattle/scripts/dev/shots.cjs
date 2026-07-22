// App Store screenshots via Chrome DevTools Protocol — exact device pixels.
// Self-contained: spawns its own static server + headless Chrome, poses each
// scene through Rattle's window.__r hook (goto/step/screen/win/render), and writes
//   screenshots/appstore/<slot>/<name>.png
// Run:  node scripts/dev/shots.cjs        (from apps/rattle)
// Headless has no rAF, so every scene forces a draw with __r.step()/__r.render().
const CDP = require('chrome-remote-interface');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9463;
const HTTP_PORT = 4174;
const WEB = path.join(__dirname, '..', '..', 'web');
const OUT = path.join(__dirname, '..', '..', 'screenshots', 'appstore');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.woff2':'font/woff2', '.json':'application/json', '.png':'image/png' };

// slot, cssW, cssH, deviceScaleFactor  →  output = cssW*dsr × cssH*dsr
const SIZES = [
  ['iphone-6.9', 440, 956, 3],   // 1320 × 2868
  ['iphone-6.7', 430, 932, 3],   // 1290 × 2796
  ['ipad-13',   1024, 1366, 2],  // 2048 × 2732
];
// pre-seed a save: 40 levels cleared so the map/home read as real progress, tutorial off
const SEED = `(function(){const SV={level:24,tutorialDone:1,stars:{},perfect:{}};for(let i=1;i<=40;i++){SV.stars[i]=(i%4===0?2:3);if(i%3===0)SV.perfect[i]=1;}localStorage.setItem('rattle.save.v1',JSON.stringify(SV));})()`;
// a marketing caption dropped into the empty band between HUD and pile
const CAP = t => `(function(){var d=document.createElement('div');d.id='__cap';d.textContent=${JSON.stringify(t)};d.style.cssText='position:fixed;top:19%;left:0;right:0;text-align:center;font:900 32px Nunito,system-ui,sans-serif;line-height:1.25;color:#ffe6a8;text-shadow:0 3px 14px rgba(0,0,0,.55);padding:0 34px;z-index:9999;pointer-events:none';document.body.appendChild(d);})();`;
// name, pose (run after __r is live; `r` = window.__r)
const SHOTS = [
  ['01-home',    `r.screen('home'); r.render();`],                                          // brand hero
  ['02-play',    `r.goto(24); r.screen('play'); r.step(140); ${CAP('Tap a group to pop it')}`],
  ['03-crates',  `r.goto(30); r.screen('play'); r.step(140); ${CAP('Smash crates to free the beads')}`],
  ['04-balloon', `r.goto(46); r.screen('play'); r.step(140); ${CAP('Pop beside a balloon to burst it')}`],
  ['05-cleared', `r.goto(6);  r.screen('play'); r.step(80); r.win(4);`],                    // CLEARED card
  ['06-map',     `r.screen('levelpath');`],                                                 // 106-level map
];

function serve() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(WEB, p);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(HTTP_PORT, () => resolve(s));
  });
}

(async () => {
  const server = await serve();
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--user-data-dir=/tmp/rattle-shots-profile',
    '--remote-debugging-port=' + CDP_PORT, 'about:blank'], { stdio: 'ignore' });
  let client;
  for (let i = 0; i < 30 && !client; i++) { try { client = await CDP({ port: CDP_PORT }); } catch (e) { await sleep(400); } }
  if (!client) { chrome.kill(); server.close(); throw new Error('no Chrome on ' + CDP_PORT); }
  const { Page, Runtime, Emulation } = client;
  await Page.enable(); await Runtime.enable();
  for (const [slot, w, h, dsr] of SIZES) {
    const dir = path.join(OUT, slot);
    fs.mkdirSync(dir, { recursive: true });
    await Emulation.setDeviceMetricsOverride({ width: w, height: h, deviceScaleFactor: dsr, mobile: true });
    for (const [name, pose] of SHOTS) {
      await Page.navigate({ url: `http://localhost:${HTTP_PORT}/` });
      await Page.loadEventFired();
      for (let i = 0; i < 40; i++) { const r = await Runtime.evaluate({ expression: 'typeof window.__r', returnByValue: true }); if (r.result.value === 'object') break; await sleep(120); }
      await Runtime.evaluate({ expression: SEED });
      await Runtime.evaluate({ expression: `(function(){ const r=window.__r; ${pose} r.render && r.render(); })()` });
      await sleep(500);
      const { data } = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(data, 'base64'));
      console.log('  ' + slot + '/' + name + '.png');
    }
  }
  await client.close(); chrome.kill(); server.close();
  console.log('done → ' + path.relative(process.cwd(), OUT));
})().catch(e => { console.error(e); process.exit(1); });
