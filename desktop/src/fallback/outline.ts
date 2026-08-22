import { clone, cloneOutlineWithFreshIds, createSectionsFromOutline, mutate } from './state'
import { demoOutline } from './fixtures'

export const outlineApi: Window['paperAgent']['outline'] = {
  async generate(input) {
    const generated = cloneOutlineWithFreshIds(demoOutline)
    mutate((draft) => {
      const replacingExisting = (draft.outlines[input.projectId] ?? []).length > 0
      const projectSections = draft.sections.filter((item) => item.projectId === input.projectId)
      const hasStartedWriting = projectSections.some((section) => (
        Boolean(section.content.trim()) || section.status !== 'pending'
      ))
        || draft.sectionVersions.some((version) => version.projectId === input.projectId)
        || draft.citations.some((citation) => citation.projectId === input.projectId)
      if (replacingExisting && hasStartedWriting) {
        throw new Error('当前大纲已有章节正文或历史版本。为避免覆盖稿件，暂不能直接重新生成大纲。')
      }

      draft.outlines[input.projectId] = generated
      delete draft.outlineArchitectures?.[input.projectId]
      delete draft.outlineQualityReports?.[input.projectId]
      const oldSectionIds = new Set(projectSections.map((section) => section.id))
      draft.sections = draft.sections.filter((item) => item.projectId !== input.projectId)
      draft.sectionVersions = draft.sectionVersions.filter((item) => item.projectId !== input.projectId)
      draft.citations = draft.citations.filter((citation) => (
        citation.projectId !== input.projectId && !oldSectionIds.has(citation.sectionId)
      ))
      draft.sections.push(...createSectionsFromOutline(generated, input.projectId))
      const project = draft.projects.find((item) => item.id === input.projectId)
      if (project) {
        project.status = 'outline-review'
        project.activeSectionId = draft.sections.find(
          (item) => item.projectId === input.projectId,
        )?.id
      }
    })
    return clone(generated)
  },
  async save(projectId, outline) {
    mutate((draft) => {
      draft.outlines[projectId] = outline
      delete draft.outlineArchitectures?.[projectId]
      delete draft.outlineQualityReports?.[projectId]
    })
    return clone(outline)
  },
}
