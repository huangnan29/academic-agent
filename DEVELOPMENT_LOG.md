# 学术 Agent 开发日志

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
- 切换对话、发送消息、开始生成或卸载输入框时会停止当前识别；权限拒绝、无麦克风、无语音、网络或识别服务错误均显示中文提示并保留已有文字。
- 类型检查、生产构建、Apple Silicon `.app` 打包和原生 Electron 视觉/桥接验收通过；最终 `/Applications/学术 Agent.app` 已更新并重新启动，安装副本与构建产物 `app.asar` SHA-256 均为 `6fe0e7ac7c6e5f0e105c26faa4a602926e980d84f4f403f8d2701583f8ae8b5f`。
- 本机当前麦克风状态为“尚未询问”，未代替用户点击系统授权；首次点击输入框麦克风后仍需用户在 macOS 弹窗中选择允许。语音识别由 Electron/Chromium Web Speech Recognition 提供，不承诺离线转写。

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
