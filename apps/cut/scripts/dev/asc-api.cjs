#!/usr/bin/env node
// Direct App Store Connect API client for Cut (com.jfun.cut, ASC app 6790073592).
// ZERO third-party deps — Node built-in `crypto` (ES256 JWT) + `https`.
// Reads the ASC API key (.p8) BY PATH and never logs its contents.
//   node asc-api.cjs orient        # read-only: print version/localization/appInfo IDs
//   node asc-api.cjs metadata      # PATCH description/keywords/subtitle/URLs
//   node asc-api.cjs screenshots   # upload the 15 PNGs (reserve→upload→commit)
//   node asc-api.cjs categories    # primary/secondary category
// The Key ID + Issuer ID are identifiers (not secret); only the .p8 is secret.
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Account identifiers live in a GITIGNORED local config (this repo is public).
// keyId/issuerId are identifiers, not secrets — but kept out of git anyway; the
// only real secret is the .p8, which stays in ~/.appstoreconnect (never committed,
// referenced by path, never read into git). Bootstrap: copy .asc-config.example.json.
const CFG_PATH = path.join(__dirname, '.asc-config.json');
if (!fs.existsSync(CFG_PATH)) {
  console.error(`Missing ${CFG_PATH}\nCreate it (see .asc-config.example.json):\n  {"keyId":"...","issuerId":"...","appId":"..."}\nThe matching key must live at ~/.appstoreconnect/private_keys/AuthKey_<keyId>.p8`);
  process.exit(1);
}
const CFG = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
const KEY_ID = CFG.keyId;
const ISSUER_ID = CFG.issuerId;
const P8_PATH = CFG.p8Path
  ? CFG.p8Path.replace(/^~/, os.homedir())
  : path.join(os.homedir(), '.appstoreconnect', 'private_keys', `AuthKey_${KEY_ID}.p8`);
const APP_ID = CFG.appId;
const HOST = 'api.appstoreconnect.apple.com';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
let _tok, _tokExp = 0;
function token() {
  const now = Math.floor(Date.now() / 1000);
  if (_tok && now < _tokExp - 30) return _tok;
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' };
  const input = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
  const key = crypto.createPrivateKey(fs.readFileSync(P8_PATH));
  const sig = crypto.sign('SHA256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
  _tok = input + '.' + b64url(sig); _tokExp = payload.exp;
  return _tok;
}

// Generic JSON request. Returns {status, json}. Rejects on non-2xx.
function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      host: HOST, path: p, method,
      headers: {
        Authorization: 'Bearer ' + token(),
        Accept: 'application/json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let out = '';
      res.on('data', (c) => (out += c));
      res.on('end', () => {
        let json = null;
        try { json = out ? JSON.parse(out) : null; } catch (e) { /* non-json */ }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ status: res.statusCode, json });
        else reject(new Error(`${method} ${p} → ${res.statusCode}\n${out}`));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function orient() {
  const app = await api('GET', `/v1/apps/${APP_ID}?include=appStoreVersions,appInfos&fields[appStoreVersions]=versionString,appStoreState,platform,appVersionState&fields[appInfos]=appStoreState`);
  console.log('APP:', app.json.data.attributes.name, '| bundle', app.json.data.attributes.bundleId, '| sku', app.json.data.attributes.sku);
  const inc = app.json.included || [];
  const versions = inc.filter((x) => x.type === 'appStoreVersions');
  const infos = inc.filter((x) => x.type === 'appInfos');
  const ver = versions.find((v) => v.attributes.platform === 'IOS') || versions[0];
  console.log('VERSION:', ver.id, '| v' + ver.attributes.versionString, '|', ver.attributes.appVersionState || ver.attributes.appStoreState);
  const vlocs = await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale,description,keywords,promotionalText,marketingUrl,supportUrl`);
  vlocs.json.data.forEach((l) => console.log('  verLoc:', l.id, l.attributes.locale, '| desc?', !!l.attributes.description, '| kw?', !!l.attributes.keywords));
  const info = infos[0];
  console.log('APPINFO:', info.id);
  const ilocs = await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations?fields[appInfoLocalizations]=locale,name,subtitle`);
  ilocs.json.data.forEach((l) => console.log('  infoLoc:', l.id, l.attributes.locale, '| name', JSON.stringify(l.attributes.name), '| subtitle', JSON.stringify(l.attributes.subtitle)));
  // Existing screenshot sets (so re-runs don't duplicate)
  const enV = vlocs.json.data.find((l) => l.attributes.locale === 'en-US') || vlocs.json.data[0];
  if (enV) {
    const sets = await api('GET', `/v1/appStoreVersionLocalizations/${enV.id}/appScreenshotSets?fields[appScreenshotSets]=screenshotDisplayType`);
    console.log('SCREENSHOT SETS on', enV.attributes.locale + ':', sets.json.data.map((s) => `${s.id}(${s.attributes.screenshotDisplayType})`).join(', ') || '(none)');
  }
}

// --- shared discovery: the version/localization/appInfo IDs every writer needs ---
async function discover() {
  const app = await api('GET', `/v1/apps/${APP_ID}?include=appStoreVersions,appInfos`);
  const inc = app.json.included || [];
  const ver = inc.filter((x) => x.type === 'appStoreVersions').find((v) => v.attributes.platform === 'IOS');
  const info = inc.filter((x) => x.type === 'appInfos')[0];
  const vlocs = await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations`);
  const verLoc = vlocs.json.data.find((l) => l.attributes.locale === 'en-US') || vlocs.json.data[0];
  const ilocs = await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`);
  const infoLoc = ilocs.json.data.find((l) => l.attributes.locale === 'en-US') || ilocs.json.data[0];
  return { verId: ver.id, verLocId: verLoc.id, infoId: info.id, infoLocId: infoLoc.id };
}

const META = {
  subtitle: 'Rope-cutting physics puzzles',
  promotionalText: '53 hand-tuned rope-cutting puzzles in a moonlit workshop. Cut the right rope, land the crate, bring them all home. No ads, no accounts, play offline.',
  keywords: 'rope,cut,physics,puzzle,crate,drop,slice,swing,pendulum,brain,casual,relax,logic,gravity',
  supportUrl: 'https://jfun.github.io/jfun/cut/support.html',
  marketingUrl: 'https://jfun.github.io/jfun/cut/support.html',
  privacyPolicyUrl: 'https://jfun.github.io/jfun/cut/privacy.html',
  description: [
    'A moonlit workshop. Ropes hold a wooden crate above its basket. Swipe to sever a rope and let gravity, swing, and momentum carry the crate home.',
    '',
    '53 hand-tuned levels introduce one idea at a time: pendulums, bounce pads, pulleys, elastic cords, spinning sawblades, wind, magnets, and stars to collect on the way down. Every level is verified solvable. One thumb, no timers.',
    '',
    '- 53 physics puzzles with a gentle difficulty rhythm',
    '- A dozen mechanics, each taught wordlessly the first time you meet it',
    '- Night Rig art: moonlit rig, drifting fireflies, a soft kalimba score',
    '- Universal: iPhone and iPad',
    '- Play offline. No ads. No in-app purchases. No account.',
    '',
    'Cut the right rope. Land the crate. Bring every crate home.',
  ].join('\n'),
};

async function metadata() {
  const { verLocId, infoLocId } = await discover();
  await api('PATCH', `/v1/appStoreVersionLocalizations/${verLocId}`, {
    data: { type: 'appStoreVersionLocalizations', id: verLocId, attributes: {
      description: META.description, keywords: META.keywords,
      promotionalText: META.promotionalText, supportUrl: META.supportUrl, marketingUrl: META.marketingUrl,
    } },
  });
  console.log('✓ version localization: description, keywords, promo, support+marketing URLs');
  await api('PATCH', `/v1/appInfoLocalizations/${infoLocId}`, {
    data: { type: 'appInfoLocalizations', id: infoLocId, attributes: {
      subtitle: META.subtitle, privacyPolicyUrl: META.privacyPolicyUrl,
    } },
  });
  console.log('✓ app-info localization: subtitle, privacy policy URL');
}

// Raw PUT of a byte slice to Apple's blob storage (the reserve step hands back
// signed upload operations with their own host + headers).
function uploadPut(op, buf) {
  return new Promise((resolve, reject) => {
    const u = new URL(op.url);
    const slice = buf.subarray(op.offset || 0, (op.offset || 0) + op.length);
    const headers = {};
    (op.requestHeaders || []).forEach((h) => (headers[h.name] = h.value));
    headers['Content-Length'] = slice.length;
    const req = https.request({ host: u.host, path: u.pathname + u.search, method: op.method || 'PUT', headers }, (res) => {
      let out = ''; res.on('data', (c) => (out += c));
      res.on('end', () => (res.statusCode >= 200 && res.statusCode < 300 ? resolve() : reject(new Error(`upload ${res.statusCode} ${out}`))));
    });
    req.on('error', reject);
    req.write(slice); req.end();
  });
}

async function screenshots() {
  const { verLocId } = await discover();
  // Our exact PNG sizes → Apple display slots. 6.9" (1320x2868) satisfies the
  // required primary iPhone slot APP_IPHONE_67; iPad 13" (2048x2732) → APP_IPAD_PRO_3GEN_129.
  const SLOTS = [
    { type: 'APP_IPHONE_67', dir: 'screenshots/appstore/iphone-6.9' },
    { type: 'APP_IPAD_PRO_3GEN_129', dir: 'screenshots/appstore/ipad-13' },
  ];
  // Idempotent: drop any pre-existing sets for these slots so re-runs are clean.
  const existing = await api('GET', `/v1/appStoreVersionLocalizations/${verLocId}/appScreenshotSets`);
  for (const s of existing.json.data) {
    if (SLOTS.some((sl) => sl.type === s.attributes.screenshotDisplayType)) {
      await api('DELETE', `/v1/appScreenshotSets/${s.id}`);
      console.log('  removed existing set', s.attributes.screenshotDisplayType);
    }
  }
  for (const slot of SLOTS) {
    const set = await api('POST', '/v1/appScreenshotSets', {
      data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: slot.type },
        relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: verLocId } } } },
    });
    const setId = set.json.data.id;
    const files = fs.readdirSync(slot.dir).filter((f) => f.endsWith('.png')).sort();
    console.log(`SET ${slot.type} (${files.length} shots):`);
    for (const f of files) {
      const buf = fs.readFileSync(path.join(slot.dir, f));
      const rsv = await api('POST', '/v1/appScreenshots', {
        data: { type: 'appScreenshots', attributes: { fileName: f, fileSize: buf.length },
          relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } } },
      });
      const shot = rsv.json.data;
      for (const op of shot.attributes.uploadOperations) await uploadPut(op, buf);
      const md5 = crypto.createHash('md5').update(buf).digest('hex');
      await api('PATCH', `/v1/appScreenshots/${shot.id}`, {
        data: { type: 'appScreenshots', id: shot.id, attributes: { uploaded: true, sourceFileChecksum: md5 } },
      });
      console.log('  ✓', f);
    }
  }
}

async function categories() {
  const { infoId } = await discover();
  await api('PATCH', `/v1/appInfos/${infoId}`, {
    data: { type: 'appInfos', id: infoId, relationships: {
      primaryCategory: { data: { type: 'appCategories', id: 'GAMES' } },
      primarySubcategoryOne: { data: { type: 'appCategories', id: 'GAMES_PUZZLE' } },
      primarySubcategoryTwo: { data: { type: 'appCategories', id: 'GAMES_CASUAL' } },
    } },
  });
  console.log('✓ category: Games / Puzzle + Casual');
}

async function build() {
  const { verId } = await discover();
  const builds = await api('GET', `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=10&fields[builds]=version,processingState,uploadedDate`);
  builds.json.data.forEach((b) => console.log('  build', b.attributes.version, b.attributes.processingState, b.attributes.uploadedDate));
  const valid = builds.json.data.find((b) => b.attributes.processingState === 'VALID');
  if (!valid) throw new Error('no VALID (processed) build yet — Apple may still be processing');
  await api('PATCH', `/v1/appStoreVersions/${verId}/relationships/build`, { data: { type: 'builds', id: valid.id } });
  console.log('✓ attached build', valid.attributes.version, '→ version', verId);
}

async function pricing() {
  // Find the Free price point for the base territory (USA).
  const pp = await api('GET', `/v1/apps/${APP_ID}/appPricePoints?filter[territory]=USA&limit=200&fields[appPricePoints]=customerPrice`);
  const free = pp.json.data.find((p) => parseFloat(p.attributes.customerPrice) === 0);
  if (!free) throw new Error('no free price point found for USA');
  // A price schedule with a single manual price at the free point = a free app.
  await api('POST', '/v1/appPriceSchedules', {
    data: {
      type: 'appPriceSchedules',
      relationships: {
        app: { data: { type: 'apps', id: APP_ID } },
        baseTerritory: { data: { type: 'territories', id: 'USA' } },
        manualPrices: { data: [{ type: 'appPrices', id: '${price0}' }] },
      },
    },
    included: [{
      type: 'appPrices', id: '${price0}',
      attributes: { startDate: null },
      relationships: { appPricePoint: { data: { type: 'appPricePoints', id: free.id } } },
    }],
  });
  console.log('✓ price schedule: Free (base territory USA, point', free.id + ')');
}

async function finalize() {
  const { verId } = await discover();
  // Copyright — version-level attribute.
  await api('PATCH', `/v1/appStoreVersions/${verId}`, {
    data: { type: 'appStoreVersions', id: verId, attributes: { copyright: '2026 Cut' } },
  });
  console.log('✓ copyright: 2026 Cut');
  // App Review contact + notes. PATCH email if a detail already exists (account
  // may have pre-filled name/phone); otherwise report what's still needed.
  const attrs = {
    contactFirstName: 'Qili',
    contactLastName: 'Chen',
    contactPhone: '+1 4086217503',
    contactEmail: 'jayfunlin@gmail.com',
    demoAccountRequired: false,
    notes: 'No login, accounts, or in-app purchases. Single-player offline puzzle game. External services: Firebase Analytics (Google) only - anonymous gameplay events (level_start / level_complete). No backend, ads, payment, or AI services. English-only UI, consistent across all regions.',
  };
  let detail = null;
  try { detail = (await api('GET', `/v1/appStoreVersions/${verId}/appStoreReviewDetail`)).json.data; } catch (e) { /* none yet */ }
  if (detail) {
    await api('PATCH', `/v1/appStoreReviewDetails/${detail.id}`, { data: { type: 'appStoreReviewDetails', id: detail.id, attributes: attrs } });
    console.log('✓ review contact updated:', attrs.contactFirstName, attrs.contactLastName, '·', attrs.contactPhone, '·', attrs.contactEmail);
  } else {
    await api('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: attrs, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: verId } } } } });
    console.log('✓ review contact created:', attrs.contactFirstName, attrs.contactLastName, '·', attrs.contactPhone, '·', attrs.contactEmail);
  }
}

// Submit the version for App Review. IRREVERSIBLE-ish (enters Apple's queue).
async function submit() {
  const { verId } = await discover();
  // MANUAL release = the app does NOT auto-go-live on approval; you click Release.
  // Changeable anytime before release. Pass `submit auto` for AFTER_APPROVAL.
  const releaseType = process.argv[3] === 'auto' ? 'AFTER_APPROVAL' : 'MANUAL';
  await api('PATCH', `/v1/appStoreVersions/${verId}`, { data: { type: 'appStoreVersions', id: verId, attributes: { releaseType } } });
  console.log('✓ release type:', releaseType);
  // One open review submission per app — create, or reuse an existing open one.
  let subId;
  try {
    const s = await api('POST', '/v1/reviewSubmissions', {
      data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: APP_ID } } } },
    });
    subId = s.json.data.id;
    console.log('✓ review submission created:', subId);
  } catch (e) {
    const ex = await api('GET', `/v1/apps/${APP_ID}/reviewSubmissions?filter[platform]=IOS`);
    const open = (ex.json.data || []).find((r) => !['COMPLETE', 'CANCELING'].includes(r.attributes.state));
    if (!open) throw e;
    subId = open.id;
    console.log('  reusing open review submission:', subId, '(' + open.attributes.state + ')');
  }
  // Add the version to the submission (ignore if already present).
  try {
    await api('POST', '/v1/reviewSubmissionItems', {
      data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: subId } }, appStoreVersion: { data: { type: 'appStoreVersions', id: verId } } } },
    });
    console.log('✓ version added to submission');
  } catch (e) {
    if (!/already/i.test(e.message)) throw e;
    console.log('  version already in submission');
  }
  // Finalize — this is the actual submit.
  await api('PATCH', `/v1/reviewSubmissions/${subId}`, { data: { type: 'reviewSubmissions', id: subId, attributes: { submitted: true } } });
  console.log('✓✓ SUBMITTED FOR REVIEW');
}

const cmd = process.argv[2] || 'orient';
const fns = { orient, metadata, screenshots, categories, build, pricing, finalize, submit };
(async () => {
  try {
    if (!fns[cmd]) { console.error('unknown command:', cmd, '\navailable:', Object.keys(fns).join(', ')); process.exit(1); }
    await fns[cmd]();
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
