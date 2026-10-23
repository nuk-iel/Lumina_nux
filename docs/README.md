# Luminati documentation

English | [简体中文](README.zh-CN.md)

> **Purpose.** The index of Luminati's documentation: what the project is, every document with a
> one-line summary, reading paths for four kinds of reader, and which document is the source of
> truth for which question. Start here (or on the visual [landing page](index.html)).
>
> **Audience.** Everyone: players, level designers, engine and tool developers, and AI agents
> starting a fresh session.
>
> **Source of truth.** The code — [`src/`](../src/), [`tools/`](../tools/),
> [`sandbox/`](../sandbox/), [`public/levels/`](../public/levels/) — and the engine and feature
> contracts listed in the [contract index](contracts/README.md).
> Where a document and the code disagree, check the
> implementation and update the document.
>
> **Related.** [Root README](../README.md) (features, controls, performance at a glance) ·
> [`AGENTS.md`](../AGENTS.md) (shared guidance for coding agents) · [Glossary](GLOSSARY.md)

![Starfall Vale — the Three Sisters falls on Mount Lumen at 17:24, golden hour: terraced pixel-art meadows, cascading falls with spray, wooden bridges and the tilt-shift blur of a roof in the foreground; the location plate top left, the clock and the minimap top right](assets/screenshots/starfall-three-sisters-falls.jpg)

**Luminati** is a 2.5D pixel-art engine inspired by Square Enix's HD-2D games, built on three.js r186
with plain JavaScript ES modules: pixel-art sprites and textures standing in a lit, shadowed,
tilt-shift-blurred 3D diorama, with a 24-hour lighting palette, weather, particles, god rays,
procedural music and a gilded pixel-art UI. **Game art and audio are generated at runtime** — textures,
character sheets, props, sounds and music. UI fonts are external dependencies; documentation
screenshots and UI sandbox backdrops are checked into the repository. Three front
ends share the engine: a demo **game** that plays `luminati-level` JSON files (six shipped levels,
from the 28 × 22 hamlet Willowmere to the 128 × 128 Starfall Vale and town of Gildhaven, including **Cinderwatch Pass**,
the one level with real-time ARPG combat), a visual **level editor** with a live diorama preview, and
standalone **sandbox** pages that test one module each. The site's front page is the **launcher**: a
plain list of every campaign and level with links into the game and the editor. A headless-Chrome
**harness** (`npm run check`) verifies browser behavior, Node self-tests cover data and tooling, and
`npm run typecheck` checks the JavaScript against its JSDoc types (`tsc`, no `.ts` files).

---

## Contents

- [Quick start](#quick-start)
- [Reading paths](#reading-paths)
- [The documentation tree](#the-documentation-tree)
- [Which document is the source of truth for what](#which-document-is-the-source-of-truth-for-what)
- [Keeping the docs correct](#keeping-the-docs-correct)

---

## Quick start

Use Node.js 24 (recommended; minimum 22.12) and npm. From the repository root:

```bash
npm install
npm run dev          # http://127.0.0.1:5173/ (launcher) · /game.html (game) · /editor.html (level editor) · /sandbox/ · /docs/index.html
npm run check -- --page=game.html --query=autostart=1 --out=demo --wait=6000    # headless check
npm run typecheck    # type-check the JavaScript through its JSDoc (0 errors expected)
npm run docs:check   # validate every link, image and anchor in the docs
npm run level:check -- brightwater-crossing   # the generators' level checks on any level file
```

Details: [user/GETTING_STARTED.md](user/GETTING_STARTED.md).

---

## Reading paths

### (a) I want to play

1. [user/GETTING_STARTED.md](user/GETTING_STARTED.md) — install, `npm run dev`, the URLs and
   `?level=` parameters, troubleshooting.
2. [user/PLAYING_THE_GAME.md](user/PLAYING_THE_GAME.md) — controls (keyboard and gamepad), the HUD
   and maps, talking, time and weather, photo mode, the levels, guided tours of Emberfall and
   Starfall Vale, combat on Cinderwatch Pass, and the three languages (English, 日本語, 中文).
3. [user/shortcuts.html](user/shortcuts.html) — a printable one-page cheat-sheet of every key.
4. Curious what you are looking at? [features/FEATURES.md](features/FEATURES.md) and the
   [landing page](index.html).

### (b) I want to build levels

1. [user/GETTING_STARTED.md](user/GETTING_STARTED.md) — run the dev server (the editor can save
   into the project only under `npm run dev`).
2. [user/LEVEL_EDITOR_GUIDE.md](user/LEVEL_EDITOR_GUIDE.md) — the editor manual, with a
   15-minute tutorial ("Thistledown").
3. [design/LEVEL_DESIGN_GUIDE.md](design/LEVEL_DESIGN_GUIDE.md) — rules learned the hard way: the
   camera looks north, cliffs vs steps, bridges, water, light budgets, density, regions.
4. [specs/OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md) — every object type and field, dialogue
   syntax, villager actions and behaviours.
5. The shipped levels as worked examples: [Willowmere](design/levels/sample-hamlet.md) (small,
   scripted), [Brightwater Crossing](design/levels/brightwater-crossing.md) (built in the editor),
   [Emberfall](design/levels/emberfall.md) (the reference village),
   [Starfall Vale](design/levels/starfall-vale.md) (128 × 128, generated),
   [Gildhaven](design/levels/gildhaven.md) (a 128 × 128 town, generated),
   [Cinderwatch Pass](design/levels/cinderwatch-pass.md) (96 × 120, generated, combat).
   A story of several levels: [specs/CAMPAIGN_FORMAT.md](specs/CAMPAIGN_FORMAT.md), its story
   language [specs/STORY_SCRIPT.md](specs/STORY_SCRIPT.md) and the demo campaigns
   [The Ferryman's Lantern](design/campaigns/ferrymans-lantern.md) and
   [Emberfall — Open Doors](design/campaigns/emberfall-interiors.md) (rooms behind every door).
6. Writing levels by hand or with a script: [specs/LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) and
   [specs/LEVEL_STORAGE_API.md](specs/LEVEL_STORAGE_API.md).
7. The look you are designing for: [design/VISUAL_DESIGN.md](design/VISUAL_DESIGN.md).

### (c) I want to extend the engine, the game or the editor

1. [architecture/OVERVIEW.md](architecture/OVERVIEW.md) — programs, layering rules, the frame
   loop, shared uniforms, the level pipeline, where state lives. The same in pictures:
   [architecture/diagrams.html](architecture/diagrams.html).
2. [development/DEVELOPMENT_WORKFLOW.md](development/DEVELOPMENT_WORKFLOW.md) and
   [development/CONVENTIONS.md](development/CONVENTIONS.md) — the daily loop, sandbox-first work,
   regression practice, code conventions and the JSDoc type check.
3. The area you are changing:
   - engine modules — [architecture/modules/README.md](architecture/modules/README.md) (index of
     `core`, `audio`, `render`, `pixel`, `sprite`, `fx`, `lighting`, `world`, `level`, `ui`);
   - rendering — [architecture/RENDER_PIPELINE.md](architecture/RENDER_PIPELINE.md);
   - the game — [architecture/GAME.md](architecture/GAME.md); its combat —
     [contracts/COMBAT.md](contracts/COMBAT.md) (binding) and [GAME.md §15](architecture/GAME.md#15-combat-combat-levels-only);
   - the editor — [architecture/EDITOR.md](architecture/EDITOR.md);
   - speed — [architecture/PERFORMANCE.md](architecture/PERFORMANCE.md).
4. [contracts/README.md](contracts/README.md) — what is binding, and the additive rule for
   changing a contract ([`ARCHITECTURE.md`](../ARCHITECTURE.md),
   [contracts/LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md), [contracts/COMBAT.md](contracts/COMBAT.md)).
5. [ai/TASK_PLAYBOOKS.md](ai/TASK_PLAYBOOKS.md) — step-by-step recipes (new object type, tile,
   particle preset, post effect, texture, character, NPC action, input action, UI component,
   editor tool, level field, generator, dependency upgrade, enemy kind, combat tuning, campaigns,
   stories, translations and display sites…); they are just as useful to humans.
6. [development/TESTING_AND_VERIFICATION.md](development/TESTING_AND_VERIFICATION.md) and
   [specs/AUTOMATION_API.md](specs/AUTOMATION_API.md) — how to prove a change works.
7. Before you start: [ai/KNOWN_ISSUES.md](ai/KNOWN_ISSUES.md); for design rationale,
   read the relevant architecture or contract document.

### (d) I am an AI agent starting a fresh session

1. **[ai/AGENT_ONBOARDING.md](ai/AGENT_ONBOARDING.md) — read it first, completely.** It gives the
   17 golden rules (light count, shader warm-up, determinism, byte-stable levels, the big-level
   path, the type check, untrusted level names…), the repository map, the verification loop and a "where to find X" index.
2. [ai/KNOWN_ISSUES.md](ai/KNOWN_ISSUES.md) — the "most important gotchas" list at the top, then
   the section for your area.
3. [ai/TASK_PLAYBOOKS.md](ai/TASK_PLAYBOOKS.md) — the recipe for your task, if there is one.
4. The canonical reference for the area (see the [source-of-truth table](#which-document-is-the-source-of-truth-for-what)),
   then the code it names.
5. [specs/AUTOMATION_API.md](specs/AUTOMATION_API.md) — `window.__game`, `window.__editor`, the
   harness steps; [development/TESTING_AND_VERIFICATION.md](development/TESTING_AND_VERIFICATION.md)
   for the regression checks to run before you finish.
6. When you change behaviour, update the canonical doc and [ai/KNOWN_ISSUES.md](ai/KNOWN_ISSUES.md),
   then run `npm run docs:check`.

---

## The documentation tree

Every file, with what it is for. Documents marked **binding** are contracts; everything else
describes the code.

- **[README.md](README.md)** — this index.
- **[index.html](index.html)** — the visual landing page: screenshots, feature tiles, level cards,
  a gallery and links to every document (self-contained; works from `file://` and `/docs/`).
- **[GLOSSARY.md](GLOSSARY.md)** — the project's vocabulary, including the words with two meanings
  (_level_, _emitter_, _light_, _marker_…) and the combat terms (hit-stop, telegraph, attack token…).
- **`assets/screenshots/`** — curated JPEG captures used by the docs (game, combat, editor,
  sandboxes).
- **ai/** — for AI agents (and humans who want the fast tour)
  - [AGENT_ONBOARDING.md](ai/AGENT_ONBOARDING.md) — start here: what Luminati is, the 10-minute
    orientation, repository map, golden rules, verification loop and environment requirements.
  - [TASK_PLAYBOOKS.md](ai/TASK_PLAYBOOKS.md) — 27 recipes for recurring changes, with the files to
    touch, gotchas and how to verify; tested harness snippets.
  - [KNOWN_ISSUES.md](ai/KNOWN_ISSUES.md) — every known limitation, open issue and trap by area,
    with status and suggested direction; documentation discrepancies; stale code comments.
- **user/** — for players and level designers
  - [GETTING_STARTED.md](user/GETTING_STARTED.md) — requirements, install, dev server, the launcher
    and URL parameters, build and deploy, troubleshooting.
  - [PLAYING_THE_GAME.md](user/PLAYING_THE_GAME.md) — the player's guide: controls, HUD, dialogue,
    time and weather, photo mode, debug panel, the levels and guided tours.
  - [LEVEL_EDITOR_GUIDE.md](user/LEVEL_EDITOR_GUIDE.md) — the editor manual: views, tools,
    palettes, inspector, saving, autosave, play-test, a tutorial and the editor's limits.
  - [shortcuts.html](user/shortcuts.html) — printable keyboard and gamepad cheat-sheet for the game
    and the editor.
- **features/**
  - [FEATURES.md](features/FEATURES.md) — the feature catalogue: every capability by area, with
    its code, its canonical doc and a status; counts at a glance; what Luminati does not do.
- **specs/** — normative references for data and interfaces
  - [LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) — the `luminati-level` v1 file, field by field:
    terrain, heights and walkability, stairs, water, environment, spawn, normalisation, validation,
    byte-stable serialisation, a complete example.
  - [OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md) — the object types: fields, defaults, what the
    game builds, lights and priorities, villagers, critters, particle areas, regions, campaign
    exits and entrances, the story fields.
  - [INPUT_AND_CONTROLS.md](specs/INPUT_AND_CONTROLS.md) — input actions and default bindings, the
    game's per-state behaviour, the editor's shortcuts and key dispatch order.
  - [AUTOMATION_API.md](specs/AUTOMATION_API.md) — page globals (`__game`, `__luminati`,
    `__engine`, `__editor`), query parameters, the harness CLI and every action-script step,
    recipes.
  - [LEVEL_STORAGE_API.md](specs/LEVEL_STORAGE_API.md) — `LevelStorage`, browser slots and keys,
    autosave and recovery, the dev-server REST API (campaign routes included), URL resolution, file
    import / export, security notes.
  - [CAMPAIGN_FORMAT.md](specs/CAMPAIGN_FORMAT.md) — campaigns, stories of several levels: the
    campaign folder and `campaign.json`, exits and entrances, the campaign plane and seams, story
    flags, conditions and chapters, switching levels in the game, saved games, the editor, the
    checks.
  - [STORY_SCRIPT.md](specs/STORY_SCRIPT.md) — the story: conditions, the script language and its
    commands, `event` objects and triggers, talk scripts and actors, story files (items, quests,
    actors, start presets), runs, cutscenes, live presence, the journal, saves, checks and tests.
  - [PARTY.md](specs/PARTY.md) — the party: villagers who join the player, the follow, companions
    in combat and their rules (presets, fields, classes), the tactics panel, the story's `party`
    commands, saves, the Cinderwatch demo (Ilse, Rook and Sela).
  - [PIXEL_UI.md](specs/PIXEL_UI.md) — the pixel UI (the UI's contract and, with
    the code, its reference): the art scale (`--px`, `--fpx`, small screens), the art kit and type
    roles with their API, the root, every component's recipe with sizes in art px, the interfaces
    between components and callers, and implementation notes.
  - [I18N.md](specs/I18N.md) — the languages (English, Japanese, Simplified Chinese): choosing one,
    UI string tables and who registers them, content text translated at display (text keys held
    in the data as GUIDs and kept through edits, `loc()` / `term()`, the tables in `public/i18n/`,
    extraction, the checker, the key tool, the worklist and PO exchange, the tours), the fonts
    (Google first, else `dist/`; the aliases and the pixel glyphs).
  - [I18N_GLOSSARY.md](specs/I18N_GLOSSARY.md) — every name and term of the shipped levels and
    campaigns in Japanese and Chinese, the translators' style notes and the UI vocabulary.
- **architecture/** — how the code is built
  - [OVERVIEW.md](architecture/OVERVIEW.md) — the big picture: system context, dependency rules,
    module map, frame loop, shared uniforms, level pipeline, editor data flow, units, colour
    management, startup, state, invariants.
  - [RENDER_PIPELINE.md](architecture/RENDER_PIPELINE.md) — renderer setup, scene composition,
    shader patches, shadows, the 24-hour lighting model, PostFX passes and settings, warm-up.
  - [PERFORMANCE.md](architecture/PERFORMANCE.md) — budgets, measurements (Emberfall, Starfall Vale,
    the editor), every scalability mechanism, how to measure, known limits.
  - [GAME.md](architecture/GAME.md) — the game: boot, loading, modes, frame order,
    interaction and dialogue, camera, world building, player, villagers, critters, weather, audio
    director, resolution governor, and how a campaign switches levels (`swapLevel`).
  - [EDITOR.md](architecture/EDITOR.md) — the level editor: `EditorApp`, `EditorState` and
    transactions, the tool interface, the 2D map, the 3D viewport and its incremental rebuilds,
    save / autosave / play-test, keeping the preview in sync with the game.
  - [diagrams.html](architecture/diagrams.html) — six hand-drawn figures: module dependencies, the
    frame loop, the render pipeline, the level build, editor data flow, light-pool assignment.
  - **modules/** — the canonical per-module engine reference
    - [README.md](architecture/modules/README.md) — index of the engine areas, dependency diagram,
      the full public API of `src/engine/index.js`, sandbox pages.
    - [core.md](architecture/modules/core.md) — `Engine`, `Input`, `CameraRig`, `EventEmitter`,
      constants, seeded math.
    - [audio.md](architecture/modules/audio.md) — `AudioSystem`: procedural sfx, ambience layers,
      music.
    - [render.md](architecture/modules/render.md) — `PostFX`, the post shaders, `GlobalUniforms`.
    - [pixel.md](architecture/modules/pixel.md) — `PixelCanvas`, `Palette`, `TextureLibrary` (46
      textures), `CharacterSprites` (14 presets, 4 creatures), `PropSprites` (23 kinds).
    - [sprite.md](architecture/modules/sprite.md) — `Sprite3D`, `SpriteManager`, `Foliage`,
      `BlobBatch`.
    - [fx.md](architecture/modules/fx.md) — `Particles` (12 presets) and `GodRays`.
    - [lighting.md](architecture/modules/lighting.md) — `LightingSystem` (13 keyframes),
      `LightPool`, `Sky`.
    - [world.md](architecture/modules/world.md) — `TileMap`, `Water`, `PropFactory` and
      `props/*`, `SpatialSplit`, `ShadowCasters`.
    - [level.md](architecture/modules/level.md) — `LevelFormat`, `ObjectCatalog`, `ObjectBuilder`,
      `LevelStorage`, `LevelMap`.
    - [ui.md](architecture/modules/ui.md) — the DOM overlay: dialog, banner, title, HUD, minimap and
      world map, prompt, fader, debug panel, `ui.css`.
- **design/** — the look and the levels
  - [VISUAL_DESIGN.md](design/VISUAL_DESIGN.md) — what makes up the 2.5D pixel-art look and where every part of the
    look is set: pixel density, palette, sprites, camera, post values, lighting, weather, UI.
  - [LEVEL_DESIGN_GUIDE.md](design/LEVEL_DESIGN_GUIDE.md) — level design rules with the reason and
    the check behind each; a pre-ship checklist.
  - **levels/** — one design document per shipped level
    - [emberfall.md](design/levels/emberfall.md) — Emberfall, the 48 × 40 reference village (the
      default level).
    - [starfall-vale.md](design/levels/starfall-vale.md) — Starfall Vale, the generated 128 × 128
      showcase.
    - [brightwater-crossing.md](design/levels/brightwater-crossing.md) — Brightwater Crossing, the
      36 × 28 hamlet built entirely in the editor.
    - [sample-hamlet.md](design/levels/sample-hamlet.md) — Willowmere, the small scripted sample
      level.
    - [cinderwatch-pass.md](design/levels/cinderwatch-pass.md) — Cinderwatch Pass, the generated
      96 × 120 combat level (camp, glade, two branches, quarry, the Cinderheart boss; three
      companions who join, balanced for a party of four).
    - [gildhaven.md](design/levels/gildhaven.md) — Gildhaven, the generated 128 × 128 walled river
      town on fair day (68 villagers; how its streets are spaced for the north-looking camera).
  - **campaigns/** — one design document per shipped campaign
    - [ferrymans-lantern.md](design/campaigns/ferrymans-lantern.md) — The Ferryman's Lantern, the
      generated demo campaign: four places, seams, a locked door, a combat level, two chapters.
    - [emberfall-interiors.md](design/campaigns/emberfall-interiors.md) — Emberfall — Open Doors,
      the generated rooms demo: Emberfall's map with a furnished room behind every door, upper
      floors, the furniture and its placement, measured travel times.
- **development/** — working on the repository
  - [DEVELOPMENT_WORKFLOW.md](development/DEVELOPMENT_WORKFLOW.md) — setup, layout, running and
    building, sandbox-first work, levels, regression practice and platform notes.
  - [TESTING_AND_VERIFICATION.md](development/TESTING_AND_VERIFICATION.md) — the harness in depth,
    action scripts, sandboxes, the type check and what it catches, measuring performance, visual
    regression, pre-commit checklist.
  - [CONVENTIONS.md](development/CONVENTIONS.md) — the code conventions and the reasons for them,
    including the JSDoc typing rules, the type check and where the contract types live (§3.1).
- **contracts/** — binding documents and builder notes
  - [README.md](contracts/README.md) — what is binding, precedence, how to change a contract,
    known differences between the contracts and the code.
  - [LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md) — **binding**: level format, object catalog,
    builder, storage, editor architecture, tool interface, UX, performance design.
  - [COMBAT.md](contracts/COMBAT.md) — **binding**: the ARPG combat — per-level enabling, controls,
    player rules, enemies and the boss, runtime interfaces, sprites, VFX, audio, UI, the combat
    catalog types, Cinderwatch Pass, budgets, tests, and the deviations recorded at integration.
  - [MODULE_NOTES.md](contracts/MODULE_NOTES.md) — descriptive: what each engine module's builders
    and auditors reported (with an errata table of the stale statements).

Outside `docs/`: the root [`README.md`](../README.md) (features, controls, performance),
[`ARCHITECTURE.md`](../ARCHITECTURE.md) (**binding** engine contract: the visual target,
conventions, module APIs), [`AGENTS.md`](../AGENTS.md) (shared coding-agent guidance) and
[`CLAUDE.md`](../CLAUDE.md) (the Claude Code entry point).

---

## Which document is the source of truth for what

The code is always the final truth. For each question, this is the document written against the
code that answers it — link to it rather than repeating it.

| Question                                                           | Canonical document                                                                                                                     | Binding contract / code                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How do I install, run, build, deploy?                              | [user/GETTING_STARTED.md](user/GETTING_STARTED.md)                                                                                     | [`package.json`](../package.json), [`vite.config.js`](../vite.config.js)                                                                                                                                                                                                                                             |
| What are the controls?                                             | [user/PLAYING_THE_GAME.md](user/PLAYING_THE_GAME.md) (players), [specs/INPUT_AND_CONTROLS.md](specs/INPUT_AND_CONTROLS.md) (normative) | `DEFAULT_BINDINGS` / `DEFAULT_PAD_BINDINGS` in [`Input.js`](../src/engine/core/Input.js)                                                                                                                                                                                                                             |
| How do I use the level editor?                                     | [user/LEVEL_EDITOR_GUIDE.md](user/LEVEL_EDITOR_GUIDE.md)                                                                               | [`src/editor/`](../src/editor/EditorApp.js)                                                                                                                                                                                                                                                                          |
| What can Luminati do, and where is it implemented?                 | [features/FEATURES.md](features/FEATURES.md)                                                                                           | —                                                                                                                                                                                                                                                                                                                    |
| How does combat work (rules, enemies, boss, APIs)?                 | [contracts/COMBAT.md](contracts/COMBAT.md), [architecture/GAME.md §15](architecture/GAME.md#15-combat-combat-levels-only)              | [`src/game/combat/`](../src/game/combat/CombatSystem.js)                                                                                                                                                                                                                                                             |
| What is in a level file?                                           | [specs/LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md)                                                                                         | [contracts/LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md) §1, [`LevelFormat.js`](../src/engine/level/LevelFormat.js)                                                                                                                                                                                                    |
| Which object types exist, with which fields?                       | [specs/OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md)                                                                                     | [contracts/LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md) §2, [`ObjectCatalog.js`](../src/engine/level/ObjectCatalog.js)                                                                                                                                                                                                |
| How do several levels make one story (campaigns, exits, saves)?    | [specs/CAMPAIGN_FORMAT.md](specs/CAMPAIGN_FORMAT.md)                                                                                   | [`src/game/campaign/`](../src/game/campaign/CampaignRuntime.js), [`Travel.js`](../src/engine/level/Travel.js)                                                                                                                                                                                                        |
| How do I write dialogue, events, quests and cutscenes?             | [specs/STORY_SCRIPT.md](specs/STORY_SCRIPT.md)                                                                                         | [`StoryScript.js`](../src/engine/level/StoryScript.js), [`src/game/story/`](../src/game/story/StoryRunner.js)                                                                                                                                                                                                        |
| How do companions join, follow and fight (the party)?              | [specs/PARTY.md](specs/PARTY.md)                                                                                                       | [`PartyRules.js`](../src/engine/level/PartyRules.js), [`src/game/party/`](../src/game/party/Party.js)                                                                                                                                                                                                                |
| How is the UI drawn (scale, art, type, components)?                | [specs/PIXEL_UI.md](specs/PIXEL_UI.md), [architecture/modules/ui.md](architecture/modules/ui.md)                                       | [`src/engine/ui/`](../src/engine/ui/UI.js) (`UiScale.js`, `art/`, `layout/`)                                                                                                                                                                                                                                         |
| How do languages, translations and fonts work?                     | [specs/I18N.md](specs/I18N.md), [specs/I18N_GLOSSARY.md](specs/I18N_GLOSSARY.md) (names and terms)                                     | [`src/engine/i18n/`](../src/engine/i18n/I18n.js) (the keys: [`ContentKeys.js`](../src/engine/i18n/ContentKeys.js), [`TextKeys.js`](../src/engine/i18n/TextKeys.js)), [`public/i18n/`](../public/i18n/index.json), [`tools/i18n-keys.mjs`](../tools/i18n-keys.mjs), [`FontLoader.js`](../src/engine/ui/FontLoader.js) |
| Where are levels stored; the dev-server API?                       | [specs/LEVEL_STORAGE_API.md](specs/LEVEL_STORAGE_API.md)                                                                               | [contracts/LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md) §4, [`LevelStorage.js`](../src/engine/level/LevelStorage.js), [`vite-level-api.js`](../tools/vite-level-api.js)                                                                                                                                               |
| How do I script or test the game and the editor?                   | [specs/AUTOMATION_API.md](specs/AUTOMATION_API.md), [development/TESTING_AND_VERIFICATION.md](development/TESTING_AND_VERIFICATION.md) | [`tools/check.mjs`](../tools/check.mjs)                                                                                                                                                                                                                                                                              |
| What does engine module X expose?                                  | [architecture/modules/](architecture/modules/README.md)                                                                                | [`ARCHITECTURE.md`](../ARCHITECTURE.md) §4, [`src/engine/index.js`](../src/engine/index.js)                                                                                                                                                                                                                          |
| How do the pieces fit together; what runs each frame?              | [architecture/OVERVIEW.md](architecture/OVERVIEW.md)                                                                                   | [`Engine.js`](../src/engine/core/Engine.js), [`Game.js`](../src/game/Game.js)                                                                                                                                                                                                                                        |
| How is a frame rendered; shaders; lighting?                        | [architecture/RENDER_PIPELINE.md](architecture/RENDER_PIPELINE.md)                                                                     | [`PostFX.js`](../src/engine/render/PostFX.js), [`LightingSystem.js`](../src/engine/lighting/LightingSystem.js)                                                                                                                                                                                                       |
| How fast is it, and what keeps it fast?                            | [architecture/PERFORMANCE.md](architecture/PERFORMANCE.md)                                                                             | [`ARCHITECTURE.md`](../ARCHITECTURE.md) §1 (budgets), `BIG_LEVEL_BATCHING` in [`World.js`](../src/game/World.js)                                                                                                                                                                                                     |
| How does the game work?                                            | [architecture/GAME.md](architecture/GAME.md)                                                                                           | [`src/game/`](../src/game/Game.js), [`src/main.js`](../src/main.js)                                                                                                                                                                                                                                                  |
| How does the editor work?                                          | [architecture/EDITOR.md](architecture/EDITOR.md)                                                                                       | [contracts/LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md) §6–§9                                                                                                                                                                                                                                                         |
| Why does the scene look the way it does; which constant sets what? | [design/VISUAL_DESIGN.md](design/VISUAL_DESIGN.md)                                                                                     | [`ARCHITECTURE.md`](../ARCHITECTURE.md) §1, [`src/game/config.js`](../src/game/config.js)                                                                                                                                                                                                                            |
| How should I lay out a level?                                      | [design/LEVEL_DESIGN_GUIDE.md](design/LEVEL_DESIGN_GUIDE.md)                                                                           | the validators in [`make-starfall-vale.mjs`](../tools/make-starfall-vale.mjs), `validateLevel`                                                                                                                                                                                                                       |
| What is in level X and how do I change it safely?                  | [design/levels/](design/levels/emberfall.md)                                                                                           | [`public/levels/`](../public/levels/) and its generator                                                                                                                                                                                                                                                              |
| How do I make change Y safely?                                     | [ai/TASK_PLAYBOOKS.md](ai/TASK_PLAYBOOKS.md)                                                                                           | —                                                                                                                                                                                                                                                                                                                    |
| What is broken, limited or a trap?                                 | [ai/KNOWN_ISSUES.md](ai/KNOWN_ISSUES.md)                                                                                               | —                                                                                                                                                                                                                                                                                                                    |
| Which code conventions apply?                                      | [development/CONVENTIONS.md](development/CONVENTIONS.md)                                                                               | [`ARCHITECTURE.md`](../ARCHITECTURE.md) §2                                                                                                                                                                                                                                                                           |
| How is the JavaScript type-checked; where are the contract types?  | [development/CONVENTIONS.md §3.1](development/CONVENTIONS.md#31-the-type-check)                                                        | [`tsconfig.json`](../tsconfig.json), [`level/types.d.ts`](../src/engine/level/types.d.ts), [`combat/types.d.ts`](../src/game/combat/types.d.ts), [`globals.d.ts`](../src/globals.d.ts)                                                                                                                               |
| How do I work day to day; git; Windows?                            | [development/DEVELOPMENT_WORKFLOW.md](development/DEVELOPMENT_WORKFLOW.md)                                                             | —                                                                                                                                                                                                                                                                                                                    |
| What may I change in a contract, and how?                          | [contracts/README.md](contracts/README.md)                                                                                             | [`ARCHITECTURE.md`](../ARCHITECTURE.md), [contracts/LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md)                                                                                                                                                                                                                      |
| Why was it built this way?                                         | [architecture/OVERVIEW.md](architecture/OVERVIEW.md), then the relevant module or contract                                             | The implementation named in each document                                                                                                                                                                                                                                                                            |
| How should I interpret measurements?                               | [architecture/PERFORMANCE.md](architecture/PERFORMANCE.md)                                                                             | Re-run the documented checks for the current revision and environment                                                                                                                                                                                                                                                |
| What does a term mean?                                             | [GLOSSARY.md](GLOSSARY.md)                                                                                                             | —                                                                                                                                                                                                                                                                                                                    |

---

## Keeping the docs correct

- **Every document starts with a header block** — purpose, audience, source of truth (the code it
  describes), related docs. Keep it when you edit; give a new document one.
- **Link, don't duplicate.** Each topic has one canonical document (the table above); other
  documents summarise in a sentence and link to it.
- **Refer to code by relative path and symbol name**, never by line number
  (`[TileMap.js](../src/engine/world/TileMap.js)` `move`).
- **The code wins.** When a document and the code disagree, fix the document; if the document is
  a binding contract, change it only additively ([contracts/README.md](contracts/README.md)) and
  record the difference in [ai/KNOWN_ISSUES.md](ai/KNOWN_ISSUES.md#documentation-discrepancies).
- **Contracts have typed copies.** The level format, the combat interfaces, the tool interface and
  the automation hooks are also declared as types the code is checked against
  ([development/CONVENTIONS.md §3.1](development/CONVENTIONS.md#31-the-type-check)); those types
  follow the code. When a contract document and its types disagree, the types are usually right —
  check the code and fix the document.
- **Numbers carry their conditions** (revision, viewport, render settings, scene and time of day).
  Historical measurements live in [architecture/PERFORMANCE.md](architecture/PERFORMANCE.md);
  they are examples, not portable performance guarantees. Avoid personal workstation identifiers.
- **HTML pages** ([index.html](index.html), [user/shortcuts.html](user/shortcuts.html),
  [architecture/diagrams.html](architecture/diagrams.html)) are self-contained (inline CSS and SVG,
  no external resources), follow the light / dark preference and must work from `file://` and from
  `/docs/` on the dev server. Check them with
  `npm run check -- --page=docs/<file>.html --query= --out=<name> --wait=1000 --fps=0` and read the
  screenshot.
- **Run `npm run docs:check`** ([`tools/check-docs-links.mjs`](../tools/check-docs-links.mjs))
  after every change: it validates every relative link, image and `#anchor` (GitHub-style heading
  slugs, also used by current GitLab) in `docs/` and all root Markdown files and exits with code 1
  on a broken one.
- **Keep documentation public and portable.** Use repository-relative paths and generic setup
  examples. Do not include personal usernames, absolute workspace paths, private URLs, credentials
  or unpublished session reports. A fresh checkout should contain every referenced document.
