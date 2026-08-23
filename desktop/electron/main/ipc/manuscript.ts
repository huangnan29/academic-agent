import { IPC } from '../../../shared/ipc'
import {
  analyzeOutlineArchitecture,
  runOutlineQualityChecks,
} from '../../services/pipeline'
import {
  outlineGenerateSchema,
  outlineSchema,
  sectionGenerateSchema,
  sectionGenerationPreviewSchema,
} from '../schemas'
import { assertId, assertOutlineBounds, sanitizeOutlineNode } from './common'
import { handle } from './runtime'
import type { IpcDependencies, RegisterIpcHandler } from './types'

export function registerManuscriptHandlers(
  dependencies: IpcDependencies,
  register: RegisterIpcHandler = handle,
): void {
  const { repository, paper } = dependencies

  register(IPC.outlineGenerate, async (_event, payload: unknown) => {
    return paper.generateOutline(outlineGenerateSchema.parse(payload))
  })

  // 预留接口：主进程链路（schema 校验、边界检查、持久化）已完整，等待提纲可视化编辑器接入；
  // 当前仅由 qa/native 下的 CDP 冒烟脚本调用验证，渲染层 UI 尚无调用方。
  register(IPC.outlineSave, async (_event, projectId: unknown, payload: unknown) => {
    assertId(projectId, '项目')
    const outline = outlineSchema.parse(payload)
    assertOutlineBounds(outline)
    const state = repository.snapshot()
    const project = state.projects.find((item) => item.id === projectId)
    if (!project) throw new Error('项目不存在或已经被移除。')
    const projectLiterature = state.literature.filter(
      (item) => item.projectId === projectId && item.included && item.origin !== 'demo',
    )
    const allowedCitationIds = new Set(
      projectLiterature.map((item) => item.id),
    )
    const sanitized = outline.map((node) => sanitizeOutlineNode(node, allowedCitationIds))
    const architecture = state.outlineArchitectures?.[projectId] ?? {
      ...analyzeOutlineArchitecture(project.brief, projectLiterature),
      projectId,
    }
    const quality = runOutlineQualityChecks(sanitized, {
      brief: project.brief,
      architecture,
      allowedCitationIds,
    })
    await repository.saveOutline(projectId, sanitized, architecture, quality)
    await repository.createSectionsFromOutline(projectId, sanitized)
    return sanitized
  })

  register(IPC.sectionGenerate, async (event, payload: unknown) => {
    await paper.generateSection(sectionGenerateSchema.parse(payload), event.sender)
  })

  register(IPC.sectionPreviewGeneration, async (_event, payload: unknown) => {
    return paper.previewSectionGeneration(sectionGenerationPreviewSchema.parse(payload))
  })

  register(IPC.sectionSave, async (_event, sectionId: unknown, content: unknown) => {
    assertId(sectionId, '章节')
    if (typeof content !== 'string' || content.length > 2_000_000) {
      throw new Error('章节内容无效或过长。')
    }
    await repository.saveSection(sectionId, content)
  })

  register(IPC.sectionSetActive, async (_event, sectionId: unknown) => {
    assertId(sectionId, '章节')
    return repository.setActiveSection(sectionId)
  })

  register(IPC.sectionSelectVersion, async (_event, sectionId: unknown, versionId: unknown) => {
    assertId(sectionId, '章节')
    assertId(versionId, '章节版本')
    return repository.selectSectionVersion(sectionId, versionId)
  })
}
