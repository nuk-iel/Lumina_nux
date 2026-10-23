/**
 * Picks the editor's language and registers its strings as a side effect of being imported. It is
 * the first import of src/editor/main.js, so it runs before every other editor module: a module
 * may read `tr()` at load time (a constant's label) and gets the right language.
 */
import { initEditorLang } from './i18n.js';

initEditorLang();
