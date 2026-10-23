/**
 * EditorApp — the Luminati level editor application (docs/contracts/LEVEL_EDITOR.md §6-§8): layout, menus,
 * panels, the 2D map and 3D preview views, keyboard shortcuts, clipboard, dialogs, saving /
 * loading (project folder, browser storage, files, drag & drop), autosave and play-testing.
 *
 * Exposes `window.__editor = { app, state, tools, view3d, view2d, textures, ready3d, seedTextKeys }`
 * for scripted tests (`EditorHooks`, above the class).
 */
import { TextureLibrary } from '../engine/pixel/Textures.js';
import {
  createEmptyLevel, validateLevelIssues, parseLevel, tileDef, getHeightLevel, LEVEL_FORMAT,
} from '../engine/level/LevelFormat.js';
import { OBJECT_TYPES, ENEMY_INFO, enemyStartPoints, levelHasCombat } from '../engine/level/ObjectCatalog.js';
import {
  enemyKind, bossArena, strayArena, gateEdgeGap, GATE_EDGE_TOLERANCE, dataColliders, levelStartTest, bossExtraCount,
} from './enemyGroups.js';
import {
  PLAYTEST_SLOT, hasProjectApi, saveProjectLevel, loadProjectLevel, saveLocalLevel, loadLocalLevel,
  listLocalLevels, listProjectLevels, downloadLevel, readLevelFile, openLevelFileDialog, slugify, projectLevelPath,
  levelsApi,
} from '../engine/level/LevelStorage.js';
import { levelExits, inExit, travelIssues } from '../engine/level/Travel.js';
import { storyIssues, formatStoryIssue } from '../engine/level/StoryChecks.js';
import { campaignStoryContext, storyCheckContext, onStoryContext, otherFileTexts } from './story.js';
import { mayHide, shownOnly, hiddenOnly, leftOutMessage, revealPatch } from './visibility.js';
import { createRoomLevel, isRoom } from './rooms.js';
import { EditorState } from './EditorState.js';
import { TOOLS, getTool } from './tools/index.js';
import { notifyPlaced } from './tools/PlaceTool.js';
import {
  deleteSelection, duplicateSelection, rotateSelection, nudgeSelection, copySelection, pasteObjects, boundsOfIds, tidy,
} from './tools/common.js';
import { Map2DView } from './map2d/Map2DView.js';
import { h, icon, isTypingTarget } from './ui/dom.js';
import { MenuBar } from './ui/MenuBar.js';
import { Toolbar } from './ui/Toolbar.js';
import { ToolOptions } from './ui/ToolOptions.js';
import { Inspector } from './ui/Inspector.js';
import { Outliner } from './ui/Outliner.js';
import { StatusBar } from './ui/StatusBar.js';
import { tooltip } from './ui/Tooltip.js';
import { segmented } from './ui/fields.js';
import { dialogOpen, confirmDialog, alertDialog } from './ui/Dialog.js';
import { showContextMenu, closeContextMenu } from './ui/ContextMenu.js';
import {
  newLevelDialog, openLevelDialog, saveAsDialog, levelSettingsDialog, resizeDialog, shortcutsDialog,
  restoreDialog, problemsDialog, aboutDialog, friendlyProblem, storyPreviewDialog, findTextKeyDialog,
} from './ui/dialogs.js';
import {
  writeAutosave, readAutosaveMeta, loadAutosave, clearAutosave, discardAutosave, listRecovered, loadRecovered,
  deleteRecovered, SESSION_ID,
} from './autosave.js';
import { ICONS, LOGO_SVG } from './icons.js';
import { ownValue } from '../engine/utils/own.js';
import { textKeyWarnings, textMapOf, parseKeyInput, findTextKey } from './textKeys.js';
import { levelTexts } from '../engine/i18n/TextKeys.js';
import { getLang } from '../engine/i18n/I18n.js';
import {
  tr, trn, andList, commaList, editorLang, langName, switchLanguage, EDITOR_LANGS,
} from './i18n.js';
import { BRAND_NAME } from './brand.js';

/**
 * A game URL in the editor's language: `&lang=` added unless English (a `?lang=` on the editor is
 * not saved, so the game would not otherwise follow it).
 * @param {string} url
 */
const withLang = (url) => (getLang() === 'en' ? url : `${url}${url.includes('?') ? '&' : '?'}lang=${getLang()}`);

/**
 * @import { Level, LevelObjectOf } from '../engine/level/types.js'
 * @import { Viewport3D } from './viewport3d/Viewport3D.js'
 * @import * as Viewport3DModule from './viewport3d/Viewport3D.js'
 * @import { FileRef } from './EditorState.js'
 * @import { MenuCommand } from './ui/MenuBar.js'
 * @import { TextRow } from './textKeys.js'
 */

const PREFS_KEY = 'luminati.editor.prefs';
/** `format` of the objects the editor copies to the system clipboard. */
export const CLIPBOARD_FORMAT = 'luminati-objects';
const AUTOSAVE_MS = 20000;
/** The lazy 3D view module (a Vite glob: path → loader). */
const viewport3dModules = /** @type {Record<string, () => Promise<typeof Viewport3DModule>>} */ (import.meta.glob('./viewport3d/Viewport3D.js'));

const DEG = Math.PI / 180;
/** The name of a new level (?new, File › New) until the user names it. */
const DEFAULT_NAME = 'Untitled';
const DEFAULT_NAMES = new Set(['Untitled', 'New Level', '']);

/** A stored file ref ({ kind, name }) made safe. */
function normalizeRef(ref) {
  if (!(ref && typeof ref === 'object' && ['new', 'local', 'project', 'file'].includes(ref.kind))) return { kind: 'new', name: '' };
  const out = { kind: ref.kind, name: String(ref.name ?? '') };
  // a campaign's level (docs/specs/CAMPAIGN_FORMAT.md)
  if (ref.kind === 'project' && typeof ref.campaign === 'string' && ref.campaign) out.campaign = slugify(ref.campaign);
  return out;
}

/**
 * The project file of a file ref, as the editor names it (`public/levels/<name>.json`, or
 * `public/campaigns/<campaign>/levels/<name>.json`).
 * @param {FileRef} ref a `project` ref
 */
export function projectFile(ref) {
  return `public/${projectLevelPath(ref.name, { campaign: ref.campaign })}`;
}

/**
 * A file as copy-on-write and *Find by text key…* name it: `public/levels/<name>.json` (or a
 * campaign's), `browser slot “<name>”`, a file's name; '' for a new document. An identity (the
 * same in every language): `fileDisplay` is its shown form.
 * @param {FileRef} ref
 * @returns {string}
 */
function fileLabel(ref) {
  if (ref.kind === 'project') return projectFile(ref);
  if (ref.kind === 'local') return `browser slot “${ref.name}”`;
  return ref.kind === 'file' ? ref.name : '';
}

/**
 * A file as the UI names it (`fileLabel` in the editor's language).
 * @param {FileRef} ref
 * @returns {string}
 */
function fileDisplay(ref) {
  if (ref.kind === 'local') return tr('app.file.local', { name: ref.name });
  return fileLabel(ref);
}

/**
 * A project file ref (`campaign`: a campaign's level).
 * @param {string} name
 * @param {string} [campaign]
 * @returns {FileRef}
 */
const projectRef = (name, campaign = '') => (campaign ? { kind: 'project', name: slugify(name), campaign: slugify(campaign) } : { kind: 'project', name: slugify(name) });

/**
 * `window.__editor` (docs/specs/AUTOMATION_API.md §6), set by the EditorApp constructor for
 * scripted tests (the type of `Window.__editor` in src/globals.d.ts: a member added to that object
 * must be added here too). Wait with `await __editor.app.ready`, then `await __editor.ready3d`.
 * @typedef {object} EditorHooks
 * @property {EditorApp} app  the app: `ready`, `run(commandId)`, `openProject`, `playtest()` …
 * @property {EditorApp['state']} state  the EditorState (document, selection, tool, view, undo)
 * @property {EditorApp['tools']} tools  tool objects by id (`select`, `paint`, … tools/index.js)
 * @property {EditorApp['textures']} textures  the shared TextureLibrary
 * @property {EditorApp['view2d']} view2d  (getter) the Map2DView; null until mounted
 * @property {EditorApp['view3d']} view3d  (getter) the Viewport3D (3D preview); null until mounted
 *   or when it could not start
 * @property {Promise<void>} ready3d  (getter) resolves after `app.ready` and the 3D view's first
 *   full build
 * @property {(prefix?: string|null) => void} seedTextKeys  makes the keys the editor gives new
 *   texts deterministic (`TextKeys.seededMint(prefix)`: the same edits, the same keys) for scripted
 *   checks; null / no prefix: random again (`EditorState#seedTextKeys`, docs/specs/I18N.md §4.10)
 */

export class EditorApp {
  /**
   * Also sets `window.__editor` (`EditorHooks`, above the class).
   * @param {HTMLElement} root   the element to build the editor in (replaced content)
   * @param {{ textures?: TextureLibrary, level?: Level }} [opts]
   */
  constructor(root, { textures = null, level = null } = {}) {
    this.root = root;
    /** The shared texture library (2D swatches, 2D map, 3D view). */
    this.textures = textures ?? new TextureLibrary({ seed: 1337, anisotropy: 4 });
    this.state = new EditorState(level ?? createEmptyLevel({ name: 'Untitled' }));
    // a hidden object is never selected (src/editor/visibility.js, KNOWN_ISSUES STORY-06)
    this.state.selectionFilter = (ids) => shownOnly(this.state, ids);
    // copy-on-write of text keys: the texts the campaign's other files hold (./story.js)
    this.state.otherTexts = () => otherFileTexts(this.state);
    this.tools = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
    /** @type {Map2DView|null} */
    this.view2d = null;
    /** @type {Viewport3D|null} */
    this.view3d = null;
    this.projectApi = false;
    this.clipboard = [];
    this._changeCount = 0;
    this._autosavedAt = 0;
    this._lastTool = getTool(this.state.toolId);
    /** While true, `_dropHiddenFromSelection` keeps its message in `_heldDropMsg` (a save shows it). */
    this._holdDropMsg = false;
    this._heldDropMsg = '';
    /** The read of the file a *Save As* left (`_rememberCopiedFrom`; scripted checks await it). */
    this._copiedRead = Promise.resolve();
    /** The shown names of the files a *Save As* left, by their `fileLabel`. @type {Map<string, string>} */
    this._copiedNames = new Map();

    this._loadPrefs();
    this.commands = this._buildCommands();
    this._buildLayout();
    this._wireState();
    this._wireWindow();
    this._applyLayout();

    const self = this;
    window.__editor = {
      app: this,
      state: this.state,
      tools: this.tools,
      textures: this.textures,
      get view2d() { return self.view2d; },
      get view3d() { return self.view3d; },
      /** Resolves once the first level is loaded and the 3D preview's first full build is done. */
      get ready3d() { return Promise.resolve(self.ready).then(() => self.view3d?.ready); },
      seedTextKeys: (prefix) => this.state.seedTextKeys(prefix),
    };
    this.ready = this.start();
  }

  // -------------------------------------------------------------------------------------------
  // Startup
  // -------------------------------------------------------------------------------------------

  /**
   * Resolve ?open= (project level) / ?local= (browser slot) / ?new / autosave restore. Resolves
   * when the first level is loaded and the 3D preview exists (`view3d` is set, or null when it
   * could not start; its first build is `view3d.ready` / `__editor.ready3d`).
   */
  async start() {
    const mounted = this._mount3D();
    try {
      await this._openFirst();
    } finally {
      await mounted;
    }
  }

  async _openFirst() {
    this.projectApi = await hasProjectApi().catch(() => false);
    this._updateDoc();
    const q = new URLSearchParams(location.search);
    const open = q.get('open');
    const local = q.get('local');
    try {
      // (an autosave of another session is never overwritten unresolved: this session's first
      // autosave moves it to the recovered copies — see autosave.js)
      if (open) {
        // `?open=<name>` (public/levels) or `?open=<campaign>/<name>` (a campaign's level)
        const [campaign, name] = open.includes('/') ? open.split('/', 2) : ['', open];
        const ok = await this.openProject(name, { confirm: false, campaign });
        if (ok) await this._offerRestore(projectRef(name, campaign));
        return;
      }
      if (local) {
        const ok = await this.openLocal(local, { confirm: false });
        if (ok) await this._offerRestore({ kind: 'local', name: local });
        return;
      }
      // (`?new=room`: a new room, as File › New › Room makes it)
      if (q.has('new')) { this._startBlank(q.get('new') === 'room' ? 'room' : 'level'); return; }
      if (await this._offerRestore(null)) return;
      this._startBlank();
    } catch (e) {
      console.warn('[editor] startup:', e);
      this._startBlank();
      alertDialog({ title: tr('app.open.failed'), message: String(e?.message ?? e), icon: ICONS.warning });
    }
  }

  /** @param {'level'|'room'} [kind] */
  _startBlank(kind = 'level') {
    this.state.replaceLevel(kind === 'room' ? createRoomLevel({ name: DEFAULT_NAME }) : createEmptyLevel({ name: DEFAULT_NAME }), { kind: 'new', name: '' });
    this._updateDoc();
  }

  /**
   * Offer to restore the autosaved working copy of an earlier session. `only` = a file ref: only
   * offer a copy of that level (after `?open=` / `?local=`). Resolves true when it was restored.
   */
  async _offerRestore(only) {
    const meta = readAutosaveMeta();
    if (!meta || meta.sid === SESSION_ID || meta.exported) return false;
    const ref = normalizeRef(meta.fileRef);
    if (only && !(ref.kind === only.kind && ref.name === only.name && (ref.campaign ?? '') === (only.campaign ?? ''))) return false;
    const older = listRecovered().filter((e) => !e.exported).length;
    const restore = await restoreDialog(meta, { older, reopened: !!only });
    if (restore === true) {
      const r = loadAutosave();
      if (!r) { this.state.notify(tr('app.restore.unreadable'), { error: true }); return false; }
      // the copy now lives in this editor (and in this session's own autosave from here on)
      discardAutosave();
      this._replaceDoc(r.level, ref, { unsaved: true });
      this.state.notify(tr('app.restore.done', { name: r.level.name }));
      return true;
    }
    // an explicit "Discard"; closing the dialog (Esc / ×) keeps the copy (it moves to
    // File › Open › This browser › Recovered once this session autosaves)
    if (restore === false) discardAutosave();
    return false;
  }

  /** Open a recovered copy of another session's unsaved work (File › Open › This browser). */
  async openRecovered(id, { confirm = true } = {}) {
    const entry = listRecovered().find((e) => e.id === id);
    const r = loadRecovered(id);
    if (!entry || !r) { alertDialog({ title: tr('app.recovered.failed'), message: tr('app.recovered.gone'), icon: ICONS.warning }); return false; }
    if (confirm && !(await this.confirmDiscard('openRecovered'))) return false;
    this._replaceDoc(r.level, normalizeRef(entry.fileRef), { unsaved: true });
    deleteRecovered(id);
    this.state.notify(tr('app.recovered.opened', { name: r.level.name }));
    return true;
  }

  /**
   * Make `level` the document (new / open / paste / restore): clears history, resets the tools,
   * and resolves this session's autosave (the old document was saved or discarded).
   * @param {Level} level
   * @param {FileRef} [fileRef]
   * @param {{ unsaved?: boolean }} [opts] unsaved: the level is not saved anywhere (restored,
   *   pasted): it stays dirty and is autosaved at once
   */
  _replaceDoc(level, fileRef, { unsaved = false } = {}) {
    this.state.replaceLevel(level, fileRef);
    this._newerFile = null;
    clearAutosave();
    this._autosavedAt = this._changeCount;
    this._autosaveFailed = false;
    if (unsaved) {
      this.state.markUnsaved();
      this._autosave(true);
    }
    this._updateDoc();
  }

  async _mount3D() {
    const slot = this.vp3dHost;
    const load = viewport3dModules['./viewport3d/Viewport3D.js'];
    if (!load) { this._placeholder3D(tr('app.vp3d.notInstalled')); return; }
    try {
      const mod = await load();
      if (typeof mod.Viewport3D !== 'function') throw new Error('Viewport3D.js does not export a Viewport3D class');
      // Retry after a late failure: release the previous instance (GL context, listeners) first
      if (this.view3d) { try { this.view3d.dispose?.(); } catch { /* already broken */ } this.view3d = null; }
      this.view3d = new mod.Viewport3D(slot, this.state, { textures: this.textures });
      this.view3d.setActive?.(this.state.view.layout !== '2d');
      // the 2D map's enemy and critter start dots use the 3D view's start tests (every prop's and
      // villager's collider; their level-data form while the view is hidden), and follow them when
      // they change (lazy: while a build of the document is due, the 2D map's own data test until
      // it lands)
      const v3 = this.view3d;
      if (this.view2d) {
        this.view2d.startTestSource = (flier) => (this.view3d === v3 ? v3.enemyStartTest?.(flier, { lazy: true }) ?? null : null);
        this.view2d.critterTestSource = () => (this.view3d === v3 ? v3.critterStartTest?.({ lazy: true }) ?? null : null);
      }
      v3.onPlacementChange = () => { if (this.view3d === v3) this.view2d?.placementChanged(); };
      Promise.resolve(this.view3d.ready).then(() => {
        this.vp3d.classList.add('is-ready');
        this._watch3DBuild();
      }).catch((e) => { console.warn('[editor] 3D view:', e); this._set3DLoading(false); });
      this._resizeViews();
    } catch (e) {
      console.warn('[editor] 3D preview unavailable:', e);
      this.view3d = null;
      this._placeholder3D(tr('app.vp3d.couldNotStart', { message: e?.message ?? e }));
    }
  }

  _placeholder3D(message) {
    this.vp3dHost.replaceChildren(h('div', { class: 'le-vp-placeholder' },
      icon(ICONS.cube, 'le-icon le-vp-placeholder-icon'),
      h('div', { class: 'le-vp-placeholder-title' }, tr('app.vp3d.unavailable')),
      h('div', { class: 'le-vp-placeholder-text' }, message, tr('app.vp3d.unavailableMore')),
      h('div', { class: 'le-vp-placeholder-actions' },
        h('button', { class: 'le-btn is-small', type: 'button', onClick: () => { this.vp3dHost.replaceChildren(); this._mount3D(); } }, tr('app.vp3d.retry')),
        h('button', { class: 'le-btn is-small', type: 'button', onClick: () => this.state.setView({ layout: '2d' }) }, icon(ICONS.layout2d), tr('app.vp3d.only2d')))));
  }

  // -------------------------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------------------------

  _buildLayout() {
    const st = this.state;
    this.root.replaceChildren();
    this.root.classList.add('le-app');

    // ---- menu bar
    this.menubarEl = h('header', { class: 'le-menubar' });
    const brand = h('div', { class: 'le-brand', title: tr('app.brand.title', { brand: BRAND_NAME }) }, h('span', { class: 'le-brand-logo', html: LOGO_SVG }), h('span', { class: 'le-brand-name' }, BRAND_NAME), h('span', { class: 'le-brand-sub' }, tr('app.brand.sub')));
    this.menubarEl.appendChild(brand);
    this.menubar = new MenuBar(this.menubarEl, { menus: this._menus(), commands: this.commands, run: (id) => this.run(id) });

    // the level's display name (title screen, banner): click to rename / edit the settings
    this.docNameText = h('span', { class: 'le-doc-name-text' });
    this.docName = h('button', { class: 'le-doc-name', type: 'button', onClick: () => this.run('level.settings') }, this.docNameText, icon(ICONS.pencil, 'le-icon le-doc-name-edit'));
    tooltip(this.docName, { title: tr('app.doc.renameTitle'), text: tr('app.doc.renameText'), place: 'bottom' });
    this.dirtyDot = h('span', { class: 'le-dirty-dot', title: tr('app.doc.unsaved') });
    this.docWhere = h('span', { class: 'le-doc-where' });
    this.menubarEl.appendChild(h('div', { class: 'le-doc' }, this.docName, this.dirtyDot, this.docWhere));

    const undoBtn = h('button', { class: 'le-icon-btn', type: 'button', onClick: () => this.run('edit.undo') }, icon(ICONS.undo));
    const redoBtn = h('button', { class: 'le-icon-btn', type: 'button', onClick: () => this.run('edit.redo') }, icon(ICONS.redo));
    tooltip(undoBtn, () => ({ title: st.canUndo ? tr('app.cmd.undoWhat', { what: st.undoLabel }) : tr('app.history.nothingToUndo'), key: 'Ctrl+Z', place: 'bottom' }));
    tooltip(redoBtn, () => ({ title: st.canRedo ? tr('app.cmd.redoWhat', { what: st.redoLabel }) : tr('app.history.nothingToRedo'), key: 'Ctrl+Y', place: 'bottom' }));
    this.undoBtn = undoBtn;
    this.redoBtn = redoBtn;
    this.layoutSeg = segmented({
      options: [
        { value: 'split', icon: ICONS.layoutSplit, label: '3D + 2D', iconOnly: true, title: tr('app.layout.split') },
        { value: '3d', icon: ICONS.layout3d, label: '3D', iconOnly: true, title: tr('app.layout.only3d') },
        { value: '2d', icon: ICONS.layout2d, label: '2D', iconOnly: true, title: tr('app.layout.only2d') },
      ],
      value: st.view.layout, onChange: (v) => st.setView({ layout: v }), small: true, className: 'le-layout-seg',
    });
    const playBtn = h('button', { class: 'le-play-btn', type: 'button', onClick: () => this.run('level.playtest') }, icon(ICONS.play), h('span', null, tr('app.play.button')));
    tooltip(playBtn, { title: tr('app.play.title'), key: 'F5', text: tr('app.play.text'), place: 'bottom' });
    this.menubarEl.appendChild(h('div', { class: 'le-menubar-right' }, undoBtn, redoBtn, h('span', { class: 'le-vsep' }), this.layoutSeg.el, h('span', { class: 'le-vsep' }), playBtn));

    // ---- main area
    const left = h('div', { class: 'le-left' });
    this.toolbar = new Toolbar(left, st);
    this.toolOptions = new ToolOptions(left, st, { textures: this.textures });

    this.vp3dHost = h('div', { class: 'le-vp-host' });
    this.vp2dHost = h('div', { class: 'le-vp-host' });
    // "Building the 3D preview…" until the first full build is on screen (and during big loads)
    this.vp3dLoading = h('div', { class: 'le-vp-loading is-on', role: 'status' }, h('span', { class: 'le-spinner' }), h('span', { class: 'le-vp-loading-text' }, tr('app.vp3d.building')));
    this.vp3d = h('section', { class: 'le-vp le-vp3d', 'aria-label': tr('app.vp3d.aria') }, this.vp3dHost, this.vp3dLoading,
      h('div', { class: 'le-vp-bar' }, h('span', { class: 'le-vp-title' }, icon(ICONS.cube), h('span', { class: 'le-vp-title-text' }, tr('app.vp3d.title'))), this._build3DTools()));
    const zoomLabel = h('span', { class: 'le-vp-zoom' });
    this._zoomLabel = zoomLabel;
    const vpBtn = (ic, title, key, fn, cls = '') => {
      const b = h('button', { class: ['le-vp-btn', cls], type: 'button', 'aria-label': title, onClick: fn }, icon(ic));
      tooltip(b, { title, key, place: 'bottom' });
      return b;
    };
    this.gridBtn = vpBtn(ICONS.grid, tr('app.cmd.grid'), 'Ctrl+G', () => this.run('view.grid'));
    this.texBtn = vpBtn(ICONS.texture, tr('app.vp2d.textured'), '', () => this.run('view.textured2d'));
    this.vp2d = h('section', { class: 'le-vp le-vp2d', 'aria-label': tr('app.vp2d.aria') }, this.vp2dHost,
      h('div', { class: 'le-vp-bar' },
        h('span', { class: 'le-vp-title' }, icon(ICONS.map), h('span', { class: 'le-vp-title-text' }, tr('app.vp2d.title'))),
        h('span', { class: 'le-vp-tools' },
          this.gridBtn, this.texBtn,
          h('span', { class: 'le-vp-sep' }),
          h('span', { class: 'le-vp-zoomgroup' },
            vpBtn(ICONS.minus, tr('app.vp2d.zoomOut'), '', () => this.view2d?.zoomBy(1 / 1.4)),
            zoomLabel,
            vpBtn(ICONS.plus, tr('app.vp2d.zoomIn'), '', () => this.view2d?.zoomBy(1.4))),
          vpBtn(ICONS.frame, tr('app.cmd.frameLevel'), 'Home', () => this.run('view.frameLevel')))));
    this.splitter = h('div', { class: 'le-splitter', role: 'separator', 'aria-orientation': 'vertical', title: tr('app.splitter.split') });
    this.viewports = h('div', { class: 'le-viewports' }, this.vp3d, this.splitter, this.vp2d);
    const center = h('main', { class: 'le-center' }, this.viewports);

    const right = h('div', { class: 'le-right' });
    const actions = {
      focus: (ids) => this.focusIds(ids),
      reveal: (ids) => this.reveal(ids),
      duplicate: () => this.run('edit.duplicate'),
      remove: () => this.run('edit.delete'),
      rotate: (deg) => rotateSelection(st, deg * DEG),
      settings: () => this.run('level.settings'),
      resize: () => this.run('level.resize'),
      playtest: () => this.run('level.playtest'),
    };
    this.inspector = new Inspector(right, st, actions);
    this.rightSplitter = h('div', { class: 'le-hsplitter', role: 'separator', 'aria-orientation': 'horizontal', title: tr('app.splitter.panels') });
    right.appendChild(this.rightSplitter);
    this.outliner = new Outliner(right, st, actions);

    this.main = h('div', { class: 'le-main' }, left, center, right);
    this.root.append(this.menubarEl, this.main);
    this.statusbar = new StatusBar(this.root, st);

    this.dropOverlay = h('div', { class: 'le-drop-overlay' }, h('div', { class: 'le-drop-card' }, icon(ICONS.upload, 'le-icon le-drop-icon'), h('div', null, tr('app.drop'))));
    this.root.appendChild(this.dropOverlay);
    this.loadingOverlay = h('div', { class: 'le-loading-overlay', role: 'status' }, h('div', { class: 'le-drop-card' }, h('span', { class: 'le-spinner' }), h('div', { class: 'le-loading-text' }, tr('app.loading'))));
    this.root.appendChild(this.loadingOverlay);
    // a mouse click leaves no focus on buttons outside dialogs: Enter / Space then never
    // re-trigger the last clicked toolbar button, and shortcuts reach the views
    this.root.addEventListener('click', (e) => {
      if (e.detail === 0) return; // keyboard activation keeps the focus
      const b = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest?.('button, [role="radio"], input[type="checkbox"], input[type="range"]'));
      if (b && this.root.contains(b)) setTimeout(() => { if (document.activeElement === b) b.blur(); }, 0);
    });

    // views
    this.view2d = new Map2DView(this.vp2dHost, st, { textures: this.textures });
    this._bindSplitters();
    this.vp2d.addEventListener('le-zoom', (e) => this._setZoomLabel(/** @type {CustomEvent} */ (e).detail.zoom));
    this.root.addEventListener('le-focus', (e) => this.focusIds([/** @type {CustomEvent} */ (e).detail.id]));
    this.root.addEventListener('le-contextmenu', (e) => this._contextMenu(/** @type {CustomEvent} */ (e).detail));
    this._setZoomLabel(this.view2d.zoomPercent);
  }

  /** The 3D bar's tools: preview time of day (follows the level's start time) and the camera help. */
  _build3DTools() {
    const st = this.state;
    const range = h('input', { class: 'le-range le-time-range', type: 'range', min: '0', max: '24', step: '0.25', 'aria-label': tr('app.vp3d.timeAria') });
    const label = h('span', { class: 'le-vp-time' });
    const link = h('button', { class: 'le-vp-btn le-time-link', type: 'button', 'aria-label': tr('app.vp3d.follow') }, icon(ICONS.link));
    tooltip(link, () => ({ title: st.view.timeFollow !== false ? tr('app.vp3d.following') : tr('app.vp3d.follow'), text: tr('app.vp3d.followText'), place: 'top' }));
    range.addEventListener('input', () => st.setView({ timeOfDay: Number(range.value), timeFollow: false }));
    // mouse users go back to the views: the slider must not keep the keyboard
    range.addEventListener('pointerup', () => setTimeout(() => range.blur(), 0));
    range.addEventListener('change', () => { if (document.activeElement === range && !range.matches(':focus-visible')) range.blur(); });
    link.addEventListener('click', () => st.setView({ timeFollow: true, timeOfDay: Number(st.level.environment?.timeOfDay ?? 17.2) }));
    const help = h('button', { class: 'le-vp-btn', type: 'button', 'aria-label': tr('app.vp3d.controls') }, icon(ICONS.help));
    tooltip(help, { title: tr('app.vp3d.controls'), text: tr('app.vp3d.controlsText'), place: 'top' });
    help.addEventListener('click', () => this.run('help.shortcuts'));
    this._timeUI = { range, label, link };
    this._syncTimeUI();
    return h('span', { class: 'le-vp-tools le-vp-timegroup' }, icon(ICONS.sun, 'le-icon le-vp-time-icon'), range, label, link, h('span', { class: 'le-vp-sep' }), help);
  }

  _syncTimeUI() {
    const t = this._timeUI;
    if (!t) return;
    const v = this.state.view;
    const hour = Number(v.timeOfDay ?? 14);
    if (document.activeElement !== t.range) t.range.value = String(hour);
    t.range.style.setProperty('--k', `${(hour / 24) * 100}%`);
    const hh = Math.floor(hour) % 24;
    const mm = Math.round((hour - Math.floor(hour)) * 60);
    t.label.textContent = `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`;
    t.link.classList.toggle('is-active', v.timeFollow !== false);
  }

  /** Preview time = the level's start time while following it (on load and settings edits). */
  _followLevelTime() {
    const st = this.state;
    if (st.view.timeFollow === false) return;
    const t = Number(st.level.environment?.timeOfDay);
    if (Number.isFinite(t) && t !== st.view.timeOfDay) st.setView({ timeOfDay: t });
  }

  _set3DLoading(on, text = tr('app.vp3d.building')) {
    if (!this.vp3dLoading) return;
    this.vp3dLoading.lastChild.textContent = text;
    this.vp3dLoading.classList.toggle('is-on', !!on);
  }

  /** Keep the 3D loading overlay up until the view equals a full build (or a few seconds pass). */
  _watch3DBuild(maxMs = 12000) {
    const t0 = performance.now();
    clearInterval(this._buildWatch);
    this._buildWatch = setInterval(() => {
      const v = this.view3d;
      const busy = v && (v.terrain?.pendingChunks?.size > 0 || v.terrain?.slicing || v.props?.hasPendingExact || v.scenery?.pending || v.scenery?.building);
      if (!busy || performance.now() - t0 > maxMs) {
        clearInterval(this._buildWatch);
        this._set3DLoading(false);
      }
    }, 120);
  }

  /**
   * Run `fn` (a level replacement) under a loading overlay: big levels block the page while the
   * views rebuild, so the overlay is painted first (two frames) and removed once the 3D preview
   * built them.
   */
  async _withLoading(text, fn, level = null) {
    const L = level ?? this.state.level;
    const big = (L?.width ?? 0) * (L?.depth ?? 0) > 72 * 72 || (L?.objects?.length ?? 0) > 300;
    if (!big) { fn(); return; }
    this.loadingOverlay.querySelector('.le-loading-text').textContent = text;
    this.loadingOverlay.classList.add('is-on');
    this._set3DLoading(true, text);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      fn();
    } finally {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      this.loadingOverlay.classList.remove('is-on');
      if (this.view3d && this.state.view.layout !== '2d') this._watch3DBuild(8000);
      else this._set3DLoading(false);
    }
  }

  _setZoomLabel(z) {
    this._zoomLabel.textContent = `${z}%`;
    this.statusbar?.setZoom(z);
  }

  _bindSplitters() {
    const st = this.state;
    this.splitter.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.splitter.setPointerCapture(e.pointerId);
      this.splitter.classList.add('is-dragging');
      this._splitDragging = true;
      // the 3D drawing buffer follows the drag ~10× a second (CSS stretches it in between)
      this.view3d?.setResizeThrottle?.(100);
      const r = this.viewports.getBoundingClientRect();
      const move = (ev) => {
        const k = Math.max(0.2, Math.min(0.8, (ev.clientX - r.left) / r.width));
        st.setView({ split: Math.round(k * 1000) / 1000 });
      };
      const up = () => {
        this.splitter.classList.remove('is-dragging');
        this._splitDragging = false;
        this.view3d?.setResizeThrottle?.(0);
        this.splitter.removeEventListener('pointermove', move);
        this.splitter.removeEventListener('pointerup', up);
        this.splitter.removeEventListener('pointercancel', up);
        this._savePrefs();
      };
      this.splitter.addEventListener('pointermove', move);
      this.splitter.addEventListener('pointerup', up);
      this.splitter.addEventListener('pointercancel', up);
    });
    this.splitter.addEventListener('dblclick', () => { st.setView({ split: 0.6 }); this._savePrefs(); });

    const right = this.rightSplitter.parentElement;
    this.rightSplitter.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.rightSplitter.setPointerCapture(e.pointerId);
      this.rightSplitter.classList.add('is-dragging');
      const r = right.getBoundingClientRect();
      const move = (ev) => {
        const k = Math.max(0.25, Math.min(0.85, (ev.clientY - r.top) / r.height));
        this.prefs.inspector = k;
        right.style.setProperty('--insp', `${k * 100}%`);
      };
      const up = () => {
        this.rightSplitter.classList.remove('is-dragging');
        this.rightSplitter.removeEventListener('pointermove', move);
        this.rightSplitter.removeEventListener('pointerup', up);
        this._savePrefs();
      };
      this.rightSplitter.addEventListener('pointermove', move);
      this.rightSplitter.addEventListener('pointerup', up);
    });
    if (this.prefs.inspector) right.style.setProperty('--insp', `${this.prefs.inspector * 100}%`);
  }

  _applyLayout() {
    const v = this.state.view;
    this.root.dataset.layout = v.layout;
    this.viewports.style.setProperty('--split', `${(v.split ?? 0.6) * 100}%`);
    this.layoutSeg.set(v.layout);
    this.gridBtn.classList.toggle('is-active', v.grid !== false);
    this.texBtn.classList.toggle('is-active', v.textured2d !== false);
    this.view2d?.setActive(v.layout !== '3d');
    const was3d = this.view3d?.active;
    this.view3d?.setActive?.(v.layout !== '2d');
    // the 2D map's enemy start dots switch between the 3D view's built test and its level-data
    // test (the same rule; see Viewport3D.enemyStartTest)
    if (this.view3d && was3d !== this.view3d.active) this.view2d?.placementChanged();
    this._resizeViews();
  }

  _resizeViews() {
    // coalesced: at most one resize pass per frame, however many layout events came in
    if (this._resizeQueued) return;
    this._resizeQueued = true;
    requestAnimationFrame(() => {
      this._resizeQueued = false;
      this.view2d?.resize();
      try { this.view3d?.resize?.(); } catch (e) { console.warn('[editor] 3D resize:', e); }
    });
  }

  // -------------------------------------------------------------------------------------------
  // State wiring
  // -------------------------------------------------------------------------------------------

  _wireState() {
    const st = this.state;
    st.on('tool', (id) => {
      const next = getTool(id);
      if (this._lastTool && this._lastTool !== next) {
        try { this._lastTool.deactivate?.(st); } catch (e) { console.warn('[editor] tool deactivate:', e); }
      }
      this._lastTool = next;
      try { next.activate?.(st); } catch (e) { console.warn('[editor] tool activate:', e); }
      st.emit('preview');
    });
    st.on('view', (v) => {
      this._applyLayout();
      this._syncTimeUI();
      if (!this._splitDragging) this._savePrefs();
      this._dropHiddenFromSelection();
    });
    // the campaign's story files arrived (or were read again): what the story preview hides may differ
    this._offStoryContext = onStoryContext((campaign) => {
      if (campaign === this._campaign()) this._storyInputsChanged();
    });
    // undo / redo / a cancelled stroke left hidden objects out of the selection they restored
    st.on('selectionFiltered', (ids) => {
      const msg = leftOutMessage(st, ids, 'leftSelection');
      if (msg) st.notify(msg);
    });
    st.on('dirty', () => this._updateDoc());
    st.on('history', () => this._updateHistory());
    st.on('change', (info) => {
      this._changeCount++;
      // an edit of a condition (or the weather, a pasted or restored object) may hide a selected
      // object: it leaves the selection once the edit is done
      if ((info.objects || info.meta) && info.source !== 'load') this._queueHiddenDrop();
      if (info.meta || info.source === 'load') { this._updateDoc(); this._followLevelTime(); }
      if (info.source === 'load') {
        // a new document: drop half-finished tool gestures (a pending fence start point…)
        const tool = getTool(st.toolId);
        try { tool.deactivate?.(st); tool.activate?.(st); } catch (e) { console.warn('[editor] tool reset:', e); }
        // a campaign's level: its story and level files, read again (Check for problems and the
        // condition hints check names and done: keys against them; another level of the campaign
        // may have been saved since they were read)
        const campaign = this._campaign();
        if (campaign) campaignStoryContext(campaign, { refresh: true });
      }
    });
    this._updateHistory();
    this._updateDoc();
    this._lastTool.activate?.(st);
  }

  _updateHistory() {
    const st = this.state;
    this.undoBtn.disabled = !st.canUndo;
    this.redoBtn.disabled = !st.canRedo;
  }

  /** Level name, unsaved dot, save location and the document title. */
  _updateDoc() {
    const st = this.state;
    const ref = st.fileRef;
    const name = st.level.name || tr('common.untitled');
    this.docNameText.textContent = name;
    this.dirtyDot.classList.toggle('is-on', st.dirty);
    this.dirtyDot.classList.toggle('is-warn', st.dirty && !!this._autosaveFailed);
    this.dirtyDot.title = st.dirty && this._autosaveFailed ? tr('app.doc.unsavedAutosaveFailed') : tr('app.doc.unsaved');
    this.root.classList.toggle('is-dirty', st.dirty);
    const where = ref.kind === 'project' ? projectFile(ref)
      : ref.kind === 'local' ? tr('app.doc.whereLocal', { name: ref.name })
        : ref.kind === 'file' ? tr('app.doc.whereFile', { name: ref.name }) : tr('app.doc.whereNew');
    this.docWhere.textContent = where;
    this.docWhere.className = `le-doc-where is-${ref.kind}`;
    document.title = `${st.dirty ? '● ' : ''}${tr('app.doc.title', { name, brand: BRAND_NAME })}`;
  }

  // -------------------------------------------------------------------------------------------
  // Window-level input: keyboard, clipboard, drag & drop, unload, autosave
  // -------------------------------------------------------------------------------------------

  _wireWindow() {
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    document.addEventListener('copy', (e) => this._onCopy(e, false));
    document.addEventListener('cut', (e) => this._onCopy(e, true));
    document.addEventListener('paste', (e) => this._onPaste(e));
    window.addEventListener('beforeunload', (e) => {
      // (a language switch already asked about the changes: setLanguage)
      if (!this.state.dirty || this._leaving) return;
      this._autosave(true);
      e.preventDefault();
      e.returnValue = '';
    });
    // drag & drop a level file anywhere
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; depth++; this.dropOverlay.classList.add('is-on'); });
    window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) this.dropOverlay.classList.remove('is-on'); });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      this.dropOverlay.classList.remove('is-on');
      const file = [...e.dataTransfer.files].find((f) => /\.json$/i.test(f.name) || f.type.includes('json')) ?? e.dataTransfer.files[0];
      if (file) this.openFile(file);
    });
    this._autosaveTimer = setInterval(() => this._autosave(), AUTOSAVE_MS);
    window.addEventListener('resize', () => this._resizeViews());
  }

  _autosave(force = false) {
    const st = this.state;
    if (!st.dirty || st.inTransaction) return;
    if (!force && this._autosavedAt === this._changeCount) return;
    if (writeAutosave(st.level, st.fileRef)) {
      this._autosavedAt = this._changeCount;
      if (this._autosaveFailed) { this._autosaveFailed = false; this._updateDoc(); }
      return;
    }
    // storage full / unavailable: the tab-close warning still works, but a crash would lose the
    // work — say so once per unsaved period (and keep a warning next to the unsaved dot)
    this._autosavedAt = this._changeCount;
    if (!this._autosaveFailed) {
      this._autosaveFailed = true;
      this._updateDoc();
      st.notify(tr('app.autosaveFailed'), { error: true });
    }
  }

  _onKeyDown(e) {
    if (e.defaultPrevented || e.isComposing) return;
    if (dialogOpen() || this.menubar.isOpen) return;
    const combo = comboOf(e);
    const typing = isTypingTarget(e.target) || isTypingTarget(document.activeElement);
    if (typing) {
      // a few app shortcuts still work while typing; the field commits first
      if (['Ctrl+S', 'Ctrl+Shift+S', 'F5'].includes(combo)) {
        e.preventDefault();
        /** @type {HTMLElement|null} */ (document.activeElement)?.blur?.();
        this.run(this.shortcutIndex.get(combo));
      }
      return;
    }
    // a focused slider keeps its own keyboard control (arrows / Home / End / Page keys)
    const focused = /** @type {HTMLInputElement|null} */ (document.activeElement);
    if (focused?.tagName === 'INPUT' && focused.type === 'range' && /^(Arrow|Home$|End$|Page)/.test(e.key) && !e.ctrlKey && !e.metaKey) return;
    const st = this.state;
    if (st.inTransaction) {
      // mid-stroke (a drag on the map, a slider): only the active tool may react (Esc cancels a
      // move); commands would be folded into the stroke's undo step
      const tool = getTool(st.toolId);
      let handled = false;
      try { handled = !!tool.keyDown?.(e, st); } catch (err) { console.warn('[editor] tool key:', err); }
      if (!handled && e.key === 'Escape') {
        // Esc aborts the stroke: restore the level as it was and reset the tool's stroke state
        st.cancel();
        try { tool.deactivate?.(st); tool.activate?.(st); } catch (err) { console.warn('[editor] tool reset:', err); }
        st.emit('preview');
        st.notify(tr('app.cancelled'));
        handled = true;
      }
      if (handled || e.ctrlKey || e.metaKey || /^F\d+$/.test(e.key)) e.preventDefault();
      return;
    }
    // copy / cut / paste go through the DOM clipboard events
    if (['Ctrl+C', 'Ctrl+X', 'Ctrl+V'].includes(combo)) return;
    const cmd = this.shortcutIndex.get(combo);
    const appFirst = cmd && (/^Ctrl\+/.test(combo) && !['Ctrl+D', 'Ctrl+R', 'Ctrl+Shift+R'].includes(combo) || /^F\d+$/.test(combo));
    if (appFirst) { e.preventDefault(); this.run(cmd); return; }
    // the active tool (Esc, R, Delete, Ctrl+D, arrows…)
    const tool = getTool(st.toolId);
    let handled = false;
    try { handled = !!tool.keyDown?.(e, st); } catch (err) { console.warn('[editor] tool key:', err); }
    if (handled) { e.preventDefault(); return; }
    if (cmd) {
      // only a command that runs claims its key: a disabled one leaves it to the other listeners
      // (F with nothing selected: the 3D view's focus on the hovered point); a Ctrl combo stays
      // blocked either way (Ctrl+D would bookmark the page, Ctrl+R reload it)
      if (this.canRun(cmd)) { e.preventDefault(); this.run(cmd); } else if (e.ctrlKey || e.metaKey) e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    if (!e.altKey) {
      const t = TOOLS.find((x) => x.shortcut.toLowerCase() === e.key.toLowerCase());
      if (t) { e.preventDefault(); st.setTool(t.id); return; }
    }
    // arrows nudge the selection with any tool, like the select tool's (0.5, Shift 2, Alt 0.1)
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && st.selection.length) {
      e.preventDefault();
      const step = e.shiftKey ? 2 : e.altKey ? 0.1 : 0.5;
      nudgeSelection(st, tidy(arrows[e.key][0] * step), tidy(arrows[e.key][1] * step));
    }
  }

  _onCopy(e, cut) {
    if (isTypingTarget(document.activeElement) || dialogOpen()) return;
    const objs = copySelection(this.state);
    if (!objs.length) return;
    e.preventDefault();
    this.clipboard = objs;
    try { e.clipboardData.setData('text/plain', JSON.stringify({ format: CLIPBOARD_FORMAT, objects: objs }, null, 1)); } catch { /* internal clipboard only */ }
    if (cut) deleteSelection(this.state);
    this.state.notify(cut ? trn('app.clip.cut', objs.length) : trn('app.clip.copied', objs.length));
  }

  _onPaste(e) {
    if (isTypingTarget(document.activeElement) || dialogOpen()) return;
    let objs = null;
    try {
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text.trim().startsWith('{')) {
        const data = JSON.parse(text);
        if (data?.format === CLIPBOARD_FORMAT && Array.isArray(data.objects)) objs = data.objects;
        else if (data?.format === LEVEL_FORMAT) {
          e.preventDefault();
          // a whole level replaces the document: ask about unsaved changes first; the pasted
          // level is not saved anywhere, so it stays marked unsaved
          this._openParsed(() => parseLevel(data), { kind: 'new', name: '' }, tr('app.file.clipboard'), { confirm: true, unsaved: true });
          return;
        }
      }
    } catch { objs = null; }
    objs ??= this.clipboard;
    if (!objs?.length) return;
    e.preventDefault();
    this.paste(objs);
  }

  /** Paste objects at the pointer (when it is over a view) or offset from the originals. */
  paste(objs = this.clipboard) {
    if (!objs?.length) { this.state.notify(tr('app.clip.empty')); return; }
    const hv = this.state.hover;
    const added = pasteObjects(this.state, objs, hv ? { x: hv.x, z: hv.z } : null);
    this.state.notify(this._pastedMessage(added));
  }

  /**
   * "Pasted 3 objects", and the pasted objects the views hide (they are not selected).
   * @param {{ id: string }[]} added
   */
  _pastedMessage(added) {
    const left = hiddenOnly(this.state, added.map((o) => o.id));
    return `${trn('app.clip.pasted', added.length)}${left.length ? ` · ${leftOutMessage(this.state, left, 'notSelected')}` : ''}`;
  }

  // -------------------------------------------------------------------------------------------
  // Commands, menus, shortcuts
  // -------------------------------------------------------------------------------------------

  _buildCommands() {
    const st = this.state;
    const v = () => st.view;
    const hasSel = () => st.selection.length > 0;
    const hasObjSel = () => st.selectedObjects.length > 0;
    const toggleView = (k) => () => st.setView({ [k]: !(v()[k] !== false) });
    /** @type {Record<string, MenuCommand>} */
    const c = {
      'file.new': { label: tr('app.cmd.fileNew'), shortcut: 'Ctrl+N', aliases: ['Alt+N'], icon: ICONS.newFile, run: () => this.newLevel() },
      'file.open': { label: tr('app.cmd.fileOpen'), shortcut: 'Ctrl+O', icon: ICONS.open, run: () => this.openDialog() },
      'file.openFile': { label: tr('app.cmd.fileOpenFile'), icon: ICONS.file, run: () => this.openFromDisk() },
      'file.save': { label: tr('common.save'), shortcut: 'Ctrl+S', icon: ICONS.save, run: () => this.save() },
      'file.saveAs': { label: tr('app.cmd.fileSaveAs'), shortcut: 'Ctrl+Shift+S', icon: ICONS.saveAs, run: () => this.saveAs() },
      'file.export': { label: tr('app.cmd.fileExport'), shortcut: 'Ctrl+E', icon: ICONS.download, run: () => this.exportFile(), hint: tr('app.cmd.fileExportHint') },
      'file.playtest': { label: tr('app.cmd.playtest'), shortcut: 'F5', icon: ICONS.play, run: () => this.playtest() },

      'edit.undo': { label: () => (st.canUndo ? tr('app.cmd.undoWhat', { what: st.undoLabel }) : tr('app.cmd.undo')), keyLabel: tr('app.cmd.undo'), shortcut: 'Ctrl+Z', icon: ICONS.undo, enabled: () => st.canUndo, run: () => st.undo() },
      'edit.redo': { label: () => (st.canRedo ? tr('app.cmd.redoWhat', { what: st.redoLabel }) : tr('app.cmd.redo')), keyLabel: tr('app.cmd.redo'), shortcut: 'Ctrl+Y', icon: ICONS.redo, enabled: () => st.canRedo, run: () => st.redo() },
      'edit.redo2': { label: tr('app.cmd.redo'), shortcut: 'Ctrl+Shift+Z', run: () => st.redo(), enabled: () => st.canRedo },
      'edit.cut': { label: tr('app.cmd.cut'), keyLabel: tr('app.cmd.cutKey'), shortcut: 'Ctrl+X', icon: ICONS.cut, enabled: hasObjSel, run: () => { this.clipboard = copySelection(st); this._writeSystemClipboard(this.clipboard); deleteSelection(st); } },
      'edit.copy': { label: tr('app.cmd.copy'), keyLabel: tr('app.cmd.copyKey'), shortcut: 'Ctrl+C', icon: ICONS.copy, enabled: hasObjSel, run: () => { this.clipboard = copySelection(st); this._writeSystemClipboard(this.clipboard); st.notify(trn('app.clip.copied', this.clipboard.length)); } },
      'edit.paste': { label: tr('app.cmd.paste'), keyLabel: tr('app.cmd.pasteKey'), shortcut: 'Ctrl+V', icon: ICONS.paste, enabled: () => this.clipboard.length > 0, run: () => this.paste() },
      'edit.duplicate': { label: tr('app.cmd.duplicate'), shortcut: 'Ctrl+D', icon: ICONS.duplicate, enabled: hasObjSel, run: () => duplicateSelection(st) },
      'edit.delete': { label: tr('common.delete'), keyLabel: tr('app.cmd.deleteKey'), shortcut: 'Delete', aliases: ['Backspace'], icon: ICONS.trash, enabled: hasObjSel, run: () => deleteSelection(st) },
      'edit.rotateCcw': { label: tr('app.cmd.rotateCcw'), shortcut: 'Ctrl+R', icon: ICONS.rotateCcw, enabled: hasSel, run: () => rotateSelection(st, 90 * DEG) },
      'edit.rotateCw': { label: tr('app.cmd.rotateCw'), shortcut: 'Ctrl+Shift+R', icon: ICONS.rotate, enabled: hasSel, run: () => rotateSelection(st, -90 * DEG) },
      'edit.selectAll': { label: tr('app.cmd.selectAll'), shortcut: 'Ctrl+A', icon: ICONS.selectAll, run: () => this.selectAll() },
      'edit.deselect': { label: tr('app.cmd.deselect'), keyLabel: tr('app.cmd.deselectKey'), shortcut: 'Escape', enabled: hasSel, run: () => st.clearSelection() },
      'edit.findTextKey': {
        label: tr('app.cmd.findTextKey'), icon: ICONS.search, run: () => findTextKeyDialog(this),
        hint: tr('app.cmd.findTextKeyHint'),
      },

      'view.split': { label: tr('app.cmd.viewSplit'), keyLabel: tr('app.cmd.viewSplitKey'), shortcut: '1', icon: ICONS.layoutSplit, checked: () => v().layout === 'split', run: () => st.setView({ layout: 'split' }) },
      'view.3d': { label: tr('app.cmd.view3d'), keyLabel: tr('app.cmd.view3dKey'), shortcut: '2', icon: ICONS.layout3d, checked: () => v().layout === '3d', run: () => st.setView({ layout: '3d' }) },
      'view.2d': { label: tr('app.cmd.view2d'), keyLabel: tr('app.cmd.view2dKey'), shortcut: '3', icon: ICONS.layout2d, checked: () => v().layout === '2d', run: () => st.setView({ layout: '2d' }) },
      'view.frameSelection': { label: tr('app.cmd.frameSelection'), shortcut: 'F', icon: ICONS.focus, enabled: hasSel, run: () => this.focusIds(st.selection) },
      'view.frameLevel': { label: tr('app.cmd.frameLevel'), shortcut: 'Home', icon: ICONS.frame, run: () => { this.view2d?.frameLevel(); this.view3d?.frameLevel?.(); } },
      'view.grid': { label: tr('app.cmd.grid'), keyLabel: tr('app.cmd.gridKey'), shortcut: 'Ctrl+G', checked: () => v().grid !== false, run: toggleView('grid') },
      'view.textured2d': { label: tr('app.cmd.textured2d'), checked: () => v().textured2d !== false, run: toggleView('textured2d') },
      'view.objects': { label: tr('app.cmd.showObjects'), checked: () => v().showObjects !== false, run: toggleView('showObjects') },
      'view.markers': { label: tr('app.cmd.showMarkers'), checked: () => v().showMarkers !== false, run: toggleView('showMarkers') },
      'view.showAll': { label: tr('app.cmd.showAll'), enabled: () => (v().hiddenTypes?.length ?? 0) > 0, run: () => st.setView({ hiddenTypes: [] }) },
      'view.gameCamera': { label: tr('app.cmd.gameCamera'), checked: () => v().cameraMode === 'game', run: () => st.setView({ cameraMode: v().cameraMode === 'game' ? 'edit' : 'game' }) },
      'view.postfx': { label: tr('app.cmd.postfx'), checked: () => !!v().postfx, run: () => st.setView({ postfx: !v().postfx }) },
      'view.atmosphere': { label: tr('app.cmd.atmosphere'), checked: () => !!v().atmosphere, run: () => st.setView({ atmosphere: !v().atmosphere }) },
      'view.storyPreview': { label: tr('app.cmd.storyPreview'), icon: ICONS.eye, checked: () => !!v().storyPreview, run: () => storyPreviewDialog(this), hint: tr('app.cmd.storyPreviewHint') },
      'view.brushBigger': { label: tr('app.cmd.brushBigger'), shortcut: ']', run: () => this._brush(1) },
      'view.brushSmaller': { label: tr('app.cmd.brushSmaller'), shortcut: '[', run: () => this._brush(-1) },

      'level.settings': { label: tr('app.cmd.levelSettings'), icon: ICONS.settings, run: () => levelSettingsDialog(this) },
      'level.resize': { label: tr('app.cmd.resize'), icon: ICONS.resize, run: () => resizeDialog(this) },
      'level.validate': { label: tr('app.cmd.validate'), icon: ICONS.validate, run: () => this.validate() },
      'level.assignTextKeys': {
        label: tr('app.cmd.assignTextKeys'), icon: ICONS.tag, run: () => this.assignTextKeys(),
        hint: tr('app.cmd.assignTextKeysHint'),
      },
      'level.playtest': { label: tr('app.cmd.playtest'), shortcut: 'F5', icon: ICONS.play, run: () => this.playtest() },
      'level.openInGame': {
        label: tr('app.cmd.openInGame'), icon: ICONS.external, enabled: () => st.fileRef.kind === 'project',
        run: () => {
          const ref = st.fileRef;
          window.open(withLang(ref.campaign ? `game.html?campaign=${encodeURIComponent(ref.campaign)}&level=${encodeURIComponent(ref.name)}` : `game.html?level=${encodeURIComponent(ref.name)}`), '_blank');
        },
      },

      'lang.en': { label: langName('en'), checked: () => editorLang() === 'en', run: () => this.setLanguage('en') },
      'lang.zh': { label: langName('zh'), checked: () => editorLang() === 'zh', run: () => this.setLanguage('zh') },

      'help.shortcuts': { label: tr('app.cmd.shortcuts'), keyLabel: tr('app.cmd.shortcutsKey'), shortcut: '?', icon: ICONS.keyboard, run: () => shortcutsDialog(this._shortcutGroups()) },
      'help.game': { label: tr('app.cmd.demo'), icon: ICONS.external, run: () => window.open(withLang('game.html'), '_blank') },
      'help.launcher': { label: tr('app.cmd.launcher'), icon: ICONS.external, run: () => window.open('index.html', '_blank') },
      'help.about': { label: tr('app.cmd.about'), icon: ICONS.help, run: () => aboutDialog() },
    };
    // normalised combo → command id: each command's `shortcut` and `aliases` (Alt+N: Chrome
    // reserves Ctrl+N in normal tabs); '?' typed with Shift arrives as Shift+? (comboOf)
    this.shortcutIndex = new Map();
    for (const [id, cmd] of Object.entries(c)) for (const k of [cmd.shortcut, ...(cmd.aliases ?? [])]) if (k) this.shortcutIndex.set(normalizeCombo(k), id);
    this.shortcutIndex.set('Shift+?', 'help.shortcuts');
    return c;
  }

  _menus() {
    return [
      { id: 'file', label: tr('app.menu.file'), items: ['file.new', 'file.open', 'file.openFile', '-', 'file.save', 'file.saveAs', 'file.export', '-', 'file.playtest'] },
      { id: 'edit', label: tr('app.menu.edit'), items: ['edit.undo', 'edit.redo', '-', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate', 'edit.delete', '-', 'edit.rotateCcw', 'edit.rotateCw', '-', 'edit.selectAll', 'edit.deselect', '-', 'edit.findTextKey'] },
      { id: 'view', label: tr('app.menu.view'), items: [{ header: tr('app.menu.layout') }, 'view.split', 'view.3d', 'view.2d', '-', 'view.frameSelection', 'view.frameLevel', '-', { header: tr('app.menu.show') }, 'view.grid', 'view.textured2d', 'view.objects', 'view.markers', 'view.showAll', 'view.storyPreview', '-', { header: tr('app.menu.preview3d') }, 'view.gameCamera', 'view.postfx', 'view.atmosphere', '-', { header: tr('app.menu.language') }, ...EDITOR_LANGS.map((l) => `lang.${l}`)] },
      { id: 'level', label: tr('app.menu.level'), items: ['level.settings', 'level.resize', '-', 'level.validate', 'level.assignTextKeys', 'level.playtest', 'level.openInGame'] },
      { id: 'help', label: tr('app.menu.help'), items: ['help.shortcuts', 'help.game', 'help.launcher', '-', 'help.about'] },
    ];
  }

  /**
   * The keyboard-shortcut dialog: one group per menu (by command id prefix: `file.*` → File …)
   * with a row for every command that has a `shortcut` — generated from the registry, so a new
   * command shortcut is listed by itself — plus the hand-written keys the registry does not hold:
   * the tool keys (`TOOLS`), the tools' own keys and gestures and the view controls.
   * @returns {{ title: string, items: [string, string][] }[]}
   */
  _shortcutGroups() {
    const reg = this._commandShortcutGroups();
    const groups = [];
    /** Append the generated group of a menu (once; skipped when it lists nothing). */
    const take = (id) => {
      const g = reg.get(id);
      reg.delete(id);
      if (g?.items.length) groups.push(g);
    };
    take('file');
    groups.push({ title: tr('app.keys.tools'), items: TOOLS.map((t) => [t.shortcut, t.label]) });
    take('edit');
    const pan = tr('app.keys.pan');
    const zoomCursor = tr('app.keys.zoomCursor');
    const shiftClick = tr('app.keys.shiftClick');
    groups.push(
      { title: tr('app.keys.selection'), items: [['R / Shift+R', tr('app.keys.rotate15')], [tr('app.keys.arrows'), tr('app.keys.nudge')], ['Alt', tr('app.keys.noSnap')], [shiftClick, tr('app.keys.addSelection')], [tr('app.keys.ctrlClick'), tr('app.keys.toggleSelection')]] },
      { title: tr('app.keys.terrain'), items: [[tr('app.keys.altClick'), tr('app.keys.pickTile')], [shiftClick, tr('app.keys.straightLine')], ['Shift', tr('app.keys.invertHeight')]] },
    );
    take('view');
    groups.push(
      { title: tr('app.keys.map2d'), items: [[tr('app.keys.wheel'), zoomCursor], [tr('app.keys.rightMiddleDrag'), pan], [tr('app.keys.spaceDrag'), pan], [tr('app.keys.doubleClick'), tr('app.keys.focusObject')]] },
      { title: tr('app.keys.view3d'), items: [[tr('app.keys.rightDrag'), tr('app.keys.orbit')], [tr('app.keys.middleShiftRightDrag'), pan], [tr('app.keys.spaceDrag'), pan], [tr('app.keys.wheel'), zoomCursor], [tr('app.keys.fDoubleClick'), tr('app.keys.focus3d')], [tr('app.keys.rightWasd'), tr('app.keys.fly')], [tr('app.keys.rightQe'), tr('app.keys.turn')], ['Q / E', tr('app.keys.rotateGame')]] },
      { title: tr('app.keys.script'), items: [['Tab / Shift+Tab', tr('app.keys.indent')], ['Tab / Shift+Tab', tr('app.keys.nextField')], ['Enter', tr('app.keys.newLine')], ['Ctrl+Enter', tr('app.keys.scriptDone')], ['Escape', tr('app.keys.scriptRevert')]] },
    );
    for (const id of [...reg.keys()]) take(id);
    return groups;
  }

  /**
   * The command registry's shortcuts by menu: a group per command id prefix (titled like its
   * menu, in menu order, then any other prefix), a row `[keys, label]` per command with a
   * `shortcut` — keys `shortcut / alias / …`, label `keyLabel` or the menu label without its
   * "…". Commands of one group with the same label share a row (Redo: Ctrl+Y / Ctrl+Shift+Z); a
   * row already listed in an earlier group is not repeated (F5 Play-test: File, not Level).
   * @returns {Map<string, { title: string, items: [string, string][] }>}
   */
  _commandShortcutGroups() {
    const menus = this._menus();
    /** @type {Map<string, { title: string, items: [string, string][] }>} */
    const out = new Map(menus.map((m) => [m.id, { title: m.label, items: [] }]));
    /** @type {Map<string, [string, string]>} group + label → its row */
    const rows = new Map();
    const listed = new Set();
    // menu order first, then the commands no menu lists (edit.redo2, the brush keys …)
    const order = new Set([...menus.flatMap((m) => m.items.filter(isCommandId)), ...Object.keys(this.commands)]);
    for (const id of order) {
      const c = this.commands[id];
      if (!c?.shortcut) continue;
      const prefix = id.split('.')[0];
      if (!out.has(prefix)) out.set(prefix, { title: prefix[0].toUpperCase() + prefix.slice(1), items: [] });
      const label = (c.keyLabel ?? (typeof c.label === 'function' ? c.label() : c.label)).replace(/…$/, '');
      const keys = [c.shortcut, ...(c.aliases ?? [])];
      const same = rows.get(`${prefix}\u0000${label}`);
      if (same) {
        same[0] = [...new Set([...same[0].split(' / '), ...keys])].join(' / ');
        continue;
      }
      /** @type {[string, string]} */
      const row = [keys.join(' / '), label];
      if (listed.has(`${row[0]}\u0000${label}`)) continue;
      listed.add(`${row[0]}\u0000${label}`);
      rows.set(`${prefix}\u0000${label}`, row);
      out.get(prefix).items.push(row);
    }
    return out;
  }

  /** Does the command exist and is it enabled now (`run` would run it)? */
  canRun(id) {
    const c = this.commands[id];
    return !!c && (!c.enabled || !!c.enabled());
  }

  /** Run a command by id. */
  run(id) {
    const c = this.commands[id];
    if (!c) return;
    if (c.enabled && !c.enabled()) return;
    closeContextMenu();
    try {
      const r = c.run();
      if (r && typeof r.catch === 'function') r.catch((e) => this._error(e));
    } catch (e) { this._error(e); }
  }

  _error(e) {
    console.warn('[editor]', e);
    alertDialog({ title: tr('app.somethingWrong'), message: String(e?.message ?? e), icon: ICONS.warning });
  }

  _brush(d) {
    const st = this.state;
    const n = Math.max(1, Math.min(9, st.toolOptions.brushSize + d));
    st.setToolOption('brushSize', n);
    st.emit('preview');
    st.notify(tr('app.brushSize', { n }));
  }

  _writeSystemClipboard(objs) {
    try { navigator.clipboard?.writeText(JSON.stringify({ format: CLIPBOARD_FORMAT, objects: objs }, null, 1)).catch(() => {}); } catch { /* ignore */ }
  }

  selectAll() {
    const st = this.state;
    const all = st.level.objects.map((o) => o.id);
    // (only what the 2D map shows, as a box does: not the types hidden with the outliner's eyes,
    // not what View › Show objects / Show markers switched off hide, nor what the story preview hides)
    const left = hiddenOnly(st, all);
    st.select(shownOnly(st, all));
    st.notify(`${tr('app.selectedAll', { n: st.selection.length })}${left.length ? ` · ${leftOutMessage(st, left)}` : ''}`);
  }

  /**
   * After a change of what the views hide (a view change; an edit of a condition, undo / redo, a
   * paste, a save elsewhere): the selected objects the views no longer show — a type hidden with
   * the outliner's eye, *Show objects* / *Show markers* off, or what the story preview hides —
   * leave the selection (Delete, the arrow keys and the inspector would act on objects nobody
   * sees), and the status bar says why. A hidden object is never selected
   * (src/editor/visibility.js).
   */
  _dropHiddenFromSelection() {
    const st = this.state;
    if (!st.selection.length || !mayHide(st)) return;
    const msg = leftOutMessage(st, hiddenOnly(st, st.selection), 'leftSelection');
    if (!st.refreshSelection().length || !msg) return;
    // (a save under another name shows it with its own message: _fileRefChanged)
    if (this._holdDropMsg) this._heldDropMsg = msg;
    else st.notify(msg);
  }

  /**
   * `_dropHiddenFromSelection` once the running edit is done (a microtask: an inspector edit
   * commits its transaction first, so its panel is not rebuilt under the field being typed in).
   */
  _queueHiddenDrop() {
    if (this._dropQueued || !mayHide(this.state)) return;
    this._dropQueued = true;
    queueMicrotask(() => {
      this._dropQueued = false;
      this._dropHiddenFromSelection();
    });
  }

  /**
   * Show hidden objects again and select them (a double-click on a dimmed outliner row, or F on
   * it): the story preview goes off when it hides one, their types are shown again, *Show objects*
   * / *Show markers* on (`revealPatch`); the views then frame them.
   * @param {string[]} ids
   */
  reveal(ids) {
    const st = this.state;
    const patch = revealPatch(st, ids);
    if (patch) st.setView(patch);
    st.select(ids);
    const what = commaList([
      patch?.storyPreview === false ? tr('app.reveal.storyOff') : '', patch?.hiddenTypes ? tr('app.reveal.typeShown') : '',
      patch?.showObjects ? tr('app.reveal.objectsOn') : '', patch?.showMarkers ? tr('app.reveal.markersOn') : '',
    ].filter(Boolean));
    // (English capitalises the first part: the entry is a function)
    if (what) st.notify(tr('app.reveal.done', { what, who: ids.length === 1 ? ids[0] : tr('app.reveal.objects', { n: ids.length }) }));
    this.focusIds(st.selection);
  }

  /** Centre both views on the given ids (objects and/or 'spawn'). */
  focusIds(ids) {
    const b = boundsOfIds(this.state, ids);
    if (!b) return;
    // a boss group frames its arena too
    for (const id of ids) {
      const a = bossArena(this.state.getObject(id));
      if (a) { b.minX = Math.min(b.minX, a.minX); b.maxX = Math.max(b.maxX, a.maxX); b.minZ = Math.min(b.minZ, a.minZ); b.maxZ = Math.max(b.maxZ, a.maxZ); }
    }
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    if (this.view2d) {
      if (size > 6) this.view2d.frameRect({ minX: b.minX - 2, maxX: b.maxX + 2, minZ: b.minZ - 2, maxZ: b.maxZ + 2 });
      else this.view2d.focusOn(cx, cz, { scale: Math.max(this.view2d.scale, 36) });
    }
    try { this.view3d?.focusOn?.(cx, cz, { distance: Math.max(20, size * 2.6) }); } catch (e) { console.warn('[editor] 3D focus:', e); }
  }

  _contextMenu({ ev, clientX, clientY }) {
    const st = this.state;
    const id = ev.hitSpawn ? 'spawn' : ev.hitObjectId;
    const items = [];
    if (id) {
      if (!st.selection.includes(id)) st.select([id]);
      const o = id === 'spawn' ? null : st.getObject(id);
      items.push({ header: o ? `${OBJECT_TYPES[o.type].label} · ${o.name || o.id}` : tr('app.ctx.playerStart') });
      items.push({ label: tr('app.ctx.focus'), icon: ICONS.focus, shortcut: 'F', run: () => this.focusIds(st.selection) });
      if (o) {
        items.push({ label: tr('app.cmd.duplicate'), icon: ICONS.duplicate, shortcut: 'Ctrl+D', run: () => duplicateSelection(st) });
        items.push({ label: tr('app.cmd.copy'), icon: ICONS.copy, shortcut: 'Ctrl+C', run: () => this.run('edit.copy') });
        items.push({ label: tr('app.cmd.rotateCcw'), icon: ICONS.rotateCcw, shortcut: 'Ctrl+R', run: () => rotateSelection(st, 90 * DEG) });
        items.push({ label: tr('app.ctx.pickType'), icon: ICONS.eyedropper, run: () => { st.setToolOption('objectType', o.type); st.setTool('place'); } });
        items.push('-');
        items.push({ label: tr('common.delete'), icon: ICONS.trash, shortcut: 'Delete', danger: true, run: () => deleteSelection(st) });
      }
    } else {
      items.push({ header: tr('app.ctx.tile', { i: ev.i, j: ev.j }) });
      items.push({ label: tr('app.ctx.pasteHere'), icon: ICONS.paste, shortcut: 'Ctrl+V', disabled: !this.clipboard.length, run: () => { const added = pasteObjects(st, this.clipboard, { x: ev.x, z: ev.z }); st.notify(this._pastedMessage(added)); } });
      items.push({ label: tr('app.ctx.spawnHere'), icon: ICONS.spawn, disabled: !st.inBounds(ev.i, ev.j), run: () => st.setSpawn(ev.i + 0.5, ev.j + 0.5) });
      const def = ownValue(OBJECT_TYPES, st.toolOptions.objectType);
      items.push({
        label: tr('app.ctx.placeHere', { what: def?.label ?? tr('app.ctx.object') }), icon: ICONS.place, disabled: def?.placement !== 'point',
        // (an object the views hide — its type's eye, Show objects / markers off — is placed, not
        // selected, and the Place tool's message says why)
        run: () => {
          const obj = st.addObject(st.toolOptions.objectType, Math.round(ev.x * 2) / 2, Math.round(ev.z * 2) / 2);
          notifyPlaced(st, tr('app.ctx.placed', { what: def.label, id: obj.id }), obj.id);
        },
      });
      items.push('-');
      items.push({ label: tr('app.cmd.frameLevel'), icon: ICONS.frame, shortcut: 'Home', run: () => this.run('view.frameLevel') });
    }
    showContextMenu(clientX, clientY, items);
  }

  // -------------------------------------------------------------------------------------------
  // Files: new / open / save / export / play-test
  // -------------------------------------------------------------------------------------------

  /**
   * Ask what to do with unsaved changes. Resolves true when it is OK to continue (saved or
   * discarded), false to cancel.
   * @param {'continue'|'openRecovered'|'switchLanguage'|'newLevel'|'open'} [action] what the user
   *   is about to do (the question names it)
   */
  async confirmDiscard(action = 'continue') {
    if (!this.state.dirty) return true;
    const name = this.state.level.name || tr('common.untitled');
    const actions = {
      continue: () => tr('app.discard.action.continue'),
      openRecovered: () => tr('app.discard.action.openRecovered'),
      switchLanguage: () => tr('app.discard.action.switchLanguage'),
      newLevel: () => tr('app.discard.action.newLevel'),
      open: () => tr('app.discard.action.open'),
    };
    const r = await confirmDialog({
      title: tr('app.doc.unsaved'), icon: ICONS.warning, width: 470,
      message: tr('app.discard.message', { name, action: (actions[action] ?? actions.continue)() }),
      buttons: [
        { key: 'Don\'t save', label: tr('app.discard.dontSave'), value: 'discard', danger: true, left: true },
        { key: 'Cancel', label: tr('common.cancel'), value: null },
        { key: 'Save', label: tr('common.save'), value: 'save', primary: true },
      ],
    });
    // "Don't save": the autosave is dropped once another level actually replaced this one
    // (_replaceDoc) — if opening fails or is cancelled, the work is still here and autosaved
    if (r === 'discard') return true;
    if (r === 'save') return this.save();
    return false;
  }

  /**
   * Show the editor in another language: ask about unsaved changes, save the choice (the game's
   * too) and reload (src/editor/i18n.js `switchLanguage`).
   * @param {string} lang 'en' | 'zh'
   */
  async setLanguage(lang) {
    if (lang === editorLang()) return;
    if (!(await this.confirmDiscard('switchLanguage'))) return;
    this._leaving = true;
    switchLanguage(lang);
  }

  async newLevel() {
    if (!(await this.confirmDiscard('newLevel'))) return;
    const opts = await newLevelDialog(this);
    if (!opts) return;
    const room = opts.kind === 'room';
    this._replaceDoc(room ? createRoomLevel(opts) : createEmptyLevel(opts), { kind: 'new', name: '' });
    this.state.setTool('paint');
    const vars = { name: opts.name, width: opts.width, depth: opts.depth };
    this.state.notify(room ? tr('app.new.room', vars) : tr('app.new.level', vars));
  }

  async openDialog() {
    if (!(await this.confirmDiscard('open'))) return;
    const choice = await openLevelDialog(this);
    if (!choice) return;
    if (choice.kind === 'project') await this.openProject(choice.name, { confirm: false, campaign: choice.campaign ?? '' });
    else if (choice.kind === 'local') await this.openLocal(choice.name, { confirm: false });
    else if (choice.kind === 'recovered') await this.openRecovered(choice.name, { confirm: false });
    else await this.openFromDisk({ confirm: false });
  }

  // Every open reads and checks the level FIRST and only then asks about unsaved changes, so a
  // missing or broken file never costs the current work (`confirm: false` = already asked).

  /**
   * Open a project level: `public/levels/<name>.json`, or with `campaign` that campaign's
   * `levels/<name>.json`.
   * @param {string} name
   * @param {{ confirm?: boolean, campaign?: string }} [opts]
   */
  async openProject(name, { confirm = true, campaign = '' } = {}) {
    const ref = projectRef(name, campaign);
    return this._openParsed(() => loadProjectLevel(ref.name, { campaign: ref.campaign }), ref, projectFile(ref), { confirm });
  }

  openLocal(slot, { confirm = true } = {}) {
    return this._openParsed(() => {
      const r = loadLocalLevel(slot);
      if (!r) throw new Error(tr('app.open.noLocal', { slot }));
      return r;
    }, { kind: 'local', name: slot }, fileDisplay({ kind: 'local', name: slot }), { confirm });
  }

  async openFromDisk({ confirm = true } = {}) {
    let r;
    try { r = await openLevelFileDialog(); } catch (e) { alertDialog({ title: tr('app.open.failed'), message: String(e?.message ?? e), icon: ICONS.warning }); return false; }
    if (!r) return false;
    return this._openParsed(() => r, { kind: 'file', name: r.fileName ?? 'level.json' }, r.fileName ?? tr('app.file.someFile'), { confirm });
  }

  async openFile(file) {
    return this._openParsed(() => readLevelFile(file), { kind: 'file', name: file.name }, file.name, { confirm: true });
  }

  /**
   * Load a level (`loader` → { level, warnings }), then — when `confirm` — ask about unsaved
   * changes, then make it the document (`unsaved`: it is not saved anywhere, e.g. pasted). A
   * loading overlay covers the blocking rebuild of big levels.
   */
  async _openParsed(loader, fileRef, label, { confirm = false, unsaved = false } = {}) {
    let r;
    try {
      r = await loader();
    } catch (e) {
      alertDialog({ title: tr('app.open.failed'), message: tr('app.open.failedMessage', { label, message: e?.message ?? e }), icon: ICONS.warning });
      return false;
    }
    if (confirm && !(await this.confirmDiscard('open'))) return false;
    await this._withLoading(tr('app.open.opening', { name: r.level.name }), () => this._replaceDoc(r.level, fileRef, { unsaved }), r.level);
    // a file written by a newer engine (`parseLevel`'s `newer`): overwriting it (as version 1) asks first
    this._newerFile = r.newer === true ? { ...fileRef } : null;
    if (r.warnings?.length) {
      const uniq = [...new Set(r.warnings)];
      alertDialog({ title: tr('app.open.warnings'), message: tr('app.open.warningsMessage', { name: r.level.name }), lines: uniq.slice(0, 12).concat(uniq.length > 12 ? [tr('app.open.more', { n: uniq.length - 12 })] : []), icon: ICONS.warning });
    } else {
      this.state.notify(tr('app.open.done', { name: r.level.name, from: label }));
    }
    return true;
  }

  /** Save to the current destination (Save As when there is none). Resolves true when saved. */
  async save() {
    const ref = this.state.fileRef;
    if (ref.kind === 'project') {
      if (this.projectApi) return this._saveTo('project', ref.name, { campaign: ref.campaign });
      this.state.notify(tr('app.save.noProject'));
      return this.saveAs();
    }
    if (ref.kind === 'local') return this._saveTo('local', ref.name);
    if (ref.kind === 'file') return this._saveTo('download', ref.name.replace(/(\.level)?\.json$/i, ''));
    return this.saveAs();
  }

  async saveAs() {
    const r = await saveAsDialog(this, { askName: DEFAULT_NAMES.has(this.state.level.name.trim()) });
    if (!r) return false;
    // a level still called "Untitled": the Save As dialog asked for its display name too
    if (r.levelName && r.levelName !== this.state.level.name) this.state.setLevelProps({ name: r.levelName }, tr('app.undo.nameLevel'));
    const ref = this.state.fileRef;
    const campaign = r.dest === 'project' ? r.campaign ?? '' : '';
    const same = ref.kind === r.dest && ref.name === r.name && (ref.campaign ?? '') === campaign;
    if (!same) {
      let exists = false;
      try {
        if (r.dest === 'project') exists = (await listProjectLevels({ campaign })).some((l) => l.name === r.name);
        else if (r.dest === 'local') exists = listLocalLevels().some((l) => l.slot === r.name);
      } catch { exists = false; }
      if (exists) {
        const where = fileDisplay(r.dest === 'project' ? projectRef(r.name, campaign) : { kind: 'local', name: r.name });
        const ok = await confirmDialog({
          title: tr('app.save.replaceTitle'), message: tr('app.save.replaceMessage', { where }), danger: true,
          buttons: [{ key: 'Cancel', label: tr('common.cancel'), value: false }, { key: 'Replace', label: tr('app.save.replace'), value: true, danger: true }],
        });
        if (!ok) return false;
      }
    }
    return this._saveTo(r.dest, r.name, { campaign });
  }

  /**
   * @param {'project'|'local'|'download'} dest
   * @param {string} name
   * @param {{ campaign?: string }} [opts] campaign: a project save into that campaign's levels/
   */
  async _saveTo(dest, name, { campaign = '' } = {}) {
    const st = this.state;
    const nf = this._newerFile;
    if (nf && ((dest === 'project' && nf.kind === 'project') || (dest === 'local' && nf.kind === 'local')) && slugify(name) === slugify(nf.name)) {
      const ok = await confirmDialog({
        title: tr('app.save.newerTitle'), icon: ICONS.warning, danger: true, width: 480,
        message: tr('app.save.newerMessage'),
        buttons: [{ key: 'Cancel', label: tr('common.cancel'), value: false }, { key: 'Save as version 1', label: tr('app.save.asVersion1'), value: true, danger: true }],
      });
      if (!ok) return false;
      this._newerFile = null;
    }
    // the revision being saved: edits made while a project save is in flight keep the level dirty
    const rev = st.revision;
    const level = st.snapshot();
    const before = { ...st.fileRef };
    // (saved elsewhere: the story preview may hide other objects now — the message says so too)
    const saved = (msg) => { const left = this._fileRefChanged(before); st.notify(left ? `${msg} · ${left}` : msg); };
    try {
      if (dest === 'project') {
        const file = await saveProjectLevel(name, level, { campaign });
        st.markSaved(projectRef(name, campaign), rev);
        saved(st.dirty ? tr('app.save.projectNewer', { file }) : tr('app.save.project', { file }));
      } else if (dest === 'local') {
        const slot = saveLocalLevel(name, level);
        st.markSaved({ kind: 'local', name: slot }, rev);
        saved(tr('app.save.local', { slot }));
      } else {
        // a download cannot be confirmed (blocked, or cancelled in a "Save as" prompt of the
        // browser): the level counts as saved to that file, but a recovery copy stays in this
        // browser (File › Open › This browser › Recovered)
        const fileName = `${slugify(name)}.level.json`;
        downloadLevel(level, fileName);
        writeAutosave(level, { kind: 'file', name: fileName }, { exported: true });
        st.markSaved({ kind: 'file', name: fileName }, rev);
        saved(tr('app.save.download', { file: fileName }));
        this._autosavedAt = this._changeCount;
        this._updateDoc();
        return true;
      }
      if (!st.dirty) {
        clearAutosave();
        this._autosavedAt = this._changeCount;
      }
      this._updateDoc();
      return true;
    } catch (e) {
      alertDialog({ title: tr('app.save.failed'), message: String(e?.message ?? e), icon: ICONS.warning });
      return false;
    }
  }

  /** Download a copy without changing where the level is saved. */
  exportFile() {
    const level = this.state.snapshot();
    const fileName = `${slugify(level.name)}.level.json`;
    downloadLevel(level, fileName);
    this.state.notify(tr('app.export.done', { file: fileName }));
  }

  /**
   * After a save: when the level now lives elsewhere (Save As — another name, browser slot, file
   * or campaign), what the story preview and the condition hints read changed with it: the
   * preview's `level` value, the campaign whose story files and levels the checks read (read now).
   * Returns the message for the objects that left the selection ('' none; the caller shows it with
   * its own).
   * @param {FileRef} before the file reference before the save
   * @returns {string}
   */
  _fileRefChanged(before) {
    const now = this.state.fileRef;
    if (before.kind === now.kind && before.name === now.name && (before.campaign ?? '') === (now.campaign ?? '')) return '';
    // copy-on-write of text keys: the file saved away from keeps the keys; the one saved to holds
    // what the level holds now
    this.state.forgetCopiedTexts(fileLabel(now));
    this._copiedRead = this._rememberCopiedFrom(before);
    const campaign = this._campaign();
    if (campaign) campaignStoryContext(campaign, { refresh: true });
    this._heldDropMsg = '';
    this._holdDropMsg = true;
    try { this._storyInputsChanged(); } finally { this._holdDropMsg = false; }
    const msg = this._heldDropMsg;
    this._heldDropMsg = '';
    return msg;
  }

  /**
   * After a *Save As* to another file (docs/specs/I18N.md §4.2 "one key, one English"): the file the
   * level was saved away from (a project level or a browser slot) still holds the keys the level
   * had — its texts, read back from where it lives, count as another file's for copy-on-write
   * (`EditorState#addCopiedTexts`) until another level is loaded: an edit that changes the English
   * of a text gives it a new key and the old file keeps the shared one. A file that cannot be read
   * (or a document loaded meanwhile) adds nothing.
   * @param {FileRef} from
   * @returns {Promise<void>}
   */
  async _rememberCopiedFrom(from) {
    if (from.kind !== 'project' && from.kind !== 'local') return;
    const st = this.state;
    const loads = st.loads;
    let r = null;
    try {
      r = from.kind === 'project' ? await this._readProjectFile(from) : loadLocalLevel(from.name);
    } catch {
      r = null;
    }
    // (another document since, or saved back over that file meanwhile: nothing to remember)
    if (!r || st.loads !== loads || fileLabel(st.fileRef) === fileLabel(from)) return;
    this._copiedNames.set(fileLabel(from), fileDisplay(from));
    st.addCopiedTexts(fileLabel(from), textMapOf(levelTexts(r.level)));
  }

  /**
   * A project level as its file holds it now: through the dev server's level API when it runs (the
   * bytes on disk — a file written moments ago may not be served from public/ yet), else the
   * published file (`loadProjectLevel`).
   * @param {FileRef} ref a project ref
   * @returns {Promise<{ level: Level, warnings: string[] }>}
   */
  async _readProjectFile(ref) {
    if (this.projectApi) {
      const r = await fetch(`${levelsApi(ref.campaign)}/${encodeURIComponent(slugify(ref.name))}`, { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return parseLevel(await r.text());
    }
    return loadProjectLevel(ref.name, { campaign: ref.campaign });
  }

  /**
   * What the story preview and the condition hints read changed outside the level and the view
   * (the campaign's story context arrived; the file reference changed): while the preview is on
   * the views redraw — and the objects it hides now leave the selection, with the usual message —;
   * the inspector's condition hints are read again.
   */
  _storyInputsChanged() {
    const st = this.state;
    if (st.view.storyPreview) st.emit('view', { ...st.view });
    this.inspector?.refresh();
  }

  /** The campaign of the open level (a campaign's own project level), or ''. */
  _campaign() {
    const ref = this.state.fileRef;
    return ref.kind === 'project' ? ref.campaign ?? '' : '';
  }

  /**
   * Level › Assign text keys (docs/specs/I18N.md §4.10): every text without a key gets one, a key
   * on two texts a new one on the later text (on texts of two Englishes: on the one another file of
   * the campaign holds it with other English) — one undo step (`EditorState#assignTextKeys`). A
   * campaign's level shares keys as `npm run i18n:keys -- --assign` does: a chapter variant's text
   * takes its base level's key for the same English, a campaign copy of a shipped level (the same
   * file name) the shipped level's (`_assignSources`, read first). Resolves when it is done.
   * @returns {Promise<{ objects: number, root: boolean }>}
   */
  async assignTextKeys() {
    const st = this.state;
    const loads = st.loads;
    const sources = await this._assignSources();
    // (another level opened meanwhile: the sources were the other one's)
    const r = st.assignTextKeys(undefined, { sources: st.loads === loads ? sources : [] });
    const parts = [];
    if (r.objects) parts.push(trn('app.textKeys.objects', r.objects));
    if (r.root) parts.push(tr('app.textKeys.levelTexts'));
    st.notify(parts.length ? tr('app.textKeys.assigned', { what: andList(parts) }) : tr('app.textKeys.none'));
    return r;
  }

  /**
   * The levels *Assign text keys* shares keys with (the rule of `npm run i18n:keys -- --assign`):
   * a chapter variant's base level (from the campaign's story context, which read every level of
   * the campaign), or — a campaign's level that is no variant — the shipped level of the same file
   * name (public/levels/<name>.json, when there is one). Each as its keyed texts; none outside a
   * campaign, or when they cannot be read (within a few seconds).
   * @returns {Promise<{ key: string, text: string, where: string }[][]>}
   */
  async _assignSources() {
    const ref = this.state.fileRef;
    const campaign = this._campaign();
    if (!campaign) return [];
    const ctx = await Promise.race([campaignStoryContext(campaign), new Promise((r) => setTimeout(() => r(null), 4000))]);
    const base = ctx?.variants?.get(ref.name);
    if (base) {
      const texts = ctx.texts?.get(base);
      return texts ? [[...texts].map(([key, t]) => ({ key, text: t.text, where: t.where }))] : [];
    }
    try {
      const r = await this._readProjectFile({ kind: 'project', name: ref.name });
      return [levelTexts(r.level)];
    } catch {
      return [];
    }
  }

  /**
   * Where a text key is in the open level (Edit › *Find by text key…*; nothing is selected yet):
   * `input` is a GUID (any case; braces and hyphens are fine), a script line's `#line:<GUID>` or a
   * banner subtitle's `<GUID>.2`. Found: the first object text that holds it (`id`, `row`) — or the
   * level's own text (`root`: `subtitle`, `title.*`) — and how many other texts hold it too
   * (`more`: a key on two texts, which *Check for problems* reports). Not found: `message` says why,
   * and which other file of the campaign (or the file a *Save As* copied the level from) holds it.
   * @param {string} input
   * @returns {{ found: boolean, key: string, message: string, id?: string, row?: TextRow, root?: string, more: number }}
   */
  locateTextKey(input) {
    const st = this.state;
    const key = parseKeyInput(input);
    const typed = typeof input === 'string' ? input.trim() : '';
    if (!key) {
      return { found: false, key: '', more: 0, message: typed ? tr('app.findKey.notKey', { typed: typed.length > 48 ? `${typed.slice(0, 47)}…` : typed }) : tr('app.findKey.empty') };
    }
    const { objects, root } = findTextKey(st.level, key);
    const more = objects.length + root.length - 1;
    if (objects.length) return { found: true, key, id: objects[0].id, row: objects[0].row, more, message: '' };
    if (root.length) return { found: true, key, root: root[0].field, more, message: '' };
    const other = st.sharedTexts(key);
    const where = other?.length ? tr('app.findKey.others', {
      list: other.slice(0, 2).map((t) => tr('app.findKey.hasIt', { file: this._copiedNames.get(t.file) ?? t.file, where: t.where })).join(tr('app.findKey.listSep')),
      more: other.length > 2 ? tr('app.findKey.more', { n: other.length - 2 }) : '',
    }) : '';
    return { found: false, key, more: 0, message: tr('app.findKey.notFound', { key, where }) };
  }

  /**
   * Show the text a key was found on (`locateTextKey`): an object's text — the object shown (hidden
   * types, the story preview: `reveal`) and selected, the views framed on it, and in the inspector
   * its field scrolled to with the line or page selected and the key line marked —, or the level's
   * own text (the selection cleared: the inspector shows the level). The status bar says where.
   * @param {ReturnType<EditorApp['locateTextKey']>} hit
   */
  showTextKey(hit) {
    const st = this.state;
    if (!hit.found) { st.notify(hit.message); return; }
    const also = hit.more > 0 ? trn('app.findKey.also', hit.more) : '';
    if (hit.root) {
      st.clearSelection();
      st.notify(hit.root === 'subtitle' ? tr('app.findKey.rootSubtitle', { key: hit.key, also }) : tr('app.findKey.rootTitle', { key: hit.key, field: hit.root, also }));
      return;
    }
    const row = /** @type {TextRow} */ (hit.row);
    this.reveal([/** @type {string} */ (hit.id)]);
    const shown = this.inspector?.showTextKey(row);
    const place = row.line != null ? tr('app.findKey.line', { n: row.line })
      : row.page != null ? `${tr('app.findKey.page', { n: row.page + 1 })}${row.choice != null ? tr('app.findKey.choice', { n: row.choice + 1 }) : ''}` : '';
    st.notify(tr('app.findKey.object', { key: hit.key, id: hit.id, field: row.field, place, selected: shown ? '' : tr('app.findKey.selected'), also }));
  }

  /**
   * Find a text key in the open level and show its text (`locateTextKey` + `showTextKey`; scripted
   * checks call it, the menu asks first: `findTextKeyDialog`).
   * @param {string} input
   */
  findTextKey(input) {
    const hit = this.locateTextKey(input);
    this.showTextKey(hit);
    return hit;
  }

  /** Level › Check for problems (a campaign's level: its story and level files are read again first). */
  async validate() {
    const campaign = this._campaign();
    // (at most a few seconds: the checks run without the story files when they do not come)
    if (campaign) await Promise.race([campaignStoryContext(campaign, { refresh: true }), new Promise((r) => setTimeout(r, 4000))]);
    const errors = validateLevelIssues(this.state.level).map((issue) => friendlyProblem(issue));
    const warnings = this._softWarnings();
    if (!errors.length && !warnings.length) { alertDialog({ title: tr('app.check.none'), message: tr('app.check.ready'), icon: ICONS.check }); return; }
    alertDialog({ title: errors.length ? tr('app.check.problems') : tr('app.check.title'), message: errors.length ? tr('app.check.mustFix') : tr('app.check.consider'), lines: [...errors, ...warnings], icon: errors.length ? ICONS.warning : ICONS.info });
  }

  _softWarnings() {
    const L = this.state.level;
    const out = [];
    // (any number of lights is fine: the game shares its 12 point lights among the lanterns
    // around the player — see LightPool)
    for (const o of L.objects) if (o.type === 'bridge') out.push(...bridgeStepIssues(L, o));
    const outside = L.objects.filter((o) => {
      const p = OBJECT_TYPES[o.type].placement === 'point' ? o : null;
      return p && (p.x < 0 || p.z < 0 || p.x > L.width || p.z > L.depth);
    }).length;
    if (outside) out.push(trn('app.check.outside', outside));
    // (a room — a storeroom, a cellar — is often empty: no nudge there)
    if (!isRoom(L.environment) && !L.objects.some((o) => o.type === 'npc')) out.push(tr('app.check.noVillagers'));
    const silent = L.objects.filter((o) => o.type === 'house' && !(Array.isArray(o.text) && o.text.some((t) => String(t).trim()))).length;
    if (silent) out.push(trn('app.check.silentHouses', silent));
    const edges = walkableEdges(L);
    if (edges.length) {
      const list = edges.join(tr('app.check.edgeSep'));
      out.push(isRoom(L.environment) ? tr('app.check.edgeRoom', { edges: list }) : tr('app.check.edgeLevel', { edges: list }));
    }
    out.push(...combatIssues(L, (flier) => this.view3d?.enemyStartTest?.(flier) ?? null));
    // campaign exits and entrances (docs/specs/CAMPAIGN_FORMAT.md)
    out.push(...travelIssues(L));
    // the story: scripts and conditions that do not parse, events missing what their trigger
    // needs, names nothing declares (against the campaign's story files once they are read, and
    // `done:` keys against every level's events and `once` keys, as the campaign check reads them)
    const issues = storyIssues(L, storyCheckContext(this.state));
    for (const i of [...issues.filter((x) => x.severity === 'error'), ...issues.filter((x) => x.severity !== 'error')]) {
      const text = formatStoryIssue(i, L);
      out.push(i.severity === 'error' ? tr('app.check.storyError', { text }) : tr('app.check.story', { text }));
    }
    // the content-text keys (docs/specs/I18N.md §4.10): texts without one, keys on no text, a key
    // on two texts (of two Englishes: `npm run i18n:keys -- --fix` on the file or campaign)
    const ref = this.state.fileRef;
    const file = ref.kind !== 'project' || !ref.name ? '' : ref.campaign ? `public/campaigns/${slugify(ref.campaign)}` : `public/levels/${slugify(ref.name)}.json`;
    out.push(...textKeyWarnings(L, { file }));
    return out;
  }

  /** Validate, save to the play-test slot and open the game in a new tab. */
  playtest() {
    const st = this.state;
    const level = st.snapshot();
    const issues = validateLevelIssues(level);
    if (issues.length) {
      const spawnIssue = issues.some((e) => e.code.startsWith('spawn.'));
      const errors = issues.map((issue) => friendlyProblem(issue));
      problemsDialog(tr('app.play.cannot'), errors, {
        fixSpawn: spawnIssue ? () => { st.select(['spawn']); st.setTool('spawn'); this.focusIds(['spawn']); } : null,
      });
      return false;
    }
    try {
      saveLocalLevel(PLAYTEST_SLOT, level);
    } catch (e) {
      alertDialog({ title: tr('app.play.failed'), message: tr('app.play.storage', { message: e?.message ?? e }), icon: ICONS.warning });
      return false;
    }
    // a campaign's level plays inside its campaign: its exits lead to the campaign's other levels;
    // another level with the table of the file its keys come from (`origin`: the file it was opened
    // from — a copy saved under another name has no table of its own)
    const ref = st.fileRef;
    const url = ref.kind === 'project' && ref.campaign
      ? `game.html?campaign=${encodeURIComponent(ref.campaign)}&level=local:${PLAYTEST_SLOT}&as=${encodeURIComponent(ref.name)}&autostart=1`
      : `game.html?level=local:${PLAYTEST_SLOT}&autostart=1${st.origin ? `&i18n=${st.origin.split('/').map(encodeURIComponent).join('/')}` : ''}`;
    // the game plays in the editor's language (a `?lang=` on the editor is not saved, so pass it)
    const w = window.open(withLang(url), 'luminati-playtest');
    if (!w) st.notify(tr('app.play.popupBlocked'));
    else st.notify(tr('app.play.started', { name: level.name }));
    return true;
  }

  // -------------------------------------------------------------------------------------------
  // Preferences
  // -------------------------------------------------------------------------------------------

  _loadPrefs() {
    this.prefs = {};
    try { this.prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') ?? {}; } catch { this.prefs = {}; }
    const v = this.prefs.view ?? {};
    const keep = {};
    for (const k of ['layout', 'grid', 'split', 'textured2d', 'showObjects', 'showMarkers', 'cameraMode', 'postfx', 'atmosphere', 'storyValues']) if (k in v) keep[k] = v[k];
    if (keep.layout && !['split', '3d', '2d'].includes(keep.layout)) delete keep.layout;
    // (the story preview's values are kept; the preview itself starts off in every session)
    if (typeof keep.storyValues !== 'string') delete keep.storyValues;
    Object.assign(this.state.view, keep);
  }

  _savePrefs() {
    const v = this.state.view;
    this.prefs.view = { layout: v.layout, grid: v.grid, split: v.split, textured2d: v.textured2d, showObjects: v.showObjects, showMarkers: v.showMarkers, cameraMode: v.cameraMode, postfx: v.postfx, atmosphere: v.atmosphere, storyValues: v.storyValues };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* ignore */ }
  }

  dispose() {
    clearInterval(this._autosaveTimer);
    this._offStoryContext?.();
    this.view2d?.dispose();
    try { this.view3d?.dispose?.(); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------------------------
// Level checks
// ---------------------------------------------------------------------------------------------

/** Runs of walkable tiles on the map border, described per edge (e.g. "north edge x 29–32"). */
/**
 * Bridge ends the player cannot step on or off: the first deck segment (arched as PropFactory
 * builds it) more than a step (0.55) above or below the flat bank half a tile past that end — a
 * bank one level below the deck plus the arch is just too high (0.5 + arch · sin(π / 2n)).
 * Banks on stairs, water or blocked tiles are skipped (a pier's water end is fine).
 * @param {Level} L
 * @param {LevelObjectOf<'bridge'>} o
 * @returns {string[]}
 */
function bridgeStepIssues(L, o) {
  const dx = o.x1 - o.x0;
  const dz = o.z1 - o.z0;
  const len = Math.hypot(dx, dz);
  if (!(len > 0.5)) return [];
  const ux = dx / len;
  const uz = dz / len;
  const bank = (x, z) => {
    const i = Math.floor(x);
    const j = Math.floor(z);
    const d = tileDef(L, i, j);
    if (!d || d.void || d.water || d.stairs || d.walkable === false) return null;
    return { y: getHeightLevel(L, i, j) * 0.5, x, z };
  };
  /** @type {['start'|'end', { y: number, x: number, z: number }|null][]} */
  const ends = [['start', bank(o.x0 - ux * 0.5, o.z0 - uz * 0.5)], ['end', bank(o.x1 + ux * 0.5, o.z1 + uz * 0.5)]];
  const deck = Number.isFinite(o.deckY) ? o.deckY : (ends[0][1] ?? ends[1][1])?.y;
  if (deck == null) return [];
  const arch = Number.isFinite(o.opts?.arch) ? o.opts.arch : Math.min(0.4, len * 0.05);
  const n = arch > 0.02 ? Math.max(2, Math.round(len / 0.5)) : 1;
  const first = deck + arch * Math.sin(Math.PI / (2 * n));
  const out = [];
  for (const [which, b] of ends) {
    if (!b) continue;
    const step = first - b.y;
    if (Math.abs(step) <= 0.55) continue;
    const vars = {
      id: o.id, end: which === 'start' ? tr('app.check.bridge.start') : tr('app.check.bridge.end'),
      d: Math.abs(step).toFixed(2), x: b.x.toFixed(1), z: b.z.toFixed(1),
    };
    out.push(step > 0 ? tr('app.check.bridge.above', vars) : tr('app.check.bridge.below', vars));
  }
  return out;
}

/** Up to 4 ids, then "+n more". */
function idList(ids) {
  return ids.length > 4 ? tr('app.check.idsMore', { ids: commaList(ids.slice(0, 4)), n: ids.length - 4 }) : commaList(ids);
}

/**
 * Soft warnings of a combat level (COMBAT.md §17): no waystone; enemy start spots off walkable
 * ground; enemies (not dummies) starting within 12 u of the player start; a boss without arena /
 * gate; a boss asking for more than one member (Count above 1: it spawns alone); a boss gate off
 * its arena's edge; more than one boss; an arena / gate on a group that is not the boss (the game
 * ignores it); a non-boss home disc (radius + 2) within 6 u of a boss arena; combat switched off
 * with enemies placed.
 * @param {Level} L level
 * @param {(flier: boolean) => (((x: number, z: number) => boolean)|null)} [exactTest] the 3D
 *   view's start test (every prop and villager collider, in every layout); without a 3D view
 *   the level-data test
 * @returns {string[]}
 */
function combatIssues(L, exactTest = null) {
  const out = [];
  const enemies = L.objects.filter((o) => o.type === 'enemy');
  const combat = levelHasCombat(L);
  if (L.environment?.combat === false && enemies.length) {
    out.push(trn('app.check.combatOff', enemies.length));
  }
  if (combat && !L.objects.some((o) => o.type === 'waystone')) out.push(tr('app.check.noWaystone'));
  if (!enemies.length) return out;
  const cols = dataColliders(L);
  const tests = new Map();
  /** The game's start rule (standable ground, fliers also water; clear of colliders). */
  const testFor = (flier) => {
    if (!tests.has(flier)) tests.set(flier, exactTest?.(flier) ?? levelStartTest(L, flier, cols));
    return tests.get(flier);
  };
  const offGround = [];
  const nearSpawn = [];
  const bosses = [];
  const stray = [];
  for (const o of enemies) {
    const info = ENEMY_INFO[enemyKind(o)];
    const ok = testFor(!!info.flier);
    const spots = enemyStartPoints(o, ok);
    if (spots.some(([x, z]) => !ok(x, z))) offGround.push(o.id);
    if (!info.passive && spots.some(([x, z]) => Math.hypot(x - L.spawn.x, z - L.spawn.z) < 12)) nearSpawn.push(o.id);
    if (info.boss) bosses.push(o);
    else if (strayArena(o)) stray.push(o.id);
  }
  if (offGround.length) out.push(tr('app.check.offGround', { ids: idList(offGround) }));
  if (nearSpawn.length) out.push(tr('app.check.nearSpawn', { ids: idList(nearSpawn) }));
  const arenas = [];
  for (const b of bosses) {
    const a = bossArena(b);
    const g = Array.isArray(b.gate) && b.gate.length >= 4 && b.gate.slice(0, 4).every(Number.isFinite);
    if (!a || !g) {
      const what = !a && !g ? tr('app.check.boss.arenaGate') : !a ? tr('app.check.boss.arena') : tr('app.check.boss.gate');
      out.push(tr('app.check.boss.missing', { id: b.id, what }));
    }
    const extra = bossExtraCount(b);
    if (extra) {
      const asked = b.count != null && b.count !== '' ? tr('app.check.boss.count', { count: b.count }) : tr('app.check.boss.offsets', { n: extra + 1 });
      out.push(tr('app.check.boss.extra', { id: b.id, asked, extra }));
    }
    const gap = gateEdgeGap(b);
    if (gap != null && gap > GATE_EDGE_TOLERANCE) out.push(tr('app.check.boss.gateOff', { id: b.id, gap: gap.toFixed(1) }));
    if (a) arenas.push(a);
  }
  if (bosses.length > 1) out.push(tr('app.check.boss.many', { n: bosses.length, ids: idList(bosses.map((b) => b.id)) }));
  if (stray.length) out.push(trn('app.check.boss.stray', stray.length, { ids: idList(stray) }));
  const crowding = [];
  for (const o of enemies) {
    if (ownValue(ENEMY_INFO, o.kind)?.boss) continue;
    const r = (Number(o.radius) || 3) + 2;
    for (const a of arenas) {
      const dx = Math.max(a.minX - o.x, 0, o.x - a.maxX);
      const dz = Math.max(a.minZ - o.z, 0, o.z - a.maxZ);
      if (Math.hypot(dx, dz) - r < 6) { crowding.push(o.id); break; }
    }
  }
  if (crowding.length) out.push(tr('app.check.boss.crowding', { ids: idList(crowding) }));
  return out;
}

function walkableEdges(L) {
  // (a campaign exit over the edge is the way out: its tiles are meant to reach the edge)
  const exits = levelExits(L);
  const walk = (i, j) => {
    const d = L.legend[L.tiles[j]?.[i]];
    return !!d && !d.void && !d.water && d.walkable !== false && !exits.some((o) => inExit(o, i + 0.5, j + 0.5));
  };
  const out = [];
  const runs = (n, test) => {
    const r = [];
    let a = -1;
    for (let k = 0; k <= n; k++) {
      const on = k < n && test(k);
      if (on && a < 0) a = k;
      if (!on && a >= 0) { r.push(a === k - 1 ? `${a}` : `${a}–${k - 1}`); a = -1; }
    }
    return r;
  };
  const add = (side, axis, r) => { if (r.length) out.push(tr('app.check.edge', { side, axis, runs: `${r.slice(0, 3).join(', ')}${r.length > 3 ? '…' : ''}` })); };
  add(tr('app.check.side.north'), 'x', runs(L.width, (i) => walk(i, 0)));
  add(tr('app.check.side.south'), 'x', runs(L.width, (i) => walk(i, L.depth - 1)));
  add(tr('app.check.side.west'), 'z', runs(L.depth, (j) => walk(0, j)));
  add(tr('app.check.side.east'), 'z', runs(L.depth, (j) => walk(L.width - 1, j)));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Shortcut helpers
// ---------------------------------------------------------------------------------------------

/** "Ctrl+Shift+S" style combo of a KeyboardEvent (Cmd counts as Ctrl). */
function comboOf(e) {
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  if (key === 'Del') key = 'Delete';
  if (key === 'Esc') key = 'Escape';
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  // Shift is implied for symbols like '?' — keep it only for letters / named keys
  if (e.shiftKey && (key.length > 1 || /[A-Z]/.test(key))) parts.push('Shift');
  else if (e.shiftKey && key === '?') parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

/**
 * A menu item that is a command id (not a separator or a section header).
 * @param {string|{ header: string }} x
 * @returns {x is string}
 */
function isCommandId(x) {
  return typeof x === 'string' && x !== '-';
}

function normalizeCombo(s) {
  const parts = s.split('+');
  const key = parts.pop();
  const mods = ['Ctrl', 'Alt', 'Shift'].filter((m) => parts.includes(m));
  return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+');
}

