# Luminati —— 基于 three.js 的 2.5D 像素艺术引擎

[English](README.md) | 简体中文

> **镜像说明**：本仓库是 GitLab 上 [stubborn-hug/lumina](https://gitlab.com/stubborn-hug/lumina) 的镜像，原作者为 **stubborn-hug**。原作品的一切荣誉归其作者所有。本仓库依照原有的 [MIT 许可证](LICENSE)再分发，并保留了原始提交历史。

Luminati 将像素艺术精灵与带光照的 3D 场景、动态阴影和景深效果结合在一起。它的灵感来自 Square Enix HD-2D 游戏的“微缩模型”画面风格，使用 three.js 和原生 JavaScript ES 模块构建。

世界纹理、精灵、特效、音效和音乐均在运行时以程序化方式生成。文档截图和 UI 沙盒背景图包含在仓库中。游戏支持**英语、日语和简体中文**。

![黄金时刻的烬落村](docs/assets/screenshots/emberfall-golden-hour.jpg)

## 快速开始

请使用 **Node.js 24**（推荐；开发依赖至少需要 22.12）和 npm。游戏需要支持 **WebGL 2** 并开启硬件加速的浏览器。浏览器检查已在 Windows 上的 Chrome 中验证；当前的测试范围限制见[运行要求](docs/user/GETTING_STARTED.zh-CN.md#2-环境要求)。

克隆本项目，进入仓库目录，然后运行：

```bash
npm install
npm run dev
```

打开 [http://127.0.0.1:5173/](http://127.0.0.1:5173/) 进入**启动器**。它列出了所有随附的战役和关卡，并提供游玩或编辑它们的链接。如果端口被占用，请使用 Vite 输出的 URL。

```bash
npm run build      # Build the launcher, game and editor into dist/
npm run preview    # Preview the build locally
```

将 `dist/` 中的内容发布到任意静态 HTTP(S) 主机即可。资源使用相对 URL，因此支持部署在项目子路径下。在已发布的站点上，编辑器可以保存到浏览器存储或下载文件；保存到仓库则需要本地开发服务器。参见[构建与部署](docs/user/GETTING_STARTED.zh-CN.md#5-构建与部署)。

## 探索演示

在启动器中选择目的地，或将以下路径之一追加到本地服务器 URL 之后：

| 目的地 | 路径 | 可以探索的内容 |
| --- | --- | --- |
| **烬落村**（Emberfall） | `game.html` | 一座河畔村庄，有村民、风车、农田、瀑布和变化的天气。 |
| **星落谷**（Starfall Vale） | `game.html?level=starfall-vale` | 一片 128 × 128 的节庆山谷，有集镇、天文台、湖泊和森林。 |
| **烬望隘口**（Cinderwatch Pass） | `game.html?level=cinderwatch-pass` | 动作战斗、三名可招募的同伴，以及分三阶段的首领烬心（Cinderheart）。按四人队伍平衡。 |
| **鎏金港**（Gildhaven） | `game.html?level=gildhaven` | 一座有城墙环绕的河畔城镇，有 68 名村民、集市、码头和一座修道院。 |
| **明水渡**（Brightwater Crossing） | `game.html?level=brightwater-crossing` | 一座用可视化关卡编辑器搭建的小村落。 |
| **柳湖村**（Willowmere） | `game.html?level=sample-hamlet` | 一个紧凑的生成式示例关卡。 |
| **摆渡人的提灯**（The Ferryman's Lantern） | `game.html?campaign=ferrymans-lantern` | 一段跨越多个关卡的短篇故事，包含任务、过场动画、战斗和进度存档。 |
| **烬落村——敞开的门**（Emberfall — Open Doors） | `game.html?campaign=emberfall-interiors` | 每扇门后都有布置好家具的房间，旅店、风车磨坊和谷仓还有楼上的楼层。 |

战役进度和编辑器的浏览器存档属于当前浏览器和站点地址，不会在设备之间同步。想要保留的关卡请导出为文件。

## 功能特性

- **渲染**：受光照的像素精灵、昼夜光照、动态阴影、移轴景深、泛光、水面、风、天气、植被和 GPU 粒子。
- **世界构建**：多层高度的瓦片地形、楼梯、桥梁、程序化建筑和道具、室内房间，以及支持最大 128 × 128 瓦片关卡的空间合批。
- **玩法**：探索、对话、地图、程序化音频、拍照模式和实时调试面板。
- **战斗**：剑技连段、闪避、技能、战利品、商店、检查点、带预警的敌人攻击，以及可配置战术的同伴。战斗系统仅在启用了它的关卡中加载。
- **故事**：一种基于行的脚本语言，用于编写分支对话、任务、物品、事件、过场动画和随剧情变化的对象；战役可在不重新加载页面的情况下串联多个关卡。
- **工具**：可视化关卡编辑器、确定性关卡生成器、浏览器验证工具、JavaScript 类型检查和翻译工具。

详情和实现链接请参见[功能参考](docs/features/FEATURES.md)。

## 操作

| 动作 | 键盘 / 鼠标 |
| --- | --- |
| 移动 / 奔跑 | W A S D 或方向键 / 按住 Shift |
| 交谈、调查、确认 | Space、Enter 或 F |
| 旋转 / 缩放 | Q / E、Z / X 或鼠标滚轮 |
| 世界地图 / 拍照模式 | N 或 Tab / P |
| 时间 / 天气 / 音乐 | T / R / M |
| 攻击 / 闪避（战斗） | J 或鼠标左键 / K 或鼠标右键 |
| 技能 / 治疗药剂（战斗） | U / I / O 或 1 / 2 / 3 / C 或 4 |
| 队伍战术 / 日志 | G / B（可用时） |

按下任意键或点击后才会开始播放声音。游戏支持标准映射的游戏手柄。完整操作请参见[游戏指南](docs/user/PLAYING_THE_GAME.zh-CN.md)和[可打印的快捷键表](docs/user/shortcuts.html)。

## 语言

在标题画面按 **L** 选择语言，或在 `game.html` 后加上 `?lang=ja`、`?lang=zh` 或 `?lang=en`（如果已有其他参数，请使用 `&lang=…`）。编辑器和调试面板使用英语。关卡文本保留稳定的键名；翻译单独存放在 `public/i18n/` 中。

[翻译指南](docs/specs/I18N.md)介绍了字符串表、内容键、字体和译者工作清单。[术语表](docs/specs/I18N_GLOSSARY.md)用于保持名称和术语的一致。

## 关卡编辑器

打开 `editor.html` 即可绘制地形、塑造高度、放置对象、编辑对话和剧情脚本，并在 3D 中预览效果。按 **F5** 试玩当前关卡。关卡可以通过开发服务器保存到仓库中、保存在浏览器存储里，或下载为 JSON 文件。

请从[编辑器指南](docs/user/LEVEL_EDITOR_GUIDE.zh-CN.md)开始，其中包括[小村落教程](docs/user/LEVEL_EDITOR_GUIDE.zh-CN.md#12-教程15-分钟搭建一个小村落)。对于生成式演示关卡，请编辑对应的 `tools/make-*.mjs` 生成器并重新生成输出；[关卡工作流程](docs/development/DEVELOPMENT_WORKFLOW.zh-CN.md#7-处理关卡)列出了各关卡的源文件。

## 架构

引擎（`src/engine/`）、游戏（`src/game/`）和编辑器（`src/editor/`）共享原生 JavaScript 模块。`src/engine/index.js` 导出公开的引擎 API。关卡和战役文件是存放在 `public/` 中的数据；启动器通过一个 Vite 插件列出它们。生产构建没有后端。

在修改接口之前，请阅读[架构概览](docs/architecture/OVERVIEW.md)、[模块参考](docs/architecture/modules/README.zh-CN.md)和[约束性契约](docs/contracts/README.zh-CN.md)。[代码约定](docs/development/CONVENTIONS.md)涵盖 JSDoc 类型、确定性生成、资源所有权和渲染不变量。

### 游戏代码（`src/game/`）

`Game` 负责协调引擎；`World` 构建并持有一个关卡。战斗、战役、剧情和队伍系统各有独立的模块。参见[游戏架构](docs/architecture/GAME.md)。

### 自动化钩子

游戏暴露 `window.__game` 和 `window.__luminati`；编辑器暴露 `window.__editor`。它们提供状态查询和操作，用于调试和脚本化检查。其契约和示例请参见[自动化 API](docs/specs/AUTOMATION_API.md)。

## 沙盒

运行开发服务器并打开 `/sandbox/`，即可访问各模块的独立页面。浏览器验证工具会启动自己的服务器，运行一个页面或动作脚本，并将报告和截图写入 `.check/`：

```bash
npm run typecheck
npm run docs:check
npm run check -- --page=game.html --out=demo --wait=6000 --strict
```

该工具使用已安装的 Chrome 或 Edge，而不是下载的浏览器，目前带有 Windows 专用的 GPU 设置。除了退出码之外，也请查看报告和截图。[测试与验证](docs/development/TESTING_AND_VERIFICATION.md)列出了可用的检查、浏览器设置、预期的警告以及每项功能对应的测试套件。

## 性能

渲染目标是在默认相机距离下，以 1600 × 900 分辨率达到 60 fps，场景绘制调用约 300 次或更少。这些是开发预算，而不是硬件要求或性能保证。分辨率缩放、光源池、合批和着色器预热有助于让大型场景保持流畅。

[性能](docs/architecture/PERFORMANCE.md)记录了基准测试条件和历史测量数据。请在同一台机器上比较 GPU 和 CPU 帧时间；仅凭被合成器限制的帧率无法看出渲染余量。

## 文档

[文档索引](docs/README.zh-CN.md) · [入门指南](docs/user/GETTING_STARTED.zh-CN.md) · [游戏指南](docs/user/PLAYING_THE_GAME.zh-CN.md) · [编辑器指南](docs/user/LEVEL_EDITOR_GUIDE.zh-CN.md) · [已知问题](docs/ai/KNOWN_ISSUES.md)

[可视化文档页面](docs/index.html)可以直接打开，也可以在开发服务器上通过 `/docs/` 访问。AI 编程智能体还应阅读[入门引导指南](docs/ai/AGENT_ONBOARDING.zh-CN.md)。

## 社区

欢迎加入 [Discord 社区](https://discord.gg/FeNXqtbqgy)参与讨论。本地开发请参见[开发工作流程](docs/development/DEVELOPMENT_WORKFLOW.zh-CN.md)。

## 许可证

Luminati 采用 [MIT 许可证](LICENSE)授权。第三方依赖和字体保留各自的许可证。
