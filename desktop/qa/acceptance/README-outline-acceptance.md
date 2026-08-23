# 三级大纲固定题目验收

本目录新增的验收入口只服务“三级大纲架构优化”阶段。它不修改工作区、不写入项目数据、不访问 `aiwritepaper.com` 范文，也不会把题目基线中的 `qa-ref-*` 当成真实文献。

## 固定题目集

`outline-acceptance-baseline.json` 共 8 题，覆盖：

- 文学：作品叙事与伦理阐释。
- 理学：有实验数据的材料性能研究、无实测数据的理论模型分析。
- 工学：软件系统设计与实现。
- 法学：典型案例与裁判规则。
- 设计：老年用户交互设计，明确没有真实用户测试。
- 教育/管理：跨学科作用机制研究，明确没有问卷、访谈、实验或行政数据。
- 法学/工学：跨学科算法责任与证据规则，要求给出备选结构或用户选择信号。

每题同时声明专业类别、研究方向、研究动作、证据可用性、允许结构模式、三级语义锚点和无数据边界。固定题目不会提供伪造实验数值、样本量、统计结果、案件编号、DOI 或页码。

## 最终 pipeline 适配契约

`outline-pipeline-adapter.mjs` 和验收脚本默认寻找以下导出：

```text
classifyResearchBrief(brief, { evidence, literature })
runOutlineQualityChecks(outline, {
  brief,
  architecture,
  evidence,
  allowedCitationIds,
})
```

分类结果至少应包含：

```text
{
  disciplineFamily,
  researchDirection,
  researchAction,
  pattern,
  confidence,
  alternatives,
  rationale,
  researchQuestions,
  narrativeFlow,
}
```

质量结果至少应包含：

```text
{
  passed: boolean,
  issues: Array<{ code, severity, message }>,
  metrics: object,
}
```

质量函数需要识别的稳定问题代码已经写入基线的 `adapterContract.qualityIssueCodes`，包括三级层级不完整、字数预算不闭合、重复标题、引用 ID 越权、无数据结果章节和结构模式不匹配。

如果最终 pipeline 使用对象参数，可运行时传入 `--call-style object`；如果导出名不同，可用 `--classifier`、`--quality` 和 `--generator` 指定。推荐保留默认导出名，避免验收脚本与业务代码产生额外耦合。

## 调用方式

只检查分类（没有生成大纲输入时，质量部分会明确标记“未验证”）：

```text
node desktop/qa/acceptance/outline-acceptance.mjs \
  --pipeline desktop/dist-electron/services/pipeline/index.js
```

对已经保存的生成结果做完整检查：

```text
node desktop/qa/acceptance/outline-acceptance.mjs \
  --pipeline desktop/dist-electron/services/pipeline/index.js \
  --outlines /path/to/outline-results.json
```

`--outlines` 可以是以下任一形状：

```json
{
  "literature-narrative": [{"id": "...", "title": "...", "level": 1, "children": []}]
}
```

或：

```json
[
  {"caseId": "literature-narrative", "outline": [{"id": "...", "title": "...", "level": 1, "children": []}]}
]
```

只有在明确希望验收脚本触发模型生成时，才增加 `--generate`；这要求 pipeline 另行导出可选的 `generateOutline(brief, { architecture, evidence, literature })`。默认不主动触发模型，避免把“分类接口通过”误报为“真实大纲生成通过”。

## 验收范围和退出状态

脚本会逐题检查：

1. 结构模式是否符合专业类别、研究方向、研究动作和数据条件。
2. 跨学科题目是否保留备选结构或需要用户选择的标记。
3. 主要正文是否存在三级论证节点，且标题命中该方向的语义锚点。
4. 一级、二级、三级字数预算是否闭合（由最终质量 API 判定）。
5. 标题是否重复或以近义标题凑数量（由最终质量 API 判定）。
6. `citationIds` 是否全部属于本次传入的白名单（由最终质量 API 判定）。
7. 无真实数据时是否出现样本、问卷、统计、回归、显著性、实测性能或其他结果承诺。

退出状态：

- `0`：固定题目分类和已提供的大纲质量均通过。
- `1`：至少一项确定失败，或 pipeline 导出不符合适配契约。
- `2`：分类已执行但至少一个题目没有大纲输入，或结果缺少必须的验收证据；这是“未验证”，不是通过。

## 当前边界

本轮只新增 `desktop/qa/` 下的基线、适配器、验收脚本和说明。最终分类/质量函数仍由 pipeline 实现；在它们尚未导出前，运行脚本会如实报告适配契约阻塞，不以占位结果代替验收。
