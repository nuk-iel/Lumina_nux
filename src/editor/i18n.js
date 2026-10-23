/**
 * The editor's UI language (docs/specs/I18N.md §2): the same choice as the game (`?lang=`, then
 * the saved `luminati.lang`, then English — I18n.js `resolveLang`), so a play-test opens in the
 * language the editor shows. The editor ships English and Simplified Chinese; another language
 * (Japanese) shows the English strings.
 *
 * Strings live in the `editor` namespace (src/editor/strings/), read with `tr(key, vars)` /
 * `trn(key, n, vars)` (key: `<area>.<name>`). English entries must reproduce the editor's English text exactly:
 * the browser checks (sandbox/editor_shell.*.json) click and match it.
 */
import {
  t, tn, tlist, getLang, setLang, saveLang, resolveLang, isCJK, LANGS, registerStrings,
} from '../engine/i18n/I18n.js';
import editorStrings from './strings/index.js';
import { localizeCatalog } from './catalogI18n.js';

/** The languages the editor can show, in its menu's order. */
export const EDITOR_LANGS = Object.freeze(['en', 'zh']);

let ready = false;

/**
 * Pick the page's language and register the editor's tables. Called once, before any UI is built
 * (src/editor/main.js).
 * @returns {'en'|'ja'|'zh'}
 */
export function initEditorLang() {
  const lang = setLang(resolveLang());
  if (!ready) {
    registerStrings('editor', editorStrings);
    localizeCatalog();
    ready = true;
  }
  return lang;
}

/**
 * An editor UI string ('editor.' + key) in the current language, then English.
 * @param {string} key e.g. 'menu.file'
 * @param {Record<string, any>} [vars]
 */
export const tr = (key, vars) => t(`editor.${key}`, vars);

/**
 * A counted editor string (`{ one, other }` entries; `{n}` is the count).
 * @param {string} key
 * @param {number} n
 * @param {Record<string, any>} [vars]
 */
export const trn = (key, n, vars) => tn(`editor.${key}`, n, vars);

/** The language the editor shows: 'zh', else 'en'. */
export const editorLang = () => (getLang() === 'zh' ? 'zh' : 'en');

/** True while the editor shows Chinese (layout and typography switches). */
export const editorCJK = () => isCJK(editorLang());

/**
 * Switch the UI language: save the choice (the game reads it too), drop a `?lang=` from the
 * address, and reload. The caller asks about unsaved changes first.
 * @param {string} lang
 */
export function switchLanguage(lang) {
  saveLang(lang);
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  location.replace(url.toString());
}

/** The name of a language in that language ('English', '简体中文'). */
export const langName = (lang) => LANGS[lang]?.name ?? lang;

/**
 * A list joined with "and" the editor's way: "a", "a and b", "a, b and c" (English, no serial
 * comma — the editor's text, which `tlist` would change) / "a"、"a和b"、"a、b和c" (Chinese).
 * @param {string[]} list
 */
export function andList(list) {
  if (editorLang() === 'zh') return list.length > 1 ? `${list.slice(0, -1).join('、')}和${list[list.length - 1]}` : list.join('');
  return list.length > 2 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list.join(' and ');
}

/**
 * Items on one line: ', ' (English) / '、' (Chinese).
 * @param {string[]} list
 */
export const commaList = (list) => list.join(editorLang() === 'zh' ? '、' : ', ');

export { tlist };
