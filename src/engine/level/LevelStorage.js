/**
 * Saving and loading Luminati levels:
 *  - browser storage (localStorage slots, always available),
 *  - the project folder `public/levels/<name>.json` through the dev-server API
 *    (tools/vite-level-api.js — only while `npm run dev` is running) — or, with the option
 *    `{ campaign }`, a campaign's own levels `public/campaigns/<campaign>/levels/<name>.json`
 *    (docs/specs/CAMPAIGN_FORMAT.md),
 *  - plain files (download / open from disk).
 *
 * Every load goes through `parseLevel`, so files are normalised and validated the same way.
 */
import { parseLevel, serializeLevel } from './LevelFormat.js';
import { lm } from './messages.js';

/** @import { Level } from './types.js' */

const LOCAL_PREFIX = 'luminati.level.';
const LOCAL_INDEX = 'luminati.levels';
export const PLAYTEST_SLOT = '__playtest__';

/**
 * The site's base URL, which every file and API path of the site starts with (Vite's `BASE_URL`:
 * '/' on the dev server, `/project/` under `--base=/project/`, './' in the build — fetched from the
 * page's own folder; '/' outside Vite). Never a path from the site root: the site may live under
 * a sub-path.
 */
const siteBase = () => import.meta.env?.BASE_URL ?? '/';

/**
 * The level API folder: the project's levels, or a campaign's (`<base>api/levels`,
 * `<base>api/campaigns/<campaign>/levels`).
 * @param {string} [campaign] campaign folder name (slugified); blank = public/levels
 */
export function levelsApi(campaign) {
  return campaign ? `${siteBase()}api/campaigns/${encodeURIComponent(slugify(campaign))}/levels` : `${siteBase()}api/levels`;
}

/**
 * Where a project level file lives, relative to the site root (`levels/<name>.json`, or
 * `campaigns/<campaign>/levels/<name>.json`).
 * @param {string} name level name (slugified)
 * @param {{ campaign?: string }} [opts]
 */
export function projectLevelPath(name, { campaign = '' } = {}) {
  return campaign ? `campaigns/${slugify(campaign)}/levels/${slugify(name)}.json` : `levels/${slugify(name)}.json`;
}

/**
 * Turn any display name into a safe slot / file name ("My Village!" → "my-village"). Names with
 * no Latin letters or digits ("村の広場") get a stable "level-<hash>" name, so two such levels
 * never share a file; a blank name is "untitled"; Windows device names ("con", "nul"…) get a
 * "-level" suffix.
 * @param {string} name any display name (null / undefined count as blank)
 * @returns {string}
 */
export function slugify(name) {
  const raw = String(name ?? '');
  const s = raw.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  // (Windows reserves con / prn / aux / nul / com1-9 / lpt1-9 as file names, with any extension)
  if (s) return RESERVED_FILE_NAMES.test(s) ? `${s}-level` : s;
  const t = raw.trim();
  return t ? `level-${hash6(t)}` : 'untitled';
}

/** File names Windows cannot use for a file (`con.json` is the console device there). */
export const RESERVED_FILE_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/** 6 base-36 chars of a string hash (FNV-1a). */
function hash6(str) {
  let h = 0x811c9dc5;
  for (const ch of str) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(6, '0').slice(-6);
}

// ---------------------------------------------------------------------------------------------
// Browser storage
// ---------------------------------------------------------------------------------------------

function readIndex() {
  try { return JSON.parse(localStorage.getItem(LOCAL_INDEX) ?? '[]'); } catch { return []; }
}

function writeIndex(list) {
  try { localStorage.setItem(LOCAL_INDEX, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

/**
 * Levels saved in this browser, newest first.
 * @returns {{ slot: string, name: string, savedAt: number, width: number, depth: number }[]}
 */
export function listLocalLevels() {
  return readIndex().filter((e) => e.slot !== PLAYTEST_SLOT).sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Save to browser storage. Returns the slot name. Throws if storage is full / unavailable.
 * @param {string} slot slot or display name (slugified, except the play-test slot)
 * @param {Level} level
 * @returns {string}
 */
export function saveLocalLevel(slot, level) {
  slot = slot === PLAYTEST_SLOT ? slot : slugify(slot);
  localStorage.setItem(LOCAL_PREFIX + slot, serializeLevel(level));
  const list = readIndex().filter((e) => e.slot !== slot);
  list.push({ slot, name: level.name, savedAt: Date.now(), width: level.width, depth: level.depth });
  writeIndex(list);
  return slot;
}

/**
 * Load from browser storage.
 * @param {string} slot
 * @returns {{ level: Level, warnings: string[] }|null} null when the slot is empty or storage is
 *   unavailable
 */
export function loadLocalLevel(slot) {
  let text = null;
  try { text = localStorage.getItem(LOCAL_PREFIX + slot); } catch { /* unavailable */ }
  return text ? parseLevel(text) : null;
}

/** @param {string} slot */
export function deleteLocalLevel(slot) {
  try { localStorage.removeItem(LOCAL_PREFIX + slot); } catch { /* unavailable */ }
  writeIndex(readIndex().filter((e) => e.slot !== slot));
}

// ---------------------------------------------------------------------------------------------
// Project folder (dev-server API) and published levels
// ---------------------------------------------------------------------------------------------

/** Is the dev-server level API reachable (i.e. running under `npm run dev`)? */
export async function hasProjectApi() {
  try {
    const r = await fetch(levelsApi(), { method: 'GET', cache: 'no-store' });
    return r.ok && (r.headers.get('content-type') ?? '').includes('json');
  } catch {
    return false;
  }
}

/**
 * Levels in `public/levels/` — or a campaign's `levels/` folder (dev server only).
 * @param {{ campaign?: string }} [opts]
 * @returns {Promise<{ name: string, file: string, title: string, size: number, modified: number }[]>}
 */
export async function listProjectLevels({ campaign = '' } = {}) {
  const r = await fetch(levelsApi(campaign), { cache: 'no-store' });
  if (!r.ok) throw new Error(lm('storage.apiHttp', { status: r.status }));
  return (await r.json()).levels ?? [];
}

/**
 * The campaigns in `public/campaigns/` with their levels (dev server only).
 * @returns {Promise<{ name: string, title: string, file: string,
 *   levels: { name: string, file: string, title: string, size: number, modified: number }[] }[]>}
 */
export async function listProjectCampaigns() {
  const r = await fetch(`${siteBase()}api/campaigns`, { cache: 'no-store' });
  if (!r.ok) throw new Error(lm('storage.apiHttp', { status: r.status }));
  return (await r.json()).campaigns ?? [];
}

/**
 * Write `public/levels/<name>.json` — or the campaign's `levels/<name>.json` (dev server only; the
 * campaign folder must exist). Returns the file name written.
 * @param {string} name display name (slugified)
 * @param {Level} level
 * @param {{ campaign?: string }} [opts]
 * @returns {Promise<string>}
 */
export async function saveProjectLevel(name, level, { campaign = '' } = {}) {
  const slug = slugify(name);
  const r = await fetch(`${levelsApi(campaign)}/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: serializeLevel(level),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    let msg = text;
    try { msg = JSON.parse(text)?.error ?? text; } catch { /* plain text */ }
    throw new Error(msg || lm('storage.http', { status: r.status }));
  }
  return (await r.json()).file;
}

/**
 * @param {string} name display name (slugified)
 * @param {{ campaign?: string }} [opts]
 */
export async function deleteProjectLevel(name, { campaign = '' } = {}) {
  const r = await fetch(`${levelsApi(campaign)}/${encodeURIComponent(slugify(name))}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(lm('storage.deleteFailed', { status: r.status }));
}

/**
 * Load a published level `levels/<name>.json` — or `campaigns/<campaign>/levels/<name>.json`
 * (works in dev and in production builds, since files in public/ are copied to dist/).
 * A missing file rejects with a `LevelNotFoundError` (its message in the page's language).
 * @param {string} name level name (slugified)
 * @param {{ campaign?: string }} [opts]
 * @returns {Promise<{ level: Level, warnings: string[] }>}
 */
export async function loadProjectLevel(name, { campaign = '' } = {}) {
  const where = campaign ? `campaigns/${encodeURIComponent(slugify(campaign))}/levels` : 'levels';
  const r = await fetch(`${siteBase()}${where}/${encodeURIComponent(slugify(name))}.json`, { cache: 'no-store' });
  // dev servers answer unknown paths with index.html (HTTP 200), so check what actually came back
  const type = r.headers.get('content-type') ?? '';
  if (!r.ok || type.includes('text/html')) {
    const e = /** @type {LevelNotFoundError} */ (new Error(r.ok ? lm('storage.notFound', { name }) : lm('storage.notFoundHttp', { name, status: r.status })));
    e.code = 'level.notFound';
    e.status = r.ok ? 0 : r.status;
    throw e;
  }
  return parseLevel(await r.text());
}

/**
 * The error of a level file that is not there (`loadProjectLevel`): test `code`, not the message
 * (it is worded in the page's language). `status`: the HTTP status, 0 when the server answered
 * with a page (the dev server's index.html).
 * @typedef {Error & { code: 'level.notFound', status: number }} LevelNotFoundError
 */

// ---------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------

/**
 * Download the level as `<slug>.level.json`.
 * @param {Level} level
 * @param {string} [filename]
 */
export function downloadLevel(level, filename = `${slugify(level.name)}.level.json`) {
  const blob = new Blob([serializeLevel(level)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Read a File (from an <input type=file> or drag & drop).
 * @param {File} file
 * @returns {Promise<{ level: Level, warnings: string[] }>}
 */
export async function readLevelFile(file) {
  return parseLevel(await file.text());
}

/**
 * Let the user pick a level file. Resolves null when the picker is cancelled (the input's
 * `cancel` event) or reports no file; rejects when the file is not a level.
 * @returns {Promise<{ level: Level, warnings: string[], fileName: string }|null>}
 */
export function openLevelFileDialog() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('cancel', () => resolve(null));
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try { resolve({ ...(await readLevelFile(file)), fileName: file.name }); } catch (e) { reject(e); }
    };
    input.click();
  });
}

// ---------------------------------------------------------------------------------------------
// URL resolution (used by the game)
// ---------------------------------------------------------------------------------------------

/**
 * Resolve the level requested by a URL query:
 *   ?level=local:<slot>   browser storage (the editor's play-test uses local:__playtest__)
 *   ?level=<name>         public/levels/<name>.json
 *   (none)                null — the caller uses its built-in default level
 * @param {string} [search=location.search]
 * @returns {Promise<{ level: Level, warnings: string[], source: string }|null>}
 */
export async function resolveLevelFromURL(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search).get('level');
  if (!q) return null;
  if (q.startsWith('local:')) {
    const slot = q.slice(6);
    const r = loadLocalLevel(slot);
    if (!r) throw new Error(lm('storage.noLocal', { slot }));
    return { ...r, source: `local:${slot}` };
  }
  const r = await loadProjectLevel(q);
  return { ...r, source: `levels/${slugify(q)}.json` };
}
