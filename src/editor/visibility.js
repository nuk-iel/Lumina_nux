/**
 * What the views hide, and the rule that **a hidden object is never selected** (KNOWN_ISSUES
 * STORY-06). Three things hide an object: the outliner's per-type eye (`view.hiddenTypes`), *View ›
 * Show objects* / *Show markers* switched off (`view.showObjects` / `view.showMarkers`, as the 2D
 * map follows them: `tools/common.js` `shownOnMap`) and the story preview (./story.js,
 * `storyVisible`). A hidden object is not drawn in the 2D map, cannot be picked or box-selected,
 * and is dimmed in the outliner — and it is never selected:
 *  - `EditorState.select`, undo / redo and a cancelled stroke narrow every selection through
 *    `selectionFilter`, which the app sets to `shownOnly` (what undo / redo / cancel leave out
 *    comes back as the state's 'selectionFiltered' event, and the app says so);
 *  - after anything that changes what is hidden (a view change, an edit of a condition, undo /
 *    redo, a paste, a save under another name or campaign) the app drops hidden objects from the
 *    selection, with a status message;
 *  - a click on one — a dimmed outliner row (also with Shift / Ctrl, or Enter from the keyboard),
 *    a hidden object's place in a view (`hiddenAt`) — selects nothing and says why in the status
 *    bar (`hiddenMessage` through `notifyHidden`: the message goes once the object is shown
 *    again); a box, Ctrl+A or a paste that leaves hidden objects out says how many and why
 *    (`leftOutMessage`);
 *  - a double-click on a dimmed outliner row (or F on it) turns its reasons off (`revealPatch`:
 *    the story preview off, the type shown again, *Show objects* / *Show markers* on) and selects
 *    it.
 * Three-free, so the tools and panels can share it.
 */
import { OBJECT_TYPES, hitTestObject, objectBounds } from '../engine/level/ObjectCatalog.js';
import { ownValue } from '../engine/utils/own.js';
import { storyVisible, storyValuesSummary } from './story.js';
import { viewToggleOf } from './tools/common.js';
import { tr, andList, commaList } from './i18n.js';

/**
 * @import { LevelObject } from '../engine/level/types.js'
 * @import { EditorState } from './EditorState.js'
 */

/**
 * Why the views hide an object: 'type' (its type is hidden with the outliner's eye), 'view' (*View
 * › Show objects* or *Show markers* — the one it follows on the 2D map — is off), 'story' (the
 * story preview does not allow it).
 * @typedef {'type'|'view'|'story'} HiddenReason
 */

/**
 * The view change that shows hidden objects again (`revealPatch`, for `EditorState.setView`).
 * @typedef {{ hiddenTypes?: string[], storyPreview?: boolean, showObjects?: boolean, showMarkers?: boolean }} RevealPatch
 */

/**
 * Can anything be hidden now (a type hidden, *Show objects* / *Show markers* off, or the story
 * preview on)? While not, every object is shown and the checks below cost nothing.
 * @param {EditorState} state
 */
export function mayHide(state) {
  const v = state.view;
  return !!v.storyPreview || (v.hiddenTypes?.length ?? 0) > 0 || v.showObjects === false || v.showMarkers === false;
}

/**
 * Why the views hide an object (empty: it is shown; the player start is no object and never
 * counts as hidden).
 * @param {EditorState} state
 * @param {LevelObject|null|undefined} o
 * @returns {HiddenReason[]}
 */
export function hiddenReasons(state, o) {
  /** @type {HiddenReason[]} */
  const out = [];
  if (!o || !mayHide(state)) return out;
  if (state.view.hiddenTypes?.includes(o.type)) out.push('type');
  const toggle = viewToggleOf(o);
  if (toggle && state.view[toggle] === false) out.push('view');
  if (!storyVisible(state, o)) out.push('story');
  return out;
}

/**
 * Is the object hidden in the views?
 * @param {EditorState} state
 * @param {LevelObject|null|undefined} o
 */
export function isHidden(state, o) {
  return hiddenReasons(state, o).length > 0;
}

/**
 * The level's objects by id (for the checks of many ids).
 * @param {EditorState} state
 * @returns {Map<string, LevelObject>}
 */
function byId(state) {
  return new Map(state.level.objects.map((o) => [o.id, o]));
}

/**
 * The ids the views show, in their order: 'spawn' and ids of no object are kept (the selection
 * filters those itself). `EditorState.selectionFilter`.
 * @param {EditorState} state
 * @param {string[]} ids
 * @returns {string[]}
 */
export function shownOnly(state, ids) {
  if (!ids.length || !mayHide(state)) return ids;
  const objs = byId(state);
  return ids.filter((id) => !isHidden(state, objs.get(id)));
}

/**
 * The ids among `ids` that the views hide.
 * @param {EditorState} state
 * @param {string[]} ids
 * @returns {string[]}
 */
export function hiddenOnly(state, ids) {
  if (!ids.length || !mayHide(state)) return [];
  const objs = byId(state);
  return ids.filter((id) => isHidden(state, objs.get(id)));
}

/** A type's label (its id for an unknown type). @param {string} type */
const typeLabel = (type) => ownValue(OBJECT_TYPES, type)?.label ?? type;

/** The View menu's names of its toggles (as its menu items say them). */
const toggleLabel = (/** @type {string} */ t) => (t === 'showObjects' ? tr('app.cmd.showObjects') : tr('app.hidden.markers'));

/**
 * What hides the objects and how to show them again, as message parts: `by` "the story preview
 * (bridge-mended)" / "the outliner's eye (Tree objects)" / "View › Show objects (off)", `fix`
 * "turn the preview off" / "show Tree objects again" / "turn View › Show objects on" (each list
 * joined with "and").
 * @param {EditorState} state
 * @param {LevelObject[]} objs hidden objects
 * @returns {{ by: string, fix: string }}
 */
function why(state, objs) {
  const types = [...new Set(objs.filter((o) => state.view.hiddenTypes?.includes(o.type)).map((o) => typeLabel(o.type)))];
  const toggles = [...new Set(objs.map((o) => viewToggleOf(o)).filter((t) => t && state.view[t] === false))].map(toggleLabel);
  const story = objs.some((o) => !storyVisible(state, o));
  const by = [];
  const fix = [];
  if (types.length) {
    const list = types.length > 3 ? tr('app.hidden.typesMore', { list: commaList(types.slice(0, 3)) }) : commaList(types);
    by.push(tr('app.hidden.byType', { list }));
    fix.push(types.length === 1 ? tr('app.hidden.fixType', { type: types[0] }) : tr('app.hidden.fixTypes'));
  }
  if (toggles.length) {
    by.push(tr('app.hidden.byView', { toggles: andList(toggles) }));
    fix.push(tr('app.hidden.fixView', { toggles: andList(toggles) }));
  }
  if (story) {
    by.push(tr('app.hidden.byStory', { values: storyValuesSummary(state) }));
    fix.push(tr('app.hidden.fixStory'));
  }
  return { by: andList(by), fix: andList(fix) };
}

/**
 * Why an object cannot be selected, for the status bar ('' when it is shown):
 * "tree_3 is hidden by the story preview (bridge-mended) — turn the preview off to edit it",
 * "tree_3 is hidden by the outliner's eye (Tree objects) — show Tree objects again to edit it".
 * @param {EditorState} state
 * @param {string} id
 * @returns {string}
 */
export function hiddenMessage(state, id) {
  const o = id === 'spawn' ? null : state.getObject(id);
  if (!o || !isHidden(state, o)) return '';
  const w = why(state, [o]);
  return tr('app.hidden.one', { id, by: w.by, fix: w.fix });
}

/**
 * Show a status message about hidden objects (`hiddenMessage` …) that goes as soon as none of them
 * is hidden any more (the story preview's values changed, the type shown again …), instead of
 * standing for its full time.
 * @param {EditorState} state
 * @param {string} message ('' shows nothing)
 * @param {string[]} ids the hidden objects it is about
 */
export function notifyHidden(state, message, ids) {
  if (!message) return;
  state.notify(message, { stale: () => !ids.some((id) => isHidden(state, state.getObject(id))) });
}

/**
 * The status message for hidden objects a selection left out ('' for none): "tree_3 was left out:
 * hidden by the story preview (…) — turn the preview off to edit it", "3 objects hidden by the
 * story preview (…) were left out — turn the preview off to edit them".
 * @param {EditorState} state
 * @param {string[]} ids hidden ids
 * @param {'leftOut'|'leftSelection'|'notSelected'} [how] what happened to them: left out of a new
 *   selection ("was left out"), dropped from the selection ("left the selection"), not selected
 *   ("is not selected")
 * @returns {string}
 */
export function leftOutMessage(state, ids, how = 'leftOut') {
  const objs = ids.map((id) => state.getObject(id)).filter((o) => o && isHidden(state, o));
  if (!objs.length) return '';
  const w = why(state, objs);
  const one = objs.length === 1;
  const v = { id: objs[0].id, n: objs.length, by: w.by, fix: w.fix };
  if (how === 'leftSelection') return one ? tr('app.hidden.leftSelection.one', v) : tr('app.hidden.leftSelection.many', v);
  if (how === 'notSelected') return one ? tr('app.hidden.notSelected.one', v) : tr('app.hidden.notSelected.many', v);
  return one ? tr('app.hidden.leftOut.one', v) : tr('app.hidden.leftOut.many', v);
}

/**
 * The view change that shows the objects again (null when they are shown): the story preview off
 * when it hides one, their types shown again, *Show objects* / *Show markers* on.
 * @param {EditorState} state
 * @param {string[]} ids
 * @returns {RevealPatch|null}
 */
export function revealPatch(state, ids) {
  /** @type {RevealPatch} */
  const patch = {};
  const types = new Set(state.view.hiddenTypes ?? []);
  let any = false;
  for (const id of ids) {
    const o = state.getObject(id);
    for (const r of hiddenReasons(state, o)) {
      any = true;
      if (r === 'story') patch.storyPreview = false;
      else if (r === 'view') patch[viewToggleOf(o)] = true;
      else types.delete(o.type);
    }
  }
  if (!any) return null;
  if (types.size !== (state.view.hiddenTypes?.length ?? 0)) patch.hiddenTypes = [...types];
  return patch;
}

/**
 * The hidden object whose footprint holds world point (x, z) — the smallest, if several — or null.
 * Areas (rectangles, particle areas, critter and enemy groups) are left out: a click inside one
 * does not pick a shown one either. For the status message of a click that hit nothing shown.
 * @param {EditorState} state
 * @param {number} x
 * @param {number} z
 * @returns {string|null}
 */
export function hiddenAt(state, x, z) {
  if (!mayHide(state) || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  let best = null;
  let bestA = Infinity;
  for (const o of state.level.objects) {
    const def = ownValue(OBJECT_TYPES, o?.type);
    if (!def || def.placement === 'rect' || o.type === 'emitter' || o.type === 'critters' || o.type === 'enemy') continue;
    if (!hitTestObject(o, x, z, 0.1) || !isHidden(state, o)) continue;
    const b = objectBounds(o);
    const a = (b.maxX - b.minX) * (b.maxZ - b.minZ);
    if (a < bestA) { bestA = a; best = o.id; }
  }
  return best;
}
