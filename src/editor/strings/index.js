/**
 * The editor's UI string table (namespace `editor`, read with `tr()` from ../i18n.js): one module
 * per area, each holding the keys of its prefix — `common.*` (shared words), `app.*` (EditorApp:
 * menus, commands, the shell, file and check messages), `dialogs.*` (ui/dialogs.js, Dialog.js,
 * the context menu), `panels.*` (inspector, fields, outliner, status bar, text keys), `tools.*`
 * (tools, tool options, the 2D map and the 3D view), `story.*` (script editor, story preview).
 * Catalog labels (object types, fields, options, tiles) are translated by ./catalog.js.
 *
 * Every module is `{ en, zh }`. English reproduces the editor's text exactly; Chinese follows
 * docs/specs/I18N_GLOSSARY.md for game names and keeps industry terms (3D, 2D, UI, ID, JSON, NPC,
 * GUID, HP, MP …) as they are.
 */
import common from './common.js';
import app from './app.js';
import dialogs from './dialogs.js';
import panels from './panels.js';
import tools from './tools.js';
import story from './story.js';

/** @typedef {import('../../engine/i18n/I18n.js').StringTable} StringTable */

/** The area modules, by their key prefix. */
export const EDITOR_STRING_AREAS = Object.freeze({ common, app, dialogs, panels, tools, story });

/**
 * Merge the areas into one table, checking each key carries its area's prefix.
 * @returns {{ en: Record<string, any>, zh: Record<string, any> }}
 */
function merge() {
  /** @type {{ en: Record<string, any>, zh: Record<string, any> }} */
  const out = { en: {}, zh: {} };
  for (const [area, table] of Object.entries(EDITOR_STRING_AREAS)) {
    for (const lang of /** @type {const} */ (['en', 'zh'])) {
      for (const [k, v] of Object.entries(table[lang] ?? {})) {
        if (!k.startsWith(`${area}.`)) throw new Error(`editor strings: key "${k}" is not in area "${area}"`);
        out[lang][k] = v;
      }
    }
  }
  return out;
}

const table = merge();
export default table;
