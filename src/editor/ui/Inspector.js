/**
 * Inspector (right column, top): schema-driven property editor for the selection.
 *   - one object: header (type, editable id), position fields, the catalog fields
 *     (OBJECT_TYPES[type].fields), actions;
 *   - several objects: counts by type, shared fields when all have the same type (mixed values
 *     shown blank), common actions;
 *   - the player start: position, facing, walkability;
 *   - an enemy group: also a "Boss arena" section (relative arena rect + gate) for the boss kind
 *     (and for another kind that still has one: the game ignores it, a hint says so); the boss
 *     kind's Count is 1 (the boss spawns alone): its field stops at 1, and an edit that makes a
 *     group the boss (Kind) or sets its Count clamps it (`clampBossCount`);
 *   - nothing: level summary, validation, quick environment settings and level actions.
 * All edits go through EditorState (undoable); slider drags are one undo step. Clearing an optional
 * field (one the type's catalog `defaults` lack: `when`, `unless`, `talk`, `actor`, `flag`, an
 * event's `label` / `if` / `at` / `group` …) removes its key instead of writing it blank; typed
 * again, the key goes back to its place in the object (the file's key order). A story condition
 * field (`when`, `unless`, an exit's `requires`, an event's `if` — `StoryChecks.conditionFields`)
 * shows under it what *Check for problems* says about that field of the object, with its text as
 * typed (../story.js `conditionIssues`). Text keys (docs/specs/I18N.md §4.10) are never edited
 * here — EditorState carries them through every edit, and a script field holds and compares its
 * script without the lines' `#line:` tags — but one object's translatable fields show their keys
 * read-only under them (./keyView.js: a monospace line per text with a Copy button; a field of
 * several texts behind a "Text keys (n)" toggle), and *Find by text key…* focuses the text that
 * holds one (`showTextKey`).
 */
import { h, icon, clear, fmt } from './dom.js';
import { createFieldEditor, numberControl, selectControl, textControl } from './fields.js';
import { glyphBadge } from './ToolOptions.js';
import { ICONS } from '../icons.js';
import {
  OBJECT_TYPES, SPAWN_MARKER, ENEMY_INFO, getField, setField, enemyStartPoints, levelHasCombat, dialogueToText,
} from '../../engine/level/ObjectCatalog.js';
import { validateLevel, levelStats, tileDef, onBridgeDeck } from '../../engine/level/LevelFormat.js';
import { isWalkableAt } from '../tools/SpawnTool.js';
import { friendlyProblem } from './dialogs.js';
import { gateEdgeGap, GATE_EDGE_TOLERANCE, isBossGroup, clampBossCount, bossExtraCount } from '../enemyGroups.js';
import { ownValue } from '../../engine/utils/own.js';
import { conditionRuleOf, conditionIssues, onStoryContext } from '../story.js';
import { isRoom } from '../rooms.js';
import { stripScriptTags } from '../../engine/i18n/TextKeys.js';
import { textRows, textFieldsOf } from '../textKeys.js';
import { fillKeyView, copyText } from './keyView.js';
import { selectLine } from './scriptEditor.js';
import { tr } from '../i18n.js';
import { categoryLabel, catalogText } from '../catalogI18n.js';

/**
 * @import { EditorState } from '../EditorState.js'
 * @import { TextRow } from '../textKeys.js'
 */

const LIGHT_TYPES = new Set(['lamppost', 'wallTorch', 'campfire', 'light']);
const weatherOptions = () => [
  { value: 'clear', label: tr('panels.weather.clear') }, { value: 'rain', label: tr('panels.weather.rain') }, { value: 'snow', label: tr('panels.weather.snow') },
];

/** Number of objects that request a point light (a hearth while its fire burns, `opts.lit`). */
export function countLights(level) {
  return level.objects.filter((o) => LIGHT_TYPES.has(o.type) || (o.type === 'house' && o.light) || (o.type === 'hearth' && o.opts?.lit !== false)).length;
}

/** A new boss group's arena and gate (relative to the group; COMBAT.md §14.1): 18 × 18 u, gate south. */
const DEFAULT_ARENA = { minX: -9, maxX: 9, minZ: -9, maxZ: 9 };
const DEFAULT_GATE = [-1.5, 9, 1.5, 9];

/**
 * Combat numbers of a level (COMBAT.md §17): enemies (start spots, a boss group counts one), enemy
 * groups, waystones and chests.
 * @returns {{ enemies: number, groups: number, waystones: number, chests: number }}
 */
export function combatStats(level) {
  let enemies = 0;
  let groups = 0;
  let waystones = 0;
  let chests = 0;
  for (const o of level.objects) {
    if (o.type === 'enemy') { groups++; enemies += enemyStartPoints(o).length; }
    else if (o.type === 'waystone') waystones++;
    else if (o.type === 'chest') chests++;
  }
  return { enemies, groups, waystones, chests };
}

export class Inspector {
  /**
   * @param {HTMLElement} host
   * @param {EditorState} state
   * @param {{ focus(ids:string[]):void, duplicate():void, remove():void, rotate(deg:number):void,
   *           settings():void, resize():void, playtest():void }} actions
   */
  constructor(host, state, actions) {
    this.state = state;
    this.actions = actions;
    this.el = h('section', { class: 'le-panel le-inspector', 'aria-label': tr('panels.inspector.title') });
    this.header = h('div', { class: 'le-panel-header' }, icon(ICONS.settings, 'le-icon le-panel-header-icon'), h('span', { class: 'le-panel-title' }, tr('panels.inspector.title')));
    this.headerNote = h('span', { class: 'le-panel-note' });
    this.header.appendChild(this.headerNote);
    this.body = h('div', { class: 'le-panel-body le-scroll' });
    this.el.append(this.header, this.body);
    host.appendChild(this.el);
    this.bindings = [];
    this._key = '';
    this._raf = 0;
    /**
     * Where optional keys that were cleared sat in their object: `${id}\u0000${key}` → the key
     * before it ('' = the first). Typed again, a key goes back there, so clearing and retyping a
     * value leaves the saved file as it was.
     * @type {Map<string, string>}
     */
    this._clearedKeys = new Map();
    /** The fields (by key) whose "Text keys (n)" list is open: it stays open from object to object. */
    this._keysOpen = new Set();
    state.on('selection', () => this.render());
    state.on('change', (info) => this._onChange(info));
    // the weather hint depends on the atmosphere preview
    state.on('view', () => { for (const b of this.bindings) if (b.view) b.update(); });
    // a campaign's story and level files arrived: the condition hints check against them
    onStoryContext(() => this.refresh());
    this.render();
  }

  _onChange(info) {
    if (info.source === 'load') { this._clearedKeys.clear(); this.render(); return; }
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this.refresh());
  }

  /**
   * Selection signature: re-render when the kind of content changes (an enemy group turning into
   * the boss or back changes its Count field), else refresh values.
   */
  _signature() {
    const sel = this.state.selection;
    const objs = this.state.selectedObjects;
    return `${sel.join('|')}#${objs.map((o) => (isBossGroup(o) ? 'enemy:boss' : o.type)).join(',')}`;
  }

  refresh() {
    if (this._signature() !== this._key) { this.render(); return; }
    for (const b of this.bindings) b.update();
  }

  render() {
    this._key = this._signature();
    this.bindings = [];
    const scroll = this.body.scrollTop;
    clear(this.body);
    const sel = this.state.selection;
    const objs = this.state.selectedObjects;
    if (!sel.length) this._renderLevel();
    else if (sel.length === 1 && sel[0] === 'spawn') this._renderSpawn();
    else if (sel.length === 1 && objs.length === 1) this._renderObject(objs[0]);
    else this._renderMulti(objs, sel.includes('spawn'));
    this.headerNote.textContent = sel.length > 1 ? tr('panels.inspector.nSelected', { n: sel.length }) : sel.length === 1 ? (sel[0] === 'spawn' ? tr('panels.playerStart') : objs[0]?.id ?? '') : tr('panels.inspector.level');
    // scrollTop is only clamped at layout time, so reset it explicitly for a new selection
    this.body.scrollTop = this._lastSel === sel.join('|') ? scroll : 0;
    this._lastSel = sel.join('|');
  }

  // -------------------------------------------------------------------------------------------

  _section(title, content, extra = null) {
    return h('section', { class: 'le-section' },
      h('div', { class: 'le-section-head' }, h('span', { class: 'le-section-title' }, title), extra),
      h('div', { class: 'le-section-body' }, content));
  }

  _bind(update) { this.bindings.push({ update }); }

  _actions(buttons) {
    return h('div', { class: 'le-actions' }, buttons.filter(Boolean).map((b) => h('button', {
      class: ['le-btn', 'is-small', b.danger && 'is-danger', b.primary && 'is-primary'], type: 'button', title: b.title ?? null, onClick: b.onClick,
    }, b.icon ? icon(b.icon) : null, b.label)));
  }

  /**
   * Number field bound to a getter / setter on the object with live slider support.
   * @param {string} label
   * @param {{ get: () => number|null|undefined, set: (v: number|null, live: boolean) => void,
   *   min?: number, max?: number, step?: number, nullable?: boolean, slider?: boolean,
   *   labelTitle?: string }} opts  step (0.5); `set(v, true)` while a slider drag is live
   */
  _numberField(label, { get, set, min, max, step = 0.5, nullable = false, slider = false, labelTitle }) {
    let live = false;
    const ctl = numberControl({
      value: get(), min, max, step, nullable, slider,
      onChange: (v) => set(v, false),
      onInput: (v) => set(v, true),
      onBegin: () => { live = true; this.state.begin(tr('panels.inspector.undoEdit', { label })); },
      onEnd: () => { if (live) { live = false; this.state.commit(); } },
    });
    this._bind(() => ctl.set(get()));
    return h('div', { class: 'le-field', title: labelTitle ?? null }, h('label', { class: 'le-field-label' }, label), h('div', { class: 'le-field-control' }, ctl.el));
  }

  _pair(a, b) { return h('div', { class: 'le-pair' }, a, b); }

  // ------------------------------------------------------------------------------ one object

  _renderObject(o) {
    const def = OBJECT_TYPES[o.type];
    const id = o.id;
    const st = this.state;
    const cur = () => st.getObject(id);
    const edit = (fn, label) => st.updateObject(id, fn, label);

    // header card
    const idCtl = textControl({
      value: id, maxLength: 60,
      onChange: (v) => {
        const nv = String(v).trim().replace(/\s+/g, '_');
        if (!nv || nv === id) { idCtl.set(id); return; }
        if (!/^[\w-]+$/.test(nv)) { st.notify(tr('panels.inspector.idChars')); idCtl.set(id); return; }
        if (nv === 'spawn') { st.notify(tr('panels.inspector.idReserved')); idCtl.set(id); return; }
        if (st.getObject(nv)) { st.notify(tr('panels.inspector.idUsed', { id: nv })); idCtl.set(id); return; }
        // select inside the transaction so undo / redo restore the matching selection
        st.begin(tr('panels.inspector.undoRename'));
        st.updateObject(id, (ob) => { ob.id = nv; }, tr('panels.inspector.undoRename'));
        st.select(st.selection.map((s) => (s === id ? nv : s)));
        st.commit();
      },
    });
    this.body.appendChild(h('div', { class: 'le-card le-obj-card' },
      glyphBadge(o.type, 'xl'),
      h('div', { class: 'le-obj-titles' },
        h('div', { class: 'le-obj-type' }, def.label, h('span', { class: 'le-chip' }, categoryLabel(def.category))),
        h('div', { class: 'le-obj-id' }, h('span', { class: 'le-obj-id-label' }, tr('panels.inspector.id')), idCtl.el)),
    ));
    if (def.help) this.body.appendChild(h('p', { class: 'le-hint le-pad' }, def.help));

    // transform
    const tf = [];
    const num = (label, key, extra = {}) => this._numberField(label, {
      get: () => cur()?.[key],
      set: (v) => {
        if (v == null) return;
        edit((ob) => {
          ob[key] = v;
          // keep areas well-formed when a min is typed past its max (or vice versa)
          if (def.placement === 'rect') {
            if (ob.minX > ob.maxX) [ob.minX, ob.maxX] = [ob.maxX, ob.minX];
            if (ob.minZ > ob.maxZ) [ob.minZ, ob.maxZ] = [ob.maxZ, ob.minZ];
          }
        }, def.placement === 'rect' ? tr('panels.inspector.undoResizeArea') : tr('panels.inspector.undoMove'));
      },
      step: 0.5, ...extra,
    });
    if (def.placement === 'point') tf.push(this._pair(num('X', 'x'), num('Z', 'z')));
    else if (def.placement === 'line') {
      tf.push(this._pair(num(tr('panels.inspector.startX'), 'x0'), num(tr('panels.inspector.startZ'), 'z0')), this._pair(num(tr('panels.inspector.endX'), 'x1'), num(tr('panels.inspector.endZ'), 'z1')));
      const len = h('span', { class: 'le-readout' });
      const upd = () => { const ob = cur(); if (ob) len.textContent = tr('panels.inspector.unitsLong', { len: fmt(Math.hypot(ob.x1 - ob.x0, ob.z1 - ob.z0)) }); };
      upd();
      this._bind(upd);
      tf.push(len);
    } else {
      tf.push(this._pair(num(tr('panels.inspector.minX'), 'minX'), num(tr('panels.inspector.maxX'), 'maxX')), this._pair(num(tr('panels.inspector.minZ'), 'minZ'), num(tr('panels.inspector.maxZ'), 'maxZ')));
      const size = h('span', { class: 'le-readout' });
      const upd = () => { const ob = cur(); if (ob) size.textContent = `${fmt(ob.maxX - ob.minX)} × ${fmt(ob.maxZ - ob.minZ)}`; };
      upd();
      this._bind(upd);
      tf.push(size);
    }
    const fields = def.fields;
    const rotField = fields.find((f) => f.key === 'rotation');
    if (rotField) tf.push(this._fieldEditor(rotField, [id]));

    // the content a designer edits (names, dialogue, walls…) first; the position is mostly set
    // by dragging, so the transform follows
    const rest = fields.filter((f) => f.key !== 'rotation');
    const boss = isBossGroup(o);
    // (a translatable field: its texts' keys under it, read-only)
    const keyed = textFieldsOf(o.type) ?? {};
    const props = rest.map((f) => (boss && f.key === 'count'
      // the boss spawns alone (enemyStartPoints takes one): the field stops at 1
      ? [this._fieldEditor({ ...f, max: 1, slider: false }, [id]), this._bossCountHint(id)]
      : Object.hasOwn(keyed, f.key) ? [this._fieldEditor(f, [id]), this._keyView(id, f.key, keyed[f.key] !== 'text')]
        : this._fieldEditor(f, [id])));
    if (rest.length) this.body.appendChild(this._section(tr('panels.inspector.properties'), props));
    this.body.appendChild(this._section(tr('panels.inspector.transform'), tf));
    if (!rest.length) this.body.appendChild(h('p', { class: 'le-hint le-pad' }, tr('panels.inspector.noProperties')));
    if (o.type === 'enemy') this.body.appendChild(this._arenaSection(id));

    this.body.appendChild(this._actions([
      { label: tr('panels.inspector.focus'), icon: ICONS.focus, title: tr('panels.inspector.focusTitle'), onClick: () => this.actions.focus([id]) },
      { label: tr('panels.inspector.duplicate'), icon: ICONS.duplicate, title: 'Ctrl+D', onClick: () => this.actions.duplicate() },
      { label: tr('common.delete'), icon: ICONS.trash, danger: true, title: 'Del', onClick: () => this.actions.remove() },
    ]));
  }

  /** Under a boss group's Count: it spawns alone (a warning while the stored count is above 1). */
  _bossCountHint(id) {
    const hint = h('p', { class: 'le-hint' });
    const upd = () => {
      const ob = this.state.getObject(id);
      const extra = ob ? bossExtraCount(ob) : 0;
      // (the Count field's own label, as the field shows it)
      const field = catalogText('Count');
      const asked = ob && ob.count != null && ob.count !== '' ? tr('panels.boss.countValue', { field, value: ob.count }) : tr('panels.boss.spotOffsets', { n: extra + 1 });
      hint.textContent = extra
        ? tr('panels.boss.ignored', { extra, asked, field })
        : tr('panels.boss.alone', { field });
      hint.style.color = extra ? 'var(--le-warn)' : '';
    };
    upd();
    this._bind(upd);
    return hint;
  }

  /**
   * The boss arena of an enemy group (optional `arena` / `gate`, relative to the group): shown
   * for the boss kind and for any group that has one; drag the corners / gate ends in a view with
   * the select tool, or type them here.
   */
  _arenaSection(id) {
    const st = this.state;
    const cur = () => st.getObject(id);
    const has = () => !!cur()?.arena;
    const edit = (fn, label) => st.updateObject(id, fn, label);
    const arenaNum = (label, key) => this._numberField(label, {
      get: () => cur()?.arena?.[key],
      set: (v) => { if (v != null && has()) edit((ob) => { ob.arena = { ...ob.arena, [key]: v }; }, tr('panels.arena.undoEditArena')); },
      step: 0.5,
    });
    const gateNum = (label, k) => this._numberField(label, {
      get: () => cur()?.gate?.[k],
      set: (v) => {
        if (v == null) return;
        edit((ob) => { const g = Array.isArray(ob.gate) ? [...ob.gate] : [...DEFAULT_GATE]; g[k] = v; ob.gate = g; }, tr('panels.arena.undoEditGate'));
      },
      step: 0.5,
    });
    const fields = h('div', null,
      this._pair(arenaNum(tr('panels.inspector.minX'), 'minX'), arenaNum(tr('panels.inspector.maxX'), 'maxX')),
      this._pair(arenaNum(tr('panels.inspector.minZ'), 'minZ'), arenaNum(tr('panels.inspector.maxZ'), 'maxZ')),
      this._pair(gateNum(tr('panels.arena.gateX0'), 0), gateNum(tr('panels.arena.gateZ0'), 1)),
      this._pair(gateNum(tr('panels.arena.gateX1'), 2), gateNum(tr('panels.arena.gateZ1'), 3)));
    const hint = h('p', { class: 'le-hint' });
    const addBtn = h('button', {
      class: 'le-btn is-small', type: 'button', title: tr('panels.arena.addTitle'),
      onClick: () => edit((ob) => { ob.arena = { ...DEFAULT_ARENA }; ob.gate = [...DEFAULT_GATE]; }, tr('panels.arena.undoAdd')),
    }, icon(ICONS.plus), tr('panels.arena.add'));
    const removeBtn = h('button', {
      class: 'le-btn is-small is-danger', type: 'button',
      onClick: () => edit((ob) => { delete ob.arena; delete ob.gate; }, tr('panels.arena.remove')),
    }, icon(ICONS.trash), tr('panels.arena.remove'));
    const section = this._section(tr('panels.arena.title'), [hint, fields, h('div', { class: 'le-actions' }, addBtn, removeBtn)]);
    // (inline display: the editor's button / section styles override the hidden attribute)
    const show = (el, on) => { el.style.display = on ? '' : 'none'; };
    const upd = () => {
      const ob = cur();
      if (!ob) return;
      const boss = !!ownValue(ENEMY_INFO, ob.kind)?.boss;
      show(section, boss || !!ob.arena || !!ob.gate);
      show(fields, !!ob.arena);
      show(addBtn, boss && !ob.arena);
      show(removeBtn, !!ob.arena || !!ob.gate);
      const gap = boss ? gateEdgeGap(ob) : null;
      const offEdge = gap != null && gap > GATE_EDGE_TOLERANCE;
      hint.textContent = !boss
        ? tr('panels.arena.hintNotBoss', { kind: catalogText('Kind') })
        : offEdge
          ? tr('panels.arena.hintOffEdge', { gap: gap.toFixed(1) })
          : ob.arena
            ? tr('panels.arena.hintArena')
            : tr('panels.arena.hintNeedsArena');
      hint.style.color = !boss || offEdge || (boss && (!ob.arena || !ob.gate)) ? 'var(--le-warn)' : '';
    };
    upd();
    this._bind(upd);
    return section;
  }

  /** Field editor for one or several objects (mixed values). */
  _fieldEditor(field, ids) {
    const st = this.state;
    // (a script without its key tags: two objects with the same lines show them, not "mixed")
    const values = () => ids.map((i) => st.getObject(i)).filter(Boolean).map((ob) => (field.type === 'script' ? stripScriptTags(getField(ob, field.key)) : getField(ob, field.key)));
    const isMixed = (vals) => vals.some((v) => JSON.stringify(v) !== JSON.stringify(vals[0]));
    let live = false;
    const apply = (v, isLive = false) => {
      if (v === undefined) return;
      const label = tr('panels.inspector.undoEdit', { label: field.label });
      if (!isLive && !live) st.begin(label);
      // an enemy group that is (or becomes) the boss keeps Count 1 (it spawns alone)
      const clamp = field.key === 'kind' || field.key === 'count';
      for (const i of ids) {
        st.updateObject(i, (ob) => {
          const slot = `${ob.id}\u0000${field.key}`;
          // an optional field (no catalog default: when, unless, talk, actor, flag …) cleared by
          // the author leaves the object instead of being written blank — an optional checkbox
          // (an event's `background`) unticked too: absent reads as false
          if ((isBlankValue(v) || (field.type === 'bool' && v === false)) && !hasDefault(ob.type, field.key)) {
            if (Object.hasOwn(ob, field.key)) {
              const keys = Object.keys(ob);
              this._clearedKeys.set(slot, keys[keys.indexOf(field.key) - 1] ?? '');
            }
            deleteField(ob, field.key);
          } else {
            // (typed again: back where it was cleared)
            const after = Object.hasOwn(ob, field.key) ? undefined : this._clearedKeys.get(slot);
            setField(ob, field.key, clone(v));
            if (after !== undefined) {
              moveKeyAfter(ob, field.key, after);
              this._clearedKeys.delete(slot);
            }
          }
          if (clamp) clampBossCount(ob);
        }, label);
      }
      if (!isLive && !live) st.commit();
    };
    const vals = values();
    // a story condition (`when`, `unless`, an exit's `requires`, an event's `if`): read by the
    // checks' own rule for the field, its hint says what *Check for problems* says about it
    const type = st.getObject(ids[0])?.type ?? '';
    const rule = conditionRuleOf(type, field.key);
    // (the hint reads the object as it is now — an event's trigger, its type —, with the field's
    // text as typed; several objects: only what their type and the text say)
    const hintObject = () => (ids.length === 1 && st.getObject(ids[0])) || { type };
    const ed = createFieldEditor(rule && field.type === 'text' ? { ...field, type: 'condition' } : field, {
      value: vals[0], mixed: isMixed(vals), apply,
      begin: () => { live = true; st.begin(tr('panels.inspector.undoEdit', { label: field.label })); },
      end: () => { if (live) { live = false; st.commit(); } },
      rule: rule ?? undefined,
      check: rule ? (t) => conditionIssues(st, hintObject(), field.key, t).map((i) => i.msg) : undefined,
    });
    this._bind(() => { const vv = values(); if (vv.length) ed.set(vv[0], isMixed(vv)); });
    ed.el.dataset.field = field.key;
    return ed.el;
  }

  /**
   * The read-only keys of one object's translatable field, under it (./keyView.js): refreshed with
   * the object (an edit that gives a text a new key shows it). Never writes.
   * @param {string} id
   * @param {string} field
   * @param {boolean} pages the field holds pages or lines (a toggle opens their list)
   */
  _keyView(id, field, pages) {
    const st = this.state;
    const el = h('div', { class: 'le-text-keys', dataset: { field } });
    let shown = '';
    const upd = () => {
      const o = st.getObject(id);
      const rows = o ? textRows(o).filter((r) => r.field === field) : [];
      const sig = JSON.stringify(rows.map((r) => [r.key, r.page, r.choice, r.line, r.text]));
      if (sig === shown) return;
      shown = sig;
      fillKeyView(el, rows, {
        pages, open: this._keysOpen.has(field),
        onToggle: (open) => { if (open) this._keysOpen.add(field); else this._keysOpen.delete(field); },
        onCopy: (key) => { copyText(key).then((ok) => st.notify(ok ? tr('panels.inspector.copied', { key }) : tr('panels.inspector.copyUnavailable', { key }))); },
      });
    };
    upd();
    this._bind(upd);
    return el;
  }

  /**
   * Show the text that holds a key in the one selected object's inspector (Edit › *Find by text
   * key…*): its field scrolled into view, the text selected in it — a script's line, a page of a
   * `lines` or dialogue field (the page of a choice), a one-string field's text — and its key line
   * shown (its list opened) and marked. Returns whether the field was found.
   * @param {TextRow} row
   * @returns {boolean}
   */
  showTextKey(row) {
    const o = this.state.selectedObjects.length === 1 ? this.state.selectedObjects[0] : null;
    const field = [...this.body.querySelectorAll('.le-field')].find((x) => /** @type {HTMLElement} */ (x).dataset.field === row.field);
    const view = [...this.body.querySelectorAll('.le-text-keys')].find((x) => /** @type {HTMLElement} */ (x).dataset.field === row.field);
    const input = /** @type {HTMLTextAreaElement|HTMLInputElement|null} */ (field?.querySelector('textarea, input') ?? null);
    if (!o || !field || !input) return false;
    // the key line: its list opened, the line marked
    const toggle = /** @type {HTMLButtonElement|null} */ (view?.querySelector('.le-text-keys-toggle') ?? null);
    if (toggle && !toggle.classList.contains('is-open')) toggle.click();
    /** @type {HTMLElement|null} */
    let hitLine = null;
    for (const l of view?.querySelectorAll('.le-text-key') ?? []) {
      const on = /** @type {HTMLElement} */ (l).dataset.key === row.key;
      l.classList.toggle('is-hit', on);
      if (on && !hitLine) hitLine = /** @type {HTMLElement} */ (l);
    }
    field.scrollIntoView({ block: 'nearest' });
    // (the key line too, when it fits in the panel with the field)
    if (hitLine && hitLine.getBoundingClientRect().bottom - field.getBoundingClientRect().top <= this.body.clientHeight) hitLine.scrollIntoView({ block: 'nearest' });
    if (row.line != null && input instanceof HTMLTextAreaElement) {
      selectLine(input, row.line);
      return true;
    }
    if (row.page != null && input instanceof HTMLTextAreaElement) {
      // the page's place in the field's text: its pages joined by blank lines (linesToText /
      // dialogueToText)
      const v = getField(o, row.field);
      const list = Array.isArray(v) ? v : [v];
      const pageText = (p) => (row.field === 'dialogue' ? dialogueToText([p]) : String(p ?? ''));
      let a = 0;
      for (let k = 0; k < row.page && k < list.length; k++) a += pageText(list[k]).length + 2;
      const b = Math.min(input.value.length, a + pageText(list[row.page]).length);
      input.focus({ preventScroll: true });
      input.setSelectionRange(Math.min(a, b), b);
      const lh = parseFloat(getComputedStyle(input).lineHeight) || 18;
      input.scrollTop = Math.max(0, (input.value.slice(0, a).split('\n').length - 1) * lh - input.clientHeight / 3);
      return true;
    }
    input.focus({ preventScroll: true });
    input.select();
    return true;
  }

  // ------------------------------------------------------------------------------ several

  _renderMulti(objs, withSpawn) {
    const counts = new Map();
    for (const o of objs) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
    const n = objs.length + (withSpawn ? 1 : 0);
    this.body.appendChild(h('div', { class: 'le-card le-multi-card' },
      h('div', { class: 'le-multi-count' }, String(n)),
      h('div', null, h('div', { class: 'le-obj-type' }, tr('panels.multi.count', { n })),
        h('div', { class: 'le-hint' }, tr('panels.multi.hint')))));
    const list = h('div', { class: 'le-type-list' });
    for (const [t, c] of counts) {
      list.appendChild(h('button', {
        class: 'le-type-row', type: 'button', title: tr('panels.multi.selectOnly', { type: OBJECT_TYPES[t].label }),
        onClick: () => this.state.select(objs.filter((o) => o.type === t).map((o) => o.id)),
      }, glyphBadge(t), h('span', null, OBJECT_TYPES[t].label), h('span', { class: 'le-count' }, String(c))));
    }
    if (withSpawn) list.appendChild(h('div', { class: 'le-type-row' }, h('span', { class: 'le-glyph is-md', style: { '--c': SPAWN_MARKER.color } }, SPAWN_MARKER.glyph), h('span', null, tr('panels.playerStart')), h('span', { class: 'le-count' }, '1')));
    this.body.appendChild(this._section(tr('panels.multi.selection'), [list]));

    this.body.appendChild(this._actions([
      { label: tr('panels.inspector.focus'), icon: ICONS.focus, onClick: () => this.actions.focus(this.state.selection) },
      { label: '−90°', icon: ICONS.rotate, title: tr('panels.multi.rotateCwTitle'), onClick: () => this.actions.rotate(-90) },
      { label: '+90°', icon: ICONS.rotateCcw, title: tr('panels.multi.rotateCcwTitle'), onClick: () => this.actions.rotate(90) },
      objs.length ? { label: tr('panels.inspector.duplicate'), icon: ICONS.duplicate, onClick: () => this.actions.duplicate() } : null,
      objs.length ? { label: tr('common.delete'), icon: ICONS.trash, danger: true, onClick: () => this.actions.remove() } : null,
    ]));

    if (counts.size === 1 && !withSpawn) {
      const type = objs[0].type;
      const ids = objs.map((o) => o.id);
      const fields = OBJECT_TYPES[type].fields;
      if (fields.length) this.body.appendChild(this._section(tr('panels.multi.shared', { type: OBJECT_TYPES[type].label }), fields.map((f) => this._fieldEditor(f, ids))));
    }
  }

  // ------------------------------------------------------------------------------ spawn

  _renderSpawn() {
    const st = this.state;
    const s = () => st.level.spawn;
    this.body.appendChild(h('div', { class: 'le-card le-obj-card' },
      h('span', { class: 'le-glyph is-xl', style: { '--c': SPAWN_MARKER.color } }, SPAWN_MARKER.glyph),
      h('div', { class: 'le-obj-titles' }, h('div', { class: 'le-obj-type' }, tr('panels.playerStart')), h('div', { class: 'le-hint' }, tr('panels.spawn.hint')))));
    const setPos = (k) => (v) => {
      if (v == null) return;
      const p = { ...s(), [k]: v };
      st.setSpawn(p.x, p.z, p.facing);
    };
    const status = h('div', { class: 'le-status-line' });
    const upd = () => {
      const ok = isWalkableAt(st.level, s().x, s().z);
      const d = tileDef(st.level, Math.floor(s().x), Math.floor(s().z));
      const deck = ok && onBridgeDeck(st.level, s().x, s().z);
      clear(status).append(icon(ok ? ICONS.check : ICONS.warning), ok ? (deck ? tr('panels.spawn.onBridge') : tr('panels.spawn.onGround')) : d ? tr('panels.spawn.notWalkable') : tr('panels.spawn.outside'));
      status.classList.toggle('is-bad', !ok);
    };
    upd();
    this._bind(upd);
    const facing = selectControl({ value: s().facing, options: [{ value: 'down', label: tr('panels.spawn.facingDown') }, { value: 'up', label: tr('panels.spawn.facingUp') }, { value: 'left', label: tr('panels.spawn.facingLeft') }, { value: 'right', label: tr('panels.spawn.facingRight') }], onChange: (v) => st.setSpawn(s().x, s().z, v) });
    this._bind(() => facing.set(s().facing));
    this.body.appendChild(this._section(tr('panels.spawn.position'), [
      this._pair(this._numberField('X', { get: () => s().x, set: setPos('x'), step: 0.5 }), this._numberField('Z', { get: () => s().z, set: setPos('z'), step: 0.5 })),
      h('div', { class: 'le-field' }, h('label', { class: 'le-field-label' }, tr('panels.spawn.facing')), h('div', { class: 'le-field-control' }, facing.el)),
      status,
    ]));
    this.body.appendChild(this._actions([
      { label: tr('panels.inspector.focus'), icon: ICONS.focus, onClick: () => this.actions.focus(['spawn']) },
      { label: tr('panels.spawn.snap'), icon: ICONS.magnet, onClick: () => st.setSpawn(Math.floor(s().x) + 0.5, Math.floor(s().z) + 0.5) },
    ]));
  }

  // ------------------------------------------------------------------------------ level

  _renderLevel() {
    const st = this.state;
    const L = () => st.level;
    const title = h('div', { class: 'le-level-name' });
    const sub = h('div', { class: 'le-level-sub' });
    const stats = h('div', { class: 'le-stats' });
    const combat = h('div', { class: 'le-status-line' });
    const valid = h('div', { class: 'le-status-line' });
    const upd = () => {
      const lv = L();
      title.textContent = lv.name || tr('common.untitled');
      sub.textContent = lv.subtitle || (lv.author ? tr('panels.level.by', { author: lv.author }) : tr('panels.level.noSubtitle'));
      // a room (environment.interior): said under the name
      if (isRoom(lv.environment)) sub.textContent += tr('panels.level.room');
      const s = levelStats(lv);
      const lights = countLights(lv);
      const npcs = s.counts.npc ?? 0;
      const tiles = lv.width * lv.depth;
      clear(stats).append(
        stat(tr('panels.level.size'), `${lv.width} × ${lv.depth}`),
        stat(tr('panels.level.objects'), String(s.objects)),
        stat(tr('panels.level.lights'), lights > 12 ? tr('panels.level.lightsLit', { n: lights }) : `${lights} / 12`, lights > 12 ? tr('panels.level.lightsTitle') : ''),
        stat(tr('panels.level.villagers'), String(npcs)),
        stat(tr('panels.level.water'), `${Math.round((s.water / tiles) * 100)}%`),
        stat(tr('panels.level.walkable'), `${Math.round((s.walkable / tiles) * 100)}%`),
      );
      // combat levels (COMBAT.md §17): "Enemies n (groups g) · Waystones n · Chests n"
      const c = combatStats(lv);
      const on = levelHasCombat(lv);
      const shown = !!(c.groups || c.waystones || c.chests || on);
      combat.style.display = shown ? '' : 'none';
      if (shown) {
        const onOff = (v) => (v ? tr('panels.level.combatOn') : tr('panels.level.combatOff'));
        const mode = lv.environment?.combat === true ? onOff(true) : lv.environment?.combat === false ? onOff(false) : tr('panels.level.combatAuto', { state: onOff(on) });
        const bad = (lv.environment?.combat === false && c.groups > 0) || (on && !c.waystones);
        clear(combat).append(icon(bad ? ICONS.warning : ICONS.info),
          tr('panels.level.combatLine', { enemies: c.enemies, groups: c.groups, waystones: c.waystones, chests: c.chests }));
        const note = bad ? (on ? tr('panels.level.combatNoWaystone') : tr('panels.level.combatHidden')) : '';
        combat.title = tr('panels.level.combatTitle', { mode, note });
        combat.classList.toggle('is-bad', bad);
      }
      const errors = validateLevel(lv).map(friendlyProblem);
      clear(valid).append(icon(errors.length ? ICONS.warning : ICONS.check), errors.length ? errors.join(' ') : tr('panels.level.ready'));
      valid.classList.toggle('is-bad', errors.length > 0);
    };
    upd();
    this._bind(upd);
    this.body.appendChild(h('div', { class: 'le-card le-level-card' }, title, sub, stats, combat, valid));

    const env = () => L().environment;
    let live = false;
    const tod = numberControl({
      value: env().timeOfDay, min: 0, max: 24, step: 0.25, suffix: 'h',
      onChange: (v) => { if (v != null) st.setLevelProps({ environment: { timeOfDay: v } }, tr('panels.level.undoTimeOfDay')); },
      onInput: (v) => st.setLevelProps({ environment: { timeOfDay: v } }, tr('panels.level.undoTimeOfDay')),
      onBegin: () => { live = true; st.begin(tr('panels.level.undoTimeOfDay')); },
      onEnd: () => { if (live) { live = false; st.commit(); } },
    });
    const weather = selectControl({ value: env().weather, options: weatherOptions(), onChange: (v) => st.setLevelProps({ environment: { weather: v } }, tr('panels.level.weather')) });
    const wl = numberControl({
      value: L().waterLevel, min: -2, max: 10, step: 0.05, slider: false,
      onChange: (v) => { if (v != null) st.setLevelProps({ waterLevel: v }, tr('panels.level.undoWaterLevel')); },
    });
    this._bind(() => { tod.set(env().timeOfDay); weather.set(env().weather); wl.set(L().waterLevel); });
    // the 3D preview always shows the weather's light; the rain / snow, its haze and the snow
    // cover only with its atmosphere (particles) layer
    const wHint = h('p', { class: 'le-hint le-weather-hint' });
    const updHint = () => {
      const w = env().weather;
      // a room shows no weather (the game's LevelLook.shownWeather; the 3D preview follows it)
      if (isRoom(env())) {
        wHint.hidden = w !== 'rain' && w !== 'snow';
        if (!wHint.hidden) clear(wHint).append(w === 'rain' ? tr('panels.level.roomNoRain') : tr('panels.level.roomNoSnow'));
        return;
      }
      const on = (w === 'rain' || w === 'snow') && !st.view.atmosphere;
      wHint.hidden = !on;
      if (!on) return;
      clear(wHint).append(w === 'rain' ? tr('panels.level.rainHint') : tr('panels.level.snowHint'),
        h('button', { class: 'le-link-btn', type: 'button', onClick: () => st.setView({ atmosphere: true }) }, tr('panels.level.showIt')));
    };
    updHint();
    this.bindings.push({ update: updHint, view: true });
    const todHint = h('p', { class: 'le-hint' }, tr('panels.level.todHint'));
    this.body.appendChild(this._section(tr('panels.level.environment'), [
      h('div', { class: 'le-field' }, h('label', { class: 'le-field-label' }, tr('panels.level.startTime')), h('div', { class: 'le-field-control' }, tod.el)),
      todHint,
      h('div', { class: 'le-field' }, h('label', { class: 'le-field-label' }, tr('panels.level.weather')), h('div', { class: 'le-field-control' }, weather.el)),
      wHint,
      h('div', { class: 'le-field', title: tr('panels.level.waterTitle') }, h('label', { class: 'le-field-label' }, tr('panels.level.waterLabel')), h('div', { class: 'le-field-control' }, wl.el)),
    ]));
    this.body.appendChild(this._actions([
      { label: tr('panels.level.settings'), icon: ICONS.settings, onClick: () => this.actions.settings() },
      { label: tr('panels.level.resize'), icon: ICONS.resize, onClick: () => this.actions.resize() },
      { label: tr('panels.level.playtest'), icon: ICONS.play, primary: true, title: 'F5', onClick: () => this.actions.playtest() },
    ]));
    this.body.appendChild(h('p', { class: 'le-hint le-pad' }, tr('panels.level.footer')));
  }
}

function stat(label, value, title = '', warn = false) {
  return h('div', { class: ['le-stat', warn && 'is-warn'], title: title || null }, h('div', { class: 'le-stat-value' }, value), h('div', { class: 'le-stat-label' }, label));
}

const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

/**
 * Is a field value blank: null (a cleared nullable number), whitespace-only text, an empty list
 * (lines, dialogue, a script)?
 * @param {unknown} v
 */
export function isBlankValue(v) {
  return v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);
}

/**
 * Does the catalog give objects of `type` a default for the (dotted) field `key`? Fields without
 * one are optional: absent from files that do not use them.
 * @param {string} type
 * @param {string} key
 */
export function hasDefault(type, key) {
  const def = ownValue(OBJECT_TYPES, type);
  return !!def && getField(def.defaults, key) !== undefined;
}

/**
 * Move an object's own key `key` right after the key `after` ('' = to the front), keeping the
 * other keys in their order — the order a level file writes them in. Nothing happens when `after`
 * is no longer a key of the object. (The keys are put back as own data properties: a level's
 * hostile `__proto__` key stays a plain key.)
 * @param {object} obj
 * @param {string} key
 * @param {string} after
 */
export function moveKeyAfter(obj, key, after) {
  if (!Object.hasOwn(obj, key) || (after && !Object.hasOwn(obj, after))) return;
  const entries = Object.entries(obj).filter(([k]) => k !== key);
  entries.splice(after ? entries.findIndex(([k]) => k === after) + 1 : 0, 0, [key, obj[key]]);
  for (const k of Object.keys(obj)) delete obj[k];
  for (const [k, value] of entries) Object.defineProperty(obj, k, { value, writable: true, enumerable: true, configurable: true });
}

/**
 * Remove a dotted field from an object (nothing when a step of the path is missing).
 * @param {object} obj
 * @param {string} key
 */
export function deleteField(obj, key) {
  const parts = key.split('.');
  let v = obj;
  for (const k of parts.slice(0, -1)) {
    v = v?.[k];
    if (v == null || typeof v !== 'object') return;
  }
  delete v[parts[parts.length - 1]];
}
