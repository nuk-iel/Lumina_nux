import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { Engine } from '../../engine/core/Engine.js';
import { LightingSystem, DEFAULT_KEYFRAMES } from '../../engine/lighting/LightingSystem.js';
import { PostFX } from '../../engine/render/PostFX.js';
import { Particles } from '../../engine/fx/Particles.js';
import { GodRays } from '../../engine/fx/GodRays.js';
import { objectBounds, critterYard } from '../../engine/level/ObjectCatalog.js';
import { LevelObjectBuilder } from '../../engine/level/ObjectBuilder.js';
import { clamp, DEG2RAD } from '../../engine/utils/math.js';
import * as GAME from '../../game/config.js';
import {
  weatherName, settledWeather, settledSnowCover, precipitationEmitter, precipitationIntensity, applyWeatherLighting,
  applyWeatherWind, applyWeatherGrade, applyOvercast, applyLampDayGlow, applyEmissiveDay, glassLevel, areaEmitterIntensity,
  NIGHT_DESATURATION, godRayHourLevel, nightWaterLevels,
} from '../../game/WeatherLook.js';
import { snowCover } from '../../game/SnowCover.js';
import { DUST_BOX, godRayLayout, cameraFraming, shownWeather, backdropColor } from '../../game/LevelLook.js';
import { EditorCamera } from './EditorCamera.js';
import { LevelSurface, TerrainPicker } from './Picking.js';
import { TerrainPreview } from './TerrainPreview.js';
import { ObjectPreview } from './ObjectPreview.js';
import { ActorPreview } from './ActorPreview.js';
import { Overlays } from './Overlays.js';
import { GhostPreview } from './Ghost.js';
import { GizmoKit, COLORS, parseCss, fatSegments, thinSegments, pointsObject, fillMesh } from './Gizmos.js';
import { SelectionOutline } from './Outline.js';
import { SceneryPreview } from './SceneryPreview.js';
import { FoliagePreview } from './FoliagePreview.js';
import { LabelLayer, ensureStyles } from './Labels.js';
import { dataColliders, levelStartTest, enemyScatterRect } from '../enemyGroups.js';
import { storyHiddenIds } from '../story.js';
import { reportToolError } from '../EditorState.js';
import { tr } from '../i18n.js';

/**
 * @import { MaterialProperties } from './types.js'
 * @import { ShaderQuad } from './Outline.js'
 * @import { PropResult } from '../../engine/world/Props.js'
 * @import { TileMap } from '../../engine/world/TileMap.js'
 * @import { PointerEv, Tool } from '../tools/index.js'
 * @import * as ToolRegistry from '../tools/index.js'
 * @import { GroundSampler } from '../../engine/level/ObjectBuilder.js'
 * @import { EditorState } from '../EditorState.js'
 * @import { TextureLibrary } from '../../engine/pixel/Textures.js'
 * @import { Level, LevelObject, LevelObjectOf, LevelEnvironment, TileRect } from '../../engine/level/types.js'
 * @import { SceneNode } from '../../engine/render/types.js'
 */

/** The tool registry, when it exists (docs/contracts/LEVEL_EDITOR.md §7). A glob so a missing file is fine. */
const TOOL_MODULES = import.meta.glob('../tools/index.js');

/**
 * Mesh work scheduling (docs/contracts/LEVEL_EDITOR.md §9). Edits update the level data at once (picking,
 * tools and overlays follow immediately); the meshes follow through a job queue:
 *  - during a stroke / drag (an open transaction) at most ONE rebuild runs per frame: the terrain
 *    chunk nearest the brush, else the water (in place, at most every STROKE_WATER_MS), else one
 *    queued prop build — props on moved ground and dragged props are only translated meanwhile;
 *  - otherwise the queues drain within FRAME_BUDGET_MS per frame (at least one job);
 *  - once editing pauses (IDLE_MS) the exact prop rebuilds are done, props are re-batched per
 *    chunk, a big level's terrain chunks are merged per cell (TerrainPreview.stepBatches), and the
 *    scenery / foliage rebuild in time slices.
 */
const STROKE_WATER_MS = 90;
/** During strokes a terrain chunk is re-baked at most this often (the brush keeps dirtying it). */
const STROKE_CHUNK_MS = 45;
/** During strokes a chunk re-bake runs in row slices of about this many ms per frame. */
const STROKE_SLICE_MS = 3.5;
/** …and when the smoothed frame CPU time is above HEAVY_FRAME_MS (very big levels). */
const STROKE_SLICE_MS_HEAVY = 1.5;
const HEAVY_FRAME_MS = 11;
/** …and above this the preview renders at half rate during strokes (see `_render`). */
const OVER_BUDGET_MS = 14.5;
/** Selections of more objects get no silhouette outline (the box-select highlight stops there too). */
const MAX_OUTLINED = 120;
/** Placeholder geometry of the shadow-program proxies once compiled (see _compileShadowFor). */
const EMPTY_GEOMETRY = new THREE.BufferGeometry();
/** During strokes markers / actors on changed terrain are re-draped at most this often. */
const STROKE_ACTORS_MS = 120;
/**
 * Placement grid (props' colliders / walk rects for the critter and enemy start tests): cell size
 * in world units, and the cell index range ±PLACE_OFF kept (±512 u: levels are ≤ 128 tiles, and
 * the test never looks outside the map).
 */
const PLACE_CELL = 4;
const PLACE_OFF = 128;
const PLACE_SPAN = 2 * PLACE_OFF + 1;
/**
 * The level-data enemy / critter start test (this view hidden, see enemyStartTest): props whose
 * catalog bounds lie within this many units of a group's scatter rect lend it their colliders (a
 * collider may reach past the catalog bounds — a big rock's leaning boulder, a house's wall).
 */
const PROP_REACH = 4;
/** Prop types without TileMap colliders of their own there (lights, waterfalls) or with data-fixed ones (dataColliders). */
const NO_PROP_COLLIDERS = new Set(['light', 'waterfall', 'chest', 'waystone']);
/**
 * Ground for a build made for its colliders alone (they do not depend on heights), used before
 * the terrain exists; the builder reads these three members only.
 * @type {GroundSampler}
 */
const FLAT_GROUND = { getHeight: () => 0, getWaterSurface: () => null, tileAt: () => null };
const FRAME_BUDGET_MS = 9;
const IDLE_MS = 250;
/** Fog amount of the editing view (FogExp2 density × camera distance). */
const EDIT_FOG = 0.2;
/** The preview's own grade (PostFX on): the weather's offsets add to it (WeatherLook.applyWeatherGrade). */
const EDIT_GRADE = { exposure: 1.03, contrast: 1.04, saturation: 1.26, temperature: 0.04, vignette: 0.45, grain: 0.02, shadowsTint: [-0.04, 0.05, 0.15] };
/** The game's 24 h palette: the engine keyframes with the game's overrides (src/game/config.js). */
const KEYFRAMES = DEFAULT_KEYFRAMES.map((k) => ({ ...k, ...(GAME.KEYFRAME_OVERRIDES?.[k.name] ?? {}) }));
const FLY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']);
/** PointerEvent.button → PointerEvent.buttons bit. */
const BUTTON_BIT = [1, 4, 2];
/** Pointer positions beyond the map are clamped to this many tiles around it. */
const OFF_MAP_MARGIN = 24;

const DEPTH_COPY = {
  uniforms: { tDepth: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDepth;
    varying vec2 vUv;
    void main() { gl_FragDepth = texture2D( tDepth, vUv ).x; gl_FragColor = vec4( 0.0 ); }`,
};

const _ndc = new THREE.Vector2();
const _ray = new THREE.Ray();
const _v = new THREE.Vector3();
const _plane = new THREE.Plane();
const nextTick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Viewport3D — the level editor's live 2.5D diorama view (docs/contracts/LEVEL_EDITOR.md §6).
 *
 * Renders the level being edited with the real engine (TileMap terrain + water, every prop built
 * by LevelObjectBuilder, character / creature sprites, day-night lighting with the game's point-light
 * pool — the engine LightPool, fixed at 12 lights — sky, fog, the level's weather at its settled
 * look (src/game/WeatherLook.js, shared with the game), optional PostFX 2.5D pixel-art look and
 * atmosphere) and keeps it in sync with
 * EditorState incrementally. Pointer input is translated into map coordinates (height-field
 * raycast + object / sprite / marker picking) and forwarded to the active tool; right / middle
 * buttons and the wheel drive the camera. Tool previews, the grid, hover and selection are drawn
 * in a crisp overlay pass.
 *
 * Camera: right-drag orbit · middle-drag or Shift+right-drag pan · wheel zoom toward the cursor ·
 * F / double-click focus · WASD/QE fly & turn while the right button is held · 'game' mode
 * (state.view.cameraMode) = diorama gameplay framing with Q/E rotation.
 */
export class Viewport3D {
  /**
   * @param {HTMLElement} container element the viewport fills
   * @param {EditorState} state
   * @param {{ textures: TextureLibrary,
   *           getTool?: ((id: string) => Tool|null)|null,
   *           maxPixelRatio?: number }} opts
   *   getTool: tool lookup override (default: src/editor/tools/index.js when it exists)
   */
  // @ts-expect-error the `{}` default lacks `textures` on purpose: the constructor throws on it
  constructor(container, state, { textures, getTool = null, maxPixelRatio = 1.25 } = {}) {
    if (!textures) throw new Error('Viewport3D: opts.textures (TextureLibrary) is required');
    ensureStyles();
    this.container = container;
    this.state = state;
    this.textures = textures;
    this._getToolOverride = getTool;
    /** @type {typeof ToolRegistry|null} the tool registry (see _loadTools) */
    this._tools = null;
    this.active = true;
    this._disposed = false;

    // ---- DOM
    this.root = document.createElement('div');
    this.root.className = 'lvp3d-root';
    container.appendChild(this.root);

    // ---- engine (its Input never listens to the page: the editor owns the keyboard)
    this.engine = new Engine({
      container: this.root, maxPixelRatio, inputTarget: new EventTarget(), exposeGlobal: false, clearColor: 0x0d1018,
    });
    const { scene, camera, renderer } = this.engine;
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.canvas = this.engine.canvas;
    this.canvas.style.cursor = 'default';
    this.labels = new LabelLayer(this.root);
    this.badge = document.createElement('div');
    this.badge.className = 'lvp3d-badge';
    this.root.appendChild(this.badge);

    // ---- camera + lighting
    this.cam = new EditorCamera(camera, { game: GAME.CAMERA ? { distance: GAME.CAMERA.distance, pitch: GAME.CAMERA.pitch, fov: GAME.CAMERA.fov, minDistance: GAME.CAMERA.minDistance, maxDistance: GAME.CAMERA.maxDistance } : {} });
    this.lighting = new LightingSystem(this.engine, {
      timeOfDay: state.view.timeOfDay ?? 14, shadowExtent: 26, sunPath: GAME.SUN_PATH, moonPath: GAME.MOON_PATH, keyframes: KEYFRAMES,
    });
    this.lighting.sky.lowerClouds = 0.25;
    this.lighting.paused = true;
    this.lighting.timeSpeed = 0;
    this.lighting.followTarget(this.cam.focus);

    // ---- level views
    this.surface = new LevelSurface(() => this.state.level);
    this.picker = new TerrainPicker(this.surface);
    this.overlayScene = new THREE.Scene();
    this.overlayScene.name = 'Editor:overlay';
    this.kit = new GizmoKit();
    this.terrain = new TerrainPreview({ textures, parent: scene, shadowLights: [this.lighting.sun] });
    this.props = new ObjectPreview({ textures, parent: scene, lighting: this.lighting });
    this.scenery = new SceneryPreview({ parent: scene, textures, factory: this.props.builder.factory });
    this.foliage = new FoliagePreview({ parent: scene });
    this.actors = new ActorPreview({
      scene, overlay: this.overlayScene, surface: this.surface, lighting: this.lighting, kit: this.kit, labels: this.labels,
      // (the enemy sprites' instanced batch compiles a new kind's programs before it draws it)
      compile: (color, shadow) => Promise.all([...color.map((o) => this._compileFor(o)), ...shadow.map((o) => this._compileShadowFor(o))]),
    });
    this.overlays = new Overlays({ overlay: this.overlayScene, surface: this.surface, kit: this.kit, labels: this.labels });
    this.ghost = new GhostPreview({
      scene, overlay: this.overlayScene, builder: this.props.builder, surface: this.surface, kit: this.kit,
      characterSheet: (p, spec) => this.actors._characterSheet(p, spec),
      creatureSheet: (k) => this.actors._creatureSheet(k),
      enemySheet: (k) => this.actors._enemySheet(k),
      compile: (obj) => this._compileFor(obj),
      isCompiled: (m) => this._isCompiled(m),
      compileShadow: (obj) => this._compileShadowFor(obj),
      // (the placed object gets selected: its selection-mask programs compile during the hover)
      compileMask: (obj) => {
        const meshes = [];
        obj.traverse((/** @type {SceneNode} */ o) => { if (o.isMesh && [].concat(o.material).some((m) => m && !this.outline._warm.has(m))) meshes.push(o); });
        return meshes.length ? this._warmOutline(meshes).catch(() => {}) : null;
      },
    });
    this.outline = new SelectionOutline(renderer);
    this.outline.setColors({ select: new THREE.Color(COLORS.select) });
    /** Every light of the scene (the outline mask pass must see the same light set). */
    this._lights = [this.lighting.sun, this.lighting.hemi, ...this.props.lightPool.handles.map((h) => h.light)];
    this._depthQuad = /** @type {ShaderQuad} */ (new FullScreenQuad(new THREE.ShaderMaterial({
      ...DEPTH_COPY, uniforms: THREE.UniformsUtils.clone(DEPTH_COPY.uniforms), depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, colorWrite: false,
    })));

    // ---- optional stacks (created on first use)
    this.postfx = null;
    this._postfxReady = false;
    this.particles = null;
    this.godRays = null;
    this._dust = null;
    /** Rain and snow emitters (atmosphere preview on), both kept, faded by the weather: { rain, snow }. */
    this._precipEmitters = null;
    /** The god-ray layout the shafts were built for (_refreshAtmosphere; null = none built). */
    this._godRayKey = null;
    /** The props' shared lantern-glass material (its colour follows WeatherLook.glassLevel). */
    this._glassMaterial = null;
    /** The level's weather as last applied (WeatherLook name) and its settled state. */
    this._weatherName = null;
    this._weather = settledWeather('clear');
    /** The level's backdrop as last read (`environment.backdrop`) and its colour (null: the sky). */
    this._backdropKey = undefined;
    /** @type {THREE.Color|null} */
    this._backdrop = null;

    /** Live statistics. */
    this.stats = {
      drawCalls: 0, triangles: 0, terrainMs: 0, objects: 0, fps: 0,
      // extras
      cpuMs: 0, lights: 0, lightDescriptors: 0, objectMs: 0, waterMs: 0, sceneryMs: 0, foliageMs: 0, postfx: false,
      pendingChunks: 0, batches: 0, batchMeshes: 0, terrainBatches: 0, terrainBatchMeshes: 0,
    };

    // ---- sync state
    this._dirty = { terrain: true, objects: true, meta: false, selection: true, tool: true, hover: true, finishDrag: false };
    /** Object ids changed since the last sync (change events report them); all = diff everything. */
    this._dirtyIds = new Set();
    this._allObjects = true;
    this._loadPending = false;
    this._lastEditAt = 0;
    this._waterAt = 0;
    this._lastJob = '';
    /** Critter placement test (the game's TileMap walkability + prop colliders / bridge decks). */
    this._walkable = (x, z) => this._isWalkable(x, z);
    /** Enemy placement test (the combat spawn's `standable`: the above, and decks above water). */
    this._standable = (x, z) => this._isStandable(x, z);
    /** The built props' colliders / walk rects in a grid (see _placementGrid). */
    this._pgrid = null;
    /** What the placement test depends on (props / terrain / villager versions), as last reported to `onPlacementChange`. */
    this._placementKey = [-1, -1, -1];
    /** The first full sync is done: the placement test knows every prop. */
    this._placementReady = false;
    /**
     * The level-data enemy start test while this view is hidden (enemyStartTest): bumped on every
     * object change; the tests and collider list of that version; colliders built per object.
     */
    this._objectsVersion = 0;
    this._dataTests = null;
    /** @type {Map<string, { sig: string, colliders: PropResult['colliders'] }>} */
    this._colliderCache = new Map();
    /**
     * Called (by the frame update) when the critter / enemy placement test changed — props with
     * colliders built or removed, villagers moved, terrain edited. The app lets the 2D map re-place
     * its enemy start dots (they use `enemyStartTest`; while this view is hidden they follow the
     * level's own changes).
     * @type {(() => void)|null}
     */
    this.onPlacementChange = null;
    this._wasInTx = false;
    /** What the point-light pool ranks around (the game's World.update view: focus + camera). */
    this._lightView = { focus: this.cam.focus, camera: this.camera };
    this._keys = new Set();
    this._drag = null; // camera drag { mode, pointerId, x, y, moved }
    this._stroke = null; // tool stroke { pointerId, tool, toolId, lastEv }
    this._pointer = null; // last pointer { x, y } (CSS px in the canvas)
    this._hovering = false;
    this._lastEv = null;
    /** Bumped on every terrain edit (overlays draped from the level data re-drape on it). */
    this._terrainDataVersion = 0;
    this._fadeFocus = { depth: 0, range: 0 };

    this._bindState();
    this._bindDom();
    this.engine.addSystem({ name: 'viewport3d', update: (dt) => this._update(dt) }, 0);
    this.engine.setRenderFn((dt) => this._render(dt));
    this.engine.events.on('resize', ({ width, height, pixelRatio }) => {
      this.kit.setResolution(width, height, pixelRatio);
      // until the user moves the camera, keep the whole level framed as the layout changes
      if (!this._cameraTouched && this.terrain.tileMap) this.frameLevel({ instant: true });
    });
    this.kit.setResolution(this.engine.width, this.engine.height, this.engine.pixelRatio);
    // WebGL context loss: three.js re-creates every GPU resource after the restore; buffers,
    // textures and vertex arrays of the lost context are skipped when freed (instead of hundreds
    // of "object does not belong to this context" warnings), and the shader warm-ups run again
    const nextContext = guardContextObjects(renderer.getContext());
    // (a new generation from the loss on: whatever three.js creates for the restored context)
    this.engine.events.on('contextlost', () => nextContext());
    this.engine.events.on('contextrestored', () => {
      this._shadowProxies = null;
      this.outline._warm = new WeakSet();
      this._needWarm = true;
      this._dirty.selection = true;
    });

    /** Resolves after the first full build (terrain, objects, actors) and shader warm-up. */
    this.ready = this._init();
  }

  // ===========================================================================================
  // Public API (contract §6)
  // ===========================================================================================

  /** Re-measure the container (the engine also follows it with a ResizeObserver). */
  resize() {
    if (this._disposed) return;
    // non-forced: a layout event that did not change the size costs nothing (a forced resize
    // re-allocates the drawing buffer)
    this.engine._resize(false);
  }

  /**
   * (addition) While a splitter is dragged: resize the drawing buffer at most every `ms` (the
   * canvas is stretched by CSS in between); 0 ends it and applies the final size at once.
   */
  setResizeThrottle(ms) {
    if (this._disposed) return;
    this.engine.resizeThrottleMs = Math.max(0, ms | 0);
    if (!ms) this.engine._resize(false);
  }

  /** false = stop rendering (hidden layout); true = resume. */
  setActive(active) {
    this.active = !!active;
    if (!this.active && !this._disposed) {
      // hidden mid-gesture: finish it, and drop the hover this view owns (a hidden canvas gets
      // no pointerleave)
      this._endStroke(null, true);
      this._endDrag(null, true);
      this._hovering = false;
      this._pointer = null;
      if (this.state.hover?.view === '3d') this.state.setHover(null);
    }
    this._updateRunning();
  }

  /**
   * Glide the camera to look at (x, z) (ground height from the level).
   * @param {number} x @param {number} z
   * @param {{ distance?: number }} [opts]
   */
  focusOn(x, z, { distance } = {}) {
    this._cameraTouched = true;
    this.cam.lookAt(x, this.surface.surfaceAt(x, z), z, { distance });
  }

  /** Frame the whole level. */
  frameLevel({ instant = false } = {}) {
    const level = this.state.level;
    const S = this.surface;
    const cx = level.width / 2;
    const cz = level.depth / 2;
    const cy = (S.minY + S.maxY) / 2;
    const pitch = this.cam.mode === 'game' ? this.cam.game.pitch : 52;
    const box = new THREE.Box3(new THREE.Vector3(0, S.baseY, 0), new THREE.Vector3(level.width, S.maxY + 1, level.depth));
    const dist = this._fitDistance(new THREE.Vector3(cx, cy, cz), box, pitch, 0.86);
    this.cam.maxDistance = Math.max(160, dist * 2.2);
    this.cam.lookAt(cx, cy, cz, { distance: dist, pitch });
    if (instant) {
      this.cam.snap();
      this.props.lightPool.snap();
    }
  }

  /** Camera distance at which `box` fills `fill` of the view (current yaw, given pitch). */
  _fitDistance(center, box, pitchDeg, fill = 0.86) {
    const cam = this.camera.clone();
    cam.fov = this.cam.mode === 'game' ? this.cam.game.fov : 30;
    cam.aspect = Math.max(0.2, this.engine.aspect);
    cam.far = 5000;
    cam.updateProjectionMatrix();
    const yaw = this.cam.yawTarget;
    const p = pitchDeg * DEG2RAD;
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const fits = (d) => {
      cam.position.set(center.x + Math.sin(yaw) * Math.cos(p) * d, center.y + Math.sin(p) * d, center.z + Math.cos(yaw) * Math.cos(p) * d);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      for (const c of corners) {
        _v.copy(c).project(cam);
        if (_v.z > 1 || Math.abs(_v.x) > fill || Math.abs(_v.y) > fill) return false;
      }
      return true;
    };
    let lo = 2;
    let hi = 2000;
    for (let k = 0; k < 28; k++) {
      const mid = Math.sqrt(lo * hi);
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  /**
   * Focus the selection (or the hovered point): the camera glides to the selection and fits its
   * 3D bounds (built meshes / sprites / marker volumes) into the view at the current angle.
   * @param {string[]} [ids] level object ids ('spawn' = player start); default: the selection
   * @returns {boolean} whether there was something to focus
   */
  focusSelection(ids = this.state.selection) {
    const st = this.state;
    const S = this.surface;
    const box = new THREE.Box3();
    const add = (b) => { if (b && !b.isEmpty()) box.union(b); };
    const ground = (minX, maxX, minZ, maxZ) => {
      const y0 = Math.min(S.surfaceAt(minX, minZ), S.surfaceAt(maxX, maxZ), S.surfaceAt((minX + maxX) / 2, (minZ + maxZ) / 2));
      add(new THREE.Box3(new THREE.Vector3(minX, y0, minZ), new THREE.Vector3(maxX, y0 + 1.2, maxZ)));
    };
    for (const id of ids) {
      if (id === 'spawn') {
        const { x, z } = st.level.spawn;
        ground(x - 0.6, x + 0.6, z - 0.6, z + 0.6);
        add(this.actors.spawn?.box);
        continue;
      }
      const o = st.getObject(id);
      if (!o) continue;
      const b = objectBounds(o);
      ground(b.minX, b.maxX, b.minZ, b.maxZ);
      add(this.props.get(id)?.box);
      const ae = this.actors.get(id);
      add(ae?.box);
      add(ae?.volume);
    }
    if (!box.isEmpty()) {
      const c = box.getCenter(new THREE.Vector3());
      c.y = S.surfaceAt(c.x, c.z);
      const pitch = this.cam.mode === 'game' ? this.cam.game.pitch : this.cam.pitchTarget / DEG2RAD;
      const dist = clamp(this._fitDistance(c, box, pitch, 0.62), 9, 160);
      this.focusOn(c.x, c.z, { distance: dist });
      return true;
    }
    const h = st.hover;
    if (h && Number.isFinite(h.x)) {
      this.focusOn(h.x, h.z, { distance: Math.min(this.cam.distanceTarget, 30) });
      return true;
    }
    return false;
  }

  /** Current camera mode ('edit' | 'game'). */
  get cameraMode() {
    return this.cam.mode;
  }

  /**
   * Translate a client-space point into a PointerEv (terrain tile, world point, picked object).
   * @param {number} clientX @param {number} clientY
   * @param {{ button?: number, buttons?: number, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} [mods]
   * @returns {PointerEv}
   */
  pickAt(clientX, clientY, mods = {}) {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    _ndc.set((px / Math.max(1, rect.width)) * 2 - 1, -(py / Math.max(1, rect.height)) * 2 + 1);
    this.camera.updateMatrixWorld();
    _ray.origin.setFromMatrixPosition(this.camera.matrixWorld);
    _ray.direction.set(_ndc.x, _ndc.y, 0.5).unproject(this.camera).sub(_ray.origin).normalize();
    const hit = this.picker.pick(_ray, {});
    if (hit.face === 'plane' || hit.face === 'none') {
      // beyond the map (grazing rays, the sky): keep points within a sane margin around it so
      // tools never receive far-away coordinates
      const lv = this.state.level;
      const x = clamp(hit.x, -OFF_MAP_MARGIN, lv.width + OFF_MAP_MARGIN);
      const z = clamp(hit.z, -OFF_MAP_MARGIN, lv.depth + OFF_MAP_MARGIN);
      if (x !== hit.x || z !== hit.z) {
        hit.x = x;
        hit.z = z;
        hit.i = Math.floor(x);
        hit.j = Math.floor(z);
      }
    }
    const maxT = hit.face === 'top' || hit.face === 'side' ? hit.t : Infinity;
    let hitObjectId = null;
    let hitSpawn = false;
    let best = Infinity;
    const lab = this.labels.hitTest(px, py, (l) => !!l.id && l.el.classList.contains('region'));
    if (lab) {
      hitObjectId = lab.id;
      best = 0;
    }
    if (!hitObjectId) {
      const a = this.actors.pick(_ray);
      if (a && a.t <= maxT + 0.6) { best = a.t; hitObjectId = a.id; hitSpawn = a.spawn; }
      const p = this.props.pick(_ray, maxT);
      if (p && p.t < best - 0.05) { best = p.t; hitObjectId = p.id; hitSpawn = false; }
      if (!hitObjectId && hit.hit && hit.face !== 'none') {
        const r = this.actors.pickRegionEdge(hit.x, hit.z, clamp(this.cam.distance * 0.006, 0.25, 0.8));
        if (r) hitObjectId = r;
      }
    }
    if (hit.face === 'top' || hit.face === 'side') this.picker.fallbackY = hit.surfaceY;
    // world size of ~7 CSS px at the picked point (handle hit tests, drag thresholds)
    const dist = Math.max(0.5, Math.min(hit.t, 5000));
    const pickRadius = clamp((7 * 2 * dist * Math.tan((this.camera.fov * DEG2RAD) / 2)) / Math.max(1, rect.height), 0.04, 4);
    return {
      i: hit.i, j: hit.j, x: hit.x, z: hit.z, y: hit.y,
      button: mods.button ?? -1, buttons: mods.buttons ?? 0,
      shift: !!mods.shiftKey, ctrl: !!(mods.ctrlKey || mods.metaKey), alt: !!mods.altKey,
      view: '3d', hitObjectId, hitSpawn, onTerrain: hit.face === 'top' || hit.face === 'side',
      face: hit.face, surfaceY: hit.surfaceY, pickRadius, clientX, clientY,
    };
  }

  /** The active tool (or null while the tool registry is unavailable). */
  get tool() {
    return this.getTool(this.state.toolId);
  }

  /**
   * Tool lookup (override → src/editor/tools/index.js → null).
   * @param {string} id
   * @returns {Tool|null}
   */
  getTool(id) {
    try {
      return (this._getToolOverride?.(id) ?? this._tools?.getTool?.(id)) || null;
    } catch {
      return null;
    }
  }

  /** Release everything (engine, builds, sprites, overlays, listeners). */
  dispose() {
    if (this._disposed) return;
    // a stroke in progress ends for its tool (never leave an open transaction behind)
    this._endStroke(null, true);
    this._disposed = true;
    for (const off of this._unsub) off();
    this._unbindDom();
    this.engine.stop();
    this._setAtmosphere(false);
    this.ghost.dispose();
    this.overlays.dispose();
    this.actors.dispose();
    this.scenery.dispose();
    this.foliage.dispose();
    this.props.dispose();
    this.terrain.dispose();
    this.particles?.dispose();
    this.godRays?.dispose();
    this.postfx?.dispose();
    this._depthQuad.material.dispose();
    this._depthQuad.dispose();
    this.outline.dispose();
    this.kit.dispose();
    this.labels.dispose();
    this.lighting.dispose();
    // the scene holds shared TextureLibrary textures: never walk-dispose it
    this.engine.dispose({ disposeScene: false });
    this.overlayScene.clear();
    this.root.remove();
  }

  // ===========================================================================================
  // Init / state wiring
  // ===========================================================================================

  async _init() {
    await nextTick();
    if (this._disposed) return;
    await this._loadTools();
    if (this._disposed) return;
    this._syncAll({ force: true });
    this._applyView(this.state.view, true);
    this.frameLevel({ instant: true });
    this.lighting.update(0);
    try {
      const r = this.renderer;
      this.outline.prepare();
      // (only the materials in the scene now get compiled: those added meanwhile stay cold)
      const warm = this._sceneMaterials();
      const main = r.compileAsync(this.scene, this.camera);
      // the render-target variants too (selection-outline masks, PostFX): selecting something
      // for the first time must not compile a dozen programs in one frame
      const prev = r.getRenderTarget();
      r.setRenderTarget(this.outline.warmTarget);
      const masks = r.compileAsync(this.scene, this.camera);
      r.setRenderTarget(prev);
      await Promise.all([main, masks, this._warmOverlays()]);
      this.outline.markWarm(warm);
      this._dirty.selection = true;
      this._outlineHiKey = null;
    } catch { /* optional warm-up */ }
    if (this._disposed) return;
    this._updateRunning();
  }

  /**
   * Compile every overlay program in the background (the selection lines, handles, fills, the
   * outline composite…): most are first used when something gets selected, which must not stall.
   */
  _warmOverlays() {
    const r = this.renderer;
    const group = new THREE.Group();
    for (const m of this.kit._owned) {
      if (m.isLineMaterial) group.add(fatSegments([0, 0, 0, 0, 0, 0.01], m));
      else if (m.isLineBasicMaterial) group.add(thinSegments([0, 0, 0, 0, 0, 0.01], m));
      else if (m.isPointsMaterial) group.add(pointsObject([0, 0, 0], m));
      else if (m.isMeshBasicMaterial) group.add(fillMesh([0, 0, 0, 0.01, 0, 0, 0, 0, 0.01], m));
    }
    const quads = [this.outline._quad?._mesh, this._depthQuad?._mesh].filter(Boolean);
    const jobs = [r.compileAsync(group, this.camera, this.overlayScene), ...quads.map((q) => r.compileAsync(q, this.camera))];
    return Promise.all(jobs).finally(() => group.traverse((/** @type {SceneNode} */ o) => o.geometry?.dispose()));
  }

  /**
   * Compile the programs `obj` needs for the current render path (the canvas, or the PostFX
   * scene target) in the background. Resolves when they are ready (never rejects).
   */
  _compileFor(obj) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    let p;
    try {
      const post = this._postfxReady && this._view?.postfx;
      r.setRenderTarget(post ? this.postfx.sceneTarget : null);
      p = r.compileAsync(obj, this.camera, this.scene);
    } catch {
      p = Promise.resolve();
    } finally {
      r.setRenderTarget(prev);
    }
    return Promise.resolve(p).catch(() => {});
  }

  /**
   * Compile the shadow-pass (depth) programs the meshes of `root` will need, in the background.
   * three.js creates them in the first shadow render of an object — a synchronous compile of
   * ~50–100 ms when a new kind of prop is placed — and `compileAsync` does not cover them. Each
   * variant (what three's WebGLShadowMap derives from the material: side, map / alpha-test,
   * alpha map, displacement, or the mesh's own customDepthMaterial) is compiled once through a
   * proxy material kept alive for the viewport's lifetime (so the program is never released).
   * @returns {Promise<void>|null} null when every variant is compiled already
   */
  _compileShadowFor(root) {
    const r = this.renderer;
    if (!r.shadowMap.enabled) return null;
    this._shadowProxies ??= new Map(); // variant key → { mesh, ready: Promise }
    const SHADOW_SIDE = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
    const group = new THREE.Group();
    const waits = [];
    root.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine) || !o.castShadow || !o.geometry) return;
      for (const m of [].concat(o.material)) {
        if (!m || !m.visible) continue;
        let dm = o.customDepthMaterial ?? null;
        const own = !dm && !!((m.displacementMap && m.displacementScale !== 0) || (m.alphaMap && m.alphaTest > 0) || (m.map && m.alphaTest > 0) || m.alphaToCoverage);
        const side = m.shadowSide ?? SHADOW_SIDE[m.side];
        const g = o.geometry;
        const attrs = Object.keys(g.attributes).filter((k) => k === 'uv' || k === 'uv1' || k === 'uv2' || k === 'color').sort().join('+');
        const key = dm ? `custom:${dm.uuid}|${attrs}|${!!g.morphAttributes.position}|${o.isInstancedMesh ? 1 : 0}|${o.isSkinnedMesh ? 1 : 0}`
          : `${o.type}|${side}|${own ? `${!!m.map}:${m.map?.channel ?? 0}:${m.alphaTest > 0}:${!!m.alphaMap}:${!!m.displacementMap}:${!!m.alphaToCoverage}` : '-'}|${attrs}|${o.isInstancedMesh ? 1 : 0}|${o.isSkinnedMesh ? 1 : 0}|${!!g.morphAttributes.position}`;
        const hit = this._shadowProxies.get(key);
        if (hit) { if (!hit.done) waits.push(hit.ready); continue; }
        if (!dm) {
          dm = new THREE.MeshDepthMaterial();
          dm.side = side;
          if (own) {
            dm.map = m.map; dm.alphaMap = m.alphaMap; dm.alphaTest = m.alphaToCoverage ? 0.5 : m.alphaTest;
            dm.displacementMap = m.displacementMap; dm.displacementScale = m.displacementScale; dm.displacementBias = m.displacementBias;
          }
        }
        /**
         * @type {new (g: THREE.BufferGeometry, m: THREE.Material, count?: number)
         *   => THREE.Object3D}
         */
        const Proxy = o.isInstancedMesh ? THREE.InstancedMesh : o.isPoints ? THREE.Points : o.isLine ? THREE.Line : THREE.Mesh;
        const proxy = o.isInstancedMesh ? new Proxy(g, dm, 1) : new Proxy(g, dm);
        proxy.frustumCulled = false;
        group.add(proxy);
        const entry = { mesh: proxy, done: false, ready: null };
        this._shadowProxies.set(key, entry);
        entry.pending = true;
      }
    });
    if (!group.children.length) return waits.length ? Promise.all(waits).then(() => {}) : null;
    // the shadow pass renders into a render target (linear output, no tone mapping) with the
    // scene's lights set up but no scene (no fog): the same program parameters as compiling into
    // a mask target with the fog lifted (compileAsync derives them synchronously)
    const prev = r.getRenderTarget();
    const fog = this.scene.fog;
    let p;
    try {
      r.setRenderTarget(this.outline.warmTarget);
      this.scene.fog = null;
      p = r.compileAsync(group, this.lighting.sun.shadow.camera, this.scene);
    } catch {
      p = Promise.resolve();
    } finally {
      this.scene.fog = fog;
      r.setRenderTarget(prev);
    }
    const ready = Promise.resolve(p).catch(() => {}).then(() => {
      for (const e of this._shadowProxies.values()) {
        if (!e.pending || e.ready !== ready) continue;
        e.pending = false;
        e.done = true;
        // (the proxy only keeps its material — and so the program — alive, not the geometry)
        e.mesh.geometry = EMPTY_GEOMETRY;
      }
    });
    for (const e of this._shadowProxies.values()) if (e.pending && !e.ready) e.ready = ready;
    return Promise.all([ready, ...waits]).then(() => {});
  }

  /** The meshes' materials in the scene now, as `{ material }` records for `outline.markWarm`. */
  _sceneMaterials() {
    const set = new Set();
    this.scene.traverse((/** @type {SceneNode} */ o) => { if (o.material) for (const m of [].concat(o.material)) if (m) set.add(m); });
    return [...set].map((material) => ({ material }));
  }

  /** Has `material` a compiled program already (it rendered or was warmed)? */
  _isCompiled(material) {
    try {
      // (three's internal record of the material, typed unknown by @types/three)
      const props = /** @type {MaterialProperties} */ (this.renderer.properties.get(material));
      return !!(props?.programs?.size || props?.currentProgram);
    } catch {
      return false;
    }
  }

  /** Compile the outline-mask programs of some meshes in the background. */
  _warmOutline(meshes) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.outline.warmTarget);
    let p;
    try {
      p = Promise.all(meshes.map((m) => r.compileAsync(m, this.camera, this.scene)));
    } finally {
      r.setRenderTarget(prev);
    }
    return p;
  }

  /**
   * The built props' TileMap colliders and walk rects (bridge decks) binned in PLACE_CELL cells —
   * what the game's TileMap holds besides the tiles when critters and enemies spawn (the villagers'
   * colliders are ActorPreview's). Rebuilt when the props change (`ObjectPreview.version`).
   */
  _placementGrid() {
    const P = this.props;
    if (this._pgrid && this._pgrid.version === P.version) return this._pgrid;
    const cells = new Map();
    const bin = (item, list, minX, maxX, minZ, maxZ) => {
      const i0 = Math.floor(minX / PLACE_CELL);
      const i1 = Math.floor(maxX / PLACE_CELL);
      const j0 = Math.floor(minZ / PLACE_CELL);
      const j1 = Math.floor(maxZ / PLACE_CELL);
      if (!(Number.isFinite(i0) && Number.isFinite(i1) && Number.isFinite(j0) && Number.isFinite(j1))) return;
      for (let j = Math.max(j0, -PLACE_OFF); j <= Math.min(j1, PLACE_OFF); j++) {
        for (let i = Math.max(i0, -PLACE_OFF); i <= Math.min(i1, PLACE_OFF); i++) {
          const k = (j + PLACE_OFF) * PLACE_SPAN + i + PLACE_OFF;
          let cell = cells.get(k);
          if (!cell) cells.set(k, (cell = { colliders: [], walk: [] }));
          cell[list].push(item);
        }
      }
    };
    for (const e of P.entries.values()) {
      for (const c of e.built.colliders ?? []) {
        if (c.type === 'circle') bin(c, 'colliders', c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r);
        else bin(c, 'colliders', c.minX, c.maxX, c.minZ, c.maxZ);
      }
      for (const r of e.built.walkRects ?? []) bin(r, 'walk', r.minX, r.maxX, r.minZ, r.maxZ);
    }
    this._pgrid = { version: P.version, cells };
    return this._pgrid;
  }

  /** The placement-grid cell holding (x, z), or null. */
  _placementCell(x, z) {
    const i = Math.floor(x / PLACE_CELL);
    const j = Math.floor(z / PLACE_CELL);
    if (Math.abs(i) > PLACE_OFF || Math.abs(j) > PLACE_OFF) return null;
    return this._placementGrid().cells.get((j + PLACE_OFF) * PLACE_SPAN + i + PLACE_OFF) ?? null;
  }

  /** The game's critter placement test (TileMap walkability, bridge decks, prop colliders). */
  _isWalkable(x, z) {
    const tm = this.terrain.tileMap;
    if (!tm) return true;
    if (x < 0 || z < 0 || x > tm.width || z > tm.depth) return false;
    const cell = this._placementCell(x, z);
    if (!tm.isWalkable(x, z) && !cell?.walk.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ)) return false;
    for (const c of cell?.colliders ?? []) {
      if (c.type === 'circle' ? (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r : x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return false;
    }
    return true;
  }

  /**
   * The combat spawn's standable test (`CombatSystem.standable`): walkable (above) and, on a water
   * tile, a walk surface (bridge deck) above the water — open water is not ground.
   */
  _isStandable(x, z) {
    if (!this._isWalkable(x, z)) return false;
    const tm = this.terrain.tileMap;
    const t = tm?.tileAt(Math.floor(x), Math.floor(z));
    if (!t || !t.water) return true;
    // TileMap.getHeight: the highest walk surface over the point, else the tile (a pond's bed)
    let h = null;
    for (const r of this._placementCell(x, z)?.walk ?? []) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ && (h === null || r.y > h)) h = r.y;
    }
    return (h ?? tm.getHeight(x, z)) > (t.waterSurface ?? -Infinity);
  }

  /**
   * The start test of an enemy group (the combat spawn's: standable ground, fliers also water;
   * clear of every prop's and villager's collider), in every layout. While this view is shown
   * and built: its exact test — what `ActorPreview` places the enemy sprites with (built
   * colliders and deck heights). While it is hidden (the 2D-only layout: its builds may lag the
   * level) or before the first build of a document: `levelStartTest` on the level data with the
   * villagers', chests' and waystones' colliders and the props' own TileMap colliders
   * (`_dataStartTest`). Null once disposed.
   *
   * `lazy` (the 2D map's dots): while a build of the document is due — the view is still starting
   * (it builds the level, shown or hidden), or it is shown and a newly loaded document builds in
   * its next frame — null instead of building props for their colliders alone (unless that test
   * is cached already): the caller uses its plain level-data test meanwhile and places again on
   * `onPlacementChange`, which reports every finished document build. Its props' colliders are
   * then the built ones.
   * @param {boolean} flier
   * @param {{ lazy?: boolean }} [opts]
   * @returns {((x: number, z: number) => boolean)|null}
   */
  enemyStartTest(flier, { lazy = false } = {}) {
    if (this._disposed) return null;
    if (this._placementReady && this.terrain.tileMap) return this.active ? this.actors.enemyTest(flier) : this._dataStartTest(flier);
    if (lazy && (this._initPending() || this.active) && !this._dataTestCached(flier)) return null;
    return this._dataStartTest(flier);
  }

  /**
   * Where a critter group's scattered animals may start (the game's `TileMap.isWalkable`: walkable
   * tiles and bridge decks, clear of every prop's and villager's collider), in every layout, like
   * `enemyStartTest`: while this view is shown and built, the exact test the 3D critters are
   * placed with (`ActorPreview.critterTest`); while it is hidden — or before a new document's
   * first build — the level-data walker test (`_dataStartTest(false)`: `isWalkablePoint` minus the
   * villagers', chests', waystones' and nearby props' colliders). `lazy` as for enemyStartTest.
   * Null once disposed (or when the shown view has no test yet).
   * @param {{ lazy?: boolean }} [opts]
   * @returns {((x: number, z: number) => boolean)|null}
   */
  critterStartTest({ lazy = false } = {}) {
    if (this._disposed) return null;
    if (this._placementReady && this.terrain.tileMap) return this.active ? this.actors.critterTest() : this._dataStartTest(false);
    if (lazy && (this._initPending() || this.active) && !this._dataTestCached(false)) return null;
    return this._dataStartTest(false);
  }

  /** Is `_dataStartTest(flier)` cached for the current level and objects? */
  _dataTestCached(flier) {
    const c = this._dataTests;
    return !!c && c.level === this.state.level && c.version === this._objectsVersion && c.tests.has(flier);
  }

  /**
   * `levelStartTest` with the colliders of the level's villagers, chests, waystones and of the
   * props near an enemy group (cached until an object changes: the test reads the tiles live).
   * @param {boolean} flier
   */
  _dataStartTest(flier) {
    const level = this.state.level;
    let c = this._dataTests;
    if (!c || c.level !== level || c.version !== this._objectsVersion) {
      c = this._dataTests = { level, version: this._objectsVersion, cols: null, tests: new Map() };
    }
    let t = c.tests.get(flier);
    if (!t) {
      c.cols ??= [...dataColliders(level), ...this._propColliders(level)];
      t = levelStartTest(level, flier, c.cols);
      c.tests.set(flier, t);
    }
    return t;
  }

  /**
   * The TileMap colliders of the props that can reach an enemy or critter group's scatter rect
   * (their catalog bounds within PROP_REACH of it). Each comes from this view's build of the object when
   * that build matches the level, else from a build of the object made for its colliders alone
   * (the same LevelObjectBuilder, then freed; colliders do not depend on the ground), cached per
   * object until it changes.
   * @param {Level} level
   * @returns {PropResult['colliders']}
   */
  _propColliders(level) {
    const areas = [];
    for (const o of level.objects) {
      if (o.type !== 'enemy' && o.type !== 'critters') continue;
      const r = o.type === 'enemy' ? enemyScatterRect(o) : critterScatterRect(o);
      areas.push({ minX: r.minX - PROP_REACH, maxX: r.maxX + PROP_REACH, minZ: r.minZ - PROP_REACH, maxZ: r.maxZ + PROP_REACH });
    }
    const out = [];
    if (!areas.length) return out;
    const seen = new Set();
    for (const o of level.objects) {
      // (villagers, chests and waystones: dataColliders; lights and waterfalls have none)
      if (!LevelObjectBuilder.isBuildable(o.type) || NO_PROP_COLLIDERS.has(o.type) || (o.type === 'tree' && o.collider === false)) continue;
      const b = objectBounds(o);
      if (!areas.some((a) => !(b.maxX < a.minX || b.minX > a.maxX || b.maxZ < a.minZ || b.minZ > a.maxZ))) continue;
      seen.add(o.id);
      for (const c of this._collidersOf(o)) out.push(c);
    }
    for (const id of this._colliderCache.keys()) if (!seen.has(id)) this._colliderCache.delete(id);
    return out;
  }

  /**
   * A prop object's TileMap colliders (see _propColliders).
   * @param {LevelObject} o
   * @returns {PropResult['colliders']}
   */
  _collidersOf(o) {
    const sig = JSON.stringify(o);
    const e = this.props.entries.get(o.id);
    if (e && e.sig === sig && e.exact !== false) return e.built.colliders ?? [];
    const hit = this._colliderCache.get(o.id);
    if (hit && hit.sig === sig) return hit.colliders;
    let colliders = [];
    try {
      const built = this.props.builder.build(JSON.parse(sig), this.terrain.tileMap ?? FLAT_GROUND);
      if (built) {
        colliders = (built.colliders ?? []).map((c) => ({ ...c }));
        built.dispose();
      }
    } catch (err) {
      console.error(`[Viewport3D] colliders of "${o.id}" (${o.type}) failed:`, err);
    }
    this._colliderCache.set(o.id, { sig, colliders });
    return colliders;
  }

  async _loadTools() {
    if (this._tools) return;
    const load = TOOL_MODULES['../tools/index.js'];
    if (!load) return;
    try {
      this._tools = /** @type {typeof ToolRegistry} */ (await load());
    } catch (err) {
      console.warn('[Viewport3D] tools unavailable:', err);
    }
  }

  _bindState() {
    const s = this.state;
    const d = this._dirty;
    this._unsub = [
      s.on('change', (info) => {
        // (coalesced: the frame update syncs once, whatever number of events came in)
        this._lastEditAt = performance.now();
        if (info.terrain) {
          d.terrain = true;
          this.surface.invalidate();
          this._terrainDataVersion++;
        }
        if (info.objects || info.source !== 'edit') {
          d.objects = true;
          this._objectsVersion++;
          // (undo / redo report the ids of their step; loads and unknown changes diff everything)
          if (info.source === 'load' || !Array.isArray(info.ids)) this._allObjects = true;
          else for (const id of info.ids) this._dirtyIds.add(id);
        }
        if (info.source === 'load') {
          this._loadPending = true;
          // (its props are not built yet: enemyStartTest uses the level-data test meanwhile)
          this._placementReady = false;
        }
        if (info.meta) {
          d.meta = true;
          // level-wide settings the terrain preview depends on (water look, the name-seeded
          // tint): TerrainPreview.sync diffs them cheaply and only rebuilds what changed
          d.terrain = true;
        }
        d.selection = true;
        d.tool = true;
        if (info.source === 'load') {
          this._pendingFrame = true;
          this._cameraTouched = false;
        }
      }),
      s.on('selection', () => { d.selection = true; }),
      s.on('tool', () => {
        // the tool changed mid-stroke (a shortcut while dragging): the stroke ends for the tool
        // that started it (its pointerUp commits; a no-op if the app's deactivate() did already)
        if (this._stroke && this._stroke.toolId !== s.toolId) this._endStroke(null, true);
        d.tool = true;
        this._primeForTool();
        d.hover = true;
        this._updateCursor();
      }),
      s.on('toolOptions', () => { d.tool = true; this._primeForTool(); }),
      s.on('preview', () => { d.tool = true; }),
      s.on('hover', () => { d.hover = true; d.tool = true; }),
      s.on('view', (v) => this._applyView(v)),
    ];
  }

  /**
   * The enemy tool was picked: prime the enemy sprites' batch programs now (ActorPreview.primeEnemies)
   * rather than in the frames after the first enemy of the session is placed.
   */
  _primeForTool() {
    const s = this.state;
    if (s.toolId === 'place' && s.toolOptions?.objectType === 'enemy' && !this._disposed) this.actors.primeEnemies();
  }

  _applyView(v, force = false) {
    const prev = this._view ?? {};
    this._view = { ...v };
    if (force || prev.timeOfDay !== v.timeOfDay) this.lighting.setTime(v.timeOfDay ?? 14);
    if (force || prev.cameraMode !== v.cameraMode) {
      this._syncGameCamera();
      this.cam.setMode(v.cameraMode);
    }
    if (force || prev.grid !== v.grid) this.overlays.setGridVisible(v.grid !== false);
    const hidKey = JSON.stringify(v.hiddenTypes ?? []);
    if (force || prev.showObjects !== v.showObjects || prev.showMarkers !== v.showMarkers || hidKey !== this._hiddenKey) {
      this._hiddenKey = hidKey;
      this.props.setVisible(v.showObjects !== false);
      this.props.setHiddenTypes(v.hiddenTypes);
      this.actors.setVisibility({ showObjects: v.showObjects !== false, showMarkers: v.showMarkers !== false, hiddenTypes: v.hiddenTypes ?? [] });
      this._dirty.selection = true;
      this._dirty.tool = true;
    }
    // the story preview (its values, the preview hour) decides which objects are there
    this._applyStoryHidden();
    const postChanged = force || prev.postfx !== v.postfx;
    if (postChanged) this._setPostFX(!!v.postfx);
    if (force || prev.atmosphere !== v.atmosphere) this._setAtmosphere(!!v.atmosphere);
    // (the weather effects' programs for the new render path, before the weather shows them;
    // turning the atmosphere on warms them itself)
    else if (postChanged) this._warmWeatherFx();
    this._showBadge(v.cameraMode === 'game' ? tr('tools.view3d.gameCamera') : '');
    this.actors.setMarkerDim(v.cameraMode === 'game' ? 0.35 : 1);
    this.root.classList.toggle('lvp3d-game', v.cameraMode === 'game');
  }

  /**
   * Hide the objects the story preview does not allow (src/editor/story.js; nothing while it is
   * off): props and markers alike, also from picking.
   */
  _applyStoryHidden() {
    const ids = storyHiddenIds(this.state);
    const key = ids.size ? [...ids].sort().join('\u0000') : '';
    if (key === (this._storyKey ?? '')) return;
    this._storyKey = key;
    this.props.setHiddenIds(ids);
    this.actors.setHiddenIds(ids);
    this._dirty.selection = true;
    this._dirty.tool = true;
  }

  /** Gameplay framing from the level (environment.camera distance / pitch) or the game defaults. */
  _syncGameCamera() {
    const g = this.cam.game;
    // (the game's framing — LevelLook.cameraFraming: distance 8–80, pitch 10–80°, the zoom range
    // widened to include the level's distance)
    Object.assign(g, cameraFraming(this.state.level.environment?.camera));
    // re-frame only when the level's camera tuning changed (other level settings edits keep
    // the user's game-camera zoom)
    const key = `${g.distance}|${g.pitch}`;
    const changed = key !== this._gameCamKey;
    this._gameCamKey = key;
    if (changed && this.cam.mode === 'game') {
      this.cam.pitchTarget = g.pitch * DEG2RAD;
      this.cam.distanceTarget = clamp(g.distance, g.minDistance, g.maxDistance);
    }
  }

  _showBadge(text) {
    this.badge.textContent = text;
    this.badge.classList.toggle('on', !!text);
  }

  _updateRunning() {
    const run = this.active && !this._disposed && document.visibilityState !== 'hidden' && !this._initPending();
    if (run) this.engine.start();
    else this.engine.stop();
  }

  _initPending() {
    return !this.terrain.tileMap;
  }

  // ===========================================================================================
  // Sync (terrain / objects / overlays), called from the frame update
  // ===========================================================================================

  _syncAll({ force = false } = {}) {
    const level = this.state.level;
    const d = this._dirty;
    const inTx = this.state.inTransaction;
    const now = performance.now();
    // 1. terrain DATA (cheap: tile records, grid, surface); the meshes follow in _runJobs
    let tr = null;
    if (d.terrain || force) tr = this._syncTerrain(level, { force, now });
    const terrainAll = !!tr?.full;
    const terrainRect = tr && !tr.full ? tr.rect : null;
    // 2. objects: only the changed ids (a full diff after undo / redo / loads), and the props /
    //    markers standing on changed terrain
    if (d.objects || terrainAll || terrainRect || force || d.finishDrag || (this._actorRect && (!inTx || now - (this._actorsAt ?? 0) >= STROKE_ACTORS_MS))) {
      const tm = this.terrain.tileMap;
      const ids = this._allObjects || force ? null : this._dirtyIds;
      const t0 = performance.now();
      this.props.sync(level.objects, tm, { ids, terrainRect, terrainAll: terrainAll || force, dragging: inTx });
      // markers / sprites on changed terrain: re-draped now and then during strokes (overlays)
      let actorRect = terrainRect;
      if (terrainRect || this._actorRect) {
        this._actorRect = this._actorRect && terrainRect ? unionRect(this._actorRect, terrainRect) : (this._actorRect ?? terrainRect);
        actorRect = null;
        if (!inTx || now - (this._actorsAt ?? 0) >= STROKE_ACTORS_MS) {
          actorRect = this._actorRect;
          this._actorRect = null;
          this._actorsAt = now;
        }
      }
      // a new document: build its props now (critter placement tests their colliders), and
      // compile its outline-mask programs in the background once things settle
      const fresh = force || this._loadPending;
      if (fresh) {
        this.props.flush(tm);
        // a new document: the point lights start afresh on it, as the game's pool does on a level
        // load (no crossfade from the old level, nothing inherited by lamps sharing its tags)
        this.stats.lightDescriptors = this.props.refreshLights(level.objects, { snap: true, reset: true });
        if (!force) this._needWarm = true;
      }
      this._loadPending = false;
      this.actors.sync(level, { ids, terrainRect: actorRect, terrainChanged: terrainAll || force, isWalkable: this._walkable, isStandable: this._standable });
      // (an edited `when` / `unless`, a new object: the story preview's hidden set may change)
      this._applyStoryHidden();
      if (fresh) {
        this._placementReady = true;
        // (reported below whatever changed: a lazy start test answered null until now; the
        // colliders built for the level-data test alone are superseded by the built props)
        this._placementKey[0] = -1;
        this._colliderCache.clear();
      }
      this.stats.objectMs = +(performance.now() - t0).toFixed(1);
      this._dirtyIds = new Set();
      this._allObjects = false;
      this.foliage.schedule(now);
      d.objects = false;
      d.finishDrag = false;
      d.selection = true;
      d.tool = true;
    }
    if (d.meta) {
      d.meta = false;
      this._syncGameCamera();
      if (this.particles && this._view?.atmosphere) this._refreshAtmosphere();
      if (this.scenery.stale(level)) this.scenery.schedule(now);
    }
    // 3. mesh jobs (time-sliced)
    this._runJobs(level, now, inTx);
    // 4. props with colliders built / removed (above or in step 2): the critter / enemy groups
    //    there scatter again around them, as the game places them; and the 2D map's enemy start
    //    dots follow this view's placement test (enemyStartTest)
    const moved = this.props.takePlacementChanges();
    if (moved.length && this.actors.rescatter(moved)) d.selection = true;
    const pk = this._placementKey;
    if (this._placementReady && (pk[0] !== this.props.version || pk[1] !== this._terrainDataVersion || pk[2] !== this.actors.npcVersion)) {
      pk[0] = this.props.version;
      pk[1] = this._terrainDataVersion;
      pk[2] = this.actors.npcVersion;
      try {
        this.onPlacementChange?.();
      } catch (err) {
        console.error('[Viewport3D] onPlacementChange failed:', err);
      }
    }
    if (this._pendingFrame) {
      this._pendingFrame = false;
      this.frameLevel();
    }
  }

  /**
   * Terrain data sync (full rebuilds on load / size / legend / water-level / name changes).
   * @returns {{ changed: boolean, rect: TileRect|null, full: boolean }}
   */
  _syncTerrain(level, { force, now }) {
    const d = this._dirty;
    const tp = this.terrain;
    const t0 = performance.now();
    let r;
    if (force || !tp.tileMap) {
      tp.rebuild(level);
      r = { changed: true, rect: null, full: true };
      this.scenery.schedule(0);
    } else {
      r = tp.sync(level);
      if (r.changed && (r.full || SceneryPreview.touches(level, r.rect))) this.scenery.schedule(now);
    }
    d.terrain = false;
    if (r.changed) {
      this.stats.terrainMs = +(performance.now() - t0).toFixed(1);
      if (r.full) this.surface.invalidate();
      this.overlays.buildGrid(level, r.full ? null : r.rect);
      d.hover = true;
      d.tool = true;
      d.selection = true;
    }
    return r;
  }

  /** Is mesh work (terrain chunks, water, prop builds / batches, scenery) still pending? */
  get busy() {
    return this.terrain.busy || this.props.busy || this.scenery.pending || this.scenery.building;
  }

  /**
   * Run queued mesh work (see the scheduling notes at the top of this file).
   * @param {Level} level
   * @param {number} now
   * @param {boolean} inTx a transaction (stroke) is open
   */
  _runJobs(level, now, inTx) {
    const tp = this.terrain;
    const P = this.props;
    const tm = tp.tileMap;
    if (!tm) return;
    const h = this.state.hover;
    const focus = h && Number.isFinite(h.x) ? h : this.cam.focus;
    const t0 = performance.now();
    // water: re-read the tiles + geometry (throttled during strokes), then shore blocks
    const waterReady = () => (tp.waterPending && (!inTx || now - this._waterAt >= STROKE_WATER_MS)) || tp.shorePending > 0;
    const water = () => {
      if (tp.waterPending && (!inTx || now - this._waterAt >= STROKE_WATER_MS)) {
        tp.flushWater(level);
        this._waterAt = now;
      } else tp.stepShore(focus);
      this.stats.waterMs = tp.stats.waterMs;
      this._lastJob = 'water';
    };
    const left = () => FRAME_BUDGET_MS - (performance.now() - t0);
    const chunk = () => {
      // (a frame already near its budget — a 128 × 128 level renders for ~12 ms — gets thinner
      // slices: the chunk follows the brush a few frames later instead of dropping frames)
      if (inTx) tp.stepChunkSlices((this._cpu ?? 0) > HEAVY_FRAME_MS ? STROKE_SLICE_MS_HEAVY : STROKE_SLICE_MS, focus, { minAge: STROKE_CHUNK_MS });
      else tp.stepChunkSlices(Math.max(1, left()), focus);
      this.stats.terrainMs = tp.stats.chunkMs;
      this._lastJob = 'chunk';
    };
    if (inTx) {
      // one rebuild per frame: a slice of the chunk under the brush, the water now and then, else
      // a prop
      const chunkReady = tp.chunkReady(STROKE_CHUNK_MS);
      if (waterReady() && !tp.slicing && (this._lastJob !== 'water' || !chunkReady)) water();
      else if (chunkReady) chunk();
      else if (P._queue.size) { P.step(tm, { max: 1 }); this._lastJob = 'props'; }
      return;
    }
    let did = false;
    if (tp.pendingChunks.size || tp.slicing) { chunk(); did = true; }
    while (waterReady() && (!did || left() > 0)) { water(); did = true; }
    if (P._queue.size && (!did || left() > 0)) { P.step(tm, { budgetMs: Math.max(1, left()) }); did = true; }
    if (did) return;
    // editing paused: re-batch props, then the scenery / foliage (never during a gesture)
    if (this._stroke || now - this._lastEditAt < IDLE_MS) return;
    if (P.stepBatches()) return;
    if (tp.stepBatches()) return;
    if (this._needWarm) {
      this._needWarm = false;
      const r = this.renderer;
      const warm = this._sceneMaterials();
      const prev = r.getRenderTarget();
      r.setRenderTarget(this.outline.warmTarget);
      const p = r.compileAsync(this.scene, this.camera);
      r.setRenderTarget(prev);
      // and the direct-to-canvas variants of materials that appeared since the start-up warm-up
      const canvas = this._compileFor(this.scene);
      // (marks only what was compiled: a prop placed while this ran keeps its own warm-up)
      Promise.all([p.catch(() => {}), canvas]).then(() => { if (!this._disposed) { this.outline.markWarm(warm); this._dirty.selection = true; } });
      return;
    }
    if (this.scenery.due(now, inTx) && !this._drag) {
      this.scenery.step(level, tm, FRAME_BUDGET_MS);
      if (!this.scenery.building) this.stats.sceneryMs = this.scenery.stats.ms;
      return;
    }
    if (this.foliage.due(now, inTx) && !this._drag && !P.hasPendingExact && now - this._lastEditAt > 700) {
      this.foliage.build(level, tm, P);
      this.stats.foliageMs = this.foliage.stats.ms;
    }
  }

  _refreshOverlays() {
    const d = this._dirty;
    const st = this.state;
    const level = st.level;
    const tool = this.tool;
    let preview = null;
    if (d.tool || d.hover || d.selection) {
      try {
        preview = tool?.preview?.(st) ?? null;
      } catch (err) {
        if (!this._previewErr) console.error('[Viewport3D] tool preview failed:', err);
        this._previewErr = true;
      }
    }
    if (d.hover || d.tool || d.selection) {
      const hideCell = !!preview?.cells?.length || !!preview?.ghost || !!preview?.rect || !!preview?.spawn;
      this.overlays.setHover(st.hover, level, { hideCell });
      const h = st.hover;
      const cursor = h?.view === '3d' && this._pointer ? this._pointer : null;
      const anchor = h && Number.isFinite(h.x) ? _v.set(h.x, this.surface.surfaceAt(h.x, h.z) + 1.2, h.z) : null;
      this.overlays.setToolPreview(preview, cursor, anchor, { level, props: this.props, actors: this.actors, force: d.selection, terrainVersion: this._terrainDataVersion });
      this.ghost.set(preview?.ghost ?? null, this.terrain.tileMap);
      this.ghost.setSpawn(preview?.spawn ?? null);
      const hl = preview?.highlight?.ids?.length ? preview.highlight : null;
      const hkey = hl ? `${hl.ids.join('|')}#${hl.color ?? ''}` : '';
      if (hkey !== this._outlineHiKey || d.selection) {
        this._outlineHiKey = hkey;
        this.outline.set('highlight', hl ? this._rootsFor(hl.ids) : []);
        if (hl) {
          const { color, alpha } = parseCss(hl.color, COLORS.hoverObject);
          this.outline.setColors({ highlight: color, highlightAlpha: Math.max(0.45, alpha) });
        }
      }
      d.hover = false;
      d.tool = false;
    }
    if (d.selection) {
      this.overlays.setSelection(st.selection, { level, props: this.props, actors: this.actors });
      // (past MAX_OUTLINED objects — a select-all on a big level — the silhouette masks would
      // re-render hundreds of lit meshes every frame: the selection overlay shows them instead)
      this.outline.set('select', st.selection.length > MAX_OUTLINED ? [] : this._rootsFor(st.selection));
      d.selection = false;
    }
    // meshes whose outline-mask programs are not compiled yet join once compiled (background)
    const cold = this.outline.takeCold();
    if (cold.length) {
      this._warmOutline(cold).catch(() => {}).then(() => {
        if (this._disposed) return;
        this.outline.markWarm(cold);
        this._dirty.selection = true;
        this._outlineHiKey = null;
      });
    }
  }

  /** Scene objects (props, sprites) of level object ids — for the silhouette outlines. */
  _rootsFor(ids) {
    const out = [];
    const view = this._view ?? {};
    for (const id of ids) {
      if (id === 'spawn') continue; // translucent (dithered) marker: its ring shows the selection
      const pe = this.props.get(id);
      if (pe && view.showObjects !== false && pe.root.visible) out.push(pe.root);
      const ae = this.actors.get(id);
      if (ae) out.push(...ae.sprites.filter((sp) => sp.visible));
    }
    return out;
  }

  // ===========================================================================================
  // Frame
  // ===========================================================================================

  _update(dt) {
    if (this._disposed) return;
    this._frameStart = performance.now();
    const st = this.state;
    // transaction just ended (commit emits no 'change'): flush throttled terrain + exact rebuilds
    const inTx = st.inTransaction;
    if (this._wasInTx && !inTx) this._dirty.finishDrag = true;
    this._wasInTx = inTx;

    this._fly(dt);
    const cam = this.cam;
    if (!this._drag || this._drag.mode !== 'pan') {
      // keep the orbit pivot on the ground (slowly)
      const f = cam.focusTarget;
      const gy = this.surface.surfaceAt(f.x, f.z);
      if (Number.isFinite(gy) && f.x >= 0 && f.z >= 0 && f.x <= st.level.width && f.z <= st.level.depth) f.y += (gy - f.y) * Math.min(1, dt * 3);
    }
    cam.update(dt);

    this._syncAll();
    try {
      this._refreshOverlays();
    } catch (err) {
      // a malformed tool preview must not stop the frame (lighting, lights, animation below)
      if (!this._overlayErr) console.error('[Viewport3D] overlay update failed:', err);
      this._overlayErr = true;
      const d = this._dirty;
      d.tool = d.hover = d.selection = false;
    }

    // the level's weather at its settled values (WeatherLook, the game's look): sun / ambient /
    // exposure, overcast colours, grade, wind and the lanterns / windows / lantern glass always, like
    // the time of day; precipitation, its haze, the god rays and snow cover with the atmosphere
    // preview (see _updateWeatherAtmosphere)
    const w = this._syncWeather();
    const atmo = !!(this.particles && this._view?.atmosphere);
    // lighting: fixed time, editing fog scaled with the view distance, shadows sized to the view
    const L = this.lighting;
    applyWeatherLighting(L.settings, w);
    // an interior's backdrop instead of the sky (the fog and the background its colour), as the game
    L.settings.backdrop = this._syncBackdrop();
    const base = Math.max(1e-4, L.state.fogDensity);
    const fogScale = cam.mode === 'game' ? 0.55 : 1;
    // (the edit fog ignores the palette's density; the weather's haze only with the atmosphere)
    L.settings.fogMul = clamp(((EDIT_FOG * fogScale) / Math.max(8, cam.distance)) / base, 0.02, 1.2) * (atmo ? w.fog : 1);
    const ext = clamp(cam.distance * 0.75, 18, 70);
    if (Math.abs(L.shadowExtent - ext) > 1.5) L.shadowExtent = ext;
    const pool = this.props.lightPool;
    applyLampDayGlow(pool.handles, pool, w.overcast);
    applyEmissiveDay(this.props.emissiveEntries, w.overcast);
    L.update(dt);
    applyOvercast(L, w.overcast);
    // lantern glass (the props' shared material): the game's level — its bright amber albedo
    // dimmed while the lamps are unlit, i.e. by day under a clear sky
    this._glassMaterial ??= this.props.builder.factory.glassMaterial();
    this._glassMaterial.color.setScalar(glassLevel(L.nightFactor, w.overcast));
    applyWeatherWind(w);
    if (this.postfx) {
      const grade = this.postfx.settings.grade;
      applyWeatherGrade(grade, w, EDIT_GRADE.temperature, EDIT_GRADE.saturation);
      // nights read blue but not neon (the game's Weather.update)
      grade.saturation -= NIGHT_DESATURATION * L.nightFactor;
    }
    this._calmWater(L.nightFactor);
    // point lights: the engine LightPool, as the game's World.update runs it (after the lighting
    // update and the camera): ranked around the camera focus, limited to what the camera sees,
    // crossfaded; its descriptor list is rebuilt after prop changes
    if (this.props.lightsDirty) this.stats.lightDescriptors = this.props.refreshLights(st.level.objects);
    this.props.updateLights(dt, this._lightView);
    this.stats.lights = pool.activeCount;
    this._updateWeatherAtmosphere(w, atmo);

    this.terrain.update(dt);
    this.props.update(dt);
    this.actors.update(dt, this.camera);
    this.ghost.update(dt, this.camera);
    if (this.particles) {
      if (this._dust) this._dust.position.set(cam.focus.x, cam.focus.y + 2.4, cam.focus.z);
      this.particles.update(dt, this.camera);
    }
    this.godRays?.update(dt);
    const post = this._postfxReady && this._view?.postfx;
    let fade = null;
    if (post) {
      fade = this._fadeFocus;
      fade.depth = cam.viewDepth(cam.focus);
      fade.range = this.postfx.settings.dof.focusRange;
    }
    this.overlays.updateGridFade(cam.distance, fade);

    const far = cam.distance > 70;
    if (far !== this._far) {
      this._far = far;
      this.root.classList.toggle('lvp3d-far', far);
      this.labels.invalidateSizes();
    }

    const s = this.stats;
    s.objects = st.level.objects.length;
    s.fps = +this.engine.time.fps.toFixed(1);
    s.pendingChunks = this.terrain.pendingChunks.size;
    s.batches = this.props.batcher.stats.chunks;
    s.batchMeshes = this.props.batcher.stats.meshes;
    s.terrainBatches = this.terrain.batcher.stats.cells;
    s.terrainBatchMeshes = this.terrain.batcher.stats.meshes;
  }

  _render(dt) {
    // a stroke / drag running in the 2D map: the preview follows at half rate (the frame budget
    // goes to the view being drawn in; big levels would otherwise drop frames). On levels whose
    // frames cannot fit the budget at all during a stroke (128 × 128: ~17 ms) the preview renders
    // at a steady half rate for any stroke instead of dropping every other frame irregularly.
    // (a 2D stroke on such a level: a third of the frames, the 2D map needs the rest)
    const st = this.state;
    const in2d = st.hover?.view === '2d' && !this._stroke && !this._drag;
    const heavy = (this._cpu ?? 0) > OVER_BUDGET_MS;
    const every = st.inTransaction && (in2d || heavy) ? (in2d && heavy ? 3 : 2) : 1;
    this._skipK = every > 1 ? ((this._skipK ?? 0) + 1) % every : 0;
    if (this._skipK !== 0) return;
    const r = this.renderer;
    const cam = this.cam;
    this.lighting.lateUpdate();
    this._planShadows();
    const usePost = this._postfxReady && this._view?.postfx;
    r.info.autoReset = false;
    r.info.reset();
    if (usePost) {
      const pf = this.postfx;
      pf.setFocus(Math.max(1, cam.viewDepth(cam.focus)));
      const S = pf.settings.dof;
      const game = cam.mode === 'game';
      S.focusRange = game ? 6 : clamp(cam.distance * 0.3, 6, 40);
      S.tiltShift = game ? 0.42 : 0.26;
      S.maxBlur = game ? 13 : 10;
      pf.render(dt);
      this.stats.drawCalls = pf.sceneInfo.calls;
      this.stats.triangles = pf.sceneInfo.triangles;
    } else {
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
      this.stats.drawCalls = r.info.render.calls;
      this.stats.triangles = r.info.render.triangles;
    }
    this._afterShadows();
    // overlay pass: depth-tested against the scene, drawn on top of the final image
    const auto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(null);
    if (usePost) {
      r.clearDepth();
      this._depthQuad.material.uniforms.tDepth.value = this.postfx.depthTexture;
      this._depthQuad.render(r);
    }
    if (this.outline.active) {
      this.outline.render(this.scene, this.camera, this._lights, this.engine.time.elapsed);
      r.setRenderTarget(null);
    }
    r.render(this.overlayScene, this.camera);
    r.autoClear = auto;
    r.info.autoReset = true;
    this.stats.postfx = !!usePost;
    this.labels.update(this.camera, this.engine.width, this.engine.height);
    // builds replaced this frame are freed now that their replacements rendered (their shader
    // programs stayed referenced, so nothing recompiles)
    this.terrain.collect();
    this.props.collect();
    this.foliage.collect();
    // CPU time of the frame (update + render submission), smoothed
    if (this._frameStart) {
      const ms = performance.now() - this._frameStart;
      this._cpu = this._cpu ? this._cpu + (ms - this._cpu) * 0.1 : ms;
      this.stats.cpuMs = +this._cpu.toFixed(2);
    }
  }

  /**
   * The shadow pass is ~45 % of a big level's render time. While a transaction is open (a brush
   * stroke, a drag, a slider) it is re-rendered every 3rd frame (every 6th when the frames are
   * heavy) — at once when the sun / shadow camera moved — and every frame otherwise (animated
   * casters: trees in the wind, sprites).
   */
  _planShadows() {
    const sm = this.renderer.shadowMap;
    if (!this.state.inTransaction) {
      sm.autoUpdate = true;
      this._shadowSkip = 0;
      return;
    }
    const sun = this.lighting.sun;
    const e = sun.matrixWorld.elements;
    const key = `${e[12].toFixed(3)},${e[13].toFixed(3)},${e[14].toFixed(3)},${this.lighting.shadowExtent}`;
    sm.autoUpdate = false;
    this._shadowSkip = (this._shadowSkip ?? 0) + 1;
    // (every 6th frame on levels whose frames are already heavy: 128 × 128 renders for ~12 ms)
    const every = (this._cpu ?? 0) > HEAVY_FRAME_MS ? 6 : 3;
    if (key !== this._shadowKey || this._shadowSkip >= every) {
      sm.needsUpdate = true;
      this._shadowSkip = 0;
      this._shadowKey = key;
    }
  }

  _afterShadows() {
    // (three.js clears needsUpdate after the pass; autoUpdate stays as planned for the frame)
  }

  // ===========================================================================================
  // PostFX / atmosphere
  // ===========================================================================================

  _setPostFX(on) {
    if (!on || this.postfx) {
      this._postfxReady = !!this.postfx && !this._postfxCompiling;
      return;
    }
    const r = this.renderer;
    const dpr = Math.min(window.devicePixelRatio || 1, this.engine.maxPixelRatio);
    const px = this.engine.width * this.engine.height * dpr * dpr;
    this.postfx = new PostFX(r, this.scene, this.camera, { maxTaps: 64, samples: px > 1.8e6 ? 2 : 4 });
    const S = this.postfx.settings;
    Object.assign(S.dof, { focusRange: 6, maxBlur: 12, nearScale: 1.4, farScale: 1.1, tiltShift: 0.3, tiltCenter: 0.5, tiltWidth: 0.34, bokehBoost: 1.5 });
    Object.assign(S.bloom, { strength: 0.5, radius: 0.58, threshold: 1.05 });
    Object.assign(S.grade, { ...EDIT_GRADE, shadowsTint: [...EDIT_GRADE.shadowsTint] });
    // compile the HDR-target variants in the background, keep rendering directly meanwhile
    this._postfxCompiling = true;
    this.postfx.warmup();
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.postfx.sceneTarget);
    const p = r.compileAsync(this.scene, this.camera);
    r.setRenderTarget(prev);
    p.catch(() => {}).then(() => {
      this._postfxCompiling = false;
      if (!this._disposed && this.postfx) this._postfxReady = true;
    });
  }

  _setAtmosphere(on) {
    if (on && !this._disposed) {
      if (!this.particles) this.particles = new Particles(this.scene);
      if (!this.godRays) {
        this.godRays = new GodRays({ gain: 0.2 });
        this.scene.add(this.godRays.object);
      }
      this.props.setParticles(this.particles);
      this.actors.setParticles(this.particles);
      this.foliage.setEnabled(true);
      // the game's rain and snow (camera-following boxes, WeatherLook): both exist from the start,
      // faded by the weather, their programs compiled now — switching the weather compiles nothing
      if (!this._precipEmitters) {
        this._precipEmitters = {
          rain: this.particles.createEmitter(precipitationEmitter('rain', { intensity: 0 })),
          snow: this.particles.createEmitter(precipitationEmitter('snow', { intensity: 0 })),
        };
      }
      this._refreshAtmosphere();
      // the precipitation and god-ray programs for the current render path
      this._warmWeatherFx();
    } else {
      this.props.setParticles(null);
      this.actors.setParticles(null);
      this.foliage.setEnabled(false);
      this._dust?.dispose();
      this._dust = null;
      if (this._precipEmitters) {
        this._precipEmitters.rain.dispose();
        this._precipEmitters.snow.dispose();
        this._precipEmitters = null;
      }
      if (this.godRays) for (const s of [...this.godRays.shafts]) s.dispose();
      this._godRayKey = null;
      snowCover.value = 0;
    }
  }

  /**
   * The level's weather (`environment.weather`, unknown values = clear; always clear in a room —
   * `LevelLook.shownWeather`, as the game shows it: no rain, snow, snow cover or grey sky inside) as
   * a settled WeatherLook state. A change (inspector, undo / redo, a loaded document, the room
   * switch) re-ranks the point lights afresh — the lamps a level starting in that weather gets in
   * the game — without a crossfade.
   */
  _syncWeather() {
    /** @type {Partial<LevelEnvironment>} */
    const env = this.state.level.environment ?? {};
    const name = weatherName(shownWeather(env, env.weather));
    if (name !== this._weatherName) {
      const had = this._weatherName !== null;
      this._weatherName = name;
      this._weather = settledWeather(name);
      if (had && this.terrain.tileMap) this.stats.lightDescriptors = this.props.refreshLights(this.state.level.objects, { snap: true, reset: true });
    }
    return this._weather;
  }

  /**
   * The level's backdrop (`environment.backdrop`: 'void' or '#rrggbb', read by
   * `LevelLook.backdropColor` as the game reads it) for `LightingSystem.settings.backdrop`: no sky,
   * the fog and the background that colour; null (the sky) without one. Read again only when the
   * value changes.
   * @returns {THREE.Color|null}
   */
  _syncBackdrop() {
    /** @type {Partial<LevelEnvironment>} */
    const env = this.state.level.environment ?? {};
    const key = env.backdrop;
    if (key !== this._backdropKey) {
      this._backdropKey = key;
      const hex = backdropColor(env);
      this._backdrop = hex ? new THREE.Color(hex) : null;
    }
    return this._backdrop;
  }

  /**
   * Weather parts of the atmosphere preview (as the game's Weather settles them): rain / snow
   * emitters, the god-ray factor (the preview's own intensity 1 x the weather's: 0 in rain, 0.25
   * in snow), the camera dust and the level's particle areas, and the settled snow cover. With the
   * atmosphere off the ground stays bare (tiles readable while editing).
   */
  _updateWeatherAtmosphere(w, atmo) {
    const cover = atmo ? settledSnowCover(this._weatherName) : 0;
    if (snowCover.value !== cover) snowCover.value = cover;
    if (!atmo) return;
    const set = (em, v) => { if (em && v !== null && em.intensity !== v) em.intensity = v; };
    if (this.godRays) {
      // (strongest around golden hour, as in the game: Weather.update)
      this.godRays.intensity = w.rays * godRayHourLevel(this.lighting.timeOfDay);
      // (shafts at intensity 0 add nothing: no draw calls for them in the rain)
      this.godRays.object.visible = w.rays > 0;
    }
    const pe = this._precipEmitters;
    if (pe) {
      set(pe.rain, precipitationIntensity(w.rain));
      set(pe.snow, precipitationIntensity(w.snow));
    }
    const night = this.lighting.nightFactor;
    set(this._dust, areaEmitterIntensity('dust', w, undefined, night));
    for (const e of this.actors.entries.values()) if (e.particle) set(e.particle, areaEmitterIntensity(e.particle.preset, w, undefined, night));
  }

  /**
   * The water calmer at night, as the game's Weather.update does it (WeatherLook.nightWaterLevels):
   * the level's brightness and glint, read from each new Water the terrain builds, scaled by the
   * night factor.
   * @param {number} night
   */
  _calmWater(night) {
    const water = this.terrain?.water ?? null;
    if (water !== (this._waterBase?.water ?? null)) {
      const u = water?.uniforms;
      this._waterBase = u ? { water, brightness: u.uBrightness.value, glint: u.uGlint.value } : null;
    }
    const b = this._waterBase;
    if (!b) return;
    const k = nightWaterLevels(night);
    b.water.uniforms.uBrightness.value = b.brightness * k.brightness;
    b.water.uniforms.uGlint.value = b.glint * k.glint;
  }

  /** The active precipitation `{ preset, emitter }` (null in clear weather or with the atmosphere off). */
  get _precip() {
    const pe = this._precipEmitters;
    const kind = this._weatherName === 'rain' || this._weatherName === 'snow' ? this._weatherName : null;
    return pe && kind ? { preset: kind, emitter: pe[kind] } : null;
  }

  /**
   * Compile the programs of the weather effects that may be hidden now — the rain and snow
   * emitters (intensity 0 draws nothing, so the render compiles nothing) and the god-ray shafts
   * (hidden in the rain) — for the path the scene renders through (the PostFX scene target or the
   * canvas): a weather change must never compile a shader. `renderer.compile` (not compileAsync):
   * nothing waits for these programs, and no status polling may outlive a dispose of the emitters
   * or of the viewport.
   */
  _warmWeatherFx(only = null) {
    if (this._disposed) return;
    const pe = this._precipEmitters;
    const objs = only ?? (pe ? [pe.rain.object, pe.snow.object] : []);
    if (!only && this.godRays?.shafts.length) objs.push(this.godRays.object);
    if (!objs.length) return;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const vis = objs.map((o) => o.visible);
    for (const o of objs) o.visible = true;
    try {
      r.setRenderTarget(this._view?.postfx && this.postfx ? this.postfx.sceneTarget : null);
      for (const o of objs) r.compile(o, this.camera, this.scene);
    } catch { /* optional warm-up */ } finally {
      r.setRenderTarget(prev);
      objs.forEach((o, k) => { o.visible = vis[k]; });
    }
  }

  /** Dust motes and god rays per the level environment (atmosphere preview on). */
  _refreshAtmosphere() {
    /** @type {Partial<LevelEnvironment>} */
    const env = this.state.level.environment ?? {};
    const f = this.cam.focus;
    if (env.dust !== false && !this._dust) {
      this._dust = this.particles.createEmitter({ preset: 'dust', bounds: { center: new THREE.Vector3(f.x, f.y + 2.4, f.z), size: new THREE.Vector3(DUST_BOX.x, DUST_BOX.y, DUST_BOX.z) }, count: 120 });
    } else if (env.dust === false && this._dust) {
      this._dust.dispose();
      this._dust = null;
    }
    // god rays in every weather, as in the game (rain fades them to 0, snow to a quarter — see
    // _updateWeatherAtmosphere). Rebuilt only when their layout changes, so a weather edit (or any
    // other environment edit) leaves the shafts — and their program — alone.
    const layout = godRayLayout(env, this.state.level, this.terrain.tileMap ?? null);
    const key = JSON.stringify(layout);
    if (key === this._godRayKey) return;
    this._godRayKey = key;
    const g = this.godRays;
    const old = [...g.shafts];
    for (const a of layout) g.populate(a.bounds, a.count, a.seed);
    // the new shafts take the program the old ones hold (same shader) before those release it:
    // disposing first would free it and the next frame would compile it again
    if (g.shafts.length > old.length) this._warmWeatherFx([g.object]);
    for (const s of old) s.dispose();
  }

  // ===========================================================================================
  // Input
  // ===========================================================================================

  _bindDom() {
    const c = this.canvas;
    this._on = {
      down: (e) => this._onPointerDown(e),
      move: (e) => this._onPointerMove(e),
      up: (e) => this._onPointerUp(e),
      cancel: (e) => this._onPointerUp(e, true),
      lost: (e) => this._onLostCapture(e),
      leave: () => this._onPointerLeave(),
      enter: () => { this._hovering = true; },
      wheel: (e) => this._onWheel(e),
      dbl: (e) => this._onDoubleClick(e),
      ctx: (e) => e.preventDefault(),
      keydown: (e) => this._onKey(e, true),
      keyup: (e) => this._onKey(e, false),
      blur: () => { this._keys.clear(); this._space = false; },
      vis: () => this._updateRunning(),
    };
    c.addEventListener('pointerdown', this._on.down);
    c.addEventListener('pointermove', this._on.move);
    c.addEventListener('pointerup', this._on.up);
    c.addEventListener('pointercancel', this._on.cancel);
    c.addEventListener('lostpointercapture', this._on.lost);
    c.addEventListener('pointerleave', this._on.leave);
    c.addEventListener('pointerenter', this._on.enter);
    c.addEventListener('wheel', this._on.wheel, { passive: false });
    c.addEventListener('dblclick', this._on.dbl);
    c.addEventListener('contextmenu', this._on.ctx);
    window.addEventListener('keydown', this._on.keydown, true);
    window.addEventListener('keyup', this._on.keyup, true);
    window.addEventListener('blur', this._on.blur);
    document.addEventListener('visibilitychange', this._on.vis);
  }

  _unbindDom() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._on.down);
    c.removeEventListener('pointermove', this._on.move);
    c.removeEventListener('pointerup', this._on.up);
    c.removeEventListener('pointercancel', this._on.cancel);
    c.removeEventListener('lostpointercapture', this._on.lost);
    c.removeEventListener('pointerleave', this._on.leave);
    c.removeEventListener('pointerenter', this._on.enter);
    c.removeEventListener('wheel', this._on.wheel);
    c.removeEventListener('dblclick', this._on.dbl);
    c.removeEventListener('contextmenu', this._on.ctx);
    window.removeEventListener('keydown', this._on.keydown, true);
    window.removeEventListener('keyup', this._on.keyup, true);
    window.removeEventListener('blur', this._on.blur);
    document.removeEventListener('visibilitychange', this._on.vis);
  }

  _localPointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _ev(e, button) {
    const ev = this.pickAt(e.clientX, e.clientY, { button, buttons: e.buttons, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey });
    this._lastEv = ev;
    return ev;
  }

  /**
   * Call a tool method (default: the active tool), isolating tool failures: an exception takes the
   * 2D map's path (`reportToolError`: logged, the open transaction committed, "Tool error: …" in
   * the status bar).
   */
  _callTool(method, ev, tool = this.tool) {
    const fn = tool?.[method];
    if (typeof fn !== 'function') return;
    try {
      fn.call(tool, ev, this.state);
    } catch (err) {
      reportToolError(this.state, err, `[Viewport3D] (${tool.id ?? this.state.toolId}.${method})`);
    }
  }

  /**
   * End the current tool stroke: pointerUp goes to the tool that received the pointerDown.
   * @param {PointerEvent|null} e the release event (null: the release was lost — the last
   *   PointerEv of the stroke is reused so nothing jumps)
   * @param {boolean} [cancelled]
   */
  _endStroke(e, cancelled = false) {
    const stroke = this._stroke;
    if (!stroke) return;
    // clear first: releasing the capture may dispatch 'lostpointercapture' re-entrantly
    this._stroke = null;
    try { this.canvas.releasePointerCapture(stroke.pointerId); } catch { /* released */ }
    const raw = e ? this._ev(e, 0) : null;
    let ev = raw ?? { ...(stroke.lastEv ?? this._lastEv), button: 0, buttons: 0 };
    if (raw?.face === 'none' && stroke.lastEv) {
      // released over the sky: end where the stroke last touched the map
      ev = { ...stroke.lastEv, button: 0, buttons: raw.buttons, shift: raw.shift, ctrl: raw.ctrl, alt: raw.alt, clientX: raw.clientX, clientY: raw.clientY };
    }
    ev.cancelled = cancelled;
    this._callTool('pointerUp', ev, stroke.tool);
    if (raw) this._setHover(raw);
    this._dirty.tool = true;
  }

  /** End the current camera drag (a short right click without flying opens the context menu). */
  _endDrag(e, cancelled = false) {
    const drag = this._drag;
    if (!drag) return;
    this._drag = null;
    try { this.canvas.releasePointerCapture(drag.pointerId); } catch { /* released */ }
    this._keys.clear();
    this._updateCursor();
    if (e && drag.button === 2 && drag.moved < 4 && !cancelled && !drag.flew) {
      // a right click (no orbit): the editor's context menu (same event as the 2D map)
      const ev = this._ev(e, 2);
      this.root.dispatchEvent(new CustomEvent('le-contextmenu', { bubbles: true, detail: { ev, clientX: e.clientX, clientY: e.clientY } }));
    }
  }

  _onPointerDown(e) {
    if (!this.active || this._disposed) return;
    this._hovering = true;
    this._pointer = this._localPointer(e);
    // the same pointer went down again: its previous release never reached us (released over
    // a native dialog / outside the page without capture) — finish that stroke / drag first
    if (this._stroke?.pointerId === e.pointerId) this._endStroke(null, true);
    if (this._drag?.pointerId === e.pointerId) this._endDrag(null, true);
    if (this._drag || this._stroke) return; // another pointer is busy
    if (e.button === 0 && this._space) {
      // Space + left drag: pan (the same gesture as in the 2D map)
      e.preventDefault();
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      this._cameraTouched = true;
      this._drag = { mode: 'pan', button: 0, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      this._beginPan(e);
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button === 0) {
      const ev = this._ev(e, 0);
      this._setHover(ev);
      // a press on the sky (no map under the pointer) starts no stroke; a plain click there
      // with the select tool clears the selection (like a click on empty ground)
      if (ev.face === 'none') {
        this._skyClick = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, mods: e.shiftKey || e.ctrlKey || e.metaKey || e.altKey };
        return;
      }
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      const tool = this.tool;
      this._stroke = { pointerId: e.pointerId, tool, toolId: this.state.toolId, lastEv: ev };
      this._callTool('pointerDown', ev, tool);
      this._dirty.tool = true;
      return;
    }
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      const mode = e.button === 1 || e.shiftKey ? 'pan' : 'orbit';
      this._cameraTouched = true;
      this._drag = { mode, button: e.button, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      if (mode === 'pan') this._beginPan(e);
      this.canvas.style.cursor = mode === 'pan' ? 'grabbing' : 'move';
    }
  }

  _onPointerMove(e) {
    if (!this.active || this._disposed) return;
    this._pointer = this._localPointer(e);
    // a mouse moving without the button of the stroke / drag held: its release was lost
    const released = (b) => e.pointerType === 'mouse' && !(e.buttons & BUTTON_BIT[b]);
    if (this._stroke?.pointerId === e.pointerId && released(0)) this._endStroke(null, true);
    const drag = this._drag;
    if (drag && e.pointerId === drag.pointerId) {
      if (released(drag.button)) {
        this._endDrag(null, true);
      } else {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.x = e.clientX;
        drag.y = e.clientY;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.mode === 'orbit') this.cam.orbit(dx, dy);
        else this._panTo(e);
        return;
      }
    }
    const stroke = this._stroke?.pointerId === e.pointerId ? this._stroke : null;
    const ev = this._ev(e, stroke ? 0 : -1);
    this._setHover(ev);
    if (stroke) {
      // dragged onto the sky: hold the stroke at its last map point until the pointer is back
      if (ev.face !== 'none') {
        stroke.lastEv = ev;
        this._callTool('pointerMove', ev, stroke.tool);
      }
    } else {
      this._callTool('pointerMove', ev);
    }
    this._updateCursor(ev);
  }

  _onPointerUp(e, cancelled = false) {
    const sky = this._skyClick;
    if (sky && sky.pointerId === e.pointerId) {
      this._skyClick = null;
      const click = !cancelled && !sky.mods && Math.abs(e.clientX - sky.x) + Math.abs(e.clientY - sky.y) < 5;
      if (click && this.state.toolId === 'select' && !this.state.inTransaction && this.state.selection.length) this.state.clearSelection();
    }
    if (this._drag && e.pointerId === this._drag.pointerId) {
      this._endDrag(e, cancelled);
      return;
    }
    if (this._stroke && e.pointerId === this._stroke.pointerId) this._endStroke(e, cancelled);
  }

  /** Capture lost without a pointerup (element hidden / detached…): end the stroke / drag. */
  _onLostCapture(e) {
    if (this._stroke?.pointerId === e.pointerId) this._endStroke(null, true);
    if (this._drag?.pointerId === e.pointerId) this._endDrag(null, true);
  }

  _onPointerLeave() {
    this._hovering = false;
    if (this._stroke || this._drag) return;
    this._pointer = null;
    if (this.state.hover?.view === '3d') this.state.setHover(null);
    this._dirty.hover = true;
  }

  _setHover(ev) {
    const onMap = ev.onTerrain || ev.face !== 'none';
    this.state.setHover(onMap ? { i: ev.i, j: ev.j, x: ev.x, z: ev.z, y: ev.y, view: '3d' } : null);
    this._dirty.hover = true;
  }

  _onWheel(e) {
    if (!this.active) return;
    e.preventDefault();
    this._cameraTouched = true;
    const scale = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    const dy = clamp(e.deltaY * scale, -400, 400);
    const ev = this.pickAt(e.clientX, e.clientY);
    const anchor = ev.onTerrain ? new THREE.Vector3(ev.x, ev.surfaceY, ev.z) : null;
    this.cam.zoom(Math.exp(dy * 0.0012), anchor);
  }

  _onDoubleClick(e) {
    if (!this.active || e.button !== 0) return;
    // only while selecting: with editing tools a quick double click is two edits (raise twice,
    // place two lamps…) and must not throw the camera around
    if (this.tool && this.state.toolId !== 'select') return;
    const ev = this.pickAt(e.clientX, e.clientY);
    let id = ev.hitSpawn ? 'spawn' : ev.hitObjectId;
    // inside a region / particle area (picked by its edge with a click): select the area
    if (!id && ev.onTerrain && this.state.toolId === 'select') {
      id = this._tools?.areaAt?.(this.state, ev.x, ev.z) ?? null;
      if (id) this.state.select([id]);
    }
    if (id) {
      // an object: frame it here, and let the editor frame it in every view (same event as the
      // 2D map; the app's framing then takes over)
      this.focusSelection([id]);
      this.root.dispatchEvent(new CustomEvent('le-focus', { bubbles: true, detail: { id } }));
      return;
    }
    if (!ev.onTerrain) return;
    this._cameraTouched = true;
    this.cam.lookAt(ev.x, ev.surfaceY, ev.z, { distance: Math.min(this.cam.distanceTarget, 28) });
  }

  _beginPan(e) {
    const f = this.cam.focus;
    _plane.set(_v.set(0, 1, 0), -f.y);
    this._panPlaneY = f.y;
    this._panStart = this._planePoint(e.clientX, e.clientY);
  }

  _panTo(e) {
    if (!this._panStart) return;
    const p = this._planePoint(e.clientX, e.clientY);
    if (!p) return;
    const lim = this.cam.distance * 0.6;
    const dx = clamp(this._panStart.x - p.x, -lim, lim);
    const dz = clamp(this._panStart.z - p.z, -lim, lim);
    this.cam.pan(dx, dz);
    this.cam.apply();
  }

  _planePoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    _ndc.set(((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1);
    this.camera.updateMatrixWorld();
    _ray.origin.setFromMatrixPosition(this.camera.matrixWorld);
    _ray.direction.set(_ndc.x, _ndc.y, 0.5).unproject(this.camera).sub(_ray.origin).normalize();
    _plane.set(_v.set(0, 1, 0), -this._panPlaneY);
    if (Math.abs(_ray.direction.y) < 0.02) return null;
    const out = new THREE.Vector3();
    return _ray.intersectPlane(_plane, out);
  }

  _onKey(e, down) {
    if (this._disposed) return;
    const typing = isTyping(e.target);
    if (e.code === 'Space') {
      if (!down) {
        if (this._space) { this._space = false; this._updateCursor(); }
        return;
      }
      if (typing || document.querySelector('.le-overlay:not(.is-closing), .le-menu-popup.is-open')) return;
      if (this._hovering && this.active) {
        // over the 3D view Space arms the pan: never scroll the page or re-activate a focused
        // button / switch / slider
        e.preventDefault();
        const t = /** @type {HTMLElement|SVGElement|null} */ (document.activeElement);
        if (t && t !== document.body && !this.root.contains(t)) t.blur?.();
        if (!this._space) { this._space = true; this._updateCursor(); }
      }
      return;
    }
    if (!down) {
      this._keys.delete(e.code);
      return;
    }
    if (typing) return;
    const flying = this._drag && this._drag.button === 2;
    if (flying && FLY_KEYS.has(e.code)) {
      this._keys.add(e.code);
      this._drag.flew = true;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!this._hovering || !this.active) return;
    if (this.cam.mode === 'game' && (e.code === 'KeyQ' || e.code === 'KeyE') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this._keys.add(e.code);
      this._cameraTouched = true;
      return;
    }
    if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
      // the editor app frames the selection itself: only act when nobody handled the key
      setTimeout(() => { if (!e.defaultPrevented && !this._disposed) this.focusSelection(); }, 0);
    }
  }

  /** WASD/QE fly & turn while the right button is held; Q/E yaw in game mode. */
  _fly(dt) {
    const k = this._keys;
    if (!k.size) return;
    const cam = this.cam;
    const flying = this._drag && this._drag.button === 2;
    const turn = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    if (turn) cam.rotate(turn * dt * (flying ? 1.6 : 1.25));
    if (!flying) return;
    const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (!fwd && !side) return;
    const speed = cam.distance * 0.9 * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.5 : 1);
    const { forward, right } = cam.basis();
    cam.pan((forward.x * fwd + right.x * side) * speed * dt, (forward.z * fwd + right.z * side) * speed * dt);
  }

  _updateCursor(ev = this._lastEv) {
    if (this._drag) return;
    if (this._space && this._hovering) {
      if (this.canvas.style.cursor !== 'grab') this.canvas.style.cursor = 'grab';
      return;
    }
    const tool = this.tool;
    let c = null;
    try {
      c = (ev && tool?.cursorFor?.(ev, this.state)) || tool?.cursor;
    } catch { /* optional hook */ }
    const cur = typeof c === 'string' && c ? c : 'default';
    if (this.canvas.style.cursor !== cur) this.canvas.style.cursor = cur;
  }
}

/**
 * Tag every WebGL object with the context generation it was created in and make the delete calls
 * skip objects of an earlier (lost) generation. Returns a function starting the next generation
 * (call it when the context is lost).
 * @param {(WebGLRenderingContext|WebGL2RenderingContext) & { __luminatiGuard?: boolean }} gl
 */
function guardContextObjects(gl) {
  if (!gl || gl.__luminatiGuard) return () => {};
  let gen = 0;
  const kinds = ['Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'Program', 'Shader', 'VertexArray', 'Query', 'Sampler', 'TransformFeedback'];
  for (const k of kinds) {
    const create = gl[`create${k}`];
    const del = gl[`delete${k}`];
    if (typeof create !== 'function' || typeof del !== 'function') continue;
    gl[`create${k}`] = function createTagged(...a) {
      const o = create.apply(gl, a);
      if (o) o.__luminatiGen = gen;
      return o;
    };
    gl[`delete${k}`] = function deleteCurrent(o) {
      if (o && o.__luminatiGen !== undefined && o.__luminatiGen !== gen) return undefined;
      return del.call(gl, o);
    };
  }
  gl.__luminatiGuard = true;
  return () => { gen++; };
}

/**
 * The rect a critter group scatters its animals over (`critterStartPoints`): its yard
 * (`critterYard`), else the square of its roam radius.
 * @param {LevelObjectOf<'critters'>} o
 */
function critterScatterRect(o) {
  const yard = critterYard(o);
  if (yard) return yard;
  const x = Number(o.x) || 0;
  const z = Number(o.z) || 0;
  const R = Math.max(0.3, Number(o.radius) || 2.5);
  return { minX: x - R, maxX: x + R, minZ: z - R, maxZ: z + R };
}

function unionRect(a, b) {
  return {
    minI: Math.min(a.minI, b.minI), maxI: Math.max(a.maxI, b.maxI),
    minJ: Math.min(a.minJ, b.minJ), maxJ: Math.max(a.maxJ, b.maxJ),
  };
}

function isTyping(t) {
  if (!t || !(t instanceof Element)) return false;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || /** @type {HTMLElement} */ (t).isContentEditable) return true;
  // sliders, switches and buttons keep no keyboard (Space pans, F focuses…)
  return tag === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes((/** @type {HTMLInputElement} */ (t).type || 'text').toLowerCase());
}
