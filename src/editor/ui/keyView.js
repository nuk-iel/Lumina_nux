/**
 * The read-only view of text keys (docs/specs/I18N.md §4.10). A key is never typed by
 * hand — EditorState carries it through every edit — but QA, voice work and translators name a
 * line by its key, as in Unreal's details panel, so the inspector shows a translatable field's
 * keys under it: one small monospace line per text (its key, selectable, with a Copy button), a
 * field of several texts behind a "Text keys (n)" toggle. A text without a key says so (Level ›
 * Assign text keys gives it one). Nothing here writes to the level. Its buttons are not in the Tab
 * order: Tab moves from field to field as before (a key is selected with the pointer, or copied).
 */
import { h, icon, clear } from './dom.js';
import { ICONS } from '../icons.js';
import { tr } from '../i18n.js';

/** @import { TextRow } from '../textKeys.js' */

/**
 * Where a text is in its field, as a key line names it: `page 2`, `page 2 › 1` (a dialogue page's
 * first choice), `line 3` (a script's line, as its field shows it); '' for a one-string field.
 * @param {Pick<TextRow, 'page'|'choice'|'line'>} row
 * @param {boolean} pages does the field hold pages (a `lines` or dialogue field)?
 */
export function rowPlace(row, pages) {
  if (row.line != null) return tr('panels.keys.line', { n: row.line });
  if (row.page == null || !pages) return '';
  return row.choice != null ? tr('panels.keys.pageChoice', { n: row.page + 1, choice: row.choice + 1 }) : tr('panels.keys.page', { n: row.page + 1 });
}

/** At most this many characters of a text in a key line's tooltip. */
const TIP = 90;

/**
 * Copy a text to the clipboard (the async Clipboard API, else a hidden text area's copy command).
 * @param {string} text
 * @returns {Promise<boolean>} whether it was copied
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* (no permission, or not focused: the fallback) */ }
  const ta = h('textarea', { value: text, attrs: { readonly: true, 'aria-hidden': 'true' }, style: { position: 'fixed', left: '-9999px', top: '0', opacity: '0' } });
  document.body.appendChild(ta);
  try {
    ta.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

/**
 * One key line: where the text is, its key (selectable; '—' when it has none) and a Copy button.
 * @param {TextRow} row
 * @param {string} place `rowPlace(row)` ('' none)
 * @param {(key: string) => void} onCopy
 */
function keyLine(row, place, onCopy) {
  const tip = row.text.length > TIP ? `${row.text.slice(0, TIP - 1)}…` : row.text;
  if (!row.key) {
    return h('div', { class: 'le-text-key is-missing', title: tr('panels.keys.missingTitle', { text: tip }) },
      h('span', { class: 'le-text-key-at' }, place || tr('panels.keys.key')),
      h('span', { class: 'le-text-key-id' }, tr('panels.keys.none')));
  }
  return h('div', { class: 'le-text-key', title: tr('panels.keys.title', { text: tip }), dataset: { key: row.key } },
    h('span', { class: 'le-text-key-at' }, place || tr('panels.keys.key')),
    h('code', { class: 'le-text-key-id' }, row.key),
    h('button', {
      class: 'le-icon-btn le-text-key-copy', type: 'button', title: tr('panels.keys.copy'), tabIndex: -1, attrs: { 'aria-label': tr('panels.keys.copyAria', { key: row.key }) },
      onClick: () => onCopy(row.key),
    }, icon(ICONS.copy)));
}

/**
 * The key view of one field: its texts' key lines — under a "Text keys (n)" toggle when the field
 * holds pages or lines (`open` says whether it shows them). Hidden when the field holds no text.
 * @param {HTMLElement} el the view's element (filled)
 * @param {TextRow[]} rows the field's texts (`textRows`, that field)
 * @param {{ pages: boolean, open: boolean, onToggle: (open: boolean) => void, onCopy: (key: string) => void }} o
 *   pages: the field holds pages or lines (a `lines`, dialogue or script field)
 */
export function fillKeyView(el, rows, { pages, open, onToggle, onCopy }) {
  clear(el);
  el.hidden = !rows.length;
  if (!rows.length) return;
  if (!pages) {
    el.append(...rows.map((r) => keyLine(r, '', onCopy)));
    return;
  }
  const missing = rows.filter((r) => !r.key).length;
  const list = h('div', { class: 'le-text-key-list', hidden: !open }, rows.map((r) => keyLine(r, rowPlace(r, true), onCopy)));
  const toggle = h('button', {
    class: ['le-text-keys-toggle', open && 'is-open'], type: 'button', tabIndex: -1, attrs: { 'aria-expanded': String(open) },
    title: open ? tr('panels.keys.hide') : tr('panels.keys.show'),
    onClick: () => {
      const now = list.hidden === true;
      list.hidden = !now;
      toggle.classList.toggle('is-open', now);
      toggle.setAttribute('aria-expanded', String(now));
      toggle.title = now ? tr('panels.keys.hide') : tr('panels.keys.show');
      onToggle(now);
    },
  }, icon(ICONS.chevronRight, 'le-icon le-text-keys-caret'),
  tr('panels.keys.toggle', { n: rows.length }), missing ? h('span', { class: 'le-text-keys-missing' }, tr('panels.keys.without', { n: missing })) : null);
  el.append(toggle, list);
}
