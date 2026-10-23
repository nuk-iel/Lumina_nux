/**
 * The editor's story helpers:
 *  - the **story preview** (View › Story preview…, KNOWN_ISSUES CMP-06): a list of story values
 *    (`bridge-mended`, `deliveries = 3`, `item:plank = 2`, `quest:find-ilse = active`,
 *    `stage:find-ilse = cross-ford`, `hour = 20`, `chapter = lanterns-home`) that, while the
 *    preview is on, hides the objects whose `when` / `unless` do not allow them in the 2D map and
 *    the 3D view (and makes them unpickable and unselectable: ./visibility.js). It is view state
 *    (`state.view.storyPreview`, `state.view.storyValues`), never saved with the level;
 *  - the **campaign story context** of *Check for problems*: a campaign level's `campaign.json`,
 *    its story files (`story/*.json|*.story`), built with `buildStory`, and its level files (every
 *    base level and chapter variant, read through `CampaignLevels`): their events and `once` keys
 *    are what a `done:` key may name, as the campaign check reads them (tools/lib/campaigncheck.mjs).
 *    Read whenever one of the campaign's levels opens (or a level is saved into it), and again by
 *    *Check for problems*; a read that fails keeps the context read before. All or nothing: a
 *    story file that cannot be read leaves out what the story files declare (items, quests,
 *    scripts, actors) and the events, a level file that cannot be read the events (the checks then
 *    read `done:` keys as before: only this level's own). `storyCheckContext` makes the
 *    `StoryContext` that `storyIssues` checks the open level against: the campaign's, with the
 *    open level's own events and `once` keys taken from the level being edited instead of its
 *    file — and, while the campaign's context is not there (not read yet, or `campaign.json`
 *    unreadable), a context that says only "a campaign level, its campaign unknown"
 *    (`UNKNOWN_CAMPAIGN`), so nothing is reported that the campaign might have. The preview
 *    reads its quest stages (their order) and chapter variants (a variant file's `level` is the
 *    campaign level it stands for), and is redrawn when it arrives (`onStoryContext`). The context
 *    also keeps every file's keyed texts (`texts`: whatever could be read): `otherFileTexts` gives
 *    the open level's edits the texts the campaign's other files hold under each key
 *    (copy-on-write, docs/specs/I18N.md §4.2 "one key, one English": an edit that changes the
 *    English of a text whose key another file holds gives the text a new key);
 *  - the **condition hint** of the inspector's condition fields (`conditionIssues`, KNOWN_ISSUES
 *    STORY-05): what *Check for problems* says about a condition field — the same per-field checks
 *    (`StoryChecks.conditionFieldIssues`: the field's own rule, the references, an entry-only
 *    type reading a flag the level sets, a "condition becomes true" event without its condition)
 *    against the same story context. Cheap while typing and during strokes: the level's own
 *    events and `once` keys are only computed for a condition with `done:` keys, the flags it sets
 *    only for an entry-only type's flags, both cached per `EditorState.objectsVersion` (and each
 *    script's references per text).
 */
import {
  REF_KINDS, GAME_REFS, QUEST_STATES, RESERVED_WORDS, isStoryName, isTextRef, parseScript, scriptRefs, emptyRefs, addConditionRefs,
} from '../engine/level/StoryScript.js';
import { conditionFields, scriptFields, readCondition, conditionFieldIssues, levelNames } from '../engine/level/StoryChecks.js';
import { conditionTester, storyAllows, hasStoryCondition } from '../engine/level/Travel.js';
import { slugify } from '../engine/level/LevelStorage.js';
import { isRoom } from './rooms.js';
import { buildStory } from '../game/campaign/StoryFormat.js';
import { loadCampaign, CampaignLevels } from '../game/campaign/CampaignStorage.js';
import { levelTexts, campaignTexts, storyFileTexts, storyTextTexts } from '../engine/i18n/TextKeys.js';
import { textMapOf, otherTextsOf } from './textKeys.js';
import { tr, commaList } from './i18n.js';

/**
 * @import { Level, LevelObject } from '../engine/level/types.js'
 * @import { Ref, RefReader, ScriptRefs } from '../engine/level/StoryScript.js'
 * @import { StoryContext, ConditionRule, FieldIssue } from '../engine/level/StoryChecks.js'
 * @import { Campaign } from '../game/campaign/CampaignFormat.js'
 * @import { EditorState } from './EditorState.js'
 * @import { OtherText } from './textKeys.js'
 * @import { KeyedText } from '../engine/i18n/TextKeys.js'
 */

/**
 * The keyed texts of the files of a campaign (`texts` of its story context): file → key → its
 * English and where it is there. Files: each level file by its id (`millbrook`, `millbrook-dusk`),
 * each story file as `story/<name>`, and `campaign.json`.
 * @typedef {Map<string, Map<string, { text: string, where: string }>>} CampaignTexts
 */

const NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/;
/** Game values whose value is text (`chapter = lanterns-home`); the others are numbers. */
const TEXT_GAME = new Set(['chapter', 'level', 'weather']);

/**
 * Story values entered for the preview, by reference key (`':name'` a flag / variable,
 * `'item:plank'`, `'quest:find-ilse'`, `'game:hour'` …).
 * @typedef {Map<string, number|string>} StoryValues
 */

/**
 * Parse the story preview's values: one per line — a name alone sets that flag (1), `name = <value>`
 * sets a value (a number, or a word for quests, stages, the chapter, the level and the weather),
 * `#` starts a comment. Lines that do not parse are reported and skipped.
 * @param {unknown} text
 * @returns {{ values: StoryValues, errors: { line: number, msg: string }[] }}
 */
export function parseStoryValues(text) {
  /** @type {StoryValues} */
  const values = new Map();
  const errors = [];
  String(typeof text === 'string' ? text : '').split(/\r?\n/).forEach((raw, k) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    const fail = (msg) => errors.push({ line: k + 1, msg });
    const m = /^([^\s=!<>]+)\s*(?:=\s*(.*))?$/.exec(line);
    if (!m) { fail(tr('story.values.notNameValue', { line })); return; }
    const [, left, right] = m;
    /** @type {Ref} */
    let ref;
    const colon = left.indexOf(':');
    if (colon >= 0) {
      const kind = left.slice(0, colon);
      const name = left.slice(colon + 1);
      if (!REF_KINDS.includes(/** @type {any} */ (kind))) { fail(tr('story.values.unknownKind', { kind, kinds: commaList(REF_KINDS.map((x) => `${x}:`)) })); return; }
      if (!isStoryName(name)) { fail(tr('story.values.notAName', { name })); return; }
      ref = { kind: /** @type {Ref['kind']} */ (kind), name };
    } else {
      const low = left.toLowerCase();
      if (GAME_REFS.includes(/** @type {any} */ (low))) ref = { kind: 'game', name: low };
      else if (!isStoryName(left)) { fail(tr('story.values.notAName', { name: left })); return; }
      else if (RESERVED_WORDS.has(low)) { fail(tr('story.values.reserved', { name: left })); return; }
      else ref = { kind: '', name: left };
    }
    const key = `${ref.kind}:${ref.name}`;
    const v = (right ?? '').trim();
    if (right === undefined) {
      // a name alone: that flag (an item: one of it; a quest: active)
      if (ref.kind === 'quest') values.set(key, 'active');
      else if (ref.kind === 'stage' || isTextRef(ref) || ref.kind === 'game') fail(tr('story.values.needsValue', { name: left }));
      else values.set(key, 1);
      return;
    }
    if (!v) { fail(tr('story.values.missingValue', { name: left })); return; }
    if (NUMBER.test(v)) {
      if (isTextRef(ref)) { fail(tr('story.values.wordNotNumber', { name: left })); return; }
      if (ref.kind === 'stage') { values.set(key, v); return; }
      values.set(key, Number(v));
      return;
    }
    if (v === 'true' || v === 'false') {
      if (isTextRef(ref) || ref.kind === 'stage') { fail(tr('story.values.wordExpected', { name: left, value: v })); return; }
      values.set(key, v === 'true' ? 1 : 0);
      return;
    }
    if (!isStoryName(v)) { fail(tr('story.values.notAValue', { value: v })); return; }
    if (ref.kind === 'quest' && !QUEST_STATES.includes(/** @type {any} */ (v))) { fail(tr('story.values.questState', { states: commaList([...QUEST_STATES]), value: v })); return; }
    if (!isTextRef(ref) && ref.kind !== 'stage') { fail(tr('story.values.numberNotWord', { name: left, value: v })); return; }
    values.set(key, v);
  });
  return { values, errors };
}

/**
 * A `RefReader` over entered story values. Unset values read as the game starts them: flags,
 * variables, items and counts 0, quests 'none' ('active' when a stage is entered: a stage starts
 * the quest), stages 0; the game values from `game` (`hour` — the 3D preview's hour —, `day` 1,
 * `level`, `weather`, `chapter`).
 *
 * Stages follow the game's rule (StoryRunner): `stage:q = s` stands for a quest at stage `s` that
 * reached the stages declared before it, in their order (the campaign's story files; without
 * them, or for a stage they do not declare: only `s`) — its log. `stage:q` reads the place of the
 * current stage in that log (0: not started); a stage name compared with it reads its place in
 * the log, and a stage the quest has not reached, or one that is not declared, one past every
 * reached stage (log length + 1). So `stage:q >= unreached` and `stage:q = unreached` are false,
 * `stage:q < unreached` is true.
 * @param {StoryValues} values
 * @param {{ game?: Record<string, number|string>, quests?: Map<string, string[]>|null }} [opts]
 *   quests: quest id → its stage ids (the campaign's story files): their declared order
 * @returns {RefReader}
 */
export function storyReader(values, { game = {}, quests = null } = {}) {
  /** quest → the stages it reached as the preview takes it (its log, in order) */
  const logs = new Map();
  /** @param {string} quest @returns {string[]} */
  const logOf = (quest) => {
    let log = logs.get(quest);
    if (log) return log;
    const cur = values.get(`stage:${quest}`);
    log = [];
    if (cur != null && cur !== '') {
      const declared = quests?.get(quest);
      const k = Array.isArray(declared) ? declared.indexOf(String(cur)) : -1;
      log = k >= 0 ? declared.slice(0, k + 1) : [String(cur)];
    }
    logs.set(quest, log);
    return log;
  };
  return {
    get(ref) {
      const key = `${ref.kind}:${ref.name}`;
      // the current stage: the last of the quest's log (0: not started)
      if (ref.kind === 'stage') return logOf(ref.name).length;
      if (values.has(key)) return values.get(key);
      if (ref.kind === 'quest') return values.has(`stage:${ref.name}`) ? 'active' : 'none';
      if (ref.kind === 'game') {
        if (Object.hasOwn(game, ref.name)) return game[ref.name];
        return TEXT_GAME.has(ref.name) ? '' : ref.name === 'day' ? 1 : 0;
      }
      return 0;
    },
    word(ref, w) {
      if (ref.kind === 'stage') {
        // a reached stage: its place in the log; any other: one past every reached stage
        const log = logOf(ref.name);
        const k = log.indexOf(w);
        return k >= 0 ? k + 1 : log.length + 1;
      }
      if (isTextRef(ref)) return w;
      // a variable on the right of a numeric comparison (`gold >= inn.price`): its value
      const v = values.get(`:${w}`);
      return typeof v === 'number' ? v : 0;
    },
  };
}

/** The preview's condition test, cached per state (rebuilt when its inputs change). */
const holdsCache = new WeakMap();

/**
 * Does a story condition hold under the story preview's values (the state's view)?
 * @param {EditorState} state
 * @returns {(cond: string) => boolean}
 */
export function storyHolds(state) {
  const v = state.view;
  const L = state.level;
  const campaign = state.fileRef?.campaign ?? '';
  const ctx = campaign ? cachedStoryContext(campaign) : null;
  const file = state.fileRef?.kind === 'project' || state.fileRef?.kind === 'local' ? state.fileRef.name : '';
  // `level` is the campaign's level id, as in the game: a chapter variant's file (millbrook-dusk)
  // stands for its base level (millbrook)
  const level = (ctx?.variants instanceof Map && ctx.variants.get(file)) || file;
  // (ctxGen: the campaign's story files were read again — their quest stages may differ)
  // (a room shows no weather: `weather` reads clear there, as a room played on its own does)
  const weather = isRoom(L.environment) ? 'clear' : String(L.environment?.weather ?? 'clear');
  const key = `${v.storyValues ?? ''}\u0000${v.timeOfDay}\u0000${weather}\u0000${level}\u0000${campaign}\u0000${ctxGen}`;
  const c = holdsCache.get(state);
  if (c && c.key === key) return c.holds;
  const { values } = parseStoryValues(v.storyValues);
  const holds = conditionTester(storyReader(values, {
    game: { hour: Number(v.timeOfDay ?? 12), weather, level },
    quests: ctx?.quests instanceof Map ? ctx.quests : null,
  }));
  holdsCache.set(state, { key, holds });
  return holds;
}

/**
 * Is the object shown as the story preview stands (always, while the preview is off)?
 * @param {EditorState} state
 * @param {LevelObject} o
 */
export function storyVisible(state, o) {
  if (!state.view.storyPreview || !hasStoryCondition(o)) return true;
  return storyAllows(o, storyHolds(state));
}

/**
 * The ids of the objects the story preview hides now (empty while it is off).
 * @param {EditorState} state
 * @returns {Set<string>}
 */
export function storyHiddenIds(state) {
  const out = new Set();
  if (!state.view.storyPreview) return out;
  for (const o of state.level.objects) if (!storyVisible(state, o)) out.add(o.id);
  return out;
}

// =================================================================================================
// Campaign story context
// =================================================================================================

/**
 * The events and `once` keys of one level: what its `done:` keys — and, in a campaign, every
 * `done:<level>.<id>` — may name (as `storyIssues` and the campaign check read a level).
 * @typedef {{ events: Map<string, boolean>, onceKeys: Set<string> }} LevelStoryKeys
 *   events: event id → is it `once` (only a `once` event is remembered)
 */

/**
 * A campaign's story context as the editor keeps it: also its chapter variants (variant file id →
 * the campaign level it stands for) and, when every level and story file could be read, what
 * `done:` keys may name — each level file's events and `once` keys (`files`: file id → its base
 * level and keys, and the names its villagers answer to: what a party member may be called) and
 * the story files' (`storyEvents`: event id → `once`; `storyOnceKeys`). `storyCheckContext` builds
 * the checks' `events` / `onceKeys` / `villagers` from them.
 * `texts`: every file's keyed texts that could be read (`CampaignTexts`; copy-on-write).
 * @typedef {StoryContext & { variants?: Map<string, string>,
 *   files?: Map<string, LevelStoryKeys & { base: string, villagers?: Set<string> }>, storyEvents?: Map<string, boolean>,
 *   storyOnceKeys?: Set<string>, texts?: CampaignTexts }} CampaignStoryContext
 */

/** campaign → the context (null: could not be read) once loaded. @type {Map<string, CampaignStoryContext|null>} */
const ctxDone = new Map();
/** campaign → the load in flight. @type {Map<string, Promise<CampaignStoryContext|null>>} */
const ctxLoading = new Map();
/** Bumped whenever a context is stored (the story preview's cached test is rebuilt). */
let ctxGen = 0;
/** Called with the campaign whenever its context was stored. @type {Set<(campaign: string) => void>} */
const ctxListeners = new Set();

/**
 * Call `fn(campaign)` whenever a campaign's story context has been read (again) — the story
 * preview's hidden objects may differ (the views redraw), and so may the condition hints.
 * @param {(campaign: string) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onStoryContext(fn) {
  ctxListeners.add(fn);
  return () => { ctxListeners.delete(fn); };
}

const base = () => import.meta.env?.BASE_URL ?? '/';

/** A text file of the site, or null (missing: dev servers answer unknown paths with index.html). */
async function fetchText(url) {
  const r = await fetch(url, { cache: 'no-store' });
  const type = r.headers.get('content-type') ?? '';
  if (!r.ok || type.includes('text/html')) return null;
  return r.text();
}

/**
 * The events and `once` keys of a level (what `storyIssues` reads as the level's own).
 * @param {Level} level
 * @returns {LevelStoryKeys}
 */
export function levelStoryKeys(level) {
  /** @type {LevelStoryKeys} */
  const out = { events: new Map(), onceKeys: new Set() };
  for (const o of Array.isArray(level?.objects) ? level.objects : []) {
    if (o?.type === 'event' && typeof o.id === 'string') out.events.set(o.id, !!o.once);
    for (const [, v] of scriptFields(o)) for (const k of scriptRefs(parseScript(v).nodes).onceKeys) out.onceKeys.add(k);
  }
  return out;
}

/**
 * Every level file of a campaign — each base level and its chapter variants (`variants`: variant
 * file → base level, as `levelVariants` lists them) — read through the game's campaign loading
 * (`CampaignLevels`): file id → its base level, events and `once` keys, and its villagers' names
 * (`levelNames`) — `files`, null when one of them cannot be read (the context then leaves the
 * campaign's events out) — and the keyed texts of every file that could be read (`texts`).
 * @param {string} slug
 * @param {Campaign} c
 * @param {Map<string, string>} variants
 * @param {CampaignTexts} texts filled with each level file's keyed texts
 * @returns {Promise<Map<string, LevelStoryKeys & { base: string, villagers: Set<string> }>|null>}
 */
async function readLevelKeys(slug, c, variants, texts) {
  const store = new CampaignLevels(slug);
  /** @type {Map<string, string>} file id → base level */
  const ids = new Map(c.levels.map((l) => [l.id, l.id]));
  const bases = new Set(ids.keys());
  for (const [file, b] of variants) if (bases.has(b) && !ids.has(file)) ids.set(file, b);
  const parts = await Promise.allSettled([...ids].map(async ([id, b]) => {
    const { level } = await store.load(id);
    texts.set(id, keyedTexts(() => levelTexts(level)));
    /** @type {[string, LevelStoryKeys & { base: string, villagers: Set<string> }]} */
    const entry = [id, { base: b, ...levelStoryKeys(level), villagers: levelNames(level).villagers }];
    return entry;
  }));
  const failed = parts.find((p) => p.status === 'rejected');
  if (failed) {
    const err = /** @type {PromiseRejectedResult} */ (failed).reason;
    console.info(`[editor] campaign "${slug}": its levels' events are not known (${err?.message ?? err}) — done: keys are checked against this level's own`);
    return null;
  }
  return new Map(parts.map((p) => /** @type {PromiseFulfilledResult<[string, LevelStoryKeys & { base: string, villagers: Set<string> }]>} */ (p).value));
}

/**
 * Read a campaign's story context: its level ids, its chapter variants, every level file's events
 * and `once` keys, and — when campaign.json lists story files — the items, quests (→ stage ids),
 * named scripts and actors (→ names), events and `once` keys they declare.
 * @param {string} campaign
 * @returns {Promise<CampaignStoryContext|null>}
 */
async function readStoryContext(campaign) {
  const slug = slugify(campaign);
  const { campaign: c } = await loadCampaign(slug);
  const variants = new Map();
  for (const ch of c.chapters) for (const [b, file] of Object.entries(ch.levels)) if (file !== b) variants.set(file, b);
  /** @type {CampaignTexts} */
  const texts = new Map([['campaign.json', keyedTexts(() => campaignTexts(c))]]);
  /** @type {CampaignStoryContext} */
  const ctx = { levels: new Set(c.levels.map((l) => l.id)), variants, texts };
  // (the level files load while the story files are read)
  const levelKeys = readLevelKeys(slug, c, variants, texts);
  /** @type {Map<string, boolean>} */
  const storyEvents = new Map();
  /** @type {Set<string>} */
  const storyOnceKeys = new Set();
  let storyRead = true;
  if (c.story.length) {
    const files = [];
    for (const name of c.story) {
      const text = await fetchText(`${base()}campaigns/${encodeURIComponent(slug)}/story/${encodeURIComponent(name)}`).catch(() => null);
      // (a .json story file that does not parse declares nothing either: as if it were missing)
      if (text != null && (!/\.json$/i.test(name) || parsesAsJSON(text))) {
        files.push({ name, text });
        texts.set(`story/${name}`, keyedTexts(() => (/\.json$/i.test(name) ? storyFileTexts(JSON.parse(text)) : storyTextTexts(text.split(/\r?\n/)))));
      } else storyRead = false;
    }
    // All or nothing: what a story file that could not be read declares would be reported as
    // missing — so then no items, quests, scripts, actors or events are known (not checked)
    if (storyRead) {
      const { story } = buildStory(files);
      ctx.items = new Set(Object.keys(story.items));
      ctx.quests = new Map(Object.entries(story.quests).map(([id, q]) => [id, q.stages.map((s) => s.id)]));
      ctx.scripts = new Set(Object.keys(story.scripts));
      ctx.actors = new Map(Object.entries(story.actors).map(([id, a]) => [id, a.name]));
      for (const e of story.events) storyEvents.set(e.id, e.once);
      for (const s of Object.values(story.scripts)) for (const k of scriptRefs(parseScript(s.lines).nodes).onceKeys) storyOnceKeys.add(k);
    } else console.info(`[editor] campaign "${slug}": a story file could not be read — its items, quests, scripts, actors and events are not checked`);
  }
  const files = await levelKeys;
  // (all or nothing: an event of a file that could not be read would be reported as missing)
  if (files && storyRead) Object.assign(ctx, { files, storyEvents, storyOnceKeys });
  return ctx;
}

/**
 * A file's keyed texts by key (`textMapOf` of `read()`); empty when they cannot be read — copy-on-write
 * then knows nothing of that file, and the story context is read as before.
 * @param {() => KeyedText[]} read
 */
function keyedTexts(read) {
  try {
    return textMapOf(read());
  } catch (err) {
    console.info(`[editor] a campaign file's text keys could not be read (${err?.message ?? err})`);
    return new Map();
  }
}

/** @param {string} text */
function parsesAsJSON(text) {
  try { JSON.parse(text); return true; } catch { return false; }
}

/**
 * The story context of a campaign (read once and cached; `refresh` reads the files again). A
 * caller without `refresh` gets the read in flight, if any, else the stored context. Only the
 * newest read is stored (an older one still in flight resolves its own callers); a read that
 * fails keeps the context read before (null only for a campaign never read); storing a new context
 * calls the `onStoryContext` listeners.
 * @param {string} campaign
 * @param {{ refresh?: boolean }} [opts]
 * @returns {Promise<CampaignStoryContext|null>}
 */
export function campaignStoryContext(campaign, { refresh = false } = {}) {
  if (!campaign) return Promise.resolve(null);
  if (!refresh) {
    const inFlight = ctxLoading.get(campaign);
    if (inFlight) return inFlight;
    if (ctxDone.has(campaign)) return Promise.resolve(ctxDone.get(campaign));
  }
  /** @type {Promise<CampaignStoryContext|null>} */
  const p = readStoryContext(campaign).catch((err) => {
    console.info(`[editor] campaign "${campaign}": no story context (${err?.message ?? err})${ctxDone.get(campaign) ? ' — the one read before is kept' : ''}`);
    return null;
  }).then((read) => {
    // a refresh started after this read overtook it: the newer read is stored, not this one
    if (ctxLoading.get(campaign) !== p) return read ?? ctxDone.get(campaign) ?? null;
    ctxLoading.delete(campaign);
    const before = ctxDone.get(campaign);
    // (a failed read keeps a good context: a file being saved, the dev server restarting …)
    const ctx = read ?? before ?? null;
    if (ctx === before && ctxDone.has(campaign)) return ctx;
    ctxDone.set(campaign, ctx);
    ctxGen++;
    for (const fn of ctxListeners) {
      try { fn(campaign); } catch (err) { console.warn('[editor] story context listener:', err); }
    }
    return ctx;
  });
  ctxLoading.set(campaign, p);
  return p;
}

/**
 * The cached story context of a campaign: undefined while it was never read, null when it could
 * not be read (and no read before it could).
 * @param {string} campaign
 * @returns {CampaignStoryContext|null|undefined}
 */
export function cachedStoryContext(campaign) {
  return ctxDone.get(campaign);
}

/** The other files' texts per state, rebuilt when the context or the open file changes. @type {WeakMap<EditorState, { key: string, map: Map<string, OtherText[]> }>} */
const otherCache = new WeakMap();

/**
 * The texts the other files of the open level's campaign hold, by key — every level file but the
 * open one (chapter variants too), the story files and `campaign.json`, as last read
 * (`campaignStoryContext`): what copy-on-write compares an edit with (`EditorState#otherTexts`)
 * and *Find by text key…* names when the open level does not hold a key. Null outside a campaign
 * or while its context is not there.
 * @param {EditorState} state
 * @returns {Map<string, OtherText[]>|null}
 */
export function otherFileTexts(state) {
  const ref = state.fileRef;
  const campaign = ref?.kind === 'project' ? ref.campaign ?? '' : '';
  if (!campaign) return null;
  const texts = cachedStoryContext(campaign)?.texts;
  if (!(texts instanceof Map)) return null;
  const key = `${ctxGen}\u0000${campaign}\u0000${ref.name}`;
  let c = otherCache.get(state);
  if (!c || c.key !== key) {
    c = { key, map: otherTextsOf([...texts].filter(([file]) => file !== ref.name)) };
    otherCache.set(state, c);
  }
  return c.map;
}

/** A set of names that holds any name (what a campaign not read yet may declare). */
class AnyName extends Set {
  /** @param {string} _name @returns {boolean} */
  has(_name) { return true; }
}

/** A map of story actors that holds any actor (iterated, it is empty: no names to compare). */
class AnyActor extends Map {
  /** @param {string} _id @returns {boolean} */
  has(_id) { return true; }
}

/**
 * The context of a campaign level whose campaign is not known (`campaign.json` not read yet, or
 * unreadable): any name may be one of its levels, items, quests, scripts or actors. It says "a
 * campaign level, its events unknown" — `done:` keys are checked only when they name the level's
 * own events (`StoryChecks.refIssues`, as when a level file cannot be read), `visited:` keys,
 * `travel` targets, items, quests, `call`ed scripts and actors are not doubted — instead of the
 * checks of a single level, which read `done:<level>.<id>` as the level's own event (and so report
 * the campaign's as missing) and warn that `call` needs story files. With `level`:
 * `storyCheckContext`.
 * @type {Readonly<StoryContext>}
 */
export const UNKNOWN_CAMPAIGN = Object.freeze({
  levels: /** @type {Set<string>} */ (new AnyName()), items: /** @type {Set<string>} */ (new AnyName()),
  quests: /** @type {Set<string>} */ (new AnyName()), scripts: /** @type {Set<string>} */ (new AnyName()),
  actors: /** @type {Map<string, string>} */ (new AnyActor()),
});

/** The checks' contexts per state, rebuilt when their inputs change. @type {WeakMap<EditorState, { base?: { key: string, ctx: StoryContext }, full?: { key: string, level: Level, version: number, ctx: StoryContext } }>} */
const checkCache = new WeakMap();

/**
 * The `StoryContext` *Check for problems* and the condition hints check the open level against:
 * none for a level outside a campaign; for a campaign's level the campaign's context with `level`
 * (the base level the file stands for) and — when every file of the campaign could be read —
 * `events` / `onceKeys` built as the campaign check builds them: every level file's events as
 * `<level>.<id>`, the story files' as `story.<id>`, and the `once` keys of them all, the open
 * level's own taken from the level being edited rather than from its file — and `villagers`, the
 * names every level's villagers answer to (what a party member may be called). While the campaign's
 * context is not there (not read yet, or `campaign.json` unreadable): `UNKNOWN_CAMPAIGN` with
 * `level` — a campaign level whose campaign is not known.
 * @param {EditorState} state
 * @param {{ events?: boolean }} [opts] events: false leaves `events` / `onceKeys` / `villagers` out
 *   (what a condition without `done:` or `party:` keys needs: no level's scripts are read)
 * @returns {StoryContext}
 */
export function storyCheckContext(state, { events = true } = {}) {
  const ref = state.fileRef;
  const campaign = ref?.kind === 'project' ? ref.campaign ?? '' : '';
  if (!campaign) return {};
  const file = ref.name;
  const ctx = cachedStoryContext(campaign);
  if (!ctx) return { ...UNKNOWN_CAMPAIGN, level: file };
  const cache = checkCache.get(state) ?? {};
  checkCache.set(state, cache);
  const key = `${ctxGen}\u0000${campaign}\u0000${file}`;
  // (`texts`: copy-on-write's, not the checks')
  const { variants, files, storyEvents, storyOnceKeys, texts: _texts, ...rest } = ctx;
  const level = (variants instanceof Map && variants.get(file)) || file;
  if (!events || !(files instanceof Map)) {
    if (cache.base?.key !== key) cache.base = { key, ctx: { ...rest, level } };
    return cache.base.ctx;
  }
  // (the open level's events and `once` keys change with its objects: also inside a stroke)
  const f = cache.full;
  if (f && f.key === key && f.level === state.level && f.version === state.objectsVersion) return f.ctx;
  /** @type {Map<string, boolean>} */
  const evs = new Map();
  const onceKeys = new Set(storyOnceKeys ?? []);
  const villagers = new Set(liveVillagers(state));
  /** @param {string} b @param {LevelStoryKeys & { villagers?: Set<string> }} k */
  const add = (b, k) => {
    for (const [id, once] of k.events) evs.set(`${b}.${id}`, !!evs.get(`${b}.${id}`) || once);
    for (const x of k.onceKeys) onceKeys.add(x);
    for (const v of k.villagers ?? []) villagers.add(v);
  };
  for (const [id, k] of files) if (id !== file) add(k.base, k);
  add(level, liveKeys(state));
  for (const [id, once] of storyEvents ?? []) evs.set(`story.${id}`, once);
  /** @type {StoryContext} */
  const out = { ...rest, level, events: evs, onceKeys, villagers };
  cache.full = { key, level: state.level, version: state.objectsVersion, ctx: out };
  return out;
}

// -------------------------------------------------------------------------------------------------
// The open level's own story (cached per objectsVersion; each script's references per text)
// -------------------------------------------------------------------------------------------------

/** A script's references by its text (JSON: an array of lines and a string never collide). @type {Map<string, ScriptRefs>} */
const refsMemo = new Map();

/**
 * The references of a script field (`scriptRefs` of its parsed lines), remembered per text: an
 * edit re-reads only the scripts it changed.
 * @param {unknown} v
 * @returns {ScriptRefs}
 */
function scriptRefsOf(v) {
  let key;
  try { key = JSON.stringify(v ?? null); } catch { key = null; }
  if (key == null) return scriptRefs(parseScript(v).nodes);
  let r = refsMemo.get(key);
  if (!r) {
    r = scriptRefs(parseScript(v).nodes);
    if (refsMemo.size >= 4000) refsMemo.clear();
    refsMemo.set(key, r);
  }
  return r;
}

/** The open level's own story per state. @type {WeakMap<EditorState, { level: Level, version: number, keys?: LevelStoryKeys, sets?: Set<string>, villagers?: Set<string> }>} */
const ownCache = new WeakMap();

/** @param {EditorState} state */
function ownEntry(state) {
  let c = ownCache.get(state);
  if (!c || c.level !== state.level || c.version !== state.objectsVersion) {
    c = { level: state.level, version: state.objectsVersion };
    ownCache.set(state, c);
  }
  return c;
}

/**
 * The open level's events and `once` keys (what its `done:` keys may name; `levelStoryKeys` of the
 * level as edited).
 * @param {EditorState} state
 * @returns {LevelStoryKeys}
 */
function liveKeys(state) {
  const c = ownEntry(state);
  if (c.keys) return c.keys;
  /** @type {LevelStoryKeys} */
  const keys = { events: new Map(), onceKeys: new Set() };
  for (const o of state.level.objects) {
    if (o?.type === 'event' && typeof o.id === 'string') keys.events.set(o.id, !!o.once);
    for (const [, v] of scriptFields(o)) for (const k of scriptRefsOf(v).onceKeys) keys.onceKeys.add(k);
  }
  c.keys = keys;
  return keys;
}

/**
 * The flags and variables the open level's villagers and scripts write (`levelStoryRefs(level).sets`
 * of the level as edited): what an entry-only type's condition must not read.
 * @param {EditorState} state
 * @returns {Set<string>}
 */
function liveSets(state) {
  const c = ownEntry(state);
  if (c.sets) return c.sets;
  const sets = new Set();
  for (const o of state.level.objects) {
    for (const [, v] of scriptFields(o)) for (const w of scriptRefsOf(v).writes) sets.add(w);
    if (o?.type === 'npc' && typeof o.flag === 'string' && o.flag.trim()) sets.add(o.flag.trim());
  }
  c.sets = sets;
  return sets;
}

/**
 * The names the open level's villagers answer to (id, actor, name — in lower case:
 * `levelNames(level).villagers` of the level as edited): what a party member may be called.
 * @param {EditorState} state
 * @returns {Set<string>}
 */
function liveVillagers(state) {
  const c = ownEntry(state);
  c.villagers ??= levelNames(state.level).villagers;
  return c.villagers;
}

/**
 * The rule a condition field of an object type is read by — the checks' own
 * (`StoryChecks.conditionFields`): 'flag' for `when` / `unless` / an exit's `requires`, 'script'
 * for an event's `if`; null when the field holds no condition.
 * @param {string} type
 * @param {string} key
 * @returns {ConditionRule|null}
 */
export function conditionRuleOf(type, key) {
  const probe = /** @type {LevelObject} */ (/** @type {unknown} */ ({ type, [key]: 'x' }));
  return conditionFields(probe).find(([f]) => f === key)?.[2] ?? null;
}

/**
 * What *Check for problems* says about a condition field (`storyIssues`, that field —
 * `StoryChecks.conditionFieldIssues`, one function for both) with the text as typed: why it does
 * not parse or is no usable flag (by the field's rule — `when: gold` is a flag that can never be
 * set, an event's `if: gold` reads the purse); what its references name that the level or the
 * campaign does not have (undeclared items and quests, stages, `visited:` and `done:` keys); an
 * entry-only type (a chest …) whose `when` / `unless` reads a flag this level sets; a "condition
 * becomes true" event whose `if` is blank. Against the same context (`storyCheckContext`) and this
 * level's own events, `once` keys and flags — computed only when the condition needs them.
 * @param {EditorState} state
 * @param {LevelObject|{ type: string }} o the object (several of one type: `{ type }`)
 * @param {string} field 'when', 'unless', 'requires' or 'if'
 * @param {unknown} src the field's text
 * @returns {FieldIssue[]}
 */
export function conditionIssues(state, o, field, src) {
  const probe = /** @type {LevelObject} */ (/** @type {unknown} */ ({ ...o, [field]: typeof src === 'string' ? src : '' }));
  const entry = conditionFields(probe).find(([f]) => f === field);
  let full = false;
  if (entry) {
    const refs = emptyRefs();
    addConditionRefs(readCondition(entry[1], entry[2]).cond, refs);
    // (`done:` keys need the campaign's events, `party:<who>` its villagers)
    full = refs.done.size > 0 || refs.members.size > 0;
  }
  return conditionFieldIssues(probe, field, storyCheckContext(state, { events: full }), { local: () => liveKeys(state), sets: () => liveSets(state), villagers: () => liveVillagers(state) });
}

/**
 * The story preview's values in one line, for messages: its lines without comments, joined
 * (`bridge-mended, hour = 20`), shortened past 60 characters; "no values" when there are none.
 * @param {EditorState} state
 * @returns {string}
 */
export function storyValuesSummary(state) {
  const parts = String(state.view.storyValues ?? '').split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
  const s = parts.join(', ');
  if (!s) return tr('story.values.none');
  return s.length > 60 ? `${s.slice(0, 59).trimEnd()}…` : s;
}

/**
 * The level's objects with story conditions (for the preview dialog's summary).
 * @param {Level} level
 */
export function storyConditionCount(level) {
  let n = 0;
  for (const o of level.objects) if (hasStoryCondition(o)) n++;
  return n;
}
