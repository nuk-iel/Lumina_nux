/**
 * The editor's dialogs (docs/contracts/LEVEL_EDITOR.md §8): New level, Open, Save As, Level settings,
 * Resize, Keyboard shortcuts, restore-autosave, play-test problems and Find by text key. Each
 * returns a promise; the app performs the actual storage operations.
 */
import { h, icon, clear, formatBytes, formatTime, shortcutLabel } from './dom.js';
import { showDialog, confirmDialog } from './Dialog.js';
import { numberControl, selectControl, textControl, boolControl, colorControl, segmented } from './fields.js';
import { paintTileSwatch } from './ToolOptions.js';
import { ICONS } from '../icons.js';
import {
  TILE_TYPES, MIN_SIZE, MAX_SIZE, MAX_LEVEL, resizeLevel, DEFAULT_ENVIRONMENT,
} from '../../engine/level/LevelFormat.js';
import {
  listLocalLevels, deleteLocalLevel, listProjectLevels, deleteProjectLevel, slugify, listProjectCampaigns, projectLevelPath,
} from '../../engine/level/LevelStorage.js';
import { listRecovered, deleteRecovered, recoveredSize } from '../autosave.js';
import { parseStoryValues, storyHiddenIds, storyConditionCount } from '../story.js';
import { rootRows } from '../textKeys.js';
import { fillKeyView, copyText } from './keyView.js';
import { ROOM_DEFAULTS, ROOM_WALL, ROOM_LOOK, ROOM_CAMERA, ROOM_BACKDROP, roomLookChanges, backdropKind } from '../rooms.js';
import { tr, trn, commaList } from '../i18n.js';
import { BRAND_NAME } from '../brand.js';

/**
 * @import { EditorApp } from '../EditorApp.js'
 * @import { ResizeAnchor } from '../../engine/level/LevelFormat.js'
 */

const row = (label, control, hint = '') => h('div', { class: 'le-form-row' },
  h('label', { class: 'le-form-label' }, label),
  h('div', { class: 'le-form-control' }, control, hint ? h('div', { class: 'le-form-hint' }, hint) : null));

/**
 * A translated text whose `{slot}`s become the given nodes (a `<code>` part), never parsed as HTML.
 * @param {string} text
 * @param {Record<string, Node>} nodes
 * @returns {(string|Node)[]}
 */
const withNodes = (text, nodes) => text.split(/\{([A-Za-z0-9_]+)\}/).map((s, i) => (i % 2 ? nodes[s] ?? `{${s}}` : s)).filter((x) => x !== '');

const groundTiles = () => TILE_TYPES.filter((t) => t.category !== 'stairs').map((t) => ({ value: t.char, label: `${t.name}  “${t.char}”` }));
/** Can a room's floor be this tile (walkable, not water, not void: the player starts on it)? @param {string} ch */
const roomFloorTile = (ch) => { const d = TILE_TYPES.find((t) => t.char === ch)?.def; return !!d && d.walkable === true && !d.water && !d.void; };

// ---------------------------------------------------------------------------------------------
// New level
// ---------------------------------------------------------------------------------------------

const SIZE_PRESETS = [
  { label: () => tr('dialogs.newLevel.presetSmall'), w: 24, d: 18 }, { label: () => tr('dialogs.newLevel.presetMedium'), w: 32, d: 24 },
  { label: () => tr('dialogs.newLevel.presetLarge'), w: 48, d: 40 }, { label: () => tr('dialogs.newLevel.presetHuge'), w: 64, d: 64 },
];
/** Room sizes (File › New › Room). */
const ROOM_SIZE_PRESETS = [
  { label: () => tr('dialogs.newLevel.presetSmall'), w: 12, d: 10 }, { label: () => tr('dialogs.newLevel.presetRoom'), w: ROOM_DEFAULTS.width, d: ROOM_DEFAULTS.depth },
  { label: () => tr('dialogs.newLevel.presetHall'), w: 24, d: 18 },
];
/** What each kind of new level starts with (a kind switch resets these). */
const NEW_KIND_DEFAULTS = {
  level: { width: 32, depth: 24, fill: 'g', level: 2 },
  room: { width: ROOM_DEFAULTS.width, depth: ROOM_DEFAULTS.depth, fill: ROOM_DEFAULTS.fill, level: ROOM_DEFAULTS.level },
};

/**
 * File › New: an outdoor level (`createEmptyLevel`) or a room (`rooms.createRoomLevel`: kind 'room',
 * walls `wall` levels above the floor, `environment.interior` and the room look).
 * @returns {Promise<{ kind: 'level'|'room', name: string, width: number, depth: number, fill: string, level: number, border: number, wall: number }|null>}
 */
export function newLevelDialog(app) {
  /** @type {{ kind: 'level'|'room', name: string, width: number, depth: number, fill: string, level: number, border: number, wall: number }} */
  const v = { kind: 'level', name: 'Untitled', ...NEW_KIND_DEFAULTS.level, border: 2, wall: ROOM_DEFAULTS.wall };
  const name = textControl({ value: v.name, onChange: (x) => { v.name = x; }, onInput: (x) => { v.name = x; } });
  name.input.setAttribute('autofocus', '');
  const w = numberControl({ value: v.width, min: MIN_SIZE, max: MAX_SIZE, step: 1, int: true, slider: false, onChange: (x) => { v.width = clampSize(x); upd(); } });
  const d = numberControl({ value: v.depth, min: MIN_SIZE, max: MAX_SIZE, step: 1, int: true, slider: false, onChange: (x) => { v.depth = clampSize(x); upd(); } });
  const presets = h('div', { class: 'le-chips' });
  const sw = h('canvas', { class: 'le-swatch-canvas' });
  const fill = selectControl({ value: v.fill, options: groundTiles(), onChange: (x) => { v.fill = x; upd(); } });
  const lvl = numberControl({ value: v.level, min: 0, max: MAX_LEVEL, step: 1, int: true, onChange: (x) => { v.level = Math.max(0, Math.min(MAX_LEVEL, x ?? 0)); } });
  const border = numberControl({ value: v.border, min: 0, max: 8, step: 1, int: true, onChange: (x) => { v.border = Math.max(0, Math.min(8, x ?? 0)); upd(); } });
  const wall = numberControl({ value: v.wall, min: 1, max: 12, step: 1, int: true, onChange: (x) => { v.wall = Math.max(1, Math.min(12, x ?? ROOM_DEFAULTS.wall)); upd(); } });
  const summary = h('div', { class: 'le-form-summary' });
  // (rows the kind switch relabels or hides)
  const groundRow = row(tr('dialogs.newLevel.ground'), h('div', { class: 'le-inline' }, h('span', { class: 'le-swatch is-static' }, sw), fill.el));
  const levelRow = row(tr('dialogs.newLevel.groundLevel'), lvl.el, '');
  const borderRow = row(tr('dialogs.newLevel.forestBorder'), border.el, tr('dialogs.newLevel.forestBorderHint'));
  const wallRow = row(tr('dialogs.newLevel.wallHeight'), wall.el, tr('dialogs.newLevel.wallHeightHint'));
  const relabel = (r, label, hint) => {
    r.querySelector('.le-form-label').textContent = label;
    const hintEl = r.querySelector('.le-form-hint');
    if (hintEl) hintEl.textContent = hint;
    else if (hint) r.querySelector('.le-form-control').appendChild(h('div', { class: 'le-form-hint' }, hint));
  };
  function showPresets() {
    clear(presets).append(...(v.kind === 'room' ? ROOM_SIZE_PRESETS : SIZE_PRESETS).map((p) => h('button', {
      class: 'le-chip-btn', type: 'button', onClick: () => { v.width = p.w; v.depth = p.d; w.set(p.w); d.set(p.d); upd(); },
    }, `${p.label()} ${p.w}×${p.d}`)));
  }
  function setKind(k) {
    v.kind = k;
    Object.assign(v, NEW_KIND_DEFAULTS[k]);
    const room = k === 'room';
    // (a room's floor holds the player start: no water, void or blocked ground on offer)
    for (const o of fill.el.querySelectorAll('option')) o.disabled = room && !roomFloorTile(o.value);
    w.set(v.width); d.set(v.depth); fill.set(v.fill); lvl.set(v.level);
    relabel(groundRow, room ? tr('dialogs.newLevel.floor') : tr('dialogs.newLevel.ground'), '');
    relabel(levelRow, room ? tr('dialogs.newLevel.floorLevel') : tr('dialogs.newLevel.groundLevel'), room ? tr('dialogs.newLevel.floorLevelHint') : tr('dialogs.newLevel.groundLevelHint'));
    borderRow.hidden = room;
    wallRow.hidden = !room;
    showPresets();
    upd();
  }
  function upd() {
    paintTileSwatch(sw, TILE_TYPES.find((t) => t.char === v.fill)?.def, v.fill, app.textures);
    if (v.kind === 'room') {
      const fw = Math.max(0, v.width - 2 * ROOM_WALL);
      const fd = Math.max(0, v.depth - ROOM_WALL - 1);
      summary.textContent = tr('dialogs.newLevel.summaryRoom', { w: v.width, d: v.depth, fw, fd });
      return;
    }
    const inner = Math.max(0, v.width - v.border * 2) * Math.max(0, v.depth - v.border * 2);
    summary.textContent = v.border > 0
      ? tr('dialogs.newLevel.summaryBorder', { w: v.width, d: v.depth, inner, border: v.border })
      : tr('dialogs.newLevel.summaryNoBorder', { w: v.width, d: v.depth });
  }
  const kind = segmented({
    options: [{ value: 'level', label: tr('dialogs.newLevel.kindLevel') }, { value: 'room', label: tr('dialogs.newLevel.kindRoom') }],
    value: v.kind, onChange: setKind, className: 'le-tabs le-new-kind',
  });
  setKind('level');
  return showDialog({
    title: tr('dialogs.newLevel.title'), icon: ICONS.newFile, width: 520,
    content: [
      kind.el,
      row(tr('dialogs.name'), name.el),
      row(tr('dialogs.newLevel.size'), h('div', null, h('div', { class: 'le-inline' }, w.el, h('span', { class: 'le-times' }, '×'), d.el), presets), tr('dialogs.newLevel.sizeHint', { min: MIN_SIZE, max: MAX_SIZE })),
      groundRow,
      levelRow,
      borderRow,
      wallRow,
      summary,
    ],
    buttons: [{ key: 'Cancel', label: tr('common.cancel'), value: null }, { key: 'Create', label: tr('common.create'), primary: true, onClick: () => { v.name = name.input.value.trim() || 'Untitled'; } }],
  }).result.then((r) => (r === 'Create' ? { ...v } : null));
}

const clampSize = (x) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(Number(x) || MIN_SIZE)));

// ---------------------------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------------------------

/**
 * @returns {Promise<{ kind: 'project'|'local'|'file'|'recovered', name?: string, campaign?: string }|null>}
 *   project / local: the level's name / slot (project + campaign: a campaign's level); recovered:
 *   the recovered copy's id (autosave.js); file: pick one from disk (no name)
 */
export function openLevelDialog(app, { tab = null } = {}) {
  let current = tab ?? (app.projectApi ? 'project' : 'local');
  let choice = null;
  const list = h('div', { class: 'le-file-list le-scroll', role: 'listbox' });
  const tabs = segmented({
    options: [
      { value: 'project', label: tr('dialogs.projectFolder'), icon: ICONS.folder },
      { value: 'local', label: tr('dialogs.thisBrowser'), icon: ICONS.browser },
      { value: 'file', label: tr('dialogs.open.fileOnDisk'), icon: ICONS.file },
    ],
    value: current, onChange: (x) => { current = x; fill(); }, className: 'le-tabs',
  });
  let dlg = null;
  const pick = (c) => { choice = c; dlg?.close('open'); };

  /**
   * One list row: open on double-click / Enter / its Open button, select on click.
   * @param {{ title: string, sub: string, meta: string, onOpen: () => void,
   *   onDelete?: () => Promise<boolean>, active?: boolean }} row  onDelete resolves true when
   *   the entry was deleted (the list refills); active: the open document's own entry
   */
  const item = ({ title, sub, meta, onOpen, onDelete, active }) => {
    const del = onDelete ? h('button', {
      class: 'le-icon-btn is-danger', type: 'button', title: tr('dialogs.open.deleteEntry'),
      onClick: async (e) => { e.stopPropagation(); if (await onDelete()) fill(); },
    }, icon(ICONS.trash)) : null;
    return h('div', {
      class: ['le-file-item', active && 'is-current'], role: 'option', tabIndex: 0,
      onDblclick: onOpen, onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onOpen(); } },
      onClick: (e) => { for (const x of list.querySelectorAll('.is-selected')) x.classList.remove('is-selected'); e.currentTarget.classList.add('is-selected'); selectedOpen = onOpen; setOpenEnabled(true); },
    },
    icon(ICONS.map, 'le-icon le-file-icon'),
    h('div', { class: 'le-file-main' }, h('div', { class: 'le-file-title' }, title), h('div', { class: 'le-file-sub' }, sub)),
    h('div', { class: 'le-file-meta' }, meta),
    h('button', { class: 'le-btn is-small', type: 'button', onClick: (e) => { e.stopPropagation(); onOpen(); } }, tr('common.open')),
    del);
  };
  let selectedOpen = null;
  /** The footer "Open" button acts on the highlighted row: disabled until one is picked. */
  const setOpenEnabled = (on) => {
    const b = dlg?.button('Open');
    if (!b) return;
    b.dataset.disabled = on ? '0' : '1';
    b.disabled = !on;
  };

  async function fill() {
    selectedOpen = null;
    setOpenEnabled(false);
    clear(list);
    if (current === 'project') {
      if (!app.projectApi) {
        list.appendChild(h('div', { class: 'le-empty' }, icon(ICONS.info), h('div', null, ...withNodes(tr('dialogs.open.noProjectApi'), {
          cmd: h('code', null, 'npm run dev'), url: h('code', null, 'editor.html?open=<name>'),
        }))));
        return;
      }
      list.appendChild(h('div', { class: 'le-empty' }, tr('dialogs.open.loading')));
      let levels = [];
      let campaigns = [];
      try {
        levels = await listProjectLevels();
        // (an older dev server without the campaign API: no campaigns)
        campaigns = await listProjectCampaigns().catch(() => []);
      } catch (e) { clear(list).appendChild(h('div', { class: 'le-empty is-error' }, tr('dialogs.open.listFailed', { error: e.message }))); return; }
      clear(list);
      if (!levels.length) list.appendChild(h('div', { class: 'le-empty' }, tr('dialogs.open.noProjectLevels')));
      const ref = app.state.fileRef;
      /** One project level row (`campaign`: a campaign's own level). */
      const levelItem = (l, campaign = '') => item({
        title: l.title || l.name, sub: `public/${l.file}`, meta: [formatBytes(l.size), formatTime(l.modified)].join(' · '),
        active: ref.kind === 'project' && ref.name === l.name && (ref.campaign ?? '') === campaign,
        onOpen: () => pick(campaign ? { kind: 'project', name: l.name, campaign } : { kind: 'project', name: l.name }),
        onDelete: async () => {
          const ok = await confirmDialog({
            title: tr('dialogs.open.deleteFileTitle'), message: tr('dialogs.open.deleteFileMessage', { file: l.file }), danger: true,
            buttons: [{ key: 'Cancel', label: tr('common.cancel'), value: false }, { key: 'Delete file', label: tr('dialogs.open.deleteFile'), value: true, danger: true }],
          });
          if (!ok) return false;
          try { await deleteProjectLevel(l.name, { campaign }); app.state.notify(tr('dialogs.open.deleted', { file: l.file })); } catch (e) { app.state.notify(tr('dialogs.open.deleteFailed', { error: e.message }), { error: true }); }
          return true;
        },
      });
      for (const l of levels) list.appendChild(levelItem(l));
      // campaigns (docs/specs/CAMPAIGN_FORMAT.md): each one's own levels
      for (const c of campaigns) {
        list.appendChild(h('div', { class: 'le-file-group' }, tr('dialogs.open.campaignGroup', { title: c.title }), h('span', { class: 'le-dim' }, ` — public/campaigns/${c.name}/levels/`)));
        if (!c.levels.length) list.appendChild(h('div', { class: 'le-empty' }, tr('dialogs.open.noCampaignLevels')));
        for (const l of c.levels) list.appendChild(levelItem(l, c.name));
      }
    } else if (current === 'local') {
      const levels = listLocalLevels();
      const recovered = listRecovered();
      if (recovered.length) {
        list.appendChild(h('div', { class: 'le-file-group' }, tr('dialogs.open.recoveredGroup'), h('span', { class: 'le-dim' }, tr('dialogs.open.recoveredGroupNote'))));
        for (const e of recovered) {
          const source = e.fileRef?.kind === 'project' ? `public/${projectLevelPath(e.fileRef.name, { campaign: e.fileRef.campaign })}`
            : e.fileRef?.kind === 'local' ? tr('dialogs.browserSlot', { name: e.fileRef.name })
              : e.fileRef?.kind === 'file' ? e.fileRef.name : null;
          list.appendChild(item({
            title: e.name || tr('common.untitled'),
            sub: `${source != null ? tr('dialogs.open.recoveredOf', { source }) : tr('dialogs.open.recovered')}${e.exported ? tr('dialogs.open.wasDownloaded') : ''}`,
            meta: [`${e.width ?? '?'}×${e.depth ?? '?'}`, formatBytes(recoveredSize(e.id)), formatTime(e.savedAt)].filter(Boolean).join(' · '),
            onOpen: () => pick({ kind: 'recovered', name: e.id }),
            onDelete: async () => {
              const ok = await confirmDialog({
                title: tr('dialogs.open.deleteRecoveredTitle'), message: tr('dialogs.open.deleteRecoveredMessage', { name: e.name || tr('common.untitled') }), danger: true,
                buttons: [{ key: 'Cancel', label: tr('common.cancel'), value: false }, { key: 'Delete', label: tr('common.delete'), value: true, danger: true }],
              });
              if (!ok) return false;
              deleteRecovered(e.id);
              return true;
            },
          }));
        }
        if (levels.length) list.appendChild(h('div', { class: 'le-file-group' }, tr('dialogs.open.savedGroup')));
      }
      if (!levels.length && !recovered.length) list.appendChild(h('div', { class: 'le-empty' }, tr('dialogs.open.noLocalLevels')));
      for (const l of levels) {
        list.appendChild(item({
          title: l.name, sub: tr('dialogs.browserSlot', { name: l.slot }), meta: [`${l.width}×${l.depth}`, localSize(l.slot), formatTime(l.savedAt)].filter(Boolean).join(' · '),
          active: app.state.fileRef.kind === 'local' && app.state.fileRef.name === l.slot,
          onOpen: () => pick({ kind: 'local', name: l.slot }),
          onDelete: async () => {
            const ok = await confirmDialog({
              title: tr('dialogs.open.deleteLocalTitle'), message: tr('dialogs.open.deleteLocalMessage', { name: l.name }), danger: true,
              buttons: [{ key: 'Cancel', label: tr('common.cancel'), value: false }, { key: 'Delete', label: tr('common.delete'), value: true, danger: true }],
            });
            if (!ok) return false;
            deleteLocalLevel(l.slot);
            return true;
          },
        }));
      }
    } else {
      const drop = h('div', { class: 'le-dropzone' },
        icon(ICONS.upload, 'le-icon le-dropzone-icon'),
        h('div', { class: 'le-dropzone-title' }, tr('dialogs.open.dropTitle')),
        h('div', { class: 'le-dropzone-text' }, tr('dialogs.open.dropText')),
        h('button', { class: 'le-btn is-primary', type: 'button', onClick: () => pick({ kind: 'file' }) }, icon(ICONS.open), tr('dialogs.open.chooseFile')));
      list.appendChild(drop);
    }
  }
  fill();
  dlg = showDialog({
    title: tr('dialogs.open.title'), icon: ICONS.open, width: 680, className: 'is-open-dialog',
    content: [tabs.el, list],
    buttons: [{ key: 'Cancel', label: tr('common.cancel'), value: null }, { key: 'Open', label: tr('common.open'), primary: true, disabled: true, onClick: () => { if (selectedOpen) { selectedOpen(); } return false; } }],
  });
  return dlg.result.then(() => choice);
}

/** Stored size of a browser level (same key scheme as LevelStorage). */
function localSize(slot) {
  try {
    const text = localStorage.getItem(`luminati.level.${slot}`);
    return text ? formatBytes(text.length) : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------------------------
// Save As
// ---------------------------------------------------------------------------------------------

/** "my-river-village" → "My River Village" (a default level name derived from the file name: data, not UI text). */
const titleFromSlug = (s) => String(s).split(/[-_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/**
 * @param {EditorApp} app
 * @param {{ askName?: boolean }} [opts] askName: the level still has a default name ("Untitled"):
 *   also ask for its display name (prefilled from the file name)
 * @returns {Promise<{ name: string, dest: 'project'|'local'|'download', levelName?: string,
 *   campaign?: string }|null>} campaign: the project destination is that campaign's levels/ (a
 *   campaign level is saved beside its siblings)
 */
export function saveAsDialog(app, { askName = false } = {}) {
  const ref = app.state.fileRef;
  const L = app.state.level;
  /** A campaign level saves into its campaign's levels/ folder (docs/specs/CAMPAIGN_FORMAT.md). */
  const campaign = ref.kind === 'project' ? ref.campaign ?? '' : '';
  /** @type {{ name: string, dest: 'project'|'local'|'download', levelName?: string }} */
  const v = {
    name: ref.kind === 'project' || ref.kind === 'local' ? ref.name : slugify(L.name),
    dest: ref.kind === 'project' || ref.kind === 'local' ? ref.kind : app.projectApi ? 'project' : 'local',
  };
  if (ref.kind === 'file') v.dest = 'download';
  if (v.dest === 'project' && !app.projectApi) v.dest = 'local'; // the dev-server API is not running
  const target = h('div', { class: 'le-form-summary is-mono' });
  // the display name (title screen, banner): asked while the level is still "Untitled"
  let levelNameTouched = false;
  v.levelName = askName ? (ref.kind === 'new' && v.name === 'untitled' ? '' : titleFromSlug(v.name)) : L.name;
  const levelName = askName ? textControl({ value: v.levelName, placeholder: tr('dialogs.exampleName'), maxLength: 80, onInput: (x) => { v.levelName = x; levelNameTouched = true; upd(); }, onChange: (x) => { v.levelName = x; levelNameTouched = true; upd(); } }) : null;
  const name = textControl({
    value: v.name, maxLength: 60,
    onInput: (x) => { v.name = x; if (levelName && !levelNameTouched) { v.levelName = titleFromSlug(slugify(x) === 'untitled' ? '' : x); levelName.set(v.levelName); } upd(); },
    onChange: (x) => { v.name = x; upd(); },
  });
  name.input.setAttribute('autofocus', '');
  const nameHint = h('div', { class: 'le-form-hint' });
  /**
   * The destination cards (`off`: the text of a disabled card).
   * @type {{ value: 'project'|'local'|'download', title: string, text: string, icon: string,
   *   disabled?: boolean, off?: string }[]}
   */
  const dests = [
    campaign
      ? { value: 'project', title: tr('dialogs.saveAs.campaignFolder'), text: tr('dialogs.saveAs.campaignFolderText', { campaign }), icon: ICONS.folder, disabled: !app.projectApi, off: tr('dialogs.saveAs.needsDevServer') }
      : { value: 'project', title: tr('dialogs.projectFolder'), text: tr('dialogs.saveAs.projectFolderText'), icon: ICONS.folder, disabled: !app.projectApi, off: tr('dialogs.saveAs.needsDevServer') },
    { value: 'local', title: tr('dialogs.thisBrowser'), text: tr('dialogs.saveAs.browserText'), icon: ICONS.browser },
    { value: 'download', title: tr('dialogs.saveAs.download'), text: tr('dialogs.saveAs.downloadText'), icon: ICONS.download },
  ];
  const cards = h('div', { class: 'le-dest-cards', role: 'radiogroup' });
  const cardEls = new Map();
  for (const d of dests) {
    const c = h('button', {
      class: ['le-dest-card', d.disabled && 'is-disabled'], type: 'button', role: 'radio', disabled: !!d.disabled,
      onClick: () => { v.dest = d.value; upd(); },
    }, icon(d.icon, 'le-icon le-dest-icon'), h('div', { class: 'le-dest-title' }, d.title), h('div', { class: 'le-dest-text' }, d.disabled ? d.off : d.text));
    cardEls.set(d.value, c);
    cards.appendChild(c);
  }
  function upd() {
    for (const [k, c] of cardEls) { c.classList.toggle('is-active', k === v.dest); c.setAttribute('aria-checked', k === v.dest ? 'true' : 'false'); }
    const slug = slugify(v.name || v.levelName || L.name);
    target.textContent = v.dest === 'project' ? `→ public/${projectLevelPath(slug, { campaign })}` : v.dest === 'local' ? `→ ${tr('dialogs.browserSlot', { name: slug })}` : tr('dialogs.saveAs.targetDownload', { slug });
    // (the level name the game falls back to is the English default: the comparison uses it)
    const own = (levelName ? v.levelName : L.name).trim();
    nameHint.textContent = slug !== slugify(own || 'Untitled')
      ? tr('dialogs.saveAs.nameDiffers', { display: own || tr('common.untitled'), slug }) : tr('dialogs.saveAs.nameHint');
  }
  upd();
  return showDialog({
    title: tr('dialogs.saveAs.title'), icon: ICONS.saveAs, width: 600,
    content: [
      row(tr('dialogs.saveAs.fileName'), h('div', null, name.el, nameHint)),
      levelName ? row(tr('dialogs.saveAs.levelName'), levelName.el, tr('dialogs.saveAs.levelNameHint')) : null,
      row(tr('dialogs.saveAs.saveTo'), cards), target,
    ],
    buttons: [{ key: 'Cancel', label: tr('common.cancel'), value: null }, { key: 'Save', label: tr('common.save'), primary: true }],
  }).result.then((r) => {
    if (r !== 'Save') return null;
    const out = { name: slugify(name.input.value.trim() || v.name || v.levelName || L.name), dest: v.dest };
    if (campaign && out.dest === 'project') out.campaign = campaign;
    if (levelName) out.levelName = (levelName.input.value.trim() || titleFromSlug(out.name === 'untitled' ? 'Untitled' : out.name));
    return out;
  });
}

// ---------------------------------------------------------------------------------------------
// Level settings
// ---------------------------------------------------------------------------------------------

/** Edit name / texts / environment / camera / water. Applies one undoable edit. */
export function levelSettingsDialog(app) {
  const st = app.state;
  const L = st.level;
  const env = { ...DEFAULT_ENVIRONMENT, ...L.environment };
  const cam = env.camera && typeof env.camera === 'object' ? { ...env.camera } : null;
  const hg = env.highGround && typeof env.highGround === 'object' ? { ...env.highGround } : null;
  const v = {
    name: L.name, subtitle: L.subtitle, author: L.author, description: L.description,
    env: { ...env },
    camDistance: cam?.distance ?? null, camPitch: cam?.pitch ?? null,
    hgOn: !!hg, hgMinY: hg?.minY ?? 3, hgPitch: hg?.pitch ?? 40,
    waterLevel: L.waterLevel, flowX: L.water?.flow?.[0] ?? 0, flowZ: L.water?.flow?.[1] ?? 0.45, reflect: L.water?.reflect ?? 0.2, neutral: L.water?.neutral ?? 0.2,
    glint: Number.isFinite(L.water?.glint) ? L.water.glint : 1,
    // COMBAT.md §3 / §17: `environment.combat` absent = auto (on iff the level has an enemy group)
    combat: env.combat === true ? 'on' : env.combat === false ? 'off' : 'auto',
  };
  const enemyGroups = L.objects.filter((o) => o.type === 'enemy').length;
  const text = (k, opts = {}) => textControl({ value: v[k], onChange: (x) => { v[k] = x; }, onInput: (x) => { v[k] = x; }, ...opts }).el;
  const num = (get, setv, o = {}) => numberControl({ value: get(), slider: false, ...o, onChange: (x) => setv(x) }).el;
  const sw = (k) => boolControl({ value: !!v.env[k], onChange: (x) => { v.env[k] = x; } }).el;

  // ---- a room (`environment.interior`, LEVEL_FORMAT.md §9.2; absent = an outdoor level) and the
  // fields the room look sets: their controls are kept, so "Use the room look" shows what it changed
  const interior0 = env.interior === true;
  v.interior = interior0;
  const bk0 = backdropKind(env.backdrop);
  const bdColor0 = bk0 === 'color' ? String(env.backdrop).trim() : ROOM_BACKDROP;
  v.backdrop = bk0;
  v.backdropColor = bdColor0;
  const ctl = {
    clock: boolControl({ value: !!v.env.clock, onChange: (x) => { v.env.clock = x; updRoom(); } }),
    weather: selectControl({ value: v.env.weather, options: [{ value: 'clear', label: tr('dialogs.settings.weatherClear') }, { value: 'rain', label: tr('dialogs.settings.weatherRain') }, { value: 'snow', label: tr('dialogs.settings.weatherSnow') }], onChange: (x) => { v.env.weather = x; } }),
    border: selectControl({ value: v.env.border, options: [{ value: 'forest', label: tr('dialogs.settings.borderForest') }, { value: 'none', label: tr('dialogs.settings.borderNone') }], onChange: (x) => { v.env.border = x; updRoom(); } }),
    outerScenery: boolControl({ value: !!v.env.outerScenery, onChange: (x) => { v.env.outerScenery = x; updRoom(); } }),
    godRays: boolControl({ value: !!v.env.godRays, onChange: (x) => { v.env.godRays = x; updRoom(); } }),
    minimap: boolControl({ value: v.env.minimap !== false, onChange: (x) => { v.env.minimap = x; updRoom(); } }),
    backdrop: selectControl({
      value: bk0,
      options: [
        { value: 'sky', label: tr('dialogs.settings.backdropSky') },
        { value: 'void', label: tr('dialogs.settings.backdropVoid') },
        { value: 'color', label: tr('dialogs.settings.backdropColor') },
        // (a value the game cannot read stays as it is until another choice is made)
        ...(bk0 === 'invalid' ? [{ value: 'invalid', label: tr('dialogs.settings.backdropInvalid', { value: String(env.backdrop).slice(0, 24) }) }] : []),
      ],
      onChange: (x) => { v.backdrop = x; updRoom(); },
    }),
    backdropColor: colorControl({ value: bdColor0, onChange: (x) => { v.backdropColor = x; } }),
    interior: boolControl({ value: v.interior, label: tr('dialogs.settings.isRoom'), onChange: (x) => { v.interior = x; roomSet = false; if (!x) undoRoomLook(); updRoom(); } }),
  };
  const camDist = numberControl({ value: v.camDistance, slider: false, nullable: true, step: 1, min: 12, max: 60, placeholder: tr('dialogs.settings.auto', { value: '30' }), onChange: (x) => { v.camDistance = x; updRoom(); } });
  const camPitch = numberControl({ value: v.camPitch, slider: false, nullable: true, step: 1, min: 10, max: 80, placeholder: tr('dialogs.settings.auto', { value: '32°' }), suffix: '°', onChange: (x) => { v.camPitch = x; updRoom(); } });
  const cameraAuto = () => v.camDistance == null && v.camPitch == null && !cam?.bounds;
  /** The environment as the dialog would write it (for the room-look test). */
  const shownEnv = () => ({ ...v.env, backdrop: v.backdrop === 'void' ? 'void' : v.backdrop === 'color' ? v.backdropColor : v.backdrop === 'invalid' ? env.backdrop : undefined });
  /** "Use the room look": the room fields of ROOM_LOOK (a backdrop the level has is kept), the closer camera while it is automatic. */
  /** The values the room look replaced (put back when Interior is switched off again in this dialog). */
  let beforeLook = null;
  /** Did the room look set the camera (it was automatic)? */
  let lookCamera = false;
  const LOOK_KEYS = /** @type {const} */ (['clock', 'border', 'outerScenery', 'godRays', 'minimap']);
  const undoRoomLook = () => {
    const b = beforeLook;
    beforeLook = null;
    if (!b) return;
    for (const k of LOOK_KEYS) {
      v.env[k] = b.env[k];
      // (an absent `minimap` is the default: shown)
      ctl[k].set(k === 'minimap' ? b.env[k] !== false : b.env[k]);
    }
    v.backdrop = b.backdrop;
    v.backdropColor = b.backdropColor;
    ctl.backdrop.set(b.backdrop);
    ctl.backdropColor.set(b.backdropColor);
    v.camDistance = b.camDistance;
    v.camPitch = b.camPitch;
    camDist.set(v.camDistance);
    camPitch.set(v.camPitch);
    lookCamera = false;
  };
  const useRoomLook = () => {
    beforeLook ??= {
      env: Object.fromEntries(LOOK_KEYS.map((k) => [k, v.env[k]])),
      backdrop: v.backdrop, backdropColor: v.backdropColor, camDistance: v.camDistance, camPitch: v.camPitch,
    };
    for (const k of LOOK_KEYS) {
      v.env[k] = ROOM_LOOK[k];
      ctl[k].set(ROOM_LOOK[k]);
    }
    if (v.backdrop !== 'void' && v.backdrop !== 'color') {
      v.backdrop = 'color';
      v.backdropColor = ROOM_BACKDROP;
      ctl.backdrop.set('color');
      ctl.backdropColor.set(ROOM_BACKDROP);
    }
    if (cameraAuto()) {
      v.camDistance = ROOM_CAMERA.distance;
      v.camPitch = ROOM_CAMERA.pitch;
      camDist.set(v.camDistance);
      camPitch.set(v.camPitch);
      lookCamera = true;
    }
    roomSet = true;
    updRoom();
    // (the button is gone: the focus back on the switch, not lost outside the dialog)
    ctl.interior.input.focus();
  };
  let roomSet = false;
  /** The room look's button (Enter presses it, not the dialog's Apply). */
  const roomLookButton = () => {
    const btn = h('button', { class: 'le-btn is-small le-room-look-btn', type: 'button', onClick: useRoomLook }, tr('dialogs.settings.useRoomLook'));
    btn.dataset.keepsEnter = '1';
    return btn;
  };
  const roomOffer = h('div', { class: 'le-form-summary le-room-offer', role: 'status' });
  const roomNote = () => h('div', { class: 'le-form-hint le-room-note' }, tr('dialogs.settings.roomNote'));
  const ignoredRow = (label, control, hint = '') => {
    const r = row(label, control, hint);
    r.querySelector('.le-form-control').appendChild(roomNote());
    return r;
  };
  const ignoredRows = [
    ignoredRow(tr('dialogs.settings.weather'), ctl.weather.el, tr('dialogs.settings.weatherHint')),
    ignoredRow(tr('dialogs.settings.mapBorder'), ctl.border.el),
    ignoredRow(tr('dialogs.settings.outerScenery'), ctl.outerScenery.el, tr('dialogs.settings.outerSceneryHint')),
    ignoredRow(tr('dialogs.settings.godRays'), ctl.godRays.el),
  ];
  function updRoom() {
    for (const r of ignoredRows) r.classList.toggle('is-room-ignored', v.interior);
    ctl.backdropColor.el.hidden = v.backdrop !== 'color';
    const changes = v.interior ? roomLookChanges(shownEnv(), { cameraAuto: cameraAuto() }) : [];
    roomOffer.hidden = !v.interior || (!changes.length && !roomSet);
    if (roomOffer.hidden) return;
    if (!changes.length) {
      clear(roomOffer).append(tr('dialogs.settings.roomLookSet', { camera: lookCamera ? tr('dialogs.settings.roomLookCamera') : '' }));
      return;
    }
    const list = commaList(changes.map((c) => c.label));
    clear(roomOffer).append(
      h('div', null, interior0 ? tr('dialogs.settings.roomLookMissing', { changes: list }) : tr('dialogs.settings.roomLookOutdoors', { changes: list })),
      roomLookButton(),
    );
  }

  // the subtitle's text key, read-only (docs/specs/I18N.md §4.10; Apply keeps it, or gives a
  // changed subtitle a new one)
  const subtitleKeys = h('div', { class: 'le-text-keys is-form', dataset: { field: 'subtitle' } });
  fillKeyView(subtitleKeys, rootRows(L).filter((r) => r.field === 'subtitle'), {
    pages: false, open: true, onToggle: () => {},
    onCopy: (key) => { copyText(key).then((ok) => st.notify(ok ? tr('dialogs.settings.keyCopied', { key }) : tr('dialogs.settings.keyNoClipboard', { key }))); },
  });
  const panes = {
    general: h('div', { class: 'le-form' },
      row(tr('dialogs.name'), text('name', { maxLength: 80 }), tr('dialogs.settings.nameHint')),
      row(tr('dialogs.settings.subtitle'), [text('subtitle', { placeholder: tr('dialogs.exampleName') }), subtitleKeys]),
      row(tr('dialogs.settings.author'), text('author')),
      row(tr('dialogs.settings.description'), textControl({ value: v.description, multiline: true, rows: 4, onChange: (x) => { v.description = x; }, onInput: (x) => { v.description = x; } }).el)),
    environment: h('div', { class: 'le-form' },
      row(tr('dialogs.settings.interior'), h('div', null, ctl.interior.el, roomOffer), tr('dialogs.settings.interiorHint')),
      row(tr('dialogs.settings.startTime'), numberControl({ value: v.env.timeOfDay, min: 0, max: 24, step: 0.25, suffix: 'h', onChange: (x) => { v.env.timeOfDay = x ?? 12; } }).el, tr('dialogs.settings.startTimeHint')),
      row(tr('dialogs.settings.clock'), ctl.clock.el, tr('dialogs.settings.clockHint')),
      ...ignoredRows,
      row(tr('dialogs.settings.backdrop'), h('div', { class: 'le-inline' }, ctl.backdrop.el, ctl.backdropColor.el), tr('dialogs.settings.backdropHint')),
      row(tr('dialogs.settings.dust'), sw('dust')),
      row(tr('dialogs.settings.music'), sw('music'), tr('dialogs.settings.musicHint')),
      row(tr('dialogs.settings.minimap'), ctl.minimap.el, tr('dialogs.settings.minimapHint')),
      row(tr('dialogs.settings.combat'), selectControl({
        value: v.combat,
        options: [
          { value: 'auto', label: enemyGroups ? tr('dialogs.settings.combatAutoOn') : tr('dialogs.settings.combatAutoOff') },
          { value: 'on', label: tr('dialogs.settings.combatOn') },
          { value: 'off', label: tr('dialogs.settings.combatOff') },
        ],
        onChange: (x) => { v.combat = x; },
      }).el, tr('dialogs.settings.combatHint'))),
    camera: h('div', { class: 'le-form' },
      row(tr('dialogs.settings.distance'), camDist.el, tr('dialogs.settings.distanceHint', { n: ROOM_CAMERA.distance })),
      row(tr('dialogs.settings.pitch'), camPitch.el),
      row(tr('dialogs.settings.highGround'), boolControl({ value: v.hgOn, label: tr('dialogs.settings.highGroundLabel'), onChange: (x) => { v.hgOn = x; } }).el),
      row(tr('dialogs.settings.hgMinY'), num(() => v.hgMinY, (x) => { v.hgMinY = x ?? 3; }, { step: 0.5, min: 0, max: 20 }), tr('dialogs.settings.hgMinYHint')),
      row(tr('dialogs.settings.hgPitch'), num(() => v.hgPitch, (x) => { v.hgPitch = x ?? 40; }, { step: 1, min: 10, max: 80, suffix: '°' })),
      cam?.bounds ? h('p', { class: 'le-hint' }, tr('dialogs.settings.cameraBounds')) : null),
    water: h('div', { class: 'le-form' },
      row(tr('dialogs.settings.waterLevel'), num(() => v.waterLevel, (x) => { v.waterLevel = x ?? 0.4; }, { step: 0.05, min: -2, max: 12 }), tr('dialogs.settings.waterLevelHint')),
      row(tr('dialogs.settings.flow'), h('div', { class: 'le-inline' }, num(() => v.flowX, (x) => { v.flowX = x ?? 0; }, { step: 0.05 }), h('span', { class: 'le-times' }, 'x · z'), num(() => v.flowZ, (x) => { v.flowZ = x ?? 0; }, { step: 0.05 })), tr('dialogs.settings.flowHint')),
      row(tr('dialogs.settings.reflection'), num(() => v.reflect, (x) => { v.reflect = x ?? 0.2; }, { step: 0.05, min: 0, max: 1 })),
      row(tr('dialogs.settings.neutral'), num(() => v.neutral, (x) => { v.neutral = x ?? 0.2; }, { step: 0.05, min: 0, max: 1 })),
      row(tr('dialogs.settings.glints'), num(() => v.glint, (x) => { v.glint = x ?? 1; }, { step: 0.05, min: 0, max: 2 }), tr('dialogs.settings.glintsHint'))),
  };
  const body = h('div', { class: 'le-settings-body' });
  const show = (k) => { clear(body).appendChild(panes[k]); };
  const tabs = segmented({
    options: [
      { value: 'general', label: tr('dialogs.settings.tabGeneral') }, { value: 'environment', label: tr('dialogs.settings.tabEnvironment') },
      { value: 'camera', label: tr('dialogs.settings.tabCamera') }, { value: 'water', label: tr('dialogs.settings.tabWater') },
    ],
    value: 'general', onChange: show, className: 'le-tabs',
  });
  show('general');
  updRoom();
  return showDialog({
    title: tr('dialogs.settings.title'), icon: ICONS.settings, width: 620,
    subtitle: `${tr('dialogs.tilesSize', { w: L.width, d: L.depth })}${interior0 ? tr('dialogs.settings.aRoom') : ''}`,
    content: [tabs.el, body],
    buttons: [{ key: 'Cancel', label: tr('common.cancel'), value: null }, { key: 'Apply', label: tr('common.apply'), primary: true }],
  }).result.then((r) => {
    if (r !== 'Apply') return false;
    const camera = v.camDistance == null && v.camPitch == null && !cam?.bounds ? null
      : { ...(cam ?? {}), distance: v.camDistance ?? undefined, pitch: v.camPitch ?? undefined };
    if (camera) { if (camera.distance == null) delete camera.distance; if (camera.pitch == null) delete camera.pitch; }
    // `minimap` is optional (absent = on): don't write the default into files that never had it
    const environment = { ...v.env, camera, highGround: v.hgOn ? { minY: v.hgMinY, pitch: v.hgPitch } : null };
    if (environment.minimap === true && L.environment?.minimap !== true) {
      // (set back to the default: removed again — an undefined key is dropped when serialised)
      if ('minimap' in (L.environment ?? {})) environment.minimap = undefined;
      else delete environment.minimap;
    }
    // `combat` is optional too: written only for On / Off; back to Auto removes it (an undefined
    // key is dropped when the level is serialised — setLevelProps merges the environment)
    if (v.combat === 'auto') {
      if ('combat' in (L.environment ?? {})) environment.combat = undefined;
      else delete environment.combat;
    } else environment.combat = v.combat === 'on';
    // `interior` is optional (absent = an outdoor level): written as `true` when switched on,
    // removed when switched off; untouched, the file's own value (or its absence) stays
    if (v.interior !== interior0) environment.interior = v.interior ? true : undefined;
    // `backdrop` likewise (absent = the sky): written only when changed — a file's own spelling
    // (upper-case hex, a value the game cannot read) stays while the choice is left alone
    if (v.backdrop !== bk0 || (v.backdrop === 'color' && v.backdropColor !== bdColor0)) {
      if (v.backdrop === 'void') environment.backdrop = 'void';
      else if (v.backdrop === 'color') environment.backdrop = v.backdropColor;
      else if ('backdrop' in (L.environment ?? {})) environment.backdrop = undefined;
      else delete environment.backdrop;
    }
    // water: the file's other keys are kept, in their order; `glint` is only written when set
    const water = { ...(L.water ?? {}), flow: [v.flowX, v.flowZ], reflect: v.reflect, neutral: v.neutral };
    // (set back to 1 — the default — it goes again; a file's own `glint: 1` stays)
    if (v.glint !== 1 || L.water?.glint === 1) water.glint = v.glint;
    else delete water.glint;
    st.setLevelProps({
      name: v.name.trim() || 'Untitled', subtitle: v.subtitle, author: v.author, description: v.description,
      environment,
      waterLevel: v.waterLevel,
      water,
    }, tr('dialogs.settings.title'));
    st.notify(tr('dialogs.settings.updated'));
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------------------------

/** @type {ResizeAnchor[]} in grid order */
const ANCHORS = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];

/** Resize with a 3×3 anchor; applies one undoable edit. */
export function resizeDialog(app) {
  const st = app.state;
  const L = st.level;
  /** @type {{ width: number, depth: number, anchor: ResizeAnchor, fill: string }} */
  const v = { width: L.width, depth: L.depth, anchor: 'c', fill: 'g' };
  const w = numberControl({ value: v.width, min: MIN_SIZE, max: MAX_SIZE, step: 1, int: true, slider: false, onChange: (x) => { v.width = clampSize(x); upd(); } });
  const d = numberControl({ value: v.depth, min: MIN_SIZE, max: MAX_SIZE, step: 1, int: true, slider: false, onChange: (x) => { v.depth = clampSize(x); upd(); } });
  const grid = h('div', { class: 'le-anchor-grid', role: 'radiogroup', 'aria-label': tr('dialogs.resize.anchor') });
  const cells = new Map();
  for (const a of ANCHORS) {
    const b = h('button', { class: 'le-anchor-cell', type: 'button', title: anchorTitle(a), onClick: () => { v.anchor = a; upd(); } });
    cells.set(a, b);
    grid.appendChild(b);
  }
  const fill = selectControl({ value: v.fill, options: groundTiles(), onChange: (x) => { v.fill = x; } });
  const summary = h('div', { class: 'le-form-summary' });
  function upd() {
    // arrows point away from the anchor (the directions the map grows / shrinks)
    const ai = ANCHORS.indexOf(v.anchor);
    const ax = ai % 3;
    const az = Math.floor(ai / 3);
    ANCHORS.forEach((a, k) => {
      const x = k % 3;
      const z = Math.floor(k / 3);
      const b = cells.get(a);
      b.classList.toggle('is-active', a === v.anchor);
      const dx = x - ax;
      const dz = z - az;
      b.textContent = a === v.anchor ? '■' : Math.abs(dx) <= 1 && Math.abs(dz) <= 1 ? arrowFor(dx, dz) : '';
    });
    const dw = v.width - L.width;
    const dd = v.depth - L.depth;
    const signed = (n) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
    const cols = dw === 0 ? tr('dialogs.resize.sameColumns') : tr('dialogs.resize.columns', { d: signed(dw) });
    const rows = dd === 0 ? tr('dialogs.resize.sameRows') : tr('dialogs.resize.rows', { d: signed(dd) });
    const lost = (dw < 0 || dd < 0) ? tr('dialogs.resize.lost') : '';
    summary.textContent = tr('dialogs.resize.summary', { w: L.width, d: L.depth, nw: v.width, nd: v.depth, cols, rows, lost });
  }
  upd();
  return showDialog({
    title: tr('dialogs.resize.title'), icon: ICONS.resize, width: 520,
    content: [
      row(tr('dialogs.resize.newSize'), h('div', { class: 'le-inline' }, w.el, h('span', { class: 'le-times' }, '×'), d.el), tr('dialogs.resize.sizeHint', { min: MIN_SIZE, max: MAX_SIZE })),
      row(tr('dialogs.resize.anchor'), h('div', { class: 'le-inline' }, grid, h('div', { class: 'le-form-hint' }, tr('dialogs.resize.anchorHint')))),
      row(tr('dialogs.resize.newTiles'), fill.el),
      summary,
    ],
    buttons: [{ key: 'Cancel', label: tr('common.cancel'), value: null }, { key: 'Resize', label: tr('dialogs.resize.button'), primary: true }],
  }).result.then((r) => {
    if (r !== 'Resize') return false;
    if (v.width === L.width && v.depth === L.depth) return false;
    const next = resizeLevel(st.level, v.width, v.depth, { anchor: v.anchor, fill: v.fill });
    st.setLevel(next, tr('dialogs.resize.title'));
    st.notify(tr('dialogs.resize.done', { w: v.width, d: v.depth }));
    return true;
  });
}

/**
 * An anchor cell's tooltip ("Keep content anchored to the NW").
 * @param {ResizeAnchor} a
 */
function anchorTitle(a) {
  if (a === 'c') return tr('dialogs.resize.anchorCentre');
  const dir = {
    nw: tr('dialogs.resize.dirNW'), n: tr('dialogs.resize.dirN'), ne: tr('dialogs.resize.dirNE'), w: tr('dialogs.resize.dirW'),
    e: tr('dialogs.resize.dirE'), sw: tr('dialogs.resize.dirSW'), s: tr('dialogs.resize.dirS'), se: tr('dialogs.resize.dirSE'),
  }[a];
  return tr('dialogs.resize.anchorTo', { dir });
}

function arrowFor(dx, dz) {
  const k = `${dx},${dz}`;
  return { '-1,-1': '↖', '0,-1': '↑', '1,-1': '↗', '-1,0': '←', '1,0': '→', '-1,1': '↙', '0,1': '↓', '1,1': '↘' }[k] ?? '';
}

// ---------------------------------------------------------------------------------------------
// Story preview
// ---------------------------------------------------------------------------------------------

/**
 * View › Story preview… (KNOWN_ISSUES CMP-06): the story values to preview, one per line, and the
 * on / off switch. Changes apply at once (view state: never saved with the level).
 * @param {EditorApp} app
 */
export function storyPreviewDialog(app) {
  const st = app.state;
  // the views follow the typing after a short pause: a changed hidden set re-batches the 3D
  // view's chunks it touches, which a big level must not pay at every keystroke
  let timer = 0;
  const apply = (t) => {
    clearTimeout(timer);
    timer = 0;
    st.setView({ storyValues: t });
    upd();
  };
  const values = textControl({
    value: st.view.storyValues ?? '', multiline: true, rows: 9, mono: true,
    placeholder: 'bridge-mended\ndeliveries = 3\nitem:plank = 2\nquest:find-ilse = active\nstage:find-ilse = cross-ford\nhour = 20\nchapter = lanterns-home',
    onChange: (t) => apply(t),
    onInput: (t) => { clearTimeout(timer); timer = setTimeout(() => apply(t), STORY_INPUT_DELAY); },
  });
  values.input.setAttribute('spellcheck', 'false');
  values.input.classList.add('le-story-values');
  const on = boolControl({ value: !!st.view.storyPreview, label: tr('dialogs.story.previewOn'), onChange: (x) => { st.setView({ storyPreview: x }); upd(); } });
  const issues = h('ul', { class: 'le-dialog-list is-errors le-story-issues', hidden: true });
  const summary = h('div', { class: 'le-form-summary le-story-summary' });
  function upd() {
    const { errors } = parseStoryValues(values.input.value);
    clear(issues);
    issues.hidden = !errors.length;
    for (const e of errors) issues.appendChild(h('li', null, tr('dialogs.story.lineIssue', { line: e.line, msg: e.msg })));
    const n = storyConditionCount(st.level);
    const hidden = storyHiddenIds(st).size;
    summary.textContent = !n
      ? tr('dialogs.story.none')
      : st.view.storyPreview
        ? trn('dialogs.story.countOn', n, { hidden })
        : trn('dialogs.story.countOff', n);
  }
  upd();
  return showDialog({
    title: tr('dialogs.story.title'), icon: ICONS.eye, width: 560, className: 'is-story-preview',
    subtitle: tr('dialogs.story.subtitle'),
    content: [
      h('p', { class: 'le-dialog-text' }, tr('dialogs.story.intro')),
      h('div', { class: 'le-story-toggle' }, on.el),
      values.el,
      issues,
      h('div', { class: 'le-form-hint' }, tr('dialogs.story.syntax')),
      summary,
    ],
    buttons: [{ key: 'Done', label: tr('common.done'), primary: true }],
  }).result.then((r) => {
    // (values typed just before the dialog closed still apply)
    if (timer) apply(values.input.value);
    return r;
  });
}

/** Story preview: ms after the last keystroke in its values before the views follow. */
const STORY_INPUT_DELAY = 200;

// ---------------------------------------------------------------------------------------------
// Find by text key
// ---------------------------------------------------------------------------------------------

/**
 * Edit › Find by text key… (docs/specs/I18N.md §4.10): asks for a text key — a GUID from a
 * translation table, a review note or the inspector (any case; braces and hyphens are fine), a
 * script line's `#line:` tag, a banner subtitle's `<GUID>.2` — and, when the level holds it,
 * closes and shows the text (`EditorApp#showTextKey`: the object selected, the line or page
 * selected in its field). A key the level does not hold keeps the dialog open and says so (and
 * which other file of the campaign holds it). Resolves whether a text was shown.
 * @param {EditorApp} app
 * @returns {Promise<boolean>}
 */
export function findTextKeyDialog(app) {
  const input = textControl({ value: '', onChange: () => {}, placeholder: tr('dialogs.findKey.placeholder') });
  input.input.classList.add('le-hex');
  input.input.setAttribute('autocomplete', 'off');
  input.input.setAttribute('aria-label', tr('dialogs.findKey.textKey'));
  const intro = tr('dialogs.findKey.intro');
  const msg = h('div', { class: 'le-form-hint le-find-key-msg' }, intro);
  input.input.addEventListener('input', () => { msg.textContent = intro; msg.classList.remove('is-error'); });
  /** @type {ReturnType<EditorApp['locateTextKey']>|null} */
  let hit = null;
  return showDialog({
    title: tr('dialogs.findKey.title'), icon: ICONS.search, width: 540, className: 'is-find-key',
    content: [h('div', { class: 'le-form' }, row(tr('dialogs.findKey.textKey'), input.el)), msg],
    buttons: [
      { key: 'Cancel', label: tr('common.cancel'), value: null },
      {
        key: 'Find', label: tr('dialogs.findKey.find'), primary: true,
        onClick: () => {
          const r = app.locateTextKey(input.input.value);
          if (!r.found) {
            msg.textContent = r.message;
            msg.classList.add('is-error');
            input.input.focus();
            return false;
          }
          hit = r;
          return true;
        },
      },
    ],
  }).result.then((v) => {
    if (v !== 'Find' || !hit) return false;
    app.showTextKey(hit);
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------------------------

/** @param {{ title: string, items: [string, string][] }[]} groups  items: [keys ("A / B"), label] */
export function shortcutsDialog(groups) {
  const keys = (k) => h('span', { class: 'le-sc-keys' }, k.split(' / ').map((x, i) => [i ? h('span', { class: 'le-dim' }, '/') : null, h('kbd', { class: 'le-kbd' }, shortcutLabel(x))]));
  const content = h('div', { class: 'le-shortcuts' }, groups.map((g) => h('section', { class: 'le-shortcut-group' },
    h('h3', null, g.title),
    g.items.map(([k, label]) => h('div', { class: 'le-sc-row' }, h('span', { class: 'le-sc-label' }, label), keys(k))))));
  return showDialog({ title: tr('dialogs.shortcuts.title'), icon: ICONS.keyboard, width: 860, content, buttons: [{ key: 'Close', label: tr('common.close'), primary: true }] }).result;
}

// ---------------------------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------------------------

/**
 * Offer to restore the autosaved working copy.
 * @returns {Promise<boolean|null>} true = restore, false = discard, null = dismissed (keep it)
 */
export function restoreDialog(meta, { older = 0, reopened = false } = {}) {
  const when = formatTime(meta.savedAt);
  return confirmDialog({
    title: tr('dialogs.restore.title'), icon: ICONS.info, width: 460,
    message: h('div', null,
      h('p', { class: 'le-dialog-text' }, reopened ? tr('dialogs.restore.reopened') : tr('dialogs.restore.closed')),
      h('div', { class: 'le-restore-card' }, icon(ICONS.map, 'le-icon le-file-icon'), h('div', null, h('div', { class: 'le-file-title' }, meta.name || tr('common.untitled')), h('div', { class: 'le-file-sub' }, tr('dialogs.restore.meta', { w: meta.width ?? '?', d: meta.depth ?? '?', when })))),
      h('p', { class: 'le-dialog-text le-dim' }, `${tr('dialogs.restore.later')}${older ? trn('dialogs.restore.older', older) : ''}`)),
    buttons: [{ key: 'Discard', label: tr('dialogs.restore.discard'), value: false }, { key: 'Restore', label: tr('dialogs.restore.restore'), value: true, primary: true }],
  });
}

/**
 * `validateLevel` messages → issue codes (a plain message string handed to `friendlyProblem`).
 * @type {[RegExp, (m: RegExpMatchArray) => { code: string, row?: number, length?: number }][]}
 */
const PROBLEM_MESSAGES = [
  [/^spawn is not on walkable ground$/, () => ({ code: 'spawn.unwalkable' })],
  [/^spawn is outside the map$/, () => ({ code: 'spawn.outside' })],
  [/^(tiles|heights) row count does not match depth$/, (m) => ({ code: `${m[1]}.rows` })],
  [/^(tiles|heights) row (\d+) has length (\d+)$/, (m) => ({ code: `${m[1]}.row`, row: Number(m[2]), length: Number(m[3]) })],
];

/**
 * A play-test problem in the editor's words (the UI says "player start"), in the editor's language.
 * @param {import('../../engine/level/LevelFormat.js').LevelIssue|string} issue  an issue of
 *   `validateLevelIssues` (worded by its `code`), or a `validateLevel` message (English; a known
 *   one is worded like its issue, another is shown capitalised)
 * @returns {string}
 */
export function friendlyProblem(issue) {
  const m = String(typeof issue === 'object' && issue ? issue.message : issue);
  /** @type {{ code?: string, row?: number, length?: number }|null} */
  let it = typeof issue === 'object' && issue ? issue : null;
  if (!it) {
    for (const [re, make] of PROBLEM_MESSAGES) {
      const hit = m.match(re);
      if (hit) { it = make(hit); break; }
    }
  }
  const row = it?.row ?? '?';
  const length = it?.length ?? '?';
  switch (it?.code) {
    case 'spawn.unwalkable': return tr('dialogs.problem.spawnUnwalkable');
    case 'spawn.outside': return tr('dialogs.problem.spawnOutside');
    case 'tiles.rows': return tr('dialogs.problem.damaged', { detail: tr('dialogs.problem.tilesRows') });
    case 'heights.rows': return tr('dialogs.problem.damaged', { detail: tr('dialogs.problem.heightsRows') });
    case 'tiles.row': return tr('dialogs.problem.damaged', { detail: tr('dialogs.problem.tilesRow', { row, length }) });
    case 'heights.row': return tr('dialogs.problem.damaged', { detail: tr('dialogs.problem.heightsRow', { row, length }) });
    default: break;
  }
  if (/^tiles row count|^heights row count|row \d+ has length/.test(m)) return tr('dialogs.problem.damaged', { detail: m });
  // (an unknown message is English: capitalised as before)
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/** Play-test blocked by validation errors. */
export function problemsDialog(title, errors, { fixSpawn = null } = {}) {
  return showDialog({
    title, icon: ICONS.warning, width: 500,
    content: [h('p', { class: 'le-dialog-text' }, tr('dialogs.problems.intro')), h('ul', { class: 'le-dialog-list is-errors' }, errors.map((e) => h('li', null, e)))],
    buttons: [
      fixSpawn ? { key: 'Select player start', label: tr('dialogs.problems.selectSpawn'), left: true, onClick: fixSpawn } : null,
      { key: 'OK', label: tr('common.ok'), primary: true },
    ].filter(Boolean),
  }).result;
}

/** About box. */
export function aboutDialog() {
  const brand = BRAND_NAME;
  return showDialog({
    title: tr('dialogs.about.title', { brand }), icon: ICONS.help, width: 480,
    content: h('div', { class: 'le-about' },
      h('div', { class: 'le-about-logo' }, brand),
      h('p', { class: 'le-dialog-text' }, tr('dialogs.about.text', { brand })),
      h('p', { class: 'le-dialog-text le-dim' }, tr('dialogs.about.format'))),
    buttons: [{ key: 'Close', label: tr('common.close'), primary: true }],
  }).result;
}
