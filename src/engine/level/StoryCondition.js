/**
 * The condition half of the story language (docs/specs/STORY_SCRIPT.md §3): **conditions**
 * (`bridge-mended`, `not refused and item:plank >= 3`, `quest:find-ilse = active`,
 * `hour >= 20 or hour < 6`), the **names** of the story (`isStoryName`, `isFlagName`,
 * `RESERVED_WORDS`), whether a script field holds anything (`scriptLines`, `hasScript`) and the ids of
 * a story file's events and quest stages (`eventIdOf`, `stageIdOf`).
 *
 * Split from StoryScript.js (the script parser, which re-exports everything here) so that what
 * every level loads — `when` / `unless` (Travel.js), `levelHasStory` (ObjectCatalog.js), the
 * campaign files — carries only this small module; the parser comes with the story runtime.
 *
 * Node-safe (no DOM, no three.js), no imports. Untrusted input: nothing is evaluated as code,
 * conditions are capped in length and depth.
 */

/**
 * How the errors of a condition are worded: in English here; messages.js installs the page's
 * language (`setConditionWording`, strings.js `cond.<key>`), so this module imports nothing. The
 * wording returns undefined for a key it does not word (English, Japanese): the English stays.
 * @type {(key: string, vars: Record<string, any>) => string|undefined}
 */
let wording = () => undefined;

/**
 * Install the wording of the condition errors (messages.js does, when it loads).
 * @param {(key: string, vars: Record<string, any>) => string|undefined} fn
 */
export function setConditionWording(fn) {
  wording = fn;
}

/**
 * A condition error: `en` unless the wording words `key`.
 * @param {string} key @param {string} en @param {Record<string, any>} [vars]
 */
const say = (key, en, vars = {}) => wording(key, vars) ?? en;

// =================================================================================================
// Names
// =================================================================================================

/**
 * A parsed condition.
 * @typedef {{ op: 'or'|'and', a: Cond, b: Cond }
 *   | { op: 'not', a: Cond }
 *   | { op: 'ref', ref: Ref }
 *   | { op: 'cmp', ref: Ref, cmp: Cmp, value: number|string }
 *   | { op: 'const', value: boolean }} Cond
 */

/**
 * What a condition reads: `kind` '' is a flag / variable (`name`), the other kinds name a thing
 * (`item:plank`, `quest:find-ilse`, `party:sela`) or a value of the game (`hour`, `gold`, `party`
 * …: `kind` 'game').
 * @typedef {{ kind: RefKind, name: string }} Ref
 * @typedef {'' | 'item' | 'quest' | 'stage' | 'visits' | 'visited' | 'done' | 'party' | 'game'} RefKind
 * @typedef {'=' | '!=' | '<' | '<=' | '>' | '>='} Cmp
 */

/**
 * Prefixes of `kind:name` references. `party:<who>` is 1 while that villager (its id, actor or
 * name, in any case) is a member of the player's party, else 0 (docs/specs/PARTY.md §7.2).
 */
export const REF_KINDS = /** @type {const} */ (['item', 'quest', 'stage', 'visits', 'visited', 'done', 'party']);

/**
 * Values of the game a condition reads by a bare word: the hour of day, the day (1 on a new game,
 * +1 at every midnight), the player's gold, the chapter in force, the level (base id), the weather,
 * — in a villager's talk — how many times the player talked to them before, and how many members
 * the player's party has (`party >= 2`; docs/specs/PARTY.md §7.2).
 */
export const GAME_REFS = /** @type {const} */ (['hour', 'day', 'gold', 'chapter', 'level', 'weather', 'visits', 'party']);

/**
 * Words no flag or variable may be called: the game values, the condition words and words kept for
 * later versions (a name that a later version gives a meaning would silently change — `party` was
 * one until it became a game value).
 */
export const RESERVED_WORDS = new Set([...GAME_REFS, 'and', 'or', 'not', 'true', 'false', 'ending', 'self', 'random', 'player', 'time', 'none']);

/** States of a quest (`quest:<id>`). */
export const QUEST_STATES = /** @type {const} */ (['none', 'active', 'done', 'failed']);

/** Kinds whose value is text (compared to a word); every other reference is a number. */
const TEXT_REFS = new Set(['quest', 'game:chapter', 'game:level', 'game:weather']);
/** Is a reference's value text (quest state, chapter, level, weather) rather than a number? @param {Ref} r */
export const isTextRef = (r) => TEXT_REFS.has(r.kind) || TEXT_REFS.has(`${r.kind}:${r.name}`);

const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
/** A number of the language: plain decimals (`3`, `-2`, `0.5`, `.5`). */
const NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/;
/** A number written with an exponent (`1e3`, `2.5E-1`): neither a number of the language nor a name. */
const EXP_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)[eE][+-]?\d+$/;
const CMP_OPS = new Set(['=', '==', '!=', '<', '<=', '>', '>=']);

/**
 * The value of a plain decimal number (`3`, `-2.5`, `.5`), NaN for any other word (`1e3`, `0x10`,
 * `Infinity` are no numbers of the story language).
 * @param {unknown} w
 * @returns {number}
 */
export function plainNumber(w) {
  return typeof w === 'string' && NUMBER.test(w) ? Number(w) : NaN;
}

/**
 * Is `s` a usable id (an item, quest, stage, script, actor, object, level or key): letters,
 * digits, `_ . -`, not a number (plain or with an exponent: `3`, `1e3`), at most 80 characters?
 * @param {unknown} s
 * @returns {s is string}
 */
export function isStoryName(s) {
  return typeof s === 'string' && s.length <= 80 && NAME.test(s) && !NUMBER.test(s) && !EXP_NUMBER.test(s);
}

/**
 * Is `s` a usable flag / variable name (`isStoryName`, and not a reserved word)?
 * @param {unknown} s
 * @returns {s is string}
 */
export function isFlagName(s) {
  return isStoryName(s) && !RESERVED_WORDS.has(s.toLowerCase());
}

// =================================================================================================
// Conditions
// =================================================================================================

/**
 * Split a condition into tokens: names (with an optional `kind:`), numbers, `( ) ! && ||` and the
 * comparison operators.
 * @param {string} s
 * @returns {{ tokens: string[], error: string }}
 */
function tokenize(s) {
  const tokens = [];
  let k = 0;
  while (k < s.length) {
    const c = s[k];
    if (c === ' ' || c === '\t') { k++; continue; }
    if (c === '(' || c === ')') { tokens.push(c); k++; continue; }
    const two = s.slice(k, k + 2);
    if (two === '&&' || two === '||' || two === '<=' || two === '>=' || two === '!=' || two === '==') { tokens.push(two); k += 2; continue; }
    if (c === '<' || c === '>' || c === '=' || c === '!') { tokens.push(c); k++; continue; }
    const m = /^-?[A-Za-z0-9_.][A-Za-z0-9_.-]*(:[A-Za-z0-9_][A-Za-z0-9_.-]*)?/.exec(s.slice(k));
    if (!m) return { tokens, error: say('badChar', `"${c}" cannot be in a condition`, { c }) };
    tokens.push(m[0]);
    k += m[0].length;
  }
  return { tokens, error: '' };
}

/**
 * A reference as written (`gold`, `item:plank`, `deliveries`) → Ref, or an error text.
 * @param {string} t
 * @returns {Ref|string}
 */
export function parseRef(t) {
  const colon = t.indexOf(':');
  if (colon >= 0) {
    const kind = t.slice(0, colon);
    const name = t.slice(colon + 1);
    if (!REF_KINDS.includes(/** @type {any} */ (kind))) {
      const kinds = REF_KINDS.map((x) => `${x}:`).join(', ');
      return say('unknownKind', `unknown kind "${kind}:" (use ${kinds})`, { kind, kinds });
    }
    if (!isStoryName(name)) return say('notName', `"${name}" is not a name`, { v: name });
    return { kind: /** @type {RefKind} */ (kind), name };
  }
  if (NUMBER.test(t)) return say('numberAlone', `a number (${t}) cannot stand alone`, { v: t });
  if (EXP_NUMBER.test(t)) return say('exponent', `"${t}" is a number with an exponent — numbers are plain decimals (1000, 0.5)`, { v: t });
  if (!isStoryName(t)) return say('notName', `"${t}" is not a name`, { v: t });
  const low = t.toLowerCase();
  if (GAME_REFS.includes(/** @type {any} */ (low))) return { kind: 'game', name: low };
  if (RESERVED_WORDS.has(low)) return say('reservedFlag', `"${t}" is a reserved word (not a flag name)`, { v: t });
  return { kind: '', name: t };
}

/**
 * The value on the right of a comparison: a number; `true` / `false` (1 / 0); a quest state; a
 * word for the text values (chapter, level, weather); a stage name; else a variable's name. A
 * reserved word or a game value there is an error (`gold >= day` cannot compare two game values).
 * @param {Ref} ref
 * @param {string} t the reference as written (for messages)
 * @param {Cmp} cmp
 * @param {string} v
 * @returns {number|string}
 */
function rightValue(ref, t, cmp, v) {
  const text = isTextRef(ref);
  if (NUMBER.test(v)) {
    if (text) throw new Error(say('comparedToWord', `${t} is compared to a word, not a number`, { ref: t }));
    return Number(v);
  }
  if (EXP_NUMBER.test(v)) throw new Error(say('exponent', `"${v}" is a number with an exponent — numbers are plain decimals (1000, 0.5)`, { v }));
  if (!isStoryName(v)) throw new Error(say('notValue', `"${v}" is not a value`, { v }));
  if (ref.kind === 'quest' && !QUEST_STATES.includes(/** @type {any} */ (v))) throw new Error(say('questState', `a quest is ${QUEST_STATES.join(', ')} — not "${v}"`, { states: QUEST_STATES.join(', '), v }));
  if (text) {
    if (cmp !== '=' && cmp !== '!=') throw new Error(say('eqOnly', `${t} can only be compared with = or !=`, { ref: t }));
    return v;
  }
  // (a stage reference compares with a stage name, whatever it is called)
  if (ref.kind === 'stage') return v;
  const low = v.toLowerCase();
  if (low === 'true') return 1;
  if (low === 'false') return 0;
  if (GAME_REFS.includes(/** @type {any} */ (low))) throw new Error(say('gameValueRight', `"${v}" is a game value — on the right of a comparison write a number, true / false or a variable name (two game values cannot be compared)`, { v }));
  if (RESERVED_WORDS.has(low)) throw new Error(say('reservedRight', `"${v}" is a reserved word — on the right of a comparison write a number, true / false or a variable name`, { v }));
  return v;
}

/**
 * Parse a condition. An empty text is "always" (`{ op: 'const', value: true }`); `true` / `false`
 * standing alone are constants.
 * @param {unknown} text
 * @returns {{ cond: Cond, error: string }}
 */
export function parseCondition(text) {
  const src = typeof text === 'string' ? text.trim() : '';
  if (!src) return { cond: { op: 'const', value: true }, error: '' };
  if (src.length > 500) return { cond: { op: 'const', value: false }, error: say('tooLong', 'condition longer than 500 characters', { max: 500 }) };
  const { tokens, error } = tokenize(src);
  if (error) return { cond: { op: 'const', value: false }, error };
  let k = 0;
  let depth = 0;
  const peek = () => tokens[k];
  const word = (w) => tokens[k] !== undefined && tokens[k].toLowerCase() === w;
  /** @returns {Cond} */
  const parseOr = () => {
    let a = parseAnd();
    while (word('or') || peek() === '||') { k++; a = { op: 'or', a, b: parseAnd() }; }
    return a;
  };
  /** @returns {Cond} */
  const parseAnd = () => {
    let a = parseNot();
    while (word('and') || peek() === '&&') { k++; a = { op: 'and', a, b: parseNot() }; }
    return a;
  };
  /** @returns {Cond} */
  const parseNot = () => {
    if (word('not') || peek() === '!') {
      k++;
      if (++depth > 32) throw new Error(say('tooDeep', 'nested too deeply'));
      const a = parseNot();
      depth--;
      return { op: 'not', a };
    }
    return parseAtom();
  };
  /** @returns {Cond} */
  const parseAtom = () => {
    const t = peek();
    if (t === undefined) throw new Error(say('endsEarly', 'the condition ends too early'));
    if (t === '(') {
      k++;
      if (++depth > 32) throw new Error(say('tooDeep', 'nested too deeply'));
      const a = parseOr();
      depth--;
      if (peek() !== ')') throw new Error(say('parenMissing', 'a ")" is missing'));
      k++;
      return a;
    }
    if (t === ')' || CMP_OPS.has(t) || t === '&&' || t === '||' || t === '!') throw new Error(say('unexpected', `unexpected "${t}"`, { t }));
    if (word('and') || word('or')) throw new Error(say('unexpected', `unexpected "${t}"`, { t }));
    k++;
    const low = t.toLowerCase();
    if (low === 'true' || low === 'false') {
      const op = peek();
      if (op !== undefined && CMP_OPS.has(op)) throw new Error(say('cannotCompare', `"${t}" cannot be compared (it is always ${low})`, { t, low }));
      return { op: 'const', value: low === 'true' };
    }
    const ref = parseRef(t);
    if (typeof ref === 'string') throw new Error(ref);
    const op = peek();
    if (op !== undefined && CMP_OPS.has(op)) {
      k++;
      const v = peek();
      if (v === undefined || v === '(' || v === ')' || CMP_OPS.has(v) || v === '&&' || v === '||') throw new Error(say('valueMissing', `a value is missing after "${op}"`, { op }));
      k++;
      const cmp = /** @type {Cmp} */ (op === '==' ? '=' : op);
      return { op: 'cmp', ref, cmp, value: rightValue(ref, t, cmp, v) };
    }
    return { op: 'ref', ref };
  };
  try {
    const cond = parseOr();
    if (k < tokens.length) throw new Error(say('unexpected', `unexpected "${tokens[k]}"`, { t: tokens[k] }));
    return { cond, error: '' };
  } catch (err) {
    return { cond: { op: 'const', value: false }, error: err.message };
  }
}

/**
 * Is a field's text one bare name (`bridge-mended`, `gold`) — what the flag rule of
 * `flagCondition` always reads as that flag?
 * @param {string} src trimmed text
 */
export function isBareName(src) {
  return src.length <= 500 && NAME.test(src) && !NUMBER.test(src);
}

/**
 * A story field written before conditions existed — `when`, `unless`, an exit's `requires`, a
 * chapter's `when` (the **flag rule**): one bare name is that flag (always — even a word conditions
 * reserve, such as `gold`: the checks report that as an error, since such a flag can never be set);
 * anything else is parsed as a condition, and when it does not parse (a flag name with spaces) it
 * is taken as that literal flag name (the checks report it as an error with the fix). Every other
 * condition — a script's `if`, an event's `if`, a quest goal's `done` — is `parseCondition`.
 * @param {unknown} text
 * @returns {Cond}
 */
export function flagCondition(text) {
  const src = typeof text === 'string' ? text.trim() : '';
  if (!src) return { op: 'const', value: true };
  // one bare name is always a flag — also a word conditions reserve (`gold`, `level`): what it meant
  if (isBareName(src) && !src.includes(':')) return { op: 'ref', ref: { kind: '', name: src } };
  const { cond, error } = parseCondition(src);
  return error ? { op: 'ref', ref: { kind: '', name: src } } : cond;
}

/** Parsed conditions by text (the triggers re-evaluate conditions every frame: parse once). @type {Map<string, Cond>} */
const condCache = new Map();
/** @type {Map<string, Cond>} */
const scriptCondCache = new Map();

/**
 * `flagCondition` (the flag rule: `when`, `unless`, `requires`, a chapter's `when`), cached by text
 * (at most 4 096 entries).
 * @param {unknown} text
 * @returns {Cond}
 */
export function cachedCondition(text) {
  const src = typeof text === 'string' ? text : '';
  let c = condCache.get(src);
  if (!c) {
    if (condCache.size >= 4096) condCache.clear();
    c = flagCondition(src);
    condCache.set(src, c);
  }
  return c;
}

/**
 * `parseCondition` (a condition as scripts write it: an event's `if`, a campaign event's `if`, a
 * quest goal's `done` — `if: gold` reads the purse), cached by text (at most 4 096 entries). A
 * condition that does not parse never holds (`{ op: 'const', value: false }`).
 * @param {unknown} text
 * @returns {Cond}
 */
export function cachedScriptCondition(text) {
  const src = typeof text === 'string' ? text : '';
  let c = scriptCondCache.get(src);
  if (!c) {
    if (scriptCondCache.size >= 4096) scriptCondCache.clear();
    c = parseCondition(src).cond;
    scriptCondCache.set(src, c);
  }
  return c;
}

/**
 * What the references of a condition read now.
 *  - `get`: a reference's value — a number, or a text for quest states, the chapter, the level and
 *    the weather. A `stage:<quest>` reference is the number of the quest's current stage.
 *  - `word` (optional): the value a word on the right of a comparison stands for — a stage name its
 *    stage number, a variable name its value (`gold >= inn.price`); without it the word is compared
 *    as text.
 *  - `text` (optional): what `${…}` shows for a reference (`interpolate`) — asked for `stage:` and
 *    `quest:` references (`${stage:find-ilse}`: the stage reached, by its id, not its number);
 *    undefined: the value of `get`.
 * @typedef {{ get: (ref: Ref) => number|string, word?: (ref: Ref, word: string) => number|string,
 *   text?: (ref: Ref) => string|undefined }} RefReader
 */

/** Is a value "true" (a reference standing alone): a non-zero number, a text other than '' / 'none'. */
const truthy = (v) => (typeof v === 'number' ? v !== 0 : v !== '' && v !== 'none' && v != null);

/**
 * Evaluate a condition.
 * @param {Cond} c
 * @param {RefReader} read
 * @returns {boolean}
 */
export function evalCondition(c, read) {
  switch (c.op) {
    case 'const': return c.value;
    case 'or': return evalCondition(c.a, read) || evalCondition(c.b, read);
    case 'and': return evalCondition(c.a, read) && evalCondition(c.b, read);
    case 'not': return !evalCondition(c.a, read);
    case 'ref': return truthy(read.get(c.ref));
    case 'cmp': {
      const v = read.get(c.ref);
      const w = typeof c.value === 'string' && read.word ? read.word(c.ref, c.value) : c.value;
      if (typeof v === 'number' && typeof w === 'number') {
        switch (c.cmp) {
          case '=': return v === w;
          case '!=': return v !== w;
          case '<': return v < w;
          case '<=': return v <= w;
          case '>': return v > w;
          case '>=': return v >= w;
          default: return false;
        }
      }
      if (c.cmp === '=') return String(v ?? '') === String(w);
      if (c.cmp === '!=') return String(v ?? '') !== String(w);
      return false;
    }
    default: return false;
  }
}

/**
 * Every reference a condition reads, with the word each is compared to (if any).
 * @param {Cond} c
 * @param {{ ref: Ref, value?: number|string }[]} [out]
 * @returns {{ ref: Ref, value?: number|string }[]}
 */
export function conditionRefs(c, out = []) {
  if (!c) return out;
  if (c.op === 'ref') out.push({ ref: c.ref });
  else if (c.op === 'cmp') out.push({ ref: c.ref, value: c.value });
  else if (c.op === 'not') conditionRefs(c.a, out);
  else if (c.op === 'and' || c.op === 'or') { conditionRefs(c.a, out); conditionRefs(c.b, out); }
  return out;
}

// =================================================================================================
// Script fields
// =================================================================================================

/**
 * A script field's lines: an array of strings (non-strings dropped; a string with line breaks is
 * split), a string split at line breaks, anything else none.
 * @param {unknown} v
 * @returns {string[]}
 */
export function scriptLines(v) {
  if (typeof v === 'string') return v.split(/\r?\n/);
  if (!Array.isArray(v)) return [];
  const out = [];
  // (a loop, not push(...lines): a hostile entry with a million line breaks must not overflow the stack)
  for (const x of v) if (typeof x === 'string') for (const l of x.split(/\r?\n/)) out.push(l);
  return out;
}

/**
 * An id as the name shown when the story declares none: 'ferry-lantern' → 'Ferry Lantern' (an item
 * a script gives, a quest it starts — StoryFormat, the story runtime and the content extractor
 * agree on it).
 * @param {string} id
 */
export function titleCase(id) {
  return id.split(/[-_.]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Does a script field hold anything to run (a line that is not blank or a comment)?
 * @param {unknown} v
 */
export function hasScript(v) {
  return scriptLines(v).some((l) => {
    const t = l.trim();
    return t && !t.startsWith('#');
  });
}

// =================================================================================================
// Story-file entry ids (read alike by the loader and the text keys)
// =================================================================================================

/** A plain object (not an array)? @param {unknown} v @returns {v is Record<string, unknown>} */
const isPlainEntry = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The id of entry `k` (0-based) of a story file's `events` list: its own `id` (a string), else
 * `event-<k + 1>`. The loader (StoryFormat.js, which re-exports it) and the text keys' carry
 * (TextKeys.js) read events by it — here, import-free, so the engine never imports the game.
 * @param {unknown} e the entry as written
 * @param {number} k
 * @returns {string}
 */
export const eventIdOf = (e, k) => (isPlainEntry(e) && typeof e.id === 'string' ? e.id : '') || `event-${k + 1}`;

/**
 * The id of stage `k` (0-based) of a quest's `stages` list: an entry's own `id` (a string), else
 * `<k + 1>` (a bare string is a stage's text). The loader (StoryFormat.js, which re-exports it) and
 * the text keys (a stage's key in the quest's `textKeys.stages`) read stages by it.
 * @param {unknown} s the entry as written
 * @param {number} k
 * @returns {string}
 */
export const stageIdOf = (s, k) => (isPlainEntry(s) && typeof s.id === 'string' ? s.id : '') || `${k + 1}`;
