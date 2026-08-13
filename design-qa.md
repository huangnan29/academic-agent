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
- 最终同画布复验未发现仍需修复的 P0/P1/P2；参考图中的“创建永久工作树、编辑项目、归档聊天”属于 Codex 自身功能，并非本轮用户列出的学术 Agent 需求，没有添加无后端能力的占位菜单。

### 12.3 功能与持久化证据

- 项目独立展开、收起、再次展开通过；状态由 `sidebarExpandedProjectIds` 持久化，不再随当前项目强制展开。
- 在真实项目中通过项目行按钮新建第二条对话，对话数由 1 变为 2；新对话立即成为活动对话，随后成功切回原对话。
- 通过项目菜单完成置顶和取消置顶；菜单文案随状态在“置顶项目 / 取消置顶项目”之间变化，最终恢复原状态。
- 通过整理菜单往返“按项目 / 在一个列表中”；依次切换优先级、最近更新、手动排序，工作区设置与可见列表同步。
- 手动模式下项目行和对话行均具备可拖动状态，顺序通过同一侧栏偏好接口持久化。
- 在临时验收工作区中退出并重新启动应用后，第二条对话、项目布局、手动排序和项目展开状态均恢复；重启持久化检查通过。
- 验收脚本：`desktop/qa/cdp-sidebar-smoke.mjs`。验收前备份 `workspace.json`，结束后恢复原文件并以正常模式重启应用，未在用户工作区留下临时对话或排序状态。

### 12.4 必查表面

- 字体与文案：沿用 macOS 系统字体；项目标题、对话标题、菜单分组和计数层级与 Codex 参考一致，长标题继续省略而不挤压图标。
- 间距与布局：项目行 34px，对话行 34px；独立折叠箭头、16px 文件夹、项目内新建对话和更多操作保持稳定网格。
- 颜色与 token：使用现有浅灰悬停/选中表面、弱边框和危险删除色，没有复制参考图中的红色标注框。
- 图像与图标：全部使用现有 `lucide-react` 图标库，没有手绘 SVG、字符图标或占位资源。
- 交互与可访问性：菜单包含 `menu`、`menuitem`、`menuitemradio`、`aria-checked`，支持 Esc、上下方向键和可见焦点；项目展开使用 `aria-expanded`。
- 原生边界：类型检查、生产构建、Apple Silicon `.app` 打包和安装副本交互通过；本轮没有启动 Chrome，也没有生成新的 DMG。

final result: passed
