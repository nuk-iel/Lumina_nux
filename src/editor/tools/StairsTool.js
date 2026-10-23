import { ICONS } from '../icons.js';
import { lineCells, cellKey } from './common.js';
import { getTile } from '../../engine/level/LevelFormat.js';
import { tr, trn } from '../i18n.js';

/**
 * @import { Level } from '../../engine/level/types.js'
 * @import { Tool, ToolPreview } from './index.js'
 */

/** Stairs direction → tile char (TILE_TYPES 'stairs' category). */
export const STAIRS_CHARS = { N: '^', S: 'v', E: '>', W: '<' };
const CHAR_DIR = { '^': 'N', v: 'S', '>': 'E', '<': 'W' };
const OFFSETS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };
const ARROWS = { N: '↑', S: '↓', E: '→', W: '←' };
const AXIS_DIRS = { NS: ['N', 'S'], EW: ['E', 'W'] };

/**
 * Work out a stairs tile at (i, j). A stairs tile at level L rising toward `dir` joins its low
 * side (level L) to its high side (level L + 1) — one level (0.5 units) per tile.
 *  1. A direction fits when the high neighbour is at least one level above the tile and the low
 *     neighbour not above it: the tile keeps its own level (a ramp sculpted one level per tile
 *     turns into stairs as it is). The stroke's axis (`axis` 'NS' | 'EW': a vertical drag makes
 *     N/S stairs) is preferred, then the biggest rise, then the higher top.
 *  2. Otherwise the stairs rise toward the highest neighbour and take the lower side's level
 *     (a step carved into a ledge).
 * `heightOf(i, j)` returns a level or null outside the map.
 * @param {Level} level
 * @param {number} i
 * @param {number} j
 * @param {(i: number, j: number) => number|null} heightOf
 * @param {'auto'|'N'|'S'|'E'|'W'} [forced] a fixed direction ('auto': worked out as above)
 * @param {'NS'|'EW'|null} [axis] the stroke's axis (null: none)
 * @returns {{ dir: 'N'|'S'|'E'|'W', level: number, auto: boolean, ok: boolean, cliff: number }}
 *   cliff: levels between the stairs' top and the ground they lead to (> 1: not reachable yet)
 */
export function stairsFor(level, i, j, heightOf, forced = 'auto', axis = null) {
  const own = heightOf(i, j) ?? 0;
  const h = (d) => {
    const [di, dj] = OFFSETS[d];
    return heightOf(i + di, j + dj) ?? own;
  };
  if (forced && forced !== 'auto') {
    const hi = h(forced);
    const lo = h(OPPOSITE[forced]);
    const lvl = hi > lo ? Math.min(Math.max(own, lo), hi - 1) : Math.max(0, Math.min(own, hi - 1));
    return { dir: forced, level: lvl, auto: false, ok: hi > lvl, cliff: hi - lvl };
  }
  const groups = axis ? [AXIS_DIRS[axis], AXIS_DIRS[axis === 'NS' ? 'EW' : 'NS']] : [['N', 'S', 'E', 'W']];
  for (const group of groups) {
    let best = null;
    for (const d of group) {
      const hi = h(d);
      const lo = h(OPPOSITE[d]);
      if (hi < own + 1 || lo > own) continue;
      const score = (hi - lo) * 100 + hi;
      if (!best || score > best.score) best = { d, hi, score };
    }
    if (best) return { dir: best.d, level: own, auto: true, ok: true, cliff: best.hi - own };
  }
  let best = null;
  for (const d of ['N', 'S', 'E', 'W']) {
    const hi = h(d);
    const lo = h(OPPOSITE[d]);
    const rise = hi - lo;
    const score = rise * 100 + hi;
    if (!best || score > best.score) best = { d, hi, lo, rise, score };
  }
  if (best.rise > 0) return { dir: best.d, level: best.lo, auto: true, ok: true, cliff: best.hi - best.lo };
  if (best.hi > own) return { dir: best.d, level: best.hi - 1, auto: true, ok: true, cliff: 1 };
  // flat: keep an existing stairs direction, otherwise north
  const dir = CHAR_DIR[getTile(level, i, j)] ?? 'N';
  return { dir, level: own, auto: true, ok: false, cliff: 0 };
}

/** 'NS' when the cells span more rows than columns, 'EW' for the reverse, else null. */
function strokeAxis(cells) {
  if (cells.length < 2) return null;
  let minI = Infinity; let maxI = -Infinity; let minJ = Infinity; let maxJ = -Infinity;
  for (const c of cells) {
    minI = Math.min(minI, c.i); maxI = Math.max(maxI, c.i);
    minJ = Math.min(minJ, c.j); maxJ = Math.max(maxJ, c.j);
  }
  if (maxJ - minJ > maxI - minI) return 'NS';
  if (maxI - minI > maxJ - minJ) return 'EW';
  return null;
}

/**
 * Stairs for a whole stroke (all its cells, from the heights at the stroke's start).
 * A stroke across a cliff more than one level high builds the full flight: along the stroke's
 * axis, the cells on the low side of the biggest drop become stairs one level per tile — top − 1
 * next to the cliff, down to the level of the ground they stand on (the foot). Cells on the high
 * side stay as they are, and so do flat cells past the foot (a stroke started a tile or two below
 * it). Other cells get `stairsFor`.
 * @param {Level} level
 * @param {{ i: number, j: number }[]} cells the stroke's cells, in stroke order
 * @param {(i: number, j: number) => number|null} heightOf level at a tile (null outside the map)
 * @param {'auto'|'N'|'S'|'E'|'W'} [forced] a fixed direction ('auto': per cell)
 * @returns {{ cells: Map<string, { i, j, dir, level }>, short: number, flat: boolean, maxCliff: number }}
 *   short: tiles still missing for the tallest flight to reach the ground; flat: some cell has no
 *   ledge at all; maxCliff: the tallest single-tile stairs gap left
 */
export function planStairs(level, cells, heightOf, forced = 'auto') {
  const out = new Map();
  const axis = strokeAxis(cells);
  const inRamp = new Set();
  const pastFoot = new Set();
  let short = 0;
  let flat = false;
  let maxCliff = 0;
  const allowed = (d) => !forced || forced === 'auto' || forced === d;
  if (axis) {
    // lines of cells along the axis (a column for N/S strokes, a row for E/W ones)
    const lines = new Map();
    for (const c of cells) {
      const k = axis === 'NS' ? c.i : c.j;
      if (!lines.has(k)) lines.set(k, []);
      lines.get(k).push(c);
    }
    const [dBefore, dAfter] = axis === 'NS' ? ['N', 'S'] : ['W', 'E'];
    for (const [cross, list] of lines) {
      const along = (c) => (axis === 'NS' ? c.j : c.i);
      list.sort((a, b) => along(a) - along(b));
      // contiguous runs only
      const runs = [[list[0]]];
      for (let k = 1; k < list.length; k++) {
        if (along(list[k]) === along(list[k - 1])) continue;
        if (along(list[k]) === along(list[k - 1]) + 1) runs[runs.length - 1].push(list[k]);
        else runs.push([list[k]]);
      }
      for (const run of runs) {
        if (run.length < 2) continue;
        const at = (p) => (axis === 'NS' ? heightOf(cross, p) : heightOf(p, cross));
        const p0 = along(run[0]);
        const seq = [];
        for (let p = p0 - 1; p <= p0 + run.length; p++) seq.push(at(p));
        // the biggest drop (≥ 2 levels) between neighbours along the run (and its end neighbours)
        let best = null;
        for (let k = 0; k + 1 < seq.length; k++) {
          const a = seq[k];
          const b = seq[k + 1];
          if (a == null || b == null) continue;
          const drop = Math.abs(a - b);
          if (drop >= 2 && (!best || drop > best.drop)) best = { k, drop, highFirst: a > b };
        }
        if (!best) continue;
        // highFirst: the cliff top is before (N / W): the stairs rise toward it
        const dir = best.highFirst ? dBefore : dAfter;
        if (!allowed(dir)) continue;
        const top = best.highFirst ? seq[best.k] : seq[best.k + 1];
        // run indices on the low side, nearest the cliff first
        const idx = [];
        if (best.highFirst) for (let r = best.k; r < run.length; r++) idx.push(r);
        else for (let r = best.k - 1; r >= 0; r--) idx.push(r);
        let target = top - 1;
        let reached = false;
        let stop = idx.length; // idx[stop…] lie past the foot of the flight
        for (let n = 0; n < idx.length; n++) {
          const c = run[idx[n]];
          const own = heightOf(c.i, c.j) ?? 0;
          if (target < own) { reached = true; stop = n; break; } // the previous tile was the foot
          out.set(cellKey(c.i, c.j), { i: c.i, j: c.j, dir, level: target });
          inRamp.add(cellKey(c.i, c.j));
          if (target === own) { reached = true; target--; stop = n + 1; break; }
          target--;
        }
        // a stroke that began (or ended) a little beyond the foot: those cells get stairs only
        // where they have a ledge of their own (flat ground there stays as it is)
        for (let n = stop; n < idx.length; n++) pastFoot.add(cellKey(run[idx[n]].i, run[idx[n]].j));
        if (!reached) {
          // the flight ends in the air: how many more tiles would reach the ground
          const lastOwn = heightOf(run[idx[idx.length - 1]].i, run[idx[idx.length - 1]].j) ?? 0;
          short = Math.max(short, target + 1 - lastOwn);
        }
        // the high side (the cliff top the stroke started / ended on) stays as it is
        for (let r = 0; r < run.length; r++) {
          const onHigh = best.highFirst ? r < best.k : r >= best.k;
          if (onHigh) inRamp.add(cellKey(run[r].i, run[r].j));
        }
      }
    }
  }
  for (const c of cells) {
    const key = cellKey(c.i, c.j);
    if (inRamp.has(key)) continue;
    const s = stairsFor(level, c.i, c.j, heightOf, forced, axis);
    if (!s.ok && pastFoot.has(key)) continue;
    if (!s.ok) flat = true;
    else if (s.cliff > 1) maxCliff = Math.max(maxCliff, s.cliff);
    out.set(key, { i: c.i, j: c.j, dir: s.dir, level: s.level });
  }
  return { cells: out, short, flat, maxCliff };
}

let stroke = null; // { cells:[], keys:Set, heightOf, tileOf, last, plan }
let hover = null;

function snapshotHeights(level) {
  const rows = [...level.heights];
  return (i, j) => (i < 0 || j < 0 || i >= level.width || j >= level.depth ? null : parseInt(rows[j][i], 36));
}

function snapshotTiles(level) {
  const rows = [...level.tiles];
  return (i, j) => rows[j]?.[i] ?? null;
}

/** Re-plan the whole stroke and apply the difference to the level (one transaction). */
function apply(state) {
  const plan = planStairs(state.level, stroke.cells, stroke.heightOf, state.toolOptions.stairsDir ?? 'auto');
  stroke.plan = plan;
  const edits = [];
  for (const c of stroke.cells) {
    const p = plan.cells.get(cellKey(c.i, c.j));
    // cells a longer stroke no longer turns into stairs go back to what they were
    const tile = p ? STAIRS_CHARS[p.dir] : stroke.tileOf(c.i, c.j);
    const height = p ? p.level : stroke.heightOf(c.i, c.j);
    if (state.getTile(c.i, c.j) !== tile || state.getHeight(c.i, c.j) !== height) edits.push({ i: c.i, j: c.j, tile, height });
  }
  if (edits.length) state.editTiles(edits, tr('tools.undo.stairs'));
}

function addCells(state, cells) {
  let added = false;
  for (const c of cells) {
    if (!state.inBounds(c.i, c.j)) continue;
    const k = cellKey(c.i, c.j);
    if (stroke.keys.has(k)) continue;
    stroke.keys.add(k);
    stroke.cells.push({ i: c.i, j: c.j });
    added = true;
  }
  return added;
}

function strokeMessage(plan) {
  if (plan.short > 0) return trn('tools.msg.stairsShort', plan.short);
  if (plan.flat) return tr('tools.msg.stairsFlat');
  if (plan.maxCliff > 1) return tr('tools.msg.stairsCliff', { n: plan.maxCliff });
  return '';
}

/** @type {Tool} */
export const StairsTool = {
  id: 'stairs',
  get label() { return tr('tools.stairs.label'); },
  shortcut: 'T',
  icon: ICONS.stairs,
  get help() { return tr('tools.help', { name: tr('tools.stairs.name'), tip: tr('tools.stairs.tip') }); },
  get tip() { return tr('tools.stairs.tip'); },
  cursor: 'crosshair',

  activate() { stroke = null; },
  deactivate(state) { if (stroke) { stroke = null; state.commit(); } hover = null; },

  pointerDown(ev, state) {
    state.begin(tr('tools.undo.stairs'));
    stroke = { cells: [], keys: new Set(), heightOf: snapshotHeights(state.level), tileOf: snapshotTiles(state.level), last: { i: ev.i, j: ev.j }, plan: null };
    if (addCells(state, [{ i: ev.i, j: ev.j }])) apply(state);
    state.emit('preview');
  },

  pointerMove(ev, state) {
    const moved = !hover || hover.i !== ev.i || hover.j !== ev.j;
    hover = { i: ev.i, j: ev.j };
    if (stroke && (stroke.last.i !== ev.i || stroke.last.j !== ev.j)) {
      if (addCells(state, lineCells(stroke.last.i, stroke.last.j, ev.i, ev.j))) apply(state);
      stroke.last = { i: ev.i, j: ev.j };
    }
    if (moved) state.emit('preview');
  },

  pointerUp(ev, state) {
    if (!stroke) return;
    const plan = stroke.plan;
    stroke = null;
    state.commit();
    const msg = plan ? strokeMessage(plan) : '';
    if (msg) state.notify(msg);
    state.emit('preview');
  },

  /** @returns {ToolPreview|null} */
  preview(state) {
    if (!state.hover || !hover || !state.inBounds(hover.i, hover.j)) return null;
    const planned = stroke?.plan?.cells.get(cellKey(hover.i, hover.j));
    if (planned) {
      return {
        cells: [{ i: hover.i, j: hover.j }],
        cellColor: 'rgba(230,220,200,0.55)',
        label: tr('tools.preview.stairs', { arrow: ARROWS[planned.dir], dir: planned.dir, from: planned.level, to: planned.level + 1 }),
      };
    }
    const heightOf = stroke?.heightOf ?? snapshotHeights(state.level);
    const s = stairsFor(state.level, hover.i, hover.j, heightOf, state.toolOptions.stairsDir ?? 'auto');
    const tall = s.ok && s.cliff > 1 ? ` · ${tr('tools.preview.stairsTall', { n: s.cliff })}` : '';
    return {
      cells: [{ i: hover.i, j: hover.j }],
      cellColor: s.ok ? 'rgba(230,220,200,0.55)' : 'rgba(255,120,100,0.45)',
      label: `${tr('tools.preview.stairs', { arrow: ARROWS[s.dir], dir: s.dir, from: s.level, to: s.level + 1 })}${s.ok ? tall : tr('tools.preview.noLedge')}`,
    };
  },
};
