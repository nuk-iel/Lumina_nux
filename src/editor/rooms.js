/**
 * Rooms (interiors) in the editor: a level with `environment.interior: true` (LEVEL_FORMAT.md §9.2,
 * `LevelLook.isInterior`) — a house's floor, a cellar. The game shows no forest border, outer
 * scenery, god rays or weather inside; the look a room usually wants besides is set with ordinary
 * environment fields (the room look below). Used by the dialogs, the inspector, the app and the
 * checks, so it stays light: three-free, and it does not import `src/game/LevelLook.js` (that
 * pulls the level builders, which the editor loads with its lazy 3D chunk, into the main chunk) —
 * `isRoom` and `backdropKind` follow `LevelLook.isInterior` / `backdropColor`, which the 3D preview
 * uses as the game does.
 *
 * @import { Level, LevelEnvironment } from '../engine/level/types.d.ts'
 */
import { createEmptyLevel, levelToChar, MAX_LEVEL, DEFAULT_ENVIRONMENT } from '../engine/level/LevelFormat.js';
import { tr } from './i18n.js';

/**
 * Is this level a room (`environment.interior === true`)? = `LevelLook.isInterior`.
 * @param {Partial<LevelEnvironment>|null|undefined} env
 * @returns {boolean}
 */
export function isRoom(env) {
  return !!env && env.interior === true;
}

/**
 * What a level's `environment.backdrop` is, as `LevelLook.backdropColor` reads it: 'sky' (absent or
 * blank), 'void' (black), 'color' ('#rrggbb') or 'invalid' (anything else: the game shows the sky;
 * the dialog keeps such a value until another choice is made).
 * @param {unknown} value
 * @returns {'sky'|'void'|'color'|'invalid'}
 */
export function backdropKind(value) {
  if (value == null) return 'sky';
  if (typeof value !== 'string') return 'invalid';
  const b = value.trim();
  if (!b) return 'sky';
  if (b === 'void') return 'void';
  return /^#[0-9a-fA-F]{6}$/.test(b) ? 'color' : 'invalid';
}

/** An interior's dark surround (the demo's mill cellar uses it too). */
export const ROOM_BACKDROP = '#0d0b12';

/**
 * The environment fields of the room look ("Use the room look" in Level settings, File › New ›
 * Room): no forest border, outer scenery or god rays (the game leaves them out in a room anyway —
 * these make the file say so), a dark backdrop instead of the sky, no minimap, the clock stopped
 * (the room keeps its start time).
 */
export const ROOM_LOOK = Object.freeze({
  border: 'none', outerScenery: false, godRays: false, backdrop: ROOM_BACKDROP, minimap: false, clock: false,
});

/** A room's closer camera (`environment.camera`), set when the level's camera is automatic. */
export const ROOM_CAMERA = Object.freeze({ distance: 20, pitch: 38 });

/** What a new room starts with (File › New › Room). */
export const ROOM_DEFAULTS = Object.freeze({
  width: 16, depth: 12,
  /** floor tile ('k' stone tiles) and its height level */
  fill: 'k', level: 1,
  /** wall height in levels above the floor (5 = 2.5 units) */
  wall: 5,
  /** start hour (the clock is stopped) */
  timeOfDay: 11,
});

/** Wall thickness of a new room (tiles) on the north, west and east; the south wall is one row. */
export const ROOM_WALL = 2;
/** Width of the door in the low south wall (tiles). */
export const ROOM_DOOR = 2;

/**
 * The room-look changes a level's environment still needs, worded for the dialog: `[key, label]`
 * pairs (the camera only while it is automatic — `cameraAuto`).
 * @param {Partial<LevelEnvironment>} env
 * @param {{ cameraAuto?: boolean }} [o]
 * @returns {{ key: string, label: string }[]}
 */
export function roomLookChanges(env, { cameraAuto = false } = {}) {
  const out = [];
  if (env.border !== 'none') out.push({ key: 'border', label: tr('app.room.border') });
  if (env.outerScenery !== false) out.push({ key: 'outerScenery', label: tr('app.room.outerScenery') });
  if (env.godRays !== false) out.push({ key: 'godRays', label: tr('app.room.godRays') });
  // (a backdrop the level has — void or a colour — is kept)
  const b = backdropKind(env.backdrop);
  if (b !== 'void' && b !== 'color') out.push({ key: 'backdrop', label: tr('app.room.backdrop') });
  if (env.minimap !== false) out.push({ key: 'minimap', label: tr('app.room.minimap') });
  if (env.clock !== false) out.push({ key: 'clock', label: tr('app.room.clock') });
  if (cameraAuto) out.push({ key: 'camera', label: tr('app.room.camera', { distance: ROOM_CAMERA.distance, pitch: ROOM_CAMERA.pitch }) });
  return out;
}

/**
 * A new room: a floor of `fill` at height `level`, rock walls (`x`, blocked) `wall` levels higher
 * on the north (two rows), west and east (two columns each), a low south wall (one level up, one
 * row: the camera looks north over it) with a door of the floor tile in its middle, the player
 * start just inside the door facing north, `environment.interior` and the room look (ROOM_LOOK,
 * ROOM_CAMERA, the start hour). No objects: a room's way out is an `exit` over its door.
 * @param {{ name?: string, width?: number, depth?: number, fill?: string, level?: number, wall?: number, timeOfDay?: number }} [opts]
 * @returns {Level}
 */
export function createRoomLevel(opts = {}) {
  /** @type {{ name?: string, width: number, depth: number, fill: string, level: number, wall: number, timeOfDay: number }} */
  const o = { ...ROOM_DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) };
  const L = createEmptyLevel({ name: o.name ?? 'Untitled', width: o.width, depth: o.depth, fill: o.fill, level: o.level, border: 0 });
  const { width: W, depth: D } = L;
  // (the walls fit under the highest level: a floor too high for them comes down)
  const wallLevels = Math.max(1, Math.min(MAX_LEVEL, Math.round(o.wall)));
  const floor = Math.max(0, Math.min(MAX_LEVEL - wallLevels, Math.round(o.level)));
  const top = floor + wallLevels;
  const low = Math.min(MAX_LEVEL, floor + 1);
  const door0 = Math.floor(W / 2) - Math.floor(ROOM_DOOR / 2);
  const t = ROOM_WALL;
  const tiles = [];
  const heights = [];
  for (let j = 0; j < D; j++) {
    let tileRow = '';
    let hr = '';
    for (let i = 0; i < W; i++) {
      const south = j === D - 1;
      const door = south && i >= door0 && i < door0 + ROOM_DOOR;
      const wall = !door && (j < t || i < t || i >= W - t || south);
      tileRow += wall ? 'x' : L.tiles[j][i];
      hr += levelToChar(!wall ? floor : south ? low : top);
    }
    tiles.push(tileRow);
    heights.push(hr);
  }
  L.tiles = tiles;
  L.heights = heights;
  L.spawn = { x: door0 + ROOM_DOOR / 2, z: Math.max(t + 0.5, D - 2.8), facing: 'up' };
  L.environment = { ...DEFAULT_ENVIRONMENT, timeOfDay: o.timeOfDay, ...ROOM_LOOK, camera: { ...ROOM_CAMERA }, interior: true };
  return L;
}
