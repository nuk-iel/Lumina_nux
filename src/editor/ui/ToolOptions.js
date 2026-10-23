/**
 * Tool options panel (left column): per-tool options with the tile palette (real texture
 * swatches from the TextureLibrary), brush size / shape, height mode and value, stairs direction,
 * the object palette grouped by catalog category, rotation and snapping.
 */
import { h, icon, clear } from './dom.js';
import { tooltip } from './Tooltip.js';
import { segmented, numberControl, boolControl } from './fields.js';
import { ICONS } from '../icons.js';
import { getTool, HEIGHT_MODES } from '../tools/index.js';
import { tileColor } from '../tools/common.js';
import { PlaceTool } from '../tools/PlaceTool.js';
import { TILE_TYPES, TILE_BY_CHAR, MAX_LEVEL } from '../../engine/level/LevelFormat.js';
import { OBJECT_TYPES, OBJECT_CATEGORIES } from '../../engine/level/ObjectCatalog.js';
import { ownValue } from '../../engine/utils/own.js';
import { tr } from '../i18n.js';
import { categoryLabel, optionLabel } from '../catalogI18n.js';

/**
 * @import { EditorState } from '../EditorState.js'
 * @import { TextureLibrary } from '../../engine/pixel/Textures.js'
 */

/** @type {[string, () => string][]} tile category → its palette heading */
const TILE_CATEGORIES = [
  ['ground', () => tr('tools.opts.tileCat.ground')], ['path', () => tr('tools.opts.tileCat.path')], ['water', () => tr('tools.opts.tileCat.water')],
  ['stairs', () => tr('tools.opts.tileCat.stairs')], ['special', () => tr('tools.opts.tileCat.special')],
];

/** Palette tooltip word for an object kind ('actor' reads "character"). */
const KIND_LABELS = { actor: () => tr('tools.opts.kind.actor'), marker: () => tr('tools.opts.kind.marker'), prop: () => tr('tools.opts.kind.prop') };

const SQUARE = '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4.5" y="4.5" width="11" height="11" rx="1.2" fill="currentColor" fill-opacity=".2"/></svg>';
const CIRCLE = '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="6" fill="currentColor" fill-opacity=".2"/></svg>';
const DEG = 180 / Math.PI;
/** Swatch rotation of a stairs tile (the treads rise toward its direction). */
const STAIR_ANGLE = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 };

/**
 * Paint a 32×32 swatch of a legend entry into `canvas` from the tile's top texture.
 * Exported for other panels (inspector, dialogs).
 */
export function paintTileSwatch(canvas, def, ch, textures) {
  const S = 32;
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const color = tileColor(ch, def);
  if (!def || def.void) {
    g.fillStyle = '#0c0f19';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.beginPath();
    for (let k = -S; k < S; k += 6) { g.moveTo(k, S); g.lineTo(k + S, 0); }
    g.stroke();
    return;
  }
  let tex = null;
  try { tex = textures?.canvas?.(def.top) ?? textures?.get(def.top)?.image ?? null; } catch { tex = null; }
  if (tex?.width) {
    if (tex.width >= S && tex.height >= S) g.drawImage(tex, 0, 0, S, S, 0, 0, S, S);
    else for (let y = 0; y < S; y += tex.height) for (let x = 0; x < S; x += tex.width) g.drawImage(tex, x, y);
  } else {
    g.fillStyle = color;
    g.fillRect(0, 0, S, S);
  }
  if (def.water) {
    g.fillStyle = hexA(color, 0.7);
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(230,246,255,0.75)';
    g.lineWidth = 1;
    const flow = def.flow ?? 1;
    const lines = flow === 0 ? [[6, 10], [18, 22]] : flow > 1.5 ? [[3, 7], [13, 11], [22, 19], [9, 26]] : [[5, 9], [17, 16], [8, 25]];
    for (const [x, y] of lines) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 4, y - 2, x + 8, y); g.stroke(); }
  }
  if (!def.water && def.walkable === false) {
    if (/grass/.test(def.top ?? '')) {
      for (const [x, y, r] of [[10, 11, 6], [22, 21, 7], [24, 7, 4]]) {
        g.fillStyle = 'rgba(8,24,12,0.55)'; g.beginPath(); g.arc(x + 1, y + 1.5, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#244a28'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(120,170,90,0.35)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.45, 0, Math.PI * 2); g.fill();
      }
    } else {
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.beginPath();
      for (let k = -S; k < S; k += 6) { g.moveTo(k + 0.5, S); g.lineTo(k + S + 0.5, 0); }
      g.stroke();
    }
  }
  if (def.stairs) {
    const ang = ownValue(STAIR_ANGLE, def.stairs) ?? 0;
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(ang);
    for (let k = 0; k < 4; k++) {
      g.fillStyle = `rgba(255,248,230,${0.05 + k * 0.06})`;
      g.fillRect(-S / 2, S / 2 - (k + 1) * 8, S, 8);
      g.fillStyle = 'rgba(20,14,10,0.5)';
      g.fillRect(-S / 2, S / 2 - (k + 1) * 8, S, 1);
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(20,14,10,0.85)';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(-7, 4); g.lineTo(0, -5); g.lineTo(7, 4); g.stroke();
    g.strokeStyle = '#fff6dc';
    g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(-7, 4); g.lineTo(0, -5); g.lineTo(7, 4); g.stroke();
    g.restore();
  }
}

function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(60,120,170,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/** A coloured glyph badge for an object type (palette, outliner, inspector). */
export function glyphBadge(type, size = 'md') {
  const def = OBJECT_TYPES[type];
  return h('span', { class: `le-glyph is-${size}`, style: { '--c': def?.color ?? '#c9a45c' }, 'aria-hidden': 'true' }, def?.glyph ?? '?');
}

export class ToolOptions {
  /**
   * @param {HTMLElement} host
   * @param {EditorState} state
   * @param {{ textures: TextureLibrary }} opts
   */
  constructor(host, state, { textures }) {
    this.state = state;
    this.textures = textures;
    this.el = h('aside', { class: 'le-panel le-tooloptions', 'aria-label': tr('tools.opts.aria') });
    this.header = h('div', { class: 'le-panel-header' });
    this.body = h('div', { class: 'le-panel-body le-scroll' });
    this.el.append(this.header, this.body);
    host.appendChild(this.el);
    this._controls = {};
    state.on('tool', () => this.render());
    state.on('toolOptions', () => this.sync());
    state.on('preview', () => this._syncRotation());
    state.on('change', (info) => {
      if (info.source === 'load' || (info.meta && info.terrain)) { this.render(); return; }
      // R / the inspector / undo can turn the player start while its tool is active
      if (info.objects) this._controls.spawnFacing?.set(state.level.spawn.facing);
    });
    this.render();
  }

  render() {
    const tool = getTool(this.state.toolId);
    clear(this.header).append(
      icon(tool.icon, 'le-icon le-panel-header-icon'),
      h('span', { class: 'le-panel-title' }, tool.label),
      h('kbd', { class: 'le-kbd' }, tool.shortcut),
    );
    clear(this.body);
    this._controls = {};
    const add = (...nodes) => this.body.append(...nodes.filter(Boolean));
    const opts = this.state.toolOptions;
    const set = (k, v) => this.state.setToolOption(k, v);
    switch (tool.id) {
      case 'paint':
        add(this._brushSection(), this._tilePaletteSection(), this._paintHeightSection());
        break;
      case 'fill':
        add(this._section(tr('tools.opts.fill'), [
          this._toggleRow('fillMatchHeight', tr('tools.opts.sameHeight'), tr('tools.opts.sameHeightHelp')),
          h('p', { class: 'le-hint' }, tr('tools.opts.fillHint')),
        ]), this._tilePaletteSection(), this._paintHeightSection());
        break;
      case 'rect':
        add(this._section(tr('tools.opts.rectangle'), [this._toggleRow('rectOutline', tr('tools.opts.outlineOnly'), tr('tools.opts.outlineHelp'))]), this._tilePaletteSection(), this._paintHeightSection());
        break;
      case 'height': {
        const modes = segmented({
          options: HEIGHT_MODES.map((m) => ({ value: m.id, label: m.label, title: m.help })),
          value: opts.heightMode, onChange: (v) => set('heightMode', v), small: true, className: 'is-wrap',
        });
        this._controls.heightMode = modes;
        const modeHelp = h('p', { class: 'le-hint' }, HEIGHT_MODES.find((m) => m.id === opts.heightMode)?.help ?? '');
        this._controls.modeHelp = modeHelp;
        const target = this._levelSection(tr('tools.opts.targetLevel'), tr('tools.opts.targetLevelNote'));
        this._controls.setTarget = target;
        target.classList.toggle('is-disabled', opts.heightMode !== 'set');
        add(this._section(tr('tools.opts.mode'), [modes.el, modeHelp]), target, this._brushSection(),
          this._section(tr('tools.opts.tips'), [h('p', { class: 'le-hint' }, tr('tools.opts.heightTips'))]));
        break;
      }
      case 'stairs': {
        const dir = segmented({
          options: [{ value: 'auto', label: tr('tools.opts.auto') }, { value: 'N', label: '↑ N' }, { value: 'S', label: '↓ S' }, { value: 'E', label: '→ E' }, { value: 'W', label: '← W' }],
          value: opts.stairsDir ?? 'auto', onChange: (v) => set('stairsDir', v), small: true, className: 'is-wrap',
        });
        this._controls.stairsDir = dir;
        add(this._section(tr('tools.opts.direction'), [dir.el, h('p', { class: 'le-hint' }, tr('tools.opts.stairsHint'))]));
        add(this._tileStrip(['^', 'v', '>', '<']));
        break;
      }
      case 'place':
        add(this._placeSection(), this._objectPaletteSection());
        break;
      case 'select':
        // the top card has the Place tool's height: the object palette below stays exactly where
        // it is when a click on it switches to the Place tool
        add(this._section(tr('tools.opts.selecting'), [h('div', { class: 'le-top-card' },
          h('p', { class: 'le-hint' }, tr('tools.opts.selectHint')),
          this._toggleRow('snap', tr('tools.opts.snapToGrid'), tr('tools.opts.selectSnapHelp')))]),
          this._objectPaletteSection(tr('tools.opts.addObject')),
          this._section(tr('tools.opts.gestures'), [h('ul', { class: 'le-gestures' },
            gesture(tr('tools.gesture.click'), tr('tools.gesture.select')), gesture(tr('tools.gesture.shiftClick'), tr('tools.gesture.addToSelection')),
            gesture(tr('tools.gesture.ctrlClick'), tr('tools.gesture.toggle')), gesture(tr('tools.gesture.dragEmpty'), tr('tools.gesture.boxSelect')),
            gesture(tr('tools.gesture.drag'), tr('tools.gesture.moveFree')), gesture('R / Shift+R', tr('tools.gesture.rotate')),
            gesture(tr('tools.gesture.arrows'), tr('tools.gesture.nudge')), gesture('Del', tr('tools.gesture.delete')), gesture('Ctrl+D', tr('tools.gesture.duplicate')),
            gesture('F', tr('tools.gesture.frameSelection')), gesture(tr('tools.gesture.doubleClick'), tr('tools.gesture.focusObject'))),
          h('div', { class: 'le-palette-group' }, tr('tools.opts.map2d')),
          h('ul', { class: 'le-gestures' }, gesture(tr('tools.gesture.wheel'), tr('tools.gesture.zoom')), gesture(tr('tools.gesture.rightOrSpaceDrag'), tr('tools.gesture.pan'))),
          h('div', { class: 'le-palette-group' }, tr('tools.opts.view3d')),
          h('ul', { class: 'le-gestures' }, gesture(tr('tools.gesture.rightDrag'), tr('tools.gesture.orbit')), gesture(tr('tools.gesture.middleDrag'), tr('tools.gesture.pan')),
            gesture(tr('tools.gesture.spaceDrag'), tr('tools.gesture.pan')), gesture(tr('tools.gesture.wheel'), tr('tools.gesture.zoom')), gesture(tr('tools.gesture.rightWasd'), tr('tools.gesture.fly')))]));
        break;
      case 'spawn': {
        const facing = segmented({
          options: [{ value: 'down', label: '↓', title: tr('tools.opts.faceDown') }, { value: 'left', label: '←', title: tr('tools.opts.faceLeft') }, { value: 'up', label: '↑', title: tr('tools.opts.faceUp') }, { value: 'right', label: '→', title: tr('tools.opts.faceRight') }],
          value: this.state.level.spawn.facing, onChange: (v) => { const s = this.state.level.spawn; this.state.setSpawn(s.x, s.z, v); }, small: true,
        });
        this._controls.spawnFacing = facing;
        add(this._section(tr('tools.opts.facing'), [facing.el, h('p', { class: 'le-hint' }, tr('tools.opts.spawnHint'))]),
          this._section(tr('tools.opts.snapping'), [this._toggleRow('snap', tr('tools.opts.snapTileCentres'), tr('tools.opts.freePosition'))]));
        break;
      }
      case 'eyedropper':
        add(this._section(tr('tools.opts.picked'), [this._currentTileRow(), this._currentObjectRow()]),
          h('p', { class: 'le-hint le-pad' }, tr('tools.opts.eyedropperHint')));
        break;
      case 'erase':
        add(h('p', { class: 'le-hint le-pad' }, tr('tools.opts.eraseHint')));
        break;
      default:
        break;
    }
  }

  /** Update control states after a tool option changed (without rebuilding). */
  sync() {
    const o = this.state.toolOptions;
    const c = this._controls;
    c.heightMode?.set(o.heightMode);
    if (c.modeHelp) c.modeHelp.textContent = HEIGHT_MODES.find((m) => m.id === o.heightMode)?.help ?? '';
    c.setTarget?.classList.toggle('is-disabled', o.heightMode !== 'set');
    c.stairsDir?.set(o.stairsDir ?? 'auto');
    c.brushSize?.set(o.brushSize);
    c.brushShape?.set(o.brushShape);
    c.heightValue?.set(o.heightValue);
    for (const k of ['snap', 'paintHeight', 'fillMatchHeight', 'rectOutline']) c[`t_${k}`]?.set(!!o[k]);
    if (c.tiles) for (const [ch, b] of c.tiles) b.classList.toggle('is-active', ch === o.tile);
    if (c.objects) for (const [t, b] of c.objects) b.classList.toggle('is-active', t === o.objectType);
    c.currentTile?.refresh();
    c.currentObject?.refresh();
    c.placeInfo?.refresh();
  }

  _syncRotation() {
    this._controls.placeInfo?.refresh();
  }

  // -------------------------------------------------------------------------------------------

  _section(title, content, right = null) {
    return h('section', { class: 'le-section' },
      h('div', { class: 'le-section-head' }, h('span', { class: 'le-section-title' }, title), right),
      h('div', { class: 'le-section-body' }, content));
  }

  _toggleRow(key, label, help = '') {
    const t = boolControl({ value: !!this.state.toolOptions[key], label, onChange: (v) => this.state.setToolOption(key, v) });
    this._controls[`t_${key}`] = t;
    return h('div', { class: 'le-row', title: help || null }, t.el);
  }

  _brushSection() {
    const o = this.state.toolOptions;
    const size = numberControl({ value: o.brushSize, min: 1, max: 9, step: 1, int: true, onChange: (v) => this.state.setToolOption('brushSize', Math.max(1, Math.min(9, v ?? 1))) });
    const shape = segmented({
      options: [
        { value: 'square', icon: SQUARE, title: tr('tools.opts.squareBrush'), label: tr('tools.opts.square'), iconOnly: true },
        { value: 'circle', icon: CIRCLE, title: tr('tools.opts.roundBrush'), label: tr('tools.opts.round'), iconOnly: true },
      ],
      value: o.brushShape, onChange: (v) => this.state.setToolOption('brushShape', v), small: true,
    });
    this._controls.brushSize = size;
    this._controls.brushShape = shape;
    return this._section(tr('tools.opts.brush'), [
      h('div', { class: 'le-field' }, h('label', { class: 'le-field-label' }, tr('tools.opts.size')), h('div', { class: 'le-field-control' }, size.el)),
      h('div', { class: 'le-field' }, h('label', { class: 'le-field-label' }, tr('tools.opts.shape')), h('div', { class: 'le-field-control' }, shape.el)),
    ], h('span', { class: 'le-section-note' }, '[ / ]'));
  }

  _levelSection(title, note = '') {
    const o = this.state.toolOptions;
    const val = numberControl({ value: o.heightValue, min: 0, max: MAX_LEVEL, step: 1, int: true, onChange: (v) => this.state.setToolOption('heightValue', Math.max(0, Math.min(MAX_LEVEL, v ?? 0))) });
    this._controls.heightValue = val;
    return this._section(title, [
      h('div', { class: 'le-field' }, h('label', { class: 'le-field-label' }, tr('tools.opts.level')), h('div', { class: 'le-field-control' }, val.el)),
      h('p', { class: 'le-hint' }, note || tr('tools.opts.levelNote')),
    ]);
  }

  _paintHeightSection() {
    const o = this.state.toolOptions;
    const val = numberControl({ value: o.heightValue, min: 0, max: MAX_LEVEL, step: 1, int: true, onChange: (v) => this.state.setToolOption('heightValue', Math.max(0, Math.min(MAX_LEVEL, v ?? 0))) });
    this._controls.heightValue = val;
    return this._section(tr('tools.opts.height'), [
      this._toggleRow('paintHeight', tr('tools.opts.alsoSetHeight')),
      h('div', { class: 'le-field' }, h('label', { class: 'le-field-label' }, tr('tools.opts.level')), h('div', { class: 'le-field-control' }, val.el)),
    ]);
  }

  _currentTileRow() {
    const cv = h('canvas', { class: 'le-swatch-canvas' });
    const name = h('span', { class: 'le-current-name' });
    const row = h('div', { class: 'le-current' }, h('span', { class: 'le-swatch is-static' }, cv), h('div', null, h('div', { class: 'le-current-label' }, tr('tools.opts.tile')), name));
    const refresh = () => {
      const ch = this.state.toolOptions.tile;
      const def = ownValue(this.state.level.legend, ch);
      paintTileSwatch(cv, def, ch, this.textures);
      name.textContent = `${ownValue(TILE_BY_CHAR, ch)?.name ?? tr('tools.tile.custom', { ch })} · ${tr('tools.levelN', { level: this.state.toolOptions.heightValue })}`;
    };
    refresh();
    this._controls.currentTile = { refresh };
    return row;
  }

  _currentObjectRow() {
    const holder = h('span');
    const name = h('span', { class: 'le-current-name' });
    const row = h('div', { class: 'le-current' }, holder, h('div', null, h('div', { class: 'le-current-label' }, tr('tools.opts.object')), name));
    const refresh = () => {
      const t = this.state.toolOptions.objectType;
      clear(holder).appendChild(glyphBadge(t, 'lg'));
      name.textContent = OBJECT_TYPES[t]?.label ?? t;
    };
    refresh();
    this._controls.currentObject = { refresh };
    return row;
  }

  _tilePaletteSection() {
    const L = this.state.level;
    const tiles = new Map();
    const groups = [];
    const known = new Set(TILE_TYPES.map((t) => t.char));
    for (const [cat, title] of TILE_CATEGORIES) {
      const list = TILE_TYPES.filter((t) => t.category === cat && L.legend[t.char]);
      if (list.length) groups.push([title(), list.map((t) => ({ ch: t.char, name: t.name, def: L.legend[t.char] }))]);
    }
    // (only one-character keys: a longer one — normalizeLevel warns — cannot be painted)
    const custom = Object.keys(L.legend).filter((ch) => ch.length === 1 && !known.has(ch)).map((ch) => ({
      ch, name: tr('tools.tile.customTop', { ch, top: L.legend[ch].top != null ? optionLabel(L.legend[ch].top) : tr('tools.tile.void') }), def: L.legend[ch],
    }));
    if (custom.length) groups.push([tr('tools.opts.tileCat.custom'), custom]);
    const content = [];
    for (const [title, list] of groups) {
      content.push(h('div', { class: 'le-palette-group' }, title));
      const grid = h('div', { class: 'le-tile-grid' });
      for (const t of list) {
        const cv = h('canvas', { class: 'le-swatch-canvas' });
        paintTileSwatch(cv, t.def, t.ch, this.textures);
        const b = h('button', {
          class: ['le-swatch', t.ch === this.state.toolOptions.tile && 'is-active'], type: 'button', 'aria-label': t.name,
          onClick: () => this.state.setToolOption('tile', t.ch),
        }, cv, h('span', { class: 'le-swatch-bar', style: { background: tileColor(t.ch, t.def) } }));
        const flow = t.def.flow == null ? '' : Array.isArray(t.def.flow) ? ` · ${tr('tools.opts.flowDir', { dir: t.def.flow.join(', ') })}` : ` · ${tr('tools.opts.flow', { flow: t.def.flow })}`;
        const flags = t.def.void ? tr('tools.opts.void') : t.def.water ? `${tr('tools.opts.water')}${flow}` : t.def.walkable === false ? tr('tools.opts.blocked')
          : t.def.stairs ? tr('tools.opts.stairsRising', { dir: t.def.stairs }) : tr('tools.opts.walkable');
        tooltip(b, { title: t.name, key: `“${t.ch}”`, text: tr('tools.opts.tileTip', { flags, top: t.def.top != null ? optionLabel(t.def.top) : '—' }), place: 'right' });
        tiles.set(t.ch, b);
        grid.appendChild(b);
      }
      content.push(grid);
    }
    this._controls.tiles = tiles;
    return this._section(tr('tools.opts.tiles'), content);
  }

  _tileStrip(chars) {
    const L = this.state.level;
    const grid = h('div', { class: 'le-tile-grid' });
    for (const ch of chars) {
      if (!L.legend[ch]) continue;
      const cv = h('canvas', { class: 'le-swatch-canvas' });
      paintTileSwatch(cv, L.legend[ch], ch, this.textures);
      const b = h('div', { class: 'le-swatch is-static' }, cv);
      tooltip(b, { title: ownValue(TILE_BY_CHAR, ch)?.name ?? ch, key: `“${ch}”`, place: 'right' });
      grid.appendChild(b);
    }
    return this._section(tr('tools.opts.stairsTiles'), [grid]);
  }

  _placeSection() {
    // a fixed-height card (description lines reserved, rotation row always there): choosing
    // another object type never moves the palette below it under the cursor
    const st = this.state;
    const info = h('div', { class: 'le-place-info' });
    const rotValue = h('span', { class: 'le-rot-value' });
    const rotBtn = (ic, title, fn) => h('button', { class: 'le-icon-btn', type: 'button', title, onClick: () => { st && fn(); } }, icon(ic));
    const rotBtns = [
      rotBtn(ICONS.rotate, tr('tools.opts.rotateCw'), () => PlaceTool.setRotation(st, PlaceTool.getRotation(st) - Math.PI / 12)),
      rotBtn(ICONS.rotateCcw, tr('tools.opts.rotateCcw'), () => PlaceTool.setRotation(st, PlaceTool.getRotation(st) + Math.PI / 12)),
      h('button', { class: 'le-btn is-small', type: 'button', title: tr('tools.opts.resetRotation'), onClick: () => PlaceTool.setRotation(st, 0) }, '0°'),
    ];
    const rotRow = h('div', { class: 'le-rot-row' }, h('span', { class: 'le-field-label' }, tr('tools.opts.rotation')), rotBtns[0], rotValue, rotBtns[1], rotBtns[2]);
    let lastType = null;
    let lastDeg = null;
    const refresh = () => {
      const t = st.toolOptions.objectType;
      const def = OBJECT_TYPES[t];
      if (!def) return;
      if (t !== lastType) {
        lastType = t;
        clear(info).append(
          h('div', { class: 'le-current' }, glyphBadge(t, 'lg'), h('div', null,
            h('div', { class: 'le-current-label' }, categoryLabel(def.category)),
            h('div', { class: 'le-current-name' }, def.label))),
          h('p', { class: 'le-hint le-place-help' }, def.help ?? (def.placement === 'line' ? tr('tools.opts.placeLine') : def.placement === 'rect' ? tr('tools.opts.placeRect') : tr('tools.opts.placePoint'))),
        );
      }
      const deg = def.rotatable ? Math.round(PlaceTool.getRotation(st) * DEG) : null;
      rotRow.classList.toggle('is-disabled', !def.rotatable);
      for (const b of rotBtns) b.disabled = !def.rotatable;
      rotValue.textContent = def.rotatable ? `${deg}°` : '—';
      rotRow.title = def.rotatable ? '' : tr('tools.msg.cannotRotate', { label: def.label });
      // a turned placement is easy to forget: flash the value when it changes, tint it while ≠ 0
      rotValue.classList.toggle('is-turned', !!deg);
      if (deg !== lastDeg && lastDeg !== null && def.rotatable) {
        rotValue.classList.remove('is-flash');
        void rotValue.offsetWidth;
        rotValue.classList.add('is-flash');
      }
      lastDeg = deg;
    };
    refresh();
    this._controls.placeInfo = { refresh };
    return this._section(tr('tools.opts.placing'), [h('div', { class: 'le-top-card' }, info, rotRow, this._toggleRow('snap', tr('tools.opts.snapToGrid'), tr('tools.opts.placeSnapHelp')))]);
  }

  _objectPaletteSection(title = tr('tools.opts.objects')) {
    const objects = new Map();
    const content = [];
    for (const cat of OBJECT_CATEGORIES) {
      const types = Object.keys(OBJECT_TYPES).filter((t) => OBJECT_TYPES[t].category === cat);
      if (!types.length) continue;
      content.push(h('div', { class: 'le-palette-group' }, categoryLabel(cat)));
      const grid = h('div', { class: 'le-object-grid' });
      for (const t of types) {
        const def = OBJECT_TYPES[t];
        const b = h('button', {
          class: ['le-object-btn', t === this.state.toolOptions.objectType && this.state.toolId === 'place' && 'is-active'], type: 'button',
          onClick: () => { this.state.setToolOption('objectType', t); this.state.setTool('place'); },
        }, glyphBadge(t, 'sm'), h('span', { class: 'le-object-label' }, def.label.replace(/\s*\(.*\)$/, '').replace(/\s*（.*）$/, '')));
        const kind = ownValue(KIND_LABELS, def.kind)?.() ?? def.kind;
        tooltip(b, {
          title: def.label, key: def.placement === 'line' ? tr('tools.opts.line') : def.placement === 'rect' ? tr('tools.opts.area') : '',
          text: def.help ?? `${categoryLabel(def.category)} · ${kind}`, place: 'right',
        });
        objects.set(t, b);
        grid.appendChild(b);
      }
      content.push(grid);
    }
    if (this.state.toolId === 'place') this._controls.objects = objects;
    return this._section(title, content);
  }
}

function gesture(k, v) {
  return h('li', null, h('kbd', { class: 'le-kbd' }, k), h('span', null, v));
}
