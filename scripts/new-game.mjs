#!/usr/bin/env node
/* Scaffold a new vanilla-JS web game with EVERY @jfun package pre-wired — most
   importantly @jfun/growth-loop, so "ship without a loop" stops being the path
   of least resistance. Copies templates/create-game, swaps the bundle id and
   tokens, vendors the package browser builds, and leaves a runnable game.

   Usage:  node scripts/new-game.mjs <name> [--title "Display Name"] [--dest <dir>]
   e.g.    node scripts/new-game.mjs tidepool --title "Tidepool"
   → apps/tidepool/ (com.jfun.tidepool), daily loop wired, `npm test` green. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = path.join(ROOT, "templates", "create-game");

// browser builds to vendor → web/js/vendor/<file>
const VENDOR = [
  ["web-game-core", "web-game-core.js"],
  ["analytics", "analytics.js"],
  ["audio", "audio.js"],
  ["growth-loop", "growth-loop.js"],
];
const SKIP = new Set(["node_modules", ".git", ".DS_Store"]);
const TEXT = /\.(js|cjs|mjs|json|html|css|md|sh|plist)$/;

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--title") a.title = argv[++i];
    else if (argv[i] === "--dest") a.dest = argv[++i];
    else a._.push(argv[i]);
  }
  return a;
}
const titleCase = s => s.replace(/[-_]+/g, " ").replace(/\b\w/g, m => m.toUpperCase());

async function copyDir(src, dst, transform) {
  await fs.mkdir(dst, { recursive: true });
  for (const ent of await fs.readdir(src, { withFileTypes: true })) {
    if (SKIP.has(ent.name)) continue;
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) await copyDir(s, d, transform);
    else if (TEXT.test(ent.name)) await fs.writeFile(d, transform(await fs.readFile(s, "utf8"), ent.name), "utf8");
    else await fs.copyFile(s, d);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = (args._[0] || "").trim();
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    console.error("usage: node scripts/new-game.mjs <name> [--title \"Display Name\"] [--dest <dir>]\n  <name> must be lower-kebab (e.g. tidepool, gravity-well)");
    process.exit(1);
  }
  const title = args.title || titleCase(name);
  const dest = path.resolve(args.dest || path.join(ROOT, "apps", name));

  try { await fs.access(dest); console.error(`✗ ${path.relative(ROOT, dest)} already exists — choose another name or remove it.`); process.exit(1); } catch (e) {}

  // tokens: __GAME__ → slug, __GameName__ → display, plus the package name.
  const sub = src => src.replace(/__GAME__/g, name).replace(/__GameName__/g, title)
    .replace(/"name": "create-game-template"/, `"name": "${name}"`);
  console.log(`• scaffolding ${path.relative(ROOT, dest)} (com.jfun.${name}) …`);
  await copyDir(TEMPLATE, dest, sub);

  // vendor the package browser builds (the no-build "inlined copy" model).
  const vdir = path.join(dest, "web", "js", "vendor");
  await fs.mkdir(vdir, { recursive: true });
  try { await fs.rm(path.join(vdir, ".gitkeep")); } catch (e) {}
  for (const [pkg, file] of VENDOR) {
    await fs.copyFile(path.join(ROOT, "packages", pkg, "src", file), path.join(vdir, file));
    console.log(`  ↳ vendored @jfun/${pkg}`);
  }

  console.log(`\n✓ ${title} ready.\n\nNext:\n  npm install                       # link @jfun/* into the new game\n  cd ${path.relative(ROOT, dest)} && npm run serve   # play it at http://localhost:8000\n  bash scripts/dev/test.sh          # self-test (run after every edit)\n\nThen replace the placeholder rules in web/js/engine.js with your game — the daily\nloop (daily + streak + share + k-funnel) is already wired in web/js/game.js.`);
}
main().catch(e => { console.error(e); process.exit(1); });
