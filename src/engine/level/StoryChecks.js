/**
 * Problems with a level's story that need no running game (docs/specs/STORY_SCRIPT.md §10): scripts
 * and conditions that do not parse (with line numbers), a reserved word written as a flag, events
 * that lack what their trigger needs, a background event whose script needs the player, names a
 * script uses that the level (or, given a campaign's story, the story files) does not have —
 * speakers, actors and places, items, quests and their stages, `done:` and `visited:` keys, party
 * members (`party:<who>`, `party leave <who>` …) and villagers `party join` takes —, `once` keys
 * shared by two scripts. The editor's "Check for problems" lists them;
 * `tools/check-level.mjs` and the campaign check report them. Node-safe (no DOM, no three.js).
 *
 * Names are compared the way the game resolves them: villagers by id, actor or name and story
 * actors by id or name in any case; markers, entrances and objects by their exact name or id.
 */
import {
  parseScript, parseCondition, scriptRefs, emptyRefs, addConditionRefs, isStoryName, isFlagName, isBareName, hasScript, flagCondition,
  scriptLines, RESERVED_WORDS, backgroundIssue, walkNodes, isPlayerName, conditionRefs, cachedCondition, cachedScriptCondition,
} from './StoryScript.js';
import { levelEntrances, entranceName, LIVE_STORY_TYPES } from './Travel.js';
import { OBJECT_TYPES } from './ObjectCatalog.js';
import { isOwnKey } from '../utils/own.js';
import { sm } from './storyMessages.js';

/**
 * @import { Level, LevelObject } from './types.js'
 * @import { ScriptRefs, ScriptNode, Cond } from './StoryScript.js'
 */

/**
 * One problem. `severity` 'error': it will not work as written (a script line is skipped, an event
 * never fires); 'warning': probably a mistake.
 * @typedef {{ severity: 'error'|'warning', id: string, field: string, line: number, msg: string }} StoryIssue
 *   id: the object ('' = the level); field: 'talk', 'run', 'when' …; line: the script line (0 = none)
 */

/**
 * What the campaign around the level declares (from its story files: StoryFormat.js, and its other
 * level files), when known. Without it, items, quests, scripts and actors are not checked against
 * declarations, and `done:` keys only against the level's own events and `once` blocks.
 * @typedef {object} StoryContext
 * @property {Set<string>} [items]
 * @property {Map<string, string[]>|Set<string>} [quests]   quest ids (→ their stage ids)
 * @property {Set<string>} [scripts]
 * @property {Map<string, string>} [actors]   actor id → display name
 * @property {Set<string>} [levels]   the campaign's level ids (base ids)
 * @property {string} [level]   the base id of the level checked: `done:<id>` reads its event
 *   `<level>.<id>` (unset for a story-file script, which runs in any level)
 * @property {Map<string, boolean>} [events]   every event a `done:` can read in the campaign —
 *   `<level>.<id>` (the events of every level file) and `story.<id>` (the story files' events) —
 *   → whether it is `once` (only a `once` event is remembered); unset: the campaign's events are
 *   not known (a campaign level's `done:` keys are then checked only when they name its own)
 * @property {Set<string>} [onceKeys]   the keys of every `once` block of the campaign
 * @property {Set<string>} [villagers]   every name a villager of the campaign's levels answers to
 *   (id, actor, name), in lower case: what a party member may be called (`party:<who>`,
 *   `party leave <who>` … — a member joined in one level and follows the player to the others);
 *   unset on a campaign level: not known (those names are then not doubted)
 */

/**
 * How a condition field is read. 'flag' — the flag rule of the fields written before conditions
 * existed (`when`, `unless`, an exit's `requires`, a chapter's `when`): one bare name is always that
 * flag. 'script' — a condition as scripts write it (an event's `if`, a campaign event's `if`, a
 * quest goal's `done`, a script's `if` / `[if …]`): `if: gold` reads the purse.
 * @typedef {'flag'|'script'} ConditionRule
 */

/**
 * The events and `once` keys of one level, which its `done:` keys may name, and — when known — its
 * villagers (every name one answers to, in lower case: `levelNames(level).villagers`), which a party
 * member's name may be.
 * @typedef {{ events: Map<string, boolean>, onceKeys: Set<string>, villagers?: Set<string> }} LocalStory
 *   events: event id → is it `once`
 */

const text = (v) => (typeof v === 'string' ? v.trim() : '');
/** @type {LocalStory} */
const NO_LOCAL = { events: new Map(), onceKeys: new Set() };

/**
 * Who speaks each line of dialogue of a parsed script, with its line: `quoted` when the script
 * writes the name in quotes (`"A voice": …` — a name meant as written, not a villager or actor).
 * The narrator (`: text`) and `- text` with no speaker above are left out.
 * @param {unknown} source the script field (the lines `parseScript` read)
 * @param {ScriptNode[]} nodes its parsed nodes
 * @returns {{ speaker: string, line: number, quoted: boolean }[]}
 */
export function scriptSpeakers(source, nodes) {
  const lines = scriptLines(source);
  /** @type {{ speaker: string, line: number, quoted: boolean }[]} */
  const out = [];
  const walk = (list) => {
    for (const n of list ?? []) {
      if (n.t === 'say') {
        if (!n.speaker) continue;
        // (an inline `*` alternative holds its line after the star)
        const raw = String(lines[n.line - 1] ?? '').trim().replace(/^\*\s*/, '');
        out.push({ speaker: n.speaker, line: n.line, quoted: raw.startsWith('"') });
      } else if (n.t === 'choice') for (const o of n.options) walk(o.body);
      else if (n.t === 'if') { for (const b of n.branches) walk(b.body); walk(n.otherwise); }
      else if (n.t === 'loop' || n.t === 'once') walk(n.body);
      else if (n.t === 'vary') for (const a of n.alts) walk(a);
    }
  };
  walk(nodes);
  return out;
}

/**
 * The script fields of an object: [field, value].
 * @param {LevelObject} o
 * @returns {[string, unknown][]}
 */
export function scriptFields(o) {
  /** @type {[string, unknown][]} */
  const out = [];
  if (o?.type === 'npc' && o.talk !== undefined) out.push(['talk', o.talk]);
  if (o?.type === 'event') out.push(['run', o.run]);
  return out;
}

/**
 * The condition fields of an object with text: [field, value, rule] — `when` / `unless` (every
 * type) and an exit's `requires` under the flag rule, an event's `if` as scripts write it.
 * @param {LevelObject} o
 * @returns {[string, string, ConditionRule][]}
 */
export function conditionFields(o) {
  /** @type {[string, string, ConditionRule][]} */
  const out = [];
  for (const f of ['when', 'unless']) if (text(o?.[f])) out.push([f, o[f], 'flag']);
  if (o?.type === 'exit' && text(o.requires)) out.push(['requires', o.requires, 'flag']);
  if (o?.type === 'event' && text(o.if)) out.push(['if', o.if, 'script']);
  return out;
}

/**
 * The condition fields an object of its type may hold, whether or not they have text: `when` and
 * `unless` (every type), an exit's `requires`, an event's `if`.
 * @param {LevelObject} o
 * @returns {string[]}
 */
export function conditionFieldKeys(o) {
  const out = ['when', 'unless'];
  if (o?.type === 'exit') out.push('requires');
  if (o?.type === 'event') out.push('if');
  return out;
}

/**
 * One problem with one condition field, as `conditionFieldIssues` reports it. `text`: the message
 * is about the field's text, which `storyIssues` quotes before it (`when "gold": …`).
 * @typedef {{ severity: 'error'|'warning', msg: string, text?: string }} FieldIssue
 */

/**
 * The level's own story, as a condition field's checks need it — each given as a value or as a
 * function called only when a check needs it (the editor's hint computes them lazily).
 * @typedef {object} OwnStory
 * @property {LocalStory|(() => LocalStory)} [local] the level's events and `once` keys (what its
 *   `done:` keys may name)
 * @property {Set<string>|(() => Set<string>)} [sets] the flags and variables the level's own
 *   villagers and scripts write (an entry-only type's warning)
 * @property {Set<string>|(() => Set<string>)} [villagers] every name the level's villagers answer
 *   to, in lower case (`levelNames(level).villagers`: what `party:<who>` may name)
 */

/** @template T @param {T|(() => T)|undefined} v @returns {T|undefined} */
const resolve = (v) => (typeof v === 'function' ? /** @type {() => T} */ (v)() : v);

/**
 * What *Check for problems* says about one condition field of an object — `storyIssues` reports
 * these under the field, and the editor's condition hint shows them while it is typed: why its
 * text does not parse or is no usable flag (`conditionError`, by the field's rule); what its
 * references name that the level or the campaign does not have (`refIssues`); a "condition becomes
 * true" event without its condition (`if`); and a type that follows its story condition only on
 * entering the level (not `LIVE_STORY_TYPES`) whose `when` / `unless` reads a flag this level
 * itself sets — filed under the field that reads it.
 * @param {LevelObject} o the object (its other fields: the type, an event's trigger)
 * @param {string} field 'when', 'unless', 'requires' or 'if'
 * @param {StoryContext} [ctx]
 * @param {OwnStory} [own]
 * @returns {FieldIssue[]}
 */
export function conditionFieldIssues(o, field, ctx = {}, own = {}) {
  /** @type {FieldIssue[]} */
  const out = [];
  if (field === 'if' && o?.type === 'event' && o.on === 'change' && !text(o.if)) out.push({ severity: 'error', msg: sm('check.changeNeedsIf') });
  const entry = conditionFields(o).find(([f]) => f === field);
  if (!entry) return out;
  const [, v, rule] = entry;
  const src = text(v);
  const why = conditionError(src, rule);
  if (why) out.push({ severity: 'error', msg: why, text: src });
  const cr = emptyRefs();
  addConditionRefs(readCondition(src, rule).cond, cr);
  /** @type {LocalStory} */
  let local = cr.done.size ? resolve(own.local) ?? NO_LOCAL : NO_LOCAL;
  if (cr.members.size && !local.villagers) local = { ...local, villagers: resolve(own.villagers) ?? resolve(own.local)?.villagers };
  out.push(...refIssues(cr, ctx, local));
  if ((field === 'when' || field === 'unless') && hasConditionOnEntryOnly(o)) {
    // a condition on a type that is applied on entering only, reading what this level itself writes
    const reads = emptyRefs();
    addConditionRefs(flagCondition(src), reads);
    const sets = reads.reads.size ? resolve(own.sets) : null;
    const mine = sets ? [...reads.reads].filter((f) => sets.has(f)) : [];
    if (mine.length) out.push({ severity: 'warning', msg: sm('check.entryOnly', { type: OBJECT_TYPES[o.type]?.label ?? o.type, flags: mine }) });
  }
  return out;
}

/**
 * A condition field as the game reads it. `error`: why it does not parse ('' none) — under the
 * flag rule the whole text is then read as one flag (`cond`), under the script rule it never holds.
 * @param {unknown} v
 * @param {ConditionRule} rule
 * @returns {{ cond: Cond, error: string }}
 */
export function readCondition(v, rule) {
  const src = text(v);
  if (rule === 'script') return parseCondition(src);
  if (!src || isBareName(src)) return { cond: flagCondition(src), error: '' };
  const p = parseCondition(src);
  return p.error ? { cond: flagCondition(src), error: p.error } : p;
}

/** The reserved words written as a bare flag with a hint of what was probably meant (storyStrings.js `hint.<word>`). */
const BARE_HINTS = new Set(['gold', 'hour', 'day', 'visits', 'chapter', 'level', 'weather', 'party', 'true', 'false']);

/**
 * Why a condition field's text is wrong ('' when it is fine): it does not parse; under the flag
 * rule, one bare name that is a reserved word (`when: gold` — a flag of that name, which can never
 * be set) or no usable flag name.
 * @param {unknown} v
 * @param {ConditionRule} rule
 * @returns {string}
 */
export function conditionError(v, rule) {
  const src = text(v);
  if (!src) return '';
  if (rule === 'flag' && isBareName(src)) {
    const low = src.toLowerCase();
    if (RESERVED_WORDS.has(low)) {
      const hint = sm(BARE_HINTS.has(low) ? `hint.${low}` : 'hint.other');
      return sm('check.reservedFlag', { src, hint });
    }
    if (!isFlagName(src)) return sm('check.badFlagName', { src });
    return '';
  }
  const { error } = parseCondition(src);
  if (!error) return '';
  return rule === 'flag' ? sm('check.flagParse', { error, src }) : error;
}

/**
 * Why a `done:<name>` never holds ('' when it can, or cannot be told): it names no `once` event or
 * `once` block. The keys (STORY_SCRIPT.md §6): `done:<id>` this level's event `<id>`, a story-file
 * event `<id>` or a `once` block `<id>`; `done:<level>.<id>` another level's event.
 * @param {string} name
 * @param {StoryContext} ctx
 * @param {LocalStory} local
 * @returns {string}
 */
function doneProblem(name, ctx, local) {
  /** @type {boolean[]} what the name reads: true a `once` event or block, false an event that is not `once` */
  const hits = [];
  const ev = (map, key) => { if (map?.has(key)) hits.push(!!map.get(key)); };
  ev(local.events, name);
  if (local.onceKeys.has(name) || ctx.onceKeys?.has(name)) hits.push(true);
  if (ctx.events) {
    if (ctx.level) ev(ctx.events, `${ctx.level}.${name}`);
    // (a story-file script runs in any level: `done:<id>` may read the event of whichever it is in)
    else for (const l of ctx.levels ?? []) ev(ctx.events, `${l}.${name}`);
    ev(ctx.events, name);
    ev(ctx.events, `story.${name}`);
  } else if (!ctx.levels) {
    // a single level: `done:<level>.<id>` reads its own event (the level's file name, then its id)
    for (let d = name.indexOf('.'); d >= 0; d = name.indexOf('.', d + 1)) ev(local.events, name.slice(d + 1));
  } else if (!hits.length) return ''; // a campaign level, the campaign's events unknown (the editor)
  if (hits.some((h) => h)) return '';
  if (hits.length) return sm('check.doneNotOnce', { name });
  return sm(ctx.events ? 'check.doneNoneCampaign' : 'check.doneNoneLevel', { name });
}

/**
 * Why a party member's name (`party:<who>`, `party leave / rule / set / menu <who>`) names nobody
 * ('' when it names someone, or that cannot be told): no villager of this level (`local.villagers`),
 * no actor of the story files (id or name) and — in a campaign — no villager of its levels
 * (`ctx.villagers`; unset on a campaign level: not known, not doubted). In any case, as the game
 * finds a member (by id, actor or name).
 * @param {string} name
 * @param {StoryContext} ctx
 * @param {LocalStory} local
 * @returns {string}
 */
export function memberProblem(name, ctx, local) {
  const low = name.toLowerCase();
  if (low === 'player') return sm('check.memberPlayer');
  if (local.villagers?.has(low) || storyActorNames(ctx).has(low)) return '';
  if (ctx.villagers) return ctx.villagers.has(low) ? '' : sm('check.memberCampaign', { name });
  // (a campaign level whose other levels are not known: the member may have joined in one of them)
  if (ctx.levels || !local.villagers) return '';
  return sm('check.memberLevel', { name });
}

/**
 * What the references of a script or a condition name that the level or the campaign does not
 * have: undeclared items and quests (a `stage:` of an undeclared quest has no declared order), a
 * stage its quest does not declare (an error), `visited:` of no level of the campaign, `done:` of
 * no `once` event or block, a party member who is no villager or actor (`memberProblem`).
 * @param {ScriptRefs} r
 * @param {StoryContext} [ctx]
 * @param {LocalStory} [local] the level's own events and `once` keys (none for a story-file script)
 * @returns {{ severity: 'error'|'warning', msg: string }[]}
 */
export function refIssues(r, ctx = {}, local = NO_LOCAL) {
  /** @type {{ severity: 'error'|'warning', msg: string }[]} */
  const out = [];
  const add = (severity, msg) => out.push({ severity, msg });
  if (ctx.items) for (const it of r.items) if (!ctx.items.has(it)) add('warning', sm('check.itemUndeclared', { item: it }));
  if (ctx.quests) {
    for (const q of r.quests) {
      if (ctx.quests.has(q)) continue;
      add('warning', sm(r.stageReads?.has(q) ? 'check.questUndeclaredStage' : 'check.questUndeclared', { q }));
    }
    if (ctx.quests instanceof Map) {
      const seen = new Set();
      for (const { quest, stage } of r.stages) {
        const st = ctx.quests.get(quest);
        if (!st || st.includes(stage) || seen.has(`${quest}\u0000${stage}`)) continue;
        seen.add(`${quest}\u0000${stage}`);
        add('error', sm('check.noStage', { quest, stage }));
      }
    }
  }
  if (ctx.levels) for (const l of r.visited ?? []) if (!ctx.levels.has(l)) add('warning', sm('check.visited', { level: l }));
  for (const name of r.done) {
    const why = doneProblem(name, ctx, local);
    if (why) add('warning', why);
  }
  for (const name of r.members ?? []) {
    const why = memberProblem(name, ctx, local);
    if (why) add('warning', why);
  }
  return out;
}

/**
 * Everything the story of a level refers to and sets: its objects' conditions and scripts.
 * @param {Level} level
 * @returns {ScriptRefs & { sets: Set<string> }}
 */
export function levelStoryRefs(level) {
  const refs = /** @type {ScriptRefs & { sets: Set<string> }} */ ({ ...emptyRefs(), sets: new Set() });
  for (const o of level?.objects ?? []) {
    for (const [, v, rule] of conditionFields(o)) addConditionRefs(readCondition(v, rule).cond, refs);
    for (const [, v] of scriptFields(o)) scriptRefs(parseScript(v).nodes, refs);
    if (o?.type === 'npc' && text(o.flag)) refs.sets.add(text(o.flag));
  }
  for (const w of refs.writes) refs.sets.add(w);
  return refs;
}

/**
 * The names a script may use for actors and places in this level: villagers (id, actor), entrances
 * and markers (name and id), every object id. `villagers`: every name a villager answers to — id,
 * actor, name — in lower case (the game looks them up in any case), and "player".
 * @param {Level} level
 */
export function levelNames(level) {
  const actors = new Set(['player']);
  const npcNames = new Map();
  const places = new Set(['player']);
  const villagers = new Set(['player']);
  for (const o of level?.objects ?? []) {
    if (typeof o?.id === 'string') places.add(o.id);
    if (o?.type === 'npc') {
      actors.add(o.id);
      if (typeof o.id === 'string') villagers.add(o.id.toLowerCase());
      if (text(o.actor)) { actors.add(text(o.actor)); places.add(text(o.actor)); villagers.add(text(o.actor).toLowerCase()); }
      if (text(o.name)) { npcNames.set(text(o.name).toLowerCase(), o.id); villagers.add(text(o.name).toLowerCase()); }
    }
    if (o?.type === 'marker' && text(o.name)) places.add(text(o.name));
  }
  for (const e of levelEntrances(level)) places.add(entranceName(e));
  return { actors, npcNames, places, villagers };
}

/**
 * The story actors of a context, by id and by name, in lower case.
 * @param {StoryContext} ctx
 * @returns {Set<string>}
 */
function storyActorNames(ctx) {
  const out = new Set();
  for (const [id, name] of ctx.actors ?? []) {
    out.add(String(id).toLowerCase());
    if (typeof name === 'string' && name) out.add(name.toLowerCase());
  }
  return out;
}

/**
 * The actors a script's staging commands direct (walk, teleport, face, emote, bark, home, wait) —
 * they must be a villager of the level the script runs in (or the player).
 * @param {ScriptNode[]} nodes
 * @returns {Set<string>}
 */
export function stagedActors(nodes) {
  const out = new Set();
  const walk = (list) => {
    for (const n of list ?? []) {
      if (n.t === 'cmd') {
        if (['walk', 'teleport', 'face', 'emote', 'bark', 'home', 'wait'].includes(n.op) && n.args.who && !isPlayerName(n.args.who)) out.add(n.args.who);
      } else if (n.t === 'choice') for (const o of n.options) walk(o.body);
      else if (n.t === 'if') { for (const b of n.branches) walk(b.body); walk(n.otherwise); }
      else if (n.t === 'loop' || n.t === 'once') walk(n.body);
      else if (n.t === 'vary') for (const a of n.alts) walk(a);
    }
  };
  walk(nodes);
  return out;
}

/**
 * The lines of a script a background run cannot play (`backgroundIssue` — dialogue, a choice, a
 * command outside `BACKGROUND_OPS`, the player walked, turned or teleported), as check messages:
 * "cannot run in the background: dialogue needs the player — drop "background" or use "bark"".
 * Scripts it `call`s are not followed (the campaign check follows them).
 * @param {ScriptNode[]} nodes
 * @returns {{ line: number, msg: string }[]}
 */
export function backgroundErrors(nodes) {
  /** @type {{ line: number, msg: string }[]} */
  const out = [];
  walkNodes(nodes, (n) => {
    const why = backgroundIssue(n);
    if (why) out.push({ line: n.line, msg: sm(n.t === 'say' ? 'check.backgroundSay' : 'check.background', { why }) });
  });
  return out.sort((a, b) => a.line - b.line);
}

/**
 * The party members a script tests — `party:<who>` in its conditions, its event's `if` or the
 * object's `when` —, in lower case: a script that asks whether one is in the party may stage it
 * (a member walks with the player from level to level; StoryRunner finds it before the villagers).
 * @param {LevelObject} o
 * @param {ScriptNode[]} nodes
 * @returns {Set<string>}
 */
export function partyTests(o, nodes) {
  const out = new Set();
  /** @param {Cond|null|undefined} c */
  const add = (c) => {
    for (const { ref } of conditionRefs(c)) if (ref.kind === 'party') out.add(ref.name.toLowerCase());
  };
  walkNodes(nodes, (n) => {
    if (n.t === 'if') for (const b of n.branches) add(b.cond);
    else if (n.t === 'choice') for (const opt of n.options) add(opt.cond);
  });
  if (o?.type === 'event' && text(o.if)) add(cachedScriptCondition(text(o.if)));
  if (text(o?.when)) add(cachedCondition(text(o.when)));
  return out;
}

/**
 * The level's story problems.
 * @param {Level} level
 * @param {StoryContext} [ctx]
 * @returns {StoryIssue[]}
 */
export function storyIssues(level, ctx = {}) {
  /** @type {StoryIssue[]} */
  const out = [];
  const add = (severity, id, field, line, msg) => out.push({ severity, id, field, line, msg });
  const objects = Array.isArray(level?.objects) ? level.objects : [];
  const { places, villagers } = levelNames(level);
  const enemyIds = new Set(objects.filter((o) => o?.type === 'enemy').map((o) => o.id));
  /** flags / variables the level's own scripts and villagers write */
  const sets = levelStoryRefs(level).sets;
  const storyActors = storyActorNames(ctx);
  const isVillager = (s) => villagers.has(s.toLowerCase());
  const isStoryActor = (s) => storyActors.has(s.toLowerCase());

  // every script parsed once; the level's events and `once` keys (what its `done:` keys may name)
  // and its villagers (what a party member may be called)
  /** @type {LocalStory} */
  const local = { events: new Map(), onceKeys: new Set(), villagers };
  /** @type {Map<LevelObject, { field: string, v: unknown, nodes: ScriptNode[], errors: { line: number, msg: string }[], r: ScriptRefs }[]>} */
  const scripts = new Map();
  for (const o of objects) {
    if (o?.type === 'event' && typeof o.id === 'string') local.events.set(o.id, !!o.once);
    const list = [];
    for (const [field, v] of scriptFields(o)) {
      const { nodes, errors } = parseScript(v);
      const r = scriptRefs(nodes);
      for (const key of r.onceKeys) local.onceKeys.add(key);
      list.push({ field, v, nodes, errors, r });
    }
    scripts.set(o, list);
  }
  /** `once` / `cycle`-`seq`-`pick` keys → the first script that uses them (keys are global) */
  const firstUser = { once: new Map(), vary: new Map() };

  for (const o of objects) {
    const id = typeof o?.id === 'string' ? o.id : '';
    // (the editor's condition hint shows the same, field by field)
    for (const field of conditionFieldKeys(o)) {
      for (const i of conditionFieldIssues(o, field, ctx, { local, sets })) add(i.severity, id, field, 0, i.text !== undefined ? sm('check.fieldText', { field, text: i.text, msg: i.msg }) : i.msg);
    }
    if (o?.type === 'npc') {
      if (o.talk !== undefined && !Array.isArray(o.talk) && typeof o.talk !== 'string') add('error', id, 'talk', 0, sm('check.talkNotList'));
      if (text(o.actor) && !isStoryName(text(o.actor))) add('error', id, 'actor', 0, sm('check.actorName', { actor: text(o.actor) }));
      else if (text(o.actor) && ctx.actors && !ctx.actors.has(text(o.actor))) add('warning', id, 'actor', 0, sm('check.actorUndeclared', { actor: text(o.actor) }));
      if (text(o.flag) && !isFlagName(text(o.flag))) add('warning', id, 'flag', 0, sm('check.flagName', { flag: text(o.flag) }));
    }
    if (o?.type === 'event') {
      const on = o.on;
      if (!hasScript(o.run)) add('warning', id, 'run', 0, sm('check.noScript'));
      if (on === 'time' && !(typeof o.at === 'number' && o.at >= 0 && o.at <= 24)) add('error', id, 'at', 0, sm('check.clockAt'));
      if (on === 'cleared' && !text(o.group)) add('error', id, 'group', 0, sm('check.groupMissing'));
      else if (on === 'cleared' && !enemyIds.has(text(o.group))) add('warning', id, 'group', 0, sm('check.groupUnknown', { group: text(o.group) }));
      // (a "condition becomes true" event without its condition: conditionFieldIssues, under `if`)
      if (on === 'use' && !(o.maxX > o.minX && o.maxZ > o.minZ)) add('error', id, 'on', 0, sm('check.useRect'));
      // (read as `=== true`, as the game does: anything else is a foreground event)
      if (o.background !== undefined && typeof o.background !== 'boolean') add('warning', id, 'background', 0, sm('check.backgroundBool'));
    }
    for (const { field, v, nodes, errors, r } of scripts.get(o) ?? []) {
      for (const e of errors) add('error', id, field, e.line, e.msg);
      // a background event: only lines that need no input and move no one but villagers
      if (o.type === 'event' && field === 'run' && o.background === true) for (const e of backgroundErrors(nodes)) add('error', id, field, e.line, e.msg);
      // `home` gives a villager a home: the player has none (the game stops the script there)
      walkNodes(nodes, (n) => {
        if (n.t === 'cmd' && n.op === 'home' && isPlayerName(n.args?.who)) add('error', id, field, n.line, sm('check.homePlayer'));
      });
      // (a script that travels may go on in another level: names of the story's actors pass there)
      const travels = r.travels.length > 0;
      const staged = stagedActors(nodes);
      // (a villager of another level of the campaign that the script tests with `party:<who>`: a
      // member that came along — the game directs it, talks with it, points the camera at it; on a
      // campaign level whose campaign's villagers are not known, not doubted)
      /** @type {Set<string>|null} (worked out when a name would be warned about) */
      let tested = null;
      const isMember = (s) => {
        const low = s.toLowerCase();
        if (ctx.villagers ? !ctx.villagers.has(low) : !ctx.levels) return false;
        tested ??= partyTests(o, nodes);
        return tested.has(low);
      };
      for (const a of r.actors) {
        if (isVillager(a) || isMember(a)) continue;
        if (!staged.has(a)) {
          // `visits:<actor>` — any villager or actor of the story
          if (!isStoryActor(a)) add('warning', id, field, 0, sm('check.unknownActor', { a }));
        } else if (!isStoryActor(a)) add('warning', id, field, 0, sm('check.unknownActor', { a }));
        else if (!travels) add('warning', id, field, 0, sm('check.actorNotHere', { a }));
      }
      // `party join <who>`: a villager of this level (else the game refuses it with a warning)
      for (const a of r.joins) {
        if (isVillager(a) || (isStoryActor(a) && travels)) continue;
        add('warning', id, field, 0, sm(isStoryActor(a) ? 'check.joinActor' : 'check.joinUnknown', { a }));
      }
      for (const t of r.targets) {
        if (places.has(t) || isVillager(t) || isMember(t)) continue;
        if (isStoryActor(t) && travels) continue;
        add('warning', id, field, 0, sm(isStoryActor(t) ? 'check.targetActor' : 'check.targetUnknown', { a: t }));
      }
      // (a quoted name is meant as written; each unknown name is reported once, at its first line)
      const named = new Set();
      for (const { speaker: s, line, quoted } of scriptSpeakers(v, nodes)) {
        if (quoted || named.has(s.toLowerCase())) continue;
        named.add(s.toLowerCase());
        if (isVillager(s) || isStoryActor(s) || isMember(s)) continue;
        add('warning', id, field, line, sm('check.speaker', { s }));
      }
      for (const i of refIssues(r, ctx, local)) add(i.severity, id, field, 0, i.msg);
      if (ctx.scripts) {
        for (const s of r.scripts) if (!ctx.scripts.has(s)) add('error', id, field, 0, sm('check.scriptMissing', { s }));
      } else if (r.scripts.size) add('warning', id, field, 0, sm('check.callNoStory'));
      if (ctx.levels) for (const t of r.travels) if (!ctx.levels.has(t.level)) add('error', id, field, t.line, sm('check.travelLevel', { level: t.level }));
      // `once` and `cycle` / `seq` / `pick` keys are global: two scripts with one key share it
      // (the villagers of one actor are one character: their talk scripts count as one)
      const ident = o.type === 'npc' && field === 'talk' && text(o.actor) ? `actor:${text(o.actor).toLowerCase()}` : `${id}\u0000${field}`;
      for (const [kind, keys] of /** @type {const} */ ([['once', r.onceKeys], ['vary', r.varyKeys]])) {
        for (const key of keys) {
          const first = firstUser[kind].get(key);
          if (!first) firstUser[kind].set(key, { ident, label: `${o.type} ${id} › ${field}` });
          else if (first.ident !== ident) add('warning', id, field, 0, onceKeyMessage(kind, key, first.label));
        }
      }
    }
  }
  return out;
}

/**
 * The warning for a `once` / `cycle`-`seq`-`pick` key another script uses too.
 * @param {'once'|'vary'} kind
 * @param {string} key
 * @param {string} other where the other script is
 */
export function onceKeyMessage(kind, key, other) {
  return sm(kind === 'once' ? 'check.onceKey' : 'check.varyKey', { key, other });
}

/**
 * Does an object of a type the game cannot show or hide live carry a story condition? (Not one of
 * `LIVE_STORY_TYPES` — since 2026-10-07 every catalog type is live, so this holds only for a type
 * added later and not listed there yet.)
 * @param {LevelObject} o
 */
function hasConditionOnEntryOnly(o) {
  return !!(text(o?.when) || text(o?.unless)) && isOwnKey(OBJECT_TYPES, o?.type) && !LIVE_STORY_TYPES.has(o.type);
}

/**
 * A story problem as one line of text (for the editor and the checks): `object › field:line: msg`.
 * @param {StoryIssue} i
 * @param {Level} [level] to name a villager with its name
 */
export function formatStoryIssue(i, level) {
  const o = i.id ? level?.objects?.find((x) => x?.id === i.id) : null;
  const who = !i.id ? sm('issue.level') : o?.type === 'npc' && text(o.name) ? sm('issue.npc', { id: i.id, name: text(o.name) }) : `${o?.type ?? sm('issue.object')} ${i.id}`;
  return sm('issue.line', { who, field: i.field, line: i.line, msg: i.msg });
}
