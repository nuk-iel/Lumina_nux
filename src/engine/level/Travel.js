/**
 * Travel between the levels of a campaign (docs/specs/CAMPAIGN_FORMAT.md): the `exit` and
 * `entrance` objects of a level and the story conditions every object may carry (`when` /
 * `unless`, docs/specs/STORY_SCRIPT.md §2), read the same way by the game, the editor and the level
 * checker. Node-safe (no DOM, no three.js): the generators and `tools/check-level.mjs` import it.
 */
// (the small condition module, not the script parser StoryScript.js: every level loads this file)
import { cachedCondition, evalCondition, flagCondition, parseCondition, conditionRefs } from './StoryCondition.js';
import { presenceCondition, canHoldTogether } from './StoryStates.js';
import { lm } from './messages.js';

/**
 * @import { Level, LevelObject, LevelObjectOf } from './types.js'
 * @import { RefReader } from './StoryCondition.js'
 */

/**
 * Object types whose `when` / `unless` the game applies **live** — the object comes and goes while
 * the player is in the level, as the story changes: the logic markers (looked up when used), the
 * villagers, every prop — houses, windmills, wells and waterfalls too (World's story groups) —,
 * critters (Critters.applyStory), particle areas and the combat objects (enemy groups, chests,
 * waystones: every one loaded and warmed, the absent ones out of play — CombatSystem.applyPresence),
 * and the interior furniture (World's story groups, like any prop): since 2026-10-07 every type of
 * the catalog. A type added later follows its conditions when the level is entered until it is
 * listed here (docs/specs/STORY_SCRIPT.md §9.5).
 */
export const LIVE_STORY_TYPES = new Set([
  'npc', 'exit', 'entrance', 'event', 'marker', 'region',
  'marketStall', 'tree', 'rock', 'haystack', 'bench', 'barrel', 'crate', 'crateStack', 'flowerbox', 'signpost',
  'fence', 'bridge', 'lamppost', 'wallTorch', 'campfire', 'light',
  'house', 'windmill', 'well', 'waterfall', 'critters', 'emitter',
  'enemy', 'chest', 'waystone',
  'bed', 'table', 'chair', 'shelf', 'hearth', 'counter', 'rug', 'staircase', 'wardrobe', 'wallWindow', 'sacks',
]);

/**
 * Does the object carry a story condition (`when` / `unless` with text)?
 * @param {LevelObject} o
 */
export function hasStoryCondition(o) {
  return !!(text(o?.when) || text(o?.unless));
}

/**
 * A story condition holds? — from a reader of the story's values (`StoryState.reader`). Reads the
 * flag rule of `when`, `unless`, `requires` and a chapter's `when` (`cachedCondition`: one bare name
 * is that flag); an event's `if` and a goal's `done` are `cachedScriptCondition`.
 * @param {RefReader} read
 * @returns {(cond: string) => boolean}
 */
export function conditionTester(read) {
  return (cond) => evalCondition(cachedCondition(cond), read);
}

/** A story flag / name field as trimmed text ('' for anything else). */
const text = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * An entrance's name: its `name`, else its id.
 * @param {LevelObject} o an `entrance` object
 * @returns {string}
 */
export function entranceName(o) {
  return text(o?.name) || String(o?.id ?? '');
}

/**
 * The level's entrances, in object order.
 * @param {Level} level
 * @returns {LevelObjectOf<'entrance'>[]}
 */
export function levelEntrances(level) {
  return /** @type {LevelObjectOf<'entrance'>[]} */ ((level?.objects ?? []).filter((o) => o?.type === 'entrance'));
}

/**
 * The level's exits, in object order.
 * @param {Level} level
 * @returns {LevelObjectOf<'exit'>[]}
 */
export function levelExits(level) {
  return /** @type {LevelObjectOf<'exit'>[]} */ ((level?.objects ?? []).filter((o) => o?.type === 'exit'));
}

/**
 * The entrance of `level` called `name` (`entranceName`), or null — with `holds`, only one the
 * story has there now (story variants of an entrance may share its name).
 * @param {Level} level
 * @param {string} name
 * @param {(cond: string) => boolean} [holds]
 * @returns {LevelObjectOf<'entrance'>|null}
 */
export function findEntrance(level, name, holds) {
  const n = text(name);
  if (!n) return null;
  return levelEntrances(level).find((o) => entranceName(o) === n && (!holds || storyAllows(o, holds))) ?? null;
}

/**
 * Is world point (x, z) inside the exit's rectangle?
 * @param {LevelObject} o an `exit` object
 * @param {number} x
 * @param {number} z
 */
export function inExit(o, x, z) {
  return x >= o.minX && x < o.maxX && z >= o.minZ && z < o.maxZ;
}

/**
 * Is the object there as the story stands? `when`: only while that condition holds; `unless`: gone
 * while it holds (blank: no condition). A bare flag name is that flag (STORY_SCRIPT.md §2).
 * @param {LevelObject} o
 * @param {(cond: string) => boolean} holds does a story condition hold (`conditionTester`; a
 *   `has(flag)` function serves for levels whose conditions are bare flag names)
 */
export function storyAllows(o, holds) {
  const when = text(o?.when);
  const unless = text(o?.unless);
  return (!when || holds(when)) && (!unless || !holds(unless));
}
/**
 * The level as the story has it on entering: a shallow copy whose `objects` keep what the story
 * allows now — and, with `live`, every object of a `LIVE_STORY_TYPES` type whatever its conditions
 * (the game shows and hides those as the story changes). The same object when nothing is dropped.
 * @template {Level} L
 * @param {L} level
 * @param {(cond: string) => boolean} holds
 * @param {{ live?: boolean }} [opts]
 * @returns {L}
 */
export function applyStory(level, holds, { live = false } = {}) {
  const objects = level.objects.filter((o) => (live && LIVE_STORY_TYPES.has(o?.type)) || storyAllows(o, holds));
  return objects.length === level.objects.length ? level : { ...level, objects };
}
/**
 * The story flags / variables a level's object fields read or write: every object's `when` /
 * `unless`, exits' `requires` (the flag rule: one bare name is that flag), events' `if` (a
 * condition as scripts write it) (read); villagers' `flag` (set). Scripts are read by
 * `levelStoryRefs` (StoryChecks.js).
 * @param {Level} level
 * @returns {{ reads: Set<string>, sets: Set<string> }}
 */
export function storyFlags(level) {
  const reads = new Set();
  const sets = new Set();
  for (const o of level?.objects ?? []) {
    const fields = [[o?.when, true], [o?.unless, true], [o?.type === 'exit' ? o.requires : '', true], [o?.type === 'event' ? o.if : '', false]];
    for (const [f, flagRule] of fields) {
      if (!text(f)) continue;
      for (const { ref, value } of conditionRefs(flagRule ? flagCondition(f) : parseCondition(f).cond)) {
        if (ref.kind === '') reads.add(ref.name);
        if (typeof value === 'string' && ref.kind === '') reads.add(value);
      }
    }
    if (o?.type === 'npc' && text(o.flag)) sets.add(text(o.flag));
  }
  return { reads, sets };
}

/**
 * Can two objects never be there at the same time — can their conditions (`when` and not `unless`)
 * never hold together in any story? `when: bridge-mended` and `unless: bridge-mended`; `x` and
 * `not x`; `a and b` and `unless: a`; `hour >= 20` and `hour < 6`; `day > 2` and `day < 3` (whole
 * numbers); `stage:q >= bridge-fixed` and `stage:q < bridge-fixed`; `visited:mill` and
 * `unless: visited:mill = 1`; `quest:q = done` and `quest:q = active` (StoryStates.js
 * `canHoldTogether`: every combination of the tests the two make that one story can produce).
 * Story variants of one thing (an entrance moved by the story, a bridge and the wreckage it
 * replaces) are. When more than 12 of their tests depend on each other, only one's `when` being
 * the other's `unless` (or the same condition with `not`) counts.
 * @param {LevelObject} a
 * @param {LevelObject} b
 */
export function storyExclusive(a, b) {
  const ca = presenceCondition(a);
  const cb = presenceCondition(b);
  if (!ca && !cb) return false;
  const both = canHoldTogether([ca, cb]);
  if (both !== null) return !both;
  const aw = text(a?.when);
  const au = text(a?.unless);
  const bw = text(b?.when);
  const bu = text(b?.unless);
  const not = (s) => (s.toLowerCase().startsWith('not ') ? s.slice(4).trim() : `not ${s}`);
  return !!((aw && (aw === bu || not(aw) === bw)) || (au && (au === bw || not(au) === bu)));
}

/**
 * Problems with the level's exits and entrances that need no campaign to find (the editor's
 * "Check for problems"; `tools/lib/levelcheck.mjs` checks the walk, a campaign check the links):
 * an exit without a target or over no walkable tile, two entrances with one name, an entrance off
 * the map or off walkable ground.
 * @param {Level} level
 * @returns {string[]}
 */
export function travelIssues(level) {
  const out = [];
  const walkTile = (i, j) => {
    const d = level.legend?.[level.tiles?.[j]?.[i]];
    return !!d && !d.void && !d.water && d.walkable !== false;
  };
  for (const o of levelExits(level)) {
    if (!text(o.to)) out.push(lm('travel.exitNowhere', { id: o.id }));
    let walk = false;
    for (let j = Math.max(0, Math.floor(o.minZ)); j < Math.min(level.depth, Math.ceil(o.maxZ)) && !walk; j++) {
      for (let i = Math.max(0, Math.floor(o.minX)); i < Math.min(level.width, Math.ceil(o.maxX)) && !walk; i++) walk = walkTile(i, j);
    }
    if (!walk) out.push(lm('travel.exitNoGround', { id: o.id }));
  }
  /** @type {Map<string, LevelObject[]>} entrances by name */
  const seen = new Map();
  for (const o of levelEntrances(level)) {
    const n = entranceName(o);
    const same = seen.get(n) ?? [];
    // (two story variants of one entrance — never there together — may share a name)
    const clash = same.find((e) => !storyExclusive(e, o));
    if (clash) out.push(lm('travel.entranceClash', { a: clash.id, b: o.id, name: n }));
    seen.set(n, [...same, o]);
    if (!(o.x >= 0 && o.z >= 0 && o.x < level.width && o.z < level.depth)) out.push(lm('travel.entranceOutside', { name: n }));
    else if (!walkTile(Math.floor(o.x), Math.floor(o.z))) out.push(lm('travel.entranceUnwalkable', { name: n }));
  }
  return out;
}
