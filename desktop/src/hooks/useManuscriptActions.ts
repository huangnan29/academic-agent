import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  ManuscriptSection,
  Project,
  SectionGenerationOptions,
  SectionGenerationPreview,
  WorkspaceState,
} from '../../shared/contracts'
import { paperAgent } from '../fallback'
import type { RightTab } from '../lib/ui'
import type { SectionGenerationCandidate } from './useWorkspaceRuntime'

type CenterMode = 'chat' | 'manuscript'
type ShowToast = (message: string, tone?: 'success' | 'error') => void

export function useManuscriptActions({
  workspace,
  setWorkspace,
  refreshWorkspace,
  activeProject,
  selectedSection,
  selectedSectionId,
  setSelectedSectionId,
  activeProviderId,
  activeModel,
  sectionGenerationCandidate,
  setSectionGenerationCandidate,
  setCenterMode,
  setRightTab,
  setRightOpen,
  showToast,
}: {
  workspace: WorkspaceState
  setWorkspace: Dispatch<SetStateAction<WorkspaceState>>
  refreshWorkspace: () => Promise<void>
  activeProject?: Project
  selectedSection?: ManuscriptSection
  selectedSectionId?: string
  setSelectedSectionId: Dispatch<SetStateAction<string | undefined>>
  activeProviderId?: string
  activeModel?: string
  sectionGenerationCandidate?: SectionGenerationCandidate
  setSectionGenerationCandidate: Dispatch<SetStateAction<SectionGenerationCandidate | undefined>>
  setCenterMode: (mode: CenterMode) => void
  setRightTab: (tab: RightTab) => void
  setRightOpen: (open: boolean) => void
  showToast: ShowToast
}) {
  const [editingSection, setEditingSection] = useState(false)
  const [sectionDraft, setSectionDraft] = useState('')
  const [savingSection, setSavingSection] = useState(false)
  const [selectingSectionVersionId, setSelectingSectionVersionId] = useState<string>()
  const [generatingOutline, setGeneratingOutline] = useState(false)
  const [regenerateOutlineOpen, setRegenerateOutlineOpen] = useState(false)
  const [sectionGenerationPanelOpen, setSectionGenerationPanelOpen] = useState(false)
  const [sectionGenerationPreview, setSectionGenerationPreview] = useState<SectionGenerationPreview>()
  const [sectionGenerationPreviewLoading, setSectionGenerationPreviewLoading] = useState(false)
  const [sectionGenerationPreviewError, setSectionGenerationPreviewError] = useState<string>()
  const [sectionGenerationSubmitting, setSectionGenerationSubmitting] = useState(false)
  const previewRequestRef = useRef(0)

  useEffect(() => {
    if (selectedSection && selectedSection.id !== selectedSectionId) setSelectedSectionId(selectedSection.id)
  }, [selectedSection?.id])

  useEffect(() => {
    setSectionDraft(selectedSection?.content ?? '')
    setEditingSection(false)
    setSelectingSectionVersionId(undefined)
    setSectionGenerationPanelOpen(false)
    setSectionGenerationPreview(undefined)
    setSectionGenerationPreviewError(undefined)
  }, [selectedSection?.activeGenerationVersionId, selectedSection?.id])

  const selectSection = async (section: ManuscriptSection) => {
    const previousSectionId = selectedSection?.id
    setSelectingSectionVersionId(undefined)
    setSelectedSectionId(section.id)
    setCenterMode('manuscript')
    try {
      const next = await paperAgent.section.setActive(section.id)
      setWorkspace(next)
    } catch (error) {
      setSelectedSectionId(previousSectionId)
      showToast(error instanceof Error ? error.message : '切换章节失败', 'error')
    }
  }

  const saveSection = async () => {
    if (!selectedSection) return
    setSavingSection(true)
    try {
      await paperAgent.section.save(selectedSection.id, sectionDraft)
      await refreshWorkspace()
      setEditingSection(false)
      showToast('章节已保存')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存章节失败', 'error')
    } finally {
      setSavingSection(false)
    }
  }

  const selectSectionVersion = async (versionId: string) => {
    if (!selectedSection || selectingSectionVersionId) return
    const sectionId = selectedSection.id
    setSelectingSectionVersionId(versionId)
    try {
      await paperAgent.section.selectVersion(sectionId, versionId)
      await refreshWorkspace()
      setEditingSection(false)
      showToast('已切换章节版本')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换章节版本失败', 'error')
    } finally {
      setSelectingSectionVersionId(undefined)
    }
  }

  const generateSection = async (options?: SectionGenerationOptions) => {
    if (!activeProject || !selectedSection) return
    if (sectionGenerationCandidate) {
      showToast('已有章节正在生成，请等待完成后再开始下一章', 'error')
      return
    }
    if (!activeProviderId || !activeModel) {
      showToast('请先配置并选择可用模型', 'error')
      return
    }
    const sectionId = selectedSection.id
    setSectionGenerationCandidate({
      sectionId,
      content: '',
      reasoningContent: '',
      providerId: activeProviderId,
      model: activeModel,
      thinkingRequested: false,
    })
    setWorkspace((current) => {
      const next = structuredClone(current)
      const section = next.sections.find((item) => item.id === sectionId)
      if (section) {
        section.status = 'generating'
        section.generationError = undefined
        section.generationProviderId = activeProviderId
        section.generationModel = activeModel
      }
      return next
    })
    try {
      await paperAgent.section.generate({
        projectId: activeProject.id,
        sectionId,
        providerId: activeProviderId,
        model: activeModel,
        options,
      })
      await refreshWorkspace()
      setSectionGenerationCandidate((current) => current?.sectionId === sectionId ? undefined : current)
      showToast('章节草稿已生成')
    } catch (error) {
      await refreshWorkspace().catch(() => undefined)
      setSectionGenerationCandidate((current) => current?.sectionId === sectionId ? undefined : current)
      showToast('章节生成中断，已保留模型返回的正文片段', 'error')
    }
  }

  const loadSectionGenerationPreview = async (options?: SectionGenerationOptions) => {
    if (!activeProject || !selectedSection) return undefined
    const requestId = previewRequestRef.current + 1
    previewRequestRef.current = requestId
    setSectionGenerationPreviewLoading(true)
    setSectionGenerationPreviewError(undefined)
    try {
      const preview = await paperAgent.section.previewGeneration({
        projectId: activeProject.id,
        sectionId: selectedSection.id,
        options,
      })
      if (previewRequestRef.current !== requestId) return preview
      setSectionGenerationPreview(preview)
      return preview
    } catch (error) {
      if (previewRequestRef.current === requestId) {
        setSectionGenerationPreviewError(error instanceof Error ? error.message : '无法读取章节生成配置')
      }
      return undefined
    } finally {
      if (previewRequestRef.current === requestId) setSectionGenerationPreviewLoading(false)
    }
  }

  const openSectionGenerationPanel = () => {
    if (!selectedSection?.content.trim()) {
      void generateSection()
      return
    }
    if (selectedSection.status === 'generating' || sectionGenerationCandidate || sectionGenerationSubmitting) {
      showToast('已有章节正在生成，请等待完成后再开始下一章', 'error')
      return
    }
    setSectionGenerationPanelOpen(true)
    setSectionGenerationPreview(undefined)
    void loadSectionGenerationPreview()
  }

  const closeSectionGenerationPanel = () => {
    if (sectionGenerationSubmitting) return
    setSectionGenerationPanelOpen(false)
  }

  const submitSectionGeneration = async (options: SectionGenerationOptions) => {
    if (sectionGenerationSubmitting) return
    setSectionGenerationSubmitting(true)
    setSectionGenerationPanelOpen(false)
    try {
      await generateSection(options)
    } finally {
      setSectionGenerationSubmitting(false)
    }
  }

  const generateOutline = async () => {
    if (!activeProject) return
    if (generatingOutline) return
    if (!activeProviderId || !activeModel) {
      showToast('请先配置并选择可用模型', 'error')
      return
    }
    setGeneratingOutline(true)
    try {
      const generated = await paperAgent.outline.generate({
        projectId: activeProject.id,
        providerId: activeProviderId,
        model: activeModel,
      })
      let next = await paperAgent.workspace.get()
      const firstSection = next.sections.find(
        (section) => section.projectId === activeProject.id,
      )
      if (firstSection) {
        next = await paperAgent.section.setActive(firstSection.id)
        setSelectedSectionId(firstSection.id)
      }
      setWorkspace(next)
      setCenterMode('manuscript')
      setRightTab('drafts')
      setRightOpen(true)
      showToast(`三级大纲已生成，共 ${generated.length} 个一级章节`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '大纲生成失败', 'error')
    } finally {
      setGeneratingOutline(false)
    }
  }

  return {
    editingSection,
    setEditingSection,
    sectionDraft,
    setSectionDraft,
    savingSection,
    selectingSectionVersionId,
    generatingOutline,
    regenerateOutlineOpen,
    setRegenerateOutlineOpen,
    selectSection,
    saveSection,
    selectSectionVersion,
    generateSection,
    openSectionGenerationPanel,
    closeSectionGenerationPanel,
    loadSectionGenerationPreview,
    submitSectionGeneration,
    sectionGenerationPanelOpen,
    sectionGenerationPreview,
    sectionGenerationPreviewLoading,
    sectionGenerationPreviewError,
    sectionGenerationSubmitting,
    generateOutline,
  }
}
