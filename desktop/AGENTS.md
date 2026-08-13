# Prototype Instructions

本目录是学术 Agent 的 Electron 桌面应用工程。除以下原型规则外，必须继承上级 `../AGENTS.md` 的全部约束，尤其是禁止 Superpowers、中文注释、安全存储、最终集中测试和 DMG 完成定义。

已冻结的持久设计决策：

- 视觉源为用户提供的 Codex 风格三栏桌面截图。
- 品牌采用中性灰白与少量暖珊瑚强调，不使用紫色渐变。
- 左栏为项目/会话，中栏为对话/文稿，右栏为文献/稿件/过程。
- macOS 原生红黄绿窗口按钮独占左栏顶部控制行；侧栏折叠按钮位于其右侧，品牌标识放在下一行，不得与 traffic lights 重叠。
- 输入框左下角固定展示提供商与模型选择器。
- 只使用图标库，不使用 emoji、手绘 SVG 或 CSS 假图标。
- Electron 主进程、preload、共享契约和打包配置属于主 agent 所有；界面子 agent 只修改 `src/`。

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
