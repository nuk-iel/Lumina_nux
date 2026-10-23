/**
 * Tiny DOM helpers shared by the editor panels (no framework).
 */
import { tr, editorLang } from '../i18n.js';

/**
 * Create an element.
 *   h('button', { class: 'btn', title: 'Save', onClick: fn, dataset: { id: 'x' } }, 'Save')
 * Props: `class` / `className`, `style` (string or object), `dataset`, `html` (innerHTML),
 * `text`, `on<Event>` listeners, `attrs` (raw attributes); anything else is set as a property
 * when the element has it, otherwise as an attribute. Children may be nodes, strings, numbers,
 * arrays or null / false (skipped).
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, any>|null} [props]
 * @param {...any} children
 * @returns {HTMLElementTagNameMap[K]} the element of that tag (`h('input')` is an HTMLInputElement)
 */
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
      } else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'attrs') for (const [ak, av] of Object.entries(v)) { if (av != null && av !== false) el.setAttribute(ak, av === true ? '' : av); }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && !k.includes('-')) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** An element holding an inline SVG icon string. */
export function icon(svg, cls = 'le-icon') {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = svg;
  return span;
}

/** Remove all children. */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Is `el` a text-entry control (typing must not trigger shortcuts)? */
export function isTypingTarget(el) {
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (el.type || 'text').toLowerCase();
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
}

/** 1536 → "1.5 KB". */
export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Relative "3 min ago" for recent times, otherwise a short local date. */
export function formatTime(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = Date.now() - ms;
  if (d < 45e3) return tr('panels.time.justNow');
  if (d < 3600e3) return tr('panels.time.minAgo', { n: Math.round(d / 60e3) });
  if (d < 86400e3) return tr('panels.time.hAgo', { n: Math.round(d / 3600e3) });
  const date = new Date(ms);
  // (English: the browser's locale, as before; Chinese: the editor's)
  const locale = editorLang() === 'zh' ? 'zh-CN' : undefined;
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' +
    date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/** Format a number compactly (trailing zeros trimmed). */
export function fmt(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return String(Number(Number(n).toFixed(digits)));
}

/** Platform-aware shortcut label: "Ctrl+Shift+S" → "⌘⇧S" on macOS. */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export function shortcutLabel(s) {
  if (!s) return '';
  if (!IS_MAC) return s;
  return s.replace(/Ctrl\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥');
}

/** Tooltip text "Label (Shortcut)". */
export const tip = (label, shortcut) => (shortcut ? tr('panels.tip', { label, key: shortcutLabel(shortcut) }) : label);
