import * as THREE from 'three';
import { Sprite3D } from '../../engine/sprite/Sprite3D.js';
import { makeShadowOnly } from '../../engine/world/ShadowCasters.js';
import { createCharacterSheet, createCreatureSheet, CHARACTER_PRESETS } from '../../engine/pixel/CharacterSprites.js';
import { createEnemySheet } from '../../engine/pixel/MonsterSprites.js';
import {
  OBJECT_TYPES, ENEMY_KINDS, ENEMY_INFO, objectBounds, critterStartPoints, critterYard, enemyStartPoints,
} from '../../engine/level/ObjectCatalog.js';
import { RNG, hashString } from '../../engine/utils/math.js';
import { isOwnKey, ownValue, showValue, ownColor } from '../../engine/utils/own.js';
import { PARTICLE_PRESETS } from '../../engine/fx/Particles.js';
import * as GAME from '../../game/config.js';
import { ENEMY_DEFS } from '../../game/combat/defs.js';
import { enemyKind, enemyArena, enemyGate, bossArena, bossGate } from '../enemyGroups.js';
import { tr } from '../i18n.js';
import { COLORS, EMITTER_COLORS, fatSegments, fillMesh, pointsObject, boxEdges, disposeGeometry } from './Gizmos.js';
import { rectFill, drapedRect, drapedCircle, drapedPath, pathToSegments } from './Drape.js';
import { SpriteBatch } from './SpriteBatch.js';

/**
 * @import { Level, LevelObject, Rect, TileRect } from '../../engine/level/types.js'
 * @import { Emitter, Particles } from '../../engine/fx/Particles.js'
 * @import { Label, LabelLayer } from './Labels.js'
 * @import { LevelSurface } from './Picking.js'
 * @import { GizmoKit } from './Gizmos.js'
 * @import { LightingSystem } from '../../engine/lighting/LightingSystem.js'
 * @import { SceneNode } from '../../engine/render/types.js'
 */

/** Character look shared with the game (src/game/config.js), with local fallbacks. */
const SPRITE_OPTS = GAME.CHARACTER_SPRITE_OPTS ?? { normalUp: 0.6, wrap: 0.6, roundness: 0.55, emissive: '#ffe9d2', emissiveIntensity: 0.06 };
const SPRITE_FILL = GAME.SPRITE_FILL ?? { day: 0.05, night: 0.03 };
/** World direction of a level `facing`. */
const FACING_VEC = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const CAT_COLORS = { fur: '#d8893c', fur2: '#a95a24', fur3: '#f3c27a' };
/** Story event triggers with a short tag word ('tools.map.on.*', as on the 2D map). */
const EVENT_ON_WORDS = new Set(['use', 'enter', 'leave', 'arrive', 'change', 'time', 'cleared']);
/** Enemy group marker colours: home ring (elite groups: gold), boss arena, arena gate. */
export const ENEMY_COLORS = Object.freeze({ ring: '#e0674f', elite: '#f2c14e', arena: '#ff8a5c', gate: '#ffd36b' });
/** Directions an enemy may idle in (seeded per enemy; never its back to the camera). */
const ENEMY_FACINGS = [[0, 1], [-1, 0], [1, 0], [-0.7, 0.7], [0.7, 0.7]];

// (the enemy-group helpers live in src/editor/enemyGroups.js, shared with the 2D map, the tools
// and the app; re-exported here for the 3D modules)
export { enemyKind, enemyArena, enemyGate, bossArena, bossGate };

/** Hover height of an enemy kind (fliers; src/game/combat/defs.js). */
export const enemyHover = (kind) => ENEMY_DEFS[kind]?.hover ?? (ENEMY_INFO[kind]?.flier ? 1.3 : 0);

/** World direction [x, z] of an entrance's arrival facing ('down' = +Z, toward the camera). */
const ENTRANCE_DIR = Object.freeze({ down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] });

/** A villager's collider radius (`Npc`: the game adds one per villager before critters and enemies spawn). */
const NPC_R = 0.34;

/** Do two world rects overlap? */
const overlaps = (a, b) => !(a.maxX < b.minX || a.minX > b.maxX || a.maxZ < b.minZ || a.minZ > b.maxZ);

/**
 * World rects around the villager collider centres that differ between two [x, z, …] lists (the
 * ones placed, moved or removed).
 */
function npcMoves(before, after) {
  const keys = (a) => {
    const s = new Set();
    for (let k = 0; k < a.length; k += 2) s.add(`${a[k]},${a[k + 1]}`);
    return s;
  };
  const kb = keys(before);
  const ka = keys(after);
  const out = [];
  const add = (list, other) => {
    for (let k = 0; k < list.length; k += 2) {
      if (other.has(`${list[k]},${list[k + 1]}`)) continue;
      const m = NPC_R + 0.05;
      out.push({ minX: list[k] - m, maxX: list[k] + m, minZ: list[k + 1] - m, maxZ: list[k + 1] + m });
    }
  };
  add(before, ka);
  add(after, kb);
  return out;
}

/** Entry types shown with the Objects toggle (their rings / arenas also need Markers). */
const ACTOR_TYPES = new Set(['npc', 'critters', 'enemy']);

const _hit = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * One actor / marker of `ActorPreview.entries` (made by the `_create*` methods); the members after
 * `box` exist for some types only.
 * @typedef {object} ActorEntry
 * @property {string} id
 * @property {'npc'|'critters'|'enemy'|'emitter'|'region'|'exit'|'entrance'|'event'|'marker'|'light'} type
 * @property {LevelObject} obj          private copy of the level object
 * @property {string} sig               JSON signature of `obj`
 * @property {Sprite3D[]} sprites       its sprites (npc, critters, enemy; [] for markers)
 * @property {THREE.Object3D[]} over    overlay parts (rings, boxes, fills; re-draped by _place)
 * @property {Rect} fp                  footprint on the terrain (see _footprint)
 * @property {THREE.Box3|null} [box]    pick box (null: regions, picked by their edge)
 * @property {number[]} [facing]        npc: world direction [x, z] it faces
 * @property {number[][]} [offsets]     critters / enemy: start spots [dx, dz] relative to the group
 * @property {number[][]} [facings]     enemy: idle direction [x, z] per sprite
 * @property {string} [kind]            enemy: its kind (enemyKind)
 * @property {number} [hover]           enemy: hover height (fliers)
 * @property {boolean} [elite]          enemy: elite group (gold ring)
 * @property {Rect|null} [arena]        enemy: the boss arena (world), or null
 * @property {number[]|null} [gate]     enemy: the boss gate [x0, z0, x1, z1] (world), or null
 * @property {number[]} [frame]         enemy: sprite frame size [w, h] in world units
 * @property {{ line: THREE.Material, dot: THREE.Material }} [mats]  emitter: its materials
 * @property {Emitter|null} [particle]
 *   emitter: live particles (atmosphere on)
 * @property {THREE.Box3} [volume]      emitter: the particle box
 * @property {THREE.Vector3} [center]   emitter: centre of the particle box
 * @property {Label} [label]  region / exit / entrance / event / marker: its label
 * @property {THREE.Material} [mat]     light: bulb material
 */

/**
 * ActorPreview — the non-geometry level content of the 3D view:
 *  - NPCs as idle Sprite3D characters facing their `facing` (sheets cached per preset),
 *  - critter groups as creature sprites where the game starts them (the same `count`, relative
 *    `spotOffsets` / absolute `spots`, `area` / `bounds` yard and seeded scatter as
 *    src/game/Critters.js) (+ roam ring),
 *  - enemy groups (COMBAT.md §17) as enemy sprites where the game starts them
 *    (`enemyStartPoints` with the combat spawn's test: standable ground, bridge decks over water
 *    included; fliers hover, and may start over water) with a red home ring (gold for elite
 *    groups), the boss's arena as a dashed rectangle and its gate as a bright line — plain lit
 *    sprites, without the game's combat flash / glow program, drawn through a `SpriteBatch`
 *    (per enemy kind one colour draw and one shadow-pass draw, one blob draw for all: the look
 *    of a Sprite3D each, which costs ≈ 3 draws apiece),
 *  - scattered critters and enemies avoid the villagers' colliders and the props' (the view's
 *    placement test), and scatter again when the ground, a prop or a villager there changes,
 *  - the player start as a translucent traveler with a glowing ring and a facing chevron,
 *  - particle areas as wireframe boxes (+ real particles while the atmosphere preview is on),
 *  - regions as translucent draped rectangles with a floating name label; campaign exits (green)
 *    and story events (gold) likewise, with their target / trigger as the label; entrances and
 *    story markers as rings with a facing arrow and their name,
 *  - invisible point lights ('light' objects) as glowing bulbs.
 * Sprites live in the lit scene; wireframes, rectangles and bulbs in the overlay scene.
 */
export class ActorPreview {
  /**
   * @param {{ scene: THREE.Object3D, overlay: THREE.Object3D, surface: LevelSurface,
   *           lighting: LightingSystem, kit: GizmoKit, labels: LabelLayer,
   *           compile?: ((color: THREE.Object3D[], shadow: THREE.Object3D[]) => Promise<any>)|null }} ctx
   *   compile: warms the programs of new batch meshes in the background (see SpriteBatch)
   */
  constructor({ scene, overlay, surface, lighting, kit, labels, compile = null }) {
    this.surface = surface;
    this.lighting = lighting;
    this.kit = kit;
    this.labels = labels;
    this.sprites = new THREE.Group();
    this.sprites.name = 'Editor:actors';
    scene.add(this.sprites);
    this.markers = new THREE.Group();
    this.markers.name = 'Editor:markers';
    scene.add(this.markers);
    this.overlay = new THREE.Group();
    this.overlay.name = 'Editor:markerOverlay';
    overlay.add(this.overlay);
    /** @type {Map<string, ActorEntry>} */
    this.entries = new Map();
    this._sheets = new Map();
    this._particles = null;
    this.showObjects = true;
    this.showMarkers = true;
    /** Object types hidden in the views (state.view.hiddenTypes). */
    this.hiddenTypes = new Set();
    /** Objects the story preview hides (src/editor/story.js). */
    this.hiddenIds = new Set();
    this._time = 0;
    /** The view's placement tests (see sync) and the villagers' collider centres [x, z, …]. */
    this._isWalkable = null;
    this._isStandable = null;
    this._npcs = [];
    /** Bumped when a villager appears, goes or moves (the placement test changed). */
    this.npcVersion = 0;
    /** The enemy sprites' instanced batch (made with the first enemy) and its warm-up hook. */
    this.enemyBatch = null;
    this._compile = compile;
    /** A sprite of the default enemy kind that primes the batch (primeEnemies; never shown). */
    this._primeSprite = null;

    // shared marker materials
    this._mat = {
      regionFill: kit.fillMaterial({ color: COLORS.region, opacity: 0.13 }),
      regionLine: kit.lineMaterial({ color: COLORS.region, width: 2, opacity: 0.85, dashed: true, dashSize: 0.55, gapSize: 0.3 }),
      critterRing: kit.lineMaterial({ color: COLORS.critters, width: 1.5, opacity: 0.55, dashed: true, dashSize: 0.3, gapSize: 0.25 }),
      enemyRing: kit.lineMaterial({ color: ENEMY_COLORS.ring, width: 1.75, opacity: 0.7, dashed: true, dashSize: 0.45, gapSize: 0.22 }),
      eliteRing: kit.lineMaterial({ color: ENEMY_COLORS.elite, width: 1.75, opacity: 0.75, dashed: true, dashSize: 0.45, gapSize: 0.22 }),
      arenaLine: kit.lineMaterial({ color: ENEMY_COLORS.arena, width: 2, opacity: 0.85, dashed: true, dashSize: 0.7, gapSize: 0.35 }),
      gateLine: kit.lineMaterial({ color: ENEMY_COLORS.gate, width: 3.5, opacity: 0.95 }),
      exitFill: kit.fillMaterial({ color: COLORS.exit, opacity: 0.16 }),
      exitLine: kit.lineMaterial({ color: COLORS.exit, width: 2, opacity: 0.9, dashed: true, dashSize: 0.8, gapSize: 0.3 }),
      entranceRing: kit.lineMaterial({ color: COLORS.exit, width: 2.25, opacity: 0.9 }),
      eventFill: kit.fillMaterial({ color: COLORS.event, opacity: 0.14 }),
      eventLine: kit.lineMaterial({ color: COLORS.event, width: 2, opacity: 0.9, dashed: true, dashSize: 0.5, gapSize: 0.3 }),
      markerRing: kit.lineMaterial({ color: COLORS.event, width: 2, opacity: 0.9 }),
      emitter: new Map(),
      bulb: new Map(),
    };
    this._spawnMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLORS.spawn).multiplyScalar(2.4), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    this._spawnDisc = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLORS.spawn).multiplyScalar(0.8), transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    this.spawn = null;
    /** Marker wireframe opacity multiplier (dimmed in the gameplay camera view). */
    this._dim = 1;
    /** Each marker material's opacity at dim 1. */
    this._baseOpacity = new Map(/** @type {[THREE.Material, number][]} */ ([
      [this._mat.regionFill, 0.13], [this._mat.regionLine, 0.85], [this._mat.critterRing, 0.55],
      [this._mat.enemyRing, 0.7], [this._mat.eliteRing, 0.75], [this._mat.arenaLine, 0.85], [this._mat.gateLine, 0.95],
      [this._mat.exitFill, 0.16], [this._mat.exitLine, 0.9], [this._mat.entranceRing, 0.9],
      [this._mat.eventFill, 0.14], [this._mat.eventLine, 0.9], [this._mat.markerRing, 0.9],
    ]));
  }

  /**
   * Dim the marker wireframes / region fills (e.g. in the gameplay camera, where they would
   * clutter the diorama preview). 1 = normal.
   */
  setMarkerDim(k) {
    if (k === this._dim) return;
    this._dim = k;
    for (const [m, o] of this._baseOpacity) m.opacity = o * k;
    for (const mats of this._mat.emitter.values()) mats.line.opacity = 0.5 * k;
  }

  // -------------------------------------------------------------------------------------------
  // Sync
  // -------------------------------------------------------------------------------------------

  /**
   * Diff actors / markers against the level (by id + JSON signature) and re-seat the ones standing
   * on changed terrain (critter / enemy groups there also scatter again).
   * @param {Level} level
   * @param {{ ids?: Iterable<string>|null, terrainRect?: TileRect|null,
   *           terrainChanged?: boolean, isWalkable?: ((x:number, z:number) => boolean)|null,
   *           isStandable?: ((x:number, z:number) => boolean)|null }} [opts]
   *   ids: the objects that changed ('spawn' = player start; null = diff everything);
   *   terrainRect: tiles whose terrain changed (entries over them are re-draped);
   *   terrainChanged: the whole terrain changed; isWalkable: the game's placement test for
   *   scattered critters (TileMap walkability + prop colliders; the villagers' colliders are
   *   added here); isStandable: the combat spawn's test for walking enemies (also: a deck above
   *   water, never open water)
   * @returns {boolean} whether anything changed
   */
  sync(level, { ids = null, terrainRect = null, terrainChanged = false, isWalkable = null, isStandable = null } = {}) {
    this._isWalkable = isWalkable;
    this._isStandable = isStandable;
    let changed = false;
    // the villagers' colliders (the game's Npc adds one before critters and enemies spawn): one
    // placed, moved or removed makes the groups around it scatter again (below)
    const npcs = [];
    for (const o of level.objects) if (o.type === 'npc' && Number.isFinite(o.x) && Number.isFinite(o.z)) npcs.push(o.x, o.z);
    let npcRects = null;
    if (npcs.length !== this._npcs.length || npcs.some((v, k) => v !== this._npcs[k])) {
      npcRects = npcMoves(this._npcs, npcs);
      this._npcs = npcs;
      this.npcVersion++;
    }
    // (re)built here: the terrain pass below leaves them alone. Objects a full diff found
    // unchanged are NOT in it — an undone height stroke still moves them with the ground.
    const handled = new Set();
    const seenIds = new Set();
    const check = (id, obj) => {
      const e = this.entries.get(id);
      const def = obj && OBJECT_TYPES[obj.type];
      if (!def || (def.kind === 'prop' && obj.type !== 'light')) {
        if (e) { this._disposeEntry(e); this.entries.delete(id); changed = true; }
        handled.add(id);
        return;
      }
      const sig = JSON.stringify(obj);
      if (e && e.sig === sig) return;
      handled.add(id);
      if (e) this._disposeEntry(e);
      const ne = this._create(obj, sig);
      if (ne) this.entries.set(id, ne);
      else this.entries.delete(id);
      changed = true;
    };
    if (ids == null) {
      const seen = new Set();
      for (const obj of level.objects) {
        seen.add(obj.id);
        check(obj.id, obj);
      }
      for (const id of [...this.entries.keys()]) if (!seen.has(id)) check(id, null);
    } else {
      let byId = null;
      for (const id of ids) {
        if (id === 'spawn' || seenIds.has(id)) continue;
        seenIds.add(id);
        if (!byId) byId = new Map(level.objects.map((o) => [o.id, o]));
        check(id, byId.get(id) ?? null);
      }
    }
    const r = terrainRect;
    const hits = (f) => terrainChanged || (!!r && !(f.maxX < r.minI - 1 || f.minX > r.maxI + 2 || f.maxZ < r.minJ - 1 || f.minZ > r.maxJ + 2));
    if (terrainChanged || r) {
      for (const e of this.entries.values()) {
        if (handled.has(e.id) || !hits(e.fp)) continue;
        // (a group re-runs its scatter: water painted under a pack moves its members, as in the game)
        if (!this._reseat(e)) this._place(e);
        handled.add(e.id);
        changed = true;
      }
    }
    if (npcRects && this.rescatter(npcRects, handled)) changed = true;
    const ssig = JSON.stringify(level.spawn);
    if (!this.spawn || this.spawn.sig !== ssig) { this._buildSpawn(level.spawn, ssig); changed = true; }
    else if (hits({ minX: level.spawn.x, maxX: level.spawn.x, minZ: level.spawn.z, maxZ: level.spawn.z })) { this._placeSpawn(); changed = true; }
    if (changed) this._applyVisibility();
    return changed;
  }

  _create(obj, sig) {
    const o = JSON.parse(sig);
    let e = null;
    switch (o.type) {
      case 'npc': e = this._createNpc(o, sig); break;
      case 'critters': e = this._createCritters(o, sig); break;
      case 'enemy': e = this._createEnemy(o, sig); break;
      case 'emitter': e = this._createEmitter(o, sig); break;
      case 'region': e = this._createRegion(o, sig); break;
      case 'exit': e = this._createExit(o, sig); break;
      case 'entrance': e = this._createEntrance(o, sig); break;
      case 'event': e = this._createEvent(o, sig); break;
      case 'marker': e = this._createMarker(o, sig); break;
      case 'light': e = this._createBulb(o, sig); break;
      default: return null;
    }
    e.fp = this._footprint(o, e.offsets);
    return e;
  }

  /**
   * An entry's footprint on the terrain: its catalog bounds, its sprites' spots and, for a group,
   * the whole scatter area (the critter yard; the enemy `area` and the boss arena). Re-draped when
   * the tiles there change; a group scatters again when the placement test changes there.
   */
  _footprint(o, offsets) {
    const f = objectBounds(o);
    const grow = (b) => {
      if (!b) return;
      f.minX = Math.min(f.minX, b.minX); f.maxX = Math.max(f.maxX, b.maxX);
      f.minZ = Math.min(f.minZ, b.minZ); f.maxZ = Math.max(f.maxZ, b.maxZ);
    };
    for (const [dx, dz] of offsets ?? []) grow({ minX: o.x + dx, maxX: o.x + dx, minZ: o.z + dz, maxZ: o.z + dz });
    if (o.type === 'critters') grow(critterYard(o));
    else if (o.type === 'enemy') {
      grow(bossArena(o));
      const a = o.area;
      if (a && ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => Number.isFinite(a[k]))) {
        grow({ minX: o.x + Math.min(a.minX, a.maxX), maxX: o.x + Math.max(a.minX, a.maxX), minZ: o.z + Math.min(a.minZ, a.maxZ), maxZ: o.z + Math.max(a.minZ, a.maxZ) });
      }
    }
    return f;
  }

  // -------------------------------------------------------------------------------------------
  // Placement (where scattered critters and enemies start)
  // -------------------------------------------------------------------------------------------

  /** Is (x, z) inside a villager's collider? */
  _inNpc(x, z) {
    const n = this._npcs;
    for (let k = 0; k < n.length; k += 2) if ((x - n[k]) ** 2 + (z - n[k + 1]) ** 2 < NPC_R * NPC_R) return true;
    return false;
  }

  /**
   * Where a scattered critter may start (the game's `TileMap.isWalkable`: tiles, bridge decks,
   * prop and villager colliders), or null when the view gave no test.
   */
  critterTest() {
    const walk = this._isWalkable;
    return walk ? (x, z) => walk(x, z) && !this._inNpc(x, z) : null;
  }

  /**
   * Where an enemy may start (the combat spawn, COMBAT.md §9.2 / §14.1: `CombatSystem._spawnGroup`):
   * walkers on standable ground — walkable, and over water only on a deck above it; fliers
   * anywhere walkable or over water. Both avoid prop and villager colliders.
   * @param {boolean} flier
   */
  enemyTest(flier) {
    const walk = this._isWalkable;
    const stand = this._isStandable;
    const S = this.surface;
    const water = (x, z) => !!S.def(Math.floor(x), Math.floor(z))?.water;
    if (flier) return (x, z) => water(x, z) || ((!walk || walk(x, z)) && !this._inNpc(x, z));
    if (stand) return (x, z) => stand(x, z) && !this._inNpc(x, z);
    return (x, z) => !water(x, z) && (!walk || walk(x, z)) && !this._inNpc(x, z);
  }

  /** The start spots of a critter / enemy entry's group, relative to the group (current placement test). */
  _startOffsets(e) {
    const o = e.obj;
    const pts = e.type === 'enemy'
      ? enemyStartPoints(o, this.enemyTest(!!ENEMY_INFO[e.kind]?.flier))
      : critterStartPoints(o, this.critterTest());
    return pts.map(([px, pz]) => [px - o.x, pz - o.z]);
  }

  /**
   * Scatter a critter / enemy group again (the placement test changed around it); re-places it
   * when a member moved. Returns whether it was re-placed (false for other entries).
   */
  _reseat(e) {
    if (e.type !== 'critters' && e.type !== 'enemy') return false;
    const offsets = this._startOffsets(e);
    if (offsets.length === e.offsets.length && offsets.every(([x, z], k) => x === e.offsets[k][0] && z === e.offsets[k][1])) return false;
    e.offsets = offsets;
    e.fp = this._footprint(e.obj, offsets);
    this._place(e);
    return true;
  }

  /**
   * The placement test changed inside these world rects (props with colliders built / removed,
   * villagers moved): the critter / enemy groups whose scatter area overlaps one scatter again —
   * the game places them around every collider. Entries in `skip` were just built.
   * @param {{minX:number,maxX:number,minZ:number,maxZ:number}[]} rects
   * @param {Set<string>|null} [skip]
   * @returns {boolean} whether a group moved
   */
  rescatter(rects, skip = null) {
    if (!rects?.length) return false;
    let moved = false;
    for (const e of this.entries.values()) {
      if ((e.type !== 'critters' && e.type !== 'enemy') || skip?.has(e.id)) continue;
      if (!rects.some((r) => overlaps(r, e.fp))) continue;
      if (this._reseat(e)) moved = true;
    }
    if (moved) this._applyVisibility();
    return moved;
  }

  _sheet(key, make) {
    let s = this._sheets.get(key);
    if (!s) {
      s = make();
      this._sheets.set(key, s);
    }
    return s;
  }

  _characterSheet(preset, spec = null) {
    const p = isOwnKey(CHARACTER_PRESETS, preset) ? preset : 'villager';
    const extra = spec && typeof spec === 'object' ? spec : null;
    return this._sheet(`char:${p}:${extra ? JSON.stringify(extra) : ''}`, () => createCharacterSheet({ ...CHARACTER_PRESETS[p], preset: p, ...(extra ?? {}) }));
  }

  _makeSprite(sheet, opts = {}) {
    const s = new Sprite3D(sheet, { ...SPRITE_OPTS, ...opts });
    // the sun-facing shadow quad draws nothing in the colour pass: only give it a draw call in the
    // shadow pass (as the game does on big levels)
    if (s.shadowProxy && this.lighting?.sun) makeShadowOnly(s.shadowProxy, [this.lighting.sun]);
    // (a lit sprite: SPRITE_OPTS keep Sprite3D's lit default)
    const fill = this.lighting.registerEmissive(/** @type {THREE.MeshLambertMaterial} */ (s.material), SPRITE_FILL);
    s.userData.fill = fill;
    return s;
  }

  _createNpc(o, sig) {
    const sprite = this._makeSprite(this._characterSheet(o.preset, o.spec));
    sprite.name = `NPC:${o.id}`;
    sprite.userData.levelObjectId = o.id;
    const rng = new RNG(hashString(o.id));
    sprite.play('idle', { speed: 0.5 + rng.next() * 0.12 });
    this.sprites.add(sprite);
    const e = { id: o.id, type: 'npc', obj: o, sig, sprites: [sprite], facing: ownValue(FACING_VEC, o.facing) ?? FACING_VEC.down, over: [] };
    // wander radius (only drawn while selected — see Overlays)
    this._place(e);
    return e;
  }

  /** Creature sheet per kind (cached; the cat wears the game's ginger coat). */
  _creatureSheet(kind) {
    const k = ['chicken', 'cat', 'bird', 'dog'].includes(kind) ? kind : 'chicken';
    return this._sheet(`creature:${k}`, () => createCreatureSheet(k, k === 'cat' ? CAT_COLORS : {}));
  }

  _createCritters(o, sig) {
    const kind = ['chicken', 'cat', 'bird', 'dog'].includes(o.kind) ? o.kind : 'chicken';
    const sheet = this._creatureSheet(kind);
    const rng = new RNG(hashString(o.id));
    const offsets = critterStartPoints(o, this.critterTest()).map(([px, pz]) => [px - o.x, pz - o.z]);
    const n = offsets.length;
    const sprites = [];
    for (let k = 0; k < n; k++) {
      const s = this._makeSprite(sheet, {
        blobSize: kind === 'bird' ? [0.35, 0.18] : kind === 'chicken' ? [0.55, 0.26] : [0.7, 0.3],
        castShadow: kind !== 'bird',
      });
      s.userData.levelObjectId = o.id;
      s.setDirection(rng.pick(['down', 'left', 'right', 'up']));
      s.play('idle', { speed: 0.6 + rng.next() * 0.5 });
      this.sprites.add(s);
      sprites.push(s);
    }
    const e = { id: o.id, type: 'critters', obj: o, sig, sprites, offsets, over: [] };
    this._place(e);
    return e;
  }

  /** Enemy sheet per kind (cached; the sprites package's createEnemySheet). */
  _enemySheet(kind) {
    const k = ENEMY_KINDS.includes(kind) ? kind : 'slime';
    return this._sheet(`enemy:${k}`, () => createEnemySheet(k));
  }

  _createEnemy(o, sig) {
    const kind = enemyKind(o);
    const sheet = this._enemySheet(kind);
    const rng = new RNG(hashString(`enemy:${o.id}`));
    const info = ENEMY_INFO[kind];
    const offsets = enemyStartPoints(o, this.enemyTest(!!info.flier)).map(([px, pz]) => [px - o.x, pz - o.z]);
    const hover = enemyHover(kind);
    const sprites = [];
    const facings = [];
    for (let k = 0; k < offsets.length; k++) {
      // the game's Sprite3D options minus `combatFx` (the editor keeps the plain lit program)
      const s = this._makeSprite(sheet, { ...(sheet.spriteOptions ?? {}) });
      s.name = `Enemy:${o.id}:${k}`;
      s.userData.levelObjectId = o.id;
      // fliers draw their quad (and shadow proxy) at the hover height; the blob stays below
      if (hover) {
        s.mesh.position.y = hover;
        s.shadowProxy.position.y = hover;
      }
      facings.push(info.boss || info.passive ? [0, 1] : rng.pick(ENEMY_FACINGS));
      s.play('idle', { speed: 0.8 + rng.next() * 0.4 });
      this.sprites.add(s);
      sprites.push(s);
      this._batch().add(s);
    }
    const e = {
      id: o.id, type: 'enemy', obj: o, sig, sprites, offsets, facings, over: [],
      // (only the boss's arena and gate exist in the game: a leftover one on another kind is not drawn)
      kind, hover, elite: !!o.elite, arena: bossArena(o), gate: bossGate(o),
      frame: [sheet.frameWidth / (sheet.pixelsPerUnit || 16), sheet.frameHeight / (sheet.pixelsPerUnit || 16)],
    };
    this._place(e);
    return e;
  }

  /** The enemy sprites' batch (per kind in view one colour and one shadow draw, one blob draw for all; culled per sprite). */
  _batch() {
    this.enemyBatch ??= new SpriteBatch({
      parent: this.sprites, lights: this.lighting?.sun ? [this.lighting.sun] : [], lighting: this.lighting, fill: SPRITE_FILL, compile: this._compile,
    });
    return this.enemyBatch;
  }

  /**
   * Prime the enemy batch's programs (`SpriteBatch.prime`, with a template sprite of the default
   * kind that is never shown): the view calls it when the enemy tool is picked, so the first enemy
   * placed in a session without enemies costs no frame. No-op once the batch has drawn.
   */
  primeEnemies() {
    const b = this._batch();
    if (b.primed) return;
    if (!this._primeSprite) {
      const sheet = this._enemySheet(ENEMY_KINDS[0]);
      this._primeSprite = new Sprite3D(sheet, { ...SPRITE_OPTS, ...(sheet.spriteOptions ?? {}) });
    }
    b.prime(this._primeSprite);
  }

  _createEmitter(o, sig) {
    const color = ownValue(EMITTER_COLORS, o.preset) ?? OBJECT_TYPES.emitter.color;
    let mats = this._mat.emitter.get(color);
    if (!mats) {
      mats = {
        line: this.kit.lineMaterial({ color, width: 1.25, opacity: 0.5 * this._dim }),
        dot: this.kit.glowMaterial({ color, size: 0.7, opacity: 1 }),
      };
      this._mat.emitter.set(color, mats);
    }
    const e = { id: o.id, type: 'emitter', obj: o, sig, sprites: [], over: [], mats, particle: null };
    this._place(e);
    if (this._particles) this._spawnParticles(e);
    return e;
  }

  _createRegion(o, sig) {
    const label = this.labels.create('region');
    label.id = o.id;
    label.setText(o.name || tr('tools.map.region'), o.sub || '');
    const e = { id: o.id, type: 'region', obj: o, sig, sprites: [], over: [], label };
    this._place(e);
    return e;
  }

  /** A campaign exit: a green dashed rectangle with its target as the label. */
  _createExit(o, sig) {
    const label = this.labels.create('region exit');
    label.id = o.id;
    label.setText(`→ ${o.to || '?'}`, o.entrance || '');
    const e = { id: o.id, type: 'exit', obj: o, sig, sprites: [], over: [], label };
    this._place(e);
    return e;
  }

  /** A campaign entrance: a green ring with an arrow toward the arrival facing, named above. */
  _createEntrance(o, sig) {
    const label = this.labels.create('entrance');
    label.setText(o.name || o.id);
    const e = { id: o.id, type: 'entrance', obj: o, sig, sprites: [], over: [], label };
    this._place(e);
    return e;
  }

  /**
   * A story event: a gold dashed rectangle with its trigger and prompt as the label ("! use · Read";
   * "(background)" after it for an event that runs without holding the player).
   */
  _createEvent(o, sig) {
    const label = this.labels.create('region event');
    label.id = o.id;
    const on = typeof o.on === 'string' && o.on ? o.on : 'use';
    const prompt = typeof o.label === 'string' ? o.label.trim() : '';
    const bg = /** @type {{ background?: unknown }} */ (o).background === true ? tr('tools.map.background') : '';
    const word = EVENT_ON_WORDS.has(on) ? tr(`tools.map.on.${on}`) : on;
    label.setText(`! ${word}${prompt ? ` · ${prompt}` : ''}${bg}`, typeof o.if === 'string' && o.if.trim() ? tr('tools.map.if', { cond: o.if.trim() }) : '');
    const e = { id: o.id, type: 'event', obj: o, sig, sprites: [], over: [], label };
    this._place(e);
    return e;
  }

  /** A story marker (a named spot): a gold ring with an arrow toward its facing, named above. */
  _createMarker(o, sig) {
    const label = this.labels.create('marker');
    label.setText(`✦ ${(typeof o.name === 'string' && o.name.trim()) || o.id}`);
    const e = { id: o.id, type: 'marker', obj: o, sig, sprites: [], over: [], label };
    this._place(e);
    return e;
  }

  _createBulb(o, sig) {
    // (a prototype colour name, which three.js turns black, takes the default as in the game: LVL-19)
    const color = ownColor(o.color, THREE.Color.NAMES) ?? '#ffb46b';
    let mat = this._mat.bulb.get(color);
    if (!mat) {
      mat = this.kit.glowMaterial({ color, size: 0.75, opacity: 1 });
      this._mat.bulb.set(color, mat);
    }
    const e = { id: o.id, type: 'light', obj: o, sig, sprites: [], over: [], mat };
    this._place(e);
    return e;
  }

  /** (Re)build the terrain-dependent parts of an entry. */
  _place(e) {
    const S = this.surface;
    const o = e.obj;
    for (const x of e.over) disposeGeometry(x);
    e.over = [];
    const add = (obj) => { this.overlay.add(obj); e.over.push(obj); return obj; };
    switch (e.type) {
      case 'npc': {
        const s = e.sprites[0];
        s.position.set(o.x, S.groundAt(o.x, o.z), o.z);
        e.box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(o.x, s.position.y + 0.95, o.z), new THREE.Vector3(0.9, 1.9, 0.9));
        break;
      }
      case 'critters': {
        const b = new THREE.Box3();
        if (!e.sprites.length) {
          // an empty group (count 0) stays pickable at its point
          const y0 = S.groundAt(o.x, o.z);
          b.set(new THREE.Vector3(o.x - 0.4, y0, o.z - 0.4), new THREE.Vector3(o.x + 0.4, y0 + 0.9, o.z + 0.4));
        }
        e.sprites.forEach((s, k) => {
          const x = o.x + e.offsets[k][0];
          const z = o.z + e.offsets[k][1];
          s.position.set(x, S.groundAt(x, z), z);
          b.expandByPoint(new THREE.Vector3(x - 0.4, s.position.y, z - 0.4));
          b.expandByPoint(new THREE.Vector3(x + 0.4, s.position.y + 0.9, z + 0.4));
        });
        e.box = b;
        // chickens keep to their yard (relative `area` / absolute `bounds`); others roam a radius
        const yard = o.kind === 'chicken' || !o.kind ? critterYard(o) : null;
        const ring = yard ? drapedRect(S, yard, { lift: 0.06, step: 0.5 }) : drapedCircle(S, o.x, o.z, o.radius ?? 2.5, { lift: 0.06 });
        add(fatSegments(pathToSegments(ring), this._mat.critterRing));
        break;
      }
      case 'enemy': {
        const b = new THREE.Box3();
        const [fw, fh] = e.frame;
        const hw = Math.max(0.4, fw * 0.32);
        if (!e.sprites.length) {
          const y0 = S.groundAt(o.x, o.z);
          b.set(new THREE.Vector3(o.x - 0.4, y0, o.z - 0.4), new THREE.Vector3(o.x + 0.4, y0 + 0.9, o.z + 0.4));
        }
        e.sprites.forEach((s, k) => {
          const x = o.x + e.offsets[k][0];
          const z = o.z + e.offsets[k][1];
          // the group origin on the ground (TileMap.getHeight: a pond's bed), like the game's Enemy
          s.position.set(x, S.groundAt(x, z), z);
          b.expandByPoint(new THREE.Vector3(x - hw, s.position.y + (e.hover ? e.hover - 0.2 : 0), z - hw));
          b.expandByPoint(new THREE.Vector3(x + hw, s.position.y + e.hover + fh * 0.9, z + hw));
        });
        e.box = b;
        const boss = ENEMY_INFO[e.kind].boss;
        // the home ring (a boss with an arena shows the arena instead)
        if (!boss || !e.arena) {
          add(fatSegments(pathToSegments(drapedCircle(S, o.x, o.z, Number(o.radius) || 3, { lift: 0.06 })), e.elite ? this._mat.eliteRing : this._mat.enemyRing));
        }
        if (e.arena) add(fatSegments(pathToSegments(drapedRect(S, e.arena, { lift: 0.07, step: 0.5 })), this._mat.arenaLine));
        if (e.gate) {
          const [x0, z0, x1, z1] = e.gate;
          add(fatSegments(pathToSegments(drapedPath(S, [{ x: x0, z: z0 }, { x: x1, z: z1 }], { step: 0.25, lift: 0.1 })), this._mat.gateLine));
        }
        break;
      }
      case 'emitter': {
        const size = o.size ?? [8, 2.4, 8];
        const cy = S.groundAt(o.x, o.z) + (o.dy ?? 1.2);
        const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(o.x, cy, o.z), new THREE.Vector3(size[0], size[1], size[2]));
        e.volume = box;
        const segs = boxEdges(box, _m.identity());
        add(fatSegments(segs, e.mats.line));
        add(pointsObject([o.x, cy, o.z], e.mats.dot));
        e.center = new THREE.Vector3(o.x, cy, o.z);
        e.box = new THREE.Box3().setFromCenterAndSize(e.center, new THREE.Vector3(0.9, 0.9, 0.9));
        if (e.particle) e.particle.position.copy(e.center);
        break;
      }
      case 'region': {
        const r = { minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ };
        add(fillMesh(rectFill(S, r, 0.035), this._mat.regionFill));
        const line = add(fatSegments(pathToSegments(drapedRect(S, r, { lift: 0.06, step: 0.5 })), this._mat.regionLine));
        line.computeLineDistances();
        const cx = (r.minX + r.maxX) / 2;
        const cz = (r.minZ + r.maxZ) / 2;
        e.label.world.set(cx, S.surfaceAt(cx, cz) + 1.6, cz);
        // (kept inside the view over the rect's visible part: Labels.update)
        e.label.area = { ...r, y: e.label.world.y };
        e.box = null;
        break;
      }
      case 'exit': {
        const r = { minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ };
        add(fillMesh(rectFill(S, r, 0.04), this._mat.exitFill));
        const line = add(fatSegments(pathToSegments(drapedRect(S, r, { lift: 0.07, step: 0.5 })), this._mat.exitLine));
        line.computeLineDistances();
        const cx = (r.minX + r.maxX) / 2;
        const cz = (r.minZ + r.maxZ) / 2;
        e.label.world.set(cx, S.surfaceAt(cx, cz) + 1.6, cz);
        e.label.area = { ...r, y: e.label.world.y };
        e.box = null;
        break;
      }
      case 'event': {
        const r = { minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ };
        add(fillMesh(rectFill(S, r, 0.045), this._mat.eventFill));
        const line = add(fatSegments(pathToSegments(drapedRect(S, r, { lift: 0.075, step: 0.5 })), this._mat.eventLine));
        line.computeLineDistances();
        const cx = (r.minX + r.maxX) / 2;
        const cz = (r.minZ + r.maxZ) / 2;
        e.label.world.set(cx, S.surfaceAt(cx, cz) + 1.6, cz);
        e.label.area = { ...r, y: e.label.world.y };
        e.box = null;
        break;
      }
      case 'entrance':
      case 'marker': {
        // a ring with an arrow toward the facing (a marker's a little smaller, in gold)
        const y = S.groundAt(o.x, o.z);
        const a = ownValue(ENTRANCE_DIR, o.facing) ?? ENTRANCE_DIR.down;
        const rr = e.type === 'marker' ? 0.42 : 0.55;
        const tip = { x: o.x + a[0] * (rr + 0.55), z: o.z + a[1] * (rr + 0.55) };
        const segs = pathToSegments(drapedCircle(S, o.x, o.z, rr, { lift: 0.07, segments: 32 }));
        pathToSegments(drapedPath(S, [{ x: o.x + a[0] * rr, z: o.z + a[1] * rr }, tip], { step: 0.25, lift: 0.08 }), segs);
        pathToSegments(drapedPath(S, [tip, { x: tip.x - a[0] * 0.35 + a[1] * 0.25, z: tip.z - a[1] * 0.35 - a[0] * 0.25 }], { step: 0.25, lift: 0.08 }), segs);
        pathToSegments(drapedPath(S, [tip, { x: tip.x - a[0] * 0.35 - a[1] * 0.25, z: tip.z - a[1] * 0.35 + a[0] * 0.25 }], { step: 0.25, lift: 0.08 }), segs);
        add(fatSegments(segs, e.type === 'marker' ? this._mat.markerRing : this._mat.entranceRing));
        e.label.world.set(o.x, y + 1.3, o.z);
        e.box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(o.x, y + 0.3, o.z), new THREE.Vector3(rr * 2, 0.6, rr * 2));
        break;
      }
      case 'light': {
        const y = S.groundAt(o.x, o.z) + (o.dy ?? 1.5);
        add(pointsObject([o.x, y, o.z], e.mat));
        e.box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(o.x, y, o.z), new THREE.Vector3(0.6, 0.6, 0.6));
        break;
      }
      default:
    }
  }

  // -------------------------------------------------------------------------------------------
  // Spawn marker
  // -------------------------------------------------------------------------------------------

  _buildSpawn(spawn, sig) {
    if (!this.spawn) {
      const sprite = this._makeSprite(this._characterSheet('traveler'));
      sprite.name = 'Editor:spawn';
      sprite.opacity = 0.72;
      sprite.play('idle', { speed: 0.55 });
      const ringGeo = new THREE.RingGeometry(0.5, 0.62, 48);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, this._spawnMaterial);
      ring.renderOrder = 30;
      const discGeo = new THREE.CircleGeometry(0.5, 40);
      discGeo.rotateX(-Math.PI / 2);
      const disc = new THREE.Mesh(discGeo, this._spawnDisc);
      disc.renderOrder = 29;
      // facing chevron
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.95);
      shape.lineTo(0.2, 0.72);
      shape.lineTo(0.08, 0.72);
      shape.lineTo(0, 0.82);
      shape.lineTo(-0.08, 0.72);
      shape.lineTo(-0.2, 0.72);
      shape.closePath();
      const chevGeo = new THREE.ShapeGeometry(shape);
      chevGeo.rotateX(-Math.PI / 2);
      const chevron = new THREE.Mesh(chevGeo, this._spawnMaterial);
      chevron.renderOrder = 30;
      const group = new THREE.Group();
      group.name = 'Editor:spawnRing';
      group.add(ring, disc, chevron);
      this.markers.add(group);
      this.sprites.add(sprite);
      this.spawn = { sprite, group, ring, chevron, sig: '', data: null };
    }
    this.spawn.sig = sig;
    this.spawn.data = { ...spawn };
    this._placeSpawn();
  }

  _placeSpawn() {
    const sp = this.spawn;
    const d = sp.data;
    const y = this.surface.groundAt(d.x, d.z);
    sp.sprite.position.set(d.x, y, d.z);
    sp.group.position.set(d.x, y + 0.03, d.z);
    const [fx, fz] = ownValue(FACING_VEC, d.facing) ?? FACING_VEC.down;
    // chevron authored pointing toward -Z (after rotateX): rotate to the facing
    sp.chevron.rotation.y = Math.atan2(-fx, -fz);
    sp.facing = [fx, fz];
    sp.box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(d.x, y + 0.95, d.z), new THREE.Vector3(0.9, 1.9, 0.9));
  }

  // -------------------------------------------------------------------------------------------
  // Particles (atmosphere preview)
  // -------------------------------------------------------------------------------------------

  /** @param {Particles|null} particles */
  setParticles(particles) {
    if (particles === this._particles) return;
    for (const e of this.entries.values()) {
      e.particle?.dispose();
      e.particle = null;
    }
    this._particles = particles;
    if (particles) for (const e of this.entries.values()) if (e.type === 'emitter') this._spawnParticles(e);
  }

  _spawnParticles(e) {
    const o = e.obj;
    const size = o.size ?? [8, 2.4, 8];
    const preset = o.preset ?? 'fireflies';
    // an unknown preset (misspelt, or an Object.prototype name from a hand-written file) shows no
    // particles, with a warning like the game's (World: "could not create particle area")
    if (!isOwnKey(PARTICLE_PRESETS, preset)) {
      console.warn(`[Viewport3D] particle area "${o.id}": unknown preset "${showValue(preset)}"; not previewed.`);
      return;
    }
    try {
      // like the game: `params` (extra particle config) cannot override the preset, box or count
      e.particle = this._particles.createEmitter({
        ...(o.params && typeof o.params === 'object' && !Array.isArray(o.params) ? o.params : {}),
        preset,
        bounds: { center: e.center.clone(), size: new THREE.Vector3(size[0], size[1], size[2]) },
        count: Math.max(1, Math.min(200, o.count | 0 || 30)),
      });
      // (an area hidden — its type, or by the story preview — stays off: the atmosphere preview
      // turned on again must not bring it back)
      e.particle.enabled = !this.hiddenTypes.has(e.type) && !this.hiddenIds.has(e.id);
    } catch (err) {
      console.error('[Viewport3D] particle area failed:', err);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Per frame / visibility / picking
  // -------------------------------------------------------------------------------------------

  /**
   * @param {{ showObjects?: boolean, showMarkers?: boolean,
   *           hiddenTypes?: Iterable<string>|null }} [opts]
   *   the view toggles (omitted: unchanged) and the hidden object types (state.view.hiddenTypes)
   */
  setVisibility({ showObjects = this.showObjects, showMarkers = this.showMarkers, hiddenTypes } = {}) {
    this.showObjects = showObjects;
    this.showMarkers = showMarkers;
    if (hiddenTypes) this.hiddenTypes = new Set(hiddenTypes);
    this._applyVisibility();
  }

  /**
   * Hide these objects (the story preview: their `when` / `unless` do not allow them); they are
   * not drawn and not picked.
   * @param {Iterable<string>} ids
   */
  setHiddenIds(ids) {
    this.hiddenIds = new Set(ids);
    this._applyVisibility();
  }

  /** Is an entry shown (view toggles + hidden types + the story preview)? */
  _shown(e) {
    if (this.hiddenTypes.has(e.type) || this.hiddenIds.has(e.id)) return false;
    return ACTOR_TYPES.has(e.type) ? this.showObjects : this.showMarkers;
  }

  _applyVisibility() {
    for (const e of this.entries.values()) {
      const actor = ACTOR_TYPES.has(e.type);
      const shown = this._shown(e);
      for (const s of e.sprites) s.visible = shown;
      for (const o of e.over) o.visible = shown && (!actor || this.showMarkers);
      if (e.label) e.label.visible = shown;
      if (e.particle) e.particle.enabled = !this.hiddenTypes.has(e.type) && !this.hiddenIds.has(e.id);
    }
    if (this.spawn) {
      this.spawn.sprite.visible = this.showMarkers;
      this.spawn.group.visible = this.showMarkers;
    }
  }

  /**
   * @param {number} dt
   * @param {THREE.Camera} camera
   */
  update(dt, camera) {
    this._time += dt;
    for (const e of this.entries.values()) {
      if (e.type === 'npc') e.sprites[0].faceVector(e.facing[0], e.facing[1]);
      else if (e.type === 'enemy') for (let k = 0; k < e.sprites.length; k++) e.sprites[k].faceVector(e.facings[k][0], e.facings[k][1]);
      for (const s of e.sprites) s.update(dt, camera);
    }
    this.enemyBatch?.update();
    const sp = this.spawn;
    if (sp) {
      sp.sprite.faceVector(sp.facing[0], sp.facing[1]);
      sp.sprite.update(dt, camera);
      const pulse = 0.5 + 0.5 * Math.sin(this._time * 2.6);
      sp.ring.scale.setScalar(1 + pulse * 0.08);
      this._spawnMaterial.opacity = 0.65 + pulse * 0.35;
    }
  }

  /**
   * Actor / marker under the ray (NPC, critter and enemy sprites, the spawn marker, emitter
   * centres, light bulbs).
   * @param {THREE.Ray} ray
   * @returns {{ id: string|null, spawn: boolean, t: number }|null}
   */
  pick(ray) {
    let best = null;
    const test = (box, id, spawn) => {
      if (!box || !ray.intersectBox(box, _hit)) return;
      const t = _hit.distanceTo(ray.origin);
      if (!best || t < best.t) best = { id, spawn, t };
    };
    for (const e of this.entries.values()) {
      if (!this._shown(e)) continue;
      test(e.box, e.id, false);
    }
    if (this.spawn && this.showMarkers) test(this.spawn.box, null, true);
    return best;
  }

  /** Region, exit or story event whose border passes within `tol` of the ground point (x, z), or null. */
  pickRegionEdge(x, z, tol = 0.3) {
    if (!this.showMarkers) return null;
    let best = null;
    let bd = tol;
    for (const e of this.entries.values()) {
      if ((e.type !== 'region' && e.type !== 'exit' && e.type !== 'event') || !this._shown(e)) continue;
      const o = e.obj;
      const inside = x >= o.minX - tol && x <= o.maxX + tol && z >= o.minZ - tol && z <= o.maxZ + tol;
      if (!inside) continue;
      const d = Math.min(Math.abs(x - o.minX), Math.abs(x - o.maxX), Math.abs(z - o.minZ), Math.abs(z - o.maxZ));
      if (d <= bd) { bd = d; best = e.id; }
    }
    return best;
  }

  /** @returns {ActorEntry|null} */
  get(id) {
    return this.entries.get(id) ?? null;
  }

  _disposeEntry(e) {
    for (const s of e.sprites) {
      this.enemyBatch?.remove(s);
      s.userData.fill?.dispose();
      s.removeFromParent();
      s.dispose();
    }
    for (const x of e.over) disposeGeometry(x);
    e.over = [];
    if (e.label) this.labels.remove(e.label);
    e.particle?.dispose();
    e.particle = null;
  }

  dispose() {
    for (const e of this.entries.values()) this._disposeEntry(e);
    this.entries.clear();
    this.enemyBatch?.dispose();
    this.enemyBatch = null;
    this._primeSprite?.dispose();
    this._primeSprite = null;
    if (this.spawn) {
      const s = this.spawn.sprite;
      s.userData.fill?.dispose();
      s.removeFromParent();
      s.dispose();
      this.spawn.group.traverse((/** @type {SceneNode} */ o) => o.geometry?.dispose());
      this.spawn.group.removeFromParent();
      this.spawn = null;
    }
    this._spawnMaterial.dispose();
    this._spawnDisc.dispose();
    for (const s of this._sheets.values()) s.dispose?.();
    this._sheets.clear();
    this.sprites.removeFromParent();
    this.markers.removeFromParent();
    this.overlay.removeFromParent();
  }
}

