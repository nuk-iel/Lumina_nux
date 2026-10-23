/**
 * Left vertical toolbar: one button per tool (inline SVG icon, rich tooltip with shortcut and
 * help), grouped, with the active tool highlighted.
 */
import { h, icon } from './dom.js';
import { tooltip } from './Tooltip.js';
import { TOOLS } from '../tools/index.js';
import { tr } from '../i18n.js';

/** @import { EditorState } from '../EditorState.js' */

const GROUPS = [['select'], ['paint', 'fill', 'rect', 'height', 'stairs'], ['place', 'spawn'], ['eyedropper', 'erase']];

export class Toolbar {
  /** @param {HTMLElement} host @param {EditorState} state */
  constructor(host, state) {
    this.state = state;
    this.el = h('nav', { class: 'le-toolbar', 'aria-label': tr('tools.toolbar.aria') });
    this.buttons = new Map();
    GROUPS.forEach((g, k) => {
      if (k) this.el.appendChild(h('div', { class: 'le-toolbar-sep' }));
      for (const id of g) {
        const t = TOOLS.find((x) => x.id === id);
        if (!t) continue;
        const b = h('button', {
          class: 'le-tool-btn', type: 'button', 'aria-label': `${t.label} (${t.shortcut})`,
          onClick: () => state.setTool(t.id),
        }, icon(t.icon), h('span', { class: 'le-tool-key' }, t.shortcut));
        tooltip(b, { title: t.label, key: t.shortcut, text: t.tip ?? t.help, place: 'right' });
        this.buttons.set(t.id, b);
        this.el.appendChild(b);
      }
    });
    host.appendChild(this.el);
    state.on('tool', () => this.update());
    this.update();
  }

  update() {
    for (const [id, b] of this.buttons) {
      const on = id === this.state.toolId;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
}
