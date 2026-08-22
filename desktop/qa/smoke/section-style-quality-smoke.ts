import assert from 'node:assert/strict'
import {
  runCrossSectionQualityChecks,
  runQualityChecks,
  runSectionQualityChecks,
} from '../../electron/services/pipeline'

const longParagraph = '本段用于验证同一项目主稿之间的跨章节重复检查，内容保持足够长度以排除短句误报，并且应该只保留在一个章节中。'.repeat(4)

function main() {
  const styleContent = [
    '本文旨在说明研究问题，随着技术不断发展，相关议题受到广泛关注。',
    '',
    '本文旨在说明研究问题，随着技术不断发展，相关议题具有重要意义。',
    '',
    '本文旨在说明研究问题，由此可见当前讨论仍需补充证据。',
    '',
    '本文旨在说明研究问题，需要指出的是本节仍应回到研究对象。',
    '',
    '研究对象分析结论句一保持相近长度并完成必要说明。研究对象分析结论句二保持相近长度并完成必要说明。研究对象分析结论句三保持相近长度并完成必要说明。研究对象分析结论句四保持相近长度并完成必要说明。研究对象分析结论句五保持相近长度并完成必要说明。研究对象分析结论句六保持相近长度并完成必要说明。',
  ].join('\n')
  const report = runQualityChecks(styleContent, { language: 'zh-CN' })
  const styleCodes = new Set(report.issues.map((issue) => issue.code))
  assert.equal(report.passed, true, '风格 warning 不应改变原有 passed 语义')
  assert.ok(styleCodes.has('BOILERPLATE_DENSITY'), '应检测套话/空泛短语密度')
  assert.ok(styleCodes.has('REPEATED_PARAGRAPH_OPENING'), '应检测重复段落开头')
  assert.ok(styleCodes.has('UNIFORM_SENTENCE_LENGTH'), '应检测句式长度过度统一')

  const sectionReport = runSectionQualityChecks(
    '本文说明系统设计方案。系统设计方案需要在测试边界内完成验证。',
    {
      sectionId: 'section-method',
      projectId: 'project-smoke',
      sectionTitle: '方法与设计',
      profile: 'method-design',
      keyClaims: ['系统设计方案能够支持可复现测试', '测试边界需要明确记录'],
      evidenceNeeds: ['literature'],
    },
  )
  const sectionCodes = new Set(sectionReport.issues.map((issue) => issue.code))
  assert.ok(sectionCodes.has('SECTION_RESPONSIBILITY_GAP'), '应提示章节职责覆盖不足')
  assert.ok(sectionCodes.has('CLAIM_EVIDENCE_COVERAGE'), '应提示主张—证据覆盖不足')
  assert.equal(sectionReport.issues.every((issue) => issue.severity === 'warning'), true)

  const crossSectionReport = runCrossSectionQualityChecks([
    { id: 'chapter-a', projectId: 'project-smoke', title: '第一章', content: longParagraph },
    { id: 'chapter-b', projectId: 'project-smoke', title: '第二章', content: longParagraph },
    {
      id: 'derived-b',
      projectId: 'project-smoke',
      title: '第二章同步小节',
      content: longParagraph,
      derivedFromSectionId: 'chapter-b',
    },
    { id: 'other-project', projectId: 'other-project', title: '其他项目', content: longParagraph },
  ])
  assert.equal(crossSectionReport.filter((issue) => issue.code === 'CROSS_SECTION_DUPLICATE').length, 1, '只应比较同项目主稿，并排除 derived')

  process.stdout.write('章节风格与质量检查冒烟验收：通过\n')
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : '未知错误'
  process.stderr.write(`章节风格与质量检查冒烟验收失败：${message}\n`)
  process.exitCode = 1
}
