# 仓库指引

本指引适用于在本仓库中工作的所有贡献者和编码代理。请先阅读[入门指南](docs/ai/AGENT_ONBOARDING.zh-CN.md)，再阅读你要修改的模块对应的契约文档和[任务手册](docs/ai/TASK_PLAYBOOKS.md)。[文档索引](docs/README.zh-CN.md)列出了每个领域的权威参考文档。

## 项目与命令

Luminati 是一个基于 three.js 和纯 JavaScript ES 模块构建的 2.5D 像素风引擎。JSDoc 类型由 TypeScript 检查；项目中没有应用层 `.ts` 文件，也没有框架、linter 或外部测试运行器。纹理、精灵、音效和音乐都在运行时生成。

前端入口包括：启动器（`index.html`，列表由 `tools/vite-launcher.js` 生成）、游戏（`game.html` → `src/main.js` → `src/game/`）、编辑器（`editor.html` → `src/editor/`），以及 `sandbox/` 中的独立模块检查页面。它们共用 `src/engine/`，其公共 API 由 `src/engine/index.js` 导出。随项目发布的内容位于 `public/levels/`、`public/campaigns/` 和 `public/i18n/`。

先执行 `npm ci`，然后在仓库根目录运行命令。推荐使用 Node.js 24；支持的版本和浏览器验证限制见[环境要求](docs/user/GETTING_STARTED.zh-CN.md#2-环境要求)。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 在 `http://127.0.0.1:5173/` 启动 Vite；包含关卡保存 API。 |
| `npm run build` | 将启动器、游戏和编辑器构建到已被 gitignore 的 `dist/`。 |
| `npm run preview` | 预览最新构建；不含关卡保存 API。 |
| `npm run typecheck` | 检查 `src/`、`sandbox/` 和 `tools/` 中的 JSDoc，不输出文件。 |
| `npm run docs:check` | 校验文档中的链接、图片和锚点。 |
| `npm run check -- --page=<page.html> --query=<query> --out=<unique-name> --strict` | 运行浏览器检查，并将截图和 JSON 报告保存到 `.check/`。 |
| `npm run level:check -- <name-or-file>` | 校验关卡，不做任何修改。 |
| `npm run level:check -- --campaign=<name>` | 校验战役及其关卡、剧情和链接。 |
| `npm run story:test`、`npm run api:test`、`npm run level:test` | 运行相关的 Node 自测。 |
| `npm run i18n:keys`、`npm run i18n:check -- --strict --complete` | 检查内容键和随附的翻译。 |
| `npm run i18n:test`、`npm run keys:test` | 运行翻译和文本键自测。 |
| `npm run editor:i18n:test` | 检查编辑器语言包：中英文键一一对应、占位符一致、标点、目录条目全部翻译。 |

Vite 不做类型检查，构建成功不能代替 `npm run typecheck`。浏览器检查工具会自动查找 Windows 上标准安装的 Chrome/Edge；如需使用其他可执行文件，请设置 `CHROME_PATH`。它会请求 ANGLE 的 D3D11 后端，因此在其他平台上需确认浏览器/GPU 支持情况，并报告验证受限之处。选项和脚本见[测试与验证](docs/development/TESTING_AND_VERIFICATION.md)。

## 工程保障规则

- 阅读适用的契约文档：[引擎](ARCHITECTURE.md)、[关卡/编辑器](docs/contracts/LEVEL_EDITOR.md)、[战斗](docs/contracts/COMBAT.md)、[像素 UI](docs/specs/PIXEL_UI.md)，或 `docs/specs/` 中的功能规范。契约变更必须是增量式的；同时更新文档和 JSDoc 或 `types.d.ts` 副本。如果文档与实现不一致，以代码为准并修正文档，不要依赖过时的描述。
- 除非任务明确要求，否则不要添加向后兼容、迁移、别名或旧格式读取器。格式变更时同步更新随附数据，并报告哪些现有用户数据将无法再加载。当前格式 ID 使用 `luminati-*`；存储键使用 `luminati.*`。
- 使用 `src/engine/utils/math.js` 中的 `RNG`、`hash2` 和 `fbm2`，保持程序化世界生成的确定性。不要随意重命名已发布的关卡：关卡名称是地形噪声的种子。生成的内容要在其生成器中修改，然后重新生成并校验。
- 保持关卡序列化的字节稳定。新的规范化默认值可能会改写所有关卡；优先采用缺省的可选字段，或者有意识地重新生成/重新保存受影响的随附文件。
- 将关卡数据视为不可信数据。查表时使用 `src/engine/utils/own.js` 中的 `isOwnKey` / `ownValue`；拒绝 `constructor`、`__proto__` 等继承键。
- 保持坐标和像素约定：Y 轴向上；图块 `(i, j)` 在 X 方向覆盖 `[i, i+1]`，在 Z 方向覆盖 `[j, j+1]`；行号朝 +Z 方向递增；高度层级使用 `LEVEL_HEIGHT`（0.5 个世界单位）；`PPU` 为 16。像素纹理使用最近邻放大。色调映射只在 PostFX 中进行一次。
- 预热完成后保持点光源数量固定，最多 12 个；通过渐变强度来控制，不要添加、移除或隐藏光源。通过光照设置切换阴影。针对 `postfx.sceneTarget` 预热着色器，并在预热结束前预先准备好游玩中可能首次出现的材质/特效。
- 共享的逐帧着色器状态使用 `GlobalUniforms`。实时天气会覆盖外观设置；应调整受支持的天气/配置路径，而不是调整天气每帧都会改写的值。
- 将每个关卡的状态放在关卡生命周期中，并在战役切换关卡时释放/重新指向这些状态。保留房间的分离/附加缓存、编辑器事务与撤销，以及按需加载功能的生命周期。和平关卡不得创建任何战斗状态；没有剧情或队伍的关卡不得产生相应的运行时开销。
- 新增目录条目需要构建器、JSDoc 类型、编辑器支持和生成器覆盖。星落谷（Starfall）覆盖和平功能，烬望隘口（Cinderwatch）覆盖战斗，摆渡人的提灯（Ferryman）战役覆盖关卡切换/剧情，室内战役覆盖家具。请遵循对应的任务手册并执行其检查。
- 资源/API 的 URL 应基于 `import.meta.env.BASE_URL` 或相对于页面/模块的 URL 构建。`/levels/` 这类根路径会导致子路径部署失效；请用 `--base=project` 和构建后的页面进行验证。
- 使用像素 UI 组件库、完整的美术像素、调色板以及字体/布局辅助函数。UI 文本使用 `t()`，并提供英文、日文和简体中文字符串。内容文本使用 `loc(key, english)`；名称使用 `term(name)`。数据中保留英文标识，仅在显示时翻译。编辑器界面文本使用 `tr()`（`src/editor/strings/`，英文条目必须与原英文逐字一致），目录标签走 `src/editor/strings/catalog.js`；逻辑不得依赖翻译后的文字（[I18N.md §6](docs/specs/I18N.md#6-the-level-editor)）。
- 编辑时保留文本键。编辑器、生成器和 `i18n:keys` 会生成 GUID 和 `#line:` 标签；不要手工编辑或复制它们。新的可翻译字段需要提取器/键支持。使用工作清单工具更新内容表；测量文本前先加载 CJK 字形。
- 为公共 API 添加 JSDoc。从根源上修复类型错误；只在类型检查器无法理解合法代码时才使用类型断言，并对任何 `@ts-expect-error` 加以说明。按需加载的字段要在所在文件夹的 `types.d.ts` 中声明，绝不要使用会遮蔽 JavaScript 文件的同名声明文件。被生成器导入的模块必须能在 Node 中安全运行。

## 内容与验证

六个关卡/战役生成器分别是 `tools/make-starfall-vale.mjs`、`make-sample-hamlet.mjs`、`make-cinderwatch-pass.mjs`、`make-gildhaven.mjs`、`make-ferrymans-lantern.mjs` 和 `make-emberfall-interiors.mjs`。使用 `--check` 验证已提交的输出，或使用 `--out=<scratch-path>` 查看变更。室内战役生成器会读取烬落村（Emberfall），因此修改烬落村后可能也需要重新生成该战役。绝不要手工编辑生成的输出。

完成代码变更前，运行 `npm run typecheck`、相关的 Node/浏览器检查和 `npm run build`；更新因此变更而失效的文档，并运行 `npm run docs:check`。仅修改文档时，运行文档检查即可。要阅读浏览器报告并查看截图：退出码正常并不能证明渲染正确。当页面应当没有任何控制台错误、警告、失败请求或抛出异常的动作脚本步骤时，使用 `--strict`。

渲染或关卡构建的变更需要前后指纹对比和关卡往返测试（[手册 16](docs/ai/TASK_PLAYBOOKS.md#16-regression-check-before-you-finish)）。UI 变更需要在 1280 × 720、1920 × 1080 和 1024 × 768 下检查相关页面，包括日文和中文。文本/显示变更需要进行键/翻译检查以及两个内容巡检。GPU 计时和帧间隔检查要在没有其他 GPU 负载的情况下运行；记录测量时的硬件和浏览器。

## 工作区与本地文件

编辑前检查工作区，保留任务范围之外的改动。未跟踪的关卡和战役可能是贡献者自己的内容；未经授权不要编辑、重新生成、删除或提交它们。脚本化的编辑器保存会通过开发 API 写入真实文件：使用唯一的临时名称，只清理你自己创建的文件，绝不要把测试保存为 `Untitled`。

不要假定特定的分支、远程仓库、操作系统、shell 或贡献者身份。提交和发布须遵循任务的授权；编码代理不得自动提交或发布。默认不要跳过 hook、改写他人的历史或添加 AI 作者署名尾注。在要求或必要时使用准确的署名。

按照 `.gitattributes` 的规定使用 LF 换行符。不要将 `node_modules/`、`dist/`、`.check/`、日志、临时测试关卡、凭据和个人机器配置提交到仓库。`.check/` 是可随时丢弃的本地证据：使用唯一的输出名称，已发布的文档中绝不要依赖其内容。报告已运行的检查以及因环境限制而无法运行的检查。
