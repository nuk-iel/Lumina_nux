/**
 * Editing story scripts (the `script` fields: a villager's `talk`, an event's `run`; the language
 * of src/engine/level/StoryScript.js): the keys of a script text area — Tab / Shift+Tab indent and
 * outdent by two spaces where they indent (the caret in a line's indentation, or several lines
 * selected; elsewhere they move the focus on, as in any field), Enter keeps the indentation (two
 * more after a block header) —, the live error list, and the pop-out editor (a wide modal with
 * line numbers, the full error list and the command reference).
 */
import { h, icon, clear } from './dom.js';
import { showDialog, confirmDialog, keepKeys } from './Dialog.js';
import { ICONS } from '../icons.js';
import { parseScript, scriptLines, SCRIPT_COMMANDS } from '../../engine/level/StoryScript.js';
import { stripScriptTags } from '../../engine/i18n/TextKeys.js';
import { tr, trn, editorLang } from '../i18n.js';
import storyStrings from '../strings/story.js';

/** @import { ScriptError } from '../../engine/level/StoryScript.js' */

const INDENT = '  ';

/** Lines after which Enter indents two more: block headers, options (`>`) and alternatives (`*`). */
const BLOCK_HEADER = /^(?:(?:if|elif|choice|once|cycle|seq|pick)(?:\s|$)|(?:else|loop)$|[>*])/;

/**
 * A script field value as editor text (one line per entry), without the lines' text-key tags
 * (`#line:<GUID>`, docs/specs/I18N.md §4.2): the text area never shows a tag (each line's key is
 * shown read-only under the field, with Copy: ./keyView.js), and the script is shown and compared
 * without them; on Apply EditorState retags the lines against the object's old ones (§4.10).
 * @param {unknown} v
 */
export const scriptText = (v) => scriptLines(stripScriptTags(v)).join('\n');

/**
 * Editor text → the stored script: one string per line, trailing blank lines dropped.
 * @param {string} t
 * @returns {string[]}
 */
export function scriptValue(t) {
  const ls = String(t ?? '').split(/\r?\n/);
  while (ls.length && !ls[ls.length - 1].trim()) ls.pop();
  return ls;
}

/** Replace [a, b) of a text area's value, keeping the browser's own undo (Ctrl+Z) where it can. */
function replaceRange(ta, a, b, text) {
  ta.focus();
  ta.setSelectionRange(a, b);
  let done = false;
  try { done = document.execCommand('insertText', false, text); } catch { done = false; }
  if (!done || ta.value.slice(a, a + text.length) !== text) {
    ta.setRangeText(text, a, b, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/** Indent (or outdent) the lines the selection touches by two spaces; the selection follows. */
function shiftLines(ta, outdent) {
  const v = ta.value;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const lineStart = v.lastIndexOf('\n', s - 1) + 1;
  // a selection that ends at the start of a line leaves that line alone
  const last = e > s && v[e - 1] === '\n' ? e - 1 : e;
  let lineEnd = v.indexOf('\n', last);
  if (lineEnd < 0) lineEnd = v.length;
  const lines = v.slice(lineStart, lineEnd).split('\n');
  const removed = [];
  const out = lines.map((l) => {
    if (!outdent) return INDENT + l;
    const m = /^( {1,2}|\t)/.exec(l);
    removed.push(m ? m[0].length : 0);
    return m ? l.slice(m[0].length) : l;
  });
  const text = out.join('\n');
  if (text === lines.join('\n')) return;
  replaceRange(ta, lineStart, lineEnd, text);
  if (lines.length > 1) ta.setSelectionRange(lineStart, lineStart + text.length);
  else if (outdent) ta.setSelectionRange(Math.max(lineStart, s - removed[0]), Math.max(lineStart, e - removed[0]));
  else ta.setSelectionRange(s + INDENT.length, e + INDENT.length);
}

/** Modifier keys (a Shift+Tab begins with a Shift keydown). */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);
/** Was the last key pressed (modifiers aside, no pointer press since) a Tab? */
let lastKeyTab = false;
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => { if (!MODIFIERS.has(e.key)) lastKeyTab = e.key === 'Tab'; }, true);
  document.addEventListener('pointerdown', () => { lastKeyTab = false; }, true);
}

/**
 * The script keys on a text area. Tab / Shift+Tab indent / outdent by two spaces where they
 * indent — when several lines are selected (each line), or when the caret (or a selection on one
 * line) is in the line's indentation, anywhere from its start up to its first character (with no
 * selection Tab inserts two spaces; Shift+Tab only where there is indentation to take away).
 * Elsewhere — the caret after a line's first character — they move the focus to the next /
 * previous field, as do Tab / Shift+Tab in a field just reached with the keyboard, until you type,
 * move the caret or click in it: the keyboard never gets stuck in a script. Enter keeps the line's
 * indentation (+2 after a block header). `onSubmit` (optional): Ctrl+Enter.
 * @param {HTMLTextAreaElement} ta
 * @param {{ onSubmit?: () => void }} [opts]
 */
export function attachScriptKeys(ta, { onSubmit = null } = {}) {
  ta.spellcheck = false;
  ta.setAttribute('spellcheck', 'false');
  ta.setAttribute('autocapitalize', 'off');
  ta.setAttribute('autocomplete', 'off');
  // reached with Tab / Shift+Tab: those keys pass on until the field is used
  let passTab = false;
  ta.addEventListener('focus', () => { passTab = lastKeyTab; });
  ta.addEventListener('pointerdown', () => { passTab = false; });
  ta.addEventListener('input', () => { passTab = false; });
  /** Does this Tab / Shift+Tab indent / outdent here (else the focus moves on)? @param {KeyboardEvent} e */
  const tabIndents = (e) => {
    if (passTab || e.ctrlKey || e.metaKey || e.altKey) return false;
    const v = ta.value;
    const s = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    const several = v.slice(s, end).includes('\n');
    // the caret after the line's first character: Tab is not for indenting here
    if (!several && /\S/.test(v.slice(lineStart, s))) return false;
    if (!e.shiftKey) return true;
    // Shift+Tab outdents only lines that have indentation to take away
    const last = end > s && v[end - 1] === '\n' ? end - 1 : end;
    let lineEnd = v.indexOf('\n', last);
    if (lineEnd < 0) lineEnd = v.length;
    return /^[ \t]/m.test(v.slice(lineStart, lineEnd));
  };
  // inside a dialog, its focus trap leaves the Tabs that indent to this field (Dialog.js)
  keepKeys(ta, { tab: tabIndents });
  ta.addEventListener('keydown', (e) => {
    if (!MODIFIERS.has(e.key) && e.key !== 'Tab') passTab = false;
    if (e.isComposing || e.altKey) return;
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
      // (not an indenting Tab: the browser moves the focus on)
      if (!tabIndents(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.shiftKey && ta.selectionStart === ta.selectionEnd) replaceRange(ta, ta.selectionStart, ta.selectionEnd, INDENT);
      else shiftLines(ta, e.shiftKey);
      return;
    }
    if (e.key !== 'Enter') return;
    if ((e.ctrlKey || e.metaKey) && onSubmit) {
      e.preventDefault();
      e.stopPropagation();
      onSubmit();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    const v = ta.value;
    const s = ta.selectionStart;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    const before = v.slice(lineStart, s);
    const indent = /^[ \t]*/.exec(before)[0];
    const more = BLOCK_HEADER.test(before.trim()) ? INDENT : '';
    replaceRange(ta, s, ta.selectionEnd, `\n${indent}${more}`);
  });
}

/**
 * Select line `line` (1-based) of a text area and scroll it into view.
 * @param {HTMLTextAreaElement} ta
 * @param {number} line
 */
export function selectLine(ta, line) {
  const v = ta.value;
  let a = 0;
  for (let k = 1; k < line && a >= 0; k++) {
    const n = v.indexOf('\n', a);
    a = n < 0 ? v.length : n + 1;
  }
  let b = v.indexOf('\n', a);
  if (b < 0) b = v.length;
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(a, b);
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 18;
  ta.scrollTop = Math.max(0, (line - 1) * lh - ta.clientHeight / 3);
}

/**
 * Fill an error list: `max` errors (all when omitted) as "line N: msg" buttons that select that
 * line in `ta`, then "+n more".
 * @param {HTMLElement} list
 * @param {ScriptError[]} errors
 * @param {() => HTMLTextAreaElement} target  the text area to jump in
 * @param {number} [max]
 */
export function fillErrors(list, errors, target, max = Infinity) {
  // a problem button with the keyboard focus (reached with Tab) keeps it: the button now in its
  // place (or the last one) takes it over
  const focused = list.contains(document.activeElement) ? [...list.children].indexOf(/** @type {Element} */ (document.activeElement)) : -1;
  clear(list);
  list.hidden = !errors.length;
  for (const err of errors.slice(0, max)) {
    list.appendChild(h('button', {
      class: 'le-script-error', type: 'button', title: tr('story.errors.goToLine', { line: err.line }),
      onPointerdown: (e) => e.preventDefault(),
      onClick: () => selectLine(target(), err.line),
    }, h('span', { class: 'le-script-error-line' }, tr('story.errors.line', { line: err.line })), ' ', err.msg));
  }
  if (errors.length > max) list.appendChild(h('div', { class: 'le-script-more' }, tr('story.errors.more', { n: errors.length - max })));
  if (focused >= 0) {
    const btns = list.querySelectorAll('.le-script-error');
    /** @type {HTMLElement|undefined} */ (btns[Math.min(focused, btns.length - 1)])?.focus({ preventScroll: true });
  }
}

/** A help text with its `quoted` parts as code. @param {string} text */
const withCode = (text) => text.split('`').map((part, k) => (k % 2 ? h('code', null, part) : part));

/** Short reference of the line kinds (StoryScript.js header): the syntax and its description's key. */
const LINE_KINDS = [
  ['Name: text', 'story.kinds.dialogue'],
  ['- text', 'story.kinds.more'],
  [': text', 'story.kinds.narrator'],
  ['> label', 'story.kinds.option'],
  ['* text', 'story.kinds.alternative'],
  ['# text', 'story.kinds.comment'],
  ['${gold}', 'story.kinds.value'],
];

/**
 * A command's help as the reference shows it: the engine's own (English), or its translation
 * where the editor's table has one.
 * @param {string} name
 * @param {{ help: string }} c
 */
function commandHelp(name, c) {
  const key = `story.cmd.${name}.help`;
  return editorLang() === 'zh' && Object.hasOwn(storyStrings.zh, key) ? tr(key) : c.help;
}

/**
 * The pop-out script editor: a wide modal with a line-number gutter, the script keys, the full
 * error list and the command reference. Resolves the new lines on Apply, null on Cancel — and
 * null on an Apply that changes nothing: the text as it opened (nothing is rewritten, no undo
 * step), or, for a mixed selection (`mixed`: it opens empty), a text without a line (it would
 * erase every selected script). Esc / × ask before they drop a changed text; Esc in the command
 * filter clears the filter.
 * @param {{ title: string, text: string, mixed?: boolean }} opts
 * @returns {Promise<string[]|null>}
 */
export function scriptEditorDialog({ title, text, mixed = false }) {
  const ta = /** @type {HTMLTextAreaElement} */ (h('textarea', {
    class: 'le-input le-script-text', wrap: 'off', rows: 24,
    placeholder: mixed ? tr('story.editor.mixedPlaceholder') : tr('story.editor.placeholder'),
  }));
  ta.value = text;
  ta.setAttribute('autofocus', '');
  const gutter = h('div', { class: 'le-script-gutter', 'aria-hidden': 'true' });
  const status = h('div', { class: 'le-script-status' });
  const errors = h('div', { class: 'le-script-errors le-scroll' });
  const filter = /** @type {HTMLInputElement} */ (h('input', { class: 'le-input le-script-filter', type: 'search', placeholder: tr('story.editor.filter') }));
  filter.setAttribute('spellcheck', 'false');
  // (Enter in the filter does not apply the dialog; Esc clears a filter instead of closing)
  filter.dataset.keepsEnter = '1';
  keepKeys(filter, { escape: () => filter.value !== '' });
  filter.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !filter.value) return;
    e.preventDefault();
    e.stopPropagation();
    filter.value = '';
    fillCmds();
  });
  const cmds = h('div', { class: 'le-script-cmds le-scroll' });
  const insert = (word) => {
    const v = ta.value;
    const s = ta.selectionStart;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    // at the start of a blank line: the command; elsewhere: a new line with the line's indentation
    const cur = v.slice(lineStart, s);
    const text = cur.trim() ? `\n${/^[ \t]*/.exec(cur)[0]}${word} ` : `${word} `;
    replaceRange(ta, s, ta.selectionEnd, text);
  };
  const fillCmds = () => {
    const q = filter.value.trim().toLowerCase();
    clear(cmds);
    for (const [name, c] of Object.entries(SCRIPT_COMMANDS)) {
      const help = commandHelp(name, c);
      if (q && !name.includes(q) && !c.help.toLowerCase().includes(q) && !help.toLowerCase().includes(q)) continue;
      cmds.appendChild(h('button', {
        class: 'le-script-cmd', type: 'button', title: tr('story.editor.insert', { name }),
        onPointerdown: (e) => e.preventDefault(),
        onClick: () => insert(name),
      }, h('div', { class: 'le-script-cmd-sig' }, h('b', null, name), c.args ? ` ${c.args}` : ''), h('div', { class: 'le-script-cmd-help' }, withCode(help))));
    }
    if (!cmds.childElementCount) cmds.appendChild(h('div', { class: 'le-empty' }, tr('story.editor.noMatch')));
  };
  filter.addEventListener('input', fillCmds);
  fillCmds();
  let lastCount = -1;
  let lastErrKey = '';
  const update = () => {
    const { errors: errs } = parseScript(ta.value);
    const n = scriptValue(ta.value).length;
    const total = ta.value.split('\n').length;
    // gutter: one number per text line, error lines marked
    const errKey = errs.map((x) => x.line).join(',');
    if (total !== lastCount || errKey !== lastErrKey) {
      lastCount = total;
      lastErrKey = errKey;
      const bad = new Set(errs.map((x) => x.line));
      const frag = document.createDocumentFragment();
      for (let k = 1; k <= total; k++) frag.appendChild(h('div', { class: bad.has(k) ? 'is-error' : null }, String(k)));
      clear(gutter).appendChild(frag);
    }
    gutter.scrollTop = ta.scrollTop;
    status.textContent = `${trn('story.editor.lines', n)} · ${errs.length ? trn('story.editor.problems', errs.length) : tr('story.editor.noProblems')}`;
    status.classList.toggle('is-warn', errs.length > 0);
    fillErrors(errors, errs, () => ta);
  };
  ta.addEventListener('input', update);
  ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });
  update();
  let dlg = null;
  attachScriptKeys(ta, { onSubmit: () => dlg?.button('Apply')?.click() });
  const content = h('div', { class: 'le-script-pop' },
    h('div', { class: 'le-script-main' },
      h('div', { class: 'le-script-edit' }, gutter, ta),
      status,
      errors),
    h('aside', { class: 'le-script-ref' },
      h('div', { class: 'le-script-ref-title' }, tr('story.editor.refLines')),
      h('div', { class: 'le-script-kinds' }, LINE_KINDS.map(([k, t]) => h('div', { class: 'le-script-kind' }, h('code', null, k), h('span', null, tr(t))))),
      h('div', { class: 'le-script-ref-title' }, tr('story.editor.refCommands'), h('span', { class: 'le-dim' }, tr('story.editor.clickToInsert'))),
      filter,
      cmds));
  let result = null;
  dlg = showDialog({
    title, icon: ICONS.pencil, width: 1180, className: 'is-script-dialog',
    subtitle: tr('story.editor.subtitle'),
    content,
    buttons: [
      { key: 'Cancel', label: tr('common.cancel'), value: null },
      {
        key: 'Apply', label: tr('common.apply'), primary: true,
        onClick: () => {
          const t = ta.value;
          // unchanged: nothing is written; a mixed selection's empty text would erase every script
          result = t === text || (mixed && !scriptValue(t).length) ? null : scriptValue(t);
        },
      },
    ],
    // Esc / ×: a changed text is not dropped without asking
    beforeClose: async () => ta.value === text || (await confirmDialog({
      title: tr('story.editor.discardTitle'), message: tr('story.editor.discardMessage'),
      buttons: [
        { key: 'Keep editing', label: tr('story.editor.keepEditing'), value: false, primary: true },
        { key: 'Discard', label: tr('story.editor.discard'), value: true, danger: true },
      ],
    })) === true,
  });
  return dlg.result.then((r) => (r === 'Apply' ? result : null));
}

/** The pop-out button of a script field. */
export function popOutButton(onClick) {
  return h('button', {
    class: 'le-mini-btn le-script-pop-btn', type: 'button', title: tr('story.editor.popOut'), 'aria-label': tr('story.editor.popOutAria'),
    onClick: (e) => { e.preventDefault(); e.stopPropagation(); onClick(); },
  }, icon(ICONS.external));
}
