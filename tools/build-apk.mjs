#!/usr/bin/env node
/**
 * build-apk.mjs — one command from source to a signed, installable APK.
 *
 *   1. syncs the web app from app/ into the Android project's assets
 *   2. generates local.properties pointing at the local SDK
 *   3. provisions the JDK, Gradle and Android SDK into .toolchain/ if missing
 *   4. runs Gradle, then copies the APK to dist/
 *
 *   node tools/build-apk.mjs              # debug APK (installable as-is)
 *   node tools/build-apk.mjs --release    # release, signed if keystore.properties exists
 *   node tools/build-apk.mjs --provision  # only fetch the toolchain, do not build
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TC = join(ROOT, '.toolchain');
const APK = join(ROOT, 'apk');
const DIST = join(ROOT, 'dist');

const args = process.argv.slice(2);
const RELEASE = args.includes('--release');
const PROVISION_ONLY = args.includes('--provision');
const SKIP_PROVISION = args.includes('--no-provision');

const JDK_HOME = join(TC, 'jdk17', 'Contents', 'Home');
const SDK = join(TC, 'sdk');
const WRAPPER = join(APK, 'gradlew');
const GRADLE = join(TC, 'gradle', 'bin', 'gradle');

/* Prefer the checked-in wrapper so the project builds the same way for anyone
   who clones it; fall back to the provisioned Gradle only if it is missing. */
function gradleCmd() {
  if (existsSync(WRAPPER)) return { cmd: WRAPPER, label: './gradlew' };
  return { cmd: GRADLE, label: 'gradle (provisioned)' };
}

function run(cmd, argv, opts = {}) {
  return execFileSync(cmd, argv, { stdio: 'inherit', ...opts });
}

function has(cmd) {
  return spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;
}

/* ── 1. toolchain ──────────────────────────────────────── */
async function provision() {
  const need = [];
  if (!existsSync(join(JDK_HOME, 'bin', 'java'))) need.push('jdk');
  /* the wrapper downloads its own Gradle, so only provision one if neither is
     available */
  if (!existsSync(GRADLE) && !existsSync(WRAPPER)) need.push('gradle');
  if (!existsSync(join(SDK, 'platforms', 'android-35', 'android.jar'))) need.push('sdk');

  if (!need.length) {
    console.log('toolchain: present');
  } else {
    console.log('toolchain: provisioning ' + need.join(', ') + ' into .toolchain/');

    if (need.includes('jdk')) {
      mkdirSync(TC, { recursive: true });
      const zip = join(TC, 'jdk.tar.gz');
      console.log('  downloading JDK 17…');
      run('curl', ['-sL', '--fail', '-o', zip,
        'https://api.adoptium.net/v3/binary/latest/17/ga/mac/aarch64/jdk/hotspot/normal/eclipse']);
      run('tar', ['xzf', zip], { cwd: TC });
      const dir = readdirSync(TC).find((d) => d.startsWith('jdk-17'));
      if (!dir) throw new Error('JDK archive did not contain a jdk-17 directory');
      run('sh', ['-c', `mv "${dir}" jdk17`], { cwd: TC });
      run('rm', ['-f', zip]);
    }

    if (need.includes('gradle')) {
      const zip = join(TC, 'gradle.zip');
      console.log('  downloading Gradle 8.9…');
      run('curl', ['-sL', '--fail', '-o', zip,
        'https://services.gradle.org/distributions/gradle-8.9-bin.zip']);
      run('unzip', ['-q', '-o', zip, '-d', TC]);
      run('sh', ['-c', 'rm -rf gradle && mv gradle-8.9 gradle'], { cwd: TC });
      run('rm', ['-f', zip]);
    }

    if (need.includes('sdk')) {
      console.log('  downloading Android SDK packages…');
      const { ensureSdk } = await import('./fetch-sdk.mjs');
      ensureSdk();
    }
  }

  if (!existsSync(join(JDK_HOME, 'bin', 'java'))) throw new Error('JDK still missing at ' + JDK_HOME);
  if (!existsSync(GRADLE) && !existsSync(WRAPPER)) throw new Error('no Gradle available');
  if (!existsSync(join(SDK, 'platforms', 'android-35', 'android.jar'))) throw new Error('Android SDK still missing at ' + SDK);
}

/* ── 2. sync the web app into assets ───────────────────── */
function syncAssets() {
  run(process.execPath, [join(ROOT, 'tools', 'sync-android.mjs')], { cwd: ROOT });
}

/* ── 3. tell Gradle where the SDK is ───────────────────── */
function writeLocalProperties() {
  writeFileSync(join(APK, 'local.properties'), `sdk.dir=${SDK}\n`, 'utf8');
}

/* ── 4. build ──────────────────────────────────────────── */
function gradleBuild() {
  mkdirSync(join(TC, 'android-home'), { recursive: true });
  const task = RELEASE ? 'assembleRelease' : 'assembleDebug';
  const env = {
    ...process.env,
    JAVA_HOME: JDK_HOME,
    ANDROID_HOME: SDK,
    ANDROID_SDK_ROOT: SDK,
    GRADLE_USER_HOME: join(TC, 'gradle-home'),
    /* Android tooling caches under ~/.android, which may not be writable
       (it is not in a sandboxed or shared environment) — keep it local.

       Set ANDROID_USER_HOME only. Also setting the deprecated
       ANDROID_PREFS_ROOT makes AGP abort with "several environment variables
       contain different paths to the Android Preferences folder". */
    ANDROID_USER_HOME: join(TC, 'android-home'),
    PATH: `${join(JDK_HOME, 'bin')}:${process.env.PATH}`
  };
  const g = gradleCmd();
  console.log(`\n${g.label} ${task}\n`);
  run(g.cmd, ['--no-daemon', '--console=plain', task], { cwd: APK, env });
}

function collect() {
  const outDir = join(APK, 'app', 'build', 'outputs', 'apk');
  const found = [];
  (function walk(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.apk')) found.push(full);
    }
  })(outDir);

  if (!found.length) throw new Error('Gradle finished but produced no APK under ' + outDir);

  mkdirSync(DIST, { recursive: true });
  const report = [];
  for (const src of found) {
    const variant = src.includes('release') ? 'release' : 'debug';
    const target = join(DIST, `virulenter-android-${variant}.apk`);
    copyFileSync(src, target);
    report.push({ variant, target, bytes: statSync(target).size });
  }
  return report;
}

/* ── main ──────────────────────────────────────────────── */
if (!SKIP_PROVISION) await provision();
if (PROVISION_ONLY) {
  console.log('\ntoolchain ready — re-run without --provision to build');
  process.exit(0);
}

syncAssets();
writeLocalProperties();
gradleBuild();

console.log('\nartifacts');
for (const r of collect()) {
  console.log(`  ${r.target.replace(ROOT + '/', '')}  ${(r.bytes / 1048576).toFixed(2)} MB  (${r.variant})`);
}
console.log('\ninstall with:  adb install -r dist/virulenter-android-debug.apk');
console.log('or copy the APK to the phone and open it (allow installs from this source).');
