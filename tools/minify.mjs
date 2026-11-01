/**
 * minify.mjs — strips comments and indentation from the app's own HTML, CSS
 * and JavaScript, for the single-file build (build.mjs) and the Android
 * assets (tools/sync-android.mjs). No dependencies.
 *
 * Deliberately conservative: names are never shortened and line breaks are
 * kept (so automatic semicolon insertion sees exactly what it saw before);
 * what goes is comments, indentation and the spaces no token needs.
 * Strings, regular expressions and template literals pass through verbatim.
 */

const WORD = /[A-Za-z0-9_$\u0080-￿\\]/;
/* after these keywords a slash starts a regular expression, not a division */
const REGEX_AFTER = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await']);
const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '<<', '>>', '**'];

/* the index just past a quoted string starting at i */
function endOfString(src, i) {
  const q = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === q) return j + 1;
    if (src[j] === '\n' && q !== '`') throw new Error('unterminated string at ' + i);
  }
  throw new Error('unterminated string at ' + i);
}

/* the index just past a template literal starting at i, ${…} included */
function endOfTemplate(src, i) {
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') { j++; continue; }
    if (c === '`') return j + 1;
    if (c === '$' && src[j + 1] === '{') {
      let depth = 1;
      j += 2;
      while (depth && j < src.length) {
        const d = src[j];
        if (d === '"' || d === "'") { j = endOfString(src, j); continue; }
        if (d === '`') { j = endOfTemplate(src, j); continue; }
        if (d === '{') depth++;
        else if (d === '}') depth--;
        j++;
      }
      j--;
    }
  }
  throw new Error('unterminated template at ' + i);
}

/* the index just past a regular expression literal starting at i */
function endOfRegex(src, i) {
  let inClass = false;
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') { j++; continue; }
    if (c === '\n') throw new Error('unterminated regex at ' + i);
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') inClass = true;
    else if (c === '/') {
      let k = j + 1;
      while (k < src.length && /[a-z]/i.test(src[k])) k++;   // flags
      return k;
    }
  }
  throw new Error('unterminated regex at ' + i);
}

export function minifyJs(src) {
  const toks = [];          // { t: text, k: kind, ws: '' | ' ' | '\n' } — ws is what preceded it
  let ws = '';
  let i = 0;
  const prev = () => toks[toks.length - 1];
  const slashIsRegex = () => {
    const p = prev();
    if (!p) return true;
    if (p.k === 'word') return REGEX_AFTER.has(p.t);
    if (p.k === 'punct') return !/^[)\]}]$/.test(p.t) && p.t !== '++' && p.t !== '--';
    return false;           // after a string, number, regex or template
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { ws = '\n'; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ' || c === '﻿') {
      if (!ws) ws = ' ';
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {                 // line comment
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {                 // block comment
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('unterminated comment at ' + i);
      if (src.slice(i, end).includes('\n')) ws = '\n';
      else if (!ws) ws = ' ';
      i = end + 2;
      continue;
    }
    let j, k;
    if (c === '"' || c === "'") { j = endOfString(src, i); k = 'str'; }
    else if (c === '`') { j = endOfTemplate(src, i); k = 'tpl'; }
    else if (c === '/' && slashIsRegex()) { j = endOfRegex(src, i); k = 'regex'; }
    else if (WORD.test(c)) {
      j = i + 1;
      while (j < src.length && WORD.test(src[j])) j++;
      k = 'word';
    } else {
      const p = PUNCT.find((op) => src.startsWith(op, i));
      j = i + (p ? p.length : 1);
      k = 'punct';
    }
    toks.push({ t: src.slice(i, j), k, ws });
    ws = '';
    i = j;
  }

  let out = '';
  let last = null;
  for (const tok of toks) {
    if (last && tok.ws) {
      if (tok.ws === '\n') out += '\n';
      else if (needsSpace(last, tok)) out += ' ';
    }
    out += tok.t;
    last = tok;
  }
  return out + '\n';
}

/* would these two tokens, written together, read as something else? */
function needsSpace(a, b) {
  const x = a.t[a.t.length - 1], y = b.t[0];
  if (WORD.test(x) && WORD.test(y)) return true;
  if ((x === '+' || x === '-') && y === x) return true;              // a - -b, a + ++b
  if (x === '/' && (y === '/' || y === '*')) return true;            // a / /re/
  if (x === '<' && y === '!') return true;                            // <!-- in a script
  if (x === '<' && y === '/') return true;                            // </script in a script
  if (x === '-' && y === '>') return true;                            // -->
  if (a.k === 'word' && /^\d/.test(a.t) && y === '.') return true;   // 1 .toString()
  if (a.k === 'regex' && WORD.test(y)) return true;                  // /re/ in x
  return false;
}

export function minifyCss(src) {
  let out = '';
  let i = 0;
  let space = false;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('unterminated comment at ' + i);
      i = end + 2;
      space = true;
      continue;
    }
    if (/\s/.test(c)) { space = true; i++; continue; }
    if (c === '"' || c === "'") {
      const j = endOfString(src, i);
      if (space && out && !/[{};,>(]$/.test(out)) out += ' ';
      out += src.slice(i, j);
      space = false;
      i = j;
      continue;
    }
    if (space && out && !/[{};,>]$/.test(out) && !/[{};,>]/.test(c)) out += ' ';
    space = false;
    if (c === '}' && out.endsWith(';')) out = out.slice(0, -1);
    out += c;
    i++;
  }
  return out + '\n';
}

/* HTML: comments go, and runs of whitespace that hold a line break become
   one line break (which renders exactly as the run did). <pre> and
   <textarea> keep their content; the page has no inline script or style. */
export function minifyHtml(src) {
  const keep = [];
  let s = src.replace(/<(pre|textarea|script|style)\b[\s\S]*?<\/\1>/gi, (m) => {
    keep.push(m);
    return '\u0000' + (keep.length - 1) + '\u0000';
  });
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/[ \t]*\n\s*/g, '\n');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => keep[+n]);
  return s.trim() + '\n';
}
