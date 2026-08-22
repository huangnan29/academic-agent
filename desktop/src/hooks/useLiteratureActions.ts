import type { Dispatch, SetStateAction } from 'react'
import type { LiteratureRecord, Project, WorkspaceState } from '../../shared/contracts'
import { paperAgent } from '../fallback'
import type { RightTab } from '../lib/ui'

type ShowToast = (message: string, tone?: 'success' | 'error') => void

export function useLiteratureActions({
  setWorkspace,
  refreshWorkspace,
  activeProject,
  selectedLiterature,
  setSelectedLiterature,
  setRightTab,
  setRightOpen,
  showToast,
}: {
  setWorkspace: Dispatch<SetStateAction<WorkspaceState>>
  refreshWorkspace: () => Promise<void>
  activeProject?: Project
  selectedLiterature?: LiteratureRecord
  setSelectedLiterature: Dispatch<SetStateAction<LiteratureRecord | undefined>>
  setRightTab: (tab: RightTab) => void
  setRightOpen: (open: boolean) => void
  showToast: ShowToast
}) {
  const toggleLiterature = async (record: LiteratureRecord, projectId?: string) => {
    const targetProjectId = projectId ?? activeProject?.id
    if (!targetProjectId) return
    try {
      await paperAgent.literature.toggle(targetProjectId, record.id, !record.included)
      await refreshWorkspace()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新文献失败', 'error')
    }
  }

  const removeLiteratureFromProject = async (record: LiteratureRecord) => {
    try {
      await paperAgent.literature.setProject({
        literatureId: record.id,
        sourceProjectId: record.projectId ?? null,
      })
      await refreshWorkspace()
      showToast('已移出项目，文献仍保留在“全部文献”中')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '移出项目失败', 'error')
    }
  }

  const deleteLiterature = async (record: LiteratureRecord) => {
    try {
      await paperAgent.literature.delete({
        literatureId: record.id,
        sourceProjectId: record.projectId ?? null,
      })
      if (selectedLiterature?.id === record.id && selectedLiterature?.projectId === record.projectId) {
        setSelectedLiterature(undefined)
      }
      await refreshWorkspace()
      showToast('文献已从本机文献库删除')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除文献失败', 'error')
      throw error
    }
  }

  const addMessageLiterature = async (messageId: string, candidateId: string) => {
    try {
      const records = await paperAgent.literature.addFromMessage({
        messageId,
        candidateIds: [candidateId],
      })
      setWorkspace((current) => {
        const ids = new Set(records.map((record) => record.id))
        return {
          ...current,
          literature: [
            ...current.literature.filter((record) => !ids.has(record.id)),
            ...records,
          ],
        }
      })
      setRightTab('literature')
      setRightOpen(true)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '添加文献失败', 'error')
      throw error
    }
  }

  return {
    toggleLiterature,
    removeLiteratureFromProject,
    deleteLiterature,
    addMessageLiterature,
  }
}
