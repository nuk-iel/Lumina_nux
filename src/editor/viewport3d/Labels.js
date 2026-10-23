import * as THREE from 'three';

const STYLE_ID = 'luminati-vp3d-style';
const CSS = `
.lvp3d-root { position: relative; width: 100%; height: 100%; overflow: hidden; }
.lvp3d-root > canvas { position: absolute; inset: 0; }
.lvp3d-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
.lvp3d-label {
  position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); white-space: nowrap;
  font: 600 12px/1.25 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #f4ead2;
  padding: 3px 8px 3px 7px; border-radius: 4px; letter-spacing: 0.02em;
  background: linear-gradient(180deg, rgba(20, 24, 40, 0.86), rgba(10, 12, 22, 0.86));
  border: 1px solid rgba(201, 164, 92, 0.55); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
  will-change: transform; user-select: none;
}
.lvp3d-label small { display: block; font-weight: 400; font-size: 10.5px; color: #c8b98f; }
.lvp3d-label.region { border-left: 3px solid #e3b35c; text-align: left; }
.lvp3d-far .lvp3d-label small { display: none; }
.lvp3d-game .lvp3d-label.region { opacity: 0.72; }
.lvp3d-far .lvp3d-label.region { font-size: 11px; padding: 2px 7px 2px 6px; opacity: 0.88; }
.lvp3d-label.region::after {
  content: ''; position: absolute; left: 50%; bottom: -7px; width: 1px; height: 6px;
  background: rgba(227, 179, 92, 0.7);
}
.lvp3d-label.region.exit { border-left-color: #7fd6a8; }
.lvp3d-label.region.exit::after { background: rgba(127, 214, 168, 0.7); }
.lvp3d-label.entrance { font-weight: 500; font-size: 11px; padding: 2px 7px; border-color: rgba(127, 214, 168, 0.6); }
.lvp3d-label.region.event { border-left-color: #e8c25a; }
.lvp3d-label.region.event::after { background: rgba(232, 194, 90, 0.7); }
.lvp3d-label.marker { font-weight: 500; font-size: 11px; padding: 2px 7px; border-color: rgba(232, 194, 90, 0.6); }
.lvp3d-label.selected { border-color: #ffc94d; box-shadow: 0 0 0 1px rgba(255, 201, 77, 0.45), 0 2px 10px rgba(0, 0, 0, 0.5); }
.lvp3d-label.npc { font-weight: 500; font-size: 11px; padding: 2px 7px; border-color: rgba(143, 227, 255, 0.5); }
.lvp3d-label.tool {
  font: 500 11.5px/1.2 ui-monospace, 'Cascadia Mono', Consolas, monospace;
  color: #e9f7ff; border-color: rgba(143, 227, 255, 0.55); padding: 2px 7px;
}
.lvp3d-badge {
  position: absolute; right: 10px; top: 10px; z-index: 2; pointer-events: none;
  font: 600 11px/1 system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: 0.08em; text-transform: uppercase;
  color: #e8dcc0; padding: 5px 9px; border-radius: 4px; background: rgba(10, 12, 22, 0.66);
  border: 1px solid rgba(201, 164, 92, 0.45); opacity: 0; transition: opacity 0.25s;
}
.lvp3d-badge.on { opacity: 1; }
:lang(zh) .lvp3d-label, :lang(zh) .lvp3d-badge { font-family: system-ui, -apple-system, 'Segoe UI', 'Noto Sans SC', 'Microsoft YaHei', sans-serif; }
:lang(zh) .lvp3d-label.tool { font-family: ui-monospace, 'Cascadia Mono', Consolas, 'Noto Sans SC', 'Microsoft YaHei', monospace; }
:lang(zh) .lvp3d-badge { letter-spacing: 0.04em; }
`;

/** Inject the viewport stylesheet once. */
export function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

const _p = new THREE.Vector3();
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * Screen box (CSS px) of a label's world `area` rect at its height, or null when a corner lies
 * behind the camera (or beyond its far plane) and the box cannot be trusted.
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number, y: number }} a
 * @param {THREE.Camera} camera
 * @param {number} width
 * @param {number} height
 */
function areaBox(a, camera, width, height) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < 4; k++) {
    _p.set(k & 1 ? a.maxX : a.minX, a.y, k & 2 ? a.maxZ : a.minZ).project(camera);
    if (!(_p.z > -1 && _p.z < 1)) return null;
    const x = (_p.x * 0.5 + 0.5) * width;
    const y = (-_p.y * 0.5 + 0.5) * height;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

/**
 * An HTML label pinned to a world point (`LabelLayer.create`); the owner moves `world`, sets
 * `visible`, `anchor`, `screenOffset` and `id` directly.
 * @typedef {object} Label
 * @property {HTMLElement} el
 * @property {THREE.Vector3} world                  the world point it is pinned to
 * @property {boolean} visible
 * @property {{x: number, y: number, on: boolean}} screen   last position (CSS px), on screen?
 * @property {{x: number, y: number}|null} screenOffset
 *   fixed screen position (CSS px) instead of projecting `world`
 * @property {'above'|'cursor'} anchor
 *   'above' (centred above the point) | 'cursor' (to the lower right, like a tooltip)
 * @property {string} [id]                          the level object it names (hit tests)
 * @property {{ minX: number, maxX: number, minZ: number, maxZ: number, y: number }|null} [area]
 *   the world rect a region-style label names (at height y): the label stays inside the view —
 *   shown while the rect is in view, kept over its visible part and never cut at an edge
 * @property {(t: string, sub?: string) => void} setText   text and optional second line
 * @property {string|null} _text                    (internal) the text last set
 * @property {number} [_x]                          (internal) the position last written
 * @property {number} [_y]                          (internal) see _x
 * @property {string} [_anchor]                     (internal) the anchor last written
 * @property {{w: number, h: number}|true|null} [_size]
 *   (internal) measured size of tool / cursor labels; true: other labels (never measured)
 */

/**
 * Crisp HTML labels pinned to world positions (region names, NPC names, tool hints), projected
 * every frame. Pointer events pass through; `hitTest` lets the viewport pick labels by screen
 * position.
 */
export class LabelLayer {
  /** @param {HTMLElement} parent */
  constructor(parent) {
    ensureStyles();
    this.el = document.createElement('div');
    this.el.className = 'lvp3d-labels';
    parent.appendChild(this.el);
    /** @type {Set<Label>} */
    this.labels = new Set();
  }

  /** @param {string} className @param {string} [text] @returns {Label} */
  create(className, text = '') {
    const el = document.createElement('div');
    el.className = `lvp3d-label ${className}`;
    // hidden until `update` places it on screen (`screen.on` starts false): a label created out
    // of view would otherwise sit unplaced in the layer's corner
    el.style.display = 'none';
    this.el.appendChild(el);
    /** @type {Label} */
    const label = {
      el,
      world: new THREE.Vector3(),
      visible: true,
      screen: { x: -1e4, y: -1e4, on: false },
      /** Fixed screen position (CSS px) instead of projecting `world`. */
      screenOffset: null,
      /** 'above' (centred above the point) | 'cursor' (to the lower right, like a tooltip) */
      anchor: 'above',
      _text: null,
      setText(t, sub = '') {
        const key = `${t}\u0000${sub}`;
        if (key === this._text) return;
        this._text = key;
        this._size = null;
        el.textContent = t;
        if (sub) {
          const s = document.createElement('small');
          s.textContent = sub;
          el.appendChild(s);
        }
      },
    };
    label.setText(text);
    this.labels.add(label);
    return label;
  }

  /** @param {Label|null} label */
  remove(label) {
    if (!label) return;
    label.el.remove();
    this.labels.delete(label);
  }

  /**
   * Project every label (call once per rendered frame). A label with an `area` (region names)
   * is kept inside the view like the tool labels: over the part of its rect in view (its point
   * may be off-screen) and whole, 4 px from the edges.
   * @param {THREE.Camera} camera
   * @param {number} width  view size in CSS px
   * @param {number} height
   */
  update(camera, width, height) {
    for (const l of this.labels) {
      let on = l.visible;
      /** where an area label's point is kept (CSS px): its rect's part in view, or the view */
      let keep = null;
      if (on) {
        if (l.screenOffset) {
          l.screen.x = l.screenOffset.x;
          l.screen.y = l.screenOffset.y;
        } else {
          _p.copy(l.world).project(camera);
          on = _p.z > -1 && _p.z < 1 && Math.abs(_p.x) < 1.2 && Math.abs(_p.y) < 1.2;
          l.screen.x = (_p.x * 0.5 + 0.5) * width;
          l.screen.y = (-_p.y * 0.5 + 0.5) * height;
          if (l.area) {
            const b = areaBox(l.area, camera, width, height);
            if (b) {
              keep = { minX: Math.max(b.minX, 0), maxX: Math.min(b.maxX, width), minY: Math.max(b.minY, 0), maxY: Math.min(b.maxY, height) };
              on = keep.minX <= keep.maxX && keep.minY <= keep.maxY;
            } else if (on) keep = { minX: 0, maxX: width, minY: 0, maxY: height };
          }
        }
      }
      if (on !== l.screen.on) {
        l.el.style.display = on ? '' : 'none';
        l.screen.on = on;
      }
      if (!on) continue;
      if (keep) {
        if (!l._size || l._size === true) l._size = { w: l.el.offsetWidth, h: l.el.offsetHeight };
        const { w, h } = l._size;
        // over the rect's visible part, then the whole label in the view (hitTest reads l.screen)
        l.screen.x = clamp(clamp(l.screen.x, keep.minX, keep.maxX), w / 2 + 4, width - w / 2 - 4);
        l.screen.y = clamp(clamp(l.screen.y, keep.minY, keep.maxY), h + 4, height - 4);
      }
      // write the style only when the label moved (no per-frame style recalcs while idle)
      const x = Math.round(l.screen.x * 2) / 2;
      const y = Math.round(l.screen.y * 2) / 2;
      if (x === l._x && y === l._y && l.anchor === l._anchor && l._size) continue;
      l._x = x;
      l._y = y;
      l._anchor = l.anchor;
      // tool labels stay inside the view: near the right / bottom edge they flip to the other
      // side of the cursor (or slide in, for labels above a point)
      if (l.anchor === 'cursor' || l.el.classList.contains('tool')) {
        if (!l._size) l._size = { w: l.el.offsetWidth, h: l.el.offsetHeight };
        const { w, h } = /** @type {{w: number, h: number}} */ (l._size); // (measured just above)
        if (l.anchor === 'cursor') {
          const tx = x + 16 + w > width - 4 ? Math.max(4, x - 12 - w) : x + 16;
          const ty = y + 14 + h > height - 4 ? Math.max(4, y - 10 - h) : y + 14;
          l.el.style.transform = `translate(${tx}px, ${ty}px)`;
        } else {
          const cx = Math.min(Math.max(x, w / 2 + 4), width - w / 2 - 4);
          l.el.style.transform = `translate(${cx}px, ${Math.max(h + 4, y)}px) translate(-50%, -100%)`;
        }
        continue;
      }
      l._size = l._size ?? true;
      l.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
  }

  /**
   * Label under a screen point (CSS px relative to the layer), or null.
   * @param {number} x
   * @param {number} y
   * @param {(label: Label) => boolean} [filter]
   * @returns {Label|null}
   */
  hitTest(x, y, filter = null) {
    for (const l of this.labels) {
      if (!l.screen.on || (filter && !filter(l))) continue;
      const w = l.el.offsetWidth;
      const h = l.el.offsetHeight;
      if (l.anchor === 'cursor') continue;
      if (x >= l.screen.x - w / 2 && x <= l.screen.x + w / 2 && y >= l.screen.y - h && y <= l.screen.y) return l;
    }
    return null;
  }

  /** Forget cached label sizes (after a style change such as the compact far-view mode). */
  invalidateSizes() {
    for (const l of this.labels) l._size = null;
  }

  dispose() {
    this.el.remove();
    this.labels.clear();
  }
}
