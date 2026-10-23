import { EventEmitter } from '../engine/core/EventEmitter.js';
import {
  createEmptyLevel, cloneLevel, setTile as setTileRaw, setHeightLevel, getTile, getHeightLevel,
  addObject as addObjectRaw, inBounds,
} from '../engine/level/LevelFormat.js';
import { OBJECT_TYPES, normalizeObject } from '../engine/level/ObjectCatalog.js';
import { ownValue } from '../engine/utils/own.js';
import { randomGuid } from '../engine/i18n/ContentKeys.js';
import { seededMint, levelKeys } from '../engine/i18n/TextKeys.js';
import {
  keyedState, carryEdit, fillObjectKeys, rootState, carryRootEdit, mergeRootKeys, fillRootKeys, keySet, minter, textFieldsOf,
  preferSharedCopies, shareKeys,
} from './textKeys.js';
import { tr } from './i18n.js';

/**
 * @import { Level } from '../engine/level/types.js'
 * @import { Mint } from '../engine/i18n/TextKeys.js'
 * @import { DroppedTexts, RootDropped, SplitKeys, SharedTexts, OtherText } from './textKeys.js'
 */

/**
 * Where a document came from / was last saved: `new` (never saved; name ''), `local` (browser slot
 * `name`), `project` (public/levels/`name`.json) or `file` (a file on disk; `name` its file name).
 * @typedef {{ kind: 'new'|'local'|'project'|'file', name: string, campaign?: string }} FileRef
 *   campaign: a project level of a campaign's own `levels/` folder (docs/specs/CAMPAIGN_FORMAT.md)
 */

/**
 * EditorState — the single source of truth of the level editor: the level being edited, the
 * selection, the active tool and its options, view options, and undo / redo.
 *
 * Every mutation goes through a transaction. Edits made outside `begin()/commit()` are wrapped in
 * their own one-step transaction automatically, so every edit is undoable. Views never mutate
 * `state.level` directly; they call the methods below (or tools do, on their behalf).
 *
 * Events (EventEmitter):
 *   'change'    (info)  after every edit, undo, redo or load. info = {
 *                          source: 'edit'|'undo'|'redo'|'load',
 *                          terrain: boolean,              tiles/heights/legend/waterLevel changed
 *                          rect: {minI,maxI,minJ,maxJ}|null   changed tile rect (null = unknown/all)
 *                          objects: boolean,              objects or spawn changed (views diff by id)
 *                          ids: string[]|null,            ids of the objects that changed (added, edited,
 *                                                         moved, removed; 'spawn' = player start) —
 *                                                         null = unknown (diff everything)
 *                          meta: boolean }                name / environment / water / size
 *   'selection' (ids: string[])
 *   'selectionFiltered' (ids: string[])  after undo / redo / cancel: the ids of the restored
 *                          selection that `selectionFilter` left out (objects the views hide now)
 *   'tool'      (toolId)
 *   'toolOptions' (options)
 *   'view'      (view)
 *   'hover'     (hover|null)       pointer position over a view: { i, j, x, z, view }
 *   'dirty'     (dirty: boolean)
 *   'history'   ({ canUndo, canRedo })
 *   'status'    (message: string, opts?: { stale?: () => boolean })  transient status-bar
 *                          messages (see `notify`)
 */
export class EditorState extends EventEmitter {
  constructor(level = createEmptyLevel({ name: 'Untitled' })) {
    super();
    /** The level being edited (treat as read-only outside this class). */
    this.level = level;
    /** @type {FileRef} where the level came from / was last saved */
    this.fileRef = { kind: 'new', name: '' };
    this.dirty = false;
    /** Selected object ids ('spawn' selects the player start marker). */
    this.selection = [];
    /**
     * Narrows every selection to what may be selected (null: anything). The app sets it to the
     * objects the views show (src/editor/visibility.js `shownOnly`, KNOWN_ISSUES STORY-06):
     * `select`, undo / redo and `cancel` apply it, so a hidden object is never selected.
     * @type {((ids: string[]) => string[])|null}
     */
    this.selectionFilter = null;
    this.toolId = 'select';
    /** The tool that was active before the current one (e.g. the eyedropper returns to it). */
    this.prevToolId = 'select';
    /** Options shared by tools and palettes (tools may add their own keys). */
    this.toolOptions = {
      tile: 'g',            // tile char for paint / fill / rect
      brushSize: 1,         // 1..9 tiles
      brushShape: 'square', // 'square' | 'circle'
      heightMode: 'raise',  // 'raise' | 'lower' | 'set' | 'flatten' | 'smooth'
      heightValue: 2,       // target level for 'set'
      objectType: 'house',  // catalog type for the place tool
      snap: true,           // snap placed / moved objects (to the type's snap step or 0.5)
      paintHeight: false,   // paint tool also sets the height to heightValue
    };
    /** View options shared by the 2D and 3D views. */
    this.view = {
      layout: 'split',      // 'split' | '3d' | '2d'
      grid: true,
      showObjects: true,
      showMarkers: true,    // emitters, regions, spawn, critter areas
      cameraMode: 'edit',   // 3D: 'edit' (free orbit) | 'game' (diorama gameplay camera)
      postfx: false,        // 3D: diorama post effects in the preview
      timeOfDay: 14,        // 3D preview lighting (hour)
      timeFollow: true,     // the preview hour follows the level's start time (environment.timeOfDay)
      atmosphere: false,    // 3D: particles / god rays in the preview
      hiddenTypes: [],      // object types hidden in the views (outliner eye toggles)
      textured2d: true,     // 2D map: draw real tile textures (false = flat tile colours)
      split: 0.6,           // split layout: fraction of the width given to the 3D view
      storyPreview: false,  // the story preview: objects whose when / unless do not hold are hidden
      storyValues: '',      // …for these story values, one per line (src/editor/story.js)
    };
    /** Pointer position over a view, or null. */
    this.hover = null;

    this._undo = [];
    this._redo = [];
    this._tx = null;
    this.maxHistory = 200;
    /** Revision ids: every committed step gets one; the document's revision is the top undo step's. */
    this._seq = 0;
    /** Revision of the state below the oldest undo step (a load, or a step dropped from history). */
    this._baseRev = 0;
    /** Revision that was last saved (-1: none — e.g. a restored or pasted level). */
    this._savedRev = 0;
    /** Bumped whenever the level's objects may have changed (see `objectsVersion`). */
    this._objectsVersion = 0;
    /**
     * Makes the keys of new texts (docs/specs/I18N.md §4.10): a random GUID, or after
     * `seedTextKeys(prefix)` the seeded keys of `seededMint` (scripted checks).
     * @type {Mint}
     */
    this._mintKey = () => randomGuid();
    /**
     * Texts an edit cleared, with their keys (src/editor/textKeys.js `carryEdit`): typed again, a
     * field gets its keys back. Forgotten when another level is loaded.
     * @type {DroppedTexts}
     */
    this._droppedTexts = new Map();
    /**
     * The level's own texts an edit cleared, with their keys (`carryRootEdit`): typed again, a text
     * gets its key back. Forgotten when another level is loaded.
     * @type {RootDropped}
     */
    this._droppedRoot = new Map();
    /**
     * The copy-on-write splits of this document (new key → the shared key its text gave up; see
     * `carryEdit`): a text typed back to the other file's English takes the shared key back.
     * Forgotten when another level is loaded.
     * @type {SplitKeys}
     */
    this._splitKeys = new Map();
    /**
     * The keys the document had when it was loaded (`replaceLevel`): an unchanged text keeps one of
     * these rather than a key minted since, when equal old texts compete for it (`carryEdit`).
     * @type {Set<string>}
     */
    this._loadedKeys = new Set();
    /**
     * The content table that translates the document's keys (docs/specs/I18N.md §4.2: a copy keeps
     * the keys of the file it came from): that of the project file it was opened from
     * (`levels/<name>`, or `campaigns/<campaign>` for a campaign's level) — opened from elsewhere (a
     * browser slot, a file on disk, a new level), that of the first project file it is saved to; a
     * *Save As* keeps it. '' none. The play-test passes it (`&i18n=<origin>`), so a level saved
     * under another name plays translated.
     */
    this.origin = '';
    /**
     * The texts the open level's campaign's other files hold, by key (set by the app:
     * src/editor/story.js `otherFileTexts`; null / returning null: none known): copy-on-write
     * reads them (`sharedTexts`).
     * @type {(() => ReadonlyMap<string, readonly OtherText[]>|null)|null}
     */
    this.otherTexts = null;
    /**
     * The texts of the files this document was saved away from (*Save As* to another file), by key
     * — those files keep the keys it had: copy-on-write reads them too. Forgotten when another level
     * is loaded.
     * @type {Map<string, OtherText[]>}
     */
    this._copiedTexts = new Map();
    /** How many documents were loaded (`replaceLevel`): an async read for the document before compares it. */
    this.loads = 0;
  }

  /**
   * The texts other files hold under `key` (the campaign's other level, story and campaign files;
   * the files a *Save As* copied this level from), undefined when none does: an edit that changes
   * the English of a text keeping such a key gives the text a new key instead (copy-on-write,
   * docs/specs/I18N.md §4.2 "one key, one English"; src/editor/textKeys.js `carryEdit`).
   * @param {string} key
   * @returns {readonly OtherText[]|undefined}
   */
  sharedTexts(key) {
    const a = this.otherTexts?.()?.get(key);
    const b = this._copiedTexts.get(key);
    return a && b ? [...a, ...b] : a ?? b;
  }

  /**
   * Remember the texts of a file this document was copied from (`file`: its name; `texts`: its
   * `textMapOf`) — after a *Save As* to another file, that file still holds the keys.
   * @param {string} file
   * @param {Map<string, { text: string, where: string }>} texts
   */
  addCopiedTexts(file, texts) {
    for (const [key, t] of texts) {
      const l = this._copiedTexts.get(key) ?? [];
      if (!l.some((e) => e.file === file)) l.push({ file, text: t.text, where: t.where });
      this._copiedTexts.set(key, l);
    }
  }

  /**
   * Forget the texts remembered for `file` (`addCopiedTexts`): the document was saved there, so the
   * file holds what the document holds.
   * @param {string} file
   */
  forgetCopiedTexts(file) {
    for (const [key, l] of this._copiedTexts) {
      const rest = l.filter((e) => e.file !== file);
      if (rest.length === l.length) continue;
      if (rest.length) this._copiedTexts.set(key, rest);
      else this._copiedTexts.delete(key);
    }
  }

  /** The copy-on-write reader for an edit (null: no other file holds a key — nothing to compare). */
  _shared() {
    if (!this._copiedTexts.size && !this.otherTexts?.()?.size) return null;
    return (/** @type {string} */ key) => this.sharedTexts(key);
  }

  /**
   * Make the keys of new texts deterministic (`TextKeys.seededMint(prefix)`: the same edits give the
   * same keys) — for scripted checks (`__editor.seedTextKeys`); null / undefined: random again.
   * @param {string|null} [prefix]
   */
  seedTextKeys(prefix) {
    this._mintKey = prefix == null ? () => randomGuid() : seededMint(String(prefix));
  }

  /** Id of the current document state (changes with every edit, undo and redo). */
  get revision() {
    return this._undo.length ? this._undo[this._undo.length - 1].id : this._baseRev;
  }

  /**
   * A counter bumped whenever the level's objects (or the player start) may have changed: an
   * object edit — also inside an open transaction, where `revision` stays put until the commit —,
   * undo / redo, a cancelled stroke, a new document. Caches of what the objects hold (the story
   * checks' events and `once` keys) key on it together with the `level` object.
   */
  get objectsVersion() { return this._objectsVersion; }

  // -------------------------------------------------------------------------------------------
  // Transactions & history
  // -------------------------------------------------------------------------------------------

  /** Start a transaction (e.g. at pointer-down of a brush stroke). Nested calls are merged. */
  begin(label = tr('app.undo.edit')) {
    if (this._tx) { this._tx.depth++; return; }
    this._tx = {
      label, depth: 1, before: JSON.stringify(this.level), selectionBefore: [...this.selection],
      terrain: false, objects: false, meta: false, rect: null, ids: new Set(),
    };
  }

  /** End the transaction: pushes one undo step if anything changed. */
  commit() {
    const tx = this._tx;
    if (!tx) return;
    if (--tx.depth > 0) return;
    this._tx = null;
    if (!(tx.terrain || tx.objects || tx.meta)) return;
    const after = JSON.stringify(this.level);
    if (after === tx.before) return;
    // consecutive steps share their snapshot string (one copy per step instead of two)
    const prev = this._undo[this._undo.length - 1];
    const before = prev && prev.after === tx.before ? prev.after : tx.before;
    this._undo.push({
      id: ++this._seq, label: tx.label, before, after, selectionBefore: tx.selectionBefore, selectionAfter: [...this.selection],
      kinds: { terrain: tx.terrain, objects: tx.objects, meta: tx.meta }, rect: tx.rectUnknown ? null : tx.rect, ids: tx.ids ? [...tx.ids] : null,
    });
    if (this._undo.length > this.maxHistory) this._baseRev = this._undo.shift().id;
    this._redo.length = 0;
    this._updateDirty();
    this._emitHistory();
  }

  /** Abort the transaction and restore the level as it was at begin(). */
  cancel() {
    const tx = this._tx;
    if (!tx) return;
    this._tx = null;
    this.level = JSON.parse(tx.before);
    this._objectsVersion++;
    const dropped = this._restoreSelection(tx.selectionBefore);
    this.emit('change', { source: 'undo', terrain: tx.terrain, rect: null, objects: tx.objects, ids: null, meta: tx.meta });
    this.emit('selection', [...this.selection]);
    if (dropped.length) this.emit('selectionFiltered', dropped);
  }

  get inTransaction() { return !!this._tx; }
  get canUndo() { return this._undo.length > 0 && !this._tx; }
  get canRedo() { return this._redo.length > 0 && !this._tx; }
  get undoLabel() { return this._undo[this._undo.length - 1]?.label ?? ''; }
  get redoLabel() { return this._redo[this._redo.length - 1]?.label ?? ''; }

  undo() {
    if (!this.canUndo) return false;
    const e = this._undo.pop();
    this._redo.push(e);
    this._restore(e.before, e.selectionBefore, 'undo', e);
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    const e = this._redo.pop();
    this._undo.push(e);
    this._restore(e.after, e.selectionAfter, 'redo', e);
    return true;
  }

  _restore(json, selection, source, entry) {
    const kinds = entry.kinds;
    this.level = JSON.parse(json);
    this._objectsVersion++;
    const dropped = this._restoreSelection(selection);
    this._updateDirty();
    // the step's changed tile rect and object ids (null = unknown: views diff everything)
    this.emit('change', {
      source, terrain: kinds.terrain, rect: kinds.terrain && !kinds.meta ? entry.rect ?? null : null,
      objects: kinds.objects, ids: kinds.objects && Array.isArray(entry.ids) ? [...entry.ids] : null, meta: kinds.meta,
    });
    this.emit('selection', [...this.selection]);
    if (dropped.length) this.emit('selectionFiltered', dropped);
    this._emitHistory();
  }

  /**
   * Set the selection a restored level had (undo / redo / cancel): the ids that still exist, and
   * only what may be selected in it — a step taken while an object was shown does not select it
   * once the views hide it. Returns the ids `selectionFilter` left out (for 'selectionFiltered').
   * @param {string[]} selection
   * @returns {string[]}
   */
  _restoreSelection(selection) {
    const ids = new Set(this.level.objects.map((o) => o.id));
    const wanted = selection.filter((id) => id === 'spawn' || ids.has(id));
    this.selection = this._selectable(wanted);
    if (this.selection.length === wanted.length) return [];
    const kept = new Set(this.selection);
    return wanted.filter((id) => !kept.has(id));
  }

  _emitHistory() {
    this.emit('history', { canUndo: this.canUndo, canRedo: this.canRedo });
  }

  _setDirty(d) {
    if (this.dirty === d) return;
    this.dirty = d;
    this.emit('dirty', d);
  }

  /** dirty = the document differs from the last saved revision (undo back to it is clean). */
  _updateDirty() {
    this._setDirty(this.revision !== this._savedRev);
  }

  /**
   * Mark a revision as saved under `fileRef` (default: the current one). Pass the revision taken
   * when the save started: edits made while it was in flight keep the document dirty.
   * @param {FileRef|null} [fileRef]
   * @param {number} [revision]
   */
  markSaved(fileRef, revision = this.revision) {
    if (fileRef) this.fileRef = fileRef;
    // (a document from elsewhere saved as a project level: that file's table is the one to play with)
    if (fileRef && !this.origin) this.origin = tableOf(fileRef);
    this._savedRev = revision;
    this._updateDirty();
  }

  /** The current document is not saved anywhere (a restored autosave, a pasted level…). */
  markUnsaved() {
    this._savedRev = -1;
    this._updateDirty();
  }

  /** Run `fn` inside a transaction (auto-wrapped if none is open). */
  _edit(label, fn) {
    const own = !this._tx;
    if (own) this.begin(label);
    try {
      return fn(this._tx);
    } finally {
      if (own) this.commit();
    }
  }

  _changed(tx, kinds, rect = null, ids = null) {
    if (kinds.terrain) {
      tx.terrain = true;
      if (!rect) tx.rectUnknown = true;
      else tx.rect = tx.rect ? unionRect(tx.rect, rect) : { ...rect };
    }
    if (kinds.objects) {
      this._objectsVersion++;
      tx.objects = true;
      if (!ids) tx.ids = null;
      else if (tx.ids) for (const id of ids) tx.ids.add(id);
    }
    if (kinds.meta) tx.meta = true;
    this.emit('change', { source: 'edit', terrain: !!kinds.terrain, rect, objects: !!kinds.objects, ids: kinds.objects ? ids : null, meta: !!kinds.meta });
  }

  // -------------------------------------------------------------------------------------------
  // Level replacement
  // -------------------------------------------------------------------------------------------

  /**
   * Replace the whole level (new / open). Clears history and selection.
   * @param {Level} level
   * @param {FileRef} [fileRef] (a new, unsaved document)
   */
  replaceLevel(level, fileRef = { kind: 'new', name: '' }) {
    this._tx = null;
    this.level = level;
    this._objectsVersion++;
    this._droppedTexts.clear();
    this._droppedRoot.clear();
    this._splitKeys.clear();
    this._copiedTexts.clear();
    this._loadedKeys = new Set(levelKeys(level).map((k) => k.key));
    this.loads++;
    this.fileRef = fileRef;
    this.origin = tableOf(fileRef);
    this._undo.length = 0;
    this._redo.length = 0;
    this.selection = [];
    this._baseRev = ++this._seq;
    this._savedRev = this._baseRev;
    this.dirty = true;
    this._setDirty(false);
    this.emit('change', { source: 'load', terrain: true, rect: null, objects: true, ids: null, meta: true });
    this.emit('selection', []);
    this._emitHistory();
  }

  /** Replace the level through an undoable edit (resize, import into current…). */
  setLevel(level, label = tr('app.undo.replaceLevel')) {
    this._edit(label, (tx) => {
      this.level = level;
      const ids = new Set(level.objects.map((o) => o.id));
      this.selection = this.selection.filter((id) => id === 'spawn' || ids.has(id));
      this._changed(tx, { terrain: true, objects: true, meta: true });
    });
  }

  // -------------------------------------------------------------------------------------------
  // Terrain edits
  // -------------------------------------------------------------------------------------------

  getTile(i, j) { return getTile(this.level, i, j); }
  getHeight(i, j) { return getHeightLevel(this.level, i, j); }
  inBounds(i, j) { return inBounds(this.level, i, j); }

  /**
   * Apply many tile edits at once: cells = [{ i, j, tile?, height? }] (`tile`: a one-character
   * key of the level's legend; any other value is ignored). Returns the number of tiles that
   * changed. One 'change' event for the whole batch.
   */
  editTiles(cells, label = tr('app.undo.paint')) {
    return this._edit(label, (tx) => {
      let n = 0;
      let rect = null;
      for (const c of cells) {
        let ch = false;
        // (a tile is one character of its row: a longer legend key, e.g. "constructor" from a
        // hand-written file, would be spliced into the row whole)
        if (typeof c.tile === 'string' && c.tile.length === 1 && ownValue(this.level.legend, c.tile)) ch = setTileRaw(this.level, c.i, c.j, c.tile) || ch;
        if (c.height != null) ch = setHeightLevel(this.level, c.i, c.j, c.height) || ch;
        if (ch) {
          n++;
          rect = rect ? unionRect(rect, { minI: c.i, maxI: c.i, minJ: c.j, maxJ: c.j }) : { minI: c.i, maxI: c.i, minJ: c.j, maxJ: c.j };
        }
      }
      if (n) this._changed(tx, { terrain: true }, rect);
      return n;
    });
  }

  setTile(i, j, ch) { return this.editTiles([{ i, j, tile: ch }]) > 0; }
  setHeight(i, j, level) { return this.editTiles([{ i, j, height: level }], tr('app.undo.height')) > 0; }

  // -------------------------------------------------------------------------------------------
  // Object edits
  // -------------------------------------------------------------------------------------------

  getObject(id) { return this.level.objects.find((o) => o.id === id) ?? null; }

  /**
   * Add a catalog object; returns it. Every text it holds — the catalog's default texts included —
   * gets a text key in the same undo step (docs/specs/I18N.md §4.10); keys `overrides` bring along
   * stay unless the level holds them already.
   */
  addObject(type, x, z, overrides = {}, { select = true } = {}) {
    return this._edit(tr('app.undo.add', { what: OBJECT_TYPES[type]?.label ?? type }), (tx) => {
      const obj = addObjectRaw(this.level, type, x, z, overrides);
      if (textFieldsOf(obj.type) || Object.hasOwn(obj, 'textKeys')) {
        const used = keySet(this.level, new Set([obj]));
        fillObjectKeys(obj, { mint: minter(this._mintKey, used), used });
      }
      this._changed(tx, { objects: true }, null, [obj.id]);
      if (select) this.select([obj.id]);
      return obj;
    });
  }

  /**
   * Insert fully-formed objects (paste / duplicate); ids are regenerated if taken. Text keys
   * (docs/specs/I18N.md §4.10): a key the level already holds is replaced — a duplicate gets fresh
   * keys, a cut-and-paste keeps its own — and a text without one gets one.
   */
  insertObjects(objs, { select = true } = {}) {
    return this._edit(tr('app.undo.paste'), (tx) => {
      const ids = new Set(this.level.objects.map((o) => o.id));
      const added = [];
      // (all normalised first: an object normalizeObject refuses throws before the level changes)
      const fresh = objs.map((src) => normalizeObject(JSON.parse(JSON.stringify(src))));
      const used = fresh.some((o) => textFieldsOf(o.type)) ? keySet(this.level) : null;
      for (const o of fresh) {
        let n = 1;
        // ('spawn' addresses the player start: never an object id)
        let id = o.id && !ids.has(o.id) && o.id !== 'spawn' ? o.id : '';
        while (!id) { const c = `${o.type}_${n++}`; if (!ids.has(c)) id = c; }
        o.id = id;
        ids.add(id);
        if (used) fillObjectKeys(o, { mint: minter(this._mintKey, used), used });
        this.level.objects.push(o);
        added.push(o);
      }
      if (added.length) this._changed(tx, { objects: true }, null, added.map((o) => o.id));
      if (select) this.select(added.map((o) => o.id));
      return added;
    });
  }

  /**
   * Update an object: `patch` is an object merged shallowly, or a function (obj) => void that
   * mutates it in place. Returns the object. The texts the edit changed carry their keys from the
   * object before it, in the same undo step (docs/specs/I18N.md §4.10; src/editor/textKeys.js
   * `carryEdit`). A patch that writes `textKeys` itself keeps them (cleaned) unless it brings in a key
   * another text of the level holds, or one another file holds with other English: then the object
   * is keyed afresh as Assign keys it. A text whose English the edit changed gets a new key when
   * another file holds its key with other English (copy-on-write: `sharedTexts`).
   */
  updateObject(id, patch, label = tr('app.undo.editObject')) {
    return this._edit(label, (tx) => {
      const obj = this.getObject(id);
      if (!obj) return null;
      const before = keyedState(obj);
      if (typeof patch === 'function') patch(obj);
      else Object.assign(obj, patch);
      if (before || textFieldsOf(obj.type)) {
        carryEdit(before ?? { type: '', id: '' }, obj, {
          level: this.level, mint: this._mintKey, dropped: this._droppedTexts, shared: this._shared(), splits: this._splitKeys, loaded: this._loadedKeys,
        });
      }
      // (the patch may rename the object: both ids changed)
      this._changed(tx, { objects: true }, null, obj.id === id ? [id] : [id, obj.id]);
      return obj;
    });
  }

  /** Move objects (and/or the spawn when 'spawn' is in ids) by (dx, dz). */
  moveObjects(ids, dx, dz, label = tr('app.undo.move')) {
    if (!dx && !dz) return;
    this._edit(label, (tx) => {
      for (const id of ids) {
        if (id === 'spawn') { this.level.spawn.x += dx; this.level.spawn.z += dz; continue; }
        const o = this.getObject(id);
        if (!o) continue;
        const p = OBJECT_TYPES[o.type].placement;
        if (p === 'line') { o.x0 += dx; o.x1 += dx; o.z0 += dz; o.z1 += dz; }
        else if (p === 'rect') { o.minX += dx; o.maxX += dx; o.minZ += dz; o.maxZ += dz; }
        else { o.x += dx; o.z += dz; shiftLegacyFields(o, dx, dz); }
      }
      this._changed(tx, { objects: true }, null, [...ids]);
    });
  }

  removeObjects(ids, label = tr('app.undo.delete')) {
    const set = new Set(ids);
    this._edit(label, (tx) => {
      const before = this.level.objects.length;
      this.level.objects = this.level.objects.filter((o) => !set.has(o.id));
      if (this.level.objects.length !== before) this._changed(tx, { objects: true }, null, [...set]);
      this.selection = this.selection.filter((id) => !set.has(id));
      this.emit('selection', [...this.selection]);
    });
  }

  setSpawn(x, z, facing = this.level.spawn.facing) {
    this._edit(tr('app.undo.moveSpawn'), (tx) => {
      this.level.spawn = { ...this.level.spawn, x, z, facing };
      this._changed(tx, { objects: true }, null, ['spawn']);
    });
  }

  /**
   * Change level-wide properties: name, subtitle, author, description, waterLevel, water,
   * environment, legend (shallow merge for water / environment). The level's own texts
   * (`subtitle`, `environment.title.*`) keep their text keys, in the same undo step: a changed one
   * keeps its key (a new one gets one, a cleared one loses it); `textKeys` in a patch is merged
   * into the level's, never replaces them (docs/specs/I18N.md §4.10).
   */
  setLevelProps(patch, label = tr('app.undo.levelSettings')) {
    this._edit(label, (tx) => {
      let terrain = false;
      const before = rootState(this.level);
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'textKeys') {
          const keys = mergeRootKeys(this.level.textKeys, v);
          if (keys) this.level.textKeys = keys;
          else delete this.level.textKeys;
          before.textKeys = keys;
        } else if (k === 'environment' || k === 'water') this.level[k] = { ...this.level[k], ...v };
        else this.level[k] = v;
        if (k === 'waterLevel' || k === 'legend') terrain = true;
      }
      carryRootEdit(before, this.level, this._mintKey, { shared: this._shared(), dropped: this._droppedRoot, splits: this._splitKeys });
      this._changed(tx, { meta: true, terrain });
    });
  }

  /**
   * Level › Assign text keys (docs/specs/I18N.md §4.10): every text of the level without a key gets
   * one, a key on two texts is replaced on the later one, keys and tags on no text go — one undo
   * step. A key on texts of two Englishes stays with the copy whose English another file holds
   * under it (`sharedTexts`: a chapter variant's base, the campaign's other files, the file a *Save
   * As* left), else with the first. A text without a key first takes the key of the same text in a
   * level this one copies (`sources`, in order — the app gives a chapter variant's base level, or a
   * campaign copy's shipped level of the same file name, as `npm run i18n:keys -- --assign` shares
   * them): the same object id and field, the same English. New keys are never one the level held.
   * Objects that need nothing stay as they are. Returns how many objects changed and whether the
   * level's own texts did.
   * @param {string} [label]
   * @param {{ sources?: readonly (readonly { key: string, text: string, where: string }[])[] }} [o]
   *   `sources`: each copied level's keyed texts (`TextKeys.levelTexts`)
   * @returns {{ objects: number, root: boolean }}
   */
  assignTextKeys(label = tr('app.undo.assignTextKeys'), { sources = [] } = {}) {
    return this._edit(label, (tx) => {
      const L = this.level;
      // (what each object's keys were: an object Assign changes is one of the change's ids)
      const keysJSON = (o) => {
        const fields = textFieldsOf(o?.type);
        return JSON.stringify([Object.hasOwn(o ?? {}, 'textKeys') ? o.textKeys : null, ...Object.keys(fields ?? {}).filter((f) => fields[f] === 'script').map((f) => o[f] ?? null)]);
      };
      const before = new Map(L.objects.map((o) => [o, keysJSON(o)]));
      const rootBefore = JSON.stringify(Object.hasOwn(L, 'textKeys') ? L.textKeys : null);
      // (a new key is never one the level held: not a copy's either)
      const held = new Set(levelKeys(L).map((k) => k.key));
      preferSharedCopies(L, this._shared());
      shareKeys(L, sources);
      /** @type {Set<string>} */
      const used = new Set();
      const mint = minter(this._mintKey, used, held);
      // (in the level's order: a repeated key stays on its first text)
      for (const o of L.objects) fillObjectKeys(o, { mint, used });
      fillRootKeys(L, { mint, used });
      const ids = L.objects.filter((o) => keysJSON(o) !== before.get(o)).map((o) => o.id);
      const root = JSON.stringify(Object.hasOwn(L, 'textKeys') ? L.textKeys : null) !== rootBefore;
      if (ids.length) this._changed(tx, { objects: true }, null, ids);
      if (root) this._changed(tx, { meta: true });
      return { objects: ids.length, root };
    });
  }

  // -------------------------------------------------------------------------------------------
  // Selection, tools, view, hover
  // -------------------------------------------------------------------------------------------

  select(ids, { additive = false, toggle = false } = {}) {
    let next;
    if (toggle) {
      const s = new Set(this.selection);
      for (const id of ids) (s.has(id) ? s.delete(id) : s.add(id));
      next = [...s];
    } else {
      next = additive ? [...new Set([...this.selection, ...ids])] : [...ids];
    }
    next = this._selectable(next);
    if (next.length === this.selection.length && next.every((id, k) => id === this.selection[k])) return;
    this.selection = next;
    this.emit('selection', [...next]);
  }

  clearSelection() { this.select([]); }

  /**
   * What of `ids` may be selected (`selectionFilter`; all of them without one).
   * @param {string[]} ids
   * @returns {string[]}
   */
  _selectable(ids) {
    return this.selectionFilter ? this.selectionFilter(ids) : ids;
  }

  /**
   * Drop from the selection what may no longer be selected (after a change of what the views
   * hide). Returns the dropped ids.
   * @returns {string[]}
   */
  refreshSelection() {
    if (!this.selection.length) return [];
    const keep = this._selectable(this.selection);
    if (keep.length === this.selection.length) return [];
    const kept = new Set(keep);
    const dropped = this.selection.filter((id) => !kept.has(id));
    this.selection = [...keep];
    this.emit('selection', [...keep]);
    return dropped;
  }

  /** Selected level objects (excluding the spawn marker). */
  get selectedObjects() {
    return this.selection.map((id) => this.getObject(id)).filter(Boolean);
  }

  setTool(id) {
    if (this.toolId === id) return;
    this.prevToolId = this.toolId;
    this.toolId = id;
    this.emit('tool', id);
  }

  setToolOption(key, value) {
    if (this.toolOptions[key] === value) return;
    this.toolOptions[key] = value;
    this.emit('toolOptions', { ...this.toolOptions });
  }

  setView(patch) {
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if (this.view[k] !== v) { this.view[k] = v; changed = true; }
    }
    if (changed) this.emit('view', { ...this.view });
  }

  setHover(h) {
    const a = this.hover;
    if (a === h || (a && h && a.i === h.i && a.j === h.j && a.x === h.x && a.z === h.z && a.view === h.view)) return;
    this.hover = h;
    this.emit('hover', h);
  }

  /**
   * Transient status-bar message.
   * @param {string} message
   * @param {{ stale?: () => boolean, error?: boolean }} [opts] stale: while the message shows, the
   *   status bar asks it after every view change and edit, and drops the message once it answers
   *   true (a "… is hidden" message once the object is shown again). error: show it as a warning
   *   (without it the status bar guesses from English words, which a translated message lacks)
   */
  notify(message, opts) {
    this.emit('status', message, opts);
  }

  /** Deep copy of the current level (e.g. for saving while editing continues). */
  snapshot() {
    return cloneLevel(this.level);
  }
}

/**
 * A tool method threw (the 2D map's and the 3D view's shared path): log it, commit the open
 * transaction — what the tool applied so far stays as one undo step, and undo and the app's
 * commands are not left blocked — and show "Tool error: …" in the status bar.
 * @param {EditorState} state
 * @param {unknown} err
 * @param {string} [source] log prefix (e.g. `[Map2DView]`)
 */
export function reportToolError(state, err, source = '[editor]') {
  console.warn(`${source} tool error`, err);
  if (state.inTransaction) state.commit();
  state.notify(tr('app.toolError', { message: /** @type {Error} */ (err)?.message ?? err }), { error: true });
}

/**
 * Legacy absolute npc / critters fields (talkPoint, bounds, spots) follow a moved object.
 * (Loads and pastes convert them to the relative forms; this covers objects made by scripts.)
 */
export function shiftLegacyFields(o, dx, dz) {
  if (!dx && !dz) return o;
  const pt = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  if (pt(o.talkPoint)) o.talkPoint = [o.talkPoint[0] + dx, o.talkPoint[1] + dz];
  const b = o.bounds;
  if (b && ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => Number.isFinite(b[k]))) o.bounds = { ...b, minX: b.minX + dx, maxX: b.maxX + dx, minZ: b.minZ + dz, maxZ: b.maxZ + dz };
  if (Array.isArray(o.spots)) o.spots = o.spots.map((p) => (pt(p) ? [p[0] + dx, p[1] + dz] : p));
  return o;
}

/**
 * The content table of a project file (`levels/<name>`; a campaign's level: `campaigns/<campaign>`
 * — its table holds every level file of it), '' for anything else (docs/specs/I18N.md §4.3).
 * @param {FileRef} ref
 */
function tableOf(ref) {
  if (ref?.kind !== 'project' || !ref.name) return '';
  return ref.campaign ? `campaigns/${ref.campaign}` : `levels/${ref.name}`;
}

function unionRect(a, b) {
  return {
    minI: Math.min(a.minI, b.minI), maxI: Math.max(a.maxI, b.maxI),
    minJ: Math.min(a.minJ, b.minJ), maxJ: Math.max(a.maxJ, b.maxJ),
  };
}
