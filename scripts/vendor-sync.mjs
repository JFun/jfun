#!/usr/bin/env node
/* vendor-sync — keep the no-build vendored copies of @jfun browser builds in lockstep
   with their package source. Browsers can't resolve node_modules, so a game copies a
   package's UMD .js inline (a "vendored" copy); this script regenerates those copies,
   and `--check` fails the test suite if any has drifted.

   Why it matters: a stale vendored growth-loop.js = two clients computing different
   daily seeds → the daily + share loop silently breaks. Determinism is the contract,
   so drift must be impossible to ship.

   Usage:
     node scripts/vendor-sync.mjs            # copy package source → every vendored copy
     node scripts/vendor-sync.mjs --check    # exit 1 if any vendored copy is stale

   What it syncs:
   - EXPLICIT manifest below (copies that live in a game's own js/ dir, e.g. a game
     that adopted ONE package into its existing structure — like Moraine).
   - AUTO: every apps/<game>/web/js/vendor/ files whose <name> matches a package's
     "browser" build (the vendor/ dir is by-convention only vendored package copies).
   It deliberately does NOT touch a game's own hand-maintained js (e.g. Moraine keeps
   its own analytics.js/audio.js — the canonical sources the packages were lifted from). */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Explicit vendored copies that live outside a web/js/vendor/ dir.
const MANIFEST = [
  { src: "packages/growth-loop/src/growth-loop.js", to: "apps/moraine/web/js/growth-loop.js" },
];

// basename(browser build) -> absolute source path, read from each package.json "browser".
async function browserBuilds() {
  const map = {};
  let pkgs = [];
  try { pkgs = await fs.readdir(path.join(ROOT, "packages")); } catch (e) {}
  for (const p of pkgs) {
    try {
      const pj = JSON.parse(await fs.readFile(path.join(ROOT, "packages", p, "package.json"), "utf8"));
      if (pj.browser) map[path.basename(pj.browser)] = path.join(ROOT, "packages", p, pj.browser);
    } catch (e) {}
  }
  return map;
}

// Auto-discover apps/*/web/js/vendor/*.js that correspond to a package browser build.
async function discoverVendor() {
  const out = [], builds = await browserBuilds();
  let apps = [];
  try { apps = await fs.readdir(path.join(ROOT, "apps")); } catch (e) {}
  for (const a of apps) {
    const vdir = path.join(ROOT, "apps", a, "web", "js", "vendor");
    let files = [];
    try { files = await fs.readdir(vdir); } catch (e) { continue; }
    for (const f of files) if (builds[f]) out.push({ src: path.relative(ROOT, builds[f]), to: path.relative(ROOT, path.join(vdir, f)) });
  }
  return out;
}

const check = process.argv.includes("--check");
const pairs = [...MANIFEST, ...(await discoverVendor())];

let drift = 0, synced = 0;
for (const { src, to } of pairs) {
  let s;
  try { s = await fs.readFile(path.join(ROOT, src), "utf8"); }
  catch (e) { console.error(`  ✗ missing source: ${src}`); drift++; continue; }
  let t = null;
  try { t = await fs.readFile(path.join(ROOT, to), "utf8"); } catch (e) {}
  if (check) {
    if (t !== s) { console.error(`  ✗ DRIFT: ${to} ≠ ${src}`); drift++; }
  } else if (t !== s) {
    await fs.mkdir(path.dirname(path.join(ROOT, to)), { recursive: true });
    await fs.writeFile(path.join(ROOT, to), s);
    console.log(`  ↳ synced ${to}`);
    synced++;
  }
}

if (check) {
  if (drift) { console.error(`✗ vendor-sync: ${drift} vendored cop${drift === 1 ? "y is" : "ies are"} stale — run \`node scripts/vendor-sync.mjs\``); process.exit(1); }
  console.log("✓ vendor copies in sync");
} else {
  console.log(synced ? `✓ vendor-sync: ${synced} updated` : "✓ vendor-sync: already in sync");
}
