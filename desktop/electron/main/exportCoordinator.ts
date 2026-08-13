import { randomUUID } from 'node:crypto'
import { stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, dialog, shell } from 'electron'
import type { AgentRun, Artifact, ExportFormat } from '../../shared/contracts'
import { buildMarkdown, exportDocx } from '../services/export'
import { runProjectQualityChecks } from '../services/pipeline'
import { WorkspaceRepository } from '../services/storage/workspaceRepository'

const now = () => new Date().toISOString()

export class ExportCoordinator {
  constructor(private readonly repository: WorkspaceRepository) {}

  async exportProject(
    projectId: string,
    format: ExportFormat,
    parent?: BrowserWindow,
  ): Promise<Artifact | null> {
    const state = this.repository.snapshot()
    const project = state.projects.find((item) => item.id === projectId)
    if (!project) throw new Error('项目不存在。')
    const run = createExportRun(projectId, format)
    await this.repository.saveRun(run)
    const quality = runProjectQualityChecks(state, projectId)
    const extension = format === 'docx' ? 'docx' : 'md'
    const defaultName = `${safeFilename(project.title)}.${extension}`
    const options = {
      title: `导出 ${format.toUpperCase()} 文稿`,
      defaultPath: project.researchFolderPath
        ? join(project.researchFolderPath, defaultName)
        : defaultName,
      filters:
        format === 'docx'
          ? [{ name: 'Word 文档', extensions: ['docx'] }]
          : [{ name: 'Markdown 文档', extensions: ['md'] }],
    }
    try {
      const result = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) {
        await this.repository.updateRun(run.id, {
          status: 'cancelled',
          steps: [
            qualityStep(run, quality),
            { ...run.steps[1], detail: '用户已取消导出', status: 'stopped', completedAt: now() },
          ],
        })
        return null
      }

      const content = format === 'docx' ? await exportDocx(state, projectId) : buildMarkdown(state, projectId)
      await writeFile(result.filePath, content)
      const metadata = await stat(result.filePath)
      const timestamp = now()
      const artifact: Artifact = {
        id: randomUUID(),
        projectId,
        name: result.filePath.split('/').at(-1) ?? defaultName,
        format,
        path: result.filePath,
        size: metadata.size,
        origin: 'live',
        // 启发式质量检查不等于学术内容已经核验。
        verificationStatus: 'unverified',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      const saved = await this.repository.saveArtifact(artifact)
      await this.repository.updateRun(run.id, {
        status: 'completed',
        verificationStatus: 'unverified',
        steps: [
          qualityStep(run, quality),
          {
            ...run.steps[1],
            detail: `已写入 ${saved.name}（${saved.size} 字节）`,
            status: 'completed',
            startedAt: timestamp,
            completedAt: timestamp,
          },
        ],
      })
      return saved
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出失败。'
      await this.repository.updateRun(run.id, {
        status: 'error',
        error: message,
        steps: [
          qualityStep(run, quality),
          { ...run.steps[1], detail: message, status: 'error', completedAt: now() },
        ],
      })
      throw error
    }
  }

  reveal(path: string): void {
    const allowed = this.repository.snapshot().artifacts.some((artifact) => artifact.path === path)
    if (!allowed) throw new Error('只能定位由当前应用生成的文件。')
    shell.showItemInFolder(path)
  }
}

function createExportRun(projectId: string, format: ExportFormat): AgentRun {
  const timestamp = now()
  return {
    id: randomUUID(),
    projectId,
    kind: 'export',
    status: 'running',
    steps: [
      {
        id: randomUUID(),
        label: '检查文稿质量',
        detail: '正在检查篇幅、引用映射、占位符与重复段落',
        status: 'running',
        startedAt: timestamp,
      },
      {
        id: randomUUID(),
        label: `导出 ${format.toUpperCase()}`,
        detail: '等待选择保存位置',
        status: 'pending',
      },
    ],
    origin: 'live',
    verificationStatus: 'unverified',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function qualityStep(
  run: AgentRun,
  quality: ReturnType<typeof runProjectQualityChecks>,
): AgentRun['steps'][number] {
  const completedAt = now()
  return {
    ...run.steps[0],
    detail: quality.issues.length
      ? `发现 ${quality.issues.length} 项需复核问题；导出文件会保留引用警告`
      : `检查完成：${quality.metrics.wordCount} 字/词，${quality.metrics.citationCount} 个引用标记`,
    status: quality.issues.length ? 'warning' : 'completed',
    completedAt,
  }
}

function safeFilename(value: string): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
  return cleaned || '学术-Agent-论文'
}
