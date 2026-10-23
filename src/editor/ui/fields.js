/**
 * Form controls for the inspector and dialogs: number (slider + input), toggle, select, text,
 * textarea, colour and segmented controls, plus `createFieldEditor`, which builds the right
 * control for an ObjectCatalog field schema entry — including the story fields: a script (the
 * script keys, its first problems, the pop-out editor: ./scriptEditor.js) and a condition (what
 * *Check for problems* says about it, under the field: the caller's `check`, else
 * `conditionProblem` by the field's rule).
 *
 * Every control returns `{ el, set(value, mixed?) }`. `set` never overwrites a control the user is
 * currently typing in.
 */
import { h, icon, fmt } from './dom.js';
import { ICONS } from '../icons.js';
import {
  parseDialogueText, dialogueToText, mergeDialogueText, mergeLinesText, linesToText, textToLines,
} from '../../engine/level/ObjectCatalog.js';
import { parseScript } from '../../engine/level/StoryScript.js';
import { conditionError } from '../../engine/level/StoryChecks.js';
import { attachScriptKeys, fillErrors, popOutButton, scriptEditorDialog, scriptText, scriptValue } from './scriptEditor.js';
import { tr, trn } from '../i18n.js';
import { optionLabel } from '../catalogI18n.js';

/**
 * @import { FieldDef } from '../../engine/level/types.js'
 * @import { ConditionRule } from '../../engine/level/StoryChecks.js'
 */

const DEG = 180 / Math.PI;
let uid = 0;
const nextId = () => `le-f${++uid}`;

const focusedIn = (el) => el.contains(document.activeElement);

/** Controls outside dialogs hand the keyboard back to the editor after a mouse edit (a focused
 *  slider / switch / dropdown would otherwise eat Space, arrows and the tool shortcuts). */
const inDialog = (el) => !!el.closest?.('.le-overlay, .le-dialog');
function releaseAfterPointer(el) {
  el.addEventListener('pointerup', () => setTimeout(() => {
    if (document.activeElement === el && !inDialog(el)) el.blur();
  }, 0));
}

/** A labelled row: label on the left (or on top for wide controls). */
export function fieldRow(label, control, { help = '', wide = false, id = '' } = {}) {
  return h('div', { class: ['le-field', wide && 'is-wide'], title: help || null },
    h('label', { class: 'le-field-label', htmlFor: id || null }, label),
    h('div', { class: 'le-field-control' }, control),
  );
}

/**
 * Number input with an optional slider.
 * @param {{ value:number|null, min?:number, max?:number, step?:number, int?:boolean, slider?:boolean,
 *           nullable?:boolean, placeholder?:string, suffix?:string, onInput?:(v)=>void,
 *           onChange:(v)=>void, onBegin?:()=>void, onEnd?:()=>void, id?:string,
 *           clamp?:boolean, wrap?:number }} o
 *   Typed values are clamped into [min, max] (clamp: false disables it); `wrap` (e.g. 360 for
 *   angles in [-180, 180]) wraps them around instead.
 */
export function numberControl(o) {
  const step = o.step ?? (o.int ? 1 : 0.1);
  const hasRange = o.slider !== false && Number.isFinite(o.min) && Number.isFinite(o.max);
  const id = o.id ?? nextId();
  const input = h('input', {
    class: 'le-input le-num', type: 'number', id, step: String(step), inputMode: 'decimal',
    min: Number.isFinite(o.min) ? String(o.min) : null, max: Number.isFinite(o.max) ? String(o.max) : null,
    placeholder: o.placeholder ?? (o.nullable ? tr('panels.field.auto') : ''),
  });
  const parse = (s) => {
    if (s === '' || s == null) return o.nullable ? null : undefined;
    let v = Number(s);
    if (!Number.isFinite(v)) return undefined;
    if (o.int) v = Math.round(v);
    return v;
  };
  /** Typed values: wrapped (angles) or clamped into [min, max] so schema ranges hold. */
  const limit = (v) => {
    if (v == null) return v;
    if (o.wrap > 0 && Number.isFinite(o.min)) {
      v = ((((v - o.min) % o.wrap) + o.wrap) % o.wrap) + o.min;
      if (Number.isFinite(o.max) && v > o.max) v -= o.wrap;
      if (v === o.min && o.max - o.min === o.wrap) v = o.max; // (-180, 180]
      return Number(v.toFixed(4));
    }
    if (o.clamp === false) return v;
    if (Number.isFinite(o.min)) v = Math.max(o.min, v);
    if (Number.isFinite(o.max)) v = Math.min(o.max, v);
    return v;
  };
  let range = null;
  let sliding = false;
  if (hasRange) {
    range = h('input', { class: 'le-range', type: 'range', min: String(o.min), max: String(o.max), step: String(step), tabIndex: -1, 'aria-hidden': 'true' });
    // A drag on the slider is one undoable edit: onBegin at pointer-down, live onInput while
    // dragging, onEnd once the pointer is released (even if the value never changed).
    range.addEventListener('pointerdown', () => {
      if (!sliding) { sliding = true; o.onBegin?.(); }
      const up = () => {
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
        window.removeEventListener('blur', up);
        setTimeout(() => { if (sliding) { sliding = false; o.onEnd?.(); } }, 0);
      };
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', up, true);
      // the release may never arrive once the window lost focus: end the edit anyway
      window.addEventListener('blur', up);
    });
    releaseAfterPointer(range);
    range.addEventListener('input', () => {
      const v = parse(range.value);
      if (v === undefined) return;
      input.value = fmt(v, 4);
      paintRange();
      if (sliding) (o.onInput ?? o.onChange)(v);
      else o.onChange(v);
    });
  }
  const paintRange = () => {
    if (!range) return;
    const v = Number(range.value);
    const k = (v - o.min) / (o.max - o.min || 1);
    range.style.setProperty('--k', `${Math.max(0, Math.min(1, k)) * 100}%`);
  };
  input.addEventListener('change', () => {
    let v = parse(input.value);
    if (v === undefined) { set(last); return; }
    v = limit(v);
    if (v != null && String(v) !== input.value) input.value = fmt(v, 4);
    if (range && v != null) { range.value = String(v); paintRange(); }
    o.onChange(v);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { input.blur(); }
    if (e.key === 'Escape') { set(last); input.blur(); e.stopPropagation(); }
  });
  // wheel over a focused input nudges the value
  input.addEventListener('wheel', (e) => {
    if (document.activeElement !== input) return;
    e.preventDefault();
    const cur = parse(input.value) ?? o.min ?? 0;
    let v = cur + (e.deltaY < 0 ? step : -step);
    if (Number.isFinite(o.min)) v = Math.max(o.min, v);
    if (Number.isFinite(o.max)) v = Math.min(o.max, v);
    v = Number(v.toFixed(4));
    input.value = fmt(v, 4);
    o.onChange(v);
  }, { passive: false });

  const clearBtn = o.nullable ? h('button', { class: 'le-mini-btn', type: 'button', title: tr('panels.field.clearAuto'), onClick: () => { input.value = ''; o.onChange(null); } }, icon(ICONS.close)) : null;
  const el = h('div', { class: ['le-numctl', range && 'has-range'] }, range, h('div', { class: 'le-num-wrap' }, input, o.suffix ? h('span', { class: 'le-suffix' }, o.suffix) : null), clearBtn);
  let last = o.value;
  function set(v, mixed = false) {
    last = v;
    if (focusedIn(input.parentElement) && document.activeElement === input) return;
    input.value = mixed ? '' : v == null ? '' : fmt(v, 4);
    input.placeholder = mixed ? tr('panels.field.mixed') : (o.placeholder ?? (o.nullable ? tr('panels.field.auto') : ''));
    if (range && !sliding) {
      range.value = String(v ?? o.min);
      paintRange();
    }
  }
  set(o.value);
  return { el, input, set };
}

/** Toggle switch. */
export function boolControl({ value, onChange, label = '', id = nextId() }) {
  const input = h('input', { type: 'checkbox', class: 'le-switch-input', id });
  const el = h('label', { class: 'le-switch', htmlFor: id }, input, h('span', { class: 'le-switch-track' }, h('span', { class: 'le-switch-thumb' })), label ? h('span', { class: 'le-switch-label' }, label) : null);
  input.addEventListener('change', () => { input.indeterminate = false; onChange(input.checked); });
  // a click on the switch (or its label) leaves no focus behind outside dialogs
  el.addEventListener('click', (e) => {
    if (e.detail === 0) return;
    setTimeout(() => { if (document.activeElement === input && !inDialog(el)) input.blur(); }, 0);
  });
  const set = (v, mixed = false) => {
    // a hand-edited value that is neither true nor false ("true", 1) shows neither: what it means
    // is up to the field's reader (an event's `background` reads `=== true`, KNOWN_ISSUES STORY-17)
    const odd = !mixed && v != null && typeof v !== 'boolean';
    input.checked = v === true;
    input.indeterminate = mixed || odd;
    el.classList.toggle('is-mixed', mixed || odd);
    if (odd) el.title = tr('panels.field.notBool', { value: JSON.stringify(v) });
    else el.removeAttribute('title');
  };
  set(value);
  return { el, input, set };
}

/** <select>; options: string[] or {value,label}[]. */
export function selectControl({ value, options, onChange, id = nextId() }) {
  const sel = h('select', { class: 'le-input le-select', id });
  for (const opt of options) {
    const v = typeof opt === 'object' ? opt.value : opt;
    const label = typeof opt === 'object' ? opt.label : opt === '' ? tr('panels.field.none') : optionLabel(opt);
    sel.appendChild(h('option', { value: v }, label));
  }
  const mixedOpt = h('option', { value: '__mixed__', disabled: true, hidden: true }, tr('panels.field.mixedOption'));
  sel.appendChild(mixedOpt);
  sel.addEventListener('change', () => {
    if (sel.value !== '__mixed__') onChange(sel.value);
    // outside dialogs the dropdown hands the keyboard back once a value is picked (arrows would
    // keep changing it and the tool / layout shortcuts would be ignored)
    if (!inDialog(sel)) sel.blur();
  });
  // A dropdown opened with the mouse and closed without a pick (Esc, a click elsewhere) keeps the
  // focus: the next key reaches it only once its popup is closed. Outside dialogs such a key
  // belongs to the editor (a tool / layout key, arrows nudging the selection…), not to the
  // dropdown — it is handed back instead of changing the value. Keyboard users (Tab) keep the
  // normal dropdown keys.
  let byPointer = false;
  sel.addEventListener('pointerdown', () => { byPointer = true; });
  sel.addEventListener('blur', () => { byPointer = false; });
  sel.addEventListener('keydown', (e) => {
    if (inDialog(sel)) return;
    if (e.key === 'Escape') { sel.blur(); e.stopPropagation(); return; }
    if (!byPointer || e.key === 'Tab' || ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key) || e.isComposing) return;
    sel.blur();
    // copy / cut / paste run as the browser's default action (DOM clipboard events on the page)
    if ((e.ctrlKey || e.metaKey) && /^[cxv]$/i.test(e.key)) return;
    e.preventDefault();
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: e.key, code: e.code, location: e.location, repeat: e.repeat,
      ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, bubbles: true, cancelable: true,
    }));
  });
  const set = (v, mixed = false) => { sel.value = mixed ? '__mixed__' : (v ?? ''); };
  set(value);
  return { el: h('div', { class: 'le-select-wrap' }, sel, icon(ICONS.chevronDown, 'le-icon le-select-caret')), input: sel, set };
}

/** Single-line or multi-line text. Commits on change (blur / Enter), not on every keystroke. */
export function textControl({ value, onChange, multiline = false, rows = 3, placeholder = '', mono = false, id = nextId(), maxLength = null, onInput = null }) {
  const el = multiline
    ? h('textarea', { class: ['le-input le-textarea', mono && 'is-mono'], rows, placeholder, id, spellcheck: true })
    : h('input', { class: 'le-input', type: 'text', placeholder, id, spellcheck: false, maxLength: maxLength ?? null });
  let last = value ?? '';
  el.addEventListener('change', () => { if (el.value !== last) { last = el.value; onChange(el.value); } });
  if (onInput) el.addEventListener('input', () => onInput(el.value));
  el.addEventListener('keydown', /** @param {KeyboardEvent} e */ (e) => {
    if (!multiline && e.key === 'Enter') el.blur();
    if (e.key === 'Escape') { el.value = last; el.blur(); e.stopPropagation(); }
    if (multiline && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) el.blur();
  });
  const set = (v, mixed = false) => {
    // (mixed: the field shows blank, and Esc puts the blank back — never the first object's value)
    last = mixed ? '' : (v ?? '');
    if (document.activeElement === el) return;
    el.value = mixed ? '' : (v ?? '');
    el.placeholder = mixed ? tr('panels.field.mixed') : placeholder;
  };
  set(value);
  return { el, input: el, set };
}

/** Colour swatch + hex input. */
export function colorControl({ value, onChange, id = nextId() }) {
  const picker = h('input', { type: 'color', class: 'le-color', id });
  const hex = h('input', { class: 'le-input le-hex', type: 'text', maxLength: 7, spellcheck: false });
  picker.addEventListener('input', () => { hex.value = picker.value; });
  picker.addEventListener('change', () => { hex.value = picker.value; onChange(picker.value); });
  hex.addEventListener('change', () => {
    let v = hex.value.trim();
    if (!v.startsWith('#')) v = `#${v}`;
    if (/^#[0-9a-f]{3}$/i.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    if (!/^#[0-9a-f]{6}$/i.test(v)) { set(picker.value); return; }
    picker.value = v.toLowerCase();
    onChange(v.toLowerCase());
  });
  hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') hex.blur(); });
  const set = (v, mixed = false) => {
    const c = /^#[0-9a-f]{6}$/i.test(v ?? '') ? v : '#ffffff';
    picker.value = c;
    if (document.activeElement !== hex) hex.value = mixed ? '' : c;
  };
  set(value);
  return { el: h('div', { class: 'le-colorctl' }, h('span', { class: 'le-color-wrap' }, picker), hex), input: hex, set };
}

/**
 * Segmented buttons. options: [{ value, label?, icon?, title? }].
 */
export function segmented({ options, value, onChange, small = false, className = '' }) {
  const btns = new Map();
  const el = h('div', { class: ['le-seg', small && 'is-small', className], role: 'radiogroup' });
  for (const opt of options) {
    const b = h('button', {
      class: 'le-seg-btn', type: 'button', title: opt.title ?? opt.label ?? '', role: 'radio',
      onClick: () => { set(opt.value); onChange(opt.value); },
    }, opt.icon ? icon(opt.icon) : null, opt.label && !opt.iconOnly ? h('span', null, opt.label) : null);
    btns.set(opt.value, b);
    el.appendChild(b);
  }
  function set(v) {
    for (const [k, b] of btns) { b.classList.toggle('is-active', k === v); b.setAttribute('aria-checked', k === v ? 'true' : 'false'); }
  }
  set(value);
  return { el, set };
}


/**
 * Build an editor for a catalog field schema entry.
 * @param {FieldDef & { slider?: boolean }} field
 *   { key, label, type, min, max, step, options, nullable, help } (plus `slider: false` from
 *   callers: a number field without its slider, e.g. a clamped 1..1 range)
 * @param {{ value: any, mixed?: boolean, apply: (v: any, live?: boolean) => void,
 *   begin?: () => void, end?: () => void, rule?: ConditionRule,
 *   check?: (text: string) => string[] }} ctx
 *   `apply` writes the value (callers wrap it in an undoable edit); `begin`/`end` bracket slider
 *   drags, whose live values arrive as `apply(v, true)` in between. A condition field: `check`
 *   gives the problems shown under it (what *Check for problems* says about that text); without
 *   it, `conditionProblem` by `rule` ('flag' when not given).
 * @returns {{ el: HTMLElement, set(value:any, mixed?:boolean):void, key:string }}
 */
export function createFieldEditor(field, ctx) {
  const id = nextId();
  let ctl;
  let wide = false;
  let extra = null;
  /** @type {HTMLElement|null} under the control (a script's problems, a condition's error) */
  let below = null;
  switch (field.type) {
    case 'number':
    case 'int':
      ctl = numberControl({
        id, value: ctx.value, min: field.min, max: field.max, step: field.step ?? (field.type === 'int' ? 1 : 0.1), int: field.type === 'int',
        nullable: !!field.nullable, slider: field.slider, onChange: (v) => ctx.apply(v), onInput: (v) => ctx.apply(v, true), onBegin: ctx.begin, onEnd: ctx.end,
      });
      break;
    case 'angle': {
      const inner = numberControl({
        id, value: ctx.value == null ? 0 : Math.round((ctx.value ?? 0) * DEG * 10) / 10, min: -180, max: 180, wrap: 360, step: field.step ?? 15, suffix: '°',
        onChange: (v) => ctx.apply(v == null ? 0 : v / DEG), onInput: (v) => ctx.apply(v / DEG, true), onBegin: ctx.begin, onEnd: ctx.end,
      });
      ctl = { el: inner.el, set: (v, mixed) => inner.set(v == null ? 0 : Math.round(v * DEG * 10) / 10, mixed) };
      break;
    }
    case 'bool':
      ctl = boolControl({ id, value: ctx.value, onChange: (v) => ctx.apply(v) });
      break;
    case 'select':
      ctl = selectControl({ id, value: ctx.value ?? '', options: field.options ?? [], onChange: (v) => ctx.apply(v) });
      break;
    case 'color':
      ctl = colorControl({ id, value: ctx.value, onChange: (v) => ctx.apply(v) });
      break;
    case 'textarea':
      wide = true;
      ctl = textControl({ id, value: ctx.value ?? '', multiline: true, rows: 3, onChange: (v) => ctx.apply(v) });
      break;
    case 'lines': {
      wide = true;
      const count = h('span', { class: 'le-field-meta' });
      const upd = (t) => { count.textContent = trn('panels.field.pages', textToLines(t).length); };
      // pages the edit did not touch are kept exactly as they were (see mergeLinesText)
      let cur = ctx.value;
      let mixedNow = !!ctx.mixed;
      const inner = textControl({ id, value: linesToText(ctx.value), multiline: true, rows: 4, placeholder: tr('panels.field.linesPlaceholder'), onChange: (t) => ctx.apply(mixedNow ? textToLines(t) : mergeLinesText(cur, t)), onInput: upd });
      upd(linesToText(ctx.value));
      extra = count;
      ctl = { el: inner.el, set: (v, mixed) => { cur = v; mixedNow = !!mixed; inner.set(linesToText(v), mixed); if (document.activeElement !== inner.el) upd(linesToText(v)); } };
      break;
    }
    case 'dialogue': {
      wide = true;
      const count = h('span', { class: 'le-field-meta' });
      const upd = (t) => {
        const d = parseDialogueText(t);
        const choices = d.filter((p) => typeof p === 'object').length;
        count.textContent = `${trn('panels.field.pages', d.length)}${choices ? ` · ${trn('panels.field.choices', choices)}` : ''}`;
      };
      // pages the edit did not touch are kept exactly as they were (see mergeDialogueText)
      let cur = ctx.value ?? [];
      let mixedNow = !!ctx.mixed;
      const inner = textControl({
        id, value: dialogueToText(ctx.value ?? []), multiline: true, rows: 6,
        placeholder: tr('panels.field.dialoguePlaceholder'),
        onChange: (t) => ctx.apply(mixedNow ? parseDialogueText(t) : mergeDialogueText(cur, t)), onInput: upd,
      });
      upd(dialogueToText(ctx.value ?? []));
      extra = count;
      ctl = { el: inner.el, set: (v, mixed) => { cur = v ?? []; mixedNow = !!mixed; inner.set(dialogueToText(v ?? []), mixed); if (document.activeElement !== inner.el) upd(dialogueToText(v ?? [])); } };
      break;
    }
    case 'script': {
      // a story script (src/engine/level/StoryScript.js): one line per array entry, parsed as
      // typed; Tab / Shift+Tab indent at a line's start or on selected lines (elsewhere they move
      // on), Enter keeps the indentation; the first problems are listed under it (a click selects
      // the line); ⤢ opens the wide editor
      wide = true;
      const count = h('span', { class: 'le-field-meta' });
      const issues = h('div', { class: 'le-script-errors is-inline', hidden: true });
      let mixedNow = !!ctx.mixed;
      // (the text the count and the problems show: a blur that changes nothing keeps the problem
      // buttons — Tab may just have moved the focus onto one)
      let shown = null;
      const upd = (t) => {
        if (t === shown) return;
        shown = t;
        const { errors } = parseScript(t);
        const n = scriptValue(t).length;
        count.textContent = `${trn('panels.field.lines', n)}${errors.length ? ` · ${trn('panels.field.problems', errors.length)}` : ''}`;
        count.classList.toggle('is-warn', errors.length > 0);
        fillErrors(issues, errors, () => /** @type {HTMLTextAreaElement} */ (inner.input), 3);
      };
      const inner = textControl({
        id, value: scriptText(ctx.value), multiline: true, rows: 8, mono: true,
        placeholder: tr('panels.field.scriptPlaceholder'),
        onChange: (t) => ctx.apply(scriptValue(t)), onInput: upd,
      });
      attachScriptKeys(/** @type {HTMLTextAreaElement} */ (inner.input), { onSubmit: () => inner.input.blur() });
      // (Esc puts the stored text back without an input event)
      inner.input.addEventListener('blur', () => upd(inner.input.value));
      upd(scriptText(ctx.value));
      const pop = popOutButton(async () => {
        const lines = await scriptEditorDialog({ title: field.label, text: inner.input.value, mixed: mixedNow && !inner.input.value });
        if (lines) ctx.apply(lines);
      });
      extra = h('span', { class: 'le-field-extras' }, count, pop);
      below = issues;
      ctl = {
        el: inner.el,
        set: (v, mixed) => {
          mixedNow = !!mixed;
          inner.set(scriptText(v), mixed);
          if (document.activeElement !== inner.input) upd(mixed ? '' : scriptText(v));
        },
      };
      break;
    }
    case 'condition': {
      // a story condition, read by its field's rule (the flag rule of `when` / `unless` /
      // `requires`: a bare name is a flag, a reserved word there one that can never be set; the
      // script rule of an event's `if`): what *Check for problems* says about it shows under the
      // field, one problem per line, without blocking the edit
      const issue = h('div', { class: 'le-field-issue', hidden: true });
      const check = (t) => {
        const msgs = ctx.check ? ctx.check(String(t ?? '')) : [conditionProblem(t, ctx.rule ?? 'flag')].filter(Boolean);
        issue.hidden = !msgs.length;
        issue.textContent = msgs.join('\n');
      };
      const inner = textControl({ id, value: ctx.value ?? '', onChange: (v) => ctx.apply(v), onInput: check, placeholder: tr('panels.field.conditionPlaceholder') });
      inner.input.setAttribute('spellcheck', 'false');
      inner.input.addEventListener('blur', () => check(/** @type {HTMLInputElement} */ (inner.input).value));
      check(ctx.value ?? '');
      below = issue;
      ctl = { el: inner.el, set: (v, mixed) => { inner.set(v, mixed); if (document.activeElement !== inner.input) check(mixed ? '' : (v ?? '')); } };
      break;
    }
    case 'text':
    default:
      ctl = textControl({ id, value: ctx.value ?? '', onChange: (v) => ctx.apply(v) });
      break;
  }
  if (ctx.mixed) ctl.set(ctx.value, true);
  const label = h('span', null, field.label, extra);
  const el = h('div', { class: ['le-field', wide && 'is-wide', `is-${field.type}`], title: field.help ? tr('panels.field.tip', { label: field.label, help: field.help }) : field.label },
    h('label', { class: 'le-field-label', htmlFor: id }, label),
    h('div', { class: 'le-field-control' }, ctl.el, below),
    wide && field.help ? h('div', { class: 'le-field-help' }, field.help) : null,
  );
  return { el, set: ctl.set, key: field.key };
}

/**
 * What is wrong with a story-condition field's text ('' when nothing) — the checks' own words
 * (`StoryChecks.conditionError`, which *Check for problems* reports): under the flag rule (`when`,
 * `unless`, an exit's `requires`) a bare name is a flag, so a reserved word alone (`gold`) is a
 * flag that can never be set and a text that does not parse is read as one flag; under the script
 * rule (an event's `if`) it must parse (`gold` reads the purse). Blank is fine.
 * @param {unknown} text
 * @param {ConditionRule} [rule]
 * @returns {string}
 */
export function conditionProblem(text, rule = 'flag') {
  return conditionError(text, rule);
}
