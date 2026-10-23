import { ICONS } from '../icons.js';
import { floodRegion, tileLabel } from './common.js';
import { pickTileAt, tilePreviewColor } from './PaintTool.js';
import { tr, trn } from '../i18n.js';

/** @import { Tool, ToolPreview } from './index.js' */

const PREVIEW_LIMIT = 6000;

let hover = null;
let cache = null; // { key, cells }
let offChange = null;

function region(state, i, j, global) {
  const key = `${i},${j},${global ? 1 : 0},${state.toolOptions.fillMatchHeight ? 1 : 0}`;
  if (cache?.key === key) return cache.cells;
  const cells = floodRegion(state.level, i, j, { matchHeight: !!state.toolOptions.fillMatchHeight, global });
  cache = { key, cells };
  return cells;
}

/** @type {Tool} */
export const FillTool = {
  id: 'fill',
  get label() { return tr('tools.fill.label'); },
  shortcut: 'G',
  icon: ICONS.fill,
  get help() { return tr('tools.help', { name: tr('tools.fill.name'), tip: tr('tools.fill.tip') }); },
  get tip() { return tr('tools.fill.tip'); },
  cursor: 'crosshair',

  activate(state) {
    cache = null;
    offChange?.();
    offChange = state.on('change', () => { cache = null; });
  },
  deactivate() { offChange?.(); offChange = null; cache = null; hover = null; },

  pointerDown(ev, state) {
    if (ev.alt) { pickTileAt(state, ev); return; }
    const cells = region(state, ev.i, ev.j, ev.shift);
    if (!cells.length) return;
    const { tile, paintHeight, heightValue } = state.toolOptions;
    const n = state.editTiles(cells.map((c) => ({ i: c.i, j: c.j, tile, height: paintHeight ? heightValue : null })), ev.shift ? tr('tools.undo.replaceTiles') : tr('tools.undo.fill'));
    cache = null;
    state.notify(n ? trn('tools.msg.filled', n, { tile: tileLabel(state.level, tile) }) : tr('tools.msg.nothingToFill'));
    state.emit('preview');
  },

  pointerMove(ev, state) {
    const changed = !hover || hover.i !== ev.i || hover.j !== ev.j || hover.shift !== ev.shift;
    hover = { i: ev.i, j: ev.j, shift: ev.shift };
    if (changed) state.emit('preview');
  },

  pointerUp() {},

  /** @returns {ToolPreview|null} */
  preview(state) {
    if (!state.hover || !hover || !state.inBounds(hover.i, hover.j)) return null;
    const cells = region(state, hover.i, hover.j, hover.shift);
    const tile = tileLabel(state.level, state.toolOptions.tile);
    const label = hover.shift ? trn('tools.preview.replace', cells.length, { tile }) : trn('tools.preview.fill', cells.length, { tile });
    if (cells.length > PREVIEW_LIMIT) return { cells: [{ i: hover.i, j: hover.j }], cellColor: tilePreviewColor(state, state.toolOptions.tile), label };
    return { cells, cellColor: tilePreviewColor(state, state.toolOptions.tile).replace(/[\d.]+\)$/, '0.4)'), label };
  },
};
