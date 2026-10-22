#!/usr/bin/env node
/**
 * qr.mjs — makes a QR code PNG for a URL, used by tools/share-apk.mjs.
 *
 * Encodes with OpenCV when it is available (heads-up: OpenCV picks
 * alphanumeric mode for text it can, which is why this leans on a proven
 * implementation rather than a hand-rolled one). The PNG is written once and
 * cached next to the toolchain.
 *
 * Returns null when no encoder is available — callers degrade to printing the
 * URL instead, so nothing here is load-bearing.
 *
 *   node tools/qr.mjs "http://192.168.1.24:8080/virulenter-release.apk"
 *   → prints the path to the generated PNG, or nothing on failure
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.toolchain', 'qr-cache');
const PYLIBS = join(ROOT, '.toolchain', 'pylibs');

const PY_SOURCE = `
import sys
try:
    import cv2, numpy as np
except Exception:
    sys.exit(3)
url, out = sys.argv[1], sys.argv[2]
enc = cv2.QRCodeEncoder_create()
m = enc.encode(url)                 # uint8, 0 = dark, includes a quiet zone
if m is None:
    sys.exit(4)
scale = 8
img = cv2.resize(m, None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST)
img = cv2.copyMakeBorder(img, 24, 24, 24, 24, cv2.BORDER_CONSTANT, value=255)
if not cv2.imwrite(out, img):
    sys.exit(5)
print(out)
`;

/**
 * Returns the path to a QR PNG for `url`, generating it if needed.
 * null when no working encoder is present.
 */
export function qrPng(url) {
  mkdirSync(CACHE, { recursive: true });
  const name = createHash('sha256').update(url).digest('hex').slice(0, 16) + '.png';
  const out = join(CACHE, name);
  if (existsSync(out)) return out;

  const attempts = [];
  /* explicit interpreter, then whatever python3 is on PATH; with and without
     the workspace-local OpenCV install */
  if (existsSync(join(PYLIBS, 'cv2'))) {
    attempts.push({ cmd: 'python3', env: { PYTHONPATH: PYLIBS } });
  }
  attempts.push({ cmd: 'python3', env: {} });

  for (const a of attempts) {
    const res = spawnSync(a.cmd, ['-c', PY_SOURCE, url, out], {
      encoding: 'utf8',
      env: { ...process.env, ...a.env }
    });
    if (res.status === 0 && existsSync(out)) return out;
  }
  return null;
}

/* CLI form, used by the share server. */
if (process.argv[1] && process.argv[1].endsWith('qr.mjs')) {
  const url = process.argv[2];
  if (!url) {
    console.error('usage: node tools/qr.mjs <url>');
    process.exit(2);
  }
  const png = qrPng(url);
  if (png) console.log(png);
  else process.exit(1);
}
