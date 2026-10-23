import { ICONS } from '../icons.js';
import {
  DEFAULT_PICK, snapStep, snapTo, tidy, deleteSelection, duplicateSelection, rotateSelection,
  nudgeSelection, shownOnMap,
} from './common.js';
import { OBJECT_TYPES, objectBounds, objectCenter } from '../../engine/level/ObjectCatalog.js';
import { arenaOf, gateOf, isBossGroup, enemyArena, enemyGate } from '../enemyGroups.js';
import { storyVisible } from '../story.js';
import { hiddenAt, hiddenMessage, isHidden, leftOutMessage, notifyHidden } from '../visibility.js';
import { tr, trn } from '../i18n.js';

/**
 * @import { Tool, ToolPreview } from './index.js'
 * @import { EditorState } from '../EditorState.js'
 */

const DEG = Math.PI / 180;
/** A gate end this close to an arena edge counts as on it (it moves with the edge). */
const ON_EDGE = 0.3;

/**
 * The boss gate after an arena reshape: an end that lay on an edge of the old arena (`a0`, world)
 * stays on that edge of the new one (`a1`) — it moves with a dragged edge and slides along an
 * edge that got shorter; ends elsewhere keep their place. World segment in, world segment out.
 */
function gateWithArena(g0, a0, a1) {
  const end = (x, z) => {
    const near = (v, e) => Math.abs(v - e) <= ON_EDGE;
    const inX = x >= a0.minX - ON_EDGE && x <= a0.maxX + ON_EDGE;
    const inZ = z >= a0.minZ - ON_EDGE && z <= a0.maxZ + ON_EDGE;
    const w = inZ && near(x, a0.minX);
    const e = inZ && near(x, a0.maxX) && !(w && Math.abs(x - a0.minX) <= Math.abs(x - a0.maxX));
    const n = inX && near(z, a0.minZ);
    const s = inX && near(z, a0.maxZ) && !(n && Math.abs(z - a0.minZ) <= Math.abs(z - a0.maxZ));
    if (!(w || e || n || s)) return [x, z];
    let nx = w && !e ? a1.minX : e ? a1.maxX : x;
    let nz = n && !s ? a1.minZ : s ? a1.maxZ : z;
    nx = Math.min(a1.maxX, Math.max(a1.minX, nx));
    nz = Math.min(a1.maxZ, Math.max(a1.minZ, nz));
    return [nx, nz];
  };
  return [...end(g0[0], g0[1]), ...end(g0[2], g0[3])];
}

/**
 * Drag handles of the selected objects: line endpoints, region corners, particle-area corners
 * and a boss group's arena corners ('a' + corner) and gate ends ('g0' / 'g1') — only the boss
 * kind's arena and gate exist in the game. Views draw them; the select tool hit-tests them.
 * @param {EditorState} state
 * @returns {{ id: string, key: string, x: number, z: number }[]}
 */
export function selectionHandles(state) {
  const out = [];
  if (state.selection.length > 8) return out;
  for (const o of state.selectedObjects) {
    const def = OBJECT_TYPES[o.type];
    if (o.type === 'enemy') {
      if (!isBossGroup(o)) continue;
      const a = arenaOf(o);
      if (a) {
        const [x0, x1] = [o.x + Math.min(a.minX, a.maxX), o.x + Math.max(a.minX, a.maxX)];
        const [z0, z1] = [o.z + Math.min(a.minZ, a.maxZ), o.z + Math.max(a.minZ, a.maxZ)];
        out.push(
          { id: o.id, key: 'anw', x: x0, z: z0 }, { id: o.id, key: 'ane', x: x1, z: z0 },
          { id: o.id, key: 'asw', x: x0, z: z1 }, { id: o.id, key: 'ase', x: x1, z: z1 },
        );
      }
      const g = gateOf(o);
      if (g) out.push({ id: o.id, key: 'g0', x: o.x + g[0], z: o.z + g[1] }, { id: o.id, key: 'g1', x: o.x + g[2], z: o.z + g[3] });
    } else if (def.placement === 'line') {
      out.push({ id: o.id, key: 'p0', x: o.x0, z: o.z0 }, { id: o.id, key: 'p1', x: o.x1, z: o.z1 });
    } else if (def.placement === 'rect') {
      out.push(
        { id: o.id, key: 'nw', x: o.minX, z: o.minZ }, { id: o.id, key: 'ne', x: o.maxX, z: o.minZ },
        { id: o.id, key: 'sw', x: o.minX, z: o.maxZ }, { id: o.id, key: 'se', x: o.maxX, z: o.maxZ },
      );
    } else if (o.type === 'emitter') {
      const hx = (o.size?.[0] ?? 8) / 2;
      const hz = (o.size?.[2] ?? 8) / 2;
      out.push(
        { id: o.id, key: 'nw', x: o.x - hx, z: o.z - hz }, { id: o.id, key: 'ne', x: o.x + hx, z: o.z - hz },
        { id: o.id, key: 'sw', x: o.x - hx, z: o.z + hz }, { id: o.id, key: 'se', x: o.x + hx, z: o.z + hz },
      );
    }
  }
  return out;
}

function handleAt(state, ev) {
  const r = (ev.pickRadius ?? DEFAULT_PICK) * 1.3;
  let best = null;
  for (const hd of selectionHandles(state)) {
    const d = Math.hypot(hd.x - ev.x, hd.z - ev.z);
    if (d <= r && (!best || d < best.d)) best = { ...hd, d };
  }
  return best;
}

/**
 * Objects / spawn inside a world rectangle (areas must be fully inside, others intersect). Only
 * what the 2D map shows counts (`shownOnMap`: critter and enemy groups follow the markers
 * toggle there; `storyVisible`: the story preview), so a box can never pick up objects the map
 * hides. `hidden`: the objects in the box that a hidden type or the story preview hides (for the
 * status message).
 * @returns {{ ids: string[], hidden: string[] }}
 */
function idsInBox(state, b) {
  const ids = [];
  const hidden = [];
  for (const o of state.level.objects) {
    const shown = shownOnMap(state.view, o) && storyVisible(state, o);
    if (!shown && !isHidden(state, o)) continue;
    const def = OBJECT_TYPES[o.type];
    const r = objectBounds(o);
    const area = def.placement === 'rect' || o.type === 'emitter' || o.type === 'critters' || o.type === 'enemy';
    const hit = area
      ? r.minX >= b.minX && r.maxX <= b.maxX && r.minZ >= b.minZ && r.maxZ <= b.maxZ
      : r.maxX >= b.minX && r.minX <= b.maxX && r.maxZ >= b.minZ && r.minZ <= b.maxZ;
    if (hit) (shown ? ids : hidden).push(o.id);
  }
  const s = state.level.spawn;
  if (state.view.showMarkers !== false && s.x >= b.minX && s.x <= b.maxX && s.z >= b.minZ && s.z <= b.maxZ) ids.push('spawn');
  return { ids, hidden };
}

/**
 * The smallest region / exit / story event / particle area containing world point (x, z), or null
 * (areas are picked by their edge or name tag with a click; a double-click inside one selects it).
 * Areas the story preview hides are skipped.
 */
export function areaAt(state, x, z) {
  if (state.view.showMarkers === false) return null;
  const hidden = new Set(state.view.hiddenTypes ?? []);
  let best = null;
  let bestA = Infinity;
  for (const o of state.level.objects) {
    if ((o.type !== 'region' && o.type !== 'exit' && o.type !== 'event' && o.type !== 'emitter') || hidden.has(o.type) || !storyVisible(state, o)) continue;
    const b = objectBounds(o);
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    const a = (b.maxX - b.minX) * (b.maxZ - b.minZ);
    if (a < bestA) { bestA = a; best = o.id; }
  }
  return best;
}

/** Box-select highlights stop drawing silhouettes past this many objects (the count label stays). */
const MAX_HIGHLIGHT = 120;

let mode = null;   // null | 'move' | 'box' | 'handle'
let move = null;   // { ids, startX, startZ, applied:{dx,dz}, started, clickId, wasSelected, anchor, anchorType }
let box = null;    // { x0, z0, x1, z1, additive, toggle, hidden (a hidden object pressed on: named on a click) }
let handle = null; // { id, key, fixed:{x,z}, type, arena0?, gate0? (a boss arena corner: the arena / gate at the press) }
let hover = null;

function reset() { mode = null; move = null; box = null; handle = null; }

/** @type {Tool} */
export const SelectTool = {
  id: 'select',
  get label() { return tr('tools.select.label'); },
  shortcut: 'V',
  icon: ICONS.select,
  get help() { return tr('tools.help', { name: tr('tools.select.name'), tip: tr('tools.select.tip') }); },
  get tip() { return tr('tools.select.tip'); },
  cursor: 'default',

  activate() { reset(); },
  deactivate(state) {
    if (mode === 'move' && move?.started) state.commit();
    if (mode === 'handle') state.commit();
    reset();
    hover = null;
    state.emit('preview');
  },

  /** Contextual cursor (optional extension of the tool interface). */
  cursorFor(ev, state) {
    if (mode === 'move') return 'move';
    if (handleAt(state, ev)) return 'pointer';
    if (ev.hitSpawn || (ev.hitObjectId && !isHidden(state, state.getObject(ev.hitObjectId)))) return 'move';
    return 'default';
  },

  pointerDown(ev, state) {
    hover = ev;
    const hd = handleAt(state, ev);
    if (hd && !ev.shift && !ev.ctrl) {
      const o = state.getObject(hd.id);
      const opposite = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw', anw: 'ase', ane: 'asw', asw: 'ane', ase: 'anw' }[hd.key];
      const fixed = opposite ? selectionHandles(state).find((x) => x.id === hd.id && x.key === opposite) : null;
      mode = 'handle';
      handle = { id: hd.id, key: hd.key, fixed, type: o.type };
      // an arena corner: the gate ends on the dragged edges follow them (see gateWithArena)
      if (o.type === 'enemy' && hd.key[0] === 'a') {
        handle.arena0 = enemyArena(o);
        handle.gate0 = enemyGate(o);
      }
      state.begin(tr('tools.undo.reshape'));
      return;
    }
    let hitId = ev.hitSpawn ? 'spawn' : ev.hitObjectId;
    // a hit on an object the selection rule hides (the 3D view draws critter and enemy sprites
    // with *Show markers* off, while the 2D map — and so the rule — hides them): a click on empty
    // ground, which names it on release
    /** @type {string|null} */
    let hiddenHit = null;
    if (hitId && hitId !== 'spawn' && isHidden(state, state.getObject(hitId))) { hiddenHit = hitId; hitId = null; }
    if (hitId) {
      const wasSelected = state.selection.includes(hitId);
      if (ev.ctrl) {
        state.select([hitId], { toggle: true });
        if (!state.selection.includes(hitId)) { reset(); return; }
      } else if (ev.shift) {
        state.select([hitId], { additive: true });
      } else if (!wasSelected) {
        state.select([hitId]);
      }
      const o = hitId === 'spawn' ? null : state.getObject(hitId);
      const anchor = o ? (OBJECT_TYPES[o.type].placement === 'point' ? { x: o.x, z: o.z } : null) : { x: state.level.spawn.x, z: state.level.spawn.z, spawn: true };
      mode = 'move';
      move = { ids: [...state.selection], startX: ev.x, startZ: ev.z, applied: { dx: 0, dz: 0 }, started: false, clickId: hitId, wasSelected, anchor, anchorType: o?.type ?? null, modifier: ev.shift || ev.ctrl };
      state.emit('preview');
      return;
    }
    mode = 'box';
    box = { x0: ev.x, z0: ev.z, x1: ev.x, z1: ev.z, additive: ev.shift, toggle: ev.ctrl, hidden: hiddenHit };
    state.emit('preview');
  },

  pointerMove(ev, state) {
    const prevHover = hover;
    hover = ev;
    if (mode === 'move') {
      const dx = ev.x - move.startX;
      const dz = ev.z - move.startZ;
      if (!move.started) {
        if (Math.hypot(dx, dz) < (ev.pickRadius ?? DEFAULT_PICK) * 0.6) return;
        move.started = true;
        state.begin(tr('tools.undo.move'));
      }
      let step = snapStep(state, ev, move.anchorType);
      let tx;
      let tz;
      if (move.anchor?.spawn && step) {
        // the player start snaps to tile centres
        tx = snapTo(move.anchor.x + dx - 0.5, 1) + 0.5 - move.anchor.x;
        tz = snapTo(move.anchor.z + dz - 0.5, 1) + 0.5 - move.anchor.z;
      } else if (move.anchor) {
        tx = snapTo(move.anchor.x + dx, step) - move.anchor.x;
        tz = snapTo(move.anchor.z + dz, step) - move.anchor.z;
      } else {
        step = step || 0;
        tx = snapTo(dx, step);
        tz = snapTo(dz, step);
      }
      tx = tidy(tx);
      tz = tidy(tz);
      const ddx = tidy(tx - move.applied.dx);
      const ddz = tidy(tz - move.applied.dz);
      if (ddx || ddz) {
        state.moveObjects(move.ids, ddx, ddz, tr('tools.undo.move'));
        move.applied = { dx: tx, dz: tz };
      }
      state.emit('preview');
      return;
    }
    if (mode === 'box') {
      box.x1 = ev.x;
      box.z1 = ev.z;
      state.emit('preview');
      return;
    }
    if (mode === 'handle') {
      const step = snapStep(state, ev, handle.type);
      const px = tidy(snapTo(ev.x, step));
      const pz = tidy(snapTo(ev.z, step));
      state.updateObject(handle.id, (o) => {
        if (handle.key === 'p0') { o.x0 = px; o.z0 = pz; return; }
        if (handle.key === 'p1') { o.x1 = px; o.z1 = pz; return; }
        if (handle.key === 'g0' || handle.key === 'g1') {
          // the boss gate (relative to the group, like every optional enemy field)
          const g = [...(gateOf(o) ?? [0, 0, 0, 0])].slice(0, 4);
          const k = handle.key === 'g0' ? 0 : 2;
          g[k] = tidy(px - o.x);
          g[k + 1] = tidy(pz - o.z);
          o.gate = g;
          return;
        }
        const f = handle.fixed;
        if (o.type === 'emitter') {
          o.size = [...(o.size ?? [8, 2.4, 8])];
          o.size[0] = Math.max(0.5, tidy(Math.abs(px - o.x) * 2));
          o.size[2] = Math.max(0.5, tidy(Math.abs(pz - o.z) * 2));
          return;
        }
        let minX = Math.min(f.x, px); let maxX = Math.max(f.x, px);
        let minZ = Math.min(f.z, pz); let maxZ = Math.max(f.z, pz);
        if (maxX - minX < 0.5) { if (px < f.x) minX = maxX - 0.5; else maxX = minX + 0.5; }
        if (maxZ - minZ < 0.5) { if (pz < f.z) minZ = maxZ - 0.5; else maxZ = minZ + 0.5; }
        if (o.type === 'enemy') {
          // the boss arena, stored relative to the group (its other keys keep their order); the
          // gate ends on its edges stay on them
          o.arena = { ...(o.arena ?? {}), minX: tidy(minX - o.x), maxX: tidy(maxX - o.x), minZ: tidy(minZ - o.z), maxZ: tidy(maxZ - o.z) };
          if (handle.arena0 && handle.gate0) {
            const g = gateWithArena(handle.gate0, handle.arena0, { minX, maxX, minZ, maxZ });
            const rel = [tidy(g[0] - o.x), tidy(g[1] - o.z), tidy(g[2] - o.x), tidy(g[3] - o.z)];
            if (rel.some((v, k) => v !== o.gate[k])) o.gate = [...rel, ...o.gate.slice(4)];
          }
          return;
        }
        Object.assign(o, { minX: tidy(minX), maxX: tidy(maxX), minZ: tidy(minZ), maxZ: tidy(maxZ) });
      }, tr('tools.undo.reshape'));
      state.emit('preview');
      return;
    }
    if (!prevHover || prevHover.hitObjectId !== ev.hitObjectId || prevHover.hitSpawn !== ev.hitSpawn) state.emit('preview');
  },

  // `ev.cancelled` (an interrupted stroke) commits what the drag already applied — a move or a
  // reshape so far — but changes nothing on release: no click-narrowing, no box selection
  pointerUp(ev, state) {
    if (mode === 'move') {
      if (move.started) {
        state.commit();
        const { dx, dz } = move.applied;
        if (dx || dz) state.notify(tr('tools.msg.moved', { what: move.ids.length === 1 ? move.ids[0] : trn('tools.objects', move.ids.length), dx, dz }));
      } else if (!ev.cancelled && !move.modifier && move.wasSelected && state.selection.length > 1) {
        // a click (no drag) on a member of a multi-selection selects just that object
        state.select([move.clickId]);
      }
    } else if (mode === 'box') {
      const b = { minX: Math.min(box.x0, box.x1), maxX: Math.max(box.x0, box.x1), minZ: Math.min(box.z0, box.z1), maxZ: Math.max(box.z0, box.z1) };
      const tiny = b.maxX - b.minX < 0.1 && b.maxZ - b.minZ < 0.1;
      if (ev.cancelled) {
        // the gesture was interrupted (layout switch, lost pointer): change nothing
      } else if (tiny) {
        if (!box.additive && !box.toggle) state.clearSelection();
        // a click where only a hidden object stands: the status bar says why nothing was picked
        const hid = box.hidden ?? hiddenAt(state, box.x0, box.z0);
        if (hid) notifyHidden(state, hiddenMessage(state, hid), [hid]);
      } else {
        const { ids, hidden } = idsInBox(state, b);
        if (box.toggle) state.select(ids, { toggle: true });
        else state.select(ids, { additive: box.additive });
        const left = hidden.length ? leftOutMessage(state, hidden) : '';
        if (ids.length || left) state.notify(`${tr('tools.msg.selected', { n: state.selection.length })}${left ? ` · ${left}` : ''}`);
      }
    } else if (mode === 'handle') {
      state.commit();
    }
    reset();
    state.emit('preview');
  },

  keyDown(e, state) {
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (k === 'Escape') {
      if (mode === 'move' && move.started) { state.cancel(); reset(); state.emit('preview'); return true; }
      if (mode === 'handle') { state.cancel(); reset(); state.emit('preview'); return true; }
      if (mode) { reset(); state.emit('preview'); return true; }
      if (state.selection.length) { state.clearSelection(); return true; }
      return false;
    }
    if (mode) return false; // no edits mid-drag
    if (k === 'Delete' || k === 'Backspace') return deleteSelection(state);
    if (ctrl && k.toLowerCase() === 'd') return duplicateSelection(state);
    if (k.toLowerCase() === 'r' && !e.altKey && state.selection.length) {
      return rotateSelection(state, (ctrl ? 90 : 15) * DEG * (e.shiftKey ? -1 : 1));
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[k] && state.selection.length && !ctrl) {
      const step = e.shiftKey ? 2 : e.altKey ? 0.1 : 0.5;
      return nudgeSelection(state, tidy(arrows[k][0] * step), tidy(arrows[k][1] * step));
    }
    return false;
  },

  /** @returns {ToolPreview|null} */
  preview(state) {
    if (mode === 'box') {
      const b = { minX: Math.min(box.x0, box.x1), maxX: Math.max(box.x0, box.x1), minZ: Math.min(box.z0, box.z1), maxZ: Math.max(box.z0, box.z1) };
      // (both views ask every frame: the id list is computed once per box, and many objects are
      // counted, not outlined)
      const key = `${b.minX},${b.maxX},${b.minZ},${b.maxZ}|${state.level.objects.length}`;
      if (box.key !== key) { box.key = key; box.ids = idsInBox(state, b).ids; }
      const ids = box.ids;
      const n = ids.length;
      return { rect: b, label: n ? trn('tools.objects', n) : null, highlight: n && n <= MAX_HIGHLIGHT ? { ids, color: 'rgba(255,255,255,0.75)' } : null };
    }
    if (mode === 'move' && move.started) {
      const c = move.ids.length === 1 && move.ids[0] !== 'spawn' ? state.getObject(move.ids[0]) : null;
      const pos = c ? objectCenter(c) : null;
      return { label: `Δ ${move.applied.dx}, ${move.applied.dz}${pos ? `  →  ${tidy(pos.x)}, ${tidy(pos.z)}` : ''}` };
    }
    if (mode === 'handle') {
      const o = state.getObject(handle.id);
      if (!o) return null;
      const def = OBJECT_TYPES[o.type];
      if (def.placement === 'line') return { label: tr('tools.preview.length', { len: Math.hypot(o.x1 - o.x0, o.z1 - o.z0).toFixed(2) }) };
      if (def.placement === 'rect') return { label: `${tidy(o.maxX - o.minX)} × ${tidy(o.maxZ - o.minZ)}` };
      if (o.type === 'enemy') {
        const g = gateOf(o);
        const a = arenaOf(o);
        if (handle.key[0] === 'g' && g) return { label: tr('tools.preview.gate', { len: Math.hypot(g[2] - g[0], g[3] - g[1]).toFixed(2) }) };
        return a ? { label: tr('tools.preview.arena', { w: tidy(Math.abs(a.maxX - a.minX)), d: tidy(Math.abs(a.maxZ - a.minZ)) }) } : null;
      }
      return { label: `${o.size[0]} × ${o.size[2]}` };
    }
    if (!state.hover || !hover) return null;
    const id = hover.hitObjectId;
    if (id && !state.selection.includes(id) && !isHidden(state, state.getObject(id))) return { highlight: { ids: [id], color: 'rgba(255,255,255,0.55)' } };
    return null;
  },
};
