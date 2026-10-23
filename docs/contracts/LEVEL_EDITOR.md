# Luminati Level Editor — Design & Contracts

> **Status.** **Binding contract** for the `luminati-level` format, the object catalog, the level
> builder, level storage and the editor's internal interfaces — change it only additively
> ([contracts/README.md](README.md)). This box is a reading aid added by the documentation pass;
> it is not part of the contract.
>
> **Audience.** Developers and AI agents changing `src/engine/level/`, `src/editor/`, the
> game's level loading or a level generator.
>
> **Readable references (written against the code, canonical for "what the code does").**
> [specs/LEVEL_FORMAT.md](../specs/LEVEL_FORMAT.md) (format) ·
> [specs/OBJECT_CATALOG.md](../specs/OBJECT_CATALOG.md) (object types) ·
> [specs/LEVEL_STORAGE_API.md](../specs/LEVEL_STORAGE_API.md) (storage, dev-server API) ·
> [architecture/EDITOR.md](../architecture/EDITOR.md) (editor architecture) ·
> [user/LEVEL_EDITOR_GUIDE.md](../user/LEVEL_EDITOR_GUIDE.md) (using the editor).
> Known differences between this text and the code: [ai/KNOWN_ISSUES.md](../ai/KNOWN_ISSUES.md#documentation-discrepancies)
> (DOC-05 and DOC-13 are corrected in the text since 2026-10-07). **Typed copies** the code is checked against (`npm run typecheck`):
> the level document and object catalog in [`src/engine/level/types.d.ts`](../../src/engine/level/types.d.ts)
> (§1–§2), the tool interface in [`src/editor/tools/index.js`](../../src/editor/tools/index.js) (§7),
> the `EditorState` events in [`src/editor/types.d.ts`](../../src/editor/types.d.ts); where this text
> and the code differ they follow the code.

Goal: a **visual map / level editor** for the Luminati 2.5D pixel-art engine. The user paints terrain,
sculpts heights, places buildings / trees / lights / props / characters, edits their properties,
**saves** the map (to the project folder, the browser, or a file), reopens it, and **play-tests**
it in the real game. The Emberfall demo village itself becomes a level file the editor can open.

Read `ARCHITECTURE.md` (engine conventions, visual target) first. This document is binding for
everything under `src/engine/level/`, `src/editor/`, and the game's level loading.

---

## 1. Level format (v1) — `src/engine/level/LevelFormat.js` (written, use it)

A level is plain JSON (`format: "luminati-level"`, `version: 1`):

```jsonc
{
  "format": "luminati-level", "version": 1,
  "name": "Emberfall", "subtitle": "Riverside Village", "author": "", "description": "",
  "width": 48, "depth": 40,
  "waterLevel": 0.4,
  "water": { "flow": [0, 0.45], "reflect": 0.2, "neutral": 0.2 },
  "environment": { "timeOfDay": 17.2, "clock": true, "weather": "clear", "border": "forest",
                   "outerScenery": true, "godRays": true, "dust": true, "music": true,
                   "camera": null, "highGround": null },
  "spawn": { "x": 19.5, "z": 24.2, "facing": "down" },
  "legend": { "g": { "top": "grass", "side": "cliff", "lip": "grass_side", "walkable": true }, … },
  "tiles":   ["TTTTgg..", …],          // one string per row (z), one char per tile (x)
  "heights": ["22223333", …],          // '0'-'9','a'-'z' → level 0-35; world y = level × 0.5
  "objects": [ { "id": "house_1", "type": "house", "x": 20, "z": 14, "rotation": 0, "opts": {…} }, … ]
}
```

- `TILE_TYPES` is the built-in tile palette (char, name, category, 2D colour, legend def). New
  levels get the full default legend; files may add custom legend chars.
- `water` may also hold `glint` (optional, default 1: the density of the sun / moon glints — a big,
  calm lake reads better with fewer; Level settings › Water › Glints). Keys of `water` this engine
  does not know are kept (Level settings writes back the file's own keys in their order).
- API: `createEmptyLevel, normalizeLevel, validateLevel, serializeLevel, parseLevel, cloneLevel,
  resizeLevel, shiftLevelContent, getTile, setTile, getHeightLevel, setHeightLevel, tileDef,
  inBounds, charToLevel, levelToChar, levelToWorld, toTileMapInput, addObject, generateObjectId,
  levelStats, TILE_TYPES, TILE_BY_CHAR, defaultLegend, DEFAULT_ENVIRONMENT, MAX_LEVEL` (additions:
  `SPAWN_ID`, `onBridgeDeck(level, x, z)`, `isWalkablePoint(level, x, z)` — a walkable tile or a
  bridge deck, the rule the game walks by).
- `normalizeLevel` throws "Not a Luminati level" for JSON with neither `format` nor `tiles` / `heights`
  (a `package.json` never opens as a blank map). Duplicate object ids and the reserved id `'spawn'`
  (`SPAWN_ID`, the editor's selection token of the player start) are renamed **with a warning**.
  Top-level fields this engine does not know, and extra keys of `spawn`, are kept and written back
  (`serializeLevel` puts unknown top-level fields after `objects`, with the level's `textKeys`, in
  the file's own order). (Added 2026-10-01, KNOWN_ISSUES
  LVL-17:) an object `type` counts only when it is a string naming an own key of `OBJECT_TYPES`
  — an `Object.prototype` name such as `"constructor"` is skipped with the usual *Unknown object
  type* warning — and names read from level data elsewhere are matched as own keys too; a legend
  key that is not one character is kept but warns, and no tile can use it.
- **Byte-stable**: `parseLevel` → `serializeLevel` of a saved level reproduces the file exactly
  (`normalizeObject` keeps each object's key order; `createObject` writes id, type, position, then
  the defaults). `validateLevel` accepts a player start on a bridge deck.
- **Text keys** (*added October 2026, additive*): every translatable text carries its text key in
  the data, a GUID ([I18N.md §4.2](../specs/I18N.md#42-keys-and-lookup)): an object's optional
  `textKeys` (parallel to its translatable fields), `#line:<GUID>` tags on its script lines, and the
  level's own optional `textKeys` (`subtitle`, `title.*`). `normalizeLevel` cleans them —
  malformed keys, unknown fields and keys past their texts are dropped and lower-case keys
  upper-cased, with a warning — and keeps well-formed keys byte for byte. The level's `textKeys`
  is written on one line after `objects`, in its place among the unknown top-level fields
  ([LEVEL_FORMAT.md §14](../specs/LEVEL_FORMAT.md#14-serialisation-byte-stable-writing)).
- `environment.camera`: `null` (auto from the walkable area) or
  `{ distance?, pitch?, bounds?: rect | { near: rect, mid: rect, far: rect } }` (rect = {minX,maxX,minZ,maxZ}).
- `environment.highGround`: `null` or `{ minY, pitch }` — the camera tilts to `pitch` while the
  player stands above `minY` (Emberfall's Windmill Hill).
- `environment.border: 'forest'` scatters border trees on blocked grass tiles (`T`) and builds the
  fogged outer scenery when `outerScenery` is true. Open map edges — runs of 3+ walkable edge
  tiles (a map without a forest border) — keep the outer forest 2.5 units away, so no tree right
  past the edge hides the player there (single walkable edge tiles, like Emberfall's river banks,
  change nothing).

**Optional environment fields** (all backwards-compatible; absent = the game's automatic choice):

| field | meaning |
| --- | --- |
| `title` `{ title?, subtitle?, prompt?, credit? }` | title-screen texts (default: the level name in capitals, `subtitle`, "Press any key", the engine credit) |
| `titleCamera` `{ x?, z?, y?, driftX?, driftZ?, distance? }` | title-screen camera drift centre, height, drift amplitudes and distance (default: the middle of the playable area) |
| `godRayAreas` `[{ minX, maxX, minZ, maxZ, y?, count?, seed? }]` | world rects the god-ray shafts fall into (`count` 0–12, default 3; `y` default 0; `seed` default 7); default: one area over the walkable ground |
| `foliage` `{ seed?, flowerAreas?: [{ minX, maxX, minZ, maxZ, palette: number[] }], shrubAreas?: [{ minX, maxX, minZ, maxZ, chance }] }` | ground-foliage seed (default 2024) and zones in **tile** coordinates (tile (i, j) is inside when minX ≤ i < maxX and minZ ≤ j < maxZ; first match wins): flower colours (frames 0 red, 1 yellow, 2 white, 3 blue) and bush / fern chance (default 0.05) |
| `scenery` `{ southGap? }` | open ground (world units) south of the map before the outer forest (default 5; Emberfall 0) |
| `fogScale` | multiplier on the game's fog density at every hour (default 1): a big level whose views reach far can thin the haze, so dawn and dusk keep their far layers (Starfall Vale: 0.65). No inspector field; kept when editing. |
| `minimap` | `false` hides the HUD minimap under the clock (default: shown). The world map (N / Tab) is available either way. Level settings › Environment › Minimap edits it; the default is never written into a file that did not have it. |
| `combat` | combat on this level (**optional, never written by default**): absent = **Auto** — combat is on exactly when the level has an `enemy` object; `true` = **On** (the player's sword kit, chests and waystones work even without enemies); `false` = **Off** (a peaceful level: enemies are not spawned, chests and waystones are only examined). `levelHasCombat(level)` ([ObjectCatalog](../../src/engine/level/ObjectCatalog.js)) is the one test; the game evaluates it once at load ([COMBAT.md §3](COMBAT.md#3-enabling-combat-per-level)). **Level settings › Combat: Auto / On / Off** edits it: *Auto* removes the key (so a level saved with Auto stays byte-identical), *On* / *Off* write `true` / `false`. Check for problems warns about `false` with enemies placed. |
| `forest` `{ areas: [{ minX, maxX, minZ, maxZ, kinds: { oak?, pine?, birch?, autumn? } }] }` | the tree kinds of the forest border (`T` tiles), deep-forest patches and outer scenery by area, in **world** units (a tree at (x, z) is inside when minX ≤ x < maxX and minZ ≤ z < maxZ; rects may reach past the map for the outer woods; first match wins). `kinds` are relative weights. Positions, the random sequence and every tree outside the areas are unchanged; default: the automatic mix (pines in the north rows, an autumn-heavy east third). `Scenery.forestKindAreas(env)` reads it; the editor's scenery preview follows it. |
| `interior` | `true` makes the level a **room** (*added 2026-10-07*; never written by default): no forest border, outer scenery, god rays or weather inside, whatever those fields say, and a campaign keeps the level the player came from while they are in it and the last room after they leave ([LEVEL_FORMAT.md §9](../specs/LEVEL_FORMAT.md), [CAMPAIGN_FORMAT.md §6.3](../specs/CAMPAIGN_FORMAT.md#rooms-the-levels-set-aside)). Level settings › Environment › *Interior (room)* writes `true` and removes the key when switched off; File › New › *Room (interior)* starts one. |
| `backdrop` | `"void"` or `"#rrggbb"`: an interior's surround instead of the sky (*added 2026-10-07*; absent = the sky). Level settings › Environment › *Backdrop* writes it only when changed and removes it again for the sky. |

`LevelFormat.resizeLevel` / `shiftLevelContent` move every absolute position with the content:
spawn, objects (including the legacy absolute `bounds` / `spots` / `talkPoint`), camera bounds,
god-ray, foliage and forest areas and the title camera. Shifted values are rounded to 1e-6, so growing and
shrinking back is an exact identity.

## 2. Object catalog — `src/engine/level/ObjectCatalog.js` (written, use it)

`OBJECT_TYPES[type]` = `{ label, category, placement: 'point'|'line'|'rect', kind: 'prop'|'actor'|'marker',
glyph, color, radius, rotatable?, snap?, help?, combat?, campaign?, story?, interior?, defaults, fields }`
(`combat: true` marks the combat-only types, COMBAT.md §14; `campaign: true` / `story: true` the
campaign and story markers; `interior: true` the furniture of rooms — additive, 2026-10-07; the entry
shape is `ObjectTypeDef` in `level/types.d.ts`, checked with `@satisfies`, and the level object types
are derived from the entries). Types:

| category | types |
| --- | --- |
| Buildings | `house`, `windmill`, `well`, `marketStall` |
| Nature | `tree`, `rock`, `haystack` |
| Lights | `lamppost`, `wallTorch`, `campfire`, `light` |
| Props | `bench`, `barrel`, `crate`, `crateStack`, `flowerbox`, `signpost` |
| Interior (`interior: true`) | `bed`, `table`, `chair`, `shelf`, `hearth`, `counter`, `rug`, `staircase`, `wallWindow`, `wardrobe`, `sacks` — props made for rooms (`environment.interior`), [OBJECT_CATALOG.md § Interior](../specs/OBJECT_CATALOG.md#interior) |
| Structures (line) | `fence`, `bridge` |
| Water | `waterfall` |
| Characters (actors) | `npc`, `critters` |
| Markers | `emitter` (particle area), `region` (rect, HUD location name) |
| Combat (`combat: true`) | `enemy` (actor: a group of hostile creatures, the training dummies or the boss), `chest` (prop), `waystone` (prop, checkpoint) — [COMBAT.md §14](COMBAT.md#14-level-data) |
| Campaign (`campaign: true`) | `exit` (rect: `to`, `entrance`, `mode` walk / use, `label`, `requires`, `locked`), `entrance` (marker: `name`, `facing`) — markers that build nothing; only a campaign reads them ([CAMPAIGN_FORMAT.md](../specs/CAMPAIGN_FORMAT.md)) |

The player start is `level.spawn` (editors show it as `SPAWN_MARKER`). `fields` is the inspector
schema (`key` = dotted path, `type` ∈ number | int | angle | bool | select | text | textarea | lines |
dialogue | color; `nullable` numbers may be blank = null; `i18n: true` — added 2026-10-09, additive —
marks a field players read, which the content-text tools extract for translation and the game shows
translated: names as terms (`term`), texts, dialogue, talk scripts, labels and the npc `title` by
the text keys the data holds beside them (`loc`); identity fields never carry it,
[I18N.md §4.6](../specs/I18N.md#46-what-is-extracted)). The level file is the same in every
language: translations live in `public/i18n/`, never in the level. The editor's own UI shows
English or Simplified Chinese ([I18N.md §6](../specs/I18N.md#6-the-level-editor)); what it writes
into a level does not depend on that language.
The keys are GUIDs kept through every edit, so inserting a page, reordering lines or renaming an
object's id keeps every translation; an edited text keeps its key and shows English until it is
reviewed ([OBJECT_CATALOG.md §13.3](../specs/OBJECT_CATALOG.md#133-translations)). The editor
shows the keys read-only and keeps them itself (§6, *Text keys*). Helpers: `createObject, normalizeObject,
getField, setField, objectCenter, objectBounds, hitTestObject, parseDialogueText, dialogueToText,
critterYard, critterStartPoints, OBJECT_CATEGORIES, NPC_ACTIONS, NPC_BEHAVIOURS, NPC_SCRIPTS,
CHARACTER_PRESET_NAMES, …` (additions for combat: `ENEMY_KINDS`, `ENEMY_INFO`, `CHEST_UPGRADES`,
`enemyStartPoints(g, isWalkable)` — the `critterStartPoints` algorithm for an enemy group, a golem
group holds 0–1 —, `isCombatType(type)`, `levelHasCombat(level)`; `NPC_SCRIPTS` gains
`'drillmaster'`, the combat tutor, and `'shopkeeper'`, the combat shop's menu (additive,
2026-09-28; both play the NPC's own `dialogue` and `action` on a peaceful level);
`OBJECT_CATEGORIES` gains `'Combat'` last; additions for campaigns: `EXIT_MODES`, `STORY_FIELDS` —
the optional `when` / `unless` flag fields every type's `fields` end with, absent by default —,
the npc field `flag`, `isCampaignType(type)`; exits and entrances sit in `'Markers'`; additions for
rooms: `OBJECT_CATEGORIES` gains `'Interior'` after `'Props'`, `BLANKET_COLORS`, `RUG_COLORS`,
`isInteriorType(type)`, `interiorFootprint(obj)` — a piece's local footprint rectangle (`solid`,
`round`), which `objectBounds` turns by the rotation — and `staircaseFoot(obj)`, where the player
stands to use a staircase's exit).

Interior types (`interior: true`; defaults in file order; every one rotatable, snap 0.25):
`bed { rotation 0, opts { width 1.2, length 2.2, blanket 'red' } }`, `table { rotation 0, opts
{ shape 'rect', width 1.6, depth 0.9, cloth false, items true, candle false } }`, `chair { rotation 0,
opts { style 'chair' } }`, `shelf { rotation 0, opts { kind 'books', width 1.6, height 2.2 } }`,
`hearth { rotation 0, opts { width 2.2, height 2.6, lit true, embers true, pot false } }`, `counter
{ rotation 0, opts { style 'bar', width 2.6, items true } }`, `rug { rotation 0, opts { color 'red',
width 2, length 3 } }`, `staircase { rotation 0, opts { dir 'up', width 1.2, steps 7, height 2.5, flip
false, rail true } }`, `wardrobe { rotation 0, opts { kind 'wardrobe', width 1.4 } }`, `wallWindow
{ rotation 0, opts { panes 1, sill 0.9, glow 'daylight', curtains 'red', beam true } }`, `sacks
{ rotation 0, opts { count 3 } }`. (x, z) is the footprint's centre (a wall window: the wall face),
rotation 0 turns the front toward +Z and a wall piece's back to the north. A lit hearth carries one
point light (`LIGHT_PRIORITY` 0).

Combat types (`combat: true`; defaults in file order): `enemy { kind: 'slime' (ENEMY_KINDS), count 3
(1–8), radius 3 (home radius), level 1 (1–10), elite false, name '' }`, `chest { rotation 0, gold 20,
potions 0, upgrade 'none' (CHEST_UPGRADES; the inspector labels them None / Max HP +20 / Max MP +10 /
Attack +3) }`, `waystone { name 'Waystone' }`. A level with an
`enemy` object plays with combat (see `environment.combat`, §1). On a peaceful level chests and
waystones are props with examine text; older engines drop the three types with a `normalizeLevel`
warning.

Text fields: `text: string[]` (signpost / well / house door "examine" pages), `speaker` (signpost).
House doors, signposts and wells are interactable in the game only when their `text` is non-empty.
NPC: `{ name, preset, facing, wander, speed, portraitColor, dialogue, action, item, behaviour, script }`
where `dialogue` = `(string | { text, choices: string[] })[]`, `action` ∈ none|rest|shop|music
(built-in behaviours: the game adds a closing question unless the dialogue ends with its own choice
page; picking any option but the first runs the action — a closing choice page with a single
option: that option runs it), `item` = what a `shop` NPC hands
out (default "Crisp Apple"), `behaviour` ∈ `NPC_BEHAVIOURS` (wander|post|perform|chase), `script` =
id of a hand-written Emberfall conversation in `src/game/dialogue.js` (overrides `dialogue` when
set). Markup `{word}` renders gold.

**Optional object fields** the game reads (no inspector field unless noted; keep them when editing):

| type | field | meaning |
| --- | --- | --- |
| `npc` | `title` | *(added 2026-10-10, additive; an inspector field "Title" after Name)* the small title beside the name plate when this villager speaks (Sela's "Warden of the Cinderwatch"); a translatable text (`i18n: true`, extracted as kind `title`, shown by the key the object holds for it, `textKeyOf(obj, 'title')`, I18N.md §4.8); absent by default, so no saved level changes; blank = none ([PIXEL_UI.md §8.1](../specs/PIXEL_UI.md#81-component-interfaces)). |
| npc | `talkOffset: [dx, dz]` | where the player talks to the NPC, **relative** to its x / z (the absolute legacy `talkPoint: [x, z]` is still read) |
| npc | `area: { minX, maxX, minZ, maxZ }` | the rect a `chase` NPC roams, **relative** to x / z (legacy absolute `bounds`) |
| npc | `talkRadius` | talk distance (default 1.6) |
| npc | `spec: { … }` | sprite overrides merged over the preset (`createCharacterSheet` spec fields); drawn by the editor preview and, since 2026-10-07, by the game (additive, KNOWN_ISSUES GAME-17) |
| critters | `area: { minX, maxX, minZ, maxZ }` | the chicken yard, **relative** to x / z (legacy absolute `bounds`); default the square of `radius` |
| critters | `spotOffsets: [[dx, dz], …]` | exact start spots, **relative** to x / z (legacy absolute `spots`); `count` (inspector) wins: the first animals take the spots, extra ones are scattered over the yard |
| critters | `seed`, `seedBase`, `speed` | placement RNG seed (default: a hash of the id), per-animal behaviour seeds (`seedBase + i`), walk speed |
| emitter | `params: { … }` | extra `Particles.createEmitter` config (it cannot override `preset`, the box or `count`) — *correction 2026-10-07, following the code (KNOWN_ISSUES GAME-20, DOC-13): a `params.rate` still changes the particle count, because `Particles` derives `count = ceil(rate × mean life)` from it (except for the precipitation presets `rain` / `snow`)* |
| region | `banner` (inspector) | arrival banner subtitle shown once when the player first enters (blank = none) |
| waterfall | `mist: { count?, alpha? }`, `splash` | spray particles (default 8 per unit of width, alpha 0.07); `splash: false` = no splash sound / ambience anchor |
| well | `sfx` | sound played when examined (default `splash`) |
| enemy | `spotOffsets: [[dx, dz], …]` | exact start spots, **relative** to x / z (the first creatures take them) |
| enemy | `area: { minX, maxX, minZ, maxZ }` | scatter rect **relative** to x / z instead of the home-radius square |
| enemy | `seed` | scatter seed (default `hashString('enemy:' + id)`) |
| enemy | `arena: { minX, maxX, minZ, maxZ }`, `gate: [dx0, dz0, dx1, dz1]` | the boss arena and its gate segment, **relative** to x / z — **required for a `golem`** |

Relative offsets move with the object when it is dragged, duplicated or rotated in the editor.
A quarter turn (Ctrl+R; R on a single object) also turns them about the object's point — NPC
`talkOffset` / `area`, critter `area` / `spotOffsets`, enemy `spotOffsets` / `area` / `arena` /
`gate`; rects stay axis-aligned, their extents swap — while an object of a group turned by another
angle keeps them as they were (a notice says so; `rotateSelection` in `editor/tools/common.js`).
`normalizeObject` converts the legacy absolute forms of npc / critters objects (`talkPoint`,
`bounds`, `spots`) to the relative ones when a level is loaded (the game reads both; the shipped
levels already use the relative forms).

Dialogue text in the inspector (`dialogueToText` / `parseDialogueText`): pages separated by blank
lines; a page ending in a bracket group **with a "|"** is a choice page (`Q? [Yes | No]`; one
choice: `Q? [Okay |]`, which the game shows as a one-item choice list); `\[`, `\]`, `\|`,
`\\` are literal characters. `dialogueToText` leaves blank choices out, so data whose non-blank
choices reduce to one is written `Q? [X |]` (the game drops blank choices too).
`mergeDialogueText(pages, text)` / `mergeLinesText(lines, text)` apply an edit so that pages the
edit did not touch are kept exactly (extra keys, blank lines, padding).
Music action: without its own closing question an NPC starts the music, or — when it plays —
asks "Another song, or a little quiet?" (the second answer stops it); a dialogue ending with its
own choice **plays** the music on any answer but the first — or on the only answer of a
one-choice page (it never stops a song).
House doors are interactive only with a non-empty `text` ("Text when knocking"); Level › Check
for problems lists houses without one.
`critterYard(obj)` and `critterStartPoints(obj, isWalkable)` (ObjectCatalog) compute the yard and
the start positions exactly like the game (`src/game/Critters.js`); the editor's 2D map and 3D
preview draw them.

## 3. Building a level — `src/engine/level/ObjectBuilder.js` (written, use it)

- `buildLevelTerrain(level, { textures, chunkSize?, tileMapOptions?, deferShore? })` → `{ tileMap, water, object, dispose }`
  (`deferShore`: the water's shore texture is not baked yet — the caller adds the colliders
  standing in the water and calls `water.refresh()` / `refreshAsync()` before the first render).
- `new LevelObjectBuilder({ textures, seed = 42, factory? })`:
  - `build(obj, tileMap)` → `BuiltObject | null` (null for actors / markers, `enemy` included — the
    combat system spawns its creatures; a `chest` / `waystone`'s `propResult.controls` are the
    prop's handles: `open()` / `setAttuned(on)`):
    `{ object, colliders, walkRects, lights (descriptors with tag & priority), emissives, emitters,
    update, interact, anchor, source, propResult, dispose }` (`interact` = the prop's
    `{ position, radius, id }`, for houses plus the optional `lookSpan: { a, b }`, the door leaf).
  - `LevelObjectBuilder.isBuildable(type)`, `factory` (the PropFactory; `factory.mergeStatic`
    batches `propResult`s for the game), `dispose()`.
- Bridges: the first plank segment of an arched deck is `arch · sin(π / 2n)` above the deck height
  (n = one segment per half unit), so a bank one level (0.5) below the deck is just too high a step
  (> 0.55) to get on or off — Level › Check for problems lists such bridge ends (with the bank's
  position) so they can be levelled, or the deck height / arch set.
- `LIGHT_PRIORITY` (`campfire` / `hearth` 0, `wallTorch` / `light` 1, `lamppost` 2, `house` 3),
  `bridgeDeckHeight(tileMap, obj)` (the bank height, never below the highest water
  surface under the span + 0.1; with no bank at either end, the water surface + 0.3), `buildWaterfall(tileMap, obj)`,
  `computeCameraBounds(level, margin)`.
- The engine budget is **12 point lights**, all created before the first frame (changing the
  light count recompiles every shader). A level may have any number of light descriptors: the
  game hands them to `LightPool` (`src/engine/lighting/LightPool.js`). With ≤ 12 descriptors each
  gets a permanent light (highest `LIGHT_PRIORITY` first, ties by level object order — exactly
  the lights of a hand-wired level; *clarified 2026-10-07 (KNOWN_ISSUES DOC-05): "highest" means
  the most important, which is the numerically **lowest** value — `campfire` 0, `wallTorch` and
  `light` 1, `lamppost` 2, `house` 3 and any other type 3*); with more, the 12 lights are re-assigned every ~0.2 s to the
  descriptors whose range touches the camera view, nearest the camera focus first (+ 1.5 units per
  priority step — `priorityWeight`: a lantern a few units away outranks a torch across the
  square; a lantern that is dark by day yields to torches and campfires; a small bonus for
  staying lit), with a fade-out → move → fade-in (0.35 s each way) when a light changes
  lantern. Each descriptor keeps its own flicker seed; `pool.flickerSource(desc)` /
  `pool.registerEmissive(material, { light: desc })` keep a lantern's glass flickering in sync
  whether or not it currently owns a light. `LightingSystem.retargetPointLight(handle, opts)`,
  `flickerAt(seed, amount, speed)` and the handle's `fade` (0..1) are the additive LightingSystem
  API it uses.

**Incremental terrain / water API** (editor use; the game builds once and never calls these):

- `TileMap.rebuildRect(map, rect)` → chunk keys | null — re-read the tiles in `rect` (inclusive
  `{minI,maxI,minJ,maxJ}`) from the edited `map` (same size) and re-bake every mesh chunk within
  2 tiles of it. Null (nothing changed) when a full rebuild is needed: size or `waterLevel`
  changed, or the terrain dips below the diorama base (`baseY` never moves here).
- `TileMap.updateTiles(map, rect, { rebase = true })` → chunk keys | null — the data half: tiles,
  heights, water surfaces and every query (`getHeight`, `tileAt`, `getWaterSurface`, walkability)
  are current at once, no mesh is touched. With `rebase` the diorama base follows the lowest tile
  exactly like a fresh build (all chunks are returned when it moves).
- `TileMap.rebuildChunks(keys)` → meshes — re-bake chunks from the current data (any order, any
  time); `TileMap.rebuildChunkSteps(key)` — the same for one chunk as a generator yielding after
  every tile row (the old meshes stay until the last step). Once every returned chunk is rebuilt
  the meshes equal a fresh `TileMap`.
- `Water.updateTiles()` → `{ flowChanged, hasWater }` — re-read the water tiles and rebuild the
  surface geometry in place (same material: no shader recompiles);
  `Water.rebakeShore(rect, { expand = true })` re-bakes the shore / depth / flow texture of those
  tiles (± `Water.shoreReach` tiles with `expand`) byte-identical to a full bake;
  `shoreJob(rect)` / `shoreInput(copy)` / `applyShore(job, bytes)` split that bake so it can run in
  a worker; `Water.rebuild(rect)` does it all at once. The bake itself is the pure function
  `bakeShore(input, a0, b0, W, H)` in `src/engine/world/WaterShore.js` (no three.js).

## 4. Saving & loading — `src/engine/level/LevelStorage.js` + `tools/vite-level-api.js` (written)

- Project folder: `public/levels/<slug>.json` via the dev-server API (`GET/PUT/DELETE /api/levels[/name]`
  under the dev server's base, only under `npm run dev`; registered in `vite.config.js`). Published
  levels load in dev and in production builds from `<BASE_URL>levels/<slug>.json` (the build is
  relative, `base: './'`: it works under any sub-path).
- Browser: `listLocalLevels, saveLocalLevel, loadLocalLevel, deleteLocalLevel` (localStorage).
- Files: `downloadLevel`, `readLevelFile`, `openLevelFileDialog`.
- `hasProjectApi, listProjectLevels, saveProjectLevel, deleteProjectLevel, loadProjectLevel, slugify`;
  `levelsApi(campaign?)` is the API folder they call (`<BASE_URL>api/levels` or a campaign's).
  `slugify` of a name without Latin letters / digits ("村の広場") is a stable `level-<hash>` (never
  the shared "untitled"); Windows device names (`con`, `nul`, `com1`…) get a `-level` suffix and
  the API refuses them. A failed PUT answers a short message (`{ error }`, shown as is) and never
  leaves `<name>.json.tmp` behind.
- Game URL: `resolveLevelFromURL()` — `?level=local:<slot>` (browser storage; the editor's play-test
  writes slot `PLAYTEST_SLOT` = `__playtest__`), `?level=<name>` (public/levels/<name>.json).

## 5. Game integration (the game loads levels)

- `public/levels/emberfall.json` is the **single source of truth** for the Emberfall demo: every
  tile, height, house, tree, lamppost, torch, prop, fence, bridge, waterfall, NPC (with `script`
  ids for the hand-written conversations), critter group, particle area, region and camera tuning
  of the demo. It was converted once from the former hand-written `src/demo/maps/emberfall.js`;
  that module and the converter no longer exist — edit the JSON (or open it in the editor). `tools/make-sample-hamlet.mjs`
  builds `public/levels/sample-hamlet.json`. `public/levels/brightwater-crossing.json` (36 × 28,
  68 objects) is the editor showcase, built only through the editor UI (File › New, terrain
  tools, the Place tool and the inspector, Save as › Project folder).
  `public/levels/cinderwatch-pass.json` (96 × 120, 277 objects: 24 enemy groups, 6 chests, 3
  waystones, 5 villagers, exactly 12 light descriptors) is the combat demo and the only shipped
  level with enemies, generated by `tools/make-cinderwatch-pass.mjs` (on the shared helpers of
  `tools/lib/levelgen.mjs`) with the 20 validation rules and the combat `coverage()` of
  [COMBAT.md §15](COMBAT.md#15-demo-level-cinderwatch-pass) (`--check` verifies the committed file
  byte for byte; [design page](../design/levels/cinderwatch-pass.md)).
  `public/levels/starfall-vale.json` (128 × 128, ~870 objects, 29 villagers) is the flagship
  showcase, generated by `tools/make-starfall-vale.mjs`: deterministic terrain passes (relief,
  water, paths as polylines with widths, stair flights, ground variety, border and deep-forest
  patches), hand-placed landmarks, rule-based tree / rock scatter and house dressing with
  exclusion zones, then a validation that must pass before the file is written (zero
  `normalizeLevel` warnings, `validateLevel`, a quarter-unit walk BFS from the spawn with the
  game's movement rules proving every NPC, door, sign, well and region reachable, bridges
  walkable end to end, stairs rising toward the higher side, waterfalls with a real drop, no
  overlapping props, a byte-stable save round trip and a feature-coverage checklist), plus
  **route checks**: walks a signpost promises (the East Road into Mirrormere Landing, the North
  Pier back to the hamlet, the King's Road from the spawn to the square and up to the
  observatory…) must stay within 1.5 × the straight distance + 3 units on the walk grid
  (Dijkstra) — a closed alley or a cut-off landing fails even when the far side can be reached
  the long way round; every named crossing (bridge, stair flight) is such a route too, and a road
  across water must run on a bridge deck. Further checks: the camera looks north, so no villager,
  door, sign, well or campfire may stand where only a house roof, a well roof or the windmill is
  seen (houses modelled with their eaves and the steepest roof pitch) and the share of road tiles
  hidden behind them is reported (≤ 3 % wanted); no hand-placed tree stands in a sightline, and no
  tree crown (modelled as `Trees.js` builds it) hides half of a villager, the spot you talk to one
  from, a door front, a sign or its reading spot, a well or a campfire — the scatter's trees that
  would hide a quarter or more are dropped after every other placement; only the lake island may
  be an unreachable pocket; critters start on walkable ground, a chase area is mostly walkable,
  wall torches hang on a wall, every object and environment rect lies on the map; and
  `normalizeLevel` must not have repaired any value (`--force` writes a failing level for
  inspection but still exits with code 1). Its `coverage()` requires every **non-combat** object
  type; the combat types are Cinderwatch's to cover, so Starfall stays peaceful. The level also sets `environment.forest` (autumn Emberwood, amber pines on
  Amberpine Heights, pines on Mount Lumen …) and `scenery.southGap: 10` (open meadow in front of
  the spawn on the south edge), `fogScale: 0.65` and `water.glint: 0.45`. It also
  shows two custom legend chars: `e` (a river flowing east, `flow: [0.45, 0]`) and `:` (the road
  beyond the border: a dirt path that is not walkable). Edit the generator and re-run it rather
  than hand-editing the JSON (or copy the JSON to a new name to continue in the editor).
- `game.html` (no query) loads Emberfall from that file; `?level=…` loads any other level.
  Loading errors are shown on the loading screen (never a blank page).
- *Added 2026-10-11:* `index.html` is the launcher, a plain page listing every project
  level and campaign with Play (`game.html?…`) and Edit (`editor.html?open=…`) links, written by
  `tools/vite-launcher.js` (dev server: every request; build: once); it ignores a query.
- `World` builds from a level object only (terrain via `buildLevelTerrain`, props via
  `LevelObjectBuilder`, then the existing tuning: static merging, tree merging, smoke look, light
  budget by priority, snow cover, forest border + outer scenery per `environment`). NPCs,
  critters, particle areas, regions, interactables (door / sign / well texts; chests and
  waystones as *Examine* items carrying the level `object` and the prop's `controls`, which the
  combat system turns into *Open* / *Rest*) come from level objects; the title screen, banner and
  HUD use `level.name` / `level.subtitle`.
- **Emberfall must look and play exactly as before** (compare fingerprints and screenshots before / after,
  [TASK_PLAYBOOKS.md §16](../ai/TASK_PLAYBOOKS.md#16-regression-check-before-you-finish)).
- **Big levels** (either side > 64 tiles, e.g. Starfall Vale, 128 × 128) get the spatial batching
  of `World.BIG_LEVEL_BATCHING` — levels up to 64 × 64 keep exactly the batching they were tuned
  with:
  - terrain in 32-tile chunks, then per material merged back into batches of ≤ 48 k triangles
    over ≤ 48 units (`TileMap.consolidateChunks`); props (`PropFactory.mergeStatic`) and trees
    (`Scenery.mergeTrees`) per material in batches of ≤ 16 k triangles over ≤ 64 / 96 units
    (`maxTriangles` / `maxExtent` / `minTriangles`, `SpatialSplit.kdSplit`); ground foliage in
    instanced meshes of ≤ 4000 tufts (`GroundDetail` `maxInstances`);
  - every batch is frustum-culled by its world bounding **box** (`SpatialSplit.cullByBox`) — a
    sphere around a flat batch stays "visible" far outside the tilted camera's view;
  - the shadows of opaque props and terrain faces are drawn by a few position-only, shadow-only
    proxies merged across materials (`ShadowCasters.buildShadowCasters`, `mergeStatic({
    shadowCasters })`; the depth pass needs no materials) and the shadow frustum's depth is
    limited around the view (`LightingSystem.setShadowDepthRange`, bias rescaled): the shadow
    pass culls without extra draw calls; sprite shadow quads draw in the shadow pass only, and the
    blob contact shadows of the player, the villagers and the critters draw in one instanced call
    (`BlobBatch`);
  - the shore texture bakes in a worker (`Water.refreshAsync`, `shoreWorker.js`) while trees,
    foliage and batches build (only static colliders shape the shore: `dynamic` ones — walking
    villagers — neither carve it nor trigger a re-bake); villagers and critters more than 42 units
    from the camera focus (1.15 × the camera distance + 4 when zoomed out further) update every 4th
    frame with the accumulated time;
  - particle areas, waterfall mist and chimney smoke whose box is more than 34 units from the
    camera focus are switched off (`BIG_LEVEL_BATCHING.particleCull`, 34: only a zoomed-out view
    reaches them, as specks in the tilt-shift blur).
  - (every level) god-ray shafts are culled by a sphere round their base (length + half the
    width: the quad follows the live sun in the vertex shader), so many `godRayAreas` cost draw
    calls only where they can be seen; `LightPool.snap()` (teleports, `talkTo`) re-lights the
    lanterns it moves in the same frame.
- The HUD minimap and the world map are drawn from `LevelMap.renderLevelMap(level)` (tile colours
  from `TILE_TYPES` shaded by height, cliffs, water, roads, roofs in their `roof` colour, bridges,
  fences, trees, wells, stalls, campfires) plus live markers; region objects name the world map
  (a region holding another region's centre is an "area" label; a name that overlaps another
  moves — round its centre, then to spots across its own region rect —, an area name that still
  finds no spot is set compact (smaller, on two lines) and tried again, and a name hides only
  when no spot is free; a name lying over the player arrow fades back). The minimap window stays
  over the map — near an edge the arrow moves off the centre instead of showing empty space; a
  map smaller than the window is centred on the colour of its border. The world map's legend
  column has a fixed width, so the map keeps its place whatever "You are in" says.
- Any small, sensible level made in the editor must be playable: spawn, walk, talk to NPCs with
  plain `dialogue` and built-in `action`s, read signs, lights at night, water, bridges.

## 6. Editor architecture — `editor.html`, `src/editor/`

```
editor.html                        entry page (Vite multi-page; already listed in vite.config.js)
src/editor/main.js                 boot: new EditorApp(document.getElementById('editor'))
src/editor/EditorState.js          (written) level document, selection, tools, view, undo/redo
src/editor/EditorApp.js            layout, menus, dialogs, shortcuts, storage & play-test flows
src/editor/textKeys.js             the text keys through edits: carry, fill, copy-on-write, shown / found
src/editor/tools/*.js              view-agnostic tools (see §7) + tools/index.js registry
src/editor/ui/*.js, editor.css     panels: toolbar, tool options & palettes, inspector,
                                   outliner, status bar, dialogs (new / open / save as / settings /
                                   resize / shortcuts / confirm)
src/editor/map2d/Map2DView.js      top-down 2D map view (canvas)
src/editor/viewport3d/*.js         live 3D diorama preview & 3D editing (Viewport3D)
```

`EditorState` (written — read it): transactions (`begin/commit/cancel`), `editTiles`, `setTile`,
`setHeight`, `addObject`, `insertObjects`, `updateObject`, `moveObjects`, `removeObjects`,
`setSpawn`, `setLevelProps`, `setLevel`, `replaceLevel`, `undo/redo`, `select`, `setTool`,
`setToolOption`, `setView`, `setHover`, `notify`, `markSaved`; events `change`, `selection`,
`tool`, `toolOptions`, `view`, `hover`, `dirty`, `history`, `status`. Tools additionally emit
`state.emit('preview')` whenever their preview changes (views redraw overlays on it).
`change` info = `{ source, terrain, rect, objects, ids, meta }`: `ids` lists the objects an edit
added, changed, moved, renamed (old and new id) or removed (`'spawn'` = the player start), or is
null when unknown (load / level replacement / a cancelled transaction: diff everything). Undo /
redo report the `rect` and `ids` of the step they undo / redo (null when the step changed
level-wide settings or did not know them). Views coalesce change events and sync once per frame.

**Saved state** (additions): every committed step has a revision id; `state.revision` is the
current one. `markSaved(fileRef, revision = state.revision)` records the revision a save wrote —
edits made while a project save was in flight keep the document dirty — and `dirty` is
`revision !== savedRevision`, so undoing back to the saved state is clean again. `markUnsaved()`:
the document is not saved anywhere (a restored autosave, a pasted level). Consecutive undo steps
share their JSON snapshot (one copy per step). `view.timeFollow` (default true): the 3D preview's
`view.timeOfDay` follows `environment.timeOfDay` (the app sets it on load / settings edits);
dragging the preview's sun slider unlinks it.

**Text keys** (additions, October 2026;
[I18N.md §4.10](../specs/I18N.md#410-keys-through-edits-the-editor-the-generators-the-tools)): the
editor keeps every text's key without the user ever typing one (`src/editor/textKeys.js` over the
engine's `TextKeys.js`), inside the edit's own transaction, so undo and redo restore keys too.
- `addObject` gives every text of the new object a key (the catalog defaults too); `insertObjects`
  (paste, duplicate) replaces a key the level already holds and keys a keyless text, so a duplicate
  gets fresh keys and a cut-and-paste keeps its own.
- `updateObject` carries keys only for the fields the edit changed; an untouched field keeps its
  keys exactly, and a keyless text the edit left as it was stays keyless. A field cleared and typed
  again gets its old keys back (an id rename takes that memory along); an unchanged text keeps a
  key the document had at load over one minted since. A key the edit brought in that another text
  of the level holds (a script line pasted with its tag, a patch's `textKeys`) is not kept.
- `setLevelProps` does the same for the level's own texts; a `textKeys` patch is merged.
- **Copy-on-write**: an edit that changes the English of a text whose key another file holds with
  other English gives the text a new key. The other files are the campaign's other level, story
  and campaign files (`state.otherTexts`, from the campaign's story context) and the file a *Save
  As* left (`addCopiedTexts`, read back through the level API). A split is remembered, so typing
  the old English back takes the shared key back.
- `assignTextKeys(label, { sources })` (Level › Assign text keys) keys every keyless text, drops
  keys on no text and gives the later text of a repeated key a new one, sharing a chapter
  variant's base's or a campaign copy's shipped level's keys first. `seedTextKeys(prefix)` makes
  new keys deterministic for scripted checks.
- `origin` is the content table the document's keys come from (the project file it was opened
  from; a *Save As* keeps it): the play-test of a level outside a campaign passes it as
  `&i18n=<origin>`.
- Opening, saving, *Save As*, autosave and export never add or change a key: a file opened and
  saved unchanged stays byte for byte. A script field and its pop-out show and compare scripts
  without tags; Apply retags against the old lines.

Views are **dumb about editing**: they translate pointer input into map coordinates and forward
it to the active tool; they render the level and the tool preview. All edits go through tools →
EditorState.

### Viewport3D contract (`src/editor/viewport3d/Viewport3D.js`)

```js
export class Viewport3D {
  constructor(container, state, { textures })   // textures: the app's shared TextureLibrary
  ready                    // Promise, resolves after the first full build
  resize()
  setResizeThrottle(ms)    // (addition) while a splitter is dragged: resize the drawing buffer at
                           //   most every ms (Engine.resizeThrottleMs; CSS stretches it meanwhile),
                           //   0 = end, apply the final size
  setActive(active)        // false = stop rendering (hidden layout)
  focusOn(x, z, { distance } = {})
  frameLevel()
  stats                    // { drawCalls, triangles, terrainMs, objects, fps } (+ cpuMs, lights,
                           //   waterMs, sceneryMs, foliageMs, pendingChunks, batches, batchMeshes…;
                           //   lights = props.lightPool.activeCount, lightDescriptors = the raw
                           //   descriptors handed to the pool)
  busy                     // (addition) mesh work still queued: terrain chunks, water, prop
                           //   builds / batches, scenery — false once the view equals a fresh build
  dispose()
}
```

### Map2DView contract (`src/editor/map2d/Map2DView.js`)

```js
export class Map2DView {
  constructor(container, state, { textures })
  resize(); setActive(active); focusOn(x, z); frameLevel(); dispose()
}
```

## 7. Tool interface (`src/editor/tools/`)

```js
// tools/index.js
export const TOOLS            // Tool[] in toolbar order
export function getTool(id)   // → Tool

/** @typedef Tool
 *  { id, label, shortcut, icon /* inline SVG string */, help /* status-bar text */,
 *    cursor: 'default'|'crosshair'|'cell'|'move'|'copy'|'pointer',
 *    activate?(state), deactivate?(state),
 *    pointerDown(ev, state), pointerMove(ev, state), pointerUp(ev, state),
 *    keyDown?(e /* KeyboardEvent */, state) → boolean (handled),
 *    preview(state) → ToolPreview | null } */

/** PointerEv (built by the views):
 *  { i, j,            tile under the pointer (may be outside the map)
 *    x, z, y,         world point on the terrain (y = ground height)
 *    button,          0 left, 1 middle, 2 right
 *    shift, ctrl, alt,
 *    view: '2d'|'3d',
 *    hitObjectId,     id of the level object under the pointer (or null)
 *    hitSpawn }       pointer is over the spawn marker */

/** ToolPreview: { cells?: {i,j}[], cellColor?: css, ghost?: levelObject (id ''), line?: {x0,z0,x1,z1},
 *                 rect?: {minX,maxX,minZ,maxZ}, label?: string } */
```

Additions (recorded 2026-09-30 from the typed copy in `tools/index.js`; additive — the members
already existed in the code):

```js
/** Tool (optional members)
 *    cursorFor?(ev, state) → string     contextual cursor over the views; falsy: `cursor`
 *  RotatableTool = Tool & { getRotation(state) → radians, setRotation(state, radians) }
 *                                       the Place tool's per-type rotation, read and set by the
 *                                       tool-options panel's rotate buttons */

/** PointerEv (more members)
 *    button           also -1 for moves: hover moves in both views; in the 2D view stroke moves
 *                     too (it passes the DOM `button`), the 3D view sends 0 for every stroke event
 *    pickRadius?      world size of ~7 screen px at the pointer (handle and drag thresholds); both
 *                     views set it, tools fall back without it
 *    cancelled?       pointerUp only, set by both views on every pointerUp: true when the stroke
 *                     was interrupted rather than released — commit nothing new. What pointerDown /
 *                     pointerMove already applied stays and is committed (the transaction is
 *                     closed); a change made on release is skipped (Rectangle, Place's region /
 *                     dragged line, Select's box selection and click-narrowing, Player start's
 *                     selecting the marker). True for a pointercancel, a lost pointer capture,
 *                     hiding the view, a lost release (a mouse move without the button, or the
 *                     same pointer pressed again; 2D since 2026-10-07, KNOWN_ISSUES ED-27); 2D
 *                     also a window blur; 3D also a tool switch, disposing the view (2D since
 *                     2026-10-01, KNOWN_ISSUES ED-16)
 *    buttons?, onTerrain?, face?: 'top'|'side'|'plane'|'none', surfaceY?, clientX?, clientY?
 *                     3D only: the DOM `buttons`, whether the ray hit the map, what it hit, the
 *                     visible surface height (the water surface on water), the client position */

/** ToolPreview (more members)
 *    label?: string|null                tooltip beside the pointer (null: none)
 *    highlight?: { ids: string[], color: css }|null   outline these objects
 *    spawn?: { x, z, facing }           a ghost player-start marker */
```

Views only forward left-button pointer events to tools (right / middle drive the camera); a
pointer stroke = `pointerDown` → `pointerMove`* → `pointerUp`, and tools wrap strokes in
`state.begin()/commit()` so one stroke = one undo step.

Required tools (shortcut): **Select/Move** (V), **Paint tiles** (B), **Fill** (G), **Rectangle** (U),
**Height** (H: raise / lower / set / flatten / smooth), **Stairs** (T: auto-orients toward the
higher neighbour), **Place object** (O: ghost preview, rotation with R, two-click / drag for lines,
drag for regions), **Player start** (P), **Eyedropper** (I), **Erase objects** (X).
Stairs (`StairsTool.stairsFor` / `planStairs`): a stairs tile at level L joins L to L + 1. A tile
whose own level fits between its low and high neighbour keeps it (a ramp sculpted one level per
tile turns into stairs as it is); the drag's axis is preferred (a vertical drag makes N/S stairs).
A stroke across a cliff more than one level high builds the whole flight on the low side of the
cliff — top − 1 next to it, one level per tile down to the ground — and leaves the top alone (and
flat ground past the foot of the flight, when the stroke began a tile or two below it); the
stroke is re-planned from the heights at its start as it grows (still one undo step), and the
status bar says how many tiles are missing when it does not reach the ground yet.
The Place tool remembers the rotation per object type (turning a house does not turn the next
lamppost). A double-click inside a region / particle area selects it (a single click picks areas
by their edge or name tag, so box selection inside big regions keeps working).
Selection: click, shift = add, ctrl = toggle, box select by dragging empty space; drag to move
(snap to 0.5, Alt = free); line endpoints and region corners have drag handles; Delete removes;
Ctrl+D duplicates; R / Shift+R rotates ±15° (Ctrl = 90°); arrow keys nudge. A click on empty
ground — or on the sky in the 3D view — clears the selection.
The Place tool's ghost carries the `opts.seed` the next placement will use (a new seed is rolled
after each placement), and the 3D ghost is rebuilt where it stands once the pointer rests (props
vary with position and seed), so it shows exactly what a click places.

## 8. UX & visual spec

- Layout: top **menu bar** (File / Edit / View / Level / Help, the level name, an unsaved-changes
  dot, **Play ▶** button), left **toolbar** + **tool options** (tile palette with real texture
  swatches from the TextureLibrary, brush size / shape, height mode, object palette by category),
  centre **viewport area** (layouts: 3D + 2D map split, 3D only, 2D only), right **inspector**
  (selected object fields from the catalog schema; multi-selection; spawn; level settings when
  nothing is selected) + **outliner** (filterable object list), bottom **status bar** (tile coords,
  tile name, height level, world position, tool help, messages, object count).
- Dark, professional game-editor look with Luminati's navy/gold accents; system-ui font for dense UI,
  Cinzel only for the logo. Crisp icons (inline SVG). Everything responsive from 1280×720 up.
- Dialogs: New level (name, size, base tile, base height, border width), Open (project / browser /
  file, with sizes & dates), Save As (name + destination: project folder (when the dev API is up),
  browser, download), Level settings (name, subtitle, author, description, environment, water;
  *added 2026-10-07, following the code (KNOWN_ISSUES DOC-13): its tabs are General, Environment,
  **Camera** and Water — the Camera tab sets `environment.camera.distance` (blank = auto, 30) and
  `.pitch` (blank = auto, 32°) and the high-ground tilt `environment.highGround` (on / off, the
  height above which it applies, its pitch)*),
  Resize (width, depth, 3×3 anchor), Keyboard shortcuts, Unsaved-changes confirmation.
- Text keys (*added October 2026*): under each translatable field the inspector shows each text's
  key read-only on a monospace line with a Copy button (a field of several texts behind a "Text
  keys (n)" toggle; the subtitle's key in Level settings); the key buttons are out of the Tab
  order. Edit › *Find by text key…* (`edit.findTextKey`) selects the text a key names (a GUID in
  any case, braces and hyphens allowed, a `#line:` tag, `<GUID>.2`). Level › *Assign text keys*
  (`level.assignTextKeys`) keys the rest in one undo step. *Check for problems* lists missing and
  stray keys (one line each) and repeated keys (a line each, at most 20); these never block the
  play-test.
- Shortcuts: Ctrl+N/O/S/Shift+S, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Delete, Ctrl+D, Ctrl+C/V, F (frame
  selection), Home (frame level), [ / ] (brush size), 1/2/3 (layouts), F5 (play-test), tool keys.
  Never steal keys while a text field has focus.
- Autosave the working copy to browser storage (slot `__autosave__`) every ~20 s while dirty and
  offer to restore it on startup. Warn before closing the tab with unsaved changes. The slot's
  meta names the editor session that wrote it; an autosave is **never overwritten unresolved**:
  when a session is about to write and the slot holds another session's copy (a dismissed restore
  prompt, a start through `?open=` / `?new` / `?local=`, another tab), that copy moves to the
  recovered copies (`src/editor/autosave.js`: slots `__recovered_<id>__`, the newest 3, one per
  session), listed under File › Open › This browser › Recovered unsaved work. `?open=` / `?local=`
  offer the restore when the autosave is a copy of that level. Explicit "Discard" drops the copy;
  "Don't save" drops this session's copy only once another level really replaced the document
  (a file that fails to load never costs the work). Opening, dropping and pasting a level read
  and check it first, then ask about unsaved changes. A failed autosave (storage full) is reported
  once and turns the unsaved dot red. Downloads (Save as › Download, Ctrl+S of a file document)
  count as saved but keep a recovery copy (flagged `exported`, not offered at start-up).
- Save As asks for the level's display name too while it is still "Untitled" (derived from the
  file name until edited). Enter in a dialog commits the focused field first, then confirms
  (buttons in the body, such as the resize anchor cells, do not swallow it). Controls outside
  dialogs hand the keyboard back after a mouse edit (dropdowns after a pick, sliders, switches,
  toolbar buttons), so tool / layout keys, arrows and Space+drag reach the views. A dropdown
  opened with the mouse and closed without a pick hands its next key to the editor (re-dispatched
  to the window) instead of changing its value; after Tab it keeps its keys.
- 3D view bar: the preview's time of day (sun slider; linked to the level's start time by
  default) and a help button with the camera controls (also in Help › Keyboard shortcuts). Space +
  left drag pans in both views. "Building the 3D preview…" shows until the first full build; big
  levels open under a loading overlay.
- **Play-test**: validate (`validateLevel`), save to the playtest slot, open
  `game.html?level=local:__playtest__&autostart=1` in a new tab (*added October 2026:* with
  `&i18n=<origin>`, the content table of the file the level's keys come from, for a level outside
  a campaign; a campaign's level plays inside its campaign). Problems are worded for the
  user ("The player start is on water…"). With `autostart` the level's music starts at the first
  key / click (like after the title screen) — unless that key is M, which toggles it on itself.
- `editor.html?open=<project level>` opens a project level at startup; `?new` starts empty.
  *Added 2026-10-07, following the code (KNOWN_ISSUES DOC-13):* `?open=<campaign>/<level>` opens
  a campaign's level file, and `?local=<slot>` opens the level saved in that browser-storage slot
  (both offer the autosave restore when the autosave is a copy of that level, see above; one
  that fails to load is reported in an alert).
- Expose `window.__editor = { app, state, tools, view3d, view2d, textures, ready3d, seedTextKeys }`
  for scripted tests (`seedTextKeys(prefix)`: deterministic text keys, I18N.md §4.10). `app.ready` resolves once the first level is loaded **and** the 3D preview exists
  (`view3d` is set — or null when it could not start); `ready3d` resolves after that, once the
  preview's first full build is done (`view3d.ready`).

## 9. Performance

60 fps while editing a 64×64 level with ~200 objects on the reference desktop GPU. Brush feedback in the 3D
view within ~100 ms (throttle full terrain rebuilds during a stroke, rebuild only changed objects —
diff by id + JSON signature; objects standing on changed tiles must be rebuilt so their height
follows). Keep a fixed pool of point lights in the 3D preview (never add / remove lights per edit).
(Addition:) the preview's fixed pool is the engine `LightPool` created with `fixed: true` and
`size` 12; edits reach it through `LightPool.setDescriptors` (via `ObjectPreview.refreshLights`,
with `reset: true` on a document load), so it ranks, culls and crossfades exactly as the game's.

**How the 3D preview keeps strokes smooth** (`Viewport3D._syncAll` / `_runJobs`):

- Edits update the level **data** at once and cheaply: `TileMap.updateTiles` (heights, water
  surfaces, every query), the draped grid around the change (16×16-tile grid chunks), props /
  markers standing on the changed tiles (footprint test, then ground samples). Change events are
  coalesced to one sync per frame and only the reported `ids` are diffed.
- The **meshes** follow through a job queue. While a transaction is open (a stroke, a drag, an
  inspector slider) at most one rebuild runs per frame: ~3.5 ms slices of the terrain chunk nearest
  the brush (`rebuildChunkSteps`; a chunk is re-baked at most every 45 ms, so the brush feedback
  stays ≈ 50–100 ms), or the water (geometry in place every ≥ 90 ms; the shore texture is re-baked
  in 12×12-tile blocks in a Web Worker, `shoreWorker.js`), or one queued prop build. Moved props and
  props whose ground moved are only **translated** meanwhile; their exact rebuild is queued for
  when the transaction ends. Outside transactions the queues drain within ~9 ms per frame.
- Once editing pauses (250 ms): props are re-batched, the scenery (forest border + outer ground)
  and — with the atmosphere preview — the ground foliage rebuild, the scenery in time slices
  (`SceneryPreview.step`, `Scenery.outerGroundSteps`); the old version stays until the new one is
  complete.
- Replaced builds (terrain, water, props, ghosts, ground-foliage fields) are freed one frame
  later, after their replacement rendered: shader programs they share are never dropped and
  recompiled. At start /
  after a load every program — including the render-target variants of the selection-outline masks
  and all overlay materials — is compiled in the background (`compileAsync`), so the first
  selection or tool preview never stalls. After a load the direct-to-canvas variants are warmed
  too. A Place-tool ghost of a type whose programs are not compiled yet (its translucent ghost
  materials and the placed object's own materials) stays hidden while `compileAsync` runs, then
  appears — no synchronous shader compile on the first hover or the first click.
- The shadow pass is re-rendered every 3rd frame while a transaction is open (every 6th when the
  smoothed frame CPU time is above 11 ms; at once when the sun / shadow camera moved), every frame
  otherwise.
- The outliner reconciles its rows by key (an added object adds one row) and only touches the rows
  whose selection state changed; box selection computes its ids once per box and stops outlining
  past 120 objects (the count label stays), and so does the selection (`MAX_OUTLINED`: a select-all
  on a big level shows the selection overlay without silhouette masks); the 2D map ends a gesture
  when its layout hides it.
- During a stroke / drag the view that is **not** being drawn in renders at half rate (the 3D
  preview while painting in the 2D map, the 2D map while painting in 3D). When the smoothed frame
  CPU time is above 11 ms (a 128 × 128 level renders for ~12 ms) the chunk re-bake slices shrink
  to 1.5 ms, and above 14.5 ms the 3D preview renders at a steady half rate during any stroke
  (a third while the stroke is in the 2D map) instead of dropping frames irregularly. Measured:
  every stroke of `sandbox/editor_perf*.json` and on a 96 × 96 level with 410 objects runs at the
  display rate; on 128 × 128 (630 objects) strokes keep p50 16.7 ms with 15–28 % of the frames at
  33 ms (was p50 35 ms). A splitter drag resizes the 3D drawing buffer at most every 100 ms
  (`setResizeThrottle`); `Engine._resize` reallocates it once per resize (not twice via
  `setPixelRatio`).
- A Place-tool ghost also compiles, in the background, the **shadow-pass** depth programs the
  placed object will need (`Viewport3D._compileShadowFor`: one proxy `MeshDepthMaterial` per
  variant three.js' `WebGLShadowMap` derives — side, alpha-tested map, custom depth material —
  compiled into a render target with the fog lifted, kept alive so the program is never
  released). The start-up / after-load warm-ups mark only the materials that were in the scene
  when they started as outline-warm (a prop placed meanwhile gets its own background compile).
- Undo / redo of a terrain step (a full object diff) still moves the props, sprites and markers
  standing on the changed tiles: a full diff marks only the objects that actually changed as
  handled.
- WebGL context loss: every GL object is tagged with the context generation it was made in, and
  deletes of objects from a lost context are skipped (no "object does not belong to this
  context" warnings after a restore); the shader warm-ups run again.
- **Static batching** (`ObjectPreview` / `PropBatcher`): the prop meshes of each 16×16-tile chunk
  are merged per material (wind-swayed tree cards baked so they render exactly like the separate
  meshes). A chunk whose props change is unbatched at once and re-merged when editing pauses; the
  original meshes stay in the scene on `BATCH_LAYER` (27) for picking (raycasts include it) and the
  selection outlines. Emberfall: ~590 draw calls instead of ~980 (shadow pass included); the
  64×64 test valley: ~720 instead of ~1370.
- **Big levels** (either side > 64 tiles): props are batched per 32×32-tile chunk
  (`BATCH_CHUNK_BIG`: a 16-tile chunk of a big village leaves many materials alone, each a draw
  call and another in the shadow pass); the terrain chunk meshes are merged per material into
  48-tile cells once editing pauses (`TerrainPreview.stepBatches` / `TerrainBatcher`; the chunk
  meshes stay in the TileMap on `BATCH_LAYER` and a cell is dissolved the moment one of its chunks
  is queued for a re-bake); the opaque casters of every merged chunk / cell (merged meshes and lone
  ones) draw into the shadow map through position-only proxies (`ShadowCasters`, like the game's
  big levels). Sprite shadow quads draw in the shadow pass only (every level). Starfall Vale
  (128 × 128, 874 objects, split layout): ~915 draw calls instead of ~2870 (shadow pass ~190
  instead of ~1000), idle at the display rate (render ≈ 13 ms of CPU per frame instead of 24),
  strokes (paint / height / move in the 2D map and the 3D view) at
  frame p50 18 ms, p95 18–36 ms, worst frame 36–54 ms on a quiet machine (were p95 33–50, worst
  50–117 ms); the exactness check still holds; a chunk merge takes ≤ 14 ms, a cell ≤ 24 ms, once
  per edit pause.
- The final result is exact: once `Viewport3D.busy` is false, the terrain meshes, the water mesh
  and shore texture (byte for byte) and every prop equal a fresh full build
  (`sandbox/editor_perf*.json` checks it after every stroke series).

Measured with real mouse drags in the split layout (`sandbox/editor_perf.json`,
`editor_perf.stress.json`; in-page rAF recorder; the headless compositor runs at ~56 Hz):
paint / height / move strokes in the 2D map and in the 3D view, water painting with a 5-brush,
lowering river banks, 9-wide set-height strokes, dragging 60 objects and undo / redo bursts all
run at the display rate — frame p95 ≈ 18 ms, max ≤ 36 ms (one or two frames per stroke) — where
paint strokes used to reach p95 68 ms / max 230 ms, height p95 168 ms and drags max 380 ms.
