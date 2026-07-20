#!/usr/bin/env node
// Rattle app-icon generator — renders the chosen option from web/_icons.html
// (canvas, the game's own bead/duck painters) via headless Chrome, strips the
// alpha channel (ASC silently BLANKS an icon with alpha), and writes it into
// the Xcode asset catalog. Regenerate rather than hand-edit.
//   node scripts/dev/gen-icon.cjs [optionIndex]   (default 1 = "H — duck on the pile")
const CDP = require('chrome-remote-interface');
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9463;
const HTTP_PORT = 4174;
const WEB = path.join(__dirname, '..', '..', 'web');
const OUT = path.join(__dirname, '..', '..', 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png');
const IDX = parseInt(process.argv[2] || '1', 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(WEB, p);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(HTTP_PORT, () => resolve(s));
  });
}

(async () => {
  const server = await serve();
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--user-data-dir=/tmp/rattle-icon-profile',
    '--remote-debugging-port=' + CDP_PORT, 'about:blank'], { stdio: 'ignore' });
  let client;
  for (let i = 0; i < 30 && !client; i++) { try { client = await CDP({ port: CDP_PORT }); } catch (e) { await sleep(400); } }
  if (!client) { chrome.kill(); server.close(); throw new Error('no Chrome on ' + CDP_PORT); }
  const { Page, Runtime } = client;
  await Page.enable(); await Runtime.enable();
  await Page.navigate({ url: `http://localhost:${HTTP_PORT}/_icons.html` });
  await Page.loadEventFired();
  for (let i = 0; i < 40; i++) { const r = await Runtime.evaluate({ expression: 'typeof window.__icon', returnByValue: true }); if (r.result.value === 'function') break; await sleep(120); }
  const r = await Runtime.evaluate({ expression: `window.__icon(${IDX})`, returnByValue: true });
  const dataUrl = r.result.value;
  if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) throw new Error('no dataURL from __icon(' + IDX + ')');
  const raw = path.join('/tmp', 'rattle-icon-raw.png');
  fs.writeFileSync(raw, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await client.close(); chrome.kill(); server.close();
  // flatten: canvas PNGs are RGBA — ASC blanks an alpha marketing icon. Composite on opaque.
  execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open('${raw}').convert('RGBA')
bg = Image.new('RGB', im.size, (23, 15, 31))   # the icon's own dark bg
bg.paste(im, mask=im.split()[3])
bg.save('${OUT}')
print('written', bg.size, bg.mode)
`]);
  const has = execFileSync('sips', ['-g', 'hasAlpha', OUT]).toString();
  console.log(has.trim());
  if (!/hasAlpha:\s*no/.test(has)) throw new Error('icon still has alpha!');
  console.log('ICON ✓ → ' + path.relative(process.cwd(), OUT));
})().catch(e => { console.error(e); process.exit(1); });
