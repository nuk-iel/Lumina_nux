/**
 * Helpers shared by the editor tools: brush footprints, cell lines, snapping, flood fill and
 * selection operations (delete / duplicate / rotate / nudge / copy / paste), which the select
 * tool binds to keys and the app binds to menu commands.
 */
import { OBJECT_TYPES, objectCenter, objectBounds } from '../../engine/level/ObjectCatalog.js';
import { TILE_TYPES, TILE_BY_CHAR, getHeightLevel, inBounds } from '../../engine/level/LevelFormat.js';
import { shiftLegacyFields } from '../EditorState.js';
import { isOwnKey, ownValue } from '../../engine/utils/own.js';
import { tr, trn } from '../i18n.js';
import { optionLabel } from '../catalogI18n.js';

/** @import { TileDef, LevelObject } from '../../engine/level/types.js' */

/** Default world tolerance (≈ 7 px at the 2D view's default zoom) when a view gives none. */
export const DEFAULT_PICK = 0.35;

/** Key for a cell in Sets / Maps. */
export const cellKey = (i, j) => `${i},${j}`;

/**
 * Cells covered by a brush of `size` (1-9) and `shape` ('square' | 'circle') centred on (i, j).
 * Even sizes extend toward +i / +j.
 * @returns {{i:number,j:number}[]}
 */
export function brushCells(i, j, size = 1, shape = 'square') {
  const n = Math.max(1, Math.min(9, Math.round(size)));
  const off = Math.floor((n - 1) / 2);
  const out = [];
  const cx = i - off + n / 2;
  const cz = j - off + n / 2;
  const r = n / 2 - 0.25;
  for (let b = j - off; b < j - off + n; b++) {
    for (let a = i - off; a < i - off + n; a++) {
      if (shape === 'circle' && n > 2) {
        const dx = a + 0.5 - cx;
        const dz = b + 0.5 - cz;
        if (dx * dx + dz * dz > r * r + 0.01) continue;
      }
      out.push({ i: a, j: b });
    }
  }
  return out;
}

/** Tile cells on the line from (i0, j0) to (i1, j1), inclusive (Bresenham, 4-connected-safe). */
export function lineCells(i0, j0, i1, j1) {
  const out = [];
  let x = i0;
  let y = j0;
  const dx = Math.abs(i1 - i0);
  const dy = -Math.abs(j1 - j0);
  const sx = i0 < i1 ? 1 : -1;
  const sy = j0 < j1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 4096; guard++) {
    out.push({ i: x, j: y });
    if (x === i1 && y === j1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}

/** Cells of the tile rectangle spanned by two corners (outline only if `outline`). */
export function rectCells(i0, j0, i1, j1, outline = false) {
  const minI = Math.min(i0, i1);
  const maxI = Math.max(i0, i1);
  const minJ = Math.min(j0, j1);
  const maxJ = Math.max(j0, j1);
  const out = [];
  for (let j = minJ; j <= maxJ; j++) {
    for (let i = minI; i <= maxI; i++) {
      if (outline && i !== minI && i !== maxI && j !== minJ && j !== maxJ) continue;
      out.push({ i, j });
    }
  }
  return out;
}

/** Keep only cells inside the level, deduplicated. */
export function clipCells(level, cells) {
  const seen = new Set();
  const out = [];
  for (const c of cells) {
    if (!inBounds(level, c.i, c.j)) continue;
    const k = cellKey(c.i, c.j);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/** Round to a multiple of `step` (step ≤ 0 = unchanged). */
export const snapTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);

/** Rounded to 3 decimals so coordinates stay tidy in files. */
export const tidy = (v) => Math.round(v * 1000) / 1000;

/**
 * Snap step for placing / moving objects: the catalog `snap` of the type (or 0.5), 0 when
 * snapping is off or Alt is held.
 */
export function snapStep(state, ev, type = null) {
  if (ev?.alt || !state.toolOptions.snap) return 0;
  return (type && OBJECT_TYPES[type]?.snap) || 0.5;
}

/**
 * Flat 2D colour of a legend entry (palette bars, status-bar dot, brush previews — the rule of
 * the 2D map): the built-in tile's colour; a custom char takes the colour of the built-in tile with
 * the same top texture and kind (e.g. a custom east-flowing river is river blue, a custom blocked
 * road is dirt-path brown), else water blue, void black or moss grey.
 * @param {string} ch
 * @param {TileDef} [def] the level's legend entry for `ch`
 * @returns {string}
 */
export function tileColor(ch, def = null) {
  const t = ownValue(TILE_BY_CHAR, ch);
  if (t && (!def || (t.def.top === def.top && !!t.def.water === !!def.water))) return t.color;
  if (!def) return '#6b7a5a';
  if (def.void) return '#101018';
  const same = TILE_TYPES.find((tt) => tt.def.top === def.top && !!tt.def.water === !!def.water && !tt.def.stairs);
  if (same) return same.color;
  return def.water ? '#3b7fa6' : '#6b7a5a';
}

/** Display name of a tile char. */
export function tileLabel(level, ch) {
  if (ch == null) return '';
  const t = ownValue(TILE_BY_CHAR, ch);
  const d = ownValue(level.legend, ch);
  if (t && d) return t.name;
  return d ? tr('tools.tile.customTop', { ch, top: d.top != null ? optionLabel(d.top) : tr('tools.tile.void') }) : tr('tools.tile.unknown', { ch });
}

/**
 * Flood fill: contiguous (4-neighbour) cells with the same tile char as (i, j) — and the same
 * height level when `matchHeight`. `global` selects every matching cell of the map instead.
 * Bounded by the map and by `limit` cells.
 * @returns {{i:number,j:number}[]}
 */
export function floodRegion(level, i, j, { matchHeight = false, global = false, limit = 128 * 128 } = {}) {
  if (!inBounds(level, i, j)) return [];
  const ch = level.tiles[j][i];
  const hc = level.heights[j][i];
  const match = (a, b) => level.tiles[b][a] === ch && (!matchHeight || level.heights[b][a] === hc);
  const out = [];
  if (global) {
    for (let b = 0; b < level.depth; b++) for (let a = 0; a < level.width; a++) if (match(a, b)) out.push({ i: a, j: b });
    return out;
  }
  const W = level.width;
  const seen = new Uint8Array(W * level.depth);
  const stack = [i, j];
  seen[j * W + i] = 1;
  while (stack.length && out.length < limit) {
    const b = stack.pop();
    const a = stack.pop();
    out.push({ i: a, j: b });
    const nb = [a + 1, b, a - 1, b, a, b + 1, a, b - 1];
    for (let k = 0; k < 8; k += 2) {
      const x = nb[k];
      const y = nb[k + 1];
      if (x < 0 || y < 0 || x >= W || y >= level.depth || seen[y * W + x]) continue;
      seen[y * W + x] = 1;
      if (match(x, y)) stack.push(x, y);
    }
  }
  return out;
}

/** Height level at (i, j), or `fallback` outside the map. */
export const heightAt = (level, i, j, fallback = 0) => getHeightLevel(level, i, j) ?? fallback;

// ---------------------------------------------------------------------------------------------
// Selection operations
// ---------------------------------------------------------------------------------------------

/**
 * Is a level object shown on the 2D map (and so box-selectable): not a hidden type, and its
 * toggle on — markers, critter and enemy groups follow *Show markers*, everything else *Show
 * objects*.
 * @param {{ hiddenTypes?: string[], showMarkers?: boolean, showObjects?: boolean }} view state.view
 * @param {LevelObject} o level object
 */
export function shownOnMap(view, o) {
  const toggle = viewToggleOf(o);
  if (!toggle) return false;
  if (view.hiddenTypes?.length && view.hiddenTypes.includes(o.type)) return false;
  return view[toggle] !== false;
}

/**
 * The View menu toggle a level object follows on the 2D map: *Show markers* (`showMarkers`) for
 * markers, critter and enemy groups, *Show objects* (`showObjects`) for everything else; null for
 * an unknown type.
 * @param {LevelObject|null|undefined} o
 * @returns {'showMarkers'|'showObjects'|null}
 */
export function viewToggleOf(o) {
  const def = ownValue(OBJECT_TYPES, o?.type);
  if (!def) return null;
  return def.kind === 'marker' || o.type === 'critters' || o.type === 'enemy' ? 'showMarkers' : 'showObjects';
}

/** Delete the selected objects (the spawn marker cannot be deleted). */
export function deleteSelection(state) {
  const ids = state.selection.filter((id) => id !== 'spawn');
  if (!ids.length) return false;
  state.removeObjects(ids, trn('tools.undo.delete', ids.length));
  state.notify(ids.length > 1 ? tr('tools.msg.deletedMany', { n: ids.length }) : tr('tools.msg.deletedOne', { id: ids[0] }));
  return true;
}

/** Duplicate the selected objects, offset by (dx, dz); selects the copies. */
export function duplicateSelection(state, dx = 1, dz = 1) {
  const objs = state.selectedObjects;
  if (!objs.length) return false;
  const copies = objs.map((o) => offsetObject(JSON.parse(JSON.stringify(o)), dx, dz));
  state.begin(tr('tools.undo.duplicate'));
  state.insertObjects(copies);
  state.commit();
  state.notify(copies.length > 1 ? tr('tools.msg.duplicatedMany', { n: copies.length }) : tr('tools.msg.duplicatedOne', { id: objs[0].id }));
  return true;
}

/** Move a plain object (not in the level) by (dx, dz) in place; returns it. */
export function offsetObject(o, dx, dz) {
  const p = OBJECT_TYPES[o.type]?.placement;
  if (p === 'line') { o.x0 = tidy(o.x0 + dx); o.x1 = tidy(o.x1 + dx); o.z0 = tidy(o.z0 + dz); o.z1 = tidy(o.z1 + dz); }
  else if (p === 'rect') { o.minX = tidy(o.minX + dx); o.maxX = tidy(o.maxX + dx); o.minZ = tidy(o.minZ + dz); o.maxZ = tidy(o.maxZ + dz); }
  else { o.x = tidy(o.x + dx); o.z = tidy(o.z + dz); shiftLegacyFields(o, dx, dz); }
  return o;
}

// successive +90° turns (rotation.y, counter-clockwise from above): local +Z ("down" / S) → +X
const FACING_CYCLE = ['down', 'right', 'up', 'left'];
const CARD_CYCLE = ['S', 'E', 'N', 'W'];

/**
 * Rotate the selection by `delta` radians (positive = counter-clockwise seen from above, the
 * engine's rotation.y). One object turns in place (lines about their midpoint); several objects
 * turn as a group about their common centre (snapped to 0.5 so grid-aligned layouts stay on the
 * grid). Regions and particle areas stay axis-aligned (their extents swap on quarter turns);
 * waterfalls, NPCs and the player start face one of four directions, so they turn in 90° steps
 * (a single one also turns a quarter for a 15° step, otherwise R would do nothing). The relative
 * fields of NPCs (`talkOffset`, chase `area`), critter groups (yard `area`, `spotOffsets`) and
 * enemy groups (boss `arena`, `gate`, scatter `area`, `spotOffsets`) turn with their object in
 * the same 90° steps (rects stay axis-aligned, like the game's); an object of a group turned by
 * another angle keeps them as they were (a notice says so).
 */
export function rotateSelection(state, delta) {
  if (!state.selection.length || !delta) return false;
  const HALF_PI = Math.PI / 2;
  const quarters = Math.round(delta / HALF_PI);
  const exactQuarter = quarters !== 0 && Math.abs(delta - quarters * HALF_PI) < 1e-6;
  const group = state.selection.length > 1;
  // quarter turns for things that only face four ways
  const facingTurns = exactQuarter ? quarters : group ? 0 : Math.sign(delta);
  const oddQuarter = mod(facingTurns, 2) === 1;
  let pivot = null;
  if (group) {
    const b = selectionBounds(state);
    if (b) pivot = { x: snapTo((b.minX + b.maxX) / 2, 0.5), z: snapTo((b.minZ + b.maxZ) / 2, 0.5) };
  }
  const c = Math.cos(delta);
  const s = Math.sin(delta);
  /** (x, z) turned about (cx, cz). */
  const turn = (x, z, cx, cz) => [tidy(cx + (x - cx) * c + (z - cz) * s), tidy(cz - (x - cx) * s + (z - cz) * c)];
  /** A point carried along with the group (unchanged for a single object). */
  const orbit = (x, z) => (pivot ? turn(x, z, pivot.x, pivot.z) : [x, z]);

  /** Objects whose relative fields could not follow a turn that is not a quarter. */
  const kept = [];
  const undoLabel = tr('tools.undo.rotate');
  state.begin(undoLabel);
  for (const id of state.selection) {
    if (id === 'spawn') {
      const sp = state.level.spawn;
      const [x, z] = orbit(sp.x, sp.z);
      const k = FACING_CYCLE.indexOf(sp.facing);
      state.setSpawn(x, z, facingTurns ? FACING_CYCLE[mod(k + facingTurns, 4)] : sp.facing);
      continue;
    }
    state.updateObject(id, (o) => {
      const def = OBJECT_TYPES[o.type];
      if (def.placement === 'line') {
        const cx = pivot ? pivot.x : (o.x0 + o.x1) / 2;
        const cz = pivot ? pivot.z : (o.z0 + o.z1) / 2;
        [o.x0, o.z0] = turn(o.x0, o.z0, cx, cz);
        [o.x1, o.z1] = turn(o.x1, o.z1, cx, cz);
        return;
      }
      if (def.placement === 'rect') {
        if (!group && !exactQuarter && Math.abs(delta) < Math.PI / 4) return;
        let hw = (o.maxX - o.minX) / 2;
        let hd = (o.maxZ - o.minZ) / 2;
        const [cx, cz] = orbit((o.minX + o.maxX) / 2, (o.minZ + o.maxZ) / 2);
        if (oddQuarter) [hw, hd] = [hd, hw];
        Object.assign(o, { minX: tidy(cx - hw), maxX: tidy(cx + hw), minZ: tidy(cz - hd), maxZ: tidy(cz + hd) });
        return;
      }
      const [ox, oz] = [o.x, o.z];
      [o.x, o.z] = orbit(o.x, o.z);
      shiftLegacyFields(o, o.x - ox, o.z - oz);
      if (o.type === 'waterfall') {
        const k = CARD_CYCLE.indexOf(o.facing ?? 'S');
        if (facingTurns) o.facing = CARD_CYCLE[mod(k + facingTurns, 4)];
      } else if (o.type === 'npc') {
        const k = FACING_CYCLE.indexOf(o.facing ?? 'down');
        if (facingTurns) o.facing = FACING_CYCLE[mod(k + facingTurns, 4)];
        if (!turnRelativeFields(o, facingTurns) && hasRelativeFields(o)) kept.push(o.id);
      } else if (o.type === 'emitter') {
        if (oddQuarter && Array.isArray(o.size)) o.size = [o.size[2], o.size[1], o.size[0]];
      } else if (o.type === 'enemy' || o.type === 'critters') {
        if (!turnRelativeFields(o, facingTurns) && hasRelativeFields(o)) kept.push(o.id);
      } else if (def.rotatable || o.rotation != null) {
        o.rotation = normalizeAngle((o.rotation ?? 0) + delta);
      }
    }, undoLabel);
  }
  state.commit();
  if (kept.length) state.notify(tr('tools.msg.rotateKept', { what: kept.length === 1 ? kept[0] : trn('tools.objects', kept.length) }));
  return true;
}

const isPt = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const isRect = (r) => !!r && typeof r === 'object' && ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => Number.isFinite(r[k]));

/**
 * The fields of a type stored relative to the object's x / z, which turn with it (the legacy
 * absolute `talkPoint` / `bounds` / `spots` only follow its position, `shiftLegacyFields`).
 * @type {Record<string, readonly string[]>}
 */
const RELATIVE_FIELDS = {
  npc: ['talkOffset', 'area'],
  critters: ['area', 'spotOffsets'],
  enemy: ['arena', 'gate', 'area', 'spotOffsets'],
};
const isGate = (g) => Array.isArray(g) && g.length >= 4 && g.slice(0, 4).every(Number.isFinite);

/** Does an NPC, critter or enemy group carry relative fields that turn with it (RELATIVE_FIELDS)? */
function hasRelativeFields(o) {
  return (ownValue(RELATIVE_FIELDS, o.type) ?? []).some((k) => (k === 'spotOffsets' ? Array.isArray(o[k]) && o[k].some(isPt)
    : k === 'gate' ? isGate(o[k]) : k === 'talkOffset' ? isPt(o[k]) : isRect(o[k])));
}

/**
 * Turn an object's relative fields (RELATIVE_FIELDS) about its point by `q` quarter turns (the
 * rotateSelection sense): rects — an enemy group's boss `arena`, the scatter / yard / chase
 * `area` — stay axis-aligned (extents swap), points — `talkOffset`, the `spotOffsets`, the
 * `gate` ends — turn exactly. Returns false when `q` is 0 (nothing turned).
 */
function turnRelativeFields(o, q) {
  const n = mod(q, 4);
  if (!n) return false;
  // x' = x·cos + z·sin, z' = −x·sin + z·cos for 90°·n, exactly
  const rot = (x, z) => (n === 1 ? [z, -x] : n === 2 ? [-x, -z] : [-z, x]).map((v) => tidy(v) || 0);
  const turnRect = (r) => {
    const [ax, az] = rot(r.minX, r.minZ);
    const [bx, bz] = rot(r.maxX, r.maxZ);
    return { ...r, minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz) };
  };
  for (const k of ownValue(RELATIVE_FIELDS, o.type) ?? []) {
    const v = o[k];
    if (k === 'spotOffsets') { if (Array.isArray(v)) o[k] = v.map((p) => (isPt(p) ? [...rot(p[0], p[1]), ...p.slice(2)] : p)); }
    else if (k === 'gate') { if (isGate(v)) o[k] = [...rot(v[0], v[1]), ...rot(v[2], v[3]), ...v.slice(4)]; }
    else if (k === 'talkOffset') { if (isPt(v)) o[k] = [...rot(v[0], v[1]), ...v.slice(2)]; }
    else if (isRect(v)) o[k] = turnRect(v);
  }
  return true;
}

/** Move the selection by (dx, dz). */
export function nudgeSelection(state, dx, dz) {
  if (!state.selection.length) return false;
  state.moveObjects(state.selection, dx, dz, tr('tools.undo.nudge'));
  return true;
}

/** Angle wrapped to (-π, π], rounded to 4 decimals. */
export function normalizeAngle(a) {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  return Math.round(r * 10000) / 10000;
}

const mod = (a, n) => ((a % n) + n) % n;

/** Plain copies of the selected objects (for the clipboard). */
export function copySelection(state) {
  return state.selectedObjects.map((o) => JSON.parse(JSON.stringify(o)));
}

/**
 * Paste objects. With `at` = {x, z} the group's centre moves there (snapped to 0.5); otherwise
 * the copies are offset by one tile. Returns the inserted objects.
 */
export function pasteObjects(state, objects, at = null) {
  const valid = objects.filter((o) => o && isOwnKey(OBJECT_TYPES, o.type));
  if (!valid.length) return [];
  let dx = 1;
  let dz = 1;
  if (at) {
    const b = groupBounds(valid);
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    dx = snapTo(at.x - cx, 0.5);
    dz = snapTo(at.z - cz, 0.5);
  }
  const copies = valid.map((o) => offsetObject(JSON.parse(JSON.stringify(o)), dx, dz));
  state.begin(tr('tools.undo.paste'));
  // (never leave the transaction open: that would swallow every later undo step and shortcut)
  try {
    return state.insertObjects(copies);
  } finally {
    state.commit();
  }
}

/** Union of objectBounds over objects. */
export function groupBounds(objects) {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const o of objects) {
    const r = objectBounds(o);
    b.minX = Math.min(b.minX, r.minX); b.maxX = Math.max(b.maxX, r.maxX);
    b.minZ = Math.min(b.minZ, r.minZ); b.maxZ = Math.max(b.maxZ, r.maxZ);
  }
  return b;
}

/** Bounds of the current selection (including the spawn marker), or null. */
export function selectionBounds(state) {
  return boundsOfIds(state, state.selection);
}

/** Bounds of the given object ids ('spawn' = the player start), or null. */
export function boundsOfIds(state, ids) {
  const objs = ids.map((id) => state.getObject(id)).filter(Boolean);
  const b = objs.length ? groupBounds(objs) : { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  if (ids.includes('spawn')) {
    const { x, z } = state.level.spawn;
    b.minX = Math.min(b.minX, x - 0.5); b.maxX = Math.max(b.maxX, x + 0.5);
    b.minZ = Math.min(b.minZ, z - 0.5); b.maxZ = Math.max(b.maxZ, z + 0.5);
  }
  return Number.isFinite(b.minX) ? b : null;
}

/** Selection centre (for focusing views), or null. */
export function selectionCenter(state) {
  const b = selectionBounds(state);
  if (!b) return null;
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, size: Math.max(b.maxX - b.minX, b.maxZ - b.minZ) };
}

export { objectCenter };
