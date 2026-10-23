# Getting started

English | [简体中文](GETTING_STARTED.zh-CN.md)

> **Purpose** — Everything you need to run Luminati on your own machine: requirements, install,
> the dev server and its URLs, production builds and deployment, and fixes for the problems
> people usually hit on day one.
>
> **Audience** — Players, level designers and developers (human or AI) opening the project for the
> first time.
>
> **Source of truth** — [`package.json`](../../package.json), [`vite.config.js`](../../vite.config.js),
> [`index.html`](../../index.html) + [`tools/vite-launcher.js`](../../tools/vite-launcher.js) (the
> launcher), [`game.html`](../../game.html) + [`src/main.js`](../../src/main.js) (game boot and URL
> parameters), [`editor.html`](../../editor.html) + [`src/editor/EditorApp.js`](../../src/editor/EditorApp.js)
> (`EditorApp._openFirst`), [`src/engine/level/LevelStorage.js`](../../src/engine/level/LevelStorage.js),
> [`tools/vite-level-api.js`](../../tools/vite-level-api.js),
> [`src/game/ResolutionGovernor.js`](../../src/game/ResolutionGovernor.js).
>
> **Related** — [Playing the game](PLAYING_THE_GAME.md) · [Level editor guide](LEVEL_EDITOR_GUIDE.md) ·
> [Shortcut cheat-sheet](shortcuts.html) · [Development workflow](../development/DEVELOPMENT_WORKFLOW.md) ·
> [Testing & verification](../development/TESTING_AND_VERIFICATION.md) ·
> [Level storage API](../specs/LEVEL_STORAGE_API.md) · [Performance](../architecture/PERFORMANCE.md)

---

## 1. What you are installing

Luminati is three things built on one engine (three.js r186, plain JavaScript ES modules), with a
launcher in front of them:

| Front end | Entry | What it is |
| --- | --- | --- |
| **The launcher** | `index.html` (its list written by `tools/vite-launcher.js`) | The front page: every campaign and level with *Play* and *Edit* links, and the editor ([§4.4](#44-the-launcher)). Plain HTML in English, no script. |
| **The game** | `game.html` → `src/main.js` → `src/game/` | Plays any *luminati-level* JSON file or a campaign. Default: **Emberfall**. |
| **The level editor** | `editor.html` → `src/editor/` | Paint terrain, place objects, play-test. |
| **Sandboxes** | `sandbox/index.html` | One test page per engine module (dev server only). |

Every texture, sprite, sound and music track is generated procedurally at runtime — there are no
image or audio files to download. The UI fonts (Jersey 10, Jersey 15, Tiny5; DotGothic16 and Noto
Sans JP in Japanese, Noto Sans SC in Chinese) load from Google Fonts first and, when that fails,
from the copies installed by npm (`@fontsource/*`) and included in the build. A locally served
build can therefore run without an internet connection; it still needs its HTTP server. The game
runs in English, Japanese and Simplified Chinese: choose on the title screen (**L**, then ← / → and Enter) or with `?lang=ja` / `?lang=zh`.

---

## 2. Requirements

| Need | Details |
| --- | --- |
| **Node.js and npm** | **Node.js 24 recommended; at least 22.12** for the development dependencies in the lockfile (`puppeteer-core` requires 22.12 or newer). Node is needed to develop or build, not to visit a deployed site. |
| **Browser** | A browser with **WebGL 2** and hardware acceleration switched on (three.js r186 has no WebGL 1 path). Luminati was developed and verified in **Google Chrome on Windows** (ANGLE / Direct3D 11). Other Chromium browsers (Edge) use the same engine; Firefox and Safari were not tested. |
| **GPU** | WebGL 2 with hardware acceleration. No minimum GPU model has been established. Scene complexity, resolution, browser and driver affect performance; use [Performance tips](#63-performance-tips) to adjust the rendering cost. |
| **Input** | Keyboard (a standard-mapping gamepad is optional in the game). The editor needs a mouse with a **right button and a wheel** for the camera; a middle button is optional (Shift + right-drag or Space + drag also pan). |
| **Screen** | The editor layout is designed for **1280 × 720 and up**. |

### Performance measurements

Historical measurements at 1600 × 900, pixel ratio 1, from a desktop GPU test environment.
They illustrate relative costs, not guaranteed frame rates or loading times on other systems:

| Scene | Frame rate | Draw calls | Loading to first frame |
| --- | --- | --- | --- |
| Emberfall (48 × 40) | 60 fps (vsync) | ~170–245 incl. the shadow pass | a few seconds |
| Starfall Vale (128 × 128) | 60 fps | 135–283 at the default zoom | 2.4–2.8 s on a warm dev server, 4.0–4.4 s with a cold shader cache |
| Editor, 64 × 64 level, ~200 objects | strokes p95 ≈ 18 ms (display rate), max ≤ 36 ms | — | — |
| Editor, Starfall Vale (split view) | idles at ~57–60 fps; strokes p95 18–36 ms | ~915 | opening blocks ~2 s (a loading overlay shows) |

On a cold dev server the very first load is slower, because Vite transforms the modules on demand.
See [architecture/PERFORMANCE.md](../architecture/PERFORMANCE.md) for the full measurements.

---

## 3. Install

Use the clone URL shown on the repository page, then open the cloned directory. If you downloaded
a source archive, extract it and open that directory instead. Run commands from the folder that
contains `package.json`:

```bash
npm ci
```

`npm ci` installs the versions recorded in `package-lock.json`. Use `npm install` when intentionally
changing dependencies, and review both the manifest and lockfile changes.

What gets installed ([`package.json`](../../package.json)):

| Package | Version | Used for |
| --- | --- | --- |
| `three` | ^0.186.1 | Rendering |
| `lil-gui` | ^0.21.0 | The in-game debug panel |
| `@fontsource/jersey-10`, `jersey-15`, `tiny5`, `dotgothic16`, `noto-sans-jp`, `noto-sans-sc` | ^5.3.0 | The game UI's fonts: the fallback when Google Fonts cannot be reached (Vite emits them into `dist/`, woff2 only) |
| `@fontsource/cinzel`, `@fontsource/crimson-pro`, `@fontsource/pixelify-sans` | ^5.3.0 | The level editor (Cinzel) and a few sandbox pages; no longer used by the game UI |
| `vite` (dev) | ^8.3.1 | Dev server, level-save API, production build |
| `puppeteer-core` (dev) | ^25.12.0 | Only the headless check harness (`npm run check`); it drives your installed Chrome / Edge and downloads no browser |
| `typescript`, `@types/three`, `@types/node` (dev) | ^7.0.2, ^0.186.0, ^24.19.0 | Only the type check (`npm run typecheck`) of the JavaScript through its JSDoc; nothing is compiled — the game runs the `.js` files as they are |

---

## 4. Run it

```bash
npm run dev        # Vite dev server on http://127.0.0.1:5173/ (the launcher)
```

| Path | Page |
| --- | --- |
| `/` or `/index.html` | The **launcher**: the list of campaigns and levels ([§4.4](#44-the-launcher)). |
| `/game.html` | The game ([§4.1](#41-urls-of-the-game)). |
| `/editor.html` | The level editor ([§4.2](#42-urls-of-the-editor)). |
| `/sandbox/`, `/docs/` | The sandbox gallery ([§4.3](#43-sandbox-gallery-dev-server-only)) and the documentation's landing page. |

The server listens on **127.0.0.1 only** (`vite.config.js` → `server.host`). Use exactly that
address: browser storage (levels saved "in this browser", the editor's autosave and play-test slot)
is kept **per address and port**, so `http://localhost:5173` would see different saved levels —
and may not reach the server at all. If port 5173 is taken, Vite moves to the next free port and
prints the URL; the same per-port rule applies.

### 4.1 URLs of the game

| URL | What it does |
| --- | --- |
| `/game.html` | Emberfall with its title screen (`public/levels/emberfall.json`). |
| `/game.html?autostart=1` | Skips the title screen and starts in gameplay. Any value except `0` counts. |
| `/game.html?level=starfall-vale` | **Starfall Vale**, the 128 × 128 showcase. |
| `/game.html?level=brightwater-crossing` | **Brightwater Crossing**, the 36 × 28 hamlet built entirely in the editor. |
| `/game.html?level=cinderwatch-pass` | **Cinderwatch Pass**, the 96 × 120 combat level: real-time ARPG combat ([Playing the game §15](PLAYING_THE_GAME.md#15-combat-cinderwatch-pass)). |
| `/game.html?level=gildhaven` | **Gildhaven**, the 128 × 128 market town. |
| `/game.html?level=sample-hamlet` | **Willowmere**, the small 28 × 22 example level. |
| `/game.html?level=<name>` | `public/levels/<name>.json`. The name is slugified first (`?level=Starfall Vale` → `starfall-vale`). |
| `/game.html?level=local:<slot>` | A level saved in this browser (editor: *Save as › This browser*). |
| `/game.html?level=local:__playtest__&autostart=1` | The editor's most recent play-test. |
| `/game.html?campaign=<name>` | The campaign in `public/campaigns/<name>/`: its title screen continues the saved game in this browser or starts the journey; `&new=1` starts over ([Playing the game §16](PLAYING_THE_GAME.md#16-campaigns-the-ferrymans-lantern)). |
| `/game.html?debug` | Also exposes the engine as `window.__engine` (automation; any `?autostart` parameter does this too). `window.__game` and `window.__luminati` (storage helpers, load time) are always exposed — see [Automation API](../specs/AUTOMATION_API.md). |

Parameters combine: `/game.html?level=starfall-vale&autostart=1`. See
[Playing the game](PLAYING_THE_GAME.md) for what to do once you are in. The game is `game.html`
only: an older link to `index.html?level=…` or `index.html?campaign=…` opens the launcher, which
ignores the query (there is no redirect).

### 4.2 URLs of the editor

| URL | What it does |
| --- | --- |
| `/editor.html` | Offers to restore autosaved unsaved work from an earlier session, otherwise starts a blank *Untitled* 32 × 24 level. The layout of your last session is restored. |
| `/editor.html?open=<name>` | Opens `public/levels/<name>.json`, e.g. `?open=emberfall`, `?open=starfall-vale`. |
| `/editor.html?local=<slot>` | Opens a level saved in this browser. |
| `/editor.html?new` | Starts an empty level (no restore prompt); `?new=room` a new room. |

After `?open=` / `?local=` the editor only offers a restore when the autosaved copy belongs to that
same level. Details: [Level editor guide › Opening the editor](LEVEL_EDITOR_GUIDE.md#1-opening-the-editor).

### 4.3 Sandbox gallery (dev server only)

`/sandbox/` (`sandbox/index.html`) is a gallery of standalone test pages, one per engine module:
core, textures, sprite art, sprite runtime, terrain, props, lighting (standalone and through the
real engine), post-processing, UI, the story UI, the combat FX / audio / enemy AI pages, the level
builder (level format + object builder), game level loading (edge-case levels, `?case=…`), the
editor's 3D viewport on its own and a WebGL smoke test. They are development tools, not part of the
production build — see [development/TESTING_AND_VERIFICATION.md](../development/TESTING_AND_VERIFICATION.md).

### 4.4 The launcher

The front page, `/` (`index.html`), lists what the project holds, in English (like the editor):

- **Campaigns** — every `public/campaigns/<name>/campaign.json`: its name, the title screen's
  subtitle, its levels and chapters. *Play* opens `game.html?campaign=<name>` (the campaign's title
  screen continues the journey or starts it); *Edit its levels* opens a level file of the campaign
  in the editor (`editor.html?open=<name>/<level>`).
- **Levels** — every `public/levels/*.json`: name, subtitle, description, size and a *Combat* tag
  for a level with enemies. *Play* opens `game.html?level=<name>`, *Edit* `editor.html?open=<name>`.
- **Level editor** — open it, start a new level (`?new`) or a new room (`?new=room`).
- **Development** (dev server only) — the sandbox gallery and the documentation.

The page has no script. The Vite plugin [`tools/vite-launcher.js`](../../tools/vite-launcher.js)
writes the list into it from the files: on the dev server on every request, so a level saved in the
editor shows on the next reload; in a build once, so `dist/index.html` lists what `public/` held at
build time ([§5](#5-build-and-deploy)). Only current files are listed (`luminati-campaign`,
`luminati-level`); one that cannot be read or is in another format is named in a *Not listed* note
under the list. Its links are relative, so it works under a sub-path too.

---

## 5. Build and deploy

```bash
npm run build      # production build of the launcher, the game and the editor into dist/
npm run preview    # serve dist/ on http://127.0.0.1:4173/ (Vite's preview host follows server.host)
```

`dist/` contains `index.html` (the launcher, its list baked in at build time), `game.html`,
`editor.html`, `assets/` (hashed JS, CSS, fonts), `levels/`, `campaigns/` and `i18n/` —
Vite copies everything in `public/` as-is, so every `public/levels/*.json` ships with the build and
stays playable at `game.html?level=<name>`.

**Deploying** — copy the contents of `dist/` to a static web host. It must be served over
`http(s)://`: opening `dist/game.html` from the file system does not work (ES modules and the level `fetch` need a web
server). `npm run preview` is for checking the build locally. Keep the development server
bound to loopback: its level API can write and delete project files.

Before publishing, inspect `public/`: the build copies its files even when they are untracked
scratch levels. Make lasting launcher changes in the source `index.html` and its styles; a
rebuild replaces edits made directly in `dist/`.

**Hosting under a sub-path** — the build's URLs are relative (`base: './'` in
[`vite.config.js`](../../vite.config.js)): the pages load `./assets/…` and fetch `./levels/…`,
`./campaigns/…` and `./i18n/…` from their own folder, so the same `dist/` works at the site root and
at `https://example.com/luminati/` alike — copy it there, no rebuild. Link the folder with its
trailing slash (`…/luminati/`; hosts redirect `…/luminati` there): a page served at `…/luminati`
itself would resolve `./assets/` against the site root.

The dev server serves the project at `/`. To run it under a sub-path, give it Vite's base option —
the pages, the levels and the editor's level API (`/luminati/api/levels`) all move under it:

```bash
npm run dev -- --base=/luminati/      # http://127.0.0.1:5173/luminati/index.html (the launcher)
npm run preview -- --base=/luminati/  # dist/ under the sub-path, as a host serves it
```

> In Git Bash on Windows, prefix the command with `MSYS_NO_PATHCONV=1`, otherwise the shell rewrites
> `/luminati/` into a Windows path.

### What only exists under `npm run dev`

| Feature | Dev server | Built site (`dist/`, `npm run preview`) |
| --- | --- | --- |
| The launcher's list | read from `public/` on every request | baked in at build time |
| The launcher's links to the sandboxes and the docs | yes | no |
| Playing project levels (`?level=<name>`) | yes | yes |
| Editor: open project levels (`?open=<name>`) | yes | yes |
| Editor: *Save as › Project folder*, the *Project folder* tab of *Open*, deleting project files | yes (the `/api/levels` REST API of [`tools/vite-level-api.js`](../../tools/vite-level-api.js)) | **no** — the card says "Needs the dev server (npm run dev)" |
| Editor: save in the browser, download `.level.json`, open a file, play-test | yes | yes |
| `/sandbox/` pages | yes | no (not in the build inputs) |

To ship a level made on a built site: download it (*Save as › Download file* or Ctrl+E), rename
`<name>.level.json` to **`<name>.json`**, put it in `public/levels/` and rebuild (or copy it into
`dist/levels/`: it then plays at `game.html?level=<name>`, but the launcher lists it only after the
next build). The file name matters: `?level=my-hamlet.level` would look for
`my-hamlet-level.json`.

---

## 6. Troubleshooting

### 6.1 Blank page, black screen or an error on the loading screen

The game keeps its loading screen (an ember, a gold bar and a caption) up until the first frame is
drawn. A problem during start-up turns the caption red and shows the message, with links to
*Play Emberfall* (`game.html`, only when the URL asked for a `?level=`), *Play Cinderwatch Pass*
(unless that was the level asked for) and *Open the level editor* (`showErrorActions` in
[`src/main.js`](../../src/main.js)).

| You see | Cause and fix |
| --- | --- |
| *Error creating WebGL context* (or a similar WebGL message) | WebGL 2 is unavailable. Turn on hardware acceleration in the browser settings, update the GPU driver, check `chrome://gpu`, and try Chrome or Edge. |
| *Could not load level "x": levels/x.json does not exist* | There is no `public/levels/x.json`. Check the spelling; the name is slugified (lower case, dashes). (Any other server error shows as *Level "x" not found (HTTP …)*.) |
| *Could not load level "local:x": No level "x" in this browser's storage* | Browser levels live in the browser **and address** where they were saved (see [§4](#4-run-it)). Open the game from the same address as the editor. |
| *the level is not valid JSON (…)* | The file (or browser slot) is broken. Open it in the editor (File › Open › File on disk) to see what it reports. |
| Nothing at all, from a `file://` URL | Serve it: `npm run dev` or `npm run preview`. |
| Under a sub-path: a blank page, or *Could not load level* | A static host: open the folder with its trailing slash (`…/luminati/`, not `…/luminati`). The dev server serves at `/` unless started with `--base=/luminati/` ([§5](#5-build-and-deploy)). |
| Editor: *The level editor could not load* on the boot splash | A module failed to load. The message names it; the browser console has the details. |
| Editor: *3D preview unavailable* in the 3D pane | The 3D view could not start (usually WebGL). The 2D map is fully editable on its own; the pane offers *Retry* and *2D only*. |

Start-up warnings about the level itself (a spawn moved off water, adjusted data) go to the browser
console with a `[Luminati]` prefix.

### 6.2 No sound

Browsers only start audio after a user gesture. The **title screen's key press** unlocks audio and
starts the music. With `?autostart=1` (and in editor play-tests) the **first key press or click**
does it — unless that first key is **M**, which toggles the music itself. After that:

- **M** turns the music on and off (a toast confirms).
- A level can start without music (`environment.music: false`, *Level settings › Environment ›
  Music* in the editor); press **M** to start it anyway.
- Ambience (birds, crickets, fire, water) plays whenever audio is unlocked.

### 6.3 Performance tips

- Open the **debug panel** (**`** backquote or **F1**) and look at the stats overlay: fps, frame
  ms, draw calls, triangles.
- **Render › render scale** (0.5–1) renders fewer pixels; moving it switches the automatic
  governor off. **Render › dynamic resolution** switches the governor back on.
- The **resolution governor** ([`ResolutionGovernor.js`](../../src/game/ResolutionGovernor.js)) caps
  the drawing buffer at about 2.1 megapixels (a 2560 × 1440 window renders at ~1930 × 1086 and is
  scaled up) and, when the browser exposes GPU timer queries, lowers the render scale in 0.1 steps
  down to **0.7** after 2 s of a median GPU time above **13.5 ms**, and raises it after 10 s below
  **8.5 ms** (never twice within 3 s). Each step reallocates buffers — a one-off hitch of a few ms
  on an idle GPU, up to ~0.2 s on a busy one.
- MSAA is 2× instead of 4× when the drawing buffer is above ~1.8 megapixels (decided once at
  start-up from the window size).
- A smaller browser window is the simplest speed-up. Close other GPU-heavy applications.
- **Post FX › Depth of field › enabled** off is the biggest single saving among the effects (the
  look changes, of course).
- In the editor keep *View › 3D: diorama post effects* and *3D: particles & god rays* off while
  editing (they are off by default), and use the **2D only** layout (key **3**) on 128 × 128 levels.

### 6.4 Keys do nothing

- **Click into the page** first (the game only receives keys while its tab and window have focus).
- Keys are ignored while a text field has focus (the debug panel's number fields, the editor's
  inspector). Click on the scene; in the editor, **Enter** or **Esc** also leaves a field.
- The game binds **physical key positions** (`KeyboardEvent.code`): on AZERTY or QWERTZ keyboards
  the movement keys are the keys *where* W A S D sit on a US keyboard (Z Q S D on AZERTY), and so on
  for Q / E / Z / X. The editor's tool letters use the *printed* letter instead.
- In the editor, **Ctrl+N** opens a new browser window in Chrome — use **Alt+N** or *File › New*.
- On a Mac, **Cmd** works wherever the editor says Ctrl.

### 6.5 Editor-specific

| Problem | Fix |
| --- | --- |
| *Project folder* is greyed out in *Save as* | Only available under `npm run dev`. Save in the browser or download the file. |
| *Saving failed: Cannot write public/levels/x.json (the file is read-only or in use by another program)* | Close the program holding the file, or clear its read-only flag. |
| *Pop-up blocked* after **Play** / **F5** | Allow pop-ups for the editor's address. The level is already stored in the play-test slot: open `/game.html?level=local:__playtest__&autostart=1` yourself. |
| The unsaved dot turns red, *Autosave failed — browser storage is full or unavailable* | Browser storage is full (big levels use a lot). Save to the project folder or download the level; delete old levels in *File › Open › This browser*. |
| Opening a 128 × 128 level freezes the page for ~2 s | Expected: the terrain is rebuilt in one task; a loading overlay shows. See [Limits](LEVEL_EDITOR_GUIDE.md#14-limits-and-known-quirks). |

More in [ai/KNOWN_ISSUES.md](../ai/KNOWN_ISSUES.md).

---

## 7. Where to go next

- **Play** — [Playing the game](PLAYING_THE_GAME.md): controls, HUD, time and weather, and guided
  tours of Emberfall and Starfall Vale.
- **Make a level** — [Level editor guide](LEVEL_EDITOR_GUIDE.md), including a 15-minute tutorial.
- **Print the keys** — [shortcuts.html](shortcuts.html).
- **Develop** — [development/DEVELOPMENT_WORKFLOW.md](../development/DEVELOPMENT_WORKFLOW.md) and
  [ai/AGENT_ONBOARDING.md](../ai/AGENT_ONBOARDING.md); the verification tool is
  `npm run check` ([development/TESTING_AND_VERIFICATION.md](../development/TESTING_AND_VERIFICATION.md)),
  and `npm run typecheck` checks the JSDoc types (about two seconds, no browser needed).
