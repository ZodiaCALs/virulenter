#!/usr/bin/env node
/**
 * build.mjs — produces virulenter.html, a single self-contained file.
 *
 * The modular source uses plain <script> tags (not ES modules), so inlining
 * changes nothing semantically and the bundle keeps working over file://.
 * Comments and indentation are stripped (tools/minify.mjs); --pretty keeps
 * the source as written.
 *
 *   node build.mjs [--pretty]
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minifyJs, minifyCss, minifyHtml } from './tools/minify.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));   // build.mjs lives at the project root
const OUT = join(ROOT, 'dist', 'virulenter.html');
const MIN = !process.argv.includes('--pretty');

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const CSS_FILES = ['app/css/base.css', 'app/css/views.css', 'app/css/stats.css'];
const JS_FILES = ['app/js/core.js', 'app/js/codec.js', 'app/js/store.js', 'app/js/ui.js',
                  'app/js/views.js', 'app/js/charts.js', 'app/js/stats.js', 'app/js/app.js'];

const css = CSS_FILES.map(read).join('\n');
const js = JS_FILES.map((f) => '/* ==== ' + f + ' ==== */\n' + read(f)).join('\n;\n');

let html = MIN ? minifyHtml(read('app/index.html')) : read('app/index.html');

for (const [label, text] of [['css', css], ['js', js]]) {
  if (/<\/script/i.test(text)) throw new Error(label + ' contains a literal </script sequence; refusing to inline');
}

const linkRe = /\s*<link rel="stylesheet" href="css\/[^"]+">/g;
const linkCount = (html.match(linkRe) || []).length;
if (linkCount !== CSS_FILES.length) {
  throw new Error(`expected ${CSS_FILES.length} stylesheet links, found ${linkCount}`);
}
html = html.replace(linkRe, '');
html = html.replace('</head>', '<style>\n' + (MIN ? minifyCss(css).trim() : css) + '\n</style>\n</head>');

const scriptRe = /\s*<script src="js\/[^"]+"><\/script>/g;
const scriptCount = (html.match(scriptRe) || []).length;
if (scriptCount !== JS_FILES.length) {
  throw new Error(`expected ${JS_FILES.length} script tags, found ${scriptCount}`);
}
html = html.replace(scriptRe, '');
html = html.replace('</body>', '<script type="module">\n' + (MIN ? minifyJs(js).trim() : js) + '\n</script>\n</body>');

/* The single file cannot reference the manifest or register a worker over
   file://, so drop the PWA wiring — but keep a favicon by embedding the mark
   itself as a data URI, so a shared copy is not a faceless tab. */
const faviconSvg = read('app/icons/favicon.svg').trim();
const faviconUri = 'data:image/svg+xml;base64,' + Buffer.from(faviconSvg, 'utf8').toString('base64');

html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
html = html.replace(/\s*<link rel="icon"[^>]*>/, '');
html = html.replace(/\s*<link rel="alternate icon"[^>]*>/, '');
html = html.replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '');
html = html.replace('</head>', '<link rel="icon" href="' + faviconUri + '" type="image/svg+xml">\n</head>');
html = html.replace('<title>Virulenter</title>',
  '<title>Virulenter</title>\n<!-- Single-file build of tools/build.mjs. Source: app/ -->');

if (/<\/script/i.test(html.slice(html.indexOf('<script type="module">') + 22, html.lastIndexOf('</script>')))) {
  throw new Error('the inlined script contains a literal </script sequence');
}
writeFileSync(OUT, html, 'utf8');
const kb = (statSync(OUT).size / 1024).toFixed(1);
console.log(`built ${OUT}`);
console.log(`  ${kb} KB · ${CSS_FILES.length} css + ${JS_FILES.length} js files inlined${MIN ? ' · minified' : ''}`);
