/**
 * Modal dialogs: a promise-based `showDialog` plus `confirmDialog` / `alertDialog` helpers.
 * Escape and × dismiss (a `beforeClose` hook may keep the dialog open: unsaved changes), Enter
 * triggers the primary button (outside text areas and fields marked `data-keeps-enter`), focus is
 * kept inside the dialog and restored afterwards. A field can keep Tab or Escape for itself while
 * it uses them (`keepKeys`: a script text indents with Tab, a filter box clears with Escape).
 */
import { h, icon } from './dom.js';
import { ICONS } from '../icons.js';
import { tr } from '../i18n.js';

const stack = [];

/**
 * Keys fields handle themselves inside a dialog: field → { tab?, escape? }, each telling whether
 * this key event belongs to the field (else the dialog's own Tab / Escape handling runs).
 * @type {WeakMap<EventTarget, { tab?: (e: KeyboardEvent) => boolean, escape?: (e: KeyboardEvent) => boolean }>}
 */
const ownKeys = new WeakMap();

/**
 * Let a field keep Tab and / or Escape inside a dialog while `tab(e)` / `escape(e)` say so — a
 * script text indenting a line, a filter box clearing its text; the field's own keydown handler
 * then acts. Otherwise the dialog moves the focus (Tab) or dismisses (Escape) as usual.
 * @param {HTMLElement} el
 * @param {{ tab?: (e: KeyboardEvent) => boolean, escape?: (e: KeyboardEvent) => boolean }} tests
 */
export function keepKeys(el, tests) {
  ownKeys.set(el, { ...ownKeys.get(el), ...tests });
}

/** Is any modal dialog open? */
export const dialogOpen = () => stack.length > 0;

/** How the user last interacted ('pointer' | 'keyboard'): dialogs opened by the mouse do not hand
 *  the focus back to the button that opened them (Enter would re-open / re-run it). */
let modality = 'pointer';
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { modality = 'pointer'; }, true);
  document.addEventListener('keydown', (e) => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) modality = 'keyboard'; }, true);
}

const isTextEntry = (el) => el?.tagName === 'TEXTAREA' || el?.isContentEditable
  || (el?.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes((el.type || 'text').toLowerCase()));

/**
 * A footer button.
 * @typedef {object} DialogButton
 * @property {string} label  the text shown (translated)
 * @property {string} [key]  the button's identity, independent of the language: `dlg.button(key)`
 *   finds it and it resolves the dialog when there is no `value` (default: the label). Callers
 *   that compare the result or look a button up give the English word ('Save', 'Apply' …).
 * @property {any} [value]  resolves the dialog (default: the key)
 * @property {boolean} [primary]
 * @property {boolean} [danger]
 * @property {boolean} [left]  puts it on the left of the footer
 * @property {boolean} [disabled]
 * @property {string} [icon]  an inline SVG string shown before the label
 * @property {(dlg) => (boolean|void|Promise<boolean|void>)} [onClick]  runs first; returning false
 *   keeps the dialog open (the buttons are busy while it runs)
 */

/**
 * @param {{ title: string, icon?: string, content?: Node|Node[], className?: string, width?: number,
 *           buttons?: DialogButton[], dismissible?: boolean, onOpen?: (dlg) => void,
 *           subtitle?: string, beforeClose?: () => (boolean|void|Promise<boolean|void>) }} opts
 *   beforeClose: runs when Escape or × would dismiss the dialog (not for its buttons or
 *   `close()`); returning false keeps it open — e.g. after asking "Discard changes?"
 * @returns {{ el: HTMLElement, body: HTMLElement, close(value?: any): void, result: Promise<any>,
 *             button(key: string): HTMLButtonElement|undefined, setBusy(b: boolean): void }}
 *   button: by the button's `key` (else its label)
 */
export function showDialog(opts) {
  const prevFocus = /** @type {HTMLElement|null} */ (document.activeElement);
  const openedBy = modality;
  let resolve;
  const result = new Promise((r) => { resolve = r; });
  const buttons = new Map();
  const body = h('div', { class: 'le-dialog-body' }, opts.content ?? null);
  const footer = h('div', { class: 'le-dialog-footer' });
  const left = h('div', { class: 'le-dialog-footer-left' });
  const right = h('div', { class: 'le-dialog-footer-right' });
  footer.append(left, right);
  const titleId = `le-dlg-${Math.random().toString(36).slice(2, 8)}`;
  const panel = h('div', {
    class: ['le-dialog', opts.className], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId,
    style: opts.width ? { width: `min(${opts.width}px, calc(100vw - 32px))` } : null,
  },
  h('header', { class: 'le-dialog-header' },
    opts.icon ? icon(opts.icon, 'le-icon le-dialog-icon') : null,
    h('div', { class: 'le-dialog-titles' },
      h('h2', { id: titleId, class: 'le-dialog-title' }, opts.title),
      opts.subtitle ? h('div', { class: 'le-dialog-subtitle' }, opts.subtitle) : null),
    opts.dismissible === false ? null : h('button', { class: 'le-icon-btn le-dialog-close', type: 'button', title: tr('common.closeEsc'), onClick: () => dismiss() }, icon(ICONS.close))),
  body,
  (opts.buttons?.length ? footer : null));
  const overlay = h('div', { class: 'le-overlay' }, panel);
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay && opts.dismissible !== false) {
      panel.classList.remove('is-shake');
      void panel.offsetWidth;
      panel.classList.add('is-shake');
    }
  });

  let busy = false;
  const dlg = {
    el: panel,
    body,
    result,
    close(value = null) {
      const k = stack.indexOf(dlg);
      if (k < 0) return;
      stack.splice(k, 1);
      overlay.classList.add('is-closing');
      setTimeout(() => overlay.remove(), 140);
      document.removeEventListener('keydown', onKey, true);
      // keyboard users get their focus back; after a mouse-opened dialog the focus goes to the
      // page (a focused toolbar button would re-run on Enter), unless it was a text field
      if (prevFocus && document.contains(prevFocus) && (openedBy === 'keyboard' || isTextEntry(prevFocus) || prevFocus.closest?.('.le-dialog'))) prevFocus.focus?.({ preventScroll: true });
      else if (document.activeElement && panel.contains(document.activeElement)) /** @type {HTMLElement} */ (document.activeElement).blur?.();
      resolve(value);
    },
    button: (key) => buttons.get(key),
    setBusy(b) {
      busy = b;
      panel.classList.toggle('is-busy', b);
      for (const btn of buttons.values()) btn.disabled = b || btn.dataset.disabled === '1';
    },
  };

  /** Escape / ×: close with null, unless `beforeClose` keeps the dialog open. */
  let asking = false;
  async function dismiss() {
    if (opts.dismissible === false || asking || stack.indexOf(dlg) < 0) return;
    if (opts.beforeClose) {
      let ok = false;
      asking = true;
      try {
        ok = (await opts.beforeClose()) !== false;
      } catch (err) {
        console.warn('[editor] dialog beforeClose failed:', err);
      } finally {
        asking = false;
      }
      if (!ok) return;
    }
    dlg.close(null);
  }

  for (const b of opts.buttons ?? []) {
    const btn = h('button', {
      class: ['le-btn', b.primary && 'is-primary', b.danger && 'is-danger'], type: 'button', disabled: !!b.disabled,
      dataset: { disabled: b.disabled ? '1' : '0' },
      onClick: async () => {
        if (busy) return;
        if (b.onClick) {
          let r;
          try {
            dlg.setBusy(true);
            r = await b.onClick(dlg);
          } catch (err) {
            // keep the dialog open; never leak an unhandled rejection from a click handler
            console.warn('[editor] dialog action failed:', err);
            r = false;
          } finally {
            dlg.setBusy(false);
          }
          if (r === false) return;
        }
        dlg.close(b.value ?? b.key ?? b.label);
      },
    }, b.icon ? icon(b.icon) : null, b.label);
    if (b.primary) btn.dataset.primary = '1';
    buttons.set(b.key ?? b.label, btn);
    (b.left ? left : right).appendChild(btn);
  }

  function onKey(e) {
    if (stack[stack.length - 1] !== dlg) return;
    const own = ownKeys.get(e.target);
    if (e.key === 'Escape') {
      // a field that uses Escape now (a filter box clearing its text: keepKeys) keeps it
      if (own?.escape?.(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dismiss();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      const t = e.target;
      if (t?.tagName === 'TEXTAREA' || t?.tagName === 'SELECT' || t?.dataset?.keepsEnter) return;
      // a focused footer button, list row or tab keeps its own Enter; other buttons inside the
      // body (an anchor cell, a preset chip) do not swallow the dialog's confirmation
      if (t?.tagName === 'BUTTON' && (footer.contains(t) || t.closest('.le-file-list, .le-tabs, .le-dialog-header'))) return;
      if (t?.getAttribute?.('role') === 'option') return;
      const primary = [...buttons.values()].find((b) => b.dataset.primary === '1' && !b.disabled);
      const inside = !t || t === document.body || panel.contains(t);
      if (primary && inside) {
        e.preventDefault();
        e.stopPropagation();
        // commit the focused field first: number fields apply their value on 'change', which a
        // blur fires synchronously — Enter must never drop what was just typed
        const a = /** @type {HTMLElement|null} */ (document.activeElement);
        if (a && panel.contains(a) && a.tagName === 'INPUT') a.blur();
        if (stack[stack.length - 1] === dlg && !primary.disabled) primary.click();
      }
      return;
    }
    if (e.key === 'Tab') {
      // a field that uses this Tab (a script text indenting a line: keepKeys) keeps it
      if (own?.tab?.(e)) return;
      const f = [.../** @type {NodeListOf<HTMLElement>} */ (panel.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])'))].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  stack.push(dlg);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    const auto = /** @type {HTMLElement & { select?: () => void }} */ (panel.querySelector('[autofocus]') ?? panel.querySelector('.le-dialog-body input:not([type=checkbox]):not([type=radio]):not([type=range]), .le-dialog-body textarea') ?? panel.querySelector('[data-primary="1"]'));
    auto?.focus({ preventScroll: true });
    if (auto?.select && auto.tagName === 'INPUT') auto.select();
  });
  opts.onOpen?.(dlg);
  return dlg;
}

/**
 * Yes / no style question. Resolves the chosen button's value (null = dismissed).
 * @param {{ title: string, message: string|Node, buttons?: DialogButton[], icon?: string,
 *   danger?: boolean, width?: number }} o  icon (warning), width (440 px); without `buttons`:
 *   Cancel / OK
 */
export function confirmDialog({ title, message, buttons = null, icon: ic = ICONS.warning, danger = false, width = 440 }) {
  return showDialog({
    title, icon: ic, width, className: 'is-confirm',
    content: typeof message === 'string' ? h('p', { class: 'le-dialog-text' }, message) : message,
    buttons: buttons ?? [
      { key: 'Cancel', label: tr('common.cancel'), value: false },
      { key: 'OK', label: tr('common.ok'), value: true, primary: !danger, danger },
    ],
  }).result;
}

/** A message with a single OK button (a list of lines renders as bullets). */
export function alertDialog({ title, message, lines = null, icon: ic = ICONS.info, width = 480 }) {
  const content = [
    message ? h('p', { class: 'le-dialog-text' }, message) : null,
    lines?.length ? h('ul', { class: 'le-dialog-list' }, lines.map((l) => h('li', null, l))) : null,
  ];
  return showDialog({ title, icon: ic, width, content, buttons: [{ key: 'OK', label: tr('common.ok'), value: true, primary: true }] }).result;
}
