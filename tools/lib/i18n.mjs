/**
 * The content-text tables on disk (docs/specs/I18N.md §4), shared by `tools/check-i18n.mjs`,
 * `tools/i18n-worklist.mjs` and `tools/test-i18n.mjs`: where the tables and their sources are, the units and terms
 * each table's readers show (src/engine/i18n/ContentStrings.js), the table each entry lives in, the
 * markup rules, the table files' text (version 3: `terms`, and `units` by the text keys the data
 * holds) and the check of one language (`checkLanguage`, §4.7).
 *
 * Tables: `public/i18n/index.json` lists them per language; `public/i18n/<lang>/<id>.json`, `id` one
 * of `common`, `levels/<name>` (source `public/levels/<name>.json`) and `campaigns/<name>` (source
 * `public/campaigns/<name>/`: campaign.json, every level file with its chapter variants, and the
 * story files). `common`'s sources are the code: every `loc('<code key>', '<English>')` call under
 * `src/game/` and `src/engine/` (`scanLocCalls`), and the common terms: the shipped levels' names
 * (`SHIPPED_LEVELS`, read from src/game/levels.js of the tree checked) and `COMMON_TERMS`.
 *
 * Keys (I18N.md §4.2): a unit's key is the one the data holds beside its text — a GUID in
 * `textKeys`, a script line's `#line:` tag, a story item's or quest's built `textKey` — made when the
 * text is made and kept through every edit (src/engine/i18n/TextKeys.js), so nothing moves when a
 * page is inserted or a line reordered: a unit is in use while a reader shows its key with its
 * English, **changed** when a reader shows its key with other English (the same key, another
 * source: the line was edited), an **orphan** when no reader shows its key (the text was deleted).
 * A text the data holds no key for (`keylessUnits`) stays English: `npm run i18n:keys -- --assign`
 * gives it one.
 *
 * Where an entry lives (I18N.md §4.1, `entryHomes`): a unit in the table of the file that holds its
 * text, unless a table it extends has the same key with the same English (then only there); a term
 * in the extended (base) table — the one looked up last before `common` — when the sources of both
 * show it, else in the table whose sources show it; never in another table when `common` holds it.
 * The same name in tables that do not extend one another is a term in each. One key with two
 * Englishes among one table's own sources is an error (`keyConflicts`); a campaign's copy of a
 * shipped level may diverge from it (the campaign's table holds its own English at that key).
 *
 * Readers (`readersOf`): the code reads `common` (its units and the common terms); a table is read by
 * every listed table whose lookup chain holds it — itself, and a campaign by its `extends` — and
 * `common` by every listed table too (`classifyUnits`). A table whose own or readers' sources had
 * errors (a file that does not parse, a missing story file, src/game/levels.js that does not
 * import) is not rewritten by the tools without `--force=sources` (`TableReport.sourceErrors`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLevel } from '../../src/engine/level/LevelFormat.js';
import { normalizeCampaign, levelFile, levelVariants } from '../../src/game/campaign/CampaignFormat.js';
import { buildStory, storyFile } from '../../src/game/campaign/StoryFormat.js';
import { levelStrings, campaignStrings, scanLocCalls, commonTerms, keyConflicts } from '../../src/engine/i18n/ContentStrings.js';
import { isTextKey, isCodeKey } from '../../src/engine/i18n/ContentKeys.js';
import {
  parseContentTable, parseContentIndex, isTableId, CONTENT_FORMAT, CONTENT_INDEX_FORMAT, CONTENT_INDEX_VERSION, CONTENT_KINDS, CONTENT_VERSION,
} from '../../src/engine/i18n/ContentText.js';

/**
 * @import { ContentString } from '../../src/engine/i18n/ContentStrings.js'
 * @import { ContentTable } from '../../src/engine/i18n/ContentText.js'
 */

/** The repository root. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Folders scanned for loc('…') calls (the editor's own UI strings are checked by test-editor-i18n.mjs). */
export const CODE_DIRS = Object.freeze(['src/game', 'src/engine']);
/** …minus these (the i18n modules define loc and show it in their docs). */
export const CODE_SKIP = new Set(['src/engine/i18n']);
/** Characters per English character a translation takes (content survey §6). */
export const RATIOS = Object.freeze({ ja: 0.55, zh: 0.36 });
/**
 * Where the UI string tables are (`registerStrings` modules, I18N.md §2, PIXEL_UI.md §8): every
 * module of these folders (the core namespaces) and every `strings.js` under `UI_FEATURE_ROOT` (a
 * feature's namespaces: src/game/combat/strings.js …). The glossary cross-check imports them in
 * Node and reads their `{ en, ja, zh }` exports.
 */
export const UI_TABLE_DIRS = ['src/engine/i18n/strings'];
/** The folder whose `strings.js` files hold the features' UI string tables. */
export const UI_FEATURE_ROOT = 'src/game';
/** The feature namespaces PIXEL_UI.md §8 places: the checker notes the ones not written yet. */
export const UI_FEATURE_FILES = Object.freeze([
  'src/engine/i18n/strings/worldfx.js', 'src/engine/i18n/strings/story-ui.js', 'src/game/combat/strings.js',
  'src/game/party/strings.js', 'src/game/story/strings.js', 'src/game/campaign/strings.js',
]);
/** The reader of `common` that is no table: the code (its `loc('<code key>', …)` units, the common terms). */
export const CODE_READER = '(code)';
/**
 * `format` and `version` of a worklist file (`tools/i18n-worklist.mjs`): version 3, its units keyed
 * by the text keys the data holds.
 */
export const WORKLIST_FORMAT = 'luminati-i18n-worklist';
export const WORKLIST_VERSION = 3;
/** The PO header fields of a worklist: its table and its version. */
export const PO_TABLE_FIELD = 'X-Luminati-Table';
export const PO_VERSION_FIELD = 'X-Luminati-Worklist-Version';

/** Script fields whose text the story saves with its values filled in (StoryRunner `_quest` → StoryState). */
const SAVED_FILLED = /\.quest-(start|stage)$/;

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
/** A JSON file (a byte-order mark an editor wrote is no error: the browser's `json()` drops it too). */
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
/** A text clipped for a message. @param {string} s @param {number} [n] */
export const clip = (s, n = 60) => {
  const t = String(s).replace(/\n/g, '⏎');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
/** The rank of a table id in reports: common, the levels, the campaigns. @param {string} id */
const rank = (id) => (id === CODE_READER ? -1 : id === 'common' ? 0 : id.startsWith('levels/') ? 1 : 2);
/** Report order of table ids. @param {string} a @param {string} b */
export const tableOrder = (a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);

/** The folder of the tables (`public/i18n`) under `root`. */
export const i18nDir = (root = ROOT) => path.join(root, 'public', 'i18n');

/**
 * A reader for `loadContentTables({ read })`: a path under public/i18n → its parsed JSON, or null.
 * @param {string} [dir]
 */
export function nodeReader(dir = i18nDir()) {
  return (/** @type {string} */ p) => {
    const f = path.join(dir, ...p.split('/'));
    return fs.existsSync(f) ? readJSON(f) : null;
  };
}

/**
 * The index: language → listed table ids (parse warnings as `warnings`; a missing file: none, with
 * `missing`; a file that is no JSON: none, with `broken` and the parse error as a warning).
 * @param {string} [dir]
 * @returns {{ languages: Map<string, Set<string>>, warnings: string[], missing: boolean, broken: boolean, raw: any }}
 */
export function readIndex(dir = i18nDir()) {
  const f = path.join(dir, 'index.json');
  if (!fs.existsSync(f)) return { languages: new Map(), warnings: [], missing: true, broken: false, raw: null };
  let raw;
  try { raw = readJSON(f); } catch (e) {
    return { languages: new Map(), warnings: [`index: not valid JSON — ${e.message}`], missing: false, broken: true, raw: null };
  }
  return { ...parseContentIndex(raw), missing: false, broken: false, raw };
}

/** The file of table `id` for `lang`. */
export const tableFile = (lang, id, dir = i18nDir()) => path.join(dir, lang, ...`${id}.json`.split('/'));

/**
 * Read one table file (null when missing) with its raw JSON (the checker reads what the loader
 * drops). A file the loader does not read — no JSON, no object, not version 3 — comes back as an
 * empty table, `broken`, with why as its warning.
 * @param {string} lang
 * @param {string} id
 * @param {string} [dir]
 * @returns {{ table: ContentTable, warnings: string[], raw: any, broken: boolean, lang: string, id: string }|null}
 *   `lang` and `id`: where the file is filed (its own `lang` and `source` should say the same)
 */
export function readTable(lang, id, dir = i18nDir()) {
  const f = tableFile(lang, id, dir);
  if (!fs.existsSync(f)) return null;
  /** @type {ContentTable} */
  const empty = { id, lang, version: CONTENT_VERSION, extends: [], terms: new Map(), units: new Map() };
  let raw;
  try { raw = readJSON(f); } catch (e) {
    return { table: empty, warnings: [`${lang}/${id}: not a JSON object — ${e.message}`], raw: null, broken: true, lang, id };
  }
  const { table, warnings } = parseContentTable(raw, { id, lang });
  return { table: table ?? empty, warnings, raw, broken: !table, lang, id };
}

/**
 * Is a parse warning of a table file (`parseContentTable`, `readTable`) an error for the checker?
 * Every warning that drops an entry or the file (not version 3) or misnames it is; a newer version
 * is a warning (the loader reads what it knows).
 * @param {string} w
 */
export const parseIssueIsError = (w) => !/newer than this engine/.test(w);

/**
 * Why the tools refuse to rewrite a table file (`--merge`, `--prune` without `--force=table`): the
 * loader does not read it (no JSON, no object, not version 3: rewritten, it would lose what it
 * holds), it is filed under another language or table than its `lang` / `source` say (rewritten, it
 * would take the path's and keep the other language's text), or it is of a newer version. '' when it
 * can be rewritten.
 * @param {{ raw: any, broken: boolean, warnings: string[], lang?: string, id?: string }} r `lang`, `id`: where it is filed (`readTable`)
 */
export function rewriteRefusal(r) {
  if (r.broken) return `cannot be read (${r.warnings.join('; ')})`;
  if (r.lang && r.raw?.lang !== r.lang) return `says "lang": ${JSON.stringify(r.raw?.lang) ?? 'nothing'}, but it is filed under ${r.lang}/ (a table of another language?)`;
  if (r.id && r.raw?.source !== r.id) return `says "source": ${JSON.stringify(r.raw?.source) ?? 'nothing'}, but it is filed as ${r.id} (another table's file?)`;
  const v = r.raw?.version;
  if (Number.isInteger(v) && v > CONTENT_VERSION) return `is version ${v}, newer than these tools (${CONTENT_VERSION})`;
  return '';
}

/**
 * The order the tools write keys and terms in: code-unit order, except that runs of digits compare
 * as numbers (`npc_2` before `npc_10`, `[2]` before `[10]`); equal numbers written differently
 * (`01`, `1`) fall back to code-unit order, so the order is total. (GUIDs are 32 upper-case hex
 * digits: they sort as their digit runs say, the same order on every machine.)
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function keyCompare(a, b) {
  if (a === b) return 0;
  const pa = a.match(/\d+|\D+/g) ?? [];
  const pb = b.match(/\d+|\D+/g) ?? [];
  const n = Math.min(pa.length, pb.length);
  for (let k = 0; k < n; k++) {
    const x = pa[k];
    const y = pb[k];
    if (x === y) continue;
    const dx = x.charCodeAt(0) >= 48 && x.charCodeAt(0) <= 57;
    const dy = y.charCodeAt(0) >= 48 && y.charCodeAt(0) <= 57;
    if (dx && dy) {
      const sx = x.replace(/^0+(?=\d)/, '');
      const sy = y.replace(/^0+(?=\d)/, '');
      if (sx.length !== sy.length) return sx.length - sy.length;
      if (sx !== sy) return sx < sy ? -1 : 1;
      continue;
    }
    // (a digit run against text, or two texts: the first differing code unit decides)
    return x < y ? -1 : 1;
  }
  if (pa.length !== pb.length) return pa.length - pb.length;
  return a < b ? -1 : 1;
}

/**
 * The text of a table file (version 3, `CONTENT_VERSION`): the fields in a fixed order — format,
 * version, lang, source, extends, terms, units —, terms and keys sorted (`keyCompare`), each unit
 * `{ source, target, note? }`, two-space indent, LF, a final newline. Empty sections stay
 * (`"terms": {}`): an untranslated entry is absent, never "".
 * @param {{ lang: string, id: string, extends?: string[], terms?: Map<string, string>|Record<string, string>,
 *   units?: Map<string, { source: string, target: string, note?: string }>|Record<string, { source: string, target: string, note?: string }> }} t
 */
export function serializeTable(t) {
  const sorted = (m, fn) => {
    const entries = m instanceof Map ? [...m] : Object.entries(m ?? {});
    entries.sort((a, b) => keyCompare(a[0], b[0]));
    const o = Object.create(null);
    for (const [k, v] of entries) o[k] = fn(v);
    return o;
  };
  const out = {
    format: CONTENT_FORMAT, version: CONTENT_VERSION, lang: t.lang, source: t.id, extends: t.extends ?? [],
    terms: sorted(t.terms, (v) => v),
    units: sorted(t.units, (u) => ({ source: u.source, target: u.target, ...(typeof u.note === 'string' && u.note ? { note: u.note } : {}) })),
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

/**
 * The text of index.json: languages in code order, their tables common first, then levels, then
 * campaigns, each sorted.
 * @param {Map<string, Set<string>>|Record<string, string[]>} languages
 */
export function serializeIndex(languages) {
  /** @type {[string, string[]][]} */
  const entries = languages instanceof Map ? [...languages].map(([l, s]) => /** @type {[string, string[]]} */ ([l, [...s]])) : Object.entries(languages);
  const langs = Object.create(null);
  for (const [l, ids] of entries.sort((a, b) => (a[0] < b[0] ? -1 : 1))) langs[l] = { tables: [...new Set(ids)].sort(tableOrder) };
  return `${JSON.stringify({ format: CONTENT_INDEX_FORMAT, version: CONTENT_INDEX_VERSION, languages: langs }, null, 2)}\n`;
}

// =================================================================================================
// Sources
// =================================================================================================

/**
 * The source of table `id`: where its English lives (a level file, a campaign folder, the code).
 * @param {string} id
 * @param {string} [root]
 */
export function sourcePath(id, root = ROOT) {
  if (id === 'common') return path.join(root, 'src');
  const [kind, name] = id.split('/');
  return kind === 'levels' ? path.join(root, 'public', 'levels', `${name}.json`) : path.join(root, 'public', 'campaigns', name);
}

/** Every .js file under a folder (sorted, forward slashes relative to the root). */
function jsFiles(dir, root) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name);
      const r = path.relative(root, p).split(path.sep).join('/');
      if (e.isDirectory()) { if (!CODE_SKIP.has(r)) walk(p); } else if (e.name.endsWith('.js')) out.push(r);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/**
 * One key extracted with two different Englishes among one table's own sources is an error
 * (I18N.md §4.2, §4.7: one key, one English — a copy of a line edited apart, a tag pasted onto
 * another line), never a crash: the messages for a table's entries, each with both Englishes and
 * where they are. (A campaign's copy of a shipped level may differ from the level along `extends`:
 * those are two tables' sources.) Code keys: `dlg.x` written with two Englishes.
 * @param {ContentString[]} strings
 * @returns {string[]}
 */
function conflictErrors(strings) {
  return keyConflicts(strings).map((c) => `${c.key}: one key, ${c.texts.length} different Englishes — ${c.texts.map((t, k) => `"${clip(t, 50)}" (${c.where[k]})`).join(' and ')}`
    + `${isTextKey(c.key) && !isCodeKey(c.key) ? ' (npm run i18n:keys -- --fix gives the edited copy a key of its own)' : ''}`);
}

/**
 * The shipped levels of a tree (`SHIPPED_LEVELS` of src/game/levels.js under `root`), as the tools
 * have always read them: imported in Node. `error`: why they could not be read.
 * @param {string} [root]
 * @returns {Promise<{ levels: { value: string, label: string }[], error: string|null }>}
 */
export async function shippedLevels(root = ROOT) {
  try {
    const { SHIPPED_LEVELS } = await import(pathToFileURL(path.join(root, 'src', 'game', 'levels.js')).href);
    return { levels: Array.isArray(SHIPPED_LEVELS) ? SHIPPED_LEVELS : [], error: null };
  } catch (e) {
    return { levels: [], error: e.message };
  }
}

/**
 * The sources of `common`: the code's units (every `loc('<code key>', '<English>')` call under
 * `CODE_DIRS`, minus `CODE_SKIP`) and the common terms (the shipped levels' names, `COMMON_TERMS`);
 * `data`: `loc()` calls whose key is data (an info line).
 * @param {string} [root]
 */
export async function commonSources(root = ROOT) {
  /** @type {ContentString[]} */
  const strings = [];
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const info = [];
  let data = 0;
  for (const dir of CODE_DIRS) {
    for (const file of jsFiles(path.join(root, dir), root)) {
      const src = fs.readFileSync(path.join(root, file), 'utf8');
      if (src.includes('loc(')) {
        // (a key with two Englishes: one error per key, from conflictErrors below — in one file or in two)
        const r = scanLocCalls(src, file, { kinds: CONTENT_KINDS, conflicts: false });
        strings.push(...r.strings);
        for (const e of r.errors) errors.push(`${file}:${e.line}: ${e.msg}`);
        data += r.data;
      }
    }
  }
  // (one key with two Englishes, in one file or in two: one error per key)
  errors.push(...conflictErrors(strings));
  const shipped = await shippedLevels(root);
  if (shipped.error) errors.push(`src/game/levels.js: ${shipped.error}`);
  strings.push(...commonTerms(shipped.levels));
  if (data) info.push(`${data} loc() call(s) show data by its data key: their text comes from the level, campaign and story tables`);
  return { strings, errors, info };
}

/**
 * The units and terms one table's readers show: its entries (every occurrence; a unit whose text
 * the data holds no key for has `key: ''` — `keylessUnits`), errors (a source that cannot be read,
 * a key extracted with two Englishes; scripts that do not parse and a file's key problems — stray,
 * repeated — are left to `npm run level:check`) and info.
 * @param {string} id
 * @param {string} [root]
 * @returns {Promise<{ strings: ContentString[], errors: string[], info: string[] }>}
 */
export async function tableSources(id, root = ROOT) {
  if (!isTableId(id)) return { strings: [], errors: [`"${id}" is not a table id`], info: [] };
  if (id === 'common') return commonSources(root);
  const src = sourcePath(id, root);
  const shown = rel(src);
  if (id.startsWith('levels/')) {
    if (!fs.existsSync(src)) return { strings: [], errors: [`no source: ${shown} does not exist`], info: [] };
    try {
      const { level } = parseLevel(fs.readFileSync(src, 'utf8'));
      const strings = levelStrings(level, { file: `${id}.json` });
      return { strings, errors: conflictErrors(strings), info: [] };
    } catch (e) {
      return { strings: [], errors: [`${shown}: ${e.message}`], info: [] };
    }
  }
  const cfile = path.join(src, 'campaign.json');
  if (!fs.existsSync(cfile)) return { strings: [], errors: [`no source: ${rel(cfile)} does not exist`], info: [] };
  /** @type {string[]} */
  const errors = [];
  let raw;
  try { raw = readJSON(cfile); } catch (e) { return { strings: [], errors: [`${rel(cfile)}: ${e.message}`], info: [] }; }
  const { campaign, errors: cerr } = normalizeCampaign(raw);
  for (const e of cerr) errors.push(`${rel(cfile)}: ${e}`);
  const levels = [];
  for (const l of campaign.levels) {
    for (const v of levelVariants(campaign, l.id)) {
      const f = path.join(src, levelFile(v));
      if (!fs.existsSync(f)) { errors.push(`${rel(f)} does not exist`); continue; }
      try { levels.push({ id: v, file: `${id}/${levelFile(v)}`, level: parseLevel(fs.readFileSync(f, 'utf8')).level }); } catch (e) { errors.push(`${rel(f)}: ${e.message}`); }
    }
  }
  const files = [];
  for (const name of campaign.story) {
    const f = path.join(src, storyFile(name));
    if (fs.existsSync(f)) files.push({ name, text: fs.readFileSync(f, 'utf8') });
    else errors.push(`${rel(f)} does not exist`);
  }
  const story = files.length ? buildStory(files).story : null;
  const strings = campaignStrings(campaign, levels, story, { file: id });
  errors.push(...conflictErrors(strings));
  return { strings, errors, info: [] };
}

/**
 * The units of a list of entries by key (the first occurrence of each key) and the terms by name
 * (every occurrence). A unit with no key (`key: ''`: its text has none in the data) is in
 * `keyless` only.
 * @param {ContentString[]} strings
 */
export function entriesOf(strings) {
  /** @type {Map<string, ContentString>} */
  const units = new Map();
  /** @type {Map<string, ContentString[]>} */
  const terms = new Map();
  /** @type {Map<string, ContentString[]>} every occurrence of each key with its first English */
  const occ = new Map();
  /** @type {Map<string, Set<string>>} every English each key is shown with (two: a key conflict) */
  const texts = new Map();
  /** @type {ContentString[]} the units whose text has no key */
  const keyless = [];
  for (const e of strings) {
    if (e.term) {
      let l = terms.get(e.text);
      if (!l) terms.set(e.text, (l = []));
      l.push(e);
    } else if (e.key) {
      if (!units.has(e.key)) units.set(e.key, e);
      let l = occ.get(e.key);
      if (!l) occ.set(e.key, (l = []));
      if (l[0]?.text === undefined || l[0].text === e.text) l.push(e);
      let s = texts.get(e.key);
      if (!s) texts.set(e.key, (s = new Set()));
      s.add(e.text);
    } else keyless.push(e);
  }
  return { units, terms, occ, texts, keyless };
}

/**
 * @typedef {Awaited<ReturnType<typeof tableSources>> & ReturnType<typeof entriesOf>} TableSources
 *   a table's sources: every entry (`strings`), its units by key (`units`, the first occurrence;
 *   `occ`: every occurrence with that English; `texts`: every English per key), its terms by name
 *   (`terms`: every occurrence) and the units with no key (`keyless`)
 */

/**
 * The units whose text the data holds no key for, per table (I18N.md §4.2: a level from before
 * keys, a line typed into a file by hand): they stay English in every language until `npm run
 * i18n:keys -- --assign` gives them a key (the editor's Level › Assign text keys for a level of
 * one's own; a generator re-run for a generated file). Only tables with some.
 * @param {Map<string, { keyless?: ContentString[], strings: ContentString[] }>} sources
 * @returns {{ id: string, units: ContentString[] }[]}
 */
export function keylessUnits(sources) {
  /** @type {{ id: string, units: ContentString[] }[]} */
  const out = [];
  for (const [id, s] of [...sources].sort((a, b) => tableOrder(a[0], b[0]))) {
    const units = s.keyless ?? s.strings.filter((e) => !e.term && !e.key);
    if (units.length) out.push({ id, units });
  }
  return out;
}

/**
 * The messages for `keylessUnits` (`check-i18n` warnings): one per table, with how many, the first
 * places and what to run.
 * @param {ReturnType<typeof keylessUnits>} list
 * @param {number} [shown] how many places each message names
 * @returns {string[]}
 */
export function keylessWarnings(list, shown = 3) {
  return list.map(({ id, units }) => `${id}: ${units.length} unit text(s) with no key in the data — no key: they stay English in every language; run npm run i18n:keys -- --assign <file> `
    + `(the editor: Level › Assign text keys; a generated file: re-run its generator) — ${units.slice(0, shown).map((e) => `${e.where} "${clip(e.text, 40)}"`).join('; ')}${units.length > shown ? ` … (+${units.length - shown})` : ''}`);
}

/**
 * Sources of several tables (and `common`), each with its units by key and terms by name.
 * @param {string[]} ids
 * @param {string} [root]
 * @returns {Promise<Map<string, TableSources>>}
 */
export async function allSources(ids, root = ROOT) {
  /** @type {Map<string, TableSources>} */
  const out = new Map();
  for (const id of new Set(['common', ...ids])) {
    const s = await tableSources(id, root);
    out.set(id, { ...s, ...entriesOf(s.strings) });
  }
  return out;
}

/**
 * Problems of the English itself, whatever the language (`check-i18n` warnings): a quest text of a
 * script (`quest … start` / `stage`) with `${…}` values — the story saves it with the values filled
 * in, so the saved text is shown as it is, in English (I18N.md §4.5).
 * @param {Map<string, { strings: ContentString[] }>} sources
 * @returns {string[]}
 */
export function sourceWarnings(sources) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const s of sources.values()) {
    for (const e of s.strings) {
      if (!SAVED_FILLED.test(e.field)) continue;
      const v = markupOf(e.text).values;
      if (v.length) out.add(`${e.where}: the quest text "${clip(e.text, 50)}" holds ${v.join(' ')}: the story saves it filled in, so it is never translated — write it without values (I18N.md §4.5)`);
    }
  }
  return [...out];
}

/**
 * Every table's `extends` closure (itself first, depth-first in order, cycles cut), from the
 * table files' `extends`.
 * @param {Map<string, string[]>} ext table id → its extends
 */
export function extendsClosure(ext) {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const id of ext.keys()) {
    const seen = [];
    const walk = (t, depth) => {
      if (seen.includes(t) || depth > 4) return;
      seen.push(t);
      for (const e of ext.get(t) ?? []) walk(e, depth + 1);
    };
    walk(id, 0);
    out.set(id, seen.filter((t) => t !== 'common'));
  }
  return out;
}

/**
 * The entries each table holds (I18N.md §4.1, the module comment): table id → its units by key and
 * its terms by name (the first occurrence of each).
 * - A unit lives in the table whose sources hold its text, unless a table of its `extends` closure
 *   has the same key with the same English: then only there (the deepest such table holds it).
 * - A term lives in the deepest table of the reader's `extends` closure whose sources show it; a
 *   term `common` holds is never held by another table.
 * - `common` holds its own units and terms.
 * A key a table's sources hold with two Englishes keeps the first (`tableSources` reports it).
 * @param {Map<string, { strings: ContentString[] }>} sources table id → its sources (`allSources`)
 * @param {Map<string, string[]>} closure table → its extends closure (itself first, `extendsClosure`)
 * @returns {Map<string, { units: Map<string, ContentString>, terms: Map<string, ContentString> }>}
 */
export function entryHomes(sources, closure) {
  /** @type {Map<string, Map<string, string>>} table → key → its (first) English */
  const unitText = new Map();
  /** @type {Map<string, Set<string>>} table → the names its sources show */
  const termSet = new Map();
  for (const [id, s] of sources) {
    const u = new Map();
    const t = new Set();
    for (const e of s.strings) {
      if (e.term) t.add(e.text);
      else if (e.key && !u.has(e.key)) u.set(e.key, e.text);
    }
    unitText.set(id, u);
    termSet.set(id, t);
  }
  const common = termSet.get('common') ?? new Set();
  /** @type {Map<string, { units: Map<string, ContentString>, terms: Map<string, ContentString> }>} */
  const out = new Map();
  for (const [id, s] of sources) {
    // (the tables this one extends, deepest last; never common: it is no extends)
    const deeper = id === 'common' ? [] : (closure.get(id) ?? [id]).filter((t) => t !== id && t !== 'common' && sources.has(t));
    /** @type {Map<string, ContentString>} */
    const units = new Map();
    /** @type {Map<string, ContentString>} */
    const terms = new Map();
    for (const e of s.strings) {
      if (e.term) {
        if (terms.has(e.text)) continue;
        if (id !== 'common' && common.has(e.text)) continue;
        if (deeper.some((t) => termSet.get(t)?.has(e.text))) continue;
        terms.set(e.text, e);
      } else if (e.key) {
        if (units.has(e.key) || unitText.get(id)?.get(e.key) !== e.text) continue;
        if (deeper.some((t) => unitText.get(t)?.get(e.key) === e.text)) continue;
        units.set(e.key, e);
      }
    }
    out.set(id, { units, terms });
  }
  return out;
}

// =================================================================================================
// Markup
// =================================================================================================

/** A key hint inside a gold span: one key's name (`{T}`, `{~}`, `{Space}`) or a code slot (`{${attack}}`). */
const KEY_HINT = /^(?:[A-Z0-9~`!@#%^&*\-+=[\];',./\\|<>?]|Space|Esc|Enter|Tab|Shift|Ctrl|Alt|Backspace|F\d{1,2}|[←→↑↓]|LT|RT|LB|RB|LS|RS|\$\{[A-Za-z0-9_]+\})$/;
/** Arrow glyphs kept as written (signs). */
const ARROWS = /[←↑→↓↖↗↘↙⇐⇑⇒⇓➜➔▲▼◀▶]/g;

/**
 * The spans of a text (I18N.md §4.4): each `{…}` gold span's inside (`gold`, trimmed; a key hint
 * among them in `keys` too) and each `${…}` story value (`values`), in order, and whether the braces
 * balance. `\${x}` (an odd run of backslashes) is no value.
 * @param {string} s
 */
function spansOf(s) {
  /** @type {string[]} */
  const values = [];
  /** @type {string[]} */
  const gold = [];
  /** @type {string[]} */
  const keys = [];
  let balanced = true;
  /** @type {{ at: number, value: boolean }[]} */
  const stack = [];
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '{') {
      // `${` is a value unless an odd run of backslashes makes its `$` plain (`\${x}`, as interpolate reads it)
      let b = 0;
      if (s[k - 1] === '$') while (s[k - 2 - b] === '\\') b++;
      stack.push({ at: k, value: s[k - 1] === '$' && b % 2 === 0 });
    } else if (c === '}') {
      const open = stack.pop();
      if (!open) { balanced = false; continue; }
      const inner = s.slice(open.at + 1, k);
      if (open.value) values.push(`\${${inner.replace(/\s+/g, '')}}`);
      else {
        gold.push(inner.trim());
        if (KEY_HINT.test(inner.trim())) keys.push(inner.trim());
      }
    }
  }
  if (stack.length) balanced = false;
  return { values, gold, keys, balanced };
}

/**
 * What a text holds of the markup (I18N.md §4.4): story values `${…}`, gold spans `{…}`, the key
 * hints among them, line breaks and arrows, and whether its braces balance.
 * @param {string} s
 */
export function markupOf(s) {
  const sp = spansOf(s);
  return {
    values: sp.values.sort(),
    keys: sp.keys.sort(),
    gold: sp.gold.length,
    balanced: sp.balanced,
    newlines: (s.match(/\n/g) ?? []).length,
    arrows: (s.match(ARROWS) ?? []).sort(),
  };
}

/**
 * The words inside a text's gold `{…}` spans, in order — not the key hints (`{T}`), not the spans
 * holding a code slot or a story value (`{${attack}}`).
 * @param {string} s
 * @returns {string[]}
 */
export function goldSpans(s) {
  return spansOf(s).gold.filter((g) => g && !KEY_HINT.test(g) && !g.includes('${'));
}

const sameList = (a, b) => a.length === b.length && a.every((x, k) => x === b[k]);
/** The distinct entries of a sorted list. */
const distinct = (a) => a.filter((x, k) => k === 0 || x !== a[k - 1]);

/**
 * The problems of one translation against its English: errors break the text in the game, warnings
 * are probably mistakes, info is fine but worth a look.
 * @param {string} en
 * @param {unknown} tr
 * @param {{ name?: boolean }} [o] `name`: the English is a name, a term (an identical value is info)
 */
export function markupIssues(en, tr, o = {}) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const info = [];
  if (typeof tr !== 'string') { errors.push('the translation is not a string'); return { errors, warnings, info }; }
  if (!tr.trim()) { errors.push('an empty translation (leave the English out instead)'); return { errors, warnings, info }; }
  const a = markupOf(en);
  const b = markupOf(tr);
  // (the same set: a value may be repeated, or said once where the English repeats it)
  const va = distinct(a.values);
  const vb = distinct(b.values);
  if (!sameList(va, vb)) errors.push(`story values differ: ${va.join(' ') || 'none'} → ${vb.join(' ') || 'none'}`);
  if (a.balanced && !b.balanced) errors.push('unbalanced braces { }');
  const missingKeys = a.keys.filter((k) => !b.keys.includes(k));
  if (missingKeys.length) warnings.push(`key hints missing: ${missingKeys.map((k) => `{${k}}`).join(' ')}`);
  if (a.gold !== b.gold) warnings.push(`gold spans: ${a.gold} in English, ${b.gold} here`);
  if (a.newlines !== b.newlines) warnings.push(`line breaks: ${a.newlines} in English, ${b.newlines} here`);
  if (!sameList(a.arrows, b.arrows)) warnings.push(`arrows differ: ${a.arrows.join('') || 'none'} → ${b.arrows.join('') || 'none'}`);
  if (tr === en) (o.name ? info : warnings).push('the same as the English');
  return { errors, warnings, info };
}

/**
 * Text as a translator's file may give it back: line ends LF (`\r\n`, `\r` → `\n`).
 * @param {string} s
 */
export const lf = (s) => s.replace(/\r\n?/g, '\n');

/**
 * Do two Englishes say the same (a worklist's against the extractor's): trimmed, LF, NFC — a CAT tool
 * may hand an English back normalised. The tools then write the extractor's own text.
 * @param {string} a
 * @param {string} b
 */
export const sameEnglish = (a, b) => typeof a === 'string' && typeof b === 'string' && lf(a).trim().normalize('NFC') === lf(b).trim().normalize('NFC');

// =================================================================================================
// UI glossary (names in both the UI and the content)
// =================================================================================================

/**
 * The UI string table modules under `root` (forward slashes, sorted): every module of
 * `UI_TABLE_DIRS` and every `strings.js` under `UI_FEATURE_ROOT`.
 * @param {string} root
 */
export function uiTableFiles(root = ROOT) {
  const out = [];
  for (const dir of UI_TABLE_DIRS) out.push(...jsFiles(path.join(root, dir), root));
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'strings.js') out.push(path.relative(root, p).split(path.sep).join('/'));
    }
  };
  walk(path.join(root, UI_FEATURE_ROOT));
  return [...new Set(out)].sort();
}

/**
 * The UI string tables' English → translations (I18N.md §3: a name the UI and the content both show
 * must be translated alike). Every module of `uiTableFiles` is imported, and each export shaped
 * `{ en: { key: 'English' }, ja?: {…}, zh?: {…} }` (a `registerStrings` table, default or named)
 * contributes its string entries; a module that cannot be imported in Node is skipped with a note,
 * and `missing` lists the feature namespaces of `UI_FEATURE_FILES` not written yet.
 * @param {string} [root]
 * @returns {Promise<{ names: Map<string, Map<string, string>>, modules: string[], notes: string[], missing: string[] }>}
 */
export async function uiGlossary(root = ROOT) {
  /** @type {Map<string, Map<string, string>>} English → lang → translation */
  const names = new Map();
  const modules = [];
  const notes = [];
  for (const file of uiTableFiles(root)) {
    let mod;
    try { mod = await import(pathToFileURL(path.join(root, file)).href); } catch (e) { notes.push(`${file}: not importable in Node (${e.message.split('\n')[0]}) — skipped`); continue; }
    modules.push(file);
    for (const v of Object.values(mod)) {
      if (!v || typeof v !== 'object' || !v.en || typeof v.en !== 'object') continue;
      for (const [key, en] of Object.entries(v.en)) {
        if (typeof en !== 'string' || !en.trim()) continue;
        let m = names.get(en);
        if (!m) names.set(en, (m = new Map()));
        for (const lang of Object.keys(v)) {
          if (lang === 'en') continue;
          const tr = v[lang]?.[key];
          if (typeof tr === 'string' && !m.has(lang)) m.set(lang, tr);
        }
      }
    }
  }
  const missing = UI_FEATURE_FILES.filter((f) => !fs.existsSync(path.join(root, f)));
  return { names, modules, notes, missing };
}

// =================================================================================================
// Lookup: what each reader's chain translates (the runtime's loc / term, table by table)
// =================================================================================================

/**
 * The lookup chain of a table for one language, as the game's loader builds it: the table, the
 * tables it extends (the listed ones, depth first), then `common` (when listed). The code reads
 * `common` alone.
 * @param {string} id a table id, or `CODE_READER`
 * @param {Set<string>} listed
 * @param {Map<string, string[]>} closure
 */
export function lookupChain(id, listed, closure) {
  if (id === 'common' || id === CODE_READER) return listed.has('common') ? ['common'] : [];
  return [...(closure.get(id) ?? [id]).filter((t) => listed.has(t)), ...(listed.has('common') ? ['common'] : [])];
}

/**
 * The readers of table `id` for one language: `common` is read by the code (`CODE_READER`) and every
 * listed table; another table by each listed table whose `extends` closure holds it (itself among
 * them).
 * @param {string} id
 * @param {Set<string>} listed
 * @param {Map<string, string[]>} closure
 * @returns {string[]}
 */
export function readersOf(id, listed, closure) {
  const tables = [...listed].filter((t) => t !== 'common').sort(tableOrder);
  if (id === 'common') return [CODE_READER, ...tables];
  return tables.filter((t) => (closure.get(t) ?? [t]).includes(id));
}

/**
 * What `loc(key, text)` (ContentText.js) finds along a chain of tables, table by table:
 * - `exact`: the unit with `key` whose recorded source is `text`;
 * - `stale`: else nothing, and a table has `key` with other English (`table`: the first) — the
 *   line was edited and needs review;
 * - `missing`: else nothing — no table holds `key` (the runtime shows the English).
 * @param {ContentTable[]} chain
 * @param {string} key
 * @param {string} text the English shown, trimmed
 * @returns {{ how: 'exact'|'stale'|'missing', table?: string, target?: string }}
 */
export function lookupUnit(chain, key, text) {
  let stale = '';
  for (const t of chain) {
    const u = t.units.get(key);
    if (!u) continue;
    if (u.source === text) return { how: 'exact', table: t.id, target: u.target };
    stale ||= t.id;
  }
  if (stale) return { how: 'stale', table: stale };
  return { how: 'missing' };
}

/**
 * What `term(name)` (ContentText.js) finds along a chain: the first table's term.
 * @param {ContentTable[]} chain
 * @param {string} name trimmed
 * @returns {{ how: 'term'|'missing', table?: string, target?: string }}
 */
export function lookupTerm(chain, name) {
  for (const t of chain) {
    const v = t.terms.get(name);
    if (v !== undefined) return { how: 'term', table: t.id, target: v };
  }
  return { how: 'missing' };
}

// =================================================================================================
// One language's report
// =================================================================================================

/**
 * An untranslated unit: shown by a reader whose chain has no translation of it.
 * @typedef {{ key: string, text: string, chars: number, kind: string, where: string[], note: Record<string, string> }} UntranslatedUnit
 * @typedef {{ name: string, chars: number, kind: string, where: string[] }} UntranslatedTerm
 * @typedef {{ key: string, was: string, now: string, target: string, where: string[], note: Record<string, string>, kind: string,
 *   shared?: string[], outOfStep?: string }} ChangedUnit
 *   a unit whose recorded English was edited: its key is shown with other English (`now`) by
 *   readers whose English at that key lives in this table — the same key, another source; `shared`:
 *   the readers that still show its old English at its key (it stays for them); `outOfStep`: the
 *   key beside it in the same field that shows its old English now — were the keys shifted against
 *   the texts by a hand edit of `textKeys`?
 * @typedef {{ key: string, source: string, why: string }} OrphanUnit
 *   a unit no reader shows: `why` — no source holds its key (the text was deleted, or the key is no
 *   text key at all), or its key now shows English another table holds
 */

/**
 * @typedef {object} TableReport
 * @property {string} id
 * @property {boolean} exists
 * @property {number} version              the version read (0 when the file does not exist or is not read)
 * @property {number} translated           its units and terms in use
 * @property {{ units: UntranslatedUnit[], terms: UntranslatedTerm[] }} untranslated   the entries that live here and a reader shows in English
 * @property {ChangedUnit[]} changed       needs review (a warning each)
 * @property {{ units: OrphanUnit[], terms: string[] }} orphans   no reader shows them (a warning each; `--prune`)
 * @property {string[]} sourceErrors      the errors of its own and its readers' sources: its orphans may be in use, so the tools rewrite it only with `--force=sources`
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {string[]} info
 */

/**
 * @typedef {object} Workspace
 * @property {string} root
 * @property {string} dir
 * @property {ReturnType<typeof readIndex>} index
 * @property {string[]} langs
 * @property {Map<string, Map<string, ReturnType<typeof readTable>>>} tables   lang → table id → its file (null: missing)
 * @property {Map<string, TableSources>} sources
 * @property {Map<string, string[]>} closure
 * @property {Map<string, { units: Map<string, ContentString>, terms: Map<string, ContentString> }>} held
 * @property {Map<string, string[]>} ext
 */

/**
 * Everything one language's check knows about its tables: what is listed, the extends closure of
 * its own files, the sources of its listed tables, where each entry lives, each table's readers and
 * lookup chain, and what each reader shows.
 * @param {Workspace} ws
 * @param {string} lang
 */
export function languageModel(ws, lang) {
  const listed = ws.index.languages.get(lang) ?? new Set();
  const files = ws.tables.get(lang) ?? new Map();
  // (the closure of this language's own files: the loader follows them; unlisted extends are skipped)
  /** @type {Map<string, string[]>} */
  const ext = new Map();
  for (const id of new Set(['common', ...listed])) ext.set(id, (files.get(id)?.table.extends ?? []).filter((e) => listed.has(e)));
  const closure = extendsClosure(ext);
  /** @type {Map<string, TableSources>} */
  const sources = new Map([...ws.sources].filter(([id]) => id === 'common' || listed.has(id)));
  const held = entryHomes(sources, closure);
  /** @type {Pick<TableSources, 'units'|'terms'|'occ'|'texts'|'strings'>} */
  const empty = { units: new Map(), terms: new Map(), occ: new Map(), texts: new Map(), strings: [] };
  /** @param {string} r a reader → what it shows */
  const shownBy = (r) => {
    const s = sources.get(r === CODE_READER ? 'common' : r);
    return s ? { units: s.units, terms: s.terms, occ: s.occ, texts: s.texts ?? new Map(), strings: s.strings } : empty;
  };
  /** @param {string[]} ids @returns {ContentTable[]} the tables of a chain whose files exist */
  const tablesOf = (ids) => ids.map((t) => files.get(t)?.table).filter(Boolean);
  const readers = [CODE_READER, ...[...listed].filter((t) => t !== 'common').sort(tableOrder)];
  /**
   * The table a reader's entry lives in (`entryHomes`): the table of its chain that holds it, else
   * the reader itself (`common` for the code).
   * @param {string} r
   * @param {{ key?: string, text: string, term?: boolean }} e
   */
  const homeOf = (r, e) => {
    for (const t of lookupChain(r, listed, closure)) {
      const h = held.get(t);
      if (e.term ? h?.terms.has(e.text) : h?.units.get(e.key)?.text === e.text) return t;
    }
    return r === CODE_READER ? 'common' : r;
  };
  return { lang, listed, files, closure, sources, held, readers, shownBy, tablesOf, homeOf, chainOf: (r) => lookupChain(r, listed, closure) };
}

/**
 * The units of one table file, each against the English its readers show (I18N.md §4.7). A unit's
 * key is the one the data holds beside its text, kept through every edit, so a unit is looked for at
 * its own key only — nothing moves:
 * - `used`: a reader shows its key with its recorded English (`readers`); `changed` beside it when
 *   another reader shows the key with other English that lives here (a line edited in a shipped
 *   level whose campaign copy still has the old English: the review is for that reader, the unit
 *   stays for the others);
 * - `changed` (`now`, `readers`): else a reader shows its key with other English that lives here —
 *   the same key, another source: the line was edited and needs review (the game shows the English);
 * - `orphan` (`why`): else — no source holds its key (the text was deleted), or the key now shows
 *   English another table holds (a campaign's unit whose copy is the shipped level's again).
 * @param {ReturnType<typeof languageModel>} m
 * @param {string} id
 * @returns {Map<string, UnitClass>}
 */
export function classifyUnits(m, id) {
  /** @type {Map<string, UnitClass>} */
  const out = new Map();
  const table = m.files.get(id)?.table;
  if (!table) return out;
  const readers = readersOf(id, m.listed, m.closure);
  for (const [key, u] of table.units) {
    /** @type {string[]} */
    const usedBy = [];
    /** @type {{ r: string, now: string }[]} the readers that show an edit of it (English that lives here) */
    const edits = [];
    let shown = false;
    let elsewhere = '';
    for (const r of readers) {
      const s = m.shownBy(r);
      const texts = s.texts.get(key);
      if (!texts) continue;
      shown = true;
      if (texts.has(u.source)) { usedBy.push(r); continue; }
      const now = s.units.get(key)?.text ?? [...texts][0];
      const h = m.homeOf(r, { key, text: now });
      if (h === id) edits.push({ r, now });
      else elsewhere ||= h;
    }
    const first = edits[0];
    const changed = first ? { now: first.now, readers: edits.filter((x) => x.now === first.now).map((x) => x.r) } : null;
    if (usedBy.length) out.set(key, { cls: 'used', readers: usedBy, ...(changed ? { changed } : {}) });
    else if (changed) out.set(key, { cls: 'changed', now: changed.now, readers: changed.readers });
    else {
      const why = shown ? `its key now shows English that ${elsewhere} holds (that table translates it there)`
        : isTextKey(key) ? 'no source holds its key (its text was deleted, or its file left the table)'
          : 'not a text key (a GUID, <GUID>.2 or a code key): no data asks for it';
      out.set(key, { cls: 'orphan', why });
    }
  }
  return out;
}

/**
 * How a table's unit stands (`classifyUnits`): `readers` who use it (used) or show the edit
 * (changed); `now` (changed) the English that replaced it; `changed` on a used unit: the edit
 * another reader shows; `why` (orphan) why no reader shows it.
 * @typedef {{ cls: 'used'|'changed'|'orphan', now?: string, readers?: string[], why?: string,
 *   changed?: { now: string, readers: string[] } }} UnitClass
 */

/**
 * The part of an entry's place that names its field (`levels/x.json › pip (npc) › dialogue` for
 * `… › dialogue[2].choices[1]`, the script for `… › talk:8`): entries with the same one are pages or
 * lines of one field.
 * @param {string} where
 */
const fieldOf = (where) => where.replace(/(\[\d+\](\.choices\[\d+\])?|:\d+( \([^)]*\))?)$/, '');

/**
 * Check one language (I18N.md §4.7): every table the index lists against the units and terms its
 * readers show — untranslated entries per reader chain (given to the table they live in), changed
 * units (the same key, another source) and orphan units, orphan terms, markup, the table files
 * themselves (what the loader drops, a file it does not read: errors), a term translated
 * differently in two tables or by the UI, a gold `{Term}` span whose translation is not the term's.
 * Read-only.
 * @param {Workspace} ws
 * @param {string} lang
 * @param {{ ui?: Map<string, Map<string, string>> }} [o] `ui`: the UI glossary (`uiGlossary().names`)
 * @returns {{ lang: string, tables: TableReport[], terms: string[], glossary: string[], model: ReturnType<typeof languageModel>,
 *   classes: Map<string, ReturnType<typeof classifyUnits>> }}
 */
export function checkLanguage(ws, lang, o = {}) {
  const m = languageModel(ws, lang);
  const { listed, files } = m;
  /** @type {Map<string, TableReport>} */
  const reports = new Map();
  for (const id of [...listed].sort(tableOrder)) {
    const r = files.get(id);
    // (the errors of its own and its readers' sources: a source that cannot be read makes its units look orphaned)
    const sourceErrors = [...new Set([id, ...readersOf(id, listed, m.closure)].flatMap((t) => m.sources.get(t === CODE_READER ? 'common' : t)?.errors ?? []))];
    reports.set(id, {
      id, exists: !!r, version: r && !r.broken ? r.table.version : 0, translated: 0,
      untranslated: { units: [], terms: [] }, changed: [], orphans: { units: [], terms: [] }, sourceErrors,
      errors: [], warnings: [], info: [],
    });
  }
  /**
   * The key beside `key` in the same field that a reader shows with `text` (keys out of step with
   * their texts: a hand edit shifted a `textKeys` list), or ''.
   * @param {string} r
   * @param {string} key
   * @param {string} text
   */
  const besideWith = (r, key, text) => {
    const s = m.shownBy(r);
    const at = s.units.get(key);
    if (!at) return '';
    const f = fieldOf(at.where);
    const e = s.strings.find((x) => !x.term && x.key && x.key !== key && x.text === text && fieldOf(x.where) === f);
    return e?.key ?? '';
  };
  // (1) every table's units against the English its readers show
  /** @type {Map<string, ReturnType<typeof classifyUnits>>} */
  const classes = new Map();
  for (const [id, rep] of reports) {
    const r = files.get(id);
    if (!r) { rep.errors.push(`listed in index.json, but ${lang}/${id}.json does not exist`); continue; }
    for (const w of r.warnings) (parseIssueIsError(w) ? rep.errors : rep.warnings).push(w);
    for (const e of r.table.extends) if (!listed.has(e)) rep.errors.push(`extends ${e}, which index.json does not list for ${lang}`);
    const cls = classifyUnits(m, id);
    classes.set(id, cls);
    const readers = readersOf(id, listed, m.closure);
    for (const [key, c] of cls) {
      const u = r.table.units.get(key);
      /** @param {{ now: string, readers: string[] }} x @param {string[]|null} shared */
      const changed = (x, shared) => {
        const e = m.shownBy(x.readers[0]).units.get(key);
        const where = [...new Set(x.readers.flatMap((y) => (m.shownBy(y).occ.get(key) ?? []).map((z) => z.where)))];
        const outOfStep = besideWith(x.readers[0], key, u.source);
        rep.changed.push({
          key, was: u.source, now: x.now, target: u.target, where, note: { ...(e?.note ?? {}) }, kind: e?.kind ?? 'line',
          ...(shared ? { shared } : {}), ...(outOfStep ? { outOfStep } : {}),
        });
      };
      if (c.cls === 'used') {
        rep.translated++;
        if (c.changed) changed(c.changed, c.readers);
      } else if (c.cls === 'changed') changed({ now: c.now, readers: c.readers }, null);
      else rep.orphans.units.push({ key, source: u.source, why: c.why ?? '' });
    }
    // terms: in use while a reader shows the name
    for (const name of r.table.terms.keys()) {
      if (readers.some((x) => m.shownBy(x).terms.has(name))) rep.translated++;
      else rep.orphans.terms.push(name);
    }
  }
  // (2) every reader's units and terms along its chain: untranslated → the table they live in
  /** @type {Map<string, Set<string>>} table → `<key>\0<English>` a review covers (a changed unit is listed as changed, not as untranslated) */
  const covered = new Map();
  for (const [id, rep] of reports) covered.set(id, new Set(rep.changed.map((c) => `${c.key}\0${c.now}`)));
  /** @type {Map<string, Map<string, UntranslatedUnit>>} */
  const uu = new Map();
  /** @type {Map<string, Map<string, UntranslatedTerm>>} */
  const ut = new Map();
  for (const r of m.readers) {
    const chainIds = m.chainOf(r);
    const chain = m.tablesOf(chainIds);
    const shown = m.shownBy(r);
    for (const [key, e] of shown.units) {
      const res = lookupUnit(chain, key, e.text);
      if (res.how === 'exact') continue;
      const home = m.homeOf(r, e);
      if (!reports.has(home)) continue;
      if (covered.get(home)?.has(`${key}\0${e.text}`)) continue;
      let byKey = uu.get(home);
      if (!byKey) uu.set(home, (byKey = new Map()));
      const where = (shown.occ.get(key) ?? [e]).map((x) => x.where);
      const had = byKey.get(key);
      if (had) { for (const w of where) if (!had.where.includes(w)) had.where.push(w); continue; }
      byKey.set(key, { key, text: e.text, chars: e.text.length, kind: e.kind, where, note: { ...(e.note ?? {}) } });
    }
    for (const [name, occ] of shown.terms) {
      const res = lookupTerm(chain, name);
      if (res.how !== 'missing') continue;
      const home = m.homeOf(r, { text: name, term: true });
      if (!reports.has(home)) continue;
      let byName = ut.get(home);
      if (!byName) ut.set(home, (byName = new Map()));
      const had = byName.get(name);
      const where = occ.map((x) => x.where);
      if (had) { for (const w of where) if (!had.where.includes(w)) had.where.push(w); continue; }
      byName.set(name, { name, chars: name.length, kind: occ[0].kind, where });
    }
  }
  for (const [id, rep] of reports) {
    rep.untranslated.units = [...(uu.get(id)?.values() ?? [])];
    rep.untranslated.terms = [...(ut.get(id)?.values() ?? [])];
  }
  // (3) per table file: markup, a gold {Term} span, changed / orphan as warnings
  for (const [id, rep] of reports) {
    const r = files.get(id);
    if (!r) continue;
    const chain = m.tablesOf(m.chainOf(id));
    for (const [key, u] of r.table.units) {
      const label = key;
      const mi = markupIssues(u.source, u.target);
      for (const e of mi.errors) rep.errors.push(`${label}: ${e}`);
      for (const w of mi.warnings) rep.warnings.push(`${label}: ${w}`);
      for (const i of mi.info) rep.info.push(`${label}: ${i}`);
      // a gold {Term} span: the term's translation inside the braces (review item 12)
      if (u.target !== u.source) {
        const tspans = goldSpans(u.target);
        for (const g of new Set(goldSpans(u.source))) {
          const t = lookupTerm(chain, g);
          if (t.how === 'missing' || t.target === g || tspans.includes(t.target)) continue;
          rep.warnings.push(`${label}: {${g}} is the term "${t.target}" (${t.table}), but no gold span here reads {${t.target}} (${tspans.length ? tspans.map((x) => `{${x}}`).join(' ') : 'none'})`);
        }
      }
    }
    for (const [name, target] of r.table.terms) {
      const mi = markupIssues(name, target, { name: true });
      const label = `term "${clip(name, 50)}"`;
      for (const e of mi.errors) rep.errors.push(`${label}: ${e}`);
      for (const w of mi.warnings) rep.warnings.push(`${label}: ${w}`);
      for (const i of mi.info) rep.info.push(`${label}: ${i}`);
    }
    for (const c of rep.changed) {
      rep.warnings.push(`changed ${c.key}: the English was "${clip(c.was)}", now "${clip(c.now)}" — the game shows the English until it is reviewed`
        + `${c.shared ? ` (${c.shared.join(', ')} still show${c.shared.length === 1 ? 's' : ''} the old English: merging the review keeps the old translation for ${c.shared.length === 1 ? 'it' : 'them'})` : ''}`
        + `${c.outOfStep ? ` — its old English is now shown at ${c.outOfStep} beside it: are the keys out of step with the texts (a hand edit of textKeys)? npm run i18n:keys -- --check` : ''}`);
    }
    // a source that could not be read: its entries look orphaned, but may well be in use
    const unread = rep.sourceErrors.length ? ` — source unreadable (${clip(rep.sourceErrors[0], 100)}${rep.sourceErrors.length > 1 ? ` and ${rep.sourceErrors.length - 1} more` : ''}): it may be in use, --prune leaves this table alone until the source is fixed` : '';
    for (const x of rep.orphans.units) rep.warnings.push(`orphan ${x.key}: "${clip(x.source)}" — ${x.why}${unread || ' (node tools/i18n-worklist.mjs --prune)'}`);
    for (const n of rep.orphans.terms) rep.warnings.push(`orphan term "${clip(n, 50)}" — nothing ${id === 'common' ? '' : `${id} or a table reading it `}shows it${unread || ' (node tools/i18n-worklist.mjs --prune)'}`);
  }
  // (4) one name, one translation: a term translated differently in two tables
  /** @type {Map<string, Map<string, string>>} name → table → translation */
  const termTargets = new Map();
  for (const id of [...listed].sort(tableOrder)) {
    for (const [name, target] of files.get(id)?.table.terms ?? []) {
      let t = termTargets.get(name);
      if (!t) termTargets.set(name, (t = new Map()));
      t.set(id, target);
    }
  }
  /** @type {string[]} */
  const terms = [];
  for (const [name, byTable] of termTargets) {
    if (new Set(byTable.values()).size < 2) continue;
    terms.push(`term "${clip(name, 50)}" is translated differently: ${[...byTable].map(([t, v]) => `${t} "${clip(v, 30)}"`).join(', ')} — one name, one translation`);
  }
  // (5) the UI glossary (I18N.md §3): a name the UI and the content both show, translated otherwise,
  // or by the UI only (names only: prose keeps its own register — a unit is translated by its key)
  /** @type {string[]} */
  const glossary = [];
  /** @type {Set<string>} every name a reader shows */
  const shownNames = new Set();
  for (const r of m.readers) for (const n of m.shownBy(r).terms.keys()) shownNames.add(n);
  for (const [en, byLang] of o.ui ?? new Map()) {
    const ui = byLang.get(lang);
    if (!ui || !shownNames.has(en)) continue;
    const content = termTargets.get(en);
    if (!content || !content.size) glossary.push(`"${clip(en, 50)}": the UI says "${ui}", no content table translates the name yet`);
    else for (const [t, v] of content) if (v !== ui) glossary.push(`"${clip(en, 50)}": the UI says "${ui}", ${t} says "${v}"`);
  }
  return { lang, tables: [...reports.values()], terms, glossary, model: m, classes };
}

/**
 * The translation memory of one language (I18N.md §4.7): every translation its table files hold, by
 * the English — units by their recorded source, terms by their name.
 * @param {Map<string, ReturnType<typeof readTable>>} files table id → its file
 * @returns {Map<string, { target: string, from: string }[]>}
 */
export function translationMemory(files) {
  /** @type {Map<string, { target: string, from: string }[]>} */
  const out = new Map();
  const add = (en, target, from) => {
    let l = out.get(en);
    if (!l) out.set(en, (l = []));
    l.push({ target, from });
  };
  for (const [id, r] of [...files].sort((a, b) => tableOrder(a[0], b[0]))) {
    if (!r) continue;
    for (const [name, target] of r.table.terms) add(name, target, `${id} term`);
    for (const [key, u] of r.table.units) add(u.source, u.target, `${id} ${key}`);
  }
  return out;
}

/**
 * The translation memory's suggestions for an English: each distinct translation once (where it
 * was found first), at most `max`, never the entry itself (`self`: `<table> <key>` or `<table> term`).
 * @param {ReturnType<typeof translationMemory>} tm
 * @param {string} en
 * @param {string} [self]
 * @param {number} [max]
 */
export function suggestionsFor(tm, en, self = '', max = 5) {
  /** @type {{ target: string, from: string }[]} */
  const out = [];
  for (const s of tm.get(en) ?? []) {
    if (s.from === self || out.some((x) => x.target === s.target)) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Everything the checker and the worklist need: the index, every listed table of every language,
 * the sources, the extends closure and what each table holds (`held`).
 * @param {{ root?: string, dir?: string, langs?: string[]|null }} [o]
 * @returns {Promise<Workspace>}
 */
export async function loadWorkspace(o = {}) {
  const root = o.root ?? ROOT;
  const dir = o.dir ?? i18nDir(root);
  const index = readIndex(dir);
  const langs = [...index.languages.keys()].filter((l) => !o.langs || o.langs.includes(l));
  /** @type {Map<string, Map<string, ReturnType<typeof readTable>>>} */
  const tables = new Map();
  /** @type {Map<string, string[]>} */
  const ext = new Map();
  const allIds = new Set(['common']);
  for (const [lang, set] of index.languages) {
    for (const id of set) allIds.add(id);
    const m = new Map();
    for (const id of set) {
      const r = readTable(lang, id, dir);
      m.set(id, r);
      if (r && !ext.has(id)) ext.set(id, r.table.extends);
    }
    tables.set(lang, m);
  }
  for (const id of allIds) if (!ext.has(id)) ext.set(id, []);
  const closure = extendsClosure(ext);
  const sources = await allSources([...allIds], root);
  const held = entryHomes(sources, closure);
  return { root, dir, index, langs, tables, sources, closure, held, ext };
}

/**
 * Per table: the units and terms it holds (`entryHomes`) and the English to translate — characters
 * and words of the units and terms (the volume table). `strings`: units + terms.
 * @param {Map<string, { units: Map<string, ContentString>, terms: Map<string, ContentString> }>} held
 */
export function entryVolume(held) {
  /** @type {Map<string, { strings: number, units: number, terms: number, chars: number, words: number }>} */
  const out = new Map();
  for (const [id, h] of held) {
    const v = { strings: 0, units: h.units.size, terms: h.terms.size, chars: 0, words: 0 };
    for (const e of [...h.units.values(), ...h.terms.values()]) {
      v.chars += e.text.length;
      v.words += e.text.split(/\s+/).filter(Boolean).length;
    }
    v.strings = v.units + v.terms;
    out.set(id, v);
  }
  return out;
}

/**
 * The table files (relative ids) present for a language folder, listed or not.
 * @param {string} lang
 * @param {string} [dir]
 */
export function tableFilesOf(lang, dir = i18nDir()) {
  const base = path.join(dir, lang);
  const out = [];
  if (!fs.existsSync(base)) return out;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) out.push(path.relative(base, p).split(path.sep).join('/').replace(/\.json$/, ''));
    }
  };
  walk(base);
  return out.sort();
}
