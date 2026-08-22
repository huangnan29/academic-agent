import type {
  ManuscriptSection,
  OutlineArchitecture,
  OutlineNode,
  OutlineQualityReport,
  WorkspaceState,
} from '../../../shared/contracts'
import {
  createLiveEntityBase,
  createSectionVersion,
  now,
  preserveCurrentSectionVersion,
  preserveProjectSectionVersions,
  recordSynchronizedSectionVersions,
  synchronizeActiveModelSelection,
} from './workspace-state'
import {
  saveSectionContentInState,
  synchronizeDerivedSections,
} from '../../../shared/sectionContent'

export function saveOutline(state: WorkspaceState, projectId: string, outline: OutlineNode[], architecture?: OutlineArchitecture, qualityReport?: OutlineQualityReport): OutlineNode[] {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在或已经被移除。')
      state.outlines[projectId] = outline
      if (architecture) {
        state.outlineArchitectures ??= {}
        state.outlineArchitectures[projectId] = architecture
      }
      if (qualityReport) {
        state.outlineQualityReports ??= {}
        state.outlineQualityReports[projectId] = qualityReport
      }
      project.status = 'outline-review'
      project.updatedAt = now()
      return outline
}
export function commitGeneratedOutline(state: WorkspaceState, projectId: string, outline: OutlineNode[], architecture: OutlineArchitecture, qualityReport: OutlineQualityReport): OutlineNode[] {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在或已经被移除。')

      const replacingExisting = (state.outlines[projectId] ?? []).length > 0
      const projectSections = state.sections.filter((section) => section.projectId === projectId)
      const newNodes = new Map<string, OutlineNode>()
      const parentByNodeId = new Map<string, string | undefined>()
      const flatten = (nodes: OutlineNode[], parentId?: string) => {
        for (const node of nodes) {
          newNodes.set(node.id, node)
          parentByNodeId.set(node.id, parentId)
          flatten(node.children, node.id)
        }
      }
      flatten(outline)

      const oldParentByNodeId = new Map<string, string | undefined>()
      const flattenOld = (nodes: OutlineNode[], parentId?: string) => {
        for (const node of nodes) {
          oldParentByNodeId.set(node.id, parentId)
          flattenOld(node.children, node.id)
        }
      }
      flattenOld(state.outlines[projectId] ?? [])

      const versionSectionIds = new Set(
        state.sectionVersions.filter((version) => version.projectId === projectId).map((version) => version.sectionId),
      )
      const citationSectionIds = new Set(
        state.citations.filter((citation) => citation.projectId === projectId).map((citation) => citation.sectionId),
      )
      const protectedSections = projectSections.filter((section) => (
        Boolean(section.content.trim())
        || section.status !== 'pending'
        || versionSectionIds.has(section.id)
        || citationSectionIds.has(section.id)
      ))

      if (replacingExisting) {
        const unsafe = protectedSections.find((section) => {
          const next = newNodes.get(section.outlineNodeId)
          return !next
            || next.title.normalize('NFKC').trim() !== section.title.normalize('NFKC').trim()
            || next.level !== section.level
            || parentByNodeId.get(section.outlineNodeId) !== oldParentByNodeId.get(section.outlineNodeId)
        })
        if (unsafe) {
          throw new Error(`新大纲未能安全保留已有正文对应的章节“${unsafe.title}”，旧大纲已保持不变。`)
        }

        const protectedSectionIds = new Set(protectedSections.map((section) => section.id))
        const removedSectionIds = new Set(
          projectSections
            .filter((section) => !newNodes.has(section.outlineNodeId) && !protectedSectionIds.has(section.id))
            .map((section) => section.id),
        )
        state.sections = state.sections.filter((section) => !removedSectionIds.has(section.id))
        state.sectionVersions = state.sectionVersions.filter((version) => !removedSectionIds.has(version.sectionId))
        state.citations = state.citations.filter((citation) => !removedSectionIds.has(citation.sectionId))
      }

      state.outlines[projectId] = outline
      state.outlineArchitectures ??= {}
      state.outlineArchitectures[projectId] = architecture
      state.outlineQualityReports ??= {}
      state.outlineQualityReports[projectId] = qualityReport

      const timestamp = now()
      const flattened: OutlineNode[] = []
      const visit = (nodes: OutlineNode[]) => {
        for (const node of nodes) {
          flattened.push(node)
          visit(node.children)
        }
      }
      visit(outline)

      const existing = state.sections.filter((section) => section.projectId === projectId)
      const created = flattened.map((node) => {
        const current = existing.find((section) => section.outlineNodeId === node.id)
        if (current) {
          if (!protectedSections.some((section) => section.id === current.id)) {
            current.title = node.title
            current.level = node.level
            current.updatedAt = timestamp
          }
          return current
        }
        const section: ManuscriptSection = {
          ...createLiveEntityBase(),
          projectId,
          outlineNodeId: node.id,
          title: node.title,
          level: node.level,
          content: '',
          status: 'pending',
          wordCount: 0,
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        state.sections.push(section)
        return section
      })
      synchronizeDerivedSections(state, projectId, timestamp)

      if (!project.activeSectionId || !created.some((section) => section.id === project.activeSectionId)) {
        project.activeSectionId = created[0]?.id
      }
      project.status = 'outline-review'
      project.updatedAt = timestamp
      return outline
}
export function createSectionsFromOutline(state: WorkspaceState, projectId: string, outline: OutlineNode[]): ManuscriptSection[] {
      if (!state.projects.some((project) => project.id === projectId)) {
        throw new Error('项目不存在或已经被移除。')
      }
      const timestamp = now()
      const flattened: OutlineNode[] = []
      const visit = (nodes: OutlineNode[]) => {
        for (const node of nodes) {
          flattened.push(node)
          visit(node.children)
        }
      }
      visit(outline)

      const existing = state.sections.filter((section) => section.projectId === projectId)
      const created = flattened.map((node) => {
        const current = existing.find((section) => section.outlineNodeId === node.id)
        if (current) return current
        const section: ManuscriptSection = {
          ...createLiveEntityBase(),
          projectId,
          outlineNodeId: node.id,
          title: node.title,
          level: node.level,
          content: '',
          status: 'pending',
          wordCount: 0,
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        state.sections.push(section)
        return section
      })
      synchronizeDerivedSections(state, projectId, timestamp)
      return created
}
export function saveSection(state: WorkspaceState, sectionId: string, content: string): ManuscriptSection {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      if (section.status === 'generating') throw new Error('章节正在生成，请等待完成后再保存。')
      const timestamp = now()
      const previousContent = preserveProjectSectionVersions(state, section.projectId)
      const saved = saveSectionContentInState(state, sectionId, content, timestamp)
      recordSynchronizedSectionVersions(state, section.projectId, sectionId, previousContent, timestamp)
      preserveCurrentSectionVersion(state, saved, 'saved', timestamp)
      const project = state.projects.find((item) => item.id === section.projectId)
      if (project) {
        project.status = 'writing'
        project.activeSectionId = section.id
        project.updatedAt = timestamp
      }
      return saved
}
export function beginSectionGeneration(state: WorkspaceState, sectionId: string, metadata: Pick<ManuscriptSection, "generationProviderId" | "generationModel" | "thinkingRequested">): { section: ManuscriptSection; baseVersion: number } {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      if (section.status === 'generating') throw new Error('该章节已经在生成中。')
      const timestamp = now()
      preserveProjectSectionVersions(state, section.projectId)
      const baseVersion = section.version
      Object.assign(section, metadata, {
        status: 'generating' as const,
        generationError: undefined,
        updatedAt: timestamp,
      })
      return { section, baseVersion }
}
export function commitSectionGeneration(state: WorkspaceState, sectionId: string, expectedVersion: number, content: string, metadata: Pick<ManuscriptSection, "reasoningContent" | "generationProviderId" | "generationModel" | "thinkingRequested"> & { source: "generated" | "partial"; generationError?: string }): ManuscriptSection {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      if (section.version !== expectedVersion || section.status !== 'generating') {
        throw new Error('章节在生成期间已经发生变化，新结果未覆盖当前稿。')
      }
      const timestamp = now()
      const previousContent = preserveProjectSectionVersions(state, section.projectId)
      const saved = saveSectionContentInState(state, sectionId, content, timestamp)
      Object.assign(saved, metadata, {
        status: metadata.source === 'partial' ? 'error' as const : 'draft' as const,
        updatedAt: timestamp,
      })
      const generatedWithLiveProvider = Boolean(
        metadata.generationProviderId
        && state.providers.some((provider) => (
          provider.id === metadata.generationProviderId && provider.origin !== 'demo'
        )),
      )
      if (generatedWithLiveProvider) {
        for (const projectSection of state.sections.filter((item) => item.projectId === section.projectId)) {
          if (
            projectSection.id !== saved.id
            && previousContent.get(projectSection.id) === projectSection.content
          ) continue
          projectSection.origin = 'live'
          projectSection.verificationStatus = 'unverified'
        }
      }
      recordSynchronizedSectionVersions(state, section.projectId, sectionId, previousContent, timestamp)
      createSectionVersion(
        state,
        saved,
        metadata.source,
        timestamp,
        metadata.source === 'partial' ? 'error' : 'draft',
      )
      const project = state.projects.find((item) => item.id === section.projectId)
      if (project) {
        project.status = 'writing'
        project.activeSectionId = section.id
        project.updatedAt = timestamp
      }
      return saved
}
export function failSectionGeneration(state: WorkspaceState, sectionId: string, expectedVersion: number, patch: Pick<ManuscriptSection, "reasoningContent" | "generationProviderId" | "generationModel" | "thinkingRequested" | "generationError">): ManuscriptSection {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      if (section.version !== expectedVersion || section.status !== 'generating') return section
      Object.assign(section, patch, { status: 'error' as const, updatedAt: now() })
      return section
}
export function selectSectionVersion(state: WorkspaceState, sectionId: string, versionId: string): ManuscriptSection {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      if (section.status === 'generating') throw new Error('章节正在生成，暂时不能切换历史版本。')
      const version = state.sectionVersions.find(
        (item) => item.id === versionId && item.sectionId === sectionId && item.projectId === section.projectId,
      )
      if (!version) throw new Error('章节历史版本不存在。')
      const timestamp = now()
      const previousContent = preserveProjectSectionVersions(state, section.projectId)
      const selected = saveSectionContentInState(state, sectionId, version.content, timestamp)
      Object.assign(selected, {
        status: version.status,
        reasoningContent: version.reasoningContent,
        generationProviderId: version.generationProviderId,
        generationModel: version.generationModel,
        thinkingRequested: version.thinkingRequested,
        generationError: version.source === 'partial' ? '这是一次未完整生成的历史版本。' : undefined,
        activeGenerationVersionId: version.id,
        updatedAt: timestamp,
      })
      recordSynchronizedSectionVersions(state, section.projectId, sectionId, previousContent, timestamp)
      selected.activeGenerationVersionId = version.id
      const project = state.projects.find((item) => item.id === section.projectId)
      if (project) {
        project.activeSectionId = section.id
        project.updatedAt = timestamp
      }
      return selected
}
export function setActiveSection(state: WorkspaceState, sectionId: string): WorkspaceState {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      const project = state.projects.find((item) => item.id === section.projectId)
      if (!project) throw new Error('章节对应的项目不存在或已经被移除。')
      project.activeSectionId = section.id
      project.updatedAt = now()
      state.settings.activeProjectId = project.id
      state.settings.demoMode = project.origin === 'demo'
      synchronizeActiveModelSelection(state)
      return state
}
export function updateSection(state: WorkspaceState, sectionId: string, patch: Partial<ManuscriptSection>): ManuscriptSection {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      Object.assign(section, patch, { updatedAt: now() })
      return section
}
