# AI agent onboarding — start here

English | [简体中文](AGENT_ONBOARDING.zh-CN.md)

> **Purpose.** The first file a fresh AI coding session (or a new human contributor) should read.
> It says what Luminati is, which documents to read for which kind of task, where everything lives,
> the invariants that are easy to break, how to verify a change, and how to coordinate larger changes.
> It is deliberately short on API detail and links to the canonical references instead.
>
> **Audience.** AI agents starting work on the project with no prior context; humans who want the
> fast tour.
>
> **Source of truth.** The code: [`src/`](../../src/), [`tools/`](../../tools/),
> [`sandbox/`](../../sandbox/), [`public/levels/`](../../public/levels/). Binding contracts:
> [`ARCHITECTURE.md`](../../ARCHITECTURE.md) (engine) and
> [`docs/contracts/LEVEL_EDITOR.md`](../contracts/LEVEL_EDITOR.md) (level format, editor). Where a
> document and the code disagree, **the code wins** — record the discrepancy
> ([KNOWN_ISSUES.md § Documentation](KNOWN_ISSUES.md#documentation-discrepancies)).
>
> **Related.** [TASK_PLAYBOOKS.md](TASK_PLAYBOOKS.md) (step-by-step recipes) ·
> [KNOWN_ISSUES.md](KNOWN_ISSUES.md) (limitations and gotchas) · [`AGENTS.md`](../../AGENTS.md)
> (shared guidance for contributors and coding tools) · [docs index](../README.md) ·
> [glossary](../GLOSSARY.md) (terms, including the words with two meanings).

---

## 1. What Luminati is

**Luminati** is a *2.5D pixel-art* engine inspired by Square Enix's HD-2D games: pixel-art sprites standing
in a lit, shadowed, tilt-shift-blurred 3D diorama. It runs on **three.js r186**, is written in
**plain JavaScript ES modules** (type-checked through their JSDoc by `tsc` — no `.ts` files —
no framework, no test runner, no linter) and
**generates textures, character sheets, particles, sound effects, and music at runtime**.
The game ships no prebuilt image or audio assets; UI fonts are loaded separately. Documentation
screenshots live under `docs/assets/`; three `ui-backdrop-*.jpg` files also serve as UI sandbox
backdrops.

| Emberfall (48 × 40), golden hour | Starfall Vale (128 × 128), night | The level editor |
| --- | --- | --- |
| ![Emberfall village square at golden hour](../assets/screenshots/emberfall-golden-hour.jpg) | ![Hearthwick Square in Starfall Vale at night](../assets/screenshots/starfall-hearthwick-night.jpg) | ![Level editor: 3D preview and 2D map side by side](../assets/screenshots/editor-split-view.jpg) |
| **Cinderwatch Pass (96 × 120), combat** | **Cinderheart, the boss** | **Enemy groups in the editor** |
| ![A fight in the Bramble Ruins: goblins close in on the traveler, with damage numbers, enemy health bars and the combat HUD](../assets/screenshots/cinderwatch-ruins-fight.jpg) | ![Cinderheart in the caldera: a magma pool under the traveler, the four braziers, the ember wall across the gate and the boss bar](../assets/screenshots/cinderwatch-boss.jpg) | ![The boss group's arena and gate in the editor](../assets/screenshots/editor-combat-boss-arena.jpg) |

Three front ends share one engine. The front page, the **launcher** (`index.html`), is none of
them: a plain English list of every campaign and level with links into the game and the editor,
with no script — the Vite plugin [`tools/vite-launcher.js`](../../tools/vite-launcher.js) writes
the list from `public/`, on every request in dev, once in a build
([getting started](../user/GETTING_STARTED.md)):

```mermaid
flowchart LR
  subgraph Pages
    I["index.html (no script)<br/>the launcher: campaigns, levels, editor"]
    G["game.html → src/main.js<br/>the game (src/game/)"]
    E["editor.html → src/editor/main.js<br/>the level editor (src/editor/)"]
    S["sandbox/*.html<br/>module test pages (+ level / editor test pages)"]
  end
  ENG["src/engine/ (public API: src/engine/index.js)<br/>core · audio · render · pixel · sprite · fx · lighting · world · level · ui"]
  L[("public/levels/*.json<br/>luminati-level files")]
  B[("browser localStorage<br/>luminati.level.SLOT")]
  I -- "Play / Edit links" --> G
  I --> E
  L -.->|"listed by tools/vite-launcher.js"| I
  G --> ENG
  E --> ENG
  S --> ENG
  G -- "?level=NAME → GET BASE_URL + levels/NAME.json" --> L
  G -- "?level=local:SLOT" --> B
  E -- "open: GET BASE_URL + levels/NAME.json · save / list: BASE_URL + api/levels (dev server only)" --> L
  E -- "browser slots, play-test slot __playtest__, autosave" --> B
  T["tools/make-*.mjs<br/>level generators (Node)"] --> L
```

The shipped levels (all in [`public/levels/`](../../public/levels/)):

| File | Level | Size | Objects | Made by | Play |
| --- | --- | --- | --- | --- | --- |
| `emberfall.json` | Emberfall — Riverside Village (default level) | 48 × 40 | 137 (8 villagers) | edited as JSON / in the editor | `game.html` |
| `starfall-vale.json` | Starfall Vale — Where the Stars Come Home | 128 × 128 | 875 (29 villagers, 95 light descriptors) | **generated** by [`tools/make-starfall-vale.mjs`](../../tools/make-starfall-vale.mjs) | `game.html?level=starfall-vale` |
| `brightwater-crossing.json` | Brightwater Crossing — A Riverside Hamlet | 36 × 28 | 68 (4 villagers) | built by hand in the editor UI | `game.html?level=brightwater-crossing` |
| `sample-hamlet.json` | Willowmere — A Hamlet by the Pond | 28 × 22 | 38 (3 villagers) | **generated** by [`tools/make-sample-hamlet.mjs`](../../tools/make-sample-hamlet.mjs) | `game.html?level=sample-hamlet` |
| `gildhaven.json` | Gildhaven — Market Day on the River Gild (a walled river town) | 128 × 128 | 518 (68 villagers, 53 houses, 86 light descriptors) | **generated** by [`tools/make-gildhaven.mjs`](../../tools/make-gildhaven.mjs) | `game.html?level=gildhaven` |
| `cinderwatch-pass.json` | Cinderwatch Pass — Where the Old Fires Wake (the **combat** level) | 96 × 120 | 283 (7 villagers, 24 enemy groups = 58 enemies, 6 chests, 3 waystones, 4 story events) | **generated** by [`tools/make-cinderwatch-pass.mjs`](../../tools/make-cinderwatch-pass.mjs) | `game.html?level=cinderwatch-pass` |

Only Cinderwatch Pass has `enemy` objects, so it is the only level with combat
([contracts/COMBAT.md](../contracts/COMBAT.md)); the other five stay peaceful and must not notice
the combat code at all (rule 14). It is balanced for a **party of four**: three of its villagers
join the player's party by their talk scripts — Sister Ilse (a mystic, the healer) and Rook (a
ranger) at the Waystone Camp, Sela (a warden) at the Crossroads Waystone
([specs/PARTY.md §9](../specs/PARTY.md#9-the-demo-the-companions-of-cinderwatch-pass)) — and solo
play is hard by design ([COMBAT.md](../contracts/COMBAT.md));
the play-through bot recruits them (`sandbox/combat_play.js`, `party: false` plays alone).

Two **campaigns** ship — stories of several levels played in one page
([specs/CAMPAIGN_FORMAT.md](../specs/CAMPAIGN_FORMAT.md)). The first is *The Ferryman's Lantern*,
`public/campaigns/ferrymans-lantern/` (`campaign.json` and five level files: Millbrook, Mill Road,
the Old Quarry with combat, the mill cellar, chapter two's Millbrook at dusk), **generated** by
[`tools/make-ferrymans-lantern.mjs`](../../tools/make-ferrymans-lantern.mjs); play it at
`game.html?campaign=ferrymans-lantern`. Its story is written in the **story language**
([specs/STORY_SCRIPT.md](../specs/STORY_SCRIPT.md)): conditions, villagers' talk scripts and
actors, `event` objects with triggers, the campaign's `story/main.json` and `story/dialogue.story`
(items, quests, actors, scripts), cutscenes, objects that come and go live, the journal (B). A
level gets the lazily loaded story runtime only with a story; everything else plays as before.
A second campaign, *Emberfall — Open Doors* (`public/campaigns/emberfall-interiors/`, **generated**
by [`tools/make-emberfall-interiors.mjs`](../../tools/make-emberfall-interiors.mjs) from Emberfall's
own file), shows **rooms**: Emberfall with a furnished room behind every door and a floor above
the inn, the windmill and the barn — ten interior levels (`environment.interior`), every interior
furniture type ([design/campaigns/emberfall-interiors.md](../design/campaigns/emberfall-interiors.md));
play it at `game.html?campaign=emberfall-interiors`.

Per-level design notes: [design/levels/](../design/levels/). Feature overview:
[features/FEATURES.md](../features/FEATURES.md).

---

## 2. The 10-minute orientation

Everyone reads the first row. Then pick the row for your task.

| Task | Read, in this order |
| --- | --- |
| **Any task** | this file → [`AGENTS.md`](../../AGENTS.md) → the part of [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for your area → [architecture/OVERVIEW.md](../architecture/OVERVIEW.md) → the matching recipe in [TASK_PLAYBOOKS.md](TASK_PLAYBOOKS.md) |
| Change an engine module | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §1–2 and the module's §4.x contract → [architecture/modules/](../architecture/modules/README.md) `<module>.md` → that module's section of [contracts/MODULE_NOTES.md](../contracts/MODULE_NOTES.md) → its sandbox page |
| Rendering, look, lighting, post | [architecture/RENDER_PIPELINE.md](../architecture/RENDER_PIPELINE.md) → [design/VISUAL_DESIGN.md](../design/VISUAL_DESIGN.md) → [modules/render.md](../architecture/modules/render.md), [modules/lighting.md](../architecture/modules/lighting.md) → [architecture/PERFORMANCE.md](../architecture/PERFORMANCE.md) |
| Level format / level content | [specs/LEVEL_FORMAT.md](../specs/LEVEL_FORMAT.md) → [specs/OBJECT_CATALOG.md](../specs/OBJECT_CATALOG.md) → [contracts/LEVEL_EDITOR.md](../contracts/LEVEL_EDITOR.md) §1–5 (binding) → [design/LEVEL_DESIGN_GUIDE.md](../design/LEVEL_DESIGN_GUIDE.md) → [design/levels/](../design/levels/) |
| Game behaviour (player, villagers, dialogue, weather, HUD) | [architecture/GAME.md](../architecture/GAME.md) → [specs/INPUT_AND_CONTROLS.md](../specs/INPUT_AND_CONTROLS.md) → [specs/AUTOMATION_API.md](../specs/AUTOMATION_API.md) → [user/PLAYING_THE_GAME.md](../user/PLAYING_THE_GAME.md) |
| Combat (rules, enemies, boss, Cinderwatch Pass) | [contracts/COMBAT.md](../contracts/COMBAT.md) §1–4, §22 and the section of your area (binding; §27 lists what the code does differently) → [architecture/GAME.md §15](../architecture/GAME.md#15-combat-combat-levels-only) → the COMBAT-xx rows of [KNOWN_ISSUES.md](KNOWN_ISSUES.md#combat) → [TASK_PLAYBOOKS §19 / §20](TASK_PLAYBOOKS.md#19-add-an-enemy-kind) → [design/levels/cinderwatch-pass.md](../design/levels/cinderwatch-pass.md) |
| Level editor | [architecture/EDITOR.md](../architecture/EDITOR.md) → [contracts/LEVEL_EDITOR.md](../contracts/LEVEL_EDITOR.md) §6–9 → [user/LEVEL_EDITOR_GUIDE.md](../user/LEVEL_EDITOR_GUIDE.md) → [specs/LEVEL_STORAGE_API.md](../specs/LEVEL_STORAGE_API.md) |
| Performance | [architecture/PERFORMANCE.md](../architecture/PERFORMANCE.md) → [TASK_PLAYBOOKS § Profile](TASK_PLAYBOOKS.md#14-profile-and-fix-a-performance-problem) → perf items in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) |
| Tooling, tests, workflow | [development/TESTING_AND_VERIFICATION.md](../development/TESTING_AND_VERIFICATION.md) → [development/DEVELOPMENT_WORKFLOW.md](../development/DEVELOPMENT_WORKFLOW.md) → [development/CONVENTIONS.md](../development/CONVENTIONS.md) → header of [`tools/check.mjs`](../../tools/check.mjs) |
| Design rationale and constraints | [architecture/OVERVIEW.md](../architecture/OVERVIEW.md) → the relevant contract or specification → [KNOWN_ISSUES.md](KNOWN_ISSUES.md) |
| Documentation work | [docs/README.md](../README.md) (§ Keeping the docs correct) → [contracts/README.md](../contracts/README.md) → `npm run docs:check` after every change |

Then open the code you are going to change and read it — the module headers are detailed and
current. Do not trust a number or a signature from any document (this one included) without
checking the code.

---

## 3. Repository map

```text
luminati/
├─ index.html · game.html · editor.html   the three Vite entry pages (launcher, game, editor);
│                                multi-page build in vite.config.js
├─ package.json                  scripts: dev · build · preview · check · typecheck · docs:check · level:check
│                                (deps: three, lil-gui, @fontsource/*; dev: vite, puppeteer-core,
│                                typescript, @types/three, @types/node)
├─ tsconfig.json                 the type check of src/ + sandbox/ (allowJs, checkJs, noEmit, strict off)
├─ vite.config.js                dev server 127.0.0.1:5173 + the level-save API and launcher plugins
├─ ARCHITECTURE.md               BINDING engine contract (visual target §1, conventions §2, module APIs §4)
├─ AGENTS.md                     shared guidance for contributors and coding tools
├─ CLAUDE.md                     points Claude Code to the shared guidance
├─ README.md                     features, controls, editor workflow, performance numbers
├─ src/
│  ├─ globals.d.ts               types of the window.__* hooks (type check only)
│  ├─ main.js                    game entry: resolves ?level=, shows loading errors, boots game/Game
│  ├─ launcher/launcher.css      the launcher's styles (index.html; the sandbox gallery's look)
│  ├─ engine/                    the engine (public barrel: index.js)
│  │  ├─ constants.js · utils/math.js · render/GlobalUniforms.js   shared foundation
│  │  ├─ core/        Engine (loop, systems, resize) · Input · CameraRig · EventEmitter
│  │  ├─ audio/       AudioSystem (procedural WebAudio sfx, ambience, music)
│  │  ├─ render/      PostFX + shaders/ (DOF, bloom, grade)
│  │  ├─ pixel/       PixelCanvas · Palette · Textures (TextureLibrary) · CharacterSprites · PropSprites
│  │  ├─ sprite/      Sprite3D · SpriteManager · Foliage · BlobBatch
│  │  ├─ fx/          Particles · GodRays
│  │  ├─ lighting/    LightingSystem (24 h palette) · LightPool · Sky
│  │  ├─ world/       TileMap · Water · WaterShore + shoreWorker · Props (PropFactory) + props/* ·
│  │  │               SpatialSplit · ShadowCasters
│  │  ├─ level/       LevelFormat · ObjectCatalog · ObjectBuilder · LevelStorage · LevelMap ·
│  │  │               types.d.ts (the level document's types; other folders have a types.d.ts too)
│  │  ├─ i18n/        I18n (t(), languages) · ContentText (loc() / term()) · ContentKeys (text keys:
│  │  │               readers, #line: tags, cleaners, minting) · TextKeys (keys through edits: editor,
│  │  │               generators, tools — never the game) · ContentStrings (the extractor, tools only) ·
│  │  │               strings/*
│  │  └─ ui/          UI · DialogBox · Banner · TitleScreen · HUD · Minimap/WorldMap · InteractPrompt ·
│  │                  Fader · DebugPanel · the pixel UI kit (UiScale · FontLoader · GlyphFont · art/ ·
│  │                  layout/) · one stylesheet per component
│  ├─ game/          the game: Game · World · Player · Npc · Critters · dialogue · Weather · Scenery ·
│  │                 GroundDetail · SnowCover · AudioDirector · ResolutionGovernor · AtmosphereFog ·
│  │                 DebugControls · config · combat/* · campaign/* (CampaignFormat · CampaignStorage ·
│  │                 CampaignState · CampaignRuntime · StoryFormat) · story/* (StoryRunner ·
│  │                 StoryState · storyUI)
│  └─ editor/        the level editor: EditorApp · EditorState · textKeys (text keys through edits) ·
│                    autosave · icons · editor.css · tools/* · ui/* · map2d/Map2DView · viewport3d/*
├─ public/levels/*.json          level files (served as /levels/<name>.json, copied into dist/ by the build)
├─ public/campaigns/<name>/      campaigns: campaign.json + levels/<id>.json
├─ tools/
│  ├─ check.mjs                  headless-Chrome verification harness (npm run check)
│  ├─ typecheck.mjs              the type check (npm run typecheck); tools/tsconfig.json: the Node program
│  ├─ vite-level-api.js          dev-server REST API GET/PUT/DELETE /api/levels
│  ├─ vite-launcher.js           writes the launcher's list (index.html) from public/: every request in dev,
│  │                             once in a build
│  ├─ make-starfall-vale.mjs     Starfall Vale generator + validator
│  ├─ make-sample-hamlet.mjs     Willowmere generator
│  ├─ make-cinderwatch-pass.mjs  Cinderwatch Pass generator + validator (the combat level)
│  ├─ make-gildhaven.mjs         Gildhaven generator + validator (the 128 × 128 town)
│  ├─ make-ferrymans-lantern.mjs the demo campaign's generator
│  ├─ make-emberfall-interiors.mjs  the rooms demo's generator (Emberfall + ten rooms)
│  ├─ lib/levelgen.mjs           helpers shared by the Cinderwatch and Gildhaven generators
│  ├─ lib/levelcheck.mjs         the level checks (checkLevel), shared by make-gildhaven and check-level
│  ├─ check-level.mjs            the level checks on any level file (npm run level:check)
│  ├─ test-story.mjs             the story system's self-test (npm run story:test)
│  ├─ test-levelcheck.mjs        the level checks' self-test: story states (npm run level:test)
│  ├─ test-level-api.mjs         the level API's self-test (npm run api:test)
│  ├─ check-i18n.mjs             the content tables' checker (npm run i18n:check; lib/i18n.mjs)
│  ├─ i18n-keys.mjs              the text keys of level / campaign / story files (npm run i18n:keys):
│  │                             --check, --assign, --fix
│  ├─ i18n-worklist.mjs          translators' worklists: write (JSON / PO), --merge, --prune, --init
│  ├─ test-i18n.mjs              the content-text self-test (npm run i18n:test)
│  ├─ test-text-keys.mjs         the text keys' self-test (npm run keys:test)
│  └─ check-docs-links.mjs       docs link checker (npm run docs:check)
├─ sandbox/                      module test pages (*.html/*.js) + scripted checks (*.json);
│                                /sandbox/ is a gallery page
├─ docs/                         this documentation (contracts/ holds the binding level/editor contract)
├─ .claude/launch.json           optional Claude Code preview preset (npm run dev, port 5173)
├─ .gitattributes                "* text=auto eol=lf", "*.png binary"
├─ .gitignore                    node_modules/ · dist/ · .check/ · *.log
├─ dist/                         build output (gitignored; may be stale)
└─ .check/                       LOCAL-ONLY harness output (gitignored)
```

About **`.check/`**: every `npm run check` writes `.check/<out>/report.json` plus PNG screenshots.
This gitignored directory contains disposable local verification output. Never require its contents
in published documentation or assume another checkout has them. Copy evidence worth publishing
into an appropriate documentation asset directory, such as
[`docs/assets/screenshots/`](../assets/screenshots/). Use a fresh `--out` name per run: the harness
deletes the PNGs and `report.json` already in that folder. Preserve evidence needed by another
active task before removing its output.

---

## 4. Golden rules (invariants that are easy to break)

Each rule says what, why and how to comply. The recipes in [TASK_PLAYBOOKS.md](TASK_PLAYBOOKS.md)
apply them step by step.

1. **At most 12 point lights, all created before the first frame; the count never changes
   afterwards.** Adding or removing a light, or toggling `light.visible`, changes three.js' light
   count and recompiles every lit shader (a visible hitch). Fade intensities instead. The game
   hands all light descriptors to [`LightPool`](../../src/engine/lighting/LightPool.js)
   (`MAX_POINT_LIGHTS = 12` in [`src/game/World.js`](../../src/game/World.js)): with ≤ 12
   descriptors each gets one permanent light (so a small level has *fewer* than 12 lights —
   Emberfall 12, Brightwater 10, Willowmere 6); with more, exactly 12 lights are shared around the
   camera focus with fade-out → move → fade-in (Starfall: 95 descriptors). The editor's 3D
   preview uses the same engine `LightPool` with `fixed: true` and `size: LIGHT_POOL_SIZE` (12,
   [`viewport3d/ObjectPreview.js`](../../src/editor/viewport3d/ObjectPreview.js)): it always has
   exactly 12 THREE lights (spares parked at intensity 0), follows the descriptor count into static
   or pooled mode as the game does, and edits hand it new descriptor sets through
   `setDescriptors` without adding or removing lights. A level may contain any number of lights.
2. **Warm shaders against `postfx.sceneTarget`.** three.js keys programs by the bound render
   target's colour space; the scene renders into PostFX's linear HDR target, so compiling for the
   canvas builds unused variants. `Game._compileScene()` binds `postfx.sceneTarget` and calls
   `renderer.compileAsync`; `postfx.warmup()` compiles the post passes; `Game.start()` draws five
   frames (`WARM_FRAMES`) with rain and snow forced on behind the loading screen; one-shot bursts
   are primed with one particle far below the world (`footstep` always, `splash` and `sparkle`
   when the level has a splashing waterfall), and every shadow caster kind's depth program by a
   proxy far below (`Game._primeShadows`, REN-13). Anything new that can appear
   mid-game (a material, an emitter preset, a burst) must exist or be primed **before** that
   warm-up, or it hitches on first use. Check: `renderer.info.programs.length` must not grow
   during play (Emberfall: 57).
3. **Deterministic procedural content.** Use the seeded `RNG`, `hash2`, `fbm2`, `hashString`
   from [`src/engine/utils/math.js`](../../src/engine/utils/math.js); never `Math.random()` for
   anything that shapes the world. (`Math.random` appears only for runtime jitter — dialogue blip
   pitch and waterfall spray positions in `Game.js` —, in the editor for the Place tool's next
   variation seed (`PlaceTool.js`; the seed is then stored in the object's `opts.seed`), for
   autosave / session and DOM ids, and in the harness' port choice. Object ids are deterministic:
   `generateObjectId` → `<type>_<n>`.) Props seed from kind + position + `opts.seed`
   (`PropFactory.rng`), textures from their name and the library seed (`TextureLibrary.seedOf`;
   the game uses seed 1337), terrain tint from the level name (rule 7), so the same level builds
   identically every load.
4. **Contract changes are additive only.** Never rename or change the meaning of a member of
   `ARCHITECTURE.md` §4 or `docs/contracts/LEVEL_EDITOR.md`. Add optional members, options, and
   level fields; document them in the same change (contract file, its typed copy — rule 15 —,
   module reference, matching `docs/` pages, `README.md` if user-visible). Do not add migrations,
   compatibility readers, or aliases unless explicitly requested. Update shipped data with a
   format change and report which existing user data can no longer load.
5. **Byte-stable level files.** `parseLevel` → `serializeLevel` must reproduce a saved file
   exactly; opening a level in the editor and saving it unchanged must leave `git diff` empty.
   Consequences: `normalizeObject` keeps key order; new *defaults* (a key added to an object
   type's `defaults`, to `DEFAULT_ENVIRONMENT`, or a new `TILE_TYPES` char in the default
   legend) get written into every file on its next save — so prefer optional fields that are
   absent by default, and if you must add a default, re-save / regenerate every shipped level in
   the same change. Check with the round-trip snippet in §5.
6. **Generated levels change only through their generator.** `starfall-vale.json` ←
   `node tools/make-starfall-vale.mjs`, `sample-hamlet.json` ← `node tools/make-sample-hamlet.mjs`,
   `cinderwatch-pass.json` ← `node tools/make-cinderwatch-pass.mjs` (its own `validate()` of 20
   rules and a `coverage()` of every combat type, enemy kind and chest upgrade; `--check`).
   Never hand-edit their JSON (the next run overwrites it). The Starfall generator refuses to
   write when its validation fails (`--force` writes for inspection and still exits 1), and its
   coverage checklist requires **every** tile type, object type, NPC action / behaviour, critter
   kind and particle-area preset to appear in the level (see
   [TASK_PLAYBOOKS § Before any recipe](TASK_PLAYBOOKS.md#0-before-any-recipe)). Both
   generators reproduce their committed files byte for byte; `make-sample-hamlet.mjs` writes each
   object in a key order of its own (`id, type`, position keys, catalog defaults, other keys) and
   refuses to write unless its output round-trips through `parseLevel` → `serializeLevel`.
7. **No regressions in the shipped levels.** Emberfall is the reference look; it and the other
   small levels must render and play exactly as before unless the task is to change them
   (compare with the screenshots in [`docs/assets/screenshots/`](../assets/screenshots/) and a
   before/after fingerprint — draw calls, triangles, lights, programs; see
   [TASK_PLAYBOOKS § Regression check](TASK_PLAYBOOKS.md#16-regression-check-before-you-finish)).
   Do not rename a shipped level casually: the terrain noise is seeded from `level.name`
   ([KNOWN_ISSUES LVL-10](KNOWN_ISSUES.md#levels-and-generators)).
8. **Two build paths: small levels vs big levels.** `World.isBigLevel(level)` is true when either
   side is **> 64 tiles** (`SMALL_LEVEL = 64` in [`src/game/World.js`](../../src/game/World.js)).
   Big levels (Starfall Vale) get `BIG_LEVEL_BATCHING`: k-d split batches culled by box,
   shadow-only proxy casters, a shadow depth range, worker shore bake, far-actor throttling,
   particle culling at 34 units, one instanced blob-shadow call (`BlobBatch`). Levels up to
   64 × 64 keep the original single-merge path and **must render identically** — gate every
   big-level optimisation on `this.batching` / `World.isBigLevel`. The editor has the same split
   (`BATCH_CHUNK` 16 vs `BATCH_CHUNK_BIG` 32 tiles).
9. **Colour management and tone mapping have single owners.** `Engine` sets
   `renderer.outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping` and the
   shadow-map type (`PCFShadowMap`); colour textures are `SRGBColorSpace`, data textures (normal
   maps, masks) `NoColorSpace`. Tone mapping is applied **once**, by the `OutputPass` inside
   PostFX (it reads the renderer's settings); the grade runs after it in display space.
   `LightingSystem` owns `renderer.toneMappingExposure`, `scene.fog` (FogExp2), the sun / hemi
   lights and the `uNight` / `uSunDirection` / `uSunColor` / `uFogColor` uniforms (its
   `settings.shadows` switches the sun's shadow off). In the game, `Weather.update` rewrites
   `postfx.settings.grade.temperature` / `.saturation` and `lighting.settings.*Mul` every frame
   from `weather.tuning` — change those base values, not the live settings.
10. **Coordinate conventions.** Y is up. Tile `(i, j)` covers `x ∈ [i, i+1]`, `z ∈ [j, j+1]`
    (centre `i + 0.5, j + 0.5`); rows of `tiles` / `heights` run toward +Z. World height =
    level × `LEVEL_HEIGHT` (0.5); height chars `'0'–'9'`, `'a'–'z'` = levels 0–35. `PPU = 16`
    texels per world unit. Camera yaw 0 sits on the +Z side looking toward −Z, so screen-down is
    +Z; sprite directions: `down` = +Z (faces the camera), `up` = −Z, `left` = −X, `right` = +X;
    stairs `'N'` rise toward −Z. Object `rotation` is radians about Y. Pixel textures go through
    `makePixelTexture` / `PixelCanvas#toTexture` (NEAREST magnification). See
    [`src/engine/constants.js`](../../src/engine/constants.js).
11. **Leave untracked levels you did not create alone.** A level file in `public/levels/` — or
    anything in `public/campaigns/` — that is not in git belongs to the user: do not edit, delete,
    regenerate, "clean up" or commit it. Mind
    that saving a level named "Untitled" (the default name of a new level, `createEmptyLevel`) or
    with a blank name to the project folder writes `public/levels/untitled.json`
    (`slugify('Untitled') === slugify('') === 'untitled'`). The editor's Save As asks for a real name while the level is still "Untitled"
    and confirms before replacing a file, but scripts calling `saveProjectLevel` or
    `PUT /api/levels/untitled` bypass that. Scripts that save levels must use their own names and
    delete their temporary files afterwards.
12. **Development budgets** (1600 × 900, target 60 fps): ≤ ~300 scene draw calls including the shadow pass,
    one 2048² sun shadow map, DOF at half resolution, ≤ 12 point lights. Measure with `state()` and
    PostFX GPU timings, not with the headless frame rate (see §7).
13. **Everything else from the conventions:** no binary assets (the UI fonts load from Google
    Fonts first, else from the `@fontsource/*` copies built into `dist/`),
    no global side effects on import (except UI CSS / fonts), every GPU-allocating class has
    `dispose()`, JSDoc on public APIs (checked — rule 15), custom shaders reference
    `globalUniforms` objects directly and include the fog chunks when they should be fogged.
14. **Combat is opt-in per level and must stay invisible elsewhere.** `Game` creates a
    `CombatSystem` only when `levelHasCombat(level)` (an `enemy` object, or `environment.combat:
    true`); on every other level `game.combat === null`, no combat sheet, material, burst pool,
    DOM node or binding exists and the fingerprints stay as they were (Emberfall 57 programs). The
    combat clock is sub-stepped and its hit-stop is combat-local — never touch
    `engine.time.timeScale`. Every combat material, batch and burst is created and warmed at load
    (`combat.warmup`), so `stats().programs` after a full fight equals the count at load
    (`sandbox/combat.programs.json`). Existing sprite sheets stay pixel-identical: after an
    intended change to a plain sheet, re-take `sprite_art.html?mode=hashes` into
    `sandbox/sprite_art.hashes.json` in the same commit ([COMBAT.md §2](../contracts/COMBAT.md#2-must-not-change)).
15. **The type check stays at zero.** `npm run typecheck` runs `tsc` over the JavaScript and its
    JSDoc in two programs (`tsconfig.json`: `src/` + `sandbox/`; `tools/tsconfig.json`: the Node
    tools) and must report 0 errors in both; Vite never type-checks, so a broken type does not
    show in the browser. Type new public APIs with JSDoc; fix the declared type rather than cast
    (`/** @type {X} */ (expr)` only where the checker cannot follow correct code); a
    `@ts-expect-error` carries its reason; fields created lazily are declared by module
    augmentation in the folder's `types.d.ts`, never in a `Foo.d.ts` beside `Foo.js`. The
    contracts have typed copies — the level document (`src/engine/level/types.d.ts`), the combat
    interfaces (`src/game/combat/types.d.ts`), the tool interface (`src/editor/tools/index.js`),
    the hooks (`GameHooks`, `EditorHooks`, `LuminatiHooks`, `src/globals.d.ts`) — so renaming a
    member fails at every use: fix the uses. Modules the Node generators import must not pull
    browser modules in through their types. The check does not see the `eval` strings of action
    scripts, and with `strict` off an untyped value is `any`
    ([CONVENTIONS.md §3.1](../development/CONVENTIONS.md#31-the-type-check), KNOWN_ISSUES
    [TC-01 – TC-05](KNOWN_ISSUES.md#type-check)).
16. **Names from level data are untrusted keys.** A level can come from any file (a project
    file, a browser slot, a file picked on disk, the dev API), and `TABLE[name]` finds
    `Object.prototype` members, so `"constructor"` or `"__proto__"` would pass a table test and
    break on the value. Look such names up with `isOwnKey` / `ownValue` from
    [`src/engine/utils/own.js`](../../src/engine/utils/own.js) (or `includes` on a list, a
    `Map`); keep level-keyed dictionaries prototype-free (`Object.create(null)`); at load, convert
    with `toText` / `toNumber` and format messages with `showValue`
    ([CONVENTIONS.md §13](../development/CONVENTIONS.md#13-error-handling-and-logging),
    [KNOWN_ISSUES LVL-17](KNOWN_ISSUES.md#resolved-2026-10-01)). Check with
    `sandbox/game_levels.html?case=hostile` and its script `sandbox/game_levels.hostile.json`.
17. **The UI is pixel art in whole art pixels, in three languages.** Size and place UI in art px
    of the pixel UI's 640 × 360 reference frame (`--px`; `group()`, `txt()`, the art kit — never `vw` /
    `clamp()` or a scale of your own), colours from G's palette only. Every word the player reads
    is a string-table key (`t()`, with its `ja` and `zh` entries) or data translated **at display**
    — prose by the key the data holds (`loc(key, english)`, the key read with `ContentKeys.js`'
    readers, which the extractor reads the same way), names as terms (`term(name)`) — never
    written into a level, campaign, story or save; names the code looks up stay English. After touching text or a
    display site, run both i18n tours in ja and zh (0 misses). Load CJK glyphs with
    `fonts.ensure` before measuring; never trust `document.fonts.check`. Check UI work at
    1280 × 720, 1920 × 1080 and 1024 × 768 and with `--lang=ja` / `--lang=zh`
    ([PIXEL_UI.md](../specs/PIXEL_UI.md), [I18N.md](../specs/I18N.md),
    [KNOWN_ISSUES › UI and languages](KNOWN_ISSUES.md#ui-and-languages)).
18. **Text keys live in the data; nobody types them.** Every translatable text carries a GUID
    beside it (`textKeys` on objects, level roots, campaign and story files; a `#line:<GUID>` tag
    on each script line with text), made by the editor, the generators (`keyLevel`) or
    `npm run i18n:keys -- --assign`, and carried through every edit by `TextKeys.js`, so an
    inserted, reordered or renamed text keeps its translation. Never hand-edit or copy a key or a
    tag; after a hand edit of a level's text run `npm run i18n:keys` (`--fix` splits a copy whose
    English now differs). `TextKeys.js` never enters the game's chunks. A new translatable field
    goes into `TEXT_KEY_FIELDS` (`npm run keys:test` fails until it does)
    ([I18N.md §4.2](../specs/I18N.md#42-keys-and-lookup),
    [TASK_PLAYBOOKS §27–28](TASK_PLAYBOOKS.md#27-add-a-display-site-or-a-translatable-field)).
19. **Nothing loads from the site root.** The project may be served under a sub-path
    (`npm run dev -- --base=/project/`; the build is relative, `base: './'`, so one `dist/` works
    anywhere). Build every URL from `import.meta.env.BASE_URL` (`<base>levels/…`, `<base>i18n/…`,
    the level API through `LevelStorage.levelsApi()`) or relative to the page or module
    (`./src/main.js`, `import('../src/…')`, `new URL(…, import.meta.url)`), never `/levels/…` or
    `/api/…`. Check with `npm run check -- --base=project` and, after a build,
    `--dist --base=project`.

---

## 5. The standard verification loop

There is no external test runner. Browser verification drives the real pages with
[`tools/check.mjs`](../../tools/check.mjs), then inspects reports and screenshots; Node self-tests
cover the data formats, story runtime, level API, and translation tools. The harness requests
hardware acceleration and ANGLE D3D11; check the reported GPU/backend rather than assuming
every contributor has the same environment. For documentation-only changes, run
`npm run docs:check`; the rendering checks below apply to changes that affect the application.

```mermaid
flowchart TD
  A[Change code] --> B{What changed?}
  B -- one engine module --> C["check the module's sandbox page<br/>--page=sandbox/MODULE.html"]
  B -- game / level --> D["check the game<br/>--page=game.html, query level=NAME plus autostart=1"]
  B -- editor --> E["check the editor<br/>--page=editor.html --query=new --script=sandbox/editor_shell.*.json"]
  C & D & E --> F["read .check/OUT/report.json:<br/>0 page errors · 0 console errors · 0 warnings · 0 failed requests"]
  F --> G["Read the PNG screenshots (they are the visual test)"]
  G --> H["Regression: Emberfall + other levels, byte-stable round trip,<br/>generators re-run (no unintended diff)"]
  H --> T["npm run typecheck<br/>0 errors in both programs"]
  T --> I["npm run build"]
  I --> J[Update the docs you invalidated]
```

1. **Run the narrowest page first.** A module's sandbox (`sandbox/<module>.html`, list in
   [development/TESTING_AND_VERIFICATION.md](../development/TESTING_AND_VERIFICATION.md)), then
   the game or the editor.

   ```bash
   npm run check -- --page=sandbox/terrain.html --out=terrain
   npm run check -- --page=game.html --query=autostart=1 --out=game --wait=6000
   npm run check -- --page=game.html --query="level=starfall-vale&autostart=1" --out=sv --wait=9000
   npm run check -- --page=editor.html --query=open=emberfall --out=ed --fps=0
   npm run check -- --page=editor.html --query=new --out=perf --fps=0 --script=sandbox/editor_perf.json
   npm run check -- --page=index.html --query= --out=launcher --fps=0 --script=sandbox/launcher.json
   ```

   The last one is the launcher (`index.html`, the front page): its links against the level API's
   lists, then a *Play* and an *Edit* clicked through into the game and the editor.

   Options: `--page` (default `game.html`, the game), `--query` (default **`autostart=1`** — pass
   `--query=` for none), `--out` (folder under `.check/`; default: the page's base name),
   `--wait` ms before the first shot (default 4000), `--fps` ms of frame-rate measurement
   (default 3000, `0` = skip), `--width` / `--height` (default 1600 × 900),
   `--script=<actions.json>` (path relative to the repo root), `--headful`, `--keep-cache` (keep the
   Vite dependency cache, which each run otherwise deletes), `--base=project` (serve under
   `/project/`), `--dist` (check `dist/` through `vite preview` — `index.html`, `game.html`,
   `editor.html`, no level API; build first). After the wait the harness always saves
   `initial.png`, then runs the script. The action-script steps (`wait`,
   `key`, `press`, `eval`, `shot`, `fps`, `click`, `dblclick`, `move`, `mouse`, `drag`, `wheel`,
   `type`, `combo`, `goto`, `tab`) are documented in the file header. Page hooks:
   `window.__game`, `window.__editor`, `window.__luminati`, `window.__engine` — see
   [specs/AUTOMATION_API.md](../specs/AUTOMATION_API.md).
2. **Read the report.** The console summary lists page errors, console errors, warnings, failed
   requests and every `eval` result. **By default the exit code is 1 only for page errors**
   (uncaught exceptions, harness failures; 2 when no Chrome / Edge is found); console errors,
   warnings, failed requests and an `eval` that throws (stored as `evals[].error` in
   `report.json`) do not fail the run — you must read them. `--strict` makes any of them exit 1
   as well (a `Strict:` line lists why), for a page that should be clean. The goal is zero of each
   (level-normalisation warnings such as `[Luminati] …` are real findings).
3. **Look at the screenshots.** Open `.check/<out>/*.png` with an image viewer available in your
   environment. A blank, black, magenta-checkered (unknown texture), or washed-out frame is a
   failure even with a clean report.
4. **Regression checks.** For anything that can touch rendering or level building: Emberfall plus
   the other shipped levels (fingerprint before/after — recipe 16), and the level round trip:

   ```bash
   node --input-type=module -e "
   import fs from 'node:fs';
   import { parseLevel, serializeLevel } from './src/engine/level/LevelFormat.js';
   for (const f of fs.readdirSync('public/levels').filter((n) => n.endsWith('.json'))) {
     const text = fs.readFileSync('public/levels/' + f, 'utf8');
     const { level, warnings } = parseLevel(text);
     console.log(f.padEnd(28), serializeLevel(level) === text ? 'byte-stable' : 'CHANGED', warnings.length ? warnings : '');
   }"
   ```

   If you changed the level format, catalog or generators, re-run the generators and confirm
   `git diff public/levels` shows only what you intended. The generators reproduce their files
   byte for byte. To try them without touching the committed files:
   `node tools/make-starfall-vale.mjs --out=<scratch>/sv.json` (then compare, e.g. with
   `git hash-object`) and `node tools/make-sample-hamlet.mjs --check` (writes nothing; exit 0 when
   the file matches, else exit 1 saying whether the data or only the key order / formatting
   differs) or `--out=<scratch>/hamlet.json`.

   If you changed text the player reads (a level's, a campaign's, a story's, `dialogue.js`) or a
   place that shows it: `npm run i18n:keys` (every text keyed, 0 problems) and
   `npm run i18n:check` (only *changed* — an edited shipped line, the same key with other
   English — and *untranslated* — a new text — remain to translate:
   [TASK_PLAYBOOKS §26](TASK_PLAYBOOKS.md#26-translate-or-fix-content-text-with-the-worklist)), and
   the two content-text tours in `--lang=ja` and `--lang=zh`, which fail on any text shown
   untranslated ([TESTING_AND_VERIFICATION.md §8.5](../development/TESTING_AND_VERIFICATION.md#85-languages-and-fonts)).
   A change to the text keys' code: `npm run keys:test`, `npm run i18n:test`, `npm run story:test`.
5. **Type check.** `npm run typecheck` must report 0 errors in both programs (about a second
   each). It catches renamed or misspelled members, wrong shapes and arities in typed code — fix
   the cause, do not cast it away ([CONVENTIONS.md §3.1](../development/CONVENTIONS.md#31-the-type-check);
   recipe: [TASK_PLAYBOOKS §21](TASK_PLAYBOOKS.md#21-fix-a-failing-type-check)).
6. **Build.** `npm run build` (Vite multi-page build of `index.html` — the launcher, its list
   baked in — + `game.html` + `editor.html` into `dist/`; a few seconds). It must succeed. (To
   leave `dist/` alone, e.g. while another session uses it:
   `npx vite build --outDir <some temp dir> --emptyOutDir`.) The build is relative
   (`base: './'`); after touching a URL a page loads, `npm run check -- --dist --base=project`
   (it checks `index.html`, `game.html` and `editor.html`).
7. **Update the docs** you made stale — contract, module notes, `README.md`, the pages under
   `docs/`. Documentation is part of "done" in this project.

A task is not done while a sandbox or page shows an error, a screenshot looks wrong, a shipped
level changed unintentionally, the type check reports an error, or the build fails.

---

## 6. Coordinating larger changes

For a change spanning several modules, agree on shared contracts and integration points first.
Assign clear file/module ownership when work happens in parallel, and give each module a
standalone sandbox that proves its behaviour without depending on unfinished work elsewhere.
Review integrations independently where practical, then re-run the relevant reproductions and
regression checks. Document deliberate contract additions and implementation constraints in
the canonical reference for that module.

For a smaller change, the same discipline scales down: read the contract, change the module,
verify it in its sandbox, then integrate and run the appropriate regression checks. Consult
[KNOWN_ISSUES.md](KNOWN_ISSUES.md) before reporting a known limitation again.

---

## 7. Environment and portability

| Requirement or behaviour | Guidance |
| --- | --- |
| Node.js, npm, and local project dependencies | Node.js 24 is recommended; see [requirements](../user/GETTING_STARTED.md#2-requirements) for supported versions. Run `npm ci`; the scripts use local tools, including TypeScript, so global installations are unnecessary. |
| Browser harness | It discovers standard Windows Chrome/Edge paths or uses `CHROME_PATH`. It requests ANGLE D3D11; verify the browser/backend on other platforms and report unsupported checks. |
| GPU measurements | Historical desktop measurements used a 1600 × 900 viewport. Record your hardware/browser when comparing results. Avoid competing GPU work; use `postfx.timingsMin`, CPU timings, and draw calls alongside fps. |
| Headless frame pacing | The reference environment was capped around 57–60 Hz. A compositor cap does not measure GPU headroom; compare timings under consistent conditions. |
| Dev server | `npm run dev` serves the launcher at `http://127.0.0.1:5173/`, the game at `/game.html`, the editor at `/editor.html`, and the sandbox/docs pages. The launcher follows `public/` on reload. |
| Level-save API | Each source harness run starts a Vite server with the API active; scripted editor saves really write `public/levels/<name>.json`. Built previews have no save API. |
| Shell and line endings | Use commands appropriate to the current shell and quote paths. `.gitattributes` specifies LF. On Git Bash, prefer the harness's `--base=project` to avoid MSYS path conversion. |
| Audio | Headless verification cannot establish the listening experience. Use offline analysis plus a human listening pass for audio changes. |

---

## 8. Working tree and attribution

- Inspect the working tree before editing and preserve changes outside the task. Do not change,
  delete, or stage untracked levels/campaigns you did not create without authorization.
- Do not assume a branch name, remote, operating system, shell, or contributor identity.
  Follow the task's authorization for commits and publication; coding agents must not commit
  or publish automatically.
- Keep changes scoped and explain their behaviour and verification. Do not add a fixed AI
  authorship trailer; use accurate attribution when requested or required.
- Do not skip hooks or rewrite others' work. Keep `.check/`, `dist/`, temporary levels,
  logs, credentials, and personal machine configuration out of commits. Write LF line endings.

---

## 9. Where to find X

| Looking for | Where |
| --- | --- |
| Public engine API | [`src/engine/index.js`](../../src/engine/index.js) (barrel) · module references in [architecture/modules/](../architecture/modules/README.md) |
| Frame order / systems wiring | `Game.init` in [`src/game/Game.js`](../../src/game/Game.js) (lighting −10, game 0, audio 20, UI on `lateUpdate`, PostFX as render fn); `Engine` in [`core/Engine.js`](../../src/engine/core/Engine.js) |
| Shared shader uniforms | [`render/GlobalUniforms.js`](../../src/engine/render/GlobalUniforms.js) (`uTime`, `uNight`, `uWind`, `uWindStrength`, `uCameraYaw`, `uCameraPosition`, `uSunDirection`, `uSunColor`, `uFogColor`) |
| Key bindings | `DEFAULT_BINDINGS` / `DEFAULT_PAD_BINDINGS` in [`core/Input.js`](../../src/engine/core/Input.js); HUD legend `CONTROLS` in `Game.js`; editor shortcuts: command table in [`EditorApp.js`](../../src/editor/EditorApp.js) + each tool's `shortcut` |
| Day palette | `DEFAULT_KEYFRAMES` in [`lighting/LightingSystem.js`](../../src/engine/lighting/LightingSystem.js) + `KEYFRAME_OVERRIDES` in [`game/config.js`](../../src/game/config.js) |
| Game look (DOF, bloom, grade values) | `Game._tunePost`; weather offsets `WEATHER_PARAMS` in [`game/WeatherLook.js`](../../src/game/WeatherLook.js) (shared with the editor preview; blending in [`game/Weather.js`](../../src/game/Weather.js)) |
| Camera framing | `CAMERA` in `game/config.js`; per level `environment.camera` / `highGround` / `titleCamera` |
| Time-of-day presets (T key) | `TIME_PRESETS` in `game/Weather.js` |
| Tile palette | `TILE_TYPES` in [`level/LevelFormat.js`](../../src/engine/level/LevelFormat.js) |
| Object types, inspector fields | `OBJECT_TYPES` in [`level/ObjectCatalog.js`](../../src/engine/level/ObjectCatalog.js) |
| Object → 3D build | `LevelObjectBuilder.build` in [`level/ObjectBuilder.js`](../../src/engine/level/ObjectBuilder.js) → `PropFactory` in [`world/Props.js`](../../src/engine/world/Props.js) → [`world/props/*`](../../src/engine/world/props/) |
| Light priority | `LIGHT_PRIORITY` in `ObjectBuilder.js` (campfire / hearth 0, wallTorch / light 1, lamppost 2, house 3) |
| Big-level budgets | `BIG_LEVEL_BATCHING` in [`game/World.js`](../../src/game/World.js) |
| Villager conversations | `CONVERSATIONS` (script ids) and `levelConversation` (plain dialogue + `action`) in [`game/dialogue.js`](../../src/game/dialogue.js) |
| NPC behaviours | `Npc.update` in [`game/Npc.js`](../../src/game/Npc.js); critter kinds `KINDS` in [`game/Critters.js`](../../src/game/Critters.js) |
| Forest border, outer scenery | [`game/Scenery.js`](../../src/game/Scenery.js) (`scatterForest`, `forestKindAreas`, `mergeTrees`, `buildOuterGround`) |
| Ground foliage | `buildGroundDetail` in [`game/GroundDetail.js`](../../src/game/GroundDetail.js) |
| Snow on the ground / roofs | [`game/SnowCover.js`](../../src/game/SnowCover.js) (`addSnowCover`, `snowCover.value`); `World.build` applies it to the terrain, outer ground, foliage and the merged static meshes whose material name matches `luminati:roof*` |
| Fog that starts in front of the camera | `installFogStart` in [`game/AtmosphereFog.js`](../../src/game/AtmosphereFog.js) (patches `THREE.ShaderChunk.fog_vertex` globally; game only); the start is the uniform `globalUniforms.uFogStart`, set per level by `Game._applyLevel` (`setFogStart`) |
| Dynamic resolution | [`game/ResolutionGovernor.js`](../../src/game/ResolutionGovernor.js) |
| Minimap / world map | [`ui/Minimap.js`](../../src/engine/ui/Minimap.js) + `renderLevelMap` in [`level/LevelMap.js`](../../src/engine/level/LevelMap.js); the pixel map art in [`ui/art/minimap.js`](../../src/engine/ui/art/minimap.js) |
| The pixel UI: scale, art, type, layout | [`ui/UiScale.js`](../../src/engine/ui/UiScale.js), [`ui/art/`](../../src/engine/ui/art/index.js), [`ui/layout/type.js`](../../src/engine/ui/layout/type.js), [`ui/layout/layout.js`](../../src/engine/ui/layout/layout.js); every component's recipe in [specs/PIXEL_UI.md §5](../specs/PIXEL_UI.md#5-component-recipes) |
| Languages, UI strings, translations, fonts | [`i18n/I18n.js`](../../src/engine/i18n/I18n.js) (`t()`), `i18n/strings/*.js` and `src/game/*/strings.js` (the UI tables), [`i18n/ContentText.js`](../../src/engine/i18n/ContentText.js) (`loc()`, `term()`, the misses), [`i18n/ContentKeys.js`](../../src/engine/i18n/ContentKeys.js) (the text keys: readers, tags, minting), [`i18n/TextKeys.js`](../../src/engine/i18n/TextKeys.js) (keys through edits; the editor's side in [`editor/textKeys.js`](../../src/editor/textKeys.js)), [`tools/i18n-keys.mjs`](../../tools/i18n-keys.mjs) (`npm run i18n:keys`), [`i18n/ContentStrings.js`](../../src/engine/i18n/ContentStrings.js) (the extractor), `public/i18n/<lang>/` (the content tables), [`tools/i18n-worklist.mjs`](../../tools/i18n-worklist.mjs) and [`tools/check-i18n.mjs`](../../tools/check-i18n.mjs) (translators' worklist and the checker; [TASK_PLAYBOOKS §26](TASK_PLAYBOOKS.md#26-translate-or-fix-content-text-with-the-worklist)), [`ui/FontLoader.js`](../../src/engine/ui/FontLoader.js); [specs/I18N.md](../specs/I18N.md), the names in [specs/I18N_GLOSSARY.md](../specs/I18N_GLOSSARY.md) |
| The story: scripts, events, conditions, cutscenes, presence, the journal | [`level/StoryScript.js`](../../src/engine/level/StoryScript.js) (the language; its conditions and names live in the small [`level/StoryCondition.js`](../../src/engine/level/StoryCondition.js), which is all every level loads), [`level/StoryChecks.js`](../../src/engine/level/StoryChecks.js), [`game/story/StoryRunner.js`](../../src/game/story/StoryRunner.js) (triggers, runs, commands, the camera director, walks, presence), [`game/story/StoryState.js`](../../src/game/story/StoryState.js), [`game/campaign/StoryFormat.js`](../../src/game/campaign/StoryFormat.js) (story files), `World.applyStory` (live groups), `LightPool.setHidden`, [`ui/Journal.js`](../../src/engine/ui/Journal.js); [specs/STORY_SCRIPT.md](../specs/STORY_SCRIPT.md) |
| Campaigns: travel, exits, story, saves | [`game/campaign/`](../../src/game/campaign/CampaignRuntime.js) (`CampaignRuntime.travel`, `arrival`, `setFlag`, `worldMap`; `CampaignState` saves), `Game.swapLevel` / `_buildLevel`, [`level/Travel.js`](../../src/engine/level/Travel.js) (exits, entrances, `when` / `unless`); [specs/CAMPAIGN_FORMAT.md](../specs/CAMPAIGN_FORMAT.md) |
| The launcher (the front page's list) | [`index.html`](../../index.html) + [`tools/vite-launcher.js`](../../tools/vite-launcher.js) (the list from `public/`, `transformIndexHtml`) + [`src/launcher/launcher.css`](../../src/launcher/launcher.css); check: `sandbox/launcher.json` |
| Level save / load | [`level/LevelStorage.js`](../../src/engine/level/LevelStorage.js) (browser slots `luminati.level.<slot>`, project API, files, `resolveLevelFromURL`) + [`tools/vite-level-api.js`](../../tools/vite-level-api.js) |
| Editor document & undo | [`editor/EditorState.js`](../../src/editor/EditorState.js) (`begin` / `commit` transactions) |
| Editor tools | [`editor/tools/index.js`](../../src/editor/tools/index.js) (`TOOLS`) + one file per tool |
| Editor 3D preview internals | [`editor/viewport3d/Viewport3D.js`](../../src/editor/viewport3d/Viewport3D.js), `ObjectPreview`, `TerrainPreview`, `ActorPreview`, `SceneryPreview` |
| Autosave / recovered copies | [`editor/autosave.js`](../../src/editor/autosave.js) |
| Harness | [`tools/check.mjs`](../../tools/check.mjs) (usage in its header) |
| Type check | [`tsconfig.json`](../../tsconfig.json), [`tools/tsconfig.json`](../../tools/tsconfig.json), [`tools/typecheck.mjs`](../../tools/typecheck.mjs); rules and the list of contract types: [CONVENTIONS.md §3.1](../development/CONVENTIONS.md#31-the-type-check) |
| Contract types | level document [`level/types.d.ts`](../../src/engine/level/types.d.ts) · `PropResult` in [`world/Props.js`](../../src/engine/world/Props.js) · combat [`combat/types.d.ts`](../../src/game/combat/types.d.ts) + `EnemyDef` in [`combat/defs.js`](../../src/game/combat/defs.js) · tools `Tool` / `PointerEv` in [`editor/tools/index.js`](../../src/editor/tools/index.js) · hooks `GameHooks` / `EditorHooks` / `LuminatiHooks` and [`src/globals.d.ts`](../../src/globals.d.ts) |
| Scripted checks | `sandbox/*.actions.json`, `sandbox/editor_shell.*.json`, `sandbox/editor3d.*.actions.json`, `sandbox/editor_perf*.json`, `sandbox/combat.*.json` (combat; the fixture level in `sandbox/combat_fixture.js`, the play-through bot in `sandbox/combat_play.js` — deterministic in fixed step, compare its `summary` / `digest`), `sandbox/combat_audio.actions.json` (the combat audio QA), `sandbox/launcher.json` (the launcher: `--page=index.html --query= --fps=0`) |
| Combat | [`src/game/combat/`](../../src/game/combat/CombatSystem.js) (`CombatSystem`, `PlayerCombat`, `Enemy` + `ai/*`, `rules.js`, `defs.js`, `Feel.js`), contract [contracts/COMBAT.md](../contracts/COMBAT.md), overview [GAME.md §15](../architecture/GAME.md#15-combat-combat-levels-only), hooks `window.__game.combat` ([AUTOMATION_API.md](../specs/AUTOMATION_API.md)) |
| Game automation hooks | `Game._exposeGlobal` (`window.__game`), `exposeHook` in [`src/main.js`](../../src/main.js) (`window.__luminati`) |

---

## 10. Before you start coding — checklist

- [ ] I read the rows of §2 for my task and the relevant [KNOWN_ISSUES.md](KNOWN_ISSUES.md) entries.
- [ ] I know which contract members I touch and that my change is additive.
- [ ] I know which sandbox / page proves my change and which regression checks apply (§5),
      and I will run `npm run typecheck`.
- [ ] I will not edit generated levels by hand, nor untracked levels I did not create.
- [ ] I will update the documentation I make stale.
