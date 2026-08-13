# 学术 Agent 开发日志

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

每次具体验收结果以 `task.md`、`design-qa.md` 和 `verification-report.md` 为准；本日志只汇总阶段状态，不把未执行的检查写成通过。

## 已知边界与后续工作

- 尚未取得 Apple Developer ID，公开 DMG 缺少签名、公证和 Gatekeeper 下载场景验证。
- Intel Mac 未支持、未验证。
- Anthropic 与其他真实第三方提供商仍需要各自密钥验证。
- Streamable HTTP MCP 仍缺少真实远程服务验证。
- 还未完成全稿/选中文本上下文、聊天改写自动写回、可恢复版本历史和自动连续分章。
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
