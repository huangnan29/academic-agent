# 学术 Agent 开发日志

## 2026-08-23：章节重新生成策略面板

- 已生成章节点击“重新生成”后直接打开配置面板，不再弹额外确认框；未生成章节继续保持一键生成。
- 面板通过新增 `section:preview-generation` IPC 读取主进程的同一份确定性计划，展示当前模型、字数、已纳入文献数、已生成主稿数和真实数据边界；前端不复制章节分类算法。
- 支持“基于当前稿优化（revise）/ 从头重写（rewrite）”、自动识别或手动指定 7 类章节职责、最多两种优化策略、后端允许的表格/图示/公式/代码形态，以及 2000 字以内的本次补充要求。
- “论证深化 + 精炼表达”冲突在前端与主进程双重拒绝；切换章节职责会重新取得该职责的默认策略和内容形态，不沿用上一个职责组合。
- 提交后所有 options 进入正式单次流式生成，当前章节与历史版本保存 mode/profile/strategies/contentForms/customInstructions；旧版本不会被预先清空。
- 面板采用现有 Codex 式中性视觉，没有高饱和强调和嵌套卡片堆叠；支持预览加载/错误重试、Esc、焦点陷阱、焦点返回、ARIA 和窄窗口单列布局。
- 原生 Electron + 本地 Mock 验收完成：默认显示 revise + 绪论 + 证据优先/自然学术；手动切到 rewrite + 综述后默认策略更新，冲突提示生效，选择表格并提交唯一补充要求；生成后当前稿与历史版本均保存 literature-review/rewrite/argument-deepening+natural-academic/table/自定义要求，运行时错误为 0。证据：`output/native-section-generation-panel-final/`。
- 同一打包应用完成 21 项全界面交互和 4 项退出重启恢复，均为 0 失败、0 运行时错误。
- 最终 `/Applications/学术 Agent.app` 已启动新进程；安装副本与打包产物 `app.asar` SHA-256 均为 `099e7acf17416e492c1963e42f836503d8bfa185c078f44627795062b0ef8882`。旧版备份为 `app-backups/学术 Agent-before-strategy-panel-20260823.app`。
- 未验证边界：本轮仍是单次模型调用，没有加入计划—草稿—二次修订；没有调用真实 DeepSeek/Anthropic，也没有生成新 DMG。

## 2026-08-22：章节感知的单次优化生成

- 章节生成从单一通用提示升级为“识别章节职责 → 选择默认策略 → 注入差异化论证动作/证据槽位/禁止项 → 单次流式生成 → 引用与风格复核”。本轮仍只调用一次模型，不增加二次修订成本。
- 首批支持摘要、绪论/问题提出、综述/理论、方法/设计、结果/实现、讨论/结论和通用分析 7 类章节；识别同时读取论文类型、学科、当前/父子节点标题、节点 role、证据需求、内容形态和真实数据条件。
- 内置“证据优先、论证深化、自然学术、精炼表达”4 种策略；首次生成由章节类型自动选择 1–2 种。已为后续策略面板预留窄化 options，但当前 UI 不允许用户手工组合。
- 没有真实数据时，结果/实现章节会明确禁止生成样本、实验数值、性能达标、教学成效或统计显著性；表图仅能表达结构/方案，不能填造数据。
- 章节当前稿与历史版本保存生成模式、章节职责、实际策略、内容形态和用户补充要求；旧 workspace 缺少字段时保持兼容，切换历史版本会恢复对应元数据。
- 文稿顶部与版本列表以低强调文字显示章节职责和策略；过程步骤记录实际识别结果。重新生成现有正文时默认采用 revise，旧版本仍由既有版本链保护。
- 新增套话密度、重复段落开头、句长过度统一、跨章节重复、章节职责覆盖和主张—证据覆盖检查。全部为可解释 warning，不影响 `passed`，不扣减传统质量分，也不冒充 AIGC 检测。
- 验证：7 类规则 smoke、章节感知提示与元数据持久化、风格质量、章节同步/版本/项目上下文、TypeScript 类型检查和生产构建通过；真实工作区只读质量检查从错误的 92 项/0 分收口为 2 项、传统分 75，空章节不再产生职责告警。
- 原生 Electron 使用本地 OpenAI-compatible Mock 验证正文与 Thinking 流式增长；真实识别为“绪论 / 问题提出”，采用“证据优先 + 自然学术”，章节与版本元数据一致，文稿页发送后仍切回章节上下文聊天。全界面 21 项交互与 4 项重启恢复均为 0 失败、0 运行时错误；证据在 `output/native-section-aware-generation-final/`。
- 最终 `/Applications/学术 Agent.app` 已用新进程重新启动；安装副本与打包产物 `app.asar` SHA-256 均为 `f69c217d64db1e273fc30cf45129ca26ad9a4d74c1b8a4772e3e60c85f9a33d4`。旧安装版保存在应用数据目录的 `app-backups/学术 Agent-before-section-aware-20260822.app`。
- 未验证边界：本轮没有消耗真实 DeepSeek/Anthropic 额度，没有用真实模型对同题旧版/新版进行盲评；策略配置面板、二次修订、图表数据生成、个人文风和自动连续全文仍属于后续阶段。

## 2026-08-22：前端控制器与论文上下文继续拆分

- 本轮继续遵守“只拆结构、不改行为”：`App.tsx` 从 1186 行降至 558 行，项目/对话、权限、外观、文献、聊天与稿件操作拆入 `src/hooks/`，顶层组件只保留跨域编排和布局。
- `Sidebar.tsx` 从 821 行降至 215 行；项目树、项目/对话行、整理菜单、上下文菜单、重命名、排序派生数据和调宽交互拆入 `components/sidebar/`，原 DOM class、ARIA、菜单文案与拖拽/键盘行为保持不变。
- `Composer.tsx` 从 657 行降至 325 行；Slash 菜单、能力引用标签、语音输入、附件/目标/计划菜单和目标对话框拆入 `components/composer/`，发送/停止、Enter/Shift+Enter、模型与权限行为保持不变。
- 论文上下文入口从 624 行降至 400 行；Skills 注入与 MCP 不可信数据边界/敏感信息清洗分别迁入 `context-skills.ts`、`context-mcp.ts`，原公开导出和提示词内容保持不变。
- 验证：TypeScript 类型检查、生产构建、项目生命周期、文献归属、父子稿同步、章节版本和项目上下文冒烟全部通过。
- 原生 Electron 隔离工作区回归再次通过：阶段一 21 项交互、阶段二 4 项重启恢复均为 0 失败、0 运行时错误；证据保存于 `output/native-frontend-refactor-final/`。
- 未验证边界：本轮没有调用真实模型、没有重新运行远程 MCP、没有生成新 DMG；这些能力的业务实现未改变。

## 2026-08-21：后端与浏览器后备层结构收口

- 本轮只做模块拆分，不改变公开 API、IPC 通道、工作区 JSON、错误文案或用户可见行为。
- `WorkspaceRepository` 从 1800 行降至 457 行；新增 `workspace-state.ts`、`workspace-projects.ts`、`workspace-literature.ts`、`workspace-manuscript.ts`，分别承接迁移/规范化、项目会话、文献归属和稿件版本状态操作，原子写入仍由仓储入口统一负责。
- `ipcHandlers.ts` 从 1059 行降至 33 行；新增 `electron/main/ipc/` 领域注册模块，保持 53 个 IPC 通道、可信发送者校验与 `registerIpcHandlers` 公开入口不变。
- MCP 入口从 1179 行降至 532 行；配置校验、敏感字段脱敏、有界 JSON、传输创建、能力发现与错误类型拆为独立模块，`McpManager` 及其公开方法保持不变。
- 浏览器演示后备层从约 1930 行单文件改为 39 行组合入口；演示数据、localStorage 迁移、项目/对话/文献/稿件/聊天/MCP/语音/外观等 API 按域拆分，不读取或影响正式安装版工作区。
- 验证：TypeScript 类型检查与生产构建通过；项目生命周期、文献项目归属与永久删除、父子稿同步、章节版本、项目上下文、真实 arXiv MCP 冒烟全部通过，arXiv MCP 发现 14 个工具并完成两组真实检索。
- 原生 Electron 隔离工作区回归：阶段一 21 项交互通过，阶段二 4 项退出重启恢复通过，两个阶段运行时错误均为 0。证据保存于 `output/native-structure-refactor-final/`。
- 未验证边界：本轮没有消耗真实 DeepSeek/Anthropic 模型额度，没有重新执行远程 Streamable HTTP MCP，也没有生成新的 DMG；这些能力的实现未在本轮改变。

## 2026-08-16：结构整顿（App.tsx / styles.css 拆分与 qa 目录重组）

- 纯结构重构，零业务逻辑与用户可见行为变更：`desktop/src/App.tsx` 从 6157 行拆为 1186 行主文件 + `lib/`（8 个工具模块）+ `components/`（13 个新组件文件）+ `pages/`（5 个新页面文件）；既有独立组件（OutlineTree、OutlineArchitectureSummary、MessageLiteratureActions、AppearanceSettingsPage）随目录约定迁移。
- `desktop/src/styles.css` 从 5266 行拆为 9 个按原顺序导入的分片（`desktop/src/styles/`），原文件改为 `@import` 聚合入口；构建产物经逐字节比对确认与拆分前语义一致（仅注释与空行差异）。
- `desktop/qa/` 40 余个脚本按类型归入 `native/`（CDP 原生冒烟）、`smoke/`（单元冒烟）、`prepare/`（工作区准备）、`mocks/`（桩服务）、`acceptance/`（大纲验收）五个子目录，同步修正相对导入与用法提示。
- 未完成状态收口：`outline:save` 与 `app:info` 两个预留 IPC 接口以中文注释标注“主进程链路完整、等待渲染层接入”，未删除。
- 验证：`npm run typecheck` 与 `npm run build` 通过；打包 arm64 `.app` 后在隔离 `user-data-dir` 上完成原生 Electron 交互回归——阶段 1 共 21 步（启动三栏渲染、样式变量与级联、对话/文稿切换、Composer 加号菜单/AccessPicker/ModelPicker/slash 菜单、权限中心对话框、右侧三 Tab 与大纲树/结构摘要、新建与删除研究对话框、设置四组导航与全部分区、配置三 Tab、外观切深色、文献库与 Skills 路由、侧栏键盘调宽）全部通过；阶段 2 重启恢复（深色主题、侧栏宽度 292px、活动项目与章节数据）4 步全部通过；`qa/native/cdp-sidebar-smoke.mjs` 侧栏专项冒烟 `ok: true`。两阶段原生运行时错误均为 0。
- 证据：`output/native-refactor-regression/report-phase-1.json`、`report-phase-2.json` 与 01–19 号截图；`output/native-refactor-regression/sidebar/` 侧栏冒烟截图。
- 未验证边界：本轮未调用真实模型 API 与真实 MCP 工具（回归聚焦 UI 组件树渲染与交互，业务逻辑代码未改动）；未生成 DMG，未同步 `/Applications/学术 Agent.app`（用户未授权发布流程）；侧栏手动拖拽“项目重排”因隔离工作区仅 1 个项目而跳过（对话重排已验证）。

## 2026-08-14：补齐文献永久删除

- 修正把用户要求的“删除文献”误实现为“移出项目”的产品偏差；文献卡片现在同时提供“移出项目”和“删除”，两种行为不再混淆。
- “移出项目”只解除项目归属并保留在“全部文献”；“删除”会显示不可撤销确认，确认后从本机文献库永久移除记录。
- 演示测试文献也允许用户删除；演示状态只限制正式纳入和引用，不再限制清理测试数据。
- 主进程按文献 ID 与当前项目归属再次校验删除请求；已经被引用证据、提纲或正文使用的文献会被阻止删除，避免破坏论文证据链。
- 已通过类型检查、文献仓储冒烟、原生 Electron 确认框与演示文献删除验收；永久删除后记录从“全部文献”消失，原生运行时错误为 0。
- 证据：`output/native-literature-delete-final/literature-delete-confirm.png`、`output/native-literature-delete-final/literature-demo-deleted.png`。
- 最终应用已同步到 `/Applications/学术 Agent.app` 并重新启动；安装副本与构建产物 `app.asar` SHA-256 均为 `ec5ffa992bc1e80352ca45029c67da73f81f432f75e0611be616c319269d4d19`。

## 2026-08-14：文献按项目归类、纳入与可用性边界

- 文献库新增“全部文献”和每个研究项目的分类入口；项目在创建后即出现在分类栏，消息内添加、检索得到的文献按所属项目归档，全部视图保留全局总览。
- 修复文献卡片错误沿用当前激活项目的问题：纳入、取消纳入和移出项目均使用文献真实归属，右侧研究工作台只显示当前项目文献，不再跨项目误判或报“文献记录不存在”。
- 已纳入文献提供“取消纳入”；项目内文献提供独立“移出项目”，移出只解除项目归属并保留在“全部文献”的未分类区域，不删除原始记录。
- 对已有真实模型回复或真实 MCP 文献活动的旧演示项目执行安全升级，保留对话、稿件和真实文献；演示文献仍保持演示标记且禁止冒充可引用记录。
- 跨项目文献使用独立 ID；同项目重复结果按 DOI 或规范化标题合并。低可信结果只能补齐缺失字段，不再覆盖已记录的高可信元数据。
- 纳入状态和项目归属变更会检查引用证据、提纲引用与正文引用标记；已经进入论文证据链的文献不能被静默移出。
- “可用性检查”改为真实、可解释的边界展示：分别检查来源元数据、摘要、原始来源链接和正文引用映射；未取得可核对全文时明确说明不能自动判断其是否支持正文主张。
- 已通过类型检查、文献项目仓储冒烟、消息文献与项目上下文回归、生产打包和原生 Electron 全链路验收。原生界面完成“纳入项目 → 取消纳入 → 移出项目 → 全部文献未分类”并记录 0 个运行时错误。
- 证据：`output/native-literature-project-final/literature-current-project.png`、`output/native-literature-project-final/literature-unclassified-detail.png`、`output/native-literature-project-final/reference-vs-final.png`。
- 最终应用已同步到 `/Applications/学术 Agent.app` 并重新启动；安装副本与构建产物 `app.asar` SHA-256 均为 `494b84b20b6639901e3488ff17a255c4f44f95eb99dfe5f409f70d888a1b092f`，Renderer 继续以沙箱模式运行。

## 2026-08-14：从对话结果添加文献到右侧文献栏

- 真实 MCP 检索完成后，助手消息保存结构化文献候选；候选只来自工具的 JSON/structuredContent，不从模型正文猜测标题、DOI 或作者。
- 回复下方新增克制的文字操作区：单篇“添加到文献栏”、批量“全部添加”、添加中、失败重试和“已添加”；没有胶囊、卡片背景或按钮圆角。
- 点击后主进程按助手消息、当前项目和候选 ID 再次校验，渲染层不能提交任意文献元数据；同项目内按 DOI 或规范化标题去重。
- 添加成功后当前消息立即变为“已添加”，自动打开右侧文献标签并显示新增记录；其他项目的同题文献不会污染当前项目状态。
- 已通过消息文献仓储冒烟：重复添加不复制、伪造候选 ID 被拒绝、批量添加与重启持久化通过。
- 已在最终打包 Electron 中用真实 arXiv MCP 与 DeepSeek 验证：本轮返回 2 篇候选，点击第一篇后右侧文献数从 2 增至 3并显示真实标题，原生运行时错误为 0；证据为 `output/native-message-literature-add-final/message-literature-actions-final.png`。
- 最终应用已同步到 `/Applications/学术 Agent.app` 并以新进程重新启动；安装副本与构建产物 `app.asar` SHA-256 均为 `54d0e485738bfb20f124a657173702b0a915fd33497319c760b1f3e9681e4b64`。旧版本备份在 `~/Library/Application Support/aiwritepaper-agent/app-backups/学术 Agent-20260814-004233.app`。

## 2026-08-13：arXiv 中文检索意图规划与自动放宽

- 修复 `/search_papers` 将整句中文自然语言原样提交给 arXiv、导致工具成功但返回 0 条的问题。
- 用户明确选择 arXiv 工具后，应用会结合当前研究标题、研究要求和本次消息，使用当前模型生成有界英文 arXiv 检索式；普通聊天仍不会偷偷调用 MCP。
- 英文布尔式与 `ti:` 等高级检索式保持原样；中文请求会生成最多 3 条由精确到宽泛的候选，只有工具明确返回 0 条时才自动重试。
- 支持 `/paper_search` 作为内置 `/search_papers` 的兼容别名；JSON 高级参数增加字段、日期、分类、排序和 1–50 条数量校验。
- 本机回退词表覆盖生成式人工智能、LLM、ChatGPT、教育、高等教育、教学反馈等常见研究概念；模型规划失败且无法构造英文查询时不会继续发起无效 MCP 调用。
- 原生 Electron 隔离验收使用中文请求“帮我搜索5篇与此标题强相关的内容”，实际执行英文查询 `("generative AI" OR "generative artificial intelligence") AND "higher education" AND "mechanism" AND "teaching"`，arXiv 返回 3 篇真实论文；DeepSeek 明确识别为本轮工具结果并逐篇引用，没有再误报“未收到真实返回”。
- 工具返回现在以独立的本轮 `tool` 消息放在当前用户请求之前；当前消息从历史中排除，避免同一 Slash 命令重复进入上下文或被模型误判为旧结果。
- 已通过类型检查、查询规划冒烟、项目上下文回归、真实 arXiv MCP、DeepSeek 原生对话链与运行时错误检查；验收截图为 `output/native-arxiv-chinese-query-final/arxiv-chinese-query-completed.png`。
- 最终应用已同步到 `/Applications/学术 Agent.app` 并重新启动；安装副本与构建产物 `app.asar` SHA-256 均为 `f59e66132dd8c50e1f6a312c0b867bbbad3f465e7aa2ff40c728291c6e716ffb`。旧版本备份在 `~/Library/Application Support/aiwritepaper-agent/app-backups/学术 Agent-20260813-235552.app`。

## 2026-08-13：章节重新生成与历史版本

- 已生成章节新增“历史版本 + 重新生成”组合控件；重新生成直接开始，不再要求二次确认。
- 每个章节保存独立、不可变的正文快照，版本列表显示连续编号和生成/保存时间；未完整生成的版本会明确标记。
- 旧工作区首次打开时，将现有非空章节迁移为第一个历史版本，不伪造此前不存在的版本。
- 重新生成开始前保留当前稿；成功后追加新版本，失败时保留已收到片段且旧稿仍可切回。
- 版本切换由主进程校验章节归属并真实更新当前正文，后续项目上下文和导出读取用户选中的版本。
- 增加同章节并发生成、生成期间手工保存、异常退出残留状态和项目删除级联保护。
- 已通过仓储版本冒烟、章节同步与项目上下文回归、类型检查、生产构建、未签名 `.app` 打包和原生版本菜单/正文切换验收；本轮没有调用真实模型。
- 已将最终打包副本同步安装到 `/Applications/学术 Agent.app` 并重新启动；安装副本与构建产物 `app.asar` 的 SHA-256 均为 `a2ab34c7776bc7ce0f8279e3db4bcd081967a0bf708425e78fe64a30679a2d91`。旧应用已备份到本机应用数据目录。
- 后续每次应用更新完成最终构建与验收后，必须同步更新 `/Applications/学术 Agent.app`，确保 Dock 打开的不是旧构建；构建或哈希校验失败时保留当前可用版本。

## 2026-08-13：修复内置 arXiv MCP 连接测试

- 修复“测试连接”会先保存内置 MCP、但保存校验只接受 UUID，导致界面提示 `Invalid uuid` 的问题。
- MCP 保存入口现在只额外允许应用固定维护的 `builtin-arxiv-mcp` ID，用户新增服务仍必须使用 UUID，不扩大任意 ID 输入范围。
- 增加原生 Electron 桥接冒烟脚本，覆盖“保存内置配置 → 测试连接 → 发现工具”的真实按钮调用链。

本文档记录“学术 Agent”从需求确认到当前版本的持续开发状态。每次准备提交 GitHub 时，都必须先更新本文档中的“最近更新”“验证记录”和“已知边界”，避免仓库说明与真实实现脱节。

## 当前状态

- 产品名称：学术 Agent
- 当前版本：0.2.0
- 技术形态：Electron 主进程 + 沙箱 preload + React/Vite 本地渲染界面
- 支持平台：macOS 12+、Apple Silicon
- 数据策略：研究项目、对话、文稿、文献与配置默认保存在本机
- 发布状态：本机未签名版本可构建和安装；公开分发仍缺少 Developer ID 签名与 Apple 公证
- 仓库：[huangnan29/academic-agent](https://github.com/huangnan29/academic-agent)

## 产品目标与边界

项目目标是提供一个参考 Codex 桌面交互的本机论文研究 Agent，贯通研究项目、文献检索、三级大纲、章节写作、上下文对话、模型切换、MCP 与文稿导出。

长期不变的边界：

- 不读取系统或 Codex 的 Skills/MCP 配置；应用只维护自己的配置。
- 不把 API Key、Token、工作区数据、签名证书或构建产物提交到 Git。
- 不伪造 DOI、论文、实验数据、引用页码或 Thinking 内容。
- 不绕过付费墙、登录、验证码、反爬或站点访问控制。
- 对 aiwritepaper.com 只做公开页面质量特征分析，不复制第三方范文。

## 开发过程

### 2026-08-12：首个可安装版本

- 初始化 `AGENTS.md`、实施计划、任务清单、产品说明与质量基线。
- 选用 Electron、React、TypeScript、electron-vite 与 electron-builder，完成 Apple Silicon `.app` 和 DMG 构建链路。
- 建立本机工作区仓库、Electron `safeStorage` 凭证存储、受限 IPC 与沙箱 preload。
- 接入 OpenAI-compatible 与 Anthropic 提供商框架，支持模型健康检查、流式对话与输入框模型选择。
- 接入 OpenAlex、Crossref 文献检索以及可配置的 stdio/Streamable HTTP MCP。
- 完成三级大纲、单章节生成、引用标记、质量检查、Markdown/DOCX 导出。
- 完成三栏工作台、文献/稿件/过程面板、响应式窗口与首轮视觉验收。
- 生成并验证 0.2.0 本机安装包；保留未签名、未公证边界。

### 2026-08-12：Codex 式研究导航

- 产品显示名称由 AIWritePaper Agent 更新为“学术 Agent”，同时保留内部应用名、appId 和数据目录，避免旧 Keychain 凭证失效。
- 左侧栏改为可展开研究项目与项目内对话，支持新建对话、切换、重命名、置顶、归档、移动、删除、手动排序与 Finder 定位。
- 左右侧栏均可拖动调整宽度并持久化。
- 右侧论文大纲改为可折叠三级树，显示 `1 / 1.1 / 1.1.1` 章节编号。
- 修复父章节正文包含子标题时，子章节显示“尚未生成”的数据语义冲突；子章节改为与父稿对应区段同步的视图。
- 增加应用内 Skills CRUD，并将启用的 Skills 注入提纲、章节和对话提示；不扫描系统 Skill。

### 2026-08-13：输入框、权限与设置工作区

- 输入框重构为 Codex 式布局：附件、目标、计划模式、模型选择、上下文范围与发送/停止控制。
- 附件只在用户选择后读取，支持文件/文件夹，限制数量、大小和文本提取范围。
- 增加“需要询问/完全访问”权限模型；完全访问以 macOS 辅助功能、完全磁盘访问等真实系统状态为准，不再只是界面开关。
- 对话上下文改为实时读取当前项目、完整已生成文稿、当前章节、已纳入文献和启用 Skills，解决生成后对话不知道文稿内容的问题。
- 对话与章节分别展示提供商明确返回的 Thinking；不模拟或补写推理过程。
- 设置页改为覆盖左侧 Dock 的 Codex 式工作区，包含个人、集成、编码与已归档分组；未完成能力明确标记为计划中。

### 2026-08-13：章节流式生成

- 章节生成从“完成后一次刷新”改为正文增量持续写入，提供流式状态和动态光标。
- Thinking 与正文分流显示，保存实际提供商、模型和 Thinking 请求状态。
- 官方 DeepSeek V4/Reasoner 请求显式开启 Thinking 与 high 推理强度；通用 OpenAI-compatible 网关不注入厂商专用参数。
- 网络中断时保留已收到的正文与 Thinking，并允许重新生成或手工编辑。
- 从文稿页发送消息后自动切换到对话页，同时保持当前章节上下文。

### 2026-08-13：默认 arXiv MCP 与文稿视觉收口

- 已生成完成的章节编号使用浅绿色状态方框，待生成、生成中和错误状态仍保持原有语义颜色。
- 文稿滚动到底部时，文稿背景与输入框托底区域使用相同底色，消除明显色差断层。
- 应用新增自维护的内置 arXiv MCP，稳定 ID 为 `builtin-arxiv-mcp`，启动命令遵循上游官方配置：`uvx arxiv-mcp-server`。
- 文献库默认选择 `arXiv MCP（默认）/ search_papers`，并使用真实参数 `query` 与 `max_results`；OpenAlex + Crossref 继续作为可手动选择的公共来源。
- 内置配置不读取 Codex 或系统 MCP；旧工作区升级后会自动补入，但保留用户对其启用状态和命令的修改。
- 为 Finder 启动的桌面应用补入 Homebrew、`~/.local/bin` 与 `/usr/local/bin` 等常见可执行路径。
- 上游项目采用 Apache-2.0 许可证，官方仓库为 [blazickjp/arxiv-mcp-server](https://github.com/blazickjp/arxiv-mcp-server)。
- 本轮真实验收运行上游 0.6.2，发现 14 个工具，并通过 `search_papers` 返回 1 条真实 arXiv 结果；该版本号是验收记录，不代表运行配置被永久锁定。
- 当前完整更新已提交到分支 `codex/arxiv-mcp-visual-polish`，并创建 GitHub Draft PR [#1](https://github.com/huangnan29/academic-agent/pull/1)；合并前继续以该 PR 承载复核与修订。

### 2026-08-13：Codex 式外观设置

- 将“外观”从说明页升级为完整设置页，提供系统、浅色、深色三种主题，并在系统模式下跟随 macOS 外观变化。
- 浅色与深色分别保存强调色、背景色和前景色；颜色、字体、侧栏半透明和对比度均会实时作用于整个应用。
- 增加三套应用内主题预设、严格 JSON 主题导入和系统剪贴板复制；主题文件只包含可移植主题字段，不覆盖 Dock 图标、动态效果、字号等个人偏好。
- 增加指针光标、两种原创 Dock 图标、减少动态效果、全局 UI 字号、差异标记和字体平滑设置，并持久化到本机工作区。
- 差异标记已接入真实章节编辑：修改尚未保存时可折叠查看新增/删除行，支持颜色与 `+/-` 两种展示方式。
- 原生窗口背景、侧栏材质和 Dock 图标由 Electron 主进程同步；导入文件由主进程弹出原生选择框，渲染层不能传入任意文件路径。
- 完成类型检查、生产构建、未签名 `.app` 打包、原生 Electron 主题切换、重启恢复、文稿差异与主题 JSON 边界验证；本轮未生成新 DMG。

### 2026-08-13：输入框“/”能力选择器

- 在输入框行首或空白后输入 `/`，会弹出本应用工作区内已启用的 Skills 与 MCP 服务；继续输入名称、说明或工具名可实时过滤。
- 菜单支持方向键选择、Enter/Tab 添加、Esc 关闭和鼠标操作；已选能力以一次性标签显示，可移除、去重且单次最多 12 项。
- Skill 引用由主进程根据稳定 ID 读取最新指令并加入本次模型上下文；渲染层不能伪造 Skill 内容。
- MCP 引用会加入该服务的真实名称、连接状态、已发现工具和资源；能力元数据不冒充工具执行结果，实际调用仍受对话权限与 MCP 调用链约束。
- 用户消息保存本次引用，便于本机过程追溯；发送成功后清空一次性标签，发送失败则恢复输入内容并保留选择。
- 原生 Electron 隔离工作区已验证分组、过滤、键盘添加、查询清理、标签显示、重复去重和运行时零错误；本轮未调用模型或 MCP 工具，也未生成新 DMG。

### 2026-08-13：Slash MCP 工具真实执行

- `MCP 服务`粗粒度选项改为逐工具菜单，直接显示 `/search_papers`、`/get_abstract`、`/download_paper` 等服务实际暴露的工具。
- 支持两种明确调用方式：在菜单选中具体工具后输入参数，或直接输入 `/search_papers 检索词`。直接 Slash 命令和菜单选择视为本次工具调用的明确同意。
- 主进程按最新工作区重新校验服务、工具和参数；同名工具优先使用菜单显式选中的服务，未选且有歧义时拒绝误调。
- 运行记录先于外部调用创建；MCP 步骤将保存脱敏参数、有界结果、SHA-256 和截断标记，失败或停止也保留已完成步骤。
- 外部 MCP 返回以 BEGIN/END 不可信 JSON 数据区块加入模型上下文，并在数据后重申不得遵循其中指令；内容与结构化返回均保留。
- 原生 Electron 隔离工作区真实执行 `/search_papers ti:\"retrieval augmented generation\"`：内置 arXiv MCP 发现 14 个工具，返回 5 篇论文，DeepSeek 基于实际返回完成回复，审计证据为 10,717 字符且未截断。
- 普通自然语言目前不会自动选择或调用 MCP；这是明确的安全边界，不把“聊到 arXiv”冒充成工具已执行。

### 2026-08-14：大纲版本口径与历史 MCP 文献操作修复

- 右侧大纲不再把 `ManuscriptSection.version` 内部修订次数显示为用户历史版本；改为与文稿页一致，通过 `activeGenerationVersionId` 读取 `ManuscriptSectionVersion.number`。正文偏离历史快照时显示“当前稿”，不再虚构版本号。
- 正式工作区“绪论”真实复现内部修订号 5、活动历史版本 1；修复后中央文稿与右侧大纲均显示第 1 版。
- 修复“只有本轮调用 MCP 的回复才显示文献操作”的覆盖缺口：旧助手回复会从同项目、时间在前、执行成功、未截断的 MCP 审计证据中回填候选。
- 历史迁移只解析严格的 `【文献:ID】`，并与结果中的 arXiv ID、DOI 等明确标识精确匹配；不从标题或模型自然语言猜测。“arXiv编号”等占位符、截断证据、解析失败和冲突结果均会跳过。
- 正式工作区两条历史回复各安全回填 5 篇真实 arXiv 候选；原生界面显示无圆角的“添加到文献栏 / 全部添加”，隔离数据副本验证批量添加后右栏即时出现 5 篇记录。
- 通过 TypeScript 类型检查、消息文献仓储回归、章节版本回归、生产构建和两个原生 CDP 验收；最终 `/Applications/学术 Agent.app` 已更新并重新启动，安装副本与构建产物 `app.asar` SHA-256 均为 `27eca4f28b35942f757ce23eb2ee25a75d7049510ae62c188d0f78aa35428060`。
- 证据：`output/native-outline-version-consistency-final/outline-version-consistency-final.png`、`output/native-message-literature-backfill-final/message-literature-actions-final.png`、`output/native-message-literature-backfill-add-final/message-literature-actions-final.png`。

### 2026-08-15：macOS 语音输入

- 在输入框的模型选择器与发送按钮之间增加麦克风入口；识别中的文字会实时插入启动时的光标位置，保留原有输入且不会自动发送。
- 主进程接入真实 macOS 麦克风状态读取与系统授权请求；权限未询问时由系统弹窗决定，拒绝或受限时跳转到“隐私与安全性 → 麦克风”，渲染层不能冒充授权成功。
- 打包应用补齐麦克风与语音识别用途说明，并把媒体权限限制在可信主窗口的音频请求；摄像头、子框架和非应用页面请求均拒绝。
- 语音设置页现可查看真实麦克风状态、识别能力和 `zh-CN` 默认语言，并提供请求权限、重新检查和打开系统设置。
- 首轮实现使用 Chromium Web Speech，在 Electron 中真实触发 `network` 错误；该方案已判定不可用并被完全移除，不能作为桌面语音能力。
- 修复后随应用编译并打包 macOS Speech + AVFAudio 原生辅助程序，通过主进程窄化 IPC 返回实时中间结果；系统支持时设置 `requiresOnDeviceRecognition`，不再依赖 Chromium 的网页识别服务。
- 设置页读取原生组件的真实可用性、Speech 授权和本机识别能力。本机检查结果为 `zh-CN available=true / onDevice=true / authorization=not-determined`。
- 切换对话、发送消息、开始生成或卸载输入框时会停止当前识别；权限拒绝、无麦克风和识别服务错误均显示中文提示并保留已有文字。
- 类型检查、生产构建、Apple Silicon `.app` 打包、原生辅助程序状态读取与安装资源检查通过；最终 `/Applications/学术 Agent.app` 已更新并重新启动，安装副本与构建产物 `app.asar` SHA-256 均为 `503e9d755ed7af3ed64a60be74e637abbc85559f0f7864af4e53c8f3f7868a3d`。
- 隔离安装版通过真实 preload/IPC 读取原生状态，桥接 `start/stop/onEvent` 完整；证据保存在 `output/native-voice-status-final/`。
- 本机 Speech 授权当前仍为“尚未询问”；首次点击更新后应用的麦克风按钮时，用户仍需在 macOS 系统弹窗中选择允许。真实口述转写留待用户完成系统授权后确认。

### 2026-08-15：专业感知的三级大纲架构

- 大纲生成从单一通用提示升级为“专业类别识别 → 标题语义与研究动作分析 → 六类结构模式选择 → 三级节点生成 → 本机确定性质量检查”。
- 首批覆盖文学/语言、理学、工学、法学、设计/艺术、管理/经济、教育、医学/健康和跨学科；结构模式包含实证研究、系统工程、主题综述、理论/规范分析、案例研究、政策/管理研究。
- 没有真实项目数据时不会选择承诺实证结果的结构；质量检查会拒绝结果章节、越权引用、层级空洞、重复标题和不闭合字数预算。
- 新节点保存研究问题、章节功能、待论证主张、证据需求、内容形态和衔接信息；旧工作区继续读取原节点，不自动改写用户大纲。
- 右侧工作台新增可折叠“结构识别”摘要，显示专业类别、研究方向、结构模式、匹配置信度、全文字数和质量问题。
- 固定验收集覆盖 8 个多学科题目，分类路由无失败项；5 类质量反例全部正确判定不通过。由于未调用真实模型逐题生成，8 份实际目录语义仍标为未验证。
- 类型检查、生产构建、Apple Silicon `.app` 打包与原生 Electron 隔离工作区验收通过。原生项目保存 4 章、8 节、16 目，结构识别为政策/管理研究，质量得分 100，重启后数据和摘要均可读取。
- 最终 `/Applications/学术 Agent.app` 已更新并重新启动，安装副本与打包产物 `app.asar` SHA-256 均为 `0dd9dcdcc06bc6a9c8d44d76f7a56b6e4bd3f0c7dab7b32d6b41d42102bc71e1`。
- 证据：`output/native-outline-architecture-final/outline-architecture-summary.png`、`output/native-outline-architecture-final/outline-architecture-details.png`、`output/native-outline-architecture-final/outline-architecture-summary.json`。

## 当前架构

| 模块 | 主要职责 | 关键位置 |
|---|---|---|
| Renderer | 三栏工作台、设置、输入框、流式界面 | `desktop/src/` |
| Preload | 暴露窄化的本机能力桥接 | `desktop/electron/preload/` |
| Main | 窗口、IPC、权限、附件、协调器 | `desktop/electron/main/` |
| Providers | OpenAI-compatible、Anthropic 与流事件统一 | `desktop/electron/services/providers/` |
| Literature | OpenAlex、Crossref 和 MCP 文献归一化 | `desktop/electron/services/literature/` |
| MCP | stdio/Streamable HTTP 连接、工具与资源调用 | `desktop/electron/services/mcp/` |
| Pipeline | 上下文、提纲、章节提示与质量检查 | `desktop/electron/services/pipeline/` |
| Storage | 工作区原子写入与系统安全凭证存储 | `desktop/electron/services/storage/` |
| Export | Markdown 与 DOCX 文档模型和导出 | `desktop/electron/services/export/` |

## 验证记录

已经形成的验证层级包括：

- TypeScript 类型检查与生产构建。
- 原生 Electron 窗口、preload/IPC、侧栏、设置、对话和章节流式路径。
- 本地 OpenAI-compatible Mock 的文本与 Thinking 流。
- DeepSeek 官方连接、模型发现、真实流式对话与凭证重启恢复；后续测试不得在未授权时继续消耗真实额度。
- stdio MCP 的连接、工具、资源和结构化文献归一化。
- 内置 arXiv MCP 的旧工作区补入、14 项工具发现、真实 `search_papers` 检索与文献库默认来源显示。
- OpenAlex/Crossref 公共检索。
- Markdown/DOCX 正式导出函数与文件回读。
- `.app`/DMG 的本机构建、挂载、复制与启动。
- 外观三模式、双调色板、全局字体/字号、侧栏材质、减少动态、主题复制、文稿差异以及重启恢复。
- 输入框“/”Skill/MCP 菜单、键盘选择、一次性引用标签以及主进程上下文解析。
- Slash MCP 逐工具菜单、真实 `search_papers` 执行、DeepSeek 结果回答与有界审计证据。

每次具体验收结果以 `task.md`、`design-qa.md` 和 `verification-report.md` 为准；本日志只汇总阶段状态，不把未执行的检查写成通过。

## 已知边界与后续工作

- 尚未取得 Apple Developer ID，公开 DMG 缺少签名、公证和 Gatekeeper 下载场景验证。
- Intel Mac 未支持、未验证。
- Anthropic 与其他真实第三方提供商仍需要各自密钥验证。
- Streamable HTTP MCP 仍缺少真实远程服务验证。
- 还未完成全稿/选中文本上下文、聊天改写自动写回和自动连续分章；章节历史版本与恢复已经实现，但逐版本引用证据和导出快照仍待补齐。
- 提纲可视化编辑、提纲/章节取消与完整论文独立盲评仍待实现。
- arXiv MCP 依赖本机安装 `uv`/`uvx`；首次运行可能需要下载并缓存上游 Python 包，失败时应保留 OpenAlex + Crossref 作为可选回退。
- 原生主题导入选择框的取消/选取动作未做桌面自动化；解析、白名单、大小限制和 IPC 路径已验证。

## GitHub 提交维护规则

每次提交产品更新前执行：

1. 在“开发过程”追加日期、需求、实现和真实边界。
2. 更新“当前状态”“验证记录”和“已知边界”。
3. 同步 `README.md`、`implementation_plan.md` 与 `task.md` 中受影响的说明。
4. 运行与改动风险匹配的检查，并明确区分类型检查、构建、原生运行、第三方服务和发布验证。
5. 扫描 API Key、Token、工作区数据、证书与构建产物，确认它们未进入暂存区。
6. 提交信息概括用户可感知结果；通过分支和 PR 合并到主分支。
