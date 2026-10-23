/**
 * Catalog labels in the editor's language. The object catalog (ObjectCatalog.js) and the tile
 * types (LevelFormat.js `TILE_TYPES`) hold English display text next to data: type labels and
 * help, field labels and help, option labels, enemy names, tile names. `localizeCatalog()` turns
 * those display properties into getters that read ./strings/catalog.js (keyed by the English text)
 * while the editor shows Chinese, so every reader — inspector, palettes, outliner, tooltips,
 * check messages — follows the language without knowing about it. Stored values (`type`,
 * `category`, field `key`s, option values, tile chars) are never touched.
 *
 * Bare option values shown as their own label (texture and preset names) and the palette's
 * category names are not objects: read them with `optionLabel(value)` / `categoryLabel(name)`.
 * In English nothing is installed (Node tools, generators and the game never call this).
 */
import { OBJECT_TYPES, ENEMY_INFO, NPC_ACTIONS, EXIT_MODES, EVENT_TRIGGERS, STORY_FIELDS, SPAWN_MARKER } from '../engine/level/ObjectCatalog.js';
import { TILE_TYPES } from '../engine/level/LevelFormat.js';
import { getLang } from '../engine/i18n/I18n.js';
import catalog from './strings/catalog.js';

const hasOwn = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

/** The Chinese tables, or null while the editor shows English. */
const zh = () => (getLang() === 'zh' ? catalog.zh : null);

/**
 * A catalog display text (a label, a help line, a tile name) in the current language.
 * @param {string} english
 * @returns {string}
 */
export function catalogText(english) {
  const m = zh()?.text;
  return m && typeof english === 'string' && hasOwn(m, english) ? m[english] : english;
}

/**
 * The label of a bare option value (a texture, tree kind, preset or facing name): the value
 * itself in English.
 * @param {unknown} value
 * @returns {string}
 */
export function optionLabel(value) {
  const s = String(value ?? '');
  const m = zh()?.values;
  return m && hasOwn(m, s) ? m[s] : s;
}

/**
 * The display name of a palette category (`OBJECT_CATEGORIES`; the value stays the key).
 * @param {string} category
 */
export const categoryLabel = (category) => catalogText(category);

/** The objects already given getters (field defs are shared between types). */
const done = new WeakSet();

/**
 * Make `obj[prop]` read its translation. A later write replaces the English source.
 * @param {object} obj
 * @param {string} prop
 */
function localize(obj, prop) {
  if (!obj || typeof obj !== 'object' || typeof obj[prop] !== 'string') return;
  let english = obj[prop];
  Object.defineProperty(obj, prop, {
    configurable: true,
    enumerable: true,
    get: () => catalogText(english),
    set: (v) => { english = v; },
  });
}

/** @param {any} field */
function localizeField(field) {
  if (!field || done.has(field)) return;
  done.add(field);
  localize(field, 'label');
  localize(field, 'help');
  for (const o of Array.isArray(field.options) ? field.options : []) {
    if (o && typeof o === 'object' && !done.has(o)) { done.add(o); localize(o, 'label'); }
  }
}

let installed = false;

/**
 * Install the getters (once, at boot, when the editor shows Chinese).
 */
export function localizeCatalog() {
  if (installed || getLang() !== 'zh') return;
  installed = true;
  for (const def of /** @type {any[]} */ (Object.values(OBJECT_TYPES))) {
    localize(def, 'label');
    localize(def, 'help');
    for (const f of def.fields ?? []) localizeField(f);
  }
  for (const f of STORY_FIELDS) localizeField(f);
  for (const list of [NPC_ACTIONS, EXIT_MODES, EVENT_TRIGGERS]) {
    for (const o of list) if (!done.has(o)) { done.add(o); localize(o, 'label'); }
  }
  for (const info of Object.values(ENEMY_INFO)) localize(info, 'label');
  localize(SPAWN_MARKER, 'label');
  for (const tt of TILE_TYPES) localize(tt, 'name');
}

/**
 * Every English display text and bare option value of the catalog (the coverage check,
 * tools/test-editor-i18n.mjs). Read before `localizeCatalog()` or in English.
 * @returns {{ text: Set<string>, values: Set<string> }}
 */
export function catalogSources() {
  const text = new Set();
  const values = new Set();
  const add = (s) => { if (typeof s === 'string' && s.trim()) text.add(s); };
  const field = (f) => {
    add(f.label); add(f.help);
    for (const o of Array.isArray(f.options) ? f.options : []) {
      if (o && typeof o === 'object') add(o.label);
      else if (typeof o === 'string' && o) values.add(o);
    }
  };
  for (const def of /** @type {any[]} */ (Object.values(OBJECT_TYPES))) {
    add(def.label); add(def.help); add(def.category);
    for (const f of def.fields ?? []) field(f);
  }
  for (const f of STORY_FIELDS) field(f);
  for (const list of [NPC_ACTIONS, EXIT_MODES, EVENT_TRIGGERS]) for (const o of list) add(o.label);
  for (const info of Object.values(ENEMY_INFO)) add(info.label);
  add(SPAWN_MARKER.label);
  for (const tt of TILE_TYPES) add(tt.name);
  return { text, values };
}
