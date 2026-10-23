/**
 * The editor's side of the content-text keys (docs/specs/I18N.md §4.2, §4.10). Keys are never
 * edited by hand: the inspector shows a text's key read-only (a monospace line under the field, with
 * a Copy button — `textRows`), Edit › *Find by text key…* finds the text that holds one
 * (`findTextKey`), and a script field and its pop-out show and compare the script without its
 * `#line:` tags. EditorState keeps the keys inside each edit's own transaction (so undo and redo
 * restore them), through these helpers:
 *
 * - `keyedState(o)` / `carryEdit(before, obj, …)`: `updateObject` — the fields an edit changed
 *   carry their keys from the object before it (TextKeys.carryObjectText); a field the edit did not
 *   touch keeps its keys exactly as they were, and so does a text of a changed field that has no key
 *   and that the edit left as it was (a keyless text of an old level stays keyless until *Assign
 *   text keys*: only the texts the edit changed or added get keys); no translatable field changed:
 *   nothing is done. A field whose texts were all cleared and come back gets its old keys again (the
 *   inspector's clear and retype; the memory follows an id rename). A key the edit brought in (a
 *   script line pasted with its `#line:` tag, a patch that writes `textKeys`) that another text of
 *   the level holds is not kept. An unchanged text keeps the key the document had when it was loaded
 *   rather than one minted since (a line duplicated above itself, then the top copy edited: the
 *   original keeps its key).
 *   **Copy-on-write** (§4.2 "one key, one English"; `shared`): a text whose English differs from
 *   what another file — the campaign's other level, story and campaign files, or the file a *Save
 *   As* copied the level from — holds under its key gets a new key (TextKeys' `shared` option); the
 *   other file keeps the shared key (and its translation). Each such split is remembered (`splits`):
 *   typed back to the other file's English, the text takes the shared key back while the level
 *   holds it nowhere else.
 * - `fillObjectKeys(o, …)`: `addObject`, `insertObjects` and *Assign text keys* — every text gets
 *   a key, a key already taken (in the level, or earlier in the object) is replaced; an object whose
 *   keys need nothing is left byte for byte. *Assign* first hands a key on texts of two Englishes to
 *   the copy another file holds it with (`preferSharedCopies`) and gives keyless texts the keys of
 *   the level they copy (`shareKeys`: a chapter variant's base, a campaign copy's shipped level).
 * - `carryRootEdit` / `fillRootKeys`: the level's own texts (`subtitle`, `environment.title.*`),
 *   with the same copy-on-write, split memory and cleared-text memory.
 * - `textKeyWarnings(level)`: *Check for problems* (missing, stray and repeated keys).
 *
 * Opening, saving, Save As, autosave, export and undo / redo never call these: a file opened and
 * saved unchanged stays byte for byte. Keys are minted by EditorState's minter (`randomGuid`, or
 * `seededMint(prefix)` after `__editor.seedTextKeys(prefix)`); `minter(base, used)` never gives a key
 * already in `used`. Level data is untrusted: keys are read only as own, well-formed GUIDs.
 */
import {
  TEXT_KEY_FIELDS, LEVEL_TEXT_FIELDS, LINE_TAG, cleanTextKeysOf, splitLineTag, tagLine, textPages, dialogueUnits, randomGuid,
  isGuid, textKeyOf, pageKeyOf, dialogueKeyOf, choiceKeyOf, builtinLabel,
} from '../engine/i18n/ContentKeys.js';
import { carryObjectText, carryRootText, levelKeys, levelTexts, scriptTextLines, textKeyIssues } from '../engine/i18n/TextKeys.js';
import { scriptLines } from '../engine/level/StoryScript.js';
import { tr, trn, commaList } from './i18n.js';

/** @import { Mint, KeyedText, SharedKeys } from '../engine/i18n/TextKeys.js' */

/**
 * A text another file holds under a key: that file (`millbrook`, `story/main.json`,
 * `campaign.json`, `public/levels/emberfall.json` …), its English (trimmed, as `TextKeys.levelTexts`
 * gives it) and where it is there.
 * @typedef {{ file: string, text: string, where: string }} OtherText
 */

/**
 * The texts other files hold under a key (undefined: none) — what copy-on-write compares an edit
 * with (`EditorState#sharedTexts`).
 * @typedef {(key: string) => readonly OtherText[]|undefined} SharedTexts
 */

/**
 * One keyed text of an object, as the inspector lists it (`textRows`): its field, where it is in
 * the field (`page`: the raw page / entry index; `choice`: a choice of a dialogue page; `line`: the
 * 1-based line of a script, as its field shows it), its key ('' when it has none) and its English.
 * @typedef {{ field: string, key: string, text: string, page?: number, choice?: number, line?: number }} TextRow
 */

/**
 * The state of an object's translatable fields before an edit (`keyedState`): its type and id,
 * each translatable field it holds (a copy) and its `textKeys` (a copy).
 * @typedef {{ type: string, id: string, textKeys?: unknown, [field: string]: unknown }} KeyedState
 */

/**
 * What an edit cleared (`carryEdit`): per `<id>\u0000<field>` the field's value and keys before —
 * typed again, the field gets them back. (The level's own texts: `RootDropped`.)
 * @typedef {Map<string, { value: unknown, keys: unknown }>} DroppedTexts
 */

/**
 * What an edit cleared of the level's own texts (`carryRootEdit`): per field (`subtitle`,
 * `title.*`) its text and key before — typed again, the field gets its key back.
 * @typedef {Map<string, { value: string, key: unknown }>} RootDropped
 */

/**
 * The copy-on-write splits of a document (`carryEdit`, `carryRootEdit`): new key → the shared key
 * its text gave up (another file holds that one with the text's old English).
 * @typedef {Map<string, string>} SplitKeys
 */

/**
 * What `carryEdit` reads and remembers besides the edit itself.
 * @typedef {object} CarryOptions
 * @property {{ objects: any[], textKeys?: unknown }} level the level (read only when a key may be
 *   taken elsewhere in it: an edit normally reads no other object)
 * @property {Mint} mint
 * @property {DroppedTexts} [dropped] the cleared fields (filled and read)
 * @property {SharedTexts|null} [shared] the other files' texts (copy-on-write)
 * @property {SplitKeys|null} [splits] the copy-on-write splits (filled and read)
 * @property {ReadonlySet<string>|null} [loaded] the keys the document had when it was loaded
 */

const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const hasOwn = (o, k) => isPlain(o) && Object.prototype.hasOwnProperty.call(o, k);
const ownOf = (o, k) => (hasOwn(o, k) ? o[k] : undefined);
/** A deep copy of JSON data (undefined stays undefined). */
const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/**
 * The translatable fields of an object type and their kinds (`TEXT_KEY_FIELDS`), or null.
 * @param {unknown} type
 * @returns {Readonly<Record<string, string>>|null}
 */
export function textFieldsOf(type) {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(TEXT_KEY_FIELDS, type)
    ? TEXT_KEY_FIELDS[/** @type {keyof typeof TEXT_KEY_FIELDS} */ (type)] : null;
}

/**
 * A minter for one edit: `base`'s keys, never one already in `used` (each key it gives is added)
 * nor one in `avoid` (keys a new key must not be, never added).
 * @param {Mint} base
 * @param {Set<string>} used
 * @param {ReadonlySet<string>|null} [avoid]
 * @returns {Mint}
 */
export function minter(base, used, avoid = null) {
  const free = (/** @type {string} */ k) => !used.has(k) && !avoid?.has(k);
  return (seed, info) => {
    for (let n = 0; n < 64; n++) {
      const k = base(seed, info);
      if (free(k)) { used.add(k); return k; }
    }
    // (a minter that keeps repeating itself: a random key never does)
    let k = randomGuid();
    while (!free(k)) k = randomGuid();
    used.add(k);
    return k;
  };
}

/**
 * The English other files hold under each of `keys` (`shared`; only the keys some file holds), as
 * TextKeys' `shared` option takes it: a text keeps such a key only while its English is one of
 * those (copy-on-write).
 * @param {SharedTexts|null|undefined} shared
 * @param {Iterable<unknown>} keys
 * @returns {Map<string, string[]>}
 */
export function sharedMap(shared, keys) {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  if (!shared) return out;
  for (const k of keys) {
    if (!isGuid(k) || out.has(/** @type {string} */ (k))) continue;
    const other = shared(/** @type {string} */ (k));
    if (other?.length) out.set(/** @type {string} */ (k), other.map((t) => t.text));
  }
  return out;
}

/**
 * Every key the level holds (objects' `textKeys`, script tags, its own `textKeys`), but those of
 * the objects in `except`.
 * @param {{ objects: any[], textKeys?: unknown }} level
 * @param {Set<object>} [except]
 * @returns {Set<string>}
 */
export function keySet(level, except) {
  const objects = except?.size ? level.objects.filter((o) => !except.has(o)) : level.objects;
  return new Set(levelKeys({ objects, textKeys: level.textKeys }).map((k) => k.key));
}

/**
 * The state of an object's translatable fields before an edit (null: its type has none).
 * @param {any} o
 * @returns {KeyedState|null}
 */
export function keyedState(o) {
  const fields = textFieldsOf(o?.type);
  if (!fields) return null;
  /** @type {KeyedState} */
  const s = { type: o.type, id: typeof o.id === 'string' ? o.id : '' };
  for (const f of Object.keys(fields)) if (hasOwn(o, f)) s[f] = copy(o[f]);
  if (hasOwn(o, 'textKeys')) s.textKeys = copy(o.textKeys);
  return s;
}

/**
 * Does a field hold a text a player reads?
 * @param {string} kind
 * @param {unknown} v
 */
function fieldHoldsText(kind, v) {
  if (kind === 'text') return typeof v === 'string' && v.trim() !== '';
  if (kind === 'lines') return textPages(v).length > 0;
  if (kind === 'dialogue') return v !== undefined && dialogueUnits(v).length > 0;
  return scriptLines(v).some((l) => splitLineTag(l).text.trim() !== '');
}

/** The tags a script holds. @param {unknown} v @returns {string[]} */
const scriptTags = (v) => scriptLines(v).map((l) => splitLineTag(l).tag).filter(Boolean);

/** The keys an object (or a `keyedState`) holds: its `textKeys` and its scripts' tags. @param {any} o */
const keysOf = (o) => new Set(levelKeys({ objects: [o] }).map((k) => k.key));

/**
 * Where a text is, without its place in the field (`elder › dialogue[2].choices[1]` →
 * `elder › dialogue`; `pip › talk:3` → `pip › talk`): its holder and field.
 * @param {string} where a `KeyedText`'s
 */
const fieldOf = (where) => where.replace(/(\[\d+\](\.choices\[\d+\])?|:\d+)$/, '');

/**
 * `updateObject`'s keys after an edit (`obj` changed in place): each field the edit changed keeps
 * the keys of the texts it continues (`carryObjectText` on that field), new and changed texts get
 * new keys where they have none, removed ones lose theirs — but a text of such a field that had no
 * key and that the edit left as it was stays keyless; fields it did not change keep their keys as
 * they were. A key the edit brought into a changed script field (a line pasted with its tag) that
 * another text of the level holds is not kept (the level's keys are read only then); `shared`
 * (copy-on-write, TextKeys' `shared` option): a text keeps a key another file holds only while its
 * English is the one there — each split remembered in `splits`, and a split text typed back to that
 * English takes the shared key back while the level holds it nowhere else; `loaded`: an unchanged
 * text keeps a key the document had at load rather than one minted since, when equal old texts
 * competed for it. An edit that wrote `textKeys` itself keeps them as written (only their
 * well-formed keys of the type's fields: `cleanTextKeysOf`) — unless it brought a key another text
 * of the level holds, or another file holds with other English: the object's keys are then filled
 * as *Assign text keys* fills them. A field cleared and typed again gets its old keys back
 * (`dropped`; an id rename takes the memory along). Returns whether anything was done.
 * @param {KeyedState} before `keyedState(obj)` taken before the edit
 * @param {any} obj
 * @param {CarryOptions} o
 * @returns {boolean}
 */
export function carryEdit(before, obj, { level, mint, dropped, shared = null, splits = null, loaded = null }) {
  const fields = textFieldsOf(obj?.type);
  if (!fields || obj.type !== before.type) {
    // (a type change: what the new type holds is filled in)
    if (!fields) { if (hasOwn(obj, 'textKeys')) { delete obj.textKeys; return true; } return false; }
    const taken = keySet(level, new Set([obj]));
    return fillObjectKeys(obj, { mint: minter(mint, taken), used: taken });
  }
  const id = typeof obj.id === 'string' ? obj.id : '';
  // (renamed: the fields it cleared are remembered under its new id)
  if (dropped && before.id !== id) moveDropped(dropped, before.id, id);
  if (JSON.stringify(ownOf(obj, 'textKeys')) !== JSON.stringify(before.textKeys)) {
    // (written by the edit: its well-formed keys of the type's fields, unless one is held elsewhere — below)
    const { keys } = cleanTextKeysOf(obj.type, ownOf(obj, 'textKeys'));
    if (keys) obj.textKeys = keys;
    else delete obj.textKeys;
    // …and never a key it brought that another text of the level holds (or another file holds with
    // other English): then the object is filled as Assign fills it
    const had = keysOf(before);
    const fresh = [...keysOf(obj)].filter((k) => !had.has(k));
    if (fresh.length) {
      const taken = keySet(level, new Set([obj]));
      const sh = sharedMap(shared, fresh);
      const clash = fresh.some((k) => taken.has(k))
        || (sh.size > 0 && levelTexts({ objects: [obj] }).some((t) => sh.has(t.key) && !sh.get(t.key).includes(t.text)));
      if (clash) fillObjectKeys(obj, { mint: minter(mint, taken), used: taken, shared: sh });
    }
    return true;
  }
  const changed = Object.keys(fields).filter((f) => JSON.stringify(ownOf(obj, f)) !== JSON.stringify(before[f]));
  // (most edits — a move, a turn, a rename, a field that holds no text — end here)
  if (!changed.length) return false;
  const oldKeys = isPlain(before.textKeys) ? /** @type {Record<string, unknown>} */ (before.textKeys) : {};
  // the edit's own fields: before and after, keys of the fields it left alone out of reach
  /** @type {Record<string, any>} */
  const was = { type: obj.type, id, textKeys: {} };
  /** @type {Record<string, any>} */
  const now = { type: obj.type, id };
  let restored = false;
  for (const f of changed) {
    const kind = fields[f];
    let value = before[f];
    let keys = ownOf(oldKeys, f);
    const had = fieldHoldsText(kind, value);
    const has = fieldHoldsText(kind, ownOf(obj, f));
    if (dropped) {
      const slot = `${id}\u0000${f}`;
      // cleared: remembered; typed again: its old texts and keys come back to be carried
      if (had && !has) dropped.set(slot, { value: copy(value), keys: copy(keys) });
      else if (!had && has && dropped.has(slot)) {
        const m = dropped.get(slot);
        dropped.delete(slot);
        value = m.value;
        keys = m.keys;
        restored = true;
      }
    }
    // (copies: the keyless texts get stand-ins below)
    if (value !== undefined) was[f] = copy(value);
    if (keys !== undefined) was.textKeys[f] = copy(keys);
    if (hasOwn(obj, f)) now[f] = obj[f];
  }
  // the keys a changed script brought in (a line pasted with its tag), the object did not hold
  const fresh = new Set(changed.filter((f) => fields[f] === 'script').flatMap((f) => scriptTags(now[f])));
  if (fresh.size) for (const k of keysOf(before)) fresh.delete(k);
  // the level's keys but this object's: read only when a key may be taken there (an edit reads no
  // other object otherwise — a key is new, or this object's own)
  /** @type {Set<string>|null} */
  let others = null;
  const othersOf = () => (others ??= keySet(level, new Set([obj])));
  // taken: the keys of the object's untouched fields; those the edit brought in that the level holds
  // elsewhere; and, when cleared keys come back, every key of the level but this object's (a paste
  // may hold them now)
  const used = restored ? new Set(othersOf()) : new Set();
  for (const k of fresh) if (othersOf().has(k)) used.add(k);
  const rest = { type: obj.type, id, textKeys: {} };
  for (const [f, kind] of Object.entries(fields)) {
    if (changed.includes(f)) continue;
    if (kind === 'script') { if (hasOwn(obj, f)) rest[f] = obj[f]; } else if (hasOwn(oldKeys, f)) rest.textKeys[f] = oldKeys[f];
  }
  for (const k of levelKeys({ objects: [rest] })) used.add(k.key);
  // the texts before, their English by key, and the field each key was in
  const wasTexts = levelTexts({ objects: [was] });
  /** @type {Map<string, { text: string, field: string }>} */
  const old = new Map();
  for (const t of wasTexts) if (t.key && !old.has(t.key)) old.set(t.key, { text: t.text, field: fieldOf(t.where) });
  // copy-on-write: the English other files hold under the keys in play (the old ones, those brought in)
  const sh = sharedMap(shared, [...old.keys(), ...fresh]);
  const cow = [...sh.keys()];
  // a keyless text stays keyless while the edit leaves it as it is: it gets a stand-in key that only
  // a text with its very English keeps (copy-on-write's rule), dropped again after the carry
  /** @type {Set<string>} */
  const holes = new Set();
  for (const t of wasTexts) {
    if (t.key) continue;
    let p = randomGuid();
    while (holes.has(p) || old.has(p)) p = randomGuid();
    holes.add(p);
    t.set(p);
    sh.set(p, [t.text]);
  }
  // (the split memory needs the carry without copy-on-write too: its inputs, kept)
  const dry = splits && cow.some((k) => old.has(k)) ? { now: copy(now), used: new Set(used) } : null;
  carryObjectText(was, now, minter(mint, used), used, sh.size ? { shared: sh } : {});
  const texts = levelTexts({ objects: [now] });
  if (dry) rememberSplits(was, dry, texts, old, cow, holes, sh, splits);
  if (loaded) preferLoaded(texts, old, loaded, holes, sh, used);
  if (splits?.size) takeBack(texts, splits, shared, used, othersOf);
  if (holes.size) dropKeys(now, holes);
  // the changed fields' keys merged into the object's, in place (the others untouched)
  const keys = isPlain(obj.textKeys) ? obj.textKeys : {};
  for (const f of changed) {
    if (fields[f] === 'script') { if (hasOwn(now, f)) obj[f] = now[f]; continue; }
    const k = ownOf(now.textKeys, f);
    if (k !== undefined) keys[f] = k;
    else delete keys[f];
  }
  if (Object.keys(keys).length) obj.textKeys = keys;
  else if (hasOwn(obj, 'textKeys')) delete obj.textKeys;
  return true;
}

/**
 * Move what a renamed object cleared (`DroppedTexts` under `from`) to its new id.
 * @param {DroppedTexts} dropped
 * @param {string} from
 * @param {string} to
 */
function moveDropped(dropped, from, to) {
  for (const [slot, m] of [...dropped]) {
    const at = slot.lastIndexOf('\u0000');
    if (slot.slice(0, at) !== from) continue;
    dropped.delete(slot);
    dropped.set(`${to}\u0000${slot.slice(at + 1)}`, m);
  }
}

/**
 * Remember the copy-on-write splits of a carry (`splits`: new key → the shared key its text gave
 * up): the old keys another file holds (`cow`) that no text keeps now went, without copy-on-write,
 * to the text at the same place in a dry run of the carry (`dry`: its inputs) — that text's key now
 * is the split one.
 * @param {Record<string, any>} was
 * @param {{ now: Record<string, any>, used: Set<string> }} dry
 * @param {KeyedText[]} texts the texts after the carry
 * @param {Map<string, { text: string, field: string }>} old
 * @param {string[]} cow
 * @param {Set<string>} holes
 * @param {Map<string, string[]>} sh
 * @param {SplitKeys} splits
 */
function rememberSplits(was, dry, texts, old, cow, holes, sh, splits) {
  const kept = new Set(texts.map((t) => t.key));
  const gone = new Set(cow.filter((k) => old.has(k) && !kept.has(k)));
  if (!gone.size) return;
  // (the stand-ins of keyless texts keep their rule: the dry run differs only in copy-on-write)
  const stand = new Map([...holes].map((p) => [p, /** @type {string[]} */ (sh.get(p))]));
  carryObjectText(was, dry.now, () => randomGuid(), dry.used, stand.size ? { shared: stand } : {});
  levelTexts({ objects: [dry.now] }).forEach((d, i) => {
    const t = texts[i];
    if (t && t.text === d.text && gone.has(d.key) && t.key && t.key !== d.key) splits.set(t.key, d.key);
  });
}

/**
 * An unchanged text keeps the key the document had when it was loaded rather than one minted since
 * (a line duplicated above itself and applied, then the top copy edited: the alignment pairs the
 * unchanged original with the copy's new key and gives the edited copy the old one) — when such a
 * key, of a text of the same field with this very English before, sits on an edited text (the two
 * swap keys) or on none. Never against copy-on-write (`sh`).
 * @param {KeyedText[]} texts the texts after the carry (their `key` updated here)
 * @param {Map<string, { text: string, field: string }>} old
 * @param {ReadonlySet<string>} loaded
 * @param {Set<string>} holes
 * @param {Map<string, string[]>} sh
 * @param {Set<string>} used
 */
function preferLoaded(texts, old, loaded, holes, sh, used) {
  /** @type {Map<string, string[]>} the loaded old keys by their English before */
  const byText = new Map();
  for (const [k, o] of old) {
    if (!loaded.has(k) || holes.has(k)) continue;
    const l = byText.get(o.text);
    if (l) l.push(k); else byText.set(o.text, [k]);
  }
  if (!byText.size) return;
  /** @type {Map<string, KeyedText>} each key's text now */
  const holderOf = new Map(texts.filter((t) => t.key).map((t) => [t.key, t]));
  for (const u of texts) {
    if (!u.key || loaded.has(u.key) || holes.has(u.key) || old.get(u.key)?.text !== u.text) continue;
    const field = fieldOf(u.where);
    for (const k of byText.get(u.text) ?? []) {
      if (k === u.key || old.get(k)?.field !== field) continue;
      if (sh.has(k) && !sh.get(k).includes(u.text)) continue;
      const holder = holderOf.get(k);
      if (holder ? holder.text === u.text : used.has(k)) continue;
      const mine = u.key;
      u.set(k);
      u.key = k;
      holderOf.set(k, u);
      if (holder) { holder.set(mine); holder.key = mine; holderOf.set(mine, holder); } else holderOf.delete(mine);
      break;
    }
  }
}

/**
 * Copy-on-write undone: a text whose key a split gave it (`splits`) and whose English is again what
 * another file holds under the shared key takes that key back — while the level holds it nowhere
 * else (`used`: the object's keys; `othersOf`: the rest of the level, read only then).
 * @param {KeyedText[]} texts the texts after the carry (their `key` updated here)
 * @param {SplitKeys} splits
 * @param {SharedTexts|null} shared
 * @param {Set<string>} used
 * @param {() => Set<string>} othersOf
 */
function takeBack(texts, splits, shared, used, othersOf) {
  if (!shared) return;
  for (const t of texts) {
    const k = t.key ? splits.get(t.key) : undefined;
    if (!k || used.has(k) || texts.some((x) => x.key === k)) continue;
    if (!shared(k)?.some((o) => o.text === t.text) || othersOf().has(k)) continue;
    t.set(k);
    t.key = k;
    used.add(k);
  }
}

/**
 * Drop the keys in `drop` from an object (or an edit's `now`): its `textKeys` entries (a list
 * entry becomes null; a field left without a key goes) and its scripts' tags.
 * @param {Record<string, any>} o
 * @param {Set<string>} drop
 */
function dropKeys(o, drop) {
  const fields = textFieldsOf(o.type) ?? {};
  const nul = (k) => (typeof k === 'string' && drop.has(k) ? null : k);
  const tk = isPlain(o.textKeys) ? o.textKeys : null;
  for (const [f, kind] of Object.entries(fields)) {
    if (kind === 'script') {
      const lines = hasOwn(o, f) ? scriptLines(o[f]) : [];
      if (!lines.some((l) => drop.has(splitLineTag(l).tag))) continue;
      const out = lines.map((l) => (drop.has(splitLineTag(l).tag) ? tagLine(l, '') : l));
      o[f] = typeof o[f] === 'string' ? out.join(o[f].includes('\r\n') ? '\r\n' : '\n') : out;
      continue;
    }
    if (!tk || !hasOwn(tk, f)) continue;
    const v = tk[f];
    if (!Array.isArray(v)) { if (nul(v) === null) delete tk[f]; continue; }
    let any = false;
    const out = v.map((e) => {
      if (!isPlain(e)) { const k = nul(e); if (k) any = true; return k; }
      const page = { ...e };
      if (hasOwn(page, 'key')) page.key = nul(page.key);
      if (Array.isArray(page.choices)) page.choices = page.choices.map(nul);
      if (page.key || page.choices?.some(Boolean)) any = true;
      return page;
    });
    if (any) tk[f] = out;
    else delete tk[f];
  }
  if (tk && !Object.keys(tk).length) delete o.textKeys;
}

/** An object's keyed parts in a canonical form (own keys sorted), for comparing. */
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (!isPlain(v)) return v;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
  return out;
}

/**
 * Every text of `o` gets a key (`carryObjectText(o, o, …)`): its own keys stay unless taken
 * (`used`: keys elsewhere in the level, filled as it goes), the rest are minted, keys and tags on no
 * text go. An object that needs nothing is left as it is (its keys' order too). `shared`: a key one
 * of those holds is kept only by a text with one of its Englishes (TextKeys' `shared` option).
 * Returns whether it changed.
 * @param {any} o
 * @param {{ mint: Mint, used: Set<string>, shared?: SharedKeys|null }} opts `mint`: one that adds what
 *   it gives to `used` (`minter`)
 * @returns {boolean}
 */
export function fillObjectKeys(o, { mint, used, shared = null }) {
  const fields = textFieldsOf(o?.type);
  if (!fields) {
    if (!hasOwn(o, 'textKeys')) return false;
    delete o.textKeys;
    return true;
  }
  const c = keyedState(o);
  carryObjectText(c, c, mint, used, shared?.size ? { shared } : {});
  const scripts = Object.keys(fields).filter((f) => fields[f] === 'script');
  const same = JSON.stringify(canonical(ownOf(c, 'textKeys'))) === JSON.stringify(canonical(ownOf(o, 'textKeys')))
    && scripts.every((f) => JSON.stringify(ownOf(c, f)) === JSON.stringify(ownOf(o, f)));
  if (same) return false;
  if (hasOwn(c, 'textKeys')) o.textKeys = c.textKeys;
  else delete o.textKeys;
  for (const f of scripts) if (hasOwn(c, f)) o[f] = c[f];
  return true;
}

/** The text of a level's own field (`subtitle`, `title.*`: `environment.title.*`), or ''. */
function rootText(level, f) {
  if (f === 'subtitle') return typeof level?.subtitle === 'string' ? level.subtitle : '';
  const v = ownOf(ownOf(ownOf(level, 'environment'), 'title'), f.slice(6));
  return typeof v === 'string' ? v : '';
}

/**
 * The level's own texts' state before an edit (`setLevelProps`).
 * @param {any} level
 */
export function rootState(level) {
  return { texts: LEVEL_TEXT_FIELDS.map((f) => rootText(level, f)), textKeys: copy(ownOf(level, 'textKeys')) };
}

/**
 * The level's own keys after `setLevelProps` (`level` changed in place): each of its texts the edit
 * changed keeps its key (or gets a new one; blank: none), the others keep theirs as they were — the
 * level's `textKeys` merged, never replaced. A text cleared and typed again gets its old key back
 * (`dropped`). With `shared`, copy-on-write (TextKeys' `shared` option): a text keeps a key another
 * file holds only while its English is the one there — the split remembered in `splits`; typed back
 * to that English, the text takes the shared key back while the level holds it nowhere else.
 * Returns whether anything was done.
 * @param {{ texts: string[], textKeys: unknown }} before `rootState(level)` before the edit
 * @param {any} level
 * @param {Mint} mint
 * @param {{ shared?: SharedTexts|null, dropped?: RootDropped|null, splits?: SplitKeys|null }} [o]
 * @returns {boolean}
 */
export function carryRootEdit(before, level, mint, { shared = null, dropped = null, splits = null } = {}) {
  const changed = LEVEL_TEXT_FIELDS.filter((f, k) => rootText(level, f) !== before.texts[k]);
  if (!changed.length) return false;
  /** @type {Record<string, unknown>} */
  const oldKeys = { ...(isPlain(before.textKeys) ? /** @type {Record<string, unknown>} */ (before.textKeys) : {}) };
  /** @type {Record<string, string>} */
  const oldTexts = Object.fromEntries(LEVEL_TEXT_FIELDS.map((f, k) => [f, before.texts[k]]));
  if (dropped) {
    for (const f of changed) {
      const had = oldTexts[f].trim() !== '';
      const has = rootText(level, f).trim() !== '';
      // cleared: remembered; typed again: its old text and key come back to be carried
      if (had && !has) dropped.set(f, { value: oldTexts[f], key: ownOf(oldKeys, f) });
      else if (!had && has && dropped.has(f)) {
        const m = dropped.get(f);
        dropped.delete(f);
        oldTexts[f] = m.value;
        if (m.key !== undefined) oldKeys[f] = m.key;
        else delete oldKeys[f];
      }
    }
  }
  // only the changed texts are carried (carryRootText reads `environment.title`)
  const pick = (/** @type {(f: string) => string} */ textOf, keys) => {
    /** @type {Record<string, string>} */
    const title = {};
    for (const f of changed) if (f !== 'subtitle') title[f.slice(6)] = textOf(f);
    return { subtitle: changed.includes('subtitle') ? textOf('subtitle') : '', environment: { title }, textKeys: keys };
  };
  const was = pick((f) => oldTexts[f], oldKeys);
  const now = pick((f) => rootText(level, f), undefined);
  const used = new Set(levelKeys({ objects: level.objects }).map((k) => k.key));
  for (const f of LEVEL_TEXT_FIELDS) if (!changed.includes(f) && isGuid(ownOf(oldKeys, f))) used.add(/** @type {string} */ (oldKeys[f]));
  // copy-on-write: the English other files hold under the changed texts' keys
  const sh = sharedMap(shared, changed.map((f) => ownOf(oldKeys, f)));
  carryRootText(was, now, minter(mint, used), used, sh.size ? { shared: sh } : {});
  const nk = isPlain(ownOf(now, 'textKeys')) ? now.textKeys : {};
  if (splits) {
    for (const f of changed) {
      const k = ownOf(nk, f);
      const o = ownOf(oldKeys, f);
      const text = rootText(level, f).trim();
      if (!isGuid(k) || !text) continue;
      // split now (the old text kept the key another file holds; this one could not): remembered
      if (isGuid(o) && o !== k && sh.has(/** @type {string} */ (o)) && oldTexts[f].trim()) { splits.set(k, /** @type {string} */ (o)); continue; }
      // typed back to the English another file holds under the key it split from: that key again
      const back = splits.get(k);
      if (back && !used.has(back) && shared?.(back)?.some((t) => t.text === text)) { nk[f] = back; used.add(back); }
    }
  }
  const keys = isPlain(level.textKeys) ? level.textKeys : {};
  for (const f of changed) {
    const k = ownOf(nk, f);
    if (k !== undefined) keys[f] = k;
    else delete keys[f];
  }
  if (Object.keys(keys).length) level.textKeys = keys;
  else if (hasOwn(level, 'textKeys')) delete level.textKeys;
  return true;
}

/**
 * A `textKeys` patch for the level's own keys (`setLevelProps({ textKeys })`): merged into what the
 * level has, then cleaned (only well-formed keys of its own texts stay). Returns the result, or
 * undefined when nothing is left.
 * @param {unknown} current
 * @param {unknown} patch
 */
export function mergeRootKeys(current, patch) {
  const merged = { ...(isPlain(current) ? /** @type {object} */ (current) : {}), ...(isPlain(patch) ? /** @type {object} */ (patch) : {}) };
  return cleanTextKeysOf('root', merged).keys;
}

/**
 * Every text of the level's own gets a key (*Assign text keys*): its keys stay unless taken, the
 * rest are minted. Left as it is when it needs nothing. Returns whether it changed.
 * @param {any} level
 * @param {{ mint: Mint, used: Set<string> }} opts
 * @returns {boolean}
 */
export function fillRootKeys(level, { mint, used }) {
  const c = { subtitle: level.subtitle, environment: level.environment, textKeys: copy(ownOf(level, 'textKeys')) };
  carryRootText(c, c, mint, used);
  if (JSON.stringify(canonical(ownOf(c, 'textKeys'))) === JSON.stringify(canonical(ownOf(level, 'textKeys')))) return false;
  if (hasOwn(c, 'textKeys')) level.textKeys = c.textKeys;
  else delete level.textKeys;
  return true;
}

/**
 * *Assign text keys*, before it fills: a key on texts of two (or more) Englishes stays with the copy
 * whose English another file holds under it (`shared`: a chapter variant's base, the campaign's
 * other files, the file a *Save As* left) — the other copies lose it (and get new keys from the
 * fill). Without such a copy the fill's own rule applies: the first text keeps it. Returns whether
 * anything changed.
 * @param {any} level changed in place
 * @param {SharedTexts|null} shared
 * @returns {boolean}
 */
export function preferSharedCopies(level, shared) {
  if (!shared) return false;
  /** @type {Map<string, KeyedText[]>} */
  const byKey = new Map();
  for (const t of levelTexts(level)) {
    if (!t.key) continue;
    const l = byKey.get(t.key);
    if (l) l.push(t); else byKey.set(t.key, [t]);
  }
  let changed = false;
  for (const [key, list] of byKey) {
    if (list.length < 2 || list.every((t) => t.text === list[0].text)) continue;
    const other = shared(key);
    const keep = other?.length ? list.find((t) => other.some((o) => o.text === t.text)) : undefined;
    if (!keep || keep === list[0]) continue;
    for (const t of list) if (t !== keep) { t.set(''); changed = true; }
  }
  return changed;
}

/**
 * *Assign text keys*, before it fills: a text without a key takes the key of the same text in a
 * level this one copies (`sources`, in order: a chapter variant's base level, a campaign copy's
 * shipped level of the same file name — as `npm run i18n:keys -- --assign` shares them): the same
 * object id and field, the same English, the first such key the level does not hold yet. Returns
 * whether anything changed.
 * @param {any} level changed in place
 * @param {readonly (readonly { key: string, text: string, where: string }[])[]} sources each source's
 *   keyed texts (`TextKeys.levelTexts`, or a `textMapOf`'s entries)
 * @returns {boolean}
 */
export function shareKeys(level, sources) {
  if (!sources.length) return false;
  const texts = levelTexts(level).filter((t) => !t.key);
  if (!texts.length) return false;
  const taken = new Set(levelKeys(level).map((k) => k.key));
  let changed = false;
  for (const src of sources) {
    /** @type {Map<string, string[]>} holder and field + English → the source's keys, in order */
    const by = new Map();
    for (const s of src) {
      if (!isGuid(s?.key) || typeof s.text !== 'string' || typeof s.where !== 'string') continue;
      const k = `${fieldOf(s.where)}\u0000${s.text}`;
      const l = by.get(k);
      if (l) l.push(s.key); else by.set(k, [s.key]);
    }
    for (const t of texts) {
      if (t.key) continue;
      const key = by.get(`${fieldOf(t.where)}\u0000${t.text}`)?.find((k) => !taken.has(k));
      if (!key) continue;
      t.set(key);
      t.key = key;
      taken.add(key);
      changed = true;
    }
  }
  return changed;
}

/** How many of a list are named in a message. */
const SHOWN = 4;

/**
 * Where a key or text is, as the inspector and Edit › *Find by text key…* name it: `npc_2 ›
 * dialogue, page 1` (1-based), `npc_2 › dialogue, page 3 › choice 2`, `pip › talk, line 4`,
 * `level › subtitle` — from TextKeys' `where` of a key (`npc_2.textKeys.dialogue[0].key`,
 * `pip.talk:4`) or of a text (`npc_2 › dialogue[0]`, `pip › talk:4`).
 * @param {string} where
 */
export function placeName(where) {
  const page = (holder, field, i, c) => `${holder} › ${field}${i != null ? tr('story.place.page', { n: Number(i) + 1 }) : ''}${c != null ? tr('story.place.choice', { n: Number(c) + 1 }) : ''}`;
  let m = /^(.*)\.textKeys\.([^.[\]]+)(?:\[(\d+)\])?(?:\.key|\.choices\[(\d+)\])?$/.exec(where);
  if (m) return page(m[1], m[2], m[3], m[4]);
  m = /^(.*) › ([^.[\]:]+)\[(\d+)\](?:\.choices\[(\d+)\])?$/.exec(where);
  if (m) return page(m[1], m[2], m[3], m[4]);
  m = /^(.*?)(?:\.| › )([A-Za-z]+):(\d+)$/.exec(where);
  if (m) return tr('story.place.line', { holder: m[1], field: m[2], n: m[3] });
  return where;
}

/**
 * *Check for problems*: the level's text-key problems (TextKeys.textKeyIssues) as lines — texts
 * with no key and keys on no text summed up, each repeated key on its own line, every place named
 * as the inspector names it (`placeName`). A key on two texts of the same English: *Assign text
 * keys* gives the later one a new key; on texts of two Englishes the translation tables decide which
 * copy keeps it: `npm run i18n:keys -- --fix` (`o.file`: the file or campaign it names).
 * @param {any} level
 * @param {{ file?: string }} [o]
 * @returns {string[]}
 */
export function textKeyWarnings(level, { file = '' } = {}) {
  const issues = textKeyIssues(level);
  const out = [];
  const list = (xs) => `${commaList(xs.slice(0, SHOWN).map((x) => placeName(x.where)))}${xs.length > SHOWN ? tr('story.textKeys.listMore', { n: xs.length - SHOWN }) : ''}`;
  const missing = issues.filter((i) => i.kind === 'missing');
  const stray = issues.filter((i) => i.kind === 'stray');
  if (missing.length) out.push(trn('story.textKeys.missing', missing.length, { list: list(missing) }));
  if (stray.length) out.push(trn('story.textKeys.stray', stray.length, { list: list(stray) }));
  // a key on two texts (as textKeyIssues finds them: every key the level holds, in its order), and
  // whether its texts read alike
  /** @type {Map<string, Set<string>>} */
  const english = new Map();
  for (const t of levelTexts(level)) {
    if (!t.key) continue;
    const s = english.get(t.key);
    if (s) s.add(t.text); else english.set(t.key, new Set([t.text]));
  }
  /** @type {Map<string, string>} */
  const seen = new Map();
  let n = 0;
  const fix = `npm run i18n:keys -- --fix ${file || tr('story.textKeys.levelFile')}`;
  for (const { key, where } of levelKeys(level)) {
    const was = seen.get(key);
    if (!was) { seen.set(key, where); continue; }
    if (++n > 20) continue;
    const vars = { place: placeName(where), key, other: placeName(was), fix };
    out.push((english.get(key)?.size ?? 0) > 1 ? tr('story.textKeys.repeatedOther', vars) : tr('story.textKeys.repeatedSame', vars));
  }
  if (n > 20) out.push(tr('story.textKeys.moreRepeated', { n: n - 20 }));
  return out;
}

// =================================================================================================
// Keys shown and found (the inspector's read-only keys with Copy, Edit › Find by text key…: a key
// is never typed, but QA, voice work and translators name a line by it)
// =================================================================================================

/**
 * Every text of an object that takes a key, in field order, with its key ('' when it has none):
 * a one-string field's text, each page of a `lines` field, each dialogue page and choice, each line
 * of a script that holds text (its 1-based line as the script field shows it, without tags).
 * @param {any} o
 * @returns {TextRow[]}
 */
export function textRows(o) {
  const fields = textFieldsOf(o?.type);
  /** @type {TextRow[]} */
  const out = [];
  if (!fields) return out;
  for (const [field, kind] of Object.entries(fields)) {
    const v = ownOf(o, field);
    if (kind === 'text') {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s && !(field === 'label' && builtinLabel(s))) out.push({ field, key: textKeyOf(o, field), text: s });
    } else if (kind === 'lines') {
      for (const p of textPages(v)) out.push({ field, page: p.i, key: pageKeyOf(o, field, p.i), text: p.text.trim() });
    } else if (kind === 'dialogue') {
      if (v === undefined) continue;
      for (const p of dialogueUnits(v)) {
        out.push({ field, page: p.i, key: dialogueKeyOf(o, p.i), text: p.text.trim() });
        for (const c of p.choices ?? []) out.push({ field, page: p.i, choice: c.j, key: choiceKeyOf(o, p.i, c.j), text: c.text.trim() });
      }
    } else if (kind === 'script' && v !== undefined) {
      const lines = scriptLines(v).map(splitLineTag);
      for (const [n, texts] of scriptTextLines(lines.map((l) => l.text))) out.push({ field, line: n, key: lines[n - 1].tag, text: texts.join('\n') });
    }
  }
  return out;
}

/**
 * The level's own texts that take a key (`subtitle`, the title-screen overrides
 * `environment.title.*`), with their keys ('' none).
 * @param {any} level
 * @returns {{ field: string, key: string, text: string }[]}
 */
export function rootRows(level) {
  /** @type {{ field: string, key: string, text: string }[]} */
  const out = [];
  for (const f of LEVEL_TEXT_FIELDS) {
    const s = rootText(level, f).trim();
    if (s) out.push({ field: f, key: textKeyOf(level, f), text: s });
  }
  return out;
}

/**
 * The key a typed text names (Edit › *Find by text key…*): a GUID — upper or lower case, with or
 * without braces and hyphens (`{9F2A1B3C-4D5E-…}`, as Unreal writes one), after a script's
 * `#line:` — or a banner subtitle's `<GUID>.2` (its line's key); '' when it names none.
 * @param {unknown} input
 * @returns {string}
 */
export function parseKeyInput(input) {
  let s = typeof input === 'string' ? input.trim() : '';
  if (s.toLowerCase().startsWith(LINE_TAG)) s = s.slice(LINE_TAG.length).trim();
  if (s.endsWith('.2')) s = s.slice(0, -2);
  if (s.startsWith('{') && s.endsWith('}')) s = s.slice(1, -1);
  s = s.replace(/-/g, '').toUpperCase();
  return isGuid(s) ? s : '';
}

/**
 * Where a key is in a level (Edit › *Find by text key…*): every object text holding it (`textRows`)
 * and every text of the level's own (`rootRows`), in the level's order.
 * @param {any} level
 * @param {string} key a GUID (`parseKeyInput`)
 * @returns {{ objects: { id: string, row: TextRow }[], root: { field: string, key: string, text: string }[] }}
 */
export function findTextKey(level, key) {
  /** @type {{ id: string, row: TextRow }[]} */
  const objects = [];
  if (!isGuid(key)) return { objects, root: [] };
  for (const o of Array.isArray(level?.objects) ? level.objects : []) {
    if (!textFieldsOf(o?.type)) continue;
    for (const row of textRows(o)) if (row.key === key) objects.push({ id: String(o.id ?? ''), row });
  }
  return { objects, root: rootRows(level).filter((r) => r.key === key) };
}

/**
 * A file's keyed texts by key (`KeyedText`s of `TextKeys.levelTexts` / `campaignTexts` /
 * `storyFileTexts` / `storyTextTexts`), as copy-on-write and *Find by text key…* read another
 * file: key → its English and where it is (a key on two texts of the file: the first).
 * @param {KeyedText[]} texts
 * @returns {Map<string, { text: string, where: string }>}
 */
export function textMapOf(texts) {
  /** @type {Map<string, { text: string, where: string }>} */
  const out = new Map();
  for (const t of texts) if (t.key && !out.has(t.key)) out.set(t.key, { text: t.text, where: t.where });
  return out;
}

/**
 * The texts of other files by key, from each file's `textMapOf` (`files`: file → its map): what
 * `SharedTexts` answers.
 * @param {Iterable<[string, Map<string, { text: string, where: string }>]>} files
 * @returns {Map<string, OtherText[]>}
 */
export function otherTextsOf(files) {
  /** @type {Map<string, OtherText[]>} */
  const out = new Map();
  for (const [file, map] of files) {
    for (const [key, t] of map) {
      const l = out.get(key);
      const e = { file, text: t.text, where: t.where };
      if (l) l.push(e); else out.set(key, [e]);
    }
  }
  return out;
}
