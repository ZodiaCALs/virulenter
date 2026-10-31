/**
 * chrome.mjs — finds a Chrome / Chromium binary for the headless tools.
 *
 * Checked in order, first hit wins:
 *   1. the CHROME environment variable
 *   2. the usual install locations on macOS, Linux and Windows
 *   3. a browser on PATH
 *
 *   CHROME=/path/to/chrome node tools/verify.mjs
 */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/opt/pw-browsers/chromium',
  '/snap/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

const ON_PATH = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];

export function findChrome() {
  if (process.env.CHROME) {
    if (existsSync(process.env.CHROME)) return process.env.CHROME;
    throw new Error(`CHROME is set to ${process.env.CHROME}, which does not exist`);
  }
  for (const path of CANDIDATES) if (existsSync(path)) return path;
  for (const name of ON_PATH) {
    try {
      const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', [name],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n')[0].trim();
      if (found) return found;
    } catch { /* not on PATH */ }
  }
  throw new Error('No Chrome or Chromium found. Install one, or point CHROME at the binary.');
}
