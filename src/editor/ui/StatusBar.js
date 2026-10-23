/**
 * Status bar: tile coordinates, tile name, height level and world position under the pointer;
 * the active tool's help or transient messages; object count, level size, the story preview
 * (while it is on) and 2D zoom.
 */
import { h, icon, clear } from './dom.js';
import { ICONS } from '../icons.js';
import { getTool } from '../tools/index.js';
import { getTile, getHeightLevel, levelToWorld } from '../../engine/level/LevelFormat.js';
import { tileLabel, tileColor } from '../tools/common.js';

export class StatusBar {
  constructor(host, state) {
    this.state = state;
    this.pos = h('div', { class: 'le-status-pos' });
    this.msgIcon = h('span', { class: 'le-status-msg-icon' });
    this.msg = h('div', { class: 'le-status-msg' });
    this.right = h('div', { class: 'le-status-right' });
    this.zoom = h('span', { class: 'le-status-zoom', title: '2D map zoom (100% = 16 px per tile)' });
    this.counts = h('span');
    this.story = h('span', { class: 'le-status-story', hidden: true, title: 'View › Story preview…: objects whose story conditions do not hold are hidden' }, 'Story preview: on');
    this.storySep = h('span', { class: 'le-status-sep', hidden: true });
    this.right.append(this.counts, this.storySep, this.story, h('span', { class: 'le-status-sep' }), this.zoom);
    this.el = h('footer', { class: 'le-statusbar' }, this.pos, h('div', { class: 'le-status-center' }, this.msgIcon, this.msg), this.right);
    host.appendChild(this.el);
    this._timer = 0;
    this._message = null;
    state.on('hover', () => this.updatePos());
    state.on('tool', () => this.updateHelp());
    state.on('status', (m, opts) => this.flash(m, { stale: opts?.stale, error: opts?.error }));
    state.on('change', () => { this.updateCounts(); this.updatePos(); this._dropStale(); });
    state.on('selection', () => this.updateCounts());
    state.on('view', () => { this.updateStory(); this._dropStale(); });
    this.updatePos();
    this.updateStory();
    this.updateHelp();
    this.updateCounts();
  }

  updatePos() {
    const hv = this.state.hover;
    const L = this.state.level;
    clear(this.pos);
    if (!hv) { this.pos.appendChild(h('span', { class: 'le-dim' }, 'Move the pointer over the map')); return; }
    const ch = getTile(L, hv.i, hv.j);
    const lvl = getHeightLevel(L, hv.i, hv.j);
    this.pos.append(...[
      h('span', { class: 'le-status-coord', title: 'Tile (column, row)' }, `${hv.i}, ${hv.j}`),
      ch != null
        ? h('span', { class: 'le-status-tile' }, h('span', { class: 'le-status-dot', style: { background: tileColor(ch, L.legend[ch]) } }), tileLabel(L, ch))
        : h('span', { class: 'le-dim' }, 'outside the map'),
      lvl != null ? h('span', { title: 'Height level (world y)' }, `Lv ${lvl}`, h('span', { class: 'le-dim' }, ` · y ${levelToWorld(lvl).toFixed(1)}`)) : null,
      h('span', { class: 'le-dim', title: 'World position' }, `x ${hv.x.toFixed(2)}  z ${hv.z.toFixed(2)}`),
    ].filter(Boolean)); // (Element.append would print a null as "null")
  }

  updateHelp() {
    if (this._message) return;
    const t = getTool(this.state.toolId);
    clear(this.msgIcon).appendChild(icon(t.icon));
    this.msg.textContent = t.help;
    this.msg.title = t.help;
    this.el.classList.remove('is-flash', 'is-error');
  }

  /**
   * Show a transient message for a few seconds.
   * @param {unknown} message
   * @param {{ error?: boolean, stale?: () => boolean }} [opts] stale: asked after every view change
   *   and edit while the message shows; true drops it at once (`EditorState.notify`). error: shown
   *   as a warning; when not given, guessed from English words (error, fail, could not …) — a
   *   translated message passes it explicitly
   */
  flash(message, { error = /error|fail|could not|not found|invalid/i.test(String(message)), stale } = {}) {
    clearTimeout(this._timer);
    this._stale = typeof stale === 'function' ? stale : null;
    this._message = String(message);
    clear(this.msgIcon).appendChild(icon(error ? ICONS.warning : ICONS.info));
    this.msg.textContent = this._message;
    // (a long message — why an object is hidden — may be cut by the bar's width: the tooltip has it all)
    this.msg.title = this._message;
    this.el.classList.remove('is-flash');
    void this.el.offsetWidth;
    this.el.classList.add('is-flash');
    this.el.classList.toggle('is-error', error);
    this._timer = setTimeout(() => { this._message = null; this._stale = null; this.updateHelp(); }, error ? 7000 : 4200);
  }

  /** The message shown answers stale (the hidden object it is about is shown again): drop it. */
  _dropStale() {
    if (!this._message || !this._stale) return;
    let stale = false;
    try { stale = !!this._stale(); } catch { stale = true; }
    if (!stale) return;
    clearTimeout(this._timer);
    this._message = null;
    this._stale = null;
    this.updateHelp();
  }

  updateCounts() {
    const L = this.state.level;
    const sel = this.state.selection.length;
    this.counts.textContent = `${L.objects.length} object${L.objects.length === 1 ? '' : 's'}${sel ? ` · ${sel} selected` : ''} · ${L.width} × ${L.depth}`;
  }

  /** "Story preview: on" while the story preview hides objects by their story conditions. */
  updateStory() {
    const on = !!this.state.view.storyPreview;
    this.story.hidden = !on;
    this.storySep.hidden = !on;
  }

  setZoom(pct) {
    this.zoom.textContent = `2D ${pct}%`;
  }
}
