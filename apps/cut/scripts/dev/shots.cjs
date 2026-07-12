// App Store screenshots via Chrome DevTools Protocol — exact device pixels, no
// clipping (plain --window-size clamps width to ~500px and crops). Self-contained:
// spawns its own static server + headless Chrome, poses each scene through Cut's
// existing URL hooks (?level / ?panel) + the window.__game debug API, and writes
//   screenshots/appstore/<slot>/<name>.png
// Run:  node scripts/dev/shots.cjs        (from apps/cut)
//
// Cut has no rAF in headless, so each scene forces a render with __game.stepN.
// On iPad the aspect cap kicks in → the shot shows the seamless framed layout.
const CDP = require('chrome-remote-interface');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9462;
const HTTP_PORT = 4173;
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
// name, query, setup(run after __game is live; `g` = window.__game). stepN forces a draw.
const SHOTS = [
  ['01-pulley',  'level=8&freeze=1',  'g.stepN(2)'],
  ['02-elastic', 'level=21&freeze=1', 'g.stepN(2)'],
  ['03-magnet',  'level=32&freeze=1', 'g.stepN(2)'],
  ['04-star',    'level=36&freeze=1', 'g.stepN(2)'],
  ['05-ending',  '',                  'g.setLevel(g.dims().LAST); g.winNow(); g.stepN(900)'],
];

function serve() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(WEB, p);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(HTTP_PORT, () => resolve(s));
  });
}

(async () => {
  const server = await serve();
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--user-data-dir=/tmp/cut-shots-profile',
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
    for (const [name, q, setup] of SHOTS) {
      await Page.navigate({ url: `http://localhost:${HTTP_PORT}/?sat=0&sab=0${q ? '&' + q : ''}` });
      await Page.loadEventFired();
      for (let i = 0; i < 40; i++) { const r = await Runtime.evaluate({ expression: 'typeof window.__game', returnByValue: true }); if (r.result.value === 'object') break; await sleep(120); }
      await Runtime.evaluate({ expression: `(function(){ const g=window.__game; ${setup}; })()` });
      await sleep(500);
      const { data } = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(data, 'base64'));
      console.log('  ' + slot + '/' + name + '.png');
    }
  }
  await client.close(); chrome.kill(); server.close();
  console.log('done → ' + path.relative(process.cwd(), OUT));
})().catch(e => { console.error(e); process.exit(1); });
