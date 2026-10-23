/**
 * Luminati level format (v1) — a JSON-serialisable description of a whole playable diorama:
 * terrain (legend / tiles / heights, the TileMap contract format), water, environment, the player
 * spawn and every placed object (props, trees, lights, NPCs, critters, particle areas, regions).
 *
 * Levels are plain data: the editor edits them, `LevelStorage` saves / loads them, the game
 * builds them (see docs/contracts/LEVEL_EDITOR.md). Rows of `tiles` / `heights` are strings (one char per
 * tile) so files stay small and diff-friendly.
 *
 * Coordinates follow the engine conventions: tile (i, j) covers x ∈ [i, i+1], z ∈ [j, j+1];
 * rows run toward +Z; world height of a tile = level × LEVEL_HEIGHT.
 */
import { LEVEL_HEIGHT } from '../constants.js';
import { OBJECT_TYPES, createObject, normalizeObject } from './ObjectCatalog.js';
import { isOwnKey, showValue, toText, toNumber, hasUnconvertible, stripUnconvertible } from '../utils/own.js';
import { cleanTextKeysOf, LEVEL_TEXT_FIELDS } from '../i18n/ContentKeys.js';
import { lm } from './messages.js';

/**
 * @import { Level, LevelEnvironment, LevelObjectOf, ObjectType, ObjectOverrides, TileDef,
 *   XZ } from './types.js'
 */

export const LEVEL_FORMAT = 'luminati-level';
export const LEVEL_VERSION = 1;

/** Highest terrain level encodable in one height char ('0'-'9', 'a'-'z'). */
export const MAX_LEVEL = 35;
export const MIN_SIZE = 8;
export const MAX_SIZE = 128;

// ---------------------------------------------------------------------------------------------
// Tile palette
// ---------------------------------------------------------------------------------------------

/**
 * Built-in tile types. `char` is the map character, `def` the TileMap legend entry, `color` the
 * flat colour used by 2D map views, `category` groups the editor palette.
 * @type {{ char: string, name: string, category: 'ground'|'path'|'water'|'stairs'|'special',
 *   color: string, def: TileDef }[]}
 */
export const TILE_TYPES = [
  { char: 'g', name: 'Grass', category: 'ground', color: '#5f9a3e', def: { top: 'grass', side: 'cliff', lip: 'grass_side', walkable: true } },
  { char: 'G', name: 'Dark grass', category: 'ground', color: '#3f7434', def: { top: 'grass_dark', side: 'cliff', lip: 'grass_side', walkable: true } },
  { char: 'f', name: 'Flower grass', category: 'ground', color: '#8fb14e', def: { top: 'grass_flowers', side: 'cliff', lip: 'grass_side', walkable: true } },
  { char: 'F', name: 'Farmland', category: 'ground', color: '#7a5433', def: { top: 'farmland', side: 'dirt_side', walkable: true } },
  { char: 's', name: 'Sand', category: 'ground', color: '#d6c08b', def: { top: 'sand', side: 'dirt_side', walkable: true } },
  { char: 'm', name: 'Mossy stone', category: 'ground', color: '#6e7d5c', def: { top: 'moss_stone', side: 'cliff', walkable: true } },
  { char: '.', name: 'Dirt path', category: 'path', color: '#b18a5c', def: { top: 'dirt_path', side: 'dirt_side', walkable: true } },
  { char: 'd', name: 'Dirt', category: 'path', color: '#8e6a47', def: { top: 'dirt', side: 'dirt_side', walkable: true } },
  { char: 'c', name: 'Cobblestone', category: 'path', color: '#8d8a8e', def: { top: 'cobblestone', side: 'stone_wall', walkable: true } },
  { char: 'k', name: 'Stone tiles', category: 'path', color: '#a6a39b', def: { top: 'stone_tiles', side: 'stone_wall', walkable: true } },
  { char: 'b', name: 'Wooden deck', category: 'path', color: '#9c6b3f', def: { top: 'wood_deck', side: 'wood_planks_dark', walkable: true } },
  { char: '~', name: 'River', category: 'water', color: '#3b7fa6', def: { top: 'riverbed', side: 'cliff', water: true, walkable: false } },
  { char: 'p', name: 'Plunge pool', category: 'water', color: '#2f6f99', def: { top: 'riverbed', side: 'cliff', water: true, walkable: false, flow: 0.45 } },
  { char: 'w', name: 'Fast stream', category: 'water', color: '#4f93b8', def: { top: 'riverbed', side: 'cliff', water: true, walkable: false, flow: 2.2 } },
  { char: 'o', name: 'Still pond', category: 'water', color: '#346b8f', def: { top: 'riverbed', side: 'cliff', water: true, walkable: false, flow: 0 } },
  { char: '^', name: 'Stairs up north', category: 'stairs', color: '#b9b4ac', def: { top: 'cobblestone', side: 'stone_wall', riser: 'stone_wall', stairs: 'N', walkable: true } },
  { char: 'v', name: 'Stairs up south', category: 'stairs', color: '#b9b4ac', def: { top: 'cobblestone', side: 'stone_wall', riser: 'stone_wall', stairs: 'S', walkable: true } },
  { char: '>', name: 'Stairs up east', category: 'stairs', color: '#b9b4ac', def: { top: 'cobblestone', side: 'stone_wall', riser: 'stone_wall', stairs: 'E', walkable: true } },
  { char: '<', name: 'Stairs up west', category: 'stairs', color: '#b9b4ac', def: { top: 'cobblestone', side: 'stone_wall', riser: 'stone_wall', stairs: 'W', walkable: true } },
  { char: 'T', name: 'Forest floor (blocked)', category: 'special', color: '#2b4f2a', def: { top: 'grass_dark', side: 'cliff', lip: 'grass_side', walkable: false } },
  { char: 'x', name: 'Rock (blocked)', category: 'special', color: '#5d5a60', def: { top: 'moss_stone', side: 'cliff', walkable: false } },
  { char: ' ', name: 'Void', category: 'special', color: '#101018', def: { void: true } },
];

/** char → TILE_TYPES entry. */
export const TILE_BY_CHAR = Object.freeze(Object.fromEntries(TILE_TYPES.map((t) => [t.char, t])));

/**
 * The default legend (char → TileMap legend entry) written into new levels.
 * @returns {Record<string, TileDef>} fresh copies of the `TILE_TYPES` definitions
 */
export function defaultLegend() {
  return Object.fromEntries(TILE_TYPES.map((t) => [t.char, { ...t.def }]));
}

// ---------------------------------------------------------------------------------------------
// Height chars
// ---------------------------------------------------------------------------------------------

/**
 * '0'-'9' → 0-9, 'a'-'z' → 10-35 (upper case too; anything else → 0).
 * @param {string} ch
 * @returns {number}
 */
export function charToLevel(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 97 && c <= 122) return c - 87;
  if (c >= 65 && c <= 90) return c - 55;
  return 0;
}

/**
 * 0-35 → height char (rounded, clamped).
 * @param {number} level
 * @returns {string}
 */
export function levelToChar(level) {
  const l = Math.max(0, Math.min(MAX_LEVEL, Math.round(level)));
  return l < 10 ? String.fromCharCode(48 + l) : String.fromCharCode(87 + l);
}

/**
 * World height of a terrain level.
 * @param {number} level
 * @returns {number}
 */
export const levelToWorld = (level) => level * LEVEL_HEIGHT;

// ---------------------------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------------------------

/** Environment defaults (all optional in files). */
export const DEFAULT_ENVIRONMENT = Object.freeze({
  timeOfDay: 17.2,        // starting hour
  clock: true,            // does time advance while playing?
  weather: 'clear',       // 'clear' | 'rain' | 'snow'
  border: 'forest',       // 'forest' (scatter trees on blocked tiles + outer scenery) | 'none'
  outerScenery: true,     // fogged outer ground, tree clusters and hills around the map
  godRays: true,
  dust: true,             // camera-following dust motes
  music: true,            // start the music when the game starts
  camera: null,           // null = auto, or { distance, pitch, bounds: {minX,maxX,minZ,maxZ} }
  highGround: null,       // null or { minY, pitch }: steeper camera while the player stands above minY
});

export const DEFAULT_WATER = Object.freeze({ flow: [0, 0.45], reflect: 0.2, neutral: 0.2 });

/**
 * A new, flat level.
 * @param {{ name?: string, width?: number, depth?: number, fill?: string, level?: number, border?: number }} [opts]
 *   border: width in tiles of a blocked forest border ('T') around the edge (0 = none).
 * @returns {Level}
 */
export function createEmptyLevel({ name = 'Untitled', width = 32, depth = 24, fill = 'g', level = 2, border = 2 } = {}) {
  width = clampSize(width);
  depth = clampSize(depth);
  const hc = levelToChar(level);
  const tiles = [];
  const heights = [];
  for (let j = 0; j < depth; j++) {
    let row = '';
    for (let i = 0; i < width; i++) {
      const edge = i < border || j < border || i >= width - border || j >= depth - border;
      row += edge ? 'T' : fill;
    }
    tiles.push(row);
    heights.push(hc.repeat(width));
  }
  const cx = Math.floor(width / 2) + 0.5;
  const cz = Math.floor(depth / 2) + 0.5;
  return {
    format: LEVEL_FORMAT,
    version: LEVEL_VERSION,
    name,
    subtitle: '',
    author: '',
    description: '',
    width,
    depth,
    legend: defaultLegend(),
    tiles,
    heights,
    // global water surface; water tiles whose bed is at/above it get an automatic shallow depth
    waterLevel: 0.4,
    water: { ...DEFAULT_WATER, flow: /** @type {XZ} */ ([...DEFAULT_WATER.flow]) },
    environment: { ...DEFAULT_ENVIRONMENT },
    spawn: { x: cx, z: cz, facing: 'down' },
    objects: [],
  };
}

/** A JSON copy (load-time: only for the rare data `stripUnconvertible` must change). */
const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * The fields of a level section (`environment`, `water`) to spread over its defaults: `v` itself,
 * or a copy without the values String() cannot convert (LVL-18); null / undefined → {}.
 */
function ownCopy(v) {
  if (v == null) return {};
  return hasUnconvertible(v) ? stripUnconvertible(clone(v)) : v;
}

function clampSize(n) {
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(toNumber(n) || MIN_SIZE)));
}

// ---------------------------------------------------------------------------------------------
// Validation / normalisation
// ---------------------------------------------------------------------------------------------

/**
 * Normalise any (possibly partial, older or hand-edited) level object into a complete v1 level.
 * Never throws for recoverable problems; they are reported in `warnings` (worded in the current
 * language, strings.js 'levelmsg': English in Node). `newer`: the file's
 * `version` is newer than this engine's (one of the warnings says so; a UI can test the flag
 * instead of the wording).
 * @param {any} raw
 * @returns {{ level: Level, warnings: string[], newer: boolean }}
 */
export function normalizeLevel(raw) {
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(lm('format.notObject'));
  if (raw.format && raw.format !== LEVEL_FORMAT) throw new Error(lm('format.unknown', { format: showValue(raw.format) }));
  // any other JSON (package.json, a settings file…) must not open as a blank level
  if (!raw.format && !Array.isArray(raw.tiles) && !Array.isArray(raw.heights)) throw new Error(lm('format.notLevel'));
  const newer = toNumber(raw.version ?? 1) > LEVEL_VERSION;
  if (newer) warnings.push(lm('warn.newer', { version: showValue(raw.version), engine: LEVEL_VERSION }));

  // (rows String() cannot convert — a JSON object with an own `toString` key — become '')
  const tilesIn = Array.isArray(raw.tiles) ? raw.tiles.map((r) => toText(r, '')) : [];
  const heightsIn = Array.isArray(raw.heights) ? raw.heights.map((r) => toText(r, '')) : [];
  let depth = clampSize(raw.depth ?? tilesIn.length ?? MIN_SIZE);
  let width = clampSize(raw.width ?? Math.max(0, ...tilesIn.map((r) => r.length)));
  if (!tilesIn.length) warnings.push(lm('warn.noTiles'));

  const legend = { ...defaultLegend(), ...(raw.legend && typeof raw.legend === 'object' ? raw.legend : {}) };
  // a tile field String() cannot convert (a texture name `{"toString": 1}`) is dropped from a copy
  // of its entry, so TileMap / TextureLibrary / the editor never convert it (KNOWN_ISSUES LVL-18)
  for (const k of Object.keys(legend)) if (hasUnconvertible(legend[k])) legend[k] = stripUnconvertible(clone(legend[k]));
  // a tile is one character of a row: a longer key (e.g. "constructor") is kept in the file, but
  // no tile can use it (the editor's palette leaves it out)
  for (const k of Object.keys(legend)) if (k.length !== 1) warnings.push(lm('warn.legendKey', { key: k }));
  const tiles = [];
  const heights = [];
  for (let j = 0; j < depth; j++) {
    let t = (tilesIn[j] ?? '').slice(0, width);
    let h = (heightsIn[j] ?? '').slice(0, width);
    if (t.length < width) t += (tilesIn[j] ? t[t.length - 1] : 'g').repeat(width - t.length);
    if (h.length < width) h += (h[h.length - 1] ?? '0').repeat(width - h.length);
    let fixed = '';
    for (const ch of t) {
      if (legend[ch]) fixed += ch;
      else { fixed += 'g'; warnings.push(lm('warn.tileChar', { ch, row: j })); }
    }
    tiles.push(fixed);
    heights.push([...h].map((c) => levelToChar(charToLevel(c))).join(''));
  }
  if (tilesIn.length && tilesIn.length !== depth) warnings.push(lm('warn.rowCount', { rows: tilesIn.length, depth }));

  // (environment and water values String() cannot convert are dropped: the defaults apply, LVL-18)
  const env = { ...DEFAULT_ENVIRONMENT, ...ownCopy(raw.environment) };
  const water = { ...DEFAULT_WATER, ...ownCopy(raw.water) };
  if (!Array.isArray(water.flow) || water.flow.length !== 2) water.flow = [...DEFAULT_WATER.flow];

  const spawnIn = raw.spawn && typeof raw.spawn === 'object' ? raw.spawn : {};
  const spawn = {
    // extra keys a tool or a newer engine wrote are kept
    ...spawnIn,
    x: finite(spawnIn.x, width / 2),
    z: finite(spawnIn.z, depth / 2),
    facing: ['down', 'up', 'left', 'right'].includes(spawnIn.facing) ? spawnIn.facing : 'down',
  };

  const objects = [];
  const rawObjects = (Array.isArray(raw.objects) ? raw.objects : []).filter((o) => {
    if (o && isOwnKey(OBJECT_TYPES, o.type)) return true;
    warnings.push(lm('warn.objectType', { type: showValue(o?.type) }));
    return false;
  });
  // every id the file uses: a renamed object never takes the id of one further down
  // (as normalizeObject converts ids: an id String() cannot convert is '', i.e. renamed)
  const taken = new Set(rawObjects.map((o) => toText(o.id ?? '', '')).filter(Boolean));
  const ids = new Set();
  for (const o of rawObjects) {
    // (the object's text keys are cleaned once, by normalizeObject, which counts what it drops)
    const report = { textKeys: 0, upcased: 0 };
    const n = normalizeObject(o, report);
    if (report.textKeys) warnings.push(lm('warn.objectTextKeys', { id: showValue(n.id), n: report.textKeys }));
    if (report.upcased) warnings.push(lm('warn.objectUpcased', { id: showValue(n.id), n: report.upcased }));
    // 'spawn' is how the editor addresses the player start: never an object id
    if (!n.id || ids.has(n.id) || n.id === SPAWN_ID) {
      const was = n.id;
      n.id = uniqueId(taken, n.type);
      if (was) warnings.push(was === SPAWN_ID ? lm('warn.reservedId', { reserved: SPAWN_ID, id: n.id }) : lm('warn.duplicateId', { was, id: n.id }));
    }
    taken.add(n.id);
    ids.add(n.id);
    objects.push(n);
  }

  // the content-text keys of the level's own texts (docs/specs/I18N.md §4.2), bounded like an
  // object's by the texts it holds: a key of a title line its environment lacks (or holds as no
  // string) is dropped; the subtitle is always held (a blank one keeps its key: `textKeyIssues`
  // lists it as stray)
  /** @type {Record<string, unknown>} */
  const rootTexts = { subtitle: toText(raw.subtitle ?? '', '') };
  const envTitle = env.title && typeof env.title === 'object' && !Array.isArray(env.title) ? env.title : {};
  for (const f of LEVEL_TEXT_FIELDS) {
    if (f.startsWith('title.') && Object.prototype.hasOwnProperty.call(envTitle, f.slice(6))) rootTexts[f] = envTitle[f.slice(6)];
  }
  const rootKeys = cleanTextKeysOf('root', raw.textKeys, rootTexts);
  if (rootKeys.dropped) warnings.push(lm('warn.rootTextKeys', { n: rootKeys.dropped }));
  if (rootKeys.upcased) warnings.push(lm('warn.rootUpcased', { n: rootKeys.upcased }));

  // top-level fields this engine does not know (a newer version, a tool's notes) are kept as
  // they are and written back after `objects` — in the file's own order, the level's `textKeys`
  // among them where the file has it (a field written before it stays before it)
  /** @type {Record<string, any>} */
  const extra = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'textKeys') { if (rootKeys.keys) extra.textKeys = rootKeys.keys; continue; }
    if (KNOWN_KEYS.has(k) || v === undefined || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    extra[k] = v;
  }

  /** @type {Level} */
  const level = {
    format: LEVEL_FORMAT,
    version: LEVEL_VERSION,
    name: toText(raw.name ?? 'Untitled', 'Untitled'),
    subtitle: toText(raw.subtitle ?? '', ''),
    author: toText(raw.author ?? '', ''),
    description: toText(raw.description ?? '', ''),
    width,
    depth,
    legend,
    tiles,
    heights,
    // (the same default as createEmptyLevel and TileMap: KNOWN_ISSUES LVL-06)
    waterLevel: finite(raw.waterLevel, 0.4),
    water,
    environment: env,
    spawn,
    objects,
    ...extra,
  };
  return { level, warnings, newer };
}

/** The selection token of the player start in the editor; reserved (never an object id). */
export const SPAWN_ID = 'spawn';

const KNOWN_KEYS = new Set(['format', 'version', 'name', 'subtitle', 'author', 'description', 'width', 'depth', 'legend', 'tiles', 'heights', 'waterLevel', 'water', 'environment', 'spawn', 'objects', 'textKeys']);

/**
 * Is (x, z) on the deck of one of the level's bridges (the game walks bridge decks)?
 * @param {Level} level
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function onBridgeDeck(level, x, z) {
  for (const o of level.objects ?? []) {
    if (o.type !== 'bridge') continue;
    const dx = o.x1 - o.x0;
    const dz = o.z1 - o.z0;
    const L2 = dx * dx + dz * dz;
    if (!(L2 > 0)) continue;
    const t = ((x - o.x0) * dx + (z - o.z0) * dz) / L2;
    if (t < 0 || t > 1) continue;
    const half = (Number(o.opts?.width) || 2) / 2;
    if (Math.hypot(o.x0 + dx * t - x, o.z0 + dz * t - z) <= half) return true;
  }
  return false;
}

/**
 * Is world point (x, z) walkable ground for the player: a walkable tile or a bridge deck? A tile
 * is walkable by TileMap's rule, `walkable ?? !water` (so a water tile with `walkable: true` — a
 * ford — is walkable; KNOWN_ISSUES LVL-13); void never is.
 * @param {Level} level
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function isWalkablePoint(level, x, z) {
  if (onBridgeDeck(level, x, z)) return true;
  const t = level.legend[getTile(level, Math.floor(x), Math.floor(z))];
  return !!t && !t.void && !!(t.walkable ?? !t.water);
}

/**
 * A hard error of `validateLevelIssues`: `code` names it independently of the wording —
 * 'tiles.rows' / 'heights.rows' (row count ≠ depth), 'tiles.row' / 'heights.row' (row `row` has
 * `length` characters), 'spawn.outside', 'spawn.unwalkable' — and `message` is the English text
 * `validateLevel` returns.
 * @typedef {{ code: 'tiles.rows'|'heights.rows'|'tiles.row'|'heights.row'|'spawn.outside'|'spawn.unwalkable',
 *   message: string, row?: number, length?: number }} LevelIssue
 */

/**
 * Hard errors that make a level unplayable (empty = OK), with their codes (a UI that words or
 * translates them itself: the editor's play-test check).
 * @param {Level} level
 * @returns {LevelIssue[]}
 */
export function validateLevelIssues(level) {
  /** @type {LevelIssue[]} */
  const issues = [];
  if (level.tiles.length !== level.depth) issues.push({ code: 'tiles.rows', message: 'tiles row count does not match depth' });
  if (level.heights.length !== level.depth) issues.push({ code: 'heights.rows', message: 'heights row count does not match depth' });
  level.tiles.forEach((r, j) => { if (r.length !== level.width) issues.push({ code: 'tiles.row', message: `tiles row ${j} has length ${r.length}`, row: j, length: r.length }); });
  level.heights.forEach((r, j) => { if (r.length !== level.width) issues.push({ code: 'heights.row', message: `heights row ${j} has length ${r.length}`, row: j, length: r.length }); });
  const { x, z } = level.spawn;
  if (x < 0 || z < 0 || x >= level.width || z >= level.depth) issues.push({ code: 'spawn.outside', message: 'spawn is outside the map' });
  // a bridge deck counts: the game walks it (an all-water map with a bridge is playable)
  else if (!isWalkablePoint(level, x, z)) issues.push({ code: 'spawn.unwalkable', message: 'spawn is not on walkable ground' });
  return issues;
}

/**
 * Hard errors that make a level unplayable (empty = OK), in English. Use after `normalizeLevel`
 * for user-facing checks (e.g. before play-testing).
 * @param {Level} level
 * @returns {string[]}
 */
export function validateLevel(level) {
  return validateLevelIssues(level).map((e) => e.message);
}

const finite = (v, d) => (Number.isFinite(toNumber(v)) && v !== null && v !== '' ? toNumber(v) : d);

function uniqueId(ids, type) {
  let n = 1;
  while (ids.has(`${type}_${n}`)) n++;
  return `${type}_${n}`;
}

/**
 * A fresh unique object id for `type` within `level` (`<type>_<n>`).
 * @param {Level} level
 * @param {string} type
 * @returns {string}
 */
export function generateObjectId(level, type) {
  return uniqueId(new Set(level.objects.map((o) => o.id)), type);
}

/**
 * Create a catalog object with a fresh id and add it to the level. Returns the object.
 * @template {ObjectType} T
 * @param {Level} level
 * @param {T} type
 * @param {number} x
 * @param {number} z
 * @param {ObjectOverrides<T>} [overrides] deep-merged over the defaults (see createObject)
 * @returns {LevelObjectOf<T>}
 */
export function addObject(level, type, x, z, overrides = {}) {
  /** @type {any} LevelObjectOf<T> for a generic T: the checker cannot resolve its members here */
  const obj = createObject(type, x, z, overrides);
  obj.id = generateObjectId(level, type);
  level.objects.push(obj);
  return obj;
}

// ---------------------------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------------------------

/**
 * Pretty JSON: one line per tile row and one line per object, so files are readable and diffs
 * stay small.
 * @param {Level} level a normalised level (every known top-level field present)
 * @returns {string} the file text (LF line endings, one trailing newline)
 */
export function serializeLevel(level) {
  const q = (v) => JSON.stringify(v);
  const lines = ['{'];
  const keys = ['format', 'version', 'name', 'subtitle', 'author', 'description', 'width', 'depth', 'waterLevel', 'water', 'environment', 'spawn'];
  for (const k of keys) lines.push(`  ${q(k)}: ${q(level[k])},`);
  lines.push('  "legend": {');
  const lk = Object.keys(level.legend);
  lk.forEach((k, i) => lines.push(`    ${q(k)}: ${q(level.legend[k])}${i < lk.length - 1 ? ',' : ''}`));
  lines.push('  },');
  for (const k of ['tiles', 'heights']) {
    lines.push(`  ${q(k)}: [`);
    level[k].forEach((r, i) => lines.push(`    ${q(r)}${i < level[k].length - 1 ? ',' : ''}`));
    lines.push('  ],');
  }
  lines.push('  "objects": [');
  level.objects.forEach((o, i) => lines.push(`    ${q(o)}${i < level.objects.length - 1 ? ',' : ''}`));
  // the level's own text keys (when it has any) and the fields this engine does not know (kept
  // from the file that was loaded), in the level's own order: a file keeps its order (an unknown
  // field before `textKeys` stays before it); an older engine writes `textKeys` as an unknown field
  const extra = Object.keys(level).filter((k) => (k === 'textKeys' ? !!level.textKeys : !KNOWN_KEYS.has(k) && level[k] !== undefined));
  lines.push(extra.length ? '  ],' : '  ]');
  extra.forEach((k, i) => lines.push(`  ${q(k)}: ${q(level[k])}${i < extra.length - 1 ? ',' : ''}`));
  lines.push('}');
  return lines.join('\n') + '\n';
}

/**
 * Parse level JSON text (or an already-parsed object) into a normalised level.
 * @param {string|object} textOrObject
 * @returns {{ level: Level, warnings: string[], newer: boolean }}
 */
export function parseLevel(textOrObject) {
  const raw = typeof textOrObject === 'string' ? JSON.parse(textOrObject) : textOrObject;
  return normalizeLevel(raw);
}

/**
 * Deep copy.
 * @param {Level} level
 * @returns {Level}
 */
export const cloneLevel = (level) => JSON.parse(JSON.stringify(level));

// ---------------------------------------------------------------------------------------------
// Tile accessors (rows are strings; these replace one row per write)
// ---------------------------------------------------------------------------------------------

/**
 * Is tile (i, j) inside the map?
 * @param {Level} level
 * @param {number} i
 * @param {number} j
 * @returns {boolean}
 */
export const inBounds = (level, i, j) => i >= 0 && j >= 0 && i < level.width && j < level.depth;

/**
 * Tile char at (i, j), or null outside the map.
 * @param {Level} level
 * @param {number} i
 * @param {number} j
 * @returns {string|null}
 */
export function getTile(level, i, j) {
  return inBounds(level, i, j) ? level.tiles[j][i] : null;
}

/**
 * Terrain level (0-35) at (i, j), or null outside the map.
 * @param {Level} level
 * @param {number} i
 * @param {number} j
 * @returns {number|null}
 */
export function getHeightLevel(level, i, j) {
  return inBounds(level, i, j) ? charToLevel(level.heights[j][i]) : null;
}

/**
 * Set the tile char at (i, j). Returns true if it changed.
 * @param {Level} level
 * @param {number} i
 * @param {number} j
 * @param {string} ch a legend character
 * @returns {boolean}
 */
export function setTile(level, i, j, ch) {
  if (!inBounds(level, i, j) || level.tiles[j][i] === ch) return false;
  const r = level.tiles[j];
  level.tiles[j] = r.slice(0, i) + ch + r.slice(i + 1);
  return true;
}

/**
 * Set the terrain level at (i, j) (clamped 0-35). Returns true if it changed.
 * @param {Level} level
 * @param {number} i
 * @param {number} j
 * @param {number} lvl
 * @returns {boolean}
 */
export function setHeightLevel(level, i, j, lvl) {
  if (!inBounds(level, i, j)) return false;
  const ch = levelToChar(lvl);
  const r = level.heights[j];
  if (r[i] === ch) return false;
  level.heights[j] = r.slice(0, i) + ch + r.slice(i + 1);
  return true;
}

/**
 * Legend entry of the tile at (i, j) (null outside / unknown).
 * @param {Level} level
 * @param {number} i
 * @param {number} j
 * @returns {TileDef|null}
 */
export function tileDef(level, i, j) {
  const ch = getTile(level, i, j);
  return ch == null ? null : level.legend[ch] ?? null;
}

/**
 * The map object the TileMap constructor expects (contract §4.7).
 * @param {Level} level
 * @returns {{ name: string, legend: Record<string, TileDef>, tiles: string[], heights: string[],
 *   waterLevel: number }}
 */
export function toTileMapInput(level) {
  return { name: level.name, legend: level.legend, tiles: level.tiles, heights: level.heights, waterLevel: level.waterLevel };
}

// ---------------------------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------------------------

/** @typedef {'nw'|'n'|'ne'|'w'|'c'|'e'|'sw'|'s'|'se'} ResizeAnchor  the side the content stays on */

/**
 * Resize a level, keeping content anchored. Objects, spawn and regions move with the content;
 * objects that end up outside the new map are kept (they may be scenery beyond the edge).
 * @param {Level} level
 * @param {number} width
 * @param {number} depth
 * @param {{ anchor?: ResizeAnchor, fill?: string,
 *   fillLevel?: number|null }} [opts]
 *   fillLevel: terrain level of the new tiles (null: the level of the top-left tile)
 * @returns {Level} a new level
 */
export function resizeLevel(level, width, depth, { anchor = 'c', fill = 'g', fillLevel = null } = {}) {
  width = clampSize(width);
  depth = clampSize(depth);
  const ax = anchor.includes('w') ? 0 : anchor.includes('e') ? 1 : 0.5;
  const az = anchor.includes('n') ? 0 : anchor.includes('s') ? 1 : 0.5;
  const dx = Math.round((width - level.width) * ax);
  const dz = Math.round((depth - level.depth) * az);
  const fillH = levelToChar(fillLevel ?? charToLevel(level.heights[0]?.[0] ?? '2'));
  const out = cloneLevel(level);
  out.width = width;
  out.depth = depth;
  out.tiles = [];
  out.heights = [];
  for (let j = 0; j < depth; j++) {
    let t = '';
    let h = '';
    for (let i = 0; i < width; i++) {
      const si = i - dx;
      const sj = j - dz;
      if (inBounds(level, si, sj)) { t += level.tiles[sj][si]; h += level.heights[sj][si]; } else { t += fill; h += fillH; }
    }
    out.tiles.push(t);
    out.heights.push(h);
  }
  shiftLevelContent(out, dx, dz);
  return out;
}

/**
 * Move spawn, every object and every absolute position stored in the environment (camera bounds,
 * god-ray / foliage / forest areas, title camera) by (dx, dz) world units (in place). Object fields that
 * are relative to the object (`area`, `spotOffsets`, `talkOffset`) need no change; the absolute
 * legacy forms (`bounds`, `spots`, `talkPoint`) are shifted too.
 * @param {Level} level
 * @param {number} dx
 * @param {number} dz
 * @returns {Level} the same level
 */
export function shiftLevelContent(level, dx, dz) {
  if (!dx && !dz) return level;
  level.spawn.x = t6(level.spawn.x + dx);
  level.spawn.z = t6(level.spawn.z + dz);
  for (const o of level.objects) {
    const def = OBJECT_TYPES[o.type];
    if (def.placement === 'line') { o.x0 = t6(o.x0 + dx); o.x1 = t6(o.x1 + dx); o.z0 = t6(o.z0 + dz); o.z1 = t6(o.z1 + dz); }
    if (def.placement === 'rect') shiftRect(o, dx, dz);
    if (o.x != null) o.x = t6(o.x + dx);
    if (o.z != null) o.z = t6(o.z + dz);
    if (isRect(o.bounds)) shiftRect(o.bounds, dx, dz);
    if (Array.isArray(o.spots)) o.spots = o.spots.map((p) => (Array.isArray(p) ? [t6(p[0] + dx), t6(p[1] + dz)] : p));
    if (Array.isArray(o.talkPoint)) o.talkPoint = [t6(o.talkPoint[0] + dx), t6(o.talkPoint[1] + dz)];
  }
  const env = /** @type {Partial<LevelEnvironment>} */ (level.environment ?? {});
  const b = env.camera?.bounds;
  if (isRect(b)) shiftRect(b, dx, dz);
  else if (b && typeof b === 'object') for (const r of Object.values(b)) if (isRect(r)) shiftRect(r, dx, dz);
  for (const r of env.godRayAreas ?? []) if (isRect(r)) shiftRect(r, dx, dz);
  for (const r of env.foliage?.flowerAreas ?? []) if (isRect(r)) shiftRect(r, dx, dz);
  for (const r of env.foliage?.shrubAreas ?? []) if (isRect(r)) shiftRect(r, dx, dz);
  for (const r of (Array.isArray(env.forest?.areas) ? env.forest.areas : [])) if (isRect(r)) shiftRect(r, dx, dz);
  const tc = env.titleCamera;
  if (tc && typeof tc === 'object') {
    if (Number.isFinite(tc.x)) tc.x = t6(tc.x + dx);
    if (Number.isFinite(tc.z)) tc.z = t6(tc.z + dz);
  }
  return level;
}

/** Shifted coordinates are rounded (1e-6) so resizing out and back is an exact identity. */
const t6 = (v) => Math.round(v * 1e6) / 1e6;

const isRect = (r) => r && typeof r === 'object' && ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => Number.isFinite(r[k]));

function shiftRect(r, dx, dz) {
  r.minX = t6(r.minX + dx); r.maxX = t6(r.maxX + dx); r.minZ = t6(r.minZ + dz); r.maxZ = t6(r.maxZ + dz);
}

/**
 * Summary statistics (for status bars / file lists).
 * @param {Level} level
 * @returns {{ width: number, depth: number, objects: number, counts: Record<string, number>,
 *   water: number, walkable: number }}
 *   counts: objects per type; water / walkable: tile counts
 */
export function levelStats(level) {
  const counts = {};
  for (const o of level.objects) counts[o.type] = (counts[o.type] ?? 0) + 1;
  let water = 0;
  let walkable = 0;
  for (const row of level.tiles) {
    for (const ch of row) {
      const d = level.legend[ch];
      if (d?.water) water++;
      else if (d && !d.void && d.walkable !== false) walkable++;
    }
  }
  return { width: level.width, depth: level.depth, objects: level.objects.length, counts, water, walkable };
}
