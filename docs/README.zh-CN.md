# Luminati 文档

[English](README.md) | 简体中文

> **用途**。Luminati 文档的索引：介绍本项目是什么，为每份文档提供一句话概要，为四类读者给出阅读路径，并说明每个问题以哪份文档为准。请从这里开始（或从可视化的[着陆页](index.html)开始）。
>
> **读者**。所有人：玩家、关卡设计者、引擎与工具开发者，以及开启新会话的 AI 智能体。
>
> **权威来源**。代码——[`src/`](../src/)、[`tools/`](../tools/)、[`sandbox/`](../sandbox/)、[`public/levels/`](../public/levels/)——以及[契约索引](contracts/README.zh-CN.md)中列出的引擎与功能契约。当文档与代码不一致时，请核对实现并更新文档。
>
> **相关文档。**[根目录 README](../README.zh-CN.md)（功能、操作、性能概览）· [`AGENTS.md`](../AGENTS.md)（面向编程智能体的通用指引）· [术语表](GLOSSARY.md)

![星落谷——流明山上的三姐妹瀑布，17:24，黄金时刻：层层叠叠的像素艺术草甸、水雾飞溅的级联瀑布、木桥，以及前景中一片屋顶的移轴模糊；左上角是地点标牌，右上角是时钟和小地图](assets/screenshots/starfall-three-sisters-falls.jpg)

**Luminati** 是一款受 Square Enix HD-2D 游戏启发的 2.5D 像素艺术引擎，基于 three.js r186 和原生 JavaScript ES 模块构建：像素艺术精灵与纹理伫立在一个有光照、有阴影、带移轴模糊的 3D 微缩场景中，并配有 24 小时光照调色板、天气、粒子、体积光（god rays）、程序化音乐和镀金风格的像素艺术 UI。**游戏美术和音频均在运行时生成**——纹理、角色图集、道具、音效和音乐。UI 字体是外部依赖；文档截图和 UI 沙盒背景图已提交到仓库中。三个前端共享同一个引擎：一个可游玩 `luminati-level` JSON 文件的演示**游戏**（随附六个关卡，从 28 × 22 的小村落柳湖村（Willowmere），到 128 × 128 的星落谷（Starfall Vale）和鎏金港（Gildhaven）城镇，其中包括**烬望隘口**（Cinderwatch Pass）——唯一带有即时 ARPG 战斗的关卡）、一个带实时微缩场景预览的可视化**关卡编辑器**，以及每页测试一个模块的独立**沙盒**页面。站点首页是**启动器**：一个简单的列表，列出所有战役和关卡，并附有进入游戏和编辑器的链接。一个无头 Chrome **验证工具**（`npm run check`）负责验证浏览器行为，Node 自测覆盖数据和工具链，`npm run typecheck` 则依据 JSDoc 类型检查 JavaScript 代码（使用 `tsc`，不含 `.ts` 文件）。

---

## 目录

- [快速开始](#快速开始)
- [阅读路径](#阅读路径)
- [文档树](#文档树)
- [各问题以哪份文档为准](#各问题以哪份文档为准)
- [保持文档正确](#保持文档正确)

---

## 快速开始

请使用 Node.js 24（推荐；最低 22.12）和 npm。在仓库根目录下执行：

```bash
npm install
npm run dev          # http://127.0.0.1:5173/ (launcher) · /game.html (game) · /editor.html (level editor) · /sandbox/ · /docs/index.html
npm run check -- --page=game.html --query=autostart=1 --out=demo --wait=6000    # headless check
npm run typecheck    # type-check the JavaScript through its JSDoc (0 errors expected)
npm run docs:check   # validate every link, image and anchor in the docs
npm run level:check -- brightwater-crossing   # the generators' level checks on any level file
```

详情：[user/GETTING_STARTED.md](user/GETTING_STARTED.zh-CN.md)。

---

## 阅读路径

### (a) 我想玩游戏

1. [user/GETTING_STARTED.md](user/GETTING_STARTED.zh-CN.md)——安装、`npm run dev`、各个 URL 和 `?level=` 参数、故障排除。
2. [user/PLAYING_THE_GAME.md](user/PLAYING_THE_GAME.zh-CN.md)——操作（键盘和手柄）、HUD 与地图、交谈、时间与天气、拍照模式、各个关卡、烬落村（Emberfall）和星落谷的导览、烬望隘口的战斗，以及三种语言（English、日本語、中文）。
3. [user/shortcuts.html](user/shortcuts.html)——可打印的单页按键速查表。
4. 想知道眼前看到的是什么？请看 [features/FEATURES.md](features/FEATURES.md) 和[着陆页](index.html)。

### (b) 我想制作关卡

1. [user/GETTING_STARTED.md](user/GETTING_STARTED.zh-CN.md)——运行开发服务器（只有在 `npm run dev` 下，编辑器才能保存到项目中）。
2. [user/LEVEL_EDITOR_GUIDE.md](user/LEVEL_EDITOR_GUIDE.zh-CN.md)——编辑器手册，附有一个 15 分钟教程（“Thistledown”）。
3. [design/LEVEL_DESIGN_GUIDE.md](design/LEVEL_DESIGN_GUIDE.zh-CN.md)——从教训中总结出的规则：相机朝北、悬崖与台阶、桥梁、水体、光源预算、密度、区域。
4. [specs/OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md)——所有对象类型和字段、对话语法、村民动作与行为。
5. 以随附关卡作为实例：[柳湖村](design/levels/sample-hamlet.md)（小型，脚本生成）、[明水渡（Brightwater Crossing）](design/levels/brightwater-crossing.md)（在编辑器中搭建）、[烬落村](design/levels/emberfall.md)（参考村庄）、[星落谷](design/levels/starfall-vale.md)（128 × 128，生成式）、[鎏金港](design/levels/gildhaven.md)（128 × 128 的城镇，生成式）、[烬望隘口](design/levels/cinderwatch-pass.md)（96 × 120，生成式，含战斗）。由多个关卡组成的故事：[specs/CAMPAIGN_FORMAT.md](specs/CAMPAIGN_FORMAT.md)、其剧情语言 [specs/STORY_SCRIPT.md](specs/STORY_SCRIPT.md)，以及演示战役[摆渡人的提灯（The Ferryman's Lantern）](design/campaigns/ferrymans-lantern.md)和[烬落村——敞开的门（Emberfall — Open Doors）](design/campaigns/emberfall-interiors.md)（每扇门后都有房间）。
6. 手写或用脚本编写关卡：[specs/LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) 和 [specs/LEVEL_STORAGE_API.md](specs/LEVEL_STORAGE_API.md)。
7. 你所追求的画面风格：[design/VISUAL_DESIGN.md](design/VISUAL_DESIGN.md)。

### (c) 我想扩展引擎、游戏或编辑器

1. [architecture/OVERVIEW.md](architecture/OVERVIEW.md)——各程序、分层规则、帧循环、共享 uniform、关卡管线、状态存放位置。图示版本：[architecture/diagrams.html](architecture/diagrams.html)。
2. [development/DEVELOPMENT_WORKFLOW.md](development/DEVELOPMENT_WORKFLOW.zh-CN.md) 和 [development/CONVENTIONS.md](development/CONVENTIONS.md)——日常工作循环、沙盒优先的工作方式、回归测试实践、代码约定和 JSDoc 类型检查。
3. 你要修改的领域：
   - 引擎模块——[architecture/modules/README.md](architecture/modules/README.zh-CN.md)（`core`、`audio`、`render`、`pixel`、`sprite`、`fx`、`lighting`、`world`、`level`、`ui` 的索引）；
   - 渲染——[architecture/RENDER_PIPELINE.md](architecture/RENDER_PIPELINE.md)；
   - 游戏——[architecture/GAME.md](architecture/GAME.md)；其战斗——[contracts/COMBAT.md](contracts/COMBAT.md)（约束性）和 [GAME.md §15](architecture/GAME.md#15-combat-combat-levels-only)；
   - 编辑器——[architecture/EDITOR.md](architecture/EDITOR.md)；
   - 性能——[architecture/PERFORMANCE.md](architecture/PERFORMANCE.md)。
4. [contracts/README.md](contracts/README.zh-CN.md)——哪些内容具有约束力，以及修改契约时的“只增不改”规则（[`ARCHITECTURE.md`](../ARCHITECTURE.md)、[contracts/LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md)、[contracts/COMBAT.md](contracts/COMBAT.md)）。
5. [ai/TASK_PLAYBOOKS.md](ai/TASK_PLAYBOOKS.md)——分步操作手册（新对象类型、瓦片、粒子预设、后期效果、纹理、角色、NPC 动作、输入动作、UI 组件、编辑器工具、关卡字段、生成器、依赖升级、敌人种类、战斗调优、战役、剧情、翻译与显示位置……）；对人类开发者同样有用。
6. [development/TESTING_AND_VERIFICATION.md](development/TESTING_AND_VERIFICATION.md) 和 [specs/AUTOMATION_API.md](specs/AUTOMATION_API.md)——如何证明改动是有效的。
7. 开始之前：[ai/KNOWN_ISSUES.md](ai/KNOWN_ISSUES.md)；要了解设计依据，请阅读相关的架构或契约文档。

### (d) 我是开启新会话的 AI 智能体

1. **[ai/AGENT_ONBOARDING.md](ai/AGENT_ONBOARDING.zh-CN.md)——请首先完整阅读**。它给出了 17 条黄金规则（光源数量、着色器预热、确定性、字节稳定的关卡、大关卡路径、类型检查、不可信的关卡名称……）、仓库地图、验证循环和“X 在哪里”索引。
2. [ai/KNOWN_ISSUES.md](ai/KNOWN_ISSUES.md)——先看顶部的“最重要的陷阱”列表，再看与你的领域相关的章节。
3. [ai/TASK_PLAYBOOKS.md](ai/TASK_PLAYBOOKS.md)——如果有对应你任务的操作手册，请阅读。
4. 该领域的权威参考文档（见[权威来源表](#各问题以哪份文档为准)），然后阅读其中提到的代码。
5. [specs/AUTOMATION_API.md](specs/AUTOMATION_API.md)——`window.__game`、`window.__editor`、验证工具的步骤；[development/TESTING_AND_VERIFICATION.md](development/TESTING_AND_VERIFICATION.md) 列出了完成前要运行的回归检查。
6. 修改行为后，请更新权威文档和 [ai/KNOWN_ISSUES.md](ai/KNOWN_ISSUES.md)，然后运行 `npm run docs:check`。

---

## 文档树

列出每个文件及其用途。标记为**约束性**的文档是契约；其余文档均是对代码的描述。

- **[README.md](README.zh-CN.md)**——本索引。
- **[index.html](index.html)**——可视化着陆页：截图、功能卡片、关卡卡片、图库，以及指向每份文档的链接（自包含；可通过 `file://` 和 `/docs/` 打开）。
- **[GLOSSARY.md](GLOSSARY.md)**——项目词汇表，包括具有两种含义的词（_level_、_emitter_、_light_、_marker_……）和战斗术语（hit-stop、telegraph、attack token……）。
- **`assets/screenshots/`**——文档所用的精选 JPEG 截图（游戏、战斗、编辑器、沙盒）。
- **ai/**——面向 AI 智能体（以及想快速了解项目的人类）
  - [AGENT_ONBOARDING.md](ai/AGENT_ONBOARDING.zh-CN.md)——从这里开始：Luminati 是什么、10 分钟快速上手、仓库地图、黄金规则、验证循环和环境要求。
  - [TASK_PLAYBOOKS.md](ai/TASK_PLAYBOOKS.md)——27 份针对常见改动的操作手册，列出要修改的文件、陷阱和验证方法；附有经过测试的验证工具代码片段。
  - [KNOWN_ISSUES.md](ai/KNOWN_ISSUES.md)——按领域列出的所有已知限制、未解决问题和陷阱，附状态和建议方向；文档差异；过时的代码注释。
- **user/**——面向玩家和关卡设计者
  - [GETTING_STARTED.md](user/GETTING_STARTED.zh-CN.md)——运行要求、安装、开发服务器、启动器和 URL 参数、构建与部署、故障排除。
  - [PLAYING_THE_GAME.md](user/PLAYING_THE_GAME.zh-CN.md)——玩家指南：操作、HUD、对话、时间与天气、拍照模式、调试面板、各个关卡和导览。
  - [LEVEL_EDITOR_GUIDE.md](user/LEVEL_EDITOR_GUIDE.zh-CN.md)——编辑器手册：视图、工具、调色板、检查器、保存、自动保存、试玩、一个教程以及编辑器的限制。
  - [shortcuts.html](user/shortcuts.html)——可打印的游戏与编辑器键盘及手柄速查表。
- **features/**
  - [FEATURES.md](features/FEATURES.md)——功能目录：按领域列出每项能力，附其代码、权威文档和状态；数量一览；Luminati 不做的事情。
- **specs/**——数据与接口的规范性参考
  - [LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md)——逐字段说明 `luminati-level` v1 文件：地形、高度与可行走性、楼梯、水体、环境、出生点、规范化、校验、字节稳定的序列化，以及一个完整示例。
  - [OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md)——对象类型：字段、默认值、游戏构建的内容、光源及其优先级、村民、小动物、粒子区域、区域、战役出口与入口、剧情字段。
  - [INPUT_AND_CONTROLS.md](specs/INPUT_AND_CONTROLS.md)——输入动作和默认绑定、游戏在各状态下的行为、编辑器快捷键和按键分发顺序。
  - [AUTOMATION_API.md](specs/AUTOMATION_API.md)——页面全局对象（`__game`、`__luminati`、`__engine`、`__editor`）、查询参数、验证工具 CLI 和每个动作脚本步骤、使用示例。
  - [LEVEL_STORAGE_API.md](specs/LEVEL_STORAGE_API.md)——`LevelStorage`、浏览器存档槽和键、自动保存与恢复、开发服务器 REST API（包括战役路由）、URL 解析、文件导入 / 导出、安全说明。
  - [CAMPAIGN_FORMAT.md](specs/CAMPAIGN_FORMAT.md)——战役，即由多个关卡组成的故事：战役文件夹和 `campaign.json`、出口与入口、战役平面与接缝、剧情标志、条件与章节、在游戏中切换关卡、存档、编辑器、检查。
  - [STORY_SCRIPT.md](specs/STORY_SCRIPT.md)——剧情：条件、脚本语言及其命令、`event` 对象与触发器、交谈脚本与角色、剧情文件（物品、任务、角色、起始预设）、运行、过场动画、实时在场、日志、存档、检查和测试。
  - [PARTY.md](specs/PARTY.md)——队伍：加入玩家的村民、跟随、战斗中的同伴及其规则（预设、字段、职业）、战术面板、剧情的 `party` 命令、存档，以及烬望隘口演示（伊尔莎（Ilse）、鲁克（Rook）和瑟拉（Sela））。
  - [PIXEL_UI.md](specs/PIXEL_UI.md)——像素 UI（UI 的契约，并与代码一起构成其参考）：美术比例（`--px`、`--fpx`、小屏幕）、美术套件和字体角色及其 API、根节点、每个组件的制作方法（尺寸以美术像素计）、组件与调用方之间的接口，以及实现说明。
  - [I18N.md](specs/I18N.md)——语言（英语、日语、简体中文）：如何选择语言、UI 字符串表及其注册者、在显示时翻译的内容文本（以 GUID 形式保存在数据中并在编辑中保留的文本键、`loc()` / `term()`、`public/i18n/` 中的表、提取、检查器、键工具、工作清单和 PO 交换、导览），以及字体（优先使用 Google，否则使用 `dist/`；别名和像素字形）。
  - [I18N_GLOSSARY.md](specs/I18N_GLOSSARY.md)——随附关卡和战役中所有名称和术语的日语与中文译名、译者风格说明和 UI 词汇。
- **architecture/**——代码是如何构建的
  - [OVERVIEW.md](architecture/OVERVIEW.md)——全局视图：系统上下文、依赖规则、模块地图、帧循环、共享 uniform、关卡管线、编辑器数据流、单位、色彩管理、启动、状态、不变量。
  - [RENDER_PIPELINE.md](architecture/RENDER_PIPELINE.md)——渲染器设置、场景组成、着色器补丁、阴影、24 小时光照模型、PostFX 各通道及其设置、预热。
  - [PERFORMANCE.md](architecture/PERFORMANCE.md)——预算、测量数据（烬落村、星落谷、编辑器）、每一种可扩展性机制、测量方法、已知限制。
  - [GAME.md](architecture/GAME.md)——游戏：启动、加载、模式、帧顺序、交互与对话、相机、世界构建、玩家、村民、小动物、天气、音频导演、分辨率调节器，以及战役如何切换关卡（`swapLevel`）。
  - [EDITOR.md](architecture/EDITOR.md)——关卡编辑器：`EditorApp`、`EditorState` 和事务、工具接口、2D 地图、3D 视口及其增量重建、保存 / 自动保存 / 试玩、让预览与游戏保持同步。
  - [diagrams.html](architecture/diagrams.html)——六幅手绘图：模块依赖、帧循环、渲染管线、关卡构建、编辑器数据流、光源池分配。
  - **modules/**——各引擎模块的权威参考
    - [README.md](architecture/modules/README.zh-CN.md)——引擎各领域的索引、依赖关系图、`src/engine/index.js` 的完整公开 API、沙盒页面。
    - [core.md](architecture/modules/core.md)——`Engine`、`Input`、`CameraRig`、`EventEmitter`、常量、带种子的数学工具。
    - [audio.md](architecture/modules/audio.md)——`AudioSystem`：程序化音效、环境音层、音乐。
    - [render.md](architecture/modules/render.md)——`PostFX`、后期着色器、`GlobalUniforms`。
    - [pixel.md](architecture/modules/pixel.md)——`PixelCanvas`、`Palette`、`TextureLibrary`（46 种纹理）、`CharacterSprites`（14 个预设、4 种生物）、`PropSprites`（23 种）。
    - [sprite.md](architecture/modules/sprite.md)——`Sprite3D`、`SpriteManager`、`Foliage`、`BlobBatch`。
    - [fx.md](architecture/modules/fx.md)——`Particles`（12 个预设）和 `GodRays`。
    - [lighting.md](architecture/modules/lighting.md)——`LightingSystem`（13 个关键帧）、`LightPool`、`Sky`。
    - [world.md](architecture/modules/world.md)——`TileMap`、`Water`、`PropFactory` 和 `props/*`、`SpatialSplit`、`ShadowCasters`。
    - [level.md](architecture/modules/level.md)——`LevelFormat`、`ObjectCatalog`、`ObjectBuilder`、`LevelStorage`、`LevelMap`。
    - [ui.md](architecture/modules/ui.md)——DOM 叠加层：对话框、横幅、标题、HUD、小地图和世界地图、提示、渐变遮罩、调试面板、`ui.css`。
- **design/**——画面风格与关卡
  - [VISUAL_DESIGN.md](design/VISUAL_DESIGN.md)——2.5D 像素艺术画面由哪些部分构成，以及每个部分在哪里设置：像素密度、调色板、精灵、相机、后期参数、光照、天气、UI。
  - [LEVEL_DESIGN_GUIDE.md](design/LEVEL_DESIGN_GUIDE.zh-CN.md)——关卡设计规则，每条都附有理由和对应的检查；以及发布前检查清单。
  - **levels/**——每个随附关卡各有一份设计文档
    - [emberfall.md](design/levels/emberfall.md)——烬落村，48 × 40 的参考村庄（默认关卡）。
    - [starfall-vale.md](design/levels/starfall-vale.md)——星落谷，生成式的 128 × 128 展示关卡。
    - [brightwater-crossing.md](design/levels/brightwater-crossing.md)——明水渡，完全在编辑器中搭建的 36 × 28 小村落。
    - [sample-hamlet.md](design/levels/sample-hamlet.md)——柳湖村，小型脚本生成示例关卡。
    - [cinderwatch-pass.md](design/levels/cinderwatch-pass.md)——烬望隘口，生成式的 96 × 120 战斗关卡（营地、林地、两条岔路、采石场、首领烬心（Cinderheart）；三名会加入的同伴，按四人队伍平衡）。
    - [gildhaven.md](design/levels/gildhaven.md)——鎏金港，生成式的 128 × 128 城墙环绕的河畔城镇，正值集市日（68 名村民；街道间距如何适应朝北的相机）。
  - **campaigns/**——每个随附战役各有一份设计文档
    - [ferrymans-lantern.md](design/campaigns/ferrymans-lantern.md)——摆渡人的提灯，生成式的演示战役：四个地点、接缝、一扇上锁的门、一个战斗关卡、两个章节。
    - [emberfall-interiors.md](design/campaigns/emberfall-interiors.md)——烬落村——敞开的门，生成式的房间演示：在烬落村的地图上，每扇门后都有一个布置好家具的房间，还有楼上楼层、家具及其摆放，以及实测的移动时间。
- **development/**——参与仓库开发
  - [DEVELOPMENT_WORKFLOW.md](development/DEVELOPMENT_WORKFLOW.zh-CN.md)——环境搭建、目录结构、运行与构建、沙盒优先的工作方式、关卡、回归测试实践和平台说明。
  - [TESTING_AND_VERIFICATION.md](development/TESTING_AND_VERIFICATION.md)——深入介绍验证工具、动作脚本、沙盒、类型检查及其能发现的问题、性能测量、视觉回归、提交前检查清单。
  - [CONVENTIONS.md](development/CONVENTIONS.md)——代码约定及其理由，包括 JSDoc 类型规则、类型检查以及契约类型所在的位置（§3.1）。
- **contracts/**——约束性文档和构建者笔记
  - [README.md](contracts/README.zh-CN.md)——哪些内容具有约束力、优先级、如何修改契约、契约与代码之间的已知差异。
  - [LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md)——**约束性**：关卡格式、对象目录、构建器、存储、编辑器架构、工具接口、用户体验、性能设计。
  - [COMBAT.md](contracts/COMBAT.md)——**约束性**：ARPG 战斗——按关卡启用、操作、玩家规则、敌人与首领、运行时接口、精灵、视觉特效、音频、UI、战斗目录类型、烬望隘口、预算、测试，以及集成时记录的偏差。
  - [MODULE_NOTES.md](contracts/MODULE_NOTES.md)——描述性：各引擎模块的构建者和审核者所报告的内容（附有一张记录过时陈述的勘误表）。

`docs/` 之外：根目录的 [`README.md`](../README.zh-CN.md)（功能、操作、性能）、[`ARCHITECTURE.md`](../ARCHITECTURE.md)（**约束性**引擎契约：视觉目标、约定、模块 API）、[`AGENTS.md`](../AGENTS.md)（面向编程智能体的通用指引）和 [`CLAUDE.md`](../CLAUDE.md)（Claude Code 的入口）。

---

## 各问题以哪份文档为准

代码永远是最终依据。下表针对每个问题，列出依据代码编写、能回答该问题的文档——请链接到它，而不是重复其内容。

| 问题 | 权威文档 | 约束性契约 / 代码 |
| --- | --- | --- |
| 如何安装、运行、构建、部署？ | [user/GETTING_STARTED.md](user/GETTING_STARTED.zh-CN.md) | [`package.json`](../package.json)、[`vite.config.js`](../vite.config.js) |
| 有哪些操作？ | [user/PLAYING_THE_GAME.md](user/PLAYING_THE_GAME.zh-CN.md)（面向玩家）、[specs/INPUT_AND_CONTROLS.md](specs/INPUT_AND_CONTROLS.md)（规范性） | [`Input.js`](../src/engine/core/Input.js) 中的 `DEFAULT_BINDINGS` / `DEFAULT_PAD_BINDINGS` |
| 如何使用关卡编辑器？ | [user/LEVEL_EDITOR_GUIDE.md](user/LEVEL_EDITOR_GUIDE.zh-CN.md) | [`src/editor/`](../src/editor/EditorApp.js) |
| Luminati 能做什么，在哪里实现？ | [features/FEATURES.md](features/FEATURES.md) | — |
| 战斗如何运作（规则、敌人、首领、API）？ | [contracts/COMBAT.md](contracts/COMBAT.md)、[architecture/GAME.md §15](architecture/GAME.md#15-combat-combat-levels-only) | [`src/game/combat/`](../src/game/combat/CombatSystem.js) |
| 关卡文件里有什么？ | [specs/LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) | [contracts/LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md) §1、[`LevelFormat.js`](../src/engine/level/LevelFormat.js) |
| 有哪些对象类型，各有哪些字段？ | [specs/OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md) | [contracts/LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md) §2、[`ObjectCatalog.js`](../src/engine/level/ObjectCatalog.js) |
| 多个关卡如何组成一个故事（战役、出口、存档）？ | [specs/CAMPAIGN_FORMAT.md](specs/CAMPAIGN_FORMAT.md) | [`src/game/campaign/`](../src/game/campaign/CampaignRuntime.js)、[`Travel.js`](../src/engine/level/Travel.js) |
| 如何编写对话、事件、任务和过场动画？ | [specs/STORY_SCRIPT.md](specs/STORY_SCRIPT.md) | [`StoryScript.js`](../src/engine/level/StoryScript.js)、[`src/game/story/`](../src/game/story/StoryRunner.js) |
| 同伴如何加入、跟随和战斗（队伍）？ | [specs/PARTY.md](specs/PARTY.md) | [`PartyRules.js`](../src/engine/level/PartyRules.js)、[`src/game/party/`](../src/game/party/Party.js) |
| UI 是如何绘制的（比例、美术、字体、组件）？ | [specs/PIXEL_UI.md](specs/PIXEL_UI.md)、[architecture/modules/ui.md](architecture/modules/ui.md) | [`src/engine/ui/`](../src/engine/ui/UI.js)（`UiScale.js`、`art/`、`layout/`） |
| 语言、翻译和字体如何运作？ | [specs/I18N.md](specs/I18N.md)、[specs/I18N_GLOSSARY.md](specs/I18N_GLOSSARY.md)（名称和术语） | [`src/engine/i18n/`](../src/engine/i18n/I18n.js)（键：[`ContentKeys.js`](../src/engine/i18n/ContentKeys.js)、[`TextKeys.js`](../src/engine/i18n/TextKeys.js)）、[`public/i18n/`](../public/i18n/index.json)、[`tools/i18n-keys.mjs`](../tools/i18n-keys.mjs)、[`FontLoader.js`](../src/engine/ui/FontLoader.js) |
| 关卡存储在哪里；开发服务器 API？ | [specs/LEVEL_STORAGE_API.md](specs/LEVEL_STORAGE_API.md) | [contracts/LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md) §4、[`LevelStorage.js`](../src/engine/level/LevelStorage.js)、[`vite-level-api.js`](../tools/vite-level-api.js) |
| 如何对游戏和编辑器编写脚本或进行测试？ | [specs/AUTOMATION_API.md](specs/AUTOMATION_API.md)、[development/TESTING_AND_VERIFICATION.md](development/TESTING_AND_VERIFICATION.md) | [`tools/check.mjs`](../tools/check.mjs) |
| 引擎模块 X 暴露了什么？ | [architecture/modules/](architecture/modules/README.zh-CN.md) | [`ARCHITECTURE.md`](../ARCHITECTURE.md) §4、[`src/engine/index.js`](../src/engine/index.js) |
| 各部分如何组合在一起；每帧运行什么？ | [architecture/OVERVIEW.md](architecture/OVERVIEW.md) | [`Engine.js`](../src/engine/core/Engine.js)、[`Game.js`](../src/game/Game.js) |
| 一帧是如何渲染的；着色器；光照？ | [architecture/RENDER_PIPELINE.md](architecture/RENDER_PIPELINE.md) | [`PostFX.js`](../src/engine/render/PostFX.js)、[`LightingSystem.js`](../src/engine/lighting/LightingSystem.js) |
| 它有多快，靠什么保持快速？ | [architecture/PERFORMANCE.md](architecture/PERFORMANCE.md) | [`ARCHITECTURE.md`](../ARCHITECTURE.md) §1（预算）、[`World.js`](../src/game/World.js) 中的 `BIG_LEVEL_BATCHING` |
| 游戏如何运作？ | [architecture/GAME.md](architecture/GAME.md) | [`src/game/`](../src/game/Game.js)、[`src/main.js`](../src/main.js) |
| 编辑器如何运作？ | [architecture/EDITOR.md](architecture/EDITOR.md) | [contracts/LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md) §6–§9 |
| 场景为什么是这个样子；哪个常量控制什么？ | [design/VISUAL_DESIGN.md](design/VISUAL_DESIGN.md) | [`ARCHITECTURE.md`](../ARCHITECTURE.md) §1、[`src/game/config.js`](../src/game/config.js) |
| 应该如何布置关卡？ | [design/LEVEL_DESIGN_GUIDE.md](design/LEVEL_DESIGN_GUIDE.zh-CN.md) | [`make-starfall-vale.mjs`](../tools/make-starfall-vale.mjs) 中的校验器、`validateLevel` |
| 关卡 X 里有什么，如何安全地修改它？ | [design/levels/](design/levels/emberfall.md) | [`public/levels/`](../public/levels/) 及其生成器 |
| 如何安全地进行改动 Y？ | [ai/TASK_PLAYBOOKS.md](ai/TASK_PLAYBOOKS.md) | — |
| 哪些地方有缺陷、有局限或是陷阱？ | [ai/KNOWN_ISSUES.md](ai/KNOWN_ISSUES.md) | — |
| 适用哪些代码约定？ | [development/CONVENTIONS.md](development/CONVENTIONS.md) | [`ARCHITECTURE.md`](../ARCHITECTURE.md) §2 |
| JavaScript 如何进行类型检查；契约类型在哪里？ | [development/CONVENTIONS.md §3.1](development/CONVENTIONS.md#31-the-type-check) | [`tsconfig.json`](../tsconfig.json)、[`level/types.d.ts`](../src/engine/level/types.d.ts)、[`combat/types.d.ts`](../src/game/combat/types.d.ts)、[`globals.d.ts`](../src/globals.d.ts) |
| 日常如何工作；git；Windows？ | [development/DEVELOPMENT_WORKFLOW.md](development/DEVELOPMENT_WORKFLOW.zh-CN.md) | — |
| 契约中哪些可以改，怎么改？ | [contracts/README.md](contracts/README.zh-CN.md) | [`ARCHITECTURE.md`](../ARCHITECTURE.md)、[contracts/LEVEL_EDITOR.md](contracts/LEVEL_EDITOR.md) |
| 为什么要这样构建？ | [architecture/OVERVIEW.md](architecture/OVERVIEW.md)，然后是相关模块或契约文档 | 各文档中指明的实现 |
| 应该如何解读测量数据？ | [architecture/PERFORMANCE.md](architecture/PERFORMANCE.md) | 针对当前版本和环境重新运行文档中的检查 |
| 某个术语是什么意思？ | [GLOSSARY.md](GLOSSARY.md) | — |

---

## 保持文档正确

- **每份文档都以一个头部区块开头**——用途、读者、权威来源（它所描述的代码）、相关文档。编辑时请保留它；新文档也要加上。
- **链接，而不是重复**。每个主题都有一份权威文档（见上表）；其他文档用一句话概括并链接过去。
- **通过相对路径和符号名引用代码**，绝不使用行号（`[TileMap.js](../src/engine/world/TileMap.js)` `move`）。
- **以代码为准**。当文档与代码不一致时，修正文档；如果该文档是约束性契约，只能以“只增不改”的方式修改它（[contracts/README.md](contracts/README.zh-CN.md)），并在 [ai/KNOWN_ISSUES.md](ai/KNOWN_ISSUES.md#documentation-discrepancies) 中记录差异。
- **契约有带类型的副本**。关卡格式、战斗接口、工具接口和自动化钩子也被声明为类型，代码会依据这些类型进行检查（[development/CONVENTIONS.md §3.1](development/CONVENTIONS.md#31-the-type-check)）；这些类型跟随代码。当契约文档与其类型不一致时，通常类型是对的——请核对代码并修正文档。
- **数字要附带条件**（版本、视口、渲染设置、场景和时刻）。历史测量数据存放在 [architecture/PERFORMANCE.md](architecture/PERFORMANCE.md) 中；它们只是示例，而不是可移植的性能保证。避免出现个人工作站标识。
- **HTML 页面**（[index.html](index.html)、[user/shortcuts.html](user/shortcuts.html)、[architecture/diagrams.html](architecture/diagrams.html)）是自包含的（内联 CSS 和 SVG，无外部资源），跟随浅色 / 深色偏好，并且必须能通过 `file://` 和开发服务器上的 `/docs/` 正常打开。请用 `npm run check -- --page=docs/<file>.html --query= --out=<name> --wait=1000 --fps=0` 检查它们，并查看截图。
- 每次改动后**运行 `npm run docs:check`**（[`tools/check-docs-links.mjs`](../tools/check-docs-links.mjs)）：它会校验 `docs/` 和根目录所有 Markdown 文件中的每个相对链接、图片和 `#anchor`（GitHub 风格的标题 slug，当前的 GitLab 也使用这种格式），发现失效链接时以退出码 1 退出。
- **保持文档公开且可移植**。使用相对于仓库的路径和通用的环境配置示例。不要包含个人用户名、绝对工作区路径、私有 URL、凭据或未公开的会话报告。全新检出的仓库应包含所有被引用的文档。
