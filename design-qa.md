# 学术 Agent 桌面界面设计验收记录

## 1. 验收对象

- 参考图：`/var/folders/nh/ytrqnycn7hx1xk7q138h1q540000gn/T/codex-clipboard-8904f34b-bd6d-44f4-aa57-206e1aafcabf.png`
- 实现对象：学术 Agent macOS 桌面端渲染界面，以及早期用于布局检查的 fallback。
- 核心设计目标：忠实保留参考图的三栏 Agent 工作台结构、信息密度、固定输入区和右侧研究工作台，同时使用学术 Agent 的暖珊瑚品牌色，并避免紫色渐变、Emoji、手绘 SVG 和 CSS 假图标。

## 2. 视觉比较证据

### 2.1 参考图与实现并排比较

- 文件：`output/playwright/main-qa/reference-vs-implementation-final.png`
- 尺寸：2000×1272。
- 检查结论：左侧项目与对话导航、中部对话工作区、底部固定输入框、输入框左下模型选择器、右侧文献/稿件/过程工作台的整体结构与参考图一致；品牌色、文献状态和论文研究语义已替换为学术 Agent 自有设计。

### 2.2 响应式截图

| 视口 | 证据文件 | 检查重点 | 结果 |
| --- | --- | --- | --- |
| 1440×900 | `output/playwright/main-qa/implementation-1440x900.png` | 完整三栏、固定标题栏、固定输入框、右侧文献列表 | 通过 |
| 1120×760 | `output/playwright/main-qa/implementation-1120x760.png` | 右侧工作台抽屉化、中央内容可用性 | 通过，随后补充抽屉内关闭入口 |
| 1000×700 | `output/playwright/main-qa/implementation-1000x700-final.png` | 窄侧栏、中央输入区、右侧抽屉与顶部操作 | 通过 |
| 920×680 | `output/playwright/main-qa/implementation-920x680-final.png` | 最小窗口布局、导航折叠、内容不溢出 | 通过 |

`output/playwright/main-qa/implementation-920x680-before-fix.png` 仅保留为修复前对比，不作为最终通过证据。

## 3. 已检查交互

### 3.1 主工作台

- 左侧项目、对话、文献库和设置入口。
- 对话与文稿视图切换。
- 右侧文献、稿件、过程三个标签切换。
- 左右侧栏收起与恢复。
- 1120px 及以下右侧工作台抽屉行为。
- 最后修复：抽屉覆盖顶部触发器时，右栏标题内仍提供明确的“关闭研究工作台抽屉”按钮；该按钮仅在抽屉断点显示，并具有可访问名称和提示文本。

### 3.2 模型菜单与设置

- 输入框左下模型菜单打开、关闭和模型选择。
- 模型菜单 Esc 关闭及菜单项语义。
- OpenAI 兼容接口与 Anthropic 协议选择。
- 提供商新增、编辑、掩码凭证说明和连接测试状态。
- Markdown 与 Word 两种格式独立导出入口及各自加载状态。

### 3.3 MCP 服务

- stdio 与 Streamable HTTP 配置切换。
- stdio 环境变量与 HTTP 请求头输入、掩码回填和格式错误提示。
- MCP 连接测试及浏览器演示提示。
- 已发现工具的内联 JSON 参数输入、调用结果和错误显示。
- MCP 资源读取及只读结果显示。
- 文献库中的 MCP 文献来源选择。

### 3.4 研究主路径

- 新建研究表单、Esc 关闭、基础焦点陷阱及关闭后焦点恢复。
- 空项目生成三级大纲、加载状态、错误提示及生成后自动选择首章节。
- 章节生成、章节编辑与保存。
- 对话发送、流式内容、停止生成和保留已有内容。
- 暂未开放的附件与快捷修改操作已明确禁用，不以可点击控件伪装为可用功能。

## 4. 控制台检查

- 最终 Playwright 验收控制台：0 个错误，0 个警告。
- 相关 Playwright 页面快照、截图和控制台记录保存在 `output/playwright/main-qa/`。

## 5. 证据边界

### 浏览器演示已证明

- React 渲染界面能够加载。
- 浏览器 fallback 下的三栏布局、响应式断点、菜单、表单、对话演示、文献演示、MCP 演示和本地交互能够按设计呈现。
- 演示数据始终标记为“演示数据，不可引用”，MCP 演示测试明确说明未连接真实服务。

### 浏览器演示未证明

- 截图和浏览器交互不能证明 Electron preload 与主进程真实 bridge 已成功调用。
- 不能单独证明真实模型厂商 API、真实 OpenAlex/Crossref 网络结果、真实 MCP 工具与资源调用、macOS 安全存储、系统保存对话框、Finder 定位、DOCX/Markdown 实际落盘、DMG 安装或签名公证。
- 安装版真实桥接能力必须以 Electron 构建、DMG 安装启动、preload IPC、真实或受控服务调用、导出文件解析及 macOS 本机操作记录作为独立验收证据；不得用浏览器 fallback 的成功状态替代。

## 6. 安装版补充复验

- 最终 DMG 内应用已通过真实 Electron preload/IPC 启动；此证据与浏览器 fallback 验收分开记录。
- 在 1120×760 视口打开右侧研究工作台抽屉，关闭入口可见且可操作；点击后按钮与内容面板均消失。
- 安装版截图：`output/playwright/main-qa/native-final-dmg.png`。
- 1120×760 抽屉截图：`output/playwright/main-qa/native-final-1120-drawer.png`。

## 7. 最终结论

参考图对应的三栏桌面工作台、核心论文研究路径、主要设置界面、响应式布局和关键可访问性交互已完成最终视觉验收。上述结论仅覆盖界面与浏览器演示范围，安装版真实桥接按独立工程验收记录判定。

## 8. Codex 风格顶部工具栏复验

### 8.1 视觉真值与实现证据

- 新增参考图：`/var/folders/nh/ytrqnycn7hx1xk7q138h1q540000gn/T/codex-clipboard-b1ee3f8c-b327-4a3c-bd5b-deb643cfb332.png`，原始像素为 3456×2078，参考范围为右上角 macOS 工具栏。
- 浏览器实现截图：`output/playwright/main-qa/toolbar-codex-style-2000x1272.png`，CSS 视口与截图像素均为 2000×1272，像素密度按 1 倍记录。
- 最终安装版截图：`output/playwright/main-qa/native-final-dmg-deepseek-toolbar.png`，整屏像素为 3456×2234，状态为从本轮 DMG 复制启动的真实应用、DeepSeek 已连接、真实对话已完成、右侧研究工作台展开。
- 默认资料实例渲染截图：`output/playwright/main-qa/native-default-profile-deepseek-renderer.png`，渲染区域像素为 2960×1880；可直接看到“DeepSeek 对话测试”、真实回复、`DeepSeek / deepseek-v4-flash` 模型选择状态与优化后的顶部工具栏。
- 聚焦并排证据：`output/playwright/main-qa/codex-toolbar-comparison.png`，将两张图的工具栏区域等比缩放并置于同一 1600×640 画布；该证据仅比较控件层级、密度、圆角、间距和图标重量，不把两个产品的不同内容当作偏差。

### 8.2 比较历史与修复

- 初始 P2：原实现同时使用较重的对话/文稿分段控件、两个带文字的大号导出按钮和孤立侧栏按钮，控件高度、边框重量与间距不统一。
- 修复：分段控件压缩为 30px 浅底原生样式；Markdown 与 Word 保持独立功能但收拢为同一 30px 导出图标组；右栏开关改为独立 28px 轻量按钮；操作区间距统一为 6px。
- 复验：浏览器预览与最终 Electron 构建均显示同一工具栏样式，未发现仍需处理的 P0/P1/P2。

### 8.3 必查表面与交互

- 字体：继续使用系统字体栈与现有 12px 工具栏文字，字重和基线与工作台其他原生控件一致。
- 间距：三个操作组高度、圆角、内边距与组间距已经统一；窗口标题与右栏标题未被挤压。
- 颜色：沿用既有背景、弱表面、边框和悬停 token，没有引入新的视觉体系。
- 图像与图标：应用标志保持原始资源；工具栏继续使用既有 Lucide 图标库，没有手绘 SVG、文本符号或占位图。
- 文案：对话、文稿、Markdown、Word 和研究工作台语义保持不变；紧凑导出按钮保留 `aria-label`、`title` 与独立加载状态。
- 交互：已检查对话/文稿切换、右侧研究工作台收起/恢复、Markdown/Word 两个入口可访问名称；浏览器控制台为 0 错误、0 警告。

### 8.4 余留边界

- Codex 顶部 Finder 下拉等专属功能不属于学术 Agent 产品范围，本轮只采用其轻量 macOS 工具栏语言。
- 最终安装版截图包含桌面环境，不作为其他后台应用的视觉验收依据。

## 9. Codex 风格左上窗口按钮复验

### 9.1 根因与修复

- 原实现使用 macOS 原生 `hiddenInset` 标题栏，但品牌图标也从左栏首行 `x=14px` 开始，直接覆盖红黄绿按钮；侧栏收起按钮与品牌名称也和原生控件争夺同一条 52px 高区域。
- 修复后左栏头部为两行：顶部 44px 只保留原生窗口按钮和 28×28px 侧栏折叠入口，第二个 44px 行放置 28×28px 品牌标志与名称；原生按钮位置为 `{x:16,y:14}`。
- 收起态侧栏安全宽度改为 80px，折叠入口移动到第二行居中，因此不会和三个原生按钮重叠。

### 9.2 证据与结论

- 最终 DMG 原生窗口截图：`output/playwright/main-qa/native-final-traffic-lights.png`，像素为 2960×1880；确认红黄绿按钮、折叠入口、品牌标志和品牌名称分层显示。
- 左栏原生细节裁图：`output/playwright/main-qa/native-final-traffic-lights-left-crop.png`，用于查看完整左栏与窗口按钮关系，不作为收起态截图。
- 聚焦并排证据：`output/playwright/main-qa/codex-vs-aiwritepaper-traffic-lights.png`，将 Codex 参考图与最终安装版左上区域按相同垂直比例并排，确认窗口按钮节奏和侧栏控制层级一致。
- 浏览器布局测量：展开态折叠入口为 `x=86,y=8,w=28,h=28`，品牌标志为 `x=14,y=52,w=28,h=28`；收起后侧栏宽 80px，折叠入口为 `x≈25.5,y=52,w=28,h=28`。
- 展开、收起和恢复交互均通过；最终浏览器控制台为 0 错误、0 警告，未发现 P0/P1/P2 视觉问题。

final result: passed
