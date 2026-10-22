#!/usr/bin/env node
/**
 * clean.mjs — removes regenerable build data, leaving the project intact.
 *
 * Nothing here is source. Everything it deletes can be recreated:
 *   node tools/build-apk.mjs --provision     (fetch the toolchain again)
 *   node build.mjs                           (rebuild the single-file web app)
 *   node tools/build-apk.mjs                 (rebuild the APKs)
 *
 * Deliberately NOT touched:
 *   dist/                             the APKs and web build are deliverables
 *   apk/gradle/wrapper/gradle-wrapper.jar   part of the source tree
 *   apk/virulenter-release.jks        the signing key
 *   app/, tools/, apk/src             all source
 *   .toolchain/sdk/{emulator,ndk,system-images,platforms/android-36}
 *                                     not installed by this project's scripts;
 *                                     they belong to other work, so removing
 *                                     them needs --sdk-extras
 *
 *   node tools/clean.mjs                 # caches and build output
 *   node tools/clean.mjs --toolchain     # everything regenerable, incl. JDK/SDK/Gradle
 *   node tools/clean.mjs --sdk-extras    # also the unrelated SDK components
 *   node tools/clean.mjs --dry-run       # show what would go
 */
import { existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TC = join(ROOT, '.toolchain');
const SDK = join(TC, 'sdk');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const ALL = args.includes('--toolchain');
const SDK_EXTRAS = args.includes('--sdk-extras');

function size(path) {
  if (!existsSync(path)) return 0;
  try {
    const out = execFileSync('du', ['-sk', path], { encoding: 'utf8' });
    return parseInt(out.split('\t')[0], 10) * 1024;
  } catch (e) { return 0; }
}

const targets = [];
const add = (label, path, note) => targets.push({ label, path, note, bytes: size(path) });

/* ── build output: pure regeneration, no downloads needed ── */
add('Gradle build output', join(ROOT, 'apk', 'app', 'build'));
add('Gradle project cache', join(ROOT, 'apk', '.gradle'));
add('Gradle artifact cache', join(TC, 'gradle-home', 'caches'));
add('Gradle daemon logs', join(TC, 'gradle-home', 'daemon'));
add('Gradle native libs', join(TC, 'gradle-home', 'native'));
add('Android prefs cache', join(TC, 'android-home'));

/* ── scratch left over from tooling ── */
add('SDK repo manifests', join(TC, 'repo.xml'));
add('SDK repo manifests', join(TC, 'repository2-3.xml'));
add('empty scratch dirs', join(TC, 'tmp'));
add('empty npm scratch', join(TC, 'nodelibs'));
add('QR cache', join(TC, 'qr-cache'));
add('macOS metadata', join(ROOT, '.DS_Store'));
add('macOS metadata', join(ROOT, 'apk', '.DS_Store'));
add('macOS metadata', join(SDK, '.DS_Store'));

/* ── optional: the whole toolchain ── */
if (ALL) {
  add('JDK 17', join(TC, 'jdk17'), 're-downloaded by --provision');
  add('Gradle 8.9', join(TC, 'gradle'), 'the wrapper fetches its own instead');
  add('Gradle wrapper distributions', join(TC, 'gradle-home', 'wrapper'));
  add('Android SDK', SDK, 're-downloaded by --provision');
  add('OpenCV for QR', join(TC, 'pylibs'), 'optional, only used to draw the QR');
}

/* ── optional: SDK pieces this project never installed ── */
if (SDK_EXTRAS) {
  add('Android emulator', join(SDK, 'emulator'));
  add('Android NDK', join(SDK, 'ndk'));
  add('Emulator system images', join(SDK, 'system-images'));
  add('Android platform 36', join(SDK, 'platforms', 'android-36'));
}

/* Nothing under .toolchain is source, so an empty .toolchain can go. */
const present = targets.filter((t) => existsSync(t.path));

function mb(bytes) { return (bytes / 1048576).toFixed(1) + ' MB'; }

if (!present.length) {
  console.log('Already clean — nothing to remove.');
  process.exit(0);
}

console.log(DRY ? 'Would remove:\n' : 'Removing:\n');
let freed = 0;
for (const t of present) {
  const b = size(t.path);
  freed += b;
  console.log(`  ${mb(b).padStart(10)}  ${t.label}`);
  if (t.note) console.log(`              ${t.note}`);
  if (!DRY) {
    try { rmSync(t.path, { recursive: true, force: true }); }
    catch (e) { console.log(`              could not remove: ${e.message}`); }
  }
}

/* remove .toolchain itself if it is now empty */
if (!DRY && existsSync(TC)) {
  try {
    if (readdirSync(TC).length === 0) rmSync(TC, { recursive: true, force: true });
  } catch (e) { /* leave it */ }
}

console.log(`\n${DRY ? 'would free' : 'freed'} ${mb(freed)}`);

if (!DRY) {
  console.log('\nTo rebuild:');
  if (ALL) console.log('  node tools/build-apk.mjs --provision   # toolchain + APK');
  else console.log('  node tools/build-apk.mjs               # APK (uses the cached toolchain)');
  console.log('  node build.mjs                         # single-file web app');
  console.log('\nThe APKs in dist/ are untouched.');
}
