import * as THREE from 'three';
import { OBJECT_TYPES, ENEMY_INFO, enemyStartPoints } from '../../engine/level/ObjectCatalog.js';
import {
  COLORS, fatSegments, fillMesh, pointsObject, bracketSegments, boxEdges, disposeGeometry, parseCss,
} from './Gizmos.js';
import { cellQuads, cellOutline, rectFill, drapedPath, drapedRect, drapedCircle, pathToSegments } from './Drape.js';
import { ENEMY_COLORS, enemyKind, bossArena, bossGate } from './ActorPreview.js';
import { tr, editorLang } from '../i18n.js';

/**
 * @import { Level, TileRect } from '../../engine/level/types.js'
 * @import { LevelSurface } from './Picking.js'
 * @import { GizmoKit } from './Gizmos.js'
 * @import { LabelLayer } from './Labels.js'
 * @import { ToolPreview } from '../tools/index.js'
 * @import { ObjectPreview } from './ObjectPreview.js'
 * @import { ActorPreview } from './ActorPreview.js'
 */

const GRID_VERT = /* glsl */ `
attribute float aKind;
varying float vKind;
varying float vDepth;
void main() {
  vKind = aKind;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const GRID_FRAG = /* glsl */ `
uniform vec3 uMinor;
uniform vec3 uMajor;
uniform vec3 uBorder;
uniform vec3 uAlpha;
uniform vec2 uFade;
uniform vec3 uFocus; // depth, sharp range, enabled (diorama preview: out-of-focus lines fade like the blur)
varying float vKind;
varying float vDepth;
void main() {
  vec3 c = vKind < 0.5 ? uMinor : ( vKind < 1.5 ? uMajor : uBorder );
  float a = vKind < 0.5 ? uAlpha.x : ( vKind < 1.5 ? uAlpha.y : uAlpha.z );
  float f = 1.0 - smoothstep( uFade.x, uFade.y, vDepth );
  if ( uFocus.z > 0.5 ) f *= 1.0 - 0.9 * smoothstep( uFocus.y * 0.5, uFocus.y * 1.6, abs( vDepth - uFocus.x ) );
  if ( vKind > 1.5 ) f = max( f, 0.55 );
  if ( a * f < 0.004 ) discard;
  gl_FragColor = vec4( c, a * f );
  #include <colorspace_fragment>
}
`;

const MAJOR_EVERY = 8;
/** Tiles per grid chunk (terrain edits re-drape only the chunks around the change). */
const GRID_CHUNK = 16;
const C4 = [0, 0, 0, 0];
const C4b = [0, 0, 0, 0];

/**
 * Overlays — the editor feedback layer of the 3D viewport (rendered after the scene, crisp, never
 * tone-mapped / fogged / blurred, depth-tested against the scene):
 *  - a terrain-following tile grid (minor lines, every 8th brighter, gold map border), fading with
 *    distance;
 *  - the hover cell (from either view);
 *  - the active tool's preview: brush / fill cells draped on the terrain, line and rect previews,
 *    a floating label (the ghost object is a GhostPreview);
 *  - selection highlights: corner brackets around each selected object (dim x-ray through
 *    occluders), rings / outlines for actors and markers (an enemy group: home ring, boss arena
 *    and gate, name / kind tag), drag handles on line endpoints and region corners; a faint
 *    highlight for the object under the pointer (select tool).
 */
export class Overlays {
  /**
   * @param {{ overlay: THREE.Object3D, surface: LevelSurface, kit: GizmoKit,
   *           labels: LabelLayer }} ctx
   */
  constructor({ overlay, surface, kit, labels }) {
    this.surface = surface;
    this.kit = kit;
    this.labels = labels;
    this.root = new THREE.Group();
    this.root.name = 'Editor:overlays';
    overlay.add(this.root);

    // ---- grid
    this.gridMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uMinor: { value: new THREE.Color(COLORS.gridMinor) },
        uMajor: { value: new THREE.Color(COLORS.gridMajor) },
        uBorder: { value: new THREE.Color(COLORS.gridBorder) },
        uAlpha: { value: new THREE.Vector3(0.13, 0.26, 0.75) },
        uFade: { value: new THREE.Vector2(40, 120) },
        uFocus: { value: new THREE.Vector3(30, 10, 0) },
      },
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    /** Grid chunks by key "ci,cj" (LineSegments). */
    this.gridChunks = new Map();
    this.gridGroup = new THREE.Group();
    this.gridGroup.name = 'overlay:grid';
    this.root.add(this.gridGroup);
    this._gridSize = '';

    // ---- materials
    const k = kit;
    this.mat = {
      hoverFill: k.fillMaterial({ color: COLORS.hover, opacity: 0.16 }),
      hoverLine: k.lineMaterial({ color: COLORS.hover, width: 2, opacity: 0.95 }),
      cellFill: k.fillMaterial({ color: COLORS.brush, opacity: 0.2 }),
      cellLine: k.lineMaterial({ color: COLORS.brush, width: 2, opacity: 0.95 }),
      // dark halo under the brush outline: readable on any ground (tools colour it like the tile)
      cellHalo: k.lineMaterial({ color: '#070a12', width: 4.5, opacity: 0.5 }),
      // x-ray pass: the brush footprint stays readable under tree canopies / behind cliffs
      cellLineHidden: k.lineMaterial({ color: COLORS.brush, width: 1.25, opacity: 0.5, depthTest: false }),
      toolLine: k.lineMaterial({ color: COLORS.line, width: 3, opacity: 0.95 }),
      toolLineHidden: k.lineMaterial({ color: COLORS.line, width: 1.5, opacity: 0.3, depthTest: false }),
      rectFill: k.fillMaterial({ color: COLORS.rect, opacity: 0.14 }),
      rectLine: k.lineMaterial({ color: COLORS.rect, width: 2, opacity: 0.95, dashed: true, dashSize: 0.5, gapSize: 0.28 }),
      toolHandle: k.handleMaterial({ color: COLORS.line, size: 11 }),
      sel: k.lineMaterial({ color: COLORS.select, width: 2.5, opacity: 1 }),
      selHidden: k.lineMaterial({ color: COLORS.select, width: 1, opacity: 0.35, depthTest: false }),
      selSoft: k.lineMaterial({ color: COLORS.selectDim, width: 1.5, opacity: 0.55, dashed: true, dashSize: 0.3, gapSize: 0.22 }),
      selHandle: k.handleMaterial({ color: COLORS.select, size: 12 }),
      highlight: k.lineMaterial({ color: COLORS.hoverObject, width: 1.5, opacity: 0.6 }),
    };

    this.hoverGroup = this._group('hover');
    this.toolGroup = this._group('tool');
    this.selGroup = this._group('selection');
    this.highlightGroup = this._group('highlight');
    this.toolLabel = labels.create('tool');
    this.toolLabel.anchor = 'cursor';
    this.toolLabel.visible = false;
    this._hoverKey = '';
    this._toolKey = '';
  }

  _group(name) {
    const g = new THREE.Group();
    g.name = `overlay:${name}`;
    this.root.add(g);
    return g;
  }

  _clearGroup(g) {
    for (const c of [...g.children]) disposeGeometry(c);
  }

  // -------------------------------------------------------------------------------------------
  // Grid
  // -------------------------------------------------------------------------------------------

  /**
   * Rebuild the terrain-following grid from the level data: everything, or only the chunks around
   * the changed tiles `rect` (a tile's edges depend on its neighbours: ±1 tile).
   * @param {Level} level
   * @param {TileRect|null} [rect]
   */
  buildGrid(level, rect = null) {
    const W = level.width;
    const D = level.depth;
    const size = `${W}x${D}`;
    const C = GRID_CHUNK;
    let ci0 = 0; let ci1 = Math.ceil(W / C) - 1;
    let cj0 = 0; let cj1 = Math.ceil(D / C) - 1;
    if (!rect || size !== this._gridSize) {
      for (const m of this.gridChunks.values()) { m.geometry.dispose(); m.removeFromParent(); }
      this.gridChunks.clear();
      this._gridSize = size;
    } else {
      ci0 = Math.max(ci0, Math.floor((rect.minI - 1) / C));
      ci1 = Math.min(ci1, Math.floor((rect.maxI + 1) / C));
      cj0 = Math.max(cj0, Math.floor((rect.minJ - 1) / C));
      cj1 = Math.min(cj1, Math.floor((rect.maxJ + 1) / C));
    }
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) this._buildGridChunk(level, ci, cj);
  }

  _buildGridChunk(level, ci, cj) {
    const S = this.surface;
    const W = level.width;
    const D = level.depth;
    const C = GRID_CHUNK;
    const key = `${ci},${cj}`;
    const pos = [];
    const kind = [];
    const lift = 0.025;
    const seg = (x0, y0, z0, x1, y1, z1, k) => {
      pos.push(x0, y0 + lift, z0, x1, y1 + lift, z1);
      kind.push(k, k);
    };
    const kindX = (x) => (x === 0 || x === W ? 2 : x % MAJOR_EVERY === 0 ? 1 : 0); // line x = const
    const kindZ = (z) => (z === 0 || z === D ? 2 : z % MAJOR_EVERY === 0 ? 1 : 0);
    const j1 = Math.min(D, (cj + 1) * C);
    const i1 = Math.min(W, (ci + 1) * C);
    for (let j = cj * C; j < j1; j++) {
      for (let i = ci * C; i < i1; i++) {
        const c = S.corners(i, j, C4);
        if (!c) continue;
        const [nw, ne, se, sw] = c;
        // own north and west edges always; south / east only where the neighbour differs
        seg(i, nw, j, i + 1, ne, j, kindZ(j));
        seg(i, nw, j, i, sw, j + 1, kindX(i));
        const s = S.corners(i, j + 1, C4b);
        if (!s || Math.abs(s[0] - sw) > 1e-4 || Math.abs(s[1] - se) > 1e-4) seg(i, sw, j + 1, i + 1, se, j + 1, kindZ(j + 1));
        const e = S.corners(i + 1, j, C4b);
        if (!e || Math.abs(e[0] - ne) > 1e-4 || Math.abs(e[3] - se) > 1e-4) seg(i + 1, ne, j, i + 1, se, j + 1, kindX(i + 1));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    if (pos.length) g.computeBoundingSphere();
    else g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    let m = this.gridChunks.get(key);
    if (m) {
      m.geometry.dispose();
      m.geometry = g;
    } else {
      m = new THREE.LineSegments(g, this.gridMaterial);
      m.name = `overlay:grid:${key}`;
      m.renderOrder = -5;
      m.matrixAutoUpdate = false;
      this.gridGroup.add(m);
      this.gridChunks.set(key, m);
    }
  }

  setGridVisible(v) {
    this.gridGroup.visible = v;
  }

  /**
   * Fade the grid with the camera distance (called per frame); with the diorama preview on, lines
   * away from the focus depth fade out like the depth-of-field blur.
   * @param {number} distance camera → focus distance
   * @param {{ depth: number, range: number }|null} [focus]
   */
  updateGridFade(distance, focus = null) {
    const u = this.gridMaterial.uniforms;
    if (focus) u.uFocus.value.set(focus.depth, focus.range, 1);
    else u.uFocus.value.z = 0;
    u.uFade.value.set(distance * 0.9 + 6, distance * 2.1 + 20);
    const far = THREE.MathUtils.smoothstep(distance, 45, 140);
    u.uAlpha.value.set(0.13 * (1 - far * 0.85), 0.26 * (1 - far * 0.35), 0.75);
  }

  // -------------------------------------------------------------------------------------------
  // Hover cell
  // -------------------------------------------------------------------------------------------

  /** @param {{i:number,j:number}|null} hover @param {Level} level */
  setHover(hover, level, { hideCell = false } = {}) {
    const inside = hover && hover.i >= 0 && hover.j >= 0 && hover.i < level.width && hover.j < level.depth;
    const key = inside && !hideCell ? `${hover.i},${hover.j}|${level.heights[hover.j][hover.i]}${level.tiles[hover.j][hover.i]}` : '';
    if (key === this._hoverKey) return;
    this._hoverKey = key;
    this._clearGroup(this.hoverGroup);
    if (!key) return;
    const cells = [{ i: hover.i, j: hover.j }];
    this.hoverGroup.add(fillMesh(cellQuads(this.surface, cells, 0.03, 0.02), this.mat.hoverFill));
    this.hoverGroup.add(fatSegments(cellOutline(this.surface, cells, 0.04), this.mat.hoverLine));
  }

  // -------------------------------------------------------------------------------------------
  // Tool preview
  // -------------------------------------------------------------------------------------------

  /**
   * @param {ToolPreview|null} p its cells, cellColor, line, rect, label
   *   and highlight (the ghost / spawn ghost are drawn by GhostPreview)
   * @param {{ x: number, y: number }|null} cursor pointer position in CSS px (for the label)
   * @param {THREE.Vector3|null} anchor world point for the label when there is no cursor
   * @param {{ level: Level, props: ObjectPreview,
   *           actors: ActorPreview, force?: boolean,
   *           terrainVersion?: number }} ctx
   *   for highlight outlines; terrainVersion: bumped on terrain edits (the draped preview follows
   *   the ground, e.g. a height brush right after it raised the cells under it)
   */
  setToolPreview(p, cursor, anchor, ctx) {
    const key = p ? `${cellsKey(p.cells)}|${p.cellColor ?? ''}|${JSON.stringify([p.line, p.rect])}|${ctx.terrainVersion ?? 0}` : '';
    if (key !== this._toolKey) {
      this._toolKey = key;
      this._clearGroup(this.toolGroup);
      if (p) this._buildToolPreview(p);
    }
    const hl = p?.highlight?.ids?.length ? p.highlight : null;
    const hkey = hl ? JSON.stringify(hl) : '';
    if (hkey !== this._highlightKey || (hl && ctx.force)) {
      this._highlightKey = hkey;
      this._clearGroup(this.highlightGroup);
      if (hl) {
        const { color, alpha } = parseCss(hl.color, COLORS.hoverObject);
        this.mat.highlight.color.copy(color);
        this.mat.highlight.opacity = Math.max(0.35, alpha);
        const segs = [];
        for (const id of hl.ids.slice(0, 400)) this._outline(id, ctx, segs, [], [], false);
        if (segs.length) this.highlightGroup.add(fatSegments(segs, this.mat.highlight));
      }
    }
    const lab = this.toolLabel;
    if (p?.label) {
      lab.setText(String(p.label));
      lab.visible = true;
      if (cursor) lab.screenOffset = { x: cursor.x, y: cursor.y };
      else {
        lab.screenOffset = null;
        if (anchor) lab.world.copy(anchor);
      }
      lab.anchor = cursor ? 'cursor' : 'above';
    } else lab.visible = false;
  }

  _buildToolPreview(p) {
    const S = this.surface;
    const g = this.toolGroup;
    if (p.cells?.length) {
      const { color, alpha } = parseCss(p.cellColor, COLORS.brush);
      this.mat.cellFill.color.copy(color);
      // the outline is the tool colour lifted toward white (a brown dirt brush must still read
      // on brown ground), over a dark halo
      this.mat.cellLine.color.copy(color).lerp(WHITE, 0.35);
      this.mat.cellLineHidden.color.copy(this.mat.cellLine.color);
      // tools pass translucent rgba() colours meant for a flat 2D fill: keep the fill light and
      // the outline readable
      this.mat.cellFill.opacity = Math.min(0.34, Math.max(0.16, alpha * 0.6));
      this.mat.cellLine.opacity = Math.max(0.9, alpha);
      const cells = p.cells.length > 20000 ? p.cells.slice(0, 20000) : p.cells;
      g.add(fillMesh(cellQuads(S, cells, 0.035, 0), this.mat.cellFill));
      const outline = cellOutline(S, cells, 0.045);
      if (cells.length <= 400) g.add(fatSegments(outline, this.mat.cellLineHidden));
      g.add(fatSegments(outline, this.mat.cellHalo));
      g.add(fatSegments(outline, this.mat.cellLine));
    }
    if (p.rect) {
      const r = normRect(p.rect);
      g.add(fillMesh(rectFill(S, r, 0.04), this.mat.rectFill));
      const l = fatSegments(pathToSegments(drapedRect(S, r, { lift: 0.06, step: 0.35 })), this.mat.rectLine);
      l.computeLineDistances();
      g.add(l);
    }
    if (p.line) {
      const { x0, z0, x1, z1 } = p.line;
      const path = drapedPath(S, [{ x: x0, z: z0 }, { x: x1, z: z1 }], { step: 0.2, lift: 0.08 });
      const segs = pathToSegments(path);
      g.add(fatSegments(segs, this.mat.toolLineHidden));
      g.add(fatSegments(segs, this.mat.toolLine));
      g.add(pointsObject([x0, S.surfaceAt(x0, z0) + 0.1, z0, x1, S.surfaceAt(x1, z1) + 0.1, z1], this.mat.toolHandle));
    }
  }

  // -------------------------------------------------------------------------------------------
  // Selection / hover object
  // -------------------------------------------------------------------------------------------

  /**
   * @param {string[]} ids selected ids ('spawn' = player start)
   * @param {{ level: Level, props: ObjectPreview,
   *           actors: ActorPreview }} ctx
   */
  setSelection(ids, ctx) {
    this._clearGroup(this.selGroup);
    for (const l of this.labels.labels) l.el.classList.remove('selected');
    if (this._npcLabels) for (const l of this._npcLabels) this.labels.remove(l);
    this._npcLabels = [];
    const segs = [];
    const soft = [];
    const handles = [];
    for (const id of ids) this._outline(id, ctx, segs, soft, handles, true);
    if (segs.length) {
      this.selGroup.add(fatSegments(segs, this.mat.selHidden));
      this.selGroup.add(fatSegments(segs, this.mat.sel));
    }
    if (soft.length) {
      const l = fatSegments(soft, this.mat.selSoft);
      l.computeLineDistances();
      this.selGroup.add(l);
    }
    if (handles.length) this.selGroup.add(pointsObject(handles, this.mat.selHandle));
  }

  /**
   * Append the overlay parts of one object's selection / highlight (segments, dashed "soft"
   * segments, handles). Objects with meshes or sprites get their silhouette from
   * SelectionOutline; this draws what has no geometry (regions, particle boxes, point lights,
   * rings, line paths) and the drag handles.
   */
  _outline(id, { level, actors }, segs, soft, handles, selected) {
    const S = this.surface;
    if (id === 'spawn') {
      const sp = actors.spawn;
      if (!sp) return;
      pathToSegments(drapedCircle(S, sp.data.x, sp.data.z, 0.8, { lift: 0.07, segments: 40 }), segs);
      if (sp.box) bracketSegments(sp.box, IDENTITY, 0.28, selected ? segs : soft);
      return;
    }
    const obj = level.objects.find((o) => o.id === id);
    const def = obj && OBJECT_TYPES[obj.type];
    if (!def) return;
    const ae = actors.get(id);
    if (ae?.type === 'emitter') {
      if (ae.volume) boxEdges(ae.volume, IDENTITY, segs);
    } else if ((ae?.type === 'light' || ae?.type === 'entrance' || ae?.type === 'marker') && ae.box) {
      bracketSegments(ae.box, IDENTITY, 0.3, segs);
    } else if (ae?.type === 'region' || ae?.type === 'exit' || ae?.type === 'event') {
      pathToSegments(drapedRect(S, normRect(obj), { lift: 0.08, step: 0.4 }), segs);
      if (ae.label && selected) ae.label.el.classList.add('selected');
    }
    if (!selected) return;
    if (def.placement === 'line') {
      pathToSegments(drapedPath(S, [{ x: obj.x0, z: obj.z0 }, { x: obj.x1, z: obj.z1 }], { step: 0.25, lift: 0.1 }), soft);
      handles.push(obj.x0, S.surfaceAt(obj.x0, obj.z0) + 0.12, obj.z0, obj.x1, S.surfaceAt(obj.x1, obj.z1) + 0.12, obj.z1);
    } else if (def.placement === 'rect') {
      for (const [x, z] of [[obj.minX, obj.minZ], [obj.maxX, obj.minZ], [obj.maxX, obj.maxZ], [obj.minX, obj.maxZ]]) handles.push(x, S.surfaceAt(x, z) + 0.12, z);
    } else if (obj.type === 'npc') {
      if ((obj.wander ?? 0) > 0.05) pathToSegments(drapedCircle(S, obj.x, obj.z, obj.wander, { lift: 0.06 }), soft);
      const l = this.labels.create('npc');
      l.setText(obj.name || 'NPC');
      l.world.set(obj.x, S.groundAt(obj.x, obj.z) + 2.25, obj.z);
      this._npcLabels.push(l);
    } else if (obj.type === 'critters') {
      pathToSegments(drapedCircle(S, obj.x, obj.z, obj.radius ?? 2.5, { lift: 0.07 }), segs);
    } else if (obj.type === 'enemy') {
      // home ring, the boss arena (dashed) and its gate (the boss kind only: the game ignores
      // another kind's), and a name / kind tag over the group
      const kind = enemyKind(obj);
      const info = ENEMY_INFO[kind];
      const arena = bossArena(obj);
      const gate = bossGate(obj);
      if (!info.boss || !arena) pathToSegments(drapedCircle(S, obj.x, obj.z, Number(obj.radius) || 3, { lift: 0.07 }), segs);
      if (arena) {
        pathToSegments(drapedRect(S, arena, { lift: 0.09, step: 0.4 }), soft);
        // corner handles (the select tool reshapes the arena, SelectTool.selectionHandles)
        for (const [x, z] of [[arena.minX, arena.minZ], [arena.maxX, arena.minZ], [arena.maxX, arena.maxZ], [arena.minX, arena.maxZ]]) handles.push(x, S.surfaceAt(x, z) + 0.12, z);
      }
      if (gate) {
        pathToSegments(drapedPath(S, [{ x: gate[0], z: gate[1] }, { x: gate[2], z: gate[3] }], { step: 0.25, lift: 0.12 }), segs);
        handles.push(gate[0], S.surfaceAt(gate[0], gate[1]) + 0.12, gate[1], gate[2], S.surfaceAt(gate[2], gate[3]) + 0.12, gate[3]);
      }
      const n = enemyStartPoints(obj).length;
      const l = this.labels.create('npc');
      l.setText(obj.name || info.label, `${editorLang() === 'zh' ? info.label : kind} ×${n} · Lv${obj.level ?? 1}${obj.elite ? ` · ${tr('tools.view3d.elite')}` : ''}`);
      l.el.style.borderColor = obj.elite ? ENEMY_COLORS.elite : ENEMY_COLORS.ring;
      const top = ae?.box && !ae.box.isEmpty() ? ae.box.max.y : S.groundAt(obj.x, obj.z) + 1.4;
      l.world.set(obj.x, top + 0.45, obj.z);
      this._npcLabels.push(l);
    } else if (obj.type === 'emitter') {
      // corner handles (resize), on the ground under the particle box
      const hx = (obj.size?.[0] ?? 8) / 2;
      const hz = (obj.size?.[2] ?? 8) / 2;
      const r = { minX: obj.x - hx, maxX: obj.x + hx, minZ: obj.z - hz, maxZ: obj.z + hz };
      pathToSegments(drapedRect(S, r, { lift: 0.06, step: 0.5 }), soft);
      for (const [x, z] of [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]]) handles.push(x, S.surfaceAt(x, z) + 0.12, z);
    }
  }

  /** Per-frame: label positions are projected by the LabelLayer; nothing else animates. */
  dispose() {
    for (const g of [this.hoverGroup, this.toolGroup, this.selGroup, this.highlightGroup]) this._clearGroup(g);
    for (const m of this.gridChunks.values()) m.geometry.dispose();
    this.gridChunks.clear();
    this.gridMaterial.dispose();
    this.labels.remove(this.toolLabel);
    for (const l of this._npcLabels ?? []) this.labels.remove(l);
    this.root.removeFromParent();
  }
}

const IDENTITY = new THREE.Matrix4();
const WHITE = new THREE.Color(1, 1, 1);

/** Cheap identity key of a cell list (previews may hold thousands of cells, e.g. a flood fill). */
function cellsKey(cells) {
  if (!cells?.length) return '';
  let h = 2166136261;
  for (let k = 0; k < cells.length; k++) {
    h = Math.imul(h ^ (cells[k].i & 0xffff), 16777619);
    h = Math.imul(h ^ (cells[k].j & 0xffff), 16777619);
  }
  return `${cells.length}:${h >>> 0}`;
}

function normRect(r) {
  return {
    minX: Math.min(r.minX, r.maxX), maxX: Math.max(r.minX, r.maxX),
    minZ: Math.min(r.minZ, r.maxZ), maxZ: Math.max(r.minZ, r.maxZ),
  };
}
