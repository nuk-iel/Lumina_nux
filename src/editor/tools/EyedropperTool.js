import { ICONS } from '../icons.js';
import { tileLabel } from './common.js';
import { OBJECT_TYPES } from '../../engine/level/ObjectCatalog.js';
import { getTile, getHeightLevel } from '../../engine/level/LevelFormat.js';
import { tr } from '../i18n.js';

/** @import { Tool, ToolPreview } from './index.js' */

const TERRAIN_TOOLS = new Set(['paint', 'fill', 'rect', 'height']);

let hover = null;

/** @type {Tool} */
export const EyedropperTool = {
  id: 'eyedropper',
  get label() { return tr('tools.eyedropper.label'); },
  shortcut: 'I',
  icon: ICONS.eyedropper,
  get help() { return tr('tools.help', { name: tr('tools.eyedropper.name'), tip: tr('tools.eyedropper.tip') }); },
  get tip() { return tr('tools.eyedropper.tip'); },
  cursor: 'crosshair',

  deactivate() { hover = null; },

  pointerDown(ev, state) {
    const back = state.prevToolId && state.prevToolId !== 'eyedropper' ? state.prevToolId : 'paint';
    if (ev.hitObjectId) {
      const o = state.getObject(ev.hitObjectId);
      if (o) {
        state.setToolOption('objectType', o.type);
        state.notify(tr('tools.msg.pickedType', { label: OBJECT_TYPES[o.type].label }));
        if (!ev.shift) state.setTool('place');
        return;
      }
    }
    const ch = getTile(state.level, ev.i, ev.j);
    if (ch == null) return;
    const lvl = getHeightLevel(state.level, ev.i, ev.j);
    state.setToolOption('tile', ch);
    state.setToolOption('heightValue', lvl);
    state.notify(tr('tools.msg.pickedTile', { tile: tileLabel(state.level, ch), level: lvl }));
    if (!ev.shift) state.setTool(TERRAIN_TOOLS.has(back) ? back : 'paint');
  },

  pointerMove(ev, state) {
    const changed = !hover || hover.i !== ev.i || hover.j !== ev.j || hover.hitObjectId !== ev.hitObjectId;
    hover = ev;
    if (changed) state.emit('preview');
  },

  pointerUp() {},

  /** @returns {ToolPreview|null} */
  preview(state) {
    if (!state.hover || !hover) return null;
    if (hover.hitObjectId) {
      const o = state.getObject(hover.hitObjectId);
      if (o) return { highlight: { ids: [o.id], color: '#7fe3ff' }, label: tr('tools.preview.pick', { label: OBJECT_TYPES[o.type].label }) };
    }
    const ch = getTile(state.level, hover.i, hover.j);
    if (ch == null) return null;
    return {
      cells: [{ i: hover.i, j: hover.j }],
      cellColor: 'rgba(127,227,255,0.35)',
      label: `${tileLabel(state.level, ch)} · ${tr('tools.levelN', { level: getHeightLevel(state.level, hover.i, hover.j) })}`,
    };
  },
};
