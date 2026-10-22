# Luminati — a 2.5D pixel-art engine for three.js

Luminati combines pixel-art sprites with lit 3D environments, dynamic shadows and depth of field.
It is inspired by the diorama look of Square Enix's HD-2D games and built with three.js and
plain JavaScript ES modules.

World textures, sprites, effects, sound and music are generated procedurally at runtime. Documentation screenshots and UI sandbox backdrops are included in the repository.
The game plays in **English, Japanese and Simplified Chinese**.

![Emberfall village at golden hour](docs/assets/screenshots/emberfall-golden-hour.jpg)

## Quick start

Use **Node.js 24** (recommended; the development dependencies require at least 22.12) and npm.
The game needs a browser with **WebGL 2** and hardware acceleration. Browser checks have been
verified with Chrome on Windows; see [requirements](docs/user/GETTING_STARTED.md#2-requirements)
for the current testing limits.

Clone this project open the repository directory, then run:

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) for the **launcher**. It lists every shipped
campaign and level, with links to play or edit them. Use the URL Vite prints if the port is busy.

```bash
npm run build      # Build the launcher, game and editor into dist/
npm run preview    # Preview the build locally
```

Publish the contents of `dist/` on a static HTTP(S) host. Relative asset URLs support hosting under
a project sub-path. The editor can save to browser storage or download files on a published site;
saving into the repository requires the local dev server. See
[build and deployment](docs/user/GETTING_STARTED.md#5-build-and-deploy).

## Explore the demos

Choose a destination in the launcher, or append one of these paths to your local server URL:

| Destination                | Path                                     | What to explore                                                                                                 |
| -------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Emberfall**              | `game.html`                              | A riverside village with villagers, a windmill, farms, waterfalls and changing weather.                         |
| **Starfall Vale**          | `game.html?level=starfall-vale`          | A 128 × 128 festival valley with a market town, observatory, lakes and forest.                                  |
| **Cinderwatch Pass**       | `game.html?level=cinderwatch-pass`       | Action combat, three recruitable companions and the three-phase boss Cinderheart. Balanced for a party of four. |
| **Gildhaven**              | `game.html?level=gildhaven`              | A walled river town with 68 villagers, markets, quays and an abbey.                                             |
| **Brightwater Crossing**   | `game.html?level=brightwater-crossing`   | A small hamlet built with the visual level editor.                                                              |
| **Willowmere**             | `game.html?level=sample-hamlet`          | A compact generated example level.                                                                              |
| **The Ferryman's Lantern** | `game.html?campaign=ferrymans-lantern`   | A short story across several levels, with quests, cutscenes, combat and saved progress.                         |
| **Emberfall — Open Doors** | `game.html?campaign=emberfall-interiors` | Furnished rooms behind every door, with upper floors in the inn, windmill and barn.                             |

Campaign progress and editor browser saves belong to the current browser and site address; they
do not sync between devices. Export levels you want to keep as files.

## Features

- **Rendering:** lit pixel sprites, day and night lighting, dynamic shadows, tilt-shift depth of
  field, bloom, water, wind, weather, foliage and GPU particles.
- **World building:** multi-height tile terrain, stairs, bridges, procedural buildings and props,
  indoor rooms, and spatial batching for levels up to 128 × 128 tiles.
- **Gameplay:** exploration, conversations, maps, procedural audio, photo mode and a live debug panel.
- **Combat:** sword combos, dodges, skills, loot, shops, checkpoints, telegraphed enemy attacks and
  companions with configurable tactics. Combat loads only for levels that enable it.
- **Stories:** a line-based script language for branching dialogue, quests, items, events, cutscenes
  and story-dependent objects; campaigns connect levels without reloading the page.
- **Tools:** a visual level editor, deterministic level generators, a browser verification harness,
  JavaScript type checking and translation tools.

See the [feature reference](docs/features/FEATURES.md) for details and implementation links.

## Controls

| Action                            | Keyboard / mouse                   |
| --------------------------------- | ---------------------------------- |
| Move / run                        | W A S D or arrows / hold Shift     |
| Talk, examine, confirm            | Space, Enter or F                  |
| Rotate / zoom                     | Q / E, Z / X or mouse wheel        |
| World map / photo mode            | N or Tab / P                       |
| Time / weather / music            | T / R / M                          |
| Attack / dodge (combat)           | J or left click / K or right click |
| Skills / healing draught (combat) | U / I / O or 1 / 2 / 3 / C or 4    |
| Party tactics / journal           | G / B, when available              |

Sound starts after a key press or click. Standard-mapping gamepads are supported in the game.
See [playing the game](docs/user/PLAYING_THE_GAME.md) and the
[printable shortcuts](docs/user/shortcuts.html) for the complete controls.

## Languages

Choose a language on the title screen with **L**, or add `?lang=ja`, `?lang=zh` or `?lang=en` to
`game.html` (use `&lang=…` when another parameter is present). The editor and debug panel use
English. Level text keeps stable keys; translations live separately in `public/i18n/`.

The [translation guide](docs/specs/I18N.md) explains string tables, content keys, fonts and the
translator worklist. The [glossary](docs/specs/I18N_GLOSSARY.md) keeps names and terms consistent.

## Level editor

Open `editor.html` to paint terrain, sculpt heights, place objects, edit dialogue and story scripts,
and preview the result in 3D. **F5** play-tests the current level. Levels can be saved into the
repository through the dev server, kept in browser storage, or downloaded as JSON.

Start with the [editor guide](docs/user/LEVEL_EDITOR_GUIDE.md), including its
[small hamlet tutorial](docs/user/LEVEL_EDITOR_GUIDE.md#12-tutorial-build-a-small-hamlet-in-15-minutes).
For generated demos, edit their `tools/make-*.mjs` generator and regenerate the output;
[the level workflow](docs/development/DEVELOPMENT_WORKFLOW.md#7-working-with-levels) lists the sources.

## Architecture

The engine (`src/engine/`), game (`src/game/`) and editor (`src/editor/`) share plain JavaScript
modules. `src/engine/index.js` exports the public engine API. Level and campaign files are data in
`public/`; the launcher lists them through a Vite plugin. The production build has no backend.

Read the [architecture overview](docs/architecture/OVERVIEW.md),
[module references](docs/architecture/modules/README.md) and
[binding contracts](docs/contracts/README.md) before changing interfaces. The
[code conventions](docs/development/CONVENTIONS.md) cover JSDoc types, deterministic generation,
resource ownership and rendering invariants.

### Game code (`src/game/`)

`Game` coordinates the engine; `World` builds and owns a level. Combat, campaign, story and party
systems have their own modules. See the [game architecture](docs/architecture/GAME.md).

### Automation hooks

The game exposes `window.__game` and `window.__luminati`; the editor exposes `window.__editor`.
These provide state queries and actions for debugging and scripted checks. See the
[automation API](docs/specs/AUTOMATION_API.md) for their contracts and examples.

## Sandboxes

Run the dev server and open `/sandbox/` for standalone module pages. The browser harness starts
its own server, runs a page or action script, and writes a report and screenshots to `.check/`:

```bash
npm run typecheck
npm run docs:check
npm run check -- --page=game.html --out=demo --wait=6000 --strict
```

The harness uses an installed Chrome or Edge, not a downloaded browser, and currently has
Windows-specific GPU settings. Review the report and screenshots as well as the exit code.
[Testing and verification](docs/development/TESTING_AND_VERIFICATION.md) lists the available
checks, browser setup, expected warnings and the suites for each feature.

## Performance

The rendering target is 60 fps at 1600 × 900 with approximately 300 scene draw calls or fewer
at the default camera distance. These are development budgets, not hardware requirements or
performance guarantees. Resolution scaling, light pooling, batching and shader warm-up help keep
large scenes responsive.

[Performance](docs/architecture/PERFORMANCE.md) records the benchmark conditions and historical
measurements. Compare GPU and CPU frame times on the same machine; a compositor-capped frame
rate alone does not show rendering headroom.

## Documentation

[Documentation index](docs/README.md) · [Getting started](docs/user/GETTING_STARTED.md) ·
[Playing the game](docs/user/PLAYING_THE_GAME.md) · [Editor guide](docs/user/LEVEL_EDITOR_GUIDE.md) ·
[Known issues](docs/ai/KNOWN_ISSUES.md)

The [visual documentation page](docs/index.html) can be opened directly or at `/docs/` on the
dev server. AI coding agents should also read [the onboarding guide](docs/ai/AGENT_ONBOARDING.md).

## Community

Join the [Discord community](https://discord.gg/FeNXqtbqgy) for discussion. For local development,
see the [development workflow](docs/development/DEVELOPMENT_WORKFLOW.md).

## License

Luminati is licensed under the [MIT License](LICENSE). Third-party dependencies and fonts retain
their own licenses.
