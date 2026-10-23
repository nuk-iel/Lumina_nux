import { ICONS } from '../icons.js';
import { rectCells, clipCells, tileLabel } from './common.js';
import { pickTileAt, tilePreviewColor } from './PaintTool.js';
import { tr } from '../i18n.js';

/** @import { Tool, ToolPreview } from './index.js' */

let drag = null; // { i0, j0, i1, j1, outline }
let hover = null;

function outlineOf(state, ev) {
  return !!state.toolOptions.rectOutline !== !!ev.shift;
}

/** @type {Tool} */
export const RectTool = {
  id: 'rect',
  get label() { return tr('tools.rect.label'); },
  shortcut: 'U',
  icon: ICONS.rect,
  get help() { return tr('tools.help', { name: tr('tools.rect.name'), tip: tr('tools.rect.tip') }); },
  get tip() { return tr('tools.rect.tip'); },
  cursor: 'crosshair',

  activate() { drag = null; },
  deactivate(state) { drag = null; hover = null; state.emit('preview'); },

  pointerDown(ev, state) {
    if (ev.alt) { pickTileAt(state, ev); return; }
    drag = { i0: ev.i, j0: ev.j, i1: ev.i, j1: ev.j, outline: outlineOf(state, ev) };
    state.emit('preview');
  },

  pointerMove(ev, state) {
    hover = { i: ev.i, j: ev.j };
    if (drag) {
      drag.i1 = ev.i;
      drag.j1 = ev.j;
      drag.outline = outlineOf(state, ev);
    }
    state.emit('preview');
  },

  pointerUp(ev, state) {
    if (!drag) return;
    const d = drag;
    drag = null;
    // the rectangle is applied on release: an interrupted drag (`ev.cancelled`) is dropped, like Esc
    if (!ev.cancelled) {
      const cells = clipCells(state.level, rectCells(d.i0, d.j0, d.i1, d.j1, d.outline));
      const { tile, paintHeight, heightValue } = state.toolOptions;
      if (cells.length) state.editTiles(cells.map((c) => ({ ...c, tile, height: paintHeight ? heightValue : null })), tr('tools.undo.rectangle'));
    }
    state.emit('preview');
  },

  keyDown(e, state) {
    if (e.key === 'Escape' && drag) { drag = null; state.emit('preview'); return true; }
    return false;
  },

  /** @returns {ToolPreview|null} */
  preview(state) {
    const color = tilePreviewColor(state, state.toolOptions.tile);
    if (drag) {
      const w = Math.abs(drag.i1 - drag.i0) + 1;
      const d = Math.abs(drag.j1 - drag.j0) + 1;
      return {
        cells: rectCells(drag.i0, drag.j0, drag.i1, drag.j1, drag.outline),
        cellColor: color,
        rect: { minX: Math.min(drag.i0, drag.i1), maxX: Math.max(drag.i0, drag.i1) + 1, minZ: Math.min(drag.j0, drag.j1), maxZ: Math.max(drag.j0, drag.j1) + 1 },
        label: `${w} × ${d} · ${tileLabel(state.level, state.toolOptions.tile)}${drag.outline ? tr('tools.preview.outline') : ''}`,
      };
    }
    if (!state.hover || !hover) return null;
    return { cells: [{ i: hover.i, j: hover.j }], cellColor: color };
  },
};
