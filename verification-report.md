# 学术 Agent 验收报告

> 本报告前半部保留 0.1.0 时期的原始验收证据和旧安装包文件名，以便追溯；0.2.0 更名、项目管理与后续增量验收证据在文末单独记录。

验收日期：2026-08-12

版本：0.1.0

目标平台：Apple Silicon macOS（arm64）

## 交付物

- 安装包：`desktop/release/AIWritePaper-Agent-0.1.0-arm64.dmg`
- 基础机器可读验收摘要：`output/qa/native-final-evidence.json`
- 本轮工具栏与 DeepSeek 机器可读验收摘要：`output/qa/deepseek-toolbar-evidence.json`
- 本轮 macOS 窗口按钮布局验收摘要：`output/qa/traffic-light-evidence.json`
- 文件大小：134,404,534 字节（约 128 MiB）
- SHA-256：`695558c5d85e46bd26afa00d949179dda7f96a0f8fe4e684ec43bb7dc834321c`
- DMG 内应用版本：0.1.0
- 主程序架构：Mach-O 64-bit arm64

## 已通过

### 构建、安装与恢复

- TypeScript 检查通过，Electron 主进程、preload 和 React 渲染层生产构建通过。
- `hdiutil verify` 确认最终 DMG 校验有效。
- 已从本轮最终 DMG 挂载并复制应用；DMG 副本与 release 应用的 `app.asar` SHA-256 均为 `47907f12cf9721829a4af958beb0cb2b452178ea052089142fcb3fee336a186b`，副本以真实 preload/IPC 和沙箱渲染进程启动。
- 最终安装副本退出后重新启动；使用同一测试数据目录恢复 2 个项目、10 条消息、34 条文献、16 个章节、2 个提供商和 1 个 MCP 配置。

### 核心 Agent 路径

- 以本机 OpenAI 兼容协议服务验证了连接检查、模型菜单、流式三级大纲、章节生成和基于文稿的继续对话。
- 使用用户授权的真实 DeepSeek API 凭证验证了官方 OpenAI 兼容接口：连接检查成功发现 `deepseek-v4-flash` 与 `deepseek-v4-pro`，并以 `deepseek-v4-flash` 完成真实流式项目对话；重启后再次回答引用幻觉问题，运行记录、助手消息和模型元数据均标记为完成。
- 退出并重新启动最终构建后，DeepSeek 提供商、默认模型和加密凭证均成功恢复；未重新提交凭证即可再次通过连接检查。
- DeepSeek 配置同时写入应用默认资料目录 `~/Library/Application Support/aiwritepaper-agent`；其中保留可继续使用的“DeepSeek 对话测试”项目。默认资料实例退出并重开后，无需重新输入 Key 即可恢复模型并再次连接成功。
- 模型选择已经收敛为工作区持久状态：切换项目、生成大纲、点击一级/二级/三级章节和重启应用均不会再清空当前模型；最终 DMG 副本实测仍显示 `DeepSeek / deepseek-v4-flash`。
- 创建了真实项目“生成式人工智能写作反馈机制研究”，生成 16 个分级章节，并完成首章正文。
- OpenAlex + Crossref 联网检索返回 30 条去重后的真实书目记录（OpenAlex 19 条、Crossref 11 条）；纳入 2 条记录后，正文引用能映射到项目文献。
- 质量检查结果为 1 条已映射引用、0 条未映射引用；由于仅生成首章，检查按预期给出 `TOO_SHORT` 并判定未通过，没有把不完整文稿标成合格全文。首版仍允许用户带着警告导出草稿。

### MCP、凭证与数据

- 使用官方 SDK 的 stdio MCP 服务验证连接、能力发现、工具调用、资源读取和文献检索。
- MCP 结构化内容与文本内容的重复记录已去重；最终安装版以 `citation` 检索显示“找到 1 条候选文献”。
- 测试 API Key 未以明文出现在应用数据目录；工作区与凭证文件权限均为 `0600`。
- DeepSeek 真实凭证由 Electron `safeStorage` 写入加密凭证文件；项目源码、工作区和凭证文件均未检出符合该 Key 形态的明文，且重启后可正常解密使用。
- 默认资料目录中的 `workspace.json` 与 `credentials.json` 权限均为 `0600`，未检出 DeepSeek Key 形态的明文。
- API Key 和 MCP 敏感环境变量由主进程安全存储，渲染层只接收掩码；使用临时 `MCP_TOKEN` 验证了掩码、无明文落盘和删除后凭证清理。HTTP 请求头沿用同一实现，但本轮未接入远程 HTTP 样本。

### 导出与界面

- 正式导出模块生成 3,303 字节 Markdown 与 10,201 字节 DOCX。
- DOCX ZIP 结构、Office 文档结构校验及 Pandoc 往返解析均通过，题目与参考文献章节可恢复。
- 完成参考图并排比较、1440/1120/1000/920 响应式截图和主要浏览器交互验收；控制台为 0 错误、0 警告。
- 右上角工具栏已按 Codex macOS 参考方式统一为紧凑控件：对话/文稿使用轻量分段按钮，Markdown/Word 收拢为同组图标导出入口，研究工作台开关使用独立弱边框按钮；相关键盘名称、提示和加载状态保留。
- 左上角 macOS 原生红黄绿按钮已改为 Codex 式左栏布局：第一行只容纳原生窗口按钮与侧栏折叠按钮，品牌标识位于第二行；最终 DMG 原生截图确认互不覆盖。浏览器交互确认展开态侧栏约 266px、收起态 80px，收起按钮会移动到第二行避开原生按钮。
- 最终 DMG 应用在 1120×760 下实测右栏抽屉关闭按钮可见、可关闭，关闭后内容面板不再显示。
- 右侧稿件区已改为递归三级树，最终 DMG 副本实测显示 5 个一级章、11 个二级节和 6 个三级条目；点击三级“对话质量评估维度”后，该节点成为持久的当前章节，输入框保持 DeepSeek 当前模型并显示“当前章节上下文”。

## 未验证

- 尚未使用用户真实密钥调用 OpenAI、Kimi、通义、Anthropic 等其他第三方线上模型；DeepSeek 已通过不代表其他厂商当前端点都可用。
- 未接入真实远程 MCP Streamable HTTP 服务；该传输的实现和表单已完成，但最终只实测 stdio。
- 未自动操作 macOS 原生保存面板和 Finder；正式 Markdown/DOCX 生成模块及文件本身已验证。
- 未完成完整论文人工学术评审、查重或 AIGC 检测。
- 未完成与 AIWritePaper 相同题目、模型、文献条件下的盲评对照。

## 阻塞项

- 本机没有 Apple Developer ID 签名身份，因此当前 DMG 未签名、未公证，只适合本机试用。正式对外分发需要开发者证书和 Apple 公证。
- AIWritePaper 登录后/付费范文正文不在合法公开调研范围内，无法据此宣称本产品已经达到与其完整范文相同的写作质量。

## 结论

首版可安装 MVP 已完成：本机项目、模型接入、论文生成与对话、公开文献检索、MCP、凭证保护、Markdown/DOCX 导出和三栏桌面界面形成可运行闭环。最终写作质量取决于用户选择的模型、提示要求与纳入证据；应用提供引用白名单与质量门禁，但不以自动检查替代人工学术审查。

---

## 0.2.0 更名与项目管理验收

验收日期：2026-08-12

显示名称：学术 Agent

兼容标识：`com.aiwritepaper.agent` / `aiwritepaper-agent`

### 新交付物

- DMG：`desktop/release/Academic-Agent-0.2.0-arm64.dmg`
- 大小：134,399,925 字节
- SHA-256：`3972610dce3156f9b50cd517dec84d5c57539bfff9132de28c529414625530b5`
- release 应用与 DMG 安装副本的 `app.asar` SHA-256 均为 `1b1cbb9f7fe1360ac66041c316be6becb8f51d9ac3347ab24c058ed4024c9526`。
- 原生验收截图：`output/qa/native-academic-agent-0.2.0.jpg`（本机证据，不纳入公开源码仓库）。

### 已通过

- `npm run typecheck`、`npm run build` 与 `npm run dmg` 全部退出为 0。
- DMG 完成挂载、复制和原生启动；应用退出后再次启动成功，沙箱 renderer 从最终安装副本的 `app.asar` 运行。
- macOS 窗口、菜单栏、关于面板配置与页面品牌使用“学术 Agent”；旧内部应用名仅用于兼容钥匙串。
- 旧工作区、DeepSeek 提供商与已安全保存的凭证可直接恢复；未重新输入 Key，设置页显示“已安全保存”与“连接正常”，输入框默认保持 `DeepSeek / deepseek-v4-flash`。
- 左侧不再显示重复的“研究工作台”导航；从设置页点击研究项目，可直接返回该项目对话。
- “研究项目”旁为原生文件夹入口；原生选择器明确说明“今后新建的研究将保存在此位置，现有项目不会被搬移”。未配置时默认使用“文稿/学术 Agent”。
- 项目删除确认框已在最终安装副本中原生验收；对用户的真实 DeepSeek 项目只打开并取消，未执行删除。
- 隔离临时工作区的 `project-lifecycle-smoke.ts` 验证了项目级联清理、运行中任务拒绝删除、删除最后一个项目后重启仍保持空工作区，以及用户磁盘上的研究文件夹与已导出文件保留。
- 右侧稿件在最终安装副本中显示 5 个一级章、11 个二级节和 6 个三级条目；点击“引言”后输入框保持 DeepSeek 模型，上下文切换为“当前章节上下文”。

### 仍未验证 / 阻塞

- 0.2.0 仍未进行 Developer ID 签名与 Apple 公证，公网二进制分发仍受 Gatekeeper 阻塞。
- 本轮没有再向 DeepSeek 发送新的在线对话；验证的是旧凭证恢复、连接健康状态与默认模型保持，避免为本次 UI/项目管理改造产生额外 API 费用。

---

## 0.2.0 当前增量验收（截至 2026-08-15）

### 已通过

- 输入框 `/` 菜单按应用内 Skill 与 MCP 真实工具展示；`/search_papers`、`/paper_search` 可明确调用内置 arXiv MCP。中文请求会结合项目背景规划英文检索式，真实 arXiv 返回和 DeepSeek 回答已经在隔离原生应用中闭环验证。
- MCP 调用在外部执行前创建本机运行记录；参数与结果有界脱敏并保存 SHA-256，外部返回以明确的不可信数据边界进入模型上下文。
- 章节生成使用流式正文与 Thinking；已生成章节提供真实历史版本和无需二次确认的重新生成，旧版切换会更新当前项目上下文和导出读取的章节头。
- 助手消息可把真实 MCP 结构化文献以无圆角文字操作添加到右栏；文献库支持全部文献、项目分类、纳入/取消纳入、移出项目和永久删除，并阻止删除仍被证据链引用的记录。
- 右侧大纲的用户版本号与中央文稿使用同一 `ManuscriptSectionVersion.number`，不再把内部保存计数冒充历史版本。
- 输入框新增真实语音入口；主进程读取并请求 macOS 麦克风权限，设置页显示真实状态、`zh-CN` 语言和系统设置入口。打包应用确认 `webkitSpeechRecognition` 可用，Info.plist 包含中文麦克风与语音识别用途说明。
- 最新 `npm run typecheck`、生产构建、Apple Silicon `.app` 打包、原生语音界面与权限桥接验收均通过。
- `/Applications/学术 Agent.app` 已更新并重新启动；安装副本与构建产物 `app.asar` SHA-256 均为 `6fe0e7ac7c6e5f0e105c26faa4a602926e980d84f4f403f8d2701583f8ae8b5f`，renderer 继续启用沙箱。

### 未验证

- 当前 Mac 的麦克风权限仍为 `not-determined`；应用没有代替用户点击系统授权，因此真实口述转写需用户首次点击麦克风、选择允许后再人工确认。
- Electron/Chromium Web Speech Recognition 可能依赖系统或网络识别服务，不承诺完全离线转写。
- 本轮源码增量没有重新生成和重新验收 DMG；仓库中的 0.2.0 DMG 仍是上一轮安装包，Dock 应用则已经同步到最新构建。
- 真实 Anthropic、其他第三方模型和远程 Streamable HTTP MCP 仍未验证。

### 发布阻塞

- 仍未取得 Apple Developer ID；公开下载场景缺少 Developer ID 签名、Apple 公证和 Gatekeeper 验收。
- 现有证据不能证明完整论文质量已经达到 AIWritePaper 付费范文水平，仍需相同题目、模型和文献条件下的独立盲评。
