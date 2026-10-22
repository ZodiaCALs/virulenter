#!/usr/bin/env node
/**
 * sync-android.mjs — copies the web app into the Android project's assets.
 *
 * The APK bundles the same files the browser serves, so there is exactly one
 * implementation of the app. Two files are skipped on purpose:
 *
 *   sw.js                 the assets are already on the device; a service
 *                         worker would only duplicate them in the WebView cache
 *   manifest.webmanifest  installability comes from the APK itself
 *
 * Run this before building the APK. tools/build-apk.mjs does it for you.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'app');
const DEST = join(ROOT, 'apk', 'app', 'src', 'main', 'assets');

/* sw.js is dropped; manifest.webmanifest is rewritten rather than dropped, so
   the app still finds a manifest where it expects one. */
const REWRITE = {
  'manifest.webmanifest': (text) => {
    const m = JSON.parse(text);
    /* a packaged app has no install step and no scope to declare */
    delete m.start_url;
    delete m.scope;
    delete m.shortcuts;
    m.display = 'standalone';
    return JSON.stringify(m, null, 2) + '\n';
  }
};
const SKIP = new Set(['sw.js']);

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(base, full);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(rel);
  }
  return out;
}

if (!existsSync(SRC)) {
  console.error('no app/ directory to sync from');
  process.exit(1);
}

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });

let copied = 0, skipped = 0;
for (const rel of walk(SRC)) {
  if (SKIP.has(rel)) { skipped++; continue; }
  const target = join(DEST, rel);
  mkdirSync(dirname(target), { recursive: true });
  if (REWRITE[rel]) {
    writeFileSync(target, REWRITE[rel](readFileSync(join(SRC, rel), 'utf8')), 'utf8');
  } else {
    writeFileSync(target, readFileSync(join(SRC, rel)));
  }
  copied++;
}

console.log(`synced ${copied} assets into apk/app/src/main/assets`);
if (skipped) console.log(`  skipped: ${[...SKIP].join(', ')} (${skipped})`);
