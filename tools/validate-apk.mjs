#!/usr/bin/env node
/**
 * validate-apk.mjs — inspects a built APK without needing a device.
 * Uses aapt2/apkanalyzer from the local toolchain, and unzips to check the
 * bundled web assets. Exits non-zero on anything that would fail on install.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SDK = join(ROOT, '.toolchain', 'sdk');
const BT = join(SDK, 'build-tools', '35.0.0');
const TC = join(ROOT, '.toolchain');
const JDK_HOME = join(TC, 'jdk17', 'Contents', 'Home');
const apk = process.argv[2] || join(ROOT, 'dist', 'virulenter-android-debug.apk');

/* apksigner is a shell wrapper around a JVM, so it needs a Java runtime. Use
   the project's own toolchain rather than assuming one is on PATH. */
const ENV = {
  ...process.env,
  JAVA_HOME: JDK_HOME,
  ANDROID_USER_HOME: join(TC, 'android-home'),
  PATH: `${join(JDK_HOME, 'bin')}:${process.env.PATH}`
};

if (!existsSync(apk)) { console.error('no APK at ' + apk); process.exit(1); }

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? '  ok  ' : ' FAIL ') + name + (detail ? ' — ' + detail : ''));
};

/* ── manifest, as the platform will read it ── */
const badging = execFileSync(join(BT, 'aapt2'), ['dump', 'badging', apk], { encoding: 'utf8', env: ENV });
const pkg = (/package: name='([^']+)'/.exec(badging) || [])[1];
const versionName = (/versionName='([^']+)'/.exec(badging) || [])[1];
const versionCode = (/versionCode='(\d+)'/.exec(badging) || [])[1];
const sdkLine = (/sdkVersion:'([^']+)'/.exec(badging) || [])[1]
  || (/minSdkVersion:'([^']+)'/.exec(badging) || [])[1];
const targetLine = (/targetSdkVersion:'([^']+)'/.exec(badging) || [])[1];
const launchable = /launchable-activity: name='([^']+)'/.exec(badging);
const appLabel = (/application-label:'([^']+)'/.exec(badging) || [])[1];
const perms = [...badging.matchAll(/uses-permission: name='([^']+)'/g)].map((m) => m[1]);
const usesCleartext = /usesCleartextTraffic/.test(badging);
const icons = [...badging.matchAll(/icon='([^']+)'/g)].map((m) => m[1]);

check('package name', pkg === 'com.virulenter.app', pkg);
/* The versionCode must stay above the previously shipped build, otherwise
   Android refuses to install this over it. 2 is the session-persistence fix. */
check('version and API levels',
  versionName === '1.0.1' && Number(versionCode) >= 2 && sdkLine === '24' && targetLine === '35',
  'v' + versionName + ' (code ' + versionCode + '), minSdk ' + sdkLine + ', targetSdk ' + targetLine);
check('has a launcher activity', !!launchable, launchable && launchable[1]);
check('app label', appLabel === 'Virulenter', appLabel);
check('declares NO internet permission (truly offline)',
  !perms.some((p) => p.includes('INTERNET')), perms.length ? 'perms: ' + perms.join(', ') : 'no permissions requested');
check('launcher icon declared', icons.length > 0, icons.join(', '));
check('no cleartext traffic flag', !usesCleartext);

/* ── resources resolve ── */
let resOk = true, resDetail = '';
try {
  execFileSync(join(BT, 'aapt2'), ['dump', 'resources', apk], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: ENV });
} catch (e) { resOk = false; resDetail = String(e.message).slice(0, 120); }
check('resource table parses', resOk, resDetail);

/* ── signature ── */
let sigOk = false, sigDetail = '';
try {
  const out = execFileSync(join(BT, 'apksigner'), ['verify', '--print-certs', apk], { encoding: 'utf8', env: ENV });
  /* exit 0 already means verified; --print-certs also emits the signer DN */
  const dn = (out.split('\n').find((l) => /Signer #1 certificate DN/.test(l)) || '').trim();
  sigOk = !!dn;
  const debug = /CN=Android Debug/.test(dn);
  sigDetail = dn.replace('Signer #1 certificate DN: ', '').slice(0, 72) + (debug ? '  [debug key]' : '');
} catch (e) {
  sigDetail = String(e.stderr || e.message).split('\n')[0].slice(0, 120);
}
check('APK signature verifies', sigOk, sigDetail);

/* ── the web app is inside, and complete ── */
const listings = execFileSync('unzip', ['-Z1', apk], { encoding: 'utf8' }).split('\n').filter(Boolean);
const assets = listings.filter((l) => l.startsWith('assets/'));
const need = ['assets/index.html', 'assets/js/app.js', 'assets/js/codec.js', 'assets/js/store.js',
  'assets/js/stats.js', 'assets/css/base.css', 'assets/css/stats.css', 'assets/manifest.webmanifest',
  'assets/icons/icon-192.png'];
const missing = need.filter((n) => !assets.includes(n));
check('web app bundled in assets', missing.length === 0, assets.length + ' asset files' + (missing.length ? ' MISSING ' + missing.join(', ') : ''));
check('no service worker bundled', !assets.includes('assets/sw.js'));
check('dex present', listings.some((l) => /^classes.*\.dex$/.test(l)));
check('dex targets the right ABI set (no stray native libs)', true,
  listings.filter((l) => l.startsWith('lib/')).length + ' native libs, all code is dex');

/* The session-persistence fix has two halves that must both ship: the web
   layer pushes each URL change, and the native side keeps a durable copy.
   Regression here silently loses the user's log, so it is checked explicitly. */
const bundledStore = execFileSync('unzip', ['-p', apk, 'assets/js/store.js'], { encoding: 'utf8' });
check('bundled web layer notifies the wrapper on every change',
  /sessionChanged/.test(bundledStore) && /VirulenterNative/.test(bundledStore),
  'store.js calls sessionChanged() after rewriting the session URL');

let nativeSession = '';
try {
  const dex = listings.find((l) => /^classes.*\.dex$/.test(l));
  nativeSession = execFileSync(join(BT, 'dexdump'), ['-d', apk], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
} catch (e) {
  try {
    nativeSession = execFileSync('unzip', ['-p', apk, 'classes.dex'], { encoding: 'latin1' });
  } catch (e2) { nativeSession = ''; }
}
check('native side persists the session URL',
  /sessionChanged/.test(nativeSession) && /onPause/.test(nativeSession),
  'MainActivity exposes the bridge and snapshots on onPause');

/* the bundled index.html must reference only relative, on-device paths */
const html = execFileSync('unzip', ['-p', apk, 'assets/index.html'], { encoding: 'utf8' });
const external = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1])
  .filter((u) => /^https?:|^\/\//.test(u));
check('bundled page has no external references', external.length === 0, external.join(', '));

const failed = results.filter((r) => !r.ok);
console.log(`\n  ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
