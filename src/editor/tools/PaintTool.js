import { ICONS } from '../icons.js';
import { brushCells, lineCells, clipCells, cellKey, tileLabel, tileColor } from './common.js';
import { getTile, getHeightLevel } from '../../engine/level/LevelFormat.js';
import { ownValue } from '../../engine/utils/own.js';
import { tr } from '../i18n.js';

/** @import { Tool, ToolPreview } from './index.js' */

/** Cell colour of a tile char for previews. */
export function tilePreviewColor(state, ch) {
  const c = tileColor(ch, ownValue(state.level?.legend ?? {}, ch));
  return hexA(c, 0.55);
}

export function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(201,164,92,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Alt+click in terrain tools: pick the tile (and height) under the pointer. */
export function pickTileAt(state, ev, { height = true } = {}) {
  const ch = getTile(state.level, ev.i, ev.j);
  if (ch == null) return false;
  state.setToolOption('tile', ch);
  if (height) state.setToolOption('heightValue', getHeightLevel(state.level, ev.i, ev.j));
  state.notify(tr('tools.msg.pickedTile', { tile: tileLabel(state.level, ch), level: getHeightLevel(state.level, ev.i, ev.j) }));
  return true;
}

let stroke = null; // { last: {i,j}, painted: Set }
let hover = null;
let lastPoint = null; // end of the previous stroke (Shift+click draws a straight line from it)

function stamp(state, points) {
  const { tile, brushSize, brushShape, paintHeight, heightValue } = state.toolOptions;
  const cells = [];
  for (const p of points) for (const c of brushCells(p.i, p.j, brushSize, brushShape)) cells.push(c);
  const clipped = clipCells(state.level, cells).filter((c) => !stroke.painted.has(cellKey(c.i, c.j)));
  if (!clipped.length) return;
  for (const c of clipped) stroke.painted.add(cellKey(c.i, c.j));
  state.editTiles(clipped.map((c) => ({ i: c.i, j: c.j, tile, height: paintHeight ? heightValue : null })), tr('tools.undo.paint'));
}

/** @type {Tool} */
export const PaintTool = {
  id: 'paint',
  get label() { return tr('tools.paint.label'); },
  shortcut: 'B',
  icon: ICONS.brush,
  get help() { return tr('tools.help', { name: tr('tools.paint.name'), tip: tr('tools.paint.tip') }); },
  get tip() { return tr('tools.paint.tip'); },
  cursor: 'crosshair',

  activate() { stroke = null; },
  deactivate(state) { if (stroke) { stroke = null; state.commit(); } hover = null; },

  pointerDown(ev, state) {
    if (ev.alt) { pickTileAt(state, ev); return; }
    state.begin(tr('tools.undo.paint'));
    stroke = { last: { i: ev.i, j: ev.j }, painted: new Set() };
    if (ev.shift && lastPoint) stamp(state, lineCells(lastPoint.i, lastPoint.j, ev.i, ev.j));
    else stamp(state, [{ i: ev.i, j: ev.j }]);
    state.emit('preview');
  },

  pointerMove(ev, state) {
    const moved = !hover || hover.i !== ev.i || hover.j !== ev.j || hover.shift !== ev.shift;
    hover = { i: ev.i, j: ev.j, shift: ev.shift };
    if (stroke && (stroke.last.i !== ev.i || stroke.last.j !== ev.j)) {
      stamp(state, lineCells(stroke.last.i, stroke.last.j, ev.i, ev.j));
      stroke.last = { i: ev.i, j: ev.j };
    }
    if (moved) state.emit('preview');
  },

  pointerUp(ev, state) {
    if (!stroke) return;
    lastPoint = { ...stroke.last };
    stroke = null;
    state.commit();
    state.emit('preview');
  },

  /** @returns {ToolPreview|null} */
  preview(state) {
    const h = state.hover;
    if (!h || !hover) return null;
    const { brushSize, brushShape, tile } = state.toolOptions;
    let cells;
    if (!stroke && hover.shift && lastPoint) {
      cells = [];
      for (const p of lineCells(lastPoint.i, lastPoint.j, hover.i, hover.j)) cells.push(...brushCells(p.i, p.j, brushSize, brushShape));
      cells = clipCells(state.level, cells);
    } else {
      cells = clipCells(state.level, brushCells(hover.i, hover.j, brushSize, brushShape));
    }
    if (!cells.length) return null;
    return { cells, cellColor: tilePreviewColor(state, tile), label: brushSize > 1 ? `${tileLabel(state.level, tile)} · ${brushSize}×${brushSize}` : null };
  },
};
