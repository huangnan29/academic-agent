# 学术 Agent

学术 Agent 是一款本机优先的 macOS 论文研究桌面工具。它把公开文献检索、三级大纲、分章节写作、基于文稿的继续对话、MCP 工具和 Markdown / DOCX 导出放在同一个三栏工作台中。

> 软件已从 AIWritePaper Agent 更名为“学术 Agent”。内部应用标识和本机数据目录保持不变，旧版已保存的项目与 API 凭证可继续使用。

## 安装

当前 0.2.0 安装包面向 macOS 12 及以上的 Apple Silicon Mac（M1/M2/M3/M4 系列，不支持 Intel）。本机构建后打开 `desktop/release/Academic-Agent-0.2.0-arm64.dmg`，将“学术 Agent”拖到“应用程序”后启动。

仓库中的该 DMG 是上一轮已验证安装包；当前研究树、折叠大纲和应用内 Skills 更新已进入源码及本机 `.app`，本轮未自动重新生成 DMG。需要发布新安装包时再单独构建并验收。

当前构建没有 Apple Developer ID 签名与公证，仅适合本机试用。若 macOS 首次阻止启动，可在 Finder 中按住 Control 点击应用，选择“打开”，再次确认。

## 快速开始

1. 打开“设置 → 模型提供商”，选择 OpenAI 兼容或 Anthropic，填写 Base URL、API Key 与模型；保存后执行连接测试。首版已实测本机 OpenAI 兼容服务与 DeepSeek 官方 OpenAI 兼容接口；其他第三方厂商仍需使用你自己的密钥确认。
2. 如需固定研究方法或写作规范，可进入“Skills”添加纯文本指令并选择是否启用。
3. 点击“新建研究”，填写题目、学科、类型、篇幅和要求。默认保存在“文稿/学术 Agent”；也可通过“研究”旁的文件夹按钮修改今后新项目的根目录。
4. 进入“文献库”，默认通过 OpenAlex + Crossref 检索；也可选择已连接 MCP 的结构化检索工具。
5. 将需要的真实文献纳入项目，回到文稿页生成三级大纲，再通过 `1 / 1.1 / 1.1.1` 分级列表选择章节生成或手工编辑。
6. 在底部输入框围绕项目或当前章节继续对话；模型选择器位于输入框左下角。
7. 顶部可导出 Markdown 或 Word 文档，右侧“过程”页显示检索、生成、质量检查和导出步骤。

## 数据与安全

- 项目、会话、文稿、文献和导出记录默认保存在当前 Mac 的应用数据目录。
- 删除研究只会清理应用内的对话、文献记录、大纲、章节和过程记录；研究文件夹与已导出的 Word / Markdown 文件不会被删除。
- API Key 与 MCP 敏感环境变量/请求头由 Electron `safeStorage` 加密保存；渲染页面不能读取明文。
- Skills 和 MCP 配置均由本应用独立维护；不会扫描 `~/.codex`、系统 Skills 或其他应用的 MCP 配置。
- 远程模型与 MCP 地址必须使用 HTTPS；HTTP 只允许本机回环地址。
- 演示项目和演示文献不可作为正式引用，应用不会把演示数据静默混入真实项目。
- 工具不会绕过付费墙、登录、验证码或站点访问控制，也不会承诺查重或 AIGC 检测结果。

## 开发

使用 Node 22 LTS：

```bash
cd desktop
npm ci
npm run dev
```

最终构建：

```bash
npm run typecheck
npm run dmg
```

详细设计见 `implementation_plan.md`；界面验收见 `design-qa.md`；安装、功能和边界证据见 `verification-report.md` 与 `task.md`。
