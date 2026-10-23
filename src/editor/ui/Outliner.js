/**
 * Outliner (right column, bottom): every object of the level grouped by type, with a filter,
 * per-type visibility (eye) toggles, click / Shift / Ctrl selection and double-click focus.
 * Objects the views hide (a type hidden with the eye, *View › Show objects* / *Show markers* off,
 * what the story preview hides) are dimmed: a click on such a row selects nothing and says why in
 * the status bar, a double-click turns the reason off and selects it (`actions.reveal`; a hidden
 * object is never selected: ../visibility.js).
 *
 * From the keyboard the list is one stop (Tab to it, or ↓ in the filter box): a `tree` whose
 * active item is its `aria-activedescendant`. ↑ / ↓ (Home / End, Page Up / Down) move through the
 * player start, the group headers and the rows; ← / → collapse / expand a group (← on a row goes
 * to its header); Enter or Space on a row does what a click does (Shift adds, Ctrl toggles), on a
 * header collapses it (Shift / Ctrl: selects its listed objects); F on a row does what a
 * double-click does (focus it; a dimmed row: show it again and select it). A click on a row makes
 * it the active item but takes the focus itself, as before: the keys then go to the app (the arrows
 * nudge the selection).
 */
import { h, icon } from './dom.js';
import { glyphBadge } from './ToolOptions.js';
import { ICONS } from '../icons.js';
import { OBJECT_TYPES, SPAWN_MARKER, objectCenter } from '../../engine/level/ObjectCatalog.js';
import { hiddenMessage, hiddenReasons, shownOnly, hiddenOnly, leftOutMessage, mayHide, isHidden, notifyHidden } from '../visibility.js';
import { tr, trn, editorLang } from '../i18n.js';
import { categoryLabel } from '../catalogI18n.js';
import catalogStrings from '../strings/catalog.js';

/**
 * @import { EditorState } from '../EditorState.js'
 * @import { LevelObject } from '../../engine/level/types.js'
 */

const ORDER = Object.keys(OBJECT_TYPES);

/** An element id for `aria-activedescendant` (ids and types may hold any character). @param {string} s */
const domId = (s) => s.replace(/[^\w-]/g, (c) => `_${c.charCodeAt(0).toString(16)}`);

/** @type {Map<string, string>|null} a Chinese catalog text → its English source text(s) */
let englishOf = null;
/**
 * The English catalog text(s) shown as `text` in Chinese ('' none): the filter matches a type's
 * English name too.
 * @param {string} text
 */
function englishText(text) {
  if (!englishOf) {
    englishOf = new Map();
    for (const [en, zh] of Object.entries(catalogStrings.zh?.text ?? {})) englishOf.set(zh, `${englishOf.get(zh) ?? ''} ${en}`);
  }
  return englishOf.get(text) ?? '';
}

export class Outliner {
  /**
   * @param {HTMLElement} host
   * @param {EditorState} state
   * @param {{ focus(ids: string[]): void, reveal(ids: string[]): void }} actions
   */
  constructor(host, state, actions) {
    this.state = state;
    this.actions = actions;
    this.collapsed = new Set();
    this.filter = '';
    /** @type {Map<string, HTMLElement & { _meta?: HTMLSpanElement, _sel?: boolean }>} object id ('spawn') → row */
    this.rows = new Map();
    /** @type {Map<string, HTMLElement>} type → group header */
    this.heads = new Map();
    /** The keyboard's active item: `row:<id>` or `group:<type>` ('' none). */
    this._activeKey = '';
    this.el = h('section', { class: 'le-panel le-outliner', 'aria-label': tr('panels.outliner.title') });
    this.count = h('span', { class: 'le-panel-note' });
    this.search = h('input', {
      class: 'le-input le-search', type: 'search', placeholder: tr('panels.outliner.filter'), spellcheck: false,
      onInput: () => { this.filter = this.search.value.trim().toLowerCase(); this.render(); },
      onKeydown: (e) => {
        if (e.key === 'Escape') { this.search.value = ''; this.filter = ''; this.render(); this.search.blur(); e.stopPropagation(); }
        // ↓ from the filter: into the list
        else if (e.key === 'ArrowDown' && !e.altKey) { e.preventDefault(); this.list.focus(); this._move(1); }
      },
    });
    this.list = h('div', {
      class: 'le-outliner-list le-scroll', role: 'tree', tabIndex: 0, 'aria-label': tr('panels.outliner.listAria'),
      'aria-multiselectable': 'true',
      onKeydown: (e) => this._onKey(e),
      onFocus: () => { if (!this._activeEl()) this._setActive(this._firstSelectedKey()); },
    });
    this.el.append(
      h('div', { class: 'le-panel-header' }, icon(ICONS.layers, 'le-icon le-panel-header-icon'), h('span', { class: 'le-panel-title' }, tr('panels.outliner.title')), this.count),
      h('div', { class: 'le-search-wrap' }, icon(ICONS.search, 'le-icon le-search-icon'), this.search),
      this.list,
    );
    host.appendChild(this.el);
    this._raf = 0;
    const later = () => { cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(() => this.render()); };
    state.on('change', (info) => { if (info.objects || info.source !== 'edit') later(); });
    state.on('selection', () => this.updateSelection(true));
    state.on('view', later);
    this.render();
  }

  /**
   * Does the filter list the object (its id, name, type name or category — in Chinese, both the
   * shown and the English names)?
   * @param {LevelObject} o
   */
  _listed(o) {
    const f = this.filter;
    if (!f) return true;
    const def = OBJECT_TYPES[o.type];
    let text = `${o.id} ${o.name ?? ''} ${def?.label ?? o.type} ${def?.category ?? ''}`;
    if (def && editorLang() === 'zh') text += ` ${englishText(def.label)} ${categoryLabel(def.category)}`;
    return text.toLowerCase().includes(f);
  }

  render() {
    const st = this.state;
    const f = this.filter;
    // only positions changed (drags, nudges): update the coordinates in place, no rebuild
    // (objects the views hide — the story preview, Show objects / Show markers off — are dimmed
    // like those of a hidden type)
    /** @type {Set<string>} */
    const hiddenIds = new Set();
    if (mayHide(st)) for (const o of st.level.objects) if (isHidden(st, o)) hiddenIds.add(o.id);
    const sig = `${f}#${(st.view.hiddenTypes ?? []).join(',')}#${[...hiddenIds].join(',')}#${[...this.collapsed].join(',')}#${st.level.objects.map((o) => `${o.id}|${o.type}|${o.name ?? ''}`).join('/')}`;
    if (sig === this._sig) { this._updateMeta(); return; }
    this._sig = sig;
    const hidden = new Set(st.view.hiddenTypes ?? []);
    const groups = new Map();
    let total = 0;
    for (const o of st.level.objects) {
      total++;
      if (!this._listed(o)) continue;
      if (!groups.has(o.type)) groups.set(o.type, []);
      groups.get(o.type).push(o);
    }
    this.count.textContent = trn('panels.outliner.count', total);
    // The wanted rows (keyed); existing row elements are reused and only the difference touches
    // the DOM — placing one object on a 400-object level adds one row instead of rebuilding all.
    const items = [];
    const add = (key, make) => items.push({ key, make });

    // player start
    if (!f || 'player start spawn'.includes(f) || tr('panels.playerStart').toLowerCase().includes(f)) {
      add('row:spawn', () => this._row({ id: 'spawn', glyph: h('span', { class: 'le-glyph is-sm', style: { '--c': SPAWN_MARKER.color } }, SPAWN_MARKER.glyph), label: tr('panels.playerStart'), meta: `${fmt1(st.level.spawn.x)}, ${fmt1(st.level.spawn.z)}` }));
    }
    for (const type of ORDER) {
      const objs = groups.get(type);
      if (!objs?.length) continue;
      const def = OBJECT_TYPES[type];
      const isHiddenType = hidden.has(type);
      const collapsed = this.collapsed.has(type) && !f;
      add(`group:${type}|${objs.length}|${isHiddenType}|${collapsed}`, () => this._groupHead(type, def, objs, isHiddenType, collapsed));
      if (collapsed) continue;
      for (const o of objs) {
        const label = o.name ? `${o.name}` : o.id;
        const sub = o.name ? o.id : '';
        const off = hiddenIds.has(o.id);
        add(`row:${o.id}|${label}|${sub}|${off}`, () => {
          const c = objectCenter(o);
          return this._row({ id: o.id, glyph: null, label, sub, meta: `${fmt1(c.x)}, ${fmt1(c.z)}`, hidden: off });
        });
      }
    }
    if (!items.length) add(`empty:${f ? 1 : 0}`, () => h('div', { class: 'le-empty' }, f ? tr('panels.outliner.noMatch') : tr('panels.outliner.empty')));
    // (rows are kept, not rebuilt: the list keeps its scroll position by itself — writing
    // scrollTop here would force a layout of every row on each added object)
    this._reconcile(items);
    this._updateMeta();
    this.updateSelection(false);
    // the keyboard's active item (its element may have been replaced): marked again
    this._setActive(this._activeKey, { scroll: false });
  }

  /** Make the list's children match `items` ({ key, make }), reusing elements by key. */
  _reconcile(items) {
    const old = this._nodes ?? new Map();
    const fresh = new Map();
    this.rows.clear();
    this.heads.clear();
    let cursor = this.list.firstChild;
    for (const it of items) {
      let el = old.get(it.key);
      if (!el || fresh.has(it.key)) el = it.make();
      fresh.set(it.key, el);
      if (it.key.startsWith('row:')) this.rows.set(el.dataset.id, el);
      else if (it.key.startsWith('group:')) this.heads.set(el.dataset.type, el);
      if (el === cursor) { cursor = cursor.nextSibling; continue; }
      this.list.insertBefore(el, cursor);
    }
    while (cursor) {
      const n = cursor.nextSibling;
      cursor.remove();
      cursor = n;
    }
    this._nodes = fresh;
  }

  /** Collapse or expand a type's group. @param {string} type */
  _toggleGroup(type) {
    if (this.collapsed.has(type)) this.collapsed.delete(type); else this.collapsed.add(type);
    this.render();
  }

  /**
   * Add a type's objects that the filter lists to the selection (a group header's Shift / Ctrl +
   * click); the ones the views hide are left out, and the status bar says so.
   * @param {string} type
   */
  _selectType(type) {
    const st = this.state;
    // (the ids of this type now: the head element outlives edits that keep the count)
    const ids = st.level.objects.filter((o) => o.type === type && this._listed(o)).map((o) => o.id);
    const left = hiddenOnly(st, ids);
    st.select(shownOnly(st, ids), { additive: true });
    if (left.length) st.notify(leftOutMessage(st, left));
  }

  _groupHead(type, def, objs, isHidden, collapsed) {
    const st = this.state;
    const eye = h('button', {
      class: ['le-eye', isHidden && 'is-off'], type: 'button', title: isHidden ? tr('panels.outliner.showType', { type: def.label }) : tr('panels.outliner.hideType', { type: def.label }),
      onClick: (e) => {
        e.stopPropagation();
        const hs = new Set(st.view.hiddenTypes ?? []);
        if (hs.has(type)) hs.delete(type); else hs.add(type);
        st.setView({ hiddenTypes: [...hs] });
      },
    }, icon(isHidden ? ICONS.eyeOff : ICONS.eye));
    return h('div', {
      class: ['le-group', collapsed && 'is-collapsed', isHidden && 'is-hidden'], role: 'treeitem', id: `le-ol-g-${domId(type)}`,
      'aria-expanded': collapsed ? 'false' : 'true', dataset: { type },
      onClick: (e) => {
        this._activeKey = `group:${type}`;
        if (e.shiftKey || e.ctrlKey || e.metaKey) { this._selectType(type); this._setActive(this._activeKey, { scroll: false }); return; }
        this._toggleGroup(type);
      },
      title: tr('panels.outliner.groupTitle'),
    }, icon(ICONS.chevronDown, 'le-icon le-group-caret'), glyphBadge(type, 'sm'), h('span', { class: 'le-group-label' }, def.label), h('span', { class: 'le-count' }, String(objs.length)), eye);
  }

  /** Refresh the coordinate column of every row. */
  _updateMeta() {
    const st = this.state;
    const byId = new Map(st.level.objects.map((o) => [o.id, o]));
    for (const [id, row] of this.rows) {
      let text;
      if (id === 'spawn') text = `${fmt1(st.level.spawn.x)}, ${fmt1(st.level.spawn.z)}`;
      else {
        const o = byId.get(id);
        if (!o) continue;
        const c = objectCenter(o);
        text = `${fmt1(c.x)}, ${fmt1(c.z)}`;
      }
      if (row._meta.textContent !== text) row._meta.textContent = text;
    }
  }

  /**
   * A row's click (or Enter / Space): select it — Shift adds, Ctrl toggles; a dimmed row (an
   * object the views hide) is never selected: the status bar says why.
   * @param {string} id
   * @param {{ shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean }} e
   */
  _clickRow(id, e) {
    const st = this.state;
    const why = hiddenMessage(st, id);
    if (why) { notifyHidden(st, tr('panels.outliner.hiddenClick', { why }), [id]); return; }
    if (e.shiftKey) st.select([id], { additive: true });
    else if (e.ctrlKey || e.metaKey) st.select([id], { toggle: true });
    else st.select([id]);
  }

  /**
   * A row's double-click (or F): a dimmed row is shown again (the story preview off, its type
   * shown, *Show objects* / *Show markers* on) and selected; any other is focused in the views.
   * @param {string} id
   */
  _openRow(id) {
    const st = this.state;
    if (hiddenReasons(st, st.getObject(id)).length) this.actions.reveal([id]);
    else this.actions.focus([id]);
  }

  _row({ id, glyph, label, sub = '', meta = '', hidden = false }) {
    /** @type {HTMLDivElement & { _meta?: HTMLSpanElement }} the row; `_meta` its right-hand count */
    const row = h('div', {
      class: ['le-row-item', hidden && 'is-hidden', glyph && 'is-top'], role: 'treeitem', tabIndex: -1, id: `le-ol-r-${domId(id)}`, dataset: { id },
      title: hidden ? tr('panels.outliner.hiddenRow') : null,
      onClick: (e) => { this._activeKey = `row:${id}`; this._setActive(this._activeKey, { scroll: false }); this._clickRow(id, e); },
      // a dimmed row: show it again (the story preview off, its type shown) and select it
      onDblclick: () => this._openRow(id),
    }, glyph ?? h('span', { class: 'le-row-indent' }), h('span', { class: 'le-row-label' }, label, sub ? h('span', { class: 'le-row-sub' }, sub) : null));
    row._meta = h('span', { class: 'le-row-meta' }, meta);
    row.appendChild(row._meta);
    return row;
  }

  updateSelection(scroll) {
    const sel = new Set(this.state.selection);
    let first = null;
    // only rows whose state changes are touched (a big level has hundreds of rows)
    for (const [id, row] of this.rows) {
      const on = sel.has(id);
      if (row._sel !== on) {
        row._sel = on;
        row.classList.toggle('is-selected', on);
        row.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      if (on && !first) first = row;
    }
    if (scroll && first && !this.el.matches(':hover')) first.scrollIntoView({ block: 'nearest' });
  }

  // -------------------------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------------------------

  /** The list's items in their order: the player start, group headers and rows. @returns {HTMLElement[]} */
  _items() {
    return /** @type {HTMLElement[]} */ ([...this.list.querySelectorAll('[role="treeitem"]')]);
  }

  /** @param {HTMLElement} el @returns {string} its key (`row:<id>` / `group:<type>`) */
  _keyOf(el) {
    return el.dataset.id !== undefined ? `row:${el.dataset.id}` : `group:${el.dataset.type}`;
  }

  /** The active item's element, or null. */
  _activeEl() {
    const k = this._activeKey;
    if (!k) return null;
    return (k.startsWith('row:') ? this.rows.get(k.slice(4)) : this.heads.get(k.slice(6))) ?? null;
  }

  /** The first selected row's key ('' none): where the keyboard starts. */
  _firstSelectedKey() {
    for (const id of this.state.selection) if (this.rows.has(id)) return `row:${id}`;
    return '';
  }

  /**
   * Make an item the keyboard's active one (marked, named by the list's `aria-activedescendant`,
   * scrolled into view).
   * @param {string} key ('' none)
   * @param {{ scroll?: boolean }} [opts]
   */
  _setActive(key, { scroll = true } = {}) {
    const prev = this.list.querySelector('.is-active');
    this._activeKey = key;
    const el = this._activeEl();
    if (prev && prev !== el) prev.classList.remove('is-active');
    if (!el) { this.list.removeAttribute('aria-activedescendant'); return; }
    el.classList.add('is-active');
    this.list.setAttribute('aria-activedescendant', el.id);
    if (scroll) el.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Move the active item by `step` items, clamped (±Infinity: the first / the last). With none
   * active, ↓ starts at the first item and ↑ at the last.
   * @param {number} step
   */
  _move(step) {
    const items = this._items();
    if (!items.length) return;
    const cur = this._activeEl();
    let k = cur ? items.indexOf(cur) : -1;
    if (k < 0) k = step > 0 ? -1 : items.length;
    this._setActive(this._keyOf(items[Math.max(0, Math.min(items.length - 1, k + step))]));
  }

  /** @param {KeyboardEvent} e (only while the list itself has the focus) */
  _onKey(e) {
    if (e.target !== this.list || e.isComposing || e.altKey) return;
    const el = this._activeEl();
    const isRow = !!el && el.dataset.id !== undefined;
    const type = el && !isRow ? el.dataset.type : '';
    const ctrl = e.ctrlKey || e.metaKey;
    let done = true;
    switch (e.key) {
      case 'ArrowDown': this._move(1); break;
      case 'ArrowUp': this._move(-1); break;
      case 'PageDown': this._move(10); break;
      case 'PageUp': this._move(-10); break;
      case 'Home': this._move(-Infinity); break;
      case 'End': this._move(Infinity); break;
      case 'ArrowRight':
        if (type && this.collapsed.has(type) && !this.filter) this._toggleGroup(type);
        else if (type) this._move(1);
        else done = false;
        break;
      case 'ArrowLeft':
        if (type && !this.collapsed.has(type) && !this.filter) this._toggleGroup(type);
        else if (isRow && el.dataset.id !== 'spawn') {
          const o = this.state.getObject(el.dataset.id);
          if (o && this.heads.has(o.type)) this._setActive(`group:${o.type}`);
        } else done = false;
        break;
      case 'Enter':
      case ' ':
        if (isRow) this._clickRow(el.dataset.id, e);
        else if (type && (e.shiftKey || ctrl)) this._selectType(type);
        else if (type) this._toggleGroup(type);
        else this._move(1);
        break;
      case 'f':
      case 'F':
        if (isRow && !ctrl && !e.shiftKey) this._openRow(el.dataset.id);
        else done = false;
        break;
      default: done = false;
    }
    if (!done) return;
    // (the app's shortcuts skip it: arrows would nudge the selection, Space pan the map)
    e.preventDefault();
    e.stopPropagation();
  }
}

const fmt1 = (v) => (Math.round(v * 10) / 10).toString();
