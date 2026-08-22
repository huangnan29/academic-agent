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

## 10. 研究树、三级大纲与应用内 Skills 复验

### 10.1 视觉真值、实现证据与归一化

- 左侧研究树参考：`/var/folders/nh/ytrqnycn7hx1xk7q138h1q540000gn/T/codex-clipboard-94c1694a-3802-427d-ac6a-074d8af6a4db.png`，890×398；参考重点是项目文件夹下包含对话、项目操作菜单和消除独立“项目/对话”重复区。
- 大纲参考：`/var/folders/nh/ytrqnycn7hx1xk7q138h1q540000gn/T/codex-clipboard-2e520649-c214-48b8-9a63-3d3c6f648261.png`，676×788；参考重点是章节层级、编号可读性和行高密度。
- Skills 导航参考：`/var/folders/nh/ytrqnycn7hx1xk7q138h1q540000gn/T/codex-clipboard-c4173d55-618d-44f2-9244-7ea2e05d8603.png`，534×394。
- 最终原生实现：`desktop/output/native-latest/workspace-outline.png`、`desktop/output/native-latest/skills.png` 与 `desktop/output/native-latest/skills-with-item.png`，均为 2960×1880；Electron CSS 视口 1480×940，`deviceScaleFactor=2`。
- 聚焦并排证据：`desktop/output/native-latest/compare/sidebar-source-vs-native.png`、`desktop/output/native-latest/compare/outline-source-vs-native.png`。实现截图按参考区域宽度等比缩放后与原图置于同一画布；不把参考截图中的红色批注框当作产品视觉元素。
- 状态：真实 `/Applications/学术 Agent.app`，保留原工作区；当前研究已展开，稿件标签打开，三级大纲全部展开，Skills 页面为空状态。

### 10.2 比较结论

- 信息架构：左栏已改为项目文件夹与当前活动对话的单一研究树，独立“对话”区消失；其他研究保持文件夹行，当前研究展开一个真实活动对话。该层级与 Codex 参考一致，同时保留本产品已有“设置默认研究文件夹”入口。
- 大纲：移除重复的大文档图标，直接显示 `1 / 1.1 / 1.1.1`；折叠箭头、弱层级导线、紧凑标题与字数/状态形成稳定三级结构。相比参考图，最终实现显著降低行高，并补齐三级条目可见性。
- Skills：入口位于“新建研究”下方；独立页面包含列表、新增/编辑表单、启用状态和系统隔离说明。MCP 仍位于模型设置，界面明确两者均由本应用维护。
- 字体与排版：使用现有 macOS 系统字体栈；研究标题 13px、对话 12px，大纲标题 12px、元信息 10px、编号 11px，重要信息不再依赖 8px 小字。
- 间距与布局：研究文件夹 34px、对话 34px、大纲行 44px；三层缩进与导线节奏清晰，右栏没有横向溢出或持久控件遮挡。
- 颜色与 token：继续使用既有暖珊瑚选中态、弱灰背景和语义状态色；没有引入渐变或新的视觉体系。
- 图像与图标：应用图标沿用原始资源；Folder、Sparkles、Chevron、Shield 等均来自 `lucide-react`，没有手绘 SVG、emoji 或 CSS 替代图标。
- 文案：研究、研究对话、分级视图、展开/收起、应用内能力和系统隔离说明语义明确；不存在将系统 Skill 或系统 MCP 描述为已导入的文案。

### 10.3 交互与工程验证

- 原生结构检查：2 个研究文件夹、1 个活动对话、0 个独立对话区；大纲显示 `1` 到 `6.2` 的分级编号和 12 个嵌套分组。
- 原生章节检查：点击由父稿同步的二级标题后，中央文稿显示 685 字对应内容，不再显示“本章尚未生成”。
- 原生 Skills 检查：通过页面表单临时新增 1 个启用 Skill；保存后左侧列表保持选中，右侧进入“编辑”状态并回显三项文本；随后经过两步确认删除，数量恢复且记录不存在。验收临时数据已清理。
- 已检查全部展开、收起时保留当前章节路径、左侧项目切换、Skills 页面表单，以及项目菜单的 Esc/上下方向键行为。
- 类型检查、生产构建和 Apple Silicon `.app` 打包通过；安装副本与本轮打包的 `app.asar` SHA-256 均为 `dce6764151d8f38469469571599f26659082a62695d432d533d4014bb0d9b599`。
- 本轮按照用户要求未启动 Chrome，也未生成新的 DMG；视觉与交互证据来自原生 Electron 应用。

### 10.4 比较历史与余留边界

- 首次同画布比较未发现 P0/P1/P2 视觉差异；无需视觉返工。代码审查提出的“收起全部隐藏当前项”和“Skill 删除易误触”已在原生复验前分别改为保留选中祖先路径、两步确认。
- 标准 ARIA tree 的完整 roving tabindex 与上下键导航仍可作为 P3 后续优化；当前鼠标、Tab、折叠按钮及左右方向键均可操作，不阻塞本轮需求。
- 参考图未提供 Skills 详情页视觉稿，因此详情页沿用既有设置工作台组件与 token；不把这一产品扩展误判为参考偏差。

## 11. 研究文件夹图标尺寸复验

### 11.1 视觉真值与实现证据

- 问题截图：`/var/folders/nh/ytrqnycn7hx1xk7q138h1q540000gn/T/codex-clipboard-8a0d3f29-92e3-449a-bce4-211434f692fd.png`，524×296；状态为长标题项目展开，短标题项目收起。
- 修复后原生全屏截图：`desktop/output/native-latest/folder-size-fix/second-active.png`，2960×1880；Electron CSS 视口为 1480×940，`deviceScaleFactor=2`，状态与问题截图一致。
- 反向状态截图：`desktop/output/native-latest/folder-size-fix/first-active.png`，2960×1880；状态为短标题项目展开、长标题项目收起，用于排除图标状态差异。
- 聚焦同画布比较：`desktop/output/native-latest/folder-size-fix/source-vs-fixed.png`，1048×296；左侧为用户问题截图，右侧为修复后的原生应用项目区域。实现区域从原生截图按 2 倍密度裁取并补齐至 524×296，没有以浏览器预览替代原生证据。

### 11.2 根因、修复与复验

- 初始 P1：项目行使用弹性布局，长标题会压缩左侧 SVG；因此问题跟“展开/收起”状态无关，同一个项目无论显示 `Folder` 还是 `FolderOpen` 都可能被挤小。
- 修复：为 `.research-folder-button > svg` 设置固定 `16×16px`、`flex: 0 0 16px`；标题区域设置 `flex: 1 1 auto` 与 `min-width: 0`，只允许文字截断，不再让图标承担收缩。
- 原生测量：短标题展开时两个项目图标均为 16×16px；长标题展开时两个项目图标仍均为 16×16px；四种组合的 `flex-shrink` 均为 `0`、`flex-basis` 均为 `16px`。
- 复验结论：用户指出的尺寸不一致已消除，未发现余留 P0/P1/P2。

### 11.3 必查表面

- 字体与文案：标题字号、字重、截断规则与项目名称均未改变。
- 间距与布局：项目行高度、图标与标题间距、活动对话缩进均保持不变；长标题仅在既有宽度内省略。
- 颜色与 token：未新增颜色、阴影或状态 token。
- 图像与图标：继续使用 `lucide-react` 的 Folder/FolderOpen；只固定布局尺寸，没有替换资产或手绘 SVG。
- 交互状态：已在原生应用中分别点击两个项目，验证 Folder/FolderOpen 相互切换时尺寸不变；本轮未启动 Chrome。

## 12. Codex 式项目树、多对话与整理菜单复验

### 12.1 视觉真值、实现证据与归一化

- 多对话参考：`/var/folders/nh/ytrqnycn7hx1xk7q138h1q540000gn/T/codex-clipboard-d5d010f8-03a2-4616-8dc4-278b824a28e9.png`，656×402。
- 项目操作参考：`/var/folders/nh/ytrqnycn7hx1xk7q138h1q540000gn/T/codex-clipboard-9ae4cdd3-35ae-4f2e-88ae-0189a84fd9f4.png`，324×358。
- 整理菜单参考：`/var/folders/nh/ytrqnycn7hx1xk7q138h1q540000gn/T/codex-clipboard-aab6181b-02cb-4558-81a6-897ec232f903.png`，854×436。
- 原生实现截图：`desktop/output/native-latest/codex-sidebar/project-conversations.png`、`project-menu.png`、`organize-list.png`、`organize-manual.png`，均为 2960×1880；Electron CSS 视口为 1480×940，`deviceScaleFactor=2`。
- 聚焦同画布比较：`desktop/output/native-latest/codex-sidebar/compare/conversations-source-vs-native.png`（1312×402）、`project-menu-source-vs-native.png`（648×358）、`organize-source-vs-native.png`（1708×436）。实现区域从原生截图裁取，按参考图尺寸等比缩放并补白，未把参考截图的红色批注框当成界面元素。

### 12.2 比较历史与修复

- 初始 P1：旧侧栏只显示当前项目的一条活动对话，项目展开状态与“当前项目”耦合；项目内新建对话、置顶、布局切换和排序均不存在。
- 修复：新增持久化的项目展开集合、项目置顶与手动顺序；新增项目内对话创建和切换；新增“按项目 / 在一个列表中”以及“优先级 / 最近更新 / 手动排序”；手动模式启用原生拖动顺序。
- 初次原生视觉复验发现 P2：菜单打开时首项的全局品牌色焦点环过重，与 Codex 的浅灰选中态不一致。
- 二次修复：项目菜单与整理菜单的 `:focus-visible` 保留浅灰背景和键盘焦点语义，但去掉菜单内部双层品牌色光环。
- 最终同画布复验未发现仍需修复的 P0/P1/P2；当时尚未进入对话级右键菜单范围。后续用户明确要求后，归档等对话操作已在第 13 节补充为真实能力，不再沿用这一旧范围判断。

### 12.3 功能与持久化证据

- 项目独立展开、收起、再次展开通过；状态由 `sidebarExpandedProjectIds` 持久化，不再随当前项目强制展开。
- 在真实项目中通过项目行按钮新建第二条对话，对话数由 1 变为 2；新对话立即成为活动对话，随后成功切回原对话。
- 通过项目菜单完成置顶和取消置顶；菜单文案随状态在“置顶项目 / 取消置顶项目”之间变化，最终恢复原状态。
- 通过整理菜单往返“按项目 / 在一个列表中”；依次切换优先级、最近更新、手动排序，工作区设置与可见列表同步。
- 手动模式下实际将第二个项目拖到第一个项目前，并将第二条对话拖到第一条对话前；两次可见顺序变化与持久化顺序均通过。
- 在临时验收工作区中退出并重新启动应用后，第二条对话、项目布局、手动排序和项目展开状态均恢复；重启持久化检查通过。
- 验收脚本：`desktop/qa/cdp-sidebar-smoke.mjs`。验收前备份 `workspace.json`，结束后恢复原文件并以正常模式重启应用，未在用户工作区留下临时对话或排序状态。

### 12.4 必查表面

- 字体与文案：沿用 macOS 系统字体；项目标题、对话标题、菜单分组和计数层级与 Codex 参考一致，长标题继续省略而不挤压图标。
- 间距与布局：项目行 34px，对话行 34px；独立折叠箭头、16px 文件夹、项目内新建对话和更多操作保持稳定网格。
- 颜色与 token：使用现有浅灰悬停/选中表面、弱边框和危险删除色，没有复制参考图中的红色标注框。
- 图像与图标：全部使用现有 `lucide-react` 图标库，没有手绘 SVG、字符图标或占位资源。
- 交互与可访问性：菜单包含 `menu`、`menuitem`、`menuitemradio`、`aria-checked`，支持 Esc、上下方向键和可见焦点；项目展开使用 `aria-expanded`。
- 原生边界：类型检查、生产构建、Apple Silicon `.app` 打包和安装副本交互通过；本轮没有启动 Chrome，也没有生成新的 DMG。

## 13. Codex 式对话菜单与可调侧栏复验

### 13.1 视觉真值、实现证据与归一化

- 对话菜单参考：`/var/folders/nh/ytrqnycn7hx1xk7q138h1q540000gn/T/codex-clipboard-1ab5465f-f7e5-407b-995a-045466703e51.png`，664×684；参考重点是对话级操作分组、子菜单、圆角浮层和轻量桌面密度。
- 原生实现菜单：`output/playwright/main-qa/native-conversation-context-menu.png`，2960×1880；Electron CSS 视口为 1480×940，`deviceScaleFactor=2`，状态为隔离工作区中的真实右键菜单。
- 原生侧栏调宽：`output/playwright/main-qa/native-conversation-menu-resized-sidebar.png`，2960×1880；隔离工作区第一次由 280px 拖至 366px，最终构建复验再由 366px 拖至 452px，截图为最终 452px 状态。
- 同画布比较：`output/playwright/main-qa/codex-vs-academic-agent-conversation-menu.png`，1051×684；左侧为 Codex 参考，右侧为原生实现裁取并等高归一化。两者内容不同，因此以菜单层级、圆角、边框、图标、分隔线和密度为比较对象。

### 13.2 比较历史与修复

- 初始 P1：研究树只有对话左键切换，没有右键或更多菜单；用户无法管理独立对话。
- 修复：对话行同时支持原生右键和悬停“更多”入口；菜单连接独立置顶、移动研究、重命名、归档/恢复、未读/已读、Finder、复制会话 ID 与继续新对话。移动研究使用真实消息归属迁移，运行中对话会被安全拒绝。
- 初始 P1：左侧栏宽度固定，只能整体收起，无法像 Codex 一样按内容调节。
- 修复：侧栏右缘加入 7px 拖动热区，支持鼠标拖动、左右方向键微调和双击恢复 280px；保存范围为 240–520px，收起时保留上次展开宽度。
- 最终同画布复验未发现仍需修复的 P0/P1/P2。实现没有加入“复制深度链接”“在新窗口中打开”等当前应用无协议或多窗口后端的占位菜单，避免形成可点击但无动作的假功能。

### 13.3 原生功能与持久化证据

- 使用打包后的 Apple Silicon `.app` 与独立 `user-data-dir` 运行，不读取或修改用户真实工作区；验收脚本为 `desktop/qa/cdp-conversation-menu-smoke.mjs`。
- 通过真实右键事件打开菜单；随后通过菜单完成置顶、重命名、标记未读、移动到第二个真实研究、归档、显示已归档、取消归档和复制会话 ID。
- 归档后对话默认隐藏；整理菜单打开“显示已归档对话”后可重新找到并恢复，消息数据没有删除。
- 侧栏第一次从 280px 实际拖至 366px，最终构建复验再从 366px 拖至 452px；收起后实测为 80px，再展开恢复 452px。完全退出并使用同一隔离目录重启后，452px、改名、置顶和未读状态全部恢复。
- 类型检查、生产构建和 Apple Silicon `.app` 打包通过；最终 `/Applications/学术 Agent.app` 与打包产物的 `app.asar` SHA-256 均为 `d46c13bf9cd181cef877acef95e2bde5a2cd0ce7168fe18b4b1a22dfba076124`。本轮没有启动 Chrome，也没有生成 DMG。

### 13.4 必查表面与架构边界

- 字体与排版：菜单沿用 macOS 系统字体栈，13px 菜单文字与 16px 图标形成清晰层级；侧栏项目/对话字号未因调宽改变。
- 间距与布局：菜单宽 232px，34px 最小行高、7px 行圆角、12px 外圆角和两处分隔线接近 Codex 的紧凑浮层节奏；子菜单从“移至研究”右侧展开。
- 颜色与 token：继续使用现有背景、浅灰悬停、弱边框和阴影 token；未复制参考截图标注或引入新品牌色。
- 图像与图标：全部来自现有 `lucide-react`，没有手绘 SVG、字符图标、CSS 图形或替代图片。
- 文案与内容：菜单只展示学术 Agent 能真实执行的操作；“项目”改为产品语义一致的“研究”，不会误导用户存在 Codex 工作树或深度链接能力。
- 交互与访问：菜单包含 `menu` / `menuitem`、Esc 关闭与上下方向键导航；拖动条包含 `separator`、方向和数值范围语义，可通过键盘操作。
- 框架核验：本机 Codex.app 与学术 Agent 均包含 `Electron Framework.framework` 和 `app.asar`；学术 Agent 生产窗口从包内 `dist/index.html` 加载本地渲染文件，启用沙箱、上下文隔离并关闭 Node 集成，不是远程网页套壳。但它仍是 Electron/Chromium UI，不应描述为 SwiftUI/AppKit 原生客户端。

## 14. Codex 式输入框与右侧工作台调宽复验

### 14.1 视觉真值、实现证据与归一化

- 输入框参考：`/var/folders/nh/ytrqnycn7hx1xk7q138h1q540000gn/T/codex-clipboard-1f1b80b6-421b-445c-bd94-ae1deb3dfa9c.png`，1368×346；重点为中性圆角容器、左侧添加入口、右侧模型与圆形发送按钮。
- 添加菜单参考：`/var/folders/nh/ytrqnycn7hx1xk7q138h1q540000gn/T/codex-clipboard-947db2f0-5d33-4650-9db1-bdbede7c0efc.png`，1328×270；重点为文件/文件夹、目标与计划模式三项能力及两行文案层级。
- 原生完整状态：`output/native-composer-qa/composer-goal-plan-resized-right.png`，2960×1880；Electron CSS 视口为 1480×940，`deviceScaleFactor=2`，状态为目标与计划模式均已开启、右栏从 380px 拖至 452px。
- 原生添加菜单：`output/native-composer-qa/composer-add-menu.png`，2960×1880；状态为 Codex 式加号菜单打开。
- 输入框同画布比较：`output/native-composer-qa/codex-vs-academic-composer.png`，2700×340；参考与实现都等高归一化到 300px，再比较容器、控制位置和视觉密度。
- 菜单同画布比较：`output/native-composer-qa/codex-vs-academic-add-menu.png`，2070×350；参考与实现都等高归一化到 310px，再比较层级、图标、文案与浮层边界。
- 聚焦区域是本轮主要视觉目标，因此完整状态用于验证三栏比例与右栏宽度，两个同画布文件用于精查输入框和添加菜单。

### 14.2 比较历史与修复

- 初始 P1：输入框聚焦时同时出现品牌色外框和文本域焦点阴影，形成用户截图中的红色高亮框。
- 修复：容器聚焦前后都保持同一中性边框，文本域聚焦阴影明确为 `none`；原生脚本实测前后边框均为 `oklch(0.81 0.008 35)`。
- 初始 P1：左下角只有不可用的回形针，模型采用“提供商 + 模型”两行并放在左侧；目标与计划模式不存在。
- 修复：加号浮层真实连接文件/文件夹、对话目标和计划模式；模型入口移动到右下并直接显示当前模型，发送按钮改为 Codex 式圆形上箭头。目标与计划模式写入当前对话并进入模型上下文，不是视觉占位。
- 初始 P1：右侧研究工作台宽度固定，无法按内容自由调整。
- 修复：右栏左缘增加拖动热区，支持鼠标、左右方向键和双击恢复 380px，范围 320–620px，并将宽度写入工作区设置。
- 最终同画布复验没有发现仍需修复的 P0/P1/P2。当轮没有伪造 Codex 参考中的语音、推理强度和“附加 Codex Agent”；语音输入已在后续第 31 节接入真实权限与识别链路，应用内 Skills 继续使用独立真实入口。

### 14.3 原生功能、持久化与安全证据

- 最终类型检查、附件提取冒烟、目标/计划/附件提示词冒烟、生产构建和 Apple Silicon `.app` 打包均通过。
- 使用打包后的 `.app` 与隔离 `user-data-dir` 运行 `desktop/qa/cdp-composer-layout-smoke.mjs`；没有启动 Chrome，也没有生成 DMG。
- 原生界面实测：输入框聚焦无额外高亮；添加菜单可见三项真实能力；目标保存成功；计划模式保存成功；模型入口位于输入框右侧；右栏实际从 380px 拖至 452px；控制台 0 个运行时错误。
- 完全退出并使用同一隔离目录重启后，目标、计划模式、设置值 452px 和实际渲染宽度 452px 全部恢复。
- 文件/文件夹选择由主进程原生保存面板处理；文本提取限制单文件大小、目录深度、文件数量和总上下文长度，跳过隐藏目录、依赖目录、符号链接与不支持格式。附件内容被标记为不可信数据，不能覆盖证据和安全约束。
- 最终 `/Applications/学术 Agent.app` 与打包产物的 `app.asar` SHA-256 均为 `3a1166e231a791ea45daeea30326ec92a52b589a3c6b81dce32beae8bec716c6`，安装版已经重新打开。

### 14.4 必查表面

- 字体与排版：继续使用 macOS 系统字体；输入正文 14px，模型 12px，菜单主文案与说明形成清楚的两级层次，长模型名可截断。
- 间距与布局：输入框使用 20px 圆角、稳定的上下分区；添加入口在左，模型与发送在右；右栏调宽后中央仍保留可用输入区，没有遮挡持久控件。
- 颜色与 token：移除品牌色聚焦描边；中性边框、浅灰悬停与深色圆形发送按钮接近 Codex 参考，仅计划和目标状态使用已有暖色 token。
- 图像与图标：全部使用项目现有 `lucide-react` 图标，没有手绘 SVG、字符图标、CSS 图形或占位图片。
- 文案与内容：菜单只承诺已经连接的数据能力；附件说明为“加入当前对话上下文”，目标说明持续追踪，计划模式说明先分析并形成步骤。
- 交互与访问：菜单包含 `menu` / `menuitem` / `menuitemcheckbox`，模式带 `aria-checked`；左右调宽器使用 `separator`、方向、当前值和范围语义；按钮保留名称与可见焦点。

## 15. 输入框访问权限与整理菜单回归修复

- 用户问题截图：`/var/folders/nh/ytrqnycn7hx1xk7q138h1q540000gn/T/codex-clipboard-478e4d67-4160-498a-b0af-dd7efef60bc8.png`，702×916；截图中“显示已归档对话”被压成逐字竖排，并与“设置默认研究文件夹”区域重叠。
- 权限菜单证据：`output/native-composer-qa/composer-access-menu.png`，2960×1880；原生 Electron 视口 1480×940、`deviceScaleFactor=2`，显示“默认权限 / 完全访问权限”、说明文案、选中状态及安全边界。
- 整理菜单修复证据：`output/native-composer-qa/sidebar-organize-menu-fixed.png`，2960×1880；相同原生视口，菜单宽 248px，7 个操作行均为 34px，最长两项文字高度均为 16.5px，不再竖排或重叠。
- 原因与修复：旧选择器 `.menu-separator + button` 同时误命中归档操作和文件夹操作，导致不同数量的网格项套用同一个两列模板。现已为文件夹操作使用独立类，所有菜单文字包裹独立 `span` 并禁止逐字换行，长文案在异常窄宽度下使用省略而不是破坏行高。
- 权限行为：新对话缺省为“默认权限”，模型上下文明确要求本机、MCP、外部或系统操作前询问；“完全访问权限”只允许应用已经实现、用户已配置且 macOS 允许的操作，不等同管理员权限，也不绕过系统弹窗、沙箱、凭证和证据边界。
- 历史问题：此前原生验收只证明 `full` 字段能够写入和恢复，没有读取 macOS 权限；该结论不能证明系统授权，现已由第 16 节真实权限门禁取代。
- 必查表面：系统字体、12px 主文案、10px 说明、34px/52px 操作行、中性背景、弱边框和真实 Lucide 图标均保持现有 Codex 式克制风格；没有手绘图形。

## 16. macOS 真实权限中心

- 原生证据：`output/native-permission-qa/system-permission-center.png`，来自更新后的 `/Applications/学术 Agent.app`，显示辅助功能、完全磁盘访问和屏幕录制三项真实系统状态。
- 实现边界：主进程使用 Electron 官方辅助功能与屏幕录制状态接口；完全磁盘访问没有可由应用自动授予的公开 API，因此只做受保护目录的只读探测，并跳转 macOS“隐私与安全性”中的对应面板，最终授权始终由用户完成。
- 真实门禁：当前机器原生检测为辅助功能 `denied`、完全磁盘访问 `denied`、屏幕录制 `denied`，因此“启用完全访问”按钮禁用。直接绕过界面调用 `conversation.update(accessMode='full')` 被主进程明确拒绝，工作区没有写入虚假状态。
- 失效处理：已处于完全访问的对话每次启动模型请求前都会重新检测；权限被撤销时，状态降回默认权限并停止本次请求。
- 验收：类型检查、生产构建、Apple Silicon `.app` 打包、安装副本哈希一致和隔离原生只读冒烟均通过。为了不擅自更改本机隐私设置，自动验收没有点击“申请”或代替用户勾选系统开关；用户点击“完全访问权限”时会调用真实辅助功能申请接口，并在未授权时打开对应系统设置。

## 17. 项目稿件跨对话上下文

- 根因：对话页发送 `contextScope='project'`，旧实现又明确只在 scope 不是 `project` 时加入章节正文，因此新对话只能看到题目、提纲和文献，无法看到已经生成的稿件。
- 修复：所有对话范围都加入当前项目最新保存的正文；当前活动章节优先完整提供，其余非同步主稿作为跨对话共享背景加入。输入框状态文案改为“项目与稿件上下文”或“当前章节与项目上下文”。
- 边界：不同对话仍然只共享项目材料，不共享彼此的聊天历史；由父稿拆出的 `derivedFromSectionId` 同步小节不会在全稿背景中再次重复。长稿按章节和全局字符上限保留头尾并明确标注省略。
- 验收：类型检查与 `qa/conversation-context-smoke.ts` 通过；测试确认空历史的新对话仍包含已保存的“绪论”正文、版本和字数，同时不重复注入同步子节。本机当前项目只读验证同样通过：1 个已生成主章节进入项目上下文，当前活动章节标记存在。

## 18. 模型 Thinking 推理流

- 根因：提供商适配器已经产生 `reasoning-delta`，但 `ChatCoordinator` 只接受 `text-delta`，其他事件全部跳过；共享消息契约、渲染事件和持久化字段也没有推理内容。
- 修复：消息新增独立 `reasoningContent`；主进程分别累计、限长、发送并在完成、停止或错误时持久化推理流和正文流。刷新工作区时会合并已经收到的较长流，避免短暂回读覆盖前缀。
- 界面：模型真实返回推理时显示紧凑的“正在思考/思考过程”折叠块；生成期间自动展开，完成后的历史消息默认折叠，可由用户展开查看。没有推理字段时不显示占位，也不由应用补造。
- 适配范围：OpenAI 兼容接口支持 `reasoning_content` 和 `reasoning`，Anthropic 支持 `thinking_delta`。
- 验收：本地 OpenAI-compatible Mock 分别流式返回推理和正文，`qa/reasoning-stream-smoke.ts` 验证收到 31 字符 reasoning、179 字符正文且两条流没有混入。原生 Electron 安装目录应用进一步验证了生成时自动展开、完成后仍可查看；使用同一隔离工作区退出并重新启动后，推理内容、完成状态均成功恢复，历史折叠块默认收起。
- 证据：`output/native-reasoning-qa/reasoning-stream-completed.png`。该原生验收未启动 Chrome，也没有请求真实厂商 API 或消耗用户额度。

## 19. Codex 式设置工作区

- 原生 Electron 验证设置入口会完整替换研究侧栏；“返回应用”、搜索框、个人、集成、编码和已归档四组导航均存在，15 个设置入口全部可达。
- “配置”继续承载真实模型提供商、MCP 服务和本地数据页面；没有因为设置重构丢失旧能力。
- 应用快照、浏览器、电脑控制与编码类入口统一标为“计划中”，并在页面说明当前不会监听全局键盘、截屏、控制应用或修改仓库。
- 隔离工作区真实创建 1 条归档对话，经“恢复并打开”后归档数量从 1 变为 0，并返回对应研究对话；原生运行时 0 错误。
- 证据：`output/native-settings-qa/settings-general.png`、`output/native-settings-qa/settings-app-snapshot.png`、`output/native-settings-qa/settings-archived.png`。验收未启动 Chrome，未修改用户真实归档数据，也未生成新的 DMG。

## 20. 章节流式生成与文稿对话跳转

- 原生 Electron 使用本地 OpenAI-compatible 流验证章节正文持续增长：同一次生成早期为 51 字符，260ms 后为 413 字符，完成时为 778 字符；生成期间显示游标、状态、实际模型和自动展开的 Thinking。
- Thinking 与正文没有混流：生成中显示“正在思考 / Thinking 正在输出”，完成后显示“思考过程 / Thinking 已返回”。官方 DeepSeek V4 请求参数单独验证为 `thinking.type=enabled` 与 `reasoning_effort=high`，通用网关不注入该参数。
- 模拟网络流中断后，章节进入“生成失败”，界面保留 107 字符正文和已收到的 Thinking，并显示可重新生成或手工编辑的明确错误；原生运行时 0 错误。
- 从文稿页发送消息后，中心区域立即切换为“对话”，持久消息的 `contextScope` 仍为 `section`，因此切页不会丢失当前章节背景。
- 证据：`output/native-section-stream-qa/section-streaming.png`、`section-completed.png`、`section-stream-error.png`、`manuscript-message-opened-chat.png`。验收未启动 Chrome、未调用真实 DeepSeek 额度，也未修改用户真实章节。

## 21. 默认 arXiv MCP 与文稿底部视觉验收（2026-08-13）

- 原生 Electron 隔离工作区验证已生成章节编号使用浅绿色底与绿色文字；待生成章节仍保持中性白色，不混淆状态。
- 文稿滚动到底部后，文稿视图、中心滚动区和输入框托底区域的计算背景色均为 `oklch(0.975 0.002 35)`，没有截图所示的白色断层。
- 文献库来源下拉默认值为 `mcp:builtin-arxiv-mcp:search_papers`，用户可见标签为“arXiv MCP（默认）”，同时保留 OpenAlex + Crossref。
- 原生运行时错误为 0；没有启动 Chrome，也没有修改用户真实项目。
- 证据：`output/native-arxiv-manuscript-polish/manuscript-bottom-and-green-outline.png`、`output/native-arxiv-manuscript-polish/library-default-arxiv-mcp.png`。

## 22. Codex 式外观设置原生验收（2026-08-13）

- 参考用户提供的 Codex 外观页，原生 Electron 安装结构下验证系统/浅色/深色三张主题卡、双调色板、主题预设、导入/复制、字体、半透明侧栏与对比度；控件完整且页面可独立滚动。
- 深色自定义主题实际计算背景为 `rgb(24, 23, 22)`，浅色自定义主题为 `rgb(255, 250, 243)`；字体、指针、动态效果、字号和字体平滑均在应用根节点真实生效。
- 底部偏好项包含 2 个 Dock 图标、3 种减少动态模式、12–20px 字号、2 种差异标记和字体平滑；没有以“计划中”按钮冒充完成。
- 关闭并重新启动隔离的原生应用后，主题、字号、差异模式、指针、字体平滑、背景和字体均恢复。
- 文稿编辑真实增加一行后，`+/-` 模式显示 `+` 标记且不依赖颜色背景；不是设置页演示状态。
- 主题复制结果只含 `version/palettes/uiFont/translucentSidebar/contrast`；非法颜色和未知字段会被拒绝，个人偏好不会被主题导入覆盖。
- 证据：`output/native-appearance-qa/appearance-system.png`、`appearance-dark-custom.png`、`appearance-light-custom.png`、`appearance-preferences-bottom.png`、`appearance-real-manuscript-diff.png`。
- 边界：原生文件选择框的人工选择/取消未单独自动化；主进程文件选择、64KB 上限、严格解析和受限 IPC 已通过代码与运行检查。本轮未生成新 DMG。

## 23. 输入框“/”能力选择器原生验收（2026-08-13）

- 在原生 Electron 隔离工作区输入 `/`，菜单稳定显示在输入框上方，没有遮挡工具栏或超出 940px 高的窗口。
- 菜单按 `Skills / MCP 服务` 分组，只显示应用内已启用能力；实测包含“论证链检查”和内置 arXiv MCP，MCP 行显示真实已发现工具数量与连接状态。
- Enter 键可选择当前项，继续输入 `/arxiv` 能实时过滤并添加 MCP；选择后 slash 查询被清理，菜单关闭且生成两个独立可移除标签。
- 重复选择同一 Skill 后标签数量仍为 2，去重生效；原生运行时错误为 0。
- 后端上下文冒烟确认 Skill 指令、MCP 工具名和“没有工具执行结果”的安全边界均进入系统上下文。
- 证据：`output/native-slash-menu-qa/slash-menu-groups.png`、`slash-selected-chips.png`。
- 边界：本轮没有实际发起模型请求或 MCP 工具调用；验收证明的是能力选择、持久引用和上下文注入，不把能力发现冒充外部执行。

## 24. Slash MCP 逐工具与真实执行验收（2026-08-13）

- 第 23 节的“MCP 服务”粗粒度菜单已被本轮逐工具交互取代；旧截图仅作为历史证据，不代表当前界面。
- 原生 Electron 隔离工作区中，`/` 菜单按 `Skills / MCP 工具` 分组，直接展示 `/search_papers`、`/download_paper`、`/list_papers`、`/read_paper`、`/get_abstract` 等实际发现工具。
- 选中 `/search_papers` 后生成“`/search_papers · arXiv MCP（内置）`”标签，Slash 查询被清理，输入框显示检索词参数提示。重复选择去重，原生运行时错误为 0。
- 菜单位于 1480×940 原生视口内，计算区域为 `x=279, y=352, width=738, height=430`，未越界或遮挡输入框工具栏。
- 证据：`output/native-slash-tool-qa/slash-menu-groups.png`、`output/native-slash-tool-qa/slash-selected-chips.png`。
- 真实链路：在隔离的打包 `.app` 中发送 `/search_papers ti:\"retrieval augmented generation\"`，arXiv MCP 成功返回 5 篇论文，过程页生成已完成的 `MCP · search_papers` 步骤，DeepSeek 基于真实结果完成回复。
- 审计证据：运行步骤保存 `mcp-tool` 证据、结果 SHA-256 `f341d16049a6d3f3c38a955306bbaa004d5282ce696afe1b3d3536176758c250`、10,717 字符有界结果且 `truncated=false`。验收使用隔离数据目录，未污染用户正式项目。
- 安全边界：外部返回以 BEGIN/END 不可信 JSON 区块注入；普通自然语言仍不会自动调用 MCP，只有菜单显式选择或 `/工具名` 命令才执行。

## 25. 章节历史版本与重新生成原生验收（2026-08-13）

- 在隔离的打包 `.app` 中连续保存同一章节两次，工作区真实形成第 2、3 版；顶部显示“第 3 版 · 保存时间”和无需确认的“重新生成”。
- 版本菜单共显示 3 条记录，每条均包含连续编号、生成/保存状态和有效 `<time dateTime>`；当前版使用中性选中背景与绿色勾选，不使用突兀品牌色高亮。
- 点击第 2 版后，主进程 `activeGenerationVersionId` 切换到对应版本，正文出现第 2 版唯一标记且不再包含第 3 版标记；刷新与项目上下文将继续读取该当前稿。
- 退出隔离应用并使用同一数据目录重新启动后，第 2 版指针、正文唯一标记、草稿状态和字数均恢复，版本选择不是临时界面状态。
- 菜单、正文切换、Toast、输入框与三栏布局同时可见；菜单未遮挡重新生成按钮或正文主要阅读区域，原生运行时错误为 0。
- 仓储回归覆盖旧章节迁移、重新生成不清旧稿、重复生成拒绝、新版本提交、旧版切回、手工保存新版本与项目删除级联；章节同步和项目上下文回归继续通过。
- 最终打包副本证据：`output/native-section-version-qa-final/section-version-menu.png`、`output/native-section-version-qa-final/section-version-restored-body.png`。
- 边界：本轮用本机隔离副本和手工保存构造版本，没有再次调用真实模型；模型重新生成使用既有流式链路，版本提交与错误分支由仓储冒烟验证。

## 26. arXiv 中文检索与本轮工具结果原生验收（2026-08-13）

- 在隔离的最终打包 `.app` 中发送中文 Slash 请求“`/paper_search 帮我搜索5篇与此标题强相关的内容`”；应用结合当前研究背景生成英文 arXiv 布尔检索式，没有把中文自然语言指令原样交给上游。
- 实际执行参数为 `("generative AI" OR "generative artificial intelligence") AND "higher education" AND "mechanism" AND "teaching"`、`max_results=5`，真实返回 3 篇论文，运行步骤为已完成的 `MCP · search_papers`。
- DeepSeek 明确说明本轮工具已由主进程真实执行，逐篇列出实际返回论文标题和 arXiv ID；不再出现“没有本轮真实返回”“请改用英文后再试”等错误判断。
- 工具步骤证据保存实际英文参数、3 篇结果、SHA-256 `dc78ebb0b47cc0cdca0b49eac9d26e64875396257c68a8b818b5407245ef064b`，`truncated=false`；运行时错误为 0。
- 证据：`output/native-arxiv-chinese-query-final/arxiv-chinese-query-completed.png`。最终 `/Applications/学术 Agent.app` 与打包产物的 `app.asar` SHA-256 均为 `f59e66132dd8c50e1f6a312c0b867bbbad3f465e7aa2ff40c728291c6e716ffb`，安装副本已经重新启动。
- 边界：中文意图会转换为英文查询并最多自动放宽 3 次，但 arXiv 的学科覆盖和命中数量仍由真实上游决定；普通自然语言不会在未显式选择工具时自动调用 MCP。

## 27. 消息内添加文献与右栏即时显示验收（2026-08-14）

- 视觉目标为用户截图中的 GPT 式文字超链接：最终实现只有标题、轻分隔线和下划线文字操作，没有卡片底色、胶囊、阴影或按钮圆角；原生计算样式确认操作圆角数量为 0。
- 真实 arXiv MCP 本轮返回 2 篇论文，助手消息下方显示“本轮检索论文 / 全部添加”，每篇分别显示“添加到文献栏”；标题、作者、年份与 arXiv 来源保持紧凑层级。
- 点击第一篇后，消息原位变为绿色“已添加”，第二篇继续保留文字链接；右侧文献标签自动打开，文献总数从 2 增至 3，并显示新增真实论文标题。
- 主进程仓储冒烟确认：重复添加返回同一记录、伪造候选 ID 被拒绝、批量添加和重启持久化通过；跨项目已纳入文献不再进入当前项目右栏或误标当前消息。
- 最终打包副本证据：`output/native-message-literature-add-final/message-literature-actions-final.png`；真实工具/模型执行截图：`output/native-message-literature-add/arxiv-chinese-query-completed.png`。原生运行时错误为 0。
- 最终 `/Applications/学术 Agent.app` 与打包产物的 `app.asar` SHA-256 均为 `54d0e485738bfb20f124a657173702b0a915fd33497319c760b1f3e9681e4b64`，安装副本已使用新进程重新启动。

## 28. 正式工作区版本一致性与历史文献回填验收（2026-08-14）

- 此前第 27 节证明了隔离工作区中“本轮 MCP 返回”的添加链路，但不能证明用户正式工作区中“沿用此前检索”的旧回复已经显示操作；本节补齐该证据边界。
- 正式工作区“绪论”当前 `section.version=5`、活动历史快照 `number=1`。最终安装版右侧大纲显示“草稿 · 2,292 字 · 第 1 版”，与中央文稿顶部“第 1 版”一致，没有再显示错误的第 5 版。
- 正式工作区两条旧回复均从同项目、成功且未截断的 MCP 审计证据中精确回填 5 个 arXiv ID；正文中的占位符“arXiv编号”没有被迁移。
- 最终安装版在用户截图对应回复下真实显示 5 条无圆角“添加到文献栏”和“全部添加”；原生计算样式确认圆角操作数量为 0。
- 在正式数据副本的隔离目录点击“全部添加”后，5 条操作全部变为“已添加”，右侧文献栏即时从 2 条增加到 7 条并展示新增论文；正式工作区未因点击验收被写入这些记录。
- 证据：`output/native-outline-version-consistency-final/outline-version-consistency-final.png`、`output/native-message-literature-backfill-final/message-literature-actions-final.png`、`output/native-message-literature-backfill-add-final/message-literature-actions-final.png`。
- 类型检查、消息文献仓储回归、章节版本回归和生产构建均通过；最终安装副本与构建产物 `app.asar` SHA-256 均为 `27eca4f28b35942f757ce23eb2ee25a75d7049510ae62c188d0f78aa35428060`，Dock 路径应用已重新启动。

## 29. 文献项目分类与可用性边界原生验收（2026-08-14）

- 最终安装版文献库提供“全部文献”和 2 个现有研究项目分类；项目视图只显示本项目记录，全部视图的每张卡片明确展示所属项目或“未分类”。
- 在原生 Electron 中选取真实项目文献，完整执行“纳入项目 → 取消纳入 → 移出项目”；移出后记录从项目分类消失，并在“全部文献”中以“未分类”保留，没有删除文献数据。
- 详情页显示文献真实所属项目，并把抽象的“无法判断”改为明确证据边界：当前只核验来源元数据、摘要、原始来源链接和引用映射；缺少可核对全文时不会自动声称文献支持正文主张。
- 项目分类、状态分段、搜索来源和项目归属标签在 1480×940 原生窗口内无重叠；右侧详情、卡片操作和搜索区保持现有紧凑设计语言。
- 原生验收运行时错误和警告均为 0；证据：`output/native-literature-project-final/literature-current-project.png`、`output/native-literature-project-final/literature-unclassified-detail.png`。
- 用户截图与最终界面已并排检查：`output/native-literature-project-final/reference-vs-final.png`。最终安装副本与构建产物 `app.asar` SHA-256 均为 `494b84b20b6639901e3488ff17a255c4f44f95eb99dfe5f409f70d888a1b092f`。

## 30. 文献永久删除原生验收（2026-08-14）

- 文献卡片同时显示“移出项目”和红色文字“删除”：前者保留全局记录，后者进入不可撤销确认，两种语义清晰分离。
- 演示文献可以打开真实确认框；确认框明确展示将删除的本机数据、不会影响的在线论文和导出文件，以及被正文引用时会阻止删除的边界。
- 在隔离的最终打包 `.app` 中永久删除演示文献“演示：生成式人工智能与高等教育研究综述”，删除后工作区和“全部文献”页面均不再包含该记录。
- 确认框、卡片操作、右侧详情和背景遮罩在 1480×940 原生窗口内无重叠或裁切；运行时错误为 0。
- 证据：`output/native-literature-delete-final/literature-delete-confirm.png`、`output/native-literature-delete-final/literature-demo-deleted.png`。最终安装副本与构建产物 `app.asar` SHA-256 均为 `ec5ffa992bc1e80352ca45029c67da73f81f432f75e0611be616c319269d4d19`。

## 31. 语音输入原生验收与网络错误修复（2026-08-15）

- 最终打包 Electron 输入框在模型选择器与发送按钮之间显示 32px 中性圆形麦克风按钮；空闲态可访问名称为“开始语音输入”，没有使用品牌色抢占输入框焦点。
- “设置 → 语音输入”显示麦克风权限、macOS 原生语音识别、简体中文 `zh-CN`、请求权限、重新检查和打开系统设置；1480×940 原生窗口内没有重叠、裁切或竖排文案。
- 旧版虽存在 `webkitSpeechRecognition` 构造器，但用户真实使用返回 `network`，证明“构造器存在”不等于桌面服务可用；旧链路已经移除，历史截图只证明界面，不再作为功能证据。
- 新版随 `.app` 打包独立的 Speech + AVFAudio 原生组件，状态检查真实返回 `available=true`、`onDevice=true`、`locale=zh-CN`、`authorization=not-determined`；系统支持时要求本机识别。
- 新版原生桥接与设置页证据：`output/native-voice-status-final/voice-input-composer.png`、`output/native-voice-status-final/voice-input-settings.png`、`output/native-voice-status-final/summary.json`。
- Info.plist 包含中文 `NSMicrophoneUsageDescription` 与 `NSSpeechRecognitionUsageDescription`；媒体权限只允许可信主窗口音频请求，并拒绝摄像头和非可信页面。
- 证据：`desktop/output/voice-input/voice-input-composer.png`、`desktop/output/voice-input/voice-input-settings.png`、`desktop/output/voice-input/summary.json`。
- 类型检查、生产构建和 `.app` 打包通过；打包与安装副本均包含可执行的原生语音组件及两项用途说明。最终 `/Applications/学术 Agent.app` 与构建产物 `app.asar` SHA-256 均为 `503e9d755ed7af3ed64a60be74e637abbc85559f0f7864af4e53c8f3f7868a3d`，安装副本已重新启动并启用 renderer 沙箱。
- 边界：本机 Speech 授权尚未在 macOS 弹窗中确认，因此真实说话转写需要用户首次点击新版麦克风后选择允许并人工确认；本轮验证原生编译、状态、桥接、打包资源和安装一致性，不把未进行的口述测试写成通过。

## 32. 专业感知三级大纲原生验收（2026-08-15）

- 使用最终打包的 Apple Silicon `.app` 和隔离 `user-data-dir`，不读取或修改用户正式工作区。
- 真实创建题目“生成式人工智能赋能高校教学的作用机制研究”，通过正式 `outline:save` IPC 保存 4 章、8 节、16 目的三级大纲；重启后结构架构与质量报告仍可读取。
- 主进程识别为“教育 × 管理 / 经济”交叉专业和“政策 / 管理研究”结构，匹配度 88%；因项目明确没有问卷、访谈或实验数据，未生成实证结果结构。
- 右侧摘要收起态保持紧凑；展开态使用两列信息、置信度进度和质量状态，在 320–620px 工作台宽度内没有竖排、遮挡或裁切。
- 证据：`output/native-outline-architecture-final/outline-architecture-summary.png`、`output/native-outline-architecture-final/outline-architecture-details.png`、`output/native-outline-architecture-final/outline-architecture-summary.json`。
- 最终 `/Applications/学术 Agent.app` 与打包产物的 `app.asar` SHA-256 均为 `0dd9dcdcc06bc6a9c8d44d76f7a56b6e4bd3f0c7dab7b32d6b41d42102bc71e1`，安装副本已使用新进程重新启动。
- 边界：该原生大纲为验收脚本提供的合规结构，用来验证分类、IPC、持久化、质量检查和 UI；没有冒充真实模型生成。8 个固定题目的真实模型目录盲评仍未验证。

## 33. 结构重构后的原生视觉与交互回归（2026-08-21 至 2026-08-22）

- 两轮均为纯代码结构拆分，不改变视觉稿、DOM class、ARIA、菜单文案、键盘行为或用户流程。
- 后端/后备层拆分后，隔离安装版完成 21 项正常态/菜单态/设置态/对话框/三栏交互检查，以及 4 项退出重启恢复；均为 0 失败、0 运行时错误。证据：`output/native-structure-refactor-final/`。
- 前端 hooks、Sidebar、Composer 和论文上下文拆分后，再次执行同一组 21 + 4 项原生回归；均为 0 失败、0 运行时错误。证据：`output/native-frontend-refactor-final/`。
- 两轮验证均使用隔离 `user-data-dir`，不修改用户正式项目；没有调用真实模型。重构后的安装副本已分别完成 `app.asar` 哈希一致性检查和新进程启动。
- 结论：本轮证明结构拆分没有造成已覆盖界面的视觉与交互回归，不代表新增功能或论文生成质量提升。

final result: passed
