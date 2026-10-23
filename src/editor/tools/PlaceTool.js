import { ICONS } from '../icons.js';
import { snapStep, snapTo, tidy, normalizeAngle } from './common.js';
import { OBJECT_TYPES, createObject } from '../../engine/level/ObjectCatalog.js';
import { isOwnKey } from '../../engine/utils/own.js';
import { hiddenMessage, notifyHidden } from '../visibility.js';
import { tr } from '../i18n.js';

/**
 * @import { ObjectType, ObjectTypeDef } from '../../engine/level/types.js'
 * @import { RotatableTool, ToolPreview } from './index.js'
 * @import { EditorState } from '../EditorState.js'
 */

const DEG = Math.PI / 180;

/** Ghost / placement rotation (radians) per object type: turning one house does not turn every
 *  lamppost placed afterwards; going back to houses brings their rotation back. */
const rotations = new Map();
const rotationOf = (type) => rotations.get(type) ?? 0;
let hover = null;     // last PointerEv
let line = null;      // { x0, z0, downX, downZ, dragging } — first endpoint of a line object
let rect = null;      // { x0, z0, x1, z1 } — region being dragged
/** Variation seed of the NEXT placement: the ghost preview uses it too, so it matches the result. */
let nextSeed = rollSeed();

function rollSeed() {
  return 1 + Math.floor(Math.random() * 9998);
}

function hasSeed(type) {
  return OBJECT_TYPES[type].fields.some((f) => f.key === 'opts.seed');
}

/** Overrides shared by the ghost and the placed object (rotation, the next seed). */
function lookOverrides(type) {
  const def = OBJECT_TYPES[type];
  const o = {};
  if (def.rotatable) o.rotation = rotationOf(type);
  if (hasSeed(type)) o.opts = { seed: nextSeed };
  return o;
}

/** @returns {ObjectType} the chosen object type ('house' for an unknown name) */
function currentType(state) {
  const t = state.toolOptions.objectType;
  return isOwnKey(OBJECT_TYPES, t) ? t : 'house';
}

function snapped(state, ev, type) {
  const step = snapStep(state, ev, type);
  return { x: tidy(snapTo(ev.x, step)), z: tidy(snapTo(ev.z, step)) };
}

/**
 * Per-placement overrides: rotation and the variation seed the ghost showed; a fresh seed is then
 * rolled for the next placement so repeated props differ.
 */
function placementOverrides(type) {
  const o = lookOverrides(type);
  if (hasSeed(type)) nextSeed = rollSeed();
  return o;
}

/**
 * The placement's status message (the Place tool's, and the context menu's *Place ‹type› here*);
 * an object the views hide — a type hidden with the outliner's eye, *View › Show objects* /
 * *Show markers* off — is placed but not drawn or selected (a hidden object is never selected:
 * ../visibility.js), and the message says so.
 * @param {EditorState} state
 * @param {string} text
 * @param {string} id the placed object
 */
export function notifyPlaced(state, text, id) {
  const why = hiddenMessage(state, id);
  if (why) notifyHidden(state, `${text} · ${why}`, [id]);
  else state.notify(text);
}

function finishLine(state, type, x1, z1) {
  const { x0, z0 } = line;
  line = null;
  if (Math.hypot(x1 - x0, z1 - z0) < 0.25) { state.notify(tr('tools.msg.lineTooShort')); return; }
  const obj = state.addObject(type, x0, z0, { ...placementOverrides(type), x1, z1 });
  notifyPlaced(state, tr('tools.msg.placedLine', { label: OBJECT_TYPES[type].label, len: Math.hypot(x1 - x0, z1 - z0).toFixed(1) }), obj.id);
}

/** @type {RotatableTool} */
export const PlaceTool = {
  id: 'place',
  get label() { return tr('tools.place.label'); },
  shortcut: 'O',
  icon: ICONS.place,
  get help() { return tr('tools.help', { name: tr('tools.place.name'), tip: tr('tools.place.tip') }); },
  get tip() { return tr('tools.place.tip'); },
  cursor: 'copy',

  activate(state) { line = null; rect = null; state.emit('preview'); },
  deactivate(state) { line = null; rect = null; hover = null; state.emit('preview'); },

  pointerDown(ev, state) {
    const type = currentType(state);
    const def = OBJECT_TYPES[type];
    const p = snapped(state, ev, type);
    if (def.placement === 'point') {
      const obj = state.addObject(type, p.x, p.z, placementOverrides(type));
      notifyPlaced(state, tr('tools.msg.placed', { label: def.label, id: obj.id }), obj.id);
    } else if (def.placement === 'line') {
      if (!line) line = { x0: p.x, z0: p.z, downX: p.x, downZ: p.z, dragging: true };
      else finishLine(state, type, p.x, p.z);
    } else {
      rect = { x0: p.x, z0: p.z, x1: p.x, z1: p.z };
    }
    state.emit('preview');
  },

  pointerMove(ev, state) {
    hover = ev;
    const type = currentType(state);
    if (rect) { const p = snapped(state, ev, type); rect.x1 = p.x; rect.z1 = p.z; }
    state.emit('preview');
  },

  pointerUp(ev, state) {
    if (ev.cancelled) {
      // interrupted (`ev.cancelled`): place nothing on release — a region being dragged and a line
      // started by this press are dropped, like Esc (a point object was placed on the press)
      if (line?.dragging) line = null;
      rect = null;
      state.emit('preview');
      return;
    }
    const type = currentType(state);
    const def = OBJECT_TYPES[type];
    const p = snapped(state, ev, type);
    if (def.placement === 'line' && line?.dragging) {
      line.dragging = false;
      // a drag (rather than a click) places the line at once
      if (Math.hypot(p.x - line.downX, p.z - line.downZ) >= 0.5) finishLine(state, type, p.x, p.z);
    } else if (def.placement === 'rect' && rect) {
      const r = rect;
      rect = null;
      let minX = Math.min(r.x0, r.x1); let maxX = Math.max(r.x0, r.x1);
      let minZ = Math.min(r.z0, r.z1); let maxZ = Math.max(r.z0, r.z1);
      if (maxX - minX < 0.5 || maxZ - minZ < 0.5) { // a click: default 4 × 4 around the point
        minX = r.x0 - 2; maxX = r.x0 + 2; minZ = r.z0 - 2; maxZ = r.z0 + 2;
      }
      const obj = state.addObject(type, (minX + maxX) / 2, (minZ + maxZ) / 2, { minX: tidy(minX), maxX: tidy(maxX), minZ: tidy(minZ), maxZ: tidy(maxZ) });
      notifyPlaced(state, tr('tools.msg.placed', { label: def.label, id: obj.id }), obj.id);
    }
    state.emit('preview');
  },

  keyDown(e, state) {
    const k = e.key.toLowerCase();
    if (k === 'r' && !e.altKey) {
      /** @type {ObjectTypeDef} */
      const def = OBJECT_TYPES[currentType(state)];
      if (!def.rotatable) { state.notify(tr('tools.msg.cannotRotate', { label: def.label })); return true; }
      const step = (e.ctrlKey || e.metaKey ? 90 : 15) * DEG * (e.shiftKey ? -1 : 1);
      const type = currentType(state);
      rotations.set(type, normalizeAngle(rotationOf(type) + step));
      state.emit('preview');
      return true;
    }
    if (e.key === 'Escape' && (line || rect)) {
      line = null; rect = null;
      state.emit('preview');
      return true;
    }
    return false;
  },

  /** Placement rotation (radians) of the chosen object type (for the tool options panel). */
  getRotation(state) { return rotationOf(currentType(state)); },
  setRotation(state, v) { rotations.set(currentType(state), normalizeAngle(v)); state.emit('preview'); },

  /** @returns {ToolPreview|null} */
  preview(state) {
    if (!state.hover || !hover) return null;
    const type = currentType(state);
    /** @type {ObjectTypeDef} */
    const def = OBJECT_TYPES[type];
    const p = snapped(state, hover, type);
    if (def.placement === 'line') {
      if (line) {
        const ghost = createObject(type, line.x0, line.z0, { ...lookOverrides(type), x1: p.x, z1: p.z });
        const len = Math.hypot(p.x - line.x0, p.z - line.z0);
        return { ghost, line: { x0: line.x0, z0: line.z0, x1: p.x, z1: p.z }, label: tr('tools.preview.lineEnd', { label: def.label, len: len.toFixed(1) }) };
      }
      return { line: { x0: p.x, z0: p.z, x1: p.x, z1: p.z }, label: tr('tools.preview.lineStart', { label: def.label }) };
    }
    if (def.placement === 'rect') {
      if (rect) {
        const r = { minX: Math.min(rect.x0, rect.x1), maxX: Math.max(rect.x0, rect.x1), minZ: Math.min(rect.z0, rect.z1), maxZ: Math.max(rect.z0, rect.z1) };
        return { rect: r, ghost: createObject(type, 0, 0, r), label: `${def.label} · ${(r.maxX - r.minX).toFixed(1)} × ${(r.maxZ - r.minZ).toFixed(1)}` };
      }
      return { rect: { minX: p.x - 0.1, maxX: p.x + 0.1, minZ: p.z - 0.1, maxZ: p.z + 0.1 }, label: tr('tools.preview.rectStart', { label: def.label }) };
    }
    const ghost = createObject(type, p.x, p.z, lookOverrides(type));
    const deg = Math.round(rotationOf(type) / DEG);
    return { ghost, label: def.rotatable ? `${def.label} · ${deg}°` : def.label };
  },
};
