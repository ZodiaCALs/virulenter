#!/usr/bin/env node
/**
 * fetch-sdk.mjs — installs the Android SDK packages this project needs,
 * without going through sdkmanager.
 *
 * sdkmanager's own HTTP client fails on this machine (an IO exception fetching
 * its source manifests) even though the same URLs load fine from curl and from
 * a plain JVM. The repository manifests are ordinary XML, so we read them
 * directly, pick the macosx archives for the exact revisions we want, download
 * them with curl and unpack them into the layout Gradle expects.
 *
 * Writes into .toolchain/sdk (git-ignored, ~500 MB).
 *
 *   node tools/fetch-sdk.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TC = join(ROOT, '.toolchain');
const SDK = join(TC, 'sdk');
const REPO = 'https://dl.google.com/android/repository/';

export const PACKAGES = [
  { id: 'platform-tools', manifest: 'repository2-3.xml', dir: 'platform-tools' },
  { id: 'platforms;android-35', manifest: 'repository2-3.xml', dir: 'platforms/android-35' },
  { id: 'build-tools;35.0.0', manifest: 'repository2-3.xml', dir: 'build-tools/35.0.0' }
];

const cache = new Map();

function manifest(name) {
  if (!cache.has(name)) {
    const file = join(TC, name);
    if (!existsSync(file)) {
      console.log('fetching', name);
      execFileSync('curl', ['-sL', '-o', file, REPO + name], { stdio: 'inherit' });
    }
    cache.set(name, readFileSync(file, 'utf8'));
  }
  return cache.get(name);
}

/* Pull the macosx archive for one exact package path. */
function archiveFor(name, pkgPath) {
  const xml = manifest(name);
  const marker = `<remotePackage path="${pkgPath}">`;
  const start = xml.indexOf(marker);
  if (start < 0) return null;
  /* the package block ends at the next remotePackage or the end of the file */
  const next = xml.indexOf('<remotePackage ', start + marker.length);
  const block = xml.slice(start, next < 0 ? xml.length : next);

  const arches = [...block.matchAll(
    /<archive>([\s\S]*?)<\/archive>/g)].map((m) => m[1]);
  const candidates = [];
  for (const arch of arches) {
    const host = (/<host-os>([^<]+)<\/host-os>/.exec(arch) || [])[1];
    const url = (/<url>([^<]+)<\/url>/.exec(arch) || [])[1];
    if (!url) continue;
    /* A host-os tag means the archive is platform specific: keep macosx only.
       No tag means it is platform independent (the SDK platforms, for
       instance), which is what we want on any host. */
    if (host && host !== 'macosx') continue;
    candidates.push({ url, host });
  }
  if (!candidates.length) return null;
  /* prefer an explicitly tagged macosx archive, then a darwin-looking name,
     then whatever is left (the platform-independent case) */
  const tagged = candidates.find((c) => c.host === 'macosx');
  if (tagged) return tagged.url;
  const darwinish = candidates.find((c) => /darwin|mac/i.test(c.url));
  if (darwinish) return darwinish.url;
  return candidates[0].url;
}

function writeLicences() {
  const licDir = join(SDK, 'licenses');
  mkdirSync(licDir, { recursive: true });
  const LICENCES = {
    'android-sdk-license': [
      '8933bad161af4178b1185d1a37fbf41ea5269c55',
      'd56f5187479451eabf01fb78af6dfcb131a6481e',
      '24333f8a63b6825ea9c5514f83c2829b004d1fee'
    ],
    'android-sdk-preview-license': ['84831b9409646a918e30573bab4c9c91346d8abd'],
    'android-sdk-arm-dbt-license': ['859f317696f67ef3d7f30a50a5560e7834b43903']
  };
  for (const [name, hashes] of Object.entries(LICENCES)) {
    writeFileSync(join(licDir, name), hashes.join('\n') + '\n', 'utf8');
  }
}

export function ensureSdk() {
  mkdirSync(SDK, { recursive: true });
  for (const pkg of PACKAGES) {
    const target = join(SDK, pkg.dir);
    if (existsSync(target) && readdirSync(target).length) {
      console.log('have  ', pkg.id);
      continue;
    }
    const url = archiveFor(pkg.manifest, pkg.id);
    if (!url) {
      console.error('FAIL  ' + pkg.id + ' — no macosx archive in ' + pkg.manifest);
      process.exitCode = 1;
      continue;
    }
    const zip = join(TC, url.split('/').pop());
    if (!existsSync(zip)) {
      console.log('down  ', url);
      execFileSync('curl', ['-sL', '--fail', '-o', zip, REPO + url], { stdio: 'inherit' });
    }
    console.log('unzip ', pkg.id);
    mkdirSync(target, { recursive: true });
    execFileSync('unzip', ['-q', '-o', zip, '-d', target], { stdio: 'inherit' });
    /* some archives nest everything under a single top-level folder */
    const inner = join(target, readdirSync(target)[0]);
    const entries = readdirSync(target);
    if (entries.length === 1 && existsSync(inner) && readdirSync(inner).length > 0) {
      execFileSync('sh', ['-c', `mv "${inner}"/* "${target}"/ && rmdir "${inner}"`], { stdio: 'inherit' });
    }
    rmSync(zip, { force: true });
  }
  writeLicences();

  writeFileSync(join(TC, 'sdk', 'sdk-ready'), new Date().toISOString());
  return SDK;
}

if (process.argv[1] && process.argv[1].endsWith('fetch-sdk.mjs')) {
  const sdk = ensureSdk();
  const ok = PACKAGES.every((p) => existsSync(join(sdk, p.dir)));
  console.log('\nSDK at', sdk, ok ? '(complete)' : '(INCOMPLETE)');
  for (const p of PACKAGES) console.log(' ', existsSync(join(sdk, p.dir)) ? 'ok  ' : 'MISS', p.id);
  process.exit(ok ? 0 : 1);
}
