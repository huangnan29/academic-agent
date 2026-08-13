import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { WorkspaceState } from '../shared/contracts'
import { buildDocxBuffer } from '../electron/services/export/docx'
import { buildMarkdown } from '../electron/services/export/markdown'

async function main() {
  const [workspaceInput, projectId, outputInput] = process.argv.slice(2)
  if (!workspaceInput || !projectId || !outputInput) {
    throw new Error(
      '用法：npx tsx qa/export-smoke.ts <workspace.json> <projectId> <输出目录>',
    )
  }

  const workspacePath = resolve(workspaceInput)
  const outputDirectory = resolve(outputInput)
  const rawWorkspace = await readFile(workspacePath, 'utf8')
  const state = JSON.parse(rawWorkspace) as WorkspaceState
  const project = state.projects?.find((item) => item.id === projectId)
  if (!project) throw new Error(`工作区中不存在项目：${projectId}`)

  // 使用安全文件名，避免项目标题中的路径字符影响输出位置。
  const outputStem = safeFilename(project.title || projectId)
  const markdownPath = resolve(outputDirectory, `${outputStem}.md`)
  const docxPath = resolve(outputDirectory, `${outputStem}.docx`)

  await mkdir(outputDirectory, { recursive: true })

  // 直接调用正式导出实现，确保冒烟脚本覆盖真实 Markdown 与 DOCX 生成链路。
  const markdown = buildMarkdown(state, projectId)
  const docx = await buildDocxBuffer(state, projectId)
  await Promise.all([
    writeFile(markdownPath, markdown, 'utf8'),
    writeFile(docxPath, docx),
  ])

  const [markdownStat, docxStat] = await Promise.all([
    stat(markdownPath),
    stat(docxPath),
  ])
  console.log(`Markdown\t${markdownPath}\t${markdownStat.size} 字节`)
  console.log(`DOCX\t${docxPath}\t${docxStat.size} 字节`)
}

function safeFilename(value: string): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
  return cleaned || '学术-Agent-导出验收'
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`导出冒烟失败：${message}`)
  process.exitCode = 1
})
