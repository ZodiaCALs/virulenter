#!/usr/bin/env node
/**
 * sync-android.mjs — copies the web app into the Android project's assets.
 *
 * The APK bundles the same files the browser serves, so there is exactly one
 * implementation of the app — minified (tools/minify.mjs: comments and
 * indentation go, nothing is renamed). What only a browser install needs is
 * left out:
 *
 *   sw.js                 the assets are already on the device; a service
 *                         worker would only duplicate them in the WebView cache
 *   manifest.webmanifest  installability comes from the APK itself
 *   icons/                the launcher icon is the APK's own; the page's mark
 *                         is inline SVG (index.html loses the links to them)
 *
 * Run this before building the APK. tools/build-apk.mjs does it for you.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minifyJs, minifyCss, minifyHtml } from './minify.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'app');
const DEST = join(ROOT, 'apk', 'app', 'src', 'main', 'assets');

const SKIP = (rel) => rel === 'sw.js' || rel === 'manifest.webmanifest' || /^icons[\/]/.test(rel);

/* the page's links to the install manifest and icons go with the files */
const dropInstallLinks = (html) => html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="(?:alternate )?icon"[^>]*>/g, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '');

const MINIFY = {
  '.js': minifyJs,
  '.css': minifyCss,
  '.html': (text) => minifyHtml(dropInstallLinks(text))
};

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

let copied = 0, before = 0, after = 0;
const skipped = [];
for (const rel of walk(SRC)) {
  if (SKIP(rel)) { skipped.push(rel); continue; }
  const target = join(DEST, rel);
  mkdirSync(dirname(target), { recursive: true });
  const minify = MINIFY[rel.slice(rel.lastIndexOf('.'))];
  const body = readFileSync(join(SRC, rel));
  const out = minify ? Buffer.from(minify(body.toString('utf8')), 'utf8') : body;
  writeFileSync(target, out);
  before += body.length;
  after += out.length;
  copied++;
}

console.log(`synced ${copied} assets into apk/app/src/main/assets (${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB)`);
console.log(`  left out: ${skipped.join(', ')}`);
