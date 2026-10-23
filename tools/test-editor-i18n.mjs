#!/usr/bin/env node
/**
 * test-editor-i18n.mjs — checks the level editor's language pack (src/editor/strings/,
 * src/editor/i18n.js, src/editor/catalogI18n.js). Node only, no browser.
 *
 *  - every English key has a Chinese entry and every Chinese key an English one;
 *  - an entry's `{var}` slots are the same in both languages (a `{ one, other }` entry: per form);
 *  - every literal key the editor reads (`tr('…')`, `trn('…')`) exists in English;
 *  - every catalog display text and bare option value (catalogSources) has a Chinese entry, and
 *    no Chinese catalog entry names a text the catalog no longer has;
 *  - Chinese entries carry no ASCII sentence punctuation after CJK characters (，。：；？！ instead).
 *
 * Usage: node tools/test-editor-i18n.mjs [--verbose]     (npm run editor:i18n:test)
 * Exit code 0 when everything holds, 1 otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const toUrl = (p) => new URL(`file:///${path.join(ROOT, p).replace(/\\/g, '/')}`).href;

const { default: table } = await import(toUrl('src/editor/strings/index.js'));
const { catalogSources } = await import(toUrl('src/editor/catalogI18n.js'));
const { default: catalog } = await import(toUrl('src/editor/strings/catalog.js'));

const problems = [];
const warn = [];
const fail = (msg) => problems.push(msg);

// ------------------------------------------------------------------------------ key parity
const en = table.en, zh = table.zh;
for (const k of Object.keys(en)) if (!Object.prototype.hasOwnProperty.call(zh, k)) fail(`missing Chinese: ${k}`);
for (const k of Object.keys(zh)) if (!Object.prototype.hasOwnProperty.call(en, k)) fail(`Chinese key without English: ${k}`);

// ------------------------------------------------------------------------------ slots
const slots = (s) => new Set([...String(s).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]));
/** The strings of an entry (a string, the forms of a counted entry; functions are skipped). */
const forms = (e) => (typeof e === 'string' ? [e] : e && typeof e === 'object' ? Object.values(e).filter((x) => typeof x === 'string') : []);
const union = (list) => { const s = new Set(); for (const x of list) for (const v of slots(x)) s.add(v); return s; };
for (const k of Object.keys(en)) {
  if (!Object.prototype.hasOwnProperty.call(zh, k)) continue;
  if (typeof en[k] === 'function' || typeof zh[k] === 'function') continue;
  const a = union(forms(en[k])), b = union(forms(zh[k]));
  const onlyEn = [...a].filter((v) => !b.has(v)), onlyZh = [...b].filter((v) => !a.has(v));
  // `{n}` may be dropped where the Chinese wording does not repeat the count
  if (onlyZh.length) fail(`${k}: Chinese uses {${onlyZh.join('}, {')}} that English does not`);
  const lost = onlyEn.filter((v) => v !== 'n');
  if (lost.length) fail(`${k}: Chinese drops {${lost.join('}, {')}}`);
}

// ------------------------------------------------------------------------------ punctuation
const CJK = /[\u3400-\u9fff]/;
for (const [k, e] of Object.entries(zh)) {
  for (const s of forms(e)) {
    // ASCII , . : ; ? ! right after a CJK character (not inside {slots}, numbers or code)
    const bad = s.replace(/\{[^}]*\}/g, '').match(/[\u3400-\u9fff][,.:;?!](?=\s|$|[\u3400-\u9fff])/);
    if (bad) fail(`${k}: ASCII punctuation after Chinese text ("${bad[0]}") — use full-width`);
    if (CJK.test(s) && /\.\.\./.test(s)) fail(`${k}: "..." in Chinese — use …`);
  }
}

// ------------------------------------------------------------------------------ keys the code reads
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (ent.name !== 'strings') walk(p, out); }
    else if (/\.js$/.test(ent.name)) out.push(p);
  }
  return out;
}
const used = new Set();
for (const file of walk(path.join(ROOT, 'src/editor'))) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\btrn?\(\s*(['"])([A-Za-z0-9_.\-]+)\1/g)) {
    used.add(m[2]);
    if (!Object.prototype.hasOwnProperty.call(en, m[2])) fail(`${path.relative(ROOT, file).replace(/\\/g, '/')}: unknown key '${m[2]}'`);
  }
}
const unused = Object.keys(en).filter((k) => !used.has(k));
if (unused.length) warn.push(`${unused.length} key(s) not read by a literal tr()/trn() (fine when built from a template):\n    ${unused.slice(0, VERBOSE ? unused.length : 15).join('\n    ')}${!VERBOSE && unused.length > 15 ? '\n    …' : ''}`);

// ------------------------------------------------------------------------------ catalog coverage
const src = catalogSources();
const zt = catalog.zh?.text ?? {}, zv = catalog.zh?.values ?? {};
for (const s of src.text) if (!Object.prototype.hasOwnProperty.call(zt, s)) fail(`catalog text not translated: ${JSON.stringify(s)}`);
for (const v of src.values) if (!Object.prototype.hasOwnProperty.call(zv, v)) fail(`catalog option value not translated: ${JSON.stringify(v)}`);
for (const s of Object.keys(zt)) if (!src.text.has(s)) fail(`stale catalog entry (no such English text): ${JSON.stringify(s)}`);
for (const v of Object.keys(zv)) if (!src.values.has(v)) fail(`stale catalog value (no such option): ${JSON.stringify(v)}`);

// ------------------------------------------------------------------------------ report
for (const w of warn) console.log(`note: ${w}`);
for (const p of problems.slice(0, VERBOSE ? problems.length : 60)) console.log(`✗ ${p}`);
if (!VERBOSE && problems.length > 60) console.log(`… and ${problems.length - 60} more (--verbose)`);
const summary = `${Object.keys(en).length} UI keys, ${used.size} read literally; catalog ${src.text.size} texts + ${src.values.size} values`;
console.log(problems.length ? `\n✗ ${problems.length} problem(s) — ${summary}` : `✓ editor language pack complete — ${summary}`);
process.exit(problems.length ? 1 : 0);
