# 快速上手

[English](GETTING_STARTED.md) | 简体中文

> **目的**——在自己的电脑上运行 Luminati 所需的一切：环境要求、安装、开发服务器及其 URL、生产构建与部署，以及大家第一天最常遇到的问题和解决办法。
>
> **读者**——第一次打开本项目的玩家、关卡设计师和开发者（人类或 AI）。
>
> **事实来源**——[`package.json`](../../package.json)、[`vite.config.js`](../../vite.config.js)、[`index.html`](../../index.html) + [`tools/vite-launcher.js`](../../tools/vite-launcher.js)（启动页）、[`game.html`](../../game.html) + [`src/main.js`](../../src/main.js)（游戏启动与 URL 参数）、[`editor.html`](../../editor.html) + [`src/editor/EditorApp.js`](../../src/editor/EditorApp.js)（`EditorApp._openFirst`）、[`src/engine/level/LevelStorage.js`](../../src/engine/level/LevelStorage.js)、[`tools/vite-level-api.js`](../../tools/vite-level-api.js)、[`src/game/ResolutionGovernor.js`](../../src/game/ResolutionGovernor.js)。
>
> **相关文档**——[游玩指南](PLAYING_THE_GAME.zh-CN.md) · [关卡编辑器指南](LEVEL_EDITOR_GUIDE.zh-CN.md) · [快捷键速查表](shortcuts.html) · [开发工作流](../development/DEVELOPMENT_WORKFLOW.zh-CN.md) · [测试与验证](../development/TESTING_AND_VERIFICATION.md) · [关卡存储 API](../specs/LEVEL_STORAGE_API.md) · [性能](../architecture/PERFORMANCE.md)

---

## 1. 你要安装的是什么

Luminati 由构建在同一个引擎（three.js r186，纯 JavaScript ES 模块）之上的三部分组成，前面还有一个启动页：

| 前端 | 入口 | 说明 |
| --- | --- | --- |
| **启动页** | `index.html`（列表由 `tools/vite-launcher.js` 写入） | 首页：列出每个战役和关卡，并附有 *Play*（游玩）和 *Edit*（编辑）链接，以及编辑器入口（[§4.4](#44-启动页)）。纯 HTML，英文，不含脚本。 |
| **游戏** | `game.html` → `src/main.js` → `src/game/` | 可游玩任意 *luminati-level* JSON 文件或一个战役。默认关卡：**烬落村（Emberfall）**。 |
| **关卡编辑器** | `editor.html` → `src/editor/` | 绘制地形、放置物体、试玩。 |
| **沙盒** | `sandbox/index.html` | 每个引擎模块一个测试页面（仅限开发服务器）。 |

所有纹理、精灵、音效和音乐都在运行时程序化生成——没有任何图片或音频文件需要下载。界面字体（Jersey 10、Jersey 15、Tiny5；日文使用 DotGothic16 和 Noto Sans JP，中文使用 Noto Sans SC）优先从 Google Fonts 加载，失败时改用 npm 安装（`@fontsource/*`）并打包进构建产物的副本。因此，在本地提供服务的构建无需联网即可运行，但仍需要 HTTP 服务器。游戏支持英文、日文和简体中文：可在标题画面中选择（按 **L**，再用 ← / → 和 Enter），或使用 `?lang=ja` / `?lang=zh`。

---

## 2. 环境要求

| 需求 | 详情 |
| --- | --- |
| **Node.js 和 npm** | **推荐 Node.js 24；至少 22.12**，以满足 lockfile 中的开发依赖（`puppeteer-core` 需要 22.12 或更高版本）。只有开发或构建时才需要 Node，访问已部署的网站不需要。 |
| **浏览器** | 支持 **WebGL 2** 并已开启硬件加速的浏览器（three.js r186 没有 WebGL 1 路径）。Luminati 在 **Windows 上的 Google Chrome**（ANGLE / Direct3D 11）中开发和验证。其他 Chromium 浏览器（Edge）使用相同的引擎；Firefox 和 Safari 未经测试。 |
| **GPU** | 支持硬件加速的 WebGL 2。尚未确定最低 GPU 型号。场景复杂度、分辨率、浏览器和驱动都会影响性能；可参考[性能建议](#63-性能建议)调整渲染开销。 |
| **输入设备** | 键盘（游戏中可选用标准映射的手柄）。编辑器需要带**右键和滚轮**的鼠标来操作镜头；中键可选（Shift + 右键拖动或 Space + 拖动同样可以平移）。 |
| **屏幕** | 编辑器布局按 **1280 × 720 及以上**设计。 |

### 性能测量

以下为历史测量数据，在桌面 GPU 测试环境中以 1600 × 900、像素比 1 测得。它们只用于说明相对开销，并不保证在其他系统上的帧率或加载时间：

| 场景 | 帧率 | 绘制调用 | 加载到首帧 |
| --- | --- | --- | --- |
| 烬落村（48 × 40） | 60 fps（垂直同步） | 约 170–245，含阴影通道 | 几秒 |
| 星落谷（Starfall Vale）（128 × 128） | 60 fps | 默认缩放下 135–283 | 已预热的开发服务器上 2.4–2.8 秒，着色器缓存为冷时 4.0–4.4 秒 |
| 编辑器，64 × 64 关卡，约 200 个物体 | 笔画 p95 ≈ 18 ms（显示刷新率），最大 ≤ 36 ms | — | — |
| 编辑器，星落谷（分屏视图） | 空闲时约 57–60 fps；笔画 p95 18–36 ms | 约 915 | 打开时阻塞约 2 秒（会显示加载遮罩） |

在冷启动的开发服务器上，第一次加载会更慢，因为 Vite 会按需转换模块。完整测量结果见 [architecture/PERFORMANCE.md](../architecture/PERFORMANCE.md)。

---

## 3. 安装

使用仓库页面上显示的克隆 URL，然后打开克隆下来的目录。如果你下载的是源码压缩包，请解压后打开该目录。在包含 `package.json` 的文件夹中运行命令：

```bash
npm ci
```

`npm ci` 会安装 `package-lock.json` 中记录的版本。只有在有意更改依赖时才使用 `npm install`，并检查 manifest 和 lockfile 两者的改动。

会安装哪些包（[`package.json`](../../package.json)）：

| 包 | 版本 | 用途 |
| --- | --- | --- |
| `three` | ^0.186.1 | 渲染 |
| `lil-gui` | ^0.21.0 | 游戏内调试面板 |
| `@fontsource/jersey-10`、`jersey-15`、`tiny5`、`dotgothic16`、`noto-sans-jp`、`noto-sans-sc` | ^5.3.0 | 游戏界面字体：无法访问 Google Fonts 时的后备（Vite 将其输出到 `dist/`，仅 woff2） |
| `@fontsource/cinzel`、`@fontsource/crimson-pro`、`@fontsource/pixelify-sans` | ^5.3.0 | 关卡编辑器（Cinzel）和少数沙盒页面；游戏界面已不再使用 |
| `vite`（dev） | ^8.3.1 | 开发服务器、关卡保存 API、生产构建 |
| `puppeteer-core`（dev） | ^25.12.0 | 仅用于无头检查工具（`npm run check`）；它驱动你已安装的 Chrome / Edge，不会下载浏览器 |
| `typescript`、`@types/three`、`@types/node`（dev） | ^7.0.2、^0.186.0、^24.19.0 | 仅用于通过 JSDoc 对 JavaScript 做类型检查（`npm run typecheck`）；不编译任何东西——游戏直接运行 `.js` 文件 |

---

## 4. 运行

```bash
npm run dev        # Vite dev server on http://127.0.0.1:5173/ (the launcher)
```

| 路径 | 页面 |
| --- | --- |
| `/` 或 `/index.html` | **启动页**：战役和关卡列表（[§4.4](#44-启动页)）。 |
| `/game.html` | 游戏（[§4.1](#41-游戏的-url)）。 |
| `/editor.html` | 关卡编辑器（[§4.2](#42-编辑器的-url)）。 |
| `/sandbox/`、`/docs/` | 沙盒展示页（[§4.3](#43-沙盒展示页仅限开发服务器)）和文档首页。 |

服务器**只监听 127.0.0.1**（`vite.config.js` → `server.host`）。请严格使用这个地址：浏览器存储（保存“在此浏览器中”的关卡、编辑器的自动保存和试玩槽位）是**按地址和端口**分开保存的，所以 `http://localhost:5173` 会看到不同的已保存关卡——甚至可能根本连不上服务器。如果 5173 端口被占用，Vite 会改用下一个空闲端口并打印 URL；同样适用“按端口区分”的规则。

### 4.1 游戏的 URL

| URL | 作用 |
| --- | --- |
| `/game.html` | 带标题画面的烬落村（`public/levels/emberfall.json`）。 |
| `/game.html?autostart=1` | 跳过标题画面，直接进入游戏。除 `0` 以外的任何值都有效。 |
| `/game.html?level=starfall-vale` | **星落谷**，128 × 128 的展示关卡。 |
| `/game.html?level=brightwater-crossing` | **明水渡（Brightwater Crossing）**，完全在编辑器中搭建的 36 × 28 小村落。 |
| `/game.html?level=cinderwatch-pass` | **烬望隘口（Cinderwatch Pass）**，96 × 120 的战斗关卡：实时 ARPG 战斗（[游玩指南 §15](PLAYING_THE_GAME.zh-CN.md#15-战斗烬望隘口)）。 |
| `/game.html?level=gildhaven` | **鎏金港（Gildhaven）**，128 × 128 的集市城镇。 |
| `/game.html?level=sample-hamlet` | **柳湖村（Willowmere）**，28 × 22 的小型示例关卡。 |
| `/game.html?level=<name>` | `public/levels/<name>.json`。名称会先被转换为 slug（`?level=Starfall Vale` → `starfall-vale`）。 |
| `/game.html?level=local:<slot>` | 保存在此浏览器中的关卡（编辑器：*Save as › This browser*）。 |
| `/game.html?level=local:__playtest__&autostart=1` | 编辑器最近一次试玩的关卡。 |
| `/game.html?campaign=<name>` | `public/campaigns/<name>/` 中的战役：其标题画面可继续此浏览器中的存档，或开始旅程；`&new=1` 则从头开始（[游玩指南 §16](PLAYING_THE_GAME.zh-CN.md#16-战役摆渡人的提灯)）。 |
| `/game.html?debug` | 额外将引擎暴露为 `window.__engine`（用于自动化；任何 `?autostart` 参数也会这样做）。`window.__game` 和 `window.__luminati`（存储辅助函数、加载时间）始终暴露——见[自动化 API](../specs/AUTOMATION_API.md)。 |

参数可以组合：`/game.html?level=starfall-vale&autostart=1`。进入游戏后该做什么，见[游玩指南](PLAYING_THE_GAME.zh-CN.md)。游戏只在 `game.html` 中：旧的 `index.html?level=…` 或 `index.html?campaign=…` 链接会打开启动页，而启动页会忽略查询参数（没有重定向）。

### 4.2 编辑器的 URL

| URL | 作用 |
| --- | --- |
| `/editor.html` | 如果有上次会话中自动保存的未保存工作，会提示恢复；否则新建一个空白的 *Untitled*（未命名）32 × 24 关卡。会恢复你上次会话的布局。 |
| `/editor.html?open=<name>` | 打开 `public/levels/<name>.json`，例如 `?open=emberfall`、`?open=starfall-vale`。 |
| `/editor.html?local=<slot>` | 打开保存在此浏览器中的关卡。 |
| `/editor.html?new` | 新建一个空关卡（不提示恢复）；`?new=room` 新建一个房间。 |

使用 `?open=` / `?local=` 时，只有当自动保存的副本属于同一个关卡，编辑器才会提示恢复。详见[关卡编辑器指南 › 打开编辑器](LEVEL_EDITOR_GUIDE.zh-CN.md#1-打开编辑器)。

### 4.3 沙盒展示页（仅限开发服务器）

`/sandbox/`（`sandbox/index.html`）是一组独立测试页面的展示页，每个引擎模块一个：核心、纹理、精灵美术、精灵运行时、地形、道具、光照（独立运行和通过真实引擎运行）、后期处理、UI、剧情 UI、战斗特效 / 音频 / 敌人 AI 页面、关卡构建器（关卡格式 + 物体构建器）、游戏关卡加载（边界情况关卡，`?case=…`）、单独的编辑器 3D 视口，以及一个 WebGL 冒烟测试。它们是开发工具，不属于生产构建——见 [development/TESTING_AND_VERIFICATION.md](../development/TESTING_AND_VERIFICATION.md)。

### 4.4 启动页

首页 `/`（`index.html`）以英文（与编辑器一样）列出项目中的内容：

- **Campaigns**（战役）——每个 `public/campaigns/<name>/campaign.json`：名称、标题画面副标题、其中的关卡和章节。*Play* 打开 `game.html?campaign=<name>`（战役的标题画面可继续或开始旅程）；*Edit its levels* 在编辑器中打开该战役的某个关卡文件（`editor.html?open=<name>/<level>`）。
- **Levels**（关卡）——每个 `public/levels/*.json`：名称、副标题、描述、尺寸，有敌人的关卡还会带 *Combat*（战斗）标签。*Play* 打开 `game.html?level=<name>`，*Edit* 打开 `editor.html?open=<name>`。
- **Level editor**（关卡编辑器）——打开编辑器、新建关卡（`?new`）或新建房间（`?new=room`）。
- **Development**（开发，仅限开发服务器）——沙盒展示页和文档。

该页面不含脚本。Vite 插件 [`tools/vite-launcher.js`](../../tools/vite-launcher.js) 根据文件把列表写入页面：在开发服务器上每次请求都会写入，因此在编辑器中保存的关卡下次刷新就会出现；在构建中只写入一次，因此 `dist/index.html` 列出的是构建时 `public/` 中的内容（[§5](#5-构建与部署)）。只列出当前格式的文件（`luminati-campaign`、`luminati-level`）；无法读取或格式不同的文件会在列表下方的 *Not listed*（未列出）说明中注明。页面中的链接都是相对链接，因此在子路径下也能工作。

---

## 5. 构建与部署

```bash
npm run build      # production build of the launcher, the game and the editor into dist/
npm run preview    # serve dist/ on http://127.0.0.1:4173/ (Vite's preview host follows server.host)
```

`dist/` 包含 `index.html`（启动页，其列表在构建时写入）、`game.html`、`editor.html`、`assets/`（带哈希的 JS、CSS、字体）、`levels/`、`campaigns/` 和 `i18n/`——Vite 会原样复制 `public/` 中的所有内容，因此每个 `public/levels/*.json` 都会随构建发布，并可通过 `game.html?level=<name>` 游玩。

**部署**——把 `dist/` 的内容复制到静态网站主机。必须通过 `http(s)://` 提供服务：直接从文件系统打开 `dist/game.html` 是不行的（ES 模块和关卡的 `fetch` 需要 Web 服务器）。`npm run preview` 用于在本地检查构建。请让开发服务器始终只绑定在回环地址上：它的关卡 API 可以写入和删除项目文件。

发布前请检查 `public/`：即使是未纳入版本控制的临时关卡，构建也会复制这些文件。要长期修改启动页，请修改源文件 `index.html` 及其样式；直接在 `dist/` 中所做的修改会在重新构建时被覆盖。

**部署在子路径下**——构建产物中的 URL 都是相对的（[`vite.config.js`](../../vite.config.js) 中的 `base: './'`）：页面从自身所在的文件夹加载 `./assets/…`，并获取 `./levels/…`、`./campaigns/…` 和 `./i18n/…`，因此同一个 `dist/` 既能放在站点根目录，也能放在 `https://example.com/luminati/` 下——直接复制过去即可，无需重新构建。链接该文件夹时要带上末尾斜杠（`…/luminati/`；主机通常会把 `…/luminati` 重定向到这里）：如果页面本身以 `…/luminati` 提供，`./assets/` 会相对于站点根目录解析。

开发服务器在 `/` 下提供项目。要让它运行在子路径下，请传入 Vite 的 base 选项——页面、关卡以及编辑器的关卡 API（`/luminati/api/levels`）都会移到该路径下：

```bash
npm run dev -- --base=/luminati/      # http://127.0.0.1:5173/luminati/index.html (the launcher)
npm run preview -- --base=/luminati/  # dist/ under the sub-path, as a host serves it
```

> 在 Windows 的 Git Bash 中，请在命令前加上 `MSYS_NO_PATHCONV=1`，否则 shell 会把 `/luminati/` 改写成 Windows 路径。

### 只在 `npm run dev` 下才有的功能

| 功能 | 开发服务器 | 构建后的站点（`dist/`、`npm run preview`） |
| --- | --- | --- |
| 启动页的列表 | 每次请求时从 `public/` 读取 | 构建时写入 |
| 启动页中指向沙盒和文档的链接 | 有 | 无 |
| 游玩项目关卡（`?level=<name>`） | 支持 | 支持 |
| 编辑器：打开项目关卡（`?open=<name>`） | 支持 | 支持 |
| 编辑器：*Save as › Project folder*、*Open* 中的 *Project folder* 标签页、删除项目文件 | 支持（由 [`tools/vite-level-api.js`](../../tools/vite-level-api.js) 的 `/api/levels` REST API 提供） | **不支持**——卡片上显示 “Needs the dev server (npm run dev)” |
| 编辑器：保存到浏览器、下载 `.level.json`、打开文件、试玩 | 支持 | 支持 |
| `/sandbox/` 页面 | 有 | 无（不在构建输入中） |

要发布在构建后的站点上制作的关卡：先下载它（*Save as › Download file* 或 Ctrl+E），把 `<name>.level.json` 重命名为 **`<name>.json`**，放进 `public/levels/` 并重新构建（或者复制到 `dist/levels/`：这样它可以通过 `game.html?level=<name>` 游玩，但要等下次构建后才会出现在启动页列表中）。文件名很重要：`?level=my-hamlet.level` 会去查找 `my-hamlet-level.json`。

---

## 6. 故障排除

### 6.1 空白页、黑屏或加载画面上出现错误

游戏会一直显示加载画面（一颗余烬、一条金色进度条和一行说明文字），直到绘制出第一帧。如果启动过程中出现问题，说明文字会变红并显示错误信息，同时提供以下链接：“游玩烬落村”（*Play Emberfall*，即 `game.html`，仅当 URL 请求了 `?level=` 时显示）、“游玩烬望隘口”（*Play Cinderwatch Pass*，除非请求的正是该关卡）和“打开关卡编辑器”（*Open the level editor*）（见 [`src/main.js`](../../src/main.js) 中的 `showErrorActions`）。

| 你看到的 | 原因与解决办法 |
| --- | --- |
| *Error creating WebGL context*（或类似的 WebGL 信息） | WebGL 2 不可用。在浏览器设置中开启硬件加速，更新 GPU 驱动，查看 `chrome://gpu`，并尝试使用 Chrome 或 Edge。 |
| *Could not load level "x": levels/x.json does not exist*（无法载入关卡“x”：找不到 levels/x.json） | 不存在 `public/levels/x.json`。检查拼写；名称会被转换为 slug（小写、用短横线连接）。（其他服务器错误显示为 *Level "x" not found (HTTP …)*。） |
| *Could not load level "local:x": No level "x" in this browser's storage* | 浏览器中的关卡只存在于保存它的那个浏览器**和地址**中（见 [§4](#4-运行)）。请从与编辑器相同的地址打开游戏。 |
| *the level is not valid JSON (…)*（关卡不是有效的 JSON） | 文件（或浏览器槽位）已损坏。在编辑器中打开它（File › Open › File on disk），看看它报告了什么。 |
| 从 `file://` URL 打开时什么都没有 | 需要通过服务器提供：`npm run dev` 或 `npm run preview`。 |
| 在子路径下：空白页，或 *Could not load level* | 静态主机：打开文件夹时要带末尾斜杠（`…/luminati/`，而不是 `…/luminati`）。开发服务器在 `/` 下提供服务，除非以 `--base=/luminati/` 启动（[§5](#5-构建与部署)）。 |
| 编辑器：启动画面上显示 *The level editor could not load* | 某个模块加载失败。信息中会给出模块名；浏览器控制台中有详细信息。 |
| 编辑器：3D 窗格中显示 *3D preview unavailable* | 3D 视图无法启动（通常是 WebGL 问题）。2D 地图本身完全可以编辑；该窗格提供 *Retry*（重试）和 *2D only*（仅 2D）选项。 |

关于关卡本身的启动警告（出生点被移出水面、数据被调整）会以 `[Luminati]` 前缀输出到浏览器控制台。

### 6.2 没有声音

浏览器只有在用户操作之后才会开始播放音频。**在标题画面按下按键**会解锁音频并开始播放音乐。使用 `?autostart=1` 时（以及在编辑器试玩中），由**第一次按键或点击**解锁——除非第一次按的是 **M**，它本身就会切换音乐。之后：

- **M** 开关音乐（会有提示消息确认）。
- 关卡可以设定为开始时没有音乐（`environment.music: false`，即编辑器中的 *Level settings › Environment › Music*）；按 **M** 仍可开启。
- 只要音频已解锁，环境音（鸟鸣、蟋蟀、火焰、流水）就会播放。

### 6.3 性能建议

- 打开**调试面板**（**`** 反引号键或 **F1**），查看统计叠加层：fps、帧耗时（ms）、绘制调用、三角形数。
- **Render › render scale**（0.5–1）会渲染更少的像素；调整它会关闭自动调节器。**Render › dynamic resolution** 会重新开启调节器。
- **分辨率调节器**（[`ResolutionGovernor.js`](../../src/game/ResolutionGovernor.js)）把绘制缓冲区上限设为约 210 万像素（2560 × 1440 的窗口会以约 1930 × 1086 渲染后放大）；当浏览器提供 GPU 计时查询时，如果 GPU 耗时中位数连续 2 秒高于 **13.5 ms**，它会以 0.1 为步长把渲染比例降低，最低到 **0.7**；连续 10 秒低于 **8.5 ms** 则提高（3 秒内不会调整两次）。每次调整都会重新分配缓冲区——在空闲的 GPU 上会有一次几毫秒的卡顿，在繁忙的 GPU 上最多约 0.2 秒。
- 当绘制缓冲区超过约 180 万像素时，MSAA 使用 2× 而不是 4×（在启动时根据窗口大小一次性决定）。
- 缩小浏览器窗口是最简单的提速方法。关闭其他占用大量 GPU 的应用程序。
- 关闭 **Post FX › Depth of field › enabled** 是所有效果中单项节省最多的（当然，画面观感也会变化）。
- 在编辑器中编辑时，请保持 *View › 3D: diorama post effects* 和 *3D: particles & god rays* 关闭（默认即为关闭），并在 128 × 128 的关卡上使用 **2D only** 布局（按键 **3**）。

### 6.4 按键没有反应

- 先**点击页面**（只有当游戏所在的标签页和窗口获得焦点时，游戏才能接收按键）。
- 当文本框获得焦点时（调试面板中的数字输入框、编辑器的检查器），按键会被忽略。点击场景即可；在编辑器中，按 **Enter** 或 **Esc** 也可以离开输入框。
- 游戏绑定的是**物理按键位置**（`KeyboardEvent.code`）：在 AZERTY 或 QWERTZ 键盘上，移动键是美式键盘上 W A S D *所在位置*的那些键（AZERTY 上为 Z Q S D），Q / E / Z / X 同理。而编辑器的工具字母快捷键使用的是键帽上*印着的*字母。
- 在编辑器中，**Ctrl+N** 在 Chrome 里会打开一个新的浏览器窗口——请使用 **Alt+N** 或 *File › New*。
- 在 Mac 上，编辑器中提到 Ctrl 的地方都可以用 **Cmd**。

### 6.5 编辑器相关

| 问题 | 解决办法 |
| --- | --- |
| *Save as* 中的 *Project folder* 是灰色的 | 只有在 `npm run dev` 下可用。请保存到浏览器或下载文件。 |
| *Saving failed: Cannot write public/levels/x.json (the file is read-only or in use by another program)* | 关闭占用该文件的程序，或清除它的只读属性。 |
| 按 **Play** / **F5** 后出现 *Pop-up blocked* | 允许编辑器地址弹出窗口。关卡已经保存在试玩槽位中：可以自行打开 `/game.html?level=local:__playtest__&autostart=1`。 |
| 未保存标记变红，并显示 *Autosave failed — browser storage is full or unavailable* | 浏览器存储已满（大型关卡占用很多空间）。保存到项目文件夹或下载关卡；在 *File › Open › This browser* 中删除旧关卡。 |
| 打开 128 × 128 的关卡时页面卡住约 2 秒 | 属于预期行为：地形在一个任务中重建，期间会显示加载遮罩。见[限制](LEVEL_EDITOR_GUIDE.zh-CN.md#14-限制与已知问题)。 |

更多内容见 [ai/KNOWN_ISSUES.md](../ai/KNOWN_ISSUES.md)。

---

## 7. 下一步

- **游玩**——[游玩指南](PLAYING_THE_GAME.zh-CN.md)：操作、HUD、时间与天气，以及烬落村和星落谷的导览。
- **制作关卡**——[关卡编辑器指南](LEVEL_EDITOR_GUIDE.zh-CN.md)，包含一个 15 分钟教程。
- **打印按键表**——[shortcuts.html](shortcuts.html)。
- **开发**——[development/DEVELOPMENT_WORKFLOW.zh-CN.md](../development/DEVELOPMENT_WORKFLOW.zh-CN.md) 和 [ai/AGENT_ONBOARDING.zh-CN.md](../ai/AGENT_ONBOARDING.zh-CN.md)；验证工具是 `npm run check`（[development/TESTING_AND_VERIFICATION.md](../development/TESTING_AND_VERIFICATION.md)），`npm run typecheck` 用于检查 JSDoc 类型（约两秒，不需要浏览器）。
