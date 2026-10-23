import { ICONS } from '../icons.js';
import { OBJECT_TYPES } from '../../engine/level/ObjectCatalog.js';
import { tr, trn } from '../i18n.js';

/**
 * @import { Tool, PointerEv, ToolPreview } from './index.js'
 * @import { EditorState } from '../EditorState.js'
 */

let stroke = null; // { erased: string[] }
let hover = null;

/** @param {EditorState} state @param {PointerEv} ev */
function eraseAt(state, ev) {
  const id = ev.hitObjectId;
  if (!id || !state.getObject(id)) return;
  state.removeObjects([id], tr('tools.undo.erase'));
  stroke.erased.push(id);
}

/** @type {Tool} */
export const EraseTool = {
  id: 'erase',
  get label() { return tr('tools.erase.label'); },
  shortcut: 'X',
  icon: ICONS.erase,
  get help() { return tr('tools.help', { name: tr('tools.erase.name'), tip: tr('tools.erase.tip') }); },
  get tip() { return tr('tools.erase.tip'); },
  cursor: 'pointer',

  activate() { stroke = null; },
  deactivate(state) { if (stroke) { stroke = null; state.commit(); } hover = null; },

  pointerDown(ev, state) {
    state.begin(tr('tools.undo.erase'));
    stroke = { erased: [] };
    eraseAt(state, ev);
    state.emit('preview');
  },

  pointerMove(ev, state) {
    const changed = !hover || hover.hitObjectId !== ev.hitObjectId || hover.i !== ev.i || hover.j !== ev.j;
    hover = ev;
    if (stroke) eraseAt(state, ev);
    if (changed) state.emit('preview');
  },

  pointerUp(ev, state) {
    if (!stroke) return;
    const n = stroke.erased.length;
    stroke = null;
    state.commit();
    if (n) state.notify(trn('tools.msg.erased', n));
    state.emit('preview');
  },

  /** @returns {ToolPreview|null} */
  preview(state) {
    if (!state.hover || !hover) return null;
    const o = hover.hitObjectId ? state.getObject(hover.hitObjectId) : null;
    if (!o) return { cells: [{ i: hover.i, j: hover.j }], cellColor: 'rgba(255,110,100,0.18)' };
    return { highlight: { ids: [o.id], color: '#ff6b5e' }, label: tr('tools.preview.erase', { name: o.name || o.id, type: OBJECT_TYPES[o.type].label }) };
  },
};
