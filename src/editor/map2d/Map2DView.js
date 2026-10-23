/**
 * Map2DView — the top-down 2D map of the level editor (docs/contracts/LEVEL_EDITOR.md §6).
 *
 * Renders the level on a high-DPI canvas: terrain from the real tile textures (or flat tile
 * colours) shaded by height with soft drop shadows and contour / cliff lines, animated water
 * shimmer, stairs arrows, an optional grid, every object as a footprint with its catalog glyph
 * and colour, the player start, selection outlines with drag handles, and the active tool's
 * preview. Pointer input is translated into PointerEv objects and forwarded to the active tool
 * (left button only); middle / right drag and Space+drag pan, the wheel zooms to the cursor.
 *
 * The terrain is cached in an offscreen canvas at 16 px per tile (the engine's texel density)
 * and only the changed tile rect is repainted after an edit. The view only redraws when
 * something changed (plus a low-rate water shimmer while water is visible).
 */
import { TILE_BY_CHAR, levelToWorld, getHeightLevel } from '../../engine/level/LevelFormat.js';
import {
  OBJECT_TYPES, SPAWN_MARKER, ENEMY_KINDS, ENEMY_INFO, objectBounds, hitTestObject, critterStartPoints, critterYard, enemyStartPoints,
  interiorFootprint, optNum,
} from '../../engine/level/ObjectCatalog.js';
import { getTool, selectionHandles } from '../tools/index.js';
import { areaAt } from '../tools/SelectTool.js';
import { shownOnMap } from '../tools/common.js';
import { storyVisible } from '../story.js';
import { enemyKind, bossArena, bossGate, dataColliders, levelStartTest } from '../enemyGroups.js';
import { isTypingTarget } from '../ui/dom.js';
import { reportToolError } from '../EditorState.js';
import { ownValue } from '../../engine/utils/own.js';
import { tr, editorLang } from '../i18n.js';
import { optionLabel } from '../catalogI18n.js';

/**
 * @import { EditorState } from '../EditorState.js'
 * @import { TextureLibrary } from '../../engine/pixel/Textures.js'
 * @import { PointerEv, Tool } from '../tools/index.js'
 * @import { LevelObject, LevelObjectOf, TileRect } from '../../engine/level/types.js'
 */

const TP = 16;               // terrain cache: pixels per tile
const MIN_SCALE = 3;         // CSS px per world unit
const MAX_SCALE = 128;
const BG = '#0a0f1c';
const GOLD = '#e2c17f';

const ROOF_COLORS = { roof_red: '#a9503d', roof_blue: '#4d6a93', roof_thatch: '#bf9a58', roof_slate: '#5c6272' };
const TREE_COLORS = { oak: '#3f8a43', autumn: '#cf7a30', pine: '#2c6a48', birch: '#8cbc55' };
const CLOTH_COLORS = { cloth_stripe: ['#d24b4b', '#efe6d2'], cloth_red: ['#b83a3a', '#9c2f2f'] };
/** Glyph rotation of a waterfall by facing, of an NPC's facing arrow, of a stairs tile. */
const FALL_ANGLE = { S: 0, N: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };
const FACING_ANGLE = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 };
const STAIR_ANGLE = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 };
const LIGHT_GLOW = { lamppost: 2.2, wallTorch: 1.7, campfire: 2.8 };
const LAYER = { region: 0, exit: 0, event: 0, emitter: 1, critters: 1, rug: 2, bridge: 2, fence: 2, waterfall: 2, house: 3, windmill: 3, well: 3, marketStall: 3, tree: 5, npc: 7, enemy: 7, entrance: 7, marker: 7 };
const AREA_TYPES = new Set(['region', 'exit', 'event', 'emitter', 'critters', 'enemy']);
/** Point props picked by their rotated footprint (`footprint`; the interior furniture's too, `footRect`). */
const FOOTPRINT_TYPES = new Set(['house', 'marketStall', 'bench', 'flowerbox', 'chest', 'bed', 'table', 'shelf', 'hearth', 'counter', 'rug', 'staircase', 'wardrobe', 'wallWindow', 'sacks']);
/** Map colours of the interior furniture's quilts and rugs (`opts.blanket`, `opts.color`). */
const FURNITURE_COLORS = { red: '#c0453f', blue: '#3d5fb4', green: '#468a45', ochre: '#d9a92e', plum: '#77428f' };
/** hitTest grades (see Map2DView._hitOne). */
const HIT_NEAR = 1;
const HIT = 2;
const HIT_EXACT = 3;
/** PointerEvent.button → PointerEvent.buttons bit (Viewport3D's BUTTON_BIT). */
const BUTTON_BIT = [1, 4, 2];
/** Enemy group colours (the 3D view's ActorPreview.ENEMY_COLORS): home ring, elite ring, arena, gate. */
const ENEMY_RING = '#e0674f';
const ENEMY_ELITE = '#f2c14e';
const ENEMY_ARENA = '#ff8a5c';
const ENEMY_GATE = '#ffd36b';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function hash2(i, j, s = 0) {
  let h = Math.imul(i * 374761393 + j * 668265263 + s * 2246822519, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Lighten (amt > 0) or darken (amt < 0) a hex colour. */
function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function rgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export class Map2DView {
  /**
   * @param {HTMLElement} container
   * @param {EditorState} state
   * @param {{ textures?: TextureLibrary }} [opts]
   */
  constructor(container, state, { textures = null } = {}) {
    this.container = container;
    this.state = state;
    this.textures = textures;

    this.el = document.createElement('div');
    this.el.className = 'le-map2d';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'le-map2d-canvas';
    this.canvas.tabIndex = -1;
    this.el.appendChild(this.canvas);
    container.appendChild(this.el);
    this.ctx = this.canvas.getContext('2d');

    /** Camera: world point at the view centre and CSS px per world unit. */
    this.cx = state.level.width / 2;
    this.cz = state.level.depth / 2;
    this.scale = 20;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;

    this.active = true;
    this._dirty = true;
    this._raf = 0;
    this._lastAnim = 0;
    /**
     * Terrain cache tiles to repaint on the next draw: 'all', a tile rect, or null (none).
     * @type {'all'|TileRect|null}
     */
    this._terrainDirty = 'all';
    this._terrain = document.createElement('canvas');
    this._tctx = this._terrain.getContext('2d');
    this._texCache = new Map();
    this._avgCache = new Map();
    this._waterPath = null;
    this._sorted = null;
    this._baseLevel = 2;
    this._pointer = null;      // { sx, sy, inside }
    this._stroke = null;       // { tool, pointerId }
    /**
     * The PointerEv of the last pointerdown / pointermove (during a stroke: the stroke's latest;
     * an interrupted stroke ends with it, see _endInterrupted).
     * @type {PointerEv|null}
     */
    this._lastEv = null;
    this._pan = null;          // { sx, sy, cx, cz, moved }
    this._space = false;
    this._tween = null;
    this._reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._shimmer = makeShimmerTile();
    this._shimmerPat = null;
    /**
     * (set by the app) The 3D view's enemy start test, `(flier) => test | null`: every prop's and
     * villager's collider in every layout (Viewport3D.enemyStartTest, lazy); null without a 3D
     * view and while its build of the document is due (placementChanged follows). See _enemySpots.
     * @type {((flier: boolean) => (((x: number, z: number) => boolean)|null))|null}
     */
    this.startTestSource = null;
    /**
     * (set by the app) The 3D view's critter start test, `() => test | null`: the game's
     * walkability with every prop's and villager's collider (Viewport3D.critterStartTest, lazy);
     * null as for startTestSource. See _critterSpots.
     * @type {(() => (((x: number, z: number) => boolean)|null))|null}
     */
    this.critterTestSource = null;
    /** Enemy and critter start spots per group id ({ sig, spots }) and the level's data colliders (cached). */
    this._spots = new Map();
    this._dataCols = null;

    this._offs = [
      state.on('change', (info) => this._onChange(info)),
      state.on('selection', () => this.requestRender()),
      state.on('preview', () => this.requestRender()),
      state.on('tool', () => { this._updateCursor(); this.requestRender(); }),
      state.on('toolOptions', () => this.requestRender()),
      state.on('view', (v) => {
        if (v.textured2d !== this._textured) this._terrainDirty = 'all';
        // (the layout decides whether the 3D view's start test is available)
        this._spots.clear();
        this.requestRender();
      }),
      state.on('hover', (h) => { if (h?.view === '3d' || this._hover3d) { this._hover3d = h?.view === '3d' ? h : null; this.requestRender(); } }),
    ];

    this._bind();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(this.el);
    /** Frame the level as soon as the view has a real size (it may start hidden / unmeasured). */
    this._needsFrame = true;
    this.resize();
  }

  // -------------------------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------------------------

  /** Re-measure the container (called automatically through a ResizeObserver). */
  resize() {
    const r = this.el.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const hh = Math.max(1, Math.round(r.height));
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const measurable = w > 8 && hh > 8;
    if (w === this.width && hh === this.height && dpr === this.dpr) {
      if (this._needsFrame && measurable && this.active) this._frameNow();
      return;
    }
    this.width = w;
    this.height = hh;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(hh * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${hh}px`;
    if (this._needsFrame && measurable && this.active) this._frameNow();
    // a layout change (2D only ↔ split, the splitter, the window): keep the whole map framed until
    // the user zooms or pans it themselves (like the 3D view)
    else if (!this._userMoved && measurable && this.active) this.frameLevel(false);
    this.requestRender();
  }

  _frameNow() {
    const pending = this._needsFrame;
    this._needsFrame = false;
    if (pending && typeof pending === 'object') this.frameRect(pending, false);
    else this.frameLevel(false);
  }

  /** Can the view compute a framing now (visible and measured)? */
  get _measurable() {
    return this.active && this.width > 8 && this.height > 8;
  }

  /** false = stop rendering (hidden layout); a gesture in progress ends (cancelled). */
  setActive(active) {
    const was = this.active;
    this.active = !!active;
    if (this.active) { this.resize(); this.requestRender(); return; }
    if (!was) return;
    // hidden mid-gesture: a display:none canvas gets no pointerup / lostpointercapture, and
    // captured moves would be read against a 0 × 0 rect — end the stroke / pan now
    this._abortStroke();
    this._abortPan();
    this._space = false;
    this._pointer = null;
    if (this.state.hover?.view === '2d') this.state.setHover(null);
    this._updateCursor();
  }

  /** Centre the view on world (x, z); optional `scale` (CSS px per unit). Animated. */
  focusOn(x, z, { scale = null, animate = true } = {}) {
    this._userMoved = true;
    const target = { cx: x, cz: z, scale: clamp(scale ?? Math.max(this.scale, 28), MIN_SCALE, MAX_SCALE) };
    this._animateTo(target, animate && this._measurable);
  }

  /** Fit a world rect (with margin) into the view (deferred while the view is hidden). */
  frameRect(b, animate = true) {
    this._userMoved = true;
    if (!this._measurable) { this._needsFrame = { ...b }; return; }
    const w = Math.max(1, b.maxX - b.minX);
    const d = Math.max(1, b.maxZ - b.minZ);
    // keep clear of the floating chip bar at the top (44 px) and a 24 px margin elsewhere
    const s = clamp(Math.min((this.width - 48) / w, (this.height - 68) / d), MIN_SCALE, 64);
    this._animateTo({ cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2 - 10 / s, scale: s }, animate);
  }

  /** Fit the whole map. */
  frameLevel(animate = true) {
    if (!this._measurable) { this._needsFrame = true; this._userMoved = false; return; }
    const L = this.state.level;
    this.frameRect({ minX: 0, maxX: L.width, minZ: 0, maxZ: L.depth }, animate);
    this._userMoved = false;
  }

  /** Current zoom as a percentage of 16 px per tile (100 % = one texel per CSS pixel). */
  get zoomPercent() { return Math.round((this.scale / TP) * 100); }

  /** Zoom by a factor around the view centre. */
  zoomBy(f) {
    this._userMoved = true;
    this._animateTo({ cx: this.cx, cz: this.cz, scale: clamp(this.scale * f, MIN_SCALE, MAX_SCALE) }, true);
  }

  requestRender() {
    this._dirty = true;
    this._schedule();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._ro.disconnect();
    for (const off of this._offs) off();
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('keyup', this._onKey, true);
    window.removeEventListener('blur', this._onBlur);
    this.el.remove();
  }

  // -------------------------------------------------------------------------------------------
  // Coordinates
  // -------------------------------------------------------------------------------------------

  worldToScreen(x, z) {
    return { x: (x - this.cx) * this.scale + this.width / 2, y: (z - this.cz) * this.scale + this.height / 2 };
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.width / 2) / this.scale + this.cx, z: (sy - this.height / 2) / this.scale + this.cz };
  }

  /**
   * Build the PointerEv for a DOM pointer event.
   * @param {MouseEvent} e
   * @returns {PointerEv}
   */
  _pev(e) {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const { x, z } = this.screenToWorld(sx, sy);
    const i = Math.floor(x);
    const j = Math.floor(z);
    const lvl = getHeightLevel(this.state.level, i, j);
    const hitSpawn = this._hitSpawn(x, z);
    return {
      i, j, x: round3(x), z: round3(z), y: lvl == null ? 0 : levelToWorld(lvl),
      button: e.button, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey,
      view: '2d', hitObjectId: hitSpawn ? null : this.hitTest(x, z), hitSpawn,
      pickRadius: 7 / this.scale,
    };
  }

  /** Is the object drawn (and pickable): its type shown, and the story preview allows it. */
  _visible(o) {
    return shownOnMap(this.state.view, o) && storyVisible(this.state, o);
  }

  /** Objects in draw order (bottom first). */
  _drawOrder() {
    if (!this._sorted) {
      this._sorted = this.state.level.objects
        .map((o, k) => ({ o, k, l: LAYER[o.type] ?? (OBJECT_TYPES[o.type]?.category === 'Lights' ? 6 : 4) }))
        .sort((a, b) => a.l - b.l || a.k - b.k)
        .map((e) => e.o);
    }
    return this._sorted;
  }

  /**
   * Topmost visible object id at world (x, z), or null. Area markers are picked by their edge or
   * centre. An enemy group (drawn above the props) that the point is merely near — its home ring,
   * boss arena edge, the tolerance around a start dot, or its centre while the badge is not drawn
   * — yields to the next object below only if that one is right under the point (ED-25): a point
   * prop whose own footprint holds it (never a tree's canopy, so trees do not take clicks on enemy
   * dots in forests; never a bridge or fence the ring crosses) or another group's drawn dot /
   * badge. Otherwise the group is picked, as when the click is on its drawn dot or badge.
   */
  hitTest(x, z) {
    const tol = 5 / this.scale;
    const list = this._drawOrder();
    let near = null;
    for (let k = list.length - 1; k >= 0; k--) {
      const o = list[k];
      if (!this._visible(o)) continue;
      const hit = this._hitOne(o, x, z, tol);
      if (!hit) continue;
      if (near) return hit === HIT_EXACT || (hit === HIT && this._underPoint(o, x, z)) ? o.id : near;
      if (hit === HIT_NEAR) { near = o.id; continue; }
      return o.id;
    }
    return near;
  }

  /**
   * How (x, z) hits an object: 0 not, HIT (its pick area, tolerance included), HIT_NEAR (an enemy
   * group's ring / arena edge / dot tolerance / undrawn centre), HIT_EXACT (an enemy group's drawn
   * start dot or badge).
   */
  _hitOne(o, x, z, tol) {
    if (AREA_TYPES.has(o.type)) {
      const b = objectBounds(o);
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const centre = Math.hypot(x - cx, z - cz) < Math.max(0.5, 9 / this.scale);
      if (o.type === 'enemy') {
        // the ⚔ badge (drawn from scale 7 up, ≈ 9 px), then a start dot's coloured disc (not
        // its dark rim: a prop under the rim keeps its click), else near
        if (centre && this.scale >= 7) return HIT_EXACT;
        const spots = this._enemySpots(o);
        const drawn = Math.max(0.12, 2.6 / this.scale) * (ENEMY_INFO[enemyKind(o)]?.boss ? 1.6 : 1) + 0.5 / this.scale;
        const reach = Math.max(0.3, 6 / this.scale);
        let dot = 0;
        for (const [px, pz] of spots) {
          const d = Math.hypot(x - px, z - pz);
          if (d <= drawn) return HIT_EXACT;
          if (d < reach) dot = HIT_NEAR;
        }
        if (centre || dot) return HIT_NEAR;
        // the home ring or the boss arena's edge
        const d = Math.abs(Math.hypot(x - o.x, z - o.z) - (Number(o.radius) || 3));
        if (d < tol * 1.4) return HIT_NEAR;
        const a = bossArena(o);
        if (a) {
          const inA = x >= a.minX - tol && x <= a.maxX + tol && z >= a.minZ - tol && z <= a.maxZ + tol;
          if (inA && Math.min(Math.abs(x - a.minX), Math.abs(x - a.maxX), Math.abs(z - a.minZ), Math.abs(z - a.maxZ)) < tol * 1.4) return HIT_NEAR;
        }
        return 0;
      }
      if (centre) return HIT;
      if (o.type === 'critters') {
        const d = Math.abs(Math.hypot(x - o.x, z - o.z) - (o.radius ?? 2.5));
        return d < tol * 1.4 ? HIT : 0;
      }
      const inside = x >= b.minX - tol && x <= b.maxX + tol && z >= b.minZ - tol && z <= b.maxZ + tol;
      const nearEdge = Math.min(Math.abs(x - b.minX), Math.abs(x - b.maxX), Math.abs(z - b.minZ), Math.abs(z - b.maxZ)) < tol * 1.4;
      return inside && nearEdge ? HIT : 0;
    }
    const def = OBJECT_TYPES[o.type];
    if (def.placement === 'point' && def.radius < 0.5) return Math.hypot(x - o.x, z - o.z) <= Math.max(def.radius + 0.15, 8 / this.scale) ? HIT : 0;
    if (o.type === 'tree') return Math.hypot(x - o.x, z - o.z) <= treeRadius(o) + tol ? HIT : 0;
    if (FOOTPRINT_TYPES.has(o.type)) return inFootprint(o, x, z, tol) ? HIT : 0;
    return hitTestObject(o, x, z, tol) ? HIT : 0;
  }

  /**
   * Is (x, z) on a prop's own footprint (no pick tolerance)? Only for point props: never for area
   * markers and trees (a canopy is not a footprint: trees must not take clicks on enemy dots
   * around them), nor for linear props — a bridge or fence that a group's ring crosses keeps the
   * ring's click (it stays pickable along the rest of its length).
   */
  _underPoint(o, x, z) {
    const def = OBJECT_TYPES[o.type];
    if (AREA_TYPES.has(o.type) || o.type === 'tree' || def?.placement !== 'point') return false;
    if (def.radius < 0.5) return Math.hypot(x - o.x, z - o.z) <= def.radius + 0.15;
    if (FOOTPRINT_TYPES.has(o.type)) return inFootprint(o, x, z, 0);
    return hitTestObject(o, x, z, 0);
  }

  /**
   * Where the game starts an enemy group's members: `enemyStartPoints` with the 3D view's start
   * test (`startTestSource`: walkable tiles and bridge decks, never open water — fliers also
   * water — clear of every prop's and villager's collider; built while that view is shown, from
   * the level data and the props' own colliders while it is hidden). Without a 3D view (no
   * WebGL), and until that view has built a newly opened document, the level-data test without
   * the props (`levelStartTest`: villagers, chests and waystones only). Cached per group until
   * the level, the view or the 3D placement test changes.
   */
  _enemySpots(o) {
    const sig = JSON.stringify(o);
    const c = this._spots.get(o.id);
    if (c && c.sig === sig) return c.spots;
    const flier = !!ENEMY_INFO[enemyKind(o)]?.flier;
    let test = null;
    try {
      test = this.startTestSource?.(flier) ?? null;
    } catch (err) {
      console.error('[Map2DView] start test failed:', err);
    }
    if (!test) {
      this._dataCols ??= dataColliders(this.state.level);
      test = levelStartTest(this.state.level, flier, this._dataCols);
    }
    const spots = enemyStartPoints(o, test);
    this._spots.set(o.id, { sig, spots });
    return spots;
  }

  /**
   * Where the game starts a critter group's animals: `critterStartPoints` with the 3D view's
   * test (`critterTestSource`: the game's `TileMap.isWalkable` — walkable tiles and bridge decks,
   * clear of every prop's and villager's collider; built while that view is shown, from the level
   * data and the props' own colliders while it is hidden), else — no 3D view, or its build of the
   * document is due — the level-data test without the props (`levelStartTest` for walkers:
   * villagers, chests and waystones only). Cached per group like `_enemySpots`.
   * @param {LevelObjectOf<'critters'>} o
   */
  _critterSpots(o) {
    const sig = JSON.stringify(o);
    const c = this._spots.get(o.id);
    if (c && c.sig === sig) return c.spots;
    let test = null;
    try {
      test = this.critterTestSource?.() ?? null;
    } catch (err) {
      console.error('[Map2DView] critter test failed:', err);
    }
    if (!test) {
      this._dataCols ??= dataColliders(this.state.level);
      test = levelStartTest(this.state.level, false, this._dataCols);
    }
    const spots = critterStartPoints(o, test);
    this._spots.set(o.id, { sig, spots });
    return spots;
  }

  /**
   * The 3D view's placement test changed (props with colliders built / removed, villagers moved,
   * terrain synced): place the enemy and critter start dots again. Called by the app.
   */
  placementChanged() {
    this._spots.clear();
    this._dataCols = null;
    if (this.state.level.objects.some((o) => o.type === 'enemy' || o.type === 'critters')) this.requestRender();
  }

  _hitSpawn(x, z) {
    if (this.state.view.showMarkers === false) return false;
    const s = this.state.level.spawn;
    return Math.hypot(x - s.x, z - s.z) <= Math.max(0.45, 10 / this.scale);
  }

  // -------------------------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------------------------

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._onDown(e));
    c.addEventListener('pointermove', (e) => this._onMove(e));
    c.addEventListener('pointerup', (e) => this._onUp(e));
    c.addEventListener('pointercancel', (e) => this._onUp(e, true));
    // a lost capture (window switch, element removed…) must still end the stroke, or its
    // transaction would stay open and block undo
    c.addEventListener('lostpointercapture', (e) => {
      if ((this._stroke && e.pointerId === this._stroke.pointerId) || this._pan) this._onUp(e, true);
    });
    c.addEventListener('pointerleave', () => {
      this._pointer = null;
      if (!this._stroke && !this._pan) this.state.setHover(null);
      this.requestRender();
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    c.addEventListener('dblclick', (e) => {
      if (this.state.toolId !== 'select') return;
      const ev = this._pev(e);
      let id = ev.hitSpawn ? 'spawn' : ev.hitObjectId;
      // inside a region / particle area (picked by its edge with a click): select the area
      if (!id) { id = areaAt(this.state, ev.x, ev.z); if (id) this.state.select([id]); }
      if (id) this.el.dispatchEvent(new CustomEvent('le-focus', { bubbles: true, detail: { id } }));
    });
    this._onKey = (e) => {
      if (e.code !== 'Space') return;
      const t = /** @type {HTMLElement|null} */ (document.activeElement);
      // text fields keep their Space; a slider / switch / button that kept the focus does not
      // (over the map, Space+drag pans)
      if (isTypingTarget(t)) return;
      // dialogs and menus own the keyboard (Space activates their buttons)
      if (e.target?.closest?.('.le-overlay, .le-menu-popup') || document.querySelector('.le-overlay:not(.is-closing)')) return;
      const down = e.type === 'keydown';
      // over the map, Space pans: never let it scroll or activate a focused button / switch
      if (this._pointer || this._pan) {
        e.preventDefault();
        if (down && t && t !== document.body && t !== this.canvas && !this.el.contains(t)) t.blur?.();
      }
      if (down === this._space) return;
      this._space = down;
      this._updateCursor();
    };
    this._onBlur = () => {
      this._space = false;
      // the pointer-up of a drag may never arrive once the window lost focus
      if (this._abortStroke()) this.requestRender();
      this._abortPan();
      this._updateCursor();
    };
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('keyup', this._onKey, true);
    window.addEventListener('blur', this._onBlur);
  }

  _onDown(e) {
    this.canvas.focus({ preventScroll: true });
    if (document.activeElement && document.activeElement !== this.canvas && document.activeElement !== document.body) /** @type {HTMLElement} */ (document.activeElement).blur?.();
    // the same pointer went down again: its previous release never reached the map (let go over
    // a native dialog, or where the pointer could not be captured) — end that stroke (cancelled)
    // or pan first, as Viewport3D does
    if (this._stroke?.pointerId === e.pointerId && this._abortStroke()) this.requestRender();
    if (this._pan?.pointerId === e.pointerId) this._abortPan();
    if (this._stroke || this._pan) return; // another pointer is busy
    if (e.button === 1 || e.button === 2 || (e.button === 0 && this._space)) {
      e.preventDefault();
      this._pan = { sx: e.clientX, sy: e.clientY, cx: this.cx, cz: this.cz, moved: false, button: e.button, pointerId: e.pointerId };
      this._tween = null;
      this._capture(e.pointerId);
      this._updateCursor();
      return;
    }
    if (e.button !== 0) return;
    const tool = getTool(this.state.toolId);
    this._stroke = { tool, pointerId: e.pointerId };
    this._capture(e.pointerId);
    const ev = this._pev(e);
    this._lastEv = ev;
    this.state.setHover({ i: ev.i, j: ev.j, x: ev.x, z: ev.z, view: '2d' });
    try { tool.pointerDown(ev, this.state); } catch (err) { this._toolError(err); }
    this._updateCursor(ev);
  }

  _onMove(e) {
    const r = this.canvas.getBoundingClientRect();
    if (!this.active || r.width < 1) return; // hidden layout (captured pointer events)
    // a mouse moving without the button of the stroke / pan held: its release was lost (the
    // stroke ends as interrupted, `cancelled: true`; this move is then an ordinary hover)
    const released = (b) => e.pointerType === 'mouse' && !(e.buttons & BUTTON_BIT[b]);
    if (this._stroke?.pointerId === e.pointerId && released(0)) this._abortStroke();
    if (this._pan?.pointerId === e.pointerId && released(this._pan.button)) this._abortPan();
    this._pointer = { sx: e.clientX - r.left, sy: e.clientY - r.top };
    if (this._pan) {
      const dx = e.clientX - this._pan.sx;
      const dy = e.clientY - this._pan.sy;
      if (Math.abs(dx) + Math.abs(dy) > 2) { this._pan.moved = true; this._userMoved = true; }
      this.cx = this._pan.cx - dx / this.scale;
      this.cz = this._pan.cz - dy / this.scale;
      this.requestRender();
      return;
    }
    const ev = this._pev(e);
    this._lastEv = ev;
    this.state.setHover({ i: ev.i, j: ev.j, x: ev.x, z: ev.z, view: '2d' });
    const tool = this._stroke?.tool ?? getTool(this.state.toolId);
    // coalesced events keep fast strokes smooth; tools interpolate between samples anyway
    try { tool.pointerMove(ev, this.state); } catch (err) { this._toolError(err); }
    this._updateCursor(ev);
    this.requestRender();
  }

  _onUp(e, cancelled = false) {
    if (!this.active) return; // (setActive(false) already ended the gesture)
    if (this._pan) {
      const pan = this._pan;
      this._pan = null;
      this._release(e.pointerId);
      const wasClick = !pan.moved && pan.button === 2 && !cancelled;
      this._updateCursor();
      if (wasClick) {
        const ev = this._pev(e);
        this.el.dispatchEvent(new CustomEvent('le-contextmenu', { bubbles: true, detail: { ev, clientX: e.clientX, clientY: e.clientY } }));
      }
      return;
    }
    if (!this._stroke || e.pointerId !== this._stroke.pointerId) return;
    const { tool } = this._stroke;
    this._stroke = null;
    this._release(e.pointerId);
    const ev = this._pev(e);
    if (cancelled) this._endInterrupted(tool);
    else { try { tool.pointerUp({ ...ev, cancelled: false }, this.state); } catch (err) { this._toolError(err); } }
    this._updateCursor(ev);
    this.requestRender();
  }

  /**
   * End the open stroke as interrupted (`_endInterrupted`) and release its pointer; false when no
   * stroke is open.
   * @returns {boolean}
   */
  _abortStroke() {
    if (!this._stroke) return false;
    const { tool, pointerId } = this._stroke;
    // (cleared first: releasing the capture may dispatch 'lostpointercapture' re-entrantly)
    this._stroke = null;
    this._release(pointerId);
    this._endInterrupted(tool);
    return true;
  }

  /** Drop the open pan (no context menu) and release its pointer. */
  _abortPan() {
    if (!this._pan) return;
    const { pointerId } = this._pan;
    this._pan = null;
    this._release(pointerId);
    this._updateCursor();
  }

  /**
   * End a stroke that was interrupted rather than released (pointercancel, a lost pointer capture,
   * a window blur, the view hidden, a lost release — a mouse move without the button, or the same
   * pointer pressed again): the tool gets `pointerUp` with `cancelled: true` (commit
   * nothing new, PointerEv.cancelled) on the stroke's last real PointerEv — a cancel or
   * lost-capture event may carry no usable position and a blur has none. `_onDown` sets `_lastEv`
   * before any stroke can end, so the `else` branch is only a safety net: an open transaction is
   * committed so undo is never blocked.
   * @param {Tool} tool the tool that received the pointerDown
   */
  _endInterrupted(tool) {
    const last = this._lastEv;
    if (last) {
      try { tool.pointerUp({ ...last, button: 0, cancelled: true }, this.state); } catch (err) { this._toolError(err); }
    } else if (this.state.inTransaction) {
      this.state.commit(); // defensive: unreachable while _onDown sets _lastEv
    }
  }

  _capture(id) {
    try { this.canvas.setPointerCapture(id); } catch { /* synthetic / inactive pointer */ }
  }

  _release(id) {
    try { if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id); } catch { /* ignore */ }
  }

  _toolError(err) {
    reportToolError(this.state, err, '[Map2DView]');
  }

  _onWheel(e) {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const before = this.screenToWorld(sx, sy);
    this._tween = null;
    this._userMoved = true;
    this.scale = clamp(this.scale * Math.exp(-dy * 0.0016), MIN_SCALE, MAX_SCALE);
    const after = this.screenToWorld(sx, sy);
    this.cx += before.x - after.x;
    this.cz += before.z - after.z;
    this.requestRender();
  }

  _updateCursor(ev = null) {
    let c;
    if (this._pan) c = 'grabbing';
    else if (this._space) c = 'grab';
    else {
      const tool = this._stroke?.tool ?? getTool(this.state.toolId);
      c = (ev && tool.cursorFor?.(ev, this.state)) || tool.cursor || 'default';
      if (c === 'cell') c = 'cell';
    }
    if (this.canvas.style.cursor !== c) this.canvas.style.cursor = c;
  }

  _animateTo(target, animate) {
    if (!animate || this._reducedMotion) {
      Object.assign(this, { cx: target.cx, cz: target.cz, scale: target.scale });
      this._tween = null;
      this.requestRender();
      return;
    }
    this._tween = { from: { cx: this.cx, cz: this.cz, scale: this.scale }, to: target, t0: performance.now(), dur: 260 };
    this.requestRender();
  }

  // -------------------------------------------------------------------------------------------
  // State events
  // -------------------------------------------------------------------------------------------

  _onChange(info) {
    const L = this.state.level;
    if (info.objects || info.source !== 'edit') this._sorted = null;
    // enemy start spots depend on the ground and on other objects' colliders
    this._spots.clear();
    this._dataCols = null;
    // undo / redo of object-only edits keep the terrain cache (a full rebuild of a 128² map is ~50 ms)
    if (info.terrain || info.source === 'load') {
      const sizeChanged = this._terrain.width !== L.width * TP || this._terrain.height !== L.depth * TP;
      // undo / redo of tile edits: repaint only the tiles that differ from the last painted rows
      let rect = info.rect;
      if (!rect && !sizeChanged && !info.meta && (info.source === 'undo' || info.source === 'redo')) rect = this._diffRows(L) ?? { minI: 0, maxI: -1, minJ: 0, maxJ: -1 };
      if (!rect || sizeChanged || info.source === 'load' || info.meta) this._terrainDirty = 'all';
      else if (this._terrainDirty !== 'all' && rect.maxI >= rect.minI) {
        const r = { minI: rect.minI - 1, maxI: rect.maxI + 1, minJ: rect.minJ - 1, maxJ: rect.maxJ + 1 };
        this._terrainDirty = this._terrainDirty ? union(this._terrainDirty, r) : r;
      }
      this._rows = { tiles: [...L.tiles], heights: [...L.heights] };
      // a new map or a resize (or its undo): show the whole level again
      if (info.source === 'load' || sizeChanged) this.frameLevel(info.source !== 'load');
    }
    this.requestRender();
  }

  /** Bounding rect of the tiles that differ from the rows seen at the last terrain change. */
  _diffRows(L) {
    const snap = this._rows;
    if (!snap || snap.tiles.length !== L.depth) return { minI: 0, maxI: L.width - 1, minJ: 0, maxJ: L.depth - 1 };
    let r = null;
    for (let j = 0; j < L.depth; j++) {
      const a = L.tiles[j];
      const b = snap.tiles[j];
      const ha = L.heights[j];
      const hb = snap.heights[j];
      if (a === b && ha === hb) continue;
      for (let i = 0; i < L.width; i++) {
        if (a[i] === b?.[i] && ha[i] === hb?.[i]) continue;
        if (!r) r = { minI: i, maxI: i, minJ: j, maxJ: j };
        else { r.minI = Math.min(r.minI, i); r.maxI = Math.max(r.maxI, i); r.minJ = Math.min(r.minJ, j); r.maxJ = Math.max(r.maxJ, j); }
      }
    }
    return r;
  }

  // -------------------------------------------------------------------------------------------
  // Frame loop
  // -------------------------------------------------------------------------------------------

  _schedule() {
    if (this._raf || !this.active) return;
    this._raf = requestAnimationFrame((t) => this._frame(t));
  }

  _frame(now) {
    this._raf = 0;
    if (!this.active) return;
    let again = false;
    if (this._tween) {
      const tw = this._tween;
      const k = Math.min(1, (now - tw.t0) / tw.dur);
      const e = 1 - Math.pow(1 - k, 3);
      this.cx = tw.from.cx + (tw.to.cx - tw.from.cx) * e;
      this.cz = tw.from.cz + (tw.to.cz - tw.from.cz) * e;
      this.scale = tw.from.scale * Math.pow(tw.to.scale / tw.from.scale, e);
      this._dirty = true;
      if (k >= 1) this._tween = null; else again = true;
    }
    const animWater = this._waterPath && !this._reducedMotion && document.visibilityState === 'visible';
    if (animWater && now - this._lastAnim > 66) this._dirty = true;
    // a stroke / drag running in the 3D view: this map follows at half rate (the frame budget
    // goes to the view being drawn in; big levels would otherwise drop frames)
    const st = this.state;
    const behind = this._dirty && !this._tween && st.inTransaction && st.hover?.view === '3d' && !this._stroke && !this._pan;
    if (behind && (this._skip = !this._skip)) {
      this._raf = requestAnimationFrame((t) => this._frame(t));
      return;
    }
    if (this._dirty) {
      this._dirty = false;
      this._lastAnim = now;
      this._render(now);
      const z = this.zoomPercent;
      if (z !== this._lastZoom) {
        this._lastZoom = z;
        this.el.dispatchEvent(new CustomEvent('le-zoom', { bubbles: true, detail: { zoom: z } }));
      }
    }
    if (again || animWater) this._raf = requestAnimationFrame((t) => this._frame(t));
  }

  // -------------------------------------------------------------------------------------------
  // Terrain cache
  // -------------------------------------------------------------------------------------------

  _tex(name) {
    if (!name || !this.textures) return null;
    if (this._texCache.has(name)) return this._texCache.get(name);
    let c = null;
    try { c = this.textures.canvas?.(name) ?? this.textures.get(name)?.image ?? null; } catch { c = null; }
    this._texCache.set(name, c);
    return c;
  }

  /** Flat colour of a tile char (TILE_TYPES colour, or the average colour of its texture). */
  _tileColor(ch, def) {
    const t = TILE_BY_CHAR[ch];
    if (t && t.def.top === def.top && !!t.def.water === !!def.water) return t.color;
    const key = `${def.top}|${def.water ? 1 : 0}`;
    if (this._avgCache.has(key)) return this._avgCache.get(key);
    let col = def.water ? '#3b7fa6' : '#6b7a5a';
    const tex = this._tex(def.top);
    if (tex && !def.water) {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        const g = c.getContext('2d');
        g.drawImage(tex, 0, 0, 1, 1);
        const d = g.getImageData(0, 0, 1, 1).data;
        col = `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      } catch { /* keep fallback */ }
    }
    this._avgCache.set(key, col);
    return col;
  }

  _updateTerrain() {
    const L = this.state.level;
    const dirty = this._terrainDirty;
    if (!dirty) return;
    this._terrainDirty = null;
    const W = L.width * TP;
    const H = L.depth * TP;
    // 'all' (or a resize) is replaced by the whole map just below
    let rect = /** @type {TileRect} */ (dirty);
    if (dirty === 'all' || this._terrain.width !== W || this._terrain.height !== H) {
      if (this._terrain.width !== W || this._terrain.height !== H) { this._terrain.width = W; this._terrain.height = H; }
      rect = { minI: 0, maxI: L.width - 1, minJ: 0, maxJ: L.depth - 1 };
      this._baseLevel = modeLevel(L);
    }
    this._textured = this.state.view.textured2d !== false;
    const g = this._tctx;
    g.imageSmoothingEnabled = false;
    const hAt = (i, j) => (i < 0 || j < 0 || i >= L.width || j >= L.depth ? null : parseInt(L.heights[j][i], 36));
    const minI = Math.max(0, rect.minI);
    const maxI = Math.min(L.width - 1, rect.maxI);
    const minJ = Math.max(0, rect.minJ);
    const maxJ = Math.min(L.depth - 1, rect.maxJ);
    for (let j = minJ; j <= maxJ; j++) for (let i = minI; i <= maxI; i++) this._drawTile(g, L, i, j, hAt);
    this._buildWaterPath(L);
  }

  _buildWaterPath(L) {
    // one clip path per flow (as the game's Water reads it: a legend `flow` array is the tile's
    // own drift, a number scales the level's, none = the level's), so every river shimmers its
    // own way and still ponds stay still
    const lf = Array.isArray(L.water?.flow) ? L.water.flow : [0, 0.45];
    const flowOf = (d) => (Array.isArray(d.flow) ? [Number(d.flow[0]) || 0, Number(d.flow[1]) || 0]
      : typeof d.flow === 'number' ? [lf[0] * d.flow, lf[1] * d.flow] : [lf[0], lf[1]]);
    const keyOf = new Map();
    for (const [ch, d] of Object.entries(L.legend)) if (d?.water) { const f = flowOf(d); keyOf.set(ch, `${f[0]},${f[1]}`); }
    const paths = new Map();
    const p = new Path2D();
    let any = false;
    for (let j = 0; j < L.depth; j++) {
      const row = L.tiles[j];
      let run = -1;
      let runKey = null;
      for (let i = 0; i <= L.width; i++) {
        const key = i < L.width ? keyOf.get(row[i]) ?? null : null;
        if (key === runKey) continue;
        if (runKey !== null) {
          p.rect(run, j, i - run, 1);
          let q = paths.get(runKey);
          if (!q) paths.set(runKey, (q = new Path2D()));
          q.rect(run, j, i - run, 1);
          any = true;
        }
        run = i;
        runKey = key;
      }
    }
    this._waterPath = any ? p : null;
    this._waterPaths = [...paths].map(([k, path]) => { const [fx, fz] = k.split(',').map(Number); return { path, fx, fz }; });
  }

  _drawTile(g, L, i, j, hAt) {
    const ch = L.tiles[j][i];
    const def = L.legend[ch] ?? {};
    const x = i * TP;
    const y = j * TP;
    const lvl = hAt(i, j);
    g.globalAlpha = 1;
    if (def.void) {
      g.fillStyle = '#0c0f19';
      g.fillRect(x, y, TP, TP);
      g.fillStyle = 'rgba(255,255,255,0.035)';
      for (let k = 0; k < TP; k += 4) g.fillRect(x + k, y + k, 2, 2);
      return;
    }
    const color = this._tileColor(ch, def);
    const tex = this._textured ? this._tex(def.top) : null;
    if (tex && tex.width) {
      if (tex.width >= TP && tex.height >= TP) {
        const sx = (i * TP) % tex.width;
        const sy = (j * TP) % tex.height;
        g.drawImage(tex, sx, sy, TP, TP, x, y, TP, TP);
      } else {
        g.drawImage(tex, x, y, TP, TP);
      }
      g.globalAlpha = def.water ? 1 : 0.16;
      if (!def.water) { g.fillStyle = color; g.fillRect(x, y, TP, TP); }
      g.globalAlpha = 1;
    } else {
      g.fillStyle = color;
      g.fillRect(x, y, TP, TP);
      if (!def.water) { // a little per-tile noise so flat colours do not look dead
        const n = hash2(i, j, 7);
        g.fillStyle = n > 0.5 ? `rgba(255,255,255,${(n - 0.5) * 0.08})` : `rgba(0,0,0,${(0.5 - n) * 0.1})`;
        g.fillRect(x, y, TP, TP);
      }
    }
    if (def.water) {
      const depth = L.waterLevel - levelToWorld(lvl);
      const wc = TILE_BY_CHAR[ch]?.def.water ? TILE_BY_CHAR[ch].color : '#3b7fa6';
      g.fillStyle = rgba(wc, clamp(0.62 + depth * 0.12, 0.5, 0.9));
      g.fillRect(x, y, TP, TP);
    }
    // height shading relative to the most common level
    const rel = lvl - this._baseLevel;
    if (rel > 0) { g.fillStyle = `rgba(255,246,225,${Math.min(0.34, rel * 0.06)})`; g.fillRect(x, y, TP, TP); }
    else if (rel < 0) { g.fillStyle = `rgba(4,8,22,${Math.min(0.42, -rel * 0.085)})`; g.fillRect(x, y, TP, TP); }

    // blocked ground: forest floor gets tree tufts, rock gets hatching
    if (!def.water && def.walkable === false) {
      if (/grass/.test(def.top ?? '')) {
        for (let k = 0; k < 2; k++) {
          const px = x + 3 + hash2(i, j, k * 3 + 1) * (TP - 6);
          const py = y + 3 + hash2(i, j, k * 3 + 2) * (TP - 6);
          const r = 3.2 + hash2(i, j, k * 3 + 3) * 2.2;
          g.fillStyle = 'rgba(8,24,12,0.55)';
          g.beginPath(); g.arc(px + 1, py + 1.4, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#244a28';
          g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(120,170,90,0.35)';
          g.beginPath(); g.arc(px - r * 0.3, py - r * 0.35, r * 0.45, 0, Math.PI * 2); g.fill();
        }
      } else {
        g.strokeStyle = 'rgba(0,0,0,0.3)';
        g.lineWidth = 1;
        g.beginPath();
        for (let k = -TP; k < TP; k += 5) { g.moveTo(x + k, y + TP); g.lineTo(x + k + TP, y); }
        g.save(); g.beginPath(); g.rect(x, y, TP, TP); g.clip();
        g.beginPath();
        for (let k = -TP; k < TP; k += 5) { g.moveTo(x + k + 0.5, y + TP); g.lineTo(x + k + TP + 0.5, y); }
        g.stroke();
        g.restore();
      }
    }

    // soft shadows cast by higher neighbours to the north / west (light from the north-west)
    const hN = hAt(i, j - 1);
    const hW = hAt(i - 1, j);
    const hNW = hAt(i - 1, j - 1);
    if (hN != null && hN > lvl) {
      const d = hN - lvl;
      const len = Math.min(TP, 3 + d * 2.6);
      const gr = g.createLinearGradient(0, y, 0, y + len);
      gr.addColorStop(0, `rgba(6,8,18,${Math.min(0.62, 0.26 + d * 0.08)})`);
      gr.addColorStop(1, 'rgba(6,8,18,0)');
      g.fillStyle = gr;
      g.fillRect(x, y, TP, len);
    }
    if (hW != null && hW > lvl) {
      const d = hW - lvl;
      const len = Math.min(TP, 3 + d * 2.6);
      const gr = g.createLinearGradient(x, 0, x + len, 0);
      gr.addColorStop(0, `rgba(6,8,18,${Math.min(0.5, 0.2 + d * 0.07)})`);
      gr.addColorStop(1, 'rgba(6,8,18,0)');
      g.fillStyle = gr;
      g.fillRect(x, y, len, TP);
    }
    if (hNW != null && hNW > lvl && !(hN > lvl) && !(hW > lvl)) {
      const d = hNW - lvl;
      const len = Math.min(TP * 0.8, 2 + d * 2);
      const gr = g.createRadialGradient(x, y, 0, x, y, len);
      gr.addColorStop(0, `rgba(6,8,18,${Math.min(0.45, 0.2 + d * 0.06)})`);
      gr.addColorStop(1, 'rgba(6,8,18,0)');
      g.fillStyle = gr;
      g.fillRect(x, y, len, len);
    }

    // contour / cliff edges, drawn on the higher tile; lit rim on its north / west edges
    const sides = [[0, -1, 'N'], [0, 1, 'S'], [1, 0, 'E'], [-1, 0, 'W']];
    for (const [di, dj, s] of sides) {
      const nh = hAt(i + di, j + dj);
      if (nh == null || nh >= lvl) continue;
      const d = lvl - nh;
      const nDef = L.legend[L.tiles[j + dj][i + di]];
      if (nDef?.stairs || def.stairs) continue; // stairs are the way up; no cliff line
      const w = d >= 2 ? 2 : 1;
      g.fillStyle = d >= 2 ? 'rgba(12,8,14,0.9)' : 'rgba(12,8,14,0.5)';
      if (s === 'N') g.fillRect(x, y, TP, w);
      else if (s === 'S') g.fillRect(x, y + TP - w, TP, w);
      else if (s === 'E') g.fillRect(x + TP - w, y, w, TP);
      else g.fillRect(x, y, w, TP);
      g.fillStyle = `rgba(255,250,230,${d >= 2 ? 0.28 : 0.16})`;
      if (s === 'N') g.fillRect(x, y + w, TP, 1);
      else if (s === 'W') g.fillRect(x + w, y, 1, TP);
      else if (s === 'S') { g.fillStyle = `rgba(0,0,0,${d >= 2 ? 0.22 : 0.12})`; g.fillRect(x, y + TP - w - 2, TP, 2); }
      else { g.fillStyle = `rgba(0,0,0,${d >= 2 ? 0.18 : 0.1})`; g.fillRect(x + TP - w - 2, y, 2, TP); }
    }

    if (def.stairs) drawStairs(g, x, y, def.stairs);
  }

  // -------------------------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------------------------

  _render(now) {
    const ctx = this.ctx;
    const L = this.state.level;
    const { dpr, scale } = this;
    if (this._terrainDirty) this._updateTerrain();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this._drawBackdrop(ctx);

    const s = scale * dpr;
    const ox = dpr * (this.width / 2 - this.cx * scale);
    const oy = dpr * (this.height / 2 - this.cz * scale);
    const world = () => ctx.setTransform(s, 0, 0, s, ox, oy);
    world();
    const u = 1 / scale; // one CSS pixel in world units

    // map drop shadow + terrain
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 28 * dpr;
    ctx.shadowOffsetY = 6 * dpr;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, L.width, L.depth);
    ctx.restore();
    ctx.imageSmoothingEnabled = s < TP;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this._terrain, 0, 0, L.width * TP, L.depth * TP, 0, 0, L.width, L.depth);
    ctx.imageSmoothingEnabled = true;

    const view = this._viewRect();
    if (this._waterPath) this._drawWater(ctx, now, view);
    if (this.state.view.grid !== false) this._drawGrid(ctx, L, view, u);
    // map border
    ctx.strokeStyle = 'rgba(201,164,92,0.55)';
    ctx.lineWidth = 1.5 * u;
    ctx.strokeRect(0, 0, L.width, L.depth);

    // objects
    const labels = [];
    const sel = new Set(this.state.selection);
    for (const o of this._drawOrder()) {
      if (!this._visible(o)) continue;
      const b = drawBounds(o);
      const pad = o.type === 'house' ? 1 : 3;
      if (b.maxX < view.minX - pad || b.minX > view.maxX + pad || b.maxZ < view.minZ - pad || b.minZ > view.maxZ + pad) continue;
      this._drawObject(ctx, o, u, labels, 1);
    }
    // spawn marker
    if (this.state.view.showMarkers !== false) this._drawSpawn(ctx, L.spawn, u, 1, sel.has('spawn'));

    // selection outlines + handles
    for (const o of this.state.selectedObjects) this._outline(ctx, o, u, GOLD, true);
    if (sel.has('spawn')) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.arc(L.spawn.x, L.spawn.z, Math.max(0.6, 13 * u), 0, Math.PI * 2); ctx.stroke();
    }
    for (const hd of selectionHandles(this.state)) {
      const r = 4.5 * u;
      ctx.fillStyle = '#fff8e6';
      ctx.strokeStyle = '#8a6a2c';
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath(); ctx.rect(hd.x - r, hd.z - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
    }

    // hover cell
    const hov = this.state.hover;
    const toolId = this.state.toolId;
    let preview = null;
    try { preview = getTool(toolId).preview(this.state); } catch (err) { preview = null; }
    if (hov && hov.view === '2d' && !['select', 'place', 'erase', 'eyedropper'].includes(toolId) && !preview?.cells) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(hov.i, hov.j, 1, 1);
    }
    if (this._hover3d) {
      const h3 = this._hover3d;
      ctx.strokeStyle = 'rgba(127,227,255,0.9)';
      ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(h3.i, h3.j, 1, 1);
      ctx.beginPath(); ctx.arc(h3.x, h3.z, 4 * u, 0, Math.PI * 2); ctx.stroke();
    }

    if (preview) this._drawPreview(ctx, preview, u, labels, now);

    // screen-space labels / glyphs
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._drawLabels(ctx, labels);
    if (preview?.label && hov) {
      const p = this._pointer ?? this.worldToScreen(hov.x, hov.z);
      this._tooltip(ctx, p.x ?? p.sx, p.y ?? p.sy, preview.label);
    }
  }

  _viewRect() {
    const a = this.screenToWorld(0, 0);
    const b = this.screenToWorld(this.width, this.height);
    return { minX: a.x, minZ: a.z, maxX: b.x, maxZ: b.z };
  }

  _drawBackdrop(ctx) {
    // subtle dotted backdrop outside the map
    const step = 24 * this.dpr;
    const ox = ((this.width / 2 - this.cx * this.scale) * this.dpr) % step;
    const oy = ((this.height / 2 - this.cz * this.scale) * this.dpr) % step;
    ctx.fillStyle = 'rgba(120,140,190,0.07)';
    for (let y = oy; y < this.canvas.height; y += step) {
      for (let x = ox; x < this.canvas.width; x += step) ctx.fillRect(x, y, 1.5 * this.dpr, 1.5 * this.dpr);
    }
  }

  _drawWater(ctx, now, view) {
    const t = now / 1000;
    if (!this._shimmerPat) this._shimmerPat = ctx.createPattern(this._shimmer, 'repeat');
    const pat = this._shimmerPat;
    const m = this._shimmerMatrix ??= new DOMMatrix();
    const x0 = Math.max(0, view.minX - 1);
    const z0 = Math.max(0, view.minZ - 1);
    const w = Math.min(this.state.level.width, view.maxX + 1) - x0;
    const d = Math.min(this.state.level.depth, view.maxZ + 1) - z0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.7);
    // each flow's water drifts its own way (still water: the pattern stays put, only the glints pulse)
    for (const { path, fx, fz } of this._waterPaths ?? []) {
      ctx.save();
      ctx.clip(path);
      const draw = (sx, sz, speed, alpha, sc) => {
        // translate(…) · scale(sc), written in place (no per-frame allocation)
        m.a = sc; m.b = 0; m.c = 0; m.d = sc;
        m.e = sx + t * speed * fx;
        m.f = sz + t * speed * fz;
        pat.setTransform(m);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = pat;
        ctx.fillRect(x0, z0, w, d);
      };
      draw(0, 0, 1.1, 0.16 + 0.1 * pulse, 1 / 16);
      draw(1.7, 2.3, 0.6, 0.12 + 0.08 * (1 - pulse), 1 / 22);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _drawGrid(ctx, L, view, u) {
    if (this.scale < 5) return;
    const i0 = Math.max(0, Math.floor(view.minX));
    const i1 = Math.min(L.width, Math.ceil(view.maxX));
    const j0 = Math.max(0, Math.floor(view.minZ));
    const j1 = Math.min(L.depth, Math.ceil(view.maxZ));
    const minorA = clamp((this.scale - 5) / 25, 0, 1) * 0.24;
    ctx.lineWidth = u;
    if (minorA > 0.01) {
      ctx.strokeStyle = `rgba(0,0,0,${minorA})`;
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) { if (i % 8) { ctx.moveTo(i, j0); ctx.lineTo(i, j1); } }
      for (let j = j0; j <= j1; j++) { if (j % 8) { ctx.moveTo(i0, j); ctx.lineTo(i1, j); } }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.36)';
    ctx.beginPath();
    for (let i = Math.ceil(i0 / 8) * 8; i <= i1; i += 8) { ctx.moveTo(i, j0); ctx.lineTo(i, j1); }
    for (let j = Math.ceil(j0 / 8) * 8; j <= j1; j += 8) { ctx.moveTo(i0, j); ctx.lineTo(i1, j); }
    ctx.stroke();
  }

  // -------------------------------------------------------------------------------------------
  // Objects
  // -------------------------------------------------------------------------------------------

  _drawObject(ctx, o, u, labels, alpha) {
    const def = OBJECT_TYPES[o.type];
    if (!def) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const zoomedIn = this.scale >= 12;
    switch (o.type) {
      case 'house': {
        const [hw, hd] = footprint(o);
        ctx.translate(o.x, o.z);
        ctx.rotate(-(o.rotation ?? 0));
        const rw = hw * 2;
        const rd = hd * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        rr(ctx, -hw + 0.3, -hd + 0.42, rw, rd, 0.15); ctx.fill();
        const roof = ownValue(ROOF_COLORS, o.opts?.roof) ?? '#a9503d';
        const gf = !!o.opts?.gableFront;
        ctx.fillStyle = shade(roof, 0.14);
        if (gf) ctx.fillRect(-hw, -hd, hw, rd); else ctx.fillRect(-hw, -hd, rw, hd);
        ctx.fillStyle = shade(roof, -0.16);
        if (gf) ctx.fillRect(0, -hd, hw, rd); else ctx.fillRect(-hw, 0, rw, hd);
        // roof courses
        ctx.strokeStyle = 'rgba(0,0,0,0.16)';
        ctx.lineWidth = u;
        ctx.beginPath();
        if (gf) for (let k = -hd + 0.5; k < hd; k += 0.5) { ctx.moveTo(-hw, k); ctx.lineTo(hw, k); }
        else for (let k = -hw + 0.5; k < hw; k += 0.5) { ctx.moveTo(k, -hd); ctx.lineTo(k, hd); }
        ctx.stroke();
        // ridge
        ctx.strokeStyle = shade(roof, 0.4);
        ctx.lineWidth = Math.max(0.1, 2 * u);
        ctx.beginPath();
        if (gf) { ctx.moveTo(0, -hd); ctx.lineTo(0, hd); } else { ctx.moveTo(-hw, 0); ctx.lineTo(hw, 0); }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(20,10,8,0.85)';
        ctx.lineWidth = 1.5 * u;
        ctx.strokeRect(-hw, -hd, rw, rd);
        if (o.opts?.chimney !== false) {
          ctx.fillStyle = '#5b5552';
          ctx.fillRect(hw - 0.95, -hd + 0.35, 0.5, 0.5);
          ctx.fillStyle = '#2a2524';
          ctx.fillRect(hw - 0.85, -hd + 0.45, 0.3, 0.3);
        }
        // front door (+Z local)
        ctx.fillStyle = '#6e4424';
        ctx.fillRect(-0.4, hd - 0.05, 0.8, 0.32);
        ctx.fillStyle = '#e8c98a';
        ctx.fillRect(-0.4, hd + 0.2, 0.8, 0.07);
        if ((o.opts?.stories ?? 1) > 1) {
          ctx.strokeStyle = 'rgba(255,240,210,0.35)';
          ctx.lineWidth = u;
          ctx.strokeRect(-hw + 0.3, -hd + 0.3, rw - 0.6, rd - 0.6);
        }
        ctx.restore();
        if (zoomedIn && o.name) labels.push({ x: o.x, z: o.z, text: o.name, kind: 'name' });
        return;
      }
      case 'windmill': {
        const rot = -(o.rotation ?? 0);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.arc(o.x + 0.25, o.z + 0.35, 1.35, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c9bea3';
        ctx.beginPath(); ctx.arc(o.x, o.z, 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ownValue(ROOF_COLORS, o.opts?.roof) ?? ROOF_COLORS.roof_thatch;
        ctx.beginPath(); ctx.arc(o.x, o.z, 0.95, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(30,20,10,0.8)';
        ctx.lineWidth = 1.5 * u;
        ctx.beginPath(); ctx.arc(o.x, o.z, 1.3, 0, Math.PI * 2); ctx.stroke();
        ctx.translate(o.x, o.z + 1.0);
        ctx.rotate(rot);
        ctx.strokeStyle = 'rgba(232,220,192,0.95)';
        ctx.lineWidth = 0.22;
        ctx.beginPath(); ctx.moveTo(-2.6, 0); ctx.lineTo(2.6, 0); ctx.stroke();
        ctx.fillStyle = '#4a3a2a';
        ctx.beginPath(); ctx.arc(0, 0, 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        return;
      }
      case 'well': {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.arc(o.x + 0.2, o.z + 0.3, 0.85, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9aa0a8';
        ctx.beginPath(); ctx.arc(o.x, o.z, 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#23506f';
        ctx.beginPath(); ctx.arc(o.x, o.z, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.translate(o.x, o.z);
        ctx.rotate(-(o.rotation ?? 0));
        ctx.fillStyle = rgba('#7a5230', 0.9);
        ctx.fillRect(-0.95, -0.08, 1.9, 0.16);
        ctx.strokeStyle = 'rgba(20,20,26,0.8)';
        ctx.lineWidth = 1.2 * u;
        ctx.beginPath(); ctx.arc(0, 0, 0.8, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        return;
      }
      case 'marketStall': {
        const [hw, hd] = footprint(o);
        ctx.translate(o.x, o.z);
        ctx.rotate(-(o.rotation ?? 0));
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(-hw + 0.25, -hd + 0.35, hw * 2, hd * 2);
        const [c1, c2] = ownValue(CLOTH_COLORS, o.opts?.cloth) ?? CLOTH_COLORS.cloth_stripe;
        const n = Math.max(3, Math.round(hw * 4));
        for (let k = 0; k < n; k++) {
          ctx.fillStyle = k % 2 ? c2 : c1;
          ctx.fillRect(-hw + (k * hw * 2) / n, -hd, (hw * 2) / n + 0.01, hd * 2);
        }
        ctx.strokeStyle = 'rgba(40,10,10,0.85)';
        ctx.lineWidth = 1.5 * u;
        ctx.strokeRect(-hw, -hd, hw * 2, hd * 2);
        ctx.restore();
        return;
      }
      case 'tree': {
        const r = treeRadius(o);
        const kind = o.opts?.kind ?? 'oak';
        const base = ownValue(TREE_COLORS, kind) ?? TREE_COLORS.oak;
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath(); ctx.arc(o.x + r * 0.28, o.z + r * 0.38, r, 0, Math.PI * 2); ctx.fill();
        const gr = ctx.createRadialGradient(o.x - r * 0.35, o.z - r * 0.4, r * 0.1, o.x, o.z, r);
        gr.addColorStop(0, shade(base, 0.32));
        gr.addColorStop(0.6, base);
        gr.addColorStop(1, shade(base, -0.35));
        ctx.fillStyle = gr;
        ctx.beginPath();
        if (kind === 'pine') {
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            const rr2 = k % 2 ? r * 0.72 : r;
            ctx.lineTo(o.x + Math.cos(a) * rr2, o.z + Math.sin(a) * rr2);
          }
          ctx.closePath();
        } else {
          const seed = o.opts?.seed ?? 1;
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            const rr2 = r * (0.88 + 0.12 * hash2(seed, k, 3));
            ctx.lineTo(o.x + Math.cos(a) * rr2, o.z + Math.sin(a) * rr2);
          }
          ctx.closePath();
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(8,20,10,0.55)';
        ctx.lineWidth = u;
        ctx.stroke();
        if (this.scale >= 10) {
          // leaf clumps: a few lit blobs on the sun side, shaded ones opposite
          const seed = o.opts?.seed ?? 1;
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 + seed * 0.7;
            const d = r * (0.35 + 0.25 * hash2(seed, k, 9));
            const px = o.x + Math.cos(a) * d;
            const pz = o.z + Math.sin(a) * d;
            const lit = Math.cos(a) + Math.sin(a) < 0;
            ctx.fillStyle = lit ? 'rgba(255,255,220,0.13)' : 'rgba(0,0,0,0.12)';
            ctx.beginPath(); ctx.arc(px, pz, r * 0.32, 0, Math.PI * 2); ctx.fill();
          }
        }
        if (kind === 'birch') { ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.arc(o.x, o.z, 0.1, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
        return;
      }
      case 'rock': {
        const r = 0.5 * (o.opts?.size ?? 1);
        const seed = o.opts?.seed ?? 1;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.arc(o.x + r * 0.25, o.z + r * 0.35, r, 0, Math.PI * 2); ctx.fill();
        const gr = ctx.createLinearGradient(o.x - r, o.z - r, o.x + r, o.z + r);
        gr.addColorStop(0, '#b3b3ba');
        gr.addColorStop(1, '#5d5d66');
        ctx.fillStyle = gr;
        ctx.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2 + seed;
          const rr2 = r * (0.75 + 0.3 * hash2(seed, k, 5));
          ctx.lineTo(o.x + Math.cos(a) * rr2, o.z + Math.sin(a) * rr2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,20,26,0.7)';
        ctx.lineWidth = u;
        ctx.stroke();
        ctx.restore();
        return;
      }
      case 'haystack': {
        const r = 0.9 * (o.opts?.size ?? 1);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.arc(o.x + 0.2, o.z + 0.3, r, 0, Math.PI * 2); ctx.fill();
        const gr = ctx.createRadialGradient(o.x - r * 0.3, o.z - r * 0.3, 0.05, o.x, o.z, r);
        gr.addColorStop(0, '#f3d98a');
        gr.addColorStop(1, '#b08a36');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(o.x, o.z, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(90,60,20,0.6)';
        ctx.lineWidth = u;
        ctx.beginPath(); ctx.arc(o.x, o.z, r * 0.55, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(o.x, o.z, r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        return;
      }
      case 'lamppost': case 'wallTorch': case 'campfire': case 'light': {
        const R = o.type === 'light' ? Math.max(0.8, (o.distance ?? 8) * 0.28) : LIGHT_GLOW[o.type];
        const col = o.type === 'light' ? (o.color ?? '#ffb46b') : o.type === 'lamppost' ? '#ffcf7a' : '#ff8a3d';
        const gr = ctx.createRadialGradient(o.x, o.z, 0, o.x, o.z, R);
        gr.addColorStop(0, rgba(normHex(col), 0.42));
        gr.addColorStop(1, rgba(normHex(col), 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(o.x, o.z, R, 0, Math.PI * 2); ctx.fill();
        if (o.type === 'campfire') {
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            ctx.fillStyle = '#7d7a78';
            ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * 0.52, o.z + Math.sin(a) * 0.52, 0.12, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = '#ff7a2a';
          ctx.beginPath(); ctx.arc(o.x, o.z, 0.34, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffd36b';
          ctx.beginPath(); ctx.arc(o.x, o.z, 0.17, 0, Math.PI * 2); ctx.fill();
          if (o.opts?.seat) {
            ctx.translate(o.x, o.z); ctx.rotate(-(o.rotation ?? 0));
            ctx.fillStyle = '#7a5230';
            ctx.fillRect(-0.7, -1.35, 1.4, 0.3); ctx.fillRect(-0.7, 1.05, 1.4, 0.3);
          }
        } else if (o.type === 'wallTorch') {
          ctx.translate(o.x, o.z); ctx.rotate(-(o.rotation ?? 0));
          ctx.fillStyle = '#3a2a1a'; ctx.fillRect(-0.06, -0.25, 0.12, 0.25);
          ctx.fillStyle = '#ff9a3d'; ctx.beginPath(); ctx.arc(0, 0.06, 0.16, 0, Math.PI * 2); ctx.fill();
        } else if (o.type === 'lamppost') {
          const r = Math.max(0.2, 4.5 * u);
          ctx.fillStyle = '#26211f'; ctx.beginPath(); ctx.arc(o.x, o.z, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#e2c17f'; ctx.lineWidth = 1.2 * u; ctx.stroke();
          ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.arc(o.x, o.z, r * 0.5, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = normHex(col);
          ctx.strokeStyle = 'rgba(40,30,10,0.8)';
          ctx.lineWidth = u;
          const r = Math.max(0.16, 4 * u);
          ctx.beginPath(); ctx.moveTo(o.x, o.z - r); ctx.lineTo(o.x + r, o.z); ctx.lineTo(o.x, o.z + r); ctx.lineTo(o.x - r, o.z); ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
        ctx.restore();
        return;
      }
      case 'fence': {
        const len = Math.hypot(o.x1 - o.x0, o.z1 - o.z0);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.2;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(o.x0 + 0.08, o.z0 + 0.14); ctx.lineTo(o.x1 + 0.08, o.z1 + 0.14); ctx.stroke();
        ctx.strokeStyle = '#a57344';
        ctx.lineWidth = 0.12;
        ctx.beginPath(); ctx.moveTo(o.x0, o.z0); ctx.lineTo(o.x1, o.z1); ctx.stroke();
        const n = Math.max(1, Math.round(len / 1.2));
        ctx.fillStyle = '#5f3e22';
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const px = o.x0 + (o.x1 - o.x0) * t;
          const pz = o.z0 + (o.z1 - o.z0) * t;
          ctx.fillRect(px - 0.11, pz - 0.11, 0.22, 0.22);
        }
        ctx.restore();
        return;
      }
      case 'bridge': {
        const len = Math.hypot(o.x1 - o.x0, o.z1 - o.z0) || 0.01;
        const w = o.opts?.width ?? 2;
        ctx.translate(o.x0, o.z0);
        ctx.rotate(Math.atan2(o.z1 - o.z0, o.x1 - o.x0));
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0.15, -w / 2 + 0.3, len, w);
        ctx.fillStyle = '#9d6d3e';
        ctx.fillRect(0, -w / 2, len, w);
        ctx.strokeStyle = 'rgba(40,20,8,0.45)';
        ctx.lineWidth = u;
        ctx.beginPath();
        for (let k = 0.35; k < len; k += 0.35) { ctx.moveTo(k, -w / 2); ctx.lineTo(k, w / 2); }
        ctx.stroke();
        ctx.fillStyle = '#5f3e22';
        ctx.fillRect(0, -w / 2, len, 0.14);
        ctx.fillRect(0, w / 2 - 0.14, len, 0.14);
        ctx.strokeStyle = 'rgba(20,10,4,0.85)';
        ctx.lineWidth = 1.2 * u;
        ctx.strokeRect(0, -w / 2, len, w);
        ctx.restore();
        return;
      }
      case 'waterfall': {
        const w = o.width ?? 2;
        const ang = ownValue(FALL_ANGLE, o.facing) ?? FALL_ANGLE.S;
        ctx.translate(o.x, o.z);
        ctx.rotate(ang);
        const gr = ctx.createLinearGradient(0, -0.4, 0, 0.6);
        gr.addColorStop(0, 'rgba(180,230,255,0.95)');
        gr.addColorStop(1, 'rgba(120,200,255,0.3)');
        ctx.fillStyle = gr;
        ctx.fillRect(-w / 2, -0.3, w, 0.9);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = u * 1.2;
        ctx.beginPath();
        for (let k = -w / 2 + 0.2; k < w / 2; k += 0.3) { ctx.moveTo(k, -0.25); ctx.lineTo(k, 0.5); }
        ctx.stroke();
        ctx.fillStyle = '#e8f7ff';
        ctx.beginPath(); ctx.moveTo(-0.25, 0.55); ctx.lineTo(0.25, 0.55); ctx.lineTo(0, 0.85); ctx.closePath(); ctx.fill();
        ctx.restore();
        return;
      }
      case 'npc': {
        const col = normHex(o.portraitColor ?? def.color);
        if (o.wander > 0) {
          ctx.beginPath(); ctx.arc(o.x, o.z, o.wander, 0, Math.PI * 2);
          haloDash(ctx, u, rgba(col, 0.6), [4, 4], 1, 0.28);
        }
        const r = Math.max(0.36, 6 * u);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.arc(o.x + 0.08, o.z + 0.12, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f2e2b5';
        ctx.beginPath(); ctx.arc(o.x, o.z, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(0.08, 2 * u);
        ctx.stroke();
        const fa = ownValue(FACING_ANGLE, o.facing) ?? FACING_ANGLE.down;
        ctx.fillStyle = '#3a2a1a';
        ctx.beginPath();
        ctx.moveTo(o.x + Math.cos(fa) * r * 1.55, o.z + Math.sin(fa) * r * 1.55);
        ctx.lineTo(o.x + Math.cos(fa + 0.55) * r * 1.02, o.z + Math.sin(fa + 0.55) * r * 1.02);
        ctx.lineTo(o.x + Math.cos(fa - 0.55) * r * 1.02, o.z + Math.sin(fa - 0.55) * r * 1.02);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        labels.push({ x: o.x, z: o.z, text: def.glyph, kind: 'glyph', color: '#3a2a1a', size: r * this.scale * 1.25 });
        if (zoomedIn || this.state.selection.includes(o.id)) labels.push({ x: o.x, z: o.z + r, text: o.name || o.id, kind: 'npc' });
        return;
      }
      case 'critters': {
        const R = o.radius ?? 2.5;
        ctx.fillStyle = rgba(def.color, 0.08);
        ctx.beginPath(); ctx.arc(o.x, o.z, R, 0, Math.PI * 2); ctx.fill();
        haloDash(ctx, u, rgba(def.color, 0.95), [5, 4], 1.4);
        // the chicken yard (relative `area`), and a dot where the game starts each animal
        const yard = (o.kind ?? 'chicken') === 'chicken' ? critterYard(o) : null;
        if (yard) {
          ctx.strokeStyle = rgba(def.color, 0.8);
          ctx.lineWidth = u * 1.2;
          ctx.setLineDash([4 * u, 3 * u]);
          ctx.strokeRect(yard.minX, yard.minZ, yard.maxX - yard.minX, yard.maxZ - yard.minZ);
          ctx.setLineDash([]);
        }
        ctx.fillStyle = rgba(def.color, 0.9);
        for (const [px, pz] of this._critterSpots(o)) {
          ctx.beginPath(); ctx.arc(px, pz, Math.max(0.1, 2.2 * u), 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        labels.push({ x: o.x, z: o.z, text: def.glyph, kind: 'glyph', color: def.color, size: 15, badge: true });
        if (zoomedIn) labels.push({ x: o.x, z: o.z + R, text: `${o.count ?? 4} × ${optionLabel(o.kind ?? 'chicken')}`, kind: 'small', color: def.color });
        return;
      }
      case 'enemy': {
        const kind = ENEMY_KINDS.includes(o.kind) ? o.kind : 'slime';
        const info = ENEMY_INFO[kind];
        const col = o.elite ? ENEMY_ELITE : ENEMY_RING;
        const R = Number(o.radius) || 3;
        // (only the boss's arena and gate exist in the game: a leftover one on another kind is
        // not drawn — Check for problems names it)
        const arena = bossArena(o);
        if (arena) {
          // the boss arena (dashed) and its gate (a bright bar on the boundary)
          ctx.fillStyle = rgba(ENEMY_ARENA, 0.07);
          ctx.beginPath(); ctx.rect(arena.minX, arena.minZ, arena.maxX - arena.minX, arena.maxZ - arena.minZ); ctx.fill();
          haloDash(ctx, u, rgba(ENEMY_ARENA, 0.95), [8, 5], 1.6);
          const g = bossGate(o);
          if (g) {
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(g[2], g[3]);
            ctx.strokeStyle = 'rgba(6,8,16,0.55)';
            ctx.lineWidth = 6 * u;
            ctx.stroke();
            ctx.strokeStyle = ENEMY_GATE;
            ctx.lineWidth = 3.5 * u;
            ctx.stroke();
            ctx.lineCap = 'butt';
          }
        }
        if (!info.boss || !arena) {
          ctx.fillStyle = rgba(col, 0.08);
          ctx.beginPath(); ctx.arc(o.x, o.z, R, 0, Math.PI * 2); ctx.fill();
          haloDash(ctx, u, rgba(col, 0.95), [6, 3], 1.5);
        }
        // a dot where the game starts each enemy (fliers may start over water)
        const spots = this._enemySpots(o);
        const r = Math.max(0.12, 2.6 * u) * (info.boss ? 1.6 : 1);
        for (let pass = 0; pass < 2; pass++) {
          ctx.fillStyle = pass ? rgba(col, 0.95) : 'rgba(6,8,16,0.6)';
          const rad = pass ? r : r + 1.2 * u;
          ctx.beginPath();
          for (const [px, pz] of spots) { ctx.moveTo(px + rad, pz); ctx.arc(px, pz, rad, 0, Math.PI * 2); }
          ctx.fill();
        }
        ctx.restore();
        labels.push({ x: o.x, z: o.z, text: def.glyph, kind: 'glyph', color: col, size: 15, badge: true });
        if (zoomedIn || this.state.selection.includes(o.id)) {
          labels.push({ x: o.x, z: o.z + (info.boss && arena ? 1.2 : R), text: `${editorLang() === 'zh' ? info.label : kind} ×${spots.length} · Lv${o.level ?? 1}`, kind: 'small', color: col });
        }
        return;
      }
      case 'emitter': {
        const hx = (o.size?.[0] ?? 8) / 2;
        const hz = (o.size?.[2] ?? 8) / 2;
        ctx.fillStyle = rgba(def.color, 0.08);
        ctx.beginPath(); ctx.rect(o.x - hx, o.z - hz, hx * 2, hz * 2); ctx.fill();
        haloDash(ctx, u, rgba(def.color, 0.95), [5, 4], 1.4);
        const n = Math.min(24, Math.round(4 + (hx * hz) / 3));
        const r = Math.max(0.06, 2.3 * u);
        for (let pass = 0; pass < 2; pass++) {
          // glowing specks on a dark rim, readable on light ground and busy textures alike
          ctx.fillStyle = pass ? rgba(def.color, 0.95) : 'rgba(6,8,16,0.6)';
          const rad = pass ? r : r + 1.2 * u;
          ctx.beginPath();
          for (let k = 0; k < n; k++) {
            const px = o.x - hx + (0.04 + 0.92 * hash2(k, 3, 9)) * hx * 2;
            const pz = o.z - hz + (0.04 + 0.92 * hash2(k, 7, 9)) * hz * 2;
            ctx.moveTo(px + rad, pz);
            ctx.arc(px, pz, rad, 0, Math.PI * 2);
          }
          ctx.fill();
        }
        ctx.restore();
        labels.push({ x: o.x, z: o.z, text: def.glyph, kind: 'glyph', color: def.color, size: 15, badge: true });
        if (this.scale >= 22) labels.push({ x: o.x - hx, z: o.z - hz, text: o.preset != null ? optionLabel(o.preset) : tr('tools.map.particles'), kind: 'corner', color: def.color });
        return;
      }
      case 'region': {
        ctx.fillStyle = rgba('#c9a45c', 0.07);
        ctx.beginPath(); ctx.rect(o.minX, o.minZ, o.maxX - o.minX, o.maxZ - o.minZ); ctx.fill();
        haloDash(ctx, u, rgba('#e2c17f', 0.95), [7, 5], 1.6);
        ctx.restore();
        if (this.scale >= 9) labels.push({ x: o.minX, z: o.minZ, text: o.name || tr('tools.map.region'), kind: 'region', sub: this.scale >= 30 ? o.sub : '' });
        labels.push({ x: (o.minX + o.maxX) / 2, z: (o.minZ + o.maxZ) / 2, text: def.glyph, kind: 'glyph', color: '#e2c17f', size: 14, badge: true });
        return;
      }
      case 'exit': {
        // a campaign exit: a green dashed rectangle, its target as the tag ("→ level · entrance")
        ctx.fillStyle = rgba(def.color, o.mode === 'use' ? 0.16 : 0.1);
        ctx.beginPath(); ctx.rect(o.minX, o.minZ, o.maxX - o.minX, o.maxZ - o.minZ); ctx.fill();
        haloDash(ctx, u, rgba(def.color, 0.95), o.mode === 'use' ? [3, 3] : [9, 4], 1.8);
        ctx.restore();
        if (this.scale >= 9) labels.push({ x: o.minX, z: o.minZ, text: `→ ${o.to || '?'}`, kind: 'region', sub: this.scale >= 30 ? (o.entrance || '') : '', color: def.color });
        labels.push({ x: (o.minX + o.maxX) / 2, z: (o.minZ + o.maxZ) / 2, text: def.glyph, kind: 'glyph', color: def.color, size: 14, badge: true });
        return;
      }
      case 'event': {
        // a story event: a gold dashed rectangle, its trigger and prompt as the tag ("! use · Read");
        // zoomed in, what it waits for (condition, hour, enemy group); a background event (it runs
        // without holding the player) is dotted and tagged "(background)"
        ctx.fillStyle = rgba(def.color, o.on === 'use' ? 0.15 : 0.09);
        ctx.beginPath(); ctx.rect(o.minX, o.minZ, o.maxX - o.minX, o.maxZ - o.minZ); ctx.fill();
        haloDash(ctx, u, rgba(def.color, 0.95), isBackgroundEvent(o) ? [1.5, 3.5] : o.on === 'use' ? [3, 3] : [6, 3, 1.5, 3], 1.7);
        ctx.restore();
        if (this.scale >= 9) labels.push({ x: o.minX, z: o.minZ, text: eventTag(o), kind: 'region', sub: this.scale >= 30 ? eventSub(o) : '', color: def.color });
        labels.push({ x: (o.minX + o.maxX) / 2, z: (o.minZ + o.maxZ) / 2, text: def.glyph, kind: 'glyph', color: def.color, size: 14, badge: true });
        return;
      }
      case 'marker': {
        // a story marker (a named spot): a gold ring with its facing, its name below
        const r = Math.max(0.3, 6 * u);
        const fa = ownValue(FACING_ANGLE, o.facing) ?? FACING_ANGLE.down;
        ctx.fillStyle = rgba(def.color, 0.16);
        ctx.beginPath(); ctx.arc(o.x, o.z, r * 1.55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.moveTo(o.x + Math.cos(fa) * r * 1.95, o.z + Math.sin(fa) * r * 1.95);
        ctx.lineTo(o.x + Math.cos(fa + 0.42) * r * 1.2, o.z + Math.sin(fa + 0.42) * r * 1.2);
        ctx.lineTo(o.x + Math.cos(fa - 0.42) * r * 1.2, o.z + Math.sin(fa - 0.42) * r * 1.2);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath(); ctx.arc(o.x, o.z, r, 0, Math.PI * 2);
        ctx.fillStyle = '#33290f';
        ctx.fill();
        ctx.strokeStyle = def.color;
        ctx.lineWidth = Math.max(0.07, 1.8 * u);
        ctx.stroke();
        ctx.restore();
        labels.push({ x: o.x, z: o.z, text: def.glyph, kind: 'glyph', color: def.color, size: r * this.scale * 1.25 });
        if (zoomedIn || this.state.selection.includes(o.id)) labels.push({ x: o.x, z: o.z + r, text: o.name || o.id, kind: 'npc' });
        return;
      }
      case 'entrance': {
        // a campaign arrival point: a green ring with the arrival facing, its name below
        const r = Math.max(0.36, 7 * u);
        const fa = ownValue(FACING_ANGLE, o.facing) ?? FACING_ANGLE.down;
        ctx.fillStyle = rgba(def.color, 0.18);
        ctx.beginPath(); ctx.arc(o.x, o.z, r * 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.moveTo(o.x + Math.cos(fa) * r * 2, o.z + Math.sin(fa) * r * 2);
        ctx.lineTo(o.x + Math.cos(fa + 0.42) * r * 1.25, o.z + Math.sin(fa + 0.42) * r * 1.25);
        ctx.lineTo(o.x + Math.cos(fa - 0.42) * r * 1.25, o.z + Math.sin(fa - 0.42) * r * 1.25);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath(); ctx.arc(o.x, o.z, r, 0, Math.PI * 2);
        ctx.fillStyle = '#123527';
        ctx.fill();
        ctx.strokeStyle = def.color;
        ctx.lineWidth = Math.max(0.08, 2 * u);
        ctx.stroke();
        ctx.restore();
        labels.push({ x: o.x, z: o.z, text: def.glyph, kind: 'glyph', color: def.color, size: r * this.scale * 1.2 });
        if (zoomedIn || this.state.selection.includes(o.id)) labels.push({ x: o.x, z: o.z + r, text: o.name || o.id, kind: 'npc' });
        return;
      }
      default: {
        // generic prop: rotated footprint box with the catalog colour
        const [hw, hd] = footprint(o);
        ctx.translate(o.x, o.z);
        ctx.rotate(-(o.rotation ?? 0));
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        if (o.type === 'barrel' && !o.opts?.lying) {
          ctx.beginPath(); ctx.arc(0.1, 0.15, hw, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = def.color;
          ctx.beginPath(); ctx.arc(0, 0, hw, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(30,18,8,0.85)';
          ctx.lineWidth = 1.2 * u;
          ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, hw * 0.62, 0, Math.PI * 2); ctx.stroke();
        } else if (o.type === 'waystone') {
          // a rune stone on its round base, the crystal as a diamond
          ctx.beginPath(); ctx.arc(0.1, 0.15, hw, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#7d8290';
          ctx.beginPath(); ctx.arc(0, 0, hw, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(20,24,34,0.85)';
          ctx.lineWidth = 1.2 * u;
          ctx.stroke();
          ctx.fillStyle = def.color;
          ctx.beginPath(); ctx.moveTo(0, -hw * 0.72); ctx.lineTo(hw * 0.45, 0); ctx.lineTo(0, hw * 0.72); ctx.lineTo(-hw * 0.45, 0); ctx.closePath(); ctx.fill();
          ctx.stroke();
        } else if (o.type === 'chest') {
          // lid band at the back, the lock on the front (rotation 0: front toward +Z)
          ctx.fillRect(-hw + 0.08, -hd + 0.14, hw * 2, hd * 2);
          ctx.fillStyle = '#8a5a2e';
          ctx.fillRect(-hw, -hd, hw * 2, hd * 2);
          ctx.fillStyle = '#5e3b1c';
          ctx.fillRect(-hw, -hd, hw * 2, hd * 0.7);
          ctx.fillStyle = def.color;
          ctx.fillRect(-hw * 0.55, -hd, hw * 0.16, hd * 2);
          ctx.fillRect(hw * 0.39, -hd, hw * 0.16, hd * 2);
          ctx.beginPath(); ctx.arc(0, hd * 0.72, Math.max(0.07, hd * 0.22), 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(30,18,8,0.85)';
          ctx.lineWidth = 1.2 * u;
          ctx.strokeRect(-hw, -hd, hw * 2, hd * 2);
        } else if (OBJECT_TYPES[o.type].interior) {
          drawInterior(ctx, o, def, u);
        } else if (o.type === 'crateStack') {
          const sz = o.opts?.size ?? 0.85;
          const n = o.opts?.count ?? 3;
          const offs = [[-0.45, 0.25], [0.45, 0.25], [0, -0.35], [0, 0.1]];
          for (let k = 0; k < Math.min(n, 4); k++) {
            const [px, pz] = offs[k];
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(px - sz / 2 + 0.08, pz - sz / 2 + 0.12, sz, sz);
            ctx.fillStyle = k === 2 ? shade(def.color, 0.15) : def.color;
            ctx.fillRect(px - sz / 2, pz - sz / 2, sz, sz);
            ctx.strokeStyle = 'rgba(40,22,8,0.8)';
            ctx.lineWidth = u;
            ctx.strokeRect(px - sz / 2, pz - sz / 2, sz, sz);
          }
        } else {
          ctx.fillRect(-hw + 0.08, -hd + 0.14, hw * 2, hd * 2);
          ctx.fillStyle = o.type === 'flowerbox' ? '#8a5a34' : def.color;
          ctx.fillRect(-hw, -hd, hw * 2, hd * 2);
          if (o.type === 'flowerbox') {
            const cols = ['#e27aa8', '#f2d05a', '#e8e0ff'];
            for (let k = 0; k < Math.round(hw * 6); k++) {
              ctx.fillStyle = cols[k % 3];
              ctx.fillRect(-hw + 0.08 + (k / (hw * 6)) * hw * 2, -0.06, 0.12, 0.12);
            }
          } else if (o.type === 'bench') {
            ctx.strokeStyle = 'rgba(40,22,8,0.5)';
            ctx.lineWidth = u;
            ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.lineTo(hw, 0); ctx.stroke();
            if (o.opts?.back !== false) { ctx.fillStyle = shade(def.color, -0.3); ctx.fillRect(-hw, -hd, hw * 2, 0.1); }
          } else if (o.type === 'crate') {
            ctx.strokeStyle = 'rgba(40,22,8,0.55)';
            ctx.lineWidth = u;
            ctx.beginPath(); ctx.moveTo(-hw, -hd); ctx.lineTo(hw, hd); ctx.moveTo(hw, -hd); ctx.lineTo(-hw, hd); ctx.stroke();
          } else if (o.type === 'signpost') {
            ctx.fillStyle = '#6e4a2a';
            ctx.fillRect(-0.4, -0.08, 0.8, 0.16);
          }
          ctx.strokeStyle = 'rgba(30,18,8,0.85)';
          ctx.lineWidth = 1.2 * u;
          ctx.strokeRect(-hw, -hd, hw * 2, hd * 2);
        }
        ctx.restore();
        if (this.scale >= 18 && ['signpost'].includes(o.type)) labels.push({ x: o.x, z: o.z - 0.5, text: def.glyph, kind: 'glyph', color: def.color, size: 13 });
        // combat props (COMBAT.md §17): the catalog glyph on the box
        if (this.scale >= 9 && this.scale < 22 && (o.type === 'chest' || o.type === 'waystone')) labels.push({ x: o.x, z: o.z, text: def.glyph, kind: 'glyph', color: def.color, size: 14, badge: true });
      }
    }
  }

  _drawSpawn(ctx, s, u, alpha = 1, selected = false) {
    const r = Math.max(0.42, 9 * u);
    ctx.save();
    ctx.globalAlpha = alpha;
    const fa = ownValue(FACING_ANGLE, s.facing) ?? FACING_ANGLE.down;
    ctx.fillStyle = 'rgba(127,227,255,0.18)';
    ctx.beginPath(); ctx.arc(s.x, s.z, r * 1.7, 0, Math.PI * 2); ctx.fill();
    // facing arrow
    ctx.fillStyle = '#7fe3ff';
    ctx.beginPath();
    ctx.moveTo(s.x + Math.cos(fa) * r * 2.1, s.z + Math.sin(fa) * r * 2.1);
    ctx.lineTo(s.x + Math.cos(fa + 0.4) * r * 1.3, s.z + Math.sin(fa + 0.4) * r * 1.3);
    ctx.lineTo(s.x + Math.cos(fa - 0.4) * r * 1.3, s.z + Math.sin(fa - 0.4) * r * 1.3);
    ctx.closePath();
    ctx.fill();
    // star
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr2 = k % 2 ? r * 0.45 : r;
      ctx.lineTo(s.x + Math.cos(a) * rr2, s.z + Math.sin(a) * rr2);
    }
    ctx.closePath();
    ctx.fillStyle = SPAWN_MARKER.color;
    ctx.fill();
    ctx.strokeStyle = selected ? GOLD : '#0b2a36';
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();
    ctx.restore();
  }

  /** Selection / highlight outline around an object. */
  _outline(ctx, o, u, color, strong = false) {
    const def = OBJECT_TYPES[o.type];
    if (!def) return;
    ctx.save();
    ctx.lineJoin = 'round';
    const pass = (col, w) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w * u;
      if (def.placement === 'line') {
        const half = o.type === 'bridge' ? (o.opts?.width ?? 2) / 2 + 0.15 : 0.3;
        const ang = Math.atan2(o.z1 - o.z0, o.x1 - o.x0);
        const len = Math.hypot(o.x1 - o.x0, o.z1 - o.z0);
        ctx.save();
        ctx.translate(o.x0, o.z0);
        ctx.rotate(ang);
        rr(ctx, -0.25, -half, len + 0.5, half * 2, Math.min(half, 0.3));
        ctx.stroke();
        ctx.restore();
      } else if (o.type === 'tree') {
        ctx.beginPath(); ctx.arc(o.x, o.z, treeRadius(o) + 0.12, 0, Math.PI * 2); ctx.stroke();
      } else if (o.type === 'npc' || (def.placement === 'point' && def.radius < 0.5 && !['bench', 'flowerbox', 'crate', 'barrel'].includes(o.type))) {
        ctx.beginPath(); ctx.arc(o.x, o.z, Math.max(0.5, 10 * u), 0, Math.PI * 2); ctx.stroke();
      } else if (o.type === 'critters') {
        ctx.beginPath(); ctx.arc(o.x, o.z, (o.radius ?? 2.5) + 0.1, 0, Math.PI * 2); ctx.stroke();
      } else if (o.type === 'waystone') {
        ctx.beginPath(); ctx.arc(o.x, o.z, 0.75, 0, Math.PI * 2); ctx.stroke();
      } else if (o.type === 'enemy') {
        const arena = bossArena(o);
        if (!arena) { ctx.beginPath(); ctx.arc(o.x, o.z, (Number(o.radius) || 3) + 0.1, 0, Math.PI * 2); ctx.stroke(); }
        if (arena) { rr(ctx, arena.minX - 0.1, arena.minZ - 0.1, arena.maxX - arena.minX + 0.2, arena.maxZ - arena.minZ + 0.2, 0.12); ctx.stroke(); }
      } else if (['house', 'marketStall', 'bench', 'flowerbox', 'crate', 'crateStack', 'barrel', 'signpost', 'chest'].includes(o.type) || def.interior) {
        const r = footRect(o);
        ctx.save();
        ctx.translate(o.x, o.z);
        ctx.rotate(-(o.rotation ?? 0));
        rr(ctx, r.minX - 0.15, r.minZ - 0.15, r.maxX - r.minX + 0.3, r.maxZ - r.minZ + 0.3, 0.15);
        ctx.stroke();
        ctx.restore();
      } else {
        const b = objectBounds(o);
        const p = AREA_TYPES.has(o.type) ? 0.05 : 0.12;
        rr(ctx, b.minX - p, b.minZ - p, b.maxX - b.minX + p * 2, b.maxZ - b.minZ + p * 2, 0.12);
        ctx.stroke();
      }
    };
    if (strong) pass('rgba(10,8,4,0.75)', 4.5);
    pass(color, strong ? 2 : 1.6);
    ctx.restore();
  }

  _drawPreview(ctx, p, u, labels, now) {
    if (p.cells?.length) {
      ctx.fillStyle = p.cellColor ?? 'rgba(201,164,92,0.4)';
      ctx.beginPath();
      for (const c of p.cells) ctx.rect(c.i, c.j, 1, 1);
      ctx.fill();
      if (p.cells.length <= 400) {
        // outline of the footprint
        const set = new Set(p.cells.map((c) => `${c.i},${c.j}`));
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.5 * u;
        ctx.beginPath();
        for (const c of p.cells) {
          if (!set.has(`${c.i},${c.j - 1}`)) { ctx.moveTo(c.i, c.j); ctx.lineTo(c.i + 1, c.j); }
          if (!set.has(`${c.i},${c.j + 1}`)) { ctx.moveTo(c.i, c.j + 1); ctx.lineTo(c.i + 1, c.j + 1); }
          if (!set.has(`${c.i - 1},${c.j}`)) { ctx.moveTo(c.i, c.j); ctx.lineTo(c.i, c.j + 1); }
          if (!set.has(`${c.i + 1},${c.j}`)) { ctx.moveTo(c.i + 1, c.j); ctx.lineTo(c.i + 1, c.j + 1); }
        }
        ctx.stroke();
      }
    }
    if (p.rect) {
      const r = p.rect;
      ctx.fillStyle = 'rgba(201,164,92,0.10)';
      ctx.fillRect(r.minX, r.minZ, r.maxX - r.minX, r.maxZ - r.minZ);
      ctx.setLineDash([5 * u, 4 * u]);
      ctx.lineDashOffset = -(now / 60) * u;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(r.minX, r.minZ, r.maxX - r.minX, r.maxZ - r.minZ);
      ctx.setLineDash([]);
    }
    if (p.ghost && OBJECT_TYPES[p.ghost.type]) {
      this._drawObject(ctx, p.ghost, u, [], 0.62);
      this._outline(ctx, p.ghost, u, 'rgba(255,255,255,0.7)');
    }
    if (p.line) {
      const l = p.line;
      ctx.setLineDash([6 * u, 4 * u]);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath(); ctx.moveTo(l.x0, l.z0); ctx.lineTo(l.x1, l.z1); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff8e6';
      for (const [x, z] of [[l.x0, l.z0], [l.x1, l.z1]]) { ctx.beginPath(); ctx.arc(x, z, 3.5 * u, 0, Math.PI * 2); ctx.fill(); }
    }
    if (p.spawn) this._drawSpawn(ctx, p.spawn, u, 0.6);
    if (p.highlight?.ids?.length) {
      for (const id of p.highlight.ids) {
        const o = this.state.getObject(id);
        if (o) this._outline(ctx, o, u, p.highlight.color ?? '#fff');
      }
    }
  }

  _drawLabels(ctx, labels) {
    const sc = this.scale;
    const placed = []; // screen boxes of the region tags drawn so far
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of labels) {
      const p = this.worldToScreen(l.x, l.z);
      if (p.x < -200 || p.y < -50 || p.x > this.width + 200 || p.y > this.height + 50) continue;
      if (l.kind === 'glyph') {
        if (sc < 7) continue;
        const size = l.badge ? clamp(sc * 0.55, 11, l.size ?? 15) : clamp(l.size ?? 14, 9, 24);
        if (l.badge) {
          ctx.fillStyle = 'rgba(10,14,28,0.78)';
          ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.72, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = rgba(normHex(l.color ?? '#ffffff'), 0.9);
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.fillStyle = l.color ?? '#fff';
        } else ctx.fillStyle = l.color ?? '#fff';
        ctx.font = `${Math.round(size)}px "Segoe UI Symbol", "Noto Sans Symbols 2", system-ui, sans-serif`;
        ctx.fillText(l.text, p.x, p.y + 0.5);
      } else if (l.kind === 'region') {
        const text = l.sub ? `${l.text} · ${l.sub}` : l.text;
        ctx.font = uiFont('600 11px');
        ctx.textAlign = 'left';
        const w = ctx.measureText(text).width;
        // regions sharing a corner / edge: stack the tags instead of drawing them on top of
        // each other
        let y0 = p.y + 3;
        for (let guard = 0; guard < 8; guard++) {
          const hit = placed.find((b) => p.x + 3 < b.x1 && p.x + 15 + w > b.x0 && y0 < b.y1 && y0 + 18 > b.y0);
          if (!hit) break;
          y0 = hit.y1 + 2;
        }
        placed.push({ x0: p.x + 3, x1: p.x + 15 + w, y0, y1: y0 + 18 });
        ctx.fillStyle = 'rgba(10,14,28,0.82)';
        rr(ctx, p.x + 3, y0, w + 12, 18, 4); ctx.fill();
        ctx.fillStyle = l.color ?? GOLD;
        ctx.fillText(text, p.x + 9, y0 + 9.5);
        ctx.textAlign = 'center';
      } else if (l.kind === 'corner') {
        ctx.font = uiFont('600 10px');
        ctx.textAlign = 'left';
        const w = ctx.measureText(l.text).width;
        ctx.fillStyle = 'rgba(10,14,28,0.78)';
        rr(ctx, p.x + 3, p.y + 3, w + 10, 15, 4); ctx.fill();
        ctx.fillStyle = rgba(normHex(l.color), 0.95);
        ctx.fillText(l.text, p.x + 8, p.y + 11);
        ctx.textAlign = 'center';
      } else {
        const small = l.kind === 'small';
        ctx.font = small ? uiFont('10px') : uiFont('600 11px');
        const w = ctx.measureText(l.text).width;
        const y = l.kind === 'npc' ? p.y + 14 : small ? p.y + 10 : p.y;
        ctx.fillStyle = 'rgba(10,14,28,0.78)';
        rr(ctx, p.x - w / 2 - 5, y - 8, w + 10, 16, 4); ctx.fill();
        ctx.fillStyle = small ? (l.color ?? '#cfd6ea') : '#f3ead2';
        ctx.fillText(l.text, p.x, y + 0.5);
      }
    }
  }

  _tooltip(ctx, x, y, text) {
    ctx.font = uiFont('600 12px');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 16;
    let tx = x + 16;
    let ty = y + 22;
    if (tx + w > this.width - 4) tx = x - w - 10;
    if (ty + 22 > this.height - 4) ty = y - 30;
    ctx.fillStyle = 'rgba(8,11,22,0.9)';
    rr(ctx, tx, ty, w, 22, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(201,164,92,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#efe6cf';
    ctx.fillText(text, tx + 8, ty + 11.5);
  }
}

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * A canvas font for the map's tags and tooltip (`spec`: weight and size): the system UI face, with
 * a CJK face first while the editor shows Chinese (the tag heights fit either).
 * @param {string} spec e.g. '600 11px'
 */
function uiFont(spec) {
  return editorLang() === 'zh' ? `${spec} "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif` : `${spec} system-ui, sans-serif`;
}

function union(a, b) {
  return { minI: Math.min(a.minI, b.minI), maxI: Math.max(a.maxI, b.maxI), minJ: Math.min(a.minJ, b.minJ), maxJ: Math.max(a.maxJ, b.maxJ) };
}

function normHex(c) {
  if (typeof c === 'number') return `#${c.toString(16).padStart(6, '0')}`;
  const s = String(c ?? '#ffffff');
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return /^#[0-9a-f]{6}$/i.test(s) ? s : '#ffffff';
}

/**
 * Stroke the current path as a dashed line over a soft dark halo, so marker outlines stay
 * readable on any terrain. `dash` and `width` are in CSS pixels (u = one pixel in world units).
 */
function haloDash(ctx, u, color, dash, width = 1.4, haloAlpha = 0.45) {
  ctx.setLineDash([]);
  ctx.strokeStyle = `rgba(6,8,16,${haloAlpha})`;
  ctx.lineWidth = (width + 2) * u;
  ctx.stroke();
  ctx.setLineDash(dash.map((d) => d * u));
  ctx.strokeStyle = color;
  ctx.lineWidth = width * u;
  ctx.stroke();
  ctx.setLineDash([]);
}

function rr(ctx, x, y, w, hgt, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, hgt, r);
  else ctx.rect(x, y, w, hgt);
}

/**
 * World bounds an object draws in (objectBounds, plus an enemy group's boss arena, scatter
 * `area` and exact `spotOffsets`).
 */
function drawBounds(o) {
  const b = objectBounds(o);
  if (o.type !== 'enemy') return b;
  const grow = (minX, maxX, minZ, maxZ) => {
    b.minX = Math.min(b.minX, minX); b.maxX = Math.max(b.maxX, maxX);
    b.minZ = Math.min(b.minZ, minZ); b.maxZ = Math.max(b.maxZ, maxZ);
  };
  const a = bossArena(o);
  if (a) grow(a.minX, a.maxX, a.minZ, a.maxZ);
  const r = o.area;
  if (r && ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => Number.isFinite(r[k]))) grow(o.x + r.minX, o.x + r.maxX, o.z + r.minZ, o.z + r.maxZ);
  for (const p of Array.isArray(o.spotOffsets) ? o.spotOffsets : []) {
    if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) grow(o.x + p[0], o.x + p[0], o.z + p[1], o.z + p[1]);
  }
  return b;
}

/**
 * The tag of a story event: its trigger and prompt ("! use · Read"; "! enter").
 * @param {Record<string, any>} o an `event` object
 */
export function eventTag(o) {
  const on = typeof o.on === 'string' && o.on ? o.on : 'use';
  const label = typeof o.label === 'string' ? o.label.trim() : '';
  return `! ${eventTriggerWord(on)}${label ? ` · ${label}` : ''}${isBackgroundEvent(o) ? tr('tools.map.background') : ''}`;
}

/** The triggers with a short display word ('tools.map.on.*'; another value shows as it is). */
const EVENT_ON_WORDS = new Set(['use', 'enter', 'leave', 'arrive', 'change', 'time', 'cleared']);

/**
 * A story event's trigger (`on`) as the short word of its tag: the value itself in English.
 * @param {string} on
 */
export function eventTriggerWord(on) {
  return EVENT_ON_WORDS.has(on) ? tr(`tools.map.on.${on}`) : on;
}

/**
 * Does a story event run in the background (its optional `background: true`: it runs without
 * holding the player)? Drawn with a dotted outline and "(background)" after its tag.
 * @param {object} o
 */
export function isBackgroundEvent(o) {
  return /** @type {{ background?: unknown }} */ (o)?.background === true;
}

/** What a story event waits for, for its tag's second part (zoomed in): condition, hour, group. */
function eventSub(o) {
  const parts = [];
  if (typeof o.if === 'string' && o.if.trim()) parts.push(tr('tools.map.if', { cond: o.if.trim() }));
  if (o.on === 'time' && Number.isFinite(o.at)) parts.push(tr('tools.map.at', { hour: o.at }));
  if (o.on === 'cleared' && typeof o.group === 'string' && o.group) parts.push(o.group);
  if (o.once) parts.push(tr('tools.map.once'));
  return parts.join(' · ');
}

/** Canopy radius of a tree (world units). */
function treeRadius(o) {
  const hgt = o.opts?.height ?? 4.5;
  const r = clamp(hgt * 0.3, 0.7, 2.4);
  return o.opts?.kind === 'pine' ? r * 0.78 : o.opts?.kind === 'birch' ? r * 0.85 : r;
}

/** Is (x, z) within `tol` of a point object's rotated footprint? */
function inFootprint(o, x, z, tol) {
  const r = -(o.rotation ?? 0);
  const dx = x - o.x;
  const dz = z - o.z;
  const lx = dx * Math.cos(r) + dz * Math.sin(r);
  const lz = -dx * Math.sin(r) + dz * Math.cos(r);
  const f = footRect(o);
  return lx >= f.minX - tol && lx <= f.maxX + tol && lz >= f.minZ - tol && lz <= f.maxZ + tol;
}

/**
 * A point object's footprint in its own frame (x across, z front to back): the interior furniture's
 * `interiorFootprint` (not always centred: a wall window lies in front of its wall line), else the
 * centred `footprint`. @param {LevelObject} o
 */
function footRect(o) {
  const f = interiorFootprint(o);
  if (f) return f;
  const [hw, hd] = footprint(o);
  return { minX: -hw, maxX: hw, minZ: -hd, maxZ: hd };
}

/**
 * Sketch of an interior piece seen from above, in its own frame (the context is translated to it
 * and turned by its rotation; local +Z, the front, points down the map at rotation 0).
 * @param {CanvasRenderingContext2D} ctx @param {LevelObject} o
 * @param {{ color: string }} def @param {number} u one screen pixel in world units
 */
function drawInterior(ctx, o, def, u) {
  const f = footRect(o);
  // (the options as the builders read them: a plain object, numbers clamped by optNum — a file's
  // `steps: 1e9` must not draw a billion treads)
  const op = /** @type {Record<string, any>} */ (o.opts && typeof o.opts === 'object' && !Array.isArray(o.opts) ? o.opts : {});
  const w = f.maxX - f.minX;
  const d = f.maxZ - f.minZ;
  const line = (col, lw = 1) => { ctx.strokeStyle = col; ctx.lineWidth = lw * u; };
  const wood = '#9a6a3c';
  const dark = 'rgba(30,18,8,0.85)';
  if (o.type === 'rug') {
    ctx.fillStyle = ownValue(FURNITURE_COLORS, op.color) ?? FURNITURE_COLORS.red;
    ctx.fillRect(f.minX, f.minZ + 0.15, w, d - 0.3);
    line('#e0b54a', 2);
    ctx.strokeRect(f.minX + 0.12, f.minZ + 0.27, w - 0.24, d - 0.54);
    ctx.fillStyle = '#efe6d2';
    ctx.fillRect(f.minX + 0.06, f.minZ, w - 0.12, 0.15);
    ctx.fillRect(f.minX + 0.06, f.maxZ - 0.15, w - 0.12, 0.15);
    return;
  }
  if (o.type === 'wallWindow') {
    ctx.fillStyle = '#bfe0f2';
    ctx.fillRect(f.minX + 0.5, f.minZ, w - 1, 0.16);
    line(dark, 1.2);
    ctx.strokeRect(f.minX + 0.5, f.minZ, w - 1, 0.16);
    if (op.curtains !== 'none') {
      ctx.fillStyle = op.curtains === 'linen' ? '#efe6d2' : '#b83a3a';
      ctx.fillRect(f.minX + 0.1, f.minZ, 0.36, 0.22);
      ctx.fillRect(f.maxX - 0.46, f.minZ, 0.36, 0.22);
    }
    if (op.beam !== false) {
      ctx.fillStyle = 'rgba(255,240,200,0.18)';
      ctx.fillRect(f.minX + 0.5, f.minZ + 0.3, w - 1, optNum(op.sill, 0.9, 0.3, 2) + 1.5);
    }
    return;
  }
  // a drop shadow, then the piece
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  const round = o.type === 'sacks' || o.type === 'chair' && op.style === 'stool' || o.type === 'table' && op.shape === 'round';
  if (round && o.type !== 'sacks') { ctx.beginPath(); ctx.arc(0.08, 0.12, f.maxX, 0, Math.PI * 2); ctx.fill(); }
  else if (!round) ctx.fillRect(f.minX + 0.08, f.minZ + 0.12, w, d);
  if (o.type === 'sacks') {
    const count = Math.round(optNum(op.count, 3, 1, 4));
    const n = Math.min(3, count);
    for (let k = 0; k < n; k++) {
      const sx = (k - (n - 1) / 2) * 0.52;
      ctx.fillStyle = '#d8c49c';
      ctx.beginPath(); ctx.ellipse(sx, 0, 0.27, 0.2, 0, 0, Math.PI * 2); ctx.fill();
      line(dark, 1); ctx.stroke();
    }
    if (count >= 4) { ctx.fillStyle = '#c4ad86'; ctx.fillRect(-0.4, -0.14, 0.8, 0.28); line(dark, 1); ctx.strokeRect(-0.4, -0.14, 0.8, 0.28); }
    return;
  }
  if (round) {
    ctx.fillStyle = op.cloth === true ? '#efe6d2' : wood;
    ctx.beginPath(); ctx.arc(0, 0, f.maxX, 0, Math.PI * 2); ctx.fill();
    line(dark, 1.2); ctx.stroke();
    return;
  }
  ctx.fillStyle = o.type === 'hearth' ? '#8a8790' : o.type === 'shelf' || o.type === 'wardrobe' ? '#7a4f2e' : wood;
  ctx.fillRect(f.minX, f.minZ, w, d);
  if (o.type === 'bed') {
    ctx.fillStyle = ownValue(FURNITURE_COLORS, op.blanket) ?? FURNITURE_COLORS.red;
    ctx.fillRect(f.minX + 0.08, f.minZ + 0.7, w - 0.16, d - 0.8);
    ctx.fillStyle = '#efe6d2';
    const two = optNum(op.width, 1.2, 0.8, 2.4) >= 1.6;
    for (const px of two ? [-0.25, 0.25] : [0]) ctx.fillRect(px * w - (two ? 0.18 * w : 0.3 * w), f.minZ + 0.18, two ? 0.36 * w : 0.6 * w, 0.4);
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(f.minX, f.minZ, w, 0.12);
  } else if (o.type === 'table') {
    if (op.cloth === true) { ctx.fillStyle = '#efe6d2'; ctx.fillRect(f.minX + 0.04, f.minZ + 0.04, w - 0.08, d - 0.08); }
  } else if (o.type === 'chair') {
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(f.minX, f.minZ, w, 0.1);
  } else if (o.type === 'shelf') {
    const cols = ['#bf3b3b', '#3d5fb4', '#468a45', '#d9a92e', '#77428f'];
    const k = op.kind === 'pantry' ? 0.24 : 0.12;
    for (let i = 0, x = f.minX + 0.1; x < f.maxX - 0.1; i++, x += k) { ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(x, f.maxZ - 0.2, k * 0.7, 0.14); }
  } else if (o.type === 'hearth') {
    ctx.fillStyle = '#5a5660';
    ctx.fillRect(f.minX + 0.15, f.maxZ - 0.3, w - 0.3, 0.3);
    ctx.fillStyle = op.lit === false ? '#2a2628' : '#ff8a3a';
    ctx.fillRect(-w * 0.2, f.minZ + 0.25, w * 0.4, 0.35);
  } else if (o.type === 'counter') {
    ctx.fillStyle = '#5c3a22';
    ctx.fillRect(f.minX, f.maxZ - 0.1, w, 0.1);
  } else if (o.type === 'wardrobe') {
    line(dark, 1);
    ctx.beginPath();
    if (op.kind === 'drawers') { ctx.moveTo(f.minX, f.maxZ - 0.12); ctx.lineTo(f.maxX, f.maxZ - 0.12); }
    else { ctx.moveTo(0, f.minZ); ctx.lineTo(0, f.maxZ); }
    ctx.stroke();
  } else if (o.type === 'staircase') {
    const down = op.dir === 'down';
    const n = Math.round(optNum(op.steps, 7, 3, 14));
    if (down) {
      // treads fading into the well (the open end toward +Z)
      for (let k = 0; k < n; k++) {
        const t = k / n;
        ctx.fillStyle = shade('#9a6a3c', -0.85 * t);
        ctx.fillRect(f.minX + 0.12, f.maxZ - (k + 1) * (d - 0.1) / n, w - 0.24, (d - 0.1) / n - 0.03);
      }
    } else {
      // steps rising toward +X (flip: −X), the low end lighter
      const s = op.flip === true ? -1 : 1;
      for (let k = 0; k < n; k++) {
        ctx.fillStyle = shade('#c49358', -0.5 * (1 - k / n));
        const x0 = s > 0 ? f.minX + (k * w) / n : f.maxX - ((k + 1) * w) / n;
        ctx.fillRect(x0, f.minZ, w / n - 0.03, d);
      }
    }
  }
  line(dark, 1.2);
  ctx.strokeRect(f.minX, f.minZ, w, d);
}

/** Unrotated half extents of a point object's footprint. @param {LevelObject} o */
function footprint(o) {
  const def = OBJECT_TYPES[o.type];
  switch (o.type) {
    case 'house': return [(o.opts?.width ?? 4) / 2 + 0.35, (o.opts?.depth ?? 3) / 2 + 0.35];
    case 'marketStall': return [(o.opts?.width ?? 3) / 2 + 0.2, 0.9];
    case 'bench': return [(o.opts?.length ?? 1.8) / 2, 0.35];
    case 'flowerbox': return [(o.opts?.length ?? 1.2) / 2, 0.25];
    case 'crate': { const s = (o.opts?.size ?? 0.9) / 2; return [s, s]; }
    case 'barrel': return o.opts?.lying ? [0.55 * (o.opts?.height ?? 1), 0.38] : [0.42, 0.42];
    case 'signpost': return [0.45, 0.12];
    case 'chest': return [0.45, 0.3];
    default: return [def.radius, def.radius];
  }
}

/** Most common height level among walkable, non-water tiles (the "ground" reference). */
function modeLevel(L) {
  const counts = new Map();
  for (let j = 0; j < L.depth; j++) {
    const t = L.tiles[j];
    const h = L.heights[j];
    for (let i = 0; i < L.width; i++) {
      const d = L.legend[t[i]];
      if (!d || d.water || d.void || d.walkable === false) continue;
      const v = parseInt(h[i], 36);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  let best = 2;
  let n = -1;
  for (const [v, c] of counts) if (c > n) { best = v; n = c; }
  return best;
}

function drawStairs(g, x, y, dir) {
  const ang = ownValue(STAIR_ANGLE, dir) ?? 0;
  g.save();
  g.translate(x + TP / 2, y + TP / 2);
  g.rotate(ang);
  // treads: lighter toward the high (north in local space) edge
  for (let k = 0; k < 4; k++) {
    g.fillStyle = `rgba(255,248,230,${0.05 + k * 0.06})`;
    g.fillRect(-TP / 2, TP / 2 - (k + 1) * 4, TP, 4);
    g.fillStyle = 'rgba(20,14,10,0.45)';
    g.fillRect(-TP / 2, TP / 2 - (k + 1) * 4, TP, 1);
  }
  // chevron
  g.strokeStyle = 'rgba(20,14,10,0.8)';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath(); g.moveTo(-3.5, 2); g.lineTo(0, -2.5); g.lineTo(3.5, 2); g.stroke();
  g.strokeStyle = '#fff6dc';
  g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(-3.5, 2); g.lineTo(0, -2.5); g.lineTo(3.5, 2); g.stroke();
  g.restore();
}

/** A 64 px transparent tile of soft light ripples, used as the water shimmer pattern. */
function makeShimmerTile() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  for (let k = 0; k < 14; k++) {
    const x = hash2(k, 1, 17) * 64;
    const y = hash2(k, 2, 17) * 64;
    const len = 6 + hash2(k, 3, 17) * 12;
    g.strokeStyle = `rgba(235,248,255,${0.45 + hash2(k, 4, 17) * 0.5})`;
    g.lineWidth = 1 + hash2(k, 5, 17);
    for (const [ox, oy] of [[0, 0], [-64, 0], [0, -64], [-64, -64]]) {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.quadraticCurveTo(x + ox + len / 2, y + oy - 2.5, x + ox + len, y + oy);
      g.stroke();
    }
  }
  return c;
}
